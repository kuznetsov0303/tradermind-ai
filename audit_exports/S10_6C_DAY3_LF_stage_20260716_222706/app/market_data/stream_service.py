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