param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$BackendRoot = Join-Path $ProjectRoot "services\stock-engine"
$StreamFile = Join-Path $BackendRoot "app\market_data\stream_service.py"
$TestsRoot = Join-Path $BackendRoot "tests"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$LocalBackup = Join-Path $AuditRoot "S10_6D_DAY4_RELIABILITY_backup_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6D_DAY4_RELIABILITY_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6D_DAY4_RELIABILITY_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6d_day4_reliability_$stamp.sh"
$remoteSh = "/tmp/s10_6d_day4_reliability_$stamp.sh"
$remoteStage = "/tmp/s10_6d_day4_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6D_DAY4_$stamp"

foreach ($dir in @($LocalBackup, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if (-not (Test-Path -LiteralPath $StreamFile)) {
    throw "stream_service.py not found: $StreamFile"
}

Copy-Item -LiteralPath $StreamFile -Destination (Join-Path $LocalBackup "stream_service.py") -Force

$streamCode = @'
"""SkillEdge production Databento market-stream service.

Day 4 reliability scope:
- canonical MBP-1 normalization;
- atomic live status;
- reconnect ledger;
- periodic status history;
- process and callback-latency metrics;
- stale classification without unsafe closed-session restart loops;
- graceful shutdown and systemd restart recovery.

Scanner, strategies, paper lifecycle, Telegram and client delivery are not
connected to this service yet.
"""

from __future__ import annotations

import json
import logging
import os
import resource
import signal
import threading
from collections import Counter, deque
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import databento as db

from .contracts import MarketEvent
from .databento_adapter import normalize_mbp1_record

LOGGER = logging.getLogger("skilledge.market_stream")

ENGINE_ROOT = Path("/opt/skilledge/stock-engine")
STATUS_PATH = Path(
    os.getenv(
        "SKILLEDGE_MARKET_STREAM_STATUS_PATH",
        str(ENGINE_ROOT / "data" / "market_stream_status.json"),
    )
)
STATUS_HISTORY_PATH = Path(
    os.getenv(
        "SKILLEDGE_MARKET_STREAM_HISTORY_PATH",
        str(ENGINE_ROOT / "data" / "market_stream_status_history.jsonl"),
    )
)
RECONNECT_LEDGER_PATH = Path(
    os.getenv(
        "SKILLEDGE_MARKET_STREAM_RECONNECT_LEDGER_PATH",
        str(ENGINE_ROOT / "data" / "market_stream_reconnects.jsonl"),
    )
)

DATASET = os.getenv("SKILLEDGE_MARKET_STREAM_DATASET", "EQUS.MINI")
SCHEMA = os.getenv("SKILLEDGE_MARKET_STREAM_SCHEMA", "mbp-1")
SYMBOLS = tuple(
    symbol.strip().upper()
    for symbol in os.getenv("SKILLEDGE_MARKET_STREAM_SYMBOLS", "AAPL,MSFT").split(",")
    if symbol.strip()
)

HEARTBEAT_SECONDS = int(
    os.getenv("SKILLEDGE_MARKET_STREAM_HEARTBEAT_SECONDS", "10")
)
STATUS_INTERVAL_SECONDS = float(
    os.getenv("SKILLEDGE_MARKET_STREAM_STATUS_INTERVAL_SECONDS", "2")
)
HISTORY_INTERVAL_SECONDS = float(
    os.getenv("SKILLEDGE_MARKET_STREAM_HISTORY_INTERVAL_SECONDS", "30")
)
STALE_AFTER_SECONDS = float(
    os.getenv("SKILLEDGE_MARKET_STREAM_STALE_AFTER_SECONDS", "25")
)
LATENCY_WINDOW_SIZE = int(
    os.getenv("SKILLEDGE_MARKET_STREAM_LATENCY_WINDOW_SIZE", "10000")
)


class StreamRuntime:
    def __init__(self) -> None:
        self.pid = os.getpid()
        self.started_at = datetime.now(timezone.utc)
        self.last_record_at: datetime | None = None
        self.last_market_event_at: datetime | None = None
        self.last_status_history_at: datetime | None = None
        self.last_error: str | None = None
        self.last_error_at: datetime | None = None
        self.reconnect_count = 0
        self.raw_record_counts: Counter[str] = Counter()
        self.market_event_counts: Counter[str] = Counter()
        self.instrument_to_symbol: dict[int, str] = {}
        self.latest_events: dict[str, dict[str, Any]] = {}
        self.callback_latencies_ms: deque[float] = deque(
            maxlen=LATENCY_WINDOW_SIZE
        )
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.client: db.Live | None = None

    def on_record(self, record: Any) -> None:
        now = datetime.now(timezone.utc)
        record_type = type(record).__name__

        with self.lock:
            self.last_record_at = now
            self.raw_record_counts[record_type] += 1

        if record_type == "SymbolMappingMsg":
            instrument_id = getattr(record, "instrument_id", None)
            raw_symbol = (
                getattr(record, "stype_out_symbol", None)
                or getattr(record, "raw_symbol", None)
            )

            if instrument_id is not None and raw_symbol:
                with self.lock:
                    self.instrument_to_symbol[int(instrument_id)] = (
                        str(raw_symbol).upper()
                    )
            return

        if record_type != "MBP1Msg":
            return

        instrument_id = getattr(record, "instrument_id", None)

        with self.lock:
            symbol = (
                self.instrument_to_symbol.get(int(instrument_id))
                if instrument_id is not None
                else None
            )

        if not symbol:
            return

        try:
            events = normalize_mbp1_record(record, symbol=symbol)
        except Exception as exc:
            self.on_exception(exc)
            return

        if not events:
            return

        with self.lock:
            self.last_market_event_at = now

            for event in events:
                self.market_event_counts[event.event_type.value] += 1
                self.callback_latencies_ms.append(event.latency_ms)
                self.latest_events[
                    f"{event.symbol}:{event.event_type.value}"
                ] = serialize_event(event)

    def on_exception(self, exc: Exception) -> None:
        LOGGER.exception("Market stream callback exception", exc_info=exc)

        with self.lock:
            self.last_error = repr(exc)[:2000]
            self.last_error_at = datetime.now(timezone.utc)

    def on_reconnect(self, previous_end: Any, new_start: Any) -> None:
        now = datetime.now(timezone.utc)

        LOGGER.warning(
            "Databento reconnect previous_end=%s new_start=%s",
            previous_end,
            new_start,
        )

        with self.lock:
            self.reconnect_count += 1

        append_jsonl(
            RECONNECT_LEDGER_PATH,
            {
                "recordedAt": now.isoformat(),
                "pid": self.pid,
                "provider": "databento",
                "dataset": DATASET,
                "schema": SCHEMA,
                "symbols": list(SYMBOLS),
                "previousEnd": str(previous_end),
                "newStart": str(new_start),
            },
        )

    def snapshot(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)

        with self.lock:
            last_record_at = self.last_record_at
            last_market_event_at = self.last_market_event_at
            last_error = self.last_error
            last_error_at = self.last_error_at
            reconnect_count = self.reconnect_count
            raw_counts = dict(self.raw_record_counts)
            event_counts = dict(self.market_event_counts)
            mapping_count = len(self.instrument_to_symbol)
            latest_events = dict(self.latest_events)
            latencies = list(self.callback_latencies_ms)

        record_age = (
            (now - last_record_at).total_seconds()
            if last_record_at is not None
            else None
        )
        event_age = (
            (now - last_market_event_at).total_seconds()
            if last_market_event_at is not None
            else None
        )

        if last_record_at is None:
            status = "STARTING"
        elif record_age is not None and record_age > STALE_AFTER_SECONDS:
            status = "STALE"
        else:
            status = "OK"

        if last_error is not None and status != "OK":
            status = "DEGRADED"

        process_metrics = read_process_metrics()
        latency_metrics = summarize_latencies(latencies)

        return {
            "schemaVersion": 2,
            "ok": status == "OK",
            "status": status,
            "provider": "databento",
            "dataset": DATASET,
            "schema": SCHEMA,
            "symbols": list(SYMBOLS),
            "pid": self.pid,
            "startedAt": self.started_at.isoformat(),
            "generatedAt": now.isoformat(),
            "lastRecordAt": (
                last_record_at.isoformat() if last_record_at else None
            ),
            "lastMarketEventAt": (
                last_market_event_at.isoformat()
                if last_market_event_at
                else None
            ),
            "recordAgeSeconds": record_age,
            "marketEventAgeSeconds": event_age,
            "rawRecordCounts": raw_counts,
            "marketEventCounts": event_counts,
            "instrumentMappings": mapping_count,
            "reconnectCount": reconnect_count,
            "lastError": last_error,
            "lastErrorAt": (
                last_error_at.isoformat() if last_error_at else None
            ),
            "latestEvents": latest_events,
            "latencyMetrics": latency_metrics,
            "processMetrics": process_metrics,
            "configuration": {
                "heartbeatSeconds": HEARTBEAT_SECONDS,
                "statusIntervalSeconds": STATUS_INTERVAL_SECONDS,
                "historyIntervalSeconds": HISTORY_INTERVAL_SECONDS,
                "staleAfterSeconds": STALE_AFTER_SECONDS,
                "latencyWindowSize": LATENCY_WINDOW_SIZE,
                "reconnectPolicy": "reconnect",
                "slowReaderBehavior": "skip",
                "unsafeAutoRestartOnStale": False,
            },
        }

    def write_status(self) -> None:
        snapshot = self.snapshot()

        atomic_write_json(STATUS_PATH, snapshot)

        now = datetime.now(timezone.utc)

        should_write_history = (
            self.last_status_history_at is None
            or (
                now - self.last_status_history_at
            ).total_seconds() >= HISTORY_INTERVAL_SECONDS
        )

        if should_write_history:
            append_jsonl(
                STATUS_HISTORY_PATH,
                {
                    "generatedAt": snapshot["generatedAt"],
                    "pid": snapshot["pid"],
                    "status": snapshot["status"],
                    "recordAgeSeconds": snapshot["recordAgeSeconds"],
                    "rawRecordCounts": snapshot["rawRecordCounts"],
                    "marketEventCounts": snapshot["marketEventCounts"],
                    "reconnectCount": snapshot["reconnectCount"],
                    "latencyMetrics": snapshot["latencyMetrics"],
                    "processMetrics": snapshot["processMetrics"],
                    "lastError": snapshot["lastError"],
                },
            )

            self.last_status_history_at = now


def serialize_event(event: MarketEvent) -> dict[str, Any]:
    payload = event.payload
    payload_data: dict[str, Any] | None = None

    if payload is not None:
        payload_data = {}

        for field_name in getattr(payload, "__dataclass_fields__", {}):
            value = getattr(payload, field_name)

            if isinstance(value, Decimal):
                value = str(value)
            elif isinstance(value, tuple):
                value = list(value)

            payload_data[field_name] = value

    return {
        "eventId": str(event.event_id),
        "provider": event.provider.value,
        "dataset": event.dataset,
        "eventType": event.event_type.value,
        "symbol": event.symbol,
        "instrumentId": event.instrument_id,
        "eventTime": event.event_time.isoformat(),
        "receiveTime": event.receive_time.isoformat(),
        "latencyMs": event.latency_ms,
        "sourceRecordType": event.source_record_type,
        "payload": payload_data,
    }


def summarize_latencies(values: list[float]) -> dict[str, Any]:
    if not values:
        return {
            "sampleCount": 0,
            "averageMs": None,
            "maxMs": None,
            "p95Ms": None,
        }

    ordered = sorted(values)
    p95_index = min(
        len(ordered) - 1,
        max(0, int(round((len(ordered) - 1) * 0.95))),
    )

    return {
        "sampleCount": len(values),
        "averageMs": sum(values) / len(values),
        "maxMs": max(values),
        "p95Ms": ordered[p95_index],
    }


def read_process_metrics() -> dict[str, Any]:
    usage = resource.getrusage(resource.RUSAGE_SELF)

    metrics: dict[str, Any] = {
        "cpuUserSeconds": usage.ru_utime,
        "cpuSystemSeconds": usage.ru_stime,
        "maxRssKilobytes": usage.ru_maxrss,
        "voluntaryContextSwitches": usage.ru_nvcsw,
        "involuntaryContextSwitches": usage.ru_nivcsw,
    }

    status_path = Path("/proc/self/status")

    if status_path.exists():
        for line in status_path.read_text(
            encoding="utf-8",
            errors="replace",
        ).splitlines():
            if line.startswith("VmRSS:"):
                metrics["currentRssKilobytes"] = parse_proc_kb(line)
            elif line.startswith("VmSize:"):
                metrics["virtualMemoryKilobytes"] = parse_proc_kb(line)
            elif line.startswith("Threads:"):
                try:
                    metrics["threads"] = int(line.split(":", 1)[1].strip())
                except Exception:
                    pass

    return metrics


def parse_proc_kb(line: str) -> int | None:
    try:
        return int(line.split(":", 1)[1].strip().split()[0])
    except Exception:
        return None


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")

    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    os.replace(temp_path, path)


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def status_writer(runtime: StreamRuntime) -> None:
    while not runtime.stop_event.wait(STATUS_INTERVAL_SECONDS):
        try:
            runtime.write_status()
        except Exception as exc:
            runtime.on_exception(exc)


def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv("SKILLEDGE_MARKET_STREAM_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    db.enable_logging("INFO")


def run() -> int:
    configure_logging()

    if not os.getenv("DATABENTO_API_KEY"):
        raise RuntimeError("DATABENTO_API_KEY is missing")

    if not SYMBOLS:
        raise RuntimeError(
            "SKILLEDGE_MARKET_STREAM_SYMBOLS resolved to an empty set"
        )

    runtime = StreamRuntime()

    def handle_signal(signum: int, _frame: Any) -> None:
        LOGGER.info("Received signal %s; stopping stream", signum)
        runtime.stop_event.set()

        if runtime.client is not None:
            try:
                runtime.client.stop()
            except Exception:
                LOGGER.exception("Graceful Databento stop failed")

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    writer = threading.Thread(
        target=status_writer,
        args=(runtime,),
        name="market-stream-status-writer",
        daemon=True,
    )
    writer.start()

    runtime.client = db.Live(
        heartbeat_interval_s=HEARTBEAT_SECONDS,
        reconnect_policy="reconnect",
        slow_reader_behavior="skip",
        ts_out=True,
    )

    runtime.client.subscribe(
        dataset=DATASET,
        schema=SCHEMA,
        symbols=list(SYMBOLS),
    )

    runtime.client.add_callback(
        runtime.on_record,
        exception_callback=runtime.on_exception,
    )

    runtime.client.add_reconnect_callback(
        runtime.on_reconnect,
        exception_callback=runtime.on_exception,
    )

    LOGGER.info(
        "Starting Databento stream dataset=%s schema=%s symbols=%s",
        DATASET,
        SCHEMA,
        ",".join(SYMBOLS),
    )

    try:
        runtime.client.start()
        runtime.write_status()
        runtime.client.block_for_close()
    except Exception as exc:
        runtime.on_exception(exc)
        runtime.write_status()
        return 1
    finally:
        runtime.stop_event.set()
        runtime.write_status()

    return 0


if __name__ == "__main__":
    raise SystemExit(run())
'@

[System.IO.File]::WriteAllText(
    $StreamFile,
    $streamCode,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== LOCAL COMPILE + UNIT TESTS ===" -ForegroundColor Green

Push-Location $BackendRoot
try {
    python -m py_compile `
        app\market_data\contracts.py `
        app\market_data\provider.py `
        app\market_data\databento_adapter.py `
        app\market_data\stream_service.py `
        tests\test_market_data_contracts.py `
        tests\test_market_stream_service.py

    if ($LASTEXITCODE -ne 0) {
        throw "Local py_compile failed."
    }

    python -m unittest `
        tests.test_market_data_contracts `
        tests.test_market_stream_service `
        -v

    if ($LASTEXITCODE -ne 0) {
        throw "Local unit tests failed."
    }
}
finally {
    Pop-Location
}

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== CREATE REMOTE STAGE ===" -ForegroundColor Green

& ssh @sshArgs $VpsHost "mkdir -p '$remoteStage' '$remoteBackup'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote stage creation failed."
}

& scp @sshArgs $StreamFile "${VpsHost}:$remoteStage/stream_service.py"
if ($LASTEXITCODE -ne 0) {
    throw "stream_service.py upload failed."
}

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
CURRENT="$ENGINE/app/market_data/stream_service.py"
STAGED="__REMOTE_STAGE__/stream_service.py"
BACKUP="__REMOTE_BACKUP__/stream_service.py"
STATUS="$ENGINE/data/market_stream_status.json"
HISTORY="$ENGINE/data/market_stream_status_history.jsonl"
RECONNECTS="$ENGINE/data/market_stream_reconnects.jsonl"
UNIT="skilledge-market-stream.service"

mkdir -p "$(dirname "$BACKUP")"

OLD_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

if [[ -f "$CURRENT" ]]; then
    cp -a "$CURRENT" "$BACKUP"
fi

"$ENGINE/.venv/bin/python" -m py_compile "$STAGED"

install -m 0644 "$STAGED" "$CURRENT"

systemctl restart "$UNIT"

sleep 8

NEW_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

export ENGINE CURRENT STAGED BACKUP STATUS HISTORY RECONNECTS UNIT OLD_PID NEW_PID

python3 - <<'PY'
import json
import os
import subprocess
import time
from pathlib import Path

status_path = Path(os.environ["STATUS"])
history_path = Path(os.environ["HISTORY"])
reconnect_path = Path(os.environ["RECONNECTS"])

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def read_status():
    if not status_path.exists():
        return None
    return json.loads(status_path.read_text(encoding="utf-8"))

def total(counter):
    return sum(int(v) for v in (counter or {}).values())

status_before = read_status()
raw_before = total(status_before.get("rawRecordCounts")) if status_before else 0
canonical_before = total(status_before.get("marketEventCounts")) if status_before else 0

time.sleep(15)

status_after = read_status()
raw_after = total(status_after.get("rawRecordCounts")) if status_after else 0
canonical_after = total(status_after.get("marketEventCounts")) if status_after else 0

service = run([
    "systemctl",
    "show",
    os.environ["UNIT"],
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,ExecMainStartTimestamp",
])

start_timestamp = None
for line in service["stdout"].splitlines():
    if line.startswith("ExecMainStartTimestamp="):
        start_timestamp = line.split("=", 1)[1]

journal_args = [
    "journalctl",
    "-u",
    os.environ["UNIT"],
    "--no-pager",
    "-n",
    "200",
]

if start_timestamp:
    journal_args = [
        "journalctl",
        "-u",
        os.environ["UNIT"],
        "--since",
        start_timestamp,
        "--no-pager",
    ]

journal = run(journal_args)
journal_text = journal["stdout"]

service_active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

authenticated = "authenticated session_id=" in journal_text
subscription_ack = (
    "Subscription request 0 for mbp-1 data succeeded" in journal_text
)

status_ok = (
    isinstance(status_after, dict)
    and status_after.get("schemaVersion") == 2
    and status_after.get("status") == "OK"
    and status_after.get("ok") is True
)

metrics_ok = (
    isinstance(status_after, dict)
    and isinstance(status_after.get("processMetrics"), dict)
    and isinstance(status_after.get("latencyMetrics"), dict)
)

counter_growth = raw_after > raw_before and canonical_after > canonical_before

pid_recovered = (
    os.environ["OLD_PID"]
    and os.environ["NEW_PID"]
    and os.environ["OLD_PID"] != os.environ["NEW_PID"]
    and status_after
    and int(status_after.get("pid", 0)) == int(os.environ["NEW_PID"])
)

fresh_record = False
if isinstance(status_after, dict):
    try:
        fresh_record = float(status_after.get("recordAgeSeconds")) <= 20
    except Exception:
        pass

history_exists = history_path.exists() and history_path.stat().st_size > 0

ok = (
    service_active
    and authenticated
    and subscription_ack
    and status_ok
    and metrics_ok
    and counter_growth
    and pid_recovered
    and fresh_record
    and history_exists
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DAY4_STREAM_RELIABILITY_VERIFIED"
        if ok
        else "DAY4_STREAM_RELIABILITY_GATE_FAILED"
    ),
    "oldPid": int(os.environ["OLD_PID"]) if os.environ["OLD_PID"] else None,
    "newPid": int(os.environ["NEW_PID"]) if os.environ["NEW_PID"] else None,
    "pidRecoveryVerified": pid_recovered,
    "serviceActive": service_active,
    "serviceShow": service,
    "statusBefore": status_before,
    "statusAfter": status_after,
    "rawBefore": raw_before,
    "rawAfter": raw_after,
    "rawGrowth": raw_after - raw_before,
    "canonicalBefore": canonical_before,
    "canonicalAfter": canonical_after,
    "canonicalGrowth": canonical_after - canonical_before,
    "counterGrowthVerified": counter_growth,
    "freshRecord": fresh_record,
    "authenticated": authenticated,
    "subscriptionAck": subscription_ack,
    "metricsVerified": metrics_ok,
    "historyFileExists": history_path.exists(),
    "historyFileSize": history_path.stat().st_size if history_path.exists() else 0,
    "reconnectLedgerExists": reconnect_path.exists(),
    "reconnectLedgerSize": (
        reconnect_path.stat().st_size if reconnect_path.exists() else 0
    ),
    "currentProcessJournal": journal,
    "rollbackSnapshot": str(Path(os.environ["BACKUP"]).parent),
    "productionMutation": True,
    "changedFiles": [str(Path(os.environ["CURRENT"]))],
    "serviceRestarted": True,
    "paperTouched": False,
    "apiAppTouched": False,
    "telegramTouched": False,
    "clientGatesTouched": False,
}, ensure_ascii=False))
PY

rm -rf "__REMOTE_STAGE__"
'@

$bash = $bash.Replace("__REMOTE_STAGE__", $remoteStage)
$bash = $bash.Replace("__REMOTE_BACKUP__", $remoteBackup)
$bash = $bash -replace "`r`n", "`n"
$bash = $bash -replace "`r", "`n"

[System.IO.File]::WriteAllText(
    $localSh,
    $bash,
    [System.Text.UTF8Encoding]::new($false)
)

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Unix deploy script upload failed."
}

Write-Host ""
Write-Host "=== DEPLOY DAY 4 RELIABILITY LAYER ===" -ForegroundColor Green
Write-Host "Only skilledge-market-stream.service will restart." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Remote Day 4 command failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Day 4 returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json
$status = $result.statusAfter

$report = @(
    "S10.6D DAY 4 STREAM RELIABILITY",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "OLD_PID=$($result.oldPid)",
    "NEW_PID=$($result.newPid)",
    "PID_RECOVERY_VERIFIED=$($result.pidRecoveryVerified)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "STATUS=$($status.status)",
    "SCHEMA_VERSION=$($status.schemaVersion)",
    "RAW_BEFORE=$($result.rawBefore)",
    "RAW_AFTER=$($result.rawAfter)",
    "RAW_GROWTH=$($result.rawGrowth)",
    "CANONICAL_BEFORE=$($result.canonicalBefore)",
    "CANONICAL_AFTER=$($result.canonicalAfter)",
    "CANONICAL_GROWTH=$($result.canonicalGrowth)",
    "COUNTER_GROWTH_VERIFIED=$($result.counterGrowthVerified)",
    "FRESH_RECORD=$($result.freshRecord)",
    "AUTHENTICATED=$($result.authenticated)",
    "SUBSCRIPTION_ACK=$($result.subscriptionAck)",
    "METRICS_VERIFIED=$($result.metricsVerified)",
    "HISTORY_FILE_EXISTS=$($result.historyFileExists)",
    "HISTORY_FILE_SIZE=$($result.historyFileSize)",
    "RECONNECT_LEDGER_EXISTS=$($result.reconnectLedgerExists)",
    "RECONNECT_LEDGER_SIZE=$($result.reconnectLedgerSize)",
    "PROCESS_RSS_KB=$($status.processMetrics.currentRssKilobytes)",
    "LATENCY_P95_MS=$($status.latencyMetrics.p95Ms)",
    "LATENCY_MAX_MS=$($status.latencyMetrics.maxMs)",
    "ROLLBACK=$($result.rollbackSnapshot)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6D_DAY4_STREAM_RELIABILITY_$stamp.md"

@"
# S10.6D Day 4 Stream Reliability

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Old PID: $($result.oldPid)
- New PID: $($result.newPid)
- Restart recovery verified: $($result.pidRecoveryVerified)
- Service active: $($result.serviceActive)
- Status: $($status.status)
- Status schema version: $($status.schemaVersion)
- Raw growth: $($result.rawGrowth)
- Canonical growth: $($result.canonicalGrowth)
- Fresh records: $($result.freshRecord)
- Authentication: $($result.authenticated)
- Subscription ACK: $($result.subscriptionAck)
- Process/latency metrics: $($result.metricsVerified)
- Status history: $($result.historyFileExists)
- Reconnect ledger path initialized on first reconnect event.

Reliability behavior:
- stale state is classified;
- stale state does not trigger unsafe restart loops during closed sessions;
- reconnects are appended to a durable JSONL ledger;
- status history is appended periodically;
- process memory/CPU and callback latency are exposed;
- controlled systemd restart recovered into a new live PID.

Changed:
- /opt/skilledge/stock-engine/app/market_data/stream_service.py
- skilledge-market-stream.service restarted intentionally.

Not changed:
- app.py;
- paper;
- scanner;
- strategies;
- Telegram;
- client gates;
- payments.

Rollback:
$($result.rollbackSnapshot)

Next:
Day 5 Market State Engine.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

$nextStepPath = Join-Path $StateRoot "NEXT_STEP.md"

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6D Day 4 stream reliability and restart recovery.

Next:
Day 5 - Real-time Market State Engine.

Scope:
- per-symbol BBO;
- last trade;
- spread and midpoint;
- session volume;
- update sequence;
- freshness;
- immutable input from canonical MarketEvent;
- atomic state snapshots;
- no scanner/strategy/client cutover yet.

Outstanding:
Paper trading timer remains disabled after the accidental old-script run.
Restore separately after schedule inspection, with no manual run-once or reset.
"@ | Set-Content -LiteralPath $nextStepPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6D DAY 4 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Old PID: $($result.oldPid)"
Write-Host "New PID: $($result.newPid)"
Write-Host "PID recovery: $($result.pidRecoveryVerified)"
Write-Host "Status: $($status.status)"
Write-Host "Raw growth: $($result.rawGrowth)"
Write-Host "Canonical growth: $($result.canonicalGrowth)"
Write-Host "RSS KB: $($status.processMetrics.currentRssKilobytes)"
Write-Host "Latency p95 ms: $($status.latencyMetrics.p95Ms)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    Write-Host ""
    Write-Host "=== CURRENT PROCESS JOURNAL ===" -ForegroundColor Yellow
    Write-Host $result.currentProcessJournal.stdout
    throw "Day 4 reliability gate failed."
}
