import { randomUUID } from "crypto";
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

function createConnectCode() {
  return `se_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function POST(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 10,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;

  const user = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const planId = await getUserPlan(user.id);

  if (!canUseFeature(planId, "ai_alerts")) {
    return NextResponse.json(
      {
        error: "Telegram Signals are available only on SkillEdge Elite.",
        locked: true,
        requiredPlan: "elite",
        feature: "ai_alerts",
        currentPlan: planId,
      },
      { status: 403 }
    );
  }

  const botUsername = process.env.TELEGRAM_SIGNALS_BOT_USERNAME;

  if (!botUsername) {
    return NextResponse.json(
      { error: "TELEGRAM_SIGNALS_BOT_USERNAME is missing." },
      { status: 500 }
    );
  }

  const code = createConnectCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("telegram_signal_connect_codes")
    .insert({
      code,
      user_id: user.id,
      expires_at: expiresAt,
    });

  if (error) {
    console.error("Failed to create telegram signal connect code:", error);

    return NextResponse.json(
      { error: "Failed to create Telegram connect code." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    code,
    expiresAt,
    deepLink: `https://t.me/${botUsername}?start=${code}`,
  });
}
