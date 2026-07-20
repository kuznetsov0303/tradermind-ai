"""Databento EQUS.MINI normalization helpers.

This file intentionally does not start a production connection yet. Day 3
creates the long-running service. Day 2 freezes the provider boundary and
normalization semantics first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from .contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)

DATABENTO_PRICE_SCALE = Decimal("1000000000")
EQUS_MINI_DATASET = "EQUS.MINI"


def databento_price_to_decimal(raw_price: int | None) -> Decimal | None:
    if raw_price is None:
        return None
    return Decimal(raw_price) / DATABENTO_PRICE_SCALE


def databento_ns_to_datetime(raw_ns: int | None) -> datetime:
    if raw_ns is None:
        return datetime.now(timezone.utc)
    return datetime.fromtimestamp(raw_ns / 1_000_000_000, tz=timezone.utc)


def normalize_mbp1_record(
    record: Any,
    *,
    symbol: str,
    received_at_ns: int | None = None,
) -> tuple[MarketEvent, ...]:
    """Normalize one Databento MBP-1 record.

    An MBP-1 trade record can contain both a trade action and current top-of-book.
    We emit one TRADE event when action == "T" and one BBO event whenever level 0
    is available. Downstream state engines therefore receive explicit event
    semantics instead of provider-specific records.
    """

    instrument_id = _optional_int(getattr(record, "instrument_id", None))
    event_time = databento_ns_to_datetime(
        _optional_int(getattr(record, "ts_event", None))
    )

    receive_ns = received_at_ns
    if receive_ns is None:
        receive_ns = _optional_int(getattr(record, "ts_recv", None))

    receive_time = databento_ns_to_datetime(receive_ns)
    action = _safe_text(getattr(record, "action", None))

    events: list[MarketEvent] = []

    if action == "T":
        trade_price = databento_price_to_decimal(
            _optional_int(getattr(record, "price", None))
        )
        trade_size = _optional_int(getattr(record, "size", None))

        if trade_price is not None and trade_size is not None:
            events.append(
                MarketEvent(
                    provider=ProviderName.DATABENTO,
                    dataset=EQUS_MINI_DATASET,
                    event_type=EventType.TRADE,
                    symbol=symbol,
                    instrument_id=instrument_id,
                    event_time=event_time,
                    receive_time=receive_time,
                    payload=TradePayload(
                        price=trade_price,
                        size=trade_size,
                        action=action,
                    ),
                    source_record_type=type(record).__name__,
                )
            )

    level0 = _first_level(record)
    if level0 is not None:
        events.append(
            MarketEvent(
                provider=ProviderName.DATABENTO,
                dataset=EQUS_MINI_DATASET,
                event_type=EventType.BBO,
                symbol=symbol,
                instrument_id=instrument_id,
                event_time=event_time,
                receive_time=receive_time,
                payload=BboPayload(
                    bid_price=databento_price_to_decimal(
                        _optional_int(getattr(level0, "bid_px", None))
                    ),
                    ask_price=databento_price_to_decimal(
                        _optional_int(getattr(level0, "ask_px", None))
                    ),
                    bid_size=_optional_int(getattr(level0, "bid_sz", None)),
                    ask_size=_optional_int(getattr(level0, "ask_sz", None)),
                    action=action,
                ),
                source_record_type=type(record).__name__,
            )
        )

    return tuple(events)


def _first_level(record: Any) -> Any | None:
    levels = getattr(record, "levels", None)
    if not levels:
        return None
    try:
        return levels[0]
    except (IndexError, TypeError):
        return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None