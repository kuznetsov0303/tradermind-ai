import { NextResponse } from "next/server";
import { generateMarketAlertsInternal } from "@/lib/trading/market-alert-generator";
import { deliverSignalsToTelegram } from "@/lib/trading/signal-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronAuthorized(request: Request) {
  const secret = process.env.MARKET_ALERTS_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const querySecret = new URL(request.url).searchParams.get("secret");

  if (!secret) return false;

  return auth === `Bearer ${secret}` || querySecret === secret;
}

function normalizeCronAssetType(value: string | null): "all" | "stock" | "crypto" {
  if (value === "stock") return "stock";
  if (value === "crypto") return "crypto";

  return "all";
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const assetType = normalizeCronAssetType(searchParams.get("assetType"));

    const result = await generateMarketAlertsInternal({
      assetType,
      planId: "elite",
      source: "cron",
    });

    const telegram = await deliverSignalsToTelegram(
  result.items.filter(
    (alert: { status: string }) =>
      alert.status === "active" || alert.status === "armed"
  )
);

    return NextResponse.json({
      ok: true,
      ...result,
      telegram,
    });
  } catch (error) {
    console.error("Market alerts cron error:", error);

    return NextResponse.json(
      { error: "Failed to run market alerts cron." },
      { status: 500 }
    );
  }
}

