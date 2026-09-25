"""Public board passport: the life log read on-chain, linked to the database, plus artist and sponsor.

Rows come from the contract events (get_logs) and are matched with chain_txs by transaction hash,
which adds what the chain does not say (session length, pack partner, photo signature). Nothing
personal is shown: no phone, no customer, and the return photo itself stays private (only its hash).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services
from ..domain.fleet import STATUS_LABELS, format_duration
from ..models import Board, ChainTx, Inspection, Pack, PackCode, Partner, Photo, Rental, SponsorMedia, Sponsorship
from ..services import Services
from ..services.chain import CHAIN_DIR

router = APIRouter(prefix="/api/boards")
log = logging.getLogger(__name__)


def ambassador(board_id: str) -> dict[str, str] | None:
    try:
        data = json.loads((CHAIN_DIR / "ambassadors.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data.get(board_id)


def _details(db: Session, event_type: str, row: Optional[ChainTx], chain_ev: Optional[dict[str, Any]]) -> dict[str, Any]:
    """What the database adds to an on-chain event (never personal)."""
    out: dict[str, Any] = {}
    rental = db.get(Rental, row.rental_id) if row and row.rental_id else None
    if rental and event_type in ("RETOUR", "ETRANGERE") and rental.start_t is not None and rental.end_t is not None:
        out["duration_label"] = format_duration(rental.end_t - rental.start_t)
        if rental.pack_code_id:
            code = db.get(PackCode, rental.pack_code_id)
            pack = db.get(Pack, code.pack_id) if code else None
            partner = db.get(Partner, pack.partner_id) if pack else None
            if partner:
                out["offered_by"] = partner.name
    proof = (chain_ev or {}).get("proof") or (row.proof if row else "")
    if event_type == "INSPECTION" and proof:
        out["photo_sha256"] = proof
        photo = db.scalar(select(Photo).where(Photo.sha256 == proof))
        if photo and photo.signature:
            out["signature"], out["signer"] = photo.signature, photo.signer
    if event_type == "CORRECTION":
        out["reason"] = (chain_ev or {}).get("reason") or (row.note if row else "")
    if event_type in ("SPONSORING", "FIN_SPONSORING") and row and row.note:
        out["note"] = row.note
    return out


def _row(db: Session, services: Services, event_type: str, station: str, t: float, tx: Optional[str],
         status: str, row: Optional[ChainTx], chain_ev: Optional[dict[str, Any]]) -> dict[str, Any]:
    order = row.id if row else (chain_ev or {}).get("index", 0)
    return {"event_type": event_type, "station": station, "t": t, "tx_hash": tx, "_order": order,
            "url": services.chain.link("tx", tx or ""), "status": status,
            "index": (chain_ev or {}).get("index"), "contract_version": (chain_ev or {}).get("version"),
            "details": _details(db, event_type, row, chain_ev)}


def life_log(db: Session, services: Services, board: Board) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Merge the on-chain history with chain_txs; each row says whether it is verified on-chain."""
    rows = db.scalars(select(ChainTx).where(ChainTx.board_id == board.id).order_by(ChainTx.t, ChainTx.id)).all()
    history = None
    try:
        history = services.chain.board_history(board.id)
    except Exception as e:  # the passport never fails because of the network
        log.warning("on-chain history unavailable: %s", e)
    out: list[dict[str, Any]] = []
    if history is None:
        simulated = services.chain.mode != "real"
        for r in rows:
            status = "simulation" if simulated and r.status == "sent" else r.status
            out.append(_row(db, services, r.event_type, r.station, r.t, r.tx_hash, status, r, None))
        sync = {"source": "simulation" if simulated else "database", "synced": False}
    else:
        unmatched = list(rows)
        for ev in history["events"]:
            match = next((r for r in unmatched if (r.tx_hash or "").lower() == ev["tx"].lower()
                          and r.event_type == ev["type"] and int(r.t) == ev["t"]), None)
            if match:
                unmatched.remove(match)
            out.append(_row(db, services, ev["type"], ev["station"], ev["t"], ev["tx"], "verified", match, ev))
        for r in unmatched:
            if r.status == "sent":
                status = "missing" if history["synced"] else "reading"
            else:
                status = r.status  # pending, skipped (contract V1), rejected
            out.append(_row(db, services, r.event_type, r.station, r.t, r.tx_hash, status, r, None))
        sync = {"source": "chain", "synced": history["synced"], "scanned_to": history["scanned_to"],
                "latest": history["latest"], "error": history["error"]}
    out.sort(key=lambda x: (x["t"], x.pop("_order")), reverse=True)
    return out, sync


def sponsorship_view(db: Session, sp: Sponsorship, services: Services) -> dict[str, Any]:
    media = db.scalars(select(SponsorMedia).where(SponsorMedia.sponsorship_id == sp.id).order_by(SponsorMedia.id)).all()
    tx = db.scalars(select(ChainTx).where(ChainTx.board_id == sp.board_id, ChainTx.event_type == "SPONSORING",
                                          ChainTx.note == "sponsorship:%d" % sp.id)).first()
    return {
        "id": sp.id, "board_id": sp.board_id, "status": sp.status,
        "sponsor_name": sp.sponsor_name, "sponsor_url": sp.sponsor_url, "message": sp.message,
        "artist_name": sp.artist_name, "artist_bio": sp.artist_bio,
        "design_url": "/api/sponsorships/%d/design" % sp.id if sp.design_path else None,
        "design_sha256": sp.design_sha256, "start_date": sp.start_date, "end_date": sp.end_date,
        "media": [{"id": m.id, "kind": m.kind, "caption": m.caption,
                   "url": m.url if m.kind == "video" else "/api/sponsor-media/%d" % m.id} for m in media],
        "chain": {"status": tx.status if tx else None, "tx_hash": tx.tx_hash if tx else None,
                  "url": services.chain.link("tx", tx.tx_hash or "") if tx else None},
    }


@router.get("/{board_id}/passport")
def passport(board_id: str, db: Session = Depends(get_db), services: Services = Depends(get_services)) -> dict[str, Any]:
    board = db.get(Board, board_id.strip().lower())
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    rentals = db.scalars(select(Rental).where(Rental.board_id == board.id,
                                              Rental.status.in_(("returned", "bought")))).all()
    minutes = int(sum(((r.end_t or 0) - (r.start_t or 0)) for r in rentals) // 60)
    history, sync = life_log(db, services, board)
    repairs = db.scalars(select(Inspection).where(Inspection.board_id == board.id,
                                                  Inspection.kind == "back_in_service")).all()
    on_chain = None
    try:
        on_chain = services.chain.read_board(board.id)
    except Exception as e:
        log.warning("on-chain read failed: %s", e)
    status = services.chain.status()
    active = db.scalars(select(Sponsorship).where(Sponsorship.board_id == board.id, Sponsorship.status == "active")
                        .order_by(Sponsorship.id.desc())).first()
    return {
        "board": {"id": board.id, "token_id": board.token_id, "home_station": board.home_station,
                  "status": board.status, "status_label": STATUS_LABELS.get(board.status, board.status)},
        "sessions": len(rentals), "minutes_surfed": minutes,
        "repairs": len([h for h in history if h["event_type"] == "REPARATION"]) or len(repairs),
        "history": history[:80],
        "sync": sync,
        "on_chain": on_chain,
        "chain": {"mode": status["mode"], "label": status["label"], "contract_url": status["contract_url"],
                  "version": status["version"]},
        "sponsorship": sponsorship_view(db, active, services) if active else None,
        "ambassador": ambassador(board.id),
    }


@router.post("/{board_id}/views")
def count_view(board_id: str, db: Session = Depends(get_db)) -> dict[str, int]:
    """Anonymous counter of passport openings (for the sponsor's figures)."""
    board = db.get(Board, board_id.strip().lower())
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    board.passport_views += 1
    return {"views": board.passport_views}
