"""Wallet (cagnotte): return photo reward and referral. Pure functions."""

from __future__ import annotations

import random
import string
from typing import Any, Iterable, Optional

CODE_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")


def balance_cents(amounts: Iterable[int]) -> int:
    """Wallet balance = sum of ledger lines."""
    return sum(amounts)


def new_referral_code(rng: random.Random, taken: set[str]) -> str:
    """Random SURF-XXXX code, never derived from the phone number."""
    while True:
        code = "SURF-" + "".join(rng.choice(CODE_ALPHABET) for _ in range(4))
        if code not in taken:
            return code


def photo_reward_cents(rental_status: str, already_rewarded: bool, board_read: Optional[str],
                       rental_board: Optional[str], config: dict[str, Any]) -> int:
    """1 photo per rental, only for a finished rental and the right board QR."""
    if already_rewarded or rental_status != "returned" or not board_read:
        return 0
    if board_read != rental_board:
        return 0
    return config["rewards"]["return_photo_cents"]


def guest_reward_cents(config: dict[str, Any]) -> int:
    """Credit for the referred person, at sign up."""
    return config["rewards"]["referral_referee_cents"]


def sponsor_reward_cents(first_rental_finished: bool, already_rewarded: bool,
                         sponsor_rewards_so_far: int, config: dict[str, Any]) -> int:
    """Credit for the sponsor after the guest's first finished rental, within the cap."""
    if not first_rental_finished or already_rewarded:
        return 0
    if sponsor_rewards_so_far >= config["rewards"]["referral_max_per_sponsor"]:
        return 0
    return config["rewards"]["referral_sponsor_cents"]
