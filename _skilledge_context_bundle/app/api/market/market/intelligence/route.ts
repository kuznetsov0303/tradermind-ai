import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type MarketScannerRow = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  asset_type?: string | null;
  scan_bucket?: string | null;
  direction_bias?: "upside" | "downside" | "neutral" | string | null;
  price?: number | null;
  change_percent?: number | null;
  gap_percent?: number | null;
  volume?: number | null;
  relative_volume?: number | null;
  mentions?: number | null;
  mention_velocity?: number | null;
  sentiment?: "bullish" | "neutral" | "bearish" | string | null;
  catalyst?: string | null;
  risk_label?: string | null;
  opportunity_score?: number | null;
  raw_data?: Record<string, unknown> | null;
  source?: string | null;
  scanned_at?: string | null;
};

type SocialMentionRow = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  source?: string | null;
  mentions_24h?: number | null;
  mentions_1h?: number | null;
  mention_velocity?: number | null;
  sentiment?: "bullish" | "neutral" | "bearish" | string | null;
  social_score?: number | null;
  sample_posts?: unknown;
  raw_data?: Record<string, unknown> | null;
  scanned_at?: string | null;
};

type UnifiedSignal = "combined" | "market_only" | "social_only";

type CatalystType =
  | "earnings"
  | "offering_or_dilution"
  | "analyst_rating"
  | "biotech_fda"
  | "crypto_related"
  | "legal_or_investigation"
  | "partnership_or_contract"
  | "general_news";

type NormalizedCatalyst = {
  title: string;
  site: string | null;
  url: string | null;
  published_at: string | null;
  catalyst_type: CatalystType | "unknown";
  catalyst_score: number;
};

type SocialAggregate = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  sources: string[];
  mentions_24h: number;
  mentions_1h: number;
  mention_velocity: number;
  sentiment: "bullish" | "neutral" | "bearish";
  social_score: number;
  sample_posts: unknown[];
  raw_data: Record<string, unknown>;
  scanned_at: string | null;
};

const CRYPTO_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "TRX",
  "TON",
  "MATIC",
  "ARB",
  "OP",
  "SUI",
  "APT",
  "NEAR",
  "LTC",
  "BCH",
  "PEPE",
  "SHIB",
  "WIF",
  "BONK",
  "FLOKI",
  "RUNE",
  "INJ",
  "SEI",
  "TIA",
  "JUP",
  "PYTH",
  "WLD",
]);

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

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getAssetType(symbol: string, market?: MarketScannerRow | null) {
  const exchange = (market?.exchange || "").toUpperCase();
  const assetType = (market?.asset_type || "").toLowerCase();

  if (assetType === "crypto" || exchange === "BINANCE" || CRYPTO_SYMBOLS.has(symbol)) {
    return "crypto";
  }

  return "stock";
}

function normalizeCatalystFromMarket(row?: MarketScannerRow | null): NormalizedCatalyst | null {
  if (!row) {
    return null;
  }

  const rawData = isRecord(row.raw_data) ? row.raw_data : null;
  const rawCatalyst = rawData && isRecord(rawData.news_catalyst)
    ? rawData.news_catalyst
    : null;

  if (rawCatalyst) {
    return {
      title:
        readString(rawCatalyst.title) ||
        readString(row.catalyst) ||
        "Fresh catalyst detected",
      site: readString(rawCatalyst.site),
      url: readString(rawCatalyst.url),
      published_at: readString(rawCatalyst.published_at),
      catalyst_type:
        (readString(rawCatalyst.catalyst_type) as NormalizedCatalyst["catalyst_type"]) ||
        "unknown",
      catalyst_score: readNumber(rawCatalyst.catalyst_score),
    };
  }

  if (row.catalyst) {
    return {
      title: row.catalyst,
      site: null,
      url: null,
      published_at: null,
      catalyst_type: "unknown",
      catalyst_score: 8,
    };
  }

  return null;
}

function getSentimentValue(sentiment?: string | null) {
  if (sentiment === "bullish") return 1;
  if (sentiment === "bearish") return -1;
  return 0;
}

function normalizeSentiment(value: number): "bullish" | "neutral" | "bearish" {
  if (value > 0) return "bullish";
  if (value < 0) return "bearish";
  return "neutral";
}

function aggregateSocialRows(rows: SocialMentionRow[]) {
  const map = new Map<string, SocialAggregate>();

  for (const row of rows) {
    const symbol = normalizeSymbol(row.symbol || "");

    if (!symbol) {
      continue;
    }

    const existing =
      map.get(symbol) ||
      {
        symbol,
        exchange: row.exchange || null,
        name: row.name || symbol,
        sources: [],
        mentions_24h: 0,
        mentions_1h: 0,
        mention_velocity: 0,
        sentiment: "neutral" as const,
        social_score: 0,
        sample_posts: [],
        raw_data: {},
        scanned_at: row.scanned_at || null,
      };

    const source = row.source || "unknown";

    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }

    existing.mentions_24h += toNumber(row.mentions_24h);
    existing.mentions_1h += toNumber(row.mentions_1h);
    existing.social_score = Math.max(existing.social_score, toNumber(row.social_score));
    existing.mention_velocity = Math.max(
      existing.mention_velocity,
      toNumber(row.mention_velocity)
    );

    const sentimentBalance =
      getSentimentValue(existing.sentiment) + getSentimentValue(row.sentiment);

    existing.sentiment = normalizeSentiment(sentimentBalance);

    if (Array.isArray(row.sample_posts)) {
      existing.sample_posts.push(...row.sample_posts.slice(0, 3));
    }

    existing.raw_data = {
      ...existing.raw_data,
      [source]: row.raw_data || {},
    };

    if (row.scanned_at && (!existing.scanned_at || row.scanned_at > existing.scanned_at)) {
      existing.scanned_at = row.scanned_at;
    }

    map.set(symbol, existing);
  }

  return map;
}

function pickBestMarketRows(rows: MarketScannerRow[]) {
  const map = new Map<string, MarketScannerRow>();

  for (const row of rows) {
    const symbol = normalizeSymbol(row.symbol || "");

    if (!symbol) {
      continue;
    }

    const existing = map.get(symbol);
    const score = toNumber(row.opportunity_score);
    const existingScore = toNumber(existing?.opportunity_score);

    if (!existing || score > existingScore) {
      map.set(symbol, {
        ...row,
        symbol,
      });
    }
  }

  return map;
}

function calculateUnifiedScore(params: {
  signal: UnifiedSignal;
  marketScore: number;
  socialScore: number;
  changePercent: number;
  mentions24h: number;
  mentions1h: number;
  catalyst: NormalizedCatalyst | null;
}) {
  const catalystBoost = params.catalyst
    ? clamp(params.catalyst.catalyst_score || 8, 4, 18)
    : 0;

  const velocity =
    params.mentions24h > 0 ? params.mentions1h / Math.max(params.mentions24h, 1) : 0;

  const velocityBoost = velocity >= 0.35 ? 7 : velocity >= 0.2 ? 4 : 0;
  const strongMoveBoost = Math.abs(params.changePercent) >= 10 ? 5 : 0;

  if (params.signal === "combined") {
    return Math.round(
      clamp(
        params.marketScore * 0.56 +
          params.socialScore * 0.32 +
          catalystBoost +
          velocityBoost +
          strongMoveBoost
      )
    );
  }

  if (params.signal === "market_only") {
    return Math.round(
      clamp(params.marketScore * 0.84 + catalystBoost + strongMoveBoost)
    );
  }

  return Math.round(
    clamp(
      params.socialScore * 0.82 +
        Math.min(params.mentions24h * 1.2, 10) +
        velocityBoost
    )
  );
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatVolume(value?: number | null) {
  if (!value) return null;

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B volume`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M volume`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K volume`;
  }

  return `${value} volume`;
}

function buildReason(params: {
  signal: UnifiedSignal;
  market: MarketScannerRow | null;
  social: SocialAggregate | null;
  catalyst: NormalizedCatalyst | null;
}) {
  const parts: string[] = [];

  const changePercent = toNumber(params.market?.change_percent);
  const volumeLabel = formatVolume(params.market?.volume || null);

  if (params.market) {
    if (changePercent !== 0) {
      parts.push(`price move ${formatPercent(changePercent)}`);
    }

    if (volumeLabel) {
      parts.push(volumeLabel);
    }

    if (params.market.scan_bucket === "pump_watch") {
      parts.push("pump watch");
    } else if (params.market.scan_bucket === "dump_watch") {
      parts.push("dump watch");
    } else if (params.market.scan_bucket === "unusual_volume") {
      parts.push("unusual volume");
    }
  }

  if (params.social) {
    const sourceLabel = params.social.sources.includes("stocktwits")
      ? "Reddit + Stocktwits"
      : params.social.sources.includes("reddit")
        ? "Reddit"
        : "social";

    parts.push(`${sourceLabel} ${params.social.mentions_24h} mentions / 24H`);

    if (params.social.mentions_1h > 0) {
      parts.push(`${params.social.mentions_1h} mentions / 1H`);
    }
  }

  

  if (parts.length === 0) {
    return "Market Intelligence candidate detected.";
  }

  if (params.signal === "combined") {
    return `Combined signal: ${parts.join(" · ")}.`;
  }

  if (params.signal === "market_only") {
    return `Market activity: ${parts.join(" · ")}.`;
  }

  return `Social attention: ${parts.join(" · ")}.`;
}

function buildRiskNote(params: {
  market: MarketScannerRow | null;
  catalyst: NormalizedCatalyst | null;
}) {
  const catalystType = params.catalyst?.catalyst_type;

  if (catalystType === "offering_or_dilution") {
    return "Fresh offering/dilution catalyst detected — high trap and dilution risk.";
  }

  if (catalystType === "legal_or_investigation") {
    return "Fresh legal/investigation catalyst detected — elevated headline risk.";
  }

  if (catalystType === "biotech_fda") {
    return "Biotech/FDA catalyst detected — expect high volatility and fast reversals.";
  }

  if (catalystType === "earnings") {
    return "Fresh earnings catalyst detected — watch volume, VWAP reaction and failed follow-through.";
  }

  if (params.market?.risk_label) {
    return params.market.risk_label;
  }

  return "Wait for confirmation. Avoid chasing extended moves without structure.";
}

function buildUnifiedItem(params: {
  symbol: string;
  market: MarketScannerRow | null;
  social: SocialAggregate | null;
}) {
  const signal: UnifiedSignal =
    params.market && params.social
      ? "combined"
      : params.market
        ? "market_only"
        : "social_only";

  const catalyst = normalizeCatalystFromMarket(params.market);
  const marketScore = toNumber(params.market?.opportunity_score);
  const socialScore = toNumber(params.social?.social_score);
  const changePercent = toNumber(params.market?.change_percent);
  const mentions24h = toNumber(params.social?.mentions_24h);
  const mentions1h = toNumber(params.social?.mentions_1h);

  const score = calculateUnifiedScore({
    signal,
    marketScore,
    socialScore,
    changePercent,
    mentions24h,
    mentions1h,
    catalyst,
  });

  return {
    symbol: params.symbol,
    exchange: params.market?.exchange || params.social?.exchange || null,
    name: params.market?.name || params.social?.name || params.symbol,
    asset_type: getAssetType(params.symbol, params.market),
    signal,
    score,
    market_score: marketScore,
    social_score: socialScore,
    change_percent: params.market?.change_percent ?? null,
    price: params.market?.price ?? null,
    volume: params.market?.volume ?? null,
    mentions_24h: params.social?.mentions_24h ?? 0,
    mentions_1h: params.social?.mentions_1h ?? 0,
    mention_velocity: params.social?.mention_velocity ?? 0,
    sentiment: params.social?.sentiment || params.market?.sentiment || "neutral",
    catalyst,
    reason: buildReason({
      signal,
      market: params.market,
      social: params.social,
      catalyst,
    }),
    risk_note: buildRiskNote({
      market: params.market,
      catalyst,
    }),
    sources: {
      market: params.market?.source || null,
      social: params.social?.sources || [],
    },
    raw: {
      market: params.market,
      social: params.social,
    },
    scanned_at: params.market?.scanned_at || params.social?.scanned_at || null,
  };
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
          error:
            "Market Intelligence Center is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const marketCacheSeconds = Number(process.env.MARKET_DATA_CACHE_TTL_SECONDS || "60");
    const socialCacheSeconds = Number(process.env.MARKET_SOCIAL_CACHE_TTL_SECONDS || "600");

    const marketSince = new Date(
      Date.now() - Math.max(marketCacheSeconds * 5, 20 * 60) * 1000
    ).toISOString();
    const socialSince = new Date(
      Date.now() - Math.max(socialCacheSeconds * 3, 30 * 60) * 1000
    ).toISOString();

    const [marketResult, socialResult] = await Promise.all([
      supabaseAdmin
        .from("market_scanner_snapshots")
        .select("*")
        .gte("scanned_at", marketSince)
        .order("opportunity_score", { ascending: false })
        .limit(250),
      supabaseAdmin
        .from("market_social_mentions")
        .select("*")
        .gte("scanned_at", socialSince)
        .order("social_score", { ascending: false })
        .limit(250),
    ]);

    if (marketResult.error) {
      console.error("Unified intelligence market load error:", marketResult.error);
    }

    if (socialResult.error) {
      console.error("Unified intelligence social load error:", socialResult.error);
    }

    const marketRows = ((marketResult.data || []) as MarketScannerRow[]).filter(
      (item) => normalizeSymbol(item.symbol || "")
    );

    const socialRows = ((socialResult.data || []) as SocialMentionRow[]).filter(
      (item) => normalizeSymbol(item.symbol || "")
    );

    const marketBySymbol = pickBestMarketRows(marketRows);
    const socialBySymbol = aggregateSocialRows(socialRows);

    const symbols = new Set<string>([
      ...Array.from(marketBySymbol.keys()),
      ...Array.from(socialBySymbol.keys()),
    ]);

    const items = Array.from(symbols)
      .map((symbol) =>
        buildUnifiedItem({
          symbol,
          market: marketBySymbol.get(symbol) || null,
          social: socialBySymbol.get(symbol) || null,
        })
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 150);

    const scannedAt =
      items[0]?.scanned_at || new Date().toISOString();

    const metrics = {
      total: items.length,
      combined: items.filter((item) => item.signal === "combined").length,
      marketOnly: items.filter((item) => item.signal === "market_only").length,
      socialOnly: items.filter((item) => item.signal === "social_only").length,
      crypto: items.filter((item) => item.asset_type === "crypto").length,
      withCatalyst: items.filter((item) => Boolean(item.catalyst)).length,
    };

    console.log("Unified Market Intelligence result:", {
      marketRows: marketRows.length,
      socialRows: socialRows.length,
      items: items.length,
      metrics,
      topSymbols: items.slice(0, 10).map((item) => ({
        symbol: item.symbol,
        signal: item.signal,
        score: item.score,
        reason: item.reason,
      })),
    });

    return NextResponse.json({
      source: "unified_market_intelligence",
      provider: "fmp_finnhub_marketaux_coingecko_binance_hyperliquid_cache",
      scannedAt,
      metrics,
      items,
    });
  } catch (error) {
    console.error("Unified Market Intelligence error:", error);

    return NextResponse.json(
      { error: "Failed to load unified market intelligence." },
      { status: 500 }
    );
  }
}
