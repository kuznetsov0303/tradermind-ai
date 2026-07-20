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
New-Item -ItemType Directory -Force -Path $Audit,$State,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7A_50_SYMBOL_CAPACITY_DESIGN_raw_$stamp.json"
$report=Join-Path $Audit "S10_7A_50_SYMBOL_CAPACITY_DESIGN_report_$stamp.txt"
$designFile=Join-Path $State "dynamic_universe_50_symbol_capacity_design_v1.json"

$localSh=Join-Path $env:TEMP "s10_7a_50_symbol_capacity_design_$stamp.sh"
$remoteSh="/tmp/s10_7a_50_symbol_capacity_design_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import math
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

TARGET_CAPACITY=50
DYNAMIC_SLOTS=25

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
        result=float(value)
        return result if math.isfinite(result) else default
    except Exception:
        return default

def valid_symbol(symbol):
    return bool(
        symbol
        and symbol.isalnum()
        and len(symbol)<=5
        and not symbol.endswith(("W","WS","WT"))
    )

watchlist=api_json("http://127.0.0.1:8000/engine/watchlist")
rows=extract_rows(watchlist)

ranked=[]
seen=set(CORE25)

for index,row in enumerate(rows):
    symbol=norm(row.get("symbol") or row.get("ticker"))
    if symbol in seen or not valid_symbol(symbol):
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
        "active":14.0,
        "most_active":14.0,
        "most-active":14.0,
    }.get(bucket,8.0)

    composite=(
        base
        + min(move,100.0)*1.25
        + min(math.log10(max(volume,1.0))*7.0,56.0)
        + bucket_bonus
        - index*0.01
    )

    ranked.append({
        "symbol":symbol,
        "score":round(composite,6),
        "bucket":bucket,
        "changePercent":move,
        "volume":volume,
        "watchIndex":index,
    })

ranked.sort(key=lambda item:(-item["score"],item["symbol"]))

dynamic=ranked[:DYNAMIC_SLOTS]

# If discovery provides fewer than 25 candidates, fill from universe v1.
if len(dynamic)<DYNAMIC_SLOTS:
    universe_path=ENGINE/"data/universe/skilledge_universe_v1_liquid_stocks.json"
    universe=json.loads(universe_path.read_text())
    for row in universe.get("symbols") or []:
        symbol=norm(row if isinstance(row,str) else row.get("symbol"))
        if symbol in seen or not valid_symbol(symbol):
            continue
        seen.add(symbol)
        dynamic.append({
            "symbol":symbol,
            "score":0.0,
            "bucket":"universe_v1_fallback",
            "changePercent":0.0,
            "volume":0.0,
            "watchIndex":None,
        })
        if len(dynamic)>=DYNAMIC_SLOTS:
            break

desired=CORE25+[item["symbol"] for item in dynamic]

design={
    "schemaVersion":1,
    "name":"skilledge_50_symbol_capacity_benchmark_design",
    "createdAt":now_iso(),
    "mode":"design_only",
    "productionEnabled":False,
    "currentVerifiedCapacity":25,
    "targetCapacity":TARGET_CAPACITY,
    "coreSymbols":CORE25,
    "dynamicCandidates":dynamic,
    "desiredSymbols":desired,
    "benchmarkStages":[
        {
            "stage":"PREFLIGHT",
            "required":[
                "current stream healthy",
                "Core25 exact",
                "market/candle parity",
                "negative age count zero",
                "rollback snapshot created",
            ],
        },
        {
            "stage":"50_SYMBOL_CANARY",
            "durationMinutes":30,
            "mutationScope":"market-stream symbols only",
        },
        {
            "stage":"MEASURE",
            "metrics":[
                "eventsPerSecond",
                "processingLagMs",
                "quoteFreshnessP95Seconds",
                "cpuPercent",
                "rssMb",
                "snapshotWriteMs",
                "marketSymbolCount",
                "candleSymbolCount",
                "candleCompletenessPercent",
                "appliedTradesGrowth",
                "providerReconnectCount",
                "providerErrorCount",
                "scannerCycleMs",
                "setupCycleMs",
            ],
        },
        {
            "stage":"DECISION",
            "passCriteria":[
                "stream remains active/running",
                "NRestarts remains zero",
                "exact symbol count remains 50",
                "market/candle symbol sets match",
                "negative age count remains zero",
                "quote freshness remains within session thresholds",
                "appliedTrades grows",
                "no reconnect/error burst",
                "scanner and setup latency remain acceptable",
                "no client/Telegram/paper gate change",
            ],
        },
    ],
    "rolloutPath":[25,50,100,150,259,500,1000],
    "continueBeyond1000":True,
    "stopCondition":"highest capacity that preserves required latency, freshness, completeness, stability and strategy usefulness",
    "fallbackArchitecture":{
        "enabled":True,
        "description":"wide lightweight discovery plus deep MBP-1 analysis on automatically selected live universe",
    },
    "gates":{
        "productionApplyAllowed":False,
        "serviceRestartAllowed":False,
        "systemdEditAllowed":False,
        "paperTradingAllowed":False,
        "clientReleaseAllowed":False,
        "telegramAllowed":False,
    },
    "safety":{
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "subscriptionChanged":False,
    },
}

errors=[]

if len(desired)!=TARGET_CAPACITY:
    errors.append("DESIRED_COUNT_NOT_50")
if len(set(desired))!=TARGET_CAPACITY:
    errors.append("DESIRED_SYMBOLS_NOT_UNIQUE")
if desired[:25]!=CORE25:
    errors.append("CORE25_NOT_PRESERVED")
if len(dynamic)!=DYNAMIC_SLOTS:
    errors.append("DYNAMIC_SLOT_COUNT_NOT_25")
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
        "DAY7D_50_SYMBOL_CAPACITY_BENCHMARK_DESIGN_VALIDATED"
        if ok else "DAY7D_50_SYMBOL_CAPACITY_BENCHMARK_DESIGN_FAILED"
    ),
    "design":design,
    "validationErrors":errors,
    **design["safety"],
    "nextAction":"BUILD_GUARDED_50_SYMBOL_CAPACITY_CANARY_PACKAGE",
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== S10.7A 50-SYMBOL CAPACITY DESIGN ===" -ForegroundColor Green
Write-Host "Design only. No production mutation." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote design validation failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

$r.design|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $designFile -Encoding UTF8

@(
 "S10.7A 50-SYMBOL CAPACITY BENCHMARK DESIGN",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "CURRENT_VERIFIED_CAPACITY=$($r.design.currentVerifiedCapacity)",
 "TARGET_CAPACITY=$($r.design.targetCapacity)",
 "CORE_COUNT=$(@($r.design.coreSymbols).Count)",
 "DYNAMIC_COUNT=$(@($r.design.dynamicCandidates).Count)",
 "DESIRED_COUNT=$(@($r.design.desiredSymbols).Count)",
 "ROLLOUT_PATH=$(@($r.design.rolloutPath)-join '->')",
 "CONTINUE_BEYOND_1000=$($r.design.continueBeyond1000)",
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

$milestone=Join-Path $Milestones "S10_7A_50_SYMBOL_CAPACITY_DESIGN_$stamp.md"
@"
# S10.7A 50-Symbol Capacity Benchmark Design

- OK: $($r.ok)
- Classification: $($r.classification)
- Current verified capacity: $($r.design.currentVerifiedCapacity)
- Target capacity: $($r.design.targetCapacity)
- Core count: $(@($r.design.coreSymbols).Count)
- Dynamic count: $(@($r.design.dynamicCandidates).Count)
- Desired count: $(@($r.design.desiredSymbols).Count)
- Rollout path: $(@($r.design.rolloutPath)-join ' → ')
- Continue beyond 1000: $($r.design.continueBeyond1000)
- Production apply allowed: $($r.design.gates.productionApplyAllowed)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7A COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Current verified capacity: $($r.design.currentVerifiedCapacity)"
Write-Host "Target capacity: $($r.design.targetCapacity)"
Write-Host "Core count: $(@($r.design.coreSymbols).Count)"
Write-Host "Dynamic count: $(@($r.design.dynamicCandidates).Count)"
Write-Host "Desired count: $(@($r.design.desiredSymbols).Count)"
Write-Host "Rollout path: $(@($r.design.rolloutPath)-join ' -> ')"
Write-Host "Continue beyond 1000: $($r.design.continueBeyond1000)"
Write-Host "Production apply allowed: $($r.design.gates.productionApplyAllowed)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Design: $designFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "50-symbol capacity design failed"
}
