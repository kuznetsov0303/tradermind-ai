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
$raw=Join-Path $Audit "S10_6T_DAY7D_SHADOW_COMPARE_raw_$stamp.json"
$report=Join-Path $Audit "S10_6T_DAY7D_SHADOW_COMPARE_report_$stamp.txt"
$shadowFile=Join-Path $State "dynamic_universe_shadow_compare_v1.json"
$localSh=Join-Path $env:TEMP "s10_6t_shadow_compare_$stamp.sh"
$remoteSh="/tmp/s10_6t_shadow_compare_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6t_shadow_compare"
SAMPLES="__SAMPLES__"
INTERVAL="__INTERVAL__"

rm -rf "$WORK"
mkdir -p "$WORK"

cat > "$WORK/shadow_compare.py" <<'PY'
from __future__ import annotations

import json
import math
import re
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENGINE=Path("/opt/skilledge/stock-engine")
CAPACITY=25

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

BLOCKED={
    "SPY","QQQ","IWM","DIA","TQQQ","SQQQ","UVXY","VXX","SOXL","SOXS",
}

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def api_json(url):
    with urllib.request.urlopen(url,timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))

def norm_symbol(value):
    return str(value or "").strip().upper()

def tradeable(symbol):
    return bool(
        symbol
        and symbol not in BLOCKED
        and re.fullmatch(r"[A-Z0-9]{1,5}",symbol)
        and not symbol.endswith(("W","WS","WT"))
    )

def num(value,default=0.0):
    try:
        result=float(value)
        return result if math.isfinite(result) else default
    except Exception:
        return default

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

def score_row(row,index):
    symbol=norm_symbol(row.get("symbol") or row.get("ticker"))
    if not tradeable(symbol):
        return None

    score=num(
        row.get("score")
        or row.get("discoveryScore")
        or row.get("qualityScore")
        or row.get("inPlayScore"),
        0.0,
    )
    change=abs(num(
        row.get("changePercent")
        or row.get("change_percent")
        or row.get("changesPercentage"),
        0.0,
    ))
    volume=num(
        row.get("volume")
        or row.get("sessionVolume")
        or row.get("premarketVolume"),
        0.0,
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

    composite=(
        score
        + min(change,100.0)*1.25
        + min(math.log10(max(volume,1.0))*7.0,56.0)
        + bucket_bonus
        - index*0.01
    )

    return {
        "symbol":symbol,
        "score":round(composite,6),
        "bucket":bucket,
        "change":change,
        "volume":volume,
        "index":index,
    }

def build_generation(payload):
    rows=extract_rows(payload)
    candidates=[]

    for index,row in enumerate(rows):
        scored=score_row(row,index)
        if scored:
            candidates.append(scored)

    best={}
    for item in candidates:
        current=best.get(item["symbol"])
        if current is None or item["score"]>current["score"]:
            best[item["symbol"]]=item

    ranked=sorted(
        best.values(),
        key=lambda item:(-item["score"],item["symbol"]),
    )

    # Shadow proposal remains discovery-led, but no production action.
    selected=ranked[:CAPACITY]
    desired=[item["symbol"] for item in selected]

    # Fill any shortage from Core25 for deterministic capacity.
    for symbol in CORE25:
        if len(desired)>=CAPACITY:
            break
        if symbol not in desired:
            desired.append(symbol)

    return {
        "createdAt":now_iso(),
        "watchlistRows":len(rows),
        "candidateCount":len(best),
        "desiredSymbols":desired,
        "selected":selected,
        "coreOverlap":sorted(set(desired)&set(CORE25)),
        "addedVsCore":sorted(set(desired)-set(CORE25)),
        "removedVsCore":sorted(set(CORE25)-set(desired)),
    }

def jaccard(a,b):
    left=set(a)
    right=set(b)
    union=left|right
    return 1.0 if not union else len(left&right)/len(union)

def main(samples,interval):
    snapshots=[]
    errors=[]

    for index in range(samples):
        try:
            payload=api_json("http://127.0.0.1:8000/engine/watchlist")
            generation=build_generation(payload)
            generation["sampleIndex"]=index+1
            snapshots.append(generation)
        except Exception as exc:
            errors.append({
                "sampleIndex":index+1,
                "error":str(exc),
            })

        if index<samples-1:
            time.sleep(interval)

    if not snapshots:
        print(json.dumps({
            "ok":False,
            "classification":"DAY7D_SHADOW_COMPARE_FAILED",
            "errors":errors,
            "productionMutation":False,
            "serviceRestarted":False,
            "streamSymbolsChanged":False,
            "nextAction":"FIX_SHADOW_COMPARE",
        },ensure_ascii=False))
        return

    appearances=Counter()
    for snapshot in snapshots:
        appearances.update(snapshot["desiredSymbols"])

    pairwise=[]
    for left,right in zip(snapshots,snapshots[1:]):
        left_set=set(left["desiredSymbols"])
        right_set=set(right["desiredSymbols"])
        pairwise.append({
            "fromSample":left["sampleIndex"],
            "toSample":right["sampleIndex"],
            "jaccard":round(
                jaccard(left["desiredSymbols"],right["desiredSymbols"]),
                6,
            ),
            "retainedCount":len(left_set&right_set),
            "addedCount":len(right_set-left_set),
            "removedCount":len(left_set-right_set),
            "addedSymbols":sorted(right_set-left_set),
            "removedSymbols":sorted(left_set-right_set),
        })

    stable_symbols=sorted(
        symbol for symbol,count in appearances.items()
        if count==len(snapshots)
    )
    majority_symbols=sorted(
        symbol for symbol,count in appearances.items()
        if count>=math.ceil(len(snapshots)*0.67)
    )

    avg_jaccard=(
        sum(item["jaccard"] for item in pairwise)/len(pairwise)
        if pairwise else 1.0
    )
    max_added=max(
        (item["addedCount"] for item in pairwise),
        default=0,
    )
    max_removed=max(
        (item["removedCount"] for item in pairwise),
        default=0,
    )
    avg_core_overlap=sum(
        len(snapshot["coreOverlap"]) for snapshot in snapshots
    )/len(snapshots)

    # Conservative rollout recommendation.
    if avg_jaccard>=0.85 and max_added<=4:
        recommended_rotation_cap=4
        stability="HIGH"
    elif avg_jaccard>=0.70 and max_added<=8:
        recommended_rotation_cap=2
        stability="MEDIUM"
    else:
        recommended_rotation_cap=0
        stability="LOW"

    issues=[]
    if avg_jaccard<0.70:
        issues.append("PROPOSED_UNIVERSE_HIGH_CHURN")
    if max_added>8:
        issues.append("TOO_MANY_SYMBOL_REPLACEMENTS_PER_CYCLE")
    if avg_core_overlap<10:
        issues.append("CORE25_OVERLAP_TOO_LOW")
    if len(stable_symbols)<10:
        issues.append("INSUFFICIENT_STABLE_SYMBOL_SET")
    if errors:
        issues.append("WATCHLIST_SAMPLE_ERRORS")

    ok=len(snapshots)>=3 and not errors

    print(json.dumps({
        "ok":ok,
        "classification":(
            "DAY7D_DYNAMIC_UNIVERSE_SHADOW_COMPARE_COMPLETED"
            if ok else "DAY7D_SHADOW_COMPARE_FAILED"
        ),
        "samplesRequested":samples,
        "samplesCompleted":len(snapshots),
        "intervalSeconds":interval,
        "snapshots":snapshots,
        "pairwiseTransitions":pairwise,
        "metrics":{
            "averageJaccard":round(avg_jaccard,6),
            "maxAddedPerTransition":max_added,
            "maxRemovedPerTransition":max_removed,
            "averageCore25Overlap":round(avg_core_overlap,3),
            "stableSymbolCount":len(stable_symbols),
            "stableSymbols":stable_symbols,
            "majoritySymbolCount":len(majority_symbols),
            "majoritySymbols":majority_symbols,
            "uniqueProposedSymbolCount":len(appearances),
        },
        "stabilityClassification":stability,
        "recommendedRotationCap":recommended_rotation_cap,
        "rotationProductionAllowed":False,
        "issues":issues,
        "errors":errors,
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
            "DESIGN_HYSTERESIS_AND_PROTECTED_CORE_POLICY"
            if recommended_rotation_cap==0
            else "BUILD_25_SYMBOL_ROTATION_CANARY_PLAN"
        ),
    },ensure_ascii=False))

if __name__=="__main__":
    import sys
    main(int(sys.argv[1]),int(sys.argv[2]))
PY

cd "$WORK"

set +e
"$ENGINE/.venv/bin/python" -m py_compile "$WORK/shadow_compare.py" \
  > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?

"$ENGINE/.venv/bin/python" "$WORK/shadow_compare.py" \
  "$SAMPLES" "$INTERVAL" \
  > "$WORK/result.json" 2> "$WORK/runtime.err"
RUN_RC=$?
set -e

export WORK COMPILE_RC RUN_RC

"$ENGINE/.venv/bin/python" - <<'PY'
import json
import os
from pathlib import Path

work=Path(os.environ["WORK"])
compile_rc=int(os.environ["COMPILE_RC"])
run_rc=int(os.environ["RUN_RC"])

compile_output=(work/"compile.txt").read_text(
    encoding="utf-8",errors="replace"
)
runtime_error=(work/"runtime.err").read_text(
    encoding="utf-8",errors="replace"
)

result={}
if run_rc==0:
    try:
        result=json.loads(
            (work/"result.json").read_text(encoding="utf-8")
        )
    except Exception as exc:
        runtime_error+=f"\nJSON parse failed: {exc}"

ok=(
    compile_rc==0
    and run_rc==0
    and bool(result.get("ok"))
)

if not ok:
    print(json.dumps({
        "ok":False,
        "classification":"DAY7D_SHADOW_COMPARE_FAILED",
        "compileReturnCode":compile_rc,
        "compileOutput":compile_output,
        "runReturnCode":run_rc,
        "runtimeError":runtime_error,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "nextAction":"FIX_SHADOW_COMPARE",
    },ensure_ascii=False))
else:
    result.update({
        "compileReturnCode":compile_rc,
        "compileOutput":compile_output,
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
Write-Host "=== UPLOAD DAY 7D SHADOW COMPARE ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){ throw "Upload failed" }

Write-Host ""
Write-Host "=== RUN READ-ONLY DYNAMIC UNIVERSE SHADOW COMPARE ===" -ForegroundColor Green
Write-Host "Samples: $Samples, interval: $IntervalSeconds seconds" -ForegroundColor Yellow
Write-Host "No deploy / no restart / no stream mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote shadow compare failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

$r|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $shadowFile -Encoding UTF8

@(
 "S10.6T DAY 7D SHADOW COMPARE",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SAMPLES_COMPLETED=$($r.samplesCompleted)",
 "AVERAGE_JACCARD=$($r.metrics.averageJaccard)",
 "MAX_ADDED_PER_TRANSITION=$($r.metrics.maxAddedPerTransition)",
 "MAX_REMOVED_PER_TRANSITION=$($r.metrics.maxRemovedPerTransition)",
 "AVERAGE_CORE25_OVERLAP=$($r.metrics.averageCore25Overlap)",
 "STABLE_SYMBOL_COUNT=$($r.metrics.stableSymbolCount)",
 "MAJORITY_SYMBOL_COUNT=$($r.metrics.majoritySymbolCount)",
 "STABILITY_CLASSIFICATION=$($r.stabilityClassification)",
 "RECOMMENDED_ROTATION_CAP=$($r.recommendedRotationCap)",
 "ROTATION_PRODUCTION_ALLOWED=$($r.rotationProductionAllowed)",
 "ISSUES=$(@($r.issues)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6T_DAY7D_SHADOW_COMPARE_$stamp.md"
@"
# S10.6T Day 7D Shadow Compare

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Samples: $($r.samplesCompleted)
- Average Jaccard: $($r.metrics.averageJaccard)
- Max added per transition: $($r.metrics.maxAddedPerTransition)
- Average Core25 overlap: $($r.metrics.averageCore25Overlap)
- Stable symbols: $($r.metrics.stableSymbolCount)
- Stability: $($r.stabilityClassification)
- Recommended rotation cap: $($r.recommendedRotationCap)
- Production rotation allowed: $($r.rotationProductionAllowed)
- Issues: $(@($r.issues)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream symbol mutation.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6T DAY 7D SHADOW COMPARE COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Samples completed: $($r.samplesCompleted)"
Write-Host "Average Jaccard: $($r.metrics.averageJaccard)"
Write-Host "Max added per transition: $($r.metrics.maxAddedPerTransition)"
Write-Host "Average Core25 overlap: $($r.metrics.averageCore25Overlap)"
Write-Host "Stable symbol count: $($r.metrics.stableSymbolCount)"
Write-Host "Majority symbol count: $($r.metrics.majoritySymbolCount)"
Write-Host "Stability: $($r.stabilityClassification)"
Write-Host "Recommended rotation cap: $($r.recommendedRotationCap)"
Write-Host "Production rotation allowed: $($r.rotationProductionAllowed)"
Write-Host "Issues: $(@($r.issues)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Shadow file: $shadowFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Day 7D shadow compare failed"
}
