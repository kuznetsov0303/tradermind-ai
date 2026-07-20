from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.market_data.candle_engine import CandleIndicatorEngine
from app.market_data.contracts import (
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)


class CandleIndicatorEngineTests(unittest.TestCase):
    def event(self, at, price, size=1, symbol="AAPL"):
        return MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=EventType.TRADE,
            symbol=symbol,
            instrument_id=38,
            event_time=at,
            receive_time=at + timedelta(milliseconds=1),
            payload=TradePayload(price=Decimal(price), size=size),
        )

    def test_ohlcv_and_vwap(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        engine.apply(self.event(base, "100", 10))
        engine.apply(self.event(base + timedelta(milliseconds=500), "102", 20))
        state = engine.snapshot(now=base + timedelta(seconds=1))["symbols"]["AAPL"]
        candle = state["intervals"]["1s"]["active"]
        self.assertEqual(candle["open"], "100")
        self.assertEqual(candle["high"], "102")
        self.assertEqual(candle["low"], "100")
        self.assertEqual(candle["close"], "102")
        self.assertEqual(candle["volume"], 30)
        self.assertEqual(state["vwap"], str((Decimal("1000") + Decimal("2040")) / Decimal("30")))

    def test_bucket_roll_closes_previous(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        engine.apply(self.event(base, "100"))
        engine.apply(self.event(base + timedelta(seconds=1), "101"))
        snapshot = engine.snapshot()
        interval = snapshot["symbols"]["AAPL"]["intervals"]["1s"]
        self.assertEqual(interval["closedCount"], 1)
        self.assertTrue(interval["recentClosed"][0]["complete"])

    def test_hod_lod_and_volume(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        for price, size in [("100", 5), ("103", 7), ("99", 3)]:
            engine.apply(self.event(base, price, size))
        state = engine.snapshot()["symbols"]["AAPL"]
        self.assertEqual(state["highOfDay"], "103")
        self.assertEqual(state["lowOfDay"], "99")
        self.assertEqual(state["sessionVolume"], 15)

    def test_ema_and_atr_helpers_become_available_after_closed_bars(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 13, 30, tzinfo=timezone.utc)
        for index in range(16):
            at = base + timedelta(minutes=5 * index)
            engine.apply(self.event(at, str(100 + index)))
            engine.apply(self.event(at + timedelta(minutes=5), str(101 + index)))
        state = engine.snapshot()["symbols"]["AAPL"]
        self.assertIsNotNone(state["ema20_5m"])
        self.assertIsNotNone(state["atr14_5m"])


if __name__ == "__main__":
    unittest.main()