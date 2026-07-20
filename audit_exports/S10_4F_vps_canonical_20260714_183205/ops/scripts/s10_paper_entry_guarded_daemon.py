#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys
import urllib.request
from zoneinfo import ZoneInfo

URL = "http://127.0.0.1:8000/engine/paper/run-once"
LOG = pathlib.Path(
    "/opt/skilledge/stock-engine/data/paper_trading/"
    "s10_50k/entry_guarded_daemon.log"
)

NY = ZoneInfo("America/New_York")
WINDOW_START = dt.time(hour=4, minute=0)
WINDOW_END = dt.time(hour=15, minute=45)

def append_log(row):
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
            )
    except Exception:
        pass

now_utc = dt.datetime.now(dt.timezone.utc)
now_ny = now_utc.astimezone(NY)

base = {
    "ts": now_utc.isoformat(),
    "nyTime": now_ny.isoformat(),
    "version": "s10_3q_market_hours_guarded_entry_v1",
    "paperOnly": True,
    "brokerExecution": False,
    "entryWindow": "04:00-15:45 America/New_York weekdays",
}

if now_ny.weekday() >= 5:
    row = {
        **base,
        "ok": True,
        "status": "SKIPPED_WEEKEND",
        "openedCount": 0,
    }
    print(json.dumps(row, ensure_ascii=False, indent=2))
    append_log(row)
    sys.exit(0)

local_time = now_ny.time().replace(tzinfo=None)
if not (WINDOW_START <= local_time < WINDOW_END):
    row = {
        **base,
        "ok": True,
        "status": "SKIPPED_OUTSIDE_ENTRY_WINDOW",
        "openedCount": 0,
    }
    print(json.dumps(row, ensure_ascii=False, indent=2))
    append_log(row)
    sys.exit(0)

try:
    request = urllib.request.Request(URL, method="POST")
    with urllib.request.urlopen(request, timeout=150) as response:
        payload = json.loads(
            response.read().decode("utf-8", errors="replace")
        )

    account = payload.get("account") or {}
    safety = payload.get("safety") or {}

    invariant_ok = (
        payload.get("ok") is True
        and int(payload.get("openedCount") or 0) <= 2
        and int(account.get("openTrades") or 0) <= 5
        and account.get("paperOnly") is True
        and account.get("brokerExecution") is False
        and safety.get("ok") is True
    )

    row = {
        **base,
        "ok": bool(invariant_ok),
        "status": "RUN_COMPLETED" if invariant_ok else "INVARIANT_FAILURE",
        "signalsSeen": payload.get("signalsSeen"),
        "paperQualifiedCount": payload.get("paperQualifiedCount"),
        "openedCount": payload.get("openedCount"),
        "closedCount": payload.get("closedCount"),
        "openTrades": account.get("openTrades"),
        "openExposure": account.get("openExposure"),
        "equity": account.get("equity"),
        "safetyOk": safety.get("ok"),
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    append_log(row)
    sys.exit(0 if invariant_ok else 1)

except Exception as exc:
    row = {
        **base,
        "ok": False,
        "status": "ENTRY_DAEMON_ERROR",
        "error": repr(exc),
        "openedCount": 0,
    }
    print(json.dumps(row, ensure_ascii=False), file=sys.stderr)
    append_log(row)
    sys.exit(1)
