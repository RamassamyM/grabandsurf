"""Operator inspection: validate returned sessions, free deposits or withhold a repair fee."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings, require_operator
from ..domain import repairs, return_photos
from ..domain.fleet import format_duration
from ..models import Board, CardHold, DamageReport, Inspection, Photo, Rental
from ..schemas import RoleRequest, WithholdRequest
from ..services import Services
from ..settings import Settings
from ..workflows import clock, has_return_photo, return_shots, open_damage_reports, phone_of, release_deposit, withhold_repair
from .fleet import mask_phone
from .photos import fee_grid, photo_view

router = APIRouter(prefix="/api", dependencies=[Depends(require_operator)])

DEPOSIT_LABELS = {"held": "en cours de location", "pending_check": "à vérifier", "released": "libérée",
                  "charged": "forfait retenu", "bought": "achat implicite"}


def session_view(db: Session, r: Rental, settings: Settings, now: float) -> dict[str, Any]:
    hold = db.scalar(select(CardHold).where(CardHold.rental_id == r.id))
    photos = db.scalars(select(Photo).where(Photo.rental_id == r.id).order_by(Photo.id.desc())).all()
    reports = db.scalars(select(DamageReport).where(DamageReport.rental_id == r.id).order_by(DamageReport.id)).all()
    return {
        "id": r.id, "board_id": r.board_id, "customer": mask_phone(phone_of(db, r.customer_id)),
        "start_station": r.start_station, "end_station": r.end_station, "end_t": r.end_t,
        "duration_label": format_duration((r.end_t or now) - (r.start_t or now)),
        "return_mode": r.return_mode, "charged_cents": r.charged_cents,
        "deposit_status": r.deposit_status, "deposit_label": DEPOSIT_LABELS.get(r.deposit_status, r.deposit_status),
        "deposit_left_cents": (hold.amount_cents - hold.captured_cents) if hold and hold.status == "authorized" else 0,
        "photo_missing": not has_return_photo(db, r),
        "photos_missing": return_photos.missing_shots(return_shots(db, r)),
        "auto_release_in": format_duration(max(0, r.deposit_due_t - now))
        if r.deposit_due_t and r.deposit_status == "pending_check" and has_return_photo(db, r) else None,
        "checked_role": r.checked_role,
        "photos": [photo_view(db, p, settings) for p in photos],
        "damage_reports": [{"id": d.id, "zone": d.zone, "severity": d.severity, "status": d.status,
                            "source": d.source, "description": d.description,
                            "suggested_fee_cents": d.suggested_fee_cents, "fee_cents": d.fee_cents,
                            "charged": d.charged, "reviewer_role": d.reviewer_role} for d in reports],
    }


@router.get("/inspections")
def inspections(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Sessions whose deposit waits for a check, then the latest checked ones."""
    now = clock(db)
    pending = db.scalars(select(Rental).where(Rental.deposit_status == "pending_check")
                         .order_by(Rental.end_t.desc())).all()
    done = db.scalars(select(Rental).where(Rental.deposit_status.in_(("released", "charged", "bought")))
                      .order_by(Rental.id.desc()).limit(10)).all()
    return {"pending": [session_view(db, r, settings, now) for r in pending],
            "checked": [session_view(db, r, settings, now) for r in done],
            "repair_zones": [{"zone": z, "fee_cents": f} for z, f in sorted(fee_grid(db).items())],
            "severity_percent": settings.config["repairs"]["severity_percent"]}


def _pending_rental(db: Session, rental_id: int) -> Rental:
    rental = db.get(Rental, rental_id)
    if rental is None:
        raise HTTPException(404, "Location introuvable.")
    if rental.deposit_status != "pending_check":
        raise HTTPException(400, "Cette caution a déjà été traitée.")
    return rental


@router.post("/rentals/{rental_id}/release-deposit")
def validate_session(rental_id: int, body: RoleRequest, db: Session = Depends(get_db),
                     services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """State checked and fine: the rest of the deposit is freed."""
    rental = _pending_rental(db, rental_id)
    if open_damage_reports(db, rental):
        raise HTTPException(400, "Une casse est à valider ou refuser d'abord pour cette location.")
    now = clock(db)
    release_deposit(db, services, rental, body.role, now)
    return session_view(db, rental, settings, now)


@router.post("/rentals/{rental_id}/withhold")
def withhold(rental_id: int, body: WithholdRequest, db: Session = Depends(get_db),
             services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Damage found at inspection: record it, withhold the fee from the deposit, free the rest."""
    rental = _pending_rental(db, rental_id)
    now = clock(db)
    zone = repairs.normalize_zone(body.zone, fee_grid(db))
    suggested = repairs.fee_cents(zone, body.severity, fee_grid(db), settings.config["repairs"]["severity_percent"])
    fee = suggested if body.fee_cents is None else body.fee_cents
    for other in db.scalars(select(DamageReport).where(DamageReport.rental_id == rental.id,
                                                       DamageReport.status == "to_review")):
        other.status, other.reviewer_role = "confirmed", body.role
    report = DamageReport(board_id=rental.board_id, rental_id=rental.id, zone=zone, severity=body.severity,
                          description=body.description, source="inspection", status="confirmed",
                          suggested_fee_cents=suggested, fee_cents=fee, reviewer_role=body.role, t=now)
    db.add(report)
    report.charged = withhold_repair(db, services, rental, fee, zone, body.role, now) > 0
    board = db.get(Board, rental.board_id)
    to_workshop = body.send_to_workshop if body.send_to_workshop is not None else body.severity != "minor"
    if to_workshop and board.status in ("at_rack", "away_from_home"):
        board.status, board.status_t = "workshop", now
    board.needs_review = False
    db.add(Inspection(board_id=board.id, kind="damage_confirmed", role=body.role, t=now))
    db.flush()
    return session_view(db, rental, settings, now)
