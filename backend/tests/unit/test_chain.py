import tempfile
import unittest
from pathlib import Path

from backend.app.services.chain import ChainService, chain_config, read_deployment, token_id
from backend.app.settings import normalize_chain_mode


class ChainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.team = read_deployment()["contract"]

    def test_token_id(self):
        self.assertEqual(token_id("korko-07"), 7)

    def test_legacy_and_new_names(self):
        personal = "0x" + "1" * 40
        for env in ({"KORKO_CONTRAT": personal, "KORKO_CLE_OPERATEUR": "0xabc"},
                    {"CONTRACT_ADDRESS": personal, "OPERATOR_KEY": "0xabc"}):
            conf = chain_config(env, "auto")
            self.assertEqual((conf["CONTRACT_ADDRESS"], conf["MODE"], conf["OPERATOR_KEY"]),
                             (personal, "personal", "0xabc"))
            self.assertEqual(chain_config(env, "team")["CONTRACT_ADDRESS"], self.team)
        self.assertEqual(normalize_chain_mode("equipe"), "team")
        self.assertEqual(normalize_chain_mode("TEAM"), "team")
        self.assertEqual(chain_config({}, "auto")["MODE"], "team")

    def test_fake_mode_sends_immediately(self):
        chain = ChainService("fake", {}, self.tmp)
        sent = []
        chain.on_sent = lambda refs, h: sent.append((refs, h))
        chain.publish(1, "korko-01", "DEPART", "A", 12.7)
        chain.publish(2, "korko-01", "MISE_EN_SERVICE", "A", 1)
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0][0], [1])
        self.assertTrue(sent[0][1].startswith("0x"))
        self.assertIsNone(chain.link("tx", sent[0][1]))
        self.assertEqual(chain.status()["label"], "Simulation")

    def test_auto_without_key_is_simulation(self):
        chain = ChainService("auto", {}, self.tmp)
        self.assertEqual(chain.mode, "fake")
        self.assertIn("pas de clé", chain.reason)

    def test_off(self):
        chain = ChainService("off", {}, self.tmp)
        chain.publish(1, "korko-01", "DEPART", "A", 1)
        self.assertEqual((chain.mode, chain.status()["recent"]), ("off", []))


class RealModeTest(unittest.TestCase):
    """Real mode with a fake web3: queue on disk, background send, callback."""

    def make_w3(self, fail_first=False):
        from unittest import mock
        w3 = mock.MagicMock()
        w3.eth.account.from_key.return_value.address = "0x" + "a" * 40
        w3.eth.contract.return_value.functions.operateurs.return_value.call.return_value = True
        w3.eth.get_transaction_count.return_value = 0
        calls = {"n": 0}

        def send_raw(_raw):
            calls["n"] += 1
            if fail_first and calls["n"] == 1:
                raise ConnectionError("réseau coupé")
            return b"h"
        w3.eth.send_raw_transaction.side_effect = send_raw
        w3.eth.wait_for_transaction_receipt.return_value = {"status": 1}
        w3.to_hex.return_value = "0x" + "d" * 64
        return w3, calls

    def run_publish(self, fail_first):
        import threading
        tmp = Path(tempfile.mkdtemp())
        w3, calls = self.make_w3(fail_first)
        chain = ChainService("team", {"OPERATOR_KEY": "0x" + "1" * 64}, tmp, w3=w3, read_history=False)
        self.assertEqual((chain.mode, chain.label), ("real", "ÉQUIPE · démo · V1"))
        done = threading.Event()
        got = []
        chain.on_sent = lambda refs, h: (got.append((refs, h)), done.set())
        chain.publish(7, "korko-01", "DEPART", "A", 10)
        self.assertTrue(done.wait(10), "event never sent")
        self.assertEqual(got[0], ([7], "0x" + "d" * 64))
        self.assertEqual(chain.queue_file.read_text(), "")
        return calls

    def test_send_in_background(self):
        self.assertEqual(self.run_publish(False)["n"], 1)

    def test_network_error_is_retried(self):
        self.assertEqual(self.run_publish(True)["n"], 2)
