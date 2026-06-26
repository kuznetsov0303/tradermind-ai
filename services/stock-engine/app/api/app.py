import os
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Any

from fastapi import FastAPI

from app.config import get_settings
from app.data.fmp_client import FmpClient
from app.discovery import refresh_discovery_watchlist, build_setup_portfolio_summary
from app.indicators import build_session_snapshot
from app.backtest import evaluate_active_signals, evaluate_signal_outcome
from app.storage import EngineDatabase
from app.state import ENGINE_STARTED_AT, ACTIVE, ARMED, WATCHLIST, SIGNALS, BACKTEST_OUTCOMES
from app.setup_registry import get_algorithm_registry, get_algorithm_registry_summary
from app.runtime_cache import RuntimeCache

settings = get_settings()
db = EngineDatabase()
runtime_cache = RuntimeCache()

app = FastAPI(
    title=settings.app_name,
    version=settings.engine_version,
)


def build_engine_status():
    return {
        "ok": True,
        "service": settings.app_name,
        "engineVersion": settings.engine_version,
        "env": settings.app_env,
        "stockPersistentEngineEnabled": settings.signal_stock_persistent_engine_enabled,
        "stockLegacyEngineEnabled": settings.signal_stock_legacy_engine_enabled,
        "localDatabase": db.get_status(),
        "runtimeCache": runtime_cache.get_status(),
        "connections": {
            "hasSupabaseUrl": bool(settings.resolved_supabase_url),
            "hasSupabaseServiceKey": bool(settings.resolved_supabase_service_key),
            "hasRedisUrl": bool(settings.redis_url),
            "hasFmpApiKey": bool(settings.fmp_api_key),
            "fmpPlan": settings.fmp_plan,
        },
    }


def normalize_signal_record(item: dict[str, Any], fallback_key: str | None = None) -> dict[str, Any] | None:
    """Normalize an ACTIVE setup candidate into a durable signal record."""

    if not isinstance(item, dict):
        return None

    payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
    if not isinstance(payload, dict):
        return None

    signal_id = str(
        payload.get("signalId")
        or item.get("signalId")
        or fallback_key
        or ""
    ).strip()

    symbol = str(payload.get("symbol") or item.get("symbol") or "").upper().strip()
    setup_slug = str(payload.get("setupSlug") or item.get("setupSlug") or "").strip()

    if not signal_id and symbol and setup_slug:
        created = str(payload.get("createdAt") or item.get("updatedAt") or datetime.now(timezone.utc).isoformat())
        signal_id = f"stock:{symbol}:{setup_slug}:{created}"

    if not signal_id or not symbol:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    candle_freshness = payload.get("candleFreshness") if isinstance(payload.get("candleFreshness"), dict) else {}
    trigger_time = (
        payload.get("triggerTime")
        or item.get("triggerTime")
        or candle_freshness.get("latestCandleAt")
        or payload.get("createdAt")
        or item.get("updatedAt")
        or now_iso
    )

    created_at = str(payload.get("createdAt") or item.get("updatedAt") or now_iso)
    session_date = str(trigger_time or created_at)[:10]

    targets = payload.get("targets") if isinstance(payload.get("targets"), list) else item.get("targets")
    targets = targets if isinstance(targets, list) else []

    record = {
        "signalId": signal_id,
        "assetType": payload.get("assetType") or "stock",
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setupName": payload.get("setupName") or item.get("setupName"),
        "direction": payload.get("direction") or item.get("direction"),
        "status": payload.get("status") or item.get("status"),
        "entry": payload.get("entry"),
        "entryZone": payload.get("entryZone") or item.get("entryZone"),
        "stop": payload.get("stop") or item.get("stop"),
        "targets": targets,
        "rrToTp1": payload.get("rrToTp1") or item.get("rrToTp1"),
        "rrToTp2": payload.get("rrToTp2") or item.get("rrToTp2"),
        "entryDistancePct": payload.get("entryDistancePct") or item.get("entryDistancePct"),
        "primaryTrigger": payload.get("primaryTrigger") or item.get("primaryTrigger"),
        "triggers": payload.get("triggers") or item.get("triggers") or [],
        "signalScore": payload.get("signalScore") or item.get("signalScore"),
        "signalGrade": payload.get("signalGrade") or item.get("signalGrade"),
        "premiumSignal": bool(payload.get("premiumSignal") or item.get("premiumSignal")),
        "telegramEligible": bool(payload.get("telegramEligible") or item.get("telegramEligible")),
        "qualityStatus": item.get("qualityStatus") or payload.get("qualityStatus"),
        "confirmation": payload.get("confirmation") or item.get("confirmation"),
        "candleFreshness": payload.get("candleFreshness") or item.get("candleFreshness"),
        "isCandleFresh": payload.get("isCandleFresh") if "isCandleFresh" in payload else item.get("isCandleFresh"),
        "createdAt": created_at,
        "triggerTime": trigger_time,
        "sessionDate": session_date,
        "storedAt": now_iso,
        "engineVersion": payload.get("engineVersion") or item.get("engineVersion") or settings.engine_version,
        "rawSignal": payload,
    }

    return record


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None or value == "":
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def build_signal_storage_key(record: dict[str, Any], fallback_key: str = "") -> str:
    symbol = str(record.get("symbol") or "").upper().strip()
    setup_slug = str(record.get("setupSlug") or "setup").strip()
    session_date = str(record.get("sessionDate") or "").strip()

    if not session_date:
        created_at = str(record.get("createdAt") or record.get("triggerTime") or "")
        session_date = created_at[:10] if len(created_at) >= 10 else datetime.now(timezone.utc).date().isoformat()

    if not symbol:
        symbol = str(fallback_key).split(":", 1)[0].upper().strip() or "UNKNOWN"

    return f"{symbol}:{setup_slug}:{session_date}"


def should_replace_signal(existing: dict[str, Any] | None, incoming: dict[str, Any]) -> bool:
    if not existing:
        return True

    old_score = _safe_int(existing.get("signalScore"))
    new_score = _safe_int(incoming.get("signalScore"))

    if new_score > old_score:
        return True
    if new_score < old_score:
        return False

    old_created = str(existing.get("createdAt") or existing.get("storedAt") or "")
    new_created = str(incoming.get("createdAt") or incoming.get("storedAt") or "")
    return new_created >= old_created


def store_active_signals() -> dict[str, Any]:
    """Rebuild runtime signal storage from current ARMED + ACTIVE candidates.

    Product rule:
    - /engine/signals must show ARMED + ACTIVE so the dashboard is not empty
      while the engine is waiting for 5m confirmation;
    - Telegram remains strict: only ACTIVE + PASSED + premium + telegramEligible
      records are eligible for /engine/signals/telegram;
    - SIGNALS is runtime UI/API storage, rebuilt from the current registry state
      to avoid stale ghost cards after every discovery refresh.
    """

    SIGNALS.clear()

    stored = 0
    stored_armed = 0
    stored_active = 0
    skipped = 0

    registry_items: list[tuple[str, str, dict[str, Any]]] = [
        *[(str(key), "ARMED", item) for key, item in ARMED.items()],
        *[(str(key), "ACTIVE", item) for key, item in ACTIVE.items()],
    ]

    for key, expected_status, item in registry_items:
        record = normalize_signal_record(item, fallback_key=key)
        if not record:
            skipped += 1
            continue

        status = str(record.get("status") or expected_status or "").upper()
        if status not in {"ARMED", "ACTIVE"}:
            skipped += 1
            continue

        record["status"] = status
        record["lifecycleStatus"] = status
        record["dashboardVisible"] = True
        record["waitingForConfirmation"] = status == "ARMED"

        # ARMED cards are useful for the dashboard, but must never be sent to Telegram.
        if status == "ARMED":
            record["qualityStatus"] = record.get("qualityStatus") or "WAITING_CONFIRMATION"
            record["premiumSignal"] = False
            record["telegramEligible"] = False

        # ACTIVE cards can be shown on the dashboard, but Telegram stays strict.
        if status == "ACTIVE":
            passed_premium_active = (
                record.get("qualityStatus") == "PASSED"
                and record.get("premiumSignal") is True
                and record.get("telegramEligible") is True
            )

            if not passed_premium_active:
                record["telegramEligible"] = False
                record["premiumSignal"] = False

        storage_key = build_signal_storage_key(record, fallback_key=key)
        record["storageKey"] = storage_key

        # ACTIVE should win over ARMED if both ever share the same symbol/setup/session key.
        existing = SIGNALS.get(storage_key)
        if existing:
            existing_status = str(existing.get("status") or "").upper()
            if existing_status == "ACTIVE" and status == "ARMED":
                skipped += 1
                continue

        SIGNALS[storage_key] = record
        db.upsert_signal(storage_key, record)
        stored += 1

        if status == "ARMED":
            stored_armed += 1
        elif status == "ACTIVE":
            stored_active += 1

    return {
        "stored": stored,
        "storedArmed": stored_armed,
        "storedActive": stored_active,
        "replaced": 0,
        "skipped": skipped,
        "totalStored": len(SIGNALS),
        "telegramEligibleStored": sum(1 for item in SIGNALS.values() if item.get("telegramEligible") is True),
        "storageMode": "armed_plus_active_runtime",
    }

def sorted_signal_items(limit: int = 100, premium_only: bool = False, telegram_only: bool = False) -> list[dict[str, Any]]:
    items = list(SIGNALS.values())

    if premium_only:
        items = [item for item in items if item.get("premiumSignal") is True]

    if telegram_only:
        items = [item for item in items if item.get("telegramEligible") is True]

    items = sorted(
        items,
        key=lambda item: str(item.get("createdAt") or item.get("storedAt") or ""),
        reverse=True,
    )

    return items[: max(1, min(limit, 500))]



def build_runtime_cache_payload() -> dict[str, Any]:
    """Build runtime payload from the same tolerant sources as the Cockpit.

    S5.14E: older implementation referenced local variables that only exist
    inside the cockpit builder. That could make /engine/cache/publish fail and
    could also wipe counters when API memory was empty after a restart.
    """
    raw_watch_source = _s416_watchlist_items()
    raw_armed_source = _s416_armed_items()
    raw_active_source = _s416_active_items()
    raw_signal_source = _s416_signal_items()
    telegram_items = [item for item in raw_signal_source if isinstance(item, dict) and item.get("telegramEligible") is True]

    return {
        "runtimeStatus": {
            "startedAt": ENGINE_STARTED_AT.isoformat(),
            "watchCount": len(raw_watch_source),
            "armedCount": len(raw_armed_source),
            "activeCount": len(raw_active_source),
            "signalCount": len(raw_signal_source),
            "telegramEligibleSignalCount": len(telegram_items),
            "backtestOutcomeCount": len(BACKTEST_OUTCOMES),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "s5_14e_runtime_source_of_truth",
        },
        "watchlist": sorted(
            [item for item in raw_watch_source if isinstance(item, dict)],
            key=lambda item: int(item.get("inPlayScore") or 0),
            reverse=True,
        )[:100],
        "armed": sorted(
            [item for item in raw_armed_source if isinstance(item, dict)],
            key=lambda item: int(item.get("confidence") or item.get("signalScore") or 0),
            reverse=True,
        )[:100],
        "active": sorted(
            [item for item in raw_active_source if isinstance(item, dict)],
            key=lambda item: int(item.get("signalScore") or item.get("confidence") or 0),
            reverse=True,
        )[:100],
        "signals": sorted_signal_items(limit=100),
        "telegramSignals": sorted(
            telegram_items,
            key=lambda item: str(item.get("createdAt") or item.get("storedAt") or ""),
            reverse=True,
        )[:100],
    }


def publish_runtime_cache(reason: str = "manual", ttl_seconds: int = 900) -> dict[str, Any]:
    payload = build_runtime_cache_payload()
    base = {
        "reason": reason,
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": "s412_runtime_cache_v1",
    }
    items = {
        "engine:runtime_status": {**base, **payload["runtimeStatus"]},
        "engine:watchlist": {**base, "count": len(payload["watchlist"]), "items": payload["watchlist"]},
        "engine:armed": {**base, "count": len(payload["armed"]), "items": payload["armed"]},
        "engine:active": {**base, "count": len(payload["active"]), "items": payload["active"]},
        "engine:signals": {**base, "count": len(payload["signals"]), "items": payload["signals"]},
        "engine:telegram_signals": {**base, "count": len(payload["telegramSignals"]), "items": payload["telegramSignals"]},
    }
    result = runtime_cache.publish_many(items, ttl_seconds=ttl_seconds)
    return {
        **result,
        "reason": reason,
        "runtimeStatus": payload["runtimeStatus"],
        "storageVersion": "s412_runtime_cache_v1",
    }



TELEGRAM_DELIVERY_VERSION = "s414b2_firewall_semantics_v1"
TELEGRAM_DELIVERED_INDEX_KEY = "engine:telegram_delivered_index"
TELEGRAM_EVENT_DELIVERED_INDEX_KEY = "engine:telegram_event_delivered_index"


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    try:
        value = int(float(str(os.getenv(name, default)).strip()))
    except Exception:
        value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def _env_float(name: str, default: float, min_value: float | None = None, max_value: float | None = None) -> float:
    try:
        value = float(str(os.getenv(name, default)).strip())
    except Exception:
        value = default
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def _env_csv(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    items = [item.strip() for item in raw.split(",") if item.strip()]
    return items or default


# S4.14B policy: Telegram is now an alert/update layer, not the trading UI.
# The Cockpit page will hold the full chart, reasons, lifecycle and management.
TELEGRAM_EVENT_BUCKET_MINUTES = _env_int("TELEGRAM_EVENT_BUCKET_MINUTES", 60, min_value=5, max_value=240)
TELEGRAM_QUEUE_BEST_OF_LIMIT = _env_int("TELEGRAM_QUEUE_BEST_OF_LIMIT", 5, min_value=1, max_value=25)
TELEGRAM_MIN_SIGNAL_SCORE = _env_float("TELEGRAM_MIN_SIGNAL_SCORE", 90.0, min_value=0, max_value=100)
TELEGRAM_MIN_STRONG_CONFIRMATIONS = _env_int("TELEGRAM_MIN_STRONG_CONFIRMATIONS", 2, min_value=1, max_value=5)
TELEGRAM_MIN_EXECUTION_CONFIRMATIONS = _env_int(
    "TELEGRAM_MIN_EXECUTION_CONFIRMATIONS",
    TELEGRAM_MIN_STRONG_CONFIRMATIONS,
    min_value=1,
    max_value=5,
)
TELEGRAM_MIN_EXECUTION_WITH_STRUCTURE = _env_int("TELEGRAM_MIN_EXECUTION_WITH_STRUCTURE", 1, min_value=1, max_value=3)
TELEGRAM_ALLOW_STRUCTURE_PLUS_EXECUTION = _env_bool("TELEGRAM_ALLOW_STRUCTURE_PLUS_EXECUTION", True)
TELEGRAM_BLOCK_SINGLE_TRIGGER = _env_bool("TELEGRAM_BLOCK_SINGLE_TRIGGER", True)
TELEGRAM_ALLOWED_GRADES = {item.upper() for item in _env_csv("TELEGRAM_ALLOWED_GRADES", ["A", "A+"])}
TELEGRAM_REQUIRE_PREMIUM = _env_bool("TELEGRAM_REQUIRE_PREMIUM", True)
TELEGRAM_REQUIRE_QUALITY_PASSED = _env_bool("TELEGRAM_REQUIRE_QUALITY_PASSED", True)

# S4.14B-2 semantic split:
# - structure triggers describe the pattern that is forming; they are not enough
#   for Telegram by themselves. Example: lower_high_5m.
# - execution confirmations confirm that the idea is actionable. Example:
#   ema20_loss_5m or vwap_rejection_5m.
STRUCTURE_TRIGGER_SET = {
    item.strip().lower()
    for item in _env_csv(
        "TELEGRAM_STRUCTURE_TRIGGERS",
        [
            "lower_high_5m",
            "failed_hod_reclaim_5m",
            "failed_breakout_5m",
            "opening_drive_failure_5m",
            "reclaim_failed_5m",
        ],
    )
}

EXECUTION_CONFIRMATION_TRIGGER_SET = {
    item.strip().lower()
    for item in _env_csv(
        "TELEGRAM_EXECUTION_CONFIRMATION_TRIGGERS",
        [
            "ema20_loss_5m",
            "vwap_rejection_5m",
            "breakdown_confirmation_5m",
            "high_volume_reversal_5m",
            "liquidity_rejection_5m",
            "volume_exhaustion_5m",
        ],
    )
}

# Backward-compatible alias. From S4.14B-2 onward this means execution
# confirmations only; structure triggers are reported separately.
STRONG_CONFIRMATION_TRIGGERS = EXECUTION_CONFIRMATION_TRIGGER_SET


def _clean_key_part(value: Any, fallback: str = "na") -> str:
    text = str(value or fallback).strip().lower()
    cleaned = []
    for char in text:
        if char.isalnum() or char in {"_", "-"}:
            cleaned.append(char)
        elif char in {" ", ":", "/", "."}:
            cleaned.append("-")
    result = "".join(cleaned).strip("-")
    return result or fallback


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        normalized = text.replace("Z", "+00:00").replace(" UTC", "+00:00")
        if len(normalized) >= 19 and "T" not in normalized and "+" not in normalized[10:] and "-" not in normalized[10:]:
            normalized = normalized.replace(" ", "T", 1)
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def resolve_session_date(signal: dict[str, Any]) -> str:
    session_date = str(signal.get("sessionDate") or "").strip()
    if len(session_date) >= 10:
        return session_date[:10]
    dt = _parse_dt(signal.get("triggerTime") or signal.get("createdAt") or signal.get("storedAt"))
    if dt:
        return dt.date().isoformat()
    return datetime.now(timezone.utc).date().isoformat()


def resolve_trigger_bucket(signal: dict[str, Any], bucket_minutes: int = TELEGRAM_EVENT_BUCKET_MINUTES) -> str:
    dt = _parse_dt(signal.get("triggerTime") or signal.get("createdAt") or signal.get("storedAt"))
    if dt is None:
        dt = datetime.now(timezone.utc)
    bucket_minutes = max(5, int(bucket_minutes or 60))
    total_minutes = dt.hour * 60 + dt.minute
    bucket_start = (total_minutes // bucket_minutes) * bucket_minutes
    hour = bucket_start // 60
    minute = bucket_start % 60
    bucket = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return bucket.strftime("%Y%m%dT%H%MZ")


def telegram_delivered_key(signal_id: str) -> str:
    clean = str(signal_id or "").strip()
    return f"engine:telegram_delivered:{clean}"


def telegram_event_delivered_key(event_key: str) -> str:
    clean = str(event_key or "").strip()
    return f"engine:telegram_event_delivered:{clean}"


def get_cached_telegram_payload() -> dict[str, Any]:
    payload = runtime_cache.get_json("engine:telegram_signals")
    if isinstance(payload, dict):
        return payload
    return {
        "reason": "cache_empty",
        "publishedAt": None,
        "storageVersion": "s412_runtime_cache_v1",
        "count": 0,
        "items": [],
    }


def get_signal_id(item: dict[str, Any]) -> str:
    return str(item.get("signalId") or item.get("id") or "").strip()


def get_signal_score(signal: dict[str, Any]) -> float:
    try:
        return float(signal.get("signalScore") if signal.get("signalScore") is not None else 0)
    except Exception:
        return 0.0


def get_triggers(signal: dict[str, Any]) -> list[str]:
    raw = signal.get("triggers")
    if isinstance(raw, list):
        triggers = [str(item).strip() for item in raw if str(item).strip()]
    elif raw:
        triggers = [str(raw).strip()]
    else:
        triggers = []
    primary = str(signal.get("primaryTrigger") or "").strip()
    if primary and primary not in triggers:
        triggers.insert(0, primary)
    return triggers


def classify_notification_event(signal: dict[str, Any]) -> dict[str, Any]:
    """Return the semantic event identity used for smart dedupe.

    S4.14B only emits NEW_ELITE_SIGNAL events. S4.15 will add lifecycle
    events such as TP1_HIT, INVALIDATED, STOP_HIT, REDUCE_RISK and TIMED_EXIT.
    The event key intentionally is not one-symbol-per-day. It is one unique
    alert event per setup/trigger bucket. Later, lifecycle close/invalidated
    state can reopen a new event on the same ticker.
    """

    symbol = str(signal.get("symbol") or "UNKNOWN").upper().strip()
    setup_slug = str(signal.get("setupSlug") or "setup").strip()
    direction = str(signal.get("direction") or "na").upper().strip()
    session_date = resolve_session_date(signal)
    triggers = get_triggers(signal)
    primary_trigger = triggers[0] if triggers else str(signal.get("primaryTrigger") or "confirmation")
    trigger_bucket = resolve_trigger_bucket(signal)

    event_type = "NEW_ELITE_SIGNAL"
    event_key = "|".join(
        [
            event_type,
            _clean_key_part(symbol),
            _clean_key_part(setup_slug),
            _clean_key_part(direction),
            _clean_key_part(session_date),
            _clean_key_part(primary_trigger),
            _clean_key_part(trigger_bucket),
        ]
    )
    return {
        "eventType": event_type,
        "eventKey": event_key,
        "symbol": symbol,
        "setupSlug": setup_slug,
        "direction": direction,
        "sessionDate": session_date,
        "primaryTrigger": primary_trigger,
        "triggerBucket": trigger_bucket,
        "bucketMinutes": TELEGRAM_EVENT_BUCKET_MINUTES,
    }


def evaluate_telegram_quality_firewall(signal: dict[str, Any]) -> dict[str, Any]:
    """Final S4.14B firewall before Telegram.

    This does not replace the trading engine. It prevents Telegram from acting
    as the main trading UI by sending only high-quality NEW_ELITE_SIGNAL alerts.
    Full context belongs to the upcoming AI Signal Cockpit page.
    """

    reasons: list[str] = []
    passed = True

    status = str(signal.get("status") or "").upper().strip()
    if status != "ACTIVE":
        passed = False
        reasons.append("status_not_ACTIVE")

    if signal.get("telegramEligible") is not True:
        passed = False
        reasons.append("telegramEligible_not_true")

    if TELEGRAM_REQUIRE_PREMIUM and signal.get("premiumSignal") is not True:
        passed = False
        reasons.append("premiumSignal_not_true")

    quality_status = str(signal.get("qualityStatus") or "").upper().strip()
    if TELEGRAM_REQUIRE_QUALITY_PASSED and quality_status != "PASSED":
        passed = False
        reasons.append("qualityStatus_not_PASSED")

    score = get_signal_score(signal)
    if score < TELEGRAM_MIN_SIGNAL_SCORE:
        passed = False
        reasons.append(f"score_below_{TELEGRAM_MIN_SIGNAL_SCORE:g}")

    grade = str(signal.get("signalGrade") or "").upper().strip()
    if TELEGRAM_ALLOWED_GRADES and grade not in TELEGRAM_ALLOWED_GRADES:
        passed = False
        reasons.append("grade_not_allowed")

    triggers = get_triggers(signal)
    normalized_triggers = [item.lower() for item in triggers]
    structure_triggers = [item for item in normalized_triggers if item in STRUCTURE_TRIGGER_SET]
    execution_confirmations = [item for item in normalized_triggers if item in EXECUTION_CONFIRMATION_TRIGGER_SET]
    unique_structure = sorted(set(structure_triggers))
    unique_execution = sorted(set(execution_confirmations))
    has_structure = len(unique_structure) > 0
    execution_count = len(unique_execution)
    pure_execution_rule = execution_count >= TELEGRAM_MIN_EXECUTION_CONFIRMATIONS
    structure_plus_execution_rule = (
        TELEGRAM_ALLOW_STRUCTURE_PLUS_EXECUTION
        and has_structure
        and execution_count >= TELEGRAM_MIN_EXECUTION_WITH_STRUCTURE
    )
    confirmation_rule_passed = bool(pure_execution_rule or structure_plus_execution_rule)

    if TELEGRAM_BLOCK_SINGLE_TRIGGER and len(normalized_triggers) <= 1:
        passed = False
        reasons.append("single_trigger_blocked")

    if not confirmation_rule_passed:
        passed = False
        if has_structure and execution_count <= 0:
            reasons.append("execution_confirmation_missing")
        else:
            reasons.append("execution_confirmations_below_policy")

    rr1 = signal.get("rrToTp1")
    try:
        rr1_float = float(rr1) if rr1 is not None else 0.0
    except Exception:
        rr1_float = 0.0
    if rr1_float and rr1_float < 2:
        passed = False
        reasons.append("rrToTp1_below_2R")

    return {
        "passed": bool(passed),
        "reasons": reasons,
        "score": score,
        "grade": grade,
        "triggers": triggers,
        "structureTriggers": unique_structure,
        "executionConfirmations": unique_execution,
        "executionConfirmationCount": len(unique_execution),
        "confirmationRulePassed": confirmation_rule_passed,
        # Backward-compatible fields used by earlier PowerShell checks.
        # From S4.14B-2 these are execution confirmations only.
        "strongConfirmations": unique_execution,
        "strongConfirmationCount": len(unique_execution),
        "policy": {
            "minScore": TELEGRAM_MIN_SIGNAL_SCORE,
            "allowedGrades": sorted(TELEGRAM_ALLOWED_GRADES),
            "minExecutionConfirmations": TELEGRAM_MIN_EXECUTION_CONFIRMATIONS,
            "minExecutionWithStructure": TELEGRAM_MIN_EXECUTION_WITH_STRUCTURE,
            "allowStructurePlusExecution": TELEGRAM_ALLOW_STRUCTURE_PLUS_EXECUTION,
            "blockSingleTrigger": TELEGRAM_BLOCK_SINGLE_TRIGGER,
            "bestOfLimit": TELEGRAM_QUEUE_BEST_OF_LIMIT,
            "eventBucketMinutes": TELEGRAM_EVENT_BUCKET_MINUTES,
        },
    }


def build_telegram_message_preview(signal: dict[str, Any], event: dict[str, Any] | None = None, firewall: dict[str, Any] | None = None) -> str:
    symbol = str(signal.get("symbol") or "?").upper()
    setup_name = signal.get("setupName") or signal.get("setupSlug") or "Setup"
    direction = str(signal.get("direction") or "?").upper()
    grade = signal.get("signalGrade") or "?"
    score = signal.get("signalScore")
    entry = signal.get("entry")
    stop = signal.get("stop")
    targets = signal.get("targets") if isinstance(signal.get("targets"), list) else []
    tp1 = targets[0].get("price") if len(targets) > 0 and isinstance(targets[0], dict) else None
    tp2 = targets[1].get("price") if len(targets) > 1 and isinstance(targets[1], dict) else None
    rr1 = signal.get("rrToTp1")
    rr2 = signal.get("rrToTp2")
    created_at = signal.get("createdAt") or signal.get("triggerTime") or ""

    if isinstance(firewall, dict):
        structure = firewall.get("structureTriggers") if isinstance(firewall.get("structureTriggers"), list) else []
        confirmations = firewall.get("executionConfirmations") if isinstance(firewall.get("executionConfirmations"), list) else []
    else:
        structure = []
        confirmations = []

    if not structure or not confirmations:
        raw_triggers = get_triggers(signal)
        normalized = [str(item).lower() for item in raw_triggers]
        structure = structure or sorted({item for item in normalized if item in STRUCTURE_TRIGGER_SET})
        confirmations = confirmations or sorted({item for item in normalized if item in EXECUTION_CONFIRMATION_TRIGGER_SET})

    structure_text = ", ".join(str(x) for x in structure[:4]) if structure else "setup structure"
    confirmation_text = ", ".join(str(x) for x in confirmations[:4]) if confirmations else "execution confirmation"

    lines = [
        f"SkillEdge AI Alert: {symbol} {direction}",
        f"Setup: {setup_name}",
        f"Grade: {grade}" + (f" / Score: {score}" if score is not None else ""),
        "Status: ACTIVE / Elite idea",
        "",
        f"Entry: {entry}",
        f"Stop: {stop}",
        f"TP1: {tp1}" + (f" ({rr1}R)" if rr1 is not None else ""),
        f"TP2: {tp2}" + (f" ({rr2}R)" if rr2 is not None else ""),
        "",
        f"Structure: {structure_text}",
        f"Confirmations: {confirmation_text}",
    ]
    if created_at:
        lines.append(f"Time: {created_at}")
    lines.extend([
        "",
        "Open AI Signal Cockpit for chart, levels and management.",
        "Risk first. Not financial advice.",
    ])
    return "\n".join(lines)


def read_delivered_record(signal_id: str) -> dict[str, Any] | None:
    if not signal_id:
        return None
    record = runtime_cache.get_json(telegram_delivered_key(signal_id))
    return record if isinstance(record, dict) else None


def read_delivered_event_record(event_key: str) -> dict[str, Any] | None:
    if not event_key:
        return None
    record = runtime_cache.get_json(telegram_event_delivered_key(event_key))
    return record if isinstance(record, dict) else None


def load_delivered_index() -> dict[str, Any]:
    index = runtime_cache.get_json(TELEGRAM_DELIVERED_INDEX_KEY)
    if isinstance(index, dict):
        items = index.get("items") if isinstance(index.get("items"), list) else []
        index["items"] = items[-500:]
        return index
    return {
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "items": [],
    }


def load_delivered_event_index() -> dict[str, Any]:
    index = runtime_cache.get_json(TELEGRAM_EVENT_DELIVERED_INDEX_KEY)
    if isinstance(index, dict):
        items = index.get("items") if isinstance(index.get("items"), list) else []
        index["items"] = items[-500:]
        return index
    return {
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "items": [],
    }


def save_delivered_index(record: dict[str, Any], ttl_seconds: int = 172800) -> dict[str, Any]:
    index = load_delivered_index()
    items = index.get("items") if isinstance(index.get("items"), list) else []
    signal_id = str(record.get("signalId") or "")
    items = [item for item in items if str(item.get("signalId") or "") != signal_id]
    compact = {
        "signalId": signal_id,
        "notificationEventKey": record.get("notificationEventKey"),
        "notificationEventType": record.get("notificationEventType"),
        "symbol": record.get("symbol"),
        "setupSlug": record.get("setupSlug"),
        "sessionDate": record.get("sessionDate"),
        "channel": record.get("channel"),
        "messageId": record.get("messageId"),
        "deliveryStatus": record.get("deliveryStatus"),
        "deliveredAt": record.get("deliveredAt"),
    }
    items.append(compact)
    index = {
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items[-500:]),
        "items": items[-500:],
    }
    runtime_cache.set_json(TELEGRAM_DELIVERED_INDEX_KEY, index, ttl_seconds=ttl_seconds)
    return index


def save_delivered_event_index(record: dict[str, Any], ttl_seconds: int = 172800) -> dict[str, Any]:
    index = load_delivered_event_index()
    items = index.get("items") if isinstance(index.get("items"), list) else []
    event_key = str(record.get("notificationEventKey") or "")
    items = [item for item in items if str(item.get("notificationEventKey") or "") != event_key]
    compact = {
        "notificationEventKey": event_key,
        "notificationEventType": record.get("notificationEventType"),
        "signalId": record.get("signalId"),
        "symbol": record.get("symbol"),
        "setupSlug": record.get("setupSlug"),
        "direction": record.get("direction"),
        "sessionDate": record.get("sessionDate"),
        "triggerBucket": record.get("triggerBucket"),
        "channel": record.get("channel"),
        "messageId": record.get("messageId"),
        "deliveryStatus": record.get("deliveryStatus"),
        "deliveredAt": record.get("deliveredAt"),
    }
    items.append(compact)
    index = {
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items[-500:]),
        "items": items[-500:],
    }
    runtime_cache.set_json(TELEGRAM_EVENT_DELIVERED_INDEX_KEY, index, ttl_seconds=ttl_seconds)
    return index


def mark_signal_delivered(
    signal: dict[str, Any] | None = None,
    signal_id: str | None = None,
    channel: str = "telegram",
    message_id: str | None = None,
    ttl_seconds: int = 172800,
    dry_run: bool = False,
    notification_event_key: str | None = None,
    notification_event_type: str | None = None,
) -> dict[str, Any]:
    signal = signal if isinstance(signal, dict) else {}
    resolved_signal_id = str(signal_id or get_signal_id(signal) or "").strip()
    if not resolved_signal_id:
        return {
            "ok": False,
            "error": "missing_signal_id",
            "storageVersion": TELEGRAM_DELIVERY_VERSION,
        }

    event = classify_notification_event(signal)
    resolved_event_key = str(notification_event_key or signal.get("notificationEventKey") or event.get("eventKey") or "").strip()
    resolved_event_type = str(notification_event_type or signal.get("notificationEventType") or event.get("eventType") or "NEW_ELITE_SIGNAL").strip()

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "signalId": resolved_signal_id,
        "notificationEventKey": resolved_event_key,
        "notificationEventType": resolved_event_type,
        "symbol": signal.get("symbol"),
        "setupSlug": signal.get("setupSlug"),
        "setupName": signal.get("setupName"),
        "direction": signal.get("direction"),
        "sessionDate": signal.get("sessionDate") or event.get("sessionDate"),
        "triggerBucket": event.get("triggerBucket"),
        "createdAt": signal.get("createdAt"),
        "triggerTime": signal.get("triggerTime"),
        "channel": channel or "telegram",
        "messageId": message_id,
        "deliveryStatus": "DRY_RUN" if dry_run else "DELIVERED",
        "deliveredAt": now_iso,
        "ttlSeconds": ttl_seconds,
    }
    ok_signal = runtime_cache.set_json(telegram_delivered_key(resolved_signal_id), record, ttl_seconds=ttl_seconds)
    ok_event = True
    if resolved_event_key:
        ok_event = runtime_cache.set_json(telegram_event_delivered_key(resolved_event_key), record, ttl_seconds=ttl_seconds)
    index = save_delivered_index(record, ttl_seconds=ttl_seconds) if ok_signal else load_delivered_index()
    event_index = save_delivered_event_index(record, ttl_seconds=ttl_seconds) if ok_event and resolved_event_key else load_delivered_event_index()
    return {
        "ok": bool(ok_signal and ok_event),
        "record": record,
        "indexCount": index.get("count"),
        "eventIndexCount": event_index.get("count"),
        "key": telegram_delivered_key(resolved_signal_id),
        "eventKey": telegram_event_delivered_key(resolved_event_key) if resolved_event_key else None,
        "cache": runtime_cache.get_status(),
    }


def build_telegram_delivery_queue(limit: int = 25, include_delivered: bool = False, include_rejected: bool = False) -> dict[str, Any]:
    payload = get_cached_telegram_payload()
    cached_items = payload.get("items") if isinstance(payload.get("items"), list) else []
    pending_candidates: list[dict[str, Any]] = []
    delivered: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []

    for item in cached_items:
        if not isinstance(item, dict):
            continue
        signal_id = get_signal_id(item)
        if not signal_id:
            invalid.append({"reason": "missing_signal_id", "item": item})
            continue

        event = classify_notification_event(item)
        firewall = evaluate_telegram_quality_firewall(item)
        delivered_record = read_delivered_event_record(event.get("eventKey") or "") or read_delivered_record(signal_id)
        compact = {
            "signalId": signal_id,
            "notificationEventType": event.get("eventType"),
            "notificationEventKey": event.get("eventKey"),
            "notificationEvent": event,
            "telegramQualityFirewall": firewall,
            "symbol": item.get("symbol"),
            "setupSlug": item.get("setupSlug"),
            "setupName": item.get("setupName"),
            "direction": item.get("direction"),
            "status": item.get("status"),
            "entry": item.get("entry"),
            "stop": item.get("stop"),
            "targets": item.get("targets"),
            "rrToTp1": item.get("rrToTp1"),
            "rrToTp2": item.get("rrToTp2"),
            "signalScore": item.get("signalScore"),
            "signalGrade": item.get("signalGrade"),
            "premiumSignal": item.get("premiumSignal"),
            "primaryTrigger": item.get("primaryTrigger"),
            "triggers": item.get("triggers"),
            "createdAt": item.get("createdAt"),
            "triggerTime": item.get("triggerTime"),
            "sessionDate": item.get("sessionDate") or event.get("sessionDate"),
            "telegramEligible": item.get("telegramEligible"),
            "qualityStatus": item.get("qualityStatus"),
            "messagePreview": build_telegram_message_preview(item, event=event, firewall=firewall),
        }

        if not firewall.get("passed"):
            compact["rejected"] = True
            rejected.append(compact)
            continue

        if delivered_record:
            compact["delivered"] = True
            compact["deliveredRecord"] = delivered_record
            delivered.append(compact)
        else:
            compact["delivered"] = False
            pending_candidates.append(compact)

    # Best-of Telegram queue: highest score first, newest as tie-breaker.
    pending_candidates = sorted(
        pending_candidates,
        key=lambda item: (
            float(item.get("signalScore") or 0),
            str(item.get("triggerTime") or item.get("createdAt") or ""),
        ),
        reverse=True,
    )
    requested_limit = max(1, min(int(limit or 25), 100))
    effective_limit = min(requested_limit, TELEGRAM_QUEUE_BEST_OF_LIMIT)
    capped_pending = pending_candidates[:effective_limit]

    return {
        "ok": True,
        "sourceKey": "engine:telegram_signals",
        "sourcePublishedAt": payload.get("publishedAt"),
        "cachedCount": len(cached_items),
        "pendingCount": len(pending_candidates),
        "deliveredCount": len(delivered),
        "rejectedCount": len(rejected),
        "invalidCount": len(invalid),
        "requestedLimit": requested_limit,
        "effectiveLimit": effective_limit,
        "items": capped_pending,
        "delivered": delivered if include_delivered else [],
        "rejected": rejected if include_rejected else [],
        "deliveredIndex": load_delivered_index(),
        "deliveredEventIndex": load_delivered_event_index(),
        "notificationPolicy": {
            "version": TELEGRAM_DELIVERY_VERSION,
            "model": "smart_events_elite_firewall_semantics",
            "eventTypesEnabled": ["NEW_ELITE_SIGNAL"],
            "futureEventTypes": ["TP1_HIT", "TP2_HIT", "STOP_HIT", "INVALIDATED", "REDUCE_RISK", "PROFIT_SAVE", "TIMED_EXIT", "SESSION_CLOSE"],
            "smartDedupe": "notificationEventKey",
            "eventBucketMinutes": TELEGRAM_EVENT_BUCKET_MINUTES,
            "bestOfLimit": TELEGRAM_QUEUE_BEST_OF_LIMIT,
        },
        "cache": runtime_cache.get_status(),
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


def load_persistent_outcome_items(limit: int = 5000) -> list[dict[str, Any]]:
    """Load outcome dataset from durable DB, with runtime memory as fallback."""

    items = db.load_outcomes(limit=limit)
    if items:
        return items
    return list(BACKTEST_OUTCOMES.values())


def restore_outcomes_from_db(limit: int = 5000) -> dict[str, Any]:
    items = db.load_outcomes(limit=limit)
    BACKTEST_OUTCOMES.clear()
    for item in items:
        signal_id = item.get("signalId")
        if signal_id:
            BACKTEST_OUTCOMES[str(signal_id)] = item
    return {
        "loaded": len(items),
        "runtimeOutcomeCount": len(BACKTEST_OUTCOMES),
        "database": db.get_status(),
    }


def default_session_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def build_signal_map_from_items(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    mapped: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        key = str(
            item.get("storageKey")
            or item.get("signalId")
            or f"persisted_signal_{index}"
        )
        mapped[key] = item
    return mapped


def load_persisted_outcome_source_signals(
    *,
    session_date: str | None = None,
    limit: int = 500,
    telegram_only: bool = True,
    premium_only: bool = True,
) -> list[dict[str, Any]]:
    return db.load_outcome_source_signals(
        session_date=session_date or default_session_date(),
        limit=limit,
        telegram_only=telegram_only,
        premium_only=premium_only,
        active_only=True,
        quality_status="PASSED",
    )


def select_outcome_signal_source(
    *,
    source: str = "auto",
    session_date: str | None = None,
    limit: int = 500,
    telegram_only: bool = True,
    premium_only: bool = True,
) -> tuple[str, dict[str, dict[str, Any]], dict[str, Any]]:
    """Select runtime ACTIVE or durable DB signals for outcome evaluation.

    Runtime ACTIVE is fast while the process is alive. Persisted signals keep the
    Holly-like outcome loop alive after a server restart. Default `auto` uses
    runtime ACTIVE when available, otherwise falls back to SQLite signal_records.
    """

    normalized_source = str(source or "auto").lower().strip()
    chosen_session_date = session_date or default_session_date()

    persisted_items = load_persisted_outcome_source_signals(
        session_date=chosen_session_date,
        limit=limit,
        telegram_only=telegram_only,
        premium_only=premium_only,
    )
    persisted_map = build_signal_map_from_items(persisted_items)

    runtime_map = dict(ACTIVE)

    if normalized_source in {"runtime", "active", "runtime_active"}:
        return "runtime_active", runtime_map, {
            "sessionDate": chosen_session_date,
            "runtimeActiveCount": len(runtime_map),
            "persistedEligibleCount": len(persisted_map),
        }

    if normalized_source in {"persisted", "db", "database", "sqlite"}:
        return "persisted_signal_records", persisted_map, {
            "sessionDate": chosen_session_date,
            "runtimeActiveCount": len(runtime_map),
            "persistedEligibleCount": len(persisted_map),
        }

    if runtime_map:
        return "runtime_active", runtime_map, {
            "sessionDate": chosen_session_date,
            "runtimeActiveCount": len(runtime_map),
            "persistedEligibleCount": len(persisted_map),
            "autoSelected": "runtime_active",
        }

    return "persisted_signal_records", persisted_map, {
        "sessionDate": chosen_session_date,
        "runtimeActiveCount": len(runtime_map),
        "persistedEligibleCount": len(persisted_map),
        "autoSelected": "persisted_signal_records",
    }


@app.get("/health")
def health():
    return build_engine_status()


@app.get("/engine/status")
def engine_status():
    return {
        **build_engine_status(),
        "runtime": {
            "mode": "foundation",
            "description": "Persistent stock engine foundation is running. Discovery, WATCH and ARMED setup foundation are available.",
        },
    }


@app.get("/engine/registry")
def engine_registry():
    return {
        "startedAt": ENGINE_STARTED_AT.isoformat(),
        "watchCount": len(WATCHLIST),
        "armedCount": len(ARMED),
        "activeCount": len(ACTIVE),
        "signalCount": len(SIGNALS),
        "telegramEligibleSignalCount": sum(1 for item in SIGNALS.values() if item.get("telegramEligible") is True),
        "watchlist": list(WATCHLIST.keys())[:20],
        "armed": list(ARMED.keys())[:20],
        "active": list(ACTIVE.keys())[:20],
        "signals": list(SIGNALS.keys())[:20],
        "backtestOutcomeCount": len(BACKTEST_OUTCOMES),
        "persistentDatabase": db.get_status(),
        "runtimeCache": runtime_cache.get_status(),
    }


@app.get("/engine/cache/status")
def engine_cache_status():
    return {
        "ok": True,
        **runtime_cache.get_status(),
        "runtime": {
            "watchCount": len(_s416_watchlist_items()),
            "armedCount": len(_s416_armed_items()),
            "activeCount": len(_s416_active_items()),
            "signalCount": len(_s416_signal_items()),
            "telegramEligibleSignalCount": sum(1 for item in SIGNALS.values() if item.get("telegramEligible") is True),
        },
    }


@app.post("/engine/cache/publish")
def engine_cache_publish(ttl_seconds: int = 900):
    store_active_signals()
    return {
        "ok": True,
        "publish": publish_runtime_cache(reason="manual_api_publish", ttl_seconds=ttl_seconds),
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/cache/{cache_name}")
def engine_cache_get(cache_name: str):
    allowed = {
        "runtime": "engine:runtime_status",
        "watchlist": "engine:watchlist",
        "armed": "engine:armed",
        "active": "engine:active",
        "signals": "engine:signals",
        "telegram": "engine:telegram_signals",
        "lifecycle": "engine:lifecycle",
        "cockpit": "engine:signal_cockpit",
    }
    key = allowed.get(str(cache_name or "").lower().strip())
    if not key:
        return {
            "ok": False,
            "error": "unknown_cache_name",
            "allowed": sorted(allowed.keys()),
            "cache": runtime_cache.get_status(),
        }
    value = runtime_cache.get_json(key)
    return {
        "ok": value is not None,
        "cacheName": cache_name,
        "key": key,
        "value": value,
        "cache": runtime_cache.get_status(),
    }



@app.get("/engine/telegram/delivery/queue")
def engine_telegram_delivery_queue(limit: int = 25, include_delivered: bool = False, include_rejected: bool = False):
    return build_telegram_delivery_queue(limit=limit, include_delivered=include_delivered, include_rejected=include_rejected)


@app.get("/engine/telegram/delivery/delivered")
def engine_telegram_delivery_delivered():
    return {
        "ok": True,
        "index": load_delivered_index(),
        "eventIndex": load_delivered_event_index(),
        "cache": runtime_cache.get_status(),
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
    }


@app.post("/engine/telegram/delivery/mark")
def engine_telegram_delivery_mark(
    signal_id: str,
    channel: str = "telegram",
    message_id: str | None = None,
    ttl_seconds: int = 172800,
    dry_run: bool = False,
    notification_event_key: str | None = None,
    notification_event_type: str | None = None,
):
    payload = get_cached_telegram_payload()
    cached_items = payload.get("items") if isinstance(payload.get("items"), list) else []
    signal = next((item for item in cached_items if isinstance(item, dict) and get_signal_id(item) == signal_id), {})
    if isinstance(signal, dict):
        if notification_event_key:
            signal["notificationEventKey"] = notification_event_key
        if notification_event_type:
            signal["notificationEventType"] = notification_event_type
    result = mark_signal_delivered(
        signal=signal,
        signal_id=signal_id,
        channel=channel,
        message_id=message_id,
        ttl_seconds=ttl_seconds,
        dry_run=dry_run,
        notification_event_key=notification_event_key,
        notification_event_type=notification_event_type,
    )
    return {
        "ok": bool(result.get("ok")),
        "result": result,
        "queue": build_telegram_delivery_queue(limit=25, include_delivered=False),
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
    }


@app.post("/engine/telegram/delivery/mark-batch")
def engine_telegram_delivery_mark_batch(
    limit: int = 25,
    channel: str = "telegram",
    ttl_seconds: int = 172800,
    dry_run: bool = True,
):
    # Safety default: dry_run=True. This is useful for testing the dedupe guard
    # without pretending that Telegram messages were really sent.
    queue = build_telegram_delivery_queue(limit=limit, include_delivered=False)
    marked: list[dict[str, Any]] = []
    for item in queue.get("items", []):
        if not isinstance(item, dict):
            continue
        marked.append(
            mark_signal_delivered(
                signal=item,
                signal_id=item.get("signalId"),
                channel=channel,
                ttl_seconds=ttl_seconds,
                dry_run=dry_run,
                notification_event_key=item.get("notificationEventKey"),
                notification_event_type=item.get("notificationEventType"),
            )
        )
    return {
        "ok": True,
        "dryRun": dry_run,
        "requestedLimit": limit,
        "markedCount": sum(1 for item in marked if item.get("ok")),
        "items": marked,
        "queueAfter": build_telegram_delivery_queue(limit=limit, include_delivered=False),
        "cache": runtime_cache.get_status(),
        "storageVersion": TELEGRAM_DELIVERY_VERSION,
    }


@app.get("/engine/db/status")
def engine_db_status():
    return {
        "ok": True,
        **db.get_status(),
        "runtime": {
            "watchCount": len(_s416_watchlist_items()),
            "armedCount": len(_s416_armed_items()),
            "activeCount": len(_s416_active_items()),
            "signalCount": len(_s416_signal_items()),
            "backtestOutcomeCount": len(BACKTEST_OUTCOMES),
        },
        "runtimeCache": runtime_cache.get_status(),
    }



@app.post("/engine/db/sync-to-supabase")
def engine_db_sync_to_supabase(signal_limit: int = 50000, outcome_limit: int = 50000):
    return {
        "ok": True,
        "endpoint": "/engine/db/sync-to-supabase",
        "sync": db.sync_sqlite_to_supabase(signal_limit=signal_limit, outcome_limit=outcome_limit),
        "database": db.get_status(),
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }

@app.post("/engine/outcomes/reload")
def engine_outcomes_reload(limit: int = 5000):
    return {
        "ok": True,
        **restore_outcomes_from_db(limit=limit),
        "endpoint": "/engine/outcomes/reload",
    }


@app.get("/engine/signals/history")
def engine_signals_history(limit: int = 100, premium_only: bool = False, telegram_only: bool = False):
    items = db.load_signals(limit=limit, premium_only=premium_only, telegram_only=telegram_only)
    return {
        "ok": True,
        "count": len(items),
        "limit": limit,
        "premiumOnly": premium_only,
        "telegramOnly": telegram_only,
        "items": items,
        "storageVersion": "s410_supabase_sqlite_persistence_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/watchlist")
def engine_watchlist():
    top = sorted(
        WATCHLIST.values(),
        key=lambda item: int(item.get("inPlayScore") or 0),
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(top),
        "items": top[:100],
    }


@app.get("/engine/armed")
def engine_armed():
    top = sorted(
        ARMED.values(),
        key=lambda item: int(item.get("confidence") or 0),
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(top),
        "items": top[:100],
    }


@app.get("/debug/fmp/movers")
async def debug_fmp_movers():
    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    gainers = await client.get_biggest_gainers()
    losers = await client.get_biggest_losers()
    active = await client.get_most_active()

    return {
        "ok": True,
        "counts": {
            "gainers": len(gainers),
            "losers": len(losers),
            "active": len(active),
        },
        "sample": {
            "gainers": gainers[:3],
            "losers": losers[:3],
            "active": active[:3],
        },
    }


@app.get("/debug/fmp/first-row")
async def debug_fmp_first_row():
    client = FmpClient()
    gainers = await client.get_biggest_gainers()

    if not gainers:
        return {
            "ok": False,
            "error": "no gainers",
        }

    return {
        "ok": True,
        "row": gainers[0],
    }

@app.get("/debug/candles-raw/{symbol}")
async def debug_candles_raw(symbol: str, interval: str = "1min"):
    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    return {
        "ok": True,
        **await client.debug_intraday_candles(symbol, interval=interval),
    }

@app.get("/debug/fmp/{symbol}")
async def debug_fmp_symbol(symbol: str, interval: str = "1min") -> dict[str, Any]:
    client = FmpClient()
    return await client.debug_intraday_candles(symbol, interval)

@app.get("/debug/candles/{symbol}")
async def debug_candles(symbol: str, interval: str = "1min"):
    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    rows = await client.get_intraday_candles(symbol, interval=interval)
    rows = sorted(rows, key=lambda item: str(item.get("date") or item.get("timestamp") or ""))
    snapshot = build_session_snapshot(rows)

    return {
        "ok": True,
        "symbol": symbol.upper(),
        "interval": interval,
        "rawCount": len(rows),
        "snapshot": snapshot,
        "sample": rows[:5],
        "sampleLast": rows[-5:],
    }


@app.post("/engine/discovery/refresh")
async def engine_discovery_refresh():
    import traceback

    try:
        result = await refresh_discovery_watchlist()
    except Exception as error:
        return {
            "ok": False,
            "storageVersion": "s5_8b_discovery_refresh_safe_diagnostics_v1",
            "stage": "refresh_discovery_watchlist",
            "error": repr(error),
            "tracebackTail": traceback.format_exc().splitlines()[-40:],
            "nextAction": "Copy tracebackTail / API terminal traceback back to ChatGPT. The API stayed alive; $r is now inspectable.",
        }

    result["ok"] = bool(result.get("ok", True))
    result["apiGuard"] = "s5_8b_discovery_refresh_safe_diagnostics_v1"

    try:
        result["signalStorage"] = store_active_signals()
    except Exception as error:
        result["signalStorage"] = {
            "ok": False,
            "stage": "store_active_signals",
            "error": repr(error),
            "tracebackTail": traceback.format_exc().splitlines()[-40:],
        }

    try:
        result["runtimeCache"] = publish_runtime_cache(reason="discovery_refresh")
    except Exception as error:
        result["runtimeCache"] = {
            "ok": False,
            "stage": "publish_runtime_cache",
            "error": repr(error),
            "tracebackTail": traceback.format_exc().splitlines()[-40:],
        }

    return result

@app.get("/engine/active")
def engine_active():
    top = sorted(
        ACTIVE.values(),
        key=lambda item: int(item.get("signalScore") or item.get("confidence") or 0),
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(top),
        "items": top[:100],
    }






@app.get("/engine/signals")
def engine_signals(limit: int = 100, premium_only: bool = False, telegram_only: bool = False):
    store_active_signals()
    items = sorted_signal_items(limit=limit, premium_only=premium_only, telegram_only=telegram_only)
    cache_publish = publish_runtime_cache(reason="signals_endpoint")

    return {
        "ok": True,
        "count": len(SIGNALS),
        "returned": len(items),
        "premiumOnly": premium_only,
        "telegramOnly": telegram_only,
        "items": items,
        "storageVersion": "s410a_signal_storage_v1",
        "runtimeCache": cache_publish,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/signals/premium")
def engine_premium_signals(limit: int = 100):
    store_active_signals()
    items = sorted_signal_items(limit=limit, premium_only=True, telegram_only=False)

    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "storageVersion": "s410a_signal_storage_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/signals/telegram")
def engine_telegram_signals(limit: int = 100):
    store_active_signals()
    items = sorted_signal_items(limit=limit, premium_only=False, telegram_only=True)

    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "storageVersion": "s410a_signal_storage_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.delete("/engine/signals")
def engine_signals_clear():
    cleared = len(SIGNALS)
    SIGNALS.clear()

    return {
        "ok": True,
        "cleared": cleared,
        "count": len(SIGNALS),
        "storageVersion": "s410a_signal_storage_v1",
    }

def store_outcome_dataset(outcomes: list[dict[str, Any]]) -> dict[str, Any]:
    """Upsert evaluated outcomes into the in-memory outcome dataset.

    This is S4.8 foundation storage. It intentionally keeps the latest outcome
    per signalId and does not clear the dataset on every backtest run, so the
    engine can start accumulating statistics during one runtime session.
    Supabase/Postgres persistence will be wired on top of the same shape later.
    """

    stored = 0
    skipped = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for outcome in outcomes:
        if not isinstance(outcome, dict):
            skipped += 1
            continue

        signal_id = outcome.get("signalId")
        if not signal_id:
            skipped += 1
            continue

        item = dict(outcome)
        item["storedAt"] = now_iso
        item["storageVersion"] = "s49_setup_statistics_v1"
        BACKTEST_OUTCOMES[str(signal_id)] = item
        db.upsert_outcome(item)
        stored += 1

    return {
        "stored": stored,
        "skipped": skipped,
        "totalStored": len(BACKTEST_OUTCOMES),
        "database": db.get_status(),
    }


def build_outcome_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    worked = sum(1 for item in items if item.get("status") == "WORKED")
    failed = sum(1 for item in items if item.get("status") == "FAILED")
    open_count = sum(1 for item in items if item.get("status") == "OPEN")
    expired_session = sum(1 for item in items if item.get("status") == "EXPIRED_SESSION")
    invalid = sum(1 for item in items if item.get("status") == "INVALID")
    closed = worked + failed

    result_r_values = [
        float(item.get("resultR"))
        for item in items
        if item.get("status") in {"WORKED", "FAILED"} and isinstance(item.get("resultR"), (int, float))
    ]
    mfe_values = [float(item.get("mfeR")) for item in items if isinstance(item.get("mfeR"), (int, float))]
    mae_values = [float(item.get("maeR")) for item in items if isinstance(item.get("maeR"), (int, float))]

    return {
        "count": len(items),
        "worked": worked,
        "failed": failed,
        "open": open_count,
        "expiredSession": expired_session,
        "invalid": invalid,
        "closed": closed,
        "winRateClosed": round(worked / closed * 100, 2) if closed else None,
        "avgResultRClosed": round(sum(result_r_values) / len(result_r_values), 2) if result_r_values else None,
        "avgMfeR": round(sum(mfe_values) / len(mfe_values), 2) if mfe_values else None,
        "avgMaeR": round(sum(mae_values) / len(mae_values), 2) if mae_values else None,
    }


def build_outcome_summary_by_setup(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for item in items:
        setup_slug = str(item.get("setupSlug") or "unknown")
        grouped.setdefault(setup_slug, []).append(item)

    rows: list[dict[str, Any]] = []
    for setup_slug, setup_items in grouped.items():
        summary = build_outcome_summary(setup_items)
        rows.append(
            {
                "setupSlug": setup_slug,
                **summary,
            }
        )

    return sorted(rows, key=lambda row: int(row.get("count") or 0), reverse=True)



def safe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace("%", "").replace(",", "").strip())
        except ValueError:
            return None
    return None


def average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def pct(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 2) if whole else None


def value_bucket(value: Any, fallback: str = "unknown") -> str:
    raw = str(value or "").strip()
    return raw if raw else fallback


def build_bucket_stats(items: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for item in items:
        grouped.setdefault(value_bucket(item.get(key)), []).append(item)

    rows: list[dict[str, Any]] = []
    for bucket, bucket_items in grouped.items():
        summary = build_outcome_summary(bucket_items)
        rows.append({key: bucket, **summary})

    return sorted(rows, key=lambda row: int(row.get("count") or 0), reverse=True)


def build_outcome_statistics(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Build S4.9 setup statistics from stored outcomes.

    S4.8 stores the outcome dataset. S4.9 turns that dataset into useful
    calibration numbers: TP hit rate, stop rate, avg R, MFE/MAE, grade stats,
    quality status stats and Telegram-eligible stats. This is still runtime
    storage, but the response shape is ready for Supabase/Postgres later.
    """

    total = len(items)
    closed_items = [item for item in items if item.get("status") in {"WORKED", "FAILED"}]
    worked_items = [item for item in items if item.get("status") == "WORKED"]
    failed_items = [item for item in items if item.get("status") == "FAILED"]
    expired_items = [item for item in items if item.get("status") == "EXPIRED_SESSION"]
    open_items = [item for item in items if item.get("status") == "OPEN"]
    invalid_items = [item for item in items if item.get("status") == "INVALID"]

    tp1_items = [item for item in items if item.get("tp1Hit") is True]
    tp2_items = [item for item in items if item.get("tp2Hit") is True]
    stop_items = [item for item in items if item.get("stopHit") is True]

    result_r_values = [
        value
        for item in closed_items
        if (value := safe_float(item.get("resultR"))) is not None
    ]
    mfe_values = [
        value
        for item in items
        if (value := safe_float(item.get("mfeR"))) is not None
    ]
    mae_values = [
        value
        for item in items
        if (value := safe_float(item.get("maeR"))) is not None
    ]

    telegram_items = [item for item in items if item.get("telegramEligible") is True]
    premium_items = [item for item in items if item.get("premiumSignal") is True]

    return {
        "count": total,
        "closed": len(closed_items),
        "worked": len(worked_items),
        "failed": len(failed_items),
        "open": len(open_items),
        "expiredSession": len(expired_items),
        "invalid": len(invalid_items),
        "winRateClosed": pct(len(worked_items), len(closed_items)),
        "tp1HitRateAll": pct(len(tp1_items), total),
        "tp1HitRateClosed": pct(len(tp1_items), len(closed_items)),
        "tp2HitRateAll": pct(len(tp2_items), total),
        "tp2HitRateClosed": pct(len(tp2_items), len(closed_items)),
        "stopRateAll": pct(len(stop_items), total),
        "stopRateClosed": pct(len(stop_items), len(closed_items)),
        "expiredRateAll": pct(len(expired_items), total),
        "avgResultRClosed": average(result_r_values),
        "avgMfeR": average(mfe_values),
        "avgMaeR": average(mae_values),
        "bestResultR": round(max(result_r_values), 2) if result_r_values else None,
        "worstResultR": round(min(result_r_values), 2) if result_r_values else None,
        "bestMfeR": round(max(mfe_values), 2) if mfe_values else None,
        "worstMaeR": round(max(mae_values), 2) if mae_values else None,
        "telegramEligibleCount": len(telegram_items),
        "telegramEligibleRate": pct(len(telegram_items), total),
        "premiumSignalCount": len(premium_items),
        "premiumSignalRate": pct(len(premium_items), total),
    }


def build_setup_statistics(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for item in items:
        setup_slug = str(item.get("setupSlug") or "unknown")
        grouped.setdefault(setup_slug, []).append(item)

    rows: list[dict[str, Any]] = []
    for setup_slug, setup_items in grouped.items():
        symbols = sorted({str(item.get("symbol") or "").upper() for item in setup_items if item.get("symbol")})
        rows.append(
            {
                "setupSlug": setup_slug,
                "symbols": symbols[:50],
                **build_outcome_statistics(setup_items),
                "byGrade": build_bucket_stats(setup_items, "signalGrade"),
                "byQualityStatus": build_bucket_stats(setup_items, "qualityStatus"),
            }
        )

    return sorted(rows, key=lambda row: int(row.get("count") or 0), reverse=True)


def build_symbol_statistics(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for item in items:
        symbol = str(item.get("symbol") or "unknown").upper()
        grouped.setdefault(symbol, []).append(item)

    rows: list[dict[str, Any]] = []
    for symbol, symbol_items in grouped.items():
        rows.append({"symbol": symbol, **build_outcome_statistics(symbol_items)})

    return sorted(rows, key=lambda row: int(row.get("count") or 0), reverse=True)


# ---------------------------------------------------------------------------
# S8.10E Outcome Cleanup / No-Eval Late Session Classification
# ---------------------------------------------------------------------------

S810E_NO_EVAL_LATE_SESSION_VERSION = "s8_10e_no_eval_late_session_v1"


def _s810e_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None:
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def _s810e_is_no_eval_late_session(item: dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False

    if str(item.get("outcomeEvaluationStatus") or "").upper().strip() == "NO_EVAL_LATE_SESSION":
        return True

    status = str(item.get("status") or "").upper().strip()
    reason = str(item.get("reason") or item.get("noEvalReason") or "").lower().strip()
    result = str(item.get("result") or "").upper().strip()
    candles_checked = _s810e_int(item.get("candlesChecked"), fallback=-1)

    if status != "EXPIRED_SESSION":
        return False

    if candles_checked != 0:
        return False

    if reason == "session_closed_no_future_candles":
        return True

    # Historical replay stores SESSION_CLOSE as EXPIRED_SESSION. If there were
    # zero future candles, it is not an evaluated outcome either.
    if result == "SESSION_CLOSE":
        return True

    return False


def _s810e_mark_no_eval_late_session_item(item: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(item, dict):
        return item

    out = dict(item)

    if _s810e_is_no_eval_late_session(out):
        out["outcomeEvaluationStatus"] = "NO_EVAL_LATE_SESSION"
        out["excludeFromCalibration"] = True
        out["excludeFromWinRate"] = True
        out["noEvalReason"] = "no_future_candles_after_late_session_signal"
        out["outcomeCleanupVersion"] = S810E_NO_EVAL_LATE_SESSION_VERSION

    return out


def _s810e_mark_no_eval_late_session_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    return [
        _s810e_mark_no_eval_late_session_item(item)
        for item in items
        if isinstance(item, dict)
    ]


def _s810e_no_eval_late_session_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict) and _s810e_is_no_eval_late_session(item)]


def _s810e_evaluable_outcome_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict) and not _s810e_is_no_eval_late_session(item)]


_s810e_build_outcome_summary_raw = build_outcome_summary
_s810e_build_outcome_statistics_raw = build_outcome_statistics


def build_outcome_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    raw_items = [item for item in (items or []) if isinstance(item, dict)]
    no_eval_items = _s810e_no_eval_late_session_items(raw_items)
    evaluable_items = _s810e_evaluable_outcome_items(raw_items)

    summary = _s810e_build_outcome_summary_raw(evaluable_items)
    summary["rawCount"] = len(raw_items)
    summary["evaluableCount"] = len(evaluable_items)
    summary["noEvalLateSession"] = len(no_eval_items)
    summary["noEvalLateSessionCount"] = len(no_eval_items)
    summary["excludedFromCalibrationCount"] = len(no_eval_items)
    summary["excludedFromWinRateCount"] = len(no_eval_items)
    summary["outcomeCleanupVersion"] = S810E_NO_EVAL_LATE_SESSION_VERSION
    return summary


def build_outcome_statistics(items: list[dict[str, Any]]) -> dict[str, Any]:
    raw_items = [item for item in (items or []) if isinstance(item, dict)]
    no_eval_items = _s810e_no_eval_late_session_items(raw_items)
    evaluable_items = _s810e_evaluable_outcome_items(raw_items)

    stats = _s810e_build_outcome_statistics_raw(evaluable_items)
    stats["rawCount"] = len(raw_items)
    stats["evaluableCount"] = len(evaluable_items)
    stats["noEvalLateSession"] = len(no_eval_items)
    stats["noEvalLateSessionCount"] = len(no_eval_items)
    stats["excludedFromCalibrationCount"] = len(no_eval_items)
    stats["excludedFromWinRateCount"] = len(no_eval_items)
    stats["outcomeCleanupVersion"] = S810E_NO_EVAL_LATE_SESSION_VERSION
    return stats



@app.post("/engine/backtest/active")
async def engine_backtest_active(
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
):
    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    result = await evaluate_active_signals(
        client,
        ACTIVE,
        interval=interval,
        max_candles=max_candles,
        use_trigger_time=use_trigger_time,
        session_to_close=session_to_close,
    )

    result["outcomes"] = _s810e_mark_no_eval_late_session_items(result.get("outcomes", []))
    result["outcomeCleanup"] = {
        "version": S810E_NO_EVAL_LATE_SESSION_VERSION,
        "noEvalLateSession": len(_s810e_no_eval_late_session_items(result.get("outcomes", []))),
        "evaluableCount": len(_s810e_evaluable_outcome_items(result.get("outcomes", []))),
    }
    storage = store_outcome_dataset(result.get("outcomes", []))
    result["storage"] = storage

    return result


@app.post("/engine/outcomes/run-today")
async def engine_outcomes_run_today(
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
    source: str = "auto",
    session_date: str | None = None,
    limit: int = 500,
):
    """Run Holly-style outcome checks for ACTIVE/PASSED signals.

    S4.9D fix: this endpoint no longer depends only on runtime ACTIVE.
    If the server restarted and ACTIVE is empty, it loads persisted ACTIVE +
    PASSED + premium + Telegram-eligible signal_records from SQLite and evaluates
    outcomes from those durable signals.
    """

    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    selected_source, signal_map, source_debug = select_outcome_signal_source(
        source=source,
        session_date=session_date,
        limit=limit,
        telegram_only=True,
        premium_only=True,
    )

    result = await evaluate_active_signals(
        client,
        signal_map,
        interval=interval,
        max_candles=max_candles,
        use_trigger_time=use_trigger_time,
        session_to_close=session_to_close,
    )

    result["outcomes"] = _s810e_mark_no_eval_late_session_items(result.get("outcomes", []))
    result["outcomeCleanup"] = {
        "version": S810E_NO_EVAL_LATE_SESSION_VERSION,
        "noEvalLateSession": len(_s810e_no_eval_late_session_items(result.get("outcomes", []))),
        "evaluableCount": len(_s810e_evaluable_outcome_items(result.get("outcomes", []))),
    }
    storage = store_outcome_dataset(result.get("outcomes", []))
    result["storage"] = storage
    result["runtimeCache"] = publish_runtime_cache(reason="outcomes_run_today")
    result["endpoint"] = "/engine/outcomes/run-today"
    result["source"] = selected_source
    result["sourceDebug"] = source_debug

    return result


@app.post("/engine/outcomes/run-persisted")
async def engine_outcomes_run_persisted(
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
    session_date: str | None = None,
    limit: int = 500,
):
    """Explicitly evaluate outcomes from persisted DB signal_records only."""

    return await engine_outcomes_run_today(
        interval=interval,
        max_candles=max_candles,
        use_trigger_time=use_trigger_time,
        session_to_close=session_to_close,
        source="persisted",
        session_date=session_date,
        limit=limit,
    )


@app.get("/engine/backtest/outcomes")
def engine_backtest_outcomes():
    items = load_persistent_outcome_items()

    return {
        "ok": True,
        "count": len(items),
        "summary": build_outcome_summary(items),
        "items": items,
    }


@app.get("/engine/outcomes")
def engine_outcomes(limit: int = 100):
    items = load_persistent_outcome_items()
    items = sorted(
        items,
        key=lambda item: str(item.get("evaluatedAt") or item.get("storedAt") or ""),
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(items),
        "limit": limit,
        "summary": build_outcome_summary(items),
        "items": items[: max(1, min(limit, 500))],
        "storageVersion": "s410_supabase_sqlite_persistence_v1",
        "persistentDatabase": db.get_status(),
    }


@app.get("/engine/outcomes/summary")
def engine_outcomes_summary():
    items = load_persistent_outcome_items()

    return {
        "ok": True,
        "summary": build_outcome_summary(items),
        "statistics": build_outcome_statistics(items),
        "bySetup": build_setup_statistics(items),
        "storageVersion": "s49_setup_statistics_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/outcomes/statistics")
def engine_outcomes_statistics():
    items = load_persistent_outcome_items()

    return {
        "ok": True,
        "statistics": build_outcome_statistics(items),
        "bySetup": build_setup_statistics(items),
        "bySymbol": build_symbol_statistics(items),
        "byGrade": build_bucket_stats(items, "signalGrade"),
        "byQualityStatus": build_bucket_stats(items, "qualityStatus"),
        "storageVersion": "s49_setup_statistics_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/stats/setups")
def engine_stats_setups():
    items = load_persistent_outcome_items()

    return {
        "ok": True,
        "count": len(items),
        "bySetup": build_setup_statistics(items),
        "storageVersion": "s49_setup_statistics_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/stats/symbols")
def engine_stats_symbols():
    items = load_persistent_outcome_items()

    return {
        "ok": True,
        "count": len(items),
        "bySymbol": build_symbol_statistics(items),
        "storageVersion": "s49_setup_statistics_v1",
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.delete("/engine/outcomes")
def engine_outcomes_clear():
    runtime_cleared = len(BACKTEST_OUTCOMES)
    persistent_cleared = db.clear_outcomes()
    BACKTEST_OUTCOMES.clear()

    return {
        "ok": True,
        "runtimeCleared": runtime_cleared,
        "persistentCleared": persistent_cleared,
        "count": len(BACKTEST_OUTCOMES),
        "database": db.get_status(),
    }


@app.post("/debug/backtest/{symbol}")
async def debug_backtest_symbol(
    symbol: str,
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
):
    client = FmpClient()

    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
        }

    upper_symbol = symbol.upper()
    signal = None

    for item in ACTIVE.values():
        payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
        if str(payload.get("symbol") or "").upper() == upper_symbol:
            signal = item
            break

    if signal is None:
        return {
            "ok": False,
            "error": "No ACTIVE signal found for symbol. Run /engine/discovery/refresh first.",
            "symbol": upper_symbol,
            "activeSymbols": list(ACTIVE.keys())[:50],
        }

    candles = await client.get_intraday_candles(upper_symbol, interval=interval)
    outcome = evaluate_signal_outcome(
        signal,
        candles,
        max_candles=max_candles,
        use_trigger_time=use_trigger_time,
        session_to_close=session_to_close,
    )

    return {
        "ok": True,
        "symbol": upper_symbol,
        "interval": interval,
        "rawCandles": len(candles),
        "outcome": outcome,
    }

# ---------------------------------------------------------------------------
# S4.10 Algorithm Registry + Night Calibration / Re-Ranking foundation
# ---------------------------------------------------------------------------


def _closed_outcome_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in items if item.get("status") in {"WORKED", "FAILED"}]


def _calibration_group_key(item: dict[str, Any], scope: str) -> tuple[str, str | None]:
    setup_slug = str(item.get("setupSlug") or "unknown")
    if scope == "setup_trigger":
        trigger = str(item.get("primaryTrigger") or "ALL")
        return setup_slug, trigger
    return setup_slug, None


def _build_adjustment_from_items(
    *,
    setup_slug: str,
    primary_trigger: str | None,
    scope: str,
    items: list[dict[str, Any]],
    run_id: str,
    session_date: str,
    min_signals: int = 20,
    min_closed: int = 10,
) -> dict[str, Any]:
    stats = build_outcome_statistics(items)
    total = int(stats.get("count") or 0)
    closed = int(stats.get("closed") or 0)
    worked = int(stats.get("worked") or 0)
    failed = int(stats.get("failed") or 0)
    win_rate = safe_float(stats.get("winRateClosed"))
    avg_r = safe_float(stats.get("avgResultRClosed"))
    stop_rate = safe_float(stats.get("stopRateClosed"))
    tp1_rate = safe_float(stats.get("tp1HitRateClosed"))

    status = "INSUFFICIENT_SAMPLE"
    action = "OBSERVE"
    score_adjustment = 0
    strictness_adjustment = 0
    risk_adjustment = 0.0
    reason = f"Need at least {min_signals} signals and {min_closed} closed outcomes before changing tomorrow's scoring."

    if total >= min_signals and closed >= min_closed:
        status = "ACTIVE_ADJUSTMENT"
        reason_parts: list[str] = []

        if (win_rate is not None and win_rate >= 65) and (avg_r is not None and avg_r >= 0.4):
            action = "BOOST"
            score_adjustment = 5
            strictness_adjustment = -1
            reason_parts.append("High win rate and positive average R.")
        elif (win_rate is not None and win_rate < 45) or (avg_r is not None and avg_r < 0):
            action = "TIGHTEN"
            score_adjustment = -6
            strictness_adjustment = 1
            reason_parts.append("Weak win rate or negative average R.")
        else:
            action = "KEEP"
            score_adjustment = 0
            strictness_adjustment = 0
            reason_parts.append("Performance is neutral. Keep current scoring.")

        if stop_rate is not None and stop_rate >= 65:
            action = "TIGHTEN"
            score_adjustment = min(score_adjustment, -8)
            strictness_adjustment = max(strictness_adjustment, 2)
            reason_parts.append("High stop rate; require stronger confirmation.")

        reason = " ".join(reason_parts)

    trigger_part = primary_trigger or "ALL"
    adjustment_key = f"{scope}:{setup_slug}:{trigger_part}"

    return {
        "adjustmentKey": adjustment_key,
        "setupSlug": setup_slug,
        "primaryTrigger": primary_trigger,
        "scope": scope,
        "status": status,
        "action": action,
        "scoreAdjustment": score_adjustment,
        "strictnessAdjustment": strictness_adjustment,
        "riskAdjustment": risk_adjustment,
        "sampleCount": total,
        "closedCount": closed,
        "workedCount": worked,
        "failedCount": failed,
        "winRateClosed": win_rate,
        "avgResultRClosed": avg_r,
        "stopRateClosed": stop_rate,
        "tp1RateClosed": tp1_rate,
        "avgMfeR": safe_float(stats.get("avgMfeR")),
        "avgMaeR": safe_float(stats.get("avgMaeR")),
        "reason": reason,
        "runId": run_id,
        "validForSessionDate": session_date,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


def build_calibration_run(
    *,
    session_date: str | None = None,
    min_signals: int = 20,
    min_closed: int = 10,
    limit: int = 5000,
) -> dict[str, Any]:
    algorithms = get_algorithm_registry()
    db.upsert_algorithms(algorithms)

    items = load_persistent_outcome_items(limit=limit)
    if session_date:
        items = [item for item in items if str(item.get("triggerTime") or item.get("sessionDate") or "")[:10] == session_date]
    selected_session_date = session_date or datetime.now(timezone.utc).date().isoformat()

    closed_items = _closed_outcome_items(items)
    summary = build_outcome_statistics(items)
    run_id = f"calibration:{selected_session_date}:{datetime.now(timezone.utc).strftime('%H%M%S')}"

    grouped: dict[tuple[str, str | None, str], list[dict[str, Any]]] = {}
    for item in items:
        setup_slug, trigger = _calibration_group_key(item, "setup")
        grouped.setdefault((setup_slug, None, "setup"), []).append(item)
        setup_slug, trigger = _calibration_group_key(item, "setup_trigger")
        grouped.setdefault((setup_slug, trigger, "setup_trigger"), []).append(item)

    adjustments: list[dict[str, Any]] = []
    for (setup_slug, primary_trigger, scope), group_items in grouped.items():
        adjustment = _build_adjustment_from_items(
            setup_slug=setup_slug,
            primary_trigger=primary_trigger,
            scope=scope,
            items=group_items,
            run_id=run_id,
            session_date=selected_session_date,
            min_signals=min_signals,
            min_closed=min_closed,
        )
        db.upsert_setup_adjustment(adjustment)
        adjustments.append(adjustment)

    run = {
        "runId": run_id,
        "sessionDate": selected_session_date,
        "algorithmCount": len(algorithms),
        "outcomeCount": len(items),
        "closedCount": len(closed_items),
        "workedCount": int(summary.get("worked") or 0),
        "failedCount": int(summary.get("failed") or 0),
        "adjustmentCount": len(adjustments),
        "winRateClosed": safe_float(summary.get("winRateClosed")),
        "avgResultRClosed": safe_float(summary.get("avgResultRClosed")),
        "status": "COMPLETED",
        "minSignalsForAdjustment": min_signals,
        "minClosedForAdjustment": min_closed,
        "summary": summary,
        "adjustments": adjustments,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": "s410_calibration_foundation_v1",
    }
    db.upsert_calibration_run(run)
    return run


@app.get("/engine/algorithms")
def engine_algorithms(sync: bool = True):
    registry = get_algorithm_registry_summary()
    if sync:
        db.upsert_algorithms(registry["items"])
    stored = db.load_algorithms(limit=500)
    return {
        **registry,
        "syncedToDatabase": sync,
        "storedCount": len(stored),
        "database": db.get_status(),
    }


@app.post("/engine/algorithms/sync")
def engine_algorithms_sync():
    algorithms = get_algorithm_registry()
    result = db.upsert_algorithms(algorithms)
    return {
        "ok": True,
        "count": len(algorithms),
        "result": result,
        "items": algorithms,
        "endpoint": "/engine/algorithms/sync",
    }


@app.post("/engine/calibration/run")
def engine_calibration_run(
    session_date: str | None = None,
    min_signals: int = 20,
    min_closed: int = 10,
    limit: int = 5000,
):
    run = build_calibration_run(
        session_date=session_date,
        min_signals=min_signals,
        min_closed=min_closed,
        limit=limit,
    )
    return {
        "ok": True,
        "run": run,
        "database": db.get_status(),
        "endpoint": "/engine/calibration/run",
    }


@app.get("/engine/calibration/latest")
def engine_calibration_latest(limit: int = 5):
    items = db.load_calibration_runs(limit=limit)
    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "database": db.get_status(),
        "storageVersion": "s410_calibration_foundation_v1",
    }


@app.get("/engine/adjustments")
def engine_adjustments(limit: int = 100):
    items = db.load_setup_adjustments(limit=limit)
    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "database": db.get_status(),
        "storageVersion": "s410_setup_adjustments_v1",
    }
# ---------------------------------------------------------------------------
# S4.15 Signal Lifecycle Manager foundation
# ---------------------------------------------------------------------------

S415_LIFECYCLE_VERSION = "s415_signal_lifecycle_manager_v1"
S415_LIFECYCLE_CACHE_KEY = "engine:lifecycle"
S415_COCKPIT_CACHE_KEY = "engine:signal_cockpit"
SIGNAL_LIFECYCLE: dict[str, dict[str, Any]] = {}


try:
    from app.backtest import get_regular_session_end as _s415_get_regular_session_end
    from app.backtest import is_session_closed as _s415_is_session_closed
except Exception:  # pragma: no cover - defensive fallback for partial local runs
    _s415_get_regular_session_end = None
    _s415_is_session_closed = None


def _s415_float(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return fallback
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value).replace("%", "").replace(",", "").replace("$", "").strip())
    except Exception:
        return fallback


def _s415_parse_dt(value: Any) -> datetime | None:
    try:
        return _parse_dt(value)
    except Exception:
        return None


def _s415_sort_rows(candle_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [row for row in candle_rows if isinstance(row, dict)]
    return sorted(rows, key=lambda row: str(row.get("date") or row.get("datetime") or row.get("timestamp") or row.get("time") or ""))


def _s415_row_dt(row: dict[str, Any]) -> datetime | None:
    return _s415_parse_dt(row.get("date") or row.get("datetime") or row.get("timestamp") or row.get("time"))


def _s415_latest_price(candle_rows: list[dict[str, Any]], fallback: Any = None) -> float | None:
    rows = _s415_sort_rows(candle_rows)
    if rows:
        last = rows[-1]
        value = _s415_float(last.get("close"))
        if value is not None:
            return value
    return _s415_float(fallback)


def _s415_get_targets(signal: dict[str, Any]) -> tuple[float | None, float | None]:
    targets = signal.get("targets") if isinstance(signal.get("targets"), list) else []
    tp1 = targets[0] if len(targets) > 0 and isinstance(targets[0], dict) else {}
    tp2 = targets[1] if len(targets) > 1 and isinstance(targets[1], dict) else {}
    return _s415_float(tp1.get("price")), _s415_float(tp2.get("price"))


def _s415_risk(entry: float | None, stop: float | None, direction: str) -> float | None:
    if entry is None or stop is None:
        return None
    if direction == "short" and stop > entry:
        return stop - entry
    if direction == "long" and entry > stop:
        return entry - stop
    return None


def _s415_r_value(entry: float | None, stop: float | None, price: float | None, direction: str) -> float | None:
    risk = _s415_risk(entry, stop, direction)
    if risk is None or risk <= 0 or price is None or entry is None:
        return None
    if direction == "short":
        return round((entry - price) / risk, 2)
    if direction == "long":
        return round((price - entry) / risk, 2)
    return None


def _s415_price_inside_entry_zone(price: float | None, signal: dict[str, Any]) -> bool:
    if price is None:
        return False
    entry_zone = signal.get("entryZone") if isinstance(signal.get("entryZone"), dict) else {}
    entry_min = _s415_float(entry_zone.get("min"))
    entry_max = _s415_float(entry_zone.get("max"))
    if entry_min is not None and entry_max is not None:
        return entry_min <= price <= entry_max
    entry = _s415_float(signal.get("entry"))
    if entry is None or entry <= 0:
        return False
    return abs(price - entry) / entry <= 0.015


def _s415_filter_candles_after_trigger(candle_rows: list[dict[str, Any]], trigger_time: datetime | None) -> list[dict[str, Any]]:
    rows = _s415_sort_rows(candle_rows)
    if trigger_time is None:
        return rows
    filtered = []
    for row in rows:
        row_dt = _s415_row_dt(row)
        if row_dt is None or row_dt > trigger_time:
            filtered.append(row)
    return filtered


def _s415_hit_levels(signal: dict[str, Any], candle_rows: list[dict[str, Any]]) -> dict[str, Any]:
    direction = str(signal.get("direction") or "").lower().strip()
    entry = _s415_float(signal.get("entry"))
    stop = _s415_float(signal.get("stop"))
    tp1, tp2 = _s415_get_targets(signal)
    trigger_time = _s415_parse_dt(signal.get("triggerTime") or signal.get("createdAt") or signal.get("storedAt"))
    future_rows = _s415_filter_candles_after_trigger(candle_rows, trigger_time)

    result = {
        "tp1Hit": False,
        "tp2Hit": False,
        "stopHit": False,
        "firstEvent": None,
        "firstEventAt": None,
        "highestAfterTrigger": None,
        "lowestAfterTrigger": None,
        "candlesChecked": len(future_rows),
    }

    highest = None
    lowest = None

    for row in future_rows:
        high = _s415_float(row.get("high"))
        low = _s415_float(row.get("low"))
        row_dt = _s415_row_dt(row)
        if high is not None:
            highest = high if highest is None else max(highest, high)
        if low is not None:
            lowest = low if lowest is None else min(lowest, low)

        if direction == "short":
            # Conservative tie handling: if stop and target touch same candle, stop wins.
            if stop is not None and high is not None and high >= stop:
                result.update({"stopHit": True, "firstEvent": "STOP_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break
            if tp2 is not None and low is not None and low <= tp2:
                result.update({"tp1Hit": True, "tp2Hit": True, "firstEvent": "TP2_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break
            if tp1 is not None and low is not None and low <= tp1:
                result.update({"tp1Hit": True, "firstEvent": "TP1_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break

        if direction == "long":
            if stop is not None and low is not None and low <= stop:
                result.update({"stopHit": True, "firstEvent": "STOP_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break
            if tp2 is not None and high is not None and high >= tp2:
                result.update({"tp1Hit": True, "tp2Hit": True, "firstEvent": "TP2_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break
            if tp1 is not None and high is not None and high >= tp1:
                result.update({"tp1Hit": True, "firstEvent": "TP1_HIT", "firstEventAt": row_dt.isoformat() if row_dt else None})
                break

    result["highestAfterTrigger"] = highest
    result["lowestAfterTrigger"] = lowest
    result["currentR"] = _s415_r_value(entry, stop, _s415_latest_price(candle_rows, fallback=signal.get("entry")), direction)
    return result


def evaluate_signal_lifecycle(signal: dict[str, Any], candle_rows: list[dict[str, Any]], interval: str = "5min") -> dict[str, Any]:
    """Evaluate real-time lifecycle state for one active signal.

    This is not a final trade recommendation engine. It is the backend state
    layer that will power the AI Signal Cockpit and later Telegram updates.
    """

    symbol = str(signal.get("symbol") or "UNKNOWN").upper().strip()
    setup_slug = str(signal.get("setupSlug") or "setup")
    direction = str(signal.get("direction") or "").lower().strip()
    entry = _s415_float(signal.get("entry"))
    stop = _s415_float(signal.get("stop"))
    tp1, tp2 = _s415_get_targets(signal)
    trigger_time = _s415_parse_dt(signal.get("triggerTime") or signal.get("createdAt") or signal.get("storedAt"))
    latest_price = _s415_latest_price(candle_rows, fallback=signal.get("entry"))
    snapshot = build_session_snapshot(candle_rows) if candle_rows else {}
    vwap = _s415_float(snapshot.get("vwap"))
    ema20 = _s415_float(snapshot.get("ema20_5m"))
    current_r = _s415_r_value(entry, stop, latest_price, direction)
    hits = _s415_hit_levels(signal, candle_rows)

    reasons: list[str] = []
    guidance: list[str] = []
    next_actions: list[str] = []
    timeline: list[dict[str, Any]] = []

    status = "ACTIVE"
    event_type = "STILL_VALID"
    entry_status = "UNKNOWN"

    if trigger_time:
        timeline.append({"type": "NEW_ACTIVE", "at": trigger_time.isoformat(), "text": "Signal became ACTIVE."})

    if hits.get("firstEvent"):
        event_type = str(hits.get("firstEvent"))
        status = event_type
        timeline.append({"type": event_type, "at": hits.get("firstEventAt"), "text": f"First lifecycle event: {event_type}."})

    if event_type == "TP2_HIT":
        entry_status = "MANAGEMENT_COMPLETE"
        guidance.append("TP2 was reached. The original idea is considered worked; do not treat it as a fresh entry.")
        next_actions.append("Review outcome and wait for a new setup if structure resets.")
    elif event_type == "TP1_HIT":
        entry_status = "MANAGEMENT_MODE"
        guidance.append("TP1 was reached. New entries are late; management focus should be reduce risk / protect profit.")
        next_actions.append("Do not chase after TP1. Wait for a separate re-entry setup if one forms.")
    elif event_type == "STOP_HIT":
        entry_status = "INVALIDATED"
        guidance.append("Stop level was hit. The original signal is invalidated.")
        next_actions.append("Do not re-enter from the old signal. Require a fresh setup and new confirmation.")
    else:
        if latest_price is None or entry is None or stop is None or direction not in {"short", "long"}:
            status = "INVALIDATED"
            event_type = "INVALIDATED"
            entry_status = "INVALID_INPUTS"
            reasons.append("missing_price_entry_stop_or_direction")
            guidance.append("Lifecycle cannot be evaluated because key levels are missing.")
        else:
            risk = _s415_risk(entry, stop, direction)
            inside_entry = _s415_price_inside_entry_zone(latest_price, signal)
            if direction == "short":
                above_stop = stop is not None and latest_price >= stop
                reclaimed_vwap = vwap is not None and latest_price > vwap
                reclaimed_ema = ema20 is not None and latest_price > ema20
                if above_stop:
                    status = "INVALIDATED"
                    event_type = "INVALIDATED"
                    entry_status = "INVALIDATED"
                    reasons.append("current_price_above_stop")
                    guidance.append("Price is above the stop/invalidation level. Short idea is no longer clean.")
                elif reclaimed_vwap and reclaimed_ema and latest_price > entry:
                    status = "INVALIDATED"
                    event_type = "INVALIDATED"
                    entry_status = "INVALIDATED"
                    reasons.append("price_reclaimed_vwap_and_ema20")
                    guidance.append("Price reclaimed VWAP and EMA20 above entry. The short setup is no longer clean.")
                elif current_r is not None and current_r >= 1.0:
                    status = "ENTRY_MISSED"
                    event_type = "ENTRY_MISSED"
                    entry_status = "DO_NOT_CHASE"
                    reasons.append("price_moved_toward_target_1R_plus")
                    guidance.append("Entry is missed. Do not chase because the reward/risk is no longer clean.")
                    next_actions.append("Wait for a new lower high, VWAP retest/rejection, or a full new setup.")
                elif current_r is not None and current_r >= 0.35:
                    status = "WAIT_FOR_REENTRY"
                    event_type = "WAIT_FOR_REENTRY"
                    entry_status = "WAIT_FOR_REENTRY"
                    reasons.append("price_already_moved_from_entry")
                    guidance.append("Initial entry is late. The idea may still work, but a fresh re-entry trigger is needed.")
                    next_actions.append("Wait for pullback/retest near entry zone or VWAP/EMA rejection.")
                elif inside_entry or (current_r is not None and -0.25 <= current_r <= 0.35):
                    status = "ENTRY_STILL_VALID"
                    event_type = "ENTRY_STILL_VALID"
                    entry_status = "ENTRY_STILL_VALID"
                    reasons.append("price_near_entry_zone")
                    guidance.append("Entry is still near the planned zone. Risk/reward is not obviously broken yet.")
                    next_actions.append("Use original stop/invalidation. Do not enter if price accelerates away from entry.")
                else:
                    status = "STILL_VALID"
                    event_type = "STILL_VALID"
                    entry_status = "WATCHING"
                    guidance.append("Setup is still being monitored. Wait for a cleaner entry/re-entry condition.")

            if direction == "long":
                below_stop = stop is not None and latest_price <= stop
                lost_vwap = vwap is not None and latest_price < vwap
                lost_ema = ema20 is not None and latest_price < ema20
                if below_stop:
                    status = "INVALIDATED"
                    event_type = "INVALIDATED"
                    entry_status = "INVALIDATED"
                    reasons.append("current_price_below_stop")
                    guidance.append("Price is below the stop/invalidation level. Long idea is no longer clean.")
                elif lost_vwap and lost_ema and latest_price < entry:
                    status = "INVALIDATED"
                    event_type = "INVALIDATED"
                    entry_status = "INVALIDATED"
                    reasons.append("price_lost_vwap_and_ema20")
                    guidance.append("Price lost VWAP and EMA20 below entry. The long setup is no longer clean.")
                elif current_r is not None and current_r >= 1.0:
                    status = "ENTRY_MISSED"
                    event_type = "ENTRY_MISSED"
                    entry_status = "DO_NOT_CHASE"
                    reasons.append("price_moved_toward_target_1R_plus")
                    guidance.append("Entry is missed. Do not chase because reward/risk is no longer clean.")
                    next_actions.append("Wait for a fresh pullback/retest or new setup.")
                elif current_r is not None and current_r >= 0.35:
                    status = "WAIT_FOR_REENTRY"
                    event_type = "WAIT_FOR_REENTRY"
                    entry_status = "WAIT_FOR_REENTRY"
                    reasons.append("price_already_moved_from_entry")
                    guidance.append("Initial entry is late. A fresh re-entry trigger is needed.")
                    next_actions.append("Wait for pullback/retest near entry zone or VWAP/EMA hold.")
                elif inside_entry or (current_r is not None and -0.25 <= current_r <= 0.35):
                    status = "ENTRY_STILL_VALID"
                    event_type = "ENTRY_STILL_VALID"
                    entry_status = "ENTRY_STILL_VALID"
                    reasons.append("price_near_entry_zone")
                    guidance.append("Entry is still near the planned zone. Risk/reward is not obviously broken yet.")
                    next_actions.append("Use original stop/invalidation. Do not chase if price accelerates away from entry.")
                else:
                    status = "STILL_VALID"
                    event_type = "STILL_VALID"
                    entry_status = "WATCHING"
                    guidance.append("Setup is still being monitored. Wait for a cleaner entry/re-entry condition.")

    # Timed/session state is secondary: it should not override hard TP/stop events.
    session_end = _s415_get_regular_session_end(trigger_time) if _s415_get_regular_session_end and trigger_time else None
    session_closed = bool(_s415_is_session_closed(session_end)) if _s415_is_session_closed and session_end else False
    if event_type in {"STILL_VALID", "ENTRY_STILL_VALID", "WAIT_FOR_REENTRY", "ENTRY_MISSED"} and session_closed:
        status = "SESSION_CLOSE"
        event_type = "SESSION_CLOSE"
        entry_status = "CLOSED_BY_SESSION"
        if "regular_session_closed" not in reasons:
            reasons.append("regular_session_closed")
        # Session-close is a terminal lifecycle state. Keep the earlier reasons for audit,
        # but make the user-facing message unambiguous for the Cockpit/Telegram layer.
        guidance = ["Regular session is closed. The intraday signal should no longer be treated as active."]
        if current_r is not None:
            guidance.append(f"Final mark-to-market state at session close: {current_r}R from the original entry.")
        next_actions = [
            "Do not open a new intraday entry from this signal after session close.",
            "Review the outcome and wait for a fresh setup in the next active session.",
        ]

    if not next_actions:
        if event_type in {"ENTRY_STILL_VALID", "STILL_VALID"}:
            next_actions.append("Monitor current candle and respect invalidation.")
        elif event_type in {"INVALIDATED", "STOP_HIT", "SESSION_CLOSE"}:
            next_actions.append("Wait for a completely new setup.")
        elif event_type in {"TP1_HIT", "TP2_HIT"}:
            next_actions.append("Record outcome and switch from entry to management/review.")
        else:
            next_actions.append("Wait for a cleaner AI confirmation before acting.")

    if event_type not in {"TP1_HIT", "TP2_HIT", "STOP_HIT"}:
        timeline.append({"type": event_type, "at": datetime.now(timezone.utc).isoformat(), "text": guidance[0] if guidance else event_type})

    signal_id = get_signal_id(signal) or str(signal.get("storageKey") or f"{symbol}:{setup_slug}")
    lifecycle = {
        "ok": True,
        "storageVersion": S415_LIFECYCLE_VERSION,
        "signalId": signal_id,
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setupName": signal.get("setupName"),
        "direction": direction,
        "status": status,
        "lifecycleStatus": status,
        "lifecycleEventType": event_type,
        "entryStatus": entry_status,
        "currentPrice": latest_price,
        "currentR": current_r,
        "entry": entry,
        "stop": stop,
        "tp1": tp1,
        "tp2": tp2,
        "vwap": vwap,
        "ema20_5m": ema20,
        "triggerTime": signal.get("triggerTime") or signal.get("createdAt"),
        "sessionEnd": session_end.isoformat() if session_end else None,
        "sessionClosed": session_closed,
        "hits": hits,
        "reasons": reasons,
        "guidance": guidance,
        "nextActions": next_actions,
        "timeline": timeline,
        "chartLevels": {
            "entry": entry,
            "stop": stop,
            "tp1": tp1,
            "tp2": tp2,
            "vwap": vwap,
            "ema20_5m": ema20,
        },
        "aiQuestionContext": {
            "canAsk": True,
            "supportedQuestions": [
                "Is entry still valid?",
                "Did I miss the entry?",
                "Should I wait for re-entry?",
                "Is this signal invalidated?",
                "What changed after TP1?",
            ],
            "engineAnswerMode": "rules_first_llm_explanation_later",
        },
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "interval": interval,
    }
    return lifecycle


def _s415_lifecycle_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for item in items:
        status = str(item.get("lifecycleStatus") or "UNKNOWN")
        counts[status] = counts.get(status, 0) + 1
    return {
        "count": len(items),
        "byStatus": counts,
        "activeLikeCount": sum(counts.get(key, 0) for key in ["ACTIVE", "STILL_VALID", "ENTRY_STILL_VALID", "WAIT_FOR_REENTRY"]),
        "closedLikeCount": sum(counts.get(key, 0) for key in ["TP1_HIT", "TP2_HIT", "STOP_HIT", "INVALIDATED", "SESSION_CLOSE"]),
    }


def build_signal_cockpit_payload(lifecycle_items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "ok": True,
        "storageVersion": "s416_signal_cockpit_api_foundation_v1",
        "description": "Backend foundation for the future AI Signal Cockpit page.",
        "runtimeStatus": {
            "watchCount": len(_s416_watchlist_items()),
            "armedCount": len(_s416_armed_items()),
            "activeCount": len(_s416_active_items()),
            "actionableActiveCount": len(active_items),
            "closedActiveCount": len(closed_items),
            "signalCount": len(raw_signal_source),
            "lifecycleCount": len(lifecycle_items),
            "activeSource": "lifecycle_fallback" if active_from_lifecycle else "runtime_cache_or_memory",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "watchlist": sorted(list(WATCHLIST.values()), key=lambda item: int(item.get("inPlayScore") or 0), reverse=True)[:100],
        "armed": sorted(list(ARMED.values()), key=lambda item: int(item.get("confidence") or 0), reverse=True)[:100],
        "active": sorted(list(ACTIVE.values()), key=lambda item: int(item.get("signalScore") or item.get("confidence") or 0), reverse=True)[:100],
        "lifecycle": lifecycle_items,
        "summary": _s415_lifecycle_summary(lifecycle_items),
        "nextProductStep": "S4.16 will turn this payload into the AI Signal Cockpit API for the dashboard page.",
    }



# === S5.15C lifecycle active-source fallback ===============================
def _s515c_float_or_none(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return None


def _s515c_signal_like_from_compact_item(item: dict[str, Any]) -> dict[str, Any]:
    """Convert compact Cockpit active item back into a lifecycle-evaluable signal.

    The older lifecycle manager only looked at SIGNALS/sorted_signal_items. After
    S5.14E the Cockpit can have valid ACTIVE ideas from compact ACTIVE/runtime
    sections while SIGNALS is empty. This adapter lets lifecycle evaluate those
    real desk ideas instead of returning sourceActiveCount=0.
    """
    payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
    entry = _s515c_float_or_none(payload.get("entry"))
    stop = _s515c_float_or_none(payload.get("stop"))
    tp1 = _s515c_float_or_none(payload.get("tp1"))
    tp2 = _s515c_float_or_none(payload.get("tp2"))
    targets = payload.get("targets") if isinstance(payload.get("targets"), list) else []
    if not targets:
        targets = []
        if tp1 is not None:
            targets.append({"r": payload.get("tp1R") or payload.get("rrToTp1") or 2, "rr": payload.get("tp1R") or payload.get("rrToTp1") or 2, "price": tp1})
        if tp2 is not None:
            targets.append({"r": payload.get("tp2R") or payload.get("rrToTp2") or 3, "rr": payload.get("tp2R") or payload.get("rrToTp2") or 3, "price": tp2})

    signal = dict(payload)
    signal["symbol"] = str(payload.get("symbol") or "").upper().strip()
    signal["setupSlug"] = payload.get("setupSlug") or payload.get("setup_slug") or "setup"
    signal["setupName"] = payload.get("setupName") or payload.get("setup_name") or signal.get("setupSlug")
    signal["direction"] = str(payload.get("direction") or "").lower().strip()
    signal["status"] = "ACTIVE"
    signal["entry"] = entry
    signal["stop"] = stop
    signal["targets"] = targets
    signal["entryZone"] = payload.get("entryZone") if isinstance(payload.get("entryZone"), dict) else {"min": entry, "max": entry}
    signal["triggerTime"] = payload.get("triggerTime") or payload.get("createdAt") or payload.get("storedAt") or datetime.now(timezone.utc).isoformat()
    signal["signalId"] = payload.get("signalId") or f"{signal['symbol']}:{signal['setupSlug']}:{signal['triggerTime']}"
    return signal


def _s515c_lifecycle_active_fallback_items(limit: int = 100) -> list[dict[str, Any]]:
    """Find active ideas from the same runtime sources that Cockpit/BestIdeas use."""
    safe_limit = max(1, min(int(limit or 100), 200))
    candidates: list[dict[str, Any]] = []

    for source_fn in (_s416_active_items, _s416_signal_items):
        try:
            for raw in source_fn():
                if not isinstance(raw, dict):
                    continue
                payload = raw.get("signal") if isinstance(raw.get("signal"), dict) else raw
                status = str(payload.get("status") or raw.get("status") or "").upper().strip()
                if status in {"ACTIVE", "ENTRY_STILL_VALID", "STILL_VALID", "WAIT_FOR_REENTRY"}:
                    candidates.append(_s515c_signal_like_from_compact_item(raw))
        except Exception:
            pass

    if not candidates:
        try:
            cockpit = build_signal_cockpit_payload(_s416_get_lifecycle_items(), limit=safe_limit, include_candles=False)
            active_block = cockpit.get("active") if isinstance(cockpit, dict) else None
            active_items = active_block.get("items") if isinstance(active_block, dict) else []
            if isinstance(active_items, list):
                for raw in active_items:
                    if isinstance(raw, dict):
                        candidates.append(_s515c_signal_like_from_compact_item(raw))
        except Exception:
            pass

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in candidates:
        symbol = str(item.get("symbol") or "").upper().strip()
        direction = str(item.get("direction") or "").lower().strip()
        entry = _s515c_float_or_none(item.get("entry"))
        stop = _s515c_float_or_none(item.get("stop"))
        targets = item.get("targets") if isinstance(item.get("targets"), list) else []
        if not symbol or direction not in {"long", "short"} or entry is None or stop is None or not targets:
            continue
        key = str(item.get("signalId") or f"{symbol}:{item.get('setupSlug')}:{entry}:{stop}")
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= safe_limit:
            break
    return result

# === /S5.15C ================================================================

async def run_signal_lifecycle_manager(interval: str = "5min", limit: int = 100, publish: bool = True) -> dict[str, Any]:
    client = FmpClient()
    if not client.is_configured():
        return {"ok": False, "error": "FMP_API_KEY is missing", "storageVersion": S415_LIFECYCLE_VERSION}

    store_active_signals()
    active_items = [item for item in sorted_signal_items(limit=limit, premium_only=False, telegram_only=False) if str(item.get("status") or "").upper() == "ACTIVE"]
    lifecycle_source = "sorted_signal_items"
    if not active_items:
        active_items = _s515c_lifecycle_active_fallback_items(limit=limit)
        lifecycle_source = "cockpit_active_fallback" if active_items else "empty"
    lifecycle_items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for signal in active_items[: max(1, min(int(limit or 100), 200))]:
        symbol = str(signal.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        try:
            rows = await client.get_intraday_candles(symbol, interval=interval)
            lifecycle = evaluate_signal_lifecycle(signal, rows, interval=interval)
            lifecycle_items.append(lifecycle)
            signal_id = str(lifecycle.get("signalId") or symbol)
            SIGNAL_LIFECYCLE[signal_id] = lifecycle
        except Exception as error:
            errors.append({"symbol": symbol, "error": repr(error)})

    payload = {
        "ok": True,
        "storageVersion": S415_LIFECYCLE_VERSION,
        "interval": interval,
        "lifecycleSource": lifecycle_source,
        "sourceActiveCount": len(active_items),
        "count": len(lifecycle_items),
        "summary": _s415_lifecycle_summary(lifecycle_items),
        "items": lifecycle_items,
        "errors": errors,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }

    if publish:
        runtime_cache.set_json(S415_LIFECYCLE_CACHE_KEY, payload, ttl_seconds=900)
        runtime_cache.set_json(S415_COCKPIT_CACHE_KEY, build_signal_cockpit_payload(lifecycle_items), ttl_seconds=900)

    return payload


@app.post("/engine/lifecycle/run")
async def engine_lifecycle_run(interval: str = "5min", limit: int = 100, publish: bool = True):
    result = await run_signal_lifecycle_manager(interval=interval, limit=limit, publish=publish)
    if result.get("ok"):
        result["runtimeCache"] = runtime_cache.get_status()
    return result


@app.get("/engine/lifecycle")
def engine_lifecycle_cache():
    value = runtime_cache.get_json(S415_LIFECYCLE_CACHE_KEY)
    if not isinstance(value, dict):
        value = {
            "ok": True,
            "storageVersion": S415_LIFECYCLE_VERSION,
            "count": len(SIGNAL_LIFECYCLE),
            "summary": _s415_lifecycle_summary(list(SIGNAL_LIFECYCLE.values())),
            "items": list(SIGNAL_LIFECYCLE.values()),
            "cacheEmpty": True,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        }
    return {"ok": True, "value": value, "cache": runtime_cache.get_status(), "storageVersion": S415_LIFECYCLE_VERSION}


@app.get("/engine/lifecycle/{symbol}")
async def engine_lifecycle_symbol(symbol: str, interval: str = "5min"):
    client = FmpClient()
    if not client.is_configured():
        return {"ok": False, "error": "FMP_API_KEY is missing", "storageVersion": S415_LIFECYCLE_VERSION}

    store_active_signals()
    wanted = str(symbol or "").upper().strip()
    signal = next((item for item in SIGNALS.values() if str(item.get("symbol") or "").upper().strip() == wanted and str(item.get("status") or "").upper() == "ACTIVE"), None)
    if not isinstance(signal, dict):
        return {
            "ok": False,
            "error": "active_signal_not_found",
            "symbol": wanted,
            "activeSymbols": sorted({str(item.get("symbol") or "").upper() for item in SIGNALS.values() if str(item.get("status") or "").upper() == "ACTIVE"})[:100],
            "storageVersion": S415_LIFECYCLE_VERSION,
        }

    rows = await client.get_intraday_candles(wanted, interval=interval)
    lifecycle = evaluate_signal_lifecycle(signal, rows, interval=interval)
    SIGNAL_LIFECYCLE[str(lifecycle.get("signalId") or wanted)] = lifecycle
    return {"ok": True, "item": lifecycle, "rawCandles": len(rows), "storageVersion": S415_LIFECYCLE_VERSION}


@app.get("/engine/cockpit")
def engine_signal_cockpit_cache():
    value = runtime_cache.get_json(S415_COCKPIT_CACHE_KEY)
    if not isinstance(value, dict):
        value = build_signal_cockpit_payload(list(SIGNAL_LIFECYCLE.values()))
        value["cacheEmpty"] = True
    return {"ok": True, "value": value, "cache": runtime_cache.get_status(), "storageVersion": "s416_signal_cockpit_api_foundation_v1"}

# ---------------------------------------------------------------------------
# S4.15C Lifecycle Event Notifications foundation
# ---------------------------------------------------------------------------

S415C_LIFECYCLE_NOTIFICATION_VERSION = "s415c_lifecycle_event_notifications_v1"
S415C_LIFECYCLE_DELIVERED_INDEX_KEY = "engine:lifecycle_notification_delivered_index"
S415C_LIFECYCLE_EVENT_TYPES = {
    "TP1_HIT",
    "TP2_HIT",
    "STOP_HIT",
    "INVALIDATED",
    "ENTRY_MISSED",
    "WAIT_FOR_REENTRY",
    "SESSION_CLOSE",
}
S415C_LIFECYCLE_REVIEW_ONLY_EVENT_TYPES = {
    "ENTRY_STILL_VALID",
    "STILL_VALID",
}
S415C_LIFECYCLE_TTL_SECONDS = _env_int("LIFECYCLE_NOTIFICATION_TTL_SECONDS", 172800, min_value=3600, max_value=604800)
S415C_LIFECYCLE_QUEUE_LIMIT = _env_int("LIFECYCLE_NOTIFICATION_QUEUE_LIMIT", 10, min_value=1, max_value=50)


def _s415c_event_type(item: dict[str, Any]) -> str:
    return str(item.get("lifecycleEventType") or item.get("lifecycleStatus") or "UNKNOWN").upper().strip()


def _s415c_lifecycle_event_key(item: dict[str, Any]) -> str:
    symbol = str(item.get("symbol") or "UNKNOWN").upper().strip()
    setup_slug = str(item.get("setupSlug") or "setup").strip()
    direction = str(item.get("direction") or "na").upper().strip()
    event_type = _s415c_event_type(item)
    session_date = resolve_session_date(item)
    trigger_bucket = resolve_trigger_bucket(item)
    return "|".join(
        [
            "LIFECYCLE",
            _clean_key_part(event_type),
            _clean_key_part(symbol),
            _clean_key_part(setup_slug),
            _clean_key_part(direction),
            _clean_key_part(session_date),
            _clean_key_part(trigger_bucket),
        ]
    )


def _s415c_lifecycle_delivered_key(event_key: str) -> str:
    return f"engine:lifecycle_notification_delivered:{str(event_key or '').strip()}"


def _s415c_load_lifecycle_items() -> list[dict[str, Any]]:
    payload = runtime_cache.get_json(S415_LIFECYCLE_CACHE_KEY)
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return [item for item in payload.get("items", []) if isinstance(item, dict)]
    return [item for item in SIGNAL_LIFECYCLE.values() if isinstance(item, dict)]


def _s415c_read_delivered_event(event_key: str) -> dict[str, Any] | None:
    if not event_key:
        return None
    record = runtime_cache.get_json(_s415c_lifecycle_delivered_key(event_key))
    return record if isinstance(record, dict) else None


def _s415c_load_delivered_index() -> dict[str, Any]:
    index = runtime_cache.get_json(S415C_LIFECYCLE_DELIVERED_INDEX_KEY)
    if isinstance(index, dict):
        items = index.get("items") if isinstance(index.get("items"), list) else []
        index["items"] = items[-500:]
        index["count"] = len(index["items"])
        return index
    return {
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": 0,
        "items": [],
    }


def _s415c_save_delivered_index(record: dict[str, Any], ttl_seconds: int = S415C_LIFECYCLE_TTL_SECONDS) -> dict[str, Any]:
    index = _s415c_load_delivered_index()
    items = index.get("items") if isinstance(index.get("items"), list) else []
    event_key = str(record.get("notificationEventKey") or "")
    items = [item for item in items if str(item.get("notificationEventKey") or "") != event_key]
    compact = {
        "notificationEventKey": event_key,
        "notificationEventType": record.get("notificationEventType"),
        "signalId": record.get("signalId"),
        "symbol": record.get("symbol"),
        "setupSlug": record.get("setupSlug"),
        "direction": record.get("direction"),
        "lifecycleStatus": record.get("lifecycleStatus"),
        "channel": record.get("channel"),
        "messageId": record.get("messageId"),
        "deliveryStatus": record.get("deliveryStatus"),
        "deliveredAt": record.get("deliveredAt"),
    }
    items.append(compact)
    index = {
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items[-500:]),
        "items": items[-500:],
    }
    runtime_cache.set_json(S415C_LIFECYCLE_DELIVERED_INDEX_KEY, index, ttl_seconds=ttl_seconds)
    return index


def _s415c_lifecycle_message_preview(item: dict[str, Any]) -> str:
    symbol = str(item.get("symbol") or "?").upper()
    direction = str(item.get("direction") or "?").upper()
    setup_name = item.get("setupName") or item.get("setupSlug") or "Setup"
    event_type = _s415c_event_type(item)
    current_price = item.get("currentPrice")
    current_r = item.get("currentR")
    entry = item.get("entry")
    stop = item.get("stop")
    tp1 = item.get("tp1")
    tp2 = item.get("tp2")
    guidance = item.get("guidance") if isinstance(item.get("guidance"), list) else []
    next_actions = item.get("nextActions") if isinstance(item.get("nextActions"), list) else []

    title_map = {
        "TP1_HIT": "TP1 hit",
        "TP2_HIT": "TP2 hit",
        "STOP_HIT": "Stop hit",
        "INVALIDATED": "Signal invalidated",
        "ENTRY_MISSED": "Entry missed",
        "WAIT_FOR_REENTRY": "Wait for re-entry",
        "SESSION_CLOSE": "Session close",
        "ENTRY_STILL_VALID": "Entry still valid",
        "STILL_VALID": "Still valid",
    }
    title = title_map.get(event_type, event_type.replace("_", " ").title())

    lines = [
        f"SkillEdge AI Update: {symbol} {direction}",
        f"Event: {title}",
        f"Setup: {setup_name}",
        "",
        f"Current price: {current_price}",
        f"Current R: {current_r}",
        f"Entry: {entry}",
        f"Stop: {stop}",
        f"TP1: {tp1}",
        f"TP2: {tp2}",
    ]
    if guidance:
        lines.extend(["", f"AI guidance: {guidance[0]}"])
    if next_actions:
        lines.append(f"Next action: {next_actions[0]}")
    lines.extend(["", "Open AI Signal Cockpit for chart, levels and management.", "Risk first. Not financial advice."])
    return "\n".join(lines)


def _s415c_evaluate_lifecycle_notification(item: dict[str, Any], include_review_only: bool = False) -> dict[str, Any]:
    event_type = _s415c_event_type(item)
    reasons: list[str] = []
    passed = True

    if event_type in S415C_LIFECYCLE_EVENT_TYPES:
        passed = True
    elif include_review_only and event_type in S415C_LIFECYCLE_REVIEW_ONLY_EVENT_TYPES:
        passed = True
        reasons.append("review_only_event_included")
    else:
        passed = False
        reasons.append("event_type_not_notification_enabled")

    if not str(item.get("signalId") or "").strip():
        passed = False
        reasons.append("missing_signal_id")

    if not str(item.get("symbol") or "").strip():
        passed = False
        reasons.append("missing_symbol")

    return {
        "passed": passed,
        "reasons": reasons,
        "eventType": event_type,
        "enabledEventTypes": sorted(S415C_LIFECYCLE_EVENT_TYPES),
        "reviewOnlyEventTypes": sorted(S415C_LIFECYCLE_REVIEW_ONLY_EVENT_TYPES),
    }


def mark_lifecycle_notification_delivered(
    *,
    lifecycle_item: dict[str, Any] | None = None,
    notification_event_key: str | None = None,
    signal_id: str | None = None,
    channel: str = "telegram",
    message_id: str | None = None,
    ttl_seconds: int = S415C_LIFECYCLE_TTL_SECONDS,
    dry_run: bool = False,
) -> dict[str, Any]:
    item = lifecycle_item if isinstance(lifecycle_item, dict) else {}
    event_key = str(notification_event_key or item.get("notificationEventKey") or _s415c_lifecycle_event_key(item)).strip()
    if not event_key:
        return {"ok": False, "error": "missing_notification_event_key", "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION}

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
        "notificationEventKey": event_key,
        "notificationEventType": item.get("notificationEventType") or _s415c_event_type(item),
        "signalId": signal_id or item.get("signalId"),
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "direction": item.get("direction"),
        "lifecycleStatus": item.get("lifecycleStatus"),
        "entryStatus": item.get("entryStatus"),
        "currentPrice": item.get("currentPrice"),
        "currentR": item.get("currentR"),
        "channel": channel or "telegram",
        "messageId": message_id,
        "deliveryStatus": "DRY_RUN" if dry_run else "DELIVERED",
        "deliveredAt": now_iso,
        "ttlSeconds": ttl_seconds,
    }
    ok = runtime_cache.set_json(_s415c_lifecycle_delivered_key(event_key), record, ttl_seconds=ttl_seconds)
    index = _s415c_save_delivered_index(record, ttl_seconds=ttl_seconds) if ok else _s415c_load_delivered_index()
    return {
        "ok": bool(ok),
        "record": record,
        "indexCount": index.get("count"),
        "key": _s415c_lifecycle_delivered_key(event_key),
        "cache": runtime_cache.get_status(),
    }


def build_lifecycle_notification_queue(
    limit: int = 25,
    include_delivered: bool = False,
    include_rejected: bool = False,
    include_review_only: bool = False,
) -> dict[str, Any]:
    lifecycle_items = _s415c_load_lifecycle_items()
    pending: list[dict[str, Any]] = []
    delivered: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for item in lifecycle_items:
        event_key = _s415c_lifecycle_event_key(item)
        notification = _s415c_evaluate_lifecycle_notification(item, include_review_only=include_review_only)
        compact = {
            "notificationEventType": notification.get("eventType"),
            "notificationEventKey": event_key,
            "notificationModel": "S4.15C lifecycle events",
            "lifecycleNotificationPolicy": notification,
            "signalId": item.get("signalId"),
            "symbol": item.get("symbol"),
            "setupSlug": item.get("setupSlug"),
            "setupName": item.get("setupName"),
            "direction": item.get("direction"),
            "lifecycleStatus": item.get("lifecycleStatus"),
            "lifecycleEventType": item.get("lifecycleEventType"),
            "entryStatus": item.get("entryStatus"),
            "currentPrice": item.get("currentPrice"),
            "currentR": item.get("currentR"),
            "entry": item.get("entry"),
            "stop": item.get("stop"),
            "tp1": item.get("tp1"),
            "tp2": item.get("tp2"),
            "vwap": item.get("vwap"),
            "ema20_5m": item.get("ema20_5m"),
            "triggerTime": item.get("triggerTime"),
            "evaluatedAt": item.get("evaluatedAt"),
            "guidance": item.get("guidance"),
            "nextActions": item.get("nextActions"),
            "timeline": item.get("timeline"),
            "chartLevels": item.get("chartLevels"),
            "messagePreview": _s415c_lifecycle_message_preview(item),
        }

        if not notification.get("passed"):
            compact["rejected"] = True
            rejected.append(compact)
            continue

        delivered_record = _s415c_read_delivered_event(event_key)
        if delivered_record:
            compact["delivered"] = True
            compact["deliveredRecord"] = delivered_record
            delivered.append(compact)
        else:
            compact["delivered"] = False
            pending.append(compact)

    pending = sorted(
        pending,
        key=lambda item: str(item.get("evaluatedAt") or item.get("triggerTime") or ""),
        reverse=True,
    )
    requested_limit = max(1, min(int(limit or 25), 100))
    effective_limit = min(requested_limit, S415C_LIFECYCLE_QUEUE_LIMIT)
    return {
        "ok": True,
        "sourceKey": S415_LIFECYCLE_CACHE_KEY,
        "sourceCount": len(lifecycle_items),
        "pendingCount": len(pending),
        "deliveredCount": len(delivered),
        "rejectedCount": len(rejected),
        "requestedLimit": requested_limit,
        "effectiveLimit": effective_limit,
        "items": pending[:effective_limit],
        "delivered": delivered if include_delivered else [],
        "rejected": rejected if include_rejected else [],
        "deliveredIndex": _s415c_load_delivered_index(),
        "notificationPolicy": {
            "version": S415C_LIFECYCLE_NOTIFICATION_VERSION,
            "model": "lifecycle_event_notifications_foundation",
            "generalTelegramEvents": sorted(S415C_LIFECYCLE_EVENT_TYPES),
            "reviewOnlyEvents": sorted(S415C_LIFECYCLE_REVIEW_ONLY_EVENT_TYPES),
            "dedupe": "one notificationEventKey per lifecycle event",
            "personalUpdatesLater": "userId + signalId/eventKey after Follow idea / I entered",
        },
        "cache": runtime_cache.get_status(),
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/engine/lifecycle/notifications/queue")
def engine_lifecycle_notifications_queue(
    limit: int = 25,
    include_delivered: bool = False,
    include_rejected: bool = False,
    include_review_only: bool = False,
):
    return build_lifecycle_notification_queue(
        limit=limit,
        include_delivered=include_delivered,
        include_rejected=include_rejected,
        include_review_only=include_review_only,
    )


@app.get("/engine/lifecycle/notifications/delivered")
def engine_lifecycle_notifications_delivered():
    return {
        "ok": True,
        "index": _s415c_load_delivered_index(),
        "cache": runtime_cache.get_status(),
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
    }


@app.post("/engine/lifecycle/notifications/mark")
def engine_lifecycle_notifications_mark(
    notification_event_key: str,
    signal_id: str | None = None,
    channel: str = "telegram",
    message_id: str | None = None,
    ttl_seconds: int = S415C_LIFECYCLE_TTL_SECONDS,
    dry_run: bool = False,
):
    lifecycle_items = _s415c_load_lifecycle_items()
    item = next((row for row in lifecycle_items if _s415c_lifecycle_event_key(row) == notification_event_key), {})
    if isinstance(item, dict):
        item["notificationEventKey"] = notification_event_key
    result = mark_lifecycle_notification_delivered(
        lifecycle_item=item,
        notification_event_key=notification_event_key,
        signal_id=signal_id,
        channel=channel,
        message_id=message_id,
        ttl_seconds=ttl_seconds,
        dry_run=dry_run,
    )
    return {
        "ok": bool(result.get("ok")),
        "result": result,
        "queue": build_lifecycle_notification_queue(limit=25, include_delivered=False),
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
    }


@app.post("/engine/lifecycle/notifications/mark-batch")
def engine_lifecycle_notifications_mark_batch(
    limit: int = 25,
    channel: str = "telegram",
    ttl_seconds: int = S415C_LIFECYCLE_TTL_SECONDS,
    dry_run: bool = True,
):
    queue = build_lifecycle_notification_queue(limit=limit, include_delivered=False)
    marked: list[dict[str, Any]] = []
    for item in queue.get("items", []):
        if not isinstance(item, dict):
            continue
        marked.append(
            mark_lifecycle_notification_delivered(
                lifecycle_item=item,
                notification_event_key=item.get("notificationEventKey"),
                signal_id=item.get("signalId"),
                channel=channel,
                ttl_seconds=ttl_seconds,
                dry_run=dry_run,
            )
        )
    return {
        "ok": True,
        "dryRun": dry_run,
        "requestedLimit": limit,
        "markedCount": sum(1 for item in marked if item.get("ok")),
        "items": marked,
        "queueAfter": build_lifecycle_notification_queue(limit=limit, include_delivered=False),
        "cache": runtime_cache.get_status(),
        "storageVersion": S415C_LIFECYCLE_NOTIFICATION_VERSION,
    }

# ---------------------------------------------------------------------------
# S4.16 Signal Cockpit API РІР‚вЂќ compact dashboard-ready payload
# ---------------------------------------------------------------------------

S416_COCKPIT_VERSION = "s416d_cockpit_frontend_safety_v1"
S416_COCKPIT_COMPACT_CACHE_KEY = "engine:signal_cockpit_compact"
S416_CLOSED_LIFECYCLE_STATUSES = {"TP1_HIT", "TP2_HIT", "STOP_HIT", "INVALIDATED", "SESSION_CLOSE"}


def _s416_is_actionable_status(status: Any) -> bool:
    normalized = str(status or "").upper().strip()
    return normalized not in S416_CLOSED_LIFECYCLE_STATUSES


def _s416_safe_float(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace("%", "").replace(",", "").replace("$", "").strip())
        except Exception:
            return fallback
    return fallback


def _s416_round(value: Any, digits: int = 4) -> float | None:
    parsed = _s416_safe_float(value)
    if parsed is None:
        return None
    return round(parsed, digits)


def _s416_first_target(targets: Any, index: int = 0) -> dict[str, Any]:
    if isinstance(targets, list) and len(targets) > index and isinstance(targets[index], dict):
        return targets[index]
    return {}


def _s416_get_cached_items(cache_key: str) -> list[dict[str, Any]]:
    """Read a runtime-cache collection in a tolerant way.

    Older/newer runtime cache writers may store collection payloads as:
    - {items: [...]}
    - [...]
    - {value: {items: [...]}}
    Cockpit must not go blank when the envelope changes.
    """
    payload = runtime_cache.get_json(cache_key)

    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]

        value = payload.get("value")
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested_items = value.get("items")
            if isinstance(nested_items, list):
                return [item for item in nested_items if isinstance(item, dict)]

    return []


def _s416_get_lifecycle_items() -> list[dict[str, Any]]:
    cached = _s416_get_cached_items(S415_LIFECYCLE_CACHE_KEY)
    if cached:
        return cached
    return [item for item in SIGNAL_LIFECYCLE.values() if isinstance(item, dict)]


def _s416_memory_or_cached_items(memory_collection: Any, cache_key: str) -> list[dict[str, Any]]:
    """Return live in-memory items, falling back to Upstash/local runtime cache.

    This matters after an API restart: the engine loop may have already
    published WATCH/ARMED/ACTIVE to Redis, while this FastAPI process has an
    empty Python memory state. The Cockpit API should still be able to render
    the dashboard from runtime cache.
    """

    try:
        memory_items = [item for item in memory_collection.values() if isinstance(item, dict)]
    except Exception:
        memory_items = []

    if memory_items:
        return memory_items

    return _s416_get_cached_items(cache_key)


def _s416_watchlist_items() -> list[dict[str, Any]]:
    return _s416_memory_or_cached_items(WATCHLIST, "engine:watchlist")


def _s416_armed_items() -> list[dict[str, Any]]:
    return _s416_memory_or_cached_items(ARMED, "engine:armed")


def _s416_active_items() -> list[dict[str, Any]]:
    return _s416_memory_or_cached_items(ACTIVE, "engine:active")


def _s416_signal_items() -> list[dict[str, Any]]:
    return _s416_memory_or_cached_items(SIGNALS, "engine:signals")


def _s416_find_symbol(items: list[dict[str, Any]], symbol: str) -> dict[str, Any]:
    wanted = str(symbol or "").upper().strip()
    for item in items:
        if not isinstance(item, dict):
            continue
        payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
        item_symbol = str(payload.get("symbol") or item.get("symbol") or "").upper().strip()
        if item_symbol == wanted:
            return item
    return {}


def _s416_get_selected_parts(symbol: str) -> dict[str, dict[str, Any]]:
    wanted = str(symbol or "").upper().strip()
    if not wanted:
        return {"watch": {}, "trade": {}}

    watch_raw = _s416_find_symbol(_s416_watchlist_items(), wanted)
    trade_raw = (
        _s416_find_symbol(_s416_active_items(), wanted)
        or _s416_find_symbol(_s416_armed_items(), wanted)
        or _s416_find_symbol(_s416_signal_items(), wanted)
        or watch_raw
    )

    return {"watch": watch_raw or {}, "trade": trade_raw or {}}


def _s416_latest_by_symbol(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in items:
        symbol = str(item.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        existing = result.get(symbol)
        item_time = str(item.get("evaluatedAt") or item.get("createdAt") or item.get("updatedAt") or "")
        existing_time = str(existing.get("evaluatedAt") or existing.get("createdAt") or existing.get("updatedAt") or "") if isinstance(existing, dict) else ""
        if not existing or item_time >= existing_time:
            result[symbol] = item
    return result


def _s416_compact_watch_item(item: dict[str, Any], lifecycle_by_symbol: dict[str, dict[str, Any]]) -> dict[str, Any]:
    symbol = str(item.get("symbol") or "").upper().strip()
    lifecycle = lifecycle_by_symbol.get(symbol, {})
    return {
        "symbol": symbol,
        "name": item.get("name"),
        "exchange": item.get("exchange"),
        "status": lifecycle.get("lifecycleStatus") or item.get("status") or "WATCH",
        "engineStatus": item.get("status") or "WATCH",
        "price": _s416_round(item.get("price")),
        "changePercent": _s416_round(item.get("changePercent"), 2),
        "volume": _s416_round(item.get("volume"), 0),
        "marketCap": _s416_round(item.get("marketCap"), 0),
        "universe": item.get("universe"),
        "sourceBucket": item.get("sourceBucket"),
        "inPlayScore": item.get("inPlayScore"),
        "rankReasons": item.get("reasons") if isinstance(item.get("reasons"), list) else [],
        "lifecycleStatus": lifecycle.get("lifecycleStatus"),
        "entryStatus": lifecycle.get("entryStatus"),
        "currentR": lifecycle.get("currentR"),
        "isActionable": _s416_is_actionable_status(lifecycle.get("lifecycleStatus") or item.get("status") or "WATCH"),
        "updatedAt": item.get("updatedAt") or lifecycle.get("evaluatedAt"),
    }


def _s416_compact_signal_item(item: dict[str, Any], lifecycle_by_symbol: dict[str, dict[str, Any]]) -> dict[str, Any]:
    payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
    symbol = str(payload.get("symbol") or item.get("symbol") or "").upper().strip()
    lifecycle = lifecycle_by_symbol.get(symbol, {})
    targets = payload.get("targets") if isinstance(payload.get("targets"), list) else item.get("targets")
    tp1 = _s416_first_target(targets, 0)
    tp2 = _s416_first_target(targets, 1)
    return {
        "signalId": payload.get("signalId") or item.get("signalId"),
        "symbol": symbol,
        "setupSlug": payload.get("setupSlug") or item.get("setupSlug"),
        "setupName": payload.get("setupName") or item.get("setupName"),
        "direction": payload.get("direction") or item.get("direction"),
        "status": lifecycle.get("lifecycleStatus") or payload.get("status") or item.get("status"),
        "engineStatus": payload.get("status") or item.get("status"),
        "qualityStatus": payload.get("qualityStatus") or item.get("qualityStatus"),
        "grade": payload.get("signalGrade") or item.get("signalGrade"),
        "score": payload.get("signalScore") or item.get("signalScore"),
        "premiumSignal": bool(payload.get("premiumSignal") or item.get("premiumSignal")),
        "telegramEligible": bool(payload.get("telegramEligible") or item.get("telegramEligible")),
        "qualityGuard": (payload.get("qualityGuard") if isinstance(payload.get("qualityGuard"), dict) else item.get("qualityGuard") if isinstance(item.get("qualityGuard"), dict) else None),
        "entry": _s416_round(payload.get("entry") or item.get("entry")),
        "entryZone": payload.get("entryZone") or item.get("entryZone"),
        "stop": _s416_round(payload.get("stop") or item.get("stop")),
        "tp1": _s416_round(tp1.get("price")),
        "tp1R": tp1.get("rr"),
        "tp2": _s416_round(tp2.get("price")),
        "tp2R": tp2.get("rr"),
        "rrToTp1": payload.get("rrToTp1") or item.get("rrToTp1"),
        "rrToTp2": payload.get("rrToTp2") or item.get("rrToTp2"),
        "primaryTrigger": payload.get("primaryTrigger") or item.get("primaryTrigger"),
        "triggers": payload.get("triggers") if isinstance(payload.get("triggers"), list) else item.get("triggers") or [],
        "createdAt": payload.get("createdAt") or item.get("createdAt"),
        "triggerTime": payload.get("triggerTime") or item.get("triggerTime"),
        "updatedAt": payload.get("updatedAt") or item.get("updatedAt") or lifecycle.get("evaluatedAt") or payload.get("createdAt") or item.get("createdAt"),
        "currentPriceUpdatedAt": lifecycle.get("evaluatedAt") or payload.get("updatedAt") or item.get("updatedAt") or payload.get("createdAt") or item.get("createdAt"),
        "lifecycleStatus": lifecycle.get("lifecycleStatus"),
        "entryStatus": lifecycle.get("entryStatus"),
        "currentPrice": lifecycle.get("currentPrice"),
        "currentR": lifecycle.get("currentR"),
        "isActionable": _s416_is_actionable_status(lifecycle.get("lifecycleStatus") or payload.get("status") or item.get("status")),
        "guidance": lifecycle.get("guidance") if isinstance(lifecycle.get("guidance"), list) else [],
        "nextActions": lifecycle.get("nextActions") if isinstance(lifecycle.get("nextActions"), list) else [],
    }


def _s416_compact_lifecycle_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "signalId": item.get("signalId"),
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "setupName": item.get("setupName"),
        "direction": item.get("direction"),
        "lifecycleStatus": item.get("lifecycleStatus"),
        "lifecycleEventType": item.get("lifecycleEventType"),
        "entryStatus": item.get("entryStatus"),
        "currentPrice": item.get("currentPrice"),
        "currentR": item.get("currentR"),
        "isActionable": _s416_is_actionable_status(item.get("lifecycleStatus")),
        "entry": item.get("entry"),
        "stop": item.get("stop"),
        "tp1": item.get("tp1"),
        "tp2": item.get("tp2"),
        "triggerTime": item.get("triggerTime"),
        "evaluatedAt": item.get("evaluatedAt"),
        "reasons": item.get("reasons") if isinstance(item.get("reasons"), list) else [],
        "guidance": item.get("guidance") if isinstance(item.get("guidance"), list) else [],
        "nextActions": item.get("nextActions") if isinstance(item.get("nextActions"), list) else [],
        "chartLevels": item.get("chartLevels") if isinstance(item.get("chartLevels"), dict) else {},
        "timeline": item.get("timeline") if isinstance(item.get("timeline"), list) else [],
        "aiQuestionContext": item.get("aiQuestionContext") if isinstance(item.get("aiQuestionContext"), dict) else {},
    }


def _s416_get_selected_raw(symbol: str) -> dict[str, Any]:
    # Backward-compatible wrapper. Prefer trade item for selected signal/chart.
    return _s416_get_selected_parts(symbol).get("trade", {})


def _s416_extract_chart_snapshot(raw: dict[str, Any], include_candles: bool = False, candle_limit: int = 80) -> dict[str, Any]:
    source = raw.get("source") if isinstance(raw.get("source"), dict) else {}
    candle_context = source.get("candleContext") if isinstance(source.get("candleContext"), dict) else {}
    signal = raw.get("signal") if isinstance(raw.get("signal"), dict) else raw
    snapshot = {
        "latestPrice": candle_context.get("latestPrice") or signal.get("entry") or raw.get("price"),
        "latestCandleAt": candle_context.get("latestCandleAt"),
        "latestFiveMinuteCandleAt": candle_context.get("latestFiveMinuteCandleAt"),
        "vwap": candle_context.get("vwap"),
        "ema20_5m": candle_context.get("ema20_5m"),
        "atr14_5m": candle_context.get("atr14_5m"),
        "rsi14_5m": candle_context.get("rsi14_5m"),
        "hod": candle_context.get("hod"),
        "lod": candle_context.get("lod"),
        "openingRange": candle_context.get("openingRange"),
        "volumeAcceleration": candle_context.get("volumeAcceleration"),
        "pullbackFromHodPct": candle_context.get("pullbackFromHodPct"),
        "confirmation": candle_context.get("confirmation"),
    }
    if include_candles:
        candles = candle_context.get("recentFiveMinuteCandles") if isinstance(candle_context.get("recentFiveMinuteCandles"), list) else []
        safe_limit = max(5, min(int(candle_limit or 80), 250))
        snapshot["recentFiveMinuteCandles"] = candles[-safe_limit:]
    else:
        snapshot["recentFiveMinuteCandlesCount"] = len(candle_context.get("recentFiveMinuteCandles") or []) if isinstance(candle_context.get("recentFiveMinuteCandles"), list) else 0
    return snapshot


def _s416_build_chart_levels(lifecycle: dict[str, Any], compact_signal: dict[str, Any] | None, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return chart overlay levels even when lifecycle has not refreshed yet.

    The frontend page must be able to draw entry/stop/targets immediately
    from the active signal. When lifecycle exists, lifecycle chartLevels stay
    the source of truth; otherwise we fall back to the compact signal and
    candle snapshot VWAP/EMA.
    """

    if isinstance(lifecycle.get("chartLevels"), dict) and lifecycle.get("chartLevels"):
        return lifecycle.get("chartLevels")

    levels: dict[str, Any] = {}
    if isinstance(compact_signal, dict):
        for source_key, target_key in (
            ("entry", "entry"),
            ("stop", "stop"),
            ("tp1", "tp1"),
            ("tp2", "tp2"),
        ):
            value = compact_signal.get(source_key)
            if value is not None:
                levels[target_key] = value

    if isinstance(snapshot, dict):
        if snapshot.get("vwap") is not None:
            levels["vwap"] = snapshot.get("vwap")
        if snapshot.get("ema20_5m") is not None:
            levels["ema20_5m"] = snapshot.get("ema20_5m")

    return levels


def _s416_default_ai_guidance(raw: dict[str, Any], compact_signal: dict[str, Any] | None, lifecycle: dict[str, Any]) -> list[str]:
    if isinstance(lifecycle.get("guidance"), list) and lifecycle.get("guidance"):
        return lifecycle.get("guidance")

    status = str((compact_signal or {}).get("status") or raw.get("status") or "").upper()
    quality = str((compact_signal or {}).get("qualityStatus") or raw.get("qualityStatus") or "").upper()
    if status == "ACTIVE" or quality == "PASSED":
        return [
            "Signal is active. Use the displayed entry, stop and target levels.",
            "Lifecycle management will update after the next engine lifecycle pass.",
        ]
    if status == "ARMED":
        return ["Setup is armed. Wait for confirmation before treating it as an active trade idea."]
    if status == "WATCH":
        return ["Ticker is on the AI watchlist. No active trade idea is confirmed yet."]
    return []


def _s416_default_next_actions(raw: dict[str, Any], compact_signal: dict[str, Any] | None, lifecycle: dict[str, Any]) -> list[str]:
    if isinstance(lifecycle.get("nextActions"), list) and lifecycle.get("nextActions"):
        return lifecycle.get("nextActions")

    status = str((compact_signal or {}).get("status") or raw.get("status") or "").upper()
    quality = str((compact_signal or {}).get("qualityStatus") or raw.get("qualityStatus") or "").upper()
    if status == "ACTIVE" or quality == "PASSED":
        return ["Wait for lifecycle status before chasing a late entry."]
    if status == "ARMED":
        return ["Watch for execution confirmation: EMA/VWAP rejection, lower high, or failed reclaim."]
    return []


def _s416_build_selected_symbol(symbol: str | None, lifecycle_by_symbol: dict[str, dict[str, Any]], include_candles: bool = False) -> dict[str, Any] | None:
    wanted = str(symbol or "").upper().strip()
    if not wanted:
        return None
    parts = _s416_get_selected_parts(wanted)
    watch_raw = parts.get("watch", {})
    raw = parts.get("trade", {})
    lifecycle = lifecycle_by_symbol.get(wanted, {})
    if not raw and not lifecycle and not watch_raw:
        return {
            "symbol": wanted,
            "found": False,
            "status": "NOT_FOUND",
            "message": "Symbol is not currently in WATCH/ARMED/ACTIVE/SIGNALS runtime collections or runtime cache.",
        }

    signal_candidate = raw.get("signal") if isinstance(raw.get("signal"), dict) else raw
    compact_signal = _s416_compact_signal_item(signal_candidate, lifecycle_by_symbol) if signal_candidate else None

    if isinstance(compact_signal, dict) and lifecycle:
        # Prefer lifecycle trigger time/current state for selected signal display.
        compact_signal["triggerTime"] = compact_signal.get("triggerTime") or lifecycle.get("triggerTime")
        compact_signal["currentPrice"] = lifecycle.get("currentPrice")
        compact_signal["currentR"] = lifecycle.get("currentR")
        compact_signal["lifecycleStatus"] = lifecycle.get("lifecycleStatus")
        compact_signal["entryStatus"] = lifecycle.get("entryStatus")

    watch_source = watch_raw or raw
    chart_source = raw or watch_raw
    snapshot = _s416_extract_chart_snapshot(chart_source, include_candles=include_candles) if chart_source else {}
    chart_levels = _s416_build_chart_levels(lifecycle, compact_signal, snapshot)
    effective_status = lifecycle.get("lifecycleStatus") or (compact_signal.get("status") if isinstance(compact_signal, dict) else None) or (raw.get("status") if isinstance(raw, dict) else None)
    lifecycle_available = bool(lifecycle)
    return {
        "symbol": wanted,
        "found": True,
        "status": effective_status,
        "watchItem": _s416_compact_watch_item(watch_source, lifecycle_by_symbol) if watch_source else None,
        "signal": compact_signal,
        "lifecycle": _s416_compact_lifecycle_item(lifecycle) if lifecycle else None,
        "lifecycleAvailable": lifecycle_available,
        "needsLifecycleRefresh": bool(compact_signal and not lifecycle_available and _s416_is_actionable_status(effective_status)),
        "chart": {
            "levels": chart_levels,
            "snapshot": snapshot,
        },
        "aiPanel": {
            "headline": lifecycle.get("lifecycleStatus") or raw.get("qualityStatus") or raw.get("status"),
            "isActionable": _s416_is_actionable_status(lifecycle.get("lifecycleStatus") or raw.get("status")),
            "sessionClosed": bool(lifecycle.get("sessionClosed") or lifecycle.get("lifecycleStatus") == "SESSION_CLOSE"),
            "lifecycleAvailable": lifecycle_available,
            "needsLifecycleRefresh": bool(compact_signal and not lifecycle_available and _s416_is_actionable_status(effective_status)),
            "guidance": _s416_default_ai_guidance(raw, compact_signal, lifecycle),
            "nextActions": _s416_default_next_actions(raw, compact_signal, lifecycle),
            "timeline": lifecycle.get("timeline") if isinstance(lifecycle.get("timeline"), list) else [],
            "questionContext": lifecycle.get("aiQuestionContext") if isinstance(lifecycle.get("aiQuestionContext"), dict) else {
                "canAsk": bool(raw or watch_raw),
                "supportedQuestions": [
                    "Is entry still valid?",
                    "Did I miss the entry?",
                    "Should I wait for re-entry?",
                    "Is this signal invalidated?",
                    "What changed after TP1?",
                ],
                "engineAnswerMode": "rules_first_llm_explanation_later",
            },
        },
    }




# === S5.13 Quality Guard Report / Explain Why Blocked ========================
S513_QUALITY_GUARD_REPORT_VERSION = "s5_13_quality_guard_report_v1"


def _s513_unwrap_signal_payload(item: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
    return payload if isinstance(payload, dict) else {}


def _s513_get_quality_guard(item: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    payload = _s513_unwrap_signal_payload(item)
    guard = payload.get("qualityGuard")
    if isinstance(guard, dict):
        return guard
    guard = item.get("qualityGuard")
    if isinstance(guard, dict):
        return guard
    return {}


def _s513_to_number(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        text_value = str(value).replace("%", "").replace("$", "").replace(",", "").strip()
        if text_value == "":
            return fallback
        return float(text_value)
    except Exception:
        return fallback


def _s513_unique_ideas(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []

    for item in items or []:
        if not isinstance(item, dict):
            continue
        payload = _s513_unwrap_signal_payload(item)
        symbol = str(payload.get("symbol") or item.get("symbol") or "").upper().strip()
        setup_slug = str(payload.get("setupSlug") or item.get("setupSlug") or "").strip()
        direction = str(payload.get("direction") or item.get("direction") or "").strip()
        signal_id = str(payload.get("signalId") or item.get("signalId") or "").strip()
        key = signal_id or f"{symbol}|{setup_slug}|{direction}"
        if not symbol or key in seen:
            continue
        seen.add(key)
        out.append(item)

    return out


def _s513_counter_to_rows(counter: dict[str, int], examples: dict[str, list[str]], limit: int = 12) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for reason, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]:
        rows.append({
            "reason": reason,
            "count": count,
            "examples": examples.get(reason, [])[:8],
        })
    return rows


def _s513_add_reason(counter: dict[str, int], examples: dict[str, list[str]], reason: Any, symbol: str) -> None:
    reason_text = str(reason or "").strip()
    if not reason_text:
        return
    counter[reason_text] = counter.get(reason_text, 0) + 1
    if symbol and len(examples.setdefault(reason_text, [])) < 8 and symbol not in examples[reason_text]:
        examples[reason_text].append(symbol)


def _s513_quality_guard_report_from_items(
    items: list[dict[str, Any]],
    *,
    watch_count: int = 0,
    lifecycle_count: int = 0,
    limit: int = 30,
) -> dict[str, Any]:
    """Read-only report explaining why ideas passed/failed S5.12 quality gate."""

    unique_items = _s513_unique_ideas(items)
    max_rows = max(5, min(int(limit or 30), 80))

    telegram_counter: dict[str, int] = {}
    telegram_examples: dict[str, list[str]] = {}
    desk_counter: dict[str, int] = {}
    desk_examples: dict[str, list[str]] = {}

    evaluated_count = 0
    with_guard_count = 0
    no_guard_count = 0
    desk_passed_count = 0
    desk_blocked_count = 0
    telegram_passed_count = 0
    telegram_blocked_count = 0

    elite_ready: list[dict[str, Any]] = []
    near_elite: list[dict[str, Any]] = []
    blocked_ideas: list[dict[str, Any]] = []

    for item in unique_items:
        payload = _s513_unwrap_signal_payload(item)
        guard = _s513_get_quality_guard(item)

        symbol = str(payload.get("symbol") or item.get("symbol") or "").upper().strip()
        setup_slug = payload.get("setupSlug") or item.get("setupSlug")
        setup_name = payload.get("setupName") or item.get("setupName")
        direction = payload.get("direction") or item.get("direction")
        status = payload.get("status") or item.get("status")
        quality_status = payload.get("qualityStatus") or item.get("qualityStatus")
        grade = payload.get("signalGrade") or item.get("signalGrade") or payload.get("grade") or item.get("grade")
        score = _s513_to_number(payload.get("signalScore") or item.get("signalScore") or payload.get("score") or item.get("score"), 0) or 0
        rr_to_tp1 = _s513_to_number(payload.get("rrToTp1") or item.get("rrToTp1"))
        telegram_eligible = bool(payload.get("telegramEligible") or item.get("telegramEligible"))
        premium_signal = bool(payload.get("premiumSignal") or item.get("premiumSignal"))

        evaluated_count += 1

        metrics = guard.get("metrics") if isinstance(guard.get("metrics"), dict) else {}
        entry_distance_pct = metrics.get("entryDistancePct")
        trigger_count = metrics.get("triggerCount")
        execution_trigger_count = metrics.get("executionTriggerCount")

        if guard:
            with_guard_count += 1
            desk_passed = bool(guard.get("deskPassed"))
            telegram_passed = bool(guard.get("telegramPassed"))
            desk_reasons = guard.get("deskReasons") if isinstance(guard.get("deskReasons"), list) else []
            telegram_reasons = guard.get("telegramReasons") if isinstance(guard.get("telegramReasons"), list) else []
        else:
            no_guard_count += 1
            desk_passed = str(status or "").upper() == "ACTIVE" and str(quality_status or "").upper() == "PASSED"
            telegram_passed = telegram_eligible
            desk_reasons = ["quality_guard_missing_on_cached_record"]
            telegram_reasons = ["quality_guard_missing_on_cached_record"] if not telegram_passed else ["telegram_elite_quality_passed"]

        if desk_passed:
            desk_passed_count += 1
        else:
            desk_blocked_count += 1
            for reason in desk_reasons or ["desk_quality_not_passed"]:
                _s513_add_reason(desk_counter, desk_examples, reason, symbol)

        if telegram_passed:
            telegram_passed_count += 1
        else:
            telegram_blocked_count += 1
            for reason in telegram_reasons or ["telegram_quality_not_passed"]:
                _s513_add_reason(telegram_counter, telegram_examples, reason, symbol)

        row = {
            "symbol": symbol,
            "setupSlug": setup_slug,
            "setupName": setup_name,
            "direction": direction,
            "status": status,
            "qualityStatus": quality_status,
            "grade": grade,
            "score": score,
            "rrToTp1": rr_to_tp1,
            "telegramEligible": telegram_eligible,
            "premiumSignal": premium_signal,
            "deskPassed": desk_passed,
            "telegramPassed": telegram_passed,
            "rejectStatus": guard.get("rejectStatus") if guard else None,
            "deskReasons": desk_reasons,
            "telegramReasons": telegram_reasons,
            "metrics": {
                "entryDistancePct": entry_distance_pct,
                "triggerCount": trigger_count,
                "executionTriggerCount": execution_trigger_count,
            },
        }

        if telegram_passed or telegram_eligible:
            elite_ready.append(row)
        elif desk_passed and score >= 90 and (rr_to_tp1 is None or rr_to_tp1 >= 2):
            near_elite.append(row)

        if not telegram_passed:
            blocked_ideas.append(row)

    blocked_ideas = sorted(blocked_ideas, key=lambda row: (-(row.get("score") or 0), str(row.get("symbol") or "")))[:max_rows]
    near_elite = sorted(near_elite, key=lambda row: (-(row.get("score") or 0), str(row.get("symbol") or "")))[:max_rows]
    elite_ready = sorted(elite_ready, key=lambda row: (-(row.get("score") or 0), str(row.get("symbol") or "")))[:max_rows]

    return {
        "version": S513_QUALITY_GUARD_REPORT_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "explain_why_blocked_read_only_report",
        "totals": {
            "watchCount": watch_count,
            "lifecycleCount": lifecycle_count,
            "evaluatedIdeaCount": evaluated_count,
            "withQualityGuardCount": with_guard_count,
            "withoutQualityGuardCount": no_guard_count,
            "deskPassedCount": desk_passed_count,
            "deskBlockedCount": desk_blocked_count,
            "telegramPassedCount": telegram_passed_count,
            "telegramBlockedCount": telegram_blocked_count,
            "nearEliteCount": len(near_elite),
            "eliteReadyCount": len(elite_ready),
        },
        "policy": {
            "deskActive": [
                "fresh candles",
                "real active trigger",
                "RR >= 2R",
                "grade A/A+",
                "valid structural stop",
                "entry distance <= 3%",
                "no single lower_high/higher_low without execution confirmation",
            ],
            "telegramElite": [
                "score >= 92",
                "RR >= 2.2R",
                "execution trigger required",
                "entry distance <= 1.25%",
                "no sub-$1 names",
                "small caps need >= 1M volume",
                "no lower_high/higher_low alone",
            ],
        },
        "byTelegramBlockReason": _s513_counter_to_rows(telegram_counter, telegram_examples),
        "byDeskBlockReason": _s513_counter_to_rows(desk_counter, desk_examples),
        "nearElite": near_elite,
        "eliteReady": elite_ready,
        "blockedIdeas": blocked_ideas,
        "interpretation": {
            "telegramEligibleZeroIsAllowed": True,
            "meaning": "Telegram/Elite is deliberately stricter than Cockpit ACTIVE. A zero telegram-ready count can be correct when ideas are active but missing elite confirmation.",
            "nextProductStep": "Show this report in Cockpit so clients understand why AI is waiting instead of spamming signals.",
        },
    }




# === S5.13 SAFE report rebuilt from the already-working Cockpit payload ======
S513_SAFE_REPORT_VERSION = "s5_13_safe_explain_why_blocked_v1"


def _s513safe_num(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        cleaned = str(value).replace("%", "").replace("$", "").replace(",", "").strip()
        if not cleaned:
            return fallback
        return float(cleaned)
    except Exception:
        return fallback


def _s513safe_add_reason(counter: dict[str, int], examples: dict[str, list[str]], reason: str, symbol: str) -> None:
    reason = str(reason or "").strip()
    if not reason:
        return
    counter[reason] = counter.get(reason, 0) + 1
    if symbol:
        examples.setdefault(reason, [])
        if len(examples[reason]) < 8 and symbol not in examples[reason]:
            examples[reason].append(symbol)


def _s513safe_reason_rows(counter: dict[str, int], examples: dict[str, list[str]], limit: int = 12) -> list[dict[str, Any]]:
    return [
        {"reason": reason, "count": count, "examples": examples.get(reason, [])[:8]}
        for reason, count in sorted(counter.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]
    ]


def _s513safe_has_execution_trigger(item: dict[str, Any]) -> bool:
    triggers = item.get("triggers") if isinstance(item.get("triggers"), list) else []
    trigger_text = " ".join(str(x).lower() for x in triggers)
    execution_words = (
        "vwap", "ema20", "breakdown", "breakout", "reclaim", "rejection",
        "volume", "confirmation", "loss", "bounce", "stuff", "opening_range",
    )
    return any(word in trigger_text for word in execution_words)


def _s513safe_compact_quality_report(
    items: list[dict[str, Any]],
    *,
    watch_count: int = 0,
    lifecycle_count: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    """Read-only quality report from compact Cockpit items.

    This intentionally depends on the same items the working Cockpit already displays.
    It does not read/write cache and cannot zero the watchlist/active/armed data.
    """
    safe_limit = max(5, min(int(limit or 50), 120))
    unique: dict[str, dict[str, Any]] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").upper().strip()
        setup = str(item.get("setupSlug") or item.get("setupName") or "").strip()
        direction = str(item.get("direction") or "").strip()
        signal_id = str(item.get("signalId") or "").strip()
        key = signal_id or f"{symbol}|{setup}|{direction}"
        if symbol and key not in unique:
            unique[key] = item

    evaluated = list(unique.values())
    telegram_counter: dict[str, int] = {}
    telegram_examples: dict[str, list[str]] = {}
    desk_counter: dict[str, int] = {}
    desk_examples: dict[str, list[str]] = {}

    with_guard = 0
    without_guard = 0
    desk_passed_count = 0
    desk_blocked_count = 0
    telegram_passed_count = 0
    telegram_blocked_count = 0
    near_elite: list[dict[str, Any]] = []
    elite_ready: list[dict[str, Any]] = []
    blocked_ideas: list[dict[str, Any]] = []

    for item in evaluated:
        symbol = str(item.get("symbol") or "").upper().strip()
        score = _s513safe_num(item.get("score"), 0) or 0
        rr = _s513safe_num(item.get("rrToTp1") or item.get("tp1R"))
        entry = _s513safe_num(item.get("entry") or item.get("currentPrice"))
        status = str(item.get("engineStatus") or item.get("status") or "").upper()
        quality_status = str(item.get("qualityStatus") or "").upper()
        is_actionable = bool(item.get("isActionable"))
        telegram_eligible = bool(item.get("telegramEligible"))
        guard = item.get("qualityGuard") if isinstance(item.get("qualityGuard"), dict) else {}

        if guard:
            with_guard += 1
            desk_passed = bool(guard.get("deskPassed"))
            telegram_passed = bool(guard.get("telegramPassed")) or telegram_eligible
            desk_reasons = guard.get("deskReasons") if isinstance(guard.get("deskReasons"), list) else []
            telegram_reasons = guard.get("telegramReasons") if isinstance(guard.get("telegramReasons"), list) else []
        else:
            without_guard += 1
            desk_passed = is_actionable or status == "ACTIVE" or quality_status in ("PASSED", "LIFECYCLE_ACTIVE")
            telegram_passed = telegram_eligible
            desk_reasons = [] if desk_passed else ["not_currently_actionable_or_quality_not_passed"]
            telegram_reasons = []
            if not telegram_passed:
                if score < 92:
                    telegram_reasons.append("score_below_92")
                if rr is not None and rr < 2.2:
                    telegram_reasons.append("rr_below_2_2")
                if not _s513safe_has_execution_trigger(item):
                    telegram_reasons.append("execution_confirmation_missing_or_not_cached")
                if entry is not None and entry < 1:
                    telegram_reasons.append("price_below_1")
                if not telegram_reasons:
                    telegram_reasons.append("telegram_guard_blocked_or_not_ready")

        if desk_passed:
            desk_passed_count += 1
        else:
            desk_blocked_count += 1
            for reason in desk_reasons or ["desk_guard_blocked"]:
                _s513safe_add_reason(desk_counter, desk_examples, reason, symbol)

        if telegram_passed:
            telegram_passed_count += 1
        else:
            telegram_blocked_count += 1
            for reason in telegram_reasons or ["telegram_guard_blocked_or_not_ready"]:
                _s513safe_add_reason(telegram_counter, telegram_examples, reason, symbol)

        row = {
            "symbol": symbol,
            "setupSlug": item.get("setupSlug"),
            "setupName": item.get("setupName"),
            "direction": item.get("direction"),
            "status": item.get("status"),
            "engineStatus": item.get("engineStatus"),
            "qualityStatus": item.get("qualityStatus"),
            "grade": item.get("grade"),
            "score": score,
            "rrToTp1": rr,
            "telegramEligible": telegram_eligible,
            "premiumSignal": bool(item.get("premiumSignal")),
            "deskPassed": desk_passed,
            "telegramPassed": telegram_passed,
            "deskReasons": desk_reasons,
            "telegramReasons": telegram_reasons,
        }
        if telegram_passed:
            elite_ready.append(row)
        elif desk_passed and score >= 90:
            near_elite.append(row)
        if not telegram_passed:
            blocked_ideas.append(row)

    near_elite = sorted(near_elite, key=lambda row: (-(row.get("score") or 0), row.get("symbol") or ""))[:safe_limit]
    elite_ready = sorted(elite_ready, key=lambda row: (-(row.get("score") or 0), row.get("symbol") or ""))[:safe_limit]
    blocked_ideas = sorted(blocked_ideas, key=lambda row: (-(row.get("score") or 0), row.get("symbol") or ""))[:safe_limit]

    return {
        "version": S513_SAFE_REPORT_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "working_cockpit_payload_compact_items",
        "totals": {
            "watchCount": int(watch_count or 0),
            "lifecycleCount": int(lifecycle_count or 0),
            "evaluatedIdeaCount": len(evaluated),
            "withQualityGuardCount": with_guard,
            "withoutQualityGuardCount": without_guard,
            "deskPassedCount": desk_passed_count,
            "deskBlockedCount": desk_blocked_count,
            "telegramPassedCount": telegram_passed_count,
            "telegramBlockedCount": telegram_blocked_count,
            "nearEliteCount": len(near_elite),
            "eliteReadyCount": len(elite_ready),
        },
        "policy": {
            "telegramElite": [
                "score >= 92",
                "RR >= 2.2R",
                "execution trigger required",
                "entry distance <= 1.25%",
                "no sub-$1 tickers",
                "small caps need strong volume/liquidity",
            ],
            "meaning": "Telegram/Elite is intentionally stricter than Cockpit Active. Zero Telegram-ready ideas can be correct.",
        },
        "byTelegramBlockReason": _s513safe_reason_rows(telegram_counter, telegram_examples),
        "byDeskBlockReason": _s513safe_reason_rows(desk_counter, desk_examples),
        "nearElite": near_elite,
        "eliteReady": elite_ready,
        "blockedIdeas": blocked_ideas,
    }
# === /S5.13 SAFE ==============================================================

def _s513_build_current_quality_guard_report(limit: int = 30) -> dict[str, Any]:
    safe_limit = max(5, min(int(limit or 30), 120))
    cockpit = build_signal_cockpit_payload(limit=safe_limit, include_candles=False)
    active_items = cockpit.get("active", {}).get("items", []) if isinstance(cockpit.get("active"), dict) else []
    armed_items = cockpit.get("armed", {}).get("items", []) if isinstance(cockpit.get("armed"), dict) else []
    closed_items = cockpit.get("closed", {}).get("items", []) if isinstance(cockpit.get("closed"), dict) else []
    watch_count = cockpit.get("watchlist", {}).get("count", 0) if isinstance(cockpit.get("watchlist"), dict) else 0
    lifecycle_count = cockpit.get("lifecycle", {}).get("count", 0) if isinstance(cockpit.get("lifecycle"), dict) else 0
    report = _s513safe_compact_quality_report(
        [item for item in list(active_items) + list(armed_items) + list(closed_items) if isinstance(item, dict)],
        watch_count=watch_count,
        lifecycle_count=lifecycle_count,
        limit=safe_limit,
    )
    report["runtimeSource"] = {
        "version": "s5_13_safe_cockpit_source_v1",
        "watchItems": watch_count,
        "activeItems": len(active_items),
        "armedItems": len(armed_items),
        "closedItems": len(closed_items),
        "lifecycleItems": lifecycle_count,
        "note": "Report is derived from the same compact items the working Cockpit already displays."
    }
    return report


# === /S5.13 ==================================================================


def _s512b_lifecycle_as_active_items(lifecycle_items: list[dict[str, Any]], safe_limit: int = 200) -> list[dict[str, Any]]:
    """Fallback for Cockpit when ACTIVE cache is empty but lifecycle stream exists.

    After strict quality-guard/cache restarts, `engine:active` may be empty while
    `engine:lifecycle` still contains current actionable trade management states.
    In that case the Desk should show those ideas instead of a false 0/0 state.
    """
    out: list[dict[str, Any]] = []
    max_items = max(1, min(int(safe_limit or 200), 200))

    for item in lifecycle_items or []:
        if not isinstance(item, dict):
            continue

        lifecycle_status = str(item.get("lifecycleStatus") or item.get("status") or "").upper()
        if not _s416_is_actionable_status(lifecycle_status):
            continue

        symbol = item.get("symbol")
        if not symbol:
            continue

        chart_levels = item.get("chartLevels") if isinstance(item.get("chartLevels"), dict) else {}
        entry = item.get("entry") if item.get("entry") is not None else chart_levels.get("entry")
        stop = item.get("stop") if item.get("stop") is not None else chart_levels.get("stop")
        tp1 = item.get("tp1") if item.get("tp1") is not None else chart_levels.get("tp1")
        tp2 = item.get("tp2") if item.get("tp2") is not None else chart_levels.get("tp2")

        targets: list[dict[str, Any]] = []
        if tp1 is not None:
            targets.append({"r": 2, "price": tp1})
        if tp2 is not None:
            targets.append({"r": 3, "price": tp2})

        out.append({
            "signalId": item.get("signalId") or f"lifecycle:{symbol}",
            "symbol": symbol,
            "setupSlug": item.get("setupSlug"),
            "setupName": item.get("setupName"),
            "direction": item.get("direction"),
            "status": lifecycle_status or "ACTIVE",
            "qualityStatus": item.get("qualityStatus") or "LIFECYCLE_ACTIVE",
            "signalGrade": item.get("signalGrade") or item.get("grade") or "A",
            "signalScore": item.get("signalScore") or item.get("score") or 0,
            "entry": entry,
            "stop": stop,
            "targets": targets,
            "triggerTime": item.get("triggerTime"),
            "createdAt": item.get("triggerTime") or item.get("evaluatedAt"),
            "lifecycleStatus": lifecycle_status,
            "entryStatus": item.get("entryStatus"),
            "currentPrice": item.get("currentPrice"),
            "currentR": item.get("currentR"),
            "isActionable": True,
            "source": {"fallback": "s512b_lifecycle_active_sync"},
        })

        if len(out) >= max_items:
            break

    return out


# === S5.14 Best Idea Selector =================================================
S514_BEST_IDEA_SELECTOR_VERSION = "s5_14e_runtime_source_of_truth_v1"
S514_CLOSED_OR_BAD_STATUSES = {"TP1_HIT", "TP2_HIT", "STOP_HIT", "INVALIDATED", "SESSION_CLOSE"}


def _s514_num(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        cleaned = str(value).replace("%", "").replace("$", "").replace(",", "").strip()
        if cleaned == "":
            return fallback
        return float(cleaned)
    except Exception:
        return fallback


def _s514_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item or "").strip()]
    if value is None:
        return []
    return [str(value)] if str(value).strip() else []


def _s514_watch_by_symbol(watch_items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in watch_items or []:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").upper().strip()
        if symbol and symbol not in out:
            out[symbol] = item
    return out


def _s514_trigger_text(item: dict[str, Any]) -> str:
    triggers = _s514_text_list(item.get("triggers"))
    primary = str(item.get("primaryTrigger") or "")
    return " ".join([primary] + triggers).lower()


def _s514_has_execution_confirmation(item: dict[str, Any], guard: dict[str, Any]) -> bool:
    metrics = guard.get("metrics") if isinstance(guard.get("metrics"), dict) else {}
    execution_count = _s514_num(metrics.get("executionTriggerCount"), 0) or 0
    if execution_count >= 1:
        return True
    text = _s514_trigger_text(item)
    execution_words = (
        "vwap", "ema", "ema20", "breakdown", "breakout", "reclaim", "rejection",
        "loss", "bounce", "stuff", "opening_range", "or_break", "volume_confirm",
    )
    return any(word in text for word in execution_words)


def _s514_reason_penalty(reasons: list[str]) -> int:
    penalty = 0
    for reason in reasons or []:
        r = str(reason or "").lower()
        if "rr" in r or "2_2" in r:
            penalty -= 10
        elif "score" in r:
            penalty -= 8
        elif "volume" in r or "liquidity" in r:
            penalty -= 8
        elif "sub_1" in r or "dollar" in r or "price" in r:
            penalty -= 10
        elif "multi_confirmation" in r or "execution" in r or "confirmation" in r:
            penalty -= 8
        elif "desk_quality" in r:
            penalty -= 16
        else:
            penalty -= 4
    return max(-40, penalty)



S514_PRICE_FRESH_SECONDS = 900
S514_PRICE_AGING_SECONDS = 1800


def _s514_parse_price_time(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, (int, float)):
            raw = float(value)
            if raw > 10_000_000_000:
                raw = raw / 1000.0
            dt = datetime.fromtimestamp(raw, tz=timezone.utc)
        else:
            text_value = str(value).strip()
            if not text_value:
                return None
            if text_value.endswith("Z"):
                text_value = text_value[:-1] + "+00:00"
            dt = datetime.fromisoformat(text_value)

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _s514_price_freshness(updated_at: Any) -> dict[str, Any]:
    dt = _s514_parse_price_time(updated_at)
    if dt is None:
        return {
            "priceUpdatedAt": updated_at,
            "priceAgeSeconds": None,
            "priceFreshness": "UNKNOWN",
            "priceFreshnessReason": "price_timestamp_missing_or_unparseable",
            "stalePriceBlocked": True,
        }

    now = datetime.now(timezone.utc)
    age = max(0.0, (now - dt).total_seconds())

    if age <= S514_PRICE_FRESH_SECONDS:
        state = "FRESH"
        reason = "price_updated_within_fresh_window"
        blocked = False
    elif age <= S514_PRICE_AGING_SECONDS:
        state = "AGING"
        reason = "price_updated_within_aging_window"
        blocked = False
    else:
        state = "STALE"
        reason = "price_older_than_stale_window"
        blocked = True

    return {
        "priceUpdatedAt": dt.isoformat(),
        "priceAgeSeconds": round(float(age), 2),
        "priceFreshness": state,
        "priceFreshnessReason": reason,
        "stalePriceBlocked": blocked,
    }




S514_MIN_NEW_ENTRY_MINUTES_TO_CLOSE = 20.0


def _s514_regular_session_end_for(value: Any) -> datetime | None:
    ref = _s514_parse_price_time(value) or datetime.now(timezone.utc)

    try:
        if _s415_get_regular_session_end:
            session_end = _s415_get_regular_session_end(ref)
        else:
            session_end = None
    except Exception:
        session_end = None

    if session_end is None:
        session_end = ref.astimezone(timezone.utc).replace(hour=20, minute=0, second=0, microsecond=0)

    if session_end.tzinfo is None:
        session_end = session_end.replace(tzinfo=timezone.utc)

    return session_end.astimezone(timezone.utc)


def _s514_time_to_close_guard(signal_time_value: Any, price_time_value: Any | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    signal_dt = _s514_parse_price_time(signal_time_value)
    price_dt = _s514_parse_price_time(price_time_value)
    reference_dt = signal_dt or price_dt or now

    session_end = _s514_regular_session_end_for(reference_dt)
    if session_end is None:
        return {
            "sessionEnd": None,
            "signalTimeForSessionGuard": signal_dt.isoformat() if signal_dt else None,
            "minutesToCloseAtSignal": None,
            "minutesToCloseNow": None,
            "lateSessionBlocked": True,
            "lateSessionReason": "session_end_unavailable",
            "marketClosedNewEntryBlocked": True,
        }

    minutes_to_close_at_signal = None
    if signal_dt is not None:
        minutes_to_close_at_signal = round(float((session_end - signal_dt).total_seconds() / 60.0), 2)

    minutes_to_close_now = round(float((session_end - now).total_seconds() / 60.0), 2)

    market_closed_blocked = now >= session_end
    signal_too_late = (
        minutes_to_close_at_signal is not None
        and minutes_to_close_at_signal >= 0
        and minutes_to_close_at_signal <= S514_MIN_NEW_ENTRY_MINUTES_TO_CLOSE
    )
    now_too_late = (
        minutes_to_close_now >= 0
        and minutes_to_close_now <= S514_MIN_NEW_ENTRY_MINUTES_TO_CLOSE
    )

    if market_closed_blocked:
        reason = "market_closed_no_new_entries"
    elif signal_too_late:
        reason = "signal_triggered_inside_no_new_entry_window"
    elif now_too_late:
        reason = "inside_late_session_no_new_entry_window"
    else:
        reason = "new_entry_window_open"

    blocked = bool(market_closed_blocked or signal_too_late or now_too_late)

    return {
        "sessionEnd": session_end.isoformat(),
        "signalTimeForSessionGuard": signal_dt.isoformat() if signal_dt else None,
        "minutesToCloseAtSignal": minutes_to_close_at_signal,
        "minutesToCloseNow": minutes_to_close_now,
        "lateSessionBlocked": blocked,
        "lateSessionReason": reason,
        "marketClosedNewEntryBlocked": bool(market_closed_blocked),
    }



def _s514_rank_compact_idea(item: dict[str, Any], watch_by_symbol: dict[str, dict[str, Any]], source: str) -> dict[str, Any]:
    symbol = str(item.get("symbol") or "").upper().strip()
    watch = watch_by_symbol.get(symbol, {})
    guard = item.get("qualityGuard") if isinstance(item.get("qualityGuard"), dict) else {}
    metrics = guard.get("metrics") if isinstance(guard.get("metrics"), dict) else {}

    score = _s514_num(item.get("score"), 0) or 0
    rr = _s514_num(item.get("rrToTp1") or item.get("tp1R"))

    entry = _s514_num(item.get("entry"))
    stop = _s514_num(item.get("stop"))
    tp1 = _s514_num(item.get("tp1"))
    tp2 = _s514_num(item.get("tp2"))
    direction_key = str(item.get("direction") or "").lower().strip()

    current_price = None
    current_price_source = None
    current_price_updated_at = None
    for source_name, source_value, source_time in (
        ("item.currentPrice", item.get("currentPrice"), item.get("currentPriceUpdatedAt") or item.get("updatedAt") or item.get("createdAt")),
        ("item.current_price", item.get("current_price"), item.get("current_price_updated_at") or item.get("updatedAt") or item.get("createdAt")),
        ("watch.currentPrice", watch.get("currentPrice"), watch.get("currentPriceUpdatedAt") or watch.get("updatedAt")),
        ("watch.current_price", watch.get("current_price"), watch.get("current_price_updated_at") or watch.get("updatedAt")),
        ("watch.price", watch.get("price"), watch.get("updatedAt")),
        ("item.price", item.get("price"), item.get("updatedAt") or item.get("createdAt")),
        ("guard.metrics.price", metrics.get("price"), metrics.get("updatedAt") or metrics.get("priceUpdatedAt") or item.get("updatedAt") or watch.get("updatedAt")),
    ):
        parsed_price = _s514_num(source_value)
        if parsed_price is not None:
            current_price = parsed_price
            current_price_source = source_name
            current_price_updated_at = source_time
            break

    current_r = _s514_num(item.get("currentR") or item.get("current_r"))
    risk_per_share = None
    if entry is not None and stop is not None:
        risk_per_share = abs(float(entry) - float(stop))

    if (
        current_r is None
        and current_price is not None
        and entry is not None
        and risk_per_share is not None
        and risk_per_share > 0
    ):
        if direction_key.startswith("short"):
            current_r = (float(entry) - float(current_price)) / risk_per_share
        else:
            current_r = (float(current_price) - float(entry)) / risk_per_share
        current_r = round(float(current_r), 4)

    price = current_price
    volume = _s514_num(watch.get("volume"), 0) or 0
    in_play_score = _s514_num(watch.get("inPlayScore"), 0) or 0
    change_percent = _s514_num(watch.get("changePercent"))

    entry_distance_pct = _s514_num(metrics.get("entryDistancePct"))
    if current_price is not None and entry is not None and float(entry) > 0:
        entry_distance_pct = round(abs(float(current_price) - float(entry)) / abs(float(entry)) * 100.0, 4)

    trigger_count = _s514_num(metrics.get("triggerCount"), 0) or 0
    execution_trigger_count = _s514_num(metrics.get("executionTriggerCount"), 0) or 0

    status = str(item.get("lifecycleStatus") or item.get("status") or item.get("engineStatus") or "").upper()
    quality_status = str(item.get("qualityStatus") or "").upper()
    grade = str(item.get("grade") or "").upper()
    desk_passed = bool(guard.get("deskPassed")) or quality_status == "PASSED"
    telegram_passed = bool(guard.get("telegramPassed")) or bool(item.get("telegramEligible"))
    desk_reasons = _s514_text_list(guard.get("deskReasons"))
    telegram_reasons = _s514_text_list(guard.get("telegramReasons"))
    base_is_actionable = bool(item.get("isActionable")) and status not in S514_CLOSED_OR_BAD_STATUSES

    management_state = "UNKNOWN_ENTRY_HEALTH"
    trade_action = "monitor_only_until_current_price_available"
    management_reasons: list[str] = []
    management_new_entry_ok = False

    price_freshness = _s514_price_freshness(current_price_updated_at)
    price_updated_at = price_freshness.get("priceUpdatedAt")
    price_age_seconds = price_freshness.get("priceAgeSeconds")
    price_freshness_state = str(price_freshness.get("priceFreshness") or "UNKNOWN")
    price_freshness_reason = str(price_freshness.get("priceFreshnessReason") or "")
    stale_price_blocked = bool(price_freshness.get("stalePriceBlocked"))

    signal_time_for_session_guard = (
        item.get("triggerTime")
        or item.get("createdAt")
        or item.get("updatedAt")
        or current_price_updated_at
    )
    time_to_close_guard = _s514_time_to_close_guard(signal_time_for_session_guard, current_price_updated_at)
    session_end = time_to_close_guard.get("sessionEnd")
    signal_time_guard_value = time_to_close_guard.get("signalTimeForSessionGuard")
    minutes_to_close_at_signal = time_to_close_guard.get("minutesToCloseAtSignal")
    minutes_to_close_now = time_to_close_guard.get("minutesToCloseNow")
    late_session_blocked = bool(time_to_close_guard.get("lateSessionBlocked"))
    late_session_reason = str(time_to_close_guard.get("lateSessionReason") or "")
    market_closed_new_entry_blocked = bool(time_to_close_guard.get("marketClosedNewEntryBlocked"))

    if current_price is None:
        management_state = "UNKNOWN_CURRENT_PRICE"
        trade_action = "monitor_only_until_live_price_available"
        management_reasons.append("current_price_missing")
    elif stale_price_blocked:
        management_state = "STALE_PRICE_BLOCKED" if price_freshness_state == "STALE" else "UNKNOWN_PRICE_FRESHNESS"
        trade_action = "monitor_only_until_fresh_price_available"
        management_reasons.append(price_freshness_reason or "price_not_fresh")
    elif late_session_blocked:
        management_state = "MARKET_CLOSED_NO_NEW_ENTRY" if market_closed_new_entry_blocked else "LATE_SESSION_NO_NEW_ENTRY"
        trade_action = "monitor_only_no_new_entries_near_close"
        management_reasons.append(late_session_reason or "late_session_no_new_entry")
    elif current_r is None:
        management_state = "UNKNOWN_CURRENT_R"
        trade_action = "monitor_only_until_current_r_available"
        management_reasons.append("current_r_missing")
    elif current_r <= -0.50:
        management_state = "WEAK_NEAR_STOP_WAIT_REENTRY"
        trade_action = "avoid_new_entry_wait_reentry"
        management_reasons.append("price_moved_toward_stop")
    elif current_r <= -0.25:
        management_state = "CAUTION_AGAINST_ENTRY"
        trade_action = "wait_for_reclaim_before_new_entry"
        management_reasons.append("price_moved_against_entry")
        management_reasons.append("requires_reclaim_before_new_entry")
    elif current_r < 0:
        management_state = "MILD_PULLBACK_STILL_VALID"
        trade_action = "entry_still_valid_but_do_not_chase"
        management_reasons.append("small_negative_r_pullback")
        management_new_entry_ok = True
    elif current_r <= 0.50:
        management_state = "HEALTHY_ENTRY_ZONE"
        trade_action = "paper_test_candidate"
        management_reasons.append("price_near_or_slightly_in_favor")
        management_new_entry_ok = True
    elif current_r <= 1.00:
        management_state = "MOVED_IN_FAVOR_PULLBACK_ONLY"
        trade_action = "only_on_pullback_or_existing_entry"
        management_reasons.append("price_already_moved_in_favor")
        management_reasons.append("not_a_fresh_entry_wait_pullback")
    else:
        management_state = "EXTENDED_DO_NOT_CHASE"
        trade_action = "avoid_chasing_wait_new_setup"
        management_reasons.append("price_extended_past_entry")

    is_actionable = base_is_actionable and management_new_entry_ok
    has_exec = _s514_has_execution_confirmation(item, guard)

    selector_score = score
    reasons: list[str] = []
    cautions: list[str] = []

    if management_state == "HEALTHY_ENTRY_ZONE":
        reasons.append("entry_health_healthy")
    elif management_new_entry_ok:
        cautions.append(f"entry_health:{management_state}")
    else:
        cautions.append(f"entry_health:{management_state}")

    if is_actionable:
        selector_score += 8
        reasons.append("actionable_now")
    else:
        selector_score -= 35
        cautions.append("not_actionable_or_closed")

    if desk_passed:
        selector_score += 12
        reasons.append("desk_quality_passed")
    else:
        selector_score -= 22
        cautions.append("desk_quality_blocked")

    if telegram_passed:
        selector_score += 18
        reasons.append("telegram_elite_ready")
    elif telegram_reasons:
        selector_score += _s514_reason_penalty(telegram_reasons)
        cautions.extend(telegram_reasons[:4])

    if grade == "A+":
        selector_score += 8
        reasons.append("grade_a_plus")
    elif grade == "A":
        selector_score += 4
        reasons.append("grade_a")

    if rr is None:
        selector_score -= 4
        cautions.append("rr_not_cached")
    elif rr >= 3:
        selector_score += 14
        reasons.append("rr_3r_plus")
    elif rr >= 2.2:
        selector_score += 10
        reasons.append("rr_elite_2_2_plus")
    elif rr >= 2:
        selector_score += 5
        reasons.append("rr_2r_plus")
    else:
        selector_score -= 18
        cautions.append("rr_below_2r")

    if has_exec:
        selector_score += 9
        reasons.append("execution_confirmation_present")
    else:
        selector_score -= 9
        cautions.append("execution_confirmation_missing")

    if trigger_count >= 2:
        selector_score += 5
        reasons.append("multi_trigger_confirmation")
    elif trigger_count == 1:
        selector_score -= 3
        cautions.append("single_trigger_only")

    if execution_trigger_count >= 2:
        selector_score += 5
        reasons.append("two_execution_triggers")

    if entry_distance_pct is not None:
        if entry_distance_pct <= 1.25:
            selector_score += 8
            reasons.append("entry_distance_elite")
        elif entry_distance_pct <= 2:
            selector_score += 4
            reasons.append("entry_distance_acceptable")
        elif entry_distance_pct > 3:
            selector_score -= 12
            cautions.append("entry_distance_too_far")

    if in_play_score >= 85:
        selector_score += 6
        reasons.append("strong_in_play_score")
    elif in_play_score and in_play_score < 60:
        selector_score -= 6
        cautions.append("weak_in_play_score")

    if volume >= 3_000_000:
        selector_score += 7
        reasons.append("volume_3m_plus")
    elif volume >= 1_000_000:
        selector_score += 4
        reasons.append("volume_1m_plus")
    elif volume and volume < 500_000:
        selector_score -= 10
        cautions.append("volume_below_500k")

    if price is not None and price < 1:
        selector_score -= 16
        cautions.append("sub_1_dollar_risk")

    if status in ("ENTRY_STILL_VALID", "STILL_VALID", "ACTIVE"):
        selector_score += 5
        reasons.append("lifecycle_valid")
    elif status == "WAIT_FOR_REENTRY":
        selector_score -= 6
        cautions.append("wait_for_reentry")

    selector_score = round(float(selector_score), 2)
    if not is_actionable:
        tier = "NOT_ACTIONABLE"
    elif telegram_passed:
        tier = "ELITE_READY"
    elif desk_passed and selector_score >= 105:
        tier = "BEST_DESK_IDEA"
    elif desk_passed and selector_score >= 92:
        tier = "NEAR_ELITE"
    elif desk_passed:
        tier = "MONITOR_ACTIVE"
    else:
        tier = "BLOCKED"

    strict_blocked_reasons: list[str] = []
    if not is_actionable:
        strict_blocked_reasons.append("not_actionable_or_closed")
    if not isinstance(item.get("qualityGuard"), dict):
        strict_blocked_reasons.append("quality_guard_missing")
    if not desk_passed:
        strict_blocked_reasons.append("desk_quality_not_passed")
    if score <= 0:
        strict_blocked_reasons.append("score_missing_or_zero")
    elif score < 78:
        strict_blocked_reasons.append("score_below_78")
    if rr is None:
        strict_blocked_reasons.append("rr_missing")
    elif rr < 2:
        strict_blocked_reasons.append("rr_below_2r")
    if not has_exec:
        strict_blocked_reasons.append("execution_confirmation_missing")
    if tier == "MONITOR_ACTIVE":
        strict_blocked_reasons.append("monitor_only_not_best")
    if status in S514_CLOSED_OR_BAD_STATUSES:
        strict_blocked_reasons.append("closed_or_invalidated")
    if not management_new_entry_ok:
        strict_blocked_reasons.append(f"entry_health:{management_state}")
    if stale_price_blocked:
        strict_blocked_reasons.append(f"price_freshness:{price_freshness_state}")
    if late_session_blocked:
        strict_blocked_reasons.append(f"late_session:{late_session_reason}")

    strict_eligible = (
        is_actionable
        and isinstance(item.get("qualityGuard"), dict)
        and desk_passed
        and score >= 78
        and rr is not None
        and rr >= 2
        and has_exec
        and tier in ("ELITE_READY", "BEST_DESK_IDEA", "NEAR_ELITE")
    )

    return {
        "symbol": symbol,
        "setupSlug": item.get("setupSlug"),
        "setupName": item.get("setupName"),
        "direction": item.get("direction"),
        "status": item.get("status"),
        "lifecycleStatus": item.get("lifecycleStatus"),
        "grade": item.get("grade"),
        "score": score,
        "selectorScore": selector_score,
        "tier": tier,
        "source": source,
        "rrToTp1": rr,
        "entry": entry if entry is not None else item.get("entry"),
        "stop": stop if stop is not None else item.get("stop"),
        "tp1": tp1 if tp1 is not None else item.get("tp1"),
        "tp2": tp2 if tp2 is not None else item.get("tp2"),
        "currentPrice": current_price,
        "currentPriceSource": current_price_source,
        "priceUpdatedAt": price_updated_at,
        "priceAgeSeconds": price_age_seconds,
        "priceFreshness": price_freshness_state,
        "priceFreshnessReason": price_freshness_reason,
        "stalePriceBlocked": stale_price_blocked,
        "sessionEnd": session_end,
        "signalTimeForSessionGuard": signal_time_guard_value,
        "minutesToCloseAtSignal": minutes_to_close_at_signal,
        "minutesToCloseNow": minutes_to_close_now,
        "lateSessionBlocked": late_session_blocked,
        "lateSessionReason": late_session_reason,
        "marketClosedNewEntryBlocked": market_closed_new_entry_blocked,
        "currentR": current_r,
        "managementState": management_state,
        "tradeAction": trade_action,
        "managementReasons": management_reasons[:8],
        "telegramEligible": bool(item.get("telegramEligible")),
        "deskPassed": desk_passed,
        "telegramPassed": telegram_passed,
        "isActionable": is_actionable,
        "strictEligible": strict_eligible,
        "strictBlockedReasons": strict_blocked_reasons[:10],
        "metrics": {
            "entryDistancePct": entry_distance_pct,
            "triggerCount": trigger_count,
            "executionTriggerCount": execution_trigger_count,
            "inPlayScore": in_play_score,
            "changePercent": change_percent,
            "volume": volume,
            "price": price,
            "currentPriceSource": current_price_source,
            "priceUpdatedAt": price_updated_at,
            "priceAgeSeconds": price_age_seconds,
            "priceFreshness": price_freshness_state,
            "stalePriceBlocked": stale_price_blocked,
            "sessionEnd": session_end,
            "signalTimeForSessionGuard": signal_time_guard_value,
            "minutesToCloseAtSignal": minutes_to_close_at_signal,
            "minutesToCloseNow": minutes_to_close_now,
            "lateSessionBlocked": late_session_blocked,
            "lateSessionReason": late_session_reason,
            "marketClosedNewEntryBlocked": market_closed_new_entry_blocked,
            "riskPerShare": risk_per_share,
        },
        "reasons": reasons[:10],
        "cautions": cautions[:10],
        "telegramReasons": telegram_reasons[:8],
        "deskReasons": desk_reasons[:8],
        "whySelected": reasons[:5] if tier in ("ELITE_READY", "BEST_DESK_IDEA", "NEAR_ELITE") else [],
        "whyNotElite": telegram_reasons[:6] if not telegram_passed else [],
    }


def _s514_best_idea_selector_from_compact(
    *,
    active_items: list[dict[str, Any]],
    armed_items: list[dict[str, Any]],
    watch_items: list[dict[str, Any]],
    lifecycle_items: list[dict[str, Any]],
    max_best: int = 5,
    limit: int = 80,
) -> dict[str, Any]:
    safe_max_best = max(1, min(int(max_best or 5), 8))
    safe_limit = max(10, min(int(limit or 80), 200))
    watch_by_symbol = _s514_watch_by_symbol(watch_items)

    active_ranked = [
        _s514_rank_compact_idea(item, watch_by_symbol, "active")
        for item in active_items or []
        if isinstance(item, dict)
    ]
    armed_ranked = [
        _s514_rank_compact_idea(item, watch_by_symbol, "armed")
        for item in armed_items or []
        if isinstance(item, dict)
    ]

    active_ranked = sorted(active_ranked, key=lambda row: (-(row.get("selectorScore") or 0), str(row.get("symbol") or "")))
    armed_ranked = sorted(armed_ranked, key=lambda row: (-(row.get("selectorScore") or 0), str(row.get("symbol") or "")))

    best_pool = [
        row for row in active_ranked
        if row.get("strictEligible") is True
    ]
    selected = best_pool[:safe_max_best]
    for index, row in enumerate(selected, start=1):
        row["rank"] = index
        row["role"] = "PRIMARY_IDEA" if index == 1 else "BACKUP_IDEA"
        if not row.get("whySelected"):
            row["whySelected"] = (row.get("reasons") or [])[:5]
        if not row.get("whyNotElite") and not row.get("telegramPassed"):
            row["whyNotElite"] = (row.get("telegramReasons") or row.get("cautions") or [])[:6]

    monitor = [row for row in active_ranked if row not in selected][:safe_limit]
    waiting = [row for row in armed_ranked if row.get("isActionable")][:safe_limit]

    strict_block_counts: dict[str, int] = {}
    for row in monitor:
        for reason in row.get("strictBlockedReasons") or ["not_selected_lower_rank"]:
            strict_block_counts[str(reason)] = strict_block_counts.get(str(reason), 0) + 1

    return {
        "version": S514_BEST_IDEA_SELECTOR_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only_ranking_no_cache_mutation",
        "policy": {
            "goal": "Select only truly qualified best ideas for paper-test/forward-test. If none pass strict rules, selectedIdeas stays empty.",
            "doesNotSendTelegram": True,
            "doesNotChangeSignalStatus": True,
            "minimumDeskRule": "strictEligible = actionable + real qualityGuard + deskPassed + score>=78 + RR>=2R + execution confirmation + tier is NEAR_ELITE/BEST/ELITE",
        },
        "totals": {
            "watchCount": len(watch_items or []),
            "activeCount": len(active_items or []),
            "armedCount": len(armed_items or []),
            "lifecycleCount": len(lifecycle_items or []),
            "rankedActiveCount": len(active_ranked),
            "selectedCount": len(selected),
            "strictEligibleCount": len(best_pool),
            "monitorCount": len(monitor),
            "waitingArmedCount": len(waiting),
            "strictBlockedByReason": strict_block_counts,
            "eliteReadyCount": sum(1 for row in active_ranked if row.get("tier") == "ELITE_READY"),
            "nearEliteCount": sum(1 for row in active_ranked if row.get("tier") == "NEAR_ELITE"),
        },
        "selectedIdeas": selected,
        "monitorOnly": monitor[:safe_limit],
        "waitingArmed": waiting[:safe_limit],
        "topSymbols": [row.get("symbol") for row in selected],
        "interpretation": {
            "selectedIdeas": "Only strict-qualified desk ideas. Empty is valid and means no high-quality paper-test idea right now.",
            "monitorOnly": "Active ideas that may still be valid, but are lower priority than selectedIdeas.",
            "waitingArmed": "Ideas that still need confirmation before becoming active.",
        },
    }
# === /S5.14 ==================================================================

def build_signal_cockpit_payload(
    lifecycle_items: list[dict[str, Any]] | None = None,
    *,
    selected_symbol: str | None = None,
    limit: int = 80,
    include_candles: bool = False,
) -> dict[str, Any]:
    lifecycle_items = lifecycle_items if isinstance(lifecycle_items, list) else _s416_get_lifecycle_items()
    lifecycle_by_symbol = _s416_latest_by_symbol(lifecycle_items)
    safe_limit = max(10, min(int(limit or 80), 200))

    raw_watch_source = _s416_watchlist_items()
    raw_armed_source = _s416_armed_items()
    raw_active_source = _s416_active_items()
    raw_signal_source = _s416_signal_items()

    # S5.12B: strict quality guard can leave ACTIVE/SIGNALS cache empty while
    # lifecycle still contains current trade-management states. Do not show a
    # false empty Desk in that case.
    active_from_lifecycle = False
    if not raw_active_source and lifecycle_items:
        raw_active_source = _s512b_lifecycle_as_active_items(lifecycle_items, safe_limit=safe_limit)
        active_from_lifecycle = bool(raw_active_source)

    watch_items = sorted(
        [_s416_compact_watch_item(item, lifecycle_by_symbol) for item in raw_watch_source if isinstance(item, dict)],
        key=lambda item: int(item.get("inPlayScore") or 0),
        reverse=True,
    )[:safe_limit]
    armed_items = sorted(
        [_s416_compact_signal_item(item, lifecycle_by_symbol) for item in raw_armed_source if isinstance(item, dict)],
        key=lambda item: int(item.get("score") or 0),
        reverse=True,
    )[:safe_limit]
    raw_active_items = sorted(
        [_s416_compact_signal_item(item, lifecycle_by_symbol) for item in raw_active_source if isinstance(item, dict)],
        key=lambda item: int(item.get("score") or 0),
        reverse=True,
    )
    closed_items = [item for item in raw_active_items if not item.get("isActionable")][:safe_limit]
    active_items = [item for item in raw_active_items if item.get("isActionable")][:safe_limit]
    lifecycle_compact = [_s416_compact_lifecycle_item(item) for item in lifecycle_items[:safe_limit] if isinstance(item, dict)]

    selected = _s416_build_selected_symbol(selected_symbol, lifecycle_by_symbol, include_candles=include_candles) if selected_symbol else None

    payload = {
        "ok": True,
        "storageVersion": S416_COCKPIT_VERSION,
        "description": "Compact dashboard-ready API for the SkillEdge AI Signal Cockpit page.",
        "dataSource": "memory_with_runtime_cache_fallback",
        "runtimeStatus": {
            "watchCount": len(watch_items),
            "armedCount": len(armed_items),
            "activeCount": len(active_items),
            "actionableActiveCount": len(active_items),
            "closedActiveCount": len(closed_items),
            "signalCount": len(raw_signal_source),
            "lifecycleCount": len(lifecycle_compact),
            "rawWatchCount": len(raw_watch_source),
            "rawArmedCount": len(raw_armed_source),
            "rawActiveCount": len(raw_active_source),
            "rawSignalCount": len(raw_signal_source),
            "activeSource": "lifecycle_fallback" if active_from_lifecycle else "runtime_cache_or_memory",
            "sourceOfTruth": "compact_cockpit_sections",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "summary": _s415_lifecycle_summary(lifecycle_items),
        "setupPortfolioSummary": build_setup_portfolio_summary(
            [item for item in list(raw_active_source) + list(raw_armed_source) if isinstance(item, dict)],
            watch_items=[item for item in raw_watch_source if isinstance(item, dict)],
        ),
        "qualityGuardReport": _s513safe_compact_quality_report(
            [item for item in list(active_items) + list(armed_items) + list(closed_items) if isinstance(item, dict)],
            watch_count=len(watch_items),
            lifecycle_count=len(lifecycle_compact),
            limit=safe_limit,
        ),
        "bestIdeaSelector": _s514_best_idea_selector_from_compact(
            active_items=active_items,
            armed_items=armed_items,
            watch_items=watch_items,
            lifecycle_items=lifecycle_compact,
            max_best=5,
            limit=safe_limit,
        ),
        "watchlist": {"count": len(watch_items), "items": watch_items},
        "armed": {"count": len(armed_items), "items": armed_items},
        "active": {"count": len(active_items), "items": active_items},
        "closed": {"count": len(closed_items), "items": closed_items},
        "lifecycle": {"count": len(lifecycle_compact), "items": lifecycle_compact},
        "selected": selected,
        "uiContract": {
            "leftPanel": "watchlist.items",
            "centerChart": "selected.chart",
            "rightAiPanel": "selected.aiPanel",
            "tradeTimeline": "selected.aiPanel.timeline",
            "closedPanel": "closed.items",
            "statusBadges": ["WATCH", "ARMED", "ACTIVE", "ENTRY_STILL_VALID", "ENTRY_MISSED", "WAIT_FOR_REENTRY", "TP1_HIT", "TP2_HIT", "STOP_HIT", "INVALIDATED", "SESSION_CLOSE"],
            "telegramRole": "alert_update_layer_only",
        },
        "nextProductStep": "S4.17 AI Signal Cockpit frontend page in dashboard.",
    }
    return payload


@app.get("/engine/quality-guard/sources")
def engine_quality_guard_sources(limit: int = 50):
    safe_limit = max(5, min(int(limit or 50), 120))
    cockpit = build_signal_cockpit_payload(limit=safe_limit, include_candles=False)
    return {
        "ok": True,
        "storageVersion": "s5_13_safe_cockpit_source_v1",
        "counts": {
            "watchItems": cockpit.get("watchlist", {}).get("count", 0) if isinstance(cockpit.get("watchlist"), dict) else 0,
            "activeItems": cockpit.get("active", {}).get("count", 0) if isinstance(cockpit.get("active"), dict) else 0,
            "armedItems": cockpit.get("armed", {}).get("count", 0) if isinstance(cockpit.get("armed"), dict) else 0,
            "closedItems": cockpit.get("closed", {}).get("count", 0) if isinstance(cockpit.get("closed"), dict) else 0,
            "lifecycleItems": cockpit.get("lifecycle", {}).get("count", 0) if isinstance(cockpit.get("lifecycle"), dict) else 0,
        },
        "samples": {
            "watch": (cockpit.get("watchlist", {}).get("items", []) if isinstance(cockpit.get("watchlist"), dict) else [])[:3],
            "active": (cockpit.get("active", {}).get("items", []) if isinstance(cockpit.get("active"), dict) else [])[:3],
            "armed": (cockpit.get("armed", {}).get("items", []) if isinstance(cockpit.get("armed"), dict) else [])[:3],
        },
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/quality-guard/report")
def engine_quality_guard_report(limit: int = 50):
    safe_limit = max(5, min(int(limit or 50), 120))
    report = _s513_build_current_quality_guard_report(limit=safe_limit)
    return {
        "ok": True,
        "value": report,
        "storageVersion": S513_QUALITY_GUARD_REPORT_VERSION,
        "cache": runtime_cache.get_status(),
    }



def _s514c_count_from_section(payload: dict[str, Any], section: str) -> int:
    block = payload.get(section) if isinstance(payload, dict) else None
    if isinstance(block, dict):
        value = block.get("count")
        if isinstance(value, int):
            return value
        items = block.get("items")
        if isinstance(items, list):
            return len(items)
    return 0


def _s514c_cached_cockpit_payload_is_useful(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    selector = payload.get("bestIdeaSelector")
    if not isinstance(selector, dict):
        return False
    if selector.get("version") != S514_BEST_IDEA_SELECTOR_VERSION:
        return False
    return (
        _s514c_count_from_section(payload, "active") > 0
        or _s514c_count_from_section(payload, "lifecycle") > 0
        or _s514c_count_from_section(payload, "armed") > 0
    )


@app.get("/engine/best-ideas/report")
def engine_best_ideas_report(limit: int = 80, max_best: int = 5, publish: bool = False):
    safe_limit = max(10, min(int(limit or 80), 200))
    safe_max_best = max(1, min(int(max_best or 5), 8))

    # S5.14E source of truth:
    # Build a fresh compact Cockpit payload and read the selector from it.
    # Do not prefer an older cached compact payload, because it can be stale
    # after lifecycle/discovery publish cycles and show different active counts
    # than the current /engine/cockpit/v2 response.
    cockpit = build_signal_cockpit_payload(
        _s416_get_lifecycle_items(),
        limit=safe_limit,
        include_candles=False,
    )
    if publish:
        runtime_cache.set_json(S416_COCKPIT_COMPACT_CACHE_KEY, cockpit, ttl_seconds=900)

    value = cockpit.get("bestIdeaSelector") if isinstance(cockpit.get("bestIdeaSelector"), dict) else {}
    if isinstance(value, dict):
        value["requestedMaxBest"] = safe_max_best
        value["reportSource"] = {
            "version": S514_BEST_IDEA_SELECTOR_VERSION,
            "source": "fresh_compact_cockpit_payload_no_stale_cache",
            "watchCount": _s514c_count_from_section(cockpit, "watchlist"),
            "activeCount": _s514c_count_from_section(cockpit, "active"),
            "armedCount": _s514c_count_from_section(cockpit, "armed"),
            "lifecycleCount": _s514c_count_from_section(cockpit, "lifecycle"),
            "runtimeStatus": cockpit.get("runtimeStatus") if isinstance(cockpit.get("runtimeStatus"), dict) else {},
            "note": "S5.14E: Best-ideas report is rebuilt from the same compact Cockpit builder on every request. Cached cockpit is not used as primary source, so stale active/lifecycle counts cannot win.",
        }
        if safe_max_best != 5:
            selected = value.get("selectedIdeas") if isinstance(value.get("selectedIdeas"), list) else []
            value["selectedIdeas"] = selected[:safe_max_best]
            value["topSymbols"] = [row.get("symbol") for row in value.get("selectedIdeas", []) if isinstance(row, dict)]
            if isinstance(value.get("totals"), dict):
                value["totals"]["selectedCount"] = len(value.get("selectedIdeas", []))
                value["totals"]["strictEligibleCount"] = min(
                    int(value.get("totals", {}).get("strictEligibleCount") or len(value.get("selectedIdeas", []))),
                    safe_max_best,
                )
    return {
        "ok": True,
        "value": value,
        "storageVersion": S514_BEST_IDEA_SELECTOR_VERSION,
        "cache": runtime_cache.get_status(),
    }




# === S5.15 Daily Forward Test Report ==========================================
S515_DAILY_FORWARD_REPORT_VERSION = "s5_16b_entry_health_selection_fix_v1"
S515_FORWARD_REPORT_CACHE_KEY = "engine:forward_report:today"
S515_GOOD_LIFECYCLE_STATUSES = {"ENTRY_STILL_VALID", "STILL_VALID", "TP1_HIT", "TP2_HIT"}
S515_BAD_LIFECYCLE_STATUSES = {"STOP_HIT", "INVALIDATED", "SESSION_CLOSE", "ENTRY_MISSED"}


def _s515_num(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return fallback


def _s515_date_key(value: str | None = None) -> str:
    raw = str(value or "").strip()
    if raw:
        return raw[:10]
    return datetime.now(timezone.utc).date().isoformat()


def _s515_section_items(cockpit: dict[str, Any], section: str) -> list[dict[str, Any]]:
    block = cockpit.get(section) if isinstance(cockpit, dict) else None
    if isinstance(block, dict) and isinstance(block.get("items"), list):
        return [item for item in block.get("items", []) if isinstance(item, dict)]
    if isinstance(block, list):
        return [item for item in block if isinstance(item, dict)]
    return []


def _s515_status_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for item in items or []:
        status = str(item.get("lifecycleStatus") or item.get("status") or "UNKNOWN").upper().strip() or "UNKNOWN"
        out[status] = out.get(status, 0) + 1
    return dict(sorted(out.items(), key=lambda row: (-row[1], row[0])))


def _s516_unique_ideas(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        key = "|".join([
            str(item.get("symbol") or "").upper().strip(),
            str(item.get("setupSlug") or item.get("setup_slug") or "").strip(),
            str(item.get("direction") or "").lower().strip(),
        ])
        if not key.strip("|") or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _s516_entry_health(row: dict[str, Any]) -> dict[str, Any]:
    status = str(row.get("lifecycleStatus") or row.get("status") or "").upper().strip()
    current_r = _s515_num(row.get("currentR"))
    selector_score = _s515_num(row.get("selectorScore"), 0) or 0
    reasons: list[str] = []

    if status in S515_BAD_LIFECYCLE_STATUSES:
        return {
            "state": "DO_NOT_TRADE_CLOSED_OR_INVALID",
            "currentR": current_r,
            "paperTestOk": False,
            "priorityScore": -999.0,
            "action": "do_not_trade",
            "reasons": [f"bad_lifecycle_status:{status or 'UNKNOWN'}"],
        }

    if current_r is None:
        return {
            "state": "UNKNOWN_ENTRY_HEALTH",
            "currentR": None,
            "paperTestOk": True,
            "priorityScore": round(float(selector_score) - 20.0, 2),
            "action": "monitor_only_until_current_r_available",
            "reasons": ["current_r_missing"],
        }

    if current_r <= -0.75:
        state = "NEAR_STOP_AVOID"
        paper_ok = False
        penalty = 80.0
        action = "avoid_new_entry_wait_reentry"
        reasons.append("price_too_close_to_stop")
    elif current_r <= -0.50:
        state = "WEAK_NEAR_STOP_WAIT_REENTRY"
        paper_ok = False
        penalty = 55.0
        action = "wait_for_reentry_confirmation"
        reasons.append("already_more_than_minus_0_5r")
    elif current_r <= -0.25:
        state = "CAUTION_AGAINST_ENTRY"
        paper_ok = True
        penalty = 25.0
        action = "paper_test_only_if_price_reclaims_entry_zone"
        reasons.append("price_moved_against_entry")
    elif current_r < 0:
        state = "MILD_PULLBACK_STILL_VALID"
        paper_ok = True
        penalty = 8.0
        action = "entry_still_valid_but_do_not_chase"
        reasons.append("small_negative_r_pullback")
    elif current_r <= 0.50:
        state = "HEALTHY_ENTRY_ZONE"
        paper_ok = True
        penalty = 0.0
        action = "paper_test_candidate"
        reasons.append("price_near_or_slightly_in_favor")
    elif current_r <= 1.00:
        state = "MOVED_IN_FAVOR_DO_NOT_CHASE"
        paper_ok = True
        penalty = 18.0
        action = "only_on_pullback_or_existing_entry"
        reasons.append("price_already_moved_in_favor")
    else:
        state = "EXTENDED_DO_NOT_CHASE"
        paper_ok = False
        penalty = 65.0
        action = "avoid_chasing_wait_new_setup"
        reasons.append("price_extended_past_entry")

    if status in S515_GOOD_LIFECYCLE_STATUSES:
        reasons.append(f"lifecycle:{status.lower()}")
    elif status:
        reasons.append(f"lifecycle:{status.lower()}")

    return {
        "state": state,
        "currentR": round(float(current_r), 4),
        "paperTestOk": bool(paper_ok),
        "priorityScore": round(float(selector_score) - float(penalty), 2),
        "action": action,
        "reasons": reasons,
    }


def _s516_counts_by_entry_health(rows: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in rows or []:
        health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
        state = str(health.get("state") or "UNKNOWN").strip() or "UNKNOWN"
        out[state] = out.get(state, 0) + 1
    return dict(sorted(out.items(), key=lambda pair: (-pair[1], pair[0])))





def _s515_extract_lifecycle_items_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    if isinstance(payload.get("items"), list):
        return [item for item in payload.get("items", []) if isinstance(item, dict)]

    value = payload.get("value")
    if isinstance(value, dict) and isinstance(value.get("items"), list):
        return [item for item in value.get("items", []) if isinstance(item, dict)]

    lifecycle = payload.get("lifecycle")
    if isinstance(lifecycle, dict) and isinstance(lifecycle.get("items"), list):
        return [item for item in lifecycle.get("items", []) if isinstance(item, dict)]
    if isinstance(lifecycle, list):
        return [item for item in lifecycle if isinstance(item, dict)]

    return []


def _s515_load_lifecycle_items_direct() -> tuple[list[dict[str, Any]], str]:
    """Load lifecycle from the most direct non-stale source available.

    S5.15B: the daily report should not lose lifecycle/currentR/status just
    because the compact Cockpit section was rebuilt after discovery. It first
    reads the lifecycle cache/memory directly, then falls back to cockpit
    payloads only when direct lifecycle is empty.
    """
    items = _s416_get_lifecycle_items()
    if items:
        return items, "direct_engine_lifecycle_cache_or_memory"

    direct_payload = runtime_cache.get_json(S415_LIFECYCLE_CACHE_KEY)
    items = _s515_extract_lifecycle_items_from_payload(direct_payload)
    if items:
        return items, "runtime_cache_engine_lifecycle"

    legacy_cockpit = runtime_cache.get_json(S415_COCKPIT_CACHE_KEY)
    items = _s515_extract_lifecycle_items_from_payload(legacy_cockpit)
    if items:
        return items, "legacy_signal_cockpit_lifecycle_section"

    compact_cockpit = runtime_cache.get_json(S416_COCKPIT_COMPACT_CACHE_KEY)
    items = _s515_extract_lifecycle_items_from_payload(compact_cockpit)
    if items:
        return items, "compact_signal_cockpit_lifecycle_section"

    return [], "empty"


def _s515_attach_lifecycle_to_selected_row(row: dict[str, Any], lifecycle: dict[str, Any] | None) -> dict[str, Any]:
    compact_lifecycle = _s515_compact_lifecycle_result(lifecycle)
    row["lifecycle"] = compact_lifecycle
    if compact_lifecycle:
        status = compact_lifecycle.get("status")
        if status:
            row["lifecycleStatus"] = status
            row["status"] = status
        current_r = compact_lifecycle.get("currentR")
        if current_r is not None:
            row["currentR"] = current_r
        if compact_lifecycle.get("mfeR") is not None:
            row["mfeR"] = compact_lifecycle.get("mfeR")
        if compact_lifecycle.get("maeR") is not None:
            row["maeR"] = compact_lifecycle.get("maeR")
    return row



def _s515_compact_best_idea(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "rank": item.get("rank"),
        "role": item.get("role"),
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "setupName": item.get("setupName"),
        "direction": item.get("direction"),
        "status": item.get("status"),
        "lifecycleStatus": item.get("lifecycleStatus"),
        "tier": item.get("tier"),
        "selectorScore": _s515_num(item.get("selectorScore"), 0),
        "score": _s515_num(item.get("score"), 0),
        "rrToTp1": _s515_num(item.get("rrToTp1"), None),
        "entry": _s515_num(item.get("entry"), None),
        "stop": _s515_num(item.get("stop"), None),
        "tp1": _s515_num(item.get("tp1"), None),
        "tp2": _s515_num(item.get("tp2"), None),
        "currentPrice": _s515_num(item.get("currentPrice"), None),
        "currentPriceSource": item.get("currentPriceSource"),
        "priceUpdatedAt": item.get("priceUpdatedAt"),
        "priceAgeSeconds": _s515_num(item.get("priceAgeSeconds"), None),
        "priceFreshness": item.get("priceFreshness"),
        "priceFreshnessReason": item.get("priceFreshnessReason"),
        "stalePriceBlocked": bool(item.get("stalePriceBlocked")),
        "sessionEnd": item.get("sessionEnd"),
        "signalTimeForSessionGuard": item.get("signalTimeForSessionGuard"),
        "minutesToCloseAtSignal": _s515_num(item.get("minutesToCloseAtSignal"), None),
        "minutesToCloseNow": _s515_num(item.get("minutesToCloseNow"), None),
        "lateSessionBlocked": bool(item.get("lateSessionBlocked")),
        "lateSessionReason": item.get("lateSessionReason"),
        "marketClosedNewEntryBlocked": bool(item.get("marketClosedNewEntryBlocked")),
        "currentR": _s515_num(item.get("currentR"), None),
        "managementState": item.get("managementState"),
        "tradeAction": item.get("tradeAction"),
        "managementReasons": item.get("managementReasons") if isinstance(item.get("managementReasons"), list) else [],
        "metrics": item.get("metrics") if isinstance(item.get("metrics"), dict) else {},
        "deskPassed": bool(item.get("deskPassed")),
        "telegramPassed": bool(item.get("telegramPassed")),
        "strictEligible": bool(item.get("strictEligible")),
        "isActionable": bool(item.get("isActionable")),
        "strictBlockedReasons": item.get("strictBlockedReasons") if isinstance(item.get("strictBlockedReasons"), list) else [],
        "reasons": item.get("reasons") if isinstance(item.get("reasons"), list) else [],
        "cautions": item.get("cautions") if isinstance(item.get("cautions"), list) else [],
        "whySelected": item.get("whySelected") if isinstance(item.get("whySelected"), list) else [],
        "whyNotElite": item.get("whyNotElite") if isinstance(item.get("whyNotElite"), list) else [],
    }


def _s515_match_lifecycle_for_idea(idea: dict[str, Any], lifecycle_items: list[dict[str, Any]]) -> dict[str, Any] | None:
    symbol = str(idea.get("symbol") or "").upper().strip()
    setup_slug = str(idea.get("setupSlug") or "").strip()
    direction = str(idea.get("direction") or "").lower().strip()
    if not symbol:
        return None

    best = None
    for item in lifecycle_items or []:
        if str(item.get("symbol") or "").upper().strip() != symbol:
            continue
        if setup_slug and str(item.get("setupSlug") or "").strip() not in {"", setup_slug}:
            continue
        if direction and str(item.get("direction") or "").lower().strip() not in {"", direction}:
            continue
        best = item
    return best


def _s515_compact_lifecycle_result(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    return {
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "direction": item.get("direction"),
        "status": item.get("lifecycleStatus") or item.get("status"),
        "currentR": _s515_num(item.get("currentR"), None),
        "mfeR": _s515_num(item.get("mfeR"), None),
        "maeR": _s515_num(item.get("maeR"), None),
        "lastEventAt": item.get("lastEventAt") or item.get("updatedAt"),
        "reason": item.get("reason") or item.get("statusReason"),
    }


def _s515_outcome_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(item.get("symbol") or "").upper().strip(),
        str(item.get("setupSlug") or item.get("setup") or "").strip(),
        str(item.get("direction") or "").lower().strip(),
    )


def _s515_recent_outcome_index(date_key: str | None = None, limit: int = 500) -> dict[tuple[str, str, str], dict[str, Any]]:
    try:
        outcomes = load_persistent_outcome_items(limit=limit)
    except Exception:
        outcomes = []
    out: dict[tuple[str, str, str], dict[str, Any]] = {}
    wanted_date = _s515_date_key(date_key) if date_key else None
    for item in outcomes or []:
        if not isinstance(item, dict):
            continue
        if wanted_date:
            raw_date = str(item.get("sessionDate") or item.get("date") or item.get("createdAt") or item.get("evaluatedAt") or "")[:10]
            if raw_date and raw_date != wanted_date:
                continue
        key = _s515_outcome_key(item)
        if key[0]:
            out[key] = item
    return out


def _s515_compact_outcome(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    return {
        "symbol": item.get("symbol"),
        "setupSlug": item.get("setupSlug"),
        "direction": item.get("direction"),
        "status": item.get("status") or item.get("result"),
        "event": item.get("event") or item.get("firstEvent"),
        "resultR": _s515_num(item.get("resultR"), None),
        "mfeR": _s515_num(item.get("mfeR"), None),
        "maeR": _s515_num(item.get("maeR"), None),
        "firstEventAt": item.get("firstEventAt"),
        "timeToFirstEventMinutes": item.get("timeToFirstEventMinutes") or item.get("timeToFirstEvent"),
    }



# === S8.14C Learning-Aware Selector Penalties ================================
S814C_SELECTOR_LEARNING_VERSION = "s8_14c_learning_aware_selector_v1"
S816A_ELITE_TEST_MODE_VERSION = "s8_16a_elite_test_mode_v1"
S816B_PROMOTION_VERSION = "s8_16b_test_to_ready_promotion_v1"


def _s814c_load_setup_learning_map() -> dict[str, dict[str, Any]]:
    """Load latest setup-learning output for selector penalties.

    This makes S8.14B actionable:
    the selector does not only report weak setups; it can demote them from
    selectedBestIdeas until evidence improves.
    """
    try:
        import json
        from pathlib import Path

        path = Path("reports/setup_learning/latest.json")
        if not path.exists():
            return {}

        payload = json.loads(path.read_text(encoding="utf-8"))
        rows = payload.get("setupLearning") if isinstance(payload, dict) else []
        if not isinstance(rows, list):
            return {}

        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            slug = str(row.get("setupSlug") or "").strip()
            if slug:
                out[slug] = row
        return out
    except Exception:
        return {}


def _s814c_pattern_names(learning: dict[str, Any]) -> set[str]:
    rows = learning.get("topFailurePatterns") if isinstance(learning, dict) else []
    names: set[str] = set()
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and row.get("pattern"):
                names.add(str(row.get("pattern")))
    return names


def _s814c_learning_gate_for_row(
    row: dict[str, Any],
    setup_learning_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    setup_slug = str(row.get("setupSlug") or "").strip()
    learning = setup_learning_map.get(setup_slug) if setup_slug else None

    if not isinstance(learning, dict) or not learning:
        return {
            "passed": True,
            "action": "ALLOW_NO_LEARNING_SAMPLE_YET",
            "version": S814C_SELECTOR_LEARNING_VERSION,
            "reasons": [],
            "setupLearningStatus": "NO_SAMPLE",
            "note": "No setup-learning row yet; S8.14A base gate still applies.",
        }

    status = str(learning.get("learningStatus") or "").upper().strip()
    closed = int(_s515_num(learning.get("closed"), 0) or 0)
    win_rate = _s515_num(learning.get("winRateClosed"), None)
    avg_r = _s515_num(learning.get("avgResultRClosed"), None)
    patterns = _s814c_pattern_names(learning)

    rr = float(_s515_num(row.get("rrToTp1"), 0) or 0)
    score = float(_s515_num(row.get("score"), 0) or 0)
    selector_score = float(_s515_num(row.get("selectorScore"), 0) or 0)
    current_r_raw = _s515_num(row.get("currentR"), None)
    current_r = float(current_r_raw) if current_r_raw is not None else None

    late_session_blocked = bool(row.get("lateSessionBlocked"))
    telegram_passed = bool(row.get("telegramPassed"))
    strict_eligible = bool(row.get("strictEligible"))
    desk_passed = bool(row.get("deskPassed"))

    passed = True
    action = "ALLOW"
    reasons: list[str] = []

    super_confirmed = (
        telegram_passed
        and strict_eligible
        and desk_passed
        and rr >= 2.5
        and score >= 95
        and selector_score >= 90
        and not late_session_blocked
        and (current_r is None or current_r >= 0)
    )

    clean_tightened = (
        desk_passed
        and rr >= 2.2
        and score >= 90
        and selector_score >= 80
        and not late_session_blocked
        and (current_r is None or current_r >= -0.25)
    )

    if status == "DEMOTE_TO_MONITOR_ONLY" and closed >= 10:
        if not super_confirmed:
            passed = False
            action = "BLOCK_TO_MONITOR_ONLY"
            reasons.append(f"s814c_learning_demotes_setup:{setup_slug}")

    elif status == "KEEP_AND_TIGHTEN":
        action = "ALLOW_ONLY_IF_TIGHTENED"
        if not clean_tightened:
            passed = False
            reasons.append(f"s814c_learning_requires_tightened_conditions:{setup_slug}")

        if "fast_stop_within_10m" in patterns and not strict_eligible:
            passed = False
            reasons.append("s814c_requires_strict_eligible_after_fast_stop_pattern")

        if "short_entry_before_real_breakdown" in patterns and not telegram_passed:
            passed = False
            reasons.append("s814c_requires_telegram_grade_confirmation_after_short_breakdown_failures")

    elif status == "PAPER_ONLY_UNTIL_SAMPLE_GROWS":
        action = "PAPER_ONLY_UNTIL_SAMPLE_GROWS"
        if not super_confirmed:
            passed = False
            reasons.append(f"s814c_paper_only_until_sample_grows:{setup_slug}")

    elif status == "PROMOTE_FOR_ELITE_TEST":
        action = "PROMOTE_FOR_ELITE_TEST"
        if not clean_tightened:
            passed = False
            reasons.append(f"s814c_promoted_setup_still_requires_clean_entry:{setup_slug}")

    elif status == "NEUTRAL_RETEST":
        action = "ALLOW_ONLY_IF_CLEAN_RETEST"
        if not clean_tightened:
            passed = False
            reasons.append(f"s814c_neutral_retest_requires_clean_conditions:{setup_slug}")

    # Universal pattern-specific guards.
    if "late_session_fomo_long" in patterns and late_session_blocked:
        passed = False
        reasons.append("s814c_blocks_known_late_session_fomo_pattern")

    if "rr_below_elite_threshold" in patterns and rr < 2.2:
        passed = False
        reasons.append("s814c_blocks_known_low_rr_pattern")

    if "single_reclaim_trigger_needs_hold_confirmation" in patterns:
        setup = setup_slug
        if setup == "vwap_reclaim_long" and not super_confirmed:
            passed = False
            reasons.append("s814c_reclaim_requires_hold_confirmation_or_super_confirmed")

    return {
        "passed": bool(passed),
        "action": action,
        "version": S814C_SELECTOR_LEARNING_VERSION,
        "reasons": reasons[:10],
        "setupLearningStatus": status,
        "setupClosed": closed,
        "setupWinRateClosed": win_rate,
        "setupAvgResultRClosed": avg_r,
        "topFailurePatterns": sorted(patterns)[:8],
        "eliteLiveTargetWinRate": 65,
    }


def _s814c_count_learning_blocks(candidate_rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in candidate_rows or []:
        gate = row.get("s814cLearningGate") if isinstance(row.get("s814cLearningGate"), dict) else {}
        for reason in gate.get("reasons") or []:
            key = str(reason)
            if key:
                counts[key] = counts.get(key, 0) + 1
    return counts


def _s814c_count_learning_statuses(candidate_rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in candidate_rows or []:
        gate = row.get("s814cLearningGate") if isinstance(row.get("s814cLearningGate"), dict) else {}
        status = str(gate.get("setupLearningStatus") or "UNKNOWN")
        counts[status] = counts.get(status, 0) + 1
    return counts

# === /S8.14C ================================================================

def _s515_build_daily_forward_report(
    *,
    date: str | None = None,
    limit: int = 160,
    max_best: int = 5,
    publish: bool = False,
) -> dict[str, Any]:
    safe_limit = max(20, min(int(limit or 160), 250))
    safe_max_best = max(1, min(int(max_best or 5), 8))
    date_key = _s515_date_key(date)
    setup_learning_map = _s814c_load_setup_learning_map()

    direct_lifecycle_items, lifecycle_source = _s515_load_lifecycle_items_direct()

    cockpit = build_signal_cockpit_payload(
        direct_lifecycle_items,
        limit=safe_limit,
        include_candles=False,
    )
    # S8.12B: production cockpit is stored behind {"ok": true, "value": {...}}.
    # Forward evidence must read the actual cockpit payload, not the wrapper.
    if isinstance(cockpit, dict) and isinstance(cockpit.get("value"), dict):
        cockpit = cockpit.get("value") or {}

    best_selector = cockpit.get("bestIdeaSelector") if isinstance(cockpit.get("bestIdeaSelector"), dict) else {}
    raw_selected = best_selector.get("selectedIdeas") if isinstance(best_selector.get("selectedIdeas"), list) else []
    raw_monitor = best_selector.get("monitorOnly") if isinstance(best_selector.get("monitorOnly"), list) else []
    selection_candidates = _s516_unique_ideas(list(raw_selected) + list(raw_monitor))
    active_items = _s515_section_items(cockpit, "active")
    armed_items = _s515_section_items(cockpit, "armed")
    watch_items = _s515_section_items(cockpit, "watchlist")
    lifecycle_items = _s515_section_items(cockpit, "lifecycle")
    if not lifecycle_items and direct_lifecycle_items:
        lifecycle_items = direct_lifecycle_items
        lifecycle_source = f"{lifecycle_source}:direct_attach_after_empty_cockpit_section"
    quality = cockpit.get("qualityGuardReport") if isinstance(cockpit.get("qualityGuardReport"), dict) else {}

    outcomes_by_key = _s515_recent_outcome_index(date_key, limit=800)
    candidate_rows: list[dict[str, Any]] = []
    for idea in selection_candidates:
        compact = _s515_compact_best_idea(idea)
        key = _s515_outcome_key(compact)
        matched_lifecycle = _s515_match_lifecycle_for_idea(compact, lifecycle_items)
        compact = _s515_attach_lifecycle_to_selected_row(compact, matched_lifecycle)
        compact["outcome"] = _s515_compact_outcome(outcomes_by_key.get(key))
        compact["entryHealth"] = _s516_entry_health(compact)
        candidate_rows.append(compact)

    ranked_candidate_rows = sorted(
        candidate_rows,
        key=lambda row: (
            -float((row.get("entryHealth") or {}).get("priorityScore") or -999),
            -float(row.get("selectorScore") or 0),
            str(row.get("symbol") or ""),
        ),
    )
    def _s814a_elite_signal_gate(row: dict[str, Any]) -> dict[str, Any]:
        """Evidence-aware elite gate.

        S8.14A separates product depth from paid/live quality:
        - weak setups can remain visible as monitor/paper ideas;
        - selectedBestIdeas must be closer to a professional desk-quality idea;
        - late-session reclaim/breakout/chase patterns are blocked from best selection.
        """
        setup_slug = str(row.get("setupSlug") or "").strip()
        health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
        health_state = str(health.get("state") or "").upper().strip()

        rr = float(_s515_num(row.get("rrToTp1"), 0) or 0)
        score = float(_s515_num(row.get("score"), 0) or 0)
        selector_score = float(_s515_num(row.get("selectorScore"), 0) or 0)
        current_r_raw = _s515_num(row.get("currentR"), None)
        current_r = float(current_r_raw) if current_r_raw is not None else None

        minutes_to_close_raw = _s515_num(row.get("minutesToCloseAtSignal"), None)
        minutes_to_close = float(minutes_to_close_raw) if minutes_to_close_raw is not None else None
        late_session_blocked = bool(row.get("lateSessionBlocked"))
        telegram_passed = bool(row.get("telegramPassed"))
        strict_eligible = bool(row.get("strictEligible"))
        desk_passed = bool(row.get("deskPassed"))

        reasons: list[str] = []
        passed = True

        positive_evidence_setups = {
            "vwap_rejection_short",
            "gap_hold_continuation_long",
            "opening_range_breakdown_short",
        }

        weak_until_retested_setups = {
            "vwap_reclaim_long",
            "large_cap_vwap_trend_long",
            "gap_and_crap_short",
            "opening_range_breakout_long",
            "large_cap_gap_continuation",
            "orb_pullback_continuation",
        }

        # Base professional gate.
        if health.get("paperTestOk") is not True:
            passed = False
            reasons.append("s814a_requires_entry_health_paper_test_ok")

        if health_state in {
            "NEAR_STOP_AVOID",
            "WEAK_NEAR_STOP_WAIT_REENTRY",
            "EXTENDED_DO_NOT_CHASE",
            "DO_NOT_TRADE_CLOSED_OR_INVALID",
            "CAUTION_AGAINST_ENTRY",
        }:
            passed = False
            reasons.append(f"s814a_blocks_entry_health:{health_state.lower()}")

        if not desk_passed:
            passed = False
            reasons.append("s814a_requires_desk_quality_passed")

        if rr < 2.2:
            passed = False
            reasons.append("s814a_requires_rr_2_2_plus")

        if score < 88:
            passed = False
            reasons.append("s814a_requires_score_88_plus")

        # Late-session psychological/FOMO guard.
        if late_session_blocked:
            passed = False
            reasons.append("s814a_blocks_late_session_new_entry")

        if minutes_to_close is not None and 0 <= minutes_to_close <= 20 and setup_slug in {
            "vwap_reclaim_long",
            "opening_range_breakout_long",
            "large_cap_vwap_trend_long",
            "large_cap_gap_continuation",
        }:
            passed = False
            reasons.append("s814a_blocks_late_reclaim_or_breakout_long")

        # Do not select weak families unless they are truly super-confirmed.
        if setup_slug in weak_until_retested_setups:
            super_confirmed = (
                telegram_passed
                and strict_eligible
                and rr >= 2.5
                and score >= 95
                and selector_score >= 90
                and (current_r is None or current_r >= 0)
                and not late_session_blocked
            )
            if not super_confirmed:
                passed = False
                reasons.append(f"s814a_weak_setup_monitor_only_until_super_confirmed:{setup_slug}")

        # Positive-evidence setups still need clean entry and RR, but do not require super confirmation.
        if setup_slug in positive_evidence_setups:
            if rr < 2.2:
                passed = False
                reasons.append(f"s814a_positive_setup_still_requires_rr_2_2:{setup_slug}")

        return {
            "passed": bool(passed),
            "reasons": reasons[:10],
            "setupEvidenceBucket": (
                "positive_evidence"
                if setup_slug in positive_evidence_setups
                else "weak_until_retested"
                if setup_slug in weak_until_retested_setups
                else "neutral"
            ),
            "eliteLiveTargetWinRate": 65,
            "note": "S8.14A gate protects Elite/best selection. Weak setups remain available as monitor/paper/training ideas.",
        }

    def _s516b_selection_ok(row: dict[str, Any]) -> bool:
        health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
        health_state = str(health.get("state") or "").upper().strip()
        if health.get("paperTestOk") is not True:
            row["s814aEliteGate"] = {
                "passed": False,
                "reasons": ["s516b_entry_health_paper_test_not_ok"],
                "setupEvidenceBucket": "unknown",
            }
            return False
        if health_state in {
            "NEAR_STOP_AVOID",
            "WEAK_NEAR_STOP_WAIT_REENTRY",
            "EXTENDED_DO_NOT_CHASE",
            "DO_NOT_TRADE_CLOSED_OR_INVALID",
        }:
            row["s814aEliteGate"] = {
                "passed": False,
                "reasons": [f"s516b_entry_health_block:{health_state.lower()}"],
                "setupEvidenceBucket": "unknown",
            }
            return False

        base_ok = False
        if row.get("strictEligible") is True:
            base_ok = True
        else:
            # Backward-safe fallback: older compact rows may miss strictEligible even though
            # they came from S5.14 strict-selected / strict-ranked rows.
            base_ok = (
                bool(row.get("deskPassed"))
                and (_s515_num(row.get("score"), 0) or 0) >= 78
                and (_s515_num(row.get("rrToTp1"), 0) or 0) >= 2
                and str(row.get("tier") or "") in {"ELITE_READY", "BEST_DESK_IDEA", "NEAR_ELITE"}
                and bool(row.get("whySelected"))
            )

        gate = _s814a_elite_signal_gate(row)
        row["s814aEliteGate"] = gate

        learning_gate = _s814c_learning_gate_for_row(row, setup_learning_map)
        row["s814cLearningGate"] = learning_gate

        if not gate.get("passed"):
            existing = row.get("strictBlockedReasons") if isinstance(row.get("strictBlockedReasons"), list) else []
            row["strictBlockedReasons"] = list(existing) + list(gate.get("reasons") or [])
            if not row.get("whyNotElite"):
                row["whyNotElite"] = list(gate.get("reasons") or [])
            return False

        if not learning_gate.get("passed"):
            existing = row.get("strictBlockedReasons") if isinstance(row.get("strictBlockedReasons"), list) else []
            row["strictBlockedReasons"] = list(existing) + list(learning_gate.get("reasons") or [])
            if not row.get("whyNotElite"):
                row["whyNotElite"] = list(learning_gate.get("reasons") or [])
            return False

        return bool(base_ok)

    def _s816a_row_key(row: dict[str, Any]) -> str:
        return "|".join([
            str(row.get("signalId") or row.get("signal_id") or ""),
            str(row.get("symbol") or ""),
            str(row.get("setupSlug") or row.get("setup_slug") or ""),
            str(row.get("triggerTime") or row.get("trigger_time") or row.get("createdAt") or ""),
        ])


    def _s816a_test_gate(row: dict[str, Any]) -> dict[str, Any]:
        health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
        health_state = str(health.get("state") or "").upper().strip()
        lifecycle = row.get("lifecycle") if isinstance(row.get("lifecycle"), dict) else {}
        lifecycle_status = str(lifecycle.get("status") or row.get("status") or "").upper().strip()

        rr = float(_s515_num(row.get("rrToTp1"), 0) or 0)
        score = float(_s515_num(row.get("score"), 0) or 0)
        selector_score = float(_s515_num(row.get("selectorScore"), 0) or 0)

        passed = True
        reasons: list[str] = []

        if health.get("paperTestOk") is not True:
            passed = False
            reasons.append("test_requires_paper_test_ok")

        if health_state not in {"HEALTHY_ENTRY_ZONE", "MILD_PULLBACK_STILL_VALID"}:
            passed = False
            reasons.append(f"test_blocks_entry_health:{health_state.lower() or 'unknown'}")

        if lifecycle_status in {"STOP_HIT", "INVALIDATED", "ENTRY_MISSED", "DO_NOT_TRADE_CLOSED_OR_INVALID", "CLOSED"}:
            passed = False
            reasons.append(f"test_blocks_lifecycle:{lifecycle_status.lower()}")

        if bool(row.get("lateSessionBlocked")):
            passed = False
            reasons.append("test_blocks_late_session")

        if bool(row.get("deskPassed")) is not True:
            passed = False
            reasons.append("test_requires_desk_passed")

        if rr < 2.0:
            passed = False
            reasons.append("test_requires_rr_2_0_plus")

        if score < 88:
            passed = False
            reasons.append("test_requires_score_88_plus")

        if selector_score < 75:
            passed = False
            reasons.append("test_requires_selector_score_75_plus")

        return {
            "passed": passed,
            "version": S816A_ELITE_TEST_MODE_VERSION,
            "layer": "CLEAN_ELITE_TEST",
            "reasons": reasons[:10],
            "clientVisible": False,
            "marketingClaimAllowed": False,
            "note": "Learning-only layer. Excluded from client/investor PnL graph.",
        }


    selected_rows = [
        row for row in ranked_candidate_rows
        if _s516b_selection_ok(row)
    ][:safe_max_best]

    for index, row in enumerate(selected_rows, start=1):
        row["rank"] = index
        row["role"] = "PRIMARY_IDEA" if index == 1 else "BACKUP_IDEA"
        row["eliteLayer"] = "CLEAN_ELITE_READY"
        row["deliveryMode"] = "CLIENT_ELITE_CANDIDATE"
        row["clientVisible"] = True
        row["marketingClaimAllowed"] = True

    selected_keys = {_s816a_row_key(row) for row in selected_rows}

    elite_test_rows: list[dict[str, Any]] = []
    for row in ranked_candidate_rows:
        if _s816a_row_key(row) in selected_keys:
            continue

        gate = _s816a_test_gate(row)
        row["s816aEliteTestGate"] = gate

        if gate.get("passed"):
            elite_test_rows.append(row)

        if len(elite_test_rows) >= safe_max_best:
            break

    for index, row in enumerate(elite_test_rows, start=1):
        row["rank"] = index
        row["role"] = "ELITE_TEST_IDEA"
        row["eliteLayer"] = "CLEAN_ELITE_TEST"
        row["deliveryMode"] = "PAPER_FORWARD_TEST_ONLY"
        row["clientVisible"] = False
        row["marketingClaimAllowed"] = False

    lifecycle_counts = _s515_status_counts(lifecycle_items)
    selected_status_counts = _s515_status_counts([
        row.get("lifecycle") for row in selected_rows if isinstance(row.get("lifecycle"), dict)
    ])
    candidate_entry_health_counts = _s516_counts_by_entry_health(candidate_rows)
    selected_entry_health_counts = _s516_counts_by_entry_health(selected_rows)
    s814c_learning_block_counts = _s814c_count_learning_blocks(candidate_rows)
    s814c_learning_status_counts = _s814c_count_learning_statuses(candidate_rows)

    no_trade_reasons: list[str] = []
    strict_blocked = best_selector.get("totals", {}).get("strictBlockedByReason") if isinstance(best_selector.get("totals"), dict) else {}
    if not selected_rows:
        no_trade_reasons.append("no_entry_health_qualified_best_idea_selected")
        if candidate_rows and any((row.get("entryHealth") or {}).get("paperTestOk") is True for row in candidate_rows):
            no_trade_reasons.append("paper_test_ok_candidates_exist_but_selection_filter_blocked_all")
        if isinstance(strict_blocked, dict) and strict_blocked:
            top_reasons = sorted(strict_blocked.items(), key=lambda row: int(row[1] or 0), reverse=True)[:5]
            no_trade_reasons.extend([f"blocked:{reason}:{count}" for reason, count in top_reasons])
        if s814c_learning_block_counts:
            top_learning_reasons = sorted(s814c_learning_block_counts.items(), key=lambda row: int(row[1] or 0), reverse=True)[:5]
            no_trade_reasons.extend([f"learning_blocked:{reason}:{count}" for reason, count in top_learning_reasons])
        elif active_items:
            no_trade_reasons.append("active_items_exist_but_none_passed_strict_selector")
        else:
            no_trade_reasons.append("no_active_items_in_current_snapshot")

    improvement_notes: list[str] = []
    if selected_rows:
        if all((row.get("telegramPassed") is False) for row in selected_rows):
            improvement_notes.append("all_best_ideas_are_desk_only_not_telegram_elite")
        if any((row.get("rrToTp1") or 0) < 2.2 for row in selected_rows):
            improvement_notes.append("elite_blocker_rr_2_2_threshold_is_main_gap")
        if any(((row.get("currentR") or 0) < -0.5) for row in candidate_rows):
            improvement_notes.append("entry_health_guard_penalized_candidates_already_more_than_minus_0_5r")
        if any(((row.get("entryHealth") or {}).get("state") == "CAUTION_AGAINST_ENTRY") for row in selected_rows):
            improvement_notes.append("some_selected_ideas_need_reclaim_of_entry_zone_before_paper_test")
    else:
        if candidate_rows and any((row.get("entryHealth") or {}).get("paperTestOk") is True for row in candidate_rows):
            improvement_notes.append("entry_health_candidates_exist_but_no_final_selection_check_selection_filter")
        else:
            improvement_notes.append("keep_no_trade_state_until_quality_inputs_exist")

    payload = {
        "ok": True,
        "version": S515_DAILY_FORWARD_REPORT_VERSION,
        "date": date_key,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "fresh_compact_cockpit_payload",
        "lifecycleSource": lifecycle_source,
        "runtimeStatus": cockpit.get("runtimeStatus"),
        "counts": {
            "watchCount": len(watch_items),
            "armedCount": len(armed_items),
            "activeCount": len(active_items),
            "lifecycleCount": len(lifecycle_items),
            "directLifecycleCount": len(direct_lifecycle_items),
            "rankedActiveCount": best_selector.get("totals", {}).get("rankedActiveCount") if isinstance(best_selector.get("totals"), dict) else 0,
            "strictEligibleCount": best_selector.get("totals", {}).get("strictEligibleCount") if isinstance(best_selector.get("totals"), dict) else 0,
            "entryHealthCandidateCount": len(candidate_rows),
            "paperTestOkCandidateCount": len([row for row in candidate_rows if (row.get("entryHealth") or {}).get("paperTestOk") is True]),
            "entryHealthSelectionEligibleCount": len([row for row in ranked_candidate_rows if _s516b_selection_ok(row)]),
            "selectedBestCount": len(selected_rows),
            "cleanEliteTestCount": len(elite_test_rows),
            "monitorCount": best_selector.get("totals", {}).get("monitorCount") if isinstance(best_selector.get("totals"), dict) else 0,
        },
        "dailyDeskState": {
            "state": "BEST_IDEAS_READY" if selected_rows else "NO_TRADE_NO_BEST_IDEA",
            "lifecycleByStatus": lifecycle_counts,
            "selectedLifecycleByStatus": selected_status_counts,
            "candidateEntryHealthByState": candidate_entry_health_counts,
            "selectedEntryHealthByState": selected_entry_health_counts,
            "telegramEliteReadyCount": best_selector.get("totals", {}).get("eliteReadyCount") if isinstance(best_selector.get("totals"), dict) else 0,
            "nearEliteCount": best_selector.get("totals", {}).get("nearEliteCount") if isinstance(best_selector.get("totals"), dict) else 0,
            "cleanEliteTestCount": len(elite_test_rows),
        },
        "selectedBestIdeas": selected_rows,
        "cleanEliteTestIdeas": elite_test_rows,
        "calibrationCandidates": ranked_candidate_rows[:20],
        "monitoring": {
            "notSelectedCount": max(0, int(best_selector.get("totals", {}).get("monitorCount") or 0)),
            "entryHealthByState": candidate_entry_health_counts,
            "strictBlockedByReason": strict_blocked if isinstance(strict_blocked, dict) else {},
            "telegramBlockedByReason": quality.get("byTelegramBlockReason") if isinstance(quality.get("byTelegramBlockReason"), list) else [],
            "s814cLearningBlockedByReason": s814c_learning_block_counts,
            "s814cLearningStatusBySetup": s814c_learning_status_counts,
            "s814cSetupLearningLoaded": len(setup_learning_map),
            "s814cVersion": S814C_SELECTOR_LEARNING_VERSION,
            "s816aVersion": S816A_ELITE_TEST_MODE_VERSION,
            "s816aEliteTestCount": len(elite_test_rows),
        },
        "outcomes": {
            "matchedSelectedOutcomes": len([row for row in selected_rows if row.get("outcome")]),
            "note": "Intraday lifecycle is available now; final outcome stats become meaningful after outcomes run near/after session close.",
        },
        "noTradeReasons": no_trade_reasons,
        "learningNotes": improvement_notes,
        "nextActions": [
            "Keep selectedBestIdeas for paper/forward-test only; obey entryHealth.action and avoid chase/near-stop states.",
            "After market close run outcomes, then compare selectedBestIdeas against TP1/STOP/INVALIDATED/MFE/MAE.",
            "Use repeated daily reports as input for S6 Historical Replay and S7 Calibration/Re-ranking.",
        ],
    }

    if publish:
        runtime_cache.set_json(S515_FORWARD_REPORT_CACHE_KEY, payload, ttl_seconds=7 * 24 * 60 * 60)
    return payload


@app.get("/engine/forward-report/today")
def engine_forward_report_today(date: str | None = None, limit: int = 160, max_best: int = 5, publish: bool = False):
    report = _s515_build_daily_forward_report(date=date, limit=limit, max_best=max_best, publish=publish)
    return {
        "ok": True,
        "value": report,
        "storageVersion": S515_DAILY_FORWARD_REPORT_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/forward-report/run")
async def engine_forward_report_run(
    date: str | None = None,
    limit: int = 160,
    max_best: int = 5,
    publish: bool = True,
    refresh_lifecycle: bool = True,
    interval: str = "5min",
):
    lifecycle_refresh = None
    if refresh_lifecycle:
        lifecycle_refresh = await run_signal_lifecycle_manager(
            interval=interval,
            limit=max(1, min(int(limit or 100), 100)),
            publish=True,
        )

    report = _s515_build_daily_forward_report(date=date, limit=limit, max_best=max_best, publish=publish)
    report["lifecycleRefresh"] = {
        "requested": bool(refresh_lifecycle),
        "ok": bool(lifecycle_refresh.get("ok")) if isinstance(lifecycle_refresh, dict) else None,
        "count": lifecycle_refresh.get("count") if isinstance(lifecycle_refresh, dict) else None,
        "sourceActiveCount": lifecycle_refresh.get("sourceActiveCount") if isinstance(lifecycle_refresh, dict) else None,
        "lifecycleSource": lifecycle_refresh.get("lifecycleSource") if isinstance(lifecycle_refresh, dict) else None,
        "summary": lifecycle_refresh.get("summary") if isinstance(lifecycle_refresh, dict) else None,
        "interval": interval,
    }
    return {
        "ok": True,
        "value": report,
        "storageVersion": S515_DAILY_FORWARD_REPORT_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/forward-report/cache")
def engine_forward_report_cache():
    payload = runtime_cache.get_json(S515_FORWARD_REPORT_CACHE_KEY)
    return {
        "ok": isinstance(payload, dict),
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S515_DAILY_FORWARD_REPORT_VERSION,
        "cache": runtime_cache.get_status(),
    }




# === S8.12C Investor Evidence Snapshot =======================================
S812C_EVIDENCE_SNAPSHOT_VERSION = "s8_12c_investor_evidence_snapshot_v1"
S812C_EVIDENCE_CACHE_KEY = "engine:evidence:today"


def _s812c_outcome_date(item: dict[str, Any]) -> str:
    for key in ("sessionDate", "session_date", "triggerTime", "createdAt", "evaluatedAt", "storedAt", "firstEventAt"):
        value = item.get(key)
        if value:
            return str(value)[:10]
    return ""


def _s812c_filter_outcomes_by_date(items: list[dict[str, Any]], date_key: str) -> list[dict[str, Any]]:
    return [
        item for item in (items or [])
        if isinstance(item, dict) and _s812c_outcome_date(item) == date_key
    ]


def _s812c_compact_idea(row: dict[str, Any]) -> dict[str, Any]:
    health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
    outcome = row.get("outcome") if isinstance(row.get("outcome"), dict) else None
    return {
        "rank": row.get("rank"),
        "role": row.get("role"),
        "symbol": row.get("symbol"),
        "setupSlug": row.get("setupSlug"),
        "setupName": row.get("setupName"),
        "direction": row.get("direction"),
        "status": row.get("status"),
        "lifecycleStatus": row.get("lifecycleStatus"),
        "score": _s515_num(row.get("score"), None),
        "selectorScore": _s515_num(row.get("selectorScore"), None),
        "rrToTp1": _s515_num(row.get("rrToTp1"), None),
        "entry": _s515_num(row.get("entry"), None),
        "stop": _s515_num(row.get("stop"), None),
        "tp1": _s515_num(row.get("tp1"), None),
        "tp2": _s515_num(row.get("tp2"), None),
        "currentPrice": _s515_num(row.get("currentPrice"), None),
        "currentR": _s515_num(row.get("currentR"), None),
        "priceFreshness": row.get("priceFreshness"),
        "priceAgeSeconds": _s515_num(row.get("priceAgeSeconds"), None),
        "managementState": row.get("managementState"),
        "tradeAction": row.get("tradeAction"),
        "entryHealthState": health.get("state"),
        "entryHealthAction": health.get("action"),
        "entryHealthPriorityScore": _s515_num(health.get("priorityScore"), None),
        "deskPassed": bool(row.get("deskPassed")),
        "telegramPassed": bool(row.get("telegramPassed")),
        "strictEligible": bool(row.get("strictEligible")),
        "isActionable": bool(row.get("isActionable")),
        "outcome": {
            "status": outcome.get("status"),
            "event": outcome.get("event"),
            "resultR": _s515_num(outcome.get("resultR"), None),
            "mfeR": _s515_num(outcome.get("mfeR"), None),
            "maeR": _s515_num(outcome.get("maeR"), None),
            "firstEventAt": outcome.get("firstEventAt"),
        } if outcome else None,
        "whySelected": row.get("whySelected") if isinstance(row.get("whySelected"), list) else [],
        "whyNotElite": row.get("whyNotElite") if isinstance(row.get("whyNotElite"), list) else [],
        "cautions": row.get("cautions") if isinstance(row.get("cautions"), list) else [],
    }


def _s812c_compact_setup_stat(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "setupSlug": row.get("setupSlug"),
        "count": row.get("count"),
        "rawCount": row.get("rawCount"),
        "evaluableCount": row.get("evaluableCount"),
        "noEvalLateSession": row.get("noEvalLateSession"),
        "closed": row.get("closed"),
        "worked": row.get("worked"),
        "failed": row.get("failed"),
        "winRateClosed": row.get("winRateClosed"),
        "avgResultRClosed": row.get("avgResultRClosed"),
        "avgMfeR": row.get("avgMfeR"),
        "avgMaeR": row.get("avgMaeR"),
    }


def _s812c_top_telegram_blockers(monitoring: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    rows = monitoring.get("telegramBlockedByReason") if isinstance(monitoring, dict) else []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows[:limit]:
        if not isinstance(row, dict):
            continue
        out.append({
            "reason": row.get("reason"),
            "count": row.get("count"),
            "examples": row.get("examples") if isinstance(row.get("examples"), list) else [],
        })
    return out


def _s812c_write_report_file(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        import json
        from pathlib import Path
        report_dir = Path("reports/investor_evidence")
        report_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        dated_path = report_dir / f"{stamp}.json"
        latest_path = report_dir / "latest.json"
        body = json.dumps(payload, ensure_ascii=False, indent=2)
        dated_path.write_text(body, encoding="utf-8")
        latest_path.write_text(body, encoding="utf-8")
        return {
            "ok": True,
            "path": str(dated_path),
            "latestPath": str(latest_path),
        }
    except Exception as error:
        return {
            "ok": False,
            "error": repr(error),
        }


def _s812c_build_investor_evidence_snapshot(
    *,
    date: str | None = None,
    limit: int = 160,
    max_best: int = 5,
    publish: bool = False,
) -> dict[str, Any]:
    date_key = _s515_date_key(date)

    forward = _s515_build_daily_forward_report(
        date=date_key,
        limit=limit,
        max_best=max_best,
        publish=publish,
    )

    selected = forward.get("selectedBestIdeas") if isinstance(forward.get("selectedBestIdeas"), list) else []
    monitoring = forward.get("monitoring") if isinstance(forward.get("monitoring"), dict) else {}
    counts = forward.get("counts") if isinstance(forward.get("counts"), dict) else {}
    desk_state = forward.get("dailyDeskState") if isinstance(forward.get("dailyDeskState"), dict) else {}
    forward_outcomes = forward.get("outcomes") if isinstance(forward.get("outcomes"), dict) else {}

    try:
        clean_elite_report = _s815a_clean_elite_stats(
            initial_capital=50000,
            risk_pct=0.01,
            publish=publish,
        )
    except Exception as exc:
        clean_elite_report = {
            "ok": False,
            "error": str(exc),
        }

    clean_elite_summary = (
        clean_elite_report.get("summary")
        if isinstance(clean_elite_report.get("summary"), dict)
        else {}
    )
    clean_elite_test_summary = (
        clean_elite_report.get("eliteTestSummary")
        if isinstance(clean_elite_report.get("eliteTestSummary"), dict)
        else {}
    )
    clean_elite_promotion = (
        clean_elite_report.get("testToReadyPromotion")
        if isinstance(clean_elite_report.get("testToReadyPromotion"), dict)
        else {}
    )
    clean_elite_test_promotion = {
        "mode": "READ_ONLY_NO_GATE_CHANGE",
        "readyGatesChanged": False,
        "clientVisible": False,
        "marketingClaimAllowed": False,
        "readyLedgerCount": clean_elite_summary.get("readyLedgerCount"),
        "testLedgerCount": clean_elite_summary.get("testLedgerCount"),
        "eliteTestSummary": clean_elite_test_summary,
        "testToReadyPromotion": clean_elite_promotion,
        "promotionCandidateCount": clean_elite_promotion.get("promotionCandidateCount"),
        "promotionCandidates": clean_elite_promotion.get("promotionCandidates") if isinstance(clean_elite_promotion.get("promotionCandidates"), list) else [],
        "note": "Daily/post-close TEST-to-READY review section. It never changes READY gates automatically.",
    }

    try:
        all_outcomes = load_persistent_outcome_items(limit=5000)
    except Exception:
        all_outcomes = []

    today_outcomes = _s812c_filter_outcomes_by_date(all_outcomes, date_key)
    today_summary = build_outcome_summary(today_outcomes)
    today_statistics = build_outcome_statistics(today_outcomes)

    global_summary = build_outcome_summary(all_outcomes)
    global_statistics = build_outcome_statistics(all_outcomes)

    try:
        setup_rows = build_setup_statistics(all_outcomes)
    except Exception:
        setup_rows = []

    setup_rows = [row for row in setup_rows if isinstance(row, dict)]
    closed_setup_rows = [row for row in setup_rows if int(row.get("closed") or 0) > 0]

    best_setup_rows = sorted(
        closed_setup_rows,
        key=lambda row: (
            float(row.get("avgResultRClosed") if row.get("avgResultRClosed") is not None else -999),
            float(row.get("winRateClosed") if row.get("winRateClosed") is not None else -999),
            int(row.get("closed") or 0),
        ),
        reverse=True,
    )[:5]

    weak_setup_rows = sorted(
        closed_setup_rows,
        key=lambda row: (
            float(row.get("avgResultRClosed") if row.get("avgResultRClosed") is not None else 999),
            float(row.get("winRateClosed") if row.get("winRateClosed") is not None else 999),
            -int(row.get("closed") or 0),
        ),
    )[:5]

    selected_compact = [_s812c_compact_idea(row) for row in selected if isinstance(row, dict)]

    selected_symbols = [
        str(row.get("symbol") or "").upper().strip()
        for row in selected_compact
        if str(row.get("symbol") or "").strip()
    ]

    telegram_blockers = _s812c_top_telegram_blockers(monitoring)

    matched_selected_outcomes = int(forward_outcomes.get("matchedSelectedOutcomes") or 0)
    selected_count = len(selected_compact)
    selected_with_outcomes = len([row for row in selected_compact if row.get("outcome")])

    headline = (
        f"{selected_count} forward-test desk ideas selected"
        if selected_count
        else "No forward-test desk idea selected"
    )

    evidence_quality = "early_forward_test"
    if int(global_summary.get("closed") or 0) >= 50:
        evidence_quality = "growing_live_sample"
    if int(global_summary.get("closed") or 0) >= 200:
        evidence_quality = "meaningful_live_sample"

    payload = {
        "ok": True,
        "version": S812C_EVIDENCE_SNAPSHOT_VERSION,
        "date": date_key,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "forward_report_plus_outcome_statistics",
        "headline": headline,
        "investorSummary": {
            "state": desk_state.get("state"),
            "evidenceQuality": evidence_quality,
            "selectedBestCount": selected_count,
            "selectedSymbols": selected_symbols,
            "watchCount": counts.get("watchCount"),
            "activeCount": counts.get("activeCount"),
            "armedCount": counts.get("armedCount"),
            "strictEligibleCount": counts.get("strictEligibleCount"),
            "monitorCount": counts.get("monitorCount"),
            "telegramEliteReadyCount": desk_state.get("telegramEliteReadyCount"),
            "whyTelegramMayBeZero": telegram_blockers,
            "matchedSelectedOutcomes": matched_selected_outcomes,
            "selectedWithOutcomeRows": selected_with_outcomes,
            "todayClosedOutcomes": today_summary.get("closed"),
            "todayWinRateClosed": today_summary.get("winRateClosed"),
            "todayAvgResultRClosed": today_summary.get("avgResultRClosed"),
            "globalClosedOutcomes": global_summary.get("closed"),
            "globalWinRateClosed": global_summary.get("winRateClosed"),
            "globalAvgResultRClosed": global_summary.get("avgResultRClosed"),
        },
        "counts": counts,
        "dailyDeskState": desk_state,
        "cleanEliteTestPromotion": clean_elite_test_promotion,
        "selectedBestIdeas": selected_compact,
        "monitoringSummary": {
            "notSelectedCount": monitoring.get("notSelectedCount"),
            "entryHealthByState": monitoring.get("entryHealthByState") if isinstance(monitoring.get("entryHealthByState"), dict) else {},
            "strictBlockedByReason": monitoring.get("strictBlockedByReason") if isinstance(monitoring.get("strictBlockedByReason"), dict) else {},
            "telegramBlockedByReason": telegram_blockers,
        },
        "outcomeEvidence": {
            "today": {
                "date": date_key,
                "count": len(today_outcomes),
                "summary": today_summary,
                "statistics": today_statistics,
            },
            "global": {
                "count": len(all_outcomes),
                "summary": global_summary,
                "statistics": global_statistics,
            },
            "forwardMatchedSelectedOutcomes": matched_selected_outcomes,
            "note": "Today outcome stats become most useful after the post-close outcomes run.",
        },
        "setupEvidence": {
            "bestByAvgRClosed": [_s812c_compact_setup_stat(row) for row in best_setup_rows],
            "weakByAvgRClosed": [_s812c_compact_setup_stat(row) for row in weak_setup_rows],
            "sampleSizeWarning": "Setup rankings are informational until each setup has enough closed live outcomes.",
        },
        "learningNotes": forward.get("learningNotes") if isinstance(forward.get("learningNotes"), list) else [],
        "nextActions": [
            "Use selectedBestIdeas as paper/forward-test candidates only.",
            "Run outcomes after session close and refresh this evidence snapshot.",
            "Do not loosen Telegram/Elite gates until forward evidence has enough closed outcomes.",
            "Use repeated evidence snapshots for investor reporting and calibration review.",
        ],
        "sourceForwardReport": {
            "version": forward.get("version"),
            "state": desk_state.get("state"),
            "generatedAt": forward.get("generatedAt"),
            "lifecycleSource": forward.get("lifecycleSource"),
        },
    }

    if publish:
        # S8.12C-2: write report metadata before caching so /engine/evidence/cache
        # returns the same investor evidence payload as /engine/evidence/run.
        payload["reportFile"] = _s812c_write_report_file(payload)
        runtime_cache.set_json(S812C_EVIDENCE_CACHE_KEY, payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/evidence/today")
def engine_evidence_today(date: str | None = None, limit: int = 160, max_best: int = 5, publish: bool = False):
    payload = _s812c_build_investor_evidence_snapshot(
        date=date,
        limit=limit,
        max_best=max_best,
        publish=publish,
    )
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S812C_EVIDENCE_SNAPSHOT_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/evidence/run")
def engine_evidence_run(date: str | None = None, limit: int = 160, max_best: int = 5, publish: bool = True):
    payload = _s812c_build_investor_evidence_snapshot(
        date=date,
        limit=limit,
        max_best=max_best,
        publish=publish,
    )
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S812C_EVIDENCE_SNAPSHOT_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/evidence/cache")
def engine_evidence_cache():
    payload = runtime_cache.get_json(S812C_EVIDENCE_CACHE_KEY)
    return {
        "ok": isinstance(payload, dict),
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S812C_EVIDENCE_SNAPSHOT_VERSION,
        "cache": runtime_cache.get_status(),
    }

# === /S8.12C ================================================================



# === S8.14D Investor Dashboard Snapshot API ==================================
S814D_INVESTOR_DASHBOARD_VERSION = "s8_14d_investor_dashboard_snapshot_v1"
S814D_INVESTOR_DASHBOARD_CACHE_KEY = "engine:investor_dashboard:snapshot"


def _s814d_read_report_json(path_value: str) -> dict[str, Any]:
    try:
        import json
        from pathlib import Path

        path = Path(path_value)
        if not path.exists():
            return {}
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _s814d_num(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        out = float(value)
        if out != out:
            return default
        return out
    except Exception:
        return default


def _s814d_compact_simulation(sim: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(sim, dict):
        sim = {}

    return {
        "initialCapital": _s814d_num(sim.get("initialCapital"), 50000),
        "riskPctPerTrade": _s814d_num(sim.get("riskPctPerTrade"), None),
        "closedTrades": int(_s814d_num(sim.get("closedTrades"), 0) or 0),
        "finalEquity": _s814d_num(sim.get("finalEquity"), None),
        "totalReturnPct": _s814d_num(sim.get("totalReturnPct"), None),
        "maxDrawdownPct": _s814d_num(sim.get("maxDrawdownPct"), None),
        "curveSample": sim.get("curveSample") if isinstance(sim.get("curveSample"), list) else [],
        "note": sim.get("note") or "Paper simulation from stored outcomes only; not a live performance claim.",
    }


def _s814d_setup_cards(setup_learning_rows: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in setup_learning_rows:
        if not isinstance(row, dict):
            continue

        status = str(row.get("learningStatus") or "UNKNOWN")
        avg_r = _s814d_num(row.get("avgResultRClosed"), None)
        win_rate = _s814d_num(row.get("winRateClosed"), None)
        closed = int(_s814d_num(row.get("closed"), 0) or 0)

        if status == "PROMOTE_FOR_ELITE_TEST":
            investor_tone = "positive"
            investor_label = "Candidate for elite testing"
        elif status == "KEEP_AND_TIGHTEN":
            investor_tone = "watch"
            investor_label = "Keep, but tighten rules"
        elif status == "DEMOTE_TO_MONITOR_ONLY":
            investor_tone = "risk"
            investor_label = "Demoted to monitor-only"
        elif status == "PAPER_ONLY_UNTIL_SAMPLE_GROWS":
            investor_tone = "neutral"
            investor_label = "Paper-only until sample grows"
        else:
            investor_tone = "neutral"
            investor_label = "Needs more evidence"

        out.append({
            "setupSlug": row.get("setupSlug"),
            "learningStatus": status,
            "investorTone": investor_tone,
            "investorLabel": investor_label,
            "closed": closed,
            "worked": row.get("worked"),
            "failed": row.get("failed"),
            "winRateClosed": win_rate,
            "avgResultRClosed": avg_r,
            "avgMfeR": _s814d_num(row.get("avgMfeR"), None),
            "avgMaeR": _s814d_num(row.get("avgMaeR"), None),
            "topFailurePatterns": row.get("topFailurePatterns") if isinstance(row.get("topFailurePatterns"), list) else [],
            "recommendedRules": row.get("recommendedRules") if isinstance(row.get("recommendedRules"), list) else [],
        })

    return out


def _s814d_marketing_readiness(
    *,
    automation_ok: bool,
    setup_summary: dict[str, Any],
    all_sim: dict[str, Any],
    elite_snapshot: dict[str, Any],
) -> dict[str, Any]:
    closed = int(_s814d_num(setup_summary.get("closed"), 0) or 0)
    win_rate = _s814d_num(setup_summary.get("winRateClosed"), 0) or 0
    avg_r = _s814d_num(setup_summary.get("avgResultRClosed"), 0) or 0
    max_dd = _s814d_num(all_sim.get("maxDrawdownPct"), None)
    elite_closed = int(_s814d_num(elite_snapshot.get("closedTrades"), 0) or 0)
    elite_win_rate = _s814d_num(elite_snapshot.get("winRateClosed"), None)

    blockers: list[str] = []
    positives: list[str] = []

    if automation_ok:
        positives.append("post_close_automation_and_learning_reports_are_running")
    else:
        blockers.append("automation_not_stable_yet")

    if closed >= 500:
        positives.append("raw_outcome_sample_is_large_enough_for_filter_learning")
    else:
        blockers.append("need_more_raw_outcomes_for_learning_confidence")

    if win_rate < 55:
        blockers.append("raw_layer_win_rate_is_not_marketable")
    if avg_r <= 0:
        blockers.append("raw_layer_expectancy_is_not_positive")
    if max_dd is not None and max_dd < -15:
        blockers.append("raw_layer_drawdown_is_too_large_for_investor_story")

    if elite_closed < 50:
        blockers.append("need_50_to_100_closed_clean_elite_signals_before_aggressive_marketing")
    if elite_win_rate is None or elite_win_rate < 60:
        blockers.append("need_clean_elite_win_rate_near_60_65_percent")

    if not blockers:
        status = "READY_FOR_MARKETING_SCALE"
        recommendation = "Marketing can scale with evidence, risk disclosure, and investor dashboard."
    elif automation_ok and closed >= 100:
        status = "PRIVATE_BETA_AND_WAITLIST"
        recommendation = "Use waitlist, private beta, demos, and behind-the-scenes content. Do not market as finished performance product yet."
    else:
        status = "BUILD_AND_COLLECT_EVIDENCE"
        recommendation = "Keep building automation and forward evidence before marketing."

    return {
        "status": status,
        "recommendation": recommendation,
        "targetEliteWinRate": 65,
        "minimumEliteClosedSignalsBeforeScale": 50,
        "preferredEliteClosedSignalsBeforeScale": 100,
        "positives": positives,
        "blockers": blockers,
    }



def _s817a_upgrade_investor_dashboard_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return payload

    headline = payload.get("headlineMetrics")
    if not isinstance(headline, dict):
        headline = {}
        payload["headlineMetrics"] = headline

    ce = payload.get("cleanElitePerformance")
    if not isinstance(ce, dict):
        return payload

    test = ce.get("eliteTestSummary")
    if not isinstance(test, dict):
        test = {}

    ready_closed = int(_s814d_num(ce.get("closedTrades"), 0) or 0)
    ready_open = int(_s814d_num(ce.get("openTrades"), 0) or 0)
    ready_worked = int(_s814d_num(ce.get("worked"), 0) or 0)
    ready_failed = int(_s814d_num(ce.get("failed"), 0) or 0)

    test_closed = int(_s814d_num(test.get("closed"), 0) or 0)
    test_open = int(_s814d_num(test.get("open"), 0) or 0)
    test_worked = int(_s814d_num(test.get("worked"), 0) or 0)
    test_failed = int(_s814d_num(test.get("failed"), 0) or 0)
    test_win = _s814d_num(test.get("winRateClosed"), None)
    test_avg_r = _s814d_num(test.get("avgResultRClosed"), None)

    ready_status = "empty_collecting" if ready_closed == 0 else "collecting_ready_sample"
    test_status = "learning_only_forward_test" if test_closed > 0 else "collecting_test_sample"

    ce["status"] = "ready_empty_test_layer_collecting" if ready_closed == 0 and test_closed > 0 else ce.get("status")

    ce["readyPerformance"] = {
        "layer": "CLEAN_ELITE_READY",
        "clientVisible": True,
        "marketingClaimAllowed": ready_closed >= 50,
        "closedTrades": ready_closed,
        "openTrades": ready_open,
        "worked": ready_worked,
        "failed": ready_failed,
        "winRateClosed": ce.get("winRateClosed"),
        "avgResultRClosed": ce.get("avgResultRClosed"),
        "status": ready_status,
    }

    ce["testPerformance"] = {
        "layer": "CLEAN_ELITE_TEST",
        "clientVisible": False,
        "marketingClaimAllowed": False,
        "closedTrades": test_closed,
        "openTrades": test_open,
        "worked": test_worked,
        "failed": test_failed,
        "winRateClosed": test_win,
        "avgResultRClosed": test_avg_r,
        "status": test_status,
        "note": "Internal learning-only layer. Never use as client-visible or investor performance claim.",
    }

    ce["displaySummary"] = {
        "readyStatus": ready_status,
        "testStatus": test_status,
        "testLayerHasEvidence": test_closed > 0,
        "message": "READY performance is still empty; TEST layer is collecting internal forward evidence.",
    }

    headline["cleanEliteTestClosedTrades"] = test_closed
    headline["cleanEliteTestWorked"] = test_worked
    headline["cleanEliteTestFailed"] = test_failed
    headline["cleanEliteTestOpenTrades"] = test_open
    headline["cleanEliteTestWinRateClosed"] = test_win
    headline["cleanEliteTestAvgResultRClosed"] = test_avg_r
    headline["cleanEliteReadyStatus"] = ready_status
    headline["cleanEliteTestStatus"] = test_status
    headline["cleanEliteDisplayMessage"] = ce["displaySummary"]["message"]

    payload["cleanElitePerformance"] = ce
    return payload




def _s814d_build_investor_dashboard_snapshot() -> dict[str, Any]:
    setup_report = _s814d_read_report_json("reports/setup_learning/latest.json")
    post_close_report = _s814d_read_report_json("reports/post_close_evidence/latest.json")
    evidence_report = _s814d_read_report_json("reports/investor_evidence/latest.json")

    setup_summary = setup_report.get("summary") if isinstance(setup_report.get("summary"), dict) else {}
    setup_rows = setup_report.get("setupLearning") if isinstance(setup_report.get("setupLearning"), list) else []

    investor_summary = evidence_report.get("investorSummary") if isinstance(evidence_report.get("investorSummary"), dict) else {}
    post_close_summary = post_close_report.get("summary") if isinstance(post_close_report.get("summary"), dict) else {}

    sim = setup_report.get("investorSimulationDraft") if isinstance(setup_report.get("investorSimulationDraft"), dict) else {}
    all_sim = _s814d_compact_simulation(sim.get("allClosedOutcomes") if isinstance(sim.get("allClosedOutcomes"), dict) else {})
    premium_sim = _s814d_compact_simulation(sim.get("premiumClosedOutcomes") if isinstance(sim.get("premiumClosedOutcomes"), dict) else {})
    telegram_sim = _s814d_compact_simulation(sim.get("telegramEligibleClosedOutcomes") if isinstance(sim.get("telegramEligibleClosedOutcomes"), dict) else {})

    automation_ok = bool(
        post_close_report.get("ok")
        and post_close_summary.get("healthOk")
        and post_close_summary.get("outcomesOk")
        and post_close_summary.get("forwardReportOk")
        and post_close_summary.get("evidenceOk")
        and setup_report.get("ok")
    )

    # S8.15B: Clean Elite is now a real separate ledger, not a placeholder.
    # It intentionally ignores old raw/premium_signal records and only tracks
    # selectedBestIdeas that passed current Elite selector gates.
    try:
        clean_elite_report = _s815a_clean_elite_stats(
            initial_capital=50000,
            risk_pct=0.01,
            publish=True,
        )
    except Exception:
        clean_elite_report = {}

    clean_elite_summary = (
        clean_elite_report.get("summary")
        if isinstance(clean_elite_report.get("summary"), dict)
        else {}
    )

    clean_elite_test_summary = (
        clean_elite_report.get("eliteTestSummary")
        if isinstance(clean_elite_report.get("eliteTestSummary"), dict)
        else {}
    )
    clean_elite_promotion = (
        clean_elite_report.get("testToReadyPromotion")
        if isinstance(clean_elite_report.get("testToReadyPromotion"), dict)
        else {}
    )

    clean_elite_closed = int(_s814d_num(clean_elite_summary.get("closed"), 0) or 0)
    clean_elite_win_rate = _s814d_num(clean_elite_summary.get("winRateClosed"), None)
    clean_elite_avg_r = _s814d_num(clean_elite_summary.get("avgResultRClosed"), None)

    if clean_elite_closed >= 100 and clean_elite_win_rate is not None and clean_elite_win_rate >= 65 and clean_elite_avg_r is not None and clean_elite_avg_r > 0:
        clean_elite_status = "investor_grade_sample_ready"
    elif clean_elite_closed >= 50:
        clean_elite_status = "clean_elite_sample_under_review"
    else:
        clean_elite_status = "collecting_clean_elite_sample"

    clean_elite_snapshot = {
        "status": clean_elite_status,
        "ledgerCount": clean_elite_summary.get("ledgerCount"),
        "closedTrades": clean_elite_summary.get("closed"),
        "openTrades": clean_elite_summary.get("open"),
        "worked": clean_elite_summary.get("worked"),
        "failed": clean_elite_summary.get("failed"),
        "winRateClosed": clean_elite_summary.get("winRateClosed"),
        "avgResultRClosed": clean_elite_summary.get("avgResultRClosed"),
        "finalEquity": clean_elite_summary.get("finalEquity"),
        "totalReturnPct": clean_elite_summary.get("totalReturnPct"),
        "maxDrawdownPct": clean_elite_summary.get("maxDrawdownPct"),
        "readyLedgerCount": clean_elite_summary.get("readyLedgerCount"),
        "testLedgerCount": clean_elite_summary.get("testLedgerCount"),
        "eliteTestSummary": clean_elite_test_summary,
        "testToReadyPromotion": clean_elite_promotion,
        "riskPctPerTrade": 1.0,
        "equityCurve": clean_elite_report.get("equityCurve") if isinstance(clean_elite_report.get("equityCurve"), list) else [],
        "setupStats": clean_elite_report.get("setupStats") if isinstance(clean_elite_report.get("setupStats"), list) else [],
        "recent": clean_elite_report.get("recent") if isinstance(clean_elite_report.get("recent"), list) else [],
        "sourceVersion": clean_elite_report.get("version"),
        "note": "Clean Elite performance is separated from raw candidates and old premium_signal. This is the future product-performance KPI layer.",
    }

    setup_cards = _s814d_setup_cards(setup_rows)

    payload = {
        "ok": True,
        "version": S814D_INVESTOR_DASHBOARD_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "headline": "SkillEdge AI Investor Evidence Dashboard",
        "productMode": "ai_trading_desk_forward_evidence",
        "automation": {
            "postClosePipelineOk": automation_ok,
            "postCloseGeneratedAt": post_close_report.get("generatedAt"),
            "setupLearningGeneratedAt": setup_report.get("generatedAt"),
            "investorEvidenceGeneratedAt": evidence_report.get("generatedAt"),
            "reports": {
                "postClose": post_close_report.get("reportFile"),
                "setupLearning": setup_report.get("reportFile"),
                "investorEvidence": evidence_report.get("reportFile"),
            },
        },
        "headlineMetrics": {
            "rawClosedOutcomes": setup_summary.get("closed"),
            "rawWinRateClosed": setup_summary.get("winRateClosed"),
            "rawAvgResultRClosed": setup_summary.get("avgResultRClosed"),
            "rawWorked": setup_summary.get("worked"),
            "rawFailed": setup_summary.get("failed"),
            "investorEvidenceClosed": investor_summary.get("globalClosedOutcomes"),
            "investorEvidenceWinRate": investor_summary.get("globalWinRateClosed"),
            "investorEvidenceAvgR": investor_summary.get("globalAvgResultRClosed"),
            "selectedBestCount": investor_summary.get("selectedBestCount"),
            "selectedSymbols": investor_summary.get("selectedSymbols"),
            "setupCount": setup_summary.get("setupCount"),
            "cleanEliteLedgerCount": clean_elite_snapshot.get("ledgerCount"),
            "cleanEliteClosedTrades": clean_elite_snapshot.get("closedTrades"),
            "cleanEliteWinRateClosed": clean_elite_snapshot.get("winRateClosed"),
            "cleanEliteAvgResultRClosed": clean_elite_snapshot.get("avgResultRClosed"),
            "cleanEliteFinalEquity": clean_elite_snapshot.get("finalEquity"),
            "cleanEliteMaxDrawdownPct": clean_elite_snapshot.get("maxDrawdownPct"),
            "cleanEliteTestCount": clean_elite_snapshot.get("testLedgerCount"),
            "testToReadyPromotionCandidateCount": clean_elite_promotion.get("promotionCandidateCount"),
        },
        "equitySimulation": {
            "startingCapital": 50000,
            "riskDisclosure": "Simulation uses stored outcomes and fixed fractional risk. It is not a live audited track record.",
            "allClosedOutcomes": all_sim,
            "premiumClosedOutcomes": premium_sim,
            "telegramEligibleClosedOutcomes": telegram_sim,
            "cleanEliteLayer": clean_elite_snapshot,
        },
        "cleanElitePerformance": clean_elite_snapshot,
        "setupLearning": {
            "promoteForEliteTest": setup_summary.get("promoteForEliteTest"),
            "keepAndTighten": setup_summary.get("keepAndTighten"),
            "demoteToMonitorOnly": setup_summary.get("demoteToMonitorOnly"),
            "testToReadyPromotion": clean_elite_promotion,
            "topGlobalFailurePatterns": setup_summary.get("topGlobalFailurePatterns"),
            "cards": setup_cards,
        },
        "aiLearningLog": setup_report.get("aiLearningLog") if isinstance(setup_report.get("aiLearningLog"), list) else [],
        "marketingReadiness": _s814d_marketing_readiness(
            automation_ok=automation_ok,
            setup_summary=setup_summary,
            all_sim=all_sim,
            elite_snapshot=clean_elite_snapshot,
        ),
        "investorNarrative": {
            "currentTruth": "The raw/premium historical candidate layer is not investor-grade yet. It is being used to train the selector.",
            "whatImproved": "S8.14A/C blocks weak setups from best/elite selection, and S8.15A/B now tracks Clean Elite performance in a separate ledger.",
            "whyNoAggressiveMarketingYet": "Marketing should wait until the clean Elite layer has 50-100+ closed outcomes with stable win rate, positive expectancy, and controlled drawdown.",
            "nextEngineeringStep": "Accumulate Clean Elite outcomes, then use only Clean Elite metrics for product-performance claims and launch readiness.",
        },
    }

    return _s817a_upgrade_investor_dashboard_payload(payload)


@app.get("/engine/investor-dashboard/snapshot")
def engine_investor_dashboard_snapshot(publish: bool = False):
    payload = _s814d_build_investor_dashboard_snapshot()
    if publish:
        runtime_cache.set_json(S814D_INVESTOR_DASHBOARD_CACHE_KEY, payload, ttl_seconds=24 * 60 * 60)
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S814D_INVESTOR_DASHBOARD_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/investor-dashboard/run")
def engine_investor_dashboard_run(publish: bool = True):
    payload = _s814d_build_investor_dashboard_snapshot()
    if publish:
        runtime_cache.set_json(S814D_INVESTOR_DASHBOARD_CACHE_KEY, payload, ttl_seconds=24 * 60 * 60)
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S814D_INVESTOR_DASHBOARD_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/investor-dashboard/cache")
def engine_investor_dashboard_cache():
    payload = runtime_cache.get_json(S814D_INVESTOR_DASHBOARD_CACHE_KEY)
    return {
        "ok": isinstance(payload, dict),
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S814D_INVESTOR_DASHBOARD_VERSION,
        "cache": runtime_cache.get_status(),
    }

# === /S8.14D ================================================================


# === S8.15A Clean Elite Ledger Foundation ====================================
S815A_CLEAN_ELITE_VERSION = "s8_15a_clean_elite_ledger_v1"
S815A_CLEAN_ELITE_CACHE_KEY = "engine:clean_elite:stats"
S815A_FORWARD_CACHE_KEY = "engine:forward_report:today"


def _s815a_now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _s815a_num(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        out = float(value)
        if out != out:
            return default
        return out
    except Exception:
        return default


def _s815a_json(value: Any) -> str:
    import json
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except Exception:
        return "{}"


def _s815a_db_path():
    from pathlib import Path
    return Path("data/stock_engine.db")


def _s815a_ensure_tables(con) -> None:
    con.execute(
        """
        create table if not exists clean_elite_signals (
            clean_elite_id text primary key,
            signal_id text,
            symbol text not null,
            setup_slug text not null,
            session_date text,
            direction text,
            selected_at text,
            trigger_time text,
            entry real,
            stop real,
            tp1 real,
            tp2 real,
            rr_to_tp1 real,
            score real,
            selector_score real,
            signal_grade text,
            quality_status text,
            source_version text,
            s814a_gate_json text,
            s814c_gate_json text,
            entry_health_json text,
            payload_json text not null,
            created_at text,
            updated_at text
        )
        """
    )
    existing_cols = {
        str(row[1])
        for row in con.execute("pragma table_info(clean_elite_signals)").fetchall()
    }

    missing_cols = {
        "elite_layer": "text",
        "s816a_gate_json": "text",
    }

    for col_name, col_type in missing_cols.items():
        if col_name not in existing_cols:
            con.execute(f"alter table clean_elite_signals add column {col_name} {col_type}")

    con.execute(
        """
        update clean_elite_signals
        set elite_layer = 'CLEAN_ELITE_TEST'
        where (elite_layer is null or trim(elite_layer) = '')
          and clean_elite_id like 'CLEAN_ELITE_TEST:%'
        """
    )
    con.execute(
        """
        update clean_elite_signals
        set elite_layer = 'CLEAN_ELITE_READY'
        where (elite_layer is null or trim(elite_layer) = '')
          and clean_elite_id like 'CLEAN_ELITE_READY:%'
        """
    )
    con.execute(
        """
        update clean_elite_signals
        set elite_layer = 'CLEAN_ELITE_TEST'
        where (elite_layer is null or trim(elite_layer) = '')
          and payload_json like '%CLEAN_ELITE_TEST%'
        """
    )
    con.execute(
        """
        update clean_elite_signals
        set elite_layer = 'CLEAN_ELITE_READY'
        where elite_layer is null or trim(elite_layer) = ''
        """
    )
    con.execute("create index if not exists idx_clean_elite_session on clean_elite_signals(session_date)")
    con.execute("create index if not exists idx_clean_elite_signal_id on clean_elite_signals(signal_id)")
    con.execute("create index if not exists idx_clean_elite_setup on clean_elite_signals(setup_slug)")
    con.execute("create index if not exists idx_clean_elite_symbol on clean_elite_signals(symbol)")

    # S8.16C: persist clean elite schema migrations and legacy elite_layer backfill.
    con.commit()


def _s815a_unwrap_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("value"), dict):
        payload = payload.get("value") or {}
    if isinstance(payload.get("value"), dict):
        payload = payload.get("value") or {}
    return payload if isinstance(payload, dict) else {}


def _s815a_load_forward_payload() -> dict[str, Any]:
    payload = {}
    try:
        cached = runtime_cache.get_json(S815A_FORWARD_CACHE_KEY)
        payload = _s815a_unwrap_payload(cached)
    except Exception:
        payload = {}

    if isinstance(payload.get("selectedBestIdeas"), list):
        return payload

    # fallback to latest report file if cache was missed
    try:
        import json
        from pathlib import Path
        for path in [
            Path("reports/forward_report/latest.json"),
            Path("reports/post_close_evidence/latest.json"),
        ]:
            if not path.exists():
                continue
            raw = json.loads(path.read_text(encoding="utf-8"))
            raw = _s815a_unwrap_payload(raw)
            if isinstance(raw.get("selectedBestIdeas"), list):
                return raw
            summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
            evidence = summary.get("evidence") if isinstance(summary.get("evidence"), dict) else {}
            if isinstance(evidence.get("selectedBestIdeas"), list):
                return evidence
    except Exception:
        pass

    return payload if isinstance(payload, dict) else {}


def _s815a_target_price(row: dict[str, Any], index: int) -> float | None:
    key = "tp1" if index == 0 else "tp2"
    direct = _s815a_num(row.get(key), None)
    if direct is not None:
        return direct

    targets = row.get("targets")
    if isinstance(targets, list) and len(targets) > index and isinstance(targets[index], dict):
        return _s815a_num(targets[index].get("price"), None)

    return None


def _s815a_session_date(row: dict[str, Any]) -> str:
    from datetime import datetime, timezone
    explicit = str(row.get("sessionDate") or row.get("session_date") or "").strip()
    if explicit:
        return explicit[:10]

    trigger = str(row.get("triggerTime") or row.get("trigger_time") or row.get("createdAt") or "").strip()
    if len(trigger) >= 10:
        return trigger[:10]

    return datetime.now(timezone.utc).date().isoformat()



def _s816d_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _s816d_clean_elite_supabase_row(row: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = dict(payload) if isinstance(payload, dict) else {}
    elite_layer = str(row.get("elite_layer") or row.get("eliteLayer") or payload.get("eliteLayer") or "CLEAN_ELITE_READY").strip() or "CLEAN_ELITE_READY"

    client_visible = _s816d_bool(payload.get("clientVisible"), fallback=(elite_layer == "CLEAN_ELITE_READY"))
    marketing_allowed = _s816d_bool(payload.get("marketingClaimAllowed"), fallback=(elite_layer == "CLEAN_ELITE_READY"))

    if elite_layer == "CLEAN_ELITE_TEST":
        client_visible = False
        marketing_allowed = False

    return {
        "clean_elite_id": row.get("clean_elite_id") or row.get("cleanEliteId"),
        "signal_id": row.get("signal_id") or row.get("signalId"),
        "symbol": str(row.get("symbol") or payload.get("symbol") or "").upper().strip(),
        "setup_slug": row.get("setup_slug") or row.get("setupSlug") or payload.get("setupSlug"),
        "session_date": row.get("session_date") or row.get("sessionDate") or payload.get("sessionDate"),
        "direction": row.get("direction") or payload.get("direction"),
        "elite_layer": elite_layer,
        "selected_at": row.get("selected_at") or row.get("selectedAt"),
        "trigger_time": row.get("trigger_time") or row.get("triggerTime") or payload.get("triggerTime") or payload.get("createdAt"),
        "entry": _s815a_num(row.get("entry"), _s815a_num(payload.get("entry"), None)),
        "stop": _s815a_num(row.get("stop"), _s815a_num(payload.get("stop"), None)),
        "tp1": _s815a_num(row.get("tp1"), _s815a_target_price(payload, 0)),
        "tp2": _s815a_num(row.get("tp2"), _s815a_target_price(payload, 1)),
        "rr_to_tp1": _s815a_num(row.get("rr_to_tp1"), _s815a_num(payload.get("rrToTp1"), None)),
        "score": _s815a_num(row.get("score"), _s815a_num(payload.get("score") or payload.get("signalScore"), None)),
        "selector_score": _s815a_num(row.get("selector_score"), _s815a_num(payload.get("selectorScore"), None)),
        "signal_grade": row.get("signal_grade") or payload.get("signalGrade") or payload.get("grade"),
        "quality_status": row.get("quality_status") or payload.get("qualityStatus"),
        "source_version": row.get("source_version") or payload.get("sourceVersion"),
        "client_visible": client_visible,
        "marketing_claim_allowed": marketing_allowed,
        "created_at": row.get("created_at") or row.get("createdAt") or _s815a_now_iso(),
        "updated_at": row.get("updated_at") or row.get("updatedAt") or _s815a_now_iso(),
        "payload": payload,
    }


def _s816d_upsert_clean_elite_supabase(row: dict[str, Any]) -> dict[str, Any]:
    try:
        from app.storage import SupabaseRestStore
    except Exception:
        from storage import SupabaseRestStore  # type: ignore

    store = SupabaseRestStore()

    if not store.enabled:
        return {
            "ok": False,
            "enabled": False,
            "skipped": True,
            "lastError": store.last_error,
            "table": "engine_clean_elite_signals",
        }

    clean_elite_id = str(row.get("clean_elite_id") or "").strip()
    if not clean_elite_id:
        return {
            "ok": False,
            "enabled": store.enabled,
            "skipped": True,
            "lastError": "missing_clean_elite_id",
            "table": "engine_clean_elite_signals",
        }

    store.safe_request(
        "POST",
        "engine_clean_elite_signals",
        params={"on_conflict": "clean_elite_id"},
        body=row,
        prefer="resolution=merge-duplicates,return=minimal",
    )

    return {
        "ok": store.last_error is None,
        "enabled": store.enabled,
        "skipped": False,
        "lastError": store.last_error,
        "table": "engine_clean_elite_signals",
    }


def _s816d_sync_clean_elite_sqlite_to_supabase(
    *,
    session_date: str | None = None,
    elite_layer: str = "ALL",
    limit: int = 1000,
) -> dict[str, Any]:
    import json
    import sqlite3

    safe_limit = max(1, min(int(limit or 1000), 5000))
    date_key = str(session_date or "").strip()[:10] or None
    layer = str(elite_layer or "ALL").strip() or "ALL"

    db_path = _s815a_db_path()
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row

    try:
        _s815a_ensure_tables(con)

        where: list[str] = []
        params: list[Any] = []

        if date_key:
            where.append("session_date = ?")
            params.append(date_key)

        if layer.upper() != "ALL":
            where.append("elite_layer = ?")
            params.append(layer)

        where_sql = ("where " + " and ".join(where)) if where else ""

        rows = [
            dict(row)
            for row in con.execute(
                f"""
                select *
                from clean_elite_signals
                {where_sql}
                order by coalesce(session_date, '') desc, coalesce(selected_at, '') desc
                limit ?
                """,
                (*params, safe_limit),
            ).fetchall()
        ]
    finally:
        con.close()

    synced = 0
    failed = 0
    last_error = None
    samples: list[dict[str, Any]] = []

    for row in rows:
        try:
            payload = json.loads(row.get("payload_json") or "{}")
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        supabase_row = _s816d_clean_elite_supabase_row(row, payload)
        result = _s816d_upsert_clean_elite_supabase(supabase_row)

        if result.get("ok"):
            synced += 1
        else:
            failed += 1
            last_error = result.get("lastError")

        if len(samples) < 8:
            samples.append({
                "cleanEliteId": supabase_row.get("clean_elite_id"),
                "symbol": supabase_row.get("symbol"),
                "setupSlug": supabase_row.get("setup_slug"),
                "sessionDate": supabase_row.get("session_date"),
                "eliteLayer": supabase_row.get("elite_layer"),
                "ok": result.get("ok"),
                "lastError": result.get("lastError"),
            })

    return {
        "ok": failed == 0,
        "version": "s8_16d_clean_elite_supabase_alignment_v1",
        "mode": "sqlite_to_supabase_clean_elite_sync",
        "dbPath": str(db_path),
        "sessionDate": date_key,
        "eliteLayer": layer,
        "rowsFound": len(rows),
        "synced": synced,
        "failed": failed,
        "lastError": last_error,
        "samples": samples,
    }




def _s815a_capture_forward_selected_best(source: str = "manual") -> dict[str, Any]:
    import sqlite3

    forward = _s815a_load_forward_payload()

    ready_selected = forward.get("selectedBestIdeas") if isinstance(forward.get("selectedBestIdeas"), list) else []
    test_selected = forward.get("cleanEliteTestIdeas") if isinstance(forward.get("cleanEliteTestIdeas"), list) else []

    selected: list[dict[str, Any]] = []

    for raw in ready_selected:
        if isinstance(raw, dict):
            item = dict(raw)
            item["eliteLayer"] = item.get("eliteLayer") or "CLEAN_ELITE_READY"
            selected.append(item)

    for raw in test_selected:
        if isinstance(raw, dict):
            item = dict(raw)
            item["eliteLayer"] = item.get("eliteLayer") or "CLEAN_ELITE_TEST"
            item["clientVisible"] = False
            item["marketingClaimAllowed"] = False
            selected.append(item)

    db_path = _s815a_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    now = _s815a_now_iso()
    captured = 0
    skipped = 0
    rows_out: list[dict[str, Any]] = []
    supabase_synced = 0
    supabase_failed = 0
    supabase_last_error = None

    con = sqlite3.connect(str(db_path))
    try:
        _s815a_ensure_tables(con)

        for raw in selected:
            if not isinstance(raw, dict):
                skipped += 1
                continue

            symbol = str(raw.get("symbol") or "").strip().upper()
            setup_slug = str(raw.get("setupSlug") or raw.get("setup_slug") or "").strip()
            if not symbol or not setup_slug:
                skipped += 1
                continue

            signal_id = str(raw.get("signalId") or raw.get("signal_id") or raw.get("storageKey") or "").strip()
            session_date = _s815a_session_date(raw)
            trigger_time = str(raw.get("triggerTime") or raw.get("trigger_time") or raw.get("createdAt") or "").strip()
            elite_layer = str(raw.get("eliteLayer") or "CLEAN_ELITE_READY").strip() or "CLEAN_ELITE_READY"
            clean_elite_id = f"{elite_layer}:{session_date}:{signal_id or symbol + ':' + setup_slug + ':' + trigger_time}"

            s814a_gate = raw.get("s814aEliteGate") if isinstance(raw.get("s814aEliteGate"), dict) else {}
            s814c_gate = raw.get("s814cLearningGate") if isinstance(raw.get("s814cLearningGate"), dict) else {}
            entry_health = raw.get("entryHealth") if isinstance(raw.get("entryHealth"), dict) else {}
            s816a_gate = raw.get("s816aEliteTestGate") if isinstance(raw.get("s816aEliteTestGate"), dict) else {}

            con.execute(
                """
                insert into clean_elite_signals (
                    clean_elite_id,
                    signal_id,
                    symbol,
                    setup_slug,
                    session_date,
                    direction,
                    selected_at,
                    trigger_time,
                    entry,
                    stop,
                    tp1,
                    tp2,
                    rr_to_tp1,
                    score,
                    selector_score,
                    signal_grade,
                    quality_status,
                    source_version,
                    elite_layer,
                    s814a_gate_json,
                    s814c_gate_json,
                    s816a_gate_json,
                    entry_health_json,
                    payload_json,
                    created_at,
                    updated_at
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(clean_elite_id) do update set
                    selected_at=excluded.selected_at,
                    entry=excluded.entry,
                    stop=excluded.stop,
                    tp1=excluded.tp1,
                    tp2=excluded.tp2,
                    rr_to_tp1=excluded.rr_to_tp1,
                    score=excluded.score,
                    selector_score=excluded.selector_score,
                    signal_grade=excluded.signal_grade,
                    quality_status=excluded.quality_status,
                    source_version=excluded.source_version,
                    elite_layer=excluded.elite_layer,
                    s814a_gate_json=excluded.s814a_gate_json,
                    s814c_gate_json=excluded.s814c_gate_json,
                    s816a_gate_json=excluded.s816a_gate_json,
                    entry_health_json=excluded.entry_health_json,
                    payload_json=excluded.payload_json,
                    updated_at=excluded.updated_at
                """,
                (
                    clean_elite_id,
                    signal_id or None,
                    symbol,
                    setup_slug,
                    session_date,
                    str(raw.get("direction") or "").strip() or None,
                    now,
                    trigger_time or None,
                    _s815a_num(raw.get("entry"), None),
                    _s815a_num(raw.get("stop"), None),
                    _s815a_target_price(raw, 0),
                    _s815a_target_price(raw, 1),
                    _s815a_num(raw.get("rrToTp1"), None),
                    _s815a_num(raw.get("score") or raw.get("signalScore"), None),
                    _s815a_num(raw.get("selectorScore"), None),
                    str(raw.get("signalGrade") or raw.get("grade") or "").strip() or None,
                    str(raw.get("qualityStatus") or "").strip() or None,
                    str(forward.get("version") or "").strip() or None,
                    elite_layer,
                    _s815a_json(s814a_gate),
                    _s815a_json(s814c_gate),
                    _s815a_json(s816a_gate),
                    _s815a_json(entry_health),
                    _s815a_json(raw),
                    now,
                    now,
                ),
            )

            supabase_row = _s816d_clean_elite_supabase_row(
                {
                    "clean_elite_id": clean_elite_id,
                    "signal_id": signal_id or None,
                    "symbol": symbol,
                    "setup_slug": setup_slug,
                    "session_date": session_date,
                    "direction": str(raw.get("direction") or "").strip() or None,
                    "selected_at": now,
                    "trigger_time": trigger_time or None,
                    "entry": _s815a_num(raw.get("entry"), None),
                    "stop": _s815a_num(raw.get("stop"), None),
                    "tp1": _s815a_target_price(raw, 0),
                    "tp2": _s815a_target_price(raw, 1),
                    "rr_to_tp1": _s815a_num(raw.get("rrToTp1"), None),
                    "score": _s815a_num(raw.get("score") or raw.get("signalScore"), None),
                    "selector_score": _s815a_num(raw.get("selectorScore"), None),
                    "signal_grade": str(raw.get("signalGrade") or raw.get("grade") or "").strip() or None,
                    "quality_status": str(raw.get("qualityStatus") or "").strip() or None,
                    "source_version": str(forward.get("version") or "").strip() or None,
                    "elite_layer": elite_layer,
                    "created_at": now,
                    "updated_at": now,
                },
                raw,
            )
            supabase_result = _s816d_upsert_clean_elite_supabase(supabase_row)
            if supabase_result.get("ok"):
                supabase_synced += 1
            else:
                supabase_failed += 1
                supabase_last_error = supabase_result.get("lastError")

            captured += 1
            rows_out.append({
                "cleanEliteId": clean_elite_id,
                "signalId": signal_id or None,
                "symbol": symbol,
                "setupSlug": setup_slug,
                "sessionDate": session_date,
                "rrToTp1": _s815a_num(raw.get("rrToTp1"), None),
                "score": _s815a_num(raw.get("score") or raw.get("signalScore"), None),
                "selectorScore": _s815a_num(raw.get("selectorScore"), None),
                "eliteLayer": elite_layer,
                "s814aPassed": s814a_gate.get("passed") if isinstance(s814a_gate, dict) else None,
                "s814cPassed": s814c_gate.get("passed") if isinstance(s814c_gate, dict) else None,
                "s816aTestPassed": (raw.get("s816aEliteTestGate") or {}).get("passed") if isinstance(raw.get("s816aEliteTestGate"), dict) else None,
            })

        con.commit()
    finally:
        con.close()

    return {
        "ok": True,
        "version": S815A_CLEAN_ELITE_VERSION,
        "mode": "capture_forward_selected_best",
        "source": source,
        "generatedAt": now,
        "forwardVersion": forward.get("version"),
        "forwardState": (forward.get("dailyDeskState") or {}).get("state") if isinstance(forward.get("dailyDeskState"), dict) else None,
        "selectedBestCount": len(ready_selected),
        "cleanEliteTestCount": len(test_selected),
        "captureCandidateCount": len(selected),
        "captured": captured,
        "skipped": skipped,
        "rows": rows_out[:25],
        "supabase": {
            "table": "engine_clean_elite_signals",
            "synced": supabase_synced,
            "failed": supabase_failed,
            "lastError": supabase_last_error,
        },
        "note": "Only selectedBestIdeas that passed current elite selector are stored. Raw premium_signal is intentionally ignored.",
    }


def _s815a_match_outcome(con, signal_id: str | None, symbol: str, setup_slug: str, session_date: str) -> dict[str, Any] | None:
    con.row_factory = None
    row = None

    if signal_id:
        row = con.execute(
            """
            select *
            from outcome_records
            where signal_id = ?
            order by coalesce(evaluated_at, stored_at, trigger_time, '') desc
            limit 1
            """,
            (signal_id,),
        ).fetchone()

    if row is None:
        row = con.execute(
            """
            select *
            from outcome_records
            where symbol = ? and setup_slug = ? and session_date = ?
            order by coalesce(evaluated_at, stored_at, trigger_time, '') desc
            limit 1
            """,
            (symbol, setup_slug, session_date),
        ).fetchone()

    if row is None:
        return None

    columns = [col[0] for col in con.execute("pragma table_info(outcome_records)").fetchall()]
    return dict(zip(columns, row))


def _s815a_avg(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 4)


def _s815a_pct(part: int, total: int) -> float | None:
    if total <= 0:
        return None
    return round(part / total * 100, 2)



def _s816b_evaluate_test_to_ready_promotion(test_rows: list[dict[str, Any]]) -> dict[str, Any]:
    from collections import defaultdict

    by_setup: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for row in test_rows or []:
        setup = str(row.get("setupSlug") or "unknown").strip() or "unknown"
        by_setup[setup].append(row)

    rows: list[dict[str, Any]] = []

    for setup, items in sorted(by_setup.items()):
        closed = [r for r in items if r.get("outcomeStatus") in {"WORKED", "FAILED"}]
        worked = [r for r in closed if r.get("outcomeStatus") == "WORKED" or (_s815a_num(r.get("resultR"), 0) or 0) > 0]
        failed = [r for r in closed if r.get("outcomeStatus") == "FAILED" or (_s815a_num(r.get("resultR"), 0) or 0) < 0]

        win_rate = _s815a_pct(len(worked), len(closed))
        avg_r = _s815a_avg([_s815a_num(r.get("resultR"), 0) or 0 for r in closed])

        status = "COLLECT_MORE_TEST_SAMPLE"
        action = "KEEP_IN_CLEAN_ELITE_TEST"
        reasons = []

        if len(closed) < 10:
            reasons.append("needs_min_10_closed_test_outcomes")
        elif win_rate is not None and avg_r is not None and win_rate >= 65 and avg_r >= 0.35:
            status = "PROMOTION_CANDIDATE_TO_READY_REVIEW"
            action = "REVIEW_FOR_READY_GATE_RELAXATION"
            reasons.append("test_stats_meet_initial_promotion_threshold")
        elif (win_rate is not None and win_rate < 45) or (avg_r is not None and avg_r < 0):
            status = "KEEP_TEST_DEMOTE_OR_TIGHTEN"
            action = "TIGHTEN_SETUP_OR_KEEP_OUT_OF_READY"
            reasons.append("test_stats_do_not_support_ready_promotion")
        else:
            reasons.append("sample_exists_but_not_strong_enough_yet")

        rows.append({
            "setupSlug": setup,
            "testCount": len(items),
            "closed": len(closed),
            "worked": len(worked),
            "failed": len(failed),
            "winRateClosed": win_rate,
            "avgResultRClosed": avg_r,
            "status": status,
            "recommendedAction": action,
            "reasons": reasons,
        })

    promotion_candidates = [
        r for r in rows
        if r.get("status") == "PROMOTION_CANDIDATE_TO_READY_REVIEW"
    ]

    return {
        "version": S816B_PROMOTION_VERSION,
        "mode": "READ_ONLY_NO_GATE_CHANGE",
        "promotionCandidateCount": len(promotion_candidates),
        "promotionCandidates": promotion_candidates,
        "setupRows": rows,
        "note": "S8.16B is read-only: it never changes READY gates automatically.",
    }





def _s816fc_normalize_outcome_row(record: Any) -> dict[str, Any] | None:
    if not record:
        return None

    import json

    row = dict(record)
    payload = {}
    try:
        payload = json.loads(row.get("payload_json") or "{}")
    except Exception:
        payload = {}

    if not isinstance(payload, dict):
        payload = {}

    return {
        "status": payload.get("status") or row.get("status"),
        "result_r": payload.get("resultR") if payload.get("resultR") is not None else row.get("result_r"),
        "mfe_r": payload.get("mfeR") if payload.get("mfeR") is not None else row.get("mfe_r"),
        "mae_r": payload.get("maeR") if payload.get("maeR") is not None else row.get("mae_r"),
        "reason": payload.get("reason") or row.get("reason"),
        "signal_id": payload.get("signalId") or row.get("signal_id"),
        "cleanEliteId": payload.get("cleanEliteId"),
        "eliteLayer": payload.get("eliteLayer"),
        "source": payload.get("source"),
    }


def _s816fc_match_clean_elite_outcome(con: Any, row: dict[str, Any]) -> dict[str, Any] | None:
    clean_elite_id = str(row.get("clean_elite_id") or "").strip()
    signal_id = str(row.get("signal_id") or clean_elite_id or "").strip()

    # 1) Strict Clean Elite outcome first. This avoids matching old OPEN rows.
    if clean_elite_id:
        try:
            found = con.execute(
                """
                select *
                from outcome_records
                where payload_json like ?
                  and payload_json like '%clean_elite_ledger%'
                order by rowid desc
                limit 1
                """,
                (f"%{clean_elite_id}%",),
            ).fetchone()
            normalized = _s816fc_normalize_outcome_row(found)
            if normalized:
                return normalized
        except Exception:
            pass

    # 2) Direct signal_id fallback.
    for candidate_id in [signal_id, clean_elite_id]:
        if not candidate_id:
            continue
        try:
            found = con.execute(
                """
                select *
                from outcome_records
                where signal_id = ?
                order by rowid desc
                limit 1
                """,
                (candidate_id,),
            ).fetchone()
            normalized = _s816fc_normalize_outcome_row(found)
            if normalized:
                return normalized
        except Exception:
            pass

    # 3) Legacy broad matcher last.
    for candidate_id in [signal_id, clean_elite_id]:
        if not candidate_id:
            continue
        try:
            matched = _s815a_match_outcome(
                con,
                candidate_id,
                str(row.get("symbol") or ""),
                str(row.get("setup_slug") or ""),
                str(row.get("session_date") or ""),
            )
            if matched:
                return matched
        except Exception:
            pass

    return None

def _s815a_clean_elite_stats(
    initial_capital: float = 50000,
    risk_pct: float = 0.01,
    publish: bool = False,
) -> dict[str, Any]:
    import sqlite3
    import json

    db_path = _s815a_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        _s815a_ensure_tables(con)

        rows = [dict(r) for r in con.execute(
            """
            select *
            from clean_elite_signals
            order by coalesce(session_date, ''), coalesce(trigger_time, selected_at, '')
            """
        ).fetchall()]

        enriched: list[dict[str, Any]] = []
        for row in rows:
            outcome = _s816fc_match_clean_elite_outcome(con, row)
            status = str((outcome or {}).get("status") or "OPEN").upper()
            result_r = _s815a_num((outcome or {}).get("result_r"), None)
            mfe_r = _s815a_num((outcome or {}).get("mfe_r"), None)
            mae_r = _s815a_num((outcome or {}).get("mae_r"), None)

            payload = {}
            try:
                payload = json.loads(row.get("payload_json") or "{}")
            except Exception:
                payload = {}

            enriched.append({
                "cleanEliteId": row.get("clean_elite_id"),
                "signalId": row.get("signal_id"),
                "symbol": row.get("symbol"),
                "setupSlug": row.get("setup_slug"),
                "sessionDate": row.get("session_date"),
                "triggerTime": row.get("trigger_time"),
                "direction": row.get("direction"),
                "rrToTp1": row.get("rr_to_tp1"),
                "score": row.get("score"),
                "selectorScore": row.get("selector_score"),
                "signalGrade": row.get("signal_grade"),
                "qualityStatus": row.get("quality_status"),
                "outcomeStatus": status,
                "resultR": result_r,
                "mfeR": mfe_r,
                "maeR": mae_r,
                "outcomeMatched": outcome is not None,
                "s814aEliteGate": json.loads(row.get("s814a_gate_json") or "{}"),
                "s814cLearningGate": json.loads(row.get("s814c_gate_json") or "{}"),
                "entryHealth": json.loads(row.get("entry_health_json") or "{}"),
                "eliteLayer": str(payload.get("eliteLayer") or "CLEAN_ELITE_READY"),
                "sourceVersion": row.get("source_version"),
                "raw": payload,
            })

        ready_enriched = [r for r in enriched if str(r.get("eliteLayer") or "CLEAN_ELITE_READY") == "CLEAN_ELITE_READY"]
        test_enriched = [r for r in enriched if str(r.get("eliteLayer") or "") == "CLEAN_ELITE_TEST"]

        closed = [r for r in ready_enriched if r.get("outcomeStatus") in {"WORKED", "FAILED"}]
        worked = [r for r in closed if r.get("outcomeStatus") == "WORKED" or (_s815a_num(r.get("resultR"), 0) or 0) > 0]
        failed = [r for r in closed if r.get("outcomeStatus") == "FAILED" or (_s815a_num(r.get("resultR"), 0) or 0) < 0]
        open_rows = [r for r in ready_enriched if r.get("outcomeStatus") not in {"WORKED", "FAILED"}]

        test_closed = [r for r in test_enriched if r.get("outcomeStatus") in {"WORKED", "FAILED"}]
        test_worked = [r for r in test_closed if r.get("outcomeStatus") == "WORKED" or (_s815a_num(r.get("resultR"), 0) or 0) > 0]
        test_failed = [r for r in test_closed if r.get("outcomeStatus") == "FAILED" or (_s815a_num(r.get("resultR"), 0) or 0) < 0]

        promotion_report = _s816b_evaluate_test_to_ready_promotion(test_enriched)

        equity = float(initial_capital)
        peak = equity
        max_dd = 0.0
        curve = [{
            "trade": 0,
            "sessionDate": None,
            "symbol": "START",
            "setupSlug": None,
            "resultR": 0,
            "equity": round(equity, 2),
            "drawdownPct": 0,
        }]

        for index, row in enumerate(closed, start=1):
            result_r = float(_s815a_num(row.get("resultR"), 0) or 0)
            pnl = equity * float(risk_pct) * result_r
            equity += pnl
            peak = max(peak, equity)
            dd = ((equity - peak) / peak * 100) if peak else 0
            max_dd = min(max_dd, dd)
            curve.append({
                "trade": index,
                "sessionDate": row.get("sessionDate"),
                "symbol": row.get("symbol"),
                "setupSlug": row.get("setupSlug"),
                "resultR": round(result_r, 4),
                "pnl": round(pnl, 2),
                "equity": round(equity, 2),
                "drawdownPct": round(dd, 2),
            })

        by_setup: dict[str, list[dict[str, Any]]] = {}
        for row in ready_enriched:
            by_setup.setdefault(str(row.get("setupSlug") or "unknown"), []).append(row)

        setup_stats = []
        for setup, items in sorted(by_setup.items()):
            c = [r for r in items if r.get("outcomeStatus") in {"WORKED", "FAILED"}]
            w = [r for r in c if r.get("outcomeStatus") == "WORKED" or (_s815a_num(r.get("resultR"), 0) or 0) > 0]
            f = [r for r in c if r.get("outcomeStatus") == "FAILED" or (_s815a_num(r.get("resultR"), 0) or 0) < 0]
            setup_stats.append({
                "setupSlug": setup,
                "count": len(items),
                "closed": len(c),
                "worked": len(w),
                "failed": len(f),
                "open": len(items) - len(c),
                "winRateClosed": _s815a_pct(len(w), len(c)),
                "avgResultRClosed": _s815a_avg([_s815a_num(r.get("resultR"), 0) or 0 for r in c]),
                "avgMfeR": _s815a_avg([_s815a_num(r.get("mfeR"), 0) or 0 for r in items]),
                "avgMaeR": _s815a_avg([_s815a_num(r.get("maeR"), 0) or 0 for r in items]),
            })

        payload = {
            "ok": True,
            "version": S815A_CLEAN_ELITE_VERSION,
            "mode": "clean_elite_stats",
            "generatedAt": _s815a_now_iso(),
            "parameters": {
                "initialCapital": initial_capital,
                "riskPct": risk_pct,
                "riskPctLabel": f"{round(risk_pct * 100, 3)}%",
            },
            "summary": {
                "ledgerCount": len(enriched),
                "readyLedgerCount": len(ready_enriched),
                "testLedgerCount": len(test_enriched),
                "closed": len(closed),
                "open": len(open_rows),
                "worked": len(worked),
                "failed": len(failed),
                "winRateClosed": _s815a_pct(len(worked), len(closed)),
                "avgResultRClosed": _s815a_avg([_s815a_num(r.get("resultR"), 0) or 0 for r in closed]),
                "finalEquity": round(equity, 2),
                "totalReturnPct": round((equity - float(initial_capital)) / float(initial_capital) * 100, 2) if initial_capital else None,
                "maxDrawdownPct": round(max_dd, 2),
            },
            "equityCurve": curve[-250:],
            "setupStats": setup_stats,
            "eliteTestSummary": {
                "count": len(test_enriched),
                "closed": len(test_closed),
                "worked": len(test_worked),
                "failed": len(test_failed),
                "open": len(test_enriched) - len(test_closed),
                "winRateClosed": _s815a_pct(len(test_worked), len(test_closed)),
                "avgResultRClosed": _s815a_avg([_s815a_num(r.get("resultR"), 0) or 0 for r in test_closed]),
                "note": "CLEAN_ELITE_TEST is learning-only and excluded from investor/client READY performance.",
            },
            "testToReadyPromotion": promotion_report,
            "recent": enriched[-25:],
            "note": "Clean Elite Ledger is separated from raw signal_records and old premium_signal. This is the only layer intended for future product performance claims.",
        }

        if publish:
            runtime_cache.set_json(S815A_CLEAN_ELITE_CACHE_KEY, payload, ttl_seconds=7 * 24 * 60 * 60)

        return payload
    finally:
        con.close()




def _s816f_first_text(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _s816f_num(*values: Any) -> float | None:
    for value in values:
        parsed = _s815a_num(value, None)
        if parsed is not None:
            return parsed
    return None


def _s816f_target_price(payload: dict[str, Any], index: int) -> float | None:
    if not isinstance(payload, dict):
        return None

    if index == 0:
        direct = _s816f_num(payload.get("tp1"), payload.get("target1"), payload.get("targetPrice1"))
        if direct is not None:
            return direct

    if index == 1:
        direct = _s816f_num(payload.get("tp2"), payload.get("target2"), payload.get("targetPrice2"))
        if direct is not None:
            return direct

    targets = payload.get("targets")
    if isinstance(targets, list) and len(targets) > index:
        item = targets[index]
        if isinstance(item, dict):
            return _s816f_num(item.get("price"), item.get("target"), item.get("value"))
        return _s816f_num(item)

    return None


def _s816f_normalize_clean_elite_payload(row: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    payload = dict(payload) if isinstance(payload, dict) else {}
    metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {}

    clean_elite_id = _s816f_first_text(row.get("clean_elite_id"), payload.get("cleanEliteId"))
    symbol = _s816f_first_text(row.get("symbol"), payload.get("symbol"))
    setup_slug = _s816f_first_text(row.get("setup_slug"), payload.get("setupSlug"))
    session_date = _s816f_first_text(row.get("session_date"), payload.get("sessionDate"))
    elite_layer = _s816f_first_text(row.get("elite_layer"), payload.get("eliteLayer"), "CLEAN_ELITE_READY")

    trigger_time = _s816f_first_text(
        row.get("trigger_time"),
        payload.get("triggerTime"),
        payload.get("signalTimeForSessionGuard"),
        metrics.get("signalTimeForSessionGuard"),
        payload.get("createdAt"),
        row.get("selected_at"),
    )

    entry = _s816f_num(row.get("entry"), payload.get("entry"), payload.get("entryPrice"), payload.get("currentPrice"))
    stop = _s816f_num(row.get("stop"), payload.get("stop"), payload.get("stopLoss"), payload.get("invalidationPrice"))
    tp1 = _s816f_num(row.get("tp1"), _s816f_target_price(payload, 0))
    tp2 = _s816f_num(row.get("tp2"), _s816f_target_price(payload, 1))

    targets: list[dict[str, Any]] = []
    if tp1 is not None:
        targets.append({"r": 1, "price": tp1})
    if tp2 is not None:
        targets.append({"r": 2, "price": tp2})

    if targets:
        payload["targets"] = targets

    payload.update({
        "id": clean_elite_id,
        "signalId": clean_elite_id,
        "cleanEliteId": clean_elite_id,
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setup_slug": setup_slug,
        "sessionDate": session_date,
        "session_date": session_date,
        "eliteLayer": elite_layer,
        "triggerTime": trigger_time,
        "trigger_time": trigger_time,
        "createdAt": trigger_time,
        "entry": entry,
        "entryPrice": entry,
        "stop": stop,
        "stopLoss": stop,
        "tp1": tp1,
        "target1": tp1,
        "tp2": tp2,
        "target2": tp2,
        "direction": _s816f_first_text(row.get("direction"), payload.get("direction")),
        "signalScore": _s816f_num(row.get("score"), payload.get("score"), payload.get("signalScore")),
        "score": _s816f_num(row.get("score"), payload.get("score"), payload.get("signalScore")),
        "signalGrade": _s816f_first_text(row.get("signal_grade"), payload.get("signalGrade"), payload.get("grade")),
        "qualityStatus": _s816f_first_text(row.get("quality_status"), payload.get("qualityStatus"), "PASSED"),
        "premiumSignal": False,
        "telegramEligible": False,
        "clientVisible": False,
        "marketingClaimAllowed": False,
        "source": "clean_elite_ledger",
    })

    # Keep TEST layer impossible to leak into client/investor READY claims.
    if str(elite_layer or "").upper() == "CLEAN_ELITE_TEST":
        payload["premiumSignal"] = False
        payload["telegramEligible"] = False
        payload["clientVisible"] = False
        payload["marketingClaimAllowed"] = False

    return payload


def _s816c_clean_elite_signal_map(
    *,
    session_date: str | None = None,
    elite_layer: str = "CLEAN_ELITE_TEST",
    limit: int = 200,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    import json
    import sqlite3

    def first_text(*values: Any) -> str | None:
        for value in values:
            if value is None:
                continue
            value = str(value).strip()
            if value:
                return value
        return None

    def num(*values: Any) -> float | None:
        for value in values:
            parsed = _s815a_num(value, None)
            if parsed is not None:
                return parsed
        return None

    def target_price(src: dict[str, Any], index: int) -> float | None:
        if not isinstance(src, dict):
            return None

        if index == 0:
            direct = num(src.get("tp1"), src.get("target1"), src.get("targetPrice1"), src.get("targetPrice"), src.get("takeProfit"))
            if direct is not None:
                return direct

        if index == 1:
            direct = num(src.get("tp2"), src.get("target2"), src.get("targetPrice2"))
            if direct is not None:
                return direct

        targets = src.get("targets")
        if isinstance(targets, list) and len(targets) > index:
            item = targets[index]
            if isinstance(item, dict):
                return num(item.get("price"), item.get("target"), item.get("value"))
            return num(item)

        return None

    safe_limit = max(1, min(int(limit or 200), 1000))
    date_key = str(session_date or "").strip()[:10] or None
    layer = str(elite_layer or "CLEAN_ELITE_TEST").strip() or "CLEAN_ELITE_TEST"

    db_path = _s815a_db_path()
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row

    try:
        _s815a_ensure_tables(con)

        where = []
        params: list[Any] = []

        if date_key:
            where.append("session_date = ?")
            params.append(date_key)

        if layer.upper() != "ALL":
            where.append("elite_layer = ?")
            params.append(layer)

        where_sql = ("where " + " and ".join(where)) if where else ""

        rows = [
            dict(row)
            for row in con.execute(
                f"""
                select *
                from clean_elite_signals
                {where_sql}
                order by coalesce(session_date, '') desc, coalesce(selected_at, '') desc
                limit ?
                """,
                (*params, safe_limit),
            ).fetchall()
        ]
    finally:
        con.close()

    signal_map: dict[str, dict[str, Any]] = {}
    samples: list[dict[str, Any]] = []
    skipped = 0

    for row in rows:
        try:
            payload = json.loads(row.get("payload_json") or "{}")
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        raw = payload.get("raw") if isinstance(payload.get("raw"), dict) else {}
        metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {}
        raw_metrics = raw.get("metrics") if isinstance(raw.get("metrics"), dict) else {}

        clean_elite_id = str(row.get("clean_elite_id") or payload.get("cleanEliteId") or raw.get("cleanEliteId") or "").strip()
        symbol = first_text(row.get("symbol"), payload.get("symbol"), raw.get("symbol"))
        setup_slug = first_text(row.get("setup_slug"), payload.get("setupSlug"), raw.get("setupSlug"), payload.get("setup_slug"), raw.get("setup_slug"))
        signal_id = first_text(row.get("signal_id"), payload.get("signalId"), raw.get("signalId"), clean_elite_id)

        if not signal_id or not symbol or not setup_slug:
            skipped += 1
            continue

        trigger_time = first_text(
            row.get("trigger_time"),
            payload.get("triggerTime"),
            raw.get("triggerTime"),
            payload.get("signalTimeForSessionGuard"),
            raw.get("signalTimeForSessionGuard"),
            metrics.get("signalTimeForSessionGuard"),
            raw_metrics.get("signalTimeForSessionGuard"),
            row.get("selected_at"),
        )

        entry = num(row.get("entry"), payload.get("entry"), raw.get("entry"), payload.get("entryPrice"), raw.get("entryPrice"), payload.get("currentPrice"), raw.get("currentPrice"))
        stop = num(row.get("stop"), payload.get("stop"), raw.get("stop"), payload.get("stopLoss"), raw.get("stopLoss"))
        tp1 = num(row.get("tp1"), target_price(payload, 0), target_price(raw, 0))
        tp2 = num(row.get("tp2"), target_price(payload, 1), target_price(raw, 1))
        rr_to_tp1 = num(row.get("rr_to_tp1"), payload.get("rrToTp1"), raw.get("rrToTp1"), 2.0)

        signal = dict(raw)
        signal.update(payload)

        signal.update({
            "id": signal_id,
            "signalId": signal_id,
            "storageKey": signal_id,
            "cleanEliteId": clean_elite_id,
            "eliteLayer": first_text(row.get("elite_layer"), payload.get("eliteLayer"), raw.get("eliteLayer"), layer),
            "symbol": str(symbol).upper().strip(),
            "setupSlug": setup_slug,
            "setupName": first_text(payload.get("setupName"), raw.get("setupName"), setup_slug),
            "sessionDate": first_text(row.get("session_date"), payload.get("sessionDate"), raw.get("sessionDate"), date_key),
            "triggerTime": trigger_time,
            "createdAt": trigger_time,
            "direction": first_text(row.get("direction"), payload.get("direction"), raw.get("direction")),
            "entry": entry,
            "entryPrice": entry,
            "stop": stop,
            "stopLoss": stop,
            "tp1": tp1,
            "target1": tp1,
            "targetPrice": tp1,
            "targetPrice1": tp1,
            "tp2": tp2,
            "target2": tp2,
            "targetPrice2": tp2,
            "rrToTp1": rr_to_tp1,
            "score": num(row.get("score"), payload.get("score"), raw.get("score"), payload.get("signalScore"), raw.get("signalScore")),
            "signalScore": num(row.get("score"), payload.get("signalScore"), raw.get("signalScore"), payload.get("score"), raw.get("score")),
            "signalGrade": first_text(row.get("signal_grade"), payload.get("signalGrade"), raw.get("signalGrade"), payload.get("grade"), raw.get("grade")),
            "qualityStatus": first_text(row.get("quality_status"), payload.get("qualityStatus"), raw.get("qualityStatus"), "PASSED"),
            "premiumSignal": False,
            "telegramEligible": False,
            "clientVisible": False,
            "marketingClaimAllowed": False,
            "source": "clean_elite_ledger",
        })

        if entry is not None:
            signal["entryZone"] = {"min": entry, "max": entry}
            signal["entry_zone"] = {"min": entry, "max": entry}

        targets = []
        if tp1 is not None:
            targets.append({"r": rr_to_tp1 or 2.0, "price": tp1})
        if tp2 is not None:
            targets.append({"r": (rr_to_tp1 or 2.0) + 1.0, "price": tp2})
        if targets:
            signal["targets"] = targets

        signal_map[signal_id] = signal
        samples.append({
            "signalId": signal_id,
            "cleanEliteId": clean_elite_id,
            "symbol": str(symbol).upper().strip(),
            "setupSlug": setup_slug,
            "sessionDate": signal.get("sessionDate"),
            "eliteLayer": signal.get("eliteLayer"),
            "triggerTime": trigger_time,
            "entry": entry,
            "stop": stop,
            "tp1": tp1,
        })

    return signal_map, {
        "dbPath": str(db_path),
        "sessionDate": date_key,
        "eliteLayer": layer,
        "limit": safe_limit,
        "rowsLoaded": len(rows),
        "signalMapCount": len(signal_map),
        "skipped": skipped,
        "samples": samples[:8],
        "mode": "clean_elite_ledger_outcome_source_s816f",
    }



@app.post("/engine/clean-elite/supabase/sync")
def engine_clean_elite_supabase_sync(
    session_date: str | None = None,
    elite_layer: str = "ALL",
    limit: int = 1000,
):
    payload = _s816d_sync_clean_elite_sqlite_to_supabase(
        session_date=session_date,
        elite_layer=elite_layer,
        limit=limit,
    )
    return {
        "ok": payload.get("ok") is True,
        "value": payload,
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/clean-elite/outcomes/run")
async def engine_clean_elite_outcomes_run(
    session_date: str | None = None,
    elite_layer: str = "CLEAN_ELITE_TEST",
    interval: str = "5min",
    max_candles: int | None = None,
    use_trigger_time: bool = True,
    session_to_close: bool = True,
    limit: int = 200,
    capture_first: bool = True,
    publish: bool = True,
):
    capture = None
    if capture_first:
        capture = _s815a_capture_forward_selected_best(source="clean_elite_outcomes_run")

    client = FmpClient()
    if not client.is_configured():
        return {
            "ok": False,
            "error": "FMP_API_KEY is missing",
            "storageVersion": S815A_CLEAN_ELITE_VERSION,
        }

    signal_map, source_debug = _s816c_clean_elite_signal_map(
        session_date=session_date,
        elite_layer=elite_layer,
        limit=limit,
    )

    result = await evaluate_active_signals(
        client,
        signal_map,
        interval=interval,
        max_candles=max_candles,
        use_trigger_time=use_trigger_time,
        session_to_close=session_to_close,
    )

    outcomes = result.get("outcomes") if isinstance(result.get("outcomes"), list) else []
    for outcome in outcomes:
        if not isinstance(outcome, dict):
            continue
        signal_id = str(outcome.get("signalId") or "")
        source_signal = signal_map.get(signal_id) if signal_id else {}
        outcome["source"] = "clean_elite_ledger"
        outcome["cleanEliteId"] = source_signal.get("cleanEliteId")
        outcome["eliteLayer"] = source_signal.get("eliteLayer")
        outcome["clientVisible"] = False
        outcome["marketingClaimAllowed"] = False
        outcome["premiumSignal"] = False
        outcome["telegramEligible"] = False
        outcome["sessionDate"] = source_signal.get("sessionDate") or outcome.get("sessionDate")

    result["outcomes"] = _s810e_mark_no_eval_late_session_items(outcomes)
    storage = store_outcome_dataset(result.get("outcomes", []))
    stats = _s815a_clean_elite_stats(publish=publish)

    result["storage"] = storage
    result["capture"] = capture
    result["cleanEliteStats"] = stats
    result["source"] = "clean_elite_ledger"
    result["sourceDebug"] = source_debug
    result["endpoint"] = "/engine/clean-elite/outcomes/run"
    result["runtimeCache"] = publish_runtime_cache(reason="clean_elite_outcomes_run") if publish else None

    return {
        "ok": True,
        "value": result,
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/clean-elite/capture")
def engine_clean_elite_capture(source: str = "manual", publish: bool = True):
    capture = _s815a_capture_forward_selected_best(source=source)
    stats = _s815a_clean_elite_stats(publish=publish)
    return {
        "ok": True,
        "value": {
            "capture": capture,
            "stats": stats,
        },
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/clean-elite/stats")
def engine_clean_elite_stats(initial_capital: float = 50000, risk_pct: float = 0.01, publish: bool = False):
    payload = _s815a_clean_elite_stats(
        initial_capital=initial_capital,
        risk_pct=risk_pct,
        publish=publish,
    )
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/clean-elite/stats/run")
def engine_clean_elite_stats_run(initial_capital: float = 50000, risk_pct: float = 0.01, publish: bool = True):
    payload = _s815a_clean_elite_stats(
        initial_capital=initial_capital,
        risk_pct=risk_pct,
        publish=publish,
    )
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/clean-elite/cache")
def engine_clean_elite_cache():
    payload = runtime_cache.get_json(S815A_CLEAN_ELITE_CACHE_KEY)
    return {
        "ok": isinstance(payload, dict),
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S815A_CLEAN_ELITE_VERSION,
        "cache": runtime_cache.get_status(),
    }

# === /S8.15A ================================================================

# ---------------------------------------------------------------------------
# S6.1 Historical Replay Foundation / Self-Learning Readiness
# ---------------------------------------------------------------------------

S61_HISTORICAL_REPLAY_VERSION = "s6_1b_replay_readiness_diagnostics_fix_v1"
S61_REPLAY_CACHE_PREFIX = "engine:historical_replay"


def _s61_date_key(value: str | None = None) -> str:
    raw = str(value or "").strip()
    if raw:
        return raw[:10]
    return datetime.now(timezone.utc).date().isoformat()


def _s61_outcome_date(item: dict[str, Any]) -> str:
    for key in ("sessionDate", "session_date", "triggerTime", "createdAt", "evaluatedAt", "storedAt", "firstEventAt"):
        value = item.get(key)
        if value:
            return str(value)[:10]
    return ""


def _s61_filter_outcomes_by_date(items: list[dict[str, Any]], session_date: str) -> list[dict[str, Any]]:
    date_key = _s61_date_key(session_date)
    return [item for item in items or [] if _s61_outcome_date(item) == date_key]


def _s61_compact_selected_for_replay(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        health = row.get("entryHealth") if isinstance(row.get("entryHealth"), dict) else {}
        out.append({
            "rank": row.get("rank"),
            "symbol": row.get("symbol"),
            "setupSlug": row.get("setupSlug"),
            "setupName": row.get("setupName"),
            "direction": row.get("direction"),
            "score": row.get("score"),
            "rrToTp1": row.get("rrToTp1"),
            "currentR": row.get("currentR"),
            "lifecycleStatus": row.get("lifecycleStatus"),
            "entryHealthState": health.get("state"),
            "entryHealthAction": health.get("action"),
            "entryHealthPriority": health.get("priorityScore"),
            "telegramPassed": row.get("telegramPassed"),
            "whySelected": row.get("whySelected") if isinstance(row.get("whySelected"), list) else [],
            "whyNotElite": row.get("whyNotElite") if isinstance(row.get("whyNotElite"), list) else [],
        })
    return out


def _s61_replay_readiness() -> dict[str, Any]:
    outcomes = load_persistent_outcome_items()

    try:
        registry_summary = get_algorithm_registry_summary()
    except Exception as error:
        registry_summary = {"error": repr(error)}

    try:
        registry_items = get_algorithm_registry()
    except Exception as error:
        registry_items = {"error": repr(error)}

    try:
        forward_cached = runtime_cache.get_json(S515_FORWARD_REPORT_CACHE_KEY)
    except Exception:
        forward_cached = None

    try:
        db_status = db.get_status()
    except Exception as error:
        db_status = {"error": repr(error)}

    live_setup_slugs: list[str] = []
    if isinstance(registry_items, list):
        for item in registry_items:
            if not isinstance(item, dict):
                continue
            status = str(item.get("status") or item.get("state") or item.get("mode") or "").lower().strip()
            enabled = bool(item.get("enabled", False))
            is_live = status in {"live", "enabled", "active"} or enabled
            slug = item.get("slug") or item.get("setupSlug") or item.get("setup_slug") or item.get("id")
            if is_live and slug:
                live_setup_slugs.append(str(slug))

    registry_total = None
    registry_live_count = None
    if isinstance(registry_summary, dict):
        for key in ("totalAlgorithms", "total_algorithms", "registryTotal", "total", "count"):
            if isinstance(registry_summary.get(key), int):
                registry_total = registry_summary.get(key)
                break
        for key in ("liveAlgorithms", "live_algorithms", "liveSetupCount", "liveSetups", "live_count", "liveCount"):
            if isinstance(registry_summary.get(key), int):
                registry_live_count = registry_summary.get(key)
                break

        # Some registry summaries are nested by status/version.
        if registry_total is None:
            for value in registry_summary.values():
                if isinstance(value, dict):
                    for key in ("totalAlgorithms", "total", "count"):
                        if isinstance(value.get(key), int):
                            registry_total = value.get(key)
                            break
                if registry_total is not None:
                    break

    if registry_live_count is None:
        registry_live_count = len(live_setup_slugs)

    # Fallback: if the current forward report selected live setup slugs, the live
    # setup layer is operational even if registry diagnostics cannot count it.
    forward_selected_count = 0
    forward_setup_slugs: list[str] = []
    if isinstance(forward_cached, dict):
        selected = forward_cached.get("selectedBestIdeas")
        if isinstance(selected, list):
            forward_selected_count = len([x for x in selected if isinstance(x, dict)])
            forward_setup_slugs = sorted({
                str(x.get("setupSlug") or "").strip()
                for x in selected
                if isinstance(x, dict) and str(x.get("setupSlug") or "").strip()
            })

    has_stored_outcomes = len(outcomes) > 0
    storage_configured = (
        bool(db_status)
        and not (isinstance(db_status, dict) and db_status.get("error"))
        and (
            bool(db_status.get("ok")) if isinstance(db_status, dict) and "ok" in db_status else True
        )
    ) or has_stored_outcomes

    live_setup_registry_available = bool(registry_summary) or registry_live_count > 0 or forward_selected_count > 0

    readiness_gates = {
        "marketDataConfigured": bool(settings.fmp_api_key),
        "storageConfigured": bool(storage_configured),
        "outcomeLayerAvailable": True,
        "forwardReportAvailable": isinstance(forward_cached, dict),
        "liveSetupRegistryAvailable": bool(live_setup_registry_available),
        "hasStoredOutcomes": has_stored_outcomes,
    }

    # Foundation replay can run with market data + outcome layer + at least one
    # source of live setup context. It does not require true historical watchlist
    # replay yet; that remains S6.2/S6.3.
    blocking_for_foundation = [
        key for key, value in readiness_gates.items()
        if not value and key in {"marketDataConfigured", "storageConfigured", "outcomeLayerAvailable", "liveSetupRegistryAvailable"}
    ]
    missing = [key for key, value in readiness_gates.items() if not value]

    return {
        "version": S61_HISTORICAL_REPLAY_VERSION,
        "readyForFoundationReplay": len(blocking_for_foundation) == 0,
        "readyForTrueHistoricalReplay": False,
        "readinessGates": readiness_gates,
        "missing": missing,
        "blockingForFoundation": blocking_for_foundation,
        "currentCapabilities": {
            "canUseCurrentForwardReport": isinstance(forward_cached, dict),
            "canUseStoredOutcomes": has_stored_outcomes,
            "canBuildSetupStatsFromOutcomes": has_stored_outcomes,
            "canRunTrueHistoricalMarketReplay": False,
        },
        "counts": {
            "storedOutcomes": len(outcomes),
            "liveSetups": int(registry_live_count or 0),
            "registryTotal": registry_total,
            "forwardSelectedIdeas": forward_selected_count,
            "forwardSelectedSetupSlugs": forward_setup_slugs,
        },
        "diagnostics": {
            "dbStatus": db_status,
            "registrySummary": registry_summary,
            "registryItemsType": type(registry_items).__name__,
            "registryLiveSlugsSample": live_setup_slugs[:20],
            "note": "S6.1B makes readiness diagnostic robust: stored outcomes/current forward report can prove foundation readiness even when registry/db status uses a different shape.",
        },
        "nextRequiredForTrueReplay": [
            "historical_watchlist_builder_by_date",
            "historical_setup_candidate_generation_by_timestamp",
            "historical_best_idea_selection_without_future_leak",
            "historical_outcome_run_from_replay_candidates",
            "supabase_replay_runs_storage",
        ],
        "note": "S6.1B is still a foundation/readiness layer. It does not pretend to replay past days from raw historical market data yet.",
    }


def _s61_build_day_replay_foundation(
    *,
    session_date: str | None = None,
    limit: int = 160,
    max_best: int = 5,
    publish: bool = True,
    include_current_forward: bool = True,
) -> dict[str, Any]:
    date_key = _s61_date_key(session_date)
    all_outcomes = load_persistent_outcome_items()
    outcomes_for_date = _s61_filter_outcomes_by_date(all_outcomes, date_key)

    forward_report = None
    if include_current_forward:
        try:
            forward_report = _s515_build_daily_forward_report(
                date=date_key,
                limit=limit,
                max_best=max_best,
                publish=False,
            )
        except Exception as error:
            forward_report = {
                "ok": False,
                "error": repr(error),
            }

    selected = []
    if isinstance(forward_report, dict) and isinstance(forward_report.get("selectedBestIdeas"), list):
        selected = _s61_compact_selected_for_replay(forward_report.get("selectedBestIdeas") or [])

    outcome_summary = build_outcome_summary(outcomes_for_date)
    outcome_stats = build_outcome_statistics(outcomes_for_date)
    setup_stats = build_setup_statistics(outcomes_for_date)

    payload = {
        "ok": True,
        "version": S61_HISTORICAL_REPLAY_VERSION,
        "mode": "foundation_day_replay_not_true_historical_market_replay",
        "sessionDate": date_key,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "readiness": _s61_replay_readiness(),
        "forwardSnapshot": {
            "included": isinstance(forward_report, dict),
            "version": forward_report.get("version") if isinstance(forward_report, dict) else None,
            "state": forward_report.get("dailyDeskState", {}).get("state") if isinstance(forward_report.get("dailyDeskState"), dict) else None,
            "counts": forward_report.get("counts") if isinstance(forward_report, dict) else None,
            "selectedBestIdeas": selected,
            "learningNotes": forward_report.get("learningNotes") if isinstance(forward_report, dict) else [],
        },
        "historicalOutcomesForDate": {
            "count": len(outcomes_for_date),
            "summary": outcome_summary,
            "statistics": outcome_stats,
            "bySetup": setup_stats,
        },
        "learningInterpretation": {
            "canCalibrateFromThisDate": len(outcomes_for_date) > 0,
            "hasForwardSelectionForThisDate": len(selected) > 0,
            "mainGap": "true_historical_market_replay_not_enabled_yet",
            "nextStep": "S6.2 historical watchlist snapshot builder, then S6.3 replay setup candidates without future leak.",
        },
    }

    if publish:
        runtime_cache.set_json(f"{S61_REPLAY_CACHE_PREFIX}:{date_key}", payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S61_REPLAY_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/replay/readiness")
def engine_replay_readiness():
    return {
        "ok": True,
        "value": _s61_replay_readiness(),
        "storageVersion": S61_HISTORICAL_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
        "database": db.get_status(),
    }


@app.post("/engine/replay/day")
def engine_replay_day(
    session_date: str | None = None,
    limit: int = 160,
    max_best: int = 5,
    publish: bool = True,
    include_current_forward: bool = True,
):
    payload = _s61_build_day_replay_foundation(
        session_date=session_date,
        limit=limit,
        max_best=max_best,
        publish=publish,
        include_current_forward=include_current_forward,
    )
    return {
        "ok": True,
        "value": payload,
        "storageVersion": S61_HISTORICAL_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/cache")
def engine_replay_cache(session_date: str | None = None):
    key = f"{S61_REPLAY_CACHE_PREFIX}:{_s61_date_key(session_date)}" if session_date else f"{S61_REPLAY_CACHE_PREFIX}:latest"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S61_HISTORICAL_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/plan")
def engine_replay_plan():
    return {
        "ok": True,
        "version": S61_HISTORICAL_REPLAY_VERSION,
        "plan": [
            {
                "step": "S6.1",
                "name": "Historical Replay Foundation",
                "status": "implemented",
                "description": "Readiness diagnostics, day replay shell, current forward snapshot, stored outcome summary.",
            },
            {
                "step": "S6.2",
                "name": "Historical Watchlist Builder",
                "status": "implemented",
                "description": "Build a point-in-time historical watchlist from candidate symbols using only candles before cutoff, with provider timestamp-mode diagnostics; full historical mover universe is next.",
            },
            {
                "step": "S6.3",
                "name": "Historical Setup Candidate Replay",
                "status": "implemented",
                "description": "Create and quality-select point-in-time setup candidates from the S6.2B historical watchlist; full candle-trigger replay remains next.",
            },
            {
                "step": "S6.4",
                "name": "Replay Outcome Evaluation",
                "status": "implemented",
                "description": "Evaluate S6.3B replay candidates after cutoff to TP/STOP/session close with MFE/MAE and R result.",
            },
            {
                "step": "S7",
                "name": "Calibration / Re-ranking",
                "status": "implemented_foundation",
                "description": "Replay calibration report and safe re-ranking recommendations from persisted historical_replay outcomes.",
            },
        ],
    }


# ---------------------------------------------------------------------------
# S6.2 Historical Watchlist Builder / point-in-time candle scan
# ---------------------------------------------------------------------------

S62_HISTORICAL_WATCHLIST_VERSION = "s6_2b_historical_candle_timestamp_adapter_v1"
S62_WATCHLIST_CACHE_PREFIX = "engine:historical_watchlist"


def _s62_num(value: Any, fallback: float | None = None) -> float | None:
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").strip())
    except Exception:
        return fallback


def _s62_symbol_key(value: Any) -> str:
    return str(value or "").upper().strip()


def _s62_parse_hhmm(value: str | None, fallback: str = "17:00") -> tuple[int, int]:
    raw = str(value or fallback).strip()
    if not raw:
        raw = fallback
    parts = raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return max(0, min(hour, 23)), max(0, min(minute, 59))
    except Exception:
        return _s62_parse_hhmm(fallback, "17:00")


def _s62_cutoff_ny_datetime(session_date: str, cutoff_kyiv_time: str = "17:00") -> datetime:
    date_key = _s61_date_key(session_date)
    hour, minute = _s62_parse_hhmm(cutoff_kyiv_time, "17:00")
    kyiv_dt = datetime.fromisoformat(f"{date_key}T{hour:02d}:{minute:02d}:00").replace(tzinfo=ZoneInfo("Europe/Kyiv"))
    return kyiv_dt.astimezone(ZoneInfo("America/New_York"))


def _s62_parse_candle_dt(row: dict[str, Any]) -> datetime | None:
    # S6.2B: point-in-time filtering may attach a normalized NY timestamp.
    normalized = row.get("_dtNy") if isinstance(row, dict) else None
    if normalized:
        try:
            parsed = datetime.fromisoformat(str(normalized).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=ZoneInfo("America/New_York"))
            return parsed.astimezone(ZoneInfo("America/New_York"))
        except Exception:
            pass

    raw = row.get("date") or row.get("datetime") or row.get("timestamp") or row.get("time")
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        try:
            # Epoch timestamps are absolute instants. Convert them to New York.
            value = float(raw)
            if value > 10_000_000_000:
                value = value / 1000.0
            return datetime.fromtimestamp(value, tz=ZoneInfo("America/New_York"))
        except Exception:
            return None

    text_value = str(raw).strip()
    if not text_value:
        return None
    try:
        normalized_text = text_value.replace("Z", "+00:00").replace(" ", "T")
        parsed = datetime.fromisoformat(normalized_text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo("America/New_York"))
        else:
            parsed = parsed.astimezone(ZoneInfo("America/New_York"))
        return parsed
    except Exception:
        return None


def _s62_raw_candle_time_value(row: dict[str, Any]) -> Any:
    if not isinstance(row, dict):
        return None
    return row.get("date") or row.get("datetime") or row.get("timestamp") or row.get("time")


def _s62_parse_candle_dt_variants(row: dict[str, Any]) -> dict[str, datetime]:
    raw = _s62_raw_candle_time_value(row)
    if raw is None:
        return {}

    ny = ZoneInfo("America/New_York")
    utc = timezone.utc

    if isinstance(raw, (int, float)):
        try:
            value = float(raw)
            if value > 10_000_000_000:
                value = value / 1000.0
            return {"epoch_to_ny": datetime.fromtimestamp(value, tz=ny)}
        except Exception:
            return {}

    text_value = str(raw).strip()
    if not text_value:
        return {}

    try:
        normalized_text = text_value.replace("Z", "+00:00").replace(" ", "T")
        parsed = datetime.fromisoformat(normalized_text)
    except Exception:
        return {}

    if parsed.tzinfo is not None:
        return {"aware_to_ny": parsed.astimezone(ny)}

    # Many providers return intraday candle strings with no timezone. Some mean
    # exchange/New York time; others mean UTC. S6.2B tries both and chooses the
    # interpretation that creates the most valid point-in-time candles.
    return {
        "provider_naive_ny": parsed.replace(tzinfo=ny),
        "provider_naive_utc_to_ny": parsed.replace(tzinfo=utc).astimezone(ny),
    }


def _s62_candle_value(row: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = _s62_num(row.get(key))
        if value is not None:
            return value
    return None


def _s62_symbols_from_outcomes(session_date: str, limit: int = 200) -> list[str]:
    outcomes = _s61_filter_outcomes_by_date(load_persistent_outcome_items(), _s61_date_key(session_date))
    out: list[str] = []
    for item in outcomes:
        symbol = _s62_symbol_key(item.get("symbol"))
        if symbol and symbol not in out:
            out.append(symbol)
        if len(out) >= limit:
            break
    return out


def _s62_symbols_from_current_forward(limit: int = 100) -> list[str]:
    try:
        payload = runtime_cache.get_json(S515_FORWARD_REPORT_CACHE_KEY)
    except Exception:
        payload = None
    out: list[str] = []
    if isinstance(payload, dict):
        for key in ("selectedBestIdeas",):
            items = payload.get(key)
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        symbol = _s62_symbol_key(item.get("symbol"))
                        if symbol and symbol not in out:
                            out.append(symbol)
        monitoring = payload.get("monitoring")
        if isinstance(monitoring, dict):
            # reserved for future compact monitoring rows
            pass
    return out[:limit]


def _s62_symbols_from_current_watchlist(limit: int = 200) -> list[str]:
    out: list[str] = []
    try:
        items = _s416_watchlist_items()
    except Exception:
        items = []
    for item in items or []:
        if isinstance(item, dict):
            symbol = _s62_symbol_key(item.get("symbol"))
            if symbol and symbol not in out:
                out.append(symbol)
        if len(out) >= limit:
            break
    return out


def _s62_choose_symbols(symbols: str | None, session_date: str, limit: int) -> tuple[list[str], str]:
    if symbols:
        out = []
        for part in str(symbols).replace(";", ",").split(","):
            symbol = _s62_symbol_key(part)
            if symbol and symbol not in out:
                out.append(symbol)
        return out[:limit], "explicit_symbols"

    from_outcomes = _s62_symbols_from_outcomes(session_date, limit=limit)
    if from_outcomes:
        return from_outcomes[:limit], "stored_outcomes_for_date"

    from_forward = _s62_symbols_from_current_forward(limit=limit)
    if from_forward:
        return from_forward[:limit], "current_forward_report_fallback"

    from_watch = _s62_symbols_from_current_watchlist(limit=limit)
    return from_watch[:limit], "current_watchlist_fallback_not_true_historical_universe"


def _s62_filter_candles_point_in_time(
    rows: list[dict[str, Any]],
    *,
    session_date: str,
    cutoff_ny: datetime,
) -> dict[str, Any]:
    date_key = _s61_date_key(session_date)
    by_mode: dict[str, list[dict[str, Any]]] = {}
    raw_samples: list[Any] = []
    total_with_time = 0

    for row in rows or []:
        if not isinstance(row, dict):
            continue

        raw_time = _s62_raw_candle_time_value(row)
        if raw_time is not None:
            total_with_time += 1
            if len(raw_samples) < 8:
                raw_samples.append(raw_time)

        variants = _s62_parse_candle_dt_variants(row)
        for mode, dt in variants.items():
            dt_ny = dt.astimezone(ZoneInfo("America/New_York"))
            if dt_ny.date().isoformat() != date_key:
                continue
            if dt_ny <= cutoff_ny:
                new_row = dict(row)
                new_row["_dtNy"] = dt_ny.isoformat()
                new_row["_dtMode"] = mode
                by_mode.setdefault(mode, []).append(new_row)

    mode_counts = {mode: len(items) for mode, items in sorted(by_mode.items())}
    selected_mode = ""
    selected_items: list[dict[str, Any]] = []
    if by_mode:
        selected_mode = max(by_mode.keys(), key=lambda mode: (len(by_mode.get(mode) or []), mode))
        selected_items = by_mode.get(selected_mode) or []

    selected_items.sort(key=lambda item: str(item.get("_dtNy") or item.get("date") or item.get("timestamp") or ""))

    return {
        "items": selected_items,
        "timestampMode": selected_mode or "none",
        "modeCounts": mode_counts,
        "rawDateSamples": raw_samples,
        "rawRowsWithTimestamp": total_with_time,
    }


def _s62_build_watch_item_from_candles(
    symbol: str,
    candles: list[dict[str, Any]],
    *,
    session_date: str,
    cutoff_ny: datetime,
    source: str,
) -> dict[str, Any]:
    cleaned = []
    for row in candles or []:
        open_ = _s62_candle_value(row, "open", "o")
        high = _s62_candle_value(row, "high", "h")
        low = _s62_candle_value(row, "low", "l")
        close = _s62_candle_value(row, "close", "c")
        volume = _s62_candle_value(row, "volume", "v", "vol") or 0.0
        dt = _s62_parse_candle_dt(row)
        if open_ is None or high is None or low is None or close is None or dt is None:
            continue
        cleaned.append({
            "dt": dt.astimezone(ZoneInfo("America/New_York")),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": float(volume),
        })

    if not cleaned:
        return {
            "symbol": symbol,
            "sessionDate": _s61_date_key(session_date),
            "ok": False,
            "reason": "no_valid_candles_before_cutoff",
            "source": source,
        }

    first = cleaned[0]
    last = cleaned[-1]
    high = max(row["high"] for row in cleaned)
    low = min(row["low"] for row in cleaned)
    total_volume = sum(row["volume"] for row in cleaned)
    premarket_volume = sum(row["volume"] for row in cleaned if (row["dt"].hour, row["dt"].minute) < (9, 30))
    regular_volume = total_volume - premarket_volume

    first_open = first["open"]
    last_price = last["close"]
    change_pct = ((last_price - first_open) / first_open * 100.0) if first_open else 0.0
    range_pct = ((high - low) / last_price * 100.0) if last_price else 0.0

    reasons: list[str] = []
    score = 0

    if total_volume >= 3_000_000:
        score += 30
        reasons.append("volume_3m_plus_before_cutoff")
    elif total_volume >= 1_000_000:
        score += 24
        reasons.append("volume_1m_plus_before_cutoff")
    elif total_volume >= 500_000:
        score += 16
        reasons.append("volume_500k_plus_before_cutoff")

    abs_change = abs(change_pct)
    if abs_change >= 20:
        score += 28
        reasons.append("major_move_20pct_plus_before_cutoff")
    elif abs_change >= 15:
        score += 22
        reasons.append("move_15pct_plus_before_cutoff")
    elif abs_change >= 10:
        score += 16
        reasons.append("move_10pct_plus_before_cutoff")

    if range_pct >= 15:
        score += 20
        reasons.append("range_15pct_plus_before_cutoff")
    elif range_pct >= 10:
        score += 14
        reasons.append("range_10pct_plus_before_cutoff")
    elif range_pct >= 5:
        score += 8
        reasons.append("range_5pct_plus_before_cutoff")

    if 1 <= last_price <= 30:
        score += 8
        reasons.append("price_in_active_trading_range")
    elif last_price < 1:
        score -= 10
        reasons.append("sub_1_dollar_risk")

    if premarket_volume >= 500_000:
        score += 8
        reasons.append("premarket_volume_500k_plus")

    if regular_volume >= 500_000:
        score += 6
        reasons.append("regular_volume_500k_plus")

    in_play = score >= 35 and (total_volume >= 500_000 or abs_change >= 10 or range_pct >= 8)

    return {
        "symbol": symbol,
        "sessionDate": _s61_date_key(session_date),
        "ok": True,
        "source": source,
        "cutoffNy": cutoff_ny.isoformat(),
        "firstCandleAt": first["dt"].isoformat(),
        "lastCandleAt": last["dt"].isoformat(),
        "candleCount": len(cleaned),
        "price": round(float(last_price), 4),
        "open": round(float(first_open), 4),
        "high": round(float(high), 4),
        "low": round(float(low), 4),
        "changePercent": round(float(change_pct), 2),
        "rangePercent": round(float(range_pct), 2),
        "volume": int(total_volume),
        "premarketVolume": int(premarket_volume),
        "regularVolume": int(regular_volume),
        "inPlayScore": int(max(0, min(score, 100))),
        "historicalEngineStatus": "WATCH" if in_play else "FILTERED",
        "rankReasons": reasons,
    }


async def _s62_build_historical_watchlist(
    *,
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    publish: bool = True,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 80), 250))
    date_key = _s61_date_key(session_date)
    cutoff_ny = _s62_cutoff_ny_datetime(date_key, cutoff_kyiv_time)
    chosen_symbols, symbol_source = _s62_choose_symbols(symbols, date_key, safe_limit)

    client = FmpClient()
    if not client.is_configured():
        return {
            "ok": False,
            "version": S62_HISTORICAL_WATCHLIST_VERSION,
            "error": "FMP_API_KEY is missing",
        }

    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for symbol in chosen_symbols:
        try:
            rows = await client.get_intraday_candles(symbol, interval=interval)
            pit_info = _s62_filter_candles_point_in_time(rows, session_date=date_key, cutoff_ny=cutoff_ny)
            pit_rows = pit_info.get("items") if isinstance(pit_info, dict) and isinstance(pit_info.get("items"), list) else []
            item = _s62_build_watch_item_from_candles(
                symbol,
                pit_rows,
                session_date=date_key,
                cutoff_ny=cutoff_ny,
                source=symbol_source,
            )
            item["rawCandlesReturned"] = len(rows or [])
            item["pointInTimeCandles"] = len(pit_rows)
            item["timestampMode"] = pit_info.get("timestampMode") if isinstance(pit_info, dict) else None
            item["timestampModeCounts"] = pit_info.get("modeCounts") if isinstance(pit_info, dict) else {}
            item["rawDateSamples"] = pit_info.get("rawDateSamples") if isinstance(pit_info, dict) else []
            item["rawRowsWithTimestamp"] = pit_info.get("rawRowsWithTimestamp") if isinstance(pit_info, dict) else 0
            items.append(item)
        except Exception as error:
            errors.append({"symbol": symbol, "error": repr(error)})

    watch_items = sorted(
        [item for item in items if item.get("ok") and item.get("historicalEngineStatus") == "WATCH"],
        key=lambda item: (int(item.get("inPlayScore") or 0), int(item.get("volume") or 0), abs(float(item.get("changePercent") or 0))),
        reverse=True,
    )
    filtered_items = [item for item in items if item not in watch_items]

    payload = {
        "ok": True,
        "version": S62_HISTORICAL_WATCHLIST_VERSION,
        "mode": "point_in_time_historical_watchlist_builder",
        "sessionDate": date_key,
        "cutoffKyivTime": cutoff_kyiv_time,
        "cutoffNy": cutoff_ny.isoformat(),
        "interval": interval,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "symbolSource": symbol_source,
        "futureLeakGuard": {
            "enabled": True,
            "rule": "Only candles with provider/New_York timestamp <= cutoffNy are used for scoring.",
            "limitation": "S6.2B scans a candidate symbol list from outcomes/current context and auto-detects provider timestamp mode. Full historical mover universe comes in the next replay step.",
        },
        "counts": {
            "symbolsRequested": len(chosen_symbols),
            "itemsBuilt": len(items),
            "watchCount": len(watch_items),
            "filteredCount": len(filtered_items),
            "errorCount": len(errors),
        },
        "watchlist": watch_items[:safe_limit],
        "filtered": filtered_items[:safe_limit],
        "errors": errors[:50],
    }

    if publish:
        runtime_cache.set_json(f"{S62_WATCHLIST_CACHE_PREFIX}:{date_key}", payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S62_WATCHLIST_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/replay/watchlist")
async def engine_replay_watchlist(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    publish: bool = True,
):
    payload = await _s62_build_historical_watchlist(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S62_HISTORICAL_WATCHLIST_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/replay/watchlist/build")
async def engine_replay_watchlist_build(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    publish: bool = True,
):
    payload = await _s62_build_historical_watchlist(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S62_HISTORICAL_WATCHLIST_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/watchlist/cache")
def engine_replay_watchlist_cache(session_date: str | None = None):
    key = f"{S62_WATCHLIST_CACHE_PREFIX}:{_s61_date_key(session_date)}" if session_date else f"{S62_WATCHLIST_CACHE_PREFIX}:latest"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S62_HISTORICAL_WATCHLIST_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S6.3 Historical Setup Candidate Replay / point-in-time candidates
# ---------------------------------------------------------------------------

S63_HISTORICAL_SETUP_REPLAY_VERSION = "s6_3b_replay_candidate_quality_selector_v1"
S63_SETUP_REPLAY_CACHE_PREFIX = "engine:historical_setup_replay"


def _s63_rr_targets(entry: float, stop: float, direction: str) -> dict[str, Any] | None:
    direction = str(direction or "").lower().strip()
    if entry <= 0 or stop <= 0:
        return None
    if direction == "long":
        risk = entry - stop
        if risk <= 0:
            return None
        return {
            "risk": round(float(risk), 4),
            "tp1": round(float(entry + 2.0 * risk), 4),
            "tp2": round(float(entry + 3.0 * risk), 4),
            "rrToTp1": 2.0,
            "rrToTp2": 3.0,
        }
    if direction == "short":
        risk = stop - entry
        if risk <= 0:
            return None
        return {
            "risk": round(float(risk), 4),
            "tp1": round(float(entry - 2.0 * risk), 4),
            "tp2": round(float(entry - 3.0 * risk), 4),
            "rrToTp1": 2.0,
            "rrToTp2": 3.0,
        }
    return None


def _s63_stop_from_watch_item(item: dict[str, Any], direction: str) -> float | None:
    price = _s62_num(item.get("price"))
    high = _s62_num(item.get("high"))
    low = _s62_num(item.get("low"))
    if price is None or price <= 0:
        return None

    min_risk = max(price * 0.005, 0.01)
    direction = str(direction or "").lower().strip()

    if direction == "long":
        raw_stop = low if low is not None and low < price else price - min_risk
        stop = min(raw_stop, price - min_risk)
        return round(max(0.0001, float(stop)), 4)

    if direction == "short":
        raw_stop = high if high is not None and high > price else price + min_risk
        stop = max(raw_stop, price + min_risk)
        return round(float(stop), 4)

    return None


def _s63_grade_from_score(score: float) -> str:
    if score >= 92:
        return "A+"
    if score >= 84:
        return "A"
    if score >= 76:
        return "B+"
    if score >= 68:
        return "B"
    return "C"


def _s63_candidate(
    item: dict[str, Any],
    *,
    setup_slug: str,
    setup_name: str,
    direction: str,
    base_score: float,
    reasons: list[str],
    caution: str | None = None,
) -> dict[str, Any] | None:
    symbol = _s62_symbol_key(item.get("symbol"))
    price = _s62_num(item.get("price"))
    if not symbol or price is None or price <= 0:
        return None

    stop = _s63_stop_from_watch_item(item, direction)
    if stop is None:
        return None

    rr = _s63_rr_targets(float(price), float(stop), direction)
    if not rr:
        return None

    score = max(0.0, min(100.0, float(base_score)))
    cautions: list[str] = []
    if caution:
        cautions.append(caution)

    if _s62_num(item.get("volume"), 0) < 500_000:
        cautions.append("historical_volume_below_500k")
        score = max(0.0, score - 12)

    range_pct = _s62_num(item.get("rangePercent"), 0) or 0
    if range_pct < 2:
        cautions.append("historical_range_too_small")
        score = max(0.0, score - 8)

    return {
        "symbol": symbol,
        "sessionDate": item.get("sessionDate"),
        "setupSlug": setup_slug,
        "setupName": setup_name,
        "direction": direction,
        "status": "HISTORICAL_SETUP_CANDIDATE",
        "score": round(float(score), 2),
        "grade": _s63_grade_from_score(score),
        "entry": round(float(price), 4),
        "stop": stop,
        "tp1": rr["tp1"],
        "tp2": rr["tp2"],
        "rrToTp1": rr["rrToTp1"],
        "rrToTp2": rr["rrToTp2"],
        "risk": rr["risk"],
        "sourceWatch": {
            "inPlayScore": item.get("inPlayScore"),
            "changePercent": item.get("changePercent"),
            "rangePercent": item.get("rangePercent"),
            "volume": item.get("volume"),
            "premarketVolume": item.get("premarketVolume"),
            "regularVolume": item.get("regularVolume"),
            "price": item.get("price"),
            "open": item.get("open"),
            "high": item.get("high"),
            "low": item.get("low"),
            "cutoffNy": item.get("cutoffNy"),
            "timestampMode": item.get("timestampMode"),
            "candleCount": item.get("candleCount"),
        },
        "reasons": reasons[:8],
        "cautions": cautions[:8],
        "futureLeakSafe": True,
    }


def _s63_candidates_from_watch_item(item: dict[str, Any]) -> list[dict[str, Any]]:
    price = _s62_num(item.get("price"), 0) or 0
    change = _s62_num(item.get("changePercent"), 0) or 0
    range_pct = _s62_num(item.get("rangePercent"), 0) or 0
    volume = _s62_num(item.get("volume"), 0) or 0
    in_play = _s62_num(item.get("inPlayScore"), 0) or 0
    rank_reasons = item.get("rankReasons") if isinstance(item.get("rankReasons"), list) else []

    out: list[dict[str, Any]] = []

    # Long continuation/reclaim family.
    if volume >= 500_000 and range_pct >= 1.5 and change >= -1.5:
        score = in_play + 22
        reasons = ["historical_point_in_time_watch", "price_holding_above_or_near_open", "volume_confirmed_before_cutoff"] + rank_reasons
        if price >= 10 and volume >= 2_000_000:
            cand = _s63_candidate(
                item,
                setup_slug="large_cap_vwap_trend_long",
                setup_name="Large Cap VWAP Trend Long",
                direction="long",
                base_score=score + 8,
                reasons=["large_cap_liquidity_profile"] + reasons,
            )
            if cand:
                out.append(cand)

        cand = _s63_candidate(
            item,
            setup_slug="vwap_reclaim_long",
            setup_name="VWAP Reclaim Long",
            direction="long",
            base_score=score,
            reasons=["historical_reclaim_or_hold_profile"] + reasons,
        )
        if cand:
            out.append(cand)

    if volume >= 500_000 and change >= 2 and range_pct >= 2:
        cand = _s63_candidate(
            item,
            setup_slug="opening_range_breakout_long",
            setup_name="Opening Range Breakout Long",
            direction="long",
            base_score=in_play + 24,
            reasons=["historical_opening_range_strength", "positive_change_before_cutoff"] + rank_reasons,
        )
        if cand:
            out.append(cand)

    if volume >= 500_000 and change >= 5 and range_pct >= 4:
        cand = _s63_candidate(
            item,
            setup_slug="gap_hold_continuation_long",
            setup_name="Gap Hold Continuation Long",
            direction="long",
            base_score=in_play + 26,
            reasons=["historical_gap_hold_continuation_profile", "strong_positive_change_before_cutoff"] + rank_reasons,
        )
        if cand:
            out.append(cand)

    # Short fade/rejection family.
    if volume >= 500_000 and (change <= -2 or range_pct >= 8):
        short_score = in_play + 18
        if change <= -5:
            short_score += 8
        cand = _s63_candidate(
            item,
            setup_slug="vwap_rejection_short",
            setup_name="VWAP Rejection Short",
            direction="short",
            base_score=short_score,
            reasons=["historical_rejection_or_fade_profile", "weakness_before_cutoff"] + rank_reasons,
            caution="short_candidate_from_watch_metrics_not_full_trigger",
        )
        if cand:
            out.append(cand)

    if volume >= 500_000 and change <= -5 and range_pct >= 5:
        cand = _s63_candidate(
            item,
            setup_slug="gap_and_crap_short",
            setup_name="Gap and Crap Short",
            direction="short",
            base_score=in_play + 28,
            reasons=["historical_gap_and_crap_profile", "negative_change_before_cutoff"] + rank_reasons,
            caution="requires_chart_confirmation_in_full_replay",
        )
        if cand:
            out.append(cand)

    if volume >= 500_000 and change >= 10 and range_pct >= 8:
        cand = _s63_candidate(
            item,
            setup_slug="premarket_pump_short",
            setup_name="Premarket Pump Short",
            direction="short",
            base_score=in_play + 20,
            reasons=["historical_extended_pump_profile", "range_expansion_before_cutoff"] + rank_reasons,
            caution="extension_short_needs_exhaustion_trigger_in_full_replay",
        )
        if cand:
            out.append(cand)

    # De-duplicate per symbol/setup/direction.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for cand in out:
        key = "|".join([str(cand.get("symbol")), str(cand.get("setupSlug")), str(cand.get("direction"))])
        if key in seen:
            continue
        seen.add(key)
        unique.append(cand)

    unique.sort(key=lambda row: (-float(row.get("score") or 0), str(row.get("symbol") or ""), str(row.get("setupSlug") or "")))
    return unique


def _s63_setup_counts(candidates: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for cand in candidates or []:
        slug = str(cand.get("setupSlug") or "unknown")
        out[slug] = out.get(slug, 0) + 1
    return dict(sorted(out.items(), key=lambda pair: (-pair[1], pair[0])))


def _s63b_risk_pct(candidate: dict[str, Any]) -> float | None:
    entry = _s62_num(candidate.get("entry"))
    stop = _s62_num(candidate.get("stop"))
    if entry is None or stop is None or entry <= 0:
        return None
    return abs(float(entry) - float(stop)) / float(entry) * 100.0


def _s63b_max_risk_pct_for_price(price: float) -> float:
    if price < 2:
        return 18.0
    if price < 10:
        return 16.0
    return 10.0


def _s63b_candidate_quality(candidate: dict[str, Any]) -> dict[str, Any]:
    entry = _s62_num(candidate.get("entry"))
    stop = _s62_num(candidate.get("stop"))
    tp1 = _s62_num(candidate.get("tp1"))
    rr = _s62_num(candidate.get("rrToTp1"), 0) or 0
    score = _s62_num(candidate.get("score"), 0) or 0
    source_watch = candidate.get("sourceWatch") if isinstance(candidate.get("sourceWatch"), dict) else {}
    volume = _s62_num(source_watch.get("volume"), 0) or 0
    risk_pct = _s63b_risk_pct(candidate)

    reject_reasons: list[str] = []
    warnings: list[str] = []

    if entry is None or stop is None or tp1 is None or entry <= 0 or stop <= 0 or tp1 <= 0:
        reject_reasons.append("missing_or_invalid_trade_levels")
    if rr < 2.0:
        reject_reasons.append("rr_below_2r")
    if score < 70:
        reject_reasons.append("score_below_70")
    if volume < 500_000:
        reject_reasons.append("volume_below_500k")

    if risk_pct is None:
        reject_reasons.append("risk_pct_missing")
    else:
        max_risk_pct = _s63b_max_risk_pct_for_price(float(entry or 0))
        if risk_pct < 0.25:
            reject_reasons.append("stop_too_tight_under_0_25pct")
        if risk_pct > max_risk_pct:
            reject_reasons.append(f"risk_pct_too_wide_over_{max_risk_pct:g}")
        if risk_pct > max_risk_pct * 0.75:
            warnings.append("wide_stop_needs_full_candle_validation")

    cautions = candidate.get("cautions") if isinstance(candidate.get("cautions"), list) else []
    if cautions:
        warnings.extend([str(c) for c in cautions[:4]])

    quality_score = float(score)
    if risk_pct is not None:
        if risk_pct <= 4:
            quality_score += 8
        elif risk_pct <= 8:
            quality_score += 4
        elif risk_pct > 12:
            quality_score -= 10

    if volume >= 3_000_000:
        quality_score += 5
    elif volume < 1_000_000:
        quality_score -= 4

    if reject_reasons:
        quality_score = min(quality_score, 69.0)

    quality_score = max(0.0, min(100.0, quality_score))
    return {
        "passed": len(reject_reasons) == 0,
        "qualityScore": round(float(quality_score), 2),
        "riskPct": round(float(risk_pct), 2) if risk_pct is not None else None,
        "rejectReasons": reject_reasons,
        "warnings": warnings[:8],
        "policy": "score>=70, RR>=2R, volume>=500k, valid levels, dynamic max risk pct by price.",
    }


def _s63b_attach_quality(candidate: dict[str, Any]) -> dict[str, Any]:
    out = dict(candidate)
    quality = _s63b_candidate_quality(out)
    out["qualityGate"] = quality
    out["qualityPassed"] = bool(quality.get("passed"))
    out["qualityScore"] = quality.get("qualityScore")
    out["riskPct"] = quality.get("riskPct")
    if quality.get("warnings"):
        existing = out.get("cautions") if isinstance(out.get("cautions"), list) else []
        out["cautions"] = (existing + quality.get("warnings"))[:10]
    return out


def _s63b_reject_counts(candidates: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for cand in candidates or []:
        quality = cand.get("qualityGate") if isinstance(cand.get("qualityGate"), dict) else {}
        for reason in quality.get("rejectReasons") or []:
            out[str(reason)] = out.get(str(reason), 0) + 1
    return dict(sorted(out.items(), key=lambda pair: (-pair[1], pair[0])))


def _s63b_select_best_unique(candidates: list[dict[str, Any]], max_candidates: int) -> list[dict[str, Any]]:
    ranked = sorted(
        [c for c in candidates or [] if isinstance(c, dict) and c.get("qualityPassed") is True],
        key=lambda row: (
            -float(row.get("qualityScore") or row.get("score") or 0),
            -float(row.get("score") or 0),
            str(row.get("symbol") or ""),
            str(row.get("setupSlug") or ""),
        ),
    )

    selected: list[dict[str, Any]] = []
    used_symbols: set[str] = set()
    for cand in ranked:
        symbol = _s62_symbol_key(cand.get("symbol"))
        if not symbol or symbol in used_symbols:
            continue
        used_symbols.add(symbol)
        row = dict(cand)
        row["replayRank"] = len(selected) + 1
        row["selectionRole"] = "PRIMARY_REPLAY_IDEA" if not selected else "BACKUP_REPLAY_IDEA"
        selected.append(row)
        if len(selected) >= max_candidates:
            break

    return selected



async def _s63_build_historical_setup_replay(
    *,
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
) -> dict[str, Any]:
    date_key = _s61_date_key(session_date)
    safe_limit = max(1, min(int(limit or 80), 250))
    safe_max_candidates = max(1, min(int(max_candidates or 50), 200))

    watch_payload = await _s62_build_historical_watchlist(
        session_date=date_key,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=safe_limit,
        publish=True,
    )

    watch_items = watch_payload.get("watchlist") if isinstance(watch_payload.get("watchlist"), list) else []
    raw_candidates: list[dict[str, Any]] = []
    for item in watch_items:
        if isinstance(item, dict):
            raw_candidates.extend(_s63_candidates_from_watch_item(item))

    raw_candidates.sort(key=lambda row: (-float(row.get("score") or 0), str(row.get("symbol") or ""), str(row.get("setupSlug") or "")))
    scored_candidates = [_s63b_attach_quality(candidate) for candidate in raw_candidates]
    quality_passed = [candidate for candidate in scored_candidates if candidate.get("qualityPassed") is True]
    selected = _s63b_select_best_unique(quality_passed, safe_max_candidates)
    rejected = [candidate for candidate in scored_candidates if candidate.get("qualityPassed") is not True]

    payload = {
        "ok": True,
        "version": S63_HISTORICAL_SETUP_REPLAY_VERSION,
        "mode": "point_in_time_historical_setup_candidate_replay",
        "sessionDate": date_key,
        "cutoffKyivTime": cutoff_kyiv_time,
        "cutoffNy": watch_payload.get("cutoffNy"),
        "interval": interval,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "futureLeakGuard": {
            "enabled": True,
            "rule": "Candidates are created only from S6.2B point-in-time watchlist metrics built from candles <= cutoff.",
            "limitation": "S6.3 uses watchlist-level metrics, not full candle-pattern trigger replay yet. S6.3B will replay setup triggers on candles.",
        },
        "sourceWatchlist": {
            "version": watch_payload.get("version"),
            "symbolSource": watch_payload.get("symbolSource"),
            "counts": watch_payload.get("counts"),
        },
        "qualityPolicy": {
            "version": "s6_3b_replay_candidate_quality_selector_v1",
            "goal": "Keep only replay candidates with valid levels, RR>=2R, sufficient volume, reasonable riskPct, and one best candidate per symbol.",
            "dynamicMaxRiskPct": {
                "price_under_2": 18.0,
                "price_2_to_10": 16.0,
                "price_10_plus": 10.0,
            },
        },
        "counts": {
            "watchCount": len(watch_items),
            "rawCandidateCount": len(raw_candidates),
            "qualityPassedCount": len(quality_passed),
            "qualityRejectedCount": len(rejected),
            "candidateCount": len(selected),
            "selectedCandidateCount": len(selected),
            "rawBySetup": _s63_setup_counts(raw_candidates),
            "bySetup": _s63_setup_counts(selected),
            "rejectedByReason": _s63b_reject_counts(rejected),
            "longCount": len([c for c in selected if c.get("direction") == "long"]),
            "shortCount": len([c for c in selected if c.get("direction") == "short"]),
            "uniqueSymbolCount": len({_s62_symbol_key(c.get("symbol")) for c in selected}),
        },
        "candidates": selected,
        "qualityRejectedSample": rejected[:50],
        "watchlist": watch_items[:safe_limit],
        "learningInterpretation": {
            "canRunOutcomeReplayNext": len(selected) > 0,
            "mainGap": "full_candle_trigger_replay_not_enabled_yet",
            "nextStep": "S6.4 replay outcome evaluation from quality-selected historical setup candidates; then S6.3C full candle trigger replay.",
        },
    }

    if publish:
        runtime_cache.set_json(f"{S63_SETUP_REPLAY_CACHE_PREFIX}:{date_key}", payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S63_SETUP_REPLAY_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/replay/setups")
async def engine_replay_setups(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
):
    payload = await _s63_build_historical_setup_replay(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S63_HISTORICAL_SETUP_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/replay/setups/run")
async def engine_replay_setups_run(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
):
    payload = await _s63_build_historical_setup_replay(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S63_HISTORICAL_SETUP_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/setups/cache")
def engine_replay_setups_cache(session_date: str | None = None):
    key = f"{S63_SETUP_REPLAY_CACHE_PREFIX}:{_s61_date_key(session_date)}" if session_date else f"{S63_SETUP_REPLAY_CACHE_PREFIX}:latest"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S63_HISTORICAL_SETUP_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S6.4 Replay Outcome Evaluation / post-cutoff TP1-STOP-session-close
# ---------------------------------------------------------------------------

S64_REPLAY_OUTCOME_VERSION = "s6_4_replay_outcome_evaluation_v1"
S64_OUTCOME_CACHE_PREFIX = "engine:historical_replay_outcomes"


def _s64_kyiv_to_ny_datetime(session_date: str, hhmm: str, fallback: str) -> datetime:
    date_key = _s61_date_key(session_date)
    hour, minute = _s62_parse_hhmm(hhmm, fallback)
    kyiv_dt = datetime.fromisoformat(f"{date_key}T{hour:02d}:{minute:02d}:00").replace(tzinfo=ZoneInfo("Europe/Kyiv"))
    return kyiv_dt.astimezone(ZoneInfo("America/New_York"))


def _s64_parse_dt_with_mode(row: dict[str, Any], timestamp_mode: str | None = None) -> datetime | None:
    variants = _s62_parse_candle_dt_variants(row)
    mode = str(timestamp_mode or "").strip()
    if mode and mode in variants:
        return variants[mode].astimezone(ZoneInfo("America/New_York"))
    if variants:
        # Prefer the same adapter mode that fixed S6.2B, then any available mode.
        if "provider_naive_utc_to_ny" in variants:
            return variants["provider_naive_utc_to_ny"].astimezone(ZoneInfo("America/New_York"))
        first_key = sorted(variants.keys())[0]
        return variants[first_key].astimezone(ZoneInfo("America/New_York"))
    return _s62_parse_candle_dt(row)


def _s64_future_candles(
    rows: list[dict[str, Any]],
    *,
    session_date: str,
    cutoff_ny: datetime,
    close_ny: datetime,
    timestamp_mode: str | None = None,
) -> list[dict[str, Any]]:
    date_key = _s61_date_key(session_date)
    out: list[dict[str, Any]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        dt = _s64_parse_dt_with_mode(row, timestamp_mode=timestamp_mode)
        if not dt:
            continue
        dt_ny = dt.astimezone(ZoneInfo("America/New_York"))
        if dt_ny.date().isoformat() != date_key:
            continue
        if not (cutoff_ny < dt_ny <= close_ny):
            continue

        open_ = _s62_candle_value(row, "open", "o")
        high = _s62_candle_value(row, "high", "h")
        low = _s62_candle_value(row, "low", "l")
        close = _s62_candle_value(row, "close", "c")
        volume = _s62_candle_value(row, "volume", "v", "vol") or 0.0
        if open_ is None or high is None or low is None or close is None:
            continue

        out.append({
            "dt": dt_ny,
            "open": float(open_),
            "high": float(high),
            "low": float(low),
            "close": float(close),
            "volume": float(volume),
        })

    out.sort(key=lambda item: item["dt"])
    return out


def _s64_outcome_key(candidate: dict[str, Any]) -> str:
    return "|".join([
        _s62_symbol_key(candidate.get("symbol")),
        str(candidate.get("setupSlug") or "").strip(),
        str(candidate.get("direction") or "").lower().strip(),
        str(candidate.get("sessionDate") or "").strip(),
    ])


def _s64_evaluate_candidate_outcome(
    candidate: dict[str, Any],
    candles: list[dict[str, Any]],
    *,
    session_close_ny: datetime,
) -> dict[str, Any]:
    symbol = _s62_symbol_key(candidate.get("symbol"))
    setup_slug = str(candidate.get("setupSlug") or "").strip()
    direction = str(candidate.get("direction") or "").lower().strip()
    entry = _s62_num(candidate.get("entry"))
    stop = _s62_num(candidate.get("stop"))
    tp1 = _s62_num(candidate.get("tp1"))
    tp2 = _s62_num(candidate.get("tp2"))
    risk = _s62_num(candidate.get("risk"))

    if not symbol or direction not in {"long", "short"} or entry is None or stop is None or tp1 is None:
        return {
            "symbol": symbol,
            "setupSlug": setup_slug,
            "direction": direction,
            "ok": False,
            "result": "INVALID_LEVELS",
            "resultR": None,
            "reason": "missing_symbol_direction_or_levels",
        }

    if risk is None or risk <= 0:
        risk = abs(float(entry) - float(stop))
    if risk <= 0:
        return {
            "symbol": symbol,
            "setupSlug": setup_slug,
            "direction": direction,
            "ok": False,
            "result": "INVALID_RISK",
            "resultR": None,
            "reason": "risk_zero_or_negative",
        }

    mfe_r = 0.0
    mae_r = 0.0
    first_event = None
    first_event_at = None
    close_price = None

    for candle in candles or []:
        high = float(candle.get("high") or 0)
        low = float(candle.get("low") or 0)
        close_price = float(candle.get("close") or 0)
        dt = candle.get("dt")

        if direction == "long":
            mfe_r = max(mfe_r, (high - float(entry)) / float(risk))
            mae_r = max(mae_r, (float(entry) - low) / float(risk))

            hit_stop = low <= float(stop)
            hit_tp1 = high >= float(tp1)
            hit_tp2 = bool(tp2 is not None and high >= float(tp2))

            if hit_stop and hit_tp1:
                first_event = "AMBIGUOUS_STOP_FIRST"
                first_event_at = dt
                break
            if hit_stop:
                first_event = "STOP_HIT"
                first_event_at = dt
                break
            if hit_tp2:
                first_event = "TP2_HIT"
                first_event_at = dt
                break
            if hit_tp1:
                first_event = "TP1_HIT"
                first_event_at = dt
                break

        else:
            mfe_r = max(mfe_r, (float(entry) - low) / float(risk))
            mae_r = max(mae_r, (high - float(entry)) / float(risk))

            hit_stop = high >= float(stop)
            hit_tp1 = low <= float(tp1)
            hit_tp2 = bool(tp2 is not None and low <= float(tp2))

            if hit_stop and hit_tp1:
                first_event = "AMBIGUOUS_STOP_FIRST"
                first_event_at = dt
                break
            if hit_stop:
                first_event = "STOP_HIT"
                first_event_at = dt
                break
            if hit_tp2:
                first_event = "TP2_HIT"
                first_event_at = dt
                break
            if hit_tp1:
                first_event = "TP1_HIT"
                first_event_at = dt
                break

    if first_event in {"STOP_HIT", "AMBIGUOUS_STOP_FIRST"}:
        result = "FAILED_STOP"
        result_r = -1.0
        closed = True
    elif first_event == "TP2_HIT":
        result = "WORKED_TP2"
        result_r = 3.0
        closed = True
    elif first_event == "TP1_HIT":
        result = "WORKED_TP1"
        result_r = 2.0
        closed = True
    else:
        result = "SESSION_CLOSE"
        closed = True
        if close_price is None and candles:
            close_price = float(candles[-1].get("close") or 0)
        if close_price is None:
            result_r = 0.0
        elif direction == "long":
            result_r = (float(close_price) - float(entry)) / float(risk)
        else:
            result_r = (float(entry) - float(close_price)) / float(risk)

    return {
        "ok": True,
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setupName": candidate.get("setupName"),
        "direction": direction,
        "sessionDate": candidate.get("sessionDate"),
        "entry": round(float(entry), 4),
        "stop": round(float(stop), 4),
        "tp1": round(float(tp1), 4),
        "tp2": round(float(tp2), 4) if tp2 is not None else None,
        "risk": round(float(risk), 4),
        "result": result,
        "firstEvent": first_event or "SESSION_CLOSE",
        "firstEventAt": first_event_at.isoformat() if isinstance(first_event_at, datetime) else None,
        "sessionCloseAt": session_close_ny.isoformat(),
        "resultR": round(float(result_r), 4),
        "mfeR": round(float(mfe_r), 4),
        "maeR": round(float(mae_r), 4),
        "closed": closed,
        "candlesChecked": len(candles or []),
        "qualityScore": candidate.get("qualityScore"),
        "score": candidate.get("score"),
        "grade": candidate.get("grade"),
        "qualityGate": candidate.get("qualityGate"),
        "futureLeakSafe": True,
        "policy": "conservative_same_candle_stop_first",
    }


def _s64_summary(outcomes: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(outcomes or [])
    worked = len([o for o in outcomes if str(o.get("result") or "").startswith("WORKED")])
    failed = len([o for o in outcomes if str(o.get("result") or "").startswith("FAILED")])
    session_close = len([o for o in outcomes if o.get("result") == "SESSION_CLOSE"])
    valid = [o for o in outcomes if _s62_num(o.get("resultR")) is not None]
    closed_decisive = worked + failed

    avg_r = round(sum(float(o.get("resultR") or 0) for o in valid) / len(valid), 4) if valid else 0.0
    win_rate_decisive = round(worked / closed_decisive * 100.0, 2) if closed_decisive else 0.0
    win_rate_all = round(worked / total * 100.0, 2) if total else 0.0
    avg_mfe = round(sum(float(o.get("mfeR") or 0) for o in outcomes) / total, 4) if total else 0.0
    avg_mae = round(sum(float(o.get("maeR") or 0) for o in outcomes) / total, 4) if total else 0.0

    by_result: dict[str, int] = {}
    by_setup: dict[str, dict[str, Any]] = {}
    for outcome in outcomes or []:
        result = str(outcome.get("result") or "UNKNOWN")
        by_result[result] = by_result.get(result, 0) + 1
        setup = str(outcome.get("setupSlug") or "unknown")
        row = by_setup.setdefault(setup, {"count": 0, "worked": 0, "failed": 0, "sessionClose": 0, "avgR": 0.0, "_r": []})
        row["count"] += 1
        if result.startswith("WORKED"):
            row["worked"] += 1
        elif result.startswith("FAILED"):
            row["failed"] += 1
        elif result == "SESSION_CLOSE":
            row["sessionClose"] += 1
        row["_r"].append(float(outcome.get("resultR") or 0))

    clean_by_setup: dict[str, Any] = {}
    for setup, row in by_setup.items():
        r_values = row.pop("_r", [])
        row["avgR"] = round(sum(r_values) / len(r_values), 4) if r_values else 0.0
        decisive = int(row.get("worked") or 0) + int(row.get("failed") or 0)
        row["winRateDecisive"] = round((int(row.get("worked") or 0) / decisive) * 100.0, 2) if decisive else 0.0
        clean_by_setup[setup] = row

    return {
        "total": total,
        "worked": worked,
        "failed": failed,
        "sessionClose": session_close,
        "winRateDecisive": win_rate_decisive,
        "winRateAll": win_rate_all,
        "avgResultR": avg_r,
        "avgMfeR": avg_mfe,
        "avgMaeR": avg_mae,
        "byResult": dict(sorted(by_result.items(), key=lambda pair: (-pair[1], pair[0]))),
        "bySetup": dict(sorted(clean_by_setup.items(), key=lambda pair: (-int(pair[1].get("count") or 0), pair[0]))),
    }


async def _s64_build_replay_outcomes(
    *,
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
) -> dict[str, Any]:
    date_key = _s61_date_key(session_date)
    safe_limit = max(1, min(int(limit or 80), 250))
    safe_max_candidates = max(1, min(int(max_candidates or 50), 200))

    cutoff_ny = _s62_cutoff_ny_datetime(date_key, cutoff_kyiv_time)
    close_ny = _s64_kyiv_to_ny_datetime(date_key, session_close_kyiv_time, "23:00")
    if close_ny <= cutoff_ny:
        close_ny = cutoff_ny + timedelta(hours=6, minutes=30)

    setup_payload = await _s63_build_historical_setup_replay(
        session_date=date_key,
        cutoff_kyiv_time=cutoff_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=safe_limit,
        max_candidates=safe_max_candidates,
        publish=True,
    )

    candidates = setup_payload.get("candidates") if isinstance(setup_payload.get("candidates"), list) else []

    client = FmpClient()
    outcomes: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    candle_cache: dict[str, list[dict[str, Any]]] = {}

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        symbol = _s62_symbol_key(candidate.get("symbol"))
        if not symbol:
            continue
        try:
            if symbol not in candle_cache:
                rows = await client.get_intraday_candles(symbol, interval=interval)
                timestamp_mode = None
                source_watch = candidate.get("sourceWatch") if isinstance(candidate.get("sourceWatch"), dict) else {}
                if isinstance(source_watch, dict):
                    timestamp_mode = source_watch.get("timestampMode")
                candle_cache[symbol] = _s64_future_candles(
                    rows,
                    session_date=date_key,
                    cutoff_ny=cutoff_ny,
                    close_ny=close_ny,
                    timestamp_mode=str(timestamp_mode or ""),
                )

            outcome = _s64_evaluate_candidate_outcome(candidate, candle_cache.get(symbol) or [], session_close_ny=close_ny)
            outcome["replayKey"] = _s64_outcome_key(candidate)
            outcomes.append(outcome)
        except Exception as error:
            errors.append({"symbol": symbol, "setupSlug": candidate.get("setupSlug"), "error": repr(error)})

    summary = _s64_summary(outcomes)

    payload = {
        "ok": True,
        "version": S64_REPLAY_OUTCOME_VERSION,
        "mode": "post_cutoff_replay_outcome_evaluation",
        "sessionDate": date_key,
        "cutoffKyivTime": cutoff_kyiv_time,
        "sessionCloseKyivTime": session_close_kyiv_time,
        "cutoffNy": cutoff_ny.isoformat(),
        "sessionCloseNy": close_ny.isoformat(),
        "interval": interval,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "futureLeakGuard": {
            "enabled": True,
            "candidateRule": "Candidates come from S6.3B point-in-time setup replay at or before cutoff.",
            "outcomeRule": "Outcomes use only candles after cutoff and up to session close.",
            "sameCandlePolicy": "If stop and target are both touched in one candle, count STOP first.",
            "limitation": "Entry is modeled at candidate entry after cutoff; full trigger-time replay comes in S6.4B/S6.5.",
        },
        "sourceSetups": {
            "version": setup_payload.get("version"),
            "counts": setup_payload.get("counts"),
            "sourceWatchlist": setup_payload.get("sourceWatchlist"),
        },
        "counts": {
            "candidateCount": len(candidates),
            "outcomeCount": len(outcomes),
            "errorCount": len(errors),
            "uniqueSymbols": len(candle_cache),
        },
        "summary": summary,
        "outcomes": outcomes,
        "errors": errors[:50],
        "learningInterpretation": {
            "canUseForCalibration": len(outcomes) > 0,
            "mainGap": "full_trigger_time_replay_not_enabled_yet",
            "nextStep": "S6.4B persist replay outcomes and S6.5 full candle trigger replay; then S7 calibration/re-ranking.",
        },
    }

    if publish:
        runtime_cache.set_json(f"{S64_OUTCOME_CACHE_PREFIX}:{date_key}", payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S64_OUTCOME_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/replay/outcomes")
async def engine_replay_outcomes(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
):
    payload = await _s64_build_replay_outcomes(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        session_close_kyiv_time=session_close_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S64_REPLAY_OUTCOME_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.post("/engine/replay/outcomes/run")
async def engine_replay_outcomes_run(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    publish: bool = True,
):
    payload = await _s64_build_replay_outcomes(
        session_date=session_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        session_close_kyiv_time=session_close_kyiv_time,
        symbols=symbols,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        publish=publish,
    )
    return {
        "ok": bool(payload.get("ok")),
        "value": payload,
        "storageVersion": S64_REPLAY_OUTCOME_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/outcomes/cache")
def engine_replay_outcomes_cache(session_date: str | None = None):
    key = f"{S64_OUTCOME_CACHE_PREFIX}:{_s61_date_key(session_date)}" if session_date else f"{S64_OUTCOME_CACHE_PREFIX}:latest"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S64_REPLAY_OUTCOME_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S6.4B Persist Replay Outcomes / calibration dataset adapter
# ---------------------------------------------------------------------------

S64B_PERSIST_REPLAY_OUTCOMES_VERSION = "s6_4b_persist_replay_outcomes_v1"


def _s64b_status_from_replay_result(result: str | None) -> str:
    raw = str(result or "").upper().strip()
    if raw.startswith("WORKED"):
        return "WORKED"
    if raw.startswith("FAILED") or raw in {"STOP_HIT", "AMBIGUOUS_STOP_FIRST"}:
        return "FAILED"
    if raw == "SESSION_CLOSE":
        return "EXPIRED_SESSION"
    if raw.startswith("INVALID"):
        return "INVALID"
    return "OPEN"


def _s64b_replay_outcome_to_storage_item(outcome: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(outcome, dict):
        return None

    symbol = _s62_symbol_key(outcome.get("symbol"))
    setup_slug = str(outcome.get("setupSlug") or "").strip()
    direction = str(outcome.get("direction") or "").lower().strip()
    session_date = _s61_date_key(outcome.get("sessionDate"))
    if not symbol or not setup_slug or direction not in {"long", "short"}:
        return None

    replay_key = str(outcome.get("replayKey") or "|".join([session_date, symbol, setup_slug, direction]))
    signal_id = f"replay:{session_date}:{symbol}:{setup_slug}:{direction}"

    result = str(outcome.get("result") or "").upper().strip()
    status = _s64b_status_from_replay_result(result)
    first_event = str(outcome.get("firstEvent") or "").upper().strip()

    return {
        "signalId": signal_id,
        "storageKey": signal_id,
        "replayKey": replay_key,
        "symbol": symbol,
        "setupSlug": setup_slug,
        "setupName": outcome.get("setupName"),
        "direction": direction,
        "status": status,
        "result": result,
        "resultR": outcome.get("resultR"),
        "mfeR": outcome.get("mfeR"),
        "maeR": outcome.get("maeR"),
        "tp1Hit": result in {"WORKED_TP1", "WORKED_TP2"} or first_event in {"TP1_HIT", "TP2_HIT"},
        "tp2Hit": result == "WORKED_TP2" or first_event == "TP2_HIT",
        "stopHit": status == "FAILED" or first_event in {"STOP_HIT", "AMBIGUOUS_STOP_FIRST"},
        "entry": outcome.get("entry"),
        "stop": outcome.get("stop"),
        "tp1": outcome.get("tp1"),
        "tp2": outcome.get("tp2"),
        "risk": outcome.get("risk"),
        "sessionDate": session_date,
        "triggerTime": outcome.get("sessionDate") or session_date,
        "firstEventAt": outcome.get("firstEventAt"),
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "candlesChecked": outcome.get("candlesChecked"),
        "signalGrade": outcome.get("grade"),
        "qualityStatus": "PASSED" if outcome.get("qualityGate", {}).get("passed") is True else "UNKNOWN",
        "qualityScore": outcome.get("qualityScore"),
        "score": outcome.get("score"),
        "premiumSignal": False,
        "telegramEligible": False,
        "source": "historical_replay",
        "sourceVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "replayOutcomeVersion": S64_REPLAY_OUTCOME_VERSION,
        "policy": outcome.get("policy"),
        "storedAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
    }


def _s64b_persist_replay_outcomes(outcomes: list[dict[str, Any]]) -> dict[str, Any]:
    stored = 0
    skipped = 0
    items: list[dict[str, Any]] = []

    for outcome in outcomes or []:
        item = _s64b_replay_outcome_to_storage_item(outcome)
        if not item:
            skipped += 1
            continue
        BACKTEST_OUTCOMES[str(item.get("signalId"))] = item
        db.upsert_outcome(item)
        items.append(item)
        stored += 1

    return {
        "stored": stored,
        "skipped": skipped,
        "items": items,
        "summary": build_outcome_summary(items),
        "statistics": build_outcome_statistics(items),
        "setupStatistics": build_setup_statistics(items),
        "database": db.get_status(),
        "storageVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
    }


def _s64b_load_persisted_replay_outcomes(session_date: str | None = None, limit: int = 5000) -> list[dict[str, Any]]:
    date_key = _s61_date_key(session_date) if session_date else None
    items = load_persistent_outcome_items(limit=limit)
    out = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("source") or "") != "historical_replay":
            continue
        if date_key and str(item.get("sessionDate") or "")[:10] != date_key:
            continue
        out.append(item)
    return out


@app.post("/engine/replay/outcomes/persist")
async def engine_replay_outcomes_persist(
    session_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    symbols: str | None = None,
    interval: str = "1min",
    limit: int = 80,
    max_candidates: int = 50,
    run_if_missing: bool = True,
    publish: bool = True,
):
    date_key = _s61_date_key(session_date)

    payload = None
    if not run_if_missing:
        payload = runtime_cache.get_json(f"{S64_OUTCOME_CACHE_PREFIX}:{date_key}")
    if not isinstance(payload, dict):
        payload = await _s64_build_replay_outcomes(
            session_date=date_key,
            cutoff_kyiv_time=cutoff_kyiv_time,
            session_close_kyiv_time=session_close_kyiv_time,
            symbols=symbols,
            interval=interval,
            limit=limit,
            max_candidates=max_candidates,
            publish=publish,
        )

    outcomes = payload.get("outcomes") if isinstance(payload.get("outcomes"), list) else []
    persisted = _s64b_persist_replay_outcomes(outcomes)

    result = {
        "ok": True,
        "version": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "sessionDate": date_key,
        "sourceReplayVersion": payload.get("version"),
        "sourceCounts": payload.get("counts"),
        "sourceSummary": payload.get("summary"),
        "persisted": {
            "stored": persisted.get("stored"),
            "skipped": persisted.get("skipped"),
            "summary": persisted.get("summary"),
            "statistics": persisted.get("statistics"),
            "setupStatistics": persisted.get("setupStatistics"),
            "database": persisted.get("database"),
        },
        "learningInterpretation": {
            "canUseForCalibration": int(persisted.get("stored") or 0) > 0,
            "nextStep": "S7 calibration/re-ranking can now read historical_replay outcomes from the normal outcome dataset.",
            "note": "Session-close replay outcomes are stored as EXPIRED_SESSION, not WORKED/FAILED, unless TP/STOP was hit.",
        },
    }

    if publish:
        runtime_cache.set_json(f"{S64_OUTCOME_CACHE_PREFIX}:persisted:{date_key}", result, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S64_OUTCOME_CACHE_PREFIX}:persisted:latest", result, ttl_seconds=14 * 24 * 60 * 60)

    return {
        "ok": True,
        "value": result,
        "storageVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/outcomes/persisted")
def engine_replay_outcomes_persisted(session_date: str | None = None, limit: int = 5000):
    items = _s64b_load_persisted_replay_outcomes(session_date=session_date, limit=limit)
    return {
        "ok": True,
        "version": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "sessionDate": _s61_date_key(session_date) if session_date else None,
        "count": len(items),
        "summary": build_outcome_summary(items),
        "statistics": build_outcome_statistics(items),
        "setupStatistics": build_setup_statistics(items),
        "items": items[:limit],
        "database": db.get_status(),
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/replay/outcomes/persist/cache")
def engine_replay_outcomes_persist_cache(session_date: str | None = None):
    date_key = _s61_date_key(session_date) if session_date else "latest"
    key = f"{S64_OUTCOME_CACHE_PREFIX}:persisted:{date_key}"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S7.1 Replay Calibration / Safe Re-ranking Report
# ---------------------------------------------------------------------------

S71_REPLAY_CALIBRATION_VERSION = "s7_1_replay_calibration_reranking_v1"
S71_REPLAY_CALIBRATION_CACHE_PREFIX = "engine:replay_calibration"


def _s71_pct(value: Any, fallback: float | None = None) -> float | None:
    return _s62_num(value, fallback)


def _s71_confidence(count: int, closed: int) -> str:
    if closed >= 30 and count >= 50:
        return "HIGH"
    if closed >= 10 and count >= 20:
        return "MEDIUM"
    if closed >= 3 and count >= 5:
        return "LOW"
    return "VERY_LOW"


def _s71_make_replay_adjustment(row: dict[str, Any], *, run_id: str, session_date: str, min_closed: int) -> dict[str, Any]:
    setup_slug = str(row.get("setupSlug") or "unknown")
    count = int(row.get("count") or 0)
    closed = int(row.get("closed") or 0)
    worked = int(row.get("worked") or 0)
    failed = int(row.get("failed") or 0)
    expired = int(row.get("expiredSession") or 0)
    win_rate = _s71_pct(row.get("winRateClosed"))
    avg_r = _s71_pct(row.get("avgResultRClosed"))
    stop_rate_closed = _s71_pct(row.get("stopRateClosed"))
    tp1_rate_closed = _s71_pct(row.get("tp1HitRateClosed"))
    avg_mfe = _s71_pct(row.get("avgMfeR"))
    avg_mae = _s71_pct(row.get("avgMaeR"))

    sample_confidence = _s71_confidence(count, closed)
    action = "OBSERVE"
    status = "INSUFFICIENT_SAMPLE"
    score_adjustment = 0
    strictness_adjustment = 0
    risk_adjustment = 0.0
    reasons: list[str] = []

    if closed >= min_closed:
        status = "ACTIVE_REPLAY_ADJUSTMENT"

        if (win_rate is not None and win_rate >= 70) and (avg_r is not None and avg_r >= 1.0):
            action = "BOOST"
            score_adjustment = 7
            strictness_adjustment = -1
            reasons.append("Replay shows strong win rate and high average R.")
        elif (win_rate is not None and win_rate >= 55) and (avg_r is not None and avg_r > 0):
            action = "SLIGHT_BOOST"
            score_adjustment = 3
            strictness_adjustment = 0
            reasons.append("Replay shows positive expectancy.")
        elif (failed >= max(2, worked + 1)) or (win_rate is not None and win_rate <= 35) or (avg_r is not None and avg_r < -0.25):
            action = "DEMOTE"
            score_adjustment = -7
            strictness_adjustment = 2
            reasons.append("Replay shows weak or negative expectancy.")
        else:
            action = "KEEP"
            reasons.append("Replay performance is mixed or neutral.")

        if stop_rate_closed is not None and stop_rate_closed >= 75:
            action = "TIGHTEN"
            score_adjustment = min(score_adjustment, -8)
            strictness_adjustment = max(strictness_adjustment, 2)
            risk_adjustment = -0.05
            reasons.append("High stop rate; require stronger confirmation or wider structural validation.")

        if expired > closed and avg_mfe is not None and avg_mfe >= 1.0:
            reasons.append("Many session-close outcomes with decent MFE; management/exit logic needs review.")
    else:
        reasons.append(f"Need at least {min_closed} closed replay outcomes before active re-ranking.")

        # Still surface strong warning for obviously bad tiny samples, but do not apply.
        if closed > 0 and failed == closed:
            action = "OBSERVE_NEGATIVE"
            score_adjustment = 0
            strictness_adjustment = 0
            reasons.append("Tiny sample is negative; watch closely before applying.")

    adjustment_key = f"replay:{setup_slug}:ALL"

    return {
        "adjustmentKey": adjustment_key,
        "setupSlug": setup_slug,
        "primaryTrigger": None,
        "scope": "historical_replay",
        "status": status,
        "action": action,
        "scoreAdjustment": int(score_adjustment),
        "strictnessAdjustment": int(strictness_adjustment),
        "riskAdjustment": float(risk_adjustment),
        "sampleConfidence": sample_confidence,
        "sampleCount": count,
        "closedCount": closed,
        "workedCount": worked,
        "failedCount": failed,
        "expiredSessionCount": expired,
        "winRateClosed": win_rate,
        "avgResultRClosed": avg_r,
        "stopRateClosed": stop_rate_closed,
        "tp1RateClosed": tp1_rate_closed,
        "avgMfeR": avg_mfe,
        "avgMaeR": avg_mae,
        "reason": " ".join(reasons),
        "runId": run_id,
        "validForSessionDate": session_date,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": S71_REPLAY_CALIBRATION_VERSION,
    }


def _s71_build_replay_calibration(
    *,
    session_date: str | None = None,
    limit: int = 5000,
    min_closed: int = 2,
    apply_adjustments: bool = False,
    publish: bool = True,
) -> dict[str, Any]:
    date_key = _s61_date_key(session_date)
    safe_min_closed = max(1, min(int(min_closed or 2), 50))
    items = _s64b_load_persisted_replay_outcomes(session_date=date_key, limit=limit)

    summary = build_outcome_summary(items)
    statistics = build_outcome_statistics(items)
    setup_stats = build_setup_statistics(items)

    run_id = f"replay_calibration:{date_key}:{datetime.now(timezone.utc).strftime('%H%M%S')}"
    adjustments = [
        _s71_make_replay_adjustment(row, run_id=run_id, session_date=date_key, min_closed=safe_min_closed)
        for row in setup_stats
        if isinstance(row, dict)
    ]

    active_adjustments = [a for a in adjustments if a.get("status") == "ACTIVE_REPLAY_ADJUSTMENT"]
    boosts = [a for a in adjustments if str(a.get("action") or "") in {"BOOST", "SLIGHT_BOOST"}]
    demotes = [a for a in adjustments if str(a.get("action") or "") in {"DEMOTE", "TIGHTEN"}]

    applied = {"enabled": bool(apply_adjustments), "count": 0, "items": []}
    if apply_adjustments:
        for adjustment in active_adjustments:
            db.upsert_setup_adjustment(adjustment)
            applied["items"].append(adjustment)
        applied["count"] = len(applied["items"])

    run = {
        "runId": run_id,
        "sessionDate": date_key,
        "source": "historical_replay",
        "sourceVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "outcomeCount": len(items),
        "closedCount": int(statistics.get("closed") or 0),
        "workedCount": int(statistics.get("worked") or 0),
        "failedCount": int(statistics.get("failed") or 0),
        "expiredSessionCount": int(statistics.get("expiredSession") or 0),
        "winRateClosed": _s71_pct(statistics.get("winRateClosed")),
        "avgResultRClosed": _s71_pct(statistics.get("avgResultRClosed")),
        "minClosedForActiveAdjustment": safe_min_closed,
        "adjustmentCount": len(adjustments),
        "activeAdjustmentCount": len(active_adjustments),
        "boostCount": len(boosts),
        "demoteCount": len(demotes),
        "applyAdjustments": bool(apply_adjustments),
        "status": "COMPLETED",
        "summary": summary,
        "statistics": statistics,
        "setupStatistics": setup_stats,
        "adjustments": adjustments,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": S71_REPLAY_CALIBRATION_VERSION,
    }

    # Store calibration run for audit. Applying adjustments remains separately gated.
    db.upsert_calibration_run(run)

    interpretation = {
        "readyForReRanking": len(active_adjustments) > 0,
        "applied": bool(apply_adjustments),
        "mainBoostCandidates": [a.get("setupSlug") for a in boosts],
        "mainDemoteCandidates": [a.get("setupSlug") for a in demotes],
        "notes": [
            "Replay calibration is sample-aware. Very small samples are reported but not applied unless minClosed is met.",
            "Use apply_adjustments=false until multiple days confirm the same setup behavior.",
            "S7.2 should combine forward outcomes + replay outcomes before production weighting.",
        ],
    }

    payload = {
        "ok": True,
        "version": S71_REPLAY_CALIBRATION_VERSION,
        "run": run,
        "applied": applied,
        "interpretation": interpretation,
        "database": db.get_status(),
        "cache": runtime_cache.get_status(),
    }

    if publish:
        runtime_cache.set_json(f"{S71_REPLAY_CALIBRATION_CACHE_PREFIX}:{date_key}", payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S71_REPLAY_CALIBRATION_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.get("/engine/replay/calibration")
def engine_replay_calibration(
    session_date: str | None = None,
    limit: int = 5000,
    min_closed: int = 2,
    apply_adjustments: bool = False,
    publish: bool = True,
):
    payload = _s71_build_replay_calibration(
        session_date=session_date,
        limit=limit,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        publish=publish,
    )
    return payload


@app.post("/engine/replay/calibration/run")
def engine_replay_calibration_run(
    session_date: str | None = None,
    limit: int = 5000,
    min_closed: int = 2,
    apply_adjustments: bool = False,
    publish: bool = True,
):
    payload = _s71_build_replay_calibration(
        session_date=session_date,
        limit=limit,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        publish=publish,
    )
    return payload


@app.get("/engine/replay/calibration/cache")
def engine_replay_calibration_cache(session_date: str | None = None):
    key = f"{S71_REPLAY_CALIBRATION_CACHE_PREFIX}:{_s61_date_key(session_date)}" if session_date else f"{S71_REPLAY_CALIBRATION_CACHE_PREFIX}:latest"
    payload = runtime_cache.get_json(key)
    return {
        "ok": isinstance(payload, dict),
        "key": key,
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S71_REPLAY_CALIBRATION_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S7.2 Multi-day Replay Runner / aggregate calibration
# ---------------------------------------------------------------------------

S72_MULTIDAY_REPLAY_VERSION = "s7_2_multiday_replay_runner_v1"
S72_MULTIDAY_REPLAY_CACHE_PREFIX = "engine:historical_replay_multiday"


def _s72_parse_session_dates(session_dates: str | None = None, *, start_date: str | None = None, end_date: str | None = None, max_days: int = 5) -> list[str]:
    safe_max_days = max(1, min(int(max_days or 5), 20))

    if session_dates:
        out: list[str] = []
        for part in str(session_dates).replace(";", ",").split(","):
            value = str(part or "").strip()
            if not value:
                continue
            date_key = _s61_date_key(value)
            if date_key not in out:
                out.append(date_key)
            if len(out) >= safe_max_days:
                break
        return out

    if start_date and end_date:
        start = datetime.fromisoformat(_s61_date_key(start_date)).date()
        end = datetime.fromisoformat(_s61_date_key(end_date)).date()
        if end < start:
            start, end = end, start
        out: list[str] = []
        current = start
        while current <= end and len(out) < safe_max_days:
            if current.weekday() < 5:
                out.append(current.isoformat())
            current = current + timedelta(days=1)
        return out

    return [_s61_date_key(None)]


def _s72_filter_replay_items_for_dates(dates: list[str], *, limit: int = 20000) -> list[dict[str, Any]]:
    date_set = set(dates)
    items = load_persistent_outcome_items(limit=limit)
    out: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("source") or "") != "historical_replay":
            continue
        date_key = str(item.get("sessionDate") or "")[:10]
        if date_key in date_set:
            out.append(item)
    return out


def _s72_aggregate_adjustments(items: list[dict[str, Any]], *, dates: list[str], min_closed: int, run_id: str) -> list[dict[str, Any]]:
    setup_stats = build_setup_statistics(items)
    label = f"multi:{dates[0]}..{dates[-1]}" if dates else "multi"
    adjustments = []
    for row in setup_stats:
        if not isinstance(row, dict):
            continue
        adjustment = _s71_make_replay_adjustment(row, run_id=run_id, session_date=label, min_closed=min_closed)
        adjustment["scope"] = "historical_replay_multiday"
        adjustment["dateCount"] = len(dates)
        adjustment["sessionDates"] = dates
        adjustment["storageVersion"] = S72_MULTIDAY_REPLAY_VERSION
        adjustments.append(adjustment)
    return adjustments


def _s72_day_status_from_result(date_key: str, replay_payload: dict[str, Any] | None, persisted: dict[str, Any] | None, error: str | None = None) -> dict[str, Any]:
    return {
        "sessionDate": date_key,
        "ok": error is None,
        "error": error,
        "replayVersion": replay_payload.get("version") if isinstance(replay_payload, dict) else None,
        "replayCounts": replay_payload.get("counts") if isinstance(replay_payload, dict) else None,
        "replaySummary": replay_payload.get("summary") if isinstance(replay_payload, dict) else None,
        "persistedStored": persisted.get("stored") if isinstance(persisted, dict) else None,
        "persistedSkipped": persisted.get("skipped") if isinstance(persisted, dict) else None,
    }


async def _s72_build_multiday_replay(
    *,
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    interval: str = "1min",
    limit: int = 50,
    max_candidates: int = 50,
    min_closed: int = 5,
    apply_adjustments: bool = False,
    run_replay: bool = True,
    max_days: int = 5,
    publish: bool = True,
) -> dict[str, Any]:
    dates = _s72_parse_session_dates(session_dates, start_date=start_date, end_date=end_date, max_days=max_days)
    safe_limit = max(1, min(int(limit or 50), 250))
    safe_max_candidates = max(1, min(int(max_candidates or 50), 200))
    safe_min_closed = max(1, min(int(min_closed or 5), 100))

    day_results: list[dict[str, Any]] = []

    if run_replay:
        for date_key in dates:
            try:
                replay_payload = await _s64_build_replay_outcomes(
                    session_date=date_key,
                    cutoff_kyiv_time=cutoff_kyiv_time,
                    session_close_kyiv_time=session_close_kyiv_time,
                    symbols=None,
                    interval=interval,
                    limit=safe_limit,
                    max_candidates=safe_max_candidates,
                    publish=publish,
                )
                outcomes = replay_payload.get("outcomes") if isinstance(replay_payload.get("outcomes"), list) else []
                persisted = _s64b_persist_replay_outcomes(outcomes)
                day_results.append(_s72_day_status_from_result(date_key, replay_payload, persisted))
            except Exception as error:
                day_results.append(_s72_day_status_from_result(date_key, None, None, error=repr(error)))

    items = _s72_filter_replay_items_for_dates(dates)
    summary = build_outcome_summary(items)
    statistics = build_outcome_statistics(items)
    setup_stats = build_setup_statistics(items)

    run_id = f"multiday_replay:{dates[0] if dates else 'none'}:{dates[-1] if dates else 'none'}:{datetime.now(timezone.utc).strftime('%H%M%S')}"
    adjustments = _s72_aggregate_adjustments(items, dates=dates, min_closed=safe_min_closed, run_id=run_id)
    active_adjustments = [a for a in adjustments if a.get("status") == "ACTIVE_REPLAY_ADJUSTMENT"]
    boosts = [a for a in adjustments if str(a.get("action") or "") in {"BOOST", "SLIGHT_BOOST"}]
    demotes = [a for a in adjustments if str(a.get("action") or "") in {"DEMOTE", "TIGHTEN"}]

    applied = {"enabled": bool(apply_adjustments), "count": 0, "items": []}
    if apply_adjustments:
        for adjustment in active_adjustments:
            db.upsert_setup_adjustment(adjustment)
            applied["items"].append(adjustment)
        applied["count"] = len(applied["items"])

    run = {
        "runId": run_id,
        "sessionDates": dates,
        "dateCount": len(dates),
        "source": "historical_replay_multiday",
        "sourceVersion": S64B_PERSIST_REPLAY_OUTCOMES_VERSION,
        "runReplay": bool(run_replay),
        "dayResults": day_results,
        "outcomeCount": len(items),
        "closedCount": int(statistics.get("closed") or 0),
        "workedCount": int(statistics.get("worked") or 0),
        "failedCount": int(statistics.get("failed") or 0),
        "expiredSessionCount": int(statistics.get("expiredSession") or 0),
        "winRateClosed": _s71_pct(statistics.get("winRateClosed")),
        "avgResultRClosed": _s71_pct(statistics.get("avgResultRClosed")),
        "minClosedForActiveAdjustment": safe_min_closed,
        "adjustmentCount": len(adjustments),
        "activeAdjustmentCount": len(active_adjustments),
        "boostCount": len(boosts),
        "demoteCount": len(demotes),
        "applyAdjustments": bool(apply_adjustments),
        "summary": summary,
        "statistics": statistics,
        "setupStatistics": setup_stats,
        "adjustments": adjustments,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": S72_MULTIDAY_REPLAY_VERSION,
        "status": "COMPLETED",
    }

    db.upsert_calibration_run(run)

    interpretation = {
        "readyForControlledApply": len(dates) >= 3 and int(statistics.get("closed") or 0) >= safe_min_closed and len(active_adjustments) > 0,
        "applied": bool(apply_adjustments),
        "mainBoostCandidates": [a.get("setupSlug") for a in boosts],
        "mainDemoteCandidates": [a.get("setupSlug") for a in demotes],
        "notes": [
            "S7.2 aggregates persisted historical_replay outcomes across multiple dates.",
            "Keep apply_adjustments=false until the same recommendations repeat across several days.",
            "S7.3 should merge replay calibration with live forward-test outcomes before production weighting.",
        ],
    }

    payload = {
        "ok": True,
        "version": S72_MULTIDAY_REPLAY_VERSION,
        "run": run,
        "applied": applied,
        "interpretation": interpretation,
        "database": db.get_status(),
        "cache": runtime_cache.get_status(),
    }

    if publish:
        cache_key = f"{S72_MULTIDAY_REPLAY_CACHE_PREFIX}:{dates[0] if dates else 'none'}:{dates[-1] if dates else 'none'}"
        runtime_cache.set_json(cache_key, payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S72_MULTIDAY_REPLAY_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.post("/engine/replay/multiday/run")
async def engine_replay_multiday_run(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    interval: str = "1min",
    limit: int = 50,
    max_candidates: int = 50,
    min_closed: int = 5,
    apply_adjustments: bool = False,
    run_replay: bool = True,
    max_days: int = 5,
    publish: bool = True,
):
    return await _s72_build_multiday_replay(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        session_close_kyiv_time=session_close_kyiv_time,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        run_replay=run_replay,
        max_days=max_days,
        publish=publish,
    )


@app.get("/engine/replay/multiday")
async def engine_replay_multiday(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    cutoff_kyiv_time: str = "17:00",
    session_close_kyiv_time: str = "23:00",
    interval: str = "1min",
    limit: int = 50,
    max_candidates: int = 50,
    min_closed: int = 5,
    apply_adjustments: bool = False,
    run_replay: bool = False,
    max_days: int = 5,
    publish: bool = True,
):
    return await _s72_build_multiday_replay(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        cutoff_kyiv_time=cutoff_kyiv_time,
        session_close_kyiv_time=session_close_kyiv_time,
        interval=interval,
        limit=limit,
        max_candidates=max_candidates,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        run_replay=run_replay,
        max_days=max_days,
        publish=publish,
    )


@app.get("/engine/replay/multiday/cache")
def engine_replay_multiday_cache():
    payload = runtime_cache.get_json(f"{S72_MULTIDAY_REPLAY_CACHE_PREFIX}:latest")
    return {
        "ok": isinstance(payload, dict),
        "key": f"{S72_MULTIDAY_REPLAY_CACHE_PREFIX}:latest",
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S72_MULTIDAY_REPLAY_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S7.3 Hybrid Calibration / replay + forward outcome merge
# ---------------------------------------------------------------------------

S73_HYBRID_CALIBRATION_VERSION = "s7_3_hybrid_calibration_merge_v1"
S73_HYBRID_CALIBRATION_CACHE_PREFIX = "engine:hybrid_calibration"


def _s73_item_date(item: dict[str, Any]) -> str:
    for key in ("sessionDate", "session_date", "triggerTime", "createdAt", "evaluatedAt", "storedAt", "firstEventAt"):
        value = item.get(key)
        if value:
            return str(value)[:10]
    return ""


def _s73_is_replay_item(item: dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    if str(item.get("source") or "") == "historical_replay":
        return True
    if str(item.get("signalId") or "").startswith("replay:"):
        return True
    return False


def _s73_filter_items_by_dates(items: list[dict[str, Any]], dates: list[str], *, source_mode: str) -> list[dict[str, Any]]:
    date_set = set(dates)
    mode = str(source_mode or "hybrid").lower().strip()
    out: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        date_key = _s73_item_date(item)
        if dates and date_key not in date_set:
            continue

        if _s810e_is_no_eval_late_session(item):
            continue

        is_replay = _s73_is_replay_item(item)
        if mode == "replay" and not is_replay:
            continue
        if mode == "forward" and is_replay:
            continue
        out.append(item)
    return out


def _s73_group_items_by_setup(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        setup_slug = str(item.get("setupSlug") or "unknown")
        grouped.setdefault(setup_slug, []).append(item)
    return grouped


def _s73_source_breakdown(items: list[dict[str, Any]]) -> dict[str, Any]:
    replay_items = [item for item in items or [] if _s73_is_replay_item(item)]
    forward_items = [item for item in items or [] if not _s73_is_replay_item(item)]
    replay_stats = build_outcome_statistics(replay_items)
    forward_stats = build_outcome_statistics(forward_items)
    return {
        "replayCount": len(replay_items),
        "forwardCount": len(forward_items),
        "replayClosed": int(replay_stats.get("closed") or 0),
        "forwardClosed": int(forward_stats.get("closed") or 0),
        "replayWinRateClosed": replay_stats.get("winRateClosed"),
        "forwardWinRateClosed": forward_stats.get("winRateClosed"),
        "replayAvgResultRClosed": replay_stats.get("avgResultRClosed"),
        "forwardAvgResultRClosed": forward_stats.get("avgResultRClosed"),
    }


def _s73_make_hybrid_adjustment(
    row: dict[str, Any],
    *,
    source_items: list[dict[str, Any]],
    run_id: str,
    date_label: str,
    min_closed: int,
) -> dict[str, Any]:
    base = _s71_make_replay_adjustment(row, run_id=run_id, session_date=date_label, min_closed=min_closed)
    source_breakdown = _s73_source_breakdown(source_items)

    closed = int(row.get("closed") or 0)
    count = int(row.get("count") or 0)
    win_rate = _s71_pct(row.get("winRateClosed"))
    avg_r = _s71_pct(row.get("avgResultRClosed"))
    expired_rate = _s71_pct(row.get("expiredRateAll"))
    stop_rate = _s71_pct(row.get("stopRateClosed"))
    replay_closed = int(source_breakdown.get("replayClosed") or 0)
    forward_closed = int(source_breakdown.get("forwardClosed") or 0)

    # Hybrid confidence is stricter than single-day replay. It wants either
    # multiple dates or meaningful closed sample before recommending apply.
    if closed >= 30 and count >= 50 and replay_closed >= 10:
        hybrid_confidence = "HIGH"
    elif closed >= 15 and count >= 25 and replay_closed >= 5:
        hybrid_confidence = "MEDIUM"
    elif closed >= min_closed and count >= min_closed:
        hybrid_confidence = "LOW"
    else:
        hybrid_confidence = "VERY_LOW"

    action = str(base.get("action") or "OBSERVE")
    status = str(base.get("status") or "INSUFFICIENT_SAMPLE")
    reasons = [str(base.get("reason") or "").strip()] if base.get("reason") else []

    # If replay says one thing but forward evidence is absent, keep it report-only.
    if forward_closed == 0 and replay_closed < max(5, min_closed):
        status = "INSUFFICIENT_HYBRID_SAMPLE"
        if action in {"BOOST", "SLIGHT_BOOST", "DEMOTE", "TIGHTEN"}:
            action = "OBSERVE_" + action
        reasons.append("Hybrid calibration has too little forward/live evidence for controlled apply.")

    # If many outcomes are session-close, prefer management review rather than score change.
    if expired_rate is not None and expired_rate >= 50 and action in {"BOOST", "SLIGHT_BOOST"}:
        action = "OBSERVE_MANAGEMENT"
        status = "MANAGEMENT_REVIEW"
        base["scoreAdjustment"] = 0
        base["strictnessAdjustment"] = 0
        reasons.append("High session-close rate; review exit/management before boosting setup weight.")

    # Explicitly protect from applying very-low confidence signals.
    if hybrid_confidence == "VERY_LOW" and status == "ACTIVE_REPLAY_ADJUSTMENT":
        status = "REPORT_ONLY_LOW_CONFIDENCE"
        reasons.append("Sample confidence is VERY_LOW, so this remains report-only.")

    base.update({
        "scope": "hybrid_replay_forward",
        "status": status,
        "action": action,
        "sampleConfidence": hybrid_confidence,
        "sourceBreakdown": source_breakdown,
        "replayClosedCount": replay_closed,
        "forwardClosedCount": forward_closed,
        "dateLabel": date_label,
        "reason": " ".join([r for r in reasons if r]),
        "storageVersion": S73_HYBRID_CALIBRATION_VERSION,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    })

    # Final guard: only allow active apply when source evidence is not tiny.
    if status in {"ACTIVE_REPLAY_ADJUSTMENT"} and (closed < min_closed or hybrid_confidence == "VERY_LOW"):
        base["status"] = "REPORT_ONLY_LOW_CONFIDENCE"
        base["reason"] = (str(base.get("reason") or "") + " Final guard blocked active apply.").strip()

    return base


def _s73_build_hybrid_calibration(
    *,
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    apply_adjustments: bool = False,
    publish: bool = True,
    max_days: int = 10,
) -> dict[str, Any]:
    dates = _s72_parse_session_dates(session_dates, start_date=start_date, end_date=end_date, max_days=max_days)
    safe_min_closed = max(1, min(int(min_closed or 10), 100))
    mode = str(source_mode or "hybrid").lower().strip()
    if mode not in {"hybrid", "replay", "forward"}:
        mode = "hybrid"

    all_items = load_persistent_outcome_items(limit=limit)
    items = _s73_filter_items_by_dates(all_items, dates, source_mode=mode)
    summary = build_outcome_summary(items)
    statistics = build_outcome_statistics(items)
    setup_stats = build_setup_statistics(items)

    grouped = _s73_group_items_by_setup(items)
    date_label = f"hybrid:{dates[0]}..{dates[-1]}" if dates else "hybrid"
    run_id = f"hybrid_calibration:{dates[0] if dates else 'none'}:{dates[-1] if dates else 'none'}:{datetime.now(timezone.utc).strftime('%H%M%S')}"

    adjustments = [
        _s73_make_hybrid_adjustment(
            row,
            source_items=grouped.get(str(row.get("setupSlug") or "unknown"), []),
            run_id=run_id,
            date_label=date_label,
            min_closed=safe_min_closed,
        )
        for row in setup_stats
        if isinstance(row, dict)
    ]

    active_adjustments = [a for a in adjustments if a.get("status") == "ACTIVE_REPLAY_ADJUSTMENT"]
    boosts = [a for a in adjustments if str(a.get("action") or "") in {"BOOST", "SLIGHT_BOOST"}]
    demotes = [a for a in adjustments if str(a.get("action") or "") in {"DEMOTE", "TIGHTEN"}]

    applied = {"enabled": bool(apply_adjustments), "count": 0, "items": []}
    if apply_adjustments:
        for adjustment in active_adjustments:
            db.upsert_setup_adjustment(adjustment)
            applied["items"].append(adjustment)
        applied["count"] = len(applied["items"])

    source_breakdown = _s73_source_breakdown(items)

    run = {
        "runId": run_id,
        "sessionDates": dates,
        "dateCount": len(dates),
        "source": mode,
        "sourceVersion": S73_HYBRID_CALIBRATION_VERSION,
        "outcomeCount": len(items),
        "closedCount": int(statistics.get("closed") or 0),
        "workedCount": int(statistics.get("worked") or 0),
        "failedCount": int(statistics.get("failed") or 0),
        "expiredSessionCount": int(statistics.get("expiredSession") or 0),
        "winRateClosed": _s71_pct(statistics.get("winRateClosed")),
        "avgResultRClosed": _s71_pct(statistics.get("avgResultRClosed")),
        "minClosedForActiveAdjustment": safe_min_closed,
        "sourceBreakdown": source_breakdown,
        "adjustmentCount": len(adjustments),
        "activeAdjustmentCount": len(active_adjustments),
        "boostCount": len(boosts),
        "demoteCount": len(demotes),
        "applyAdjustments": bool(apply_adjustments),
        "summary": summary,
        "statistics": statistics,
        "setupStatistics": setup_stats,
        "adjustments": adjustments,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "storageVersion": S73_HYBRID_CALIBRATION_VERSION,
        "status": "COMPLETED",
    }

    db.upsert_calibration_run(run)

    interpretation = {
        "readyForProductionWeighting": len(active_adjustments) > 0 and int(statistics.get("closed") or 0) >= safe_min_closed and len(dates) >= 3,
        "applied": bool(apply_adjustments),
        "mainBoostCandidates": [a.get("setupSlug") for a in boosts],
        "mainDemoteCandidates": [a.get("setupSlug") for a in demotes],
        "sourceWarning": "Hybrid mode can include older non-replay outcomes. Use sourceBreakdown before trusting production weighting.",
        "notes": [
            "S7.3 merges replay and non-replay outcome evidence for a safer calibration view.",
            "This is still report-first. Keep apply_adjustments=false until dateCount>=3 and recommendations repeat.",
            "Next: S7.4 controlled adjustment preview in Cockpit/Reports, then optional apply gate.",
        ],
    }

    payload = {
        "ok": True,
        "version": S73_HYBRID_CALIBRATION_VERSION,
        "run": run,
        "applied": applied,
        "interpretation": interpretation,
        "database": db.get_status(),
        "cache": runtime_cache.get_status(),
    }

    if publish:
        cache_key = f"{S73_HYBRID_CALIBRATION_CACHE_PREFIX}:{mode}:{dates[0] if dates else 'none'}:{dates[-1] if dates else 'none'}"
        runtime_cache.set_json(cache_key, payload, ttl_seconds=14 * 24 * 60 * 60)
        runtime_cache.set_json(f"{S73_HYBRID_CALIBRATION_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.post("/engine/calibration/hybrid/run")
def engine_calibration_hybrid_run(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    apply_adjustments: bool = False,
    publish: bool = True,
    max_days: int = 10,
):
    return _s73_build_hybrid_calibration(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        source_mode=source_mode,
        limit=limit,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        publish=publish,
        max_days=max_days,
    )


@app.get("/engine/calibration/hybrid")
def engine_calibration_hybrid(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    apply_adjustments: bool = False,
    publish: bool = True,
    max_days: int = 10,
):
    return _s73_build_hybrid_calibration(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        source_mode=source_mode,
        limit=limit,
        min_closed=min_closed,
        apply_adjustments=apply_adjustments,
        publish=publish,
        max_days=max_days,
    )


@app.get("/engine/calibration/hybrid/cache")
def engine_calibration_hybrid_cache():
    payload = runtime_cache.get_json(f"{S73_HYBRID_CALIBRATION_CACHE_PREFIX}:latest")
    return {
        "ok": isinstance(payload, dict),
        "key": f"{S73_HYBRID_CALIBRATION_CACHE_PREFIX}:latest",
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S73_HYBRID_CALIBRATION_VERSION,
        "cache": runtime_cache.get_status(),
    }


# ---------------------------------------------------------------------------
# S7.4 Controlled Adjustment Preview / report-only apply gate
# ---------------------------------------------------------------------------

S74_CONTROLLED_PREVIEW_VERSION = "s7_4_controlled_adjustment_preview_v1"
S74_CONTROLLED_PREVIEW_CACHE_PREFIX = "engine:controlled_adjustment_preview"


def _s74_action_label(action: str | None) -> str:
    raw = str(action or "OBSERVE").upper().strip()
    labels = {
        "BOOST": "boost_setup_weight",
        "SLIGHT_BOOST": "slight_boost_setup_weight",
        "DEMOTE": "demote_setup_weight",
        "TIGHTEN": "tighten_confirmation_gate",
        "KEEP": "keep_current_weight",
        "OBSERVE": "observe_only",
        "OBSERVE_NEGATIVE": "observe_negative",
        "OBSERVE_BOOST": "observe_potential_boost",
        "OBSERVE_SLIGHT_BOOST": "observe_potential_slight_boost",
        "OBSERVE_DEMOTE": "observe_potential_demote",
        "OBSERVE_TIGHTEN": "observe_potential_tighten",
        "OBSERVE_MANAGEMENT": "management_review",
    }
    return labels.get(raw, raw.lower())


def _s74_preview_row(adjustment: dict[str, Any], *, global_blockers: list[str]) -> dict[str, Any]:
    setup_slug = str(adjustment.get("setupSlug") or "unknown")
    status = str(adjustment.get("status") or "UNKNOWN")
    action = str(adjustment.get("action") or "OBSERVE")
    sample_confidence = str(adjustment.get("sampleConfidence") or "UNKNOWN")
    closed = int(adjustment.get("closedCount") or 0)
    worked = int(adjustment.get("workedCount") or 0)
    failed = int(adjustment.get("failedCount") or 0)
    sample = int(adjustment.get("sampleCount") or 0)

    block_reasons = list(global_blockers)
    if status != "ACTIVE_REPLAY_ADJUSTMENT":
        block_reasons.append(f"status_{status.lower()}")
    if sample_confidence in {"VERY_LOW", "UNKNOWN"}:
        block_reasons.append("sample_confidence_too_low")
    if closed < 10:
        block_reasons.append("closed_sample_below_10")
    if action.upper().startswith("OBSERVE"):
        block_reasons.append("action_is_report_only")

    would_apply = len(block_reasons) == 0 and action in {"BOOST", "SLIGHT_BOOST", "DEMOTE", "TIGHTEN", "KEEP"}

    if would_apply:
        apply_state = "READY_FOR_CONTROLLED_APPLY"
    elif action.upper() in {"DEMOTE", "TIGHTEN", "OBSERVE_NEGATIVE"} or failed > worked:
        apply_state = "BLOCKED_NEGATIVE_WATCH"
    elif action.upper() in {"BOOST", "SLIGHT_BOOST", "OBSERVE_BOOST", "OBSERVE_SLIGHT_BOOST"}:
        apply_state = "BLOCKED_POSITIVE_WATCH"
    else:
        apply_state = "OBSERVE_ONLY"

    source_breakdown = adjustment.get("sourceBreakdown") if isinstance(adjustment.get("sourceBreakdown"), dict) else {}

    return {
        "setupSlug": setup_slug,
        "action": action,
        "actionLabel": _s74_action_label(action),
        "status": status,
        "applyState": apply_state,
        "wouldApply": bool(would_apply),
        "blockReasons": sorted(set(block_reasons)),
        "sampleConfidence": sample_confidence,
        "sampleCount": sample,
        "closedCount": closed,
        "workedCount": worked,
        "failedCount": failed,
        "expiredSessionCount": int(adjustment.get("expiredSessionCount") or 0),
        "winRateClosed": adjustment.get("winRateClosed"),
        "avgResultRClosed": adjustment.get("avgResultRClosed"),
        "avgMfeR": adjustment.get("avgMfeR"),
        "avgMaeR": adjustment.get("avgMaeR"),
        "sourceBreakdown": source_breakdown,
        "proposedEngineEffect": {
            "scoreAdjustment": int(adjustment.get("scoreAdjustment") or 0),
            "strictnessAdjustment": int(adjustment.get("strictnessAdjustment") or 0),
            "riskAdjustment": float(adjustment.get("riskAdjustment") or 0.0),
            "willBeApplied": bool(would_apply),
            "dryRunOnly": not bool(would_apply),
        },
        "ui": {
            "badge": "READY" if would_apply else ("NEGATIVE WATCH" if "NEGATIVE" in apply_state else "OBSERVE"),
            "tone": "positive" if action in {"BOOST", "SLIGHT_BOOST"} else ("negative" if action in {"DEMOTE", "TIGHTEN", "OBSERVE_NEGATIVE"} else "neutral"),
            "headline": f"{setup_slug}: {_s74_action_label(action)}",
        },
        "reason": adjustment.get("reason"),
    }


def _s74_build_controlled_preview(
    *,
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    max_days: int = 10,
    publish: bool = True,
) -> dict[str, Any]:
    calibration = _s73_build_hybrid_calibration(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        source_mode=source_mode,
        limit=limit,
        min_closed=min_closed,
        apply_adjustments=False,
        publish=publish,
        max_days=max_days,
    )

    run = calibration.get("run") if isinstance(calibration.get("run"), dict) else {}
    interpretation = calibration.get("interpretation") if isinstance(calibration.get("interpretation"), dict) else {}
    adjustments = run.get("adjustments") if isinstance(run.get("adjustments"), list) else []
    source_breakdown = run.get("sourceBreakdown") if isinstance(run.get("sourceBreakdown"), dict) else {}

    global_blockers: list[str] = []
    if int(run.get("dateCount") or 0) < 3:
        global_blockers.append("date_count_below_3")
    if int(run.get("closedCount") or 0) < int(run.get("minClosedForActiveAdjustment") or min_closed or 10):
        global_blockers.append("closed_count_below_min_closed")
    if int(source_breakdown.get("replayClosed") or 0) < 10:
        global_blockers.append("replay_closed_below_10")
    if source_mode == "hybrid" and int(source_breakdown.get("forwardClosed") or 0) < 10:
        global_blockers.append("forward_closed_below_10")
    if interpretation.get("readyForProductionWeighting") is not True:
        global_blockers.append("hybrid_not_ready_for_production_weighting")

    preview_rows = [_s74_preview_row(adjustment, global_blockers=global_blockers) for adjustment in adjustments]
    ready_rows = [row for row in preview_rows if row.get("wouldApply") is True]
    blocked_rows = [row for row in preview_rows if row.get("wouldApply") is not True]
    negative_watch = [row for row in preview_rows if row.get("applyState") == "BLOCKED_NEGATIVE_WATCH"]
    positive_watch = [row for row in preview_rows if row.get("applyState") == "BLOCKED_POSITIVE_WATCH"]

    payload = {
        "ok": True,
        "version": S74_CONTROLLED_PREVIEW_VERSION,
        "sourceCalibrationVersion": calibration.get("version"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "report_only_controlled_adjustment_preview",
        "applyAdjustments": False,
        "safety": {
            "engineMutationAllowed": False,
            "reason": "S7.4 is a dry-run preview. It never calls db.upsert_setup_adjustment().",
            "globalBlockers": sorted(set(global_blockers)),
        },
        "run": {
            "sessionDates": run.get("sessionDates"),
            "dateCount": run.get("dateCount"),
            "source": run.get("source"),
            "outcomeCount": run.get("outcomeCount"),
            "closedCount": run.get("closedCount"),
            "workedCount": run.get("workedCount"),
            "failedCount": run.get("failedCount"),
            "expiredSessionCount": run.get("expiredSessionCount"),
            "winRateClosed": run.get("winRateClosed"),
            "avgResultRClosed": run.get("avgResultRClosed"),
            "sourceBreakdown": source_breakdown,
            "adjustmentCount": len(adjustments),
            "readyToApplyCount": len(ready_rows),
            "blockedCount": len(blocked_rows),
            "negativeWatchCount": len(negative_watch),
            "positiveWatchCount": len(positive_watch),
        },
        "previewRows": preview_rows,
        "readyToApplyRows": ready_rows,
        "blockedRows": blocked_rows,
        "negativeWatchRows": negative_watch,
        "positiveWatchRows": positive_watch,
        "cockpitSummary": {
            "title": "Controlled calibration preview",
            "state": "REPORT_ONLY" if not ready_rows else "READY_BUT_NOT_APPLIED",
            "topWarnings": [row.get("setupSlug") for row in negative_watch[:5]],
            "topPotentialBoosts": [row.get("setupSlug") for row in positive_watch[:5]],
            "copy": "No engine weights were changed. This preview exists for Cockpit/Reports visibility before any future apply gate.",
        },
        "interpretation": {
            "readyForControlledApply": len(ready_rows) > 0,
            "applied": False,
            "nextStep": "S7.5 UI surface for this preview in Cockpit/Reports, then explicit apply gate after 3-5 replay days.",
            "notes": [
                "S7.4 intentionally blocks automatic changes.",
                "Rows with OBSERVE/INSUFFICIENT_* are useful warnings, not engine mutations.",
                "Do not enable apply until dateCount>=3, replayClosed>=10 and forwardClosed>=10 in hybrid mode.",
            ],
        },
        "database": db.get_status(),
        "cache": runtime_cache.get_status(),
    }

    if publish:
        runtime_cache.set_json(f"{S74_CONTROLLED_PREVIEW_CACHE_PREFIX}:latest", payload, ttl_seconds=14 * 24 * 60 * 60)

    return payload


@app.post("/engine/calibration/preview/run")
def engine_calibration_preview_run(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    publish: bool = True,
    max_days: int = 10,
):
    return _s74_build_controlled_preview(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        source_mode=source_mode,
        limit=limit,
        min_closed=min_closed,
        max_days=max_days,
        publish=publish,
    )


@app.get("/engine/calibration/preview")
def engine_calibration_preview(
    session_dates: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    source_mode: str = "hybrid",
    limit: int = 20000,
    min_closed: int = 10,
    publish: bool = True,
    max_days: int = 10,
):
    return _s74_build_controlled_preview(
        session_dates=session_dates,
        start_date=start_date,
        end_date=end_date,
        source_mode=source_mode,
        limit=limit,
        min_closed=min_closed,
        max_days=max_days,
        publish=publish,
    )


@app.get("/engine/calibration/preview/cache")
def engine_calibration_preview_cache():
    payload = runtime_cache.get_json(f"{S74_CONTROLLED_PREVIEW_CACHE_PREFIX}:latest")
    return {
        "ok": isinstance(payload, dict),
        "key": f"{S74_CONTROLLED_PREVIEW_CACHE_PREFIX}:latest",
        "value": payload if isinstance(payload, dict) else None,
        "storageVersion": S74_CONTROLLED_PREVIEW_VERSION,
        "cache": runtime_cache.get_status(),
    }

# === /S7.4 ==================================================================


# === /S7.3 ==================================================================


# === /S7.2 ==================================================================


# === /S7.1 ==================================================================


# === /S6.4B ==================================================================


# === /S6.4 ==================================================================


# === /S6.3 ==================================================================


# === /S6.2 ==================================================================


# === /S6.1 ==================================================================


# === /S5.15 ==================================================================

@app.get("/engine/runtime/source-status")
def engine_runtime_source_status(limit: int = 160):
    safe_limit = max(10, min(int(limit or 160), 200))
    cockpit = build_signal_cockpit_payload(_s416_get_lifecycle_items(), limit=safe_limit, include_candles=False)
    cached_compact = runtime_cache.get_json(S416_COCKPIT_COMPACT_CACHE_KEY)
    cache_publish = None
    try:
        cache_publish = publish_runtime_cache(reason="source_status_probe", ttl_seconds=900)
    except Exception as error:
        cache_publish = {"ok": False, "error": repr(error)}

    return {
        "ok": True,
        "storageVersion": "s5_14e_runtime_source_of_truth_v1",
        "freshCockpit": {
            "runtimeStatus": cockpit.get("runtimeStatus"),
            "watchlistCount": _s514c_count_from_section(cockpit, "watchlist"),
            "activeCount": _s514c_count_from_section(cockpit, "active"),
            "armedCount": _s514c_count_from_section(cockpit, "armed"),
            "lifecycleCount": _s514c_count_from_section(cockpit, "lifecycle"),
            "bestIdeaTotals": cockpit.get("bestIdeaSelector", {}).get("totals") if isinstance(cockpit.get("bestIdeaSelector"), dict) else {},
        },
        "cachedCompact": {
            "exists": isinstance(cached_compact, dict),
            "runtimeStatus": cached_compact.get("runtimeStatus") if isinstance(cached_compact, dict) else None,
            "watchlistCount": _s514c_count_from_section(cached_compact, "watchlist") if isinstance(cached_compact, dict) else 0,
            "activeCount": _s514c_count_from_section(cached_compact, "active") if isinstance(cached_compact, dict) else 0,
            "armedCount": _s514c_count_from_section(cached_compact, "armed") if isinstance(cached_compact, dict) else 0,
            "lifecycleCount": _s514c_count_from_section(cached_compact, "lifecycle") if isinstance(cached_compact, dict) else 0,
        },
        "publishRuntimeCacheProbe": cache_publish,
        "cache": runtime_cache.get_status(),
    }


@app.get("/engine/cockpit/v2")
def engine_signal_cockpit_v2(symbol: str | None = None, limit: int = 80, include_candles: bool = False, publish: bool = True):
    value = build_signal_cockpit_payload(
        _s416_get_lifecycle_items(),
        selected_symbol=symbol,
        limit=limit,
        include_candles=include_candles,
    )
    if publish:
        runtime_cache.set_json(S416_COCKPIT_COMPACT_CACHE_KEY, value, ttl_seconds=900)
    return {
        "ok": True,
        "value": value,
        "cache": runtime_cache.get_status(),
        "storageVersion": S416_COCKPIT_VERSION,
    }


@app.get("/engine/cockpit/symbol/{symbol}")
def engine_signal_cockpit_symbol(symbol: str, include_candles: bool = True):
    lifecycle_items = _s416_get_lifecycle_items()
    lifecycle_by_symbol = _s416_latest_by_symbol(lifecycle_items)
    selected = _s416_build_selected_symbol(symbol, lifecycle_by_symbol, include_candles=include_candles)
    return {
        "ok": True,
        "symbol": str(symbol or "").upper().strip(),
        "selected": selected,
        "cache": runtime_cache.get_status(),
        "storageVersion": S416_COCKPIT_VERSION,
    }


@app.get("/engine/cockpit/watchlist")
def engine_signal_cockpit_watchlist(limit: int = 80):
    lifecycle_by_symbol = _s416_latest_by_symbol(_s416_get_lifecycle_items())
    safe_limit = max(10, min(int(limit or 80), 200))
    items = sorted(
        [_s416_compact_watch_item(item, lifecycle_by_symbol) for item in _s416_watchlist_items() if isinstance(item, dict)],
        key=lambda item: int(item.get("inPlayScore") or 0),
        reverse=True,
    )[:safe_limit]
    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "cache": runtime_cache.get_status(),
        "storageVersion": S416_COCKPIT_VERSION,
    }


# ---------------------------------------------------------------------------
# S4.18E Cockpit 3D history + live chart candles
# ---------------------------------------------------------------------------

S418E_COCKPIT_HISTORY_VERSION = "s418i_extended_history_provider_adapter_v1"


def _s418f_session_key(parsed_utc: datetime | None) -> str:
    if parsed_utc is None:
        return "unknown"
    try:
        ny = parsed_utc.astimezone(ZoneInfo("America/New_York"))
        minutes = ny.hour * 60 + ny.minute
        if 4 * 60 <= minutes < 9 * 60 + 30:
            return "premarket"
        if 9 * 60 + 30 <= minutes < 16 * 60:
            return "regular"
        if 16 * 60 <= minutes < 20 * 60:
            return "postmarket"
        return "overnight"
    except Exception:
        return "unknown"


def _s418f_merge_candle_rows(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for group in groups:
        for row in group or []:
            if not isinstance(row, dict):
                continue
            timestamp = _s418e_candle_timestamp(row)
            if not timestamp:
                continue
            existing = merged.get(timestamp)
            if not existing:
                merged[timestamp] = dict(row)
                continue
            # Prefer the row with more volume / fresher extended feed values.
            try:
                old_vol = float(existing.get("volume") or 0)
                new_vol = float(row.get("volume") or 0)
            except Exception:
                old_vol = 0
                new_vol = 0
            if new_vol >= old_vol:
                combined = dict(existing)
                combined.update(row)
                merged[timestamp] = combined
    return sorted(merged.values(), key=lambda item: str(_s418e_candle_timestamp(item)))




def _s418h_interval_minutes(interval: str) -> int:
    value = str(interval or "5min").lower().strip()
    if value == "1min":
        return 1
    if value == "5min":
        return 5
    if value == "15min":
        return 15
    if value == "30min":
        return 30
    if value == "1hour":
        return 60
    return 5


def _s418h_floor_time(parsed: datetime, minutes: int) -> datetime:
    if minutes <= 1:
        return parsed.replace(second=0, microsecond=0)
    total_minutes = parsed.hour * 60 + parsed.minute
    floored_total = (total_minutes // minutes) * minutes
    hour = floored_total // 60
    minute = floored_total % 60
    return parsed.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _s418h_resample_rows(rows: list[dict[str, Any]], interval: str = "5min") -> list[dict[str, Any]]:
    """Aggregate 1m candles/trades into the requested interval.

    This is important for small-cap/premarket symbols because the provider may
    only expose extended rows through the 1m trade/quote path. We aggregate them
    into 5m so the cockpit chart remains a true 5m chart.
    """
    minutes = _s418h_interval_minutes(interval)
    if minutes <= 1:
        return rows or []

    buckets: dict[str, dict[str, Any]] = {}
    ordered_rows = sorted(rows or [], key=lambda row: str(_s418e_candle_timestamp(row) or ""))

    for row in ordered_rows:
        if not isinstance(row, dict):
            continue
        parsed = _s418e_to_datetime(_s418e_candle_timestamp(row))
        open_price = _s416_safe_float(row.get("open"))
        high = _s416_safe_float(row.get("high"))
        low = _s416_safe_float(row.get("low"))
        close = _s416_safe_float(row.get("close"))
        volume = _s416_safe_float(row.get("volume"), 0) or 0
        if parsed is None or not all(value is not None for value in (open_price, high, low, close)):
            continue

        bucket_time = _s418h_floor_time(parsed, minutes)
        bucket_key = bucket_time.strftime("%Y-%m-%d %H:%M:%S")
        source = str(row.get("source") or "")

        if bucket_key not in buckets:
            buckets[bucket_key] = {
                "date": bucket_key,
                "open": float(open_price),
                "high": float(high),
                "low": float(low),
                "close": float(close),
                "volume": float(volume),
                "source": f"resampled_{minutes}min_from_1min" + (f"+{source}" if source else ""),
            }
            continue

        candle = buckets[bucket_key]
        candle["high"] = max(float(candle.get("high") or high), float(high))
        old_low = float(candle.get("low") or low)
        new_low = float(low)
        candle["low"] = min(old_low, new_low) if old_low > 0 and new_low > 0 else new_low or old_low
        candle["close"] = float(close)
        candle["volume"] = float(candle.get("volume") or 0) + float(volume)

    return [buckets[key] for key in sorted(buckets.keys())]


def _s418h_session_stats_from_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    stats: dict[str, int] = {"premarket": 0, "regular": 0, "postmarket": 0, "overnight": 0, "unknown": 0}
    for row in rows or []:
        parsed = _s418e_to_datetime(_s418e_candle_timestamp(row)) if isinstance(row, dict) else None
        key = _s418f_session_key(parsed)
        stats[key] = stats.get(key, 0) + 1
    return stats


# ---------------------------------------------------------------------------
# S4.18I external extended-hours history provider adapter
# ---------------------------------------------------------------------------

def _s418i_env(name: str, default: str = "") -> str:
    return str(os.getenv(name) or default or "").strip()


def _s418i_json_get(url: str, headers: dict[str, str] | None = None, timeout: int = 25) -> tuple[dict[str, Any] | None, str | None]:
    try:
        request = Request(url, headers=headers or {"User-Agent": "SkillEdgeAI-StockEngine/1.0"})
        with urlopen(request, timeout=timeout) as response:  # nosec - URL is built from known provider base + encoded params
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw), None
    except HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            body = ""
        return None, f"HTTP {exc.code}: {body}"
    except URLError as exc:
        return None, f"URL error: {exc.reason}"
    except Exception as exc:
        return None, str(exc)


def _s418i_polygon_key() -> str:
    return _s418i_env("POLYGON_API_KEY") or _s418i_env("MASSIVE_API_KEY")


def _s418i_load_polygon_aggs(symbol: str, interval: str = "5min", days: int = 3) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load historical aggregates from Polygon/Massive-style endpoint.

    Why this exists: FMP intraday history in our current test returned regular
    session only. Polygon/Massive aggregate bars are built from market trades and
    can include extended-hours trades when the user's plan/key has access.
    """
    key = _s418i_polygon_key()
    minutes = max(1, _s418h_interval_minutes(interval))
    stats: dict[str, Any] = {
        "provider": "polygon_or_massive",
        "configured": bool(key),
        "requestedInterval": interval,
        "requestedDays": days,
        "rows": 0,
        "sessionStats": {"premarket": 0, "regular": 0, "postmarket": 0, "overnight": 0, "unknown": 0},
        "error": None,
    }
    if not key:
        stats["error"] = "POLYGON_API_KEY or MASSIVE_API_KEY is missing"
        return [], stats

    wanted = str(symbol or "").upper().strip()
    if not wanted:
        stats["error"] = "symbol_required"
        return [], stats

    ny = ZoneInfo("America/New_York")
    now_ny = datetime.now(ny)
    # Calendar range is intentionally wider than requested trading days so
    # weekends/holidays do not accidentally leave us with fewer than 3 sessions.
    from_date = (now_ny.date() - timedelta(days=max(7, int(days or 3) + 5))).isoformat()
    to_date = (now_ny.date() + timedelta(days=1)).isoformat()

    base_url = _s418i_env("POLYGON_AGGS_BASE_URL") or _s418i_env("MASSIVE_AGGS_BASE_URL") or "https://api.polygon.io"
    base_url = base_url.rstrip("/")
    path = f"/v2/aggs/ticker/{wanted}/range/{minutes}/minute/{from_date}/{to_date}"
    query = urlencode({
        "adjusted": "false",
        "sort": "asc",
        "limit": "50000",
        "apiKey": key,
    })
    url = f"{base_url}{path}?{query}"
    payload, error = _s418i_json_get(url)
    if error:
        stats["error"] = error
        return [], stats

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        stats["error"] = f"unexpected_payload_status={payload.get('status') if isinstance(payload, dict) else 'unknown'}"
        return [], stats

    rows: list[dict[str, Any]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        try:
            ts_ms = int(item.get("t"))
            parsed = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            row = {
                "date": parsed.strftime("%Y-%m-%d %H:%M:%S"),
                "open": float(item.get("o")),
                "high": float(item.get("h")),
                "low": float(item.get("l")),
                "close": float(item.get("c")),
                "volume": float(item.get("v") or 0),
                "source": "polygon_aggs",
            }
        except Exception:
            continue
        rows.append(row)

    session_stats = _s418h_session_stats_from_rows(rows)
    stats.update({
        "rows": len(rows),
        "sessionStats": session_stats,
        "from": from_date,
        "to": to_date,
        "baseUrl": base_url,
        "providerPayloadStatus": payload.get("status") if isinstance(payload, dict) else None,
    })
    return rows, stats

async def _s418f_load_intraday_rows(client: FmpClient, symbol: str, interval: str, include_extended: bool = True, provider: str = "auto", days: int = 3) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    regular_rows = await client.get_intraday_candles(symbol, interval=interval)
    extended_rows: list[dict[str, Any]] = []
    extended_snapshot_rows: list[dict[str, Any]] = []
    one_minute_rows: list[dict[str, Any]] = []
    one_minute_resampled_rows: list[dict[str, Any]] = []

    if include_extended:
        try:
            if hasattr(client, "get_extended_intraday_candles"):
                extended_rows = await client.get_extended_intraday_candles(symbol, interval=interval)  # type: ignore[arg-type]
        except TypeError:
            try:
                extended_rows = await client.get_extended_intraday_candles(symbol)  # type: ignore[misc]
            except Exception:
                extended_rows = []
        except Exception:
            extended_rows = []

        try:
            if hasattr(client, "get_extended_buffer_snapshot"):
                extended_snapshot_rows = client.get_extended_buffer_snapshot(symbol)  # type: ignore[misc]
        except Exception:
            extended_snapshot_rows = []

        # S4.18H: when the cockpit asks for a 5m history, also pull the 1m
        # stream and aggregate it to 5m. On FMP this is often the only path that
        # contains current pre/post-market buffer rows. If FMP still returns only
        # regular candles, the diagnostics below will make that explicit.
        if str(interval or "").lower().strip() != "1min":
            try:
                one_minute_rows = await client.get_intraday_candles(symbol, interval="1min")
                one_minute_resampled_rows = _s418h_resample_rows(one_minute_rows, interval=interval)
            except Exception:
                one_minute_rows = []
                one_minute_resampled_rows = []

    requested_provider = str(provider or "auto").lower().strip()
    if requested_provider not in {"auto", "fmp", "polygon", "massive"}:
        requested_provider = "auto"

    external_rows: list[dict[str, Any]] = []
    external_stats: dict[str, Any] = {
        "provider": requested_provider,
        "configured": False,
        "rows": 0,
        "sessionStats": {"premarket": 0, "regular": 0, "postmarket": 0, "overnight": 0, "unknown": 0},
        "error": None,
    }
    if include_extended and requested_provider in {"auto", "polygon", "massive"}:
        external_rows, external_stats = _s418i_load_polygon_aggs(symbol, interval=interval, days=days)

    rows = _s418f_merge_candle_rows(regular_rows, one_minute_resampled_rows, extended_rows, extended_snapshot_rows, external_rows)
    regular_session_stats = _s418h_session_stats_from_rows(regular_rows)
    one_minute_session_stats = _s418h_session_stats_from_rows(one_minute_rows)
    external_session_stats = _s418h_session_stats_from_rows(external_rows)
    merged_session_stats = _s418h_session_stats_from_rows(rows)
    provider_limit_detected = (merged_session_stats.get("premarket", 0) == 0 and merged_session_stats.get("postmarket", 0) == 0)
    return rows, {
        "providerMode": requested_provider,
        "regularRows": len(regular_rows or []),
        "oneMinuteRows": len(one_minute_rows or []),
        "oneMinuteResampledRows": len(one_minute_resampled_rows or []),
        "extendedRows": len(extended_rows or []),
        "extendedBufferRows": len(extended_snapshot_rows or []),
        "externalRows": len(external_rows or []),
        "mergedRows": len(rows),
        "regularSessionStats": regular_session_stats,
        "oneMinuteSessionStats": one_minute_session_stats,
        "externalSessionStats": external_session_stats,
        "mergedSessionStats": merged_session_stats,
        "externalProvider": external_stats,
        "providerLimitDetected": provider_limit_detected,
        "note": "S4.18I adds an external Polygon/Massive-style history adapter. If providerLimitDetected stays true, set POLYGON_API_KEY or MASSIVE_API_KEY and request provider=polygon. FMP remains fallback.",
    }


def _s418e_to_datetime(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for candidate in (raw, raw.replace(" ", "T"), raw.replace("Z", "+00:00")):
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            continue
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            continue
    return None


def _s418e_candle_timestamp(row: dict[str, Any]) -> str:
    return str(row.get("date") or row.get("timestamp") or row.get("time") or "").strip()


def _s418e_normalize_candle(row: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    timestamp = _s418e_candle_timestamp(row)
    parsed = _s418e_to_datetime(timestamp)
    open_price = _s416_safe_float(row.get("open"))
    high = _s416_safe_float(row.get("high"))
    low = _s416_safe_float(row.get("low"))
    close = _s416_safe_float(row.get("close"))
    volume = _s416_safe_float(row.get("volume"), 0) or 0
    if parsed is None or not all(value is not None for value in (open_price, high, low, close)):
        return None
    return {
        "timestamp": parsed.strftime("%Y-%m-%d %H:%M:%S"),
        "open": round(float(open_price), 6),
        "high": round(float(high), 6),
        "low": round(float(low), 6),
        "close": round(float(close), 6),
        "volume": round(float(volume), 2),
        "session": _s418f_session_key(parsed),
        "dateKey": parsed.date().isoformat(),
    }


def _s418e_last_trading_day_candles(rows: list[dict[str, Any]], days: int = 3, limit: int = 1200) -> tuple[list[dict[str, Any]], list[str]]:
    candles = [_s418e_normalize_candle(row) for row in rows if isinstance(row, dict)]
    candles = [item for item in candles if isinstance(item, dict)]
    candles.sort(key=lambda item: str(item.get("timestamp") or ""))
    if not candles:
        return [], []

    unique_dates = []
    for candle in candles:
        date_key = str(candle.get("dateKey") or "")
        if date_key and date_key not in unique_dates:
            unique_dates.append(date_key)

    selected_dates = unique_dates[-max(1, min(int(days or 3), 5)) :]
    filtered = [item for item in candles if item.get("dateKey") in selected_dates]
    safe_limit = max(50, min(int(limit or 1200), 2500))
    filtered = filtered[-safe_limit:]

    # The frontend does not need dateKey in each candle.
    for candle in filtered:
        candle.pop("dateKey", None)

    return filtered, selected_dates


def _s418e_symbol_matches(item: dict[str, Any], symbol: str) -> bool:
    wanted = str(symbol or "").upper().strip()
    if not wanted or not isinstance(item, dict):
        return False
    payload = item.get("signal") if isinstance(item.get("signal"), dict) else item
    return str(payload.get("symbol") or item.get("symbol") or "").upper().strip() == wanted


def _s418e_recent_symbol_signals(symbol: str, limit: int = 50) -> list[dict[str, Any]]:
    lifecycle_by_symbol = _s416_latest_by_symbol(_s416_get_lifecycle_items())
    source_items = _s416_signal_items() + _s416_active_items() + _s416_armed_items()
    compact = [
        _s416_compact_signal_item(item, lifecycle_by_symbol)
        for item in source_items
        if isinstance(item, dict) and _s418e_symbol_matches(item, symbol)
    ]
    compact.sort(key=lambda item: str(item.get("createdAt") or item.get("triggerTime") or ""), reverse=True)
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in compact:
        key = str(item.get("signalId") or item.get("createdAt") or item)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= limit:
            break
    return result


def _s418e_recent_symbol_lifecycle(symbol: str, limit: int = 50) -> list[dict[str, Any]]:
    items = [
        _s416_compact_lifecycle_item(item)
        for item in _s416_get_lifecycle_items()
        if isinstance(item, dict) and str(item.get("symbol") or "").upper().strip() == str(symbol or "").upper().strip()
    ]
    items.sort(key=lambda item: str(item.get("evaluatedAt") or item.get("triggerTime") or ""), reverse=True)
    return items[:limit]



@app.get("/engine/cockpit/history/providers")
def engine_signal_cockpit_history_providers():
    return {
        "ok": True,
        "storageVersion": S418E_COCKPIT_HISTORY_VERSION,
        "providers": {
            "fmp": {
                "configured": bool(getattr(settings, "fmp_api_key", None)),
                "role": "default historical intraday fallback",
                "observedLimitation": "current tested endpoint returns regular-session candles only for 3D 5m history",
            },
            "polygon": {
                "configured": bool(_s418i_polygon_key()),
                "env": ["POLYGON_API_KEY", "MASSIVE_API_KEY"],
                "role": "preferred extended-hours historical aggregates provider",
                "requestParam": "provider=polygon",
            },
        },
        "usage": {
            "auto": "/engine/cockpit/history/GLXG?days=3&interval=5min&extended=true&session=all&provider=auto",
            "polygon": "/engine/cockpit/history/GLXG?days=3&interval=5min&extended=true&session=all&provider=polygon",
        },
    }

@app.get("/engine/cockpit/history/{symbol}")
async def engine_signal_cockpit_history(symbol: str, days: int = 3, interval: str = "5min", limit: int = 1200, extended: bool = True, session: str = "all", provider: str = "auto"):
    client = FmpClient()
    wanted = str(symbol or "").upper().strip()
    safe_days = max(1, min(int(days or 3), 5))
    safe_limit = max(50, min(int(limit or 1200), 2500))
    safe_interval = str(interval or "5min").lower().strip()
    if safe_interval not in {"1min", "5min", "15min", "30min", "1hour"}:
        safe_interval = "5min"
    safe_session = str(session or "all").lower().strip()
    if safe_session not in {"all", "premarket", "regular", "postmarket", "extended"}:
        safe_session = "all"
    safe_provider = str(provider or "auto").lower().strip()
    if safe_provider not in {"auto", "fmp", "polygon", "massive"}:
        safe_provider = "auto"

    if not wanted:
        return {"ok": False, "error": "symbol_required", "storageVersion": S418E_COCKPIT_HISTORY_VERSION}
    if not client.is_configured():
        return {"ok": False, "error": "FMP_API_KEY is missing", "symbol": wanted, "storageVersion": S418E_COCKPIT_HISTORY_VERSION}

    rows, source_stats = await _s418f_load_intraday_rows(client, wanted, safe_interval, include_extended=bool(extended), provider=safe_provider, days=safe_days)
    rows = sorted(rows, key=lambda item: str(item.get("date") or item.get("timestamp") or ""))
    candles, trading_dates = _s418e_last_trading_day_candles(rows, days=safe_days, limit=safe_limit)
    if safe_session == "extended":
        candles = [item for item in candles if item.get("session") in {"premarket", "postmarket"}]
    elif safe_session != "all":
        candles = [item for item in candles if item.get("session") == safe_session]

    session_stats: dict[str, int] = {"premarket": 0, "regular": 0, "postmarket": 0, "overnight": 0, "unknown": 0}
    for item in candles:
        key = str(item.get("session") or "unknown")
        session_stats[key] = session_stats.get(key, 0) + 1

    lifecycle_items = _s416_get_lifecycle_items()
    lifecycle_by_symbol = _s416_latest_by_symbol(lifecycle_items)
    selected = _s416_build_selected_symbol(wanted, lifecycle_by_symbol, include_candles=True)

    return {
        "ok": True,
        "symbol": wanted,
        "mode": f"{safe_days}d_history_plus_live",
        "days": safe_days,
        "interval": safe_interval,
        "extended": bool(extended),
        "session": safe_session,
        "provider": safe_provider,
        "rawCount": len(rows),
        "count": len(candles),
        "sourceStats": source_stats,
        "sessionStats": session_stats,
        "candles": candles,
        "tradingDates": trading_dates,
        "selected": selected,
        "signals": _s418e_recent_symbol_signals(wanted),
        "lifecycleEvents": _s418e_recent_symbol_lifecycle(wanted),
        "historyPolicy": {
            "chart": "last N trading dates on a true 5m chart: FMP fallback plus optional Polygon/Massive extended-hours adapter",
            "liveMerge": "frontend merges latest SSE/current candles into the loaded history without resetting user zoom/pan",
            "maxDays": 5,
            "defaultDays": 3,
        },
        "cache": runtime_cache.get_status(),
        "storageVersion": S418E_COCKPIT_HISTORY_VERSION,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }







