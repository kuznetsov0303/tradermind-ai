import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type FmpMover = {
  symbol?: string;
  name?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  exchange?: string;
  volume?: number;
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

type NewsCatalyst = {
  symbol: string;
  title: string;
  site: string | null;
  url: string | null;
  published_at: string | null;
  catalyst_type:
    | "earnings"
    | "offering_or_dilution"
    | "analyst_rating"
    | "biotech_fda"
    | "crypto_related"
    | "legal_or_investigation"
    | "partnership_or_contract"
    | "general_news";
  catalyst_score: number;
};

type ScannerItem = {
  symbol: string;
  exchange: string;
  name: string;
  scan_bucket: "pump_watch" | "dump_watch" | "unusual_volume" | "catalyst_watch";
  direction_bias: "upside" | "downside" | "neutral";
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
news_catalyst?: NewsCatalyst | null;
};

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function getUserPlan(userId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_id, status, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const expiresAt = data?.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt ? expiresAt < Date.now() : false;

  if (!data || isExpired) {
    return "core";
  }

  return normalizePlanId(data.plan_id);
}

function normalizePercent(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isAllowedExchange(exchange?: string) {
  const normalized = (exchange || "").toLowerCase();

  return (
    normalized.includes("nasdaq") ||
    normalized.includes("nyse") ||
    normalized.includes("amex")
  );
}

function cleanSymbol(symbol: string) {
  return symbol
    .replace(".WS", "")
    .replace(".U", "")
    .replace(".W", "")
    .trim()
    .toUpperCase();
}

function isProbablyCommonStock(symbol: string) {
  const s = symbol.toUpperCase();

  if (!s) return false;
  if (s.includes("-")) return false;
  if (s.includes(".")) return false;
  if (s.endsWith("W")) return false;
  if (s.endsWith("WS")) return false;
  if (s.endsWith("U")) return false;
  if (s.endsWith("R")) return false;

  return true;
}

function splitNewsSymbols(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => splitNewsSymbols(item));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,\s|]+/g)
    .map((item) => cleanSymbol(item))
    .filter((item): item is string => Boolean(item));
}

function extractNewsSymbols(item: FmpNewsItem) {
  const symbols = [
    ...splitNewsSymbols(item.symbol),
    ...splitNewsSymbols(item.symbols),
    ...splitNewsSymbols(item.tickers),
  ];

  return Array.from(new Set(symbols)).filter((symbol) =>
    isProbablyCommonStock(symbol)
  );
}

function getNewsPublishedAt(item: FmpNewsItem) {
  return item.publishedDate || item.publishedAt || item.date || null;
}

function getNewsAgeHours(item: FmpNewsItem) {
  const publishedAt = getNewsPublishedAt(item);

  if (!publishedAt) {
    return null;
  }

  const timestamp = new Date(publishedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

function classifyNewsCatalyst(title: string): NewsCatalyst["catalyst_type"] {
  const lower = title.toLowerCase();

  if (
    lower.includes("earnings") ||
    lower.includes("revenue") ||
    lower.includes("eps") ||
    lower.includes("guidance") ||
    lower.includes("quarterly results")
  ) {
    return "earnings";
  }

  if (
    lower.includes("offering") ||
    lower.includes("registered direct") ||
    lower.includes("private placement") ||
    lower.includes("dilution") ||
    lower.includes("atm offering")
  ) {
    return "offering_or_dilution";
  }

  if (
    lower.includes("upgrade") ||
    lower.includes("downgrade") ||
    lower.includes("price target") ||
    lower.includes("initiates coverage") ||
    lower.includes("analyst")
  ) {
    return "analyst_rating";
  }

  if (
    lower.includes("fda") ||
    lower.includes("phase 1") ||
    lower.includes("phase 2") ||
    lower.includes("phase 3") ||
    lower.includes("clinical") ||
    lower.includes("approval")
  ) {
    return "biotech_fda";
  }

  if (
    lower.includes("bitcoin") ||
    lower.includes("crypto") ||
    lower.includes("ethereum") ||
    lower.includes("blockchain")
  ) {
    return "crypto_related";
  }

  if (
    lower.includes("lawsuit") ||
    lower.includes("investigation") ||
    lower.includes("sec") ||
    lower.includes("fraud") ||
    lower.includes("bankruptcy")
  ) {
    return "legal_or_investigation";
  }

  if (
    lower.includes("partnership") ||
    lower.includes("contract") ||
    lower.includes("agreement") ||
    lower.includes("collaboration") ||
    lower.includes("deal")
  ) {
    return "partnership_or_contract";
  }

  return "general_news";
}

function calculateNewsCatalystScore(item: FmpNewsItem) {
  const ageHours = getNewsAgeHours(item);

  let recencyScore = 4;

  if (ageHours !== null) {
    if (ageHours <= 1) recencyScore = 15;
    else if (ageHours <= 6) recencyScore = 12;
    else if (ageHours <= 24) recencyScore = 8;
  }

  const catalystType = classifyNewsCatalyst(item.title || "");

  const typeBoost: Record<NewsCatalyst["catalyst_type"], number> = {
    earnings: 5,
    offering_or_dilution: 6,
    analyst_rating: 4,
    biotech_fda: 6,
    crypto_related: 4,
    legal_or_investigation: 5,
    partnership_or_contract: 5,
    general_news: 2,
  };

  return Math.min(20, recencyScore + typeBoost[catalystType]);
}

function buildNewsCatalystMap(newsItems: FmpNewsItem[]) {
  const newsMap = new Map<string, NewsCatalyst[]>();

  for (const newsItem of newsItems) {
    const title = newsItem.title?.trim();

    if (!title) {
      continue;
    }

    const symbols = extractNewsSymbols(newsItem);

    if (symbols.length === 0) {
      continue;
    }

    const catalystType = classifyNewsCatalyst(title);
    const catalystScore = calculateNewsCatalystScore(newsItem);

    for (const symbol of symbols) {
      const catalyst: NewsCatalyst = {
        symbol,
        title,
        site: newsItem.site || newsItem.publisher || null,
        url: newsItem.url || null,
        published_at: getNewsPublishedAt(newsItem),
        catalyst_type: catalystType,
        catalyst_score: catalystScore,
      };

      const existing = newsMap.get(symbol) || [];
      existing.push(catalyst);

      newsMap.set(
        symbol,
        existing.sort((a, b) => b.catalyst_score - a.catalyst_score)
      );
    }
  }

  return newsMap;
}

function buildCatalystRiskLabel(
  item: ScannerItem,
  catalyst: NewsCatalyst
) {
  if (catalyst.catalyst_type === "offering_or_dilution") {
    return "Fresh offering/dilution headline — high trap risk";
  }

  if (catalyst.catalyst_type === "legal_or_investigation") {
    return "Fresh legal/investigation headline — elevated headline risk";
  }

  if (catalyst.catalyst_type === "earnings") {
    return "Fresh earnings catalyst — watch volume and VWAP reaction";
  }

  if (catalyst.catalyst_type === "biotech_fda") {
    return "Fresh biotech/FDA catalyst — high volatility risk";
  }

  return `${item.risk_label} + fresh news catalyst`;
}

function enrichScannerItemWithNews(
  item: ScannerItem,
  newsMap: Map<string, NewsCatalyst[]>
): ScannerItem {
  const catalysts = newsMap.get(item.symbol) || [];
  const topCatalyst = catalysts[0];

  if (!topCatalyst) {
    return item;
  }

  return {
    ...item,
    catalyst: topCatalyst.title,
    risk_label: buildCatalystRiskLabel(item, topCatalyst),
    opportunity_score: Math.min(
      100,
      Math.round(item.opportunity_score + topCatalyst.catalyst_score)
    ),
    news_catalyst: topCatalyst,
  };
}

function scoreMover(item: FmpMover, bucket: ScannerItem["scan_bucket"]) {
  const changePercent = normalizePercent(item.changesPercentage ?? item.change);
  const volume = typeof item.volume === "number" ? item.volume : null;

  let score = 40;

  score += Math.min(Math.abs(changePercent) * 1.4, 30);

  if (volume) {
    if (volume > 20_000_000) score += 18;
    else if (volume > 5_000_000) score += 12;
    else if (volume > 1_000_000) score += 7;
  }

  if (bucket === "pump_watch" && changePercent > 10) score += 8;
  if (bucket === "dump_watch" && changePercent < -10) score += 8;
  if (bucket === "unusual_volume") score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildScannerItem(
  item: FmpMover,
  bucket: ScannerItem["scan_bucket"]
): ScannerItem | null {
  const rawSymbol = item.symbol || "";
  const symbol = cleanSymbol(rawSymbol);

  if (!isProbablyCommonStock(symbol)) {
    return null;
  }

  const changePercent = normalizePercent(item.changesPercentage ?? item.change);

  const directionBias =
    changePercent > 2 ? "upside" : changePercent < -2 ? "downside" : "neutral";

  const sentiment =
    changePercent > 3 ? "bullish" : changePercent < -3 ? "bearish" : "neutral";

  return {
    symbol,
    exchange: item.exchange || "US",
    name: item.name || symbol,
    scan_bucket: bucket,
    direction_bias: directionBias,
    price: typeof item.price === "number" ? item.price : null,
    change_percent: changePercent,
    gap_percent: null,
    volume: typeof item.volume === "number" ? item.volume : null,
    relative_volume: null,
    mentions: 0,
    mention_velocity: 0,
    sentiment,
    catalyst: null,
    risk_label:
      bucket === "dump_watch"
        ? "Downside momentum / needs catalyst check"
        : bucket === "pump_watch"
          ? "Upside momentum / needs chart confirmation"
          : "Unusual activity / needs confirmation",
    opportunity_score: scoreMover(item, bucket),
    source: "fmp",
  };
}

async function fetchFmpJson(path: string) {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("FMP_API_KEY is missing");
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://financialmodelingprep.com/stable/${path}${separator}apikey=${apiKey}`;

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FMP error ${response.status}: ${text}`);
  }

  return response.json();
}

async function loadFreshScannerData() {
  const [gainers, losers, active, news] = await Promise.allSettled([
  fetchFmpJson("biggest-gainers"),
  fetchFmpJson("biggest-losers"),
  fetchFmpJson("most-actives"),
  fetchFmpJson("news/stock-latest?page=0&limit=100"),
]);
  const rows: ScannerItem[] = [];

  const appendRows = (
    result: PromiseSettledResult<unknown>,
    bucket: ScannerItem["scan_bucket"]
  ) => {
    if (result.status !== "fulfilled" || !Array.isArray(result.value)) {
      return;
    }

    for (const rawItem of result.value.slice(0, 80) as FmpMover[]) {
      if (!isAllowedExchange(rawItem.exchange)) {
        continue;
      }

      const item = buildScannerItem(rawItem, bucket);

      if (item) {
        rows.push(item);
      }
    }
  };

  appendRows(gainers, "pump_watch");
appendRows(losers, "dump_watch");
appendRows(active, "unusual_volume");

const newsItems =
  news.status === "fulfilled" && Array.isArray(news.value)
    ? (news.value as FmpNewsItem[])
    : [];

const newsMap = buildNewsCatalystMap(newsItems);

console.log("News catalyst provider result:", {
  fetchedNews: newsItems.length,
  matchedSymbols: newsMap.size,
});

const enrichedRows = rows.map((item) =>
  enrichScannerItemWithNews(item, newsMap)
);

  const deduped = new Map<string, ScannerItem>();

  for (const item of enrichedRows) {
    const key = `${item.scan_bucket}-${item.symbol}`;
    const existing = deduped.get(key);

    if (!existing || item.opportunity_score > existing.opportunity_score) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values()).sort(
    (a, b) => b.opportunity_score - a.opportunity_score
  );
}

export async function GET(request: Request) {
    const gate = await requireFeatureAccess(request, "ai_scanner", {
    rateLimit: {
      limit: 30,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "social_tickers")) {
      return NextResponse.json(
        {
          error: "Market Intelligence Scanner is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";

    if (!refresh) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: cachedRows } = await supabaseAdmin
        .from("market_scanner_snapshots")
        .select("*")
        .gte("scanned_at", since)
        .order("opportunity_score", { ascending: false })
        .limit(150);

      if (cachedRows && cachedRows.length > 0) {
        return NextResponse.json({
          source: "cache",
          scannedAt: cachedRows[0]?.scanned_at,
          items: cachedRows,
        });
      }
    }

    const freshItems = await loadFreshScannerData();
    const scannedAt = new Date().toISOString();

    if (freshItems.length > 0) {
      await supabaseAdmin.from("market_scanner_snapshots").insert(
        freshItems.map((item) => ({
          symbol: item.symbol,
          exchange: item.exchange,
          name: item.name,
          asset_type: "stock",
          scan_bucket: item.scan_bucket,
          direction_bias: item.direction_bias,
          price: item.price,
          change_percent: item.change_percent,
          gap_percent: item.gap_percent,
          volume: item.volume,
          relative_volume: item.relative_volume,
          mentions: item.mentions,
          mention_velocity: item.mention_velocity,
          sentiment: item.sentiment,
          catalyst: item.catalyst,
          risk_label: item.risk_label,
          opportunity_score: item.opportunity_score,
          raw_data: item,
          source: item.source,
          scanned_at: scannedAt,
        }))
      );
    }

    return NextResponse.json({
      source: "fresh",
      scannedAt,
      items: freshItems,
    });
  } catch (error) {
    console.error("Market scanner error:", error);

    return NextResponse.json(
      { error: "Failed to load market scanner." },
      { status: 500 }
    );
  }
}