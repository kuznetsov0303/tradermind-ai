from datetime import datetime, timezone
from typing import Any

ENGINE_STARTED_AT = datetime.now(timezone.utc)

WATCHLIST: dict[str, dict[str, Any]] = {}
ARMED: dict[str, dict[str, Any]] = {}
ACTIVE: dict[str, dict[str, Any]] = {}

# Runtime source of truth for dashboard/Telegram signal API output.
# /engine/signals shows ARMED + ACTIVE; /engine/signals/telegram filters only strict ACTIVE Telegram-eligible records.
# Key format: "SYMBOL:setup_slug:YYYY-MM-DD" so one setup per symbol per session is upserted, not duplicated.
SIGNALS: dict[str, dict[str, Any]] = {}

BACKTEST_OUTCOMES: dict[str, dict[str, Any]] = {}


