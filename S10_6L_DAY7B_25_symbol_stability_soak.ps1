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
$raw=Join-Path $Audit "S10_6L_DAY7B_25_SYMBOL_SOAK_raw_$stamp.json"
$report=Join-Path $Audit "S10_6L_DAY7B_25_SYMBOL_SOAK_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6l_25_symbol_soak_$stamp.sh"
$remoteSh="/tmp/s10_6l_25_symbol_soak_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/skilledge/stock-engine

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import os
import subprocess
import time
from collections import Counter
from pathlib import Path

STATUS=Path("data/market_stream_status.json")
MARKET=Path("data/market_state_snapshot.json")
CANDLES=Path("data/candle_indicator_snapshot.json")
SCANNER=Path("data/scanner_snapshot.json")
UNIT="skilledge-market-stream.service"

def read(path):
    return json.loads(path.read_text()) if path.exists() else None

def total(counter):
    return sum(int(v) for v in (counter or {}).values())

def svc():
    p=subprocess.run([
      "systemctl","show",UNIT,
      "--property=ActiveState,SubState,Result,MainPID,NRestarts,MemoryCurrent,CPUUsageNSec,TasksCurrent"
    ],capture_output=True,text=True,check=False)
    return p.stdout.strip()

def snapshot():
    status=read(STATUS)
    market=read(MARKET)
    candles=read(CANDLES)
    scanner=read(SCANNER)
    items=(scanner or {}).get("items") or []
    qualities=Counter((item.get("quote") or {}).get("quality") for item in items)
    return {
      "status":status,
      "market":market,
      "candles":candles,
      "scanner":scanner,
      "raw":total((status or {}).get("rawRecordCounts")),
      "events":total((status or {}).get("marketEventCounts")),
      "trades":int((candles or {}).get("appliedTrades",0)),
      "sequence":int((market or {}).get("globalSequence",0)),
      "marketSymbols":int((market or {}).get("symbolCount",0)),
      "candleSymbols":int((candles or {}).get("symbolCount",0)),
      "scannerSymbols":int((scanner or {}).get("symbolCount",0)),
      "eligible":int((scanner or {}).get("eligibleCount",0)),
      "blocked":int((scanner or {}).get("blockedCount",0)),
      "qualities":dict(qualities),
      "rssKb":int(((status or {}).get("processMetrics") or {}).get("currentRssKilobytes",0)),
      "p95Ms":((status or {}).get("latencyMetrics") or {}).get("p95Ms"),
      "maxMs":((status or {}).get("latencyMetrics") or {}).get("maxMs"),
      "reconnects":int((status or {}).get("reconnectCount",0)),
      "lastError":(status or {}).get("lastError"),
      "service":svc(),
    }

samples=[]
start=time.time()
for index in range(6):
    samples.append(snapshot())
    if index<5:
        time.sleep(60)
elapsed=time.time()-start

first=samples[0]
last=samples[-1]

raw_growth=last["raw"]-first["raw"]
event_growth=last["events"]-first["events"]
trade_growth=last["trades"]-first["trades"]
sequence_growth=last["sequence"]-first["sequence"]
rss_values=[s["rssKb"] for s in samples]
p95_values=[s["p95Ms"] for s in samples if s["p95Ms"] is not None]
max_values=[s["maxMs"] for s in samples if s["maxMs"] is not None]

all_active=all(
 "ActiveState=active" in s["service"] and
 "SubState=running" in s["service"] and
 "NRestarts=0" in s["service"]
 for s in samples
)

all_25=all(
 s["marketSymbols"]==25 and
 s["candleSymbols"]==25 and
 s["scannerSymbols"]==25
 for s in samples
)

no_errors=all(s["lastError"] in (None,"") for s in samples)
no_reconnect_growth=last["reconnects"]==first["reconnects"]
growth_ok=raw_growth>0 and event_growth>0 and trade_growth>0 and sequence_growth>0
memory_ok=max(rss_values)<300000 and (max(rss_values)-min(rss_values))<50000
latency_ok=(max(p95_values) if p95_values else 999999)<5.0

ok=all([
 all_active,
 all_25,
 no_errors,
 no_reconnect_growth,
 growth_ok,
 memory_ok,
 latency_ok,
])

print(json.dumps({
 "ok":ok,
 "classification":"DAY7B_25_SYMBOL_5MIN_SOAK_VERIFIED" if ok else "DAY7B_25_SYMBOL_5MIN_SOAK_FAILED",
 "inspectionOnly":True,
 "productionMutation":False,
 "serviceRestarted":False,
 "paperTouched":False,
 "apiAppTouched":False,
 "strategyEngineTouched":False,
 "telegramTouched":False,
 "clientGatesTouched":False,
 "elapsedSeconds":elapsed,
 "sampleCount":len(samples),
 "rawGrowth":raw_growth,
 "eventGrowth":event_growth,
 "tradeGrowth":trade_growth,
 "sequenceGrowth":sequence_growth,
 "rawRatePerSecond":raw_growth/elapsed,
 "eventRatePerSecond":event_growth/elapsed,
 "tradeRatePerSecond":trade_growth/elapsed,
 "allSamplesServiceHealthy":all_active,
 "allSamples25Symbols":all_25,
 "noErrors":no_errors,
 "reconnectGrowth":last["reconnects"]-first["reconnects"],
 "rssMinKilobytes":min(rss_values),
 "rssMaxKilobytes":max(rss_values),
 "rssDeltaKilobytes":max(rss_values)-min(rss_values),
 "latencyP95MaxMs":max(p95_values) if p95_values else None,
 "latencyMaxObservedMs":max(max_values) if max_values else None,
 "finalEligibleCount":last["eligible"],
 "finalBlockedCount":last["blocked"],
 "finalQuoteQualities":last["qualities"],
 "samples":samples,
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD 25-SYMBOL STABILITY SOAK ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN 5-MINUTE READ-ONLY SOAK ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no paper / no cutover." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote soak failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6L DAY 7B 25-SYMBOL 5-MINUTE SOAK",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "ELAPSED_SECONDS=$($r.elapsedSeconds)",
 "RAW_GROWTH=$($r.rawGrowth)",
 "EVENT_GROWTH=$($r.eventGrowth)",
 "TRADE_GROWTH=$($r.tradeGrowth)",
 "SEQUENCE_GROWTH=$($r.sequenceGrowth)",
 "EVENT_RATE_PER_SECOND=$($r.eventRatePerSecond)",
 "ALL_SAMPLES_SERVICE_HEALTHY=$($r.allSamplesServiceHealthy)",
 "ALL_SAMPLES_25_SYMBOLS=$($r.allSamples25Symbols)",
 "NO_ERRORS=$($r.noErrors)",
 "RECONNECT_GROWTH=$($r.reconnectGrowth)",
 "RSS_MIN_KB=$($r.rssMinKilobytes)",
 "RSS_MAX_KB=$($r.rssMaxKilobytes)",
 "RSS_DELTA_KB=$($r.rssDeltaKilobytes)",
 "LATENCY_P95_MAX_MS=$($r.latencyP95MaxMs)",
 "LATENCY_MAX_OBSERVED_MS=$($r.latencyMaxObservedMs)",
 "FINAL_ELIGIBLE_COUNT=$($r.finalEligibleCount)",
 "FINAL_BLOCKED_COUNT=$($r.finalBlockedCount)",
 "FINAL_QUOTE_QUALITIES=$((ConvertTo-Json $r.finalQuoteQualities -Compress))",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6L_DAY7B_25_SYMBOL_SOAK_$stamp.md"
@"
# S10.6L Day 7B 25-Symbol Stability Soak

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Elapsed: $($r.elapsedSeconds) seconds
- Raw growth: $($r.rawGrowth)
- Event growth: $($r.eventGrowth)
- Trade growth: $($r.tradeGrowth)
- Event rate/sec: $($r.eventRatePerSecond)
- Service healthy in all samples: $($r.allSamplesServiceHealthy)
- 25 symbols in all snapshots: $($r.allSamples25Symbols)
- Reconnect growth: $($r.reconnectGrowth)
- RSS range KB: $($r.rssMinKilobytes) - $($r.rssMaxKilobytes)
- P95 max latency ms: $($r.latencyP95MaxMs)
- Eligible: $($r.finalEligibleCount)
- Blocked: $($r.finalBlockedCount)

No production mutation.
No service restart.
No strategy/client/Telegram cutover.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6L 25-SYMBOL SOAK COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Raw growth: $($r.rawGrowth)"
Write-Host "Event growth: $($r.eventGrowth)"
Write-Host "Trade growth: $($r.tradeGrowth)"
Write-Host "Event rate/sec: $([math]::Round([double]$r.eventRatePerSecond,2))"
Write-Host "All samples healthy: $($r.allSamplesServiceHealthy)"
Write-Host "All samples 25 symbols: $($r.allSamples25Symbols)"
Write-Host "Reconnect growth: $($r.reconnectGrowth)"
Write-Host "RSS min/max KB: $($r.rssMinKilobytes) / $($r.rssMaxKilobytes)"
Write-Host "P95 max latency ms: $($r.latencyP95MaxMs)"
Write-Host "Eligible / blocked: $($r.finalEligibleCount) / $($r.finalBlockedCount)"
Write-Host "Quote qualities: $((ConvertTo-Json $r.finalQuoteQualities -Compress))"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){throw "25-symbol stability soak failed"}
