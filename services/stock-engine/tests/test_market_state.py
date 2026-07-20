from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.market_data.contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)
from app.market_data.market_state import MarketStateEngine


class MarketStateEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = MarketStateEngine()
        self.now = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)

    def event(self, event_type, payload, *, symbol="AAPL", seconds=0):
        at = self.now + timedelta(seconds=seconds)
        return MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=event_type,
            symbol=symbol,
            instrument_id=38,
            event_time=at,
            receive_time=at + timedelta(milliseconds=1),
            payload=payload,
        )

    def test_bbo_updates_spread_and_midpoint(self) -> None:
        self.engine.apply(
            self.event(
                EventType.BBO,
                BboPayload(
                    bid_price=Decimal("100.00"),
                    ask_price=Decimal("100.10"),
                    bid_size=10,
                    ask_size=20,
                ),
            )
        )

        snapshot = self.engine.snapshot(now=self.now + timedelta(seconds=1))
        state = snapshot["symbols"]["AAPL"]

        self.assertEqual(state["spread"], "0.10")
        self.assertEqual(state["midpoint"], "100.05")
        self.assertEqual(state["bboCount"], 1)

    def test_trade_updates_volume_high_low(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=10),
            )
        )
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("101"), size=20),
                seconds=1,
            )
        )
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("99"), size=5),
                seconds=2,
            )
        )

        state = self.engine.snapshot(
            now=self.now + timedelta(seconds=3)
        )["symbols"]["AAPL"]

        self.assertEqual(state["sessionVolume"], 35)
        self.assertEqual(state["tradeCount"], 3)
        self.assertEqual(state["highTradePrice"], "101")
        self.assertEqual(state["lowTradePrice"], "99")
        self.assertEqual(state["lastTradePrice"], "99")

    def test_sequence_is_global_and_monotonic(self) -> None:
        first = self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=1),
            )
        )
        second = self.engine.apply(
            self.event(
                EventType.BBO,
                BboPayload(
                    bid_price=Decimal("99"),
                    ask_price=Decimal("101"),
                    bid_size=1,
                    ask_size=1,
                ),
                symbol="MSFT",
                seconds=1,
            )
        )

        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)

    def test_new_ny_date_resets_session_counters(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=10),
            )
        )

        next_day = self.now + timedelta(days=1)

        self.engine.apply(
            MarketEvent(
                provider=ProviderName.DATABENTO,
                dataset="EQUS.MINI",
                event_type=EventType.TRADE,
                symbol="AAPL",
                instrument_id=38,
                event_time=next_day,
                receive_time=next_day + timedelta(milliseconds=1),
                payload=TradePayload(price=Decimal("102"), size=3),
            )
        )

        state = self.engine.snapshot(
            now=next_day + timedelta(seconds=1)
        )["symbols"]["AAPL"]

        self.assertEqual(state["sessionVolume"], 3)
        self.assertEqual(state["tradeCount"], 1)
        self.assertEqual(state["highTradePrice"], "102")
        self.assertEqual(state["lowTradePrice"], "102")

    def test_snapshot_freshness(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=1),
            )
        )

        fresh = self.engine.snapshot(
            now=self.now + timedelta(seconds=10)
        )["symbols"]["AAPL"]["fresh"]

        stale = self.engine.snapshot(
            now=self.now + timedelta(seconds=30)
        )["symbols"]["AAPL"]["fresh"]

        self.assertTrue(fresh)
        self.assertFalse(stale)


if __name__ == "__main__":
    unittest.main()