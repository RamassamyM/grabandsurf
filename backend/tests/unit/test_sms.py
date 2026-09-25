import unittest

import httpx

from backend.app.services.sms import SmsService, TwilioTransport, build_sms


class FakeTransport:
    def __init__(self, fail=None):
        self.sent, self.fail = [], fail

    def send(self, phone, text):
        if self.fail:
            raise RuntimeError(self.fail)
        self.sent.append((phone, text))
        return "SM123"


class SmsTest(unittest.TestCase):
    def test_build_modes(self):
        self.assertEqual(build_sms({}).mode, "demo")
        missing = build_sms({"SMS_MODE": "twilio", "TWILIO_ACCOUNT_SID": "AC1"})
        self.assertEqual(missing.mode, "demo")
        self.assertIn("manquant", missing.reason)
        ok = build_sms({"SMS_MODE": "twilio", "TWILIO_ACCOUNT_SID": "AC1", "TWILIO_AUTH_TOKEN": "t",
                        "TWILIO_FROM": "+15005550006"})
        self.assertEqual((ok.mode, ok.label), ("twilio", "Twilio (envoi réel)"))

    def test_twilio_request_shape(self):
        seen = {}

        def handler(request):
            seen["url"], seen["body"] = str(request.url), request.content.decode()
            seen["auth"] = request.headers["authorization"]
            return httpx.Response(201, json={"sid": "SMabc"})

        t = TwilioTransport("AC1", "secret", "+15005550006", client=httpx.Client(transport=httpx.MockTransport(handler)))
        self.assertEqual(t.send("+33612345678", "Bonjour"), "SMabc")
        self.assertTrue(seen["url"].endswith("/Accounts/AC1/Messages.json"))
        self.assertIn("To=%2B33612345678", seen["body"])
        self.assertIn("From=%2B15005550006", seen["body"])
        self.assertTrue(seen["auth"].startswith("Basic "))

    def test_twilio_error_is_explained(self):
        client = httpx.Client(transport=httpx.MockTransport(
            lambda r: httpx.Response(400, json={"code": 21608, "message": "unverified number"})))
        with self.assertRaises(RuntimeError) as ctx:
            TwilioTransport("AC1", "s", "+1", client=client).send("+33600000000", "x")
        self.assertIn("21608", str(ctx.exception))

    def test_failure_does_not_raise(self):
        service = SmsService("twilio", FakeTransport(fail="down"), run=lambda job: job())
        service.dispatch(1, "+33600000000", "x")  # no sessionmaker: nothing recorded, nothing raised
