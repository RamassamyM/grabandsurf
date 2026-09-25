import unittest

from backend.app.domain import return_photos as rp


class ReturnPhotosTest(unittest.TestCase):
    def test_six_shots_are_required(self):
        self.assertEqual(rp.SHOTS, ("front", "back", "fins", "board_qr", "slot_qr", "station_qr"))
        self.assertEqual(rp.missing_shots([]), list(rp.SHOTS))
        self.assertEqual(rp.missing_shots(["front", "fins", "front"]), ["back", "board_qr", "slot_qr", "station_qr"])
        self.assertTrue(rp.complete(rp.SHOTS))
        self.assertFalse(rp.complete(rp.SHOTS[:-1]))

    def test_unknown_shot(self):
        self.assertEqual(rp.check_shot("selfie", None, "korko-01", "A", 3), "shot_unknown")

    def test_board_side_shots_need_no_qr(self):
        for shot in ("front", "back", "fins"):
            self.assertIsNone(rp.check_shot(shot, None, "korko-01", "A", 3))

    def test_board_qr_must_be_the_rented_board(self):
        self.assertIsNone(rp.check_shot("board_qr", "KORKO-01", "korko-01", "A", 3))
        self.assertEqual(rp.check_shot("board_qr", "korko-02", "korko-01", "A", 3), "wrong_board_qr")
        self.assertEqual(rp.check_shot("board_qr", None, "korko-01", "A", 3), "photo_qr_required")

    def test_station_qr_must_be_the_return_station(self):
        self.assertIsNone(rp.check_shot("station_qr", "a", "korko-01", "A", 3))
        self.assertEqual(rp.check_shot("station_qr", "B", "korko-01", "A", 3), "wrong_station_qr")
        self.assertEqual(rp.check_shot("station_qr", "A", "korko-01", None, 3), "return_first")

    def test_slot_qr_must_be_a_slot_of_the_return_station(self):
        self.assertIsNone(rp.check_shot("slot_qr", "a-2", "korko-01", "A", 3))
        self.assertEqual(rp.check_shot("slot_qr", "B-2", "korko-01", "A", 3), "wrong_slot_qr")
        self.assertEqual(rp.check_shot("slot_qr", "A-4", "korko-01", "A", 3), "wrong_slot_qr")
        self.assertEqual(rp.check_shot("slot_qr", "A", "korko-01", "A", 3), "wrong_slot_qr")
        self.assertEqual(rp.check_shot("slot_qr", None, "korko-01", "A", 3), "photo_qr_required")

    def test_slot_ids(self):
        self.assertEqual(rp.slot_ids("A", 3), ["A-1", "A-2", "A-3"])


if __name__ == "__main__":
    unittest.main()
