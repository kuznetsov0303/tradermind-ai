import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAiFeatureLimit } from "@/lib/ai-usage-limits";

type Trade = {
  id: string;
  user_id: string;
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

type TradeScreenshot = {
  id: string;
  trade_id: string;
  user_id: string;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  screenshot_type: string | null;
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

async function storageFileToDataUrl(filePath: string, mimeType: string | null) {
  const { data, error } = await supabaseAdmin.storage
    .from("trade-screenshots")
    .download(filePath);

  if (error || !data) {
    throw new Error("Failed to download screenshot from storage.");
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const safeMimeType = mimeType || data.type || "image/png";

  return `data:${safeMimeType};base64,${base64}`;
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

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const body = await req.json();
    const tradeId = body?.tradeId as string | undefined;

    const language =
  body?.language === "ru" || body?.language === "ua" || body?.language === "en"
    ? body.language
    : "en";

    if (!tradeId) {
      return NextResponse.json(
        { error: "Trade id is required." },
        { status: 400 }
      );
    }

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

    const { data: tradeData, error: tradeError } = await supabaseAdmin
      .from("trades")
      .select(
        "id,user_id,ticker,market,direction,trade_date,entry_price,exit_price,stop_loss,position_size,risk_amount,pnl,result,setup,emotion,mistake,lesson,notes,created_at"
      )
      .eq("id", tradeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (tradeError || !tradeData) {
      return NextResponse.json(
        { error: "Trade not found." },
        { status: 404 }
      );
    }

    const trade = tradeData as Trade;

    const { data: screenshotData, error: screenshotError } = await supabaseAdmin
      .from("trade_screenshots")
      .select("*")
      .eq("trade_id", trade.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);

    if (screenshotError) {
      return NextResponse.json(
        { error: "Failed to load trade screenshots." },
        { status: 500 }
      );
    }

    const screenshots = (screenshotData ?? []) as TradeScreenshot[];

    if (screenshots.length === 0) {
      return NextResponse.json(
        { error: "No screenshots attached to this trade." },
        { status: 400 }
      );
    }

    const imageInputs = await Promise.all(
      screenshots.map(async (screenshot) => ({
        type: "input_image" as const,
        image_url: await storageFileToDataUrl(
          screenshot.file_path,
          screenshot.mime_type
        ),
      }))
    );

    const planId = subscription.plan_id ?? "starter";
    const model = getOpenAIModel(planId);
    const publicPlanName = getPublicPlanName(planId);
    const usage = await checkAiFeatureLimit({
  supabaseAdmin,
  userId: user.id,
  planId,
  feature: "trade_chart_analysis",
});

if (!usage.allowed) {
  return NextResponse.json(
    {
      error:
        "Trade chart analysis limit reached for your current SkillEdge plan. Upgrade your plan or wait until the next monthly reset.",
      code: "AI_LIMIT_REACHED",
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    },
    { status: 429 }
  );
}

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_output_tokens: 1400,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
  `You are SkillEdge AI, a professional trading chart and execution analyst. Do not mention OpenAI, GPT, or model names. Analyze the trade screenshots and trade journal data. Focus on entry quality, exit quality, stop placement, market structure, risk, execution discipline, and what the trader should improve next time. ${getOutputLanguageInstruction(language)}`,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  {
  plan: publicPlanName,
  language,
  outputLanguageInstruction: getOutputLanguageInstruction(language),
  trade: {
                      date: trade.trade_date,
                      ticker: trade.ticker,
                      market: trade.market,
                      direction: trade.direction,
                      entry: trade.entry_price,
                      exit: trade.exit_price,
                      stop: trade.stop_loss,
                      size: trade.position_size,
                      risk: trade.risk_amount,
                      pnl: trade.pnl,
                      result: trade.result,
                      setup: trade.setup,
                      emotion: trade.emotion,
                      mistake: trade.mistake,
                      lesson: trade.lesson,
                      notes: trade.notes,
                    },
                    request:
                      "Analyze this trade using both the journal data and the attached chart screenshots. Return a structured report with: 1) setup quality, 2) entry quality, 3) stop placement, 4) exit quality, 5) risk/reward, 6) what was done well, 7) main mistake, 8) how to improve the next similar trade.",
                  },
                  null,
                  2
                ),
              },
              ...imageInputs,
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error?.message || "Chart analysis failed.",
        },
        { status: response.status }
      );
    }

    const answer =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "No chart analysis returned.";

    await supabaseAdmin.from("ai_analyses").insert({
  user_id: user.id,
  subscription_id: subscription.id,
  trade_id: trade.id,
  analysis_type: "trade_chart",
  user_message: `Trade chart analysis: ${trade.ticker}`,
  ai_response: answer,
  model,
  tokens_used: 0,
});

    return NextResponse.json({
  answer,
  aiUsed: usage.used + 1,
  aiLimit: usage.limit,
  remaining: Math.max(usage.remaining - 1, 0),
});
  } catch {
    return NextResponse.json(
      { error: "Trade chart analysis backend error." },
      { status: 500 }
    );
  }
}