#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request


VERSION = "s8_20d_post_close_night_calibration_chain_v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def call_json(base_url: str, method: str, path: str, timeout: int = 180) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    req = request.Request(url, method=method.upper())
    started = time.time()

    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw)
            return {
                "ok": True,
                "url": url,
                "method": method.upper(),
                "status": getattr(response, "status", None),
                "durationSeconds": round(time.time() - started, 3),
                "payload": payload,
            }
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:4000]
        return {
            "ok": False,
            "url": url,
            "method": method.upper(),
            "status": exc.code,
            "durationSeconds": round(time.time() - started, 3),
            "error": body,
        }
    except Exception as exc:
        return {
            "ok": False,
            "url": url,
            "method": method.upper(),
            "durationSeconds": round(time.time() - started, 3),
            "error": repr(exc),
        }


def unwrap(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("value"), dict):
        return payload["value"]
    return payload if isinstance(payload, dict) else {}


def write_report(report: dict[str, Any]) -> dict[str, Any]:
    report_dir = Path("reports/post_close_evidence")
    report_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dated = report_dir / f"{stamp}.json"
    latest = report_dir / "latest.json"

    body = json.dumps(report, ensure_ascii=False, indent=2)
    dated.write_text(body, encoding="utf-8")
    latest.write_text(body, encoding="utf-8")

    return {
        "path": str(dated),
        "latestPath": str(latest),
    }


def compact_evidence(value: dict[str, Any]) -> dict[str, Any]:
    summary = value.get("investorSummary") if isinstance(value.get("investorSummary"), dict) else {}
    selected = value.get("selectedBestIdeas") if isinstance(value.get("selectedBestIdeas"), list) else []
    outcome = value.get("outcomeEvidence") if isinstance(value.get("outcomeEvidence"), dict) else {}
    setup = value.get("setupEvidence") if isinstance(value.get("setupEvidence"), dict) else {}

    return {
        "version": value.get("version"),
        "headline": value.get("headline"),
        "state": summary.get("state"),
        "selectedBestCount": summary.get("selectedBestCount"),
        "selectedSymbols": summary.get("selectedSymbols"),
        "globalClosedOutcomes": summary.get("globalClosedOutcomes"),
        "globalWinRateClosed": summary.get("globalWinRateClosed"),
        "globalAvgResultRClosed": summary.get("globalAvgResultRClosed"),
        "todayClosedOutcomes": summary.get("todayClosedOutcomes"),
        "todayWinRateClosed": summary.get("todayWinRateClosed"),
        "todayAvgResultRClosed": summary.get("todayAvgResultRClosed"),
        "matchedSelectedOutcomes": summary.get("matchedSelectedOutcomes"),
        "selectedSample": [
            {
                "rank": row.get("rank"),
                "symbol": row.get("symbol"),
                "setupSlug": row.get("setupSlug"),
                "direction": row.get("direction"),
                "currentR": row.get("currentR"),
                "tradeAction": row.get("tradeAction"),
                "outcome": row.get("outcome"),
            }
            for row in selected[:5]
            if isinstance(row, dict)
        ],
        "bestSetups": setup.get("bestByAvgRClosed") if isinstance(setup.get("bestByAvgRClosed"), list) else [],
        "weakSetups": setup.get("weakByAvgRClosed") if isinstance(setup.get("weakByAvgRClosed"), list) else [],
        "outcomeCounts": {
            "today": (outcome.get("today") or {}).get("count") if isinstance(outcome.get("today"), dict) else None,
            "global": (outcome.get("global") or {}).get("count") if isinstance(outcome.get("global"), dict) else None,
        },
        "reportFile": value.get("reportFile"),
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    base_url = args.base_url.rstrip("/")

    steps: list[dict[str, Any]] = []

    health = call_json(base_url, "GET", "/health", timeout=60)
    steps.append({"name": "health", **health})

    outcomes_path = (
        "/engine/outcomes/run-today"
        "?interval=5min"
        "&use_trigger_time=true"
        "&session_to_close=true"
        "&source=post_close_evidence"
    )
    if args.skip_outcomes:
        outcomes = {"ok": True, "skipped": True, "reason": "skip_outcomes"}
    else:
        outcomes = call_json(base_url, "POST", outcomes_path, timeout=args.timeout)
    steps.append({"name": "outcomes_run_today", **outcomes})

    forward_path = f"/engine/forward-report/run?limit={args.limit}&max_best={args.max_best}&publish=true"
    forward = call_json(base_url, "POST", forward_path, timeout=args.timeout)
    steps.append({"name": "forward_report_run", **forward})

    # S8.16E: Clean Elite post-close chain.
    # Keep the 5-minute clean-elite-capture timer lightweight during the session,
    # but make the true post-close run close the learning loop.
    clean_timeout = max(int(args.timeout or 180), 420)

    clean_capture = call_json(
        base_url,
        "POST",
        "/engine/clean-elite/capture?source=post_close_evidence&publish=true",
        timeout=args.timeout,
    )
    steps.append({"name": "clean_elite_capture", **clean_capture})

    clean_outcomes = call_json(
        base_url,
        "POST",
        "/engine/clean-elite/outcomes/run?"
        "elite_layer=CLEAN_ELITE_TEST"
        "&interval=5min"
        "&use_trigger_time=true"
        "&session_to_close=true"
        "&limit=200"
        "&capture_first=false"
        "&publish=true",
        timeout=clean_timeout,
    )
    steps.append({"name": "clean_elite_outcomes_run", **clean_outcomes})

    clean_sync = call_json(
        base_url,
        "POST",
        "/engine/clean-elite/supabase/sync?elite_layer=ALL&limit=1000",
        timeout=args.timeout,
    )
    steps.append({"name": "clean_elite_supabase_sync", **clean_sync})

    clean_stats = call_json(
        base_url,
        "POST",
        "/engine/clean-elite/stats/run?initial_capital=50000&risk_pct=0.01&publish=true",
        timeout=args.timeout,
    )
    steps.append({"name": "clean_elite_stats_run", **clean_stats})

    # S8.20D: refresh read-only night calibration cache after post-close outcomes/stats.
    # Non-fatal by design: calibration must never break the post-close evidence chain.
    night_calibration = call_json(
        base_url,
        "POST",
        "/engine/night-calibration/recommendations/run?publish=true&min_closed=5",
        timeout=args.timeout,
    )
    steps.append({"name": "night_calibration_recommendations_run", "required": False, **night_calibration})

    evidence_path = f"/engine/evidence/run?limit={args.limit}&max_best={args.max_best}&publish=true"
    evidence = call_json(base_url, "POST", evidence_path, timeout=args.timeout)
    steps.append({"name": "evidence_run", **evidence})

    evidence_value = unwrap(evidence.get("payload")) if evidence.get("ok") else {}
    forward_value = unwrap(forward.get("payload")) if forward.get("ok") else {}
    outcomes_value = unwrap(outcomes.get("payload")) if isinstance(outcomes, dict) else {}
    night_calibration_value = unwrap(night_calibration.get("payload")) if night_calibration.get("ok") else {}
    night_calibration_decision = (
        night_calibration_value.get("decisionSummary")
        if isinstance(night_calibration_value.get("decisionSummary"), dict)
        else {}
    )

    forward_state = (
        (forward_value.get("dailyDeskState") or {}).get("state")
        if isinstance(forward_value.get("dailyDeskState"), dict) else None
    )
    forward_selected_best_count = (
        len(forward_value.get("selectedBestIdeas") or [])
        if isinstance(forward_value.get("selectedBestIdeas"), list) else None
    )

    # S8.52B1: no-trade post-close should not fail systemd.
    # If the desk correctly produced NO_TRADE_NO_BEST_IDEA, evidence/clean stats can be empty.
    # This is an honest no-trade state, not an ops failure.
    no_trade_non_fatal = (
        forward_state == "NO_TRADE_NO_BEST_IDEA"
        and int(forward_selected_best_count or 0) == 0
    )

    clean_stats_effective_ok = bool(clean_stats.get("ok")) or no_trade_non_fatal
    evidence_effective_ok = bool(evidence.get("ok")) or no_trade_non_fatal

    ok = bool(
        health.get("ok")
        and outcomes.get("ok")
        and forward.get("ok")
        and clean_capture.get("ok")
        and clean_outcomes.get("ok")
        and clean_sync.get("ok")
        and clean_stats_effective_ok
        and evidence_effective_ok
    )

    report: dict[str, Any] = {
        "ok": ok,
        "version": VERSION,
        "generatedAt": now_iso(),
        "mode": "post_close_evidence_automation",
        "baseUrl": base_url,
        "parameters": {
            "limit": args.limit,
            "maxBest": args.max_best,
            "skipOutcomes": bool(args.skip_outcomes),
        },
        "summary": {
            "healthOk": health.get("ok"),
            "outcomesOk": outcomes.get("ok"),
            "forwardReportOk": forward.get("ok"),
            "cleanEliteCaptureOk": clean_capture.get("ok"),
            "cleanEliteOutcomesOk": clean_outcomes.get("ok"),
            "cleanEliteSupabaseSyncOk": clean_sync.get("ok"),
            "cleanEliteStatsOk": clean_stats.get("ok"),
            "cleanEliteStatsEffectiveOk": clean_stats_effective_ok,
            "cleanEliteStatsNonFatalNoTrade": bool(no_trade_non_fatal and not clean_stats.get("ok")),
            "nightCalibrationOk": night_calibration.get("ok"),
            "nightCalibrationNonFatal": True,
            "nightCalibrationTopAction": night_calibration_decision.get("topAction"),
            "nightCalibrationSafeToApplyAutomatically": night_calibration_decision.get("safeToApplyAutomatically"),
            "nightCalibrationTotals": night_calibration_value.get("totals") if isinstance(night_calibration_value, dict) else None,
            "evidenceOk": evidence.get("ok"),
            "evidenceEffectiveOk": evidence_effective_ok,
            "evidenceNonFatalNoTrade": bool(no_trade_non_fatal and not evidence.get("ok")),
            "postCloseNoTradeNonFatal": bool(no_trade_non_fatal),
            "forwardState": forward_state,
            "forwardSelectedBestCount": forward_selected_best_count,
            "evidence": compact_evidence(evidence_value),
            "outcomes": {
                "ok": outcomes_value.get("ok"),
                "total": outcomes_value.get("total"),
                "closed": outcomes_value.get("closed"),
                "worked": outcomes_value.get("worked"),
                "failed": outcomes_value.get("failed"),
                "winRateClosed": outcomes_value.get("winRateClosed"),
            },
        },
        "steps": steps,
    }

    # S8.13-2: make the saved latest.json self-contained.
    # First compute target paths, then write the final report including reportFile.
    report_dir = Path("reports/post_close_evidence")
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dated = report_dir / f"{stamp}.json"
    latest = report_dir / "latest.json"
    report["reportFile"] = {
        "path": str(dated),
        "latestPath": str(latest),
    }
    body = json.dumps(report, ensure_ascii=False, indent=2)
    dated.write_text(body, encoding="utf-8")
    latest.write_text(body, encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="S8.13 post-close evidence automation.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--limit", type=int, default=160)
    parser.add_argument("--max-best", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("--skip-outcomes", action="store_true")
    args = parser.parse_args()

    report = run(args)
    print(json.dumps({
        "ok": report.get("ok"),
        "version": report.get("version"),
        "generatedAt": report.get("generatedAt"),
        "reportFile": report.get("reportFile"),
        "summary": report.get("summary"),
    }, ensure_ascii=False, indent=2))

    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
