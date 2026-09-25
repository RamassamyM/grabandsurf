# Grab&Surf · équipe grabandsurf

Hackathon SHAKA Festival (Biarritz), défi Green Wave : KORKO, la location de planches de surf
en liège sans personne sur place. Pas de serrure, pas d'appli : on scanne le QR du rack, on
prend la planche indiquée, on la raccroche, c'est fini.

Notre ajout : **chaque planche est un NFT sur Avalanche**, avec son carnet de vie on-chain
(départs, retours, réparations, pertes). L'usager ne voit jamais la blockchain : c'est le
backend qui écrit.

- Contrat d'équipe (Avalanche Fuji, code vérifié) :
  [0x2E802fE90a880f2189A5a85C5562947D8a542302](https://testnet.snowtrace.io/address/0x2E802fE90a880f2189A5a85C5562947D8a542302)
- À lire avant de coder : [CLAUDE.md](CLAUDE.md), [docs/BRIEF.md](docs/BRIEF.md),
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BLOCKCHAIN.md](docs/BLOCKCHAIN.md).

## Structure

```
backend/app/         FastAPI : domain/ (règles pures), services/ (SMS, paiement, IA, alarme, chain), api/
backend/chain/       contrat, ABI, deployment.json (contrat d'équipe), scripts wallet et déploiement
backend/scripts/     seed.py : données de démo
backend/tests/       unit/ et e2e/ (le scénario de démo complet)
station/station.py   code station : journal sur disque, reprise, alarme
frontend/            React 18 + Vite + Tailwind : client, passeport, exploitant, partenaire
config.json          tarifs, minuteries, cagnotte, packs (montants en centimes, aucun secret)
korko-kit/           kit des organisateurs : NE PAS MODIFIER
scripts/dev.sh       lance simulateur, backend, frontend et station
data/                base SQLite, journaux, photos (ignoré par git)
```

## 1. Installation

Prérequis : **Python 3.12**, **Node 20** ou plus récent, `git`.

```
# macOS
brew install python@3.12 node

git clone <url-du-depot> grabandsurf
cd grabandsurf
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
(cd frontend && npm install)
cp env.example .env      # puis garde .env pour toi, il n'est jamais committé
```

Sans `.env`, tout fonctionne : la blockchain passe en **simulation** (transactions fictives,
clairement signalées dans les écrans).

## 2. Lancer la démo

Tout d'un coup :

```
scripts/dev.sh             # simulateur :8080, backend :9000, frontend :5173, station
scripts/dev.sh --build     # le backend sert le front compilé sur :9000 (config de démo)
```

Ou un terminal par brique, depuis la racine :

```
python3 korko-kit/korko_sim.py                                           # simulateur http://localhost:8080
uvicorn backend.app.main:create_app --factory --port 9000                # backend, doc sur /docs
(cd frontend && npm run dev)                                             # front http://localhost:5173
python3 station/station.py --source localhost:8420                       # station A
```

Pages :

| Page | Adresse |
| --- | --- |
| Client au rack A | http://localhost:5173/s/A |
| Passeport de la planche | http://localhost:5173/p/korko-01 |
| Exploitant | http://localhost:5173/operator |
| Partenaire MAIF | http://localhost:5173/partner/maif |
| Inspection des retours | http://localhost:5173/operator/inspection |
| Propriétaire (QR, forfaits) | http://localhost:5173/owner |

Scénario : inscription avec un numéro (le code SMS s'affiche en démo), carte fictive, code
pack `MAIF-SURF`, « Prends korko-01 ». Dans le simulateur, fais partir korko-01 : le compteur
démarre. Fais partir korko-02 sans louer : l'alarme sonne et l'exploitant est alerté.
Raccroche korko-01 : reçu par SMS, photo de retour (+1 €), passeport, tableau MAIF.

Remettre la démo à zéro : bouton en bas de la page exploitant, ou `python -m backend.scripts.seed`.

## Fonctions ajoutées : photo, QR, inspection, langues

- **Langues** : les pages ouvertes par QR (`/s/:station`, `/p/:board`) existent en français, anglais et
  espagnol (sélecteur FR · EN · ES, langue du navigateur par défaut). Les erreurs de l'API et les SMS
  suivent la langue choisie par le client. Les pages exploitant, propriétaire et partenaire restent en français.
- **QR codes** : `/owner` génère la planche de QR à imprimer (un par rack, un par planche). Renseigne
  l'adresse du site vue par les téléphones (IP de l'ordinateur sur le Wi-Fi, pas `localhost`).
  Le client scanne avec la caméra du navigateur (HTTPS ou localhost requis), sinon il prend le QR en photo.
  Sur la photo de retour, le QR de la planche est lu directement sur le téléphone.
- **IA photo** : avec `ANTHROPIC_API_KEY` dans `.env`, la photo de retour est analysée par Claude
  (dommages par zone et gravité). Sans clé, ou si l'API ne répond pas, le diagnostic est simulé et affiché comme tel.
- **Forfaits de réparation** : grille par zone modifiable dans `/owner`, modulée par la gravité
  (légère 50 %, moyenne 100 %, grave 150 %, dans `config.json`). L'exploitant voit la suggestion chiffrée
  et décide ; rien n'est retenu sans sa validation.
- **Caution et inspection** : au retour, seul le prix est prélevé. Le reste de la caution attend la
  vérification sur `/operator/inspection` : valider l'état (caution libérée) ou retenir un forfait.
  Sans action, libération automatique après 8 h ou à la location suivante de la planche sans signalement.

## 3. Tests

```
python -m unittest discover -s backend/tests -t .
```

Tests unitaires du domaine, de la station et de la chaîne, plus
`backend/tests/e2e/test_demo_scenario.py` qui rejoue toute la démo avec une base SQLite
temporaire et des services factices. GitHub Actions lance les tests et le build du front à
chaque PR.

## 4. Brancher la blockchain

| | Contrat **perso** (dev) | Contrat **d'équipe** (démo) |
|---|---|---|
| À quoi il sert | tester sans salir le carnet de la démo | la démo devant le jury |
| Adresse | `CONTRACT_ADDRESS` dans ton `.env` | `backend/chain/deployment.json` |
| Qui écrit | toi seul | le propriétaire et les wallets qu'il autorise |

```
python -m backend.chain.scripts.create_wallet     # clé dans .env, affiche seulement l'adresse
#   faucet Fuji : https://core.app/tools/testnet-faucet/?subnet=c&token=c
python -m backend.chain.scripts.deploy            # ton contrat perso, adresse écrite dans .env
uvicorn backend.app.main:create_app --factory --port 9000
```

Pour la démo sur le contrat d'équipe, ton wallet doit être autorisé par le propriétaire :

```
python -m backend.chain.scripts.grant_operator 0xTON_ADRESSE            # autoriser (propriétaire)
python -m backend.chain.scripts.grant_operator 0xTON_ADRESSE --check    # vérifier
CHAIN_MODE=team uvicorn backend.app.main:create_app --factory --port 9000
```

Les anciens noms du `.env` restent acceptés : `KORKO_CLE_OPERATEUR`, `KORKO_CONTRAT`,
`KORKO_MODE=equipe`, `KORKO_RPC`, `KORKO_CHAIN_ID`, `KORKO_EXPLORATEUR`.
`CHAIN_MODE` : `auto` (défaut : réel si une clé existe, sinon simulation), `team`,
`personal`, `fake`, `off`.

Ne lance **pas** `deploy --team` : il remplacerait le contrat d'équipe.

## 5. Sur la maquette réelle

Connecté au Wi-Fi de la maquette :

```
STATION_SOURCE=192.168.8.100:8420 scripts/dev.sh --build    # station A
```

Stations B et C : `192.168.8.101` et `192.168.8.102` (une commande `station/station.py` par station).

## Règles de l'équipe

- **Jamais de clé privée** dans git ou dans une conversation. `.env` est ignoré par git.
- **Testnet uniquement**, avec un wallet créé pour le hackathon.
- **Aucune donnée client on-chain** : seulement planche, station, type d'événement, heure.
- **Jamais `time.time()`** dans la logique métier : l'heure vient du champ `t` du flux.
- On ne modifie pas `korko-kit/`.
- Aucun tiret cadratin dans les textes affichés (`python scripts/check_em_dash.py`).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `blockchain : Simulation` alors que tu veux Fuji | pas de clé dans `.env` : `python -m backend.chain.scripts.create_wallet` |
| `n'est pas opérateur du contrat` | se faire autoriser (section 4) ou déployer ton contrat perso |
| Station « jamais vue » chez l'exploitant | `station/station.py` ne tourne pas, ou sans `--source` |
| `Address already in use` | un simulateur ou un backend tourne déjà |
| Événements en attente après une coupure | ils sont dans `data/station_A.ndjson` et partent seuls, dans l'ordre |
| Page blanche sur :9000 | lancer `scripts/dev.sh --build` (ou `npm run build` dans `frontend/`) |
