from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.config import get_settings


US_EASTERN = ZoneInfo("America/New_York")
EXTENDED_CANDLE_BUFFER: dict[str, list[dict[str, Any]]] = {}


def normalize_symbol(value: Any) -> str:
    raw = str(value or "").upper().strip()
    return "".join(ch for ch in raw if ch.isalnum())


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except Exception:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None

    raw = str(value).strip()

    if raw.isdigit():
        try:
            number = int(raw)
            if number > 10_000_000_000:
                number = number / 1000
            return datetime.fromtimestamp(number, tz=timezone.utc)
        except Exception:
            pass

    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(raw.replace("Z", "+0000"), fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            continue

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _format_fmp_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _parse_regular_historical_datetime(value: Any) -> datetime | None:
    """Parse FMP historical-chart timestamps as US/Eastern exchange time.

    FMP historical-chart rows are returned as naive market timestamps
    (for example 10:30 ET), while our extended trade/quote candles are
    normalized to UTC. Without this normalization the engine sees a fake
    multi-hour gap and cuts the 5m buffer down to only 1-3 candles.
    """

    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(raw, fmt)
            parsed = parsed.replace(tzinfo=US_EASTERN)
            return parsed.astimezone(timezone.utc)
        except Exception:
            continue

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=US_EASTERN)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _normalize_regular_historical_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert regular FMP historical-chart candle dates from ET to UTC."""

    normalized: list[dict[str, Any]] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        item = dict(row)
        parsed = _parse_regular_historical_datetime(item.get("date"))
        if parsed is not None:
            item["date"] = _format_fmp_datetime(parsed)
            item["source"] = item.get("source") or "regular_historical_chart_et_to_utc"

        normalized.append(item)

    return normalized


class FmpClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.api_key = self.settings.fmp_api_key
        self.base_url = "https://financialmodelingprep.com/stable"
        self.legacy_base_url = "https://financialmodelingprep.com/api/v3"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    @staticmethod
    def normalize_list_payload(payload: Any) -> list[dict[str, Any]]:
        rows: list[Any] = []

        if isinstance(payload, list):
            rows = payload
        elif isinstance(payload, dict):
            for key in (
                "data",
                "items",
                "results",
                "stocks",
                "quotes",
                "historical",
                "trades",
                "aftermarketTrades",
                "premarketTrades",
            ):
                value = payload.get(key)
                if isinstance(value, list):
                    rows = value
                    break

        return [row for row in rows if isinstance(row, dict)]

    async def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        legacy: bool = False,
    ) -> Any:
        if not self.api_key:
            raise RuntimeError("FMP_API_KEY is missing")

        base_url = self.legacy_base_url if legacy else self.base_url
        query = dict(params or {})
        query["apikey"] = self.api_key
        url = f"{base_url}/{path.lstrip('/')}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=query)
            response.raise_for_status()
            return response.json()

    async def get_biggest_gainers(self) -> list[dict[str, Any]]:
        try:
            rows = self.normalize_list_payload(await self.get_json("biggest-gainers"))
            if rows:
                return rows
        except Exception:
            pass

        payload = await self.get_json("stock_market/gainers", legacy=True)
        return self.normalize_list_payload(payload)

    async def get_biggest_losers(self) -> list[dict[str, Any]]:
        try:
            rows = self.normalize_list_payload(await self.get_json("biggest-losers"))
            if rows:
                return rows
        except Exception:
            pass

        payload = await self.get_json("stock_market/losers", legacy=True)
        return self.normalize_list_payload(payload)

    async def get_most_active(self) -> list[dict[str, Any]]:
        try:
            rows = self.normalize_list_payload(await self.get_json("most-actives"))
            if rows:
                return rows
        except Exception:
            pass

        payload = await self.get_json("stock_market/actives", legacy=True)
        return self.normalize_list_payload(payload)

    async def get_batch_quote(self, symbols: list[str]) -> list[dict[str, Any]]:
        clean_symbols: list[str] = []
        seen: set[str] = set()

        for item in symbols:
            symbol = normalize_symbol(item)
            if symbol and symbol not in seen:
                clean_symbols.append(symbol)
                seen.add(symbol)

        if not clean_symbols:
            return []

        all_rows: list[dict[str, Any]] = []

        for index in range(0, len(clean_symbols), 50):
            chunk = clean_symbols[index:index + 50]
            joined = ",".join(chunk)

            endpoints = [
                ("batch-quote", {"symbols": joined}, False),
                ("quote", {"symbol": joined}, False),
                (f"quote/{joined}", {}, True),
            ]

            for path, params, legacy in endpoints:
                try:
                    rows = self.normalize_list_payload(
                        await self.get_json(path, params, legacy=legacy)
                    )
                    if rows:
                        all_rows.extend(rows)
                        break
                except Exception:
                    continue

        return all_rows

    async def get_quote_map(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        rows = await self.get_batch_quote(symbols)
        quote_by_symbol: dict[str, dict[str, Any]] = {}

        for row in rows:
            symbol = normalize_symbol(row.get("symbol") or row.get("ticker"))
            if symbol:
                quote_by_symbol[symbol] = row

        return quote_by_symbol

    def _normalize_trade_row(self, row: dict[str, Any]) -> dict[str, Any] | None:
        price = _to_float(
            row.get("price")
            or row.get("p")
            or row.get("lastSalePrice")
            or row.get("last")
            or row.get("askPrice")
            or row.get("bidPrice")
        )

        volume = _to_int(
            row.get("volume")
            or row.get("tradeSize")
            or row.get("size")
            or row.get("shares")
            or row.get("lastSaleSize")
            or row.get("askSize")
            or row.get("bidSize")
            or 1
        )

        date_value = (
            row.get("date")
            or row.get("timestamp")
            or row.get("time")
            or row.get("datetime")
        )

        parsed_date = _parse_datetime(date_value)

        if price is None or volume is None or volume <= 0 or parsed_date is None:
            return None

        return {
            "date": _format_fmp_datetime(parsed_date),
            "price": price,
            "volume": volume,
        }

    def _trades_to_one_minute_candles(
        self,
        trades: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        buckets: dict[str, dict[str, Any]] = {}
        normalized_trades: list[dict[str, Any]] = []

        for row in trades:
            normalized = self._normalize_trade_row(row)
            if normalized:
                normalized_trades.append(normalized)

        normalized_trades.sort(key=lambda item: item["date"])

        for trade in normalized_trades:
            parsed = _parse_datetime(trade["date"])
            if parsed is None:
                continue

            bucket_time = parsed.replace(second=0, microsecond=0)
            bucket_key = _format_fmp_datetime(bucket_time)
            price = float(trade["price"])
            volume = int(trade["volume"])

            if bucket_key not in buckets:
                buckets[bucket_key] = {
                    "date": bucket_key,
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": volume,
                }
            else:
                candle = buckets[bucket_key]
                candle["high"] = max(float(candle["high"]), price)
                candle["low"] = min(float(candle["low"]), price)
                candle["close"] = price
                candle["volume"] = int(candle["volume"]) + volume

        return list(buckets.values())

    def _merge_extended_buffer(
        self,
        symbol: str,
        candles: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        clean_symbol = normalize_symbol(symbol)

        if not clean_symbol:
            return candles

        existing = EXTENDED_CANDLE_BUFFER.get(clean_symbol, [])
        by_date: dict[str, dict[str, Any]] = {}

        for candle in existing:
            date_key = str(candle.get("date") or "").strip()
            if date_key:
                by_date[date_key] = dict(candle)

        for candle in candles:
            date_key = str(candle.get("date") or "").strip()
            if not date_key:
                continue

            if date_key in by_date:
                old = by_date[date_key]
                old["open"] = old.get("open", candle.get("open"))
                old["high"] = max(
                    float(old.get("high") or candle.get("high") or 0),
                    float(candle.get("high") or 0),
                )
                old["low"] = min(
                    float(old.get("low") or candle.get("low") or 0),
                    float(candle.get("low") or 0),
                )
                old["close"] = candle.get("close")
                old["volume"] = int(old.get("volume") or 0) + int(candle.get("volume") or 0)
                by_date[date_key] = old
            else:
                by_date[date_key] = dict(candle)

        merged = list(by_date.values())
        merged.sort(key=lambda item: str(item.get("date") or ""))
        merged = merged[-240:]

        EXTENDED_CANDLE_BUFFER[clean_symbol] = merged
        return merged

    def get_extended_buffer_snapshot(self, symbol: str) -> list[dict[str, Any]]:
        clean_symbol = normalize_symbol(symbol)
        return EXTENDED_CANDLE_BUFFER.get(clean_symbol, [])

    async def get_extended_trades(self, symbol: str) -> list[dict[str, Any]]:
        clean_symbol = normalize_symbol(symbol)

        if not clean_symbol:
            return []

        endpoints = [
            ("aftermarket-trade", {"symbol": clean_symbol}, False),
            ("aftermarket-quote", {"symbol": clean_symbol}, False),
            ("batch-aftermarket-trade", {"symbols": clean_symbol}, False),
            ("batch-aftermarket-quote", {"symbols": clean_symbol}, False),
        ]

        all_rows: list[dict[str, Any]] = []
        seen: set[str] = set()

        for path, params, legacy in endpoints:
            try:
                payload = await self.get_json(path, params, legacy=legacy)
                rows = self.normalize_list_payload(payload)
                for row in rows:
                    key = str(row.get("timestamp") or row.get("date") or row.get("time") or row)
                    if key not in seen:
                        all_rows.append(row)
                        seen.add(key)
            except Exception:
                continue

        return all_rows

    async def get_extended_intraday_candles(
        self,
        symbol: str,
    ) -> list[dict[str, Any]]:
        trades = await self.get_extended_trades(symbol)
        fresh_candles = self._trades_to_one_minute_candles(trades)

        today_utc = datetime.now(timezone.utc).date()
        today_fresh: list[dict[str, Any]] = []

        for candle in fresh_candles:
            parsed = _parse_datetime(candle.get("date"))
            if parsed and parsed.date() == today_utc:
                today_fresh.append(candle)

        return self._merge_extended_buffer(symbol, today_fresh)

    async def get_regular_intraday_candles(
        self,
        symbol: str,
        interval: str = "1min",
    ) -> list[dict[str, Any]]:
        clean_symbol = normalize_symbol(symbol)

        if not clean_symbol:
            return []

        normalized_interval = interval.lower().strip()

        if normalized_interval not in {"1min", "5min", "15min", "30min", "1hour"}:
            normalized_interval = "1min"

        endpoints = [
            (f"historical-chart/{normalized_interval}", {"symbol": clean_symbol}, False),
            (f"historical-chart/{normalized_interval}/{clean_symbol}", {}, True),
        ]

        for path, params, legacy in endpoints:
            try:
                payload = await self.get_json(path, params, legacy=legacy)
                rows = self.normalize_list_payload(payload)
                if rows:
                    return _normalize_regular_historical_rows(rows)
            except Exception:
                continue

        return []

    def _merge_regular_and_extended(
        self,
        regular_rows: list[dict[str, Any]],
        extended_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_date: dict[str, dict[str, Any]] = {}

        for row in regular_rows + extended_rows:
            date_key = str(row.get("date") or "").strip()
            if not date_key:
                continue

            incoming = dict(row)
            existing = by_date.get(date_key)

            if not existing:
                by_date[date_key] = incoming
                continue

            existing_volume = int(float(existing.get("volume") or 0))
            incoming_volume = int(float(incoming.get("volume") or 0))

            # Same minute can arrive from both historical-chart and extended
            # trades/quotes. Keep the richer OHLC/volume instead of letting a
            # tiny quote-size candle overwrite a full historical bar.
            base = existing if existing_volume >= incoming_volume else incoming
            other = incoming if base is existing else existing

            base["high"] = max(float(existing.get("high") or 0), float(incoming.get("high") or 0))
            existing_low = float(existing.get("low") or 0)
            incoming_low = float(incoming.get("low") or 0)
            if existing_low > 0 and incoming_low > 0:
                base["low"] = min(existing_low, incoming_low)
            base["volume"] = max(existing_volume, incoming_volume)
            base["close"] = incoming.get("close") or base.get("close")
            base["source"] = "merged_regular_extended"

            by_date[date_key] = base

        merged = list(by_date.values())
        merged.sort(key=lambda item: str(item.get("date") or ""), reverse=True)
        return merged

    async def get_intraday_candles(
        self,
        symbol: str,
        interval: str = "1min",
    ) -> list[dict[str, Any]]:
        normalized_interval = interval.lower().strip()

        if normalized_interval not in {"1min", "5min", "15min", "30min", "1hour"}:
            normalized_interval = "1min"

        if normalized_interval == "1min":
            extended_candles = await self.get_extended_intraday_candles(symbol)
            regular_candles = await self.get_regular_intraday_candles(symbol, normalized_interval)

            if extended_candles and regular_candles:
                return self._merge_regular_and_extended(regular_candles, extended_candles)

            if extended_candles:
                return extended_candles

            return regular_candles

        return await self.get_regular_intraday_candles(symbol, normalized_interval)

    async def debug_intraday_candles(
        self,
        symbol: str,
        interval: str = "1min",
    ) -> dict[str, Any]:
        clean_symbol = normalize_symbol(symbol)
        normalized_interval = interval.lower().strip()

        if normalized_interval not in {"1min", "5min", "15min", "30min", "1hour"}:
            normalized_interval = "1min"

        attempts: list[dict[str, Any]] = []

        extended_attempts = [
            ("aftermarket-trade", {"symbol": clean_symbol}, False),
            ("aftermarket-quote", {"symbol": clean_symbol}, False),
            ("batch-aftermarket-trade", {"symbols": clean_symbol}, False),
            ("batch-aftermarket-quote", {"symbols": clean_symbol}, False),
        ]

        for path, params, legacy in extended_attempts:
            base_url = self.legacy_base_url if legacy else self.base_url
            url = f"{base_url}/{path.lstrip('/')}"
            query = dict(params)
            query["apikey"] = "***"

            try:
                payload = await self.get_json(path, params, legacy=legacy)
                rows = self.normalize_list_payload(payload)
                synthetic = self._trades_to_one_minute_candles(rows)

                attempts.append(
                    {
                        "source": "extended_trades",
                        "url": url,
                        "params": query,
                        "legacy": legacy,
                        "rowCount": len(rows),
                        "syntheticOneMinuteCount": len(synthetic),
                        "latestSyntheticCandleAt": synthetic[-1]["date"] if synthetic else None,
                        "payloadType": type(payload).__name__,
                        "payloadPreview": str(payload)[:500],
                    }
                )
            except Exception as error:
                attempts.append(
                    {
                        "source": "extended_trades",
                        "url": url,
                        "params": query,
                        "legacy": legacy,
                        "rowCount": 0,
                        "syntheticOneMinuteCount": 0,
                        "error": repr(error),
                    }
                )

        regular_attempts = [
            (f"historical-chart/{normalized_interval}", {"symbol": clean_symbol}, False),
            (f"historical-chart/{normalized_interval}/{clean_symbol}", {}, True),
        ]

        for path, params, legacy in regular_attempts:
            base_url = self.legacy_base_url if legacy else self.legacy_base_url
            if not legacy:
                base_url = self.base_url
            url = f"{base_url}/{path.lstrip('/')}"
            query = dict(params)
            query["apikey"] = "***"

            try:
                payload = await self.get_json(path, params, legacy=legacy)
                rows = self.normalize_list_payload(payload)

                attempts.append(
                    {
                        "source": "regular_historical_chart",
                        "url": url,
                        "params": query,
                        "legacy": legacy,
                        "rowCount": len(rows),
                        "latestCandleAt": rows[0].get("date") if rows else None,
                        "payloadType": type(payload).__name__,
                        "payloadPreview": str(payload)[:500],
                    }
                )
            except Exception as error:
                attempts.append(
                    {
                        "source": "regular_historical_chart",
                        "url": url,
                        "params": query,
                        "legacy": legacy,
                        "rowCount": 0,
                        "error": repr(error),
                    }
                )

        buffer_snapshot = self.get_extended_buffer_snapshot(clean_symbol)

        return {
            "symbol": clean_symbol,
            "interval": normalized_interval,
            "bufferCount": len(buffer_snapshot),
            "bufferLatest": buffer_snapshot[-1].get("date") if buffer_snapshot else None,
            "attempts": attempts,
        }


