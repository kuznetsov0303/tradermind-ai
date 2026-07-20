param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$SnapshotRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_7H2_active_market_data_source_snapshot"
$LegacySnapshotRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_7H_active_source_snapshot"
$PackageRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_7I_security_master_instrumentation_patch_v1"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

if(-not (Test-Path -LiteralPath (Join-Path $SnapshotRoot "app\market_data\stream_service.py"))){
  throw "Missing exact S10.7H2 stream snapshot: $SnapshotRoot"
}

if(-not (Test-Path -LiteralPath (Join-Path $LegacySnapshotRoot "app\data\fmp_client.py"))){
  throw "Missing S10.7H active application snapshot: $LegacySnapshotRoot"
}

if(Test-Path -LiteralPath $PackageRoot){
  Remove-Item -LiteralPath $PackageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path `
  (Join-Path $PackageRoot "app\market_data"),`
  (Join-Path $PackageRoot "app\data"),`
  (Join-Path $PackageRoot "ops\scripts"),`
  (Join-Path $PackageRoot "tests") | Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7I_SECURITY_MASTER_INSTRUMENTATION_PACKAGE_raw_$stamp.json"
$report=Join-Path $Audit "S10_7I_SECURITY_MASTER_INSTRUMENTATION_PACKAGE_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7I_SECURITY_MASTER_INSTRUMENTATION_PACKAGE_$stamp.md"
$patcher=Join-Path $env:TEMP "s10_7i_patcher_$stamp.py"

$python=@'
from __future__ import annotations

import ast
import json
import shutil
import sys
from pathlib import Path

project=Path(sys.argv[1])
snapshot=project/"PROJECT_STATE"/"S10_7H2_active_market_data_source_snapshot"
legacy=project/"PROJECT_STATE"/"S10_7H_active_source_snapshot"
package=project/"PROJECT_STATE"/"S10_7I_security_master_instrumentation_patch_v1"

src_stream=snapshot/"app"/"market_data"/"stream_service.py"
dst_stream=package/"app"/"market_data"/"stream_service.py"
src_fmp=legacy/"app"/"data"/"fmp_client.py"
dst_fmp=package/"app"/"data"/"fmp_client.py"

shutil.copy2(src_stream,dst_stream)
shutil.copy2(src_fmp,dst_fmp)

text=dst_stream.read_text(encoding="utf-8")

def replace_once(source,old,new,label):
    count=source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old,new,1)

text=replace_once(text,"import threading\n","import threading\nimport time\n","IMPORT_TIME")

text=replace_once(
    text,
    '''        self.callback_latencies_ms: deque[float] = deque(
            maxlen=LATENCY_WINDOW_SIZE
        )
        self.lock = threading.Lock()
''',
    '''        self.callback_latencies_ms: deque[float] = deque(
            maxlen=LATENCY_WINDOW_SIZE
        )
        self.snapshot_write_latencies_ms: deque[float] = deque(
            maxlen=LATENCY_WINDOW_SIZE
        )
        self.scanner_build_latencies_ms: deque[float] = deque(
            maxlen=LATENCY_WINDOW_SIZE
        )
        self._metric_sample_monotonic = time.monotonic()
        self._metric_sample_raw_total = 0
        self._metric_sample_event_total = 0
        self._metric_sample_cpu_seconds = 0.0
        self._last_rate_metrics = {
            "rawRecordsPerSecond": None,
            "marketEventsPerSecond": None,
            "cpuPercent": None,
            "sampleWindowSeconds": None,
        }
        self._last_candle_completeness = {
            "configuredSymbolCount": len(SYMBOLS),
            "snapshotSymbolCount": 0,
            "symbolsWithCandles": 0,
            "candleCompletenessPercent": 0.0,
            "openingRangeCompleteCount": 0,
            "openingRangeCompletenessPercent": 0.0,
        }
        self.lock = threading.Lock()
''',
    "RUNTIME_METRIC_FIELDS",
)

text=replace_once(
    text,
    '''            latest_events = dict(self.latest_events)
            latencies = list(self.callback_latencies_ms)
''',
    '''            latest_events = dict(self.latest_events)
            latencies = list(self.callback_latencies_ms)
            snapshot_write_latencies = list(
                self.snapshot_write_latencies_ms
            )
            scanner_build_latencies = list(
                self.scanner_build_latencies_ms
            )
            candle_completeness = dict(
                self._last_candle_completeness
            )
''',
    "SNAPSHOT_METRIC_COPIES",
)

text=replace_once(
    text,
    '''        process_metrics = read_process_metrics()
        latency_metrics = summarize_latencies(latencies)

        return {
''',
    '''        process_metrics = read_process_metrics()
        latency_metrics = summarize_latencies(latencies)
        rate_metrics = self._sample_rate_metrics(
            raw_counts=raw_counts,
            event_counts=event_counts,
            process_metrics=process_metrics,
        )
        benchmark_metrics = {
            **rate_metrics,
            "callbackLatencyMs": latency_metrics,
            "snapshotWriteLatencyMs": summarize_latencies(
                snapshot_write_latencies
            ),
            "scannerBuildLatencyMs": summarize_latencies(
                scanner_build_latencies
            ),
            "candleCompleteness": candle_completeness,
        }

        return {
''',
    "SNAPSHOT_BENCHMARK_BUILD",
)

text=replace_once(
    text,
    '''            "latencyMetrics": latency_metrics,
            "processMetrics": process_metrics,
            "configuration": {
''',
    '''            "latencyMetrics": latency_metrics,
            "processMetrics": process_metrics,
            "benchmarkMetrics": benchmark_metrics,
            "configuration": {
''',
    "SNAPSHOT_BENCHMARK_FIELD",
)

old_method='''    def write_status(self) -> None:
        snapshot = self.snapshot()

        atomic_write_json(STATUS_PATH, snapshot)
        atomic_write_json(MARKET_STATE_PATH, self.market_state.snapshot())
        candle_snapshot = self.candle_engine.snapshot()
        market_snapshot = self.market_state.snapshot()
        atomic_write_json(CANDLE_SNAPSHOT_PATH, candle_snapshot)
        scanner_snapshot = build_scanner_snapshot(
            market_snapshot,
            candle_snapshot,
        )
        atomic_write_json(SCANNER_SNAPSHOT_PATH, scanner_snapshot)

        now = datetime.now(timezone.utc)
'''

new_method='''    def _sample_rate_metrics(
        self,
        *,
        raw_counts: dict[str, int],
        event_counts: dict[str, int],
        process_metrics: dict[str, Any],
    ) -> dict[str, float | None]:
        now_monotonic = time.monotonic()
        raw_total = sum(raw_counts.values())
        event_total = sum(event_counts.values())
        cpu_total = float(process_metrics.get("cpuUserSeconds") or 0.0) + float(
            process_metrics.get("cpuSystemSeconds") or 0.0
        )

        with self.lock:
            elapsed = now_monotonic - self._metric_sample_monotonic
            if elapsed > 0:
                self._last_rate_metrics = {
                    "rawRecordsPerSecond": max(
                        0.0,
                        (raw_total - self._metric_sample_raw_total) / elapsed,
                    ),
                    "marketEventsPerSecond": max(
                        0.0,
                        (event_total - self._metric_sample_event_total) / elapsed,
                    ),
                    "cpuPercent": max(
                        0.0,
                        ((cpu_total - self._metric_sample_cpu_seconds) / elapsed)
                        * 100.0,
                    ),
                    "sampleWindowSeconds": elapsed,
                }

            self._metric_sample_monotonic = now_monotonic
            self._metric_sample_raw_total = raw_total
            self._metric_sample_event_total = event_total
            self._metric_sample_cpu_seconds = cpu_total
            return dict(self._last_rate_metrics)

    def _update_candle_completeness(
        self,
        candle_snapshot: dict[str, Any],
    ) -> None:
        symbols = candle_snapshot.get("symbols")
        if not isinstance(symbols, dict):
            symbols = {}

        configured_count = len(SYMBOLS)
        with_candles = 0
        opening_complete = 0

        for row in symbols.values():
            if not isinstance(row, dict):
                continue
            intervals = row.get("intervals")
            if not isinstance(intervals, dict):
                intervals = {}
            one_minute = intervals.get("1m")
            if not isinstance(one_minute, dict):
                one_minute = {}

            if one_minute.get("active") is not None or int(
                one_minute.get("closedCount") or 0
            ) > 0:
                with_candles += 1

            opening = row.get("openingRange5m")
            if isinstance(opening, dict) and bool(opening.get("complete")):
                opening_complete += 1

        denominator = configured_count or 1
        with self.lock:
            self._last_candle_completeness = {
                "configuredSymbolCount": configured_count,
                "snapshotSymbolCount": len(symbols),
                "symbolsWithCandles": with_candles,
                "candleCompletenessPercent": (
                    with_candles / denominator
                ) * 100.0,
                "openingRangeCompleteCount": opening_complete,
                "openingRangeCompletenessPercent": (
                    opening_complete / denominator
                ) * 100.0,
            }

    def _record_snapshot_write_latency(self, elapsed_ms: float) -> None:
        with self.lock:
            self.snapshot_write_latencies_ms.append(elapsed_ms)

    def _record_scanner_build_latency(self, elapsed_ms: float) -> None:
        with self.lock:
            self.scanner_build_latencies_ms.append(elapsed_ms)

    def write_status(self) -> None:
        market_snapshot = self.market_state.snapshot()
        candle_snapshot = self.candle_engine.snapshot()
        self._update_candle_completeness(candle_snapshot)

        scanner_started = time.perf_counter()
        scanner_snapshot = build_scanner_snapshot(
            market_snapshot,
            candle_snapshot,
        )
        self._record_scanner_build_latency(
            (time.perf_counter() - scanner_started) * 1000.0
        )

        for path, payload in (
            (MARKET_STATE_PATH, market_snapshot),
            (CANDLE_SNAPSHOT_PATH, candle_snapshot),
            (SCANNER_SNAPSHOT_PATH, scanner_snapshot),
        ):
            write_started = time.perf_counter()
            atomic_write_json(path, payload)
            self._record_snapshot_write_latency(
                (time.perf_counter() - write_started) * 1000.0
            )

        snapshot = self.snapshot()
        write_started = time.perf_counter()
        atomic_write_json(STATUS_PATH, snapshot)
        self._record_snapshot_write_latency(
            (time.perf_counter() - write_started) * 1000.0
        )

        now = datetime.now(timezone.utc)
'''

text=replace_once(text,old_method,new_method,"WRITE_STATUS_REPLACEMENT")

text=replace_once(
    text,
    '''                    "latencyMetrics": snapshot["latencyMetrics"],
                    "processMetrics": snapshot["processMetrics"],
                    "lastError": snapshot["lastError"],
''',
    '''                    "latencyMetrics": snapshot["latencyMetrics"],
                    "processMetrics": snapshot["processMetrics"],
                    "benchmarkMetrics": snapshot["benchmarkMetrics"],
                    "lastError": snapshot["lastError"],
''',
    "HISTORY_BENCHMARK_FIELD",
)

dst_stream.write_text(text,encoding="utf-8")

security_master='''# Fail-closed US common-stock security classification.
# Reference/universe filtering only. Databento remains live provider.

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

COMMON_TYPES={
    "stock","common stock","common_stock",
    "common equity","common_equity","equity",
}
NON_COMMON_TYPES={
    "etf","fund","etn","warrant","unit","right",
    "preferred","preferred stock","closed-end fund","trust",
}
BLOCKED_SUFFIXES=("WS","WT","W","U","UN","R","RT")

@dataclass(frozen=True)
class SecurityDecision:
    symbol:str
    allowed:bool
    classification:str
    reasons:tuple[str,...]
    evidence:dict[str,Any]

def normalize_symbol(value:Any)->str:
    raw=str(value or "").strip().upper()
    return "".join(ch for ch in raw if ch.isalnum())

def _bool(row:dict[str,Any],*keys:str)->bool|None:
    for key in keys:
        if key in row and row[key] is not None:
            value=row[key]
            if isinstance(value,bool):
                return value
            text=str(value).strip().lower()
            if text in {"true","1","yes"}:
                return True
            if text in {"false","0","no"}:
                return False
    return None

def classify_security(row:dict[str,Any])->SecurityDecision:
    symbol=normalize_symbol(row.get("symbol") or row.get("ticker"))
    name=str(row.get("companyName") or row.get("name") or "").strip()
    security_type=str(
        row.get("type") or row.get("securityType")
        or row.get("assetType") or row.get("instrumentType") or ""
    ).strip().lower()
    exchange=str(
        row.get("exchangeShortName") or row.get("exchange") or ""
    ).strip().upper()
    is_etf=_bool(row,"isEtf","isETF","etf")
    is_fund=_bool(row,"isFund","fund")
    is_active=_bool(row,"isActivelyTrading","activelyTrading","isActive")
    reasons=[]

    if not symbol or not symbol.isalnum() or len(symbol)>5:
        reasons.append("INVALID_SYMBOL_FORMAT")

    lower_name=name.lower()
    if is_etf is True or "exchange traded fund" in lower_name or " etf" in lower_name:
        reasons.append("ETF")
    if is_fund is True or "fund" in security_type or security_type in NON_COMMON_TYPES:
        reasons.append("FUND_OR_NON_COMMON_TYPE")
    if any(token in lower_name for token in (
        "warrant","preferred","preference share",
        "depositary unit","rights","unit",
    )):
        reasons.append("NON_COMMON_NAME")
    if symbol.endswith(BLOCKED_SUFFIXES):
        reasons.append("NON_COMMON_SUFFIX")
    if is_active is False:
        reasons.append("NOT_ACTIVELY_TRADING")
    if exchange and exchange not in {
        "NASDAQ","NYSE","AMEX","NYSEARCA","BATS","CBOE",
    }:
        reasons.append("NON_US_EXCHANGE")

    explicit_common=security_type in COMMON_TYPES
    if reasons:
        classification="BLOCKED_NON_COMMON"
        allowed=False
    elif explicit_common:
        classification="COMMON_STOCK"
        allowed=True
    else:
        classification="UNKNOWN_FAIL_CLOSED"
        allowed=False
        reasons.append("MISSING_EXPLICIT_COMMON_STOCK_EVIDENCE")

    return SecurityDecision(
        symbol=symbol,
        allowed=allowed,
        classification=classification,
        reasons=tuple(sorted(set(reasons))),
        evidence={
            "name":name,
            "securityType":security_type or None,
            "exchange":exchange or None,
            "isEtf":is_etf,
            "isFund":is_fund,
            "isActivelyTrading":is_active,
        },
    )
'''

(package/"app"/"data"/"security_master.py").write_text(
    security_master,encoding="utf-8"
)

builder='''#!/usr/bin/env python3
# Build validated common-stock universe using FMP reference metadata only.

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.data.fmp_client import FmpClient
from app.data.security_master import classify_security

async def fetch_profile(client,symbol):
    payload=await client.get_json("profile",{"symbol":symbol})
    rows=client.normalize_list_payload(payload)
    row=dict(rows[0]) if rows else {}
    row.setdefault("symbol",symbol)
    return row

async def run(source,output,limit):
    payload=json.loads(source.read_text(encoding="utf-8-sig"))
    symbols=(
        payload.get("remoteRuntimeChecks",{})
        .get("stages",{}).get("250",{}).get("symbols")
        or payload.get("targetSymbols") or []
    )
    symbols=list(dict.fromkeys(
        str(x).strip().upper() for x in symbols if str(x).strip()
    ))

    client=FmpClient()
    if not client.is_configured():
        raise RuntimeError("FMP_API_KEY is missing")

    semaphore=asyncio.Semaphore(8)

    async def one(symbol):
        async with semaphore:
            try:
                row=await fetch_profile(client,symbol)
                decision=classify_security(row)
                return {
                    "symbol":symbol,
                    "profile":row,
                    "decision":{
                        "allowed":decision.allowed,
                        "classification":decision.classification,
                        "reasons":list(decision.reasons),
                        "evidence":decision.evidence,
                    },
                }
            except Exception as exc:
                return {
                    "symbol":symbol,
                    "profile":{},
                    "decision":{
                        "allowed":False,
                        "classification":"REFERENCE_FETCH_FAILED",
                        "reasons":[repr(exc)[:500]],
                        "evidence":{},
                    },
                }

    rows=await asyncio.gather(*(one(s) for s in symbols))
    allowed=[r["symbol"] for r in rows if r["decision"]["allowed"]][:limit]
    blocked=[r for r in rows if not r["decision"]["allowed"]]
    result={
        "ok":len(allowed)>=limit,
        "classification":(
            "COMMON_STOCK_UNIVERSE_VALIDATED"
            if len(allowed)>=limit
            else "COMMON_STOCK_UNIVERSE_INSUFFICIENT"
        ),
        "requestedLimit":limit,
        "sourceSymbolCount":len(symbols),
        "validatedCommonStockCount":len(allowed),
        "symbols":allowed,
        "blockedCount":len(blocked),
        "blocked":blocked,
        "liveProvider":"databento",
        "referenceProvider":"fmp",
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
    }
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(
        json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8"
    )
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--source",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--limit",type=int,default=250)
    args=parser.parse_args()
    result=asyncio.run(run(Path(args.source),Path(args.output),args.limit))
    print(json.dumps(result,ensure_ascii=False))
    return 0 if result["ok"] else 2

if __name__=="__main__":
    raise SystemExit(main())
'''

(package/"ops"/"scripts"/"build_validated_common_stock_universe.py").write_text(
    builder,encoding="utf-8"
)

test_security='''from app.data.security_master import classify_security

def test_common_stock_allowed():
    d=classify_security({
        "symbol":"AAPL","companyName":"Apple Inc.",
        "type":"stock","exchangeShortName":"NASDAQ",
        "isEtf":False,"isFund":False,"isActivelyTrading":True,
    })
    assert d.allowed and d.classification=="COMMON_STOCK"

def test_etf_blocked():
    d=classify_security({
        "symbol":"QQQ","companyName":"Invesco QQQ Trust ETF",
        "type":"etf","exchangeShortName":"NASDAQ",
        "isEtf":True,"isActivelyTrading":True,
    })
    assert not d.allowed and "ETF" in d.reasons

def test_unknown_fails_closed():
    d=classify_security({
        "symbol":"ABCD","companyName":"Example Corp",
        "exchangeShortName":"NASDAQ","isActivelyTrading":True,
    })
    assert not d.allowed and d.classification=="UNKNOWN_FAIL_CLOSED"

def test_warrant_blocked():
    d=classify_security({
        "symbol":"ABCW","companyName":"Example Warrant",
        "type":"stock","exchangeShortName":"NASDAQ",
        "isActivelyTrading":True,
    })
    assert not d.allowed
'''

(package/"tests"/"test_security_master.py").write_text(
    test_security,encoding="utf-8"
)

files=[
    dst_stream,dst_fmp,
    package/"app"/"data"/"security_master.py",
    package/"ops"/"scripts"/"build_validated_common_stock_universe.py",
    package/"tests"/"test_security_master.py",
]
for path in files:
    ast.parse(path.read_text(encoding="utf-8"),filename=str(path))

patched=dst_stream.read_text(encoding="utf-8")
required=[
    '"benchmarkMetrics": benchmark_metrics',
    '"marketEventsPerSecond"',
    '"rawRecordsPerSecond"',
    '"cpuPercent"',
    '"snapshotWriteLatencyMs"',
    '"scannerBuildLatencyMs"',
    '"candleCompleteness"',
]
missing=[item for item in required if item not in patched]
if missing:
    raise RuntimeError(f"missing instrumentation contract: {missing}")

manifest={
    "ok":True,
    "classification":"DAY7D_SECURITY_MASTER_AND_INSTRUMENTATION_PATCH_PACKAGE_VALIDATED",
    "packageBuilt":True,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "liveProvider":"databento",
    "referenceProvider":"fmp",
    "files":[str(path.relative_to(package)) for path in files],
    "instrumentationFields":[
        "rawRecordsPerSecond","marketEventsPerSecond","cpuPercent",
        "callbackLatencyMs","snapshotWriteLatencyMs",
        "scannerBuildLatencyMs","candleCompleteness",
    ],
    "securityPolicy":{
        "commonStock":"ALLOW_WITH_EXPLICIT_EVIDENCE",
        "etfFundWarrantUnitRightPreferred":"BLOCK",
        "unknown":"FAIL_CLOSED",
    },
    "clientEligibilityChanged":False,
    "telegramEligibilityChanged":False,
    "paperEligibilityChanged":False,
    "nextAction":"RUN_ISOLATED_PACKAGE_TESTS_AND_REVIEW",
}
(package/"manifest.json").write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8"
)
print(json.dumps(manifest,ensure_ascii=False))
'@

[IO.File]::WriteAllText($patcher,$python,[Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "=== S10.7I SECURITY MASTER + INSTRUMENTATION PACKAGE ===" -ForegroundColor Green
Write-Host "Package-only. No deploy, no restart, no universe change." -ForegroundColor Yellow

$pythonExe=$null
foreach($candidate in @(
  (Join-Path $ProjectRoot "services\stock-engine\.venv\Scripts\python.exe"),
  (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
  "python"
)){
  try{
    & $candidate --version *> $null
    if($LASTEXITCODE-eq 0){
      $pythonExe=$candidate
      break
    }
  }catch{}
}

if(-not $pythonExe){throw "Python executable not found"}

$out=& $pythonExe $patcher $ProjectRoot
Remove-Item -LiteralPath $patcher -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "S10.7I package build failed"}

$text=$out-join "`n"
$r=$text|ConvertFrom-Json
$text|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7I SECURITY MASTER AND INSTRUMENTATION PACKAGE",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "PACKAGE_BUILT=$($r.packageBuilt)",
 "PACKAGE_EXECUTED=$($r.packageExecuted)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "LIVE_PROVIDER=$($r.liveProvider)",
 "REFERENCE_PROVIDER=$($r.referenceProvider)",
 "FILES=$(@($r.files)-join ',')",
 "INSTRUMENTATION_FIELDS=$(@($r.instrumentationFields)-join ',')",
 "CLIENT_ELIGIBILITY_CHANGED=$($r.clientEligibilityChanged)",
 "TELEGRAM_ELIGIBILITY_CHANGED=$($r.telegramEligibilityChanged)",
 "PAPER_ELIGIBILITY_CHANGED=$($r.paperEligibilityChanged)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_ROOT=$PackageRoot",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7I Security Master + Instrumentation Patch Package

- OK: $($r.ok)
- Classification: $($r.classification)
- Package built: $($r.packageBuilt)
- Package executed: $($r.packageExecuted)
- Deployment authorized: $($r.deploymentAuthorized)
- Live provider: $($r.liveProvider)
- Reference provider: $($r.referenceProvider)
- Instrumentation: $(@($r.instrumentationFields)-join ', ')
- Client eligibility changed: $($r.clientEligibilityChanged)
- Telegram eligibility changed: $($r.telegramEligibilityChanged)
- Paper eligibility changed: $($r.paperEligibilityChanged)
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7I PACKAGE COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Package built: $($r.packageBuilt)"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Live provider: $($r.liveProvider)"
Write-Host "Reference provider: $($r.referenceProvider)"
Write-Host "Instrumentation: $(@($r.instrumentationFields)-join ', ')"
Write-Host "Client/Telegram/Paper changed: $($r.clientEligibilityChanged) / $($r.telegramEligibilityChanged) / $($r.paperEligibilityChanged)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Package root: $PackageRoot"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
