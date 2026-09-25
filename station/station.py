#!/usr/bin/env python3
"""Station code: korko-kit/station_exemple.py plus a disk journal, a restart state and the alarm.

    python3 station/station.py --source localhost:8420        simulator
    python3 station/station.py --source 192.168.8.100:8420    real station A

- every event is written to data/station_<X>.ndjson BEFORE it is sent, and removed
  only once the backend has answered: a network cut or a crash loses nothing, and
  the journal is sent in order when the network comes back;
- the boards present at the rack are saved in data/station_<X>.state.json: after a
  restart the station resumes from this last known state instead of assuming every
  board is at the rack;
- if the backend answers {"alarm": [...]}, the station rings (buzzer on the Pi,
  terminal bell and sound here).

Kit rule: never time.time(), always the t field of the flow.
"""

import json
import os
import shutil
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "korko-kit"))  # the organisers' kit is read-only: imported, never edited

from korko import Detecteur, lancer, planches_de  # noqa: E402

CLOUD = os.environ.get("KORKO_CLOUD", "http://localhost:9000/evenements")
DATA_DIR = os.environ.get("STATION_DATA_DIR", os.path.join(ROOT, "data"))

THRESHOLD = -80    # dBm: weaker than this, the board is not counted
SILENCE = 10       # seconds without an audible packet = the board has left
SOUNDS = [["afplay", "/System/Library/Sounds/Sosumi.aiff"],
          ["paplay", "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga"]]


class Station(Detecteur):

    PERIODE_TIC = 1.0

    def __init__(self):
        self.seen = {}          # board -> t of the last packet above the threshold
        self.station = os.environ.get("STATION_ID", "A")
        self.journal = []       # events the backend has not acknowledged yet
        self.cloud_ok = None
        self.started = False
        self.last_t = None
        self._load_journal()
        print("station : décisions envoyées à %s, journal %s" % (CLOUD, self.journal_path()), file=sys.stderr)
        if self.journal:
            print("station : %d événement(s) en attente depuis le dernier arrêt" % len(self.journal), file=sys.stderr)

    # -- files ---------------------------------------------------------------
    def journal_path(self):
        return os.path.join(DATA_DIR, "station_%s.ndjson" % self.station)

    def state_path(self):
        return os.path.join(DATA_DIR, "station_%s.state.json" % self.station)

    def _load_journal(self):
        self.journal = []
        if os.path.exists(self.journal_path()):
            with open(self.journal_path(), encoding="utf-8") as f:
                self.journal = [json.loads(line) for line in f if line.strip()]

    def _write_atomic(self, path, text):
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    def _save_journal(self):
        self._write_atomic(self.journal_path(), "".join(json.dumps(e) + "\n" for e in self.journal))

    def _save_state(self):
        self._write_atomic(self.state_path(), json.dumps({"present": sorted(self.seen), "t": self.last_t}))

    def _load_state(self):
        try:
            with open(self.state_path(), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    # -- a radio packet arrives ---------------------------------------------
    def observation(self, o):
        self.last_t = o.t
        if not self.started:
            self.started = True
            if o.station != self.station:            # the flow tells us who we are
                self.station = o.station
                self._load_journal()
            state = self._load_state()
            present = state["present"] if state else sorted(planches_de(o.station))
            for b in present:                         # resume from the last known state
                self.seen[b] = o.t
            print("station %s : reprise, planches au rack %s" % (self.station, ", ".join(present) or "aucune"),
                  file=sys.stderr)
        if o.rssi < THRESHOLD:
            return
        if o.balise not in self.seen:                 # we did not hear it: it is coming back
            at_home = o.balise in planches_de(o.station)
            self.seen[o.balise] = o.t
            self.report("RETOUR" if at_home else "ETRANGERE", o.balise, o.t)
        self.seen[o.balise] = o.t

    # -- called even when nothing arrives -----------------------------------
    def tic(self, t):
        self.last_t = t
        for board, last in list(self.seen.items()):
            if t - last > SILENCE:
                del self.seen[board]
                self.report("DEPART", board, t)
        if self.flush():                              # backend up to date: it can move its clock
            self.send({"t": t, "station": self.station, "evenement": "TIC"})

    # -- output --------------------------------------------------------------
    def report(self, kind, board, t):
        {"DEPART": self.depart, "RETOUR": self.retour, "ETRANGERE": self.etrangere}[kind](board, t, self.station)
        self.journal.append({"t": t, "station": self.station, "balise": board, "evenement": kind})
        self._save_journal()                          # on disk before sending
        self._save_state()
        self.flush()

    def flush(self):
        """Send the journal in order; stop at the first failure and retry at the next tic."""
        while self.journal:
            if not self.send(self.journal[0]):
                return False
            self.journal.pop(0)
            self._save_journal()                      # acknowledged: off the journal
        return True

    def send(self, event):
        try:
            with urllib.request.urlopen(urllib.request.Request(
                    CLOUD, json.dumps(event).encode("utf-8"), {"Content-Type": "application/json"}),
                    timeout=1.0) as r:
                body = r.read().decode("utf-8", errors="replace")
            ok = True
        except Exception:
            ok, body = False, ""
        if ok != self.cloud_ok:
            print("station : backend %s" % ("joint" if ok else
                  "injoignable, les événements sont gardés dans le journal"), file=sys.stderr)
            self.cloud_ok = ok
        if ok:
            self.check_alarm(body)
        return ok

    def check_alarm(self, body):
        try:
            boards = json.loads(body).get("alarm") or []
        except (ValueError, AttributeError):
            return
        if boards:
            ring(boards)


def ring(boards):
    """Buzzer on the Pi; here the terminal bell and a sound."""
    print("\a*** ALARME : %s sortie sans location ***" % ", ".join(boards), file=sys.stderr, flush=True)
    for cmd in SOUNDS:
        if shutil.which(cmd[0]):
            try:
                subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
            except OSError:
                continue


if __name__ == "__main__":
    lancer(Station)
