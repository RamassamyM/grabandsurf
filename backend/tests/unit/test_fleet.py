import unittest

from backend.app.domain import fleet
from backend.tests.helpers import config


def board(i, status="at_rack", station="A", count=0, review=False):
    return {"id": i, "status": status, "current_station": station, "rentals_count": count,
            "needs_review": review, "home_station": "A", "status_t": 0}


class FleetTest(unittest.TestCase):
    def test_parse_kit_protocol(self):
        e = fleet.parse_event({"t": 12.5, "station": "A", "balise": "korko-01", "evenement": "DEPART"})
        self.assertEqual((e.t, e.station, e.board_id, e.type), (12.5, "A", "korko-01", "DEPART"))
        tic = fleet.parse_event({"t": 3, "station": "A", "evenement": "TIC"})
        self.assertIsNone(tic.board_id)

    def test_parse_rejects_garbage(self):
        for raw in [[], {"t": 1, "station": "A", "evenement": "FOO"},
                    {"station": "A", "balise": "x", "evenement": "DEPART"},
                    {"t": 1, "station": "A", "evenement": "RETOUR"}]:
            with self.assertRaises(fleet.InvalidEvent):
                fleet.parse_event(raw)

    def test_return_status(self):
        self.assertEqual(fleet.status_after_return("RETOUR", "A", "A"), "at_rack")
        self.assertEqual(fleet.status_after_return("ETRANGERE", "B", "A"), "away_from_home")

    def test_pick_least_used_available(self):
        boards = [board("korko-01", count=3), board("korko-02", count=1),
                  board("korko-03", station="B"), board("korko-04", review=True)]
        self.assertEqual(fleet.pick_board(boards, "A", set()), "korko-02")
        self.assertEqual(fleet.pick_board(boards, "A", {"korko-02"}), "korko-01")
        self.assertIsNone(fleet.pick_board(boards, "C", set()))

    def test_station_online(self):
        c = config()
        self.assertIsNone(fleet.station_online(None, 100, c))
        self.assertTrue(fleet.station_online(50, 100, c))
        self.assertFalse(fleet.station_online(10, 100, c))

    def test_format_duration(self):
        self.assertEqual(fleet.format_duration(125), "2 min")
        self.assertEqual(fleet.format_duration(3900), "1 h 05")
