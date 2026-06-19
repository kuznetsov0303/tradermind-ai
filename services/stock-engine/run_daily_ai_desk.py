from __future__ import annotations

import argparse
import time
from typing import Any

from ops.market_calendar import market_session_snapshot
from ops.runner_utils import (
    in_kyiv_window,
    load_dotenv,
    now_kyiv,
    save_json_report,
    step,
    step_first_ok,
)


VERSION = "s8_4a_market_holiday_guard_v1"


def run_once(args: argparse.Namespace) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    market_session = market_session_snapshot()

    steps.append(step("health", "GET", "/health", timeout=20))

    live_blocked_by_market = (
        bool(args.respect_market_calendar)
        and not bool(market_session.get("liveEngineAllowed"))
    )

    if live_blocked_by_market:
        steps.append(
            step(
                "calibration_preview_cache",
                "GET",
                "/engine/calibration/preview/cache",
                timeout=30,
            )
        )

        report = {
            "ok": all(item.get("ok") for item in steps),
            "version": VERSION,
            "mode": "daily_ai_desk_once",
            "generatedAtKyiv": now_kyiv().isoformat(),
            "skippedLiveEngine": True,
            "reason": market_session.get("reason") or "market_calendar_blocked",
            "marketSession": market_session,
            "window": {
                "startKyiv": args.start_kyiv,
                "endKyiv": args.end_kyiv,
                "insideWindow": in_kyiv_window(args.start_kyiv, args.end_kyiv),
            },
            "steps": steps,
            "safety": {
                "discoverySkipped": True,
                "telegramLiveSignalsShouldBeBlocked": True,
                "engineWeightsChanged": False,
                "note": "Market calendar guard blocks live discovery/signals on weekends, full exchange holidays, and after early close.",
            },
        }
        path = save_json_report("daily_ai_desk", report)
        report["reportPath"] = str(path)
        return report

    if args.discovery:
        steps.append(
            step(
                "discovery_refresh",
                "POST",
                "/engine/discovery/refresh",
                timeout=args.discovery_timeout,
            )
        )

    steps.append(
        step(
            "runtime_source_status",
            "GET",
            "/engine/runtime/source-status",
            params={"limit": args.limit},
            timeout=60,
        )
    )

    steps.append(
        step_first_ok(
            "cockpit_snapshot",
            [
                {
                    "label": "cockpit",
                    "method": "GET",
                    "path": "/engine/cockpit",
                    "params": {"limit": args.limit},
                },
                {
                    "label": "signal_cockpit_legacy",
                    "method": "GET",
                    "path": "/engine/signal-cockpit",
                    "params": {"limit": args.limit},
                },
                {
                    "label": "runtime_source_status_fallback",
                    "method": "GET",
                    "path": "/engine/runtime/source-status",
                    "params": {"limit": args.limit},
                },
            ],
            timeout=60,
            optional=True,
        )
    )

    steps.append(
        step(
            "calibration_preview_cache",
            "GET",
            "/engine/calibration/preview/cache",
            timeout=30,
        )
    )

    ok = all(item.get("ok") for item in steps)
    report = {
        "ok": ok,
        "version": VERSION,
        "mode": "daily_ai_desk_once",
        "generatedAtKyiv": now_kyiv().isoformat(),
        "skippedLiveEngine": False,
        "marketSession": market_session,
        "window": {
            "startKyiv": args.start_kyiv,
            "endKyiv": args.end_kyiv,
            "insideWindow": in_kyiv_window(args.start_kyiv, args.end_kyiv),
        },
        "steps": steps,
    }
    path = save_json_report("daily_ai_desk", report)
    report["reportPath"] = str(path)
    return report


def _outside_window_report(args: argparse.Namespace) -> dict[str, Any]:
    market_session = market_session_snapshot()
    report = {
        "ok": True,
        "version": VERSION,
        "mode": "daily_ai_desk_once",
        "skipped": True,
        "reason": "outside_kyiv_trading_window",
        "generatedAtKyiv": now_kyiv().isoformat(),
        "marketSession": market_session,
        "window": {"startKyiv": args.start_kyiv, "endKyiv": args.end_kyiv},
    }
    path = save_json_report("daily_ai_desk", report)
    report["reportPath"] = str(path)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="S8.4A daily AI desk runner with market holiday guard.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    parser.add_argument("--loop", action="store_true", help="Run continuously.")
    parser.add_argument("--interval-seconds", type=int, default=300)
    parser.add_argument("--start-kyiv", default="11:00")
    parser.add_argument("--end-kyiv", default="23:00")
    parser.add_argument("--limit", type=int, default=160)
    parser.add_argument("--discovery", action="store_true", default=True)
    parser.add_argument("--skip-discovery", dest="discovery", action="store_false")
    parser.add_argument("--discovery-timeout", type=int, default=600)
    parser.add_argument("--respect-session-window", action="store_true", default=True)
    parser.add_argument("--ignore-session-window", dest="respect_session_window", action="store_false")
    parser.add_argument("--respect-market-calendar", action="store_true", default=True)
    parser.add_argument("--ignore-market-calendar", dest="respect_market_calendar", action="store_false")
    args = parser.parse_args()

    load_dotenv(".env")
    load_dotenv(".env.server")

    if args.once or not args.loop:
        if args.respect_session_window and not in_kyiv_window(args.start_kyiv, args.end_kyiv):
            report = _outside_window_report(args)
            print(f"Skipped outside session window. Report: {report.get('reportPath')}")
            return 0

        report = run_once(args)
        print(f"Daily AI desk report: {report.get('reportPath')}")
        if report.get("skippedLiveEngine"):
            print(f"Live engine skipped by market calendar: {report.get('reason')}")
        return 0 if report.get("ok") else 1

    while True:
        try:
            if (not args.respect_session_window) or in_kyiv_window(args.start_kyiv, args.end_kyiv):
                report = run_once(args)
                print(f"Daily AI desk report: {report.get('reportPath')}")
                if report.get("skippedLiveEngine"):
                    print(f"Live engine skipped by market calendar: {report.get('reason')}")
            else:
                print(f"[{now_kyiv().isoformat()}] outside Kyiv trading window; sleeping.")
        except Exception as error:
            print(f"[{now_kyiv().isoformat()}] runner error: {error!r}")
        time.sleep(max(30, int(args.interval_seconds or 300)))


if __name__ == "__main__":
    raise SystemExit(main())
