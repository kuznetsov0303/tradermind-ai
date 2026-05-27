import {
  getSkillEdgeSetupBySlug,
  type SkillEdgeMarketType,
} from "@/lib/trading/setup-playbook";
import {
  buildSkillEdgeSignalExplanationFrame,
  calculateSkillEdgeSignalConfidence,
  type SkillEdgeConfidenceResult,
  type SkillEdgeSignalCandidateContext,
  type SkillEdgeSignalDirection,
} from "@/lib/trading/signal-confidence";
import {
  applyPersonalOverlayToSignalScore,
  buildSkillEdgePersonalSignalOverlay,
  type SkillEdgePersonalSignalOverlay,
  type SkillEdgeUserSetupProfile,
} from "@/lib/trading/signal-personalization";

export type RawSkillEdgeMarketCandidate = Record<string, unknown>;

export type SkillEdgeBuiltAlertStatus = "alert" | "armed" | "watch" | "rejected";

export type SkillEdgeBuiltAlert = {
  status: SkillEdgeBuiltAlertStatus;
  globalSignal: SkillEdgeConfidenceResult;
  personalOverlay: SkillEdgePersonalSignalOverlay;
  personalizedScore: number;
  explanation: ReturnType<typeof buildSkillEdgeSignalExplanationFrame>;
  clientSummary: {
    title: string;
    subtitle: string;
    setup: string;
    direction: SkillEdgeSignalDirection;
    confidence: number;
    personalizedConfidence: number;
    shouldAlert: boolean;
    primaryReason: string;
    primaryRisk: string;
  };
  context: SkillEdgeSignalCandidateContext;
};

function readString(
  candidate: RawSkillEdgeMarketCandidate,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = candidate[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(
  candidate: RawSkillEdgeMarketCandidate,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = candidate[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace("%", "").replace(",", "."));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readBoolean(
  candidate: RawSkillEdgeMarketCandidate,
  keys: string[]
): boolean {
  for (const key of keys) {
    const value = candidate[key];

    if (typeof value === "boolean") return value;

    if (typeof value === "string") {
      const normalized = value.toLowerCase();

      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
    }
  }

  return false;
}

function buildSearchText(candidate: RawSkillEdgeMarketCandidate) {
  return Object.values(candidate)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeAssetType(value: string | null): SkillEdgeMarketType {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("crypto") || normalized.includes("coin")) {
    return "crypto";
  }

  if (normalized.includes("future")) {
    return "futures";
  }

  if (normalized.includes("forex") || normalized.includes("fx")) {
    return "forex";
  }

  if (normalized.includes("option")) {
    return "options";
  }

  return "stocks";
}

function getKyivHour(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    hour12: false,
  });

  const hour = Number(formatter.format(now));

  return Number.isFinite(hour) ? hour : now.getUTCHours() + 3;
}

export function getSkillEdgeKyivSessionWindow(now = new Date()) {
  const hour = getKyivHour(now);

  if (hour >= 13 && hour < 16) return "premarket";
  if (hour >= 16 && hour < 18) return "open";
  if (hour >= 18 && hour < 21) return "main_session";
  if (hour >= 21 && hour < 23) return "power_hour";

  return "off_hours";
}


function readEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getSkillEdgeBuiltAlertStatus({
  globalSignal,
  personalizedScore,
}: {
  globalSignal: SkillEdgeConfidenceResult;
  personalizedScore: number;
}): SkillEdgeBuiltAlertStatus {
  const effectiveScore = Math.min(globalSignal.confidenceScore, personalizedScore);
  const activeThreshold = readEnvNumber("SIGNAL_ACTIVE_MIN_CONFIDENCE", 88);
  const armedThreshold = readEnvNumber("SIGNAL_ARMED_MIN_CONFIDENCE", 80);
  const watchThreshold = readEnvNumber("SIGNAL_WATCH_MIN_CONFIDENCE", 60);

  if (globalSignal.rejectionReasons.length > 0 && effectiveScore < watchThreshold) {
    return "rejected";
  }

  // Runtime safety: strong in-play candidates should still appear as WATCH items
  // even when they are not actionable. This keeps the Signals Center alive while
  // preserving the rule that only clean setups can become ARMED/ACTIVE.

  if (globalSignal.shouldAlert && effectiveScore >= activeThreshold) {
    return "alert";
  }

  if (effectiveScore >= armedThreshold) {
    return "armed";
  }

  if (effectiveScore >= watchThreshold) {
    return "watch";
  }

  return "rejected";
}

function inferDirectionFromTextAndSlug({
  text,
  setupSlug,
  priceChangePercent,
}: {
  text: string;
  setupSlug: string;
  priceChangePercent: number | null;
}): SkillEdgeSignalDirection {
  if (
    setupSlug.includes("short") ||
    setupSlug.includes("fade") ||
    setupSlug.includes("rejection") ||
    setupSlug.includes("breakdown")
  ) {
    return "downside";
  }

  if (
    setupSlug.includes("long") ||
    setupSlug.includes("reclaim") ||
    setupSlug.includes("bounce")
  ) {
    return "upside";
  }

  if (includesAny(text, ["short", "sell", "downside", "bearish", "fade"])) {
    return "downside";
  }

  if (includesAny(text, ["long", "buy", "upside", "bullish", "reclaim"])) {
    return "upside";
  }

  return priceChangePercent !== null && priceChangePercent < 0
    ? "downside"
    : "upside";
}

function inferSetupSlug({
  candidate,
  assetType,
  sessionWindow,
}: {
  candidate: RawSkillEdgeMarketCandidate;
  assetType: SkillEdgeMarketType;
  sessionWindow: string;
}) {
  const explicitSlug = readString(candidate, [
    "setupSlug",
    "setup_slug",
    "playbook_slug",
    "strategySlug",
    "strategy_slug",
  ]);

  if (explicitSlug && getSkillEdgeSetupBySlug(explicitSlug)) {
    return explicitSlug;
  }

  const text = buildSearchText(candidate);
  const priceChangePercent = readNumber(candidate, [
    "priceChangePercent",
    "changePercent",
    "change_percent",
    "change",
    "gapPercent",
    "gap_percent",
  ]);

  if (
    includesAny(text, ["personal premarket", "user fingerprint"]) ||
    (sessionWindow === "premarket" &&
      priceChangePercent !== null &&
      priceChangePercent >= 8 &&
      includesAny(text, ["failed high", "lower high", "vwap"]))
  ) {
    return "personal_premarket_short_fingerprint";
  }

  if (includesAny(text, ["gapcrap", "gap crap"])) {
    return "gap_crap_short";
  }

  if (includesAny(text, ["golden zone", "pmh"])) {
    return "pmh_golden_zone_short";
  }

  if (
    assetType === "crypto" &&
    includesAny(text, ["stop run", "liquidity sweep", "sell-side sweep", "sweep low"])
  ) {
    return "crypto_stop_run_reclaim_long";
  }

  if (
    assetType === "crypto" &&
    includesAny(text, ["buy-side sweep", "sweep high", "swept high", "liquidity grab above"])
  ) {
    return "crypto_stop_run_rejection_short";
  }

  if (includesAny(text, ["order block", "mitigation"])) {
    return "order_block_mitigation_reaction";
  }

  if (includesAny(text, ["breaker block", "breaker retest"])) {
    return "breaker_block_retest";
  }

  if (includesAny(text, ["fvg", "fair value gap", "imbalance"])) {
    return "fvg_fill_continuation";
  }

  if (
    includesAny(text, [
      "session sweep",
      "session liquidity",
      "equal highs",
      "equal lows",
      "buy-side liquidity",
      "sell-side liquidity",
    ])
  ) {
    return "session_liquidity_sweep_reversal";
  }

  if (includesAny(text, ["j-line", "jline"])) {
    return "vwap_jline_rejection_short";
  }

  if (includesAny(text, ["wall of sellers", "seller wall"])) {
    return "wall_of_sellers_short";
  }

  if (includesAny(text, ["second day", "day 2"])) {
    return "second_day_fade_continuation";
  }

  if (
  includesAny(text, [
    "earnings",
    "eps",
    "guidance",
    "news",
    "catalyst",
    "offering",
    "dilution",
    "fda",
    "analyst",
    "upgrade",
    "downgrade",
    "sec filing",
    "merger",
    "contract",
    "partnership",
  ])
) {
  if (includesAny(text, ["fade", "short", "failed", "rejection", "stuff"])) {
    return "catalyst_reaction_fade";
  }

  if (includesAny(text, ["big cap", "large cap", "mega cap"])) {
    return "big_cap_catalyst_continuation";
  }

  return "catalyst_continuation_after_pullback";
}

  if (includesAny(text, ["lower high", "under vwap"])) {
    return "lower_high_under_vwap_short";
  }

  if (includesAny(text, ["stuff", "failed breakout", "trap"])) {
    return "failed_premarket_breakout_stuff_short";
  }

  if (includesAny(text, ["breakout hold limit", "breakout + hold"])) {
    return "breakout_hold_limit";
  }

  if (includesAny(text, ["bounce limit", "bounce + limit"])) {
    return "bounce_limit";
  }

  if (includesAny(text, ["daily level", "false break", "retest"])) {
    return "daily_level_false_break_retest";
  }

  if (assetType === "crypto") {
    return priceChangePercent !== null && priceChangePercent < -4
      ? "crypto_dump_reversal_reclaim"
      : "crypto_squeeze_continuation";
  }

  if (sessionWindow === "premarket") {
    return "premarket_pump_exhaustion_short";
  }

  if (sessionWindow === "open") {
    return includesAny(text, ["fade", "failed", "short"])
      ? "first_push_fade_short"
      : "opening_range_breakout";
  }

  if (sessionWindow === "main_session") {
    return includesAny(text, ["range", "compression"])
      ? "midday_range_breakout_continuation"
      : "intraday_vwap_trend_continuation";
  }

  if (sessionWindow === "power_hour") {
    return includesAny(text, ["failed", "trap", "reversal"])
      ? "late_day_failed_breakout_reversal"
      : "power_hour_breakout_continuation";
  }

  return "momentum_continuation";
}

function inferVwapState(text: string): SkillEdgeSignalCandidateContext["vwapState"] {
  if (includesAny(text, ["vwap reclaim", "reclaimed vwap"])) return "reclaim";
  if (includesAny(text, ["vwap rejection", "under vwap", "below vwap"])) {
    return "rejection";
  }
  if (includesAny(text, ["lost vwap", "vwap lost"])) return "lost";
  if (includesAny(text, ["above vwap"])) return "above";
  if (includesAny(text, ["below vwap"])) return "below";

  return "neutral";
}

function inferStructureState(
  text: string
): SkillEdgeSignalCandidateContext["structureState"] {
  if (includesAny(text, ["sweep reclaim", "liquidity sweep reclaim"])) {
    return "sweep_reclaim";
  }

  if (includesAny(text, ["sweep rejection", "liquidity sweep rejection"])) {
    return "sweep_rejection";
  }

  if (includesAny(text, ["failed breakout", "stuff", "trap"])) {
    return "failed_breakout";
  }

  if (includesAny(text, ["failed breakdown"])) {
    return "failed_breakdown";
  }

  if (includesAny(text, ["breakout"])) return "breakout";
  if (includesAny(text, ["breakdown"])) return "breakdown";
  if (includesAny(text, ["trend up", "uptrend"])) return "trend_up";
  if (includesAny(text, ["trend down", "downtrend"])) return "trend_down";
  if (includesAny(text, ["range", "compression"])) return "range";

  return "unknown";
}

function calculateRiskRewardFromLevels({
  direction,
  entry,
  stop,
  target,
}: {
  direction: SkillEdgeSignalDirection;
  entry: number | null;
  stop: number | null;
  target: number | null;
}) {
  if (entry === null || stop === null || target === null) return null;

  const risk = direction === "upside" ? entry - stop : stop - entry;
  const reward = direction === "upside" ? target - entry : entry - target;

  if (risk <= 0 || reward <= 0) return null;

  return reward / risk;
}

export function buildSkillEdgeSignalContextFromCandidate(
  candidate: RawSkillEdgeMarketCandidate,
  now = new Date()
): SkillEdgeSignalCandidateContext {
  const sessionWindow = getSkillEdgeKyivSessionWindow(now);

  const assetType = normalizeAssetType(
    readString(candidate, ["assetType", "asset_type", "marketType", "market"])
  );

  const setupSlug = inferSetupSlug({
    candidate,
    assetType,
    sessionWindow,
  });

  const text = buildSearchText(candidate);

  const priceChangePercent = readNumber(candidate, [
    "priceChangePercent",
    "changePercent",
    "change_percent",
    "change",
    "gapPercent",
    "gap_percent",
  ]);

  const direction = inferDirectionFromTextAndSlug({
    text,
    setupSlug,
    priceChangePercent,
  });

  const entry = readNumber(candidate, [
    "entry",
    "entryPrice",
    "entry_price",
    "alertEntry",
    "alert_entry",
  ]);

  const stop = readNumber(candidate, [
    "stop",
    "stopPrice",
    "stop_price",
    "invalidation",
    "alertStop",
    "alert_stop",
  ]);

  const target = readNumber(candidate, [
    "target",
    "target1",
    "takeProfit",
    "take_profit",
    "alertTarget",
    "alert_target",
  ]);

  const explicitRiskReward = readNumber(candidate, [
    "riskRewardRatio",
    "risk_reward_ratio",
    "rr",
  ]);

  const computedRiskReward = calculateRiskRewardFromLevels({
    direction,
    entry,
    stop,
    target,
  });

  const riskRewardRatio = explicitRiskReward ?? computedRiskReward;

  const relativeVolume = readNumber(candidate, [
    "relativeVolume",
    "relative_volume",
    "rvol",
    "relVolume",
  ]);

  const spreadQuality = readNumber(candidate, [
    "spreadQuality",
    "spread_quality",
  ]);

  const liquidityQuality = readNumber(candidate, [
    "liquidityQuality",
    "liquidity_quality",
  ]);

  const riskFlags: string[] = [];

  if (spreadQuality !== null && spreadQuality < 45) {
    riskFlags.push("Spread quality is weak.");
  }

  if (liquidityQuality !== null && liquidityQuality < 45) {
    riskFlags.push("Liquidity quality is weak.");
  }

  if (riskRewardRatio !== null && riskRewardRatio < 1.8) {
    riskFlags.push("Risk/reward is below premium standard.");
  }

  if (includesAny(text, ["halt risk", "wide spread", "borrow unavailable"])) {
    riskFlags.push("Execution risk is elevated.");
  }

  const missingData: string[] = [];

  const priceActionScore = readNumber(candidate, [
    "priceActionScore",
    "price_action_score",
    "patternAlignmentScore",
    "pattern_alignment_score",
  ]);

  const candlePatternScore = readNumber(candidate, [
    "candlePatternScore",
    "candle_pattern_score",
  ]);

  const chartPatternScore = readNumber(candidate, [
    "chartPatternScore",
    "chart_pattern_score",
  ]);

  const volumePatternScore = readNumber(candidate, [
    "volumePatternScore",
    "volume_pattern_score",
  ]);

  if (relativeVolume === null) missingData.push("relative volume");
  if (riskRewardRatio === null) missingData.push("risk/reward");
  if (spreadQuality === null) missingData.push("spread quality");
  if (liquidityQuality === null) missingData.push("liquidity quality");
  if (priceActionScore === null) missingData.push("price-action pattern score");

  return {
    symbol:
      readString(candidate, ["symbol", "ticker", "coin", "pair"]) ?? "UNKNOWN",
    assetType,
    setupSlug,
    direction,
    priceChangePercent,
    relativeVolume,
    volumeRank: readNumber(candidate, ["volumeRank", "volume_rank"]),
    spreadQuality,
    liquidityQuality,
    hasNewsCatalyst:
      readBoolean(candidate, ["hasNewsCatalyst", "has_news", "hasCatalyst"]) ||
      includesAny(text, ["news", "catalyst", "earnings", "guidance"]),
    catalystQuality: readNumber(candidate, [
      "catalystQuality",
      "catalyst_quality",
    ]),
    trackedAttentionScore: readNumber(candidate, [
      "trackedAttentionScore",
      "attentionScore",
      "socialScore",
    ]),
    stocktwitsScore: readNumber(candidate, ["stocktwitsScore"]),
    redditScore: readNumber(candidate, ["redditScore"]),
    newsScore: readNumber(candidate, ["newsScore"]),
    cryptoActivityScore: readNumber(candidate, ["cryptoActivityScore"]),
    marketAlignment: readNumber(candidate, ["marketAlignment"]),
    btcAlignment: readNumber(candidate, ["btcAlignment"]),
    sectorAlignment: readNumber(candidate, ["sectorAlignment"]),
    priceActionScore,
    candlePatternScore,
    chartPatternScore,
    volumePatternScore,
    vwapState: inferVwapState(text),
    structureState: inferStructureState(text),
    trendQuality: readNumber(candidate, ["trendQuality"]),
    entryQuality: readNumber(candidate, ["entryQuality"]),
    stopQuality: readNumber(candidate, ["stopQuality"]),
    targetRoomQuality: readNumber(candidate, ["targetRoomQuality"]),
    riskRewardRatio,
    timeOfDayQuality:
      sessionWindow === "premarket" ||
      sessionWindow === "open" ||
      sessionWindow === "main_session" ||
      sessionWindow === "power_hour"
        ? 75
        : 35,
    personalSimilarityScore: readNumber(candidate, ["personalSimilarityScore"]),
    personalWarningScore: readNumber(candidate, ["personalWarningScore"]),
    riskFlags,
    trapFlags: includesAny(text, ["trap", "stuff", "failed breakout"])
      ? ["Trap structure detected; confirmation is required."]
      : [],
    missingData,
  };
}

export function buildSkillEdgeAlertFromCandidate({
  candidate,
  profile,
  now = new Date(),
}: {
  candidate: RawSkillEdgeMarketCandidate;
  profile?: SkillEdgeUserSetupProfile | null;
  now?: Date;
}): SkillEdgeBuiltAlert {
  const context = buildSkillEdgeSignalContextFromCandidate(candidate, now);
  const globalSignal = calculateSkillEdgeSignalConfidence(context);

  const personalOverlay = buildSkillEdgePersonalSignalOverlay({
    signal: globalSignal,
    context,
    profile: profile ?? null,
  });

  const personalizedScore = applyPersonalOverlayToSignalScore({
    baseScore: globalSignal.confidenceScore,
    overlay: personalOverlay,
  });

  const explanation = buildSkillEdgeSignalExplanationFrame(globalSignal);

  const status = getSkillEdgeBuiltAlertStatus({
    globalSignal,
    personalizedScore,
  });

  return {
    status,
    globalSignal,
    personalOverlay,
    personalizedScore,
    explanation,
    clientSummary: {
      title: `${globalSignal.setupName} вЂ” ${globalSignal.symbol}`,
      subtitle: status === "alert"
        ? "Active high-confidence structured setup"
        : status === "armed"
          ? "Armed setup, waiting for trigger/confirmation"
          : status === "watch"
            ? "Watch candidate, not an actionable alert yet"
            : "Rejected by premium alert filter",
      setup: globalSignal.setupName,
      direction: globalSignal.direction,
      confidence: globalSignal.confidenceScore,
      personalizedConfidence: personalizedScore,
      shouldAlert: globalSignal.shouldAlert,
      primaryReason:
        globalSignal.reasons[0] ??
        "Setup matched the SkillEdge playbook structure.",
      primaryRisk:
        globalSignal.riskNotes[0] ??
        globalSignal.setup.riskWarnings[0] ??
        "Trade only after confirmation and valid risk/reward.",
    },
    context,
  };
}

