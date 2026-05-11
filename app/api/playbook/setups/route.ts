import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type MarketAlertRow = {
  id: string;
  user_id: string | null;
  symbol: string;
  asset_type: string | null;
  direction: string | null;

  setup_slug: string | null;
  setup_name: string | null;
  setup_type: string | null;
  setup_timeframe: string | null;
  confirmation_timeframe: string | null;
  confidence_score: number | null;
  confidence_tier: string | null;

  setup_description: string | null;
  setup_confirmation: string | null;
  setup_common_mistake: string | null;
  lesson_summary: string | null;

  confirmation_checklist: unknown;
  avoid_if: unknown;

  entry_zone_min: number | null;
  entry_zone_max: number | null;
  stop_price: number | null;
  target_1: number | null;
  target_2: number | null;
  target_3: number | null;
};

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

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

  if (!data || isExpired) return "core";

  return normalizePlanId(data.plan_id);
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
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
          error: "Personal Playbook is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_signal_playbook")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to load personal playbook:", error);

      return NextResponse.json(
        { error: "Failed to load personal playbook." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "personal_signal_playbook",
      count: data?.length || 0,
      items: data || [],
    });
  } catch (error) {
    console.error("Personal playbook GET error:", error);

    return NextResponse.json(
      { error: "Failed to load personal playbook." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "social_tickers")) {
      return NextResponse.json(
        {
          error: "Personal Playbook is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      alertId?: string;
      notes?: string;
    } | null;

    const alertId = body?.alertId;

    if (!alertId) {
      return NextResponse.json(
        { error: "alertId is required." },
        { status: 400 }
      );
    }

    const { data: alertData, error: alertError } = await supabaseAdmin
      .from("market_alerts")
      .select(
        [
          "id",
          "user_id",
          "symbol",
          "asset_type",
          "direction",
          "setup_slug",
          "setup_name",
          "setup_type",
          "setup_timeframe",
          "confirmation_timeframe",
          "confidence_score",
          "confidence_tier",
          "setup_description",
          "setup_confirmation",
          "setup_common_mistake",
          "lesson_summary",
          "confirmation_checklist",
          "avoid_if",
          "entry_zone_min",
          "entry_zone_max",
          "stop_price",
          "target_1",
          "target_2",
          "target_3",
        ].join(",")
      )
      .eq("id", alertId)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .maybeSingle();

    if (alertError) {
      console.error("Failed to load alert for playbook:", alertError);

      return NextResponse.json(
        { error: "Failed to load alert." },
        { status: 500 }
      );
    }

    if (!alertData) {
      return NextResponse.json(
        { error: "Alert not found." },
        { status: 404 }
      );
    }

    const alert = alertData as unknown as MarketAlertRow;

    const setupName =
      alert.setup_name ||
      alert.setup_type ||
      `${alert.symbol} signal setup`;

    const setupSlug =
      alert.setup_slug || slugify(setupName) || `setup-${alert.id}`;

    const playbookPayload = {
      user_id: user.id,
      source_alert_id: alert.id,

      setup_slug: setupSlug,
      setup_name: setupName,
      asset_type: alert.asset_type || null,
      direction: alert.direction || null,

      setup_timeframe: alert.setup_timeframe || "5m",
      confirmation_timeframe: alert.confirmation_timeframe || "10m",
      confidence_score: alert.confidence_score,
      confidence_tier: alert.confidence_tier,

      setup_description: alert.setup_description,
      setup_confirmation: alert.setup_confirmation,
      setup_common_mistake: alert.setup_common_mistake,
      lesson_summary: alert.lesson_summary,

      confirmation_checklist: safeArray(alert.confirmation_checklist),
      avoid_if: safeArray(alert.avoid_if),

      example_symbol: alert.symbol,
      example_entry_zone_min: alert.entry_zone_min,
      example_entry_zone_max: alert.entry_zone_max,
      example_stop_price: alert.stop_price,
      example_target_1: alert.target_1,
      example_target_2: alert.target_2,
      example_target_3: alert.target_3,

      notes: typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    const { data: savedData, error: saveError } = await supabaseAdmin
      .from("user_signal_playbook")
      .upsert(playbookPayload, {
        onConflict: "user_id,setup_slug",
      })
      .select("*")
      .single();

    if (saveError) {
      console.error("Failed to save setup to playbook:", saveError);

      return NextResponse.json(
        { error: "Failed to save setup to playbook." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "personal_signal_playbook",
      saved: true,
      item: savedData,
    });
  } catch (error) {
    console.error("Personal playbook POST error:", error);

    return NextResponse.json(
      { error: "Failed to save setup to playbook." },
      { status: 500 }
    );
  }
}