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
$raw=Join-Path $Audit "S10_6J2_DAY7B_SYMBOL_RESOLUTION_raw_$stamp.json"
$report=Join-Path $Audit "S10_6J2_DAY7B_SYMBOL_RESOLUTION_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6j2_symbol_resolution_$stamp.sh"
$remoteSh="/tmp/s10_6j2_symbol_resolution_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
ENVFILE="$ENGINE/.env.server"

export ENGINE ENVFILE
cd "$ENGINE"

.venv/bin/python - <<'PY'
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import databento as db

symbols=[
 "AAPL","MSFT","NVDA","TSLA","AMD",
 "AMZN","META","GOOGL","AVGO","PLTR",
 "SMCI","MSTR","COIN","NFLX","CRM",
 "ORCL","INTC","MU","ARM","UBER",
 "SHOP","RIVN","SOFI","CRWD","NOW"
]

envfile=Path(os.environ["ENVFILE"])
if envfile.exists():
    for raw in envfile.read_text(encoding="utf-8",errors="replace").splitlines():
        line=raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key,value=line.split("=",1)
        os.environ.setdefault(key.strip(),value.strip())

key=os.getenv("DATABENTO_API_KEY") or os.getenv("DBN_API_KEY")
if not key:
    print(json.dumps({
      "ok":False,
      "classification":"DAY7B_SYMBOL_RESOLUTION_NO_API_KEY",
      "resolved":[],
      "unresolved":symbols,
      "error":"Databento API key unavailable"
    }))
    raise SystemExit(0)

client=db.Historical(key=key)

now=datetime.now(timezone.utc)
safe_end=now-timedelta(minutes=15)
start=safe_end-timedelta(hours=24)

try:
    data=client.timeseries.get_range(
      dataset="EQUS.MINI",
      schema="definition",
      symbols=symbols,
      stype_in="raw_symbol",
      start=start,
      end=safe_end,
      limit=100000,
    )

    resolved=set()
    for record in data:
        raw_symbol=getattr(record,"raw_symbol",None)
        if raw_symbol is None:
            continue
        if isinstance(raw_symbol,bytes):
            raw_symbol=raw_symbol.decode(errors="ignore").rstrip("\x00")
        resolved.add(str(raw_symbol).strip())

    matched=sorted(set(symbols).intersection(resolved))
    unresolved=[symbol for symbol in symbols if symbol not in resolved]
    ok=len(unresolved)==0

    print(json.dumps({
      "ok":ok,
      "classification":"DAY7B_25_SYMBOL_UNIVERSE_RESOLVED" if ok else "DAY7B_25_SYMBOL_UNIVERSE_PARTIAL",
      "inspectionOnly":True,
      "productionMutation":False,
      "serviceRestarted":False,
      "dataset":"EQUS.MINI",
      "schema":"definition",
      "queryStart":start.isoformat(),
      "queryEnd":safe_end.isoformat(),
      "candidateCount":len(symbols),
      "resolvedCount":len(matched),
      "resolved":matched,
      "unresolved":unresolved,
      "nextAction":"BUILD_AUTO_ROLLBACK_25_SYMBOL_CANARY" if ok else "REVIEW_UNRESOLVED_SYMBOLS",
      "error":None
    },ensure_ascii=False))

except Exception as exc:
    print(json.dumps({
      "ok":False,
      "classification":"DAY7B_SYMBOL_RESOLUTION_FAILED",
      "inspectionOnly":True,
      "productionMutation":False,
      "serviceRestarted":False,
      "candidateCount":len(symbols),
      "resolvedCount":0,
      "resolved":[],
      "unresolved":symbols,
      "nextAction":"STOP_AND_REVIEW",
      "error":f"{type(exc).__name__}: {exc}"
    },ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD CORRECTED SYMBOL RESOLUTION ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN READ-ONLY DATABENTO SYMBOL RESOLUTION ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no secrets printed." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote resolution failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6J2 DAY 7B SYMBOL RESOLUTION",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "QUERY_START=$($r.queryStart)",
 "QUERY_END=$($r.queryEnd)",
 "CANDIDATE_COUNT=$($r.candidateCount)",
 "RESOLVED_COUNT=$($r.resolvedCount)",
 "RESOLVED=$(@($r.resolved)-join ',')",
 "UNRESOLVED=$(@($r.unresolved)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "ERROR=$($r.error)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6J2 SYMBOL RESOLUTION COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Candidate count: $($r.candidateCount)"
Write-Host "Resolved count: $($r.resolvedCount)"
Write-Host "Unresolved: $(@($r.unresolved)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Error: $($r.error)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"

if(-not $r.ok){throw "25-symbol resolution gate failed"}
