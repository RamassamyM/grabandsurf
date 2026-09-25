"""Fake card payments: authorization (hold), capture, release. No real money moves."""

from __future__ import annotations

import hashlib


class FakePayment:
    """Accepts any card number that passes a simple length check."""

    def validate_card(self, number: str) -> str:
        """Return the last 4 digits, or raise ValueError."""
        digits = "".join(c for c in number if c.isdigit())
        if not 12 <= len(digits) <= 19:
            raise ValueError("numéro de carte invalide")
        return digits[-4:]

    def authorize(self, customer_id: int, amount_cents: int) -> str:
        """Pre-authorize an amount (the 300 € hold). Returns a provider reference."""
        return "hold_" + hashlib.sha256(("%d:%d" % (customer_id, amount_cents)).encode()).hexdigest()[:12]

    def capture(self, reference: str, amount_cents: int) -> bool:
        """Take part or all of a hold."""
        return amount_cents >= 0

    def release(self, reference: str) -> bool:
        """Free what is left of a hold."""
        return True
