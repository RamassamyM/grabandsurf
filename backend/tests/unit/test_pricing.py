import unittest

from backend.app.domain import pricing
from backend.tests.helpers import config


class PricingTest(unittest.TestCase):
    def setUp(self):
        self.c = config()

    def test_per_started_minute(self):
        self.assertEqual(pricing.price_cents(0, self.c), 0)
        self.assertEqual(pricing.price_cents(1, self.c), 20)
        self.assertEqual(pricing.price_cents(60, self.c), 20)
        self.assertEqual(pricing.price_cents(61, self.c), 40)
        self.assertEqual(pricing.price_cents(3600, self.c), 1200)

    def test_day_pass_caps_a_day(self):
        self.assertEqual(pricing.price_cents(5 * 3600, self.c), 3000)
        self.assertEqual(pricing.price_cents(24 * 3600, self.c), 3000)
        self.assertEqual(pricing.price_cents(24 * 3600 + 60, self.c), 3020)

    def test_never_above_deposit(self):
        self.assertEqual(pricing.price_cents(30 * 24 * 3600, self.c), 30000)

    def test_quote_pack_then_wallet(self):
        q = pricing.quote(20 * 60, pack_minutes_left=15, wallet_balance_cents=300, config=self.c)
        self.assertEqual(q["gross_cents"], 400)
        self.assertEqual(q["pack_minutes"], 15)
        self.assertEqual(q["price_cents"], 100)
        self.assertEqual(q["wallet_used_cents"], 100)
        self.assertEqual(q["charged_cents"], 0)

    def test_quote_without_pack(self):
        q = pricing.quote(10 * 60, 0, 0, self.c)
        self.assertEqual((q["price_cents"], q["charged_cents"]), (200, 200))

    def test_timers(self):
        self.assertFalse(pricing.reminder_due(0, 599, False, self.c))
        self.assertTrue(pricing.reminder_due(0, 600, False, self.c))
        self.assertFalse(pricing.reminder_due(0, 900, True, self.c))
        self.assertFalse(pricing.not_returned(0, 1799, self.c))
        self.assertTrue(pricing.not_returned(0, 1800, self.c))

    def test_implicit_purchase_is_the_deposit(self):
        self.assertEqual(pricing.implicit_purchase_cents(self.c), 30000)
