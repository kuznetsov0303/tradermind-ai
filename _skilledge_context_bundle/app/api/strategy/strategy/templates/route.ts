import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const market = searchParams.get("market");
    const difficulty = searchParams.get("difficulty");
    const category = searchParams.get("category");

    let query = supabaseAdmin
      .from("strategy_setup_templates")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (market && market !== "all") query = query.eq("market", market);
    if (difficulty && difficulty !== "all") query = query.eq("difficulty", difficulty);
    if (category && category !== "all") query = query.eq("category", category);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_setup_templates",
      templates: data || [],
    });
  } catch (error) {
    console.error("Strategy templates error", error);
    return NextResponse.json(
      { error: "Failed to load setup templates." },
      { status: 500 },
    );
  }
}
