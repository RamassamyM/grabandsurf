#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chaine_deployer.py : déploie un contrat KorkoPlanche sur Avalanche Fuji,
et met en service les six planches (un NFT chacune).

    python3 chaine_deployer.py              # ton contrat PERSO de dev (écrit dans .env)
    python3 chaine_deployer.py --force      # remplacer ton contrat perso par un neuf
    python3 chaine_deployer.py --equipe     # le contrat d'ÉQUIPE (chaine/deploiement.json)

S'il n'existe encore aucun contrat d'équipe, le premier déploiement le devient.
Il lit .env (créé par chaine_cle.py) et signe en local. Rien de secret n'est affiché.
"""

import os
import sys

# korko.py est dans le kit des organisateurs, qu'on ne modifie pas
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "korko-kit"))
from korko import STATIONS  # noqa: E402
import json

from korko_chain import (FICHIER_DEPLOIEMENT, charger_contrat_json, connecter, ecrire_env,
                         envoyer_tx, lire_deploiement, lire_env, lire_fichier_env, numero)


def main(w3=None, conf=None, t0=0, args=None, env=None, equipe=None):
    args = sys.argv[1:] if args is None else args
    conf = conf or lire_env()
    env = lire_fichier_env() if env is None else env
    equipe = (lire_deploiement().get("contrat") if equipe is None else equipe) or ""
    perso = env.get("KORKO_CONTRAT", "")
    if perso.lower() == equipe.lower():
        perso = ""                                  # .env pointe sur l'équipe : pas de perso
    mode_equipe = "--equipe" in args or not equipe
    force = "--force" in args
    explo = conf["KORKO_EXPLORATEUR"]

    if mode_equipe and equipe and not force:
        print("Le contrat d'équipe existe déjà : %s/address/%s" % (explo, equipe))
        print("Pour ton contrat de dev perso : python3 chaine_deployer.py")
        return equipe
    if not mode_equipe and perso and not force:
        print("Tu as déjà ton contrat perso : %s/address/%s" % (explo, perso))
        print("Pour le remplacer par un neuf : python3 chaine_deployer.py --force")
        return perso
    print("Déploiement d'un contrat %s" % ("d'ÉQUIPE (démo)" if mode_equipe else "PERSO (dev)"))

    w3, compte, _ = connecter(dict(conf, KORKO_CONTRAT=""), w3)
    chain_id = int(conf.get("KORKO_CHAIN_ID") or w3.eth.chain_id)
    solde = w3.eth.get_balance(compte.address)
    print("Opérateur %s, solde %.4f AVAX" % (compte.address, solde / 1e18))
    if solde == 0:
        sys.exit("Solde nul : passe d'abord au faucet (voir chaine_cle.py).")

    c = charger_contrat_json()
    fabrique = w3.eth.contract(abi=c["abi"], bytecode=c["bytecode"])
    tx = fabrique.constructor(compte.address).build_transaction({
        "from": compte.address,
        "nonce": w3.eth.get_transaction_count(compte.address, "pending"),
        "chainId": chain_id})
    signee = compte.sign_transaction(tx)
    brut = getattr(signee, "raw_transaction", None) or getattr(signee, "rawTransaction")
    recu = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(brut), timeout=120)
    adresse = recu["contractAddress"]
    print("Contrat déployé : %s/address/%s" % (conf["KORKO_EXPLORATEUR"], adresse))

    contrat = w3.eth.contract(address=adresse, abi=c["abi"])
    for station, balises in sorted(STATIONS.items()):
        for b in sorted(balises):
            h = envoyer_tx(w3, compte, contrat.functions.mettreEnService(
                numero(b), station.encode(), int(t0)), chain_id)
            print("  %s mise en service (base %s) : %s/tx/%s"
                  % (b, station, conf["KORKO_EXPLORATEUR"], h))

    if mode_equipe:
        with open(FICHIER_DEPLOIEMENT, "w", encoding="utf-8") as f:
            json.dump({"reseau": "avalanche-fuji", "chain_id": chain_id, "contrat": adresse,
                       "bloc": recu["blockNumber"], "proprietaire": compte.address}, f, indent=1)
            f.write("\n")
        ecrire_env({"KORKO_CONTRAT": "", "KORKO_BLOC_DEPLOIEMENT": ""})
        print("\nContrat d'ÉQUIPE écrit dans chaine/deploiement.json : à committer.")
        print("Pense à vérifier son code source sur Snowtrace pour le jury.")
    else:
        ecrire_env({"KORKO_CONTRAT": adresse, "KORKO_BLOC_DEPLOIEMENT": recu["blockNumber"]})
        print("\nContrat PERSO écrit dans ton .env (jamais committé).")
        print("Démo sur le contrat d'équipe : KORKO_MODE=equipe python3 cloud_app.py")
    print("Lance maintenant : python3 cloud_app.py")
    return adresse


if __name__ == "__main__":
    main()
