from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import os
import sys
import traceback

VERSION = "s9_00_forward_shadow_promotion_gate_report_v1"

MIN_DAYS = int(os.environ.get("S900_MIN_FORWARD_SHADOW_DAYS", "15"))
MIN_DECISIONS = int(os.environ.get("S900_MIN_DECISION_TRADES", "50"))
MIN_WIN_RATE = float(os.environ.get("S900_MIN_WIN_RATE", "0.65"))
MIN_AVG_R = float(os.environ.get("S900_MIN_AVG_R", "0.03"))

ROOT = Path("/opt/skilledge/stock-engine/data")
FORWARD_ROOT = ROOT / "forward_shadow"
REGISTRY_PATH = FORWARD_ROOT / "live_shadow_candidates.json"
CUMULATIVE_PATH = FORWARD_ROOT / "cumulative" / "forward_shadow_outcomes.jsonl"
REPORT_DIR = FORWARD_ROOT / "promotion_gate"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_jsonl(path: Path):
    if not path.exists():
        return
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except Exception:
                    continue
                if isinstance(payload, dict):
                    yield payload
    except Exception:
        return


def as_float(value, default=0.0):
    try:
        if value is None:
            return default
        x = float(value)
        if math.isnan(x):
            return default
        return x
    except Exception:
        return default


def metric(rows):
    total = len(rows)
    decisions = [r for r in rows if str(r.get("status")).upper() in ("WORKED", "FAILED")]
    wins = [r for r in decisions if str(r.get("status")).upper() == "WORKED"]
    losses = [r for r in decisions if str(r.get("status")).upper() == "FAILED"]
    decision_count = len(decisions)
    avg_r = sum(as_float(r.get("resultR"), 0.0) for r in decisions) / decision_count if decision_count else 0.0
    dates = sorted(set(str(r.get("date") or "") for r in rows if r.get("date")))
    symbols = sorted(set(str(r.get("symbol") or "") for r in rows if r.get("symbol")))
    return {
        "totalTrades": total,
        "decisionTrades": decision_count,
        "wins": len(wins),
        "losses": len(losses),
        "ignored": total - decision_count,
        "decisionRate": round(decision_count / total, 6) if total else 0.0,
        "winRate": round(len(wins) / decision_count, 6) if decision_count else 0.0,
        "avgR": round(avg_r, 6),
        "uniqueForwardDates": len(dates),
        "firstForwardDate": dates[0] if dates else None,
        "lastForwardDate": dates[-1] if dates else None,
        "uniqueSymbols": len(symbols),
        "symbols": symbols[:50],
    }


def classify(m):
    reasons = []
    if m["uniqueForwardDates"] < MIN_DAYS:
        reasons.append(f"need more forward-shadow days: {m['uniqueForwardDates']} < {MIN_DAYS}")
    if m["decisionTrades"] < MIN_DECISIONS:
        reasons.append(f"need more forward decisions: {m['decisionTrades']} < {MIN_DECISIONS}")
    if m["decisionTrades"] >= MIN_DECISIONS and m["winRate"] < MIN_WIN_RATE:
        reasons.append(f"forward WR below threshold: {m['winRate']:.4f} < {MIN_WIN_RATE:.4f}")
    if m["decisionTrades"] >= MIN_DECISIONS and m["avgR"] < MIN_AVG_R:
        reasons.append(f"forward avgR below threshold: {m['avgR']:.4f} < {MIN_AVG_R:.4f}")

    if m["uniqueForwardDates"] < MIN_DAYS or m["decisionTrades"] < MIN_DECISIONS:
        return {
            "status": "WAITING_FOR_SAMPLE",
            "reasons": reasons,
            "manualApprovalEligible": False,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
        }

    if reasons:
        return {
            "status": "FORWARD_SHADOW_FAILED_REVIEW_REQUIRED",
            "reasons": reasons,
            "manualApprovalEligible": False,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
        }

    return {
        "status": "FORWARD_SHADOW_HEALTHY_REVIEW_CANDIDATE",
        "reasons": ["Forward-shadow thresholds met; still requires manual/admin approval before any production/client/Telegram release."],
        "manualApprovalEligible": True,
        "clientReleaseAllowed": False,
        "telegramAllowed": False,
        "productionEligible": False,
    }


def main():
    registry = read_json(REGISTRY_PATH)
    if not isinstance(registry, dict):
        raise RuntimeError(f"Cannot read registry: {REGISTRY_PATH}")

    candidates = registry.get("candidates") or []
    by_candidate = defaultdict(list)
    all_rows = []

    for row in read_jsonl(CUMULATIVE_PATH) or []:
        if row.get("shadowOnly") is not True:
            continue
        if row.get("clientVisible") is True or row.get("telegramEligible") is True:
            continue
        cid = row.get("candidateId")
        if not cid:
            continue
        by_candidate[cid].append(row)
        all_rows.append(row)

    report_items = []
    for c in candidates:
        cid = c.get("candidateId")
        rows = by_candidate.get(cid, [])
        m = metric(rows)
        gate = classify(m)

        report_items.append({
            "candidateId": cid,
            "rank": c.get("rank"),
            "status": c.get("status"),
            "strategy": c.get("strategy"),
            "historicalEvidence": c.get("historicalEvidence"),
            "forwardMetrics": m,
            "gate": gate,
        })

    def rank(x):
        gate_status = x["gate"]["status"]
        m = x["forwardMetrics"]
        return (
            1 if gate_status == "FORWARD_SHADOW_HEALTHY_REVIEW_CANDIDATE" else 0,
            m["uniqueForwardDates"],
            m["decisionTrades"],
            m["avgR"],
            m["winRate"],
            -int(x.get("rank") or 9999),
        )

    report_items.sort(key=rank, reverse=True)

    counts = defaultdict(int)
    for item in report_items:
        counts[item["gate"]["status"]] += 1

    overall = metric(all_rows)

    report = {
        "ok": True,
        "storageVersion": VERSION,
        "createdAt": now_iso(),
        "researchOnly": True,
        "shadowOnly": True,
        "doesNotChangeClientDelivery": True,
        "doesNotSendTelegram": True,
        "doesNotSyncSupabase": True,
        "scope": {
            "minForwardShadowDays": MIN_DAYS,
            "minDecisionTrades": MIN_DECISIONS,
            "minWinRate": MIN_WIN_RATE,
            "minAvgR": MIN_AVG_R,
        },
        "sourceFiles": {
            "registry": str(REGISTRY_PATH),
            "cumulativeOutcomes": str(CUMULATIVE_PATH),
        },
        "summary": {
            "registeredCandidates": len(candidates),
            "candidatesWithForwardRows": sum(1 for x in report_items if x["forwardMetrics"]["totalTrades"] > 0),
            "overallForwardMetrics": overall,
            "gateCounts": dict(counts),
            "manualApprovalEligible": counts["FORWARD_SHADOW_HEALTHY_REVIEW_CANDIDATE"],
            "clientReleaseAllowed": 0,
            "telegramAllowed": 0,
            "productionEligible": 0,
        },
        "candidates": report_items,
        "policy": {
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
            "note": "This report never promotes automatically. Healthy candidates only become manual review candidates after forward-shadow thresholds are met.",
        },
    }

    run_id = "s900_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    final_path = REPORT_DIR / f"{run_id}.json"
    latest_path = REPORT_DIR / "latest_s900_forward_shadow_promotion_gate_report.json"

    final_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    latest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "storageVersion": VERSION,
        "summary": report["summary"],
        "candidatesPreview": report_items[:10],
        "reportFile": str(final_path),
        "latestFile": str(latest_path),
        "policy": report["policy"],
    }, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "storageVersion": VERSION,
            "error": repr(e),
            "traceback": traceback.format_exc(),
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
