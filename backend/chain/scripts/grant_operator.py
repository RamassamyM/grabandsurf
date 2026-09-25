"""Allow (or remove) a wallet to write to the contract (port of chaine_operateur.py), V1 and V2.

Run by the contract OWNER (V1) or ADMIN (V2) on their machine:

    python -m backend.chain.scripts.grant_operator 0xADDRESS                 allow as operator
    python -m backend.chain.scripts.grant_operator 0xADDRESS --remove        remove
    python -m backend.chain.scripts.grant_operator 0xADDRESS --check         read only
    python -m backend.chain.scripts.grant_operator 0xADDRESS --role repairer V2: operator, repairer or sponsor

The colleague gets their address with  python -m backend.chain.scripts.create_wallet.
"""

from __future__ import annotations

import sys
from typing import Any, Optional

from backend.app.services.chain import chain_config, connect, send_tx
from backend.app.settings import env_get, merged_env, normalize_chain_mode

ROLES = {"operator": "OPERATOR_ROLE", "repairer": "REPAIRER_ROLE", "sponsor": "SPONSOR_MANAGER_ROLE"}


def main(args: Optional[list[str]] = None, w3: Any = None) -> bool:
    args = sys.argv[1:] if args is None else args
    targets = [a for a in args if a.startswith("0x")]
    if len(targets) != 1:
        sys.exit(__doc__)
    role = args[args.index("--role") + 1] if "--role" in args else "operator"
    if role not in ROLES:
        sys.exit("Rôle inconnu : %s (operator, repairer, sponsor)" % role)
    env = merged_env()
    conf = chain_config(env, normalize_chain_mode(env_get(env, "CHAIN_MODE", "auto")))
    w3, account, contract = connect(conf, w3)
    if contract is None:
        sys.exit("Pas de contrat connu : backend/chain/deployment.json ou CONTRACT_ADDRESS dans .env.")
    from web3 import Web3
    target = Web3.to_checksum_address(targets[0])
    f = contract.functions
    v2 = int(conf["VERSION"]) == 2
    role_id = getattr(f, ROLES[role])().call() if v2 else None
    has = (lambda: f.hasRole(role_id, target).call()) if v2 else (lambda: f.operateurs(target).call())

    if "--check" in args or "--verifier" in args:
        print("%s %s : %s" % (target, role, has()))
        return has()
    active = "--remove" not in args and "--retirer" not in args
    if v2:
        fn = f.grantRole(role_id, target) if active else f.revokeRole(role_id, target)
    else:
        owner = f.owner().call()
        if owner != account.address:
            sys.exit("Seul le propriétaire %s peut modifier les opérateurs (toi : %s)." % (owner, account.address))
        fn = f.definirOperateur(target, active)
    h = send_tx(w3, account, fn, int(conf.get("CHAIN_ID") or w3.eth.chain_id))
    print("%s %s %s : %s/tx/%s" % (target, role, "autorisé" if active else "retiré", conf["EXPLORER_URL"], h))
    return active


if __name__ == "__main__":
    main()
