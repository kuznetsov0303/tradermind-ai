from __future__ import annotations

import argparse, json, os, shutil, socket, ssl, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

VERSION = "s8_8_production_live_day_readiness_v1"
APP_DIR = Path(os.environ.get("APP_DIR", "/opt/skilledge/stock-engine"))
REPORT_DIR = APP_DIR / "reports" / "production_readiness"
WATCHDOG_LATEST = APP_DIR / "reports" / "engine_watchdog" / "latest.json"
SERVICES = ["skilledge-stock-engine-api", "skilledge-daily-ai-desk", "skilledge-telegram-consumer"]
TIMERS = ["skilledge-nightly-self-learning.timer", "skilledge-engine-watchdog.timer"]

def now_utc(): return datetime.now(timezone.utc)
def iso_now(): return now_utc().isoformat()

def load_env(path: Path):
    if not path.exists(): return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ: os.environ[k] = v

def run(cmd, timeout=25):
    started = time.time()
    try:
        p = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)
        return {"ok": p.returncode == 0, "exitCode": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip(), "durationSec": round(time.time()-started, 3)}
    except Exception as e:
        return {"ok": False, "exitCode": 999, "stdout": "", "stderr": repr(e), "durationSec": round(time.time()-started, 3)}

def systemd_active(name):
    r = run(["systemctl", "is-active", name], 10)
    status = r["stdout"] or r["stderr"] or f"exit_{r['exitCode']}"
    return {"name": name, "active": status == "active", "status": status, "exitCode": r["exitCode"]}

def http_json(url, headers=None, timeout=25):
    started = time.time()
    try:
        with urlopen(Request(url, headers=headers or {}), timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try: payload = json.loads(raw) if raw else None
            except Exception: payload = {"raw": raw[:1500]}
            return {"ok": 200 <= resp.status < 300, "status": resp.status, "durationSec": round(time.time()-started, 3), "payload": payload, "error": None}
    except HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")[:1500]
        return {"ok": False, "status": e.code, "durationSec": round(time.time()-started, 3), "payload": {"raw": raw}, "error": None}
    except URLError as e:
        return {"ok": False, "status": None, "durationSec": round(time.time()-started, 3), "payload": None, "error": str(e.reason)}
    except Exception as e:
        return {"ok": False, "status": None, "durationSec": round(time.time()-started, 3), "payload": None, "error": repr(e)}

def read_secret():
    for k in ("STOCK_ENGINE_PROXY_SECRET", "ENGINE_PROXY_SECRET"):
        if os.environ.get(k): return os.environ[k]
    path = Path("/etc/nginx/sites-available/skilledge-engine-secure.conf")
    if not path.exists(): return ""
    text = path.read_text(encoding="utf-8", errors="ignore")
    marker = 'http_x_skilledge_engine_key != "'
    if marker in text: return text.split(marker, 1)[1].split('"', 1)[0].strip()
    return ""

def payload_ok(payload): return isinstance(payload, dict) and bool(payload.get("ok"))

def cert_check(public_url):
    host = urlparse(public_url).hostname
    if not host: return {"ok": False, "error": "missing_host"}
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=15) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        not_after = cert.get("notAfter")
        exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        days = (exp - now_utc()).days
        return {"ok": days > 14, "host": host, "notAfter": not_after, "daysLeft": days, "warning": days <= 14}
    except Exception as e:
        return {"ok": False, "host": host, "error": repr(e)}

def watchdog_check(max_age=15):
    if not WATCHDOG_LATEST.exists(): return {"ok": False, "exists": False, "error": "missing_watchdog_report"}
    try:
        data = json.loads(WATCHDOG_LATEST.read_text(encoding="utf-8"))
        gen_raw = data.get("generatedAt")
        gen = datetime.fromisoformat(gen_raw)
        if gen.tzinfo is None: gen = gen.replace(tzinfo=timezone.utc)
        age = (now_utc() - gen.astimezone(timezone.utc)).total_seconds()/60
        return {"ok": bool(data.get("ok")) and age <= max_age, "exists": True, "watchdogOk": bool(data.get("ok")), "ageMinutes": round(age, 1), "issues": data.get("issues", []), "generatedAt": gen_raw}
    except Exception as e:
        return {"ok": False, "exists": True, "error": repr(e)}

def disk_check():
    u = shutil.disk_usage(str(APP_DIR))
    free = round(u.free/(1024**3), 2); total = round(u.total/(1024**3), 2); used = round(u.used/u.total*100, 2)
    return {"ok": free >= 5 and used < 90, "freeGb": free, "totalGb": total, "usedPct": used}

def daily_permission_errors(minutes=60):
    r = run(["journalctl", "-u", "skilledge-daily-ai-desk", "--since", f"{minutes} minutes ago", "--no-pager"], 30)
    text = (r.get("stdout") or "") + "\n" + (r.get("stderr") or "")
    matches = [ln for ln in text.splitlines() if "Permission denied" in ln or "PermissionError" in ln]
    return {"ok": len(matches) == 0, "checkedMinutes": minutes, "matchCount": len(matches), "matches": matches[-10:]}

def telegram(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_SIGNALS_BOT_TOKEN") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or os.environ.get("TELEGRAM_SIGNALS_ADMIN_CHAT_ID") or ""
    if not token or not chat_id: return {"sent": False, "reason": "missing_telegram_env"}
    import urllib.parse
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode("utf-8")
    req = Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with urlopen(req, timeout=20) as resp: return {"sent": True, "status": resp.status}
    except Exception as e: return {"sent": False, "reason": repr(e)}

def save(report):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    p = REPORT_DIR / f"{now_utc().strftime('%Y%m%d_%H%M%S')}.json"
    text = json.dumps(report, indent=2, ensure_ascii=False)
    p.write_text(text, encoding="utf-8"); (REPORT_DIR/"latest.json").write_text(text, encoding="utf-8")
    return p

def readiness(args):
    load_env(APP_DIR/".env"); load_env(APP_DIR/".env.server")
    blockers, warnings, checks = [], [], {}
    for s in SERVICES:
        c = systemd_active(s); checks[f"service:{s}"] = c
        if not c["active"]: blockers.append(f"{s} is {c['status']}")
    for t in TIMERS:
        c = systemd_active(t); checks[f"timer:{t}"] = c
        if not c["active"]: blockers.append(f"{t} is {c['status']}")
    checks["disk"] = disk_check()
    if not checks["disk"]["ok"]: blockers.append(f"disk not healthy: {checks['disk']}")
    checks["watchdogFresh"] = watchdog_check(args.watchdog_max_age_minutes)
    if not checks["watchdogFresh"]["ok"]: warnings.append(f"watchdog report stale/bad: {checks['watchdogFresh']}")
    checks["dailyPermissionErrors"] = daily_permission_errors(args.journal_minutes)
    if not checks["dailyPermissionErrors"]["ok"]: blockers.append(f"daily runner permission errors: {checks['dailyPermissionErrors']['matchCount']}")
    local = http_json("http://127.0.0.1:8000/health", timeout=args.http_timeout); checks["localHealth"] = local
    if not local["ok"] or not payload_ok(local.get("payload")): blockers.append(f"local health failed: {local.get('status')} {local.get('error')}")
    public = args.public_url.rstrip('/'); frontend = args.frontend_url.rstrip('/')
    nosec = http_json(public+"/health", timeout=args.http_timeout); checks["publicHttpsWithoutSecret"] = nosec
    if nosec.get("status") != 403: blockers.append(f"public without secret expected 403 got {nosec.get('status')}")
    secret = read_secret()
    if not secret:
        blockers.append("missing engine proxy secret")
    else:
        wh = http_json(public+"/health", {"X-SkillEdge-Engine-Key": secret}, args.http_timeout); checks["publicHttpsWithSecret"] = wh
        if not wh["ok"] or not payload_ok(wh.get("payload")): blockers.append(f"public health with secret failed: {wh.get('status')} {wh.get('error')}")
        wc = http_json(public+"/engine/cockpit?limit=5", {"X-SkillEdge-Engine-Key": secret}, args.http_timeout); checks["publicCockpitWithSecret"] = wc
        if not wc["ok"]: blockers.append(f"public cockpit with secret failed: {wc.get('status')} {wc.get('error')}")
    checks["sslCert"] = cert_check(public)
    if not checks["sslCert"]["ok"]:
        if checks["sslCert"].get("warning"): warnings.append(f"SSL cert expires soon: daysLeft={checks['sslCert'].get('daysLeft')}")
        else: blockers.append(f"SSL cert check failed: {checks['sslCert']}")
    fh = http_json(frontend+"/api/stock-engine/health", timeout=args.http_timeout); checks["frontendProxyHealth"] = fh
    if not fh["ok"] or not payload_ok(fh.get("payload")): blockers.append(f"frontend health failed: {fh.get('status')} {fh.get('error')}")
    fs = http_json(frontend+"/api/stock-engine/market-session", timeout=args.http_timeout); checks["frontendMarketSession"] = fs
    if not fs["ok"] or not payload_ok(fs.get("payload")): blockers.append(f"frontend market-session failed: {fs.get('status')} {fs.get('error')}")
    else:
        val = (fs.get("payload") or {}).get("value") or {}
        state = val.get("marketState")
        if state in ("MARKET_CLOSED_HOLIDAY", "MARKET_CLOSED_WEEKEND"): warnings.append(f"market currently closed: {state} {val.get('reason')}")
        if args.strict_live_day and not val.get("liveDiscoveryAllowed"): blockers.append(f"strict live day expected liveDiscoveryAllowed=true, got {state}")
    fc = http_json(frontend+"/api/stock-engine/cockpit?limit=5", timeout=args.http_timeout); checks["frontendCockpit"] = fc
    if not fc["ok"] or not payload_ok(fc.get("payload")): blockers.append(f"frontend cockpit failed: {fc.get('status')} {fc.get('error')}")
    report = {"ok": not blockers, "version": VERSION, "mode": "production_live_day_readiness", "generatedAt": iso_now(), "publicUrl": public, "frontendUrl": frontend, "strictLiveDay": bool(args.strict_live_day), "blockers": blockers, "warnings": warnings, "checks": checks}
    p = save(report); report["reportPath"] = str(p)
    if blockers and args.alert_on_blocker:
        report["telegram"] = telegram("🚨 SkillEdge Production Readiness BLOCKED\n" + "\n".join(f"- {x}" for x in blockers[:12])); save(report)
    return report

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public-url", default=os.environ.get("STOCK_ENGINE_PUBLIC_URL", "https://engine.upyourskills.site"))
    ap.add_argument("--frontend-url", default=os.environ.get("SKILLEDGE_FRONTEND_URL", "https://www.upyourskills.site"))
    ap.add_argument("--http-timeout", type=int, default=25)
    ap.add_argument("--journal-minutes", type=int, default=60)
    ap.add_argument("--watchdog-max-age-minutes", type=int, default=15)
    ap.add_argument("--strict-live-day", action="store_true")
    ap.add_argument("--alert-on-blocker", action="store_true")
    args = ap.parse_args()
    r = readiness(args)
    print(json.dumps({"ok": r.get("ok"), "version": r.get("version"), "blockers": r.get("blockers"), "warnings": r.get("warnings"), "reportPath": r.get("reportPath")}, indent=2, ensure_ascii=False))
    return 0 if r.get("ok") else 2
if __name__ == "__main__": raise SystemExit(main())
