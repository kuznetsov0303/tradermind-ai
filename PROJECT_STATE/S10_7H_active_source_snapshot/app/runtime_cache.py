from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CACHE_VERSION = "s412_runtime_cache_v1"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_cache_path() -> Path:
    configured = os.getenv("STOCK_ENGINE_RUNTIME_CACHE_PATH") or os.getenv("SKILLEDGE_STOCK_ENGINE_RUNTIME_CACHE_PATH")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(__file__).resolve().parents[1] / "data" / "runtime_cache.json").resolve()


def env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() not in {"0", "false", "no", "off"}


def resolve_upstash_url() -> str | None:
    raw = (
        os.getenv("UPSTASH_REDIS_REST_URL")
        or os.getenv("REDIS_REST_URL")
        or os.getenv("SKILLEDGE_REDIS_REST_URL")
    )
    return raw.rstrip("/") if raw else None


def resolve_upstash_token() -> str | None:
    return (
        os.getenv("UPSTASH_REDIS_REST_TOKEN")
        or os.getenv("REDIS_REST_TOKEN")
        or os.getenv("SKILLEDGE_REDIS_REST_TOKEN")
    )


class RuntimeCache:
    """Fast runtime cache for WATCH / ARMED / ACTIVE / latest signals.

    Production path: Upstash Redis REST when UPSTASH_REDIS_REST_URL +
    UPSTASH_REDIS_REST_TOKEN are configured.

    Local/dev path: JSON file fallback. This lets the engine keep the exact same
    API shape before paid Redis/Upstash is connected.
    """

    def __init__(self, cache_path: str | Path | None = None) -> None:
        self.url = resolve_upstash_url()
        self.token = resolve_upstash_token()
        self.enabled = env_bool("STOCK_ENGINE_RUNTIME_CACHE_ENABLED", True)
        self.upstash_enabled = bool(self.enabled and self.url and self.token)
        self.cache_path = Path(cache_path).expanduser().resolve() if cache_path else default_cache_path()
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.last_error: str | None = None

    def _load_file_store(self) -> dict[str, Any]:
        if not self.cache_path.exists():
            return {}
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception as error:
            self.last_error = f"file_load_error: {error!r}"
            return {}

    def _save_file_store(self, store: dict[str, Any]) -> None:
        tmp = self.cache_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
        tmp.replace(self.cache_path)

    def _upstash_command(self, command: list[Any]) -> Any:
        if not self.upstash_enabled or not self.url or not self.token:
            return None
        request = urllib.request.Request(
            self.url,
            data=json.dumps(command, ensure_ascii=False, default=str).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
                decoded = json.loads(raw) if raw else {}
                self.last_error = None
                if isinstance(decoded, dict) and "error" in decoded and decoded.get("error"):
                    self.last_error = str(decoded.get("error"))
                return decoded.get("result") if isinstance(decoded, dict) else decoded
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self.last_error = f"upstash_http_{error.code}: {detail[:500]}"
            return None
        except Exception as error:
            self.last_error = f"upstash_error: {error!r}"
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int = 900) -> bool:
        if not self.enabled or not key:
            return False
        payload = {
            "cacheVersion": CACHE_VERSION,
            "key": key,
            "updatedAt": utc_now_iso(),
            "expiresAtEpoch": int(time.time()) + int(ttl_seconds or 900),
            "value": value,
        }
        encoded = json.dumps(payload, ensure_ascii=False, default=str)

        if self.upstash_enabled:
            result = self._upstash_command(["SET", key, encoded, "EX", int(ttl_seconds or 900)])
            return self.last_error is None and result is not None

        store = self._load_file_store()
        store[key] = payload
        self._save_file_store(store)
        self.last_error = None
        return True

    def get_json(self, key: str) -> Any | None:
        if not self.enabled or not key:
            return None

        if self.upstash_enabled:
            raw = self._upstash_command(["GET", key])
            if not raw:
                return None
            try:
                decoded = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(decoded, dict):
                    return decoded.get("value")
            except Exception as error:
                self.last_error = f"upstash_decode_error: {error!r}"
            return None

        store = self._load_file_store()
        item = store.get(key)
        if not isinstance(item, dict):
            return None
        expires_at = item.get("expiresAtEpoch")
        try:
            if expires_at is not None and int(expires_at) < int(time.time()):
                store.pop(key, None)
                self._save_file_store(store)
                return None
        except Exception:
            pass
        return item.get("value")

    def publish_many(self, items: dict[str, Any], ttl_seconds: int = 900) -> dict[str, Any]:
        written = 0
        failed = 0
        keys: list[str] = []
        for key, value in items.items():
            ok = self.set_json(key, value, ttl_seconds=ttl_seconds)
            if ok:
                written += 1
                keys.append(key)
            else:
                failed += 1
        return {
            "ok": failed == 0,
            "written": written,
            "failed": failed,
            "keys": keys,
            "cache": self.get_status(),
        }

    def get_status(self) -> dict[str, Any]:
        return {
            "cacheVersion": CACHE_VERSION,
            "enabled": self.enabled,
            "mode": "upstash_redis_rest" if self.upstash_enabled else "local_json_fallback",
            "configured": bool(self.url and self.token),
            "hasUpstashUrl": bool(self.url),
            "hasUpstashToken": bool(self.token),
            "cachePath": str(self.cache_path),
            "lastError": self.last_error,
        }


