"""Return photo diagnosis. Fake answer: the demo never depends on the network or an API key."""

from __future__ import annotations

from typing import Any, Optional

ZONES = ["nose", "tail", "rail", "fin", "deck"]


class FakePhotoAI:
    """Reads the QR the phone already decoded; reports a damage only if the customer declared one."""

    name = "simulation"

    def analyze(self, image: bytes, board_qr: Optional[str], declared_zone: Optional[str]) -> dict[str, Any]:
        damages = [{"zone": declared_zone, "severity": "moderate"}] if declared_zone else []
        return {"qr_visible": bool(board_qr), "board_read": board_qr or None, "zones": ZONES,
                "damages": damages, "confidence": 0.9 if board_qr else 0.3,
                "engine": self.name, "image_bytes": len(image)}
