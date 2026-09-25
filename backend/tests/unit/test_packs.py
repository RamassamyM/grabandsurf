import random
import unittest

from backend.app.domain import packs
from backend.tests.helpers import config


class PacksTest(unittest.TestCase):
    def test_minutes_left(self):
        self.assertEqual(packs.minutes_left(600, 100), 500)
        self.assertEqual(packs.minutes_left(60, 90), 0)

    def test_price_with_volume_discount(self):
        self.assertEqual(packs.pack_price_cents(10, config()), 9600)

    def test_code_format(self):
        self.assertRegex(packs.new_pack_code("maif", random.Random(2), set()), r"^MAIF-[A-Z0-9]{4}$")

    def test_split(self):
        self.assertEqual(packs.split_minutes(10, 3), [4, 3, 3])
        self.assertEqual(packs.split_minutes(10, 0), [])
