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
$MarketRoot = Join-Path $BackendRoot "app\market_data"
$StreamFile = Join-Path $MarketRoot "stream_service.py"
$StateEngineFile = Join-Path $MarketRoot "market_state.py"
$StateTestFile = Join-Path $BackendRoot "tests\test_market_state.py"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$LocalBackup = Join-Path $AuditRoot "S10_6E_DAY5_MARKET_STATE_backup_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6E_DAY5_MARKET_STATE_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6E_DAY5_MARKET_STATE_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6e_day5_market_state_$stamp.sh"
$remoteSh = "/tmp/s10_6e_day5_market_state_$stamp.sh"
$remoteStage = "/tmp/s10_6e_day5_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6E_DAY5_$stamp"

foreach ($dir in @($LocalBackup, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

foreach ($file in @($StreamFile)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file missing: $file"
    }
}

if (Test-Path -LiteralPath $StateEngineFile) {
    Copy-Item -LiteralPath $StateEngineFile -Destination (Join-Path $LocalBackup "market_state.py") -Force
}
if (Test-Path -LiteralPath $StateTestFile) {
    Copy-Item -LiteralPath $StateTestFile -Destination (Join-Path $LocalBackup "test_market_state.py") -Force
}
Copy-Item -LiteralPath $StreamFile -Destination (Join-Path $LocalBackup "stream_service.py") -Force

$marketStateCode = @'
"""Deterministic provider-agnostic real-time market state engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from threading import RLock
from typing import Any
from zoneinfo import ZoneInfo

from .contracts import BboPayload, EventType, MarketEvent, TradePayload

NEW_YORK = ZoneInfo("America/New_York")


@dataclass(slots=True)
class SymbolMarketState:
    symbol: str
    instrument_id: int | None = None
    trading_date_ny: str | None = None
    sequence: int = 0
    first_event_at: datetime | None = None
    last_event_at: datetime | None = None
    last_receive_at: datetime | None = None

    bid_price: Decimal | None = None
    ask_price: Decimal | None = None
    bid_size: int | None = None
    ask_size: int | None = None
    last_trade_price: Decimal | None = None
    last_trade_size: int | None = None

    session_volume: int = 0
    trade_count: int = 0
    bbo_count: int = 0
    total_event_count: int = 0

    high_trade_price: Decimal | None = None
    low_trade_price: Decimal | None = None

    @property
    def spread(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return self.ask_price - self.bid_price

    @property
    def midpoint(self) -> Decimal | None:
        if self.bid_price is None or self.ask_price is None:
            return None
        return (self.bid_price + self.ask_price) / Decimal("2")


class MarketStateEngine:
    """Consumes canonical MarketEvent objects and maintains live symbol state."""

    def __init__(self) -> None:
        self._states: dict[str, SymbolMarketState] = {}
        self._lock = RLock()
        self._global_sequence = 0
        self._applied_events = 0
        self._ignored_events = 0
        self._last_applied_at: datetime | None = None

    def apply(self, event: MarketEvent) -> SymbolMarketState | None:
        if event.event_type not in (EventType.TRADE, EventType.BBO):
            with self._lock:
                self._ignored_events += 1
            return None

        with self._lock:
            state = self._states.get(event.symbol)
            if state is None:
                state = SymbolMarketState(symbol=event.symbol)
                self._states[event.symbol] = state

            trading_date = event.event_time.astimezone(NEW_YORK).date().isoformat()
            if state.trading_date_ny != trading_date:
                self._reset_session(state, trading_date)

            self._global_sequence += 1
            state.sequence = self._global_sequence
            state.instrument_id = event.instrument_id
            state.first_event_at = state.first_event_at or event.event_time
            state.last_event_at = event.event_time
            state.last_receive_at = event.receive_time
            state.total_event_count += 1

            if event.event_type is EventType.TRADE:
                payload = event.payload
                if not isinstance(payload, TradePayload):
                    raise TypeError("TRADE event payload must be TradePayload")
                self._apply_trade(state, payload)

            elif event.event_type is EventType.BBO:
                payload = event.payload
                if not isinstance(payload, BboPayload):
                    raise TypeError("BBO event payload must be BboPayload")
                self._apply_bbo(state, payload)

            self._applied_events += 1
            self._last_applied_at = datetime.now(timezone.utc)
            return state

    def snapshot(self, *, now: datetime | None = None) -> dict[str, Any]:
        generated_at = now or datetime.now(timezone.utc)

        with self._lock:
            symbols = {
                symbol: self._serialize_state(state, generated_at)
                for symbol, state in sorted(self._states.items())
            }

            return {
                "schemaVersion": 1,
                "generatedAt": generated_at.isoformat(),
                "globalSequence": self._global_sequence,
                "appliedEvents": self._applied_events,
                "ignoredEvents": self._ignored_events,
                "symbolCount": len(symbols),
                "lastAppliedAt": (
                    self._last_applied_at.isoformat()
                    if self._last_applied_at
                    else None
                ),
                "symbols": symbols,
            }

    def get(self, symbol: str) -> SymbolMarketState | None:
        with self._lock:
            return self._states.get(symbol.strip().upper())

    @staticmethod
    def _reset_session(state: SymbolMarketState, trading_date: str) -> None:
        state.trading_date_ny = trading_date
        state.first_event_at = None
        state.last_event_at = None
        state.last_receive_at = None
        state.session_volume = 0
        state.trade_count = 0
        state.bbo_count = 0
        state.total_event_count = 0
        state.high_trade_price = None
        state.low_trade_price = None

    @staticmethod
    def _apply_trade(
        state: SymbolMarketState,
        payload: TradePayload,
    ) -> None:
        state.last_trade_price = payload.price
        state.last_trade_size = payload.size
        state.session_volume += payload.size
        state.trade_count += 1

        if (
            state.high_trade_price is None
            or payload.price > state.high_trade_price
        ):
            state.high_trade_price = payload.price

        if (
            state.low_trade_price is None
            or payload.price < state.low_trade_price
        ):
            state.low_trade_price = payload.price

    @staticmethod
    def _apply_bbo(
        state: SymbolMarketState,
        payload: BboPayload,
    ) -> None:
        state.bid_price = payload.bid_price
        state.ask_price = payload.ask_price
        state.bid_size = payload.bid_size
        state.ask_size = payload.ask_size
        state.bbo_count += 1

    @staticmethod
    def _serialize_state(
        state: SymbolMarketState,
        generated_at: datetime,
    ) -> dict[str, Any]:
        event_age = None
        receive_age = None

        if state.last_event_at is not None:
            event_age = (
                generated_at - state.last_event_at
            ).total_seconds()

        if state.last_receive_at is not None:
            receive_age = (
                generated_at - state.last_receive_at
            ).total_seconds()

        return {
            "symbol": state.symbol,
            "instrumentId": state.instrument_id,
            "tradingDateNy": state.trading_date_ny,
            "sequence": state.sequence,
            "firstEventAt": (
                state.first_event_at.isoformat()
                if state.first_event_at
                else None
            ),
            "lastEventAt": (
                state.last_event_at.isoformat()
                if state.last_event_at
                else None
            ),
            "lastReceiveAt": (
                state.last_receive_at.isoformat()
                if state.last_receive_at
                else None
            ),
            "eventAgeSeconds": event_age,
            "receiveAgeSeconds": receive_age,
            "fresh": (
                receive_age is not None and receive_age <= 20
            ),
            "bidPrice": decimal_to_string(state.bid_price),
            "askPrice": decimal_to_string(state.ask_price),
            "bidSize": state.bid_size,
            "askSize": state.ask_size,
            "spread": decimal_to_string(state.spread),
            "midpoint": decimal_to_string(state.midpoint),
            "lastTradePrice": decimal_to_string(state.last_trade_price),
            "lastTradeSize": state.last_trade_size,
            "sessionVolume": state.session_volume,
            "tradeCount": state.trade_count,
            "bboCount": state.bbo_count,
            "totalEventCount": state.total_event_count,
            "highTradePrice": decimal_to_string(state.high_trade_price),
            "lowTradePrice": decimal_to_string(state.low_trade_price),
        }


def decimal_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")
'@

$stateTests = @'
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.market_data.contracts import (
    BboPayload,
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)
from app.market_data.market_state import MarketStateEngine


class MarketStateEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = MarketStateEngine()
        self.now = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)

    def event(self, event_type, payload, *, symbol="AAPL", seconds=0):
        at = self.now + timedelta(seconds=seconds)
        return MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=event_type,
            symbol=symbol,
            instrument_id=38,
            event_time=at,
            receive_time=at + timedelta(milliseconds=1),
            payload=payload,
        )

    def test_bbo_updates_spread_and_midpoint(self) -> None:
        self.engine.apply(
            self.event(
                EventType.BBO,
                BboPayload(
                    bid_price=Decimal("100.00"),
                    ask_price=Decimal("100.10"),
                    bid_size=10,
                    ask_size=20,
                ),
            )
        )

        snapshot = self.engine.snapshot(now=self.now + timedelta(seconds=1))
        state = snapshot["symbols"]["AAPL"]

        self.assertEqual(state["spread"], "0.10")
        self.assertEqual(state["midpoint"], "100.05")
        self.assertEqual(state["bboCount"], 1)

    def test_trade_updates_volume_high_low(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=10),
            )
        )
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("101"), size=20),
                seconds=1,
            )
        )
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("99"), size=5),
                seconds=2,
            )
        )

        state = self.engine.snapshot(
            now=self.now + timedelta(seconds=3)
        )["symbols"]["AAPL"]

        self.assertEqual(state["sessionVolume"], 35)
        self.assertEqual(state["tradeCount"], 3)
        self.assertEqual(state["highTradePrice"], "101")
        self.assertEqual(state["lowTradePrice"], "99")
        self.assertEqual(state["lastTradePrice"], "99")

    def test_sequence_is_global_and_monotonic(self) -> None:
        first = self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=1),
            )
        )
        second = self.engine.apply(
            self.event(
                EventType.BBO,
                BboPayload(
                    bid_price=Decimal("99"),
                    ask_price=Decimal("101"),
                    bid_size=1,
                    ask_size=1,
                ),
                symbol="MSFT",
                seconds=1,
            )
        )

        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)

    def test_new_ny_date_resets_session_counters(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=10),
            )
        )

        next_day = self.now + timedelta(days=1)

        self.engine.apply(
            MarketEvent(
                provider=ProviderName.DATABENTO,
                dataset="EQUS.MINI",
                event_type=EventType.TRADE,
                symbol="AAPL",
                instrument_id=38,
                event_time=next_day,
                receive_time=next_day + timedelta(milliseconds=1),
                payload=TradePayload(price=Decimal("102"), size=3),
            )
        )

        state = self.engine.snapshot(
            now=next_day + timedelta(seconds=1)
        )["symbols"]["AAPL"]

        self.assertEqual(state["sessionVolume"], 3)
        self.assertEqual(state["tradeCount"], 1)
        self.assertEqual(state["highTradePrice"], "102")
        self.assertEqual(state["lowTradePrice"], "102")

    def test_snapshot_freshness(self) -> None:
        self.engine.apply(
            self.event(
                EventType.TRADE,
                TradePayload(price=Decimal("100"), size=1),
            )
        )

        fresh = self.engine.snapshot(
            now=self.now + timedelta(seconds=10)
        )["symbols"]["AAPL"]["fresh"]

        stale = self.engine.snapshot(
            now=self.now + timedelta(seconds=30)
        )["symbols"]["AAPL"]["fresh"]

        self.assertTrue(fresh)
        self.assertFalse(stale)


if __name__ == "__main__":
    unittest.main()
'@

[System.IO.File]::WriteAllText(
    $StateEngineFile,
    $marketStateCode,
    [System.Text.UTF8Encoding]::new($false)
)

[System.IO.File]::WriteAllText(
    $StateTestFile,
    $stateTests,
    [System.Text.UTF8Encoding]::new($false)
)

$streamText = Get-Content -LiteralPath $StreamFile -Raw

if ($streamText -notmatch 'from \.market_state import MarketStateEngine') {
    $streamText = $streamText.Replace(
        'from .databento_adapter import normalize_mbp1_record',
        "from .databento_adapter import normalize_mbp1_record`nfrom .market_state import MarketStateEngine"
    )
}

if ($streamText -notmatch 'MARKET_STATE_PATH') {
    $marker = 'RECONNECT_LEDGER_PATH = Path('
    $insert = @'
MARKET_STATE_PATH = Path(
    os.getenv(
        "SKILLEDGE_MARKET_STATE_PATH",
        str(ENGINE_ROOT / "data" / "market_state_snapshot.json"),
    )
)

'@
    $streamText = $streamText.Replace($marker, $insert + $marker)
}

if ($streamText -notmatch 'self\.market_state = MarketStateEngine\(\)') {
    $streamText = $streamText.Replace(
        '        self.client: db.Live | None = None',
        "        self.client: db.Live | None = None`n        self.market_state = MarketStateEngine()"
    )
}

if ($streamText -notmatch 'self\.market_state\.apply\(event\)') {
    $streamText = $streamText.Replace(
        '            for event in events:',
        "            for event in events:`n                self.market_state.apply(event)"
    )
}

if ($streamText -notmatch 'atomic_write_json\(MARKET_STATE_PATH') {
    $streamText = $streamText.Replace(
        '        atomic_write_json(STATUS_PATH, snapshot)',
        "        atomic_write_json(STATUS_PATH, snapshot)`n        atomic_write_json(MARKET_STATE_PATH, self.market_state.snapshot())"
    )
}

[System.IO.File]::WriteAllText(
    $StreamFile,
    $streamText,
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
        app\market_data\market_state.py `
        app\market_data\stream_service.py `
        tests\test_market_data_contracts.py `
        tests\test_market_stream_service.py `
        tests\test_market_state.py

    if ($LASTEXITCODE -ne 0) {
        throw "Local py_compile failed."
    }

    python -m unittest `
        tests.test_market_data_contracts `
        tests.test_market_stream_service `
        tests.test_market_state `
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

& scp @sshArgs $StateEngineFile "${VpsHost}:$remoteStage/market_state.py"
if ($LASTEXITCODE -ne 0) {
    throw "market_state.py upload failed."
}

& scp @sshArgs $StreamFile "${VpsHost}:$remoteStage/stream_service.py"
if ($LASTEXITCODE -ne 0) {
    throw "stream_service.py upload failed."
}

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
CURRENT_DIR="$ENGINE/app/market_data"
STAGE="__REMOTE_STAGE__"
BACKUP="__REMOTE_BACKUP__"
STATUS="$ENGINE/data/market_stream_status.json"
STATE="$ENGINE/data/market_state_snapshot.json"
UNIT="skilledge-market-stream.service"

mkdir -p "$BACKUP"

for file in market_state.py stream_service.py; do
    if [[ -f "$CURRENT_DIR/$file" ]]; then
        cp -a "$CURRENT_DIR/$file" "$BACKUP/$file"
    fi
done

"$ENGINE/.venv/bin/python" -m py_compile \
    "$STAGE/market_state.py" \
    "$STAGE/stream_service.py"

OLD_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

install -m 0644 "$STAGE/market_state.py" "$CURRENT_DIR/market_state.py"
install -m 0644 "$STAGE/stream_service.py" "$CURRENT_DIR/stream_service.py"

rm -f "$STATE"

systemctl restart "$UNIT"

sleep 8

NEW_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

export ENGINE CURRENT_DIR STAGE BACKUP STATUS STATE UNIT OLD_PID NEW_PID

python3 - <<'PY'
import json
import os
import subprocess
import time
from pathlib import Path

status_path = Path(os.environ["STATUS"])
state_path = Path(os.environ["STATE"])

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def total_events(state):
    if not isinstance(state, dict):
        return 0
    return sum(
        int(item.get("totalEventCount", 0))
        for item in (state.get("symbols") or {}).values()
    )

state_before = read_json(state_path)
events_before = total_events(state_before)
sequence_before = int((state_before or {}).get("globalSequence", 0))

time.sleep(15)

status_after = read_json(status_path)
state_after = read_json(state_path)
events_after = total_events(state_after)
sequence_after = int((state_after or {}).get("globalSequence", 0))

service = run([
    "systemctl",
    "show",
    os.environ["UNIT"],
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,ExecMainStartTimestamp",
])

service_active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

symbols = (state_after or {}).get("symbols") or {}
required_symbols = {"AAPL", "MSFT"}
symbols_present = required_symbols.issubset(set(symbols))

required_fields = {
    "bidPrice",
    "askPrice",
    "spread",
    "midpoint",
    "lastTradePrice",
    "sessionVolume",
    "tradeCount",
    "bboCount",
    "sequence",
    "fresh",
}

fields_ok = all(
    required_fields.issubset(set(symbols[symbol]))
    for symbol in required_symbols
    if symbol in symbols
)

values_ok = all(
    symbols[symbol].get("bidPrice") is not None
    and symbols[symbol].get("askPrice") is not None
    and symbols[symbol].get("lastTradePrice") is not None
    and int(symbols[symbol].get("sessionVolume", 0)) > 0
    and symbols[symbol].get("fresh") is True
    for symbol in required_symbols
    if symbol in symbols
)

growth = events_after > events_before and sequence_after > sequence_before

pid_recovered = (
    os.environ["OLD_PID"]
    and os.environ["NEW_PID"]
    and os.environ["OLD_PID"] != os.environ["NEW_PID"]
    and status_after
    and int(status_after.get("pid", 0)) == int(os.environ["NEW_PID"])
)

status_ok = (
    isinstance(status_after, dict)
    and status_after.get("status") == "OK"
    and status_after.get("ok") is True
)

ok = (
    service_active
    and status_ok
    and isinstance(state_after, dict)
    and state_after.get("schemaVersion") == 1
    and symbols_present
    and fields_ok
    and values_ok
    and growth
    and pid_recovered
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DAY5_MARKET_STATE_ENGINE_VERIFIED"
        if ok
        else "DAY5_MARKET_STATE_ENGINE_GATE_FAILED"
    ),
    "oldPid": int(os.environ["OLD_PID"]) if os.environ["OLD_PID"] else None,
    "newPid": int(os.environ["NEW_PID"]) if os.environ["NEW_PID"] else None,
    "pidRecoveryVerified": pid_recovered,
    "serviceActive": service_active,
    "serviceShow": service,
    "status": status_after,
    "stateBefore": state_before,
    "stateAfter": state_after,
    "eventsBefore": events_before,
    "eventsAfter": events_after,
    "eventGrowth": events_after - events_before,
    "sequenceBefore": sequence_before,
    "sequenceAfter": sequence_after,
    "sequenceGrowth": sequence_after - sequence_before,
    "symbolsPresent": symbols_present,
    "requiredFieldsPresent": fields_ok,
    "liveValuesVerified": values_ok,
    "rollbackSnapshot": os.environ["BACKUP"],
    "changedFiles": [
        str(Path(os.environ["CURRENT_DIR"]) / "market_state.py"),
        str(Path(os.environ["CURRENT_DIR"]) / "stream_service.py"),
    ],
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
Write-Host "=== DEPLOY DAY 5 MARKET STATE ENGINE ===" -ForegroundColor Green
Write-Host "Only skilledge-market-stream.service will restart." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Remote Day 5 command failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"
if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Day 5 returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json
$state = $result.stateAfter

$aapl = $state.symbols.AAPL
$msft = $state.symbols.MSFT

$report = @(
    "S10.6E DAY 5 MARKET STATE ENGINE",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "OLD_PID=$($result.oldPid)",
    "NEW_PID=$($result.newPid)",
    "PID_RECOVERY_VERIFIED=$($result.pidRecoveryVerified)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "SYMBOL_COUNT=$($state.symbolCount)",
    "GLOBAL_SEQUENCE=$($state.globalSequence)",
    "EVENT_GROWTH=$($result.eventGrowth)",
    "SEQUENCE_GROWTH=$($result.sequenceGrowth)",
    "SYMBOLS_PRESENT=$($result.symbolsPresent)",
    "REQUIRED_FIELDS_PRESENT=$($result.requiredFieldsPresent)",
    "LIVE_VALUES_VERIFIED=$($result.liveValuesVerified)",
    "AAPL_BID=$($aapl.bidPrice)",
    "AAPL_ASK=$($aapl.askPrice)",
    "AAPL_LAST=$($aapl.lastTradePrice)",
    "AAPL_SESSION_VOLUME=$($aapl.sessionVolume)",
    "AAPL_FRESH=$($aapl.fresh)",
    "MSFT_BID=$($msft.bidPrice)",
    "MSFT_ASK=$($msft.askPrice)",
    "MSFT_LAST=$($msft.lastTradePrice)",
    "MSFT_SESSION_VOLUME=$($msft.sessionVolume)",
    "MSFT_FRESH=$($msft.fresh)",
    "ROLLBACK=$($result.rollbackSnapshot)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6E_DAY5_MARKET_STATE_$stamp.md"

@"
# S10.6E Day 5 Real-Time Market State Engine

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Old PID: $($result.oldPid)
- New PID: $($result.newPid)
- PID recovery: $($result.pidRecoveryVerified)
- Symbol count: $($state.symbolCount)
- Event growth: $($result.eventGrowth)
- Sequence growth: $($result.sequenceGrowth)
- Required fields: $($result.requiredFieldsPresent)
- Live values: $($result.liveValuesVerified)

Live state now includes:
- bid/ask;
- bid/ask sizes;
- spread;
- midpoint;
- last trade and size;
- session volume;
- trade/BBO counters;
- NY trading date;
- high/low trade price;
- global monotonic sequence;
- event freshness.

Snapshot:
- /opt/skilledge/stock-engine/data/market_state_snapshot.json

Changed:
- app/market_data/market_state.py
- app/market_data/stream_service.py
- market-stream service restarted intentionally.

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
Day 6 candle builder and realtime indicators.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

$nextStepPath = Join-Path $StateRoot "NEXT_STEP.md"

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6E Day 5 Real-Time Market State Engine.

Next:
Day 6 - Candle Builder and Core Indicators.

Scope:
- 1-second, 1-minute and 5-minute OHLCV candles;
- event-time aggregation;
- NY session-aware bucket boundaries;
- VWAP;
- EMA20;
- ATR14;
- HOD/LOD;
- opening range;
- atomic indicator snapshot;
- no scanner/strategy/client cutover yet.
"@ | Set-Content -LiteralPath $nextStepPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6E DAY 5 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Old PID: $($result.oldPid)"
Write-Host "New PID: $($result.newPid)"
Write-Host "PID recovery: $($result.pidRecoveryVerified)"
Write-Host "Symbol count: $($state.symbolCount)"
Write-Host "Event growth: $($result.eventGrowth)"
Write-Host "Sequence growth: $($result.sequenceGrowth)"
Write-Host "AAPL: bid=$($aapl.bidPrice) ask=$($aapl.askPrice) last=$($aapl.lastTradePrice) volume=$($aapl.sessionVolume)"
Write-Host "MSFT: bid=$($msft.bidPrice) ask=$($msft.askPrice) last=$($msft.lastTradePrice) volume=$($msft.sessionVolume)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    throw "Day 5 Market State Engine gate failed."
}
