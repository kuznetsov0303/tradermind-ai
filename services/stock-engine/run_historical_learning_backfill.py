#!/usr/bin/env python3
"""S8.74 Historical Learning Scheduler Runner.

Calls the local stock-engine API to create a safe backfill plan when needed and run
one or more pending chunks. Designed for systemd timer execution.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


VERSION = "s8_74_historical_learning_scheduler_runner_v1"


def request_json(method: str, url: str, timeout: int = 900) -> dict:
    req = urllib.request.Request(url, method=method, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def build_url(base: str, path: str, params: dict[str, object]) -> str:
    clean = {k: v for k, v in params.items() if v is not None}
    return base.rstrip("/") + path + "?" + urllib.parse.urlencode(clean)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--symbols", default="AAPL,NVDA,TSLA")
    parser.add_argument("--intervals", default="5min")
    parser.add_argument("--years-back", type=int, default=5)
    parser.add_argument("--max-days", type=int, default=5)
    parser.add_argument("--chunk-days", type=int, default=1)
    parser.add_argument("--max-jobs", type=int, default=1)
    parser.add_argument("--max-candidates", type=int, default=5000)
    parser.add_argument("--sync-supabase", default="true")
    parser.add_argument("--force-new-plan", action="store_true")
    parser.add_argument("--sleep-before", type=int, default=0)
    args = parser.parse_args()

    if args.sleep_before > 0:
        time.sleep(args.sleep_before)

    report = {
        "ok": True,
        "version": VERSION,
        "generatedAtEpoch": time.time(),
        "steps": [],
        "errors": [],
    }

    try:
        status_url = build_url(args.base_url, "/engine/research/historical-learning/backfill/status", {})
        try:
            status = request_json("GET", status_url, timeout=60)
        except Exception as exc:
            status = {"ok": False, "error": str(exc)}

        needs_plan = args.force_new_plan or not status.get("ok") or not (status.get("summary") or {}).get("pending")

        if needs_plan:
            plan_url = build_url(
                args.base_url,
                "/engine/research/historical-learning/backfill/plan",
                {
                    "symbols": args.symbols,
                    "intervals": args.intervals,
                    "years_back": args.years_back,
                    "max_days": args.max_days,
                    "chunk_days": args.chunk_days,
                    "reset": "true",
                    "publish": "true",
                },
            )
            plan = request_json("POST", plan_url, timeout=120)
            report["steps"].append({"name": "plan", "ok": bool(plan.get("ok")), "summary": plan.get("summary")})

        run_url = build_url(
            args.base_url,
            "/engine/research/historical-learning/backfill/run-next-guarded",
            {
                "max_jobs": args.max_jobs,
                "sync_supabase": args.sync_supabase,
                "max_candidates": args.max_candidates,
                "publish": "true",
            },
        )
        run = request_json("POST", run_url, timeout=1800)
        report["steps"].append({"name": "run_next", "ok": bool(run.get("ok")), "queueSummary": run.get("queueSummary")})
        if not run.get("ok"):
            report["ok"] = False
            report["errors"].append(run)

    except Exception as exc:
        report["ok"] = False
        report["errors"].append({"type": "exception", "message": str(exc)})

    out_dir = Path("reports/historical_learning/scheduler")
    out_dir.mkdir(parents=True, exist_ok=True)
    latest = out_dir / "latest_s874_scheduler.json"
    latest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
