#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


VERSION = "s8_14b_setup_learning_report_v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def num(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        x = float(value)
        if math.isnan(x) or math.isinf(x):
            return default
        return x
    except Exception:
        return default


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def load_payload(row: dict[str, Any]) -> dict[str, Any]:
    raw = row.get("payload_json")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def first_value(row: dict[str, Any], payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload and payload.get(key) is not None:
            return payload.get(key)
        if key in row and row.get(key) is not None:
            return row.get(key)
    return None


def calc_rr(payload: dict[str, Any]) -> float | None:
    entry = num(payload.get("entry"))
    stop = num(payload.get("stop"))
    tp1 = num(payload.get("tp1"))
    direction = str(payload.get("direction") or "").lower().strip()

    if entry is None or stop is None or tp1 is None:
        return None

    if direction == "long":
        risk = entry - stop
        reward = tp1 - entry
    elif direction == "short":
        risk = stop - entry
        reward = entry - tp1
    else:
        return None

    if risk <= 0:
        return None
    return round(reward / risk, 3)


def minutes_to_close(payload: dict[str, Any], row: dict[str, Any]) -> float | None:
    trigger = parse_dt(first_value(row, payload, "triggerTime", "trigger_time", "createdAt", "created_at"))
    session_end = parse_dt(payload.get("sessionEnd"))
    if not trigger:
        return None
    if not session_end:
        session_end = trigger.astimezone(timezone.utc).replace(hour=20, minute=0, second=0, microsecond=0)
    return round((session_end - trigger).total_seconds() / 60.0, 2)


def classify_patterns(row: dict[str, Any]) -> list[str]:
    payload = load_payload(row)

    status = str(first_value(row, payload, "status") or "").upper().strip()
    setup = str(first_value(row, payload, "setupSlug", "setup_slug") or "").strip()
    trigger = str(first_value(row, payload, "primaryTrigger", "primary_trigger") or "").strip()

    result_r = num(first_value(row, payload, "resultR", "result_r"), 0) or 0
    mfe_r = num(first_value(row, payload, "mfeR", "mfe_r"), 0) or 0
    mae_r = num(first_value(row, payload, "maeR", "mae_r"), 0) or 0
    time_to_stop = num(payload.get("timeToStopMinutes"), None)
    time_to_tp1 = num(payload.get("timeToTp1Minutes"), None)
    rr = calc_rr(payload)
    mtc = minutes_to_close(payload, row)

    stop_hit = boolish(first_value(row, payload, "stopHit", "stop_hit"))
    tp1_hit = boolish(first_value(row, payload, "tp1Hit", "tp1_hit"))

    patterns: list[str] = []

    if status == "FAILED" or stop_hit or result_r <= -0.9:
        patterns.append("failed_stop")

    if status in {"EXPIRED_SESSION", "NO_EVAL_LATE_SESSION"}:
        patterns.append("expired_or_no_follow_through")

    if mtc is not None and 0 <= mtc <= 20:
        patterns.append("late_session_entry")

    if mtc is not None and 0 <= mtc <= 15 and setup in {
        "vwap_reclaim_long",
        "opening_range_breakout_long",
        "large_cap_vwap_trend_long",
        "large_cap_gap_continuation",
    }:
        patterns.append("late_session_fomo_long")

    if time_to_stop is not None and time_to_stop <= 5:
        patterns.append("instant_stop_within_5m")

    if time_to_stop is not None and time_to_stop <= 10:
        patterns.append("fast_stop_within_10m")

    if (status == "FAILED" or stop_hit) and mfe_r >= 1.0:
        patterns.append("had_1r_mfe_but_failed_management_issue")

    if (status == "FAILED" or stop_hit) and mfe_r < 0.25:
        patterns.append("no_follow_through_before_stop")

    if mae_r >= 2.0:
        patterns.append("mae_above_2r_stop_or_volatility_problem")

    if rr is not None and rr < 2.2:
        patterns.append("rr_below_elite_threshold")

    if setup == "vwap_reclaim_long" and trigger in {"ema20_reclaim_5m", "vwap_reclaim_5m"}:
        patterns.append("single_reclaim_trigger_needs_hold_confirmation")

    if setup in {
        "large_cap_vwap_trend_long",
        "opening_range_breakout_long",
        "large_cap_gap_continuation",
    } and not tp1_hit and mfe_r < 0.5:
        patterns.append("long_breakout_no_follow_through")

    if setup in {
        "premarket_pump_short",
        "gap_and_crap_short",
        "vwap_rejection_short",
        "opening_range_breakdown_short",
    } and status == "FAILED" and mae_r >= 1.0 and mfe_r < 0.5:
        patterns.append("short_entry_before_real_breakdown")

    if not patterns:
        if status == "WORKED" or tp1_hit or result_r > 0:
            patterns.append("worked_clean_or_partial")
        else:
            patterns.append("neutral_unclassified")

    return patterns


def load_outcomes(db_path: Path, lookback_days: int) -> list[dict[str, Any]]:
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=max(1, lookback_days))).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            select *
            from outcome_records
            where coalesce(session_date, '') >= ?
            order by coalesce(session_date, ''), coalesce(trigger_time, stored_at, evaluated_at, '')
            """,
            (cutoff,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def pct(part: int, total: int) -> float | None:
    if total <= 0:
        return None
    return round(part / total * 100, 2)


def avg(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 3)


def simulate_equity(rows: list[dict[str, Any]], initial_capital: float, risk_pct: float) -> dict[str, Any]:
    equity = float(initial_capital)
    peak = equity
    max_drawdown = 0.0
    curve: list[dict[str, Any]] = []

    closed_rows = [
        row for row in rows
        if str(row.get("status") or "").upper() in {"WORKED", "FAILED"}
    ]

    for index, row in enumerate(closed_rows, start=1):
        r = num(row.get("result_r"), 0) or 0
        risk_amount = equity * float(risk_pct)
        pnl = risk_amount * r
        equity += pnl
        peak = max(peak, equity)
        dd = (equity - peak) / peak * 100 if peak else 0
        max_drawdown = min(max_drawdown, dd)

        if index <= 20 or index == len(closed_rows) or index % 25 == 0:
            curve.append({
                "trade": index,
                "date": row.get("session_date"),
                "symbol": row.get("symbol"),
                "setupSlug": row.get("setup_slug"),
                "resultR": r,
                "equity": round(equity, 2),
                "drawdownPct": round(dd, 2),
            })

    total_return_pct = round((equity - initial_capital) / initial_capital * 100, 2) if initial_capital else None

    return {
        "initialCapital": round(initial_capital, 2),
        "riskPctPerTrade": round(risk_pct * 100, 3),
        "closedTrades": len(closed_rows),
        "finalEquity": round(equity, 2),
        "totalReturnPct": total_return_pct,
        "maxDrawdownPct": round(max_drawdown, 2),
        "curveSample": curve,
        "note": "Paper simulation from stored outcomes only. This is investor evidence scaffolding, not a live performance claim.",
    }


def setup_action(setup: str, stat: dict[str, Any], top_patterns: list[tuple[str, int]], min_closed: int) -> dict[str, Any]:
    closed = int(stat.get("closed") or 0)
    win_rate = stat.get("winRateClosed")
    avg_r = stat.get("avgResultRClosed")

    pattern_names = [name for name, _ in top_patterns[:4]]
    rules: list[str] = []
    status = "PAPER_ONLY_UNTIL_SAMPLE_GROWS"

    if closed >= min_closed and win_rate is not None and avg_r is not None:
        if win_rate >= 55 and avg_r >= 0.35:
            status = "PROMOTE_FOR_ELITE_TEST"
            rules.append("Keep eligible for Elite/Best when entry health and RR are clean.")
        elif win_rate >= 45 and avg_r > 0:
            status = "KEEP_AND_TIGHTEN"
            rules.append("Keep in desk rotation, but require clean entry and no chase.")
        elif win_rate < 35 or avg_r <= 0:
            status = "DEMOTE_TO_MONITOR_ONLY"
            rules.append("Do not allow into Elite live layer without super-confirmation.")
        else:
            status = "NEUTRAL_RETEST"
            rules.append("Keep as paper/desk idea until more clean outcomes are collected.")

    if "late_session_entry" in pattern_names or "late_session_fomo_long" in pattern_names:
        rules.append("Block new live entries in last 15-20 minutes before session close.")

    if "instant_stop_within_5m" in pattern_names or "fast_stop_within_10m" in pattern_names:
        rules.append("Require second confirmation candle or re-entry trigger; avoid first touch entries.")

    if "no_follow_through_before_stop" in pattern_names or "long_breakout_no_follow_through" in pattern_names:
        rules.append("Require stronger volume acceleration / follow-through before promoting to Elite.")

    if "had_1r_mfe_but_failed_management_issue" in pattern_names:
        rules.append("Review management: earlier partial, break-even move, or trail after +1R MFE.")

    if "rr_below_elite_threshold" in pattern_names:
        rules.append("Require RR >= 2.2 for desk idea and RR >= 2.5 for weak setups.")

    if "single_reclaim_trigger_needs_hold_confirmation" in pattern_names:
        rules.append("VWAP/EMA reclaim needs hold confirmation, not single reclaim trigger.")

    if "mae_above_2r_stop_or_volatility_problem" in pattern_names:
        rules.append("Filter high-volatility names or use wider structure stop; avoid tight stop in noisy tape.")

    return {
        "learningStatus": status,
        "recommendedRules": rules[:8],
    }


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    db_path = Path(args.db_path)
    rows = load_outcomes(db_path, args.lookback_days) if db_path.exists() else []

    by_setup: dict[str, list[dict[str, Any]]] = defaultdict(list)
    global_patterns: Counter[str] = Counter()

    enriched: list[dict[str, Any]] = []
    for row in rows:
        payload = load_payload(row)
        setup = str(first_value(row, payload, "setupSlug", "setup_slug") or "unknown").strip() or "unknown"
        status = str(first_value(row, payload, "status") or "").upper().strip()
        patterns = classify_patterns(row)

        row2 = dict(row)
        row2["_payload"] = payload
        row2["_setup"] = setup
        row2["_patterns"] = patterns
        row2["_status"] = status
        row2["_resultR"] = num(first_value(row, payload, "resultR", "result_r"), 0) or 0
        row2["_mfeR"] = num(first_value(row, payload, "mfeR", "mfe_r"), 0) or 0
        row2["_maeR"] = num(first_value(row, payload, "maeR", "mae_r"), 0) or 0

        enriched.append(row2)
        by_setup[setup].append(row2)
        global_patterns.update(patterns)

    setup_learning: list[dict[str, Any]] = []
    for setup, items in sorted(by_setup.items()):
        closed_items = [x for x in items if x["_status"] in {"WORKED", "FAILED"}]
        worked = len([x for x in closed_items if x["_status"] == "WORKED" or x["_resultR"] > 0])
        failed = len([x for x in closed_items if x["_status"] == "FAILED" or x["_resultR"] < 0])
        expired = len([x for x in items if x["_status"] in {"EXPIRED_SESSION", "NO_EVAL_LATE_SESSION"}])

        patterns = Counter()
        trigger_counts = Counter()
        worst_examples = []

        for item in items:
            patterns.update(item["_patterns"])
            trigger = str(first_value(item, item["_payload"], "primaryTrigger", "primary_trigger") or "unknown")
            trigger_counts.update([trigger])

        for item in sorted(items, key=lambda x: (x["_resultR"], -x["_maeR"]))[:5]:
            worst_examples.append({
                "symbol": item.get("symbol"),
                "date": item.get("session_date"),
                "status": item["_status"],
                "resultR": item["_resultR"],
                "mfeR": item["_mfeR"],
                "maeR": item["_maeR"],
                "primaryTrigger": first_value(item, item["_payload"], "primaryTrigger", "primary_trigger"),
                "patterns": item["_patterns"][:6],
            })

        stat = {
            "setupSlug": setup,
            "rawCount": len(items),
            "closed": len(closed_items),
            "worked": worked,
            "failed": failed,
            "expiredOrNoEval": expired,
            "winRateClosed": pct(worked, len(closed_items)),
            "avgResultRClosed": avg([x["_resultR"] for x in closed_items]),
            "avgMfeR": avg([x["_mfeR"] for x in items]),
            "avgMaeR": avg([x["_maeR"] for x in items]),
        }

        top_patterns = patterns.most_common(8)
        action = setup_action(setup, stat, top_patterns, args.min_closed)

        setup_learning.append({
            **stat,
            "topFailurePatterns": [
                {"pattern": name, "count": count, "ratePct": pct(count, len(items))}
                for name, count in top_patterns
            ],
            "topTriggers": [
                {"trigger": name, "count": count}
                for name, count in trigger_counts.most_common(8)
            ],
            "worstExamples": worst_examples,
            **action,
        })

    setup_learning.sort(
        key=lambda x: (
            0 if x["learningStatus"] == "PROMOTE_FOR_ELITE_TEST" else
            1 if x["learningStatus"] == "KEEP_AND_TIGHTEN" else
            2 if x["learningStatus"] == "NEUTRAL_RETEST" else
            3 if x["learningStatus"] == "PAPER_ONLY_UNTIL_SAMPLE_GROWS" else
            4,
            -(x.get("closed") or 0),
        )
    )

    closed_all = [x for x in enriched if x["_status"] in {"WORKED", "FAILED"}]
    worked_all = len([x for x in closed_all if x["_status"] == "WORKED" or x["_resultR"] > 0])
    failed_all = len([x for x in closed_all if x["_status"] == "FAILED" or x["_resultR"] < 0])

    telegram_rows = [
        x for x in enriched
        if boolish(x.get("telegram_eligible")) and x["_status"] in {"WORKED", "FAILED"}
    ]
    premium_rows = [
        x for x in enriched
        if boolish(x.get("premium_signal")) and x["_status"] in {"WORKED", "FAILED"}
    ]

    promote = [x for x in setup_learning if x["learningStatus"] == "PROMOTE_FOR_ELITE_TEST"]
    demote = [x for x in setup_learning if x["learningStatus"] == "DEMOTE_TO_MONITOR_ONLY"]
    tighten = [x for x in setup_learning if x["learningStatus"] == "KEEP_AND_TIGHTEN"]

    report = {
        "ok": True,
        "version": VERSION,
        "generatedAt": now_iso(),
        "mode": "setup_learning_report",
        "parameters": {
            "lookbackDays": args.lookback_days,
            "minClosed": args.min_closed,
            "initialCapital": args.initial_capital,
            "riskPct": args.risk_pct,
            "dbPath": str(db_path),
        },
        "summary": {
            "outcomesLoaded": len(rows),
            "closed": len(closed_all),
            "worked": worked_all,
            "failed": failed_all,
            "winRateClosed": pct(worked_all, len(closed_all)),
            "avgResultRClosed": avg([x["_resultR"] for x in closed_all]),
            "setupCount": len(setup_learning),
            "promoteForEliteTest": [x["setupSlug"] for x in promote],
            "keepAndTighten": [x["setupSlug"] for x in tighten],
            "demoteToMonitorOnly": [x["setupSlug"] for x in demote],
            "topGlobalFailurePatterns": [
                {"pattern": name, "count": count, "ratePct": pct(count, len(enriched))}
                for name, count in global_patterns.most_common(12)
            ],
        },
        "investorSimulationDraft": {
            "allClosedOutcomes": simulate_equity(closed_all, args.initial_capital, args.risk_pct),
            "premiumClosedOutcomes": simulate_equity(premium_rows, args.initial_capital, args.risk_pct),
            "telegramEligibleClosedOutcomes": simulate_equity(telegram_rows, args.initial_capital, args.risk_pct),
        },
        "setupLearning": setup_learning,
        "aiLearningLog": [
            "Separate raw candidates, desk ideas, and Elite live signals. Do not judge Elite KPI on raw candidate statistics.",
            "Promote only setups with enough clean closed outcomes, positive avg R, and controlled failure patterns.",
            "Weak setups remain useful for monitor/paper/training, but must not enter Elite live layer without super-confirmation.",
            "Late-session reclaim/breakout longs are treated as FOMO risk unless confirmed by evidence.",
            "Failure patterns become next-session rules: block, tighten, require confirmation, or improve management.",
        ],
        "nextActions": [
            "Wire this report into post-close automation and future Admin Investor Dashboard.",
            "Use setupLearning.learningStatus to influence selector penalties/boosts in S8.14C.",
            "Start marketing only after automated Elite layer has enough closed outcomes, stable win rate, positive expectancy, and controlled drawdown.",
        ],
    }

    return report


def write_report(report: dict[str, Any]) -> dict[str, str]:
    report_dir = Path("reports/setup_learning")
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

    return report["reportFile"]


def main() -> int:
    parser = argparse.ArgumentParser(description="S8.14B setup learning report.")
    parser.add_argument("--db-path", default="data/stock_engine.db")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--min-closed", type=int, default=10)
    parser.add_argument("--initial-capital", type=float, default=50000.0)
    parser.add_argument("--risk-pct", type=float, default=0.005)
    args = parser.parse_args()

    report = build_report(args)
    write_report(report)

    summary = report.get("summary") or {}
    print(json.dumps({
        "ok": report.get("ok"),
        "version": report.get("version"),
        "generatedAt": report.get("generatedAt"),
        "reportFile": report.get("reportFile"),
        "summary": summary,
        "simulation": report.get("investorSimulationDraft"),
    }, ensure_ascii=False, indent=2))

    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())