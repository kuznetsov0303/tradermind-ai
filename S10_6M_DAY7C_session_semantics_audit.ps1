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
$raw=Join-Path $Audit "S10_6M_DAY7C_SEMANTIC_AUDIT_raw_$stamp.json"
$report=Join-Path $Audit "S10_6M_DAY7C_SEMANTIC_AUDIT_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6m_semantic_audit_$stamp.sh"
$remoteSh="/tmp/s10_6m_semantic_audit_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
export ENGINE
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import ast
import hashlib
import json
import re
import subprocess
from pathlib import Path

engine=Path("/opt/skilledge/stock-engine")
files={
 "candleEngine":engine/"app/market_data/candle_engine.py",
 "marketState":engine/"app/market_data/market_state.py",
 "streamService":engine/"app/market_data/stream_service.py",
}
snapshots={
 "candles":engine/"data/candle_indicator_snapshot.json",
 "market":engine/"data/market_state_snapshot.json",
 "scanner":engine/"data/scanner_snapshot.json",
 "status":engine/"data/market_stream_status.json",
}

def sha256(path):
    if not path.exists():
        return None
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

def source_extract(path, patterns, context=5):
    if not path.exists():
        return []
    lines=path.read_text(encoding="utf-8",errors="replace").splitlines()
    hits=[]
    for index,line in enumerate(lines):
        if any(re.search(pattern,line,re.I) for pattern in patterns):
            start=max(0,index-context)
            end=min(len(lines),index+context+1)
            hits.append({
              "line":index+1,
              "match":line.strip(),
              "context":[
                {"line":i+1,"text":lines[i]}
                for i in range(start,end)
              ],
            })
    return hits

candles=read_json(snapshots["candles"]) or {}
market=read_json(snapshots["market"]) or {}
scanner=read_json(snapshots["scanner"]) or {}
status=read_json(snapshots["status"]) or {}

candle_symbols=candles.get("symbols") or {}
market_symbols=market.get("symbols") or {}

negative_age={
 symbol:data.get("lastTradeAgeSeconds")
 for symbol,data in candle_symbols.items()
 if isinstance(data.get("lastTradeAgeSeconds"),(int,float))
 and data.get("lastTradeAgeSeconds")<0
}

opening_range_missing={
 symbol:(data.get("openingRange5m") or {})
 for symbol,data in candle_symbols.items()
 if not (data.get("openingRange5m") or {}).get("complete")
}

session_volume_deltas={}
for symbol,candle in candle_symbols.items():
    cvol=int(candle.get("sessionVolume") or 0)
    mvol=int((market_symbols.get(symbol) or {}).get("sessionVolume") or 0)
    if cvol!=mvol:
        session_volume_deltas[symbol]={"candle":cvol,"market":mvol,"delta":cvol-mvol}

source_findings={
 "candleEngine":source_extract(files["candleEngine"],[
   r"lastTradeAgeSeconds",r"last_trade",r"openingRange",r"opening_range",
   r"roll_session",r"tradingDate",r"sessionVolume",r"vwap"
 ]),
 "marketState":source_extract(files["marketState"],[
   r"roll_session",r"tradingDate",r"sessionVolume",r"lastEventAt",
   r"lastReceiveAt",r"fresh"
 ]),
 "streamService":source_extract(files["streamService"],[
   r"CandleIndicatorEngine",r"MarketStateEngine",r"snapshot",
   r"bootstrap",r"backfill",r"history",r"restore"
 ]),
}

bootstrap_terms={}
for name,path in files.items():
    text=path.read_text(encoding="utf-8",errors="replace") if path.exists() else ""
    bootstrap_terms[name]={
      term:bool(re.search(term,text,re.I))
      for term in ["bootstrap","backfill","restore","load_snapshot","hydrate","replay"]
    }

service=subprocess.run([
 "systemctl","show","skilledge-market-stream.service",
 "--property=ActiveState,SubState,MainPID,NRestarts"
],capture_output=True,text=True,check=False)

issues=[]
if negative_age:
    issues.append("NEGATIVE_LAST_TRADE_AGE")
if opening_range_missing:
    issues.append("OPENING_RANGE_MISSING_AFTER_MIDSESSION_RESTART")
if not any(any(values.values()) for values in bootstrap_terms.values()):
    issues.append("NO_EXPLICIT_BOOTSTRAP_OR_RESTORE_PATH_FOUND")
if session_volume_deltas:
    issues.append("MARKET_AND_CANDLE_SESSION_VOLUME_DIVERGENCE")

ok=(
 files["candleEngine"].exists()
 and files["marketState"].exists()
 and files["streamService"].exists()
 and "ActiveState=active" in service.stdout
 and "SubState=running" in service.stdout
)

print(json.dumps({
 "ok":ok,
 "classification":"DAY7C_SESSION_SEMANTICS_GAPS_CONFIRMED" if issues else "DAY7C_SESSION_SEMANTICS_CLEAN",
 "inspectionOnly":True,
 "productionMutation":False,
 "serviceRestarted":False,
 "paperTouched":False,
 "apiAppTouched":False,
 "strategyEngineTouched":False,
 "telegramTouched":False,
 "clientGatesTouched":False,
 "serviceShow":service.stdout.strip(),
 "fileSha256":{name:sha256(path) for name,path in files.items()},
 "snapshotSymbolCounts":{
   "status":len(status.get("symbols") or []),
   "market":int(market.get("symbolCount") or 0),
   "candles":int(candles.get("symbolCount") or 0),
   "scanner":int(scanner.get("symbolCount") or 0),
 },
 "negativeLastTradeAgeCount":len(negative_age),
 "negativeLastTradeAges":negative_age,
 "openingRangeMissingCount":len(opening_range_missing),
 "openingRangeMissingSymbols":sorted(opening_range_missing),
 "sessionVolumeDivergenceCount":len(session_volume_deltas),
 "sessionVolumeDeltas":session_volume_deltas,
 "bootstrapTerms":bootstrap_terms,
 "issues":issues,
 "sourceFindings":source_findings,
 "recommendedPatchScope":[
   "track exact last trade event timestamp",
   "clamp generated-event age at zero",
   "reset all candle and indicator state at New York trading-date rollover",
   "bootstrap current-session candles and indicators after restart",
   "restore or reconstruct 09:30-09:35 opening range",
   "keep scanner research-only until restart-continuity proof passes"
 ],
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7C SEMANTIC AUDIT ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN READ-ONLY SESSION SEMANTICS AUDIT ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no production mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote audit failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6M DAY 7C SESSION SEMANTICS AUDIT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "NEGATIVE_LAST_TRADE_AGE_COUNT=$($r.negativeLastTradeAgeCount)",
 "OPENING_RANGE_MISSING_COUNT=$($r.openingRangeMissingCount)",
 "SESSION_VOLUME_DIVERGENCE_COUNT=$($r.sessionVolumeDivergenceCount)",
 "ISSUES=$(@($r.issues)-join ',')",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6M DAY 7C AUDIT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Negative lastTradeAge count: $($r.negativeLastTradeAgeCount)"
Write-Host "Opening range missing count: $($r.openingRangeMissingCount)"
Write-Host "Session-volume divergence count: $($r.sessionVolumeDivergenceCount)"
Write-Host "Issues: $(@($r.issues)-join ', ')"
Write-Host "Report: $report"
Write-Host "Raw: $raw"

if(-not $r.ok){throw "Semantic audit infrastructure failed"}
