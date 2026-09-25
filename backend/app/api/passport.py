"""Public board passport: life log, minutes surfed, repairs, proofs, fictional ambassador."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services
from ..domain.fleet import STATUS_LABELS
from ..models import Board, ChainTx, Inspection, Rental
from ..services import Services
from ..services.chain import CHAIN_DIR

router = APIRouter(prefix="/api/boards")
log = logging.getLogger(__name__)

EVENT_LABELS = {"DEPART": "Départ", "RETOUR": "Retour au rack", "ETRANGERE": "Rendue dans une autre station",
                "REPARATION": "Réparation", "RECONDITIONNEMENT": "Reconditionnement", "PERDUE": "Perdue",
                "MISE_EN_SERVICE": "Mise en service"}


def ambassador(board_id: str) -> dict[str, str] | None:
    try:
        data = json.loads((CHAIN_DIR / "ambassadors.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data.get(board_id)


@router.get("/{board_id}/passport")
def passport(board_id: str, db: Session = Depends(get_db), services: Services = Depends(get_services)) -> dict[str, Any]:
    board = db.get(Board, board_id.strip().lower())
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    rentals = db.scalars(select(Rental).where(Rental.board_id == board.id,
                                              Rental.status.in_(("returned", "bought")))).all()
    minutes = int(sum(((r.end_t or 0) - (r.start_t or 0)) for r in rentals) // 60)
    txs = db.scalars(select(ChainTx).where(ChainTx.board_id == board.id).order_by(ChainTx.t.desc(), ChainTx.id.desc())).all()
    repairs = db.scalars(select(Inspection).where(Inspection.board_id == board.id,
                                                  Inspection.kind == "back_in_service")).all()
    on_chain = None
    try:
        on_chain = services.chain.read_board(board.id)
    except Exception as e:  # the passport never fails because of the network
        log.warning("on-chain read failed: %s", e)
    status = services.chain.status()
    return {
        "board": {"id": board.id, "token_id": board.token_id, "home_station": board.home_station,
                  "status": board.status, "status_label": STATUS_LABELS.get(board.status, board.status),
                  "material": "Liège des Landes"},
        "sessions": len(rentals), "minutes_surfed": minutes,
        "repairs": len([t for t in txs if t.event_type == "REPARATION"]) or len(repairs),
        "history": [{"event_type": t.event_type, "label": EVENT_LABELS.get(t.event_type, t.event_type),
                     "station": t.station, "t": t.t, "status": t.status, "tx_hash": t.tx_hash,
                     "url": services.chain.link("tx", t.tx_hash or "")} for t in txs[:50]],
        "on_chain": on_chain,
        "chain": {"mode": status["mode"], "label": status["label"], "contract_url": status["contract_url"]},
        "ambassador": ambassador(board.id),
        "share_text": "Voici l'histoire de %s, planche de surf en liège Grab&Surf." % board.id,
    }
