"""FastAPI application: routers, services, and the built frontend in demo.

    uvicorn backend.app.main:create_app --factory --port 9000
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select, update

from .api import customers, fleet, inspections, owner, partners, passport, photos, rentals, stations
from .i18n import request_lang, t
from .db import create_tables, make_engine, make_sessionmaker
from .models import Board, ChainTx
from .services import Alarm, ChainService, FakePayment, Services
from .services.sms import build_sms
from .services.photo_ai import build_photo_ai
from .settings import Settings, load_settings

log = logging.getLogger(__name__)


def build_services(settings: Settings) -> Services:
    """Real or fake versions, chosen by the settings."""
    return Services(sms=build_sms(settings.env), payment=FakePayment(),
                    photo_ai=build_photo_ai(settings.env.get("PHOTO_AI", "auto"), settings.env, settings.config),
                    alarm=Alarm(sound=settings.alarm_sound),
                    chain=ChainService(settings.chain_mode, settings.env, settings.data_dir))


def create_app(settings: Optional[Settings] = None, services: Optional[Services] = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = settings or load_settings()
    engine = make_engine(settings.database_url)
    create_tables(engine)
    sessionmaker = make_sessionmaker(engine)
    services = services or build_services(settings)

    with sessionmaker() as db:
        if db.scalar(select(Board.id)) is None:
            from backend.scripts.seed import seed
            seed(db, settings.config)
            db.commit()

    def on_sent(refs: list[int], tx_hash: str) -> None:
        with sessionmaker() as db:
            db.execute(update(ChainTx).where(ChainTx.id.in_(refs)).values(tx_hash=tx_hash, status="sent"))
            db.commit()

    def on_rejected(refs: list[int], _reason: str) -> None:
        with sessionmaker() as db:
            db.execute(update(ChainTx).where(ChainTx.id.in_(refs)).values(status="rejected"))
            db.commit()

    services.chain.on_sent, services.chain.on_rejected = on_sent, on_rejected
    services.sms.sessionmaker = sessionmaker

    app = FastAPI(title="Grab&Surf", version="1.0",
                  description="Location de planches en liège sans personne sur place.")
    app.state.settings, app.state.services, app.state.sessionmaker = settings, services, sessionmaker
    app.state.engine = engine

    @app.exception_handler(RequestValidationError)
    async def _invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(x) for x in first.get("loc", [])[1:])
        lang = request_lang(request.headers.get("x-lang", ""), request.headers.get("accept-language", ""))
        return JSONResponse({"detail": t("invalid_request", lang, field=field or "format")}, status_code=400)

    for module in (stations, customers, rentals, partners, fleet, photos, passport, owner, inspections):
        app.include_router(module.router)

    dist = settings.frontend_dist
    if dist.is_dir():
        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            if path.startswith(("api/", "evenements")):
                raise HTTPException(404, "Introuvable.")
            target = (dist / path).resolve()
            if path and target.is_file() and dist.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")
    log.info("chain: %s (%s)", services.chain.label, services.chain.reason or services.chain.contract_address)
    return app
