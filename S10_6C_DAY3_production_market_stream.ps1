param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)
$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path $ProjectRoot).Path
$Backend=Join-Path $ProjectRoot "services\stock-engine"
$Market=Join-Path $Backend "app\market_data"
$Systemd=Join-Path $Backend "ops\systemd"
$Tests=Join-Path $Backend "tests"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
$Audit=Join-Path $ProjectRoot "audit_exports"
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Stage=Join-Path $Audit "S10_6C_DAY3_stage_$stamp"
$Backup=Join-Path $Audit "S10_6C_DAY3_backup_$stamp"
$Report=Join-Path $Audit "S10_6C_DAY3_report_$stamp.txt"
$Raw=Join-Path $Audit "S10_6C_DAY3_raw_$stamp.json"
$utf8=New-Object System.Text.UTF8Encoding($false)

foreach($d in @($Market,$Systemd,$Tests,$Milestones,$Stage,$Backup)){New-Item -ItemType Directory -Force $d|Out-Null}

function Write-File([string]$Path,[string]$Text){
  if(Test-Path $Path){
    $rel=$Path.Substring($ProjectRoot.Length).TrimStart("\")
    $dest=Join-Path $Backup $rel
    New-Item -ItemType Directory -Force (Split-Path $dest -Parent)|Out-Null
    Copy-Item $Path $dest -Force
  }
  [IO.File]::WriteAllText($Path,$Text,$utf8)
}

$service=@'
from __future__ import annotations
import json,logging,os,signal,threading
from collections import Counter
from datetime import datetime,timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
import databento as db
from .databento_adapter import normalize_mbp1_record

ROOT=Path("/opt/skilledge/stock-engine")
STATUS=Path(os.getenv("SKILLEDGE_MARKET_STREAM_STATUS_PATH",str(ROOT/"data/market_stream_status.json")))
DATASET=os.getenv("SKILLEDGE_MARKET_STREAM_DATASET","EQUS.MINI")
SCHEMA=os.getenv("SKILLEDGE_MARKET_STREAM_SCHEMA","mbp-1")
SYMBOLS=tuple(x.strip().upper() for x in os.getenv("SKILLEDGE_MARKET_STREAM_SYMBOLS","AAPL,MSFT").split(",") if x.strip())
HEARTBEAT=int(os.getenv("SKILLEDGE_MARKET_STREAM_HEARTBEAT_SECONDS","10"))
INTERVAL=float(os.getenv("SKILLEDGE_MARKET_STREAM_STATUS_INTERVAL_SECONDS","2"))
LOG=logging.getLogger("skilledge.market_stream")

class Runtime:
    def __init__(self):
        self.started=datetime.now(timezone.utc); self.last_record=None; self.last_event=None
        self.last_error=None; self.reconnects=0; self.raw=Counter(); self.events=Counter()
        self.map={}; self.latest={}; self.lock=threading.Lock(); self.stop=threading.Event(); self.client=None

    def on_record(self,r:Any):
        now=datetime.now(timezone.utc); typ=type(r).__name__
        with self.lock: self.last_record=now; self.raw[typ]+=1
        if typ=="SymbolMappingMsg":
            iid=getattr(r,"instrument_id",None)
            sym=getattr(r,"stype_out_symbol",None) or getattr(r,"raw_symbol",None)
            if iid is not None and sym:
                with self.lock:self.map[int(iid)]=str(sym).upper()
            return
        if typ!="MBP1Msg": return
        iid=getattr(r,"instrument_id",None)
        with self.lock:sym=self.map.get(int(iid)) if iid is not None else None
        if not sym:return
        try: events=normalize_mbp1_record(r,symbol=sym)
        except Exception as e:self.on_error(e);return
        with self.lock:
            for ev in events:
                self.last_event=now; self.events[ev.event_type.value]+=1
                self.latest[f"{ev.symbol}:{ev.event_type.value}"]={
                    "symbol":ev.symbol,"type":ev.event_type.value,
                    "eventTime":ev.event_time.isoformat(),"receiveTime":ev.receive_time.isoformat(),
                    "latencyMs":ev.latency_ms,
                    "payload":{k:(str(getattr(ev.payload,k)) if isinstance(getattr(ev.payload,k),Decimal) else getattr(ev.payload,k))
                               for k in getattr(ev.payload,"__dataclass_fields__",{})}
                }

    def on_error(self,e:Exception):
        LOG.exception("callback error",exc_info=e)
        with self.lock:self.last_error=repr(e)[:2000]

    def on_reconnect(self,a:Any,b:Any):
        LOG.warning("reconnect gap %s -> %s",a,b)
        with self.lock:self.reconnects+=1

    def snapshot(self):
        now=datetime.now(timezone.utc)
        with self.lock:
            lr=self.last_record; le=self.last_event; err=self.last_error
            raw=dict(self.raw); events=dict(self.events); latest=dict(self.latest); mappings=len(self.map); rc=self.reconnects
        age=(now-lr).total_seconds() if lr else None
        status="STARTING" if lr is None else ("OK" if age<=HEARTBEAT+10 else "STALE")
        if err and status!="OK":status="DEGRADED"
        return {"ok":status=="OK","status":status,"provider":"databento","dataset":DATASET,"schema":SCHEMA,
                "symbols":list(SYMBOLS),"pid":os.getpid(),"startedAt":self.started.isoformat(),
                "generatedAt":now.isoformat(),"lastRecordAt":lr.isoformat() if lr else None,
                "lastMarketEventAt":le.isoformat() if le else None,"recordAgeSeconds":age,
                "rawRecordCounts":raw,"marketEventCounts":events,"instrumentMappings":mappings,
                "reconnectCount":rc,"lastError":err,"latestEvents":latest}

    def write(self):
        STATUS.parent.mkdir(parents=True,exist_ok=True); tmp=STATUS.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.snapshot(),indent=2),encoding="utf-8"); os.replace(tmp,STATUS)

def writer(rt):
    while not rt.stop.wait(INTERVAL):
        try:rt.write()
        except Exception as e:rt.on_error(e)

def main():
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(name)s %(message)s")
    db.enable_logging("INFO")
    if not os.getenv("DATABENTO_API_KEY"):raise RuntimeError("DATABENTO_API_KEY missing")
    rt=Runtime()
    def stop(sig,frame):
        rt.stop.set()
        if rt.client:
            try:rt.client.stop()
            except Exception:LOG.exception("stop failed")
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    threading.Thread(target=writer,args=(rt,),daemon=True).start()
    rt.client=db.Live(heartbeat_interval_s=HEARTBEAT,reconnect_policy="reconnect",
                      slow_reader_behavior="skip",compression="zstd",ts_out=True)
    rt.client.subscribe(dataset=DATASET,schema=SCHEMA,symbols=list(SYMBOLS))
    rt.client.add_callback(rt.on_record,exception_callback=rt.on_error)
    rt.client.add_reconnect_callback(rt.on_reconnect,exception_callback=rt.on_error)
    try:
        rt.client.start();rt.write();rt.client.block_for_close()
    except Exception as e:
        rt.on_error(e);rt.write();return 1
    finally:
        rt.stop.set();rt.write()
    return 0
if __name__=="__main__":raise SystemExit(main())
'@

$unit=@'
[Unit]
Description=SkillEdge Databento Market Stream
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/skilledge/stock-engine
EnvironmentFile=/opt/skilledge/stock-engine/.env.server
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONPATH=/opt/skilledge/stock-engine
Environment=SKILLEDGE_MARKET_STREAM_DATASET=EQUS.MINI
Environment=SKILLEDGE_MARKET_STREAM_SCHEMA=mbp-1
Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS=AAPL,MSFT
Environment=SKILLEDGE_MARKET_STREAM_HEARTBEAT_SECONDS=10
Environment=SKILLEDGE_MARKET_STREAM_STATUS_INTERVAL_SECONDS=2
ExecStart=/opt/skilledge/stock-engine/.venv/bin/python -m app.market_data.stream_service
Restart=always
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
'@

$test=@'
import unittest
from datetime import datetime,timezone
from decimal import Decimal
from app.market_data.contracts import BboPayload,EventType,MarketEvent,ProviderName
class StreamServiceTest(unittest.TestCase):
    def test_contract_for_service(self):
        now=datetime.now(timezone.utc)
        e=MarketEvent(provider=ProviderName.DATABENTO,dataset="EQUS.MINI",event_type=EventType.BBO,
          symbol="AAPL",instrument_id=38,event_time=now,receive_time=now,
          payload=BboPayload(Decimal("100"),Decimal("100.1"),10,20))
        self.assertEqual(e.payload.spread,Decimal("0.1"))
if __name__=="__main__":unittest.main()
'@

Write-File (Join-Path $Market "stream_service.py") $service
Write-File (Join-Path $Systemd "skilledge-market-stream.service") $unit
Write-File (Join-Path $Tests "test_market_stream_service.py") $test

$req=Join-Path $Backend "requirements.txt"
$reqText=Get-Content $req -Raw
if($reqText -notmatch "(?m)^databento==0\.81\.0\s*$"){Write-File $req ($reqText.TrimEnd()+"`r`ndatabento==0.81.0`r`n")}

Write-Host "`n=== LOCAL CHECKS ===" -ForegroundColor Green
Push-Location $Backend
try{
  python -m py_compile app\market_data\stream_service.py tests\test_market_stream_service.py
  if($LASTEXITCODE-ne 0){throw "compile failed"}
  python -m unittest tests.test_market_data_contracts tests.test_market_stream_service -v
  if($LASTEXITCODE-ne 0){throw "tests failed"}
}finally{Pop-Location}

$stageApp=Join-Path $Stage "app\market_data";$stageUnit=Join-Path $Stage "systemd"
New-Item -ItemType Directory -Force $stageApp,$stageUnit|Out-Null
Copy-Item (Join-Path $Market "__init__.py"),(Join-Path $Market "contracts.py"),(Join-Path $Market "provider.py"),(Join-Path $Market "databento_adapter.py"),(Join-Path $Market "stream_service.py") $stageApp
Copy-Item (Join-Path $Systemd "skilledge-market-stream.service") $stageUnit

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")
$remoteStage="/tmp/s106c_$stamp";$remoteBackup="/opt/skilledge/stock-engine/rollback_snapshots/S10_6C_DAY3_$stamp"

& ssh @ssh $VpsHost "mkdir -p '$remoteStage/app/market_data' '$remoteStage/systemd' '$remoteBackup/app/market_data' '$remoteBackup/systemd'"
if($LASTEXITCODE-ne 0){throw "remote mkdir failed"}
& scp @ssh "$stageApp\*" "${VpsHost}:$remoteStage/app/market_data/"
if($LASTEXITCODE-ne 0){throw "app upload failed"}
& scp @ssh "$stageUnit\skilledge-market-stream.service" "${VpsHost}:$remoteStage/systemd/"
if($LASTEXITCODE-ne 0){throw "unit upload failed"}

$remote=@"
set -euo pipefail
E=/opt/skilledge/stock-engine; S='$remoteStage'; B='$remoteBackup'; U=/etc/systemd/system/skilledge-market-stream.service
mkdir -p "\$E/app/market_data" "\$E/data" "\$B/app/market_data" "\$B/systemd"
for f in __init__.py contracts.py provider.py databento_adapter.py stream_service.py;do [ ! -f "\$E/app/market_data/\$f" ]||cp -a "\$E/app/market_data/\$f" "\$B/app/market_data/\$f";done
[ ! -f "\$U" ]||cp -a "\$U" "\$B/systemd/skilledge-market-stream.service"
/opt/skilledge/stock-engine/.venv/bin/pip install --disable-pip-version-check --no-input databento==0.81.0
/opt/skilledge/stock-engine/.venv/bin/python -m py_compile "\$S/app/market_data/"*.py
install -m0644 "\$S/app/market_data/"*.py "\$E/app/market_data/"
install -m0644 "\$S/systemd/skilledge-market-stream.service" "\$U"
systemctl daemon-reload
systemctl enable --now skilledge-market-stream.service
sleep 12
python3 - <<'PY'
import json,subprocess
from pathlib import Path
p=Path("/opt/skilledge/stock-engine/data/market_stream_status.json")
s=subprocess.run(["systemctl","show","skilledge-market-stream.service","--property=ActiveState,SubState,Result,MainPID,NRestarts"],capture_output=True,text=True)
print(json.dumps({"service":s.stdout.strip(),"exists":p.exists(),"status":json.loads(p.read_text()) if p.exists() else None}))
PY
rm -rf "\$S"
"@

$out=& ssh @ssh $VpsHost $remote
if($LASTEXITCODE-ne 0){throw "deploy failed"}
$text=$out-join"`n";$text|Set-Content $Raw -Encoding UTF8
$r=$text|ConvertFrom-Json
$active=([string]$r.service)-match"ActiveState=active"
$st=$r.status
$total=0
if($st -and $st.rawRecordCounts){foreach($p in $st.rawRecordCounts.PSObject.Properties){$total+=[int64]$p.Value}}
$ok=$active -and $r.exists -and $total-gt 0

@(
"S10.6C DAY3","OK=$ok","SERVICE_ACTIVE=$active","STATUS=$($st.status)",
"DATASET=$($st.dataset)","SCHEMA=$($st.schema)","SYMBOLS=$(@($st.symbols)-join',')",
"LAST_RECORD=$($st.lastRecordAt)","LAST_EVENT=$($st.lastMarketEventAt)",
"RAW_RECORDS=$total","RECONNECTS=$($st.reconnectCount)","LAST_ERROR=$($st.lastError)",
"ROLLBACK=$remoteBackup","RAW=$Raw"
)|Set-Content $Report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6C_DAY3_MARKET_STREAM_$stamp.md"
@"
# S10.6C Day 3 Production Market Stream
Generated: $isoNow
OK: $ok
Service active: $active
Status: $($st.status)
Dataset/schema: $($st.dataset) / $($st.schema)
Symbols: $(@($st.symbols)-join',')
Raw records: $total
Last record: $($st.lastRecordAt)
Last canonical event: $($st.lastMarketEventAt)
Reconnects: $($st.reconnectCount)
Last error: $($st.lastError)
Rollback: $remoteBackup

Changed:
- installed databento==0.81.0 in production venv;
- deployed market-data contracts and adapter;
- installed and enabled skilledge-market-stream.service.

Not changed:
- app.py, scanner, strategy engine, paper, Telegram, client gates, payments.
"@|Set-Content $milestone -Encoding UTF8

Write-Host "`n=== S10.6C DAY 3 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Service active: $active"
Write-Host "Status: $($st.status)"
Write-Host "Raw records: $total"
Write-Host "Last canonical event: $($st.lastMarketEventAt)"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Rollback: $remoteBackup"
if(-not $ok){throw "runtime gate failed"}
