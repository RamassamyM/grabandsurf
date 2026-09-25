"""Rental price rules: per minute, day pass cap, never above the deposit."""

from __future__ import annotations

import math
from typing import Any

MINUTES_PER_DAY = 24 * 60


def started_minutes(duration_s: float) -> int:
    """Every started minute is due (0 s costs nothing)."""
    return max(0, math.ceil(max(0.0, duration_s) / 60 - 1e-9))


def price_cents(duration_s: float, config: dict[str, Any]) -> int:
    """Price of a rental: per minute, capped by a day pass per 24 h, never above the deposit."""
    p = config["pricing"]
    minutes = started_minutes(duration_s)
    days, rest = divmod(minutes, MINUTES_PER_DAY)
    price = days * p["day_pass_cents"] + min(rest * p["price_per_minute_cents"], p["day_pass_cents"])
    return min(price, p["deposit_hold_cents"])


def quote(duration_s: float, pack_minutes_left: int, wallet_balance_cents: int,
          config: dict[str, Any]) -> dict[str, int]:
    """Full bill: pack minutes first, then price, then wallet credit."""
    minutes = started_minutes(duration_s)
    pack_minutes = max(0, min(pack_minutes_left, minutes))
    gross = price_cents(duration_s, config)
    price = price_cents(max(0.0, duration_s - pack_minutes * 60), config)
    wallet_used = max(0, min(wallet_balance_cents, price))
    return {"minutes": minutes, "pack_minutes": pack_minutes, "gross_cents": gross,
            "price_cents": price, "wallet_used_cents": wallet_used,
            "charged_cents": price - wallet_used}


def reminder_due(start_t: float, now_t: float, already_sent: bool, config: dict[str, Any]) -> bool:
    """SMS reminder after the configured duration, once."""
    return not already_sent and now_t - start_t >= config["timers"]["reminder_after_s"]


def not_returned(start_t: float, now_t: float, config: dict[str, Any]) -> bool:
    """Not-returned threshold, separate from the price: it only raises an alert."""
    return now_t - start_t >= config["timers"]["not_returned_after_s"]


def implicit_purchase_cents(config: dict[str, Any]) -> int:
    """Amount captured once the operator has confirmed the loss (implicit purchase)."""
    return config["pricing"]["deposit_hold_cents"]


def format_eur(cents: int) -> str:
    """French money format: 2,40 €."""
    sign = "-" if cents < 0 else ""
    cents = abs(int(cents))
    return "%s%d,%02d €" % (sign, cents // 100, cents % 100)
