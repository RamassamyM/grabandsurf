"""Return photos: the shots required before the deposit is freed, and the check of each QR code. Pure."""

from __future__ import annotations

import re
from typing import Iterable, Optional

# Front, back and fins of the board, then 3 QR codes: engraved on the board, on the rack slot, on the station.
SHOTS = ("front", "back", "fins", "board_qr", "slot_qr", "station_qr")
BOARD_SIDE_SHOTS = ("front", "back", "fins")

_SLOT = re.compile(r"^([A-Z0-9]+)-(\d+)$")


def slot_ids(station: str, slots: int) -> list[str]:
    """Identifiers printed on the slot QR codes of a station: A-1, A-2..."""
    return ["%s-%d" % (station, n) for n in range(1, slots + 1)]


def missing_shots(taken: Iterable[str]) -> list[str]:
    done = set(taken)
    return [s for s in SHOTS if s not in done]


def complete(taken: Iterable[str]) -> bool:
    return not missing_shots(taken)


def check_shot(shot: str, qr: Optional[str], board_id: str, end_station: Optional[str], slots: int) -> Optional[str]:
    """None if the shot is acceptable, else the key of the message explaining why it is refused."""
    if shot not in SHOTS:
        return "shot_unknown"
    if shot in BOARD_SIDE_SHOTS:
        return None
    value = (qr or "").strip().upper()
    if not value:
        return "photo_qr_required"
    if shot == "board_qr":
        return None if value.lower() == (board_id or "").lower() else "wrong_board_qr"
    if not end_station:
        return "return_first"
    if shot == "station_qr":
        return None if value == end_station.upper() else "wrong_station_qr"
    m = _SLOT.match(value)
    if not m or m.group(1) != end_station.upper() or not 1 <= int(m.group(2)) <= slots:
        return "wrong_slot_qr"
    return None
