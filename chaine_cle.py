#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chaine_cle.py : crée le wallet opérateur du cloud KORKO, sur ta machine.

    python3 chaine_cle.py

- génère une clé neuve, dédiée au hackathon (jamais ton wallet perso) ;
- l'écrit dans .env, lisible par toi seul (droits 600), ignoré par git ;
- n'affiche QUE l'adresse publique : c'est elle qu'on donne au faucet.

La clé privée ne s'affiche jamais, ne se copie nulle part, ne se colle dans
aucune conversation. Si .env contient déjà une clé, le script ne touche à rien.
"""

import os
import sys

from korko_chain import FUJI, ICI, ecrire_env, lire_deploiement, lire_env

try:
    from eth_account import Account
except ImportError:
    sys.exit("web3 non installé : pip3 install -r requirements-chaine.txt")

conf = lire_env()
if conf.get("KORKO_CLE_OPERATEUR"):
    adresse = Account.from_key(conf["KORKO_CLE_OPERATEUR"]).address
    print("Une clé existe déjà dans .env. Rien n'a été modifié.")
else:
    compte = Account.create()
    valeurs = dict(FUJI)
    valeurs["KORKO_CLE_OPERATEUR"] = compte.key.hex() if compte.key.hex().startswith("0x") \
        else "0x" + compte.key.hex()
    ecrire_env(valeurs)
    adresse = compte.address
    del compte, valeurs
    print("Clé opérateur créée et rangée dans %s (droits 600)." % os.path.join(ICI, ".env"))

print()
print("Adresse opérateur (publique, tu peux la partager) :")
print("    %s" % adresse)
print()
print("Étape suivante : des AVAX de test sur Fuji C-Chain pour cette adresse")
print("    https://build.avax.network/console/primary-network/faucet")
print("    ou https://core.app/tools/testnet-faucet  (coupon Guild si pas de solde mainnet)")
print("Solde : %s/address/%s" % (FUJI["KORKO_EXPLORATEUR"], adresse))
print()
print("Puis :")
print("  - ton contrat de dev perso :  python3 chaine_deployer.py")
if lire_deploiement().get("contrat"):
    print("  - pour écrire aussi dans le contrat d'ÉQUIPE (démo), envoie ton adresse")
    print("    au propriétaire, qui lancera :  python3 chaine_operateur.py %s" % adresse)
