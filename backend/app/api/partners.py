"""Partner hour packs and dashboard: aggregated figures only, never a name."""

from __future__ import annotations

import random
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings, require_operator
from ..domain.packs import new_pack_code, pack_price_cents, split_minutes
from ..models import ChainTx, Pack, PackCode, Partner, Rental
from ..schemas import PackRequest
from ..services import Services
from ..settings import Settings

router = APIRouter(prefix="/api/partners", dependencies=[Depends(require_operator)])
_rng = random.SystemRandom()


@router.get("")
def list_partners(db: Session = Depends(get_db)) -> list[dict[str, str]]:
    return [{"id": p.id, "name": p.name} for p in db.scalars(select(Partner))]


@router.post("/{partner_id}/packs")
def create_pack(partner_id: str, body: PackRequest, db: Session = Depends(get_db),
                settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Buy N hours: codes share the minutes evenly."""
    partner = db.get(Partner, partner_id)
    if partner is None:
        raise HTTPException(404, "Partenaire inconnu.")
    pack = Pack(partner_id=partner.id, hours=body.hours, price_cents=pack_price_cents(body.hours, settings.config))
    db.add(pack)
    db.flush()
    taken = set(db.scalars(select(PackCode.code)))
    codes = []
    for quota in split_minutes(body.hours * 60, body.codes):
        code = new_pack_code(partner.name[:6].replace(" ", ""), _rng, taken)
        taken.add(code)
        db.add(PackCode(pack_id=pack.id, code=code, minutes_quota=quota))
        codes.append({"code": code, "minutes_quota": quota})
    return {"pack_id": pack.id, "hours": pack.hours, "price_cents": pack.price_cents, "codes": codes}


@router.get("/{partner_id}/dashboard")
def dashboard(partner_id: str, db: Session = Depends(get_db),
              services: Services = Depends(get_services)) -> dict[str, Any]:
    partner = db.get(Partner, partner_id)
    if partner is None:
        raise HTTPException(404, "Partenaire inconnu.")
    packs = db.scalars(select(Pack).where(Pack.partner_id == partner.id)).all()
    codes = db.scalars(select(PackCode).where(PackCode.pack_id.in_([p.id for p in packs]))).all() if packs else []
    code_ids = [c.id for c in codes]
    rentals = db.scalars(select(Rental).where(Rental.pack_code_id.in_(code_ids),
                                              Rental.status.in_(("returned", "bought")))
                         .order_by(Rental.id.desc())).all() if code_ids else []
    code_by_id = {c.id: c.code for c in codes}
    sessions = []
    for r in rentals:
        txs = db.scalars(select(ChainTx).where(ChainTx.rental_id == r.id).order_by(ChainTx.id)).all()
        sessions.append({
            "rental_id": r.id, "board_id": r.board_id, "code": code_by_id.get(r.pack_code_id),
            "start_t": r.start_t, "end_t": r.end_t, "pack_minutes": r.pack_minutes,
            "proofs": [{"event_type": t.event_type, "tx_hash": t.tx_hash, "status": t.status,
                        "url": services.chain.link("tx", t.tx_hash or "")} for t in txs],
        })
    return {
        "partner": {"id": partner.id, "name": partner.name},
        "hours_bought": sum(p.hours for p in packs),
        "amount_cents": sum(p.price_cents for p in packs),
        "minutes_used": sum(c.minutes_used for c in codes),
        "sessions_count": len(rentals),
        "people_count": len({r.customer_id for r in rentals}),
        "codes": [{"code": c.code, "minutes_quota": c.minutes_quota, "minutes_used": c.minutes_used}
                  for c in codes],
        "sessions": sessions,
        "chain": {"label": services.chain.label, "mode": services.chain.mode},
        "statement": "Chaque heure utilisée est historisée et son intégrité vérifiable.",
    }
