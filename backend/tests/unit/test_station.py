import importlib.util
import io
import json
import tempfile
import unittest
from collections import namedtuple
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("station_module", ROOT / "station" / "station.py")
station = importlib.util.module_from_spec(spec)
spec.loader.exec_module(station)

Obs = namedtuple("Obs", "t station balise rssi")


class StationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.patch = mock.patch.object(station, "DATA_DIR", self.tmp)
        self.patch.start()
        self.quiet = mock.patch("sys.stderr", io.StringIO())
        self.quiet.start()
        self.sent = []
        self.online = False

    def tearDown(self):
        self.patch.stop()
        self.quiet.stop()

    def fake_send(self, st):
        def send(event):
            if not self.online:
                return False
            self.sent.append(event)
            return True
        st.send = send
        return st

    def new_station(self):
        st = station.Station()
        st._sortie = None  # the kit prints decisions to stdout: silence in tests
        return self.fake_send(st)

    def test_journal_survives_a_cut_and_is_sent_in_order(self):
        st = self.new_station()
        st.observation(Obs(0, "A", "korko-01", -60))
        st.observation(Obs(0, "A", "korko-02", -60))
        st.tic(11)  # both silent for more than 10 s: two departures, backend down
        lines = Path(st.journal_path()).read_text().splitlines()
        self.assertEqual([json.loads(x)["balise"] for x in lines], ["korko-01", "korko-02"])
        restarted = self.new_station()  # crash and restart: the journal is still there
        self.assertEqual(len(restarted.journal), 2)
        self.online = True
        restarted.tic(12)
        self.assertEqual([e["evenement"] for e in self.sent], ["DEPART", "DEPART", "TIC"])
        self.assertEqual(Path(st.journal_path()).read_text(), "")

    def test_resume_from_last_known_state(self):
        self.online = True
        st = self.new_station()
        st.observation(Obs(0, "A", "korko-01", -60))
        st.observation(Obs(0, "A", "korko-02", -60))
        st.tic(11)
        self.sent.clear()
        # restart while both boards are at sea: no new departure is invented
        st2 = self.new_station()
        st2.observation(Obs(100, "A", "korko-03", -95))
        st2.tic(150)
        self.assertEqual([e for e in self.sent if e["evenement"] == "DEPART"], [])

    def test_alarm_in_response_rings(self):
        st = self.new_station()
        with mock.patch.object(station, "ring") as ring:
            st.check_alarm('{"ok": true, "alarm": ["korko-02"]}')
            st.check_alarm('{"ok": true}')
            st.check_alarm("oops")
        ring.assert_called_once_with(["korko-02"])
