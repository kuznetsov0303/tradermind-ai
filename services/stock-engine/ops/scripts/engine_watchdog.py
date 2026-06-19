from __future__ import annotations

import argparse, json, os, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

VERSION = "s8_6_engine_monitoring_watchdog_v1"
APP_DIR = Path(os.environ.get("APP_DIR", "/opt/skilledge/stock-engine"))
REPORT_DIR = APP_DIR / "reports" / "engine_watchdog"
SERVICES = ["skilledge-stock-engine-api", "skilledge-daily-ai-desk", "skilledge-telegram-consumer"]
TIMERS = ["skilledge-nightly-self-learning.timer"]

def now(): return datetime.now(timezone.utc).isoformat()

def load_env(path: Path):
    if not path.exists(): return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ: os.environ[k] = v

def run(cmd, timeout=20):
    try:
        p = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 999, "", repr(e)

def active(name: str):
    code, out, err = run(["systemctl", "is-active", name], 10)
    return {"name": name, "active": out == "active", "status": out or err or f"exit_{code}", "exitCode": code}

def restart(name: str):
    code, out, err = run(["systemctl", "restart", name], 60)
    time.sleep(2)
    return {"name": name, "restartExitCode": code, "restartStdout": out, "restartStderr": err, "after": active(name)}

def http(url: str, headers=None, timeout=20):
    started = time.time()
    try:
        with urlopen(Request(url, headers=headers or {}), timeout=timeout) as r:
            text = r.read().decode("utf-8", errors="replace")
            try: payload = json.loads(text) if text else None
            except Exception: payload = {"raw": text[:1000]}
            return {"ok": 200 <= r.status < 300, "status": r.status, "durationSec": round(time.time()-started, 3), "payload": payload, "error": None}
    except HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")[:1000]
        return {"ok": False, "status": e.code, "durationSec": round(time.time()-started, 3), "payload": {"raw": text}, "error": None}
    except URLError as e:
        return {"ok": False, "status": None, "durationSec": round(time.time()-started, 3), "payload": None, "error": str(e.reason)}
    except Exception as e:
        return {"ok": False, "status": None, "durationSec": round(time.time()-started, 3), "payload": None, "error": repr(e)}

def nginx_secret():
    for k in ("STOCK_ENGINE_PROXY_SECRET", "ENGINE_PROXY_SECRET"):
        if os.environ.get(k): return os.environ[k]
    path = Path("/etc/nginx/sites-available/skilledge-engine-secure.conf")
    if not path.exists(): return ""
    text = path.read_text(encoding="utf-8", errors="ignore")
    marker = 'http_x_skilledge_engine_key != "'
    if marker in text:
        return text.split(marker, 1)[1].split('"', 1)[0].strip()
    return ""

def telegram(text: str):
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_SIGNALS_BOT_TOKEN") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or os.environ.get("TELEGRAM_SIGNALS_ADMIN_CHAT_ID") or ""
    if not token or not chat_id: return {"sent": False, "reason": "missing_telegram_env"}
    import urllib.parse
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode()
    req = Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urlopen(req, timeout=20) as r:
            return {"sent": True, "status": r.status}
    except Exception as e:
        return {"sent": False, "reason": repr(e)}

def save(report):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    p = REPORT_DIR / f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    text = json.dumps(report, indent=2, ensure_ascii=False)
    p.write_text(text, encoding="utf-8")
    (REPORT_DIR / "latest.json").write_text(text, encoding="utf-8")
    return p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public-url", default="https://engine.upyourskills.site")
    ap.add_argument("--http-timeout", type=int, default=20)
    ap.add_argument("--auto-restart", action="store_true", default=True)
    ap.add_argument("--no-auto-restart", dest="auto_restart", action="store_false")
    ap.add_argument("--alert", action="store_true", default=True)
    ap.add_argument("--no-alert", dest="alert", action="store_false")
    args = ap.parse_args()

    load_env(APP_DIR / ".env")
    load_env(APP_DIR / ".env.server")

    checks, actions, issues = [], [], []
    for svc in SERVICES:
        c = active(svc); checks.append({"type": "systemd_service", **c})
        if not c["active"]:
            issues.append(f"{svc}:{c['status']}")
            if args.auto_restart: actions.append({"type": "restart_service", **restart(svc)})
    for t in TIMERS:
        c = active(t); checks.append({"type": "systemd_timer", **c})
        if not c["active"]:
            issues.append(f"{t}:{c['status']}")
            if args.auto_restart: actions.append({"type": "restart_timer", **restart(t)})

    lh = http("http://127.0.0.1:8000/health", timeout=args.http_timeout)
    checks.append({"type": "http_local_health", **lh})
    if not lh["ok"]:
        issues.append(f"local_health:{lh.get('status') or lh.get('error')}")
        if args.auto_restart: actions.append({"type": "restart_service", **restart("skilledge-stock-engine-api")})

    public = args.public_url.rstrip("/")
    no_key = http(public + "/health", timeout=args.http_timeout)
    checks.append({"type": "https_public_without_secret", **no_key})
    if no_key.get("status") != 403:
        issues.append(f"public_no_secret_expected_403_got_{no_key.get('status')}")

    secret = nginx_secret()
    if secret:
        with_key = http(public + "/health", {"X-SkillEdge-Engine-Key": secret}, args.http_timeout)
        checks.append({"type": "https_public_with_secret", **with_key})
        if not with_key["ok"]:
            issues.append(f"public_with_secret:{with_key.get('status') or with_key.get('error')}")
    else:
        checks.append({"type": "https_public_with_secret", "ok": False, "error": "missing_proxy_secret"})
        issues.append("missing_proxy_secret")

    report = {"ok": not issues, "version": VERSION, "mode": "watchdog_once", "generatedAt": now(), "publicUrl": public, "autoRestart": args.auto_restart, "issues": issues, "checks": checks, "actions": actions}
    p = save(report); report["reportPath"] = str(p)
    if issues and args.alert:
        report["telegram"] = telegram("🚨 SkillEdge VPS watchdog issue\n" + "\n".join(f"- {i}" for i in issues[:10]))
        save(report)
    print(json.dumps({"ok": report["ok"], "version": VERSION, "issues": issues, "actions": actions, "reportPath": str(p)}, indent=2, ensure_ascii=False))
    return 0 if report["ok"] else 2

if __name__ == "__main__":
    raise SystemExit(main())
