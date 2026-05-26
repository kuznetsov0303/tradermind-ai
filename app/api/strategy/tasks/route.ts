import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId");
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("strategy_tasks")
      .select("*")
      .eq("user_id", gate.auth.user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);

    if (strategyId) query = query.eq("strategy_id", strategyId);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_tasks",
      tasks: data || [],
    });
  } catch (error) {
    console.error("Strategy tasks GET error", error);
    return NextResponse.json({ error: "Failed to load Strategy tasks." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => ({}));
    const taskId = asText(body.taskId, "");
    const status = asText(body.status, "");

    if (!taskId || !["open", "in_progress", "completed", "skipped"].includes(status)) {
      return NextResponse.json({ error: "Valid taskId and status are required." }, { status: 400 });
    }

    const updates: Record<string, unknown> = { status };
    if (status === "completed") updates.completed_at = new Date().toISOString();
    if (status !== "completed") updates.completed_at = null;

    const { data, error } = await supabaseAdmin
      .from("strategy_tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("user_id", gate.auth.user.id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_task_update",
      task: data,
    });
  } catch (error) {
    console.error("Strategy tasks PATCH error", error);
    return NextResponse.json({ error: "Failed to update Strategy task." }, { status: 500 });
  }
}
