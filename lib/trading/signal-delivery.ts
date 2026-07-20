import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  loadMarketAlertFeed,
  type MarketAlertAssetTypeFilter,
  type MarketAlertFeedItem,
} from "@/lib/trading/market-alert-feed";
import {
  sendTelegramSignalMessage,
  shouldSendTelegramSignal,
} from "@/lib/trading/telegram-signal-alerts";

type DeliverableAlert = MarketAlertFeedItem & {
  alert_key: string;
  asset_type: "stock" | "crypto";
  status: "active" | "armed" | "watch";
  score: number;
};

function statusAllowed(alertStatus: string, minStatus: string) {
  if (alertStatus === "active") return true;
  if (alertStatus === "armed" && minStatus !== "active") return true;

  return false;
}

function normalizeDeliveryMinStatus(value: string | null | undefined) {
  return value === "active" ? "active" : "armed";
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(value: unknown) {
  if (value === true) return true;
  if (typeof value === "string") return value.toLowerCase() === "true";

  return false;
}

function readExplicitBoolean(value: unknown) {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    const record = getRecord(current);
    current = record[key];
  }

  return current;
}

function parseTimeMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function getNyDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getNyMinuteOfDay(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
}

function getNyStockSessionKind(date = new Date()) {
  const minute = getNyMinuteOfDay(date);

  if (minute >= 4 * 60 && minute < 9 * 60 + 30) return "premarket";
  if (minute >= 9 * 60 + 30 && minute < 16 * 60) return "regular";
  if (minute >= 16 * 60 && minute < 20 * 60) return "aftermarket";

  return "closed";
}

function getEntryDistancePct(alert: DeliverableAlert, currentPrice: number | null) {
  if (currentPrice === null || currentPrice <= 0) return null;

  const entryMin = readNumber((alert as any).entry_zone_min);
  const entryMax = readNumber((alert as any).entry_zone_max);

  if (entryMin === null || entryMax === null) return null;

  const min = Math.min(entryMin, entryMax);
  const max = Math.max(entryMin, entryMax);

  if (currentPrice >= min && currentPrice <= max) return 0;

  const nearest = currentPrice < min ? min : max;

  return Math.abs((currentPrice - nearest) / currentPrice) * 100;
}

function getStockFreshnessPayload(alert: DeliverableAlert) {
  const sourceData = getRecord(alert.source_data);
  const market = getRecord(sourceData.market);
  const rawData = getRecord(market.raw_data);
  const watchlistTechnical = getRecord(rawData.watchlistTechnical);
  const technicalSnapshot = getRecord(watchlistTechnical.technical_snapshot);
  const sessionMemory = getRecord(watchlistTechnical.session_structure_memory);
  const dataCoverage = getRecord(watchlistTechnical.data_coverage);

  const watchlistPriceFreshness = getRecord(watchlistTechnical.priceFreshness);
  const watchlistStockPriceFreshness = getRecord(watchlistTechnical.stockPriceFreshness);
  const coveragePriceFreshness = getRecord(dataCoverage.priceFreshness);
  const snapshotPriceFreshness = getRecord(technicalSnapshot.priceFreshness);
  const priceFreshness =
    watchlistPriceFreshness.status
      ? watchlistPriceFreshness
      : watchlistStockPriceFreshness.status
        ? watchlistStockPriceFreshness
        : coveragePriceFreshness.status
          ? coveragePriceFreshness
          : snapshotPriceFreshness.status
            ? snapshotPriceFreshness
            : {};

  const explicitFreshness = priceFreshness.status;

  const currentPrice =
    readNumber(priceFreshness.currentPrice) ??
    readNumber(watchlistTechnical.price) ??
    readNumber(rawData.price) ??
    readNumber((alert as any).price) ??
    null;

  const latestCandleAt =
    readText(sessionMemory.latestCandleAt) ||
    readText(technicalSnapshot.latestCandleAt) ||
    readText(dataCoverage.latestCandleAt) ||
    null;

  const latestCandleMs = parseTimeMs(latestCandleAt);
  const latestCandleNyDate =
    readText(sessionMemory.sessionDateNy) ||
    (latestCandleMs ? getNyDateString(new Date(latestCandleMs)) : null);

  const quoteTimestampMs =
    parseTimeMs(priceFreshness.timestamp) ??
    parseTimeMs(priceFreshness.updatedAt) ??
    parseTimeMs(priceFreshness.checkedAt) ??
    parseTimeMs(readPath(rawData, ["quote", "timestamp"])) ??
    parseTimeMs(readPath(rawData, ["quote", "updatedAt"])) ??
    parseTimeMs(readPath(rawData, ["quote", "lastUpdated"])) ??
    null;

  const now = Date.now();
  const latestCandleAgeSeconds =
    latestCandleMs === null ? null : Math.max(0, Math.round((now - latestCandleMs) / 1000));

  const quoteAgeSeconds =
    quoteTimestampMs === null ? null : Math.max(0, Math.round((now - quoteTimestampMs) / 1000));

  const currentNyDate = getNyDateString();
  const sessionKind = getNyStockSessionKind();

  const maxRegularCandleAgeSeconds = Number(
    process.env.SIGNAL_STOCK_REGULAR_MAX_CANDLE_AGE_SECONDS || "900"
  );

  const maxExtendedQuoteAgeSeconds = Number(
    process.env.SIGNAL_STOCK_EXTENDED_MAX_QUOTE_AGE_SECONDS || "180"
  );

  const stockTelegramMaxEntryDistanceRaw =
    process.env.SIGNAL_STOCK_TELEGRAM_MAX_ENTRY_DISTANCE_PCT ||
    process.env.SIGNAL_STOCK_PREPARED_ARMED_MAX_ENTRY_DISTANCE_PCT ||
    process.env.SIGNAL_STOCK_MAX_ENTRY_DISTANCE_PCT ||
    "0.35";
  const parsedStockTelegramMaxEntryDistance = Number(stockTelegramMaxEntryDistanceRaw);
  const maxEntryDistancePct =
    Number.isFinite(parsedStockTelegramMaxEntryDistance) &&
    parsedStockTelegramMaxEntryDistance >= 0
      ? parsedStockTelegramMaxEntryDistance
      : 0.35;

  const entryDistancePct = getEntryDistancePct(alert, currentPrice);

  const latestCandleIsToday =
    latestCandleNyDate !== null && latestCandleNyDate === currentNyDate;

  const explicitFresh = explicitFreshness === "fresh" || explicitFreshness === "live";

  const regularFresh =
    sessionKind === "regular" &&
    latestCandleIsToday &&
    latestCandleAgeSeconds !== null &&
    latestCandleAgeSeconds <= maxRegularCandleAgeSeconds;

  const extendedFresh =
    (sessionKind === "premarket" || sessionKind === "aftermarket") &&
    explicitFresh &&
    quoteAgeSeconds !== null &&
    quoteAgeSeconds <= maxExtendedQuoteAgeSeconds;

  const priceNearEntry =
    entryDistancePct !== null && entryDistancePct <= maxEntryDistancePct;

  const safe =
    priceNearEntry &&
    (sessionKind === "regular" ? regularFresh : extendedFresh);

  const reasons: string[] = [];

  if (!priceNearEntry) {
    reasons.push(
      entryDistancePct === null
        ? "missing_entry_distance"
        : `entry_distance_${entryDistancePct.toFixed(2)}pct_above_${maxEntryDistancePct.toFixed(2)}pct_limit`
    );
  }

  if (sessionKind === "regular" && !regularFresh) {
    reasons.push(
      `regular_candle_not_fresh latestCandleAt=${latestCandleAt || "null"} nyDate=${latestCandleNyDate || "null"} age=${latestCandleAgeSeconds ?? "null"}`
    );
  }

  if ((sessionKind === "premarket" || sessionKind === "aftermarket") && !extendedFresh) {
    reasons.push(
      `extended_quote_not_fresh status=${String(explicitFreshness || "missing")} quoteAge=${quoteAgeSeconds ?? "null"} latestCandleAt=${latestCandleAt || "null"}`
    );
  }

  if (sessionKind === "closed") {
    reasons.push("stock_session_closed");
  }

  return {
    safe,
    sessionKind,
    currentPrice,
    latestCandleAt,
    latestCandleNyDate,
    latestCandleAgeSeconds,
    quoteAgeSeconds,
    entryDistancePct,
    maxEntryDistancePct,
    reasons,
  };
}

function isFreshStockTelegramCandidate(alert: DeliverableAlert) {
  if (alert.asset_type !== "stock") return true;

  const guardEnabled =
    process.env.SIGNAL_STOCK_PRICE_FRESHNESS_GUARD_ENABLED !== "false";

  if (!guardEnabled) return true;

  const freshness = getStockFreshnessPayload(alert);

  if (!freshness.safe) {
    console.warn("Stock signal blocked by freshness guard", {
      symbol: (alert as any).symbol,
      alertKey: alert.alert_key,
      status: alert.status,
      sessionKind: freshness.sessionKind,
      currentPrice: freshness.currentPrice,
      latestCandleAt: freshness.latestCandleAt,
      latestCandleNyDate: freshness.latestCandleNyDate,
      latestCandleAgeSeconds: freshness.latestCandleAgeSeconds,
      quoteAgeSeconds: freshness.quoteAgeSeconds,
      entryDistancePct: freshness.entryDistancePct,
      maxEntryDistancePct: freshness.maxEntryDistancePct,
      reasons: freshness.reasons,
    });

    return false;
  }

  return true;
}

function getTelegramLogicalCooldownMinutes(alert: DeliverableAlert) {
  const specific =
    alert.asset_type === "stock"
      ? process.env.TELEGRAM_STOCK_LOGICAL_COOLDOWN_MINUTES
      : process.env.TELEGRAM_CRYPTO_LOGICAL_COOLDOWN_MINUTES;

  const raw =
    specific ||
    process.env.TELEGRAM_SIGNALS_LOGICAL_COOLDOWN_MINUTES ||
    "90";

  const minutes = Number(raw);

  return Number.isFinite(minutes) && minutes > 0 ? minutes : 90;
}

function getTelegramLogicalPrefix(alert: DeliverableAlert) {
  const parts = String(alert.alert_key || "").split(":");

  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0]}:${parts[1]}`;
  }

  const setup = String(alert.setup_slug || alert.setup_type || "unknown_setup")
    .trim()
    .toLowerCase();

  const symbol = String(alert.symbol || "")
    .trim()
    .toUpperCase();

  if (!symbol || setup === "unknown_setup") return null;

  return `${setup}:${symbol}`;
}

function getStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function isSkillEdgeEngineApprovedForTelegram(alert: DeliverableAlert) {
  const requireEngineApproval =
    process.env.TELEGRAM_REQUIRE_SKILLEDGE_ENGINE_APPROVAL !== "false";

  if (!requireEngineApproval) return true;

  const sourceData = getRecord(alert.source_data);
  const skillEdgeEngine = getRecord(sourceData.skillEdgeEngine);

  if (Object.keys(skillEdgeEngine).length === 0) {
    return true;
  }

  const shouldAlert = readExplicitBoolean(skillEdgeEngine.shouldAlert);
  const rejectionReasons = getStringList(skillEdgeEngine.rejectionReasons);
  const globalConfidence = readNumber(skillEdgeEngine.globalConfidence);
  const displayConfidence = readNumber(skillEdgeEngine.displayConfidence);

  if (shouldAlert === false) {
    console.warn("Telegram blocked by SkillEdge engine shouldAlert=false", {
      symbol: (alert as any).symbol,
      alertKey: alert.alert_key,
      assetType: alert.asset_type,
      status: alert.status,
      score: alert.score,
      globalConfidence,
      displayConfidence,
      rejectionReasons,
    });

    return false;
  }

  return true;
}

function isStrictTelegramDeliveryCandidate(alert: DeliverableAlert) {
  if (!shouldSendTelegramSignal(alert as any)) return false;
  if (alert.status === "watch") return false;
  if (
  alert.asset_type === "stock" &&
  String(process.env.SIGNAL_STOCK_LEGACY_TELEGRAM_ENABLED || "false")
    .trim()
    .toLowerCase() !== "true"
) {
  const sourceData = getRecord(alert.source_data);
  const engineVersion = String(
    sourceData.engineVersion ||
      sourceData.signalEngineVersion ||
      sourceData.source ||
      sourceData.provider ||
      ""
  ).toLowerCase();

  const isPersistentV2 =
    engineVersion.includes("holly_persistent_v2") ||
    engineVersion.includes("persistent_stock_engine_v2") ||
    engineVersion.includes("skill_edge_holly_persistent_v2");

  if (!isPersistentV2) return false;
}

  const sourceData = getRecord(alert.source_data);
  const aiValidation = getRecord(sourceData.aiValidation);
  const deliveryEligibility = getRecord(aiValidation.deliveryEligibility);
  const qualityV2 = getRecord(sourceData.qualityV2);

  const telegramEligible = readBoolean(qualityV2.telegramEligible);
  const aiDeliveryEligible = readBoolean(deliveryEligibility.eligible);

  const minScoreRaw =
    alert.asset_type === "stock"
      ? process.env.TELEGRAM_STOCK_MIN_SCORE || "78"
      : process.env.TELEGRAM_CRYPTO_MIN_SCORE || "76";

  const minScore = Number(minScoreRaw);
  const score = Number(alert.score || 0);

  if (Number.isFinite(minScore) && score < minScore) return false;

  if (!isSkillEdgeEngineApprovedForTelegram(alert)) return false;

  if (!isFreshStockTelegramCandidate(alert)) return false;

  return telegramEligible || aiDeliveryEligible;
}

export async function deliverSignalsToTelegram(alerts: DeliverableAlert[]) {
  if (process.env.TELEGRAM_SIGNALS_ENABLED !== "true") {
    return { sent: 0, skipped: alerts.length, errors: [] as string[] };
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const candidates = alerts.filter((alert) => isStrictTelegramDeliveryCandidate(alert));
  const adminChatId = process.env.TELEGRAM_SIGNALS_ADMIN_CHAT_ID;

  const { data: subscribers, error: subscribersError } = await supabaseAdmin
    .from("telegram_signal_subscriptions")
    .select("user_id, chat_id, min_status, asset_filter, is_enabled")
    .eq("is_enabled", true);

  if (subscribersError) {
    errors.push(`Failed to load telegram subscribers: ${subscribersError.message}`);
  }

  const targets = [
    ...(adminChatId
      ? [
          {
            user_id: null,
            chat_id: adminChatId,
            min_status: normalizeDeliveryMinStatus(
              process.env.TELEGRAM_SIGNALS_MIN_STATUS || "armed"
            ),
            asset_filter: "all" as const,
          },
        ]
      : []),
    ...((subscribers || []) as Array<{
      user_id: string | null;
      chat_id: string;
      min_status: string;
      asset_filter: "all" | "stock" | "crypto";
      is_enabled: boolean;
    }>).map((subscriber) => ({
      ...subscriber,
      min_status: normalizeDeliveryMinStatus(subscriber.min_status),
    })),
  ];

  for (const alert of candidates) {
    for (const target of targets) {
      if (target.asset_filter !== "all" && target.asset_filter !== alert.asset_type) {
        skipped += 1;
        continue;
      }

      if (!statusAllowed(alert.status, target.min_status || "armed")) {
        skipped += 1;
        continue;
      }

      const deliveryKey = {
        alert_key: alert.alert_key,
        channel: "telegram",
        target: String(target.chat_id),
      };

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("market_alert_deliveries")
        .select("id")
        .eq("alert_key", deliveryKey.alert_key)
        .eq("channel", deliveryKey.channel)
        .eq("target", deliveryKey.target)
        .maybeSingle();

      if (existingError) {
        errors.push(`Failed to check delivery state: ${existingError.message}`);
        skipped += 1;
        continue;
      }

      if (existing) {
        skipped += 1;
        continue;
      }

      const logicalPrefix = getTelegramLogicalPrefix(alert);
      const cooldownMinutes = getTelegramLogicalCooldownMinutes(alert);

      if (logicalPrefix) {
        const cooldownSince = new Date(
          Date.now() - cooldownMinutes * 60 * 1000
        ).toISOString();

        const { data: existingLogical, error: existingLogicalError } =
          await supabaseAdmin
            .from("market_alert_deliveries")
            .select("id, alert_key, created_at")
            .eq("channel", deliveryKey.channel)
            .eq("target", deliveryKey.target)
            .eq("status", "sent")
            .like("alert_key", `${logicalPrefix}:%`)
            .gte("created_at", cooldownSince)
            .limit(1)
            .maybeSingle();

        if (existingLogicalError) {
          errors.push(
            `Failed to check logical delivery cooldown: ${existingLogicalError.message}`,
          );
          skipped += 1;
          continue;
        }

        if (existingLogical) {
          skipped += 1;
          continue;
        }
      }

      const result = await sendTelegramSignalMessage({
        chatId: String(target.chat_id),
        alert: alert as any,
      });

      await supabaseAdmin.from("market_alert_deliveries").insert({
        ...deliveryKey,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
      });

      if (result.ok) {
        sent += 1;
      } else {
        errors.push(result.error || "Telegram send failed");
      }
    }
  }

  return { sent, skipped, errors };
}

export async function deliverLatestPersistedSignalsToTelegram(params: {
  assetType?: MarketAlertAssetTypeFilter;
  createdSince?: string | null;
  limit?: number;
}) {
  const feed = await loadMarketAlertFeed({
    assetType: params.assetType || "all",
    status: "tradable",
    period: "24h",
    createdSince: params.createdSince || null,
    limit: params.limit || 100,
    includeExpired: false,
  });

  const delivery = await deliverSignalsToTelegram(feed.items as DeliverableAlert[]);

  return {
    ...delivery,
    feedCount: feed.count,
    source: feed.source,
  };
}

