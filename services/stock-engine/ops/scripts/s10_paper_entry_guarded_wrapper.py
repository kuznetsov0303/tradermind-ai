#!/usr/bin/env python3
import json
import subprocess
import sys
import urllib.request
from typing import Any, Dict

STATUS_URL = "http://127.0.0.1:8000/engine/paper/status"
ORIGINAL = "/opt/skilledge/stock-engine/ops/scripts/s10_paper_entry_guarded_daemon.py"

def fetch_status() -> Dict[str, Any]:
    with urllib.request.urlopen(STATUS_URL, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))

def print_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)

def main() -> int:
    # Preflight only prevents a new-entry cycle when the account clearly has no entry capacity.
    # It does NOT mutate the account and does NOT replace evaluation-only lifecycle handling.
    try:
        payload = fetch_status()
        account = payload.get("account") or {}
        open_trades = int(payload.get("openTrades", account.get("openTrades", 0)) or 0)
        max_open = int(account.get("maxOpenTrades", 5) or 5)
        exposure = float(payload.get("openExposure", account.get("openExposure", 0.0)) or 0.0)
        equity = float(payload.get("equity", account.get("equity", 0.0)) or 0.0)
        buying_power = float(account.get("currentBuyingPower", 0.0) or 0.0)
        paper_only = bool(payload.get("paperOnly", account.get("paperOnly", False)))
        broker_execution = bool(payload.get("brokerExecution", account.get("brokerExecution", True)))

        no_capacity = (
            open_trades >= max_open
            or buying_power <= 0.0
            or (equity > 0.0 and exposure >= equity)
        )

        if paper_only and not broker_execution and no_capacity:
            print_json({
                "ok": True,
                "version": "s10_4d_runtime_semantics_wrapper_v1",
                "status": "SKIPPED_CAPACITY",
                "openTrades": open_trades,
                "maxOpenTrades": max_open,
                "openExposure": round(exposure, 2),
                "equity": round(equity, 2),
                "currentBuyingPower": round(buying_power, 2),
                "paperOnly": True,
                "brokerExecution": False,
                "newEntriesAttempted": False,
            })
            return 0
    except Exception as exc:
        # Preflight failure must not silently suppress the original guarded daemon.
        print_json({
            "ok": False,
            "version": "s10_4d_runtime_semantics_wrapper_v1",
            "status": "PREFLIGHT_WARNING_CONTINUING_TO_ORIGINAL",
            "error": f"{type(exc).__name__}: {exc}",
        })

    proc = subprocess.run(
        [sys.executable, ORIGINAL],
        text=True,
        capture_output=True,
    )

    if proc.stdout:
        print(proc.stdout, end="" if proc.stdout.endswith("\n") else "\n", flush=True)
    if proc.stderr:
        print(proc.stderr, end="" if proc.stderr.endswith("\n") else "\n", file=sys.stderr, flush=True)

    if proc.returncode == 0:
        return 0

    text = (proc.stdout or "").strip()
    try:
        result = json.loads(text) if text else {}
    except Exception:
        result = {}

    if result.get("status") == "SKIPPED_ALREADY_RUNNING":
        print_json({
            "ok": True,
            "version": "s10_4d_runtime_semantics_wrapper_v1",
            "status": "SAFE_NOOP_ALREADY_RUNNING",
            "originalReturnCode": proc.returncode,
            "paperOnly": result.get("paperOnly"),
            "brokerExecution": result.get("brokerExecution"),
        })
        return 0

    return proc.returncode or 1

if __name__ == "__main__":
    raise SystemExit(main())
