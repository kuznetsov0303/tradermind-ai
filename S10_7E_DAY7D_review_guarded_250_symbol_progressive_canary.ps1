param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$PackageDir=Join-Path $ProjectRoot "PROJECT_STATE\guarded_250_symbol_progressive_canary_package_v1"
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$manifestFile=Join-Path $PackageDir "manifest.json"
$executionFile=Join-Path $PackageDir "execute_250_symbol_progressive_canary.sh"
$rollbackFile=Join-Path $PackageDir "rollback_to_core25.sh"

foreach($path in @($manifestFile,$executionFile,$rollbackFile)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Missing package file: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7E_250_SYMBOL_PROGRESSIVE_REVIEW_raw_$stamp.json"
$report=Join-Path $Audit "S10_7E_250_SYMBOL_PROGRESSIVE_REVIEW_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7E_250_SYMBOL_PROGRESSIVE_REVIEW_$stamp.md"

$manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$execution=Get-Content -LiteralPath $executionFile -Raw
$rollback=Get-Content -LiteralPath $rollbackFile -Raw

$localChecks=[ordered]@{
  manifestExecutionAuthorized=[bool]$manifest.executionAuthorized
  manifestPackageExecuted=[bool]$manifest.packageExecuted
  currentVerifiedCapacity=[int]$manifest.currentVerifiedCapacity
  targetCapacity=[int]$manifest.targetCapacity
  rampStages=(@($manifest.rampStages)-join ",")
  rampStagesExact=((@($manifest.rampStages)-join ",") -eq "50,100,150,250")
  stageMicroSoakMinutes=[int]$manifest.stageMicroSoakMinutes
  finalSoakMinutes=[int]$manifest.finalSoakMinutes
  rollbackTarget=[string]$manifest.rollbackTarget
  executionContainsOnlyMarketStreamService=(
    $execution -match 'skilledge-market-stream.service'
    -and $execution -notmatch 'skilledge-stock-engine-api.service'
  )
  executionContainsApiMutation=($execution -match 'skilledge-stock-engine-api')
  executionContainsPaperMutation=($execution -match '(?i)paper')
  executionContainsTelegramMutation=($execution -match '(?i)telegram')
  executionContainsRampStages=(
    $execution -match 'for CAP in 50 100 150 250'
  )
  executionContainsFiveMinuteMicroSoak=(
    $execution -match 'seq 1 5'
    -and $execution -match 'sleep 60'
  )
  executionContainsThirtyMinuteFinalSoak=(
    $execution -match 'seq 1 30'
  )
  executionContainsAutomaticRollback=(
    $execution -match 'ROLLBACK_STARTED'
    -and $execution -match 'skilledge-market-stream.service.before'
  )
  rollbackContainsCore25Restore=(
    $rollback -match 'skilledge-market-stream.service.before'
  )
}

$localErrors=@()

if($localChecks.manifestExecutionAuthorized){$localErrors+="MANIFEST_ALREADY_AUTHORIZED"}
if($localChecks.manifestPackageExecuted){$localErrors+="MANIFEST_ALREADY_EXECUTED"}
if($localChecks.currentVerifiedCapacity -ne 25){$localErrors+="CURRENT_VERIFIED_CAPACITY_NOT_25"}
if($localChecks.targetCapacity -ne 250){$localErrors+="TARGET_CAPACITY_NOT_250"}
if(-not $localChecks.rampStagesExact){$localErrors+="RAMP_STAGES_MISMATCH"}
if($localChecks.stageMicroSoakMinutes -ne 5){$localErrors+="MICRO_SOAK_NOT_5"}
if($localChecks.finalSoakMinutes -ne 30){$localErrors+="FINAL_SOAK_NOT_30"}
if($localChecks.rollbackTarget -ne "Core25"){$localErrors+="ROLLBACK_TARGET_NOT_CORE25"}
if(-not $localChecks.executionContainsOnlyMarketStreamService){$localErrors+="MARKET_STREAM_SCOPE_INVALID"}
if($localChecks.executionContainsApiMutation){$localErrors+="API_MUTATION_FORBIDDEN"}
if($localChecks.executionContainsPaperMutation){$localErrors+="PAPER_MUTATION_FORBIDDEN"}
if($localChecks.executionContainsTelegramMutation){$localErrors+="TELEGRAM_MUTATION_FORBIDDEN"}
if(-not $localChecks.executionContainsRampStages){$localErrors+="RAMP_EXECUTION_MISSING"}
if(-not $localChecks.executionContainsFiveMinuteMicroSoak){$localErrors+="MICRO_SOAK_MISSING"}
if(-not $localChecks.executionContainsThirtyMinuteFinalSoak){$localErrors+="FINAL_SOAK_MISSING"}
if(-not $localChecks.executionContainsAutomaticRollback){$localErrors+="AUTOMATIC_ROLLBACK_MISSING"}
if(-not $localChecks.rollbackContainsCore25Restore){$localErrors+="ROLLBACK_SCRIPT_INVALID"}

$localSh=Join-Path $env:TEMP "s10_7e_250_symbol_review_$stamp.sh"
$remoteSh="/tmp/s10_7e_250_symbol_review_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
SERVICE="skilledge-market-stream.service"
UNIT="/etc/systemd/system/skilledge-market-stream.service"

cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import subprocess
import urllib.request
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")
UNIT=Path("/etc/systemd/system/skilledge-market-stream.service")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

def norm(v):
    return str(v or "").strip().upper()

def valid_symbol(symbol):
    return bool(
        symbol
        and symbol.isalnum()
        and len(symbol)<=5
        and not symbol.endswith(("WS","WT"))
    )

def collect_rows(payload):
    if isinstance(payload,list):
        return payload
    if not isinstance(payload,dict):
        return []
    for key in ("watchlist","items","rows","data","candidates","symbols"):
        value=payload.get(key)
        if isinstance(value,list):
            return value
    return []

service=subprocess.run(
    [
        "systemctl","show",SERVICE,
        "--property=ActiveState,SubState,MainPID,NRestarts,Result"
    ],
    capture_output=True,text=True,check=False,
).stdout.strip()

market=json.loads(
    (ENGINE/"data/market_state_snapshot.json").read_text(encoding="utf-8")
)
candle=json.loads(
    (ENGINE/"data/candle_indicator_snapshot.json").read_text(encoding="utf-8")
)

ms=market.get("symbols") or {}
cs=candle.get("symbols") or {}

negative=[]
for symbol,row in cs.items():
    age=row.get("lastTradeAgeSeconds")
    if isinstance(age,(int,float)) and age<0:
        negative.append(symbol)

candidates=[]
seen=set(CORE25)
sources=[]

try:
    with urllib.request.urlopen(
        "http://127.0.0.1:8000/engine/watchlist",
        timeout=20,
    ) as response:
        payload=json.loads(response.read().decode("utf-8"))

    before=len(candidates)

    for row in collect_rows(payload):
        symbol=norm(
            row if isinstance(row,str)
            else row.get("symbol") or row.get("ticker")
        )

        if valid_symbol(symbol) and symbol not in seen:
            seen.add(symbol)
            candidates.append(symbol)

    sources.append({
        "source":"engine_watchlist",
        "added":len(candidates)-before,
    })
except Exception as exc:
    sources.append({
        "source":"engine_watchlist",
        "added":0,
        "error":str(exc),
    })

universe_files=[]

for path in sorted((ENGINE/"data").rglob("*.json")):
    lower=str(path).lower()

    if "universe" not in lower:
        continue

    try:
        payload=json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue

    rows=collect_rows(payload)

    if not rows:
        continue

    before=len(candidates)

    for row in rows:
        symbol=norm(
            row if isinstance(row,str)
            else row.get("symbol") or row.get("ticker")
        )

        if valid_symbol(symbol) and symbol not in seen:
            seen.add(symbol)
            candidates.append(symbol)

    added=len(candidates)-before

    universe_files.append({
        "path":str(path),
        "rows":len(rows),
        "added":added,
    })

all_symbols=CORE25+candidates

stages={}

for capacity in (50,100,150,250):
    subset=all_symbols[:capacity]

    stages[str(capacity)]={
        "count":len(subset),
        "uniqueCount":len(set(subset)),
        "core25Preserved":subset[:25]==CORE25,
        "symbols":subset,
    }

checks={
    "serviceHealthy":(
        "ActiveState=active" in service
        and "SubState=running" in service
        and "NRestarts=0" in service
        and "Result=success" in service
    ),
    "currentUnitCore25Exact":(
        "Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS="
        + ",".join(CORE25)
    ) in UNIT.read_text(encoding="utf-8"),
    "marketCount":len(ms),
    "candleCount":len(cs),
    "snapshotSetsMatch":set(ms)==set(cs),
    "snapshotExactCore25":set(ms)==set(CORE25),
    "negativeAgeSymbols":negative,
    "candidateCountExcludingCore25":len(candidates),
    "totalResolvedCount":len(all_symbols),
    "enoughFor250":len(all_symbols)>=250,
    "stages":stages,
    "sources":sources,
    "universeFiles":universe_files,
}

errors=[]

if not checks["serviceHealthy"]:
    errors.append("SERVICE_UNHEALTHY")

if not checks["currentUnitCore25Exact"]:
    errors.append("CURRENT_UNIT_NOT_CORE25")

if checks["marketCount"]!=25:
    errors.append("MARKET_COUNT_NOT_25")

if checks["candleCount"]!=25:
    errors.append("CANDLE_COUNT_NOT_25")

if not checks["snapshotSetsMatch"]:
    errors.append("SNAPSHOT_SET_MISMATCH")

if not checks["snapshotExactCore25"]:
    errors.append("SNAPSHOT_NOT_EXACT_CORE25")

if checks["negativeAgeSymbols"]:
    errors.append("NEGATIVE_LAST_TRADE_AGE")

if not checks["enoughFor250"]:
    errors.append("INSUFFICIENT_VALID_SYMBOLS_FOR_250")

for capacity in ("50","100","150","250"):
    stage=checks["stages"][capacity]

    if stage["count"]!=int(capacity):
        errors.append(f"STAGE_{capacity}_COUNT_INVALID")

    if stage["uniqueCount"]!=int(capacity):
        errors.append(f"STAGE_{capacity}_DUPLICATES")

    if not stage["core25Preserved"]:
        errors.append(f"STAGE_{capacity}_CORE25_NOT_PRESERVED")

print(json.dumps({
    "ok":not errors,
    "classification":(
        "DAY7D_250_SYMBOL_PROGRESSIVE_RUNTIME_REVIEW_PASSED"
        if not errors
        else "DAY7D_250_SYMBOL_PROGRESSIVE_RUNTIME_REVIEW_BLOCKED"
    ),
    "checks":checks,
    "errors":errors,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "nextAction":(
        "REQUEST_EXPLICIT_250_SYMBOL_CANARY_EXECUTION_APPROVAL"
        if not errors
        else "RESOLVE_250_SYMBOL_CANARY_BLOCKERS"
    ),
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText(
  $localSh,
  $bash,
  [Text.UTF8Encoding]::new($false)
)

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7E 250-SYMBOL PROGRESSIVE REVIEW ===" -ForegroundColor Green
Write-Host "Read-only. No arm, no execution, no restart." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"

if($LASTEXITCODE-ne 0){
  throw "Upload failed"
}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote review failed before structured result"
}

$remoteText=$out -join "`n"
$remote=$remoteText|ConvertFrom-Json

$allErrors=@($localErrors)+@($remote.errors)
$ok=($allErrors.Count -eq 0)

$result=[ordered]@{
  ok=$ok
  classification=if($ok){
    "DAY7D_GUARDED_250_SYMBOL_PROGRESSIVE_CANARY_REVIEW_PASSED"
  }else{
    "DAY7D_GUARDED_250_SYMBOL_PROGRESSIVE_CANARY_REVIEW_BLOCKED"
  }
  localPackageChecks=$localChecks
  remoteRuntimeChecks=$remote.checks
  validationErrors=$allErrors
  armAllowed=$ok
  executionAuthorized=$false
  packageExecuted=$false
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  nextAction=if($ok){
    "REQUEST_EXPLICIT_250_SYMBOL_CANARY_EXECUTION_APPROVAL"
  }else{
    "RESOLVE_250_SYMBOL_CANARY_BLOCKERS"
  }
}

$result|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7E 250-SYMBOL PROGRESSIVE CANARY REVIEW",
 "Generated=$stamp",
 "OK=$ok",
 "CLASSIFICATION=$($result.classification)",
 "ARM_ALLOWED=$($result.armAllowed)",
 "EXECUTION_AUTHORIZED=False",
 "PACKAGE_EXECUTED=False",
 "CURRENT_VERIFIED_CAPACITY=$($localChecks.currentVerifiedCapacity)",
 "TARGET_CAPACITY=$($localChecks.targetCapacity)",
 "RAMP_STAGES=$($localChecks.rampStages)",
 "MICRO_SOAK_MINUTES=$($localChecks.stageMicroSoakMinutes)",
 "FINAL_SOAK_MINUTES=$($localChecks.finalSoakMinutes)",
 "SERVICE_HEALTHY=$($remote.checks.serviceHealthy)",
 "CURRENT_UNIT_CORE25_EXACT=$($remote.checks.currentUnitCore25Exact)",
 "MARKET_COUNT=$($remote.checks.marketCount)",
 "CANDLE_COUNT=$($remote.checks.candleCount)",
 "SNAPSHOT_SETS_MATCH=$($remote.checks.snapshotSetsMatch)",
 "NEGATIVE_AGE_COUNT=$(@($remote.checks.negativeAgeSymbols).Count)",
 "TOTAL_RESOLVED_COUNT=$($remote.checks.totalResolvedCount)",
 "ENOUGH_FOR_250=$($remote.checks.enoughFor250)",
 "STAGE_50_COUNT=$($remote.checks.stages.'50'.count)",
 "STAGE_100_COUNT=$($remote.checks.stages.'100'.count)",
 "STAGE_150_COUNT=$($remote.checks.stages.'150'.count)",
 "STAGE_250_COUNT=$($remote.checks.stages.'250'.count)",
 "VALIDATION_ERRORS=$($allErrors-join ',')",
 "NEXT_ACTION=$($result.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7E 250-Symbol Progressive Canary Review

- OK: $ok
- Classification: $($result.classification)
- Arm allowed: $($result.armAllowed)
- Execution authorized: False
- Package executed: False
- Target capacity: $($localChecks.targetCapacity)
- Ramp: $($localChecks.rampStages)
- Total resolved symbols: $($remote.checks.totalResolvedCount)
- Enough for 250: $($remote.checks.enoughFor250)
- Stage counts: $($remote.checks.stages.'50'.count), $($remote.checks.stages.'100'.count), $($remote.checks.stages.'150'.count), $($remote.checks.stages.'250'.count)
- Validation errors: $($allErrors-join ', ')
- Next action: $($result.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7E 250-SYMBOL REVIEW COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Classification: $($result.classification)"
Write-Host "Arm allowed: $($result.armAllowed)"
Write-Host "Execution authorized: False"
Write-Host "Package executed: False"
Write-Host "Target capacity: $($localChecks.targetCapacity)"
Write-Host "Ramp stages: $($localChecks.rampStages)"
Write-Host "Micro-soak / final soak: $($localChecks.stageMicroSoakMinutes) / $($localChecks.finalSoakMinutes) minutes"
Write-Host "Service healthy: $($remote.checks.serviceHealthy)"
Write-Host "Current unit Core25 exact: $($remote.checks.currentUnitCore25Exact)"
Write-Host "Market / candle counts: $($remote.checks.marketCount) / $($remote.checks.candleCount)"
Write-Host "Negative age count: $(@($remote.checks.negativeAgeSymbols).Count)"
Write-Host "Total resolved symbols: $($remote.checks.totalResolvedCount)"
Write-Host "Enough for 250: $($remote.checks.enoughFor250)"
Write-Host "Stage counts: $($remote.checks.stages.'50'.count) / $($remote.checks.stages.'100'.count) / $($remote.checks.stages.'150'.count) / $($remote.checks.stages.'250'.count)"
Write-Host "Validation errors: $($allErrors-join ', ')"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $ok){
  throw "250-symbol progressive canary review blocked"
}
