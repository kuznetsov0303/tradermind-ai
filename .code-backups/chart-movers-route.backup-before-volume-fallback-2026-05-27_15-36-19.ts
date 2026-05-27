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
  change?: number | string | null;
  changes?: number | string | null;
  volume?: number | string | null;
  exchange?: string | null;
  exchangeShortName?: string | null;
};

function getFmpApiKey() {
  return (
    process.env.FMP_API_KEY ||
    process.env.FINANCIAL_MODELING_PREP_API_KEY ||
    process.env.NEXT_PUBLIC_FMP_API_KEY ||
    ""
  ).trim();
}

function getFmpBaseUrl() {
  return (
    process.env.FMP_STABLE_BASE_URL ||
    "https://financialmodelingprep.com/stable"
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

function isProbablyUsStock(symbol: string) {
  if (!symbol) return false;
  if (!/^[A-Z][A-Z.\-]{0,7}$/.test(symbol)) return false;

  const blockedSuffixes = ["W", "WS", "WT", "U", "UN", "R"];

  if (
    symbol.length >= 5 &&
    blockedSuffixes.some((suffix) => symbol.endsWith(suffix))
  ) {
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

async function fetchFmpMovers(side: MoverSide) {
  const apiKey = getFmpApiKey();

  if (!apiKey) {
    throw new Error("Stock movers are not configured on the current market data stack.");
  }

  const endpoint = side === "losers" ? "biggest-losers" : "biggest-gainers";
  const url = new URL(`${getFmpBaseUrl()}/${endpoint}`);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Stock movers are unavailable on the current market data stack.");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Stock movers returned invalid market data.");
  }

  return data as FmpMover[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const side: MoverSide =
      searchParams.get("side") === "losers" ? "losers" : "gainers";

    const rawLimit = Number(searchParams.get("limit") || 25);
    const limit = Math.max(5, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 25));
    const minVolume = Number(process.env.CHART_STOCK_MOVERS_MIN_VOLUME || 100000);

    const rawMovers = await fetchFmpMovers(side);

    const items = rawMovers
      .map((item) => {
        const symbol = normalizeSymbol(item.symbol || item.ticker);
        const changePct =
          parseNumber(item.changesPercentage) ??
          parseNumber(item.change) ??
          parseNumber(item.changes) ??
          0;
        const price = parseNumber(item.price);
        const volumeNumber = parseNumber(item.volume);

        return {
          symbol,
          name: item.companyName || item.name || symbol,
          price,
          changePct,
          volume: formatCompactNumber(volumeNumber),
          rawVolume: volumeNumber ?? 0,
        };
      })
      .filter((item) => {
        if (!isProbablyUsStock(item.symbol)) return false;
        if (!Number.isFinite(item.changePct)) return false;
        if (item.rawVolume < minVolume) return false;

        return side === "gainers" ? item.changePct > 0 : item.changePct < 0;
      })
      .sort((a, b) =>
        side === "gainers"
          ? b.changePct - a.changePct
          : a.changePct - b.changePct
      )
      .slice(0, limit)
      .map(({ rawVolume, ...item }) => item);

    return NextResponse.json(
      {
        ok: true,
        market: "stocks",
        side,
        items,
        updatedAt: new Date().toISOString(),
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