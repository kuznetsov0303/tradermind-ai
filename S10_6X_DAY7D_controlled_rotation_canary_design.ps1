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
$raw=Join-Path $Audit "S10_6X_DAY7D_CONTROLLED_ROTATION_CANARY_DESIGN_raw_$stamp.json"
$report=Join-Path $Audit "S10_6X_DAY7D_CONTROLLED_ROTATION_CANARY_DESIGN_report_$stamp.txt"
$designFile=Join-Path $State "controlled_2_symbol_rotation_canary_design_v1.json"
$localSh=Join-Path $env:TEMP "s10_6x_rotation_canary_design_$stamp.sh"
$remoteSh="/tmp/s10_6x_rotation_canary_design_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")

CURRENT=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

ADD=["SDOT","SLND"]
REMOVE=["RIVN","SOFI"]
NEXT=[s for s in CURRENT if s not in REMOVE]+ADD

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def service_show():
    p=subprocess.run(
        [
            "systemctl","show","skilledge-market-stream.service",
            "--property=ActiveState,SubState,MainPID,NRestarts,Result"
        ],
        capture_output=True,text=True,check=False,
    )
    return p.stdout.strip()

def file_sha(path:Path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

stream_file=ENGINE/"app/market_data/stream_service.py"
snapshot_file=ENGINE/"data/candle_indicator_snapshot.json"
market_file=ENGINE/"data/market_state_snapshot.json"

design={
    "schemaVersion":1,
    "name":"skilledge_controlled_2_symbol_rotation_canary_design",
    "createdAt":now_iso(),
    "mode":"design_only",
    "productionEnabled":False,
    "currentSymbols":CURRENT,
    "proposedAdditions":ADD,
    "proposedRemovals":REMOVE,
    "proposedNextSymbols":NEXT,
    "capacity":25,
    "protectedCoreSymbols":CURRENT[:21],
    "changeBudget":{
        "maxAdds":2,
        "maxRemoves":2,
        "actualAdds":len(ADD),
        "actualRemoves":len(REMOVE),
    },
    "preflight":{
        "required":[
            "market stream active/running",
            "NRestarts equals 0",
            "market and candle snapshots both contain 25 symbols",
            "snapshot symbol sets match",
            "negative lastTradeAge count equals 0",
            "current configured symbols exactly match Core25",
            "rollback snapshot created before any mutation",
            "new symbols resolve successfully before restart",
        ],
    },
    "executionDesign":{
        "mutationAllowedNow":False,
        "plannedFutureSteps":[
            "create timestamped rollback copy of market-stream systemd unit",
            "create timestamped rollback copy of current snapshots",
            "validate SDOT and SLND symbol resolution",
            "replace only SKILLEDGE_MARKET_STREAM_SYMBOLS value",
            "systemctl daemon-reload",
            "restart only skilledge-market-stream.service",
            "wait for 25-symbol hydration",
            "verify exact expected 25-symbol set",
            "run 30-minute soak",
            "rollback immediately on any abort condition",
        ],
        "servicesAllowedToRestart":[
            "skilledge-market-stream.service"
        ],
        "servicesForbiddenToTouch":[
            "skilledge-stock-engine-api.service",
            "paper services/timers",
            "telegram services",
            "nightly research services",
        ],
    },
    "soakCriteria":{
        "durationMinutes":30,
        "required":[
            "service remains active/running",
            "NRestarts remains 0",
            "exact symbol count remains 25",
            "market and candle symbol sets remain equal",
            "SDOT and SLND receive live events",
            "RIVN and SOFI are absent after replacement",
            "lastTradeAgeSeconds never negative",
            "appliedTrades increases",
            "RSS remains within prior canary envelope",
            "no provider reconnect/error burst",
            "scanner remains research-only",
            "client/Telegram gates remain false",
        ],
    },
    "abortConditions":[
        "service not active/running",
        "NRestarts greater than 0",
        "symbol count not equal to 25",
        "snapshot symbol mismatch",
        "SDOT or SLND missing after hydration timeout",
        "negative lastTradeAgeSeconds",
        "appliedTrades does not grow",
        "provider reconnect/error burst",
        "unexpected API/paper/Telegram mutation",
    ],
    "rollbackDesign":{
        "automatic":True,
        "targetUniverse":CURRENT,
        "steps":[
            "restore previous systemd unit",
            "systemctl daemon-reload",
            "restart only skilledge-market-stream.service",
            "verify Core25 exact set",
            "verify 25-symbol market/candle hydration",
            "verify service active/running and NRestarts stable",
        ],
    },
    "evidenceRequiredAfterFutureCanary":[
        "before/after PID",
        "before/after service status",
        "before/after exact symbol sets",
        "before/after appliedTrades",
        "negative age count",
        "RSS and event throughput",
        "rollbackRequired flag",
        "rollbackExecuted flag",
        "all touched file SHA256 values",
    ],
    "gates":{
        "productionApplyAllowed":False,
        "serviceRestartAllowed":False,
        "systemdEditAllowed":False,
        "paperTradingAllowed":False,
        "clientReleaseAllowed":False,
        "telegramAllowed":False,
    },
    "observedRuntime":{
        "serviceShow":service_show(),
        "streamServiceSha256":file_sha(stream_file) if stream_file.exists() else None,
        "marketSnapshotExists":market_file.exists(),
        "candleSnapshotExists":snapshot_file.exists(),
    },
    "safety":{
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "subscriptionChanged":False,
        "paperTouched":False,
        "apiAppTouched":False,
        "strategyEngineTouched":False,
        "telegramTouched":False,
        "clientGatesTouched":False,
    },
}

errors=[]

if len(CURRENT)!=25 or len(set(CURRENT))!=25:
    errors.append("CURRENT_UNIVERSE_INVALID")
if len(NEXT)!=25 or len(set(NEXT))!=25:
    errors.append("NEXT_UNIVERSE_INVALID")
if len(ADD)!=2 or len(REMOVE)!=2:
    errors.append("CHANGE_BUDGET_NOT_2X2")
if any(s in NEXT for s in REMOVE):
    errors.append("REMOVAL_STILL_PRESENT")
if any(s not in NEXT for s in ADD):
    errors.append("ADDITION_NOT_PRESENT")
if not all(s in NEXT for s in CURRENT[:21]):
    errors.append("PROTECTED_CORE_VIOLATION")
if design["gates"]["productionApplyAllowed"]:
    errors.append("PRODUCTION_APPLY_MUST_BE_FALSE")
if design["gates"]["serviceRestartAllowed"]:
    errors.append("SERVICE_RESTART_MUST_BE_FALSE")
if design["gates"]["systemdEditAllowed"]:
    errors.append("SYSTEMD_EDIT_MUST_BE_FALSE")

ok=not errors

print(json.dumps({
    "ok":ok,
    "classification":(
        "DAY7D_CONTROLLED_2_SYMBOL_ROTATION_CANARY_DESIGN_VALIDATED"
        if ok else "DAY7D_ROTATION_CANARY_DESIGN_FAILED"
    ),
    "design":design,
    "validationErrors":errors,
    **design["safety"],
    "nextAction":"BUILD_GUARDED_CANARY_EXECUTION_PACKAGE",
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD CONTROLLED ROTATION CANARY DESIGN ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== VALIDATE DESIGN ONLY ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no systemd edit / no stream mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote canary design validation failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

if($r.design){
  $r.design|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $designFile -Encoding UTF8
}

@(
 "S10.6X DAY 7D CONTROLLED ROTATION CANARY DESIGN",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "CURRENT_COUNT=$(@($r.design.currentSymbols).Count)",
 "NEXT_COUNT=$(@($r.design.proposedNextSymbols).Count)",
 "ADDITIONS=$(@($r.design.proposedAdditions)-join ',')",
 "REMOVALS=$(@($r.design.proposedRemovals)-join ',')",
 "PROTECTED_CORE_COUNT=$(@($r.design.protectedCoreSymbols).Count)",
 "SOAK_MINUTES=$($r.design.soakCriteria.durationMinutes)",
 "PRODUCTION_APPLY_ALLOWED=$($r.design.gates.productionApplyAllowed)",
 "SERVICE_RESTART_ALLOWED=$($r.design.gates.serviceRestartAllowed)",
 "SYSTEMD_EDIT_ALLOWED=$($r.design.gates.systemdEditAllowed)",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "DESIGN_FILE=$designFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6X_DAY7D_CONTROLLED_ROTATION_CANARY_DESIGN_$stamp.md"
@"
# S10.6X Day 7D Controlled Rotation Canary Design

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Additions: $(@($r.design.proposedAdditions)-join ', ')
- Removals: $(@($r.design.proposedRemovals)-join ', ')
- Protected core: $(@($r.design.protectedCoreSymbols).Count)
- Soak: $($r.design.soakCriteria.durationMinutes) minutes
- Production apply allowed: $($r.design.gates.productionApplyAllowed)
- Service restart allowed now: $($r.design.gates.serviceRestartAllowed)
- Systemd edit allowed now: $($r.design.gates.systemdEditAllowed)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6X DAY 7D CANARY DESIGN COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Current count: $(@($r.design.currentSymbols).Count)"
Write-Host "Next count: $(@($r.design.proposedNextSymbols).Count)"
Write-Host "Additions: $(@($r.design.proposedAdditions)-join ', ')"
Write-Host "Removals: $(@($r.design.proposedRemovals)-join ', ')"
Write-Host "Protected core count: $(@($r.design.protectedCoreSymbols).Count)"
Write-Host "Soak minutes: $($r.design.soakCriteria.durationMinutes)"
Write-Host "Production apply allowed: $($r.design.gates.productionApplyAllowed)"
Write-Host "Service restart allowed: $($r.design.gates.serviceRestartAllowed)"
Write-Host "Systemd edit allowed: $($r.design.gates.systemdEditAllowed)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Design: $designFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Day 7D controlled rotation canary design failed"
}
