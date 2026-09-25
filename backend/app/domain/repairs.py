"""Repair suggestions from a photo diagnosis. Pure: fees come from the grid passed in."""

from __future__ import annotations

from typing import Any, Iterable

SEVERITIES = ("minor", "moderate", "severe")
SEVERITY_LABELS = {"minor": "légère", "moderate": "moyenne", "severe": "grave"}

# What the workshop does, per zone and severity (displayed to the operator).
ACTIONS = {
    "fin": {"minor": "Resserrer et contrôler l'aileron", "moderate": "Recoller la boîte d'aileron",
            "severe": "Remplacer l'aileron et sa boîte"},
    "nose": {"minor": "Poncer et reboucher le liège du nose", "moderate": "Reconstruire le nose en liège",
             "severe": "Reconstruire le nose et reprendre la stratification"},
    "tail": {"minor": "Poncer et reboucher le tail", "moderate": "Reconstruire le tail",
             "severe": "Reconstruire le tail et reprendre la stratification"},
    "rail": {"minor": "Reboucher l'éclat du rail", "moderate": "Réparer le rail sur toute la longueur abîmée",
             "severe": "Reprendre le rail et vérifier l'étanchéité du pain"},
    "deck": {"minor": "Poncer le pont et refaire le grip", "moderate": "Reboucher le pont en liège",
             "severe": "Reprendre le pont et contrôler la rigidité"},
    "other": {"minor": "Contrôle visuel en atelier", "moderate": "Réparation en atelier",
              "severe": "Expertise complète en atelier"},
}


def normalize_zone(zone: str | None, zones: Iterable[str]) -> str:
    """Unknown zones fall back to 'other'."""
    zone = (zone or "").strip().lower()
    return zone if zone in set(zones) else "other"


def normalize_severity(severity: str | None) -> str:
    severity = (severity or "").strip().lower()
    return severity if severity in SEVERITIES else "moderate"


def fee_cents(zone: str, severity: str, fees: dict[str, int], severity_percent: dict[str, int]) -> int:
    """Grid fee for a zone, scaled by severity (minor 50 %, moderate 100 %, severe 150 % by default)."""
    base = fees.get(zone, fees.get("other", 0))
    return base * severity_percent.get(severity, 100) // 100


def suggest(damages: list[dict[str, Any]], fees: dict[str, int], severity_percent: dict[str, int]) -> dict[str, Any]:
    """Actions, fees and what to do with the board, for the operator to confirm or change."""
    actions = []
    for d in damages:
        zone = normalize_zone(d.get("zone"), fees)
        severity = normalize_severity(d.get("severity"))
        actions.append({
            "zone": zone, "severity": severity, "severity_label": SEVERITY_LABELS[severity],
            "action": ACTIONS.get(zone, ACTIONS["other"])[severity],
            "fee_cents": fee_cents(zone, severity, fees, severity_percent),
            "description": (d.get("description") or "")[:200],
        })
    if not actions:
        board_action, sentence = "keep", "Aucun dommage visible : la planche reste en service."
    elif any(a["severity"] == "severe" for a in actions):
        board_action, sentence = "workshop", "Dommage grave : sortir la planche du rack et l'envoyer à l'atelier."
    elif any(a["severity"] == "moderate" for a in actions):
        board_action, sentence = "workshop", "Dommage moyen : réparation en atelier avant la prochaine location."
    else:
        board_action, sentence = "keep", "Dommage léger : réparer lors de la prochaine tournée, la planche reste louable."
    return {"actions": actions, "total_fee_cents": sum(a["fee_cents"] for a in actions),
            "board_action": board_action, "sentence": sentence}
