param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$PackageDir=Join-Path $ProjectRoot "PROJECT_STATE\guarded_rotation_canary_package_v1"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"
New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$manifestFile=Join-Path $PackageDir "manifest.json"
$executionFile=Join-Path $PackageDir "execute_guarded_canary.sh"
$rollbackFile=Join-Path $PackageDir "rollback_guarded_canary.sh"

foreach($path in @($manifestFile,$executionFile,$rollbackFile)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Missing package file: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6Z_DAY7D_CANARY_REVIEW_raw_$stamp.json"
$report=Join-Path $Audit "S10_6Z_DAY7D_CANARY_REVIEW_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6z_canary_review_$stamp.sh"
$remoteSh="/tmp/s10_6z_canary_review_$stamp.sh"

$manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$execution=Get-Content -LiteralPath $executionFile -Raw
$rollback=Get-Content -LiteralPath $rollbackFile -Raw

$localChecks=[ordered]@{
  manifestExecutionAuthorized = [bool]$manifest.executionAuthorized
  manifestPackageExecuted = [bool]$manifest.packageExecuted
  additionsExact = (@($manifest.additions) -join ",") -eq "SDOT,SLND"
  removalsExact = (@($manifest.removals) -join ",") -eq "RIVN,SOFI"
  protectedCoreCount = [int]$manifest.protectedCoreCount
  soakMinutes = [int]$manifest.soakMinutes
  executionContainsMarketStreamRestart = $execution -match 'systemctl restart "\$SERVICE"'
  executionContainsApiRestart = $execution -match 'skilledge-stock-engine-api'
  executionContainsPaperMutation = $execution -match '(?i)paper'
  executionContainsTelegramMutation = $execution -match '(?i)telegram'
  executionContainsExactCurrentUniverse = $execution -match 'RIVN,SOFI,CRWD,NOW'
  executionContainsExactNextUniverse = $execution -match 'CRWD,NOW,SDOT,SLND'
  rollbackContainsMarketStreamRestart = $rollback -match 'systemctl restart "\$SERVICE"'
  rollbackContainsApiRestart = $rollback -match 'skilledge-stock-engine-api'
}

$localErrors=@()
if($localChecks.manifestExecutionAuthorized){$localErrors+="MANIFEST_ALREADY_AUTHORIZED"}
if($localChecks.manifestPackageExecuted){$localErrors+="MANIFEST_ALREADY_EXECUTED"}
if(-not $localChecks.additionsExact){$localErrors+="ADDITIONS_MISMATCH"}
if(-not $localChecks.removalsExact){$localErrors+="REMOVALS_MISMATCH"}
if($localChecks.protectedCoreCount -ne 21){$localErrors+="PROTECTED_CORE_COUNT_MISMATCH"}
if($localChecks.soakMinutes -ne 30){$localErrors+="SOAK_MINUTES_MISMATCH"}
if(-not $localChecks.executionContainsMarketStreamRestart){$localErrors+="MARKET_STREAM_RESTART_MISSING"}
if($localChecks.executionContainsApiRestart){$localErrors+="API_RESTART_FORBIDDEN"}
if($localChecks.executionContainsPaperMutation){$localErrors+="PAPER_MUTATION_FORBIDDEN"}
if($localChecks.executionContainsTelegramMutation){$localErrors+="TELEGRAM_MUTATION_FORBIDDEN"}
if(-not $localChecks.executionContainsExactCurrentUniverse){$localErrors+="CURRENT_UNIVERSE_NOT_EMBEDDED"}
if(-not $localChecks.executionContainsExactNextUniverse){$localErrors+="NEXT_UNIVERSE_NOT_EMBEDDED"}
if(-not $localChecks.rollbackContainsMarketStreamRestart){$localErrors+="ROLLBACK_MARKET_STREAM_RESTART_MISSING"}
if($localChecks.rollbackContainsApiRestart){$localErrors+="ROLLBACK_API_RESTART_FORBIDDEN"}

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
SERVICE="skilledge-market-stream.service"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
CORE25="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"

cd "$ENGINE"

.venv/bin/python - <<'PY'
import json
import sqlite3
import subprocess
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")
UNIT=Path("/etc/systemd/system/skilledge-market-stream.service")

core25="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"
unit_text=UNIT.read_text()

service=subprocess.run(
    ["systemctl","show","skilledge-market-stream.service",
     "--property=ActiveState,SubState,MainPID,NRestarts,Result"],
    capture_output=True,text=True,check=False
).stdout.strip()

market=json.loads((ENGINE/"data/market_state_snapshot.json").read_text())
candle=json.loads((ENGINE/"data/candle_indicator_snapshot.json").read_text())

ms=market.get("symbols") or {}
cs=candle.get("symbols") or {}

negative=[]
for symbol,row in cs.items():
    age=row.get("lastTradeAgeSeconds")
    if isinstance(age,(int,float)) and age<0:
        negative.append(symbol)

paper_open=[]
db_candidates=[
    ENGINE/"data/stock_engine.sqlite3",
    ENGINE/"data/stock_engine.db",
    ENGINE/"data/engine.sqlite3",
]
for db in db_candidates:
    if not db.exists():
        continue
    try:
        con=sqlite3.connect(str(db))
        con.row_factory=sqlite3.Row
        tables={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
        for table in tables:
            cols={r[1] for r in con.execute(f"pragma table_info({table})")}
            if "symbol" not in cols:
                continue
            status_col=next((c for c in ("status","state","trade_status") if c in cols),None)
            if not status_col:
                continue
            q=f"select symbol,{status_col} as status from {table} where upper(symbol) in ('RIVN','SOFI')"
            for row in con.execute(q):
                status=str(row["status"] or "").upper()
                if status in {"OPEN","ACTIVE","ARMED","PENDING","LIVE"}:
                    paper_open.append({"db":str(db),"table":table,"symbol":row["symbol"],"status":status})
        con.close()
    except Exception:
        pass

checks={
    "serviceHealthy":(
        "ActiveState=active" in service
        and "SubState=running" in service
        and "NRestarts=0" in service
        and "Result=success" in service
    ),
    "currentUnitCore25Exact":(
        f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={core25}" in unit_text
    ),
    "marketCount":len(ms),
    "candleCount":len(cs),
    "snapshotSetsMatch":set(ms)==set(cs),
    "snapshotExactCore25":set(ms)==set(core25.split(",")),
    "negativeAgeSymbols":negative,
    "openPaperRowsForRivnSofi":paper_open,
}

errors=[]
if not checks["serviceHealthy"]: errors.append("SERVICE_UNHEALTHY")
if not checks["currentUnitCore25Exact"]: errors.append("CURRENT_UNIT_NOT_CORE25")
if checks["marketCount"]!=25: errors.append("MARKET_COUNT_NOT_25")
if checks["candleCount"]!=25: errors.append("CANDLE_COUNT_NOT_25")
if not checks["snapshotSetsMatch"]: errors.append("SNAPSHOT_SET_MISMATCH")
if not checks["snapshotExactCore25"]: errors.append("SNAPSHOT_NOT_EXACT_CORE25")
if checks["negativeAgeSymbols"]: errors.append("NEGATIVE_LAST_TRADE_AGE")
if checks["openPaperRowsForRivnSofi"]: errors.append("OPEN_PAPER_POSITION_ON_REMOVAL_SYMBOL")

print(json.dumps({
    "ok":not errors,
    "classification":"DAY7D_CANARY_RUNTIME_REVIEW_PASSED" if not errors else "DAY7D_CANARY_RUNTIME_REVIEW_BLOCKED",
    "checks":checks,
    "errors":errors,
    "serviceShow":service,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "nextAction":"ARM_CONTROLLED_CANARY" if not errors else "RESOLVE_CANARY_BLOCKERS",
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== DAY 7D CANARY REVIEW ===" -ForegroundColor Green
Write-Host "Read-only. No arm, no execution, no restart." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){throw "Remote review failed before structured result"}

$remoteText=$out -join "`n"
$remote=$remoteText|ConvertFrom-Json

$allErrors=@($localErrors)+@($remote.errors)
$ok=($allErrors.Count -eq 0)

$result=[ordered]@{
  ok=$ok
  classification=if($ok){"DAY7D_GUARDED_CANARY_REVIEW_PASSED"}else{"DAY7D_GUARDED_CANARY_REVIEW_BLOCKED"}
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
  nextAction=if($ok){"REQUEST_EXPLICIT_CANARY_EXECUTION_APPROVAL"}else{"RESOLVE_CANARY_BLOCKERS"}
}

$result|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.6Z DAY 7D GUARDED CANARY REVIEW",
 "Generated=$stamp",
 "OK=$ok",
 "CLASSIFICATION=$($result.classification)",
 "ARM_ALLOWED=$($result.armAllowed)",
 "EXECUTION_AUTHORIZED=False",
 "PACKAGE_EXECUTED=False",
 "SERVICE_HEALTHY=$($remote.checks.serviceHealthy)",
 "CURRENT_UNIT_CORE25_EXACT=$($remote.checks.currentUnitCore25Exact)",
 "MARKET_COUNT=$($remote.checks.marketCount)",
 "CANDLE_COUNT=$($remote.checks.candleCount)",
 "SNAPSHOT_SETS_MATCH=$($remote.checks.snapshotSetsMatch)",
 "SNAPSHOT_EXACT_CORE25=$($remote.checks.snapshotExactCore25)",
 "NEGATIVE_AGE_COUNT=$(@($remote.checks.negativeAgeSymbols).Count)",
 "OPEN_PAPER_ROWS_RIVN_SOFI=$(@($remote.checks.openPaperRowsForRivnSofi).Count)",
 "VALIDATION_ERRORS=$($allErrors-join ',')",
 "NEXT_ACTION=$($result.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6Z_DAY7D_GUARDED_CANARY_REVIEW_$stamp.md"
@"
# S10.6Z Day 7D Guarded Canary Review

- OK: $ok
- Classification: $($result.classification)
- Arm allowed: $($result.armAllowed)
- Execution authorized: False
- Package executed: False
- Service healthy: $($remote.checks.serviceHealthy)
- Current unit Core25 exact: $($remote.checks.currentUnitCore25Exact)
- Snapshot exact Core25: $($remote.checks.snapshotExactCore25)
- Negative age count: $(@($remote.checks.negativeAgeSymbols).Count)
- Open paper rows for RIVN/SOFI: $(@($remote.checks.openPaperRowsForRivnSofi).Count)
- Validation errors: $($allErrors-join ', ')
- Next action: $($result.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6Z CANARY REVIEW COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Classification: $($result.classification)"
Write-Host "Arm allowed: $($result.armAllowed)"
Write-Host "Execution authorized: False"
Write-Host "Package executed: False"
Write-Host "Service healthy: $($remote.checks.serviceHealthy)"
Write-Host "Current unit Core25 exact: $($remote.checks.currentUnitCore25Exact)"
Write-Host "Market/candle counts: $($remote.checks.marketCount) / $($remote.checks.candleCount)"
Write-Host "Snapshot exact Core25: $($remote.checks.snapshotExactCore25)"
Write-Host "Negative age count: $(@($remote.checks.negativeAgeSymbols).Count)"
Write-Host "Open paper rows RIVN/SOFI: $(@($remote.checks.openPaperRowsForRivnSofi).Count)"
Write-Host "Validation errors: $($allErrors-join ', ')"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $ok){throw "Guarded canary review blocked"}
