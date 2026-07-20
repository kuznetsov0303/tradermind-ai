import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type MoverItem = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  volume: string;
  rawVolume: number | null;
  exchange: string;
  volumeSource?: string;
};

function toNumber(value: unknown): number | null {
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

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeSymbol(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function formatCompactNumber(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "N/A";

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function getFmpApiKey() {
  return (
    process.env.FMP_API_KEY ||
    process.env.FINANCIAL_MODELING_PREP_API_KEY ||
    process.env.NEXT_PUBLIC_FMP_API_KEY ||
    ""
  ).trim();
}

function getFmpBaseUrl() {
  return (process.env.FMP_STABLE_BASE_URL || "https://financialmodelingprep.com/stable").replace(
    /\/+$/g,
    ""
  );
}

function normalizeFmpListPayload(payload: unknown): any[] {
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

async function fetchJsonList(url: string): Promise<any[]> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return [];

    const payload = await response.json();

    return normalizeFmpListPayload(payload);
  } catch {
    return [];
  }
}

async function fetchFmpList(path: string, apiKey: string): Promise<any[]> {
  const stableUrl = new URL(`${getFmpBaseUrl()}/${path}`);
  stableUrl.searchParams.set("apikey", apiKey);

  return fetchJsonList(stableUrl.toString());
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function readVolumeFromQuote(row: any): number | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  return firstNumber(
    row.volume,
    row.volAvg,
    row.avgVolume,
    row.averageVolume,
    row.sharesVolume,
    row.dayVolume
  );
}

async function fetchFmpQuoteMap(symbols: string[], apiKey: string) {
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean))).slice(0, 150);
  const quoteBySymbol = new Map<string, any>();

  for (const chunk of chunkArray(uniqueSymbols, 50)) {
    const joined = chunk.join(",");

    const stableBatchUrl = new URL(`${getFmpBaseUrl()}/batch-quote`);
    stableBatchUrl.searchParams.set("symbols", joined);
    stableBatchUrl.searchParams.set("apikey", apiKey);

    let rows = await fetchJsonList(stableBatchUrl.toString());

    if (rows.length === 0) {
      const stableQuoteUrl = new URL(`${getFmpBaseUrl()}/quote`);
      stableQuoteUrl.searchParams.set("symbol", joined);
      stableQuoteUrl.searchParams.set("apikey", apiKey);

      rows = await fetchJsonList(stableQuoteUrl.toString());
    }

    if (rows.length === 0) {
      rows = await fetchJsonList(
        `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${encodeURIComponent(apiKey)}`
      );
    }

    for (const row of rows) {
      const symbol = normalizeSymbol(row.symbol || row.ticker);

      if (symbol) {
        quoteBySymbol.set(symbol, row);
      }
    }
  }

  return quoteBySymbol;
}

function isTradeableUsStock(symbol: string) {
  if (!symbol) return false;
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol)) return false;

  const blocked = new Set([
    "SPY",
    "QQQ",
    "IWM",
    "DIA",
    "VXX",
    "UVXY",
    "SQQQ",
    "TQQQ",
    "SOXL",
    "SOXS",
  ]);

  return !blocked.has(symbol);
}

function isAllowedCryptoSymbol(symbol: string) {
  if (!symbol) return false;

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

  if (blocked.has(symbol)) return false;

  return /^[A-Z0-9]{2,15}$/.test(symbol);
}

function buildStockMover(item: any, quote: any | null): MoverItem | null {
  const symbol = normalizeSymbol(item.symbol || item.ticker);
  const price = firstNumber(item.price, item.lastPrice, quote?.price);
  const changePct =
    firstNumber(
      item.changesPercentage,
      item.changePercentage,
      item.changePercent,
      item.priceChangePercentage,
      item.change,
      item.changes,
      quote?.changesPercentage,
      quote?.changePercentage
    ) ?? 0;

  const volume = readVolumeFromQuote(item) ?? readVolumeFromQuote(quote);

  if (!isTradeableUsStock(symbol)) return null;
  if (price === null || price < 0.4 || price > 500) return null;

  return {
    symbol,
    name: item.name || item.companyName || quote?.name || symbol,
    price,
    changePct,
    volume: formatCompactNumber(volume),
    rawVolume: volume,
    exchange: item.exchangeShortName || item.exchange || quote?.exchangeShortName || quote?.exchange || "US",
    volumeSource: volume === null ? "missing" : quote ? "quote" : "mover",
  };
}

async function getStockMovers(side: "gainers" | "losers", limit: number) {
  const apiKey = getFmpApiKey();

  if (!apiKey) {
    return {
      items: [] as MoverItem[],
      error: "Stock movers provider is not configured.",
      debug: { reason: "missing_fmp_key" },
    };
  }

  const [gainers, losers, active] = await Promise.all([
    fetchFmpList("biggest-gainers", apiKey),
    fetchFmpList("biggest-losers", apiKey),
    fetchFmpList("most-actives", apiKey),
  ]);

  const sourceRows = [...gainers, ...losers, ...active];
  const symbols = sourceRows.map((row) => normalizeSymbol(row.symbol || row.ticker)).filter(Boolean);
  const quoteBySymbol = await fetchFmpQuoteMap(symbols, apiKey);

  const minVolume = Number(process.env.CHART_MOVERS_STOCK_MIN_VOLUME || "100000");
  const minChangePct = Number(process.env.CHART_MOVERS_STOCK_MIN_CHANGE_PCT || "2");

  const bySymbol = new Map<string, MoverItem>();
  let parsedRows = 0;
  let missingVolumeRows = 0;

  for (const raw of sourceRows) {
    const symbol = normalizeSymbol(raw.symbol || raw.ticker);
    const item = buildStockMover(raw, quoteBySymbol.get(symbol) || null);

    if (!item) continue;

    parsedRows += 1;

    if (item.rawVolume === null) {
      missingVolumeRows += 1;
    }

    const sideOk = side === "gainers" ? item.changePct > 0 : item.changePct < 0;
    const changeOk = Math.abs(item.changePct) >= minChangePct;
    const volumeOk = item.rawVolume !== null && item.rawVolume >= minVolume;

    // Для Charts показываем кандидатов даже если FMP не дал volume,
    // но такие строки будут помечены volume: "—".
    // Для Signals seed volume всё равно будет обязательным.
    const displayFallback = item.rawVolume === null && changeOk;

    if (!sideOk || (!volumeOk && !displayFallback)) continue;

    const existing = bySymbol.get(item.symbol);

    if (!existing || Math.abs(item.changePct) > Math.abs(existing.changePct)) {
      bySymbol.set(item.symbol, item);
    }
  }

  const items = Array.from(bySymbol.values())
    .sort((a, b) => side === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct)
    .slice(0, limit);

  return {
    items,
    error:
      items.length === 0
        ? "Stock provider returned rows, but none passed display filters."
        : null,
    debug: {
      stableRows: {
        gainers: gainers.length,
        losers: losers.length,
        active: active.length,
      },
      quoteRows: quoteBySymbol.size,
      parsedRows,
      missingVolumeRows,
      minVolume,
      minChangePct,
    },
  };
}

async function getBinanceMovers(): Promise<MoverItem[]> {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) return [];

  const payload = await response.json();

  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item: any) => {
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
    const price = firstNumber(item.lastPrice);
    const changePct = firstNumber(item.priceChangePercent) ?? 0;
    const volume = firstNumber(item.quoteVolume);

    if (!isAllowedCryptoSymbol(symbol)) return [];
    if (price === null || volume === null || volume <= 0) return [];

    return [{
      symbol,
      name: `${symbol}/USDT`,
      price,
      changePct,
      volume: formatCompactNumber(volume),
      rawVolume: volume,
      exchange: "BINANCE",
    }];
  });
}

async function getHyperliquidMovers(): Promise<MoverItem[]> {
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

  return universe.flatMap((coin, index) => {
    const symbol = normalizeSymbol(coin?.name || "");
    const ctx = contexts[index] || {};
    const price = firstNumber(ctx.markPx, ctx.midPx, ctx.oraclePx);
    const prevDay = firstNumber(ctx.prevDayPx);
    const volume = firstNumber(ctx.dayNtlVlm, ctx.dayBaseVlm);

    if (!isAllowedCryptoSymbol(symbol)) return [];
    if (price === null || volume === null || volume <= 0) return [];

    const changePct = prevDay !== null && prevDay > 0 ? ((price - prevDay) / prevDay) * 100 : 0;

    return [{
      symbol,
      name: `${symbol} Perp`,
      price,
      changePct,
      volume: formatCompactNumber(volume),
      rawVolume: volume,
      exchange: "HYPERLIQUID",
    }];
  });
}

async function getCryptoMovers(side: "gainers" | "losers", limit: number) {
  const minVolume = Number(process.env.CHART_MOVERS_CRYPTO_MIN_VOLUME_USD || "1000000");
  const minChangePct = Number(process.env.CHART_MOVERS_CRYPTO_MIN_CHANGE_PCT || "2");

  const [binance, hyperliquid] = await Promise.all([
    getBinanceMovers(),
    getHyperliquidMovers(),
  ]);

  const bySymbol = new Map<string, MoverItem>();

  for (const item of [...binance, ...hyperliquid]) {
    if (item.rawVolume === null || item.rawVolume < minVolume) continue;

    const sideOk = side === "gainers" ? item.changePct > 0 : item.changePct < 0;
    const changeOk = Math.abs(item.changePct) >= minChangePct;
    const volumeFallback = item.rawVolume >= minVolume * 5 && Math.abs(item.changePct) >= 0.75;

    if (!sideOk || (!changeOk && !volumeFallback)) continue;

    const existing = bySymbol.get(item.symbol);

    if (!existing || (item.rawVolume ?? 0) > (existing.rawVolume ?? 0)) {
      bySymbol.set(item.symbol, item);
    }
  }

  return {
    items: Array.from(bySymbol.values())
      .sort((a, b) => side === "gainers" ? b.changePct - a.changePct : a.changePct - b.changePct)
      .slice(0, limit),
    error: null,
    debug: {
      binanceRows: binance.length,
      hyperliquidRows: hyperliquid.length,
      minVolume,
      minChangePct,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market") === "crypto" ? "crypto" : "stocks";
  const side = url.searchParams.get("side") === "losers" ? "losers" : "gainers";
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "25"), 50));

  const result =
    market === "crypto"
      ? await getCryptoMovers(side, limit)
      : await getStockMovers(side, limit);

  return NextResponse.json({
    source: market === "crypto" ? "binance_hyperliquid_market_activity" : "fmp_market_activity",
    market,
    side,
    items: result.items,
    error: result.error,
    debug: result.debug,
  });
}