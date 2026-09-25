"""Replays the pitch demo end to end: FastAPI test client, temporary SQLite, fake services."""

import base64
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import create_app  # noqa: E402
from backend.app.settings import load_settings  # noqa: E402

EM_DASH = "—"


def make_client(tmp: Path, **overrides) -> TestClient:
    values = dict(database_url="sqlite:///%s" % (tmp / "test.db"), data_dir=tmp, chain_mode="fake",
                  alarm_sound=False, frontend_dist=tmp / "no-dist", operator_pin="", demo_mode=True,
                  secret_key="test-secret", env={"PHOTO_AI": "fake"})
    values.update(overrides)
    return TestClient(create_app(load_settings(**values)))


class Demo:
    """Small helpers to speak like a station and like a phone."""

    def __init__(self, client: TestClient):
        self.c = client

    def event(self, t, kind, board=None, station="A"):
        body = {"t": t, "station": station, "evenement": kind}
        if board:
            body["balise"] = board
        r = self.c.post("/evenements", json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def sign_up(self, phone, referral=None):
        code = self.c.post("/api/otp", json={"phone": phone}).json()["demo_code"]
        body = {"phone": phone, "code": code}
        if referral:
            body["referral_code"] = referral
        r = self.c.post("/api/otp/verify", json=body)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        headers = {"Authorization": "Bearer " + token}
        r = self.c.post("/api/card-holds", json={"card_number": "4242 4242 4242 4242"}, headers=headers)
        assert r.status_code == 200, r.text
        return headers


class DemoScenarioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.client = make_client(self.tmp)
        self.demo = Demo(self.client)
        self.services = self.client.app.state.services

    def tearDown(self):
        self.client.app.state.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_full_demo(self):
        c, d = self.client, self.demo
        d.event(100, "TIC")

        # 0:00 sign up at rack A (a friend sponsors the tourist)
        friend = d.sign_up("+33611111111")
        friend_code = c.get("/api/me", headers=friend).json()["referral_code"]
        self.assertRegex(friend_code, r"^SURF-[A-Z0-9]{4}$")
        tourist = d.sign_up("06 22 22 22 22", referral=friend_code)
        me = c.get("/api/me", headers=tourist).json()
        self.assertEqual(me["wallet_cents"], 200)  # guest credit, right away
        inbox = c.get("/api/sms", params={"phone": "+33622222222"}).json()
        self.assertTrue(any("ton code est" in m["text"] for m in inbox))

        # 0:30 MAIF pack code, "take korko-01"
        r = c.post("/api/rentals", json={"station": "A", "pack_code": "maif-surf"}, headers=tourist)
        self.assertEqual(r.status_code, 200, r.text)
        rental = r.json()
        self.assertEqual(rental["status"], "armed")
        self.assertEqual(rental["board_id"], "korko-01")

        # 0:45 departure detected, meter running, chain tx
        self.assertNotIn("alarm", d.event(130, "DEPART", "korko-01"))
        live = c.get("/api/rentals/current", headers=tourist).json()
        self.assertEqual(live["status"], "active")
        self.assertEqual(live["start_t"], 130)

        # 1:05 korko-02 leaves without a rental: alarm
        out = d.event(150, "DEPART", "korko-02")
        self.assertEqual(out["alarm"], ["korko-02"])
        self.assertEqual(self.services.alarm.rings, [("korko-02", "A")])

        # after a network cut the station resends its journal: duplicate ignored
        again = c.post("/evenements", content='{"t":150,"station":"A","balise":"korko-02","evenement":"DEPART"}\n'
                                             '{"t":160,"station":"A","evenement":"TIC"}')
        self.assertEqual(again.json()["duplicates"], 1)
        self.assertNotIn("alarm", again.json())

        # garbage never jams the station journal
        bad = c.post("/evenements", content="not json")
        self.assertEqual(bad.status_code, 200)
        self.assertIn("errors", bad.json())

        # 10 min reminder, then 1:20 korko-01 back on the rack
        d.event(130 + 600, "TIC")
        inbox = c.get("/api/sms", params={"phone": "+33622222222"}).json()
        self.assertTrue(any("Ta session tourne depuis 10 min" in m["text"] for m in inbox))
        d.event(130 + 720, "RETOUR", "korko-01")
        done = c.get("/api/rentals/%d" % rental["id"], headers=tourist).json()
        self.assertEqual(done["status"], "returned")
        receipt = done["receipt"]
        self.assertEqual(receipt["pack_minutes"], 12)
        self.assertEqual(receipt["gross_cents"], 240)
        self.assertEqual(receipt["charged_cents"], 0)
        self.assertEqual(receipt["deposit_status"], "pending_check")  # freed once the board is checked
        inbox = c.get("/api/sms", params={"phone": "+33622222222"}).json()
        self.assertIn("korko-01 rendue, 12 min", inbox[0]["text"])
        # the sponsor is credited after the guest's first finished rental
        self.assertEqual(c.get("/api/me", headers=friend).json()["wallet_cents"], 200)

        # 1:35 return photo with the right QR: +1 €, once
        img = base64.b64encode(b"fake-jpeg-bytes").decode()
        wrong = c.post("/api/photos", json={"rental_id": rental["id"], "board_qr": "korko-02", "image_base64": img},
                       headers=tourist).json()
        self.assertEqual(wrong["credited_cents"], 0)
        photo = c.post("/api/photos", json={"rental_id": rental["id"], "board_qr": "korko-01", "image_base64": img},
                       headers=tourist).json()
        self.assertEqual(photo["credited_cents"], 100)
        self.assertEqual(len(photo["sha256"]), 64)
        twice = c.post("/api/photos", json={"rental_id": rental["id"], "board_qr": "korko-01", "image_base64": img},
                       headers=tourist).json()
        self.assertEqual(twice["credited_cents"], 0)
        self.assertEqual(c.get("/api/me", headers=tourist).json()["wallet_cents"], 300)

        # 1:50 passport of korko-01
        p = c.get("/api/boards/korko-01/passport").json()
        self.assertEqual(p["sessions"], 1)
        self.assertEqual(p["minutes_surfed"], 12)
        self.assertEqual([h["event_type"] for h in p["history"]], ["RETOUR", "DEPART"])
        self.assertTrue(all(h["tx_hash"].startswith("0x") for h in p["history"]))
        self.assertEqual(p["ambassador"]["name"], "Maïa")
        self.assertEqual(p["chain"]["label"], "Simulation")

        # 2:05 operator dashboard: theft alert and 3 missions in one sentence each
        f = c.get("/api/fleet").json()
        boards = {b["id"]: b for b in f["boards"]}
        self.assertEqual(boards["korko-02"]["status"], "unauthorized")
        self.assertEqual(boards["korko-01"]["status"], "at_rack")
        self.assertTrue(any(a["kind"] == "theft" for a in f["alerts"]))
        self.assertTrue(1 <= len(f["missions"]) <= 3)
        self.assertIn("korko-02", f["missions"][0])
        self.assertTrue(all(tx["status"] == "sent" for tx in f["chain"]["txs"]))
        self.assertTrue(any(s["id"] == "B" and s["online"] is None for s in f["stations"]))

        # inspection: the operator checks the returned board and frees the deposit
        pending = c.get("/api/inspections").json()["pending"]
        self.assertEqual([p["board_id"] for p in pending], ["korko-01"])
        self.assertEqual(pending[0]["photos"][0]["suggestion"]["board_action"], "keep")
        c.post("/api/rentals/%d/release-deposit" % rental["id"], json={"role": "tournee"})
        done = c.get("/api/rentals/%d" % rental["id"], headers=tourist).json()
        self.assertTrue(done["receipt"]["deposit_released"])
        self.assertIn("caution est libérée", c.get("/api/sms", params={"phone": "+33622222222"}).json()[0]["text"])

        # 2:20 MAIF dashboard: aggregated, never a name or a phone
        m = c.get("/api/partners/maif/dashboard").json()
        self.assertEqual(m["minutes_used"], 12)
        self.assertEqual((m["sessions_count"], m["people_count"]), (1, 1))
        self.assertEqual(len(m["sessions"][0]["proofs"]), 2)
        self.assertNotIn("+336", str(m))
        self.assertIn("intégrité vérifiable", m["statement"])

        # no em dash in anything shown to people
        for payload in (inbox, f, m, p, photo):
            self.assertNotIn(EM_DASH, str(payload))

    def test_not_returned_then_operator_confirms_the_loss(self):
        c, d = self.client, self.demo
        d.event(0, "TIC")
        h = d.sign_up("+33633333333")
        rid = c.post("/api/rentals", json={"station": "A"}, headers=h).json()["id"]
        d.event(10, "DEPART", "korko-01")
        d.event(10 + 1800, "TIC")
        r = c.get("/api/rentals/%d" % rid, headers=h).json()
        self.assertEqual(r["status"], "not_returned")
        # the deposit is not captured by the timer alone
        self.assertEqual(c.get("/api/fleet").json()["revenue_cents"], 0)
        out = c.post("/api/boards/korko-01/confirm-loss", json={"role": "tournee"}).json()
        self.assertEqual(out["status"], "sold")
        self.assertEqual(c.get("/api/fleet").json()["revenue_cents"], 30000)
        p = c.get("/api/boards/korko-01/passport").json()
        self.assertEqual(p["history"][0]["event_type"], "PERDUE")

    def test_price_per_started_minute(self):
        c, d = self.client, self.demo
        d.event(0, "TIC")
        h = d.sign_up("+33644444444")
        rid = c.post("/api/rentals", json={"station": "A"}, headers=h).json()["id"]
        d.event(10, "DEPART", "korko-01")
        d.event(10 + 1700, "RETOUR", "korko-01")  # 29 minutes
        self.assertEqual(c.get("/api/rentals/%d" % rid, headers=h).json()["receipt"]["charged_cents"], 580)

    def test_manual_return_and_foreign_board(self):
        c, d = self.client, self.demo
        d.event(0, "TIC")
        h = d.sign_up("+33655555555")
        rental = c.post("/api/rentals", json={"station": "A"}, headers=h).json()
        d.event(10, "DEPART", "korko-01")
        d.event(310, "TIC")
        bad = c.post("/api/rentals/%d/manual-return" % rental["id"],
                     json={"rack_station": "B", "board_qr": "korko-02"}, headers=h)
        self.assertEqual(bad.status_code, 400)
        ok = c.post("/api/rentals/%d/manual-return" % rental["id"],
                    json={"rack_station": "B", "board_qr": "korko-01"}, headers=h).json()
        self.assertEqual((ok["return_mode"], ok["receipt"]["charged_cents"]), ("manual", 100))
        f = c.get("/api/fleet").json()
        self.assertEqual({b["id"]: b["status"] for b in f["boards"]}["korko-01"], "away_from_home")
        self.assertTrue(any("Rapatrier korko-01 de B vers A" in s for s in f["missions"]))

    def test_damage_report_reviewed_by_role(self):
        c, d = self.client, self.demo
        h = d.sign_up("+33666666666")
        rep = c.post("/api/damage-reports", json={"board_id": "korko-02", "zone": "nose"}, headers=h).json()
        self.assertNotIn("korko-02", c.get("/api/stations/A").json()["available_boards"])
        out = c.post("/api/damage-reports/%d/review" % rep["id"], json={"decision": "confirm", "role": "exploitant"}).json()
        self.assertEqual(out["board"]["status"], "workshop")
        back = c.post("/api/boards/korko-02/back-in-service", json={"role": "reparateur"}).json()
        self.assertEqual(back["status"], "at_rack")
        self.assertEqual(c.get("/api/boards/korko-02/passport").json()["repairs"], 1)

    def test_station_offline_alert(self):
        d = self.demo
        d.event(0, "TIC", station="B")
        d.event(100, "TIC", station="A")
        f = self.client.get("/api/fleet").json()
        self.assertTrue(any(a["kind"] == "station_offline" and a["station"] == "B" for a in f["alerts"]))
        d.event(101, "TIC", station="B")
        f = self.client.get("/api/fleet").json()
        self.assertFalse(any(a["kind"] == "station_offline" for a in f["alerts"]))

    def test_real_station_epoch_time(self):
        self.demo.event(1725873012.4, "TIC")
        f = self.client.get("/api/fleet").json()
        self.assertTrue(all(b["since_label"] == "0 min" for b in f["boards"]))

    def test_pack_code_typed_in_referral_field(self):
        c = self.client
        code = c.post("/api/otp", json={"phone": "+33688888888"}).json()["demo_code"]
        r = c.post("/api/otp/verify", json={"phone": "+33688888888", "code": code, "referral_code": "maif-surf"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["pack_code"], "MAIF-SURF")
        self.assertEqual(r.json()["profile"]["wallet_cents"], 0)
        code = c.post("/api/otp", json={"phone": "+33699999999"}).json()["demo_code"]
        bad = c.post("/api/otp/verify", json={"phone": "+33699999999", "code": code, "referral_code": "NOPE-1234"})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("MAIF-SURF", bad.json()["detail"])

    def _returned_rental(self, phone, board="korko-01", t0=10, minutes=12):
        c, d = self.client, self.demo
        d.event(t0 - 5, "TIC")
        h = d.sign_up(phone)
        rid = c.post("/api/rentals", json={"station": "A"}, headers=h).json()["id"]
        d.event(t0, "DEPART", board)
        d.event(t0 + minutes * 60, "RETOUR", board)
        return h, rid

    def test_photo_damage_suggestion_then_fee_withheld(self):
        c = self.client
        h, rid = self._returned_rental("+33611110000")
        img = base64.b64encode(b"fake-jpeg").decode()
        out = c.post("/api/photos", json={"rental_id": rid, "board_qr": "korko-01", "image_base64": img,
                                          "damage_zone": "fin"}, headers=h).json()
        self.assertTrue(out["damage_detected"])
        photos = c.get("/api/photos").json()
        self.assertEqual(photos[0]["suggestion"]["actions"][0]["fee_cents"], 3000)
        self.assertEqual(photos[0]["suggestion"]["board_action"], "workshop")
        self.assertEqual(c.get("/api/photos/%d/image" % photos[0]["id"]).status_code, 200)
        report = c.get("/api/fleet").json()["damage_reports"][0]
        self.assertEqual((report["zone"], report["suggested_fee_cents"]), ("fin", 3000))
        # the deposit cannot be freed while a damage waits for a decision
        self.assertEqual(c.post("/api/rentals/%d/release-deposit" % rid, json={"role": "exploitant"}).status_code, 400)
        rev = c.post("/api/damage-reports/%d/review" % report["id"],
                     json={"decision": "confirm", "role": "exploitant", "fee_cents": 2500}).json()
        self.assertEqual((rev["withheld_cents"], rev["board"]["status"]), (2500, "workshop"))
        view = c.get("/api/rentals/%d" % rid, headers=h).json()
        self.assertEqual(view["receipt"]["deposit_status"], "charged")
        self.assertEqual(c.get("/api/fleet").json()["revenue_cents"], 240 + 2500)
        self.assertIn("(aileron) après vérification : 25,00 €", c.get("/api/sms", params={"phone": "+33611110000"}).json()[0]["text"])

    def test_inspection_withhold_without_photo(self):
        c = self.client
        h, rid = self._returned_rental("+33611110001")
        s = c.post("/api/rentals/%d/withhold" % rid,
                   json={"role": "tournee", "zone": "nose", "severity": "minor"}).json()
        self.assertEqual((s["deposit_status"], s["damage_reports"][0]["fee_cents"]), ("charged", 2000))
        self.assertEqual({b["id"]: b["status"] for b in c.get("/api/fleet").json()["boards"]}["korko-01"], "at_rack")
        self.assertEqual(c.post("/api/rentals/%d/withhold" % rid, json={"zone": "nose"}).status_code, 400)

    def test_deposit_freed_by_next_rental_or_after_8h(self):
        c, d = self.client, self.demo
        h1, r1 = self._returned_rental("+33611110002", "korko-01", t0=10, minutes=5)
        h2 = d.sign_up("+33611110003")
        c.post("/api/rentals", json={"station": "A"}, headers=h2)
        d.event(1000, "DEPART", "korko-01")
        self.assertEqual(c.get("/api/rentals/%d" % r1, headers=h1).json()["receipt"]["deposit_status"], "released")
        h3, r3 = self._returned_rental("+33611110004", "korko-02", t0=2000, minutes=5)
        d.event(2000 + 300 + 28800, "TIC")
        self.assertEqual(c.get("/api/rentals/%d" % r3, headers=h3).json()["receipt"]["deposit_status"], "released")

    def test_owner_repair_fees_and_qr_codes(self):
        c = self.client
        grid = c.get("/api/repair-fees").json()
        self.assertEqual({z["zone"] for z in grid["zones"]}, {"nose", "tail", "rail", "fin", "deck", "other"})
        rows = [dict(z, fee_cents=5000) if z["zone"] == "fin" else z for z in grid["zones"]]
        self.assertEqual({z["zone"]: z["fee_cents"] for z in c.put("/api/repair-fees", json=rows).json()["zones"]}["fin"], 5000)
        self.assertEqual(c.put("/api/repair-fees", json=[r for r in rows if r["zone"] != "other"]).status_code, 400)
        c.post("/api/fleet/reset")  # the owner's grid survives a demo reset
        self.assertEqual({z["zone"]: z["fee_cents"] for z in c.get("/api/repair-fees").json()["zones"]}["fin"], 5000)
        qr = c.get("/api/qr-codes").json()
        self.assertEqual(qr["racks"][0]["path"], "/s/A")
        self.assertEqual(len(qr["boards"]), 6)

    def test_customer_language_for_errors_and_sms(self):
        c = self.client
        en = {"X-Lang": "en"}
        self.assertIn("Invalid phone", c.post("/api/otp", json={"phone": "abcdefgh"}, headers=en).json()["detail"])
        self.assertIn("Solicitud", c.post("/api/otp", json={}, headers={"X-Lang": "es"}).json()["detail"])
        code = c.post("/api/otp", json={"phone": "+34600000000"}, headers={"X-Lang": "es"}).json()["demo_code"]
        tok = c.post("/api/otp/verify", json={"phone": "+34600000000", "code": code},
                     headers={"X-Lang": "es"}).json()["token"]
        es = {"Authorization": "Bearer " + tok, "X-Lang": "es"}
        c.post("/api/card-holds", json={"card_number": "4242424242424242"}, headers=es)
        self.assertEqual(c.post("/api/rentals", json={"station": "Z"}, headers=es).json()["detail"],
                         "Estación desconocida.")
        self.demo.event(1, "TIC")
        c.post("/api/rentals", json={"station": "A"}, headers=es)
        self.demo.event(5, "DEPART", "korko-01")
        sms = c.get("/api/sms", params={"phone": "+34600000000"}).json()
        self.assertTrue(sms[0]["text"].startswith("¡Adelante con korko-01!"))
        self.assertTrue(sms[-1]["text"].startswith("Grab&Surf: tu código"))

    def test_errors_are_clear_not_500(self):
        c = self.client
        self.assertEqual(c.post("/api/otp", json={"phone": "abc"}).status_code, 400)
        self.assertEqual(c.post("/api/otp", json={}).status_code, 400)
        self.assertEqual(c.get("/api/me").status_code, 401)
        self.assertEqual(c.get("/api/boards/korko-99/passport").status_code, 404)
        h = self.demo.sign_up("+33677777777")
        self.assertEqual(c.post("/api/rentals", json={"station": "Z"}, headers=h).status_code, 404)
        self.assertEqual(c.post("/api/rentals", json={"station": "A", "pack_code": "NOPE"}, headers=h).status_code, 400)

    def test_operator_pin(self):
        client = make_client(self.tmp / "pin", operator_pin="1234")
        self.assertEqual(client.get("/api/fleet").status_code, 401)
        self.assertEqual(client.get("/api/fleet", headers={"X-Operator-Pin": "1234"}).status_code, 200)
        client.app.state.engine.dispose()

    def test_reset_demo(self):
        d = self.demo
        d.event(10, "DEPART", "korko-02")
        self.client.post("/api/fleet/reset")
        f = self.client.get("/api/fleet").json()
        self.assertTrue(all(b["status"] == "at_rack" for b in f["boards"]))
        self.assertEqual(f["alerts"], [])


if __name__ == "__main__":
    unittest.main()
