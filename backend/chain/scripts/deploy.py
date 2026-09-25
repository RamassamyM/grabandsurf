"""Deploy a KorkoPlanche contract on Avalanche Fuji and mint the six boards (port of chaine_deployer.py).

    python -m backend.chain.scripts.deploy            your PERSONAL dev contract (written to .env)
    python -m backend.chain.scripts.deploy --force    replace your personal contract
    python -m backend.chain.scripts.deploy --team     the TEAM contract (backend/chain/deployment.json)

Never redeploy the team contract without a team decision.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Optional

from backend.app.services.chain import (DEPLOYMENT_FILE, FUJI, chain_config, connect, load_contract_json,
                                        read_deployment, send_tx, token_id)
from backend.app.settings import ROOT, env_get, merged_env, read_env_file

from .create_wallet import write_env

sys.path.insert(0, str(ROOT / "korko-kit"))  # the organisers' kit is read-only: we only import it
from korko import STATIONS  # noqa: E402


def main(args: Optional[list[str]] = None, w3: Any = None, t0: int = 0) -> str:
    args = sys.argv[1:] if args is None else args
    env = merged_env()
    team = read_deployment().get("contract", "") or ""
    personal = env_get(read_env_file(ROOT / ".env"), "CONTRACT_ADDRESS")
    if personal.lower() == team.lower():
        personal = ""
    team_mode = "--team" in args or "--equipe" in args or not team
    force = "--force" in args
    explorer = env_get(env, "EXPLORER_URL", FUJI["EXPLORER_URL"])

    if team_mode and team and not force:
        print("Le contrat d'équipe existe déjà : %s/address/%s" % (explorer, team))
        print("Pour ton contrat perso : python -m backend.chain.scripts.deploy")
        return team
    if not team_mode and personal and not force:
        print("Tu as déjà ton contrat perso : %s/address/%s" % (explorer, personal))
        print("Pour le remplacer : python -m backend.chain.scripts.deploy --force")
        return personal
    print("Déploiement d'un contrat %s" % ("d'ÉQUIPE (démo)" if team_mode else "PERSO (dev)"))

    conf = dict(chain_config(env, "personal"), CONTRACT_ADDRESS="")
    w3, account, _ = connect(conf, w3)
    chain_id = int(conf.get("CHAIN_ID") or w3.eth.chain_id)
    balance = w3.eth.get_balance(account.address)
    print("Opérateur %s, solde %.4f AVAX" % (account.address, balance / 1e18))
    if balance == 0:
        sys.exit("Solde nul : passe d'abord au faucet (voir create_wallet).")

    c = load_contract_json()
    factory = w3.eth.contract(abi=c["abi"], bytecode=c["bytecode"])
    tx = factory.constructor(account.address).build_transaction({
        "from": account.address, "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": chain_id})
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction")
    receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(raw), timeout=120)
    address = receipt["contractAddress"]
    print("Contrat déployé : %s/address/%s" % (explorer, address))

    contract = w3.eth.contract(address=address, abi=c["abi"])
    for station, boards in sorted(STATIONS.items()):
        for b in sorted(boards):
            h = send_tx(w3, account, contract.functions.mettreEnService(token_id(b), station.encode(), int(t0)), chain_id)
            print("  %s mise en service (base %s) : %s/tx/%s" % (b, station, explorer, h))

    if team_mode:
        DEPLOYMENT_FILE.write_text(json.dumps({"network": "avalanche-fuji", "chain_id": chain_id,
                                               "contract": address, "block": receipt["blockNumber"],
                                               "owner": account.address}, indent=1) + "\n", encoding="utf-8")
        print("\nContrat d'ÉQUIPE écrit dans backend/chain/deployment.json : à committer, puis à vérifier sur Snowtrace.")
    else:
        write_env({"CONTRACT_ADDRESS": address, "DEPLOYMENT_BLOCK": str(receipt["blockNumber"])})
        print("\nContrat PERSO écrit dans ton .env (jamais committé).")
        print("Démo sur le contrat d'équipe : CHAIN_MODE=team uvicorn backend.app.main:create_app --factory --port 9000")
    return address


if __name__ == "__main__":
    main()
