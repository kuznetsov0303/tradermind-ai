import type { SkillEdgeCandle } from "@/lib/trading/market-structure";

export type SkillEdgeCandleInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h";

export type SkillEdgeCandleAssetType = "stock" | "crypto";

export type FetchSkillEdgeCandlesParams = {
  symbol: string;
  assetType: SkillEdgeCandleAssetType;
  interval?: SkillEdgeCandleInterval;
  limit?: number;
};

export type FetchSkillEdgeCandlesResult = {
  candles: SkillEdgeCandle[];
  provider: "fmp" | "binance" | "none";
  interval: SkillEdgeCandleInterval;
  error: string | null;
};

function getEnvString(name: string, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getFmpStableBaseUrl() {
  const raw = getEnvString(
    "FMP_STABLE_BASE_URL",
    "https://financialmodelingprep.com/stable"
  )
    .replace(/\/+$/g, "")
    .trim();

  // Stable intraday candles work on the paid key.
  // If env was accidentally set to legacy /api/v3, force the correct stable base.
  if (!raw || raw.includes("/api/v3") || !raw.includes("/stable")) {
    return "https://financialmodelingprep.com/stable";
  }

  return raw;
}

function getBinanceBaseUrl() {
  return getEnvString("BINANCE_MARKET_DATA_BASE_URL", "https://data-api.binance.vision").replace(/\/+$/g, "");
}

function getFmpApiKey() {
  return (
    process.env.FMP_API_KEY ||
    process.env.FINANCIAL_MODELING_PREP_API_KEY ||
    process.env.NEXT_PUBLIC_FMP_API_KEY ||
    ""
  ).trim();
}
function maskFmpApiKeyInUrl(url: string) {
  return url.replace(/apikey=[^&]+/gi, "apikey=***");
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeCryptoSymbol(symbol: string) {
  const clean = normalizeSymbol(symbol)
    .replace("/", "")
    .replace("-", "")
    .replace("_", "");

  if (clean.endsWith("USDT") || clean.endsWith("USDC") || clean.endsWith("BUSD")) {
    return clean;
  }

  return `${clean}USDT`;
}

function mapFmpInterval(interval: SkillEdgeCandleInterval) {
  if (interval === "1m") return "1min";
  if (interval === "5m") return "5min";
  if (interval === "15m") return "15min";
  if (interval === "30m") return "30min";
  if (interval === "1h") return "1hour";
  if (interval === "4h") return "4hour";

  return "5min";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) return 180;

  return Math.max(30, Math.min(500, Math.floor(limit)));
}

function normalizeInterval(interval?: SkillEdgeCandleInterval) {
  return interval || "5m";
}

function parseFmpCandles(payload: unknown): SkillEdgeCandle[] {
  if (!Array.isArray(payload)) return [];

  const candles: SkillEdgeCandle[] = [];

  for (const item of payload) {
    if (!isRecord(item)) continue;

    const open = toNumber(item.open);
    const high = toNumber(item.high);
    const low = toNumber(item.low);
    const close = toNumber(item.close);
    const volume = toNumber(item.volume);
    const timestamp = item.date || item.datetime || item.timestamp;

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      !timestamp
    ) {
      continue;
    }

    candles.push({
      timestamp: String(timestamp),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles.reverse();
}

function parseBinanceCandles(payload: unknown): SkillEdgeCandle[] {
  if (!Array.isArray(payload)) return [];

  const candles: SkillEdgeCandle[] = [];

  for (const item of payload) {
    if (!Array.isArray(item)) continue;

    const timestamp = toNumber(item[0]);
    const open = toNumber(item[1]);
    const high = toNumber(item[2]);
    const low = toNumber(item[3]);
    const close = toNumber(item[4]);
    const volume = toNumber(item[5]);

    if (
      timestamp === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

export async function fetchSkillEdgeCandles({
  symbol,
  assetType,
  interval,
  limit,
}: FetchSkillEdgeCandlesParams): Promise<FetchSkillEdgeCandlesResult> {
  const safeSymbol = normalizeSymbol(symbol);
  const safeInterval = normalizeInterval(interval);
  const safeLimit = normalizeLimit(limit);

  if (!safeSymbol) {
    return {
      candles: [],
      provider: "none",
      interval: safeInterval,
      error: "Missing symbol.",
    };
  }

  if (assetType === "crypto") {
    try {
      const cryptoSymbol = normalizeCryptoSymbol(safeSymbol);
      const url = new URL("/api/v3/klines", getBinanceBaseUrl());

      url.searchParams.set("symbol", cryptoSymbol);
      url.searchParams.set("interval", safeInterval);
      url.searchParams.set("limit", String(safeLimit));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          candles: [],
          provider: "binance",
          interval: safeInterval,
          error: `Binance candles request failed: ${response.status}`,
        };
      }

      const payload = await response.json();
      const candles = parseBinanceCandles(payload);

      return {
        candles,
        provider: "binance",
        interval: safeInterval,
        error: candles.length > 0 ? null : "No Binance candles returned.",
      };
    } catch (error) {
      return {
        candles: [],
        provider: "binance",
        interval: safeInterval,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Binance candles.",
      };
    }
  }

  const fmpApiKey = getFmpApiKey();

  if (!fmpApiKey) {
    return {
      candles: [],
      provider: "fmp",
      interval: safeInterval,
      error: "FMP_API_KEY is not configured.",
    };
  }

  try {
    const fmpInterval = mapFmpInterval(safeInterval);
    const url = new URL(
      `historical-chart/${fmpInterval}`,
      `${getFmpStableBaseUrl()}/`
    );

    url.searchParams.set("symbol", safeSymbol);
    url.searchParams.set("apikey", fmpApiKey);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        candles: [],
        provider: "fmp",
        interval: safeInterval,
        error: `FMP stable candles request failed: ${response.status} ${responseText.slice(
          0,
          180
        )} url=${maskFmpApiKeyInUrl(url.toString())}`,
      };
    }

    let payload: unknown;

    try {
      payload = JSON.parse(responseText);
    } catch {
      return {
        candles: [],
        provider: "fmp",
        interval: safeInterval,
        error: `FMP stable candles returned non-JSON body: ${responseText.slice(
          0,
          180
        )} url=${maskFmpApiKeyInUrl(url.toString())}`,
      };
    }

    const candles = parseFmpCandles(payload).slice(-safeLimit);

    return {
      candles,
      provider: "fmp",
      interval: safeInterval,
      error:
        candles.length > 0
          ? null
          : `No FMP stable candles returned. url=${maskFmpApiKeyInUrl(
              url.toString()
            )}`,
    };  } catch (error) {
    return {
      candles: [],
      provider: "fmp",
      interval: safeInterval,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch FMP candles.",
    };
  }
}

