# CLAUDE.md : KORKO (hackathon SHAKA Festival, Green Wave / NOTOX)

## Le projet en bref

KORKO est un service de location de planches de surf en liège, en libre-service, facturées à la minute. Pas de serrure, pas d'app native, pas de geste de retour : chaque planche porte une balise BLE passive, chaque râtelier une station (Raspberry Pi 3B+) qui l'écoute. Le départ et le retour sont **détectés, jamais déclarés**.

Parcours client : scan du QR (une seule fois : téléphone + carte) → armer une session (SMS ou tap, la station désigne une planche) → s'éloigner (départ détecté, compteur lancé) → surfer → raccrocher au même râtelier → débit, reçu SMS, caution libérée, tubes crédités.

Principe directeur : **la station sait ce qui se passe ; le cloud sait ce que ça veut dire.**

## Architecture : deux parties, séparées par le réseau

### Partie 1 : la station (`ma_station.py`)
- Tourne aujourd'hui sur le portable, mais **doit être écrite comme si elle vivait déjà sur le Pi** : une seule station écoutée, aucune information venue d'ailleurs.
- Ne sait rien des clients, de l'argent ni des autres stations. Sait uniquement : qui est là, qui vient de partir, qui vient de rentrer.
- Doit fonctionner seule si le réseau tombe (4G saturée, antenne en panne), garder son journal et le renvoyer **dans l'ordre, avec les heures d'origine** au retour de la liaison.
- Cible de déploiement : Pi 3B+, une seule radio Bluetooth (une opération à la fois), faible consommation. Rester sur la bibliothèque standard Python.

### Partie 2 : le cloud (`mon_cloud.py`)
- Voit toute la flotte, les clients, l'argent, le temps long : sessions, facturation, cautions, SMS, rééquilibrage, surveillance du parc.
- Stack libre (peut être réécrit en FastAPI, Node, etc.). **Seul le contrat compte.**

## Règles impératives

1. **Ne jamais appeler `time.time()`** (ni aucune horloge système), des deux côtés. Le temps arrive exclusivement dans le champ `t` des messages. C'est ce qui permet le rejeu accéléré et le passage simulateur → station réelle sans modification.
2. **Ne jamais modifier `korko.py`.** C'est la bibliothèque commune (lecture du flux, appel de `observation`/`tic`, transmission et notation des décisions). L'importer, c'est tout.
3. **L'appartenance planche → station vient de `korko.STATIONS`**, table de configuration. Ne jamais la déduire du signal.
4. Une planche d'une autre station raccrochée ici produit `ETRANGERE`, **jamais `RETOUR`** (compté comme erreur par le scoreur).
5. Le même code doit tourner sur les trois sources (simulateur, traces, station réelle) sans changement.
6. Travailler sur des copies : `ma_station.py` et `mon_cloud.py`. Garder `station_exemple.py` et `cloud_exemple.py` intacts comme références.
7. Python 3 + bibliothèque standard uniquement pour la partie station.

## Le kit

| Fichier | Rôle |
|---|---|
| `korko.py` | Bibliothèque commune, **ne pas modifier** : `Detecteur`, `lancer`, `STATIONS`, scoreur |
| `korko_sim.py` | Simulateur de la station A (contrôle sur :8080, flux publié sur :8420) |
| `korko_test.py` | Vérification des stations, `--trouver`, `--mesure korko-01` |
| `station_exemple.py` | Exemple partie 1, qui tourne et liste ses faiblesses |
| `cloud_exemple.py` | Exemple partie 2, qui tourne et liste ses faiblesses |
| `traces/` | Enregistrements (observations + vérité terrain) |

Chaque exemple se termine par la liste de ses faiblesses : c'est le sujet.

## Commandes

```bash
# Vérifications
python3 korko_test.py 192.168.8.100 --station A   # attendu : « Station conforme. »
python3 korko_test.py 192.168.8.101 --station B
python3 korko_test.py 192.168.8.102 --station C
python3 korko_test.py localhost --station A       # vérifie le simulateur
python3 korko_test.py --trouver                    # retrouve les stations
python3 korko_test.py --mesure korko-01            # mesure une balise

# Chaîne complète (un terminal par ligne, dans cet ordre)
python3 korko_sim.py                               # http://localhost:8080
python3 mon_cloud.py                               # http://localhost:9000
python3 ma_station.py --source localhost:8420      # sans --source : scénario interne, n'écoute pas le sim

# Sources pour la station
python3 ma_station.py --sim --scenario journee     # simulé et noté, d'une traite
python3 ma_station.py --rejeu traces/essai.ndjson  # traces enregistrées
python3 ma_station.py --source 192.168.8.100:8420  # station réelle

# Options : --graine N (rejeu identique), --chaos (pertes + trous réseau),
#           --duree S (raccourcir), -v (voir chaque paquet)

# Cloud distant
KORKO_CLOUD=https://mon-cloud.exemple/evenements python3 ma_station.py --source localhost:8420
```

Réseau de la salle : wifi `GL-SFT1200-3ae-5G`, mot de passe `goodlife`. Stations A/B/C en `192.168.8.100` / `.101` / `.102`. Sous Windows, utiliser les IP (les noms `.local` ne marchent pas).

Contrôle de bon branchement : le simulateur affiche « 1 client(s) branché(s) », le tableau de bord cloud « A, dernier message à t = … ». « Aucune station branchée » = la station ne tourne pas ou a été lancée sans `--source`.

## Contrat partie 1 (station)

Entrée, une ligne par paquet radio capté (pas de champ « présente » ou « partie » : c'est à calculer) :
```json
{"t": 412.5, "station": "A", "balise": "korko-01", "rssi": -71}
```

Sortie, trois événements `DEPART`, `RETOUR`, `ETRANGERE` :
```json
{"t": 447.0, "station": "A", "balise": "korko-01", "evenement": "DEPART"}
```

Squelette :
```python
from korko import Detecteur, lancer

class MaStation(Detecteur):
    PERIODE_TIC = 1.0

    def observation(self, o):   # o.t, o.station, o.balise, o.rssi
        ...

    def tic(self, t):           # appelée même pendant les silences
        ...

lancer(MaStation)
```

- Décisions : `self.depart(balise, t, station)`, `self.retour(balise, t, station)`, `self.etrangere(balise, t, station)`. Sans `station`, vaut `"A"`.
- Un départ ne se détecte **que par une absence** : la logique de départ vit dans `tic`.
- L'exemple pousse chaque décision sur `http://localhost:9000/evenements` et envoie un `TIC` à chaque seconde de flux.
- `self.journal` contient ce que le cloud n'a pas reçu ; renvoi retenté à chaque `tic`, dans l'ordre. Test : Ctrl-C sur le cloud une minute, sortir une planche, relancer le cloud.

## Contrat partie 2 (cloud)

- `POST /evenements` : une ligne JSON par événement (`DEPART`, `RETOUR`, `ETRANGERE`, `TIC`).
- `GET /arme?client=+33612&station=A` : un client arme sa session, le cloud lui désigne une planche.
- `GET /` : tableau de bord. `GET /parc` : état brut JSON.
- **Les retards se vérifient sur `TIC`** : une planche jamais rendue ne produit aucun événement.
- Un journal peut arriver d'un coup après une coupure, avec des départs vieux de vingt minutes : ne pas facturer deux fois, ne pas déclarer perdue une planche dont la station était injoignable. Une station muette n'est pas un râtelier vide : c'est une station à surveiller.

Règles de l'exemple (toutes discutables) :
- Planche proposée : chez elle, au râtelier, la moins sortie.
- `DEPART` ouvre une session au nom du premier client armé sur la station ; sans client armé : « sortie sans client » + alerte.
- `RETOUR` ferme, facture 0,20 €/min, libère la caution, envoie le reçu.
- `ETRANGERE` ferme aussi et signale une planche à rapatrier.
- Plafond dépassé : rappel SMS. Trois fois le plafond : planche réputée perdue, caution (300 €) débitée.
- `PLAFOND = 600` s pour la démo (trois heures en réel).
- `sms()` imprime dans le terminal. Le texte des SMS est toute la relation client : le soigner.

## Ce que la radio fait subir

- Le RSSI bruite de quelques dB en permanence.
- Un corps mouillé devant la balise : environ -20 dB d'un coup (le cas qui casse les algorithmes naïfs).
- Planche à l'envers : environ -5 dB.
- Émission : toutes les 400 ms sur la maquette, toutes les 1 s dans le simulateur. Des paquets se perdent.
- Simulateur : -67 dBm au râtelier, -80 à 5 m, -87 à 9 m, plus rien au-delà de 30 m (sous -100).
- Maquette : au-delà de 4 à 5 m, plus rien.

Faux positifs à gérer : sable, corps devant, planche à l'envers et balise muette font chuter le signal **sans être un départ**. Une étrangère qui arrive fait monter le signal **sans être un retour**.

## Simulateur

Station A : `korko-01` et `korko-02` au râtelier. `korko-03` à `korko-06` appartiennent à B et C, hors de portée tant qu'on ne les rapporte pas.

Scénarios (`--scenario`) : `depart`, `sable` (aucun départ attendu), `corps` (aucun départ attendu), `morte`, `foule`, `etrangere`, `journee` (défaut, tous les pièges).

Enregistrer un cas difficile depuis la page du simulateur (Enregistrer / Arrêter) : deux fichiers dans `traces/` (observations + vérité terrain), rejouables avec `--rejeu`.

## Score

Référence de `station_exemple.py` sur `journee` :
```
détections justes ....... 4
faux départs ............ 7
faux retours ............ 7
événements manqués ...... 1
latence médiane ......... 6.8 s
```
Objectif : faire baisser faux départs, faux retours et manqués, en gardant la latence médiane sous 15 s. Chaque seconde de trop = facturation perdue ; chaque seconde de moins = risque de faux départ.

Méthode : **régler sur le simulateur, valider sur des traces, prouver sur la maquette.** Le simulateur est plus propre que la réalité.

## Pistes ouvertes

Station : hystérésis à deux seuils, délai de silence avant départ, lissage du signal, distinguer « sur le sable » de « à l'eau », utiliser les autres balises comme référence (si toutes faiblissent, c'est la station), hypothèse au démarrage (l'exemple suppose tout au râtelier), journal persisté sur fichier pour survivre à un redémarrage du Pi, décision explicable à un exploitant en une phrase.

Cloud : départs simultanés (même suggestion à deux clients), rééquilibrage (décidé par le logiciel, exécuté par l'exploitant en tournée, jamais par les usagers), rotation (état réel, heure, marée, affluence), confiance (caution dégressive), surveillance des stations muettes et absorption des journaux, persistance (tout est en RAM).

## Ce qui est déjà tranché (ne pas remettre en cause)

- Pas de serrure, casier, borne ni cadenas. Pas d'app native : QR, web, SMS.
- Une seule balise BLE passive par planche, rien d'autre à bord. Pas de GPS.
- La balise n'est entendue que par la station, à quelques mètres : on sait qu'une planche est partie, **jamais où elle est**. Aucune solution de type « on la retrouvera ».
- Pas de position précise par RSSI : seulement « près du râtelier » ou « plus loin ».
- Une planche appartient à un râtelier et doit y revenir.
- Caution pré-autorisée de 300 €. Planches réparées, pas jetées.
- Le service dégrade en cas de panne, il ne bloque pas.

## Vocabulaire

- **Râtelier** : support ouvert, sans mécanisme.
- **Balise** : émetteur BLE noyé dans le liège.
- **Station** : râtelier + Pi, seul point alimenté.
- **Sortie de zone** : moment où la station cesse d'entendre la planche assez fort ; démarre la location.
- **Étrangère** : planche raccrochée à une autre station que la sienne.
- **Tube** : point gagné par l'usager (location, photo de la planche), dépensé chez des partenaires locaux.
- **Caution** : empreinte bancaire, débitée seulement en cas de non-retour.
- **Reconditionnement** : planche abîmée qui repart en atelier puis revient dans le parc.

## Restitution

Cinq minutes par équipe. Un algorithme qui tourne sur des données vaut mieux qu'une présentation d'intentions. Question qui reviendra toujours : **qu'est-ce qui casse en premier, et que se passe-t-il à ce moment-là ?**
