# KORKO sur Avalanche : le carnet de vie des planches

Chaque planche est un NFT (ERC-721) sur Avalanche. Chaque départ, retour,
retour dans une autre station ou perte validé par `cloud_app.py` est inscrit
dans son carnet de vie. L'usager ne signe rien, ne paie rien et ne voit pas la
blockchain : c'est le wallet opérateur du cloud qui écrit.

## Ce qui part sur la chaîne, et ce qui n'y part jamais

- Oui : numéro de planche, type d'événement, station, heure du flux.
- Jamais : client, téléphone, carte, montant. La chaîne n'oublie rien (RGPD).
- Seuls les événements **validés par le cloud** y partent, jamais le RSSI brut.

## Mise en route (une fois)

```
pip3 install -r requirements-chaine.txt   # côté cloud seulement
python3 chaine_cle.py                     # crée le wallet opérateur dans .env, affiche l'adresse
#   -> faucet Fuji pour cette adresse (voir le message du script)
python3 chaine_deployer.py                # déploie le contrat + 6 NFT, écrit l'adresse dans .env
```

## Démo

Un terminal par commande :

```
python3 korko_sim.py                              # http://localhost:8080
python3 cloud_app.py                              # http://localhost:9000
python3 station_exemple.py --source localhost:8420
```

Arme un client (`/arme?client=+33612&station=A`), fais partir la planche dans
le simulateur : le tableau de bord montre la transaction, avec un lien vers
Snowtrace. `/passeport?planche=korko-01` lit l'état directement sur la chaîne.

## Si le réseau ou la chaîne tombent

La location continue. Les événements attendent dans `chaine_file.ndjson` et
partent plus tard, dans l'ordre, par lots de 20 au plus. Un événement refusé par
le contrat (planche inconnue) est écarté et noté au journal.

## Fichiers

- `chaine/KorkoPlanche.sol` : le contrat (OpenZeppelin 5, solc 0.8.24, EVM cancun).
- `chaine/KorkoPlanche.json` : ABI et bytecode compilés, rien à compiler chez toi.
- `chaine/standard-input.json` : pour vérifier le code source sur Snowtrace.
- `korko_chain.py` : la file d'attente et l'écriture on-chain.
- `chaine_cle.py`, `chaine_deployer.py` : mise en route.
