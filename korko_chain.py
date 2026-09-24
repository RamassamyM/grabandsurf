#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
korko_chain.py : le carnet de vie des planches, sur Avalanche.

Le cloud appelle   chaine.publier("korko-01", "DEPART", "A", t)   et continue.
L'écriture on-chain se fait en arrière-plan, depuis une file d'attente
persistée sur disque : si le réseau ou la chaîne tombent, la location
continue, et les événements partent plus tard, dans l'ordre.

Ce qui part sur la chaîne : planche, type d'événement, station, heure du flux.
Ce qui n'y part JAMAIS : le client, son téléphone, sa carte.

Configuration : fichier .env à côté de ce fichier (voir .env.exemple).
La clé privée reste dans .env, sur ta machine. Elle n'est jamais affichée.

Dépendance (côté cloud seulement) :  pip3 install -r requirements-chaine.txt
Sans web3 ou sans .env, le module se met en veille et le cloud marche comme avant.
"""

import json
import os
import sys
import threading
import time

ICI = os.path.dirname(os.path.abspath(__file__))

TYPES = {"MISE_EN_SERVICE": 0, "DEPART": 1, "RETOUR": 2, "ETRANGERE": 3,
         "REPARATION": 4, "RECONDITIONNEMENT": 5, "PERDUE": 6}
NOMS = {v: k for k, v in TYPES.items()}

FUJI = {"KORKO_RPC": "https://api.avax-test.network/ext/bc/C/rpc",
        "KORKO_CHAIN_ID": "43113",
        "KORKO_EXPLORATEUR": "https://testnet.snowtrace.io"}

LOT_MAX = 20          # événements par transaction lors d'un rattrapage


# ------------------------------------------------------------------ outils

def lire_env(chemin=os.path.join(ICI, ".env")):
    """Lit un fichier KEY=VALUE. Les variables d'environnement gagnent."""
    conf = dict(FUJI)
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            for ligne in f:
                ligne = ligne.strip()
                if ligne and not ligne.startswith("#") and "=" in ligne:
                    k, v = ligne.split("=", 1)
                    conf[k.strip()] = v.strip().strip('"').strip("'")
    for k in list(conf) + ["KORKO_CLE_OPERATEUR", "KORKO_CONTRAT"]:
        if os.environ.get(k):
            conf[k] = os.environ[k]
    return conf


def ecrire_env(valeurs, chemin=os.path.join(ICI, ".env")):
    """Ajoute ou remplace des clés dans .env, fichier lisible par toi seul."""
    lignes, vues = [], set()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            for ligne in f:
                k = ligne.split("=", 1)[0].strip()
                if k in valeurs:
                    lignes.append("%s=%s\n" % (k, valeurs[k]))
                    vues.add(k)
                else:
                    lignes.append(ligne if ligne.endswith("\n") else ligne + "\n")
    for k, v in valeurs.items():
        if k not in vues:
            lignes.append("%s=%s\n" % (k, v))
    fd = os.open(chemin, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.writelines(lignes)
    os.chmod(chemin, 0o600)


def numero(balise):
    """korko-07 -> 7 : l'id du NFT est le numéro de la balise."""
    return int(str(balise).rsplit("-", 1)[-1])


def charger_contrat_json():
    with open(os.path.join(ICI, "chaine", "KorkoPlanche.json"), encoding="utf-8") as f:
        return json.load(f)


def connecter(conf, w3=None):
    """Renvoie (w3, compte, contrat). Lève une exception explicite sinon."""
    try:
        from web3 import Web3
    except ImportError:
        raise RuntimeError("web3 non installé : pip3 install -r requirements-chaine.txt")
    if w3 is None:
        w3 = Web3(Web3.HTTPProvider(conf["KORKO_RPC"], request_kwargs={"timeout": 15}))
    cle = conf.get("KORKO_CLE_OPERATEUR")
    if not cle:
        raise RuntimeError("pas de clé opérateur dans .env : lance python3 chaine_cle.py")
    compte = w3.eth.account.from_key(cle)
    contrat = None
    if conf.get("KORKO_CONTRAT"):
        c = charger_contrat_json()
        contrat = w3.eth.contract(address=Web3.to_checksum_address(conf["KORKO_CONTRAT"]),
                                  abi=c["abi"])
    return w3, compte, contrat


def envoyer_tx(w3, compte, fonction, chain_id, attente=90):
    """Signe localement, envoie, attend le reçu. Renvoie le hash (0x...)."""
    tx = fonction.build_transaction({
        "from": compte.address,
        "nonce": w3.eth.get_transaction_count(compte.address, "pending"),
        "chainId": chain_id,
    })
    signee = compte.sign_transaction(tx)
    brut = getattr(signee, "raw_transaction", None) or getattr(signee, "rawTransaction")
    h = w3.eth.send_raw_transaction(brut)
    recu = w3.eth.wait_for_transaction_receipt(h, timeout=attente)
    if recu["status"] != 1:
        raise RuntimeError("transaction annulée par le contrat : %s" % w3.to_hex(h))
    return w3.to_hex(h)


# ------------------------------------------------------------ la file d'attente

class Chaine:
    """Publie les événements du parc sur Avalanche, sans jamais bloquer le cloud."""

    def __init__(self, note=None, w3=None, conf=None,
                 fichier_file=os.path.join(ICI, "chaine_file.ndjson")):
        self.note = note or (lambda texte: print(texte, file=sys.stderr))
        self.conf = conf or lire_env()
        self.fichier_file = fichier_file
        self.explorateur = self.conf.get("KORKO_EXPLORATEUR", FUJI["KORKO_EXPLORATEUR"])
        self.actif = False
        self.raison = ""
        self.attente = []          # événements pas encore sur la chaîne
        self.recus = []            # derniers envois réussis, le plus récent en tête
        self.erreur = None         # dernière erreur réseau, pour le tableau de bord
        self.verrou = threading.Lock()
        self.reveil = threading.Event()
        self.adresse = None
        self.contrat_adresse = self.conf.get("KORKO_CONTRAT")

        try:
            self.w3, self.compte, self.contrat = connecter(self.conf, w3)
            if self.contrat is None:
                raise RuntimeError("pas de contrat dans .env : lance python3 chaine_deployer.py")
            self.adresse = self.compte.address
            self.chain_id = int(self.conf.get("KORKO_CHAIN_ID") or self.w3.eth.chain_id)
            self.actif = True
        except Exception as e:
            self.raison = str(e)
            self.note("blockchain en veille : %s" % self.raison)
            return

        self._relire_file()
        threading.Thread(target=self._boucle, daemon=True).start()
        self.note("blockchain active : contrat %s, %d événement(s) en attente"
                  % (self.contrat_adresse, len(self.attente)))

    # -- appelé par le cloud ------------------------------------------------
    def publier(self, balise, type_, station, t):
        if not self.actif:
            return
        if type_ not in TYPES or type_ == "MISE_EN_SERVICE":
            return
        ev = {"planche": numero(balise), "balise": balise, "type": type_,
              "station": (station or "")[:1], "t": int(t)}
        with self.verrou:
            self.attente.append(ev)
            self._sauver_file()
        self.reveil.set()

    def etat(self):
        with self.verrou:
            return {"actif": self.actif, "raison": self.raison,
                    "contrat": self.contrat_adresse, "operateur": self.adresse,
                    "en_attente": len(self.attente), "derniers": self.recus[:10],
                    "erreur": self.erreur, "explorateur": self.explorateur}

    def lien(self, quoi, valeur):
        return "%s/%s/%s" % (self.explorateur, quoi, valeur)

    def lire_planche(self, balise):
        """État on-chain d'une planche (lecture gratuite, sans transaction)."""
        n = numero(balise)
        e = self.contrat.functions.etats(n).call()
        return {"planche": balise, "id": n,
                "origine": e[0].decode(errors="replace").strip("\x00"),
                "station": e[1].decode(errors="replace").strip("\x00"),
                "dernier": NOMS.get(e[2], e[2]), "dernier_t": e[3],
                "sorties": e[4], "evenements": e[5],
                "statut": self.contrat.functions.statut(n).call()}

    # -- arrière-plan -------------------------------------------------------
    def _boucle(self):
        pause = 2
        self.reveil.set()                  # au démarrage : vider la file tout de suite
        while True:
            self.reveil.wait(timeout=10)
            self.reveil.clear()
            while True:
                with self.verrou:
                    lot = list(self.attente[:LOT_MAX])
                if not lot:
                    break
                try:
                    h = self._envoyer(lot)
                except _Rejet as e:                 # le contrat refuse : on écarte
                    self.note("blockchain : lot écarté (%s)" % e)
                    self._retirer(len(lot), None, lot)
                    continue
                except Exception as e:              # réseau : on réessaiera
                    self.erreur = "%s : %s" % (time.strftime("%H:%M:%S"), e)
                    time.sleep(pause)
                    pause = min(pause * 2, 60)
                    continue
                pause = 2
                self.erreur = None
                self._retirer(len(lot), h, lot)

    def _envoyer(self, lot):
        f = self.contrat.functions
        if len(lot) == 1:
            e = lot[0]
            fn = f.enregistrer(e["planche"], TYPES[e["type"]], e["station"].encode(), e["t"])
        else:
            fn = f.enregistrerLot([e["planche"] for e in lot],
                                  [TYPES[e["type"]] for e in lot],
                                  [e["station"].encode() for e in lot],
                                  [e["t"] for e in lot])
        try:
            fn.estimate_gas({"from": self.adresse})
        except Exception as e:
            # le contrat refuse (planche inconnue...) : inutile de réessayer
            if "ContractLogicError" in [k.__name__ for k in type(e).__mro__] \
                    or "revert" in str(e).lower():
                raise _Rejet(e)
            raise
        return envoyer_tx(self.w3, self.compte, fn, self.chain_id)

    def _retirer(self, n, h, lot):
        with self.verrou:
            del self.attente[:n]
            self._sauver_file()
            if h:
                for e in lot:
                    self.recus.insert(0, dict(e, tx=h))
                del self.recus[50:]
        if h:
            self.note("⛓ %d événement(s) sur Avalanche : %s" % (len(lot), self.lien("tx", h)))

    def _sauver_file(self):
        tmp = self.fichier_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            for e in self.attente:
                f.write(json.dumps(e) + "\n")
        os.replace(tmp, self.fichier_file)

    def _relire_file(self):
        if os.path.exists(self.fichier_file):
            with open(self.fichier_file, encoding="utf-8") as f:
                self.attente = [json.loads(l) for l in f if l.strip()]


class _Rejet(Exception):
    pass
