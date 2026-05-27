import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MoverSide = "gainers" | "losers";

type FmpMover = {
  symbol?: string | null;
  ticker?: string | null;
  name?: string | null;
  companyName?: string | null;
  price?: number | string | null;
  changesPercentage?: number | string | null;
  changePercentage?: number | string | null;
  percentageChange?: number | string | null;
  change?: number | string | null;
  changes?: number | string | null;
  volume?: number | string | null;
  exchange?: string | null;
  exchangeShortName?: string | null;
};

type FmpIntradayCandle = {
  date?: string | null;
  datetime?: string | null;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  volume?: number | string | null;
};

type Candidate = {
  symbol: string;
  name: string;
  providerChangePct: number | null;
  providerPrice: number | null;
  providerVolume: number | null;
};

type SessionWindow = {
  thresholdKey: string;
  startHourKyiv: number;
  startLabelKyiv: string;
  startLabelMarket: string;
  marketDate: string;
};

function getFmpApiKey() {
  return (
    process.env.FMP_API_KEY ||
    process.env.FINANCIAL_MODELING_PREP_API_KEY ||
    process.env.NEXT_PUBLIC_FMP_API_KEY ||
    ""
  ).trim();
}

function getFmpStableBaseUrl() {
  return (
    process.env.FMP_STABLE_BASE_URL ||
    "https://financialmodelingprep.com/stable"
  ).replace(/\/+$/g, "");
}

function getFmpLegacyBaseUrl() {
  return (
    process.env.FMP_LEGACY_BASE_URL ||
    "https://financialmodelingprep.com/api/v3"
  ).replace(/\/+$/g, "");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const hasParentheses = value.includes("(") && value.includes(")");
    const cleaned = value
      .replace("%", "")
      .replace(/[()+]/g, "")
      .replace(/,/g, "")
      .trim();

    const parsed = Number(cleaned);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return hasParentheses && parsed > 0 ? -parsed : parsed;
  }

  return null;
}

function normalizeSymbol(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.\-]/g, "");
}

function isProbablyUsCommonStock(symbol: string, name: string) {
  if (!symbol) return false;
  if (!/^[A-Z][A-Z.\-]{0,7}$/.test(symbol)) return false;

  const upperName = name.toUpperCase();

  const blockedNameParts = [
    " ETF",
    " ETN",
    " TRUST",
    " FUND",
    " 2X ",
    " 3X ",
    " 2X",
    " 3X",
    "DAILY BULL",
    "DAILY BEAR",
    "DIREXION",
    "PROSHARES",
    "GRANITESHARES",
    "LEVERAGE SHARES",
    "ULTRASHORT",
    "ULTRAPRO",
    "WARRANT",
    "RIGHTS",
    "UNIT",
  ];

  if (blockedNameParts.some((part) => upperName.includes(part))) {
    return false;
  }

  const blockedSymbolPatterns = [
    /W$/,
    /WS$/,
    /WT$/,
    /U$/,
    /UN$/,
    /R$/,
  ];

  if (symbol.length >= 5 && blockedSymbolPatterns.some((pattern) => pattern.test(symbol))) {
    return false;
  }

  return true;
}

function formatCompactNumber(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "—";
  }

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
    second: Number(map.get("second")),
  };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const parts = getZonedParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return (localAsUtc - date.getTime()) / 60000;
}

function zonedTimeToUtc(
  timeZone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  }
) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );

  const guessedDate = new Date(utcGuess);
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, guessedDate);

  return new Date(utcGuess - offsetMinutes * 60_000);
}

function getSessionWindowFromKyivStart(): SessionWindow {
  const startHourKyiv = Math.max(
    0,
    Math.min(23, Number(process.env.CHART_STOCK_MOVERS_START_HOUR_KYIV || 13))
  );

  const now = new Date();
  const kyivToday = getZonedParts(now, "Europe/Kyiv");

  const startUtc = zonedTimeToUtc("Europe/Kyiv", {
    year: kyivToday.year,
    month: kyivToday.month,
    day: kyivToday.day,
    hour: startHourKyiv,
    minute: 0,
    second: 0,
  });

  const marketParts = getZonedParts(startUtc, "America/New_York");

  const marketDate = `${marketParts.year}-${pad2(marketParts.month)}-${pad2(
    marketParts.day
  )}`;

  const marketTime = `${pad2(marketParts.hour)}:${pad2(marketParts.minute)}`;

  return {
    thresholdKey: `${marketDate} ${marketTime}:00`,
    startHourKyiv,
    startLabelKyiv: `${pad2(startHourKyiv)}:00 Kyiv`,
    startLabelMarket: `${marketTime} New York`,
    marketDate,
  };
}

function normalizeFmpDate(value: unknown) {
  const text = String(value || "").trim();

  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/);

  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  return text.replace("T", " ").slice(0, 19);
}

async function fetchFmpArray(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return Array.isArray(data) ? data : [];
}

async function fetchCandidateEndpoint(path: string, apiKey: string) {
  const url = new URL(`${getFmpStableBaseUrl()}/${path}`);
  url.searchParams.set("apikey", apiKey);

  return fetchFmpArray(url) as Promise<FmpMover[]>;
}

async function fetchCandidateMovers(side: MoverSide, apiKey: string) {
  const primaryPath = side === "losers" ? "biggest-losers" : "biggest-gainers";

  const [primary, active] = await Promise.all([
    fetchCandidateEndpoint(primaryPath, apiKey),
    fetchCandidateEndpoint("most-actives", apiKey),
  ]);

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const item of [...primary, ...active]) {
    const symbol = normalizeSymbol(item.symbol || item.ticker);
    const name = item.companyName || item.name || symbol;

    if (!isProbablyUsCommonStock(symbol, name)) continue;
    if (seen.has(symbol)) continue;

    seen.add(symbol);

    candidates.push({
      symbol,
      name,
      providerChangePct:
        parseNumber(item.changesPercentage) ??
        parseNumber(item.changePercentage) ??
        parseNumber(item.percentageChange) ??
        parseNumber(item.change) ??
        parseNumber(item.changes),
      providerPrice: parseNumber(item.price),
      providerVolume: parseNumber(item.volume),
    });
  }

  return candidates;
}

async function fetchIntradayCandles(symbol: string, apiKey: string) {
  const stableUrl = new URL(`${getFmpStableBaseUrl()}/historical-chart/1min`);
  stableUrl.searchParams.set("symbol", symbol);
  stableUrl.searchParams.set("apikey", apiKey);

  const stableData = await fetchFmpArray(stableUrl);

  if (stableData.length > 0) {
    return stableData as FmpIntradayCandle[];
  }

  const legacyUrl = new URL(
    `${getFmpLegacyBaseUrl()}/historical-chart/1min/${encodeURIComponent(symbol)}`
  );
  legacyUrl.searchParams.set("apikey", apiKey);

  const legacyData = await fetchFmpArray(legacyUrl);

  return legacyData as FmpIntradayCandle[];
}

function buildSessionMover(
  candidate: Candidate,
  candles: FmpIntradayCandle[],
  side: MoverSide,
  session: SessionWindow,
  minChangePct: number,
  minVolume: number
) {
  const normalizedCandles = candles
    .map((item) => {
      const dateKey = normalizeFmpDate(item.date || item.datetime);
      const open = parseNumber(item.open);
      const close = parseNumber(item.close);
      const volume = parseNumber(item.volume);

      return {
        dateKey,
        open,
        close,
        volume: volume ?? 0,
      };
    })
    .filter((item) => {
      if (!item.dateKey || item.dateKey.length < 19) return false;
      if (item.dateKey < session.thresholdKey) return false;
      if (item.open === null && item.close === null) return false;

      return true;
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (normalizedCandles.length === 0) {
    return null;
  }

  const first = normalizedCandles[0];
  const last = normalizedCandles[normalizedCandles.length - 1];

  const startPrice =
    typeof first.open === "number" && first.open > 0
      ? first.open
      : typeof first.close === "number" && first.close > 0
        ? first.close
        : null;

  const lastPrice =
    typeof last.close === "number" && last.close > 0
      ? last.close
      : typeof last.open === "number" && last.open > 0
        ? last.open
        : null;

  if (!startPrice || !lastPrice) {
    return null;
  }

  const sessionVolumeFromCandles = normalizedCandles.reduce((sum, item) => {
    return sum + (Number.isFinite(item.volume) && item.volume > 0 ? item.volume : 0);
  }, 0);

  const sessionVolume =
    sessionVolumeFromCandles > 0
      ? sessionVolumeFromCandles
      : candidate.providerVolume ?? 0;

  const changePct = ((lastPrice - startPrice) / startPrice) * 100;

  if (side === "gainers" && changePct < minChangePct) return null;
  if (side === "losers" && changePct > -minChangePct) return null;
  if (sessionVolume < minVolume) return null;

  return {
    symbol: candidate.symbol,
    name: candidate.name,
    price: Number(lastPrice.toFixed(4)),
    changePct: formatPercent(changePct),
    volume: formatCompactNumber(sessionVolume),
    sessionVolume,
    sessionStartKyiv: session.startLabelKyiv,
    sessionStartMarket: session.startLabelMarket,
    source: "intraday_1min_since_kyiv_start",
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R | null>
) {
  const results = new Array<R | null>(items.length).fill(null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      } catch {
        results[currentIndex] = null;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => worker()
  );

  await Promise.all(workers);

  return results.filter((item): item is R => item !== null);
}

export async function GET(request: Request) {
  try {
    const apiKey = getFmpApiKey();

    if (!apiKey) {
      throw new Error("Stock movers are not configured on the current market data stack.");
    }

    const { searchParams } = new URL(request.url);

    const side: MoverSide =
      searchParams.get("side") === "losers" ? "losers" : "gainers";

    const rawLimit = Number(searchParams.get("limit") || 25);
    const limit = Math.max(5, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 25));

    const candidateLimit = Math.max(
      limit,
      Math.min(
        80,
        Number(process.env.CHART_STOCK_MOVERS_CANDIDATE_LIMIT || 50)
      )
    );

    const concurrency = Math.max(
      1,
      Math.min(8, Number(process.env.CHART_STOCK_MOVERS_CONCURRENCY || 5))
    );

    const minChangePct = Math.max(
      0,
      Number(process.env.CHART_STOCK_MOVERS_MIN_CHANGE_PCT || 10)
    );

    const minVolume = Math.max(
      0,
      Number(process.env.CHART_STOCK_MOVERS_MIN_VOLUME || 100000)
    );

    const session = getSessionWindowFromKyivStart();

    const candidates = (await fetchCandidateMovers(side, apiKey)).slice(
      0,
      candidateLimit
    );

    const scanned = await mapWithConcurrency(
      candidates,
      concurrency,
      async (candidate) => {
        const candles = await fetchIntradayCandles(candidate.symbol, apiKey);

        return buildSessionMover(
          candidate,
          candles,
          side,
          session,
          minChangePct,
          minVolume
        );
      }
    );

    const items = scanned
      .sort((a, b) =>
        side === "gainers"
          ? b.changePct - a.changePct || b.sessionVolume - a.sessionVolume
          : a.changePct - b.changePct || b.sessionVolume - a.sessionVolume
      )
      .slice(0, limit)
      .map(({ sessionVolume, ...item }) => item);

    return NextResponse.json(
      {
        ok: true,
        market: "stocks",
        side,
        items,
        meta: {
          mode: "kyiv_13_intraday_session",
          candidateCount: candidates.length,
          matchedCount: scanned.length,
          returnedCount: items.length,
          minChangePct,
          minVolume,
          sessionStartKyiv: session.startLabelKyiv,
          sessionStartMarket: session.startLabelMarket,
          thresholdKey: session.thresholdKey,
          marketDate: session.marketDate,
          updatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error:
          error instanceof Error
            ? error.message
            : "Stock movers are unavailable on the current market data stack.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}