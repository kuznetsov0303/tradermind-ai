from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import math
import os
import sys
import traceback

VERSION = "s8_98_forward_shadow_daily_evaluator_v1"

BASE_URL = "http://127.0.0.1:8000"

DATE_PARAM = (os.environ.get("S898_DATE") or "").strip()
SYMBOLS = (os.environ.get("S898_SYMBOLS") or "").strip()
INTERVAL = (os.environ.get("S898_INTERVAL") or "5min").strip()
MAX_CANDIDATES = int(os.environ.get("S898_MAX_CANDIDATES", "25000"))
SKIP_PIPELINE = (os.environ.get("S898_SKIP_PIPELINE") or "").lower() in ("1", "true", "yes")

ROOT = Path("/opt/skilledge/stock-engine/data")
HL_ROOT = ROOT / "historical_learning"
FORWARD_ROOT = ROOT / "forward_shadow"
REGISTRY_PATH = FORWARD_ROOT / "live_shadow_candidates.json"
NORMALIZED_ROOT = HL_ROOT / "normalized_candles" / INTERVAL
OUTCOME_ROOT = HL_ROOT / "simulated_outcomes" / INTERVAL

DAILY_DIR = FORWARD_ROOT / "daily"
DAILY_DIR.mkdir(parents=True, exist_ok=True)
CUMULATIVE_DIR = FORWARD_ROOT / "cumulative"
CUMULATIVE_DIR.mkdir(parents=True, exist_ok=True)
PROGRESS_PATH = FORWARD_ROOT / "progress_s898_forward_shadow_daily_evaluator.json"


def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def write_progress(payload):
    payload["updatedAt"] = now_iso()
    PROGRESS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def previous_completed_weekday():
    d = date.today() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.isoformat()


def target_date():
    if DATE_PARAM:
        return DATE_PARAM
    return previous_completed_weekday()


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_jsonl(path: Path):
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


def write_jsonl_append(path: Path, rows):
    # S9.02 idempotency patch:
    # Do not append duplicate forward-shadow outcome rows when the same date is rerun manually,
    # by a persistent timer, or during smoke tests. evaluatedAt is intentionally ignored.
    path.parent.mkdir(parents=True, exist_ok=True)

    existing = set()
    if path.exists():
        for old in read_jsonl(path) or []:
            existing.add((
                str(old.get("date") or ""),
                str(old.get("candidateId") or ""),
                str(old.get("sourceVariantKey") or ""),
                str(old.get("symbol") or ""),
                str(old.get("status") or ""),
                str(old.get("resultR") or ""),
                str(old.get("eventTime") or ""),
            ))

    with path.open("a", encoding="utf-8") as fh:
        for row in rows:
            key = (
                str(row.get("date") or ""),
                str(row.get("candidateId") or ""),
                str(row.get("sourceVariantKey") or ""),
                str(row.get("symbol") or ""),
                str(row.get("status") or ""),
                str(row.get("resultR") or ""),
                str(row.get("eventTime") or ""),
            )
            if key in existing:
                continue
            existing.add(key)
            fh.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

def as_float(value, default=None):
    try:
        if value is None:
            return default
        x = float(value)
        if math.isnan(x):
            return default
        return x
    except Exception:
        return default


def as_int(value, default=0):
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def api_post(path: str, params: dict, timeout: int = 1200) -> dict:
    url = BASE_URL + path + "?" + urlencode(params)
    req = Request(url, method="POST")
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"ok": False, "httpStatus": e.code, "url": url, "error": body[:5000]}
    except URLError as e:
        return {"ok": False, "url": url, "error": repr(e)}
    except Exception as e:
        return {"ok": False, "url": url, "error": repr(e), "traceback": traceback.format_exc()}


def summarize_step(payload):
    return {
        "ok": payload.get("ok"),
        "storageVersion": payload.get("storageVersion"),
        "ingestionHotfixVersion": payload.get("ingestionHotfixVersion"),
        "providerEndpoint": payload.get("providerEndpoint"),
        "featureBuilderHotfixVersion": payload.get("featureBuilderHotfixVersion"),
        "setupReplayHotfixVersion": payload.get("setupReplayHotfixVersion"),
        "outcomeSimulatorHotfixVersion": payload.get("outcomeSimulatorHotfixVersion"),
        "summary": payload.get("summary"),
        "errorCount": payload.get("errorCount"),
        "errors": payload.get("errors"),
    }


def run_pipeline(day: str):
    common = {
        "symbols": SYMBOLS,
        "start_date": day,
        "end_date": day,
        "intervals": INTERVAL,
        "publish": "true",
    }
    steps = []

    ingestion = api_post("/engine/research/historical-learning/ingestion/run-robust-fmp", dict(common), timeout=1200)
    steps.append({"name": "ingestion_robust_fmp", **summarize_step(ingestion)})
    ing_sum = ingestion.get("summary") or {}
    if int(ing_sum.get("normalizedRowsStored") or 0) == 0:
        return steps, "no_provider_rows_for_day"

    features = api_post("/engine/research/historical-learning/features/build-robust", dict(common), timeout=1200)
    steps.append({"name": "features_robust", **summarize_step(features)})

    replay_params = dict(common)
    replay_params["max_candidates"] = str(MAX_CANDIDATES)
    replay = api_post("/engine/research/historical-learning/setup-replay/run-robust", replay_params, timeout=1200)
    steps.append({"name": "setup_replay_robust", **summarize_step(replay)})

    outcome_params = dict(common)
    outcome_params["sync_supabase"] = "false"
    outcome_params["max_candidates"] = str(MAX_CANDIDATES)
    outcomes = api_post("/engine/research/historical-learning/outcomes/run-robust", outcome_params, timeout=1200)
    steps.append({"name": "outcomes_robust", **summarize_step(outcomes)})

    return steps, None


def pick_date(row):
    return str(row.get("sessionDate") or row.get("date") or row.get("candidateAt") or "")[:10]


def nested_get_any(obj, names, max_depth=6):
    if max_depth <= 0:
        return None
    if isinstance(obj, dict):
        for name in names:
            if name in obj and obj.get(name) is not None:
                return obj.get(name)
        for value in obj.values():
            found = nested_get_any(value, names, max_depth - 1)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for value in obj[:20]:
            found = nested_get_any(value, names, max_depth - 1)
            if found is not None:
                return found
    return None


def extract_candidate(row):
    payload = row.get("payload")
    if isinstance(payload, dict) and isinstance(payload.get("candidate"), dict):
        return payload["candidate"]
    if isinstance(row.get("candidate"), dict):
        return row["candidate"]
    return {}


def bucket_number(value, edges, prefix):
    x = as_float(value)
    if x is None:
        return None
    prev = None
    for edge in edges:
        if x <= edge:
            if prev is None:
                return f"{prefix}_lte_{edge}"
            return f"{prefix}_{prev}_to_{edge}"
        prev = edge
    return f"{prefix}_gt_{edges[-1]}"


def bucket_abs(value, edges, prefix):
    x = as_float(value)
    if x is None:
        return None
    return bucket_number(abs(x), edges, prefix)


def time_bucket(candidate_at):
    value = str(candidate_at or "")
    hhmm = value[11:16] if len(value) >= 16 else ""
    if not hhmm:
        return None
    if "04:00" <= hhmm < "09:30":
        return "premarket"
    if "09:30" <= hhmm < "10:00":
        return "open_0930_1000"
    if "10:00" <= hhmm < "10:30":
        return "open_1000_1030"
    if "10:30" <= hhmm < "12:00":
        return "late_morning"
    if "12:00" <= hhmm < "14:00":
        return "midday"
    if "14:00" <= hhmm < "15:30":
        return "afternoon"
    if "15:30" <= hhmm <= "16:00":
        return "power_hour"
    if "16:00" < hhmm <= "20:00":
        return "afterhours"
    return "time_other"


def symbol_bucket(symbol):
    large_core = {"TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "AMD", "AVGO", "NFLX", "CRM", "NOW", "CRWD", "PLTR", "COIN", "MSTR", "SMCI"}
    small_core = {"XOS", "RGNT", "PAVS", "OLOX", "JZXN", "HPE", "HPAI", "NTAP"}
    s = str(symbol or "").upper()
    if s in large_core:
        return "large_liquid_core"
    if s in small_core:
        return "small_mid_core"
    return "other_symbol_bucket"


def row_tags(row):
    cand = extract_candidate(row)

    setup = str(row.get("setupSlug") or row.get("setup_slug") or cand.get("setupSlug") or cand.get("setup_slug") or "unknown_setup")
    direction = str(row.get("direction") or cand.get("direction") or "UNKNOWN").upper()
    symbol = str(row.get("symbol") or cand.get("symbol") or "UNKNOWN").upper()
    interval = str(row.get("interval") or cand.get("interval") or INTERVAL)
    candidate_at = str(row.get("candidateAt") or cand.get("candidateAt") or cand.get("datetime") or "")

    score = as_float(cand.get("score") or row.get("score"))
    rr = as_float(cand.get("riskReward") or cand.get("rr") or row.get("riskReward"))
    grade = str(cand.get("grade") or row.get("grade") or "").strip().upper()

    rvol = nested_get_any(cand, ["rvol20", "rvol", "relativeVolume", "relative_volume"])
    dist_vwap = nested_get_any(cand, ["distanceFromVwapPct", "distance_from_vwap_pct", "vwapDistancePct"])
    dist_ema = nested_get_any(cand, ["distanceFromEma20Pct", "distance_from_ema20_pct", "emaDistancePct"])

    tb = time_bucket(candidate_at)
    tags = {
        "time": tb,
        "grade": f"grade_{grade}" if grade else None,
        "score": bucket_number(score, [60, 70, 80, 90, 95], "score"),
        "rr": bucket_number(rr, [1.5, 2.0, 2.5, 3.0, 4.0], "rr"),
        "rvol": bucket_number(rvol, [1, 1.5, 2, 3, 5, 10], "rvol"),
        "vwap": bucket_abs(dist_vwap, [0.25, 0.5, 1, 2, 4, 8], "abs_vwap"),
        "ema": bucket_abs(dist_ema, [0.25, 0.5, 1, 2, 4, 8], "abs_ema"),
        "symbol_bucket": symbol_bucket(symbol),
    }
    return setup, direction, interval, symbol, {k: v for k, v in tags.items() if v}


def generate_variant_keys(setup, direction, interval, tags):
    base = f"{setup}|{direction}|{interval}"

    for k, v in tags.items():
        yield base + "|" + v

    pairs = [
        ("time", "rvol"), ("time", "vwap"), ("time", "rr"), ("time", "score"),
        ("time", "symbol_bucket"), ("rvol", "vwap"), ("rvol", "ema"),
        ("vwap", "ema"), ("rr", "vwap"), ("rr", "rvol"), ("score", "rvol"),
        ("grade", "rvol")
    ]
    for a, b in pairs:
        if a in tags and b in tags:
            yield base + "|" + tags[a] + "|" + tags[b]

    triples = [
        ("time", "rvol", "vwap"), ("time", "rvol", "ema"),
        ("time", "rr", "vwap"), ("time", "score", "rvol"),
        ("rvol", "vwap", "ema"), ("rr", "rvol", "vwap")
    ]
    for a, b, c in triples:
        if a in tags and b in tags and c in tags:
            yield base + "|" + tags[a] + "|" + tags[b] + "|" + tags[c]


def norm_ts(value):
    if value is None:
        return ""
    s = str(value)
    if "T" in s:
        s = s.replace("T", " ")
    if s.endswith("Z"):
        s = s[:-1]
    if "." in s:
        s = s.split(".")[0]
    return s[:19]


def candle_dt(candle):
    return norm_ts(candle.get("datetime") or candle.get("date") or candle.get("time") or candle.get("timestamp"))


def extract_entry(cand, row):
    for key in ["entry", "entryPrice", "entry_price", "triggerPrice", "trigger_price"]:
        value = as_float(row.get(key), None)
        if value is not None:
            return value
        value = as_float(cand.get(key), None)
        if value is not None:
            return value

    entry_zone = cand.get("entryZone") or cand.get("entry_zone") or row.get("entryZone") or row.get("entry_zone")
    if isinstance(entry_zone, dict):
        lo = as_float(entry_zone.get("min") or entry_zone.get("low") or entry_zone.get("from"), None)
        hi = as_float(entry_zone.get("max") or entry_zone.get("high") or entry_zone.get("to"), None)
        if lo is not None and hi is not None:
            return (lo + hi) / 2.0
        if lo is not None:
            return lo
        if hi is not None:
            return hi

    nested = nested_get_any(row, ["entry", "entryPrice", "entry_price", "triggerPrice", "trigger_price"])
    return as_float(nested, None)


def extract_stop(cand, row):
    for key in ["stop", "stopPrice", "stop_price", "initialStop", "initial_stop"]:
        value = as_float(row.get(key), None)
        if value is not None:
            return value
        value = as_float(cand.get(key), None)
        if value is not None:
            return value
    nested = nested_get_any(row, ["stop", "stopPrice", "stop_price", "initialStop", "initial_stop"])
    return as_float(nested, None)


CANDLE_CACHE = {}


def candle_paths(symbol, day):
    base = NORMALIZED_ROOT / symbol
    if not base.exists():
        return []
    exact = base / f"{day}_{day}.jsonl"
    if exact.exists():
        return [exact]
    return sorted(base.glob(f"*{day}*.jsonl"))


def load_candles(symbol, day):
    key = (symbol, day)
    if key in CANDLE_CACHE:
        return CANDLE_CACHE[key]

    rows = []
    for path in candle_paths(symbol, day):
        for c in read_jsonl(path):
            dt = candle_dt(c)
            if not dt.startswith(day):
                continue
            h = as_float(c.get("high"), None)
            l = as_float(c.get("low"), None)
            if h is None or l is None:
                continue
            rows.append({
                "datetime": dt,
                "high": h,
                "low": l,
                "close": as_float(c.get("close"), None),
            })
    rows.sort(key=lambda x: x["datetime"])
    CANDLE_CACHE[key] = rows
    return rows


def replay(row, shadow_candidate):
    cand = extract_candidate(row)
    day = pick_date(row)
    setup, direction, interval, symbol, tags = row_tags(row)

    candidate_at = norm_ts(row.get("candidateAt") or cand.get("candidateAt") or cand.get("datetime"))
    entry = extract_entry(cand, row)
    stop = extract_stop(cand, row)

    if entry is None or stop is None or not candidate_at or not day or symbol == "UNKNOWN":
        return {
            "date": day,
            "symbol": symbol,
            "status": "NO_EVAL",
            "resultR": 0.0,
            "reason": "missing_entry_stop_candidate_time_or_symbol",
        }

    base_r = abs(float(entry) - float(stop))
    if base_r <= 0:
        return {
            "date": day,
            "symbol": symbol,
            "status": "NO_EVAL",
            "resultR": 0.0,
            "reason": "invalid_base_r",
        }

    strategy = shadow_candidate.get("strategy") or {}
    mgmt = strategy.get("management") or {}

    target_r = float(mgmt.get("targetR"))
    stop_mult = float(mgmt.get("stopMultiple"))

    if direction == "LONG":
        managed_stop = entry - base_r * stop_mult
        managed_target = entry + base_r * target_r
    elif direction == "SHORT":
        managed_stop = entry + base_r * stop_mult
        managed_target = entry - base_r * target_r
    else:
        return {
            "date": day,
            "symbol": symbol,
            "status": "NO_EVAL",
            "resultR": 0.0,
            "reason": "missing_direction",
        }

    candles = load_candles(symbol, day)
    if not candles:
        return {
            "date": day,
            "symbol": symbol,
            "status": "NO_EVAL",
            "resultR": 0.0,
            "reason": "missing_candles",
        }

    after = [c for c in candles if c["datetime"] > candidate_at]
    if not after:
        return {
            "date": day,
            "symbol": symbol,
            "status": "NO_EVAL",
            "resultR": 0.0,
            "reason": "no_candles_after_candidate",
        }

    for c in after:
        high = c["high"]
        low = c["low"]

        # Conservative same-candle ambiguity: stop first.
        if direction == "LONG":
            if low <= managed_stop:
                return {"date": day, "symbol": symbol, "status": "FAILED", "resultR": -stop_mult, "eventTime": c["datetime"]}
            if high >= managed_target:
                return {"date": day, "symbol": symbol, "status": "WORKED", "resultR": target_r, "eventTime": c["datetime"]}
        else:
            if high >= managed_stop:
                return {"date": day, "symbol": symbol, "status": "FAILED", "resultR": -stop_mult, "eventTime": c["datetime"]}
            if low <= managed_target:
                return {"date": day, "symbol": symbol, "status": "WORKED", "resultR": target_r, "eventTime": c["datetime"]}

    return {
        "date": day,
        "symbol": symbol,
        "status": "NO_DECISION",
        "resultR": 0.0,
        "reason": "no_target_or_stop",
    }


def metric(rows):
    decisions = [r for r in rows if r["status"] in ("WORKED", "FAILED")]
    wins = [r for r in decisions if r["status"] == "WORKED"]
    losses = [r for r in decisions if r["status"] == "FAILED"]
    total = len(rows)
    decision_count = len(decisions)
    avg_r = sum(float(r.get("resultR") or 0) for r in decisions) / decision_count if decision_count else 0.0
    return {
        "totalTrades": total,
        "decisionTrades": decision_count,
        "wins": len(wins),
        "losses": len(losses),
        "ignored": total - decision_count,
        "decisionRate": round(decision_count / total, 6) if total else 0.0,
        "winRate": round(len(wins) / decision_count, 6) if decision_count else 0.0,
        "avgR": round(avg_r, 6),
        "uniqueSymbols": len(set(r.get("symbol") for r in rows if r.get("symbol"))),
    }


def load_shadow_registry():
    payload = read_json(REGISTRY_PATH)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Cannot read live shadow registry: {REGISTRY_PATH}")
    candidates = payload.get("candidates") or []
    active = []
    for c in candidates:
        gates = c.get("gates") or {}
        if c.get("mode") == "shadow_only" and gates.get("clientReleaseAllowed") is False and gates.get("telegramAllowed") is False:
            active.append(c)
    return active, payload


def main():
    day = target_date()

    write_progress({
        "ok": True,
        "storageVersion": VERSION,
        "stage": "started",
        "date": day,
        "skipPipeline": SKIP_PIPELINE,
        "policy": {
            "researchOnly": True,
            "shadowOnly": True,
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
        },
    })

    shadow_candidates, registry = load_shadow_registry()

    steps = []
    skip_reason = None
    if not SKIP_PIPELINE:
        write_progress({"ok": True, "storageVersion": VERSION, "stage": "running_pipeline", "date": day})
        steps, skip_reason = run_pipeline(day)

    if skip_reason:
        report = {
            "ok": True,
            "storageVersion": VERSION,
            "createdAt": now_iso(),
            "date": day,
            "status": "SKIPPED",
            "skipReason": skip_reason,
            "pipelineSteps": steps,
            "researchOnly": True,
            "shadowOnly": True,
            "doesNotChangeClientDelivery": True,
            "doesNotSendTelegram": True,
        }
        daily_path = DAILY_DIR / f"{day}_s898_forward_shadow_daily.json"
        daily_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        write_progress({"ok": True, "storageVersion": VERSION, "stage": "skipped", "date": day, "skipReason": skip_reason})
        print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
        return

    source_keys = {}
    for c in shadow_candidates:
        key = ((c.get("source") or {}).get("sourceVariantKey"))
        if key:
            source_keys.setdefault(key, []).append(c)

    candidate_results = defaultdict(list)
    matched_rows = 0
    files_scanned = 0
    rows_scanned = 0
    rows_used = 0

    write_progress({"ok": True, "storageVersion": VERSION, "stage": "matching_shadow_candidates", "date": day, "shadowCandidateCount": len(shadow_candidates)})

    for symbol_dir in sorted(OUTCOME_ROOT.glob("*")):
        if not symbol_dir.is_dir():
            continue
        for path in sorted(symbol_dir.glob(f"*{day}*.jsonl")):
            files_scanned += 1
            for payload in read_jsonl(path):
                rows_scanned += 1
                if pick_date(payload) != day:
                    continue

                setup, direction, interval, symbol, tags = row_tags(payload)
                if setup == "unknown_setup":
                    continue

                generated = set(generate_variant_keys(setup, direction, interval, tags))
                hit_keys = set(source_keys.keys()).intersection(generated)
                if not hit_keys:
                    continue

                rows_used += 1

                for key in hit_keys:
                    for shadow_candidate in source_keys[key]:
                        r = replay(payload, shadow_candidate)
                        r.update({
                            "candidateId": shadow_candidate.get("candidateId"),
                            "rank": shadow_candidate.get("rank"),
                            "sourceVariantKey": key,
                            "setupSlug": (shadow_candidate.get("strategy") or {}).get("setupSlug"),
                            "direction": (shadow_candidate.get("strategy") or {}).get("direction"),
                            "filters": (shadow_candidate.get("strategy") or {}).get("filters"),
                            "management": (shadow_candidate.get("strategy") or {}).get("management"),
                            "shadowOnly": True,
                            "clientVisible": False,
                            "telegramEligible": False,
                            "productionEligible": False,
                            "evaluatedAt": now_iso(),
                        })
                        candidate_results[shadow_candidate.get("candidateId")].append(r)
                        matched_rows += 1

    per_candidate = []
    all_result_rows = []
    for c in shadow_candidates:
        cid = c.get("candidateId")
        rows = candidate_results.get(cid, [])
        all_result_rows.extend(rows)
        per_candidate.append({
            "candidateId": cid,
            "rank": c.get("rank"),
            "status": c.get("status"),
            "strategy": c.get("strategy"),
            "historicalEvidence": c.get("historicalEvidence"),
            "forwardDate": day,
            "forwardMetrics": metric(rows),
            "results": rows[:100],
        })

    overall_metrics = metric(all_result_rows)

    report = {
        "ok": True,
        "storageVersion": VERSION,
        "createdAt": now_iso(),
        "date": day,
        "status": "COMPLETED",
        "researchOnly": True,
        "shadowOnly": True,
        "doesNotChangeClientDelivery": True,
        "doesNotSendTelegram": True,
        "doesNotSyncSupabase": True,
        "policy": {
            "clientReleaseAllowed": False,
            "telegramAllowed": False,
            "productionEligible": False,
            "requiresForwardShadow": True,
            "requiresManualApproval": True,
        },
        "pipelineSteps": steps,
        "summary": {
            "shadowCandidates": len(shadow_candidates),
            "filesScanned": files_scanned,
            "rowsScanned": rows_scanned,
            "rowsUsed": rows_used,
            "matchedRows": matched_rows,
            "overallForwardMetrics": overall_metrics,
        },
        "perCandidate": per_candidate,
    }

    daily_path = DAILY_DIR / f"{day}_s898_forward_shadow_daily.json"
    latest_path = FORWARD_ROOT / "latest_s898_forward_shadow_daily.json"
    cumulative_path = CUMULATIVE_DIR / "forward_shadow_outcomes.jsonl"

    daily_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    latest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    # Append compact rows to cumulative ledger.
    compact_rows = []
    for r in all_result_rows:
        compact_rows.append({
            "date": day,
            "candidateId": r.get("candidateId"),
            "sourceVariantKey": r.get("sourceVariantKey"),
            "symbol": r.get("symbol"),
            "status": r.get("status"),
            "resultR": r.get("resultR"),
            "eventTime": r.get("eventTime"),
            "evaluatedAt": r.get("evaluatedAt"),
            "shadowOnly": True,
            "clientVisible": False,
            "telegramEligible": False,
        })
    write_jsonl_append(cumulative_path, compact_rows)

    output = {
        "ok": True,
        "storageVersion": VERSION,
        "date": day,
        "summary": report["summary"],
        "topPerCandidate": [
            {
                "candidateId": x["candidateId"],
                "rank": x["rank"],
                "setupSlug": (x["strategy"] or {}).get("setupSlug"),
                "management": (x["strategy"] or {}).get("management"),
                "forwardMetrics": x["forwardMetrics"],
            }
            for x in per_candidate[:10]
        ],
        "dailyFile": str(daily_path),
        "latestFile": str(latest_path),
        "cumulativeFile": str(cumulative_path),
        "policy": report["policy"],
    }

    write_progress({"ok": True, "storageVersion": VERSION, "stage": "completed", "date": day, "summary": report["summary"], "latestFile": str(latest_path)})
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        err = {
            "ok": False,
            "storageVersion": VERSION,
            "stage": "failed",
            "error": repr(e),
            "traceback": traceback.format_exc(),
            "updatedAt": now_iso(),
        }
        write_progress(err)
        print(json.dumps(err, ensure_ascii=False, indent=2, default=str))
        sys.exit(1)
