import unittest

from backend.app.domain import repairs
from backend.tests.helpers import config


class RepairsTest(unittest.TestCase):
    def setUp(self):
        c = config()["repairs"]
        self.fees = {z: v["fee_cents"] for z, v in c["zones"].items()}
        self.pct = c["severity_percent"]

    def test_fee_scaled_by_severity(self):
        self.assertEqual(repairs.fee_cents("nose", "minor", self.fees, self.pct), 2000)
        self.assertEqual(repairs.fee_cents("nose", "moderate", self.fees, self.pct), 4000)
        self.assertEqual(repairs.fee_cents("nose", "severe", self.fees, self.pct), 6000)

    def test_unknown_zone_and_severity(self):
        self.assertEqual(repairs.normalize_zone("wing", self.fees), "other")
        self.assertEqual(repairs.normalize_severity("huge"), "moderate")

    def test_no_damage_keeps_board(self):
        s = repairs.suggest([], self.fees, self.pct)
        self.assertEqual((s["board_action"], s["total_fee_cents"]), ("keep", 0))

    def test_minor_stays_rentable_severe_goes_to_workshop(self):
        minor = repairs.suggest([{"zone": "deck", "severity": "minor"}], self.fees, self.pct)
        self.assertEqual(minor["board_action"], "keep")
        both = repairs.suggest([{"zone": "fin", "severity": "severe", "description": "aileron cassé"},
                                {"zone": "rail", "severity": "minor"}], self.fees, self.pct)
        self.assertEqual(both["board_action"], "workshop")
        self.assertEqual(both["total_fee_cents"], 4500 + 1500)
        self.assertEqual(both["actions"][0]["action"], "Remplacer l'aileron et sa boîte")

    def test_no_em_dash(self):
        for zone in repairs.ACTIONS.values():
            for text in zone.values():
                self.assertNotIn("—", text)
