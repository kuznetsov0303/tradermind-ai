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
$raw=Join-Path $Audit "S10_6H_REGULAR_SESSION_LIVE_PROOF_raw_$stamp.json"
$report=Join-Path $Audit "S10_6H_REGULAR_SESSION_LIVE_PROOF_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6h_regular_proof_$stamp.sh"
$remoteSh="/tmp/s10_6h_regular_proof_$stamp.sh"
$bash=@'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/skilledge/stock-engine
.venv/bin/python - <<'PY'
import json,subprocess,time
from datetime import datetime,time as dt
from pathlib import Path
from zoneinfo import ZoneInfo
P={k:Path(v) for k,v in {
 'status':'data/market_stream_status.json',
 'market':'data/market_state_snapshot.json',
 'candles':'data/candle_indicator_snapshot.json',
 'scanner':'data/scanner_snapshot.json'}.items()}
def r(p): return json.loads(p.read_text()) if p.exists() else None
def total(x): return sum(int(v) for v in (x or {}).values())
def snap(): return {k:r(v) for k,v in P.items()}
def svc():
 p=subprocess.run(['systemctl','show','skilledge-market-stream.service','--property=ActiveState,SubState,Result,MainPID,NRestarts'],capture_output=True,text=True)
 return p.stdout.strip()
ny=datetime.now(ZoneInfo('America/New_York'))
regular=ny.weekday()<5 and dt(9,30)<=ny.time()<dt(16,0)
b=snap(); rb=total((b['status'] or {}).get('rawRecordCounts')); eb=total((b['status'] or {}).get('marketEventCounts')); tb=int((b['candles'] or {}).get('appliedTrades',0)); sb=int((b['market'] or {}).get('globalSequence',0))
time.sleep(30)
a=snap(); ra=total((a['status'] or {}).get('rawRecordCounts')); ea=total((a['status'] or {}).get('marketEventCounts')); ta=int((a['candles'] or {}).get('appliedTrades',0)); sa=int((a['market'] or {}).get('globalSequence',0))
sv=svc(); active='ActiveState=active' in sv and 'SubState=running' in sv
m=(a['market'] or {}).get('symbols') or {}; c=(a['candles'] or {}).get('symbols') or {}; items=(a['scanner'] or {}).get('items') or []; by={i.get('symbol'):i for i in items if i.get('symbol')}
req={'AAPL','MSFT'}; present=req.issubset(m) and req.issubset(c) and req.issubset(by)
def cok(s):
 x=c.get(s) or {}; iv=x.get('intervals') or {}
 return x.get('vwap') is not None and x.get('highOfDay') is not None and x.get('lowOfDay') is not None and all((iv.get(i) or {}).get('active') is not None for i in ('1s','1m','5m'))
def sok(s):
 x=by.get(s) or {}; q=x.get('quote') or {}
 return q.get('quality') in {'VALID','LOCKED','CROSSED','WIDE','STALE'} and 'eligible' in x and x.get('clientEligible') is False and x.get('telegramEligible') is False
candles_ok=present and all(cok(s) for s in req); scanner_ok=present and all(sok(s) for s in req)
rg,eg,tg,sg=ra-rb,ea-eb,ta-tb,sa-sb
fresh=all(bool((m.get(s) or {}).get('fresh')) for s in req)
quals=sorted({(i.get('quote') or {}).get('quality') for i in items if (i.get('quote') or {}).get('quality')})
valid=sum(1 for i in items if (i.get('quote') or {}).get('quality')=='VALID'); eligible=sum(1 for i in items if i.get('eligible') is True)
ok=bool(regular and active and present and candles_ok and scanner_ok and rg>0 and eg>0 and tg>0 and sg>0)
print(json.dumps({'ok':ok,'classification':'DAY6_DAY7A_REGULAR_SESSION_LIVE_VERIFIED' if ok else 'DAY6_DAY7A_REGULAR_SESSION_LIVE_GATE_FAILED','inspectionOnly':True,'productionMutation':False,'serviceRestarted':False,'paperTouched':False,'apiAppTouched':False,'strategyEngineTouched':False,'telegramTouched':False,'clientGatesTouched':False,'newYorkTime':ny.isoformat(),'regularSessionOpen':regular,'serviceActive':active,'serviceShow':sv,'rawGrowth':rg,'eventGrowth':eg,'tradeGrowth':tg,'sequenceGrowth':sg,'symbolsPresent':present,'candlesVerified':candles_ok,'scannerVerified':scanner_ok,'freshMarketState':fresh,'scannerItems':len(items),'validQuoteCount':valid,'eligibleCount':eligible,'quoteQualitiesObserved':quals,'statusAfter':a['status'],'marketAfter':a['market'],'candlesAfter':a['candles'],'scannerAfter':a['scanner']},ensure_ascii=False))
PY
'@
$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))
$ssh=@('-i',$SshKey,'-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new')
Write-Host "`n=== UPLOAD REGULAR SESSION LIVE PROOF ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"; if($LASTEXITCODE-ne 0){throw 'Upload failed'}
Write-Host "`n=== RUN 30-SECOND REGULAR SESSION PROOF ===" -ForegroundColor Green
Write-Host 'No deploy / no restart / no paper / no strategy cutover.' -ForegroundColor Yellow
$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw 'Remote proof failed'}
$text=$out -join "`n"; $text|Set-Content $raw -Encoding UTF8; $r=$text|ConvertFrom-Json
@('S10.6H REGULAR SESSION LIVE PROOF',"Generated=$stamp","OK=$($r.ok)","CLASSIFICATION=$($r.classification)","NEW_YORK_TIME=$($r.newYorkTime)","REGULAR_SESSION_OPEN=$($r.regularSessionOpen)","RAW_GROWTH=$($r.rawGrowth)","EVENT_GROWTH=$($r.eventGrowth)","TRADE_GROWTH=$($r.tradeGrowth)","SEQUENCE_GROWTH=$($r.sequenceGrowth)","CANDLES_VERIFIED=$($r.candlesVerified)","SCANNER_VERIFIED=$($r.scannerVerified)","FRESH_MARKET_STATE=$($r.freshMarketState)","SCANNER_ITEMS=$($r.scannerItems)","VALID_QUOTE_COUNT=$($r.validQuoteCount)","ELIGIBLE_COUNT=$($r.eligibleCount)","QUOTE_QUALITIES=$(@($r.quoteQualitiesObserved)-join ',')","PRODUCTION_MUTATION=$($r.productionMutation)","SERVICE_RESTARTED=$($r.serviceRestarted)","PAPER_TOUCHED=$($r.paperTouched)","RAW_JSON=$raw")|Set-Content $report -Encoding UTF8
Write-Host "`n=== S10.6H REGULAR SESSION PROOF COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"; Write-Host "Classification: $($r.classification)"; Write-Host "New York time: $($r.newYorkTime)"; Write-Host "Raw growth: $($r.rawGrowth)"; Write-Host "Event growth: $($r.eventGrowth)"; Write-Host "Trade growth: $($r.tradeGrowth)"; Write-Host "Sequence growth: $($r.sequenceGrowth)"; Write-Host "Candles verified: $($r.candlesVerified)"; Write-Host "Scanner verified: $($r.scannerVerified)"; Write-Host "Fresh market state: $($r.freshMarketState)"; Write-Host "Scanner items: $($r.scannerItems)"; Write-Host "Valid quotes: $($r.validQuoteCount)"; Write-Host "Eligible symbols: $($r.eligibleCount)"; Write-Host "Quote qualities: $(@($r.quoteQualitiesObserved)-join ', ')"; Write-Host "Report: $report"; Write-Host "Raw: $raw"
if(-not $r.ok){throw 'Regular-session live proof gate failed'}
