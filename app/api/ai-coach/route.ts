import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAiFeatureLimit } from "@/lib/ai-usage-limits";
import { requireAiRouteAccess } from "@/lib/security/ai-route-gate";
import {
  getSkillEdgeAiCoachPrompt,
  getSkillEdgeConciseOutputRules,
} from "@/lib/ai/skill-edge-ai-master-prompt";

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
  const normalizedPlanId = planId.toLowerCase();

  if (normalizedPlanId.includes("elite")) {
    return process.env.SKILLEDGE_ELITE_AI_MODEL || "gpt-5.1";
  }

  if (normalizedPlanId.includes("edge") || normalizedPlanId.includes("pro")) {
    return process.env.SKILLEDGE_EDGE_AI_MODEL || "gpt-5-mini";
  }

  return process.env.SKILLEDGE_CORE_AI_MODEL || "gpt-4.1-mini";
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
    const aiGate = await requireAiRouteAccess(req, {
    routeName: "ai-coach",
    requireActiveSubscription: true,
    rateLimit: {
      limit: 30,
      windowMs: 60_000,
    },
  });

  if (!aiGate.ok) return aiGate.response;
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "SkillEdge AI coach is not available right now." },
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

    const messageLanguage =
  /[іїєґ]/i.test(message)
    ? "ua"
    : /[а-яё]/i.test(message)
      ? "ru"
      : "en";

const systemPrompt = [
  getSkillEdgeAiCoachPrompt({
    language: messageLanguage,
    plan: subscription.plan_id,
    userContext: [
      `Public AI brand: ${publicPlanName}`,
      `Plan ID: ${subscription.plan_id}`,
      `Demo mode: ${subscription.is_demo ? "yes" : "no"}`,
      `AI usage this month: ${usage.used}/${usage.limit}`,
    ].join("\n"),
  }),
  getSkillEdgeConciseOutputRules(),
].join("\n\n");

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
  console.error("AI COACH ERROR:", JSON.stringify(openaiData, null, 2));

  return NextResponse.json(
    {
      error: "SkillEdge AI request failed. Please try again.",
      details: process.env.NODE_ENV === "development" ? openaiData : undefined,
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