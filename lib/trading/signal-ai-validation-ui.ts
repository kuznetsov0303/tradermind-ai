import {
  buildSkillEdgeSignalQualityProfile,
  type SkillEdgeSignalQualityProfile,
} from "./signal-quality-profile";
export type SkillEdgeAiValidationUiTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "premium";

export type SkillEdgeAiValidationUiBadge = {
  label: string;
  tone: SkillEdgeAiValidationUiTone;
  description: string;
};

export type SkillEdgeAiValidationUiGate = {
  label: string;
  passed: boolean;
  severity: "blocker" | "warning" | "info";
  reason: string;
};

export type SkillEdgeAiValidationUiPanel = {
  available: boolean;
  version: string | null;
  verdict: string | null;
  grade: string | null;
  score: number | null;
  setupFitScore: number | null;
  riskScore: number | null;
  dataCompletenessScore: number | null;
  deliveryEligible: boolean;
  deliveryChannel: string | null;
  headlineBadge: SkillEdgeAiValidationUiBadge;
  deliveryBadge: SkillEdgeAiValidationUiBadge;
  qualityBadges: SkillEdgeAiValidationUiBadge[];
  gates: SkillEdgeAiValidationUiGate[];
  passedChecks: string[];
  failedChecks: string[];
  blockedReasons: string[];
  missingConfirmations: string[];
  weakPoints: string[];
  riskWarnings: string[];
  entryReview: string | null;
  stopReview: string | null;
  targetReview: string | null;
  rrReview: string | null;
  managementPlan: string[];
  shortSummary: string;
  qualityProfile: SkillEdgeSignalQualityProfile;
};

export type SkillEdgeAiValidationAnalytics = {
  total: number;
  validationLoaded: number;
  approved: number;
  needsConfirmation: number;
  watchOnly: number;
  rejected: number;
  deliveryEligible: number;
  deliveryBlocked: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  averageScore: number | null;
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
    const parsed = Number(value);

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function readArray(source: Record<string, unknown>, key: string) {
  const value = source[key];

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  return [];
}

function readRecordArray(source: Record<string, unknown>, key: string) {
  const value = source[key];

  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getVerdictBadge(verdict: string | null, grade: string | null, score: number | null): SkillEdgeAiValidationUiBadge {
  if (verdict === "approved") {
    return {
      label: `Approved${grade ? ` · Grade ${grade}` : ""}`,
      tone: grade === "A" ? "premium" : "success",
      description: score !== null ? `Validator score ${score}. Signal passed strict gates.` : "Signal passed strict gates.",
    };
  }

  if (verdict === "needs_confirmation") {
    return {
      label: "Needs confirmation",
      tone: "warning",
      description: "Signal idea exists, but one or more confirmations are still missing.",
    };
  }

  if (verdict === "watch_only") {
    return {
      label: "Watch only",
      tone: "neutral",
      description: "Observation only. Not an actionable premium alert yet.",
    };
  }

  if (verdict === "rejected") {
    return {
      label: "Rejected",
      tone: "danger",
      description: "Hard gates failed. Signal should not be treated as tradable.",
    };
  }

  return {
    label: "Not validated",
    tone: "neutral",
    description: "AI validation is not available for this signal yet.",
  };
}

function getDeliveryBadge(deliveryEligible: boolean, deliveryChannel: string | null): SkillEdgeAiValidationUiBadge {
  if (deliveryEligible) {
    return {
      label: "Delivery eligible",
      tone: "success",
      description: deliveryChannel || "Ready for future premium delivery gates.",
    };
  }

  return {
    label: "Site only",
    tone: "neutral",
    description: "Blocked from Telegram/widget delivery by validator gates.",
  };
}

function getScoreBadge(label: string, score: number | null): SkillEdgeAiValidationUiBadge {
  if (score === null) {
    return {
      label: `${label}: n/a`,
      tone: "neutral",
      description: "Score is not available.",
    };
  }

  if (score >= 85) {
    return {
      label: `${label}: ${score}`,
      tone: "premium",
      description: "Strong validation component.",
    };
  }

  if (score >= 70) {
    return {
      label: `${label}: ${score}`,
      tone: "success",
      description: "Acceptable validation component.",
    };
  }

  if (score >= 55) {
    return {
      label: `${label}: ${score}`,
      tone: "warning",
      description: "Needs improvement or extra confirmation.",
    };
  }

  return {
    label: `${label}: ${score}`,
    tone: "danger",
    description: "Weak validation component.",
  };
}

export function buildSkillEdgeAiValidationUiPanel(sourceData: unknown): SkillEdgeAiValidationUiPanel {
  const sourceRecord = isRecord(sourceData) ? sourceData : {};
  const validation = isRecord(sourceRecord.aiValidation)
    ? sourceRecord.aiValidation
    : isRecord(sourceData)
      ? sourceData
      : null;

  if (!validation) {
    const headlineBadge = getVerdictBadge(null, null, null);

    return {
      available: false,
      version: null,
      verdict: null,
      grade: null,
      score: null,
      setupFitScore: null,
      riskScore: null,
      dataCompletenessScore: null,
      deliveryEligible: false,
      deliveryChannel: null,
      headlineBadge,
      deliveryBadge: getDeliveryBadge(false, null),
      qualityBadges: [],
      gates: [],
      passedChecks: [],
      failedChecks: [],
      blockedReasons: [],
      missingConfirmations: [],
      weakPoints: [],
      riskWarnings: [],
      entryReview: null,
      stopReview: null,
      targetReview: null,
      rrReview: null,
      managementPlan: [],
      shortSummary: headlineBadge.description,
      qualityProfile: buildSkillEdgeSignalQualityProfile(null),
    };
  }

  const version = readText(validation, "version");
  const verdict = readText(validation, "verdict");
  const grade = readText(validation, "grade");
  const score = readNumber(validation, "score");
  const setupFitScore = readNumber(validation, "setupFitScore");
  const riskScore = readNumber(validation, "riskScore");
  const dataCompletenessScore = readNumber(validation, "dataCompletenessScore");
  const deliveryEligibility = isRecord(validation.deliveryEligibility) ? validation.deliveryEligibility : {};
  const deliveryEligible = deliveryEligibility.eligible === true;
  const deliveryChannel = readText(deliveryEligibility, "channel");
  const headlineBadge = getVerdictBadge(verdict, grade, score);
  const deliveryBadge = getDeliveryBadge(deliveryEligible, deliveryChannel);
  const gates = readRecordArray(validation, "gates").map((gate) => ({
    label: readText(gate, "label") || readText(gate, "code") || "Gate",
    passed: gate.passed === true,
    severity:
      gate.severity === "blocker" || gate.severity === "warning" || gate.severity === "info"
        ? gate.severity
        : "info",
    reason: readText(gate, "reason") || "",
  }));

  const blockedReasons = readArray(validation, "blockedReasons");
  const missingConfirmations = readArray(validation, "missingConfirmations");
  const weakPoints = readArray(validation, "weakPoints");
  const riskWarnings = readArray(validation, "riskWarnings");
  const qualityProfile = buildSkillEdgeSignalQualityProfile(validation);

  return {
    available: true,
    version,
    verdict,
    grade,
    score,
    setupFitScore,
    riskScore,
    dataCompletenessScore,
    deliveryEligible,
    deliveryChannel,
    headlineBadge,
    deliveryBadge,
    qualityBadges: [
      getScoreBadge("Setup fit", setupFitScore),
      getScoreBadge("Risk", riskScore),
      getScoreBadge("Data", dataCompletenessScore),
    ],
    gates,
    passedChecks: readArray(validation, "passedChecks"),
    failedChecks: readArray(validation, "failedChecks"),
    blockedReasons,
    missingConfirmations,
    weakPoints,
    riskWarnings,
    entryReview: readText(validation, "entryReview"),
    stopReview: readText(validation, "stopReview"),
    targetReview: readText(validation, "targetReview"),
    rrReview: readText(validation, "rrReview"),
    managementPlan: readArray(validation, "managementPlan"),
    shortSummary:
      readText(validation, "summary") ||
      `${headlineBadge.label}. ${deliveryBadge.label}. ${blockedReasons[0] || missingConfirmations[0] || headlineBadge.description}`,
  };
}

export function buildSkillEdgeAiValidationAnalytics(rows: Array<Record<string, unknown>>): SkillEdgeAiValidationAnalytics {
  const panels = rows.map((row) =>
    buildSkillEdgeAiValidationUiPanel(row.source_data || row.sourceData || row.ai_validation || row.aiValidation),
  );
  const loadedPanels = panels.filter((panel) => panel.available);
  const scores = loadedPanels
    .map((panel) => panel.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  return {
    total: rows.length,
    validationLoaded: loadedPanels.length,
    approved: loadedPanels.filter((panel) => panel.verdict === "approved").length,
    needsConfirmation: loadedPanels.filter((panel) => panel.verdict === "needs_confirmation").length,
    watchOnly: loadedPanels.filter((panel) => panel.verdict === "watch_only").length,
    rejected: loadedPanels.filter((panel) => panel.verdict === "rejected").length,
    deliveryEligible: loadedPanels.filter((panel) => panel.deliveryEligible).length,
    deliveryBlocked: loadedPanels.filter((panel) => !panel.deliveryEligible).length,
    gradeA: loadedPanels.filter((panel) => panel.grade === "A").length,
    gradeB: loadedPanels.filter((panel) => panel.grade === "B").length,
    gradeC: loadedPanels.filter((panel) => panel.grade === "C").length,
    gradeD: loadedPanels.filter((panel) => panel.grade === "D").length,
    averageScore:
      scores.length > 0
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
  };
}

export function getSkillEdgeAiValidationUiDiagnostics() {
  return {
    version: "3B-4H",
    module: "signal-ai-validation-ui",
    purpose: "UI-ready AI validation panel, analytics and quality profile foundation",
    deliveryTouched: false,
    telegramTouched: false,
    siteWidgetTouched: false,
  };
}