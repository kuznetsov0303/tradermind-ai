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
$raw=Join-Path $Audit "S10_6P_DAY7C_RESTART_CONTINUITY_raw_$stamp.json"
$report=Join-Path $Audit "S10_6P_DAY7C_RESTART_CONTINUITY_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6p_restart_continuity_$stamp.sh"
$remoteSh="/tmp/s10_6p_restart_continuity_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="skilledge-market-stream.service"
SNAPSHOT="$ENGINE/data/candle_indicator_snapshot.json"

cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import subprocess
import time
from decimal import Decimal
from pathlib import Path

unit="skilledge-market-stream.service"
snapshot_path=Path("/opt/skilledge/stock-engine/data/candle_indicator_snapshot.json")

def read_snapshot():
    return json.loads(snapshot_path.read_text(encoding="utf-8"))

def show():
    p=subprocess.run([
        "systemctl","show",unit,
        "--property=ActiveState,SubState,Result,MainPID,NRestarts"
    ],capture_output=True,text=True,check=False)
    return p.stdout.strip()

def pid():
    p=subprocess.run(
        ["systemctl","show",unit,"-p","MainPID","--value"],
        capture_output=True,text=True,check=False
    )
    return int(p.stdout.strip() or 0)

before=read_snapshot()
before_pid=pid()
before_symbols=before.get("symbols") or {}

before_core={}
for symbol,row in before_symbols.items():
    before_core[symbol]={
        "sessionVolume":int(row.get("sessionVolume") or 0),
        "vwap":row.get("vwap"),
        "highOfDay":row.get("highOfDay"),
        "lowOfDay":row.get("lowOfDay"),
        "openingRange5m":row.get("openingRange5m"),
        "ema20_5m":row.get("ema20_5m"),
        "atr14_5m":row.get("atr14_5m"),
        "intervals":row.get("intervals"),
    }

subprocess.run(["systemctl","restart",unit],check=True)
time.sleep(12)

after_restart=read_snapshot()
after_restart_pid=pid()
after_restart_symbols=after_restart.get("symbols") or {}

time.sleep(30)

after_live=read_snapshot()
after_live_symbols=after_live.get("symbols") or {}
service=show()

def dec(value):
    return Decimal(str(value)) if value is not None else None

checks={}
failures=[]

all_symbols=sorted(set(before_symbols) | set(after_restart_symbols) | set(after_live_symbols))

for symbol in all_symbols:
    b=before_core.get(symbol) or {}
    r=after_restart_symbols.get(symbol) or {}
    l=after_live_symbols.get(symbol) or {}

    bvol=int(b.get("sessionVolume") or 0)
    rvol=int(r.get("sessionVolume") or 0)
    lvol=int(l.get("sessionVolume") or 0)

    b_hod=dec(b.get("highOfDay"))
    r_hod=dec(r.get("highOfDay"))
    l_hod=dec(l.get("highOfDay"))

    b_lod=dec(b.get("lowOfDay"))
    r_lod=dec(r.get("lowOfDay"))
    l_lod=dec(l.get("lowOfDay"))

    volume_preserved=rvol>=bvol and lvol>=rvol
    hod_preserved=(
        b_hod is None
        or (r_hod is not None and r_hod>=b_hod)
    ) and (
        r_hod is None
        or (l_hod is not None and l_hod>=r_hod)
    )
    lod_preserved=(
        b_lod is None
        or (r_lod is not None and r_lod<=b_lod)
    ) and (
        r_lod is None
        or (l_lod is not None and l_lod<=r_lod)
    )

    age=l.get("lastTradeAgeSeconds")
    age_ok=(age is None or float(age)>=0)

    opening_before=b.get("openingRange5m") or {}
    opening_restart=r.get("openingRange5m") or {}
    opening_preserved=True
    if opening_before.get("high") is not None or opening_before.get("low") is not None:
        opening_preserved=(
            opening_restart.get("high")==opening_before.get("high")
            and opening_restart.get("low")==opening_before.get("low")
        )

    symbol_ok=all([
        volume_preserved,
        hod_preserved,
        lod_preserved,
        age_ok,
        opening_preserved,
    ])

    checks[symbol]={
        "ok":symbol_ok,
        "volumeBefore":bvol,
        "volumeAfterRestart":rvol,
        "volumeAfterLiveWindow":lvol,
        "vwapBefore":b.get("vwap"),
        "vwapAfterRestart":r.get("vwap"),
        "vwapAfterLiveWindow":l.get("vwap"),
        "hodBefore":b.get("highOfDay"),
        "hodAfterRestart":r.get("highOfDay"),
        "hodAfterLiveWindow":l.get("highOfDay"),
        "lodBefore":b.get("lowOfDay"),
        "lodAfterRestart":r.get("lowOfDay"),
        "lodAfterLiveWindow":l.get("lowOfDay"),
        "openingRangeBefore":opening_before,
        "openingRangeAfterRestart":opening_restart,
        "lastTradeAgeAfterLiveWindow":age,
        "volumePreserved":volume_preserved,
        "hodPreserved":hod_preserved,
        "lodPreserved":lod_preserved,
        "openingRangePreserved":opening_preserved,
        "lastTradeAgeNonNegative":age_ok,
    }

    if not symbol_ok:
        failures.append(symbol)

service_ok=(
    "ActiveState=active" in service
    and "SubState=running" in service
    and "NRestarts=0" in service
)
pid_changed=before_pid>0 and after_restart_pid>0 and before_pid!=after_restart_pid
count_ok=(
    len(before_symbols)==25
    and len(after_restart_symbols)==25
    and len(after_live_symbols)==25
)
applied_preserved=(
    int(after_restart.get("appliedTrades") or 0)
    >= int(before.get("appliedTrades") or 0)
)
applied_growth=(
    int(after_live.get("appliedTrades") or 0)
    - int(after_restart.get("appliedTrades") or 0)
)

ok=all([
    service_ok,
    pid_changed,
    count_ok,
    applied_preserved,
    applied_growth>0,
    len(failures)==0,
])

print(json.dumps({
    "ok":ok,
    "classification":(
        "DAY7C_RESTART_CONTINUITY_VERIFIED"
        if ok else "DAY7C_RESTART_CONTINUITY_FAILED"
    ),
    "productionMutation":False,
    "serviceRestarted":True,
    "paperTouched":False,
    "apiAppTouched":False,
    "strategyEngineTouched":False,
    "telegramTouched":False,
    "clientGatesTouched":False,
    "beforePid":before_pid,
    "afterRestartPid":after_restart_pid,
    "pidChanged":pid_changed,
    "serviceShow":service,
    "serviceHealthy":service_ok,
    "beforeSymbolCount":len(before_symbols),
    "afterRestartSymbolCount":len(after_restart_symbols),
    "afterLiveSymbolCount":len(after_live_symbols),
    "symbolCountsVerified":count_ok,
    "appliedTradesBefore":int(before.get("appliedTrades") or 0),
    "appliedTradesAfterRestart":int(after_restart.get("appliedTrades") or 0),
    "appliedTradesAfterLiveWindow":int(after_live.get("appliedTrades") or 0),
    "appliedTradesPreserved":applied_preserved,
    "appliedTradesGrowth":applied_growth,
    "failedSymbols":failures,
    "allSymbolsContinuityVerified":len(failures)==0,
    "symbolChecks":checks,
    "openingRangeHistoricalBackfillCompleted":False,
    "scannerResearchOnly":True,
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7C RESTART CONTINUITY PROOF ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN CONTROLLED STREAM RESTART CONTINUITY PROOF ===" -ForegroundColor Green
Write-Host "No code deploy. Only market-stream restart." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
    throw "Remote continuity proof failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6P DAY 7C RESTART CONTINUITY",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "BEFORE_PID=$($r.beforePid)",
 "AFTER_RESTART_PID=$($r.afterRestartPid)",
 "PID_CHANGED=$($r.pidChanged)",
 "SERVICE_HEALTHY=$($r.serviceHealthy)",
 "BEFORE_SYMBOL_COUNT=$($r.beforeSymbolCount)",
 "AFTER_RESTART_SYMBOL_COUNT=$($r.afterRestartSymbolCount)",
 "AFTER_LIVE_SYMBOL_COUNT=$($r.afterLiveSymbolCount)",
 "APPLIED_TRADES_PRESERVED=$($r.appliedTradesPreserved)",
 "APPLIED_TRADES_GROWTH=$($r.appliedTradesGrowth)",
 "ALL_SYMBOLS_CONTINUITY_VERIFIED=$($r.allSymbolsContinuityVerified)",
 "FAILED_SYMBOLS=$(@($r.failedSymbols)-join ',')",
 "OPENING_RANGE_HISTORICAL_BACKFILL_COMPLETED=$($r.openingRangeHistoricalBackfillCompleted)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "PAPER_TOUCHED=$($r.paperTouched)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6P_DAY7C_RESTART_CONTINUITY_$stamp.md"
@"
# S10.6P Day 7C Restart Continuity

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- PID changed: $($r.pidChanged)
- Service healthy: $($r.serviceHealthy)
- Symbols before/restart/live: $($r.beforeSymbolCount) / $($r.afterRestartSymbolCount) / $($r.afterLiveSymbolCount)
- Applied trades preserved: $($r.appliedTradesPreserved)
- Applied trades growth: $($r.appliedTradesGrowth)
- All symbols continuity verified: $($r.allSymbolsContinuityVerified)
- Failed symbols: $(@($r.failedSymbols)-join ', ')

No code deployment.
Only market-stream service restarted.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6P RESTART CONTINUITY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "PID changed: $($r.pidChanged)"
Write-Host "Service healthy: $($r.serviceHealthy)"
Write-Host "Symbols before/restart/live: $($r.beforeSymbolCount) / $($r.afterRestartSymbolCount) / $($r.afterLiveSymbolCount)"
Write-Host "Applied trades preserved: $($r.appliedTradesPreserved)"
Write-Host "Applied trades growth: $($r.appliedTradesGrowth)"
Write-Host "All symbols continuity verified: $($r.allSymbolsContinuityVerified)"
Write-Host "Failed symbols: $(@($r.failedSymbols)-join ', ')"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
    throw "Restart continuity proof failed"
}
