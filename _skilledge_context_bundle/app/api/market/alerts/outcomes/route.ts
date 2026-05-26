import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type MarketAlertRow = {
  id: string;
  user_id: string | null;
  symbol: string;
  asset_type: string | null;
  exchange: string | null;
  direction: string | null;
  setup_slug: string | null;
  setup_name: string | null;
  setup_type: string | null;
  title: string | null;
  entry_zone_min: number | string | null;
  entry_zone_max: number | string | null;
  stop_price: number | string | null;
  target_1: number | string | null;
  target_2: number | string | null;
  target_3: number | string | null;
  status: string | null;
  outcome_status: string | null;
  created_at: string;
  source_data: Record<string, unknown> | null;
};

type OutcomeAnalysis = {
  status:
    | "pending"
    | "no_entry"
    | "entry_touched"
    | "tp1_hit"
    | "tp2_hit"
    | "tp3_hit"
    | "stopped"
    | "failed"
    | "neutral";
  provider: "fmp" | "binance" | "none";
  interval: "5m";
  entryReference: number | null;
  entryTouchedAt: string | null;
  target1HitAt: string | null;
  target2HitAt: string | null;
  target3HitAt: string | null;
  stopHitAt: string | null;
  mfePercent: number | null;
  maePercent: number | null;
  mfePrice: number | null;
  maePrice: number | null;
  outcomeScore: number | null;
  timeToEntryMinutes: number | null;
  timeToTargetMinutes: number | null;
  candlesChecked: number;
  checkedUntil: string | null;
  notes: string;
  events: Array<{
    event_type:
      | "entry_touched"
      | "target_hit"
      | "stop_hit"
      | "mfe_updated"
      | "mae_updated"
      | "expired_no_entry"
      | "expired_neutral";
    event_level: string | null;
    event_price: number | null;
    event_time: string;
    candle: Candle | null;
    metadata?: Record<string, unknown>;
  }>;
};

const OUTCOME_INTERVAL = "5m" as const;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MAX_ALERTS = 60;
const DEFAULT_HORIZON_HOURS = 8;

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.OUTCOME_CRON_SECRET;

  if (!secret) return false;

  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-cron-secret") || "";
  const querySecret = url.searchParams.get("secret") || "";

  return (
    authHeader === `Bearer ${secret}` ||
    cronHeader === secret ||
    querySecret === secret
  );
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function round(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function roundPercent(value: number | null): number | null {
  return round(value, 2);
}

function getMinutesBetween(startIso: string, endIso: string | null) {
  if (!endIso) return null;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return Math.max(0, Math.round((end - start) / 60_000));
}

function normalizeStockSymbol(symbol: string) {
  return symbol.trim().toUpperCase().split(".")[0].replace(/[^A-Z0-9-]/g, "");
}

function normalizeCryptoSymbol(symbol: string) {
  const raw = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!raw) return "";
  if (raw.endsWith("USDT")) return raw;
  if (raw.endsWith("BUSD")) return `${raw.slice(0, -4)}USDT`;
  if (raw.endsWith("USD")) return `${raw.slice(0, -3)}USDT`;

  return `${raw}USDT`;
}

function isCryptoAlert(alert: MarketAlertRow) {
  const asset = String(alert.asset_type || "").toLowerCase();
  const exchange = String(alert.exchange || "").toLowerCase();
  const symbol = String(alert.symbol || "").toUpperCase();

  return (
    asset === "crypto" ||
    exchange.includes("binance") ||
    symbol.endsWith("USDT") ||
    symbol.endsWith("USD")
  );
}

function getDirection(alert: MarketAlertRow): "long" | "short" {
  const raw = String(alert.direction || "").toLowerCase();

  if (["downside", "short", "sell", "bearish"].includes(raw)) return "short";

  return "long";
}

function getMarketPriceFromSourceData(alert: MarketAlertRow) {
  const sourceData = alert.source_data || {};
  const market = sourceData.market as Record<string, unknown> | undefined;

  return toNumber(market?.price);
}

function getEntryBounds(alert: MarketAlertRow) {
  const entryMin = toNumber(alert.entry_zone_min);
  const entryMax = toNumber(alert.entry_zone_max);

  if (entryMin !== null && entryMax !== null) {
    return {
      min: Math.min(entryMin, entryMax),
      max: Math.max(entryMin, entryMax),
      reference: (entryMin + entryMax) / 2,
      hasZone: true,
    };
  }

  const singleEntry = entryMin ?? entryMax;

  if (singleEntry !== null) {
    return {
      min: singleEntry,
      max: singleEntry,
      reference: singleEntry,
      hasZone: true,
    };
  }

  const marketPrice = getMarketPriceFromSourceData(alert);

  return {
    min: marketPrice,
    max: marketPrice,
    reference: marketPrice,
    hasZone: false,
  };
}

function candleIntersectsZone(candle: Candle, min: number, max: number) {
  return candle.high >= min && candle.low <= max;
}

function didHitTarget(candle: Candle, target: number | null, direction: "long" | "short") {
  if (target === null) return false;
  return direction === "long" ? candle.high >= target : candle.low <= target;
}

function didHitStop(candle: Candle, stop: number | null, direction: "long" | "short") {
  if (stop === null) return false;
  return direction === "long" ? candle.low <= stop : candle.high >= stop;
}

function getFavorablePrice(candle: Candle, direction: "long" | "short") {
  return direction === "long" ? candle.high : candle.low;
}

function getAdversePrice(candle: Candle, direction: "long" | "short") {
  return direction === "long" ? candle.low : candle.high;
}

function getMovePercent(entry: number, price: number, direction: "long" | "short") {
  if (direction === "long") return ((price - entry) / entry) * 100;
  return ((entry - price) / entry) * 100;
}

async function fetchFmpCandles(symbol: string, startIso: string): Promise<Candle[]> {
  const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FMP_API_KEY in environment variables.");
  }

  const normalizedSymbol = normalizeStockSymbol(symbol);
  const url = new URL("https://financialmodelingprep.com/stable/historical-chart/5min");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [];
  const startTime = new Date(startIso).getTime();

  return rows
    .map((row): Candle | null => {
      const rawDate = row.date || row.datetime || row.time;
      const time = rawDate ? new Date(`${String(rawDate).replace(" ", "T")}Z`).toISOString() : null;

      if (!time) return null;

      const open = toNumber(row.open);
      const high = toNumber(row.high);
      const low = toNumber(row.low);
      const close = toNumber(row.close);

      if (open === null || high === null || low === null || close === null) return null;

      return {
        time,
        open,
        high,
        low,
        close,
        volume: toNumber(row.volume),
      };
    })
    .filter((candle): candle is Candle => {
      if (candle === null) return false;
      return new Date(candle.time).getTime() >= startTime;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

async function fetchBinanceCandles(symbol: string, startIso: string): Promise<Candle[]> {
  const normalizedSymbol = normalizeCryptoSymbol(symbol);
  const startTime = new Date(startIso).getTime();
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("interval", "5m");
  url.searchParams.set("startTime", String(startTime));
  url.searchParams.set("limit", "500");

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map((row): Candle | null => {
      if (!Array.isArray(row)) return null;

      const timeMs = Number(row[0]);
      const open = toNumber(row[1]);
      const high = toNumber(row[2]);
      const low = toNumber(row[3]);
      const close = toNumber(row[4]);
      const volume = toNumber(row[5]);

      if (
        !Number.isFinite(timeMs) ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      return {
        time: new Date(timeMs).toISOString(),
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter((candle): candle is Candle => Boolean(candle))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

async function fetchCandles(alert: MarketAlertRow): Promise<{
  provider: "fmp" | "binance";
  candles: Candle[];
}> {
  if (isCryptoAlert(alert)) {
    return {
      provider: "binance",
      candles: await fetchBinanceCandles(alert.symbol, alert.created_at),
    };
  }

  return {
    provider: "fmp",
    candles: await fetchFmpCandles(alert.symbol, alert.created_at),
  };
}

function analyzeOutcome(
  alert: MarketAlertRow,
  candles: Candle[],
  provider: "fmp" | "binance",
  horizonHours: number
): OutcomeAnalysis {
  const direction = getDirection(alert);
  const entry = getEntryBounds(alert);
  const stop = toNumber(alert.stop_price);
  const targets = [toNumber(alert.target_1), toNumber(alert.target_2), toNumber(alert.target_3)];
  const createdAt = alert.created_at;
  const nowIso = new Date().toISOString();
  const ageMinutes = getMinutesBetween(createdAt, nowIso) || 0;
  const horizonMinutes = horizonHours * 60;

  if (candles.length === 0) {
    return {
      status: "pending",
      provider,
      interval: OUTCOME_INTERVAL,
      entryReference: entry.reference && entry.reference > 0 ? round(entry.reference) : null,
      entryTouchedAt: null,
      target1HitAt: null,
      target2HitAt: null,
      target3HitAt: null,
      stopHitAt: null,
      mfePercent: null,
      maePercent: null,
      mfePrice: null,
      maePrice: null,
      outcomeScore: null,
      timeToEntryMinutes: null,
      timeToTargetMinutes: null,
      candlesChecked: 0,
      checkedUntil: null,
      notes:
        provider === "binance"
          ? "No Binance 5m candles available for this symbol yet. The alert remains pending."
          : "No FMP 5m candles available for this symbol yet. The alert remains pending.",
      events: [],
    };
  }

  if (!entry.reference || entry.reference <= 0) {
    return {
      status: ageMinutes >= horizonMinutes ? "neutral" : "pending",
      provider,
      interval: OUTCOME_INTERVAL,
      entryReference: null,
      entryTouchedAt: null,
      target1HitAt: null,
      target2HitAt: null,
      target3HitAt: null,
      stopHitAt: null,
      mfePercent: null,
      maePercent: null,
      mfePrice: null,
      maePrice: null,
      outcomeScore: null,
      timeToEntryMinutes: null,
      timeToTargetMinutes: null,
      candlesChecked: candles.length,
      checkedUntil: candles.at(-1)?.time || null,
      notes: "No valid entry reference. Outcome cannot be measured precisely yet.",
      events: [],
    };
  }

  let entryTouchedAt: string | null = null;
  let target1HitAt: string | null = null;
  let target2HitAt: string | null = null;
  let target3HitAt: string | null = null;
  let stopHitAt: string | null = null;
  let mfePercent: number | null = null;
  let maePercent: number | null = null;
  let mfePrice: number | null = null;
  let maePrice: number | null = null;
  const events: OutcomeAnalysis["events"] = [];

  for (const candle of candles) {
    const candleTime = candle.time;

    const entryTouched = entry.hasZone
      ? candleIntersectsZone(candle, Number(entry.min), Number(entry.max))
      : true;

    if (!entryTouchedAt && entryTouched) {
      entryTouchedAt = candleTime;
      events.push({
        event_type: "entry_touched",
        event_level: null,
        event_price: round(entry.reference),
        event_time: candleTime,
        candle,
        metadata: { conservative: true, interval: OUTCOME_INTERVAL },
      });
    }

    if (!entryTouchedAt) continue;

    const favorablePrice = getFavorablePrice(candle, direction);
    const adversePrice = getAdversePrice(candle, direction);
    const favorableMove = getMovePercent(entry.reference, favorablePrice, direction);
    const adverseMove = getMovePercent(entry.reference, adversePrice, direction);

    if (mfePercent === null || favorableMove > mfePercent) {
      mfePercent = favorableMove;
      mfePrice = favorablePrice;
    }

    if (maePercent === null || adverseMove < maePercent) {
      maePercent = adverseMove;
      maePrice = adversePrice;
    }

    const stopHitThisCandle = didHitStop(candle, stop, direction);
    const tp1HitThisCandle = didHitTarget(candle, targets[0], direction);
    const tp2HitThisCandle = didHitTarget(candle, targets[1], direction);
    const tp3HitThisCandle = didHitTarget(candle, targets[2], direction);

    // Conservative 5m logic: if stop and target are inside the same candle,
    // count the stop first because we do not have tick-level sequencing.
    if (!stopHitAt && stopHitThisCandle) {
      stopHitAt = candleTime;
      events.push({
        event_type: "stop_hit",
        event_level: "SL",
        event_price: stop,
        event_time: candleTime,
        candle,
        metadata: { conservative: true, sameCandleStopFirst: true },
      });

      if (tp1HitThisCandle || tp2HitThisCandle || tp3HitThisCandle) {
        continue;
      }
    }

    if (!target1HitAt && tp1HitThisCandle) {
      target1HitAt = candleTime;
      events.push({
        event_type: "target_hit",
        event_level: "TP1",
        event_price: targets[0],
        event_time: candleTime,
        candle,
      });
    }

    if (!target2HitAt && tp2HitThisCandle) {
      target2HitAt = candleTime;
      events.push({
        event_type: "target_hit",
        event_level: "TP2",
        event_price: targets[1],
        event_time: candleTime,
        candle,
      });
    }

    if (!target3HitAt && tp3HitThisCandle) {
      target3HitAt = candleTime;
      events.push({
        event_type: "target_hit",
        event_level: "TP3",
        event_price: targets[2],
        event_time: candleTime,
        candle,
      });
    }
  }

  const highestTarget = target3HitAt ? "tp3_hit" : target2HitAt ? "tp2_hit" : target1HitAt ? "tp1_hit" : null;
  const firstTargetAt = target1HitAt || target2HitAt || target3HitAt;

  let status: OutcomeAnalysis["status"] = "pending";
  let notes = "Outcome is still pending.";

  if (!entryTouchedAt && ageMinutes >= horizonMinutes) {
    status = "no_entry";
    notes = "Entry zone was not touched before the tracking horizon expired.";
    events.push({
      event_type: "expired_no_entry",
      event_level: null,
      event_price: null,
      event_time: nowIso,
      candle: null,
    });
  } else if (!entryTouchedAt) {
    status = "pending";
    notes = "Waiting for entry zone touch.";
  } else if (highestTarget) {
    status = highestTarget;
    notes = "At least one target was reached after entry touch.";
  } else if (stopHitAt) {
    status = "stopped";
    notes = "Stop was reached before any target on conservative 5m logic.";
  } else if (ageMinutes >= horizonMinutes) {
    status = "neutral";
    notes = "Entry was touched, but no target or stop was reached within the tracking horizon.";
    events.push({
      event_type: "expired_neutral",
      event_level: null,
      event_price: null,
      event_time: nowIso,
      candle: null,
    });
  } else {
    status = "entry_touched";
    notes = "Entry was touched. Waiting for target or stop resolution.";
  }

  const outcomeScore = (() => {
    if (status === "tp3_hit") return 100;
    if (status === "tp2_hit") return 85;
    if (status === "tp1_hit") return 70;
    if (status === "entry_touched") return 45;
    if (status === "neutral") return 35;
    if (status === "no_entry") return 20;
    if (status === "stopped") return 0;
    return null;
  })();

  return {
    status,
    provider,
    interval: OUTCOME_INTERVAL,
    entryReference: round(entry.reference),
    entryTouchedAt,
    target1HitAt,
    target2HitAt,
    target3HitAt,
    stopHitAt,
    mfePercent: roundPercent(mfePercent),
    maePercent: roundPercent(maePercent),
    mfePrice: round(mfePrice),
    maePrice: round(maePrice),
    outcomeScore,
    timeToEntryMinutes: getMinutesBetween(createdAt, entryTouchedAt),
    timeToTargetMinutes: getMinutesBetween(createdAt, firstTargetAt),
    candlesChecked: candles.length,
    checkedUntil: candles.at(-1)?.time || null,
    notes,
    events,
  };
}

async function loadPendingAlerts({
  userId,
  limit,
  lookbackHours,
  onlyAlertId,
}: {
  userId: string | null;
  limit: number;
  lookbackHours: number;
  onlyAlertId: string | null;
}) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("market_alerts")
    .select(
      "id,user_id,symbol,asset_type,exchange,direction,setup_slug,setup_name,setup_type,title,entry_zone_min,entry_zone_max,stop_price,target_1,target_2,target_3,status,outcome_status,created_at,source_data"
    )
    .gte("created_at", since)
    .in("outcome_status", ["pending", "entry_touched"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  }

  if (onlyAlertId) {
    query = query.eq("id", onlyAlertId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []) as MarketAlertRow[];
}

async function upsertSignalOutcome(alert: MarketAlertRow, analysis: OutcomeAnalysis) {
  const entry = getEntryBounds(alert);
  const userId = alert.user_id || null;

  const basePayload = {
    alert_id: alert.id,
    user_id: userId,
    symbol: alert.symbol,
    asset_type: alert.asset_type,
    exchange: alert.exchange,
    direction: getDirection(alert),
    setup_slug: alert.setup_slug,
    setup_name: alert.setup_name || alert.setup_type || alert.title,
    signal_created_at: alert.created_at,
    interval: analysis.interval,
    provider: analysis.provider,
    entry_zone_min: entry.min,
    entry_zone_max: entry.max,
    entry_reference: analysis.entryReference,
    stop_price: toNumber(alert.stop_price),
    target_1: toNumber(alert.target_1),
    target_2: toNumber(alert.target_2),
    target_3: toNumber(alert.target_3),
    status: analysis.status,
    entry_touched_at: analysis.entryTouchedAt,
    target_1_hit_at: analysis.target1HitAt,
    target_2_hit_at: analysis.target2HitAt,
    target_3_hit_at: analysis.target3HitAt,
    stop_hit_at: analysis.stopHitAt,
    mfe_percent: analysis.mfePercent,
    mae_percent: analysis.maePercent,
    mfe_price: analysis.mfePrice,
    mae_price: analysis.maePrice,
    outcome_score: analysis.outcomeScore,
    time_to_entry_minutes: analysis.timeToEntryMinutes,
    time_to_target_minutes: analysis.timeToTargetMinutes,
    candles_checked: analysis.candlesChecked,
    checked_until: analysis.checkedUntil,
    last_checked_at: new Date().toISOString(),
    notes: analysis.notes,
    updated_at: new Date().toISOString(),
  };

  const existingQuery = supabaseAdmin
    .from("signal_outcomes")
    .select("id")
    .eq("alert_id", alert.id)
    .limit(1);

  const { data: existingRows, error: existingError } = userId
    ? await existingQuery.eq("user_id", userId)
    : await existingQuery.is("user_id", null);

  if (existingError) throw existingError;

  const existingId = existingRows?.[0]?.id as string | undefined;

  if (existingId) {
    const { data, error } = await supabaseAdmin
      .from("signal_outcomes")
      .update(basePayload)
      .eq("id", existingId)
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from("signal_outcomes")
    .insert(basePayload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function upsertOutcomeEvents(
  outcomeId: string,
  alert: MarketAlertRow,
  events: OutcomeAnalysis["events"]
) {
  if (events.length === 0) return 0;

  const payload = events.map((event) => ({
    outcome_id: outcomeId,
    alert_id: alert.id,
    user_id: alert.user_id || null,
    event_type: event.event_type,
    event_level: event.event_level || "_none",
    event_price: event.event_price,
    event_time: event.event_time,
    candle_time: event.candle?.time || null,
    candle_open: event.candle?.open || null,
    candle_high: event.candle?.high || null,
    candle_low: event.candle?.low || null,
    candle_close: event.candle?.close || null,
    metadata: event.metadata || {},
  }));

  const { error } = await supabaseAdmin
    .from("signal_outcome_events")
    .upsert(payload, { onConflict: "outcome_id,event_type,event_level" });

  if (error) throw error;
  return payload.length;
}

async function updateMarketAlertOutcome(alert: MarketAlertRow, analysis: OutcomeAnalysis) {
  const hitTarget = analysis.target3HitAt
    ? "TP3"
    : analysis.target2HitAt
      ? "TP2"
      : analysis.target1HitAt
        ? "TP1"
        : null;

  const isResolved = ["tp1_hit", "tp2_hit", "tp3_hit", "stopped", "failed", "neutral", "no_entry"].includes(
    analysis.status
  );

  const { error } = await supabaseAdmin
    .from("market_alerts")
    .update({
      outcome_status: analysis.status,
      outcome_checked_at: new Date().toISOString(),
      mfe: analysis.mfePercent,
      mae: analysis.maePercent,
      hit_target: hitTarget,
      hit_stop: Boolean(analysis.stopHitAt),
      time_to_entry_minutes: analysis.timeToEntryMinutes,
      time_to_target_minutes: analysis.timeToTargetMinutes,
      outcome_provider: analysis.provider,
      outcome_interval: analysis.interval,
      status: isResolved ? "expired" : alert.status,
    })
    .eq("id", alert.id);

  if (error) throw error;
}

async function runOutcomeCheck({
  userId,
  limit,
  lookbackHours,
  horizonHours,
  onlyAlertId,
  source,
}: {
  userId: string | null;
  limit: number;
  lookbackHours: number;
  horizonHours: number;
  onlyAlertId: string | null;
  source: string;
}) {
  const checkedAt = new Date().toISOString();

  const alerts = await loadPendingAlerts({
    userId,
    limit,
    lookbackHours,
    onlyAlertId,
  });

  const checkedCount = alerts.length;

  if (checkedCount === 0) {
    return NextResponse.json({
      source,
      checkedAt,
      interval: OUTCOME_INTERVAL,
      checked: 0,
      updated: 0,
      events: 0,
      items: [],
    });
  }

  const items: Array<Record<string, unknown>> = [];
  let eventsWritten = 0;

  for (const alert of alerts) {
    try {
      const { provider, candles } = await fetchCandles(alert);
      const analysis = analyzeOutcome(alert, candles, provider, horizonHours);
      const outcomeId = await upsertSignalOutcome(alert, analysis);
      eventsWritten += await upsertOutcomeEvents(outcomeId, alert, analysis.events);
      await updateMarketAlertOutcome(alert, analysis);

      items.push({
        alert_id: alert.id,
        symbol: alert.symbol,
        provider,
        interval: OUTCOME_INTERVAL,
        status: analysis.status,
        candles_checked: analysis.candlesChecked,
        mfe_percent: analysis.mfePercent,
        mae_percent: analysis.maePercent,
        hit_target: analysis.target3HitAt
          ? "TP3"
          : analysis.target2HitAt
            ? "TP2"
            : analysis.target1HitAt
              ? "TP1"
              : null,
        hit_stop: Boolean(analysis.stopHitAt),
        time_to_entry_minutes: analysis.timeToEntryMinutes,
        time_to_target_minutes: analysis.timeToTargetMinutes,
        notes: analysis.notes,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Outcome tracking failed.";

      items.push({
        alert_id: alert.id,
        symbol: alert.symbol,
        status: "provider_unavailable",
        provider: isCryptoAlert(alert) ? "binance" : "fmp",
        error: errorMessage,
        notes: "Outcome check skipped because candles are temporarily unavailable.",
      });
    }
  }

  const updated = items.filter(
    (item) => item.status !== "error" && item.status !== "provider_unavailable"
  ).length;

  return NextResponse.json({
    source,
    checkedAt,
    interval: OUTCOME_INTERVAL,
    checked: checkedCount,
    updated,
    events: eventsWritten,
    items,
  });
}

export async function POST(request: Request) {
  const cronMode = isAuthorizedCronRequest(request);

  let gate:
    | Awaited<ReturnType<typeof requireFeatureAccess>>
    | null = null;

  if (!cronMode) {
    gate = await requireFeatureAccess(request, "ai_alerts", {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
      },
    });

    if (!gate.ok) return gate.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit || DEFAULT_MAX_ALERTS), 100);
    const lookbackHours = Math.min(Number(body.lookbackHours || DEFAULT_LOOKBACK_HOURS), 72);
    const horizonHours = Math.min(Number(body.horizonHours || DEFAULT_HORIZON_HOURS), 24);
    const onlyAlertId = typeof body.alertId === "string" ? body.alertId : null;

    const userId = cronMode ? null : gate?.auth.user.id || null;

    if (!cronMode && !userId) {
      return jsonError("Unauthorized.", 401);
    }

    return await runOutcomeCheck({
      userId,
      limit,
      lookbackHours,
      horizonHours,
      onlyAlertId,
      source: cronMode
        ? "skillEdge_cron_outcome_tracking_5m"
        : "skillEdge_real_outcome_tracking_5m",
    });
  } catch (error) {
    console.error("Real outcome tracking error:", error);
    return jsonError("Failed to check signal outcomes.");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (isAuthorizedCronRequest(request)) {
    const limit = Math.min(Number(url.searchParams.get("limit") || DEFAULT_MAX_ALERTS), 100);
    const lookbackHours = Math.min(
      Number(url.searchParams.get("lookbackHours") || DEFAULT_LOOKBACK_HOURS),
      72
    );
    const horizonHours = Math.min(
      Number(url.searchParams.get("horizonHours") || DEFAULT_HORIZON_HOURS),
      24
    );
    const onlyAlertId = url.searchParams.get("alertId");

    try {
      return await runOutcomeCheck({
        userId: null,
        limit,
        lookbackHours,
        horizonHours,
        onlyAlertId,
        source: "skillEdge_cron_outcome_tracking_5m",
      });
    } catch (error) {
      console.error("Cron outcome tracking error:", error);
      return jsonError("Failed to check signal outcomes.");
    }
  }

  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 60,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;

  try {
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const alertId = url.searchParams.get("alertId");

    let query = supabaseAdmin
      .from("signal_outcomes")
      .select("*, signal_outcome_events(*)")
      .or(`user_id.is.null,user_id.eq.${gate.auth.user.id}`)
      .order("signal_created_at", { ascending: false })
      .limit(limit);

    if (alertId) {
      query = query.eq("alert_id", alertId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_signal_outcomes",
      items: data || [],
    });
  } catch (error) {
    console.error("Load signal outcomes error:", error);
    return jsonError("Failed to load signal outcomes.");
  }
}



