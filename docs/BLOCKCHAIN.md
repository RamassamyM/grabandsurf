# Grab&Surf sur Avalanche : le carnet de vie des planches

Chaque planche est un NFT (ERC-721) sur Avalanche. Chaque départ, retour, retour dans une
autre station, réparation ou perte validé par le backend est inscrit dans son carnet de vie.
L'usager ne signe rien, ne paie rien et ne voit pas la blockchain : c'est le wallet
opérateur du backend qui écrit.

La blockchain est l'infrastructure, pas le produit : elle sert quand un tiers (partenaire,
client qui conteste une retenue, acheteur d'occasion) doit vérifier sans nous faire confiance.

## Ce qui part sur la chaîne, et ce qui n'y part jamais

- Oui : numéro de planche, type d'événement, station, heure du flux.
- Jamais : client, téléphone, carte, montant, nom d'un validateur. La chaîne n'oublie rien (RGPD).
- Seuls les événements **validés par le backend** y partent, jamais le RSSI brut.
- Une erreur ne s'efface pas : elle se corrige par un nouvel événement.

## Mise en route (une fois)

```
pip install -r backend/requirements.txt
python -m backend.chain.scripts.create_wallet   # wallet opérateur dans .env, affiche l'adresse
#   -> faucet Fuji pour cette adresse (voir le message du script)
python -m backend.chain.scripts.deploy          # contrat perso + 6 NFT, adresse écrite dans .env
```

## Démo

```
scripts/dev.sh                     # contrat perso si tu en as un, sinon contrat d'équipe
CHAIN_MODE=team scripts/dev.sh     # force le contrat d'équipe (démo devant le jury)
```

Le tableau exploitant affiche le mode (`ÉQUIPE · démo`, `PERSO · dev` ou `Simulation`), la
file d'attente et les dernières transactions avec leur lien Snowtrace. Le passeport
`/p/korko-01` montre le carnet de la planche et, en mode réel, son état lu sur la chaîne.

Sans clé opérateur, le backend passe en **simulation** : empreintes de transaction fictives,
jamais présentées comme des liens Snowtrace.

## Si le réseau ou la chaîne tombent

La location continue. Les événements attendent dans `data/chain_queue_<contrat>.ndjson` et
partent plus tard, dans l'ordre, par lots de 20 au plus, avec des renvois espacés. Un
événement refusé par le contrat (planche inconnue) est écarté et marqué `rejected`.

## Fichiers

- `backend/chain/contract/KorkoPlanche.sol` : le contrat (OpenZeppelin 5, solc 0.8.24, EVM cancun).
- `backend/chain/contract/KorkoPlanche.json` : ABI et bytecode compilés, rien à compiler.
- `backend/chain/contract/standard-input.json` : pour vérifier le code source sur Snowtrace.
- `backend/chain/deployment.json` : adresse publique du contrat d'équipe (versionnée, sans secret).
- `backend/chain/ambassadors.json` : ambassadeurs fictifs des passeports.
- `backend/app/services/chain.py` : la file d'attente et l'écriture on-chain.
- `backend/chain/scripts/` : `create_wallet.py`, `deploy.py`, `grant_operator.py`.

Variables `.env` : `OPERATOR_KEY`, `CONTRACT_ADDRESS`, `CHAIN_MODE` (et les anciens noms
`KORKO_CLE_OPERATEUR`, `KORKO_CONTRAT`, `KORKO_MODE=equipe`). Voir [README.md](../README.md).
