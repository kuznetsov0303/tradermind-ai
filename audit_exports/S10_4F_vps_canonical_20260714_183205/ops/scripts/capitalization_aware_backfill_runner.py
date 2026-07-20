
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import traceback
import urllib.parse
import urllib.request

VERSION = "s9_12b_capitalization_aware_backfill_runner_v1"

ENGINE_DIR = Path("/opt/skilledge/stock-engine")
DATA_DIR = ENGINE_DIR / "data"
UNIVERSE_JSON = DATA_DIR / "universe/latest_s911_market_cap_buckets_universe_v2.json"

OUT_DIR = DATA_DIR / "historical_learning/universe_v2_capitalization_backfill"
OUT_DIR.mkdir(parents=True, exist_ok=True)

QUEUE_FILE = OUT_DIR / "jobs_s912_capitalization_aware_backfill.jsonl"
PROGRESS_FILE = OUT_DIR / "progress_s912_capitalization_aware_backfill.json"
LATEST_FILE = OUT_DIR / "latest_s912_capitalization_aware_backfill_queue.json"

START_DATE = os.environ.get("S912B_START_DATE", "2021-07-12")
END_DATE = os.environ.get("S912B_END_DATE", "2026-07-10")
SYMBOLS_PER_JOB = int(os.environ.get("S912B_SYMBOLS_PER_JOB", "8"))
DAYS_PER_JOB = int(os.environ.get("S912B_DAYS_PER_JOB", "5"))
MAX_JOBS_PER_RUN = int(os.environ.get("S912B_MAX_JOBS_PER_RUN", "60"))
SLEEP_SECONDS = int(os.environ.get("S912B_SLEEP_SECONDS", "2"))
REBUILD_QUEUE_IF_SMOKE = (os.environ.get("S912B_REBUILD_QUEUE_IF_SMOKE") or "true").lower() in ("1", "true", "yes")

BASE = "http://127.0.0.1:8000"
BUCKET_ORDER = ["mega_cap", "large_cap", "mid_cap", "small_cap", "micro_cap"]
FLOAT_BUCKET_NAME = "low_float_active"


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def weekdays(start, end):
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            yield cur
        cur += timedelta(days=1)


def chunk(items, n):
    n = max(1, int(n))
    for i in range(0, len(items), n):
        yield items[i:i+n]


def write_json(path: Path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def read_universe():
    if not UNIVERSE_JSON.exists():
        raise RuntimeError(f"Universe v2 not found: {UNIVERSE_JSON}. Run S9.11B first.")
    payload = json.loads(UNIVERSE_JSON.read_text(encoding="utf-8"))
    records = payload.get("records") or []
    if not records:
        raise RuntimeError("Universe v2 records are empty.")
    return payload, records


def bucket_symbols(records):
    buckets = {b: [] for b in BUCKET_ORDER}
    buckets[FLOAT_BUCKET_NAME] = []
    seen_by_bucket = {b: set() for b in buckets}

    for r in records:
        sym = str(r.get("symbol") or "").strip().upper()
        if not sym:
            continue

        cap_bucket = str(r.get("marketCapBucket") or "unknown_cap")
        if cap_bucket in buckets and sym not in seen_by_bucket[cap_bucket]:
            buckets[cap_bucket].append(sym)
            seen_by_bucket[cap_bucket].add(sym)

        float_bucket = str(r.get("floatBucket") or "")
        if float_bucket.startswith("low_float") and sym not in seen_by_bucket[FLOAT_BUCKET_NAME]:
            buckets[FLOAT_BUCKET_NAME].append(sym)
            seen_by_bucket[FLOAT_BUCKET_NAME].add(sym)

    return buckets


def read_jobs():
    jobs = []
    if not QUEUE_FILE.exists():
        return jobs
    with QUEUE_FILE.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                jobs.append(json.loads(line))
            except Exception:
                pass
    return jobs


def save_jobs(jobs):
    with QUEUE_FILE.open("w", encoding="utf-8") as fh:
        for job in jobs:
            fh.write(json.dumps(job, ensure_ascii=False, default=str) + "\n")


def build_full_queue(force=False):
    existing_jobs = read_jobs()
    existing_is_smoke = bool(existing_jobs) and all(str(j.get("jobId", "")).startswith("s912_smoke_") for j in existing_jobs)
    existing_is_full = bool(existing_jobs) and any(str(j.get("jobId", "")).startswith("s912_job_") for j in existing_jobs)

    if existing_is_full and not force:
        return existing_jobs, False

    if existing_jobs and (force or existing_is_smoke or REBUILD_QUEUE_IF_SMOKE):
        backup = QUEUE_FILE.with_name(QUEUE_FILE.name + f".bak_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
        QUEUE_FILE.rename(backup)

    universe, records = read_universe()
    buckets = bucket_symbols(records)
    days = list(weekdays(parse_date(START_DATE), parse_date(END_DATE)))

    jobs = []
    job_id = 0
    for day_group in chunk(days, DAYS_PER_JOB):
        for bucket in BUCKET_ORDER + [FLOAT_BUCKET_NAME]:
            for sym_group in chunk(buckets.get(bucket, []), SYMBOLS_PER_JOB):
                if not sym_group:
                    continue
                job_id += 1
                jobs.append({
                    "jobId": f"s912_job_{job_id:06d}",
                    "status": "READY",
                    "bucket": bucket,
                    "symbols": sym_group,
                    "startDate": day_group[0].isoformat(),
                    "endDate": day_group[-1].isoformat(),
                    "interval": "5min",
                    "maxCandidates": 25000,
                    "researchOnly": True,
                    "syncSupabase": False,
                    "clientReleaseAllowed": False,
                    "telegramAllowed": False,
                    "productionEligible": False,
                })

    save_jobs(jobs)

    bucket_counts = {k: len(v) for k, v in buckets.items()}
    report = {
        "ok": True,
        "storageVersion": VERSION,
        "createdAt": now_iso(),
        "mode": "research_only",
        "queueMode": "full_capitalization_aware",
        "startDate": START_DATE,
        "endDate": END_DATE,
        "summary": {
            "universeSelectedCount": universe.get("summary", {}).get("selectedCount"),
            "preferredBackfillCount": universe.get("summary", {}).get("preferredBackfillCount"),
            "bucketSymbolCounts": bucket_counts,
            "symbolsPerJob": SYMBOLS_PER_JOB,
            "daysPerJob": DAYS_PER_JOB,
            "weekdayCount": len(days),
            "jobCount": len(jobs),
            "maxJobsPerRun": MAX_JOBS_PER_RUN,
            "estimatedRawSymbolDaysIncludingLowFloatOverlap": sum(bucket_counts.values()) * len(days),
        },
        "queueFile": str(QUEUE_FILE),
        "progressFile": str(PROGRESS_FILE),
        "latestFile": str(LATEST_FILE),
        "policy": {
            "researchOnly": True,
            "syncSupabase": False,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
            "note": "S9.12B capitalization-aware nightly runner. No client/Telegram/production action.",
        },
    }
    write_json(LATEST_FILE, report)
    return jobs, True


def http_post(path, params, timeout=1800):
    qs = urllib.parse.urlencode(params, doseq=True)
    url = f"{BASE}{path}?{qs}"
    req = urllib.request.Request(url, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except Exception:
        return {"ok": False, "raw": text[:5000], "url": url}


def run_step(name, path, params):
    try:
        payload = http_post(path, params)
        return {
            "name": name,
            "ok": bool(payload.get("ok")),
            "summary": payload.get("summary"),
            "errorCount": len(payload.get("errors") or []),
        }
    except Exception as exc:
        return {
            "name": name,
            "ok": False,
            "error": repr(exc),
            "traceback": traceback.format_exc()[-3000:],
        }


def run_one_job(job):
    symbols_csv = ",".join(job["symbols"])
    base = {
        "symbols": symbols_csv,
        "start_date": job["startDate"],
        "end_date": job["endDate"],
        "intervals": job["interval"],
        "publish": "true",
    }

    steps = []
    steps.append(run_step("ingestion_robust_fmp", "/engine/research/historical-learning/ingestion/run-robust-fmp", base))
    steps.append(run_step("features_robust", "/engine/research/historical-learning/features/build-robust", base))

    replay_params = dict(base)
    replay_params["max_candidates"] = job.get("maxCandidates", 25000)
    steps.append(run_step("setup_replay_robust", "/engine/research/historical-learning/setup-replay/run-robust", replay_params))

    outcome_params = dict(replay_params)
    outcome_params["sync_supabase"] = "false"
    steps.append(run_step("outcomes_robust", "/engine/research/historical-learning/outcomes/run-robust", outcome_params))

    return {"ok": all(s.get("ok") for s in steps), "bucket": job.get("bucket"), "steps": steps}


def bucket_progress(jobs):
    out = {}
    for job in jobs:
        b = job.get("bucket") or "unknown"
        if b not in out:
            out[b] = {"total": 0, "completed": 0, "failed": 0, "running": 0, "ready": 0}
        out[b]["total"] += 1
        status = job.get("status")
        if status == "COMPLETED":
            out[b]["completed"] += 1
        elif status == "FAILED":
            out[b]["failed"] += 1
        elif status == "RUNNING":
            out[b]["running"] += 1
        else:
            out[b]["ready"] += 1
    return out


def write_progress(stage, jobs, started_at=None, last_job=None, jobs_ran=0, queue_created=False):
    payload = {
        "ok": True,
        "storageVersion": VERSION,
        "stage": stage,
        "queueCreatedThisRun": queue_created,
        "totalJobs": len(jobs),
        "completedJobs": sum(1 for j in jobs if j.get("status") == "COMPLETED"),
        "failedJobs": sum(1 for j in jobs if j.get("status") == "FAILED"),
        "runningJobs": sum(1 for j in jobs if j.get("status") == "RUNNING"),
        "remainingJobs": sum(1 for j in jobs if j.get("status") not in ("COMPLETED", "FAILED")),
        "jobsRanThisSession": jobs_ran,
        "maxJobsPerRun": MAX_JOBS_PER_RUN,
        "startedAt": started_at,
        "updatedAt": now_iso(),
        "lastJob": last_job,
        "bucketProgress": bucket_progress(jobs),
        "policy": {
            "researchOnly": True,
            "syncSupabase": False,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
        },
    }
    write_json(PROGRESS_FILE, payload)
    return payload


def run_queue():
    jobs, queue_created = build_full_queue(force=False)

    for job in jobs:
        if job.get("status") == "RUNNING":
            job["status"] = "READY"
            job["recoveredAt"] = now_iso()
    save_jobs(jobs)

    started_at = now_iso()
    ran = 0
    limit = MAX_JOBS_PER_RUN if MAX_JOBS_PER_RUN > 0 else len(jobs)

    write_progress("running", jobs, started_at=started_at, jobs_ran=ran, queue_created=queue_created)

    for job in jobs:
        if ran >= limit:
            break
        if job.get("status") == "COMPLETED":
            continue

        job["status"] = "RUNNING"
        job["startedAt"] = now_iso()
        save_jobs(jobs)
        write_progress("running", jobs, started_at=started_at, last_job={
            "jobId": job.get("jobId"),
            "bucket": job.get("bucket"),
            "symbols": job.get("symbols"),
            "startDate": job.get("startDate"),
            "endDate": job.get("endDate"),
            "status": "RUNNING",
        }, jobs_ran=ran, queue_created=queue_created)

        result = run_one_job(job)
        job["result"] = result
        job["completedAt"] = now_iso()
        job["status"] = "COMPLETED" if result.get("ok") else "FAILED"
        ran += 1
        save_jobs(jobs)

        write_progress("running", jobs, started_at=started_at, last_job={
            "jobId": job.get("jobId"),
            "bucket": job.get("bucket"),
            "symbols": job.get("symbols"),
            "startDate": job.get("startDate"),
            "endDate": job.get("endDate"),
            "status": job.get("status"),
            "result": result,
        }, jobs_ran=ran, queue_created=queue_created)

        time.sleep(max(0, SLEEP_SECONDS))

    jobs = read_jobs()
    remaining = sum(1 for j in jobs if j.get("status") not in ("COMPLETED", "FAILED"))
    stage = "completed" if remaining == 0 else "paused_after_limit"
    final = write_progress(stage, jobs, started_at=started_at, jobs_ran=ran, queue_created=queue_created)
    final["completedAt"] = now_iso()
    write_json(PROGRESS_FILE, final)
    print(json.dumps({
        "ok": True,
        "storageVersion": VERSION,
        "stage": final["stage"],
        "queueCreatedThisRun": queue_created,
        "completedJobs": final["completedJobs"],
        "failedJobs": final["failedJobs"],
        "remainingJobs": final["remainingJobs"],
        "jobsRanThisSession": ran,
        "bucketProgress": final["bucketProgress"],
        "progressFile": str(PROGRESS_FILE),
        "queueFile": str(QUEUE_FILE),
        "policy": final["policy"],
    }, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    try:
        run_queue()
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "storageVersion": VERSION,
            "error": repr(e),
            "traceback": traceback.format_exc(),
        }, ensure_ascii=False, indent=2))
        sys.exit(1)
