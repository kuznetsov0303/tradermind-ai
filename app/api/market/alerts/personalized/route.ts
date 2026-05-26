import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/security/feature-gate";
import { loadMarketAlertFeed } from "@/lib/trading/market-alert-feed";

export const runtime = "nodejs";

function clampLimit(value: string | null) {
  const parsed = Number(value || "100");

  if (!Number.isFinite(parsed)) return 100;

  return Math.max(1, Math.min(250, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 60,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(request.url);

    const limit = clampLimit(searchParams.get("limit"));
    const period = searchParams.get("period") || "24h";
    const status = searchParams.get("status") || "all";
    const assetType = searchParams.get("assetType") || "all";

    const feed = await loadMarketAlertFeed({
      userId: gate.auth.user.id,
      assetType,
      status,
      period,
      limit,
    });

    return NextResponse.json({
      ...feed,
      source: "personalized_market_alerts",
      personalized: true,
      userId: gate.auth.user.id,
    });
  } catch (error) {
    console.error("Personalized market alerts route error:", error);

    return NextResponse.json(
      {
        error: "Failed to load personalized alerts.",
        source: "personalized_market_alerts",
        count: 0,
        items: [],
      },
      { status: 500 }
    );
  }
}