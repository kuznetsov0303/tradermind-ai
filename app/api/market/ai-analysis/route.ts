import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";
import {
  getSkillEdgeMarketBriefPrompt,
  getSkillEdgeConciseOutputRules,
  getSkillEdgeJsonOutputRules,
} from "@/lib/ai/skill-edge-prompts";

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
      "SkillEdge AI fallback analysis is active because the AI response could not be parsed correctly.",
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
            "SkillEdge AI analysis is not available right now. Please try again later or contact support.",
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
const promptLanguage =
  typeof body?.language === "string" && body.language.trim()
    ? body.language.trim()
    : "ru";

const model = getOpenAIModel(planId);

const systemPrompt = [
  getSkillEdgeMarketBriefPrompt({
    language: promptLanguage,
    plan: planId,
    userContext: [
      `Plan ID: ${planId}`,
      `Output language: ${language}`,
      `Items submitted: ${items.length}`,
      "Market Brief must separate actionable alerts from watchlist candidates.",
      "Catalyst/news/social attention is only an in-play reason, not a trade by itself.",
      "Do not upgrade a ticker just because it moved hard. Setup + trigger + RR decide quality.",
    ].join("\n"),
  }),
  getSkillEdgeConciseOutputRules(),
  getSkillEdgeJsonOutputRules(),
  "",
  "Return JSON with this exact shape:",
  "{",
  '  "summary": "short desk summary",',
  '  "items": [',
  "    {",
  '      "symbol": "TICKER",',
  '      "verdict": "A+ actionable | A actionable | Watch only | Rejected",',
  '      "score": 0,',
  '      "setup_type": "specific setup name",',
  '      "direction_bias": "upside | downside | neutral",',
  '      "reason": "why this ticker is in play + why setup matters",',
  '      "risk_note": "main risk / trap / invalidation problem",',
  '      "scenario": "trigger, entry condition, invalidation and action note",',
  '      "action_note": "no chase / wait trigger / actionable after confirmation / skip"',
  "    }",
  "  ]",
  "}",
  "",
  "Strict desk rules:",
  "- If setup is not triggered, verdict must be Watch only.",
  "- If RR/stop/structure is unclear, verdict must be Watch only or Rejected.",
  "- If movement is extended and entry is late, say No chase.",
  "- For crypto, use liquidity / sweep / reclaim / rejection / displacement language only when data supports it.",
  "- For stocks, use catalyst/momentum/VWAP/gap/fade/continuation language only when data supports it.",
  "- Do not invent exact entry/stop/targets if the data does not include levels.",
].join("\n");

    const response = await openai.responses.create({
      model,
      instructions: systemPrompt,
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