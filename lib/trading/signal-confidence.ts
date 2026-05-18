import {
  getSkillEdgeSetupBySlug,
  type SkillEdgeMarketType,
  type SkillEdgeSetupDefinition,
} from "@/lib/trading/setup-playbook";

export type SkillEdgeSignalDirection = "upside" | "downside";

export type SkillEdgeConfidenceTier = "A+" | "A" | "B" | "C" | "REJECTED";

export type SkillEdgeSignalCandidateContext = {
  symbol: string;
  assetType: SkillEdgeMarketType;
  setupSlug: string;
  direction: SkillEdgeSignalDirection;

  priceChangePercent?: number | null;
  relativeVolume?: number | null;
  volumeRank?: number | null;
  spreadQuality?: number | null;
  liquidityQuality?: number | null;

  hasNewsCatalyst?: boolean;
  catalystQuality?: number | null;
  trackedAttentionScore?: number | null;
  stocktwitsScore?: number | null;
  redditScore?: number | null;
  newsScore?: number | null;
  cryptoActivityScore?: number | null;

  marketAlignment?: number | null;
  btcAlignment?: number | null;
  sectorAlignment?: number | null;

  priceActionScore?: number | null;
  candlePatternScore?: number | null;
  chartPatternScore?: number | null;
  volumePatternScore?: number | null;

  vwapState?:
    | "above"
    | "below"
    | "reclaim"
    | "rejection"
    | "lost"
    | "neutral"
    | null;

  structureState?:
    | "trend_up"
    | "trend_down"
    | "range"
    | "breakout"
    | "breakdown"
    | "sweep_reclaim"
    | "sweep_rejection"
    | "failed_breakout"
    | "failed_breakdown"
    | "unknown"
    | null;

  trendQuality?: number | null;
  entryQuality?: number | null;
  stopQuality?: number | null;
  targetRoomQuality?: number | null;
  riskRewardRatio?: number | null;
  timeOfDayQuality?: number | null;

  personalSimilarityScore?: number | null;
  personalWarningScore?: number | null;

  riskFlags?: string[];
  trapFlags?: string[];
  missingData?: string[];
};

export type SkillEdgeConfidenceResult = {
  symbol: string;
  setupSlug: string;
  setupName: string;
  direction: SkillEdgeSignalDirection;
  confidenceScore: number;
  confidenceTier: SkillEdgeConfidenceTier;
  shouldAlert: boolean;
  reasons: string[];
  riskNotes: string[];
  missingData: string[];
  rejectionReasons: string[];
  setup: SkillEdgeSetupDefinition;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function capScore(
  current: number,
  cap: number,
  riskNotes: string[],
  note: string
) {
  if (current <= cap) return current;

  riskNotes.push(note);
  return cap;
}

function hasRiskFlag(context: SkillEdgeSignalCandidateContext, fragments: string[]) {
  const flags = [...(context.riskFlags ?? []), ...(context.trapFlags ?? [])];

  return flags.some((flag) => {
    const normalized = flag.toLowerCase();
    return fragments.some((fragment) => normalized.includes(fragment));
  });
}

function addScore(
  current: number,
  condition: boolean,
  points: number,
  reasons: string[],
  reason: string
) {
  if (!condition) return current;

  reasons.push(reason);
  return current + points;
}

function subtractScore(
  current: number,
  condition: boolean,
  points: number,
  riskNotes: string[],
  note: string
) {
  if (!condition) return current;

  riskNotes.push(note);
  return current - points;
}

function getTier(score: number): SkillEdgeConfidenceTier {
  if (score >= 90) return "A+";
  if (score >= 82) return "A";
  if (score >= 72) return "B";
  if (score >= 60) return "C";

  return "REJECTED";
}

function hasSevereRisk(context: SkillEdgeSignalCandidateContext) {
  const riskFlags = context.riskFlags ?? [];

  return riskFlags.some((flag) => {
    const normalized = flag.toLowerCase();

    return (
      normalized.includes("halt risk") ||
      normalized.includes("untradable spread") ||
      normalized.includes("no liquidity") ||
      normalized.includes("extreme slippage") ||
      normalized.includes("no stop") ||
      normalized.includes("borrow unavailable")
    );
  });
}

export function calculateSkillEdgeSignalConfidence(
  context: SkillEdgeSignalCandidateContext
): SkillEdgeConfidenceResult {
  const setup = getSkillEdgeSetupBySlug(context.setupSlug);

  if (!setup) {
    throw new Error(`Unknown SkillEdge setup: ${context.setupSlug}`);
  }

  const reasons: string[] = [];
  const riskNotes: string[] = [];
  const rejectionReasons: string[] = [];
  const missingData = [...(context.missingData ?? [])];

  let score = setup.confidenceBase;

  const relativeVolume = numberOrNull(context.relativeVolume);
  const priceChangePercent = numberOrNull(context.priceChangePercent);
  const spreadQuality = numberOrNull(context.spreadQuality);
  const liquidityQuality = numberOrNull(context.liquidityQuality);
  const catalystQuality = numberOrNull(context.catalystQuality);
  const trackedAttentionScore = numberOrNull(context.trackedAttentionScore);
  const marketAlignment = numberOrNull(context.marketAlignment);
  const btcAlignment = numberOrNull(context.btcAlignment);
  const sectorAlignment = numberOrNull(context.sectorAlignment);
  const priceActionScore = numberOrNull(context.priceActionScore);
  const candlePatternScore = numberOrNull(context.candlePatternScore);
  const chartPatternScore = numberOrNull(context.chartPatternScore);
  const volumePatternScore = numberOrNull(context.volumePatternScore);
  const trendQuality = numberOrNull(context.trendQuality);
  const entryQuality = numberOrNull(context.entryQuality);
  const stopQuality = numberOrNull(context.stopQuality);
  const targetRoomQuality = numberOrNull(context.targetRoomQuality);
  const riskRewardRatio = numberOrNull(context.riskRewardRatio);
  const timeOfDayQuality = numberOrNull(context.timeOfDayQuality);
  const personalSimilarityScore = numberOrNull(context.personalSimilarityScore);
  const personalWarningScore = numberOrNull(context.personalWarningScore);

  score = addScore(
    score,
    relativeVolume !== null && relativeVolume >= 2,
    6,
    reasons,
    "Relative volume is above normal."
  );

  score = addScore(
    score,
    relativeVolume !== null && relativeVolume >= 4,
    5,
    reasons,
    "Relative volume is strongly elevated."
  );

  score = subtractScore(
    score,
    relativeVolume !== null && relativeVolume < 1.2,
    8,
    riskNotes,
    "Relative volume is not strong enough for a premium alert."
  );

  score = addScore(
    score,
    priceChangePercent !== null && Math.abs(priceChangePercent) >= 3,
    4,
    reasons,
    "Price movement is large enough to attract active traders."
  );

  score = subtractScore(
    score,
    priceChangePercent !== null && Math.abs(priceChangePercent) >= 18,
    6,
    riskNotes,
    "Move is already heavily extended; late entries need stricter confirmation."
  );

  score = addScore(
    score,
    context.hasNewsCatalyst === true,
    5,
    reasons,
    "News or catalyst context supports attention."
  );

  score = addScore(
    score,
    catalystQuality !== null && catalystQuality >= 75,
    5,
    reasons,
    "Catalyst quality is strong."
  );

  score = subtractScore(
    score,
    catalystQuality !== null && catalystQuality < 40,
    5,
    riskNotes,
    "Catalyst quality is weak or unclear."
  );

  score = addScore(
    score,
    trackedAttentionScore !== null && trackedAttentionScore >= 70,
    5,
    reasons,
    "Tracked attention is elevated across connected sources."
  );

  score = subtractScore(
    score,
    spreadQuality !== null && spreadQuality < 45,
    10,
    riskNotes,
    "Spread quality is weak; execution risk is elevated."
  );

  score = addScore(
    score,
    spreadQuality !== null && spreadQuality >= 75,
    3,
    reasons,
    "Spread quality is acceptable for execution."
  );

  score = subtractScore(
    score,
    liquidityQuality !== null && liquidityQuality < 45,
    10,
    riskNotes,
    "Liquidity quality is weak; slippage risk is elevated."
  );

  score = addScore(
    score,
    liquidityQuality !== null && liquidityQuality >= 75,
    4,
    reasons,
    "Liquidity quality supports tradable execution."
  );

  score = addScore(
    score,
    marketAlignment !== null && marketAlignment >= 65,
    5,
    reasons,
    "Broad market context supports the direction."
  );

  score = subtractScore(
    score,
    marketAlignment !== null && marketAlignment <= 35,
    7,
    riskNotes,
    "Broad market context fights the direction."
  );

  score = addScore(
    score,
    btcAlignment !== null && btcAlignment >= 65,
    4,
    reasons,
    "Crypto market context supports the direction."
  );

  score = subtractScore(
    score,
    btcAlignment !== null && btcAlignment <= 35,
    7,
    riskNotes,
    "Crypto market context fights the direction."
  );

  score = addScore(
    score,
    sectorAlignment !== null && sectorAlignment >= 65,
    3,
    reasons,
    "Sector context supports the setup."
  );

  score = addScore(
    score,
    priceActionScore !== null && priceActionScore >= 75,
    8,
    reasons,
    "Price-action patterns align with the setup direction."
  );

  score = addScore(
    score,
    chartPatternScore !== null && chartPatternScore >= 75,
    5,
    reasons,
    "Chart pattern structure supports the idea."
  );

  score = addScore(
    score,
    candlePatternScore !== null && candlePatternScore >= 70,
    4,
    reasons,
    "Recent candle pattern supports the trigger."
  );

  score = addScore(
    score,
    volumePatternScore !== null && volumePatternScore >= 70,
    3,
    reasons,
    "Recent volume pattern supports the move."
  );

  score = subtractScore(
    score,
    priceActionScore !== null && priceActionScore < 40,
    10,
    riskNotes,
    "Price-action patterns fight the setup direction."
  );

  score = subtractScore(
    score,
    candlePatternScore !== null && candlePatternScore < 35,
    6,
    riskNotes,
    "Recent candle pattern is weak for this trigger."
  );

  score = addScore(
    score,
    trendQuality !== null && trendQuality >= 70,
    5,
    reasons,
    "Trend structure is clean."
  );

  score = subtractScore(
    score,
    trendQuality !== null && trendQuality < 45,
    6,
    riskNotes,
    "Trend structure is not clean enough."
  );

  score = addScore(
    score,
    entryQuality !== null && entryQuality >= 75,
    8,
    reasons,
    "Entry is close to the trigger zone with controlled risk."
  );

  score = subtractScore(
    score,
    entryQuality !== null && entryQuality < 45,
    10,
    riskNotes,
    "Entry quality is weak or too far from the trigger zone."
  );

  score = addScore(
    score,
    stopQuality !== null && stopQuality >= 75,
    6,
    reasons,
    "Invalidation level is clear and tradable."
  );

  score = subtractScore(
    score,
    stopQuality !== null && stopQuality < 45,
    12,
    riskNotes,
    "Stop placement is unclear or too wide."
  );

  score = addScore(
    score,
    targetRoomQuality !== null && targetRoomQuality >= 70,
    5,
    reasons,
    "Target room is acceptable."
  );

  score = subtractScore(
    score,
    targetRoomQuality !== null && targetRoomQuality < 45,
    8,
    riskNotes,
    "Target room is limited."
  );

    score = addScore(
    score,
    riskRewardRatio !== null && riskRewardRatio >= 2,
    6,
    reasons,
    "Risk/reward is at least 2:1."
  );

  score = addScore(
    score,
    riskRewardRatio !== null && riskRewardRatio >= 3,
    4,
    reasons,
    "Risk/reward is strong."
  );

  score = subtractScore(
    score,
    riskRewardRatio !== null && riskRewardRatio < 1.8,
    16,
    riskNotes,
    "Risk/reward is below premium alert standard."
  );

  if (riskRewardRatio !== null && riskRewardRatio < 1.5) {
    rejectionReasons.push("Risk/reward is too weak for an actionable alert.");
  }

  score = addScore(
    score,
    timeOfDayQuality !== null && timeOfDayQuality >= 70,
    3,
    reasons,
    "Time-of-day context supports active movement."
  );

  score = subtractScore(
    score,
    timeOfDayQuality !== null && timeOfDayQuality < 35,
    5,
    riskNotes,
    "Time-of-day context is lower quality for this setup."
  );

  score = addScore(
    score,
    personalSimilarityScore !== null && personalSimilarityScore >= 75,
    7,
    reasons,
    "Setup is similar to the user’s stronger historical patterns."
  );

  score = subtractScore(
    score,
    personalWarningScore !== null && personalWarningScore >= 70,
    8,
    riskNotes,
    "This resembles situations where the user has made repeated execution mistakes."
  );

  if (context.vwapState === "reclaim" && setup.slug.includes("reclaim")) {
    score += 5;
    reasons.push("VWAP/reclaim context matches the setup.");
  }

  if (context.vwapState === "rejection" && setup.slug.includes("rejection")) {
    score += 5;
    reasons.push("VWAP/rejection context matches the setup.");
  }

  if (
    context.structureState === "sweep_reclaim" &&
    setup.slug.includes("sweep_reclaim")
  ) {
    score += 6;
    reasons.push("Liquidity sweep and reclaim structure matches the setup.");
  }

  if (
    context.structureState === "sweep_rejection" &&
    setup.slug.includes("sweep_rejection")
  ) {
    score += 6;
    reasons.push("Liquidity sweep and rejection structure matches the setup.");
  }

  if (
    context.structureState === "failed_breakout" &&
    setup.slug.includes("failed_breakout")
  ) {
    score += 6;
    reasons.push("Failed breakout structure matches the setup.");
  }

  if (
    context.structureState === "failed_breakdown" &&
    setup.slug.includes("failed_breakdown")
  ) {
    score += 6;
    reasons.push("Failed breakdown reclaim structure matches the setup.");
  }

  for (const flag of context.riskFlags ?? []) {
    score -= 3;
    riskNotes.push(flag);
  }

  for (const flag of context.trapFlags ?? []) {
    score -= 4;
    riskNotes.push(flag);
  }

  if (missingData.length >= 3) {
    score -= 5;
    riskNotes.push("Several data points are missing; confidence is reduced.");
  }

  if (hasSevereRisk(context)) {
    score -= 30;
    rejectionReasons.push("Severe execution or liquidity risk detected.");
  }

  let calibratedScore = clampScore(score);

  const hasFallbackStructure = hasRiskFlag(context, [
    "fallback trade plan",
    "structure data is missing",
    "fallback plan",
  ]);

  const hasNoChaseRisk = hasRiskFlag(context, [
    "no chase",
    "late",
    "atr extension",
    "extended",
    "too far from entry",
  ]);

  const hasPersonalPremarketFingerprint = setup.slug.includes("personal_premarket_short_fingerprint");

  if (riskRewardRatio === null) {
    calibratedScore = capScore(
      calibratedScore,
      78,
      riskNotes,
      "Risk/reward is missing; candidate can only be watch/armed until a valid trade plan exists."
    );
  }

  if (riskRewardRatio !== null && riskRewardRatio < 2) {
    calibratedScore = capScore(
      calibratedScore,
      84,
      riskNotes,
      "Risk/reward is below 2R; active signal is capped until the plan improves."
    );
  }

  if (priceActionScore === null || candlePatternScore === null || chartPatternScore === null) {
    calibratedScore = capScore(
      calibratedScore,
      86,
      riskNotes,
      "Full price-action pattern confirmation is missing; confidence is capped."
    );
  }

  if (priceActionScore !== null && priceActionScore < 62) {
    calibratedScore = capScore(
      calibratedScore,
      82,
      riskNotes,
      "Price-action alignment is not strong enough for an active signal."
    );
  }

  if (entryQuality === null || entryQuality < 68) {
    calibratedScore = capScore(
      calibratedScore,
      84,
      riskNotes,
      "Entry quality is not strong enough for active status."
    );
  }

  if (stopQuality === null || stopQuality < 65) {
    calibratedScore = capScore(
      calibratedScore,
      84,
      riskNotes,
      "Stop/invalidation quality is not strong enough for active status."
    );
  }

  if (targetRoomQuality === null || targetRoomQuality < 62) {
    calibratedScore = capScore(
      calibratedScore,
      84,
      riskNotes,
      "Target room is not strong enough for active status."
    );
  }

  if (hasFallbackStructure) {
    calibratedScore = capScore(
      calibratedScore,
      82,
      riskNotes,
      "Fallback structure is active; candidate should remain armed/watch until real candles confirm."
    );
  }

  if (hasNoChaseRisk) {
    calibratedScore = capScore(
      calibratedScore,
      82,
      riskNotes,
      "No-chase filter capped the signal because price is extended or late."
    );
  }

  if (hasPersonalPremarketFingerprint) {
    const hasStrongPersonalConfirmation =
      (priceActionScore ?? 0) >= 75 &&
      (entryQuality ?? 0) >= 72 &&
      (stopQuality ?? 0) >= 68 &&
      (riskRewardRatio ?? 0) >= 2;

    if (!hasStrongPersonalConfirmation) {
      calibratedScore = capScore(
        calibratedScore,
        86,
        riskNotes,
        "Personal premarket fingerprint matched, but it still needs VWAP/lower-high/failed-breakout confirmation."
      );
    }
  }

  if (missingData.length >= 4) {
    calibratedScore = capScore(
      calibratedScore,
      82,
      riskNotes,
      "Too much setup data is missing for active status."
    );
  }

  const confidenceScore = calibratedScore;
  const confidenceTier = getTier(confidenceScore);

  if (confidenceScore < setup.minimumConfidenceForAlert) {
    rejectionReasons.push(
      `Confidence below setup threshold ${setup.minimumConfidenceForAlert}.`
    );
  }

  if (riskNotes.length >= 7) {
    rejectionReasons.push("Too many active risk notes for a premium alert.");
  }

  const shouldAlert =
    confidenceScore >= Math.max(88, setup.minimumConfidenceForAlert) &&
    confidenceTier !== "REJECTED" &&
    rejectionReasons.length === 0;

  return {
    symbol: context.symbol,
    setupSlug: setup.slug,
    setupName: setup.name,
    direction: context.direction,
    confidenceScore,
    confidenceTier,
    shouldAlert,
    reasons,
    riskNotes,
    missingData,
    rejectionReasons,
    setup,
  };
}

export function buildSkillEdgeSignalExplanationFrame(
  result: SkillEdgeConfidenceResult
) {
  return {
    symbol: result.symbol,
    setup: result.setupName,
    direction: result.direction,
    confidenceScore: result.confidenceScore,
    confidenceTier: result.confidenceTier,
    shouldAlert: result.shouldAlert,
    whySignalFired: result.reasons.slice(0, 6),
    riskWarnings:
      result.riskNotes.length > 0
        ? result.riskNotes.slice(0, 6)
        : result.setup.riskWarnings.slice(0, 3),
    invalidationLogic: result.setup.stopLogic,
    targetLogic: result.setup.targetLogic,
    confirmationChecklist: result.setup.checklist,
    educationNote: result.setup.educationNote,
    rejectionReasons: result.rejectionReasons,
  };
}

