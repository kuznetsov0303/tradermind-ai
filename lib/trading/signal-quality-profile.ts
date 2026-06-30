export type SkillEdgeSignalQualityTier =
  | "premium_ready"
  | "tradable_needs_confirmation"
  | "watch_only"
  | "blocked_by_risk"
  | "low_data_quality";

export type SkillEdgeSignalQualityTone =
  | "premium"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export type SkillEdgeSignalQualityProfile = {
  version: "3B-4H";
  tier: SkillEdgeSignalQualityTier;
  label: string;
  tone: SkillEdgeSignalQualityTone;
  score: number;
  sortRank: number;
  deliveryReady: boolean;
  canBeTelegramCandidate: boolean;
  clientAction: string;
  reasons: string[];
  upgradePath: string[];
  downgradeReasons: string[];
  tags: string[];
  components: {
    validationScore: number | null;
    setupFitScore: number | null;
    riskScore: number | null;
    dataCompletenessScore: number | null;
    rr: number | null;
    gatesPassed: number;
    gatesTotal: number;
    blockerFailures: number;
    warningFailures: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readText(source: Record<string, unknown>, key: string) {
  const value = source[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function readArray(source: Record<string, unknown>, key: string) {
  const value = source[key];

  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function normalizeValidationSource(source: unknown) {
  if (!isRecord(source)) return null;

  if (isRecord(source.aiValidation)) return source.aiValidation;

  if (isRecord(source.source_data) && isRecord(source.source_data.aiValidation)) {
    return source.source_data.aiValidation;
  }

  if (isRecord(source.sourceData) && isRecord(source.sourceData.aiValidation)) {
    return source.sourceData.aiValidation;
  }

  return source;
}

function readDeliveryReady(validation: Record<string, unknown>) {
  const deliveryEligibility = validation.deliveryEligibility;

  return isRecord(deliveryEligibility) && deliveryEligibility.eligible === true;
}

function readGateStats(validation: Record<string, unknown>) {
  const rawGates = validation.gates;

  if (!Array.isArray(rawGates)) {
    return {
      gatesPassed: 0,
      gatesTotal: 0,
      blockerFailures: 0,
      warningFailures: 0,
    };
  }

  const gates = rawGates.filter(isRecord);
  const failedGates = gates.filter((gate) => gate.passed !== true);

  return {
    gatesPassed: gates.filter((gate) => gate.passed === true).length,
    gatesTotal: gates.length,
    blockerFailures: failedGates.filter((gate) => gate.severity === "blocker").length,
    warningFailures: failedGates.filter((gate) => gate.severity === "warning").length,
  };
}

function readRr(validation: Record<string, unknown>) {
  const direct =
    readNumber(validation, "rr") ||
    readNumber(validation, "riskReward") ||
    readNumber(validation, "risk_reward");

  if (direct !== null) return direct;

  const rrReview = readText(validation, "rrReview");

  if (!rrReview) return null;

  const match = rrReview.match(/([0-9]+(?:\.[0-9]+)?)R/i);

  return match ? Number(match[1]) : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueRows(rows: string[]) {
  return Array.from(new Set(rows.filter(Boolean)));
}

function makeLowDataProfile(reason: string): SkillEdgeSignalQualityProfile {
  return {
    version: "3B-4H",
    tier: "low_data_quality",
    label: "Low data quality",
    tone: "neutral",
    score: 0,
    sortRank: 10,
    deliveryReady: false,
    canBeTelegramCandidate: false,
    clientAction: "Use as context only until AI validation data is available.",
    reasons: [reason],
    upgradePath: [
      "Load AI validation.",
      "Require setup, entry, stop, targets and R:R.",
      "Re-check with complete source_data.",
    ],
    downgradeReasons: [reason],
    tags: ["low_data_quality", "not_ready"],
    components: {
      validationScore: null,
      setupFitScore: null,
      riskScore: null,
      dataCompletenessScore: null,
      rr: null,
      gatesPassed: 0,
      gatesTotal: 0,
      blockerFailures: 0,
      warningFailures: 0,
    },
  };
}

export function buildSkillEdgeSignalQualityProfile(
  validationSource: unknown,
): SkillEdgeSignalQualityProfile {
  const validation = normalizeValidationSource(validationSource);

  if (!validation) {
    return makeLowDataProfile("AI validation is missing.");
  }

  const verdict = readText(validation, "verdict");
  const grade = readText(validation, "grade");
  const validationScore = readNumber(validation, "score");
  const setupFitScore = readNumber(validation, "setupFitScore");
  const riskScore = readNumber(validation, "riskScore");
  const dataCompletenessScore = readNumber(validation, "dataCompletenessScore");
  const rr = readRr(validation);
  const deliveryReady = readDeliveryReady(validation);
  const gates = readGateStats(validation);

  const blockedReasons = readArray(validation, "blockedReasons");
  const missingConfirmations = readArray(validation, "missingConfirmations");
  const weakPoints = readArray(validation, "weakPoints");
  const riskWarnings = readArray(validation, "riskWarnings");
  const failedChecks = readArray(validation, "failedChecks");

  const allProblems = uniqueRows([
    ...blockedReasons,
    ...missingConfirmations,
    ...weakPoints,
    ...riskWarnings,
    ...failedChecks,
  ]);

  const baseScore = validationScore ?? 0;
  const dataPenalty = dataCompletenessScore !== null && dataCompletenessScore < 70 ? 8 : 0;
  const riskPenalty = riskScore !== null && riskScore < 60 ? 8 : 0;
  const blockerPenalty = gates.blockerFailures * 12;
  const warningPenalty = gates.warningFailures * 4;
  const rrBonus = rr !== null && rr >= 3 ? 4 : rr !== null && rr >= 2 ? 2 : 0;

  const qualityScore = clampScore(
    baseScore - dataPenalty - riskPenalty - blockerPenalty - warningPenalty + rrBonus,
  );

  const components = {
    validationScore,
    setupFitScore,
    riskScore,
    dataCompletenessScore,
    rr,
    gatesPassed: gates.gatesPassed,
    gatesTotal: gates.gatesTotal,
    blockerFailures: gates.blockerFailures,
    warningFailures: gates.warningFailures,
  };

  if (
    verdict === "approved" &&
    deliveryReady &&
    gates.blockerFailures === 0 &&
    qualityScore >= 82 &&
    (grade === "A" || grade === "B")
  ) {
    return {
      version: "3B-4H",
      tier: "premium_ready",
      label: "Premium-ready",
      tone: grade === "A" ? "premium" : "success",
      score: qualityScore,
      sortRank: 100,
      deliveryReady,
      canBeTelegramCandidate: true,
      clientAction:
        "Review execution conditions, confirm price is still near the plan, then manage from invalidation.",
      reasons: [
        "Approved by strict validator gates.",
        "Delivery-ready for premium channels.",
        rr !== null ? `R:R structure: ${rr}R.` : "R:R structure is present.",
      ],
      upgradePath: [
        "Keep entry close to the planned zone.",
        "Do not chase if R:R compresses below 2R.",
        "Track outcome after signal resolves.",
      ],
      downgradeReasons: allProblems.slice(0, 6),
      tags: ["premium_ready", "approved", "delivery_ready"],
      components,
    };
  }

  if (verdict === "approved") {
    return {
      version: "3B-4H",
      tier: "tradable_needs_confirmation",
      label: "Approved, monitor execution",
      tone: "success",
      score: qualityScore,
      sortRank: 80,
      deliveryReady,
      canBeTelegramCandidate: deliveryReady && qualityScore >= 78,
      clientAction:
        "Treat as tradable only if the current trigger, entry, stop, targets and R:R are still valid.",
      reasons: [
        "Validator approved the setup.",
        deliveryReady ? "Delivery gate is ready." : "Delivery gate is not ready yet.",
      ],
      upgradePath: [
        "Confirm trigger is still fresh.",
        "Confirm stop/invalidation is still logical.",
        "Confirm TP1 still gives at least 2R.",
      ],
      downgradeReasons: allProblems.slice(0, 6),
      tags: ["approved", deliveryReady ? "delivery_ready" : "site_only"],
      components,
    };
  }

  if (verdict === "needs_confirmation") {
    return {
      version: "3B-4H",
      tier: "tradable_needs_confirmation",
      label: "Needs confirmation",
      tone: "warning",
      score: qualityScore,
      sortRank: 60,
      deliveryReady: false,
      canBeTelegramCandidate: false,
      clientAction:
        "Keep on the desk, but wait for the missing confirmation before treating it as actionable.",
      reasons:
        missingConfirmations.length > 0
          ? missingConfirmations.slice(0, 4)
          : ["Signal still needs confirmation."],
      upgradePath: [
        "Wait for lifecycle upgrade.",
        "Require entry, stop, targets and R:R to remain valid.",
        "Require trigger confirmation before delivery.",
      ],
      downgradeReasons: allProblems.slice(0, 6),
      tags: ["needs_confirmation", "site_only"],
      components,
    };
  }

  if (verdict === "watch_only") {
    return {
      version: "3B-4H",
      tier: "watch_only",
      label: "Watch only",
      tone: "neutral",
      score: qualityScore,
      sortRank: 40,
      deliveryReady: false,
      canBeTelegramCandidate: false,
      clientAction:
        "Do not trade yet. Use it as a watch candidate until structure and trigger confirm.",
      reasons:
        weakPoints.length > 0
          ? weakPoints.slice(0, 4)
          : ["Observation only. No actionable trigger yet."],
      upgradePath: [
        "Wait for 5m structure confirmation.",
        "Wait for entry zone to become valid.",
        "Require stop and targets with at least 2R.",
      ],
      downgradeReasons: allProblems.slice(0, 6),
      tags: ["watch_only", "not_actionable"],
      components,
    };
  }

  if (verdict === "rejected" || gates.blockerFailures > 0) {
    return {
      version: "3B-4H",
      tier: "blocked_by_risk",
      label: "Blocked by risk",
      tone: "danger",
      score: qualityScore,
      sortRank: 20,
      deliveryReady: false,
      canBeTelegramCandidate: false,
      clientAction: "Do not trade. Hard gates or risk blockers failed.",
      reasons:
        blockedReasons.length > 0
          ? blockedReasons.slice(0, 5)
          : allProblems.slice(0, 5),
      upgradePath: [
        "Fix blocker conditions first.",
        "Recalculate entry, stop and targets.",
        "Require at least 2R and a valid trigger.",
      ],
      downgradeReasons: allProblems.slice(0, 8),
      tags: ["blocked", "risk", "not_actionable"],
      components,
    };
  }

  return {
    version: "3B-4H",
    tier: "low_data_quality",
    label: "Low data quality",
    tone: "neutral",
    score: qualityScore,
    sortRank: 10,
    deliveryReady: false,
    canBeTelegramCandidate: false,
    clientAction: "Use as context only until the signal has enough data.",
    reasons:
      allProblems.length > 0
        ? allProblems.slice(0, 5)
        : ["Signal quality cannot be fully evaluated yet."],
    upgradePath: [
      "Require complete validation data.",
      "Require clean setup match.",
      "Require risk/reward and lifecycle confirmation.",
    ],
    downgradeReasons: allProblems.slice(0, 8),
    tags: ["low_data_quality", "site_only"],
    components,
  };
}

export function getSkillEdgeSignalQualityProfileDiagnostics() {
  return {
    version: "3B-4H",
    module: "signal-quality-profile",
    deliveryTouched: false,
    telegramTouched: false,
    siteWidgetTouched: false,
    tiers: [
      "premium_ready",
      "tradable_needs_confirmation",
      "watch_only",
      "blocked_by_risk",
      "low_data_quality",
    ],
  };
}