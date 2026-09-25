"""Board sponsorship: a partner offers a board the design of a local artist.

The partner submits (board, public names, design, gallery); the owner approves; the sponsorship
then goes on-chain (contract V2) and appears in the board passport. Only public names, never a wallet.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import get_db, get_services, get_settings, require_operator
from ..models import Board, Partner, Rental, SponsorMedia, Sponsorship
from ..services import Services
from ..services.photo_ai import detect_media_type
from ..settings import Settings
from ..workflows import clock, record_chain
from .passport import sponsorship_view

router = APIRouter(prefix="/api")
MAX_IMAGE = 4_000_000  # bytes, per image
ON_CHAIN_TEXT = re.compile(r'^[^"\\\x00-\x1f]{2,80}$')  # embedded in on-chain JSON metadata


class MediaIn(BaseModel):
    kind: Literal["image", "video"]
    image_base64: str = Field(default="", max_length=6_000_000)
    url: str = Field(default="", max_length=300)
    caption: str = Field(default="", max_length=160)


class SponsorshipIn(BaseModel):
    board_id: str
    sponsor_name: str = Field(min_length=2, max_length=80)
    sponsor_url: str = Field(default="", max_length=200)
    message: str = Field(default="", max_length=280)
    artist_name: str = Field(min_length=2, max_length=80)
    artist_bio: str = Field(default="", max_length=400)
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    design_base64: str = Field(min_length=10, max_length=6_000_000)
    media: list[MediaIn] = Field(default_factory=list, max_length=8)


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    role: str = Field(default="proprietaire", min_length=2, max_length=24)


def _decode_image(data: str) -> bytes:
    try:
        raw = base64.b64decode(data.split(",", 1)[-1], validate=False)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(400, "Image illisible.") from e
    if not raw or len(raw) > MAX_IMAGE:
        raise HTTPException(400, "Image vide ou trop lourde (4 Mo au plus).")
    if detect_media_type(raw) == "image/jpeg" and not raw.startswith(b"\xff\xd8"):
        raise HTTPException(400, "Format d'image non reconnu (JPEG, PNG, WebP ou GIF).")
    return raw


def _save(settings: Settings, folder: str, raw: bytes) -> tuple[str, str]:
    digest = hashlib.sha256(raw).hexdigest()
    target = settings.data_dir / folder
    target.mkdir(parents=True, exist_ok=True)
    path = target / ("%s.img" % digest)
    path.write_bytes(raw)
    return str(path), digest


def _unix(day: str) -> int:
    return int(datetime.combine(date.fromisoformat(day), datetime.min.time(), tzinfo=timezone.utc).timestamp()) if day else 0


def _stats(db: Session, sp: Sponsorship) -> dict[str, Any]:
    board = db.get(Board, sp.board_id)
    rentals = db.scalars(select(Rental).where(Rental.board_id == sp.board_id,
                                              Rental.status.in_(("returned", "bought")))).all()
    return {"passport_views": max(0, board.passport_views - sp.views_at_start) if sp.status != "pending" else 0,
            "sessions": len(rentals),
            "minutes_surfed": int(sum((r.end_t or 0) - (r.start_t or 0) for r in rentals) // 60)}


@router.post("/partners/{partner_id}/sponsorships", dependencies=[Depends(require_operator)])
def submit(partner_id: str, body: SponsorshipIn, db: Session = Depends(get_db), services: Services = Depends(get_services),
           settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """The partner proposes a sponsorship; it waits for the owner's approval."""
    if db.get(Partner, partner_id) is None:
        raise HTTPException(404, "Partenaire inconnu.")
    board = db.get(Board, body.board_id.strip().lower())
    if board is None:
        raise HTTPException(404, "Planche inconnue.")
    for label, value in (("sponsor", body.sponsor_name), ("artiste", body.artist_name)):
        if not ON_CHAIN_TEXT.match(value.strip()):
            raise HTTPException(400, "Nom %s invalide : 2 à 80 caractères, sans guillemet ni barre oblique inversée." % label)
    if body.end_date and body.end_date < body.start_date:
        raise HTTPException(400, "La date de fin précède la date de début.")
    if body.sponsor_url and not body.sponsor_url.startswith(("https://", "http://")):
        raise HTTPException(400, "Le lien du sponsor doit commencer par https://")
    if db.scalar(select(Sponsorship.id).where(Sponsorship.board_id == board.id, Sponsorship.status == "pending")):
        raise HTTPException(409, "Un sponsoring attend déjà la validation du propriétaire pour cette planche.")
    path, digest = _save(settings, "sponsors", _decode_image(body.design_base64))
    sp = Sponsorship(board_id=board.id, partner_id=partner_id, sponsor_name=body.sponsor_name.strip(),
                     sponsor_url=body.sponsor_url.strip(), message=body.message.strip(),
                     artist_name=body.artist_name.strip(), artist_bio=body.artist_bio.strip(),
                     design_path=path, design_sha256=digest, start_date=body.start_date,
                     end_date=body.end_date, created_t=clock(db))
    db.add(sp)
    db.flush()
    for m in body.media:
        if m.kind == "video":
            if not m.url.startswith("https://"):
                raise HTTPException(400, "Une vidéo se donne par un lien https:// (YouTube, Vimeo, fichier).")
            db.add(SponsorMedia(sponsorship_id=sp.id, kind="video", url=m.url, caption=m.caption))
        else:
            mpath, mdigest = _save(settings, "sponsors", _decode_image(m.image_base64))
            db.add(SponsorMedia(sponsorship_id=sp.id, kind="image", path=mpath, sha256=mdigest, caption=m.caption))
    db.flush()
    return dict(sponsorship_view(db, sp, services), stats=_stats(db, sp))


@router.get("/partners/{partner_id}/sponsorships", dependencies=[Depends(require_operator)])
def partner_sponsorships(partner_id: str, db: Session = Depends(get_db),
                         services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    rows = db.scalars(select(Sponsorship).where(Sponsorship.partner_id == partner_id).order_by(Sponsorship.id.desc()))
    return [dict(sponsorship_view(db, sp, services), stats=_stats(db, sp)) for sp in rows]


@router.get("/sponsorships", dependencies=[Depends(require_operator)])
def all_sponsorships(db: Session = Depends(get_db), services: Services = Depends(get_services)) -> list[dict[str, Any]]:
    """Owner: pending first, then active, then the rest."""
    order = {"pending": 0, "active": 1, "ended": 2, "rejected": 3}
    rows = sorted(db.scalars(select(Sponsorship)), key=lambda s: (order.get(s.status, 9), -s.id))
    return [dict(sponsorship_view(db, sp, services), stats=_stats(db, sp),
                 partner_name=db.get(Partner, sp.partner_id).name) for sp in rows]


def _public_url(request: Request, settings: Settings, path: str) -> str:
    base = settings.env.get("PUBLIC_BASE_URL", "").rstrip("/") or str(request.base_url).rstrip("/")
    return base + path


def _end(db: Session, sp: Sponsorship, now: float) -> None:
    sp.status = "ended"
    record_chain(db, sp.board_id, "FIN_SPONSORING", "", now, note="sponsorship:%d" % sp.id)


@router.post("/sponsorships/{sponsorship_id}/review", dependencies=[Depends(require_operator)])
def review(sponsorship_id: int, body: ReviewIn, request: Request, db: Session = Depends(get_db),
           services: Services = Depends(get_services), settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """The owner validates the content before it is published (passport and chain)."""
    sp = db.get(Sponsorship, sponsorship_id)
    if sp is None:
        raise HTTPException(404, "Sponsoring introuvable.")
    if sp.status != "pending":
        raise HTTPException(400, "Ce sponsoring a déjà été traité.")
    sp.reviewer_role = body.role
    if body.decision == "reject":
        sp.status = "rejected"
        return sponsorship_view(db, sp, services)
    now = clock(db)
    for previous in db.scalars(select(Sponsorship).where(Sponsorship.board_id == sp.board_id,
                                                         Sponsorship.status == "active")):
        _end(db, previous, now)
    sp.status = "active"
    sp.views_at_start = db.get(Board, sp.board_id).passport_views
    record_chain(db, sp.board_id, "SPONSORING", "", now, note="sponsorship:%d" % sp.id, extra={
        "sponsor_name": sp.sponsor_name, "artist_name": sp.artist_name, "design_hash": sp.design_sha256,
        "design_uri": _public_url(request, settings, "/api/sponsorships/%d/design" % sp.id),
        "start_date": _unix(sp.start_date), "end_date": _unix(sp.end_date)})
    db.flush()
    return sponsorship_view(db, sp, services)


@router.post("/sponsorships/{sponsorship_id}/end", dependencies=[Depends(require_operator)])
def end(sponsorship_id: int, db: Session = Depends(get_db), services: Services = Depends(get_services)) -> dict[str, Any]:
    sp = db.get(Sponsorship, sponsorship_id)
    if sp is None or sp.status != "active":
        raise HTTPException(400, "Aucun sponsoring actif à terminer.")
    _end(db, sp, clock(db))
    db.flush()
    return sponsorship_view(db, sp, services)


def _file(path: str) -> FileResponse:
    with open(path, "rb") as f:
        head = f.read(16)
    return FileResponse(path, media_type=detect_media_type(head), headers={"Cache-Control": "public, max-age=3600"})


@router.get("/sponsorships/{sponsorship_id}/design")
def design(sponsorship_id: int, db: Session = Depends(get_db)) -> FileResponse:
    """The design image (public: it becomes the NFT image once approved)."""
    sp = db.get(Sponsorship, sponsorship_id)
    if sp is None or not sp.design_path:
        raise HTTPException(404, "Visuel introuvable.")
    return _file(sp.design_path)


@router.get("/sponsor-media/{media_id}")
def media(media_id: int, db: Session = Depends(get_db)) -> FileResponse:
    m = db.get(SponsorMedia, media_id)
    if m is None or not m.path:
        raise HTTPException(404, "Média introuvable.")
    return _file(m.path)


@router.get("/boards/{board_id}/sponsorship-stats", dependencies=[Depends(require_operator)])
def board_stats(board_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    sp = db.scalars(select(Sponsorship).where(Sponsorship.board_id == board_id, Sponsorship.status == "active")).first()
    if sp is None:
        raise HTTPException(404, "Pas de sponsoring actif.")
    return _stats(db, sp)


