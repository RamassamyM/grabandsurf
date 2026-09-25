"""The operator's missions of the day, each explained in one sentence. Pure."""

from __future__ import annotations

from typing import Any, Iterable

from .fleet import format_duration

MAX_MISSIONS = 3


def missions(boards: list[dict[str, Any]], damage_reports: Iterable[dict[str, Any]],
             offline_stations: Iterable[str], now_t: float, config: dict[str, Any]) -> list[str]:
    """Up to 3 missions, most urgent first."""
    names = {k: v.get("name", k) for k, v in config.get("stations", {}).items()}
    out: list[str] = []

    for b in boards:
        if b["status"] == "unauthorized":
            out.append("Vérifier %s à la station %s : sortie sans location il y a %s (vol ou balise muette)."
                       % (b["id"], b["home_station"], format_duration(now_t - b["status_t"])))
    for b in boards:
        if b["status"] == "not_returned":
            out.append("Chercher %s : non rendue depuis %s, confirmer la perte après vérification du rack."
                       % (b["id"], format_duration(now_t - b["status_t"])))
    for d in damage_reports:
        if d["status"] == "to_review":
            out.append("Inspecter %s : casse signalée (%s), valider ou refuser le diagnostic."
                       % (d["board_id"], d["zone"]))
    for s in offline_stations:
        out.append("Passer à la station %s (%s) : plus de signal, vérifier la batterie du Pi."
                   % (s, names.get(s, s)))
    for b in boards:
        if b["status"] == "away_from_home" and b["current_station"]:
            out.append("Rapatrier %s de %s vers %s : elle y a été rendue par un client."
                       % (b["id"], b["current_station"], b["home_station"]))

    if len(out) < MAX_MISSIONS:
        used = sorted((b for b in boards if b["status"] == "at_rack"),
                      key=lambda b: (-b["rentals_count"], b["id"]))
        if used and used[0]["rentals_count"] > 0:
            b = used[0]
            out.append("Faire tourner %s à la station %s : la plus utilisée du parc (%d sorties)."
                       % (b["id"], b["current_station"], b["rentals_count"]))
    if not out:
        out.append("Faire la tournée des racks : rien à signaler, vérifier l'état des planches.")
    return out[:MAX_MISSIONS]
