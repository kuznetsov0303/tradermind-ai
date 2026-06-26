from __future__ import annotations

import json
import os
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STORAGE_VERSION = "s410_supabase_sqlite_persistence_v1"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def from_json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        decoded = json.loads(value)
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def safe_bool(value: Any) -> int:
    return 1 if value is True else 0


def bool_value(value: Any) -> bool:
    return value is True or value == 1 or str(value).lower() in {"true", "1", "yes"}


def safe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace("%", "").replace(",", "").strip())
        except ValueError:
            return None
    return None


def iso_or_none(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value)


def date_from_iso(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value)
    return raw[:10] if len(raw) >= 10 else None


def default_db_path() -> Path:
    configured = os.getenv("STOCK_ENGINE_DB_PATH") or os.getenv("SKILLEDGE_STOCK_ENGINE_DB_PATH")
    if configured:
        return Path(configured).expanduser().resolve()

    # services/stock-engine/app/storage.py -> services/stock-engine/data/stock_engine.db
    return (Path(__file__).resolve().parents[1] / "data" / "stock_engine.db").resolve()


def resolve_supabase_url() -> str | None:
    return (
        os.getenv("SUPABASE_URL")
        or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        or os.getenv("PUBLIC_SUPABASE_URL")
    )


def resolve_supabase_service_key() -> str | None:
    return (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE")
        or os.getenv("SUPABASE_SERVICE_ROLE_SECRET")
    )


def supabase_enabled_from_env() -> bool:
    raw = os.getenv("STOCK_ENGINE_SUPABASE_ENABLED") or os.getenv("SKILLEDGE_STOCK_ENGINE_SUPABASE_ENABLED")
    if raw is None:
        return True
    return str(raw).strip().lower() not in {"0", "false", "no", "off"}


class SupabaseRestStore:
    """Tiny Supabase/PostgREST client using only stdlib urllib.

    It is intentionally defensive: any Supabase error is stored in last_error and
    the engine continues using SQLite. This lets local/dev keep working while we
    wire the production Supabase database.
    """

    def __init__(self, url: str | None = None, service_key: str | None = None) -> None:
        self.url = (url or resolve_supabase_url() or "").rstrip("/")
        self.service_key = service_key or resolve_supabase_service_key() or ""
        self.enabled = bool(self.url and self.service_key and supabase_enabled_from_env())
        self.last_error: str | None = None

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, str] | None = None,
        body: Any | None = None,
        prefer: str | None = None,
    ) -> tuple[Any, dict[str, str]]:
        if not self.enabled:
            return None, {}

        query = urllib.parse.urlencode(params or {}, doseq=True)
        target = f"{self.url}/rest/v1/{table}"
        if query:
            target = f"{target}?{query}"

        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")

        request = urllib.request.Request(
            target,
            data=data,
            method=method.upper(),
            headers=self._headers(prefer=prefer),
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
                headers = {key.lower(): value for key, value in response.headers.items()}
                if not raw:
                    self.last_error = None
                    return None, headers
                self.last_error = None
                return json.loads(raw), headers
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self.last_error = f"HTTP {error.code}: {detail[:500]}"
            raise RuntimeError(self.last_error) from error
        except Exception as error:
            self.last_error = repr(error)
            raise

    def safe_request(self, *args: Any, **kwargs: Any) -> tuple[Any, dict[str, str]]:
        try:
            return self._request(*args, **kwargs)
        except Exception:
            return None, {}

    def upsert_signal(self, storage_key: str, record: dict[str, Any]) -> bool:
        if not self.enabled or not storage_key or not isinstance(record, dict):
            return False

        payload = dict(record)
        trigger_time = payload.get("triggerTime") or payload.get("createdAt") or payload.get("storedAt")
        row = {
            "storage_key": storage_key,
            "signal_id": payload.get("signalId"),
            "asset_type": payload.get("assetType") or "stock",
            "symbol": str(payload.get("symbol") or "").upper(),
            "setup_slug": payload.get("setupSlug"),
            "setup_name": payload.get("setupName"),
            "session_date": payload.get("sessionDate") or date_from_iso(trigger_time),
            "lifecycle_status": payload.get("lifecycleStatus") or payload.get("status"),
            "quality_status": payload.get("qualityStatus"),
            "signal_grade": payload.get("signalGrade"),
            "signal_score": safe_float(payload.get("signalScore")),
            "premium_signal": bool_value(payload.get("premiumSignal")),
            "telegram_eligible": bool_value(payload.get("telegramEligible")),
            "direction": payload.get("direction"),
            "entry": safe_float(payload.get("entry")),
            "stop": safe_float(payload.get("stop")),
            "rr_to_tp1": safe_float(payload.get("rrToTp1")),
            "rr_to_tp2": safe_float(payload.get("rrToTp2")),
            "primary_trigger": payload.get("primaryTrigger"),
            "triggers": payload.get("triggers") if isinstance(payload.get("triggers"), list) else [],
            "created_at": iso_or_none(payload.get("createdAt")),
            "trigger_time": iso_or_none(trigger_time),
            "stored_at": iso_or_none(payload.get("storedAt") or utc_now_iso()),
            "updated_at": utc_now_iso(),
            "engine_version": payload.get("engineVersion"),
            "payload": payload,
        }

        self.safe_request(
            "POST",
            "engine_signal_records",
            params={"on_conflict": "storage_key"},
            body=row,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        return self.last_error is None

    def upsert_outcome(self, outcome: dict[str, Any]) -> bool:
        if not self.enabled or not isinstance(outcome, dict):
            return False

        signal_id = str(outcome.get("signalId") or "").strip()
        symbol = str(outcome.get("symbol") or "").upper().strip()
        if not signal_id or not symbol:
            return False

        trigger_time = outcome.get("triggerTime") or outcome.get("outcomeStartTime") or outcome.get("signalTime")
        row = {
            "signal_id": signal_id,
            "symbol": symbol,
            "setup_slug": outcome.get("setupSlug"),
            "setup_name": outcome.get("setupName"),
            "session_date": date_from_iso(trigger_time or outcome.get("storedAt") or utc_now_iso()),
            "status": outcome.get("status"),
            "result_r": safe_float(outcome.get("resultR")),
            "mfe_r": safe_float(outcome.get("mfeR")),
            "mae_r": safe_float(outcome.get("maeR")),
            "tp1_hit": bool_value(outcome.get("tp1Hit")),
            "tp2_hit": bool_value(outcome.get("tp2Hit")),
            "stop_hit": bool_value(outcome.get("stopHit")),
            "premium_signal": bool_value(outcome.get("premiumSignal")),
            "telegram_eligible": bool_value(outcome.get("telegramEligible")),
            "signal_grade": outcome.get("signalGrade"),
            "quality_status": outcome.get("qualityStatus"),
            "primary_trigger": outcome.get("primaryTrigger"),
            "triggers": outcome.get("triggers") if isinstance(outcome.get("triggers"), list) else [],
            "first_event": outcome.get("firstEvent"),
            "first_event_at": iso_or_none(outcome.get("firstEventAt")),
            "trigger_time": iso_or_none(trigger_time),
            "evaluated_at": iso_or_none(outcome.get("evaluatedAt")),
            "stored_at": iso_or_none(outcome.get("storedAt") or utc_now_iso()),
            "updated_at": utc_now_iso(),
            "engine_version": outcome.get("engineVersion"),
            "payload": outcome,
        }

        self.safe_request(
            "POST",
            "engine_outcome_records",
            params={"on_conflict": "signal_id"},
            body=row,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        return self.last_error is None

    def load_payloads(self, table: str, *, limit: int = 500, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        safe_limit = max(1, min(int(limit or 500), 50000))
        query = {"select": "payload", "limit": str(safe_limit)}
        query.update(params or {})
        data, _headers = self.safe_request("GET", table, params=query)
        if not isinstance(data, list):
            return []
        payloads: list[dict[str, Any]] = []
        for row in data:
            if isinstance(row, dict) and isinstance(row.get("payload"), dict):
                payloads.append(row["payload"])
        return payloads

    def load_outcomes(self, limit: int = 5000) -> list[dict[str, Any]]:
        return self.load_payloads(
            "engine_outcome_records",
            limit=limit,
            params={"order": "stored_at.desc"},
        )

    def load_signals(self, *, limit: int = 100, telegram_only: bool = False, premium_only: bool = False) -> list[dict[str, Any]]:
        params: dict[str, str] = {"order": "stored_at.desc"}
        if telegram_only:
            params["telegram_eligible"] = "eq.true"
        if premium_only:
            params["premium_signal"] = "eq.true"
        return self.load_payloads("engine_signal_records", limit=limit, params=params)

    def load_outcome_source_signals(
        self,
        *,
        session_date: str | None = None,
        limit: int = 500,
        telegram_only: bool = True,
        premium_only: bool = True,
        active_only: bool = True,
        quality_status: str | None = "PASSED",
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {"order": "trigger_time.desc"}
        if session_date:
            params["session_date"] = f"eq.{session_date}"
        if telegram_only:
            params["telegram_eligible"] = "eq.true"
        if premium_only:
            params["premium_signal"] = "eq.true"
        if active_only:
            params["lifecycle_status"] = "eq.ACTIVE"
        if quality_status:
            params["quality_status"] = f"eq.{quality_status}"
        return self.load_payloads("engine_signal_records", limit=limit, params=params)

    def clear_outcomes(self) -> int | None:
        if not self.enabled:
            return None
        # Load count first for response, then delete all rows.
        current = self.load_outcomes(limit=50000)
        self.safe_request("DELETE", "engine_outcome_records", params={"signal_id": "not.is.null"}, prefer="return=minimal")
        return len(current) if self.last_error is None else None

    def get_status(self) -> dict[str, Any]:
        if not self.enabled:
            return {
                "enabled": False,
                "configured": bool(self.url and self.service_key),
                "lastError": self.last_error,
            }

        signals = self.load_signals(limit=50000)
        outcomes = self.load_outcomes(limit=50000)
        closed = [item for item in outcomes if item.get("status") in {"WORKED", "FAILED"}]
        worked = [item for item in outcomes if item.get("status") == "WORKED"]
        failed = [item for item in outcomes if item.get("status") == "FAILED"]
        return {
            "enabled": True,
            "configured": True,
            "url": self.url,
            "signalsCount": len(signals),
            "outcomesCount": len(outcomes),
            "closedOutcomeCount": len(closed),
            "workedOutcomeCount": len(worked),
            "failedOutcomeCount": len(failed),
            "winRateClosed": round(len(worked) / len(closed) * 100, 2) if closed else None,
            "lastError": self.last_error,
        }


class EngineDatabase:
    """Durable storage for the stock engine.

    Writes to SQLite for local/dev safety and, when SUPABASE_URL +
    SUPABASE_SERVICE_ROLE_KEY are present, mirrors the same records to Supabase.
    Reads prefer Supabase when it has data; otherwise they fallback to SQLite.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path).expanduser().resolve() if db_path else default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.supabase = SupabaseRestStore()
        self.init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signal_records (
                    storage_key TEXT PRIMARY KEY,
                    signal_id TEXT,
                    symbol TEXT NOT NULL,
                    setup_slug TEXT,
                    session_date TEXT,
                    lifecycle_status TEXT,
                    quality_status TEXT,
                    signal_grade TEXT,
                    signal_score REAL,
                    premium_signal INTEGER DEFAULT 0,
                    telegram_eligible INTEGER DEFAULT 0,
                    created_at TEXT,
                    trigger_time TEXT,
                    stored_at TEXT,
                    updated_at TEXT,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_signal_records_symbol_setup_date
                ON signal_records(symbol, setup_slug, session_date)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_signal_records_telegram
                ON signal_records(telegram_eligible, session_date)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS outcome_records (
                    signal_id TEXT PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    setup_slug TEXT,
                    session_date TEXT,
                    status TEXT,
                    result_r REAL,
                    mfe_r REAL,
                    mae_r REAL,
                    tp1_hit INTEGER DEFAULT 0,
                    tp2_hit INTEGER DEFAULT 0,
                    stop_hit INTEGER DEFAULT 0,
                    premium_signal INTEGER DEFAULT 0,
                    telegram_eligible INTEGER DEFAULT 0,
                    signal_grade TEXT,
                    quality_status TEXT,
                    primary_trigger TEXT,
                    first_event TEXT,
                    trigger_time TEXT,
                    evaluated_at TEXT,
                    stored_at TEXT,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_outcome_records_setup_status
                ON outcome_records(setup_slug, status)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_outcome_records_symbol_date
                ON outcome_records(symbol, session_date)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_outcome_records_trigger
                ON outcome_records(primary_trigger, status)
                """
            )

    def upsert_signal(self, storage_key: str, record: dict[str, Any]) -> None:
        if not storage_key or not isinstance(record, dict):
            return

        payload = dict(record)
        stored_at = str(payload.get("storedAt") or utc_now_iso())
        payload["storedAt"] = stored_at
        payload["storageVersion"] = STORAGE_VERSION

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO signal_records (
                    storage_key, signal_id, symbol, setup_slug, session_date,
                    lifecycle_status, quality_status, signal_grade, signal_score,
                    premium_signal, telegram_eligible, created_at, trigger_time,
                    stored_at, updated_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(storage_key) DO UPDATE SET
                    signal_id=excluded.signal_id,
                    symbol=excluded.symbol,
                    setup_slug=excluded.setup_slug,
                    session_date=excluded.session_date,
                    lifecycle_status=excluded.lifecycle_status,
                    quality_status=excluded.quality_status,
                    signal_grade=excluded.signal_grade,
                    signal_score=excluded.signal_score,
                    premium_signal=excluded.premium_signal,
                    telegram_eligible=excluded.telegram_eligible,
                    created_at=excluded.created_at,
                    trigger_time=excluded.trigger_time,
                    stored_at=excluded.stored_at,
                    updated_at=excluded.updated_at,
                    payload_json=excluded.payload_json
                """,
                (
                    storage_key,
                    payload.get("signalId"),
                    str(payload.get("symbol") or "").upper(),
                    payload.get("setupSlug"),
                    payload.get("sessionDate"),
                    payload.get("lifecycleStatus") or payload.get("status"),
                    payload.get("qualityStatus"),
                    payload.get("signalGrade"),
                    safe_float(payload.get("signalScore")),
                    safe_bool(payload.get("premiumSignal")),
                    safe_bool(payload.get("telegramEligible")),
                    payload.get("createdAt"),
                    payload.get("triggerTime"),
                    stored_at,
                    utc_now_iso(),
                    to_json(payload),
                ),
            )

        self.supabase.upsert_signal(storage_key, payload)

    def upsert_outcome(self, outcome: dict[str, Any]) -> None:
        if not isinstance(outcome, dict):
            return

        signal_id = str(outcome.get("signalId") or "").strip()
        symbol = str(outcome.get("symbol") or "").upper().strip()
        if not signal_id or not symbol:
            return

        payload = dict(outcome)
        stored_at = str(payload.get("storedAt") or utc_now_iso())
        payload["storedAt"] = stored_at
        payload["storageVersion"] = STORAGE_VERSION
        trigger_time = payload.get("triggerTime") or payload.get("outcomeStartTime") or payload.get("signalTime")
        session_date = str(trigger_time or stored_at)[:10]

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO outcome_records (
                    signal_id, symbol, setup_slug, session_date, status,
                    result_r, mfe_r, mae_r, tp1_hit, tp2_hit, stop_hit,
                    premium_signal, telegram_eligible, signal_grade,
                    quality_status, primary_trigger, first_event, trigger_time,
                    evaluated_at, stored_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(signal_id) DO UPDATE SET
                    symbol=excluded.symbol,
                    setup_slug=excluded.setup_slug,
                    session_date=excluded.session_date,
                    status=excluded.status,
                    result_r=excluded.result_r,
                    mfe_r=excluded.mfe_r,
                    mae_r=excluded.mae_r,
                    tp1_hit=excluded.tp1_hit,
                    tp2_hit=excluded.tp2_hit,
                    stop_hit=excluded.stop_hit,
                    premium_signal=excluded.premium_signal,
                    telegram_eligible=excluded.telegram_eligible,
                    signal_grade=excluded.signal_grade,
                    quality_status=excluded.quality_status,
                    primary_trigger=excluded.primary_trigger,
                    first_event=excluded.first_event,
                    trigger_time=excluded.trigger_time,
                    evaluated_at=excluded.evaluated_at,
                    stored_at=excluded.stored_at,
                    payload_json=excluded.payload_json
                """,
                (
                    signal_id,
                    symbol,
                    payload.get("setupSlug"),
                    session_date,
                    payload.get("status"),
                    safe_float(payload.get("resultR")),
                    safe_float(payload.get("mfeR")),
                    safe_float(payload.get("maeR")),
                    safe_bool(payload.get("tp1Hit")),
                    safe_bool(payload.get("tp2Hit")),
                    safe_bool(payload.get("stopHit")),
                    safe_bool(payload.get("premiumSignal")),
                    safe_bool(payload.get("telegramEligible")),
                    payload.get("signalGrade"),
                    payload.get("qualityStatus"),
                    payload.get("primaryTrigger"),
                    payload.get("firstEvent"),
                    trigger_time,
                    payload.get("evaluatedAt"),
                    stored_at,
                    to_json(payload),
                ),
            )

        self.supabase.upsert_outcome(payload)

    def _sqlite_load_outcomes(self, limit: int = 5000) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 5000), 50000))
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT payload_json
                FROM outcome_records
                ORDER BY COALESCE(evaluated_at, stored_at, trigger_time) DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [from_json(row["payload_json"]) for row in rows]

    def load_outcomes(self, limit: int = 5000) -> list[dict[str, Any]]:
        supabase_items = self.supabase.load_outcomes(limit=limit)
        if supabase_items:
            return supabase_items
        return self._sqlite_load_outcomes(limit=limit)

    def _sqlite_load_signals(
        self,
        *,
        limit: int = 100,
        telegram_only: bool = False,
        premium_only: bool = False,
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 100), 5000))
        where: list[str] = []
        if telegram_only:
            where.append("telegram_eligible = 1")
        if premium_only:
            where.append("premium_signal = 1")
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""

        with self.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT payload_json
                FROM signal_records
                {where_sql}
                ORDER BY COALESCE(created_at, stored_at) DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [from_json(row["payload_json"]) for row in rows]

    def load_signals(
        self,
        *,
        limit: int = 100,
        telegram_only: bool = False,
        premium_only: bool = False,
    ) -> list[dict[str, Any]]:
        supabase_items = self.supabase.load_signals(limit=limit, telegram_only=telegram_only, premium_only=premium_only)
        if supabase_items:
            return supabase_items
        return self._sqlite_load_signals(limit=limit, telegram_only=telegram_only, premium_only=premium_only)

    def _sqlite_load_outcome_source_signals(
        self,
        *,
        session_date: str | None = None,
        limit: int = 500,
        telegram_only: bool = True,
        premium_only: bool = True,
        active_only: bool = True,
        quality_status: str | None = "PASSED",
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 500), 5000))
        where: list[str] = []
        params: list[Any] = []

        if session_date:
            where.append("session_date = ?")
            params.append(session_date)
        if telegram_only:
            where.append("telegram_eligible = 1")
        if premium_only:
            where.append("premium_signal = 1")
        if active_only:
            where.append("UPPER(COALESCE(lifecycle_status, '')) = 'ACTIVE'")
        if quality_status:
            where.append("quality_status = ?")
            params.append(quality_status)

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""

        with self.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT payload_json
                FROM signal_records
                {where_sql}
                ORDER BY COALESCE(trigger_time, created_at, stored_at) DESC
                LIMIT ?
                """,
                (*params, safe_limit),
            ).fetchall()

        return [from_json(row["payload_json"]) for row in rows]

    def load_outcome_source_signals(
        self,
        *,
        session_date: str | None = None,
        limit: int = 500,
        telegram_only: bool = True,
        premium_only: bool = True,
        active_only: bool = True,
        quality_status: str | None = "PASSED",
    ) -> list[dict[str, Any]]:
        supabase_items = self.supabase.load_outcome_source_signals(
            session_date=session_date,
            limit=limit,
            telegram_only=telegram_only,
            premium_only=premium_only,
            active_only=active_only,
            quality_status=quality_status,
        )
        if supabase_items:
            return supabase_items
        return self._sqlite_load_outcome_source_signals(
            session_date=session_date,
            limit=limit,
            telegram_only=telegram_only,
            premium_only=premium_only,
            active_only=active_only,
            quality_status=quality_status,
        )

    def clear_outcomes(self) -> int:
        supabase_cleared = self.supabase.clear_outcomes()
        with self.connect() as conn:
            count = conn.execute("SELECT COUNT(*) AS count FROM outcome_records").fetchone()["count"]
            conn.execute("DELETE FROM outcome_records")
        if isinstance(supabase_cleared, int):
            return max(int(count or 0), supabase_cleared)
        return int(count or 0)

    def _sqlite_status(self) -> dict[str, Any]:
        with self.connect() as conn:
            signals_count = conn.execute("SELECT COUNT(*) AS count FROM signal_records").fetchone()["count"]
            outcomes_count = conn.execute("SELECT COUNT(*) AS count FROM outcome_records").fetchone()["count"]
            closed_count = conn.execute(
                "SELECT COUNT(*) AS count FROM outcome_records WHERE status IN ('WORKED','FAILED')"
            ).fetchone()["count"]
            worked_count = conn.execute(
                "SELECT COUNT(*) AS count FROM outcome_records WHERE status = 'WORKED'"
            ).fetchone()["count"]
            failed_count = conn.execute(
                "SELECT COUNT(*) AS count FROM outcome_records WHERE status = 'FAILED'"
            ).fetchone()["count"]

        return {
            "storageVersion": STORAGE_VERSION,
            "dbPath": str(self.db_path),
            "signalsCount": int(signals_count or 0),
            "outcomesCount": int(outcomes_count or 0),
            "closedOutcomeCount": int(closed_count or 0),
            "workedOutcomeCount": int(worked_count or 0),
            "failedOutcomeCount": int(failed_count or 0),
            "winRateClosed": round((worked_count or 0) / closed_count * 100, 2) if closed_count else None,
        }


    def sync_sqlite_to_supabase(self, *, signal_limit: int = 50000, outcome_limit: int = 50000) -> dict[str, Any]:
        """Backfill existing local SQLite records into Supabase.

        Useful right after adding Supabase: the local engine may already have
        signal_records/outcome_records from today's tests. This copies them to
        Supabase without losing the SQLite fallback.
        """

        if not self.supabase.enabled:
            return {
                "ok": False,
                "reason": "supabase_not_enabled_or_missing_env",
                "supabase": self.supabase.get_status(),
            }

        signals = self._sqlite_load_signals(limit=signal_limit)
        outcomes = self._sqlite_load_outcomes(limit=outcome_limit)
        signal_synced = 0
        outcome_synced = 0

        for record in signals:
            storage_key = str(record.get("storageKey") or "").strip()
            if not storage_key:
                symbol = str(record.get("symbol") or "UNKNOWN").upper().strip()
                setup_slug = str(record.get("setupSlug") or "setup").strip()
                session_date = str(record.get("sessionDate") or record.get("triggerTime") or record.get("createdAt") or utc_now_iso())[:10]
                storage_key = f"{symbol}:{setup_slug}:{session_date}"
                record["storageKey"] = storage_key
            if self.supabase.upsert_signal(storage_key, record):
                signal_synced += 1

        for outcome in outcomes:
            if self.supabase.upsert_outcome(outcome):
                outcome_synced += 1

        return {
            "ok": self.supabase.last_error is None,
            "signalsFound": len(signals),
            "signalsSynced": signal_synced,
            "outcomesFound": len(outcomes),
            "outcomesSynced": outcome_synced,
            "supabase": self.supabase.get_status(),
        }

    def get_status(self) -> dict[str, Any]:
        sqlite_status = self._sqlite_status()
        supabase_status = self.supabase.get_status()
        primary = "supabase" if supabase_status.get("enabled") and supabase_status.get("lastError") is None else "sqlite"
        return {
            **sqlite_status,
            "primaryStore": primary,
            "sqlite": sqlite_status,
            "supabase": supabase_status,
        }

# ---------------------------------------------------------------------------
# S4.10 Algorithm Registry + Night Calibration persistence extensions
# ---------------------------------------------------------------------------

def _calibration_safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None or value == "":
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def _supabase_upsert_algorithm(self: SupabaseRestStore, algorithm: dict[str, Any]) -> bool:
    if not self.enabled or not isinstance(algorithm, dict):
        return False
    setup_slug = str(algorithm.get("setupSlug") or "").strip()
    if not setup_slug:
        return False
    row = {
        "id": algorithm.get("id") or setup_slug,
        "setup_slug": setup_slug,
        "setup_name": algorithm.get("setupName"),
        "family": algorithm.get("family"),
        "asset_type": algorithm.get("assetType") or "stock",
        "direction": algorithm.get("direction"),
        "enabled": bool_value(algorithm.get("enabled")),
        "execution_status": algorithm.get("executionStatus") or "REGISTRY_ONLY",
        "calibration_enabled": bool_value(algorithm.get("calibrationEnabled")),
        "min_closed_for_adjustment": _calibration_safe_int(algorithm.get("minClosedForAdjustment"), 10),
        "min_signals_for_adjustment": _calibration_safe_int(algorithm.get("minSignalsForAdjustment"), 20),
        "payload": algorithm,
        "updated_at": utc_now_iso(),
    }
    self.safe_request(
        "POST",
        "engine_algorithm_registry",
        params={"on_conflict": "setup_slug"},
        body=row,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    return self.last_error is None


def _supabase_upsert_setup_adjustment(self: SupabaseRestStore, adjustment: dict[str, Any]) -> bool:
    if not self.enabled or not isinstance(adjustment, dict):
        return False
    key = str(adjustment.get("adjustmentKey") or "").strip()
    setup_slug = str(adjustment.get("setupSlug") or "").strip()
    if not key or not setup_slug:
        return False
    row = {
        "adjustment_key": key,
        "setup_slug": setup_slug,
        "primary_trigger": adjustment.get("primaryTrigger"),
        "scope": adjustment.get("scope") or "setup_trigger",
        "status": adjustment.get("status") or "INSUFFICIENT_SAMPLE",
        "action": adjustment.get("action") or "OBSERVE",
        "score_adjustment": _calibration_safe_int(adjustment.get("scoreAdjustment"), 0),
        "strictness_adjustment": _calibration_safe_int(adjustment.get("strictnessAdjustment"), 0),
        "risk_adjustment": safe_float(adjustment.get("riskAdjustment")) or 0,
        "sample_count": _calibration_safe_int(adjustment.get("sampleCount"), 0),
        "closed_count": _calibration_safe_int(adjustment.get("closedCount"), 0),
        "worked_count": _calibration_safe_int(adjustment.get("workedCount"), 0),
        "failed_count": _calibration_safe_int(adjustment.get("failedCount"), 0),
        "win_rate_closed": safe_float(adjustment.get("winRateClosed")),
        "avg_result_r_closed": safe_float(adjustment.get("avgResultRClosed")),
        "stop_rate_closed": safe_float(adjustment.get("stopRateClosed")),
        "tp1_rate_closed": safe_float(adjustment.get("tp1RateClosed")),
        "avg_mfe_r": safe_float(adjustment.get("avgMfeR")),
        "avg_mae_r": safe_float(adjustment.get("avgMaeR")),
        "reason": adjustment.get("reason"),
        "run_id": adjustment.get("runId"),
        "valid_for_session_date": adjustment.get("validForSessionDate"),
        "payload": adjustment,
        "updated_at": utc_now_iso(),
    }
    self.safe_request(
        "POST",
        "engine_setup_adjustments",
        params={"on_conflict": "adjustment_key"},
        body=row,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    return self.last_error is None


def _supabase_upsert_calibration_run(self: SupabaseRestStore, run: dict[str, Any]) -> bool:
    if not self.enabled or not isinstance(run, dict):
        return False
    run_id = str(run.get("runId") or "").strip()
    if not run_id:
        return False
    row = {
        "run_id": run_id,
        "session_date": run.get("sessionDate"),
        "algorithm_count": _calibration_safe_int(run.get("algorithmCount"), 0),
        "outcome_count": _calibration_safe_int(run.get("outcomeCount"), 0),
        "closed_count": _calibration_safe_int(run.get("closedCount"), 0),
        "worked_count": _calibration_safe_int(run.get("workedCount"), 0),
        "failed_count": _calibration_safe_int(run.get("failedCount"), 0),
        "adjustment_count": _calibration_safe_int(run.get("adjustmentCount"), 0),
        "win_rate_closed": safe_float(run.get("winRateClosed")),
        "avg_result_r_closed": safe_float(run.get("avgResultRClosed")),
        "status": run.get("status") or "COMPLETED",
        "payload": run,
        "created_at": run.get("createdAt") or utc_now_iso(),
    }
    self.safe_request(
        "POST",
        "engine_calibration_runs",
        params={"on_conflict": "run_id"},
        body=row,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    return self.last_error is None


def _supabase_load_setup_adjustments(self: SupabaseRestStore, limit: int = 500) -> list[dict[str, Any]]:
    return self.load_payloads(
        "engine_setup_adjustments",
        limit=limit,
        params={"order": "updated_at.desc"},
    )


def _supabase_load_calibration_runs(self: SupabaseRestStore, limit: int = 20) -> list[dict[str, Any]]:
    return self.load_payloads(
        "engine_calibration_runs",
        limit=limit,
        params={"order": "created_at.desc"},
    )


def _supabase_load_algorithms(self: SupabaseRestStore, limit: int = 500) -> list[dict[str, Any]]:
    return self.load_payloads(
        "engine_algorithm_registry",
        limit=limit,
        params={"order": "setup_slug.asc"},
    )


SupabaseRestStore.upsert_algorithm = _supabase_upsert_algorithm
SupabaseRestStore.upsert_setup_adjustment = _supabase_upsert_setup_adjustment
SupabaseRestStore.upsert_calibration_run = _supabase_upsert_calibration_run
SupabaseRestStore.load_setup_adjustments = _supabase_load_setup_adjustments
SupabaseRestStore.load_calibration_runs = _supabase_load_calibration_runs
SupabaseRestStore.load_algorithms = _supabase_load_algorithms


def _engine_ensure_calibration_tables(self: EngineDatabase) -> None:
    with self.connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS algorithm_registry (
                setup_slug TEXT PRIMARY KEY,
                setup_name TEXT,
                family TEXT,
                asset_type TEXT,
                direction TEXT,
                enabled INTEGER DEFAULT 1,
                execution_status TEXT,
                calibration_enabled INTEGER DEFAULT 1,
                updated_at TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS setup_adjustments (
                adjustment_key TEXT PRIMARY KEY,
                setup_slug TEXT NOT NULL,
                primary_trigger TEXT,
                scope TEXT,
                status TEXT,
                action TEXT,
                score_adjustment INTEGER DEFAULT 0,
                strictness_adjustment INTEGER DEFAULT 0,
                risk_adjustment REAL DEFAULT 0,
                sample_count INTEGER DEFAULT 0,
                closed_count INTEGER DEFAULT 0,
                worked_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                win_rate_closed REAL,
                avg_result_r_closed REAL,
                stop_rate_closed REAL,
                run_id TEXT,
                valid_for_session_date TEXT,
                updated_at TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS calibration_runs (
                run_id TEXT PRIMARY KEY,
                session_date TEXT,
                algorithm_count INTEGER DEFAULT 0,
                outcome_count INTEGER DEFAULT 0,
                closed_count INTEGER DEFAULT 0,
                worked_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                adjustment_count INTEGER DEFAULT 0,
                win_rate_closed REAL,
                avg_result_r_closed REAL,
                status TEXT,
                created_at TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )


_original_engine_init_db = EngineDatabase.init_db


def _engine_init_db_with_calibration(self: EngineDatabase) -> None:
    _original_engine_init_db(self)
    self.ensure_calibration_tables()


def _engine_upsert_algorithm(self: EngineDatabase, algorithm: dict[str, Any]) -> None:
    if not isinstance(algorithm, dict):
        return
    self.ensure_calibration_tables()
    setup_slug = str(algorithm.get("setupSlug") or "").strip()
    if not setup_slug:
        return
    payload = dict(algorithm)
    payload["storageVersion"] = STORAGE_VERSION
    updated_at = payload.get("updatedAt") or utc_now_iso()
    with self.connect() as conn:
        conn.execute(
            """
            INSERT INTO algorithm_registry (
                setup_slug, setup_name, family, asset_type, direction, enabled,
                execution_status, calibration_enabled, updated_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(setup_slug) DO UPDATE SET
                setup_name=excluded.setup_name,
                family=excluded.family,
                asset_type=excluded.asset_type,
                direction=excluded.direction,
                enabled=excluded.enabled,
                execution_status=excluded.execution_status,
                calibration_enabled=excluded.calibration_enabled,
                updated_at=excluded.updated_at,
                payload_json=excluded.payload_json
            """,
            (
                setup_slug,
                payload.get("setupName"),
                payload.get("family"),
                payload.get("assetType") or "stock",
                payload.get("direction"),
                safe_bool(payload.get("enabled")),
                payload.get("executionStatus"),
                safe_bool(payload.get("calibrationEnabled")),
                updated_at,
                to_json(payload),
            ),
        )
    self.supabase.upsert_algorithm(payload)


def _engine_upsert_algorithms(self: EngineDatabase, algorithms: list[dict[str, Any]]) -> dict[str, Any]:
    count = 0
    for algorithm in algorithms:
        self.upsert_algorithm(algorithm)
        count += 1
    return {"ok": True, "synced": count, "database": self.get_status()}


def _engine_load_algorithms(self: EngineDatabase, limit: int = 500) -> list[dict[str, Any]]:
    self.ensure_calibration_tables()
    supabase_items = self.supabase.load_algorithms(limit=limit)
    if supabase_items:
        return supabase_items
    safe_limit = max(1, min(int(limit or 500), 1000))
    with self.connect() as conn:
        rows = conn.execute(
            "SELECT payload_json FROM algorithm_registry ORDER BY setup_slug ASC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [from_json(row["payload_json"]) for row in rows]


def _engine_upsert_setup_adjustment(self: EngineDatabase, adjustment: dict[str, Any]) -> None:
    if not isinstance(adjustment, dict):
        return
    self.ensure_calibration_tables()
    key = str(adjustment.get("adjustmentKey") or "").strip()
    setup_slug = str(adjustment.get("setupSlug") or "").strip()
    if not key or not setup_slug:
        return
    payload = dict(adjustment)
    payload["storageVersion"] = STORAGE_VERSION
    updated_at = payload.get("updatedAt") or utc_now_iso()
    with self.connect() as conn:
        conn.execute(
            """
            INSERT INTO setup_adjustments (
                adjustment_key, setup_slug, primary_trigger, scope, status, action,
                score_adjustment, strictness_adjustment, risk_adjustment, sample_count,
                closed_count, worked_count, failed_count, win_rate_closed,
                avg_result_r_closed, stop_rate_closed, run_id, valid_for_session_date,
                updated_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(adjustment_key) DO UPDATE SET
                setup_slug=excluded.setup_slug,
                primary_trigger=excluded.primary_trigger,
                scope=excluded.scope,
                status=excluded.status,
                action=excluded.action,
                score_adjustment=excluded.score_adjustment,
                strictness_adjustment=excluded.strictness_adjustment,
                risk_adjustment=excluded.risk_adjustment,
                sample_count=excluded.sample_count,
                closed_count=excluded.closed_count,
                worked_count=excluded.worked_count,
                failed_count=excluded.failed_count,
                win_rate_closed=excluded.win_rate_closed,
                avg_result_r_closed=excluded.avg_result_r_closed,
                stop_rate_closed=excluded.stop_rate_closed,
                run_id=excluded.run_id,
                valid_for_session_date=excluded.valid_for_session_date,
                updated_at=excluded.updated_at,
                payload_json=excluded.payload_json
            """,
            (
                key,
                setup_slug,
                payload.get("primaryTrigger"),
                payload.get("scope") or "setup_trigger",
                payload.get("status") or "INSUFFICIENT_SAMPLE",
                payload.get("action") or "OBSERVE",
                _calibration_safe_int(payload.get("scoreAdjustment"), 0),
                _calibration_safe_int(payload.get("strictnessAdjustment"), 0),
                safe_float(payload.get("riskAdjustment")) or 0,
                _calibration_safe_int(payload.get("sampleCount"), 0),
                _calibration_safe_int(payload.get("closedCount"), 0),
                _calibration_safe_int(payload.get("workedCount"), 0),
                _calibration_safe_int(payload.get("failedCount"), 0),
                safe_float(payload.get("winRateClosed")),
                safe_float(payload.get("avgResultRClosed")),
                safe_float(payload.get("stopRateClosed")),
                payload.get("runId"),
                payload.get("validForSessionDate"),
                updated_at,
                to_json(payload),
            ),
        )
    self.supabase.upsert_setup_adjustment(payload)


def _engine_load_setup_adjustments(self: EngineDatabase, limit: int = 500) -> list[dict[str, Any]]:
    self.ensure_calibration_tables()
    supabase_items = self.supabase.load_setup_adjustments(limit=limit)
    if supabase_items:
        return supabase_items
    safe_limit = max(1, min(int(limit or 500), 5000))
    with self.connect() as conn:
        rows = conn.execute(
            "SELECT payload_json FROM setup_adjustments ORDER BY COALESCE(updated_at, valid_for_session_date) DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [from_json(row["payload_json"]) for row in rows]


def _engine_upsert_calibration_run(self: EngineDatabase, run: dict[str, Any]) -> None:
    if not isinstance(run, dict):
        return
    self.ensure_calibration_tables()
    run_id = str(run.get("runId") or "").strip()
    if not run_id:
        return
    payload = dict(run)
    payload["storageVersion"] = STORAGE_VERSION
    created_at = payload.get("createdAt") or utc_now_iso()
    with self.connect() as conn:
        conn.execute(
            """
            INSERT INTO calibration_runs (
                run_id, session_date, algorithm_count, outcome_count, closed_count,
                worked_count, failed_count, adjustment_count, win_rate_closed,
                avg_result_r_closed, status, created_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                session_date=excluded.session_date,
                algorithm_count=excluded.algorithm_count,
                outcome_count=excluded.outcome_count,
                closed_count=excluded.closed_count,
                worked_count=excluded.worked_count,
                failed_count=excluded.failed_count,
                adjustment_count=excluded.adjustment_count,
                win_rate_closed=excluded.win_rate_closed,
                avg_result_r_closed=excluded.avg_result_r_closed,
                status=excluded.status,
                created_at=excluded.created_at,
                payload_json=excluded.payload_json
            """,
            (
                run_id,
                payload.get("sessionDate"),
                _calibration_safe_int(payload.get("algorithmCount"), 0),
                _calibration_safe_int(payload.get("outcomeCount"), 0),
                _calibration_safe_int(payload.get("closedCount"), 0),
                _calibration_safe_int(payload.get("workedCount"), 0),
                _calibration_safe_int(payload.get("failedCount"), 0),
                _calibration_safe_int(payload.get("adjustmentCount"), 0),
                safe_float(payload.get("winRateClosed")),
                safe_float(payload.get("avgResultRClosed")),
                payload.get("status") or "COMPLETED",
                created_at,
                to_json(payload),
            ),
        )
    self.supabase.upsert_calibration_run(payload)


def _engine_load_calibration_runs(self: EngineDatabase, limit: int = 20) -> list[dict[str, Any]]:
    self.ensure_calibration_tables()
    supabase_items = self.supabase.load_calibration_runs(limit=limit)
    if supabase_items:
        return supabase_items
    safe_limit = max(1, min(int(limit or 20), 500))
    with self.connect() as conn:
        rows = conn.execute(
            "SELECT payload_json FROM calibration_runs ORDER BY created_at DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [from_json(row["payload_json"]) for row in rows]


EngineDatabase.ensure_calibration_tables = _engine_ensure_calibration_tables
EngineDatabase.init_db = _engine_init_db_with_calibration
EngineDatabase.upsert_algorithm = _engine_upsert_algorithm
EngineDatabase.upsert_algorithms = _engine_upsert_algorithms
EngineDatabase.load_algorithms = _engine_load_algorithms
EngineDatabase.upsert_setup_adjustment = _engine_upsert_setup_adjustment
EngineDatabase.load_setup_adjustments = _engine_load_setup_adjustments
EngineDatabase.upsert_calibration_run = _engine_upsert_calibration_run
EngineDatabase.load_calibration_runs = _engine_load_calibration_runs

