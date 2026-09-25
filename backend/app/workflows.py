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
from .models import (Alert, Board, CardHold, ChainTx, Customer, DamageReport, Inspection, PackCode, Photo,
                     Rental, Station,
                     StationEvent, WalletEntry)
from .i18n import t as tr
from .i18n import zone_name
from .services import Services


# ------------------------------------------------------------------ small helpers

def record_chain(db: Session, board_id: str, event_type: str, station: str, t: float,
                 rental_id: Optional[int] = None, proof: str = "",
                 extra: Optional[dict[str, Any]] = None, note: str = "") -> ChainTx:
    """Add a chain_txs row; the event is published once the request is committed."""
    row = ChainTx(board_id=board_id, event_type=event_type, station=station or "", t=t,
                  rental_id=rental_id, status="pending", proof=proof or "", note=note[:120])
    db.add(row)
    db.flush()
    db.info.setdefault("chain_pending", []).append((row.id, board_id, event_type, station, t, proof, extra))
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


def sms_to(db: Session, services: Services, customer_id: int, key: str, t: float, **values: object) -> None:
    """SMS in the customer's language."""
    c = db.get(Customer, customer_id)
    if c:
        services.sms.send(db, c.phone, tr(key, c.lang, **values), t)


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
            "deposit_status": rental.deposit_status,
            "deposit_released": rental.deposit_status == "released",
            "deposit_due_t": rental.deposit_due_t,
        }
        view["photo_credited"] = db.scalar(select(Photo.id).where(
            Photo.rental_id == rental.id, Photo.rewarded.is_(True))) is not None
    return view


def close_rental(db: Session, services: Services, config: dict[str, Any], rental: Rental,
                 station: str, t: float, return_mode: str) -> None:
    """Bill at the flow time of the return and capture the price; the rest of the hold waits for the check."""
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
        hold.captured_cents = q["charged_cents"]
    rental.deposit_status = "pending_check"
    rental.deposit_due_t = t + config["timers"]["deposit_release_after_s"]

    customer = db.get(Customer, rental.customer_id)
    lang = customer.lang if customer else "fr"
    parts = [tr("sms_receipt", lang, board=rental.board_id, duration=format_duration(t - (rental.start_t or t)),
                amount=format_eur(q["charged_cents"]))]
    if q["pack_minutes"]:
        parts.append(tr("sms_receipt_pack", lang, minutes=q["pack_minutes"]))
    if q["wallet_used_cents"]:
        parts.append(tr("sms_receipt_wallet", lang, amount=format_eur(q["wallet_used_cents"])))
    parts.append(tr("sms_receipt_end", lang))
    if customer:
        services.sms.send(db, customer.phone, " ".join(parts), t)
    reward_sponsor(db, services, config, rental.customer_id, t)


def open_damage_reports(db: Session, rental: Rental) -> bool:
    return db.scalar(select(func.count(DamageReport.id)).where(
        DamageReport.rental_id == rental.id, DamageReport.status == "to_review")) > 0


def release_deposit(db: Session, services: Services, rental: Rental, role: str, t: float) -> None:
    """State checked: free what is left of the hold."""
    hold = db.scalar(select(CardHold).where(CardHold.rental_id == rental.id))
    if hold and hold.status == "authorized":
        services.payment.release("hold_%d" % hold.id)
        hold.status = "captured" if hold.captured_cents else "released"
    rental.deposit_status, rental.checked_role = "released", role
    db.add(Inspection(board_id=rental.board_id or "", kind="deposit_released", role=role, t=t))
    sms_to(db, services, rental.customer_id, "sms_deposit_released", t, board=rental.board_id)


def withhold_repair(db: Session, services: Services, rental: Rental, amount: int, zone: str, role: str,
                    t: float) -> int:
    """Repair fee taken from the hold (never above what is left of it), then the rest is freed."""
    hold = db.scalar(select(CardHold).where(CardHold.rental_id == rental.id))
    if hold is None or hold.status != "authorized":
        return 0
    amount = max(0, min(amount, hold.amount_cents - hold.captured_cents))
    services.payment.capture("hold_%d" % hold.id, amount)
    services.payment.release("hold_%d" % hold.id)
    hold.captured_cents += amount
    hold.status = "captured" if hold.captured_cents else "released"
    rental.deposit_status, rental.checked_role = "charged", role
    db.add(Inspection(board_id=rental.board_id or "", kind="repair_withheld", role=role, t=t))
    customer = db.get(Customer, rental.customer_id)
    sms_to(db, services, rental.customer_id, "sms_repair_fee", t, board=rental.board_id,
           zone=zone_name(zone, customer.lang if customer else "fr"), amount=format_eur(amount))
    return amount


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
        sms_to(db, services, guest.referred_by_id, "sms_sponsor", t, amount=format_eur(cents))


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
    # next rental without a damage report: the previous renter's deposit is freed
    for previous in db.scalars(select(Rental).where(Rental.board_id == board.id, Rental.id != armed.id,
                                                    Rental.deposit_status == "pending_check")):
        if not open_damage_reports(db, previous):
            release_deposit(db, services, previous, "next_rental", ev.t)
    sms_to(db, services, armed.customer_id, "sms_departure", ev.t, board=board.id)
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
            sms_to(db, services, r.customer_id, "sms_armed_cancelled", now)
    for r in db.scalars(select(Rental).where(Rental.status == "active")):
        if pricing.not_returned(r.start_t, now, config):
            r.status = "not_returned"
            board = db.get(Board, r.board_id)
            board.status, board.status_t = "not_returned", now
            raise_alert(db, "not_returned", "%s non rendue après %s : vérifier le rack avant toute perte."
                        % (r.board_id, format_duration(now - r.start_t)), now, r.board_id, r.start_station)
            sms_to(db, services, r.customer_id, "sms_not_returned", now, board=r.board_id)
        elif pricing.reminder_due(r.start_t, now, r.reminder_sent, config):
            r.reminder_sent = True
            sms_to(db, services, r.customer_id, "sms_reminder", now, duration=format_duration(now - r.start_t),
                   board=r.board_id, amount=format_eur(config["pricing"]["day_pass_cents"]))
    for r in db.scalars(select(Rental).where(Rental.deposit_status == "pending_check")):
        if r.deposit_due_t is not None and now >= r.deposit_due_t and not open_damage_reports(db, r):
            release_deposit(db, services, r, "auto_8h", now)
    for s in db.scalars(select(Station)):
        if fleet.station_online(s.last_seen_t, now, config) is False and not s.offline_alerted:
            s.offline_alerted = True
            raise_alert(db, "station_offline", "Station %s hors ligne : plus de signal depuis %s."
                        % (s.id, format_duration(now - s.last_seen_t)), now, None, s.id)


def clock(db: Session) -> float:
    return get_clock(db)
