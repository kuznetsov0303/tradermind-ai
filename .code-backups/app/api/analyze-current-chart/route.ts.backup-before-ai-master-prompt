import { NextResponse } from "next/server";
import { requireAiRouteAccess } from "@/lib/security/ai-route-gate";
import {
  getSkillEdgeCurrentChartPrompt,
  getSkillEdgeConciseOutputRules,
} from "@/lib/ai/skill-edge-prompts";

type AnalyzeCurrentChartBody = {
  symbol?: string;
  interval?: string;
  language?: string;
};

type FmpQuote = {
  symbol?: string;
  name?: string;
  price?: number;
  changesPercentage?: number;
  change?: number;
  dayLow?: number;
  dayHigh?: number;
  yearHigh?: number;
  yearLow?: number;
  volume?: number;
  avgVolume?: number;
  open?: number;
  previousClose?: number;
  eps?: number;
  pe?: number;
  earningsAnnouncement?: string;
  marketCap?: number;
  exchange?: string;
};

type FmpCandle = {
  date?: string;
  open?: number;
  low?: number;
  high?: number;
  close?: number;
  volume?: number;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;

function getOpenAIModel(planId: string | null) {
  const normalizedPlanId = String(planId || "").toLowerCase();

  if (normalizedPlanId.includes("elite")) {
    return process.env.SKILLEDGE_ELITE_AI_MODEL || "gpt-5.1";
  }

  if (normalizedPlanId.includes("edge") || normalizedPlanId.includes("pro")) {
    return process.env.SKILLEDGE_EDGE_AI_MODEL || "gpt-5-mini";
  }

  return process.env.SKILLEDGE_CORE_AI_MODEL || "gpt-4.1-mini";
}

function normalizeTradingViewSymbolToFmp(symbol: string) {
  const cleaned = symbol.trim().toUpperCase();

  if (!cleaned) {
    return "";
  }

  if (cleaned.includes(":")) {
    const [, rawTicker] = cleaned.split(":");
    const ticker = rawTicker.replace("1!", "").replace("!", "").trim();

    if (ticker.endsWith("USDT")) {
      return ticker.replace("USDT", "USD");
    }

    return ticker;
  }

  if (cleaned.endsWith(".NY") || cleaned.endsWith(".NQ") || cleaned.endsWith(".AM")) {
    return cleaned.split(".")[0];
  }

  if (cleaned.endsWith("USDT")) {
    return cleaned.replace("USDT", "USD");
  }

  return cleaned;
}

function mapIntervalToFmp(interval: string) {
  switch (interval) {
    case "1":
      return "1min";
    case "5":
      return "5min";
    case "15":
      return "15min";
    case "30":
      return "30min";
    case "60":
      return "1hour";
    case "240":
      return "4hour";
    case "D":
    case "1D":
      return "1day";
    default:
      return "5min";
  }
}

function calculateSimpleStats(candles: FmpCandle[]) {
  const validCandles = candles.filter(
    (candle) =>
      typeof candle.open === "number" &&
      typeof candle.high === "number" &&
      typeof candle.low === "number" &&
      typeof candle.close === "number"
  );

  if (validCandles.length < 2) {
    return null;
  }

  const latest = validCandles[validCandles.length - 1];
  const previous = validCandles[validCandles.length - 2];
  const first = validCandles[0];

  const highs = validCandles.map((candle) => candle.high as number);
  const lows = validCandles.map((candle) => candle.low as number);
  const volumes = validCandles
    .map((candle) => candle.volume || 0)
    .filter((volume) => volume > 0);

  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);

  const averageVolume =
    volumes.length > 0
      ? volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length
      : 0;

  const latestVolume = latest.volume || 0;

  const moveFromFirst =
    first.close && latest.close
      ? ((latest.close - first.close) / first.close) * 100
      : 0;

  const latestCandleChange =
    previous.close && latest.close
      ? ((latest.close - previous.close) / previous.close) * 100
      : 0;

  return {
    candlesCount: validCandles.length,
    firstClose: first.close,
    latestClose: latest.close,
    latestOpen: latest.open,
    latestHigh: latest.high,
    latestLow: latest.low,
    highestHigh,
    lowestLow,
    moveFromFirstPercent: Number(moveFromFirst.toFixed(2)),
    latestCandleChangePercent: Number(latestCandleChange.toFixed(2)),
    latestVolume,
    averageVolume: Math.round(averageVolume),
    relativeVolume:
      averageVolume > 0 ? Number((latestVolume / averageVolume).toFixed(2)) : null,
  };
}

async function fetchFmpQuote(fmpSymbol: string) {
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${FMP_API_KEY}`;

  const response = await fetch(url, {
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as FmpQuote[];

  return data?.[0] || null;
}

async function fetchFmpDailyCandles(fmpSymbol: string) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${FMP_API_KEY}`;

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to fetch FMP daily candles. Status: ${response.status}. Response: ${errorText}`
    );
  }

  const data = await response.json();

  const rawCandles = Array.isArray(data)
    ? data
    : Array.isArray(data?.historical)
      ? data.historical
      : [];

  const candles = rawCandles.slice(0, 80).reverse();

  return candles.map((item: Record<string, unknown>) => ({
    date: typeof item.date === "string" ? item.date : undefined,
    open: typeof item.open === "number" ? item.open : undefined,
    high: typeof item.high === "number" ? item.high : undefined,
    low: typeof item.low === "number" ? item.low : undefined,
    close: typeof item.close === "number" ? item.close : undefined,
    volume: typeof item.volume === "number" ? item.volume : undefined,
  })) as FmpCandle[];
}

async function fetchFmpIntradayCandles(fmpSymbol: string, interval: string) {
  const fmpInterval = mapIntervalToFmp(interval);

  const url = `https://financialmodelingprep.com/stable/historical-chart/${fmpInterval}?symbol=${encodeURIComponent(
    fmpSymbol
  )}&apikey=${FMP_API_KEY}`;

  const response = await fetch(url, {
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as FmpCandle[];

  return Array.isArray(data) ? data.slice(0, 80).reverse() : [];
}

async function fetchFmpCandles(fmpSymbol: string, interval: string) {
  const fmpInterval = mapIntervalToFmp(interval);

  if (fmpInterval === "1day") {
    return fetchFmpDailyCandles(fmpSymbol);
  }

  const intradayCandles = await fetchFmpIntradayCandles(fmpSymbol, interval);

  if (intradayCandles && intradayCandles.length > 0) {
    return intradayCandles;
  }

  return fetchFmpDailyCandles(fmpSymbol);
}

async function createAiAnalysis({
  originalSymbol,
  fmpSymbol,
  interval,
  quote,
  candles,
  stats,
  planId,
  language,
}: {
  originalSymbol: string;
  fmpSymbol: string;
  interval: string;
  quote: FmpQuote | null;
  candles: FmpCandle[];
  stats: ReturnType<typeof calculateSimpleStats>;
  planId: string | null;
  language: string | null;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("SkillEdge AI chart analysis is not available right now.");
  }

  const chartData = candles.slice(-80).map((candle) => ({
    date: candle.date,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  const prompt = [
    getSkillEdgeCurrentChartPrompt({
      language: language || "ru",
      plan: planId,
      userContext: [
        `TradingView symbol: ${originalSymbol}`,
        `FMP symbol: ${fmpSymbol}`,
        `Requested interval: ${interval}`,
        "Important: if intraday candles are unavailable on the current data subscription, candle data may be daily fallback data. Mention this limitation if it affects precision.",
        `Quote data: ${
          quote
            ? JSON.stringify(quote, null, 2)
            : "Quote data is unavailable on the current market data subscription. Use candle data and calculated stats as the primary source."
        }`,
        `Calculated stats: ${JSON.stringify(stats, null, 2)}`,
        `Recent candles: ${JSON.stringify(chartData, null, 2)}`,
      ].join("\n\n"),
    }),
    getSkillEdgeConciseOutputRules(),
    "",
    "Chart analysis task:",
    "Analyze only the provided market data.",
    "Do not pretend you can see the live TradingView chart image.",
    "Do not force a trade.",
    "If the data is weak or incomplete, say it directly and downgrade confidence.",
    "If there is no clean setup, say: no actionable setup yet.",
    "",
    "Required answer structure:",
    "Desk verdict:",
    "Current structure:",
    "Key levels:",
    "Long scenario:",
    "Short scenario:",
    "Invalidation:",
    "Best wait condition:",
    "Risk note:",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(planId),
      input: prompt,
      temperature: 0.17,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "SkillEdge AI analysis request failed.");
  }

  const data = await response.json();

  const outputText =
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    "AI analysis was generated, but the response text could not be parsed.";

  return outputText;
}

export async function POST(request: Request) {
  const aiGate = await requireAiRouteAccess(request, {
    routeName: "analyze-current-chart",
    requireActiveSubscription: true,
    rateLimit: {
      limit: 20,
      windowMs: 60_000,
    },
  });

  if (!aiGate.ok) return aiGate.response;

  try {
    if (!FMP_API_KEY) {
      return NextResponse.json(
        {
          error:
            "FMP_API_KEY is missing. Add FMP_API_KEY to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "SkillEdge AI chart analysis is not available right now. Please try again later or contact support.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AnalyzeCurrentChartBody;

    const originalSymbol = body.symbol?.trim() || "";
    const interval = body.interval?.trim() || "5";
    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "ru";

    if (!originalSymbol) {
      return NextResponse.json(
        { error: "Symbol is required." },
        { status: 400 }
      );
    }

    const fmpSymbol = normalizeTradingViewSymbolToFmp(originalSymbol);

    if (!fmpSymbol) {
      return NextResponse.json(
        { error: "Could not normalize symbol." },
        { status: 400 }
      );
    }

    const [quote, candles] = await Promise.all([
      fetchFmpQuote(fmpSymbol),
      fetchFmpCandles(fmpSymbol, interval),
    ]);

    if (!candles.length) {
      return NextResponse.json(
        {
          error:
            "MARKET_DATA_UNAVAILABLE: Market data is unavailable for this symbol on the current data plan.",
        },
        { status: 404 }
      );
    }

    const stats = calculateSimpleStats(candles);
    const gateWithSubscription = aiGate as typeof aiGate & {
      subscription?: {
        plan_id?: string | null;
        planId?: string | null;
      } | null;
    };
    const planId =
      gateWithSubscription.subscription?.plan_id ||
      gateWithSubscription.subscription?.planId ||
      null;

    const analysis = await createAiAnalysis({
      originalSymbol,
      fmpSymbol,
      interval,
      quote,
      candles,
      stats,
      planId,
      language,
    });

    return NextResponse.json({
      analysis,
      symbol: originalSymbol,
      fmpSymbol,
      interval,
      quote,
      stats,
      candlesCount: candles.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze current chart.";

    const isMarketDataError =
      message.includes("FMP") ||
      message.includes("Premium Query") ||
      message.includes("subscription") ||
      message.includes("402") ||
      message.includes("historical") ||
      message.includes("quote");

    return NextResponse.json(
      {
        error: isMarketDataError
          ? "MARKET_DATA_UNAVAILABLE: Market data is unavailable for this symbol or timeframe on the current data plan."
          : message,
      },
      { status: isMarketDataError ? 404 : 500 }
    );
  }
}

