import {
  generateMarketAlertsInternal,
  type MarketAlertGenerationResult,
} from "@/lib/trading/market-alert-generator";
import { deliverLatestPersistedSignalsToTelegram } from "@/lib/trading/signal-delivery";
import type { MarketAlertAssetTypeFilter } from "@/lib/trading/market-alert-feed";

export function normalizeCronAssetType(value: string | null | undefined): MarketAlertAssetTypeFilter {
  if (value === "stock") return "stock";
  if (value === "crypto") return "crypto";

  return "all";
}

export function isMarketAlertsCronAuthorized(request: Request) {
  const secret = process.env.MARKET_ALERTS_CRON_SECRET || process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const querySecret = new URL(request.url).searchParams.get("secret");

  if (!secret) return false;

  return auth === `Bearer ${secret}` || querySecret === secret;
}

export async function runMarketAlertsCron(assetType: MarketAlertAssetTypeFilter): Promise<
  MarketAlertGenerationResult & {
    telegram: Awaited<ReturnType<typeof deliverLatestPersistedSignalsToTelegram>>;
  }
> {
  const deliverySince = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const result = await generateMarketAlertsInternal({
    assetType,
    planId: "elite",
    source: "cron",
  });

  const telegram = await deliverLatestPersistedSignalsToTelegram({
    assetType,
    createdSince: deliverySince,
    limit: 120,
  });

  return {
    ...result,
    telegram,
  };
}
