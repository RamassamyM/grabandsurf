"""Customer-facing texts (API errors and SMS) in French, English and Spanish.

The operator, owner and partner pages stay in French. No em dash in any text.
"""

from __future__ import annotations

from fastapi import Header

LANGS = ("fr", "en", "es")
DEFAULT = "fr"

MESSAGES: dict[str, dict[str, str]] = {
    # errors
    "session_expired": {
        "fr": "Session expirée : saisis de nouveau ton numéro.",
        "en": "Session expired: please enter your number again.",
        "es": "Sesión caducada: vuelve a introducir tu número."},
    "invalid_phone": {
        "fr": "Numéro de téléphone invalide.",
        "en": "Invalid phone number.",
        "es": "Número de teléfono no válido."},
    "code_invalid": {
        "fr": "Code incorrect ou expiré.",
        "en": "Wrong or expired code.",
        "es": "Código incorrecto o caducado."},
    "referral_unknown": {
        "fr": "Code de parrainage inconnu. Un code pack (ex. MAIF-SURF) se saisit au moment de louer.",
        "en": "Unknown referral code. A pack code (e.g. MAIF-SURF) is entered when you rent.",
        "es": "Código de padrino desconocido. Un código de pack (ej. MAIF-SURF) se introduce al alquilar."},
    "card_invalid": {
        "fr": "Numéro de carte invalide.",
        "en": "Invalid card number.",
        "es": "Número de tarjeta no válido."},
    "station_unknown": {
        "fr": "Station inconnue.", "en": "Unknown station.", "es": "Estación desconocida."},
    "card_first": {
        "fr": "Ajoute d'abord une carte pour l'empreinte de caution.",
        "en": "Please add a card first for the deposit hold.",
        "es": "Primero añade una tarjeta para la fianza."},
    "rental_open": {
        "fr": "Tu as déjà une location en cours.",
        "en": "You already have a rental in progress.",
        "es": "Ya tienes un alquiler en curso."},
    "pack_unknown": {
        "fr": "Code pack inconnu.", "en": "Unknown pack code.", "es": "Código de pack desconocido."},
    "pack_used_up": {
        "fr": "Ce code pack est épuisé.", "en": "This pack code is used up.", "es": "Este código de pack está agotado."},
    "no_board": {
        "fr": "Plus de planche libre à cette station. Essaie une station voisine.",
        "en": "No board left at this station. Try a nearby station.",
        "es": "No quedan tablas en esta estación. Prueba una estación cercana."},
    "rental_not_found": {
        "fr": "Location introuvable.", "en": "Rental not found.", "es": "Alquiler no encontrado."},
    "already_left": {
        "fr": "La planche est déjà partie : raccroche-la pour terminer.",
        "en": "The board has already left: hang it back to finish.",
        "es": "La tabla ya ha salido: vuelve a colgarla para terminar."},
    "not_in_progress": {
        "fr": "Cette location n'est pas en cours.",
        "en": "This rental is not in progress.",
        "es": "Este alquiler no está en curso."},
    "wrong_board_qr": {
        "fr": "Ce QR n'est pas celui de ta planche {board}.",
        "en": "This QR code is not the one of your board {board}.",
        "es": "Este QR no es el de tu tabla {board}."},
    "photo_qr_required": {
        "fr": "Le QR gravé de {board} doit être lisible sur la photo.",
        "en": "The engraved QR code of {board} must be readable on the photo.",
        "es": "El QR grabado de {board} debe leerse en la foto."},
    "board_unknown": {
        "fr": "Planche inconnue.", "en": "Unknown board.", "es": "Tabla desconocida."},
    "image_unreadable": {
        "fr": "Image illisible.", "en": "Unreadable image.", "es": "Imagen ilegible."},
    "invalid_request": {
        "fr": "Requête invalide : {field}", "en": "Invalid request: {field}", "es": "Solicitud no válida: {field}"},
    # photo results
    "photo_credited": {
        "fr": "Merci ! {amount} ajouté à ta cagnotte.",
        "en": "Thank you! {amount} added to your wallet.",
        "es": "¡Gracias! {amount} añadido a tu monedero."},
    "photo_already": {
        "fr": "Photo enregistrée. La cagnotte est déjà créditée pour cette location.",
        "en": "Photo saved. Your wallet was already credited for this rental.",
        "es": "Foto guardada. Tu monedero ya recibió el crédito de este alquiler."},
    "photo_after_return": {
        "fr": "Photo enregistrée. Le crédit arrive une fois la planche raccrochée.",
        "en": "Photo saved. The credit comes once the board is back on the rack.",
        "es": "Foto guardada. El crédito llega cuando la tabla vuelva al rack."},
    "photo_qr_unreadable": {
        "fr": "Photo enregistrée, mais le QR de {board} n'est pas lisible : pas de crédit.",
        "en": "Photo saved, but the QR code of {board} is not readable: no credit.",
        "es": "Foto guardada, pero el QR de {board} no se puede leer: sin crédito."},
    "damage_thanks": {
        "fr": "Merci, l'exploitant va vérifier. La planche n'est plus proposée en attendant.",
        "en": "Thank you, the operator will check. The board is not offered until then.",
        "es": "Gracias, el operador lo revisará. La tabla no se ofrece mientras tanto."},
    # SMS
    "sms_code": {
        "fr": "Grab&Surf : ton code est {code}.",
        "en": "Grab&Surf: your code is {code}.",
        "es": "Grab&Surf: tu código es {code}."},
    "sms_welcome_referral": {
        "fr": "Bienvenue ! {amount} offerts par ton parrain sur ta première session.",
        "en": "Welcome! {amount} from your sponsor on your first session.",
        "es": "¡Bienvenido! {amount} de tu padrino en tu primera sesión."},
    "sms_departure": {
        "fr": "C'est parti avec {board} ! Le compteur tourne. Raccroche-la au rack en sortant de l'eau.",
        "en": "Off you go with {board}! The meter is running. Hang it back on the rack when you get out of the water.",
        "es": "¡Adelante con {board}! El contador está en marcha. Vuelve a colgarla en el rack al salir del agua."},
    "sms_receipt": {
        "fr": "Merci ! {board} rendue, {duration}, {amount}.",
        "en": "Thank you! {board} returned, {duration}, {amount}.",
        "es": "¡Gracias! {board} devuelta, {duration}, {amount}."},
    "sms_receipt_pack": {
        "fr": "{minutes} min offertes par ton pack.",
        "en": "{minutes} min covered by your pack.",
        "es": "{minutes} min cubiertos por tu pack."},
    "sms_receipt_wallet": {
        "fr": "Cagnotte utilisée : {amount}.",
        "en": "Wallet used: {amount}.",
        "es": "Monedero usado: {amount}."},
    "sms_receipt_end": {
        "fr": "Dernière étape : prends ta planche en photo avec son QR gravé, sinon ta caution n'est pas libérée (1 € offert) : {link}",
        "en": "Last step: take a photo of your board with its engraved QR code, or your deposit is not released (1 € off): {link}",
        "es": "Último paso: hazle una foto a tu tabla con su QR grabado, si no tu fianza no se libera (1 € de regalo): {link}"},
    "sms_deposit_released": {
        "fr": "Planche {board} vérifiée : ta caution est libérée. Merci et à bientôt sur l'eau !",
        "en": "Board {board} checked: your deposit is released. Thank you, see you on the water!",
        "es": "Tabla {board} revisada: tu fianza queda liberada. ¡Gracias y hasta pronto en el agua!"},
    "sms_sponsor": {
        "fr": "Ton filleul a surfé : {amount} ajoutés à ta cagnotte Grab&Surf.",
        "en": "Your friend went surfing: {amount} added to your Grab&Surf wallet.",
        "es": "Tu ahijado ha surfeado: {amount} añadidos a tu monedero Grab&Surf."},
    "sms_armed_cancelled": {
        "fr": "Location annulée : aucune planche n'est partie. Rescanne le QR du rack pour recommencer.",
        "en": "Rental cancelled: no board left the rack. Scan the rack QR code again to start over.",
        "es": "Alquiler cancelado: ninguna tabla salió del rack. Vuelve a escanear el QR del rack para empezar."},
    "sms_reminder": {
        "fr": "Ta session tourne depuis {duration}. Raccroche {board} en sortant. Au-delà, forfait journée de {amount}.",
        "en": "Your session has been running for {duration}. Hang {board} back when you are done. Day pass cap: {amount}.",
        "es": "Tu sesión dura ya {duration}. Cuelga {board} al terminar. Tarifa máxima por día: {amount}."},
    "sms_not_returned": {
        "fr": "{board} n'est pas encore revenue. Raccroche-la ou appelle l'exploitant. Ta caution n'est prélevée qu'après vérification.",
        "en": "{board} is not back yet. Hang it back or call the operator. Your deposit is only charged after a check.",
        "es": "{board} aún no ha vuelto. Cuélgala o llama al operador. La fianza solo se cobra tras una verificación."},
    "sms_bought": {
        "fr": "{board} n'est pas revenue : elle est maintenant à toi. Caution de {amount} prélevée. Réclame son NFT ici : {link}",
        "en": "{board} did not come back: it is now yours. Deposit of {amount} charged. Claim its NFT here: {link}",
        "es": "{board} no ha vuelto: ahora es tuya. Fianza de {amount} cobrada. Reclama su NFT aquí: {link}"},
    "claim_unknown": {
        "fr": "Lien de réclamation inconnu ou expiré.", "en": "Unknown or expired claim link.",
        "es": "Enlace de reclamación desconocido o caducado."},
    "claim_done": {
        "fr": "Ce NFT a déjà été réclamé.", "en": "This NFT has already been claimed.",
        "es": "Este NFT ya ha sido reclamado."},
    "claim_wallet_invalid": {
        "fr": "Adresse de wallet invalide : 0x suivi de 40 caractères.",
        "en": "Invalid wallet address: 0x followed by 40 characters.",
        "es": "Dirección de wallet no válida: 0x seguido de 40 caracteres."},
    "sms_repair_fee": {
        "fr": "Casse confirmée sur {board} ({zone}) après vérification : {amount} retenus sur ta caution.",
        "en": "Damage confirmed on {board} ({zone}) after a check: {amount} withheld from your deposit.",
        "es": "Daño confirmado en {board} ({zone}) tras la verificación: {amount} retenidos de tu fianza."},
}


ZONE_NAMES = {
    "nose": {"fr": "nose", "en": "nose", "es": "punta"},
    "tail": {"fr": "tail", "en": "tail", "es": "cola"},
    "rail": {"fr": "rail", "en": "rail", "es": "canto"},
    "fin": {"fr": "aileron", "en": "fin", "es": "quilla"},
    "deck": {"fr": "pont", "en": "deck", "es": "cubierta"},
    "other": {"fr": "autre zone", "en": "other area", "es": "otra zona"},
}


def zone_name(zone: str, lang: str | None) -> str:
    names = ZONE_NAMES.get(zone, ZONE_NAMES["other"])
    return names.get(normalize(lang), names[DEFAULT])


def normalize(lang: str | None) -> str:
    """Accept 'en', 'en-GB', 'es_ES'...; anything else is French."""
    code = (lang or "").strip().lower()[:2]
    return code if code in LANGS else DEFAULT


def t(key: str, lang: str | None = DEFAULT, **values: object) -> str:
    """Translated text, falling back to French."""
    texts = MESSAGES[key]
    return texts.get(normalize(lang), texts[DEFAULT]).format(**values)


def request_lang(x_lang: str = Header(default=""), accept_language: str = Header(default="")) -> str:
    """Language chosen in the page (X-Lang), else the browser's."""
    return normalize(x_lang or accept_language.split(",")[0])
