"""Return photo diagnosis: Claude vision when an API key is configured, a simulated answer otherwise.

The QR code is decoded on the phone (jsQR) and sent as board_qr; the model looks for damage
and reads the painted board number as a cross-check. The demo never depends on the network:
any error falls back to the simulated diagnosis, clearly labelled.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, Optional

log = logging.getLogger(__name__)

EM_DASH = "\u2014"
ZONES = ["nose", "tail", "rail", "fin", "deck", "other"]

DIAGNOSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "board_visible": {"type": "boolean"},
        "painted_number": {"type": "string"},
        "overall_condition": {"type": "string", "enum": ["good", "worn", "damaged", "unclear"]},
        "damages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "zone": {"type": "string", "enum": ZONES},
                    "severity": {"type": "string", "enum": ["minor", "moderate", "severe"]},
                    "description": {"type": "string"},
                },
                "required": ["zone", "severity", "description"],
                "additionalProperties": False,
            },
        },
        "confidence": {"type": "number"},
        "summary": {"type": "string"},
    },
    "required": ["board_visible", "painted_number", "overall_condition", "damages", "confidence", "summary"],
    "additionalProperties": False,
}

PROMPT = """You inspect return photos of cork surfboards for a self-service rental on the beach.
The customer just hung the board back on the rack and took this photo.

Report only what you can actually see:
- board_visible: is a surfboard clearly visible?
- painted_number: the board number painted on it (like "korko-03" or "03"), or "" if not readable.
- damages: each visible damage with its zone (nose = front tip, tail = back end, rail = side edge,
  fin, deck = top surface, other), severity (minor = cosmetic scratch or small chip; moderate = crack,
  missing cork, loose fin; severe = broken fin, snapped or holed board, water may get in) and a short
  description in French. Normal wear, sand, water drops and reflections are not damage.
- overall_condition: good, worn, damaged, or unclear if the photo does not show the board well.
- confidence: between 0 and 1.
- summary: one short sentence in French for the operator, without any em dash.
When unsure, say so with a lower confidence rather than inventing damage."""


def _base_result(board_qr: Optional[str]) -> dict[str, Any]:
    return {"qr_visible": bool(board_qr), "board_read": board_qr or None}


def detect_media_type(image: bytes) -> str:
    if image.startswith(b"\x89PNG"):
        return "image/png"
    if image[:4] == b"RIFF" and image[8:12] == b"WEBP":
        return "image/webp"
    if image[:3] == b"GIF":
        return "image/gif"
    return "image/jpeg"


class FakePhotoAI:
    """Simulated diagnosis: damage only if the customer declared one."""

    name = "simulation"

    def analyze(self, image: bytes, board_qr: Optional[str], declared_zone: Optional[str]) -> dict[str, Any]:
        damages = [{"zone": declared_zone, "severity": "moderate",
                    "description": "Dommage signalé par le client (diagnostic simulé)."}] if declared_zone else []
        return dict(_base_result(board_qr), engine=self.name, board_visible=bool(image),
                    painted_number="", overall_condition="damaged" if damages else "good",
                    damages=damages, confidence=0.9 if board_qr else 0.3,
                    summary="Diagnostic simulé : aucune IA n'a regardé la photo.")


class ClaudePhotoAI:
    """Claude vision with structured output; falls back to the simulation on any error."""

    name = "claude"

    def __init__(self, model: str, max_tokens: int, client: Any = None) -> None:
        import anthropic
        self.model, self.max_tokens = model, max_tokens
        self.client = client or anthropic.Anthropic(max_retries=1, timeout=60.0)
        self.fallback = FakePhotoAI()

    def analyze(self, image: bytes, board_qr: Optional[str], declared_zone: Optional[str]) -> dict[str, Any]:
        if not image:
            return self.fallback.analyze(image, board_qr, declared_zone)
        try:
            data = self._ask(image, declared_zone)
        except Exception as e:  # network, quota, refusal: the rental never waits on the AI
            log.warning("photo AI unavailable, simulated diagnosis used: %s", e)
            result = self.fallback.analyze(image, board_qr, declared_zone)
            result["summary"] = "IA indisponible, diagnostic simulé. Vérification à l'oeil conseillée."
            return result
        return dict(_base_result(board_qr), engine=self.name, **data)

    def _ask(self, image: bytes, declared_zone: Optional[str]) -> dict[str, Any]:
        text = PROMPT
        if declared_zone:
            text += "\nThe customer says the %s zone is damaged: check it carefully." % declared_zone
        response = self.client.beta.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"format": {"type": "json_schema", "schema": DIAGNOSIS_SCHEMA}},
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": detect_media_type(image),
                                             "data": base64.standard_b64encode(image).decode("ascii")}},
                {"type": "text", "text": text},
            ]}],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("request declined by the model")
        if response.stop_reason == "max_tokens":
            raise RuntimeError("diagnosis truncated")
        raw = next(b.text for b in response.content if b.type == "text")
        data = json.loads(raw)
        data["confidence"] = max(0.0, min(1.0, float(data.get("confidence", 0))))
        data["summary"] = data.get("summary", "").replace(EM_DASH, ",")
        return data


def build_photo_ai(mode: str, env: dict[str, str], config: dict[str, Any]) -> Any:
    """PHOTO_AI=claude|fake|auto (auto: Claude when ANTHROPIC_API_KEY is set)."""
    mode = (mode or "auto").lower()
    wants_claude = mode == "claude" or (mode == "auto" and env.get("ANTHROPIC_API_KEY"))
    if not wants_claude:
        return FakePhotoAI()
    try:
        return ClaudePhotoAI(config["photo_ai"]["model"], config["photo_ai"]["max_tokens"])
    except Exception as e:  # SDK missing or no credentials
        log.warning("photo AI in simulation mode: %s", e)
        return FakePhotoAI()
