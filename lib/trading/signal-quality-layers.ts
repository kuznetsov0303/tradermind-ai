import type { SkillEdgeCandle } from "@/lib/trading/market-structure";

export type SkillEdgeSignalSide = "upside" | "downside";
export type SkillEdgeAlertLifecycleStatus = "active" | "armed" | "watch" | "rejected";

export type SkillEdgeCatalystQuality = {
  quality: number | null;
  label: "none" | "strong" | "medium" | "weak" | "danger";
  notes: string[];
  riskFlags: string[];
  tags: string[];
};

export type SkillEdgeNoChaseAnalysis = {
  score: number;
  isLate: boolean;
  isHardReject: boolean;
  atrExtension: number | null;
  percentExtensionFromEntry: number | null;
  entryQualityAdjustment: number;
  notes: string[];
  riskFlags: string[];
};

export type SkillEdgeMultiTimeframeAnalysis = {
  alignmentScore: number;
  microScore: number | null;
  mainScore: number | null;
  confirmationScore: number | null;
  label: "aligned" | "mixed" | "opposing" | "missing";
  notes: string[];
  riskFlags: string[];
  confidenceAdjustment: number;
};

export type SkillEdgeOutcomeTrackingSeed = {
  version: "skill-edge-outcome-v1";
  status: "pending";
  direction: SkillEdgeSignalSide;
  entryZone: { min: number | null; max: number | null };
  stop: number | null;
  targets: Array<number | null>;
  evaluationRules: string[];
  metricsToTrack: string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeText(value: unknown) {
  if (typeof value === "string") return value.toLowerCase();
  if (value === null || value === undefined) return "";

  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeCandles(candles: SkillEdgeCandle[]) {
  return candles
    .map((candle) => {
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volume =
        typeof candle.volume === "number" && Number.isFinite(candle.volume)
          ? candle.volume
          : 0;
      const timestampMs =
        candle.timestamp instanceof Date
          ? candle.timestamp.getTime()
          : typeof candle.timestamp === "number"
            ? candle.timestamp
            : new Date(candle.timestamp).getTime();

      return { open, high, low, close, volume, timestampMs };
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.timestampMs) &&
        candle.high >= candle.low
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function calculateDirectionalCandleScore({
  candles,
  direction,
}: {
  candles: SkillEdgeCandle[];
  direction: SkillEdgeSignalSide;
}) {
  const normalized = normalizeCandles(candles);

  if (normalized.length < 8) return null;

  const recent = normalized.slice(-8);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const priceChange = first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : 0;
  const greenCount = recent.filter((candle) => candle.close > candle.open).length;
  const redCount = recent.filter((candle) => candle.close < candle.open).length;
  const avgVolume =
    normalized.slice(-28, -8).reduce((sum, candle) => sum + candle.volume, 0) /
      Math.max(1, normalized.slice(-28, -8).length) || 0;
  const recentVolume = recent.reduce((sum, candle) => sum + candle.volume, 0) / recent.length;
  const volumeExpansion = avgVolume > 0 ? recentVolume / avgVolume : 1;

  let score = 50;

  if (direction === "upside") {
    if (priceChange > 0) score += 14;
    if (priceChange > 0.7) score += 8;
    if (greenCount >= 5) score += 8;
    if (redCount >= 5) score -= 12;
  } else {
    if (priceChange < 0) score += 14;
    if (priceChange < -0.7) score += 8;
    if (redCount >= 5) score += 8;
    if (greenCount >= 5) score -= 12;
  }

  if (volumeExpansion >= 1.25) score += 6;
  if (volumeExpansion <= 0.65) score -= 6;

  return clamp(score);
}

export function evaluateSkillEdgeCatalystQuality({
  catalyst,
  rawData,
  assetType,
  direction,
}: {
  catalyst?: string | null;
  rawData?: unknown;
  assetType: "stock" | "crypto";
  direction: SkillEdgeSignalSide;
}): SkillEdgeCatalystQuality {
  const text = `${normalizeText(catalyst)} ${normalizeText(rawData)}`.trim();

  if (!text) {
    return {
      quality: null,
      label: "none",
      notes: ["No fresh catalyst detected in connected sources."],
      riskFlags: [],
      tags: [],
    };
  }

  const tags: string[] = [];
  const notes: string[] = [];
  const riskFlags: string[] = [];
  let quality = 52;
  let label: SkillEdgeCatalystQuality["label"] = "medium";

  const strongPositive = includesAny(text, [
    "earnings beat",
    "beats estimates",
    "raises guidance",
    "guidance raise",
    "fda approval",
    "approved",
    "contract",
    "partnership",
    "merger",
    "acquisition",
    "buyout",
    "strategic investment",
    "record revenue",
  ]);

  const strongNegative = includesAny(text, [
    "offering",
    "dilution",
    "registered direct",
    "atm offering",
    "reverse split",
    "going concern",
    "sec investigation",
    "downgrade",
    "misses estimates",
    "cuts guidance",
    "bankruptcy",
  ]);

  const cryptoAttention = includesAny(text, [
    "listing",
    "binance",
    "coinbase",
    "etf",
    "mainnet",
    "airdrop",
    "token burn",
    "staking",
    "bridge",
    "dex",
    "perp",
  ]);

  const weakPromo = includesAny(text, [
    "announces",
    "launches website",
    "corporate update",
    "letter to shareholders",
    "social media",
    "rumor",
    "unconfirmed",
  ]);

  if (strongPositive) {
    tags.push("strong_positive_catalyst");
    notes.push("Catalyst contains a strong positive business/news driver.");
    quality += direction === "upside" ? 26 : 4;
  }

  if (strongNegative) {
    tags.push("dilution_or_negative_catalyst");
    notes.push("Catalyst contains dilution/negative-risk keywords that can change the setup quality.");
    quality += direction === "downside" ? 24 : -18;
    if (direction === "upside") {
      riskFlags.push("Catalyst has dilution/negative-risk language; long continuation requires stronger confirmation.");
    }
  }

  if (assetType === "crypto" && cryptoAttention) {
    tags.push("crypto_attention_catalyst");
    notes.push("Crypto attention catalyst detected from connected sources.");
    quality += 14;
  }

  if (weakPromo) {
    tags.push("weak_or_promotional_catalyst");
    notes.push("Catalyst may be promotional or weak; price action must confirm.");
    quality -= 10;
  }

  if (includesAny(text, ["halt", "suspended", "delisted", "rug", "exploit", "hack"])) {
    tags.push("severe_event_risk");
    riskFlags.push("Severe event risk detected; signal should be treated with extra caution.");
    quality -= 22;
  }

  const finalQuality = clamp(quality);

  if (finalQuality >= 75) label = "strong";
  else if (finalQuality >= 55) label = "medium";
  else if (finalQuality >= 35) label = "weak";
  else label = "danger";

  return {
    quality: finalQuality,
    label,
    notes: notes.length > 0 ? notes : ["Catalyst exists, but quality is not clearly strong."],
    riskFlags,
    tags,
  };
}

export function analyzeSkillEdgeNoChase({
  direction,
  currentPrice,
  entryZoneMin,
  entryZoneMax,
  atr,
  changePercent,
  assetType,
}: {
  direction: SkillEdgeSignalSide;
  currentPrice: number | null;
  entryZoneMin: number | null;
  entryZoneMax: number | null;
  atr: number | null;
  changePercent: number;
  assetType: "stock" | "crypto";
}): SkillEdgeNoChaseAnalysis {
  const notes: string[] = [];
  const riskFlags: string[] = [];

  if (
    currentPrice === null ||
    currentPrice <= 0 ||
    entryZoneMin === null ||
    entryZoneMax === null ||
    entryZoneMin <= 0 ||
    entryZoneMax <= 0
  ) {
    return {
      score: 48,
      isLate: false,
      isHardReject: false,
      atrExtension: null,
      percentExtensionFromEntry: null,
      entryQualityAdjustment: -8,
      notes: ["No-chase check is limited because entry zone or current price is missing."],
      riskFlags: ["Entry distance could not be fully validated."],
    };
  }

  const entryMid = (entryZoneMin + entryZoneMax) / 2;
  const rawDistance =
    direction === "upside"
      ? Math.max(0, currentPrice - entryZoneMax)
      : Math.max(0, entryZoneMin - currentPrice);
  const percentExtensionFromEntry = (rawDistance / entryMid) * 100;
  const atrExtension = atr && atr > 0 ? rawDistance / atr : null;

  let score = 82;
  let isLate = false;
  let isHardReject = false;

  if (rawDistance <= 0) {
    notes.push("Price is still inside or near the planned entry zone.");
    score += 8;
  }

  if (atrExtension !== null && atrExtension > 0.8) {
    score -= 14;
    isLate = true;
    riskFlags.push("Price is extended away from the entry zone by more than 0.8 ATR.");
  }

  if (atrExtension !== null && atrExtension > 1.2) {
    score -= 18;
    isHardReject = true;
    riskFlags.push("No-chase filter: price is more than 1.2 ATR away from the planned entry zone.");
  }

  if (percentExtensionFromEntry > (assetType === "crypto" ? 2.4 : 1.8)) {
    score -= 12;
    isLate = true;
    riskFlags.push("Price is too far from the planned zone; waiting for pullback/retest is better.");
  }

  const absoluteMove = Math.abs(changePercent);
  const extremeMoveThreshold = assetType === "crypto" ? 18 : 28;

  if (absoluteMove >= extremeMoveThreshold) {
    score -= 10;
    riskFlags.push("Move is already very extended on the session; late entries need stricter confirmation.");
  }

  if (riskFlags.length === 0) {
    notes.push("No-chase filter passed: entry distance is controlled.");
  } else {
    notes.push("No-chase filter is warning against late execution.");
  }

  return {
    score: clamp(score),
    isLate,
    isHardReject,
    atrExtension: atrExtension === null ? null : Number(atrExtension.toFixed(2)),
    percentExtensionFromEntry: Number(percentExtensionFromEntry.toFixed(2)),
    entryQualityAdjustment: clamp(score) >= 75 ? 8 : clamp(score) >= 55 ? -4 : -18,
    notes,
    riskFlags,
  };
}

export function analyzeSkillEdgeMultiTimeframe({
  direction,
  microCandles,
  mainCandles,
  confirmationCandles,
}: {
  direction: SkillEdgeSignalSide;
  microCandles?: SkillEdgeCandle[] | null;
  mainCandles?: SkillEdgeCandle[] | null;
  confirmationCandles?: SkillEdgeCandle[] | null;
}): SkillEdgeMultiTimeframeAnalysis {
  const microScore = calculateDirectionalCandleScore({
    candles: microCandles ?? [],
    direction,
  });
  const mainScore = calculateDirectionalCandleScore({
    candles: mainCandles ?? [],
    direction,
  });
  const confirmationScore = calculateDirectionalCandleScore({
    candles: confirmationCandles ?? [],
    direction,
  });

  const availableScores = [microScore, mainScore, confirmationScore].filter(
    (score): score is number => typeof score === "number" && Number.isFinite(score)
  );

  if (availableScores.length === 0) {
    return {
      alignmentScore: 45,
      microScore,
      mainScore,
      confirmationScore,
      label: "missing",
      notes: ["Multi-timeframe confirmation is missing; signal confidence is reduced."],
      riskFlags: ["1m/5m/15m confirmation data is incomplete."],
      confidenceAdjustment: -8,
    };
  }

  const weightedSum =
    (microScore ?? 50) * 0.2 + (mainScore ?? 50) * 0.5 + (confirmationScore ?? 50) * 0.3;
  const alignmentScore = clamp(weightedSum);
  const notes: string[] = [];
  const riskFlags: string[] = [];
  let label: SkillEdgeMultiTimeframeAnalysis["label"] = "mixed";
  let confidenceAdjustment = 0;

  if ((mainScore ?? 0) >= 65 && (confirmationScore ?? 50) >= 58) {
    label = "aligned";
    confidenceAdjustment = 8;
    notes.push("5m trigger and higher-timeframe confirmation support the same direction.");
  } else if ((mainScore ?? 50) < 42 || (confirmationScore ?? 50) < 42) {
    label = "opposing";
    confidenceAdjustment = -12;
    riskFlags.push("Multi-timeframe structure is fighting the signal direction.");
  } else {
    label = "mixed";
    confidenceAdjustment = -2;
    notes.push("Multi-timeframe structure is mixed; wait for cleaner confirmation.");
  }

  if (microScore !== null && microScore < 38) {
    riskFlags.push("1m microstructure is against the planned direction; avoid chasing immediate entry.");
  }

  if (microScore !== null && microScore >= 68) {
    notes.push("1m microstructure supports the trigger timing.");
  }

  return {
    alignmentScore,
    microScore,
    mainScore,
    confirmationScore,
    label,
    notes,
    riskFlags,
    confidenceAdjustment,
  };
}

export function classifySkillEdgeAlertLifecycle({
  confidenceScore,
  shouldAlert,
  riskRewardRatio,
  hasTradePlan,
  noChase,
  multiTimeframe,
  marketScore,
}: {
  confidenceScore: number;
  shouldAlert: boolean;
  riskRewardRatio: number | null;
  hasTradePlan: boolean;
  noChase: SkillEdgeNoChaseAnalysis;
  multiTimeframe: SkillEdgeMultiTimeframeAnalysis;
  marketScore: number;
}): SkillEdgeAlertLifecycleStatus {
  if (!hasTradePlan) return "watch";
  if (noChase.isHardReject) return confidenceScore >= 72 ? "armed" : "watch";
  if (riskRewardRatio !== null && riskRewardRatio < 1.5) return "watch";

  if (
    shouldAlert &&
    confidenceScore >= 82 &&
    (riskRewardRatio === null || riskRewardRatio >= 1.8) &&
    multiTimeframe.alignmentScore >= 55 &&
    noChase.score >= 55
  ) {
    return "active";
  }

  if (
    confidenceScore >= 72 &&
    (riskRewardRatio === null || riskRewardRatio >= 1.5) &&
    marketScore >= 40
  ) {
    return "armed";
  }

  if (confidenceScore >= 60 || marketScore >= 55) return "watch";

  return "rejected";
}

export function buildSkillEdgeOutcomeTrackingSeed({
  direction,
  entryZoneMin,
  entryZoneMax,
  stop,
  targets,
}: {
  direction: SkillEdgeSignalSide;
  entryZoneMin: number | null;
  entryZoneMax: number | null;
  stop: number | null;
  targets: Array<number | null>;
}): SkillEdgeOutcomeTrackingSeed {
  return {
    version: "skill-edge-outcome-v1",
    status: "pending",
    direction,
    entryZone: {
      min: entryZoneMin,
      max: entryZoneMax,
    },
    stop,
    targets,
    evaluationRules: [
      "Mark worked if TP1 is reached before stop after the signal becomes active.",
      "Mark failed if stop/invalidation is reached before TP1.",
      "Mark neutral/no-trigger if price never trades into the entry zone with confirmation.",
      "Track MFE/MAE and time-to-target for future signal quality stats.",
    ],
    metricsToTrack: ["MFE", "MAE", "TP1", "TP2", "TP3", "stop", "time_to_target", "no_trigger"],
  };
}

