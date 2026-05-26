import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MarketAlertAssetTypeFilter = "all" | "stock" | "crypto";
export type MarketAlertFeedStatus = "active" | "armed" | "watch";
export type MarketAlertFeedStatusFilter =
  | "all"
  | "tradable"
  | "active"
  | "armed"
  | "watch";

export type MarketAlertFeedItem = {
  id?: string | null;
  alert_key: string;
  user_id?: string | null;
  asset_type: "stock" | "crypto" | string;
  status: MarketAlertFeedStatus | string;
  score?: number | null;
  confidence_score?: number | null;
  created_at?: string | null;
  expires_at?: string | null;
  source_data?: Record<string, unknown> | null;
  is_new?: boolean | null;
  viewed_at?: string | null;
  user_alert_decision?: string | null;
  user_alert_decision_note?: string | null;
  [key: string]: unknown;
};

type UserAlertStateRow = {
  alert_id: string;
  is_new: boolean | null;
  viewed_at: string | null;
  decision: string | null;
  decision_note: string | null;
};

export function normalizeMarketAlertAssetTypeFilter(
  value: string | null | undefined
): MarketAlertAssetTypeFilter {
  const normalized = (value || "all").toLowerCase();

  if (["crypto", "coin", "coins"].includes(normalized)) return "crypto";
  if (["stock", "stocks", "equity", "equities"].includes(normalized)) return "stock";

  return "all";
}

export function normalizeMarketAlertStatusFilter(
  value: string | null | undefined
): MarketAlertFeedStatusFilter {
  const normalized = (value || "all").toLowerCase();

  if (normalized === "active") return "active";
  if (normalized === "armed") return "armed";
  if (normalized === "watch") return "watch";
  if (["tradable", "delivery", "telegram", "actionable"].includes(normalized)) {
    return "tradable";
  }

  return "all";
}

function getStatusSet(status: MarketAlertFeedStatusFilter): MarketAlertFeedStatus[] {
  if (status === "active") return ["active"];
  if (status === "armed") return ["armed"];
  if (status === "watch") return ["watch"];
  if (status === "tradable") return ["active", "armed"];

  return ["active", "armed", "watch"];
}

export function getMarketAlertStatusRank(status: string | null | undefined) {
  if (status === "active") return 3;
  if (status === "armed") return 2;
  if (status === "watch") return 1;

  return 0;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").replace("%", ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function getAlertPeriodSince(period: string | null | undefined) {
  const normalized = (period || "24h").toLowerCase();

  if (normalized === "all") return null;

  if (normalized === "active") return null;

  if (normalized === "7d" || normalized === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (normalized.endsWith("h")) {
    const hours = Number(normalized.replace("h", ""));
    if (Number.isFinite(hours) && hours > 0) {
      return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }
  }

  if (normalized.endsWith("d")) {
    const days = Number(normalized.replace("d", ""));
    if (Number.isFinite(days) && days > 0) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function matchesAssetTypeFilter(
  assetType: string | null | undefined,
  filter: MarketAlertAssetTypeFilter
) {
  if (filter === "all") return true;
  return filter === "crypto" ? assetType === "crypto" : assetType !== "crypto";
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractCryptoVenue(item: MarketAlertFeedItem) {
  const sourceData = getRecord(item.source_data);
  const marketGate = getRecord(sourceData.cryptoMarketGate);
  const volumeGate = getRecord(sourceData.volumeGate);

  const candidates = [
    sourceData.cryptoSignalVenue,
    marketGate.venue,
    marketGate.provider,
    volumeGate.venue,
    sourceData.provider,
    item.exchange,
  ];

  return candidates.map(normalizeText).find(Boolean) || "";
}

function isAllowedCryptoAlert(item: MarketAlertFeedItem) {
  if (item.asset_type !== "crypto") return true;

  const sourceDataText = normalizeText(JSON.stringify(item.source_data || {}));
  if (
    sourceDataText.includes("dex") ||
    sourceDataText.includes("dexscreener") ||
    sourceDataText.includes("pancake") ||
    sourceDataText.includes("uniswap") ||
    sourceDataText.includes("raydium")
  ) {
    return false;
  }

  const venue = extractCryptoVenue(item);

  return venue === "binance" || venue === "hyperliquid";
}

function isNotExpired(item: MarketAlertFeedItem) {
  if (!item.expires_at) return true;

  const expiresAt = new Date(item.expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return true;

  return expiresAt > Date.now();
}

export function sortMarketAlertsCanonical<T extends MarketAlertFeedItem>(items: T[]) {
  return [...items].sort((a, b) => {
    const statusDiff = getMarketAlertStatusRank(b.status) - getMarketAlertStatusRank(a.status);
    if (statusDiff !== 0) return statusDiff;

    const scoreDiff = Math.max(toNumber(b.confidence_score), toNumber(b.score)) -
      Math.max(toNumber(a.confidence_score), toNumber(a.score));
    if (scoreDiff !== 0) return scoreDiff;

    const bCreatedAt = new Date(String(b.created_at || "1970-01-01T00:00:00.000Z")).getTime();
    const aCreatedAt = new Date(String(a.created_at || "1970-01-01T00:00:00.000Z")).getTime();

    return bCreatedAt - aCreatedAt;
  });
}

export function buildMarketAlertFeedMetrics(items: MarketAlertFeedItem[]) {
  const confidenceValues = items
    .map((item) => Math.max(toNumber(item.confidence_score), toNumber(item.score)))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    total: items.length,
    stocks: items.filter((item) => item.asset_type !== "crypto").length,
    crypto: items.filter((item) => item.asset_type === "crypto").length,
    active: items.filter((item) => item.status === "active").length,
    armed: items.filter((item) => item.status === "armed").length,
    watch: items.filter((item) => item.status === "watch").length,
    avgConfidence:
      confidenceValues.length > 0
        ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
        : null,
  };
}

export function buildMarketAlertFeedSourceCoverage(items: MarketAlertFeedItem[]) {
  const sources = new Set<string>();

  for (const item of items) {
    const sourceData = getRecord(item.source_data);
    const social = getRecord(sourceData.social);
    const socialSources = Array.isArray(social.sources) ? social.sources : [];

    for (const source of socialSources) {
      if (typeof source === "string" && source.trim()) sources.add(source.trim());
    }

    const cryptoVenue = extractCryptoVenue(item);
    if (cryptoVenue) sources.add(cryptoVenue);

    if (item.asset_type === "stock") sources.add("fmp");
  }

  return Array.from(sources);
}

async function mergeUserAlertStates(items: MarketAlertFeedItem[], userId: string | null) {
  if (!userId || items.length === 0) return items;

  const alertIds = items
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (alertIds.length === 0) return items;

  const { data, error } = await supabaseAdmin
    .from("user_market_alert_states")
    .select("alert_id,is_new,viewed_at,decision,decision_note")
    .eq("user_id", userId)
    .in("alert_id", alertIds);

  if (error) {
    console.error("Failed to load market alert user states:", error);
    return items;
  }

  const states = ((data || []) as UserAlertStateRow[]).reduce<Record<string, UserAlertStateRow>>(
    (acc, state) => {
      acc[state.alert_id] = state;
      return acc;
    },
    {}
  );

  return items.map((item) => {
    const state = item.id ? states[item.id] : null;

    return {
      ...item,
      is_new: state ? state.is_new : item.is_new ?? true,
      viewed_at: state ? state.viewed_at : item.viewed_at ?? null,
      user_alert_decision: state ? state.decision : item.user_alert_decision ?? null,
      user_alert_decision_note: state
        ? state.decision_note
        : item.user_alert_decision_note ?? null,
    };
  });
}

export async function loadMarketAlertFeed(params: {
  userId?: string | null;
  assetType?: MarketAlertAssetTypeFilter | string | null;
  status?: MarketAlertFeedStatusFilter | string | null;
  period?: string | null;
  createdSince?: string | null;
  limit?: number;
  includeExpired?: boolean;
}) {
  const assetType = normalizeMarketAlertAssetTypeFilter(params.assetType);
  const status = normalizeMarketAlertStatusFilter(params.status);
  const statusSet = getStatusSet(status);
  const limit = Math.max(1, Math.min(250, Number(params.limit || 100)));
  const fetchLimit = Math.max(limit * 4, 100);
  const since = params.createdSince || getAlertPeriodSince(params.period || "24h");

  let query = supabaseAdmin
    .from("market_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(fetchLimit, 500));

  if (params.userId) {
    query = query.or(`user_id.is.null,user_id.eq.${params.userId}`);
  } else {
    query = query.is("user_id", null);
  }

  if (assetType !== "all") {
    query = query.eq("asset_type", assetType);
  }

  if (statusSet.length < 3) {
    query = query.in("status", statusSet);
  }

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rawItems = ((data || []) as MarketAlertFeedItem[])
    .filter((item) => matchesAssetTypeFilter(item.asset_type, assetType))
    .filter((item) => statusSet.includes(item.status as MarketAlertFeedStatus))
    .filter(isAllowedCryptoAlert)
    .filter((item) => params.includeExpired || isNotExpired(item));

  const sortedItems = sortMarketAlertsCanonical(rawItems).slice(0, limit);
  const items = await mergeUserAlertStates(sortedItems, params.userId || null);

  return {
    source: "market_alerts_canonical_feed",
    period: params.period || (params.createdSince ? "custom" : "24h"),
    assetType,
    status,
    count: items.length,
    metrics: buildMarketAlertFeedMetrics(items),
    sourceCoverage: buildMarketAlertFeedSourceCoverage(items),
    scannedAt: new Date().toISOString(),
    cache: {
      ttl: Number(process.env.MARKET_ALERTS_CACHE_TTL_SECONDS || "10"),
      cachedAt: new Date().toISOString(),
    },
    items,
  };
}

