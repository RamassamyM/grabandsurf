#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chaine_operateur.py : autorise (ou retire) un wallet à écrire dans le contrat.

À lancer par le PROPRIÉTAIRE du contrat (celui qui l'a déployé), sur sa machine :

    python3 chaine_operateur.py 0xADRESSE_DU_COLLEGUE           # autoriser
    python3 chaine_operateur.py 0xADRESSE_DU_COLLEGUE --retirer # retirer
    python3 chaine_operateur.py 0xADRESSE --verifier            # simple lecture

Le collègue obtient son adresse avec  python3 chaine_cle.py  (sa clé reste chez lui).
"""

import sys

from korko_chain import connecter, envoyer_tx, lire_env


def main(args=None, w3=None, conf=None):
    args = sys.argv[1:] if args is None else args
    cibles = [a for a in args if a.startswith("0x")]
    if len(cibles) != 1:
        sys.exit(__doc__)
    conf = conf or lire_env()
    w3, compte, contrat = connecter(conf, w3)
    if contrat is None:
        sys.exit("Pas de contrat connu : chaine/deploiement.json ou KORKO_CONTRAT dans .env.")
    from web3 import Web3
    cible = Web3.to_checksum_address(cibles[0])
    f = contrat.functions

    if "--verifier" in args:
        print("%s opérateur : %s" % (cible, f.operateurs(cible).call()))
        return f.operateurs(cible).call()

    proprietaire = f.owner().call()
    if proprietaire != compte.address:
        sys.exit("Seul le propriétaire %s peut modifier les opérateurs (toi : %s)."
                 % (proprietaire, compte.address))
    actif = "--retirer" not in args
    h = envoyer_tx(w3, compte, f.definirOperateur(cible, actif),
                   int(conf.get("KORKO_CHAIN_ID") or w3.eth.chain_id))
    print("%s %s : %s/tx/%s" % (cible, "autorisé" if actif else "retiré",
                                conf["KORKO_EXPLORATEUR"], h))
    return actif


if __name__ == "__main__":
    main()
