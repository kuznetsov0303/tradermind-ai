#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VERSION = "s8_15a_clean_elite_ledger_automation_v1"


def call_json(method: str, base_url: str, path: str, timeout: int = 180) -> dict[str, Any]:
    req = urllib.request.Request(base_url.rstrip("/") + path, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = json.loads(response.read().decode("utf-8"))
    if isinstance(raw, dict) and isinstance(raw.get("value"), dict):
        return raw["value"]
    return raw if isinstance(raw, dict) else {}


def write_report(report: dict[str, Any]) -> dict[str, str]:
    report_dir = Path("reports/clean_elite")
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
    parser = argparse.ArgumentParser(description="S8.15A Clean Elite Ledger automation.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--initial-capital", type=float, default=50000)
    parser.add_argument("--risk-pct", type=float, default=0.01)
    args = parser.parse_args()

    report: dict[str, Any] = {
        "ok": False,
        "version": VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baseUrl": args.base_url,
        "mode": "post_close_clean_elite_capture_and_stats",
        "parameters": {
            "initialCapital": args.initial_capital,
            "riskPct": args.risk_pct,
        },
        "steps": {},
    }

    try:
        capture = call_json(
            "POST",
            args.base_url,
            "/engine/clean-elite/capture?source=post_close&publish=true",
        )
        report["steps"]["capture"] = capture

        stats = call_json(
            "POST",
            args.base_url,
            f"/engine/clean-elite/stats/run?initial_capital={args.initial_capital}&risk_pct={args.risk_pct}&publish=true",
        )
        report["steps"]["stats"] = stats

        summary = stats.get("summary") if isinstance(stats.get("summary"), dict) else {}
        report["summary"] = {
            "ledgerCount": summary.get("ledgerCount"),
            "closed": summary.get("closed"),
            "open": summary.get("open"),
            "worked": summary.get("worked"),
            "failed": summary.get("failed"),
            "winRateClosed": summary.get("winRateClosed"),
            "avgResultRClosed": summary.get("avgResultRClosed"),
            "finalEquity": summary.get("finalEquity"),
            "totalReturnPct": summary.get("totalReturnPct"),
            "maxDrawdownPct": summary.get("maxDrawdownPct"),
        }
        report["ok"] = True

    except Exception as exc:
        report["error"] = repr(exc)

    write_report(report)

    print(json.dumps({
        "ok": report.get("ok"),
        "version": report.get("version"),
        "generatedAt": report.get("generatedAt"),
        "summary": report.get("summary"),
        "reportFile": report.get("reportFile"),
        "error": report.get("error"),
    }, ensure_ascii=False, indent=2))

    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
