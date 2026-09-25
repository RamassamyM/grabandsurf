"""SQLAlchemy engine, sessions and table creation."""

from __future__ import annotations

import logging

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .models import AppState, Base


def make_engine(url: str) -> Engine:
    """Create the engine; SQLite is shared between the API and the chain thread."""
    if url.startswith("sqlite:///"):
        from pathlib import Path
        Path(url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"connect_args": {"check_same_thread": False, "timeout": 15}} if url.startswith("sqlite") else {}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _pragmas(conn, _record):  # noqa: ANN001
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return engine


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    """Session factory bound to the engine."""
    return sessionmaker(bind=engine, expire_on_commit=False)


def create_tables(engine: Engine) -> None:
    """Create every table; no migrations during the hackathon, so an outdated schema is rebuilt."""
    from sqlalchemy import inspect
    existing = inspect(engine)
    outdated = [t.name for t in Base.metadata.sorted_tables
                if existing.has_table(t.name)
                and {c.name for c in t.columns} - {c["name"] for c in existing.get_columns(t.name)}]
    if outdated:
        logging.getLogger(__name__).warning("database schema changed (%s): rebuilding the demo database",
                                            ", ".join(outdated))
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def get_clock(db: Session) -> float:
    """Current flow time: the latest t received from any station."""
    row = db.get(AppState, "clock")
    return float(row.value) if row and row.value else 0.0


def restart_clock(db: Session, t: float) -> None:
    """Move the flow clock back to t: only when the flow itself restarted."""
    row = db.get(AppState, "clock")
    if row is None:
        row = AppState(key="clock")
        db.add(row)
    row.value = repr(float(t))


def advance_clock(db: Session, t: float) -> float:
    """Move the flow clock forward (never backward) and return it."""
    row = db.get(AppState, "clock")
    if row is None:
        row = AppState(key="clock", value="0")
        db.add(row)
    current = float(row.value or 0)
    if t > current:
        row.value = repr(float(t))
        current = float(t)
    return current
