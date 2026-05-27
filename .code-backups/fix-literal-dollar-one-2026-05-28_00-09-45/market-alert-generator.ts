import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSkillEdgeAlertFromCandidate } from "@/lib/trading/skill-edge-alert-engine";
import { buildSkillEdgeStructureTradePlan } from "@/lib/trading/market-structure";
import type { SkillEdgeCandle } from "@/lib/trading/market-structure";
import { fetchSkillEdgeCandles } from "@/lib/trading/market-candles-provider";
import { analyzeSkillEdgePriceActionPatterns } from "@/lib/trading/price-action-patterns";
import type { SkillEdgePriceActionPatternAnalysis } from "@/lib/trading/price-action-patterns";

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

const DEFAULT_SIGNAL_MIN_STOCK_TRADED_VOLUME = 100_000;
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
    const parsed = Number(value.replace(/,/g, "").replace("%", ""));

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
  changesPercentage?: number | string | null;
  change?: number | string | null;
  changes?: number | string | null;
  volume?: number | string | null;
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

async function fetchFmpSignalJson<T>(path: string): Promise<T> {
  const apiKey = getFmpSignalApiKey();

  if (!apiKey) {
    throw new Error("FMP_API_KEY is missing.");
  }

  const baseUrl = getFmpSignalBaseUrl();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}/${path}${separator}apikey=${encodeURIComponent(apiKey)}`;

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

  return (await response.json()) as T;
}

function parseFmpChangePct(item: FmpSignalMover) {
  return firstFiniteSignalNumber(
    item.changesPercentage,
    item.change,
    item.changes
  ) ?? 0;
}

function buildStockSeedRow(
  item: FmpSignalMover,
  bucket: "pump_watch" | "dump_watch" | "unusual_volume"
): MarketScannerRow | null {
  const symbol = normalizeSymbol(String(item.symbol || item.ticker || ""));

  if (!isProbablyTradeableUsStock(symbol)) return null;

  const price = firstFiniteSignalNumber(item.price);
  const volume = firstFiniteSignalNumber(item.volume);
  const changePercent = parseFmpChangePct(item);
  const minVolume = getSignalMinimumVolume("stock");
  const minChangePct = getStockSeedMinChangePct();
  const stockMinPrice = 0.4;
  const stockMaxPrice = 500;

  if (price === null || price < stockMinPrice || price > stockMaxPrice) return null;
  if (volume === null || volume < minVolume) return null;

  if (Math.abs(changePercent) < minChangePct && bucket !== "unusual_volume") {
    return null;
  }

  if (bucket === "unusual_volume" && Math.abs(changePercent) < 2) {
    return null;
  }

  const direction = changePercent >= 0 ? "upside" : "downside";

  const volumeScore = Math.min(20, Math.log10(Math.max(volume, 1) / minVolume) * 8);
  const changeScore = Math.min(35, Math.abs(changePercent) * 2.5);
  const bucketBoost =
    bucket === "pump_watch" || bucket === "dump_watch"
      ? 12
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
          : "Unusual volume stock candidate",
    opportunity_score: Number(opportunityScore.toFixed(2)),
    source: "fmp_signal_seed",
    scanned_at: new Date().toISOString(),
    raw_data: {
      provider: "fmp",
      signalSeed: true,
      bucket,
      minVolume,
      minChangePct,
      source_breakdown: {
        market: "fmp",
        news: null,
        social: [],
      },
      raw: item,
    },
  };
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
    const [gainers, losers, active] = await Promise.all([
      fetchFmpSignalJson<FmpSignalMover[]>("biggest-gainers"),
      fetchFmpSignalJson<FmpSignalMover[]>("biggest-losers"),
      fetchFmpSignalJson<FmpSignalMover[]>("most-actives"),
    ]);

    const rows = [
      ...(Array.isArray(gainers)
        ? gainers.slice(0, limit).map((item) => buildStockSeedRow(item, "pump_watch"))
        : []),
      ...(Array.isArray(losers)
        ? losers.slice(0, limit).map((item) => buildStockSeedRow(item, "dump_watch"))
        : []),
      ...(Array.isArray(active)
        ? active.slice(0, limit).map((item) => buildStockSeedRow(item, "unusual_volume"))
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
      .slice(0, Number(process.env.SIGNAL_STOCK_SEED_MAX_ROWS || "80"));

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
      .insert(finalRows);

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

$1
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

  const maxNewPerRefresh = readEnvNumber("SIGNAL_CRYPTO_MAX_NEW_PER_REFRESH", 1);
  const maxNewPer24h = readEnvNumber("SIGNAL_CRYPTO_MAX_NEW_PER_24H", 20);
  const minIntervalMinutes = readEnvNumber(
    "SIGNAL_CRYPTO_NEW_OPPORTUNITY_MIN_INTERVAL_MINUTES",
    20
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

  const stop = isShort ? price * 1.018 : price * 0.982;

  const target1 = isShort ? price * 0.98 : price * 1.022;
  const target2 = isShort ? price * 0.955 : price * 1.045;
  const target3 = isShort ? price * 0.93 : price * 1.07;

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
    "crypto_stop_run_reclaim_long",
    "crypto_stop_run_rejection_short",
    "session_liquidity_sweep_reversal",
    "order_block_mitigation_reaction",
    "breaker_block_retest",
    "fvg_fill_continuation",
    "fvg_displacement_continuation",
    "trendline_pullback_structure_continuation",
  ].includes(slug);
}

function includesCryptoSignalText(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
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
      "trendline pullback",
      "pullback to trendline",
      "trendline continuation",
      "structure continuation",
      "controlled pullback",
      "pullback into structure",
    ])
  ) {
    return "trendline_pullback_structure_continuation";
  }

  if (includesCryptoSignalText(text, ["order block", "mitigation"])) {
    return "order_block_mitigation_reaction";
  }

  if (includesCryptoSignalText(text, ["breaker block", "breaker retest"])) {
    return "breaker_block_retest";
  }

  if (includesCryptoSignalText(text, ["fvg", "fair value gap", "imbalance"])) {
    return "fvg_fill_continuation";
  }

  if (
    params.direction === "downside" ||
    params.changePercent < -3 ||
    includesCryptoSignalText(text, [
      "fade",
      "rejection",
      "failed",
      "lower high",
      "weakness",
      "dump",
      "sweep high",
      "buy-side sweep",
      "liquidity above",
    ])
  ) {
    return "crypto_stop_run_rejection_short";
  }

  if (
    params.direction === "upside" ||
    params.changePercent > 3 ||
    includesCryptoSignalText(text, [
      "reclaim",
      "higher low",
      "sweep low",
      "sell-side sweep",
      "liquidity below",
      "continuation",
      "pullback",
    ])
  ) {
    return "crypto_stop_run_reclaim_long";
  }

  return "session_liquidity_sweep_reversal";
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

  if (assetType === "stock" && (price === null || price < 0.4 || price > 500)) {
    return null;
  }

  const volumeGate = buildSignalVolumeGate(params.row, assetType);

  if (!volumeGate.passed) {
    return null;
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

  const engineSetupText =
    assetType === "crypto"
      ? [
          rawText,
          forcedCryptoSetupSlug,
          "crypto_smc_ict_only",
          catalyst ? `attention source: ${catalyst}` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : rawText;
  const engineAlert = buildSkillEdgeAlertFromCandidate({
    candidate: {
      symbol,
      name: params.row.name || symbol,
      exchange: params.row.exchange || null,
      assetType: assetType === "crypto" ? "crypto" : "stocks",
      marketType: assetType === "crypto" ? "crypto" : "stocks",
      setupSlug: forcedCryptoSetupSlug ?? undefined,
      setup_slug: forcedCryptoSetupSlug ?? undefined,
      playbook_slug: forcedCryptoSetupSlug ?? undefined,
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

  if (engineAlert.status === "rejected") {
    return null;
  }

  let lifecycleStatus: MarketAlertDraft["status"] =
    engineAlert.status === "alert"
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
    return null;
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
    return null;
  }

  if (tradePlan.source !== "structure") {
    return null;
  }

  const entryWindow = validateEntryWindow({
    price,
    direction: finalDirection,
    plan: tradePlan,
    assetType,
  });

  if (entryWindow.shouldBlock) {
    return null;
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
  const tp2R = rrForPlanTarget(tradePlan.target_2);
  const tp3R = rrForPlanTarget(tradePlan.target_3);
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

  if (assetType === "crypto") {
    if (!executionTrigger.passed || !entryWindow.canBeActive || !hasFullTargetStack) {
      lifecycleStatus = "watch";
    }
  }

  const displayConfidenceScore = capSignalScoreForLifecycle(
    globalSignal.confidenceScore + executionTrigger.scoreImpact + setupContext.scoreImpact,
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

  reasonParts.push("target policy: ACTIVE requires TP1 >= 2R and full HTF target stack; WATCH can mark in-play structure before final trigger");
  if (assetType === "crypto") {
    reasonParts.push("crypto mode: SMC/ICT only, catalyst/trending is attention not setup");
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
    target_2: tradePlan.target_2,
    target_3: tradePlan.target_3,
    invalidation: tradePlan.invalidation,
    management_plan: tradePlan.management_plan,
    confidence_score: displayConfidenceScore,
    timeframe: assetType === "crypto" ? "intraday / crypto 24-7" : "intraday",
    is_new: true,
    outcome_status: "pending",
    status: lifecycleStatus,
    source_data: {
      market: params.row,
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
  const loadLimit = readEnvNumber("SIGNAL_ENGINE_SOURCE_ROWS_LIMIT", 250);
  const marketSince = new Date(Date.now() - marketWindowMinutes * 60 * 1000).toISOString();
  const socialSince = new Date(Date.now() - socialWindowMinutes * 60 * 1000).toISOString();

const preGenerationNotes: string[] = [];

if (
  params.source === "cron" &&
  (assetTypeFilter === "stock" || assetTypeFilter === "all")
) {
  const stockSeed = await refreshStockScannerSnapshotsForSignals();

  preGenerationNotes.push(
    `Stock signal seed: enabled=${stockSeed.enabled}, loaded=${stockSeed.loaded}, inserted=${stockSeed.inserted}${
      stockSeed.error ? `, error=${stockSeed.error}` : ""
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

  const marketRowsDeduped = pickBestMarketRows(
    marketLoad.rows.filter((row) => normalizeSymbol(row.symbol || ""))
  );

  const marketRows = marketRowsDeduped.filter((row) =>
    matchesAssetTypeFilter(getAssetType(row), assetTypeFilter)
  );

  const socialRows = ((socialResult.data || []) as SocialMentionRow[]).filter((row) =>
    normalizeSymbol(row.symbol || "")
  );

  const socialBySymbol = aggregateSocial(socialRows);

  const rawDrafts = (
    await Promise.all(
      marketRows.map((row) =>
        buildAlertDraft({
          row,
          social: socialBySymbol.get(normalizeSymbol(row.symbol || "")),
          planId,
        })
      )
    )
  ).filter((draft): draft is MarketAlertDraft => Boolean(draft));

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
    source: params.source === "cron" ? "market_alert_generator_cron" : "market_alert_generator",
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


