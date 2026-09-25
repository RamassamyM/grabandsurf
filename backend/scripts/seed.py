"""Demo data: 6 boards, 3 stations, a demo customer, the MAIF partner and its codes.

    python -m backend.scripts.seed        wipes the database and recreates the demo
"""

from __future__ import annotations

import random
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.domain.packs import new_pack_code, pack_price_cents, split_minutes
from backend.app.models import (Alert, AppState, Board, CardHold, ChainTx, Customer, DamageReport,
                                Inspection, OtpCode, Pack, PackCode, Partner, Photo, Rental, RepairFee, SmsMessage,
                                Station, StationEvent, WalletEntry)

WIPE_ORDER = [WalletEntry, CardHold, DamageReport, Photo, Rental, PackCode, Pack, Partner, OtpCode,
              SmsMessage, Alert, Inspection, StationEvent, ChainTx, Customer, Board]


def seed(db: Session, config: dict[str, Any], rng: random.Random | None = None) -> None:
    """Reset business data; keep the flow clock and when each station last spoke."""
    rng = rng or random.Random(42)
    for model in WIPE_ORDER:
        db.execute(delete(model))
    clock = db.get(AppState, "clock")
    now = float(clock.value) if clock and clock.value else 0.0

    for sid, info in config["stations"].items():
        s = db.get(Station, sid)
        if s is None:
            db.add(Station(id=sid, name=info.get("name", sid)))
        else:
            s.name, s.offline_alerted = info.get("name", sid), False
    for zone, info in config["repairs"]["zones"].items():  # the owner's grid survives a demo reset
        if db.get(RepairFee, zone) is None:
            db.add(RepairFee(zone=zone, label=info["label"], fee_cents=info["fee_cents"]))
    for board_id, home in config["fleet"].items():
        db.add(Board(id=board_id, token_id=int(board_id.rsplit("-", 1)[-1]), home_station=home,
                     current_station=home, status="at_rack", status_t=now, beacon_installed_t=0.0))

    for pid, info in config["partners"].items():
        db.add(Partner(id=pid, name=info["name"]))
    db.flush()
    taken: set[str] = set()
    for code, info in config["packs"].items():
        pack = Pack(partner_id=info["partner"], hours=info["hours"],
                    price_cents=pack_price_cents(info["hours"], config))
        db.add(pack)
        db.flush()
        extra = config["demo"]["extra_pack_codes"]
        quotas = split_minutes(info["hours"] * 60, extra + 1)
        db.add(PackCode(pack_id=pack.id, code=code, minutes_quota=quotas[0]))
        taken.add(code)
        prefix = code.split("-", 1)[0]
        for quota in quotas[1:]:
            extra_code = new_pack_code(prefix, rng, taken)
            taken.add(extra_code)
            db.add(PackCode(pack_id=pack.id, code=extra_code, minutes_quota=quota))

    db.add(Customer(phone=config["demo"]["customer_phone"], referral_code="SURF-DEMO",
                    card_hold_status="authorized", card_last4="4242", created_t=now))
    db.flush()


def main() -> None:
    from backend.app.db import create_tables, make_engine, make_sessionmaker
    from backend.app.settings import load_settings
    settings = load_settings()
    engine = make_engine(settings.database_url)
    create_tables(engine)
    with make_sessionmaker(engine)() as db:
        seed(db, settings.config)
        db.commit()
        boards = db.scalars(select(Board)).all()
    print("Démo prête : %d planches, base %s" % (len(boards), settings.database_url))


if __name__ == "__main__":
    main()
