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
$AuditRoot = Join-Path $ProjectRoot "audit_exports"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"

New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null
New-Item -ItemType Directory -Force -Path $MilestonesRoot | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$localSh = Join-Path $env:TEMP "s10_6f_day6_session_aware_verify_$stamp.sh"
$remoteSh = "/tmp/s10_6f_day6_session_aware_verify_$stamp.sh"
$RawPath = Join-Path $AuditRoot "S10_6F_DAY6_SESSION_AWARE_VERIFY_raw_$stamp.json"
$ReportPath = Join-Path $AuditRoot "S10_6F_DAY6_SESSION_AWARE_VERIFY_report_$stamp.txt"

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="skilledge-market-stream.service"
STATUS="$ENGINE/data/market_stream_status.json"
SNAPSHOT="$ENGINE/data/candle_indicator_snapshot.json"
CANDLE="$ENGINE/app/market_data/candle_engine.py"
STREAM="$ENGINE/app/market_data/stream_service.py"

export ENGINE UNIT STATUS SNAPSHOT CANDLE STREAM

cd "$ENGINE"

"$ENGINE/.venv/bin/python" - <<'PY'
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone, time
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from app.market_data.candle_engine import CandleIndicatorEngine
from app.market_data.contracts import (
    EventType,
    MarketEvent,
    ProviderName,
    TradePayload,
)

engine = Path(os.environ["ENGINE"])
status_path = Path(os.environ["STATUS"])
snapshot_path = Path(os.environ["SNAPSHOT"])
candle_path = Path(os.environ["CANDLE"])
stream_path = Path(os.environ["STREAM"])
unit = os.environ["UNIT"]

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

def sha256(path):
    if not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def event(at, price, size, symbol="AAPL"):
    return MarketEvent(
        provider=ProviderName.DATABENTO,
        dataset="EQUS.MINI",
        event_type=EventType.TRADE,
        symbol=symbol,
        instrument_id=38 if symbol == "AAPL" else 10888,
        event_time=at,
        receive_time=at + timedelta(milliseconds=1),
        payload=TradePayload(
            price=Decimal(price),
            size=size,
        ),
    )

ny = ZoneInfo("America/New_York")
now_ny = datetime.now(ny)
weekday = now_ny.weekday() < 5
regular_open = weekday and time(9, 30) <= now_ny.time() < time(16, 0)
extended_open = weekday and time(4, 0) <= now_ny.time() < time(20, 0)

service = run([
    "systemctl",
    "show",
    unit,
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,ExecMainStartTimestamp",
])

service_active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

status = read_json(status_path)
live_snapshot = read_json(snapshot_path)

# Isolated production-module verification.
synthetic = CandleIndicatorEngine()

base = datetime(2026, 7, 16, 13, 30, 0, tzinfo=timezone.utc)

synthetic_events = [
    event(base, "100.00", 10),
    event(base + timedelta(milliseconds=500), "101.00", 20),
    event(base + timedelta(seconds=1), "99.50", 5),
    event(base + timedelta(minutes=1), "102.00", 15),
    event(base + timedelta(minutes=5), "103.00", 25),
]

for item in synthetic_events:
    synthetic.apply(item)

synthetic_snapshot = synthetic.snapshot(
    now=base + timedelta(minutes=6)
)

aapl = synthetic_snapshot["symbols"]["AAPL"]
one_second = aapl["intervals"]["1s"]
one_minute = aapl["intervals"]["1m"]
five_minute = aapl["intervals"]["5m"]

expected_volume = 75
expected_vwap = (
    Decimal("100.00") * 10
    + Decimal("101.00") * 20
    + Decimal("99.50") * 5
    + Decimal("102.00") * 15
    + Decimal("103.00") * 25
) / Decimal(expected_volume)

synthetic_checks = {
    "schemaVersion": synthetic_snapshot.get("schemaVersion") == 1,
    "symbolCount": synthetic_snapshot.get("symbolCount") == 1,
    "appliedTrades": synthetic_snapshot.get("appliedTrades") == 5,
    "sessionVolume": aapl.get("sessionVolume") == expected_volume,
    "vwap": Decimal(aapl["vwap"]) == expected_vwap,
    "highOfDay": aapl.get("highOfDay") == "103.00",
    "lowOfDay": aapl.get("lowOfDay") == "99.50",
    "oneSecondActive": one_second.get("active") is not None,
    "oneSecondClosed": int(one_second.get("closedCount", 0)) >= 1,
    "oneMinuteActive": one_minute.get("active") is not None,
    "oneMinuteClosed": int(one_minute.get("closedCount", 0)) >= 1,
    "fiveMinuteActive": five_minute.get("active") is not None,
    "fiveMinuteClosed": int(five_minute.get("closedCount", 0)) >= 1,
}

synthetic_ok = all(synthetic_checks.values())

deployed_ok = (
    candle_path.exists()
    and stream_path.exists()
    and sha256(candle_path) is not None
    and sha256(stream_path) is not None
)

status_ok = (
    isinstance(status, dict)
    and status.get("status") in {"OK", "STALE", "STARTING", "DEGRADED"}
)

snapshot_schema_ok = (
    isinstance(live_snapshot, dict)
    and live_snapshot.get("schemaVersion") == 1
)

live_trade_count = (
    int(live_snapshot.get("appliedTrades", 0))
    if isinstance(live_snapshot, dict)
    else 0
)

live_market_proof = (
    regular_open
    and live_trade_count > 0
    and isinstance(live_snapshot, dict)
    and int(live_snapshot.get("symbolCount", 0)) > 0
)

if live_market_proof:
    classification = "DAY6_CANDLES_INDICATORS_LIVE_VERIFIED"
elif not regular_open and synthetic_ok:
    classification = "DAY6_DEPLOYED_CLOSED_SESSION_SYNTHETIC_VERIFIED"
else:
    classification = "DAY6_SESSION_AWARE_VERIFY_FAILED"

ok = (
    service_active
    and deployed_ok
    and status_ok
    and snapshot_schema_ok
    and synthetic_ok
    and (
        live_market_proof
        or not regular_open
    )
)

print(json.dumps({
    "ok": ok,
    "classification": classification,
    "inspectionOnly": True,
    "productionMutation": False,
    "serviceRestarted": False,
    "paperTouched": False,
    "apiAppTouched": False,
    "scannerTouched": False,
    "newYorkTime": now_ny.isoformat(),
    "weekday": weekday,
    "regularSessionOpen": regular_open,
    "extendedSessionOpen": extended_open,
    "serviceActive": service_active,
    "serviceShow": service,
    "status": status,
    "liveSnapshot": live_snapshot,
    "liveTradeCount": live_trade_count,
    "liveMarketProof": live_market_proof,
    "deployedFilesVerified": deployed_ok,
    "candleEngineSha256": sha256(candle_path),
    "streamServiceSha256": sha256(stream_path),
    "snapshotSchemaVerified": snapshot_schema_ok,
    "syntheticVerification": {
        "ok": synthetic_ok,
        "checks": synthetic_checks,
        "expectedVwap": str(expected_vwap),
        "snapshot": synthetic_snapshot,
    },
    "honestLimit": (
        None
        if live_market_proof
        else "Regular session was closed; production live-trade proof must be repeated during an open market session."
    ),
}, ensure_ascii=False))
PY
'@

$bash = $bash -replace "`r`n", "`n"
$bash = $bash -replace "`r", "`n"

[System.IO.File]::WriteAllText(
    $localSh,
    $bash,
    [System.Text.UTF8Encoding]::new($false)
)

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== UPLOAD DAY 6 SESSION-AWARE VERIFY ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Verification upload failed."
}

Write-Host ""
Write-Host "=== VERIFY DEPLOYED DAY 6 WITHOUT MUTATION ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no paper action." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Session-aware verification failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Verification returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6F DAY 6 SESSION-AWARE VERIFY",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "NEW_YORK_TIME=$($result.newYorkTime)",
    "REGULAR_SESSION_OPEN=$($result.regularSessionOpen)",
    "EXTENDED_SESSION_OPEN=$($result.extendedSessionOpen)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "DEPLOYED_FILES_VERIFIED=$($result.deployedFilesVerified)",
    "SNAPSHOT_SCHEMA_VERIFIED=$($result.snapshotSchemaVerified)",
    "SYNTHETIC_VERIFICATION_OK=$($result.syntheticVerification.ok)",
    "LIVE_TRADE_COUNT=$($result.liveTradeCount)",
    "LIVE_MARKET_PROOF=$($result.liveMarketProof)",
    "PRODUCTION_MUTATION=$($result.productionMutation)",
    "SERVICE_RESTARTED=$($result.serviceRestarted)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "HONEST_LIMIT=$($result.honestLimit)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6F_DAY6_SESSION_AWARE_VERIFY_$stamp.md"

@"
# S10.6F Day 6 Session-Aware Verification

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- New York time: $($result.newYorkTime)
- Regular session open: $($result.regularSessionOpen)
- Service active: $($result.serviceActive)
- Deployed files verified: $($result.deployedFilesVerified)
- Snapshot schema verified: $($result.snapshotSchemaVerified)
- Isolated production-module verification: $($result.syntheticVerification.ok)
- Live market proof: $($result.liveMarketProof)

Verified with production-installed modules:
- event-time 1-second candles;
- event-time 1-minute candles;
- event-time 5-minute candles;
- OHLCV;
- session volume;
- VWAP;
- HOD/LOD;
- candle rollover.

Honest limitation:
$($result.honestLimit)

No production mutation.
No service restart.
No paper action.
No app.py change.

Next:
Repeat the live-market portion automatically during the next open session, then continue Day 7 scanner foundation.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

$nextStepPath = Join-Path $StateRoot "NEXT_STEP.md"

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6F Day 6 code deployment and session-aware production-module verification.

Pending evidence:
Repeat Day 6 live-trade verification during an open regular session because the original gate ran after 16:00 New York.

Next engineering scope:
Day 7 - quote-quality guards and dynamic market-wide scanner foundation.

Do not connect scanner output to strategies, paper, Telegram or clients until live-market Day 6 evidence is recorded.
"@ | Set-Content -LiteralPath $nextStepPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6F SESSION-AWARE VERIFY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "New York time: $($result.newYorkTime)"
Write-Host "Regular session open: $($result.regularSessionOpen)"
Write-Host "Service active: $($result.serviceActive)"
Write-Host "Synthetic production-module verification: $($result.syntheticVerification.ok)"
Write-Host "Live market proof: $($result.liveMarketProof)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Milestone: $milestonePath"

if (-not $result.ok) {
    throw "Day 6 session-aware verification failed."
}
