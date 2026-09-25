"""Deploy KorkoBoardV2 on Avalanche Fuji and put the six boards into service.

    python -m backend.chain.scripts.deploy_v2                 your PERSONAL V2 contract (written to .env)
    python -m backend.chain.scripts.deploy_v2 --team          the TEAM V2 contract (backend/chain/deployment.json)
    python -m backend.chain.scripts.deploy_v2 --dry-run       check the settings and the balance, send nothing

--team keeps the V1 contract as "legacy" in deployment.json: its history stays readable in the passports.
Run it only after the team decision, with the wallet that will own the contract. See docs/CHAIN_MIGRATION.md.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Optional

from backend.app.services.chain import (DEPLOYMENT_FILE, FUJI, chain_config, connect, load_contract_json,
                                        read_deployment, send_tx, token_id)
from backend.app.settings import ROOT, env_get, merged_env

from .create_wallet import write_env

sys.path.insert(0, str(ROOT / "korko-kit"))  # the organisers' kit is read-only: we only import it
from korko import STATIONS  # noqa: E402

DEFAULT_IMAGE = "https://raw.githubusercontent.com/RamassamyM/grabandsurf/main/frontend/public/favicon.svg"


def main(args: Optional[list[str]] = None, w3: Any = None, t0: int = 0) -> str:
    args = sys.argv[1:] if args is None else args
    team, dry = "--team" in args, "--dry-run" in args
    env = merged_env()
    explorer = env_get(env, "EXPLORER_URL", FUJI["EXPLORER_URL"])
    image = env.get("BOARD_IMAGE_URI", DEFAULT_IMAGE)
    current = read_deployment()
    if team and int(current.get("version", 1)) >= 2 and "--force" not in args:
        print("Le contrat d'équipe est déjà en V2 : %s/address/%s" % (explorer, current["contract"]))
        return current["contract"]

    conf = dict(chain_config(env, "personal"), CONTRACT_ADDRESS="")
    w3, account, _ = connect(conf, w3)
    chain_id = int(conf.get("CHAIN_ID") or w3.eth.chain_id)
    balance = w3.eth.get_balance(account.address)
    print("Déploiement V2 %s depuis %s (solde %.4f AVAX, chain id %d)"
          % ("d'ÉQUIPE" if team else "PERSO", account.address, balance / 1e18, chain_id))
    if balance == 0:
        sys.exit("Solde nul : passe d'abord au faucet Fuji.")
    if dry:
        print("Simulation (--dry-run) : rien n'est envoyé.")
        return ""

    c = load_contract_json(2)
    factory = w3.eth.contract(abi=c["abi"], bytecode=c["bytecode"])
    tx = factory.constructor(account.address, image).build_transaction({
        "from": account.address, "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": chain_id})
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
    receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(raw), timeout=120)
    address = receipt["contractAddress"]
    print("Contrat V2 déployé : %s/address/%s (bloc %d)" % (explorer, address, receipt["blockNumber"]))

    contract = w3.eth.contract(address=address, abi=c["abi"])
    for station, boards in sorted(STATIONS.items()):
        for b in sorted(boards):
            h = send_tx(w3, account, contract.functions.putIntoService(token_id(b), station.encode(), int(t0)), chain_id)
            print("  %s mise en service (base %s) : %s/tx/%s" % (b, station, explorer, h))

    if team:
        legacy = list(current.get("legacy", []))
        if current.get("contract"):
            legacy.append({"contract": current["contract"], "version": int(current.get("version", 1)),
                           "block": current.get("block", 0)})
        DEPLOYMENT_FILE.write_text(json.dumps({
            "network": "avalanche-fuji", "chain_id": chain_id, "version": 2, "contract": address,
            "block": receipt["blockNumber"], "owner": account.address, "legacy": legacy}, indent=1) + "\n",
            encoding="utf-8")
        print("\nbackend/chain/deployment.json mis à jour (V1 gardé en « legacy ») : à committer.")
        print("Vérifier le code : Snowtrace, Verify & Publish, Solidity (Standard-Json-Input),")
        print("fichier backend/chain/contract/standard-input-v2.json, compilateur v0.8.24, contrat KorkoBoardV2.")
    else:
        write_env({"CONTRACT_ADDRESS": address, "CONTRACT_VERSION": "2",
                   "DEPLOYMENT_BLOCK": str(receipt["blockNumber"])})
        print("\nContrat PERSO V2 écrit dans ton .env (CONTRACT_ADDRESS, CONTRACT_VERSION=2).")
    return address


if __name__ == "__main__":
    main()
