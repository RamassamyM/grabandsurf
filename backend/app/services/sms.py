"""SMS: every message is stored and shown in the demo inbox; with SMS_MODE=twilio it is also really sent.

Real sending happens in the background, after the request is committed: a rental never waits
for Twilio, and a failure is shown in the demo inbox next to the message.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

import httpx
from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from ..models import SmsMessage

log = logging.getLogger(__name__)

TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def mask(phone: str) -> str:
    return phone[:-4] + "****" if len(phone) > 4 else "****"


class TwilioTransport:
    """Twilio REST API (Messages resource), called with httpx: no extra dependency."""

    def __init__(self, account_sid: str, auth_token: str, sender: str, messaging_service_sid: str = "",
                 client: Optional[httpx.Client] = None) -> None:
        self.account_sid, self.auth_token = account_sid, auth_token
        self.sender, self.messaging_service_sid = sender, messaging_service_sid
        self.client = client or httpx.Client(timeout=15.0)

    def send(self, phone: str, text: str) -> str:
        """Return the Twilio message SID, or raise RuntimeError with Twilio's explanation."""
        data = {"To": phone, "Body": text}
        if self.messaging_service_sid:
            data["MessagingServiceSid"] = self.messaging_service_sid
        else:
            data["From"] = self.sender
        response = self.client.post(TWILIO_URL.format(sid=self.account_sid), data=data,
                                    auth=(self.account_sid, self.auth_token))
        body: dict[str, Any] = {}
        try:
            body = response.json()
        except ValueError:
            pass
        if response.status_code >= 400:
            raise RuntimeError("Twilio %s : %s" % (body.get("code", response.status_code),
                                                   body.get("message", response.text[:120])))
        return str(body.get("sid", ""))


class SmsService:
    """demo: stored and displayed only. twilio: stored, displayed and really sent."""

    def __init__(self, mode: str = "demo", transport: Any = None, reason: str = "",
                 run: Optional[Callable[[Callable[[], None]], None]] = None) -> None:
        self.mode = mode if transport is not None else "demo"
        self.transport = transport
        self.reason = reason
        self.sessionmaker: Optional[sessionmaker] = None
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="sms") if run is None else None
        self._run = run or (lambda job: self._executor.submit(job))

    @property
    def label(self) -> str:
        return "Twilio (envoi réel)" if self.mode == "twilio" else "Démo (affichage seulement)"

    def send(self, db: Session, phone: str, text: str, t: float) -> None:
        """Store the SMS; a real send is queued until the request is committed."""
        real = self.mode == "twilio"
        message = SmsMessage(phone=phone, text=text[:480], t=t, status="queued" if real else "demo")
        db.add(message)
        if real:
            db.flush()
            db.info.setdefault("sms_pending", []).append((message.id, phone, message.text))
        log.info("SMS to %s (%s): %s", mask(phone), self.mode, text)

    def dispatch(self, message_id: int, phone: str, text: str) -> None:
        """Called after commit: send in the background and record the outcome."""
        self._run(lambda: self._deliver(message_id, phone, text))

    def _deliver(self, message_id: int, phone: str, text: str) -> None:
        try:
            values = {"status": "sent", "provider_id": self.transport.send(phone, text), "error": ""}
        except Exception as e:  # network, trial restrictions, wrong number
            log.warning("SMS to %s not sent: %s", mask(phone), e)
            values = {"status": "failed", "error": str(e)[:255]}
        if self.sessionmaker is None:
            return
        with self.sessionmaker() as db:
            db.execute(update(SmsMessage).where(SmsMessage.id == message_id).values(**values))
            db.commit()


def build_sms(env: dict[str, str]) -> SmsService:
    """SMS_MODE=demo (default) or twilio, with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM."""
    if env.get("SMS_MODE", "demo").lower() != "twilio":
        return SmsService("demo", reason="SMS_MODE=demo")
    sid, token = env.get("TWILIO_ACCOUNT_SID", ""), env.get("TWILIO_AUTH_TOKEN", "")
    sender, service = env.get("TWILIO_FROM", ""), env.get("TWILIO_MESSAGING_SERVICE_SID", "")
    if not (sid and token and (sender or service)):
        log.warning("SMS_MODE=twilio but Twilio settings are missing: demo mode")
        return SmsService("demo", reason="SMS_MODE=twilio mais TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_FROM manquant")
    return SmsService("twilio", TwilioTransport(sid, token, sender, service))


# Kept for older imports.
DemoSms = SmsService
