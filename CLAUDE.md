# CLAUDE.md : règles de travail du projet Grab&Surf

Ce fichier s'adresse à Claude Code et aux développeurs de l'équipe. **À lire avant toute tâche**, avec `docs/BRIEF.md` (le quoi et le pourquoi) et `docs/ARCHITECTURE.md` (le comment).

## Contexte en 5 lignes

- Hackathon SHAKA Festival, défi Green Wave (service KORKO) : location de planches de surf en liège sans personne sur place.
- Notre idée : chaque planche est un NFT avec son carnet de vie sur Avalanche ; l'usager ne voit jamais la blockchain.
- Stack : backend Python FastAPI + SQLite (SQLAlchemy), frontend React (Vite), station Python du kit, blockchain Avalanche Fuji.
- Équipe : Dev1 (parcours client, partenaire, station) et Dev2 (serveur, exploitant, passeport, blockchain), chacun avec Claude Code.
- Temps très limité : on livre petit, testé, et on garde la démo qui tourne à tout moment.

## Règles d'or (non négociables)

1. **Ne jamais modifier `korko-kit/`** : c'est le kit des organisateurs. On copie ailleurs et on travaille sur la copie.
2. **Ne jamais lire, afficher ni committer `.env`** ni aucune clé privée. Les secrets ne vivent que dans `.env`.
3. **Aucune donnée personnelle sur la blockchain** : seulement planche, station, type d'événement, heure du flux.
4. **Jamais `time.time()` dans la logique métier** : l'heure vient du champ `t` du flux des stations.
5. **Le protocole station du kit ne change pas** : `POST /evenements`, champs `t`, `station`, `balise`, `evenement` (DEPART, RETOUR, ETRANGERE, TIC).
6. **Aucun tiret cadratin dans les textes affichés** à l'utilisateur.
7. **Tout le code est en anglais** : noms de fichiers, variables, fonctions, classes, commentaires. Les textes affichés sont en français et en anglais.

## Travail en équipe avec GitHub

- **Personne ne pousse directement sur `main`.** Une branche par tâche :
  - `feat/<module>-<sujet>` (ex. `feat/m1-client-signup`)
  - `fix/<sujet>`, `chore/<sujet>`, `docs/<sujet>`, `test/<sujet>`
- Avant de commencer et avant chaque PR : `git pull --rebase origin main`.
- **Petits commits**, un changement logique par commit, au format `type(scope): message` :
  `feat(rentals): arm a rental from a station`, `fix(fleet): ignore duplicate station events`, `test(pricing): day cap`.
- **PR petites et fréquentes** : au moins une par heure. Description courte : ce qui change, comment tester, capture si c'est de l'interface.
- **Relecture par l'autre développeur**, 5 minutes maximum. On vérifie : tests verts, pas de secret, pas de fichier de l'autre modifié sans prévenir.
- **Squash merge**, puis suppression de la branche.
- **Après le gel (H+3:30)** : uniquement des branches `fix/`, aucune nouvelle fonctionnalité.
- Conflit sur un fichier partagé : on se parle avant de résoudre, on ne choisit jamais « ma version » à l'aveugle.

## Tests

- **Tests d'abord** pour tout le domaine (`backend/app/domain/`) : écrire le test qui échoue, puis le code qui le fait passer.
- **Tests end to end obligatoires** : `backend/tests/e2e/test_demo_scenario.py` rejoue le scénario de démo complet avec le client de test FastAPI, une base SQLite temporaire et des services factices (SMS, paiement, IA, blockchain, alarme). **Une PR qui casse l'e2e ne se merge pas.** Chaque nouvelle fonctionnalité visible dans la démo ajoute son étape à ce scénario.
- Outil : `unittest` (bibliothèque standard). Commande unique, à lancer avant chaque commit :
  ```
  python -m unittest discover -s backend/tests -t .
  ```
- Un test ne dépend jamais du réseau, de l'heure système, de Fuji ou d'une clé API.
- GitHub Actions lance les tests à chaque PR.

## Architecture et responsabilités

Détail complet dans `docs/ARCHITECTURE.md`. L'essentiel :

- `backend/app/domain/` : **règles métier pures**. Ni réseau, ni base, ni horloge système. Entrée : état, configuration, `t`. Sortie : une décision.
- `backend/app/services/` : **tout ce qui touche l'extérieur** (SMS, paiement, IA photo, alarme, blockchain), chacun avec une version factice. Injectés par `deps.py`.
- `backend/app/api/` : **un routeur par domaine**, qui orchestre base, domaine et services.
- `frontend/src/api.js` : **le seul endroit** qui appelle le backend.
- Montants en **centimes (entiers)**, tous les paramètres métier dans `config.json`, jamais en dur.
- Une requête invalide renvoie 400 ou 404 avec un message clair, jamais 500.

| Propriétaire | Fichiers |
| --- | --- |
| Dev1 | `api/customers.py`, `api/rentals.py`, `api/partners.py`, `domain/pricing.py`, `domain/wallet.py`, `domain/packs.py`, `services/sms.py`, `services/payment.py`, `frontend/src/pages/client/`, `frontend/src/pages/partner/`, `station/` |
| Dev2 | `api/stations.py`, `api/fleet.py`, `api/photos.py`, `api/passport.py`, `domain/fleet.py`, `domain/missions.py`, `services/photo_ai.py`, `services/alarm.py`, `services/chain.py`, `backend/chain/`, `frontend/src/pages/operator/`, `frontend/src/pages/passport/` |
| Partagés | `models.py`, `schemas.py`, `main.py`, `App.jsx`, `frontend/src/components/`, `config.json` |

**Fichiers partagés** : on les modifie dans une PR dédiée et courte, en prévenant l'autre développeur. `models.py` et `schemas.py` sont figés après le cadrage.

## Conventions de code

- Python 3.12, style PEP 8, annotations de type sur les fonctions publiques, docstring d'une ligne.
- Noms : `snake_case` en Python, `camelCase` en JavaScript, composants React en `PascalCase`, routes d'API en `kebab-case` au pluriel (`/api/damage-reports`), JSON en `snake_case`.
- Petites fonctions, un fichier par responsabilité. Pas de code mort ni de `print` de débogage committé : utiliser `logging`.
- Aucune nouvelle dépendance sans accord de l'équipe ; préférer la bibliothèque standard.
- Frontend : composants fonctionnels, un dossier par interface, Tailwind, mobile d'abord, rafraîchissement toutes les 2 s plutôt que des WebSockets.

## Blockchain : précautions

- Testnet Fuji uniquement, avec des wallets créés pour le hackathon.
- Pendant le développement, chacun travaille sur **son contrat perso** (adresse dans son `.env`). La démo tourne sur le **contrat d'équipe** (`backend/chain/deployment.json`), en mode équipe.
- Ne jamais redéployer le contrat d'équipe : seul le propriétaire le fait, après décision de l'équipe.
- Seuls les événements validés par le serveur partent sur la chaîne ; l'écriture ne bloque jamais une location.

## Comment Claude Code doit travailler

1. Lire ce fichier, puis la partie utile de `docs/BRIEF.md` et `docs/ARCHITECTURE.md`.
2. Annoncer un plan court (fichiers touchés, tests prévus) avant de coder.
3. Rester dans les fichiers de son développeur ; pour un fichier de l'autre ou un fichier partagé, le dire d'abord.
4. Écrire le test, puis le code, puis lancer toute la suite de tests.
5. Committer petit, sur une branche, avec un message au bon format.
6. Toute modification d'un format d'API passe par `schemas.py` et se signale à l'autre développeur.
7. En cas de doute sur une règle métier : `docs/BRIEF.md` fait foi, et l'on pose la question plutôt que d'inventer.

## Définition de « fini »

- Tests unitaires et e2e verts.
- La démo tourne toujours de bout en bout (`scripts/dev.sh`).
- Documentation à jour si un format ou une commande a changé.
- Pas de secret, pas de tiret cadratin affiché, pas de nom français dans le code.

## État actuel du dépôt

- **Migration terminée** (branche `chore/architecture`) : backend FastAPI dans `backend/app/`, station robuste dans `station/station.py`, frontend React + Tailwind dans `frontend/`, `scripts/dev.sh`, CI GitHub Actions. Le code historique de la racine (`cloud_app.py`, `korko_chain.py`, `chaine_*.py`, `chaine/`) a été supprimé ; `BLOCKCHAIN.md` est dans `docs/`.
- Ce qui reste et les décisions prises pendant la migration : `docs/NIGHT_LOG.md`.
- Maquettes des écrans : `docs/VISILY_PROMPTS.md`.

Lancer le backend : `uvicorn backend.app.main:create_app --factory --port 9000`
Tests : `python -m unittest discover -s backend/tests -t .`
