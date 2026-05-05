import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type FmpSymbol = {
  symbol?: string;
  name?: string;
  exchange?: string;
  exchangeShortName?: string;
  type?: string;
};

type RedditPost = {
  data?: {
    title?: string;
    selftext?: string;
    created_utc?: number;
    subreddit?: string;
    permalink?: string;
    url?: string;
    score?: number;
    num_comments?: number;
  };
};

type SocialMentionItem = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  source: "reddit";
  mentions_24h: number;
  mentions_1h: number;
  mention_velocity: number;
  sentiment: "bullish" | "neutral" | "bearish";
  social_score: number;
  sample_posts: Array<{
    title: string;
    subreddit: string;
    url: string;
    score: number;
    comments: number;
    created_utc: number;
  }>;
  raw_data: Record<string, unknown>;
};

const REDDIT_SUBREDDITS = [
  "stocks",
  "wallstreetbets",
  "pennystocks",
  "shortsqueeze",
  "StockMarket",
  "Daytrading",
  "trading",
  "investing",
  "smallstreetbets",
];

const COMMON_FALSE_POSITIVES = new Set([
  "A",
  "I",
  "DD",
  "YOLO",
  "CEO",
  "CFO",
  "USA",
  "USD",
  "SEC",
  "FDA",
  "IPO",
  "ETF",
  "ATH",
  "ATM",
  "AI",
  "IT",
  "EV",
  "PE",
  "EPS",
  "ER",
  "PR",
  "PM",
  "AH",
  "HODL",
  "BUY",
  "SELL",
  "PUT",
  "CALL",
  "MOON",
  "BEAR",
  "BULL",
  "NEWS",
  "EDIT",
  "IMO",
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

function normalizeExchange(value?: string | null) {
  const exchange = (value || "").toUpperCase();

  if (exchange.includes("NASDAQ")) return "NASDAQ";
  if (exchange.includes("NYSE")) return "NYSE";
  if (exchange.includes("AMEX")) return "AMEX";

  return exchange || null;
}

function isAllowedExchange(value?: string | null) {
  const exchange = normalizeExchange(value);

  return exchange === "NASDAQ" || exchange === "NYSE" || exchange === "AMEX";
}

function cleanSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function isProbablyCommonStockSymbol(symbol: string) {
  if (!symbol) return false;
  if (symbol.length > 5) return false;
  if (COMMON_FALSE_POSITIVES.has(symbol)) return false;

  return /^[A-Z]{1,5}$/.test(symbol);
}

async function fetchFmpUniverse() {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("FMP_API_KEY is missing");
  }

  const response = await fetch(
    `https://financialmodelingprep.com/stable/stock-list?apikey=${apiKey}`,
    {
      next: { revalidate: 60 * 60 * 6 },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FMP stock-list error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as FmpSymbol[];

  const universe = new Map<
    string,
    {
      symbol: string;
      name: string | null;
      exchange: string | null;
    }
  >();

  for (const item of data) {
    const symbol = cleanSymbol(item.symbol || "");
    const exchange = normalizeExchange(item.exchangeShortName || item.exchange);

    if (!isProbablyCommonStockSymbol(symbol)) {
      continue;
    }

    if (!isAllowedExchange(exchange)) {
      continue;
    }

    const type = (item.type || "").toLowerCase();

    if (
      type.includes("etf") ||
      type.includes("fund") ||
      type.includes("trust") ||
      type.includes("warrant") ||
      type.includes("unit")
    ) {
      continue;
    }

    universe.set(symbol, {
      symbol,
      name: item.name || symbol,
      exchange,
    });
  }

  return universe;
}

function extractSymbolsFromText(text: string, universe: Map<string, unknown>) {
  const symbols = new Set<string>();

  const cashtags = text.match(/\$[A-Za-z]{1,5}\b/g) || [];

  for (const cashtag of cashtags) {
    const symbol = cleanSymbol(cashtag.replace("$", ""));

    if (universe.has(symbol) && isProbablyCommonStockSymbol(symbol)) {
      symbols.add(symbol);
    }
  }

  const uppercaseWords = text.match(/\b[A-Z]{2,5}\b/g) || [];

  for (const word of uppercaseWords) {
    const symbol = cleanSymbol(word);

    if (universe.has(symbol) && isProbablyCommonStockSymbol(symbol)) {
      symbols.add(symbol);
    }
  }

  return Array.from(symbols);
}

function getSentimentFromText(text: string): "bullish" | "neutral" | "bearish" {
  const lower = text.toLowerCase();

  const bullishWords = [
    "squeeze",
    "moon",
    "breakout",
    "bullish",
    "calls",
    "pump",
    "runner",
    "rip",
    "ripping",
    "gap up",
    "long",
    "buying",
    "exploding",
  ];

  const bearishWords = [
    "dump",
    "offering",
    "dilution",
    "bearish",
    "puts",
    "short",
    "collapse",
    "fraud",
    "scam",
    "lawsuit",
    "bankruptcy",
    "delisting",
  ];

  const bullishScore = bullishWords.reduce(
    (score, word) => score + (lower.includes(word) ? 1 : 0),
    0
  );

  const bearishScore = bearishWords.reduce(
    (score, word) => score + (lower.includes(word) ? 1 : 0),
    0
  );

  if (bullishScore > bearishScore) return "bullish";
  if (bearishScore > bullishScore) return "bearish";

  return "neutral";
}

function calculateSocialScore({
  mentions24h,
  mentions1h,
  totalPostScore,
  totalComments,
}: {
  mentions24h: number;
  mentions1h: number;
  totalPostScore: number;
  totalComments: number;
}) {
  const velocity = mentions24h > 0 ? mentions1h / Math.max(mentions24h, 1) : 0;

  let score = 30;

  score += Math.min(mentions24h * 2.2, 35);
  score += Math.min(mentions1h * 7, 20);
  score += Math.min(totalPostScore / 50, 8);
  score += Math.min(totalComments / 40, 7);

  if (velocity >= 0.35) score += 12;
  else if (velocity >= 0.2) score += 7;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchRedditSubredditPosts(subreddit: string) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "SkillEdgeAI/1.0 market-social-scanner",
      Accept: "application/json",
    },
    next: { revalidate: 60 * 10 },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return Array.isArray(data?.data?.children)
    ? (data.data.children as RedditPost[])
    : [];
}

async function loadRedditMentions() {
  const universe = await fetchFmpUniverse();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const dayAgoSeconds = nowSeconds - 24 * 60 * 60;
  const hourAgoSeconds = nowSeconds - 60 * 60;

  const aggregate = new Map<
    string,
    {
      mentions24h: number;
      mentions1h: number;
      sentimentBalance: number;
      totalPostScore: number;
      totalComments: number;
      samplePosts: SocialMentionItem["sample_posts"];
    }
  >();

  const subredditResults = await Promise.allSettled(
    REDDIT_SUBREDDITS.map((subreddit) => fetchRedditSubredditPosts(subreddit))
  );

  for (const result of subredditResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const post of result.value) {
      const postData = post.data;

      if (!postData) {
        continue;
      }

      const createdUtc = Number(postData.created_utc || 0);

      if (!createdUtc || createdUtc < dayAgoSeconds) {
        continue;
      }

      const title = postData.title || "";
      const selftext = postData.selftext || "";
      const fullText = `${title}\n${selftext}`;

      const symbols = extractSymbolsFromText(fullText, universe);

      if (symbols.length === 0) {
        continue;
      }

      const sentiment = getSentimentFromText(fullText);
      const sentimentValue =
        sentiment === "bullish" ? 1 : sentiment === "bearish" ? -1 : 0;

      for (const symbol of symbols) {
        const current =
          aggregate.get(symbol) ||
          {
            mentions24h: 0,
            mentions1h: 0,
            sentimentBalance: 0,
            totalPostScore: 0,
            totalComments: 0,
            samplePosts: [],
          };

        current.mentions24h += 1;

        if (createdUtc >= hourAgoSeconds) {
          current.mentions1h += 1;
        }

        current.sentimentBalance += sentimentValue;
        current.totalPostScore += Number(postData.score || 0);
        current.totalComments += Number(postData.num_comments || 0);

        if (current.samplePosts.length < 3) {
          current.samplePosts.push({
            title,
            subreddit: postData.subreddit || "",
            url: postData.permalink
              ? `https://www.reddit.com${postData.permalink}`
              : postData.url || "",
            score: Number(postData.score || 0),
            comments: Number(postData.num_comments || 0),
            created_utc: createdUtc,
          });
        }

        aggregate.set(symbol, current);
      }
    }
  }

  const items: SocialMentionItem[] = [];

  for (const [symbol, data] of aggregate.entries()) {
    const meta = universe.get(symbol);

    if (!meta) {
      continue;
    }

    const sentiment =
      data.sentimentBalance > 0
        ? "bullish"
        : data.sentimentBalance < 0
          ? "bearish"
          : "neutral";

    const mentionVelocity =
      data.mentions24h > 0
        ? Number((data.mentions1h / data.mentions24h).toFixed(3))
        : 0;

    const socialScore = calculateSocialScore({
      mentions24h: data.mentions24h,
      mentions1h: data.mentions1h,
      totalPostScore: data.totalPostScore,
      totalComments: data.totalComments,
    });

    items.push({
      symbol,
      exchange: meta.exchange,
      name: meta.name,
      source: "reddit",
      mentions_24h: data.mentions24h,
      mentions_1h: data.mentions1h,
      mention_velocity: mentionVelocity,
      sentiment,
      social_score: socialScore,
      sample_posts: data.samplePosts,
      raw_data: {
        totalPostScore: data.totalPostScore,
        totalComments: data.totalComments,
      },
    });
  }

  return items
    .sort((a, b) => b.social_score - a.social_score)
    .slice(0, 100);
}

export async function GET(request: Request) {
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
            "Social Attention Scanner is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";

    if (!refresh) {
      const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      const { data: cachedRows } = await supabaseAdmin
        .from("market_social_mentions")
        .select("*")
        .gte("scanned_at", since)
        .order("social_score", { ascending: false })
        .limit(100);

      if (cachedRows && cachedRows.length > 0) {
        return NextResponse.json({
          source: "cache",
          provider: "reddit",
          scannedAt: cachedRows[0]?.scanned_at,
          items: cachedRows,
        });
      }
    }

    const freshItems = await loadRedditMentions();
    const scannedAt = new Date().toISOString();

    if (freshItems.length > 0) {
      await supabaseAdmin.from("market_social_mentions").insert(
        freshItems.map((item) => ({
          symbol: item.symbol,
          exchange: item.exchange,
          name: item.name,
          source: item.source,
          mentions_24h: item.mentions_24h,
          mentions_1h: item.mentions_1h,
          mention_velocity: item.mention_velocity,
          sentiment: item.sentiment,
          social_score: item.social_score,
          sample_posts: item.sample_posts,
          raw_data: item.raw_data,
          scanned_at: scannedAt,
        }))
      );
    }

    return NextResponse.json({
      source: "fresh",
      provider: "reddit",
      scannedAt,
      items: freshItems,
    });
  } catch (error) {
    console.error("Social mentions scanner error:", error);

    return NextResponse.json(
      { error: "Failed to load social mentions scanner." },
      { status: 500 }
    );
  }
}