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
$raw=Join-Path $Audit "S10_6I_DAY7B_CAPACITY_BASELINE_raw_$stamp.json"
$report=Join-Path $Audit "S10_6I_DAY7B_CAPACITY_BASELINE_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6i_capacity_$stamp.sh"
$remoteSh="/tmp/s10_6i_capacity_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/skilledge/stock-engine

.venv/bin/python - <<'PY'
import json, os, subprocess, time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

STATUS=Path("data/market_stream_status.json")
STATE=Path("data/market_state_snapshot.json")
CANDLES=Path("data/candle_indicator_snapshot.json")
SCANNER=Path("data/scanner_snapshot.json")

def read(path):
    return json.loads(path.read_text()) if path.exists() else None

def run(args):
    p=subprocess.run(args,capture_output=True,text=True,check=False)
    return {"returncode":p.returncode,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}

def total(counter):
    return sum(int(v) for v in (counter or {}).values())

def proc_net():
    data={}
    p=Path("/proc/net/dev")
    if p.exists():
        for line in p.read_text().splitlines()[2:]:
            name,rest=line.split(":",1)
            fields=rest.split()
            data[name.strip()]={"rxBytes":int(fields[0]),"txBytes":int(fields[8])}
    return data

def disk():
    st=os.statvfs("/opt/skilledge/stock-engine")
    return {
      "totalBytes":st.f_blocks*st.f_frsize,
      "freeBytes":st.f_bavail*st.f_frsize,
      "usedBytes":(st.f_blocks-st.f_bfree)*st.f_frsize,
    }

def mem():
    out={}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key,val=line.split(":",1)
        if key in {"MemTotal","MemAvailable","SwapTotal","SwapFree"}:
            out[key]=int(val.strip().split()[0])*1024
    return out

def cpu():
    line=Path("/proc/stat").read_text().splitlines()[0].split()[1:]
    vals=[int(x) for x in line]
    return {"total":sum(vals),"idle":vals[3]+vals[4]}

before_status=read(STATUS)
before_net=proc_net()
before_cpu=cpu()
before_time=time.time()

raw_before=total((before_status or {}).get("rawRecordCounts"))
event_before=total((before_status or {}).get("marketEventCounts"))

time.sleep(60)

after_status=read(STATUS)
after_state=read(STATE)
after_candles=read(CANDLES)
after_scanner=read(SCANNER)
after_net=proc_net()
after_cpu=cpu()
after_time=time.time()

elapsed=after_time-before_time
raw_after=total((after_status or {}).get("rawRecordCounts"))
event_after=total((after_status or {}).get("marketEventCounts"))

raw_rate=(raw_after-raw_before)/elapsed if elapsed>0 else 0
event_rate=(event_after-event_before)/elapsed if elapsed>0 else 0

rx_before=sum(v["rxBytes"] for k,v in before_net.items() if k!="lo")
tx_before=sum(v["txBytes"] for k,v in before_net.items() if k!="lo")
rx_after=sum(v["rxBytes"] for k,v in after_net.items() if k!="lo")
tx_after=sum(v["txBytes"] for k,v in after_net.items() if k!="lo")

rx_rate=(rx_after-rx_before)/elapsed if elapsed>0 else 0
tx_rate=(tx_after-tx_before)/elapsed if elapsed>0 else 0

cpu_total=after_cpu["total"]-before_cpu["total"]
cpu_idle=after_cpu["idle"]-before_cpu["idle"]
cpu_used_pct=((cpu_total-cpu_idle)/cpu_total*100) if cpu_total>0 else 0

service=run([
 "systemctl","show","skilledge-market-stream.service",
 "--property=ActiveState,SubState,MainPID,NRestarts,MemoryCurrent,CPUUsageNSec,TasksCurrent"
])

symbols=(after_status or {}).get("symbols") or []
symbol_count=max(1,len(symbols))
per_symbol_event_rate=event_rate/symbol_count
per_symbol_rx_rate=rx_rate/symbol_count

meminfo=mem()
diskinfo=disk()
process=(after_status or {}).get("processMetrics") or {}

recommendation="HOLD_2_SYMBOL_CANARY"
safe_partition=2

if (
  cpu_used_pct < 35
  and meminfo.get("MemAvailable",0) > 2*1024**3
  and process.get("currentRssKilobytes",0) < 512000
):
    safe_partition=25
    recommendation="NEXT_PARTITION_25_SYMBOLS"
elif (
  cpu_used_pct < 55
  and meminfo.get("MemAvailable",0) > 1024**3
):
    safe_partition=10
    recommendation="NEXT_PARTITION_10_SYMBOLS"
elif (
  cpu_used_pct < 70
  and meminfo.get("MemAvailable",0) > 512*1024**2
):
    safe_partition=5
    recommendation="NEXT_PARTITION_5_SYMBOLS"

print(json.dumps({
 "ok":True,
 "classification":"DAY7B_CAPACITY_BASELINE_CAPTURED",
 "inspectionOnly":True,
 "productionMutation":False,
 "serviceRestarted":False,
 "paperTouched":False,
 "apiAppTouched":False,
 "strategyEngineTouched":False,
 "telegramTouched":False,
 "clientGatesTouched":False,
 "newYorkTime":datetime.now(ZoneInfo("America/New_York")).isoformat(),
 "elapsedSeconds":elapsed,
 "service":service,
 "symbols":symbols,
 "symbolCount":len(symbols),
 "rawGrowth":raw_after-raw_before,
 "eventGrowth":event_after-event_before,
 "rawRatePerSecond":raw_rate,
 "eventRatePerSecond":event_rate,
 "perSymbolEventRatePerSecond":per_symbol_event_rate,
 "networkRxBytesPerSecond":rx_rate,
 "networkTxBytesPerSecond":tx_rate,
 "perSymbolRxBytesPerSecond":per_symbol_rx_rate,
 "hostCpuUsedPct":cpu_used_pct,
 "memory":meminfo,
 "disk":diskinfo,
 "processMetrics":process,
 "recommendedNextPartitionSize":safe_partition,
 "recommendation":recommendation,
 "status":after_status,
 "marketStateSymbolCount":int((after_state or {}).get("symbolCount",0)),
 "candleSymbolCount":int((after_candles or {}).get("symbolCount",0)),
 "scannerSymbolCount":int((after_scanner or {}).get("symbolCount",0)),
 "hardSafety":{
   "allSymbolsCutoverAllowed":False,
   "clientCutoverAllowed":False,
   "telegramCutoverAllowed":False,
   "strategyCutoverAllowed":False
 }
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7B CAPACITY BASELINE ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN 60-SECOND READ-ONLY CAPACITY SAMPLE ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no cutover." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote capacity sample failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6I DAY 7B CAPACITY BASELINE",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "NEW_YORK_TIME=$($r.newYorkTime)",
 "ELAPSED_SECONDS=$($r.elapsedSeconds)",
 "SYMBOL_COUNT=$($r.symbolCount)",
 "RAW_GROWTH=$($r.rawGrowth)",
 "EVENT_GROWTH=$($r.eventGrowth)",
 "RAW_RATE_PER_SECOND=$($r.rawRatePerSecond)",
 "EVENT_RATE_PER_SECOND=$($r.eventRatePerSecond)",
 "PER_SYMBOL_EVENT_RATE_PER_SECOND=$($r.perSymbolEventRatePerSecond)",
 "NETWORK_RX_BYTES_PER_SECOND=$($r.networkRxBytesPerSecond)",
 "NETWORK_TX_BYTES_PER_SECOND=$($r.networkTxBytesPerSecond)",
 "HOST_CPU_USED_PCT=$($r.hostCpuUsedPct)",
 "PROCESS_RSS_KB=$($r.processMetrics.currentRssKilobytes)",
 "MEM_AVAILABLE_BYTES=$($r.memory.MemAvailable)",
 "DISK_FREE_BYTES=$($r.disk.freeBytes)",
 "RECOMMENDED_NEXT_PARTITION_SIZE=$($r.recommendedNextPartitionSize)",
 "RECOMMENDATION=$($r.recommendation)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6I_DAY7B_CAPACITY_BASELINE_$stamp.md"
@"
# S10.6I Day 7B Capacity Baseline

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Symbols sampled: $($r.symbolCount)
- Event rate/sec: $($r.eventRatePerSecond)
- Per-symbol event rate/sec: $($r.perSymbolEventRatePerSecond)
- Network RX bytes/sec: $($r.networkRxBytesPerSecond)
- Host CPU used: $($r.hostCpuUsedPct)%
- Process RSS KB: $($r.processMetrics.currentRssKilobytes)
- Recommended next partition: $($r.recommendedNextPartitionSize)
- Recommendation: $($r.recommendation)

No production mutation.
No service restart.
No strategy/client/Telegram cutover.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6I DAY 7B CAPACITY BASELINE COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Symbols sampled: $($r.symbolCount)"
Write-Host "Event rate/sec: $([math]::Round([double]$r.eventRatePerSecond,2))"
Write-Host "Per-symbol event rate/sec: $([math]::Round([double]$r.perSymbolEventRatePerSecond,2))"
Write-Host "Network RX KB/sec: $([math]::Round(([double]$r.networkRxBytesPerSecond/1024),2))"
Write-Host "Host CPU used %: $([math]::Round([double]$r.hostCpuUsedPct,2))"
Write-Host "Process RSS KB: $($r.processMetrics.currentRssKilobytes)"
Write-Host "Recommended next partition: $($r.recommendedNextPartitionSize)"
Write-Host "Recommendation: $($r.recommendation)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
