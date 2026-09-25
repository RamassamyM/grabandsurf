# Journal de nuit : migration vers l'architecture cible

Branche `chore/architecture`, partie de `main` (avec les docs poussées hier soir). Rien n'a été mergé.

## État des tests

- `python -m unittest discover -s backend/tests -t .` : **46 tests, tous verts** (domaine, chaîne en mode réel simulé, station, e2e de la démo).
- `npm run build` dans `frontend/` : vert.
- `python scripts/check_em_dash.py` : aucun tiret cadratin dans le code affiché ni dans les docs.
- Vérifié à la main de bout en bout avec le **vrai simulateur du kit** + `station/station.py` + backend : TIC reçus, station A en ligne ; korko-02 sortie sans location, **la station a sonné** et l'exploitant a eu l'alerte ; backend coupé, deux événements gardés dans `data/station_A.ndjson`, puis envoyés **dans l'ordre** au redémarrage (journal vidé, états justes).
- Parcours complet joué dans Chromium (Playwright) : inscription, code, carte, code MAIF, départ, session en direct, retour, reçu, SMS, photo +1 €, passeport, exploitant, MAIF. Aucune erreur JavaScript.

## Ce qui est fait

- **a) Backend FastAPI + SQLite** (`backend/app/`) : settings, db, models, schemas, deps, `domain/` pur (pricing, fleet, wallet, packs, missions), `services/` avec versions factices (SMS démo, paiement, IA photo, alarme, chain), routeurs `stations`, `customers`, `rentals`, `partners`, `fleet`, `photos`, `passport`, et `seed.py`. Toutes les règles demandées : 0,20 €/min, forfait journée 30 €, empreinte 300 €, prix jamais au-dessus de la caution, rappel après X, « non rendue » après Y, caution prélevée seulement après confirmation de l'exploitant, photo 1 €, parrainage SURF-XXXX, packs MAIF-SURF, anti-doublon, station hors ligne, alarme `{"alarm": [...]}` + son, 3 missions en une phrase.
- **b) Chain** : `backend/chain/contract/`, `deployment.json` (contrat d'équipe), `ambassadors.json`, scripts `create_wallet`, `deploy`, `grant_operator`. Anciens et nouveaux noms `.env` acceptés.
- **c) Station** : `station/station.py` avec journal disque, reprise du dernier état, sonnerie.
- **d) Frontend** React 18 + Vite + Tailwind + react-router : `/s/:station`, `/p/:board`, `/operator`, `/partner/:id`, `src/api.js` seul point d'appel, proxy Vite vers 9000, build servi par le backend.
- **e) Tests** : unitaires + `backend/tests/e2e/test_demo_scenario.py`.
- **f)** `scripts/dev.sh`, `.github/workflows/tests.yml`, README réécrit, anciens fichiers racine supprimés, `BLOCKCHAIN.md` dans `docs/`, `env.example` remplace `env.exemple`.
- **g)** `docs/BRIEF.md` et `docs/ARCHITECTURE.md` mis à jour avec toutes les décisions validées.
- **h)** `docs/VISILY_PROMPTS.md` : 7 prompts en français (style, parcours client, session et reçu, passeport, exploitant, partenaire, panneau du rack), chacun sous 4000 caractères, avec états vide, erreur, succès.

## Ce qui reste

- **M8** : transfert réel du NFT au client après achat implicite (`transferFrom`), et page de réclamation. Aujourd'hui : SMS « elle est maintenant à toi », planche « vendue », événement PERDUE on-chain.
- **M9** : contrat V2 (INSPECTION avec empreinte de photo, CORRECTION, VENDUE). Non commencé.
- Passeport : historique lu dans `chain_txs` (hash réels en mode équipe), pas encore par `get_logs` sur la chaîne.
- IA photo : service factice ; brancher un vrai modèle vision dans `services/photo_ai.py` si voulu.
- Forfaits de réparation : grille fictive dans `config.json`, montant affiché sur le signalement mais **pas prélevé**.
- Textes affichés seulement en français (CLAUDE.md parle de français et d'anglais).
- Un code SMS demandé **avant** le tout premier événement d'une vraie station peut expirer quand l'horloge saute à l'heure epoch du Pi : lancer la station avant d'ouvrir la page client (c'est déjà le cas avec `scripts/dev.sh`).
- À tester sur Mac : son de l'alarme (`afplay`) et `scripts/dev.sh` (testés ici sous Linux).
- Pas testé contre Fuji (pas de clé dans ce bac à sable) : le mode réel est couvert par un test avec un faux client web3. Faire un essai `CHAIN_MODE=team` avant la répétition.

## Décisions prises (une ligne chacune)

- Branche `chore/architecture` plutôt que la branche de session cloud : confirmé par toi avant la nuit.
- Pas de commit « snapshot » sur main : l'arbre de travail était propre.
- Venv avec python3.12 (`.venv`, ignoré par git) : disponible sur la machine.
- `docs/ARCHITECTURE.md` contenait deux versions à la suite : j'ai suivi la seconde (plus détaillée), puis réécrit le document en une seule version alignée sur le code.
- Chemins d'API de la seconde version de l'architecture (`/api/otp`, `/api/me`, `/api/boards/{id}/passport`...) : c'était le contrat le plus récent.
- Ajout de `backend/app/workflows.py` pour ce que plusieurs routeurs partagent : les routeurs ne s'appellent jamais entre eux.
- Tables ajoutées : `stations`, `alerts`, `inspections`, `sms_messages`, `app_state` (horloge) : nécessaires aux règles demandées.
- Parrainage : 2 € au filleul dès l'inscription, 2 € au parrain après la 1re location terminée du filleul, 10 maximum : spec M1 de l'architecture, plus précise que la consigne.
- Parrainage accepté par code SURF-XXXX **ou** par numéro du parrain : « parrainage par numéro de téléphone ».
- Achat implicite déclenché uniquement par « Confirmer la perte » de l'exploitant, jamais par le compteur : décision validée, seuil de non-retour séparé du prix.
- Caution libérée dès le retour en démo (le brief dit « sous 8 h ») : plus simple, pas de tâche différée.
- Location armée annulée après 5 min sans départ (`armed_valid_s`) : sinon un vol plus tard serait attribué à ce client.
- `POST /evenements` répond toujours 200, avec `errors` pour les lignes illisibles : une erreur 400 bloquerait le journal de la station pour toujours.
- Photo envoyée en JSON base64 plutôt qu'en multipart : évite une nouvelle dépendance (`python-multipart`).
- IA photo factice (lit le QR décodé par le téléphone, dommage seulement si déclaré) : la démo ne dépend ni du réseau ni d'une clé.
- Sans clé opérateur, la chaîne passe en « Simulation » (hash fictifs, jamais de lien Snowtrace) plutôt qu'en veille : le carnet reste démontrable, et c'est clairement étiqueté.
- Une erreur de connexion à Fuji au démarrage bascule aussi en simulation, avec la raison affichée chez l'exploitant : la démo ne casse pas.
- PIN exploitant et partenaire seulement si `OPERATOR_PIN` est défini : pas de blocage en démo.
- Téléphone du client masqué dans le tableau exploitant (`+336 ** ** 12 34`) : minimisation des données.
- Montant du forfait de réparation enregistré mais pas prélevé : la grille n'est pas encore fixée avec Notox.
- Code MAIF-SURF = un des 4 codes d'un pack de 10 h (150 min chacun) : quota assez grand pour la démo.
- Tailwind 3 (pas 4) et Vite 5 : versions stables, configuration classique.
- Polices Google Fonts (Fraunces, DM Sans) avec repli système : si le Wi-Fi tombe, l'app reste lisible.
- Textes en français seulement : la consigne de la nuit le demandait ; l'anglais reste à faire.
- `scripts/check_em_dash.py` ajouté et lancé en CI : règle « aucun tiret cadratin ».
- PR ouverte via l'outil GitHub de la session (pas de `gh` ici), en brouillon, sans merge.

## Lancer la démo

```
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
(cd frontend && npm install)
scripts/dev.sh                 # simulateur :8080, backend :9000, front :5173, station
scripts/dev.sh --build         # config de démo : front compilé servi sur :9000
CHAIN_MODE=team scripts/dev.sh --build     # démo sur le contrat d'équipe (clé autorisée dans .env)
```

Pages : `/s/A` (client), `/p/korko-01` (passeport), `/operator`, `/partner/maif`.
Remise à zéro : bouton en bas de `/operator`, ou `python -m backend.scripts.seed`.
Tests : `python -m unittest discover -s backend/tests -t .`
