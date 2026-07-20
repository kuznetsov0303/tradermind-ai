from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, time as dt_time, timezone
from typing import Any

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore


API_BASE = os.getenv("STOCK_ENGINE_API_BASE", "http://127.0.0.1:8000").rstrip("/")
DISCOVERY_INTERVAL_SECONDS = int(os.getenv("ENGINE_DISCOVERY_INTERVAL_SECONDS", "300"))
OUTCOME_INTERVAL_SECONDS = int(os.getenv("ENGINE_OUTCOME_INTERVAL_SECONDS", "300"))
LIFECYCLE_INTERVAL_SECONDS = int(os.getenv("ENGINE_LIFECYCLE_INTERVAL_SECONDS", "60"))
STATUS_INTERVAL_SECONDS = int(os.getenv("ENGINE_STATUS_INTERVAL_SECONDS", "900"))
CALIBRATION_AFTER_NY_TIME = os.getenv("ENGINE_CALIBRATION_AFTER_NY_TIME", "16:10")
MIN_SIGNALS_FOR_ADJUSTMENT = int(os.getenv("ENGINE_MIN_SIGNALS_FOR_ADJUSTMENT", "20"))
MIN_CLOSED_FOR_ADJUSTMENT = int(os.getenv("ENGINE_MIN_CLOSED_FOR_ADJUSTMENT", "10"))
OUTCOME_LIMIT = int(os.getenv("ENGINE_OUTCOME_SIGNAL_LIMIT", "500"))
LIFECYCLE_LIMIT = int(os.getenv("ENGINE_LIFECYCLE_SIGNAL_LIMIT", "100"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("ENGINE_REQUEST_TIMEOUT_SECONDS", "120"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ny_now() -> datetime:
    if ZoneInfo is None:
        return utc_now()
    return utc_now().astimezone(ZoneInfo("America/New_York"))


def parse_hhmm(value: str) -> dt_time:
    hour, minute = value.split(":", 1)
    return dt_time(hour=int(hour), minute=int(minute))


def is_trading_day(dt: datetime) -> bool:
    # Basic weekday guard. Holiday calendar can be added later.
    return dt.weekday() < 5


def in_scan_window(dt: datetime) -> bool:
    # Premarket + regular. 04:00 ET is roughly 11:00 Kyiv during US summer time.
    return dt_time(4, 0) <= dt.time() <= dt_time(16, 5)


def in_outcome_window(dt: datetime) -> bool:
    return dt_time(4, 0) <= dt.time() <= dt_time(16, 30)


def in_lifecycle_window(dt: datetime) -> bool:
    # Lifecycle should keep managing active ideas through the regular close buffer.
    return dt_time(4, 0) <= dt.time() <= dt_time(16, 30)


def after_calibration_time(dt: datetime) -> bool:
    return dt.time() >= parse_hhmm(CALIBRATION_AFTER_NY_TIME)


def request_json(method: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = urllib.parse.urlencode(params or {}, doseq=True)
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{query}"

    req = urllib.request.Request(url, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {"ok": True}
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"ok": True, "data": parsed}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        return {"ok": False, "error": f"HTTP {error.code}: {detail}", "url": url}
    except Exception as error:
        return {"ok": False, "error": repr(error), "url": url}


def compact_error(result: dict[str, Any]) -> str:
    """Expose API/HTTP errors without dumping huge JSON into the terminal."""

    parts: list[str] = []
    for key in ("error", "reason", "detail", "url"):
        value = result.get(key)
        if value:
            raw = str(value).replace("\n", " ").strip()
            if len(raw) > 240:
                raw = raw[:240] + "..."
            parts.append(f"{key}={raw}")

    if not parts and result.get("ok") is False:
        raw = json.dumps(result, ensure_ascii=False, default=str)
        if len(raw) > 320:
            raw = raw[:320] + "..."
        parts.append(f"payload={raw}")

    return " ".join(parts)


def compact_discovery(result: dict[str, Any]) -> str:
    base = (
        f"ok={result.get('ok')} "
        f"watch={result.get('watchCount')} "
        f"armed={result.get('armedCount')} "
        f"active={result.get('activeCount')} "
        f"rejected={result.get('rejectedCount')}"
    )
    error = compact_error(result)
    return f"{base} {error}".strip()


def compact_outcome(result: dict[str, Any]) -> str:
    base = (
        f"ok={result.get('ok')} "
        f"source={result.get('source')} "
        f"count={result.get('count')} "
        f"worked={result.get('worked')} "
        f"failed={result.get('failed')} "
        f"open={result.get('open')} "
        f"winRate={result.get('winRateClosed')}"
    )
    error = compact_error(result)
    return f"{base} {error}".strip()


def compact_lifecycle(result: dict[str, Any]) -> str:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    by_status = summary.get("byStatus") if isinstance(summary.get("byStatus"), dict) else {}
    by_status_text = ",".join(f"{key}:{value}" for key, value in sorted(by_status.items())) or "none"
    base = (
        f"ok={result.get('ok')} "
        f"sourceActive={result.get('sourceActiveCount')} "
        f"count={result.get('count')} "
        f"activeLike={summary.get('activeLikeCount')} "
        f"closedLike={summary.get('closedLikeCount')} "
        f"byStatus={by_status_text}"
    )
    error = compact_error(result)
    return f"{base} {error}".strip()


def compact_calibration(result: dict[str, Any]) -> str:
    run = result.get("run") if isinstance(result.get("run"), dict) else {}
    base = (
        f"ok={result.get('ok')} "
        f"runId={run.get('runId')} "
        f"algorithms={run.get('algorithmCount')} "
        f"outcomes={run.get('outcomeCount')} "
        f"closed={run.get('closedCount')} "
        f"adjustments={run.get('adjustmentCount')} "
        f"winRate={run.get('winRateClosed')} "
        f"status={run.get('status')}"
    )
    error = compact_error(result)
    return f"{base} {error}".strip()


def compact_status(result: dict[str, Any]) -> str:
    runtime = result.get("runtime") if isinstance(result.get("runtime"), dict) else {}
    supabase = result.get("supabase") if isinstance(result.get("supabase"), dict) else {}
    return (
        f"primary={result.get('primaryStore')} "
        f"signals={result.get('signalsCount')} "
        f"outcomes={result.get('outcomesCount')} "
        f"runtimeActive={runtime.get('activeCount')} "
        f"supabaseEnabled={supabase.get('enabled')} "
        f"supabaseError={supabase.get('lastError')}"
    )


def log(message: str) -> None:
    stamp = utc_now().strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{stamp}] {message}", flush=True)


@dataclass
class LoopState:
    last_discovery_at: float = 0
    last_outcome_at: float = 0
    last_lifecycle_at: float = 0
    last_status_at: float = 0
    calibrated_session_dates: set[str] = field(default_factory=set)
    tick_count: int = 0
    discovery_failures: int = 0
    outcome_failures: int = 0
    lifecycle_failures: int = 0


def should_run(last_ts: float, interval_seconds: int) -> bool:
    return time.time() - last_ts >= interval_seconds


def sync_algorithms_once() -> None:
    result = request_json("POST", "/engine/algorithms/sync")
    if result.get("ok"):
        log(f"algorithms synced: count={result.get('count')}")
    else:
        log(f"algorithms sync error: {compact_error(result)}")


def run_discovery(state: LoopState) -> None:
    result = request_json("POST", "/engine/discovery/refresh")
    state.last_discovery_at = time.time()
    if result.get("ok") is False:
        state.discovery_failures += 1
    else:
        state.discovery_failures = 0
    suffix = f" consecutiveFailures={state.discovery_failures}" if state.discovery_failures else ""
    log(f"discovery: {compact_discovery(result)}{suffix}")


# S4.15B: lifecycle manager is now part of the live loop.
def run_lifecycle(state: LoopState) -> None:
    params: dict[str, Any] = {
        "interval": "5min",
        "limit": LIFECYCLE_LIMIT,
        "publish": "true",
    }
    result = request_json("POST", "/engine/lifecycle/run", params=params)
    state.last_lifecycle_at = time.time()
    if result.get("ok") is False:
        state.lifecycle_failures += 1
    else:
        state.lifecycle_failures = 0
    suffix = f" consecutiveFailures={state.lifecycle_failures}" if state.lifecycle_failures else ""
    log(f"lifecycle: {compact_lifecycle(result)}{suffix}")


def run_outcomes(state: LoopState, session_date: str | None = None) -> None:
    params: dict[str, Any] = {
        "interval": "5min",
        "use_trigger_time": "true",
        "session_to_close": "true",
        "source": "auto",
        "limit": OUTCOME_LIMIT,
    }
    if session_date:
        params["session_date"] = session_date
    result = request_json("POST", "/engine/outcomes/run-today", params=params)
    state.last_outcome_at = time.time()
    if result.get("ok") is False:
        state.outcome_failures += 1
    else:
        state.outcome_failures = 0
    suffix = f" consecutiveFailures={state.outcome_failures}" if state.outcome_failures else ""
    log(f"outcomes: {compact_outcome(result)}{suffix}")


def run_calibration(session_date: str) -> None:
    result = request_json(
        "POST",
        "/engine/calibration/run",
        params={
            "session_date": session_date,
            "min_signals": MIN_SIGNALS_FOR_ADJUSTMENT,
            "min_closed": MIN_CLOSED_FOR_ADJUSTMENT,
        },
    )
    log(f"calibration: {compact_calibration(result)}")


def run_status(state: LoopState) -> None:
    result = request_json("GET", "/engine/db/status")
    state.last_status_at = time.time()
    log(f"status: {compact_status(result)}")


def loop_forever() -> None:
    log("SkillEdge stock-engine loop starting")
    log(
        f"api={API_BASE} "
        f"discoveryEvery={DISCOVERY_INTERVAL_SECONDS}s "
        f"lifecycleEvery={LIFECYCLE_INTERVAL_SECONDS}s "
        f"outcomeEvery={OUTCOME_INTERVAL_SECONDS}s "
        f"calibrationAfterNY={CALIBRATION_AFTER_NY_TIME} "
        f"timeout={REQUEST_TIMEOUT_SECONDS}s"
    )
    log("Use Ctrl+C to stop. Run uvicorn in another PowerShell first.")

    state = LoopState()
    sync_algorithms_once()
    run_status(state)

    while True:
        state.tick_count += 1
        now_ny = ny_now()
        session_date = now_ny.date().isoformat()

        if is_trading_day(now_ny):
            if in_scan_window(now_ny) and should_run(state.last_discovery_at, DISCOVERY_INTERVAL_SECONDS):
                run_discovery(state)
                # Immediately refresh lifecycle after discovery because ACTIVE signals may have changed.
                run_lifecycle(state)

            if in_lifecycle_window(now_ny) and should_run(state.last_lifecycle_at, LIFECYCLE_INTERVAL_SECONDS):
                run_lifecycle(state)

            if in_outcome_window(now_ny) and should_run(state.last_outcome_at, OUTCOME_INTERVAL_SECONDS):
                run_outcomes(state, session_date=session_date)

            if after_calibration_time(now_ny) and session_date not in state.calibrated_session_dates:
                # Run one last lifecycle + outcome pass before calibration so the report uses the freshest dataset.
                run_lifecycle(state)
                run_outcomes(state, session_date=session_date)
                run_calibration(session_date=session_date)
                state.calibrated_session_dates.add(session_date)

        if should_run(state.last_status_at, STATUS_INTERVAL_SECONDS):
            run_status(state)

        time.sleep(10)


if __name__ == "__main__":
    try:
        loop_forever()
    except KeyboardInterrupt:
        log("SkillEdge stock-engine loop stopped by user")
        sys.exit(0)

