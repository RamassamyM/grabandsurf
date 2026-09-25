"""Sign up with a phone number: SMS code, card hold, wallet, referral code, demo SMS inbox."""

from __future__ import annotations

import random
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import current_customer, get_db, get_services, get_settings, sign_customer
from ..domain import wallet
from ..domain.pricing import format_eur
from ..models import Customer, OtpCode, Rental, SmsMessage, WalletEntry
from ..schemas import CardHoldRequest, OtpRequest, OtpVerify
from ..services import Services
from ..settings import Settings
from ..workflows import clock, credit, rental_view, wallet_balance

router = APIRouter(prefix="/api")
_rng = random.SystemRandom()


def normalize_phone(raw: str) -> str:
    """+33 6 12 34 56 78, 06 12 34 56 78 -> +33612345678."""
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    elif digits.startswith("0") and len(digits) == 10:
        digits = "+33" + digits[1:]
    elif not digits.startswith("+"):
        digits = "+" + digits
    if not re.fullmatch(r"\+\d{8,15}", digits):
        raise HTTPException(400, "Numéro de téléphone invalide.")
    return digits


@router.post("/otp")
def send_otp(body: OtpRequest, db: Session = Depends(get_db), services: Services = Depends(get_services),
             settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Send a 4-digit code by SMS; in demo mode it is also returned to be shown on screen."""
    phone = normalize_phone(body.phone)
    now = clock(db)
    code = "%04d" % _rng.randrange(10000)
    db.add(OtpCode(phone=phone, code=code, expires_t=now + settings.config["timers"]["otp_valid_s"]))
    services.sms.send(db, phone, "Grab&Surf : ton code est %s." % code, now)
    out: dict[str, Any] = {"phone": phone, "sent": True}
    if settings.demo_mode:
        out["demo_code"] = code
    return out


@router.post("/otp/verify")
def verify_otp(body: OtpVerify, db: Session = Depends(get_db), services: Services = Depends(get_services),
               settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Check the code, create the customer if needed (with an optional referral code), return a token."""
    phone = normalize_phone(body.phone)
    now = clock(db)
    otp = db.scalars(select(OtpCode).where(OtpCode.phone == phone, OtpCode.used.is_(False))
                     .order_by(OtpCode.id.desc())).first()
    if otp is None or otp.code != body.code.strip() or otp.expires_t < now:
        raise HTTPException(400, "Code incorrect ou expiré.")
    otp.used = True
    customer = db.scalar(select(Customer).where(Customer.phone == phone))
    created = customer is None
    if created:
        taken = set(db.scalars(select(Customer.referral_code)))
        customer = Customer(phone=phone, referral_code=wallet.new_referral_code(_rng, taken), created_t=now)
        sponsor = _find_sponsor(db, body.referral_code) if body.referral_code else None
        if body.referral_code and sponsor is None:
            raise HTTPException(400, "Code de parrainage inconnu.")
        db.add(customer)
        db.flush()
        if sponsor:
            customer.referred_by_id = sponsor.id
            cents = wallet.guest_reward_cents(settings.config)
            credit(db, customer.id, cents, "referral_guest", now)
            services.sms.send(db, phone, "Bienvenue ! %s offerts par ton parrain sur ta première session."
                              % format_eur(cents), now)
    return {"token": sign_customer(settings, customer.id), "created": created,
            "profile": profile(db, customer, settings)}


def _find_sponsor(db: Session, raw: str) -> Customer | None:
    """A sponsor is found by referral code (SURF-XXXX) or by phone number."""
    raw = raw.strip().upper()
    found = db.scalar(select(Customer).where(Customer.referral_code == raw))
    if found is None and re.search(r"\d{6,}", raw):
        try:
            found = db.scalar(select(Customer).where(Customer.phone == normalize_phone(raw)))
        except HTTPException:
            return None
    return found


def profile(db: Session, customer: Customer, settings: Settings) -> dict[str, Any]:
    current = db.scalars(select(Rental).where(Rental.customer_id == customer.id,
                                              Rental.status.in_(("armed", "active", "not_returned")))
                         .order_by(Rental.id.desc())).first()
    history = db.scalars(select(Rental).where(Rental.customer_id == customer.id,
                                              Rental.status.in_(("returned", "bought")))
                         .order_by(Rental.id.desc()).limit(10)).all()
    ledger = db.scalars(select(WalletEntry).where(WalletEntry.customer_id == customer.id)
                        .order_by(WalletEntry.id.desc()).limit(20)).all()
    now = clock(db)
    return {"phone": customer.phone, "referral_code": customer.referral_code,
            "card_hold_status": customer.card_hold_status, "card_last4": customer.card_last4,
            "wallet_cents": wallet_balance(db, customer.id),
            "wallet_ledger": [{"amount_cents": w.amount_cents, "reason": w.reason, "t": w.t} for w in ledger],
            "current_rental": rental_view(db, current, settings.config, now) if current else None,
            "history": [rental_view(db, r, settings.config, now) for r in history],
            "rewards": settings.config["rewards"]}


@router.post("/card-holds")
def card_hold(body: CardHoldRequest, customer: Customer = Depends(current_customer),
              db: Session = Depends(get_db), services: Services = Depends(get_services),
              settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Register a fake card: the 300 € hold is taken at each rental, never charged."""
    try:
        last4 = services.payment.validate_card(body.card_number)
    except ValueError as e:
        raise HTTPException(400, "Numéro de carte invalide.") from e
    customer.card_last4, customer.card_hold_status = last4, "authorized"
    return profile(db, customer, settings)


@router.get("/me")
def me(customer: Customer = Depends(current_customer), db: Session = Depends(get_db),
       settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return profile(db, customer, settings)


@router.get("/sms")
def sms_inbox(phone: str, db: Session = Depends(get_db),
              settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    """Demo SMS inbox of a phone number (demo mode only)."""
    if not settings.demo_mode:
        raise HTTPException(404, "Boîte SMS de démo désactivée.")
    phone = normalize_phone(phone)
    rows = db.scalars(select(SmsMessage).where(SmsMessage.phone == phone)
                      .order_by(SmsMessage.id.desc()).limit(30))
    return [{"id": m.id, "text": m.text, "t": m.t} for m in rows]


