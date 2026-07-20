from __future__ import annotations

import json
import os
import time
import socket
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo


KYIV_TZ = ZoneInfo("Europe/Kyiv")
NY_TZ = ZoneInfo("America/New_York")


def load_dotenv(path: str | Path = ".env") -> None:
    file_path = Path(path)
    if not file_path.exists():
        return

    for raw_line in file_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value


def api_base() -> str:
    return (
        os.environ.get("STOCK_ENGINE_API_URL")
        or os.environ.get("STOCK_ENGINE_URL")
        or "http://127.0.0.1:8000"
    ).rstrip("/")


def now_kyiv() -> datetime:
    return datetime.now(KYIV_TZ)


def parse_hhmm(value: str, fallback: str = "00:00") -> tuple[int, int]:
    raw = str(value or fallback).strip()
    if ":" not in raw:
        raw = fallback
    hour_s, minute_s = raw.split(":", 1)
    hour = max(0, min(int(hour_s), 23))
    minute = max(0, min(int(minute_s), 59))
    return hour, minute


def in_kyiv_window(start_hhmm: str, end_hhmm: str, at: datetime | None = None) -> bool:
    at = at or now_kyiv()
    sh, sm = parse_hhmm(start_hhmm, "11:00")
    eh, em = parse_hhmm(end_hhmm, "23:00")
    start = at.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = at.replace(hour=eh, minute=em, second=0, microsecond=0)
    if end <= start:
        end = end + timedelta(days=1)
    return start <= at <= end


def weekday_dates_ending_today(count: int = 3, include_today: bool = True) -> list[str]:
    out: list[str] = []
    current = now_kyiv().date()
    if not include_today:
        current = current - timedelta(days=1)

    while len(out) < max(1, count):
        if current.weekday() < 5:
            out.append(current.isoformat())
        current = current - timedelta(days=1)

    return list(reversed(out))


def http_json(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    query = urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = f"{api_base()}{path}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        method=method.upper(),
        headers={"Accept": "application/json"},
    )

    started = time.time()
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            payload = json.loads(raw) if raw else {}
            return {
                "ok": True,
                "status": response.status,
                "url": url,
                "durationSec": round(time.time() - started, 3),
                "payload": payload,
            }
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body) if body else {}
        except Exception:
            parsed = {"raw": body}
        return {
            "ok": False,
            "status": error.code,
            "url": url,
            "durationSec": round(time.time() - started, 3),
            "error": parsed,
        }
    except (TimeoutError, socket.timeout) as error:
        return {
            "ok": False,
            "status": None,
            "url": url,
            "durationSec": round(time.time() - started, 3),
            "error": {
                "type": "timeout",
                "message": str(error) or "request timed out",
                "timeoutSec": timeout,
            },
        }
    except URLError as error:
        return {
            "ok": False,
            "status": None,
            "url": url,
            "durationSec": round(time.time() - started, 3),
            "error": {
                "type": "url_error",
                "message": repr(error),
            },
        }
    except Exception as error:
        return {
            "ok": False,
            "status": None,
            "url": url,
            "durationSec": round(time.time() - started, 3),
            "error": {
                "type": "unexpected_error",
                "message": repr(error),
            },
        }


def report_dir(name: str) -> Path:
    path = Path("reports") / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_json_report(name: str, payload: dict[str, Any]) -> Path:
    directory = report_dir(name)
    stamp = now_kyiv().strftime("%Y%m%d_%H%M%S")
    path = directory / f"{stamp}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    latest = directory / "latest.json"
    latest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def step(name: str, method: str, path: str, params: dict[str, Any] | None = None, timeout: int = 60) -> dict[str, Any]:
    print(f"[{now_kyiv().isoformat()}] {name} -> {method.upper()} {path}")
    result = http_json(method, path, params=params, timeout=timeout)
    status = "OK" if result.get("ok") else "FAIL"
    print(f"  {status} status={result.get('status')} duration={result.get('durationSec')}s")
    return {"name": name, **result}


def step_first_ok(
    name: str,
    candidates: list[dict[str, Any]],
    *,
    timeout: int = 60,
    optional: bool = False,
) -> dict[str, Any]:
    """Try multiple endpoint candidates and return the first successful one.

    Useful for server runners where older/local API builds may expose slightly
    different route names. If `optional=True`, the runner records a warning
    instead of failing the whole report when all candidates fail.
    """

    attempts: list[dict[str, Any]] = []
    for candidate in candidates:
        method = str(candidate.get("method") or "GET")
        path = str(candidate.get("path") or "")
        params = candidate.get("params") if isinstance(candidate.get("params"), dict) else None
        label = str(candidate.get("label") or path)

        print(f"[{now_kyiv().isoformat()}] {name}/{label} -> {method.upper()} {path}")
        result = http_json(method, path, params=params, timeout=timeout)
        attempts.append({"label": label, **result})
        if result.get("ok"):
            print(f"  OK status={result.get('status')} duration={result.get('durationSec')}s")
            return {
                "name": name,
                "ok": True,
                "status": result.get("status"),
                "durationSec": result.get("durationSec"),
                "url": result.get("url"),
                "selected": label,
                "optional": bool(optional),
                "attempts": attempts,
                "payload": result.get("payload"),
            }

        print(f"  FAIL status={result.get('status')} duration={result.get('durationSec')}s")

    return {
        "name": name,
        "ok": True if optional else False,
        "status": attempts[-1].get("status") if attempts else None,
        "durationSec": sum(float(a.get("durationSec") or 0) for a in attempts),
        "selected": None,
        "optional": bool(optional),
        "warning": "all_endpoint_candidates_failed" if optional else None,
        "attempts": attempts,
    }
