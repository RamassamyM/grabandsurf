import unittest

from backend.app.domain import missions
from backend.tests.helpers import config


def board(i, status="at_rack", station="A", home="A", count=0, status_t=0):
    return {"id": i, "status": status, "current_station": station, "home_station": home,
            "rentals_count": count, "status_t": status_t}


class MissionsTest(unittest.TestCase):
    def setUp(self):
        self.c = config()

    def test_priorities_and_limit(self):
        boards = [board("korko-02", "unauthorized", None, status_t=100),
                  board("korko-05", "not_returned", None, home="C"),
                  board("korko-03", "away_from_home", "A", home="B")]
        damages = [{"board_id": "korko-04", "zone": "nose", "status": "to_review"}]
        out = missions.missions(boards, damages, [], 820, self.c)
        self.assertEqual(len(out), 3)
        self.assertIn("korko-02", out[0])
        self.assertIn("12 min", out[0])
        self.assertIn("korko-05", out[1])
        self.assertIn("korko-04", out[2])

    def test_repatriation_sentence(self):
        out = missions.missions([board("korko-03", "away_from_home", "A", home="B")], [], [], 0, self.c)
        self.assertEqual(out[0], "Rapatrier korko-03 de A vers B : elle y a été rendue par un client.")

    def test_offline_station(self):
        out = missions.missions([], [], ["B"], 0, self.c)
        self.assertIn("Côte des Basques", out[0])

    def test_wear_rotation_then_default(self):
        out = missions.missions([board("korko-01", count=4), board("korko-02", count=1)], [], [], 0, self.c)
        self.assertIn("korko-01", out[0])
        self.assertIn("tournée", out[1])
        self.assertEqual(len(missions.missions([board("korko-01")], [], [], 0, self.c)), 1)

    def test_no_em_dash(self):
        boards = [board("korko-02", "unauthorized", None), board("korko-03", "away_from_home", "A", home="B")]
        for sentence in missions.missions(boards, [], ["C"], 50, self.c):
            self.assertNotIn("—", sentence)
