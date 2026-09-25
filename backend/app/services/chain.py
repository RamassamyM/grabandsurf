"""Board life log on Avalanche, written in the background (port of korko_chain.py).

The API calls  chain.publish(ref, "korko-01", "DEPART", "A", t)  and carries on.
Real mode: a queue persisted on disk, one per contract, batches of 20, spaced retries.
Fake mode: deterministic fake transaction hashes, for tests and offline demos.

What goes on-chain: board, event type, station, flow time. Never a customer.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

from ..settings import ROOT, env_get

log = logging.getLogger(__name__)

EVENT_TYPES = {"MISE_EN_SERVICE": 0, "DEPART": 1, "RETOUR": 2, "ETRANGERE": 3,
               "REPARATION": 4, "RECONDITIONNEMENT": 5, "PERDUE": 6}
EVENT_NAMES = {v: k for k, v in EVENT_TYPES.items()}

FUJI = {"RPC_URL": "https://api.avax-test.network/ext/bc/C/rpc",
        "CHAIN_ID": "43113",
        "EXPLORER_URL": "https://testnet.snowtrace.io"}

CHAIN_DIR = ROOT / "backend" / "chain"
DEPLOYMENT_FILE = CHAIN_DIR / "deployment.json"
CONTRACT_FILE = CHAIN_DIR / "contract" / "KorkoPlanche.json"
BATCH_MAX = 20

SentCallback = Callable[[list[int], str], None]
RejectedCallback = Callable[[list[int], str], None]


# ------------------------------------------------------------------ helpers

def read_deployment() -> dict[str, Any]:
    """Team contract address (public, versioned in git)."""
    try:
        return json.loads(DEPLOYMENT_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def token_id(board_id: str) -> int:
    """korko-07 -> 7: the NFT id is the beacon number."""
    return int(str(board_id).rsplit("-", 1)[-1])


def load_contract_json() -> dict[str, Any]:
    return json.loads(CONTRACT_FILE.read_text(encoding="utf-8"))


def chain_config(env: dict[str, str], mode: str) -> dict[str, str]:
    """Fuji defaults, then the team deployment, then .env (personal contract wins unless mode=team)."""
    conf = {k: env_get(env, k, v) for k, v in FUJI.items()}
    conf["OPERATOR_KEY"] = env_get(env, "OPERATOR_KEY")
    team = read_deployment().get("contract", "")
    personal = env_get(env, "CONTRACT_ADDRESS")
    if mode == "team" or not personal:
        conf["CONTRACT_ADDRESS"] = team
    else:
        conf["CONTRACT_ADDRESS"] = personal
    conf["MODE"] = "team" if team and conf["CONTRACT_ADDRESS"].lower() == team.lower() else "personal"
    return conf


def connect(conf: dict[str, str], w3: Any = None) -> tuple[Any, Any, Any]:
    """Return (w3, account, contract) or raise an explicit error."""
    try:
        from web3 import Web3
    except ImportError:
        raise RuntimeError("web3 non installé : pip install -r backend/requirements.txt")
    if w3 is None:
        w3 = Web3(Web3.HTTPProvider(conf["RPC_URL"], request_kwargs={"timeout": 15}))
    key = conf.get("OPERATOR_KEY")
    if not key:
        raise RuntimeError("pas de clé opérateur dans .env : python -m backend.chain.scripts.create_wallet")
    account = w3.eth.account.from_key(key)
    contract = None
    if conf.get("CONTRACT_ADDRESS"):
        contract = w3.eth.contract(address=Web3.to_checksum_address(conf["CONTRACT_ADDRESS"]),
                                   abi=load_contract_json()["abi"])
    return w3, account, contract


def send_tx(w3: Any, account: Any, fn: Any, chain_id: int, wait_s: int = 90) -> str:
    """Sign locally, send, wait for the receipt. Return the hash (0x...)."""
    tx = fn.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": chain_id,
    })
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
    h = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(h, timeout=wait_s)
    if receipt["status"] != 1:
        raise RuntimeError("transaction annulée par le contrat : %s" % w3.to_hex(h))
    return w3.to_hex(h)


class _Rejected(Exception):
    pass


# ------------------------------------------------------------------ service

class ChainService:
    """Publishes fleet events without ever blocking a rental."""

    def __init__(self, mode: str, env: dict[str, str], data_dir: Path, w3: Any = None) -> None:
        self.requested_mode = mode
        self.env = env
        self.data_dir = Path(data_dir)
        self.mode = "off"            # real, fake, off
        self.contract_mode = ""      # team, personal (real mode only)
        self.reason = ""
        self.contract_address: Optional[str] = None
        self.operator: Optional[str] = None
        self.explorer = env_get(env, "EXPLORER_URL", FUJI["EXPLORER_URL"])
        self.queue: list[dict[str, Any]] = []
        self.recent: list[dict[str, Any]] = []
        self.error: Optional[str] = None
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.on_sent: Optional[SentCallback] = None
        self.on_rejected: Optional[RejectedCallback] = None
        self.queue_file: Optional[Path] = None
        self._thread: Optional[threading.Thread] = None
        self._w3 = w3
        self._start()

    # -- setup -------------------------------------------------------------
    def _start(self) -> None:
        if self.requested_mode == "off":
            self.reason = "désactivée (CHAIN_MODE=off)"
            return
        if self.requested_mode == "fake":
            self.mode, self.reason = "fake", "simulation (CHAIN_MODE=fake)"
            return
        conf = chain_config(self.env, self.requested_mode)
        if self.requested_mode == "auto" and not conf["OPERATOR_KEY"]:
            self.mode, self.reason = "fake", "simulation : pas de clé opérateur dans .env"
            return
        try:
            self.w3, self.account, self.contract = connect(conf, self._w3)
            if self.contract is None:
                raise RuntimeError("aucun contrat : backend/chain/deployment.json ou CONTRACT_ADDRESS")
            self.operator = self.account.address
            self.chain_id = int(conf.get("CHAIN_ID") or self.w3.eth.chain_id)
            if not self.contract.functions.operateurs(self.operator).call():
                raise RuntimeError(
                    "l'adresse %s n'est pas opérateur du contrat : le propriétaire doit lancer "
                    "python -m backend.chain.scripts.grant_operator %s" % (self.operator, self.operator))
        except Exception as e:  # network, missing web3, not an operator
            self.mode, self.reason = "fake", "simulation : %s" % e
            log.warning("blockchain in simulation mode: %s", e)
            return
        self.mode = "real"
        self.contract_address = conf["CONTRACT_ADDRESS"]
        self.contract_mode = conf["MODE"]
        self.queue_file = self.data_dir / ("chain_queue_%s.ndjson" % self.contract_address[2:10].lower())
        self._load_queue()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        log.info("blockchain active: %s contract %s, %d pending", self.contract_mode,
                 self.contract_address, len(self.queue))

    # -- called by the API -------------------------------------------------
    @property
    def label(self) -> str:
        if self.mode == "real":
            return "ÉQUIPE · démo" if self.contract_mode == "team" else "PERSO · dev"
        return "Simulation" if self.mode == "fake" else "Désactivée"

    def publish(self, ref: int, board_id: str, event_type: str, station: str, t: float) -> None:
        """Queue one event; ref is the chain_txs row id updated once sent."""
        if event_type not in EVENT_TYPES or event_type == "MISE_EN_SERVICE":
            return
        ev = {"ref": ref, "board": token_id(board_id), "board_id": board_id, "type": event_type,
              "station": (station or "")[:1], "t": int(t)}
        if self.mode == "fake":
            digest = hashlib.sha256(json.dumps(ev, sort_keys=True).encode()).hexdigest()
            self._sent([ev], "0x" + digest)
            return
        if self.mode != "real":
            return
        with self.lock:
            self.queue.append(ev)
            self._save_queue()
        self.wake.set()

    def link(self, kind: str, value: str) -> Optional[str]:
        """Explorer link, only for real transactions."""
        if self.mode != "real" or not value:
            return None
        return "%s/%s/%s" % (self.explorer, kind, value)

    def status(self) -> dict[str, Any]:
        with self.lock:
            return {"mode": self.mode, "label": self.label, "reason": self.reason,
                    "contract": self.contract_address,
                    "contract_url": self.link("address", self.contract_address or ""),
                    "operator": self.operator, "pending": len(self.queue),
                    "error": self.error, "recent": self.recent[:10]}

    def read_board(self, board_id: str) -> Optional[dict[str, Any]]:
        """On-chain state of a board (free read), real mode only."""
        if self.mode != "real":
            return None
        n = token_id(board_id)
        e = self.contract.functions.etats(n).call()
        return {"token_id": n,
                "home": e[0].decode(errors="replace").strip("\x00"),
                "station": e[1].decode(errors="replace").strip("\x00"),
                "last_type": EVENT_NAMES.get(e[2], e[2]), "last_t": e[3],
                "departures": e[4], "events": e[5],
                "status": self.contract.functions.statut(n).call(),
                "nft_url": self.link("nft", "%s/%d" % (self.contract_address, n))}

    def flush(self, timeout_s: float = 0) -> None:
        """Wake the background writer (used by tests and the reset button)."""
        self.wake.set()

    # -- background --------------------------------------------------------
    def _loop(self) -> None:
        pause = 2
        self.wake.set()
        while True:
            self.wake.wait(timeout=10)
            self.wake.clear()
            while True:
                with self.lock:
                    batch = list(self.queue[:BATCH_MAX])
                if not batch:
                    break
                try:
                    h = self._send(batch)
                except _Rejected as e:
                    log.warning("blockchain: batch rejected (%s)", e)
                    self._drop(batch, None, str(e))
                    continue
                except Exception as e:  # network: retry later
                    self.error = "%s : %s" % (time.strftime("%H:%M:%S"), e)
                    time.sleep(pause)
                    pause = min(pause * 2, 60)
                    continue
                pause = 2
                self.error = None
                self._drop(batch, h, None)

    def _send(self, batch: list[dict[str, Any]]) -> str:
        f = self.contract.functions
        if len(batch) == 1:
            e = batch[0]
            fn = f.enregistrer(e["board"], EVENT_TYPES[e["type"]], e["station"].encode(), e["t"])
        else:
            fn = f.enregistrerLot([e["board"] for e in batch], [EVENT_TYPES[e["type"]] for e in batch],
                                  [e["station"].encode() for e in batch], [e["t"] for e in batch])
        try:
            fn.estimate_gas({"from": self.operator})
        except Exception as e:
            if "ContractLogicError" in [k.__name__ for k in type(e).__mro__] or "revert" in str(e).lower():
                raise _Rejected(e)
            raise
        return send_tx(self.w3, self.account, fn, self.chain_id)

    def _drop(self, batch: list[dict[str, Any]], h: Optional[str], reason: Optional[str]) -> None:
        with self.lock:
            del self.queue[:len(batch)]
            self._save_queue()
        if h:
            self._sent(batch, h)
        elif self.on_rejected:
            self.on_rejected([e["ref"] for e in batch], reason or "")

    def _sent(self, batch: list[dict[str, Any]], h: str) -> None:
        with self.lock:
            for e in batch:
                self.recent.insert(0, dict(e, tx=h, tx_url=self.link("tx", h)))
            del self.recent[50:]
        if self.on_sent:
            try:
                self.on_sent([e["ref"] for e in batch], h)
            except Exception:
                log.exception("chain callback failed")

    def _save_queue(self) -> None:
        if not self.queue_file:
            return
        self.queue_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.queue_file.with_suffix(".tmp")
        tmp.write_text("".join(json.dumps(e) + "\n" for e in self.queue), encoding="utf-8")
        tmp.replace(self.queue_file)

    def _load_queue(self) -> None:
        if self.queue_file and self.queue_file.exists():
            self.queue = [json.loads(line) for line in
                          self.queue_file.read_text(encoding="utf-8").splitlines() if line.strip()]
