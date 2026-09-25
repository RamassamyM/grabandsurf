"""Station protocol (kit, unchanged): POST /evenements. Plus station status for the pages."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings
from ..domain import fleet
from ..models import Station
from ..services import Services
from ..settings import Settings
from ..workflows import available_boards, clock, process_event

router = APIRouter()
log = logging.getLogger(__name__)


@router.post("/evenements")
async def station_events(request: Request, db: Session = Depends(get_db),
                         services: Services = Depends(get_services),
                         settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """One JSON event, or several lines of JSON. Always 200 so the station journal never jams."""
    body = (await request.body()).decode("utf-8", errors="replace").strip()
    processed, duplicates, alarm, errors = 0, 0, [], []
    lines = body.splitlines() if body else []
    if body.startswith("["):
        try:
            lines = [json.dumps(x) for x in json.loads(body)]
        except ValueError:
            pass
    for line in lines:
        if not line.strip():
            continue
        try:
            ev = fleet.parse_event(json.loads(line))
        except (ValueError, fleet.InvalidEvent) as e:
            errors.append(str(e))
            log.warning("unreadable station event: %s", e)
            continue
        result = process_event(db, services, settings.config, ev)
        processed += 1
        duplicates += int(result["duplicate"])
        alarm.extend(result["alarm"])
    out: dict[str, Any] = {"ok": True, "processed": processed, "duplicates": duplicates}
    if errors:
        out["errors"] = errors
    if alarm:
        out["alarm"] = alarm
    return out


def station_view(db: Session, s: Station, settings: Settings) -> dict[str, Any]:
    now = clock(db)
    return {"id": s.id, "name": s.name, "last_seen_t": s.last_seen_t,
            "online": fleet.station_online(s.last_seen_t, now, settings.config),
            "available_boards": available_boards(db, s.id),
            "operator_phone": settings.config["demo"]["operator_phone"]}


@router.get("/api/stations")
def list_stations(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    return [station_view(db, s, settings) for s in db.scalars(select(Station).order_by(Station.id))]


@router.get("/api/stations/{station_id}")
def get_station(station_id: str, db: Session = Depends(get_db),
                settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    s = db.get(Station, station_id.upper())
    if s is None:
        raise HTTPException(404, "Station inconnue.")
    return station_view(db, s, settings)


@router.get("/api/clock")
def get_clock(db: Session = Depends(get_db)) -> dict[str, float]:
    return {"t": clock(db)}
