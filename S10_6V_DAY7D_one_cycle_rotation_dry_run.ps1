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
$raw=Join-Path $Audit "S10_6V_DAY7D_ONE_CYCLE_DRY_RUN_raw_$stamp.json"
$report=Join-Path $Audit "S10_6V_DAY7D_ONE_CYCLE_DRY_RUN_report_$stamp.txt"
$planFile=Join-Path $State "dynamic_universe_one_cycle_dry_run_v1.json"
$localSh=Join-Path $env:TEMP "s10_6v_one_cycle_dry_run_$stamp.sh"
$remoteSh="/tmp/s10_6v_one_cycle_dry_run_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6v_one_cycle_dry_run"
rm -rf "$WORK"
mkdir -p "$WORK"

cat > "$WORK/one_cycle_dry_run.py" <<'PY'
from __future__ import annotations

import json
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENGINE=Path("/opt/skilledge/stock-engine")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

MAX_ADDS=2
MAX_REMOVES=2
CAPACITY=25

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def api_json(url):
    with urllib.request.urlopen(url,timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))

def extract_rows(payload):
    if isinstance(payload,list):
        return [row for row in payload if isinstance(row,dict)]
    if not isinstance(payload,dict):
        return []
    for key in ("watchlist","items","rows","data","candidates"):
        value=payload.get(key)
        if isinstance(value,list):
            return [row for row in value if isinstance(row,dict)]
    return []

def norm(value):
    return str(value or "").strip().upper()

def num(value,default=0.0):
    try:
        return float(value)
    except Exception:
        return default

def rank_dynamic(payload):
    rows=extract_rows(payload)
    ranked=[]
    seen=set()

    for index,row in enumerate(rows):
        symbol=norm(row.get("symbol") or row.get("ticker"))
        if not symbol or symbol in seen or symbol in CORE25:
            continue
        if len(symbol)>5 or not symbol.isalnum():
            continue
        if symbol.endswith(("W","WS","WT")):
            continue

        seen.add(symbol)

        base=num(
            row.get("score")
            or row.get("discoveryScore")
            or row.get("qualityScore")
            or row.get("inPlayScore")
        )
        move=abs(num(
            row.get("changePercent")
            or row.get("change_percent")
            or row.get("changesPercentage")
        ))
        volume=num(
            row.get("volume")
            or row.get("sessionVolume")
            or row.get("premarketVolume")
        )
        composite=base+min(move,100)*1.25+min(volume/1_000_000,50)-index*0.01

        ranked.append({
            "symbol":symbol,
            "score":round(composite,6),
            "sourceBucket":str(
                row.get("sourceBucket")
                or row.get("bucket")
                or "watchlist"
            ),
            "watchIndex":index,
        })

    ranked.sort(key=lambda item:(-item["score"],item["symbol"]))
    return ranked

def service_show():
    p=subprocess.run(
        [
            "systemctl","show","skilledge-market-stream.service",
            "--property=ActiveState,SubState,MainPID,NRestarts,Result"
        ],
        capture_output=True,text=True,check=False
    )
    return p.stdout.strip()

def snapshot_health():
    market_path=ENGINE/"data/market_state_snapshot.json"
    candle_path=ENGINE/"data/candle_indicator_snapshot.json"

    market=json.loads(market_path.read_text(encoding="utf-8"))
    candle=json.loads(candle_path.read_text(encoding="utf-8"))

    market_symbols=market.get("symbols") or {}
    candle_symbols=candle.get("symbols") or {}

    negative_ages=[]
    for symbol,row in candle_symbols.items():
        age=row.get("lastTradeAgeSeconds")
        if isinstance(age,(int,float)) and age<0:
            negative_ages.append(symbol)

    return {
        "marketSymbolCount":len(market_symbols),
        "candleSymbolCount":len(candle_symbols),
        "symbolSetsMatch":set(market_symbols)==set(candle_symbols),
        "negativeAgeSymbols":negative_ages,
    }

def choose_removals():
    # First dry run uses only the 4 non-protected tail symbols.
    removable=CORE25[21:]
    return removable[:MAX_REMOVES]

def main():
    watchlist=api_json("http://127.0.0.1:8000/engine/watchlist")
    ranked=rank_dynamic(watchlist)

    additions=ranked[:MAX_ADDS]
    removals=choose_removals()

    next_symbols=[
        symbol for symbol in CORE25
        if symbol not in removals
    ]+[item["symbol"] for item in additions]

    health=snapshot_health()
    service=service_show()

    preconditions={
        "serviceHealthy":(
            "ActiveState=active" in service
            and "SubState=running" in service
            and "NRestarts=0" in service
        ),
        "currentCapacity25":health["marketSymbolCount"]==25,
        "snapshotSymbolSetsMatch":health["symbolSetsMatch"],
        "negativeAgeCount":len(health["negativeAgeSymbols"]),
        "exactNextCapacity25":len(next_symbols)==25,
        "nextUniverseDeduplicated":len(set(next_symbols))==25,
        "addLimitRespected":len(additions)<=MAX_ADDS,
        "removeLimitRespected":len(removals)<=MAX_REMOVES,
        "protectedCorePreserved":all(
            symbol in next_symbols for symbol in CORE25[:21]
        ),
    }

    rollback_required=not all([
        preconditions["serviceHealthy"],
        preconditions["currentCapacity25"],
        preconditions["snapshotSymbolSetsMatch"],
        preconditions["negativeAgeCount"]==0,
        preconditions["exactNextCapacity25"],
        preconditions["nextUniverseDeduplicated"],
        preconditions["addLimitRespected"],
        preconditions["removeLimitRespected"],
        preconditions["protectedCorePreserved"],
    ])

    plan={
        "schemaVersion":1,
        "name":"skilledge_one_cycle_rotation_dry_run",
        "createdAt":now_iso(),
        "mode":"dry_run_only",
        "productionEnabled":False,
        "currentSymbols":CORE25,
        "proposedAdditions":additions,
        "proposedRemovals":removals,
        "proposedNextSymbols":next_symbols,
        "preconditions":preconditions,
        "runtimeHealth":health,
        "serviceShow":service,
        "rollbackRequired":rollback_required,
        "rollbackUniverse":CORE25,
        "gates":{
            "productionApplyAllowed":False,
            "serviceRestartAllowed":False,
            "systemdEditAllowed":False,
            "paperTradingAllowed":False,
            "clientReleaseAllowed":False,
            "telegramAllowed":False,
        },
    }

    errors=[]
    if len(additions)!=2:
        errors.append("EXPECTED_EXACTLY_2_ADDITIONS")
    if len(removals)!=2:
        errors.append("EXPECTED_EXACTLY_2_REMOVALS")
    if len(next_symbols)!=25:
        errors.append("NEXT_CAPACITY_NOT_25")
    if len(set(next_symbols))!=25:
        errors.append("NEXT_UNIVERSE_HAS_DUPLICATES")
    if any(symbol not in next_symbols for symbol in CORE25[:21]):
        errors.append("PROTECTED_CORE_VIOLATION")
    if plan["gates"]["productionApplyAllowed"]:
        errors.append("PRODUCTION_APPLY_MUST_BE_FALSE")
    if plan["gates"]["serviceRestartAllowed"]:
        errors.append("SERVICE_RESTART_MUST_BE_FALSE")
    if rollback_required:
        errors.append("DRY_RUN_PRECONDITION_FAILED")

    ok=not errors

    print(json.dumps({
        "ok":ok,
        "classification":(
            "DAY7D_ONE_CYCLE_ROTATION_DRY_RUN_VALIDATED"
            if ok else "DAY7D_ONE_CYCLE_ROTATION_DRY_RUN_FAILED"
        ),
        "plan":plan,
        "validationErrors":errors,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "paperTouched":False,
        "apiAppTouched":False,
        "strategyEngineTouched":False,
        "telegramTouched":False,
        "clientGatesTouched":False,
        "nextAction":(
            "BUILD_LIVE_SHADOW_GENERATION_WITHOUT_SUBSCRIPTION_CHANGE"
            if ok else "FIX_ONE_CYCLE_DRY_RUN"
        ),
    },ensure_ascii=False))

if __name__=="__main__":
    main()
PY

cat > "$WORK/test_one_cycle_dry_run.py" <<'PY'
import unittest
from one_cycle_dry_run import CORE25,MAX_ADDS,MAX_REMOVES

class OneCycleDryRunTests(unittest.TestCase):
    def test_limits(self):
        self.assertEqual(MAX_ADDS,2)
        self.assertEqual(MAX_REMOVES,2)

    def test_protected_core_size(self):
        self.assertEqual(len(CORE25[:21]),21)

    def test_removable_tail_size(self):
        self.assertEqual(len(CORE25[21:]),4)

    def test_core_unique(self):
        self.assertEqual(len(CORE25),25)
        self.assertEqual(len(set(CORE25)),25)

if __name__=="__main__":
    unittest.main()
PY

cd "$WORK"

set +e
"$ENGINE/.venv/bin/python" -m py_compile \
  "$WORK/one_cycle_dry_run.py" \
  "$WORK/test_one_cycle_dry_run.py" \
  > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m unittest -v \
  test_one_cycle_dry_run \
  > "$WORK/tests.txt" 2>&1
TEST_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" \
  "$WORK/one_cycle_dry_run.py" \
  > "$WORK/result.json" 2> "$WORK/runtime.err"
RUN_RC=$?
set -e

export WORK COMPILE_RC TEST_RC RUN_RC

"$ENGINE/.venv/bin/python" - <<'PY'
import json,os
from pathlib import Path

work=Path(os.environ["WORK"])
compile_rc=int(os.environ["COMPILE_RC"])
test_rc=int(os.environ["TEST_RC"])
run_rc=int(os.environ["RUN_RC"])

compile_output=(work/"compile.txt").read_text(encoding="utf-8",errors="replace")
test_output=(work/"tests.txt").read_text(encoding="utf-8",errors="replace")
runtime_error=(work/"runtime.err").read_text(encoding="utf-8",errors="replace")

result={}
if run_rc==0:
    try:
        result=json.loads((work/"result.json").read_text(encoding="utf-8"))
    except Exception as exc:
        runtime_error+=f"\nJSON parse failed: {exc}"

ok=compile_rc==0 and test_rc==0 and run_rc==0 and bool(result.get("ok"))

if not ok:
    print(json.dumps({
        "ok":False,
        "classification":"DAY7D_ONE_CYCLE_ROTATION_DRY_RUN_FAILED",
        "compileReturnCode":compile_rc,
        "compileOutput":compile_output,
        "testReturnCode":test_rc,
        "testOutput":test_output,
        "runReturnCode":run_rc,
        "runtimeError":runtime_error,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "nextAction":"FIX_ONE_CYCLE_DRY_RUN",
    },ensure_ascii=False))
else:
    result.update({
        "compileReturnCode":compile_rc,
        "compileOutput":compile_output,
        "testReturnCode":test_rc,
        "testOutput":test_output,
        "runReturnCode":run_rc,
        "runtimeError":runtime_error,
    })
    print(json.dumps(result,ensure_ascii=False))
PY

rm -rf "$WORK"
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7D ONE-CYCLE DRY RUN ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN ONE-CYCLE ROTATION DRY RUN IN /tmp ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no stream mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote dry run failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

if($r.plan){
  $r.plan|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $planFile -Encoding UTF8
}

@(
 "S10.6V DAY 7D ONE-CYCLE DRY RUN",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "COMPILE_RETURN_CODE=$($r.compileReturnCode)",
 "TEST_RETURN_CODE=$($r.testReturnCode)",
 "RUN_RETURN_CODE=$($r.runReturnCode)",
 "PROPOSED_ADDITIONS=$(@($r.plan.proposedAdditions.symbol)-join ',')",
 "PROPOSED_REMOVALS=$(@($r.plan.proposedRemovals)-join ',')",
 "PROPOSED_NEXT_COUNT=$(@($r.plan.proposedNextSymbols).Count)",
 "SERVICE_HEALTHY=$($r.plan.preconditions.serviceHealthy)",
 "SNAPSHOT_SYMBOL_SETS_MATCH=$($r.plan.preconditions.snapshotSymbolSetsMatch)",
 "NEGATIVE_AGE_COUNT=$($r.plan.preconditions.negativeAgeCount)",
 "PROTECTED_CORE_PRESERVED=$($r.plan.preconditions.protectedCorePreserved)",
 "ROLLBACK_REQUIRED=$($r.plan.rollbackRequired)",
 "PRODUCTION_APPLY_ALLOWED=$($r.plan.gates.productionApplyAllowed)",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "PLAN_FILE=$planFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6V_DAY7D_ONE_CYCLE_DRY_RUN_$stamp.md"
@"
# S10.6V Day 7D One-Cycle Dry Run

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Proposed additions: $(@($r.plan.proposedAdditions.symbol)-join ', ')
- Proposed removals: $(@($r.plan.proposedRemovals)-join ', ')
- Proposed next count: $(@($r.plan.proposedNextSymbols).Count)
- Service healthy: $($r.plan.preconditions.serviceHealthy)
- Snapshot sets match: $($r.plan.preconditions.snapshotSymbolSetsMatch)
- Negative age count: $($r.plan.preconditions.negativeAgeCount)
- Protected core preserved: $($r.plan.preconditions.protectedCorePreserved)
- Rollback required: $($r.plan.rollbackRequired)
- Production apply allowed: $($r.plan.gates.productionApplyAllowed)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream symbol mutation.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6V DAY 7D DRY RUN COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Compile RC: $($r.compileReturnCode)"
Write-Host "Test RC: $($r.testReturnCode)"
Write-Host "Run RC: $($r.runReturnCode)"
Write-Host "Proposed additions: $(@($r.plan.proposedAdditions.symbol)-join ', ')"
Write-Host "Proposed removals: $(@($r.plan.proposedRemovals)-join ', ')"
Write-Host "Proposed next count: $(@($r.plan.proposedNextSymbols).Count)"
Write-Host "Service healthy: $($r.plan.preconditions.serviceHealthy)"
Write-Host "Snapshot sets match: $($r.plan.preconditions.snapshotSymbolSetsMatch)"
Write-Host "Negative age count: $($r.plan.preconditions.negativeAgeCount)"
Write-Host "Protected core preserved: $($r.plan.preconditions.protectedCorePreserved)"
Write-Host "Rollback required: $($r.plan.rollbackRequired)"
Write-Host "Production apply allowed: $($r.plan.gates.productionApplyAllowed)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Plan: $planFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Day 7D one-cycle dry run failed"
}
