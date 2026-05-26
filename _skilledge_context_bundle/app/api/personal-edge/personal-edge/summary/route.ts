import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAiRouteAccess } from "@/lib/security/ai-route-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TradingDnaRow = {
  id: string;
  user_id: string;
  profile_strength: number | null;
  data_quality_score: number | null;
  execution_score: number | null;
  discipline_score: number | null;
  total_reviewed_trades: number | null;
  total_screenshot_reviews: number | null;
  total_alert_linked_trades: number | null;
  best_asset_types: unknown;
  best_directions: unknown;
  best_sessions: unknown;
  best_setups: unknown;
  best_market_conditions: unknown;
  weak_setups: unknown;
  mistake_patterns: unknown;
  forbidden_patterns: unknown;
  strongest_rules: unknown;
  rules_to_fix: unknown;
  preferred_rr_min: number | null;
  preferred_rr_avg: number | null;
  best_time_windows: unknown;
  dna_summary: string | null;
  next_focus: string | null;
  risk_mode: string | null;
  last_recalculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type SetupFingerprintRow = {
  id: string;
  user_id: string;
  setup_slug: string;
  setup_name: string;
  asset_type: string | null;
  direction: string | null;
  tier: string | null;
  profile_strength: number | null;
  confidence_score: number | null;
  total_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  win_rate: number | null;
  avg_execution_score: number | null;
  avg_plan_adherence_score: number | null;
  fingerprint: unknown;
  required_conditions: unknown;
  confirmation_rules: unknown;
  invalidation_rules: unknown;
  avoid_conditions: unknown;
  common_mistakes: unknown;
  playbook_note: string | null;
  micro_lesson: string | null;
  is_active: boolean | null;
  last_recalculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlaybookItemRow = {
  id: string;
  user_id: string;
  fingerprint_id: string | null;
  item_type: string;
  title: string;
  slug: string;
  asset_type: string | null;
  direction: string | null;
  description: string | null;
  when_to_trade: unknown;
  confirmation_checklist: unknown;
  invalidation_rules: unknown;
  avoid_if: unknown;
  common_mistakes: unknown;
  example_trade_ids: unknown;
  priority_score: number | null;
  confidence_score: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

type PersonalRuleRow = {
  id: string;
  user_id: string;
  rule_slug: string;
  title: string;
  description: string | null;
  rule_type: string | null;
  severity: string | null;
  action: string | null;
  conditions: unknown;
  examples: unknown;
  times_triggered: number | null;
  times_respected: number | null;
  times_broken: number | null;
  is_active: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExecutionScoreRow = {
  id: string;
  user_id: string;
  trade_id: string | null;
  alert_id: string | null;
  score_type: string | null;
  execution_score: number | null;
  setup_quality_score: number | null;
  entry_timing_score: number | null;
  risk_discipline_score: number | null;
  exit_quality_score: number | null;
  plan_adherence_score: number | null;
  emotional_control_score: number | null;
  result_label: string | null;
  strengths: unknown;
  leaks: unknown;
  next_rules: unknown;
  summary: string | null;
  created_at: string;
};

type TradeReviewRow = {
  id: string;
  user_id: string;
  trade_id: string;
  source: string | null;
  asset_type: string | null;
  symbol: string | null;
  direction: string | null;
  setup_slug: string | null;
  setup_name: string | null;
  quality_score: number | null;
  setup_score: number | null;
  entry_score: number | null;
  risk_score: number | null;
  rr_score: number | null;
  exit_score: number | null;
  discipline_score: number | null;
  execution_score: number | null;
  plan_adherence_score: number | null;
  data_quality_score: number | null;
  detected_features: unknown;
  detected_mistakes: unknown;
  improvement_notes: unknown;
  repeatable_pattern: boolean | null;
  profitable_pattern: boolean | null;
  avoid_pattern: boolean | null;
  a_plus_candidate: boolean | null;
  public_summary: string | null;
  created_at: string;
};

function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function round(value: unknown, fallback = 0) {
  return Number(toNumber(value, fallback).toFixed(2));
}

function formatTopLabel(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;

  return (
    String(item.label || item.feature || item.mistake || item.title || item.setup || "")
      .trim() || null
  );
}

function firstTopLabel(value: unknown, fallback: string) {
  const items = safeArray(value);
  const first = items[0];

  return formatTopLabel(first) || fallback;
}

function getProfileStage(profileStrength: number, totalReviews: number) {
  if (totalReviews <= 0) {
    return {
      stage: "empty",
      label: "Waiting for first reviewed trade",
      description:
        "Add a trade with a screenshot and run SkillEdge AI review to start building your Personal Edge Engine.",
    };
  }

  if (profileStrength < 25 || totalReviews < 5) {
    return {
      stage: "warming_up",
      label: "Personalization warming up",
      description:
        "The system has started reading your execution. Add more reviewed trades to improve matching accuracy.",
    };
  }

  if (profileStrength < 60 || totalReviews < 15) {
    return {
      stage: "building_edge",
      label: "Edge profile building",
      description:
        "SkillEdge AI is detecting recurring setups, risk leaks and early personal playbook patterns.",
    };
  }

  if (profileStrength < 82) {
    return {
      stage: "strong_profile",
      label: "Strong personal profile",
      description:
        "Your Trading DNA has enough reviewed data to support stronger Personal Match and Anti-Setup filtering.",
    };
  }

  return {
    stage: "desk_ready",
    label: "Trading desk ready",
    description:
      "Your profile is strong enough for high-confidence personal setup matching and risk guard logic.",
  };
}

function getRiskModeCopy(riskMode: string | null) {
  switch (riskMode) {
    case "defensive":
      return {
        label: "Defensive mode",
        tone: "warning",
        description:
          "The system sees execution leaks or unstable conditions. Prioritize A+ setups only.",
      };

    case "cooldown":
      return {
        label: "Cooldown mode",
        tone: "danger",
        description:
          "Risk discipline needs protection. Avoid marginal trades until execution quality improves.",
      };

    case "kill_switch":
      return {
        label: "Kill switch",
        tone: "danger",
        description:
          "Trading should pause until rules, risk and execution quality are restored.",
      };

    case "aggressive_allowed":
      return {
        label: "Aggressive allowed",
        tone: "positive",
        description:
          "Profile and execution quality support more active participation in qualified setups.",
      };

    default:
      return {
        label: "Normal mode",
        tone: "neutral",
        description:
          "No critical risk state detected. Continue following your personal playbook and risk rules.",
      };
  }
}

function buildEmptySummary() {
  return {
    profile: {
      profileStrength: 0,
      dataQualityScore: 0,
      executionScore: 0,
      disciplineScore: 0,
      totalReviewedTrades: 0,
      totalScreenshotReviews: 0,
      totalAlertLinkedTrades: 0,
      preferredRrMin: 1.8,
      preferredRrAvg: null,
      riskMode: "normal",
      riskModeCopy: getRiskModeCopy("normal"),
      stage: getProfileStage(0, 0),
      summary:
        "Your Personal Edge Engine is ready. Add a trade with a screenshot and run SkillEdge AI review to start building your Trading DNA.",
      nextFocus:
        "Upload your first trade screenshot with entry, stop, target and setup notes.",
      lastRecalculatedAt: null,
    },
    highlights: {
      bestSetup: "Not enough data yet",
      bestDirection: "Not enough data yet",
      bestAssetType: "Not enough data yet",
      mainRiskPattern: "Not enough data yet",
      strongestCondition: "Not enough data yet",
    },
    fingerprints: [],
    playbook: [],
    rules: [],
    execution: {
      latest: null,
      recent: [],
    },
    recentReviews: [],
    readiness: {
      canPersonalizeAlerts: false,
      canBuildAPlusPlaybook: false,
      canUseAntiSetupGuard: false,
      missingData: [
        "Add reviewed trades",
        "Attach chart screenshots",
        "Save stop/invalidation",
        "Write setup notes",
      ],
    },
  };
}

export async function GET(req: Request) {
  const gate = await requireAiRouteAccess(req, {
    routeName: "personal-edge-summary",
    requireActiveSubscription: true,
    rateLimit: {
      limit: 120,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;

  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Invalid user session." },
        { status: 401 }
      );
    }

    const [
      dnaResult,
      fingerprintsResult,
      playbookResult,
      rulesResult,
      executionResult,
      reviewsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("user_trading_dna")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabaseAdmin
        .from("user_setup_fingerprints")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("confidence_score", { ascending: false })
        .limit(12),

      supabaseAdmin
        .from("user_playbook_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("priority_score", { ascending: false })
        .limit(12),

      supabaseAdmin
        .from("user_personal_rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("severity", { ascending: false })
        .limit(12),

      supabaseAdmin
        .from("user_execution_scores")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),

      supabaseAdmin
        .from("trade_ai_reviews")
        .select("*")
        .eq("user_id", user.id)
        .eq("review_status", "completed")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (dnaResult.error) {
      console.error("[personal-edge-summary] dna error", dnaResult.error);

      return NextResponse.json(
        { ok: false, error: "Failed to load Trading DNA." },
        { status: 500 }
      );
    }

    if (!dnaResult.data) {
      return NextResponse.json({
        ok: true,
        summary: buildEmptySummary(),
      });
    }

    const dna = dnaResult.data as TradingDnaRow;
    const fingerprints = ((fingerprintsResult.data || []) as SetupFingerprintRow[])
      .map((item) => ({
        id: item.id,
        setupSlug: item.setup_slug,
        setupName: item.setup_name,
        assetType: item.asset_type || "unknown",
        direction: item.direction || "unknown",
        tier: item.tier || "watchlist",
        profileStrength: round(item.profile_strength),
        confidenceScore: round(item.confidence_score),
        totalTrades: item.total_trades || 0,
        winningTrades: item.winning_trades || 0,
        losingTrades: item.losing_trades || 0,
        winRate: round(item.win_rate),
        avgExecutionScore: round(item.avg_execution_score),
        avgPlanAdherenceScore: round(item.avg_plan_adherence_score),
        requiredConditions: safeArray(item.required_conditions),
        confirmationRules: safeArray(item.confirmation_rules),
        invalidationRules: safeArray(item.invalidation_rules),
        avoidConditions: safeArray(item.avoid_conditions),
        commonMistakes: safeArray(item.common_mistakes),
        playbookNote: item.playbook_note,
        microLesson: item.micro_lesson,
        lastRecalculatedAt: item.last_recalculated_at,
      }));

    const playbook = ((playbookResult.data || []) as PlaybookItemRow[]).map(
      (item) => ({
        id: item.id,
        itemType: item.item_type,
        title: item.title,
        slug: item.slug,
        assetType: item.asset_type || "unknown",
        direction: item.direction || "unknown",
        description: item.description,
        whenToTrade: safeArray(item.when_to_trade),
        confirmationChecklist: safeArray(item.confirmation_checklist),
        invalidationRules: safeArray(item.invalidation_rules),
        avoidIf: safeArray(item.avoid_if),
        commonMistakes: safeArray(item.common_mistakes),
        priorityScore: round(item.priority_score),
        confidenceScore: round(item.confidence_score),
      })
    );

    const rules = ((rulesResult.data || []) as PersonalRuleRow[]).map((rule) => ({
      id: rule.id,
      ruleSlug: rule.rule_slug,
      title: rule.title,
      description: rule.description,
      ruleType: rule.rule_type || "risk",
      severity: rule.severity || "medium",
      action: rule.action || "warn",
      timesTriggered: rule.times_triggered || 0,
      timesRespected: rule.times_respected || 0,
      timesBroken: rule.times_broken || 0,
      createdBy: rule.created_by || "skilledge_ai",
      conditions: rule.conditions || {},
      examples: safeArray(rule.examples),
    }));

    const executionRows = ((executionResult.data || []) as ExecutionScoreRow[]).map(
      (score) => ({
        id: score.id,
        tradeId: score.trade_id,
        alertId: score.alert_id,
        scoreType: score.score_type || "trade",
        executionScore: round(score.execution_score),
        setupQualityScore: round(score.setup_quality_score),
        entryTimingScore: round(score.entry_timing_score),
        riskDisciplineScore: round(score.risk_discipline_score),
        exitQualityScore: round(score.exit_quality_score),
        planAdherenceScore: round(score.plan_adherence_score),
        emotionalControlScore: round(score.emotional_control_score),
        resultLabel: score.result_label || "unrated",
        strengths: safeArray(score.strengths),
        leaks: safeArray(score.leaks),
        nextRules: safeArray(score.next_rules),
        summary: score.summary,
        createdAt: score.created_at,
      })
    );

    const recentReviews = ((reviewsResult.data || []) as TradeReviewRow[]).map(
      (review) => ({
        id: review.id,
        tradeId: review.trade_id,
        source: review.source || "trade_screenshot",
        symbol: review.symbol,
        assetType: review.asset_type || "unknown",
        direction: review.direction || "unknown",
        setupSlug: review.setup_slug || "unclassified",
        setupName: review.setup_name || "Unclassified Setup",
        qualityScore: round(review.quality_score),
        setupScore: round(review.setup_score),
        entryScore: round(review.entry_score),
        riskScore: round(review.risk_score),
        rrScore: round(review.rr_score),
        executionScore: round(review.execution_score),
        planAdherenceScore: round(review.plan_adherence_score),
        dataQualityScore: round(review.data_quality_score),
        detectedFeatures: safeArray(review.detected_features),
        detectedMistakes: safeArray(review.detected_mistakes),
        improvementNotes: safeArray(review.improvement_notes),
        repeatablePattern: Boolean(review.repeatable_pattern),
        profitablePattern: Boolean(review.profitable_pattern),
        avoidPattern: Boolean(review.avoid_pattern),
        aPlusCandidate: Boolean(review.a_plus_candidate),
        publicSummary: review.public_summary,
        createdAt: review.created_at,
      })
    );

    const profileStrength = round(dna.profile_strength);
    const totalReviews = dna.total_reviewed_trades || 0;
    const dataQualityScore = round(dna.data_quality_score);
    const executionScore = round(dna.execution_score);
    const disciplineScore = round(dna.discipline_score);

    const summary = {
      profile: {
        profileStrength,
        dataQualityScore,
        executionScore,
        disciplineScore,
        totalReviewedTrades: totalReviews,
        totalScreenshotReviews: dna.total_screenshot_reviews || 0,
        totalAlertLinkedTrades: dna.total_alert_linked_trades || 0,
        preferredRrMin: round(dna.preferred_rr_min, 1.8),
        preferredRrAvg:
          dna.preferred_rr_avg === null || dna.preferred_rr_avg === undefined
            ? null
            : round(dna.preferred_rr_avg),
        riskMode: dna.risk_mode || "normal",
        riskModeCopy: getRiskModeCopy(dna.risk_mode),
        stage: getProfileStage(profileStrength, totalReviews),
        summary:
          dna.dna_summary ||
          "SkillEdge AI is building your Personal Edge profile from reviewed trades and screenshots.",
        nextFocus:
          dna.next_focus ||
          "Keep collecting screenshots with entry, stop, target and setup reasoning.",
        lastRecalculatedAt: dna.last_recalculated_at,
      },
      highlights: {
        bestSetup: firstTopLabel(dna.best_setups, "Not enough data yet"),
        bestDirection: firstTopLabel(dna.best_directions, "Not enough data yet"),
        bestAssetType: firstTopLabel(dna.best_asset_types, "Not enough data yet"),
        mainRiskPattern: firstTopLabel(dna.mistake_patterns, "Not enough data yet"),
        strongestCondition: firstTopLabel(
          dna.best_market_conditions,
          "Not enough data yet"
        ),
      },
      rawDna: {
        bestAssetTypes: safeArray(dna.best_asset_types),
        bestDirections: safeArray(dna.best_directions),
        bestSessions: safeArray(dna.best_sessions),
        bestSetups: safeArray(dna.best_setups),
        bestMarketConditions: safeArray(dna.best_market_conditions),
        weakSetups: safeArray(dna.weak_setups),
        mistakePatterns: safeArray(dna.mistake_patterns),
        forbiddenPatterns: safeArray(dna.forbidden_patterns),
        strongestRules: safeArray(dna.strongest_rules),
        rulesToFix: safeArray(dna.rules_to_fix),
        bestTimeWindows: safeArray(dna.best_time_windows),
      },
      fingerprints,
      playbook,
      rules,
      execution: {
        latest: executionRows[0] || null,
        recent: executionRows,
      },
      recentReviews,
      readiness: {
        canPersonalizeAlerts: profileStrength >= 35 && totalReviews >= 5,
        canBuildAPlusPlaybook:
          fingerprints.some((item) => item.tier === "a_plus") ||
          recentReviews.some((item) => item.aPlusCandidate),
        canUseAntiSetupGuard:
          rules.length > 0 ||
          fingerprints.some((item) => item.tier === "avoid") ||
          safeArray(dna.mistake_patterns).length > 0,
        missingData: [
          ...(totalReviews < 10 ? ["More reviewed trades"] : []),
          ...(dataQualityScore < 65 ? ["Higher data quality: screenshots, stop, setup notes"] : []),
          ...(fingerprints.length === 0 ? ["Setup fingerprints"] : []),
          ...(playbook.length === 0 ? ["Personal playbook items"] : []),
        ],
      },
    };

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    console.error("[personal-edge-summary]", error);

    return NextResponse.json(
      { ok: false, error: "Personal Edge summary backend error." },
      { status: 500 }
    );
  }
}

