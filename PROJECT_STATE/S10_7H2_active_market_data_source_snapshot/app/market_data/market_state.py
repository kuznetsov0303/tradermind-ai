"""Deterministic provider-agnostic real-time market state engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from threading import RLock
from typing import Any
from zoneinfo import ZoneInfo

from .contracts import BboPayload, EventType, MarketEvent, TradePayload

NEW_YORK = ZoneInfo("America/New_York")


@dataclass(slots=True)
class SymbolMarketState:
    symbol: str
    instrument_id: int | None = None
    trading_date_ny: str | None = None
    sequence: int = 0
    first_event_at: datetime | None = None
    last_event_at: datetime | None = None
    last_receive_at: datetime | None = None

    bid_price: Decimal | None = None
    ask_price: Decimal | None = None
    bid_size: int | None = None
    ask_size: int | None = None
    last_trade_price: Decimal | None = None
    last_trade_size: int | None = None

    session_volume: int = 0
    trade_count: int = 0
    bbo_count: int = 0
    total_event_count: int = 0

    high_trade_price: Decimal | None = None
    low_trade_price: Decimal | None = None

    @property
    def spread(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return self.ask_price - self.bid_price

    @property
    def midpoint(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return (self.bid_price + self.ask_price) / Decimal("2")


class MarketStateEngine:
    """Consumes canonical MarketEvent objects and maintains live symbol state."""

    def __init__(self) -> None:
        self._states: dict[str, SymbolMarketState] = {}
        self._lock = RLock()
        self._global_sequence = 0
        self._applied_events = 0
        self._ignored_events = 0
        self._last_applied_at: datetime | None = None

    def apply(self, event: MarketEvent) -> SymbolMarketState | None:
        if event.event_type not in (EventType.TRADE, EventType.BBO):
            with self._lock:
                self._ignored_events += 1
            return None

        with self._lock:
            state = self._states.get(event.symbol)
            if state is None:
                state = SymbolMarketState(symbol=event.symbol)
                self._states[event.symbol] = state

            trading_date = event.event_time.astimezone(NEW_YORK).date().isoformat()
            if state.trading_date_ny != trading_date:
                self._reset_session(state, trading_date)

            self._global_sequence += 1
            state.sequence = self._global_sequence
            state.instrument_id = event.instrument_id
            state.first_event_at = state.first_event_at or event.event_time
            state.last_event_at = event.event_time
            state.last_receive_at = event.receive_time
            state.total_event_count += 1

            if event.event_type is EventType.TRADE:
                payload = event.payload
                if not isinstance(payload, TradePayload):
                    raise TypeError("TRADE event payload must be TradePayload")
                self._apply_trade(state, payload)

            elif event.event_type is EventType.BBO:
                payload = event.payload
                if not isinstance(payload, BboPayload):
                    raise TypeError("BBO event payload must be BboPayload")
                self._apply_bbo(state, payload)

            self._applied_events += 1
            self._last_applied_at = datetime.now(timezone.utc)
            return state

    def snapshot(self, *, now: datetime | None = None) -> dict[str, Any]:
        generated_at = now or datetime.now(timezone.utc)

        with self._lock:
            symbols = {
                symbol: self._serialize_state(state, generated_at)
                for symbol, state in sorted(self._states.items())
            }

            return {
                "schemaVersion": 1,
                "generatedAt": generated_at.isoformat(),
                "globalSequence": self._global_sequence,
                "appliedEvents": self._applied_events,
                "ignoredEvents": self._ignored_events,
                "symbolCount": len(symbols),
                "lastAppliedAt": (
                    self._last_applied_at.isoformat()
                    if self._last_applied_at
                    else None
                ),
                "symbols": symbols,
            }

    def get(self, symbol: str) -> SymbolMarketState | None:
        with self._lock:
            return self._states.get(symbol.strip().upper())

    @staticmethod
    def _reset_session(state: SymbolMarketState, trading_date: str) -> None:
        state.trading_date_ny = trading_date
        state.first_event_at = None
        state.last_event_at = None
        state.last_receive_at = None
        state.session_volume = 0
        state.trade_count = 0
        state.bbo_count = 0
        state.total_event_count = 0
        state.high_trade_price = None
        state.low_trade_price = None

    @staticmethod
    def _apply_trade(
        state: SymbolMarketState,
        payload: TradePayload,
    ) -> None:
        state.last_trade_price = payload.price
        state.last_trade_size = payload.size
        state.session_volume += payload.size
        state.trade_count += 1

        if (
            state.high_trade_price is None
            or payload.price > state.high_trade_price
        ):
            state.high_trade_price = payload.price

        if (
            state.low_trade_price is None
            or payload.price < state.low_trade_price
        ):
            state.low_trade_price = payload.price

    @staticmethod
    def _apply_bbo(
        state: SymbolMarketState,
        payload: BboPayload,
    ) -> None:
        state.bid_price = payload.bid_price
        state.ask_price = payload.ask_price
        state.bid_size = payload.bid_size
        state.ask_size = payload.ask_size
        state.bbo_count += 1

    @staticmethod
    def _serialize_state(
        state: SymbolMarketState,
        generated_at: datetime,
    ) -> dict[str, Any]:
        event_age = None
        receive_age = None

        if state.last_event_at is not None:
            event_age = (
                generated_at - state.last_event_at
            ).total_seconds()

        if state.last_receive_at is not None:
            receive_age = (
                generated_at - state.last_receive_at
            ).total_seconds()

        return {
            "symbol": state.symbol,
            "instrumentId": state.instrument_id,
            "tradingDateNy": state.trading_date_ny,
            "sequence": state.sequence,
            "firstEventAt": (
                state.first_event_at.isoformat()
                if state.first_event_at
                else None
            ),
            "lastEventAt": (
                state.last_event_at.isoformat()
                if state.last_event_at
                else None
            ),
            "lastReceiveAt": (
                state.last_receive_at.isoformat()
                if state.last_receive_at
                else None
            ),
            "eventAgeSeconds": event_age,
            "receiveAgeSeconds": receive_age,
            "fresh": (
                receive_age is not None and receive_age <= 20
            ),
            "bidPrice": decimal_to_string(state.bid_price),
            "askPrice": decimal_to_string(state.ask_price),
            "bidSize": state.bid_size,
            "askSize": state.ask_size,
            "spread": decimal_to_string(state.spread),
            "midpoint": decimal_to_string(state.midpoint),
            "lastTradePrice": decimal_to_string(state.last_trade_price),
            "lastTradeSize": state.last_trade_size,
            "sessionVolume": state.session_volume,
            "tradeCount": state.trade_count,
            "bboCount": state.bbo_count,
            "totalEventCount": state.total_event_count,
            "highTradePrice": decimal_to_string(state.high_trade_price),
            "lowTradePrice": decimal_to_string(state.low_trade_price),
        }


def decimal_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")