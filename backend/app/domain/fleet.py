"""Station events, board statuses and rental matching. Pure: no database, no clock."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

STATION_EVENTS = {"DEPART", "RETOUR", "ETRANGERE", "TIC"}
AVAILABLE_STATUSES = {"at_rack", "away_from_home"}
OUT_STATUSES = {"at_sea", "unauthorized", "not_returned"}

STATUS_LABELS = {
    "at_rack": "au rack", "at_sea": "en mer", "away_from_home": "hors base",
    "unauthorized": "sortie sans client", "not_returned": "non rendue",
    "workshop": "en atelier", "lost": "perdue", "sold": "vendue",
}


@dataclass(frozen=True)
class StationEvent:
    t: float
    station: str
    board_id: Optional[str]
    type: str


class InvalidEvent(ValueError):
    """The station sent something outside the kit protocol."""


def parse_event(raw: Any) -> StationEvent:
    """Translate the kit protocol (balise, evenement) to our names."""
    if not isinstance(raw, dict):
        raise InvalidEvent("un événement doit être un objet JSON")
    kind = raw.get("evenement")
    if kind not in STATION_EVENTS:
        raise InvalidEvent("evenement inconnu : %r" % kind)
    try:
        t = float(raw["t"])
    except (KeyError, TypeError, ValueError):
        raise InvalidEvent("champ t manquant ou invalide")
    station = str(raw.get("station") or "").strip()
    if not station:
        raise InvalidEvent("champ station manquant")
    board = raw.get("balise")
    if kind != "TIC" and not board:
        raise InvalidEvent("champ balise manquant")
    return StationEvent(t=t, station=station, board_id=board, type=kind)


def status_after_return(event_type: str, board_home: str, station: str) -> str:
    """Board status after RETOUR or ETRANGERE at a station."""
    return "at_rack" if station == board_home else "away_from_home"


def pick_board(boards: Iterable[dict[str, Any]], station: str, reserved: set[str]) -> Optional[str]:
    """Board to suggest: available at this station, not under review, least used."""
    free = [b for b in boards
            if b["status"] in AVAILABLE_STATUSES and b["current_station"] == station
            and not b.get("needs_review") and b["id"] not in reserved]
    if not free:
        return None
    return min(free, key=lambda b: (b["rentals_count"], b["id"]))["id"]


def station_online(last_seen_t: Optional[float], now_t: float, config: dict[str, Any]) -> Optional[bool]:
    """True/False once a station has spoken, None if never seen."""
    if last_seen_t is None:
        return None
    return now_t - last_seen_t <= config["timers"]["station_offline_after_s"]


def format_duration(seconds: float) -> str:
    """Short French duration: 12 min, 2 h 05."""
    s = int(max(0, seconds))
    if s < 3600:
        return "%d min" % (s // 60)
    return "%d h %02d" % (s // 3600, s % 3600 // 60)
