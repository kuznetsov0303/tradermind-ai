import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAiFeatureLimit } from "@/lib/ai-usage-limits";

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  billing_period: string;
  status: string;
  ai_monthly_limit: number;
  ai_used_this_month: number;
  expires_at: string | null;
  is_demo?: boolean;
};

function getPublicPlanName(planId: string) {
  if (planId === "starter") return "SkillEdge Core";
  if (planId === "pro") return "SkillEdge Edge";
  if (planId === "elite") return "SkillEdge Elite";
  return "SkillEdge AI";
}

function getOpenAIModel(planId: string) {
  if (planId === "starter") return "gpt-4o-mini";
  if (planId === "pro") return "gpt-4o-mini";
  if (planId === "elite") return "gpt-4o-mini";

  return "gpt-4o-mini";
}

function extractResponseText(openaiData: any) {
  if (typeof openaiData.output_text === "string") {
    return openaiData.output_text;
  }

  const output = openaiData.output;

  if (Array.isArray(output)) {
    for (const item of output) {
      if (Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (typeof contentItem.text === "string") {
            return contentItem.text;
          }
        }
      }
    }
  }

  return "AI response was empty.";
}

export async function POST(req: Request) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Please log in to use AI coach." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Invalid user session. Please log in again.",
          details: userError?.message,
        },
        { status: 401 }
      );
    }

    const body = await req.json();
    const message = String(body?.message || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { error: "Message is too long. Max 5000 characters." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>();

    if (subscriptionError) {
      return NextResponse.json(
        {
          error: "Failed to check subscription.",
          details: subscriptionError.message,
        },
        { status: 500 }
      );
    }

    if (!subscription) {
      return NextResponse.json(
        {
          error: "No active subscription. Please choose a plan first.",
        },
        { status: 403 }
      );
    }

    const usage = await checkAiFeatureLimit({
  supabaseAdmin,
  userId: user.id,
  planId: subscription.plan_id,
  feature: "ai_coach",
});

if (!usage.allowed) {
  return NextResponse.json(
    {
      error:
        "AI message limit reached for your current SkillEdge plan. Upgrade your plan or wait until the next monthly reset.",
      code: "AI_LIMIT_REACHED",
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    },
    { status: 429 }
  );
}

    const publicPlanName = getPublicPlanName(subscription.plan_id);

    const systemPrompt = `
You are ${publicPlanName}, a trading performance AI coach inside SkillEdge AI.

Your job:
- help traders analyze discipline, execution, risk, emotions, and patterns;
- do not claim certainty about future market direction;
- do not give guaranteed financial advice;
- focus on process, risk, journaling, and decision quality;
- answer clearly, practically, and in the user's language;
- if the user writes in Russian, answer in Russian;
- if the user writes in Ukrainian, answer in Ukrainian;
- if the user writes in English, answer in English.

User's current plan:
- plan_id: ${subscription.plan_id}
- demo: ${subscription.is_demo ? "yes" : "no"}
- AI usage this month: ${usage.used}/${usage.limit}
`.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
       model: getOpenAIModel(subscription.plan_id),
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const openaiData = await response.json();

    if (!response.ok) {
  console.error("OPENAI ERROR:", JSON.stringify(openaiData, null, 2));

  return NextResponse.json(
    {
      error:
        openaiData?.error?.message ||
        openaiData?.message ||
        "OpenAI request failed.",
      details: openaiData,
    },
    { status: response.status }
  );
}

    const aiText = extractResponseText(openaiData);

    const tokensUsed =
      openaiData.usage?.total_tokens ??
      (openaiData.usage?.input_tokens || 0) +
        (openaiData.usage?.output_tokens || 0);

    const { error: insertError } = await supabaseAdmin
      .from("ai_analyses")
      .insert({
        user_id: user.id,
        subscription_id: subscription.id,
        analysis_type: "coach",
        user_message: message,
        ai_response: aiText,
        model: getOpenAIModel(subscription.plan_id),
        tokens_used: tokensUsed,
      });

    if (insertError) {
      return NextResponse.json(
        {
          error: "AI response created, but failed to save analysis.",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        ai_used_this_month: subscription.ai_used_this_month + 1,
      })
      .eq("id", subscription.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: "AI response created, but failed to update usage.",
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
  answer: aiText,
  aiUsed: usage.used + 1,
  aiLimit: usage.limit,
  remaining: Math.max(usage.remaining - 1, 0),
});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI coach route error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}