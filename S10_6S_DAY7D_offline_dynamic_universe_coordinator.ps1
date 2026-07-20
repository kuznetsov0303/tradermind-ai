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
$raw=Join-Path $Audit "S10_6S_DAY7D_OFFLINE_COORDINATOR_raw_$stamp.json"
$report=Join-Path $Audit "S10_6S_DAY7D_OFFLINE_COORDINATOR_report_$stamp.txt"
$generationFile=Join-Path $State "dynamic_universe_generation_preview_v1.json"
$localSh=Join-Path $env:TEMP "s10_6s_offline_coordinator_$stamp.sh"
$remoteSh="/tmp/s10_6s_offline_coordinator_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6s_offline_coordinator"
rm -rf "$WORK"
mkdir -p "$WORK"

cat > "$WORK/offline_coordinator.py" <<'PY'
from __future__ import annotations

import hashlib
import json
import math
import re
import urllib.request
from dataclasses import dataclass
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

@dataclass(frozen=True)
class Candidate:
    symbol:str
    source:str
    score:float
    protected:bool=False
    reasons:tuple[str,...]=()

def now_iso()->str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def load_json(path:Path)->dict[str,Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def api_json(url:str)->Any:
    try:
        with urllib.request.urlopen(url,timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return {"_error":str(exc)}

def norm_symbol(value:Any)->str:
    return str(value or "").strip().upper()

def tradeable(symbol:str)->bool:
    return bool(
        symbol
        and symbol not in BLOCKED
        and re.fullmatch(r"[A-Z0-9]{1,5}",symbol)
        and not symbol.endswith(("W","WS","WT","U","UN","R"))
    )

def num(value:Any,default:float=0.0)->float:
    try:
        out=float(value)
        return out if math.isfinite(out) else default
    except Exception:
        return default

def extract_watchlist_rows(payload:Any)->list[dict[str,Any]]:
    if isinstance(payload,list):
        return [row for row in payload if isinstance(row,dict)]
    if not isinstance(payload,dict):
        return []
    for key in ("watchlist","items","rows","data","candidates"):
        value=payload.get(key)
        if isinstance(value,list):
            return [row for row in value if isinstance(row,dict)]
    return []

def discovery_candidates(rows:list[dict[str,Any]])->list[Candidate]:
    out=[]
    for index,row in enumerate(rows):
        symbol=norm_symbol(row.get("symbol") or row.get("ticker"))
        if not tradeable(symbol):
            continue

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
        source_bucket=str(
            row.get("sourceBucket")
            or row.get("bucket")
            or "watchlist"
        ).lower()

        bucket_bonus={
            "gainers":18.0,
            "losers":18.0,
            "most_active":14.0,
            "most-active":14.0,
        }.get(source_bucket,8.0)

        composite=(
            score
            + min(change,100.0)*1.25
            + min(math.log10(max(volume,1.0))*7.0,56.0)
            + bucket_bonus
            - index*0.01
        )

        status=str(row.get("status") or "").upper()
        protected=status in {"ACTIVE","ARMED"}

        out.append(Candidate(
            symbol=symbol,
            source="discovery",
            score=round(composite,6),
            protected=protected,
            reasons=(
                f"bucket:{source_bucket}",
                f"change:{change}",
                f"volume:{volume}",
                f"watchIndex:{index}",
            ),
        ))
    return out

def universe_candidates(
    payload:dict[str,Any],
    source:str,
    base_score:float,
)->list[Candidate]:
    rows=payload.get("symbols") or []
    out=[]
    for index,row in enumerate(rows):
        if isinstance(row,str):
            symbol=norm_symbol(row)
            meta={}
        elif isinstance(row,dict):
            symbol=norm_symbol(row.get("symbol") or row.get("ticker"))
            meta=row
        else:
            continue

        if not tradeable(symbol):
            continue

        avg_volume=num(
            meta.get("avgVolume")
            or meta.get("averageVolume")
            or meta.get("volume"),
            0.0,
        )
        market_cap=num(meta.get("marketCap") or meta.get("market_cap"),0.0)
        float_shares=num(meta.get("floatShares") or meta.get("float"),0.0)

        liquidity_bonus=min(math.log10(max(avg_volume,1.0))*5.0,40.0)
        cap_bonus=min(math.log10(max(market_cap,1.0))*1.5,22.0)
        low_float_bonus=6.0 if 0<float_shares<=50_000_000 else 0.0

        score=base_score+liquidity_bonus+cap_bonus+low_float_bonus-index*0.001

        out.append(Candidate(
            symbol=symbol,
            source=source,
            score=round(score,6),
            reasons=(
                f"avgVolume:{avg_volume}",
                f"marketCap:{market_cap}",
                f"floatShares:{float_shares}",
                f"sourceIndex:{index}",
            ),
        ))
    return out

def build_generation(
    watchlist_payload:Any,
    universe_v1:dict[str,Any],
    universe_v2:dict[str,Any],
)->dict[str,Any]:
    rows=extract_watchlist_rows(watchlist_payload)

    pool:list[Candidate]=[]

    # Core stays as fallback and continuity anchor, but can be displaced
    # only by materially stronger discovery candidates in offline preview.
    for index,symbol in enumerate(CORE25):
        pool.append(Candidate(
            symbol=symbol,
            source="core25",
            score=100.0-index*0.001,
            reasons=("verified_core_fallback",),
        ))

    pool.extend(discovery_candidates(rows))
    pool.extend(universe_candidates(universe_v1,"universe_v1",55.0))
    pool.extend(universe_candidates(universe_v2,"universe_v2",60.0))

    best:dict[str,Candidate]={}
    source_map:dict[str,set[str]]={}

    for candidate in pool:
        source_map.setdefault(candidate.symbol,set()).add(candidate.source)
        current=best.get(candidate.symbol)
        if current is None:
            best[candidate.symbol]=candidate
            continue
        if candidate.protected and not current.protected:
            best[candidate.symbol]=candidate
            continue
        if candidate.protected==current.protected and candidate.score>current.score:
            best[candidate.symbol]=candidate

    ranked=sorted(
        best.values(),
        key=lambda item:(
            not item.protected,
            -item.score,
            item.symbol,
        ),
    )

    selected=ranked[:CAPACITY]
    desired=[item.symbol for item in selected]
    current=CORE25[:]

    added=[symbol for symbol in desired if symbol not in current]
    retained=[symbol for symbol in desired if symbol in current]
    removed=[symbol for symbol in current if symbol not in desired]

    rows_out=[]
    for rank,item in enumerate(selected,1):
        rows_out.append({
            "rank":rank,
            "symbol":item.symbol,
            "score":item.score,
            "selectedSource":item.source,
            "allSources":sorted(source_map.get(item.symbol,set())),
            "protected":item.protected,
            "reasons":list(item.reasons),
        })

    source_fingerprint={
        "watchlistRows":len(rows),
        "universeV1Rows":len(universe_v1.get("symbols") or []),
        "universeV2Rows":len(universe_v2.get("symbols") or []),
    }

    canonical={
        "capacity":CAPACITY,
        "desiredSymbols":desired,
        "addedSymbols":added,
        "retainedSymbols":retained,
        "removedSymbols":removed,
        "selected":rows_out,
        "sourceFingerprint":source_fingerprint,
        "researchOnly":True,
        "clientReleaseAllowed":False,
        "telegramAllowed":False,
        "productionApplyAllowed":False,
    }

    payload=json.dumps(
        canonical,
        sort_keys=True,
        separators=(",",":"),
    ).encode("utf-8")

    generation_id=hashlib.sha256(payload).hexdigest()[:20]

    return {
        "schemaVersion":1,
        "generationId":generation_id,
        "createdAt":now_iso(),
        **canonical,
    }

def validate_generation(generation:dict[str,Any])->list[str]:
    errors=[]
    desired=generation.get("desiredSymbols") or []

    if len(desired)!=CAPACITY:
        errors.append("CAPACITY_NOT_25")
    if len(set(desired))!=len(desired):
        errors.append("DUPLICATE_SYMBOLS")
    if any(not tradeable(symbol) for symbol in desired):
        errors.append("UNTRADEABLE_SYMBOL_SELECTED")
    if not generation.get("researchOnly"):
        errors.append("RESEARCH_ONLY_REQUIRED")
    if generation.get("clientReleaseAllowed"):
        errors.append("CLIENT_RELEASE_MUST_BE_FALSE")
    if generation.get("telegramAllowed"):
        errors.append("TELEGRAM_MUST_BE_FALSE")
    if generation.get("productionApplyAllowed"):
        errors.append("PRODUCTION_APPLY_MUST_BE_FALSE")
    return errors

def main():
    watchlist=api_json("http://127.0.0.1:8000/engine/watchlist")
    universe_v1=load_json(
        ENGINE/"data/universe/skilledge_universe_v1_liquid_stocks.json"
    )
    universe_v2=load_json(
        ENGINE/"data/universe/skilledge_universe_v2_market_cap_buckets.json"
    )

    first=build_generation(watchlist,universe_v1,universe_v2)
    second=build_generation(watchlist,universe_v1,universe_v2)

    errors=validate_generation(first)

    deterministic=(
        first["generationId"]==second["generationId"]
        and first["desiredSymbols"]==second["desiredSymbols"]
        and first["selected"]==second["selected"]
    )
    if not deterministic:
        errors.append("NON_DETERMINISTIC_OUTPUT")

    watchlist_error=(
        watchlist.get("_error")
        if isinstance(watchlist,dict)
        else None
    )

    ok=not errors

    print(json.dumps({
        "ok":ok,
        "classification":(
            "DAY7D_OFFLINE_COORDINATOR_VALIDATED"
            if ok else "DAY7D_OFFLINE_COORDINATOR_FAILED"
        ),
        "generation":first,
        "deterministic":deterministic,
        "validationErrors":errors,
        "watchlistReadError":watchlist_error,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "paperTouched":False,
        "apiAppTouched":False,
        "strategyEngineTouched":False,
        "telegramTouched":False,
        "clientGatesTouched":False,
        "nextAction":"RUN_DYNAMIC_UNIVERSE_SHADOW_COMPARE",
    },ensure_ascii=False))

if __name__=="__main__":
    main()
PY

cat > "$WORK/test_offline_coordinator.py" <<'PY'
import unittest
from offline_coordinator import (
    CORE25,
    CAPACITY,
    build_generation,
    validate_generation,
)

class OfflineCoordinatorTests(unittest.TestCase):
    def fixtures(self):
        watchlist={
            "items":[
                {
                    "symbol":"XYZ",
                    "score":99,
                    "changePercent":45,
                    "volume":25_000_000,
                    "sourceBucket":"gainers",
                },
                {
                    "symbol":"XYZ",
                    "score":80,
                    "changePercent":20,
                    "volume":10_000_000,
                    "sourceBucket":"most_active",
                },
                {
                    "symbol":"ABCW",
                    "score":100,
                    "changePercent":80,
                    "volume":100_000_000,
                    "sourceBucket":"gainers",
                },
            ]
        }
        universe_v1={
            "symbols":[
                {"symbol":symbol,"avgVolume":1_000_000}
                for symbol in CORE25
            ]
        }
        universe_v2={
            "symbols":[
                {
                    "symbol":"XYZ",
                    "avgVolume":20_000_000,
                    "marketCap":500_000_000,
                    "floatShares":10_000_000,
                }
            ]
        }
        return watchlist,universe_v1,universe_v2

    def test_capacity_dedup_and_gates(self):
        generation=build_generation(*self.fixtures())
        self.assertEqual(len(generation["desiredSymbols"]),CAPACITY)
        self.assertEqual(
            len(generation["desiredSymbols"]),
            len(set(generation["desiredSymbols"])),
        )
        self.assertFalse(generation["clientReleaseAllowed"])
        self.assertFalse(generation["telegramAllowed"])
        self.assertFalse(generation["productionApplyAllowed"])
        self.assertEqual(validate_generation(generation),[])

    def test_deterministic(self):
        fixtures=self.fixtures()
        first=build_generation(*fixtures)
        second=build_generation(*fixtures)
        self.assertEqual(first["generationId"],second["generationId"])
        self.assertEqual(first["desiredSymbols"],second["desiredSymbols"])
        self.assertEqual(first["selected"],second["selected"])

    def test_untradeable_warrant_filtered(self):
        generation=build_generation(*self.fixtures())
        self.assertNotIn("ABCW",generation["desiredSymbols"])

if __name__=="__main__":
    unittest.main()
PY

set +e
cd "$WORK"
PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m py_compile \
  "$WORK/offline_coordinator.py" \
  "$WORK/test_offline_coordinator.py" \
  > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m unittest -v \
  test_offline_coordinator \
  > "$WORK/tests.txt" 2>&1
TEST_RC=$?

PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" \
  "$WORK/offline_coordinator.py" \
  > "$WORK/result.json" 2> "$WORK/runtime.err"
RUN_RC=$?
set -e

export WORK COMPILE_RC TEST_RC RUN_RC

"$ENGINE/.venv/bin/python" - <<'PY'
import json
import os
from pathlib import Path

work=Path(os.environ["WORK"])
compile_rc=int(os.environ["COMPILE_RC"])
test_rc=int(os.environ["TEST_RC"])
run_rc=int(os.environ["RUN_RC"])

compile_output=(work/"compile.txt").read_text(
    encoding="utf-8",errors="replace"
)
test_output=(work/"tests.txt").read_text(
    encoding="utf-8",errors="replace"
)
runtime_error=(work/"runtime.err").read_text(
    encoding="utf-8",errors="replace"
)

result={}
if run_rc==0:
    try:
        result=json.loads((work/"result.json").read_text(encoding="utf-8"))
    except Exception as exc:
        runtime_error+=f"\nJSON parse failed: {exc}"

ok=(
    compile_rc==0
    and test_rc==0
    and run_rc==0
    and bool(result.get("ok"))
)

if not ok:
    print(json.dumps({
        "ok":False,
        "classification":"DAY7D_OFFLINE_COORDINATOR_FAILED",
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
        "nextAction":"FIX_OFFLINE_COORDINATOR_IN_ISOLATION",
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
Write-Host "=== UPLOAD DAY 7D OFFLINE COORDINATOR ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== BUILD + TEST OFFLINE COORDINATOR IN /tmp ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no systemd or stream mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote offline coordinator failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

if($r.generation){
  $r.generation|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $generationFile -Encoding UTF8
}

@(
 "S10.6S DAY 7D OFFLINE COORDINATOR",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "COMPILE_RETURN_CODE=$($r.compileReturnCode)",
 "TEST_RETURN_CODE=$($r.testReturnCode)",
 "RUN_RETURN_CODE=$($r.runReturnCode)",
 "DETERMINISTIC=$($r.deterministic)",
 "GENERATION_ID=$($r.generation.generationId)",
 "CAPACITY=$($r.generation.capacity)",
 "DESIRED_SYMBOL_COUNT=$(@($r.generation.desiredSymbols).Count)",
 "ADDED_SYMBOLS=$(@($r.generation.addedSymbols)-join ',')",
 "REMOVED_SYMBOLS=$(@($r.generation.removedSymbols)-join ',')",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "NEXT_ACTION=$($r.nextAction)",
 "GENERATION_FILE=$generationFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6S_DAY7D_OFFLINE_COORDINATOR_$stamp.md"
@"
# S10.6S Day 7D Offline Coordinator

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Compile RC: $($r.compileReturnCode)
- Test RC: $($r.testReturnCode)
- Run RC: $($r.runReturnCode)
- Deterministic: $($r.deterministic)
- Generation ID: $($r.generation.generationId)
- Capacity: $($r.generation.capacity)
- Desired symbols: $(@($r.generation.desiredSymbols).Count)
- Added: $(@($r.generation.addedSymbols)-join ', ')
- Removed: $(@($r.generation.removedSymbols)-join ', ')
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No deployment.
No service restart.
No systemd edit.
No stream symbol mutation.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6S DAY 7D OFFLINE COORDINATOR COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Compile RC: $($r.compileReturnCode)"
Write-Host "Test RC: $($r.testReturnCode)"
Write-Host "Run RC: $($r.runReturnCode)"
Write-Host "Deterministic: $($r.deterministic)"
Write-Host "Generation ID: $($r.generation.generationId)"
Write-Host "Capacity: $($r.generation.capacity)"
Write-Host "Desired symbol count: $(@($r.generation.desiredSymbols).Count)"
Write-Host "Added symbols: $(@($r.generation.addedSymbols)-join ', ')"
Write-Host "Removed symbols: $(@($r.generation.removedSymbols)-join ', ')"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Stream symbols changed: $($r.streamSymbolsChanged)"
Write-Host "Systemd touched: $($r.systemdTouched)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Generation preview: $generationFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Day 7D offline coordinator failed"
}
