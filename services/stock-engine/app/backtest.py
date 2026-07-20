from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.data.fmp_client import FmpClient

try:
    NEW_YORK_TZ = ZoneInfo("America/New_York")
except Exception:
    NEW_YORK_TZ = timezone.utc

OutcomeStatus = Literal["WORKED", "FAILED", "OPEN", "EXPIRED_SESSION", "INVALID"]


@dataclass
class BacktestCandle:
    timestamp: datetime | None
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    raw: dict[str, Any]


def to_float(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            cleaned = value.replace("%", "").replace(",", "").replace("$", "").strip()
            return float(cleaned)
        except ValueError:
            return fallback

    return fallback


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    raw = str(value).strip()
    if not raw:
        return None

    candidates = [
        raw,
        raw.replace("Z", "+00:00"),
        raw.replace(" ", "T"),
        raw.replace(" ", "T").replace("Z", "+00:00"),
    ]

    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def normalize_candle(row: dict[str, Any]) -> BacktestCandle | None:
    timestamp = parse_datetime(
        row.get("date")
        or row.get("datetime")
        or row.get("timestamp")
        or row.get("time")
    )

    high = to_float(row.get("high"))
    low = to_float(row.get("low"))

    if high is None or low is None:
        return None

    return BacktestCandle(
        timestamp=timestamp,
        open=to_float(row.get("open")),
        high=high,
        low=low,
        close=to_float(row.get("close")),
        volume=to_float(row.get("volume")),
        raw=row,
    )


def sort_candles_ascending(rows: list[dict[str, Any]]) -> list[BacktestCandle]:
    candles: list[BacktestCandle] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        candle = normalize_candle(row)
        if candle:
            candles.append(candle)

    return sorted(
        candles,
        key=lambda candle: candle.timestamp or datetime.min.replace(tzinfo=timezone.utc),
    )


def get_signal_created_at(signal: dict[str, Any]) -> datetime | None:
    signal_object = signal.get("signal") if isinstance(signal.get("signal"), dict) else {}
    raw_signal = signal.get("rawSignal") if isinstance(signal.get("rawSignal"), dict) else {}
    source = signal.get("source") if isinstance(signal.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}

    for value in (
        signal_object.get("createdAt"),
        raw_signal.get("createdAt"),
        signal.get("createdAt"),
        signal.get("updatedAt"),
        signal.get("triggerTime"),
        raw_signal.get("triggerTime"),
        candle_context.get("latestFiveMinuteCandleAt"),
        candle_context.get("latestCandleAt"),
    ):
        parsed = parse_datetime(value)
        if parsed:
            return parsed

    return None


def get_signal_trigger_time(signal: dict[str, Any]) -> datetime | None:
    """Return the candle timestamp that actually triggered ACTIVE.

    For historical outcome checks we do not want to use API execution time,
    because discovery can be refreshed long after the market session has ended.
    We prefer the persisted triggerTime when the signal came from durable DB,
    then the latest 5m confirmation candle inside source.candleContext.
    """

    signal_object = signal.get("signal") if isinstance(signal.get("signal"), dict) else {}
    raw_signal = signal.get("rawSignal") if isinstance(signal.get("rawSignal"), dict) else {}
    source = signal.get("source") if isinstance(signal.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}

    for value in (
        signal.get("triggerTime"),
        signal.get("triggeredAt"),
        signal_object.get("triggerTime"),
        signal_object.get("triggeredAt"),
        raw_signal.get("triggerTime"),
        raw_signal.get("triggeredAt"),
        candle_context.get("latestFiveMinuteCandleAt"),
        candle_context.get("latestCandleAt"),
    ):
        parsed = parse_datetime(value)
        if parsed:
            return parsed

    return get_signal_created_at(signal)


def get_regular_session_end(trigger_time: datetime | None) -> datetime | None:
    """Return 16:00 New York regular-session close for the trigger date.

    Important: our FMP candle pipeline normalizes timestamps to UTC, but the
    US equity session closes at 16:00 America/New_York, not 16:00 UTC.
    In summer that is 20:00 UTC; in winter it is 21:00 UTC. This keeps
    Holly-style outcome checks aligned with the real market close.
    """

    if trigger_time is None:
        return None

    trigger_aware = trigger_time
    if trigger_aware.tzinfo is None:
        trigger_aware = trigger_aware.replace(tzinfo=timezone.utc)

    trigger_ny = trigger_aware.astimezone(NEW_YORK_TZ)
    close_ny = datetime.combine(
        trigger_ny.date(),
        time(hour=16, minute=0, second=0),
        tzinfo=NEW_YORK_TZ,
    )

    return close_ny.astimezone(trigger_aware.tzinfo or timezone.utc)


def is_session_closed(session_end: datetime | None, now: datetime | None = None) -> bool:
    if session_end is None:
        return False

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    return current.astimezone(session_end.tzinfo or timezone.utc) >= session_end


def minutes_between(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None

    start_aware = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
    end_aware = end if end.tzinfo else end.replace(tzinfo=timezone.utc)

    return max(0, int((end_aware - start_aware).total_seconds() // 60))


def is_inside_same_regular_session(
    candle: BacktestCandle,
    trigger_time: datetime | None,
    session_end: datetime | None,
) -> bool:
    if candle.timestamp is None:
        return False

    if trigger_time is not None and candle.timestamp <= trigger_time:
        return False

    if session_end is not None and candle.timestamp > session_end:
        return False

    return True


def get_signal_payload(signal: dict[str, Any]) -> dict[str, Any]:
    nested = signal.get("signal")
    if isinstance(nested, dict):
        return nested
    return signal


def extract_backtest_inputs(signal: dict[str, Any]) -> dict[str, Any]:
    payload = get_signal_payload(signal)
    targets = payload.get("targets") if isinstance(payload.get("targets"), list) else []
    tp1 = targets[0] if len(targets) > 0 and isinstance(targets[0], dict) else {}
    tp2 = targets[1] if len(targets) > 1 and isinstance(targets[1], dict) else {}

    return {
        "signalId": payload.get("signalId") or signal.get("signalId"),
        "symbol": payload.get("symbol") or signal.get("symbol"),
        "setupSlug": payload.get("setupSlug") or signal.get("setupSlug"),
        "setupName": payload.get("setupName") or signal.get("setupName"),
        "direction": str(payload.get("direction") or signal.get("direction") or "").lower(),
        "entry": to_float(payload.get("entry")),
        "stop": to_float(payload.get("stop")),
        "tp1": to_float(tp1.get("price")),
        "tp2": to_float(tp2.get("price")),
        "createdAt": get_signal_created_at(signal),
        "triggeredAt": get_signal_trigger_time(signal),
        "signalScore": payload.get("signalScore") or signal.get("signalScore"),
        "signalGrade": payload.get("signalGrade") or signal.get("signalGrade"),
        "qualityStatus": signal.get("qualityStatus") or payload.get("qualityStatus"),
        "premiumSignal": payload.get("premiumSignal") if "premiumSignal" in payload else signal.get("premiumSignal"),
        "telegramEligible": payload.get("telegramEligible") if "telegramEligible" in payload else signal.get("telegramEligible"),
        "primaryTrigger": payload.get("primaryTrigger") or signal.get("primaryTrigger"),
        "triggers": payload.get("triggers") if isinstance(payload.get("triggers"), list) else signal.get("triggers"),
    }


def build_outcome_signal_metadata(inputs: dict[str, Any]) -> dict[str, Any]:
    triggers = inputs.get("triggers")
    if not isinstance(triggers, list):
        triggers = []

    return {
        "setupName": inputs.get("setupName"),
        "signalScore": inputs.get("signalScore"),
        "signalGrade": inputs.get("signalGrade"),
        "qualityStatus": inputs.get("qualityStatus"),
        "premiumSignal": inputs.get("premiumSignal"),
        "telegramEligible": inputs.get("telegramEligible"),
        "primaryTrigger": inputs.get("primaryTrigger"),
        "triggers": triggers,
    }


def is_after_signal_time(candle: BacktestCandle, signal_time: datetime | None) -> bool:
    if signal_time is None or candle.timestamp is None:
        return True
    return candle.timestamp > signal_time


def calculate_r_for_short(entry: float, stop: float, price: float) -> float:
    risk = stop - entry
    if risk <= 0:
        return 0.0
    return round((entry - price) / risk, 2)


def calculate_r_for_long(entry: float, stop: float, price: float) -> float:
    risk = entry - stop
    if risk <= 0:
        return 0.0
    return round((price - entry) / risk, 2)


def evaluate_signal_outcome(
    signal: dict[str, Any],
    candle_rows: list[dict[str, Any]],
    *,
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
) -> dict[str, Any]:
    """Evaluate one signal against candles after the trigger candle.

    Holly-style outcome logic should measure what happened after the actual
    setup trigger, not after the API refresh time. By default we check from
    the trigger candle to the end of the same regular session (16:00).
    """

    inputs = extract_backtest_inputs(signal)
    signal_id = str(inputs.get("signalId") or "")
    symbol = str(inputs.get("symbol") or "")
    direction = str(inputs.get("direction") or "")
    entry = to_float(inputs.get("entry"))
    stop = to_float(inputs.get("stop"))
    tp1 = to_float(inputs.get("tp1"))
    tp2 = to_float(inputs.get("tp2"))
    created_at = inputs.get("createdAt") if isinstance(inputs.get("createdAt"), datetime) else None
    trigger_time = inputs.get("triggeredAt") if isinstance(inputs.get("triggeredAt"), datetime) else None
    metadata = build_outcome_signal_metadata(inputs)
    signal_time = trigger_time if use_trigger_time and trigger_time else created_at
    session_end = get_regular_session_end(signal_time) if session_to_close else None

    if not signal_id or not symbol or direction not in {"short", "long"}:
        return {
            "ok": False,
            "status": "INVALID",
            "reason": "missing_signal_identity_or_direction",
            "signalId": signal_id,
            "symbol": symbol,
            "setupSlug": inputs.get("setupSlug"),
            **metadata,
        }

    if entry is None or stop is None or tp1 is None:
        return {
            "ok": False,
            "status": "INVALID",
            "reason": "missing_entry_stop_or_tp1",
            "signalId": signal_id,
            "symbol": symbol,
            "setupSlug": inputs.get("setupSlug"),
            **metadata,
        }

    all_candles = sort_candles_ascending(candle_rows)

    if session_to_close:
        candles = [
            candle
            for candle in all_candles
            if is_inside_same_regular_session(candle, signal_time, session_end)
        ]
    else:
        candles = [
            candle
            for candle in all_candles
            if is_after_signal_time(candle, signal_time)
        ]

    if max_candles is not None and max_candles > 0:
        candles = candles[:max_candles]

    session_closed = is_session_closed(session_end) if session_to_close else False

    if not candles:
        empty_status: OutcomeStatus = "EXPIRED_SESSION" if session_to_close and session_closed else "OPEN"
        empty_reason = "session_closed_no_future_candles" if session_to_close and session_closed else "no_future_candles_yet"

        return {
            "ok": True,
            "status": empty_status,
            "reason": empty_reason,
            "signalId": signal_id,
            "symbol": symbol,
            "setupSlug": inputs.get("setupSlug"),
            **metadata,
            "direction": direction,
            "entry": entry,
            "stop": stop,
            "tp1": tp1,
            "tp2": tp2,
            "signalTime": created_at.isoformat() if created_at else None,
            "triggerTime": trigger_time.isoformat() if trigger_time else None,
            "outcomeStartTime": signal_time.isoformat() if signal_time else None,
            "sessionEnd": session_end.isoformat() if session_end else None,
            "sessionClosed": session_closed,
            "sessionWindow": session_to_close,
            "candlesChecked": 0,
            "tp1Hit": False,
            "tp2Hit": False,
            "stopHit": False,
            "resultR": 0,
            "mfeR": 0,
            "maeR": 0,
            "timeToFirstEventMinutes": None,
            "timeToTp1Minutes": None,
            "timeToStopMinutes": None,
        }

    tp1_hit = False
    tp2_hit = False
    stop_hit = False
    first_event: str | None = None
    first_event_at: datetime | None = None
    result_r = 0.0

    best_price = entry
    worst_price = entry

    for candle in candles:
        high = candle.high
        low = candle.low

        if direction == "short":
            if low is not None:
                best_price = min(best_price, low)
            if high is not None:
                worst_price = max(worst_price, high)

            # Conservative tie handling: if stop and target both touch same candle, stop wins.
            if high is not None and high >= stop:
                stop_hit = True
                first_event = "STOP"
                first_event_at = candle.timestamp
                result_r = -1.0
                break

            if tp2 is not None and low is not None and low <= tp2:
                tp1_hit = True
                tp2_hit = True
                first_event = "TP2"
                first_event_at = candle.timestamp
                result_r = calculate_r_for_short(entry, stop, tp2)
                break

            if low is not None and low <= tp1:
                tp1_hit = True
                first_event = "TP1"
                first_event_at = candle.timestamp
                result_r = calculate_r_for_short(entry, stop, tp1)
                break

        if direction == "long":
            if high is not None:
                best_price = max(best_price, high)
            if low is not None:
                worst_price = min(worst_price, low)

            if low is not None and low <= stop:
                stop_hit = True
                first_event = "STOP"
                first_event_at = candle.timestamp
                result_r = -1.0
                break

            if tp2 is not None and high is not None and high >= tp2:
                tp1_hit = True
                tp2_hit = True
                first_event = "TP2"
                first_event_at = candle.timestamp
                result_r = calculate_r_for_long(entry, stop, tp2)
                break

            if high is not None and high >= tp1:
                tp1_hit = True
                first_event = "TP1"
                first_event_at = candle.timestamp
                result_r = calculate_r_for_long(entry, stop, tp1)
                break

    if direction == "short":
        mfe_r = calculate_r_for_short(entry, stop, best_price)
        mae_r = abs(min(0, calculate_r_for_short(entry, stop, worst_price)))
    else:
        mfe_r = calculate_r_for_long(entry, stop, best_price)
        mae_r = abs(min(0, calculate_r_for_long(entry, stop, worst_price)))

    session_closed = is_session_closed(session_end) if session_to_close else False

    status: OutcomeStatus = "OPEN"
    if stop_hit:
        status = "FAILED"
    elif tp1_hit or tp2_hit:
        status = "WORKED"
    elif session_to_close and session_closed:
        status = "EXPIRED_SESSION"

    no_event_reason = "session_closed_no_tp_or_stop" if session_to_close and session_closed else "no_tp_or_stop_hit_yet"

    return {
        "ok": True,
        "status": status,
        "reason": first_event or no_event_reason,
        "signalId": signal_id,
        "symbol": symbol,
        "setupSlug": inputs.get("setupSlug"),
        **metadata,
        "direction": direction,
        "entry": entry,
        "stop": stop,
        "tp1": tp1,
        "tp2": tp2,
        "signalTime": created_at.isoformat() if created_at else None,
        "triggerTime": trigger_time.isoformat() if trigger_time else None,
        "outcomeStartTime": signal_time.isoformat() if signal_time else None,
        "sessionEnd": session_end.isoformat() if session_end else None,
        "sessionClosed": session_closed,
        "sessionWindow": session_to_close,
        "firstEvent": first_event,
        "firstEventAt": first_event_at.isoformat() if first_event_at else None,
        "timeToFirstEventMinutes": minutes_between(signal_time, first_event_at),
        "timeToTp1Minutes": minutes_between(signal_time, first_event_at) if tp1_hit else None,
        "timeToStopMinutes": minutes_between(signal_time, first_event_at) if stop_hit else None,
        "tp1Hit": tp1_hit,
        "tp2Hit": tp2_hit,
        "stopHit": stop_hit,
        "resultR": result_r,
        "mfeR": mfe_r,
        "maeR": mae_r,
        "candlesChecked": len(candles),
        "firstCheckedCandleAt": candles[0].timestamp.isoformat() if candles[0].timestamp else None,
        "lastCheckedCandleAt": candles[-1].timestamp.isoformat() if candles[-1].timestamp else None,
        "engineVersion": "holly_persistent_v2",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


async def evaluate_active_signals(
    client: FmpClient,
    active_signals: dict[str, dict[str, Any]],
    *,
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
) -> dict[str, Any]:
    outcomes: list[dict[str, Any]] = []

    for signal in active_signals.values():
        payload = get_signal_payload(signal)
        symbol = str(payload.get("symbol") or signal.get("symbol") or "").upper()

        if not symbol:
            continue

        try:
            candles = await client.get_intraday_candles(symbol, interval=interval)
            outcome = evaluate_signal_outcome(
                signal,
                candles,
                max_candles=max_candles,
                use_trigger_time=use_trigger_time,
                session_to_close=session_to_close,
            )
            outcome["interval"] = interval
            outcome["rawCandles"] = len(candles)
            outcomes.append(outcome)
        except Exception as error:
            outcomes.append(
                {
                    "ok": False,
                    "status": "INVALID",
                    "reason": "backtest_error",
                    "symbol": symbol,
                    "error": repr(error),
                    "interval": interval,
                }
            )

    worked = sum(1 for item in outcomes if item.get("status") == "WORKED")
    failed = sum(1 for item in outcomes if item.get("status") == "FAILED")
    open_count = sum(1 for item in outcomes if item.get("status") == "OPEN")
    expired_session = sum(1 for item in outcomes if item.get("status") == "EXPIRED_SESSION")
    invalid = sum(1 for item in outcomes if item.get("status") == "INVALID")
    closed = worked + failed

    return {
        "ok": True,
        "count": len(outcomes),
        "worked": worked,
        "failed": failed,
        "open": open_count,
        "expiredSession": expired_session,
        "invalid": invalid,
        "closed": closed,
        "winRateClosed": round(worked / closed * 100, 2) if closed else None,
        "interval": interval,
        "maxCandles": max_candles,
        "useTriggerTime": use_trigger_time,
        "sessionToClose": session_to_close,
        "outcomes": outcomes,
        "engineVersion": "holly_persistent_v2",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }





