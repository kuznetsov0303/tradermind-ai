import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchSkillEdgeCandles } from "@/lib/trading/market-candles-provider";

type OutcomeStatus =
  | "pending"
  | "entry_touched"
  | "tp1_hit"
  | "tp2_hit"
  | "tp3_hit"
  | "stopped"
  | "expired"
  | "neutral";

type OutcomeRow = {
  id: string;
  alert_id: string;
  alert_key: string;
  symbol: string;
  asset_type: string;
  setup_slug: string | null;
  direction: string | null;
  signal_status: string | null;
  signal_created_at: string | null;
  delivered_at: string | null;
  entry_zone_min: number | null;
  entry_zone_max: number | null;
  stop_price: number | null;
  target_1: number | null;
  target_2: number | null;
  target_3: number | null;
  planned_rr: number | null;
  outcome_status: OutcomeStatus;
  entry_touched_at: string | null;
  source_data: Record<string, unknown> | null;
};

type ResolverCandle = {
  timestamp: string | number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type ResolveParams = {
  assetType?: "stock" | "crypto" | "all";
  limit?: number;
  dryRun?: boolean;
  maxAgeHours?: number;
};

type ResolveDecision = {
  status: OutcomeStatus;
  reason: string;
  entryTouchedAt: string | null;
  tp1HitAt: string | null;
  tp2HitAt: string | null;
  tp3HitAt: string | null;
  stopHitAt: string | null;
  expiredAt: string | null;
  resolvedAt: string | null;
  mfePrice: number | null;
  maePrice: number | null;
  mfeR: number | null;
  maeR: number | null;
  resultR: number | null;
  candlesChecked: number;
  provider: string | null;
  providerError: string | null;
};

function toNumber(value: unknown, fallback: number | null = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));

    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getCandleTimeMs(candle: ResolverCandle) {
  if (candle.timestamp instanceof Date) return candle.timestamp.getTime();
  if (typeof candle.timestamp === "number") return candle.timestamp;

  const parsed = new Date(candle.timestamp).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCandles(candles: unknown[]): ResolverCandle[] {
  return candles
    .filter((item): item is ResolverCandle => {
      const candle = item as Partial<ResolverCandle>;

      return (
        Boolean(candle) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        Number(candle.high) >= Number(candle.low)
      );
    })
    .sort((a, b) => getCandleTimeMs(a) - getCandleTimeMs(b));
}

function getNthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;

  return 1 + offset + (nth - 1) * 7;
}

function isUsEasternDstDate(year: number, month: number, day: number) {
  const monthIndex = month - 1;

  if (monthIndex < 2 || monthIndex > 10) return false;
  if (monthIndex > 2 && monthIndex < 10) return true;

  const secondSundayMarch = getNthWeekdayOfMonth(year, 2, 0, 2);
  const firstSundayNovember = getNthWeekdayOfMonth(year, 10, 0, 1);

  if (monthIndex === 2) return day >= secondSundayMarch;
  if (monthIndex === 10) return day < firstSundayNovember;

  return false;
}

function parseFmpEasternTimestampToUtc(value: unknown) {
  if (typeof value !== "string") return null;

  const text = value.trim();

  if (!text || /[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)) {
    return null;
  }

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  const easternOffsetHours = isUsEasternDstDate(year, month, day) ? 4 : 5;

  return Date.UTC(year, month - 1, day, hour + easternOffsetHours, minute, second);
}

function isLikelyFmpProvider(provider: string | null | undefined) {
  return String(provider || "").toLowerCase().includes("fmp");
}

function normalizeProviderCandleTimestamps(params: {
  candles: ResolverCandle[];
  assetType: "stock" | "crypto";
  provider: string | null;
}) {
  if (params.assetType !== "stock" || !isLikelyFmpProvider(params.provider)) {
    return params.candles;
  }

  return params.candles.map((candle) => {
    const convertedMs = parseFmpEasternTimestampToUtc(candle.timestamp);

    if (convertedMs === null) return candle;

    return {
      ...candle,
      timestamp: new Date(convertedMs).toISOString(),
    };
  });
}

function normalizeAssetType(value: string | null | undefined): "stock" | "crypto" {
  return value === "crypto" ? "crypto" : "stock";
}

function normalizeDirection(value: string | null | undefined): "upside" | "downside" {
  return value === "upside" ? "upside" : "downside";
}

function getOutcomeInterval(assetType: "stock" | "crypto") {
  if (assetType === "crypto") {
    return process.env.SIGNAL_OUTCOME_CRYPTO_INTERVAL || "5m";
  }

  return process.env.SIGNAL_OUTCOME_STOCK_INTERVAL || "1m";
}

function getOutcomeFallbackIntervals(assetType: "stock" | "crypto") {
  const primary = getOutcomeInterval(assetType);

  const fallbackRaw =
    assetType === "crypto"
      ? process.env.SIGNAL_OUTCOME_CRYPTO_FALLBACK_INTERVALS || "5m,15m"
      : process.env.SIGNAL_OUTCOME_STOCK_FALLBACK_INTERVALS || "1m,5m,15m";

  const intervals = fallbackRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([primary, ...intervals]));
}

async function fetchOutcomeCandlesWithFallback(params: {
  symbol: string;
  assetType: "stock" | "crypto";
  limit: number;
}) {
  const intervals = getOutcomeFallbackIntervals(params.assetType);
  const attempts: string[] = [];

  for (const interval of intervals) {
    const result = await fetchSkillEdgeCandles({
      symbol: params.symbol,
      assetType: params.assetType,
      interval: interval as any,
      limit: params.limit,
    });

    const rawCandles = normalizeCandles((result.candles || []) as unknown[]);
    const candles = normalizeProviderCandleTimestamps({
      candles: rawCandles,
      assetType: params.assetType,
      provider: result.provider || null,
    });

    attempts.push(
      `${interval}:${result.provider}:${candles.length}:${result.error || "ok"}`
    );

    if (candles.length > 0) {
      return {
        candles,
        provider: result.provider || null,
        providerError: result.error || null,
        interval: result.interval || interval,
        attempts,
      };
    }
  }

  return {
    candles: [],
    provider: "none",
    providerError: attempts.join(" | "),
    interval: null,
    attempts,
  };
}

function getOutcomeCandleLimit(assetType: "stock" | "crypto") {
  const raw =
    assetType === "crypto"
      ? process.env.SIGNAL_OUTCOME_CRYPTO_CANDLE_LIMIT || "500"
      : process.env.SIGNAL_OUTCOME_STOCK_CANDLE_LIMIT || "500";

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 500;
}

function getOutcomeExpireHours(assetType: "stock" | "crypto", override?: number) {
  if (override && Number.isFinite(override) && override > 0) return override;

  const raw =
    assetType === "crypto"
      ? process.env.SIGNAL_OUTCOME_CRYPTO_EXPIRE_HOURS || "12"
      : process.env.SIGNAL_OUTCOME_STOCK_EXPIRE_HOURS || "8";

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : assetType === "crypto" ? 12 : 8;
}

function isEntryTouched(candle: ResolverCandle, entryMin: number, entryMax: number) {
  const min = Math.min(entryMin, entryMax);
  const max = Math.max(entryMin, entryMax);

  return candle.high >= min && candle.low <= max;
}

function getEntryReference(entryMin: number, entryMax: number) {
  return (entryMin + entryMax) / 2;
}

function getRiskPerUnit(params: {
  direction: "upside" | "downside";
  entryRef: number;
  stop: number;
}) {
  const risk =
    params.direction === "upside"
      ? params.entryRef - params.stop
      : params.stop - params.entryRef;

  return risk > 0 ? risk : null;
}

function isTargetHit(params: {
  candle: ResolverCandle;
  direction: "upside" | "downside";
  target: number | null;
}) {
  if (params.target === null) return false;

  return params.direction === "upside"
    ? params.candle.high >= params.target
    : params.candle.low <= params.target;
}

function isStopHit(params: {
  candle: ResolverCandle;
  direction: "upside" | "downside";
  stop: number;
}) {
  return params.direction === "upside"
    ? params.candle.low <= params.stop
    : params.candle.high >= params.stop;
}

function targetR(params: {
  direction: "upside" | "downside";
  entryRef: number;
  riskPerUnit: number;
  target: number | null;
}) {
  if (params.target === null || params.riskPerUnit <= 0) return null;

  const reward =
    params.direction === "upside"
      ? params.target - params.entryRef
      : params.entryRef - params.target;

  return reward > 0 ? reward / params.riskPerUnit : null;
}

function calculateMfeMae(params: {
  candles: ResolverCandle[];
  direction: "upside" | "downside";
  entryRef: number;
  riskPerUnit: number;
}) {
  if (params.candles.length === 0) {
    return {
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
    };
  }

  if (params.direction === "upside") {
    const mfePrice = Math.max(...params.candles.map((candle) => candle.high));
    const maePrice = Math.min(...params.candles.map((candle) => candle.low));

    return {
      mfePrice,
      maePrice,
      mfeR: (mfePrice - params.entryRef) / params.riskPerUnit,
      maeR: (params.entryRef - maePrice) / params.riskPerUnit,
    };
  }

  const mfePrice = Math.min(...params.candles.map((candle) => candle.low));
  const maePrice = Math.max(...params.candles.map((candle) => candle.high));

  return {
    mfePrice,
    maePrice,
    mfeR: (params.entryRef - mfePrice) / params.riskPerUnit,
    maeR: (maePrice - params.entryRef) / params.riskPerUnit,
  };
}

function makeDecision(params: {
  outcome: OutcomeRow;
  candles: ResolverCandle[];
  provider: string | null;
  providerError: string | null;
  maxAgeHours: number;
}): ResolveDecision {
  const assetType = normalizeAssetType(params.outcome.asset_type);
  const direction = normalizeDirection(params.outcome.direction);
  const entryMin = toNumber(params.outcome.entry_zone_min);
  const entryMax = toNumber(params.outcome.entry_zone_max);
  const stop = toNumber(params.outcome.stop_price);
  const target1 = toNumber(params.outcome.target_1);
  const target2 = toNumber(params.outcome.target_2);
  const target3 = toNumber(params.outcome.target_3);

  const baseTime =
    params.outcome.delivered_at ||
    params.outcome.signal_created_at ||
    new Date().toISOString();

  const baseMs = new Date(baseTime).getTime();
  const nowMs = Date.now();
  const expireMs = baseMs + params.maxAgeHours * 60 * 60 * 1000;

  if (
    entryMin === null ||
    entryMax === null ||
    stop === null ||
    target1 === null ||
    !Number.isFinite(baseMs)
  ) {
    return {
      status: "neutral",
      reason: "Outcome resolver skipped: signal plan is incomplete.",
      entryTouchedAt: params.outcome.entry_touched_at,
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      stopHitAt: null,
      expiredAt: null,
      resolvedAt: new Date().toISOString(),
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      resultR: 0,
      candlesChecked: params.candles.length,
      provider: params.provider,
      providerError: params.providerError,
    };
  }

  const entryRef = getEntryReference(entryMin, entryMax);
  const riskPerUnit = getRiskPerUnit({ direction, entryRef, stop });

  if (riskPerUnit === null) {
    return {
      status: "neutral",
      reason: "Outcome resolver skipped: invalid entry/stop risk structure.",
      entryTouchedAt: params.outcome.entry_touched_at,
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      stopHitAt: null,
      expiredAt: null,
      resolvedAt: new Date().toISOString(),
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      resultR: 0,
      candlesChecked: params.candles.length,
      provider: params.provider,
      providerError: params.providerError,
    };
  }

  const candlesAfterSignal = params.candles.filter(
    (candle) => getCandleTimeMs(candle) >= baseMs
  );

  if (candlesAfterSignal.length === 0) {
    return {
      status: "pending",
      reason:
        params.providerError
          ? `No candles after signal timestamp yet after provider timezone normalization. Provider note: ${params.providerError}`
          : "No candles after signal timestamp yet after provider timezone normalization.",
      entryTouchedAt: params.outcome.entry_touched_at,
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      stopHitAt: null,
      expiredAt: null,
      resolvedAt: null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      resultR: null,
      candlesChecked: 0,
      provider: params.provider,
      providerError: params.providerError,
    };
  }

  let entryTouchedAt = params.outcome.entry_touched_at;

  if (!entryTouchedAt) {
    const entryCandle = candlesAfterSignal.find((candle) =>
      isEntryTouched(candle, entryMin, entryMax)
    );

    entryTouchedAt = entryCandle
      ? new Date(getCandleTimeMs(entryCandle)).toISOString()
      : null;
  }

  if (!entryTouchedAt) {
    const isExpired = nowMs >= expireMs;

    return {
      status: isExpired ? "expired" : "pending",
      reason: isExpired
        ? "Entry zone was not touched before expiry window."
        : "Waiting for price to touch entry zone.",
      entryTouchedAt: null,
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      stopHitAt: null,
      expiredAt: isExpired ? new Date(expireMs).toISOString() : null,
      resolvedAt: isExpired ? new Date().toISOString() : null,
      mfePrice: null,
      maePrice: null,
      mfeR: null,
      maeR: null,
      resultR: isExpired ? 0 : null,
      candlesChecked: candlesAfterSignal.length,
      provider: params.provider,
      providerError: params.providerError,
    };
  }

  const entryTouchedMs = new Date(entryTouchedAt).getTime();
  const candlesAfterEntry = candlesAfterSignal.filter(
    (candle) => getCandleTimeMs(candle) >= entryTouchedMs
  );

  const mfeMae = calculateMfeMae({
    candles: candlesAfterEntry,
    direction,
    entryRef,
    riskPerUnit,
  });

  for (const candle of candlesAfterEntry) {
    const candleTime = new Date(getCandleTimeMs(candle)).toISOString();
    const stopHit = isStopHit({ candle, direction, stop });
    const tp1Hit = isTargetHit({ candle, direction, target: target1 });
    const tp2Hit = isTargetHit({ candle, direction, target: target2 });
    const tp3Hit = isTargetHit({ candle, direction, target: target3 });
    const anyTargetHit = tp1Hit || tp2Hit || tp3Hit;

    if (stopHit && anyTargetHit) {
      return {
        status: "neutral",
        reason: "Stop and target were touched inside the same candle; outcome is ambiguous.",
        entryTouchedAt,
        tp1HitAt: tp1Hit ? candleTime : null,
        tp2HitAt: tp2Hit ? candleTime : null,
        tp3HitAt: tp3Hit ? candleTime : null,
        stopHitAt: candleTime,
        expiredAt: null,
        resolvedAt: new Date().toISOString(),
        ...mfeMae,
        resultR: 0,
        candlesChecked: candlesAfterSignal.length,
        provider: params.provider,
        providerError: params.providerError,
      };
    }

    if (stopHit) {
      return {
        status: "stopped",
        reason: "Stop/invalidation was hit before TP1.",
        entryTouchedAt,
        tp1HitAt: null,
        tp2HitAt: null,
        tp3HitAt: null,
        stopHitAt: candleTime,
        expiredAt: null,
        resolvedAt: new Date().toISOString(),
        ...mfeMae,
        resultR: -1,
        candlesChecked: candlesAfterSignal.length,
        provider: params.provider,
        providerError: params.providerError,
      };
    }

    if (tp3Hit) {
      return {
        status: "tp3_hit",
        reason: "TP3 was hit before stop.",
        entryTouchedAt,
        tp1HitAt: candleTime,
        tp2HitAt: candleTime,
        tp3HitAt: candleTime,
        stopHitAt: null,
        expiredAt: null,
        resolvedAt: new Date().toISOString(),
        ...mfeMae,
        resultR:
          targetR({ direction, entryRef, riskPerUnit, target: target3 }) ||
          targetR({ direction, entryRef, riskPerUnit, target: target2 }) ||
          targetR({ direction, entryRef, riskPerUnit, target: target1 }) ||
          params.outcome.planned_rr ||
          null,
        candlesChecked: candlesAfterSignal.length,
        provider: params.provider,
        providerError: params.providerError,
      };
    }

    if (tp2Hit) {
      return {
        status: "tp2_hit",
        reason: "TP2 was hit before stop.",
        entryTouchedAt,
        tp1HitAt: candleTime,
        tp2HitAt: candleTime,
        tp3HitAt: null,
        stopHitAt: null,
        expiredAt: null,
        resolvedAt: new Date().toISOString(),
        ...mfeMae,
        resultR:
          targetR({ direction, entryRef, riskPerUnit, target: target2 }) ||
          targetR({ direction, entryRef, riskPerUnit, target: target1 }) ||
          params.outcome.planned_rr ||
          null,
        candlesChecked: candlesAfterSignal.length,
        provider: params.provider,
        providerError: params.providerError,
      };
    }

    if (tp1Hit) {
      return {
        status: "tp1_hit",
        reason: "TP1 was hit before stop.",
        entryTouchedAt,
        tp1HitAt: candleTime,
        tp2HitAt: null,
        tp3HitAt: null,
        stopHitAt: null,
        expiredAt: null,
        resolvedAt: new Date().toISOString(),
        ...mfeMae,
        resultR:
          targetR({ direction, entryRef, riskPerUnit, target: target1 }) ||
          params.outcome.planned_rr ||
          null,
        candlesChecked: candlesAfterSignal.length,
        provider: params.provider,
        providerError: params.providerError,
      };
    }
  }

  return {
    status: "entry_touched",
    reason: "Entry was touched. Waiting for TP or stop resolution.",
    entryTouchedAt,
    tp1HitAt: null,
    tp2HitAt: null,
    tp3HitAt: null,
    stopHitAt: null,
    expiredAt: null,
    resolvedAt: null,
    ...mfeMae,
    resultR: null,
    candlesChecked: candlesAfterSignal.length,
    provider: params.provider,
    providerError: params.providerError,
  };
}

function buildUpdatedSourceData(
  sourceData: Record<string, unknown> | null,
  decision: ResolveDecision
) {
  return {
    ...getRecord(sourceData),
    outcomeResolver: {
      version: "3B-4J-B",
      checkedAt: new Date().toISOString(),
      provider: decision.provider,
      providerError: decision.providerError,
      candlesChecked: decision.candlesChecked,
      reason: decision.reason,
      status: decision.status,
      resultR: decision.resultR,
      mfeR: decision.mfeR,
      maeR: decision.maeR,
    },
  };
}

export async function resolvePendingMarketAlertOutcomes(params: ResolveParams = {}) {
  const assetType = params.assetType || "all";
  const limit = Math.max(1, Math.min(200, Math.round(params.limit || 50)));
  const dryRun = params.dryRun === true;

  let query = supabaseAdmin
    .from("market_alert_outcomes")
    .select("*")
    .in("outcome_status", ["pending", "entry_touched"])
    .order("delivered_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (assetType !== "all") {
    query = query.eq("asset_type", assetType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load pending outcomes: ${error.message}`);
  }

  const rows = (data || []) as OutcomeRow[];
  const resolved: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  for (const outcome of rows) {
    try {
      const normalizedAssetType = normalizeAssetType(outcome.asset_type);
      const maxAgeHours = getOutcomeExpireHours(normalizedAssetType, params.maxAgeHours);

      const candlesResult = await fetchOutcomeCandlesWithFallback({
        symbol: outcome.symbol,
        assetType: normalizedAssetType,
        limit: getOutcomeCandleLimit(normalizedAssetType),
      });

      const decision = makeDecision({
        outcome,
        candles: candlesResult.candles,
        provider: candlesResult.provider || null,
        providerError: candlesResult.providerError || null,
        maxAgeHours,
      });

      const payload = {
        outcome_status: decision.status,
        outcome_reason: decision.reason,
        entry_touched_at: decision.entryTouchedAt,
        tp1_hit_at: decision.tp1HitAt,
        tp2_hit_at: decision.tp2HitAt,
        tp3_hit_at: decision.tp3HitAt,
        stop_hit_at: decision.stopHitAt,
        expired_at: decision.expiredAt,
        resolved_at: decision.resolvedAt,
        mfe_price: decision.mfePrice,
        mae_price: decision.maePrice,
        mfe_r: decision.mfeR,
        mae_r: decision.maeR,
        result_r: decision.resultR,
        candles_checked: decision.candlesChecked,
        source_data: buildUpdatedSourceData(outcome.source_data, decision),
        updated_at: new Date().toISOString(),
      };

      if (!dryRun) {
        const { error: updateError } = await supabaseAdmin
          .from("market_alert_outcomes")
          .update(payload)
          .eq("id", outcome.id);

        if (updateError) {
          errors.push({
            id: outcome.id,
            symbol: outcome.symbol,
            error: updateError.message,
          });
          continue;
        }
      }

      if (decision.status === "pending" || decision.status === "entry_touched") {
        skipped.push({
          id: outcome.id,
          symbol: outcome.symbol,
          status: decision.status,
          reason: decision.reason,
          candlesChecked: decision.candlesChecked,
          provider: decision.provider,
          providerError: decision.providerError,
        });
      } else {
        resolved.push({
          id: outcome.id,
          symbol: outcome.symbol,
          status: decision.status,
          resultR: decision.resultR,
          reason: decision.reason,
          candlesChecked: decision.candlesChecked,
          provider: decision.provider,
          providerError: decision.providerError,
        });
      }
    } catch (error) {
      errors.push({
        id: outcome.id,
        symbol: outcome.symbol,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    source: "market_alert_outcome_resolver",
    version: "3B-4J-B",
    dryRun,
    assetType,
    checked: rows.length,
    resolvedCount: resolved.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    resolved,
    skipped,
    errors,
    scannedAt: new Date().toISOString(),
  };
}