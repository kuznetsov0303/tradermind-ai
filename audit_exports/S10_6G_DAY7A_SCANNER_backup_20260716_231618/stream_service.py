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
from .candle_engine import CandleIndicatorEngine
from .databento_adapter import normalize_mbp1_record
from .market_state import MarketStateEngine

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
CANDLE_SNAPSHOT_PATH = Path(
    os.getenv(
        "SKILLEDGE_CANDLE_SNAPSHOT_PATH",
        str(ENGINE_ROOT / "data" / "candle_indicator_snapshot.json"),
    )
)
MARKET_STATE_PATH = Path(
    os.getenv(
        "SKILLEDGE_MARKET_STATE_PATH",
        str(ENGINE_ROOT / "data" / "market_state_snapshot.json"),
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
        self.market_state = MarketStateEngine()
        self.candle_engine = CandleIndicatorEngine()

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
                self.market_state.apply(event)
                self.candle_engine.apply(event)
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
        atomic_write_json(MARKET_STATE_PATH, self.market_state.snapshot())
        atomic_write_json(CANDLE_SNAPSHOT_PATH, self.candle_engine.snapshot())

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