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
