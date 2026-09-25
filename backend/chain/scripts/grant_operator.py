"""Allow (or remove) a wallet to write to the contract (port of chaine_operateur.py).

Run by the contract OWNER on their machine:

    python -m backend.chain.scripts.grant_operator 0xADDRESS             allow
    python -m backend.chain.scripts.grant_operator 0xADDRESS --remove    remove
    python -m backend.chain.scripts.grant_operator 0xADDRESS --check     read only

The colleague gets their address with  python -m backend.chain.scripts.create_wallet.
"""

from __future__ import annotations

import sys
from typing import Any, Optional

from backend.app.services.chain import chain_config, connect, send_tx
from backend.app.settings import merged_env, normalize_chain_mode, env_get


def main(args: Optional[list[str]] = None, w3: Any = None) -> bool:
    args = sys.argv[1:] if args is None else args
    targets = [a for a in args if a.startswith("0x")]
    if len(targets) != 1:
        sys.exit(__doc__)
    env = merged_env()
    conf = chain_config(env, normalize_chain_mode(env_get(env, "CHAIN_MODE", "auto")))
    w3, account, contract = connect(conf, w3)
    if contract is None:
        sys.exit("Pas de contrat connu : backend/chain/deployment.json ou CONTRACT_ADDRESS dans .env.")
    from web3 import Web3
    target = Web3.to_checksum_address(targets[0])
    f = contract.functions
    if "--check" in args or "--verifier" in args:
        allowed = f.operateurs(target).call()
        print("%s opérateur : %s" % (target, allowed))
        return allowed
    owner = f.owner().call()
    if owner != account.address:
        sys.exit("Seul le propriétaire %s peut modifier les opérateurs (toi : %s)." % (owner, account.address))
    active = "--remove" not in args and "--retirer" not in args
    h = send_tx(w3, account, f.definirOperateur(target, active), int(conf.get("CHAIN_ID") or w3.eth.chain_id))
    print("%s %s : %s/tx/%s" % (target, "autorisé" if active else "retiré", conf["EXPLORER_URL"], h))
    return active


if __name__ == "__main__":
    main()
