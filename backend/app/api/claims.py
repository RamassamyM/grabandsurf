"""Implicit purchase: the customer claims the NFT of the board by giving a wallet address.

The link comes by SMS after the operator confirmed the loss; it carries a signed token, so no
account is needed. The wallet address goes on-chain as the new owner (contract V2, sellTo);
the phone number never does.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings
from ..i18n import request_lang, t
from ..models import ChainTx, Rental
from ..services import Services
from ..settings import Settings
from ..workflows import clock, record_chain

router = APIRouter(prefix="/api/claims")
WALLET = re.compile(r"^0x[0-9a-fA-F]{40}$")


class ClaimIn(BaseModel):
    wallet: str = Field(min_length=42, max_length=42)


def claim_token(settings: Settings, rental_id: int) -> str:
    sig = hmac.new(settings.secret_key.encode(), ("claim:%d" % rental_id).encode(), hashlib.sha256).hexdigest()[:24]
    return "%d-%s" % (rental_id, sig)


def _rental(db: Session, settings: Settings, token: str, lang: str) -> Rental:
    try:
        rental_id = int(token.split("-", 1)[0])
    except ValueError:
        rental_id = 0
    rental = db.get(Rental, rental_id) if rental_id else None
    if rental is None or not hmac.compare_digest(claim_token(settings, rental_id), token) or rental.status != "bought":
        raise HTTPException(404, t("claim_unknown", lang))
    return rental


def _view(db: Session, services: Services, rental: Rental) -> dict[str, Any]:
    tx = db.scalars(select(ChainTx).where(ChainTx.rental_id == rental.id, ChainTx.event_type == "VENDUE")).first()
    return {"board_id": rental.board_id, "wallet": rental.claim_wallet,
            "chain_status": tx.status if tx else None, "tx_hash": tx.tx_hash if tx else None,
            "tx_url": services.chain.link("tx", tx.tx_hash or "") if tx else None,
            "nft_url": services.chain.link("nft", "%s/%d" % (services.chain.contract_address, int(rental.board_id.rsplit("-", 1)[-1])))
            if services.chain.contract_address else None,
            "chain_label": services.chain.label, "chain_supports_transfer": services.chain.supports("VENDUE")}


@router.get("/{token}")
def get_claim(token: str, db: Session = Depends(get_db), services: Services = Depends(get_services),
              settings: Settings = Depends(get_settings), lang: str = Depends(request_lang)) -> dict[str, Any]:
    return _view(db, services, _rental(db, settings, token, lang))


@router.post("/{token}")
def claim(token: str, body: ClaimIn, db: Session = Depends(get_db), services: Services = Depends(get_services),
          settings: Settings = Depends(get_settings), lang: str = Depends(request_lang)) -> dict[str, Any]:
    rental = _rental(db, settings, token, lang)
    if rental.claim_wallet:
        raise HTTPException(400, t("claim_done", lang))
    if not WALLET.match(body.wallet):
        raise HTTPException(400, t("claim_wallet_invalid", lang))
    rental.claim_wallet = body.wallet
    record_chain(db, rental.board_id, "VENDUE", "", clock(db), rental.id, extra={"buyer": body.wallet})
    db.flush()
    return _view(db, services, rental)
