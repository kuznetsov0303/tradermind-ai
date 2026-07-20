param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$PackageDir=Join-Path $ProjectRoot "PROJECT_STATE\guarded_50_symbol_capacity_canary_package_v1"
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$manifestFile=Join-Path $PackageDir "manifest.json"
$executionFile=Join-Path $PackageDir "execute_50_symbol_capacity_canary.sh"
$rollbackFile=Join-Path $PackageDir "rollback_50_symbol_capacity_canary.sh"

foreach($path in @($manifestFile,$executionFile,$rollbackFile)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Missing package file: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7C_50_SYMBOL_CANARY_REVIEW_raw_$stamp.json"
$report=Join-Path $Audit "S10_7C_50_SYMBOL_CANARY_REVIEW_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7C_50_SYMBOL_CANARY_REVIEW_$stamp.md"

$manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$execution=Get-Content -LiteralPath $executionFile -Raw
$rollback=Get-Content -LiteralPath $rollbackFile -Raw

$localChecks=[ordered]@{
  manifestExecutionAuthorized=[bool]$manifest.executionAuthorized
  manifestPackageExecuted=[bool]$manifest.packageExecuted
  currentCapacity=[int]$manifest.currentCapacity
  targetCapacity=[int]$manifest.targetCapacity
  currentSymbolCount=@($manifest.currentSymbols).Count
  targetSymbolCount=@($manifest.targetSymbols).Count
  dynamicSymbolCount=@($manifest.dynamicSymbols).Count
  targetSymbolsUnique=(@($manifest.targetSymbols | Sort-Object -Unique).Count -eq 50)
  currentSymbolsPreserved=(
    @($manifest.currentSymbols | Where-Object { $_ -notin @($manifest.targetSymbols) }).Count -eq 0
  )
  executionContainsMarketStreamRestart=($execution -match 'systemctl restart "\$SERVICE"')
  executionContainsApiRestart=($execution -match 'skilledge-stock-engine-api')
  executionContainsPaperMutation=($execution -match '(?i)paper')
  executionContainsTelegramMutation=($execution -match '(?i)telegram')
  executionContains30MinuteSoak=(
    $execution -match 'seq 1 30' -and
    $execution -match 'sleep 60'
  )
  executionContains50SymbolCheck=($execution -match 'MARKET_COUNT_NOT_50')
  executionContainsRollbackOnFailure=(
    $execution -match 'skilledge-market-stream.service.before' -and
    $execution -match 'systemctl daemon-reload'
  )
  rollbackContainsMarketStreamRestart=($rollback -match 'systemctl restart "\$SERVICE"')
  rollbackContainsApiRestart=($rollback -match 'skilledge-stock-engine-api')
}

$localErrors=@()

if($localChecks.manifestExecutionAuthorized){$localErrors+="MANIFEST_ALREADY_AUTHORIZED"}
if($localChecks.manifestPackageExecuted){$localErrors+="MANIFEST_ALREADY_EXECUTED"}
if($localChecks.currentCapacity -ne 25){$localErrors+="CURRENT_CAPACITY_NOT_25"}
if($localChecks.targetCapacity -ne 50){$localErrors+="TARGET_CAPACITY_NOT_50"}
if($localChecks.currentSymbolCount -ne 25){$localErrors+="CURRENT_SYMBOL_COUNT_NOT_25"}
if($localChecks.targetSymbolCount -ne 50){$localErrors+="TARGET_SYMBOL_COUNT_NOT_50"}
if($localChecks.dynamicSymbolCount -ne 25){$localErrors+="DYNAMIC_SYMBOL_COUNT_NOT_25"}
if(-not $localChecks.targetSymbolsUnique){$localErrors+="TARGET_SYMBOLS_NOT_UNIQUE"}
if(-not $localChecks.currentSymbolsPreserved){$localErrors+="CORE25_NOT_PRESERVED"}
if(-not $localChecks.executionContainsMarketStreamRestart){$localErrors+="MARKET_STREAM_RESTART_MISSING"}
if($localChecks.executionContainsApiRestart){$localErrors+="API_RESTART_FORBIDDEN"}
if($localChecks.executionContainsPaperMutation){$localErrors+="PAPER_MUTATION_FORBIDDEN"}
if($localChecks.executionContainsTelegramMutation){$localErrors+="TELEGRAM_MUTATION_FORBIDDEN"}
if(-not $localChecks.executionContains30MinuteSoak){$localErrors+="SOAK_30_MINUTES_MISSING"}
if(-not $localChecks.executionContains50SymbolCheck){$localErrors+="50_SYMBOL_ASSERTION_MISSING"}
if(-not $localChecks.executionContainsRollbackOnFailure){$localErrors+="ROLLBACK_ON_FAILURE_MISSING"}
if(-not $localChecks.rollbackContainsMarketStreamRestart){$localErrors+="ROLLBACK_MARKET_STREAM_RESTART_MISSING"}
if($localChecks.rollbackContainsApiRestart){$localErrors+="ROLLBACK_API_RESTART_FORBIDDEN"}

$localSh=Join-Path $env:TEMP "s10_7c_50_symbol_review_$stamp.sh"
$remoteSh="/tmp/s10_7c_50_symbol_review_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
SERVICE="skilledge-market-stream.service"

cd "$ENGINE"

.venv/bin/python - <<'PY'
import json
import subprocess
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")
UNIT=Path("/etc/systemd/system/skilledge-market-stream.service")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

service=subprocess.run(
    [
        "systemctl","show","skilledge-market-stream.service",
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

unit_text=UNIT.read_text(encoding="utf-8")

expected_line=(
    "Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS="
    + ",".join(CORE25)
)

checks={
    "serviceHealthy":(
        "ActiveState=active" in service
        and "SubState=running" in service
        and "NRestarts=0" in service
        and "Result=success" in service
    ),
    "currentUnitCore25Exact":expected_line in unit_text,
    "marketCount":len(ms),
    "candleCount":len(cs),
    "snapshotSetsMatch":set(ms)==set(cs),
    "snapshotExactCore25":set(ms)==set(CORE25),
    "negativeAgeSymbols":negative,
    "mainPid":next(
        (
            line.split("=",1)[1]
            for line in service.splitlines()
            if line.startswith("MainPID=")
        ),
        None,
    ),
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

print(json.dumps({
    "ok":not errors,
    "classification":(
        "DAY7D_50_SYMBOL_CANARY_RUNTIME_REVIEW_PASSED"
        if not errors
        else "DAY7D_50_SYMBOL_CANARY_RUNTIME_REVIEW_BLOCKED"
    ),
    "checks":checks,
    "errors":errors,
    "serviceShow":service,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "nextAction":(
        "ARM_50_SYMBOL_CAPACITY_CANARY"
        if not errors
        else "RESOLVE_50_SYMBOL_CANARY_BLOCKERS"
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
Write-Host "=== S10.7C 50-SYMBOL CANARY REVIEW ===" -ForegroundColor Green
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
    "DAY7D_GUARDED_50_SYMBOL_CAPACITY_CANARY_REVIEW_PASSED"
  }else{
    "DAY7D_GUARDED_50_SYMBOL_CAPACITY_CANARY_REVIEW_BLOCKED"
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
    "REQUEST_EXPLICIT_50_SYMBOL_CANARY_EXECUTION_APPROVAL"
  }else{
    "RESOLVE_50_SYMBOL_CANARY_BLOCKERS"
  }
}

$result|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7C DAY 7D 50-SYMBOL CANARY REVIEW",
 "Generated=$stamp",
 "OK=$ok",
 "CLASSIFICATION=$($result.classification)",
 "ARM_ALLOWED=$($result.armAllowed)",
 "EXECUTION_AUTHORIZED=False",
 "PACKAGE_EXECUTED=False",
 "CURRENT_CAPACITY=$($localChecks.currentCapacity)",
 "TARGET_CAPACITY=$($localChecks.targetCapacity)",
 "CURRENT_SYMBOL_COUNT=$($localChecks.currentSymbolCount)",
 "TARGET_SYMBOL_COUNT=$($localChecks.targetSymbolCount)",
 "DYNAMIC_SYMBOL_COUNT=$($localChecks.dynamicSymbolCount)",
 "TARGET_SYMBOLS_UNIQUE=$($localChecks.targetSymbolsUnique)",
 "CORE25_PRESERVED=$($localChecks.currentSymbolsPreserved)",
 "SERVICE_HEALTHY=$($remote.checks.serviceHealthy)",
 "CURRENT_UNIT_CORE25_EXACT=$($remote.checks.currentUnitCore25Exact)",
 "MARKET_COUNT=$($remote.checks.marketCount)",
 "CANDLE_COUNT=$($remote.checks.candleCount)",
 "SNAPSHOT_SETS_MATCH=$($remote.checks.snapshotSetsMatch)",
 "SNAPSHOT_EXACT_CORE25=$($remote.checks.snapshotExactCore25)",
 "NEGATIVE_AGE_COUNT=$(@($remote.checks.negativeAgeSymbols).Count)",
 "VALIDATION_ERRORS=$($allErrors-join ',')",
 "NEXT_ACTION=$($result.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7C Day 7D 50-Symbol Canary Review

- OK: $ok
- Classification: $($result.classification)
- Arm allowed: $($result.armAllowed)
- Execution authorized: False
- Package executed: False
- Current/target capacity: $($localChecks.currentCapacity) / $($localChecks.targetCapacity)
- Target symbol count: $($localChecks.targetSymbolCount)
- Dynamic symbol count: $($localChecks.dynamicSymbolCount)
- Core25 preserved: $($localChecks.currentSymbolsPreserved)
- Service healthy: $($remote.checks.serviceHealthy)
- Snapshot exact Core25: $($remote.checks.snapshotExactCore25)
- Negative age count: $(@($remote.checks.negativeAgeSymbols).Count)
- Validation errors: $($allErrors-join ', ')
- Next action: $($result.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7C 50-SYMBOL REVIEW COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Classification: $($result.classification)"
Write-Host "Arm allowed: $($result.armAllowed)"
Write-Host "Execution authorized: False"
Write-Host "Package executed: False"
Write-Host "Current / target capacity: $($localChecks.currentCapacity) / $($localChecks.targetCapacity)"
Write-Host "Current / target symbol count: $($localChecks.currentSymbolCount) / $($localChecks.targetSymbolCount)"
Write-Host "Dynamic symbol count: $($localChecks.dynamicSymbolCount)"
Write-Host "Target symbols unique: $($localChecks.targetSymbolsUnique)"
Write-Host "Core25 preserved: $($localChecks.currentSymbolsPreserved)"
Write-Host "Service healthy: $($remote.checks.serviceHealthy)"
Write-Host "Current unit Core25 exact: $($remote.checks.currentUnitCore25Exact)"
Write-Host "Market / candle counts: $($remote.checks.marketCount) / $($remote.checks.candleCount)"
Write-Host "Snapshot sets match: $($remote.checks.snapshotSetsMatch)"
Write-Host "Negative age count: $(@($remote.checks.negativeAgeSymbols).Count)"
Write-Host "Validation errors: $($allErrors-join ', ')"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $ok){
  throw "50-symbol canary review blocked"
}
