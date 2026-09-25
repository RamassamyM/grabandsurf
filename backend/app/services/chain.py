"""Board life log on Avalanche, written in the background (port of korko_chain.py), V1 and V2 contracts.

The API calls  chain.publish(ref, "korko-01", "DEPART", "A", t)  and carries on.
Real mode: a queue persisted on disk, one per contract, batches of 20, spaced retries.
Fake mode: deterministic fake transaction hashes, for tests and offline demos.
History: the contract events are read back with get_logs (chunks of 2,000 blocks, cached on disk)
so the passport shows what is really on-chain, linked to the database by transaction hash.

What goes on-chain: board, event type, station, flow time, proofs (photo hashes), and the public
names of consenting sponsors and artists. Never a customer, a phone or a card.
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
               "REPARATION": 4, "RECONDITIONNEMENT": 5, "PERDUE": 6,
               "INSPECTION": 7, "CORRECTION": 8, "VENDUE": 9}           # 7 to 9: contract V2 only
EVENT_NAMES = {v: k for k, v in EVENT_TYPES.items()}
V1_TYPES = {"DEPART", "RETOUR", "ETRANGERE", "REPARATION", "RECONDITIONNEMENT", "PERDUE"}
RECORD_TYPES = V1_TYPES | {"INSPECTION"}                             # sent with record / recordBatch
ACTIONS = {"CORRECTION", "VENDUE", "SPONSORING", "FIN_SPONSORING"}    # one transaction each (V2)
PUBLISHABLE = RECORD_TYPES | ACTIONS

FUJI = {"RPC_URL": "https://api.avax-test.network/ext/bc/C/rpc",
        "CHAIN_ID": "43113",
        "EXPLORER_URL": "https://testnet.snowtrace.io"}

CHAIN_DIR = ROOT / "backend" / "chain"
DEPLOYMENT_FILE = CHAIN_DIR / "deployment.json"
CONTRACT_FILES = {1: CHAIN_DIR / "contract" / "KorkoPlanche.json",
                  2: CHAIN_DIR / "contract" / "KorkoBoardV2.json"}
CONTRACT_FILE = CONTRACT_FILES[1]
BATCH_MAX = 20
LOG_CHUNK = 2000           # blocks per get_logs call (limit of public RPCs)
ZERO_ADDRESS = "0x" + "0" * 40

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


def load_contract_json(version: int = 1) -> dict[str, Any]:
    return json.loads(CONTRACT_FILES[version].read_text(encoding="utf-8"))


def to_bytes32(value: Optional[str]) -> bytes:
    """'ab12...' (hex, 64 chars) -> 32 bytes; empty -> zeros."""
    raw = (value or "").removeprefix("0x")
    return bytes.fromhex(raw.rjust(64, "0")[-64:]) if raw else b"\x00" * 32


def chain_config(env: dict[str, str], mode: str) -> dict[str, Any]:
    """Fuji defaults, then the team deployment, then .env (personal contract wins unless mode=team)."""
    conf: dict[str, Any] = {k: env_get(env, k, v) for k, v in FUJI.items()}
    conf["OPERATOR_KEY"] = env_get(env, "OPERATOR_KEY")
    deployment = read_deployment()
    team = deployment.get("contract", "")
    personal = env_get(env, "CONTRACT_ADDRESS")
    if mode == "team" or not personal:
        conf["CONTRACT_ADDRESS"] = team
        conf["VERSION"] = int(deployment.get("version", 1))
        conf["BLOCK"] = int(deployment.get("block") or 0)
        conf["LEGACY"] = list(deployment.get("legacy", []))
    else:
        conf["CONTRACT_ADDRESS"] = personal
        conf["VERSION"] = int(env.get("CONTRACT_VERSION", "1") or 1)
        conf["BLOCK"] = int(env_get(env, "DEPLOYMENT_BLOCK", "0") or 0)
        conf["LEGACY"] = []
    conf["MODE"] = "team" if team and conf["CONTRACT_ADDRESS"].lower() == team.lower() else "personal"
    return conf


def connect(conf: dict[str, Any], w3: Any = None) -> tuple[Any, Any, Any]:
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
                                   abi=load_contract_json(int(conf.get("VERSION", 1)))["abi"])
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


def sign_hash(private_key: str, sha256_hex: str) -> dict[str, str]:
    """EIP-191 signature of a photo hash: anyone can check Grab&Surf issued it."""
    from eth_account import Account
    from eth_account.messages import encode_defunct
    message = encode_defunct(text="Grab&Surf photo sha256:%s" % sha256_hex)
    signed = Account.sign_message(message, private_key=private_key)
    signature = signed.signature.hex()
    return {"signature": signature if signature.startswith("0x") else "0x" + signature,
            "signer": Account.from_key(private_key).address}


def recover_signer(sha256_hex: str, signature: str) -> str:
    from eth_account import Account
    from eth_account.messages import encode_defunct
    return Account.recover_message(encode_defunct(text="Grab&Surf photo sha256:%s" % sha256_hex),
                                   signature=signature)


class _Rejected(Exception):
    pass


# ------------------------------------------------------------------ history (get_logs)

def _event_signature(entry: dict[str, Any]) -> str:
    return "%s(%s)" % (entry["name"], ",".join(i["type"] for i in entry["inputs"]))


class ChainHistory:
    """Reads the contract events back from the chain, chunk by chunk, with an on-disk cache."""

    def __init__(self, w3: Any, contracts: list[dict[str, Any]], data_dir: Path) -> None:
        from web3 import Web3
        self.w3 = w3
        self.lock = threading.Lock()
        self.readers = []
        for c in contracts:
            abi = load_contract_json(c["version"])["abi"]
            contract = w3.eth.contract(address=Web3.to_checksum_address(c["address"]), abi=abi)
            topics = {Web3.keccak(text=_event_signature(e)).hex().removeprefix("0x"): e["name"]
                      for e in abi if e.get("type") == "event"}
            cache = Path(data_dir) / ("chain_logs_%s.json" % c["address"][2:10].lower())
            state = {"scanned_to": int(c.get("block") or 0) - 1, "events": [], "sponsorships": [],
                     "corrections": {}}
            first_block = state["scanned_to"]
            try:
                state.update(json.loads(cache.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                pass
            # nothing to read before the deployment block, even if an older cache started lower
            state["scanned_to"] = max(state["scanned_to"], first_block)
            self.readers.append({"address": c["address"], "version": c["version"], "contract": contract,
                                 "topics": topics, "cache": cache, "state": state})
        self.latest = 0
        self.error: Optional[str] = None

    def scan(self, max_chunks: int = 10**9, pause_s: float = 0.0) -> bool:
        """Read new blocks; return True when every contract is up to date."""
        self.latest = self.w3.eth.block_number
        done = True
        for r in self.readers:
            chunks = 0
            while r["state"]["scanned_to"] < self.latest and chunks < max_chunks:
                start = r["state"]["scanned_to"] + 1
                end = min(start + LOG_CHUNK - 1, self.latest)
                logs = self.w3.eth.get_logs({"address": r["contract"].address, "fromBlock": start, "toBlock": end})
                with self.lock:
                    for entry in logs:
                        self._absorb(r, entry)
                    r["state"]["scanned_to"] = end
                chunks += 1
                if pause_s:
                    time.sleep(pause_s)
            self._save(r)
            done = done and r["state"]["scanned_to"] >= self.latest
        return done

    def _absorb(self, r: dict[str, Any], entry: Any) -> None:
        topic = entry["topics"][0].hex().removeprefix("0x") if entry["topics"] else ""
        name = r["topics"].get(topic)
        if not name:
            return
        ev = getattr(r["contract"].events, name)().process_log(entry)
        a = ev["args"]
        base = {"tx": self.w3.to_hex(ev["transactionHash"]), "log_index": ev["logIndex"],
                "block": ev["blockNumber"], "contract": r["address"], "version": r["version"]}
        state = r["state"]
        if name in ("BoardEvent", "Evenement"):
            board = a["board"] if name == "BoardEvent" else a["planche"]
            etype = a["eventType"] if name == "BoardEvent" else a["typeEvenement"]
            proof = a["proof"].hex() if name == "BoardEvent" else ""
            state["events"].append(dict(base, board=int(board), type=EVENT_NAMES.get(etype, str(etype)),
                                        station=a["station"].decode(errors="replace").strip("\x00"),
                                        t=int(a["t"]), index=int(a["index"]), proof=proof.removeprefix("0x")))
        elif name == "Correction":
            state["corrections"][base["tx"]] = {"corrected_index": int(a["correctedIndex"]), "reason": a["reason"]}
        elif name == "SponsorshipStarted":
            state["sponsorships"].append(dict(
                base, board=int(a["board"]), number=int(a["number"]), sponsor_name=a["sponsorName"],
                artist_name=a["artistName"], design_hash=a["designHash"].hex().removeprefix("0x"), design_uri=a["designURI"],
                start_date=int(a["startDate"]), end_date=int(a["endDate"]), ended=False))
        elif name == "SponsorshipEnded":
            for s in state["sponsorships"]:
                if s["board"] == int(a["board"]) and s["number"] == int(a["number"]):
                    s["ended"] = True

    def _save(self, r: dict[str, Any]) -> None:
        try:
            r["cache"].parent.mkdir(parents=True, exist_ok=True)
            tmp = r["cache"].with_suffix(".tmp")
            tmp.write_text(json.dumps(r["state"]), encoding="utf-8")
            tmp.replace(r["cache"])
        except OSError as e:
            log.warning("chain history cache not saved: %s", e)

    def board(self, board_id: str) -> dict[str, Any]:
        """Events and sponsorships of one board, oldest first, across V1 and V2."""
        n = token_id(board_id)
        with self.lock:
            events, sponsorships, synced = [], [], True
            for r in self.readers:
                st = r["state"]
                for e in st["events"]:
                    if e["board"] == n:
                        e = dict(e)
                        if e["type"] == "CORRECTION":
                            e.update(st["corrections"].get(e["tx"], {}))
                        events.append(e)
                sponsorships += [dict(s) for s in st["sponsorships"] if s["board"] == n]
                synced = synced and st["scanned_to"] >= self.latest > 0
            scanned = min((r["state"]["scanned_to"] for r in self.readers), default=0)
        events.sort(key=lambda e: (e["block"], e["log_index"]))
        return {"events": events, "sponsorships": sponsorships, "synced": synced,
                "scanned_to": scanned, "latest": self.latest, "error": self.error}


# ------------------------------------------------------------------ service

class ChainService:
    """Publishes fleet events without ever blocking a rental; reads the history back."""

    def __init__(self, mode: str, env: dict[str, str], data_dir: Path, w3: Any = None,
                 read_history: bool = True) -> None:
        self.requested_mode = mode
        self.env = env
        self.data_dir = Path(data_dir)
        self.mode = "off"            # real, fake, off
        self.contract_mode = ""      # team, personal (real mode only)
        self.version = 2             # the simulation behaves like V2
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
        self.on_skipped: Optional[RejectedCallback] = None
        self.queue_file: Optional[Path] = None
        self.history: Optional[ChainHistory] = None
        self._key: Optional[str] = None
        self._thread: Optional[threading.Thread] = None
        self._w3 = w3
        self._read_history = read_history
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
            allowed = (self.contract.functions.operators(self.operator).call() if conf["VERSION"] == 2
                       else self.contract.functions.operateurs(self.operator).call())
            if not allowed:
                raise RuntimeError(
                    "l'adresse %s n'est pas opérateur du contrat : le propriétaire doit lancer "
                    "python -m backend.chain.scripts.grant_operator %s" % (self.operator, self.operator))
        except Exception as e:  # network, missing web3, not an operator
            self.mode, self.reason = "fake", "simulation : %s" % e
            log.warning("blockchain in simulation mode: %s", e)
            return
        self.mode = "real"
        self.version = int(conf["VERSION"])
        self._key = conf["OPERATOR_KEY"]
        self.contract_address = conf["CONTRACT_ADDRESS"]
        self.contract_mode = conf["MODE"]
        self.queue_file = self.data_dir / ("chain_queue_%s.ndjson" % self.contract_address[2:10].lower())
        self._load_queue()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        if self._read_history:
            contracts = [{"address": l["contract"], "version": int(l.get("version", 1)), "block": l.get("block", 0)}
                         for l in conf["LEGACY"]]
            contracts.append({"address": self.contract_address, "version": self.version, "block": conf["BLOCK"]})
            try:
                self.history = ChainHistory(self.w3, contracts, self.data_dir)
                threading.Thread(target=self._history_loop, daemon=True).start()
            except Exception as e:
                log.warning("chain history unavailable: %s", e)
        log.info("blockchain active: %s contract V%d %s, %d pending", self.contract_mode, self.version,
                 self.contract_address, len(self.queue))

    # -- called by the API -------------------------------------------------
    @property
    def label(self) -> str:
        if self.mode == "real":
            return ("ÉQUIPE · démo" if self.contract_mode == "team" else "PERSO · dev") + " · V%d" % self.version
        return "Simulation" if self.mode == "fake" else "Désactivée"

    def supports(self, event_type: str) -> bool:
        """V1 only knows the original life-log types."""
        return event_type in PUBLISHABLE and (self.version >= 2 or event_type in V1_TYPES)

    def publish(self, ref: int, board_id: str, event_type: str, station: str, t: float,
                proof: str = "", extra: Optional[dict[str, Any]] = None) -> None:
        """Queue one event; ref is the chain_txs row id updated once sent (or skipped)."""
        if event_type not in PUBLISHABLE:
            return
        ev = {"ref": ref, "board": token_id(board_id), "board_id": board_id, "type": event_type,
              "station": (station or "")[:1], "t": int(t), "proof": (proof or "").removeprefix("0x"),
              "extra": extra or {}}
        if self.mode == "fake":
            digest = hashlib.sha256(json.dumps(ev, sort_keys=True).encode()).hexdigest()
            self._sent([ev], "0x" + digest)
            return
        if self.mode != "real":
            return
        if not self.supports(event_type):
            if self.on_skipped:
                self.on_skipped([ref], "contrat V%d" % self.version)
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
            out = {"mode": self.mode, "label": self.label, "reason": self.reason, "version": self.version,
                   "contract": self.contract_address,
                   "contract_url": self.link("address", self.contract_address or ""),
                   "operator": self.operator, "pending": len(self.queue),
                   "error": self.error, "recent": self.recent[:10]}
        if self.history:
            out["history_synced"] = all(r["state"]["scanned_to"] >= self.history.latest > 0
                                        for r in self.history.readers)
        return out

    def sign(self, sha256_hex: str) -> Optional[dict[str, str]]:
        """Signature of a photo hash by the operator wallet (real mode only)."""
        if self.mode != "real" or not self._key:
            return None
        try:
            return sign_hash(self._key, sha256_hex)
        except Exception as e:
            log.warning("photo hash not signed: %s", e)
            return None

    def board_history(self, board_id: str) -> Optional[dict[str, Any]]:
        return self.history.board(board_id) if self.history else None

    def read_board(self, board_id: str) -> Optional[dict[str, Any]]:
        """On-chain state of a board (free read), real mode only."""
        if self.mode != "real":
            return None
        n = token_id(board_id)
        f = self.contract.functions
        e = f.states(n).call() if self.version == 2 else f.etats(n).call()
        out = {"token_id": n,
               "home": e[0].decode(errors="replace").strip("\x00"),
               "station": e[1].decode(errors="replace").strip("\x00"),
               "last_type": EVENT_NAMES.get(e[2], e[2]), "last_t": e[3],
               "departures": e[4], "events": e[5],
               "status": f.status(n).call() if self.version == 2 else f.statut(n).call(),
               "owner": f.ownerOf(n).call(),
               "nft_url": self.link("nft", "%s/%d" % (self.contract_address, n))}
        return out

    def flush(self, timeout_s: float = 0) -> None:
        """Wake the background writer (used by tests and the reset button)."""
        self.wake.set()

    # -- background --------------------------------------------------------
    def _history_loop(self) -> None:
        pause = 5
        while True:
            try:
                self.history.scan(max_chunks=50, pause_s=0.2)
                self.history.error = None
                pause = 15
            except Exception as e:  # public RPC hiccups: try again later
                self.history.error = str(e)[:200]
                pause = min(pause * 2, 120)
            time.sleep(pause)

    def _next_batch(self) -> list[dict[str, Any]]:
        with self.lock:
            if not self.queue:
                return []
            if self.queue[0]["type"] in ACTIONS:
                return [self.queue[0]]
            batch = []
            for ev in self.queue[:BATCH_MAX]:
                if ev["type"] in ACTIONS:
                    break
                batch.append(ev)
            return batch

    def _loop(self) -> None:
        pause = 2
        self.wake.set()
        while True:
            self.wake.wait(timeout=10)
            self.wake.clear()
            while True:
                batch = self._next_batch()
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

    def _function(self, batch: list[dict[str, Any]]) -> Any:
        f = self.contract.functions
        first = batch[0]
        if self.version == 1:
            if len(batch) == 1:
                return f.enregistrer(first["board"], EVENT_TYPES[first["type"]], first["station"].encode(), first["t"])
            return f.enregistrerLot([e["board"] for e in batch], [EVENT_TYPES[e["type"]] for e in batch],
                                    [e["station"].encode() for e in batch], [e["t"] for e in batch])
        kind, x = first["type"], first["extra"]
        if kind == "CORRECTION":
            return f.correct(first["board"], int(x["corrected_index"]), first["station"].encode() or b"\x00",
                             first["t"], x.get("reason", "")[:200])
        if kind == "VENDUE":
            from web3 import Web3
            return f.sellTo(first["board"], Web3.to_checksum_address(x["buyer"]), first["t"])
        if kind == "SPONSORING":
            return f.startSponsorship(first["board"], x["sponsor_name"], x["artist_name"],
                                      to_bytes32(x.get("design_hash")), x.get("design_uri", ""),
                                      int(x.get("start_date", 0)), int(x.get("end_date", 0)))
        if kind == "FIN_SPONSORING":
            return f.endSponsorship(first["board"], first["t"])
        if len(batch) == 1:
            return f.record(first["board"], EVENT_TYPES[kind], first["station"].encode() or b"\x00", first["t"],
                            to_bytes32(first["proof"]))
        return f.recordBatch([e["board"] for e in batch], [EVENT_TYPES[e["type"]] for e in batch],
                             [e["station"].encode() or b"\x00" for e in batch], [e["t"] for e in batch],
                             [to_bytes32(e["proof"]) for e in batch])

    def _send(self, batch: list[dict[str, Any]]) -> str:
        fn = self._function(batch)
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
            self.queue = [dict({"proof": "", "extra": {}}, **json.loads(line)) for line in
                          self.queue_file.read_text(encoding="utf-8").splitlines() if line.strip()]
