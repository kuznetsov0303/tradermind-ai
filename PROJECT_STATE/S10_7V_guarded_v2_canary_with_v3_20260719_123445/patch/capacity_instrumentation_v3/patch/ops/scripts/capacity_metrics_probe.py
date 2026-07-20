from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AGE_KEYS={
    "eventageseconds",
    "receiveageseconds",
    "event_age_seconds",
    "receive_age_seconds",
    "quoteageseconds",
    "lastquoteageseconds",
    "quote_age_seconds",
    "last_quote_age_seconds",
}

TIMESTAMP_KEYS={
    "lasteventat",
    "lastreceiveat",
    "last_event_at",
    "last_receive_at",
    "lastquoteat",
    "quotetimestamp",
    "quotets",
    "last_quote_at",
    "quote_timestamp",
    "quote_ts",
}

def _float(value:Any)->float|None:
    try:
        number=float(value)
    except (TypeError,ValueError):
        return None
    return number if math.isfinite(number) else None

def _epoch_seconds(value:Any)->float|None:
    number=_float(value)

    if number is not None:
        if number>1e18:
            return number/1e9
        if number>1e15:
            return number/1e6
        if number>1e12:
            return number/1e3
        if number>1e9:
            return number

    if isinstance(value,str):
        text=value.strip().replace("Z","+00:00")
        try:
            parsed=datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                parsed=parsed.replace(tzinfo=timezone.utc)
            return parsed.timestamp()
        except ValueError:
            return None

    return None

def collect_quote_ages(node:Any,now_epoch:float|None=None)->list[float]:
    now_epoch=time.time() if now_epoch is None else now_epoch
    ages=[]

    def visit(value:Any):
        if isinstance(value,dict):
            for key,item in value.items():
                normalized=str(key).replace("-","_").lower()

                if normalized in AGE_KEYS:
                    age=_float(item)
                    if age is not None and age>=0:
                        ages.append(age)
                        continue

                if normalized in TIMESTAMP_KEYS:
                    timestamp=_epoch_seconds(item)
                    if timestamp is not None:
                        ages.append(max(0.0,now_epoch-timestamp))
                        continue

                visit(item)
        elif isinstance(value,list):
            for item in value:
                visit(item)

    visit(node)
    return ages

def percentile95(values:list[float])->float|None:
    values=sorted(float(v) for v in values if v is not None)

    if not values:
        return None

    if len(values)==1:
        return round(values[0],6)

    rank=0.95*(len(values)-1)
    lower=math.floor(rank)
    upper=math.ceil(rank)

    if lower==upper:
        result=values[lower]
    else:
        fraction=rank-lower
        result=values[lower]+(values[upper]-values[lower])*fraction

    return round(result,6)

def read_main_pid(service:str)->int|None:
    result=subprocess.run(
        ["systemctl","show",service,"--property=MainPID","--value"],
        capture_output=True,
        text=True,
        check=False,
    )

    try:
        pid=int((result.stdout or "").strip())
    except ValueError:
        return None

    return pid if pid>0 else None

def read_rss_bytes(pid:int)->int|None:
    path=Path(f"/proc/{pid}/status")

    if not path.is_file():
        return None

    match=re.search(
        r"^VmRSS:\s+(\d+)\s+kB$",
        path.read_text(encoding="utf-8",errors="ignore"),
        re.MULTILINE,
    )

    return int(match.group(1))*1024 if match else None

def count_provider_errors(service:str,since:str)->int:
    result=subprocess.run(
        [
            "journalctl",
            "-u",service,
            "--since",since,
            "--no-pager",
            "--output=cat",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    pattern=re.compile(
        r"\b(error|exception|fatal|traceback|failed)\b",
        re.IGNORECASE,
    )

    return sum(
        1
        for line in (result.stdout or "").splitlines()
        if pattern.search(line)
    )

def read_json(path:str|Path)->dict[str,Any]:
    file=Path(path)

    if not file.is_file():
        return {}

    try:
        data=json.loads(file.read_text(encoding="utf-8"))
    except (OSError,json.JSONDecodeError):
        return {}

    return data if isinstance(data,dict) else {}

def collect_capacity_metrics(
    *,
    market_state_path:str,
    setup_metric_path:str,
    market_service:str,
    since:str,
)->dict[str,Any]:
    market_state=read_json(market_state_path)
    ages=collect_quote_ages(market_state)
    setup_metric=read_json(setup_metric_path)
    pid=read_main_pid(market_service)

    return {
        "quoteFreshnessP95Seconds":percentile95(ages),
        "quoteFreshnessSampleCount":len(ages),
        "rssBytes":read_rss_bytes(pid) if pid else None,
        "providerErrorCount":count_provider_errors(market_service,since),
        "setupCycleMs":_float(setup_metric.get("setupCycleMs")),
        "marketServiceMainPid":pid,
    }

def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument(
        "--market-state-path",
        default="/opt/skilledge/stock-engine/data/runtime/market_state.json",
    )
    parser.add_argument(
        "--setup-metric-path",
        default="/opt/skilledge/stock-engine/data/runtime/setup_cycle_metric.json",
    )
    parser.add_argument(
        "--market-service",
        default="skilledge-market-stream.service",
    )
    parser.add_argument("--since",required=True)
    parser.add_argument("--output")
    args=parser.parse_args()

    metrics=collect_capacity_metrics(
        market_state_path=args.market_state_path,
        setup_metric_path=args.setup_metric_path,
        market_service=args.market_service,
        since=args.since,
    )

    result={
        "ok":all(
            metrics.get(key) is not None
            for key in (
                "quoteFreshnessP95Seconds",
                "rssBytes",
                "providerErrorCount",
                "setupCycleMs",
            )
        ),
        "classification":"DAY7D_CAPACITY_METRICS_PROBE_RESULT",
        "metrics":metrics,
    }

    encoded=json.dumps(result,ensure_ascii=False,indent=2)

    if args.output:
        Path(args.output).write_text(encoded,encoding="utf-8")

    print(encoded)
    return 0 if result["ok"] else 2

if __name__=="__main__":
    raise SystemExit(main())
