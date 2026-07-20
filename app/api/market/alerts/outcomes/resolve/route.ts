import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";
import { resolvePendingMarketAlertOutcomes } from "@/lib/trading/signal-outcome-resolver";

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

function normalizeAssetType(value: unknown): "stock" | "crypto" | "all" {
  return value === "stock" || value === "crypto" ? value : "all";
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true";
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

    const { searchParams } = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const assetType = normalizeAssetType(
      searchParams.get("assetType") || body.assetType
    );

    const limit = Number(searchParams.get("limit") || body.limit || "50");
    const dryRun = normalizeBoolean(searchParams.get("dryRun") || body.dryRun);
    const maxAgeHoursRaw = searchParams.get("maxAgeHours") || body.maxAgeHours;
    const maxAgeHours =
      maxAgeHoursRaw === undefined || maxAgeHoursRaw === null
        ? undefined
        : Number(maxAgeHoursRaw);

    const result = await resolvePendingMarketAlertOutcomes({
      assetType,
      limit,
      dryRun,
      maxAgeHours:
        Number.isFinite(maxAgeHours) && Number(maxAgeHours) > 0
          ? Number(maxAgeHours)
          : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Outcome resolver error:", error);

    return NextResponse.json(
      {
        error: "Failed to resolve market alert outcomes.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}