import {
  buildSkillEdgePlaybookRagQueryFromSignal,
  retrieveSkillEdgePlaybookRagContext,
  type SkillEdgePlaybookRagContext,
} from "./playbook-rag";

export type SkillEdgeSignalValidationVerdict =
  | "approved"
  | "watch_only"
  | "needs_confirmation"
  | "rejected";

export type SkillEdgeSignalValidationGrade = "A" | "B" | "C" | "D";

export type SkillEdgeSignalValidationCandidate = Record<string, unknown>;

export type SkillEdgeValidationGateSeverity = "blocker" | "warning" | "info";

export type SkillEdgeSignalValidationGate = {
  code: string;
  label: string;
  passed: boolean;
  severity: SkillEdgeValidationGateSeverity;
  reason: string;
};

export type SkillEdgeRequiredDataStatus = {
  key: string;
  label: string;
  required: boolean;
  critical: boolean;
  present: boolean;
  reason: string;
};

export type SkillEdgeDeliveryEligibility = {
  eligible: boolean;
  channel: "site_only" | "site_widget_telegram_ready";
  reasons: string[];
};

export type SkillEdgeSignalValidationInput = {
  candidate: SkillEdgeSignalValidationCandidate;
  userContext?: Record<string, unknown> | null;
  playbookContext?: SkillEdgePlaybookRagContext | null;
};

export type SkillEdgeSignalValidationResult = {
  version: "3B-4B-2";
  verdict: SkillEdgeSignalValidationVerdict;
  grade: SkillEdgeSignalValidationGrade;
  score: number;
  setupFitScore: number;
  riskScore: number;
  dataCompletenessScore: number;
  playbookMatched: boolean;
  setupSlug: string | null;
  setupName: string | null;
  assetType: string | null;
  symbol: string | null;
  direction: string | null;
  status: string | null;
  deliveryEligibility: SkillEdgeDeliveryEligibility;
  requiredDataStatus: SkillEdgeRequiredDataStatus[];
  gates: SkillEdgeSignalValidationGate[];
  passedChecks: string[];
  failedChecks: string[];
  blockedReasons: string[];
  summary: string;
  setupFit: string[];
  missingConfirmations: string[];
  weakPoints: string[];
  riskWarnings: string[];
  entryReview: string;
  stopReview: string;
  targetReview: string;
  rrReview: string;
  managementPlan: string[];
  validatorPromptBlock: string;
  sourceData: {
    validatorVersion: "3B-4B-2";
    playbookRagVersion: string;
    playbookDocumentCount: number;
    hardGatesPassed: boolean;
    deliveryEligible: boolean;
    playbookHits: Array<{
      id: string;
      setupSlug: string;
      section: string;
      score: number;
    }>;
    requiredDataStatus: SkillEdgeRequiredDataStatus[];
    gates: SkillEdgeSignalValidationGate[];
    candidateSnapshot: Record<string, unknown>;
    userContextSnapshot: Record<string, unknown> | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string") {
      const parsed = Number(value.replace(/[%,$\s]/g, ""));

      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function readNestedRecord(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (isRecord(value)) return value;
  }

  return null;
}

function readDeepText(source: Record<string, unknown>, keys: string[]) {
  const direct = readText(source, keys);

  if (direct) return direct;

  const nestedSources = [
    readNestedRecord(source, ["plan", "tradePlan"]),
    readNestedRecord(source, ["source_data", "sourceData"]),
    readNestedRecord(source, ["technical_snapshot", "technicalSnapshot"]),
    readNestedRecord(source, ["fundamental_snapshot", "fundamentalSnapshot"]),
    readNestedRecord(source, ["news_snapshot", "newsSnapshot"]),
  ].filter(isRecord);

  for (const nested of nestedSources) {
    const nestedText = readText(nested, keys);

    if (nestedText) return nestedText;
  }

  return null;
}

function readDeepNumber(source: Record<string, unknown>, keys: string[]) {
  const direct = readNumber(source, keys);

  if (direct !== null) return direct;

  const nestedSources = [
    readNestedRecord(source, ["plan", "tradePlan"]),
    readNestedRecord(source, ["source_data", "sourceData"]),
    readNestedRecord(source, ["technical_snapshot", "technicalSnapshot"]),
    readNestedRecord(source, ["fundamental_snapshot", "fundamentalSnapshot"]),
    readNestedRecord(source, ["news_snapshot", "newsSnapshot"]),
  ].filter(isRecord);

  for (const nested of nestedSources) {
    const nestedNumber = readNumber(nested, keys);

    if (nestedNumber !== null) return nestedNumber;
  }

  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueRows(rows: string[]) {
  return Array.from(new Set(rows.filter((row) => row.trim().length > 0)));
}

function normalizeStatus(status: string | null) {
  if (!status) return null;

  const value = status.toLowerCase();

  if (value === "active") return "active";
  if (value === "armed") return "armed";
  if (value === "watch") return "watch";

  return value;
}

function getCandidateSetupSlug(candidate: Record<string, unknown>) {
  const direct =
    readText(candidate, ["setup_slug", "setupSlug", "setup_type", "setupType", "setup"]) ||
    null;

  if (direct) return direct;

  const alertKey = readText(candidate, ["alert_key", "alertKey", "key"]);

  if (alertKey?.includes(":")) return alertKey.split(":")[0] || null;

  return alertKey;
}

function getCandidateAssetType(candidate: Record<string, unknown>) {
  return readText(candidate, ["asset_type", "assetType", "market_type", "marketType"]);
}

function getCandidateDirection(candidate: Record<string, unknown>) {
  const direction = readText(candidate, ["direction", "side"]);

  if (!direction) return null;

  const normalized = direction.toLowerCase();

  if (normalized === "long" || normalized === "short") return normalized;

  return direction;
}

function getCandidateStatus(candidate: Record<string, unknown>) {
  return normalizeStatus(readText(candidate, ["status", "lifecycle", "state"]));
}

function getCandidateSymbol(candidate: Record<string, unknown>) {
  return readText(candidate, ["symbol", "ticker"]);
}

function getCandidateReason(candidate: Record<string, unknown>) {
  return readDeepText(candidate, ["reason", "explanation", "thesis", "summary"]);
}

function getCandidateEntry(candidate: Record<string, unknown>) {
  return readDeepText(candidate, [
    "entry",
    "entry_zone",
    "entryZone",
    "entry_price",
    "entryPrice",
    "trigger",
    "trigger_price",
    "triggerPrice",
  ]);
}

function getCandidateStop(candidate: Record<string, unknown>) {
  return readDeepText(candidate, [
    "stop",
    "stop_loss",
    "stopLoss",
    "stop_price",
    "stopPrice",
    "invalidation",
    "invalidated_below",
    "invalidated_above",
  ]);
}

function getCandidateTargets(candidate: Record<string, unknown>) {
  const direct =
    candidate.targets ||
    candidate.take_profit ||
    candidate.takeProfit ||
    candidate.tp ||
    candidate.target;

  if (Array.isArray(direct)) {
    return direct.map((value) => String(value)).filter(Boolean);
  }

  if (typeof direct === "string" && direct.trim()) {
    return [direct.trim()];
  }

  const nestedSources = [
    readNestedRecord(candidate, ["plan", "tradePlan"]),
    readNestedRecord(candidate, ["source_data", "sourceData"]),
  ].filter(isRecord);

  for (const nested of nestedSources) {
    const nestedTargets =
      nested.targets || nested.take_profit || nested.takeProfit || nested.tp || nested.target;

    if (Array.isArray(nestedTargets)) {
      return nestedTargets.map((value) => String(value)).filter(Boolean);
    }

    if (typeof nestedTargets === "string" && nestedTargets.trim()) {
      return [nestedTargets.trim()];
    }
  }

  return [];
}

function getCandidateRr(candidate: Record<string, unknown>) {
  return readDeepNumber(candidate, [
    "rr",
    "risk_reward",
    "riskReward",
    "reward_to_risk",
    "rewardToRisk",
    "tp1_r",
    "tp1R",
  ]);
}

function getCandidateConfidence(candidate: Record<string, unknown>) {
  return readDeepNumber(candidate, [
    "confidence",
    "score",
    "confluence_score",
    "confluenceScore",
    "validation_score",
    "validationScore",
  ]);
}

function getCandidateVolume(candidate: Record<string, unknown>) {
  return readDeepNumber(candidate, [
    "volume",
    "session_volume",
    "sessionVolume",
    "premarket_volume",
    "premarketVolume",
  ]);
}

function getCandidateRvol(candidate: Record<string, unknown>) {
  return readDeepNumber(candidate, [
    "rvol",
    "relative_volume",
    "relativeVolume",
  ]);
}

function getCandidateTrendState(candidate: Record<string, unknown>) {
  return readDeepText(candidate, [
    "trend_state",
    "trendState",
    "trend_bias",
    "trendBias",
    "structure",
    "market_structure",
    "marketStructure",
  ]);
}

function getCandidateCatalyst(candidate: Record<string, unknown>) {
  return readDeepText(candidate, [
    "catalyst",
    "news",
    "latestTitle",
    "latest_news",
    "latestNews",
    "catalystTags",
  ]);
}

function hasTechnicalContext(candidate: Record<string, unknown>) {
  return Boolean(
    readNestedRecord(candidate, ["technical_snapshot", "technicalSnapshot"]) ||
      getCandidateTrendState(candidate) ||
      getCandidateVolume(candidate) !== null ||
      getCandidateRvol(candidate) !== null,
  );
}

function hasFundamentalOrNewsContext(candidate: Record<string, unknown>) {
  return Boolean(
    readNestedRecord(candidate, ["fundamental_snapshot", "fundamentalSnapshot"]) ||
      readNestedRecord(candidate, ["news_snapshot", "newsSnapshot"]) ||
      getCandidateCatalyst(candidate),
  );
}

function buildRequiredDataStatus(candidate: Record<string, unknown>): SkillEdgeRequiredDataStatus[] {
  const assetType = getCandidateAssetType(candidate);
  const isStock = assetType === "stock" || assetType === "stocks";
  const isCrypto = assetType === "crypto";

  const rows: SkillEdgeRequiredDataStatus[] = [
    {
      key: "symbol",
      label: "Symbol",
      required: true,
      critical: true,
      present: Boolean(getCandidateSymbol(candidate)),
      reason: "Validator must know which ticker the signal belongs to.",
    },
    {
      key: "asset_type",
      label: "Asset type",
      required: true,
      critical: true,
      present: Boolean(assetType),
      reason: "Stock and crypto signals have different playbook requirements.",
    },
    {
      key: "direction",
      label: "Direction",
      required: true,
      critical: true,
      present: Boolean(getCandidateDirection(candidate)),
      reason: "Validator cannot approve without long/short direction.",
    },
    {
      key: "status",
      label: "Lifecycle status",
      required: true,
      critical: true,
      present: Boolean(getCandidateStatus(candidate)),
      reason: "WATCH / ARMED / ACTIVE controls delivery eligibility.",
    },
    {
      key: "setup_slug",
      label: "Setup slug",
      required: true,
      critical: true,
      present: Boolean(getCandidateSetupSlug(candidate)),
      reason: "Setup slug is needed to match the playbook/RAG rules.",
    },
    {
      key: "entry",
      label: "Entry / trigger",
      required: true,
      critical: true,
      present: Boolean(getCandidateEntry(candidate)),
      reason: "No actionable signal without an entry or trigger area.",
    },
    {
      key: "stop",
      label: "Stop / invalidation",
      required: true,
      critical: true,
      present: Boolean(getCandidateStop(candidate)),
      reason: "No premium signal without defined invalidation.",
    },
    {
      key: "targets",
      label: "Targets",
      required: true,
      critical: true,
      present: getCandidateTargets(candidate).length > 0,
      reason: "Targets are required to validate reward side.",
    },
    {
      key: "rr",
      label: "Risk/reward",
      required: true,
      critical: true,
      present: getCandidateRr(candidate) !== null,
      reason: "RR is required before approval or premium delivery.",
    },
    {
      key: "reason",
      label: "Reason / confluence",
      required: true,
      critical: false,
      present: Boolean(getCandidateReason(candidate)),
      reason: "Validator should know why the candidate exists.",
    },
    {
      key: "technical_context",
      label: "Technical context",
      required: true,
      critical: isStock || isCrypto,
      present: hasTechnicalContext(candidate),
      reason: "Signal needs structure, volume, trend, or technical snapshot.",
    },
    {
      key: "market_attention",
      label: "Market attention / volume",
      required: true,
      critical: isStock,
      present: getCandidateVolume(candidate) !== null || getCandidateRvol(candidate) !== null,
      reason: "Stock signal should not be approved without in-play volume/RVOL context.",
    },
    {
      key: "catalyst_or_news_context",
      label: "Catalyst / news context",
      required: false,
      critical: false,
      present: hasFundamentalOrNewsContext(candidate),
      reason: "Catalyst/news is not always mandatory, but improves validation quality.",
    },
  ];

  return rows;
}

function buildDataCompletenessScore(requiredDataStatus: SkillEdgeRequiredDataStatus[]) {
  const requiredRows = requiredDataStatus.filter((row) => row.required);
  const criticalRows = requiredRows.filter((row) => row.critical);
  const requiredScore =
    requiredRows.length > 0
      ? (requiredRows.filter((row) => row.present).length / requiredRows.length) * 70
      : 0;
  const criticalScore =
    criticalRows.length > 0
      ? (criticalRows.filter((row) => row.present).length / criticalRows.length) * 30
      : 0;

  return clampScore(requiredScore + criticalScore);
}

function buildSetupFitScore(params: {
  candidate: Record<string, unknown>;
  playbookContext: SkillEdgePlaybookRagContext;
}) {
  const setup = params.playbookContext.setup;
  const candidateDirection = getCandidateDirection(params.candidate);
  const assetType = getCandidateAssetType(params.candidate);
  const marketType =
    assetType === "stock" || assetType === "stocks"
      ? "stocks"
      : assetType === "crypto"
        ? "crypto"
        : null;

  let score = 30;

  if (setup) score += 30;

  if (setup && marketType && setup.marketTypes.includes(marketType)) {
    score += 15;
  }

  if (
    setup &&
    candidateDirection &&
    (setup.direction === "both" || setup.direction === candidateDirection)
  ) {
    score += 15;
  }

  if (params.playbookContext.hits.length >= 4) {
    score += 10;
  }

  return clampScore(score);
}

function buildRiskScore(candidate: Record<string, unknown>) {
  const status = getCandidateStatus(candidate);
  const rr = getCandidateRr(candidate);
  const confidence = getCandidateConfidence(candidate);
  const sourceData = readNestedRecord(candidate, ["source_data", "sourceData"]);
  const riskText = [
    readText(candidate, ["risk", "risk_note", "riskNote", "warning"]),
    sourceData ? readText(sourceData, ["risk", "risk_note", "riskNote", "warning"]) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let risk = 38;

  if (status === "active") risk += 10;
  if (status === "armed") risk += 6;
  if (status === "watch") risk -= 18;

  if (rr !== null && rr >= 3) risk += 22;
  else if (rr !== null && rr >= 2) risk += 16;
  else if (rr !== null && rr < 1.5) risk -= 25;
  else if (rr !== null && rr < 2) risk -= 14;
  else if (rr === null) risk -= 20;

  if (confidence !== null && confidence >= 88) risk += 12;
  else if (confidence !== null && confidence >= 80) risk += 6;
  else if (confidence !== null && confidence < 70) risk -= 12;

  if (/chase|extended|thin|spread|liquidity|offering|dilution|halt|trap/.test(riskText)) {
    risk -= 20;
  }

  return clampScore(risk);
}

function buildValidationGates(params: {
  candidate: Record<string, unknown>;
  playbookContext: SkillEdgePlaybookRagContext;
  requiredDataStatus: SkillEdgeRequiredDataStatus[];
  setupFitScore: number;
  riskScore: number;
  dataCompletenessScore: number;
}): SkillEdgeSignalValidationGate[] {
  const candidate = params.candidate;
  const status = getCandidateStatus(candidate);
  const rr = getCandidateRr(candidate);
  const targets = getCandidateTargets(candidate);
  const confidence = getCandidateConfidence(candidate);
  const hasCriticalMissing = params.requiredDataStatus.some((row) => row.critical && !row.present);

  return [
    {
      code: "playbook_match",
      label: "Playbook matched",
      passed: Boolean(params.playbookContext.setup),
      severity: "blocker",
      reason: "Candidate must match a known SkillEdge setup playbook.",
    },
    {
      code: "not_watch_status",
      label: "Not WATCH-only",
      passed: status !== "watch",
      severity: "blocker",
      reason: "WATCH candidates are observations, not premium actionable alerts.",
    },
    {
      code: "entry_present",
      label: "Entry present",
      passed: Boolean(getCandidateEntry(candidate)),
      severity: "blocker",
      reason: "No approval without entry or trigger area.",
    },
    {
      code: "stop_present",
      label: "Stop present",
      passed: Boolean(getCandidateStop(candidate)),
      severity: "blocker",
      reason: "No approval without invalidation.",
    },
    {
      code: "targets_present",
      label: "Targets present",
      passed: targets.length > 0,
      severity: "blocker",
      reason: "No approval without reward side.",
    },
    {
      code: "rr_min_2r",
      label: "RR >= 2R",
      passed: rr !== null && rr >= 2,
      severity: "blocker",
      reason: "Premium signals require at least 2R structure.",
    },
    {
      code: "critical_data_present",
      label: "Critical data present",
      passed: !hasCriticalMissing,
      severity: "blocker",
      reason: "Critical data fields must be present before approval.",
    },
    {
      code: "setup_fit_minimum",
      label: "Setup fit >= 65",
      passed: params.setupFitScore >= 65,
      severity: "warning",
      reason: "Setup must fit playbook logic.",
    },
    {
      code: "data_completeness_minimum",
      label: "Data completeness >= 70",
      passed: params.dataCompletenessScore >= 70,
      severity: "warning",
      reason: "Low completeness means validator should downgrade.",
    },
    {
      code: "risk_score_minimum",
      label: "Risk score >= 60",
      passed: params.riskScore >= 60,
      severity: "warning",
      reason: "Risk profile must be acceptable.",
    },
    {
      code: "confidence_minimum",
      label: "Confidence >= 75",
      passed: confidence === null || confidence >= 75,
      severity: "warning",
      reason: "Low source confidence should prevent premium delivery.",
    },
  ];
}

function gradeFromScore(score: number): SkillEdgeSignalValidationGrade {
  if (score >= 86) return "A";
  if (score >= 74) return "B";
  if (score >= 60) return "C";

  return "D";
}

function verdictFromGates(params: {
  score: number;
  status: string | null;
  gates: SkillEdgeSignalValidationGate[];
}): SkillEdgeSignalValidationVerdict {
  const blockingFailures = params.gates.filter(
    (gate) => gate.severity === "blocker" && !gate.passed,
  );

  if (blockingFailures.length > 0) {
    if (params.status === "watch") return "watch_only";

    return "rejected";
  }

  if (params.status === "watch") return "watch_only";

  const actionableStatus =
    params.status === "armed" || params.status === "active";

  const approvedScoreThreshold = actionableStatus ? 78 : 82;

  if (params.score >= approvedScoreThreshold) return "approved";
  if (params.score >= 60) return "needs_confirmation";

  return "watch_only";
}

function buildDeliveryEligibility(params: {
  verdict: SkillEdgeSignalValidationVerdict;
  grade: SkillEdgeSignalValidationGrade;
  gates: SkillEdgeSignalValidationGate[];
  status: string | null;
  score: number;
}): SkillEdgeDeliveryEligibility {
  const reasons: string[] = [];
  const blockerFailures = params.gates.filter(
    (gate) => gate.severity === "blocker" && !gate.passed,
  );
  const warningFailures = params.gates.filter(
    (gate) => gate.severity === "warning" && !gate.passed,
  );

  if (params.verdict !== "approved") {
    reasons.push(`Verdict is ${params.verdict}, not approved.`);
  }

  if (!(params.grade === "A" || params.grade === "B")) {
    reasons.push(`Grade ${params.grade} is below delivery threshold.`);
  }

  if (!(params.status === "armed" || params.status === "active")) {
    reasons.push(`Status ${params.status || "unknown"} is not ARMED/ACTIVE.`);
  }

  for (const gate of blockerFailures) {
    reasons.push(`${gate.label}: ${gate.reason}`);
  }

  const warningNotes =
    warningFailures.length > 0
      ? [
          `Non-blocking warning gates: ${warningFailures
            .map((gate) => gate.code)
            .join(", ")}.`,
        ]
      : [];

  if (params.score < 78) {
    reasons.push(`Score ${params.score} is below delivery threshold 78.`);
  }

  const eligible =
    reasons.length === 0 &&
    params.verdict === "approved" &&
    (params.grade === "A" || params.grade === "B") &&
    (params.status === "armed" || params.status === "active") &&
    params.score >= 78;

  return {
    eligible,
    channel: eligible ? "site_widget_telegram_ready" : "site_only",
    reasons: eligible
      ? ["Eligible for future premium delivery gates.", ...warningNotes]
      : [...reasons, ...warningNotes],
  };
}

function buildMissingConfirmations(requiredDataStatus: SkillEdgeRequiredDataStatus[]) {
  return requiredDataStatus
    .filter((row) => row.required && !row.present)
    .map((row) => `${row.label} missing: ${row.reason}`);
}

function buildWeakPoints(params: {
  candidate: Record<string, unknown>;
  gates: SkillEdgeSignalValidationGate[];
}) {
  const weakPoints: string[] = [];
  const status = getCandidateStatus(params.candidate);
  const rr = getCandidateRr(params.candidate);
  const confidence = getCandidateConfidence(params.candidate);

  if (status === "watch") {
    weakPoints.push("Candidate is WATCH-only: setup interest exists, but trade trigger is not confirmed.");
  }

  if (rr !== null && rr < 2) {
    weakPoints.push("RR is below 2R, so it cannot be a premium approved alert.");
  }

  if (confidence !== null && confidence < 75) {
    weakPoints.push("Confidence is below premium threshold.");
  }

  for (const gate of params.gates.filter((gate) => !gate.passed)) {
    weakPoints.push(`${gate.label}: ${gate.reason}`);
  }

  return uniqueRows(weakPoints).slice(0, 8);
}

function buildRiskWarnings(candidate: Record<string, unknown>, playbookContext: SkillEdgePlaybookRagContext) {
  const warnings: string[] = [];
  const playbookRiskHits = playbookContext.hits.filter(
    (hit) => hit.document.section === "risk" || hit.document.section === "avoid",
  );

  for (const hit of playbookRiskHits.slice(0, 3)) {
    warnings.push(hit.document.content);
  }

  const sourceData = readNestedRecord(candidate, ["source_data", "sourceData"]);

  const directRisk = [
    readText(candidate, ["risk", "risk_note", "riskNote", "warning"]),
    sourceData ? readText(sourceData, ["risk", "risk_note", "riskNote", "warning"]) : null,
  ].filter((risk): risk is string => typeof risk === "string" && risk.trim().length > 0);

  warnings.push(...directRisk);

  return uniqueRows(warnings).slice(0, 6);
}

function buildManagementPlan(params: {
  candidate: Record<string, unknown>;
  deliveryEligibility: SkillEdgeDeliveryEligibility;
}) {
  const status = getCandidateStatus(params.candidate);
  const rr = getCandidateRr(params.candidate);
  const plan: string[] = [];

  if (status === "watch") {
    plan.push("Keep on WATCH only until trigger/confirmation appears.");
  } else if (status === "armed") {
    plan.push("Treat as ARMED: wait for price to respect the planned entry zone and confirmation.");
  } else if (status === "active") {
    plan.push("Treat as ACTIVE only if entry/stop/targets are still valid and RR has not compressed.");
  } else {
    plan.push("Do not treat as tradable until lifecycle status is clear.");
  }

  if (rr !== null && rr >= 2) {
    plan.push("Maintain 2R+ structure. If entry worsens and RR drops below 2R, downgrade.");
  } else {
    plan.push("Require recalculated entry/stop/targets before premium delivery.");
  }

  if (!params.deliveryEligibility.eligible) {
    plan.push(`Delivery blocked: ${params.deliveryEligibility.reasons.slice(0, 2).join(" ")}`);
  }

  plan.push("If invalidation triggers, the idea is dead; do not average down or reframe the setup.");

  return plan;
}

function buildValidatorPromptBlock(params: {
  candidate: Record<string, unknown>;
  playbookContext: SkillEdgePlaybookRagContext;
  gates: SkillEdgeSignalValidationGate[];
  requiredDataStatus: SkillEdgeRequiredDataStatus[];
}) {
  return [
    "SKILLEDGE AI VALIDATOR / EXPLANATION LAYER",
    "Version: 3B-4B-2",
    "Role: professional trading desk validator.",
    "",
    "Hard rules:",
    "- Candidate data is the source of truth.",
    "- Playbook is the rule reference.",
    "- Do not invent missing entry, stop, target, RR, catalyst, volume, or confirmation.",
    "- WATCH is never an approved actionable alert.",
    "- No entry = no approval.",
    "- No stop/invalidation = no approval.",
    "- No targets = no approval.",
    "- RR below 2R = no premium approval.",
    "- Delivery eligibility is separate from validator verdict.",
    "- Risk-first. No profit promises. No hype.",
    "",
    "Gate status:",
    JSON.stringify(params.gates, null, 2),
    "",
    "Required data status:",
    JSON.stringify(params.requiredDataStatus, null, 2),
    "",
    "Candidate snapshot:",
    JSON.stringify(params.candidate, null, 2),
    "",
    params.playbookContext.promptBlock,
  ].join("\n");
}

export function validateSkillEdgeSignalCandidate(
  input: SkillEdgeSignalValidationInput,
): SkillEdgeSignalValidationResult {
  const candidate = input.candidate;
  const playbookContext =
    input.playbookContext ||
    retrieveSkillEdgePlaybookRagContext(buildSkillEdgePlaybookRagQueryFromSignal(candidate));

  const setupSlug = playbookContext.query.setupSlug || getCandidateSetupSlug(candidate);
  const setupName = playbookContext.setup?.name || null;
  const assetType = getCandidateAssetType(candidate);
  const symbol = getCandidateSymbol(candidate);
  const direction = getCandidateDirection(candidate);
  const status = getCandidateStatus(candidate);
  const requiredDataStatus = buildRequiredDataStatus(candidate);
  const dataCompletenessScore = buildDataCompletenessScore(requiredDataStatus);
  const setupFitScore = buildSetupFitScore({ candidate, playbookContext });
  const riskScore = buildRiskScore(candidate);
  const sourceConfidence = getCandidateConfidence(candidate);
  const baseScore = Math.round(
    setupFitScore * 0.32 +
      riskScore * 0.3 +
      dataCompletenessScore * 0.28 +
      (sourceConfidence ?? 65) * 0.1,
  );
  const gates = buildValidationGates({
    candidate,
    playbookContext,
    requiredDataStatus,
    setupFitScore,
    riskScore,
    dataCompletenessScore,
  });
  const blockerPenalty = gates.filter((gate) => gate.severity === "blocker" && !gate.passed).length * 12;
  const warningPenalty = gates.filter((gate) => gate.severity === "warning" && !gate.passed).length * 4;
  const score = clampScore(baseScore - blockerPenalty - warningPenalty);
  const grade = gradeFromScore(score);
  const verdict = verdictFromGates({
    score,
    status,
    gates,
  });
  const deliveryEligibility = buildDeliveryEligibility({
    verdict,
    grade,
    gates,
    status,
    score,
  });
  const passedChecks = gates
    .filter((gate) => gate.passed)
    .map((gate) => `${gate.label}: passed`);
  const failedChecks = gates
    .filter((gate) => !gate.passed)
    .map((gate) => `${gate.label}: ${gate.reason}`);
  const blockedReasons = gates
    .filter((gate) => gate.severity === "blocker" && !gate.passed)
    .map((gate) => `${gate.label}: ${gate.reason}`);
  const missingConfirmations = buildMissingConfirmations(requiredDataStatus);
  const weakPoints = buildWeakPoints({
    candidate,
    gates,
  });
  const riskWarnings = buildRiskWarnings(candidate, playbookContext);
  const entry = getCandidateEntry(candidate);
  const stop = getCandidateStop(candidate);
  const targets = getCandidateTargets(candidate);
  const rr = getCandidateRr(candidate);

  return {
    version: "3B-4B-2",
    verdict,
    grade,
    score,
    setupFitScore,
    riskScore,
    dataCompletenessScore,
    playbookMatched: Boolean(playbookContext.setup),
    setupSlug,
    setupName,
    assetType,
    symbol,
    direction,
    status,
    deliveryEligibility,
    requiredDataStatus,
    gates,
    passedChecks,
    failedChecks,
    blockedReasons,
    summary: `${symbol || "Unknown"} ${direction || "unknown direction"} ${setupName || setupSlug || "setup"} validation: ${verdict}, grade ${grade}, score ${score}, delivery=${deliveryEligibility.eligible ? "eligible" : "blocked"}.`,
    setupFit: uniqueRows(
      playbookContext.hits
        .filter((hit) => ["overview", "trigger", "confirmation"].includes(hit.document.section))
        .slice(0, 4)
        .map((hit) => hit.document.content),
    ),
    missingConfirmations,
    weakPoints,
    riskWarnings,
    entryReview: entry
      ? `Entry/trigger present: ${entry}. Validate only if price is not extended and confirmation is current.`
      : "Entry/trigger missing. Hard gate failed: do not approve.",
    stopReview: stop
      ? `Stop/invalidation present: ${stop}. Signal must be invalidated if this level breaks.`
      : "Stop/invalidation missing. Hard gate failed: risk is not controlled.",
    targetReview:
      targets.length > 0
        ? `Targets present: ${targets.join(" | ")}.`
        : "Targets missing. Hard gate failed: reward side cannot be validated.",
    rrReview:
      rr !== null
        ? `RR detected: ${rr.toFixed(2)}R. ${rr >= 2 ? "Meets minimum 2R structure." : "Hard gate failed: below premium 2R threshold."}`
        : "RR missing. Hard gate failed: need risk/reward calculation before approval.",
    managementPlan: buildManagementPlan({
      candidate,
      deliveryEligibility,
    }),
    validatorPromptBlock: buildValidatorPromptBlock({
      candidate,
      playbookContext,
      gates,
      requiredDataStatus,
    }),
    sourceData: {
      validatorVersion: "3B-4B-2",
      playbookRagVersion: "3B-4A",
      playbookDocumentCount: playbookContext.hits.length,
      hardGatesPassed: blockedReasons.length === 0,
      deliveryEligible: deliveryEligibility.eligible,
      playbookHits: playbookContext.hits.map((hit) => ({
        id: hit.document.id,
        setupSlug: hit.document.setupSlug,
        section: hit.document.section,
        score: Math.round(hit.score),
      })),
      requiredDataStatus,
      gates,
      candidateSnapshot: candidate,
      userContextSnapshot: input.userContext || null,
    },
  };
}

export function getSkillEdgeSignalValidatorDiagnostics() {
  return {
    version: "3B-4B-2",
    module: "signal-ai-validator",
    mode: "strict_deterministic_validation_architecture",
    usesPlaybookRag: true,
    hardGates: [
      "playbook_match",
      "not_watch_status",
      "entry_present",
      "stop_present",
      "targets_present",
      "rr_min_2r",
      "critical_data_present",
    ],
    deliveryTouched: false,
    telegramTouched: false,
    siteWidgetTouched: false,
    outputFields: [
      "verdict",
      "grade",
      "score",
      "deliveryEligibility",
      "requiredDataStatus",
      "gates",
      "passedChecks",
      "failedChecks",
      "blockedReasons",
      "setupFitScore",
      "riskScore",
      "dataCompletenessScore",
      "setupFit",
      "missingConfirmations",
      "weakPoints",
      "riskWarnings",
      "entryReview",
      "stopReview",
      "targetReview",
      "rrReview",
      "managementPlan",
      "validatorPromptBlock",
      "sourceData",
    ],
  };
}