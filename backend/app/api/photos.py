"""Return photo (1 € in the wallet) and damage reports reviewed by the operator."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import current_customer, get_db, get_services, get_settings, require_operator
from ..domain import wallet
from ..domain.pricing import format_eur
from ..models import Alert, Board, Customer, DamageReport, Inspection, Photo, Rental
from ..schemas import DamageReportRequest, PhotoUpload, ReviewRequest
from ..services import Services
from ..settings import Settings
from ..workflows import board_dict, clock, credit, raise_alert

router = APIRouter(prefix="/api")


def _open_report(db: Session, board: Board, zone: str, rental_id: int | None, photo_id: int | None,
                 now: float) -> DamageReport:
    report = DamageReport(board_id=board.id, rental_id=rental_id, zone=zone, photo_id=photo_id, t=now)
    db.add(report)
    board.needs_review = True
    raise_alert(db, "damage", "Casse signalée sur %s (%s) : diagnostic à valider." % (board.id, zone),
                now, board.id, board.current_station)
    db.flush()
    return report


@router.post("/photos")
def upload_photo(body: PhotoUpload, customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
                 services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Return photo: hash, fake AI diagnosis, 1 € once per rental if the right board QR is read."""
    rental = db.get(Rental, body.rental_id)
    if rental is None or rental.customer_id != customer.id:
        raise HTTPException(404, "Location introuvable.")
    try:
        image = base64.b64decode(body.image_base64.split(",", 1)[-1] or b"", validate=False)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(400, "Image illisible.") from e
    digest = hashlib.sha256(image).hexdigest()
    path = ""
    if image:
        folder = settings.data_dir / "photos"
        folder.mkdir(parents=True, exist_ok=True)
        path = str(folder / ("%s.jpg" % digest))
        with open(path, "wb") as f:
            f.write(image)
    qr = (body.board_qr or "").strip().lower() or None
    result = services.photo_ai.analyze(image, qr, body.damage_zone)
    now = clock(db)
    already = db.scalar(select(Photo.id).where(Photo.rental_id == rental.id, Photo.rewarded.is_(True))) is not None
    cents = wallet.photo_reward_cents(rental.status, already, result["board_read"], rental.board_id, settings.config)
    photo = Photo(rental_id=rental.id, board_id=rental.board_id or "", sha256=digest, path=path,
                  ai_result=json.dumps(result), rewarded=bool(cents), t=now)
    db.add(photo)
    db.flush()
    credit(db, customer.id, cents, "photo", now, rental.id)
    report_id = None
    board = db.get(Board, rental.board_id) if rental.board_id else None
    if board and result["damages"]:
        report_id = _open_report(db, board, result["damages"][0]["zone"], rental.id, photo.id, now).id
    if cents:
        message = "Merci ! %s ajouté à ta cagnotte." % format_eur(cents)
    elif already:
        message = "Photo enregistrée. La cagnotte est déjà créditée pour cette location."
    elif rental.status != "returned":
        message = "Photo enregistrée. Le crédit arrive une fois la planche raccrochée."
    else:
        message = "Photo enregistrée, mais le QR de %s n'est pas lisible : pas de crédit." % rental.board_id
    return {"photo_id": photo.id, "sha256": digest, "ai_result": result, "credited_cents": cents,
            "damage_report_id": report_id, "message": message}


@router.post("/damage-reports")
def report_damage(body: DamageReportRequest, customer: Customer = Depends(current_customer),
                  db: Session = Depends(get_db)) -> dict[str, Any]:
    board = db.get(Board, body.board_id.strip().lower())
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    rental = db.scalars(select(Rental).where(Rental.customer_id == customer.id, Rental.board_id == board.id)
                        .order_by(Rental.id.desc())).first()
    report = _open_report(db, board, body.zone, rental.id if rental else None, body.photo_id, clock(db))
    return {"id": report.id, "status": report.status, "board": board_dict(board)}


@router.post("/damage-reports/{report_id}/review", dependencies=[Depends(require_operator)])
def review_damage(report_id: int, body: ReviewRequest, db: Session = Depends(get_db),
                  settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """The AI proposes, the operator decides. Only the reviewer's role is stored."""
    report = db.get(DamageReport, report_id)
    if report is None:
        raise HTTPException(404, "Signalement introuvable.")
    if report.status != "to_review":
        raise HTTPException(400, "Signalement déjà traité.")
    board = db.get(Board, report.board_id)
    now = clock(db)
    report.reviewer_role = body.role
    if body.decision == "confirm":
        fees = settings.config["repair_fees_cents"]
        report.status, report.fee_cents = "confirmed", fees.get(report.zone, fees["other"])
        if board.status in ("at_rack", "away_from_home"):
            board.status, board.status_t = "workshop", now
    else:
        report.status = "rejected"
    board.needs_review = db.scalar(select(DamageReport.id).where(
        DamageReport.board_id == board.id, DamageReport.status == "to_review", DamageReport.id != report.id)) is not None
    for alert in db.scalars(select(Alert).where(Alert.kind == "damage", Alert.board_id == board.id,
                                                Alert.resolved.is_(False))):
        alert.resolved = True
    kind = "damage_confirmed" if body.decision == "confirm" else "damage_rejected"
    db.add(Inspection(board_id=board.id, kind=kind, role=body.role, t=now))
    return {"id": report.id, "status": report.status, "fee_cents": report.fee_cents, "board": board_dict(board)}
