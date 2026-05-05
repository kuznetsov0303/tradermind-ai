import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canUseFeature,
  getFeatureLimit,
  normalizePlanId,
} from "@/lib/plan-limits";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

type ReportTradePayload = {
  symbol?: string | null;
  market?: string | null;
  direction?: string | null;
  result?: string | null;
  setup?: string | null;
  mistake?: string | null;
  pnl?: number | null;
  trade_date?: string | null;
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.replace("Bearer ", "").trim();
}

function getMonthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI configuration is missing." },
        { status: 500 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Database configuration is missing." },
        { status: 500 }
      );
    }

    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid session." },
        { status: 401 }
      );
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_id, status, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      return NextResponse.json(
        { error: "Failed to verify subscription." },
        { status: 500 }
      );
    }

    const planId = normalizePlanId(subscription?.plan_id);
    const isActiveSubscription =
      subscription?.status === "active" &&
      (!subscription.expires_at ||
        new Date(subscription.expires_at).getTime() > Date.now());

    if (!isActiveSubscription) {
      return NextResponse.json(
        { error: "Active subscription required." },
        { status: 403 }
      );
    }

    if (!canUseFeature(planId, "ai_reports")) {
      return NextResponse.json(
        {
          error:
            "AI reports are available on SkillEdge Edge and SkillEdge Elite.",
        },
        { status: 403 }
      );
    }

    const monthlyAiReportLimit = getFeatureLimit(planId, "ai_report");

    const { count: reportsThisMonth, error: reportsCountError } =
      await supabaseAdmin
        .from("ai_reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", getMonthStartIso());

    if (reportsCountError) {
      return NextResponse.json(
        { error: "Failed to verify report limit." },
        { status: 500 }
      );
    }

    if ((reportsThisMonth ?? 0) >= monthlyAiReportLimit) {
      return NextResponse.json(
        { error: "Monthly AI report limit reached." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const trades = Array.isArray(body.trades)
      ? (body.trades as ReportTradePayload[])
      : [];

    const summary = body.summary ?? {};
    const filters = body.filters ?? {};

    if (trades.length === 0) {
      return NextResponse.json(
        { error: "No trades provided for report." },
        { status: 400 }
      );
    }

    const compactTrades = trades.slice(0, 80).map((trade) => ({
      symbol: trade.symbol ?? "N/A",
      market: trade.market ?? "N/A",
      direction: trade.direction ?? "N/A",
      result: trade.result ?? "N/A",
      setup: trade.setup ?? "N/A",
      mistake: trade.mistake ?? "",
      pnl: trade.pnl ?? 0,
      trade_date: trade.trade_date ?? "N/A",
    }));

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_REPORT_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You are SkillEdge AI, a premium trading performance analyst. Write in Russian. Analyze trading journal data like a prop trading mentor. Be specific, practical, risk-focused, and concise. Do not mention OpenAI, GPT, models, or internal implementation.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              task: "Create a trading performance report for the selected trades. Include overall performance, risk quality, best and worst patterns, setup quality, mistakes, long vs short notes, and next focus points.",
              filters,
              summary,
              trades: compactTrades,
            },
            null,
            2
          ),
        },
      ],
    });

    const report =
      completion.choices[0]?.message?.content?.trim() ||
      "Не удалось сформировать отчёт.";

    return NextResponse.json({ report });
  } catch (error) {
    console.error("AI report error:", error);

    return NextResponse.json(
      { error: "Failed to generate AI report." },
      { status: 500 }
    );
  }
}