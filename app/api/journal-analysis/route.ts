import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Trade = {
  id: string;
  ticker: string;
  market: string | null;
  direction: string | null;
  trade_date: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  position_size: number | null;
  risk_amount: number | null;
  pnl: number | null;
  result: string | null;
  setup: string | null;
  emotion: string | null;
  mistake: string | null;
  lesson: string | null;
  notes: string | null;
  created_at: string | null;
};

function getOpenAIModel(planId: string | null) {
  if (planId === "starter") return "gpt-4o-mini";
  if (planId === "pro") return "gpt-4o-mini";
  if (planId === "elite") return "gpt-4o-mini";

  return "gpt-4o-mini";
}

function getPublicPlanName(planId: string | null) {
  if (planId === "starter") return "SkillEdge Core";
  if (planId === "pro") return "SkillEdge Edge";
  if (planId === "elite") return "SkillEdge Elite";

  return "SkillEdge Core";
}

function getOutputLanguageInstruction(language: string | null) {
  if (language === "ru") {
    return "Answer strictly in Russian. Use clear professional trading language. Keep ticker symbols, PnL, VWAP, stop, setup, long and short terms in English only when it is natural.";
  }

  if (language === "ua") {
    return "Answer strictly in Ukrainian. Use clear professional trading language. Keep ticker symbols, PnL, VWAP, stop, setup, long and short terms in English only when it is natural.";
  }

  return "Answer strictly in English. Use clear professional trading language.";
}

function buildTradeSummary(trades: Trade[]) {
  const totalTrades = trades.length;

  const pnlValues = trades
    .map((trade) => trade.pnl)
    .filter((pnl): pnl is number => pnl !== null);

  const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);

  const wins = trades.filter((trade) => trade.result === "win").length;
  const losses = trades.filter((trade) => trade.result === "loss").length;

  const closedTrades = wins + losses;
  const winRate =
    closedTrades > 0 ? Math.round((wins / closedTrades) * 100) : null;

  const grossProfit = pnlValues
    .filter((pnl) => pnl > 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const grossLoss = pnlValues
    .filter((pnl) => pnl < 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : null;
  const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : null;

  const profitFactor =
    grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;

  return {
    totalTrades,
    totalPnl,
    wins,
    losses,
    winRate,
    grossProfit,
    grossLoss,
    bestTrade,
    worstTrade,
    profitFactor,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI backend is not configured." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");

    const body = await req.json().catch(() => ({}));
const language =
  body?.language === "ru" || body?.language === "ua" || body?.language === "en"
    ? body.language
    : "en";

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid user session." },
        { status: 401 }
      );
    }

    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription?.status || subscription.status !== "active") {
      return NextResponse.json(
        { error: "Active plan or demo access is required." },
        { status: 403 }
      );
    }

    const { data: trades, error: tradesError } = await supabaseAdmin
      .from("trades")
      .select(
        "id,ticker,market,direction,trade_date,entry_price,exit_price,stop_loss,position_size,risk_amount,pnl,result,setup,emotion,mistake,lesson,notes,created_at"
      )
      .eq("user_id", user.id)
      .order("trade_date", { ascending: false })
      .limit(100);

    if (tradesError) {
      return NextResponse.json(
        { error: "Failed to load trades." },
        { status: 500 }
      );
    }

    const safeTrades = (trades ?? []) as Trade[];

    if (safeTrades.length === 0) {
      return NextResponse.json(
        { error: "No trades found for journal analysis." },
        { status: 400 }
      );
    }

    const planId = subscription.plan_id ?? "starter";
    const model = getOpenAIModel(planId);
    const publicPlanName = getPublicPlanName(planId);
    const summary = buildTradeSummary(safeTrades);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
  `You are SkillEdge AI, a professional trading journal analyst. Do not mention OpenAI, GPT, or model names. Analyze trading performance with discipline, risk, setup quality, execution mistakes, psychology, and improvement priorities. ${getOutputLanguageInstruction(language)}`,
          },
          {
            role: "user",
            content: JSON.stringify(
              {
  plan: publicPlanName,
  language,
  outputLanguageInstruction: getOutputLanguageInstruction(language),
  summary,
  trades: safeTrades.map((trade) => ({
                  date: trade.trade_date,
                  ticker: trade.ticker,
                  market: trade.market,
                  direction: trade.direction,
                  pnl: trade.pnl,
                  result: trade.result,
                  setup: trade.setup,
                  emotion: trade.emotion,
                  mistake: trade.mistake,
                  lesson: trade.lesson,
                  notes: trade.notes,
                })),
                request:
                  "Analyze this trading journal. Return a structured report with: 1) performance summary, 2) best patterns, 3) repeated mistakes, 4) risk and execution issues, 5) psychology patterns, 6) specific action plan for the next trading week.",
              },
              null,
              2
            ),
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error?.message || "AI journal analysis failed.",
        },
        { status: response.status }
      );
    }

    const answer =
      data.choices?.[0]?.message?.content || "No journal analysis returned.";

   await supabaseAdmin.from("ai_analyses").insert({
  user_id: user.id,
  subscription_id: subscription.id,
  analysis_type: "journal",
  user_message: "Journal performance analysis",
  ai_response: answer,
  model,
  tokens_used: 0,
});

    return NextResponse.json({
      answer,
      totalTrades: safeTrades.length,
      plan: publicPlanName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Journal analysis backend error." },
      { status: 500 }
    );
  }
}