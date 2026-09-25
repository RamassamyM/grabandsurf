"""ChainService against a real KorkoBoardV2 on a local chain: publish, special actions, history."""

import json
import tempfile
import threading
import unittest
from pathlib import Path

try:
    from eth_tester import EthereumTester
    from web3 import EthereumTesterProvider, Web3
    HAVE_TESTER = True
except ImportError:
    HAVE_TESTER = False

from backend.app.services.chain import ChainHistory, ChainService, load_contract_json, recover_signer, send_tx


@unittest.skipUnless(HAVE_TESTER, "pip install -r backend/requirements-dev.txt")
class ChainV2ServiceTest(unittest.TestCase):
    def setUp(self):
        tester = EthereumTester()
        self.w3 = Web3(EthereumTesterProvider(tester))
        self.key = tester.backend.account_keys[0].to_hex()
        account = self.w3.eth.account.from_key(self.key)
        art = load_contract_json(2)
        factory = self.w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"])
        self.chain_id = self.w3.eth.chain_id
        tx = factory.constructor(account.address, "https://x/board.png").build_transaction(
            {"from": account.address, "nonce": 0, "chainId": self.chain_id})
        signed = account.sign_transaction(tx)
        receipt = self.w3.eth.wait_for_transaction_receipt(self.w3.eth.send_raw_transaction(signed.raw_transaction))
        self.address = receipt["contractAddress"]
        c = self.w3.eth.contract(address=self.address, abi=art["abi"])
        for n in (1, 2):
            send_tx(self.w3, account, c.functions.putIntoService(n, b"A", 0), self.chain_id)
        self.tmp = Path(tempfile.mkdtemp())
        env = {"OPERATOR_KEY": self.key, "CONTRACT_ADDRESS": self.address, "CONTRACT_VERSION": "2",
               "DEPLOYMENT_BLOCK": str(receipt["blockNumber"]), "CHAIN_ID": str(self.chain_id)}
        self.chain = ChainService("personal", env, self.tmp, w3=self.w3, read_history=False)
        self.sent = []
        self.done = threading.Event()

        def on_sent(refs, h):
            self.sent.append((refs, h))
            if sum(len(r) for r, _ in self.sent) >= self.expected:
                self.done.set()
        self.chain.on_sent = on_sent
        self.chain.on_rejected = lambda refs, reason: self.fail("rejected: %s" % reason)

    def publish_all(self, events):
        self.expected = len(events)
        for e in events:
            self.chain.publish(*e)
        self.assertTrue(self.done.wait(30), "events not sent: %s" % self.sent)
        self.assertEqual(len(self.sent[0][0]), 4)  # the plain life-log events went in one batch

    def test_publish_actions_and_read_history(self):
        self.assertEqual((self.chain.mode, self.chain.version), ("real", 2))
        photo = "ab" * 32
        self.publish_all([
            (1, "korko-01", "DEPART", "A", 100),
            (2, "korko-01", "RETOUR", "A", 820),
            (3, "korko-01", "INSPECTION", "A", 830, photo),
            (4, "korko-02", "DEPART", "A", 900),
            (5, "korko-02", "CORRECTION", "A", 930, "", {"corrected_index": 1, "reason": "faux depart"}),
            (6, "korko-01", "SPONSORING", "", 940, "", {
                "sponsor_name": "Surf Shop Anglet", "artist_name": "Lea Mar", "design_hash": "cd" * 32,
                "design_uri": "https://x/design.png", "start_date": 1760000000, "end_date": 0}),
            (7, "korko-01", "VENDUE", "", 950, "", {"buyer": self.w3.eth.accounts[3]}),
        ])
        self.assertEqual(self.chain.contract.functions.ownerOf(1).call(), self.w3.eth.accounts[3])
        history = ChainHistory(self.w3, [{"address": self.address, "version": 2, "block": 0}], self.tmp)
        self.assertTrue(history.scan())
        b1 = history.board("korko-01")
        self.assertEqual([e["type"] for e in b1["events"]],
                         ["MISE_EN_SERVICE", "DEPART", "RETOUR", "INSPECTION", "VENDUE"])
        self.assertEqual(b1["events"][3]["proof"], photo)
        self.assertEqual(b1["sponsorships"][0]["artist_name"], "Lea Mar")
        b2 = history.board("korko-02")
        self.assertEqual(b2["events"][-1]["reason"], "faux depart")
        # the cache survives a restart and continues from the last scanned block
        again = ChainHistory(self.w3, [{"address": self.address, "version": 2, "block": 0}], self.tmp)
        self.assertEqual(len(again.board("korko-01")["events"]), 5)

    def test_photo_hash_signature(self):
        signed = self.chain.sign("ef" * 32)
        self.assertEqual(recover_signer("ef" * 32, signed["signature"]), signed["signer"])
        self.assertEqual(signed["signer"], self.chain.operator)


class V1SkipTest(unittest.TestCase):
    def test_v1_skips_v2_only_events(self):
        chain = ChainService("fake", {}, Path(tempfile.mkdtemp()))
        chain.version = 1
        self.assertFalse(chain.supports("INSPECTION"))
        self.assertTrue(chain.supports("RETOUR"))
        self.assertTrue(ChainService("fake", {}, Path(tempfile.mkdtemp())).supports("VENDUE"))
