"""External effects, each with a fake version."""

from __future__ import annotations

from dataclasses import dataclass

from .alarm import Alarm
from .chain import ChainService
from .payment import FakePayment
from .photo_ai import FakePhotoAI
from .sms import DemoSms


@dataclass
class Services:
    sms: DemoSms
    payment: FakePayment
    photo_ai: FakePhotoAI
    alarm: Alarm
    chain: ChainService
