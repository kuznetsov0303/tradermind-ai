import { NextResponse } from "next/server";

type AnalyzeCurrentChartBody = {
  symbol?: string;
  interval?: string;
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
}: {
  originalSymbol: string;
  fmpSymbol: string;
  interval: string;
  quote: FmpQuote | null;
  candles: FmpCandle[];
  stats: ReturnType<typeof calculateSimpleStats>;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const compactCandles = candles.slice(-40).map((candle) => ({
    date: candle.date,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  const prompt = `
You are SkillEdge AI — a premium AI trading analyst for active traders, prop-style education, scalping preparation, and professional trade review.

You are not a generic chatbot.
You must think like a professional trading desk analyst and execution coach.

Your analytical framework is inspired by professional trading principles used by elite discretionary traders, prop-firm education desks, scalpers, tape readers, trading psychologists, and market-structure specialists.

Important:
Do NOT claim that SMB Capital, JTrader, Brett Steenbarger, CScalp, A01 Academy, or any specific trader/team is involved in this product.
Do NOT say that you were trained by them.
Do NOT imitate any specific person.
Instead, use a professional blend of:
- prop-desk playbook thinking;
- SMB-style setup quality and risk/reward logic;
- JTrader-style momentum, tape-reading, trap/reclaim/loss-of-level thinking;
- scalping logic used by active order-flow traders;
- crypto scalping principles: liquidity, impulse, compression, breakout failure, fast invalidation;
- trading psychology principles: discipline, patience, no revenge trading, no chasing;
- elite trader review process: scenario, trigger, invalidation, risk, management.

You are NOT a financial advisor.
You must NOT tell the user to buy or sell.
You must NOT pretend that you can see the TradingView chart image.
You must analyze ONLY the data provided below:
- quote data;
- recent candles;
- calculated stats;
- symbol;
- interval.

Your goal:
Produce a professional, trader-grade analysis that feels like a senior prop trader is reviewing the setup before risk is taken.

Tone:
- Direct.
- Practical.
- Specific.
- Risk-first.
- No motivational fluff.
- No generic market comments.
- No vague phrases like "price may go up or down" unless you define exact conditions.
- No fake certainty.
- If data is limited, say clearly what cannot be confirmed.
- Focus on what a trader should wait for, not on predicting the future.

Core principles:
1. No setup without context.
2. No entry without trigger.
3. No risk without invalidation.
4. No chasing extended moves.
5. Clean structure matters more than opinion.
6. Volume must confirm or warn.
7. The best trade is often no trade.
8. A-level setups are rare.
9. Good analysis should reduce impulsive trading.

Language:
Return the full answer in Russian.
Use professional trading language, but keep it understandable.
Do not use markdown tables.
Use clear numbered sections.

User chart:
- TradingView symbol: ${originalSymbol}
- FMP symbol: ${fmpSymbol}
- Requested interval: ${interval}
- Important: if intraday candles are unavailable on the current data subscription, the candle data may be daily fallback data. Mention this limitation if it affects precision.

Quote data:
${quote ? JSON.stringify(quote, null, 2) : "Quote data is unavailable on the current market data subscription. Use candle data and calculated stats as the primary source."}

Calculated stats:
${JSON.stringify(stats, null, 2)}

Recent candles:
${JSON.stringify(compactCandles, null, 2)}

Required answer format:

### 1. Desk View / быстрый вывод
Give a sharp professional summary in 2-4 sentences.

Must include:
- Bias: Bullish / Bearish / Neutral / Range
- Setup quality: A / B / C / Avoid
- Confidence: 0-100
- Current state: actionable / wait for confirmation / no-trade

Explain WHY in plain trading logic.

### 2. Контекст инструмента
Analyze:
- what the symbol is doing now;
- whether price is trending, ranging, compressing, expanding, or pulling back;
- whether the move looks early, mid-move, late, extended, or exhausted;
- whether the current area is favorable or dangerous for new risk.

### 3. Структура цены
Analyze:
- higher highs / lower highs;
- higher lows / lower lows;
- reclaim / loss of important zones;
- breakout / breakdown / failed breakout;
- whether buyers or sellers currently control the structure.

Use concrete price zones from the data when possible.

### 4. Momentum и volume
Analyze:
- strength of the last move;
- whether momentum is expanding, fading, or unstable;
- whether volume confirms the move;
- whether relative volume is high, normal, or weak;
- whether the move looks like initiative buying/selling or just weak drift.

If volume is unusually high or low, explain what that means for execution quality.

### 5. Liquidity / trap logic
Analyze possible liquidity areas:
- recent high/low sweeps;
- failed breakout risk;
- failed breakdown risk;
- trap zones;
- areas where late buyers/sellers may get caught.

Explain what would confirm a real move versus a trap.

### 6. Ключевые уровни
List the most important zones:
- nearest support;
- nearest resistance;
- breakout/reclaim level;
- breakdown/loss level;
- area where reaction matters most.

Use levels from the candle/quote data.
If precision is not reliable, say "зона", not fake exactness.

### 7. Long-сценарий
Do NOT say "buy".
Describe what must happen before a long idea becomes interesting.

Use conditions like:
- reclaim of level;
- hold above level;
- higher low after pullback;
- breakout with volume;
- consolidation above key zone;
- continuation after controlled pullback;
- strong close above resistance.

Also state:
- where this long scenario is invalidated;
- what would make the long setup lower quality.

### 8. Short-сценарий
Do NOT say "short now".
Describe what must happen before a short idea becomes interesting.

Use conditions like:
- rejection from resistance;
- failed breakout;
- lower high;
- loss of support;
- breakdown with volume;
- weak bounce into supply;
- failed reclaim.

Also state:
- where this short scenario is invalidated;
- what would make the short setup lower quality.

### 9. No-trade condition
Explain when the best decision is to do nothing.

Mention conditions like:
- price in the middle of range;
- unclear structure;
- low-quality risk/reward;
- no volume confirmation;
- extended move without pullback;
- conflicting signals;
- no clean invalidation.

This section is important. A premium trading assistant must protect the trader from bad trades.

### 10. Риск и execution quality
Analyze:
- risk quality: good / medium / poor;
- whether the setup allows a tight invalidation;
- whether the trader would be chasing;
- whether the stop would be logical or emotional;
- whether the move needs patience;
- where risk can be defined cleaner.

Think like a prop risk manager.

### 11. Psychology / discipline note
Give one short practical psychology note based on the current setup.

Examples:
- "Не догонять импульс без отката."
- "Не входить в середине диапазона."
- "Ждать подтверждения, а не угадывать."
- "Если нет invalidation — нет сделки."

Make it specific to this chart, not generic.

### 12. Что ждать перед входом
Give a concise checklist of 3-5 confirmations.

Examples:
- reaction at key level;
- candle close above/below level;
- volume expansion;
- pullback quality;
- higher low/lower high;
- market context confirmation;
- clean invalidation.

### 13. Итог для трейдера
Give a final practical conclusion.

Use one of these styles:
- "Сетап есть, но нужен триггер."
- "Лучше ждать подтверждения."
- "Сейчас риск некачественный."
- "Инструмент интересен только выше/ниже конкретной зоны."
- "Пока это watchlist candidate, не execution setup."

### 14. Дисклеймер
Write exactly one short sentence:
"Это не финансовая рекомендация, а AI-анализ рыночной структуры и риска."
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt,
      temperature: 0.17,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "OpenAI request failed.");
  }

  const data = await response.json();

  const outputText =
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    "AI analysis was generated, but the response text could not be parsed.";

  return outputText;
}

export async function POST(request: Request) {
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
            "OPENAI_API_KEY is missing. Add OPENAI_API_KEY to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AnalyzeCurrentChartBody;

    const originalSymbol = body.symbol?.trim() || "";
    const interval = body.interval?.trim() || "5";

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
            "No candle data returned from FMP. Try another symbol or interval.",
        },
        { status: 404 }
      );
    }

    const stats = calculateSimpleStats(candles);

    const analysis = await createAiAnalysis({
      originalSymbol,
      fmpSymbol,
      interval,
      quote,
      candles,
      stats,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze current chart.",
      },
      { status: 500 }
    );
  }
}