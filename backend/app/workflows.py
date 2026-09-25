"""Orchestration shared by several routers: station events, closing a rental, wallet, chain rows.

Routers never call each other; what they share lives here. Business decisions come
from domain/, effects from services/, and the time is always the flow clock.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import advance_clock, get_clock
from .domain import fleet, pricing, wallet
from .domain.fleet import STATUS_LABELS, format_duration
from .domain.packs import minutes_left
from .domain.pricing import format_eur
from .models import (Alert, Board, CardHold, ChainTx, Customer, PackCode, Photo, Rental, Station,
                     StationEvent, WalletEntry)
from .services import Services


# ------------------------------------------------------------------ small helpers

def record_chain(db: Session, board_id: str, event_type: str, station: str, t: float,
                 rental_id: Optional[int] = None) -> ChainTx:
    """Add a chain_txs row; the event is published once the request is committed."""
    row = ChainTx(board_id=board_id, event_type=event_type, station=station or "", t=t,
                  rental_id=rental_id, status="pending")
    db.add(row)
    db.flush()
    db.info.setdefault("chain_pending", []).append((row.id, board_id, event_type, station, t))
    return row


def wallet_balance(db: Session, customer_id: int) -> int:
    total = db.scalar(select(func.coalesce(func.sum(WalletEntry.amount_cents), 0))
                      .where(WalletEntry.customer_id == customer_id))
    return int(total or 0)


def credit(db: Session, customer_id: int, cents: int, reason: str, t: float,
           rental_id: Optional[int] = None) -> None:
    if cents:
        db.add(WalletEntry(customer_id=customer_id, amount_cents=cents, reason=reason,
                           rental_id=rental_id, t=t))


def raise_alert(db: Session, kind: str, message: str, t: float, board_id: Optional[str] = None,
                station: Optional[str] = None) -> Alert:
    alert = Alert(kind=kind, message=message, t=t, board_id=board_id, station=station)
    db.add(alert)
    return alert


def resolve_alerts(db: Session, board_id: str, kinds: tuple[str, ...]) -> None:
    for alert in db.scalars(select(Alert).where(Alert.board_id == board_id, Alert.kind.in_(kinds),
                                                Alert.resolved.is_(False))):
        alert.resolved = True


def phone_of(db: Session, customer_id: int) -> str:
    c = db.get(Customer, customer_id)
    return c.phone if c else ""


def board_dict(b: Board) -> dict[str, Any]:
    return {"id": b.id, "token_id": b.token_id, "home_station": b.home_station,
            "current_station": b.current_station, "status": b.status,
            "status_label": STATUS_LABELS.get(b.status, b.status), "status_t": b.status_t,
            "rentals_count": b.rentals_count, "needs_review": b.needs_review}


def available_boards(db: Session, station: str) -> list[str]:
    boards = [board_dict(b) for b in db.scalars(select(Board))]
    reserved = {r.suggested_board_id for r in db.scalars(select(Rental).where(Rental.status == "armed"))}
    out, taken = [], set(x for x in reserved if x)
    while True:
        b = fleet.pick_board(boards, station, taken)
        if not b:
            return out
        out.append(b)
        taken.add(b)


# ------------------------------------------------------------------ rentals

def rental_view(db: Session, rental: Rental, config: dict[str, Any], now_t: float) -> dict[str, Any]:
    """Rental as shown to the customer, with a live price while at sea."""
    view: dict[str, Any] = {
        "id": rental.id, "status": rental.status, "station": rental.start_station,
        "board_id": rental.board_id or rental.suggested_board_id, "armed_t": rental.armed_t,
        "start_t": rental.start_t, "end_t": rental.end_t, "end_station": rental.end_station,
        "return_mode": rental.return_mode, "pack_code": None, "now_t": now_t,
    }
    code = db.get(PackCode, rental.pack_code_id) if rental.pack_code_id else None
    if code:
        view["pack_code"] = code.code
    if rental.status in ("active", "not_returned") and rental.start_t is not None:
        left = minutes_left(code.minutes_quota, code.minutes_used) if code else 0
        q = pricing.quote(now_t - rental.start_t, left, wallet_balance(db, rental.customer_id), config)
        view.update(duration_s=now_t - rental.start_t, live=q)
    if rental.end_t is not None and rental.start_t is not None:
        view["receipt"] = {
            "duration_s": rental.end_t - rental.start_t,
            "duration_label": format_duration(rental.end_t - rental.start_t),
            "pack_minutes": rental.pack_minutes, "gross_cents": rental.gross_cents,
            "price_cents": rental.price_cents, "wallet_used_cents": rental.wallet_used_cents,
            "charged_cents": rental.charged_cents,
            "deposit_released": rental.status == "returned",
        }
        view["photo_credited"] = db.scalar(select(Photo.id).where(
            Photo.rental_id == rental.id, Photo.rewarded.is_(True))) is not None
    return view


def close_rental(db: Session, services: Services, config: dict[str, Any], rental: Rental,
                 station: str, t: float, return_mode: str) -> None:
    """Bill at the flow time of the return, capture the price, release the rest of the hold."""
    code = db.get(PackCode, rental.pack_code_id) if rental.pack_code_id else None
    left = minutes_left(code.minutes_quota, code.minutes_used) if code else 0
    q = pricing.quote(t - (rental.start_t or t), left, wallet_balance(db, rental.customer_id), config)
    rental.end_t, rental.end_station, rental.return_mode = t, station, return_mode
    rental.status = "returned"
    rental.pack_minutes, rental.gross_cents = q["pack_minutes"], q["gross_cents"]
    rental.price_cents, rental.wallet_used_cents = q["price_cents"], q["wallet_used_cents"]
    rental.charged_cents = q["charged_cents"]
    if code:
        code.minutes_used += q["pack_minutes"]
    credit(db, rental.customer_id, -q["wallet_used_cents"], "rental_discount", t, rental.id)

    hold = db.scalar(select(CardHold).where(CardHold.rental_id == rental.id))
    if hold:
        services.payment.capture("hold_%d" % hold.id, q["charged_cents"])
        services.payment.release("hold_%d" % hold.id)
        hold.captured_cents = q["charged_cents"]
        hold.status = "captured" if q["charged_cents"] else "released"

    phone = phone_of(db, rental.customer_id)
    parts = ["Merci ! %s rendue, %s, %s." % (rental.board_id, format_duration(t - (rental.start_t or t)),
                                            format_eur(q["charged_cents"]))]
    if q["pack_minutes"]:
        parts.append("%d min offertes par ton pack." % q["pack_minutes"])
    if q["wallet_used_cents"]:
        parts.append("Cagnotte utilisée : %s." % format_eur(q["wallet_used_cents"]))
    parts.append("Caution libérée. Prends ta planche en photo : 1 € sur ta prochaine session.")
    services.sms.send(db, phone, " ".join(parts), t)
    reward_sponsor(db, services, config, rental.customer_id, t)


def reward_sponsor(db: Session, services: Services, config: dict[str, Any], customer_id: int,
                   t: float) -> None:
    """Sponsor credited after the guest's first finished rental, within the cap."""
    guest = db.get(Customer, customer_id)
    if not guest or not guest.referred_by_id:
        return
    finished = db.scalar(select(func.count(Rental.id)).where(
        Rental.customer_id == customer_id, Rental.status == "returned")) or 0
    so_far = db.scalar(select(func.count(WalletEntry.id)).where(
        WalletEntry.customer_id == guest.referred_by_id, WalletEntry.reason == "referral_sponsor")) or 0
    cents = wallet.sponsor_reward_cents(finished >= 1, guest.sponsor_rewarded, so_far, config)
    if cents:
        guest.sponsor_rewarded = True
        credit(db, guest.referred_by_id, cents, "referral_sponsor", t)
        services.sms.send(db, phone_of(db, guest.referred_by_id),
                          "Ton filleul a surfé : %s ajoutés à ta cagnotte Grab&Surf." % format_eur(cents), t)


# ------------------------------------------------------------------ station events

def process_event(db: Session, services: Services, config: dict[str, Any],
                  ev: fleet.StationEvent) -> dict[str, Any]:
    """Apply one station event. Returns {"duplicate": bool, "alarm": [board ids]}."""
    first_event = get_clock(db) == 0
    now = advance_clock(db, ev.t)
    if first_event:  # a real station speaks in epoch seconds: start the boards' clocks there
        for b in db.scalars(select(Board).where(Board.status_t == 0)):
            b.status_t = now
    station = db.get(Station, ev.station)
    if station is None:
        station = Station(id=ev.station, name=config["stations"].get(ev.station, {}).get("name", ev.station))
        db.add(station)
    station.last_seen_t = max(station.last_seen_t or ev.t, ev.t)
    if station.offline_alerted:
        station.offline_alerted = False
        for alert in db.scalars(select(Alert).where(Alert.kind == "station_offline",
                                                    Alert.station == station.id, Alert.resolved.is_(False))):
            alert.resolved = True
    result: dict[str, Any] = {"duplicate": False, "alarm": []}

    if ev.type != "TIC":
        seen = db.scalar(select(StationEvent.id).where(
            StationEvent.station == ev.station, StationEvent.board_id == ev.board_id,
            StationEvent.type == ev.type, StationEvent.t == ev.t))
        if seen:
            result["duplicate"] = True
            return result
        db.add(StationEvent(station=ev.station, board_id=ev.board_id, type=ev.type, t=ev.t))
        db.flush()
        board = db.get(Board, ev.board_id)
        if board is None:
            raise_alert(db, "unknown_board", "Balise inconnue %s vue à la station %s." % (ev.board_id, ev.station),
                        ev.t, ev.board_id, ev.station)
        elif ev.type == "DEPART":
            _on_departure(db, services, board, ev, result)
        else:
            _on_return(db, services, config, board, ev)

    run_timers(db, services, config, now)
    return result


def _on_departure(db: Session, services: Services, board: Board, ev: fleet.StationEvent,
                  result: dict[str, Any]) -> None:
    board.rentals_count += 1
    board.current_station, board.status_t = None, ev.t
    armed = db.scalars(select(Rental).where(Rental.status == "armed", Rental.start_station == ev.station)
                       .order_by(Rental.armed_t, Rental.id)).first()
    if armed is None:
        board.status = "unauthorized"
        raise_alert(db, "theft", "%s sortie de la station %s sans location : alarme déclenchée." % (board.id, ev.station),
                    ev.t, board.id, ev.station)
        services.alarm.ring(board.id, ev.station)
        result["alarm"].append(board.id)
        record_chain(db, board.id, "DEPART", ev.station, ev.t)
        return
    armed.status, armed.board_id, armed.start_t = "active", board.id, ev.t
    board.status = "at_sea"
    services.sms.send(db, phone_of(db, armed.customer_id),
                      "C'est parti avec %s ! Le compteur tourne. Raccroche-la au rack en sortant de l'eau." % board.id,
                      ev.t)
    record_chain(db, board.id, "DEPART", ev.station, ev.t, armed.id)


def _on_return(db: Session, services: Services, config: dict[str, Any], board: Board,
               ev: fleet.StationEvent) -> None:
    board.status = fleet.status_after_return(ev.type, board.home_station, ev.station)
    board.current_station, board.status_t = ev.station, ev.t
    resolve_alerts(db, board.id, ("theft", "not_returned"))
    rental = db.scalars(select(Rental).where(Rental.board_id == board.id,
                                             Rental.status.in_(("active", "not_returned")))).first()
    if rental:
        close_rental(db, services, config, rental, ev.station, ev.t, "detected")
    record_chain(db, board.id, ev.type, ev.station, ev.t, rental.id if rental else None)


def run_timers(db: Session, services: Services, config: dict[str, Any], now: float) -> None:
    """Long-time rules, evaluated at every event: reminders, not returned, stale arming, offline stations."""
    for r in db.scalars(select(Rental).where(Rental.status == "armed")):
        if now - r.armed_t >= config["timers"]["armed_valid_s"]:
            r.status = "cancelled"
            services.sms.send(db, phone_of(db, r.customer_id),
                              "Location annulée : aucune planche n'est partie. Rescanne le QR du rack pour recommencer.",
                              now)
    for r in db.scalars(select(Rental).where(Rental.status == "active")):
        if pricing.not_returned(r.start_t, now, config):
            r.status = "not_returned"
            board = db.get(Board, r.board_id)
            board.status, board.status_t = "not_returned", now
            raise_alert(db, "not_returned", "%s non rendue après %s : vérifier le rack avant toute perte."
                        % (r.board_id, format_duration(now - r.start_t)), now, r.board_id, r.start_station)
            services.sms.send(db, phone_of(db, r.customer_id),
                              "%s n'est pas encore revenue. Raccroche-la ou appelle l'exploitant. "
                              "Ta caution n'est prélevée qu'après vérification." % r.board_id, now)
        elif pricing.reminder_due(r.start_t, now, r.reminder_sent, config):
            r.reminder_sent = True
            services.sms.send(db, phone_of(db, r.customer_id),
                              "Ta session tourne depuis %s. Raccroche %s en sortant. Au-delà, forfait journée de %s."
                              % (format_duration(now - r.start_t), r.board_id,
                                 format_eur(config["pricing"]["day_pass_cents"])), now)
    for s in db.scalars(select(Station)):
        if fleet.station_online(s.last_seen_t, now, config) is False and not s.offline_alerted:
            s.offline_alerted = True
            raise_alert(db, "station_offline", "Station %s hors ligne : plus de signal depuis %s."
                        % (s.id, format_duration(now - s.last_seen_t)), now, None, s.id)


def clock(db: Session) -> float:
    return get_clock(db)
