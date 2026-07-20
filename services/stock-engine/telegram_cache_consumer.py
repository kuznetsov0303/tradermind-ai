from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_env_file(path: Path) -> None:
    """Tiny .env loader so the consumer can run directly from PowerShell."""
    if not path.exists() or not path.is_file():
        return
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip('"').strip("'")
            if name and name not in os.environ:
                os.environ[name] = value
    except Exception:
        # Env loading must never stop the sender. The startup log will expose
        # missing token/chat configuration if the file could not be read.
        return


SCRIPT_DIR = Path(__file__).resolve().parent
load_env_file(SCRIPT_DIR / ".env")
load_env_file(Path.cwd() / ".env")

API_BASE = os.getenv("STOCK_ENGINE_API_BASE", "http://127.0.0.1:8000").rstrip("/")
POLL_SECONDS = int(os.getenv("TELEGRAM_CONSUMER_POLL_SECONDS", "15"))
QUEUE_LIMIT = int(os.getenv("TELEGRAM_CONSUMER_QUEUE_LIMIT", "10"))
DRY_RUN = str(os.getenv("TELEGRAM_CONSUMER_DRY_RUN", "true")).strip().lower() not in {"0", "false", "no", "off"}
BOT_TOKEN = (
    os.getenv("TELEGRAM_BOT_TOKEN")
    or os.getenv("TELEGRAM_SIGNALS_BOT_TOKEN")
    or os.getenv("SKILLEDGE_TELEGRAM_BOT_TOKEN")
)
CHAT_ID = (
    os.getenv("TELEGRAM_CHAT_ID")
    or os.getenv("TELEGRAM_SIGNALS_ADMIN_CHAT_ID")
    or os.getenv("SKILLEDGE_TELEGRAM_CHAT_ID")
)
ENABLE_LIFECYCLE_UPDATES = str(os.getenv("TELEGRAM_CONSUMER_ENABLE_LIFECYCLE_UPDATES", "true")).strip().lower() not in {"0", "false", "no", "off"}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def http_json(method: str, url: str, payload: Any | None = None, timeout: int = 30) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def build_telegram_text(signal: dict[str, Any]) -> str:
    preview = signal.get("messagePreview")
    if isinstance(preview, str) and preview.strip():
        return preview.strip()

    symbol = str(signal.get("symbol") or "?").upper()
    setup = signal.get("setupName") or signal.get("setupSlug") or "Setup"
    direction = str(signal.get("direction") or "?").upper()
    grade = signal.get("signalGrade") or "?"
    score = signal.get("signalScore")
    entry = signal.get("entry")
    stop = signal.get("stop")
    targets = signal.get("targets") if isinstance(signal.get("targets"), list) else []
    tp1 = targets[0].get("price") if len(targets) > 0 and isinstance(targets[0], dict) else None
    tp2 = targets[1].get("price") if len(targets) > 1 and isinstance(targets[1], dict) else None
    triggers = signal.get("triggers") if isinstance(signal.get("triggers"), list) else []
    trigger_text = ", ".join(str(x) for x in triggers[:4]) if triggers else "confirmation"
    return "\n".join([
        f"SkillEdge AI Alert: {symbol} {direction}",
        f"Setup: {setup}",
        f"Grade: {grade}" + (f" / Score: {score}" if score is not None else ""),
        "Status: ACTIVE / Elite idea",
        "",
        f"Entry: {entry}",
        f"Stop: {stop}",
        f"TP1: {tp1}",
        f"TP2: {tp2}",
        "",
        f"Confirmations: {trigger_text}",
        "",
        "Open AI Signal Cockpit for chart, levels and management.",
        "Risk first. Not financial advice.",
    ])


def send_telegram(text: str) -> dict[str, Any]:
    if DRY_RUN:
        return {"ok": True, "dryRun": True, "messageId": f"dry-run:{int(time.time())}"}
    if not BOT_TOKEN or not CHAT_ID:
        return {"ok": False, "error": "missing_TELEGRAM_BOT_TOKEN_or_TELEGRAM_CHAT_ID"}

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "disable_web_page_preview": True,
    }
    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(url, data=encoded, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    result = data.get("result") if isinstance(data, dict) else {}
    return {
        "ok": bool(data.get("ok")) if isinstance(data, dict) else False,
        "dryRun": False,
        "messageId": str(result.get("message_id")) if isinstance(result, dict) and result.get("message_id") is not None else None,
        "raw": data,
    }


def mark_delivered(signal: dict[str, Any], message_id: str | None, dry_run: bool) -> dict[str, Any]:
    signal_id = str(signal.get("signalId") or "").strip()
    params = {
        "signal_id": signal_id,
        "channel": "telegram",
        "message_id": message_id or "",
        "ttl_seconds": "172800",
        "dry_run": "true" if dry_run else "false",
    }
    event_key = signal.get("notificationEventKey")
    event_type = signal.get("notificationEventType")
    if event_key:
        params["notification_event_key"] = str(event_key)
    if event_type:
        params["notification_event_type"] = str(event_type)
    return http_json("POST", f"{API_BASE}/engine/telegram/delivery/mark?{urllib.parse.urlencode(params)}")

def mark_lifecycle_delivered(event: dict[str, Any], message_id: str | None, dry_run: bool) -> dict[str, Any]:
    event_key = str(event.get("notificationEventKey") or "").strip()
    params = {
        "notification_event_key": event_key,
        "signal_id": str(event.get("signalId") or ""),
        "channel": "telegram",
        "message_id": message_id or "",
        "ttl_seconds": "172800",
        "dry_run": "true" if dry_run else "false",
    }
    return http_json("POST", f"{API_BASE}/engine/lifecycle/notifications/mark?{urllib.parse.urlencode(params)}")


def process_lifecycle_once() -> dict[str, Any]:
    if not ENABLE_LIFECYCLE_UPDATES:
        return {"ok": True, "enabled": False, "queuePending": 0, "queueRejected": 0, "effectiveLimit": 0, "processed": 0, "sent": [], "skipped": []}

    queue_url = f"{API_BASE}/engine/lifecycle/notifications/queue?limit={QUEUE_LIMIT}&include_rejected=false"
    queue = http_json("GET", queue_url)
    items = queue.get("items") if isinstance(queue.get("items"), list) else []
    sent = []
    skipped = []

    for event in items:
        if not isinstance(event, dict):
            continue
        event_key = str(event.get("notificationEventKey") or "").strip()
        if not event_key:
            skipped.append({"reason": "missing_notification_event_key", "event": event})
            continue
        text = build_telegram_text(event)
        result = send_telegram(text)
        if result.get("ok"):
            mark = mark_lifecycle_delivered(event, result.get("messageId"), bool(result.get("dryRun")))
            sent.append({
                "notificationEventKey": event_key,
                "notificationEventType": event.get("notificationEventType"),
                "signalId": event.get("signalId"),
                "symbol": event.get("symbol"),
                "dryRun": result.get("dryRun"),
                "messageId": result.get("messageId"),
                "markOk": mark.get("ok"),
            })
        else:
            skipped.append({"notificationEventKey": event_key, "symbol": event.get("symbol"), "error": result.get("error")})

    return {
        "ok": True,
        "enabled": True,
        "queuePending": queue.get("pendingCount"),
        "queueRejected": queue.get("rejectedCount"),
        "effectiveLimit": queue.get("effectiveLimit"),
        "processed": len(sent),
        "sent": sent,
        "skipped": skipped,
    }


def process_once() -> dict[str, Any]:
    queue_url = f"{API_BASE}/engine/telegram/delivery/queue?limit={QUEUE_LIMIT}&include_rejected=false"
    queue = http_json("GET", queue_url)
    items = queue.get("items") if isinstance(queue.get("items"), list) else []
    sent = []
    skipped = []

    for signal in items:
        if not isinstance(signal, dict):
            continue
        signal_id = str(signal.get("signalId") or "").strip()
        event_key = str(signal.get("notificationEventKey") or "").strip()
        if not signal_id:
            skipped.append({"reason": "missing_signal_id", "signal": signal})
            continue
        text = build_telegram_text(signal)
        result = send_telegram(text)
        if result.get("ok"):
            mark = mark_delivered(signal, result.get("messageId"), bool(result.get("dryRun")))
            sent.append({
                "signalId": signal_id,
                "notificationEventKey": event_key,
                "symbol": signal.get("symbol"),
                "dryRun": result.get("dryRun"),
                "messageId": result.get("messageId"),
                "markOk": mark.get("ok"),
            })
        else:
            skipped.append({"signalId": signal_id, "symbol": signal.get("symbol"), "error": result.get("error")})

    lifecycle = process_lifecycle_once()

    return {
        "ok": True,
        "queuePending": queue.get("pendingCount"),
        "queueRejected": queue.get("rejectedCount"),
        "effectiveLimit": queue.get("effectiveLimit"),
        "processed": len(sent),
        "sent": sent,
        "skipped": skipped,
        "lifecycleEnabled": lifecycle.get("enabled"),
        "lifecyclePending": lifecycle.get("queuePending"),
        "lifecycleRejected": lifecycle.get("queueRejected"),
        "lifecycleProcessed": lifecycle.get("processed"),
        "lifecycleSent": lifecycle.get("sent") or [],
        "lifecycleSkipped": lifecycle.get("skipped") or [],
    }


def main() -> None:
    print(f"[{utc_now()}] SkillEdge Telegram cache consumer starting")
    print(f"[{utc_now()}] api={API_BASE} poll={POLL_SECONDS}s limit={QUEUE_LIMIT} dryRun={DRY_RUN}")
    print(f"[{utc_now()}] tokenConfigured={bool(BOT_TOKEN)} chatConfigured={bool(CHAT_ID)}")
    print(f"[{utc_now()}] notificationModel=S4.14B-2 smart events + S4.15C lifecycle updates")
    print(f"[{utc_now()}] lifecycleUpdatesEnabled={ENABLE_LIFECYCLE_UPDATES}")
    print(f"[{utc_now()}] Use Ctrl+C to stop.")
    while True:
        try:
            result = process_once()
            print(
                f"[{utc_now()}] queuePending={result.get('queuePending')} "
                f"rejected={result.get('queueRejected')} limit={result.get('effectiveLimit')} "
                f"processed={result.get('processed')} skipped={len(result.get('skipped') or [])} "
                f"lifecyclePending={result.get('lifecyclePending')} "
                f"lifecycleProcessed={result.get('lifecycleProcessed')} "
                f"lifecycleSkipped={len(result.get('lifecycleSkipped') or [])}"
            )
            for item in result.get("sent", [])[:10]:
                print(
                    f"[{utc_now()}] delivered signal={item.get('symbol')} "
                    f"id={item.get('signalId')} event={item.get('notificationEventKey')} "
                    f"dryRun={item.get('dryRun')} markOk={item.get('markOk')}"
                )
            for item in result.get("lifecycleSent", [])[:10]:
                print(
                    f"[{utc_now()}] delivered lifecycle={item.get('symbol')} "
                    f"type={item.get('notificationEventType')} event={item.get('notificationEventKey')} "
                    f"dryRun={item.get('dryRun')} markOk={item.get('markOk')}"
                )
            for item in result.get("skipped", [])[:5]:
                print(f"[{utc_now()}] skipped={item}")
        except KeyboardInterrupt:
            print(f"[{utc_now()}] Telegram cache consumer stopped by user")
            return
        except Exception as error:
            print(f"[{utc_now()}] consumer error: {error!r}")
        time.sleep(max(5, POLL_SECONDS))


if __name__ == "__main__":
    main()

