param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner",
  [int]$Samples=6,
  [int]$IntervalSeconds=30
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

if($Samples -lt 3){ throw "Samples must be at least 3" }
if($IntervalSeconds -lt 10){ throw "IntervalSeconds must be at least 10" }

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6W_DAY7D_LIVE_SHADOW_GENERATION_raw_$stamp.json"
$report=Join-Path $Audit "S10_6W_DAY7D_LIVE_SHADOW_GENERATION_report_$stamp.txt"
$shadowFile=Join-Path $State "dynamic_universe_live_shadow_generation_v1.json"
$localSh=Join-Path $env:TEMP "s10_6w_live_shadow_generation_$stamp.sh"
$remoteSh="/tmp/s10_6w_live_shadow_generation_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6w_live_shadow_generation"
SAMPLES="__SAMPLES__"
INTERVAL="__INTERVAL__"

rm -rf "$WORK"
mkdir -p "$WORK"

cat > "$WORK/live_shadow_generation.py" <<'PY'
from __future__ import annotations

import json
import math
import subprocess
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENGINE=Path("/opt/skilledge/stock-engine")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

PROTECTED_CORE=CORE25[:21]
REMOVABLE_TAIL=CORE25[21:]
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
        out=float(value)
        return out if math.isfinite(out) else default
    except Exception:
        return default

def ranked_dynamic(payload):
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
        bucket=str(
            row.get("sourceBucket")
            or row.get("bucket")
            or "watchlist"
        ).lower()

        bucket_bonus={
            "gainers":18.0,
            "losers":18.0,
            "most_active":14.0,
            "most-active":14.0,
            "active":14.0,
        }.get(bucket,8.0)

        score=(
            base
            + min(move,100.0)*1.25
            + min(math.log10(max(volume,1.0))*7.0,56.0)
            + bucket_bonus
            - index*0.01
        )

        ranked.append({
            "symbol":symbol,
            "score":round(score,6),
            "sourceBucket":bucket,
            "watchIndex":index,
            "changePercent":move,
            "volume":volume,
        })

    ranked.sort(key=lambda item:(-item["score"],item["symbol"]))
    return ranked

def runtime_health():
    market=json.loads(
        (ENGINE/"data/market_state_snapshot.json").read_text(encoding="utf-8")
    )
    candle=json.loads(
        (ENGINE/"data/candle_indicator_snapshot.json").read_text(encoding="utf-8")
    )

    market_symbols=market.get("symbols") or {}
    candle_symbols=candle.get("symbols") or {}

    negative=[]
    for symbol,row in candle_symbols.items():
        age=row.get("lastTradeAgeSeconds")
        if isinstance(age,(int,float)) and age<0:
            negative.append(symbol)

    service=subprocess.run(
        [
            "systemctl","show","skilledge-market-stream.service",
            "--property=ActiveState,SubState,MainPID,NRestarts,Result"
        ],
        capture_output=True,text=True,check=False,
    ).stdout.strip()

    return {
        "serviceHealthy":(
            "ActiveState=active" in service
            and "SubState=running" in service
            and "NRestarts=0" in service
        ),
        "serviceShow":service,
        "marketSymbolCount":len(market_symbols),
        "candleSymbolCount":len(candle_symbols),
        "symbolSetsMatch":set(market_symbols)==set(candle_symbols),
        "actualSymbols":sorted(market_symbols),
        "negativeAgeSymbols":negative,
    }

def build_shadow(payload,index):
    ranked=ranked_dynamic(payload)
    additions=ranked[:MAX_ADDS]
    removals=REMOVABLE_TAIL[:MAX_REMOVES]

    proposed=[
        symbol for symbol in CORE25
        if symbol not in removals
    ]+[item["symbol"] for item in additions]

    return {
        "sampleIndex":index,
        "createdAt":now_iso(),
        "proposedAdditions":additions,
        "proposedRemovals":removals,
        "proposedNextSymbols":proposed,
        "capacity":len(proposed),
        "protectedCorePreserved":all(
            symbol in proposed for symbol in PROTECTED_CORE
        ),
        "deduplicated":len(set(proposed))==len(proposed),
    }

def main(samples,interval):
    snapshots=[]
    errors=[]

    initial_health=runtime_health()

    for index in range(1,samples+1):
        try:
            payload=api_json("http://127.0.0.1:8000/engine/watchlist")
            snapshots.append(build_shadow(payload,index))
        except Exception as exc:
            errors.append({
                "sampleIndex":index,
                "error":str(exc),
            })

        if index<samples:
            time.sleep(interval)

    final_health=runtime_health()

    addition_sets=[
        tuple(item["symbol"] for item in sample["proposedAdditions"])
        for sample in snapshots
    ]
    removal_sets=[
        tuple(sample["proposedRemovals"])
        for sample in snapshots
    ]
    next_sets=[
        tuple(sample["proposedNextSymbols"])
        for sample in snapshots
    ]

    additions_counter=Counter(addition_sets)
    removals_counter=Counter(removal_sets)
    next_counter=Counter(next_sets)

    stable_additions=(
        len(additions_counter)==1
        and len(addition_sets)==samples
    )
    stable_removals=(
        len(removals_counter)==1
        and len(removal_sets)==samples
    )
    stable_next_generation=(
        len(next_counter)==1
        and len(next_sets)==samples
    )

    all_shapes_valid=all(
        sample["capacity"]==CAPACITY
        and sample["protectedCorePreserved"]
        and sample["deduplicated"]
        and len(sample["proposedAdditions"])<=MAX_ADDS
        and len(sample["proposedRemovals"])<=MAX_REMOVES
        for sample in snapshots
    )

    runtime_healthy=all([
        initial_health["serviceHealthy"],
        final_health["serviceHealthy"],
        initial_health["marketSymbolCount"]==25,
        final_health["marketSymbolCount"]==25,
        initial_health["symbolSetsMatch"],
        final_health["symbolSetsMatch"],
        not initial_health["negativeAgeSymbols"],
        not final_health["negativeAgeSymbols"],
    ])

    issues=[]
    if not stable_additions:
        issues.append("SHADOW_ADDITIONS_CHANGED")
    if not stable_removals:
        issues.append("SHADOW_REMOVALS_CHANGED")
    if not stable_next_generation:
        issues.append("SHADOW_GENERATION_CHANGED")
    if not all_shapes_valid:
        issues.append("SHADOW_GENERATION_INVARIANT_FAILED")
    if not runtime_healthy:
        issues.append("RUNTIME_HEALTH_FAILED")
    if errors:
        issues.append("SHADOW_SAMPLE_ERRORS")

    ok=(
        len(snapshots)==samples
        and not errors
        and all_shapes_valid
        and runtime_healthy
    )

    first=snapshots[0] if snapshots else {}
    final=snapshots[-1] if snapshots else {}

    print(json.dumps({
        "ok":ok,
        "classification":(
            "DAY7D_LIVE_SHADOW_GENERATION_VALIDATED"
            if ok else "DAY7D_LIVE_SHADOW_GENERATION_FAILED"
        ),
        "samplesRequested":samples,
        "samplesCompleted":len(snapshots),
        "intervalSeconds":interval,
        "snapshots":snapshots,
        "metrics":{
            "stableAdditions":stable_additions,
            "stableRemovals":stable_removals,
            "stableNextGeneration":stable_next_generation,
            "uniqueAdditionSets":len(additions_counter),
            "uniqueRemovalSets":len(removals_counter),
            "uniqueNextGenerations":len(next_counter),
            "allGenerationShapesValid":all_shapes_valid,
            "runtimeHealthy":runtime_healthy,
        },
        "firstProposedAdditions":first.get("proposedAdditions",[]),
        "finalProposedAdditions":final.get("proposedAdditions",[]),
        "firstProposedRemovals":first.get("proposedRemovals",[]),
        "finalProposedRemovals":final.get("proposedRemovals",[]),
        "initialRuntimeHealth":initial_health,
        "finalRuntimeHealth":final_health,
        "issues":issues,
        "errors":errors,
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
        "productionApplyAllowed":False,
        "nextAction":(
            "DESIGN_CONTROLLED_2_SYMBOL_ROTATION_CANARY"
            if ok and stable_next_generation
            else "EXTEND_LIVE_SHADOW_OBSERVATION"
        ),
    },ensure_ascii=False))

if __name__=="__main__":
    import sys
    main(int(sys.argv[1]),int(sys.argv[2]))
PY

cat > "$WORK/test_live_shadow_generation.py" <<'PY'
import unittest
from live_shadow_generation import (
    CORE25,
    PROTECTED_CORE,
    REMOVABLE_TAIL,
    MAX_ADDS,
    MAX_REMOVES,
)

class LiveShadowGenerationTests(unittest.TestCase):
    def test_core_partition(self):
        self.assertEqual(len(CORE25),25)
        self.assertEqual(len(PROTECTED_CORE),21)
        self.assertEqual(len(REMOVABLE_TAIL),4)
        self.assertEqual(PROTECTED_CORE+REMOVABLE_TAIL,CORE25)

    def test_rotation_limits(self):
        self.assertEqual(MAX_ADDS,2)
        self.assertEqual(MAX_REMOVES,2)

    def test_core_unique(self):
        self.assertEqual(len(set(CORE25)),25)

if __name__=="__main__":
    unittest.main()
PY

cd "$WORK"

set +e
"$ENGINE/.venv/bin/python" -m py_compile \
  "$WORK/live_shadow_generation.py" \
  "$WORK/test_live_shadow_generation.py" \
  > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m unittest -v \
  test_live_shadow_generation \
  > "$WORK/tests.txt" 2>&1
TEST_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" \
  "$WORK/live_shadow_generation.py" \
  "$SAMPLES" "$INTERVAL" \
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
        "classification":"DAY7D_LIVE_SHADOW_GENERATION_FAILED",
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
        "subscriptionChanged":False,
        "nextAction":"FIX_LIVE_SHADOW_GENERATION",
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

$bash=$bash.Replace("__SAMPLES__",[string]$Samples)
$bash=$bash.Replace("__INTERVAL__",[string]$IntervalSeconds)
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
Write-Host "=== UPLOAD DAY 7D LIVE SHADOW GENERATION ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){ throw "Upload failed" }

Write-Host ""
Write-Host "=== RUN LIVE SHADOW WITHOUT SUBSCRIPTION CHANGE ===" -ForegroundColor Green
Write-Host "Samples: $Samples, interval: $IntervalSeconds seconds" -ForegroundColor Yellow
Write-Host "No deploy / no restart / no stream or subscription mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote live shadow failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

$r|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $shadowFile -Encoding UTF8

$props=@{}
foreach($p in $r.PSObject.Properties){ $props[$p.Name]=$p.Value }

$ok=[bool]$props["ok"]
$classification=[string]$props["classification"]
$compileRc=$props["compileReturnCode"]
$testRc=$props["testReturnCode"]
$runRc=$props["runReturnCode"]
$metrics=$props["metrics"]
$issues=@($props["issues"])
$nextAction=[string]$props["nextAction"]
$firstAdds=@($props["firstProposedAdditions"])
$finalAdds=@($props["finalProposedAdditions"])
$firstRemoves=@($props["firstProposedRemovals"])
$finalRemoves=@($props["finalProposedRemovals"])

@(
 "S10.6W DAY 7D LIVE SHADOW GENERATION",
 "Generated=$stamp",
 "OK=$ok",
 "CLASSIFICATION=$classification",
 "COMPILE_RETURN_CODE=$compileRc",
 "TEST_RETURN_CODE=$testRc",
 "RUN_RETURN_CODE=$runRc",
 "SAMPLES_COMPLETED=$($props["samplesCompleted"])",
 "STABLE_ADDITIONS=$($metrics.stableAdditions)",
 "STABLE_REMOVALS=$($metrics.stableRemovals)",
 "STABLE_NEXT_GENERATION=$($metrics.stableNextGeneration)",
 "UNIQUE_ADDITION_SETS=$($metrics.uniqueAdditionSets)",
 "UNIQUE_NEXT_GENERATIONS=$($metrics.uniqueNextGenerations)",
 "ALL_GENERATION_SHAPES_VALID=$($metrics.allGenerationShapesValid)",
 "RUNTIME_HEALTHY=$($metrics.runtimeHealthy)",
 "FIRST_ADDITIONS=$(@($firstAdds.symbol)-join ',')",
 "FINAL_ADDITIONS=$(@($finalAdds.symbol)-join ',')",
 "FIRST_REMOVALS=$($firstRemoves-join ',')",
 "FINAL_REMOVALS=$($finalRemoves-join ',')",
 "SUBSCRIPTION_CHANGED=$($props["subscriptionChanged"])",
 "STREAM_SYMBOLS_CHANGED=$($props["streamSymbolsChanged"])",
 "PRODUCTION_APPLY_ALLOWED=$($props["productionApplyAllowed"])",
 "ISSUES=$($issues-join ',')",
 "NEXT_ACTION=$nextAction",
 "SHADOW_FILE=$shadowFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6W_DAY7D_LIVE_SHADOW_GENERATION_$stamp.md"
@"
# S10.6W Day 7D Live Shadow Generation

Generated: $((Get-Date).ToString("s"))

- OK: $ok
- Classification: $classification
- Samples: $($props["samplesCompleted"])
- Stable additions: $($metrics.stableAdditions)
- Stable removals: $($metrics.stableRemovals)
- Stable next generation: $($metrics.stableNextGeneration)
- Unique addition sets: $($metrics.uniqueAdditionSets)
- Runtime healthy: $($metrics.runtimeHealthy)
- First additions: $(@($firstAdds.symbol)-join ', ')
- Final additions: $(@($finalAdds.symbol)-join ', ')
- Subscription changed: $($props["subscriptionChanged"])
- Production apply allowed: $($props["productionApplyAllowed"])
- Issues: $($issues-join ', ')
- Next action: $nextAction

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6W DAY 7D LIVE SHADOW COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Classification: $classification"
Write-Host "Compile RC: $compileRc"
Write-Host "Test RC: $testRc"
Write-Host "Run RC: $runRc"
Write-Host "Samples completed: $($props["samplesCompleted"])"
Write-Host "Stable additions: $($metrics.stableAdditions)"
Write-Host "Stable removals: $($metrics.stableRemovals)"
Write-Host "Stable next generation: $($metrics.stableNextGeneration)"
Write-Host "Unique addition sets: $($metrics.uniqueAdditionSets)"
Write-Host "Unique next generations: $($metrics.uniqueNextGenerations)"
Write-Host "All generation shapes valid: $($metrics.allGenerationShapesValid)"
Write-Host "Runtime healthy: $($metrics.runtimeHealthy)"
Write-Host "First additions: $(@($firstAdds.symbol)-join ', ')"
Write-Host "Final additions: $(@($finalAdds.symbol)-join ', ')"
Write-Host "First removals: $($firstRemoves-join ', ')"
Write-Host "Final removals: $($finalRemoves-join ', ')"
Write-Host "Subscription changed: $($props["subscriptionChanged"])"
Write-Host "Stream symbols changed: $($props["streamSymbolsChanged"])"
Write-Host "Production apply allowed: $($props["productionApplyAllowed"])"
Write-Host "Issues: $($issues-join ', ')"
Write-Host "Next action: $nextAction"
Write-Host "Shadow file: $shadowFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $ok){
  throw "Day 7D live shadow generation failed"
}
