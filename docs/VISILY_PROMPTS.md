# Prompts Visily : maquettes Grab&Surf

Sept prompts à coller un par un dans Visily. Chaque bloc de code fait **moins de 4 000 caractères** (vérifié par un script). Commencer par le prompt 0 (style), puis générer chaque groupe d'écrans. Les contenus correspondent aux écrans codés dans `frontend/` et aux données de la démo (stations A, B, C ; planches korko-01 à korko-06 ; code pack MAIF-SURF).

Conseils :
- Coller d'abord le prompt 0, puis commencer chaque prompt suivant par « Même style que le guide Grab&Surf ».
- Demander chaque fois les trois états : vide, erreur, succès.
- Aucun tiret cadratin dans les textes des écrans. Jamais de mot crypto (wallet, token, gas) côté client.

Ancienne version (en anglais) : `docs/ARCHIVES/VISILY_PROMPTS.md`.

---

## Prompt 0 : guide de style

```
Crée un petit guide de style pour « Grab&Surf », location de planches de surf en liège en libre-service sur la côte basque. Personne sur place : on scanne un QR sur un rack en bois, on prend la planche indiquée, on la raccroche.

Ambiance : naturelle, océan, liège, sable, écume. Chaleureuse et simple, jamais corporate ni « tech ». La blockchain est invisible pour le client : aucun mot crypto sur les écrans client.

Couleurs :
- Liège (identité) : #C08F4F, foncé #8A5E2B, clair #D2A86E. Texture liège : petits points bruns irréguliers sur fond liège, utilisée pour les en-têtes des écrans client.
- Océan (action principale) : #1F6B6B, foncé #124545, très foncé #0B2B2E, clair #E8F3F2
- Sable (fond) : #F5EDDD, carte sable #FBF7EF
- Corail (alerte, vol) : #E0643F
- Blanc écume #FFFFFF, texte #0B2B2E

Typographie : titres en serif douce et chaleureuse (type Fraunces), texte en sans serif ronde (type DM Sans). Titres grands, phrases courtes, beaucoup d'air.

Composants à montrer :
- Bouton principal océan, texte blanc, coins arrondis 12 px, hauteur 48 px minimum
- Bouton liège (actions « cagnotte », « partager »), bouton fantôme bordé, bouton danger corail
- Carte blanche, coins 16 px, ombre douce
- Pastilles de statut : « au rack » (océan clair), « en mer » (bleu ciel), « hors base » (liège clair), « sortie sans client » (corail plein, texte blanc), « non rendue » (corail clair), « en atelier » (ambre), « perdue » et « vendue » (océan très foncé)
- Montant en euros avec virgule : « 2,40 € »
- Compteur de session « 12 min 05 s »
- Champ téléphone, champ code à 4 chiffres en gros caractères espacés
- Bulle SMS (fond sable, coin haut gauche pointu) et bouton flottant « SMS de démo » avec pastille de compteur
- Lien de preuve court en police mono : « 0x37cd86…3774 ↗ »
- Message d'erreur : fond corail très clair, texte corail foncé
- Icônes : planche, vague, rack, appareil photo, bulle SMS, clé, cadeau, cloche

Mobile d'abord (390 px) pour le client et le passeport ; bureau 1280 px pour l'exploitant et le partenaire.
```

## Prompt 1 : parcours client, inscription et location (mobile)

```
Même style que le guide Grab&Surf. Web app mobile 390 px, ouverte en scannant le QR du rack. Textes en français. 5 écrans en parcours, plus les états.

En-tête commun : bandeau texture liège, logo Grab&Surf dans une pastille blanche à gauche, lien « Changer de numéro » à droite une fois connecté. Sous le logo : « RACK A » en petites capitales, titre « Grande Plage », sous-titre « 2 planche(s) disponible(s) ». Les cartes remontent légèrement sur le bandeau.

Écran 1 « Ton numéro, et c'est tout » :
- Texte : « Pas de mot de passe, pas d'appli : ton téléphone est ton compte. »
- Champ « Numéro de téléphone », exemple 06 12 34 56 78
- Bouton « Recevoir mon code par SMS »
- En bas, petit texte : « Un souci ? Exploitant : 05 59 00 00 00. Tu n'es jamais facturé au-delà de ton retour. »

Écran 2 « Code reçu par SMS » :
- « Envoyé au +33612345678. »
- Encadré sable : « Démo : ton code est 0266 »
- Champ code à 4 chiffres, grand et espacé
- Champ « Code de parrainage d'un ami (facultatif) », exemple SURF-7K2P (un code pack saisi ici est repris au moment de louer)
- Bouton « Valider », lien « Changer de numéro »
- Bouton flottant en bas à droite « SMS de démo » avec la pastille « 1 »

Écran 3 « Ta carte, une seule fois » :
- « Empreinte de 300 € à chaque location, jamais débitée sauf si la planche n'est pas rendue et après vérification. »
- Champ « Carte bancaire (fictive en démo) » prérempli 4242 4242 4242 4242
- Bouton « Enregistrer ma carte »

Écran 4 « Prêt à surfer ? » :
- « 0,20 € la minute, 30 € maximum par jour. Le compteur démarre quand la planche quitte le rack. »
- Lien « J'ai un code pack » qui ouvre le champ « Code pack ou partenaire » (exemple MAIF-SURF)
- Gros bouton « Louer une planche »
- Carte « Ma cagnotte 2,00 € » avec « Mon code de parrainage SURF-TH2W » et bouton « Partager mon code »

Écran 5 « C'est à toi » (carte océan pleine, centrée) :
- Petites capitales « C'EST À TOI », très grand titre « Prends korko-01 »
- « Décroche-la du rack : le compteur démarre dès qu'elle s'éloigne. »
- « Pack MAIF-SURF appliqué. »
- Point blanc qui pulse + « En attente du départ »
- Bouton translucide « Annuler »

États à montrer :
- Vide : rack sans planche, bouton grisé « Aucune planche libre ici », sous-titre « Aucune planche disponible pour le moment ».
- Station hors ligne : sous-titre « station hors ligne, la location reste possible ».
- Erreurs (encadré corail clair) : « Numéro de téléphone invalide. », « Code incorrect ou expiré. », « Code de parrainage inconnu. », « Code pack inconnu. », « Ce code pack est épuisé. », « Numéro de carte invalide. »
- Succès : passage direct de l'écran 4 à l'écran 5.
```

## Prompt 2 : session en direct, reçu, photo, cagnotte (mobile)

```
Même style que le guide Grab&Surf. Mobile 390 px, même en-tête liège « RACK A · Grande Plage ». Textes en français. 5 écrans.

Écran 1 « Session en cours » (grande carte océan) :
- Ligne du haut : « Session en cours » à gauche, « korko-01 » en police mono à droite
- Compteur géant « 6 min 10 s »
- Deux tuiles translucides : « Prix actuel 0,00 € » et « Offert par ton pack 7 min »
- « Raccroche-la au rack en sortant de l'eau : c'est fini, rien à confirmer. »
- Sous la carte, lien : « Planche raccrochée mais pas de SMS après 2 minutes ? »

Écran 2 « Planche non rendue » : même carte en corail. Titre « Planche non rendue », compteur « 31 min 00 s », texte « Raccroche-la vite ou appelle l'exploitant. Ta caution n'est prélevée qu'après vérification. »

Écran 3 « Retour de secours » (carte blanche) :
- « QR du rack A scanné. Scanne maintenant le QR gravé sur ta planche. »
- Champ mono « korko-01 », bouton « Rendre ma planche »
- Erreur possible : « Ce QR n'est pas celui de ta planche korko-01. »

Écran 4 « Merci, planche rendue » (reçu) :
- Pastille « Reçu » à droite du titre
- Lignes : Planche korko-01 ; Durée 12 min ; Offert par le pack 12 min ; Cagnotte - 1,00 € ; Payé 0,00 € (gras) ; Caution libérée ; Retour par QR (si retour de secours)
- Encadré pointillé liège « Photo de retour = 1 € sur ta prochaine session » : « Le QR gravé de la planche doit être visible. C'est aussi ta preuve qu'elle est en bon état. », bouton de prise de photo, champ « QR lu sur la photo (démo) » prérempli korko-01, bouton liège « Envoyer la photo »
- Succès : encadré océan clair « Merci ! 1,00 € ajouté à ta cagnotte. Diagnostic : aucun dommage visible · empreinte 3f2a9c01e4… »
- Déjà fait : « Photo reçue, 1 € déjà ajouté à ta cagnotte. Merci ! »
- Refus : « Photo enregistrée, mais le QR de korko-01 n'est pas lisible : pas de crédit. »
- En dessous, le formulaire « Prêt à surfer ? » pour relouer

Écran 5 « Cagnotte, parrainage et SMS » :
- Carte sable « Ma cagnotte 3,00 € », « Déduite de ta prochaine session »
- Encart blanc « Mon code de parrainage » en gros SURF-TH2W couleur liège, « 2 € pour ton filleul tout de suite, 2 € pour toi après sa première session. », bouton « Partager mon code » (état « Lien copié »)
- Panneau SMS de démo ouvert au-dessus du bouton flottant, bulles de la plus récente à la plus ancienne :
  « Merci ! korko-01 rendue, 12 min, 0,00 €. 12 min offertes par ton pack. Caution libérée. Prends ta planche en photo : 1 € sur ta prochaine session. »
  « Ta session tourne depuis 10 min. Raccroche korko-01 en sortant. Au-delà, forfait journée de 30,00 €. »
  « C'est parti avec korko-01 ! Le compteur tourne. Raccroche-la au rack en sortant de l'eau. »
  « Grab&Surf : ton code est 0266. »
- État vide du panneau : « Aucun SMS pour l'instant. »
```

## Prompt 3 : passeport de planche (mobile, public)

```
Même style que le guide Grab&Surf. Mobile 390 px, page publique ouverte en scannant le QR gravé au laser sur la planche. Textes en français. Aucun mot crypto en gros : la preuve reste discrète.

En-tête texture liège : logo, petites capitales « PASSEPORT DE PLANCHE », très grand titre « korko-01 », pastille « au rack », texte « Liège des Landes · base A · NFT n°1 ».

Contenu :
1. Trois tuiles chiffres : « 1 sessions », « 12 minutes surfées », « 0 réparations ».
2. Carte océan « Son ambassadrice ou ambassadeur » : nom « Maïa », « Surfeuse du matin, Grande Plage », citation en italique « Je l'ai prise à l'aube, trois vagues avant le café. Le liège flotte comme un bouchon. », mention discrète « Personnage fictif. ».
3. Carte « Rendre ma planche » (seulement si ma location est en cours) : « Rack A scanné il y a moins de 5 minutes. On ferme ta session maintenant. », bouton « Confirmer le retour ». Variante sans rack scanné : « Scanne d'abord le QR du rack où tu la raccroches, puis reviens ici. » Succès : « Planche rendue. Ton reçu arrive par SMS. »
4. Carte photo de retour (même encadré pointillé que le reçu) si ma dernière location sur cette planche n'a pas encore de photo.
5. Carte « Son carnet de vie » avec, à droite, l'étiquette discrète « ÉQUIPE · démo » (ou « Simulation »). Texte : « Chaque étape est inscrite dans un registre public : elle ne peut plus être modifiée, seulement corrigée par une nouvelle entrée. » Frise verticale avec points liège :
   - Retour au rack · station A · t = 850 s · lien mono « 0x37cd86…3774 ↗ »
   - Départ · station A · t = 130 s · lien mono « 0xb158a1…24da ↗ »
   - Réparation · station B · lien
   Lien en bas « Voir le registre sur Snowtrace ↗ ».
6. Gros bouton liège « Partager son histoire » (état « Lien copié »).
7. Lien « Signaler une casse » qui ouvre une carte : grille de 5 zones (Nose (avant), Tail (arrière), Rail (bord), Aileron, Pont), zone choisie bordée océan, bouton corail « Envoyer le signalement ». Succès : « Merci, l'exploitant va vérifier. La planche n'est plus proposée en attendant. »

États :
- Vide : planche neuve, carnet « Pas encore de sortie : elle attend sa première vague. », tuiles à 0.
- Erreur : « Cette planche est inconnue. » dans une carte sous le logo.
- Statuts à décliner : « en atelier » (ambre), « vendue » (océan très foncé).
```

## Prompt 4 : tableau de bord exploitant (bureau)

```
Même style que le guide Grab&Surf. Tableau de bord bureau 1280 px, fond sable, une seule page rafraîchie toutes les 2 secondes. Textes en français. Utilisateur : l'exploitant qui fait la tournée (Notox ou une école de surf).

Barre du haut océan très foncé : logo dans une pastille blanche ; à droite un sélecteur « Rôle : Exploitant / Tournée / Réparateur / École de surf » (on enregistre le rôle du validateur, jamais son nom), un bouton « 🔕 Activer le son » (état « 🔔 Son activé »), et « t = 850 s ».

Rangée 1 :
- Grande carte océan (2/3) « MISSIONS DU JOUR », 3 lignes numérotées dans des ronds liège, chacune en une phrase :
  1. « Vérifier korko-02 à la station A : sortie sans location il y a 11 min (vol ou balise muette). »
  2. « Rapatrier korko-03 de A vers B : elle y a été rendue par un client. »
  3. « Inspecter korko-04 : casse signalée (nose), valider ou refuser le diagnostic. »
- Carte (1/3) « Chiffre d'affaires 42,60 € », « 5 location(s) terminée(s) récemment », puis stations : « Station A · Grande Plage ● en ligne », « Station B · Côte des Basques ● hors ligne » (corail), « Station C · Milady ● jamais vue » (gris).

Rangée 2 : carte « Alertes (2) » bordée corail. Ligne vol en gras corail « 🚨 korko-02 sortie de la station A sans location : alarme déclenchée. », ligne « 📡 Station B hors ligne : plus de signal depuis 3 min. », lien « Traitée » à droite de chaque ligne.

Rangée 3 : carte « Planches », grille 3 colonnes de 6 tuiles. Chaque tuile : nom mono souligné (lien vers le passeport), pastille de statut colorée, ligne « base A · 3 sortie(s) · depuis 12 min », éventuellement « +33 6 ** ** 12 34 · 8 min 20 s » pour une location en cours (téléphone masqué). Boutons contextuels : corail « Confirmer la perte » (planche non rendue ou sortie sans client, avec confirmation « Confirmer la perte de korko-02 après vérification du rack ? »), fantôme « Remettre en service » (en atelier, perdue, vendue).

Rangée 4 : carte « Casses à valider » : « korko-04 · zone nose · photo jointe », boutons « Valider la casse » et « Refuser ». Sous-titre : « L'IA propose, l'exploitant décide. Seul le rôle du validateur est enregistré. »

Rangée 5, deux colonnes :
- « Locations terminées » : tableau planche, durée, mode (« retour détecté », « retour QR », « achat implicite »), montant.
- « Blockchain » avec pastille « ÉQUIPE · démo » (océan) ou « Simulation » (sable), adresse du contrat en lien, « En attente d'écriture : 0 », liste « korko-01 RETOUR A » avec lien mono court à droite.

En bas à droite : bouton fantôme « Remettre la démo à zéro ».

États : vide (« Aucune alerte. Tout va bien sur la plage. », « Aucune location terminée pour l'instant. », mission unique « Faire la tournée des racks : vérifier l'état des planches et la propreté des QR. »), erreur réseau (bandeau corail), écran PIN (« Code PIN exploitant », bouton « Entrer »).
```

## Prompt 5 : tableau de bord partenaire (bureau et mobile)

```
Même style que le guide Grab&Surf. Tableau de bord partenaire, 1280 px, avec une variante mobile 390 px. Textes en français. Partenaire de démo : MAIF, qui a acheté un pack d'heures de surf pour ses salariés. Règle absolue : aucun nom, aucun téléphone, uniquement des chiffres agrégés et des preuves.

En-tête océan : logo dans une pastille blanche, petites capitales « ESPACE PARTENAIRE », grand titre « MAIF », phrase clé en blanc : « Chaque heure utilisée est historisée et son intégrité vérifiable. »

Contenu :
1. Quatre tuiles chiffres qui chevauchent l'en-tête : « 10 Heures achetées », « 12 Minutes surfées », « 1 Sessions », « 1 Personnes ».
2. Carte « Utilisation du pack » : barre de progression liège sur fond sable « 2 % », ligne « Montant du pack : 96,00 € · registre : ÉQUIPE · démo ».
3. Carte « Codes distribués » : tableau Code / Quota / Utilisé, lignes MAIF-SURF 150 min 12 min ; MAIF-HBTR 150 min 0 min ; MAIF-QJGF 150 min 0 min ; MAIF-5CBF 150 min 0 min.
4. Carte « Sessions et preuves » : pour chaque session un bloc sable « korko-01 · code MAIF-SURF » à gauche, « 12 min offertes » à droite en gras, puis deux preuves « DEPART 0xb158a1…24da ↗ » et « RETOUR 0x37cd86…3774 ↗ » en police mono (liens vers l'explorateur).

Ton : sobre, rassurant, prêt à être copié dans un rapport RSE. Ne jamais écrire que la blockchain prouve que les salariés ont surfé : on dit que chaque heure est historisée et que son intégrité est vérifiable.

États :
- Vide : tuiles à 0, barre à 0 %, « Aucune session pour l'instant. Les codes attendent leurs surfeurs. »
- Erreur : « Partenaire inconnu. » dans une carte sous le logo.
- Succès : plusieurs sessions, pack à 65 %, codes partiellement utilisés.
- Variante mobile : tuiles en grille 2 x 2, tableau des codes en liste.
```

## Prompt 6 : panneau du rack (affiche imprimée)

```
Même style que le guide Grab&Surf. Affiche verticale A2 fixée sur le rack en bois, lisible à 3 mètres, imprimée pour la démo. Trilingue : français en grand, anglais et espagnol plus petits dessous. Fond sable, bandeau haut en texture liège avec le logo Grab&Surf et le slogan « Grab. Surf. Raccroche. ».

Blocs de haut en bas :
1. Un très grand QR code « Louer » (cadre océan épais), légende « Scanne pour louer · Scan to rent · Escanea para alquilar ». Nom de la station : « Rack A · Grande Plage ».
2. « Comment ça marche », 3 pictos en ligne : téléphone qui scanne « Scanne », main qui prend une planche « Prends la planche indiquée », planche sur le rack « Raccroche-la, c'est fini ».
3. Prix : « 0,20 €/min · 30 € maximum par jour ». Caution : « Empreinte de 300 €, jamais débitée sauf si la planche n'est pas rendue. »
4. La photo : pictogramme appareil photo, « Prends ta planche en photo au retour : 1 € sur ta prochaine session, et c'est ta preuve qu'elle est en bon état. »
5. Le secours : « Pas de SMS de reçu 2 minutes après avoir raccroché ? Scanne le QR du rack puis celui de ta planche. Tu n'es jamais facturé au-delà de ton retour. »
6. Une casse ? « Signale-la en scannant ta planche. »
7. Avertissement dans un bandeau corail : « Une planche qui s'éloigne sans location déclenche l'alarme. »
8. Contact : « Exploitant : 05 59 00 00 00 · Tournée tous les jours à 9 h et 18 h ».
9. Impact, en bas : « Planche en liège des Landes. Scanne ta planche pour voir son histoire. » avec un petit QR de planche en exemple.

Variante 2 : le même panneau sur le rack mobile à roulettes d'une école de surf, avec un petit panneau solaire sur le toit du rack et la mention « Rack de l'école Surf Anglet · rechargé chaque soir ».

États à montrer : panneau neuf ; zoom sur le bloc secours ; version nuit avec les zones clés en encre réfléchissante (QR et avertissement).
```
