param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7F_250_SYMBOL_SECURITY_AND_INSTRUMENTATION_AUDIT_raw_$stamp.json"
$report=Join-Path $Audit "S10_7F_250_SYMBOL_SECURITY_AND_INSTRUMENTATION_AUDIT_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7F_250_SYMBOL_SECURITY_AND_INSTRUMENTATION_AUDIT_$stamp.md"

$localSh=Join-Path $env:TEMP "s10_7f_250_symbol_audit_$stamp.sh"
$remoteSh="/tmp/s10_7f_250_symbol_audit_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import re
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

def norm(v):
    return str(v or "").strip().upper()

def rows_from(payload):
    if isinstance(payload,list):
        return payload
    if not isinstance(payload,dict):
        return []
    for key in ("symbols","rows","data","items","universe","results"):
        value=payload.get(key)
        if isinstance(value,list):
            return value
    return []

metadata={}
sources=[]

for path in sorted((ENGINE/"data").rglob("*.json")):
    if "universe" not in str(path).lower():
        continue

    try:
        payload=json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue

    rows=rows_from(payload)
    if not rows:
        continue

    added=0

    for row in rows:
        if isinstance(row,str):
            symbol=norm(row)
            record={"symbol":symbol}
        elif isinstance(row,dict):
            symbol=norm(row.get("symbol") or row.get("ticker"))
            record=dict(row)
            record["symbol"]=symbol
        else:
            continue

        if not symbol:
            continue

        if symbol not in metadata:
            metadata[symbol]=record
            added+=1
        else:
            # Merge richer fields without overwriting existing non-empty values.
            for key,value in record.items():
                if key not in metadata[symbol] or metadata[symbol].get(key) in (None,"",[]):
                    metadata[symbol][key]=value

    sources.append({
        "path":str(path),
        "rows":len(rows),
        "newSymbols":added,
    })

# Reconstruct the same candidate order used by the prior review:
# Core25 first, then latest watchlist-derived symbols cannot be reproduced
# reliably offline, so use the exact 250 list from the previous review if present.
review_files=sorted(
    (ENGINE/"data").rglob("*250*review*.json"),
    key=lambda p:p.stat().st_mtime,
    reverse=True,
)

target250=None

for path in review_files:
    try:
        payload=json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue

    stage=(
        payload.get("remoteRuntimeChecks",{})
        .get("stages",{})
        .get("250",{})
        .get("symbols")
    )

    if isinstance(stage,list) and len(stage)==250:
        target250=[norm(x) for x in stage]
        break

# Fallback to deterministic merged universe ordering.
if target250 is None:
    ordered=CORE25+[s for s in metadata if s not in set(CORE25)]
    target250=ordered[:250]

known_etf={
    "QQQ","SPY","IWM","DIA","XLF","XLK","XLE","XLV","XLY","XLP",
    "XLI","XLU","XLRE","XLB","ARKK","TQQQ","SQQQ","SOXL","SOXS",
}

bad_suffixes=("W","WS","WT","U","UN","R","RT")

def field(record,*names):
    for name in names:
        value=record.get(name)
        if value not in (None,""):
            return str(value)
    return ""

def classify(symbol,record):
    text=" ".join([
        field(record,"type","securityType","security_type","assetType","asset_type"),
        field(record,"name","companyName","company_name","description"),
        field(record,"exchange","exchangeShortName","exchange_short_name"),
    ]).upper()

    issues=[]

    if symbol in known_etf or any(token in text for token in (" ETF","EXCHANGE TRADED FUND","ETN")):
        issues.append("ETF_OR_ETN")

    if any(token in text for token in ("WARRANT"," WTS","RIGHTS","UNIT","PREFERRED")):
        issues.append("NON_COMMON_EQUITY")

    explicit_type=field(
        record,
        "type","securityType","security_type","assetType","asset_type",
    ).upper()

    if explicit_type and explicit_type not in {
        "STOCK","COMMON STOCK","COMMON_STOCK","EQUITY","COMMON EQUITY"
    }:
        issues.append("EXPLICIT_NON_COMMON_TYPE")

    if symbol.endswith(("WS","WT")):
        issues.append("WARRANT_SUFFIX")

    return sorted(set(issues))

flagged=[]
unknown=[]

for symbol in target250:
    record=metadata.get(symbol,{})
    issues=classify(symbol,record)

    if issues:
        flagged.append({
            "symbol":symbol,
            "issues":issues,
            "metadata":record,
        })

    explicit_type=field(
        record,
        "type","securityType","security_type","assetType","asset_type",
    )

    if not explicit_type:
        unknown.append(symbol)

package=Path(
    "/opt/skilledge/stock-engine/PROJECT_STATE/"
    "guarded_250_symbol_progressive_canary_package_v1/"
    "execute_250_symbol_progressive_canary.sh"
)

# Local package is not on VPS by default; audit expected instrumentation contract
# from the generated package logic known to the project.
required_metrics=[
    "eventsPerSecond",
    "processingLagMs",
    "quoteFreshnessP95Seconds",
    "cpuPercent",
    "rssMb",
    "snapshotWriteMs",
    "candleCompletenessPercent",
    "appliedTradesGrowth",
    "providerReconnectCount",
    "providerErrorCount",
    "scannerCycleMs",
    "setupCycleMs",
]

present_metrics=[
    "rssMb",
    "marketSymbolCount",
    "candleSymbolCount",
    "appliedTradesGrowth",
    "NRestarts",
    "negativeAgeCount",
]

missing_metrics=[m for m in required_metrics if m not in present_metrics]

errors=[]

if len(target250)!=250 or len(set(target250))!=250:
    errors.append("TARGET_250_INVALID")

if flagged:
    errors.append("NON_COMMON_EQUITY_SYMBOLS_PRESENT")

if unknown:
    errors.append("SECURITY_TYPE_METADATA_INCOMPLETE")

if missing_metrics:
    errors.append("CAPACITY_INSTRUMENTATION_INCOMPLETE")

ok=not errors

print(json.dumps({
    "ok":ok,
    "classification":(
        "DAY7D_250_SYMBOL_PREARM_AUDIT_PASSED"
        if ok
        else "DAY7D_250_SYMBOL_PREARM_AUDIT_BLOCKED"
    ),
    "targetCount":len(target250),
    "uniqueTargetCount":len(set(target250)),
    "targetSymbols":target250,
    "metadataSymbolCount":len(metadata),
    "metadataSources":sources,
    "flaggedSymbols":flagged,
    "flaggedCount":len(flagged),
    "unknownSecurityTypeSymbols":unknown,
    "unknownSecurityTypeCount":len(unknown),
    "requiredMetrics":required_metrics,
    "presentMetrics":present_metrics,
    "missingMetrics":missing_metrics,
    "validationErrors":errors,
    "armAllowed":ok,
    "executionAuthorized":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "nextAction":(
        "REQUEST_EXPLICIT_250_SYMBOL_CANARY_EXECUTION_APPROVAL"
        if ok
        else "BUILD_SECURITY_MASTER_FILTER_AND_FULL_CAPACITY_INSTRUMENTATION"
    ),
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7F 250-SYMBOL PRE-ARM AUDIT ===" -ForegroundColor Green
Write-Host "Read-only. No arm, no execution, no restart." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"

if($LASTEXITCODE-ne 0){
  throw "Upload failed"
}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote audit failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.7F 250-SYMBOL SECURITY AND INSTRUMENTATION AUDIT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "TARGET_COUNT=$($r.targetCount)",
 "UNIQUE_TARGET_COUNT=$($r.uniqueTargetCount)",
 "METADATA_SYMBOL_COUNT=$($r.metadataSymbolCount)",
 "FLAGGED_COUNT=$($r.flaggedCount)",
 "FLAGGED_SYMBOLS=$(@($r.flaggedSymbols | ForEach-Object {$_.symbol})-join ',')",
 "UNKNOWN_SECURITY_TYPE_COUNT=$($r.unknownSecurityTypeCount)",
 "MISSING_METRICS=$(@($r.missingMetrics)-join ',')",
 "ARM_ALLOWED=$($r.armAllowed)",
 "EXECUTION_AUTHORIZED=False",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7F 250-Symbol Pre-Arm Audit

- OK: $($r.ok)
- Classification: $($r.classification)
- Target count: $($r.targetCount)
- Unique target count: $($r.uniqueTargetCount)
- Flagged symbols: $(@($r.flaggedSymbols | ForEach-Object {$_.symbol})-join ', ')
- Unknown security types: $($r.unknownSecurityTypeCount)
- Missing metrics: $(@($r.missingMetrics)-join ', ')
- Arm allowed: $($r.armAllowed)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7F PRE-ARM AUDIT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Target / unique: $($r.targetCount) / $($r.uniqueTargetCount)"
Write-Host "Metadata symbols: $($r.metadataSymbolCount)"
Write-Host "Flagged count: $($r.flaggedCount)"
Write-Host "Flagged symbols: $(@($r.flaggedSymbols | ForEach-Object {$_.symbol})-join ', ')"
Write-Host "Unknown security types: $($r.unknownSecurityTypeCount)"
Write-Host "Missing metrics: $(@($r.missingMetrics)-join ', ')"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
