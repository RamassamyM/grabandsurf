"""Create the backend operator wallet on your machine (port of chaine_cle.py).

    python -m backend.chain.scripts.create_wallet

The private key goes to .env (mode 600, ignored by git) and is never printed:
only the public address is shown. If .env already holds a key, nothing changes.
"""

from __future__ import annotations

import os
import sys

from backend.app.services.chain import FUJI, read_deployment
from backend.app.settings import ROOT, env_get, merged_env

ENV_FILE = ROOT / ".env"


def write_env(values: dict[str, str], path=ENV_FILE) -> None:
    """Add or replace keys in .env, readable by you only."""
    lines, seen = [], set()
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines(keepends=True):
            key = line.split("=", 1)[0].strip()
            if key in values:
                lines.append("%s=%s\n" % (key, values[key]))
                seen.add(key)
            else:
                lines.append(line if line.endswith("\n") else line + "\n")
    lines += ["%s=%s\n" % (k, v) for k, v in values.items() if k not in seen]
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.writelines(lines)
    os.chmod(path, 0o600)


def main() -> str:
    try:
        from eth_account import Account
    except ImportError:
        sys.exit("web3 non installé : pip install -r backend/requirements.txt")
    key = env_get(merged_env(), "OPERATOR_KEY")
    if key:
        address = Account.from_key(key).address
        print("Une clé existe déjà dans .env. Rien n'a été modifié.")
    else:
        account = Account.create()
        hexkey = account.key.hex()
        values = dict(FUJI, OPERATOR_KEY=hexkey if hexkey.startswith("0x") else "0x" + hexkey)
        write_env(values)
        address = account.address
        del account, values, hexkey
        print("Clé opérateur créée et rangée dans %s (droits 600)." % ENV_FILE)
    print("\nAdresse opérateur (publique, tu peux la partager) :\n    %s\n" % address)
    print("Étape suivante : des AVAX de test sur Fuji C-Chain pour cette adresse")
    print("    https://core.app/tools/testnet-faucet/?subnet=c&token=c")
    print("Solde : %s/address/%s\n" % (FUJI["EXPLORER_URL"], address))
    print("Puis :")
    print("  - ton contrat perso de dev :  python -m backend.chain.scripts.deploy")
    if read_deployment().get("contract"):
        print("  - pour écrire dans le contrat d'ÉQUIPE, envoie ton adresse au propriétaire, qui lancera :")
        print("    python -m backend.chain.scripts.grant_operator %s" % address)
    return address


if __name__ == "__main__":
    main()
