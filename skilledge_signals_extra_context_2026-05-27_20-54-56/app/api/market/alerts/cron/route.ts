import { NextResponse } from "next/server";
import { generateMarketAlertsInternal } from "@/lib/trading/market-alert-generator";
import { deliverLatestPersistedSignalsToTelegram } from "@/lib/trading/signal-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CronAssetType = "all" | "stock" | "crypto";
type CronAuthSource = "authorization" | "x-cron-secret" | "query" | null;

type GeneratedAlertLike = {
  status?: string | null;
  symbol?: string | null;
  asset_type?: string | null;
  score?: number | null;
};

const DEFAULT_DELIVERY_WINDOW_MINUTES = 15;
const DEFAULT_DELIVERY_LIMIT = 120;
const MAX_DELIVERY_LIMIT = 250;

function compactSecrets(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (value || "").trim())
        .filter((value): value is string => value.length > 0)
    )
  );
}

function getCronSecrets() {
  return compactSecrets([
    process.env.CRON_SECRET,
    process.env.MARKET_ALERTS_CRON_SECRET,
    process.env.OUTCOME_CRON_SECRET,
  ]);
}

function getCronAuthSource(request: Request): CronAuthSource {
  const secrets = getCronSecrets();

  if (secrets.length === 0) return null;

  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-cron-secret") || "";
  const querySecret = url.searchParams.get("secret") || "";

  if (secrets.some((secret) => authHeader === `Bearer ${secret}`)) {
    return "authorization";
  }

  if (secrets.some((secret) => cronHeader === secret)) {
    return "x-cron-secret";
  }

  if (secrets.some((secret) => querySecret === secret)) {
    return "query";
  }

  return null;
}

function isCronAuthorized(request: Request) {
  return getCronAuthSource(request) !== null;
}

function normalizeCronAssetType(value: string | null): CronAssetType {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "stock" || normalized === "stocks" || normalized === "equity") {
    return "stock";
  }

  if (normalized === "crypto" || normalized === "coin" || normalized === "coins") {
    return "crypto";
  }

  return "all";
}

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function countGeneratedStatuses(items: GeneratedAlertLike[]) {
  return {
    total: items.length,
    active: items.filter((alert) => alert.status === "active").length,
    armed: items.filter((alert) => alert.status === "armed").length,
    watch: items.filter((alert) => alert.status === "watch").length,
  };
}

function serializeCronError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export async function GET(request: Request) {
  const authSource = getCronAuthSource(request);

  if (!authSource) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized cron.",
        hint:
          "Set CRON_SECRET in Vercel Production env. Optional aliases: MARKET_ALERTS_CRON_SECRET / OUTCOME_CRON_SECRET.",
      },
      { status: 401 }
    );
  }

  const startedAt = new Date().toISOString();

  try {
    const { searchParams } = new URL(request.url);
    const assetType = normalizeCronAssetType(searchParams.get("assetType"));
    const deliveryWindowMinutes = clampInteger(
      searchParams.get("deliveryWindowMinutes"),
      DEFAULT_DELIVERY_WINDOW_MINUTES,
      1,
      60
    );
    const deliveryLimit = clampInteger(
      searchParams.get("deliveryLimit") || searchParams.get("limit"),
      DEFAULT_DELIVERY_LIMIT,
      1,
      MAX_DELIVERY_LIMIT
    );
    const deliverySince = new Date(
      Date.now() - deliveryWindowMinutes * 60 * 1000
    ).toISOString();

    const generation = await generateMarketAlertsInternal({
      assetType,
      planId: "elite",
      source: "cron",
    });

    const generatedItems = Array.isArray(generation.items)
      ? (generation.items as GeneratedAlertLike[])
      : [];

    const telegram = await deliverLatestPersistedSignalsToTelegram({
      assetType,
      createdSince: deliverySince,
      limit: deliveryLimit,
    });

    const finishedAt = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      source: "skillEdge_market_alerts_cron_v77_1",
      assetType,
      auth: authSource,
      startedAt,
      finishedAt,
      deliveryWindowMinutes,
      deliverySince,
      generated: countGeneratedStatuses(generatedItems),
      generation,
      telegram,
      sourceOfTruth:
        "Signals are generated into market_alerts first. Telegram/widget/history read the persisted signal feed, not a separate in-memory list.",
    });
  } catch (error) {
    console.error("SkillEdge market alerts cron error:", error);

    return NextResponse.json(
      {
        ok: false,
        source: "skillEdge_market_alerts_cron_v77_1",
        startedAt,
        failedAt: new Date().toISOString(),
        error: "Failed to run market alerts cron.",
        details: serializeCronError(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

