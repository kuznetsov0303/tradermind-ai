import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 6000);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId");
    const setupSlug = searchParams.get("setupSlug");

    let query = supabaseAdmin
      .from("strategy_examples")
      .select("*")
      .eq("user_id", gate.auth.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (strategyId) query = query.eq("strategy_id", strategyId);
    if (setupSlug) query = query.eq("setup_slug", setupSlug);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_examples",
      examples: data || [],
    });
  } catch (error) {
    console.error("Strategy examples GET error", error);
    return NextResponse.json({ error: "Failed to load strategy examples." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 80, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const userId = gate.auth.user.id;
    const body = await request.json().catch(() => ({}));
    const strategyId = asText(body.strategyId, "");
    const strategyVersionId = asText(body.strategyVersionId, "") || null;
    const setupSlug = asText(body.setupSlug, "") || null;

    if (!strategyId && !setupSlug) {
      return NextResponse.json(
        { error: "strategyId or setupSlug is required." },
        { status: 400 },
      );
    }

    if (strategyId) {
      const { data: strategy, error: strategyError } = await supabaseAdmin
        .from("trading_strategies")
        .select("id")
        .eq("id", strategyId)
        .eq("user_id", userId)
        .maybeSingle();

      if (strategyError) throw strategyError;
      if (!strategy) {
        return NextResponse.json({ error: "Strategy not found." }, { status: 404 });
      }
    }

    const payload = {
      user_id: userId,
      strategy_id: strategyId || null,
      strategy_version_id: strategyVersionId,
      setup_slug: setupSlug,
      example_type: asText(body.exampleType, "historical"),
      quality_tag: asText(body.qualityTag, "unreviewed"),
      symbol: asText(body.symbol, "") || null,
      asset_type: asText(body.assetType, "") || null,
      example_date: safeDate(body.exampleDate),
      timeframe: asText(body.timeframe, "") || null,
      screenshot_url: asText(body.screenshotUrl, "") || null,
      chart_notes: asText(body.chartNotes, "") || null,
      entry_zone: asText(body.entryZone, "") || null,
      stop_level: asText(body.stopLevel, "") || null,
      target_plan: asText(body.targetPlan, "") || null,
      confirmation_notes: asText(body.confirmationNotes, "") || null,
      invalidation_notes: asText(body.invalidationNotes, "") || null,
      user_answer: asRecord(body.userAnswer),
      ai_review: {},
      ai_score: null,
    };

    const { data, error } = await supabaseAdmin
      .from("strategy_examples")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    if (strategyId) {
      const { count } = await supabaseAdmin
        .from("strategy_examples")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("strategy_id", strategyId);

      await supabaseAdmin
        .from("strategy_missions")
        .update({ progress_current: Math.min(count || 0, 10) })
        .eq("user_id", userId)
        .eq("strategy_id", strategyId)
        .eq("status", "active")
        .eq("mission_type", "first_7_days");
    }

    return NextResponse.json({
      source: "skillEdge_strategy_add_example",
      example: data,
    });
  } catch (error) {
    console.error("Strategy examples POST error", error);
    return NextResponse.json({ error: "Failed to add strategy example." }, { status: 500 });
  }
}
