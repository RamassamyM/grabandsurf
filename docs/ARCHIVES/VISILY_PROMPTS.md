# Prompts Visily : maquettes Grab&Surf

Six prompts à coller un par un dans Visily (chacun fait moins de 4 000 caractères). Commencer par le prompt 0 (style commun), puis générer chaque interface. Les prompts sont en anglais (Visily comprend mieux), les textes des écrans sont en français.

Conseils :
- Générer le prompt 0 d'abord, puis ajouter à chaque prompt suivant « Use the same style as the Grab&Surf style guide ».
- Exporter en PNG ou partager le lien Visily à l'équipe ; Dev1 et Dev2 s'en servent comme référence pour `frontend/`.
- Rester fidèle au contenu : les données affichées correspondent à la démo (stations A, B, C ; planches korko-01 à korko-06).

---

## Prompt 0 : style commun

```
Create a small style guide for "Grab&Surf", a self-service rental of cork surfboards on French Atlantic beaches (Basque coast). No staff on site: people scan a QR code on a wooden rack, take a board and bring it back.

Brand mood: natural, ocean, eco-friendly, friendly and simple. Think cork, sand, ocean and foam. Not corporate, not techy. The blockchain is invisible to the user: never show crypto words, wallets or tokens in the client screens.

Colors:
- Cork (primary): warm light brown #C8A27A, darker #8B6A48
- Ocean (accent): deep teal #0E5E6F, light #3FA7B5
- Sand background: #F6F1E9
- Foam white: #FFFFFF
- Success green #2E9E6A, warning orange #E08A1E, danger red #C8443A
- Text: dark slate #1F2A30, secondary #5B6770

Typography: rounded modern sans serif (like Nunito or Manrope). Big titles, short sentences, generous spacing.

Components to show:
- Primary button (cork background, white text, fully rounded, large tap target)
- Secondary button (outline teal)
- Card with soft shadow and 16px radius
- Status pills: "Au rack" (green), "En mer" (teal), "Hors base" (orange), "En atelier" (grey), "Perdue" (red), "Muette" (purple)
- Board chip: small surfboard icon + name "korko-01"
- Money display in euros with comma: "3,40 €"
- A timer display "00:23:14"
- Input for phone number with French flag prefix +33
- Toast notification and a small alert banner
- Icons: surfboard, wave, rack, camera, SMS bubble, map pin, wrench, gift

Mobile first for client screens (390 px wide). Desktop 1440 px for dashboards.
```

## Prompt 1 : client, inscription et location (mobile)

```
Use the same style as the Grab&Surf style guide. Mobile web app, 390 px wide, opened by scanning a QR code on a surfboard rack. French texts. Create 5 screens in a flow.

Screen 1 "Bienvenue" (rack scanned):
- Header: logo Grab&Surf, station name "Station A, Plage de la Côte des Basques"
- Big friendly illustration of cork boards on a wooden rack by the ocean
- Availability: "2 planches disponibles" with board chips korko-01 and korko-02 (green "Au rack")
- Price block: "0,20 €/min, forfait journée 30 €"
- Primary button "Louer une planche"
- Small link "Déjà inscrit ? Continuer avec mon numéro"

Screen 2 "Ton numéro":
- Title "Ton numéro est ton compte"
- Phone input +33, button "Recevoir le code"
- Then a 6 digit SMS code input with "Code envoyé par SMS"
- Reassurance text: "Pas de mot de passe, pas d'e-mail."

Screen 3 "Caution":
- Title "Une empreinte de 300 €, jamais débitée"
- Explanation in 2 short lines: "On bloque 300 € sur ta carte. Elle est libérée sous 8 h après ton retour. Elle n'est prélevée que si la planche n'est jamais rendue."
- Card input (fake), button "Valider ma carte"

Screen 4 "Prêt à surfer":
- Optional field "Code pack ou promo" (example placeholder "MAIF-SURF")
- Optional field "Code parrainage" (placeholder "SURF-7K2P")
- Big instruction with illustration: "Prends une planche sur le rack, le compteur démarre tout seul."
- Status line "En attente du départ..." with subtle pulsing wave

Screen 5 "Session en cours":
- Board chip korko-01 with teal pill "En mer"
- Large timer 00:23:14 and current price "4,60 €"
- Info: "Forfait journée atteint à 30 €, tu ne paieras jamais plus."
- Card "Ta cagnotte : 1,00 €" with gift icon
- Footer: "Raccroche la planche au rack, c'est tout." and a small link "Problème ? Appeler l'exploitant 06 00 00 00 00"
```

## Prompt 2 : client, retour, photo, casse et secours (mobile)

```
Use the same style as the Grab&Surf style guide. Mobile web app, 390 px wide, French texts. Create 5 screens.

Screen 1 "Merci !" (board returned, detected automatically):
- Success illustration: board back on the rack, sun, waves
- Receipt card: "korko-01, 47 min, 9,40 €", "Cagnotte utilisée : -1,00 €", total "8,40 €"
- Line "Caution libérée sous 8 h"
- Primary button with camera icon "Prends une photo de la planche : 1 € offert sur ta prochaine session"
- Secondary button "Signaler une casse"

Screen 2 "Photo de retour":
- Camera viewfinder mock with a cork surfboard, a frame guide and hint "Le QR gravé de la planche doit être visible"
- After shot: green check "Photo validée, 1,00 € ajouté à ta cagnotte"

Screen 3 "Parraine un ami":
- Big code "SURF-7K2P" with copy and share buttons
- Text "2 € pour toi, 2 € pour ton ami après sa première session. Jusqu'à 10 amis."
- Progress "3 / 10 parrainages"

Screen 4 "Signaler une casse":
- Board chip korko-03
- Simple board outline (top view) with tappable zones: nose, rails, pont, dérive, tail
- Selected zone highlighted in orange
- Photo button, optional comment field
- Button "Envoyer le signalement"
- Note: "Tu as 5 minutes après avoir pris la planche pour signaler un défaut existant."

Screen 5 "Rendre sans détection" (fallback when the rack does not detect the board):
- Title "La planche n'est pas détectée ?"
- 3 numbered steps with icons: 1 "Scanne le QR du rack" (done, green check), 2 "Scanne le QR gravé sur la planche", 3 "Prends une photo"
- Reassurance: "Ta session s'arrête à l'heure de ce retour, tu ne paies rien de plus."
- Primary button "Scanner le QR de la planche"
```

## Prompt 3 : tableau de bord exploitant (desktop)

```
Use the same style as the Grab&Surf style guide. Desktop web dashboard, 1440 px wide, French texts, single page, refreshes live. User: the operator who does the daily tour of the racks (a surf school or Notox).

Top bar: logo Grab&Surf, title "Exploitant", live dot "En direct", date, operator phone "06 00 00 00 00".

Row 1, KPI cards: "Locations aujourd'hui 14", "Chiffre du jour 186,40 €", "Planches en mer 2", "Alertes ouvertes 3".

Row 2 left (60%), "Stations": 3 station cards A, B, C side by side. Each card: name and beach, online status ("En ligne", or "Hors ligne depuis 4 min" in red for C), last heartbeat time, and its boards as chips with status pills:
- A: korko-01 "En mer" (session 00:23), korko-02 "Au rack"
- B: korko-03 "Au rack", korko-04 "En atelier", plus foreign board korko-02 would show "Étrangère" orange
- C: korko-05 "Muette", korko-06 "Au rack"

Row 2 right (40%), "Alertes" list, newest first, each with icon, time and action button:
- red "Sortie sans location : korko-06 à la station C" button "Voir"
- orange "Non-retour : korko-05, 3 h 12 min" buttons "Rappeler par SMS" and "Confirmer la perte"
- purple "Balise muette : korko-05 depuis 2 h"

Row 3 left, "Missions du jour" (exactly 3 cards, each with one explanation sentence and a "Fait" checkbox):
1 "Rapatrier korko-02 de B vers A : elle y a été rendue ce matin."
2 "Vérifier korko-05 à C : balise muette depuis 2 h."
3 "Récupérer korko-04 à B pour l'atelier : casse validée sur le rail."

Row 3 right, "Casse à valider": photo thumbnail of a cork board, zone "Rail gauche", AI suggestion card "IA : fissure probable, forfait rail 25 €, confiance 82 %", two buttons "Valider" (green) and "Refuser" (outline). Caption: "L'IA propose, l'exploitant décide."

Bottom: table "Dernières locations" with columns Planche, Station départ, Station retour, Durée, Prix, Photo, État; 5 rows of realistic data.

Small footer link "Carnet on-chain de chaque planche" leading to the passport page.
```

## Prompt 4 : passeport public de la planche (mobile et desktop)

```
Use the same style as the Grab&Surf style guide. A public page, reachable by scanning the QR engraved on a cork surfboard. French texts. Make a mobile version (390 px) and a desktop version (1440 px). This is where the blockchain becomes visible, but in plain words: "carnet de vie certifié".

Header: big board photo (cork surfboard, natural texture), name "korko-01", subtitle "Planche en liège, fabriquée à Anglet".
Badge: "Carnet certifié sur Avalanche" with a small shield icon and a link "Voir la preuve" (opens the public explorer).

Key stats cards: "Mise en service : 12 mai 2026", "142 sorties", "3 stations visitées", "1 réparation", "Âge de la balise : 1 an".

Section "Son histoire" as a vertical timeline with icons and dates, newest first:
- wave icon "Retour à la station A" 14:37
- surfboard icon "Départ de la station A" 13:50
- wrench icon "Réparation : rail gauche" 3 septembre
- truck icon "Rapatriée de B vers A" 28 août
- star icon "Mise en service à la station A" 12 mai
Each item has a tiny link icon "preuve" on the right.

Section "Zéro plastique": short text "Cette planche remplace une planche en mousse. Liège recyclable, réparable, suivie toute sa vie." with a small eco illustration.

Section "Ambassadeur": fictional surfer card "Parrainée par Lou, surfeuse de la côte basque" with a friendly illustrated avatar (not a real person).

Important: no personal data anywhere, no customer names, no phone numbers. Only board, station, event type and time.

Footer: "Envie de la tester ? Scanne le QR du rack." and logo.
```

## Prompt 5 : tableau de bord partenaire (desktop)

```
Use the same style as the Grab&Surf style guide. Desktop dashboard, 1440 px wide, French texts. User: a partner organization (example MAIF, a city hall or a company works council) that buys packs of surf hours for its employees or citizens.

Top bar: logo Grab&Surf, "Espace partenaire", partner name "MAIF, pack Sport et bien-être".

Row 1, KPI cards: "Heures achetées 200 h", "Heures utilisées 64 h" with progress bar 32 %, "Codes distribués 40", "Sessions 118".

Row 2 left, chart "Utilisation par semaine" (bar chart, 8 weeks, hours).
Row 2 right, card "Impact": "118 sessions sur des planches en liège", "0 planche en mousse achetée", "Certifié sur Avalanche" with a link "Voir la preuve".

Row 3, table "Codes": columns Code, Quota, Minutes utilisées, Sessions, Dernière utilisation, État. Example codes "MAIF-SURF-01" to "MAIF-SURF-06". No employee names, no phone numbers: only codes and aggregated numbers. Add a small note "Aucune donnée personnelle : seulement des chiffres agrégés par code."

Row 4, card "Acheter des heures": selector 50 h, 100 h, 200 h; price "12 €/h, remise volume -20 %"; total "1 920 €" for 200 h; primary button "Commander un pack"; secondary button "Télécharger les codes (CSV)".

Tone: professional but warm, clear numbers, lots of white space.
```
