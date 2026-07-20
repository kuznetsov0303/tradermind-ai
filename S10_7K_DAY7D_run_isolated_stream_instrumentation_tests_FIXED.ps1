param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Package=Join-Path $ProjectRoot "PROJECT_STATE\S10_7J_security_master_instrumentation_patch_v2"
$MarketSnapshot=Join-Path $ProjectRoot "PROJECT_STATE\S10_7H2_active_market_data_source_snapshot"
$AppSnapshot=Join-Path $ProjectRoot "PROJECT_STATE\S10_7H_active_source_snapshot"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$required=@(
  (Join-Path $Package "app\market_data\stream_service.py"),
  (Join-Path $Package "app\data\security_master.py"),
  (Join-Path $MarketSnapshot "app\market_data\contracts.py"),
  (Join-Path $MarketSnapshot "app\market_data\candle_engine.py"),
  (Join-Path $MarketSnapshot "app\market_data\market_state.py"),
  (Join-Path $MarketSnapshot "app\market_data\scanner.py")
)

foreach($path in $required){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required isolated-test source missing: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7K_ISOLATED_STREAM_INSTRUMENTATION_TEST_raw_$stamp.json"
$report=Join-Path $Audit "S10_7K_ISOLATED_STREAM_INSTRUMENTATION_TEST_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7K_ISOLATED_STREAM_INSTRUMENTATION_TEST_$stamp.md"
$runner=Join-Path $env:TEMP "s10_7k_isolated_test_$stamp.py"

$python=@'
from __future__ import annotations

import ast
import importlib
import json
import os
import shutil
import sys
import tempfile
import time
import types
from pathlib import Path

project=Path(sys.argv[1])
package=project/"PROJECT_STATE"/"S10_7J_security_master_instrumentation_patch_v2"
market_snapshot=project/"PROJECT_STATE"/"S10_7H2_active_market_data_source_snapshot"
app_snapshot=project/"PROJECT_STATE"/"S10_7H_active_source_snapshot"

errors=[]
checks={}

with tempfile.TemporaryDirectory(prefix="s10_7k_") as temp_raw:
    temp=Path(temp_raw)
    root=temp/"runtime"
    outputs=temp/"outputs"

    shutil.copytree(market_snapshot/"app",root/"app")

    data_src=app_snapshot/"app"/"data"
    if data_src.is_dir():
        shutil.copytree(data_src,root/"app"/"data",dirs_exist_ok=True)

    shutil.copy2(
        package/"app"/"market_data"/"stream_service.py",
        root/"app"/"market_data"/"stream_service.py",
    )
    shutil.copy2(
        package/"app"/"data"/"security_master.py",
        root/"app"/"data"/"security_master.py",
    )

    (root/"app"/"data"/"__init__.py").touch(exist_ok=True)
    outputs.mkdir(parents=True,exist_ok=True)

    os.environ["SKILLEDGE_MARKET_STREAM_SYMBOLS"]="AAPL,MSFT"
    os.environ["SKILLEDGE_MARKET_STREAM_STATUS_PATH"]=str(outputs/"status.json")
    os.environ["SKILLEDGE_MARKET_STREAM_HISTORY_PATH"]=str(outputs/"history.jsonl")
    os.environ["SKILLEDGE_SCANNER_SNAPSHOT_PATH"]=str(outputs/"scanner.json")
    os.environ["SKILLEDGE_CANDLE_SNAPSHOT_PATH"]=str(outputs/"candles.json")
    os.environ["SKILLEDGE_MARKET_STATE_PATH"]=str(outputs/"market.json")
    os.environ["SKILLEDGE_MARKET_STREAM_RECONNECT_LEDGER_PATH"]=str(
        outputs/"reconnects.jsonl"
    )

    try:
        import databento  # noqa: F401
    except Exception:
        fake=types.ModuleType("databento")

        class FakeLive:
            pass

        fake.Live=FakeLive
        fake.enable_logging=lambda *_args,**_kwargs:None
        sys.modules["databento"]=fake

    sys.path.insert(0,str(root))

    # Build namespace packages explicitly so legacy app/market_data/__init__.py
    # is not executed. The active Databento stream does not require its old
    # provider import for this isolated test.
    app_pkg=types.ModuleType("app")
    app_pkg.__path__=[str(root/"app")]
    sys.modules["app"]=app_pkg

    market_pkg=types.ModuleType("app.market_data")
    market_pkg.__path__=[str(root/"app"/"market_data")]
    sys.modules["app.market_data"]=market_pkg

    data_pkg=types.ModuleType("app.data")
    data_pkg.__path__=[str(root/"app"/"data")]
    sys.modules["app.data"]=data_pkg

    stream=importlib.import_module("app.market_data.stream_service")
    security=importlib.import_module("app.data.security_master")

    ast.parse(
        (package/"app"/"market_data"/"stream_service.py").read_text(
            encoding="utf-8"
        )
    )
    checks["patchedStreamSyntax"]=True

    runtime=stream.StreamRuntime()
    checks["runtimeInstantiation"]=True

    # Deterministic rate and CPU test.
    runtime._metric_sample_monotonic=100.0
    runtime._metric_sample_raw_total=10
    runtime._metric_sample_event_total=4
    runtime._metric_sample_cpu_seconds=2.0

    original_monotonic=stream.time.monotonic
    stream.time.monotonic=lambda:102.0

    rates=runtime._sample_rate_metrics(
        raw_counts={"MBP1Msg":30},
        event_counts={"trade":10},
        process_metrics={
            "cpuUserSeconds":2.8,
            "cpuSystemSeconds":0.2,
        },
    )

    stream.time.monotonic=original_monotonic

    checks["rawRecordsPerSecondExact"]=abs(
        float(rates["rawRecordsPerSecond"])-10.0
    )<1e-9
    checks["marketEventsPerSecondExact"]=abs(
        float(rates["marketEventsPerSecond"])-3.0
    )<1e-9
    checks["cpuPercentExact"]=abs(
        float(rates["cpuPercent"])-50.0
    )<1e-9
    checks["sampleWindowSecondsExact"]=abs(
        float(rates["sampleWindowSeconds"])-2.0
    )<1e-9

    synthetic_candles={
        "symbols":{
            "AAPL":{
                "openingRange5m":{"complete":True},
                "intervals":{
                    "1m":{"active":{"close":"100"},"closedCount":3}
                },
            },
            "MSFT":{
                "openingRange5m":{"complete":False},
                "intervals":{
                    "1m":{"active":None,"closedCount":2}
                },
            },
        }
    }

    runtime._update_candle_completeness(synthetic_candles)
    completeness=dict(runtime._last_candle_completeness)

    checks["candleConfiguredCount"]=(
        completeness["configuredSymbolCount"]==2
    )
    checks["candleCompleteness100"]=abs(
        float(completeness["candleCompletenessPercent"])-100.0
    )<1e-9
    checks["openingRangeCompleteness50"]=abs(
        float(completeness["openingRangeCompletenessPercent"])-50.0
    )<1e-9

    runtime.market_state.snapshot=lambda:{
        "schemaVersion":1,
        "symbolCount":2,
        "symbols":{"AAPL":{},"MSFT":{}},
    }
    runtime.candle_engine.snapshot=lambda:synthetic_candles

    original_scanner=stream.build_scanner_snapshot
    stream.build_scanner_snapshot=lambda market,candles:{
        "schemaVersion":1,
        "researchOnly":True,
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
        "marketSymbolCount":len(market.get("symbols",{})),
        "candleSymbolCount":len(candles.get("symbols",{})),
    }

    runtime.write_status()
    stream.build_scanner_snapshot=original_scanner

    expected_files={
        "status.json","market.json","candles.json","scanner.json"
    }
    written={path.name for path in outputs.iterdir() if path.is_file()}
    checks["expectedSnapshotFilesWritten"]=expected_files.issubset(written)

    status=json.loads((outputs/"status.json").read_text(encoding="utf-8"))
    benchmark=status.get("benchmarkMetrics") or {}

    checks["benchmarkMetricsPresent"]=isinstance(benchmark,dict)
    checks["rateFieldsPresent"]=all(
        key in benchmark
        for key in (
            "rawRecordsPerSecond",
            "marketEventsPerSecond",
            "cpuPercent",
            "sampleWindowSeconds",
        )
    )
    checks["callbackLatencyPresent"]="callbackLatencyMs" in benchmark
    checks["snapshotLatencyPresent"]="snapshotWriteLatencyMs" in benchmark
    checks["scannerLatencyPresent"]="scannerBuildLatencyMs" in benchmark
    checks["candleCompletenessPresent"]="candleCompleteness" in benchmark

    scanner=json.loads((outputs/"scanner.json").read_text(encoding="utf-8"))
    checks["scannerResearchOnlyPreserved"]=scanner.get("researchOnly") is True
    checks["scannerClientBlocked"]=scanner.get("clientEligible") is False
    checks["scannerTelegramBlocked"]=scanner.get("telegramEligible") is False
    checks["scannerPaperBlocked"]=scanner.get("paperEligible") is False

    def profile(symbol,**overrides):
        row={
            "symbol":symbol,
            "companyName":f"{symbol} Corporation",
            "exchangeShortName":"NASDAQ",
            "isEtf":False,
            "isFund":False,
            "isActivelyTrading":True,
        }
        row.update(overrides)
        return row

    core25=[
        "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
        "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
        "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
    ]

    core25_blocked=[
        symbol
        for symbol in core25
        if not security.classify_security(profile(symbol)).allowed
    ]

    qqq=security.classify_security(profile(
        "QQQ",
        companyName="Invesco QQQ Trust ETF",
        type="etf",
        isEtf=True,
    ))
    warrant=security.classify_security(profile(
        "ABC.W",
        companyName="Example Holdings Warrant",
    ))
    unknown=security.classify_security({
        "symbol":"ABCD",
        "companyName":"Example Corporation",
        "exchangeShortName":"NASDAQ",
    })

    checks["core25BlockedCountZero"]=len(core25_blocked)==0
    checks["qqqBlocked"]=not qqq.allowed
    checks["warrantBlocked"]=not warrant.allowed
    checks["unknownFailClosed"]=not unknown.allowed

    failed=[name for name,value in checks.items() if value is not True]

    if failed:
        errors.extend(failed)

    result={
        "ok":not errors,
        "classification":(
            "DAY7D_ISOLATED_STREAM_INSTRUMENTATION_TESTS_PASSED"
            if not errors
            else "DAY7D_ISOLATED_STREAM_INSTRUMENTATION_TESTS_FAILED"
        ),
        "isolated":True,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "deploymentAuthorized":False,
        "checks":checks,
        "failedChecks":errors,
        "calculatedRates":rates,
        "calculatedCompleteness":completeness,
        "writtenFiles":sorted(written),
        "core25Blocked":core25_blocked,
        "qqqBlocked":not qqq.allowed,
        "warrantBlocked":not warrant.allowed,
        "unknownFailClosed":not unknown.allowed,
        "clientEligibilityChanged":False,
        "telegramEligibilityChanged":False,
        "paperEligibilityChanged":False,
        "nextAction":(
            "BUILD_READ_ONLY_FMP_REFERENCE_VALIDATION_PROBE"
            if not errors
            else "FIX_ISOLATED_TEST_FAILURES"
        ),
    }

    print(json.dumps(result,ensure_ascii=False))
'@

[IO.File]::WriteAllText($runner,$python,[Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "=== S10.7K ISOLATED STREAM INSTRUMENTATION TESTS ===" -ForegroundColor Green
Write-Host "Local temp runtime only. No VPS, no deploy, no restart." -ForegroundColor Yellow

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

if(-not $pythonExe){
  throw "Python executable not found"
}

$out=& $pythonExe $runner $ProjectRoot
Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "S10.7K isolated test runner failed before structured result"
}

$text=$out-join "`n"
$r=$text|ConvertFrom-Json
$text|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7K ISOLATED STREAM INSTRUMENTATION TEST",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "ISOLATED=$($r.isolated)",
 "FAILED_CHECKS=$(@($r.failedChecks)-join ',')",
 "RAW_RECORDS_PER_SECOND=$($r.calculatedRates.rawRecordsPerSecond)",
 "MARKET_EVENTS_PER_SECOND=$($r.calculatedRates.marketEventsPerSecond)",
 "CPU_PERCENT=$($r.calculatedRates.cpuPercent)",
 "CANDLE_COMPLETENESS_PERCENT=$($r.calculatedCompleteness.candleCompletenessPercent)",
 "OPENING_RANGE_COMPLETENESS_PERCENT=$($r.calculatedCompleteness.openingRangeCompletenessPercent)",
 "CORE25_BLOCKED=$(@($r.core25Blocked)-join ',')",
 "QQQ_BLOCKED=$($r.qqqBlocked)",
 "WARRANT_BLOCKED=$($r.warrantBlocked)",
 "UNKNOWN_FAIL_CLOSED=$($r.unknownFailClosed)",
 "CLIENT_ELIGIBILITY_CHANGED=$($r.clientEligibilityChanged)",
 "TELEGRAM_ELIGIBILITY_CHANGED=$($r.telegramEligibilityChanged)",
 "PAPER_ELIGIBILITY_CHANGED=$($r.paperEligibilityChanged)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7K Isolated Stream Instrumentation Test

- OK: $($r.ok)
- Classification: $($r.classification)
- Isolated: $($r.isolated)
- Failed checks: $(@($r.failedChecks)-join ', ')
- Raw records/sec: $($r.calculatedRates.rawRecordsPerSecond)
- Market events/sec: $($r.calculatedRates.marketEventsPerSecond)
- CPU percent: $($r.calculatedRates.cpuPercent)
- Candle completeness: $($r.calculatedCompleteness.candleCompletenessPercent)
- Opening-range completeness: $($r.calculatedCompleteness.openingRangeCompletenessPercent)
- Core25 blocked: $(@($r.core25Blocked)-join ', ')
- QQQ blocked: $($r.qqqBlocked)
- Warrant blocked: $($r.warrantBlocked)
- Unknown fail-closed: $($r.unknownFailClosed)
- Deployment authorized: False
- Next action: $($r.nextAction)

Local temporary runtime only.
No VPS connection.
No production mutation.
No service restart.
No universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7K ISOLATED TEST COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Failed checks: $(@($r.failedChecks)-join ', ')"
Write-Host "Rates raw/events/CPU: $($r.calculatedRates.rawRecordsPerSecond) / $($r.calculatedRates.marketEventsPerSecond) / $($r.calculatedRates.cpuPercent)"
Write-Host "Candle / OR completeness: $($r.calculatedCompleteness.candleCompletenessPercent) / $($r.calculatedCompleteness.openingRangeCompletenessPercent)"
Write-Host "Core25 blocked: $(@($r.core25Blocked)-join ', ')"
Write-Host "QQQ / warrant / unknown blocked: $($r.qqqBlocked) / $($r.warrantBlocked) / $($r.unknownFailClosed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "S10.7K isolated instrumentation tests failed"
}
