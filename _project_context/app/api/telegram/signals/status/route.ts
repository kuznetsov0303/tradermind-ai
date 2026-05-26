import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

export async function GET(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 30,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;

  const user = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("telegram_signal_subscriptions")
    .select("chat_id, username, is_enabled, min_status, asset_filter, updated_at")
    .eq("user_id", user.id)
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load Telegram status." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    connected: Boolean(data),
    subscription: data || null,
  });
}

export async function DELETE(request: Request) {
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

  const { error } = await supabaseAdmin
    .from("telegram_signal_subscriptions")
    .update({
      is_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to disconnect Telegram Alerts." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, connected: false });
}
