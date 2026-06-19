export type MarketSessionState =
  | "MARKET_CLOSED_WEEKEND"
  | "MARKET_CLOSED_HOLIDAY"
  | "MARKET_CLOSED_AFTER_CLOSE"
  | "PREMARKET"
  | "REGULAR_SESSION";

const FULL_MARKET_HOLIDAYS: Record<string, string> = {
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

  "2028-01-17": "Martin Luther King Jr. Day",
  "2028-02-21": "Presidents' Day",
  "2028-04-14": "Good Friday",
  "2028-05-29": "Memorial Day",
  "2028-06-19": "Juneteenth",
  "2028-07-04": "Independence Day",
  "2028-09-04": "Labor Day",
  "2028-11-23": "Thanksgiving Day",
  "2028-12-25": "Christmas Day",
};

const EARLY_CLOSES_NY: Record<string, string> = {
  "2026-11-27": "Day after Thanksgiving early close",
  "2026-12-24": "Christmas Eve early close",
  "2027-11-26": "Day after Thanksgiving early close",
  "2028-07-03": "Independence Day early close",
  "2028-11-24": "Day after Thanksgiving early close",
};

function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);
  const weekday = get("weekday");

  return {
    dateNy: `${year}-${month}-${day}`,
    timeNy: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
    weekday,
    weekdayIndex: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday),
  };
}

export function getUsEquityMarketSession(date = new Date()) {
  const ny = nyParts(date);
  const holidayName = FULL_MARKET_HOLIDAYS[ny.dateNy] || null;
  const earlyCloseName = EARLY_CLOSES_NY[ny.dateNy] || null;
  const isWeekday = ny.weekdayIndex >= 1 && ny.weekdayIndex <= 5;
  const isFullHoliday = Boolean(holidayName);
  const isEarlyClose = Boolean(earlyCloseName);

  const openMin = 9 * 60 + 30;
  const closeMin = isEarlyClose ? 13 * 60 : 16 * 60;
  const currentMin = ny.hour * 60 + ny.minute;

  let marketState: MarketSessionState;
  let reason: string;
  let liveEngineAllowed: boolean;

  if (!isWeekday) {
    marketState = "MARKET_CLOSED_WEEKEND";
    reason = "weekend";
    liveEngineAllowed = false;
  } else if (isFullHoliday) {
    marketState = "MARKET_CLOSED_HOLIDAY";
    reason = `market_holiday:${holidayName}`;
    liveEngineAllowed = false;
  } else if (currentMin >= closeMin) {
    marketState = "MARKET_CLOSED_AFTER_CLOSE";
    reason = "after_regular_or_early_close";
    liveEngineAllowed = false;
  } else if (currentMin < openMin) {
    marketState = "PREMARKET";
    reason = "premarket_live_discovery_allowed";
    liveEngineAllowed = true;
  } else {
    marketState = "REGULAR_SESSION";
    reason = "regular_session_live_discovery_allowed";
    liveEngineAllowed = true;
  }

  return {
    version: "s8_4a_market_holiday_guard_v1",
    exchange: "US_EQUITIES",
    timezone: "America/New_York",
    dateNy: ny.dateNy,
    timeNy: ny.timeNy,
    marketState,
    reason,
    holidayName,
    earlyCloseName,
    isWeekday,
    isFullHoliday,
    isEarlyClose,
    regularOpenNy: "09:30",
    regularCloseNy: isEarlyClose ? "13:00" : "16:00",
    liveEngineAllowed,
    liveDiscoveryAllowed: liveEngineAllowed,
    telegramSignalsAllowed: liveEngineAllowed,
  };
}
