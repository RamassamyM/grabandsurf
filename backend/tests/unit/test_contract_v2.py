"""KorkoBoardV2 on a local in-memory chain (eth-tester, no network)."""

import base64
import json
import unittest
from pathlib import Path

try:
    from web3 import EthereumTesterProvider, Web3
    from eth_tester.exceptions import TransactionFailed
    from web3.exceptions import ContractLogicError
    REVERTED = (ContractLogicError, TransactionFailed)
    HAVE_TESTER = True
except ImportError:  # eth-tester is a dev dependency (backend/requirements-dev.txt)
    HAVE_TESTER = False

ARTIFACT = Path(__file__).resolve().parents[2] / "chain" / "contract" / "KorkoBoardV2.json"
ZERO = b"\x00" * 32


@unittest.skipUnless(HAVE_TESTER, "pip install -r backend/requirements-dev.txt")
class ContractV2Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.w3 = Web3(EthereumTesterProvider())
        cls.admin, cls.other, cls.buyer, cls.repairer = cls.w3.eth.accounts[:4]
        art = json.loads(ARTIFACT.read_text())
        cls.abi, cls.bytecode = art["abi"], art["bytecode"]

    def setUp(self):
        factory = self.w3.eth.contract(abi=self.abi, bytecode=self.bytecode)
        tx = factory.constructor(self.admin, "https://grabandsurf.example/board.png").transact({"from": self.admin})
        address = self.w3.eth.get_transaction_receipt(tx)["contractAddress"]
        self.c = self.w3.eth.contract(address=address, abi=self.abi)
        self.f = self.c.functions
        self.send(self.f.putIntoService(1, b"A", 0))
        self.send(self.f.putIntoService(2, b"A", 0))

    def send(self, fn, sender=None):
        tx = fn.transact({"from": sender or self.admin})
        return self.w3.eth.get_transaction_receipt(tx)

    def events(self, name):
        return getattr(self.c.events, name)().get_logs(from_block=0)

    def test_life_log_with_batch(self):
        self.send(self.f.record(1, 1, b"A", 100, ZERO))
        self.send(self.f.recordBatch([1, 2], [2, 1], [b"A", b"A"], [800, 900], [ZERO, ZERO]))
        s = self.f.states(1).call()
        self.assertEqual((s[0], s[1], s[2], s[3], s[4], s[5]), (b"A", b"A", 2, 800, 1, 3))
        self.assertEqual(self.f.status(2).call(), "at sea")
        self.assertEqual([e.args.eventType for e in self.events("BoardEvent")], [0, 0, 1, 2, 1])

    def test_inspection_keeps_the_photo_proof(self):
        proof = bytes.fromhex("ab" * 32)
        self.send(self.f.record(1, 7, b"A", 850, proof))
        last = self.events("BoardEvent")[-1].args
        self.assertEqual((last.eventType, last.proof), (7, proof))
        self.assertEqual(self.f.states(1).call()[1], b"A")  # an inspection does not move the board

    def test_correction_never_erases(self):
        self.send(self.f.record(2, 1, b"A", 100, ZERO))  # false departure
        self.send(self.f.correct(2, 1, b"A", 130, "faux depart: corps mouille devant la balise"))
        self.assertEqual(self.f.status(2).call(), "at the rack")
        self.assertEqual(self.events("Correction")[0].args.correctedIndex, 1)
        self.assertEqual(len(self.events("BoardEvent")), 4)
        with self.assertRaises(REVERTED):
            self.send(self.f.correct(2, 9, b"A", 140, "index inconnu"))

    def test_sold_transfers_the_nft(self):
        self.send(self.f.record(1, 6, b"A", 2000, ZERO))
        self.send(self.f.sellTo(1, self.buyer, 2100))
        self.assertEqual(self.f.ownerOf(1).call(), self.buyer)
        self.assertEqual(self.f.status(1).call(), "sold")
        self.assertEqual(self.events("Sold")[0].args.buyer, self.buyer)

    def test_roles(self):
        with self.assertRaises(REVERTED):
            self.send(self.f.record(1, 1, b"A", 1, ZERO), self.other)
        self.assertFalse(self.f.operators(self.other).call())
        self.send(self.f.grantRole(self.f.REPAIRER_ROLE().call(), self.repairer))
        self.send(self.f.record(1, 4, b"A", 5, ZERO), self.repairer)  # a repairer may log a repair
        with self.assertRaises(REVERTED):
            self.send(self.f.record(1, 1, b"A", 6, ZERO), self.repairer)  # but not a departure
        with self.assertRaises(REVERTED):
            self.send(self.f.record(1, 9, b"A", 7, ZERO))  # SOLD only through sellTo
        with self.assertRaises(REVERTED):
            self.send(self.f.sellTo(1, self.buyer, 8), self.other)

    def test_sponsorship_in_metadata(self):
        design = bytes.fromhex("cd" * 32)
        self.send(self.f.startSponsorship(1, "Surf Shop Anglet", "Lea Mar", design,
                                          "https://grabandsurf.example/design1.png", 1760000000, 0))
        sp = self.f.sponsorship(1).call()
        self.assertEqual((sp[0], sp[1], sp[2], sp[6]), ("Surf Shop Anglet", "Lea Mar", design, True))
        meta = json.loads(base64.b64decode(self.f.tokenURI(1).call().split(",", 1)[1]))
        self.assertEqual(meta["image"], "https://grabandsurf.example/design1.png")
        self.assertIn({"trait_type": "Artist", "value": "Lea Mar"}, meta["attributes"])
        self.send(self.f.endSponsorship(1, 1770000000))
        meta = json.loads(base64.b64decode(self.f.tokenURI(1).call().split(",", 1)[1]))
        self.assertEqual(meta["image"], "https://grabandsurf.example/board.png")
        self.assertEqual(self.events("SponsorshipEnded")[0].args.number, 1)

    def test_sponsorship_rejects_json_breaking_text_and_bad_dates(self):
        for args in [('Bad "name"', 1, 0), ("Ok", 20, 10)]:
            with self.assertRaises(REVERTED):
                self.send(self.f.startSponsorship(1, args[0], "Artist", ZERO, "u", args[1], args[2]))
        with self.assertRaises(REVERTED):
            self.send(self.f.startSponsorship(1, "S", "A", ZERO, "u", 0, 0), self.other)


if __name__ == "__main__":
    unittest.main()
