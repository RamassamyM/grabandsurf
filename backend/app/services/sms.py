"""Demo SMS: messages are stored in the database and shown in the demo inbox."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models import SmsMessage

log = logging.getLogger(__name__)


class DemoSms:
    """Stores every SMS; a real provider (Twilio) would add one call here."""

    def send(self, db: Session, phone: str, text: str, t: float) -> None:
        db.add(SmsMessage(phone=phone, text=text[:480], t=t))
        log.info("SMS to %s: %s", phone[:-4] + "****", text)
