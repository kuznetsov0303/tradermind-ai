from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Candle:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float


def to_float(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").replace("$", "").strip())
        except ValueError:
            return fallback
    return fallback


def parse_timestamp_ms(value: Any) -> int:
    if isinstance(value, (int, float)):
        number = float(value)
        return int(number if number > 10_000_000_000 else number * 1000)

    if isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            number = float(raw)
            return int(number if number > 10_000_000_000 else number * 1000)
        except ValueError:
            pass

        normalized = raw.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            return 0

    return 0


def parse_candle_datetime(value: Any) -> datetime | None:
    timestamp_ms = parse_timestamp_ms(value)
    if timestamp_ms <= 0:
        return None
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)


def candle_to_dict(candle: Candle) -> dict[str, Any]:
    return {
        "timestamp": candle.timestamp,
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "volume": candle.volume,
    }


def normalize_candle(row: dict[str, Any]) -> Candle | None:
    timestamp = row.get("timestamp") or row.get("date") or row.get("datetime") or row.get("time")

    open_price = to_float(row.get("open"))
    high = to_float(row.get("high"))
    low = to_float(row.get("low"))
    close = to_float(row.get("close"))
    volume = to_float(row.get("volume"), 0)

    if not timestamp or open_price is None or high is None or low is None or close is None:
        return None

    if open_price <= 0 or high <= 0 or low <= 0 or close <= 0:
        return None

    if high < low:
        return None

    return Candle(
        timestamp=str(timestamp),
        open=float(open_price),
        high=float(high),
        low=float(low),
        close=float(close),
        volume=float(volume or 0),
    )


def normalize_candles(rows: list[dict[str, Any]]) -> list[Candle]:
    candles = [normalize_candle(row) for row in rows if isinstance(row, dict)]
    clean = [candle for candle in candles if candle is not None]
    return sorted(clean, key=lambda candle: parse_timestamp_ms(candle.timestamp))


def filter_latest_trading_day(candles: list[Candle]) -> list[Candle]:
    """Keep only the latest date in the incoming candle stream.

    FMP can return several previous-session candles together with today's
    extended/regular candles. Signals must never use prior-day structure.
    """

    if not candles:
        return []

    latest_dt = parse_candle_datetime(candles[-1].timestamp)
    if latest_dt is None:
        return candles

    latest_date = latest_dt.date()

    return [
        candle
        for candle in candles
        if (parsed := parse_candle_datetime(candle.timestamp)) is not None
        and parsed.date() == latest_date
    ]


def filter_latest_continuous_segment(
    candles: list[Candle],
    *,
    max_gap_minutes: int = 30,
) -> list[Candle]:
    """Keep the latest continuous segment when timestamps have a large gap.

    During extended-hours work FMP may mix regular historical candles with
    freshly polled aftermarket/pre-market synthetic candles. A large gap means
    the last candle belongs to a newer stream and the older 5m structure is not
    safe for ACTIVE signal confirmation. In that case we only keep the latest
    segment and wait until enough fresh 1m candles accumulate.
    """

    if len(candles) < 2:
        return candles

    max_gap_ms = max_gap_minutes * 60 * 1000
    split_index = 0
    previous_ms = parse_timestamp_ms(candles[0].timestamp)

    for index in range(1, len(candles)):
        current_ms = parse_timestamp_ms(candles[index].timestamp)
        if previous_ms > 0 and current_ms > 0 and current_ms - previous_ms > max_gap_ms:
            split_index = index
        previous_ms = current_ms

    return candles[split_index:]


def aggregate_candles_by_time(
    candles: list[Candle],
    interval_minutes: int = 5,
) -> list[Candle]:
    if interval_minutes <= 1:
        return list(candles)

    buckets: dict[int, list[Candle]] = {}
    interval_ms = interval_minutes * 60 * 1000

    for candle in candles:
        timestamp_ms = parse_timestamp_ms(candle.timestamp)
        if timestamp_ms <= 0:
            continue

        bucket_key = timestamp_ms // interval_ms
        buckets.setdefault(bucket_key, []).append(candle)

    result: list[Candle] = []

    for bucket_key in sorted(buckets.keys()):
        group = sorted(buckets[bucket_key], key=lambda candle: parse_timestamp_ms(candle.timestamp))
        if not group:
            continue

        first = group[0]
        last = group[-1]

        result.append(
            Candle(
                timestamp=last.timestamp,
                open=first.open,
                high=max(candle.high for candle in group),
                low=min(candle.low for candle in group),
                close=last.close,
                volume=sum(candle.volume for candle in group),
            )
        )

    return result


def aggregate_candles_by_count(candles: list[Candle], group_size: int) -> list[Candle]:
    # Kept for backward compatibility. New signal logic uses time buckets.
    if group_size <= 1:
        return list(candles)

    result: list[Candle] = []

    for index in range(0, len(candles), group_size):
        group = candles[index:index + group_size]
        if len(group) < group_size:
            continue

        first = group[0]
        last = group[-1]

        result.append(
            Candle(
                timestamp=last.timestamp,
                open=first.open,
                high=max(candle.high for candle in group),
                low=min(candle.low for candle in group),
                close=last.close,
                volume=sum(candle.volume for candle in group),
            )
        )

    return result


def typical_price(candle: Candle) -> float:
    return (candle.high + candle.low + candle.close) / 3


def calculate_vwap(candles: list[Candle]) -> float | None:
    valid = [candle for candle in candles if candle.volume > 0]
    if not valid:
        return None

    volume_sum = sum(candle.volume for candle in valid)
    if volume_sum <= 0:
        return None

    pv_sum = sum(typical_price(candle) * candle.volume for candle in valid)
    return pv_sum / volume_sum


def calculate_ema(values: list[float], period: int) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return None

    seed_length = min(period, len(clean))
    ema = sum(clean[:seed_length]) / seed_length
    multiplier = 2 / (period + 1)

    for value in clean[seed_length:]:
        ema = value * multiplier + ema * (1 - multiplier)

    return ema


def calculate_atr(candles: list[Candle], period: int = 14) -> float | None:
    if len(candles) < 2:
        return None

    true_ranges: list[float] = []

    for index in range(1, len(candles)):
        current = candles[index]
        previous = candles[index - 1]

        true_ranges.append(
            max(
                current.high - current.low,
                abs(current.high - previous.close),
                abs(current.low - previous.close),
            )
        )

    recent = true_ranges[-period:]
    if not recent:
        return None

    return sum(recent) / len(recent)


def calculate_rsi(candles: list[Candle], period: int = 14) -> float | None:
    if len(candles) <= period:
        return None

    gains: list[float] = []
    losses: list[float] = []

    for index in range(1, len(candles)):
        delta = candles[index].close - candles[index - 1].close
        gains.append(max(delta, 0))
        losses.append(abs(min(delta, 0)))

    recent_gains = gains[-period:]
    recent_losses = losses[-period:]

    avg_gain = sum(recent_gains) / period
    avg_loss = sum(recent_losses) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def get_high(candles: list[Candle]) -> float | None:
    return max((candle.high for candle in candles), default=None)


def get_low(candles: list[Candle]) -> float | None:
    return min((candle.low for candle in candles), default=None)


def get_last(candles: list[Candle]) -> Candle | None:
    return candles[-1] if candles else None


def calculate_opening_range(candles: list[Candle], bars: int = 3) -> dict[str, float | int | None]:
    selected = candles[:bars]
    return {
        "high": get_high(selected),
        "low": get_low(selected),
        "bars": len(selected),
    }


def calculate_volume_acceleration(candles: list[Candle]) -> float | None:
    valid = [candle for candle in candles if candle.volume > 0]
    if len(valid) < 8:
        return None

    recent = valid[-3:]
    baseline = valid[max(0, len(valid) - 23):-3]

    if not baseline:
        return None

    recent_avg = sum(candle.volume for candle in recent) / len(recent)
    baseline_avg = sum(candle.volume for candle in baseline) / len(baseline)

    if baseline_avg <= 0:
        return None

    return recent_avg / baseline_avg


def candle_close_position(candle: Candle) -> float | None:
    """Return close location inside candle range: 0=low, 1=high."""

    candle_range = candle.high - candle.low
    if candle_range <= 0:
        return None
    return max(0.0, min(1.0, (candle.close - candle.low) / candle_range))


def detect_lower_high_5m(five_minute: list[Candle]) -> dict[str, Any]:
    """Detect a real bearish lower-high confirmation, not a formal 1-tick lower high.

    The first version was too soft: a candle could close at its high, still be
    bullish, and pass only because its high was slightly under the previous
    swing. For Telegram-quality short signals we require rejection behavior:
    a meaningful lower high, close not in the top of the candle, and bearish
    pressure versus the candle open or previous close.
    """

    if len(five_minute) < 5:
        return {
            "detected": False,
            "reason": "not_enough_5m_candles",
        }

    previous = five_minute[-4:-1]
    previous_close = five_minute[-2].close
    last = five_minute[-1]
    previous_swing_high = max(candle.high for candle in previous)

    lower_high_gap_pct = (
        ((previous_swing_high - last.high) / previous_swing_high) * 100
        if previous_swing_high > 0
        else None
    )
    close_position = candle_close_position(last)
    bearish_body = last.close < last.open
    close_below_previous_close = last.close < previous_close

    if last.high >= previous_swing_high or last.close >= previous_swing_high:
        reason = "no_lower_high_yet"
        detected = False
    elif lower_high_gap_pct is None or lower_high_gap_pct < 0.35:
        reason = "lower_high_gap_too_small"
        detected = False
    elif close_position is None:
        reason = "flat_candle_no_rejection_range"
        detected = False
    elif close_position > 0.68:
        reason = "close_too_near_high_no_bearish_rejection"
        detected = False
    elif not (bearish_body or close_below_previous_close):
        reason = "no_bearish_pressure_on_lower_high"
        detected = False
    else:
        reason = "lower_high_bearish_rejection_detected"
        detected = True

    return {
        "detected": detected,
        "previousSwingHigh": previous_swing_high,
        "lastOpen": last.open,
        "lastHigh": last.high,
        "lastLow": last.low,
        "lastClose": last.close,
        "previousClose": previous_close,
        "lowerHighGapPct": round(lower_high_gap_pct, 3) if lower_high_gap_pct is not None else None,
        "closePosition": round(close_position, 3) if close_position is not None else None,
        "bearishBody": bearish_body,
        "closeBelowPreviousClose": close_below_previous_close,
        "reason": reason,
    }


def detect_ema20_loss_5m(five_minute: list[Candle], ema20_5m: float | None) -> dict[str, Any]:
    if len(five_minute) < 2 or ema20_5m is None:
        return {
            "detected": False,
            "reason": "missing_ema20_or_candles",
        }

    last = five_minute[-1]
    previous = five_minute[-2]
    close_position = candle_close_position(last)
    distance_below_ema_pct = ((ema20_5m - last.close) / ema20_5m) * 100 if ema20_5m > 0 else None
    bearish_pressure = last.close < last.open or last.close < previous.close

    if last.close >= ema20_5m:
        detected = False
        reason = "holding_above_ema20_5m"
    elif distance_below_ema_pct is None or distance_below_ema_pct < 0.15:
        detected = False
        reason = "ema20_loss_too_shallow"
    elif close_position is not None and close_position > 0.72 and not bearish_pressure:
        detected = False
        reason = "ema20_loss_but_close_near_high_no_pressure"
    elif not bearish_pressure and close_position is not None and close_position > 0.55:
        detected = False
        reason = "ema20_loss_without_bearish_pressure"
    else:
        detected = True
        reason = "ema20_loss_5m"

    return {
        "detected": detected,
        "ema20_5m": ema20_5m,
        "lastOpen": last.open,
        "lastHigh": last.high,
        "lastLow": last.low,
        "lastClose": last.close,
        "previousClose": previous.close,
        "distanceBelowEmaPct": round(distance_below_ema_pct, 3) if distance_below_ema_pct is not None else None,
        "closePosition": round(close_position, 3) if close_position is not None else None,
        "bearishPressure": bearish_pressure,
        "reason": reason,
    }


def detect_vwap_rejection_5m(five_minute: list[Candle], vwap: float | None) -> dict[str, Any]:
    if len(five_minute) < 2 or vwap is None:
        return {
            "detected": False,
            "reason": "missing_vwap_or_candles",
        }

    last = five_minute[-1]
    close_position = candle_close_position(last)

    touched_or_reclaimed = last.high >= vwap
    closed_below = last.close < vwap
    bearish_body = last.close < last.open
    rejection_close = close_position is None or close_position <= 0.65

    detected = touched_or_reclaimed and closed_below and bearish_body and rejection_close

    if not touched_or_reclaimed:
        reason = "vwap_not_touched"
    elif not closed_below:
        reason = "vwap_not_lost_on_close"
    elif not bearish_body:
        reason = "vwap_touch_without_bearish_body"
    elif not rejection_close:
        reason = "vwap_rejection_close_too_near_high"
    else:
        reason = "vwap_rejection_5m"

    return {
        "detected": detected,
        "vwap": vwap,
        "lastOpen": last.open,
        "lastHigh": last.high,
        "lastLow": last.low,
        "lastClose": last.close,
        "closePosition": round(close_position, 3) if close_position is not None else None,
        "bearishBody": bearish_body,
        "reason": reason,
    }


def detect_failed_hod_reclaim_5m(five_minute: list[Candle], hod: float | None) -> dict[str, Any]:
    if len(five_minute) < 2 or hod is None:
        return {
            "detected": False,
            "reason": "missing_hod_or_candles",
        }

    last = five_minute[-1]
    distance_from_hod_pct = ((hod - last.close) / hod) * 100 if hod > 0 else None

    detected = last.high >= hod * 0.985 and last.close < hod * 0.98 and last.close < last.open

    return {
        "detected": detected,
        "hod": hod,
        "lastHigh": last.high,
        "lastClose": last.close,
        "distanceFromHodPct": distance_from_hod_pct,
        "reason": "failed_hod_reclaim_5m" if detected else "no_failed_hod_reclaim_yet",
    }


def build_confirmation_snapshot(
    five_minute: list[Candle],
    *,
    vwap: float | None,
    ema20_5m: float | None,
    hod: float | None,
) -> dict[str, Any]:
    lower_high = detect_lower_high_5m(five_minute)
    ema20_loss = detect_ema20_loss_5m(five_minute, ema20_5m)
    vwap_rejection = detect_vwap_rejection_5m(five_minute, vwap)
    failed_hod_reclaim = detect_failed_hod_reclaim_5m(five_minute, hod)

    triggers = []

    if lower_high.get("detected"):
        triggers.append("lower_high_5m")
    if ema20_loss.get("detected"):
        triggers.append("ema20_loss_5m")
    if vwap_rejection.get("detected"):
        triggers.append("vwap_rejection_5m")
    if failed_hod_reclaim.get("detected"):
        triggers.append("failed_hod_reclaim_5m")

    return {
        "hasActiveConfirmation": len(triggers) > 0,
        "triggers": triggers,
        "lowerHigh5m": lower_high,
        "ema20Loss5m": ema20_loss,
        "vwapRejection5m": vwap_rejection,
        "failedHodReclaim5m": failed_hod_reclaim,
    }


def build_session_snapshot(one_minute_rows: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = normalize_candles(one_minute_rows)
    latest_day = filter_latest_trading_day(normalized)
    one_minute = filter_latest_continuous_segment(latest_day, max_gap_minutes=30)
    five_minute = aggregate_candles_by_time(one_minute, 5)

    last_1m = get_last(one_minute)
    last_5m = get_last(five_minute)

    closes_5m = [candle.close for candle in five_minute]

    vwap = calculate_vwap(one_minute)
    ema20_5m = calculate_ema(closes_5m, 20)
    atr14_5m = calculate_atr(five_minute, 14)
    rsi14_5m = calculate_rsi(five_minute, 14)
    hod = get_high(one_minute)
    lod = get_low(one_minute)

    return {
        "oneMinuteCount": len(one_minute),
        "rawOneMinuteCount": len(normalized),
        "latestDayOneMinuteCount": len(latest_day),
        "fiveMinuteCount": len(five_minute),
        "latestPrice": last_1m.close if last_1m else None,
        "latestCandleAt": last_1m.timestamp if last_1m else None,
        "latestFiveMinuteCandleAt": last_5m.timestamp if last_5m else None,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "openingRange": calculate_opening_range(five_minute, 3),
        "hod": hod,
        "lod": lod,
        "volumeAcceleration": calculate_volume_acceleration(one_minute),
        "recentFiveMinuteCandles": [
            candle_to_dict(candle) for candle in five_minute[-6:]
        ],
        "confirmation": build_confirmation_snapshot(
            five_minute,
            vwap=vwap,
            ema20_5m=ema20_5m,
            hod=hod,
        ),
    }


