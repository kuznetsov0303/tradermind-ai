import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

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
   const gate = await requireFeatureAccess(request, "ai_alerts", {
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
          error: "Alerts are available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      alertIds?: string[];
    } | null;

    const alertIds = Array.isArray(body?.alertIds)
      ? body.alertIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];

    if (alertIds.length === 0) {
      return NextResponse.json(
        { error: "alertIds are required." },
        { status: 400 }
      );
    }

    const { data: allowedAlerts, error: allowedError } = await supabaseAdmin
      .from("market_alerts")
      .select("id")
      .in("id", alertIds)
      .or(`user_id.is.null,user_id.eq.${user.id}`);

    if (allowedError) {
      console.error("Failed to validate viewed alerts:", allowedError);

      return NextResponse.json(
        { error: "Failed to validate alerts." },
        { status: 500 }
      );
    }

    const allowedAlertIds = (allowedAlerts || [])
      .map((alert) => alert.id)
      .filter(Boolean);

    if (allowedAlertIds.length === 0) {
      return NextResponse.json(
        { error: "No accessible alerts found." },
        { status: 404 }
      );
    }

    const viewedAt = new Date().toISOString();

    const rows = allowedAlertIds.map((alertId) => ({
      user_id: user.id,
      alert_id: alertId,
      is_new: false,
      viewed_at: viewedAt,
      decision: "viewed",
      updated_at: viewedAt,
    }));

    const { data, error } = await supabaseAdmin
      .from("user_market_alert_states")
      .upsert(rows, {
        onConflict: "user_id,alert_id",
      })
      .select("alert_id,is_new,viewed_at,decision");

    if (error) {
      console.error("Failed to mark alerts as viewed:", error);

      return NextResponse.json(
        { error: "Failed to mark alerts as viewed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "user_market_alert_states",
      viewedAt,
      count: data?.length || 0,
      items: data || [],
    });
  } catch (error) {
    console.error("Mark alerts viewed error:", error);

    return NextResponse.json(
      { error: "Failed to mark alerts as viewed." },
      { status: 500 }
    );
  }
}