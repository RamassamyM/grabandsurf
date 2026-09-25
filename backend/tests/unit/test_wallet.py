import random
import unittest

from backend.app.domain import wallet
from backend.tests.helpers import config


class WalletTest(unittest.TestCase):
    def setUp(self):
        self.c = config()

    def test_balance(self):
        self.assertEqual(wallet.balance_cents([100, 200, -150]), 150)

    def test_referral_code_format_and_unique(self):
        rng = random.Random(1)
        first = wallet.new_referral_code(rng, set())
        self.assertRegex(first, r"^SURF-[A-Z0-9]{4}$")
        second = wallet.new_referral_code(random.Random(1), {first})
        self.assertNotEqual(first, second)

    def test_photo_reward_rules(self):
        self.assertEqual(wallet.photo_reward_cents("returned", False, "korko-01", "korko-01", self.c), 100)
        self.assertEqual(wallet.photo_reward_cents("returned", True, "korko-01", "korko-01", self.c), 0)
        self.assertEqual(wallet.photo_reward_cents("returned", False, "korko-02", "korko-01", self.c), 0)
        self.assertEqual(wallet.photo_reward_cents("active", False, "korko-01", "korko-01", self.c), 0)

    def test_referral_rewards(self):
        self.assertEqual(wallet.guest_reward_cents(self.c), 200)
        self.assertEqual(wallet.sponsor_reward_cents(True, False, 0, self.c), 200)
        self.assertEqual(wallet.sponsor_reward_cents(False, False, 0, self.c), 0)
        self.assertEqual(wallet.sponsor_reward_cents(True, True, 0, self.c), 0)
        self.assertEqual(wallet.sponsor_reward_cents(True, False, 10, self.c), 0)
