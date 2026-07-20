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
$raw=Join-Path $Audit "S10_6U_DAY7D_ROTATION_CANARY_PLAN_raw_$stamp.json"
$report=Join-Path $Audit "S10_6U_DAY7D_ROTATION_CANARY_PLAN_report_$stamp.txt"
$planFile=Join-Path $State "dynamic_universe_rotation_canary_plan_v1.json"
$localSh=Join-Path $env:TEMP "s10_6u_rotation_canary_plan_$stamp.sh"
$remoteSh="/tmp/s10_6u_rotation_canary_plan_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6u_rotation_canary_plan"
rm -rf "$WORK"
mkdir -p "$WORK"

cat > "$WORK/build_canary_plan.py" <<'PY'
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

PROTECTED_CORE_COUNT=21
DYNAMIC_SLOT_COUNT=4
TOTAL_CAPACITY=25

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

def score(row,index):
    raw=row.get("score")
    if raw is None:
        raw=row.get("discoveryScore")
    if raw is None:
        raw=row.get("qualityScore")
    if raw is None:
        raw=row.get("inPlayScore")
    try:
        base=float(raw or 0)
    except Exception:
        base=0.0

    try:
        move=abs(float(
            row.get("changePercent")
            or row.get("change_percent")
            or row.get("changesPercentage")
            or 0
        ))
    except Exception:
        move=0.0

    try:
        volume=float(
            row.get("volume")
            or row.get("sessionVolume")
            or row.get("premarketVolume")
            or 0
        )
    except Exception:
        volume=0.0

    return base + min(move,100)*1.25 + min(volume/1_000_000,50) - index*0.01

def build_plan(payload):
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
        ranked.append({
            "symbol":symbol,
            "score":round(score(row,index),6),
            "sourceBucket":str(
                row.get("sourceBucket")
                or row.get("bucket")
                or "watchlist"
            ),
            "watchIndex":index,
        })

    ranked.sort(key=lambda item:(-item["score"],item["symbol"]))
    dynamic=ranked[:DYNAMIC_SLOT_COUNT]

    protected_core=CORE25[:PROTECTED_CORE_COUNT]
    desired=protected_core+[item["symbol"] for item in dynamic]

    return {
        "schemaVersion":1,
        "name":"skilledge_dynamic_universe_rotation_canary",
        "createdAt":now_iso(),
        "mode":"plan_only",
        "productionEnabled":False,
        "researchOnly":True,
        "capacity":TOTAL_CAPACITY,
        "protectedCoreCount":PROTECTED_CORE_COUNT,
        "dynamicSlotCount":DYNAMIC_SLOT_COUNT,
        "protectedCoreSymbols":protected_core,
        "dynamicCandidates":dynamic,
        "desiredCanarySymbols":desired,
        "rotationRules":{
            "maxAddsPerCycle":2,
            "maxRemovesPerCycle":2,
            "minimumResidenceSeconds":900,
            "evictionConfirmationCycles":3,
            "reentryCooldownSeconds":900,
            "rotationAllowedOnlyDuringCanaryWindow":True,
            "neverEvictActiveLifecycle":True,
            "neverEvictOpenPaperPosition":True,
        },
        "rollback":{
            "fallbackUniverse":CORE25,
            "atomicFallbackRequired":True,
            "autoRollbackConditions":[
                "stream service unhealthy",
                "symbol resolution failure",
                "quote freshness failure",
                "negative age regression",
                "symbol count not equal to 25",
                "market state/candle snapshot mismatch",
            ],
        },
        "gates":{
            "clientReleaseAllowed":False,
            "telegramAllowed":False,
            "productionApplyAllowed":False,
            "paperTradingAllowed":False,
        },
        "rolloutSequence":[
            "PLAN_VALIDATION",
            "ONE_CYCLE_DRY_RUN",
            "LIVE_SHADOW_WITHOUT_SUBSCRIPTION_CHANGE",
            "CONTROLLED_2_SYMBOL_ROTATION_CANARY",
            "30_MINUTE_SOAK",
            "ROLLBACK_TEST",
            "SECOND_CANARY_ONLY_IF_FIRST_PASSES",
        ],
    }

def validate(plan):
    errors=[]
    desired=plan["desiredCanarySymbols"]

    if len(desired)!=25:
        errors.append("DESIRED_COUNT_NOT_25")
    if len(set(desired))!=25:
        errors.append("DUPLICATE_SYMBOLS")
    if len(plan["protectedCoreSymbols"])<21:
        errors.append("PROTECTED_CORE_BELOW_21")
    if plan["dynamicSlotCount"]>4:
        errors.append("DYNAMIC_SLOTS_ABOVE_4")
    if plan["rotationRules"]["maxAddsPerCycle"]>2:
        errors.append("MAX_ADDS_ABOVE_2")
    if plan["rotationRules"]["maxRemovesPerCycle"]>2:
        errors.append("MAX_REMOVES_ABOVE_2")
    if plan["gates"]["productionApplyAllowed"]:
        errors.append("PRODUCTION_APPLY_MUST_BE_FALSE")
    if plan["gates"]["clientReleaseAllowed"]:
        errors.append("CLIENT_RELEASE_MUST_BE_FALSE")
    if plan["gates"]["telegramAllowed"]:
        errors.append("TELEGRAM_MUST_BE_FALSE")
    if plan["gates"]["paperTradingAllowed"]:
        errors.append("PAPER_MUST_BE_FALSE")

    return errors

def main():
    payload=api_json("http://127.0.0.1:8000/engine/watchlist")
    first=build_plan(payload)
    second=build_plan(payload)

    deterministic=(
        first["protectedCoreSymbols"]==second["protectedCoreSymbols"]
        and first["dynamicCandidates"]==second["dynamicCandidates"]
        and first["desiredCanarySymbols"]==second["desiredCanarySymbols"]
    )

    errors=validate(first)
    if not deterministic:
        errors.append("NON_DETERMINISTIC_PLAN")

    ok=not errors

    print(json.dumps({
        "ok":ok,
        "classification":(
            "DAY7D_ROTATION_CANARY_PLAN_VALIDATED"
            if ok else "DAY7D_ROTATION_CANARY_PLAN_FAILED"
        ),
        "plan":first,
        "deterministic":deterministic,
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
        "nextAction":"BUILD_ONE_CYCLE_ROTATION_DRY_RUN",
    },ensure_ascii=False))

if __name__=="__main__":
    main()
PY

cat > "$WORK/test_canary_plan.py" <<'PY'
import unittest
from build_canary_plan import (
    build_plan,
    validate,
    CORE25,
)

class CanaryPlanTests(unittest.TestCase):
    def fixture(self):
        return {
            "items":[
                {"symbol":"AAA","score":100,"changePercent":40,"volume":20_000_000},
                {"symbol":"BBB","score":90,"changePercent":35,"volume":15_000_000},
                {"symbol":"CCC","score":80,"changePercent":30,"volume":10_000_000},
                {"symbol":"DDD","score":70,"changePercent":25,"volume":8_000_000},
                {"symbol":"EEE","score":60,"changePercent":20,"volume":6_000_000},
                {"symbol":"AAPL","score":200,"changePercent":50,"volume":50_000_000},
            ]
        }

    def test_plan_shape_and_gates(self):
        plan=build_plan(self.fixture())
        self.assertEqual(len(plan["protectedCoreSymbols"]),21)
        self.assertEqual(len(plan["dynamicCandidates"]),4)
        self.assertEqual(len(plan["desiredCanarySymbols"]),25)
        self.assertEqual(validate(plan),[])
        self.assertFalse(plan["gates"]["productionApplyAllowed"])
        self.assertFalse(plan["gates"]["clientReleaseAllowed"])
        self.assertFalse(plan["gates"]["telegramAllowed"])
        self.assertFalse(plan["gates"]["paperTradingAllowed"])

    def test_core_is_protected(self):
        plan=build_plan(self.fixture())
        self.assertEqual(plan["protectedCoreSymbols"],CORE25[:21])
        self.assertNotIn("AAPL",[x["symbol"] for x in plan["dynamicCandidates"]])

    def test_rotation_limits(self):
        plan=build_plan(self.fixture())
        self.assertLessEqual(plan["rotationRules"]["maxAddsPerCycle"],2)
        self.assertLessEqual(plan["rotationRules"]["maxRemovesPerCycle"],2)

    def test_deterministic(self):
        first=build_plan(self.fixture())
        second=build_plan(self.fixture())
        self.assertEqual(first["desiredCanarySymbols"],second["desiredCanarySymbols"])
        self.assertEqual(first["dynamicCandidates"],second["dynamicCandidates"])

if __name__=="__main__":
    unittest.main()
PY

cd "$WORK"

set +e
"$ENGINE/.venv/bin/python" -m py_compile \
  "$WORK/build_canary_plan.py" \
  "$WORK/test_canary_plan.py" \
  > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m unittest -v \
  test_canary_plan \
  > "$WORK/tests.txt" 2>&1
TEST_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" \
  "$WORK/build_canary_plan.py" \
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
        "classification":"DAY7D_ROTATION_CANARY_PLAN_FAILED",
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
        "nextAction":"FIX_ROTATION_CANARY_PLAN",
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
Write-Host "=== UPLOAD DAY 7D ROTATION CANARY PLAN ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== BUILD + VALIDATE ROTATION CANARY PLAN IN /tmp ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no stream mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote canary plan failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

if($r.plan){
  $r.plan|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $planFile -Encoding UTF8
}

@(
 "S10.6U DAY 7D ROTATION CANARY PLAN",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "COMPILE_RETURN_CODE=$($r.compileReturnCode)",
 "TEST_RETURN_CODE=$($r.testReturnCode)",
 "RUN_RETURN_CODE=$($r.runReturnCode)",
 "DETERMINISTIC=$($r.deterministic)",
 "PROTECTED_CORE_COUNT=$($r.plan.protectedCoreCount)",
 "DYNAMIC_SLOT_COUNT=$($r.plan.dynamicSlotCount)",
 "DESIRED_SYMBOL_COUNT=$(@($r.plan.desiredCanarySymbols).Count)",
 "DYNAMIC_CANDIDATES=$(@($r.plan.dynamicCandidates.symbol)-join ',')",
 "MAX_ADDS_PER_CYCLE=$($r.plan.rotationRules.maxAddsPerCycle)",
 "MAX_REMOVES_PER_CYCLE=$($r.plan.rotationRules.maxRemovesPerCycle)",
 "PRODUCTION_APPLY_ALLOWED=$($r.plan.gates.productionApplyAllowed)",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "PLAN_FILE=$planFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6U_DAY7D_ROTATION_CANARY_PLAN_$stamp.md"
@"
# S10.6U Day 7D Rotation Canary Plan

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Protected core: $($r.plan.protectedCoreCount)
- Dynamic slots: $($r.plan.dynamicSlotCount)
- Desired count: $(@($r.plan.desiredCanarySymbols).Count)
- Dynamic candidates: $(@($r.plan.dynamicCandidates.symbol)-join ', ')
- Max adds/removes per cycle: $($r.plan.rotationRules.maxAddsPerCycle) / $($r.plan.rotationRules.maxRemovesPerCycle)
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
Write-Host "=== S10.6U DAY 7D CANARY PLAN COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Compile RC: $($r.compileReturnCode)"
Write-Host "Test RC: $($r.testReturnCode)"
Write-Host "Run RC: $($r.runReturnCode)"
Write-Host "Deterministic: $($r.deterministic)"
Write-Host "Protected core count: $($r.plan.protectedCoreCount)"
Write-Host "Dynamic slot count: $($r.plan.dynamicSlotCount)"
Write-Host "Desired symbol count: $(@($r.plan.desiredCanarySymbols).Count)"
Write-Host "Dynamic candidates: $(@($r.plan.dynamicCandidates.symbol)-join ', ')"
Write-Host "Max adds/removes per cycle: $($r.plan.rotationRules.maxAddsPerCycle) / $($r.plan.rotationRules.maxRemovesPerCycle)"
Write-Host "Production apply allowed: $($r.plan.gates.productionApplyAllowed)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Plan: $planFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Day 7D rotation canary plan failed"
}
