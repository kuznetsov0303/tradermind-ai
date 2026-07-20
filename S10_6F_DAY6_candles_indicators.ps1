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
$CandleFile = Join-Path $MarketRoot "candle_engine.py"
$TestFile = Join-Path $BackendRoot "tests\test_candle_engine.py"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
$BackupRoot = Join-Path $AuditRoot "S10_6F_DAY6_CANDLES_backup_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6F_DAY6_CANDLES_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6F_DAY6_CANDLES_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6f_day6_candles_$stamp.sh"
$remoteSh = "/tmp/s10_6f_day6_candles_$stamp.sh"
$remoteStage = "/tmp/s10_6f_day6_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6F_DAY6_$stamp"

foreach ($dir in @($BackupRoot, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

foreach ($file in @($StreamFile)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file missing: $file"
    }
}

Copy-Item -LiteralPath $StreamFile -Destination (Join-Path $BackupRoot "stream_service.py") -Force
if (Test-Path -LiteralPath $CandleFile) {
    Copy-Item -LiteralPath $CandleFile -Destination (Join-Path $BackupRoot "candle_engine.py") -Force
}
if (Test-Path -LiteralPath $TestFile) {
    Copy-Item -LiteralPath $TestFile -Destination (Join-Path $BackupRoot "test_candle_engine.py") -Force
}

$candleCode = @'
"""Event-time OHLCV candles and deterministic core indicators."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from threading import RLock
from typing import Any
from zoneinfo import ZoneInfo

from .contracts import EventType, MarketEvent, TradePayload

NEW_YORK = ZoneInfo("America/New_York")
INTERVALS = {"1s": 1, "1m": 60, "5m": 300}


@dataclass(slots=True)
class Candle:
    symbol: str
    interval: str
    start: datetime
    end: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int = 0
    trade_count: int = 0
    complete: bool = False

    def update(self, price: Decimal, size: int) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.volume += size
        self.trade_count += 1


class CandleIndicatorEngine:
    def __init__(self, max_closed_per_interval: int = 500) -> None:
        self._lock = RLock()
        self._active: dict[tuple[str, str], Candle] = {}
        self._closed: dict[tuple[str, str], list[Candle]] = {}
        self._max_closed = max_closed_per_interval
        self._session_date: dict[str, str] = {}
        self._cum_pv: dict[str, Decimal] = {}
        self._cum_volume: dict[str, int] = {}
        self._hod: dict[str, Decimal] = {}
        self._lod: dict[str, Decimal] = {}
        self._opening_range: dict[str, dict[str, Decimal | bool | None]] = {}
        self._applied_trades = 0
        self._last_trade_at: datetime | None = None

    def apply(self, event: MarketEvent) -> None:
        if event.event_type is not EventType.TRADE:
            return
        if not isinstance(event.payload, TradePayload):
            raise TypeError("TRADE payload must be TradePayload")

        with self._lock:
            self._roll_session_if_needed(event)
            price = event.payload.price
            size = event.payload.size
            symbol = event.symbol

            self._cum_pv[symbol] = (
                self._cum_pv.get(symbol, Decimal("0"))
                + price * Decimal(size)
            )
            self._cum_volume[symbol] = self._cum_volume.get(symbol, 0) + size
            self._hod[symbol] = max(self._hod.get(symbol, price), price)
            self._lod[symbol] = min(self._lod.get(symbol, price), price)
            self._update_opening_range(event)

            for interval, seconds in INTERVALS.items():
                self._apply_interval(event, interval, seconds)

            self._applied_trades += 1
            self._last_trade_at = event.event_time

    def snapshot(self, now: datetime | None = None) -> dict[str, Any]:
        generated = now or datetime.now(timezone.utc)
        with self._lock:
            symbols = sorted(
                set(self._session_date)
                | {symbol for symbol, _ in self._active}
            )
            return {
                "schemaVersion": 1,
                "generatedAt": generated.isoformat(),
                "appliedTrades": self._applied_trades,
                "lastTradeAt": (
                    self._last_trade_at.isoformat()
                    if self._last_trade_at else None
                ),
                "symbolCount": len(symbols),
                "symbols": {
                    symbol: self._symbol_snapshot(symbol, generated)
                    for symbol in symbols
                },
            }

    def _apply_interval(
        self,
        event: MarketEvent,
        interval: str,
        seconds: int,
    ) -> None:
        key = (event.symbol, interval)
        bucket_start = floor_time(event.event_time, seconds)
        bucket_end = bucket_start + timedelta(seconds=seconds)
        price = event.payload.price
        size = event.payload.size
        active = self._active.get(key)

        if active is None or active.start != bucket_start:
            if active is not None:
                active.complete = True
                closed = self._closed.setdefault(key, [])
                closed.append(active)
                del closed[:-self._max_closed]

            active = Candle(
                symbol=event.symbol,
                interval=interval,
                start=bucket_start,
                end=bucket_end,
                open=price,
                high=price,
                low=price,
                close=price,
            )
            self._active[key] = active

        active.update(price, size)

    def _roll_session_if_needed(self, event: MarketEvent) -> None:
        symbol = event.symbol
        trading_date = event.event_time.astimezone(NEW_YORK).date().isoformat()
        if self._session_date.get(symbol) == trading_date:
            return

        self._session_date[symbol] = trading_date
        self._cum_pv[symbol] = Decimal("0")
        self._cum_volume[symbol] = 0
        self._hod.pop(symbol, None)
        self._lod.pop(symbol, None)
        self._opening_range[symbol] = {
            "high": None,
            "low": None,
            "complete": False,
        }

    def _update_opening_range(self, event: MarketEvent) -> None:
        local = event.event_time.astimezone(NEW_YORK)
        symbol = event.symbol
        opening = self._opening_range.setdefault(
            symbol,
            {"high": None, "low": None, "complete": False},
        )

        if time(9, 30) <= local.time() < time(9, 35):
            price = event.payload.price
            opening["high"] = (
                price if opening["high"] is None
                else max(opening["high"], price)
            )
            opening["low"] = (
                price if opening["low"] is None
                else min(opening["low"], price)
            )
        elif local.time() >= time(9, 35):
            opening["complete"] = (
                opening["high"] is not None
                and opening["low"] is not None
            )

    def _symbol_snapshot(
        self,
        symbol: str,
        generated: datetime,
    ) -> dict[str, Any]:
        volume = self._cum_volume.get(symbol, 0)
        vwap = (
            self._cum_pv.get(symbol, Decimal("0")) / Decimal(volume)
            if volume > 0 else None
        )

        intervals = {}
        for interval in INTERVALS:
            key = (symbol, interval)
            active = self._active.get(key)
            closed = list(self._closed.get(key, []))
            intervals[interval] = {
                "active": serialize_candle(active),
                "closedCount": len(closed),
                "recentClosed": [
                    serialize_candle(candle) for candle in closed[-20:]
                ],
            }

        closed_5m = list(self._closed.get((symbol, "5m"), []))
        ema20 = calculate_ema(
            [candle.close for candle in closed_5m],
            period=20,
        )
        atr14 = calculate_atr(closed_5m, period=14)
        opening = self._opening_range.get(symbol) or {}

        age = None
        active_trade = self._active.get((symbol, "1s"))
        if active_trade is not None:
            age = (generated - active_trade.end).total_seconds()

        return {
            "tradingDateNy": self._session_date.get(symbol),
            "sessionVolume": volume,
            "vwap": decimal_string(vwap),
            "highOfDay": decimal_string(self._hod.get(symbol)),
            "lowOfDay": decimal_string(self._lod.get(symbol)),
            "ema20_5m": decimal_string(ema20),
            "atr14_5m": decimal_string(atr14),
            "openingRange5m": {
                "high": decimal_string(opening.get("high")),
                "low": decimal_string(opening.get("low")),
                "complete": bool(opening.get("complete")),
            },
            "lastTradeAgeSeconds": age,
            "intervals": intervals,
        }


def floor_time(value: datetime, seconds: int) -> datetime:
    epoch = int(value.timestamp())
    floored = epoch - (epoch % seconds)
    return datetime.fromtimestamp(floored, tz=timezone.utc)


def calculate_ema(
    values: list[Decimal],
    period: int,
) -> Decimal | None:
    if not values:
        return None
    multiplier = Decimal("2") / Decimal(period + 1)
    ema = values[0]
    for value in values[1:]:
        ema = (value - ema) * multiplier + ema
    return ema


def calculate_atr(
    candles: list[Candle],
    period: int,
) -> Decimal | None:
    if len(candles) < 2:
        return None

    true_ranges: list[Decimal] = []
    previous_close = candles[0].close
    for candle in candles[1:]:
        true_range = max(
            candle.high - candle.low,
            abs(candle.high - previous_close),
            abs(candle.low - previous_close),
        )
        true_ranges.append(true_range)
        previous_close = candle.close

    if not true_ranges:
        return None

    window = true_ranges[-period:]
    return sum(window, Decimal("0")) / Decimal(len(window))


def serialize_candle(candle: Candle | None) -> dict[str, Any] | None:
    if candle is None:
        return None
    return {
        "symbol": candle.symbol,
        "interval": candle.interval,
        "start": candle.start.isoformat(),
        "end": candle.end.isoformat(),
        "open": decimal_string(candle.open),
        "high": decimal_string(candle.high),
        "low": decimal_string(candle.low),
        "close": decimal_string(candle.close),
        "volume": candle.volume,
        "tradeCount": candle.trade_count,
        "complete": candle.complete,
    }


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")
'@

$testCode = @'
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.market_data.candle_engine import CandleIndicatorEngine
from app.market_data.contracts import (
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)


class CandleIndicatorEngineTests(unittest.TestCase):
    def event(self, at, price, size=1, symbol="AAPL"):
        return MarketEvent(
            provider=ProviderName.DATABENTO,
            dataset="EQUS.MINI",
            event_type=EventType.TRADE,
            symbol=symbol,
            instrument_id=38,
            event_time=at,
            receive_time=at + timedelta(milliseconds=1),
            payload=TradePayload(price=Decimal(price), size=size),
        )

    def test_ohlcv_and_vwap(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        engine.apply(self.event(base, "100", 10))
        engine.apply(self.event(base + timedelta(milliseconds=500), "102", 20))
        state = engine.snapshot(now=base + timedelta(seconds=1))["symbols"]["AAPL"]
        candle = state["intervals"]["1s"]["active"]
        self.assertEqual(candle["open"], "100")
        self.assertEqual(candle["high"], "102")
        self.assertEqual(candle["low"], "100")
        self.assertEqual(candle["close"], "102")
        self.assertEqual(candle["volume"], 30)
        self.assertEqual(state["vwap"], str((Decimal("1000") + Decimal("2040")) / Decimal("30")))

    def test_bucket_roll_closes_previous(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        engine.apply(self.event(base, "100"))
        engine.apply(self.event(base + timedelta(seconds=1), "101"))
        snapshot = engine.snapshot()
        interval = snapshot["symbols"]["AAPL"]["intervals"]["1s"]
        self.assertEqual(interval["closedCount"], 1)
        self.assertTrue(interval["recentClosed"][0]["complete"])

    def test_hod_lod_and_volume(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
        for price, size in [("100", 5), ("103", 7), ("99", 3)]:
            engine.apply(self.event(base, price, size))
        state = engine.snapshot()["symbols"]["AAPL"]
        self.assertEqual(state["highOfDay"], "103")
        self.assertEqual(state["lowOfDay"], "99")
        self.assertEqual(state["sessionVolume"], 15)

    def test_ema_and_atr_helpers_become_available_after_closed_bars(self):
        engine = CandleIndicatorEngine()
        base = datetime(2026, 7, 16, 13, 30, tzinfo=timezone.utc)
        for index in range(16):
            at = base + timedelta(minutes=5 * index)
            engine.apply(self.event(at, str(100 + index)))
            engine.apply(self.event(at + timedelta(minutes=5), str(101 + index)))
        state = engine.snapshot()["symbols"]["AAPL"]
        self.assertIsNotNone(state["ema20_5m"])
        self.assertIsNotNone(state["atr14_5m"])


if __name__ == "__main__":
    unittest.main()
'@

[System.IO.File]::WriteAllText(
    $CandleFile,
    $candleCode,
    [System.Text.UTF8Encoding]::new($false)
)
[System.IO.File]::WriteAllText(
    $TestFile,
    $testCode,
    [System.Text.UTF8Encoding]::new($false)
)

$streamText = Get-Content -LiteralPath $StreamFile -Raw

if ($streamText -notmatch 'from \.candle_engine import CandleIndicatorEngine') {
    $streamText = $streamText.Replace(
        'from .contracts import MarketEvent',
        "from .contracts import MarketEvent`nfrom .candle_engine import CandleIndicatorEngine"
    )
}

if ($streamText -notmatch 'CANDLE_SNAPSHOT_PATH') {
    $marker = 'MARKET_STATE_PATH = Path('
    $insert = @'
CANDLE_SNAPSHOT_PATH = Path(
    os.getenv(
        "SKILLEDGE_CANDLE_SNAPSHOT_PATH",
        str(ENGINE_ROOT / "data" / "candle_indicator_snapshot.json"),
    )
)

'@
    $streamText = $streamText.Replace($marker, $insert + $marker)
}

if ($streamText -notmatch 'self\.candle_engine = CandleIndicatorEngine\(\)') {
    $streamText = $streamText.Replace(
        '        self.market_state = MarketStateEngine()',
        "        self.market_state = MarketStateEngine()`n        self.candle_engine = CandleIndicatorEngine()"
    )
}

if ($streamText -notmatch 'self\.candle_engine\.apply\(event\)') {
    $streamText = $streamText.Replace(
        '                self.market_state.apply(event)',
        "                self.market_state.apply(event)`n                self.candle_engine.apply(event)"
    )
}

if ($streamText -notmatch 'atomic_write_json\(CANDLE_SNAPSHOT_PATH') {
    $streamText = $streamText.Replace(
        '        atomic_write_json(MARKET_STATE_PATH, self.market_state.snapshot())',
        "        atomic_write_json(MARKET_STATE_PATH, self.market_state.snapshot())`n        atomic_write_json(CANDLE_SNAPSHOT_PATH, self.candle_engine.snapshot())"
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
        app\market_data\market_state.py `
        app\market_data\candle_engine.py `
        app\market_data\stream_service.py `
        tests\test_market_data_contracts.py `
        tests\test_market_stream_service.py `
        tests\test_market_state.py `
        tests\test_candle_engine.py

    if ($LASTEXITCODE -ne 0) { throw "Local py_compile failed." }

    python -m unittest `
        tests.test_market_data_contracts `
        tests.test_market_stream_service `
        tests.test_market_state `
        tests.test_candle_engine `
        -v

    if ($LASTEXITCODE -ne 0) { throw "Local unit tests failed." }
}
finally {
    Pop-Location
}

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

& ssh @sshArgs $VpsHost "mkdir -p '$remoteStage' '$remoteBackup'"
if ($LASTEXITCODE -ne 0) { throw "Remote stage creation failed." }

& scp @sshArgs $CandleFile "${VpsHost}:$remoteStage/candle_engine.py"
if ($LASTEXITCODE -ne 0) { throw "candle_engine.py upload failed." }

& scp @sshArgs $StreamFile "${VpsHost}:$remoteStage/stream_service.py"
if ($LASTEXITCODE -ne 0) { throw "stream_service.py upload failed." }

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
DIR="$ENGINE/app/market_data"
STAGE="__REMOTE_STAGE__"
BACKUP="__REMOTE_BACKUP__"
SNAPSHOT="$ENGINE/data/candle_indicator_snapshot.json"
STATUS="$ENGINE/data/market_stream_status.json"
UNIT="skilledge-market-stream.service"

mkdir -p "$BACKUP"

for file in candle_engine.py stream_service.py; do
    if [[ -f "$DIR/$file" ]]; then
        cp -a "$DIR/$file" "$BACKUP/$file"
    fi
done

"$ENGINE/.venv/bin/python" -m py_compile \
    "$STAGE/candle_engine.py" \
    "$STAGE/stream_service.py"

OLD_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

install -m 0644 "$STAGE/candle_engine.py" "$DIR/candle_engine.py"
install -m 0644 "$STAGE/stream_service.py" "$DIR/stream_service.py"
rm -f "$SNAPSHOT"

systemctl restart "$UNIT"
sleep 10

NEW_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

export ENGINE DIR STAGE BACKUP SNAPSHOT STATUS UNIT OLD_PID NEW_PID

python3 - <<'PY'
import json
import os
import subprocess
import time
from pathlib import Path

snapshot_path = Path(os.environ["SNAPSHOT"])
status_path = Path(os.environ["STATUS"])

def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {"returncode": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}

before = read_json(snapshot_path)
before_trades = int((before or {}).get("appliedTrades", 0))
time.sleep(15)
after = read_json(snapshot_path)
after_trades = int((after or {}).get("appliedTrades", 0))
status = read_json(status_path)

service = run([
    "systemctl", "show", os.environ["UNIT"],
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts"
])

symbols = (after or {}).get("symbols") or {}
required = {"AAPL", "MSFT"}
symbols_ok = required.issubset(symbols)

def symbol_ok(symbol):
    item = symbols.get(symbol) or {}
    intervals = item.get("intervals") or {}
    return (
        item.get("vwap") is not None
        and item.get("highOfDay") is not None
        and item.get("lowOfDay") is not None
        and int(item.get("sessionVolume", 0)) > 0
        and all((intervals.get(name) or {}).get("active") is not None for name in ("1s", "1m", "5m"))
    )

values_ok = symbols_ok and all(symbol_ok(symbol) for symbol in required)
service_active = "ActiveState=active" in service["stdout"] and "SubState=running" in service["stdout"]
growth = after_trades > before_trades
pid_ok = (
    os.environ["OLD_PID"] and os.environ["NEW_PID"]
    and os.environ["OLD_PID"] != os.environ["NEW_PID"]
    and status and int(status.get("pid", 0)) == int(os.environ["NEW_PID"])
)
status_ok = status and status.get("status") == "OK"

ok = bool(
    service_active and status_ok and after
    and after.get("schemaVersion") == 1
    and symbols_ok and values_ok and growth and pid_ok
)

print(json.dumps({
    "ok": ok,
    "classification": "DAY6_CANDLES_INDICATORS_VERIFIED" if ok else "DAY6_CANDLES_INDICATORS_GATE_FAILED",
    "oldPid": int(os.environ["OLD_PID"]) if os.environ["OLD_PID"] else None,
    "newPid": int(os.environ["NEW_PID"]) if os.environ["NEW_PID"] else None,
    "pidRecoveryVerified": pid_ok,
    "serviceActive": service_active,
    "serviceShow": service,
    "status": status,
    "snapshotBefore": before,
    "snapshotAfter": after,
    "tradesBefore": before_trades,
    "tradesAfter": after_trades,
    "tradeGrowth": after_trades - before_trades,
    "symbolsVerified": symbols_ok,
    "liveValuesVerified": values_ok,
    "rollbackSnapshot": os.environ["BACKUP"],
    "changedFiles": [
        str(Path(os.environ["DIR"]) / "candle_engine.py"),
        str(Path(os.environ["DIR"]) / "stream_service.py"),
    ],
    "serviceRestarted": True,
    "paperTouched": False,
    "apiAppTouched": False,
    "scannerTouched": False,
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
if ($LASTEXITCODE -ne 0) { throw "Deploy script upload failed." }

Write-Host ""
Write-Host "=== DEPLOY DAY 6 CANDLES + INDICATORS ===" -ForegroundColor Green
Write-Host "Only skilledge-market-stream.service will restart." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) { throw "Remote Day 6 command failed." }

$resultText = $resultLines -join "`n"
$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json
$snapshot = $result.snapshotAfter
$aapl = $snapshot.symbols.AAPL
$msft = $snapshot.symbols.MSFT

@(
    "S10.6F DAY 6 CANDLES AND INDICATORS",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "OLD_PID=$($result.oldPid)",
    "NEW_PID=$($result.newPid)",
    "PID_RECOVERY_VERIFIED=$($result.pidRecoveryVerified)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "TRADE_GROWTH=$($result.tradeGrowth)",
    "SYMBOLS_VERIFIED=$($result.symbolsVerified)",
    "LIVE_VALUES_VERIFIED=$($result.liveValuesVerified)",
    "AAPL_VWAP=$($aapl.vwap)",
    "AAPL_HOD=$($aapl.highOfDay)",
    "AAPL_LOD=$($aapl.lowOfDay)",
    "AAPL_VOLUME=$($aapl.sessionVolume)",
    "MSFT_VWAP=$($msft.vwap)",
    "MSFT_HOD=$($msft.highOfDay)",
    "MSFT_LOD=$($msft.lowOfDay)",
    "MSFT_VOLUME=$($msft.sessionVolume)",
    "ROLLBACK=$($result.rollbackSnapshot)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "SCANNER_TOUCHED=$($result.scannerTouched)",
    "RAW_JSON=$RawPath"
) | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6F_DAY6_CANDLES_INDICATORS_$stamp.md"

@"
# S10.6F Day 6 Candle Builder and Indicators

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- PID recovery: $($result.pidRecoveryVerified)
- Trade growth: $($result.tradeGrowth)
- Symbols verified: $($result.symbolsVerified)
- Live values verified: $($result.liveValuesVerified)

Implemented:
- event-time 1-second candles;
- event-time 1-minute candles;
- event-time 5-minute candles;
- OHLCV and trade counts;
- session VWAP;
- high/low of day;
- EMA20 on closed 5-minute bars;
- ATR14 on closed 5-minute bars;
- 09:30-09:35 NY opening range;
- atomic candle_indicator_snapshot.json.

EMA20/ATR14 remain null until enough closed 5-minute bars exist after service start.
No historical backfill is performed in Day 6.

Not touched:
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
Day 7 dynamic market-wide scanner foundation and quote-quality guards.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6F Day 6 Candle Builder and Core Indicators.

Next:
Day 7 - Dynamic Market-Wide Scanner Foundation.

Required:
- quote quality guard;
- locked/crossed/wide/stale classification;
- market-wide symbol universe feed;
- pre-filter by price, volume, spread and liquidity;
- dynamic in-play ranking;
- no client or Telegram cutover.
"@ | Set-Content -LiteralPath (Join-Path $StateRoot "NEXT_STEP.md") -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6F DAY 6 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Old PID: $($result.oldPid)"
Write-Host "New PID: $($result.newPid)"
Write-Host "PID recovery: $($result.pidRecoveryVerified)"
Write-Host "Trade growth: $($result.tradeGrowth)"
Write-Host "AAPL: VWAP=$($aapl.vwap) HOD=$($aapl.highOfDay) LOD=$($aapl.lowOfDay) volume=$($aapl.sessionVolume)"
Write-Host "MSFT: VWAP=$($msft.vwap) HOD=$($msft.highOfDay) LOD=$($msft.lowOfDay) volume=$($msft.sessionVolume)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    throw "Day 6 candle/indicator gate failed."
}
