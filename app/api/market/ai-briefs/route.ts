import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type MarketAIBriefRow = {
  id: string;
  user_id: string;
  plan_id: string;
  language: string;
  source: string;
  input_items: unknown;
  summary: string | null;
  analysis_items: unknown;
  created_at: string;
};

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

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
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
          error: "AI Brief History is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") || "10");
    const limit = Math.max(1, Math.min(30, limitParam));

    const { data, error } = await supabaseAdmin
      .from("market_ai_briefs")
      .select(
        "id, user_id, plan_id, language, source, input_items, summary, analysis_items, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to load AI brief history:", error);

      return NextResponse.json(
        { error: "Failed to load AI brief history." },
        { status: 500 }
      );
    }

    const items = ((data || []) as MarketAIBriefRow[]).map((brief) => ({
      id: brief.id,
      planId: brief.plan_id,
      language: brief.language,
      source: brief.source,
      summary: brief.summary || "",
      inputItems: safeArray(brief.input_items),
      analysisItems: safeArray(brief.analysis_items),
      createdAt: brief.created_at,
    }));

    return NextResponse.json({
      source: "skilledge_ai_brief_history",
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("AI brief history route error:", error);

    return NextResponse.json(
      { error: "Failed to load AI brief history." },
      { status: 500 }
    );
  }
}