"""Owner (Notox) settings: repair price grid and the QR codes to print."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_settings, require_operator
from ..models import Board, RepairFee, Station
from ..settings import Settings

router = APIRouter(prefix="/api", dependencies=[Depends(require_operator)])


class RepairFeeUpdate(BaseModel):
    zone: str = Field(min_length=2, max_length=24)
    label: str = Field(min_length=2, max_length=48)
    fee_cents: int = Field(ge=0, le=100000)


def fee_grid(db: Session) -> dict[str, int]:
    return {f.zone: f.fee_cents for f in db.scalars(select(RepairFee))}


@router.get("/repair-fees")
def list_repair_fees(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    fees = db.scalars(select(RepairFee).order_by(RepairFee.zone)).all()
    return {"zones": [{"zone": f.zone, "label": f.label, "fee_cents": f.fee_cents} for f in fees],
            "severity_percent": settings.config["repairs"]["severity_percent"]}


@router.put("/repair-fees")
def update_repair_fees(body: list[RepairFeeUpdate], db: Session = Depends(get_db),
                       settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Save the grid; 'other' must stay, it is the fallback zone."""
    zones = {row.zone.strip().lower() for row in body}
    if "other" not in zones:
        raise HTTPException(400, "La zone « other » (Autre) est obligatoire : elle sert de zone par défaut.")
    for row in body:
        zone = row.zone.strip().lower()
        fee = db.get(RepairFee, zone)
        if fee is None:
            db.add(RepairFee(zone=zone, label=row.label.strip(), fee_cents=row.fee_cents))
        else:
            fee.label, fee.fee_cents = row.label.strip(), row.fee_cents
    for fee in db.scalars(select(RepairFee)):
        if fee.zone not in zones:
            db.delete(fee)
    db.flush()
    return list_repair_fees(db, settings)


@router.get("/qr-codes")
def qr_codes(db: Session = Depends(get_db)) -> dict[str, Any]:
    """What to print: one QR per rack (rent) and one per board (passport, return, damage)."""
    return {
        "racks": [{"id": s.id, "label": "Rack %s · %s" % (s.id, s.name), "path": "/s/%s" % s.id}
                  for s in db.scalars(select(Station).order_by(Station.id))],
        "boards": [{"id": b.id, "label": b.id, "home_station": b.home_station, "path": "/p/%s" % b.id}
                   for b in db.scalars(select(Board).order_by(Board.id))],
    }
