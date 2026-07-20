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

$localSh = Join-Path $env:TEMP "s10_6g_day7a_verify_$stamp.sh"
$remoteSh = "/tmp/s10_6g_day7a_verify_$stamp.sh"
$RawPath = Join-Path $AuditRoot "S10_6G_DAY7A_SESSION_AWARE_VERIFY_raw_$stamp.json"
$ReportPath = Join-Path $AuditRoot "S10_6G_DAY7A_SESSION_AWARE_VERIFY_report_$stamp.txt"

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="skilledge-market-stream.service"
SCANNER="$ENGINE/data/scanner_snapshot.json"
QUOTE="$ENGINE/app/market_data/quote_quality.py"
SCANNER_MODULE="$ENGINE/app/market_data/scanner.py"

export ENGINE UNIT SCANNER QUOTE SCANNER_MODULE

cd "$ENGINE"

"$ENGINE/.venv/bin/python" - <<'PY'
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, time
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from app.market_data.quote_quality import QuoteQuality, assess_quote
from app.market_data.scanner import build_scanner_snapshot

unit = os.environ["UNIT"]
scanner_path = Path(os.environ["SCANNER"])
quote_path = Path(os.environ["QUOTE"])
scanner_module_path = Path(os.environ["SCANNER_MODULE"])

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def sha256(path):
    if not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

ny = ZoneInfo("America/New_York")
now_ny = datetime.now(ny)
regular_open = (
    now_ny.weekday() < 5
    and time(9, 30) <= now_ny.time() < time(16, 0)
)

service = run([
    "systemctl",
    "show",
    unit,
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts",
])

service_active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

live_scanner = read_json(scanner_path)
live_items = (live_scanner or {}).get("items") or []

quote_cases = {
    "valid": assess_quote(
        bid=Decimal("100"),
        ask=Decimal("100.05"),
        age_seconds=1,
    ),
    "locked": assess_quote(
        bid=Decimal("100"),
        ask=Decimal("100"),
        age_seconds=1,
    ),
    "crossed": assess_quote(
        bid=Decimal("101"),
        ask=Decimal("100"),
        age_seconds=1,
    ),
    "wide": assess_quote(
        bid=Decimal("100"),
        ask=Decimal("103"),
        age_seconds=1,
    ),
    "stale": assess_quote(
        bid=Decimal("100"),
        ask=Decimal("100.05"),
        age_seconds=30,
    ),
    "missing": assess_quote(
        bid=None,
        ask=None,
        age_seconds=None,
    ),
}

quote_checks = {
    "valid": quote_cases["valid"].quality is QuoteQuality.VALID
             and quote_cases["valid"].usable_for_trading,
    "locked": quote_cases["locked"].quality is QuoteQuality.LOCKED
              and not quote_cases["locked"].usable_for_trading,
    "crossed": quote_cases["crossed"].quality is QuoteQuality.CROSSED
               and not quote_cases["crossed"].usable_for_trading,
    "wide": quote_cases["wide"].quality is QuoteQuality.WIDE
            and not quote_cases["wide"].usable_for_trading,
    "stale": quote_cases["stale"].quality is QuoteQuality.STALE
             and not quote_cases["stale"].usable_for_trading,
    "missing": quote_cases["missing"].quality is QuoteQuality.MISSING
               and not quote_cases["missing"].usable_for_trading,
}

market = {
    "symbols": {
        "AAPL": {
            "bidPrice": "100",
            "askPrice": "100.05",
            "lastTradePrice": "100.02",
            "receiveAgeSeconds": 1,
            "sessionVolume": 750000,
            "tradeCount": 800,
            "bboCount": 8000,
        },
        "MSFT": {
            "bidPrice": "100",
            "askPrice": "103",
            "lastTradePrice": "101",
            "receiveAgeSeconds": 1,
            "sessionVolume": 900000,
            "tradeCount": 900,
            "bboCount": 9000,
        },
        "NVDA": {
            "bidPrice": "50",
            "askPrice": "50.02",
            "lastTradePrice": "50.01",
            "receiveAgeSeconds": 35,
            "sessionVolume": 1000000,
            "tradeCount": 1000,
            "bboCount": 10000,
        },
    }
}

candles = {
    "symbols": {
        "AAPL": {"sessionVolume": 750000},
        "MSFT": {"sessionVolume": 900000},
        "NVDA": {"sessionVolume": 1000000},
    }
}

synthetic_scanner = build_scanner_snapshot(market, candles)
items = synthetic_scanner["items"]
by_symbol = {item["symbol"]: item for item in items}

scanner_checks = {
    "schema": synthetic_scanner.get("schemaVersion") == 1,
    "researchOnly": synthetic_scanner.get("researchOnly") is True,
    "clientCutoverFalse": synthetic_scanner.get("clientCutover") is False,
    "telegramCutoverFalse": synthetic_scanner.get("telegramCutover") is False,
    "aaplEligible": by_symbol["AAPL"]["eligible"] is True,
    "msftBlockedWide": (
        by_symbol["MSFT"]["eligible"] is False
        and by_symbol["MSFT"]["quote"]["quality"] == "WIDE"
    ),
    "nvdaBlockedStale": (
        by_symbol["NVDA"]["eligible"] is False
        and by_symbol["NVDA"]["quote"]["quality"] == "STALE"
    ),
    "allClientFalse": all(item["clientEligible"] is False for item in items),
    "allTelegramFalse": all(item["telegramEligible"] is False for item in items),
    "validRanksFirst": items[0]["symbol"] == "AAPL",
}

synthetic_ok = all(quote_checks.values()) and all(scanner_checks.values())
deployed_ok = quote_path.exists() and scanner_module_path.exists()
live_proof = regular_open and len(live_items) > 0

if live_proof:
    classification = "DAY7A_LIVE_SCANNER_VERIFIED"
elif not regular_open and synthetic_ok:
    classification = "DAY7A_DEPLOYED_CLOSED_SESSION_SYNTHETIC_VERIFIED"
else:
    classification = "DAY7A_SESSION_AWARE_VERIFY_FAILED"

ok = (
    service_active
    and deployed_ok
    and synthetic_ok
    and (live_proof or not regular_open)
)

print(json.dumps({
    "ok": ok,
    "classification": classification,
    "inspectionOnly": True,
    "productionMutation": False,
    "serviceRestarted": False,
    "paperTouched": False,
    "apiAppTouched": False,
    "strategyEngineTouched": False,
    "newYorkTime": now_ny.isoformat(),
    "regularSessionOpen": regular_open,
    "serviceActive": service_active,
    "serviceShow": service,
    "liveScanner": live_scanner,
    "liveScannerItemCount": len(live_items),
    "liveMarketProof": live_proof,
    "deployedFilesVerified": deployed_ok,
    "quoteQualitySha256": sha256(quote_path),
    "scannerSha256": sha256(scanner_module_path),
    "quoteChecks": quote_checks,
    "scannerChecks": scanner_checks,
    "syntheticScanner": synthetic_scanner,
    "syntheticVerificationOk": synthetic_ok,
    "honestLimit": (
        None
        if live_proof
        else "Regular session was closed; live scanner population must be repeated during an open session."
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
Write-Host "=== UPLOAD DAY 7A SESSION-AWARE VERIFY ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Verification upload failed."
}

Write-Host ""
Write-Host "=== VERIFY QUOTE GUARD + SCANNER WITHOUT MUTATION ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no paper / no strategy cutover." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Day 7A verification failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"
if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Verification returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6G DAY 7A SESSION-AWARE VERIFY",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "NEW_YORK_TIME=$($result.newYorkTime)",
    "REGULAR_SESSION_OPEN=$($result.regularSessionOpen)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "DEPLOYED_FILES_VERIFIED=$($result.deployedFilesVerified)",
    "SYNTHETIC_VERIFICATION_OK=$($result.syntheticVerificationOk)",
    "LIVE_SCANNER_ITEM_COUNT=$($result.liveScannerItemCount)",
    "LIVE_MARKET_PROOF=$($result.liveMarketProof)",
    "PRODUCTION_MUTATION=$($result.productionMutation)",
    "SERVICE_RESTARTED=$($result.serviceRestarted)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "STRATEGY_ENGINE_TOUCHED=$($result.strategyEngineTouched)",
    "HONEST_LIMIT=$($result.honestLimit)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6G_DAY7A_SESSION_AWARE_VERIFY_$stamp.md"

@"
# S10.6G Day 7A Session-Aware Verification

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Regular session open: $($result.regularSessionOpen)
- Service active: $($result.serviceActive)
- Deployed files verified: $($result.deployedFilesVerified)
- Synthetic verification: $($result.syntheticVerificationOk)
- Live scanner items: $($result.liveScannerItemCount)
- Live market proof: $($result.liveMarketProof)

Verified:
- VALID quote passes;
- LOCKED/CROSSED/WIDE/STALE/MISSING quotes are blocked;
- valid quote ranks above blocked quotes;
- every scanner item remains clientEligible=false;
- every scanner item remains telegramEligible=false;
- scanner remains research-only.

Honest limitation:
$($result.honestLimit)

No production mutation.
No service restart.
No paper action.
No strategy/client/Telegram cutover.

Next:
Day 7B market-wide universe and scalable subscription architecture.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6G DAY 7A VERIFY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Regular session open: $($result.regularSessionOpen)"
Write-Host "Synthetic verification: $($result.syntheticVerificationOk)"
Write-Host "Live scanner items: $($result.liveScannerItemCount)"
Write-Host "Live market proof: $($result.liveMarketProof)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Milestone: $milestonePath"

if (-not $result.ok) {
    throw "Day 7A session-aware verification failed."
}
