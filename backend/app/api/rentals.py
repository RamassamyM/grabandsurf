"""Arm a rental from a rack, follow it live, return it by QR when the beacon is silent."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import current_customer, get_db, get_services, get_settings
from ..domain import fleet
from ..domain.packs import minutes_left
from ..models import Board, CardHold, Customer, PackCode, Rental, Station
from ..schemas import ManualReturn, RentalRequest
from ..services import Services
from ..settings import Settings
from ..workflows import (available_boards, clock, close_rental, record_chain, rental_view,
                         resolve_alerts)

router = APIRouter(prefix="/api/rentals")
OPEN = ("armed", "active", "not_returned")


@router.post("")
def arm_rental(body: RentalRequest, customer: Customer = Depends(current_customer),
               db: Session = Depends(get_db), services: Services = Depends(get_services),
               settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Arm a rental: the next board leaving this rack starts the meter."""
    station = db.get(Station, body.station.strip().upper())
    if station is None:
        raise HTTPException(404, "Station inconnue.")
    if customer.card_hold_status != "authorized":
        raise HTTPException(400, "Ajoute d'abord une carte pour l'empreinte de caution.")
    if db.scalar(select(Rental.id).where(Rental.customer_id == customer.id, Rental.status.in_(OPEN))):
        raise HTTPException(400, "Tu as déjà une location en cours.")
    code = None
    if body.pack_code and body.pack_code.strip():
        code = db.scalar(select(PackCode).where(PackCode.code == body.pack_code.strip().upper()))
        if code is None:
            raise HTTPException(400, "Code pack inconnu.")
        if minutes_left(code.minutes_quota, code.minutes_used) <= 0:
            raise HTTPException(400, "Ce code pack est épuisé.")
    boards = available_boards(db, station.id)
    if not boards:
        raise HTTPException(409, "Plus de planche libre à cette station. Essaie une station voisine.")
    now = clock(db)
    rental = Rental(customer_id=customer.id, start_station=station.id, suggested_board_id=boards[0],
                    armed_t=now, status="armed", pack_code_id=code.id if code else None)
    db.add(rental)
    db.flush()
    deposit = settings.config["pricing"]["deposit_hold_cents"]
    services.payment.authorize(customer.id, deposit)
    db.add(CardHold(customer_id=customer.id, rental_id=rental.id, amount_cents=deposit))
    return rental_view(db, rental, settings.config, now)


@router.get("/current")
def current_rental(customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
                   settings: Settings = Depends(get_settings)) -> dict[str, Any] | None:
    r = db.scalars(select(Rental).where(Rental.customer_id == customer.id)
                   .order_by(Rental.id.desc())).first()
    return rental_view(db, r, settings.config, clock(db)) if r else None


@router.get("/{rental_id}")
def get_rental(rental_id: int, customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
               settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    r = db.get(Rental, rental_id)
    if r is None or r.customer_id != customer.id:
        raise HTTPException(404, "Location introuvable.")
    return rental_view(db, r, settings.config, clock(db))


@router.post("/{rental_id}/cancel")
def cancel_rental(rental_id: int, customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
                  settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    r = db.get(Rental, rental_id)
    if r is None or r.customer_id != customer.id:
        raise HTTPException(404, "Location introuvable.")
    if r.status != "armed":
        raise HTTPException(400, "La planche est déjà partie : raccroche-la pour terminer.")
    r.status = "cancelled"
    hold = db.scalar(select(CardHold).where(CardHold.rental_id == r.id))
    if hold:
        hold.status = "released"
    return rental_view(db, r, settings.config, clock(db))


@router.post("/{rental_id}/manual-return")
def manual_return(rental_id: int, body: ManualReturn, customer: Customer = Depends(current_customer),
                  db: Session = Depends(get_db), services: Services = Depends(get_services),
                  settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Backup return: rack QR + board QR prove the board is back. Never billed past this return."""
    r = db.get(Rental, rental_id)
    if r is None or r.customer_id != customer.id:
        raise HTTPException(404, "Location introuvable.")
    if r.status not in ("active", "not_returned"):
        raise HTTPException(400, "Cette location n'est pas en cours.")
    if body.board_qr.strip().lower() != (r.board_id or "").lower():
        raise HTTPException(400, "Ce QR n'est pas celui de ta planche %s." % r.board_id)
    station = db.get(Station, body.rack_station.strip().upper())
    if station is None:
        raise HTTPException(404, "Station inconnue.")
    now = clock(db)
    board = db.get(Board, r.board_id)
    event = "RETOUR" if station.id == board.home_station else "ETRANGERE"
    board.status = fleet.status_after_return(event, board.home_station, station.id)
    board.current_station, board.status_t = station.id, now
    resolve_alerts(db, board.id, ("not_returned",))
    close_rental(db, services, settings.config, r, station.id, now, "manual")
    record_chain(db, board.id, event, station.id, now, r.id)
    return rental_view(db, r, settings.config, now)
