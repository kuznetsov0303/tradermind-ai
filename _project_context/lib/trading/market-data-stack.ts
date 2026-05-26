export type SkillEdgeDirectionBias = "upside" | "downside" | "neutral";

export type SkillEdgeScanBucket =
  | "pump_watch"
  | "dump_watch"
  | "unusual_volume"
  | "catalyst_watch";

export type SkillEdgeCatalystType =
  | "earnings"
  | "offering_or_dilution"
  | "analyst_rating"
  | "biotech_fda"
  | "crypto_related"
  | "legal_or_investigation"
  | "partnership_or_contract"
  | "general_news";

export type SkillEdgeNewsCatalyst = {
  symbol: string;
  title: string;
  site: string | null;
  url: string | null;
  published_at: string | null;
  catalyst_type: SkillEdgeCatalystType;
  catalyst_score: number;
  source_provider: "fmp" | "finnhub" | "marketaux";
  sentiment?: "positive" | "negative" | "neutral" | null;
};

export type SkillEdgeScannerItem = {
  symbol: string;
  exchange: string;
  name: string;
  asset_type: "stock" | "crypto";
  scan_bucket: SkillEdgeScanBucket;
  direction_bias: SkillEdgeDirectionBias;
  price: number | null;
  change_percent: number;
  gap_percent: number | null;
  volume: number | null;
  relative_volume: number | null;
  mentions: number;
  mention_velocity: number;
  sentiment: "bullish" | "neutral" | "bearish";
  catalyst: string | null;
  risk_label: string;
  opportunity_score: number;
  source: string;
  news_catalyst?: SkillEdgeNewsCatalyst | null;
  raw_data: Record<string, unknown>;
};

export type SkillEdgeProviderStatus = {
  provider: string;
  enabled: boolean;
  ok: boolean;
  items: number;
  cacheTtlSeconds: number;
  error: string | null;
  refreshedAt: string;
};

export type SkillEdgeScannerSnapshot = {
  items: SkillEdgeScannerItem[];
  providerStatuses: SkillEdgeProviderStatus[];
  generatedAt: string;
};

type FmpMover = {
  symbol?: string;
  name?: string;
  price?: number | string;
  change?: number | string;
  changesPercentage?: number | string;
  exchange?: string;
  volume?: number | string;
};

type FmpNewsItem = {
  symbol?: string;
  symbols?: string | string[];
  tickers?: string[];
  title?: string;
  text?: string;
  site?: string;
  publisher?: string;
  publishedDate?: string;
  publishedAt?: string;
  date?: string;
  url?: string;
};

type MarketauxArticle = {
  title?: string;
  description?: string;
  url?: string;
  source?: string;
  published_at?: string;
  sentiment?: string;
  entities?: Array<{
    symbol?: string;
    exchange?: string;
    name?: string;
    type?: string;
    sentiment_score?: number;
  }>;
  symbols?: string[];
};

type CoinGeckoMarket = {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_1h_in_currency?: number;
};

type BinanceTicker24h = {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  volume?: string;
  count?: number;
};

type HyperliquidAssetCtx = {
  name?: string;
  coin?: string;
  markPx?: string;
  midPx?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
  funding?: string;
  openInterest?: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type MemoryCache = Map<string, CacheEntry<unknown>>;

const globalForMarketData = globalThis as typeof globalThis & {
  __skillEdgeMarketDataCache?: MemoryCache;
  __skillEdgeMarketDataRefresh?: Promise<SkillEdgeScannerSnapshot> | null;
};

function getMemoryCache() {
  if (!globalForMarketData.__skillEdgeMarketDataCache) {
    globalForMarketData.__skillEdgeMarketDataCache = new Map();
  }

  return globalForMarketData.__skillEdgeMarketDataCache;
}

function getEnvString(name: string, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getEnvBool(name: string, fallback = false) {
  const value = getEnvString(name);
  if (!value) return fallback;
  return value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
}

function getEnvNumber(name: string, fallback: number, min?: number, max?: number) {
  const value = Number(getEnvString(name));
  const parsed = Number.isFinite(value) ? value : fallback;
  const withMin = typeof min === "number" ? Math.max(min, parsed) : parsed;
  return typeof max === "number" ? Math.min(max, withMin) : withMin;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizePercent(value: unknown) {
  return toNumber(value, 0);
}

function normalizeStockSymbol(symbol: string) {
  return symbol
    .trim()
    .toUpperCase()
    .replace(".WS", "")
    .replace(".U", "")
    .replace(".W", "")
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeCryptoBase(symbol: string) {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/USDT$|USDC$|BUSD$/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function isProbablyCommonStock(symbol: string) {
  if (!symbol) return false;
  if (symbol.length > 6) return false;
  if (symbol.includes("-")) return false;
  if (symbol.endsWith("W") || symbol.endsWith("WS") || symbol.endsWith("U") || symbol.endsWith("R")) {
    return false;
  }
  return /^[A-Z0-9]{1,6}$/.test(symbol);
}

function isAllowedExchange(exchange?: string | null) {
  const normalized = (exchange || "").toLowerCase();
  return normalized.includes("nasdaq") || normalized.includes("nyse") || normalized.includes("amex");
}

function normalizeExchange(exchange?: string | null) {
  const upper = (exchange || "").toUpperCase();
  if (upper.includes("NASDAQ")) return "NASDAQ";
  if (upper.includes("NYSE")) return "NYSE";
  if (upper.includes("AMEX")) return "AMEX";
  return upper || "US";
}

function splitNewsSymbols(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(splitNewsSymbols);
  if (typeof value !== "string") return [];

  return value
    .split(/[,:;\s|]+/g)
    .map((item) => normalizeStockSymbol(item))
    .filter((item) => Boolean(item));
}

function getNewsPublishedAt(item: FmpNewsItem | MarketauxArticle) {
  return (
    ("publishedDate" in item ? item.publishedDate : undefined) ||
    ("publishedAt" in item ? item.publishedAt : undefined) ||
    ("date" in item ? item.date : undefined) ||
    ("published_at" in item ? item.published_at : undefined) ||
    null
  );
}

function getNewsAgeHours(publishedAt: string | null) {
  if (!publishedAt) return null;
  const timestamp = new Date(publishedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

function classifyNewsCatalyst(title: string): SkillEdgeCatalystType {
  const lower = title.toLowerCase();

  if (lower.includes("earnings") || lower.includes("revenue") || lower.includes("eps") || lower.includes("guidance") || lower.includes("quarterly results")) {
    return "earnings";
  }

  if (lower.includes("offering") || lower.includes("registered direct") || lower.includes("private placement") || lower.includes("dilution") || lower.includes("atm offering")) {
    return "offering_or_dilution";
  }

  if (lower.includes("upgrade") || lower.includes("downgrade") || lower.includes("price target") || lower.includes("initiates coverage") || lower.includes("analyst")) {
    return "analyst_rating";
  }

  if (lower.includes("fda") || lower.includes("phase 1") || lower.includes("phase 2") || lower.includes("phase 3") || lower.includes("clinical") || lower.includes("approval")) {
    return "biotech_fda";
  }

  if (lower.includes("bitcoin") || lower.includes("crypto") || lower.includes("ethereum") || lower.includes("blockchain") || lower.includes("token") || lower.includes("solana")) {
    return "crypto_related";
  }

  if (lower.includes("lawsuit") || lower.includes("investigation") || lower.includes("sec") || lower.includes("fraud") || lower.includes("bankruptcy")) {
    return "legal_or_investigation";
  }

  if (lower.includes("partnership") || lower.includes("contract") || lower.includes("agreement") || lower.includes("collaboration") || lower.includes("deal")) {
    return "partnership_or_contract";
  }

  return "general_news";
}

function calculateNewsCatalystScore(params: {
  title: string;
  publishedAt: string | null;
  sentiment?: string | null;
}) {
  const ageHours = getNewsAgeHours(params.publishedAt);
  let recencyScore = 4;

  if (ageHours !== null) {
    if (ageHours <= 1) recencyScore = 15;
    else if (ageHours <= 6) recencyScore = 12;
    else if (ageHours <= 24) recencyScore = 8;
  }

  const type = classifyNewsCatalyst(params.title);
  const typeBoost: Record<SkillEdgeCatalystType, number> = {
    earnings: 5,
    offering_or_dilution: 6,
    analyst_rating: 4,
    biotech_fda: 6,
    crypto_related: 4,
    legal_or_investigation: 5,
    partnership_or_contract: 5,
    general_news: 2,
  };

  const sentimentBoost = params.sentiment === "positive" || params.sentiment === "negative" ? 2 : 0;

  return Math.min(22, recencyScore + typeBoost[type] + sentimentBoost);
}

function getSentimentFromChange(changePercent: number): "bullish" | "neutral" | "bearish" {
  if (changePercent > 3) return "bullish";
  if (changePercent < -3) return "bearish";
  return "neutral";
}

function buildRiskLabel(params: {
  bucket: SkillEdgeScanBucket;
  assetType: "stock" | "crypto";
  catalyst?: SkillEdgeNewsCatalyst | null;
  source?: string;
}) {
  if (params.catalyst?.catalyst_type === "offering_or_dilution") {
    return "Fresh offering/dilution headline вЂ” high trap risk. Wait for structure, not headline excitement.";
  }

  if (params.catalyst?.catalyst_type === "legal_or_investigation") {
    return "Fresh legal/investigation catalyst вЂ” headline risk is elevated. Use confirmation only.";
  }

  if (params.catalyst?.catalyst_type === "earnings") {
    return "Fresh earnings catalyst вЂ” watch volume, VWAP reaction and failed follow-through.";
  }

  if (params.assetType === "crypto") {
    if (params.bucket === "dump_watch") return "Crypto downside momentum вЂ” avoid chasing flushes; wait for failed reclaim or lower high.";
    if (params.bucket === "pump_watch") return "Crypto upside momentum вЂ” avoid late entries; wait for reclaim/hold or clean pullback.";
    return "Crypto activity spike вЂ” needs structure, liquidity and volume confirmation.";
  }

  if (params.bucket === "dump_watch") return "Downside momentum вЂ” needs failed reclaim / lower-high confirmation.";
  if (params.bucket === "pump_watch") return "Upside momentum вЂ” needs VWAP/reclaim/pullback confirmation.";
  if (params.bucket === "catalyst_watch") return "Fresh catalyst вЂ” wait for price action confirmation before entry.";
  return "Unusual activity вЂ” needs confirmation, risk box and no-chase filter.";
}

function scoreActivity(params: {
  assetType: "stock" | "crypto";
  changePercent: number;
  volume: number | null;
  catalystScore?: number;
  trendingBoost?: number;
}) {
  let score = 38;
  score += Math.min(Math.abs(params.changePercent) * (params.assetType === "crypto" ? 2.1 : 1.5), 34);

  const volume = params.volume || 0;
  if (params.assetType === "stock") {
    if (volume > 30_000_000) score += 18;
    else if (volume > 10_000_000) score += 14;
    else if (volume > 2_000_000) score += 9;
    else if (volume > 500_000) score += 5;
  } else {
    if (volume > 1_000_000_000) score += 18;
    else if (volume > 250_000_000) score += 14;
    else if (volume > 50_000_000) score += 9;
    else if (volume > 10_000_000) score += 5;
  }

  score += Math.min(params.catalystScore || 0, 18);
  score += Math.min(params.trendingBoost || 0, 12);

  return Math.round(clamp(score));
}

function getBucket(changePercent: number, catalyst?: SkillEdgeNewsCatalyst | null): SkillEdgeScanBucket {
  if (changePercent >= 5) return "pump_watch";
  if (changePercent <= -4) return "dump_watch";
  if (catalyst) return "catalyst_watch";
  return "unusual_volume";
}

function getDirection(changePercent: number): SkillEdgeDirectionBias {
  if (changePercent > 1.5) return "upside";
  if (changePercent < -1.5) return "downside";
  return "neutral";
}

function getFmpApiKey() {
  return getEnvString("FMP_API_KEY") || getEnvString("FINANCIAL_MODELING_PREP_API_KEY");
}

function getFmpStableBaseUrl() {
  return getEnvString("FMP_STABLE_BASE_URL", "https://financialmodelingprep.com/stable").replace(/\/+$/g, "");
}

function getCoinGeckoBaseUrl() {
  return getEnvString("COINGECKO_BASE_URL", getEnvString("COINGECKO_API_TYPE") === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3").replace(/\/+$/g, "");
}

function getBinanceBaseUrl() {
  return getEnvString("BINANCE_MARKET_DATA_BASE_URL", "https://data-api.binance.vision").replace(/\/+$/g, "");
}


function getMarketauxBaseUrl() {
  return getEnvString("MARKETAUX_BASE_URL", "https://api.marketaux.com/v1").replace(/\/+$/g, "");
}

function buildStatus(params: Omit<SkillEdgeProviderStatus, "refreshedAt">): SkillEdgeProviderStatus {
  return {
    ...params,
    refreshedAt: new Date().toISOString(),
  };
}

async function withMemoryCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cache = getMemoryCache();
  const cached = cache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await loader();
  cache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  });

  return value;
}

async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs || 12_000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson<T>(url: string, body: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  return fetchJson<T>(url, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

async function fetchFmpJson<T>(path: string, ttlSeconds: number): Promise<T> {
  const apiKey = getFmpApiKey();
  if (!apiKey) throw new Error("FMP_API_KEY is missing");

  const separator = path.includes("?") ? "&" : "?";
  const url = `${getFmpStableBaseUrl()}/${path}${separator}apikey=${encodeURIComponent(apiKey)}`;

  return withMemoryCache(`fmp:${path}`, ttlSeconds, () => fetchJson<T>(url));
}

function fmpNewsSymbols(item: FmpNewsItem) {
  const symbols = [
    ...splitNewsSymbols(item.symbol),
    ...splitNewsSymbols(item.symbols),
    ...splitNewsSymbols(item.tickers),
  ];

  return Array.from(new Set(symbols)).filter(isProbablyCommonStock);
}

async function loadFmpNewsCatalysts(): Promise<{ catalysts: Map<string, SkillEdgeNewsCatalyst[]>; status: SkillEdgeProviderStatus }> {
  const enabled = getEnvBool("FMP_ENABLED", Boolean(getFmpApiKey()));
  const ttl = getEnvNumber("FMP_STOCK_NEWS_REFRESH_SECONDS", 300, 60);

  if (!enabled) {
    return {
      catalysts: new Map(),
      status: buildStatus({ provider: "fmp_news", enabled: false, ok: false, items: 0, cacheTtlSeconds: ttl, error: "FMP is disabled." }),
    };
  }

  try {
    const data = await fetchFmpJson<FmpNewsItem[]>("news/stock-latest?page=0&limit=100", ttl);
    const catalysts = new Map<string, SkillEdgeNewsCatalyst[]>();

    for (const item of Array.isArray(data) ? data : []) {
      const title = item.title?.trim();
      if (!title) continue;

      const publishedAt = getNewsPublishedAt(item);
      const catalystType = classifyNewsCatalyst(title);
      const catalystScore = calculateNewsCatalystScore({ title, publishedAt });

      for (const symbol of fmpNewsSymbols(item)) {
        const catalyst: SkillEdgeNewsCatalyst = {
          symbol,
          title,
          site: item.site || item.publisher || null,
          url: item.url || null,
          published_at: publishedAt,
          catalyst_type: catalystType,
          catalyst_score: catalystScore,
          source_provider: "fmp",
          sentiment: null,
        };

        const existing = catalysts.get(symbol) || [];
        existing.push(catalyst);
        catalysts.set(symbol, existing.sort((a, b) => b.catalyst_score - a.catalyst_score));
      }
    }

    return {
      catalysts,
      status: buildStatus({ provider: "fmp_news", enabled, ok: true, items: data.length, cacheTtlSeconds: ttl, error: null }),
    };
  } catch (error) {
    return {
      catalysts: new Map(),
      status: buildStatus({ provider: "fmp_news", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: error instanceof Error ? error.message : "FMP news failed." }),
    };
  }
}

async function loadMarketauxCatalysts(symbols: string[]): Promise<{ catalysts: Map<string, SkillEdgeNewsCatalyst[]>; status: SkillEdgeProviderStatus }> {
  const apiKey = getEnvString("MARKETAUX_API_KEY");
  const enabled = getEnvBool("MARKETAUX_ENABLED", Boolean(apiKey));
  const ttl = getEnvNumber("MARKETAUX_BROAD_NEWS_REFRESH_SECONDS", 300, 60);
  const maxEntities = getEnvNumber("MARKETAUX_MAX_ENTITIES_PER_REQUEST", 20, 1, 20);
  const topN = getEnvNumber("MARKETAUX_ENTITY_TOP_N", 120, 20, 200);

  if (!enabled || !apiKey) {
    return {
      catalysts: new Map(),
      status: buildStatus({ provider: "marketaux", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: "MARKETAUX_API_KEY is missing or provider disabled." }),
    };
  }

  try {
    const baseUrl = getMarketauxBaseUrl();
    const selectedSymbols = Array.from(new Set(symbols.filter(Boolean))).slice(0, topN);
    const batches: string[][] = [];

    for (let index = 0; index < selectedSymbols.length; index += maxEntities) {
      batches.push(selectedSymbols.slice(index, index + maxEntities));
    }

    const broadUrl = new URL(`${baseUrl}/news/all`);
    broadUrl.searchParams.set("api_token", apiKey);
    broadUrl.searchParams.set("language", "en");
    broadUrl.searchParams.set("limit", "50");
    broadUrl.searchParams.set("filter_entities", "true");
    broadUrl.searchParams.set("must_have_entities", "true");

    const urls = [broadUrl.toString()];

    for (const batch of batches.slice(0, 6)) {
      const url = new URL(`${baseUrl}/news/all`);
      url.searchParams.set("api_token", apiKey);
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", "50");
      url.searchParams.set("symbols", batch.join(","));
      url.searchParams.set("filter_entities", "true");
      url.searchParams.set("must_have_entities", "true");
      urls.push(url.toString());
    }

    const responses = await Promise.allSettled(
      urls.map((url) => withMemoryCache(`marketaux:${url}`, ttl, () => fetchJson<{ data?: MarketauxArticle[] }>(url)))
    );

    const articles = responses.flatMap((result) =>
      result.status === "fulfilled" && Array.isArray(result.value.data)
        ? result.value.data
        : []
    );

    const catalysts = new Map<string, SkillEdgeNewsCatalyst[]>();

    for (const article of articles) {
      const title = article.title?.trim();
      if (!title) continue;

      const publishedAt = article.published_at || null;
      const catalystType = classifyNewsCatalyst(`${title} ${article.description || ""}`);
      const normalizedSentiment = article.sentiment === "positive" || article.sentiment === "negative" ? article.sentiment : "neutral";
      const catalystScore = calculateNewsCatalystScore({ title, publishedAt, sentiment: normalizedSentiment });

      const articleSymbols = new Set<string>();

      for (const entity of article.entities || []) {
        const symbol = normalizeStockSymbol(entity.symbol || "");
        if (symbol) articleSymbols.add(symbol);
      }

      for (const symbol of splitNewsSymbols(article.symbols)) {
        articleSymbols.add(symbol);
      }

      for (const symbol of Array.from(articleSymbols)) {
        if (!symbol) continue;

        const catalyst: SkillEdgeNewsCatalyst = {
          symbol,
          title,
          site: article.source || "Marketaux",
          url: article.url || null,
          published_at: publishedAt,
          catalyst_type: catalystType,
          catalyst_score: catalystScore,
          source_provider: "marketaux",
          sentiment: normalizedSentiment,
        };

        const existing = catalysts.get(symbol) || [];
        existing.push(catalyst);
        catalysts.set(symbol, existing.sort((a, b) => b.catalyst_score - a.catalyst_score));
      }
    }

    const failed = responses.filter((result) => result.status === "rejected").length;

    return {
      catalysts,
      status: buildStatus({ provider: "marketaux", enabled, ok: failed < responses.length, items: articles.length, cacheTtlSeconds: ttl, error: failed ? `${failed} Marketaux batches failed.` : null }),
    };
  } catch (error) {
    return {
      catalysts: new Map(),
      status: buildStatus({ provider: "marketaux", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: error instanceof Error ? error.message : "Marketaux failed." }),
    };
  }
}

function mergeCatalystMaps(...maps: Map<string, SkillEdgeNewsCatalyst[]>[]) {
  const merged = new Map<string, SkillEdgeNewsCatalyst[]>();

  for (const map of maps) {
    for (const [symbol, catalysts] of map.entries()) {
      const existing = merged.get(symbol) || [];
      existing.push(...catalysts);
      merged.set(symbol, existing.sort((a, b) => b.catalyst_score - a.catalyst_score));
    }
  }

  return merged;
}

function bestCatalyst(symbol: string, catalysts: Map<string, SkillEdgeNewsCatalyst[]>) {
  return catalysts.get(symbol)?.[0] || null;
}

function buildStockItem(raw: FmpMover, bucket: SkillEdgeScanBucket, catalysts: Map<string, SkillEdgeNewsCatalyst[]>): SkillEdgeScannerItem | null {
  const symbol = normalizeStockSymbol(raw.symbol || "");
  if (!isProbablyCommonStock(symbol)) return null;

  const exchange = normalizeExchange(raw.exchange || "US");
  if (!isAllowedExchange(exchange)) return null;

  const changePercent = normalizePercent(raw.changesPercentage ?? raw.change);
  const volume = toNumber(raw.volume, 0) || null;
  const catalyst = bestCatalyst(symbol, catalysts);
  const finalBucket = bucket === "unusual_volume" && catalyst ? "catalyst_watch" : bucket;
  const score = scoreActivity({
    assetType: "stock",
    changePercent,
    volume,
    catalystScore: catalyst?.catalyst_score,
  });

  return {
    symbol,
    exchange,
    name: raw.name || symbol,
    asset_type: "stock",
    scan_bucket: finalBucket,
    direction_bias: getDirection(changePercent),
    price: toNumber(raw.price, 0) || null,
    change_percent: changePercent,
    gap_percent: null,
    volume,
    relative_volume: null,
    mentions: 0,
    mention_velocity: 0,
    sentiment: getSentimentFromChange(changePercent),
    catalyst: catalyst?.title || null,
    risk_label: buildRiskLabel({ bucket: finalBucket, assetType: "stock", catalyst }),
    opportunity_score: score,
    source: catalyst ? `fmp_${catalyst.source_provider}` : "fmp",
    news_catalyst: catalyst,
    raw_data: {
      provider: "fmp",
      source_breakdown: {
        market: "fmp",
        news: catalyst?.source_provider || null,
        social: [],
        crypto: null,
      },
      sourceCoverageNote: "Based on tracked providers and cached backend scanner, not full internet coverage.",
      raw,
    },
  };
}

async function loadFmpStockCandidates(catalysts: Map<string, SkillEdgeNewsCatalyst[]>): Promise<{ items: SkillEdgeScannerItem[]; status: SkillEdgeProviderStatus }> {
  const enabled = getEnvBool("FMP_ENABLED", Boolean(getFmpApiKey()));
  const ttl = getEnvNumber("FMP_STOCK_PREFILTER_REFRESH_SECONDS", 30, 15);

  if (!enabled) {
    return { items: [], status: buildStatus({ provider: "fmp_stocks", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: "FMP is disabled." }) };
  }

  try {
    const [gainers, losers, active] = await Promise.all([
      fetchFmpJson<FmpMover[]>("biggest-gainers", ttl),
      fetchFmpJson<FmpMover[]>("biggest-losers", ttl),
      fetchFmpJson<FmpMover[]>("most-actives", ttl),
    ]);

    const rows: SkillEdgeScannerItem[] = [];
    for (const item of Array.isArray(gainers) ? gainers.slice(0, 100) : []) {
      const row = buildStockItem(item, "pump_watch", catalysts);
      if (row) rows.push(row);
    }
    for (const item of Array.isArray(losers) ? losers.slice(0, 100) : []) {
      const row = buildStockItem(item, "dump_watch", catalysts);
      if (row) rows.push(row);
    }
    for (const item of Array.isArray(active) ? active.slice(0, 120) : []) {
      const row = buildStockItem(item, "unusual_volume", catalysts);
      if (row) rows.push(row);
    }

    return { items: rows, status: buildStatus({ provider: "fmp_stocks", enabled, ok: true, items: rows.length, cacheTtlSeconds: ttl, error: null }) };
  } catch (error) {
    return { items: [], status: buildStatus({ provider: "fmp_stocks", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: error instanceof Error ? error.message : "FMP stock scanner failed." }) };
  }
}

async function loadCoinGeckoContext(): Promise<{ bySymbol: Map<string, CoinGeckoMarket>; trending: Set<string>; status: SkillEdgeProviderStatus }> {
  const apiKey = getEnvString("COINGECKO_API_KEY");
  const enabled = getEnvBool("COINGECKO_ENABLED", Boolean(apiKey));
  const marketsTtl = getEnvNumber("COINGECKO_MARKETS_REFRESH_SECONDS", 120, 60);
  const trendingTtl = getEnvNumber("COINGECKO_TRENDING_REFRESH_SECONDS", 300, 120);

  const bySymbol = new Map<string, CoinGeckoMarket>();
  const trending = new Set<string>();

  if (!enabled || !apiKey) {
    return { bySymbol, trending, status: buildStatus({ provider: "coingecko", enabled, ok: false, items: 0, cacheTtlSeconds: marketsTtl, error: "COINGECKO_API_KEY is missing or provider disabled." }) };
  }

  try {
    const headers: Record<string, string> = getEnvString("COINGECKO_API_TYPE") === "pro"
      ? { "x-cg-pro-api-key": apiKey }
      : { "x-cg-demo-api-key": apiKey };

    const marketsUrl = new URL(`${getCoinGeckoBaseUrl()}/coins/markets`);
    marketsUrl.searchParams.set("vs_currency", "usd");
    marketsUrl.searchParams.set("order", "volume_desc");
    marketsUrl.searchParams.set("per_page", "250");
    marketsUrl.searchParams.set("page", "1");
    marketsUrl.searchParams.set("sparkline", "false");
    marketsUrl.searchParams.set("price_change_percentage", "1h,24h");

    const trendingUrl = `${getCoinGeckoBaseUrl()}/search/trending`;

    const [markets, trendingPayload] = await Promise.all([
      withMemoryCache("coingecko:markets", marketsTtl, () => fetchJson<CoinGeckoMarket[]>(marketsUrl.toString(), { headers })),
      withMemoryCache("coingecko:trending", trendingTtl, () => fetchJson<Record<string, unknown>>(trendingUrl, { headers })),
    ]);

    for (const item of Array.isArray(markets) ? markets : []) {
      const symbol = normalizeCryptoBase(item.symbol || "");
      if (!symbol) continue;
      const existing = bySymbol.get(symbol);
      if (!existing || (item.total_volume || 0) > (existing.total_volume || 0)) {
        bySymbol.set(symbol, item);
      }
    }

    const coins = Array.isArray(trendingPayload.coins) ? trendingPayload.coins : [];
    for (const rawCoin of coins) {
      const item = rawCoin && typeof rawCoin === "object" && "item" in rawCoin ? (rawCoin as { item?: { symbol?: string } }).item : null;
      const symbol = normalizeCryptoBase(item?.symbol || "");
      if (symbol) trending.add(symbol);
    }

    return { bySymbol, trending, status: buildStatus({ provider: "coingecko", enabled, ok: true, items: bySymbol.size, cacheTtlSeconds: marketsTtl, error: null }) };
  } catch (error) {
    return { bySymbol, trending, status: buildStatus({ provider: "coingecko", enabled, ok: false, items: 0, cacheTtlSeconds: marketsTtl, error: error instanceof Error ? error.message : "CoinGecko failed." }) };
  }
}

async function loadBinanceCryptoCandidates(context: { bySymbol: Map<string, CoinGeckoMarket>; trending: Set<string> }): Promise<{ items: SkillEdgeScannerItem[]; status: SkillEdgeProviderStatus }> {
  const enabled = getEnvBool("BINANCE_ENABLED", true);
  const ttl = getEnvNumber("BINANCE_CRYPTO_SHORTLIST_REFRESH_SECONDS", 15, 10);

  if (!enabled) {
    return { items: [], status: buildStatus({ provider: "binance", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: "Binance is disabled." }) };
  }

  try {
    const url = `${getBinanceBaseUrl()}/api/v3/ticker/24hr`;
    const data = await withMemoryCache("binance:ticker24h", ttl, () => fetchJson<BinanceTicker24h[]>(url));
    const rows: SkillEdgeScannerItem[] = [];

    for (const item of Array.isArray(data) ? data : []) {
      const pair = item.symbol || "";
      if (!pair.endsWith("USDT")) continue;
      if (pair.includes("UPUSDT") || pair.includes("DOWNUSDT") || pair.includes("BULL") || pair.includes("BEAR")) continue;

      const symbol = normalizeCryptoBase(pair);
      if (!symbol || symbol.length > 12) continue;

      const changePercent = toNumber(item.priceChangePercent, 0);
      const quoteVolume = toNumber(item.quoteVolume, 0) || null;
      const price = toNumber(item.lastPrice, 0) || null;

      if (quoteVolume !== null && quoteVolume < 5_000_000 && Math.abs(changePercent) < 3 && !context.trending.has(symbol)) {
        continue;
      }

      const gecko = context.bySymbol.get(symbol);
      const trendingBoost = context.trending.has(symbol) ? 10 : 0;
      const volume = quoteVolume || gecko?.total_volume || null;
      const score = scoreActivity({
        assetType: "crypto",
        changePercent,
        volume,
        trendingBoost,
      });
      const bucket = getBucket(changePercent);

      rows.push({
        symbol,
        exchange: "BINANCE",
        name: gecko?.name || symbol,
        asset_type: "crypto",
        scan_bucket: bucket,
        direction_bias: getDirection(changePercent),
        price,
        change_percent: changePercent,
        gap_percent: null,
        volume,
        relative_volume: null,
        mentions: context.trending.has(symbol) ? 1 : 0,
        mention_velocity: context.trending.has(symbol) ? 1 : 0,
        sentiment: getSentimentFromChange(changePercent),
        catalyst: context.trending.has(symbol) ? "CoinGecko trending attention" : null,
        risk_label: buildRiskLabel({ bucket, assetType: "crypto" }),
        opportunity_score: score,
        source: context.trending.has(symbol) ? "binance_coingecko" : "binance",
        raw_data: {
          provider: "binance",
          source_breakdown: {
            market: "binance",
            crypto_enrichment: gecko ? "coingecko" : null,
            trending: context.trending.has(symbol) ? "coingecko" : null,
          },
          sourceCoverageNote: "Crypto market activity is based on tracked Binance/CoinGecko sources, not full internet coverage.",
          marketCapRank: gecko?.market_cap_rank || null,
          marketCap: gecko?.market_cap || null,
          geckoId: gecko?.id || null,
          raw: item,
        },
      });
    }

    return { items: rows.sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 180), status: buildStatus({ provider: "binance", enabled, ok: true, items: rows.length, cacheTtlSeconds: ttl, error: null }) };
  } catch (error) {
    return { items: [], status: buildStatus({ provider: "binance", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: error instanceof Error ? error.message : "Binance failed." }) };
  }
}

async function loadHyperliquidCandidates(): Promise<{ items: SkillEdgeScannerItem[]; status: SkillEdgeProviderStatus }> {
  const enabled = getEnvBool("HYPERLIQUID_ENABLED", true);
  const ttl = getEnvNumber("HYPERLIQUID_MIDS_REFRESH_SECONDS", 5, 5);

  if (!enabled) {
    return { items: [], status: buildStatus({ provider: "hyperliquid", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: "Hyperliquid is disabled." }) };
  }

  try {
    const baseUrl = getEnvString("HYPERLIQUID_INFO_URL", getEnvString("HYPERLIQUID_BASE_URL", "https://api.hyperliquid.xyz") + "/info");
    const payload = await withMemoryCache("hyperliquid:metaAndAssetCtxs", ttl, () => postJson<unknown>(baseUrl, { type: "metaAndAssetCtxs" }));
    const rows: SkillEdgeScannerItem[] = [];

    if (Array.isArray(payload) && Array.isArray(payload[0]?.universe) && Array.isArray(payload[1])) {
      const universe = payload[0].universe as Array<{ name?: string }>;
      const ctxs = payload[1] as HyperliquidAssetCtx[];

      for (let index = 0; index < Math.min(universe.length, ctxs.length); index += 1) {
        const symbol = normalizeCryptoBase(universe[index]?.name || ctxs[index]?.name || ctxs[index]?.coin || "");
        if (!symbol) continue;

        const mark = toNumber(ctxs[index]?.markPx ?? ctxs[index]?.midPx, 0) || null;
        const prev = toNumber(ctxs[index]?.prevDayPx, 0) || null;
        const volume = toNumber(ctxs[index]?.dayNtlVlm, 0) || null;
        const changePercent = mark && prev ? ((mark - prev) / prev) * 100 : 0;

        if ((volume || 0) < 5_000_000 && Math.abs(changePercent) < 2.5) continue;

        const bucket = getBucket(changePercent);
        rows.push({
          symbol,
          exchange: "HYPERLIQUID",
          name: `${symbol} Perp`,
          asset_type: "crypto",
          scan_bucket: bucket,
          direction_bias: getDirection(changePercent),
          price: mark,
          change_percent: Number(changePercent.toFixed(2)),
          gap_percent: null,
          volume,
          relative_volume: null,
          mentions: 0,
          mention_velocity: 0,
          sentiment: getSentimentFromChange(changePercent),
          catalyst: "Hyperliquid perps activity",
          risk_label: buildRiskLabel({ bucket, assetType: "crypto" }),
          opportunity_score: scoreActivity({ assetType: "crypto", changePercent, volume, trendingBoost: 3 }),
          source: "hyperliquid",
          raw_data: {
            provider: "hyperliquid",
            source_breakdown: { market: "hyperliquid", perps: "hyperliquid" },
            funding: ctxs[index]?.funding || null,
            openInterest: ctxs[index]?.openInterest || null,
            raw: ctxs[index],
          },
        });
      }
    }

    return { items: rows.sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 100), status: buildStatus({ provider: "hyperliquid", enabled, ok: true, items: rows.length, cacheTtlSeconds: ttl, error: null }) };
  } catch (error) {
    return { items: [], status: buildStatus({ provider: "hyperliquid", enabled, ok: false, items: 0, cacheTtlSeconds: ttl, error: error instanceof Error ? error.message : "Hyperliquid failed." }) };
  }
}

function dedupeBestItems(items: SkillEdgeScannerItem[], maxItems: number) {
  const map = new Map<string, SkillEdgeScannerItem>();

  for (const item of items) {
    const key = `${item.asset_type}:${item.symbol}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    const merged: SkillEdgeScannerItem = {
      ...existing,
      ...item,
      opportunity_score: Math.max(existing.opportunity_score, item.opportunity_score),
      catalyst: existing.catalyst || item.catalyst,
      news_catalyst: existing.news_catalyst || item.news_catalyst,
      source: Array.from(new Set([existing.source, item.source].join("_").split("_").filter(Boolean))).join("_"),
      raw_data: {
        ...existing.raw_data,
        ...item.raw_data,
        mergedSources: [existing.source, item.source],
        sourceCoverageNote: "Merged backend scanner candidate based on tracked sources and cache budget.",
      },
    };

    map.set(key, merged);
  }

  return Array.from(map.values())
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, maxItems);
}

export function getSkillEdgeScannerCacheSeconds() {
  return getEnvNumber("MARKET_DATA_CACHE_TTL_SECONDS", 60, 10, 300);
}

export async function loadSkillEdgeMarketScannerData(): Promise<SkillEdgeScannerSnapshot> {
  if (globalForMarketData.__skillEdgeMarketDataRefresh) {
    return globalForMarketData.__skillEdgeMarketDataRefresh;
  }

  globalForMarketData.__skillEdgeMarketDataRefresh = (async () => {
    const generatedAt = new Date().toISOString();
    const statuses: SkillEdgeProviderStatus[] = [];

    const fmpNews = await loadFmpNewsCatalysts();
    statuses.push(fmpNews.status);

    const fmpStocksPre = await loadFmpStockCandidates(fmpNews.catalysts);
    const stockSymbols = fmpStocksPre.items.map((item) => item.symbol);

    const marketaux = await loadMarketauxCatalysts(stockSymbols);
    statuses.push(marketaux.status);

    const catalysts = mergeCatalystMaps(fmpNews.catalysts, marketaux.catalysts);
    const fmpStocks = await loadFmpStockCandidates(catalysts);
    statuses.push(fmpStocks.status);

    const coinGecko = await loadCoinGeckoContext();
    statuses.push(coinGecko.status);

    const [binance, hyperliquid] = await Promise.all([
      loadBinanceCryptoCandidates({ bySymbol: coinGecko.bySymbol, trending: coinGecko.trending }),
      loadHyperliquidCandidates(),
    ]);

    statuses.push(binance.status, hyperliquid.status);

    const maxItems = getEnvNumber("MARKET_MAX_ENRICHED_CANDIDATES", 120, 50, 250);
    const items = dedupeBestItems(
      [...fmpStocks.items, ...binance.items, ...hyperliquid.items],
      maxItems
    ).map((item) => ({
      ...item,
      raw_data: {
        ...item.raw_data,
        scannerConfig: {
          cacheSeconds: getSkillEdgeScannerCacheSeconds(),
          maxItems,
          clientPollSeconds: getEnvNumber("MARKET_CLIENT_POLL_SECONDS", 60, 10, 300),
          alertsPollSeconds: getEnvNumber("ALERTS_CLIENT_POLL_SECONDS", 15, 5, 120),
        },
        providerStatuses: statuses.map((status) => ({
          provider: status.provider,
          enabled: status.enabled,
          ok: status.ok,
          items: status.items,
          error: status.error,
        })),
      },
    }));

    return { items, providerStatuses: statuses, generatedAt };
  })();

  try {
    return await globalForMarketData.__skillEdgeMarketDataRefresh;
  } finally {
    globalForMarketData.__skillEdgeMarketDataRefresh = null;
  }
}


