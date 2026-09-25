"""External effects, each with a fake version."""

from __future__ import annotations

from dataclasses import dataclass

from .alarm import Alarm
from .chain import ChainService
from .payment import FakePayment
from .photo_ai import FakePhotoAI
from .sms import SmsService


@dataclass
class Services:
    sms: SmsService
    payment: FakePayment
    photo_ai: FakePhotoAI
    alarm: Alarm
    chain: ChainService
    public_base_url: str = ""  # prefix of the links sent by SMS (empty: relative links, fine for the demo)
