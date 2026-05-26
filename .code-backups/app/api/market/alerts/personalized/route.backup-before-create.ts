import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type MarketAlertRow = {
  id: string;
  user_id: string | null;
  setup_slug: string | null;
  setup_name: string | null;
  setup_type?: string | null;
  symbol: string;
  title?: string | null;
  reason?: string | null;
  scenario?: string | null;
  risk_note?: string | null;
  trigger_label?: string | null;
  lesson_summary?: string | null;
  asset_type?: string | null;
  exchange?: string | null;
  direction?: string | null;
  score?: number | null;
  confidence_score?: number | null;
  created_at?: string | null;
  is_new?: boolean | null;
 viewed_at?: string | null;
  [key: string]: unknown;
};

type SignalProfileRow = {
  setup_slug: string;
  setup_name: string;
  profile_label: string;
  strength_score: number;
  win_rate: number | null;
  total_pnl: number | null;
  avg_plan_adherence: number | null;
  ai_note: string | null;
};

type TradePatternProfileRow = {
  pattern_slug: string;
  pattern_name: string;
  market: string | null;
  direction: string | null;
  matching_keywords: unknown;
  profile_label: string;
  strength_score: number;
  total_pnl: number | null;
  avg_pnl: number | null;
  ai_note: string | null;
};


type TradingDnaRow = {
  profile_strength?: number | null;
  data_quality_score?: number | null;
  execution_score?: number | null;
  discipline_score?: number | null;
  total_reviewed_trades?: number | null;
  risk_mode?: string | null;
  best_setups?: unknown;
  best_market_conditions?: unknown;
  mistake_patterns?: unknown;
  forbidden_patterns?: unknown;
  strongest_rules?: unknown;
  rules_to_fix?: unknown;
};

type SetupFingerprintRow = {
  id: string;
  setup_slug: string;
  setup_name: string;
  asset_type?: string | null;
  direction?: string | null;
  tier?: string | null;
  confidence_score?: number | null;
  profile_strength?: number | null;
  total_trades?: number | null;
  win_rate?: number | null;
  required_conditions?: unknown;
  confirmation_rules?: unknown;
  invalidation_rules?: unknown;
  avoid_conditions?: unknown;
  common_mistakes?: unknown;
  playbook_note?: string | null;
  micro_lesson?: string | null;
};

type PersonalRuleRow = {
  rule_slug: string;
  title: string;
  description?: string | null;
  rule_type?: string | null;
  severity?: string | null;
  action?: string | null;
  conditions?: unknown;
  is_active?: boolean | null;
};

type UserAlertStateRow = {
  alert_id: string;
  is_new: boolean | null;
  viewed_at: string | null;
  decision: string | null;
  decision_note: string | null;
};


type AlertAssetTypeFilter = "all" | "stock" | "crypto";

function normalizeAssetTypeFilter(value: string | null): AlertAssetTypeFilter {
  const normalized = (value || "all").toLowerCase();

  if (["crypto", "coin", "coins"].includes(normalized)) return "crypto";
  if (["stock", "stocks", "equity", "equities"].includes(normalized)) return "stock";

  return "all";
}

function matchesAssetTypeFilter(
  assetType: string | null | undefined,
  filter: AlertAssetTypeFilter
) {
  if (filter === "all") return true;
  return filter === "crypto" ? assetType === "crypto" : assetType !== "crypto";
}


function getAlertPeriodSince(period: string) {
  const normalized = (period || "24h").toLowerCase();

  if (normalized === "all") return null;

  if (normalized === "7d" || normalized === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (normalized.endsWith("h")) {
    const hours = Number(normalized.replace("h", ""));
    if (Number.isFinite(hours) && hours > 0) {
      return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }
  }

  if (normalized.endsWith("d")) {
    const days = Number(normalized.replace("d", ""));
    if (Number.isFinite(days) && days > 0) {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function buildAlertResponseMetrics(items: Array<{ asset_type?: string | null; status?: string | null; confidence_score?: number | null; score?: number | null; signal_mode?: string | null }>) {
  const stocks = items.filter((item) => item.asset_type !== "crypto").length;
  const crypto = items.filter((item) => item.asset_type === "crypto").length;
  const active = items.filter((item) => item.status === "active").length;
  const armed = items.filter((item) => item.status === "armed").length;
  const watch = items.filter((item) => item.status === "watch").length;
  const actionable = items.filter((item) => item.signal_mode === "actionable").length;
  const confidenceValues = items
    .map((item) =>
      typeof item.confidence_score === "number"
        ? item.confidence_score
        : typeof item.score === "number"
          ? item.score
          : null
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    total: items.length,
    stocks,
    crypto,
    active,
    armed,
    watch,
    actionable,
    avgConfidence:
      confidenceValues.length > 0
        ? Math.round(
            confidenceValues.reduce((sum, value) => sum + value, 0) /
              confidenceValues.length
          )
        : null,
  };
}

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}

async function getUserPlan(userId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_id, status, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const expiresAt = data?.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt ? expiresAt < Date.now() : false;

  if (!data || isExpired) return "core";

  return normalizePlanId(data.plan_id);
}

function buildPersonalization(alert: MarketAlertRow, profile?: SignalProfileRow) {
  if (!profile) {
    return {
      personalization_label: null,
      personalization_type: null,
      personalization_note: null,
      personal_strength_score: null,
      personal_win_rate: null,
      personal_total_pnl: null,
      personal_plan_adherence: null,
    };
  }

  if (profile.profile_label === "personal_strength") {
    return {
      personalization_label: "Matches your profitable setup profile",
      personalization_type: "strength",
      personalization_note:
        profile.ai_note ||
        "This alert matches a setup that has been positive in your journal history.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  if (profile.profile_label === "risk_zone") {
    return {
      personalization_label: "Warning: historically weak setup for you",
      personalization_type: "risk",
      personalization_note:
        profile.ai_note ||
        "This setup has been weak in your journal history. Wait for stronger confirmation.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  if (profile.profile_label === "learning") {
    return {
      personalization_label: "Learning setup — more sample needed",
      personalization_type: "learning",
      personalization_note:
        profile.ai_note ||
        "SkillEdge AI is still collecting enough trades to personalize this setup.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  return {
    personalization_label: "Tracked in your signal profile",
    personalization_type: "neutral",
    personalization_note:
      profile.ai_note ||
      "This setup exists in your signal profile, but there is no strong edge label yet.",
    personal_strength_score: profile.strength_score,
    personal_win_rate: profile.win_rate,
    personal_total_pnl: profile.total_pnl,
    personal_plan_adherence: profile.avg_plan_adherence,
  };
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function getAlertMarket(alert: MarketAlertRow) {
  const assetType = normalizeText(alert.asset_type);
  const exchange = normalizeText(alert.exchange);

  if (assetType === "crypto" || exchange === "binance") return "crypto";

  return "stocks";
}

function getAlertDirection(alert: MarketAlertRow) {
  const direction = normalizeText(alert.direction);

  if (direction === "downside") return "short";
  if (direction === "upside") return "long";

  return direction || "neutral";
}

function getAlertSearchText(alert: MarketAlertRow) {
  return [
    alert.symbol,
    alert.setup_slug,
    alert.setup_name,
    alert.setup_type,
    alert.title,
    alert.reason,
    alert.scenario,
    alert.risk_note,
    alert.trigger_label,
    alert.lesson_summary,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

function buildJournalPatternMatch(
  alert: MarketAlertRow,
  patterns: TradePatternProfileRow[]
) {
  const alertMarket = getAlertMarket(alert);
  const alertDirection = getAlertDirection(alert);
  const alertText = getAlertSearchText(alert);

  const scoredPatterns = patterns
    .map((pattern) => {
      const keywords = safeStringArray(pattern.matching_keywords);
      const matchedKeywords = keywords.filter((keyword) =>
        alertText.includes(keyword.toLowerCase())
      );

      const marketMatch =
        !pattern.market || pattern.market === alertMarket ? 35 : 0;

      const directionMatch =
        !pattern.direction ||
        alertDirection === "neutral" ||
        pattern.direction === alertDirection
          ? 30
          : 0;

      const keywordScore = Math.min(matchedKeywords.length * 8, 24);
      const strengthScore = Math.min((pattern.strength_score || 0) * 0.08, 8);
      const pnlScore = Number(pattern.total_pnl || 0) > 0 ? 8 : 0;

      const matchScore = Math.round(
        marketMatch + directionMatch + keywordScore + strengthScore + pnlScore
      );

      return {
        pattern,
        matchedKeywords,
        matchScore,
      };
    })
    .filter((item) => item.matchScore >= 60)
    .sort((a, b) => b.matchScore - a.matchScore);

  const bestMatch = scoredPatterns[0];

  if (!bestMatch) {
    return {
      journal_pattern_label: null,
      journal_pattern_type: null,
      journal_pattern_note: null,
      journal_pattern_name: null,
      journal_pattern_match_score: null,
      journal_pattern_strength_score: null,
      journal_pattern_total_pnl: null,
      journal_pattern_avg_pnl: null,
      journal_pattern_keywords: [],
    };
  }

  const isStrong =
    bestMatch.pattern.profile_label === "personal_strength_candidate" &&
    Number(bestMatch.pattern.total_pnl || 0) > 0;

  return {
    journal_pattern_label: isStrong
      ? "Similar to your winning journal pattern"
      : "Similar to your journal pattern candidate",
    journal_pattern_type: isStrong ? "journal_strength" : "journal_learning",
    journal_pattern_note:
      bestMatch.pattern.ai_note ||
      "This alert has similarities with your independent profitable journal trades.",
    journal_pattern_name: bestMatch.pattern.pattern_name,
    journal_pattern_match_score: bestMatch.matchScore,
    journal_pattern_strength_score: bestMatch.pattern.strength_score,
    journal_pattern_total_pnl: bestMatch.pattern.total_pnl,
    journal_pattern_avg_pnl: bestMatch.pattern.avg_pnl,
    journal_pattern_keywords: bestMatch.matchedKeywords,
  };
}


function valueToLabel(value: unknown) {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;

    return String(
      item.label ||
        item.feature ||
        item.mistake ||
        item.title ||
        item.value ||
        item.condition ||
        ""
    );
  }

  return "";
}

function safeObjectArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function labelsFromUnknownArray(value: unknown) {
  return safeObjectArray(value)
    .map((item) => valueToLabel(item).toLowerCase().trim())
    .filter(Boolean);
}

function buildPersonalEdgeMatch(params: {
  alert: MarketAlertRow;
  dna?: TradingDnaRow | null;
  fingerprints: SetupFingerprintRow[];
  rules: PersonalRuleRow[];
}) {
  const { alert, dna, fingerprints, rules } = params;

  const alertText = getAlertSearchText(alert);
  const alertMarket = getAlertMarket(alert);
  const alertDirection = getAlertDirection(alert);
  const setupSlug = typeof alert.setup_slug === "string" ? alert.setup_slug : "";
  const setupName = typeof alert.setup_name === "string" ? alert.setup_name : "";

  const scoredFingerprints = fingerprints
    .map((fingerprint) => {
      let score = 0;
      const matchedFeatures: string[] = [];

      if (fingerprint.setup_slug && fingerprint.setup_slug === setupSlug) {
        score += 36;
        matchedFeatures.push("same setup fingerprint");
      }

      const fingerprintName = normalizeText(fingerprint.setup_name);
      if (fingerprintName && alertText.includes(fingerprintName)) {
        score += 16;
        matchedFeatures.push(fingerprint.setup_name);
      }

      const assetType = normalizeText(fingerprint.asset_type);
      if (!assetType || assetType === "unknown" || assetType === alertMarket || (assetType === "stock" && alertMarket === "stocks")) {
        score += 14;
      }

      const direction = normalizeText(fingerprint.direction);
      if (
        !direction ||
        direction === "unknown" ||
        direction === "both" ||
        alertDirection === "neutral" ||
        direction === alertDirection
      ) {
        score += 14;
      }

      const confirmationRules = labelsFromUnknownArray(fingerprint.confirmation_rules);
      const requiredConditions = labelsFromUnknownArray(fingerprint.required_conditions);
      const commonMistakes = labelsFromUnknownArray(fingerprint.common_mistakes);
      const avoidConditions = labelsFromUnknownArray(fingerprint.avoid_conditions);

      for (const condition of [...confirmationRules, ...requiredConditions]) {
        if (condition && alertText.includes(condition)) {
          score += 5;
          matchedFeatures.push(condition);
        }
      }

      const warningFeatures = [...commonMistakes, ...avoidConditions].filter(
        (condition) => condition && alertText.includes(condition)
      );

      const confidenceBonus = Math.min(toNumber(fingerprint.confidence_score) * 0.08, 8);
      const sampleBonus = Math.min(toNumber(fingerprint.total_trades) * 1.5, 8);
      score += confidenceBonus + sampleBonus;

      if (fingerprint.tier === "a_plus") score += 10;
      if (fingerprint.tier === "avoid" || fingerprint.tier === "forbidden") score -= 18;

      if (warningFeatures.length > 0) score -= Math.min(warningFeatures.length * 8, 24);

      return {
        fingerprint,
        score: Math.max(0, Math.min(100, Math.round(score))),
        matchedFeatures: Array.from(new Set(matchedFeatures)).slice(0, 8),
        warningFeatures: Array.from(new Set(warningFeatures)).slice(0, 8),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scoredFingerprints[0];
  const profileStrength = toNumber(dna?.profile_strength);
  const executionScore = toNumber(dna?.execution_score);
  const dataQualityScore = toNumber(dna?.data_quality_score);
  const riskMode = normalizeText(dna?.risk_mode);

  const dnaBestConditions = labelsFromUnknownArray(dna?.best_market_conditions);
  const dnaMistakes = labelsFromUnknownArray(dna?.mistake_patterns);
  const dnaForbidden = labelsFromUnknownArray(dna?.forbidden_patterns);

  const dnaMatchedConditions = dnaBestConditions.filter(
    (condition) => condition && alertText.includes(condition)
  );

  const dnaWarnings = [...dnaMistakes, ...dnaForbidden].filter(
    (condition) => condition && alertText.includes(condition)
  );

  let personalMatchScore = Math.max(best?.score || 0, 0);
  personalMatchScore += Math.min(profileStrength * 0.08, 8);
  personalMatchScore += Math.min(executionScore * 0.05, 5);
  personalMatchScore += Math.min(dataQualityScore * 0.04, 4);
  personalMatchScore += Math.min(dnaMatchedConditions.length * 4, 12);
  personalMatchScore -= Math.min(dnaWarnings.length * 9, 24);

  if (riskMode === "defensive") personalMatchScore -= 4;
  if (riskMode === "cooldown") personalMatchScore -= 10;
  if (riskMode === "kill_switch") personalMatchScore -= 25;
  if (riskMode === "aggressive_allowed") personalMatchScore += 4;

  personalMatchScore = Math.max(0, Math.min(100, Math.round(personalMatchScore)));

  const activeRules = rules.filter((rule) => rule.is_active !== false);
  const triggeredRules = activeRules
    .filter((rule) => {
      const ruleText = [
        rule.rule_slug,
        rule.title,
        rule.description,
        rule.rule_type,
        rule.severity,
        rule.action,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" ");

      if (!ruleText) return false;

      if (rule.rule_slug === "minimum_rr_required" && alertText.includes("weak reward")) return true;
      if (rule.rule_slug === "no_late_chase" && (alertText.includes("late") || alertText.includes("chase") || alertText.includes("extended"))) return true;
      if (rule.rule_slug === "clear_invalidation_required" && (alertText.includes("no clear") || alertText.includes("invalidation") || alertText.includes("stop"))) return true;

      return ruleText
        .split(/[^a-z0-9а-яёіїєґ]+/i)
        .filter((part) => part.length >= 5)
        .some((part) => alertText.includes(part));
    })
    .slice(0, 6);

  const antiSetupRiskScore = Math.max(
    Math.min(dnaWarnings.length * 18 + triggeredRules.length * 14, 100),
    best?.fingerprint?.tier === "avoid" || best?.fingerprint?.tier === "forbidden" ? 72 : 0
  );

  const hasStrongFingerprint =
    Boolean(best) &&
    personalMatchScore >= 72 &&
    best!.fingerprint.tier !== "avoid" &&
    best!.fingerprint.tier !== "forbidden";

  const isRiskGuard =
    antiSetupRiskScore >= 55 ||
    riskMode === "cooldown" ||
    riskMode === "kill_switch" ||
    best?.fingerprint?.tier === "avoid" ||
    best?.fingerprint?.tier === "forbidden";

  const readinessStatus = isRiskGuard
    ? "risk_guard"
    : personalMatchScore >= 82
      ? "execution_zone"
      : personalMatchScore >= 68
        ? "confirmation_needed"
        : personalMatchScore >= 50
          ? "watchlist"
          : "forming";

  const personalReason = hasStrongFingerprint
    ? `Matches your ${best!.fingerprint.setup_name} fingerprint. Matched features: ${
        [...best!.matchedFeatures, ...dnaMatchedConditions].slice(0, 5).join(", ") || "setup structure"
      }.`
    : profileStrength < 25
      ? "Personalization is still warming up. Add more reviewed trades with screenshots to improve Personal Match."
      : "No high-confidence personal fingerprint match yet. Treat this as a standard market alert until stronger confirmation appears.";

  const riskGuardNote = isRiskGuard
    ? `Risk Guard: this alert overlaps with your risk patterns or personal rules. ${
        [...(best?.warningFeatures || []), ...dnaWarnings, ...triggeredRules.map((rule) => rule.title)]
          .slice(0, 5)
          .join(" · ") || "Use reduced aggression and wait for cleaner confirmation."
      }`
    : triggeredRules.length > 0
      ? `Personal rules to check: ${triggeredRules.map((rule) => rule.title).join(" · ")}`
      : null;

  const setupReadinessLabel =
    readinessStatus === "execution_zone"
      ? "Execution zone after confirmation"
      : readinessStatus === "confirmation_needed"
        ? "Confirmation needed"
        : readinessStatus === "risk_guard"
          ? "Risk Guard / watchlist only"
          : readinessStatus === "watchlist"
            ? "Watchlist setup"
            : "Forming setup";

  return {
    personal_edge_match_score: personalMatchScore,
    personal_edge_status: readinessStatus,
    personal_edge_label: setupReadinessLabel,
    personal_edge_reason: personalReason,
    personal_edge_risk_guard_note: riskGuardNote,
    personal_edge_anti_setup_risk_score: antiSetupRiskScore,
    personal_edge_profile_strength: profileStrength,
    personal_edge_execution_score: executionScore,
    personal_edge_data_quality_score: dataQualityScore,
    personal_edge_risk_mode: dna?.risk_mode || "normal",
    matched_fingerprint_id: best?.fingerprint.id || null,
    matched_fingerprint_slug: best?.fingerprint.setup_slug || null,
    matched_fingerprint_name: best?.fingerprint.setup_name || null,
    matched_fingerprint_tier: best?.fingerprint.tier || null,
    matched_fingerprint_confidence: best?.fingerprint.confidence_score || null,
    matched_fingerprint_features: best?.matchedFeatures || [],
    personal_edge_warning_features: Array.from(
      new Set([...(best?.warningFeatures || []), ...dnaWarnings])
    ).slice(0, 10),
    personal_rule_warnings: triggeredRules.map((rule) => ({
      rule_slug: rule.rule_slug,
      title: rule.title,
      severity: rule.severity,
      action: rule.action,
      description: rule.description,
    })),
  };
}

function buildPersonalPriority(
  alert: MarketAlertRow,
  personalization: Record<string, unknown>,
  journalPatternMatch: Record<string, unknown>,
  personalEdgeMatch: Record<string, unknown>
) {
  const baseScore = Math.max(
    toNumber(alert.confidence_score),
    toNumber(alert.score)
  );

  let priorityScore = baseScore;
  const reasons: string[] = [];

  const personalizationType =
    typeof personalization.personalization_type === "string"
      ? personalization.personalization_type
      : null;

  const journalPatternType =
    typeof journalPatternMatch.journal_pattern_type === "string"
      ? journalPatternMatch.journal_pattern_type
      : null;

  const personalEdgeStatus =
    typeof personalEdgeMatch.personal_edge_status === "string"
      ? personalEdgeMatch.personal_edge_status
      : null;

  if (personalizationType === "strength") {
    priorityScore += 10;
    reasons.push("matches personal AI signal strength");
  }

  if (personalizationType === "risk") {
    priorityScore -= 8;
    reasons.push("matches historically weak AI setup");
  }

  if (personalizationType === "learning") {
    priorityScore += 2;
    reasons.push("tracked learning setup");
  }

  if (journalPatternType === "journal_strength") {
    priorityScore += 12;
    reasons.push("similar to winning independent journal pattern");
  }

  if (journalPatternType === "journal_learning") {
    priorityScore += 4;
    reasons.push("similar to early journal pattern candidate");
  }

  const edgeMatchScore = toNumber(personalEdgeMatch.personal_edge_match_score, 0);
  const antiSetupRiskScore = toNumber(
    personalEdgeMatch.personal_edge_anti_setup_risk_score,
    0
  );

  if (edgeMatchScore >= 82) {
    priorityScore += 14;
    reasons.push("strong Personal Edge fingerprint match");
  } else if (edgeMatchScore >= 68) {
    priorityScore += 8;
    reasons.push("matches developing Personal Edge profile");
  } else if (edgeMatchScore >= 50) {
    priorityScore += 3;
    reasons.push("watchlist-level Personal Edge match");
  }

  if (personalEdgeStatus === "risk_guard" || antiSetupRiskScore >= 55) {
    priorityScore -= 16;
    reasons.push("Risk Guard warning active");
  }

  const personalWinRate = toNumber(personalization.personal_win_rate, 0);
  const journalMatchScore = toNumber(
    journalPatternMatch.journal_pattern_match_score,
    0
  );

  if (personalWinRate >= 60) {
    priorityScore += 4;
    reasons.push("personal win rate above 60%");
  }

  if (journalMatchScore >= 75) {
    priorityScore += 4;
    reasons.push("strong journal pattern match score");
  }

  const alertStatus = normalizeText(alert.status);

  if (alertStatus === "active") {
    priorityScore = Math.min(priorityScore, 96);
  } else if (alertStatus === "armed") {
    priorityScore = Math.min(priorityScore, 87);
  } else {
    priorityScore = Math.min(priorityScore, 75);
  }

  priorityScore = Math.max(0, Math.min(100, Math.round(priorityScore)));

  const priorityType =
    personalizationType === "risk" ||
    personalEdgeStatus === "risk_guard" ||
    antiSetupRiskScore >= 55
      ? "caution"
      : priorityScore >= 88
        ? "priority"
        : priorityScore >= 75
          ? "watch"
          : "neutral";

  const priorityLabel =
    priorityType === "priority"
      ? "High-priority personal alert"
      : priorityType === "caution"
        ? "Personal caution alert"
        : priorityType === "watch"
          ? "Personal watch alert"
          : "Standard alert";

  return {
    personal_priority_score: priorityScore,
    personal_priority_type: priorityType,
    personal_priority_label: priorityLabel,
    personal_priority_reason:
      reasons.length > 0
        ? reasons.join(" · ")
        : "No strong personal match yet. Standard alert priority.",
  };
}

function buildSignalMode(
  alert: MarketAlertRow,
  personalPriority: Record<string, unknown>,
  personalEdgeMatch: Record<string, unknown>
) {
  const priorityScore = toNumber(personalPriority.personal_priority_score);
  const baseConfidence = Math.max(
    toNumber(alert.confidence_score),
    toNumber(alert.score)
  );

  const priorityType =
    typeof personalPriority.personal_priority_type === "string"
      ? personalPriority.personal_priority_type
      : "";

  const alertStatus = normalizeText(alert.status);
  const personalEdgeStatus =
    typeof personalEdgeMatch.personal_edge_status === "string"
      ? personalEdgeMatch.personal_edge_status
      : null;

  if (priorityType === "caution" || personalEdgeStatus === "risk_guard") {
    return {
      signal_mode: "caution",
      signal_mode_label: "Caution signal",
      signal_mode_note:
        String(personalEdgeMatch.personal_edge_risk_guard_note || "This alert has a personal or setup-based warning. Do not trade without stronger confirmation."),
    };
  }

  if (personalEdgeStatus === "execution_zone" && priorityScore >= 78) {
    return {
      signal_mode: "execution_zone",
      signal_mode_label: "Personal Edge execution zone",
      signal_mode_note:
        "This setup has a strong Personal Edge match. It still requires trigger confirmation, clean invalidation and disciplined sizing.",
    };
  }

  if (personalEdgeStatus === "confirmation_needed") {
    return {
      signal_mode: "confirmation_needed",
      signal_mode_label: "Personal confirmation needed",
      signal_mode_note:
        "The setup matches part of your profile, but it still needs confirmation before execution.",
    };
  }

  if (alertStatus === "active" && baseConfidence >= 88) {
    return {
      signal_mode: "actionable",
      signal_mode_label: "Actionable after confirmation",
      signal_mode_note:
        "This is a high-priority alert. It still requires trigger confirmation, valid risk/reward and disciplined execution.",
    };
  }

  if (alertStatus === "armed" || alertStatus === "watch" || priorityScore >= 70 || baseConfidence >= 70) {
    return {
      signal_mode: alertStatus === "armed" ? "armed" : "watchlist",
      signal_mode_label: alertStatus === "armed" ? "Armed setup" : "Setup forming",
      signal_mode_note:
        "This setup is worth watching, but it is not a full actionable signal until confirmation appears.",
    };
  }

  return {
    signal_mode: "monitoring",
    signal_mode_label: "Monitoring only",
    signal_mode_note:
      "SkillEdge AI is tracking this ticker, but the signal quality is not high enough for an actionable alert yet.",
  };
}

export async function GET(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 30,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "ai_alerts")) {
      return NextResponse.json(
        {
          error: "AI Alerts are available only on SkillEdge Elite.",
          locked: true,
          requiredPlan: "elite",
          feature: "ai_alerts",
          currentPlan: planId,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || "100")));
    const period = searchParams.get("period") || "24h";
    const assetTypeFilter = normalizeAssetTypeFilter(searchParams.get("assetType"));
    const periodSince = period === "active" ? null : getAlertPeriodSince(period);

    let alertsQuery = supabaseAdmin
      .from("market_alerts")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (assetTypeFilter !== "all") {
      alertsQuery = alertsQuery.eq("asset_type", assetTypeFilter);
    }

    if (period === "active") {
      alertsQuery = alertsQuery
        .in("status", ["active", "armed", "watch"])
        .gt("expires_at", new Date().toISOString())
        .order("score", { ascending: false });
    } else if (periodSince) {
      alertsQuery = alertsQuery.gte("created_at", periodSince);
    }

    const [
      alertsResult,
      profilesResult,
      tradePatternsResult,
      tradingDnaResult,
      setupFingerprintsResult,
      personalRulesResult,
    ] = await Promise.all([
      alertsQuery,
      supabaseAdmin
        .from("user_signal_profiles")
        .select(
          "setup_slug,setup_name,profile_label,strength_score,win_rate,total_pnl,avg_plan_adherence,ai_note"
        )
        .eq("user_id", user.id),
      supabaseAdmin
        .from("user_trade_pattern_profiles")
        .select(
          "pattern_slug,pattern_name,market,direction,matching_keywords,profile_label,strength_score,total_pnl,avg_pnl,ai_note"
        )
        .eq("user_id", user.id)
        .order("strength_score", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("user_trading_dna")
        .select(
          "profile_strength,data_quality_score,execution_score,discipline_score,total_reviewed_trades,risk_mode,best_setups,best_market_conditions,mistake_patterns,forbidden_patterns,strongest_rules,rules_to_fix"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("user_setup_fingerprints")
        .select(
          "id,setup_slug,setup_name,asset_type,direction,tier,confidence_score,profile_strength,total_trades,win_rate,required_conditions,confirmation_rules,invalidation_rules,avoid_conditions,common_mistakes,playbook_note,micro_lesson"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("confidence_score", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("user_personal_rules")
        .select(
          "rule_slug,title,description,rule_type,severity,action,conditions,is_active"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(50),
    ]);

    if (alertsResult.error) {
      console.error("Failed to load personalized alerts:", alertsResult.error);

      return NextResponse.json(
        { error: "Failed to load personalized alerts." },
        { status: 500 }
      );
    }

    const alertRows = (alertsResult.data || []) as unknown as MarketAlertRow[];

const alertIds = alertRows
  .map((alert) => alert.id)
  .filter((id): id is string => typeof id === "string" && id.length > 0);

const statesResult =
  alertIds.length > 0
    ? await supabaseAdmin
        .from("user_market_alert_states")
        .select("alert_id,is_new,viewed_at,decision,decision_note")
        .eq("user_id", user.id)
        .in("alert_id", alertIds)
    : { data: [], error: null };

if (statesResult.error) {
  console.error("Failed to load user alert states:", statesResult.error);
}

const alertStates = ((statesResult.data || []) as unknown as UserAlertStateRow[]).reduce<
  Record<string, UserAlertStateRow>
>((acc, state) => {
  acc[state.alert_id] = state;
  return acc;
}, {});

    if (profilesResult.error) {
      console.error("Failed to load signal profiles for alerts:", profilesResult.error);
    }

if (tradePatternsResult.error) {
  console.error(
    "Failed to load trade pattern profiles for alerts:",
    tradePatternsResult.error
  );
}

if (tradingDnaResult.error) {
  console.error("Failed to load Trading DNA for alerts:", tradingDnaResult.error);
}

if (setupFingerprintsResult.error) {
  console.error(
    "Failed to load setup fingerprints for alerts:",
    setupFingerprintsResult.error
  );
}

if (personalRulesResult.error) {
  console.error(
    "Failed to load personal rules for alerts:",
    personalRulesResult.error
  );
}

    const profiles = ((profilesResult.data || []) as unknown as SignalProfileRow[]).reduce<
  Record<string, SignalProfileRow>
>((acc, profile) => {
  acc[profile.setup_slug] = profile;
  return acc;
}, {});

const tradePatterns =
  (tradePatternsResult.data || []) as unknown as TradePatternProfileRow[];

const tradingDna = (tradingDnaResult.data || null) as unknown as
  | TradingDnaRow
  | null;

const setupFingerprints =
  (setupFingerprintsResult.data || []) as unknown as SetupFingerprintRow[];

const personalRules =
  (personalRulesResult.data || []) as unknown as PersonalRuleRow[];

const items = alertRows
  .filter((alert) => matchesAssetTypeFilter(alert.asset_type, assetTypeFilter))
  .map((alert) => {
    const setupSlug =
      typeof alert.setup_slug === "string" ? alert.setup_slug : "";

    const personalization = buildPersonalization(alert, profiles[setupSlug]);
const journalPatternMatch = buildJournalPatternMatch(alert, tradePatterns);
const personalEdgeMatch = buildPersonalEdgeMatch({
  alert,
  dna: tradingDna,
  fingerprints: setupFingerprints,
  rules: personalRules,
});
const personalPriority = buildPersonalPriority(
  alert,
  personalization,
  journalPatternMatch,
  personalEdgeMatch
);
const signalMode = buildSignalMode(alert, personalPriority, personalEdgeMatch);

const userState = alertStates[alert.id];

return {
  ...alert,
  is_new: userState ? userState.is_new : alert.is_new ?? true,
  viewed_at: userState ? userState.viewed_at : alert.viewed_at ?? null,
  user_alert_decision: userState ? userState.decision : null,
  user_alert_decision_note: userState ? userState.decision_note : null,
  ...personalization,
  ...journalPatternMatch,
  ...personalEdgeMatch,
  ...personalPriority,
  ...signalMode,
};
  })
  .sort((a, b) => {
  const priorityDiff =
    toNumber(b.personal_priority_score) -
    toNumber(a.personal_priority_score);

  if (priorityDiff !== 0) return priorityDiff;

  const bCreatedAt =
    typeof b.created_at === "string" ? b.created_at : "1970-01-01T00:00:00.000Z";

  const aCreatedAt =
    typeof a.created_at === "string" ? a.created_at : "1970-01-01T00:00:00.000Z";

  return new Date(bCreatedAt).getTime() - new Date(aCreatedAt).getTime();
})
.slice(0, limit);

    return NextResponse.json({
      source: "personalized_market_alerts",
      period,
      assetType: assetTypeFilter,
      count: items.length,
      metrics: buildAlertResponseMetrics(items),
      scannedAt: new Date().toISOString(),
      cache: {
        ttl: Number(process.env.MARKET_ALERTS_CACHE_TTL_SECONDS || "10"),
        cachedAt: new Date().toISOString(),
      },
      items,
    });
  } catch (error) {
    console.error("Personalized alerts route error:", error);

    return NextResponse.json(
      { error: "Failed to load personalized alerts." },
      { status: 500 }
    );
  }
}


