import unittest

from app.market_data.scanner import build_scanner_snapshot


class ScannerTests(unittest.TestCase):
    def test_valid_symbol_ranks_above_blocked_symbol(self):
        market = {
            "symbols": {
                "AAPL": {
                    "bidPrice": "100",
                    "askPrice": "100.05",
                    "lastTradePrice": "100.02",
                    "receiveAgeSeconds": 1,
                    "sessionVolume": 500000,
                    "tradeCount": 500,
                    "bboCount": 5000,
                },
                "MSFT": {
                    "bidPrice": "100",
                    "askPrice": "103",
                    "lastTradePrice": "101",
                    "receiveAgeSeconds": 1,
                    "sessionVolume": 500000,
                    "tradeCount": 500,
                    "bboCount": 5000,
                },
            }
        }

        candles = {
            "symbols": {
                "AAPL": {"sessionVolume": 500000},
                "MSFT": {"sessionVolume": 500000},
            }
        }

        result = build_scanner_snapshot(market, candles)

        self.assertEqual(result["items"][0]["symbol"], "AAPL")
        self.assertTrue(result["items"][0]["eligible"])
        self.assertFalse(result["items"][1]["eligible"])
        self.assertEqual(result["items"][1]["quote"]["quality"], "WIDE")
        self.assertTrue(result["researchOnly"])
        self.assertFalse(result["clientCutover"])


if __name__ == "__main__":
    unittest.main()