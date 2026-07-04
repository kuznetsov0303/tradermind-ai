from __future__ import annotations

import argparse
from typing import Any

from ops.runner_utils import (
    load_dotenv,
    now_kyiv,
    save_json_report,
    step,
    weekday_dates_ending_today,
)


VERSION = "s8_33a_nightly_learning_memory_rebuild_v1"


def parse_dates(raw: str | None, lookback_days: int) -> list[str]:
    if raw:
        out = []
        for part in raw.replace(";", ",").split(","):
            value = part.strip()
            if value:
                out.append(value[:10])
        return out
    return weekday_dates_ending_today(count=max(1, lookback_days), include_today=True)


def run_nightly(args: argparse.Namespace) -> dict[str, Any]:
    dates = parse_dates(args.session_dates, args.lookback_days)
    date_csv = ",".join(dates)

    steps: list[dict[str, Any]] = []
    steps.append(step("health", "GET", "/health", timeout=20))

    if not args.skip_live_outcomes:
        steps.append(
            step(
                "live_outcomes_run_today",
                "POST",
                "/engine/outcomes/run-today",
                params={
                    "interval": args.live_interval,
                    "use_trigger_time": "true",
                    "session_to_close": "true",
                    "source": "auto",
                    "session_date": args.live_session_date,
                    "limit": args.live_limit,
                },
                timeout=args.outcome_timeout,
            )
        )

    if not args.skip_replay:
        steps.append(
            step(
                "multi_day_replay",
                "POST",
                "/engine/replay/multiday/run",
                params={
                    "session_dates": date_csv,
                    "cutoff_kyiv_time": args.cutoff_kyiv_time,
                    "session_close_kyiv_time": args.session_close_kyiv_time,
                    "interval": args.replay_interval,
                    "limit": args.limit,
                    "max_candidates": args.max_candidates,
                    "min_closed": args.min_closed,
                    "apply_adjustments": "false",
                    "run_replay": "true",
                    "max_days": args.max_days,
                    "publish": "true",
                },
                timeout=args.replay_timeout,
            )
        )

    steps.append(
        step(
            "research_rebuild_outcomes",
            "POST",
            "/engine/research/rebuild-outcomes",
            params={
                "session_date": dates[-1] if dates else None,
                "limit": min(args.limit, 50),
                "apply": "true",
            },
            timeout=300,
        )
    )

    steps.append(
        step(
            "hybrid_calibration",
            "POST",
            "/engine/calibration/hybrid/run",
            params={
                "session_dates": date_csv,
                "source_mode": args.source_mode,
                "min_closed": args.min_closed,
                "apply_adjustments": "false",
                "publish": "true",
                "max_days": args.max_days,
            },
            timeout=120,
        )
    )

    steps.append(
        step(
            "controlled_preview",
            "POST",
            "/engine/calibration/preview/run",
            params={
                "session_dates": date_csv,
                "source_mode": args.source_mode,
                "min_closed": args.min_closed,
                "publish": "true",
                "max_days": args.max_days,
            },
            timeout=120,
        )
    )

    steps.append(
        step(
            "controlled_preview_cache",
            "GET",
            "/engine/calibration/preview/cache",
            timeout=30,
        )
    )

    ok = all(item.get("ok") for item in steps)
    report = {
        "ok": ok,
        "version": VERSION,
        "mode": "nightly_self_learning_report_only",
        "generatedAtKyiv": now_kyiv().isoformat(),
        "sessionDates": dates,
        "applyAdjustments": False,
        "safety": {
            "engineWeightsChanged": False,
            "reason": "S8.0 runner always uses apply_adjustments=false.",
        },
        "steps": steps,
    }
    path = save_json_report("nightly_self_learning", report)
    report["reportPath"] = str(path)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="S8.0 nightly self-learning runner.")
    parser.add_argument("--session-dates", default=None, help="Comma-separated YYYY-MM-DD dates.")
    parser.add_argument("--lookback-days", type=int, default=3)
    parser.add_argument("--max-days", type=int, default=3)
    parser.add_argument("--cutoff-kyiv-time", default="22:40")
    parser.add_argument("--session-close-kyiv-time", default="23:00")
    parser.add_argument("--source-mode", default="hybrid", choices=["hybrid", "replay", "forward"])
    parser.add_argument("--min-closed", type=int, default=10)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--max-candidates", type=int, default=50)
    parser.add_argument("--replay-interval", default="1min")
    parser.add_argument("--live-interval", default="5min")
    parser.add_argument("--live-session-date", default=None)
    parser.add_argument("--live-limit", type=int, default=500)
    parser.add_argument("--skip-live-outcomes", action="store_true")
    parser.add_argument("--skip-replay", action="store_true")
    parser.add_argument("--outcome-timeout", type=int, default=240)
    parser.add_argument("--replay-timeout", type=int, default=900)
    args = parser.parse_args()

    load_dotenv(".env")
    report = run_nightly(args)
    print(f"Nightly self-learning report: {report.get('reportPath')}")
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
