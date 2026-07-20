import time
import os
import json
from pathlib import Path

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.data.fmp_client import FmpClient
from app.indicators import build_session_snapshot
from app.state import ACTIVE, ARMED, WATCHLIST
from app.storage import EngineDatabase
from app.setup_registry import get_algorithm_registry


@dataclass
class NormalizedMover:
    symbol: str
    name: str | None
    exchange: str | None
    price: float | None
    change_percent: float
    volume: float
    market_cap: float | None
    universe: str
    source_bucket: str
    raw: dict[str, Any]


@dataclass
class SetupCandidate:
    symbol: str
    setup_slug: str
    setup_name: str
    direction: str
    status: str
    confidence: int
    entry_zone: dict[str, float | None]
    stop: float | None
    targets: list[dict[str, float | None]]
    invalidation: str
    reasons: list[str]
    risk_notes: list[str]
    source: dict[str, Any]



_CALIBRATION_DB: EngineDatabase | None = None
_ADJUSTMENTS_CACHE: dict[str, Any] = {"loadedAt": None, "items": []}


def get_calibration_db() -> EngineDatabase:
    global _CALIBRATION_DB
    if _CALIBRATION_DB is None:
        _CALIBRATION_DB = EngineDatabase()
    return _CALIBRATION_DB


def load_calibration_adjustments_cached(max_age_seconds: int = 60) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    loaded_at = _ADJUSTMENTS_CACHE.get("loadedAt")
    if isinstance(loaded_at, datetime) and (now - loaded_at).total_seconds() <= max_age_seconds:
        items = _ADJUSTMENTS_CACHE.get("items")
        return items if isinstance(items, list) else []

    try:
        items = get_calibration_db().load_setup_adjustments(limit=500)
    except Exception:
        items = []
    _ADJUSTMENTS_CACHE["loadedAt"] = now
    _ADJUSTMENTS_CACHE["items"] = items
    return items


def get_runtime_calibration_adjustment(setup_slug: str, primary_trigger: str | None = None) -> dict[str, Any]:
    setup_slug = str(setup_slug or "").strip()
    primary_trigger = str(primary_trigger or "").strip() or None
    if not setup_slug:
        return {}

    items = load_calibration_adjustments_cached()
    best_setup: dict[str, Any] = {}
    best_trigger: dict[str, Any] = {}

    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("setupSlug") or "") != setup_slug:
            continue
        trigger = item.get("primaryTrigger")
        scope = str(item.get("scope") or "")
        if primary_trigger and trigger == primary_trigger:
            best_trigger = item
            break
        if trigger in {None, "", "ALL"} or scope == "setup":
            best_setup = item

    return best_trigger or best_setup or {}


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None or value == "":
            return fallback
        return int(float(value))
    except Exception:
        return fallback

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


def normalize_symbol(value: Any) -> str:
    raw = str(value or "").upper().strip()
    return "".join(ch for ch in raw if ch.isalnum())


def classify_market_cap(market_cap: float | None) -> str:
    if market_cap is None or market_cap <= 0:
        return "unknown"
    if market_cap < 50_000_000:
        return "nano"
    if market_cap < 300_000_000:
        return "micro"
    if market_cap < 2_000_000_000:
        return "small"
    if market_cap < 10_000_000_000:
        return "mid"
    if market_cap < 200_000_000_000:
        return "large"
    return "mega"


def is_tradeable_us_stock_symbol(symbol: str) -> bool:
    return bool(symbol and symbol.isalnum() and len(symbol) <= 5)


def is_blocked_etf_or_fund(row: dict[str, Any]) -> tuple[bool, str | None]:
    symbol = normalize_symbol(row.get("symbol") or row.get("ticker"))
    name = str(row.get("name") or row.get("companyName") or "").lower()

    blocked_symbols = {
        "SOXS", "SOXL", "SQQQ", "TQQQ", "SPXS", "SPXL",
        "LABU", "LABD", "UVXY", "VXX", "BOIL", "KOLD",
        "TNA", "TZA", "FNGU", "FNGD", "TECL", "TECS",
    }

    blocked_name_terms = (
        " etf", "exchange traded fund", "etn", "3x", "2x",
        "leveraged", "inverse", "bear 3x", "bull 3x",
        "ultrapro", "direxion daily", "proshares ultra",
    )

    if symbol in blocked_symbols:
        return True, "blocked_symbol_etf_or_leveraged_product"
    if any(term in name for term in blocked_name_terms):
        return True, "blocked_name_etf_or_leveraged_product"

    return False, None


def is_blocked_share_class_or_unit(row: dict[str, Any]) -> tuple[bool, str | None]:
    symbol = normalize_symbol(row.get("symbol") or row.get("ticker"))
    name = str(row.get("name") or row.get("companyName") or "").lower()

    if len(symbol) >= 5 and symbol.endswith(("W", "WS", "WT", "U", "UN", "R")):
        return True, "blocked_warrant_unit_right_suffix"

    if "warrant" in name:
        return True, "blocked_warrant_name"

    if "unit" in name and "ordinary" not in name:
        return True, "blocked_unit_name"

    if "preferred" in name or "preference share" in name:
        return True, "blocked_preferred_share"

    return False, None


def normalize_mover(row: dict[str, Any], bucket: str) -> NormalizedMover | None:
    symbol = normalize_symbol(row.get("symbol") or row.get("ticker"))

    if not is_tradeable_us_stock_symbol(symbol):
        return None

    price = to_float(row.get("price") or row.get("lastPrice"))
    change_percent = to_float(
        row.get("changesPercentage")
        or row.get("changePercentage")
        or row.get("changePercent")
        or row.get("priceChangePercentage"),
        0,
    )
    volume = to_float(
        row.get("volume")
        or row.get("sharesVolume")
        or row.get("dayVolume")
        or row.get("regularMarketVolume"),
        0,
    ) or 0

    market_cap = to_float(row.get("marketCap") or row.get("market_cap") or row.get("mktCap"))
    universe = classify_market_cap(market_cap)

    return NormalizedMover(
        symbol=symbol,
        name=row.get("name") or row.get("companyName") or symbol,
        exchange=row.get("exchangeShortName") or row.get("exchange"),
        price=price,
        change_percent=float(change_percent or 0),
        volume=float(volume),
        market_cap=market_cap,
        universe=universe,
        source_bucket=bucket,
        raw=row,
    )


def calculate_price_quality_score(price: float | None) -> tuple[int, list[str]]:
    if price is None or price <= 0:
        return 0, ["price_quality_missing"]
    if price < 0.5:
        return 0, ["price_below_tradeable_floor"]
    if price < 1:
        return 35, ["sub_1_dollar_high_risk"]
    if price < 2:
        return 55, ["low_price_high_volatility"]
    if price <= 20:
        return 85, ["ideal_small_cap_price_range"]
    if price <= 100:
        return 90, ["institutional_price_range"]
    if price <= 500:
        return 80, ["high_price_large_cap_range"]
    return 45, ["price_too_high_for_clean_intraday_signal"]


def calculate_liquidity_score(volume: float, price: float | None) -> tuple[int, list[str]]:
    if volume < 500_000:
        return 0, ["liquidity_volume_below_500k"]

    score = 45
    reasons = ["liquidity_volume_gate_passed"]

    if volume >= 1_000_000:
        score += 10
        reasons.append("volume_1m_plus")
    if volume >= 5_000_000:
        score += 10
        reasons.append("volume_5m_plus")
    if volume >= 20_000_000:
        score += 10
        reasons.append("volume_20m_plus")
    if volume >= 100_000_000:
        score += 8
        reasons.append("volume_100m_plus")
    if price is not None and price < 1:
        score -= 12
        reasons.append("sub_1_dollar_liquidity_risk")

    return max(0, min(100, score)), reasons


def calculate_market_cap_score(universe: str) -> tuple[int, list[str]]:
    if universe == "nano":
        return 58, ["nano_cap_high_opportunity_high_risk"]
    if universe == "micro":
        return 72, ["micro_cap_in_play"]
    if universe == "small":
        return 82, ["small_cap_clean_in_play"]
    if universe == "mid":
        return 78, ["mid_cap_institutional_watch"]
    if universe == "large":
        return 84, ["large_cap_separate_playbook"]
    if universe == "mega":
        return 88, ["mega_cap_separate_playbook"]
    return 50, ["market_cap_unknown"]


def calculate_move_score(change_percent: float) -> tuple[int, list[str]]:
    abs_change = abs(change_percent)

    if abs_change >= 50:
        return 95, ["extreme_move_50pct_plus"]
    if abs_change >= 20:
        return 88, ["major_move_20pct_plus"]
    if abs_change >= 10:
        return 78, ["move_10pct_plus"]
    if abs_change >= 5:
        return 65, ["move_5pct_plus"]
    if abs_change >= 2:
        return 50, ["move_2pct_plus"]

    return 35, ["volume_first_low_move"]


def calculate_bucket_score(bucket: str) -> tuple[int, list[str]]:
    if bucket == "gainers":
        return 80, ["source_gainers"]
    if bucket == "losers":
        return 80, ["source_losers"]
    if bucket == "active":
        return 70, ["source_most_active"]
    return 50, ["source_unknown"]


def calculate_quality_rank(mover: NormalizedMover) -> tuple[int, dict[str, Any], list[str]]:
    price_score, price_reasons = calculate_price_quality_score(mover.price)
    liquidity_score, liquidity_reasons = calculate_liquidity_score(mover.volume, mover.price)
    market_cap_score, market_cap_reasons = calculate_market_cap_score(mover.universe)
    move_score, move_reasons = calculate_move_score(mover.change_percent)
    bucket_score, bucket_reasons = calculate_bucket_score(mover.source_bucket)

    ranking = {
        "priceQualityScore": price_score,
        "liquidityScore": liquidity_score,
        "marketCapScore": market_cap_score,
        "moveScore": move_score,
        "bucketScore": bucket_score,
    }

    if price_score <= 0:
        return 0, ranking, price_reasons

    if liquidity_score <= 0:
        return 0, ranking, liquidity_reasons

    final_score = round(
        liquidity_score * 0.30
        + move_score * 0.25
        + price_score * 0.20
        + market_cap_score * 0.15
        + bucket_score * 0.10
    )

    reasons = [
        *liquidity_reasons,
        *move_reasons,
        *price_reasons,
        *market_cap_reasons,
        *bucket_reasons,
    ]

    return max(0, min(100, final_score)), ranking, reasons


def build_short_targets_from_stop(
    entry: float | None,
    stop: float | None,
) -> list[dict[str, float | None]]:
    """Build true 2R/3R targets from actual entry and stop.

    Important: do not label a target as TP1_2R if the math is not really 2R.
    If a 2R target would be impossible below zero, return empty targets so
    the quality gate rejects the idea instead of sending a fake signal.
    """

    if entry is None or stop is None or entry <= 0 or stop <= entry:
        return []

    risk = stop - entry
    if risk <= 0:
        return []

    tp1 = entry - risk * 2
    tp2 = entry - risk * 3

    if tp1 <= 0:
        return []

    targets: list[dict[str, float | None]] = [
        {"name": "TP1_2R", "price": round(tp1, 4), "rr": 2.0},
    ]

    if tp2 > 0:
        targets.append({"name": "TP2_3R", "price": round(tp2, 4), "rr": 3.0})
    else:
        targets.append({"name": "TP2_OPEN", "price": None, "rr": None})

    return targets




def build_long_targets_from_stop(entry: float, stop: float) -> list[dict[str, float | None]]:
    risk = entry - stop
    if risk <= 0:
        return []

    tp1 = entry + risk * 2
    tp2 = entry + risk * 3

    targets: list[dict[str, float | None]] = [
        {"name": "TP1_2R", "price": round(tp1, 4), "rr": 2.0},
        {"name": "TP2_3R", "price": round(tp2, 4), "rr": 3.0},
    ]

    return targets


def calculate_long_levels(
    price: float | None,
    structural_support: float | None,
) -> tuple[dict[str, float | None], float | None, list[dict[str, float | None]]]:
    if price is None or price <= 0:
        return {"min": None, "max": None}, None, []

    entry_min = round(price * 0.985, 4)
    entry_max = round(price * 1.015, 4)

    raw_stop = structural_support if structural_support and structural_support < price else price * 0.96
    stop = round(raw_stop * 0.995, 4)

    targets = build_long_targets_from_stop(price, stop)

    return {"min": entry_min, "max": entry_max}, stop, targets


def calculate_long_rr(entry: float | None, stop: float | None, target: float | None) -> float | None:
    if entry is None or stop is None or target is None:
        return None
    if entry <= 0 or stop >= entry or target <= entry:
        return None

    risk = entry - stop
    reward = target - entry

    if risk <= 0 or reward <= 0:
        return None

    return round(reward / risk, 2)


def calculate_short_levels(
    price: float | None,
    day_high: float | None,
) -> tuple[dict[str, float | None], float | None, list[dict[str, float | None]]]:
    if price is None or price <= 0:
        return {"min": None, "max": None}, None, []

    entry_min = round(price * 0.985, 4)
    entry_max = round(price * 1.015, 4)

    structural_stop = day_high if day_high and day_high > price else price * 1.08
    stop = round(structural_stop * 1.01, 4)

    targets = build_short_targets_from_stop(price, stop)

    return {"min": entry_min, "max": entry_max}, stop, targets


def calculate_short_rr(entry: float | None, stop: float | None, target: float | None) -> float | None:
    if entry is None or stop is None or target is None:
        return None
    if entry <= 0 or stop <= entry or target >= entry:
        return None

    risk = stop - entry
    reward = entry - target

    if risk <= 0 or reward <= 0:
        return None

    return round(reward / risk, 2)


def calculate_entry_distance_pct(price: float | None, entry_zone: dict[str, float | None]) -> float | None:
    if price is None or price <= 0:
        return None

    entry_min = to_float(entry_zone.get("min"))
    entry_max = to_float(entry_zone.get("max"))

    if entry_min is None or entry_max is None:
        return None

    if entry_min <= price <= entry_max:
        return 0.0

    nearest = entry_min if price < entry_min else entry_max
    return round(abs(price - nearest) / price * 100, 3)


def calculate_active_short_risk_model(
    setup_dict: dict[str, Any],
    candle_snapshot: dict[str, Any],
    entry: float | None,
) -> dict[str, Any]:
    """Use 5m confirmation structure for ACTIVE short risk.

    ARMED ideas can use day-high/HOD invalidation while waiting. Once a real
    5m trigger appears, a premium signal should be judged from the actionable
    trigger structure: lower-high candle, VWAP rejection high, EMA20 loss candle,
    or failed HOD reclaim. If that structural stop still cannot produce true
    2R, the quality gate rejects it.
    """

    current_stop = to_float(setup_dict.get("stop"))
    current_targets = setup_dict.get("targets") if isinstance(setup_dict.get("targets"), list) else []

    if entry is None or entry <= 0:
        return {
            "stop": current_stop,
            "targets": current_targets,
            "model": "fallback_missing_entry",
            "risk": None,
        }

    source = setup_dict.get("source") if isinstance(setup_dict.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}
    confirmation = candle_context.get("confirmation") if isinstance(candle_context.get("confirmation"), dict) else {}
    if not confirmation.get("hasActiveConfirmation"):
        confirmation = candle_snapshot.get("confirmation") if isinstance(candle_snapshot, dict) else {}

    if not isinstance(confirmation, dict) or not confirmation.get("hasActiveConfirmation"):
        return {
            "stop": current_stop,
            "targets": current_targets,
            "model": "armed_day_high_or_hod_stop",
            "risk": (current_stop - entry) if current_stop and current_stop > entry else None,
        }

    atr14_5m = to_float(candle_snapshot.get("atr14_5m"))
    ema20_5m = to_float(candle_snapshot.get("ema20_5m"))
    vwap = to_float(candle_snapshot.get("vwap"))
    hod = to_float(candle_snapshot.get("hod"))
    recent = candle_snapshot.get("recentFiveMinuteCandles")
    if not isinstance(recent, list):
        recent = []

    last_candle = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    last_high = to_float(last_candle.get("high"))

    # Keep the stop wide enough to avoid micro-noise, but do not let it become
    # a day-high stop after a late pullback confirmation.
    min_risk = max(entry * 0.0125, (atr14_5m or 0) * 0.10)
    max_risk = max(entry * 0.025, min(entry * 0.16, (atr14_5m or entry * 0.08) * 1.25))
    buffer = max(entry * 0.006, min((atr14_5m or entry * 0.03) * 0.18, entry * 0.035))

    candidates: list[tuple[str, float]] = []

    lower_high = confirmation.get("lowerHigh5m") if isinstance(confirmation.get("lowerHigh5m"), dict) else {}
    if lower_high.get("detected"):
        level = to_float(lower_high.get("lastHigh"))
        if level is not None:
            candidates.append(("lower_high_5m_stop", level + buffer))

    vwap_rejection = confirmation.get("vwapRejection5m") if isinstance(confirmation.get("vwapRejection5m"), dict) else {}
    if vwap_rejection.get("detected"):
        level = max(
            value for value in (
                to_float(vwap_rejection.get("lastHigh")),
                to_float(vwap_rejection.get("vwap")),
                vwap,
            ) if value is not None
        )
        candidates.append(("vwap_rejection_5m_stop", level + buffer))

    ema20_loss = confirmation.get("ema20Loss5m") if isinstance(confirmation.get("ema20Loss5m"), dict) else {}
    if ema20_loss.get("detected"):
        levels = [value for value in (last_high, ema20_5m, to_float(ema20_loss.get("ema20_5m"))) if value is not None]
        if levels:
            candidates.append(("ema20_loss_5m_stop", max(levels) + buffer))

    failed_hod = confirmation.get("failedHodReclaim5m") if isinstance(confirmation.get("failedHodReclaim5m"), dict) else {}
    if failed_hod.get("detected"):
        levels = [value for value in (to_float(failed_hod.get("lastHigh")), to_float(failed_hod.get("hod")), hod) if value is not None]
        if levels:
            candidates.append(("failed_hod_reclaim_5m_stop", max(levels) + buffer))

    opening_breakdown = confirmation.get("openingRangeBreakdown5m") if isinstance(confirmation.get("openingRangeBreakdown5m"), dict) else {}
    if opening_breakdown.get("detected"):
        levels = [
            value for value in (
                to_float(opening_breakdown.get("lastHigh")),
                to_float(opening_breakdown.get("openingLow")),
                last_high,
            ) if value is not None
        ]
        if levels:
            candidates.append(("opening_range_breakdown_5m_stop", max(levels) + buffer))

    valid: list[tuple[float, str, float]] = []

    for model, raw_stop in candidates:
        if raw_stop <= entry:
            raw_stop = entry + min_risk
        stop = max(raw_stop, entry + min_risk)
        risk = stop - entry
        if risk <= 0 or risk > max_risk:
            continue
        targets = build_short_targets_from_stop(entry, stop)
        rr_to_tp1 = calculate_short_rr(entry, stop, to_float(targets[0].get("price")) if targets else None)
        if rr_to_tp1 is not None and rr_to_tp1 >= 2:
            valid.append((risk, model, stop))

    if valid:
        risk, model, stop = sorted(valid, key=lambda item: item[0])[0]
        rounded_stop = round(stop, 4)
        return {
            "stop": rounded_stop,
            "targets": build_short_targets_from_stop(entry, rounded_stop),
            "model": model,
            "risk": round(risk, 4),
            "buffer": round(buffer, 4),
            "minRisk": round(min_risk, 4),
            "maxRisk": round(max_risk, 4),
        }

    return {
        "stop": current_stop,
        "targets": current_targets,
        "model": "fallback_day_high_or_hod_stop_no_valid_structural_stop",
        "risk": (current_stop - entry) if current_stop and current_stop > entry else None,
        "buffer": round(buffer, 4),
        "minRisk": round(min_risk, 4),
        "maxRisk": round(max_risk, 4),
    }


def get_signal_grade(score: int) -> str:
    if score >= 92:
        return "A+"
    if score >= 84:
        return "A"
    if score >= 76:
        return "B"
    if score >= 68:
        return "C"
    return "REJECT"


def get_confirmation_quality_rejection_reason(signal: dict[str, Any]) -> str | None:
    """Reject formal triggers that are not strong enough for client-facing signals."""

    confirmation = signal.get("confirmation") if isinstance(signal.get("confirmation"), dict) else {}
    triggers = signal.get("triggers") if isinstance(signal.get("triggers"), list) else []
    risk_model = signal.get("activeRiskModel") if isinstance(signal.get("activeRiskModel"), dict) else {}
    model = str(risk_model.get("model") or "")

    if model.startswith("fallback_") or "no_valid_structural_stop" in model:
        return "REJECT_NO_VALID_STRUCTURAL_STOP"

    if not triggers:
        return "REJECT_NO_ACTIVE_TRIGGER"

    # Single lower-high confirmation is allowed only when the indicator already
    # certified bearish rejection. If it is the only trigger, require an A+ style
    # score and a meaningful gap from the previous swing.
    if triggers == ["lower_high_5m"]:
        lower_high = confirmation.get("lowerHigh5m") if isinstance(confirmation.get("lowerHigh5m"), dict) else {}
        gap = to_float(lower_high.get("lowerHighGapPct"), 0) or 0
        close_position = to_float(lower_high.get("closePosition"), 1)
        bearish_body = lower_high.get("bearishBody") is True
        close_below_previous = lower_high.get("closeBelowPreviousClose") is True

        if gap < 0.75:
            return "REJECT_LOWER_HIGH_GAP_TOO_SMALL"
        if close_position is not None and close_position > 0.58:
            return "REJECT_LOWER_HIGH_CLOSE_TOO_HIGH"
        if not (bearish_body or close_below_previous):
            return "REJECT_LOWER_HIGH_NO_BEARISH_PRESSURE"

    # EMA20 loss as the only trigger is often too late/noisy unless the candle
    # itself shows rejection. Keep it on the dashboard but do not send Telegram.
    if triggers == ["ema20_loss_5m"]:
        ema = confirmation.get("ema20Loss5m") if isinstance(confirmation.get("ema20Loss5m"), dict) else {}
        close_position = to_float(ema.get("closePosition"), 1)
        bearish_pressure = ema.get("bearishPressure") is True
        if not bearish_pressure or (close_position is not None and close_position > 0.55):
            return "REJECT_EMA20_LOSS_WEAK_CANDLE"

    # Unrealistic target guard: if TP1 needs a collapse of more than 35% from
    # entry, this is not an actionable 2R scalp signal for Telegram.
    entry = to_float(signal.get("entry"))
    targets = signal.get("targets") if isinstance(signal.get("targets"), list) else []
    target1 = targets[0] if targets and isinstance(targets[0], dict) else {}
    tp1 = to_float(target1.get("price"))
    if entry and tp1:
        direction = str(signal.get("direction") or "short")
        if direction == "long":
            target_distance_pct = ((tp1 - entry) / entry) * 100
        else:
            target_distance_pct = ((entry - tp1) / entry) * 100
        if target_distance_pct > 35:
            return "REJECT_TP1_DISTANCE_UNREALISTIC"

    return None


S512_QUALITY_GUARD_VERSION = "s5_12_signal_quality_guard_calibration_v1"

S512_EXECUTION_TRIGGERS = {
    "vwap_rejection_5m",
    "ema20_loss_5m",
    "failed_hod_reclaim_5m",
    "opening_range_breakdown_5m",
    "opening_drive_failure_5m",
    "vwap_reclaim_5m",
    "ema20_reclaim_5m",
    "opening_range_breakout_5m",
    "gap_hold_continuation_5m",
    "first_pullback_continuation_5m",
}

S512_STRUCTURE_ONLY_TRIGGERS = {
    "lower_high_5m",
    "higher_low_5m",
}


def build_s512_signal_quality_guard(
    setup_dict: dict[str, Any],
    signal: dict[str, Any],
    candle_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """S5.12 calibration guard.

    Goal:
    - Keep WATCH/ARMED broad enough for the AI Desk.
    - Keep ACTIVE desk ideas strict but still visible when they are actionable.
    - Make Telegram/Elite much stricter than plain ACTIVE so the product feels
      premium instead of noisy.
    """

    triggers = signal.get("triggers") if isinstance(signal.get("triggers"), list) else []
    triggers = [str(trigger) for trigger in triggers if str(trigger or "").strip()]
    trigger_set = set(triggers)
    execution_triggers = [trigger for trigger in triggers if trigger in S512_EXECUTION_TRIGGERS]
    structure_only_triggers = [trigger for trigger in triggers if trigger in S512_STRUCTURE_ONLY_TRIGGERS]

    rr_to_tp1 = to_float(signal.get("rrToTp1"))
    score = safe_int(signal.get("signalScore"), 0)
    grade = str(signal.get("signalGrade") or "")
    entry_distance_pct = to_float(signal.get("entryDistancePct"))
    entry = to_float(signal.get("entry"))
    stop = to_float(signal.get("stop"))
    targets = signal.get("targets") if isinstance(signal.get("targets"), list) else []
    setup_slug = str(signal.get("setupSlug") or setup_dict.get("setupSlug") or "")
    direction = str(signal.get("direction") or setup_dict.get("direction") or "")
    status = str(setup_dict.get("status") or signal.get("status") or "")

    source = setup_dict.get("source") if isinstance(setup_dict.get("source"), dict) else {}
    watch_candidate = source.get("watchCandidate") if isinstance(source.get("watchCandidate"), dict) else {}
    price = to_float(signal.get("entry")) or to_float(watch_candidate.get("price"))
    volume = to_float(watch_candidate.get("volume"), 0) or 0
    universe = str(watch_candidate.get("universe") or "unknown")

    risk_model = signal.get("activeRiskModel") if isinstance(signal.get("activeRiskModel"), dict) else {}
    risk_model_name = str(risk_model.get("model") or "")

    candle_freshness = signal.get("candleFreshness") if isinstance(signal.get("candleFreshness"), dict) else {}
    is_fresh = bool(signal.get("isCandleFresh")) or bool(candle_freshness.get("isFresh"))

    desk_reasons: list[str] = []
    telegram_reasons: list[str] = []
    reject_status: str | None = None

    # Desk ACTIVE guard: must be real, fresh, structured, and tradeable.
    if status.upper() != "ACTIVE":
        reject_status = "WAITING_CONFIRMATION"
        desk_reasons.append("not_active_yet")
    elif not is_fresh:
        reject_status = "REJECT_STALE_CANDLES"
        desk_reasons.append("stale_candle_context")
    elif not triggers:
        reject_status = "REJECT_NO_ACTIVE_TRIGGER"
        desk_reasons.append("missing_active_trigger")
    elif rr_to_tp1 is None or rr_to_tp1 < 2:
        reject_status = "REJECT_RR_BELOW_2R"
        desk_reasons.append("rr_to_tp1_below_2r")
    elif grade not in {"A+", "A"} or score < 84:
        reject_status = "REJECT_SCORE_TOO_LOW"
        desk_reasons.append("score_below_active_threshold")
    elif risk_model_name.startswith("fallback_") or "no_valid_structural_stop" in risk_model_name:
        reject_status = "REJECT_NO_VALID_STRUCTURAL_STOP"
        desk_reasons.append("missing_valid_structural_stop")
    elif entry is None or stop is None or not targets:
        reject_status = "REJECT_MISSING_RISK_LEVELS"
        desk_reasons.append("entry_stop_or_targets_missing")
    elif entry_distance_pct is not None and entry_distance_pct > 3.0:
        reject_status = "REJECT_ENTRY_TOO_FAR_FOR_ACTIVE"
        desk_reasons.append("entry_distance_above_3pct")
    elif len(triggers) == 1 and triggers[0] in S512_STRUCTURE_ONLY_TRIGGERS:
        reject_status = "REJECT_SINGLE_STRUCTURE_TRIGGER"
        desk_reasons.append("single_structure_trigger_without_execution_confirmation")
    else:
        desk_reasons.append("desk_active_quality_passed")

    desk_passed = reject_status is None

    # Telegram/Elite guard: this is deliberately stricter than desk ACTIVE.
    telegram_passed = False
    if not desk_passed:
        telegram_reasons.append("desk_quality_not_passed")
    else:
        if score < 92:
            telegram_reasons.append("telegram_requires_a_plus_score_92")
        if rr_to_tp1 is None or rr_to_tp1 < 2.2:
            telegram_reasons.append("telegram_requires_rr_2_2_plus")
        if not execution_triggers:
            telegram_reasons.append("telegram_requires_execution_trigger")
        if len(triggers) < 2 and setup_slug not in {
            "opening_range_breakdown_short",
            "opening_range_breakout_long",
            "gap_hold_continuation_long",
            "orb_pullback_continuation",
            "large_cap_gap_continuation",
            "large_cap_vwap_trend_long",
        }:
            telegram_reasons.append("telegram_requires_multi_confirmation_or_setup_specific_break")
        if entry_distance_pct is not None and entry_distance_pct > 1.25:
            telegram_reasons.append("telegram_entry_distance_above_1_25pct")
        if price is not None and price < 1.0:
            telegram_reasons.append("telegram_blocks_sub_1_dollar_names")
        elif price is not None and price < 1.5 and not (score >= 96 and volume >= 20_000_000):
            telegram_reasons.append("telegram_low_price_requires_exceptional_score_and_volume")
        if universe in {"nano", "micro", "small"} and volume < 1_000_000:
            telegram_reasons.append("telegram_small_cap_requires_1m_volume")
        if direction == "short" and "lower_high_5m" in trigger_set and not execution_triggers:
            telegram_reasons.append("telegram_short_needs_execution_after_lower_high")
        if direction == "long" and "higher_low_5m" in trigger_set and not execution_triggers:
            telegram_reasons.append("telegram_long_needs_reclaim_or_breakout_execution")

        telegram_passed = len(telegram_reasons) == 0
        if telegram_passed:
            telegram_reasons.append("telegram_elite_quality_passed")

    return {
        "version": S512_QUALITY_GUARD_VERSION,
        "deskPassed": desk_passed,
        "telegramPassed": telegram_passed,
        "rejectStatus": reject_status,
        "deskReasons": desk_reasons,
        "telegramReasons": telegram_reasons,
        "metrics": {
            "setupSlug": setup_slug,
            "direction": direction,
            "status": status,
            "score": score,
            "grade": grade,
            "rrToTp1": rr_to_tp1,
            "entryDistancePct": entry_distance_pct,
            "triggerCount": len(triggers),
            "executionTriggerCount": len(execution_triggers),
            "structureOnlyTriggerCount": len(structure_only_triggers),
            "price": price,
            "volume": volume,
            "universe": universe,
            "riskModel": risk_model_name,
        },
        "thresholds": {
            "deskMinScore": 84,
            "deskMinRrToTp1": 2.0,
            "deskMaxEntryDistancePct": 3.0,
            "telegramMinScore": 92,
            "telegramMinRrToTp1": 2.2,
            "telegramMaxEntryDistancePct": 1.25,
            "telegramMinSmallCapVolume": 1_000_000,
        },
    }



def parse_candle_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    normalized = raw.replace("Z", "+00:00")

    # FMP historical-chart usually returns naive strings like "2026-06-05 15:59:00".
    # Treat them as exchange/session timestamps for freshness-date comparison.
    for candidate in (normalized, normalized.replace(" ", "T")):
        try:
            dt = datetime.fromisoformat(candidate)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            continue

    return None


def evaluate_candle_freshness(
    candle_snapshot: dict[str, Any],
    *,
    max_age_seconds: int = 60 * 60,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    latest_raw = (
        candle_snapshot.get("latestCandleAt")
        or candle_snapshot.get("latestFiveMinuteCandleAt")
    )
    latest_dt = parse_candle_datetime(latest_raw)

    if latest_dt is None:
        return {
            "isFresh": False,
            "status": "MISSING",
            "reason": "missing_latest_candle_timestamp",
            "latestCandleAt": latest_raw,
            "now": now.isoformat(),
            "ageSeconds": None,
            "maxAgeSeconds": max_age_seconds,
            "sameUtcDate": False,
        }

    age_seconds = int((now - latest_dt).total_seconds())
    same_utc_date = latest_dt.date() == now.date()

    if age_seconds < -300:
        return {
            "isFresh": False,
            "status": "INVALID_FUTURE",
            "reason": "latest_candle_timestamp_is_in_future",
            "latestCandleAt": latest_dt.isoformat(),
            "now": now.isoformat(),
            "ageSeconds": age_seconds,
            "maxAgeSeconds": max_age_seconds,
            "sameUtcDate": same_utc_date,
        }

    if not same_utc_date:
        return {
            "isFresh": False,
            "status": "STALE_PREVIOUS_SESSION",
            "reason": "latest_candle_not_from_current_utc_date",
            "latestCandleAt": latest_dt.isoformat(),
            "now": now.isoformat(),
            "ageSeconds": age_seconds,
            "maxAgeSeconds": max_age_seconds,
            "sameUtcDate": same_utc_date,
        }

    if age_seconds > max_age_seconds:
        return {
            "isFresh": False,
            "status": "STALE_TOO_OLD",
            "reason": "latest_candle_older_than_allowed_window",
            "latestCandleAt": latest_dt.isoformat(),
            "now": now.isoformat(),
            "ageSeconds": age_seconds,
            "maxAgeSeconds": max_age_seconds,
            "sameUtcDate": same_utc_date,
        }

    return {
        "isFresh": True,
        "status": "FRESH",
        "reason": "latest_candle_fresh",
        "latestCandleAt": latest_dt.isoformat(),
        "now": now.isoformat(),
        "ageSeconds": age_seconds,
        "maxAgeSeconds": max_age_seconds,
        "sameUtcDate": same_utc_date,
    }



def calculate_active_long_risk_model(
    setup_dict: dict[str, Any],
    candle_snapshot: dict[str, Any],
    entry: float | None,
) -> dict[str, Any]:
    """Use 5m confirmation structure for ACTIVE long risk.

    S5.3 VWAP Reclaim Long is the first live long playbook. The stop must be
    under the reclaim/EMA/VWAP structure, not a random wide day-low stop, and
    TP math must still produce a true 2R idea before Telegram eligibility.
    """

    current_stop = to_float(setup_dict.get("stop"))
    current_targets = setup_dict.get("targets") if isinstance(setup_dict.get("targets"), list) else []

    if entry is None or entry <= 0:
        return {
            "stop": current_stop,
            "targets": current_targets,
            "model": "fallback_missing_entry",
            "risk": None,
        }

    source = setup_dict.get("source") if isinstance(setup_dict.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}
    confirmation = candle_context.get("confirmation") if isinstance(candle_context.get("confirmation"), dict) else {}
    if not confirmation.get("hasActiveConfirmation"):
        confirmation = candle_snapshot.get("confirmation") if isinstance(candle_snapshot, dict) else {}

    if not isinstance(confirmation, dict) or not confirmation.get("hasActiveConfirmation"):
        return {
            "stop": current_stop,
            "targets": current_targets,
            "model": "armed_structure_support_stop",
            "risk": (entry - current_stop) if current_stop and current_stop < entry else None,
        }

    atr14_5m = to_float(candle_snapshot.get("atr14_5m"))
    ema20_5m = to_float(candle_snapshot.get("ema20_5m"))
    vwap = to_float(candle_snapshot.get("vwap"))
    lod = to_float(candle_snapshot.get("lod"))
    recent = candle_snapshot.get("recentFiveMinuteCandles")
    if not isinstance(recent, list):
        recent = []

    last_candle = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    last_low = to_float(last_candle.get("low"))

    min_risk = max(entry * 0.0125, (atr14_5m or 0) * 0.10)
    max_risk = max(entry * 0.025, min(entry * 0.16, (atr14_5m or entry * 0.08) * 1.25))
    buffer = max(entry * 0.006, min((atr14_5m or entry * 0.03) * 0.18, entry * 0.035))

    candidates: list[tuple[str, float]] = []

    vwap_reclaim = confirmation.get("vwapReclaim5m") if isinstance(confirmation.get("vwapReclaim5m"), dict) else {}
    if vwap_reclaim.get("detected"):
        levels = [
            value for value in (
                to_float(vwap_reclaim.get("lastLow")),
                to_float(vwap_reclaim.get("vwap")),
                vwap,
                last_low,
            ) if value is not None
        ]
        if levels:
            candidates.append(("vwap_reclaim_5m_stop", min(levels) - buffer))

    ema20_reclaim = confirmation.get("ema20Reclaim5m") if isinstance(confirmation.get("ema20Reclaim5m"), dict) else {}
    if ema20_reclaim.get("detected"):
        levels = [
            value for value in (
                to_float(ema20_reclaim.get("lastLow")),
                to_float(ema20_reclaim.get("ema20_5m")),
                ema20_5m,
                last_low,
            ) if value is not None
        ]
        if levels:
            candidates.append(("ema20_reclaim_5m_stop", min(levels) - buffer))

    higher_low = confirmation.get("higherLow5m") if isinstance(confirmation.get("higherLow5m"), dict) else {}
    if higher_low.get("detected"):
        level = to_float(higher_low.get("lastLow"))
        if level is not None:
            candidates.append(("higher_low_5m_stop", level - buffer))

    opening_breakout = confirmation.get("openingRangeBreakout5m") if isinstance(confirmation.get("openingRangeBreakout5m"), dict) else {}
    if opening_breakout.get("detected"):
        levels = [
            value for value in (
                to_float(opening_breakout.get("lastLow")),
                to_float(opening_breakout.get("openingHigh")),
                last_low,
            ) if value is not None
        ]
        if levels:
            candidates.append(("opening_range_breakout_5m_stop", min(levels) - buffer))

    gap_hold = confirmation.get("gapHoldContinuation5m") if isinstance(confirmation.get("gapHoldContinuation5m"), dict) else {}
    if gap_hold.get("detected"):
        levels = [
            value for value in (
                to_float(gap_hold.get("lastLow")),
                to_float(gap_hold.get("openingLow")),
                to_float(gap_hold.get("vwap")),
                to_float(gap_hold.get("ema20_5m")),
                last_low,
            ) if value is not None
        ]
        if levels:
            candidates.append(("gap_hold_continuation_5m_stop", min(levels) - buffer))

    pullback_continuation = confirmation.get("pullbackContinuation5m") if isinstance(confirmation.get("pullbackContinuation5m"), dict) else {}
    if pullback_continuation.get("detected"):
        levels = [
            value for value in (
                to_float(pullback_continuation.get("lastLow")),
                to_float(pullback_continuation.get("openingHigh")),
                to_float(pullback_continuation.get("vwap")),
                to_float(pullback_continuation.get("ema20_5m")),
                last_low,
            ) if value is not None
        ]
        if levels:
            candidates.append(("first_pullback_continuation_5m_stop", min(levels) - buffer))

    if lod and lod < entry:
        candidates.append(("lod_support_fallback_stop", lod - buffer))

    valid: list[tuple[float, str, float]] = []

    for model, raw_stop in candidates:
        if raw_stop >= entry:
            raw_stop = entry - min_risk
        stop = min(raw_stop, entry - min_risk)
        risk = entry - stop
        if risk <= 0 or risk > max_risk:
            continue
        targets = build_long_targets_from_stop(entry, stop)
        rr_to_tp1 = calculate_long_rr(entry, stop, to_float(targets[0].get("price")) if targets else None)
        if rr_to_tp1 is not None and rr_to_tp1 >= 2:
            valid.append((risk, model, stop))

    if valid:
        risk, model, stop = sorted(valid, key=lambda item: item[0])[0]
        rounded_stop = round(stop, 4)
        return {
            "stop": rounded_stop,
            "targets": build_long_targets_from_stop(entry, rounded_stop),
            "model": model,
            "risk": round(risk, 4),
            "buffer": round(buffer, 4),
            "minRisk": round(min_risk, 4),
            "maxRisk": round(max_risk, 4),
        }

    return {
        "stop": current_stop,
        "targets": current_targets,
        "model": "fallback_lod_or_support_stop_no_valid_structural_stop",
        "risk": (entry - current_stop) if current_stop and current_stop < entry else None,
        "buffer": round(buffer, 4),
        "minRisk": round(min_risk, 4),
        "maxRisk": round(max_risk, 4),
    }


def build_signal_object(setup_dict: dict[str, Any], candle_snapshot: dict[str, Any]) -> dict[str, Any]:
    symbol = str(setup_dict.get("symbol") or "")
    setup_slug = str(setup_dict.get("setupSlug") or "setup")
    direction = str(setup_dict.get("direction") or "short")
    confidence = int(setup_dict.get("confidence") or 0)

    source = setup_dict.get("source") if isinstance(setup_dict.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}
    setup_confirmation = candle_context.get("confirmation") if isinstance(candle_context.get("confirmation"), dict) else {}
    snapshot_confirmation = candle_snapshot.get("confirmation") if isinstance(candle_snapshot, dict) else {}
    confirmation = setup_confirmation if setup_confirmation.get("hasActiveConfirmation") else snapshot_confirmation
    candle_freshness = candle_snapshot.get("candleFreshness") if isinstance(candle_snapshot, dict) else {}
    is_candle_fresh = bool(candle_freshness.get("isFresh")) if isinstance(candle_freshness, dict) else False
    triggers = confirmation.get("triggers") if isinstance(confirmation, dict) else []
    if not isinstance(triggers, list):
        triggers = []

    price = to_float(candle_context.get("latestPrice"))
    if price is None:
        watch_candidate = source.get("watchCandidate") if isinstance(source.get("watchCandidate"), dict) else {}
        price = to_float(watch_candidate.get("price"))

    entry_zone = setup_dict.get("entryZone") if isinstance(setup_dict.get("entryZone"), dict) else {}

    entry = price
    if direction == "long":
        risk_model = calculate_active_long_risk_model(setup_dict, candle_snapshot, entry)
    else:
        risk_model = calculate_active_short_risk_model(setup_dict, candle_snapshot, entry)
    stop = to_float(risk_model.get("stop"))
    targets = risk_model.get("targets") if isinstance(risk_model.get("targets"), list) else []
    target1 = targets[0] if len(targets) > 0 and isinstance(targets[0], dict) else {}
    target2 = targets[1] if len(targets) > 1 and isinstance(targets[1], dict) else {}

    rr_to_tp1 = calculate_long_rr(entry, stop, to_float(target1.get("price"))) if direction == "long" else calculate_short_rr(entry, stop, to_float(target1.get("price")))
    rr_to_tp2 = calculate_long_rr(entry, stop, to_float(target2.get("price"))) if direction == "long" else calculate_short_rr(entry, stop, to_float(target2.get("price")))
    entry_distance_pct = calculate_entry_distance_pct(price, entry_zone)

    score = confidence

    if rr_to_tp1 is None:
        score -= 30
    elif rr_to_tp1 < 2:
        score -= 25
    elif rr_to_tp1 >= 2:
        score += 4
    if rr_to_tp2 is not None and rr_to_tp2 >= 3:
        score += 3

    trigger_count = len(triggers)
    if trigger_count >= 3:
        score += 8
    elif trigger_count == 2:
        score += 5
    elif trigger_count == 1:
        score += 2
    else:
        score -= 20

    if "vwap_rejection_5m" in triggers:
        score += 5
    if "ema20_loss_5m" in triggers:
        score += 4
    if "lower_high_5m" in triggers:
        score += 3
    if "failed_hod_reclaim_5m" in triggers:
        score += 4
    if "vwap_reclaim_5m" in triggers:
        score += 5
    if "ema20_reclaim_5m" in triggers:
        score += 4
    if "higher_low_5m" in triggers:
        score += 3
    if "opening_range_breakdown_5m" in triggers:
        score += 6
    if "opening_range_breakout_5m" in triggers:
        score += 6
    if "opening_drive_failure_5m" in triggers:
        score += 4
    if "gap_hold_continuation_5m" in triggers:
        score += 6
    if "first_pullback_continuation_5m" in triggers:
        score += 6

    if entry_distance_pct is not None:
        if entry_distance_pct <= 0.25:
            score += 3
        elif entry_distance_pct <= 1.0:
            score += 1
        elif entry_distance_pct > 3.0:
            score -= 8

    volume_acceleration = to_float(candle_context.get("volumeAcceleration"))
    if volume_acceleration is not None and volume_acceleration < 0.85:
        score += 3

    pullback_from_hod_pct = to_float(candle_context.get("pullbackFromHodPct"))
    if pullback_from_hod_pct is not None:
        if 3 <= pullback_from_hod_pct <= 18:
            score += 3
        elif pullback_from_hod_pct > 30:
            score -= 5

    primary_trigger = str(triggers[0]) if triggers else None

    calibration_adjustment = get_runtime_calibration_adjustment(setup_slug, primary_trigger)
    score_adjustment = safe_int(calibration_adjustment.get("scoreAdjustment"), 0) if calibration_adjustment else 0
    strictness_adjustment = safe_int(calibration_adjustment.get("strictnessAdjustment"), 0) if calibration_adjustment else 0

    if score_adjustment:
        score += score_adjustment

    # A stricter overnight adjustment should make single-trigger ideas harder to pass
    # without fully blocking dashboard visibility. Telegram still requires PASSED.
    if strictness_adjustment > 0 and len(triggers) <= 1:
        score -= strictness_adjustment * 3

    score = max(0, min(100, int(round(score))))
    grade = get_signal_grade(score)

    # Telegram rule v1:
    # ACTIVE + trigger + RR >= 2 + A/A+ => telegramEligible true.
    # ARMED / no trigger / RR < 2 => telegramEligible false.
    is_active = str(setup_dict.get("status") or "").upper() == "ACTIVE"
    has_trigger = len(triggers) > 0
    premium_signal = (
        is_active
        and has_trigger
        and is_candle_fresh
        and grade in {"A+", "A"}
        and rr_to_tp1 is not None
        and rr_to_tp1 >= 2
    )
    telegram_eligible = premium_signal and score >= 84

    now = datetime.now(timezone.utc).isoformat()
    signal_id = f"stock:{symbol}:{setup_slug}:{now}"

    return {
        "signalId": signal_id,
        "assetType": "stock",
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setupName": setup_dict.get("setupName"),
        "direction": direction,
        "status": setup_dict.get("status"),
        "entry": entry,
        "entryZone": entry_zone,
        "stop": stop,
        "targets": targets,
        "activeRiskModel": risk_model,
        "rrToTp1": rr_to_tp1,
        "rrToTp2": rr_to_tp2,
        "entryDistancePct": entry_distance_pct,
        "primaryTrigger": primary_trigger,
        "triggers": triggers,
        "signalScore": score,
        "signalGrade": grade,
        "premiumSignal": premium_signal,
        "telegramEligible": telegram_eligible,
        "confirmation": confirmation,
        "candleFreshness": candle_freshness,
        "isCandleFresh": is_candle_fresh,
        "createdAt": now,
        "engineVersion": "holly_persistent_v2",
        "calibrationAdjustment": calibration_adjustment,
    }


def apply_signal_quality_gate(setup_dict: dict[str, Any], candle_snapshot: dict[str, Any]) -> dict[str, Any]:
    signal = build_signal_object(setup_dict, candle_snapshot)

    setup_dict["signalId"] = signal["signalId"]
    setup_dict["signalScore"] = signal["signalScore"]
    setup_dict["signalGrade"] = signal["signalGrade"]
    setup_dict["entry"] = signal.get("entry")
    setup_dict["stop"] = signal.get("stop")
    setup_dict["targets"] = signal.get("targets")
    setup_dict["activeRiskModel"] = signal.get("activeRiskModel")
    setup_dict["rrToTp1"] = signal["rrToTp1"]
    setup_dict["rrToTp2"] = signal["rrToTp2"]
    setup_dict["entryDistancePct"] = signal["entryDistancePct"]
    setup_dict["primaryTrigger"] = signal["primaryTrigger"]
    setup_dict["triggers"] = signal["triggers"]
    setup_dict["premiumSignal"] = signal["premiumSignal"]
    setup_dict["telegramEligible"] = signal["telegramEligible"]
    setup_dict["signal"] = signal
    setup_dict["calibrationAdjustment"] = signal.get("calibrationAdjustment")
    setup_dict["qualityGuardVersion"] = S512_QUALITY_GUARD_VERSION

    candle_freshness = candle_snapshot.get("candleFreshness") if isinstance(candle_snapshot, dict) else {}
    is_candle_fresh = bool(candle_freshness.get("isFresh")) if isinstance(candle_freshness, dict) else False

    if not is_candle_fresh:
        setup_dict["qualityStatus"] = "REJECT_STALE_CANDLES"
        setup_dict["telegramEligible"] = False
        setup_dict["premiumSignal"] = False
        setup_dict.setdefault("reasons", []).append("stale_candle_context")
        setup_dict.setdefault("riskNotes", []).append(
            "Candle context is stale. Keep this on watch only; do not promote to ACTIVE or Telegram until fresh premarket/regular candles are available."
        )
        quality_guard = build_s512_signal_quality_guard(setup_dict, signal, candle_snapshot)
        setup_dict["qualityGuard"] = quality_guard
        setup_dict["signal"]["qualityGuard"] = quality_guard
        setup_dict["signal"]["telegramEligible"] = False
        setup_dict["signal"]["premiumSignal"] = False
        setup_dict["signal"]["qualityStatus"] = "REJECT_STALE_CANDLES"
        return setup_dict

    # Keep ACTIVE visible for debug/site, but clearly mark non-premium signals.
    if setup_dict.get("status") == "ACTIVE":
        calibration_adjustment = signal.get("calibrationAdjustment") if isinstance(signal.get("calibrationAdjustment"), dict) else {}
        calibration_action = str(calibration_adjustment.get("action") or "").upper()
        confirmation_reject = get_confirmation_quality_rejection_reason(signal)

        if calibration_action in {"BLOCK", "DISABLE"}:
            setup_dict["qualityStatus"] = "REJECT_CALIBRATION_BLOCK"
            setup_dict["telegramEligible"] = False
            setup_dict["premiumSignal"] = False
        elif confirmation_reject:
            setup_dict["qualityStatus"] = confirmation_reject
            setup_dict["telegramEligible"] = False
            setup_dict["premiumSignal"] = False
        elif not signal["triggers"]:
            setup_dict["qualityStatus"] = "REJECT_NO_ACTIVE_TRIGGER"
            setup_dict["telegramEligible"] = False
            setup_dict["premiumSignal"] = False
        elif signal["rrToTp1"] is None or signal["rrToTp1"] < 2:
            setup_dict["qualityStatus"] = "REJECT_RR_BELOW_2R"
            setup_dict["telegramEligible"] = False
            setup_dict["premiumSignal"] = False
        elif signal["signalGrade"] not in {"A+", "A"}:
            setup_dict["qualityStatus"] = "REJECT_SCORE_TOO_LOW"
            setup_dict["telegramEligible"] = False
            setup_dict["premiumSignal"] = False
        else:
            quality_guard = build_s512_signal_quality_guard(setup_dict, signal, candle_snapshot)
            setup_dict["qualityGuard"] = quality_guard
            setup_dict["signal"]["qualityGuard"] = quality_guard

            if not quality_guard.get("deskPassed"):
                setup_dict["qualityStatus"] = quality_guard.get("rejectStatus") or "REJECT_SIGNAL_QUALITY_GUARD"
                setup_dict["telegramEligible"] = False
                setup_dict["premiumSignal"] = False
                setup_dict.setdefault("reasons", []).append(str(setup_dict["qualityStatus"]).lower())
                setup_dict.setdefault("riskNotes", []).append(
                    "S5.12 guard: kept for calibration/debug, but not actionable enough for Desk ACTIVE."
                )
            else:
                setup_dict["qualityStatus"] = "PASSED"
                # Premium means Desk-active quality passed. Telegram is now stricter.
                setup_dict["premiumSignal"] = True
                setup_dict["telegramEligible"] = bool(quality_guard.get("telegramPassed"))
                if setup_dict["telegramEligible"]:
                    setup_dict.setdefault("reasons", []).append("s512_telegram_elite_guard_passed")
                else:
                    setup_dict.setdefault("reasons", []).append("s512_desk_active_but_telegram_wait")
                    setup_dict.setdefault("riskNotes", []).append(
                        "S5.12 guard: valid Desk ACTIVE idea, but Telegram/Elite alert is blocked until stronger confirmation/score/RR."
                    )
    else:
        quality_guard = build_s512_signal_quality_guard(setup_dict, signal, candle_snapshot)
        setup_dict["qualityGuard"] = quality_guard
        setup_dict["signal"]["qualityGuard"] = quality_guard
        setup_dict["qualityStatus"] = "WAITING_CONFIRMATION"
        setup_dict["telegramEligible"] = False
        setup_dict["premiumSignal"] = False

    if "qualityGuard" not in setup_dict:
        quality_guard = build_s512_signal_quality_guard(setup_dict, signal, candle_snapshot)
        setup_dict["qualityGuard"] = quality_guard
        setup_dict["signal"]["qualityGuard"] = quality_guard

    setup_dict["signal"]["telegramEligible"] = setup_dict["telegramEligible"]
    setup_dict["signal"]["premiumSignal"] = setup_dict["premiumSignal"]
    setup_dict["signal"]["qualityStatus"] = setup_dict["qualityStatus"]

    if setup_dict.get("status") == "ACTIVE" and setup_dict.get("activeRiskModel"):
        setup_dict.setdefault("reasons", []).append("active_structural_risk_model_applied")
        setup_dict.setdefault("riskNotes", []).append(
            "ACTIVE risk uses 5m trigger structure first; if structural stop cannot produce true 2R, the signal is rejected."
        )

    return setup_dict


def detect_premarket_pump_short(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)

    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_high = to_float(raw.get("dayHigh"))
    open_price = to_float(raw.get("open"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = int(snapshot.get("fiveMinuteCount") or 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(candle_freshness.get("isFresh"))

    # Never overwrite today's quote/mover price with stale historical candles.
    if is_candle_fresh and latest_price and latest_price > 0:
        price = latest_price

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if change_percent < 15:
        return None
    if universe not in {"nano", "micro", "small"}:
        return None

    reasons = [
        "setup_context_premarket_pump_short",
        "change_percent_15_plus",
        "volume_500k_plus",
        f"universe_{universe}",
    ]

    confidence = 58

    if change_percent >= 30:
        confidence += 10
        reasons.append("extended_move_30pct_plus")
    if change_percent >= 50:
        confidence += 8
        reasons.append("parabolic_move_50pct_plus")
    if volume >= 5_000_000:
        confidence += 8
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 6
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")

    range_position = None
    if day_high and open_price and day_high > open_price:
        range_position = (price - open_price) / (day_high - open_price)
        if range_position >= 0.65:
            confidence += 5
            reasons.append("trading_near_upper_intraday_range")

    if previous_close and previous_close > 0:
        extension_from_prev_close = ((price - previous_close) / previous_close) * 100
        if extension_from_prev_close >= 25:
            confidence += 5
            reasons.append("extended_from_previous_close")

    candle_context: dict[str, Any] = {
        "hasSnapshot": bool(snapshot),
        "latestPrice": latest_price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "openingRange": snapshot.get("openingRange"),
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": snapshot.get("confirmation"),
    }

    if five_minute_count >= 20:
        confidence += 3
        reasons.append("enough_5m_candle_context")

    if vwap and price > vwap:
        distance_from_vwap_pct = ((price - vwap) / vwap) * 100
        candle_context["distanceFromVwapPct"] = distance_from_vwap_pct

        if distance_from_vwap_pct >= 3:
            confidence += 4
            reasons.append("price_extended_above_vwap")
        elif distance_from_vwap_pct <= 0.5:
            reasons.append("price_near_vwap_wait_for_rejection")

    if ema20_5m and price > ema20_5m:
        distance_from_ema_pct = ((price - ema20_5m) / ema20_5m) * 100
        candle_context["distanceFromEma20Pct"] = distance_from_ema_pct

        if distance_from_ema_pct >= 3:
            confidence += 3
            reasons.append("price_extended_above_ema20_5m")

    if rsi14_5m and rsi14_5m >= 70:
        confidence += 4
        reasons.append("rsi_5m_overheated")

    if hod and price < hod:
        pullback_from_hod_pct = ((hod - price) / hod) * 100
        candle_context["pullbackFromHodPct"] = pullback_from_hod_pct

        if pullback_from_hod_pct >= 3:
            confidence += 3
            reasons.append("already_pulling_back_from_hod")

    if volume_acceleration and volume_acceleration < 0.75:
        confidence += 3
        reasons.append("volume_acceleration_fading")

    confidence = max(0, min(95, confidence))

    if confidence < 72:
        return None

    entry_zone, stop, targets = calculate_short_levels(price, day_high or hod)

    risk_notes = [
        "Short setup is ARMED only. Wait for 5m confirmation before ACTIVE signal.",
        "Best confirmation: lower high, VWAP rejection, EMA20 loss, or failed reclaim near HOD.",
        "Avoid chasing if price is still holding above VWAP and making clean higher highs.",
        "Invalidation is above the 5m trigger structure after ACTIVE; before confirmation, day high/HOD remains the wider invalidation.",
    ]

    return SetupCandidate(
        symbol=symbol,
        setup_slug="premarket_pump_short",
        setup_name="Premarket Pump Short",
        direction="short",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price reclaims the 5m trigger structure after ACTIVE; before confirmation, invalidation remains above day high/HOD.",
        reasons=reasons,
        risk_notes=risk_notes,
        source={
            "engineVersion": "holly_persistent_v2",
            "watchCandidate": candidate,
            "rangePosition": range_position,
            "candleContext": candle_context,
        },
    )



def detect_gap_and_crap_short(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.1 live setup: gap-and-crap short.

    Context: an in-play stock gaps/pumps, fails to hold the opening drive, and
    starts losing execution structure. This is still ARMED until a fresh 5m
    confirmation appears. ACTIVE promotion continues to use the same strict
    quality gate: fresh candles, trigger, true RR >= 2R, A/A+.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)

    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_high = to_float(raw.get("dayHigh"))
    open_price = to_float(raw.get("open"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = int(snapshot.get("fiveMinuteCount") or 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if change_percent < 8:
        return None
    if universe not in {"nano", "micro", "small", "mid", "large", "mega"}:
        return None

    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = int(opening_range.get("bars") or 0)

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))

    previous_close_extension_pct = None
    if previous_close and previous_close > 0:
        previous_close_extension_pct = ((price - previous_close) / previous_close) * 100

    day_high_extension_pct = None
    if previous_close and previous_close > 0 and day_high:
        day_high_extension_pct = ((day_high - previous_close) / previous_close) * 100

    pullback_from_hod_pct = None
    if hod and hod > 0:
        pullback_from_hod_pct = ((hod - price) / hod) * 100
    elif day_high and day_high > 0:
        pullback_from_hod_pct = ((day_high - price) / day_high) * 100

    below_opening_range_low = opening_low is not None and price < opening_low
    failed_opening_drive = opening_high is not None and price < opening_high * 0.985
    below_vwap = vwap is not None and price < vwap
    below_ema20 = ema20_5m is not None and price < ema20_5m
    weak_last_5m = bool(
        last_open is not None
        and last_close is not None
        and last_high is not None
        and last_low is not None
        and last_close < last_open
        and (last_high - last_low) > 0
        and ((last_close - last_low) / (last_high - last_low)) <= 0.45
    )

    # Do not arm gap-and-crap just because a ticker is a mover. It must actually
    # show some failure after the early push.
    has_failure_structure = any(
        [
            below_opening_range_low,
            failed_opening_drive and (below_vwap or below_ema20),
            (pullback_from_hod_pct or 0) >= 4.0,
            weak_last_5m and (below_vwap or below_ema20),
        ]
    )

    if not has_failure_structure:
        return None

    confidence = 58
    reasons = [
        "setup_context_gap_and_crap_short",
        "gap_or_major_move_8pct_plus",
        "volume_500k_plus",
        f"universe_{universe}",
    ]

    if change_percent >= 15:
        confidence += 6
        reasons.append("gap_move_15pct_plus")
    if previous_close_extension_pct is not None and previous_close_extension_pct >= 12:
        confidence += 5
        reasons.append("extended_from_previous_close_12pct_plus")
    if day_high_extension_pct is not None and day_high_extension_pct >= 20:
        confidence += 5
        reasons.append("opening_drive_extended_20pct_plus")
    if volume >= 5_000_000:
        confidence += 6
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 5
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")
    if five_minute_count >= 6:
        confidence += 4
        reasons.append("enough_5m_context_after_open")
    if opening_bars >= 3:
        confidence += 3
        reasons.append("opening_range_available")
    if below_opening_range_low:
        confidence += 8
        reasons.append("lost_opening_range_low")
    elif failed_opening_drive:
        confidence += 5
        reasons.append("failed_to_hold_opening_drive")
    if below_vwap:
        confidence += 5
        reasons.append("price_below_vwap")
    if below_ema20:
        confidence += 4
        reasons.append("price_below_ema20_5m")
    if weak_last_5m:
        confidence += 4
        reasons.append("weak_5m_close_after_gap")
    if pullback_from_hod_pct is not None and pullback_from_hod_pct >= 4:
        confidence += 5
        reasons.append("pulling_back_from_hod_4pct_plus")
    if volume_acceleration is not None and volume_acceleration < 0.85:
        confidence += 3
        reasons.append("volume_acceleration_fading")

    confidence = max(0, min(95, confidence))

    if confidence < 72:
        return None

    # Armed risk is intentionally conservative. Once ACTIVE, the quality gate
    # rebuilds stop/targets from the actual 5m trigger structure.
    structural_stop_basis = None
    if opening_high and opening_high > price:
        structural_stop_basis = opening_high
    elif last_high and last_high > price:
        structural_stop_basis = last_high
    elif hod and hod > price:
        structural_stop_basis = hod
    else:
        structural_stop_basis = day_high or hod

    entry_zone, stop, targets = calculate_short_levels(price, structural_stop_basis)

    candle_context: dict[str, Any] = {
        "hasSnapshot": bool(snapshot),
        "latestPrice": latest_price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "belowOpeningRangeLow": below_opening_range_low,
        "failedOpeningDrive": failed_opening_drive,
        "belowVwap": below_vwap,
        "belowEma20": below_ema20,
        "weakLast5m": weak_last_5m,
        "pullbackFromHodPct": pullback_from_hod_pct,
        "previousCloseExtensionPct": previous_close_extension_pct,
        "dayHighExtensionPct": day_high_extension_pct,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": snapshot.get("confirmation"),
    }

    risk_notes = [
        "Gap and Crap Short is ARMED only until fresh 5m confirmation appears.",
        "Best confirmation: failed opening drive, lower high, VWAP/EMA20 rejection, or opening range loss.",
        "Do not chase if price is reclaiming VWAP/EMA20 with clean higher lows.",
        "ACTIVE risk must use the 5m trigger structure and true 2R target math.",
    ]

    return SetupCandidate(
        symbol=symbol,
        setup_slug="gap_and_crap_short",
        setup_name="Gap and Crap Short",
        direction="short",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price reclaims VWAP/EMA20 and the 5m trigger structure after ACTIVE.",
        reasons=reasons,
        risk_notes=risk_notes,
        source={
            "engineVersion": "holly_persistent_v2_s5_1",
            "watchCandidate": candidate,
            "gapAndCrapContext": candle_context,
            "candleContext": candle_context,
        },
    )


def detect_vwap_rejection_short(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.2 live setup: VWAP Rejection Short.

    Context: an in-play stock rallies into VWAP or loses VWAP after a push,
    then shows bearish 5m rejection. This is a separate Holly-like playbook
    from pump shorts: VWAP is the execution anchor and invalidation line.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)

    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_high = to_float(raw.get("dayHigh"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = int(snapshot.get("fiveMinuteCount") or 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if universe not in {"nano", "micro", "small", "mid", "large", "mega"}:
        return None

    # Preliminary pass: allow the engine to fetch candles for liquid in-play
    # names even before VWAP context is known.
    if not snapshot:
        move_ok = abs(change_percent) >= 4 or ranking_score >= 70 or volume >= 5_000_000
        if not move_ok:
            return None
        entry_zone, stop, targets = calculate_short_levels(price, day_high)
        return SetupCandidate(
            symbol=symbol,
            setup_slug="vwap_rejection_short",
            setup_name="VWAP Rejection Short",
            direction="short",
            status="ARMED",
            confidence=max(60, min(82, ranking_score or 60)),
            entry_zone=entry_zone,
            stop=stop,
            targets=targets,
            invalidation="Invalid if price reclaims and holds above VWAP/EMA20 after the rejection attempt.",
            reasons=[
                "setup_context_vwap_rejection_short",
                "preliminary_in_play_for_vwap_check",
                "volume_500k_plus",
                f"universe_{universe}",
            ],
            risk_notes=[
                "VWAP Rejection Short is ARMED until candles confirm a VWAP rejection/loss.",
                "Best confirmation: VWAP rejection candle plus EMA20 loss/lower high.",
                "Do not chase if price cleanly reclaims and holds above VWAP.",
            ],
            source={
                "engineVersion": "holly_persistent_v2_s5_2",
                "watchCandidate": candidate,
                "vwapRejectionContext": {"hasSnapshot": False},
                "candleContext": {"hasSnapshot": False},
            },
        )

    if vwap is None or vwap <= 0:
        return None
    if five_minute_count < 6:
        return None

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))

    confirmation = snapshot.get("confirmation") if isinstance(snapshot.get("confirmation"), dict) else {}
    vwap_confirmation = confirmation.get("vwapRejection5m") if isinstance(confirmation.get("vwapRejection5m"), dict) else {}
    ema_confirmation = confirmation.get("ema20Loss5m") if isinstance(confirmation.get("ema20Loss5m"), dict) else {}
    lower_high_confirmation = confirmation.get("lowerHigh5m") if isinstance(confirmation.get("lowerHigh5m"), dict) else {}

    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap else None
    pullback_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None
    previous_close_extension_pct = ((price - previous_close) / previous_close) * 100 if previous_close and previous_close > 0 else None

    touched_vwap = bool(last_high is not None and last_low is not None and last_low <= vwap <= last_high)
    closed_below_vwap = bool(last_close is not None and last_close < vwap)
    bearish_body = bool(last_open is not None and last_close is not None and last_close < last_open)
    weak_close = bool(
        last_high is not None
        and last_low is not None
        and last_close is not None
        and (last_high - last_low) > 0
        and ((last_close - last_low) / (last_high - last_low)) <= 0.55
    )
    near_vwap = distance_from_vwap_pct is not None and abs(distance_from_vwap_pct) <= 2.25
    extended_above_vwap = distance_from_vwap_pct is not None and distance_from_vwap_pct >= 2.0
    active_vwap_rejection = bool(vwap_confirmation.get("detected"))

    # Do not create a VWAP rejection playbook for names far away from VWAP with
    # no interaction. They can be handled by pump/fade or later continuation algos.
    has_vwap_context = any([
        active_vwap_rejection,
        touched_vwap and (closed_below_vwap or bearish_body or weak_close),
        near_vwap,
        extended_above_vwap and (pullback_from_hod_pct or 0) >= 2.0,
    ])
    if not has_vwap_context:
        return None

    confidence = 60
    reasons = [
        "setup_context_vwap_rejection_short",
        "volume_500k_plus",
        f"universe_{universe}",
    ]

    if abs(change_percent) >= 8:
        confidence += 4
        reasons.append("in_play_move_8pct_plus")
    if volume >= 5_000_000:
        confidence += 5
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")
    if active_vwap_rejection:
        confidence += 10
        reasons.append("active_vwap_rejection_5m")
    elif touched_vwap:
        confidence += 5
        reasons.append("vwap_touched_this_5m")
    if closed_below_vwap:
        confidence += 5
        reasons.append("closed_below_vwap")
    if bearish_body:
        confidence += 3
        reasons.append("bearish_5m_body")
    if weak_close:
        confidence += 3
        reasons.append("weak_5m_close")
    if ema_confirmation.get("detected"):
        confidence += 4
        reasons.append("ema20_loss_supports_rejection")
    if lower_high_confirmation.get("detected"):
        confidence += 4
        reasons.append("lower_high_supports_rejection")
    if pullback_from_hod_pct is not None and pullback_from_hod_pct >= 3:
        confidence += 3
        reasons.append("pulling_back_from_hod_3pct_plus")
    if previous_close_extension_pct is not None and previous_close_extension_pct >= 10:
        confidence += 3
        reasons.append("extended_from_previous_close_10pct_plus")
    if volume_acceleration is not None and volume_acceleration < 0.85:
        confidence += 2
        reasons.append("volume_acceleration_fading")

    # If it is only near VWAP with no actual rejection yet, keep it ARMED but not
    # highly ranked. A live ACTIVE needs the shared confirmation gate.
    if near_vwap and not active_vwap_rejection and not (touched_vwap and (bearish_body or weak_close or closed_below_vwap)):
        confidence = min(confidence, 82)
        reasons.append("near_vwap_waiting_for_rejection")

    confidence = max(0, min(95, confidence))
    if confidence < 72:
        return None

    structural_stop_basis = None
    if last_high and last_high > price:
        structural_stop_basis = max(last_high, vwap)
    elif vwap and vwap > price:
        structural_stop_basis = vwap
    elif ema20_5m and ema20_5m > price:
        structural_stop_basis = ema20_5m
    elif hod and hod > price:
        structural_stop_basis = hod
    else:
        structural_stop_basis = day_high or hod

    entry_zone, stop, targets = calculate_short_levels(price, structural_stop_basis)

    candle_context: dict[str, Any] = {
        "hasSnapshot": bool(snapshot),
        "latestPrice": latest_price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "pullbackFromHodPct": pullback_from_hod_pct,
        "previousCloseExtensionPct": previous_close_extension_pct,
        "touchedVwap": touched_vwap,
        "closedBelowVwap": closed_below_vwap,
        "bearishBody": bearish_body,
        "weakClose": weak_close,
        "nearVwap": near_vwap,
        "activeVwapRejection": active_vwap_rejection,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": confirmation,
    }

    risk_notes = [
        "VWAP Rejection Short is ARMED until fresh 5m rejection confirmation appears.",
        "Best confirmation: VWAP touch/rejection, close back below VWAP, EMA20 loss, or lower high.",
        "Invalidation is reclaim and hold above VWAP/EMA20 after ACTIVE.",
        "ACTIVE risk must use the 5m rejection structure and true 2R target math.",
    ]

    return SetupCandidate(
        symbol=symbol,
        setup_slug="vwap_rejection_short",
        setup_name="VWAP Rejection Short",
        direction="short",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price reclaims and holds above VWAP/EMA20 after the rejection attempt.",
        reasons=reasons,
        risk_notes=risk_notes,
        source={
            "engineVersion": "holly_persistent_v2_s5_2",
            "watchCandidate": candidate,
            "vwapRejectionContext": candle_context,
            "candleContext": candle_context,
        },
    )




def detect_vwap_reclaim_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.3 live setup: VWAP Reclaim Long.

    Context: an in-play stock pulls below/near VWAP, then reclaims VWAP/EMA20
    with bullish 5m confirmation. This is the first live long playbook so the
    desk can detect continuation/reversal opportunities instead of only shorts.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)

    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_low = to_float(raw.get("dayLow"))
    day_high = to_float(raw.get("dayHigh"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = int(snapshot.get("fiveMinuteCount") or 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if universe not in {"nano", "micro", "small", "mid", "large", "mega"}:
        return None

    if not snapshot:
        move_ok = abs(change_percent) >= 4 or ranking_score >= 70 or volume >= 5_000_000
        if not move_ok:
            return None
        entry_zone, stop, targets = calculate_long_levels(price, day_low)
        return SetupCandidate(
            symbol=symbol,
            setup_slug="vwap_reclaim_long",
            setup_name="VWAP Reclaim Long",
            direction="long",
            status="ARMED",
            confidence=max(60, min(82, ranking_score or 60)),
            entry_zone=entry_zone,
            stop=stop,
            targets=targets,
            invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the reclaim structure.",
            reasons=[
                "setup_context_vwap_reclaim_long",
                "preliminary_in_play_for_vwap_reclaim_check",
                "volume_500k_plus",
                f"universe_{universe}",
            ],
            risk_notes=[
                "VWAP Reclaim Long is ARMED until candles confirm a reclaim/hold above VWAP.",
                "Best confirmation: VWAP reclaim candle plus EMA20 reclaim/higher low.",
                "Do not chase if price is already far above VWAP without a pullback/retest.",
            ],
            source={
                "engineVersion": "holly_persistent_v2_s5_3",
                "watchCandidate": candidate,
                "vwapReclaimContext": {"hasSnapshot": False},
                "candleContext": {"hasSnapshot": False},
            },
        )

    if vwap is None or vwap <= 0:
        return None
    if five_minute_count < 6:
        return None

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_low = to_float(prev_5m.get("low"))
    prev_close = to_float(prev_5m.get("close"))

    if not all(value is not None for value in [last_open, last_high, last_low, last_close]):
        return None

    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap else None
    extension_from_previous_close_pct = ((price - previous_close) / previous_close) * 100 if previous_close and previous_close > 0 else None
    distance_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None

    touched_vwap = bool(last_low is not None and last_high is not None and last_low <= vwap <= last_high)
    closed_above_vwap = bool(last_close is not None and last_close > vwap)
    bullish_body = bool(last_open is not None and last_close is not None and last_close > last_open)
    strong_close = bool(
        last_high is not None
        and last_low is not None
        and last_close is not None
        and (last_high - last_low) > 0
        and ((last_close - last_low) / (last_high - last_low)) >= 0.55
    )
    near_vwap = distance_from_vwap_pct is not None and abs(distance_from_vwap_pct) <= 2.25
    reclaimed_ema20 = bool(ema20_5m is not None and last_close is not None and last_close > ema20_5m and last_low is not None and last_low <= ema20_5m * 1.015)
    higher_low = bool(prev_low is not None and last_low is not None and last_low >= prev_low * 0.997 and last_close is not None and prev_close is not None and last_close >= prev_close)

    vwap_reclaim_detected = bool((touched_vwap or near_vwap) and closed_above_vwap and (bullish_body or strong_close))
    ema20_reclaim_detected = bool(reclaimed_ema20 and (bullish_body or strong_close))
    higher_low_detected = bool(higher_low and closed_above_vwap and (bullish_body or strong_close))

    has_reclaim_context = any([
        vwap_reclaim_detected,
        ema20_reclaim_detected,
        near_vwap and price >= vwap,
        distance_from_hod_pct is not None and 2 <= distance_from_hod_pct <= 35 and closed_above_vwap,
    ])
    if not has_reclaim_context:
        return None

    confidence = 60
    reasons = [
        "setup_context_vwap_reclaim_long",
        "volume_500k_plus",
        f"universe_{universe}",
    ]

    if abs(change_percent) >= 8:
        confidence += 4
        reasons.append("in_play_move_8pct_plus")
    if volume >= 5_000_000:
        confidence += 5
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")
    if vwap_reclaim_detected:
        confidence += 10
        reasons.append("active_vwap_reclaim_5m")
    if ema20_reclaim_detected:
        confidence += 4
        reasons.append("ema20_reclaim_supports_long")
    if higher_low_detected:
        confidence += 4
        reasons.append("higher_low_supports_reclaim")
    if bullish_body:
        confidence += 3
        reasons.append("bullish_5m_body")
    if strong_close:
        confidence += 3
        reasons.append("strong_5m_close")
    if extension_from_previous_close_pct is not None and extension_from_previous_close_pct >= 6:
        confidence += 2
        reasons.append("positive_move_from_previous_close")
    if distance_from_hod_pct is not None and 4 <= distance_from_hod_pct <= 25:
        confidence += 2
        reasons.append("room_back_toward_hod")
    if rsi14_5m is not None and 45 <= rsi14_5m <= 72:
        confidence += 2
        reasons.append("rsi_supports_reclaim_not_extreme")

    if near_vwap and not vwap_reclaim_detected:
        confidence = min(confidence, 82)
        reasons.append("near_vwap_waiting_for_reclaim_confirmation")

    confidence = max(0, min(95, confidence))
    if confidence < 72:
        return None

    structural_support = None
    if last_low and last_low < price:
        structural_support = min(last_low, vwap)
    elif vwap and vwap < price:
        structural_support = vwap
    elif ema20_5m and ema20_5m < price:
        structural_support = ema20_5m
    elif lod and lod < price:
        structural_support = lod
    else:
        structural_support = day_low or lod

    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    confirmation = {
        "hasActiveConfirmation": bool(vwap_reclaim_detected or ema20_reclaim_detected or higher_low_detected),
        "triggers": [],
        "vwapReclaim5m": {
            "detected": vwap_reclaim_detected,
            "vwap": vwap,
            "lastOpen": last_open,
            "lastHigh": last_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "closePosition": round((last_close - last_low) / (last_high - last_low), 3) if last_high and last_low and last_high > last_low and last_close is not None else None,
            "bullishBody": bullish_body,
            "reason": "vwap_reclaim_5m" if vwap_reclaim_detected else "vwap_not_reclaimed_yet",
        },
        "ema20Reclaim5m": {
            "detected": ema20_reclaim_detected,
            "ema20_5m": ema20_5m,
            "lastOpen": last_open,
            "lastHigh": last_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "bullishBody": bullish_body,
            "reason": "ema20_reclaim_5m" if ema20_reclaim_detected else "ema20_not_reclaimed_yet",
        },
        "higherLow5m": {
            "detected": higher_low_detected,
            "previousLow": prev_low,
            "lastLow": last_low,
            "lastClose": last_close,
            "previousClose": prev_close,
            "reason": "higher_low_5m" if higher_low_detected else "no_higher_low_reclaim_yet",
        },
    }

    if vwap_reclaim_detected:
        confirmation["triggers"].append("vwap_reclaim_5m")
    if ema20_reclaim_detected:
        confirmation["triggers"].append("ema20_reclaim_5m")
    if higher_low_detected:
        confirmation["triggers"].append("higher_low_5m")

    candle_context: dict[str, Any] = {
        "hasSnapshot": bool(snapshot),
        "latestPrice": latest_price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "distanceFromHodPct": distance_from_hod_pct,
        "previousCloseExtensionPct": extension_from_previous_close_pct,
        "touchedVwap": touched_vwap,
        "closedAboveVwap": closed_above_vwap,
        "bullishBody": bullish_body,
        "strongClose": strong_close,
        "nearVwap": near_vwap,
        "activeVwapReclaim": vwap_reclaim_detected,
        "ema20Reclaim": ema20_reclaim_detected,
        "higherLow": higher_low_detected,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": confirmation,
    }

    risk_notes = [
        "VWAP Reclaim Long is ARMED until fresh 5m reclaim confirmation appears.",
        "Best confirmation: reclaim and hold above VWAP/EMA20, then higher-low retest.",
        "Invalidation is loss of VWAP/EMA20 and the 5m reclaim structure after ACTIVE.",
        "ACTIVE risk must use the 5m reclaim structure and true 2R target math.",
    ]

    return SetupCandidate(
        symbol=symbol,
        setup_slug="vwap_reclaim_long",
        setup_name="VWAP Reclaim Long",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the reclaim structure.",
        reasons=reasons,
        risk_notes=risk_notes,
        source={
            "engineVersion": "holly_persistent_v2_s5_3",
            "watchCandidate": candidate,
            "vwapReclaimContext": candle_context,
            "candleContext": candle_context,
        },
    )



def detect_opening_range_breakdown_short(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.4: Opening Range Breakdown Short.

    This is a separate live opening-range playbook, not just another pump short.
    It looks for in-play names that fail under the first regular-session range
    and can be managed with a structural 5m stop above the breakdown candle / OR low.
    """

    symbol = str(candidate.get("symbol") or "").upper()
    if not symbol:
        return None

    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = safe_int(candidate.get("inPlayScore"), 0)

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if abs(change_percent) < 4 and volume < 2_000_000:
        return None

    snapshot = candle_snapshot if isinstance(candle_snapshot, dict) else {}
    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = safe_int(opening_range.get("bars"), 0)
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)

    if not snapshot:
        return SetupCandidate(
            symbol=symbol,
            setup_slug="opening_range_breakdown_short",
            setup_name="Opening Range Breakdown Short",
            direction="short",
            status="ARMED",
            confidence=max(72, min(84, ranking_score)),
            entry_zone={"min": round(price * 0.985, 4), "max": round(price * 1.015, 4)},
            stop=round(price * 1.035, 4),
            targets=build_short_targets_from_stop(price, round(price * 1.035, 4)),
            invalidation="Invalid if price reclaims the opening range low/VWAP after breakdown.",
            reasons=["setup_context_opening_range_breakdown_short", "awaiting_5m_opening_range_context"],
            risk_notes=["Waiting for opening range and fresh 5m breakdown confirmation."],
            source={"engineVersion": "holly_persistent_v2_s5_4", "watchCandidate": candidate, "candleContext": {"hasSnapshot": False}},
        )

    if opening_high is None or opening_low is None or opening_high <= opening_low or opening_bars < 2 or five_minute_count < 4:
        return None

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_close = to_float(prev_5m.get("close"))

    if not all(value is not None for value in [last_open, last_high, last_low, last_close]):
        return None

    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(candle_freshness.get("isFresh"))

    range_size = opening_high - opening_low
    close_position = ((last_close - last_low) / (last_high - last_low)) if last_high and last_low and last_high > last_low and last_close is not None else None
    bearish_body = bool(last_close < last_open)
    weak_close = bool(close_position is not None and close_position <= 0.45)
    broke_opening_low = bool(last_close < opening_low and last_low < opening_low)
    rejected_opening_low = bool(last_high >= opening_low and last_close < opening_low)
    below_vwap = bool(vwap is not None and last_close < vwap)
    below_ema20 = bool(ema20_5m is not None and last_close < ema20_5m)
    opening_drive_failure = bool(prev_close is not None and prev_close >= opening_low and broke_opening_low)
    not_too_extended_from_or = bool(range_size > 0 and abs(last_close - opening_low) / range_size <= 2.25)

    has_context = broke_opening_low or rejected_opening_low or (price < opening_low and (below_vwap or below_ema20))
    if not has_context:
        return None

    confidence = 62
    reasons = [
        "setup_context_opening_range_breakdown_short",
        "volume_500k_plus",
        f"universe_{universe}",
        "opening_range_available",
    ]
    if abs(change_percent) >= 8:
        confidence += 4
        reasons.append("in_play_move_8pct_plus")
    if volume >= 5_000_000:
        confidence += 5
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")
    if broke_opening_low:
        confidence += 12
        reasons.append("opening_range_low_lost")
    if rejected_opening_low:
        confidence += 5
        reasons.append("opening_range_low_rejection")
    if opening_drive_failure:
        confidence += 4
        reasons.append("opening_drive_failure")
    if below_vwap:
        confidence += 4
        reasons.append("below_vwap")
    if below_ema20:
        confidence += 3
        reasons.append("below_ema20")
    if bearish_body:
        confidence += 3
        reasons.append("bearish_5m_body")
    if weak_close:
        confidence += 3
        reasons.append("weak_5m_close")
    if not not_too_extended_from_or:
        confidence -= 4
        reasons.append("breakdown_far_from_opening_range_low")
    if rsi14_5m is not None and rsi14_5m < 30:
        confidence -= 3
        reasons.append("rsi_already_stretched_down")

    confidence = max(0, min(95, confidence))
    if confidence < 72:
        return None

    structural_stop = max(value for value in [opening_low, last_high, vwap if vwap and below_vwap else None] if value is not None)
    entry_zone, stop, targets = calculate_short_levels(price, structural_stop)

    opening_breakdown_detected = bool(broke_opening_low and (bearish_body or weak_close))
    confirmation = {
        "hasActiveConfirmation": opening_breakdown_detected,
        "triggers": [],
        "openingRangeBreakdown5m": {
            "detected": opening_breakdown_detected,
            "openingHigh": opening_high,
            "openingLow": opening_low,
            "lastOpen": last_open,
            "lastHigh": last_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "closePosition": round(close_position, 3) if close_position is not None else None,
            "bearishBody": bearish_body,
            "reason": "opening_range_breakdown_5m" if opening_breakdown_detected else "waiting_for_clean_opening_range_breakdown",
        },
        "openingDriveFailure5m": {
            "detected": opening_drive_failure,
            "openingLow": opening_low,
            "previousClose": prev_close,
            "lastClose": last_close,
            "reason": "opening_drive_failure_5m" if opening_drive_failure else "no_opening_drive_failure_yet",
        },
    }
    if opening_breakdown_detected:
        confirmation["triggers"].append("opening_range_breakdown_5m")
    if opening_drive_failure:
        confirmation["triggers"].append("opening_drive_failure_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "belowOpeningRangeLow": broke_opening_low,
        "openingDriveFailure": opening_drive_failure,
        "belowVwap": below_vwap,
        "belowEma20": below_ema20,
        "weakLast5m": weak_close,
        "bearishBody": bearish_body,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="opening_range_breakdown_short",
        setup_name="Opening Range Breakdown Short",
        direction="short",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price reclaims the opening range low/VWAP after breakdown.",
        reasons=reasons,
        risk_notes=[
            "Opening Range Breakdown Short is ARMED until fresh 5m breakdown confirmation appears.",
            "Best confirmation: close below opening range low with bearish pressure and VWAP/EMA weakness.",
            "Avoid chasing if breakdown is already far below the opening range without a retest.",
            "ACTIVE risk must use the 5m breakdown structure and true 2R target math.",
        ],
        source={
            "engineVersion": "holly_persistent_v2_s5_4",
            "watchCandidate": candidate,
            "openingRangeBreakdownContext": candle_context,
            "candleContext": candle_context,
        },
    )


def detect_opening_range_breakout_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.4: Opening Range Breakout Long.

    This detects early trend-day style continuation when an in-play ticker clears
    the first regular-session range and holds above it with bullish pressure.
    """

    symbol = str(candidate.get("symbol") or "").upper()
    if not symbol:
        return None

    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = safe_int(candidate.get("inPlayScore"), 0)

    if price is None or price <= 0:
        return None
    if volume < 500_000:
        return None
    if abs(change_percent) < 4 and volume < 2_000_000:
        return None

    snapshot = candle_snapshot if isinstance(candle_snapshot, dict) else {}
    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = safe_int(opening_range.get("bars"), 0)
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)

    if not snapshot:
        return SetupCandidate(
            symbol=symbol,
            setup_slug="opening_range_breakout_long",
            setup_name="Opening Range Breakout Long",
            direction="long",
            status="ARMED",
            confidence=max(72, min(84, ranking_score)),
            entry_zone={"min": round(price * 0.985, 4), "max": round(price * 1.015, 4)},
            stop=round(price * 0.965, 4),
            targets=build_long_targets_from_stop(price, round(price * 0.965, 4)),
            invalidation="Invalid if price loses the opening range high/VWAP after breakout.",
            reasons=["setup_context_opening_range_breakout_long", "awaiting_5m_opening_range_context"],
            risk_notes=["Waiting for opening range and fresh 5m breakout confirmation."],
            source={"engineVersion": "holly_persistent_v2_s5_4", "watchCandidate": candidate, "candleContext": {"hasSnapshot": False}},
        )

    if opening_high is None or opening_low is None or opening_high <= opening_low or opening_bars < 2 or five_minute_count < 4:
        return None

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_close = to_float(prev_5m.get("close"))

    if not all(value is not None for value in [last_open, last_high, last_low, last_close]):
        return None

    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    rsi14_5m = to_float(snapshot.get("rsi14_5m"))
    hod = to_float(snapshot.get("hod"))
    lod = to_float(snapshot.get("lod"))
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(candle_freshness.get("isFresh"))

    range_size = opening_high - opening_low
    close_position = ((last_close - last_low) / (last_high - last_low)) if last_high and last_low and last_high > last_low and last_close is not None else None
    bullish_body = bool(last_close > last_open)
    strong_close = bool(close_position is not None and close_position >= 0.55)
    broke_opening_high = bool(last_close > opening_high and last_high > opening_high)
    held_opening_high = bool(last_low <= opening_high <= last_high and last_close > opening_high)
    above_vwap = bool(vwap is not None and last_close > vwap)
    above_ema20 = bool(ema20_5m is not None and last_close > ema20_5m)
    opening_drive_continuation = bool(prev_close is not None and prev_close <= opening_high and broke_opening_high)
    not_too_extended_from_or = bool(range_size > 0 and abs(last_close - opening_high) / range_size <= 2.25)

    has_context = broke_opening_high or held_opening_high or (price > opening_high and (above_vwap or above_ema20))
    if not has_context:
        return None

    confidence = 62
    reasons = [
        "setup_context_opening_range_breakout_long",
        "volume_500k_plus",
        f"universe_{universe}",
        "opening_range_available",
    ]
    if abs(change_percent) >= 8:
        confidence += 4
        reasons.append("in_play_move_8pct_plus")
    if volume >= 5_000_000:
        confidence += 5
        reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4
        reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5
        reasons.append("high_quality_watch_candidate")
    if broke_opening_high:
        confidence += 12
        reasons.append("opening_range_high_broken")
    if held_opening_high:
        confidence += 5
        reasons.append("opening_range_high_retest_hold")
    if opening_drive_continuation:
        confidence += 4
        reasons.append("opening_drive_continuation")
    if above_vwap:
        confidence += 4
        reasons.append("above_vwap")
    if above_ema20:
        confidence += 3
        reasons.append("above_ema20")
    if bullish_body:
        confidence += 3
        reasons.append("bullish_5m_body")
    if strong_close:
        confidence += 3
        reasons.append("strong_5m_close")
    if not not_too_extended_from_or:
        confidence -= 4
        reasons.append("breakout_far_from_opening_range_high")
    if rsi14_5m is not None and rsi14_5m > 78:
        confidence -= 3
        reasons.append("rsi_already_stretched_up")

    confidence = max(0, min(95, confidence))
    if confidence < 72:
        return None

    structural_support = min(value for value in [opening_high, last_low, vwap if vwap and above_vwap else None] if value is not None)
    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    opening_breakout_detected = bool(broke_opening_high and (bullish_body or strong_close))
    confirmation = {
        "hasActiveConfirmation": opening_breakout_detected,
        "triggers": [],
        "openingRangeBreakout5m": {
            "detected": opening_breakout_detected,
            "openingHigh": opening_high,
            "openingLow": opening_low,
            "lastOpen": last_open,
            "lastHigh": last_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "closePosition": round(close_position, 3) if close_position is not None else None,
            "bullishBody": bullish_body,
            "reason": "opening_range_breakout_5m" if opening_breakout_detected else "waiting_for_clean_opening_range_breakout",
        },
        "openingDriveContinuation5m": {
            "detected": opening_drive_continuation,
            "openingHigh": opening_high,
            "previousClose": prev_close,
            "lastClose": last_close,
            "reason": "opening_drive_continuation_5m" if opening_drive_continuation else "no_opening_drive_continuation_yet",
        },
    }
    if opening_breakout_detected:
        confirmation["triggers"].append("opening_range_breakout_5m")
    if opening_drive_continuation:
        confirmation["triggers"].append("opening_drive_continuation_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "rsi14_5m": rsi14_5m,
        "hod": hod,
        "lod": lod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "aboveOpeningRangeHigh": broke_opening_high,
        "openingDriveContinuation": opening_drive_continuation,
        "aboveVwap": above_vwap,
        "aboveEma20": above_ema20,
        "strongClose": strong_close,
        "bullishBody": bullish_body,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": snapshot.get("recentFiveMinuteCandles"),
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="opening_range_breakout_long",
        setup_name="Opening Range Breakout Long",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses the opening range high/VWAP after breakout.",
        reasons=reasons,
        risk_notes=[
            "Opening Range Breakout Long is ARMED until fresh 5m breakout confirmation appears.",
            "Best confirmation: close above opening range high with bullish pressure and VWAP/EMA support.",
            "Avoid chasing if breakout is already far above the opening range without a retest.",
            "ACTIVE risk must use the 5m breakout structure and true 2R target math.",
        ],
        source={
            "engineVersion": "holly_persistent_v2_s5_4",
            "watchCandidate": candidate,
            "openingRangeBreakoutContext": candle_context,
            "candleContext": candle_context,
        },
    )


def detect_gap_hold_continuation_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.5 live setup: Gap Hold Continuation Long.

    Context: the ticker is already in-play after a gap/move, but instead of
    fading it, price holds the gap/opening range and continues above VWAP/EMA20.
    This is a continuation playbook, not a chase signal: ACTIVE needs a fresh
    5m hold/continuation candle and structural stop math.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)
    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_low = to_float(raw.get("dayLow"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    hod = to_float(snapshot.get("hod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)
    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = safe_int(opening_range.get("bars"), 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price

    if price is None or price <= 0 or volume < 500_000:
        return None
    if universe not in {"nano", "micro", "small", "mid", "large", "mega"}:
        return None

    move_ok = change_percent >= 6 or ranking_score >= 72 or volume >= 5_000_000
    if not move_ok:
        return None

    if not snapshot or vwap is None or five_minute_count < 6 or opening_bars < 3:
        entry_zone, stop, targets = calculate_long_levels(price, day_low)
        return SetupCandidate(
            symbol=symbol,
            setup_slug="gap_hold_continuation_long",
            setup_name="Gap Hold Continuation Long",
            direction="long",
            status="ARMED",
            confidence=max(60, min(84, ranking_score or 60)),
            entry_zone=entry_zone,
            stop=stop,
            targets=targets,
            invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the gap/opening range structure.",
            reasons=["setup_context_gap_hold_continuation_long", "preliminary_in_play_gap_hold_check", "volume_500k_plus", f"universe_{universe}"],
            risk_notes=[
                "Gap Hold Continuation is ARMED until a fresh 5m continuation candle appears.",
                "Best confirmation: hold above opening range/VWAP/EMA20, higher low, and bullish continuation candle.",
                "Do not chase if price is already far from VWAP without a pullback/retest.",
            ],
            source={"engineVersion": "holly_persistent_v2_s5_5", "watchCandidate": candidate, "gapHoldContinuationContext": {"hasSnapshot": False}, "candleContext": {"hasSnapshot": False}},
        )

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_low = to_float(prev_5m.get("low"))
    prev_close = to_float(prev_5m.get("close"))

    if not all(v is not None for v in [last_open, last_high, last_low, last_close]):
        return None

    previous_close_extension_pct = ((price - previous_close) / previous_close) * 100 if previous_close and previous_close > 0 else None
    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap and vwap > 0 else None
    distance_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None

    bullish_body = bool(last_close > last_open)
    strong_close = bool((last_high - last_low) > 0 and ((last_close - last_low) / (last_high - last_low)) >= 0.58)
    holds_opening_range = bool(opening_low is not None and last_close >= opening_low * 1.01)
    holds_vwap = bool(vwap is not None and last_close >= vwap and last_low >= vwap * 0.985)
    holds_ema20 = bool(ema20_5m is not None and last_close >= ema20_5m and last_low >= ema20_5m * 0.985)
    higher_low = bool(prev_low is not None and last_low >= prev_low * 0.995 and (prev_close is None or last_close >= prev_close * 0.997))
    near_vwap = distance_from_vwap_pct is not None and 0 <= distance_from_vwap_pct <= 7.5

    gap_hold_context = bool(
        holds_opening_range
        and (previous_close_extension_pct is None or previous_close_extension_pct >= 5 or change_percent >= 6)
        and (holds_vwap or holds_ema20 or near_vwap)
    )
    if not gap_hold_context:
        return None

    continuation_detected = bool(
        holds_opening_range
        and (holds_vwap or holds_ema20)
        and (bullish_body or strong_close)
        and (higher_low or volume_acceleration is None or volume_acceleration >= 0.75)
    )

    confidence = 62
    reasons = ["setup_context_gap_hold_continuation_long", "volume_500k_plus", f"universe_{universe}", "gap_hold_context_present"]
    if change_percent >= 8:
        confidence += 5; reasons.append("positive_gap_or_move_8pct_plus")
    if previous_close_extension_pct is not None and previous_close_extension_pct >= 8:
        confidence += 4; reasons.append("holding_above_previous_close_gap")
    if volume >= 5_000_000:
        confidence += 5; reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4; reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5; reasons.append("high_quality_watch_candidate")
    if holds_opening_range:
        confidence += 5; reasons.append("holding_opening_range")
    if holds_vwap:
        confidence += 5; reasons.append("holding_vwap")
    if holds_ema20:
        confidence += 4; reasons.append("holding_ema20")
    if higher_low:
        confidence += 4; reasons.append("higher_low_supports_continuation")
    if continuation_detected:
        confidence += 8; reasons.append("active_gap_hold_continuation_5m")
    if distance_from_hod_pct is not None and distance_from_hod_pct > 35:
        confidence -= 5; reasons.append("too_far_from_hod_for_clean_continuation")
    if distance_from_vwap_pct is not None and distance_from_vwap_pct > 10:
        confidence -= 6; reasons.append("too_extended_from_vwap_no_chase")

    confidence = max(0, min(100, confidence))
    support_candidates = [v for v in (last_low, opening_low, vwap, ema20_5m, day_low) if v is not None and v < price]
    structural_support = max(support_candidates) if support_candidates else day_low
    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    confirmation = {
        "hasActiveConfirmation": bool(continuation_detected),
        "triggers": [],
        "gapHoldContinuation5m": {
            "detected": continuation_detected,
            "openingLow": opening_low,
            "lastLow": last_low,
            "lastClose": last_close,
            "vwap": vwap,
            "ema20_5m": ema20_5m,
            "higherLow": higher_low,
            "strongClose": strong_close,
            "reason": "gap_hold_continuation_5m" if continuation_detected else "waiting_for_gap_hold_continuation_candle",
        },
    }
    if continuation_detected:
        confirmation["triggers"].append("gap_hold_continuation_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "hod": hod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "holdsOpeningRange": holds_opening_range,
        "holdsVwap": holds_vwap,
        "holdsEma20": holds_ema20,
        "higherLow": higher_low,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "distanceFromHodPct": distance_from_hod_pct,
        "previousCloseExtensionPct": previous_close_extension_pct,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": recent,
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="gap_hold_continuation_long",
        setup_name="Gap Hold Continuation Long",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the gap/opening range structure.",
        reasons=reasons,
        risk_notes=[
            "Gap Hold Continuation is ARMED until fresh 5m continuation confirmation appears.",
            "Best confirmation: hold above opening range/VWAP/EMA20, higher low, and bullish continuation candle.",
            "Do not chase if price is already far above VWAP without a pullback/retest.",
            "ACTIVE risk must use the 5m hold structure and true 2R target math.",
        ],
        source={"engineVersion": "holly_persistent_v2_s5_5", "watchCandidate": candidate, "gapHoldContinuationContext": candle_context, "candleContext": candle_context},
    )


def detect_orb_pullback_continuation_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.5 live setup: ORB / first pullback continuation long."""

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)
    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_low = to_float(raw.get("dayLow"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    hod = to_float(snapshot.get("hod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)
    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = safe_int(opening_range.get("bars"), 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price
    if price is None or price <= 0 or volume < 500_000:
        return None
    if universe not in {"nano", "micro", "small", "mid", "large", "mega"}:
        return None
    if not snapshot or vwap is None or five_minute_count < 6 or opening_bars < 3 or opening_high is None:
        return None

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_low = to_float(prev_5m.get("low"))
    prev_close = to_float(prev_5m.get("close"))
    if not all(v is not None for v in [last_open, last_high, last_low, last_close]):
        return None

    broke_or_high = bool(price > opening_high or last_high > opening_high or last_close > opening_high)
    retested_or_high = bool(last_low <= opening_high * 1.025 and last_close >= opening_high * 0.995)
    above_vwap = bool(last_close >= vwap)
    above_ema20 = bool(ema20_5m is None or last_close >= ema20_5m)
    higher_low = bool(prev_low is not None and last_low >= prev_low * 0.995 and (prev_close is None or last_close >= prev_close * 0.997))
    bullish_body = bool(last_close > last_open)
    strong_close = bool((last_high - last_low) > 0 and ((last_close - last_low) / (last_high - last_low)) >= 0.58)
    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap else None
    distance_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None

    continuation_context = bool(broke_or_high and retested_or_high and above_vwap and above_ema20)
    if not continuation_context:
        return None

    pullback_continuation_detected = bool(continuation_context and higher_low and (bullish_body or strong_close))

    confidence = 61
    reasons = ["setup_context_orb_pullback_continuation", "volume_500k_plus", f"universe_{universe}", "opening_range_breakout_context"]
    if abs(change_percent) >= 6:
        confidence += 4; reasons.append("in_play_move_6pct_plus")
    if volume >= 5_000_000:
        confidence += 5; reasons.append("heavy_volume_5m_plus")
    if volume >= 20_000_000:
        confidence += 4; reasons.append("extreme_volume_20m_plus")
    if ranking_score >= 75:
        confidence += 5; reasons.append("high_quality_watch_candidate")
    if retested_or_high:
        confidence += 5; reasons.append("opening_range_retest_hold")
    if above_vwap:
        confidence += 4; reasons.append("above_vwap")
    if above_ema20:
        confidence += 3; reasons.append("above_ema20")
    if higher_low:
        confidence += 4; reasons.append("higher_low_on_pullback")
    if pullback_continuation_detected:
        confidence += 9; reasons.append("active_first_pullback_continuation_5m")
    if distance_from_vwap_pct is not None and distance_from_vwap_pct > 10:
        confidence -= 6; reasons.append("too_extended_from_vwap_no_chase")
    if distance_from_hod_pct is not None and distance_from_hod_pct > 30:
        confidence -= 4; reasons.append("too_far_from_hod_for_continuation")
    confidence = max(0, min(100, confidence))

    support_candidates = [v for v in (last_low, opening_high, vwap, ema20_5m, day_low) if v is not None and v < price]
    structural_support = max(support_candidates) if support_candidates else day_low
    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    confirmation = {
        "hasActiveConfirmation": bool(pullback_continuation_detected),
        "triggers": [],
        "pullbackContinuation5m": {
            "detected": pullback_continuation_detected,
            "openingHigh": opening_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "vwap": vwap,
            "ema20_5m": ema20_5m,
            "higherLow": higher_low,
            "strongClose": strong_close,
            "reason": "first_pullback_continuation_5m" if pullback_continuation_detected else "waiting_for_first_pullback_continuation_candle",
        },
    }
    if pullback_continuation_detected:
        confirmation["triggers"].append("first_pullback_continuation_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "hod": hod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "brokeOpeningRangeHigh": broke_or_high,
        "retestedOpeningRangeHigh": retested_or_high,
        "aboveVwap": above_vwap,
        "aboveEma20": above_ema20,
        "higherLow": higher_low,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "distanceFromHodPct": distance_from_hod_pct,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": recent,
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="orb_pullback_continuation",
        setup_name="ORB Pullback Continuation",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses the opening range/VWAP reclaim structure after the pullback.",
        reasons=reasons,
        risk_notes=[
            "ORB Pullback Continuation is ARMED until a fresh pullback continuation candle appears.",
            "Best confirmation: opening range retest hold, higher low, VWAP/EMA support, bullish 5m close.",
            "Do not chase if price is already far from VWAP without a pullback.",
            "ACTIVE risk must use the 5m pullback structure and true 2R target math.",
        ],
        source={"engineVersion": "holly_persistent_v2_s5_5", "watchCandidate": candidate, "pullbackContinuationContext": candle_context, "candleContext": candle_context},
    )



def detect_large_cap_gap_continuation_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.6 live setup: Large Cap Gap Continuation Long.

    Institutional-cap playbook for large/mega-cap tickers that gap or trend in
    play, hold VWAP/EMA20, and continue after a controlled pullback. This is not
    a small-cap pump detector; it requires higher liquidity and cleaner support.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)
    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_low = to_float(raw.get("dayLow"))
    previous_close = to_float(raw.get("previousClose"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    hod = to_float(snapshot.get("hod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)
    opening_range = snapshot.get("openingRange") if isinstance(snapshot.get("openingRange"), dict) else {}
    opening_high = to_float(opening_range.get("high"))
    opening_low = to_float(opening_range.get("low"))
    opening_bars = safe_int(opening_range.get("bars"), 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price

    if price is None or price <= 0:
        return None
    if universe not in {"mid", "large", "mega"}:
        return None
    if volume < 1_000_000:
        return None

    move_ok = change_percent >= 1.8 or ranking_score >= 76 or volume >= 10_000_000
    if not move_ok:
        return None

    if not snapshot or vwap is None or five_minute_count < 6 or opening_bars < 3:
        entry_zone, stop, targets = calculate_long_levels(price, day_low)
        return SetupCandidate(
            symbol=symbol,
            setup_slug="large_cap_gap_continuation",
            setup_name="Large Cap Gap Continuation",
            direction="long",
            status="ARMED",
            confidence=max(62, min(84, ranking_score or 62)),
            entry_zone=entry_zone,
            stop=stop,
            targets=targets,
            invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the gap/opening range structure.",
            reasons=["setup_context_large_cap_gap_continuation", "preliminary_institutional_gap_continuation_check", "volume_1m_plus", f"universe_{universe}"],
            risk_notes=[
                "Large Cap Gap Continuation is ARMED until fresh 5m continuation confirmation appears.",
                "Best confirmation: gap hold, VWAP/EMA20 support, higher low and bullish 5m continuation.",
                "Do not chase if price is already extended far above VWAP without a retest.",
            ],
            source={"engineVersion": "holly_persistent_v2_s5_6", "watchCandidate": candidate, "largeCapGapContinuationContext": {"hasSnapshot": False}, "candleContext": {"hasSnapshot": False}},
        )

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_low = to_float(prev_5m.get("low"))
    prev_close = to_float(prev_5m.get("close"))
    if not all(v is not None for v in [last_open, last_high, last_low, last_close]):
        return None

    previous_close_extension_pct = ((price - previous_close) / previous_close) * 100 if previous_close and previous_close > 0 else None
    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap and vwap > 0 else None
    distance_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None
    candle_range = last_high - last_low if last_high is not None and last_low is not None else None
    close_position = ((last_close - last_low) / candle_range) if candle_range and candle_range > 0 else None

    bullish_body = bool(last_close > last_open)
    strong_close = bool(close_position is not None and close_position >= 0.58)
    holds_opening_range = bool(opening_low is not None and last_close >= opening_low * 0.995)
    holds_vwap = bool(vwap is not None and last_close >= vwap and last_low >= vwap * 0.992)
    holds_ema20 = bool(ema20_5m is not None and last_close >= ema20_5m and last_low >= ema20_5m * 0.992)
    higher_low = bool(prev_low is not None and last_low >= prev_low * 0.995 and (prev_close is None or last_close >= prev_close * 0.997))
    controlled_extension = bool(distance_from_vwap_pct is None or distance_from_vwap_pct <= 4.5)

    context_ok = bool(
        (change_percent >= 1.8 or (previous_close_extension_pct is not None and previous_close_extension_pct >= 1.8) or ranking_score >= 76)
        and holds_opening_range
        and (holds_vwap or holds_ema20)
        and controlled_extension
    )
    if not context_ok:
        return None

    continuation_detected = bool(
        holds_opening_range
        and holds_vwap
        and (holds_ema20 or higher_low)
        and (bullish_body or strong_close)
        and (volume_acceleration is None or volume_acceleration >= 0.65)
    )

    confidence = 64
    reasons = ["setup_context_large_cap_gap_continuation", "volume_1m_plus", f"universe_{universe}", "institutional_gap_continuation_context"]
    if change_percent >= 2.5:
        confidence += 5; reasons.append("large_cap_move_2_5pct_plus")
    if volume >= 10_000_000:
        confidence += 5; reasons.append("institutional_volume_10m_plus")
    if ranking_score >= 78:
        confidence += 5; reasons.append("high_quality_large_cap_watch")
    if holds_vwap:
        confidence += 5; reasons.append("holding_vwap")
    if holds_ema20:
        confidence += 4; reasons.append("holding_ema20")
    if higher_low:
        confidence += 4; reasons.append("higher_low_supports_continuation")
    if continuation_detected:
        confidence += 8; reasons.append("active_large_cap_gap_continuation_5m")
    if distance_from_hod_pct is not None and distance_from_hod_pct > 30:
        confidence -= 4; reasons.append("too_far_from_hod_for_momentum_continuation")
    if distance_from_vwap_pct is not None and distance_from_vwap_pct > 5.5:
        confidence -= 6; reasons.append("too_extended_from_vwap_no_chase")
    confidence = max(0, min(100, confidence))

    support_candidates = [v for v in (last_low, opening_low, vwap, ema20_5m, day_low) if v is not None and v < price]
    structural_support = max(support_candidates) if support_candidates else day_low
    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    confirmation = {
        "hasActiveConfirmation": bool(continuation_detected),
        "triggers": [],
        "gapHoldContinuation5m": {
            "detected": continuation_detected,
            "openingLow": opening_low,
            "lastLow": last_low,
            "lastClose": last_close,
            "vwap": vwap,
            "ema20_5m": ema20_5m,
            "higherLow": higher_low,
            "strongClose": strong_close,
            "reason": "large_cap_gap_continuation_5m" if continuation_detected else "waiting_for_large_cap_gap_continuation_candle",
        },
    }
    if continuation_detected:
        confirmation["triggers"].append("gap_hold_continuation_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "hod": hod,
        "openingRange": opening_range,
        "openingHigh": opening_high,
        "openingLow": opening_low,
        "holdsOpeningRange": holds_opening_range,
        "holdsVwap": holds_vwap,
        "holdsEma20": holds_ema20,
        "higherLow": higher_low,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "distanceFromHodPct": distance_from_hod_pct,
        "previousCloseExtensionPct": previous_close_extension_pct,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": recent,
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="large_cap_gap_continuation",
        setup_name="Large Cap Gap Continuation",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses VWAP/EMA20 and fails to hold the gap/opening range structure.",
        reasons=reasons,
        risk_notes=[
            "Large Cap Gap Continuation is ARMED until fresh 5m continuation confirmation appears.",
            "Best confirmation: gap hold, VWAP/EMA20 support, higher low and bullish 5m continuation.",
            "Do not chase if price is already far above VWAP without a pullback/retest.",
            "ACTIVE risk must use the 5m hold structure and true 2R target math.",
        ],
        source={"engineVersion": "holly_persistent_v2_s5_6", "watchCandidate": candidate, "largeCapGapContinuationContext": candle_context, "candleContext": candle_context},
    )


def detect_large_cap_vwap_trend_long(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> SetupCandidate | None:
    """S5.6 live setup: Large Cap VWAP Trend Long.

    Finds liquid mid/large/mega-cap names trending above VWAP/EMA20 where the
    latest 5m candle reclaims/holds VWAP with a higher-low structure. This is a
    cleaner institutional continuation playbook for names like SOFI/INTC/AMZN/NVDA.
    """

    symbol = str(candidate.get("symbol") or "")
    price = to_float(candidate.get("price"))
    change_percent = to_float(candidate.get("changePercent"), 0) or 0
    volume = to_float(candidate.get("volume"), 0) or 0
    universe = str(candidate.get("universe") or "unknown")
    ranking_score = int(candidate.get("inPlayScore") or 0)
    raw = candidate.get("raw") if isinstance(candidate.get("raw"), dict) else {}
    day_low = to_float(raw.get("dayLow"))

    snapshot = candle_snapshot or {}
    latest_price = to_float(snapshot.get("latestPrice"))
    vwap = to_float(snapshot.get("vwap"))
    ema20_5m = to_float(snapshot.get("ema20_5m"))
    atr14_5m = to_float(snapshot.get("atr14_5m"))
    hod = to_float(snapshot.get("hod"))
    volume_acceleration = to_float(snapshot.get("volumeAcceleration"))
    five_minute_count = safe_int(snapshot.get("fiveMinuteCount"), 0)
    candle_freshness = snapshot.get("candleFreshness") if isinstance(snapshot.get("candleFreshness"), dict) else {}
    is_candle_fresh = bool(snapshot.get("isCandleFresh"))

    if latest_price is not None and latest_price > 0:
        price = latest_price
    if price is None or price <= 0:
        return None
    if universe not in {"mid", "large", "mega"}:
        return None
    if volume < 1_000_000:
        return None
    if not (abs(change_percent) >= 1.0 or ranking_score >= 74 or volume >= 15_000_000):
        return None

    if not snapshot or vwap is None or five_minute_count < 6:
        entry_zone, stop, targets = calculate_long_levels(price, day_low)
        return SetupCandidate(
            symbol=symbol,
            setup_slug="large_cap_vwap_trend_long",
            setup_name="Large Cap VWAP Trend Long",
            direction="long",
            status="ARMED",
            confidence=max(62, min(84, ranking_score or 62)),
            entry_zone=entry_zone,
            stop=stop,
            targets=targets,
            invalidation="Invalid if price loses VWAP/EMA20 and fails to maintain higher-low trend structure.",
            reasons=["setup_context_large_cap_vwap_trend_long", "preliminary_vwap_trend_check", "volume_1m_plus", f"universe_{universe}"],
            risk_notes=[
                "Large Cap VWAP Trend Long is ARMED until a fresh VWAP/EMA support confirmation appears.",
                "Best confirmation: VWAP reclaim/hold, EMA20 support, higher low, bullish 5m close.",
                "Avoid if price is choppy around VWAP without clean trend structure.",
            ],
            source={"engineVersion": "holly_persistent_v2_s5_6", "watchCandidate": candidate, "largeCapVwapTrendContext": {"hasSnapshot": False}, "candleContext": {"hasSnapshot": False}},
        )

    recent = snapshot.get("recentFiveMinuteCandles") if isinstance(snapshot.get("recentFiveMinuteCandles"), list) else []
    last_5m = recent[-1] if recent and isinstance(recent[-1], dict) else {}
    prev_5m = recent[-2] if len(recent) >= 2 and isinstance(recent[-2], dict) else {}
    last_open = to_float(last_5m.get("open"))
    last_high = to_float(last_5m.get("high"))
    last_low = to_float(last_5m.get("low"))
    last_close = to_float(last_5m.get("close"))
    prev_low = to_float(prev_5m.get("low"))
    prev_close = to_float(prev_5m.get("close"))
    if not all(v is not None for v in [last_open, last_high, last_low, last_close]):
        return None

    candle_range = last_high - last_low if last_high is not None and last_low is not None else None
    close_position = ((last_close - last_low) / candle_range) if candle_range and candle_range > 0 else None
    distance_from_vwap_pct = ((price - vwap) / vwap) * 100 if vwap and vwap > 0 else None
    distance_from_hod_pct = ((hod - price) / hod) * 100 if hod and hod > 0 else None

    bullish_body = bool(last_close > last_open)
    strong_close = bool(close_position is not None and close_position >= 0.58)
    above_vwap = bool(last_close >= vwap)
    touched_or_reclaimed_vwap = bool(last_low <= vwap * 1.008 and last_close >= vwap)
    above_ema20 = bool(ema20_5m is None or last_close >= ema20_5m)
    ema20_reclaim = bool(ema20_5m is not None and last_low <= ema20_5m * 1.008 and last_close >= ema20_5m)
    higher_low = bool(prev_low is not None and last_low >= prev_low * 0.995 and (prev_close is None or last_close >= prev_close * 0.997))
    not_overextended = bool(distance_from_vwap_pct is None or -0.5 <= distance_from_vwap_pct <= 4.0)

    trend_context = bool(above_vwap and above_ema20 and not_overextended)
    if not trend_context:
        return None

    vwap_reclaim_detected = bool(touched_or_reclaimed_vwap and (bullish_body or strong_close))
    ema20_reclaim_detected = bool(ema20_reclaim and (bullish_body or strong_close))
    higher_low_detected = bool(higher_low and (bullish_body or strong_close))
    active_confirmation = bool(
        vwap_reclaim_detected
        and above_ema20
        and (ema20_reclaim_detected or higher_low_detected or volume_acceleration is None or volume_acceleration >= 0.75)
    )

    confidence = 63
    reasons = ["setup_context_large_cap_vwap_trend_long", "volume_1m_plus", f"universe_{universe}", "large_cap_vwap_trend_context"]
    if abs(change_percent) >= 1.5:
        confidence += 4; reasons.append("large_cap_in_play_move_1_5pct_plus")
    if volume >= 10_000_000:
        confidence += 5; reasons.append("institutional_volume_10m_plus")
    if ranking_score >= 76:
        confidence += 5; reasons.append("high_quality_large_cap_watch")
    if vwap_reclaim_detected:
        confidence += 6; reasons.append("vwap_reclaim_hold_5m")
    if ema20_reclaim_detected:
        confidence += 4; reasons.append("ema20_support_5m")
    if higher_low_detected:
        confidence += 4; reasons.append("higher_low_5m")
    if active_confirmation:
        confidence += 8; reasons.append("active_large_cap_vwap_trend_confirmation")
    if distance_from_hod_pct is not None and distance_from_hod_pct > 35:
        confidence -= 4; reasons.append("too_far_from_hod_for_trend_continuation")
    if distance_from_vwap_pct is not None and distance_from_vwap_pct > 5:
        confidence -= 7; reasons.append("too_extended_from_vwap_no_chase")
    confidence = max(0, min(100, confidence))

    support_candidates = [v for v in (last_low, vwap, ema20_5m, day_low) if v is not None and v < price]
    structural_support = max(support_candidates) if support_candidates else day_low
    entry_zone, stop, targets = calculate_long_levels(price, structural_support)

    confirmation = {
        "hasActiveConfirmation": bool(active_confirmation),
        "triggers": [],
        "vwapReclaim5m": {
            "detected": vwap_reclaim_detected,
            "vwap": vwap,
            "lastOpen": last_open,
            "lastHigh": last_high,
            "lastLow": last_low,
            "lastClose": last_close,
            "closePosition": round(close_position, 3) if close_position is not None else None,
            "bullishBody": bullish_body,
            "reason": "vwap_reclaim_5m" if vwap_reclaim_detected else "waiting_for_vwap_reclaim_or_hold",
        },
        "ema20Reclaim5m": {
            "detected": ema20_reclaim_detected,
            "ema20_5m": ema20_5m,
            "lastLow": last_low,
            "lastClose": last_close,
            "strongClose": strong_close,
            "reason": "ema20_reclaim_5m" if ema20_reclaim_detected else "waiting_for_ema20_support",
        },
        "higherLow5m": {
            "detected": higher_low_detected,
            "lastLow": last_low,
            "previousLow": prev_low,
            "lastClose": last_close,
            "previousClose": prev_close,
            "reason": "higher_low_5m" if higher_low_detected else "waiting_for_higher_low_confirmation",
        },
    }
    if vwap_reclaim_detected:
        confirmation["triggers"].append("vwap_reclaim_5m")
    if ema20_reclaim_detected:
        confirmation["triggers"].append("ema20_reclaim_5m")
    if higher_low_detected:
        confirmation["triggers"].append("higher_low_5m")

    candle_context = {
        "hasSnapshot": True,
        "latestPrice": price,
        "vwap": vwap,
        "ema20_5m": ema20_5m,
        "atr14_5m": atr14_5m,
        "hod": hod,
        "aboveVwap": above_vwap,
        "aboveEma20": above_ema20,
        "higherLow": higher_low_detected,
        "distanceFromVwapPct": distance_from_vwap_pct,
        "distanceFromHodPct": distance_from_hod_pct,
        "volumeAcceleration": volume_acceleration,
        "fiveMinuteCount": five_minute_count,
        "latestCandleAt": snapshot.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": snapshot.get("latestFiveMinuteCandleAt"),
        "isCandleFresh": is_candle_fresh,
        "candleFreshness": candle_freshness,
        "recentFiveMinuteCandles": recent,
        "confirmation": confirmation,
    }

    return SetupCandidate(
        symbol=symbol,
        setup_slug="large_cap_vwap_trend_long",
        setup_name="Large Cap VWAP Trend Long",
        direction="long",
        status="ARMED",
        confidence=confidence,
        entry_zone=entry_zone,
        stop=stop,
        targets=targets,
        invalidation="Invalid if price loses VWAP/EMA20 and fails to maintain higher-low trend structure.",
        reasons=reasons,
        risk_notes=[
            "Large Cap VWAP Trend Long is ARMED until a fresh VWAP/EMA support confirmation appears.",
            "Best confirmation: VWAP reclaim/hold, EMA20 support, higher low, bullish 5m close.",
            "Avoid if price is choppy around VWAP without clean trend structure.",
            "ACTIVE risk must use the 5m trend structure and true 2R target math.",
        ],
        source={"engineVersion": "holly_persistent_v2_s5_6", "watchCandidate": candidate, "largeCapVwapTrendContext": candle_context, "candleContext": candle_context},
    )

LIVE_SETUP_DETECTORS = [
    detect_premarket_pump_short,
    detect_gap_and_crap_short,
    detect_vwap_rejection_short,
    detect_vwap_reclaim_long,
    detect_opening_range_breakdown_short,
    detect_opening_range_breakout_long,
    detect_gap_hold_continuation_long,
    detect_orb_pullback_continuation_long,
    detect_large_cap_gap_continuation_long,
    detect_large_cap_vwap_trend_long,
]


def detect_live_setups_for_candidate(
    candidate: dict[str, Any],
    candle_snapshot: dict[str, Any] | None = None,
) -> list[SetupCandidate]:
    setups: list[SetupCandidate] = []
    seen: set[str] = set()

    for detector in LIVE_SETUP_DETECTORS:
        setup = detector(candidate, candle_snapshot)
        if setup is None:
            continue
        if setup.setup_slug in seen:
            continue
        seen.add(setup.setup_slug)
        setups.append(setup)

    return setups


def setup_candidate_to_dict(setup: SetupCandidate) -> dict[str, Any]:
    return {
        "symbol": setup.symbol,
        "setupSlug": setup.setup_slug,
        "setupName": setup.setup_name,
        "direction": setup.direction,
        "status": setup.status,
        "confidence": setup.confidence,
        "entryZone": setup.entry_zone,
        "stop": setup.stop,
        "targets": setup.targets,
        "invalidation": setup.invalidation,
        "reasons": setup.reasons,
        "riskNotes": setup.risk_notes,
        "source": setup.source,
        "engineVersion": "holly_persistent_v2",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }



BEST_IDEA_SELECTOR_VERSION = "s5_7_best_idea_selector_v1"

SETUP_SELECTOR_PRIORITY = {
    # Short-side small-cap pump family. These are more specific than generic VWAP rejection.
    "gap_and_crap_short": 96,
    "premarket_pump_short": 94,
    "opening_range_breakdown_short": 92,
    "vwap_rejection_short": 88,
    # Long-side continuation/reclaim family.
    "opening_range_breakout_long": 92,
    "gap_hold_continuation_long": 90,
    "orb_pullback_continuation": 89,
    "large_cap_gap_continuation": 88,
    "large_cap_vwap_trend_long": 86,
    "vwap_reclaim_long": 84,
}

STATUS_SELECTOR_PRIORITY = {
    "ACTIVE": 300,
    "ARMED": 200,
    "REJECTED": 50,
    "WATCH": 10,
}

QUALITY_SELECTOR_PRIORITY = {
    "PASSED": 300,
    "WAITING_CONFIRMATION": 190,
    "REJECT_NO_VALID_STRUCTURAL_STOP": 40,
    "REJECT_EMA20_LOSS_WEAK_CANDLE": 35,
    "REJECT_NO_ACTIVE_TRIGGER": 30,
}


def _selector_quality_score(setup: dict[str, Any]) -> int:
    quality = str(setup.get("qualityStatus") or "")
    if quality.startswith("REJECT"):
        return min(QUALITY_SELECTOR_PRIORITY.get(quality, 25), 45)
    return QUALITY_SELECTOR_PRIORITY.get(quality, 100)


def _selector_numeric_score(setup: dict[str, Any]) -> float:
    symbol = str(setup.get("symbol") or "")
    slug = str(setup.get("setupSlug") or "")
    direction = str(setup.get("direction") or "")
    status = str(setup.get("status") or "")
    quality = str(setup.get("qualityStatus") or "")

    score = 0.0
    score += STATUS_SELECTOR_PRIORITY.get(status, 0)
    score += _selector_quality_score(setup)
    score += SETUP_SELECTOR_PRIORITY.get(slug, 50)
    score += min(100, safe_int(setup.get("signalScore"), safe_int(setup.get("confidence")))) * 0.75
    score += min(100, safe_int(setup.get("confidence"))) * 0.25

    if setup.get("telegramEligible") is True:
        score += 120
    if setup.get("premiumSignal") is True:
        score += 70
    if quality == "PASSED":
        score += 60
    if status == "ACTIVE" and quality != "PASSED":
        score -= 180
    if quality.startswith("REJECT"):
        score -= 120

    # Prefer specific playbooks over duplicated generic readings on the same symbol.
    if slug in {"gap_and_crap_short", "opening_range_breakdown_short", "opening_range_breakout_long", "gap_hold_continuation_long", "orb_pullback_continuation"}:
        score += 18
    if slug in {"vwap_rejection_short", "vwap_reclaim_long"}:
        score -= 2

    if direction == "long" and slug.startswith("large_cap"):
        score += 8

    # Stable deterministic tie-breaker without leaking into user-facing score.
    score += (sum(ord(ch) for ch in f"{symbol}:{slug}") % 17) / 100.0
    return round(score, 4)


def select_best_ideas_per_symbol(setups: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """Pick one best idea per symbol while preserving alternates for debug/calibration.

    This is the Holly-like desk behaviour: the client sees one primary idea per ticker,
    while the engine can still evaluate multiple playbooks behind the scenes.
    """
    by_symbol: dict[str, list[dict[str, Any]]] = {}
    for item in setups:
        symbol = str(item.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        by_symbol.setdefault(symbol, []).append(item)

    selected: list[dict[str, Any]] = []
    alternates: list[dict[str, Any]] = []

    for symbol, items in by_symbol.items():
        ranked = sorted(items, key=_selector_numeric_score, reverse=True)
        best = ranked[0]
        alternatives = ranked[1:]
        best_score = _selector_numeric_score(best)

        best_source = best.get("source") if isinstance(best.get("source"), dict) else {}
        best_source["bestIdeaSelector"] = {
            "version": BEST_IDEA_SELECTOR_VERSION,
            "selected": True,
            "selectorScore": best_score,
            "competingCount": len(alternatives),
            "competingSetups": [
                {
                    "setupSlug": alt.get("setupSlug"),
                    "setupName": alt.get("setupName"),
                    "direction": alt.get("direction"),
                    "status": alt.get("status"),
                    "qualityStatus": alt.get("qualityStatus"),
                    "signalScore": alt.get("signalScore"),
                    "signalGrade": alt.get("signalGrade"),
                    "telegramEligible": alt.get("telegramEligible"),
                    "selectorScore": _selector_numeric_score(alt),
                }
                for alt in alternatives[:8]
            ],
        }
        best["source"] = best_source
        best["bestIdeaSelected"] = True
        best["bestIdeaSelectorScore"] = best_score
        best["alternativeSetupCount"] = len(alternatives)
        selected.append(best)

        for alt in alternatives:
            alt_copy = dict(alt)
            alt_copy["bestIdeaSelected"] = False
            alt_copy["bestIdeaSelectorScore"] = _selector_numeric_score(alt)
            alt_copy["selectedSetupSlug"] = best.get("setupSlug")
            alt_copy["selectedSetupStatus"] = best.get("status")
            alternates.append(alt_copy)

    selected.sort(key=lambda item: (_selector_numeric_score(item), int(item.get("signalScore") or 0), int(item.get("confidence") or 0)), reverse=True)
    alternates.sort(key=lambda item: (_selector_numeric_score(item), int(item.get("signalScore") or 0)), reverse=True)

    summary = {
        "version": BEST_IDEA_SELECTOR_VERSION,
        "mode": "one_primary_idea_per_symbol",
        "inputCount": len(setups),
        "selectedCount": len(selected),
        "alternativeCount": len(alternates),
        "symbolsWithAlternatives": sum(1 for items in by_symbol.values() if len(items) > 1),
        "rules": [
            "ACTIVE/PASSED premium ideas beat ARMED ideas",
            "ARMED ideas beat rejected debug setups",
            "specific playbooks beat generic duplicate readings when scores are close",
            "alternates are retained for debug/calibration but not pushed as client primary ideas",
        ],
    }
    return selected, alternates, summary


def _setup_family_map() -> dict[str, str]:
    try:
        return {
            str(item.get("setupSlug") or "unknown"): str(item.get("family") or "unknown")
            for item in get_algorithm_registry()
            if isinstance(item, dict)
        }
    except Exception:
        return {}


def _increment_counter(target: dict[str, int], key: Any) -> None:
    normalized = str(key or "unknown")
    target[normalized] = target.get(normalized, 0) + 1


def count_setups_by_slug(items: list[dict[str, Any]] | None) -> dict[str, int]:
    """Return setup counts keyed by setupSlug for response telemetry.

    S5.7/S5.8 use this in discovery responses after best-idea selection.
    It must stay defensive so diagnostics never break the trading engine.
    """
    counts: dict[str, int] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("setupSlug") or item.get("setup_slug") or "unknown")
        counts[slug] = counts.get(slug, 0) + 1
    return dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))


def _compact_portfolio_idea(item: dict[str, Any]) -> dict[str, Any]:
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    watch = source.get("watchCandidate") if isinstance(source.get("watchCandidate"), dict) else {}
    signal = item.get("signal") if isinstance(item.get("signal"), dict) else item
    return {
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "setupName": item.get("setupName"),
        "direction": item.get("direction"),
        "status": item.get("status"),
        "qualityStatus": item.get("qualityStatus"),
        "signalGrade": item.get("signalGrade"),
        "signalScore": item.get("signalScore") or item.get("confidence"),
        "telegramEligible": item.get("telegramEligible") is True,
        "premiumSignal": item.get("premiumSignal") is True,
        "price": watch.get("price") or signal.get("entry") or item.get("entry"),
        "changePercent": watch.get("changePercent"),
        "volume": watch.get("volume"),
        "universe": watch.get("universe"),
        "alternativeSetupCount": item.get("alternativeSetupCount") or 0,
    }


def build_setup_portfolio_summary(
    primary_items: list[dict[str, Any]] | None,
    *,
    all_items: list[dict[str, Any]] | None = None,
    watch_items: list[dict[str, Any]] | None = None,
    alternative_items: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a Holly-like strategy mix view for the AI Desk.

    Primary items are the client-facing best ideas. All items include every detector
    result before best-idea dedupe when available. Alternatives are hidden from the
    client list but kept for diagnostics/calibration.
    """
    primary = [item for item in (primary_items or []) if isinstance(item, dict)]
    raw_all = [item for item in (all_items or primary) if isinstance(item, dict)]
    alternatives = [item for item in (alternative_items or []) if isinstance(item, dict)]
    watch = [item for item in (watch_items or []) if isinstance(item, dict)]
    family_map = _setup_family_map()

    by_direction: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_quality: dict[str, int] = {}
    by_setup: dict[str, int] = {}
    by_family: dict[str, int] = {}
    by_universe: dict[str, int] = {}
    active_by_direction: dict[str, int] = {}
    armed_by_direction: dict[str, int] = {}

    telegram_eligible = 0
    premium_count = 0
    active_count = 0
    armed_count = 0
    rejected_count = 0

    for item in primary:
        direction = str(item.get("direction") or "unknown")
        status = str(item.get("status") or "unknown")
        quality = str(item.get("qualityStatus") or "unknown")
        slug = str(item.get("setupSlug") or "unknown")
        family = family_map.get(slug, "unknown")
        source = item.get("source") if isinstance(item.get("source"), dict) else {}
        watch_candidate = source.get("watchCandidate") if isinstance(source.get("watchCandidate"), dict) else {}
        universe = watch_candidate.get("universe") or "unknown"

        _increment_counter(by_direction, direction)
        _increment_counter(by_status, status)
        _increment_counter(by_quality, quality)
        _increment_counter(by_setup, slug)
        _increment_counter(by_family, family)
        _increment_counter(by_universe, universe)

        if item.get("telegramEligible") is True:
            telegram_eligible += 1
        if item.get("premiumSignal") is True:
            premium_count += 1
        if status == "ACTIVE":
            active_count += 1
            _increment_counter(active_by_direction, direction)
        elif status == "ARMED":
            armed_count += 1
            _increment_counter(armed_by_direction, direction)
        elif status == "REJECTED":
            rejected_count += 1

    long_count = by_direction.get("long", 0)
    short_count = by_direction.get("short", 0)
    active_long_count = active_by_direction.get("long", 0)
    active_short_count = active_by_direction.get("short", 0)

    if active_long_count > active_short_count:
        market_bias = "active_long_bias"
    elif active_short_count > active_long_count:
        market_bias = "active_short_bias"
    elif long_count > short_count:
        market_bias = "long_watchlist_bias"
    elif short_count > long_count:
        market_bias = "short_watchlist_bias"
    else:
        market_bias = "balanced_or_waiting"

    def top_by_count(counter: dict[str, int], limit: int = 8) -> list[dict[str, Any]]:
        return [
            {"key": key, "count": value}
            for key, value in sorted(counter.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]
        ]

    actionable = [item for item in primary if item.get("status") == "ACTIVE" and item.get("qualityStatus") == "PASSED"]
    waiting = [item for item in primary if item.get("status") == "ARMED"]
    rejected = [item for item in primary if str(item.get("qualityStatus") or "").startswith("REJECT")]

    return {
        "storageVersion": "s5_8_setup_portfolio_summary_v1",
        "model": "setup_portfolio_summary_strategy_mix",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "primaryIdeaCount": len(primary),
            "rawDetectorIdeaCount": len(raw_all),
            "alternativeIdeaCount": len(alternatives),
            "watchCount": len(watch),
            "activeCount": active_count,
            "armedCount": armed_count,
            "rejectedPrimaryCount": rejected_count,
            "telegramEligibleCount": telegram_eligible,
            "premiumSignalCount": premium_count,
            "longCount": long_count,
            "shortCount": short_count,
            "activeLongCount": active_long_count,
            "activeShortCount": active_short_count,
        },
        "marketBias": {
            "label": market_bias,
            "longCount": long_count,
            "shortCount": short_count,
            "activeLongCount": active_long_count,
            "activeShortCount": active_short_count,
            "interpretation": "This is a strategy-mix view, not a market prediction. Execution still requires setup-specific confirmation and risk validation.",
        },
        "strategyMix": {
            "byDirection": by_direction,
            "byStatus": by_status,
            "byQualityStatus": by_quality,
            "bySetupSlug": by_setup,
            "byFamily": by_family,
            "byUniverse": by_universe,
            "topSetups": top_by_count(by_setup),
            "topFamilies": top_by_count(by_family),
        },
        "clientDesk": {
            "headline": "SkillEdge AI is showing one best idea per ticker after dedupe.",
            "activeIdeas": [_compact_portfolio_idea(item) for item in actionable[:10]],
            "waitingIdeas": [_compact_portfolio_idea(item) for item in waiting[:12]],
            "rejectedDebugIdeas": [_compact_portfolio_idea(item) for item in rejected[:8]],
        },
        "rules": [
            "One primary idea per symbol is shown to clients.",
            "Alternatives remain available for debug/calibration only.",
            "Telegram remains strict: ACTIVE + PASSED + premium + telegramEligible.",
            "Strategy mix is informational; it does not override setup-specific risk gates.",
        ],
    }


_S10_7S_LAST_SETUP_CYCLE_MS = None

def _s10_7s_write_setup_cycle_metric(value_ms):
    path = Path(
        os.getenv(
            "SKILLEDGE_SETUP_CYCLE_METRIC_PATH",
            "/opt/skilledge/stock-engine/data/runtime/setup_cycle_metric.json",
        )
    )
    payload = {
        "schemaVersion": 1,
        "setupCycleMs": float(value_ms),
        "source": "refresh_setup_engine_from_watchlist",
        "recordedAtEpochSeconds": time.time(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    os.replace(temp, path)

async def refresh_setup_engine_from_watchlist(client: FmpClient) -> dict[str, Any]:
    global _S10_7S_LAST_SETUP_CYCLE_MS
    __s10_7s_started = time.perf_counter()
    try:
        ARMED.clear()
        ACTIVE.clear()

        all_detected: list[dict[str, Any]] = []
        candle_debug: list[dict[str, Any]] = []

        ranked_candidates = sorted(
            WATCHLIST.values(),
            key=lambda item: int(item.get("inPlayScore") or 0),
            reverse=True,
        )

        for candidate in ranked_candidates[:50]:
            preliminary_setups = detect_live_setups_for_candidate(candidate)

            if not preliminary_setups:
                continue

            symbol = str(candidate.get("symbol") or "")
            candle_snapshot: dict[str, Any] = {}

            try:
                candle_rows = await client.get_intraday_candles(symbol, interval="1min")
                candle_snapshot = build_session_snapshot(candle_rows)
                candle_freshness = evaluate_candle_freshness(candle_snapshot)
                candle_snapshot["candleFreshness"] = candle_freshness
                candle_snapshot["isCandleFresh"] = bool(candle_freshness.get("isFresh"))

                candle_debug.append(
                    {
                        "symbol": symbol,
                        "rawCandles": len(candle_rows),
                        "fiveMinuteCount": candle_snapshot.get("fiveMinuteCount"),
                        "latestCandleAt": candle_snapshot.get("latestCandleAt"),
                        "latestFiveMinuteCandleAt": candle_snapshot.get("latestFiveMinuteCandleAt"),
                        "candleFreshness": candle_freshness,
                        "vwap": candle_snapshot.get("vwap"),
                        "ema20_5m": candle_snapshot.get("ema20_5m"),
                        "rsi14_5m": candle_snapshot.get("rsi14_5m"),
                        "confirmation": candle_snapshot.get("confirmation"),
                        "preliminarySetups": [setup.setup_slug for setup in preliminary_setups],
                    }
                )
            except Exception as error:
                candle_debug.append(
                    {
                        "symbol": symbol,
                        "error": repr(error),
                        "preliminarySetups": [setup.setup_slug for setup in preliminary_setups],
                    }
                )

            setups = detect_live_setups_for_candidate(candidate, candle_snapshot)

            if not setups:
                continue

            confirmation = (
                candle_snapshot.get("confirmation")
                if isinstance(candle_snapshot, dict)
                else {}
            )

            has_active_confirmation = bool(
                confirmation.get("hasActiveConfirmation")
            )
            is_candle_fresh = bool(candle_snapshot.get("isCandleFresh"))

            for setup in setups:
                setup_dict = setup_candidate_to_dict(setup)

                setup_source = setup_dict.get("source") if isinstance(setup_dict.get("source"), dict) else {}
                setup_candle_context = setup_source.get("candleContext") if isinstance(setup_source.get("candleContext"), dict) else {}
                setup_confirmation = setup_candle_context.get("confirmation") if isinstance(setup_candle_context.get("confirmation"), dict) else {}
                setup_has_active_confirmation = bool(setup_confirmation.get("hasActiveConfirmation")) or has_active_confirmation

                if setup_has_active_confirmation and is_candle_fresh:
                    setup_dict["status"] = "ACTIVE"
                    setup_dict = apply_signal_quality_gate(setup_dict, candle_snapshot)

                    # S4.10B/S5 quality gate: only real premium PASSED signals are
                    # allowed into ACTIVE. RR/score/trigger rejects stay visible in
                    # setupAlternatives for debugging/calibration only.
                    if not (setup_dict.get("qualityStatus") == "PASSED" and setup_dict.get("premiumSignal") is True):
                        setup_dict["status"] = "REJECTED"
                        setup_dict.setdefault("riskNotes", []).append(
                            "Rejected by quality gate. It is kept only for debug/calibration and must not be sent as a signal."
                        )
                else:
                    # Fresh quote can keep the candidate on radar, but stale candles
                    # must never create ACTIVE/Telegram.
                    setup_dict["status"] = "ARMED"
                    setup_dict = apply_signal_quality_gate(setup_dict, candle_snapshot)

                all_detected.append(setup_dict)

        selected_detected, alternative_setups, selector_summary = select_best_ideas_per_symbol(all_detected)

        # Client-facing runtime state: one primary idea per symbol.
        # This prevents the Cockpit/Telegram layer from showing duplicate playbooks
        # on the same ticker while keeping alternatives for calibration/debug.
        for setup_dict in selected_detected:
            symbol = str(setup_dict.get("symbol") or "")
            setup_slug = str(setup_dict.get("setupSlug") or "setup")
            key = f"{symbol}:{setup_slug}"
            if setup_dict.get("status") == "ACTIVE" and setup_dict.get("qualityStatus") == "PASSED" and setup_dict.get("premiumSignal") is True:
                ACTIVE[key] = setup_dict
            elif setup_dict.get("status") == "ARMED":
                ARMED[key] = setup_dict

        portfolio_summary = build_setup_portfolio_summary(
            selected_detected,
            all_items=all_detected,
            watch_items=list(WATCHLIST.values()),
            alternative_items=alternative_setups,
        )

        def _s58d_safe_count_setups_by_slug(items: list[dict[str, Any]] | None) -> dict[str, int]:
            counts: dict[str, int] = {}
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                slug = str(item.get("setupSlug") or item.get("setup_slug") or "unknown")
                counts[slug] = counts.get(slug, 0) + 1
            return dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))

        return {
            "armedCount": len(ARMED),
            "activeCount": len(ACTIVE),
            "setupsDetected": selected_detected[:30],
            "setupAlternatives": alternative_setups[:60],
            "bestIdeaSelector": selector_summary,
            "setupPortfolioSummary": portfolio_summary,
            "strategyMix": portfolio_summary.get("strategyMix"),
            "marketBias": portfolio_summary.get("marketBias"),
            "candleDebug": candle_debug[:25],
            "liveSetupCounts": _s58d_safe_count_setups_by_slug(selected_detected),
            "liveSetupCountsAll": _s58d_safe_count_setups_by_slug(all_detected),
            "liveSetupVersion": "s5_8d_hard_count_setup_fix_v1",
        }
    finally:
        _S10_7S_LAST_SETUP_CYCLE_MS = round((time.perf_counter() - __s10_7s_started) * 1000.0, 3)
        _s10_7s_write_setup_cycle_metric(_S10_7S_LAST_SETUP_CYCLE_MS)


async def refresh_discovery_watchlist() -> dict[str, Any]:
    client = FmpClient()

    gainers = await client.get_biggest_gainers()
    losers = await client.get_biggest_losers()
    active = await client.get_most_active()

    raw_rows: list[tuple[str, dict[str, Any]]] = []

    for bucket, source_rows in (
        ("gainers", gainers),
        ("losers", losers),
        ("active", active),
    ):
        for row in source_rows:
            if isinstance(row, dict):
                raw_rows.append((bucket, row))

    symbols = [normalize_symbol(row.get("symbol") or row.get("ticker")) for _, row in raw_rows]
    quote_map = await client.get_quote_map(symbols)

    rows: list[NormalizedMover] = []
    rejected: list[dict[str, Any]] = []

    for bucket, row in raw_rows:
        symbol = normalize_symbol(row.get("symbol") or row.get("ticker"))
        quote = quote_map.get(symbol, {})

        merged_for_quality = {**quote, **row}

        blocked, block_reason = is_blocked_etf_or_fund(merged_for_quality)
        if not blocked:
            blocked, block_reason = is_blocked_share_class_or_unit(merged_for_quality)

        if blocked:
            rejected.append({"symbol": symbol, "bucket": bucket, "reasons": [block_reason]})
            continue

        enriched_row = {
            **quote,
            **row,
            "volume": (
                quote.get("volume")
                or quote.get("sharesVolume")
                or quote.get("dayVolume")
                or quote.get("regularMarketVolume")
                or row.get("volume")
                or row.get("sharesVolume")
                or row.get("dayVolume")
                or row.get("regularMarketVolume")
            ),
            "price": row.get("price") or quote.get("price") or quote.get("lastPrice"),
            "exchange": row.get("exchange") or quote.get("exchange") or quote.get("exchangeShortName"),
            "quote": quote,
        }

        mover = normalize_mover(enriched_row, bucket)
        if mover:
            rows.append(mover)

    best_by_symbol: dict[str, dict[str, Any]] = {}

    for mover in rows:
        score, ranking, reasons = calculate_quality_rank(mover)

        if score <= 0:
            rejected.append(
                {
                    "symbol": mover.symbol,
                    "bucket": mover.source_bucket,
                    "volume": mover.volume,
                    "price": mover.price,
                    "marketCap": mover.market_cap,
                    "universe": mover.universe,
                    "ranking": ranking,
                    "reasons": reasons,
                }
            )
            continue

        candidate = {
            "symbol": mover.symbol,
            "name": mover.name,
            "exchange": mover.exchange,
            "price": mover.price,
            "changePercent": mover.change_percent,
            "volume": mover.volume,
            "marketCap": mover.market_cap,
            "universe": mover.universe,
            "sourceBucket": mover.source_bucket,
            "inPlayScore": score,
            "ranking": ranking,
            "reasons": reasons,
            "status": "WATCH",
            "engineVersion": "holly_persistent_v2",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "raw": mover.raw,
        }

        existing = best_by_symbol.get(mover.symbol)
        if not existing or candidate["inPlayScore"] > existing["inPlayScore"]:
            best_by_symbol[mover.symbol] = candidate

    WATCHLIST.clear()
    WATCHLIST.update(best_by_symbol)

    setup_result = await refresh_setup_engine_from_watchlist(client)

    top = sorted(WATCHLIST.values(), key=lambda item: item["inPlayScore"], reverse=True)[:20]

    universe_counts: dict[str, int] = {}
    for item in WATCHLIST.values():
        universe = str(item.get("universe") or "unknown")
        universe_counts[universe] = universe_counts.get(universe, 0) + 1

    return {
        "ok": True,
        "loadedRows": len(rows),
        "quotesLoaded": len(quote_map),
        "watchCount": len(WATCHLIST),
        "armedCount": setup_result["armedCount"],
        "activeCount": setup_result["activeCount"],
        "rejectedCount": len(rejected),
        "universeCounts": universe_counts,
        "top": top,
        "setupsDetected": setup_result["setupsDetected"],
        "setupAlternatives": setup_result.get("setupAlternatives", []),
        "bestIdeaSelector": setup_result.get("bestIdeaSelector"),
        "setupPortfolioSummary": setup_result.get("setupPortfolioSummary"),
        "strategyMix": setup_result.get("strategyMix"),
        "marketBias": setup_result.get("marketBias"),
        "liveSetupCounts": setup_result.get("liveSetupCounts", {}),
        "liveSetupCountsAll": setup_result.get("liveSetupCountsAll", {}),
        "liveSetupVersion": setup_result.get("liveSetupVersion"),
        "candleDebug": setup_result["candleDebug"],
        "rejectedSample": rejected[:30],
    }






