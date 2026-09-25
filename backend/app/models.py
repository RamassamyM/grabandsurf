"""Database tables (SQLAlchemy 2, typed style). Amounts in cents, times in flow seconds."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all tables."""


class AppState(Base):
    """Small key/value store (flow clock)."""

    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), default="")


class Station(Base):
    __tablename__ = "stations"
    id: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    last_seen_t: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    offline_alerted: Mapped[bool] = mapped_column(Boolean, default=False)


class Board(Base):
    __tablename__ = "boards"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    token_id: Mapped[int] = mapped_column(Integer)
    home_station: Mapped[str] = mapped_column(String(8))
    current_station: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    # at_rack, at_sea, away_from_home, unauthorized, not_returned, workshop, lost, sold
    status: Mapped[str] = mapped_column(String(24), default="at_rack")
    status_t: Mapped[float] = mapped_column(Float, default=0.0)
    rentals_count: Mapped[int] = mapped_column(Integer, default=0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    passport_views: Mapped[int] = mapped_column(Integer, default=0)  # anonymous count of passport openings
    beacon_installed_t: Mapped[float] = mapped_column(Float, default=0.0)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True)
    referral_code: Mapped[str] = mapped_column(String(16), unique=True)
    referred_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("customers.id"), nullable=True)
    sponsor_rewarded: Mapped[bool] = mapped_column(Boolean, default=False)
    card_hold_status: Mapped[str] = mapped_column(String(16), default="none")  # none, authorized
    card_last4: Mapped[str] = mapped_column(String(4), default="")
    lang: Mapped[str] = mapped_column(String(2), default="fr")  # fr, en, es: SMS language
    created_t: Mapped[float] = mapped_column(Float, default=0.0)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    code: Mapped[str] = mapped_column(String(8))
    expires_t: Mapped[float] = mapped_column(Float)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Partner(Base):
    __tablename__ = "partners"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))


class Pack(Base):
    __tablename__ = "packs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partners.id"))
    hours: Mapped[int] = mapped_column(Integer)
    price_cents: Mapped[int] = mapped_column(Integer)


class PackCode(Base):
    __tablename__ = "pack_codes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pack_id: Mapped[int] = mapped_column(ForeignKey("packs.id"))
    code: Mapped[str] = mapped_column(String(32), unique=True)
    minutes_quota: Mapped[int] = mapped_column(Integer)
    minutes_used: Mapped[int] = mapped_column(Integer, default=0)


class Rental(Base):
    __tablename__ = "rentals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    board_id: Mapped[Optional[str]] = mapped_column(ForeignKey("boards.id"), nullable=True)
    suggested_board_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    start_station: Mapped[str] = mapped_column(String(8))
    end_station: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    armed_t: Mapped[float] = mapped_column(Float, default=0.0)
    start_t: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    end_t: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # armed, active, not_returned, returned, bought, cancelled
    status: Mapped[str] = mapped_column(String(16), default="armed")
    return_mode: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # detected, manual
    pack_code_id: Mapped[Optional[int]] = mapped_column(ForeignKey("pack_codes.id"), nullable=True)
    pack_minutes: Mapped[int] = mapped_column(Integer, default=0)
    gross_cents: Mapped[int] = mapped_column(Integer, default=0)
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    wallet_used_cents: Mapped[int] = mapped_column(Integer, default=0)
    charged_cents: Mapped[int] = mapped_column(Integer, default=0)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    # held (during the rental), pending_check (returned, state to validate), released, charged, bought
    deposit_status: Mapped[str] = mapped_column(String(16), default="held")
    deposit_due_t: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    checked_role: Mapped[str] = mapped_column(String(24), default="")  # role only, never a name
    claim_wallet: Mapped[str] = mapped_column(String(42), default="")  # wallet given to receive the NFT


class CardHold(Base):
    __tablename__ = "card_holds"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    rental_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rentals.id"), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    captured_cents: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="authorized")  # authorized, captured, released
    reason: Mapped[str] = mapped_column(String(24), default="rental")


class WalletEntry(Base):
    __tablename__ = "wallet_ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    # photo, referral_sponsor, referral_guest, rental_discount
    reason: Mapped[str] = mapped_column(String(24))
    rental_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rentals.id"), nullable=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rental_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rentals.id"), nullable=True)
    board_id: Mapped[str] = mapped_column(String(32))
    sha256: Mapped[str] = mapped_column(String(64))
    path: Mapped[str] = mapped_column(String(255), default="")
    ai_result: Mapped[str] = mapped_column(Text, default="{}")
    rewarded: Mapped[bool] = mapped_column(Boolean, default=False)
    signature: Mapped[str] = mapped_column(String(140), default="")  # EIP-191 signature of the hash
    signer: Mapped[str] = mapped_column(String(42), default="")
    validated: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)


class DamageReport(Base):
    __tablename__ = "damage_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"))
    rental_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rentals.id"), nullable=True)
    zone: Mapped[str] = mapped_column(String(24))
    severity: Mapped[str] = mapped_column(String(16), default="moderate")  # minor, moderate, severe
    description: Mapped[str] = mapped_column(String(255), default="")
    source: Mapped[str] = mapped_column(String(16), default="customer")  # customer, photo_ai
    photo_id: Mapped[Optional[int]] = mapped_column(ForeignKey("photos.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="to_review")  # to_review, confirmed, rejected
    suggested_fee_cents: Mapped[int] = mapped_column(Integer, default=0)
    fee_cents: Mapped[int] = mapped_column(Integer, default=0)
    charged: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewer_role: Mapped[str] = mapped_column(String(24), default="")  # role only, never a name
    t: Mapped[float] = mapped_column(Float, default=0.0)


class RepairFee(Base):
    """Repair price grid, editable by the owner (seeded from config.json)."""

    __tablename__ = "repair_fees"
    zone: Mapped[str] = mapped_column(String(24), primary_key=True)
    label: Mapped[str] = mapped_column(String(48))
    fee_cents: Mapped[int] = mapped_column(Integer)


class Sponsorship(Base):
    """A partner sponsors a board with the design of a local artist (public names, given with consent)."""

    __tablename__ = "sponsorships"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), index=True)
    partner_id: Mapped[str] = mapped_column(ForeignKey("partners.id"))
    sponsor_name: Mapped[str] = mapped_column(String(80))
    sponsor_url: Mapped[str] = mapped_column(String(200), default="")
    message: Mapped[str] = mapped_column(String(280), default="")
    artist_name: Mapped[str] = mapped_column(String(80))
    artist_bio: Mapped[str] = mapped_column(String(400), default="")
    design_path: Mapped[str] = mapped_column(String(255), default="")
    design_sha256: Mapped[str] = mapped_column(String(64), default="")
    start_date: Mapped[str] = mapped_column(String(10))            # calendar dates chosen by the parties
    end_date: Mapped[str] = mapped_column(String(10), default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending, active, rejected, ended
    reviewer_role: Mapped[str] = mapped_column(String(24), default="")
    views_at_start: Mapped[int] = mapped_column(Integer, default=0)
    created_t: Mapped[float] = mapped_column(Float, default=0.0)


class SponsorMedia(Base):
    __tablename__ = "sponsor_media"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sponsorship_id: Mapped[int] = mapped_column(ForeignKey("sponsorships.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # image, video
    path: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(300), default="")
    sha256: Mapped[str] = mapped_column(String(64), default="")
    caption: Mapped[str] = mapped_column(String(160), default="")


class StationEvent(Base):
    __tablename__ = "station_events"
    __table_args__ = (UniqueConstraint("station", "board_id", "type", "t", name="uq_station_event"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station: Mapped[str] = mapped_column(String(8))
    board_id: Mapped[str] = mapped_column(String(32))
    type: Mapped[str] = mapped_column(String(16))
    t: Mapped[float] = mapped_column(Float)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # theft, not_returned, station_offline, damage, unknown_board
    kind: Mapped[str] = mapped_column(String(24))
    board_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    station: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    message: Mapped[str] = mapped_column(String(255))
    t: Mapped[float] = mapped_column(Float, default=0.0)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class Inspection(Base):
    """Operator decision log: records the validator role, never a name."""

    __tablename__ = "inspections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_id: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(24))  # damage_confirmed, damage_rejected, loss_confirmed, back_in_service
    role: Mapped[str] = mapped_column(String(24))
    t: Mapped[float] = mapped_column(Float, default=0.0)


class SmsMessage(Base):
    __tablename__ = "sms_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(String(480))
    t: Mapped[float] = mapped_column(Float, default=0.0)
    # demo (shown on screen only), queued, sent, failed
    status: Mapped[str] = mapped_column(String(16), default="demo")
    provider_id: Mapped[str] = mapped_column(String(64), default="")
    error: Mapped[str] = mapped_column(String(255), default="")


class ChainTx(Base):
    __tablename__ = "chain_txs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    board_id: Mapped[str] = mapped_column(String(32), index=True)
    rental_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    event_type: Mapped[str] = mapped_column(String(24))
    station: Mapped[str] = mapped_column(String(8), default="")
    t: Mapped[float] = mapped_column(Float)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    proof: Mapped[str] = mapped_column(String(66), default="")  # e.g. SHA-256 of an inspection photo
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending, sent, rejected, skipped
    note: Mapped[str] = mapped_column(String(120), default="")
