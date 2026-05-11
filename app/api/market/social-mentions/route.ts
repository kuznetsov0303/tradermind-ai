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

type BinanceExchangeInfoSymbol = {
  symbol?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  isSpotTradingAllowed?: boolean;
  permissions?: string[];
};

type BinanceExchangeInfoResponse = {
  symbols?: BinanceExchangeInfoSymbol[];
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

type SocialMentionSource = "reddit" | "stocktwits";

type SocialMentionItem = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  source: SocialMentionSource;
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

type StocktwitsSymbol = {
  id?: number;
  symbol?: string;
  title?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  trending?: boolean;
  trending_score?: number;
  watchlist_count?: number;
};

type StocktwitsMessage = {
  id?: number;
  body?: string;
  created_at?: string;
  user?: {
    id?: number;
    username?: string;
    followers?: number;
  };
  symbols?: StocktwitsSymbol[];
  entities?: {
    sentiment?: {
      basic?: "Bullish" | "Bearish" | string | null;
    } | null;
  };
};

type StocktwitsSymbolStreamResponse = {
  response?: {
    status?: number;
  };
  symbol?: StocktwitsSymbol;
  messages?: StocktwitsMessage[];
  errors?: Array<{
    message?: string;
  }>;
};

type SocialEnrichmentCandidate = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  opportunity_score: number;
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

const STATIC_US_STOCK_UNIVERSE: Array<{
  symbol: string;
  name: string;
  exchange: "NASDAQ" | "NYSE" | "AMEX";
}> = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ" },
  { symbol: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ" },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", exchange: "NASDAQ" },
  { symbol: "SMCI", name: "Super Micro Computer Inc.", exchange: "NASDAQ" },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ" },
  { symbol: "INTC", name: "Intel Corporation", exchange: "NASDAQ" },
  { symbol: "COIN", name: "Coinbase Global Inc.", exchange: "NASDAQ" },
  { symbol: "MARA", name: "MARA Holdings Inc.", exchange: "NASDAQ" },
  { symbol: "RIOT", name: "Riot Platforms Inc.", exchange: "NASDAQ" },
  { symbol: "SOFI", name: "SoFi Technologies Inc.", exchange: "NASDAQ" },
  { symbol: "HOOD", name: "Robinhood Markets Inc.", exchange: "NASDAQ" },
  { symbol: "GME", name: "GameStop Corp.", exchange: "NYSE" },
  { symbol: "AMC", name: "AMC Entertainment Holdings Inc.", exchange: "NYSE" },
  { symbol: "BBAI", name: "BigBear.ai Holdings Inc.", exchange: "NYSE" },
  { symbol: "SOUN", name: "SoundHound AI Inc.", exchange: "NASDAQ" },
  { symbol: "IONQ", name: "IonQ Inc.", exchange: "NYSE" },
  { symbol: "RGTI", name: "Rigetti Computing Inc.", exchange: "NASDAQ" },
  { symbol: "QBTS", name: "D-Wave Quantum Inc.", exchange: "NYSE" },
  { symbol: "RKLB", name: "Rocket Lab USA Inc.", exchange: "NASDAQ" },
  { symbol: "ASTS", name: "AST SpaceMobile Inc.", exchange: "NASDAQ" },
  { symbol: "NIO", name: "NIO Inc.", exchange: "NYSE" },
  { symbol: "LCID", name: "Lucid Group Inc.", exchange: "NASDAQ" },
  { symbol: "RIVN", name: "Rivian Automotive Inc.", exchange: "NASDAQ" },
  { symbol: "OPEN", name: "Opendoor Technologies Inc.", exchange: "NASDAQ" },
  { symbol: "WULF", name: "TeraWulf Inc.", exchange: "NASDAQ" },
  { symbol: "HIMS", name: "Hims & Hers Health Inc.", exchange: "NYSE" },
  { symbol: "CVNA", name: "Carvana Co.", exchange: "NYSE" },
  { symbol: "UPST", name: "Upstart Holdings Inc.", exchange: "NASDAQ" },
  
  { symbol: "JOBY", name: "Joby Aviation Inc.", exchange: "NYSE" },
  { symbol: "ACHR", name: "Archer Aviation Inc.", exchange: "NYSE" },
  { symbol: "KULR", name: "KULR Technology Group Inc.", exchange: "AMEX" },
  { symbol: "SERV", name: "Serve Robotics Inc.", exchange: "NASDAQ" },
  { symbol: "TEM", name: "Tempus AI Inc.", exchange: "NASDAQ" },
  { symbol: "CRWV", name: "CoreWeave Inc.", exchange: "NASDAQ" },
  { symbol: "UNH", name: "UnitedHealth Group Inc.", exchange: "NYSE" },
  { symbol: "LLY", name: "Eli Lilly and Company", exchange: "NYSE" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE" },
  { symbol: "BAC", name: "Bank of America Corporation", exchange: "NYSE" },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ" },
  { symbol: "BA", name: "The Boeing Company", exchange: "NYSE" },
  { symbol: "BABA", name: "Alibaba Group Holding Limited", exchange: "NYSE" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "AMEX" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", exchange: "AMEX" },
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
  if (symbol.length > 10) return false;
  if (COMMON_FALSE_POSITIVES.has(symbol)) return false;

  return /^[A-Z]{1,10}$/.test(symbol);
}
async function fetchFmpUniverse() {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("FMP_API_KEY is missing");
  }

  const urls = [
  `https://financialmodelingprep.com/stable/actively-trading-list?apikey=${apiKey}`,
];

  const universe = new Map<
    string,
    {
      symbol: string;
      name: string | null;
      exchange: string | null;
    }
  >();

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        next: { revalidate: 60 * 60 * 6 },
      });

      if (!response.ok) {
        const text = await response.text();

        console.warn("FMP universe endpoint failed:", {
          status: response.status,
          url,
          text: text.slice(0, 300),
        });

        continue;
      }

      const data = (await response.json()) as FmpSymbol[];

      if (!Array.isArray(data)) {
        console.warn("FMP universe endpoint returned non-array:", {
          url,
          dataType: typeof data,
        });

        continue;
      }

      for (const item of data) {
        const symbol = cleanSymbol(item.symbol || "");
        const exchange = normalizeExchange(
          item.exchangeShortName || item.exchange
        );

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

      if (universe.size > 0) {
        console.log("FMP universe loaded:", {
          size: universe.size,
          url,
        });

        break;
      }
    } catch (error) {
      console.warn("FMP universe endpoint error:", {
        url,
        error,
      });
    }
  }

    if (universe.size === 0) {
    console.warn("FMP universe is empty. Using static fallback universe.");

    for (const item of STATIC_US_STOCK_UNIVERSE) {
      universe.set(item.symbol, {
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
      });
    }
  }

  
  return universe;
}

async function fetchBinanceUniverse() {
  const universe = new Map<
    string,
    {
      symbol: string;
      name: string | null;
      exchange: string | null;
    }
  >();

  try {
    const response = await fetch("https://api.binance.com/api/v3/exchangeInfo", {
  cache: "no-store",
});
    if (!response.ok) {
      const text = await response.text();

      console.warn("Binance exchangeInfo failed:", {
        status: response.status,
        text: text.slice(0, 300),
      });

      return universe;
    }

    const data = (await response.json()) as BinanceExchangeInfoResponse;

    const symbols = Array.isArray(data.symbols) ? data.symbols : [];

    for (const item of symbols) {
      const baseAsset = cleanSymbol(item.baseAsset || "");
      const quoteAsset = cleanSymbol(item.quoteAsset || "");

      if (!baseAsset || quoteAsset !== "USDT") {
        continue;
      }

      if (item.status && item.status !== "TRADING") {
        continue;
      }

      if (item.isSpotTradingAllowed === false) {
        continue;
      }

      if (!isProbablyCommonStockSymbol(baseAsset)) {
        continue;
      }

      universe.set(baseAsset, {
        symbol: baseAsset,
        name: baseAsset,
        exchange: "BINANCE",
      });
    }

    console.log("Binance universe loaded:", {
      size: universe.size,
    });

    return universe;
  } catch (error) {
    console.warn("Binance universe error:", error);
    return universe;
  }
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

  const uppercaseWords = text.match(/\b[A-Z]{2,10}\b/g) || [];

  for (const word of uppercaseWords) {
    const symbol = cleanSymbol(word);

    if (universe.has(symbol) && isProbablyCommonStockSymbol(symbol)) {
      symbols.add(symbol);
    }
  }

  const commonTickerPatterns =
  text.match(
    /\b(TSLA|NVDA|AMD|AAPL|MSFT|META|GOOG|GOOGL|AMZN|PLTR|MARA|RIOT|COIN|SOFI|GME|AMC|BBBY|HOOD|NIO|LCID|RIVN|SMCI|AVGO|INTC|BBAI|SOUN|IONQ|RGTI|QBTS|RKLB|ASTS|BTC|ETH|BNB|SOL|XRP|DOGE|ADA|AVAX|LINK|DOT|TON|TRX|MATIC|ARB|OP|SUI|APT|NEAR|LTC|BCH|PEPE|SHIB|WIF|BONK|FLOKI|RUNE|INJ|SEI|TIA|JUP|PYTH|WLD)\b/gi
  ) || [];

  for (const ticker of commonTickerPatterns) {
    const symbol = cleanSymbol(ticker);

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

async function loadLatestMarketCandidatesForSocialEnrichment() {
  const maxCandidates = Number(
    process.env.STOCKTWITS_MAX_CANDIDATES_PER_REFRESH || "50"
  );

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("market_scanner_snapshots")
    .select("symbol, exchange, name, opportunity_score, scanned_at")
    .gte("scanned_at", since)
    .order("opportunity_score", { ascending: false })
    .limit(250);

  if (error) {
    console.warn("Failed to load market candidates for Stocktwits:", error);
  }

  const candidates = new Map<string, SocialEnrichmentCandidate>();

  for (const row of data || []) {
    const symbol = cleanSymbol(String(row.symbol || ""));
    const exchange = normalizeExchange(String(row.exchange || ""));

    if (!symbol || !isProbablyCommonStockSymbol(symbol)) {
      continue;
    }

    if (!isAllowedExchange(exchange)) {
      continue;
    }

    const existing = candidates.get(symbol);
    const opportunityScore = Number(row.opportunity_score || 0);

    if (!existing || opportunityScore > existing.opportunity_score) {
      candidates.set(symbol, {
        symbol,
        exchange,
        name: row.name ? String(row.name) : symbol,
        opportunity_score: opportunityScore,
      });
    }
  }

  if (candidates.size > 0) {
    return Array.from(candidates.values()).slice(
      0,
      Math.max(1, maxCandidates)
    );
  }

  console.warn(
    "No fresh market candidates found. Using static fallback for Stocktwits enrichment."
  );

  return STATIC_US_STOCK_UNIVERSE.slice(0, Math.max(1, maxCandidates)).map(
    (item) => ({
      symbol: item.symbol,
      exchange: item.exchange,
      name: item.name,
      opportunity_score: 0,
    })
  );
}

function getStocktwitsMessageAgeHours(createdAt?: string) {
  if (!createdAt) return null;

  const createdTime = new Date(createdAt).getTime();

  if (!Number.isFinite(createdTime)) {
    return null;
  }

  return (Date.now() - createdTime) / (1000 * 60 * 60);
}

async function fetchStocktwitsSymbolStream(symbol: string) {
  const cleanStocktwitsSymbol = cleanSymbol(symbol);
  const messageLimit = Number(
    process.env.STOCKTWITS_SYMBOL_MESSAGE_LIMIT || "30"
  );

  if (!cleanStocktwitsSymbol) {
    return null;
  }

  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(messageLimit, 1), 30)),
  });

  try {
    const response = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${cleanStocktwitsSymbol}.json?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const data =
      (await response.json().catch(() => null)) as StocktwitsSymbolStreamResponse | null;

    if (!response.ok) {
      console.warn("Stocktwits stream error:", {
        symbol: cleanStocktwitsSymbol,
        status: response.status,
        data,
      });

      return null;
    }

    return data;
  } catch (error) {
    console.warn("Stocktwits fetch failed:", {
      symbol: cleanStocktwitsSymbol,
      error,
    });

    return null;
  }
}

function calculateStocktwitsSocialScore({
  mentions24h,
  mentions1h,
  bullishCount,
  bearishCount,
  uniqueUsers,
  opportunityScore,
  trendingScore,
  watchlistCount,
}: {
  mentions24h: number;
  mentions1h: number;
  bullishCount: number;
  bearishCount: number;
  uniqueUsers: number;
  opportunityScore: number;
  trendingScore: number;
  watchlistCount: number;
}) {
  let score = 20;

  score += Math.min(mentions24h * 3, 25);
  score += Math.min(mentions1h * 8, 18);
  score += Math.min(uniqueUsers * 3, 15);
  score += Math.min((bullishCount + bearishCount) * 4, 12);
  score += Math.min(Math.max(trendingScore, 0), 10);
  score += Math.min(Math.log10(Math.max(watchlistCount, 1)) * 4, 8);
  score += Math.min(opportunityScore * 0.12, 12);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildStocktwitsRawData({
  bullishCount,
  bearishCount,
  uniqueUsers,
  opportunityScore,
  trendingScore,
  watchlistCount,
}: {
  bullishCount: number;
  bearishCount: number;
  uniqueUsers: number;
  opportunityScore: number;
  trendingScore: number;
  watchlistCount: number;
}) {
  return {
    provider: "stocktwits",
    bullishCount,
    bearishCount,
    uniqueUsers,
    marketCandidateScore: opportunityScore,
    trendingScore,
    watchlistCount,
  };
}

async function loadStocktwitsMentions() {
    if (process.env.STOCKTWITS_ENABLED !== "true") {
    console.log("Stocktwits scanner skipped:", {
      reason: "STOCKTWITS_ENABLED is not true",
      premiumPlan: "Use Stocktwits Firestream / premium provider before release.",
    });

    return [];
  }
  const candidates = await loadLatestMarketCandidatesForSocialEnrichment();
  const items: SocialMentionItem[] = [];

  for (const candidate of candidates) {
    const data = await fetchStocktwitsSymbolStream(candidate.symbol);

    if (!data?.messages?.length) {
      continue;
    }

    const messages24h = data.messages.filter((message) => {
      const ageHours = getStocktwitsMessageAgeHours(message.created_at);

      if (ageHours === null) {
        return true;
      }

      return ageHours <= 24;
    });

    if (messages24h.length === 0) {
      continue;
    }

    const messages1h = messages24h.filter((message) => {
      const ageHours = getStocktwitsMessageAgeHours(message.created_at);

      if (ageHours === null) {
        return false;
      }

      return ageHours <= 1;
    });

    const bullishCount = messages24h.filter(
      (message) => message.entities?.sentiment?.basic === "Bullish"
    ).length;

    const bearishCount = messages24h.filter(
      (message) => message.entities?.sentiment?.basic === "Bearish"
    ).length;

    const uniqueUsers = new Set(
      messages24h
        .map((message) => message.user?.id || message.user?.username)
        .filter(Boolean)
    ).size;

    const sentiment =
      bullishCount > bearishCount
        ? "bullish"
        : bearishCount > bullishCount
          ? "bearish"
          : "neutral";

    const mentionVelocity =
      messages24h.length > 0
        ? Number((messages1h.length / messages24h.length).toFixed(3))
        : 0;

    const trendingScore = Number(data.symbol?.trending_score || 0);
    const watchlistCount = Number(data.symbol?.watchlist_count || 0);

    const socialScore = calculateStocktwitsSocialScore({
      mentions24h: messages24h.length,
      mentions1h: messages1h.length,
      bullishCount,
      bearishCount,
      uniqueUsers,
      opportunityScore: candidate.opportunity_score,
      trendingScore,
      watchlistCount,
    });

    items.push({
      symbol: candidate.symbol,
      exchange: candidate.exchange,
      name: candidate.name,
      source: "stocktwits",
      mentions_24h: messages24h.length,
      mentions_1h: messages1h.length,
      mention_velocity: mentionVelocity,
      sentiment,
      social_score: socialScore,
      sample_posts: messages24h.slice(0, 3).map((message) => ({
        title: message.body || `${candidate.symbol} Stocktwits discussion`,
        subreddit: "Stocktwits",
        url: `https://stocktwits.com/symbol/${candidate.symbol}`,
        score: Number(message.user?.followers || 0),
        comments: 0,
        created_utc: message.created_at
          ? Math.floor(new Date(message.created_at).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
      })),
      raw_data: buildStocktwitsRawData({
        bullishCount,
        bearishCount,
        uniqueUsers,
        opportunityScore: candidate.opportunity_score,
        trendingScore,
        watchlistCount,
      }),
    });
  }

  const sortedItems = items
    .sort((a, b) => b.social_score - a.social_score)
    .slice(0, 100);

  console.log("Stocktwits scanner result:", {
    candidates: candidates.length,
    matchedSymbols: sortedItems.length,
    topSymbols: sortedItems.slice(0, 10).map((item) => ({
      symbol: item.symbol,
      mentions_24h: item.mentions_24h,
      social_score: item.social_score,
    })),
  });

  return sortedItems;
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
  const stockUniverse = await fetchFmpUniverse();
const cryptoUniverse = await fetchBinanceUniverse();

const universe = new Map([...stockUniverse, ...cryptoUniverse]);

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

  const totalFetchedPosts = subredditResults.reduce((total, result) => {
  if (result.status !== "fulfilled") return total;
  return total + result.value.length;
}, 0);

console.log("Social scanner debug:", {
  universeSize: universe.size,
  subreddits: REDDIT_SUBREDDITS.length,
  totalFetchedPosts,
});

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

  const sortedItems = items
  .sort((a, b) => b.social_score - a.social_score)
  .slice(0, 100);

console.log("Social scanner result:", {
  matchedSymbols: sortedItems.length,
  topSymbols: sortedItems.slice(0, 10).map((item) => ({
    symbol: item.symbol,
    mentions_24h: item.mentions_24h,
    social_score: item.social_score,
  })),
});

return sortedItems;
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
        .limit(150);

      if (cachedRows && cachedRows.length > 0) {
        return NextResponse.json({
          source: "cache",
          provider: "reddit_stocktwits",
          scannedAt: cachedRows[0]?.scanned_at,
          items: cachedRows,
        });
      }
    }

   const [redditItems, stocktwitsItems] = await Promise.all([
  loadRedditMentions(),
  loadStocktwitsMentions(),
]);

const freshItems = [...redditItems, ...stocktwitsItems]
  .sort((a, b) => b.social_score - a.social_score)
  .slice(0, 150);
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
      provider: "reddit_stocktwits",
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