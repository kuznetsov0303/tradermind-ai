"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";

type Language = "en" | "ru" | "ua";
type AnyRecord = Record<string, any>;

type CockpitWatchItem = {
  symbol?: string;
  name?: string | null;
  exchange?: string | null;
  status?: string | null;
  engineStatus?: string | null;
  price?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  marketCap?: number | null;
  universe?: string | null;
  sourceBucket?: string | null;
  inPlayScore?: number | null;
  rankReasons?: string[] | null;
  lifecycleStatus?: string | null;
  entryStatus?: string | null;
  currentR?: number | null;
  currentPriceSource?: string | null;
  currentPriceUpdatedAt?: string | null;
  priceUpdatedAt?: string | null;
  priceAgeSeconds?: number | null;
  priceFreshness?: string | null;
  priceFreshnessReason?: string | null;
  stalePriceBlocked?: boolean | null;
  managementState?: string | null;
  tradeAction?: string | null;
  managementReasons?: string[] | null;
  strictEligible?: boolean | null;
  strictBlockedReasons?: string[] | null;
  lateSessionBlocked?: boolean | null;
  lateSessionReason?: string | null;
  marketClosedNewEntryBlocked?: boolean | null;
  minutesToCloseNow?: number | null;
  minutesToCloseAtSignal?: number | null;
  isActionable?: boolean | null;
  updatedAt?: string | null;
};

type CockpitSignal = {
  signalId?: string;
  symbol?: string;
  setupSlug?: string | null;
  setupName?: string | null;
  direction?: string | null;
  status?: string | null;
  engineStatus?: string | null;
  qualityStatus?: string | null;
  grade?: string | null;
  score?: number | null;
  premiumSignal?: boolean | null;
  telegramEligible?: boolean | null;
  entry?: number | null;
  entryZone?: { min?: number | null; max?: number | null } | null;
  stop?: number | null;
  tp1?: number | null;
  tp1R?: number | null;
  tp2?: number | null;
  tp2R?: number | null;
  rrToTp1?: number | null;
  rrToTp2?: number | null;
  primaryTrigger?: string | null;
  triggers?: string[] | null;
  createdAt?: string | null;
  triggerTime?: string | null;
  lifecycleStatus?: string | null;
  entryStatus?: string | null;
  currentPrice?: number | null;
  currentR?: number | null;
  currentPriceSource?: string | null;
  currentPriceUpdatedAt?: string | null;
  priceUpdatedAt?: string | null;
  priceAgeSeconds?: number | null;
  priceFreshness?: string | null;
  priceFreshnessReason?: string | null;
  stalePriceBlocked?: boolean | null;
  managementState?: string | null;
  tradeAction?: string | null;
  managementReasons?: string[] | null;
  strictEligible?: boolean | null;
  strictBlockedReasons?: string[] | null;
  lateSessionBlocked?: boolean | null;
  lateSessionReason?: string | null;
  marketClosedNewEntryBlocked?: boolean | null;
  minutesToCloseNow?: number | null;
  minutesToCloseAtSignal?: number | null;
  isActionable?: boolean | null;
  guidance?: string[] | null;
  nextActions?: string[] | null;
};

type CockpitLifecycle = {
  signalId?: string;
  symbol?: string;
  setupSlug?: string | null;
  setupName?: string | null;
  direction?: string | null;
  lifecycleStatus?: string | null;
  lifecycleEventType?: string | null;
  entryStatus?: string | null;
  currentPrice?: number | null;
  currentR?: number | null;
  currentPriceSource?: string | null;
  currentPriceUpdatedAt?: string | null;
  priceUpdatedAt?: string | null;
  priceAgeSeconds?: number | null;
  priceFreshness?: string | null;
  priceFreshnessReason?: string | null;
  stalePriceBlocked?: boolean | null;
  managementState?: string | null;
  tradeAction?: string | null;
  managementReasons?: string[] | null;
  strictEligible?: boolean | null;
  strictBlockedReasons?: string[] | null;
  lateSessionBlocked?: boolean | null;
  lateSessionReason?: string | null;
  marketClosedNewEntryBlocked?: boolean | null;
  minutesToCloseNow?: number | null;
  minutesToCloseAtSignal?: number | null;
  isActionable?: boolean | null;
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  triggerTime?: string | null;
  evaluatedAt?: string | null;
  reasons?: string[] | null;
  guidance?: string[] | null;
  nextActions?: string[] | null;
  chartLevels?: AnyRecord | null;
  timeline?: Array<{ type?: string; at?: string; text?: string }> | null;
  aiQuestionContext?: AnyRecord | null;
};

type Candle = {
  timestamp?: string;
  date?: string;
  time?: string | number;
  session?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
};

type ChartSession =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "unknown";
type ChartFocus = "all" | "premarket" | "regular" | "postmarket";

type CockpitSnapshot = {
  latestPrice?: number | null;
  latestCandleAt?: string | null;
  latestFiveMinuteCandleAt?: string | null;
  vwap?: number | null;
  ema20_5m?: number | null;
  atr14_5m?: number | null;
  rsi14_5m?: number | null;
  hod?: number | null;
  lod?: number | null;
  volumeAcceleration?: number | null;
  pullbackFromHodPct?: number | null;
  openingRange?: AnyRecord | null;
  confirmation?: AnyRecord | null;
  recentFiveMinuteCandles?: Candle[] | null;
};

type CockpitSelected = {
  symbol?: string;
  found?: boolean;
  status?: string | null;
  watchItem?: CockpitWatchItem | null;
  signal?: CockpitSignal | null;
  lifecycle?: CockpitLifecycle | null;
  lifecycleAvailable?: boolean;
  needsLifecycleRefresh?: boolean;
  chart?: {
    levels?: AnyRecord | null;
    snapshot?: CockpitSnapshot | null;
  } | null;
  aiPanel?: {
    headline?: string | null;
    isActionable?: boolean | null;
    sessionClosed?: boolean | null;
    lifecycleAvailable?: boolean | null;
    needsLifecycleRefresh?: boolean | null;
    guidance?: string[] | null;
    nextActions?: string[] | null;
    timeline?: Array<{ type?: string; at?: string; text?: string }> | null;
    questionContext?: AnyRecord | null;
  } | null;
};

type CockpitValue = {
  storageVersion?: string;
  dataSource?: string;
  runtimeStatus?: AnyRecord;
  summary?: AnyRecord;
  marketSession?: AnyRecord;
  bestIdeaSelector?: {
    selectedIdeas?: AnyRecord[];
    monitorOnly?: AnyRecord[];
    totals?: AnyRecord;
  } | null;
  clientDesk?: {
    activeIdeas?: AnyRecord[];
    waitingIdeas?: AnyRecord[];
    rejectedDebugIdeas?: AnyRecord[];
  } | null;
  watchlist?: { count?: number; items?: CockpitWatchItem[] };
  armed?: { count?: number; items?: CockpitSignal[] };
  active?: { count?: number; items?: CockpitSignal[] };
  closed?: { count?: number; items?: CockpitSignal[] };
  lifecycle?: { count?: number; items?: CockpitLifecycle[] };
  selected?: CockpitSelected | null;
};

type CockpitApiResponse = {
  ok?: boolean;
  value?: CockpitValue;
  selected?: CockpitSelected;
  error?: string;
  message?: string;
};

type CalibrationPreviewRow = {
  setupSlug?: string;
  action?: string;
  actionLabel?: string;
  status?: string;
  applyState?: string;
  wouldApply?: boolean;
  blockReasons?: string[];
  sampleConfidence?: string;
  sampleCount?: number;
  closedCount?: number;
  workedCount?: number;
  failedCount?: number;
  winRateClosed?: number | null;
  avgResultRClosed?: number | null;
  sourceBreakdown?: AnyRecord;
  proposedEngineEffect?: AnyRecord;
  ui?: {
    badge?: string;
    tone?: string;
    headline?: string;
  };
  reason?: string;
};

type CalibrationPreview = {
  ok?: boolean;
  version?: string;
  mode?: string;
  safety?: {
    engineMutationAllowed?: boolean;
    reason?: string;
    globalBlockers?: string[];
  };
  run?: {
    sessionDates?: string[];
    dateCount?: number;
    source?: string;
    outcomeCount?: number;
    closedCount?: number;
    workedCount?: number;
    failedCount?: number;
    expiredSessionCount?: number;
    winRateClosed?: number | null;
    avgResultRClosed?: number | null;
    sourceBreakdown?: AnyRecord;
    adjustmentCount?: number;
    readyToApplyCount?: number;
    blockedCount?: number;
    negativeWatchCount?: number;
    positiveWatchCount?: number;
  };
  previewRows?: CalibrationPreviewRow[];
  negativeWatchRows?: CalibrationPreviewRow[];
  positiveWatchRows?: CalibrationPreviewRow[];
  cockpitSummary?: {
    title?: string;
    state?: string;
    topWarnings?: string[];
    topPotentialBoosts?: string[];
    copy?: string;
  };
  interpretation?: AnyRecord;
};

type CockpitHistoryResponse = {
  ok?: boolean;
  symbol?: string;
  mode?: string;
  days?: number;
  interval?: string;
  candles?: Candle[];
  count?: number;
  rawCount?: number;
  tradingDates?: string[];
  sessionStats?: AnyRecord;
  sourceStats?: AnyRecord;
  storageVersion?: string;
  selected?: CockpitSelected | null;
  signals?: CockpitSignal[];
  lifecycleEvents?: CockpitLifecycle[];
  error?: string;
  message?: string;
};

type CockpitHistoryMeta = {
  loading: boolean;
  count: number;
  rawCount?: number;
  days: number;
  tradingDates: string[];
  sessionStats?: AnyRecord;
  sourceStats?: AnyRecord;
  providerMode?: string;
  providerLimitDetected?: boolean;
  externalRows?: number;
  externalProviderStatus?: string | null;
  storageVersion?: string;
  error?: string;
};

type ChartMode = "live" | "1d" | "3d";

type LiveLifecycleEvent = {
  key: string;
  symbol: string;
  type: string;
  at: string;
  text?: string | null;
  status?: string | null;
  price?: number | null;
  r?: number | null;
  source?: string;
  serverTime?: string | null;
};

type DeskItem = CockpitWatchItem | CockpitSignal;

const STATUS_RU: Record<string, string> = {
  WATCH: "Наблюдение",
  ARMED: "Готовится",
  ACTIVE: "Активная идея",
  ENTRY_STILL_VALID: "Вход актуален",
  STILL_VALID: "Идея актуальна",
  WAIT_FOR_REENTRY: "Ждать re-entry",
  ENTRY_MISSED: "Вход упущен",
  TP1_HIT: "TP1 взят",
  TP2_HIT: "TP2 взят",
  STOP_HIT: "Стоп",
  INVALIDATED: "Сломана",
  SESSION_CLOSE: "Сессия закрыта",
  WAITING_CONFIRMATION: "Ждём подтверждение",
  CLOSED_BY_SESSION: "Закрыто сессией",
  REJECT: "Отклонено",
  PASSED: "Пройдено",
};

const SETUP_RU: Record<string, string> = {
  premarket_pump_short: "Шорт после премаркет-пампа",
  "Premarket Pump Short": "Шорт после премаркет-пампа",
};

const CONFIRMATION_RU: Record<string, string> = {
  lower_high_5m: "Lower high 5m",
  ema20_loss_5m: "Потеря EMA20",
  vwap_rejection_5m: "Отбой от VWAP",
  failed_hod_reclaim_5m: "Failed HOD reclaim",
};

const TEXT_RU: Record<string, string> = {
  "Entry is still near the planned zone. Risk/reward is not obviously broken yet.":
    "Цена рядом с плановой зоной. R/R пока не сломан.",
  "Use original stop/invalidation. Do not enter if price accelerates away from entry.":
    "Работать только от исходного стопа и инвалидации. Не догонять цену.",
  "Setup is still being monitored. Wait for a cleaner entry/re-entry condition.":
    "Идея под наблюдением. Нужен более чистый вход или re-entry.",
  "Monitor current candle and respect invalidation.":
    "Следи за текущей свечой и уважай инвалидацию.",
  "Setup is armed. Wait for confirmation before treating it as an active trade idea.":
    "Сетап готовится. Это ещё не активный сигнал — ждём подтверждение.",
  "Watch for execution confirmation: EMA/VWAP rejection, lower high, or failed reclaim.":
    "Ждём execution confirmation: отбой VWAP/EMA, lower high или failed reclaim.",
  "Signal became ACTIVE.": "Идея стала ACTIVE.",
  "Regular session is closed. The intraday signal should no longer be treated as active.":
    "Сессия закрыта. Intraday-идею больше нельзя считать активной.",
  lower_high_bearish_rejection_detected: "Есть медвежий lower high.",
  close_too_near_high_no_bearish_rejection:
    "Закрытие слишком высоко — продавец слабый.",
  lower_high_gap_too_small: "Lower high пока слабый.",
  ema20_loss_5m: "Свеча закрылась ниже EMA20.",
  ema20_loss_but_close_near_high_no_pressure:
    "Цена ниже EMA20, но закрытие у high — давления мало.",
  ema20_loss_too_shallow: "Потеря EMA20 слишком слабая.",
  holding_above_ema20_5m: "Цена держится выше EMA20.",
  vwap_rejection_5m: "Есть отбой/потеря VWAP.",
  vwap_not_touched: "VWAP не протестирован.",
  vwap_not_lost_on_close: "VWAP не потерян на закрытии.",
  no_failed_hod_reclaim_yet: "Failed HOD reclaim пока нет.",
};

const QUESTIONS_RU: Record<string, string> = {
  "Is entry still valid?": "Вход ещё актуален?",
  "Did I miss the entry?": "Я уже пропустил вход?",
  "Should I wait for re-entry?": "Ждать re-entry?",
  "Is this signal invalidated?": "Идея уже сломана?",
  "What changed after TP1?": "Что делать после TP1?",
};

const terminalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "332px minmax(0, 1fr) 384px",
  gridTemplateRows: "minmax(0, 1fr)",
};

function normalizeStatus(value?: string | null) {
  return String(value || "WATCH").toUpperCase();
}

function labelStatus(value?: string | null) {
  const status = normalizeStatus(value);
  return STATUS_RU[status] || status.replaceAll("_", " ").toLowerCase();
}

function translateText(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return TEXT_RU[raw] || raw.replaceAll("_", " ");
}

function setupLabel(name?: string | null, slug?: string | null) {
  const key = String(slug || name || "");
  return (
    SETUP_RU[key] || SETUP_RU[String(name || "")] || key.replaceAll("_", " ")
  );
}

function confirmationLabel(name?: string | null) {
  const key = String(name || "");
  return CONFIRMATION_RU[key] || key.replaceAll("_", " ");
}

function formatNumber(value: unknown, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatPrice(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 10 ? 3 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatCompact(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function sessionCount(stats: AnyRecord | undefined | null, key: string) {
  const n = Number(stats?.[key]);
  return Number.isFinite(n) ? n : 0;
}

function historyProviderLabel(meta?: CockpitHistoryMeta | null) {
  const provider = String(
    meta?.providerMode || meta?.sourceStats?.providerMode || "auto",
  );
  const externalRows = Number(
    meta?.externalRows ?? meta?.sourceStats?.externalRows ?? 0,
  );
  if (externalRows > 0) return `${provider.toUpperCase()} EXT`;
  return `${provider.toUpperCase()} / FMP`;
}

function formatTime(value?: string | null) {
  const raw = String(value || "");
  if (!raw) return "—";
  const match = raw.match(/(\d{2}:\d{2})/);
  return match?.[1] || raw.slice(11, 16) || raw;
}

function formatDateTime(value?: string | null) {
  const raw = String(value || "");
  if (!raw) return "—";
  return raw.replace("T", " ").replace("Z", "").slice(0, 16);
}

function getSymbol(
  item?: CockpitWatchItem | CockpitSignal | CockpitLifecycle | null,
) {
  return String(item?.symbol || "").toUpperCase();
}

function isSignal(item: DeskItem): item is CockpitSignal {
  return Boolean(
    (item as CockpitSignal).signalId ||
    (item as CockpitSignal).setupSlug ||
    (item as CockpitSignal).entry,
  );
}

function getStatus(
  item?: CockpitWatchItem | CockpitSignal | CockpitLifecycle | null,
) {
  if (!item) return "WATCH";
  return normalizeStatus(
    (item as CockpitLifecycle).lifecycleStatus ||
      (item as CockpitSignal).lifecycleStatus ||
      (item as CockpitSignal).status ||
      (item as CockpitWatchItem).engineStatus ||
      (item as CockpitWatchItem).status ||
      "WATCH",
  );
}

function scoreOf(item?: CockpitWatchItem | CockpitSignal | null) {
  return (
    (item as CockpitSignal | undefined)?.score ??
    (item as CockpitWatchItem | undefined)?.inPlayScore ??
    null
  );
}

function priceOf(item?: CockpitWatchItem | CockpitSignal | null) {
  return (
    (item as CockpitSignal | undefined)?.currentPrice ??
    (item as CockpitWatchItem | undefined)?.price ??
    (item as CockpitSignal | undefined)?.entry ??
    null
  );
}

function changeOf(item?: DeskItem | null) {
  if (!item) return null;

  const record = item as AnyRecord;
  const watchItem = record.watchItem as AnyRecord | undefined;
  const signal = record.signal as AnyRecord | undefined;
  const signalWatchItem = signal?.watchItem as AnyRecord | undefined;
  const source = record.source as AnyRecord | undefined;
  const sourceWatchItem = source?.watchItem as AnyRecord | undefined;
  const quote = record.quote as AnyRecord | undefined;
  const market = record.market as AnyRecord | undefined;

  return (
    record.changePercent ??
    record.changePct ??
    record.percentChange ??
    record.change_percent ??
    record.priceChangePercent ??
    watchItem?.changePercent ??
    watchItem?.changePct ??
    watchItem?.percentChange ??
    watchItem?.change_percent ??
    signalWatchItem?.changePercent ??
    signalWatchItem?.changePct ??
    signalWatchItem?.percentChange ??
    signalWatchItem?.change_percent ??
    sourceWatchItem?.changePercent ??
    sourceWatchItem?.changePct ??
    sourceWatchItem?.percentChange ??
    sourceWatchItem?.change_percent ??
    quote?.changePercent ??
    quote?.changePct ??
    quote?.percentChange ??
    quote?.change_percent ??
    market?.changePercent ??
    market?.changePct ??
    market?.percentChange ??
    market?.change_percent ??
    null
  );
}

function toFiniteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const n = toFiniteNumberOrNull(value);
    if (n !== null) return n;
  }
  return null;
}

function deriveCurrentRFromTrade({
  currentPrice,
  entry,
  stop,
  direction,
}: {
  currentPrice: unknown;
  entry: unknown;
  stop: unknown;
  direction?: string | null;
}) {
  const price = toFiniteNumberOrNull(currentPrice);
  const entryPrice = toFiniteNumberOrNull(entry);
  const stopPrice = toFiniteNumberOrNull(stop);

  if (price === null || entryPrice === null || stopPrice === null) return null;

  const risk = Math.abs(entryPrice - stopPrice);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const side = String(direction || "").toLowerCase();
  const rawR = side.includes("short")
    ? (entryPrice - price) / risk
    : (price - entryPrice) / risk;

  if (!Number.isFinite(rawR)) return null;
  return Math.round(rawR * 100) / 100;
}


function statusTone(status?: string | null) {
  const s = normalizeStatus(status);
  if (
    [
      "ACTIVE",
      "ENTRY_STILL_VALID",
      "STILL_VALID",
      "TP1_HIT",
      "TP2_HIT",
    ].includes(s)
  )
    return "good";
  if (
    ["ARMED", "WAITING_CONFIRMATION", "WATCH", "WAIT_FOR_REENTRY"].includes(s)
  )
    return "info";
  if (
    [
      "INVALIDATED",
      "STOP_HIT",
      "ENTRY_MISSED",
      "SESSION_CLOSE",
      "REJECT",
    ].includes(s)
  )
    return "warn";
  return "neutral";
}

function statusClass(status?: string | null) {
  const tone = statusTone(status);
  if (tone === "good")
    return "border-emerald-300/30 bg-emerald-300/[0.13] text-emerald-50";
  if (tone === "info") return "border-sky-300/28 bg-sky-300/[0.12] text-sky-50";
  if (tone === "warn")
    return "border-amber-300/30 bg-amber-300/[0.12] text-amber-50";
  return "border-white/12 bg-white/[0.06] text-white/65";
}


function boolish(value: unknown) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const raw = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "y"].includes(raw);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function labelFromSnake(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw
    .replaceAll("_", " ")
    .replaceAll(":", ": ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatSignedR(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function formatPriceAge(seconds: unknown) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 60) return `${Math.round(n)}s`;
  return `${Math.round(n / 60)}m`;
}

function managementToneFromRecord(record?: AnyRecord | null): "good" | "warn" | "bad" | "info" {
  const state = String(record?.managementState || "").toUpperCase();
  const action = String(record?.tradeAction || "").toLowerCase();
  const currentR = Number(record?.currentR);

  if (
    boolish(record?.marketClosedNewEntryBlocked) ||
    state.includes("MARKET_CLOSED") ||
    state.includes("WEAK_NEAR_STOP") ||
    state.includes("STOP") ||
    (Number.isFinite(currentR) && currentR <= -0.75)
  ) {
    return "bad";
  }

  if (
    boolish(record?.stalePriceBlocked) ||
    boolish(record?.lateSessionBlocked) ||
    state.includes("EXTENDED") ||
    state.includes("DO_NOT_CHASE") ||
    state.includes("PULLBACK_ONLY") ||
    state.includes("WAIT") ||
    action.includes("avoid") ||
    action.includes("wait") ||
    action.includes("pullback") ||
    record?.isActionable === false
  ) {
    return "warn";
  }

  if (
    state.includes("HEALTHY") ||
    action.includes("paper_test_candidate") ||
    action.includes("entry_still_valid") ||
    record?.isActionable === true
  ) {
    return "good";
  }

  return "info";
}

function managementBadgeClass(tone: "good" | "warn" | "bad" | "info") {
  if (tone === "good")
    return "border-emerald-300/28 bg-emerald-300/[0.11] text-emerald-50";
  if (tone === "bad")
    return "border-rose-300/30 bg-rose-300/[0.11] text-rose-50";
  if (tone === "warn")
    return "border-amber-300/30 bg-amber-300/[0.11] text-amber-50";
  return "border-sky-300/24 bg-sky-300/[0.10] text-sky-50";
}

function priceFreshnessClass(value?: string | null) {
  const key = String(value || "").toUpperCase();
  if (key === "FRESH")
    return "border-emerald-300/25 bg-emerald-300/[0.10] text-emerald-100";
  if (key === "AGING")
    return "border-amber-300/25 bg-amber-300/[0.10] text-amber-100";
  if (key === "STALE" || key === "UNKNOWN")
    return "border-rose-300/25 bg-rose-300/[0.10] text-rose-100";
  return "border-white/10 bg-white/[0.06] text-white/55";
}

function priceFreshnessTone(value?: string | null): "good" | "bad" | "info" {
  const key = String(value || "").toUpperCase();
  if (key === "FRESH") return "good";
  if (key === "STALE" || key === "UNKNOWN") return "bad";
  return "info";
}


function dotClass(status?: string | null) {
  const tone = statusTone(status);
  if (tone === "good") return "bg-emerald-300";
  if (tone === "info") return "bg-sky-300";
  if (tone === "warn") return "bg-amber-300";
  return "bg-white/35";
}

function levelColor(key: string) {
  if (key === "stop") return "#FB7185";
  if (key === "entry") return "#E9C46A";
  if (key === "tp1" || key === "tp2") return "#00C076";
  if (key === "vwap") return "#38BDF8";
  if (key === "ema20_5m") return "#A78BFA";
  return "#94A3B8";
}

function levelLabel(key: string) {
  if (key === "entry") return "Вход";
  if (key === "stop") return "Стоп";
  if (key === "tp1") return "TP1";
  if (key === "tp2") return "TP2";
  if (key === "vwap") return "VWAP";
  if (key === "ema20_5m") return "EMA20";
  return key.toUpperCase();
}

function levelItems(levels?: AnyRecord | null) {
  const ordered = ["entry", "stop", "tp1", "tp2", "vwap", "ema20_5m"];
  return ordered
    .map((key) => ({ key, value: levels?.[key] }))
    .filter(
      (item) =>
        item.value !== null && item.value !== undefined && item.value !== "",
    );
}

function confirmationRows(snapshot?: CockpitSnapshot | null) {
  const c = snapshot?.confirmation;
  if (!c) return [];
  return [
    {
      key: "lower_high_5m",
      detected: Boolean(c.lowerHigh5m?.detected),
      reason: c.lowerHigh5m?.reason,
    },
    {
      key: "ema20_loss_5m",
      detected: Boolean(c.ema20Loss5m?.detected),
      reason: c.ema20Loss5m?.reason,
    },
    {
      key: "vwap_rejection_5m",
      detected: Boolean(c.vwapRejection5m?.detected),
      reason: c.vwapRejection5m?.reason,
    },
    {
      key: "failed_hod_reclaim_5m",
      detected: Boolean(c.failedHodReclaim5m?.detected),
      reason: c.failedHodReclaim5m?.reason,
    },
  ];
}


function unwrapCockpitValue(payload: AnyRecord): CockpitValue | null {
  if (!payload) return null;

  const directCandidate =
    payload.bestIdeaSelector || payload.clientDesk || payload.runtimeStatus;

  return (
    payload.value ||
    payload.data ||
    (directCandidate ? (payload as CockpitValue) : null)
  );
}

function toSignalFromIdea(raw: AnyRecord, fallbackStatus = "WATCH"): CockpitSignal {
  const status = String(
    raw.status ||
      raw.lifecycleStatus ||
      raw.engineStatus ||
      fallbackStatus ||
      "WATCH",
  ).toUpperCase();

  const entryZone =
    raw.entryZone ||
    (raw.entryZoneMin !== undefined || raw.entryZoneMax !== undefined
      ? { min: raw.entryZoneMin ?? null, max: raw.entryZoneMax ?? null }
      : null);

  return {
    signalId:
      raw.signalId ||
      raw.id ||
      `${String(raw.symbol || "").toUpperCase()}-${String(raw.setupSlug || "setup")}-${status}`,
    symbol: String(raw.symbol || "").toUpperCase(),
    setupSlug: raw.setupSlug ?? raw.setup_slug ?? null,
    setupName: raw.setupName ?? raw.setup_name ?? null,
    direction: raw.direction ?? null,
    status,
    engineStatus: raw.engineStatus ?? status,
    qualityStatus: raw.qualityStatus ?? raw.quality_status ?? null,
    grade: raw.grade ?? raw.signalGrade ?? null,
    score: raw.score ?? raw.signalScore ?? null,
    premiumSignal: raw.premiumSignal ?? null,
    telegramEligible: raw.telegramEligible ?? null,

    entry: raw.entry ?? raw.entryPrice ?? raw.entry_price ?? entryZone?.min ?? null,
    entryZone,
    stop: raw.stop ?? raw.stopPrice ?? raw.stop_price ?? null,
    tp1: raw.tp1 ?? raw.target1 ?? raw.target_1 ?? null,
    tp1R: raw.tp1R ?? raw.rrToTp1 ?? null,
    tp2: raw.tp2 ?? raw.target2 ?? raw.target_2 ?? null,
    tp2R: raw.tp2R ?? raw.rrToTp2 ?? null,
    rrToTp1: raw.rrToTp1 ?? raw.tp1R ?? null,
    rrToTp2: raw.rrToTp2 ?? raw.tp2R ?? null,

    primaryTrigger: raw.primaryTrigger ?? null,
    triggers: raw.triggers ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    triggerTime: raw.triggerTime ?? raw.trigger_time ?? raw.createdAt ?? null,

    lifecycleStatus: raw.lifecycleStatus ?? status,
    entryStatus: raw.entryStatus ?? null,
    currentPrice: raw.currentPrice ?? raw.price ?? null,
    currentR: raw.currentR ?? null,
    currentPriceSource: raw.currentPriceSource ?? null,
    currentPriceUpdatedAt:
      raw.currentPriceUpdatedAt ?? raw.priceUpdatedAt ?? raw.updatedAt ?? null,
    priceUpdatedAt: raw.priceUpdatedAt ?? raw.updatedAt ?? null,
    priceAgeSeconds: raw.priceAgeSeconds ?? null,
    priceFreshness: raw.priceFreshness ?? null,
    priceFreshnessReason: raw.priceFreshnessReason ?? null,
    stalePriceBlocked: raw.stalePriceBlocked ?? null,
    managementState: raw.managementState ?? null,
    tradeAction: raw.tradeAction ?? null,
    managementReasons: raw.managementReasons ?? null,
    strictEligible: raw.strictEligible ?? null,
    strictBlockedReasons: raw.strictBlockedReasons ?? null,
    lateSessionBlocked: raw.lateSessionBlocked ?? null,
    lateSessionReason: raw.lateSessionReason ?? null,
    marketClosedNewEntryBlocked: raw.marketClosedNewEntryBlocked ?? null,
    minutesToCloseNow: raw.minutesToCloseNow ?? null,
    minutesToCloseAtSignal: raw.minutesToCloseAtSignal ?? null,
    isActionable: raw.isActionable ?? null,
    guidance: raw.guidance ?? null,
    nextActions: raw.nextActions ?? null,
  };
}

function toWatchFromIdea(raw: AnyRecord): CockpitWatchItem {
  return {
    symbol: String(raw.symbol || "").toUpperCase(),
    name: raw.name ?? raw.setupName ?? raw.setup_name ?? null,
    exchange: raw.exchange ?? null,
    status: raw.status ?? raw.lifecycleStatus ?? "WATCH",
    engineStatus: raw.engineStatus ?? raw.status ?? raw.lifecycleStatus ?? "WATCH",
    price: raw.price ?? raw.currentPrice ?? null,
    changePercent:
      raw.changePercent ??
      raw.changePct ??
      raw.percentChange ??
      raw.change_percent ??
      raw.priceChangePercent ??
      raw.watchItem?.changePercent ??
      raw.watchItem?.changePct ??
      raw.watchItem?.percentChange ??
      raw.watchItem?.change_percent ??
      null,
    volume: raw.volume ?? null,
    marketCap: raw.marketCap ?? raw.market_cap ?? null,
    universe: raw.universe ?? null,
    sourceBucket: raw.sourceBucket ?? null,
    inPlayScore: raw.inPlayScore ?? raw.score ?? raw.signalScore ?? null,
    rankReasons: raw.rankReasons ?? null,
    lifecycleStatus: raw.lifecycleStatus ?? raw.status ?? null,
    entryStatus: raw.entryStatus ?? null,
    currentR: raw.currentR ?? null,
    currentPriceSource: raw.currentPriceSource ?? null,
    currentPriceUpdatedAt:
      raw.currentPriceUpdatedAt ?? raw.priceUpdatedAt ?? raw.updatedAt ?? null,
    priceUpdatedAt: raw.priceUpdatedAt ?? raw.updatedAt ?? null,
    priceAgeSeconds: raw.priceAgeSeconds ?? null,
    priceFreshness: raw.priceFreshness ?? null,
    priceFreshnessReason: raw.priceFreshnessReason ?? null,
    stalePriceBlocked: raw.stalePriceBlocked ?? null,
    managementState: raw.managementState ?? null,
    tradeAction: raw.tradeAction ?? null,
    managementReasons: raw.managementReasons ?? null,
    strictEligible: raw.strictEligible ?? null,
    strictBlockedReasons: raw.strictBlockedReasons ?? null,
    lateSessionBlocked: raw.lateSessionBlocked ?? null,
    lateSessionReason: raw.lateSessionReason ?? null,
    marketClosedNewEntryBlocked: raw.marketClosedNewEntryBlocked ?? null,
    minutesToCloseNow: raw.minutesToCloseNow ?? null,
    minutesToCloseAtSignal: raw.minutesToCloseAtSignal ?? null,
    isActionable: raw.isActionable ?? null,
    updatedAt: raw.updatedAt ?? raw.currentPriceUpdatedAt ?? null,
  };
}

function uniqSignalsBySymbol(items: CockpitSignal[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const symbol = getSymbol(item);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function uniqWatchBySymbol(items: CockpitWatchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const symbol = getSymbol(item);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function normalizeCockpitValue(value: CockpitValue | null): CockpitValue | null {
  if (!value) return null;

  const currentActive = Array.isArray(value.active?.items)
    ? value.active?.items || []
    : [];
  const currentArmed = Array.isArray(value.armed?.items)
    ? value.armed?.items || []
    : [];
  const currentWatch = Array.isArray(value.watchlist?.items)
    ? value.watchlist?.items || []
    : [];

  if (currentActive.length || currentArmed.length || currentWatch.length) {
    return value;
  }

  const selectedIdeas =
    value.bestIdeaSelector?.selectedIdeas ||
    value.clientDesk?.activeIdeas ||
    [];
  const monitorIdeas =
    value.bestIdeaSelector?.monitorOnly ||
    value.clientDesk?.waitingIdeas ||
    [];
  const rejectedIdeas = value.clientDesk?.rejectedDebugIdeas || [];

  const activeItems = uniqSignalsBySymbol(
    selectedIdeas.map((idea) => toSignalFromIdea(idea, "ACTIVE")),
  );
  const armedItems = uniqSignalsBySymbol(
    monitorIdeas.map((idea) => toSignalFromIdea(idea, "ARMED")),
  );
  const watchItems = uniqWatchBySymbol(
    rejectedIdeas.map((idea) => toWatchFromIdea({ ...idea, status: "WATCH" })),
  );

  return {
    ...value,
    active: {
      count: activeItems.length,
      items: activeItems,
    },
    armed: {
      count: armedItems.length,
      items: armedItems,
    },
    watchlist: {
      count: watchItems.length,
      items: watchItems,
    },
    closed: value.closed || { count: 0, items: [] },
  };
}


function mergeDeskItems(value: CockpitValue | null) {
  const watchBySymbol = new Map<string, CockpitWatchItem>();

  for (const watchItem of value?.watchlist?.items || []) {
    const symbol = getSymbol(watchItem);
    if (symbol && !watchBySymbol.has(symbol)) {
      watchBySymbol.set(symbol, watchItem);
    }
  }

  const source: DeskItem[] = [
    ...(value?.active?.items || []),
    ...(value?.armed?.items || []),
    ...(value?.watchlist?.items || []),
    ...(value?.closed?.items || []),
  ];

  const enrichedSource = source.map((item) => {
    const symbol = getSymbol(item);
    const watchItem = symbol ? watchBySymbol.get(symbol) : null;
    if (!watchItem) return item;

    const record = item as AnyRecord;
    const watchRecord = watchItem as AnyRecord;

    return {
      ...watchRecord,
      ...record,
      watchItem: record.watchItem ?? watchItem,
      name: record.name ?? watchItem.name ?? null,
      price:
        record.price ??
        record.currentPrice ??
        watchItem.price ??
        null,
      changePercent:
        record.changePercent ??
        record.changePct ??
        record.percentChange ??
        record.change_percent ??
        record.priceChangePercent ??
        watchItem.changePercent ??
        watchRecord.changePct ??
        watchRecord.percentChange ??
        watchRecord.change_percent ??
        watchRecord.priceChangePercent ??
        null,
      volume:
        record.volume ??
        watchItem.volume ??
        null,
      marketCap:
        record.marketCap ??
        record.market_cap ??
        watchItem.marketCap ??
        watchRecord.market_cap ??
        null,
      universe:
        record.universe ??
        watchItem.universe ??
        null,
      sourceBucket:
        record.sourceBucket ??
        watchItem.sourceBucket ??
        null,
      inPlayScore:
        record.inPlayScore ??
        record.score ??
        record.signalScore ??
        watchItem.inPlayScore ??
        null,
    } as DeskItem;
  });

  const seen = new Set<string>();
  return enrichedSource.filter((item) => {
    const symbol = getSymbol(item);
    if (!symbol || seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

function fallbackSelected(
  symbol: string,
  item?: DeskItem | null,
): CockpitSelected | null {
  if (!symbol || !item) return null;
  const status = getStatus(item);
  const signal = isSignal(item) ? item : null;
  const watchItem = isSignal(item)
    ? ({
        symbol,
        status,
        engineStatus: signal?.engineStatus || status,
        price: signal?.currentPrice ?? signal?.entry ?? null,
        inPlayScore: signal?.score ?? null,
        lifecycleStatus: signal?.lifecycleStatus ?? null,
        entryStatus: signal?.entryStatus ?? null,
        currentR: signal?.currentR ?? null,
        isActionable: signal?.isActionable ?? true,
      } as CockpitWatchItem)
    : item;

  return {
    symbol,
    found: true,
    status,
    watchItem,
    signal,
    lifecycle: null,
    lifecycleAvailable: false,
    needsLifecycleRefresh: true,
    chart: {
      levels: signal
        ? {
            entry: signal.entry,
            stop: signal.stop,
            tp1: signal.tp1,
            tp2: signal.tp2,
          }
        : {},
      snapshot: null,
    },
    aiPanel: {
      headline: signal?.qualityStatus || status,
      isActionable: signal?.isActionable ?? true,
      sessionClosed: false,
      lifecycleAvailable: false,
      needsLifecycleRefresh: true,
      guidance: [
        "Сетап готовится. Это ещё не активный сигнал — ждём подтверждение.",
      ],
      nextActions: ["Ждать execution confirmation перед входом."],
      timeline: [],
      questionContext: {
        canAsk: true,
        supportedQuestions: Object.keys(QUESTIONS_RU),
        engineAnswerMode: "rules_first_llm_explanation_later",
      },
    },
  };
}

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#111923]/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] ${className}`}
    >
      {title ? (
        <div className="border-b border-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
          {title}
        </div>
      ) : null}
      <div className="p-3">{children}</div>
    </div>
  );
}

function SmallMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "bad" | "info";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-100"
      : tone === "bad"
        ? "text-rose-100"
        : tone === "info"
          ? "text-sky-100"
          : "text-white";
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/18 px-3 py-2">
      <div className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-white/36">
        {label}
      </div>
      <div className={`mt-1 truncate text-sm font-black ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

const KYIV_DISPLAY_OFFSET_SECONDS = 3 * 60 * 60;

function parseUtcTimestampSeconds(value?: string | number | null): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Provider values may be epoch milliseconds or epoch seconds.
    return Math.floor(value > 1_000_000_000_000 ? value / 1000 : value);
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function toChartTime(value?: string | number | null): number | null {
  const utcSeconds = parseUtcTimestampSeconds(value);
  if (!utcSeconds) return null;
  // Lightweight Charts does not support arbitrary exchange/local time zones.
  // We display the chart in Kyiv time so US premarket starts around 11:00 for the user.
  return utcSeconds + KYIV_DISPLAY_OFFSET_SECONDS;
}

function dateKeyFromChartTime(time: number) {
  const d = new Date(time * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inferSessionFromUtcTime(
  utcSeconds: number,
  explicit?: string | null,
): ChartSession {
  const raw = String(explicit || "").toLowerCase();
  if (["premarket", "regular", "postmarket", "overnight"].includes(raw)) {
    return raw as ChartSession;
  }

  // US equities during DST are 08:00-13:30 UTC premarket, 13:30-20:00 UTC regular, 20:00-00:00 UTC postmarket.
  // Display time is shifted to Kyiv later, but session classification must stay exchange/UTC based.
  const d = new Date(utcSeconds * 1000);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (minutes >= 8 * 60 && minutes < 13 * 60 + 30) return "premarket";
  if (minutes >= 13 * 60 + 30 && minutes < 20 * 60) return "regular";
  if (minutes >= 20 * 60 && minutes < 24 * 60) return "postmarket";
  return "overnight";
}

function sessionLabelRu(session?: string | null) {
  const key = String(session || "").toLowerCase();
  if (key === "premarket") return "Премаркет";
  if (key === "regular") return "Регулярка";
  if (key === "postmarket") return "Постмаркет";
  if (key === "overnight") return "Ночь";
  return "Сессия";
}

function sessionBandClass(session?: string | null) {
  const key = String(session || "").toLowerCase();
  if (key === "premarket") return "border-cyan-300/10 bg-cyan-300/[0.035]";
  if (key === "postmarket") return "border-violet-300/10 bg-violet-300/[0.035]";
  if (key === "regular") return "border-white/[0.015] bg-white/[0.006]";
  return "border-white/[0.015] bg-white/[0.01]";
}

function normalizeCandleListForChart(candleList?: Candle[] | null) {
  const map = new Map<
    number,
    {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      rawTime: string;
      session: ChartSession;
      dateKey: string;
    }
  >();

  for (const candle of candleList || []) {
    const rawTimestamp =
      (candle as AnyRecord).timestamp ||
      (candle as AnyRecord).date ||
      (candle as AnyRecord).time ||
      "";
    const utcTime = parseUtcTimestampSeconds(rawTimestamp);
    const time = utcTime ? utcTime + KYIV_DISPLAY_OFFSET_SECONDS : null;
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume || 0);
    if (!time || !utcTime || ![open, high, low, close].every(Number.isFinite)) continue;
    const explicitSession =
      (candle as AnyRecord).session || (candle as AnyRecord).marketSession;
    map.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      rawTime: `${String(rawTimestamp)} · Kyiv display`,
      session: inferSessionFromUtcTime(utcTime, explicitSession),
      dateKey: dateKeyFromChartTime(time),
    });
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function mergeHistoryWithLiveCandles(
  historyCandles?: Candle[] | null,
  liveCandles?: Candle[] | null,
) {
  const byKey = new Map<string, Candle>();
  for (const candle of historyCandles || []) {
    const key = String(
      (candle as AnyRecord).timestamp ||
        (candle as AnyRecord).date ||
        (candle as AnyRecord).time ||
        "",
    );
    if (key) byKey.set(key, candle);
  }
  for (const candle of liveCandles || []) {
    const key = String(
      (candle as AnyRecord).timestamp ||
        (candle as AnyRecord).date ||
        (candle as AnyRecord).time ||
        "",
    );
    if (key) byKey.set(key, candle);
  }
  return Array.from(byKey.values());
}

function normalizeCandlesForChart(
  snapshot?: CockpitSnapshot | null,
  historyCandles?: Candle[] | null,
  mode: ChartMode = "live",
  requestedSession: ChartFocus = "all",
) {
  const hasHistory = Array.isArray(historyCandles) && historyCandles.length > 0;
  const sourceCandles =
    mode === "live" || !hasHistory
      ? snapshot?.recentFiveMinuteCandles || []
      : requestedSession === "all"
        ? mergeHistoryWithLiveCandles(
            historyCandles || [],
            snapshot?.recentFiveMinuteCandles || [],
          )
        : historyCandles || [];

  const normalized = normalizeCandleListForChart(sourceCandles);
  if (mode !== "live" && hasHistory && requestedSession !== "all") {
    return normalized.filter((candle) => candle.session === requestedSession);
  }
  return normalized;
}
function TerminalChart({
  symbol,
  snapshot,
  levels,
  entryZone,
  direction,
  triggerTime,
  timeline,
  historyCandles,
  chartMode,
  historyMeta,
  historySession = "all",
}: {
  symbol?: string | null;
  snapshot?: CockpitSnapshot | null;
  levels?: AnyRecord | null;
  entryZone?: { min?: number | null; max?: number | null } | null;
  direction?: string | null;
  triggerTime?: string | null;
  timeline?: Array<{ type?: string; at?: string; text?: string }> | null;
  historyCandles?: Candle[] | null;
  chartMode?: ChartMode;
  historyMeta?: CockpitHistoryMeta | null;
  historySession?: ChartFocus;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const chartViewportRef = useRef<any>(null);
  const chartInitializedKeyRef = useRef<string>("");
  const userMovedChartRef = useRef(false);
  const mode = chartMode || "live";
  const candles = useMemo(() => {
    const all = normalizeCandlesForChart(
      snapshot,
      historyCandles,
      mode,
      historySession,
    );
    if (mode === "live") return all.slice(-220);
    return all.slice(-1600);
  }, [snapshot, historyCandles, mode, historySession]);
  const latestCandle = candles[candles.length - 1] || null;
  const historyDateKey = Array.isArray(historyMeta?.tradingDates)
    ? historyMeta?.tradingDates?.join("|")
    : "";
  const sessionStatsKey = `${sessionCount(historyMeta?.sessionStats, "premarket")}:${sessionCount(historyMeta?.sessionStats, "regular")}:${sessionCount(historyMeta?.sessionStats, "postmarket")}:${Number(historyMeta?.externalRows || historyMeta?.sourceStats?.externalRows || 0)}:${candles.length}`;
  const viewKey = `${String(symbol || "").toUpperCase()}:${mode}:${historySession}:${historyDateKey}:${sessionStatsKey}:${candles[0]?.time || "none"}`;
  const [hoverCandle, setHoverCandle] = useState<any>(null);
  useEffect(() => {
    userMovedChartRef.current = false;
  }, [historySession, viewKey]);
  const [chartOverlay, setChartOverlay] = useState<{
    levelTags: Array<{ key: string; value: number; y: number }>;
    eventMarkers: Array<{
      key: string;
      type: string;
      label: string;
      text?: string;
      x: number;
      y: number;
    }>;
    entryBand?: { top: number; height: number } | null;
    riskBand?: { top: number; height: number } | null;
    targetBand?: { top: number; height: number } | null;
    triggerX?: number | null;
    sessionBands?: Array<{
      key: string;
      session: ChartSession;
      label: string;
      x: number;
      width: number;
    }>;
  }>({ levelTags: [], eventMarkers: [], sessionBands: [] });

  const recomputeOverlay = useCallback(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !candleSeries || !container) return;

    const priceToY = (raw: unknown) => {
      const price = Number(raw);
      if (!Number.isFinite(price)) return null;
      const y = candleSeries.priceToCoordinate(price);
      return typeof y === "number" && Number.isFinite(y) ? y : null;
    };

    const rawTags = [
      ["current", snapshot?.latestPrice ?? latestCandle?.close],
      ["entry", levels?.entry],
      ["stop", levels?.stop],
      ["tp1", levels?.tp1],
      ["tp2", levels?.tp2],
      ["vwap", levels?.vwap ?? snapshot?.vwap],
      ["ema20_5m", levels?.ema20_5m ?? snapshot?.ema20_5m],
    ] as Array<[string, unknown]>;

    const levelTags = rawTags
      .map(([key, value]) => {
        const numeric = Number(value);
        const y = priceToY(value);
        if (!Number.isFinite(numeric) || y === null) return null;
        return { key, value: numeric, y };
      })
      .filter(Boolean) as Array<{ key: string; value: number; y: number }>;

    const makeBand = (a: unknown, b: unknown) => {
      const ay = priceToY(a);
      const by = priceToY(b);
      if (ay === null || by === null) return null;
      const top = Math.min(ay, by);
      const height = Math.max(3, Math.abs(ay - by));
      if (!Number.isFinite(top) || !Number.isFinite(height)) return null;
      return { top, height };
    };

    const entryBand = makeBand(entryZone?.min, entryZone?.max);
    const riskBand = makeBand(levels?.entry, levels?.stop);
    const targetBand = makeBand(levels?.entry, levels?.tp1);

    let triggerX: number | null = null;
    const trigger = toChartTime(triggerTime || "");
    if (trigger && chart.timeScale?.().timeToCoordinate) {
      const x = chart.timeScale().timeToCoordinate(trigger as any);
      if (typeof x === "number" && Number.isFinite(x)) triggerX = x;
    }

    const eventPrice = (eventType?: string | null) => {
      const type = normalizeStatus(eventType);
      if (type === "TP1_HIT") return levels?.tp1;
      if (type === "TP2_HIT") return levels?.tp2;
      if (type === "STOP_HIT" || type === "INVALIDATED") return levels?.stop;
      if (type === "NEW_ACTIVE") return levels?.entry;
      return snapshot?.latestPrice ?? latestCandle?.close ?? levels?.entry;
    };

    const sessionRuns: Array<{
      session: ChartSession;
      start: number;
      end: number;
      dateKey: string;
    }> = [];
    for (let i = 0; i < candles.length; i += 1) {
      const c = candles[i] as any;
      const session = (c.session || "unknown") as ChartSession;
      if (!sessionRuns.length) {
        sessionRuns.push({
          session,
          start: c.time,
          end: c.time,
          dateKey: c.dateKey,
        });
        continue;
      }
      const last = sessionRuns[sessionRuns.length - 1];
      if (last.session === session && last.dateKey === c.dateKey) {
        last.end = c.time;
      } else {
        sessionRuns.push({
          session,
          start: c.time,
          end: c.time,
          dateKey: c.dateKey,
        });
      }
    }

    const sessionBands = sessionRuns
      .map((run, index) => {
        if (!["premarket", "regular", "postmarket"].includes(run.session))
          return null;
        const x1 = chart.timeScale().timeToCoordinate(run.start as any);
        const x2 = chart
          .timeScale()
          .timeToCoordinate((run.end + 5 * 60) as any);
        if (typeof x1 !== "number" || typeof x2 !== "number") return null;
        const x = Math.min(x1, x2);
        const width = Math.max(3, Math.abs(x2 - x1));
        if (!Number.isFinite(x) || !Number.isFinite(width)) return null;
        return {
          key: `${run.session}-${run.dateKey}-${index}`,
          session: run.session,
          label: sessionLabelRu(run.session),
          x,
          width,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      session: ChartSession;
      label: string;
      x: number;
      width: number;
    }>;

    const eventMarkers = (timeline || [])
      .slice(-10)
      .map((event, index) => {
        const time = toChartTime(event.at);
        if (!time || !chart.timeScale?.().timeToCoordinate) return null;
        const x = chart.timeScale().timeToCoordinate(time as any);
        const y = priceToY(eventPrice(event.type));
        if (typeof x !== "number" || !Number.isFinite(x) || y === null)
          return null;
        const type = normalizeStatus(event.type);
        return {
          key: `${type}-${event.at || index}`,
          type,
          label: labelStatus(type),
          text: translateText(event.text),
          x,
          y,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      type: string;
      label: string;
      text?: string;
      x: number;
      y: number;
    }>;

    setChartOverlay({
      levelTags,
      eventMarkers,
      entryBand,
      riskBand,
      targetBand,
      triggerX,
      sessionBands,
    });
  }, [
    entryZone?.min,
    entryZone?.max,
    levels?.entry,
    levels?.stop,
    levels?.tp1,
    levels?.tp2,
    levels?.vwap,
    levels?.ema20_5m,
    snapshot?.latestPrice,
    snapshot?.vwap,
    snapshot?.ema20_5m,
    latestCandle?.close,
    triggerTime,
    timeline,
    candles,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const chart = createChart(container, {
      width: container.clientWidth || 900,
      height: container.clientHeight || 520,
      layout: {
        background: { type: "solid", color: "#050912" },
        textColor: "rgba(230,237,247,0.72)",
        fontFamily: "Montserrat, Inter, Arial, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.075)" },
        horzLines: { color: "rgba(148,163,184,0.075)" },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "rgba(0,192,118,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#00C076",
        },
        horzLine: {
          color: "rgba(0,192,118,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#00C076",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.18)",
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.18)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: mode === "3d" ? 2.2 : mode === "1d" ? 6 : 14,
        minBarSpacing: 1,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price),
      },
    } as any);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00C076",
      downColor: "#FB7185",
      borderUpColor: "#00E08A",
      borderDownColor: "#FF6B87",
      wickUpColor: "#8FFFD3",
      wickDownColor: "#FFA1B1",
      priceLineVisible: false,
      lastValueVisible: true,
    } as any);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    } as any);

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.79, bottom: 0.02 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const markManualMove = () => {
      userMovedChartRef.current = true;
      try {
        chartViewportRef.current =
          chart.timeScale().getVisibleLogicalRange?.() || null;
      } catch {}
    };
    const wheelListener = () => markManualMove();
    const pointerListener = () => markManualMove();
    container.addEventListener("wheel", wheelListener, { passive: true });
    container.addEventListener("pointerdown", pointerListener, {
      passive: true,
    });
    try {
      chart.timeScale().subscribeVisibleLogicalRangeChange?.((range: any) => {
        if (range && userMovedChartRef.current)
          chartViewportRef.current = range;
      });
    } catch {}

    chart.subscribeCrosshairMove((param: any) => {
      const candle = param?.seriesData?.get?.(candleSeries);
      if (!candle || param?.point === undefined) {
        setHoverCandle(null);
        return;
      }
      setHoverCandle(candle);
    });

    const resize = () => {
      const width = container.clientWidth || 900;
      const height = container.clientHeight || 520;
      chart.resize(width, height);
      try {
        if (chartViewportRef.current) {
          chart.timeScale().setVisibleLogicalRange(chartViewportRef.current);
        }
      } catch {}
      window.setTimeout(recomputeOverlay, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      container.removeEventListener("wheel", wheelListener);
      container.removeEventListener("pointerdown", pointerListener);
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const candleData = candles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData = candles.map((c) => ({
      time: c.time as any,
      value: c.volume,
      color:
        c.close >= c.open ? "rgba(0,192,118,0.34)" : "rgba(251,113,133,0.34)",
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    for (const line of priceLinesRef.current) {
      try {
        candleSeries.removePriceLine(line);
      } catch {}
    }
    priceLinesRef.current = [];

    const addLine = (key: string, rawValue: unknown, width = 2) => {
      const price = Number(rawValue);
      if (!Number.isFinite(price)) return;
      const color = levelColor(key);
      const line = candleSeries.createPriceLine({
        price,
        color,
        lineWidth: width,
        lineStyle:
          key === "entry" || key === "stop" || key === "tp1" || key === "tp2"
            ? LineStyle.Solid
            : LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${levelLabel(key)} ${formatPrice(price)}`,
      } as any);
      priceLinesRef.current.push(line);
    };

    addLine("entry", levels?.entry, 3);
    addLine("stop", levels?.stop, 3);
    addLine("tp1", levels?.tp1, 2);
    addLine("tp2", levels?.tp2, 2);
    addLine("vwap", levels?.vwap ?? snapshot?.vwap, 2);
    addLine("ema20_5m", levels?.ema20_5m ?? snapshot?.ema20_5m, 2);
    addLine(
      "current",
      snapshot?.latestPrice ?? candles[candles.length - 1]?.close,
      1,
    );

    try {
      chart.timeScale().applyOptions({
        barSpacing: mode === "3d" ? 2.2 : mode === "1d" ? 6 : 14,
        minBarSpacing: 1,
        rightOffset: 10,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: true,
      });
    } catch {}

    const shouldAutoPlace = chartInitializedKeyRef.current !== viewKey;

    if (shouldAutoPlace) {
      chartInitializedKeyRef.current = viewKey;
      userMovedChartRef.current = false;
      chartViewportRef.current = null;
      if (mode === "3d" && candleData.length > 0) {
        const to = candleData.length + 8;
        const from = -4;
        try {
          chart.timeScale().setVisibleLogicalRange({ from, to });
          chartViewportRef.current = { from, to };
        } catch {
          chart.timeScale().fitContent();
        }
      } else if (mode === "1d" && candleData.length > 120) {
        const to = candleData.length + 8;
        const from = Math.max(0, candleData.length - 120);
        try {
          chart.timeScale().setVisibleLogicalRange({ from, to });
          chartViewportRef.current = { from, to };
        } catch {
          chart.timeScale().fitContent();
        }
      } else {
        chart.timeScale().fitContent();
        try {
          chartViewportRef.current =
            chart.timeScale().getVisibleLogicalRange?.() || null;
        } catch {}
      }
    } else if (chartViewportRef.current) {
      try {
        chart.timeScale().setVisibleLogicalRange(chartViewportRef.current);
      } catch {}
    }

    window.setTimeout(recomputeOverlay, 0);
  }, [
    candles,
    levels,
    snapshot?.latestPrice,
    snapshot?.vwap,
    snapshot?.ema20_5m,
    mode,
    viewKey,
    recomputeOverlay,
  ]);

  if (!candles.length) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-[#080f19] text-sm font-bold text-white/45">
        Нет 5m свечей для графика. Выбери другой тикер или обнови desk.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#050912] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_90px_rgba(0,0,0,0.35)]">
      <div ref={containerRef} className="absolute inset-0" />

      {(chartOverlay.sessionBands || []).map((band) => (
        <div
          key={band.key}
          className={`pointer-events-none absolute bottom-0 top-0 z-[1] border-x ${sessionBandClass(band.session)}`}
          style={{ left: band.x, width: band.width }}
        >
          {band.width > 70 ? (
            <span className="absolute left-2 top-[52px] rounded-full border border-white/10 bg-black/36 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/36">
              {band.label}
            </span>
          ) : null}
        </div>
      ))}

      {chartOverlay.targetBand ? (
        <div
          className="pointer-events-none absolute left-0 right-[72px] z-[2] border-y border-emerald-300/18 bg-emerald-300/[0.055]"
          style={{
            top: chartOverlay.targetBand.top,
            height: chartOverlay.targetBand.height,
          }}
        />
      ) : null}
      {chartOverlay.riskBand ? (
        <div
          className="pointer-events-none absolute left-0 right-[72px] z-[2] border-y border-rose-300/20 bg-rose-300/[0.045]"
          style={{
            top: chartOverlay.riskBand.top,
            height: chartOverlay.riskBand.height,
          }}
        />
      ) : null}
      {chartOverlay.entryBand ? (
        <div
          className="pointer-events-none absolute left-0 right-[72px] z-[3] border-y border-sky-300/24 bg-sky-300/[0.055]"
          style={{
            top: chartOverlay.entryBand.top,
            height: chartOverlay.entryBand.height,
          }}
        />
      ) : null}
      {chartOverlay.triggerX !== null && chartOverlay.triggerX !== undefined ? (
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-[4] w-px bg-amber-300/60 shadow-[0_0_18px_rgba(251,191,36,0.45)]"
          style={{ left: chartOverlay.triggerX }}
        >
          <span className="absolute left-2 top-14 whitespace-nowrap rounded-full border border-amber-300/20 bg-amber-300/[0.12] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
            Trigger
          </span>
        </div>
      ) : null}

      {chartOverlay.eventMarkers.map((marker) => (
        <div
          key={marker.key}
          className="pointer-events-none absolute z-[8] -translate-x-1/2 -translate-y-1/2"
          style={{
            left: marker.x,
            top: Math.max(46, Math.min(marker.y, 5000)),
          }}
        >
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] shadow-xl backdrop-blur-md ${statusClass(marker.type)}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${dotClass(marker.type)}`}
            />
            {marker.label}
          </div>
          <div className="mt-1 hidden max-w-[190px] rounded-lg border border-white/10 bg-black/72 px-2 py-1 text-[10px] font-semibold leading-4 text-white/62 shadow-xl xl:block">
            {marker.text}
          </div>
        </div>
      ))}

      {chartOverlay.levelTags.map((tag) => (
        <div
          key={`${tag.key}-${tag.value}`}
          className="pointer-events-none absolute right-2 z-[7] flex items-center gap-1"
          style={{ top: Math.max(34, Math.min(tag.y - 10, 5000)) }}
        >
          <span
            className="h-px w-8 opacity-70"
            style={{ background: levelColor(tag.key) }}
          />
          <span
            className="rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-black shadow-lg"
            style={{ color: levelColor(tag.key) }}
          >
            {levelLabel(tag.key)} {formatPrice(tag.value)}
          </span>
        </div>
      ))}

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-120px)] flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-300/25 bg-black/62 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100 shadow-xl backdrop-blur-md">
          3D 5M · PRE/REG/POST + LIVE
        </span>
        <span className="rounded-full border border-cyan-300/20 bg-black/50 px-3 py-1 text-[10px] font-black text-cyan-100/80 shadow-xl backdrop-blur-md">
          PRE {sessionCount(historyMeta?.sessionStats, "premarket")} · REG{" "}
          {sessionCount(historyMeta?.sessionStats, "regular")} · POST{" "}
          {sessionCount(historyMeta?.sessionStats, "postmarket")}
        </span>
        <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-black text-white/58 shadow-xl backdrop-blur-md">
          {historyMeta?.loading
            ? "Грузим 3D историю"
            : `${candles.length} свечей · ${historyMeta?.tradingDates?.length || 0} дн.`}
        </span>
        <span className="rounded-full border border-emerald-300/20 bg-black/50 px-3 py-1 text-[10px] font-black text-emerald-100/80 shadow-xl backdrop-blur-md">
          {historyProviderLabel(historyMeta)}
        </span>
        <span className="rounded-full border border-sky-300/20 bg-black/50 px-3 py-1 text-[10px] font-black text-sky-100/80 shadow-xl backdrop-blur-md">
          SSE stream
        </span>
      </div>

      {hoverCandle ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/70 p-2 text-[10px] font-black text-white/76 shadow-2xl backdrop-blur-md">
          <span>O {formatPrice(hoverCandle.open)}</span>
          <span>H {formatPrice(hoverCandle.high)}</span>
          <span>L {formatPrice(hoverCandle.low)}</span>
          <span>C {formatPrice(hoverCandle.close)}</span>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
        {levelItems(levels).map((item) => (
          <span
            key={item.key}
            className="rounded-lg border border-white/10 bg-black/42 px-2.5 py-1 text-[10px] font-black text-white/72"
          >
            <span style={{ color: levelColor(item.key) }}>
              {levelLabel(item.key)}
            </span>{" "}
            {formatPrice(item.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TickerTape({ items }: { items: DeskItem[] }) {
  const tape = items.slice(0, 40);
  if (!tape.length) return null;
  return (
    <div className="se-ticker-tape h-[34px] shrink-0 overflow-hidden border-t border-white/10 bg-[#080d15] text-[11px] font-black text-white/70">
      <div className="se-ticker-track flex h-full min-w-max items-center gap-6 px-4">
        {[...tape, ...tape].map((item, index) => {
          const change = changeOf(item);
          const positive = Number.isFinite(Number(change)) && Number(change) >= 0;
          return (
            <div
              key={`${getSymbol(item)}-${index}`}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <span className="text-white/86">{getSymbol(item)}</span>
              <span className={positive ? "text-emerald-300" : "text-rose-300"}>
                {formatPercent(change)}
              </span>
              <span className="text-white/36">
                {formatPrice(priceOf(item))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SignalCockpitTab({ language }: { language: Language }) {
  const [overview, setOverview] = useState<CockpitValue | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selected, setSelected] = useState<CockpitSelected | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [deskFilter, setDeskFilter] = useState<
    "all" | "watch" | "armed" | "active" | "closed"
  >("all");
  const [deskSearch, setDeskSearch] = useState("");
  const [streamStatus, setStreamStatus] = useState<
    "connecting" | "live" | "reconnecting" | "off"
  >("connecting");
  const [liveEvents, setLiveEvents] = useState<LiveLifecycleEvent[]>([]);
  const [chartMode] = useState<ChartMode>("3d");
  const [historySession] = useState<ChartFocus>("all");
  const [historyCandles, setHistoryCandles] = useState<Candle[]>([]);
  const [historyMeta, setHistoryMeta] = useState<CockpitHistoryMeta>({
    loading: false,
    count: 0,
    rawCount: 0,
    days: 0,
    tradingDates: [],
    sessionStats: {},
    sourceStats: {},
    providerMode: "auto",
    providerLimitDetected: false,
    externalRows: 0,
  });

  const [calibrationPreview, setCalibrationPreview] =
    useState<CalibrationPreview | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [evidenceSnapshot, setEvidenceSnapshot] = useState<AnyRecord | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("skill-cockpit-locked");
    document.body.classList.add("skill-cockpit-locked");
    return () => {
      document.documentElement.classList.remove("skill-cockpit-locked");
      document.body.classList.remove("skill-cockpit-locked");
    };
  }, []);

  const deskItems = useMemo(() => mergeDeskItems(overview), [overview]);
  const filteredDeskItems = useMemo(() => {
    const q = deskSearch.trim().toUpperCase();
    return deskItems.filter((item) => {
      const symbol = getSymbol(item);
      const status = getStatus(item);
      const name = String(
        (item as CockpitWatchItem).name ||
          (item as CockpitSignal).setupName ||
          "",
      ).toUpperCase();
      const matchesSearch = !q || symbol.includes(q) || name.includes(q);
      const matchesFilter =
        deskFilter === "all" ||
        (deskFilter === "watch" && status === "WATCH") ||
        (deskFilter === "armed" &&
          ["ARMED", "WAITING_CONFIRMATION"].includes(status)) ||
        (deskFilter === "active" &&
          [
            "ACTIVE",
            "ENTRY_STILL_VALID",
            "STILL_VALID",
            "WAIT_FOR_REENTRY",
          ].includes(status)) ||
        (deskFilter === "closed" &&
          [
            "TP1_HIT",
            "TP2_HIT",
            "STOP_HIT",
            "INVALIDATED",
            "SESSION_CLOSE",
            "ENTRY_MISSED",
            "REJECT",
          ].includes(status));
      return matchesSearch && matchesFilter;
    });
  }, [deskItems, deskFilter, deskSearch]);

  const appendLiveEvent = useCallback((event: LiveLifecycleEvent) => {
    if (!event.key || !event.symbol || !event.type) return;
    setLiveEvents((prev) => {
      if (prev.some((item) => item.key === event.key)) return prev;
      return [event, ...prev].slice(0, 24);
    });
  }, []);

  const appendEventsFromSelected = useCallback(
    (incoming?: CockpitSelected | null, source = "cockpit_sse") => {
      const symbol = String(incoming?.symbol || "").toUpperCase();
      const timeline =
        incoming?.aiPanel?.timeline || incoming?.lifecycle?.timeline || [];
      const latest = timeline[timeline.length - 1];
      if (!symbol || !latest?.type || !latest?.at) return;
      appendLiveEvent({
        key: `${symbol}|${latest.type}|${latest.at}`,
        symbol,
        type: normalizeStatus(latest.type),
        at: latest.at,
        text: latest.text,
        status:
          incoming?.status || incoming?.lifecycle?.lifecycleStatus || null,
        price:
          incoming?.signal?.currentPrice ??
          incoming?.lifecycle?.currentPrice ??
          incoming?.chart?.snapshot?.latestPrice ??
          null,
        r: incoming?.signal?.currentR ?? incoming?.lifecycle?.currentR ?? null,
        source,
        serverTime: new Date().toISOString(),
      });
    },
    [appendLiveEvent],
  );

  const fetchCalibrationPreview = useCallback(async () => {
    setCalibrationLoading(true);
    try {
      const response = await fetch("/api/stock-engine/calibration/preview", {
        cache: "no-store",
      });
      const payload = await response.json();
      const value = payload?.value || payload;
      if (!response.ok || !payload?.ok || !value) {
        throw new Error(
          payload?.error || payload?.message || "Calibration preview unavailable",
        );
      }
      setCalibrationPreview(value);
    } catch {
      setCalibrationPreview(null);
    } finally {
      setCalibrationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalibrationPreview();
    const timer = window.setInterval(fetchCalibrationPreview, 60_000);
    return () => window.clearInterval(timer);
  }, [fetchCalibrationPreview]);

  const fetchEvidenceSnapshot = useCallback(async () => {
    setEvidenceLoading(true);
    try {
      const response = await fetch("/api/stock-engine/evidence/cache", {
        cache: "no-store",
      });
      const payload: AnyRecord = await response.json();
      const value = payload?.value || payload;

      if (!response.ok || !payload?.ok || !value?.ok) {
        throw new Error(
          payload?.error || payload?.message || "Evidence snapshot unavailable",
        );
      }

      setEvidenceSnapshot(value);
    } catch {
      setEvidenceSnapshot(null);
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvidenceSnapshot();
    const timer = window.setInterval(fetchEvidenceSnapshot, 60_000);
    return () => window.clearInterval(timer);
  }, [fetchEvidenceSnapshot]);

  const fetchOverview = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/stock-engine/cockpit?limit=160", {
        cache: "no-store",
      });
      const payload: CockpitApiResponse = await response.json();
      const value = normalizeCockpitValue(unwrapCockpitValue(payload as AnyRecord));
      if (!response.ok || !payload.ok || !value)
        throw new Error(
          payload.error || payload.message || "Cockpit unavailable",
        );
      setOverview(value);
      setLastUpdated(
        String(value.runtimeStatus?.updatedAt || new Date().toISOString()),
      );
      const first =
        selectedSymbol ||
        getSymbol(value.active?.items?.[0]) ||
        getSymbol(value.armed?.items?.[0]) ||
        getSymbol(value.watchlist?.items?.[0]) ||
        getSymbol(value.closed?.items?.[0]);
      if (first) setSelectedSymbol(first);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cockpit unavailable");
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol]);

  const loadSymbol = useCallback(
    async (symbol: string, silent = false) => {
      const clean = symbol.toUpperCase();
      if (!clean) return;
      if (!silent) setSelectedLoading(true);
      setSelectedSymbol(clean);
      try {
        const response = await fetch(
          `/api/stock-engine/cockpit/symbol/${encodeURIComponent(clean)}?include_candles=true`,
          { cache: "no-store" },
        );
        const payload: CockpitApiResponse = await response.json();
        if (response.ok && payload.ok && payload.selected?.found !== false) {
          setSelected(payload.selected || null);
          appendEventsFromSelected(
            payload.selected || null,
            "manual_symbol_load",
          );
          return;
        }
        throw new Error(
          payload.error || payload.message || "symbol route unavailable",
        );
      } catch {
        const fallbackItem = deskItems.find(
          (item) => getSymbol(item) === clean,
        );
        setSelected(fallbackSelected(clean, fallbackItem));
      } finally {
        if (!silent) setSelectedLoading(false);
      }
    },
    [deskItems, appendEventsFromSelected],
  );

  const loadHistory = useCallback(
    async (
      symbol: string,
      mode: ChartMode,
      requestedSession: ChartFocus = "all",
    ) => {
      const clean = symbol.toUpperCase();
      if (!clean || mode === "live") {
        setHistoryCandles([]);
        setHistoryMeta({
          loading: false,
          count: 0,
          rawCount: 0,
          days: 0,
          tradingDates: [],
          sessionStats: {},
          sourceStats: {},
          providerMode: "auto",
          providerLimitDetected: false,
          externalRows: 0,
        });
        return;
      }

      const days = mode === "3d" ? 3 : 1;
      setHistoryMeta((prev) => ({
        ...prev,
        loading: true,
        error: undefined,
        days,
      }));

      try {
        const response = await fetch(
          `/api/stock-engine/cockpit/history/${encodeURIComponent(clean)}?days=${days}&interval=5min&limit=2500&extended=true&session=${encodeURIComponent(requestedSession)}&provider=auto`,
          { cache: "no-store" },
        );
        const payload: CockpitHistoryResponse = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error || payload.message || "History unavailable",
          );
        }
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        setHistoryCandles(candles);
        setHistoryMeta({
          loading: false,
          count: candles.length,
          rawCount: Number(payload.rawCount || candles.length),
          days: Number(payload.days || days),
          tradingDates: payload.tradingDates || [],
          sessionStats: payload.sessionStats || {},
          sourceStats: payload.sourceStats || {},
          providerMode: String(payload.sourceStats?.providerMode || "auto"),
          providerLimitDetected: Boolean(
            payload.sourceStats?.providerLimitDetected,
          ),
          externalRows: Number(payload.sourceStats?.externalRows || 0),
          externalProviderStatus:
            payload.sourceStats?.externalProvider?.providerPayloadStatus ||
            null,
          storageVersion: payload.storageVersion,
        });
        if (payload.selected?.found !== false && payload.selected) {
          setSelected(payload.selected);
          appendEventsFromSelected(payload.selected, "history_load");
        }
      } catch (err) {
        setHistoryMeta({
          loading: false,
          count: 0,
          rawCount: 0,
          days,
          tradingDates: [],
          sessionStats: {},
          sourceStats: {},
          providerMode: "auto",
          providerLimitDetected: false,
          externalRows: 0,
          error: err instanceof Error ? err.message : "History unavailable",
        });
      }
    },
    [appendEventsFromSelected],
  );

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (selectedSymbol) loadSymbol(selectedSymbol);
  }, [selectedSymbol, loadSymbol]);

  useEffect(() => {
    if (selectedSymbol) loadHistory(selectedSymbol, chartMode, historySession);
  }, [selectedSymbol, chartMode, historySession, loadHistory]);

  useEffect(() => {
    setStreamStatus("connecting");

    const params = new URLSearchParams();
    params.set("limit", "160");
    params.set("interval", "5000");
    if (selectedSymbol) params.set("symbol", selectedSymbol);

    const stream = new EventSource(
      `/api/stock-engine/cockpit/stream?${params.toString()}`,
    );

    const applyPayload = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload?.ok) {
          setError(payload?.error || "SSE stream returned an empty payload");
          setStreamStatus("reconnecting");
          return;
        }

        const value = normalizeCockpitValue(unwrapCockpitValue(payload as AnyRecord));
        const incomingSelected =
          payload.selected || payload.value?.selected || null;

        if (value) {
          setOverview(value);
          setLastUpdated(
            String(
              payload.serverTime ||
                value.runtimeStatus?.updatedAt ||
                new Date().toISOString(),
            ),
          );
        }

        if (incomingSelected?.found !== false) {
          setSelected(incomingSelected);
          appendEventsFromSelected(incomingSelected, "cockpit_sse");
        }

        const first =
          selectedSymbol ||
          getSymbol(incomingSelected) ||
          getSymbol(value?.active?.items?.[0]) ||
          getSymbol(value?.armed?.items?.[0]) ||
          getSymbol(value?.watchlist?.items?.[0]) ||
          getSymbol(value?.closed?.items?.[0]);

        if (!selectedSymbol && first) setSelectedSymbol(first);
        setLoading(false);
        setSelectedLoading(false);
        setError("");
        setStreamStatus("live");
      } catch (err) {
        setError(err instanceof Error ? err.message : "SSE parse error");
        setStreamStatus("reconnecting");
      }
    };

    const applyLifecycleEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload?.ok) return;
        appendLiveEvent({
          key: String(
            payload.eventKey ||
              `${payload.symbol}|${payload.eventType}|${payload.at}`,
          ),
          symbol: String(payload.symbol || selectedSymbol || "").toUpperCase(),
          type: normalizeStatus(payload.eventType || payload.lifecycleStatus),
          at: String(
            payload.at || payload.serverTime || new Date().toISOString(),
          ),
          text: payload.text || payload.guidance?.[0] || null,
          status: payload.lifecycleStatus || null,
          price: payload.currentPrice ?? null,
          r: payload.currentR ?? null,
          source: "lifecycle_sse",
          serverTime: payload.serverTime || null,
        });
      } catch {}
    };

    stream.addEventListener("cockpit", applyPayload);
    stream.addEventListener("lifecycle", applyLifecycleEvent);
    stream.onmessage = applyPayload;
    stream.onerror = () => {
      setStreamStatus("reconnecting");
    };
    stream.onopen = () => {
      setStreamStatus("live");
    };

    return () => {
      setStreamStatus("off");
      stream.close();
    };
  }, [selectedSymbol, appendEventsFromSelected, appendLiveEvent]);

  const selectedWatch = selected?.watchItem || null;
  const selectedSignal = selected?.signal || null;
  const selectedLifecycle = selected?.lifecycle || null;
  const snapshot = selected?.chart?.snapshot || null;
  const levels =
    selected?.chart?.levels || selectedLifecycle?.chartLevels || {};
  const confirmations = confirmationRows(snapshot);
  const timeline =
    selected?.aiPanel?.timeline || selectedLifecycle?.timeline || [];
  const guidance =
    selected?.aiPanel?.guidance ||
    selectedSignal?.guidance ||
    selectedLifecycle?.guidance ||
    [];
  const nextActions =
    selected?.aiPanel?.nextActions ||
    selectedSignal?.nextActions ||
    selectedLifecycle?.nextActions ||
    [];
  const runtime = overview?.runtimeStatus || {};
  const watchCount = Number(
    runtime.watchCount ?? overview?.watchlist?.count ?? 0,
  );
  const armedCount = Number(runtime.armedCount ?? overview?.armed?.count ?? 0);
  const activeCount = Number(
    runtime.actionableActiveCount ??
      runtime.activeCount ??
      overview?.active?.count ??
      0,
  );
  const closedCount = Number(
    runtime.closedActiveCount ?? overview?.closed?.count ?? 0,
  );
  const lifecycleCount = Number(
    runtime.lifecycleCount ?? overview?.lifecycle?.count ?? 0,
  );
  const selectedStatus =
    selected?.aiPanel?.headline ||
    selected?.status ||
    selectedSignal?.qualityStatus ||
    "WATCH";
  const selectedSignalRecord = (selectedSignal || {}) as AnyRecord;
  const selectedLifecycleRecord = (selectedLifecycle || {}) as AnyRecord;
  const selectedWatchRecord = (selectedWatch || {}) as AnyRecord;

  const currentPrice = firstFiniteNumber(
    selectedSignalRecord.currentPrice,
    selectedLifecycleRecord.currentPrice,
    selectedWatchRecord.price,
    selectedWatchRecord.currentPrice,
    snapshot?.latestPrice,
    selectedSignalRecord.entry,
  );

  const currentR =
    firstFiniteNumber(
      selectedSignalRecord.currentR,
      selectedLifecycleRecord.currentR,
      selectedWatchRecord.currentR,
    ) ??
    deriveCurrentRFromTrade({
      currentPrice,
      entry: levels?.entry ?? selectedSignalRecord.entry,
      stop: levels?.stop ?? selectedSignalRecord.stop,
      direction:
        selectedSignalRecord.direction ??
        selectedLifecycleRecord.direction ??
        selectedWatchRecord.direction,
    });

  const tradeManagement = {
    ...selectedWatchRecord,
    ...selectedLifecycleRecord,
    ...selectedSignalRecord,
    watchItem: selectedWatch,
    currentPrice,
    currentR,
    currentPriceSource:
      selectedSignalRecord.currentPriceSource ??
      selectedLifecycleRecord.currentPriceSource ??
      selectedWatchRecord.currentPriceSource ??
      (selectedWatchRecord.price !== null && selectedWatchRecord.price !== undefined
        ? "watch.price"
        : null),
    currentPriceUpdatedAt:
      selectedSignalRecord.currentPriceUpdatedAt ??
      selectedLifecycleRecord.currentPriceUpdatedAt ??
      selectedWatchRecord.currentPriceUpdatedAt ??
      selectedWatchRecord.priceUpdatedAt ??
      selectedWatchRecord.updatedAt ??
      null,
    priceUpdatedAt:
      selectedSignalRecord.priceUpdatedAt ??
      selectedLifecycleRecord.priceUpdatedAt ??
      selectedWatchRecord.priceUpdatedAt ??
      selectedWatchRecord.updatedAt ??
      null,
    priceAgeSeconds:
      selectedSignalRecord.priceAgeSeconds ??
      selectedLifecycleRecord.priceAgeSeconds ??
      selectedWatchRecord.priceAgeSeconds ??
      null,
    priceFreshness:
      selectedSignalRecord.priceFreshness ??
      selectedLifecycleRecord.priceFreshness ??
      selectedWatchRecord.priceFreshness ??
      (selectedWatchRecord.price !== null && selectedWatchRecord.price !== undefined
        ? "FRESH"
        : null),
    priceFreshnessReason:
      selectedSignalRecord.priceFreshnessReason ??
      selectedLifecycleRecord.priceFreshnessReason ??
      selectedWatchRecord.priceFreshnessReason ??
      null,
    stalePriceBlocked:
      selectedSignalRecord.stalePriceBlocked ??
      selectedLifecycleRecord.stalePriceBlocked ??
      selectedWatchRecord.stalePriceBlocked ??
      false,
    managementState:
      selectedSignalRecord.managementState ??
      selectedLifecycleRecord.managementState ??
      selectedWatchRecord.managementState ??
      selectedSignalRecord.entryStatus ??
      selectedLifecycleRecord.entryStatus ??
      selectedWatchRecord.entryStatus ??
      selectedStatus,
    entryStatus:
      selectedSignalRecord.entryStatus ??
      selectedLifecycleRecord.entryStatus ??
      selectedWatchRecord.entryStatus ??
      null,
  } as AnyRecord;
  const managementState = String(
    tradeManagement.managementState || tradeManagement.entryStatus || selectedStatus || "",
  ).trim();
  const tradeAction = String(tradeManagement.tradeAction || "").trim();
  const priceFreshness = String(
    tradeManagement.priceFreshness || "UNKNOWN",
  ).toUpperCase();
  const priceAgeSeconds = tradeManagement.priceAgeSeconds;
  const stalePriceBlocked = boolish(tradeManagement.stalePriceBlocked);
  const lateSessionBlocked = boolish(tradeManagement.lateSessionBlocked);
  const marketClosedNewEntryBlocked = boolish(
    tradeManagement.marketClosedNewEntryBlocked,
  );
  const selectedIsActionable =
    tradeManagement.isActionable ?? selected?.aiPanel?.isActionable ?? null;
  const strictEligible = tradeManagement.strictEligible ?? null;
  const managementReasons = stringList(tradeManagement.managementReasons);
  const strictBlockedReasons = stringList(tradeManagement.strictBlockedReasons);
  const visibleBlockReasons = strictBlockedReasons.length
    ? strictBlockedReasons
    : managementReasons;
  const managementTone = managementToneFromRecord({
    ...tradeManagement,
    currentR,
    managementState,
    tradeAction,
    stalePriceBlocked,
    lateSessionBlocked,
    marketClosedNewEntryBlocked,
    isActionable: selectedIsActionable,
  });
  const managementActionText = tradeAction
    ? labelFromSnake(tradeAction)
    : selectedIsActionable === true
      ? "candidate still valid"
      : "monitor only";
  const calibrationRun = calibrationPreview?.run || {};
  const calibrationSummary = calibrationPreview?.cockpitSummary || {};
  const calibrationRows = calibrationPreview?.previewRows || [];
  const calibrationNegativeRows = calibrationPreview?.negativeWatchRows || [];
  const calibrationBlockers =
    calibrationPreview?.safety?.globalBlockers || [];
  const evidenceSummary = evidenceSnapshot?.investorSummary || {};
  const evidenceSelected = Array.isArray(evidenceSnapshot?.selectedBestIdeas)
    ? evidenceSnapshot?.selectedBestIdeas || []
    : [];
  const evidenceBestSetups = Array.isArray(
    evidenceSnapshot?.setupEvidence?.bestByAvgRClosed,
  )
    ? evidenceSnapshot?.setupEvidence?.bestByAvgRClosed || []
    : [];
  const evidenceWeakSetups = Array.isArray(
    evidenceSnapshot?.setupEvidence?.weakByAvgRClosed,
  )
    ? evidenceSnapshot?.setupEvidence?.weakByAvgRClosed || []
    : [];
  const evidenceTelegramBlockers = Array.isArray(
    evidenceSummary?.whyTelegramMayBeZero,
  )
    ? evidenceSummary?.whyTelegramMayBeZero || []
    : Array.isArray(evidenceSnapshot?.monitoringSummary?.telegramBlockedByReason)
      ? evidenceSnapshot?.monitoringSummary?.telegramBlockedByReason || []
      : [];

  return (
    <section className="skill-cockpit-terminal fixed inset-0 z-[60] flex h-screen w-screen flex-col overflow-hidden bg-[#05070d] text-white">
      <style jsx global>{`
        html.skill-cockpit-locked,
        body.skill-cockpit-locked {
          height: 100% !important;
          overflow: hidden !important;
        }
        .skill-cockpit-terminal {
          font-family:
            Montserrat,
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }
        .skill-cockpit-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 192, 118, 0.85) rgba(255, 255, 255, 0.05);
        }
        .skill-cockpit-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .skill-cockpit-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 192, 118, 0.78);
          border-radius: 999px;
        }
        .skill-cockpit-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 999px;
        }
        .skill-watchlist .skill-watchlist-scroll {
          overflow-y: hidden;
        }
        .skill-watchlist:hover .skill-watchlist-scroll {
          overflow-y: auto;
        }
        .se-ticker-track {
          animation: se-ticker-move 46s linear infinite;
        }
        .se-ticker-tape:hover .se-ticker-track {
          animation-play-state: paused;
        }
        @keyframes se-ticker-move {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>

      <div className="flex h-[46px] shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b1018] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-sm font-black text-emerald-200">
            SE
          </div>
          <div className="text-sm font-black tracking-[-0.02em] text-white">
            SkillEdge AI Desk
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.10] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/82">
            Holly-like cockpit
          </span>
        </div>

        <div className="ml-4 hidden min-w-0 flex-1 items-center gap-2 overflow-hidden xl:flex">
          {deskItems.slice(0, 10).map((item) => {
            const change = changeOf(item);
            const positive = Number.isFinite(Number(change)) && Number(change) >= 0;
            return (
              <button
                key={`top-${getSymbol(item)}`}
                type="button"
                onClick={() => loadSymbol(getSymbol(item))}
                className="shrink-0 rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[11px] font-black transition hover:bg-white/[0.07]"
              >
                <span className="text-white/80">{getSymbol(item)}</span>{" "}
                <span
                  className={positive ? "text-emerald-300" : "text-rose-300"}
                >
                  {formatPercent(change)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] sm:inline-flex ${
              streamStatus === "live"
                ? "border-emerald-300/25 bg-emerald-300/[0.10] text-emerald-100"
                : streamStatus === "reconnecting"
                  ? "border-amber-300/25 bg-amber-300/[0.10] text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-white/42"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                streamStatus === "live"
                  ? "bg-emerald-300"
                  : streamStatus === "reconnecting"
                    ? "bg-amber-300"
                    : "bg-white/40"
              }`}
            />
            {streamStatus === "live"
              ? "SSE live"
              : streamStatus === "reconnecting"
                ? "Reconnect"
                : "Stream"}
          </span>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-white/42 sm:inline-flex">
            Updated: {formatDateTime(lastUpdated)}
          </span>
          <button
            type="button"
            onClick={fetchOverview}
            disabled={loading}
            className="rounded-lg border border-emerald-300/22 bg-emerald-300/[0.12] px-3 py-2 text-[11px] font-black text-emerald-50 transition hover:bg-emerald-300/[0.18] disabled:opacity-50"
          >
            {loading ? "Обновляем..." : "Обновить"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 gap-3 p-3" style={terminalGridStyle}>
        <aside className="skill-cockpit-scroll min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#0b121d] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/55">
                  AI сопровождение
                </div>
                <div className="mt-1 text-lg font-black tracking-[-0.04em]">
                  {labelStatus(selectedStatus)}
                </div>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${statusClass(selectedStatus)}`}
              >
                {labelStatus(selectedStatus)}
              </span>
            </div>
            <div className="mt-3 rounded-xl bg-black/22 p-3 text-sm font-semibold leading-6 text-white/74">
              {guidance[0]
                ? translateText(guidance[0])
                : "Выбери тикер из watchlist. AI покажет план, риск и условия входа."}
            </div>
          </Card>

          <Card title="Trade management" className="mt-3">
            <div className={`rounded-xl border p-3 ${managementBadgeClass(managementTone)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">
                    Live action
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-black leading-5">
                    {managementActionText}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-black/22 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em]">
                  {labelFromSnake(managementState)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <SmallMetric
                  label="Current R"
                  value={formatSignedR(currentR)}
                  tone={Number(currentR) >= 0 ? "good" : "bad"}
                />
                <SmallMetric
                  label="Freshness"
                  value={priceFreshness}
                  tone={priceFreshnessTone(priceFreshness)}
                />
                <SmallMetric
                  label="Price age"
                  value={formatPriceAge(priceAgeSeconds)}
                  tone={stalePriceBlocked ? "bad" : "info"}
                />
                <SmallMetric
                  label="Actionable"
                  value={
                    selectedIsActionable === true
                      ? "YES"
                      : selectedIsActionable === false
                        ? "NO"
                        : "—"
                  }
                  tone={
                    selectedIsActionable === true
                      ? "good"
                      : selectedIsActionable === false
                        ? "bad"
                        : "info"
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${priceFreshnessClass(priceFreshness)}`}>
                  {priceFreshness}
                </span>
                {strictEligible === false ? (
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/[0.10] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-amber-100">
                    strict blocked
                  </span>
                ) : null}
                {lateSessionBlocked ? (
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/[0.10] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-amber-100">
                    late session
                  </span>
                ) : null}
                {marketClosedNewEntryBlocked ? (
                  <span className="rounded-full border border-rose-300/25 bg-rose-300/[0.10] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-rose-100">
                    market closed
                  </span>
                ) : null}
              </div>

              <div className="mt-3 space-y-1.5">
                {visibleBlockReasons.length ? (
                  visibleBlockReasons.slice(0, 4).map((reason, index) => (
                    <div
                      key={`${reason}-${index}`}
                      className="rounded-lg border border-white/10 bg-black/24 px-2.5 py-2 text-[11px] font-semibold leading-4 text-white/64"
                    >
                      {labelFromSnake(reason)}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-emerald-300/14 bg-emerald-300/[0.055] px-2.5 py-2 text-[11px] font-semibold leading-4 text-emerald-50/70">
                    No live blockers from the trade-management guard.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Что делать дальше" className="mt-3">
            <div className="space-y-2">
              {(nextActions.length
                ? nextActions
                : [
                    "Ждать подтверждение. Не входить без setup + risk/reward + invalidation.",
                  ]
              )
                .slice(0, 3)
                .map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-xl border border-cyan-300/12 bg-cyan-300/[0.06] p-3 text-sm font-semibold leading-6 text-cyan-50/75"
                  >
                    {translateText(item)}
                  </div>
                ))}
            </div>
          </Card>

          <Card title="План сделки" className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric
                label="Вход"
                value={formatPrice(levels?.entry ?? selectedSignal?.entry)}
              />
              <SmallMetric
                label="Стоп"
                value={formatPrice(levels?.stop ?? selectedSignal?.stop)}
                tone="bad"
              />
              <SmallMetric
                label="TP1"
                value={formatPrice(levels?.tp1 ?? selectedSignal?.tp1)}
                tone="good"
              />
              <SmallMetric
                label="TP2"
                value={formatPrice(levels?.tp2 ?? selectedSignal?.tp2)}
                tone="good"
              />
              <SmallMetric
                label="VWAP"
                value={formatPrice(levels?.vwap ?? snapshot?.vwap)}
                tone="info"
              />
              <SmallMetric
                label="EMA20"
                value={formatPrice(levels?.ema20_5m ?? snapshot?.ema20_5m)}
                tone="info"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SmallMetric
                label="R сейчас"
                value={formatSignedR(currentR)}
                tone={Number(currentR) >= 0 ? "good" : "bad"}
              />
              <SmallMetric
                label="Score"
                value={formatNumber(
                  selectedSignal?.score ?? selectedWatch?.inPlayScore,
                  0,
                )}
              />
            </div>
          </Card>

          <Card title="Жизнь идеи" className="mt-3">
            <div className="space-y-3">
              {timeline.length ? (
                timeline.slice(-5).map((event, index) => (
                  <div
                    key={`${event.type}-${event.at}-${index}`}
                    className="relative border-l border-emerald-300/28 pl-4"
                  >
                    <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100/72">
                      {labelStatus(event.type)}
                    </div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-white/62">
                      {translateText(event.text)}
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-white/35">
                      {formatTime(event.at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-black/20 p-3 text-sm font-semibold text-white/42">
                  Timeline появится после ACTIVE/lifecycle event.
                </div>
              )}
            </div>
          </Card>

          <Card title="Live event bus" className="mt-3">
            <div className="space-y-2">
              {liveEvents.length ? (
                liveEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.key}
                    className="rounded-xl border border-white/10 bg-black/18 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${dotClass(event.type)}`}
                        />
                        <span className="truncate text-xs font-black text-white/82">
                          {event.symbol} · {labelStatus(event.type)}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-white/35">
                        {formatTime(event.at)}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-white/48">
                      {translateText(event.text)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-black/20 p-3 text-sm font-semibold text-white/42">
                  Live lifecycle events появятся здесь: TP1, TP2, stop,
                  invalidated, session close.
                </div>
              )}
            </div>
          </Card>

          <Card title="Self-learning preview" className="mt-3">
            <div className="rounded-xl border border-amber-300/18 bg-amber-300/[0.06] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/58">
                    Calibration
                  </div>
                  <div className="mt-1 text-sm font-black text-white">
                    {calibrationSummary.state || "REPORT_ONLY"}
                  </div>
                </div>
                <span className="rounded-full border border-white/10 bg-black/22 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white/58">
                  {calibrationLoading ? "Loading" : "Dry-run"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <SmallMetric
                  label="Closed"
                  value={formatNumber(calibrationRun.closedCount, 0)}
                />
                <SmallMetric
                  label="Win rate"
                  value={formatPercent(calibrationRun.winRateClosed)}
                  tone={
                    Number(calibrationRun.winRateClosed) >= 50
                      ? "good"
                      : "bad"
                  }
                />
                <SmallMetric
                  label="Warnings"
                  value={formatNumber(calibrationRun.negativeWatchCount, 0)}
                  tone={
                    Number(calibrationRun.negativeWatchCount) > 0
                      ? "bad"
                      : "good"
                  }
                />
                <SmallMetric
                  label="Ready"
                  value={formatNumber(calibrationRun.readyToApplyCount, 0)}
                  tone={
                    Number(calibrationRun.readyToApplyCount) > 0
                      ? "good"
                      : "info"
                  }
                />
              </div>

              <div className="mt-3 text-xs font-semibold leading-5 text-white/58">
                {calibrationSummary.copy ||
                  "No engine weights were changed. Preview is report-only."}
              </div>

              {calibrationBlockers.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {calibrationBlockers.slice(0, 4).map((blocker) => (
                    <span
                      key={blocker}
                      className="rounded-full border border-rose-300/20 bg-rose-300/[0.07] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-rose-100/76"
                    >
                      {blocker.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {(calibrationNegativeRows.length
                ? calibrationNegativeRows
                : calibrationRows
              )
                .slice(0, 4)
                .map((row) => (
                  <div
                    key={`${row.setupSlug}-${row.action}`}
                    className="rounded-xl border border-white/10 bg-black/20 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-xs font-black text-white/82">
                        {row.setupSlug}
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${
                          row.applyState === "BLOCKED_NEGATIVE_WATCH"
                            ? "border-rose-300/24 bg-rose-300/[0.08] text-rose-100"
                            : "border-white/10 bg-white/[0.06] text-white/52"
                        }`}
                      >
                        {row.action || "OBSERVE"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] font-bold text-white/46">
                      <div>Closed {formatNumber(row.closedCount, 0)}</div>
                      <div>W {formatNumber(row.workedCount, 0)}</div>
                      <div>F {formatNumber(row.failedCount, 0)}</div>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-white/42">
                      {(row.blockReasons || [])
                        .slice(0, 3)
                        .join(" · ")
                        .replaceAll("_", " ") || row.applyState}
                    </div>
                  </div>
                ))}
            </div>
          </Card>


          <Card title="Evidence snapshot" className="mt-3">
            <div className="rounded-xl border border-emerald-300/18 bg-emerald-300/[0.055] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                    Forward-test proof
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-black leading-5 text-white">
                    {evidenceSnapshot?.headline ||
                      (evidenceLoading
                        ? "Loading evidence..."
                        : "Evidence snapshot unavailable")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchEvidenceSnapshot}
                  disabled={evidenceLoading}
                  className="shrink-0 rounded-lg border border-white/10 bg-black/24 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-white/62 transition hover:bg-white/[0.07] disabled:opacity-50"
                >
                  {evidenceLoading ? "..." : "Refresh"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <SmallMetric
                  label="Selected"
                  value={formatNumber(evidenceSummary?.selectedBestCount, 0)}
                  tone="good"
                />
                <SmallMetric
                  label="Closed"
                  value={formatNumber(evidenceSummary?.globalClosedOutcomes, 0)}
                  tone="info"
                />
                <SmallMetric
                  label="Winrate"
                  value={`${formatNumber(evidenceSummary?.globalWinRateClosed, 2)}%`}
                  tone="info"
                />
                <SmallMetric
                  label="Avg R"
                  value={formatSignedR(evidenceSummary?.globalAvgResultRClosed)}
                  tone={
                    Number(evidenceSummary?.globalAvgResultRClosed) >= 0
                      ? "good"
                      : "bad"
                  }
                />
              </div>

              {evidenceSelected.length ? (
                <div className="mt-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">
                    Selected ideas
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {evidenceSelected.slice(0, 5).map((idea: AnyRecord) => (
                      <span
                        key={`${idea.symbol}-${idea.setupSlug}-${idea.rank}`}
                        className="rounded-full border border-white/10 bg-black/24 px-2 py-1 text-[10px] font-black text-white/72"
                        title={String(idea.setupSlug || "")}
                      >
                        {idea.symbol} {formatSignedR(idea.currentR)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-2">
                {evidenceBestSetups.slice(0, 2).map((row: AnyRecord) => (
                  <div
                    key={`best-${row.setupSlug}`}
                    className="rounded-xl border border-emerald-300/14 bg-black/20 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-black text-white/76">
                        {labelFromSnake(row.setupSlug)}
                      </span>
                      <span className="shrink-0 text-[11px] font-black text-emerald-200">
                        {formatSignedR(row.avgResultRClosed)}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] font-semibold text-white/38">
                      {formatNumber(row.winRateClosed, 2)}% WR / {formatNumber(row.closed, 0)} closed
                    </div>
                  </div>
                ))}
              </div>

              {evidenceTelegramBlockers.length ? (
                <div className="mt-3 rounded-xl border border-amber-300/16 bg-amber-300/[0.055] p-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-100/70">
                    Why Telegram = 0
                  </div>
                  <div className="mt-1 space-y-1">
                    {evidenceTelegramBlockers.slice(0, 2).map((row: AnyRecord) => (
                      <div
                        key={String(row.reason)}
                        className="line-clamp-1 text-[11px] font-semibold text-white/58"
                      >
                        {labelFromSnake(row.reason)} · {formatNumber(row.count, 0)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {evidenceWeakSetups.length ? (
                <div className="mt-3 text-[10px] font-semibold leading-4 text-white/36">
                  Weak watch: {labelFromSnake(evidenceWeakSetups[0]?.setupSlug)}{" "}
                  {formatSignedR(evidenceWeakSetups[0]?.avgResultRClosed)}
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Спросить AI" className="mt-3">
            <div className="grid gap-2">
              {(
                selected?.aiPanel?.questionContext?.supportedQuestions ||
                Object.keys(QUESTIONS_RU)
              )
                .slice(0, 5)
                .map((question: string) => (
                  <button
                    key={question}
                    type="button"
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-xs font-bold leading-5 text-white/66 transition hover:border-amber-300/25 hover:bg-amber-300/[0.07]"
                  >
                    {QUESTIONS_RU[question] || question}
                  </button>
                ))}
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-5 text-white/38">
              Полный AI-чат подключим в S4.20. Сейчас ответы идут через
              rules-first поля engine.
            </p>
          </Card>
        </aside>

        <main className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#090f19] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex h-[112px] shrink-0 flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
              <div className="flex min-h-0 items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="max-w-[220px] truncate text-4xl font-black tracking-[-0.075em] text-white">
                      {selected?.symbol || selectedSymbol || "—"}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(selected?.status || selectedStatus)}`}
                    >
                      {labelStatus(selected?.status || selectedStatus)}
                    </span>
                    {selectedSignal?.grade ? (
                      <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/[0.10] px-3 py-1 text-[10px] font-black text-amber-100">
                        {selectedSignal.grade}
                      </span>
                    ) : null}
                    {managementState ? (
                      <span
                        title={managementActionText}
                        className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${managementBadgeClass(managementTone)}`}
                      >
                        {labelFromSnake(managementState)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 max-w-[520px] truncate text-xs font-semibold text-white/45">
                    {selectedWatch?.name ||
                      setupLabel(
                        selectedSignal?.setupName,
                        selectedSignal?.setupSlug,
                      ) ||
                      "Выбери тикер справа"}
                  </div>
                </div>

                <div className="grid w-[420px] shrink-0 grid-cols-4 gap-2">
                  <SmallMetric label="Цена" value={formatPrice(currentPrice)} />
                  <SmallMetric
                    label="R"
                    value={formatSignedR(currentR)}
                    tone={Number(currentR) >= 0 ? "good" : "bad"}
                  />
                  <SmallMetric
                    label="Score"
                    value={formatNumber(
                      selectedSignal?.score ?? selectedWatch?.inPlayScore,
                      0,
                    )}
                  />
                  <SmallMetric
                    label="Volume"
                    value={formatCompact(selectedWatch?.volume)}
                  />
                </div>
              </div>

              <div className="flex min-h-0 items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
                <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-[0.10em] text-emerald-50">
                  3D 5M история + live
                </div>
                <div className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white/54">
                  {historyMeta?.loading
                    ? "Грузим 3 дня 5m свечей: premarket + regular + postmarket"
                    : `${historyMeta?.count || 0} свечей / ${historyMeta?.tradingDates?.length || 0} дн. · PRE ${sessionCount(historyMeta?.sessionStats, "premarket")} · REG ${sessionCount(historyMeta?.sessionStats, "regular")} · POST ${sessionCount(historyMeta?.sessionStats, "postmarket")} · ${historyProviderLabel(historyMeta)}`}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {selected ? (
                <TerminalChart
                  symbol={selected?.symbol || selectedSymbol}
                  snapshot={snapshot}
                  levels={levels}
                  entryZone={selectedSignal?.entryZone}
                  direction={selectedSignal?.direction}
                  triggerTime={
                    selectedLifecycle?.triggerTime ||
                    selectedSignal?.triggerTime ||
                    selectedSignal?.createdAt
                  }
                  timeline={timeline}
                  historyCandles={historyCandles}
                  chartMode={chartMode}
                  historyMeta={historyMeta}
                  historySession={historySession}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-[#080f19] text-sm font-semibold text-white/45">
                  {selectedLoading || loading
                    ? "Загружаем график..."
                    : "Выбери тикер справа."}
                </div>
              )}
            </div>

            <div className="grid h-[94px] shrink-0 grid-cols-4 gap-2 overflow-hidden">
              {confirmations.length ? (
                confirmations.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-2xl border border-white/10 bg-[#111923] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-black text-white">
                        {confirmationLabel(row.key)}
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${row.detected ? "bg-emerald-300/18 text-emerald-100" : "bg-white/[0.08] text-white/45"}`}
                      >
                        {row.detected ? "Есть" : "Ждём"}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-white/45">
                      {translateText(row.reason)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-4 rounded-2xl border border-white/10 bg-[#111923] p-4 text-sm font-semibold text-white/42">
                  Confirmations появятся после загрузки candle context.
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="skill-watchlist min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b121d] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">
                    AI Watchlist
                  </div>
                  <div className="mt-1 text-xl font-black text-white">
                    {filteredDeskItems.length}/{deskItems.length} тикеров
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-right text-[10px] font-black text-white/62">
                  <span className="rounded-lg bg-white/[0.045] px-2 py-1">
                    W {watchCount}
                  </span>
                  <span className="rounded-lg bg-sky-300/[0.10] px-2 py-1 text-sky-100">
                    A {armedCount}
                  </span>
                  <span className="rounded-lg bg-emerald-300/[0.10] px-2 py-1 text-emerald-100">
                    Live {activeCount}
                  </span>
                  <span className="rounded-lg bg-amber-300/[0.10] px-2 py-1 text-amber-100">
                    Closed {closedCount}
                  </span>
                </div>
              </div>

              <input
                value={deskSearch}
                onChange={(event) => setDeskSearch(event.target.value)}
                placeholder="Поиск тикера..."
                className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-black/24 px-3 text-sm font-bold text-white outline-none placeholder:text-white/28 focus:border-emerald-300/35"
              />

              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {[
                  ["all", "Все"],
                  ["watch", "Watch"],
                  ["armed", "Armed"],
                  ["active", "Active"],
                  ["closed", "Closed"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDeskFilter(key as any)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.06em] transition ${deskFilter === key ? "bg-emerald-300/18 text-emerald-50" : "bg-white/[0.045] text-white/42 hover:bg-white/[0.07]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="skill-watchlist-scroll skill-cockpit-scroll mt-3 min-h-0 flex-1 space-y-2 pr-1">
              {filteredDeskItems.length ? (
                filteredDeskItems.map((item) => {
                  const symbol = getSymbol(item);
                  const status = getStatus(item);
                  const active = selectedSymbol === symbol;
                  const name = isSignal(item)
                    ? setupLabel(item.setupName, item.setupSlug)
                    : item.name || "";
                  const change = changeOf(item);
                  const managementRecord = item as AnyRecord;
                  const itemCurrentR = managementRecord.currentR ?? null;
                  const itemFreshness = String(
                    managementRecord.priceFreshness || "UNKNOWN",
                  ).toUpperCase();
                  const itemManagementState = String(
                    managementRecord.managementState ||
                      managementRecord.entryStatus ||
                      status ||
                      "",
                  ).trim();
                  const itemTradeAction = String(
                    managementRecord.tradeAction || "",
                  ).trim();
                  const itemActionable = managementRecord.isActionable ?? null;
                  const itemStrictEligible =
                    managementRecord.strictEligible ?? null;
                  const itemStaleBlocked = boolish(
                    managementRecord.stalePriceBlocked,
                  );
                  const itemLateBlocked = boolish(
                    managementRecord.lateSessionBlocked,
                  );
                  const itemMarketClosedBlocked = boolish(
                    managementRecord.marketClosedNewEntryBlocked,
                  );
                  const itemStrictReasons = stringList(
                    managementRecord.strictBlockedReasons,
                  );
                  const itemManagementReasons = stringList(
                    managementRecord.managementReasons,
                  );
                  const itemReasons = itemStrictReasons.length
                    ? itemStrictReasons
                    : itemManagementReasons;
                  const itemTone = managementToneFromRecord({
                    ...managementRecord,
                    currentR: itemCurrentR,
                    managementState: itemManagementState,
                    tradeAction: itemTradeAction,
                    stalePriceBlocked: itemStaleBlocked,
                    lateSessionBlocked: itemLateBlocked,
                    marketClosedNewEntryBlocked: itemMarketClosedBlocked,
                    isActionable: itemActionable,
                  });
                  const itemActionLabel = itemTradeAction
                    ? labelFromSnake(itemTradeAction)
                    : itemActionable === true
                      ? "candidate"
                      : itemStrictEligible === false
                        ? "monitor only"
                        : itemManagementState
                          ? labelFromSnake(itemManagementState)
                          : "watch";
                  return (
                    <button
                      key={`${symbol}-${status}-${scoreOf(item)}`}
                      type="button"
                      onClick={() => loadSymbol(symbol)}
                      className={`group w-full rounded-2xl border p-3 text-left transition ${
                        active
                          ? "border-emerald-300/45 bg-emerald-300/[0.13] shadow-lg shadow-emerald-950/25"
                          : "border-white/10 bg-white/[0.035] hover:border-sky-300/28 hover:bg-sky-300/[0.07]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-lg font-black tracking-[-0.03em] text-white">
                            {symbol}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-white/45">
                            {name}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${statusClass(status)}`}
                        >
                          {labelStatus(status)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-bold text-white/60">
                        <div>{formatPrice(priceOf(item))}</div>
                        <div
                          className={
                            Number.isFinite(Number(change)) && Number(change) >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }
                        >
                          {formatPercent(change)}
                        </div>
                        <div>
                          {formatCompact((item as CockpitWatchItem).volume)}
                        </div>
                        <div className="text-right">
                          {formatNumber(scoreOf(item), 0)}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span
                          title={itemActionLabel}
                          className={`max-w-full truncate rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] ${managementBadgeClass(itemTone)}`}
                        >
                          {itemActionLabel}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] ${priceFreshnessClass(itemFreshness)}`}
                        >
                          {itemFreshness}
                        </span>
                        {Number.isFinite(Number(itemCurrentR)) ? (
                          <span
                            className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] ${
                              Number(itemCurrentR) >= 0
                                ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
                                : "border-rose-300/20 bg-rose-300/[0.08] text-rose-100"
                            }`}
                          >
                            {formatSignedR(itemCurrentR)}
                          </span>
                        ) : null}
                        {itemStrictEligible === false ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] text-amber-100">
                            blocked
                          </span>
                        ) : null}
                        {itemStaleBlocked ? (
                          <span className="rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] text-rose-100">
                            stale
                          </span>
                        ) : null}
                        {itemLateBlocked ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] text-amber-100">
                            late
                          </span>
                        ) : null}
                        {itemMarketClosedBlocked ? (
                          <span className="rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-2 py-1 text-[9px] font-black uppercase tracking-[0.055em] text-rose-100">
                            closed
                          </span>
                        ) : null}
                      </div>

                      {itemReasons.length ? (
                        <div className="mt-2 line-clamp-1 rounded-lg border border-white/10 bg-black/18 px-2 py-1.5 text-[10px] font-semibold leading-4 text-white/46">
                          {labelFromSnake(itemReasons[0])}
                        </div>
                      ) : null}

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className={`h-full rounded-full ${dotClass(status)}`}
                          style={{
                            width: `${Math.max(8, Math.min(100, Number(scoreOf(item) || 45)))}%`,
                          }}
                        />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-white/50">
                  Нет тикеров под выбранный фильтр.
                </div>
              )}
            </div>

            <div className="mt-3 grid h-[72px] shrink-0 grid-cols-2 gap-2 border-t border-white/10 pt-3">
              <SmallMetric
                label="Lifecycle"
                value={formatNumber(lifecycleCount, 0)}
                tone="info"
              />
              <SmallMetric
                label="Engine"
                value={error ? "Error" : "Online"}
                tone={error ? "bad" : "good"}
              />
            </div>
          </div>
        </aside>
      </div>

      <TickerTape items={deskItems} />
    </section>
  );
}
