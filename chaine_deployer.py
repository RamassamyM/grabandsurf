#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chaine_deployer.py : déploie le contrat KorkoPlanche sur Avalanche Fuji,
et met en service les six planches (un NFT chacune).

    python3 chaine_deployer.py            # une seule fois
    python3 chaine_deployer.py --force    # redéployer un contrat neuf

Il lit .env (créé par chaine_cle.py), signe en local, et ajoute l'adresse
du contrat dans .env. Rien de secret n'est affiché.
"""

import sys

from korko import STATIONS
from korko_chain import (charger_contrat_json, connecter, ecrire_env, envoyer_tx,
                         lire_env, numero)


def main(w3=None, conf=None, t0=0):
    conf = conf or lire_env()
    if conf.get("KORKO_CONTRAT") and "--force" not in sys.argv:
        print("Contrat déjà déployé : %s/address/%s"
              % (conf["KORKO_EXPLORATEUR"], conf["KORKO_CONTRAT"]))
        print("Pour en déployer un neuf : python3 chaine_deployer.py --force")
        return conf["KORKO_CONTRAT"]

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

    ecrire_env({"KORKO_CONTRAT": adresse, "KORKO_BLOC_DEPLOIEMENT": recu["blockNumber"]})
    print("\nAdresse du contrat ajoutée à .env. Lance maintenant : python3 cloud_app.py")
    return adresse


if __name__ == "__main__":
    main()
