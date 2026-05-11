import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

const ALLOWED_DECISIONS = new Set(["viewed", "watching", "taken", "skipped", "missed"]);

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
          error: "Alerts are available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      alertId?: string;
      decision?: string;
    } | null;

    const alertId = typeof body?.alertId === "string" ? body.alertId : "";
    const decision = typeof body?.decision === "string" ? body.decision : "";

    if (!alertId) {
      return NextResponse.json({ error: "alertId is required." }, { status: 400 });
    }

    if (!ALLOWED_DECISIONS.has(decision)) {
      return NextResponse.json(
        { error: "Invalid alert decision." },
        { status: 400 }
      );
    }

    const { data: alert, error: alertError } = await supabaseAdmin
      .from("market_alerts")
      .select("id")
      .eq("id", alertId)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .maybeSingle();

    if (alertError) {
      console.error("Failed to validate alert decision:", alertError);

      return NextResponse.json(
        { error: "Failed to validate alert." },
        { status: 500 }
      );
    }

    if (!alert) {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("user_market_alert_states")
      .upsert(
        {
          user_id: user.id,
          alert_id: alertId,
          is_new: false,
          viewed_at: now,
          decision,
          updated_at: now,
        },
        {
          onConflict: "user_id,alert_id",
        }
      )
      .select("alert_id,is_new,viewed_at,decision")
      .maybeSingle();

    if (error) {
      console.error("Failed to save alert decision:", error);

      return NextResponse.json(
        { error: "Failed to save alert decision." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "user_market_alert_decision",
      item: data,
    });
  } catch (error) {
    console.error("Alert decision route error:", error);

    return NextResponse.json(
      { error: "Failed to save alert decision." },
      { status: 500 }
    );
  }
}