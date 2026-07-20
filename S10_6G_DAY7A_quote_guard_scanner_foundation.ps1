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
$QuoteFile = Join-Path $MarketRoot "quote_quality.py"
$ScannerFile = Join-Path $MarketRoot "scanner.py"
$QuoteTest = Join-Path $BackendRoot "tests\test_quote_quality.py"
$ScannerTest = Join-Path $BackendRoot "tests\test_scanner.py"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
$BackupRoot = Join-Path $AuditRoot "S10_6G_DAY7A_SCANNER_backup_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6G_DAY7A_SCANNER_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6G_DAY7A_SCANNER_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6g_day7a_scanner_$stamp.sh"
$remoteSh = "/tmp/s10_6g_day7a_scanner_$stamp.sh"
$remoteStage = "/tmp/s10_6g_day7a_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6G_DAY7A_$stamp"

foreach ($dir in @($BackupRoot, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if (-not (Test-Path -LiteralPath $StreamFile)) {
    throw "Required file missing: $StreamFile"
}

Copy-Item -LiteralPath $StreamFile -Destination (Join-Path $BackupRoot "stream_service.py") -Force

foreach ($pair in @(
    @($QuoteFile, "quote_quality.py"),
    @($ScannerFile, "scanner.py"),
    @($QuoteTest, "test_quote_quality.py"),
    @($ScannerTest, "test_scanner.py")
)) {
    if (Test-Path -LiteralPath $pair[0]) {
        Copy-Item -LiteralPath $pair[0] -Destination (Join-Path $BackupRoot $pair[1]) -Force
    }
}

$quoteCode = @'
"""Quote-quality classification for real-time scanner and strategy gates."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class QuoteQuality(str, Enum):
    VALID = "VALID"
    LOCKED = "LOCKED"
    CROSSED = "CROSSED"
    WIDE = "WIDE"
    STALE = "STALE"
    MISSING = "MISSING"


@dataclass(frozen=True, slots=True)
class QuoteAssessment:
    quality: QuoteQuality
    usable_for_trading: bool
    spread: Decimal | None
    spread_pct: Decimal | None
    midpoint: Decimal | None
    reason: str | None


def assess_quote(
    *,
    bid: Decimal | None,
    ask: Decimal | None,
    age_seconds: float | None,
    max_age_seconds: float = 20.0,
    max_spread_pct: Decimal = Decimal("0.01"),
    max_absolute_spread: Decimal = Decimal("1.00"),
) -> QuoteAssessment:
    if bid is None or ask is None or bid <= 0 or ask <= 0:
        return QuoteAssessment(
            quality=QuoteQuality.MISSING,
            usable_for_trading=False,
            spread=None,
            spread_pct=None,
            midpoint=None,
            reason="missing_or_non_positive_quote",
        )

    midpoint = (bid + ask) / Decimal("2")
    spread = ask - bid
    spread_pct = spread / midpoint if midpoint > 0 else None

    if age_seconds is None or age_seconds > max_age_seconds:
        return QuoteAssessment(
            quality=QuoteQuality.STALE,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="quote_is_stale",
        )

    if bid > ask:
        return QuoteAssessment(
            quality=QuoteQuality.CROSSED,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="bid_above_ask",
        )

    if bid == ask:
        return QuoteAssessment(
            quality=QuoteQuality.LOCKED,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="bid_equals_ask",
        )

    if (
        spread > max_absolute_spread
        or (
            spread_pct is not None
            and spread_pct > max_spread_pct
        )
    ):
        return QuoteAssessment(
            quality=QuoteQuality.WIDE,
            usable_for_trading=False,
            spread=spread,
            spread_pct=spread_pct,
            midpoint=midpoint,
            reason="spread_exceeds_quality_limit",
        )

    return QuoteAssessment(
        quality=QuoteQuality.VALID,
        usable_for_trading=True,
        spread=spread,
        spread_pct=spread_pct,
        midpoint=midpoint,
        reason=None,
    )


def serialize_assessment(value: QuoteAssessment) -> dict[str, object]:
    return {
        "quality": value.quality.value,
        "usableForTrading": value.usable_for_trading,
        "spread": decimal_string(value.spread),
        "spreadPct": decimal_string(value.spread_pct),
        "midpoint": decimal_string(value.midpoint),
        "reason": value.reason,
    }


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")
'@

$scannerCode = @'
"""Provider-agnostic dynamic scanner foundation."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from .quote_quality import assess_quote, serialize_assessment


def build_scanner_snapshot(
    market_state_snapshot: dict[str, Any],
    candle_snapshot: dict[str, Any],
) -> dict[str, Any]:
    market_symbols = market_state_snapshot.get("symbols") or {}
    candle_symbols = candle_snapshot.get("symbols") or {}

    rows: list[dict[str, Any]] = []

    for symbol, state in market_symbols.items():
        candle = candle_symbols.get(symbol) or {}

        bid = decimal_or_none(state.get("bidPrice"))
        ask = decimal_or_none(state.get("askPrice"))
        last = decimal_or_none(state.get("lastTradePrice"))
        age = float_or_none(state.get("receiveAgeSeconds"))

        quote = assess_quote(
            bid=bid,
            ask=ask,
            age_seconds=age,
        )

        session_volume = int(
            candle.get("sessionVolume")
            or state.get("sessionVolume")
            or 0
        )
        trade_count = int(state.get("tradeCount") or 0)
        bbo_count = int(state.get("bboCount") or 0)
        spread_pct = quote.spread_pct or Decimal("0")

        activity_score = min(
            Decimal("100"),
            Decimal(trade_count) * Decimal("0.10")
            + Decimal(bbo_count) * Decimal("0.01"),
        )

        liquidity_score = Decimal("0")
        if quote.usable_for_trading:
            liquidity_score = max(
                Decimal("0"),
                Decimal("100") - spread_pct * Decimal("10000"),
            )

        volume_score = min(
            Decimal("100"),
            Decimal(session_volume) / Decimal("10000"),
        )

        in_play_score = (
            activity_score * Decimal("0.35")
            + liquidity_score * Decimal("0.40")
            + volume_score * Decimal("0.25")
        )

        eligible = (
            quote.usable_for_trading
            and last is not None
            and session_volume > 0
        )

        rows.append({
            "symbol": symbol,
            "eligible": eligible,
            "quote": serialize_assessment(quote),
            "lastTradePrice": decimal_string(last),
            "sessionVolume": session_volume,
            "tradeCount": trade_count,
            "bboCount": bbo_count,
            "activityScore": decimal_string(activity_score),
            "liquidityScore": decimal_string(liquidity_score),
            "volumeScore": decimal_string(volume_score),
            "inPlayScore": decimal_string(in_play_score),
            "researchOnly": True,
            "clientEligible": False,
            "telegramEligible": False,
        })

    rows.sort(
        key=lambda item: (
            item["eligible"],
            Decimal(item["inPlayScore"]),
        ),
        reverse=True,
    )

    return {
        "schemaVersion": 1,
        "researchOnly": True,
        "clientCutover": False,
        "telegramCutover": False,
        "symbolCount": len(rows),
        "eligibleCount": sum(1 for row in rows if row["eligible"]),
        "blockedCount": sum(1 for row in rows if not row["eligible"]),
        "items": rows,
    }


def decimal_or_none(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    return Decimal(str(value))


def float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def decimal_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")
'@

$quoteTests = @'
import unittest
from decimal import Decimal

from app.market_data.quote_quality import QuoteQuality, assess_quote


class QuoteQualityTests(unittest.TestCase):
    def test_valid_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100.05"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.VALID)
        self.assertTrue(result.usable_for_trading)

    def test_locked_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.LOCKED)
        self.assertFalse(result.usable_for_trading)

    def test_crossed_quote(self):
        result = assess_quote(
            bid=Decimal("101"),
            ask=Decimal("100"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.CROSSED)

    def test_wide_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("102"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.WIDE)

    def test_stale_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100.05"),
            age_seconds=30,
        )
        self.assertEqual(result.quality, QuoteQuality.STALE)


if __name__ == "__main__":
    unittest.main()
'@

$scannerTests = @'
import unittest

from app.market_data.scanner import build_scanner_snapshot


class ScannerTests(unittest.TestCase):
    def test_valid_symbol_ranks_above_blocked_symbol(self):
        market = {
            "symbols": {
                "AAPL": {
                    "bidPrice": "100",
                    "askPrice": "100.05",
                    "lastTradePrice": "100.02",
                    "receiveAgeSeconds": 1,
                    "sessionVolume": 500000,
                    "tradeCount": 500,
                    "bboCount": 5000,
                },
                "MSFT": {
                    "bidPrice": "100",
                    "askPrice": "103",
                    "lastTradePrice": "101",
                    "receiveAgeSeconds": 1,
                    "sessionVolume": 500000,
                    "tradeCount": 500,
                    "bboCount": 5000,
                },
            }
        }

        candles = {
            "symbols": {
                "AAPL": {"sessionVolume": 500000},
                "MSFT": {"sessionVolume": 500000},
            }
        }

        result = build_scanner_snapshot(market, candles)

        self.assertEqual(result["items"][0]["symbol"], "AAPL")
        self.assertTrue(result["items"][0]["eligible"])
        self.assertFalse(result["items"][1]["eligible"])
        self.assertEqual(result["items"][1]["quote"]["quality"], "WIDE")
        self.assertTrue(result["researchOnly"])
        self.assertFalse(result["clientCutover"])


if __name__ == "__main__":
    unittest.main()
'@

[System.IO.File]::WriteAllText(
    $QuoteFile,
    $quoteCode,
    [System.Text.UTF8Encoding]::new($false)
)
[System.IO.File]::WriteAllText(
    $ScannerFile,
    $scannerCode,
    [System.Text.UTF8Encoding]::new($false)
)
[System.IO.File]::WriteAllText(
    $QuoteTest,
    $quoteTests,
    [System.Text.UTF8Encoding]::new($false)
)
[System.IO.File]::WriteAllText(
    $ScannerTest,
    $scannerTests,
    [System.Text.UTF8Encoding]::new($false)
)

$streamText = Get-Content -LiteralPath $StreamFile -Raw

if ($streamText -notmatch 'from \.scanner import build_scanner_snapshot') {
    $streamText = $streamText.Replace(
        'from .market_state import MarketStateEngine',
        "from .market_state import MarketStateEngine`nfrom .scanner import build_scanner_snapshot"
    )
}

if ($streamText -notmatch 'SCANNER_SNAPSHOT_PATH') {
    $marker = 'CANDLE_SNAPSHOT_PATH = Path('
    $insert = @'
SCANNER_SNAPSHOT_PATH = Path(
    os.getenv(
        "SKILLEDGE_SCANNER_SNAPSHOT_PATH",
        str(ENGINE_ROOT / "data" / "scanner_snapshot.json"),
    )
)

'@
    $streamText = $streamText.Replace($marker, $insert + $marker)
}

if ($streamText -notmatch 'scanner_snapshot = build_scanner_snapshot') {
    $old = '        atomic_write_json(CANDLE_SNAPSHOT_PATH, self.candle_engine.snapshot())'
    $new = @'
        candle_snapshot = self.candle_engine.snapshot()
        market_snapshot = self.market_state.snapshot()
        atomic_write_json(CANDLE_SNAPSHOT_PATH, candle_snapshot)
        scanner_snapshot = build_scanner_snapshot(
            market_snapshot,
            candle_snapshot,
        )
        atomic_write_json(SCANNER_SNAPSHOT_PATH, scanner_snapshot)
'@
    $streamText = $streamText.Replace($old, $new)
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
        app\market_data\quote_quality.py `
        app\market_data\scanner.py `
        app\market_data\stream_service.py `
        tests\test_quote_quality.py `
        tests\test_scanner.py

    if ($LASTEXITCODE -ne 0) {
        throw "Local compile failed."
    }

    python -m unittest `
        tests.test_market_data_contracts `
        tests.test_market_stream_service `
        tests.test_market_state `
        tests.test_candle_engine `
        tests.test_quote_quality `
        tests.test_scanner `
        -v

    if ($LASTEXITCODE -ne 0) {
        throw "Local tests failed."
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

& ssh @sshArgs $VpsHost "mkdir -p '$remoteStage' '$remoteBackup'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote stage creation failed."
}

foreach ($file in @($QuoteFile, $ScannerFile, $StreamFile)) {
    & scp @sshArgs $file "${VpsHost}:$remoteStage/"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed: $file"
    }
}

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
DIR="$ENGINE/app/market_data"
STAGE="__REMOTE_STAGE__"
BACKUP="__REMOTE_BACKUP__"
STATUS="$ENGINE/data/market_stream_status.json"
SCANNER="$ENGINE/data/scanner_snapshot.json"
UNIT="skilledge-market-stream.service"

mkdir -p "$BACKUP"

for file in quote_quality.py scanner.py stream_service.py; do
    if [[ -f "$DIR/$file" ]]; then
        cp -a "$DIR/$file" "$BACKUP/$file"
    fi
done

"$ENGINE/.venv/bin/python" -m py_compile \
    "$STAGE/quote_quality.py" \
    "$STAGE/scanner.py" \
    "$STAGE/stream_service.py"

OLD_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

install -m 0644 "$STAGE/quote_quality.py" "$DIR/quote_quality.py"
install -m 0644 "$STAGE/scanner.py" "$DIR/scanner.py"
install -m 0644 "$STAGE/stream_service.py" "$DIR/stream_service.py"

rm -f "$SCANNER"

systemctl restart "$UNIT"
sleep 10

NEW_PID="$(systemctl show "$UNIT" -p MainPID --value || true)"

export ENGINE DIR STAGE BACKUP STATUS SCANNER UNIT OLD_PID NEW_PID

"$ENGINE/.venv/bin/python" - <<'PY'
import json
import os
import subprocess
import time
from pathlib import Path

scanner_path = Path(os.environ["SCANNER"])
status_path = Path(os.environ["STATUS"])

def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

time.sleep(5)

scanner = read_json(scanner_path)
status = read_json(status_path)

service = run([
    "systemctl",
    "show",
    os.environ["UNIT"],
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts",
])

service_active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

pid_ok = (
    os.environ["OLD_PID"]
    and os.environ["NEW_PID"]
    and os.environ["OLD_PID"] != os.environ["NEW_PID"]
    and status
    and int(status.get("pid", 0)) == int(os.environ["NEW_PID"])
)

items = (scanner or {}).get("items") or []
quality_values = {
    ((item.get("quote") or {}).get("quality"))
    for item in items
}

schema_ok = (
    isinstance(scanner, dict)
    and scanner.get("schemaVersion") == 1
    and scanner.get("researchOnly") is True
    and scanner.get("clientCutover") is False
    and scanner.get("telegramCutover") is False
)

items_ok = all(
    "eligible" in item
    and "inPlayScore" in item
    and "quote" in item
    and item.get("clientEligible") is False
    and item.get("telegramEligible") is False
    for item in items
)

ok = bool(
    service_active
    and pid_ok
    and schema_ok
    and items_ok
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DAY7A_QUOTE_GUARD_SCANNER_FOUNDATION_VERIFIED"
        if ok
        else "DAY7A_QUOTE_GUARD_SCANNER_FOUNDATION_GATE_FAILED"
    ),
    "oldPid": int(os.environ["OLD_PID"]) if os.environ["OLD_PID"] else None,
    "newPid": int(os.environ["NEW_PID"]) if os.environ["NEW_PID"] else None,
    "pidRecoveryVerified": pid_ok,
    "serviceActive": service_active,
    "serviceShow": service,
    "status": status,
    "scanner": scanner,
    "scannerItemCount": len(items),
    "quoteQualitiesObserved": sorted(v for v in quality_values if v),
    "researchOnlyVerified": bool(scanner and scanner.get("researchOnly") is True),
    "clientCutoverVerifiedFalse": bool(scanner and scanner.get("clientCutover") is False),
    "telegramCutoverVerifiedFalse": bool(scanner and scanner.get("telegramCutover") is False),
    "rollbackSnapshot": os.environ["BACKUP"],
    "changedFiles": [
        str(Path(os.environ["DIR"]) / "quote_quality.py"),
        str(Path(os.environ["DIR"]) / "scanner.py"),
        str(Path(os.environ["DIR"]) / "stream_service.py"),
    ],
    "serviceRestarted": True,
    "paperTouched": False,
    "apiAppTouched": False,
    "strategyEngineTouched": False,
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
    throw "Deploy script upload failed."
}

Write-Host ""
Write-Host "=== DEPLOY DAY 7A QUOTE GUARD + SCANNER FOUNDATION ===" -ForegroundColor Green
Write-Host "Research-only. No strategy/client/Telegram cutover." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Remote Day 7A command failed."
}

$resultText = $resultLines -join "`n"
$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json
$scanner = $result.scanner

@(
    "S10.6G DAY 7A QUOTE GUARD + SCANNER FOUNDATION",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "OLD_PID=$($result.oldPid)",
    "NEW_PID=$($result.newPid)",
    "PID_RECOVERY_VERIFIED=$($result.pidRecoveryVerified)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "SCANNER_ITEM_COUNT=$($result.scannerItemCount)",
    "ELIGIBLE_COUNT=$($scanner.eligibleCount)",
    "BLOCKED_COUNT=$($scanner.blockedCount)",
    "QUOTE_QUALITIES=$(@($result.quoteQualitiesObserved) -join ',')",
    "RESEARCH_ONLY=$($result.researchOnlyVerified)",
    "CLIENT_CUTOVER_FALSE=$($result.clientCutoverVerifiedFalse)",
    "TELEGRAM_CUTOVER_FALSE=$($result.telegramCutoverVerifiedFalse)",
    "ROLLBACK=$($result.rollbackSnapshot)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "STRATEGY_ENGINE_TOUCHED=$($result.strategyEngineTouched)",
    "RAW_JSON=$RawPath"
) | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesRoot "S10_6G_DAY7A_SCANNER_FOUNDATION_$stamp.md"

@"
# S10.6G Day 7A Quote Guard and Scanner Foundation

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- PID recovery: $($result.pidRecoveryVerified)
- Scanner items: $($result.scannerItemCount)
- Eligible: $($scanner.eligibleCount)
- Blocked: $($scanner.blockedCount)
- Quote qualities: $(@($result.quoteQualitiesObserved) -join ', ')

Implemented:
- VALID / LOCKED / CROSSED / WIDE / STALE / MISSING quote classification;
- spread and spread-percent checks;
- trading-usability flag;
- liquidity score;
- activity score;
- volume score;
- research in-play ranking;
- atomic scanner_snapshot.json.

Safety:
- researchOnly=true;
- clientCutover=false;
- telegramCutover=false;
- clientEligible=false for every item;
- telegramEligible=false for every item.

Not touched:
- app.py;
- paper;
- strategy engine;
- Telegram;
- client gates;
- payments.

Rollback:
$($result.rollbackSnapshot)

Next:
Day 7B market-wide symbol universe and scalable subscription plan.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6G Day 7A quote-quality guard and scanner foundation.

Next:
Day 7B - Market-Wide Universe and Subscription Architecture.

Required:
- official symbol-definition refresh;
- active equity filtering;
- symbol partitions;
- subscription batching;
- scanner ingestion capacity test;
- memory/CPU/network budget;
- no strategy/client/Telegram cutover.
"@ | Set-Content -LiteralPath (Join-Path $StateRoot "NEXT_STEP.md") -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6G DAY 7A COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Old PID: $($result.oldPid)"
Write-Host "New PID: $($result.newPid)"
Write-Host "PID recovery: $($result.pidRecoveryVerified)"
Write-Host "Scanner items: $($result.scannerItemCount)"
Write-Host "Eligible: $($scanner.eligibleCount)"
Write-Host "Blocked: $($scanner.blockedCount)"
Write-Host "Quote qualities: $(@($result.quoteQualitiesObserved) -join ', ')"
Write-Host "Research only: $($result.researchOnlyVerified)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    throw "Day 7A quote/scanner gate failed."
}
