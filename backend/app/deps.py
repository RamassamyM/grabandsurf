"""FastAPI dependencies: database session, services, customer token, operator PIN."""

from __future__ import annotations

import hashlib
import hmac
from typing import Iterator, Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .i18n import request_lang, t
from .models import Customer
from .services import Services
from .settings import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_services(request: Request) -> Services:
    return request.app.state.services


def get_db(request: Request) -> Iterator[Session]:
    """One session per request: commit on success, then send what was queued (chain events, real SMS)."""
    db: Session = request.app.state.sessionmaker()
    committed = False
    try:
        yield db
        db.commit()
        committed = True
    except Exception:
        db.rollback()
        raise
    finally:
        chain_pending = db.info.pop("chain_pending", [])
        sms_pending = db.info.pop("sms_pending", [])
        db.close()
        if committed:
            services = request.app.state.services
            for args in chain_pending:
                services.chain.publish(*args)
            for args in sms_pending:
                services.sms.dispatch(*args)


def sign_customer(settings: Settings, customer_id: int) -> str:
    """Signed token kept by the browser after the SMS code."""
    sig = hmac.new(settings.secret_key.encode(), str(customer_id).encode(), hashlib.sha256).hexdigest()[:32]
    return "%d.%s" % (customer_id, sig)


def customer_id_from_token(settings: Settings, token: str) -> Optional[int]:
    try:
        raw_id, _ = token.split(".", 1)
        cid = int(raw_id)
    except ValueError:
        return None
    return cid if hmac.compare_digest(sign_customer(settings, cid), token) else None


def current_customer(authorization: str = Header(default=""), db: Session = Depends(get_db),
                     settings: Settings = Depends(get_settings), lang: str = Depends(request_lang)) -> Customer:
    """Customer from the Authorization: Bearer token; remembers the page language for SMS."""
    token = authorization.removeprefix("Bearer ").strip()
    cid = customer_id_from_token(settings, token) if token else None
    customer = db.get(Customer, cid) if cid else None
    if customer is None:
        raise HTTPException(401, t("session_expired", lang))
    if customer.lang != lang:
        customer.lang = lang
    return customer


def require_operator(x_operator_pin: str = Header(default=""), pin: str = "",
                     settings: Settings = Depends(get_settings)) -> None:
    """Operator, owner and partner pages: PIN only if OPERATOR_PIN is set in .env (header, or ?pin= for images)."""
    given = x_operator_pin or pin
    if settings.operator_pin and not hmac.compare_digest(given, settings.operator_pin):
        raise HTTPException(401, "Code PIN exploitant requis.")
