import json
import unittest
from types import SimpleNamespace
from unittest import mock

from backend.app.services.photo_ai import ClaudePhotoAI, FakePhotoAI, build_photo_ai, detect_media_type


def response(payload, stop="end_turn"):
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="text", text=json.dumps(payload))])


DIAG = {"board_visible": True, "painted_number": "korko-01", "overall_condition": "damaged",
        "damages": [{"zone": "fin", "severity": "severe", "description": "Aileron cassé"}],
        "confidence": 1.4, "summary": "Aileron cassé — à remplacer."}


class PhotoAITest(unittest.TestCase):
    def make(self, result=None, error=None):
        client = mock.MagicMock()
        if error:
            client.beta.messages.create.side_effect = error
        else:
            client.beta.messages.create.return_value = result
        return ClaudePhotoAI("claude-opus-5", 16000, client=client), client

    def test_claude_structured_diagnosis(self):
        ai, client = self.make(response(DIAG))
        out = ai.analyze(b"\x89PNG....", "korko-01", None)
        self.assertEqual((out["engine"], out["board_read"], out["confidence"]), ("claude", "korko-01", 1.0))
        self.assertNotIn("—", out["summary"])
        kwargs = client.beta.messages.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-opus-5")
        self.assertEqual(kwargs["fallbacks"], "default")
        self.assertEqual(kwargs["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(kwargs["messages"][0]["content"][0]["source"]["media_type"], "image/png")

    def test_refusal_or_network_error_falls_back_to_simulation(self):
        for ai, _ in (self.make(response(DIAG, stop="refusal")), self.make(error=ConnectionError("down"))):
            out = ai.analyze(b"jpeg", "korko-01", "nose")
            self.assertEqual(out["engine"], "simulation")
            self.assertEqual(out["damages"][0]["zone"], "nose")

    def test_no_image_no_call(self):
        ai, client = self.make(response(DIAG))
        ai.analyze(b"", None, None)
        client.beta.messages.create.assert_not_called()

    def test_build_without_key_is_simulation(self):
        self.assertIsInstance(build_photo_ai("auto", {}, {}), FakePhotoAI)
        self.assertIsInstance(build_photo_ai("fake", {"ANTHROPIC_API_KEY": "x"}, {}), FakePhotoAI)

    def test_media_type(self):
        self.assertEqual(detect_media_type(b"\xff\xd8\xff"), "image/jpeg")
        self.assertEqual(detect_media_type(b"RIFF1234WEBP"), "image/webp")
