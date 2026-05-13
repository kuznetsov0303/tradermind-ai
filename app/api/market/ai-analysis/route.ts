import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type MarketAIInputItem = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  assetType?: "stock" | "crypto" | string;
  signalType?: "market" | "social" | "combined" | string;
  combinedScore?: number;
  marketScore?: number;
  socialScore?: number;
  changePercent?: number | null;
  mentions24h?: number;
  mentions1h?: number;
  sentiment?: string;
  catalystTitle?: string | null;
  catalystType?: string | null;
  reason?: string;
  riskNote?: string | null;
};

type MarketAIAnalysisRequest = {
  language?: "ru" | "en" | "ua" | string;
  items?: MarketAIInputItem[];
};

type MarketAIAnalysisItem = {
  symbol: string;
  verdict: string;
  confluence_score: number;
  setup_type: string;
  reason: string;
  risk_note: string;
  scenario: string;
  invalidation: string;
  action_note: string;
};

type MarketAIAnalysisResponse = {
  summary: string;
  items: MarketAIAnalysisItem[];
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function clampNumber(value: unknown, min = 0, max = 100) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;

  return Math.max(min, Math.min(max, number));
}

function cleanSymbol(symbol: unknown) {
  if (typeof symbol !== "string") return "";

  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

function sanitizeItem(item: MarketAIInputItem): MarketAIInputItem | null {
  const symbol = cleanSymbol(item.symbol);

  if (!symbol) {
    return null;
  }

  return {
    symbol,
    name: typeof item.name === "string" ? item.name.slice(0, 120) : null,
    exchange: typeof item.exchange === "string" ? item.exchange.slice(0, 30) : null,
    assetType: typeof item.assetType === "string" ? item.assetType.slice(0, 20) : "stock",
    signalType:
      typeof item.signalType === "string" ? item.signalType.slice(0, 20) : "market",
    combinedScore: clampNumber(item.combinedScore),
    marketScore: clampNumber(item.marketScore),
    socialScore: clampNumber(item.socialScore),
    changePercent:
      typeof item.changePercent === "number" && Number.isFinite(item.changePercent)
        ? item.changePercent
        : null,
    mentions24h:
      typeof item.mentions24h === "number" && Number.isFinite(item.mentions24h)
        ? Math.max(0, item.mentions24h)
        : 0,
    mentions1h:
      typeof item.mentions1h === "number" && Number.isFinite(item.mentions1h)
        ? Math.max(0, item.mentions1h)
        : 0,
    sentiment:
      typeof item.sentiment === "string" ? item.sentiment.slice(0, 30) : "neutral",
    catalystTitle:
      typeof item.catalystTitle === "string"
        ? item.catalystTitle.slice(0, 220)
        : null,
    catalystType:
      typeof item.catalystType === "string" ? item.catalystType.slice(0, 50) : null,
    reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : "",
    riskNote: typeof item.riskNote === "string" ? item.riskNote.slice(0, 500) : null,
  };
}

function getLanguageName(language?: string) {
  if (language === "en") return "English";
  if (language === "ua") return "Ukrainian";
  return "Russian";
}

function extractJson(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function fallbackAnalysis(items: MarketAIInputItem[]): MarketAIAnalysisResponse {
  return {
    summary:
      "SkillEdge AI preview is temporarily using fallback analysis. Real AI output was not parsed correctly.",
    items: items.map((item) => ({
      symbol: item.symbol,
      verdict: "Watchlist candidate",
      confluence_score: Math.round(
        Math.min(
          100,
          (item.combinedScore || 0) * 0.7 +
            (item.marketScore || 0) * 0.2 +
            (item.socialScore || 0) * 0.1
        )
      ),
      setup_type:
        item.signalType === "combined"
          ? "Combined market/social opportunity"
          : item.signalType === "social"
            ? "Social attention candidate"
            : "Market momentum candidate",
      reason:
        item.reason ||
        "Ticker appeared in Market Intelligence based on current score and scanner data.",
      risk_note:
        item.riskNote ||
        "Wait for confirmation. Avoid chasing extended moves without a clear structure.",
      scenario:
        "Watch VWAP/previous high/previous low reaction and wait for confirmation before taking action.",
      invalidation:
        "Invalid if volume disappears, price fails to hold key levels, or the catalyst loses attention.",
      action_note:
        "This is market intelligence, not a direct buy/sell signal. Build a trade plan first.",
    })),
  };
}

export async function POST(request: Request) {
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
          error: "AI Market Intelligence is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "SkillEdge AI is not configured yet. Add OPENAI_API_KEY to backend environment variables.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | MarketAIAnalysisRequest
      | null;

    const inputItems = Array.isArray(body?.items) ? body.items : [];

    const items = inputItems
      .map((item) => sanitizeItem(item))
      .filter((item): item is MarketAIInputItem => Boolean(item))
      .slice(0, 20);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No market opportunities provided for AI analysis." },
        { status: 400 }
      );
    }

    const language = getLanguageName(body?.language);
    const model = process.env.SKILLEDGE_AI_MARKET_MODEL || "gpt-5.2";

    const response = await openai.responses.create({
      model,
      instructions: `
You are SkillEdge AI, a premium market intelligence assistant for active traders.

Analyze only the provided market opportunities. Do not invent missing data.
Do not give direct financial advice like "buy now" or "short now".
Give scenario-based trading intelligence.

Important:
Use different reasoning modes for stocks and crypto.

For stocks:
Focus on catalyst, price move, volume, earnings/news, social attention, continuation/fade risk, trap risk, and clean confirmation levels.

For crypto:
Use Smart Money / SMC-style reasoning where possible:
- market structure context
- liquidity sweep / reclaim logic
- buyside and sellside liquidity
- continuation vs reversal
- displacement / weak push
- premium/discount idea if relevant
- invalidation around liquidity/structure
- avoid pretending exact levels if candles are not provided

If crypto candle/OHLC data is missing, clearly phrase it as "SMC-style read based on available scanner data", not as a full chart-based SMC analysis.

Return ONLY valid JSON with this exact shape:
{
  "summary": "string",
  "items": [
    {
      "symbol": "string",
      "verdict": "string",
      "confluence_score": 0,
      "setup_type": "string",
      "reason": "string",
      "risk_note": "string",
      "scenario": "string",
      "invalidation": "string",
      "action_note": "string"
    }
  ]
}

For crypto items, make setup_type and scenario reflect Smart Money language when appropriate:
examples: "liquidity sweep + reclaim watch", "continuation after displacement", "sellside liquidity risk", "range reclaim scenario", "failed breakout / liquidity trap".

For stock items, make setup_type and scenario reflect catalyst/momentum language:
examples: "earnings dump continuation", "news-driven momentum", "gap fade risk", "post-catalyst continuation", "high-volume trap watch".

Language: ${language}.
Tone: premium, concise, trader-focused.
      `.trim(),
      input: JSON.stringify(
        {
          opportunities: items,
          rules: {
            max_items: 20,
            focus: [
  "why ticker is in-play",
  "market/social/news confluence",
  "risk and trap warning",
  "scenario to watch",
  "invalidation",
  "for crypto: SMC-style structure/liquidity interpretation based on available data",
  "for stocks: catalyst/momentum/volume interpretation",
],
          },
        },
        null,
        2
      ),
    });

    const outputText = response.output_text || "";
    const parsed = extractJson(outputText) as MarketAIAnalysisResponse | null;

    const analysis =
      parsed && Array.isArray(parsed.items) ? parsed : fallbackAnalysis(items);

    const responsePayload = {
  source: "skilledge_ai_market_analysis",
  analyzedAt: new Date().toISOString(),
  summary: analysis.summary,
  items: analysis.items.slice(0, 20).map((item, index) => ({
    symbol: cleanSymbol(item.symbol) || items[index]?.symbol || "UNKNOWN",
    verdict: String(item.verdict || "Watchlist candidate").slice(0, 160),
    confluence_score: clampNumber(item.confluence_score),
    setup_type: String(item.setup_type || "Market opportunity").slice(0, 160),
    reason: String(item.reason || "").slice(0, 800),
    risk_note: String(item.risk_note || "").slice(0, 800),
    scenario: String(item.scenario || "").slice(0, 800),
    invalidation: String(item.invalidation || "").slice(0, 800),
    action_note: String(item.action_note || "").slice(0, 500),
  })),
};

const { error: briefHistoryError } = await supabaseAdmin
  .from("market_ai_briefs")
  .insert({
    user_id: user.id,
    plan_id: planId,
    language: body?.language || "ru",
    model_name: model,
    source: responsePayload.source,
    input_items: items,
    summary: responsePayload.summary,
    analysis_items: responsePayload.items,
  });

if (briefHistoryError) {
  console.warn("Failed to save AI market brief history:", briefHistoryError);
}

return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("SkillEdge AI market analysis error:", error);

    return NextResponse.json(
      { error: "Failed to generate SkillEdge AI market analysis." },
      { status: 500 }
    );
  }
}