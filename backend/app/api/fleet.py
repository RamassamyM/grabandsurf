"""Operator dashboard: boards, stations, alerts, 3 missions, revenue, chain, operator decisions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings, require_operator
from ..domain import fleet, missions, pricing
from ..domain.pricing import format_eur
from ..models import Alert, Board, CardHold, ChainTx, DamageReport, Inspection, Rental, Station
from ..schemas import CorrectionRequest, RoleRequest
from ..services import Services
from ..settings import Settings
from ..workflows import board_dict, clock, phone_of, record_chain, resolve_alerts, sms_to

router = APIRouter(prefix="/api", dependencies=[Depends(require_operator)])


def mask_phone(phone: str) -> str:
    return phone[:4] + " ** ** " + phone[-4:-2] + " " + phone[-2:] if len(phone) > 8 else "****"


def _missions(db: Session, settings: Settings, now: float) -> list[str]:
    boards = [board_dict(b) for b in db.scalars(select(Board).order_by(Board.id))]
    damages = [{"board_id": d.board_id, "zone": d.zone, "status": d.status}
               for d in db.scalars(select(DamageReport).where(DamageReport.status == "to_review"))]
    offline = [s.id for s in db.scalars(select(Station).order_by(Station.id))
               if fleet.station_online(s.last_seen_t, now, settings.config) is False]
    return missions.missions(boards, damages, offline, now, settings.config)


@router.get("/fleet")
def fleet_view(db: Session = Depends(get_db), services: Services = Depends(get_services),
               settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    now = clock(db)
    boards = []
    for b in db.scalars(select(Board).order_by(Board.id)):
        view = board_dict(b)
        r = db.scalars(select(Rental).where(Rental.board_id == b.id, Rental.status.in_(("active", "not_returned")))).first()
        view["rental"] = ({"id": r.id, "customer": mask_phone(phone_of(db, r.customer_id)),
                           "duration_s": now - (r.start_t or now), "status": r.status} if r else None)
        view["since_label"] = fleet.format_duration(now - b.status_t)
        boards.append(view)
    stations = [{"id": s.id, "name": s.name, "last_seen_t": s.last_seen_t,
                 "online": fleet.station_online(s.last_seen_t, now, settings.config)}
                for s in db.scalars(select(Station).order_by(Station.id))]
    alerts = [{"id": a.id, "kind": a.kind, "board_id": a.board_id, "station": a.station,
               "message": a.message, "t": a.t}
              for a in db.scalars(select(Alert).where(Alert.resolved.is_(False)).order_by(Alert.id.desc()))]
    damages = [{"id": d.id, "board_id": d.board_id, "zone": d.zone, "severity": d.severity, "status": d.status,
                "photo_id": d.photo_id, "rental_id": d.rental_id, "source": d.source, "description": d.description,
                "suggested_fee_cents": d.suggested_fee_cents, "fee_cents": d.fee_cents}
               for d in db.scalars(select(DamageReport).where(DamageReport.status == "to_review"))]
    revenue = db.scalar(select(func.coalesce(func.sum(CardHold.captured_cents), 0))) or 0
    rentals = db.scalars(select(Rental).where(Rental.status.in_(("returned", "bought")))
                         .order_by(Rental.id.desc()).limit(15)).all()
    txs = db.scalars(select(ChainTx).order_by(ChainTx.id.desc()).limit(12)).all()
    return {
        "now_t": now, "boards": boards, "stations": stations, "alerts": alerts, "damage_reports": damages,
        "missions": _missions(db, settings, now),
        "deposits_to_check": db.scalar(select(func.count(Rental.id)).where(Rental.deposit_status == "pending_check")),
        "revenue_cents": int(revenue), "revenue_label": format_eur(int(revenue)),
        "rentals": [{"id": r.id, "board_id": r.board_id, "status": r.status,
                     "duration_s": (r.end_t or now) - (r.start_t or now), "charged_cents": r.charged_cents,
                     "return_mode": r.return_mode} for r in rentals],
        "sms": {"mode": services.sms.mode, "label": services.sms.label, "reason": services.sms.reason},
        "chain": dict(services.chain.status(),
                      txs=[{"id": t.id, "board_id": t.board_id, "event_type": t.event_type, "station": t.station,
                            "t": t.t, "status": t.status, "tx_hash": t.tx_hash,
                            "url": services.chain.link("tx", t.tx_hash or "")} for t in txs]),
    }


@router.get("/missions")
def missions_view(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> list[str]:
    return _missions(db, settings, clock(db))


@router.get("/chain")
def chain_status(services: Services = Depends(get_services)) -> dict[str, Any]:
    return services.chain.status()


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "Alerte introuvable.")
    alert.resolved = True
    return {"ok": True}


@router.post("/boards/{board_id}/confirm-loss")
def confirm_loss(board_id: str, body: RoleRequest, db: Session = Depends(get_db),
                 services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Loss confirmed after checking the rack: implicit purchase, the hold is captured only now."""
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    if board.status not in ("not_returned", "unauthorized"):
        raise HTTPException(400, "Seule une planche non rendue ou sortie sans client peut être déclarée perdue.")
    now = clock(db)
    rental = db.scalars(select(Rental).where(Rental.board_id == board.id, Rental.status == "not_returned")).first()
    if rental:
        amount = pricing.implicit_purchase_cents(settings.config)
        hold = db.scalar(select(CardHold).where(CardHold.rental_id == rental.id))
        if hold:
            services.payment.capture("hold_%d" % hold.id, amount)
            hold.captured_cents, hold.status = amount, "captured"
        rental.status, rental.charged_cents, rental.end_t = "bought", amount, now
        rental.deposit_status, rental.checked_role = "bought", body.role
        board.status = "sold"
        from .claims import claim_token
        base = settings.env.get("PUBLIC_BASE_URL", "").rstrip("/")
        sms_to(db, services, rental.customer_id, "sms_bought", now, board=board.id, amount=format_eur(amount),
               link="%s/claim/%s" % (base, claim_token(settings, rental.id)))
    else:
        board.status = "lost"
    board.status_t, board.current_station = now, None
    resolve_alerts(db, board.id, ("theft", "not_returned"))
    db.add(Inspection(board_id=board.id, kind="loss_confirmed", role=body.role, t=now))
    record_chain(db, board.id, "PERDUE", board.home_station, now, rental.id if rental else None)
    return board_dict(board)


@router.post("/boards/{board_id}/corrections")
def correct_false_departure(board_id: str, body: CorrectionRequest, db: Session = Depends(get_db),
                            services: Services = Depends(get_services)) -> dict[str, Any]:
    """False departure (wet body in front of the beacon, board on the sand): corrected, never erased."""
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    if board.status != "unauthorized":
        raise HTTPException(400, "Seule une sortie sans client peut être corrigée ici.")
    target = db.scalars(select(ChainTx).where(ChainTx.board_id == board.id, ChainTx.event_type == "DEPART")
                        .order_by(ChainTx.id.desc())).first()
    if target is None:
        raise HTTPException(400, "Aucun départ à corriger.")
    now = clock(db)
    index = _chain_index(db, services, target)
    station = board.home_station if not board.current_station else board.current_station
    board.status, board.current_station, board.status_t = "at_rack", station, now
    board.rentals_count = max(0, board.rentals_count - 1)
    resolve_alerts(db, board.id, ("theft",))
    db.add(Inspection(board_id=board.id, kind="correction", role=body.role, t=now))
    record_chain(db, board.id, "CORRECTION", station, now, note=body.reason,
                 extra={"corrected_index": index, "reason": body.reason})
    return board_dict(board)


def _chain_index(db: Session, services: Services, target: ChainTx) -> int:
    """On-chain index of an event: from the history when available, else counted (mint is index 0)."""
    history = services.chain.board_history(target.board_id)
    if history and target.tx_hash:
        for ev in history["events"]:
            if ev["tx"].lower() == target.tx_hash.lower() and ev["type"] == target.event_type:
                return ev["index"]
    before = db.scalar(select(func.count(ChainTx.id)).where(
        ChainTx.board_id == target.board_id, ChainTx.id < target.id,
        ChainTx.status.in_(("sent", "pending")), ChainTx.event_type.notin_(("SPONSORING", "FIN_SPONSORING"))))
    return int(before or 0) + 1


@router.post("/boards/{board_id}/back-in-service")
def back_in_service(board_id: str, body: RoleRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Board repaired (or found): back on its home rack, a REPARATION entry goes on its log."""
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    if board.status in ("at_sea",):
        raise HTTPException(400, "Planche en mer : attendre son retour.")
    now = clock(db)
    was_workshop = board.status == "workshop"
    board.status, board.current_station, board.status_t, board.needs_review = "at_rack", board.home_station, now, False
    db.add(Inspection(board_id=board.id, kind="back_in_service", role=body.role, t=now))
    if was_workshop:
        record_chain(db, board.id, "REPARATION", board.home_station, now)
    return board_dict(board)


@router.post("/fleet/reset")
def reset_demo(db: Session = Depends(get_db), services: Services = Depends(get_services),
               settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Demo reset: boards back on their racks, data wiped. The blockchain keeps its history."""
    from backend.scripts.seed import seed
    seed(db, settings.config)
    services.alarm.rings.clear()
    return {"ok": True}
