from __future__ import annotations

import argparse
import json
import sys

from runner_utils import http_json, load_dotenv, now_kyiv


VERSION = "s8_1_server_healthcheck_v1"


def main() -> int:
    parser = argparse.ArgumentParser(description="SkillEdge server healthcheck.")
    parser.add_argument("--deep", action="store_true", help="Check more endpoints.")
    args = parser.parse_args()

    load_dotenv(".env.server")
    load_dotenv(".env")

    checks = [
        ("health", "GET", "/health", None, 20),
        ("engine_status", "GET", "/engine/status", None, 30),
        ("runtime_source_status", "GET", "/engine/runtime/source-status", {"limit": 20}, 60),
        ("calibration_preview_cache", "GET", "/engine/calibration/preview/cache", None, 30),
    ]

    if args.deep:
        checks.extend([
            ("cockpit", "GET", "/engine/cockpit", {"limit": 20}, 60),
            ("replay_multiday_cache", "GET", "/engine/replay/multiday/cache", None, 30),
            ("hybrid_calibration_cache", "GET", "/engine/calibration/hybrid/cache", None, 30),
        ])

    results = []
    ok = True
    for name, method, path, params, timeout in checks:
        result = http_json(method, path, params=params, timeout=timeout)
        results.append({"name": name, **result})
        ok = ok and bool(result.get("ok"))

    payload = {
        "ok": ok,
        "version": VERSION,
        "generatedAtKyiv": now_kyiv().isoformat(),
        "checks": results,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
