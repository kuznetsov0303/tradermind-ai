from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

KYIV_TZ = ZoneInfo("Europe/Kyiv")
NY_TZ = ZoneInfo("America/New_York")

# Full US equity market holidays that matter for this beta window.
# Keep this table intentionally explicit and boring: no API dependency, no hidden drift.
FULL_MARKET_HOLIDAYS: dict[str, str] = {
    # 2026
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Martin Luther King Jr. Day",
    "2026-02-16": "Presidents' Day",
    "2026-04-03": "Good Friday",
    "2026-05-25": "Memorial Day",
    "2026-06-19": "Juneteenth",
    "2026-07-03": "Independence Day observed",
    "2026-09-07": "Labor Day",
    "2026-11-26": "Thanksgiving Day",
    "2026-12-25": "Christmas Day",
    # 2027
    "2027-01-01": "New Year's Day",
    "2027-01-18": "Martin Luther King Jr. Day",
    "2027-02-15": "Presidents' Day",
    "2027-03-26": "Good Friday",
    "2027-05-31": "Memorial Day",
    "2027-06-18": "Juneteenth observed",
    "2027-07-05": "Independence Day observed",
    "2027-09-06": "Labor Day",
    "2027-11-25": "Thanksgiving Day",
    "2027-12-24": "Christmas Day observed",
    # 2028
    "2028-01-17": "Martin Luther King Jr. Day",
    "2028-02-21": "Presidents' Day",
    "2028-04-14": "Good Friday",
    "2028-05-29": "Memorial Day",
    "2028-06-19": "Juneteenth",
    "2028-07-04": "Independence Day",
    "2028-09-04": "Labor Day",
    "2028-11-23": "Thanksgiving Day",
    "2028-12-25": "Christmas Day",
}

# Early closes use America/New_York time. 13:00 means regular US equity early close.
EARLY_CLOSES_NY: dict[str, str] = {
    "2026-11-27": "Day after Thanksgiving early close",
    "2026-12-24": "Christmas Eve early close",
    "2027-11-26": "Day after Thanksgiving early close",
    "2028-07-03": "Independence Day early close",
    "2028-11-24": "Day after Thanksgiving early close",
}


@dataclass(frozen=True)
class MarketSession:
    dateNy: str
    nowNy: str
    nowKyiv: str
    marketState: str
    reason: str
    holidayName: str | None
    isWeekday: bool
    isFullHoliday: bool
    isEarlyClose: bool
    regularOpenNy: str
    regularCloseNy: str
    liveEngineAllowed: bool
    liveDiscoveryAllowed: bool
    telegramSignalsAllowed: bool


def _minutes(value: datetime) -> int:
    return value.hour * 60 + value.minute


def market_session(at: datetime | None = None) -> MarketSession:
    now_k = at.astimezone(KYIV_TZ) if at else datetime.now(KYIV_TZ)
    now_ny = now_k.astimezone(NY_TZ)
    day = now_ny.date()
    key = day.isoformat()

    is_weekday = day.weekday() < 5
    holiday_name = FULL_MARKET_HOLIDAYS.get(key)
    is_holiday = bool(holiday_name)
    is_early_close = key in EARLY_CLOSES_NY

    open_min = 9 * 60 + 30
    close_min = (13 * 60) if is_early_close else (16 * 60)
    current_min = _minutes(now_ny)

    if not is_weekday:
        state = "MARKET_CLOSED_WEEKEND"
        reason = "weekend"
        allowed = False
    elif is_holiday:
        state = "MARKET_CLOSED_HOLIDAY"
        reason = f"market_holiday:{holiday_name}"
        allowed = False
    elif current_min >= close_min:
        state = "MARKET_CLOSED_AFTER_CLOSE"
        reason = "after_regular_or_early_close"
        allowed = False
    elif current_min < open_min:
        state = "PREMARKET"
        reason = "premarket_live_discovery_allowed"
        allowed = True
    else:
        state = "REGULAR_SESSION"
        reason = "regular_session_live_discovery_allowed"
        allowed = True

    close_label = "13:00" if is_early_close else "16:00"

    return MarketSession(
        dateNy=key,
        nowNy=now_ny.isoformat(),
        nowKyiv=now_k.isoformat(),
        marketState=state,
        reason=reason,
        holidayName=holiday_name,
        isWeekday=is_weekday,
        isFullHoliday=is_holiday,
        isEarlyClose=is_early_close,
        regularOpenNy="09:30",
        regularCloseNy=close_label,
        liveEngineAllowed=allowed,
        liveDiscoveryAllowed=allowed,
        telegramSignalsAllowed=allowed,
    )


def market_session_snapshot(at: datetime | None = None) -> dict[str, object]:
    session = market_session(at)
    return {
        "dateNy": session.dateNy,
        "nowNy": session.nowNy,
        "nowKyiv": session.nowKyiv,
        "marketState": session.marketState,
        "reason": session.reason,
        "holidayName": session.holidayName,
        "isWeekday": session.isWeekday,
        "isFullHoliday": session.isFullHoliday,
        "isEarlyClose": session.isEarlyClose,
        "regularOpenNy": session.regularOpenNy,
        "regularCloseNy": session.regularCloseNy,
        "liveEngineAllowed": session.liveEngineAllowed,
        "liveDiscoveryAllowed": session.liveDiscoveryAllowed,
        "telegramSignalsAllowed": session.telegramSignalsAllowed,
    }
