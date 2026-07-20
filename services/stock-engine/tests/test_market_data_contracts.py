from __future__ import annotations

import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.market_data.contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)
from app.market_data.databento_adapter import (
    databento_ns_to_datetime,
    databento_price_to_decimal,
    normalize_mbp1_record,
)


class MarketEventContractTests(unittest.TestCase):
    def test_price_scale(self) -> None:
        self.assertEqual(
            databento_price_to_decimal(333_020_000_000),
            Decimal("333.02"),
        )

    def test_nanoseconds_to_utc(self) -> None:
        value = databento_ns_to_datetime(1_700_000_000_000_000_000)
        self.assertIsNotNone(value.tzinfo)
        self.assertEqual(value.tzinfo, timezone.utc)

    def test_symbol_is_normalized(self) -> None:
        now = datetime.now(timezone.utc)
        event = MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=EventType.TRADE,
            symbol=" aapl ",
            instrument_id=38,
            event_time=now,
            receive_time=now,
            payload=TradePayload(price=Decimal("100"), size=10),
        )
        self.assertEqual(event.symbol, "AAPL")

    def test_bbo_math(self) -> None:
        payload = BboPayload(
            bid_price=Decimal("100.00"),
            ask_price=Decimal("100.10"),
            bid_size=10,
            ask_size=20,
        )
        self.assertEqual(payload.spread, Decimal("0.10"))
        self.assertEqual(payload.midpoint, Decimal("100.05"))

    def test_mbp1_trade_and_bbo_normalization(self) -> None:
        level = SimpleNamespace(
            bid_px=332_690_000_000,
            ask_px=333_600_000_000,
            bid_sz=3,
            ask_sz=40,
        )
        record = SimpleNamespace(
            instrument_id=38,
            ts_event=1_784_223_507_644_725_177,
            ts_recv=1_784_223_507_644_837_783,
            action="T",
            price=333_020_000_000,
            size=10,
            levels=[level],
        )

        events = normalize_mbp1_record(record, symbol="AAPL")

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].event_type, EventType.TRADE)
        self.assertEqual(events[1].event_type, EventType.BBO)
        self.assertEqual(events[0].payload.price, Decimal("333.02"))
        self.assertEqual(events[1].payload.bid_price, Decimal("332.69"))
        self.assertEqual(events[1].payload.ask_price, Decimal("333.6"))

    def test_quote_only_update_emits_bbo_only(self) -> None:
        level = SimpleNamespace(
            bid_px=100_000_000_000,
            ask_px=100_100_000_000,
            bid_sz=50,
            ask_sz=60,
        )
        record = SimpleNamespace(
            instrument_id=1,
            ts_event=1_700_000_000_000_000_000,
            ts_recv=1_700_000_000_000_100_000,
            action="A",
            price=None,
            size=None,
            levels=[level],
        )

        events = normalize_mbp1_record(record, symbol="MSFT")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].event_type, EventType.BBO)


if __name__ == "__main__":
    unittest.main()