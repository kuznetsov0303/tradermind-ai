#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys
import urllib.request

URL = "http://127.0.0.1:8000/engine/paper/evaluate-open"
LOG = pathlib.Path(
    "/opt/skilledge/stock-engine/data/paper_trading/"
    "s10_50k/evaluation_daemon.log"
)

try:
    request = urllib.request.Request(URL, method="POST")
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(
            response.read().decode("utf-8", errors="replace")
        )

    row = {
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ok": bool(payload.get("ok")),
        "version": "s10_3n_evaluation_only_daemon_v1",
        "mode": payload.get("mode"),
        "openedCount": payload.get("openedCount"),
        "closedCount": payload.get("closedCount"),
        "openTradesBefore": payload.get("openTradesBefore"),
        "openTradesAfter": payload.get("openTradesAfter"),
        "equity": (payload.get("account") or {}).get("equity"),
        "unrealizedPnl": (payload.get("account") or {}).get("unrealizedPnl"),
        "realizedPnl": (payload.get("account") or {}).get("realizedPnl"),
        "paperOnly": True,
        "brokerExecution": False,
    }

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    code = 0 if payload.get("ok") else 1
except Exception as exc:
    row = {
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ok": False,
        "version": "s10_3n_evaluation_only_daemon_v1",
        "error": repr(exc),
        "paperOnly": True,
        "brokerExecution": False,
    }
    print(json.dumps(row, ensure_ascii=False), file=sys.stderr)
    code = 1

try:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n"
        )
except Exception:
    pass

sys.exit(code)
