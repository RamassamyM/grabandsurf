# Passage au contrat V2 (KorkoBoardV2) sur Fuji

Ce document décrit la migration du registre des planches du contrat V1 (`KorkoPlanche`) vers le contrat V2
(`KorkoBoardV2`). **Le contrat d'équipe ne se redéploie qu'après décision de l'équipe, par son propriétaire.**
Tout le reste (compilation, tests, contrat perso) peut se faire seul.

## Ce que V2 apporte

| V2 | Pourquoi |
| --- | --- |
| Événement `INSPECTION` avec une preuve (`bytes32`) | L'empreinte SHA-256 de la photo de retour est ancrée ; la photo reste privée |
| `correct(board, index, station, t, reason)` | Un faux départ n'est jamais effacé : une entrée `CORRECTION` le corrige |
| `sellTo(board, wallet, t)` | Achat implicite : le NFT part dans le wallet du client (lien reçu par SMS) |
| Rôles `OPERATOR`, `REPAIRER`, `SPONSOR_MANAGER` | Le serveur écrit le carnet, l'atelier les réparations, le propriétaire les parrainages |
| `startSponsorship` / `endSponsorship` | Nom public du sponsor et de l'artiste, empreinte et lien du design, dates |
| `tokenURI` dynamique | Le design de l'artiste devient l'image du NFT pendant le parrainage |

Rien de personnel ne part sur la chaîne : planche, station, type d'événement, `t` du flux, preuves,
et les noms publics donnés avec l'accord du sponsor et de l'artiste (aucun wallet pour eux).

L'historique V1 n'est pas perdu : `deployment.json` garde l'adresse V1 dans `legacy`, et le passeport lit
les deux contrats (V1 puis V2) avec `get_logs`.

## 1. Compiler (seulement si le `.sol` change)

```bash
cd backend/chain/tools
npm ci                 # solc 0.8.24 et OpenZeppelin 5.0.2, versions figées
npm run compile        # écrit contract/KorkoBoardV2.json et contract/standard-input-v2.json
```

Réglages : optimiseur activé (200 runs), EVM `cancun`. `KorkoBoardV2.json` est commité : le backend
n'a pas besoin de Node pour déployer.

## 2. Tester en local (sans réseau)

```bash
pip install -r backend/requirements-dev.txt      # eth-tester, une chaîne EVM en mémoire
python -m unittest discover -s backend/tests -t .
```

`test_contract_v2.py` teste le contrat lui-même (rôles, correction, vente, parrainage, textes refusés),
`test_chain_v2_service.py` le service Python contre un vrai V2 déployé dans eth-tester (écriture groupée,
relecture de l'historique, signature des photos).

## 3. Essayer sur son contrat perso

```bash
python -m backend.chain.scripts.deploy_v2 --dry-run   # vérifie le .env et le solde, n'envoie rien
python -m backend.chain.scripts.deploy_v2             # déploie un V2 perso et met les 6 planches en service
```

Le script écrit dans ton `.env` : `CONTRACT_ADDRESS`, `CONTRACT_VERSION=2`, `DEPLOYMENT_BLOCK`.
Lance ensuite la démo avec `CHAIN_MODE=personal` et vérifie le passeport (voir « Contrôles » plus bas).
Pour revenir au V1 perso : remettre l'ancienne adresse et `CONTRACT_VERSION=1`.

## 4. Déployer le contrat d'équipe (ensemble, une seule fois)

Prérequis : la clé du propriétaire dans son `.env` (`OPERATOR_KEY`), environ 0,5 AVAX de test
(faucet Fuji : https://core.app/tools/testnet-faucet/?subnet=c&token=c).

```bash
git pull --rebase origin main
python -m backend.chain.scripts.deploy_v2 --team --dry-run
python -m backend.chain.scripts.deploy_v2 --team
```

Le script :

1. déploie `KorkoBoardV2(admin = wallet du propriétaire, image par défaut = BOARD_IMAGE_URI)` ;
2. met les 6 planches en service (`putIntoService`, base A, B ou C) ;
3. réécrit `backend/chain/deployment.json` :
   ```json
   {"version": 2, "contract": "0x…V2", "block": 12345678, "owner": "0x…",
    "legacy": [{"contract": "0x…V1", "version": 1, "block": 0}]}
   ```

Il refuse de redéployer si l'équipe est déjà en V2 (sauf `--force`, à ne pas utiliser sans décision).
Committer `deployment.json` dans une PR `chore/chain-v2` et prévenir l'autre développeur.

## 5. Donner les rôles

Par l'admin du V2 (le propriétaire) :

```bash
python -m backend.chain.scripts.grant_operator 0xWALLET_SERVEUR                 # le backend qui écrit le carnet
python -m backend.chain.scripts.grant_operator 0xWALLET_DEV2                    # le 2e développeur
python -m backend.chain.scripts.grant_operator 0xWALLET_ATELIER --role repairer # réparations et inspections
python -m backend.chain.scripts.grant_operator 0xWALLET_SERVEUR --role sponsor  # parrainages validés
python -m backend.chain.scripts.grant_operator 0xWALLET --check                 # vérifier
```

Le serveur a besoin de `operator` et de `sponsor` : c'est lui qui inscrit le parrainage quand le
propriétaire le valide dans l'onglet « Parrainages ».

## 6. Vérifier le contrat sur Snowtrace

Sur https://testnet.snowtrace.io, page du contrat, « Verify and Publish » :

- type : **Solidity (Standard JSON Input)** ;
- compilateur : **v0.8.24** ;
- fichier : `backend/chain/contract/standard-input-v2.json` ;
- nom du contrat : `KorkoBoardV2` ;
- arguments du constructeur (encodés ABI) : l'adresse admin et l'image par défaut, affichés par le script
  après le déploiement.

Une fois vérifié, le jury peut lire `tokenURI`, `states` et `sponsorship` directement sur Snowtrace.

## 7. Réglages du `.env`

| Variable | Rôle |
| --- | --- |
| `CHAIN_MODE=team` | La démo écrit sur le contrat d'équipe (`deployment.json`) |
| `CONTRACT_VERSION` | Seulement pour le contrat perso : `2` après `deploy_v2` |
| `DEPLOYMENT_BLOCK` | Bloc de départ de la lecture des événements (écrit par le script) |
| `BOARD_IMAGE_URI` | Image par défaut des NFT au déploiement |
| `PUBLIC_BASE_URL` | Adresse publique du site : lien du design inscrit sur la chaîne, lien de réclamation du NFT dans le SMS |

## 8. Contrôles après migration

1. `python -m unittest discover -s backend/tests -t .` reste vert.
2. Démo : une location complète, puis le passeport de la planche. Chaque ligne doit passer de
   « en attente d'écriture » à « vérifié sur la chaîne » ; la ligne du haut dit « Historique lu directement sur la chaîne ».
3. Photo de retour : une ligne « Inspection » avec l'empreinte et la signature ; « Vérifier une photo »
   sur le passeport reconnaît la même image.
4. Parrainage : proposé dans l'espace partenaire, validé par le propriétaire, la ligne « Nouveau design
   d'artiste » apparaît et `tokenURI` sur Snowtrace montre l'image de l'artiste.
5. Faux départ : bouton « Corriger (faux départ) » dans le tableau exploitant ; le départ reste visible,
   suivi d'une ligne « Correction ».
6. Les anciens événements V1 restent affichés (lus via `legacy`).

## Retour arrière

Remettre l'ancien `deployment.json` (V1) depuis git. Les événements propres au V2 (inspection, correction,
vente, parrainage) sont alors marqués « non inscrit (contrat V1) » au lieu de faire échouer l'envoi ;
la location n'est jamais bloquée.
