param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
New-Item -ItemType Directory -Force -Path $Audit|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6H_PREMARKET_PREFLIGHT_raw_$stamp.json"
$report=Join-Path $Audit "S10_6H_PREMARKET_PREFLIGHT_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6h_preflight_$stamp.sh"
$remoteSh="/tmp/s10_6h_preflight_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/skilledge/stock-engine

.venv/bin/python - <<'PY'
import json, subprocess, time
from datetime import datetime, time as dtime
from pathlib import Path
from zoneinfo import ZoneInfo

paths={
 "status":Path("data/market_stream_status.json"),
 "market":Path("data/market_state_snapshot.json"),
 "candles":Path("data/candle_indicator_snapshot.json"),
 "scanner":Path("data/scanner_snapshot.json"),
}

def read(p):
    return json.loads(p.read_text()) if p.exists() else None

def total(x):
    return sum(int(v) for v in (x or {}).values())

def svc():
    p=subprocess.run([
      "systemctl","show","skilledge-market-stream.service",
      "--property=ActiveState,SubState,Result,MainPID,NRestarts"
    ],capture_output=True,text=True)
    return p.stdout.strip()

ny=datetime.now(ZoneInfo("America/New_York"))
premarket=ny.weekday()<5 and dtime(4,0)<=ny.time()<dtime(9,30)
regular=ny.weekday()<5 and dtime(9,30)<=ny.time()<dtime(16,0)
after=ny.weekday()<5 and dtime(16,0)<=ny.time()<dtime(20,0)
session="REGULAR" if regular else "PREMARKET" if premarket else "AFTERHOURS" if after else "CLOSED"

before={k:read(v) for k,v in paths.items()}
rb=total((before["status"] or {}).get("rawRecordCounts"))
eb=total((before["status"] or {}).get("marketEventCounts"))
tb=int((before["candles"] or {}).get("appliedTrades",0))

time.sleep(20)

after_data={k:read(v) for k,v in paths.items()}
ra=total((after_data["status"] or {}).get("rawRecordCounts"))
ea=total((after_data["status"] or {}).get("marketEventCounts"))
ta=int((after_data["candles"] or {}).get("appliedTrades",0))
service=svc()
active="ActiveState=active" in service and "SubState=running" in service
scanner_items=(after_data["scanner"] or {}).get("items") or []
symbols=sorted(set(((after_data["market"] or {}).get("symbols") or {}).keys()) | {i.get("symbol") for i in scanner_items if i.get("symbol")})
qualities=sorted({(i.get("quote") or {}).get("quality") for i in scanner_items if (i.get("quote") or {}).get("quality")})

snapshots_ok=all(isinstance(after_data[k],dict) for k in ("status","market","candles","scanner"))
ok=active and snapshots_ok

print(json.dumps({
 "ok":ok,
 "classification":f"{session}_LIVE_PREFLIGHT_VERIFIED" if ok else f"{session}_LIVE_PREFLIGHT_FAILED",
 "inspectionOnly":True,
 "productionMutation":False,
 "serviceRestarted":False,
 "paperTouched":False,
 "apiAppTouched":False,
 "strategyEngineTouched":False,
 "telegramTouched":False,
 "clientGatesTouched":False,
 "newYorkTime":ny.isoformat(),
 "session":session,
 "serviceActive":active,
 "serviceShow":service,
 "rawGrowth":ra-rb,
 "eventGrowth":ea-eb,
 "tradeGrowth":ta-tb,
 "scannerItems":len(scanner_items),
 "liveSymbols":symbols,
 "quoteQualitiesObserved":qualities,
 "regularSessionProofPending":not regular,
 "statusAfter":after_data["status"],
 "marketAfter":after_data["market"],
 "candlesAfter":after_data["candles"],
 "scannerAfter":after_data["scanner"],
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD PREMARKET PREFLIGHT ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN READ-ONLY LIVE PREFLIGHT ===" -ForegroundColor Green
Write-Host "Waiting 20 seconds to measure live growth..." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote preflight failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6H PREMARKET LIVE PREFLIGHT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "NEW_YORK_TIME=$($r.newYorkTime)",
 "SESSION=$($r.session)",
 "SERVICE_ACTIVE=$($r.serviceActive)",
 "RAW_GROWTH=$($r.rawGrowth)",
 "EVENT_GROWTH=$($r.eventGrowth)",
 "TRADE_GROWTH=$($r.tradeGrowth)",
 "SCANNER_ITEMS=$($r.scannerItems)",
 "LIVE_SYMBOLS=$(@($r.liveSymbols)-join ',')",
 "QUOTE_QUALITIES=$(@($r.quoteQualitiesObserved)-join ',')",
 "REGULAR_SESSION_PROOF_PENDING=$($r.regularSessionProofPending)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "PAPER_TOUCHED=$($r.paperTouched)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6H LIVE PREFLIGHT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "New York time: $($r.newYorkTime)"
Write-Host "Session: $($r.session)"
Write-Host "Service active: $($r.serviceActive)"
Write-Host "Raw growth: $($r.rawGrowth)"
Write-Host "Event growth: $($r.eventGrowth)"
Write-Host "Trade growth: $($r.tradeGrowth)"
Write-Host "Scanner items: $($r.scannerItems)"
Write-Host "Live symbols: $(@($r.liveSymbols)-join ', ')"
Write-Host "Quote qualities: $(@($r.quoteQualitiesObserved)-join ', ')"
Write-Host "Regular-session proof pending: $($r.regularSessionProofPending)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"

if(-not $r.ok){throw "Premarket preflight failed"}
