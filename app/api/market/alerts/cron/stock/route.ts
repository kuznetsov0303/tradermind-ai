import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLegacyStockCronEnabled() {
  const value = String(process.env.SIGNAL_STOCK_LEGACY_ENGINE_ENABLED || "false")
    .trim()
    .toLowerCase();

  return ["1", "true", "yes", "on"].includes(value);
}

export async function GET(_request: NextRequest) {
  if (!isLegacyStockCronEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      assetType: "stock",
      engine: "legacy_stock_cron",
      reason:
        "Legacy stock cron is disabled. Stock signals now belong to the persistent Holly-like stock engine v2.",
      nextEngine: process.env.SIGNAL_STOCK_ENGINE_VERSION || "holly_persistent_v2",
      generatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json(
    {
      ok: false,
      skipped: true,
      assetType: "stock",
      engine: "legacy_stock_cron",
      reason:
        "Legacy stock cron override is enabled, but direct execution is intentionally blocked. Use the old route only as an explicit debug path, not customer-facing stock generation.",
      generatedAt: new Date().toISOString(),
    },
    { status: 409 }
  );
}