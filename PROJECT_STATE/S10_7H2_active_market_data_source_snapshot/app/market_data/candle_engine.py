"""Event-time OHLCV candles and deterministic core indicators."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from threading import RLock
from typing import Any
from zoneinfo import ZoneInfo

from .contracts import EventType, MarketEvent, TradePayload

NEW_YORK = ZoneInfo("America/New_York")
INTERVALS = {"1s": 1, "1m": 60, "5m": 300}


@dataclass(slots=True)
class Candle:
    symbol: str
    interval: str
    start: datetime
    end: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int = 0
    trade_count: int = 0
    complete: bool = False

    def update(self, price: Decimal, size: int) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.volume += size
        self.trade_count += 1


class CandleIndicatorEngine:
    def __init__(self, max_closed_per_interval: int = 500) -> None:
        self._lock = RLock()
        self._active: dict[tuple[str, str], Candle] = {}
        self._closed: dict[tuple[str, str], list[Candle]] = {}
        self._max_closed = max_closed_per_interval
        self._session_date: dict[str, str] = {}
        self._cum_pv: dict[str, Decimal] = {}
        self._cum_volume: dict[str, int] = {}
        self._hod: dict[str, Decimal] = {}
        self._lod: dict[str, Decimal] = {}
        self._opening_range: dict[str, dict[str, Decimal | bool | None]] = {}
        self._applied_trades = 0
        self._last_trade_at: datetime | None = None
        self._last_trade_at_by_symbol: dict[str, datetime] = {}
    def apply(self, event: MarketEvent) -> None:
        if event.event_type is not EventType.TRADE:
            return
        if not isinstance(event.payload, TradePayload):
            raise TypeError("TRADE payload must be TradePayload")

        with self._lock:
            self._roll_session_if_needed(event)
            price = event.payload.price
            size = event.payload.size
            symbol = event.symbol

            self._cum_pv[symbol] = (
                self._cum_pv.get(symbol, Decimal("0"))
                + price * Decimal(size)
            )
            self._cum_volume[symbol] = self._cum_volume.get(symbol, 0) + size
            self._hod[symbol] = max(self._hod.get(symbol, price), price)
            self._lod[symbol] = min(self._lod.get(symbol, price), price)
            self._update_opening_range(event)

            for interval, seconds in INTERVALS.items():
                self._apply_interval(event, interval, seconds)

            self._applied_trades += 1
            self._last_trade_at = event.event_time
            self._last_trade_at_by_symbol[event.symbol] = event.event_time
    def snapshot(self, now: datetime | None = None) -> dict[str, Any]:
        generated = now or datetime.now(timezone.utc)
        with self._lock:
            symbols = sorted(
                set(self._session_date)
                | {symbol for symbol, _ in self._active}
            )
            return {
                "schemaVersion": 1,
                "generatedAt": generated.isoformat(),
                "appliedTrades": self._applied_trades,
                "lastTradeAt": (
                    self._last_trade_at.isoformat()
                    if self._last_trade_at else None
                ),
                "symbolCount": len(symbols),
                "symbols": {
                    symbol: self._symbol_snapshot(symbol, generated)
                    for symbol in symbols
                },
            }

    def hydrate_from_snapshot(
        self,
        snapshot: dict[str, Any] | None,
    ) -> int:
        if not isinstance(snapshot, dict):
            return 0

        generated_raw = snapshot.get("generatedAt")
        try:
            generated = datetime.fromisoformat(
                str(generated_raw).replace("Z", "+00:00")
            )
        except Exception:
            generated = datetime.now(timezone.utc)

        current_date = generated.astimezone(NEW_YORK).date().isoformat()
        symbols = snapshot.get("symbols")
        if not isinstance(symbols, dict):
            return 0

        restored = 0
        with self._lock:
            for symbol, data in symbols.items():
                if not isinstance(data, dict):
                    continue
                if data.get("tradingDateNy") != current_date:
                    continue

                volume = int(data.get("sessionVolume") or 0)
                vwap_raw = data.get("vwap")
                self._session_date[symbol] = current_date
                self._cum_volume[symbol] = volume
                self._cum_pv[symbol] = (
                    Decimal(str(vwap_raw)) * Decimal(volume)
                    if volume > 0 and vwap_raw is not None
                    else Decimal("0")
                )

                hod_raw = data.get("highOfDay")
                lod_raw = data.get("lowOfDay")
                if hod_raw is not None:
                    self._hod[symbol] = Decimal(str(hod_raw))
                if lod_raw is not None:
                    self._lod[symbol] = Decimal(str(lod_raw))

                opening = data.get("openingRange5m") or {}
                self._opening_range[symbol] = {
                    "high": Decimal(str(opening["high"])) if opening.get("high") is not None else None,
                    "low": Decimal(str(opening["low"])) if opening.get("low") is not None else None,
                    "complete": bool(
                        opening.get("complete")
                        or (
                            opening.get("high") is not None
                            and opening.get("low") is not None
                            and generated.astimezone(NEW_YORK).time() >= time(9, 35)
                        )
                    ),
                }

                age = data.get("lastTradeAgeSeconds")
                if isinstance(age, (int, float)):
                    last_trade = generated - timedelta(seconds=max(0.0, float(age)))
                    self._last_trade_at_by_symbol[symbol] = last_trade
                    if self._last_trade_at is None or last_trade > self._last_trade_at:
                        self._last_trade_at = last_trade

                intervals = data.get("intervals") or {}
                for interval in INTERVALS:
                    block = intervals.get(interval) or {}
                    active = block.get("active")
                    if isinstance(active, dict):
                        restored_active = candle_from_snapshot(active)
                        if restored_active is not None:
                            self._active[(symbol, interval)] = restored_active

                    restored_closed = []
                    for item in block.get("recentClosed") or []:
                        restored_candle = candle_from_snapshot(item)
                        if restored_candle is not None:
                            restored_closed.append(restored_candle)
                    if restored_closed:
                        self._closed[(symbol, interval)] = restored_closed

                restored += 1

            self._applied_trades = int(snapshot.get("appliedTrades") or self._applied_trades)

        return restored


    def _apply_interval(
        self,
        event: MarketEvent,
        interval: str,
        seconds: int,
    ) -> None:
        key = (event.symbol, interval)
        bucket_start = floor_time(event.event_time, seconds)
        bucket_end = bucket_start + timedelta(seconds=seconds)
        price = event.payload.price
        size = event.payload.size
        active = self._active.get(key)

        if active is None or active.start != bucket_start:
            if active is not None:
                active.complete = True
                closed = self._closed.setdefault(key, [])
                closed.append(active)
                del closed[:-self._max_closed]

            active = Candle(
                symbol=event.symbol,
                interval=interval,
                start=bucket_start,
                end=bucket_end,
                open=price,
                high=price,
                low=price,
                close=price,
            )
            self._active[key] = active

        active.update(price, size)

    def _roll_session_if_needed(self, event: MarketEvent) -> None:
        symbol = event.symbol
        trading_date = event.event_time.astimezone(NEW_YORK).date().isoformat()
        if self._session_date.get(symbol) == trading_date:
            return

        self._session_date[symbol] = trading_date
        self._cum_pv[symbol] = Decimal("0")
        self._cum_volume[symbol] = 0
        self._hod.pop(symbol, None)
        self._lod.pop(symbol, None)
        self._opening_range[symbol] = {
            "high": None,
            "low": None,
            "complete": False,
        }
        self._last_trade_at_by_symbol.pop(symbol, None)

        for key in [key for key in self._active if key[0] == symbol]:
            self._active.pop(key, None)

        for key in [key for key in self._closed if key[0] == symbol]:
            self._closed.pop(key, None)
    def _update_opening_range(self, event: MarketEvent) -> None:
        local = event.event_time.astimezone(NEW_YORK)
        symbol = event.symbol
        opening = self._opening_range.setdefault(
            symbol,
            {"high": None, "low": None, "complete": False},
        )

        if time(9, 30) <= local.time() < time(9, 35):
            price = event.payload.price
            opening["high"] = (
                price if opening["high"] is None
                else max(opening["high"], price)
            )
            opening["low"] = (
                price if opening["low"] is None
                else min(opening["low"], price)
            )
        elif local.time() >= time(9, 35):
            opening["complete"] = (
                opening["high"] is not None
                and opening["low"] is not None
            )

    def _symbol_snapshot(
        self,
        symbol: str,
        generated: datetime,
    ) -> dict[str, Any]:
        volume = self._cum_volume.get(symbol, 0)
        vwap = (
            self._cum_pv.get(symbol, Decimal("0")) / Decimal(volume)
            if volume > 0 else None
        )

        intervals = {}
        for interval in INTERVALS:
            key = (symbol, interval)
            active = self._active.get(key)
            closed = list(self._closed.get(key, []))
            intervals[interval] = {
                "active": serialize_candle(active),
                "closedCount": len(closed),
                "recentClosed": [
                    serialize_candle(candle) for candle in closed[-20:]
                ],
            }

        closed_5m = list(self._closed.get((symbol, "5m"), []))
        ema20 = calculate_ema(
            [candle.close for candle in closed_5m],
            period=20,
        )
        atr14 = calculate_atr(closed_5m, period=14)
        opening = self._opening_range.get(symbol) or {}

        age = None
        symbol_last_trade_at = self._last_trade_at_by_symbol.get(symbol)
        if symbol_last_trade_at is not None:
            age = max(
                0.0,
                (generated - symbol_last_trade_at).total_seconds(),
            )
        return {
            "tradingDateNy": self._session_date.get(symbol),
            "sessionVolume": volume,
            "vwap": decimal_string(vwap),
            "highOfDay": decimal_string(self._hod.get(symbol)),
            "lowOfDay": decimal_string(self._lod.get(symbol)),
            "ema20_5m": decimal_string(ema20),
            "atr14_5m": decimal_string(atr14),
            "openingRange5m": {
                "high": decimal_string(opening.get("high")),
                "low": decimal_string(opening.get("low")),
                "complete": bool(opening.get("complete")),
            },
            "lastTradeAgeSeconds": age,
            "intervals": intervals,
        }



def candle_from_snapshot(data: dict[str, Any]) -> Candle | None:
    try:
        return Candle(
            symbol=str(data["symbol"]),
            interval=str(data["interval"]),
            start=datetime.fromisoformat(str(data["start"]).replace("Z", "+00:00")),
            end=datetime.fromisoformat(str(data["end"]).replace("Z", "+00:00")),
            open=Decimal(str(data["open"])),
            high=Decimal(str(data["high"])),
            low=Decimal(str(data["low"])),
            close=Decimal(str(data["close"])),
            volume=int(data.get("volume") or 0),
            trade_count=int(data.get("tradeCount") or 0),
            complete=bool(data.get("complete")),
        )
    except Exception:
        return None


def floor_time(value: datetime, seconds: int) -> datetime:
    epoch = int(value.timestamp())
    floored = epoch - (epoch % seconds)
    return datetime.fromtimestamp(floored, tz=timezone.utc)


def calculate_ema(
    values: list[Decimal],
    period: int,
) -> Decimal | None:
    if not values:
        return None
    multiplier = Decimal("2") / Decimal(period + 1)
    ema = values[0]
    for value in values[1:]:
        ema = (value - ema) * multiplier + ema
    return ema


def calculate_atr(
    candles: list[Candle],
    period: int,
) -> Decimal | None:
    if len(candles) < 2:
        return None

    true_ranges: list[Decimal] = []
    previous_close = candles[0].close
    for candle in candles[1:]:
        true_range = max(
            candle.high - candle.low,
            abs(candle.high - previous_close),
            abs(candle.low - previous_close),
        )
        true_ranges.append(true_range)
        previous_close = candle.close

    if not true_ranges:
        return None

    window = true_ranges[-period:]
    return sum(window, Decimal("0")) / Decimal(len(window))


def serialize_candle(candle: Candle | None) -> dict[str, Any] | None:
    if candle is None:
        return None
    return {
        "symbol": candle.symbol,
        "interval": candle.interval,
        "start": candle.start.isoformat(),
        "end": candle.end.isoformat(),
        "open": decimal_string(candle.open),
        "high": decimal_string(candle.high),
        "low": decimal_string(candle.low),
        "close": decimal_string(candle.close),
        "volume": candle.volume,
        "tradeCount": candle.trade_count,
        "complete": candle.complete,
    }


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")