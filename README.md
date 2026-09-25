# KORKO · équipe grabandsurf

Hackathon SHAKA Festival (Biarritz), défi Green Wave : KORKO, la location de
planches de surf en liège en libre-service. Pas de serrure, pas d'app : le
compteur démarre quand la planche quitte le râtelier et s'arrête quand elle
revient.

Notre ajout : **chaque planche est un NFT sur Avalanche**, avec son carnet de vie
on-chain (départs, retours, retours dans une autre station, pertes). L'usager ne
voit jamais la blockchain : c'est le cloud qui écrit. Détails : [BLOCKCHAIN.md](BLOCKCHAIN.md).

- Contrat (Avalanche Fuji, code vérifié) :
  [0x2E802fE90a880f2189A5a85C5562947D8a542302](https://testnet.snowtrace.io/address/0x2E802fE90a880f2189A5a85C5562947D8a542302)

## Structure du dépôt

```
korko-kit/              kit fourni par les organisateurs : NE PAS MODIFIER
  korko_sim.py          simulateur de station (radio BLE simulée)
  station_exemple.py    code station d'exemple (Partie 1)
  cloud_exemple.py      cloud d'exemple (Partie 2)
  korko.py, korko_test.py
cloud_app.py            NOTRE cloud (copie de cloud_exemple.py + blockchain)
korko_chain.py          écriture on-chain en arrière-plan, file d'attente persistée
chaine_cle.py           crée ton wallet opérateur dans .env
chaine_operateur.py     le propriétaire du contrat autorise un wallet
chaine_deployer.py      déploie ton contrat perso de dev
chaine/                 contrat Solidity, ABI compilée, adresse du déploiement
requirements-chaine.txt dépendances Python (côté cloud seulement)
```

## 1. Prérequis

- Python 3.8 ou plus récent (3.10+ recommandé), `pip3`, `git`.
- Le kit des organisateurs n'utilise que la bibliothèque standard. Seul
  `cloud_app.py` a besoin de `web3` pour la partie blockchain.

## 2. Installation

```
git clone <url-du-depot> grabandsurf
cd grabandsurf
pip3 install -r requirements-chaine.txt
```

**Python 3.8 sur Mac** : si l'installation échoue sur `ckzg` avec
« No developer tools were found », installe d'abord la version précompilée :

```
pip3 install "ckzg==2.1.5"
pip3 install -r requirements-chaine.txt
```

(Autre solution : un Python 3.10 ou plus récent, où tout est précompilé.)

## 3. Lancer la démo sans blockchain

Tout se lance **depuis la racine du dépôt**, un terminal par commande :

```
python3 korko-kit/korko_sim.py                              # simulateur   http://localhost:8080
python3 cloud_app.py                                        # cloud        http://localhost:9000
python3 korko-kit/station_exemple.py --source localhost:8420
```

Sans wallet configuré, `cloud_app.py` affiche `blockchain en veille` et tout le
reste fonctionne normalement.

Vérifications :
- le simulateur affiche « 1 client(s) branché(s) » ;
- le tableau de bord du cloud montre la station A avec l'heure de son dernier message ;
- armer un client : http://localhost:9000/arme?client=+33612&station=A puis faire
  partir la planche proposée dans le simulateur.

Si le cloud affiche « Aucune station branchée », la commande station ne tourne
pas, ou elle a été lancée sans `--source`.

## 4. Brancher la blockchain

Deux sortes de contrats, sur le même réseau de test Avalanche Fuji :

| | Contrat **perso** (dev) | Contrat **d'équipe** (démo) |
|---|---|---|
| À quoi il sert | tester, casser, redéployer sans gêner les autres | la démo devant le jury, code vérifié sur Snowtrace |
| Où est son adresse | `KORKO_CONTRAT` dans ton `.env` (jamais committé) | `chaine/deploiement.json` (committé) |
| Qui peut écrire | toi seul | le propriétaire et les wallets qu'il autorise |

Le cloud prend ton contrat perso s'il existe, sinon celui de l'équipe. Le tableau
de bord affiche lequel est utilisé (`PERSO · dev` ou `ÉQUIPE · démo`).

### 4.1 Ton wallet et ton contrat perso

1. **Crée ton wallet** (la clé reste sur ta machine, dans `.env`) :
   ```
   python3 chaine_cle.py
   ```
   Le script n'affiche que ton adresse publique `0x…`.

2. **Récupère des AVAX de test** pour payer les frais (quasi nuls) :
   https://core.app/tools/testnet-faucet/?subnet=c&token=c
   Réseau Fuji C-Chain, token AVAX. Le faucet demande un peu d'AVAX sur le réseau
   principal ou un code coupon (à demander à l'équipe Avalanche du hackathon).
   Sinon, un coéquipier peut t'envoyer un peu d'AVAX de test.

3. **Déploie ton contrat perso** :
   ```
   python3 chaine_deployer.py
   ```
   Son adresse va dans ton `.env`. Pas besoin de le vérifier sur Snowtrace.
   Pour repartir d'un contrat neuf : `python3 chaine_deployer.py --force`.

4. **Lance le cloud** : `python3 cloud_app.py` affiche
   `blockchain active : contrat PERSO 0x…`. Chaque départ ou retour apparaît dans la
   section BLOCKCHAIN du tableau de bord avec un lien Snowtrace.
   Passeport d'une planche : http://localhost:9000/passeport?planche=korko-01

### 4.2 Le contrat d'équipe (démo)

Il est déjà déployé et vérifié :
[0x2E802fE9…8a542302](https://testnet.snowtrace.io/address/0x2E802fE90a880f2189A5a85C5562947D8a542302).
Pour y écrire, ton wallet doit être autorisé une fois par le propriétaire
(Michael). Envoie-lui ton adresse publique ; il lance :

```
python3 chaine_operateur.py 0xTON_ADRESSE              # autoriser
python3 chaine_operateur.py 0xTON_ADRESSE --verifier   # vérifier
```

Puis, pour la démo, force le contrat d'équipe sans toucher à ton `.env` :

```
KORKO_MODE=equipe python3 cloud_app.py
```

Chaque contrat a sa propre file d'attente (`chaine_file_<contrat>.ndjson`) : passer
de l'un à l'autre ne mélange jamais les événements.

Ne lance **pas** `chaine_deployer.py --equipe` : il remplacerait le contrat
d'équipe dans `chaine/deploiement.json`.

## 5. Sur la maquette réelle

Connecté au Wi-Fi de la maquette (identifiants dans le brief des organisateurs),
remplace le simulateur par une vraie station :

```
python3 cloud_app.py
python3 korko-kit/station_exemple.py --source 192.168.8.100:8420   # station A
```

Station B : `192.168.8.101`, station C : `192.168.8.102`.

## Règles de l'équipe

- **Jamais de clé privée** dans git, dans un message ou dans une conversation.
  `.env` est dans `.gitignore`. Une clé fuitée se révoque avec
  `python3 chaine_operateur.py 0xADRESSE --retirer`.
- **Testnet uniquement**, avec un wallet créé pour le hackathon, jamais un wallet perso.
- **Aucune donnée client on-chain** : ni téléphone, ni carte. Seulement planche,
  station, type d'événement, heure.
- **Ne jamais lire `time.time()`** dans la logique métier : on suit le champ `t`
  du flux (règle du kit).
- On ne modifie pas `korko-kit/` : on copie à la racine et on travaille sur la copie.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `Failed building wheel for ckzg` | Python 3.8 sans outils Xcode : `pip3 install "ckzg==2.1.5"` puis réinstaller |
| `blockchain en veille : web3 non installé` | `pip3 install -r requirements-chaine.txt` |
| `pas de clé opérateur dans .env` | `python3 chaine_cle.py` |
| `ton adresse … n'est pas opérateur` | contrat d'équipe : se faire autoriser (4.2), ou déployer ton contrat perso (4.1) |
| Le tableau de bord dit `ÉQUIPE` alors que tu testes | tu n'as pas de contrat perso : `python3 chaine_deployer.py` |
| `Solde nul` ou transactions en attente | passer au faucet (4.1, étape 2) |
| `réseau : … (on réessaie)` dans le tableau de bord | coupure réseau : les événements attendent dans `chaine_file_<contrat>.ndjson` et partiront seuls |
| `Address already in use` | un simulateur ou un cloud tourne déjà dans un autre terminal |
