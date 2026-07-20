
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json, os, sys, traceback

VERSION = "s9_13_cap_aware_optimizer_controller_report_v1"
ENGINE_DIR = Path("/opt/skilledge/stock-engine")
DATA_DIR = ENGINE_DIR / "data"
OUT_DIR = DATA_DIR / "research_optimizer"
OUT_DIR.mkdir(parents=True, exist_ok=True)
MIN_COMPLETED_JOBS = int(os.environ.get("S913_MIN_COMPLETED_JOBS", "50"))
REQUIRE_ALL_BUCKETS = (os.environ.get("S913_REQUIRE_ALL_BUCKETS") or "true").lower() in ("1", "true", "yes")
REQUIRED_BUCKETS = ["mega_cap", "large_cap", "mid_cap", "small_cap", "micro_cap", "low_float_active"]
PATHS = {
    "universeV2": DATA_DIR / "universe/latest_s911_market_cap_buckets_universe_v2.json",
    "capAwareProgress": DATA_DIR / "historical_learning/universe_v2_capitalization_backfill/progress_s912_capitalization_aware_backfill.json",
    "capAwareLatest": DATA_DIR / "historical_learning/universe_v2_capitalization_backfill/latest_s912_capitalization_aware_backfill_queue.json",
    "capAwareQueue": DATA_DIR / "historical_learning/universe_v2_capitalization_backfill/jobs_s912_capitalization_aware_backfill.jsonl",
    "agentsReport": DATA_DIR / "agents/reports/latest_s909_internal_research_agents_report.json",
    "promotionGate": DATA_DIR / "forward_shadow/promotion_gate/latest_s900_forward_shadow_promotion_gate_report.json",
    "forwardShadowStatus": DATA_DIR / "forward_shadow/ops_status/latest_s903_forward_shadow_ops_status_report.json",
}

def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def read_json(path):
    try:
        if not path.exists(): return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"ok": False, "error": repr(exc), "path": str(path)}

def read_queue(path):
    if not path.exists(): return {"exists": False, "rows": 0, "statuses": {}, "byBucket": {}}
    rows, statuses, by_bucket, last_completed = 0, {}, {}, None
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            rows += 1
            try:
                p=json.loads(line); st=str(p.get("status") or "UNKNOWN"); b=str(p.get("bucket") or "unknown")
                by_bucket.setdefault(b, {"total":0,"completed":0,"failed":0,"running":0,"ready":0})
                by_bucket[b]["total"] += 1
                if st == "COMPLETED":
                    by_bucket[b]["completed"] += 1
                    last_completed = {"jobId": p.get("jobId"), "bucket": b, "symbols": p.get("symbols"), "startDate": p.get("startDate"), "endDate": p.get("endDate"), "completedAt": p.get("completedAt")}
                elif st == "FAILED": by_bucket[b]["failed"] += 1
                elif st == "RUNNING": by_bucket[b]["running"] += 1
                else: by_bucket[b]["ready"] += 1
            except Exception:
                st="PARSE_ERROR"
            statuses[st]=statuses.get(st,0)+1
    return {"exists": True, "rows": rows, "statuses": statuses, "byBucket": by_bucket, "lastCompleted": last_completed}

def main():
    universe = read_json(PATHS["universeV2"]) or {}
    progress = read_json(PATHS["capAwareProgress"]) or {}
    latest = read_json(PATHS["capAwareLatest"]) or {}
    agents = read_json(PATHS["agentsReport"]) or {}
    promotion = read_json(PATHS["promotionGate"]) or {}
    forward_status = read_json(PATHS["forwardShadowStatus"]) or {}
    queue = read_queue(PATHS["capAwareQueue"])

    total_jobs = int(progress.get("totalJobs") or 0) if isinstance(progress, dict) else 0
    completed_jobs = int(progress.get("completedJobs") or 0) if isinstance(progress, dict) else 0
    failed_jobs = int(progress.get("failedJobs") or 0) if isinstance(progress, dict) else 0
    remaining_jobs = int(progress.get("remainingJobs") or 0) if isinstance(progress, dict) else 0
    completion_pct = round((completed_jobs / total_jobs) * 100, 3) if total_jobs else 0
    bucket_progress = progress.get("bucketProgress") if isinstance(progress, dict) else {}
    if not isinstance(bucket_progress, dict) or not bucket_progress:
        bucket_progress = queue.get("byBucket", {})

    bucket_readiness, missing, empty, failed_buckets = {}, [], [], []
    for b in REQUIRED_BUCKETS:
        info = bucket_progress.get(b) or {}
        total, completed, failed = int(info.get("total") or 0), int(info.get("completed") or 0), int(info.get("failed") or 0)
        bucket_readiness[b] = {"total": total, "completed": completed, "failed": failed, "ready": completed > 0 and failed == 0}
        if total <= 0: missing.append(b)
        if completed <= 0: empty.append(b)
        if failed > 0: failed_buckets.append(b)

    promotion_summary = promotion.get("summary") if isinstance(promotion, dict) else {}
    gate_counts = promotion_summary.get("gateCounts") if isinstance(promotion_summary, dict) else {}
    client_allowed = int(promotion_summary.get("clientReleaseAllowed") or 0) if isinstance(promotion_summary, dict) else 0
    telegram_allowed = int(promotion_summary.get("telegramAllowed") or 0) if isinstance(promotion_summary, dict) else 0
    production_eligible = int(promotion_summary.get("productionEligible") or 0) if isinstance(promotion_summary, dict) else 0

    blockers = []
    if not PATHS["universeV2"].exists(): blockers.append("universe_v2_missing")
    if not PATHS["capAwareQueue"].exists(): blockers.append("cap_aware_queue_missing")
    if failed_jobs > 0: blockers.append("cap_aware_backfill_has_failed_jobs")
    if completed_jobs < MIN_COMPLETED_JOBS: blockers.append(f"not_enough_completed_cap_aware_jobs:{completed_jobs}<{MIN_COMPLETED_JOBS}")
    if REQUIRE_ALL_BUCKETS and missing: blockers.append("missing_bucket_jobs:" + ",".join(missing))
    if REQUIRE_ALL_BUCKETS and empty: blockers.append("not_all_buckets_have_completed_jobs:" + ",".join(empty))
    if REQUIRE_ALL_BUCKETS and failed_buckets: blockers.append("bucket_failures_present:" + ",".join(failed_buckets))

    health_issues = []
    if client_allowed != 0 or telegram_allowed != 0 or production_eligible != 0: health_issues.append("promotion_gate_not_blocking")
    if failed_jobs > 0: health_issues.append("backfill_failed_jobs_present")
    ready = len(blockers) == 0

    report = {
        "ok": True, "storageVersion": VERSION, "createdAt": now_iso(),
        "researchOnly": True, "shadowOnly": True, "clientReleaseAllowed": False, "telegramAllowed": False, "productionEligible": False,
        "health": {"status": "OK" if not health_issues else "CHECK_REQUIRED", "issues": health_issues},
        "readiness": {"optimizerReady": ready, "blockers": blockers, "minCompletedJobsRequired": MIN_COMPLETED_JOBS, "requireAllBuckets": REQUIRE_ALL_BUCKETS},
        "universeSummary": universe.get("summary") if isinstance(universe, dict) else {},
        "capAwareBackfill": {"stage": progress.get("stage") if isinstance(progress, dict) else None, "totalJobs": total_jobs, "completedJobs": completed_jobs, "failedJobs": failed_jobs, "remainingJobs": remaining_jobs, "completionPct": completion_pct, "bucketReadiness": bucket_readiness, "queue": queue, "latest": latest.get("summary") if isinstance(latest, dict) else None},
        "agentsHealth": agents.get("health") if isinstance(agents, dict) else None,
        "promotionGate": {"gateCounts": gate_counts, "manualApprovalEligible": promotion_summary.get("manualApprovalEligible") if isinstance(promotion_summary, dict) else None, "clientReleaseAllowed": client_allowed, "telegramAllowed": telegram_allowed, "productionEligible": production_eligible},
        "forwardShadowHealth": forward_status.get("health") if isinstance(forward_status, dict) else None,
        "optimizerPlan": {"status": "READY_TO_OPTIMIZE_CAP_AWARE" if ready else "WAITING_FOR_MORE_CAP_AWARE_BACKFILL", "scope": "universe_v2_market_cap_and_float_buckets", "goal": "Improve setup rules/filters/management, not pick tickers.", "requiredOutputsWhenExecuted": ["setup winRate/avgR overall", "setup winRate/avgR by marketCapBucket", "setup winRate/avgR by floatBucket", "sample size by bucket", "approved buckets vs blocked buckets per setup", "failure patterns by bucket"], "nextResearchTasks": ["cap_aware_variant_mining", "cap_aware_exact_replay_confirm", "cap_aware_robustness_audit", "shadow_only_registry_update_after_manual_review"]},
        "policy": {"researchOnly": True, "clientReleaseAllowed": False, "telegramAllowed": False, "productionEligible": False, "note": "S9.13 patches optimizer readiness to use cap-aware S9.12B backfill. It does not run live/client/Telegram release."},
    }
    final = OUT_DIR / f"s913_cap_aware_optimizer_controller_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    latest_report = OUT_DIR / "latest_s913_cap_aware_optimizer_controller.json"
    legacy_latest = OUT_DIR / "latest_s910_nightly_research_optimizer_controller.json"
    final.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    latest_report.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    legacy_latest.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"ok": True, "storageVersion": VERSION, "health": report["health"], "readiness": report["readiness"], "capAwareBackfill": {"stage": progress.get("stage") if isinstance(progress, dict) else None, "completedJobs": completed_jobs, "failedJobs": failed_jobs, "remainingJobs": remaining_jobs, "completionPct": completion_pct, "bucketReadiness": bucket_readiness}, "optimizerPlanStatus": report["optimizerPlan"]["status"], "reportFile": str(final), "latestFile": str(latest_report), "legacyLatestFile": str(legacy_latest), "policy": report["policy"]}, ensure_ascii=False, indent=2, default=str))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"ok": False, "storageVersion": VERSION, "error": repr(e), "traceback": traceback.format_exc()}, ensure_ascii=False, indent=2)); sys.exit(1)
