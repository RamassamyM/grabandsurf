"""Return photo (1 € in the wallet, AI diagnosis, repair suggestion) and damage reports reviewed by the operator."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import current_customer, get_db, get_services, get_settings, require_operator
from ..domain import repairs, return_photos, wallet
from ..domain.pricing import format_eur
from ..i18n import t
from ..models import Alert, Board, ChainTx, Customer, DamageReport, Inspection, Photo, Rental, RepairFee
from ..schemas import DamageReportRequest, PhotoUpload, ReviewRequest
from ..services import Services
from ..settings import Settings
from ..workflows import board_dict, clock, credit, raise_alert, record_chain, return_shots, station_slots, withhold_repair

router = APIRouter(prefix="/api")


def fee_grid(db: Session) -> dict[str, int]:
    return {f.zone: f.fee_cents for f in db.scalars(select(RepairFee))}


def suggestion_for(db: Session, damages: list[dict[str, Any]], settings: Settings) -> dict[str, Any]:
    return repairs.suggest(damages, fee_grid(db), settings.config["repairs"]["severity_percent"])


def open_report(db: Session, board: Board, zone: str, severity: str, description: str, source: str,
                rental_id: Optional[int], photo_id: Optional[int], suggested_fee: int, now: float) -> DamageReport:
    """A damage waits for the operator; the board leaves the suggestions meanwhile."""
    report = DamageReport(board_id=board.id, rental_id=rental_id, zone=zone, severity=severity,
                          description=description[:255], source=source, photo_id=photo_id,
                          suggested_fee_cents=suggested_fee, t=now)
    db.add(report)
    board.needs_review = True
    origin = "IA photo" if source == "photo_ai" else "client"
    raise_alert(db, "damage", "Casse signalée sur %s (%s, %s, source %s) : diagnostic à valider."
                % (board.id, zone, repairs.SEVERITY_LABELS.get(severity, severity), origin),
                now, board.id, board.current_station)
    db.flush()
    return report


def photo_view(db: Session, photo: Photo, settings: Settings) -> dict[str, Any]:
    result = json.loads(photo.ai_result or "{}")
    reports = db.scalars(select(DamageReport).where(DamageReport.photo_id == photo.id)).all()
    return {"id": photo.id, "rental_id": photo.rental_id, "board_id": photo.board_id, "t": photo.t,
            "sha256": photo.sha256, "signature": photo.signature, "signer": photo.signer, "has_image": bool(photo.path), "rewarded": photo.rewarded,
            "ai_result": result, "suggestion": suggestion_for(db, result.get("damages", []), settings),
            "damage_reports": [{"id": r.id, "status": r.status, "zone": r.zone, "severity": r.severity}
                               for r in reports]}


@router.post("/photos")
def upload_photo(body: PhotoUpload, customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
                 services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """One of the 6 return shots. The 1 € and the deposit wait for all of them; each QR must be the expected one."""
    lang = customer.lang
    rental = db.get(Rental, body.rental_id)
    if rental is None or rental.customer_id != customer.id or not rental.board_id:
        raise HTTPException(404, t("rental_not_found", lang))
    shot = body.shot or "board_qr"  # clients before the 6 shots only sent the board QR
    qr = (body.qr or body.board_qr or "").strip() or None
    error = return_photos.check_shot(shot, qr, rental.board_id, rental.end_station,
                                     station_slots(settings.config, rental.end_station))
    if error:
        raise HTTPException(400, t(error, lang, board=rental.board_id, station=rental.end_station or ""))
    try:
        image = base64.b64decode(body.image_base64.split(",", 1)[-1] or b"", validate=False)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(400, t("image_unreadable", lang)) from e
    digest = hashlib.sha256(image).hexdigest()
    path = ""
    if image:
        folder = settings.data_dir / "photos"
        folder.mkdir(parents=True, exist_ok=True)
        path = str(folder / ("%s.img" % digest))
        with open(path, "wb") as f:
            f.write(image)
    if shot in return_photos.BOARD_SIDE_SHOTS:
        result = services.photo_ai.analyze(image, rental.board_id, body.damage_zone)
    else:  # a QR shot: checked above, nothing for the AI to diagnose
        result = {"engine": "qr", "qr_visible": True, "board_read": rental.board_id, "qr_read": qr.upper() if shot != "board_qr" else qr.lower(),
                  "overall_condition": "good", "damages": [], "confidence": 1.0,
                  "summary": "QR lu sur la photo : %s." % qr}
    result["shot"] = shot
    now = clock(db)
    photo = Photo(rental_id=rental.id, board_id=rental.board_id, sha256=digest, path=path,
                  ai_result=json.dumps(result, ensure_ascii=False), rewarded=False, t=now)
    db.add(photo)
    db.flush()
    missing = return_photos.missing_shots(return_shots(db, rental))
    already = db.scalar(select(Photo.id).where(Photo.rental_id == rental.id, Photo.rewarded.is_(True))) is not None
    cents = wallet.photo_reward_cents(rental.status, already, None if missing else rental.board_id,
                                      rental.board_id, settings.config)
    photo.rewarded = bool(cents)
    credit(db, customer.id, cents, "photo", now, rental.id)
    same_photo = db.scalar(select(ChainTx.id).where(ChainTx.board_id == rental.board_id,
                                                    ChainTx.event_type == "INSPECTION", ChainTx.proof == digest))
    if image and shot == "board_qr" and not same_photo:
        # the photo stays private; its fingerprint goes on-chain and is signed by the operator wallet
        signed = services.chain.sign(digest)
        if signed:
            photo.signature, photo.signer = signed["signature"], signed["signer"]
        record_chain(db, rental.board_id, "INSPECTION", rental.end_station or rental.start_station, now,
                     rental.id, proof=digest)

    suggestion = suggestion_for(db, result.get("damages", []), settings)
    report_ids = []
    board = db.get(Board, rental.board_id)
    if board:
        for action in suggestion["actions"]:
            source = "customer" if body.damage_zone and action["zone"] == body.damage_zone else "photo_ai"
            report_ids.append(open_report(db, board, action["zone"], action["severity"], action["description"],
                                          source, rental.id, photo.id, action["fee_cents"], now).id)
    if cents:
        message = t("photo_credited", lang, amount=format_eur(cents))
    elif missing:
        message = t("photo_shot_saved", lang, count=len(missing))
    elif already:
        message = t("photo_already", lang)
    else:
        message = t("photo_after_return", lang)
    return {"photo_id": photo.id, "shot": shot, "sha256": digest, "ai_result": result, "credited_cents": cents,
            "missing_shots": missing, "damage_detected": bool(report_ids), "damage_report_ids": report_ids,
            "message": message}


@router.get("/photos", dependencies=[Depends(require_operator)])
def list_photos(limit: int = 20, db: Session = Depends(get_db),
                settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    """Operator: latest return photos with the AI diagnosis and the repair suggestion."""
    photos = db.scalars(select(Photo).order_by(Photo.id.desc()).limit(max(1, min(limit, 100)))).all()
    return [photo_view(db, p, settings) for p in photos]


@router.get("/photos/{photo_id}/image", dependencies=[Depends(require_operator)])
def photo_image(photo_id: int, db: Session = Depends(get_db)) -> FileResponse:
    photo = db.get(Photo, photo_id)
    if photo is None or not photo.path:
        raise HTTPException(404, "Photo introuvable.")
    with open(photo.path, "rb") as f:
        head = f.read(16)
    from ..services.photo_ai import detect_media_type
    return FileResponse(photo.path, media_type=detect_media_type(head))


@router.post("/damage-reports")
def report_damage(body: DamageReportRequest, customer: Customer = Depends(current_customer),
                  db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    board = db.get(Board, body.board_id.strip().lower())
    if board is None:
        raise HTTPException(404, t("board_unknown", customer.lang))
    rental = db.scalars(select(Rental).where(Rental.customer_id == customer.id, Rental.board_id == board.id)
                        .order_by(Rental.id.desc())).first()
    zone = repairs.normalize_zone(body.zone, fee_grid(db))
    fee = suggestion_for(db, [{"zone": zone, "severity": "moderate"}], settings)["total_fee_cents"]
    report = open_report(db, board, zone, "moderate", "", "customer", rental.id if rental else None,
                         body.photo_id, fee, clock(db))
    return {"id": report.id, "status": report.status, "board": board_dict(board),
            "message": t("damage_thanks", customer.lang)}


@router.post("/damage-reports/{report_id}/review", dependencies=[Depends(require_operator)])
def review_damage(report_id: int, body: ReviewRequest, db: Session = Depends(get_db),
                  services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """The AI proposes, the operator decides (fee and whether to withhold it). Only the reviewer's role is stored."""
    report = db.get(DamageReport, report_id)
    if report is None:
        raise HTTPException(404, "Signalement introuvable.")
    if report.status != "to_review":
        raise HTTPException(400, "Signalement déjà traité.")
    board = db.get(Board, report.board_id)
    now = clock(db)
    report.reviewer_role = body.role
    withheld = 0
    if body.decision == "confirm":
        report.status = "confirmed"
        report.fee_cents = report.suggested_fee_cents if body.fee_cents is None else body.fee_cents
        rental = db.get(Rental, report.rental_id) if report.rental_id else None
        if body.charge and rental and report.fee_cents:
            withheld = withhold_repair(db, services, rental, report.fee_cents, report.zone, body.role, now)
            report.charged = withheld > 0
        if (body.send_to_workshop if body.send_to_workshop is not None else report.severity != "minor") \
                and board.status in ("at_rack", "away_from_home"):
            board.status, board.status_t = "workshop", now
    else:
        report.status = "rejected"
    board.needs_review = db.scalar(select(DamageReport.id).where(
        DamageReport.board_id == board.id, DamageReport.status == "to_review", DamageReport.id != report.id)) is not None
    if not board.needs_review:
        for alert in db.scalars(select(Alert).where(Alert.kind == "damage", Alert.board_id == board.id,
                                                    Alert.resolved.is_(False))):
            alert.resolved = True
    kind = "damage_confirmed" if body.decision == "confirm" else "damage_rejected"
    db.add(Inspection(board_id=board.id, kind=kind, role=body.role, t=now))
    return {"id": report.id, "status": report.status, "fee_cents": report.fee_cents, "withheld_cents": withheld,
            "board": board_dict(board)}
