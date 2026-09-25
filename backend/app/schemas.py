"""JSON request formats (Pydantic). Responses are plain dicts documented on /docs."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class OtpRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class OtpVerify(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)
    referral_code: Optional[str] = None


class CardHoldRequest(BaseModel):
    card_number: str = Field(min_length=12, max_length=25)


class RentalRequest(BaseModel):
    station: str = Field(min_length=1, max_length=8)
    pack_code: Optional[str] = None


class ManualReturn(BaseModel):
    rack_station: str = Field(min_length=1, max_length=8)
    board_qr: str = Field(min_length=3, max_length=32)


class PhotoUpload(BaseModel):
    rental_id: int
    shot: Optional[str] = None  # front, back, fins, board_qr, slot_qr, station_qr (none: board_qr)
    qr: Optional[str] = None  # what the phone read on a QR shot: korko-01, A-2, A
    board_qr: Optional[str] = None  # older clients
    image_base64: str = Field(default="", max_length=8_000_000)
    damage_zone: Optional[str] = None


class DamageReportRequest(BaseModel):
    board_id: str
    zone: str = Field(min_length=2, max_length=24)
    photo_id: Optional[int] = None


class ReviewRequest(BaseModel):
    decision: Literal["confirm", "reject"]
    role: str = Field(default="exploitant", min_length=2, max_length=24)
    fee_cents: Optional[int] = Field(default=None, ge=0, le=100000)  # None: the suggested fee
    charge: bool = True                                                # withhold it from the deposit
    send_to_workshop: Optional[bool] = None                            # None: unless the damage is minor


class WithholdRequest(BaseModel):
    role: str = Field(default="exploitant", min_length=2, max_length=24)
    zone: str = Field(min_length=2, max_length=24)
    severity: Literal["minor", "moderate", "severe"] = "moderate"
    fee_cents: Optional[int] = Field(default=None, ge=0, le=100000)
    description: str = Field(default="", max_length=255)
    send_to_workshop: Optional[bool] = None


class RoleRequest(BaseModel):
    role: str = Field(default="exploitant", min_length=2, max_length=24)


class PackRequest(BaseModel):
    hours: int = Field(ge=1, le=10000)
    codes: int = Field(default=5, ge=1, le=500)


class CorrectionRequest(BaseModel):
    role: str = Field(default="exploitant", min_length=2, max_length=24)
    reason: str = Field(default="faux départ : balise masquée", min_length=3, max_length=120,
                        pattern=r'^[^"\\\x00-\x1f]+$')
