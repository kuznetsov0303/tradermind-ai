import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSkillEdgeAlertFromCandidate } from "@/lib/trading/skill-edge-alert-engine";
import { buildSkillEdgeStructureTradePlan } from "@/lib/trading/market-structure";
import type { SkillEdgeCandle } from "@/lib/trading/market-structure";
import { fetchSkillEdgeCandles } from "@/lib/trading/market-candles-provider";
import { analyzeSkillEdgePriceActionPatterns } from "@/lib/trading/price-action-patterns";
import type { SkillEdgePriceActionPatternAnalysis } from "@/lib/trading/price-action-patterns";
import { validateSkillEdgeSignalCandidate } from "@/lib/trading/signal-ai-validator";

type FetchSkillEdgeCandlesParams = Parameters<typeof fetchSkillEdgeCandles>[0];
type SkillEdgeCandleInterval = FetchSkillEdgeCandlesParams["interval"];
type SkillEdgeCandlesResult = Awaited<ReturnType<typeof fetchSkillEdgeCandles>>;


type MarketScannerRow = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  asset_type?: string | null;
  scan_bucket?: string | null;
  direction_bias?: string | null;
  price?: number | null;
  change_percent?: number | null;
  volume?: number | null;
  mentions?: number | null;
  mention_velocity?: number | null;
  catalyst?: string | null;
  risk_label?: string | null;
  opportunity_score?: number | null;
  raw_data?: Record<string, unknown> | null;
  source?: string | null;
  scanned_at?: string | null;
};

type SocialMentionRow = {
  symbol: string;
  source?: string | null;
  mentions_24h?: number | null;
  mentions_1h?: number | null;
  mention_velocity?: number | null;
  sentiment?: string | null;
  social_score?: number | null;
  scanned_at?: string | null;
};

type AlertType =
  | "pump"
  | "dump"
  | "social_spike"
  | "crypto_momentum"
  | "news_catalyst";

type MarketAlertDraft = {
  alert_key: string;
  user_id: string | null;
  plan_id: string;
  alert_scope: "global" | "personal";
  symbol: string;
  name: string | null;
  exchange: string | null;
  asset_type: "stock" | "crypto";
  alert_type: AlertType;
  direction: "upside" | "downside" | "neutral";
  score: number;
  title: string;
  reason: string;
  risk_note: string;
  scenario: string;
  setup_type: string;
  created_at: string;
  setup_timeframe: string;
confirmation_timeframe: string;
confidence_tier: string;
why_signal_fired: string;
confirmation_checklist: string[];
avoid_if: string[];
lesson_summary: string;
playbook_status: string;
trigger_label: string;
entry_zone_min: number | null;
entry_zone_max: number | null;
stop_price: number | null;
target_1: number | null;
target_2: number | null;
target_3: number | null;
invalidation: string;
management_plan: string;
confidence_score: number;
timeframe: string;
is_new: boolean;
outcome_status: "pending";
  status: "active" | "armed" | "watch";
  source_data: Record<string, unknown>;
  expires_at: string;
  setup_slug: string;
setup_name: string;
setup_description: string;
setup_confirmation: string;
setup_common_mistake: string;
};


function toScannerIntegerScore(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d.-]/g, ""))
        : fallback;

  if (!Number.isFinite(parsed)) {
    return Math.round(fallback);
  }

  return Math.round(Math.max(0, Math.min(100, parsed)));
}
function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_SIGNAL_MIN_STOCK_TRADED_VOLUME = 500_000;
const DEFAULT_SIGNAL_MIN_CRYPTO_TRADED_VOLUME_USD = 1_000_000;
const DEFAULT_SIGNAL_MIN_TRADED_VOLUME = DEFAULT_SIGNAL_MIN_STOCK_TRADED_VOLUME;

type SignalVolumeGate = {
  passed: boolean;
  tradedVolume: number | null;
  minVolume: number;
  unit: "shares" | "usd";
  label: string;
};

function parseFiniteSignalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value
      .replace(/[()%,$\s]/g, "")
      .replace(/^\+/, "")
      .trim();

    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function firstFiniteSignalNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseFiniteSignalNumber(value);

    if (parsed !== null) return parsed;
  }

  return null;
}

function readRawDataNumber(row: MarketScannerRow, keys: string[]) {
  const rawData = row.raw_data;

  if (!rawData || typeof rawData !== "object") return null;

  const raw = rawData as Record<string, unknown>;

  for (const key of keys) {
    const parsed = parseFiniteSignalNumber(raw[key]);

    if (parsed !== null) return parsed;
  }

  return null;
}

function formatSignalVolume(value: number | null) {
  if (value === null) return "unknown";

  return Math.round(value).toLocaleString("en-US");
}

function getSignalMinimumVolume(assetType: "stock" | "crypto") {
  const envValue =
    assetType === "crypto"
      ? process.env.SIGNAL_MIN_CRYPTO_TRADED_VOLUME_USD
      : process.env.SIGNAL_MIN_STOCK_TRADED_VOLUME;

  const assetSpecificValue = parseFiniteSignalNumber(envValue);
  const sharedFallback = parseFiniteSignalNumber(process.env.SIGNAL_MIN_TRADED_VOLUME);

  if (assetSpecificValue !== null) return assetSpecificValue;

  if (assetType === "crypto") {
    return sharedFallback ?? DEFAULT_SIGNAL_MIN_CRYPTO_TRADED_VOLUME_USD;
  }

  return sharedFallback ?? DEFAULT_SIGNAL_MIN_STOCK_TRADED_VOLUME;
}

function getSignalTradedVolume(row: MarketScannerRow, assetType: "stock" | "crypto") {
  const price = firstFiniteSignalNumber(
    row.price,
    readRawDataNumber(row, ["price", "lastPrice", "last_price", "currentPrice", "current_price"])
  );

  const baseVolume = firstFiniteSignalNumber(
    row.volume,
    readRawDataNumber(row, [
      "volume",
      "traded_volume",
      "tradedVolume",
      "current_volume",
      "currentVolume",
      "dayVolume",
      "totalVolume",
      "volume_24h",
      "volume24h",
      "baseVolume",
      "base_volume",
    ])
  );

  const usdVolume = firstFiniteSignalNumber(
    readRawDataNumber(row, [
      "quoteVolume",
      "quote_volume",
      "quoteVolumeUsd",
      "quote_volume_usd",
      "volumeUsd",
      "volume_usd",
      "volume_24h_usd",
      "volume24hUsd",
      "totalVolumeUsd",
      "total_volume_usd",
      "turnover",
      "turnoverUsd",
      "turnover_usd",
      "liquidity",
      "liquidityUsd",
      "liquidity_usd",
    ])
  );

  if (assetType === "crypto") {
    return usdVolume ?? (baseVolume !== null && price !== null ? baseVolume * price : baseVolume);
  }

  return baseVolume;
}

function buildSignalVolumeGate(row: MarketScannerRow, assetType: "stock" | "crypto"): SignalVolumeGate {
  const minVolume = getSignalMinimumVolume(assetType);
  const tradedVolume = getSignalTradedVolume(row, assetType);
  const passed = tradedVolume !== null && tradedVolume >= minVolume;
  const unit = assetType === "crypto" ? "usd" : "shares";

  return {
    passed,
    tradedVolume,
    minVolume,
    unit,
    label:
      assetType === "crypto"
        ? `volume ${formatSignalVolume(tradedVolume)} USD >= ${formatSignalVolume(minVolume)} USD`
        : `volume ${formatSignalVolume(tradedVolume)} shares >= ${formatSignalVolume(minVolume)} shares`,
  };
}

type FmpSignalMover = {
  symbol?: string | null;
  ticker?: string | null;
  name?: string | null;
  companyName?: string | null;
  price?: number | string | null;
  lastPrice?: number | string | null;
  changesPercentage?: number | string | null;
  changePercentage?: number | string | null;
  changePercent?: number | string | null;
  priceChangePercentage?: number | string | null;
  change?: number | string | null;
  changes?: number | string | null;
  volume?: number | string | null;
  volAvg?: number | string | null;
  avgVolume?: number | string | null;
  averageVolume?: number | string | null;
  sharesVolume?: number | string | null;
  dayVolume?: number | string | null;
  exchange?: string | null;
  exchangeShortName?: string | null;
};

type StockSeedResult = {
  enabled: boolean;
  loaded: number;
  inserted: number;
  error: string | null;
};

function getFmpSignalApiKey() {
  return (
    process.env.FMP_API_KEY ||
    process.env.NEXT_PUBLIC_FMP_API_KEY ||
    ""
  ).trim();
}

function getFmpSignalBaseUrl() {
  return (process.env.FMP_STABLE_BASE_URL || "https://financialmodelingprep.com/stable")
    .replace(/\/+$/g, "");
}

function isStockSignalSeedEnabled() {
  const value = String(process.env.FMP_ENABLED ?? process.env.SIGNAL_STOCK_SEED_ENABLED ?? "true")
    .trim()
    .toLowerCase();

  return !["false", "0", "off", "no"].includes(value);
}

function getStockSeedMinChangePct() {
  return parseFiniteSignalNumber(process.env.SIGNAL_STOCK_SEED_MIN_CHANGE_PCT) ?? 5;
}

function getStockSeedLimitPerEndpoint() {
  return Math.max(
    10,
    Math.min(150, parseFiniteSignalNumber(process.env.SIGNAL_STOCK_SEED_LIMIT_PER_ENDPOINT) ?? 100)
  );
}

function isProbablyTradeableUsStock(symbol: string) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) return false;
  if (!/^[A-Z]{1,5}$/.test(normalized)) return false;

  const blockedSuffixes = ["W", "WS", "WT", "U", "UN", "R"];
  if (normalized.length >= 5 && blockedSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    return false;
  }

  return true;
}

function normalizeFmpSignalListPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of ["data", "items", "results", "quotes", "stocks"]) {
      const value = record[key];

      if (Array.isArray(value)) return value;
    }
  }

  return [];
}

function getLegacyFmpSignalPath(path: string) {
  const normalized = path.trim().toLowerCase();

  if (normalized === "biggest-gainers") return "stock_market/gainers";
  if (normalized === "biggest-losers") return "stock_market/losers";
  if (normalized === "most-actives") return "stock_market/actives";

  return null;
}

async function fetchFmpSignalJson<T>(path: string): Promise<T> {
  const apiKey = getFmpSignalApiKey();

  if (!apiKey) {
    throw new Error("FMP_API_KEY is missing.");
  }

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`FMP ${path} failed: ${response.status} ${text.slice(0, 200)}`);
    }

    return response.json();
  };

  const baseUrl = getFmpSignalBaseUrl();
  const separator = path.includes("?") ? "&" : "?";
  const stableUrl = `${baseUrl}/${path}${separator}apikey=${encodeURIComponent(apiKey)}`;

  const stablePayload = await fetchJson(stableUrl);
  const stableList = normalizeFmpSignalListPayload(stablePayload);

  if (stableList.length > 0) {
    return stableList as T;
  }

  const legacyPath = getLegacyFmpSignalPath(path);

  if (legacyPath) {
    const legacyUrl = `https://financialmodelingprep.com/api/v3/${legacyPath}?apikey=${encodeURIComponent(
      apiKey
    )}`;

    const legacyPayload = await fetchJson(legacyUrl);
    const legacyList = normalizeFmpSignalListPayload(legacyPayload);

    if (legacyList.length > 0) {
      return legacyList as T;
    }
  }

  return stableList as T;
}

function chunkSignalArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function fetchFmpSignalQuoteMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, readEnvNumber("SIGNAL_STOCK_QUOTE_ENRICH_MAX_SYMBOLS", 500));
  const quoteBySymbol = new Map<string, FmpSignalMover>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return quoteBySymbol;
  }

  const fetchList = async (url: string): Promise<FmpSignalMover[]> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return [];

      const payload = await response.json();

      return normalizeFmpSignalListPayload(payload) as FmpSignalMover[];
    } catch {
      return [];
    }
  };

  for (const chunk of chunkSignalArray(uniqueSymbols, 50)) {
    const joined = chunk.join(",");

    const stableBatchUrl = `${getFmpSignalBaseUrl()}/batch-quote?symbols=${encodeURIComponent(joined)}&apikey=${encodeURIComponent(apiKey)}`;
    let rows = await fetchList(stableBatchUrl);

    if (rows.length === 0) {
      const stableQuoteUrl = `${getFmpSignalBaseUrl()}/quote?symbol=${encodeURIComponent(joined)}&apikey=${encodeURIComponent(apiKey)}`;
      rows = await fetchList(stableQuoteUrl);
    }

    if (rows.length === 0) {
      rows = await fetchList(
        `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${encodeURIComponent(apiKey)}`
      );
    }

    for (const row of rows) {
      const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));

      if (symbol) {
        quoteBySymbol.set(symbol, row);
      }
    }
  }

  return quoteBySymbol;
}

type FmpAftermarketPayload = {
  quote: Record<string, unknown> | null;
  trade: Record<string, unknown> | null;
  priceFreshness: Record<string, unknown>;
};

const NEW_YORK_SESSION_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getNewYorkSessionParts(date = new Date()) {
  const parts = Object.fromEntries(
    NEW_YORK_SESSION_FORMATTER.formatToParts(date).map((part) => [part.type, part.value])
  );

  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: hour * 60 + minute,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
  };
}

function getCurrentNewYorkStockSessionKind(date = new Date()) {
  const parts = getNewYorkSessionParts(date);
  const minute = parts.minuteOfDay;

  if (minute >= 4 * 60 && minute < 9 * 60 + 30) return "premarket";
  if (minute >= 9 * 60 + 30 && minute < 16 * 60) return "regular";
  if (minute >= 16 * 60 && minute < 20 * 60) return "aftermarket";

  return "closed";
}

function parseFmpAftermarketTimestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function readFmpAftermarketTimestampMs(record: Record<string, unknown> | null) {
  if (!record) return null;

  return (
    parseFmpAftermarketTimestampMs(record.timestamp) ??
    parseFmpAftermarketTimestampMs(record.time) ??
    parseFmpAftermarketTimestampMs(record.date) ??
    parseFmpAftermarketTimestampMs(record.datetime) ??
    parseFmpAftermarketTimestampMs(record.updatedAt) ??
    parseFmpAftermarketTimestampMs(record.lastUpdated) ??
    null
  );
}

function readFmpAftermarketPrice(record: Record<string, unknown> | null) {
  if (!record) return null;

  const bid = firstFiniteSignalNumber(record.bid, record.bidPrice, record.bid_price);
  const ask = firstFiniteSignalNumber(record.ask, record.askPrice, record.ask_price);
  const midpoint =
    bid !== null && ask !== null && ask >= bid ? (bid + ask) / 2 : null;

  return firstFiniteSignalNumber(
    record.price,
    record.lastPrice,
    record.last,
    record.lastSalePrice,
    record.lastTradePrice,
    record.tradePrice,
    record.close,
    midpoint
  );
}

function buildFmpAftermarketFreshness(params: {
  symbol: string;
  quote: Record<string, unknown> | null;
  trade: Record<string, unknown> | null;
}) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const sessionKind = getCurrentNewYorkStockSessionKind();
  const ny = getNewYorkSessionParts();

  const quoteTimestampMs = readFmpAftermarketTimestampMs(params.quote);
  const tradeTimestampMs = readFmpAftermarketTimestampMs(params.trade);
  const quotePrice = readFmpAftermarketPrice(params.quote);
  const tradePrice = readFmpAftermarketPrice(params.trade);

  const tradeIsNewer =
    tradeTimestampMs !== null &&
    (quoteTimestampMs === null || tradeTimestampMs >= quoteTimestampMs);

  const selectedTimestampMs = tradeIsNewer ? tradeTimestampMs : quoteTimestampMs;
  const selectedPrice = tradeIsNewer
    ? firstFiniteSignalNumber(tradePrice, quotePrice)
    : firstFiniteSignalNumber(quotePrice, tradePrice);

  const bid = params.quote
    ? firstFiniteSignalNumber(params.quote.bid, params.quote.bidPrice, params.quote.bid_price)
    : null;
  const ask = params.quote
    ? firstFiniteSignalNumber(params.quote.ask, params.quote.askPrice, params.quote.ask_price)
    : null;

  const spread =
    bid !== null && ask !== null && ask >= bid ? ask - bid : null;
  const spreadPct =
    spread !== null && selectedPrice !== null && selectedPrice > 0
      ? (spread / selectedPrice) * 100
      : null;

  const ageSeconds =
    selectedTimestampMs === null
      ? null
      : Math.max(0, Math.round((nowMs - selectedTimestampMs) / 1000));

  const maxAgeSeconds = readEnvNumber("SIGNAL_STOCK_EXTENDED_MAX_QUOTE_AGE_SECONDS", 180);
  const maxSpreadPct = readEnvNumber("SIGNAL_STOCK_EXTENDED_MAX_SPREAD_PCT", 2.5);
  const isMarketSession =
    sessionKind === "premarket" ||
    sessionKind === "regular" ||
    sessionKind === "aftermarket";

  const hasAftermarketData = Boolean(params.quote || params.trade);
  const hasUsablePrice = selectedPrice !== null && selectedPrice > 0;
  const hasFreshTimestamp =
    ageSeconds !== null && ageSeconds <= maxAgeSeconds;
  const spreadOk =
    spreadPct === null || spreadPct <= maxSpreadPct;

  const safeForPremiumDelivery =
    isMarketSession &&
    hasAftermarketData &&
    hasUsablePrice &&
    hasFreshTimestamp &&
    spreadOk;

  const status = safeForPremiumDelivery
    ? "fresh"
    : !hasAftermarketData
      ? "missing"
      : !hasUsablePrice
        ? "missing_price"
        : !hasFreshTimestamp
          ? "stale"
          : !spreadOk
            ? "wide_spread"
            : sessionKind === "closed"
              ? "closed"
              : "not_safe";

  const provider =
    tradeIsNewer && params.trade
      ? "fmp_aftermarket_trade"
      : params.quote
        ? "fmp_aftermarket_quote"
        : "none";

  return {
    version: "3B-4K-B",
    status,
    provider,
    symbol: params.symbol,
    sessionKind,
    nyDate: ny.date,
    nyTime: ny.time,
    checkedAt: nowIso,
    currentPrice: selectedPrice !== null ? roundSignalMetric(selectedPrice) : null,
    timestamp:
      selectedTimestampMs !== null
        ? new Date(selectedTimestampMs).toISOString()
        : null,
    ageSeconds,
    maxAgeSeconds,
    bid: roundSignalMetric(bid),
    ask: roundSignalMetric(ask),
    spread: roundSignalMetric(spread),
    spreadPct: roundSignalMetric(spreadPct, 3),
    safeForPremiumDelivery,
    reason: safeForPremiumDelivery
      ? `Fresh FMP price confirmed for ${sessionKind} session.`
      : `Not safe for stock premium delivery: status=${status}, session=${sessionKind}, age=${ageSeconds ?? "null"}, spreadPct=${spreadPct ?? "null"}.`,
  };
}

async function fetchFmpSignalAftermarketMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, readEnvNumber("SIGNAL_STOCK_QUOTE_ENRICH_MAX_SYMBOLS", 500));
  const map = new Map<string, FmpAftermarketPayload>();

  if (!apiKey || uniqueSymbols.length === 0) return map;

  const fetchList = async (path: string, queryKey: "symbols" | "symbol", symbolsValue: string) => {
    const url = `${getFmpSignalBaseUrl()}/${path}?${queryKey}=${encodeURIComponent(symbolsValue)}&apikey=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return [];

      const payload = await response.json();

      return normalizeFmpSignalListPayload(payload).filter(isRecord);
    } catch {
      return [];
    }
  };

  const quoteBySymbol = new Map<string, Record<string, unknown>>();
  const tradeBySymbol = new Map<string, Record<string, unknown>>();

  for (const chunk of chunkSignalArray(uniqueSymbols, 50)) {
    const joined = chunk.join(",");

    let quoteRows = await fetchList("batch-aftermarket-quote", "symbols", joined);

    if (quoteRows.length === 0) {
      const singleResults = await Promise.all(
        chunk.map((symbol) => fetchList("aftermarket-quote", "symbol", symbol))
      );

      quoteRows = singleResults.flat();
    }

    let tradeRows = await fetchList("batch-aftermarket-trade", "symbols", joined);

    if (tradeRows.length === 0) {
      const singleResults = await Promise.all(
        chunk.map((symbol) => fetchList("aftermarket-trade", "symbol", symbol))
      );

      tradeRows = singleResults.flat();
    }

    for (const row of quoteRows) {
      const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));
      if (symbol) quoteBySymbol.set(symbol, row);
    }

    for (const row of tradeRows) {
      const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));
      if (symbol) tradeBySymbol.set(symbol, row);
    }
  }

  for (const symbol of uniqueSymbols) {
    const quote = quoteBySymbol.get(symbol) || null;
    const trade = tradeBySymbol.get(symbol) || null;

    map.set(symbol, {
      quote,
      trade,
      priceFreshness: buildFmpAftermarketFreshness({
        symbol,
        quote,
        trade,
      }),
    });
  }

  return map;
}

function enrichFmpSignalMoverWithAftermarket(
  item: FmpSignalMover,
  aftermarket: FmpAftermarketPayload | null
): FmpSignalMover {
  if (!aftermarket) return item;

  const currentPrice = firstFiniteSignalNumber(
    aftermarket.priceFreshness.currentPrice,
    item.price,
    item.lastPrice
  );

  return {
    ...item,
    price: currentPrice ?? item.price,
    lastPrice: currentPrice ?? item.lastPrice,
    bid: aftermarket.priceFreshness.bid,
    ask: aftermarket.priceFreshness.ask,
    timestamp: aftermarket.priceFreshness.timestamp,
    priceFreshness: aftermarket.priceFreshness,
    aftermarketQuote: aftermarket.quote,
    aftermarketTrade: aftermarket.trade,
  } as FmpSignalMover;
}

function mergeFmpSignalRecords(...records: Array<Record<string, unknown> | null | undefined>) {
  const merged: Record<string, unknown> = {};

  for (const record of records) {
    if (!record || typeof record !== "object") continue;

    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || value === "") continue;
      if (merged[key] === null || merged[key] === undefined || merged[key] === "") {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function getStockQuoteAverageVolume(record: Record<string, unknown> | null | undefined) {
  if (!record) return null;

  return firstFiniteSignalNumber(
    parseFiniteSignalNumber(record.avgVolume),
    parseFiniteSignalNumber(record.averageVolume),
    parseFiniteSignalNumber(record.volAvg),
    parseFiniteSignalNumber(record.volumeAvg),
    parseFiniteSignalNumber(record.avgVolume30d),
    parseFiniteSignalNumber(record.averageVolume30d),
    parseFiniteSignalNumber(record.averageDailyVolume10Day),
    parseFiniteSignalNumber(record.averageDailyVolume3Month),
    parseFiniteSignalNumber(record.avgVol),
    parseFiniteSignalNumber(record.avg_volume),
    parseFiniteSignalNumber(record.average_volume)
  );
}

async function fetchFmpSignalLegacyQuoteMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, readEnvNumber("SIGNAL_STOCK_QUOTE_ENRICH_MAX_SYMBOLS", 500));
  const quoteBySymbol = new Map<string, FmpSignalMover>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return quoteBySymbol;
  }

  const fetchList = async (url: string): Promise<FmpSignalMover[]> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return [];

      const payload = await response.json();

      return normalizeFmpSignalListPayload(payload) as FmpSignalMover[];
    } catch {
      return [];
    }
  };

  for (const chunk of chunkSignalArray(uniqueSymbols, 50)) {
    const joined = chunk.join(",");

    const rows = await fetchList(
      `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${encodeURIComponent(apiKey)}`
    );

    for (const row of rows) {
      const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));

      if (symbol) {
        quoteBySymbol.set(symbol, row);
      }
    }
  }

  return quoteBySymbol;
}

async function fetchFmpSignalProfileMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, 100);
  const profileBySymbol = new Map<string, Record<string, unknown>>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return profileBySymbol;
  }

  const fetchList = async (url: string): Promise<Record<string, unknown>[]> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return [];

      const payload = await response.json();
      return normalizeFmpSignalListPayload(payload).filter(isRecord);
    } catch {
      return [];
    }
  };

  for (const chunk of chunkSignalArray(uniqueSymbols, 25)) {
    const joined = chunk.join(",");

    let rows = await fetchList(
      `${getFmpSignalBaseUrl()}/profile?symbol=${encodeURIComponent(joined)}&apikey=${encodeURIComponent(apiKey)}`
    );

    if (rows.length === 0) {
      rows = await fetchList(
        `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(joined)}?apikey=${encodeURIComponent(apiKey)}`
      );
    }

    for (const row of rows) {
      const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));

      if (symbol) {
        profileBySymbol.set(symbol, row);
      }
    }
  }

  return profileBySymbol;
}
type StockDailyVolumeFallback = {
  averageVolume30d: number | null;
  previousDayVolume: number | null;
  candlesLoaded: number;
  provider: "fmp";
  source: "fmp_daily_candles";
  error: string | null;
};

type FmpDailyVolumeCandle = {
  date: string | null;
  volume: number;
  timestampMs: number;
};

function getFmpSignalDailyVolumeRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (!isRecord(payload)) return [];

  const candidates: unknown[] = [
    payload.historical,
    payload.data,
    payload.items,
    payload.results,
    payload.candles,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function parseFmpSignalDailyVolumeCandles(payload: unknown): FmpDailyVolumeCandle[] {
  const rows = getFmpSignalDailyVolumeRows(payload);
  const candles: FmpDailyVolumeCandle[] = [];

  for (const item of rows) {
    if (!isRecord(item)) continue;

    const volume = firstFiniteSignalNumber(
      item.volume,
      item.v,
      item.dayVolume,
      item.tradedVolume
    );

    const rawDate = item.date || item.datetime || item.timestamp || item.time;

    if (volume === null || volume <= 0 || !rawDate) continue;

    const dateText = String(rawDate);
    const timestampMs = new Date(dateText).getTime();

    candles.push({
      date: dateText.slice(0, 10),
      volume,
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : 0,
    });
  }

  return candles.sort((a, b) => b.timestampMs - a.timestampMs);
}

function calculateStockDailyVolumeFallback(candles: FmpDailyVolumeCandle[]): StockDailyVolumeFallback | null {
  const cleanCandles = candles.filter((candle) => candle.volume > 0);

  if (cleanCandles.length === 0) return null;

  const recent30 = cleanCandles.slice(0, 30);
  const averageVolume30d =
    recent30.length > 0
      ? recent30.reduce((sum, candle) => sum + candle.volume, 0) / recent30.length
      : null;

  return {
    averageVolume30d,
    previousDayVolume: cleanCandles[0]?.volume ?? null,
    candlesLoaded: cleanCandles.length,
    provider: "fmp",
    source: "fmp_daily_candles",
    error: null,
  };
}

async function fetchFmpSignalDailyVolumeFallbackMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, 120);
  const fallbackBySymbol = new Map<string, StockDailyVolumeFallback>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return fallbackBySymbol;
  }

  const maxConcurrency = Math.max(
    1,
    Math.min(10, readEnvNumber("SIGNAL_STOCK_DAILY_VOLUME_CONCURRENCY", 6))
  );

  const fetchDailyCandles = async (symbol: string): Promise<StockDailyVolumeFallback | null> => {
    const urls = [
      `${getFmpSignalBaseUrl()}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`,
      `${getFmpSignalBaseUrl()}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`,
      `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(symbol)}?timeseries=80&apikey=${encodeURIComponent(apiKey)}`,
    ];

    let lastError: string | null = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          lastError = `daily candles ${response.status}`;
          continue;
        }

        const payload = await response.json();
        const candles = parseFmpSignalDailyVolumeCandles(payload);
        const fallback = calculateStockDailyVolumeFallback(candles);

        if (fallback?.averageVolume30d !== null) {
          return fallback;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "daily candles fetch failed";
      }
    }

    if (lastError) {
      console.warn(`Stock daily volume fallback failed for ${symbol}: ${lastError}`);
    }

    return null;
  };

  for (let index = 0; index < uniqueSymbols.length; index += maxConcurrency) {
    const chunk = uniqueSymbols.slice(index, index + maxConcurrency);
    const results = await Promise.all(
      chunk.map(async (symbol) => ({
        symbol,
        fallback: await fetchDailyCandles(symbol),
      }))
    );

    for (const result of results) {
      if (result.fallback) {
        fallbackBySymbol.set(result.symbol, result.fallback);
      }
    }
  }

  return fallbackBySymbol;
}
type StockFundamentalSnapshotSource = Record<string, unknown>;
type StockNewsMapItem = Record<string, unknown>;

function readStockTextFromRecords(records: Array<Record<string, unknown> | null | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) continue;

    for (const key of keys) {
      const value = record[key];

      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }

  return null;
}

function readStockNumberFromRecords(records: Array<Record<string, unknown> | null | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) continue;

    for (const key of keys) {
      const parsed = parseFiniteSignalNumber(record[key]);

      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function normalizeStockNewsDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value.trim();
}

function getStockFundamentalNestedRecord(
  source: StockFundamentalSnapshotSource | null,
  key: string
): Record<string, unknown> | null {
  if (!source) return null;

  const value = source[key];

  return isRecord(value) ? value : null;
}

async function fetchFmpSignalFundamentalMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const maxRows = Math.max(1, Math.min(120, readEnvNumber("SIGNAL_STOCK_FUNDAMENTAL_MAX_ROWS", 80)));
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, maxRows);
  const fundamentalBySymbol = new Map<string, StockFundamentalSnapshotSource>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return fundamentalBySymbol;
  }

  const fetchFirstRecord = async (urls: string[]): Promise<Record<string, unknown> | null> => {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) continue;

        const payload = await response.json();
        const rows = normalizeFmpSignalListPayload(payload).filter(isRecord);

        if (rows.length > 0) return rows[0];
        if (isRecord(payload)) return payload;
      } catch {
        // Best-effort enrichment. Signals must continue without fundamentals.
      }
    }

    return null;
  };

  const fetchRecordList = async (urls: string[]): Promise<Record<string, unknown>[]> => {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) continue;

        const payload = await response.json();
        const rows = normalizeFmpSignalListPayload(payload).filter(isRecord);

        if (rows.length > 0) return rows;
      } catch {
        // Best-effort enrichment.
      }
    }

    return [];
  };

  const concurrency = Math.max(1, Math.min(5, readEnvNumber("SIGNAL_STOCK_FUNDAMENTAL_CONCURRENCY", 3)));

  for (let index = 0; index < uniqueSymbols.length; index += concurrency) {
    const chunk = uniqueSymbols.slice(index, index + concurrency);

    const results = await Promise.all(
      chunk.map(async (symbol) => {
        const encodedSymbol = encodeURIComponent(symbol);

        const [keyMetrics, ratios, incomeStatement, earnings] = await Promise.all([
          fetchFirstRecord([
            `${getFmpSignalBaseUrl()}/key-metrics-ttm?symbol=${encodedSymbol}&apikey=${encodeURIComponent(apiKey)}`,
            `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodedSymbol}?apikey=${encodeURIComponent(apiKey)}`,
          ]),
          fetchFirstRecord([
            `${getFmpSignalBaseUrl()}/ratios-ttm?symbol=${encodedSymbol}&apikey=${encodeURIComponent(apiKey)}`,
            `https://financialmodelingprep.com/api/v3/ratios-ttm/${encodedSymbol}?apikey=${encodeURIComponent(apiKey)}`,
          ]),
          fetchFirstRecord([
            `${getFmpSignalBaseUrl()}/income-statement?symbol=${encodedSymbol}&limit=1&apikey=${encodeURIComponent(apiKey)}`,
            `https://financialmodelingprep.com/api/v3/income-statement/${encodedSymbol}?limit=1&apikey=${encodeURIComponent(apiKey)}`,
          ]),
          fetchRecordList([
            `${getFmpSignalBaseUrl()}/earnings-surprises?symbol=${encodedSymbol}&limit=4&apikey=${encodeURIComponent(apiKey)}`,
            `https://financialmodelingprep.com/api/v3/earnings-surprises/${encodedSymbol}?limit=4&apikey=${encodeURIComponent(apiKey)}`,
          ]),
        ]);

        const hasData = Boolean(keyMetrics || ratios || incomeStatement || earnings.length > 0);

        return hasData
          ? {
              symbol,
              source: {
                provider: "fmp",
                updatedAt: new Date().toISOString(),
                keyMetrics,
                ratios,
                incomeStatement,
                earnings,
              } satisfies StockFundamentalSnapshotSource,
            }
          : null;
      })
    );

    for (const result of results) {
      if (result) fundamentalBySymbol.set(result.symbol, result.source);
    }
  }

  return fundamentalBySymbol;
}

function normalizeFmpSignalNewsRows(payload: unknown): StockNewsMapItem[] {
  return normalizeFmpSignalListPayload(payload).filter(isRecord);
}

function extractStockNewsSymbols(item: StockNewsMapItem) {
  const raw = [item.symbol, item.ticker, item.tickers, item.relatedTickers]
    .filter((value) => value !== null && value !== undefined)
    .join(",");

  return raw
    .split(/[,+\s|]+/g)
    .map((value) => normalizeSymbol(value))
    .filter(Boolean);
}

async function fetchFmpSignalStockNewsMap(symbols: string[]) {
  const apiKey = getFmpSignalApiKey();
  const maxRows = Math.max(1, Math.min(120, readEnvNumber("SIGNAL_STOCK_NEWS_MAX_SYMBOLS", 80)));
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, maxRows);
  const newsBySymbol = new Map<string, StockNewsMapItem[]>();

  if (!apiKey || uniqueSymbols.length === 0) {
    return newsBySymbol;
  }

  const perSymbolLimit = Math.max(1, Math.min(8, readEnvNumber("SIGNAL_STOCK_NEWS_PER_SYMBOL_LIMIT", 4)));

  for (const symbol of uniqueSymbols) {
    newsBySymbol.set(symbol, []);
  }

  const fetchNewsRows = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) continue;

        const payload = await response.json();
        const rows = normalizeFmpSignalNewsRows(payload);

        if (rows.length > 0) return rows;
      } catch {
        // Best-effort news enrichment.
      }
    }

    return [];
  };

  for (const chunk of chunkSignalArray(uniqueSymbols, 20)) {
    const joined = chunk.join(",");
    const encodedJoined = encodeURIComponent(joined);

    const rows = await fetchNewsRows([
      `${getFmpSignalBaseUrl()}/news/stock-latest?symbols=${encodedJoined}&limit=${chunk.length * perSymbolLimit}&apikey=${encodeURIComponent(apiKey)}`,
      `${getFmpSignalBaseUrl()}/stock-news?symbols=${encodedJoined}&limit=${chunk.length * perSymbolLimit}&apikey=${encodeURIComponent(apiKey)}`,
      `https://financialmodelingprep.com/api/v3/stock_news?tickers=${encodedJoined}&limit=${chunk.length * perSymbolLimit}&apikey=${encodeURIComponent(apiKey)}`,
    ]);

    for (const item of rows) {
      const itemSymbols = extractStockNewsSymbols(item);
      const matchedSymbols = itemSymbols.length > 0 ? itemSymbols.filter((symbol) => chunk.includes(symbol)) : chunk;

      for (const symbol of matchedSymbols) {
        const current = newsBySymbol.get(symbol) || [];

        if (current.length < perSymbolLimit) {
          current.push(item);
          newsBySymbol.set(symbol, current);
        }
      }
    }
  }

  return newsBySymbol;
}

function classifyStockNewsText(text: string) {
  const lower = text.toLowerCase();
  const catalystTags: string[] = [];
  const riskTags: string[] = [];

  if (/offering|registered direct|private placement|shelf|atm|s-3|dilution|warrant/.test(lower)) {
    catalystTags.push("capital_raise");
    riskTags.push("offering_dilution_risk");
  }

  if (/earnings|revenue|eps|guidance|quarter|results/.test(lower)) {
    catalystTags.push("earnings");
  }

  if (/fda|phase 1|phase 2|phase 3|trial|clinical|approval|biotech|drug/.test(lower)) {
    catalystTags.push("biotech_fda");
    riskTags.push("biotech_binary_risk");
  }

  if (/upgrade|downgrade|price target|analyst|initiates/.test(lower)) {
    catalystTags.push("analyst_action");
  }

  if (/merger|acquisition|buyout|takeover|definitive agreement/.test(lower)) {
    catalystTags.push("m_and_a");
  }

  if (/contract|partnership|collaboration|order|launch|commercial/.test(lower)) {
    catalystTags.push("commercial_pr");
  }

  if (/reverse split|delisting|nasdaq notice|compliance/.test(lower)) {
    riskTags.push("listing_or_reverse_split_risk");
  }

  return {
    catalystTags,
    riskTags,
  };
}

function buildStockNewsSnapshot(params: {
  symbol: string;
  newsItems: StockNewsMapItem[];
  updatedAt: string;
}) {
  const normalizedItems = params.newsItems.slice(0, 6).map((item) => {
    const title = readStockTextFromRecords([item], ["title", "headline", "newsTitle"]) || null;
    const text = readStockTextFromRecords([item], ["text", "summary", "content", "description"]) || null;
    const publishedAt = normalizeStockNewsDate(
      item.publishedDate || item.date || item.datetime || item.createdAt
    );
    const source = readStockTextFromRecords([item], ["site", "source", "publisher"]) || null;
    const url = readStockTextFromRecords([item], ["url", "link"]) || null;
    const classification = classifyStockNewsText(`${title || ""} ${text || ""}`);

    return {
      title,
      publishedAt,
      source,
      url,
      catalystTags: classification.catalystTags,
      riskTags: classification.riskTags,
    };
  });

  const catalystTags = Array.from(new Set(normalizedItems.flatMap((item) => item.catalystTags)));
  const riskTags = Array.from(new Set(normalizedItems.flatMap((item) => item.riskTags)));
  const latest = normalizedItems[0] || null;
  const catalystQualityScore = clamp(
    20 +
      Math.min(40, catalystTags.length * 14) +
      Math.min(20, normalizedItems.length * 4) -
      (riskTags.includes("offering_dilution_risk") ? 18 : 0)
  );

  return {
    version: "3B-3",
    provider: "fmp",
    updatedAt: params.updatedAt,
    hasNews: normalizedItems.length > 0,
    itemCount: normalizedItems.length,
    latestTitle: latest?.title ?? null,
    latestPublishedAt: latest?.publishedAt ?? null,
    catalystTags,
    riskTags,
    catalystQualityScore: Math.round(catalystQualityScore),
    items: normalizedItems,
  };
}

function buildStockFundamentalSnapshot(params: {
  row: MarketScannerRow;
  quoteRecord: Record<string, unknown> | null;
  profileRecord: Record<string, unknown> | null;
  fundamentalSource: StockFundamentalSnapshotSource | null;
  newsSnapshot: Record<string, unknown>;
  updatedAt: string;
}) {
  const keyMetrics = getStockFundamentalNestedRecord(params.fundamentalSource, "keyMetrics");
  const ratios = getStockFundamentalNestedRecord(params.fundamentalSource, "ratios");
  const incomeStatement = getStockFundamentalNestedRecord(params.fundamentalSource, "incomeStatement");
  const earningsRows = Array.isArray(params.fundamentalSource?.earnings)
    ? (params.fundamentalSource?.earnings as unknown[]).filter(isRecord)
    : [];

  const records = [params.profileRecord, params.quoteRecord, keyMetrics, ratios, incomeStatement];
  const price = firstFiniteSignalNumber(params.row.price, readStockNumberFromRecords(records, ["price", "lastPrice"]));
  const marketCap = readStockNumberFromRecords(records, ["marketCap", "mktCap", "marketCapitalization"]);
  const floatShares = readStockNumberFromRecords(records, ["floatShares", "freeFloat", "float", "publicFloat"]);
  const sharesOutstanding = readStockNumberFromRecords(records, [
    "sharesOutstanding",
    "weightedAverageShsOut",
    "weightedAverageShsOutDil",
    "commonStockSharesOutstanding",
  ]);
  const shortFloatPct = readStockNumberFromRecords(records, ["shortFloat", "shortFloatPct", "shortPercentOfFloat"]);
  const beta = readStockNumberFromRecords(records, ["beta"]);
  const sector = readStockTextFromRecords(records, ["sector"]);
  const industry = readStockTextFromRecords(records, ["industry"]);
  const exchange = readStockTextFromRecords(records, ["exchange", "exchangeShortName"]);
  const earningsDate =
    readStockTextFromRecords(records, ["earningsAnnouncement", "nextEarningsDate", "date"]) ||
    readStockTextFromRecords(earningsRows, ["date"]);
  const revenue = readStockNumberFromRecords(records, ["revenue", "reportedRevenue"]);
  const netIncome = readStockNumberFromRecords(records, ["netIncome"]);
  const riskTags: string[] = [];

  if (price !== null && price < 1) riskTags.push("sub_1_dollar_stock");
  if (marketCap !== null && marketCap < 50_000_000) riskTags.push("nano_cap_risk");
  else if (marketCap !== null && marketCap < 300_000_000) riskTags.push("micro_cap_risk");
  else if (marketCap !== null && marketCap < 2_000_000_000) riskTags.push("small_cap_risk");
  if (floatShares !== null && floatShares <= 10_000_000) riskTags.push("very_low_float");
  else if (floatShares !== null && floatShares <= 30_000_000) riskTags.push("low_float");

  if (typeof sector === "string" && /healthcare|biotech|pharmaceutical/i.test(`${sector} ${industry || ""}`)) {
    riskTags.push("biotech_binary_risk");
  }

  if (Array.isArray(params.newsSnapshot.riskTags)) {
    riskTags.push(...params.newsSnapshot.riskTags.map(String));
  }

  const hasData = Boolean(
    sector ||
      industry ||
      marketCap !== null ||
      floatShares !== null ||
      sharesOutstanding !== null ||
      earningsDate ||
      params.fundamentalSource
  );

  const dataQualityScore = Math.round(
    clamp(
      15 +
        (params.profileRecord ? 25 : 0) +
        (keyMetrics ? 20 : 0) +
        (ratios ? 10 : 0) +
        (incomeStatement ? 10 : 0) +
        (earningsRows.length > 0 ? 10 : 0)
    )
  );

  return {
    version: "3B-3",
    provider: "fmp",
    updatedAt: params.updatedAt,
    hasData,
    dataQualityScore,
    sector,
    industry,
    exchange,
    marketCap: roundSignalMetric(marketCap, 0),
    floatShares: roundSignalMetric(floatShares, 0),
    sharesOutstanding: roundSignalMetric(sharesOutstanding, 0),
    shortFloatPct: roundSignalMetric(shortFloatPct, 3),
    beta: roundSignalMetric(beta, 3),
    revenue: roundSignalMetric(revenue, 0),
    netIncome: roundSignalMetric(netIncome, 0),
    earningsDate,
    riskTags: Array.from(new Set(riskTags)),
    sourceCoverage: {
      profile: Boolean(params.profileRecord),
      quote: Boolean(params.quoteRecord),
      keyMetrics: Boolean(keyMetrics),
      ratios: Boolean(ratios),
      incomeStatement: Boolean(incomeStatement),
      earnings: earningsRows.length > 0,
    },
  };
}
function enrichFmpSignalMoverWithQuote(item: FmpSignalMover, quote: FmpSignalMover | null): FmpSignalMover {
  if (!quote) return item;

  return {
    ...quote,
    ...item,
    price: firstFiniteSignalNumber(item.price, item.lastPrice, quote.price, quote.lastPrice),
    volume: firstFiniteSignalNumber(
      item.volume,
      item.volAvg,
      item.avgVolume,
      item.averageVolume,
      item.sharesVolume,
      item.dayVolume,
      quote.volume,
      quote.volAvg,
      quote.avgVolume,
      quote.averageVolume,
      quote.sharesVolume,
      quote.dayVolume
    ),
  };
}
function parseFmpChangePct(item: FmpSignalMover) {
  return firstFiniteSignalNumber(
    item.changesPercentage,
    item.changePercentage,
    item.changePercent,
    item.priceChangePercentage,
    item.change,
    item.changes
  ) ?? 0;
}

function buildStockSeedRow(
  item: FmpSignalMover,
  bucket: "pump_watch" | "dump_watch" | "unusual_volume" | "unified_inplay"
): MarketScannerRow | null {
  const symbol = normalizeSymbol(String(item.symbol || item.ticker || ""));

  if (!isProbablyTradeableUsStock(symbol)) return null;

  const price = firstFiniteSignalNumber(item.price, item.lastPrice);
  const volume = firstFiniteSignalNumber(
    item.volume,
    item.volAvg,
    item.avgVolume,
    item.averageVolume,
    item.sharesVolume
  );
  const changePercent = parseFmpChangePct(item);
  const minVolume = getSignalMinimumVolume("stock");
  const minChangePct =
    bucket === "unified_inplay"
      ? readEnvNumber("SIGNAL_STOCK_UNIFIED_INPLAY_MIN_ABS_CHANGE_PCT", 0.7)
      : getStockSeedMinChangePct();
  const stockMinPrice = readEnvNumber("SIGNAL_STOCK_MIN_PRICE", 0.4);
  const stockMaxPrice = readEnvNumber("SIGNAL_STOCK_MAX_PRICE", 2000);

  if (price === null || price < stockMinPrice || price > stockMaxPrice) return null;
  if (volume === null || volume < minVolume) return null;

  if (bucket === "unified_inplay" && Math.abs(changePercent) < minChangePct) {
    return null;
  }

  if (bucket === "unusual_volume" && Math.abs(changePercent) < readEnvNumber("SIGNAL_STOCK_UNUSUAL_VOLUME_MIN_ABS_CHANGE_PCT", 2)) {
    return null;
  }

  if (bucket !== "unusual_volume" && bucket !== "unified_inplay" && Math.abs(changePercent) < minChangePct) {
    return null;
  }

  const direction = changePercent >= 0 ? "upside" : "downside";

  const volumeScore = Math.min(20, Math.log10(Math.max(volume, 1) / minVolume) * 8);
  const changeScore = Math.min(35, Math.abs(changePercent) * 2.5);
  const bucketBoost =
    bucket === "pump_watch" || bucket === "dump_watch"
      ? 12
      : bucket === "unified_inplay"
        ? 10
        : 6;

  const opportunityScore = clamp(45 + volumeScore + changeScore + bucketBoost, 0, 100);

  const exchange =
    item.exchangeShortName ||
    item.exchange ||
    "US";

  return {
    symbol,
    exchange,
    name: item.name || item.companyName || symbol,
    asset_type: "stock",
    scan_bucket: bucket,
    direction_bias: direction,
    price,
    change_percent: Number(changePercent.toFixed(2)),
    volume,
    mentions: 0,
    mention_velocity: 0,
    catalyst: null,
    risk_label:
      bucket === "pump_watch"
        ? "Premarket/active stock pump candidate"
        : bucket === "dump_watch"
          ? "Active stock fade candidate"
          : bucket === "unified_inplay"
            ? "Unified stock in-play candidate"
            : "Unusual volume stock candidate",
    opportunity_score: toScannerIntegerScore(opportunityScore),
    source: "fmp_signal_seed",
    scanned_at: new Date().toISOString(),
    raw_data: {
      provider: "fmp",
      signalSeed: true,
      bucket,
      minVolume,
      minChangePct,
      priceFreshness: isRecord((item as Record<string, unknown>).priceFreshness)
        ? (item as Record<string, unknown>).priceFreshness
        : null,
      aftermarketQuote: isRecord((item as Record<string, unknown>).aftermarketQuote)
        ? (item as Record<string, unknown>).aftermarketQuote
        : null,
      aftermarketTrade: isRecord((item as Record<string, unknown>).aftermarketTrade)
        ? (item as Record<string, unknown>).aftermarketTrade
        : null,
      source_breakdown: {
        market: "fmp",
        news: null,
        social: [],
      },
      raw: item,
    },
  };
}

function getStockUnifiedInPlayExchanges() {
  const raw = readEnvString(
    "SIGNAL_STOCK_UNIFIED_INPLAY_EXCHANGES",
    "NASDAQ,NYSE,AMEX"
  );

  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function getStockUnifiedInPlayLimitPerExchange() {
  return Math.max(
    50,
    Math.min(
      1000,
      readEnvNumber("SIGNAL_STOCK_UNIFIED_INPLAY_LIMIT_PER_EXCHANGE", 500)
    )
  );
}

function getStockUnifiedInPlayMaxRows() {
  return Math.max(
    100,
    Math.min(1500, readEnvNumber("SIGNAL_STOCK_UNIFIED_INPLAY_MAX_ROWS", 900))
  );
}

function getStockUnifiedInPlayMinVolume() {
  return Math.max(
    1,
    readEnvNumber("SIGNAL_STOCK_UNIFIED_INPLAY_MIN_VOLUME", getSignalMinimumVolume("stock"))
  );
}

function normalizeFmpUnifiedScreenerItem(item: Record<string, unknown>): FmpSignalMover | null {
  const symbol = normalizeSymbol(String(item.symbol || item.ticker || ""));

  if (!isProbablyTradeableUsStock(symbol)) return null;

  const price = firstFiniteSignalNumber(
    item.price,
    item.lastPrice,
    item.last,
    item.close
  );
  const volume = firstFiniteSignalNumber(
    item.volume,
    item.sharesVolume,
    item.dayVolume,
    item.regularMarketVolume
  );
  const changesPercentage = firstFiniteSignalNumber(
    item.changesPercentage,
    item.changePercentage,
    item.changePercent,
    item.priceChangePercentage
  );

  if (price === null || volume === null) return null;

  return {
    ...item,
    symbol,
    ticker: symbol,
    name:
      typeof item.companyName === "string"
        ? item.companyName
        : typeof item.name === "string"
          ? item.name
          : symbol,
    companyName:
      typeof item.companyName === "string"
        ? item.companyName
        : typeof item.name === "string"
          ? item.name
          : symbol,
    price,
    lastPrice: price,
    volume,
    sharesVolume: volume,
    changesPercentage: changesPercentage ?? 0,
    changePercentage: changesPercentage ?? 0,
    exchangeShortName:
      typeof item.exchangeShortName === "string"
        ? item.exchangeShortName
        : typeof item.exchange === "string"
          ? item.exchange
          : "US",
  } as FmpSignalMover;
}

async function fetchFmpSignalUnifiedInPlayRows() {
  const enabled = String(process.env.SIGNAL_STOCK_UNIFIED_INPLAY_ENABLED ?? "true")
    .trim()
    .toLowerCase();

  if (["false", "0", "off", "no"].includes(enabled)) {
    return [] as FmpSignalMover[];
  }

  const apiKey = getFmpSignalApiKey();

  if (!apiKey) return [] as FmpSignalMover[];

  const exchanges = getStockUnifiedInPlayExchanges();
  const minVolume = getStockUnifiedInPlayMinVolume();
  const minPrice = readEnvNumber("SIGNAL_STOCK_MIN_PRICE", 0.4);
  const maxPrice = readEnvNumber("SIGNAL_STOCK_MAX_PRICE", 2000);
  const limitPerExchange = getStockUnifiedInPlayLimitPerExchange();
  const maxRows = getStockUnifiedInPlayMaxRows();

  const fetchList = async (url: string) => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) return [] as Record<string, unknown>[];

      const payload = await response.json();

      return normalizeFmpSignalListPayload(payload).filter(isRecord);
    } catch {
      return [] as Record<string, unknown>[];
    }
  };

  const rows: FmpSignalMover[] = [];

  for (const exchange of exchanges) {
    const stableParams = new URLSearchParams({
      exchange,
      volumeMoreThan: String(Math.round(minVolume)),
      priceMoreThan: String(minPrice),
      priceLowerThan: String(maxPrice),
      isActivelyTrading: "true",
      limit: String(limitPerExchange),
      apikey: apiKey,
    });

    let exchangeRows = await fetchList(
      `${getFmpSignalBaseUrl()}/company-screener?${stableParams.toString()}`
    );

    if (exchangeRows.length === 0) {
      const legacyParams = new URLSearchParams({
        exchange,
        volumeMoreThan: String(Math.round(minVolume)),
        priceMoreThan: String(minPrice),
        priceLowerThan: String(maxPrice),
        isActivelyTrading: "true",
        limit: String(limitPerExchange),
        apikey: apiKey,
      });

      exchangeRows = await fetchList(
        `https://financialmodelingprep.com/api/v3/stock-screener?${legacyParams.toString()}`
      );
    }

    for (const item of exchangeRows) {
      const normalized = normalizeFmpUnifiedScreenerItem(item);

      if (normalized) rows.push(normalized);
    }
  }

  const bestBySymbol = new Map<string, FmpSignalMover>();

  for (const row of rows) {
    const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""));
    if (!symbol) continue;

    const current = bestBySymbol.get(symbol);
    const rowVolume = firstFiniteSignalNumber(row.volume, row.sharesVolume) ?? 0;
    const currentVolume = current
      ? firstFiniteSignalNumber(current.volume, current.sharesVolume) ?? 0
      : 0;

    if (!current || rowVolume > currentVolume) {
      bestBySymbol.set(symbol, row);
    }
  }

  return Array.from(bestBySymbol.values())
    .sort((a, b) => {
      const aVolume = firstFiniteSignalNumber(a.volume, a.sharesVolume) ?? 0;
      const bVolume = firstFiniteSignalNumber(b.volume, b.sharesVolume) ?? 0;
      const aChange = Math.abs(parseFmpChangePct(a));
      const bChange = Math.abs(parseFmpChangePct(b));

      return bChange * 100 + Math.log10(Math.max(bVolume, 1)) * 10 -
        (aChange * 100 + Math.log10(Math.max(aVolume, 1)) * 10);
    })
    .slice(0, maxRows);
}


function normalizeMarketScannerSeedRowsForInsert(rows: MarketScannerRow[]): MarketScannerRow[] {
  return rows.map((row) => ({
    ...row,
    opportunity_score: toScannerIntegerScore(row.opportunity_score),
  }));
}
async function refreshStockScannerSnapshotsForSignals(): Promise<StockSeedResult> {
  if (!isStockSignalSeedEnabled()) {
    return {
      enabled: false,
      loaded: 0,
      inserted: 0,
      error: "Stock signal seed is disabled.",
    };
  }

  const limit = getStockSeedLimitPerEndpoint();

  try {
    const [gainers, losers, active, unifiedInPlay] = await Promise.all([
      fetchFmpSignalJson<FmpSignalMover[]>("biggest-gainers"),
      fetchFmpSignalJson<FmpSignalMover[]>("biggest-losers"),
      fetchFmpSignalJson<FmpSignalMover[]>("most-actives"),
      fetchFmpSignalUnifiedInPlayRows(),
    ]);

    const sourceRows = [
      ...(Array.isArray(gainers) ? gainers.slice(0, limit) : []),
      ...(Array.isArray(losers) ? losers.slice(0, limit) : []),
      ...(Array.isArray(active) ? active.slice(0, limit) : []),
      ...(Array.isArray(unifiedInPlay) ? unifiedInPlay : []),
    ];

    const seedSymbols = sourceRows.map((item) => String(item.symbol || item.ticker || ""));
    const quoteBySymbol = await fetchFmpSignalQuoteMap(seedSymbols);
    const aftermarketBySymbol = await fetchFmpSignalAftermarketMap(seedSymbols);

    const enrich = (item: FmpSignalMover) => {
      const symbol = normalizeSymbol(String(item.symbol || item.ticker || ""));
      const withQuote = enrichFmpSignalMoverWithQuote(item, quoteBySymbol.get(symbol) || null);

      return enrichFmpSignalMoverWithAftermarket(
        withQuote,
        aftermarketBySymbol.get(symbol) || null
      );
    };

    const rows = [
      ...(Array.isArray(gainers)
        ? gainers.slice(0, limit).map((item) => buildStockSeedRow(enrich(item), "pump_watch"))
        : []),
      ...(Array.isArray(losers)
        ? losers.slice(0, limit).map((item) => buildStockSeedRow(enrich(item), "dump_watch"))
        : []),
      ...(Array.isArray(active)
        ? active.slice(0, limit).map((item) => buildStockSeedRow(enrich(item), "unusual_volume"))
        : []),
      ...(Array.isArray(unifiedInPlay)
        ? unifiedInPlay.map((item) => buildStockSeedRow(enrich(item), "unified_inplay"))
        : []),
    ].filter((row): row is MarketScannerRow => Boolean(row));

    const bestBySymbol = new Map<string, MarketScannerRow>();

    for (const row of rows) {
      const current = bestBySymbol.get(row.symbol);
      const currentScore = current?.opportunity_score ?? 0;
      const nextScore = row.opportunity_score ?? 0;

      if (!current || nextScore > currentScore) {
        bestBySymbol.set(row.symbol, row);
      }
    }

    const finalRows = Array.from(bestBySymbol.values())
      .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
      .slice(0, Number(process.env.SIGNAL_STOCK_SEED_MAX_ROWS || "250"));

    if (finalRows.length === 0) {
      return {
        enabled: true,
        loaded: rows.length,
        inserted: 0,
        error: null,
      };
    }

    const { error } = await supabaseAdmin
      .from("market_scanner_snapshots")
      .insert(normalizeMarketScannerSeedRowsForInsert(finalRows));

    if (error) {
      return {
        enabled: true,
        loaded: rows.length,
        inserted: 0,
        error: error.message,
      };
    }

    return {
      enabled: true,
      loaded: rows.length,
      inserted: finalRows.length,
      error: null,
    };
  } catch (error) {
    return {
      enabled: true,
      loaded: 0,
      inserted: 0,
      error: error instanceof Error ? error.message : "Stock signal seed failed.",
    };
  }
}


type CryptoSeedResult = {
  enabled: boolean;
  loaded: number;
  inserted: number;
  error: string | null;
};

type CryptoSeedCandidate = {
  symbol: string;
  name: string;
  exchange: "BINANCE" | "HYPERLIQUID";
  source: "binance_ticker_24hr" | "hyperliquid_perp";
  price: number;
  changePercent: number;
  volumeUsd: number;
  raw: Record<string, unknown>;
};

function isCryptoSignalSeedEnabled() {
  const value = String(process.env.SIGNAL_CRYPTO_SEED_ENABLED ?? "true")
    .trim()
    .toLowerCase();

  return !["false", "0", "off", "no"].includes(value);
}

function getCryptoSeedMinChangePct() {
  return parseFiniteSignalNumber(process.env.SIGNAL_CRYPTO_SEED_MIN_CHANGE_PCT) ?? 2;
}

function getCryptoSeedMinVolumeUsd() {
  return parseFiniteSignalNumber(process.env.SIGNAL_CRYPTO_SEED_MIN_VOLUME_USD) ??
    getSignalMinimumVolume("crypto");
}

function getCryptoSeedLimitPerVenue() {
  return Math.max(
    20,
    Math.min(250, parseFiniteSignalNumber(process.env.SIGNAL_CRYPTO_SEED_LIMIT_PER_VENUE) ?? 150)
  );
}

function isAllowedSeedCryptoSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) return false;

  const blocked = new Set([
    "USDT",
    "USDC",
    "FDUSD",
    "TUSD",
    "DAI",
    "BUSD",
    "EUR",
    "TRY",
    "USD",
  ]);

  if (blocked.has(normalized)) return false;

  return /^[A-Z0-9]{2,15}$/.test(normalized);
}

function buildCryptoSeedRow(candidate: CryptoSeedCandidate): MarketScannerRow | null {
  const symbol = normalizeSymbol(candidate.symbol);
  const price = candidate.price;
  const changePercent = candidate.changePercent;
  const volumeUsd = candidate.volumeUsd;
  const minVolumeUsd = getCryptoSeedMinVolumeUsd();
  const minChangePct = getCryptoSeedMinChangePct();

  if (!isAllowedSeedCryptoSymbol(symbol)) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(volumeUsd) || volumeUsd < minVolumeUsd) return null;

  const highVolumeFallback = volumeUsd >= minVolumeUsd * 5 && Math.abs(changePercent) >= 0.75;

  if (Math.abs(changePercent) < minChangePct && !highVolumeFallback) {
    return null;
  }

  const direction = changePercent >= 0 ? "upside" : "downside";
  const volumeScore = Math.min(24, Math.log10(Math.max(volumeUsd, 1) / minVolumeUsd) * 9);
  const changeScore = Math.min(34, Math.abs(changePercent) * 2.2);
  const opportunityScore = clamp(46 + volumeScore + changeScore, 0, 100);

  return {
    symbol,
    exchange: candidate.exchange,
    name: candidate.name || `${symbol} Perp`,
    asset_type: "crypto",
    scan_bucket: direction === "upside" ? "crypto_upside_in_play" : "crypto_downside_in_play",
    direction_bias: direction,
    price,
    change_percent: Number(changePercent.toFixed(2)),
    volume: volumeUsd,
    mentions: 0,
    mention_velocity: 0,
    catalyst: null,
    risk_label:
      direction === "upside"
        ? "Crypto in-play upside candidate from market activity"
        : "Crypto in-play downside candidate from market activity",
    opportunity_score: toScannerIntegerScore(opportunityScore),
    source: candidate.source,
    scanned_at: new Date().toISOString(),
    raw_data: {
      provider: candidate.exchange === "BINANCE" ? "binance" : "hyperliquid",
      venue: candidate.exchange === "BINANCE" ? "binance" : "hyperliquid",
      exchange: candidate.exchange,
      signalSeed: true,
      quoteVolume: volumeUsd,
      quoteVolumeUsd: volumeUsd,
      volumeUsd,
      changePercent,
      minVolumeUsd,
      minChangePct,
      source_breakdown: {
        market: candidate.exchange === "BINANCE" ? "binance" : "hyperliquid",
        news: null,
        social: [],
      },
      raw: candidate.raw,
    },
  };
}

async function fetchBinanceCryptoSeedCandidates(limit: number): Promise<CryptoSeedCandidate[]> {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) return [];

  const payload = await response.json();

  if (!Array.isArray(payload)) return [];

  return payload
    .flatMap((item: Record<string, unknown>) => {
      const rawSymbol = String(item.symbol || "");
      if (!rawSymbol.endsWith("USDT")) return [];

      if (
        rawSymbol.includes("UPUSDT") ||
        rawSymbol.includes("DOWNUSDT") ||
        rawSymbol.includes("BULLUSDT") ||
        rawSymbol.includes("BEARUSDT")
      ) {
        return [];
      }

      const symbol = normalizeSymbol(rawSymbol.replace(/USDT$/g, ""));
      const price = firstFiniteSignalNumber(item.lastPrice);
      const changePercent = firstFiniteSignalNumber(item.priceChangePercent) ?? 0;
      const volumeUsd = firstFiniteSignalNumber(item.quoteVolume);

      if (price === null || volumeUsd === null) return [];

      return [{
        symbol,
        name: `${symbol}/USDT`,
        exchange: "BINANCE" as const,
        source: "binance_ticker_24hr" as const,
        price,
        changePercent,
        volumeUsd,
        raw: item,
      }];
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, limit);
}

async function fetchHyperliquidCryptoSeedCandidates(limit: number): Promise<CryptoSeedCandidate[]> {
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });

  if (!response.ok) return [];

  const payload = await response.json();

  if (!Array.isArray(payload) || payload.length < 2) return [];

  const meta = payload[0] as { universe?: Array<{ name?: string | null }> };
  const contexts = payload[1] as Array<Record<string, unknown>>;
  const universe = Array.isArray(meta.universe) ? meta.universe : [];

  return universe
    .flatMap((coin, index) => {
      const symbol = normalizeSymbol(coin?.name || "");
      const ctx = contexts[index] || {};
      const price = firstFiniteSignalNumber(ctx.markPx, ctx.midPx, ctx.oraclePx);
      const prevDay = firstFiniteSignalNumber(ctx.prevDayPx);
      const volumeUsd = firstFiniteSignalNumber(ctx.dayNtlVlm, ctx.dayBaseVlm);

      if (!symbol || price === null || volumeUsd === null) return [];

      const changePercent =
        prevDay !== null && prevDay > 0
          ? ((price - prevDay) / prevDay) * 100
          : 0;

      return [{
        symbol,
        name: `${symbol} Perp`,
        exchange: "HYPERLIQUID" as const,
        source: "hyperliquid_perp" as const,
        price,
        changePercent,
        volumeUsd,
        raw: ctx,
      }];
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, limit);
}

async function refreshCryptoScannerSnapshotsForSignals(): Promise<CryptoSeedResult> {
  if (!isCryptoSignalSeedEnabled()) {
    return {
      enabled: false,
      loaded: 0,
      inserted: 0,
      error: "Crypto signal seed is disabled.",
    };
  }

  const limit = getCryptoSeedLimitPerVenue();

  try {
    const [binance, hyperliquid] = await Promise.all([
      fetchBinanceCryptoSeedCandidates(limit),
      fetchHyperliquidCryptoSeedCandidates(limit),
    ]);

    const rows = [...binance, ...hyperliquid]
      .map(buildCryptoSeedRow)
      .filter((row): row is MarketScannerRow => Boolean(row));

    const bestBySymbol = new Map<string, MarketScannerRow>();

    for (const row of rows) {
      const current = bestBySymbol.get(row.symbol);
      const currentScore = current?.opportunity_score ?? 0;
      const nextScore = row.opportunity_score ?? 0;

      if (!current || nextScore > currentScore) {
        bestBySymbol.set(row.symbol, row);
      }
    }

    const finalRows = Array.from(bestBySymbol.values())
      .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
      .slice(0, Number(process.env.SIGNAL_CRYPTO_SEED_MAX_ROWS || "120"));

    if (finalRows.length === 0) {
      return {
        enabled: true,
        loaded: rows.length,
        inserted: 0,
        error: null,
      };
    }

    const { error } = await supabaseAdmin
      .from("market_scanner_snapshots")
      .insert(normalizeMarketScannerSeedRowsForInsert(finalRows));

    if (error) {
      return {
        enabled: true,
        loaded: rows.length,
        inserted: 0,
        error: error.message,
      };
    }

    return {
      enabled: true,
      loaded: rows.length,
      inserted: finalRows.length,
      error: null,
    };
  } catch (error) {
    return {
      enabled: true,
      loaded: 0,
      inserted: 0,
      error: error instanceof Error ? error.message : "Crypto signal seed failed.",
    };
  }
}

type CryptoSignalVenue = "binance" | "hyperliquid" | "blocked" | "unknown";

function normalizeSignalText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isBlockedDexOrChainText(value: unknown) {
  const text = normalizeSignalText(value);

  return (
    text.includes("dex") ||
    text.includes("dexscreener") ||
    text.includes("uniswap") ||
    text.includes("pancake") ||
    text.includes("raydium") ||
    text.includes("pump") ||
    text.includes("pairaddress") ||
    text.includes("pair address") ||
    text.includes("bnb chain") ||
    text.includes("binance smart chain") ||
    text === "bsc" ||
    text.includes("bsc/")
  );
}

function isExactBinanceVenue(value: unknown) {
  const text = normalizeSignalText(value);

  return (
    text === "binance" ||
    text === "binance_spot" ||
    text === "binance spot" ||
    text === "binance_futures" ||
    text === "binance futures" ||
    text === "binance_usdm" ||
    text === "binance usdm" ||
    text === "binance_usdt_perp" ||
    text === "binance usdt perp"
  );
}

function isExactHyperliquidVenue(value: unknown) {
  const text = normalizeSignalText(value);

  return (
    text === "hyperliquid" ||
    text === "hyper liquid" ||
    text === "hyperliquid_perp" ||
    text === "hyperliquid perp" ||
    text === "hyperliquid-perp" ||
    text === "hl-perp" ||
    text === "hl perp"
  );
}

function getCryptoSignalVenue(row: MarketScannerRow): CryptoSignalVenue {
  const rawData =
    row.raw_data && typeof row.raw_data === "object"
      ? (row.raw_data as Record<string, unknown>)
      : {};

  const rowRecord = row as MarketScannerRow & Record<string, unknown>;

  const hardBlockFields = [
    row.exchange,
    row.source,
    rowRecord.provider,
    rowRecord.market,
    rowRecord.venue,
    rawData.exchange,
    rawData.market,
    rawData.source,
    rawData.provider,
    rawData.venue,
    rawData.chainId,
    rawData.chain,
    rawData.network,
    rawData.dexId,
    rawData.dex,
    rawData.pair,
    rawData.pairAddress,
  ];

  if (hardBlockFields.some(isBlockedDexOrChainText)) {
    return "blocked";
  }

  const venueFields = [
    row.exchange,
    row.source,
    rowRecord.provider,
    rowRecord.venue,
    rawData.exchange,
    rawData.source,
    rawData.provider,
    rawData.venue,
  ];

  if (venueFields.some(isExactBinanceVenue)) {
    return "binance";
  }

  if (venueFields.some(isExactHyperliquidVenue)) {
    return "hyperliquid";
  }

  return "unknown";
}

type CryptoVenueUniverse = {
  symbols: Set<string>;
  loadedAt: number;
  error: string | null;
};

type CryptoMarketGate = {
  passed: boolean;
  venue: CryptoSignalVenue;
  reason: string;
  symbol: string;
  symbolVariants: string[];
  universeChecked: boolean;
  universeSize: number;
};

let binanceUniverseCache: CryptoVenueUniverse | null = null;
let hyperliquidUniverseCache: CryptoVenueUniverse | null = null;
let binanceUniversePromise: Promise<CryptoVenueUniverse> | null = null;
let hyperliquidUniversePromise: Promise<CryptoVenueUniverse> | null = null;

function getCryptoUniverseCacheTtlMs() {
  const minutes = Number(process.env.SIGNAL_CRYPTO_UNIVERSE_CACHE_MINUTES || "10");

  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60 * 1000;
}

function isFreshCryptoUniverse(cache: CryptoVenueUniverse | null) {
  return Boolean(
    cache && Date.now() - cache.loadedAt < getCryptoUniverseCacheTtlMs()
  );
}

function getCryptoSymbolVariants(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const variants = new Set<string>();

  if (normalized) variants.add(normalized);

  for (const suffix of [
    "USDT",
    "USDC",
    "FDUSD",
    "TUSD",
    "BUSD",
    "USD",
    "PERP",
  ]) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      variants.add(normalized.slice(0, -suffix.length));
    }
  }

  return Array.from(variants).filter(Boolean);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function collectBinanceSymbolsFromExchangeInfo(payload: unknown, symbols: Set<string>) {
  if (!payload || typeof payload !== "object") return;

  const rows = (payload as { symbols?: unknown }).symbols;

  if (!Array.isArray(rows)) return;

  for (const item of rows) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const status = normalizeSignalText(record.status);
    const contractStatus = normalizeSignalText(record.contractStatus);

    if (
      status &&
      status !== "trading" &&
      contractStatus !== "trading"
    ) {
      continue;
    }

    const symbol = normalizeSymbol(String(record.symbol || ""));
    const baseAsset = normalizeSymbol(String(record.baseAsset || ""));

    if (symbol) symbols.add(symbol);
    if (baseAsset) symbols.add(baseAsset);
  }
}

async function loadBinanceUniverse(): Promise<CryptoVenueUniverse> {
  if (isFreshCryptoUniverse(binanceUniverseCache)) return binanceUniverseCache!;
  if (binanceUniversePromise) return binanceUniversePromise;

  binanceUniversePromise = (async () => {
    const symbols = new Set<string>();
    const spotUrl =
      process.env.BINANCE_EXCHANGE_INFO_URL ||
      "https://api.binance.com/api/v3/exchangeInfo";
    const futuresUrl =
      process.env.BINANCE_FUTURES_EXCHANGE_INFO_URL ||
      "https://fapi.binance.com/fapi/v1/exchangeInfo";

    const results = await Promise.allSettled([
      fetchJsonWithTimeout(spotUrl),
      fetchJsonWithTimeout(futuresUrl),
    ]);

    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        collectBinanceSymbolsFromExchangeInfo(result.value, symbols);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    binanceUniverseCache = {
      symbols,
      loadedAt: Date.now(),
      error: errors.length > 0 ? errors.join(" | ") : null,
    };

    return binanceUniverseCache;
  })().finally(() => {
    binanceUniversePromise = null;
  });

  return binanceUniversePromise;
}

async function loadHyperliquidUniverse(): Promise<CryptoVenueUniverse> {
  if (isFreshCryptoUniverse(hyperliquidUniverseCache)) return hyperliquidUniverseCache!;
  if (hyperliquidUniversePromise) return hyperliquidUniversePromise;

  hyperliquidUniversePromise = (async () => {
    const symbols = new Set<string>();
    const url = process.env.HYPERLIQUID_INFO_URL || "https://api.hyperliquid.xyz/info";
    let error: string | null = null;

    try {
      const payload = await fetchJsonWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
      });

      const universe =
        payload && typeof payload === "object"
          ? (payload as { universe?: unknown }).universe
          : null;

      if (Array.isArray(universe)) {
        for (const item of universe) {
          if (!item || typeof item !== "object") continue;

          const name = normalizeSymbol(
            String((item as Record<string, unknown>).name || "")
          );

          if (name) symbols.add(name);
        }
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    hyperliquidUniverseCache = {
      symbols,
      loadedAt: Date.now(),
      error,
    };

    return hyperliquidUniverseCache;
  })().finally(() => {
    hyperliquidUniversePromise = null;
  });

  return hyperliquidUniversePromise;
}

function hasCryptoVenueSymbolMatch(symbol: string, universe: Set<string>) {
  const variants = getCryptoSymbolVariants(symbol);

  return variants.some((variant) => universe.has(variant));
}

async function validateCryptoSignalMarket(
  row: MarketScannerRow,
  symbol: string
): Promise<CryptoMarketGate> {
  const venue = getCryptoSignalVenue(row);
  const symbolVariants = getCryptoSymbolVariants(symbol);

  if (venue !== "binance" && venue !== "hyperliquid") {
    return {
      passed: false,
      venue,
      reason:
        venue === "blocked"
          ? "Blocked DEX/chain source. Crypto signals are Binance/Hyperliquid only."
          : "Unknown crypto venue. Crypto signals require confirmed Binance or Hyperliquid listing.",
      symbol,
      symbolVariants,
      universeChecked: false,
      universeSize: 0,
    };
  }

  const universe =
    venue === "binance" ? await loadBinanceUniverse() : await loadHyperliquidUniverse();

  const listed = hasCryptoVenueSymbolMatch(symbol, universe.symbols);

  return {
    passed: listed,
    venue,
    reason: listed
      ? `${symbol} confirmed on ${venue} universe.`
      : `${symbol} rejected: not found in ${venue} tradable universe.`,
    symbol,
    symbolVariants,
    universeChecked: true,
    universeSize: universe.symbols.size,
  };
}

function getAssetType(row: MarketScannerRow) {
  const exchange = (row.exchange || "").toUpperCase();
  const assetType = (row.asset_type || "").toLowerCase();
  const source = (row.source || "").toLowerCase();
  const rawData =
    row.raw_data && typeof row.raw_data === "object"
      ? (row.raw_data as Record<string, unknown>)
      : {};

  const rawText = [
    rawData.exchange,
    rawData.source,
    rawData.provider,
    rawData.market,
    rawData.venue,
  ]
    .map(normalizeSignalText)
    .join(" ");

  if (
    assetType === "crypto" ||
    exchange === "BINANCE" ||
    exchange === "HYPERLIQUID" ||
    isExactBinanceVenue(source) ||
    isExactHyperliquidVenue(source) ||
    isExactBinanceVenue(rawData.exchange) ||
    isExactHyperliquidVenue(rawData.exchange) ||
    isExactBinanceVenue(rawData.provider) ||
    isExactHyperliquidVenue(rawData.provider) ||
    isExactBinanceVenue(rawData.venue) ||
    isExactHyperliquidVenue(rawData.venue) ||
    rawText.includes("hyperliquid_perp")
  ) {
    return "crypto";
  }

  return "stock";
}


type AlertAssetTypeFilter = "all" | "stock" | "crypto";

function normalizeAssetTypeFilter(value: string | null): AlertAssetTypeFilter {
  const normalized = (value || "all").toLowerCase();

  if (["crypto", "coin", "coins"].includes(normalized)) return "crypto";
  if (["stock", "stocks", "equity", "equities"].includes(normalized)) return "stock";

  return "all";
}

function matchesAssetTypeFilter(
  assetType: "stock" | "crypto" | string | null | undefined,
  filter: AlertAssetTypeFilter
) {
  if (filter === "all") return true;
  return assetType === filter;
}

function buildAlertResponseMetrics(items: Array<{ asset_type?: string | null; status?: string | null; confidence_score?: number | null; score?: number | null }>) {
  const stocks = items.filter((item) => item.asset_type !== "crypto").length;
  const crypto = items.filter((item) => item.asset_type === "crypto").length;
  const active = items.filter((item) => item.status === "active").length;
  const armed = items.filter((item) => item.status === "armed").length;
  const watch = items.filter((item) => item.status === "watch" || item.status === "watchlist").length;
  const confidenceValues = items
    .map((item) =>
      typeof item.confidence_score === "number"
        ? item.confidence_score
        : typeof item.score === "number"
          ? item.score
          : null
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    total: items.length,
    stocks,
    crypto,
    active,
    armed,
    watch,
    avgConfidence:
      confidenceValues.length > 0
        ? Math.round(
            confidenceValues.reduce((sum, value) => sum + value, 0) /
              confidenceValues.length
          )
        : null,
  };
}

function buildAlertSourceCoverage(items: Array<{ source_data?: Record<string, unknown> | null }>) {
  return Array.from(
    new Set(
      items.flatMap((item) => {
        const social = item.source_data?.social;
        if (!social || typeof social !== "object") return [];

        const sources = (social as { sources?: unknown }).sources;
        return Array.isArray(sources)
          ? sources.filter((source): source is string => typeof source === "string")
          : [];
      })
    )
  );
}

function readPersistedBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";

  return false;
}

function isPersistedAllowedCryptoAlert(item: {
  asset_type?: string | null;
  source_data?: Record<string, unknown> | null;
}) {
  if (item.asset_type !== "crypto") return true;

  const sourceData = item.source_data || {};
  const venue = normalizeSignalText(sourceData.cryptoSignalVenue);
  const cryptoMarketGate = isRecord(sourceData.cryptoMarketGate)
    ? sourceData.cryptoMarketGate
    : null;
  const volumeGate = isRecord(sourceData.volumeGate) ? sourceData.volumeGate : null;

  const venueAllowed = venue === "binance" || venue === "hyperliquid";
  const marketGatePassed = cryptoMarketGate
    ? readPersistedBoolean(cryptoMarketGate.passed)
    : false;
  const volumeGatePassed = volumeGate
    ? readPersistedBoolean(volumeGate.passed)
    : false;

  return venueAllowed && marketGatePassed && volumeGatePassed;
}

function readEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}


type StockSignalSessionPhase = "discovery" | "locked_execution" | "off_hours";

type StockSignalSessionState = {
  timezone: "Europe/Kyiv";
  phase: StockSignalSessionPhase;
  kyivDate: string;
  kyivTime: string;
  kyivMinuteOfDay: number;
  isWeekend: boolean;
  canDiscoverNewStocks: boolean;
  lockedWatchlistOnly: boolean;
  discoveryStartMinute: number;
  discoveryEndMinute: number;
  executionEndMinute: number;
};

function getKyivDateTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value])
  );

  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);
  const weekday = String(parts.weekday || "");

  return {
    kyivDate: `${parts.year}-${parts.month}-${parts.day}`,
    kyivTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:${String(second).padStart(2, "0")}`,
    minuteOfDay: hour * 60 + minute,
    isWeekend: weekday === "Sat" || weekday === "Sun",
  };
}

function getStockSignalSessionState(now = new Date()): StockSignalSessionState {
  const kyiv = getKyivDateTimeParts(now);

  const discoveryStartMinute = readEnvNumber(
    "SIGNAL_STOCK_DISCOVERY_START_KYIV_MINUTE",
    11 * 60
  );

  const discoveryEndMinute = readEnvNumber(
    "SIGNAL_STOCK_DISCOVERY_END_KYIV_MINUTE",
    17 * 60
  );

  const executionEndMinute = readEnvNumber(
    "SIGNAL_STOCK_EXECUTION_END_KYIV_MINUTE",
    23 * 60 + 30
  );

  let phase: StockSignalSessionPhase = "off_hours";

  if (!kyiv.isWeekend) {
    if (
      kyiv.minuteOfDay >= discoveryStartMinute &&
      kyiv.minuteOfDay < discoveryEndMinute
    ) {
      phase = "discovery";
    } else if (
      kyiv.minuteOfDay >= discoveryEndMinute &&
      kyiv.minuteOfDay <= executionEndMinute
    ) {
      phase = "locked_execution";
    }
  }

  const forcedPhase = readEnvString("SIGNAL_STOCK_SESSION_FORCE_PHASE", "");

  if (
    forcedPhase === "discovery" ||
    forcedPhase === "locked_execution" ||
    forcedPhase === "off_hours"
  ) {
    phase = forcedPhase;
  }

  return {
    timezone: "Europe/Kyiv",
    phase,
    kyivDate: kyiv.kyivDate,
    kyivTime: kyiv.kyivTime,
    kyivMinuteOfDay: kyiv.minuteOfDay,
    isWeekend: kyiv.isWeekend,
    canDiscoverNewStocks: phase === "discovery",
    lockedWatchlistOnly: phase === "locked_execution",
    discoveryStartMinute,
    discoveryEndMinute,
    executionEndMinute,
  };
}

async function loadStockSessionWatchlistSymbols(params: {
  lookbackHours: number;
  sessionDate?: string;
}) {
  const sessionDate =
    params.sessionDate || getStockSignalSessionState().kyivDate;

  const persistentResult = await supabaseAdmin
    .from("market_signal_watchlist")
    .select("symbol, status, best_setup_slug, last_updated_at")
    .eq("asset_type", "stock")
    .eq("session_date", sessionDate)
    .in("status", ["candidate", "in_play", "tracking", "armed", "active"])
    .order("last_updated_at", { ascending: false })
    .limit(1000);

  if (!persistentResult.error) {
    const symbols = new Set<string>();

    for (const row of (persistentResult.data || []) as Array<{
      symbol?: string | null;
    }>) {
      const symbol = normalizeSymbol(row.symbol || "");
      if (symbol) symbols.add(symbol);
    }

    if (symbols.size > 0) {
      return {
        symbols,
        rowsLoaded: persistentResult.data?.length || 0,
        since: sessionDate,
        source: "market_signal_watchlist",
        error: null,
      };
    }
  }

  const since = new Date(
    Date.now() - Math.max(1, params.lookbackHours) * 60 * 60 * 1000
  ).toISOString();

  const fallbackResult = await supabaseAdmin
    .from("market_alerts")
    .select("symbol, status, setup_slug, created_at")
    .eq("asset_type", "stock")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (fallbackResult.error) {
    return {
      symbols: new Set<string>(),
      rowsLoaded: 0,
      since,
      source: "market_alerts_fallback",
      error: fallbackResult.error,
    };
  }

  const symbols = new Set<string>();

  for (const row of (fallbackResult.data || []) as Array<{ symbol?: string | null }>) {
    const symbol = normalizeSymbol(row.symbol || "");
    if (symbol) symbols.add(symbol);
  }

  return {
    symbols,
    rowsLoaded: fallbackResult.data?.length || 0,
    since,
    source:
      persistentResult.error
        ? "market_alerts_fallback_after_watchlist_error"
        : "market_alerts_fallback_empty_watchlist",
    error: persistentResult.error || null,
  };
}

function inferStockWatchlistStatus(row: MarketScannerRow) {
  const changePercent = toNumber(row.change_percent);
  const volume = toNumber(row.volume);
  const score = toScannerIntegerScore(row.opportunity_score);

  if (Math.abs(changePercent) >= 10 || volume >= 500_000 || score >= 80) {
    return "in_play";
  }

  return "candidate";
}

function inferStockWatchlistPreferredDirection(row: MarketScannerRow) {
  const text = [
    row.direction_bias,
    row.risk_label,
    row.scan_bucket,
    row.catalyst,
    row.raw_data ? JSON.stringify(row.raw_data).slice(0, 1000) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const changePercent = toNumber(row.change_percent);

  if (
    text.includes("short") ||
    text.includes("fade") ||
    text.includes("reject") ||
    text.includes("down") ||
    text.includes("breakdown")
  ) {
    return "downside";
  }

  if (
    text.includes("long") ||
    text.includes("reclaim") ||
    text.includes("breakout") ||
    text.includes("up")
  ) {
    return "upside";
  }

  return changePercent < 0 ? "downside" : "upside";
}

function buildStockWatchlistDiscoveryReason(row: MarketScannerRow) {
  const reasons: string[] = [];
  const changePercent = toNumber(row.change_percent);
  const volume = toNumber(row.volume);
  const score = toScannerIntegerScore(row.opportunity_score);

  if (Math.abs(changePercent) >= 10) {
    reasons.push(`move ${changePercent.toFixed(2)}%`);
  }

  if (volume >= 500_000) {
    reasons.push(`volume ${Math.round(volume).toLocaleString("en-US")}`);
  }

  if (score >= 80) {
    reasons.push(`scanner score ${score}`);
  }

  if (row.catalyst) {
    reasons.push(`catalyst: ${row.catalyst}`);
  }

  if (row.scan_bucket) {
    reasons.push(`bucket: ${row.scan_bucket}`);
  }

  return reasons.length > 0
    ? reasons.join(" · ")
    : "stock appeared in the active market scanner universe";
}

async function upsertStockSessionWatchlistRows(params: {
  rows: MarketScannerRow[];
  stockSession: StockSignalSessionState;
  source: string;
  maxRows: number;
}) {
  const stockRows = params.rows
    .filter((row) => getAssetType(row) === "stock")
    .slice(0, Math.max(1, params.maxRows));

  if (stockRows.length === 0) {
    return {
      attempted: 0,
      upserted: 0,
      error: null,
    };
  }

  const nowIso = new Date().toISOString();

  const payload = stockRows
    .map((row) => {
      const symbol = normalizeSymbol(row.symbol || "");
      if (!symbol) return null;

      const changePercent = toNumber(row.change_percent);
      const volume = toNumber(row.volume);
      const opportunityScore = toScannerIntegerScore(row.opportunity_score);
      const preferredDirection = inferStockWatchlistPreferredDirection(row);

      return {
        session_date: params.stockSession.kyivDate,
        symbol,
        asset_type: "stock",
        status: inferStockWatchlistStatus(row),
        exchange: row.exchange || null,
        name: row.name || symbol,
        source: params.source,
        discovery_reason: buildStockWatchlistDiscoveryReason(row),
        discovered_at: nowIso,
        last_updated_at: nowIso,
        price: toNumber(row.price) || null,
        change_percent: Number.isFinite(changePercent) ? changePercent : null,
        volume: Number.isFinite(volume) ? volume : null,
        opportunity_score: opportunityScore,
        direction_bias: row.direction_bias || null,
        preferred_direction: preferredDirection,
        best_setup_slug: null,
        scan_bucket: row.scan_bucket || null,
        risk_label: row.risk_label || null,
        catalyst: row.catalyst || null,
        session_phase: params.stockSession.phase,
        raw_data: row.raw_data || {},
        notes: [
          {
            at: nowIso,
            event: "discovery_or_update",
            phase: params.stockSession.phase,
            reason: buildStockWatchlistDiscoveryReason(row),
          },
        ],
      };
    })
    .filter(Boolean);

  if (payload.length === 0) {
    return {
      attempted: stockRows.length,
      upserted: 0,
      error: null,
    };
  }

  const result = await supabaseAdmin
    .from("market_signal_watchlist")
    .upsert(payload, {
      onConflict: "session_date,symbol,asset_type",
    });

  return {
    attempted: payload.length,
    upserted: result.error ? 0 : payload.length,
    error: result.error,
  };
}



type StockTechnicalEnrichmentPayload = {
  session_date: string;
  symbol: string;
  asset_type: "stock";
  last_updated_at: string;
  price: number | null;
  volume: number | null;
  rvol: number | null;
  relative_volume: number | null;
  premarket_volume: number | null;
  avg_volume: number | null;
  average_volume_30d: number | null;
  previous_day_volume: number | null;
  spread: number | null;
  spread_pct: number | null;
  liquidity_score: number | null;
  atr: number | null;
  atr_pct: number | null;
  range_expansion: number | null;
  session_high: number | null;
  session_low: number | null;
  premarket_high: number | null;
  premarket_low: number | null;
  opening_range_high: number | null;
  opening_range_low: number | null;
  vwap: number | null;
  vwap_distance_pct: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  volume_acceleration: number | null;
  impulse_volume: number | null;
  pullback_volume: number | null;
  volume_by_leg: Record<string, unknown>;
  halt_risk_score: number | null;
  ssr_flag: boolean | null;
  trend_bias: string | null;
  trend_strength: number | null;
  trend_state: string | null;
  vwap_state: string | null;
  ema_state: string | null;
  pullback_quality_score: number | null;
  trend_exhaustion_score: number | null;
  last_structure_high: number | null;
  last_structure_low: number | null;
  last_pullback_zone_min: number | null;
  last_pullback_zone_max: number | null;
  session_structure_memory: Record<string, unknown>;
  technical_snapshot: Record<string, unknown>;
  fundamental_snapshot: Record<string, unknown>;
  news_snapshot: Record<string, unknown>;
  data_coverage: Record<string, unknown>;
};

const NEW_YORK_CANDLE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function roundSignalMetric(value: number | null | undefined, decimals = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function readStockEnrichmentRawNumber(row: MarketScannerRow, keys: string[]) {
  const direct = readRawDataNumber(row, keys);
  if (direct !== null) return direct;

  const rawData = row.raw_data;
  if (!rawData || typeof rawData !== "object") return null;

  const containers = [
    (rawData as Record<string, unknown>).raw,
    (rawData as Record<string, unknown>).quote,
    (rawData as Record<string, unknown>).profile,
    (rawData as Record<string, unknown>).fundamentals,
  ].filter(isRecord);

  for (const container of containers) {
    for (const key of keys) {
      const parsed = parseFiniteSignalNumber(container[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function getNewYorkCandleParts(candle: SkillEdgeCandle) {
  const timestampMs = getCandleTimestampMs(candle);
  if (!timestampMs) return null;

  const parts = Object.fromEntries(
    NEW_YORK_CANDLE_FORMATTER.formatToParts(new Date(timestampMs)).map((part) => [part.type, part.value])
  );

  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: hour * 60 + minute,
  };
}

function filterCandlesByNewYorkDate(candles: SkillEdgeCandle[], date: string) {
  return candles.filter((candle) => getNewYorkCandleParts(candle)?.date === date);
}

function filterCandlesByNewYorkMinutes(candles: SkillEdgeCandle[], startMinute: number, endMinute: number) {
  return candles.filter((candle) => {
    const parts = getNewYorkCandleParts(candle);
    if (!parts) return false;

    return parts.minuteOfDay >= startMinute && parts.minuteOfDay < endMinute;
  });
}

function sumSignalVolume(candles: SkillEdgeCandle[]) {
  return candles.reduce((sum, candle) => sum + (Number.isFinite(candle.volume) ? candle.volume || 0 : 0), 0);
}

function calculateSignalEma(candles: SkillEdgeCandle[], period: number) {
  const closes = normalizeSignalCandles(candles)
    .map((candle) => candle.close)
    .filter((close) => Number.isFinite(close));

  if (closes.length === 0) return null;

  const seedLength = Math.min(period, closes.length);
  const seed = closes.slice(0, seedLength).reduce((sum, close) => sum + close, 0) / seedLength;
  const multiplier = 2 / (period + 1);

  let ema = seed;

  for (const close of closes.slice(seedLength)) {
    ema = close * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

function calculateSignalAtr(candles: SkillEdgeCandle[], period = 14) {
  const normalized = normalizeSignalCandles(candles);

  if (normalized.length < 2) return null;

  const trueRanges: number[] = [];

  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];

    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  const recent = trueRanges.slice(-Math.max(1, period));
  if (recent.length === 0) return null;

  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

function calculateVolumeAcceleration(candles: SkillEdgeCandle[]) {
  const normalized = normalizeSignalCandles(candles).filter((candle) => (candle.volume || 0) > 0);
  if (normalized.length < 8) return null;

  const recent = normalized.slice(-3);
  const baseline = normalized.slice(Math.max(0, normalized.length - 23), -3);
  const recentAverage = sumSignalVolume(recent) / recent.length;
  const baselineAverage = baseline.length > 0 ? sumSignalVolume(baseline) / baseline.length : null;

  if (!baselineAverage || baselineAverage <= 0) return null;

  return recentAverage / baselineAverage;
}

function calculateStockLiquidityScore(params: {
  volume: number | null;
  rvol: number | null;
  spreadPct: number | null;
  price: number | null;
}) {
  let score = 45;

  if ((params.volume || 0) >= 500_000) score += 12;
  if ((params.volume || 0) >= 1_000_000) score += 10;
  if ((params.volume || 0) >= 5_000_000) score += 8;
  if ((params.rvol || 0) >= 2) score += 8;
  if ((params.rvol || 0) >= 5) score += 8;

  if (params.spreadPct !== null) {
    if (params.spreadPct <= 0.25) score += 10;
    else if (params.spreadPct <= 0.75) score += 4;
    else if (params.spreadPct >= 2) score -= 18;
  }

  if ((params.price || 0) < 1) score -= 8;

  return Math.round(clamp(score));
}

function calculateHaltRiskScore(params: {
  price: number | null;
  changePercent: number;
  spreadPct: number | null;
  rvol: number | null;
  volumeAcceleration: number | null;
}) {
  let score = 8;

  if (Math.abs(params.changePercent) >= 10) score += 12;
  if (Math.abs(params.changePercent) >= 25) score += 15;
  if (Math.abs(params.changePercent) >= 60) score += 18;
  if ((params.price || 0) < 1) score += 8;
  if ((params.rvol || 0) >= 5) score += 8;
  if ((params.volumeAcceleration || 0) >= 3) score += 8;
  if ((params.spreadPct || 0) >= 2) score += 10;

  return Math.round(clamp(score));
}

function calculateStockTrendSnapshot(params: {
  candles: SkillEdgeCandle[];
  price: number | null;
  vwap: number | null;
  vwapDistancePct: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atrPct: number | null;
  volumeAcceleration: number | null;
  rangeExpansion: number | null;
}) {
  const normalized = normalizeSignalCandles(params.candles);
  const shortTrend = getSimpleSignalTrend(normalized, 8);
  const mediumTrend = getSimpleSignalTrend(normalized, 20);
  const price = params.price ?? getLastSignalCandle(normalized)?.close ?? null;

  const aboveVwap = price !== null && params.vwap !== null ? price > params.vwap : false;
  const belowVwap = price !== null && params.vwap !== null ? price < params.vwap : false;
  const bullishEmaStack =
    params.ema20 !== null &&
    params.ema50 !== null &&
    params.ema20 > params.ema50 &&
    (params.ema200 === null || params.ema50 > params.ema200);
  const bearishEmaStack =
    params.ema20 !== null &&
    params.ema50 !== null &&
    params.ema20 < params.ema50 &&
    (params.ema200 === null || params.ema50 < params.ema200);

  let trendBias: "upside" | "downside" | "neutral" = "neutral";

  if ((shortTrend === "up" || mediumTrend === "up") && aboveVwap && bullishEmaStack) {
    trendBias = "upside";
  } else if ((shortTrend === "down" || mediumTrend === "down") && belowVwap && bearishEmaStack) {
    trendBias = "downside";
  } else if (shortTrend === "up" && aboveVwap) {
    trendBias = "upside";
  } else if (shortTrend === "down" && belowVwap) {
    trendBias = "downside";
  }

  const directionalMoveScore =
    params.vwapDistancePct !== null
      ? Math.min(18, Math.abs(params.vwapDistancePct) * 3)
      : 0;
  const trendAlignmentScore =
    trendBias === "upside"
      ? (shortTrend === "up" ? 12 : 0) + (mediumTrend === "up" ? 12 : 0) + (bullishEmaStack ? 16 : 0) + (aboveVwap ? 12 : 0)
      : trendBias === "downside"
        ? (shortTrend === "down" ? 12 : 0) + (mediumTrend === "down" ? 12 : 0) + (bearishEmaStack ? 16 : 0) + (belowVwap ? 12 : 0)
        : 8;
  const participationScore =
    params.volumeAcceleration !== null
      ? Math.min(18, Math.max(0, (params.volumeAcceleration - 0.8) * 10))
      : 0;
  const rangeScore =
    params.rangeExpansion !== null
      ? Math.min(12, Math.max(0, (params.rangeExpansion - 1) * 5))
      : 0;

  const trendStrength = Math.round(clamp(25 + trendAlignmentScore + directionalMoveScore + participationScore + rangeScore));

  const trendState =
    trendBias === "upside"
      ? trendStrength >= 75
        ? "strong_uptrend"
        : "steady_uptrend"
      : trendBias === "downside"
        ? trendStrength >= 75
          ? "strong_downtrend"
          : "steady_downtrend"
        : "range_or_transition";

  const vwapState =
    params.vwap === null || price === null
      ? "unknown"
      : Math.abs(params.vwapDistancePct || 0) <= 0.25
        ? "at_vwap"
        : price > params.vwap
          ? "above_vwap"
          : "below_vwap";

  const emaState =
    bullishEmaStack
      ? "bullish_stack"
      : bearishEmaStack
        ? "bearish_stack"
        : "mixed";

  const distanceToTrendSupport = Math.min(
    ...[params.vwap, params.ema20, params.ema50]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && price !== null)
      .map((value) => Math.abs((price! - value) / price!) * 100),
    999
  );

  const pullbackQualityScore =
    trendBias === "neutral"
      ? 35
      : Math.round(
          clamp(
            78 - Math.min(35, distanceToTrendSupport * 7) +
              (params.volumeAcceleration !== null && params.volumeAcceleration < 1.4 ? 8 : 0) -
              (params.vwapDistancePct !== null && Math.abs(params.vwapDistancePct) > 6 ? 15 : 0)
          )
        );

  const extensionByAtr =
    params.vwapDistancePct !== null && params.atrPct !== null && params.atrPct > 0
      ? Math.abs(params.vwapDistancePct) / params.atrPct
      : 0;
  const trendExhaustionScore = Math.round(
    clamp(
      15 +
        Math.min(35, extensionByAtr * 12) +
        ((params.volumeAcceleration || 0) >= 3 ? 18 : 0) +
        ((params.rangeExpansion || 0) >= 3 ? 14 : 0)
    )
  );

  const pullbackAnchor =
    trendBias === "upside"
      ? Math.max(...[params.vwap, params.ema20, params.ema50].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && price !== null && value <= price!), 0)
      : trendBias === "downside"
        ? Math.min(...[params.vwap, params.ema20, params.ema50].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && price !== null && value >= price!), Number.POSITIVE_INFINITY)
        : null;

  const validPullbackAnchor =
    pullbackAnchor !== null && Number.isFinite(pullbackAnchor) && pullbackAnchor > 0
      ? pullbackAnchor
      : null;

  return {
    trendBias,
    trendStrength,
    trendState,
    vwapState,
    emaState,
    pullbackQualityScore,
    trendExhaustionScore,
    pullbackZoneMin:
      validPullbackAnchor !== null ? validPullbackAnchor * 0.9975 : null,
    pullbackZoneMax:
      validPullbackAnchor !== null ? validPullbackAnchor * 1.0025 : null,
    shortTrend,
    mediumTrend,
  };
}

function buildStockTechnicalEnrichmentPayload(params: {
  row: MarketScannerRow;
  stockSession: StockSignalSessionState;
  candlesResult: SkillEdgeCandlesResult;
  interval: string;
  dailyVolumeFallback?: StockDailyVolumeFallback | null;
}) {
  const symbol = normalizeSymbol(params.row.symbol || "");
  if (!symbol) return null;

  const candles = normalizeSignalCandles(params.candlesResult.candles || []);
  if (candles.length < 8) return null;

  const nowIso = new Date().toISOString();
  const lastCandle = getLastSignalCandle(candles);
  const rawDataForStockIntel = isRecord(params.row.raw_data) ? params.row.raw_data : {};
  const stockPriceFreshness = isRecord(rawDataForStockIntel.priceFreshness)
    ? rawDataForStockIntel.priceFreshness
    : {
        version: "3B-4K-B",
        status: "missing",
        provider: "none",
        sessionKind: getCurrentNewYorkStockSessionKind(),
        checkedAt: nowIso,
        currentPrice: null,
        timestamp: null,
        ageSeconds: null,
        safeForPremiumDelivery: false,
        reason: "No FMP aftermarket quote/trade freshness payload.",
      };
  const price = firstFiniteSignalNumber(
    stockPriceFreshness.currentPrice,
    params.row.price,
    lastCandle?.close
  ) ?? null;
  const volume = firstFiniteSignalNumber(params.row.volume, readStockEnrichmentRawNumber(params.row, ["volume", "dayVolume", "regularMarketVolume", "sharesVolume"])) ?? null;
  const quoteAvgVolume = firstFiniteSignalNumber(
    readStockEnrichmentRawNumber(params.row, [
      "avgVolume",
      "averageVolume",
      "average_volume",
      "avg_volume",
      "volAvg",
      "volumeAvg",
      "avgVolume30d",
      "averageVolume30d",
      "average_volume_30d",
      "averageDailyVolume10Day",
      "averageDailyVolume3Month",
    ])
  );
  const dailyAvgVolume = params.dailyVolumeFallback?.averageVolume30d ?? null;
  const avgVolume = firstFiniteSignalNumber(quoteAvgVolume, dailyAvgVolume);
  const quotePreviousDayVolume = firstFiniteSignalNumber(
    readStockEnrichmentRawNumber(params.row, [
      "previousDayVolume",
      "previous_day_volume",
      "prevVolume",
      "lastVolume",
      "yesterdayVolume",
    ])
  );
  const previousDayVolume = firstFiniteSignalNumber(
    quotePreviousDayVolume,
    params.dailyVolumeFallback?.previousDayVolume ?? null
  );
  const avgVolumeSource =
    quoteAvgVolume !== null
      ? "fmp_quote_profile"
      : dailyAvgVolume !== null
        ? params.dailyVolumeFallback?.source ?? "fmp_daily_candles"
        : null;
  const rvol = volume !== null && avgVolume !== null && avgVolume > 0 ? volume / avgVolume : null;

  const quoteRecordForStockIntel = isRecord(rawDataForStockIntel.quote)
    ? rawDataForStockIntel.quote
    : null;
  const profileRecordForStockIntel = isRecord(rawDataForStockIntel.profile)
    ? rawDataForStockIntel.profile
    : null;
  const fundamentalSourceForStockIntel = isRecord(rawDataForStockIntel.fundamentals)
    ? rawDataForStockIntel.fundamentals
    : null;
  const newsItemsForStockIntel = Array.isArray(rawDataForStockIntel.news)
    ? rawDataForStockIntel.news.filter(isRecord)
    : [];
  const newsSnapshot = buildStockNewsSnapshot({
    symbol,
    newsItems: newsItemsForStockIntel,
    updatedAt: nowIso,
  });
  const fundamentalSnapshot = buildStockFundamentalSnapshot({
    row: params.row,
    quoteRecord: quoteRecordForStockIntel,
    profileRecord: profileRecordForStockIntel,
    fundamentalSource: fundamentalSourceForStockIntel,
    newsSnapshot,
    updatedAt: nowIso,
  });

  const bid = readStockEnrichmentRawNumber(params.row, ["bid", "bidPrice", "bid_price"]);
  const ask = readStockEnrichmentRawNumber(params.row, ["ask", "askPrice", "ask_price"]);
  const spread = bid !== null && ask !== null && ask >= bid ? ask - bid : null;
  const spreadPct = spread !== null && price !== null && price > 0 ? (spread / price) * 100 : null;

  const latestNyDate = lastCandle ? getNewYorkCandleParts(lastCandle)?.date : null;
  const todayCandles = latestNyDate ? filterCandlesByNewYorkDate(candles, latestNyDate) : candles;
  const premarketCandles = filterCandlesByNewYorkMinutes(todayCandles, 4 * 60, 9 * 60 + 30);
  const regularCandles = filterCandlesByNewYorkMinutes(todayCandles, 9 * 60 + 30, 16 * 60);
  const sessionCandles = regularCandles.length > 0 ? regularCandles : todayCandles;
  const openingRangeMinutes = readEnvNumber("SIGNAL_STOCK_OPENING_RANGE_MINUTES", 15);
  const openingRangeCandles = filterCandlesByNewYorkMinutes(
    todayCandles,
    9 * 60 + 30,
    9 * 60 + 30 + Math.max(5, openingRangeMinutes)
  );

  const premarketVolume = premarketCandles.length > 0 ? sumSignalVolume(premarketCandles) : null;
  const sessionHigh = getRecentHigh(sessionCandles);
  const sessionLow = getRecentLow(sessionCandles);
  const premarketHigh = getRecentHigh(premarketCandles);
  const premarketLow = getRecentLow(premarketCandles);
  const openingRangeHigh = getRecentHigh(openingRangeCandles);
  const openingRangeLow = getRecentLow(openingRangeCandles);

  const vwap = calculateSignalVwap(sessionCandles.length > 0 ? sessionCandles : candles);
  const vwapDistancePct = price !== null && vwap !== null && vwap > 0 ? ((price - vwap) / vwap) * 100 : null;
  const ema20 = calculateSignalEma(candles, 20);
  const ema50 = calculateSignalEma(candles, 50);
  const ema200 = calculateSignalEma(candles, 200);
  const atr = calculateSignalAtr(candles, readEnvNumber("SIGNAL_STOCK_ATR_PERIOD", 14));
  const atrPct = price !== null && atr !== null && price > 0 ? (atr / price) * 100 : null;
  const sessionRange = sessionHigh !== null && sessionLow !== null ? sessionHigh - sessionLow : null;
  const rangeExpansion = sessionRange !== null && atr !== null && atr > 0 ? sessionRange / atr : null;
  const volumeAcceleration = calculateVolumeAcceleration(sessionCandles.length > 8 ? sessionCandles : candles);
  const recentCandles = recentSignalCandles(sessionCandles.length > 0 ? sessionCandles : candles, 20);
  const impulseVolume = recentCandles.length > 0 ? sumSignalVolume(recentCandles.slice(-5)) : null;
  const pullbackVolume = recentCandles.length > 5 ? sumSignalVolume(recentCandles.slice(-10, -5)) : null;
  const trend = calculateStockTrendSnapshot({
    candles: sessionCandles.length > 8 ? sessionCandles : candles,
    price,
    vwap,
    vwapDistancePct,
    ema20,
    ema50,
    ema200,
    atrPct,
    volumeAcceleration,
    rangeExpansion,
  });
  const liquidityScore = calculateStockLiquidityScore({
    volume,
    rvol,
    spreadPct,
    price,
  });
  const changePercent = toNumber(params.row.change_percent);
  const haltRiskScore = calculateHaltRiskScore({
    price,
    changePercent,
    spreadPct,
    rvol,
    volumeAcceleration,
  });
  const ssrFlag = changePercent <= -10;
  const volumeByLeg = {
    recent20Volume: roundSignalMetric(sumSignalVolume(recentCandles), 0),
    impulseVolume: roundSignalMetric(impulseVolume, 0),
    pullbackVolume: roundSignalMetric(pullbackVolume, 0),
    volumeAcceleration: roundSignalMetric(volumeAcceleration, 2),
  };

  const payload: StockTechnicalEnrichmentPayload = {
    session_date: params.stockSession.kyivDate,
    symbol,
    asset_type: "stock",
    last_updated_at: nowIso,
    price: roundSignalMetric(price),
    volume: roundSignalMetric(volume, 0),
    rvol: roundSignalMetric(rvol, 2),
    relative_volume: roundSignalMetric(rvol, 2),
    premarket_volume: roundSignalMetric(premarketVolume, 0),
    avg_volume: roundSignalMetric(avgVolume, 0),
    average_volume_30d: roundSignalMetric(avgVolume, 0),
    previous_day_volume: roundSignalMetric(previousDayVolume, 0),
    spread: roundSignalMetric(spread),
    spread_pct: roundSignalMetric(spreadPct, 3),
    liquidity_score: liquidityScore,
    atr: roundSignalMetric(atr),
    atr_pct: roundSignalMetric(atrPct, 3),
    range_expansion: roundSignalMetric(rangeExpansion, 2),
    session_high: roundSignalMetric(sessionHigh),
    session_low: roundSignalMetric(sessionLow),
    premarket_high: roundSignalMetric(premarketHigh),
    premarket_low: roundSignalMetric(premarketLow),
    opening_range_high: roundSignalMetric(openingRangeHigh),
    opening_range_low: roundSignalMetric(openingRangeLow),
    vwap: roundSignalMetric(vwap),
    vwap_distance_pct: roundSignalMetric(vwapDistancePct, 3),
    ema20: roundSignalMetric(ema20),
    ema50: roundSignalMetric(ema50),
    ema200: roundSignalMetric(ema200),
    volume_acceleration: roundSignalMetric(volumeAcceleration, 2),
    impulse_volume: roundSignalMetric(impulseVolume, 0),
    pullback_volume: roundSignalMetric(pullbackVolume, 0),
    volume_by_leg: volumeByLeg,
    halt_risk_score: haltRiskScore,
    ssr_flag: ssrFlag,
    trend_bias: trend.trendBias,
    trend_strength: trend.trendStrength,
    trend_state: trend.trendState,
    vwap_state: trend.vwapState,
    ema_state: trend.emaState,
    pullback_quality_score: trend.pullbackQualityScore,
    trend_exhaustion_score: trend.trendExhaustionScore,
    last_structure_high: roundSignalMetric(sessionHigh),
    last_structure_low: roundSignalMetric(sessionLow),
    last_pullback_zone_min: roundSignalMetric(trend.pullbackZoneMin),
    last_pullback_zone_max: roundSignalMetric(trend.pullbackZoneMax),
    session_structure_memory: {
      updatedAt: nowIso,
      interval: params.interval,
      latestCandleAt: lastCandle?.timestamp ?? null,
      sessionDateNy: latestNyDate,
      shortTrend: trend.shortTrend,
      mediumTrend: trend.mediumTrend,
      trendBias: trend.trendBias,
      trendState: trend.trendState,
      sessionHigh: roundSignalMetric(sessionHigh),
      sessionLow: roundSignalMetric(sessionLow),
      openingRangeHigh: roundSignalMetric(openingRangeHigh),
      openingRangeLow: roundSignalMetric(openingRangeLow),
      pullbackZoneMin: roundSignalMetric(trend.pullbackZoneMin),
      pullbackZoneMax: roundSignalMetric(trend.pullbackZoneMax),
      priceFreshness: stockPriceFreshness,
    },
    technical_snapshot: {
      version: "3B-2E",
      updatedAt: nowIso,
      provider: params.candlesResult.provider,
      interval: params.interval,
      candleCount: candles.length,
      sessionCandles: sessionCandles.length,
      premarketCandles: premarketCandles.length,
      openingRangeCandles: openingRangeCandles.length,
      price: roundSignalMetric(price),
      vwap: roundSignalMetric(vwap),
      vwapDistancePct: roundSignalMetric(vwapDistancePct, 3),
      ema20: roundSignalMetric(ema20),
      ema50: roundSignalMetric(ema50),
      ema200: roundSignalMetric(ema200),
      atr: roundSignalMetric(atr),
      atrPct: roundSignalMetric(atrPct, 3),
      rvol: roundSignalMetric(rvol, 2),
      avgVolume: roundSignalMetric(avgVolume, 0),
      previousDayVolume: roundSignalMetric(previousDayVolume, 0),
      avgVolumeSource,
      dailyVolumeFallbackCandlesLoaded: params.dailyVolumeFallback?.candlesLoaded ?? 0,
      volumeAcceleration: roundSignalMetric(volumeAcceleration, 2),
      trendBias: trend.trendBias,
      trendStrength: trend.trendStrength,
      trendState: trend.trendState,
      priceFreshness: stockPriceFreshness,
    },
    fundamental_snapshot: fundamentalSnapshot,
    news_snapshot: newsSnapshot,
    data_coverage: {
      technical: true,
      technicalVersion: "3B-2E",
      fundamentalVersion: "3B-3",
      hasFundamentalSnapshot: fundamentalSnapshot.hasData === true,
      hasNewsSnapshot: newsSnapshot.hasNews === true,
      fundamentalDataQualityScore: fundamentalSnapshot.dataQualityScore ?? null,
      newsCatalystQualityScore: newsSnapshot.catalystQualityScore ?? null,
      candlesProvider: params.candlesResult.provider,
      candlesInterval: params.interval,
      candlesLoaded: candles.length,
      hasVwap: vwap !== null,
      hasEma: ema20 !== null || ema50 !== null || ema200 !== null,
      hasAtr: atr !== null,
      hasRvol: rvol !== null,
      hasAvgVolume: avgVolume !== null,
      hasPreviousDayVolume: previousDayVolume !== null,
      avgVolumeSource,
      dailyVolumeFallbackLoaded: avgVolumeSource === "fmp_daily_candles",
      dailyVolumeFallbackCandlesLoaded: params.dailyVolumeFallback?.candlesLoaded ?? 0,
      hasPremarket: premarketCandles.length > 0,
      hasOpeningRange: openingRangeCandles.length > 0,
      priceFreshness: stockPriceFreshness,
      updatedAt: nowIso,
    },
  };

  return payload;
}

async function enrichStockWatchlistTechnicalRows(params: {
  rows: MarketScannerRow[];
  stockSession: StockSignalSessionState;
}) {
  const interval = readSignalTimeframe("SIGNAL_STOCK_TECH_ENRICH_TIMEFRAME", "5m");
  const limit = readEnvNumber("SIGNAL_STOCK_TECH_ENRICH_CANDLE_LIMIT", 180);
  const maxRows = readEnvNumber("SIGNAL_STOCK_TECH_ENRICH_MAX_ROWS", 180);
  const concurrency = Math.max(1, Math.min(8, readEnvNumber("SIGNAL_STOCK_TECH_ENRICH_CONCURRENCY", 4)));
  const stockRows = params.rows
    .filter((row) => getAssetType(row) === "stock" && normalizeSymbol(row.symbol || ""))
    .slice(0, Math.max(1, maxRows));

  const stockSymbols = stockRows.map((row) => row.symbol || "");
  const quoteBySymbol = await fetchFmpSignalQuoteMap(stockSymbols);
  const aftermarketBySymbol = await fetchFmpSignalAftermarketMap(stockSymbols);
  const legacyQuoteBySymbol = await fetchFmpSignalLegacyQuoteMap(stockSymbols);
  const profileBySymbol = await fetchFmpSignalProfileMap(stockSymbols);
  const stockFundamentalBySymbol = await fetchFmpSignalFundamentalMap(stockSymbols);
  const stockNewsBySymbol = await fetchFmpSignalStockNewsMap(stockSymbols);
  const dailyVolumeFallbackBySymbol = await fetchFmpSignalDailyVolumeFallbackMap(stockSymbols);

  const payload: StockTechnicalEnrichmentPayload[] = [];
  let skipped = 0;
  let candlesLoaded = 0;

  for (let index = 0; index < stockRows.length; index += concurrency) {
    const chunk = stockRows.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (row) => {
        const symbol = normalizeSymbol(row.symbol || "");

        try {
          const candlesResult = await fetchSignalCandlesForTimeframe({
            symbol,
            assetType: "stock",
            interval,
            limit,
          });

          candlesLoaded += candlesResult.candles.length;

          const quote = quoteBySymbol.get(symbol) || null;
          const aftermarket = aftermarketBySymbol.get(symbol) || null;
          const legacyQuote = legacyQuoteBySymbol.get(symbol) || null;
          const profile = profileBySymbol.get(symbol) || null;
          const quoteRecord = quote ? (quote as Record<string, unknown>) : null;
          const aftermarketQuoteRecord = aftermarket?.quote || null;
          const aftermarketTradeRecord = aftermarket?.trade || null;
          const priceFreshnessRecord = aftermarket?.priceFreshness || null;
          const legacyQuoteRecord = legacyQuote ? (legacyQuote as Record<string, unknown>) : null;
          const profileRecord = profile ? (profile as Record<string, unknown>) : null;
          const fundamentalRecord = stockFundamentalBySymbol.get(symbol) || null;
          const stockNewsItems = stockNewsBySymbol.get(symbol) || [];
          const dailyVolumeFallback = dailyVolumeFallbackBySymbol.get(symbol) || null;
          const mergedQuoteRecord = mergeFmpSignalRecords(
            legacyQuoteRecord,
            quoteRecord,
            aftermarketQuoteRecord,
            aftermarketTradeRecord,
            {
              price: priceFreshnessRecord?.currentPrice ?? null,
              lastPrice: priceFreshnessRecord?.currentPrice ?? null,
              bid: priceFreshnessRecord?.bid ?? null,
              ask: priceFreshnessRecord?.ask ?? null,
              timestamp: priceFreshnessRecord?.timestamp ?? null,
              updatedAt: priceFreshnessRecord?.timestamp ?? null,
              avgVolume: firstFiniteSignalNumber(
                getStockQuoteAverageVolume(quoteRecord),
                getStockQuoteAverageVolume(legacyQuoteRecord),
                getStockQuoteAverageVolume(profileRecord)
              ),
              previousDayVolume: dailyVolumeFallback?.previousDayVolume ?? null,
            }
          );
          const hasAnyStockEnrichment =
            Boolean(quote || legacyQuote || profile || aftermarket || fundamentalRecord || stockNewsItems.length > 0);
          const enrichedRow: MarketScannerRow =
            hasAnyStockEnrichment
              ? {
                  ...row,
                  price:
                    firstFiniteSignalNumber(
                      priceFreshnessRecord?.currentPrice,
                      row.price,
                      quote?.price,
                      quote?.lastPrice,
                      legacyQuote?.price,
                      legacyQuote?.lastPrice
                    ) ?? row.price,
                  volume:
                    firstFiniteSignalNumber(
                      row.volume,
                      quote?.volume,
                      quote?.sharesVolume,
                      quote?.dayVolume,
                      legacyQuote?.volume,
                      legacyQuote?.sharesVolume,
                      legacyQuote?.dayVolume
                    ) ?? row.volume,
                  raw_data: {
                    ...(row.raw_data || {}),
                    quote: mergedQuoteRecord,
                    aftermarketQuote: aftermarketQuoteRecord,
                    aftermarketTrade: aftermarketTradeRecord,
                    priceFreshness: priceFreshnessRecord,
                    profile: profileRecord,
                    fundamentals: fundamentalRecord,
                    news: stockNewsItems,
                    dailyVolumeFallback,
                    avgVolumeSource:
                      getStockQuoteAverageVolume(mergedQuoteRecord) !== null
                        ? "fmp_quote_profile"
                        : dailyVolumeFallback?.averageVolume30d !== null && dailyVolumeFallback?.averageVolume30d !== undefined
                          ? "fmp_daily_candles"
                          : null,
                  },
                }
              : row;

          return buildStockTechnicalEnrichmentPayload({
            row: enrichedRow,
            stockSession: params.stockSession,
            candlesResult,
            interval,
            dailyVolumeFallback,
          });
        } catch (error) {
          console.error(`Stock technical enrichment failed for ${symbol}:`, error);
          return null;
        }
      })
    );

    for (const item of chunkResults) {
      if (item) payload.push(item);
      else skipped += 1;
    }
  }

  const avgVolumeLoaded = payload.filter((item) => item.avg_volume !== null).length;
  const rvolLoaded = payload.filter((item) => item.rvol !== null).length;
  const fundamentalLoaded = payload.filter((item) => item.fundamental_snapshot?.hasData === true).length;
  const newsLoaded = payload.filter((item) => item.news_snapshot?.hasNews === true).length;
  const dailyAvgVolumeLoaded = payload.filter(
    (item) => item.data_coverage?.avgVolumeSource === "fmp_daily_candles"
  ).length;

  if (payload.length === 0) {
    return {
      attempted: stockRows.length,
      updated: 0,
      skipped,
      candlesLoaded,
      avgVolumeLoaded: 0,
      rvolLoaded: 0,
      fundamentalLoaded: 0,
      newsLoaded: 0,
      dailyAvgVolumeLoaded: 0,
      interval,
      error: null,
    };
  }

  const result = await supabaseAdmin
    .from("market_signal_watchlist")
    .upsert(payload, {
      onConflict: "session_date,symbol,asset_type",
    });

  return {
    attempted: stockRows.length,
    updated: result.error ? 0 : payload.length,
    skipped,
    candlesLoaded,
    avgVolumeLoaded,
    rvolLoaded,
    fundamentalLoaded,
    newsLoaded,
    dailyAvgVolumeLoaded,
    interval,
    error: result.error,
  };
}


type StockWatchlistTechnicalGateContext = {
  hasTechnicalData: boolean;
  armedOk: boolean;
  lockedArmedOk: boolean;
  scoreImpact: number;
  label: string;
  setupSlug: string | null;
  setupFamily: string;
  isFadeOrReversalSetup: boolean;
  isContinuationSetup: boolean;
  trendBias: string | null;
  trendStrength: number | null;
  trendState: string | null;
  vwapState: string | null;
  emaState: string | null;
  liquidityScore: number | null;
  pullbackQualityScore: number | null;
  trendExhaustionScore: number | null;
  volumeAcceleration: number | null;
  rangeExpansion: number | null;
  rvol: number | null;
  spreadPct: number | null;
  directionCompatible: boolean;
  vwapCompatible: boolean;
  emaCompatible: boolean;
  emaHardBlock: boolean;
  hardBlockReasons: string[];
  softWarningReasons: string[];
  gateReasons: string[];
};

type StockWatchlistTechnicalMapResult = {
  map: Map<string, Record<string, unknown>>;
  rowsLoaded: number;
  error: unknown | null;
};

function readEnvFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  return fallback;
}

function getStockWatchlistTechnicalRecord(row: MarketScannerRow) {
  const rawData = row.raw_data;
  if (!rawData || typeof rawData !== "object") return null;

  const raw = rawData as Record<string, unknown>;

  if (isRecord(raw.watchlistTechnical)) return raw.watchlistTechnical;
  if (isRecord(raw.stockTechnical)) return raw.stockTechnical;

  if (
    isRecord(raw.technical_snapshot) ||
    isRecord(raw.data_coverage) ||
    raw.trend_strength !== undefined ||
    raw.trend_bias !== undefined ||
    raw.vwap_state !== undefined
  ) {
    return raw;
  }

  return null;
}

function readStockWatchlistTechnicalNumber(row: MarketScannerRow, keys: string[]) {
  const record = getStockWatchlistTechnicalRecord(row);
  if (!record) return null;

  for (const key of keys) {
    const parsed = parseFiniteSignalNumber(record[key]);
    if (parsed !== null) return parsed;
  }

  const nestedRecords = [
    record.technical_snapshot,
    record.data_coverage,
    record.session_structure_memory,
  ].filter(isRecord);

  for (const nested of nestedRecords) {
    for (const key of keys) {
      const parsed = parseFiniteSignalNumber(nested[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function readStockWatchlistTechnicalText(row: MarketScannerRow, keys: string[]) {
  const record = getStockWatchlistTechnicalRecord(row);
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const nestedRecords = [
    record.technical_snapshot,
    record.data_coverage,
    record.session_structure_memory,
  ].filter(isRecord);

  for (const nested of nestedRecords) {
    for (const key of keys) {
      const value = nested[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

function normalizeStockTechnicalTrendBias(value: string | null) {
  const normalized = (value || "").toLowerCase();

  if (
    normalized.includes("upside") ||
    normalized.includes("uptrend") ||
    normalized.includes("bull") ||
    normalized === "up"
  ) {
    return "upside" as const;
  }

  if (
    normalized.includes("downside") ||
    normalized.includes("downtrend") ||
    normalized.includes("bear") ||
    normalized === "down"
  ) {
    return "downside" as const;
  }

  return "neutral" as const;
}

function evaluateStockTechnicalSignalContext(params: {
  row: MarketScannerRow;
  direction: "upside" | "downside";
  sessionPhase?: string | null;
  setupSlug?: string | null;
}): StockWatchlistTechnicalGateContext {
  const setupSlug = (params.setupSlug || "").toLowerCase();

  const isGapCrapShort = setupSlug.includes("stock_gap_crap_short");
  const isVwapDecision = setupSlug.includes("stock_vwap_reclaim_rejection");
  const isOpeningRange = setupSlug.includes("stock_opening_range_breakout");
  const isNewsContinuation = setupSlug.includes("stock_news_continuation_pullback");
  const isTrendContinuation = setupSlug.includes("stock_trend_continuation_pullback");

  const isFadeOrReversalSetup =
    isGapCrapShort ||
    (params.direction === "downside" && isVwapDecision);

  const isContinuationSetup =
    isOpeningRange ||
    isNewsContinuation ||
    isTrendContinuation ||
    (params.direction === "upside" && isVwapDecision && !isFadeOrReversalSetup);

  const setupFamily = isFadeOrReversalSetup
    ? "fade_reversal"
    : isContinuationSetup
      ? "trend_continuation"
      : "standard";

  const trendBiasText = readStockWatchlistTechnicalText(params.row, [
    "trend_bias",
    "trendBias",
  ]);
  const trendState = readStockWatchlistTechnicalText(params.row, [
    "trend_state",
    "trendState",
  ]);
  const vwapState = readStockWatchlistTechnicalText(params.row, [
    "vwap_state",
    "vwapState",
  ]);
  const emaState = readStockWatchlistTechnicalText(params.row, [
    "ema_state",
    "emaState",
  ]);

  const trendBias = normalizeStockTechnicalTrendBias(trendBiasText || trendState);
  const trendStrength = readStockWatchlistTechnicalNumber(params.row, [
    "trend_strength",
    "trendStrength",
  ]);
  const liquidityScore = readStockWatchlistTechnicalNumber(params.row, [
    "liquidity_score",
    "liquidityScore",
  ]);
  const pullbackQualityScore = readStockWatchlistTechnicalNumber(params.row, [
    "pullback_quality_score",
    "pullbackQualityScore",
  ]);
  const trendExhaustionScore = readStockWatchlistTechnicalNumber(params.row, [
    "trend_exhaustion_score",
    "trendExhaustionScore",
  ]);
  const volumeAcceleration = readStockWatchlistTechnicalNumber(params.row, [
    "volume_acceleration",
    "volumeAcceleration",
  ]);
  const rangeExpansion = readStockWatchlistTechnicalNumber(params.row, [
    "range_expansion",
    "rangeExpansion",
  ]);
  const rvol = readStockWatchlistTechnicalNumber(params.row, ["rvol", "relative_volume", "relativeVolume"]);
  const spreadPct = readStockWatchlistTechnicalNumber(params.row, ["spread_pct", "spreadPct"]);

  const technicalRecord = getStockWatchlistTechnicalRecord(params.row);
  const technicalDataCoverage = isRecord(technicalRecord?.data_coverage)
    ? technicalRecord.data_coverage
    : {};
  const technicalPriceFreshness = isRecord(technicalDataCoverage.priceFreshness)
    ? technicalDataCoverage.priceFreshness
    : isRecord(technicalRecord?.priceFreshness)
      ? technicalRecord.priceFreshness
      : null;
  const priceFreshnessSessionKind =
    typeof technicalPriceFreshness?.sessionKind === "string"
      ? technicalPriceFreshness.sessionKind
      : getCurrentNewYorkStockSessionKind();
  const priceFreshnessSafe =
    technicalPriceFreshness?.safeForPremiumDelivery === true ||
    String(technicalPriceFreshness?.safeForPremiumDelivery || "").toLowerCase() === "true";
  const priceFreshnessStatus =
    typeof technicalPriceFreshness?.status === "string"
      ? technicalPriceFreshness.status
      : "missing";
  const requirePriceFreshnessForArmed = readEnvFlag(
    "SIGNAL_STOCK_REQUIRE_PRICE_FRESHNESS_FOR_ARMED",
    true
  );
  const needsExtendedPriceFreshness =
    requirePriceFreshnessForArmed &&
    (priceFreshnessSessionKind === "premarket" ||
      priceFreshnessSessionKind === "aftermarket");
  const priceFreshnessOk =
    !needsExtendedPriceFreshness || priceFreshnessSafe;

  const hasTechnicalData =
    trendStrength !== null ||
    liquidityScore !== null ||
    vwapState !== null ||
    emaState !== null ||
    pullbackQualityScore !== null ||
    trendExhaustionScore !== null ||
    volumeAcceleration !== null;

  const requireTechnical = readEnvFlag("SIGNAL_STOCK_REQUIRE_TECHNICAL_GATE", true);
  const minTrendStrength = readEnvNumber("SIGNAL_STOCK_TECH_MIN_TREND_STRENGTH", 52);
  const minLiquidityScore = readEnvNumber("SIGNAL_STOCK_TECH_MIN_LIQUIDITY_SCORE", 35);
  const maxTrendExhaustion = readEnvNumber("SIGNAL_STOCK_TECH_MAX_TREND_EXHAUSTION", 82);
  const minPullbackQuality = readEnvNumber("SIGNAL_STOCK_TECH_MIN_PULLBACK_QUALITY", 35);

  const lockedMinTrendStrength = readEnvNumber(
    isFadeOrReversalSetup
      ? "SIGNAL_STOCK_LOCKED_FADE_MIN_TREND_STRENGTH"
      : "SIGNAL_STOCK_LOCKED_MIN_TREND_STRENGTH",
    isFadeOrReversalSetup ? 62 : 68
  );
  const lockedMinLiquidityScore = readEnvNumber("SIGNAL_STOCK_LOCKED_MIN_LIQUIDITY_SCORE", 45);
  const lockedMaxTrendExhaustion = readEnvNumber(
    isFadeOrReversalSetup
      ? "SIGNAL_STOCK_LOCKED_FADE_MAX_TREND_EXHAUSTION"
      : "SIGNAL_STOCK_LOCKED_MAX_TREND_EXHAUSTION",
    isFadeOrReversalSetup ? 82 : 76
  );
  const lockedMinPullbackQuality = readEnvNumber(
    isFadeOrReversalSetup
      ? "SIGNAL_STOCK_LOCKED_FADE_MIN_PULLBACK_QUALITY"
      : "SIGNAL_STOCK_LOCKED_MIN_PULLBACK_QUALITY",
    isFadeOrReversalSetup ? 58 : 45
  );
  const lockedMinVolumeAcceleration = readEnvNumber(
    isFadeOrReversalSetup
      ? "SIGNAL_STOCK_LOCKED_FADE_MIN_VOLUME_ACCELERATION"
      : "SIGNAL_STOCK_LOCKED_MIN_VOLUME_ACCELERATION",
    isFadeOrReversalSetup ? 0.65 : 0.85
  );

  const oppositeTrend =
    (params.direction === "upside" && trendBias === "downside") ||
    (params.direction === "downside" && trendBias === "upside");

  const strongOppositeTrend = oppositeTrend && (trendStrength ?? 0) >= 64;

  const vwapLower = (vwapState || "").toLowerCase();
  const vwapCompatible =
    !vwapState ||
    vwapLower === "unknown" ||
    vwapLower === "at_vwap" ||
    (params.direction === "upside" ? !vwapLower.includes("below") : !vwapLower.includes("above"));

  const emaLower = (emaState || "").toLowerCase();
  const rawEmaCompatible =
    !emaState ||
    emaLower === "mixed" ||
    (params.direction === "upside" ? !emaLower.includes("bearish") : !emaLower.includes("bullish"));

  // EMA is a lagging filter. For short-fade / failed-pump setups it should be a warning,
  // not a hard blocker. For continuation setups it remains an important alignment filter.
  const emaHardBlock = !isFadeOrReversalSetup && !rawEmaCompatible;
  const emaCompatible = rawEmaCompatible || isFadeOrReversalSetup;

  const counterTrendFadeAllowed =
    isFadeOrReversalSetup &&
    params.direction === "downside" &&
    vwapCompatible &&
    ((pullbackQualityScore !== null && pullbackQualityScore >= 62) ||
      (trendExhaustionScore !== null && trendExhaustionScore <= 70) ||
      (volumeAcceleration !== null && volumeAcceleration >= 1.1));

  const directionCompatible = !strongOppositeTrend || counterTrendFadeAllowed;

  const basicTrendOk = trendStrength === null || trendStrength >= minTrendStrength || counterTrendFadeAllowed;
  const basicLiquidityOk = liquidityScore === null || liquidityScore >= minLiquidityScore;
  const basicExhaustionOk = trendExhaustionScore === null || trendExhaustionScore <= maxTrendExhaustion;
  const basicPullbackOk = pullbackQualityScore === null || pullbackQualityScore >= minPullbackQuality;

  const lockedTrendOk =
    trendStrength !== null &&
    (trendStrength >= lockedMinTrendStrength || counterTrendFadeAllowed);
  const lockedLiquidityOk = liquidityScore === null || liquidityScore >= lockedMinLiquidityScore;
  const lockedExhaustionOk = trendExhaustionScore === null || trendExhaustionScore <= lockedMaxTrendExhaustion;
  const lockedPullbackOk = pullbackQualityScore === null || pullbackQualityScore >= lockedMinPullbackQuality;
  const lockedVolumeOk =
    volumeAcceleration === null ||
    volumeAcceleration >= lockedMinVolumeAcceleration ||
    (isFadeOrReversalSetup && (pullbackQualityScore ?? 0) >= 70);

  const dataOk = hasTechnicalData || !requireTechnical;

  const hardBlockReasons: string[] = [];
  const softWarningReasons: string[] = [];

  if (!dataOk) hardBlockReasons.push("technical_snapshot_missing");
  if (!priceFreshnessOk) {
    hardBlockReasons.push(
      `extended_price_not_fresh status=${priceFreshnessStatus}`
    );
  }
  if (!directionCompatible) hardBlockReasons.push("strong_opposite_trend_without_failed-move_confirmation");
  if (!vwapCompatible) hardBlockReasons.push("vwap_against_direction");
  if (emaHardBlock) hardBlockReasons.push("ema_against_continuation_direction");
  if (!lockedTrendOk) hardBlockReasons.push("locked_trend_strength_too_weak");
  if (!lockedLiquidityOk) hardBlockReasons.push("locked_liquidity_too_weak");
  if (!lockedExhaustionOk) hardBlockReasons.push("locked_trend_exhaustion_too_high");
  if (!lockedPullbackOk) hardBlockReasons.push("locked_pullback_quality_too_weak");
  if (!lockedVolumeOk) hardBlockReasons.push("locked_volume_acceleration_too_weak");
  if (spreadPct !== null && spreadPct >= 2) hardBlockReasons.push("spread_too_wide");

  if (isFadeOrReversalSetup && !rawEmaCompatible) softWarningReasons.push("ema_lagging_against_fade_setup");
  if (oppositeTrend && counterTrendFadeAllowed) softWarningReasons.push("countertrend_fade_allowed_by_failed_move_context");
  if (rvol === null) softWarningReasons.push("rvol_missing_pending_avg_volume_enrichment");
  if (rangeExpansion !== null && rangeExpansion >= 2.5) softWarningReasons.push("range_expanded_watch_for_chase_risk");

  const armedOk =
    dataOk &&
    priceFreshnessOk &&
    directionCompatible &&
    vwapCompatible &&
    emaCompatible &&
    basicTrendOk &&
    basicLiquidityOk &&
    basicExhaustionOk &&
    basicPullbackOk;

  const lockedArmedOk = hardBlockReasons.length === 0;

  let scoreImpact = 0;

  if (!hasTechnicalData && requireTechnical) scoreImpact -= 12;
  if (directionCompatible) scoreImpact += 3;
  else scoreImpact -= 12;
  if (vwapCompatible) scoreImpact += 2;
  else scoreImpact -= 6;
  if (rawEmaCompatible) scoreImpact += 1;
  else scoreImpact += isFadeOrReversalSetup ? -1 : -4;

  if (trendStrength !== null) {
    if (trendStrength >= 78) scoreImpact += 5;
    else if (trendStrength >= 65) scoreImpact += 3;
    else if (trendStrength < 45) scoreImpact -= 6;
  }

  if (liquidityScore !== null) {
    if (liquidityScore >= 65) scoreImpact += 3;
    else if (liquidityScore < 35) scoreImpact -= 6;
  }

  if (pullbackQualityScore !== null) {
    if (pullbackQualityScore >= 68) scoreImpact += 3;
    else if (pullbackQualityScore < 35) scoreImpact -= 5;
  }

  if (trendExhaustionScore !== null) {
    if (trendExhaustionScore >= 82) scoreImpact -= 9;
    else if (trendExhaustionScore <= 45) scoreImpact += 2;
  }

  if (volumeAcceleration !== null) {
    if (volumeAcceleration >= 1.5) scoreImpact += 2;
    else if (volumeAcceleration < 0.55) scoreImpact -= 3;
  }

  if (spreadPct !== null && spreadPct >= 2) scoreImpact -= 6;
  if (rvol !== null && rvol >= 3) scoreImpact += 2;
  if (rangeExpansion !== null && rangeExpansion >= 2.5) scoreImpact -= 2;
  if (counterTrendFadeAllowed) scoreImpact += 2;

  const gateReasons = [
    hasTechnicalData ? "technical snapshot loaded" : "technical snapshot missing",
    `setupFamily=${setupFamily}`,
    `trend=${trendBias}${trendStrength !== null ? `/${trendStrength}` : ""}`,
    `vwap=${vwapState || "unknown"}`,
    `ema=${emaState || "unknown"}`,
    `liquidity=${liquidityScore ?? "unknown"}`,
    `pullback=${pullbackQualityScore ?? "unknown"}`,
    `exhaustion=${trendExhaustionScore ?? "unknown"}`,
    `volumeAcceleration=${volumeAcceleration !== null ? roundSignalMetric(volumeAcceleration, 2) : "unknown"}`,
    `priceFreshness=${priceFreshnessStatus}/${priceFreshnessSessionKind}/safe=${priceFreshnessSafe}`,
    hardBlockReasons.length > 0 ? `hardBlocks=${hardBlockReasons.join("|")}` : "hardBlocks=none",
    softWarningReasons.length > 0 ? `warnings=${softWarningReasons.join("|")}` : "warnings=none",
  ];

  return {
    hasTechnicalData,
    armedOk,
    lockedArmedOk,
    scoreImpact: Math.round(clamp(scoreImpact, -18, 14)),
    label: `Technical gate: ${lockedArmedOk ? "locked pass" : armedOk ? "basic pass" : "watch only"}; ${gateReasons.join(", ")}`,
    setupSlug: params.setupSlug || null,
    setupFamily,
    isFadeOrReversalSetup,
    isContinuationSetup,
    trendBias,
    trendStrength,
    trendState,
    vwapState,
    emaState,
    liquidityScore,
    pullbackQualityScore,
    trendExhaustionScore,
    volumeAcceleration,
    rangeExpansion,
    rvol,
    spreadPct,
    directionCompatible,
    vwapCompatible,
    emaCompatible,
    emaHardBlock,
    hardBlockReasons,
    softWarningReasons,
    gateReasons,
  };
}

async function loadStockWatchlistTechnicalMap(params: {
  sessionDate: string;
  symbols: string[];
}): Promise<StockWatchlistTechnicalMapResult> {
  const symbols = Array.from(new Set(params.symbols.map(normalizeSymbol).filter(Boolean))).slice(0, 500);

  if (symbols.length === 0) {
    return { map: new Map(), rowsLoaded: 0, error: null };
  }

  const result = await supabaseAdmin
    .from("market_signal_watchlist")
    .select(
      "symbol,price,volume,rvol,relative_volume,avg_volume,average_volume_30d,previous_day_volume,spread,spread_pct,liquidity_score,atr,atr_pct,range_expansion,session_high,session_low,premarket_high,premarket_low,opening_range_high,opening_range_low,vwap,vwap_distance_pct,ema20,ema50,ema200,volume_acceleration,impulse_volume,pullback_volume,volume_by_leg,halt_risk_score,ssr_flag,trend_bias,trend_strength,trend_state,vwap_state,ema_state,pullback_quality_score,trend_exhaustion_score,last_structure_high,last_structure_low,last_pullback_zone_min,last_pullback_zone_max,session_structure_memory,technical_snapshot,data_coverage,last_signal_at,signal_count,cooldown_until,last_setup_slug,last_entry_zone,last_management_update_at,last_updated_at"
    )
    .eq("session_date", params.sessionDate)
    .eq("asset_type", "stock")
    .in("symbol", symbols)
    .limit(500);

  if (result.error) {
    return { map: new Map(), rowsLoaded: 0, error: result.error };
  }

  const map = new Map<string, Record<string, unknown>>();

  for (const row of (result.data || []) as Record<string, unknown>[]) {
    const symbol = normalizeSymbol(String(row.symbol || ""));
    if (symbol) map.set(symbol, row);
  }

  return { map, rowsLoaded: map.size, error: null };
}

function mergeStockWatchlistTechnicalIntoRows(
  rows: MarketScannerRow[],
  technicalMap: Map<string, Record<string, unknown>>
) {
  if (technicalMap.size === 0) return rows;

  return rows.map((row) => {
    if (getAssetType(row) !== "stock") return row;

    const symbol = normalizeSymbol(row.symbol || "");
    const technical = technicalMap.get(symbol);

    if (!technical) return row;

    return {
      ...row,
      price: firstFiniteSignalNumber(row.price, technical.price) ?? row.price,
      volume: firstFiniteSignalNumber(row.volume, technical.volume) ?? row.volume,
      raw_data: {
        ...(row.raw_data || {}),
        watchlistTechnical: technical,
        technical_snapshot: isRecord(technical.technical_snapshot) ? technical.technical_snapshot : null,
        data_coverage: isRecord(technical.data_coverage) ? technical.data_coverage : null,
      },
    };
  });
}

function getLifecycleRank(status: MarketAlertDraft["status"]) {
  if (status === "active") return 3;
  if (status === "armed") return 2;
  return 1;
}

function appendDraftNote(text: string, note: string) {
  return text.includes(note) ? text : `${text} · ${note}`;
}

function limitSignalLifecycleBatch(drafts: MarketAlertDraft[]) {
  const maxActiveStocks = readEnvNumber("SIGNAL_MAX_ACTIVE_STOCKS_PER_REFRESH", 6);
  const maxActiveCrypto = readEnvNumber("SIGNAL_MAX_ACTIVE_CRYPTO_PER_REFRESH", 6);
  const maxArmedStocks = readEnvNumber("SIGNAL_MAX_ARMED_STOCKS_PER_REFRESH", 10);
  const maxArmedCrypto = readEnvNumber("SIGNAL_MAX_ARMED_CRYPTO_PER_REFRESH", 10);
  const maxTotal = readEnvNumber("SIGNAL_MAX_ALERTS_PER_RESPONSE", 30);

  const sorted = [...drafts].sort((a, b) => {
    const lifecycleDiff = getLifecycleRank(b.status) - getLifecycleRank(a.status);
    if (lifecycleDiff !== 0) return lifecycleDiff;
    return b.score - a.score;
  });

  const activeCounts = { stock: 0, crypto: 0 };
  const armedCounts = { stock: 0, crypto: 0 };

  const calibrated = sorted.map((draft) => {
    const asset = draft.asset_type === "crypto" ? "crypto" : "stock";
    const activeLimit = asset === "crypto" ? maxActiveCrypto : maxActiveStocks;
    const armedLimit = asset === "crypto" ? maxArmedCrypto : maxArmedStocks;

    if (draft.status === "active") {
      if (activeCounts[asset] < activeLimit) {
        activeCounts[asset] += 1;
        return normalizeDraftScoreForLifecycle(draft, "kept_active_after_lifecycle_limit");
      }

      armedCounts[asset] += 1;

      return normalizeDraftScoreForLifecycle(
        {
          ...draft,
          status: "armed" as const,
          reason: appendDraftNote(draft.reason, "downgraded to armed by active-signal quality cap"),
          risk_note: appendDraftNote(
            draft.risk_note,
            "Active quota is full for this refresh; wait for trigger/confirmation before acting."
          ),
          source_data: {
            ...draft.source_data,
            lifecycleCalibration: {
              downgradedFrom: "active",
              downgradedTo: "armed",
              reason: "active_cap_per_refresh",
            },
          },
        },
        "downgraded_active_to_armed_after_lifecycle_limit"
      );
    }

    if (draft.status === "armed") {
      if (armedCounts[asset] < armedLimit) {
        armedCounts[asset] += 1;
        return normalizeDraftScoreForLifecycle(draft, "kept_armed_after_lifecycle_limit");
      }

      return normalizeDraftScoreForLifecycle(
        {
          ...draft,
          status: "watch" as const,
          reason: appendDraftNote(draft.reason, "downgraded to watch by armed-setup quality cap"),
          risk_note: appendDraftNote(
            draft.risk_note,
            "Armed quota is full for this refresh; keep it on watch until quality improves."
          ),
          source_data: {
            ...draft.source_data,
            lifecycleCalibration: {
              downgradedFrom: "armed",
              downgradedTo: "watch",
              reason: "armed_cap_per_refresh",
            },
          },
        },
        "downgraded_armed_to_watch_after_lifecycle_limit"
      );
    }

    return normalizeDraftScoreForLifecycle(draft, "kept_watch_after_lifecycle_limit");
  });

  return calibrated
    .sort((a, b) => {
      const lifecycleDiff = getLifecycleRank(b.status) - getLifecycleRank(a.status);
      if (lifecycleDiff !== 0) return lifecycleDiff;
      return b.score - a.score;
    })
    .slice(0, maxTotal)
    .map((draft) => normalizeDraftScoreForLifecycle(draft, "final_hard_score_cap_before_response"));
}

function pickBestMarketRows(rows: MarketScannerRow[]) {
  const map = new Map<string, MarketScannerRow>();

  for (const row of rows) {
    const symbol = normalizeSymbol(row.symbol || "");
    if (!symbol) continue;

    const existing = map.get(symbol);
    const score = toNumber(row.opportunity_score);
    const existingScore = toNumber(existing?.opportunity_score);

    if (!existing || score > existingScore) {
      map.set(symbol, { ...row, symbol });
    }
  }

  return Array.from(map.values());
}

function aggregateSocial(rows: SocialMentionRow[]) {
  const map = new Map<
    string,
    {
      sources: string[];
      mentions24h: number;
      mentions1h: number;
      mentionVelocity: number;
      socialScore: number;
      sentiment: string;
    }
  >();

  for (const row of rows) {
    const symbol = normalizeSymbol(row.symbol || "");
    if (!symbol) continue;

    const existing =
      map.get(symbol) ||
      {
        sources: [],
        mentions24h: 0,
        mentions1h: 0,
        mentionVelocity: 0,
        socialScore: 0,
        sentiment: "neutral",
      };

    const source = row.source || "unknown";

    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }

    existing.mentions24h += toNumber(row.mentions_24h);
    existing.mentions1h += toNumber(row.mentions_1h);
    existing.mentionVelocity = Math.max(
      existing.mentionVelocity,
      toNumber(row.mention_velocity)
    );
    existing.socialScore = Math.max(existing.socialScore, toNumber(row.social_score));
    existing.sentiment = row.sentiment || existing.sentiment;

    map.set(symbol, existing);
  }

  return map;
}

function getAlertType(params: {
  assetType: "stock" | "crypto";
  changePercent: number;
  marketScore: number;
  socialScore: number;
  mentions24h: number;
  catalyst: string | null;
}): AlertType | null {
  if (params.changePercent >= 10 && params.marketScore >= 45) {
    return "pump";
  }

  if (params.changePercent <= -8 && params.marketScore >= 45) {
    return "dump";
  }

  if (
    params.assetType === "crypto" &&
    Math.abs(params.changePercent) >= 5 &&
    params.marketScore >= 40
  ) {
    return "crypto_momentum";
  }

  if (params.socialScore >= 70 && params.mentions24h >= 10) {
    return "social_spike";
  }

  if (params.catalyst && Math.abs(params.changePercent) >= 4) {
    return "news_catalyst";
  }

  return null;
}

function roundPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;

  const absolute = Math.abs(value);

  if (absolute >= 100) return Number(value.toFixed(2));
  if (absolute >= 10) return Number(value.toFixed(2));
  if (absolute >= 1) return Number(value.toFixed(4));
  if (absolute >= 0.1) return Number(value.toFixed(5));
  if (absolute >= 0.01) return Number(value.toFixed(6));
  if (absolute >= 0.001) return Number(value.toFixed(7));

  return Number(value.toFixed(8));
}


function capSignalScoreForLifecycle(
  score: number,
  status: MarketAlertDraft["status"]
) {
  const normalized = Math.round(clamp(score));

  if (status === "active") return Math.max(88, Math.min(normalized, 96));
  if (status === "armed") return Math.max(76, Math.min(normalized, 87));

  return Math.max(60, Math.min(normalized, 75));
}

function getConfidenceTierFromScore(score: number) {
  if (score >= 88) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";

  return "Watch";
}

function rewriteLifecycleReason(
  reason: string,
  status: MarketAlertDraft["status"],
  score: number
) {
  let next = reason || "SkillEdge signal candidate.";

  if (/confidence\s+\d+(\.\d+)?/i.test(next)) {
    next = next.replace(/confidence\s+\d+(\.\d+)?/i, `confidence ${score}`);
  } else {
    next = `${next} · confidence ${score}`;
  }

  if (/status\s+(active|armed|watch)/i.test(next)) {
    next = next.replace(/status\s+(active|armed|watch)/i, `status ${status}`);
  } else {
    next = `${next} · status ${status}`;
  }

  return next;
}
function normalizeDraftScoreForLifecycle(
  draft: MarketAlertDraft,
  reason: string
): MarketAlertDraft {
  const previousScore = Number.isFinite(draft.score) ? draft.score : 0;
  const cappedScore = capSignalScoreForLifecycle(previousScore, draft.status);

  return {
    ...draft,
    score: cappedScore,
    confidence_score: cappedScore,
    confidence_tier: getConfidenceTierFromScore(cappedScore),
    reason: rewriteLifecycleReason(draft.reason, draft.status, cappedScore),
    source_data: {
      ...draft.source_data,
      scoreCalibration: {
        previousScore,
        cappedScore,
        status: draft.status,
        reason,
      },
    },
  };
}

function readSignalValidatorRecordAtPath(
  source: Record<string, unknown> | null | undefined,
  path: string[]
): Record<string, unknown> | null {
  let current: unknown = source;

  for (const key of path) {
    if (!isRecord(current)) return null;

    current = current[key];
  }

  return isRecord(current) ? current : null;
}

function readSignalValidatorValueAtPath(
  source: Record<string, unknown> | null | undefined,
  path: string[]
): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (!isRecord(current)) return null;

    current = current[key];
  }

  return current ?? null;
}

function readSignalValidatorNumberAtPath(
  source: Record<string, unknown> | null | undefined,
  path: string[]
): number | null {
  const value = readSignalValidatorValueAtPath(source, path);

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%,$\s]/g, ""));

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function buildSignalValidatorEntryZone(draft: MarketAlertDraft) {
  if (draft.entry_zone_min !== null && draft.entry_zone_max !== null) {
    return `${draft.entry_zone_min} - ${draft.entry_zone_max}`;
  }

  if (draft.entry_zone_min !== null) return String(draft.entry_zone_min);
  if (draft.entry_zone_max !== null) return String(draft.entry_zone_max);

  return null;
}

function buildSignalValidatorTargets(draft: MarketAlertDraft) {
  return [draft.target_1, draft.target_2, draft.target_3]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => value);
}

function getSignalValidatorDirectionFromDraft(draft: MarketAlertDraft) {
  if (draft.direction === "upside") return "long";
  if (draft.direction === "downside") return "short";

  return null;
}

function buildSignalValidatorCandidateFromDraft(draft: MarketAlertDraft) {
  const sourceData = draft.source_data || {};
  const market = readSignalValidatorRecordAtPath(sourceData, ["market"]);
  const marketRawData = readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data"]);
  const watchlistTechnical =
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "watchlistTechnical"]) ||
    null;
  const technicalSnapshot =
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "technical_snapshot"]) ||
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "watchlistTechnical", "technical_snapshot"]) ||
    watchlistTechnical;
  const fundamentalSnapshot =
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "fundamental_snapshot"]) ||
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "watchlistTechnical", "fundamental_snapshot"]);
  const newsSnapshot =
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "news_snapshot"]) ||
    readSignalValidatorRecordAtPath(sourceData, ["market", "raw_data", "watchlistTechnical", "news_snapshot"]);
  const volumeGate = readSignalValidatorRecordAtPath(sourceData, ["volumeGate"]);
  const qualityV2 = readSignalValidatorRecordAtPath(sourceData, ["qualityV2"]);
  const skillEdgeEngine = readSignalValidatorRecordAtPath(sourceData, ["skillEdgeEngine"]);
  const marketStructure = readSignalValidatorRecordAtPath(sourceData, ["marketStructure"]);
  const rr =
    readSignalValidatorNumberAtPath(sourceData, ["qualityV2", "tp1R"]) ??
    readSignalValidatorNumberAtPath(sourceData, ["skillEdgeEngine", "riskRewardRatio"]);

  return {
    symbol: draft.symbol,
    ticker: draft.symbol,
    asset_type: draft.asset_type,
    assetType: draft.asset_type,
    direction: getSignalValidatorDirectionFromDraft(draft),
    status: draft.status,
    setup_slug: draft.setup_slug,
    setupSlug: draft.setup_slug,
    setup: draft.setup_slug,
    title: draft.title,
    reason: draft.reason,
    risk_note: draft.risk_note,
    warning: draft.risk_note,
    confidence: draft.confidence_score,
    score: draft.score,
    entry: buildSignalValidatorEntryZone(draft),
    entry_zone: buildSignalValidatorEntryZone(draft),
    entry_zone_min: draft.entry_zone_min,
    entry_zone_max: draft.entry_zone_max,
    stop: draft.stop_price,
    stop_price: draft.stop_price,
    stop_loss: draft.stop_price,
    invalidation: draft.invalidation,
    targets: buildSignalValidatorTargets(draft),
    target_1: draft.target_1,
    target_2: draft.target_2,
    target_3: draft.target_3,
    rr,
    risk_reward: rr,
    riskReward: rr,
    tp1_r: rr,
    volume:
      readSignalValidatorNumberAtPath(sourceData, ["volumeGate", "tradedVolume"]) ??
      readSignalValidatorNumberAtPath(market, ["volume"]),
    rvol:
      readSignalValidatorNumberAtPath(watchlistTechnical, ["rvol"]) ??
      readSignalValidatorNumberAtPath(technicalSnapshot, ["rvol"]),
    trend_state:
      readSignalValidatorValueAtPath(watchlistTechnical, ["trend_state"]) ??
      readSignalValidatorValueAtPath(technicalSnapshot, ["trendState"]),
    catalyst:
      readSignalValidatorValueAtPath(market, ["catalyst"]) ??
      readSignalValidatorValueAtPath(newsSnapshot, ["latestTitle"]),
    technical_snapshot: technicalSnapshot,
    fundamental_snapshot: fundamentalSnapshot,
    news_snapshot: newsSnapshot,
    source_data: {
      qualityV2,
      skillEdgeEngine,
      volumeGate,
      marketStructure,
      targetPolicy: readSignalValidatorRecordAtPath(sourceData, ["targetPolicy"]),
      stockSession: readSignalValidatorRecordAtPath(sourceData, ["stockSession"]),
      priceActionPatterns: readSignalValidatorRecordAtPath(sourceData, ["priceActionPatterns"]),
    },
    market_raw_data: marketRawData,
  };
}

function compactSignalAiValidationResult(
  validation: ReturnType<typeof validateSkillEdgeSignalCandidate>
) {
  return {
    version: validation.version,
    verdict: validation.verdict,
    grade: validation.grade,
    score: validation.score,
    setupFitScore: validation.setupFitScore,
    riskScore: validation.riskScore,
    dataCompletenessScore: validation.dataCompletenessScore,
    playbookMatched: validation.playbookMatched,
    setupSlug: validation.setupSlug,
    setupName: validation.setupName,
    deliveryEligibility: validation.deliveryEligibility,
    requiredDataStatus: validation.requiredDataStatus,
    gates: validation.gates,
    passedChecks: validation.passedChecks,
    failedChecks: validation.failedChecks,
    blockedReasons: validation.blockedReasons,
    missingConfirmations: validation.missingConfirmations,
    weakPoints: validation.weakPoints,
    riskWarnings: validation.riskWarnings,
    entryReview: validation.entryReview,
    stopReview: validation.stopReview,
    targetReview: validation.targetReview,
    rrReview: validation.rrReview,
    managementPlan: validation.managementPlan,
    playbookHits: validation.sourceData.playbookHits,
    hardGatesPassed: validation.sourceData.hardGatesPassed,
    deliveryEligible: validation.sourceData.deliveryEligible,
  };
}

function attachSkillEdgeAiValidationToDraft(draft: MarketAlertDraft): MarketAlertDraft {
  try {
    const candidate = buildSignalValidatorCandidateFromDraft(draft);
    const validation = validateSkillEdgeSignalCandidate({
      candidate,
      userContext: null,
    });

    return {
      ...draft,
      source_data: {
        ...draft.source_data,
        aiValidation: compactSignalAiValidationResult(validation),
        aiValidationMeta: {
          version: "3B-4C",
          connectedAt: new Date().toISOString(),
          deliveryTouched: false,
          telegramTouched: false,
          siteWidgetTouched: false,
          validatorPromptPreview: validation.validatorPromptBlock.slice(0, 2500),
        },
      },
    };
  } catch (error) {
    return {
      ...draft,
      source_data: {
        ...draft.source_data,
        aiValidation: {
          version: "3B-4C",
          verdict: "needs_confirmation",
          grade: "D",
          score: 0,
          error: error instanceof Error ? error.message : "validator_failed",
        },
        aiValidationMeta: {
          version: "3B-4C",
          connectedAt: new Date().toISOString(),
          deliveryTouched: false,
          telegramTouched: false,
          siteWidgetTouched: false,
          failed: true,
        },
      },
    };
  }
}

function getDraftAiValidationRecord(draft: MarketAlertDraft) {
  const validation = draft.source_data?.aiValidation;

  return isRecord(validation) ? validation : null;
}

function summarizeDraftAiValidation(drafts: MarketAlertDraft[]) {
  const stats = {
    total: drafts.length,
    approved: 0,
    watchOnly: 0,
    needsConfirmation: 0,
    rejected: 0,
    deliveryEligible: 0,
    blocked: 0,
    playbookMatched: 0,
    gradeA: 0,
    gradeB: 0,
    gradeC: 0,
    gradeD: 0,
  };

  for (const draft of drafts) {
    const validation = getDraftAiValidationRecord(draft);
    const verdict = String(validation?.verdict || "");
    const grade = String(validation?.grade || "");
    const deliveryEligibility = isRecord(validation?.deliveryEligibility)
      ? validation.deliveryEligibility
      : null;

    if (verdict === "approved") stats.approved += 1;
    else if (verdict === "watch_only") stats.watchOnly += 1;
    else if (verdict === "needs_confirmation") stats.needsConfirmation += 1;
    else if (verdict === "rejected") stats.rejected += 1;

    if (deliveryEligibility?.eligible === true) stats.deliveryEligible += 1;
    else stats.blocked += 1;

    if (validation?.playbookMatched === true) stats.playbookMatched += 1;

    if (grade === "A") stats.gradeA += 1;
    else if (grade === "B") stats.gradeB += 1;
    else if (grade === "C") stats.gradeC += 1;
    else if (grade === "D") stats.gradeD += 1;
  }

  return stats;
}
type RecentCryptoAlertForCadence = {
  id?: string | null;
  alert_key?: string | null;
  symbol?: string | null;
  asset_type?: string | null;
  direction?: string | null;
  status?: string | null;
  setup_slug?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

function getCryptoSignalFingerprint(input: {
  asset_type?: string | null;
  symbol?: string | null;
  direction?: string | null;
  setup_slug?: string | null;
}) {
  return [
    input.asset_type || "crypto",
    normalizeSymbol(input.symbol || ""),
    input.direction || "neutral",
    input.setup_slug || "unknown_setup",
  ].join(":");
}

function getCryptoCooldownMinutesForStatus(status: string | null | undefined) {
  if (status === "active") {
    return readEnvNumber("SIGNAL_CRYPTO_ACTIVE_COOLDOWN_MINUTES", 180);
  }

  if (status === "armed") {
    return readEnvNumber("SIGNAL_CRYPTO_ARMED_COOLDOWN_MINUTES", 30);
  }

  return readEnvNumber("SIGNAL_CRYPTO_WATCH_COOLDOWN_MINUTES", 60);
}

function isOpenCryptoCadenceAlert(row: RecentCryptoAlertForCadence) {
  const status = String(row.status || "").toLowerCase();

  if (["expired", "invalidated", "failed", "rejected"].includes(status)) {
    return false;
  }

  if (row.expires_at) {
    const expiresAt = Date.parse(row.expires_at);

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return false;
    }
  }

  return Boolean(row.alert_key && row.symbol && row.setup_slug && row.direction);
}

function applyCryptoDedupeCooldown(params: {
  drafts: MarketAlertDraft[];
  existingRows: RecentCryptoAlertForCadence[];
}) {
  const notes: string[] = [];
  const nowMs = Date.now();

  const maxNewPerRefresh = readEnvNumber("SIGNAL_CRYPTO_MAX_NEW_PER_REFRESH", 12);
  const maxNewPer24h = readEnvNumber("SIGNAL_CRYPTO_MAX_NEW_PER_24H", 80);
  const minIntervalMinutes = readEnvNumber(
    "SIGNAL_CRYPTO_NEW_OPPORTUNITY_MIN_INTERVAL_MINUTES",
    0
  );

  const existingByFingerprint = new Map<string, RecentCryptoAlertForCadence>();
  let latestExistingCreatedAtMs = 0;

  for (const row of params.existingRows) {
    if (!isOpenCryptoCadenceAlert(row)) continue;

    const fingerprint = getCryptoSignalFingerprint(row);
    const createdAtMs = row.created_at ? Date.parse(row.created_at) : 0;

    if (Number.isFinite(createdAtMs)) {
      latestExistingCreatedAtMs = Math.max(latestExistingCreatedAtMs, createdAtMs);
    }

    const existing = existingByFingerprint.get(fingerprint);
    const existingCreatedAtMs = existing?.created_at ? Date.parse(existing.created_at) : 0;

    if (!existing || createdAtMs > existingCreatedAtMs) {
      existingByFingerprint.set(fingerprint, row);
    }
  }

  const existingOpenCount = existingByFingerprint.size;
  const recentNewOpportunityBlocked =
    minIntervalMinutes > 0 &&
    latestExistingCreatedAtMs > 0 &&
    nowMs - latestExistingCreatedAtMs < minIntervalMinutes * 60 * 1000;

  let newCryptoRemainingToday = Math.max(0, maxNewPer24h - existingOpenCount);
  let newCryptoRemainingThisRefresh = recentNewOpportunityBlocked
    ? 0
    : Math.min(maxNewPerRefresh, newCryptoRemainingToday);

  let updatedExisting = 0;
  let createdNew = 0;
  let blockedNew = 0;

  const sortedDrafts = [...params.drafts].sort((a, b) => {
    const lifecycleDiff = getLifecycleRank(b.status) - getLifecycleRank(a.status);
    if (lifecycleDiff !== 0) return lifecycleDiff;
    return b.score - a.score;
  });

  const filtered = sortedDrafts.flatMap((draft) => {
    if (draft.asset_type !== "crypto") {
      return [draft];
    }

    const fingerprint = getCryptoSignalFingerprint(draft);
    const existing = existingByFingerprint.get(fingerprint);

    if (existing?.alert_key) {
      const existingCreatedAtMs = existing.created_at ? Date.parse(existing.created_at) : 0;
      const ageMinutes = Number.isFinite(existingCreatedAtMs)
        ? (nowMs - existingCreatedAtMs) / 60000
        : null;
      const cooldownMinutes = getCryptoCooldownMinutesForStatus(existing.status);

      updatedExisting += 1;

      return [
        {
          ...draft,
          alert_key: existing.alert_key,
          created_at: existing.created_at || draft.created_at,
          is_new: false,
          reason: appendDraftNote(
            draft.reason,
            `updated existing crypto opportunity instead of creating duplicate`
          ),
          risk_note:
            ageMinutes !== null && ageMinutes < cooldownMinutes
              ? appendDraftNote(
                  draft.risk_note,
                  `Duplicate blocked by ${cooldownMinutes}m ${draft.status} cooldown.`
                )
              : draft.risk_note,
          source_data: {
            ...draft.source_data,
            cryptoDedupeCooldown: {
              action: "updated_existing_opportunity",
              fingerprint,
              existingAlertKey: existing.alert_key,
              existingStatus: existing.status,
              existingCreatedAt: existing.created_at,
              cooldownMinutes,
              ageMinutes,
            },
          },
        },
      ];
    }

    if (newCryptoRemainingThisRefresh <= 0 || newCryptoRemainingToday <= 0) {
      blockedNew += 1;

      return [];
    }

    newCryptoRemainingThisRefresh -= 1;
    newCryptoRemainingToday -= 1;
    createdNew += 1;

    return [
      {
        ...draft,
        source_data: {
          ...draft.source_data,
          cryptoDedupeCooldown: {
            action: "created_new_crypto_opportunity",
            fingerprint,
            maxNewPerRefresh,
            maxNewPer24h,
            minIntervalMinutes,
            existingOpenCount,
          },
        },
      },
    ];
  });

  notes.push(
    `Crypto dedupe/cooldown: updated=${updatedExisting}, new=${createdNew}, blocked=${blockedNew}, existingOpen=${existingOpenCount}, maxNewPerRefresh=${maxNewPerRefresh}, maxNewPer24h=${maxNewPer24h}, minNewInterval=${minIntervalMinutes}m.`
  );

  if (recentNewOpportunityBlocked) {
    notes.push(
      `Crypto new-opportunity cadence active: new fingerprints blocked until ${minIntervalMinutes}m pass from the latest open crypto opportunity.`
    );
  }

  return {
    drafts: filtered,
    notes,
  };
}

function getAlertPeriodSince(period: string) {
  const normalized = (period || "24h").toLowerCase();

  if (normalized === "all") return null;

  if (normalized === "7d" || normalized === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (normalized.endsWith("h")) {
    const hours = Number(normalized.replace("h", ""));
    if (Number.isFinite(hours) && hours > 0) {
      return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }
  }

  if (normalized.endsWith("d")) {
    const days = Number(normalized.replace("d", ""));
    if (Number.isFinite(days) && days > 0) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function getSetupEducation(params: {
  alertType: AlertType;
  direction: "upside" | "downside" | "neutral";
  assetType: "stock" | "crypto";
  catalyst: string | null;
}) {
  const isShort = params.alertType === "dump" || params.direction === "downside";
  const isCrypto = params.assetType === "crypto";

  if (isCrypto && isShort) {
    return {
      setup_slug: "crypto-smc-sellside-continuation",
      setup_name: "Crypto SMC Sellside Continuation",
      setup_description:
        "Short-side crypto setup where price shows weakness after a failed reclaim or liquidity sweep. The idea is not to chase the dump, but to wait for failed recovery and continuation toward sellside liquidity.",
      setup_confirmation:
        "Confirmation: failed reclaim, lower high, weak bounce, loss of structure, or continuation after displacement. Best when volume/attention supports the move.",
      setup_common_mistake:
        "Common mistake: shorting the first vertical dump after liquidity is already swept, instead of waiting for failed reclaim or lower-high confirmation.",
    };
  }

  if (isCrypto && !isShort) {
    return {
      setup_slug: "crypto-smc-liquidity-reclaim",
      setup_name: "Crypto SMC Liquidity Reclaim",
      setup_description:
        "Long-side crypto setup where price sweeps liquidity, reclaims the level, and starts showing displacement or continuation. The goal is to catch continuation after trapped sellers are forced out.",
      setup_confirmation:
        "Confirmation: sweep + reclaim, strong close back above liquidity, displacement candle, higher low, or continuation after imbalance.",
      setup_common_mistake:
        "Common mistake: buying the first green candle without reclaim confirmation or entering after the move is already extended.",
    };
  }

  if (isShort) {
    return {
      setup_slug: "backside-fade-weakness-continuation",
      setup_name: "Backside Fade / Weakness Continuation",
      setup_description:
        "Short setup after a strong move fails to continue. Price rejects, forms a lower high, loses momentum, and starts moving toward VWAP/support/liquidity below.",
      setup_confirmation:
        "Confirmation: failed breakout, rejection under key level, lower high, VWAP loss, volume fading on bounce, or breakdown continuation.",
      setup_common_mistake:
        "Common mistake: shorting too early into frontside strength before the backside is confirmed.",
    };
  }

  if (params.catalyst) {
    return {
      setup_slug: "catalyst-momentum-continuation",
      setup_name: "Catalyst Momentum Continuation",
      setup_description:
        "Long setup driven by fresh catalyst, strong volume and continuation pressure. The signal looks for a cleaner continuation attempt instead of random chasing.",
      setup_confirmation:
        "Confirmation: pullback holds, VWAP reclaim/hold, high-volume continuation, break of intraday high, or strong bid after catalyst.",
      setup_common_mistake:
        "Common mistake: chasing the first spike without waiting for pullback quality, reclaim, or volume confirmation.",
    };
  }

  return {
    setup_slug: "momentum-continuation-volume-expansion",
    setup_name: "Momentum Continuation / Volume Expansion",
    setup_description:
      "Long setup where price is moving with unusual activity and volume expansion. The idea is to participate only if the move confirms continuation instead of fading immediately.",
    setup_confirmation:
      "Confirmation: pullback hold, VWAP reclaim, strong relative volume, break-and-hold above key level, or continuation after consolidation.",
    setup_common_mistake:
      "Common mistake: entering after a large extension without defined invalidation or buying into exhaustion.",
  };
}

function buildPremiumSignalPlaybook(params: {
  alertType: AlertType;
  direction: "upside" | "downside" | "neutral";
  assetType: "stock" | "crypto";
  catalyst: string | null;
  changePercent: number;
  marketScore: number;
  socialScore: number;
  mentions24h: number;
  confidenceScore: number;
}) {
  const isShort = params.alertType === "dump" || params.direction === "downside";
  const isCrypto = params.assetType === "crypto";

  const confidenceTier =
    params.confidenceScore >= 88
      ? "A+"
      : params.confidenceScore >= 80
        ? "A"
        : params.confidenceScore >= 70
          ? "B"
          : "Watchlist";

  const moveText =
    params.changePercent >= 0
      ? `price is up ${params.changePercent.toFixed(2)}%`
      : `price is down ${Math.abs(params.changePercent).toFixed(2)}%`;

  const socialText =
    params.mentions24h > 0
      ? `tracked attention is active with ${params.mentions24h} mentions`
      : "tracked social attention is limited in current sources";

  const whySignalFired = [
    `The signal fired because ${moveText}`,
    `market score is ${Math.round(params.marketScore)}`,
    `social score is ${Math.round(params.socialScore)}`,
    socialText,
    params.catalyst ? `fresh catalyst is present: ${params.catalyst}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (isCrypto && isShort) {
    return {
      setup_timeframe: "5m",
      confirmation_timeframe: "10m",
      confidence_tier: confidenceTier,
      why_signal_fired: whySignalFired,
      confirmation_checklist: [
        "5m candle confirms weakness after failed reclaim",
        "10m structure does not immediately reclaim the broken level",
        "Bounce volume is weaker than sell pressure",
        "Price forms lower high or accepts below key structure",
      ],
      avoid_if: [
        "Price quickly reclaims the failed level with strong volume",
        "Move is already deeply extended into sellside liquidity",
        "There is no clear invalidation level",
      ],
      lesson_summary:
        "This is a short-side continuation idea. The edge is not in chasing the first dump, but in waiting for failed recovery and continuation after sellers stay in control.",
      playbook_status: "training_layer",
    };
  }

  if (isCrypto && !isShort) {
    return {
      setup_timeframe: "5m",
      confirmation_timeframe: "10m",
      confidence_tier: confidenceTier,
      why_signal_fired: whySignalFired,
      confirmation_checklist: [
        "5m candle reclaims liquidity or structure",
        "10m confirms that price is holding above reclaim zone",
        "Move shows displacement or strong continuation attempt",
        "Pullback does not immediately lose the reclaimed level",
      ],
      avoid_if: [
        "Reclaim candle is immediately rejected",
        "Price is extended far above trigger zone",
        "Volume disappears after the first impulse",
      ],
      lesson_summary:
        "This is a crypto liquidity reclaim idea. The goal is to catch continuation after trapped sellers are forced out, not to buy the first green candle blindly.",
      playbook_status: "training_layer",
    };
  }

  if (isShort) {
    return {
      setup_timeframe: "5m",
      confirmation_timeframe: "10m",
      confidence_tier: confidenceTier,
      why_signal_fired: whySignalFired,
      confirmation_checklist: [
        "5m confirms rejection or failed breakout",
        "10m does not reclaim the failed level",
        "Bounce forms lower high or weak recovery",
        "Volume fades on bounce or increases on breakdown",
      ],
      avoid_if: [
        "Stock is still on frontside momentum",
        "Price reclaims HOD/VWAP with strength",
        "Short entry is too close to obvious support",
      ],
      lesson_summary:
        "This is a backside fade idea. The best version appears after a strong move fails, buyers lose control, and price starts accepting below the key level.",
      playbook_status: "training_layer",
    };
  }

  return {
    setup_timeframe: "5m",
    confirmation_timeframe: "10m",
    confidence_tier: confidenceTier,
    why_signal_fired: whySignalFired,
    confirmation_checklist: [
      "5m confirms pullback hold or reclaim",
      "10m confirms continuation context",
      "Volume supports the move",
      "Price is not too extended from trigger zone",
    ],
    avoid_if: [
      "Breakout candle is already extended",
      "Pullback fails immediately",
      "Volume fades after the initial move",
      "Risk/reward becomes poor before entry",
    ],
    lesson_summary: params.catalyst
      ? "This is a catalyst momentum continuation idea. The edge comes from fresh attention plus confirmation, not from chasing the first spike."
      : "This is a momentum continuation idea. The edge comes from controlled continuation after volume expansion, with clear invalidation.",
    playbook_status: "training_layer",
  };
}

function buildActionableTradePlan(params: {
  alertType: AlertType;
  direction: "upside" | "downside" | "neutral";
  price: number | null;
  changePercent: number;
  assetType: "stock" | "crypto";
  catalyst: string | null;
}) {
  const price = params.price && params.price > 0 ? params.price : null;

  const isShort =
    params.alertType === "dump" || params.direction === "downside";

  const isCrypto = params.assetType === "crypto";

  const setupType = isCrypto
    ? isShort
      ? "Crypto SMC weakness / sellside continuation watch"
      : "Crypto SMC momentum / liquidity reclaim watch"
    : isShort
      ? "Backside fade / weakness continuation"
      : params.catalyst
        ? "Catalyst momentum continuation"
        : "Momentum continuation / volume expansion";

  if (!price) {
    return {
      setup_type: setupType,
      trigger_label: isShort
        ? "Trigger: failed reclaim / lower high confirmation"
        : "Trigger: reclaim / hold above key intraday level",
      entry_zone_min: null,
      entry_zone_max: null,
      stop_price: null,
      target_1: null,
      target_2: null,
      target_3: null,
      invalidation: isShort
        ? "Invalid if price reclaims key resistance with volume and holds above it."
        : "Invalid if price fails to hold reclaim level or volume disappears.",
      management_plan: isShort
        ? "Scale only after confirmation. Cover into flushes, avoid shorting into first capitulation candle."
        : "Do not chase first extension. Wait for pullback/reclaim, scale into strength, protect after TP1.",
    };
  }

  const entryMin = isShort ? price * 0.995 : price * 0.998;
  const entryMax = isShort ? price * 1.005 : price * 1.008;
  const entry = (entryMin + entryMax) / 2;

  const stop = isShort ? price * 1.018 : price * 0.982;
  const risk = Math.abs(stop - entry);

  // Fallback is WATCH-only. TP values are R-multiple placeholders so the row can
  // survive safety checks while we wait for real structure/candles.
  const target1 = isShort ? entry - risk * 2.1 : entry + risk * 2.1;
  const target2 = isShort ? entry - risk * 3.2 : entry + risk * 3.2;
  const target3 = isShort ? entry - risk * 4.3 : entry + risk * 4.3;

  return {
    setup_type: setupType,
    trigger_label: isShort
      ? "Trigger: rejection / lower high / failed reclaim with volume weakness"
      : isCrypto
        ? "Trigger: liquidity sweep + reclaim or displacement continuation"
        : "Trigger: pullback hold / VWAP reclaim / high-volume continuation",
    entry_zone_min: roundPrice(Math.min(entryMin, entryMax)),
    entry_zone_max: roundPrice(Math.max(entryMin, entryMax)),
    stop_price: roundPrice(stop),
    target_1: roundPrice(target1),
    target_2: roundPrice(target2),
    target_3: roundPrice(target3),
    invalidation: isShort
      ? "Invalid if price reclaims the failed level and holds above it with increasing volume."
      : isCrypto
        ? "Invalid if reclaim fails and price accepts back below the swept liquidity / structure level."
        : "Invalid if VWAP/reclaim fails, volume dies, or price forms a lower high after trigger.",
    management_plan: isShort
      ? "Take partial into first flush. Move stop down after TP1. Avoid holding through reclaim strength."
      : "Take partial at TP1. Move stop toward breakeven after confirmation. Trail only if volume expands.",
  };
}

function composeFinalTradePlan(params: {
  direction: "upside" | "downside";
  alertType: AlertType;
  candles: SkillEdgeCandle[];
  price: number | null;
  changePercent: number;
  assetType: "stock" | "crypto";
  catalyst: string | null;
}): SignalTradePlan {
  const structureTradePlan = buildSkillEdgeStructureTradePlan({
    direction: params.direction,
    candles: params.candles,
    fallbackPrice: params.price,
    setupSlug: null,
  });

  const fallbackTradePlan = buildActionableTradePlan({
    alertType: params.alertType,
    direction: params.direction,
    price: params.price,
    changePercent: params.changePercent,
    assetType: params.assetType,
    catalyst: params.catalyst,
  });

  if (structureTradePlan.source === "structure") {
    return structureTradePlan as SignalTradePlan;
  }

  return {
    ...structureTradePlan,
    trigger_label: fallbackTradePlan.trigger_label,
    entry_zone_min: fallbackTradePlan.entry_zone_min,
    entry_zone_max: fallbackTradePlan.entry_zone_max,
    stop_price: fallbackTradePlan.stop_price,
    target_1: fallbackTradePlan.target_1,
    target_2: fallbackTradePlan.target_2,
    target_3: fallbackTradePlan.target_3,
    invalidation: fallbackTradePlan.invalidation,
    management_plan: fallbackTradePlan.management_plan,
    risk_reward_ratio: calculateDraftRiskReward({
      direction: params.direction,
      entryMin: fallbackTradePlan.entry_zone_min,
      entryMax: fallbackTradePlan.entry_zone_max,
      stop: fallbackTradePlan.stop_price,
      target:
        fallbackTradePlan.target_3 ||
        fallbackTradePlan.target_2 ||
        fallbackTradePlan.target_1,
    }),
  } as SignalTradePlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSkillEdgeCandle(value: unknown): SkillEdgeCandle | null {
  if (!isRecord(value)) return null;

  const open = toNumber(value.open ?? value.o);
  const high = toNumber(value.high ?? value.h);
  const low = toNumber(value.low ?? value.l);
  const close = toNumber(value.close ?? value.c);
  const volume = toNumber(value.volume ?? value.v);

  const timestamp =
    value.timestamp ??
    value.time ??
    value.date ??
    value.datetime ??
    value.t;

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    timestamp === undefined ||
    timestamp === null
  ) {
    return null;
  }

  return {
    timestamp: timestamp as string | number | Date,
    open,
    high,
    low,
    close,
    volume,
  };
}

function extractCandlesFromUnknown(value: unknown): SkillEdgeCandle[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    const directCandles = value
      .map((item) => normalizeSkillEdgeCandle(item))
      .filter((item): item is SkillEdgeCandle => Boolean(item));

    if (directCandles.length > 0) return directCandles;
  }

  if (!isRecord(value)) return [];

  const candidateKeys = [
    "candles",
    "bars",
    "ohlcv",
    "intraday",
    "intradayCandles",
    "historical",
    "historicalData",
    "chart",
    "data",
    "items",
    "results",
  ];

  for (const key of candidateKeys) {
    const nested = value[key];

    if (Array.isArray(nested)) {
      const candles = nested
        .map((item) => normalizeSkillEdgeCandle(item))
        .filter((item): item is SkillEdgeCandle => Boolean(item));

      if (candles.length > 0) return candles;
    }

    if (isRecord(nested)) {
      const candles = extractCandlesFromUnknown(nested);

      if (candles.length > 0) return candles;
    }
  }

  return [];
}

function extractCandlesFromScannerRow(row: MarketScannerRow): SkillEdgeCandle[] {
  const directCandles = extractCandlesFromUnknown(row);

  if (directCandles.length > 0) return directCandles;

  return extractCandlesFromUnknown(row.raw_data);
}

function calculateDraftRiskReward(params: {
  direction: "upside" | "downside" | "neutral";
  entryMin: number | null;
  entryMax: number | null;
  stop: number | null;
  target: number | null;
}) {
  if (
    params.direction === "neutral" ||
    params.entryMin === null ||
    params.entryMax === null ||
    params.stop === null ||
    params.target === null
  ) {
    return null;
  }

  const entry = (params.entryMin + params.entryMax) / 2;

  const risk =
    params.direction === "upside" ? entry - params.stop : params.stop - entry;

  const reward =
    params.direction === "upside"
      ? params.target - entry
      : entry - params.target;

  if (risk <= 0 || reward <= 0) return null;

  return Number((reward / risk).toFixed(2));
}

function getTradePlanEntryMid(plan: {
  entry_zone_min: number | null;
  entry_zone_max: number | null;
}) {
  if (plan.entry_zone_min === null || plan.entry_zone_max === null) {
    return null;
  }

  return (plan.entry_zone_min + plan.entry_zone_max) / 2;
}

function getSignalMinRiskPct(assetType: "stock" | "crypto") {
  const envValue =
    assetType === "crypto"
      ? process.env.SIGNAL_MIN_RISK_PCT_CRYPTO
      : process.env.SIGNAL_MIN_RISK_PCT_STOCK;

  const parsed = Number(envValue);

  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  return assetType === "crypto" ? 0.012 : 0.006;
}

function getSignalMinRiskReward() {
  const parsed = Number(process.env.SIGNAL_MIN_RR);

  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  return 2;
}

function validateDirectionalTradePlan(params: {
  symbol: string;
  assetType: "stock" | "crypto";
  direction: "upside" | "downside";
  plan: {
    entry_zone_min: number | null;
    entry_zone_max: number | null;
    stop_price: number | null;
    target_1: number | null;
    target_2: number | null;
    target_3: number | null;
    risk_reward_ratio?: number | null;
  };
}) {
  const entry = getTradePlanEntryMid(params.plan);
  const stop = params.plan.stop_price;
  const target1 = params.plan.target_1;
  const target2 = params.plan.target_2;
  const target3 = params.plan.target_3;

  if (
    entry === null ||
    stop === null ||
    target1 === null ||
    !Number.isFinite(target1)
  ) {
    return {
      passed: false,
      reason: `${params.symbol} rejected: missing TP1 structure target. TP1 must be a valid structure zone with minimum 2R.`,
    };
  }

  if (params.direction === "downside") {
    const stopIsCorrect = stop > entry;
    const targetsAreCorrect =
      target1 < entry &&
      (target2 === null || target2 < entry) &&
      (target3 === null || target3 < entry);

    if (!stopIsCorrect || !targetsAreCorrect) {
      return {
        passed: false,
        reason: `${params.symbol} rejected: downside signal has invalid trade plan direction.`,
      };
    }
  }

  if (params.direction === "upside") {
    const stopIsCorrect = stop < entry;
    const targetsAreCorrect =
      target1 > entry &&
      (target2 === null || target2 > entry) &&
      (target3 === null || target3 > entry);

    if (!stopIsCorrect || !targetsAreCorrect) {
      return {
        passed: false,
        reason: `${params.symbol} rejected: upside signal has invalid trade plan direction.`,
      };
    }
  }

  const riskPct = Math.abs(stop - entry) / entry;
  const minRiskPct = getSignalMinRiskPct(params.assetType);

  if (riskPct < minRiskPct) {
    return {
      passed: false,
      reason: `${params.symbol} rejected: stop distance is too tight (${(riskPct * 100).toFixed(
        2
      )}% < ${(minRiskPct * 100).toFixed(2)}%).`,
    };
  }

  const risk = Math.abs(stop - entry);
  const rewardRatioForTarget = (target: number | null) => {
    if (target === null) return null;

    const reward =
      params.direction === "upside"
        ? target - entry
        : entry - target;

    return reward > 0 && risk > 0 ? reward / risk : 0;
  };

  const rr1 = rewardRatioForTarget(target1);
  const rr2 = rewardRatioForTarget(target2);
  const rr3 = rewardRatioForTarget(target3);

  if (rr1 === null || rr1 < 2) {
    return {
      passed: false,
      reason: `${params.symbol} rejected: TP1 does not meet minimum 2R policy (${rr1?.toFixed(
        2
      ) ?? "n/a"}R).`,
    };
  }

  if (rr2 !== null && rr2 < 3) {
    return {
      passed: false,
      reason: `${params.symbol} rejected: TP2 exists but does not meet 3R policy (${rr2.toFixed(
        2
      )}R).`,
    };
  }

  if (rr3 !== null && rr3 < 4) {
    return {
      passed: false,
      reason: `${params.symbol} rejected: TP3 exists but does not meet 4R policy (${rr3.toFixed(
        2
      )}R).`,
    };
  }

  return {
    passed: true,
    reason:
      rr2 !== null && rr3 !== null
        ? "Trade plan direction, stop distance and full 2R/3R/4R structure target stack passed."
        : "Trade plan direction, stop distance and TP1 >= 2R passed. Keep as watch/armed until more HTF target room is confirmed.",
  };
}


type SignalDirection = "upside" | "downside";

type SignalTradePlan = {
  source?: "structure" | "fallback";
  trigger_label: string;
  entry_zone_min: number | null;
  entry_zone_max: number | null;
  stop_price: number | null;
  target_1: number | null;
  target_2: number | null;
  target_3: number | null;
  invalidation: string;
  management_plan: string;
  risk_reward_ratio: number | null;
  vwap?: number | null;
  atr?: number | null;
  nearest_support?: { price: number; label?: string; type?: string } | null;
  nearest_resistance?: { price: number; label?: string; type?: string } | null;
  structure_notes?: string[];
  missing_structure_data?: string[];
};

type ExecutionTriggerCheck = {
  passed: boolean;
  canBeActive: boolean;
  triggerType: string;
  label: string;
  reasons: string[];
  timeframe: string;
  entryReference: number | null;
  stopReference: number | null;
  scoreImpact: number;
  fastExecutionCandles: number;
  executionCandles: number;
  oneMinuteCandles: number;
  threeMinuteCandles: number;
};

type SetupContextCheck = {
  passed: boolean;
  canBeActive: boolean;
  label: string;
  reasons: string[];
  fiveMinuteTrend: "up" | "down" | "range" | "unknown";
  fifteenMinuteTrend: "up" | "down" | "range" | "unknown";
  scoreImpact: number;
};

type EntryWindowCheck = {
  passed: boolean;
  canBeActive: boolean;
  shouldBlock: boolean;
  reason: string;
  distancePct: number | null;
  progressToTp1: number | null;
};

type SignalTimeframeConfig = {
  contextTimeframe: string;
  confirmationTimeframe: string;
  fastExecutionTimeframe: string;
  executionTimeframe: string;
  contextLimit: number;
  confirmationLimit: number;
  fastExecutionLimit: number;
  executionLimit: number;
  contextLabel: string;
  confirmationLabel: string;
  executionLabel: string;
  setupTimeframeLabel: string;
  confirmationTimeframeLabel: string;
};

function readEnvString(name: string, fallback: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : fallback;
}

function readSignalTimeframe(name: string, fallback: string) {
  const value = readEnvString(name, fallback).toLowerCase();

  if (/^\d+(m|h|d)$/.test(value)) return value;

  return fallback;
}

function asSkillEdgeCandleInterval(interval: string) {
  return interval as SkillEdgeCandleInterval;
}
function dedupeSignalTarget(
  target: number | null,
  previousTargets: Array<number | null>
) {
  if (target === null || !Number.isFinite(target)) return null;

  for (const previousTarget of previousTargets) {
    if (previousTarget === null || !Number.isFinite(previousTarget)) continue;

    const tolerance = Math.max(0.0001, Math.abs(target) * 0.0005);

    if (Math.abs(target - previousTarget) <= tolerance) {
      return null;
    }
  }

  return target;
}

function timeframeToMinutes(interval: string) {
  const normalized = interval.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(m|h|d)$/);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "m") return amount;
  if (unit === "h") return amount * 60;
  if (unit === "d") return amount * 24 * 60;

  return null;
}

function canAggregateTimeframe(fromInterval: string, toInterval: string) {
  const fromMinutes = timeframeToMinutes(fromInterval);
  const toMinutes = timeframeToMinutes(toInterval);

  if (!fromMinutes || !toMinutes || toMinutes <= fromMinutes) return null;
  if (toMinutes % fromMinutes !== 0) return null;

  return toMinutes / fromMinutes;
}

function buildSyntheticCandlesResult(
  base: SkillEdgeCandlesResult,
  _interval: string,
  candles: SkillEdgeCandle[]
): SkillEdgeCandlesResult {
  return {
    ...base,
    candles,
    provider: base.provider,
    error: base.error,
  };
}

function getSignalTimeframeConfig(assetType: "stock" | "crypto"): SignalTimeframeConfig {
  if (assetType === "crypto") {
    const contextTimeframe = readSignalTimeframe("SIGNAL_CRYPTO_CONTEXT_TIMEFRAME", "1h");
    const confirmationTimeframe = readSignalTimeframe(
      "SIGNAL_CRYPTO_CONFIRMATION_TIMEFRAME",
      contextTimeframe
    );
    const fastExecutionTimeframe = readSignalTimeframe("SIGNAL_CRYPTO_FAST_EXECUTION_TIMEFRAME", "3m");
    const executionTimeframe = readSignalTimeframe("SIGNAL_CRYPTO_EXECUTION_TIMEFRAME", "5m");

    return {
      contextTimeframe,
      confirmationTimeframe,
      fastExecutionTimeframe,
      executionTimeframe,
      contextLimit: readEnvNumber("SIGNAL_CRYPTO_CONTEXT_CANDLE_LIMIT", 120),
      confirmationLimit: readEnvNumber("SIGNAL_CRYPTO_CONFIRMATION_CANDLE_LIMIT", 120),
      fastExecutionLimit: readEnvNumber("SIGNAL_CRYPTO_FAST_EXECUTION_CANDLE_LIMIT", 240),
      executionLimit: readEnvNumber("SIGNAL_CRYPTO_EXECUTION_CANDLE_LIMIT", 180),
      contextLabel: `${contextTimeframe} context`,
      confirmationLabel: `${confirmationTimeframe} confirmation`,
      executionLabel: `${fastExecutionTimeframe}/${executionTimeframe} execution`,
      setupTimeframeLabel: `${contextTimeframe} context / ${fastExecutionTimeframe}-${executionTimeframe} trigger`,
      confirmationTimeframeLabel: `${contextTimeframe}/${confirmationTimeframe} context + ${fastExecutionTimeframe}/${executionTimeframe} execution`,
    };
  }

  const contextTimeframe = readSignalTimeframe("SIGNAL_STOCK_CONTEXT_TIMEFRAME", "1h");
  const confirmationTimeframe = readSignalTimeframe(
    "SIGNAL_STOCK_CONFIRMATION_TIMEFRAME",
    "4h"
  );
  const fastExecutionTimeframe = readSignalTimeframe("SIGNAL_STOCK_FAST_EXECUTION_TIMEFRAME", "5m");
  const executionTimeframe = readSignalTimeframe("SIGNAL_STOCK_EXECUTION_TIMEFRAME", "5m");

  return {
    contextTimeframe,
    confirmationTimeframe,
    fastExecutionTimeframe,
    executionTimeframe,
    contextLimit: readEnvNumber("SIGNAL_STOCK_CONTEXT_CANDLE_LIMIT", 160),
    confirmationLimit: readEnvNumber("SIGNAL_STOCK_CONFIRMATION_CANDLE_LIMIT", 120),
    fastExecutionLimit: readEnvNumber("SIGNAL_STOCK_FAST_EXECUTION_CANDLE_LIMIT", 180),
    executionLimit: readEnvNumber("SIGNAL_STOCK_EXECUTION_CANDLE_LIMIT", 180),
    contextLabel: `${contextTimeframe} structure context`,
    confirmationLabel: `${confirmationTimeframe} higher-timeframe context`,
    executionLabel: `${executionTimeframe} execution`,
    setupTimeframeLabel: `${contextTimeframe}/${confirmationTimeframe} structure / ${executionTimeframe} entry trigger`,
    confirmationTimeframeLabel: `${contextTimeframe}/${confirmationTimeframe} structure + ${executionTimeframe} execution trigger`,
  };
}

async function fetchSignalCandlesForTimeframe(params: {
  symbol: string;
  assetType: "stock" | "crypto";
  interval: string;
  limit: number;
}) {
  return fetchSkillEdgeCandles({
    symbol: params.symbol,
    assetType: params.assetType,
    interval: asSkillEdgeCandleInterval(params.interval),
    limit: params.limit,
  });
}

async function loadSignalExecutionCandles(params: {
  symbol: string;
  assetType: "stock" | "crypto";
  config: SignalTimeframeConfig;
}) {
  const [fastResult, executionResult] = await Promise.all([
    fetchSignalCandlesForTimeframe({
      symbol: params.symbol,
      assetType: params.assetType,
      interval: params.config.fastExecutionTimeframe,
      limit: params.config.fastExecutionLimit,
    }),
    fetchSignalCandlesForTimeframe({
      symbol: params.symbol,
      assetType: params.assetType,
      interval: params.config.executionTimeframe,
      limit: params.config.executionLimit,
    }),
  ]);

  if (executionResult.candles.length > 0) {
    return {
      fastExecutionCandlesResult: fastResult,
      executionCandlesResult: executionResult,
    };
  }

  const aggregationRatio = canAggregateTimeframe(
    params.config.fastExecutionTimeframe,
    params.config.executionTimeframe
  );

  if (aggregationRatio && fastResult.candles.length > 0) {
    return {
      fastExecutionCandlesResult: fastResult,
      executionCandlesResult: buildSyntheticCandlesResult(
        fastResult,
        params.config.executionTimeframe,
        aggregateCandlesByCount(fastResult.candles, aggregationRatio)
      ),
    };
  }

  return {
    fastExecutionCandlesResult: fastResult,
    executionCandlesResult: executionResult,
  };
}

function getCandleTimestampMs(candle: SkillEdgeCandle) {
  if (candle.timestamp instanceof Date) return candle.timestamp.getTime();
  if (typeof candle.timestamp === "number") return candle.timestamp;

  const parsed = new Date(candle.timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSignalCandles(candles: SkillEdgeCandle[]) {
  return candles
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low
    )
    .sort((a, b) => getCandleTimestampMs(a) - getCandleTimestampMs(b));
}

function aggregateCandlesByCount(candles: SkillEdgeCandle[], groupSize: number) {
  const normalized = normalizeSignalCandles(candles);
  const result: SkillEdgeCandle[] = [];

  for (let index = 0; index + groupSize <= normalized.length; index += groupSize) {
    const group = normalized.slice(index, index + groupSize);
    const first = group[0];
    const last = group[group.length - 1];

    result.push({
      timestamp: last.timestamp,
      open: first.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: last.close,
      volume: group.reduce((sum, candle) => sum + (candle.volume || 0), 0),
    });
  }

  return result;
}

function getLastSignalCandle(candles: SkillEdgeCandle[]) {
  const normalized = normalizeSignalCandles(candles);
  return normalized.length > 0 ? normalized[normalized.length - 1] : null;
}

function getPreviousSignalCandle(candles: SkillEdgeCandle[]) {
  const normalized = normalizeSignalCandles(candles);
  return normalized.length > 1 ? normalized[normalized.length - 2] : null;
}

function recentSignalCandles(candles: SkillEdgeCandle[], count: number) {
  return normalizeSignalCandles(candles).slice(-count);
}

function candleRange(candle: SkillEdgeCandle | null) {
  if (!candle) return 0;
  return Math.max(0, candle.high - candle.low);
}

function averageSignalVolume(candles: SkillEdgeCandle[], lookback: number) {
  const recent = recentSignalCandles(candles, lookback).filter(
    (candle) => typeof candle.volume === "number" && candle.volume > 0
  );

  if (recent.length === 0) return null;

  return recent.reduce((sum, candle) => sum + (candle.volume || 0), 0) / recent.length;
}

function isBearishTriggerCandle(candle: SkillEdgeCandle | null) {
  if (!candle) return false;

  const range = candleRange(candle);
  if (range <= 0) return false;

  const body = candle.open - candle.close;
  const closeLocation = (candle.close - candle.low) / range;

  return candle.close < candle.open && body / range >= 0.25 && closeLocation <= 0.55;
}

function isBullishTriggerCandle(candle: SkillEdgeCandle | null) {
  if (!candle) return false;

  const range = candleRange(candle);
  if (range <= 0) return false;

  const body = candle.close - candle.open;
  const closeLocation = (candle.high - candle.close) / range;

  return candle.close > candle.open && body / range >= 0.25 && closeLocation <= 0.55;
}

function getRecentHigh(candles: SkillEdgeCandle[]) {
  const recent = candles.filter((candle) => Number.isFinite(candle.high));
  return recent.length > 0 ? Math.max(...recent.map((candle) => candle.high)) : null;
}

function getRecentLow(candles: SkillEdgeCandle[]) {
  const recent = candles.filter((candle) => Number.isFinite(candle.low));
  return recent.length > 0 ? Math.min(...recent.map((candle) => candle.low)) : null;
}

function getSimpleSignalTrend(candles: SkillEdgeCandle[], lookback = 6) {
  const normalized = normalizeSignalCandles(candles);

  if (normalized.length < Math.max(3, lookback)) return "unknown" as const;

  const recent = normalized.slice(-lookback);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const change = (last.close - first.close) / first.close;

  if (change > 0.006) return "up" as const;
  if (change < -0.006) return "down" as const;

  return "range" as const;
}

function calculateSignalVwap(candles: SkillEdgeCandle[]) {
  const normalized = normalizeSignalCandles(candles).filter(
    (candle) => typeof candle.volume === "number" && candle.volume > 0
  );

  if (normalized.length === 0) return null;

  const totals = normalized.reduce(
    (acc, candle) => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      const volume = candle.volume || 0;

      return {
        priceVolume: acc.priceVolume + typicalPrice * volume,
        volume: acc.volume + volume,
      };
    },
    { priceVolume: 0, volume: 0 }
  );

  return totals.volume > 0 ? totals.priceVolume / totals.volume : null;
}

function inferSignalDirectionFromContext(params: {
  row: MarketScannerRow;
  changePercent: number;
  price: number | null;
  primaryContextCandles: SkillEdgeCandle[];
  confirmationContextCandles: SkillEdgeCandle[];
  primaryTimeframe: string;
  confirmationTimeframe: string;
}): SignalDirection | null {
  const primaryTrend = getSimpleSignalTrend(params.primaryContextCandles, 8);
  const confirmationTrend = getSimpleSignalTrend(params.confirmationContextCandles, 6);
  const lastPrimaryClose = getLastSignalCandle(params.primaryContextCandles)?.close ?? params.price;
  const vwap = calculateSignalVwap(params.primaryContextCandles);
  const aboveVwap =
    vwap !== null && lastPrimaryClose !== null ? lastPrimaryClose >= vwap * 0.997 : false;
  const belowVwap =
    vwap !== null && lastPrimaryClose !== null ? lastPrimaryClose <= vwap * 1.003 : false;
  const rawText = [
    params.row.scan_bucket,
    params.row.direction_bias,
    params.row.catalyst,
    params.row.risk_label,
    params.row.source,
    params.row.raw_data ? JSON.stringify(params.row.raw_data).slice(0, 1500) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const continuationText =
    rawText.includes("continuation") ||
    rawText.includes("pullback") ||
    rawText.includes("reclaim") ||
    rawText.includes("hold") ||
    rawText.includes("momentum") ||
    rawText.includes("higher low") ||
    rawText.includes("vwap support");

  const shortText =
    rawText.includes("fade") ||
    rawText.includes("rejection") ||
    rawText.includes("failed") ||
    rawText.includes("lower high") ||
    rawText.includes("weakness") ||
    rawText.includes("breaks lower") ||
    rawText.includes("dump");

  if (
    params.changePercent >= 3 &&
    continuationText &&
    primaryTrend !== "down" &&
    confirmationTrend !== "down" &&
    aboveVwap
  ) {
    return "upside";
  }

  if (
    params.changePercent <= -3 &&
    shortText &&
    primaryTrend !== "up" &&
    confirmationTrend !== "up" &&
    belowVwap
  ) {
    return "downside";
  }

  if (params.changePercent >= 5 && primaryTrend === "up" && confirmationTrend !== "down" && aboveVwap) {
    return "upside";
  }

  if (params.changePercent <= -5 && primaryTrend === "down" && confirmationTrend !== "up" && belowVwap) {
    return "downside";
  }

  return null;
}

function shouldOverrideDirectionWithContext(params: {
  contextualDirection: SignalDirection | null;
  engineDirection: SignalDirection;
  setupName: string;
  setupSlug: string;
  changePercent: number;
}) {
  if (!params.contextualDirection || params.contextualDirection === params.engineDirection) {
    return false;
  }

  const setupText = `${params.setupName} ${params.setupSlug}`.toLowerCase();

  if (
    params.contextualDirection === "upside" &&
    params.changePercent > 3 &&
    (setupText.includes("continuation") ||
      setupText.includes("pullback") ||
      setupText.includes("momentum") ||
      setupText.includes("reclaim"))
  ) {
    return true;
  }

  if (
    params.contextualDirection === "downside" &&
    params.changePercent < -3 &&
    (setupText.includes("fade") ||
      setupText.includes("reaction") ||
      setupText.includes("weakness") ||
      setupText.includes("dump"))
  ) {
    return true;
  }

  return false;
}

function evaluateSetupContext(params: {
  direction: SignalDirection;
  primaryContextCandles: SkillEdgeCandle[];
  confirmationContextCandles: SkillEdgeCandle[];
  primaryTimeframe: string;
  confirmationTimeframe: string;
  executionLabel: string;
}) : SetupContextCheck {
  const primaryTrend = getSimpleSignalTrend(params.primaryContextCandles, 8);
  const confirmationTrend = getSimpleSignalTrend(params.confirmationContextCandles, 6);
  const reasons: string[] = [
    `${params.primaryTimeframe} context=${primaryTrend}`,
    `${params.confirmationTimeframe} context=${confirmationTrend}`,
  ];

  let canBeActive = true;
  let scoreImpact = 0;

  const bothOpposeShort =
    params.direction === "downside" &&
    primaryTrend === "up" &&
    confirmationTrend === "up";
  const bothOpposeLong =
    params.direction === "upside" &&
    primaryTrend === "down" &&
    confirmationTrend === "down";

  if (bothOpposeShort || bothOpposeLong) {
    canBeActive = false;
    scoreImpact -= 8;
    reasons.push(`${params.primaryTimeframe}/${params.confirmationTimeframe} context is against the trade direction; active status requires stronger trigger.`);
  }

  const recentPrimary = recentSignalCandles(params.primaryContextCandles, 6);
  const lastPrimary = recentPrimary[recentPrimary.length - 1] || null;
  const totalRecentRange =
    recentPrimary.length > 0
      ? Math.max(...recentPrimary.map((candle) => candle.high)) -
        Math.min(...recentPrimary.map((candle) => candle.low))
      : 0;

  if (lastPrimary && totalRecentRange > 0 && candleRange(lastPrimary) / totalRecentRange > 0.62) {
    canBeActive = false;
    scoreImpact -= 6;
    reasons.push(`Setup is dominated by one large ${params.primaryTimeframe} candle; downgrade until a cleaner ${params.executionLabel} trigger forms.`);
  }

  return {
    passed: true,
    canBeActive,
    label: reasons.join(" · "),
    reasons,
    fiveMinuteTrend: primaryTrend,
    fifteenMinuteTrend: confirmationTrend,
    scoreImpact,
  };
}

function buildExecutionTrigger(params: {
  symbol: string;
  direction: SignalDirection;
  fastExecutionCandles: SkillEdgeCandle[];
  executionCandles: SkillEdgeCandle[];
  fastExecutionTimeframe: string;
  executionTimeframe: string;
  price: number | null;
  assetType: "stock" | "crypto";
}): ExecutionTriggerCheck {
  const fastCandles = normalizeSignalCandles(params.fastExecutionCandles);
  const executionCandles = normalizeSignalCandles(params.executionCandles);
  const lastFast = getLastSignalCandle(fastCandles);
  const prevFast = getPreviousSignalCandle(fastCandles);
  const lastExecution = getLastSignalCandle(executionCandles);
  const prevExecution = getPreviousSignalCandle(executionCandles);
  const recentFast = recentSignalCandles(fastCandles, 8);
  const recentExecution = recentSignalCandles(executionCandles, 4);
  const avgVolume = averageSignalVolume(fastCandles.slice(0, -1), 20);
  const currentVolume = lastFast?.volume || 0;
  const volumeExpansion = avgVolume !== null && currentVolume > avgVolume * 1.15;
  const timeframeLabel = `${params.fastExecutionTimeframe}/${params.executionTimeframe}`;
  const reasons: string[] = [];

  if (fastCandles.length < 6 || !lastFast) {
    return {
      passed: false,
      canBeActive: false,
      triggerType: "waiting_for_micro_candles",
      label: `Waiting for ${timeframeLabel} trigger candles`,
      reasons: [`${params.symbol}: not enough ${params.fastExecutionTimeframe} candles for execution trigger.`],
      timeframe: timeframeLabel,
      entryReference: params.price,
      stopReference: null,
      scoreImpact: -10,
      fastExecutionCandles: fastCandles.length,
      executionCandles: executionCandles.length,
      oneMinuteCandles: fastCandles.length,
      threeMinuteCandles: executionCandles.length,
    };
  }

  const priorLows = recentFast.slice(0, -1).map((candle) => candle.low);
  const priorHighs = recentFast.slice(0, -1).map((candle) => candle.high);
  const priorLow = priorLows.length > 0 ? Math.min(...priorLows) : null;
  const priorHigh = priorHighs.length > 0 ? Math.max(...priorHighs) : null;
  const entryReference = params.price || lastFast.close;
  let triggerType = "waiting_for_trigger";
  let stopReference: number | null = null;

  if (params.direction === "downside") {
    const bearishFast = isBearishTriggerCandle(lastFast);
    const bearishExecution = isBearishTriggerCandle(lastExecution);
    const failedReclaim =
      Boolean(prevFast) &&
      lastFast.high > prevFast!.high &&
      lastFast.close < prevFast!.high &&
      lastFast.close < lastFast.open;
    const lowerHighExecution =
      Boolean(lastExecution && prevExecution) &&
      lastExecution!.high <= prevExecution!.high * 1.0025 &&
      lastExecution!.close < prevExecution!.close;
    const microBreak = priorLow !== null && lastFast.close < priorLow;

    if (failedReclaim) reasons.push(`${params.fastExecutionTimeframe} failed reclaim / stuff candle`);
    if (lowerHighExecution) reasons.push(`${params.executionTimeframe} lower high confirmed`);
    if (bearishFast || bearishExecution) reasons.push(`bearish ${timeframeLabel} trigger candle`);
    if (microBreak) reasons.push(`${params.fastExecutionTimeframe} micro-support break`);
    if (volumeExpansion) reasons.push(`${params.fastExecutionTimeframe} volume expands on trigger`);

    const triggerCount = [
      failedReclaim,
      lowerHighExecution,
      bearishFast || bearishExecution,
      microBreak,
    ].filter(Boolean).length;
    const passed = triggerCount >= 1 && (volumeExpansion || triggerCount >= 2);

    if (passed) {
      triggerType = failedReclaim
        ? `${params.fastExecutionTimeframe}_failed_reclaim`
        : lowerHighExecution
          ? `${params.executionTimeframe}_lower_high`
          : microBreak
            ? `${params.fastExecutionTimeframe}_micro_break`
            : "bearish_trigger_candle";
      stopReference = getRecentHigh([...recentFast, ...recentExecution]);
    }

    return {
      passed,
      canBeActive: passed,
      triggerType,
      label: passed
        ? `Execution trigger: ${reasons.slice(0, 3).join(" / ")}`
        : `Waiting for ${timeframeLabel} short trigger`,
      reasons: reasons.length > 0 ? reasons : [`No clean ${timeframeLabel} downside trigger yet.`],
      timeframe: timeframeLabel,
      entryReference,
      stopReference,
      scoreImpact: passed ? 7 : -12,
      fastExecutionCandles: fastCandles.length,
      executionCandles: executionCandles.length,
      oneMinuteCandles: fastCandles.length,
      threeMinuteCandles: executionCandles.length,
    };
  }

  const bullishFast = isBullishTriggerCandle(lastFast);
  const bullishExecution = isBullishTriggerCandle(lastExecution);
  const reclaim =
    Boolean(prevFast) &&
    lastFast.low < prevFast!.low &&
    lastFast.close > prevFast!.low &&
    lastFast.close > lastFast.open;
  const higherLowExecution =
    Boolean(lastExecution && prevExecution) &&
    lastExecution!.low >= prevExecution!.low * 0.9975 &&
    lastExecution!.close > prevExecution!.close;
  const microBreakout = priorHigh !== null && lastFast.close > priorHigh;

  if (reclaim) reasons.push(`${params.fastExecutionTimeframe} liquidity reclaim`);
  if (higherLowExecution) reasons.push(`${params.executionTimeframe} higher low confirmed`);
  if (bullishFast || bullishExecution) reasons.push(`bullish ${timeframeLabel} trigger candle`);
  if (microBreakout) reasons.push(`${params.fastExecutionTimeframe} micro-breakout`);
  if (volumeExpansion) reasons.push(`${params.fastExecutionTimeframe} volume expands on trigger`);

  const triggerCount = [
    reclaim,
    higherLowExecution,
    bullishFast || bullishExecution,
    microBreakout,
  ].filter(Boolean).length;
  const passed = triggerCount >= 1 && (volumeExpansion || triggerCount >= 2);

  if (passed) {
    triggerType = reclaim
      ? `${params.fastExecutionTimeframe}_liquidity_reclaim`
      : higherLowExecution
        ? `${params.executionTimeframe}_higher_low`
        : microBreakout
          ? `${params.fastExecutionTimeframe}_micro_breakout`
          : "bullish_trigger_candle";
    stopReference = getRecentLow([...recentFast, ...recentExecution]);
  }

  return {
    passed,
    canBeActive: passed,
    triggerType,
    label: passed
      ? `Execution trigger: ${reasons.slice(0, 3).join(" / ")}`
      : `Waiting for ${timeframeLabel} long trigger`,
    reasons: reasons.length > 0 ? reasons : [`No clean ${timeframeLabel} upside trigger yet.`],
    timeframe: timeframeLabel,
    entryReference,
    stopReference,
    scoreImpact: passed ? 7 : -12,
    fastExecutionCandles: fastCandles.length,
    executionCandles: executionCandles.length,
    oneMinuteCandles: fastCandles.length,
    threeMinuteCandles: executionCandles.length,
  };
}

function buildDirectionalTargets(params: {
  direction: SignalDirection;
  entry: number;
  risk: number;
  plan: SignalTradePlan;
}) {
  const structuralCandidates =
    params.direction === "downside"
      ? [
          params.plan.nearest_support?.price,
          params.plan.target_1,
          params.plan.target_2,
          params.plan.target_3,
        ]
          .filter((value): value is number => typeof value === "number" && value < params.entry)
          .sort((a, b) => b - a)
      : [
          params.plan.nearest_resistance?.price,
          params.plan.target_1,
          params.plan.target_2,
          params.plan.target_3,
        ]
          .filter((value): value is number => typeof value === "number" && value > params.entry)
          .sort((a, b) => a - b);

  const rewardRatio = (target: number) => {
    const reward =
      params.direction === "downside"
        ? params.entry - target
        : target - params.entry;

    return reward > 0 && params.risk > 0 ? reward / params.risk : 0;
  };

  const pickTarget = (minimumR: number) =>
    structuralCandidates.find((target) => rewardRatio(target) >= minimumR) ?? null;

  return [
    pickTarget(2),
    pickTarget(3),
    pickTarget(4),
  ].map((target) => roundPrice(target));
}

function applyExecutionTriggerToTradePlan(params: {
  direction: SignalDirection;
  assetType: "stock" | "crypto";
  plan: SignalTradePlan;
  trigger: ExecutionTriggerCheck;
  price: number | null;
}) : SignalTradePlan {
  if (!params.trigger.passed || params.trigger.entryReference === null || params.trigger.stopReference === null) {
    return params.plan;
  }

  const entry = params.price && params.price > 0 ? params.price : params.trigger.entryReference;
  const entryBandPct = params.assetType === "crypto" ? 0.0018 : 0.003;
  const stopBufferPct = params.assetType === "crypto" ? 0.0018 : 0.0035;
  const entryMin = entry * (1 - entryBandPct);
  const entryMax = entry * (1 + entryBandPct);
  const entryMid = (entryMin + entryMax) / 2;
  const rawStop =
    params.direction === "downside"
      ? Math.max(params.trigger.stopReference, entryMid) * (1 + stopBufferPct)
      : Math.min(params.trigger.stopReference, entryMid) * (1 - stopBufferPct);
  const risk = Math.abs(rawStop - entryMid);
  const targets = buildDirectionalTargets({
    direction: params.direction,
    entry: entryMid,
    risk,
    plan: params.plan,
  });

  const target1 = targets[0] ?? null;
  const target2 = targets[1] ?? null;
  const target3 = targets[2] ?? null;

  return {
    ...params.plan,
    trigger_label: params.trigger.label,
    entry_zone_min: roundPrice(Math.min(entryMin, entryMax)),
    entry_zone_max: roundPrice(Math.max(entryMin, entryMax)),
    stop_price: roundPrice(rawStop),
    target_1: target1,
    target_2: target2,
    target_3: target3,
    invalidation:
      params.direction === "downside"
        ? `Invalid if price reclaims and holds above the ${params.trigger.timeframe} trigger high (${roundPrice(params.trigger.stopReference)}).`
        : `Invalid if price loses and holds below the ${params.trigger.timeframe} trigger low (${roundPrice(params.trigger.stopReference)}).`,
    management_plan:
      params.direction === "downside"
        ? "Enter only while price remains near the trigger zone. Cover partial at TP1, then trail above lower highs. Do not chase after TP1 is almost reached."
        : "Enter only while price remains near the trigger zone. Take partial at TP1, then trail under higher lows. Do not chase after TP1 is almost reached.",
    risk_reward_ratio: calculateDraftRiskReward({
      direction: params.direction,
      entryMin: roundPrice(Math.min(entryMin, entryMax)),
      entryMax: roundPrice(Math.max(entryMin, entryMax)),
      stop: roundPrice(rawStop),
      target: target1,
    }),
  };
}

function validateEntryWindow(params: {
  price: number | null;
  direction: SignalDirection;
  plan: SignalTradePlan;
  assetType: "stock" | "crypto";
}): EntryWindowCheck {
  const entry = getTradePlanEntryMid(params.plan);

  if (params.price === null || entry === null) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: false,
      reason: "Missing live price or entry zone.",
      distancePct: null,
      progressToTp1: null,
    };
  }

  const maxDistancePct =
    params.assetType === "crypto"
      ? readEnvNumber("SIGNAL_ACTIVE_MAX_ENTRY_DISTANCE_PCT_CRYPTO", 0.006)
      : readEnvNumber("SIGNAL_ACTIVE_MAX_ENTRY_DISTANCE_PCT_STOCK", 0.008);
  const distancePct = Math.abs(params.price - entry) / entry;

  if (distancePct > maxDistancePct) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: false,
      reason: `Price is ${(distancePct * 100).toFixed(2)}% away from entry zone; wait for a cleaner pullback/retest.`,
      distancePct,
      progressToTp1: null,
    };
  }

  const target1 = params.plan.target_1;
  if (target1 === null || !Number.isFinite(target1)) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: false,
      reason: "Missing TP1 for entry-window validation.",
      distancePct,
      progressToTp1: null,
    };
  }

  const totalMoveToTp1 = Math.abs(target1 - entry);
  const currentProgress = Math.abs(params.price - entry);
  const progressToTp1 = totalMoveToTp1 > 0 ? currentProgress / totalMoveToTp1 : null;

  if (params.direction === "upside" && params.price >= target1) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: true,
      reason: "TP1 was already reached before alert delivery.",
      distancePct,
      progressToTp1,
    };
  }

  if (params.direction === "downside" && params.price <= target1) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: true,
      reason: "TP1 was already reached before alert delivery.",
      distancePct,
      progressToTp1,
    };
  }

  if (progressToTp1 !== null && progressToTp1 > 0.45) {
    return {
      passed: false,
      canBeActive: false,
      shouldBlock: false,
      reason: `Move is already ${(progressToTp1 * 100).toFixed(0)}% of the way to TP1; downgrade to armed/watch instead of active.`,
      distancePct,
      progressToTp1,
    };
  }

  return {
    passed: true,
    canBeActive: true,
    shouldBlock: false,
    reason: "Entry window is still valid.",
    distancePct,
    progressToTp1,
  };
}

function getEngineAlertType(params: {
  assetType: "stock" | "crypto";
  direction: "upside" | "downside";
  catalyst: string | null;
  socialScore: number;
  mentions24h: number;
}): AlertType {
  if (params.assetType === "crypto") return "crypto_momentum";
  if (params.catalyst) return "news_catalyst";
  if (params.socialScore >= 70 && params.mentions24h >= 10) {
    return "social_spike";
  }

  return params.direction === "downside" ? "dump" : "pump";
}

function isAllowedCryptoSignalSetupSlug(slug: string) {
  return [
    "crypto_liquidity_sweep_reclaim_long",
    "crypto_liquidity_sweep_rejection_short",
    "crypto_trend_pullback_continuation",
    "crypto_range_deviation_reversal",
  ].includes(slug);
}

function includesCryptoSignalText(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function includesStockSignalText(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

type StockTrendContinuationPullbackContext = {
  isCandidate: boolean;
  isEstablishedContinuation: boolean;
  directionAligned: boolean;
  trendBias: "upside" | "downside" | "neutral";
  trendStrength: number | null;
  trendState: string | null;
  vwapState: string | null;
  emaState: string | null;
  pullbackQualityScore: number | null;
  trendExhaustionScore: number | null;
  volumeAcceleration: number | null;
  rangeExpansion: number | null;
  reasons: string[];
};

function getStockTrendContinuationPullbackContext(params: {
  row: MarketScannerRow;
  direction: SignalDirection;
}): StockTrendContinuationPullbackContext {
  const trendBiasText = readStockWatchlistTechnicalText(params.row, [
    "trend_bias",
    "trendBias",
  ]);
  const trendState = readStockWatchlistTechnicalText(params.row, [
    "trend_state",
    "trendState",
  ]);
  const vwapState = readStockWatchlistTechnicalText(params.row, [
    "vwap_state",
    "vwapState",
  ]);
  const emaState = readStockWatchlistTechnicalText(params.row, [
    "ema_state",
    "emaState",
  ]);

  const trendBias = normalizeStockTechnicalTrendBias(trendBiasText || trendState);
  const trendStrength = readStockWatchlistTechnicalNumber(params.row, [
    "trend_strength",
    "trendStrength",
  ]);
  const pullbackQualityScore = readStockWatchlistTechnicalNumber(params.row, [
    "pullback_quality_score",
    "pullbackQualityScore",
  ]);
  const trendExhaustionScore = readStockWatchlistTechnicalNumber(params.row, [
    "trend_exhaustion_score",
    "trendExhaustionScore",
  ]);
  const volumeAcceleration = readStockWatchlistTechnicalNumber(params.row, [
    "volume_acceleration",
    "volumeAcceleration",
  ]);
  const rangeExpansion = readStockWatchlistTechnicalNumber(params.row, [
    "range_expansion",
    "rangeExpansion",
  ]);

  const minTrendStrength = readEnvNumber(
    "SIGNAL_STOCK_TREND_CONT_MIN_TREND_STRENGTH",
    72
  );
  const minPullbackQuality = readEnvNumber(
    "SIGNAL_STOCK_TREND_CONT_MIN_PULLBACK_QUALITY",
    60
  );
  const maxTrendExhaustion = readEnvNumber(
    "SIGNAL_STOCK_TREND_CONT_MAX_EXHAUSTION",
    76
  );
  const minVolumeAcceleration = readEnvNumber(
    "SIGNAL_STOCK_TREND_CONT_MIN_VOLUME_ACCELERATION",
    0.65
  );
  const maxRangeExpansion = readEnvNumber(
    "SIGNAL_STOCK_TREND_CONT_MAX_RANGE_EXPANSION",
    3.5
  );

  const trendStateLower = (trendState || "").toLowerCase();
  const vwapLower = (vwapState || "").toLowerCase();
  const emaLower = (emaState || "").toLowerCase();

  const directionAligned = trendBias === params.direction;
  const strongTrend =
    trendStrength !== null &&
    trendStrength >= minTrendStrength &&
    (trendStateLower.includes("trend") || trendStateLower.includes("strong"));
  const vwapAligned =
    !vwapState ||
    vwapLower === "unknown" ||
    vwapLower === "at_vwap" ||
    (params.direction === "upside"
      ? !vwapLower.includes("below")
      : !vwapLower.includes("above"));
  const emaAligned =
    !emaState ||
    emaLower === "mixed" ||
    (params.direction === "upside"
      ? !emaLower.includes("bearish")
      : !emaLower.includes("bullish"));
  const pullbackOk =
    pullbackQualityScore !== null && pullbackQualityScore >= minPullbackQuality;
  const exhaustionOk =
    trendExhaustionScore === null || trendExhaustionScore <= maxTrendExhaustion;
  const volumeOk =
    volumeAcceleration === null || volumeAcceleration >= minVolumeAcceleration;
  const rangeOk = rangeExpansion === null || rangeExpansion <= maxRangeExpansion;

  const reasons = [
    `trend=${trendBias}${trendStrength !== null ? `/${trendStrength}` : ""}`,
    `state=${trendState || "unknown"}`,
    `vwap=${vwapState || "unknown"}`,
    `ema=${emaState || "unknown"}`,
    `pullback=${pullbackQualityScore ?? "unknown"}`,
    `exhaustion=${trendExhaustionScore ?? "unknown"}`,
    `volumeAcceleration=${volumeAcceleration ?? "unknown"}`,
    `rangeExpansion=${rangeExpansion ?? "unknown"}`,
  ];

  const isEstablishedContinuation =
    directionAligned &&
    strongTrend &&
    vwapAligned &&
    emaAligned &&
    pullbackOk &&
    exhaustionOk &&
    volumeOk &&
    rangeOk;

  return {
    isCandidate: isEstablishedContinuation,
    isEstablishedContinuation,
    directionAligned,
    trendBias,
    trendStrength,
    trendState,
    vwapState,
    emaState,
    pullbackQualityScore,
    trendExhaustionScore,
    volumeAcceleration,
    rangeExpansion,
    reasons,
  };
}

function inferStockSignalSetupSlugForRow(params: {
  row: MarketScannerRow;
  direction: SignalDirection;
  changePercent: number;
  catalyst: string | null;
  priceActionPatterns: SkillEdgePriceActionPatternAnalysis;
}) {
  const rawDataText = params.row.raw_data
    ? JSON.stringify(params.row.raw_data).slice(0, 2500)
    : "";

  const vwapState = (
    readStockWatchlistTechnicalText(params.row, ["vwap_state", "vwapState"]) || ""
  ).toLowerCase();

  const trendBias = (
    readStockWatchlistTechnicalText(params.row, ["trend_bias", "trendBias"]) || ""
  ).toLowerCase();

  const trendState = (
    readStockWatchlistTechnicalText(params.row, ["trend_state", "trendState"]) || ""
  ).toLowerCase();

  const emaState = (
    readStockWatchlistTechnicalText(params.row, ["ema_state", "emaState"]) || ""
  ).toLowerCase();

  const price = firstFiniteSignalNumber(
    readStockWatchlistTechnicalNumber(params.row, ["price", "currentPrice", "lastPrice"]),
    params.row.price
  );

  const openingRangeHigh = readStockWatchlistTechnicalNumber(params.row, [
    "opening_range_high",
    "openingRangeHigh",
  ]);
  const openingRangeLow = readStockWatchlistTechnicalNumber(params.row, [
    "opening_range_low",
    "openingRangeLow",
  ]);
  const sessionHigh = readStockWatchlistTechnicalNumber(params.row, [
    "session_high",
    "sessionHigh",
  ]);
  const sessionLow = readStockWatchlistTechnicalNumber(params.row, [
    "session_low",
    "sessionLow",
  ]);
  const premarketHigh = readStockWatchlistTechnicalNumber(params.row, [
    "premarket_high",
    "premarketHigh",
  ]);
  const premarketLow = readStockWatchlistTechnicalNumber(params.row, [
    "premarket_low",
    "premarketLow",
  ]);
  const vwapDistancePct = readStockWatchlistTechnicalNumber(params.row, [
    "vwap_distance_pct",
    "vwapDistancePct",
  ]);
  const rangeExpansion = readStockWatchlistTechnicalNumber(params.row, [
    "range_expansion",
    "rangeExpansion",
  ]);
  const trendStrength = readStockWatchlistTechnicalNumber(params.row, [
    "trend_strength",
    "trendStrength",
  ]);
  const pullbackQualityScore = readStockWatchlistTechnicalNumber(params.row, [
    "pullback_quality_score",
    "pullbackQualityScore",
  ]);
  const trendExhaustionScore = readStockWatchlistTechnicalNumber(params.row, [
    "trend_exhaustion_score",
    "trendExhaustionScore",
  ]);
  const volumeAcceleration = readStockWatchlistTechnicalNumber(params.row, [
    "volume_acceleration",
    "volumeAcceleration",
  ]);

  const text = [
    params.row.scan_bucket,
    params.row.direction_bias,
    params.row.catalyst,
    params.row.risk_label,
    params.row.source,
    vwapState,
    trendBias,
    trendState,
    emaState,
    params.priceActionPatterns.topPatternNames.join(" "),
    params.priceActionPatterns.patternTags.join(" "),
    params.priceActionPatterns.notes.join(" "),
    rawDataText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const catalystText = [params.catalyst, params.row.catalyst, rawDataText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasRealCatalyst =
    includesStockSignalText(catalystText, [
      "earnings",
      "eps",
      "guidance",
      "revenue",
      "fda",
      "approval",
      "analyst",
      "upgrade",
      "downgrade",
      "contract",
      "merger",
      "acquisition",
      "partnership",
      "offering",
      "sec filing",
      "phase",
      "trial",
      "patent",
      "buyout",
    ]) &&
    !includesStockSignalText(catalystText, [
      "unusual volume",
      "top gainer",
      "top loser",
      "most active",
      "mover",
      "market data",
      "watch radar",
    ]);

  const hasExplicitFailedHigh =
    includesStockSignalText(text, [
      "gap crap",
      "gap and crap",
      "failed premarket",
      "failed pmh",
      "pmh fail",
      "premarket high fail",
      "hod fail",
      "failed high",
      "failed breakout",
      "failed break out",
      "stuffed",
      "stuff",
      "lower high after pump",
      "lower high",
      "trap breakout",
      "bull trap",
    ]);

  const hasVwapContext =
    includesStockSignalText(text, [
      "vwap",
      "reclaim",
      "lost vwap",
      "under vwap",
      "above vwap",
      "below vwap",
      "vwap rejection",
      "vwap reject",
      "vwap reclaim",
    ]) ||
    vwapState.includes("vwap") ||
    vwapState.includes("below") ||
    vwapState.includes("above") ||
    vwapState.includes("reject") ||
    vwapState.includes("reclaim") ||
    vwapDistancePct !== null;

  const hasOpeningRangeContext =
    includesStockSignalText(text, [
      "opening range",
      "orb",
      "orbd",
      "range breakout",
      "range breakdown",
      "open high",
      "open low",
      "hod break",
      "lod break",
      "opening drive",
    ]) ||
    openingRangeHigh !== null ||
    openingRangeLow !== null;

  const isBreakingOpeningRange =
    price !== null &&
    ((params.direction === "upside" &&
      openingRangeHigh !== null &&
      price >= openingRangeHigh * 0.997) ||
      (params.direction === "downside" &&
        openingRangeLow !== null &&
        price <= openingRangeLow * 1.003));

  const isTestingVwapDecision =
    hasVwapContext ||
    (params.direction === "downside" &&
      (vwapState.includes("below") ||
        vwapState.includes("lost") ||
        vwapState.includes("reject") ||
        emaState.includes("bearish"))) ||
    (params.direction === "upside" &&
      (vwapState.includes("above") ||
        vwapState.includes("reclaim") ||
        emaState.includes("bullish")));

  const strongUpsideExtension = params.changePercent >= 10;
  const strongDownsideMove = params.changePercent <= -5;
  const directionalMove = Math.abs(params.changePercent) >= 5;
  const veryExtendedMove =
    Math.abs(params.changePercent) >= 14 ||
    (rangeExpansion !== null && rangeExpansion >= 3.5) ||
    (trendExhaustionScore !== null && trendExhaustionScore >= 75);

  const trendContinuationContext = getStockTrendContinuationPullbackContext({
    row: params.row,
    direction: params.direction,
  });

  const catalystContinuationContext =
    hasRealCatalyst &&
    params.direction === "upside" &&
    (pullbackQualityScore === null || pullbackQualityScore >= 45) &&
    (volumeAcceleration === null || volumeAcceleration >= 0.65) &&
    !veryExtendedMove;

  const trueGapAndCrapContext =
    params.direction === "downside" &&
    strongUpsideExtension &&
    hasExplicitFailedHigh &&
    (
      price === null ||
      premarketHigh === null ||
      price <= premarketHigh * 0.995 ||
      sessionHigh === null ||
      price <= sessionHigh * 0.995
    );

  // 1) Real continuation should not be mislabeled as Gap & Crap.
  if (
    trendContinuationContext.isCandidate &&
    (trendContinuationContext.isEstablishedContinuation || !hasExplicitFailedHigh)
  ) {
    return "stock_trend_continuation_pullback";
  }

  // 2) Real catalyst continuation gets its own setup before generic ORB/VWAP routing.
  if (catalystContinuationContext) {
    return "stock_news_continuation_pullback";
  }

  // 3) Opening range breakout/breakdown should not be hidden inside Gap & Crap.
  if (hasOpeningRangeContext && (isBreakingOpeningRange || !hasExplicitFailedHigh)) {
    return "stock_opening_range_breakout";
  }

  // 4) VWAP decision setups are separate from true failed-high Gap & Crap.
  if (isTestingVwapDecision && !trueGapAndCrapContext) {
    return "stock_vwap_reclaim_rejection";
  }

  // 5) Gap & Crap only when failed-high context is explicit.
  if (trueGapAndCrapContext) {
    return "stock_gap_crap_short";
  }

  // 6) Strong upside continuation without real catalyst = opening range / momentum radar.
  if (params.direction === "upside" && directionalMove) {
    return hasRealCatalyst
      ? "stock_news_continuation_pullback"
      : "stock_opening_range_breakout";
  }

  // 7) Downside defaults to VWAP/rejection decision, not Gap & Crap.
  if (params.direction === "downside" || strongDownsideMove) {
    return "stock_vwap_reclaim_rejection";
  }

  // 8) Neutral in-play default = VWAP decision-line radar.
  return "stock_vwap_reclaim_rejection";
}
function inferCryptoSignalSetupSlugForRow(params: {
  row: MarketScannerRow;
  direction: SignalDirection;
  changePercent: number;
  priceActionPatterns: SkillEdgePriceActionPatternAnalysis;
}) {
  const text = [
    params.row.scan_bucket,
    params.row.direction_bias,
    params.row.catalyst,
    params.row.risk_label,
    params.row.source,
    params.priceActionPatterns.topPatternNames.join(" "),
    params.priceActionPatterns.patternTags.join(" "),
    params.priceActionPatterns.notes.join(" "),
    params.row.raw_data ? JSON.stringify(params.row.raw_data).slice(0, 1500) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    includesCryptoSignalText(text, [
      "range deviation",
      "deviation reversal",
      "return inside range",
      "failed range breakout",
      "failed range breakdown",
      "range high",
      "range low",
    ])
  ) {
    return "crypto_range_deviation_reversal";
  }

  if (
    includesCryptoSignalText(text, [
      "trend pullback",
      "pullback continuation",
      "trendline pullback",
      "structure continuation",
      "controlled pullback",
      "trend continuation",
      "continuation",
      "pullback",
    ])
  ) {
    return "crypto_trend_pullback_continuation";
  }

  if (
    params.direction === "downside" ||
    params.changePercent < -3 ||
    includesCryptoSignalText(text, [
      "sweep high",
      "swept high",
      "buy-side sweep",
      "liquidity above",
      "sweep rejection",
      "rejection",
      "failed breakout",
      "lower high",
      "weakness",
      "breakdown",
      "short",
    ])
  ) {
    return "crypto_liquidity_sweep_rejection_short";
  }

  return "crypto_liquidity_sweep_reclaim_long";
}

async function buildAlertDraft(params: {
  row: MarketScannerRow;
  social:
    | {
        sources: string[];
        mentions24h: number;
        mentions1h: number;
        mentionVelocity: number;
        socialScore: number;
        sentiment: string;
      }
    | undefined;
  planId: string;
  stockSession?: StockSignalSessionState;
  onReject?: (event: {
    symbol: string;
    assetType: "stock" | "crypto";
    reason: string;
    details?: Record<string, unknown>;
  }) => void;
}): Promise<MarketAlertDraft | null> {
  const symbol = normalizeSymbol(params.row.symbol || "");
  if (!symbol) return null;

  const assetType = getAssetType(params.row);

  const cryptoMarketGate =
    assetType === "crypto"
    ? await validateCryptoSignalMarket(params.row, symbol)
    : null;

  if (cryptoMarketGate && !cryptoMarketGate.passed) {
    return null;
  }

  const price = toNumber(params.row.price, 0) || null;

  const rejectDraft = (reason: string, details: Record<string, unknown> = {}) => {
    params.onReject?.({
      symbol,
      assetType,
      reason,
      details,
    });

    return null;
  };

  if (assetType === "stock" && (price === null || price < 0.4 || price > 500)) {
    return rejectDraft("stock_price_gate_failed", {
      price,
      minPrice: 0.4,
      maxPrice: 500,
    });
  }

  const volumeGate = buildSignalVolumeGate(params.row, assetType);

  if (!volumeGate.passed) {
    return rejectDraft("volume_gate_failed", {
      tradedVolume: volumeGate.tradedVolume,
      requiredVolume: volumeGate.minVolume,
      label: volumeGate.label,
    });
  }
    
  const changePercent = toNumber(params.row.change_percent);
  const marketScore = toNumber(params.row.opportunity_score);
  const socialScore = params.social?.socialScore || 0;
  const mentions24h = params.social?.mentions24h || toNumber(params.row.mentions);
  const catalyst = params.row.catalyst || null;

  const preliminaryDirection: "upside" | "downside" =
    (params.row.direction_bias || "").toLowerCase().includes("down") ||
    (params.row.risk_label || "").toLowerCase().includes("short") ||
    (params.row.risk_label || "").toLowerCase().includes("fade") ||
    (params.row.risk_label || "").toLowerCase().includes("rejection") ||
    changePercent < 0
      ? "downside"
      : "upside";

  const existingCandles = extractCandlesFromScannerRow(params.row);
  const timeframeConfig = getSignalTimeframeConfig(assetType);

  const triggerCandlesResult =
    existingCandles.length > 0
      ? {
          candles: existingCandles,
          provider: "scanner_snapshot" as const,
          interval: asSkillEdgeCandleInterval(timeframeConfig.contextTimeframe),
          error: null,
        }
      : await fetchSignalCandlesForTimeframe({
          symbol,
          assetType,
          interval: timeframeConfig.contextTimeframe,
          limit: timeframeConfig.contextLimit,
        });

  const [{ fastExecutionCandlesResult, executionCandlesResult }, contextCandlesResult] =
    await Promise.all([
      loadSignalExecutionCandles({
        symbol,
        assetType,
        config: timeframeConfig,
      }),
      fetchSignalCandlesForTimeframe({
        symbol,
        assetType,
        interval: timeframeConfig.confirmationTimeframe,
        limit: timeframeConfig.confirmationLimit,
      }),
    ]);

  const structureCandles = triggerCandlesResult.candles;
  const fastExecutionCandles = fastExecutionCandlesResult.candles;
  const executionCandles = executionCandlesResult.candles;
  const contextCandles = contextCandlesResult.candles;
  const contextualDirection = inferSignalDirectionFromContext({
    row: params.row,
    changePercent,
    price,
    primaryContextCandles: structureCandles,
    confirmationContextCandles: contextCandles,
    primaryTimeframe: timeframeConfig.contextTimeframe,
    confirmationTimeframe: timeframeConfig.confirmationTimeframe,
  });
  const workingDirection: SignalDirection = contextualDirection ?? preliminaryDirection;
  const workingAlertType = getEngineAlertType({
    assetType,
    direction: workingDirection,
    catalyst,
    socialScore,
    mentions24h,
  });

  let tradePlan: SignalTradePlan = composeFinalTradePlan({
    direction: workingDirection,
    alertType: workingAlertType,
    candles: structureCandles,
    price,
    changePercent,
    assetType,
    catalyst,
  });

  const priceActionPatterns: SkillEdgePriceActionPatternAnalysis =
    analyzeSkillEdgePriceActionPatterns({
      candles: structureCandles,
      direction: workingDirection,
    });

  let riskRewardRatio: number | null = tradePlan.risk_reward_ratio;

  const rawText = [
    params.row.scan_bucket,
    params.row.direction_bias,
    params.row.catalyst,
    params.row.risk_label,
    params.row.source,
    volumeGate.label,
    params.social?.sources?.join(" "),
    priceActionPatterns.topPatternNames.join(" "),
    priceActionPatterns.patternTags.join(" "),
    priceActionPatterns.notes.join(" "),
    params.row.raw_data ? JSON.stringify(params.row.raw_data).slice(0, 1500) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const forcedCryptoSetupSlug =
    assetType === "crypto"
      ? inferCryptoSignalSetupSlugForRow({
          row: params.row,
          direction: workingDirection,
          changePercent,
          priceActionPatterns,
        })
      : null;

  const forcedStockSetupSlug =
    assetType === "stock"
      ? inferStockSignalSetupSlugForRow({
          row: params.row,
          direction: workingDirection,
          changePercent,
          catalyst,
          priceActionPatterns,
        })
      : null;

  const forcedSetupSlug = forcedCryptoSetupSlug ?? forcedStockSetupSlug;

  const engineSetupText = [
    rawText,
    forcedSetupSlug,
    forcedSetupSlug === "stock_trend_continuation_pullback"
      ? "stock trend continuation pullback: in-play ticker, established intraday trend, controlled pullback to VWAP/EMA/structure, continuation trigger required"
      : null,
    assetType === "crypto" ? "crypto_smc_ict_only" : "stocks_v1_intraday_only",
    assetType === "crypto" && catalyst ? `attention source: ${catalyst}` : null,
    assetType === "stock" && catalyst ? `stock catalyst: ${catalyst}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const engineAlert = buildSkillEdgeAlertFromCandidate({
    candidate: {
      symbol,
      name: params.row.name || symbol,
      exchange: params.row.exchange || null,
      assetType: assetType === "crypto" ? "crypto" : "stocks",
      marketType: assetType === "crypto" ? "crypto" : "stocks",
      setupSlug: forcedSetupSlug ?? undefined,
      setup_slug: forcedSetupSlug ?? undefined,
      playbook_slug: forcedSetupSlug ?? undefined,
      setupText: engineSetupText,
      reason: engineSetupText,
      directionBias: workingDirection,
      price,
      changePercent,
      priceChangePercent: changePercent,
      gapPercent: changePercent,
      volume: volumeGate.tradedVolume,
      mentions24h,
      mentions1h: params.social?.mentions1h || 0,
      mentionVelocity:
        params.social?.mentionVelocity || toNumber(params.row.mention_velocity),
      trackedAttentionScore: socialScore,
      socialScore,
      stocktwitsScore: params.social?.sources?.includes("stocktwits")
        ? socialScore
        : null,
      redditScore: params.social?.sources?.includes("reddit") ? socialScore : null,
      hasNewsCatalyst: assetType !== "crypto" && Boolean(catalyst),
      catalyst: assetType === "crypto" ? null : catalyst,
      catalystQuality: assetType === "crypto" ? null : catalyst ? 70 : null,
      marketScore,
      trendQuality: clamp((marketScore + priceActionPatterns.directionAlignmentScore) / 2),
      entryQuality:
        tradePlan.entry_zone_min && tradePlan.entry_zone_max
          ? clamp(66 + priceActionPatterns.scoreImpact)
          : 48,
      stopQuality: tradePlan.stop_price ? 72 : 42,
      targetRoomQuality: riskRewardRatio && riskRewardRatio >= 2 ? 76 : 45,
      spreadQuality: 70,
      liquidityQuality: volumeGate.passed ? 78 : 42,
      marketAlignment: 55,
      btcAlignment: assetType === "crypto" ? 55 : null,
      sectorAlignment: null,
      priceActionScore: priceActionPatterns.directionAlignmentScore,
      candlePatternScore: priceActionPatterns.candlePatternScore,
      chartPatternScore: priceActionPatterns.chartPatternScore,
      volumePatternScore: priceActionPatterns.volumePatternScore,
      riskRewardRatio,
      entry:
        tradePlan.entry_zone_min && tradePlan.entry_zone_max
          ? (tradePlan.entry_zone_min + tradePlan.entry_zone_max) / 2
          : null,
      stop: tradePlan.stop_price,
      target: tradePlan.target_3 || tradePlan.target_2 || tradePlan.target_1,
      vwap: tradePlan.vwap,
      atr: tradePlan.atr,
      nearestSupport: tradePlan.nearest_support?.price ?? null,
      nearestResistance: tradePlan.nearest_resistance?.price ?? null,
      structurePlanSource: tradePlan.source,
      structureNotes: tradePlan.structure_notes,
      missingStructureData: tradePlan.missing_structure_data,
      riskFlags: [
        ...(params.row.risk_label ? [params.row.risk_label] : []),
        ...(tradePlan.source === "fallback"
          ? ["Structure data is missing; fallback trade plan is active."]
          : []),
        ...priceActionPatterns.riskFlags,
      ],
    },
    profile: null,
  });

  const recoveredStockWatch =
    assetType === "stock" &&
    engineAlert.status === "rejected" &&
    tradePlan.source === "structure" &&
    volumeGate.passed &&
    structureCandles.length >= 10 &&
    riskRewardRatio !== null &&
    riskRewardRatio >= 2;

  if (engineAlert.status === "rejected" && !recoveredStockWatch) {
    return rejectDraft("engine_rejected_not_recovered", {
      engineStatus: engineAlert.status,
      setupSlug: engineAlert.globalSignal?.setup?.slug,
      setupName: engineAlert.globalSignal?.setup?.name,
      confidenceScore: engineAlert.globalSignal?.confidenceScore,
      rejectionReasons: engineAlert.globalSignal?.rejectionReasons,
      tradePlanSource: tradePlan.source,
      riskRewardRatio,
      volumePassed: volumeGate.passed,
      structureCandles: structureCandles.length,
      contextCandles: contextCandles.length,
      fastExecutionCandles: fastExecutionCandles.length,
      executionCandles: executionCandles.length,
      missingStructureData: tradePlan.missing_structure_data,
      recoveredStockWatch,
    });
  }

  let lifecycleStatus: MarketAlertDraft["status"] =
    recoveredStockWatch
      ? "watch"
      : engineAlert.status === "alert"
        ? "active"
        : engineAlert.status === "armed"
          ? "armed"
          : "watch";

  const globalSignal = engineAlert.globalSignal;
  const setup = globalSignal.setup;

  if (assetType === "crypto" && !isAllowedCryptoSignalSetupSlug(setup.slug)) {
    return null;
  }

  const explanation = engineAlert.explanation;
  let finalDirection = globalSignal.direction;
  if (finalDirection !== "upside" && finalDirection !== "downside") {
    return rejectDraft("invalid_final_direction", {
      finalDirection,
      contextualDirection,
      workingDirection,
    });
  }
  const engineDirectionBeforeContextOverride = finalDirection;

  if (
    shouldOverrideDirectionWithContext({
      contextualDirection,
      engineDirection: finalDirection,
      setupName: setup.name,
      setupSlug: setup.slug,
      changePercent,
    })
  ) {
    finalDirection = contextualDirection!;
  }

  const alertType = getEngineAlertType({
    assetType,
    direction: finalDirection,
    catalyst,
    socialScore,
    mentions24h,
  });

  if (finalDirection !== workingDirection) {
    tradePlan = composeFinalTradePlan({
      direction: finalDirection,
      alertType,
      candles: structureCandles,
      price,
      changePercent,
      assetType,
      catalyst,
    });

    riskRewardRatio = tradePlan.risk_reward_ratio;
  }

  const setupContext = evaluateSetupContext({
    direction: finalDirection,
    primaryContextCandles: structureCandles,
    confirmationContextCandles: contextCandles,
    primaryTimeframe: timeframeConfig.contextTimeframe,
    confirmationTimeframe: timeframeConfig.confirmationTimeframe,
    executionLabel: timeframeConfig.executionLabel,
  });

  const executionTrigger = buildExecutionTrigger({
    symbol,
    direction: finalDirection,
    fastExecutionCandles,
    executionCandles,
    fastExecutionTimeframe: timeframeConfig.fastExecutionTimeframe,
    executionTimeframe: timeframeConfig.executionTimeframe,
    price,
    assetType,
  });

  if (executionTrigger.passed) {
    tradePlan = applyExecutionTriggerToTradePlan({
      direction: finalDirection,
      assetType,
      plan: tradePlan,
      trigger: executionTrigger,
      price,
    });

    riskRewardRatio = tradePlan.risk_reward_ratio;
  }

  const tradePlanSafety = validateDirectionalTradePlan({
    symbol,
    assetType,
    direction: finalDirection,
    plan: tradePlan,
  });

  if (!tradePlanSafety.passed) {
    return rejectDraft("trade_plan_safety_failed", {
      tradePlanSafety,
      tradePlanSource: tradePlan.source,
      entryZoneMin: tradePlan.entry_zone_min,
      entryZoneMax: tradePlan.entry_zone_max,
      stopPrice: tradePlan.stop_price,
      target1: tradePlan.target_1,
      target2: tradePlan.target_2,
      target3: tradePlan.target_3,
      riskRewardRatio,
    });
  }

  const stockFallbackWatch =
    assetType === "stock" &&
    tradePlan.source === "fallback" &&
    volumeGate.passed &&
    riskRewardRatio !== null &&
    riskRewardRatio >= 2;

  if (tradePlan.source !== "structure" && !stockFallbackWatch) {
    return rejectDraft("trade_plan_not_structure", {
      tradePlanSource: tradePlan.source,
      structureCandles: structureCandles.length,
      contextCandles: contextCandles.length,
      fastExecutionCandles: fastExecutionCandles.length,
      executionCandles: executionCandles.length,
      triggerCandlesProvider: triggerCandlesResult.provider,
      triggerCandlesInterval: triggerCandlesResult.interval,
      triggerCandlesError: triggerCandlesResult.error,
      contextCandlesProvider: contextCandlesResult.provider,
      contextCandlesInterval: contextCandlesResult.interval,
      contextCandlesError: contextCandlesResult.error,
      missingStructureData: tradePlan.missing_structure_data,
      riskRewardRatio,
    });
  }

  const entryWindow = validateEntryWindow({
    price,
    direction: finalDirection,
    plan: tradePlan,
    assetType,
  });

  if (entryWindow.shouldBlock) {
    return rejectDraft("entry_window_blocked", {
      entryWindow,
      price,
      direction: finalDirection,
      entryZoneMin: tradePlan.entry_zone_min,
      entryZoneMax: tradePlan.entry_zone_max,
    });
  }

  const planEntryMid = getTradePlanEntryMid(tradePlan);
  const planRisk =
    planEntryMid !== null && tradePlan.stop_price !== null
      ? Math.abs(tradePlan.stop_price - planEntryMid)
      : null;

  const rrForPlanTarget = (target: number | null) => {
    if (planEntryMid === null || planRisk === null || planRisk <= 0 || target === null) {
      return null;
    }

    const reward =
      finalDirection === "upside"
        ? target - planEntryMid
        : planEntryMid - target;

    return reward > 0 ? reward / planRisk : 0;
  };

  const tp1R = rrForPlanTarget(tradePlan.target_1);

  const rawProgressToTp1 = entryWindow.progressToTp1;
  const normalizedProgressToTp1 =
    rawProgressToTp1 === null || !Number.isFinite(rawProgressToTp1)
      ? null
      : rawProgressToTp1 > 1.5
        ? rawProgressToTp1 / 100
        : rawProgressToTp1;

  // Real-market calibration:
  // If price has already travelled too far from entry toward TP1,
  // do not treat the alert as Telegram-quality. No late chasing.
  const stockNotLateChase =
    assetType !== "stock" ||
    normalizedProgressToTp1 === null ||
    normalizedProgressToTp1 <= 0.55;

  const stockEntryStillTradable =
    assetType !== "stock" || (!entryWindow.shouldBlock && stockNotLateChase);

  const stockQualityScore = Math.round(
    Math.max(0, Math.min(100, toNumber(params.row.opportunity_score) || 0))
  );
  const stockStrongMinScore = readEnvNumber("SIGNAL_STOCK_ARMED_MIN_SCORE", 80);
  const stockStrongConfidenceOk =
    assetType !== "stock" || stockQualityScore >= stockStrongMinScore;

  const stockTechnicalContext =
    assetType === "stock"
      ? evaluateStockTechnicalSignalContext({
          row: params.row,
          direction: finalDirection,
          sessionPhase: params.stockSession?.phase ?? null,
          setupSlug: setup.slug,
        })
      : null;

  const stockTechnicalArmedOk =
    assetType !== "stock" || (stockTechnicalContext?.armedOk ?? false);

  const stockLifecycleTechnicalRecord =
    assetType === "stock" ? getStockWatchlistTechnicalRecord(params.row) : null;
  const stockLifecycleDataCoverage: Record<string, unknown> = isRecord(
    stockLifecycleTechnicalRecord?.data_coverage
  )
    ? stockLifecycleTechnicalRecord.data_coverage
    : {};
  const stockLifecyclePriceFreshness: Record<string, unknown> = isRecord(
    stockLifecycleDataCoverage.priceFreshness
  )
    ? stockLifecycleDataCoverage.priceFreshness
    : isRecord(stockLifecycleTechnicalRecord?.priceFreshness)
      ? stockLifecycleTechnicalRecord.priceFreshness
      : {};
  const stockFreshPriceOk =
    assetType !== "stock" ||
    stockLifecyclePriceFreshness.safeForPremiumDelivery === true ||
    String(stockLifecyclePriceFreshness.safeForPremiumDelivery || "").toLowerCase() === "true";

  const stockExecutionMode =
    assetType !== "stock"
      ? "standard_crypto_flow"
      : entryWindow.shouldBlock
        ? "skip_invalid_or_late"
        : !stockNotLateChase
          ? "skip_late_chase_wait_for_retest"
          : entryWindow.canBeActive
            ? "limit_or_execute_only_inside_entry_zone"
            : "wait_for_entry_zone_retest";

  // Stocks v1 calibration:
  // Small/mid-cap intraday signals can be valid from execution structure
  // even when 15m/30m context is not perfectly clean.
  const stockExecutionOverride =
    assetType === "stock" &&
    executionTrigger.passed &&
    executionTrigger.canBeActive &&
    entryWindow.canBeActive &&
    stockEntryStillTradable &&
    stockStrongConfidenceOk &&
    stockTechnicalArmedOk &&
    tp1R !== null &&
    tp1R >= 2.1;

  const stockContextAcceptable =
    assetType !== "stock" || setupContext.canBeActive || stockExecutionOverride;

  // Real-market calibration:
  // ARMED/Telegram should not become a noisy scanner feed.
  // Keep weaker ideas on the Signals page as WATCH.

  const tp2R = rrForPlanTarget(tradePlan.target_2);
  const tp3R = rrForPlanTarget(tradePlan.target_3);

  if (assetType === "stock" && tradePlan.source === "fallback") {
    lifecycleStatus = "watch";
  }
  const hasFullTargetStack =
    tp1R !== null &&
    tp1R >= 2 &&
    tp2R !== null &&
    tp2R >= 3 &&
    tp3R !== null &&
    tp3R >= 4;

  if (
    lifecycleStatus === "active" &&
    (!executionTrigger.canBeActive || !entryWindow.canBeActive || !setupContext.canBeActive)
  ) {
    lifecycleStatus = "armed";
  }

  let stockStrongArmedCandidate = false;
  let stockPreparedArmedCandidate = false;

  if (assetType === "stock") {
    const hasTp1TargetRoom = tp1R !== null && tp1R >= 2;
    const preparedArmedMinEngineConfidence = readEnvNumber(
      "SIGNAL_STOCK_PREPARED_ARMED_MIN_ENGINE_CONFIDENCE",
      95
    );
    const preparedArmedMinTp1R = readEnvNumber(
      "SIGNAL_STOCK_PREPARED_ARMED_MIN_TP1_R",
      2.5
    );
    const preparedArmedMaxEntryDistancePct = readEnvNumber(
      "SIGNAL_STOCK_PREPARED_ARMED_MAX_ENTRY_DISTANCE_PCT",
      0.35
    );
    const preparedEntryDistanceOk =
      entryWindow.distancePct === null ||
      entryWindow.distancePct <= preparedArmedMaxEntryDistancePct;
    const enginePreparedOk =
      globalSignal.shouldAlert === true &&
      globalSignal.confidenceScore >= preparedArmedMinEngineConfidence &&
      (globalSignal.rejectionReasons?.length ?? 0) === 0;

    stockStrongArmedCandidate =
      tradePlan.source === "structure" &&
      !stockFallbackWatch &&
      executionTrigger.passed &&
      executionTrigger.canBeActive &&
      stockContextAcceptable &&
      stockStrongConfidenceOk &&
      stockTechnicalArmedOk &&
      hasTp1TargetRoom &&
      stockEntryStillTradable &&
      stockFreshPriceOk;

    stockPreparedArmedCandidate =
      tradePlan.source === "structure" &&
      !stockFallbackWatch &&
      !entryWindow.shouldBlock &&
      stockEntryStillTradable &&
      stockFreshPriceOk &&
      stockStrongConfidenceOk &&
      stockTechnicalArmedOk &&
      stockContextAcceptable &&
      enginePreparedOk &&
      preparedEntryDistanceOk &&
      tp1R !== null &&
      tp1R >= preparedArmedMinTp1R;

    // Stocks v1:
    // WATCH = in-play/setup forming/radar.
    // ARMED = strong structure + trade plan ready + fresh price + TP1 room.
    // ACTIVE = final 1m/3m execution trigger confirmed; still disabled for stocks until live trigger layer is finalized.
    if (stockStrongArmedCandidate || stockPreparedArmedCandidate) {
      lifecycleStatus = "armed";
    } else if (hasTp1TargetRoom && !entryWindow.shouldBlock) {
      lifecycleStatus = "watch";
    } else {
      return rejectDraft("stock_lifecycle_gate_failed", {
        hasTp1TargetRoom,
        tp1R,
        setupContext,
        entryWindow,
        executionTriggerPassed: executionTrigger.passed,
        executionTriggerCanBeActive: executionTrigger.canBeActive,
        tradePlanSource: tradePlan.source,
        stockFallbackWatch,
        riskRewardRatio,
        stockTechnicalContext,
      });
    }
  }
  if (assetType === "crypto") {
    const hasTp1TargetRoom = tp1R !== null && tp1R >= 2;
    const maxArmedEntryDistancePct = readEnvNumber(
      "SIGNAL_CRYPTO_ARMED_MAX_ENTRY_DISTANCE_PCT",
      0.015
    );

    const nearEnoughForArmed =
      entryWindow.distancePct === null ||
      entryWindow.distancePct <= maxArmedEntryDistancePct;

    const cryptoStructureUsable =
      tradePlan.source === "structure" &&
      (setupContext.canBeActive ||
        setupContext.scoreImpact >= -2 ||
        priceActionPatterns.topPatternNames.length > 0);

    // Crypto v1:
    // ACTIVE = trigger fired + price in entry zone + structure valid + full 2R/3R/4R stack.
    // ARMED = structure + TP1 >= 2R + price close enough to entry, but not fully triggered.
    // WATCH = candidate/setup is forming, not Telegram-ready.
    if (
      tradePlan.source === "structure" &&
      executionTrigger.passed &&
      entryWindow.canBeActive &&
      setupContext.canBeActive &&
      hasFullTargetStack &&
      cryptoStructureUsable
    ) {
      lifecycleStatus = "active";
    } else if (
      tradePlan.source === "structure" &&
      hasTp1TargetRoom &&
      nearEnoughForArmed &&
      cryptoStructureUsable
    ) {
      lifecycleStatus = "armed";
    } else {
      lifecycleStatus = "watch";
    }
  }

  if (assetType === "stock" && params.stockSession?.phase === "off_hours") {
    lifecycleStatus = "watch";
  }

  if (assetType === "stock" && params.stockSession?.phase === "locked_execution") {
    const lockedArmedMinScore = readEnvNumber(
      "SIGNAL_STOCK_LOCKED_ARMED_MIN_SCORE",
      84
    );

    const lockedArmedMinTp1R = readEnvNumber(
      "SIGNAL_STOCK_LOCKED_MIN_TP1_R",
      2.5
    );

    const lockedDisplayScorePreview = capSignalScoreForLifecycle(
      globalSignal.confidenceScore +
      executionTrigger.scoreImpact +
      setupContext.scoreImpact +
      (stockTechnicalContext?.scoreImpact ?? 0),
      lifecycleStatus
    );

    const lockedArmedOk =
      lifecycleStatus !== "armed" ||
      (stockStrongArmedCandidate &&
        executionTrigger.passed &&
        executionTrigger.canBeActive &&
        !entryWindow.shouldBlock &&
        tp1R !== null &&
        tp1R >= lockedArmedMinTp1R &&
        lockedDisplayScorePreview >= lockedArmedMinScore &&
        (stockTechnicalContext?.lockedArmedOk ?? false)) ||
      (stockPreparedArmedCandidate &&
        !entryWindow.shouldBlock &&
        stockFreshPriceOk &&
        stockEntryStillTradable &&
        stockStrongConfidenceOk &&
        stockTechnicalArmedOk &&
        tp1R !== null &&
        tp1R >= lockedArmedMinTp1R &&
        lockedDisplayScorePreview >= lockedArmedMinScore);

    if (!lockedArmedOk) {
      lifecycleStatus = "watch";
    }
  }

  const displayConfidenceScore = capSignalScoreForLifecycle(
    globalSignal.confidenceScore +
      executionTrigger.scoreImpact +
      setupContext.scoreImpact +
      (stockTechnicalContext?.scoreImpact ?? 0),
    lifecycleStatus
  );
  const displayConfidenceTier = getConfidenceTierFromScore(displayConfidenceScore);

  const hourlyKey = new Date().toISOString().slice(0, 13);

  const moveLabel =
    changePercent > 0
      ? `+${changePercent.toFixed(2)}%`
      : `${changePercent.toFixed(2)}%`;

  const reasonParts = [
    `${setup.name}`,
    `move ${moveLabel}`,
    `confidence ${displayConfidenceScore}`,
    `status ${lifecycleStatus}`,
  ];
  reasonParts.push(`volume trigger confirmed: ${volumeGate.label}`);
  if (contextualDirection) {
    reasonParts.push(`context direction bias: ${contextualDirection}`);
  }
  if (engineDirectionBeforeContextOverride !== finalDirection) {
    reasonParts.push(`direction corrected from ${engineDirectionBeforeContextOverride} to ${finalDirection} by ${timeframeConfig.contextTimeframe}/${timeframeConfig.confirmationTimeframe} context`);
  }
  reasonParts.push(executionTrigger.passed ? executionTrigger.label : `${timeframeConfig.executionLabel}: waiting for confirmation`);
  reasonParts.push(setupContext.label);
  if (!entryWindow.passed) reasonParts.push(entryWindow.reason);

  if (riskRewardRatio) {
    reasonParts.push(`planned RR ${riskRewardRatio}R`);
  }

  reasonParts.push("target policy: TP1 >= 2R is required; ARMED means structure, entry zone, trigger and risk model are aligned");

  if (recoveredStockWatch) {
    reasonParts.push("stock watch recovery: volume + structure + TP1 >= 2R passed, but final 5m confirmation is still required");
  }
  if (assetType === "crypto") {
    reasonParts.push("crypto mode: SMC/ICT only, catalyst/trending is attention not setup");
  }

  if (assetType === "stock" && tradePlan.source === "fallback") {
    reasonParts.push("stock watch radar: in-play volume detected, but structure candles/levels are missing; waiting for real 15m setup + 5m confirmation before Telegram");
  }

  if (priceActionPatterns.topPatternNames.length > 0) {
    reasonParts.push(`patterns: ${priceActionPatterns.topPatternNames.slice(0, 3).join(", ")}`);
  }

if (tradePlan.source === "structure") {
  reasonParts.push("structure-based plan");
} else {
  reasonParts.push("fallback plan");
}
  
  if (mentions24h > 0) {
    reasonParts.push(`tracked mentions ${mentions24h}/24H`);
  }

  if (params.social?.sources?.length) {
    reasonParts.push(`sources: ${params.social.sources.join(", ")}`);
  }

  if (catalyst) {
    reasonParts.push(`in-play catalyst: ${catalyst}`);
  }

  const primaryRisk =
    engineAlert.clientSummary.primaryRisk ||
    setup.riskWarnings[0] ||
    "Trade only after confirmation and valid risk/reward.";

  const scenario = [
    `Setup: ${setup.name}.`,
    `Direction: ${finalDirection}.`,
    `Wait for confirmation: ${setup.checklist.slice(0, 3).join(" / ")}.`,
    `Invalidation: ${tradePlan.invalidation}`,
  ].join(" ");

  return {
    alert_key: `${setup.slug}:${symbol}:${hourlyKey}`,
    user_id: null,
    plan_id: params.planId,
    alert_scope: "global",
    symbol,
    name: params.row.name || symbol,
    exchange: params.row.exchange || null,
    asset_type: assetType,
    alert_type: alertType,
    direction: finalDirection,
    score: displayConfidenceScore,
    title: `${symbol} — ${setup.name}`,
    reason: reasonParts.join(" · "),
    risk_note: primaryRisk,
    scenario,
    setup_type: setup.name,
    created_at: new Date().toISOString(),
    setup_timeframe: timeframeConfig.setupTimeframeLabel,
    confirmation_timeframe: timeframeConfig.confirmationTimeframeLabel,
    confidence_tier: displayConfidenceTier,
    why_signal_fired:
      [
        explanation.whySignalFired.length > 0
          ? explanation.whySignalFired.join(" · ")
          : engineAlert.clientSummary.primaryReason,
        priceActionPatterns.topPatternNames.length > 0
          ? `Price action: ${priceActionPatterns.topPatternNames.slice(0, 4).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
        confirmation_checklist: [
      `Volume gate: ${volumeGate.label}`,
      executionTrigger.passed
        ? `Execution trigger: ${executionTrigger.label}`
        : `Execution trigger: wait for ${timeframeConfig.executionLabel} confirmation before entry`,
      `Context: ${setupContext.label}`,
      `Entry window: ${entryWindow.reason}`,
      ...setup.checklist,
      ...priceActionPatterns.notes.slice(0, 3).map((note: string) => `Pattern check: ${note}`),
    ].slice(0, 8),
    avoid_if: setup.avoidIf,
    lesson_summary: setup.educationNote,
    playbook_status: "training_layer",
    setup_slug: setup.slug,
    setup_name: setup.name,
    setup_description: setup.description,
    setup_confirmation: setup.confirmationConditions.join(" "),
    setup_common_mistake:
      setup.riskWarnings[0] ||
      setup.avoidIf[0] ||
      "Entering before confirmation or after risk/reward is gone.",
    trigger_label: tradePlan.trigger_label,
    entry_zone_min: tradePlan.entry_zone_min,
    entry_zone_max: tradePlan.entry_zone_max,
    stop_price: tradePlan.stop_price,
    target_1: tradePlan.target_1,
    target_2: dedupeSignalTarget(tradePlan.target_2, [tradePlan.target_1]),
    target_3: dedupeSignalTarget(tradePlan.target_3, [
      tradePlan.target_1,
      tradePlan.target_2,
    ]),
    invalidation: tradePlan.invalidation,
    management_plan: tradePlan.management_plan,
    confidence_score: displayConfidenceScore,
    timeframe: assetType === "crypto" ? "intraday / crypto 24-7" : "intraday",
    is_new: true,
    outcome_status: "pending",
    status: lifecycleStatus,
    source_data: {
      market: params.row,
      stockSession:
        assetType === "stock"
          ? {
              phase: params.stockSession?.phase ?? "unknown",
              timezone: params.stockSession?.timezone ?? "Europe/Kyiv",
              kyivDate: params.stockSession?.kyivDate ?? null,
              kyivTime: params.stockSession?.kyivTime ?? null,
              canDiscoverNewStocks:
                params.stockSession?.canDiscoverNewStocks ?? false,
              lockedWatchlistOnly:
                params.stockSession?.lockedWatchlistOnly ?? false,
              mode: params.stockSession?.lockedWatchlistOnly
                ? "locked_watchlist_execution"
                : params.stockSession?.canDiscoverNewStocks
                  ? "discovery_watchlist_building"
                  : "off_hours",
              watchlistStorage: "market_signal_watchlist_v1",
            }
          : null,
      cryptoSignalVenue: cryptoMarketGate?.venue ?? null,
      cryptoMarketGate,
      volumeGate,
      contextualDirection,
      engineDirectionBeforeContextOverride,
      finalDirection,
      tradePlanSafety,
      executionTrigger,
      setupContext,
      entryWindow,
      qualityV2: {
        lifecycleStatus,
        stockFallbackWatch: assetType === "stock" && tradePlan.source === "fallback",
        tp1R,
        tp2R,
        tp3R,
        hasFullTargetStack,
        entryZoneReason: tradePlan.trigger_label,
        stopPlacementReason: tradePlan.invalidation,
        targetReason:
          "Targets are selected from structure-first zones. TP1 must provide at least 2R before the idea can become ARMED/ACTIVE.",
        confirmationReason: executionTrigger.label,
        technicalGateReason: stockTechnicalContext?.label ?? null,
        whyNotActiveYet:
          lifecycleStatus === "watch"
            ? "Waiting for cleaner structure/entry proximity/5m confirmation."
            : lifecycleStatus === "armed"
              ? "Setup is prepared. Waiting for final 5m execution confirmation."
              : "Execution trigger confirmed.",
        telegramEligible:
          lifecycleStatus === "active" ||
          (lifecycleStatus === "armed" &&
            (assetType === "crypto" ||
              (assetType === "stock" &&
                (stockStrongArmedCandidate || stockPreparedArmedCandidate)))),
        telegramQualityGate: {
          stockStrongOnly:
            assetType !== "stock" || stockStrongArmedCandidate || stockPreparedArmedCandidate,
          stockPreparedArmedCandidate,
          stockStrongArmedCandidate,
          stockFreshPriceOk,
          executionTriggerPassed: executionTrigger.passed,
          executionTriggerCanBeActive: executionTrigger.canBeActive,
          setupContextCanBeActive: setupContext.canBeActive,
          stockExecutionOverride,
          stockContextAcceptable,
          stockStrongMinScore,
          stockStrongConfidenceOk,
          stockTechnicalArmedOk,
          stockTechnicalContext,
          score: stockQualityScore,
          entryWindowCanBeActive: entryWindow.canBeActive,
          entryWindowShouldBlock: entryWindow.shouldBlock,
          normalizedProgressToTp1,
          stockNotLateChase,
          stockEntryStillTradable,
          liveExecutionMode: stockExecutionMode,
          tp1R,
          stockFallbackWatch,
        },
      },
      targetPolicy: {
        minimumTp1R: 2,
        minimumTp2R: 3,
        minimumTp3R: 4,
        targetSource: "1H/4H structure-first zones, with 2R/3R/4R minimum filter",
      },
      social: params.social || null,
      priceActionPatterns,
    marketStructure: {
        source: tradePlan.source,
        candlesProvider: triggerCandlesResult.provider,
        candlesInterval: triggerCandlesResult.interval,
        candlesCount: structureCandles.length,
        candlesError: triggerCandlesResult.error,
        fastExecutionCandlesProvider: fastExecutionCandlesResult.provider,
        fastExecutionCandlesInterval: fastExecutionCandlesResult.interval,
        fastExecutionCandlesCount: fastExecutionCandles.length,
        fastExecutionCandlesError: fastExecutionCandlesResult.error,
        executionCandlesProvider: executionCandlesResult.provider,
        executionCandlesInterval: executionCandlesResult.interval,
        executionCandlesCount: executionCandles.length,
        executionCandlesError: executionCandlesResult.error,
        contextCandlesProvider: contextCandlesResult.provider,
        contextCandlesInterval: contextCandlesResult.interval,
        contextCandlesCount: contextCandles.length,
        contextCandlesError: contextCandlesResult.error,
        timeframeConfig,
        vwap: tradePlan.vwap,
        atr: tradePlan.atr,
        nearestSupport: tradePlan.nearest_support,
        nearestResistance: tradePlan.nearest_resistance,
        structureNotes: tradePlan.structure_notes,
        missingStructureData: tradePlan.missing_structure_data,
      },
      skillEdgeEngine: {
        status: engineAlert.status,
        recoveredStockWatch,
        setupSlug: setup.slug,
        setupName: setup.name,
        globalConfidence: globalSignal.confidenceScore,
        displayConfidence: displayConfidenceScore,
        tier: displayConfidenceTier,
        originalTier: globalSignal.confidenceTier,
        shouldAlert: globalSignal.shouldAlert,
        riskRewardRatio,
        reasons: globalSignal.reasons,
        riskNotes: globalSignal.riskNotes,
        rejectionReasons: globalSignal.rejectionReasons,
        personalOverlay: engineAlert.personalOverlay,
      },
    },
    expires_at: new Date(
      Date.now() +
        (lifecycleStatus === "active"
          ? 2 * 60 * 60 * 1000
          : lifecycleStatus === "armed"
            ? 90 * 60 * 1000
            : 60 * 60 * 1000)
    ).toISOString(),
  };
}

type AlertGenerationDiagnostics = {
  requestedAssetType: AlertAssetTypeFilter;
  marketWindowMinutes: number;
  socialWindowMinutes: number;
  recentMarketRowsLoaded: number;
  fallbackMarketRowsLoaded: number;
  marketRowsAfterDedup: number;
  marketRowsAfterAssetFilter: number;
  socialRowsLoaded: number;
  rawDraftsBuilt: number;
  draftsAfterLifecycleLimit: number;
  active: number;
  armed: number;
  watch: number;
  usedLatestMarketFallback: boolean;
  stockSessionPhase: StockSignalSessionPhase;
  stockSessionKyivDate: string;
  stockSessionKyivTime: string;
  stockSessionWatchlistLocked: boolean;
  stockSessionWatchlistSymbols: number;
  notes: string[];
};

function countDraftStatuses(drafts: MarketAlertDraft[]) {
  return {
    active: drafts.filter((draft) => draft.status === "active").length,
    armed: drafts.filter((draft) => draft.status === "armed").length,
    watch: drafts.filter((draft) => draft.status === "watch").length,
  };
}

async function loadRecentOrLatestMarketRows({
  marketSince,
  limit,
  assetTypeFilter,
}: {
  marketSince: string;
  limit: number;
  assetTypeFilter: AlertAssetTypeFilter;
}) {
  let recentQuery = supabaseAdmin
    .from("market_scanner_snapshots")
    .select("*")
    .gte("scanned_at", marketSince);

  if (assetTypeFilter !== "all") {
    recentQuery = recentQuery.eq("asset_type", assetTypeFilter);
  }

  const recentResult = await recentQuery
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (recentResult.error) {
    return {
      rows: [] as MarketScannerRow[],
      recentRowsLoaded: 0,
      fallbackRowsLoaded: 0,
      usedFallback: false,
      error: recentResult.error,
    };
  }

  const recentRows = (recentResult.data || []) as MarketScannerRow[];

  if (recentRows.length > 0) {
    return {
      rows: recentRows,
      recentRowsLoaded: recentRows.length,
      fallbackRowsLoaded: 0,
      usedFallback: false,
      error: null,
    };
  }

  let latestQuery = supabaseAdmin
  .from("market_scanner_snapshots")
  .select("*");

if (assetTypeFilter !== "all") {
  latestQuery = latestQuery.eq("asset_type", assetTypeFilter);
}

const latestResult = await latestQuery
  .order("scanned_at", { ascending: false })
  .order("opportunity_score", { ascending: false })
  .limit(limit);

  if (latestResult.error) {
    return {
      rows: [] as MarketScannerRow[],
      recentRowsLoaded: 0,
      fallbackRowsLoaded: 0,
      usedFallback: true,
      error: latestResult.error,
    };
  }

  const fallbackRows = (latestResult.data || []) as MarketScannerRow[];

  return {
    rows: fallbackRows,
    recentRowsLoaded: 0,
    fallbackRowsLoaded: fallbackRows.length,
    usedFallback: fallbackRows.length > 0,
    error: null,
  };
}


export type MarketAlertGenerationSource = "manual" | "cron" | "internal";

export type MarketAlertGenerationResult = {
  source: string;
  generatedAt: string;
  assetType: AlertAssetTypeFilter;
  count: number;
  diagnostics: AlertGenerationDiagnostics;
  metrics: ReturnType<typeof buildAlertResponseMetrics>;
  sourceCoverage: string[];
  cache: {
    ttl: number;
    cachedAt: string;
  };
  items: MarketAlertDraft[];
};

export async function generateMarketAlertsInternal(params: {
  assetType?: AlertAssetTypeFilter;
  planId?: string;
  source?: MarketAlertGenerationSource;
}): Promise<MarketAlertGenerationResult> {
  const assetTypeFilter = params.assetType || "all";
  const planId = params.planId || "elite";

  const marketWindowMinutes = readEnvNumber("SIGNAL_MARKET_LOOKBACK_MINUTES", 30);
  const socialWindowMinutes = readEnvNumber("SIGNAL_SOCIAL_LOOKBACK_MINUTES", 45);
  const loadLimit = readEnvNumber("SIGNAL_ENGINE_SOURCE_ROWS_LIMIT", 400);
  const marketSince = new Date(Date.now() - marketWindowMinutes * 60 * 1000).toISOString();
  const socialSince = new Date(Date.now() - socialWindowMinutes * 60 * 1000).toISOString();

  const stockSession = getStockSignalSessionState();
  const shouldHandleStocks = assetTypeFilter === "stock" || assetTypeFilter === "all";
  const stockWatchlistLookbackHours = readEnvNumber(
    "SIGNAL_STOCK_SESSION_WATCHLIST_LOOKBACK_HOURS",
    12
  );

  const preGenerationNotes: string[] = [];

  if (shouldHandleStocks) {
    preGenerationNotes.push(
      `Stock session: phase=${stockSession.phase}, kyiv=${stockSession.kyivDate} ${stockSession.kyivTime}, discovery=${stockSession.canDiscoverNewStocks}, locked=${stockSession.lockedWatchlistOnly}`
    );

    const shouldRefreshStockSeed =
      stockSession.canDiscoverNewStocks || params.source === "manual";

    if (shouldRefreshStockSeed) {
      const stockSeed = await refreshStockScannerSnapshotsForSignals();

      preGenerationNotes.push(
        `Stock signal seed: source=${params.source || "internal"}, mode=${
          stockSession.canDiscoverNewStocks ? "live_discovery" : "manual_offhours_foundation_check"
        }, enabled=${stockSeed.enabled}, loaded=${stockSeed.loaded}, inserted=${stockSeed.inserted}${
          stockSeed.error ? `, error=${stockSeed.error}` : ""
        }`
      );
    } else if (stockSession.lockedWatchlistOnly) {
      preGenerationNotes.push(
        "Stock session locked: skipped new stock discovery seed; execution mode will use today session watchlist only."
      );
    } else {
      preGenerationNotes.push(
        "Stock session off-hours: skipped new stock discovery seed."
      );
    }
  }

  if (assetTypeFilter === "crypto" || assetTypeFilter === "all") {
    const cryptoSeed = await refreshCryptoScannerSnapshotsForSignals();

    preGenerationNotes.push(
      `Crypto signal seed: source=${params.source || "internal"}, enabled=${cryptoSeed.enabled}, loaded=${cryptoSeed.loaded}, inserted=${cryptoSeed.inserted}${
        cryptoSeed.error ? `, error=${cryptoSeed.error}` : ""
      }`
    );
  }

  const [marketLoad, socialResult] = await Promise.all([
  loadRecentOrLatestMarketRows({
    marketSince,
    limit: loadLimit,
    assetTypeFilter,
  }),
  supabaseAdmin
    .from("market_social_mentions")
    .select("*")
    .gte("scanned_at", socialSince)
    .order("social_score", { ascending: false })
    .limit(loadLimit),
]);

  const diagnosticNotes: string[] = [...preGenerationNotes];

  if (marketLoad.error) {
    console.error("Alert generator market load error:", marketLoad.error);
    diagnosticNotes.push("market_scanner_snapshots load failed");
  }

  if (marketLoad.usedFallback) {
    diagnosticNotes.push("No fresh market scanner rows in lookback window; used latest available scanner snapshot fallback.");
  }

  if (socialResult.error) {
    console.error("Alert generator social load error:", socialResult.error);
    diagnosticNotes.push("market_social_mentions load failed or unavailable");
  }

  const lockedStockWatchlist =
    shouldHandleStocks && stockSession.lockedWatchlistOnly
      ? await loadStockSessionWatchlistSymbols({
          lookbackHours: stockWatchlistLookbackHours,
          sessionDate: stockSession.kyivDate,
        })
      : null;

  if (lockedStockWatchlist?.error) {
    console.error(
      "Stock session watchlist load error:",
      lockedStockWatchlist.error
    );
    diagnosticNotes.push(
      "Stock session watchlist load failed; locked execution may use market_alerts fallback or produce no stock rows."
    );
  }

  if (lockedStockWatchlist) {
    diagnosticNotes.push(
      `Stock locked watchlist: source=${lockedStockWatchlist.source}, symbols=${lockedStockWatchlist.symbols.size}, rowsLoaded=${lockedStockWatchlist.rowsLoaded}, since=${lockedStockWatchlist.since}`
    );
  }

  const marketRowsDeduped = pickBestMarketRows(
    marketLoad.rows.filter((row) => normalizeSymbol(row.symbol || ""))
  );

  const marketRowsBeforeSessionFilter = marketRowsDeduped.filter((row) =>
    matchesAssetTypeFilter(getAssetType(row), assetTypeFilter)
  );

  const marketRows =
    lockedStockWatchlist && stockSession.lockedWatchlistOnly
      ? marketRowsBeforeSessionFilter.filter((row) => {
          if (getAssetType(row) !== "stock") return true;

          return lockedStockWatchlist.symbols.has(
            normalizeSymbol(row.symbol || "")
          );
        })
      : marketRowsBeforeSessionFilter;

  if (lockedStockWatchlist && stockSession.lockedWatchlistOnly) {
    const removedStocks = marketRowsBeforeSessionFilter.filter(
      (row) =>
        getAssetType(row) === "stock" &&
        !lockedStockWatchlist.symbols.has(normalizeSymbol(row.symbol || ""))
    ).length;

    diagnosticNotes.push(
      `Stock locked execution filter: kept=${marketRows.length}, removedNewStocks=${removedStocks}`
    );
  }

  const stockSessionWatchlistUpsert =
    shouldHandleStocks &&
    (stockSession.canDiscoverNewStocks || params.source === "manual")
      ? await upsertStockSessionWatchlistRows({
          rows: marketRows,
          stockSession,
          source: params.source || "internal",
          maxRows: readEnvNumber(
            "SIGNAL_STOCK_SESSION_WATCHLIST_MAX_UPSERT",
            250
          ),
        })
      : null;

  if (stockSessionWatchlistUpsert?.error) {
    console.error(
      "Stock session watchlist upsert error:",
      stockSessionWatchlistUpsert.error
    );
    diagnosticNotes.push(
      "Stock session watchlist upsert failed; signals can still run from scanner rows."
    );
  }

  if (stockSessionWatchlistUpsert) {
    diagnosticNotes.push(
      `Stock session watchlist upsert: attempted=${stockSessionWatchlistUpsert.attempted}, upserted=${stockSessionWatchlistUpsert.upserted}`
    );
  }

  const stockTechnicalEnrichment =
    shouldHandleStocks &&
    (stockSession.canDiscoverNewStocks ||
      stockSession.lockedWatchlistOnly ||
      params.source === "manual") &&
    marketRows.length > 0
      ? await enrichStockWatchlistTechnicalRows({
          rows: marketRows,
          stockSession,
        })
      : null;

  if (stockTechnicalEnrichment?.error) {
    console.error("Stock technical enrichment error:", stockTechnicalEnrichment.error);
    diagnosticNotes.push(
      "Stock technical enrichment failed; signals can still run, but watchlist intelligence may be stale."
    );
  }

  if (stockTechnicalEnrichment) {
    diagnosticNotes.push(
      `Stock technical enrichment 3B-2A/2D/2E + 3B-3: interval=${stockTechnicalEnrichment.interval}, attempted=${stockTechnicalEnrichment.attempted}, updated=${stockTechnicalEnrichment.updated}, skipped=${stockTechnicalEnrichment.skipped}, candlesLoaded=${stockTechnicalEnrichment.candlesLoaded}, avgVolumeLoaded=${stockTechnicalEnrichment.avgVolumeLoaded ?? 0}, rvolLoaded=${stockTechnicalEnrichment.rvolLoaded ?? 0}, dailyAvgVolumeLoaded=${stockTechnicalEnrichment.dailyAvgVolumeLoaded ?? 0}, fundamentalLoaded=${stockTechnicalEnrichment.fundamentalLoaded ?? 0}, newsLoaded=${stockTechnicalEnrichment.newsLoaded ?? 0}`
    );
  }

  const stockWatchlistTechnicalMapResult =
    shouldHandleStocks && marketRows.length > 0
      ? await loadStockWatchlistTechnicalMap({
          sessionDate: stockSession.kyivDate,
          symbols: marketRows
            .filter((row) => getAssetType(row) === "stock")
            .map((row) => row.symbol || ""),
        })
      : { map: new Map<string, Record<string, unknown>>(), rowsLoaded: 0, error: null };

  if (stockWatchlistTechnicalMapResult.error) {
    console.error("Stock technical map load error:", stockWatchlistTechnicalMapResult.error);
    diagnosticNotes.push(
      "Stock technical gate 3B-2B: failed to load watchlist technical map; stock ARMED gates may be stricter."
    );
  } else if (shouldHandleStocks) {
    diagnosticNotes.push(
      `Stock technical gate 3B-2B: loaded=${stockWatchlistTechnicalMapResult.rowsLoaded}, source=market_signal_watchlist`
    );
  }

  const signalMarketRows = mergeStockWatchlistTechnicalIntoRows(
    marketRows,
    stockWatchlistTechnicalMapResult.map
  );

  const socialRows = ((socialResult.data || []) as SocialMentionRow[]).filter((row) =>
    normalizeSymbol(row.symbol || "")
  );

  const socialBySymbol = aggregateSocial(socialRows);

  const draftRejectStats = new Map<string, number>();
  const draftRejectSamples: string[] = [];

  const recordDraftReject = (event: {
    symbol: string;
    assetType: "stock" | "crypto";
    reason: string;
    details?: Record<string, unknown>;
  }) => {
    const key = `${event.assetType}:${event.reason}`;
    draftRejectStats.set(key, (draftRejectStats.get(key) || 0) + 1);

    if (draftRejectSamples.length < 12) {
      let detailText = "";

      try {
        detailText = JSON.stringify(event.details || {}).slice(0, 360);
      } catch {
        detailText = "";
      }

      draftRejectSamples.push(`${event.symbol} ${key} ${detailText}`);
    }
  };

  const rawDraftsBeforeAiValidation = (
    await Promise.all(
      signalMarketRows.map((row) =>
        buildAlertDraft({
          row,
          social: socialBySymbol.get(normalizeSymbol(row.symbol || "")),
          planId,
          stockSession,
          onReject: recordDraftReject,
        })
      )
    )
  ).filter((draft): draft is MarketAlertDraft => Boolean(draft));

  const rawDrafts = rawDraftsBeforeAiValidation.map(attachSkillEdgeAiValidationToDraft);
  const aiValidationStats = summarizeDraftAiValidation(rawDrafts);

  diagnosticNotes.push(
    `AI validator 3B-4C: validated=${aiValidationStats.total}, approved=${aiValidationStats.approved}, watchOnly=${aiValidationStats.watchOnly}, needsConfirmation=${aiValidationStats.needsConfirmation}, rejected=${aiValidationStats.rejected}, deliveryEligible=${aiValidationStats.deliveryEligible}, blocked=${aiValidationStats.blocked}, playbookMatched=${aiValidationStats.playbookMatched}, grades=A:${aiValidationStats.gradeA}/B:${aiValidationStats.gradeB}/C:${aiValidationStats.gradeC}/D:${aiValidationStats.gradeD}`
  );

  const rawDraftStockCount = rawDrafts.filter((draft) => draft.asset_type === "stock").length;
  const rawDraftCryptoCount = rawDrafts.filter((draft) => draft.asset_type === "crypto").length;
  const rawDraftStockTrendContinuationCount = rawDrafts.filter(
    (draft) =>
      draft.asset_type === "stock" &&
      draft.setup_slug === "stock_trend_continuation_pullback"
  ).length;

  diagnosticNotes.push(
    `Draft asset mix before lifecycle: stock=${rawDraftStockCount}, crypto=${rawDraftCryptoCount}`
  );

  const stockTrendContinuationDebugEnabled = readEnvFlag(
    "SIGNAL_STOCK_TREND_CONT_DEBUG",
    true
  );

  if (stockTrendContinuationDebugEnabled) {
    const trendContinuationMinTrendStrength = readEnvNumber(
      "SIGNAL_STOCK_TREND_CONT_MIN_TREND_STRENGTH",
      72
    );
    const trendContinuationMinPullbackQuality = readEnvNumber(
      "SIGNAL_STOCK_TREND_CONT_MIN_PULLBACK_QUALITY",
      60
    );
    const trendContinuationMaxExhaustion = readEnvNumber(
      "SIGNAL_STOCK_TREND_CONT_MAX_EXHAUSTION",
      76
    );
    const trendContinuationMinVolumeAcceleration = readEnvNumber(
      "SIGNAL_STOCK_TREND_CONT_MIN_VOLUME_ACCELERATION",
      0.65
    );
    const trendContinuationMaxRangeExpansion = readEnvNumber(
      "SIGNAL_STOCK_TREND_CONT_MAX_RANGE_EXPANSION",
      3.5
    );

    const trendContinuationStats = {
      scanned: 0,
      candidates: 0,
      passed: rawDraftStockTrendContinuationCount,
      trendOk: 0,
      pullbackOk: 0,
      exhaustionOk: 0,
      volumeOk: 0,
      rangeOk: 0,
      vwapOk: 0,
      emaOk: 0,
      failDirection: 0,
      failTrend: 0,
      failPullback: 0,
      failExhaustion: 0,
      failVolume: 0,
      failRange: 0,
      failVwap: 0,
      failEma: 0,
    };

    const trendContinuationSamples: string[] = [];

    for (const row of signalMarketRows) {
      if (getAssetType(row) !== "stock") continue;

      const rowTrendBiasText = readStockWatchlistTechnicalText(row, [
        "trend_bias",
        "trendBias",
      ]);
      const rowTrendState = readStockWatchlistTechnicalText(row, [
        "trend_state",
        "trendState",
      ]);
      const rowTrendBias = normalizeStockTechnicalTrendBias(
        rowTrendBiasText || rowTrendState
      );

      const debugDirection: SignalDirection =
        rowTrendBias === "upside" || rowTrendBias === "downside"
          ? rowTrendBias
          : (row.direction_bias === "upside" || row.direction_bias === "downside"
              ? row.direction_bias
              : ((firstFiniteSignalNumber(row.change_percent, (row as Record<string, unknown>).changePercent) ?? 0) >= 0
                  ? "upside"
                  : "downside"));

      const context = getStockTrendContinuationPullbackContext({
        row,
        direction: debugDirection,
      });

      trendContinuationStats.scanned += 1;

      const trendOk =
        context.trendStrength !== null &&
        context.trendStrength >= trendContinuationMinTrendStrength &&
        ((context.trendState || "").toLowerCase().includes("trend") ||
          (context.trendState || "").toLowerCase().includes("strong"));
      const pullbackOk =
        context.pullbackQualityScore !== null &&
        context.pullbackQualityScore >= trendContinuationMinPullbackQuality;
      const exhaustionOk =
        context.trendExhaustionScore === null ||
        context.trendExhaustionScore <= trendContinuationMaxExhaustion;
      const volumeOk =
        context.volumeAcceleration === null ||
        context.volumeAcceleration >= trendContinuationMinVolumeAcceleration;
      const rangeOk =
        context.rangeExpansion === null ||
        context.rangeExpansion <= trendContinuationMaxRangeExpansion;
      const vwapLower = (context.vwapState || "").toLowerCase();
      const vwapOk =
        !context.vwapState ||
        vwapLower === "unknown" ||
        vwapLower === "at_vwap" ||
        (debugDirection === "upside"
          ? !vwapLower.includes("below")
          : !vwapLower.includes("above"));
      const emaLower = (context.emaState || "").toLowerCase();
      const emaOk =
        !context.emaState ||
        emaLower === "mixed" ||
        (debugDirection === "upside"
          ? !emaLower.includes("bearish")
          : !emaLower.includes("bullish"));

      if (context.directionAligned) trendContinuationStats.candidates += 1;
      if (trendOk) trendContinuationStats.trendOk += 1;
      else trendContinuationStats.failTrend += 1;
      if (pullbackOk) trendContinuationStats.pullbackOk += 1;
      else trendContinuationStats.failPullback += 1;
      if (exhaustionOk) trendContinuationStats.exhaustionOk += 1;
      else trendContinuationStats.failExhaustion += 1;
      if (volumeOk) trendContinuationStats.volumeOk += 1;
      else trendContinuationStats.failVolume += 1;
      if (rangeOk) trendContinuationStats.rangeOk += 1;
      else trendContinuationStats.failRange += 1;
      if (vwapOk) trendContinuationStats.vwapOk += 1;
      else trendContinuationStats.failVwap += 1;
      if (emaOk) trendContinuationStats.emaOk += 1;
      else trendContinuationStats.failEma += 1;
      if (!context.directionAligned) trendContinuationStats.failDirection += 1;

      if (
        trendContinuationSamples.length < 8 &&
        (context.isCandidate || trendOk || pullbackOk || context.directionAligned)
      ) {
        trendContinuationSamples.push(
          `${normalizeSymbol(row.symbol || "?")} ${debugDirection} ` +
            `trend=${context.trendBias}/${context.trendStrength ?? "?"} ` +
            `state=${context.trendState || "?"} ` +
            `vwap=${context.vwapState || "?"} ` +
            `ema=${context.emaState || "?"} ` +
            `pullback=${context.pullbackQualityScore ?? "?"} ` +
            `exhaustion=${context.trendExhaustionScore ?? "?"} ` +
            `volAccel=${context.volumeAcceleration ?? "?"} ` +
            `range=${context.rangeExpansion ?? "?"} ` +
            `candidate=${context.isCandidate}`
        );
      }
    }

    diagnosticNotes.push(
      `Stock trend continuation 3B-2C debug: drafts=${rawDraftStockTrendContinuationCount}, scanned=${trendContinuationStats.scanned}, directionAligned=${trendContinuationStats.candidates}, trendOk=${trendContinuationStats.trendOk}, pullbackOk=${trendContinuationStats.pullbackOk}, exhaustionOk=${trendContinuationStats.exhaustionOk}, volumeOk=${trendContinuationStats.volumeOk}, rangeOk=${trendContinuationStats.rangeOk}, vwapOk=${trendContinuationStats.vwapOk}, emaOk=${trendContinuationStats.emaOk}, failDirection=${trendContinuationStats.failDirection}, failTrend=${trendContinuationStats.failTrend}, failPullback=${trendContinuationStats.failPullback}, failExhaustion=${trendContinuationStats.failExhaustion}, failVolume=${trendContinuationStats.failVolume}, failRange=${trendContinuationStats.failRange}, failVwap=${trendContinuationStats.failVwap}, failEma=${trendContinuationStats.failEma}`
    );

    if (trendContinuationSamples.length > 0) {
      diagnosticNotes.push(
        `Stock trend continuation 3B-2C samples: ${trendContinuationSamples.join(" | ")}`
      );
    }
  } else {
    diagnosticNotes.push(
      `Stock trend continuation 3B-2C: drafts=${rawDraftStockTrendContinuationCount}`
    );
  }

  if (draftRejectStats.size > 0) {
    const rejectSummary = Array.from(draftRejectStats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");

    diagnosticNotes.push(`Draft reject stats: ${rejectSummary}`);

    if (draftRejectSamples.length > 0) {
      diagnosticNotes.push(`Draft reject samples: ${draftRejectSamples.join(" | ")}`);
    }
  }

  const cryptoCadenceLookbackHours = readEnvNumber("SIGNAL_CRYPTO_DEDUPE_LOOKBACK_HOURS", 24);
  const cryptoCadenceSince = new Date(
    Date.now() - cryptoCadenceLookbackHours * 60 * 60 * 1000
  ).toISOString();

  let recentCryptoAlerts: RecentCryptoAlertForCadence[] = [];

  if (assetTypeFilter === "crypto" || assetTypeFilter === "all") {
    const existingCryptoResult = await supabaseAdmin
      .from("market_alerts")
      .select("id, alert_key, symbol, asset_type, direction, status, setup_slug, created_at, expires_at")
      .eq("asset_type", "crypto")
      .gte("created_at", cryptoCadenceSince)
      .order("created_at", { ascending: false })
      .limit(500);

    if (existingCryptoResult.error) {
      console.error("Crypto dedupe/cooldown load error:", existingCryptoResult.error);
      diagnosticNotes.push("Crypto dedupe/cooldown skipped because recent market_alerts load failed.");
    } else {
      recentCryptoAlerts = (existingCryptoResult.data || []) as RecentCryptoAlertForCadence[];
    }
  }

  const cryptoCadenceResult = applyCryptoDedupeCooldown({
    drafts: rawDrafts,
    existingRows: recentCryptoAlerts,
  });

  diagnosticNotes.push(...cryptoCadenceResult.notes);

  if (marketRows.length > 0 && rawDrafts.length === 0) {
    diagnosticNotes.push(
      "No drafts survived the premium filter. Lower SIGNAL_WATCH_MIN_CONFIDENCE or inspect rejection reasons if this repeats."
    );
  }

  if (rawDrafts.length > 0 && cryptoCadenceResult.drafts.length === 0) {
    diagnosticNotes.push(
      "Drafts were built, but crypto dedupe/cooldown blocked new duplicates for this refresh."
    );
  }

  const drafts = limitSignalLifecycleBatch(cryptoCadenceResult.drafts);
  const statusCounts = countDraftStatuses(drafts);
  const diagnostics: AlertGenerationDiagnostics = {
    requestedAssetType: assetTypeFilter,
    marketWindowMinutes,
    socialWindowMinutes,
    recentMarketRowsLoaded: marketLoad.recentRowsLoaded,
    fallbackMarketRowsLoaded: marketLoad.fallbackRowsLoaded,
    marketRowsAfterDedup: marketRowsDeduped.length,
    marketRowsAfterAssetFilter: marketRows.length,
    socialRowsLoaded: socialRows.length,
    rawDraftsBuilt: rawDrafts.length,
    draftsAfterLifecycleLimit: drafts.length,
    active: statusCounts.active,
    armed: statusCounts.armed,
    watch: statusCounts.watch,
    usedLatestMarketFallback: marketLoad.usedFallback,
    stockSessionPhase: stockSession.phase,
    stockSessionKyivDate: stockSession.kyivDate,
    stockSessionKyivTime: stockSession.kyivTime,
    stockSessionWatchlistLocked: stockSession.lockedWatchlistOnly,
    stockSessionWatchlistSymbols: lockedStockWatchlist?.symbols.size || 0,
    notes: diagnosticNotes,
  };

  if (drafts.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("market_alerts")
      .upsert(drafts, { onConflict: "alert_key" });

    if (upsertError) {
      console.error("Failed to upsert market alerts:", upsertError);
      throw new Error("Failed to save generated alerts.");
    }
  }

  const responseItems = drafts
    .filter((item) => matchesAssetTypeFilter(item.asset_type, assetTypeFilter))
    .filter(isPersistedAllowedCryptoAlert);

  return {
    source: params.source === "cron" ? "market_alert_generator_cron_3b4c" : "market_alert_generator_3b4c",
    generatedAt: new Date().toISOString(),
    assetType: assetTypeFilter,
    count: responseItems.length,
    diagnostics,
    metrics: buildAlertResponseMetrics(responseItems),
    sourceCoverage: buildAlertSourceCoverage(responseItems),
    cache: {
      ttl: Number(process.env.MARKET_ALERTS_CACHE_TTL_SECONDS || "10"),
      cachedAt: new Date().toISOString(),
    },
    items: responseItems,
  };
}



