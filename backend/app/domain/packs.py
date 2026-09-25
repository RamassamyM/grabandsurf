"""Partner hour packs. Pure functions."""

from __future__ import annotations

import random
from typing import Any

from .wallet import CODE_ALPHABET


def minutes_left(quota: int, used: int) -> int:
    """Minutes still available on a code."""
    return max(0, quota - used)


def pack_price_cents(hours: int, config: dict[str, Any]) -> int:
    """Hours at the hourly price minus the volume discount."""
    hourly = config["pricing"]["price_per_minute_cents"] * 60
    discount = config["packs_rules"]["volume_discount_percent"]
    return hours * hourly * (100 - discount) // 100


def new_pack_code(prefix: str, rng: random.Random, taken: set[str]) -> str:
    """Code like MAIF-7K2P."""
    while True:
        code = "%s-%s" % (prefix.upper(), "".join(rng.choice(CODE_ALPHABET) for _ in range(4)))
        if code not in taken:
            return code


def split_minutes(total_minutes: int, codes: int) -> list[int]:
    """Spread the pack minutes evenly across its codes."""
    if codes <= 0:
        return []
    base, extra = divmod(total_minutes, codes)
    return [base + (1 if i < extra else 0) for i in range(codes)]
