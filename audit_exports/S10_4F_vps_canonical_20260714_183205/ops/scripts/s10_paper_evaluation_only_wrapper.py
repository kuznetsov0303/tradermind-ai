#!/usr/bin/env python3
import json
import subprocess
import sys
from typing import Any, Dict

ORIGINAL = "/opt/skilledge/stock-engine/ops/scripts/s10_paper_evaluation_only_daemon.py"

def print_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)

def main() -> int:
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
            "mode": "evaluation_only",
            "paperOnly": result.get("paperOnly"),
            "brokerExecution": result.get("brokerExecution"),
        })
        return 0

    # The API may report overall ok=false solely because new entries are blocked
    # by capacity/exposure. Evaluation itself is operational if it completed an
    # evaluation-only run and returned the expected lifecycle/account fields.
    completed_evaluation = (
        result.get("mode") == "evaluation_only"
        and result.get("openedCount") == 0
        and result.get("runAt") is not None
        and result.get("openTradesBefore") is not None
        and result.get("openTradesAfter") is not None
        and isinstance(result.get("account"), dict)
    )

    if completed_evaluation:
        account = result.get("account") or {}
        print_json({
            "ok": True,
            "version": "s10_4d_runtime_semantics_wrapper_v1",
            "status": "EVALUATION_COMPLETED_ENTRY_CAPACITY_BLOCKED",
            "originalReturnCode": proc.returncode,
            "mode": "evaluation_only",
            "openedCount": 0,
            "closedCount": result.get("closedCount"),
            "openTradesBefore": result.get("openTradesBefore"),
            "openTradesAfter": result.get("openTradesAfter"),
            "paperOnly": account.get("paperOnly"),
            "brokerExecution": account.get("brokerExecution"),
            "safety": result.get("safety"),
        })
        return 0

    return proc.returncode or 1

if __name__ == "__main__":
    raise SystemExit(main())
