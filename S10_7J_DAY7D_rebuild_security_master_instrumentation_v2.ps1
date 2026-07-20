param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$V1=Join-Path $ProjectRoot "PROJECT_STATE\S10_7I_security_master_instrumentation_patch_v1"
$V2=Join-Path $ProjectRoot "PROJECT_STATE\S10_7J_security_master_instrumentation_patch_v2"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

if(-not (Test-Path -LiteralPath (Join-Path $V1 "app\market_data\stream_service.py"))){
  throw "Missing S10.7I V1 package: $V1"
}

if(Test-Path -LiteralPath $V2){
  Remove-Item -LiteralPath $V2 -Recurse -Force
}

Copy-Item -LiteralPath $V1 -Destination $V2 -Recurse -Force

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7J_SECURITY_MASTER_INSTRUMENTATION_V2_raw_$stamp.json"
$report=Join-Path $Audit "S10_7J_SECURITY_MASTER_INSTRUMENTATION_V2_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7J_SECURITY_MASTER_INSTRUMENTATION_V2_$stamp.md"
$builder=Join-Path $env:TEMP "s10_7j_rebuild_$stamp.py"

$python=@'
from __future__ import annotations

import ast
import importlib.util
import json
import sys
from pathlib import Path

project=Path(sys.argv[1])
v2=project/"PROJECT_STATE"/"S10_7J_security_master_instrumentation_patch_v2"

security_path=v2/"app"/"data"/"security_master.py"
tests_path=v2/"tests"/"test_security_master.py"
manifest_path=v2/"manifest.json"
stream_path=v2/"app"/"market_data"/"stream_service.py"

security_master="""\
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

COMMON_TYPES={
    "stock","common stock","common_stock",
    "common equity","common_equity","equity",
}

NON_COMMON_TYPES={
    "etf","fund","etn","warrant","unit","right","rights",
    "preferred","preferred stock","closed-end fund","trust",
}

US_EXCHANGES={
    "NASDAQ","NYSE","AMEX","NYSEAMERICAN","BATS","CBOE",
}

BLOCKED_NAME_TOKENS=(
    "warrant","preferred","preference share",
    "depositary unit","subscription right","rights",
    " units"," unit ",
)

BLOCKED_RAW_SYMBOL_PATTERNS=(
    ".W","-W","/W",".WS","-WS","/WS",
    ".WT","-WT","/WT",".U","-U","/U",
    ".R","-R","/R",
)

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
        if key not in row or row[key] is None:
            continue

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
    raw_symbol=str(row.get("symbol") or row.get("ticker") or "").strip().upper()
    symbol=normalize_symbol(raw_symbol)
    name=str(row.get("companyName") or row.get("name") or "").strip()
    security_type=str(
        row.get("type")
        or row.get("securityType")
        or row.get("assetType")
        or row.get("instrumentType")
        or ""
    ).strip().lower()
    exchange=str(
        row.get("exchangeShortName")
        or row.get("exchange")
        or ""
    ).strip().upper()

    is_etf=_bool(row,"isEtf","isETF","etf")
    is_fund=_bool(row,"isFund","fund")
    is_active=_bool(row,"isActivelyTrading","activelyTrading","isActive")

    reasons=[]
    lower_name=f" {name.lower()} "

    if not symbol or not symbol.isalnum() or len(symbol)>5:
        reasons.append("INVALID_SYMBOL_FORMAT")

    if is_etf is True or "exchange traded fund" in lower_name or " etf " in lower_name:
        reasons.append("ETF")

    if is_fund is True:
        reasons.append("FUND")

    if security_type in NON_COMMON_TYPES or "fund" in security_type:
        reasons.append("EXPLICIT_NON_COMMON_TYPE")

    if any(token in lower_name for token in BLOCKED_NAME_TOKENS):
        reasons.append("NON_COMMON_NAME")

    if any(pattern in raw_symbol for pattern in BLOCKED_RAW_SYMBOL_PATTERNS):
        reasons.append("NON_COMMON_RAW_SYMBOL_PATTERN")

    if is_active is False:
        reasons.append("NOT_ACTIVELY_TRADING")

    if exchange and exchange not in US_EXCHANGES:
        reasons.append("NON_US_EXCHANGE")

    explicit_common=security_type in COMMON_TYPES
    reference_flags_common=(
        is_etf is False
        and is_fund is False
        and is_active is True
        and exchange in US_EXCHANGES
    )

    if reasons:
        classification="BLOCKED_NON_COMMON"
        allowed=False
    elif explicit_common:
        classification="COMMON_STOCK_EXPLICIT_TYPE"
        allowed=True
    elif reference_flags_common:
        classification="COMMON_STOCK_REFERENCE_FLAGS"
        allowed=True
    else:
        classification="UNKNOWN_FAIL_CLOSED"
        allowed=False
        reasons.append("INSUFFICIENT_COMMON_STOCK_EVIDENCE")

    return SecurityDecision(
        symbol=symbol,
        allowed=allowed,
        classification=classification,
        reasons=tuple(sorted(set(reasons))),
        evidence={
            "rawSymbol":raw_symbol or None,
            "name":name,
            "securityType":security_type or None,
            "exchange":exchange or None,
            "isEtf":is_etf,
            "isFund":is_fund,
            "isActivelyTrading":is_active,
        },
    )
"""

security_path.write_text(security_master,encoding="utf-8")

tests="""\
from app.data.security_master import classify_security

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

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

def test_core25_reference_flags_allowed():
    blocked=[]
    for symbol in CORE25:
        decision=classify_security(profile(symbol))
        if not decision.allowed:
            blocked.append((symbol,decision.classification,decision.reasons))
    assert blocked==[]

def test_etf_blocked():
    decision=classify_security(profile(
        "QQQ",
        companyName="Invesco QQQ Trust ETF",
        type="etf",
        isEtf=True,
    ))
    assert not decision.allowed

def test_warrant_blocked():
    decision=classify_security(profile(
        "ABC.W",
        companyName="Example Holdings Warrant",
    ))
    assert not decision.allowed

def test_legitimate_single_letter_endings_allowed():
    for symbol in ("NOW","MU","UBER"):
        assert classify_security(profile(symbol)).allowed

def test_unknown_fails_closed():
    decision=classify_security({
        "symbol":"ABCD",
        "companyName":"Example Corporation",
        "exchangeShortName":"NASDAQ",
    })
    assert not decision.allowed
    assert decision.classification=="UNKNOWN_FAIL_CLOSED"
"""

tests_path.write_text(tests,encoding="utf-8")

for path in (
    security_path,
    tests_path,
    stream_path,
    v2/"app"/"data"/"fmp_client.py",
    v2/"ops"/"scripts"/"build_validated_common_stock_universe.py",
):
    ast.parse(path.read_text(encoding="utf-8"),filename=str(path))

spec=importlib.util.spec_from_file_location("security_master_under_test",security_path)
module=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=module
spec.loader.exec_module(module)

def reference(symbol,**overrides):
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

core25_results={}
for symbol in core25:
    decision=module.classify_security(reference(symbol))
    core25_results[symbol]={
        "allowed":decision.allowed,
        "classification":decision.classification,
        "reasons":list(decision.reasons),
    }

blocked_core25=[
    symbol for symbol,row in core25_results.items()
    if not row["allowed"]
]

qqq=module.classify_security(reference(
    "QQQ",
    companyName="Invesco QQQ Trust ETF",
    type="etf",
    isEtf=True,
))

warrant=module.classify_security(reference(
    "ABC.W",
    companyName="Example Holdings Warrant",
))

unknown=module.classify_security({
    "symbol":"ABCD",
    "companyName":"Example Corporation",
    "exchangeShortName":"NASDAQ",
})

semantic_errors=[]

if blocked_core25:
    semantic_errors.append("CORE25_FALSE_POSITIVES")

if qqq.allowed:
    semantic_errors.append("ETF_NOT_BLOCKED")

if warrant.allowed:
    semantic_errors.append("WARRANT_NOT_BLOCKED")

if unknown.allowed:
    semantic_errors.append("UNKNOWN_NOT_FAIL_CLOSED")

stream_text=stream_path.read_text(encoding="utf-8")
instrumentation_fields=[
    "rawRecordsPerSecond",
    "marketEventsPerSecond",
    "cpuPercent",
    "callbackLatencyMs",
    "snapshotWriteLatencyMs",
    "scannerBuildLatencyMs",
    "candleCompleteness",
]

missing_instrumentation=[
    field for field in instrumentation_fields
    if field not in stream_text
]

if missing_instrumentation:
    semantic_errors.append("INSTRUMENTATION_CONTRACT_INCOMPLETE")

manifest={
    "ok":not semantic_errors,
    "classification":(
        "DAY7D_SECURITY_MASTER_AND_INSTRUMENTATION_V2_PACKAGE_VALIDATED"
        if not semantic_errors
        else "DAY7D_SECURITY_MASTER_AND_INSTRUMENTATION_V2_PACKAGE_BLOCKED"
    ),
    "packageBuilt":True,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "liveProvider":"databento",
    "referenceProvider":"fmp",
    "core25Tested":len(core25),
    "core25Blocked":blocked_core25,
    "core25Results":core25_results,
    "qqqBlocked":not qqq.allowed,
    "warrantBlocked":not warrant.allowed,
    "unknownFailClosed":not unknown.allowed,
    "instrumentationFields":instrumentation_fields,
    "missingInstrumentationFields":missing_instrumentation,
    "semanticErrors":semantic_errors,
    "clientEligibilityChanged":False,
    "telegramEligibilityChanged":False,
    "paperEligibilityChanged":False,
    "nextAction":(
        "RUN_ISOLATED_STREAM_INSTRUMENTATION_TESTS"
        if not semantic_errors
        else "FIX_V2_PACKAGE"
    ),
}

manifest_path.write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),
    encoding="utf-8",
)

print(json.dumps(manifest,ensure_ascii=False))
'@

[IO.File]::WriteAllText($builder,$python,[Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "=== S10.7J SECURITY MASTER + INSTRUMENTATION V2 ===" -ForegroundColor Green
Write-Host "Package-only correction. No deploy, no restart, no universe change." -ForegroundColor Yellow

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

$out=& $pythonExe $builder $ProjectRoot
Remove-Item -LiteralPath $builder -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "S10.7J V2 package build failed"
}

$text=$out-join "`n"
$r=$text|ConvertFrom-Json
$text|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7J SECURITY MASTER AND INSTRUMENTATION V2",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "PACKAGE_BUILT=$($r.packageBuilt)",
 "PACKAGE_EXECUTED=$($r.packageExecuted)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "LIVE_PROVIDER=$($r.liveProvider)",
 "REFERENCE_PROVIDER=$($r.referenceProvider)",
 "CORE25_TESTED=$($r.core25Tested)",
 "CORE25_BLOCKED=$(@($r.core25Blocked)-join ',')",
 "QQQ_BLOCKED=$($r.qqqBlocked)",
 "WARRANT_BLOCKED=$($r.warrantBlocked)",
 "UNKNOWN_FAIL_CLOSED=$($r.unknownFailClosed)",
 "MISSING_INSTRUMENTATION=$(@($r.missingInstrumentationFields)-join ',')",
 "SEMANTIC_ERRORS=$(@($r.semanticErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_ROOT=$V2",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7J Security Master + Instrumentation V2

- OK: $($r.ok)
- Classification: $($r.classification)
- Core25 tested: $($r.core25Tested)
- Core25 blocked: $(@($r.core25Blocked)-join ', ')
- QQQ blocked: $($r.qqqBlocked)
- Warrant blocked: $($r.warrantBlocked)
- Unknown fails closed: $($r.unknownFailClosed)
- Missing instrumentation: $(@($r.missingInstrumentationFields)-join ', ')
- Semantic errors: $(@($r.semanticErrors)-join ', ')
- Deployment authorized: False
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7J V2 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Package built: $($r.packageBuilt)"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Core25 tested / blocked: $($r.core25Tested) / $(@($r.core25Blocked).Count)"
Write-Host "Blocked Core25: $(@($r.core25Blocked)-join ', ')"
Write-Host "QQQ blocked: $($r.qqqBlocked)"
Write-Host "Warrant blocked: $($r.warrantBlocked)"
Write-Host "Unknown fail closed: $($r.unknownFailClosed)"
Write-Host "Missing instrumentation: $(@($r.missingInstrumentationFields)-join ', ')"
Write-Host "Semantic errors: $(@($r.semanticErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Package root: $V2"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "S10.7J V2 package blocked"
}
