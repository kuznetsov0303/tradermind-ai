
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import shutil
import subprocess
import sys
import traceback

VERSION = "s9_09_internal_research_agents_daily_report_v1"
ENGINE_DIR = Path("/opt/skilledge/stock-engine")
DATA_DIR = ENGINE_DIR / "data"
AGENTS_DIR = DATA_DIR / "agents"
REPORTS_DIR = AGENTS_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
REGISTRY_FILE = AGENTS_DIR / "internal_agents_registry.json"
LATEST_REPORT = REPORTS_DIR / "latest_s909_internal_research_agents_report.json"

PATHS = {
    "universeV1": DATA_DIR / "universe/latest_s907_universe_v1.json",
    "universeBackfillProgress": DATA_DIR / "historical_learning/universe_v1_overnight_backfill/progress_s908b_universe_v1_overnight_backfill.json",
    "universeBackfillLatest": DATA_DIR / "historical_learning/universe_v1_overnight_backfill/latest_s908b_universe_v1_overnight_backfill.json",
    "universeBackfillQueue": DATA_DIR / "historical_learning/universe_v1_overnight_backfill/jobs_s908b_universe_v1_overnight_backfill.jsonl",
    "forwardShadowStatus": DATA_DIR / "forward_shadow/ops_status/latest_s903_forward_shadow_ops_status_report.json",
    "forwardShadowDaily": DATA_DIR / "forward_shadow/latest_s898_forward_shadow_daily.json",
    "promotionGate": DATA_DIR / "forward_shadow/promotion_gate/latest_s900_forward_shadow_promotion_gate_report.json",
    "forwardShadowLedger": DATA_DIR / "forward_shadow/cumulative/forward_shadow_outcomes.jsonl",
    "readiness": DATA_DIR / "forward_shadow/readiness/latest_s906_monday_forward_shadow_readiness_check.json",
}

def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def read_json(path: Path):
    try:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"ok": False, "error": repr(exc), "path": str(path)}

def read_jsonl_count(path: Path):
    if not path.exists():
        return {"exists": False, "rows": 0, "statuses": {}}
    rows = 0
    statuses = {}
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rows += 1
            try:
                payload = json.loads(line)
                status = str(payload.get("status") or "UNKNOWN")
            except Exception:
                status = "PARSE_ERROR"
            statuses[status] = statuses.get(status, 0) + 1
    return {"exists": True, "rows": rows, "statuses": statuses}

def file_meta(path: Path):
    if not path.exists():
        return {"exists": False, "path": str(path), "sizeBytes": 0}
    return {"exists": True, "path": str(path), "sizeBytes": path.stat().st_size, "modifiedAt": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")}

def disk_health():
    usage = shutil.disk_usage(str(DATA_DIR))
    return {
        "totalGb": round(usage.total / (1024 ** 3), 2),
        "usedGb": round(usage.used / (1024 ** 3), 2),
        "freeGb": round(usage.free / (1024 ** 3), 2),
        "usedPct": round((usage.used / usage.total) * 100, 2) if usage.total else 0,
    }

def add_agent(outputs, agent_id, status, findings, actions):
    outputs.append({
        "agentId": agent_id,
        "status": status,
        "findings": findings,
        "recommendedActions": actions,
        "clientReleaseAllowed": False,
        "telegramAllowed": False,
        "productionEligible": False,
    })

def build_report():
    registry = read_json(REGISTRY_FILE) or {}
    universe = read_json(PATHS["universeV1"]) or {}
    progress = read_json(PATHS["universeBackfillProgress"]) or {}
    forward_daily = read_json(PATHS["forwardShadowDaily"]) or {}
    promotion = read_json(PATHS["promotionGate"]) or {}
    readiness = read_json(PATHS["readiness"]) or {}

    queue = read_jsonl_count(PATHS["universeBackfillQueue"])
    ledger = read_jsonl_count(PATHS["forwardShadowLedger"])
    disk = disk_health()

    universe_summary = universe.get("summary") if isinstance(universe, dict) else {}
    promotion_summary = promotion.get("summary") if isinstance(promotion, dict) else {}
    gate_counts = promotion_summary.get("gateCounts") if isinstance(promotion_summary, dict) else {}

    total_jobs = int(progress.get("totalJobs") or 0) if isinstance(progress, dict) else 0
    completed_jobs = int(progress.get("completedJobs") or 0) if isinstance(progress, dict) else 0
    failed_jobs = int(progress.get("failedJobs") or 0) if isinstance(progress, dict) else 0
    remaining_jobs = int(progress.get("remainingJobs") or 0) if isinstance(progress, dict) else 0
    progress_stage = progress.get("stage") if isinstance(progress, dict) else None
    pct = round((completed_jobs / total_jobs) * 100, 3) if total_jobs else 0

    client_allowed = int(promotion_summary.get("clientReleaseAllowed") or 0) if isinstance(promotion_summary, dict) else 0
    telegram_allowed = int(promotion_summary.get("telegramAllowed") or 0) if isinstance(promotion_summary, dict) else 0
    production_eligible = int(promotion_summary.get("productionEligible") or 0) if isinstance(promotion_summary, dict) else 0
    gate_ok = client_allowed == 0 and telegram_allowed == 0 and production_eligible == 0

    outputs = []
    add_agent(outputs, "data_quality_agent", "OK" if failed_jobs == 0 and ledger.get("statuses", {}).get("PARSE_ERROR", 0) == 0 else "CHECK_REQUIRED",
              [f"Universe selected symbols: {universe_summary.get('selectedCount')}", f"Backfill failed jobs: {failed_jobs}", f"Forward ledger rows: {ledger.get('rows')}", f"Ledger parse errors: {ledger.get('statuses', {}).get('PARSE_ERROR', 0)}"],
              ["If failed jobs appear, inspect queue job result before increasing throughput.", "Keep sync_supabase=false until research pipeline is stable."])
    add_agent(outputs, "backtest_historical_sandbox_agent", "RUNNING" if remaining_jobs else "COMPLETED" if total_jobs else "WAITING",
              [f"Stage: {progress_stage}", f"Completed jobs: {completed_jobs}/{total_jobs} ({pct}%)", f"Remaining jobs: {remaining_jobs}", f"Queue rows: {queue.get('rows')}"],
              ["Continue nightly controlled backfill.", "Do not treat partial backfill as final statistical evidence."])
    add_agent(outputs, "failure_analysis_agent", "OK" if failed_jobs == 0 else "REVIEW_FAILURES",
              [f"Failed jobs: {failed_jobs}", f"Promotion gate counts: {gate_counts}"],
              ["When enough new outcomes exist, compare losing variants by setup/time window/VWAP/RVOL bucket.", "Failure analysis remains research-only."])
    add_agent(outputs, "strategy_research_agent", "READY_SOON" if completed_jobs >= 50 else "WAITING_FOR_MORE_BACKFILL",
              [f"Completed jobs: {completed_jobs}", "Goal is to improve setup rules/filters/management, not pick favorite tickers.", "Candidates are strategy rule variants, not symbols."],
              ["After enough backfill accumulates, run S9.10 optimizer/research loop.", "Search for WR >= 65%, avgR > 0, exact replay pass and robustness pass."])
    add_agent(outputs, "market_regime_agent", "WAITING_FOR_FEATURE_COVERAGE",
              ["Regime segmentation should use time window, VWAP distance, RVOL, liquidity, volatility/range and market context."],
              ["Add market regime buckets after S9.10 has enough evidence."])
    add_agent(outputs, "risk_promotion_guard_agent", "HARD_BLOCKS_OK" if gate_ok else "DANGER_CHECK_NOW",
              [f"Gate counts: {gate_counts}", f"clientReleaseAllowed: {client_allowed}", f"telegramAllowed: {telegram_allowed}", f"productionEligible: {production_eligible}"],
              ["Keep all new variants shadow-only until forward-shadow thresholds and manual approval.", "Never allow research-only backfill to directly change client delivery."])
    add_agent(outputs, "investor_report_agent", "OK",
              [f"Universe v1 symbols: {universe_summary.get('selectedCount')}", f"Backfill progress: {completed_jobs}/{total_jobs}", f"Forward-shadow gate: {gate_counts}"],
              ["Investor report must show honest evidence, not inflated claims from partial backfill."])
    add_agent(outputs, "storage_memory_health_agent", "OK" if disk["usedPct"] < 85 else "CHECK_STORAGE",
              [f"Disk used: {disk['usedPct']}%", f"Data free: {disk['freeGb']} GB", f"Queue file rows: {queue.get('rows')}"],
              ["If disk exceeds 85%, compress old artifacts and prune temp files."])

    issues = []
    if failed_jobs > 0: issues.append("backfill_failed_jobs_present")
    if disk["usedPct"] >= 85: issues.append("disk_usage_high")
    if not gate_ok: issues.append("promotion_gate_not_blocking")
    if not PATHS["universeBackfillQueue"].exists(): issues.append("universe_backfill_queue_missing")
    if not PATHS["promotionGate"].exists(): issues.append("promotion_gate_report_missing")

    return {
        "ok": True,
        "storageVersion": VERSION,
        "createdAt": now_iso(),
        "researchOnly": True,
        "shadowOnly": True,
        "clientReleaseAllowed": False,
        "telegramAllowed": False,
        "productionEligible": False,
        "health": {"status": "OK" if not issues else "CHECK_REQUIRED", "issues": issues},
        "snapshots": {
            "universeSummary": universe_summary,
            "backfillProgress": progress,
            "queueHealth": queue,
            "forwardShadowDailySummary": forward_daily.get("summary") if isinstance(forward_daily, dict) else None,
            "promotionGateSummary": promotion_summary,
            "readinessSummary": readiness.get("readiness") if isinstance(readiness, dict) else None,
            "diskHealth": disk,
        },
        "agents": registry.get("agents") if isinstance(registry, dict) else [],
        "agentOutputs": outputs,
        "files": {k: file_meta(v) for k, v in PATHS.items()},
        "policy": {
            "researchOnly": True,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
            "note": "Internal agents are report-only R&D/ops roles. They do not send client signals or approve production.",
        },
    }

def main():
    report = build_report()
    final = REPORTS_DIR / f"s909_internal_research_agents_report_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    final.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    LATEST_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "storageVersion": VERSION,
        "health": report["health"],
        "agentStatuses": {x["agentId"]: x["status"] for x in report["agentOutputs"]},
        "backfill": {
            "stage": report["snapshots"]["backfillProgress"].get("stage") if isinstance(report["snapshots"].get("backfillProgress"), dict) else None,
            "completedJobs": report["snapshots"]["backfillProgress"].get("completedJobs") if isinstance(report["snapshots"].get("backfillProgress"), dict) else None,
            "failedJobs": report["snapshots"]["backfillProgress"].get("failedJobs") if isinstance(report["snapshots"].get("backfillProgress"), dict) else None,
            "remainingJobs": report["snapshots"]["backfillProgress"].get("remainingJobs") if isinstance(report["snapshots"].get("backfillProgress"), dict) else None,
        },
        "reportFile": str(final),
        "latestFile": str(LATEST_REPORT),
        "policy": report["policy"],
    }, ensure_ascii=False, indent=2, default=str))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "storageVersion": VERSION, "error": repr(e), "traceback": traceback.format_exc()}, ensure_ascii=False, indent=2))
        sys.exit(1)
