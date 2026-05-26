import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAiFeatureLimit } from "@/lib/ai-usage-limits";
import { requireAiRouteAccess } from "@/lib/security/ai-route-gate";
import {
  getSkillEdgeTradeScreenshotPrompt,
  getSkillEdgeConciseOutputRules,
} from "@/lib/ai/skill-edge-prompts";

export const runtime = "nodejs";

type Trade = {
  id: string;
  user_id: string;
  ticker: string;
  market: string | null;
  direction: string | null;
  trade_date: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  position_size: number | null;
  risk_amount: number | null;
  pnl: number | null;
  result: string | null;
  setup: string | null;
  emotion: string | null;
  mistake: string | null;
  lesson: string | null;
  notes: string | null;
  created_at: string | null;
};

type TradeScreenshot = {
  id: string;
  trade_id: string;
  user_id: string;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  screenshot_type: string | null;
  created_at: string | null;
};

type StructuredTradeReview = {
  assetType: "stock" | "crypto" | "option" | "futures" | "forex" | "unknown";
  direction: "long" | "short" | "unknown";
  setupSlug: string;
  setupName: string;
  qualityScore: number;
  setupScore: number;
  entryScore: number;
  riskScore: number;
  rrScore: number;
  exitScore: number;
  disciplineScore: number;
  executionScore: number;
  planAdherenceScore: number;
  dataQualityScore: number;
  detectedFeatures: string[];
  detectedMistakes: string[];
  improvementNotes: string[];
  personalRulesTriggered: string[];
  repeatablePattern: boolean;
  profitablePattern: boolean;
  avoidPattern: boolean;
  aPlusCandidate: boolean;
  publicSummary: string;
  privateCoachNote: string;
  structuredReview: Record<string, unknown>;
};

type ReviewRow = {
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
  created_at: string;
};

function getOpenAIModel(planId: string | null) {
  const normalizedPlanId = String(planId || "").toLowerCase();

  if (normalizedPlanId.includes("elite")) {
    return process.env.SKILLEDGE_ELITE_AI_MODEL || "gpt-5.1";
  }

  if (normalizedPlanId.includes("edge") || normalizedPlanId.includes("pro")) {
    return process.env.SKILLEDGE_EDGE_AI_MODEL || "gpt-5-mini";
  }

  return process.env.SKILLEDGE_CORE_AI_MODEL || "gpt-4.1-mini";
}

function getPublicPlanName(planId: string | null) {
  if (planId === "starter") return "SkillEdge Core";
  if (planId === "pro") return "SkillEdge Edge";
  if (planId === "elite") return "SkillEdge Elite";

  return "SkillEdge Core";
}

function getOutputLanguageInstruction(language: string | null) {
  if (language === "ru") {
    return "Answer strictly in Russian. Use clear professional trading language. Keep ticker symbols, PnL, VWAP, stop, setup, long and short terms in English only when it is natural.";
  }

  if (language === "ua") {
    return "Answer strictly in Ukrainian. Use clear professional trading language. Keep ticker symbols, PnL, VWAP, stop, setup, long and short terms in English only when it is natural.";
  }

  return "Answer strictly in English. Use clear professional trading language.";
}

async function storageFileToDataUrl(filePath: string, mimeType: string | null) {
  const { data, error } = await supabaseAdmin.storage
    .from("trade-screenshots")
    .download(filePath);

  if (error || !data) {
    throw new Error("Failed to download screenshot from storage.");
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const safeMimeType = mimeType || data.type || "image/png";

  return `data:${safeMimeType};base64,${base64}`;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeDirection(value: unknown): "long" | "short" | "unknown" {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("long") || normalized.includes("buy") || normalized.includes("upside")) {
    return "long";
  }

  if (
    normalized.includes("short") ||
    normalized.includes("sell") ||
    normalized.includes("downside")
  ) {
    return "short";
  }

  return "unknown";
}

function normalizeAssetType(trade: Trade): StructuredTradeReview["assetType"] {
  const raw = `${trade.market || ""} ${trade.ticker || ""}`.toLowerCase();

  if (
    raw.includes("crypto") ||
    raw.includes("binance") ||
    raw.includes("hyperliquid") ||
    raw.includes("usdt") ||
    raw.includes("perp")
  ) {
    return "crypto";
  }

  if (raw.includes("option")) return "option";
  if (raw.includes("future") || raw.includes("nq") || raw.includes("es")) return "futures";
  if (raw.includes("forex") || raw.includes("fx")) return "forex";

  return "stock";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яёіїєґ]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

function detectSetupFromText(trade: Trade, answer: string) {
  const raw = [
    trade.setup,
    trade.mistake,
    trade.lesson,
    trade.notes,
    answer,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const candidates: Array<{
    slug: string;
    name: string;
    weight: number;
    match: boolean;
  }> = [
    {
      slug: "premarket_pump_short",
      name: "Premarket Pump Short",
      weight: 100,
      match:
        (raw.includes("premarket") || raw.includes("pre-market") || raw.includes("премаркет")) &&
        (raw.includes("pump") || raw.includes("памп")) &&
        (raw.includes("short") || raw.includes("шорт")),
    },
    {
      slug: "gap_and_crap",
      name: "Gap and Crap",
      weight: 95,
      match: raw.includes("gap and crap") || raw.includes("гэп") || raw.includes("gap"),
    },
    {
      slug: "vwap_rejection",
      name: "VWAP Rejection",
      weight: 90,
      match:
        raw.includes("vwap rejection") ||
        raw.includes("vwap reject") ||
        raw.includes("rejection from vwap") ||
        raw.includes("отбой от vwap") ||
        raw.includes("vwap"),
    },
    {
      slug: "failed_breakout",
      name: "Failed Breakout",
      weight: 88,
      match:
        raw.includes("failed breakout") ||
        raw.includes("false breakout") ||
        raw.includes("fake breakout") ||
        raw.includes("ложный пробой") ||
        raw.includes("ложного пробоя"),
    },
    {
      slug: "lower_high_fade",
      name: "Lower High Fade",
      weight: 84,
      match: raw.includes("lower high") || raw.includes("понижающийся хай"),
    },
    {
      slug: "catalyst_reaction_fade",
      name: "Catalyst Reaction Fade",
      weight: 78,
      match:
        raw.includes("catalyst") ||
        raw.includes("earnings") ||
        raw.includes("news") ||
        raw.includes("новост"),
    },
    {
      slug: "breakout_continuation",
      name: "Breakout Continuation",
      weight: 72,
      match:
        raw.includes("breakout continuation") ||
        raw.includes("continuation") ||
        raw.includes("продолжение"),
    },
    {
      slug: "pullback_continuation",
      name: "Pullback Continuation",
      weight: 70,
      match: raw.includes("pullback") || raw.includes("откат"),
    },
    {
      slug: "manual_review_setup",
      name: trade.setup?.trim() || "Manual Review Setup",
      weight: 10,
      match: true,
    },
  ];

  const best = candidates
    .filter((candidate) => candidate.match)
    .sort((a, b) => b.weight - a.weight)[0];

  return {
    setupSlug: best?.slug || slugify(trade.setup || "manual_review_setup") || "manual_review_setup",
    setupName: best?.name || trade.setup?.trim() || "Manual Review Setup",
  };
}

function extractFeatures(trade: Trade, answer: string) {
  const raw = [
    trade.setup,
    trade.mistake,
    trade.lesson,
    trade.notes,
    answer,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const features: string[] = [];

  const add = (condition: boolean, value: string) => {
    if (condition && !features.includes(value)) features.push(value);
  };

  add(raw.includes("vwap"), "VWAP context");
  add(raw.includes("failed breakout") || raw.includes("false breakout") || raw.includes("ложный"), "Failed breakout / trap");
  add(raw.includes("lower high"), "Lower high");
  add(raw.includes("premarket") || raw.includes("pre-market") || raw.includes("премаркет"), "Premarket context");
  add(raw.includes("volume") || raw.includes("объем") || raw.includes("объём"), "Volume context");
  add(raw.includes("gap") || raw.includes("гэп"), "Gap context");
  add(raw.includes("reclaim"), "Reclaim / failed reclaim");
  add(raw.includes("breakdown") || raw.includes("слом"), "Breakdown / structure break");
  add(raw.includes("liquidity") || raw.includes("ликвид"), "Liquidity context");
  add(raw.includes("support") || raw.includes("resistance") || raw.includes("уров"), "Key level reaction");
  add(raw.includes("trend") || raw.includes("тренд"), "Trend context");
  add(raw.includes("rr") || raw.includes("risk/reward") || raw.includes("risk reward"), "Risk/reward context");

  if (features.length === 0) {
    features.push("Manual journal + screenshot review");
  }

  return features.slice(0, 14);
}

function extractMistakes(trade: Trade, answer: string, rr: number | null) {
  const raw = [
    trade.mistake,
    trade.lesson,
    trade.notes,
    answer,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const mistakes: string[] = [];

  const add = (condition: boolean, value: string) => {
    if (condition && !mistakes.includes(value)) mistakes.push(value);
  };

  add(!trade.stop_loss, "No clear stop / invalidation saved");
  add(rr !== null && rr < 1.5, "Weak reward-to-risk profile");
  add(raw.includes("late") || raw.includes("позд"), "Late entry risk");
  add(raw.includes("chase") || raw.includes("догон"), "Chasing after move");
  add(raw.includes("fomo"), "FOMO entry");
  add(raw.includes("no plan") || raw.includes("без плана"), "No clear trade plan");
  add(raw.includes("wide stop") || raw.includes("широк"), "Stop too wide");
  add(raw.includes("moved stop") || raw.includes("перенес"), "Stop discipline issue");
  add(raw.includes("early exit") || raw.includes("рано выш"), "Early exit");
  add(raw.includes("revenge"), "Revenge trade risk");

  return mistakes.slice(0, 12);
}

function calculateTradeRr(trade: Trade) {
  const entry = toNumber(trade.entry_price);
  const exit = toNumber(trade.exit_price);
  const stop = toNumber(trade.stop_loss);

  if (entry === null || exit === null || stop === null || entry <= 0) return null;

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(exit - entry);

  if (risk <= 0) return null;

  return Number((reward / risk).toFixed(3));
}

function calculateStructuredScores(params: {
  trade: Trade;
  answer: string;
  features: string[];
  mistakes: string[];
  rr: number | null;
}) {
  const { trade, features, mistakes, rr } = params;

  const pnl = toNumber(trade.pnl) || 0;
  const isWin = trade.result === "win" || pnl > 0;
  const hasStop = toNumber(trade.stop_loss) !== null;
  const hasEntry = toNumber(trade.entry_price) !== null;
  const hasExit = toNumber(trade.exit_price) !== null;
  const hasScreenshotSignal = features.length >= 2;
  const hasJournalContext = Boolean(trade.setup || trade.notes || trade.lesson || trade.mistake);

  let setupScore = 42;
  let entryScore = hasEntry ? 58 : 30;
  let riskScore = hasStop ? 66 : 28;
  let rrScore = 45;
  let exitScore = hasExit ? 55 : 35;
  let disciplineScore = hasStop ? 62 : 32;
  let dataQualityScore = 35;

  if (hasScreenshotSignal) setupScore += 20;
  if (hasJournalContext) setupScore += 8;
  if (isWin) setupScore += 8;

  if (rr !== null) {
    if (rr >= 3) rrScore = 92;
    else if (rr >= 2) rrScore = 82;
    else if (rr >= 1.5) rrScore = 68;
    else if (rr >= 1) rrScore = 52;
    else rrScore = 34;
  }

  if (mistakes.includes("Late entry risk") || mistakes.includes("Chasing after move")) {
    entryScore -= 18;
    disciplineScore -= 10;
  }

  if (mistakes.includes("No clear stop / invalidation saved")) {
    riskScore -= 22;
    disciplineScore -= 16;
  }

  if (mistakes.includes("Stop discipline issue")) {
    riskScore -= 12;
    disciplineScore -= 18;
  }

  if (trade.setup) dataQualityScore += 12;
  if (trade.notes) dataQualityScore += 10;
  if (trade.lesson) dataQualityScore += 10;
  if (trade.mistake) dataQualityScore += 8;
  if (hasStop) dataQualityScore += 10;
  if (hasEntry) dataQualityScore += 8;
  if (hasExit) dataQualityScore += 7;

  const planAdherenceScore =
    riskScore * 0.34 + entryScore * 0.28 + disciplineScore * 0.26 + rrScore * 0.12;

  const executionScore =
    setupScore * 0.22 +
    entryScore * 0.22 +
    riskScore * 0.22 +
    rrScore * 0.14 +
    exitScore * 0.1 +
    disciplineScore * 0.1;

  const qualityScore =
    setupScore * 0.24 +
    entryScore * 0.2 +
    riskScore * 0.2 +
    rrScore * 0.16 +
    disciplineScore * 0.12 +
    dataQualityScore * 0.08;

  return {
    setupScore: clampScore(setupScore),
    entryScore: clampScore(entryScore),
    riskScore: clampScore(riskScore),
    rrScore: clampScore(rrScore),
    exitScore: clampScore(exitScore),
    disciplineScore: clampScore(disciplineScore),
    executionScore: clampScore(executionScore),
    planAdherenceScore: clampScore(planAdherenceScore),
    dataQualityScore: clampScore(dataQualityScore),
    qualityScore: clampScore(qualityScore),
  };
}

function buildStructuredTradeReview(trade: Trade, answer: string): StructuredTradeReview {
  const assetType = normalizeAssetType(trade);
  const direction = normalizeDirection(trade.direction);
  const { setupSlug, setupName } = detectSetupFromText(trade, answer);
  const rr = calculateTradeRr(trade);
  const features = extractFeatures(trade, answer);
  const mistakes = extractMistakes(trade, answer, rr);
  const scores = calculateStructuredScores({
    trade,
    answer,
    features,
    mistakes,
    rr,
  });

  const pnl = toNumber(trade.pnl) || 0;
  const isWin = trade.result === "win" || pnl > 0;

  const repeatablePattern =
    scores.qualityScore >= 66 &&
    features.length >= 2 &&
    !mistakes.includes("No clear stop / invalidation saved");

  const profitablePattern = isWin && scores.qualityScore >= 62;
  const avoidPattern =
    (!isWin && scores.qualityScore <= 52) ||
    mistakes.includes("Chasing after move") ||
    mistakes.includes("No clear stop / invalidation saved");

  const aPlusCandidate =
    profitablePattern &&
    repeatablePattern &&
    scores.executionScore >= 72 &&
    (rr === null || rr >= 1.8);

  const improvementNotes = [
    ...(mistakes.includes("No clear stop / invalidation saved")
      ? ["Define the exact invalidation before entry."]
      : []),
    ...(mistakes.includes("Weak reward-to-risk profile")
      ? ["Avoid similar trades unless planned RR is at least 1.8–2.0."]
      : []),
    ...(mistakes.includes("Late entry risk") || mistakes.includes("Chasing after move")
      ? ["Wait for a reset, failed reclaim, or cleaner stop location instead of chasing."]
      : []),
    ...(aPlusCandidate
      ? ["Save this as a potential A+ setup candidate and look for the same conditions again."]
      : []),
  ];

  if (improvementNotes.length === 0) {
    improvementNotes.push("Keep collecting screenshots and execution notes to strengthen the personal setup profile.");
  }

  const personalRulesTriggered = mistakes.map((mistake) => {
    if (mistake.includes("Late") || mistake.includes("Chasing")) return "no_late_chase";
    if (mistake.includes("stop") || mistake.includes("invalidation")) return "clear_invalidation_required";
    if (mistake.includes("reward")) return "minimum_rr_required";
    return slugify(mistake);
  });

  const publicSummary = aPlusCandidate
    ? `${setupName} is a potential A+ fingerprint candidate. The trade has enough structure, execution quality and risk logic to help train future personal matching.`
    : avoidPattern
      ? `${setupName} should be treated as an anti-setup or risk pattern until the entry, invalidation and reward-to-risk are cleaner.`
      : `${setupName} is an early profile signal. Add more trades and screenshots to confirm whether it belongs in the personal playbook.`;

  const privateCoachNote = [
    `Setup: ${setupName}`,
    `Quality: ${scores.qualityScore}/100`,
    `Execution: ${scores.executionScore}/100`,
    rr !== null ? `Realized RR: ${rr}` : "Realized RR: unknown",
    aPlusCandidate
      ? "Candidate for A+ playbook."
      : avoidPattern
        ? "Candidate for Anti-Setup Guard."
        : "Needs more sample size.",
  ].join(" | ");

  return {
    assetType,
    direction,
    setupSlug,
    setupName,
    qualityScore: scores.qualityScore,
    setupScore: scores.setupScore,
    entryScore: scores.entryScore,
    riskScore: scores.riskScore,
    rrScore: scores.rrScore,
    exitScore: scores.exitScore,
    disciplineScore: scores.disciplineScore,
    executionScore: scores.executionScore,
    planAdherenceScore: scores.planAdherenceScore,
    dataQualityScore: scores.dataQualityScore,
    detectedFeatures: features,
    detectedMistakes: mistakes,
    improvementNotes,
    personalRulesTriggered,
    repeatablePattern,
    profitablePattern,
    avoidPattern,
    aPlusCandidate,
    publicSummary,
    privateCoachNote,
    structuredReview: {
      setup_slug: setupSlug,
      setup_name: setupName,
      asset_type: assetType,
      direction,
      rr_realized: rr,
      scores,
      detected_features: features,
      detected_mistakes: mistakes,
      improvement_notes: improvementNotes,
      personal_rules_triggered: personalRulesTriggered,
      repeatable_pattern: repeatablePattern,
      profitable_pattern: profitablePattern,
      avoid_pattern: avoidPattern,
      a_plus_candidate: aPlusCandidate,
      engine: "personal_edge_engine",
      version: "skilledge-personal-edge-v1",
    },
  };
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function topCounts(items: string[], limit = 10) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (!clean.length) return 0;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function groupBySetup(reviews: ReviewRow[]) {
  return reviews.reduce<Record<string, ReviewRow[]>>((acc, review) => {
    const key = [
      review.setup_slug || "unclassified",
      review.asset_type || "unknown",
      review.direction || "unknown",
    ].join("::");

    if (!acc[key]) acc[key] = [];
    acc[key].push(review);

    return acc;
  }, {});
}

async function rebuildPersonalEdgeFoundationForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("trade_ai_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("review_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[personal-edge] failed to load reviews", error);
    return;
  }

  const reviews = (data || []) as unknown as ReviewRow[];
  const totalReviewedTrades = reviews.length;

  if (!totalReviewedTrades) return;

  const allFeatures = reviews.flatMap((review) => safeArray(review.detected_features));
  const allMistakes = reviews.flatMap((review) => safeArray(review.detected_mistakes));

  const winningReviews = reviews.filter((review) => review.profitable_pattern);
  const avoidReviews = reviews.filter((review) => review.avoid_pattern);
  const aPlusReviews = reviews.filter((review) => review.a_plus_candidate);

  const profileStrength = clampScore(
    Math.min(totalReviewedTrades * 7, 45) +
      average(reviews.map((review) => review.quality_score)) * 0.28 +
      average(reviews.map((review) => review.data_quality_score)) * 0.18
  );

  const dataQualityScore = clampScore(average(reviews.map((review) => review.data_quality_score)));
  const executionScore = clampScore(average(reviews.map((review) => review.execution_score)));
  const disciplineScore = clampScore(average(reviews.map((review) => review.discipline_score)));

  const bestSetups = topCounts(
    winningReviews.map((review) => review.setup_name || review.setup_slug || "Unknown setup"),
    8
  );

  const weakSetups = topCounts(
    avoidReviews.map((review) => review.setup_name || review.setup_slug || "Unknown setup"),
    8
  );

  const bestDirections = topCounts(
    winningReviews.map((review) => review.direction || "unknown"),
    4
  );

  const bestAssetTypes = topCounts(
    winningReviews.map((review) => review.asset_type || "unknown"),
    5
  );

  const mistakePatterns = topCounts(allMistakes, 12);
  const bestMarketConditions = topCounts(allFeatures, 12);

  const riskMode =
    mistakePatterns.length >= 5 && executionScore < 45
      ? "defensive"
      : disciplineScore < 35
        ? "cooldown"
        : "normal";

  const dnaSummary =
    totalReviewedTrades < 10
      ? "Personalization is warming up. Add more reviewed trades and screenshots to strengthen Personal Edge matching."
      : `Profile is based on ${totalReviewedTrades} reviewed trades. Strongest signals are now weighted toward recurring setups, execution quality and risk discipline.`;

  const nextFocus =
    mistakePatterns[0]?.label ||
    weakSetups[0]?.label ||
    "Keep collecting high-quality screenshots with entry, stop, target and trade reasoning.";

  await supabaseAdmin.from("user_trading_dna").upsert(
    {
      user_id: userId,
      profile_strength: profileStrength,
      data_quality_score: dataQualityScore,
      execution_score: executionScore,
      discipline_score: disciplineScore,
      total_reviewed_trades: totalReviewedTrades,
      total_screenshot_reviews: reviews.filter((review) => review.source === "trade_screenshot").length,
      total_alert_linked_trades: 0,
      best_asset_types: bestAssetTypes,
      best_directions: bestDirections,
      best_sessions: [],
      best_setups: bestSetups,
      best_market_conditions: bestMarketConditions,
      weak_setups: weakSetups,
      mistake_patterns: mistakePatterns,
      forbidden_patterns: weakSetups.slice(0, 3),
      strongest_rules: [
        { label: "No trade without clean invalidation", source: "system" },
        { label: "Minimum planned RR should be 1.8–2.0+", source: "system" },
      ],
      rules_to_fix: mistakePatterns.slice(0, 5),
      preferred_rr_min: 1.8,
      dna_summary: dnaSummary,
      next_focus: nextFocus,
      risk_mode: riskMode,
      last_recalculated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  const grouped = groupBySetup(reviews);

  for (const setupReviews of Object.values(grouped)) {
    const sample = setupReviews[0];
    const setupSlug = sample.setup_slug || "unclassified";
    const setupName = sample.setup_name || "Unclassified Setup";
    const assetType = sample.asset_type || "unknown";
    const direction = sample.direction || "unknown";

    const totalTrades = setupReviews.length;
    const wins = setupReviews.filter((review) => review.profitable_pattern).length;
    const losses = setupReviews.filter((review) => review.avoid_pattern).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const avgExecution = average(setupReviews.map((review) => review.execution_score));
    const avgPlan = average(setupReviews.map((review) => review.plan_adherence_score));
    const avgQuality = average(setupReviews.map((review) => review.quality_score));

    const setupFeatures = topCounts(
      setupReviews.flatMap((review) => safeArray(review.detected_features)),
      12
    );

    const setupMistakes = topCounts(
      setupReviews.flatMap((review) => safeArray(review.detected_mistakes)),
      12
    );

    const confidenceScore = clampScore(
      Math.min(totalTrades * 10, 38) + winRate * 0.25 + avgQuality * 0.24 + avgExecution * 0.13
    );

    const tier =
      losses >= 2 && winRate < 35
        ? "avoid"
        : confidenceScore >= 72 && wins >= 2
          ? "a_plus"
          : confidenceScore >= 52
            ? "b_setup"
            : "watchlist";

    const fingerprint = {
      setup_slug: setupSlug,
      setup_name: setupName,
      asset_type: assetType,
      direction,
      sample_size: totalTrades,
      win_rate: Number(winRate.toFixed(2)),
      avg_quality_score: Number(avgQuality.toFixed(2)),
      avg_execution_score: Number(avgExecution.toFixed(2)),
      conditions: setupFeatures,
      mistakes: setupMistakes,
      tier,
      version: "skilledge-personal-edge-v1",
    };

    const { data: fingerprintRow } = await supabaseAdmin
      .from("user_setup_fingerprints")
      .upsert(
        {
          user_id: userId,
          setup_slug: setupSlug,
          setup_name: setupName,
          asset_type: assetType,
          direction,
          tier,
          profile_strength: clampScore(totalTrades * 12 + avgQuality * 0.4),
          confidence_score: confidenceScore,
          total_trades: totalTrades,
          winning_trades: wins,
          losing_trades: losses,
          win_rate: Number(winRate.toFixed(2)),
          avg_execution_score: Number(avgExecution.toFixed(2)),
          avg_plan_adherence_score: Number(avgPlan.toFixed(2)),
          fingerprint,
          required_conditions: setupFeatures.slice(0, 6),
          confirmation_rules: setupFeatures.slice(0, 5).map((item) => item.label),
          invalidation_rules: [
            "Price must not reclaim the invalidation level with strong volume.",
            "Stop should remain behind a real technical level, not a random price.",
          ],
          avoid_conditions: setupMistakes.slice(0, 6),
          common_mistakes: setupMistakes,
          best_examples: setupReviews
            .filter((review) => review.a_plus_candidate || review.profitable_pattern)
            .slice(0, 8)
            .map((review) => review.trade_id),
          worst_examples: setupReviews
            .filter((review) => review.avoid_pattern)
            .slice(0, 8)
            .map((review) => review.trade_id),
          playbook_note:
            tier === "a_plus"
              ? `${setupName} is becoming an A+ candidate. Future alerts matching this fingerprint should receive a higher personal match score.`
              : tier === "avoid"
                ? `${setupName} is currently a risk pattern. Future alerts should trigger Anti-Setup Guard warnings.`
                : `${setupName} needs more reviewed examples before it becomes a high-confidence personal setup.`,
          micro_lesson:
            tier === "avoid"
              ? "Do not execute this pattern unless the trigger, stop and RR are materially cleaner than your historical examples."
              : "Wait for the same context, confirmation and invalidation quality before treating this setup as repeatable.",
          last_recalculated_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "user_id,setup_slug,asset_type,direction" }
      )
      .select("id")
      .maybeSingle();

    const playbookType =
      tier === "a_plus"
        ? "a_plus_setup"
        : tier === "avoid"
          ? "avoid_setup"
          : "b_setup";

    await supabaseAdmin.from("user_playbook_items").upsert(
      {
        user_id: userId,
        fingerprint_id: fingerprintRow?.id || null,
        item_type: playbookType,
        title: setupName,
        slug: `${setupSlug}_${assetType}_${direction}`,
        asset_type: assetType,
        direction,
        description:
          tier === "a_plus"
            ? "A personal setup candidate built from profitable reviewed trades and repeatable execution features."
            : tier === "avoid"
              ? "A risk pattern detected from weak execution, poor RR or repeated mistakes."
              : "A developing setup. Keep collecting examples before sizing it as an A+ play.",
        when_to_trade: setupFeatures.slice(0, 6),
        confirmation_checklist: setupFeatures.slice(0, 6).map((item) => item.label),
        invalidation_rules: [
          "Do not enter without a clear invalidation level.",
          "Do not chase if the stop is too far from entry.",
        ],
        avoid_if: setupMistakes.slice(0, 6),
        common_mistakes: setupMistakes,
        example_trade_ids: setupReviews.slice(0, 10).map((review) => review.trade_id),
        priority_score: confidenceScore,
        confidence_score: confidenceScore,
        is_active: true,
      },
      { onConflict: "user_id,slug,item_type" }
    );
  }

  const baseRules = [
    {
      rule_slug: "clear_invalidation_required",
      title: "No trade without clean invalidation",
      description:
        "Every trade must have a technical level that clearly proves the idea wrong.",
      rule_type: "risk",
      severity: "critical",
      action: "block",
      conditions: { requires_stop: true },
    },
    {
      rule_slug: "minimum_rr_required",
      title: "Minimum RR must be 1.8+",
      description:
        "Avoid trades where the planned reward-to-risk does not justify the execution risk.",
      rule_type: "risk",
      severity: "high",
      action: "warn",
      conditions: { minimum_rr: 1.8 },
    },
    {
      rule_slug: "no_late_chase",
      title: "No late chase after the clean move",
      description:
        "If the move already happened and the stop is far, wait for a reset or skip.",
      rule_type: "entry",
      severity: "high",
      action: "watchlist_only",
      conditions: { late_entry: true, stop_too_far: true },
    },
  ] as const;

  for (const rule of baseRules) {
    await supabaseAdmin.from("user_personal_rules").upsert(
      {
        user_id: userId,
        rule_slug: rule.rule_slug,
        title: rule.title,
        description: rule.description,
        rule_type: rule.rule_type,
        severity: rule.severity,
        action: rule.action,
        conditions: rule.conditions,
        examples: [],
        is_active: true,
        created_by: "skilledge_ai",
      },
      { onConflict: "user_id,rule_slug" }
    );
  }

  const latestReview = reviews[0];

  if (latestReview?.trade_id) {
    await supabaseAdmin.from("user_execution_scores").upsert(
      {
        user_id: userId,
        trade_id: latestReview.trade_id,
        score_type: "trade",
        execution_score: latestReview.execution_score || 0,
        setup_quality_score: latestReview.setup_score || 0,
        entry_timing_score: latestReview.entry_score || 0,
        risk_discipline_score: latestReview.risk_score || 0,
        exit_quality_score: latestReview.exit_score || 0,
        plan_adherence_score: latestReview.plan_adherence_score || 0,
        emotional_control_score: latestReview.discipline_score || 0,
        result_label:
          latestReview.execution_score && latestReview.execution_score >= 75 && !latestReview.profitable_pattern
            ? "good_loss"
            : latestReview.profitable_pattern && latestReview.execution_score && latestReview.execution_score < 55
              ? "lucky_win"
              : latestReview.avoid_pattern
                ? "bad_trade"
                : latestReview.execution_score && latestReview.execution_score >= 75
                  ? "great_trade"
                  : "unrated",
        strengths: safeArray(latestReview.detected_features),
        leaks: safeArray(latestReview.detected_mistakes),
        next_rules: safeArray(latestReview.improvement_notes),
        summary:
          latestReview.execution_score && latestReview.execution_score >= 75
            ? "Execution quality is strong enough to teach the Personal Edge Engine."
            : "This trade should be used mainly as a lesson or risk-control reference.",
      },
      { onConflict: "user_id,trade_id,score_type" }
    );
  }
}

async function saveStructuredTradeReview(params: {
  userId: string;
  trade: Trade;
  answer: string;
}) {
  const { userId, trade, answer } = params;
  const structured = buildStructuredTradeReview(trade, answer);

  const { error } = await supabaseAdmin.from("trade_ai_reviews").upsert(
    {
      user_id: userId,
      trade_id: trade.id,
      review_status: "completed",
      source: "trade_screenshot",
      asset_type: structured.assetType,
      symbol: trade.ticker,
      direction: structured.direction,
      setup_slug: structured.setupSlug,
      setup_name: structured.setupName,
      quality_score: structured.qualityScore,
      setup_score: structured.setupScore,
      entry_score: structured.entryScore,
      risk_score: structured.riskScore,
      rr_score: structured.rrScore,
      exit_score: structured.exitScore,
      discipline_score: structured.disciplineScore,
      execution_score: structured.executionScore,
      plan_adherence_score: structured.planAdherenceScore,
      data_quality_score: structured.dataQualityScore,
      detected_features: structured.detectedFeatures,
      detected_mistakes: structured.detectedMistakes,
      improvement_notes: structured.improvementNotes,
      personal_rules_triggered: structured.personalRulesTriggered,
      repeatable_pattern: structured.repeatablePattern,
      profitable_pattern: structured.profitablePattern,
      avoid_pattern: structured.avoidPattern,
      a_plus_candidate: structured.aPlusCandidate,
      structured_review: structured.structuredReview,
      public_summary: structured.publicSummary,
      private_coach_note: structured.privateCoachNote,
      model_version: "skilledge-personal-edge-v1",
    },
    { onConflict: "user_id,trade_id,source" }
  );

  if (error) {
    throw error;
  }

  await rebuildPersonalEdgeFoundationForUser(userId);

  return structured;
}

export async function POST(req: Request) {
  const aiGate = await requireAiRouteAccess(req, {
    routeName: "analyze-trade-screenshot",
    requireActiveSubscription: true,
    rateLimit: {
      limit: 15,
      windowMs: 60_000,
    },
  });

  if (!aiGate.ok) return aiGate.response;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "AI backend is not configured." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const body = await req.json();
    const tradeId = body?.tradeId as string | undefined;

    const language =
      body?.language === "ru" || body?.language === "ua" || body?.language === "en"
        ? body.language
        : "en";

    if (!tradeId) {
      return NextResponse.json(
        { error: "Trade id is required." },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid user session." },
        { status: 401 }
      );
    }

    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription?.status || subscription.status !== "active") {
      return NextResponse.json(
        { error: "Active plan or demo access is required." },
        { status: 403 }
      );
    }

    const { data: tradeData, error: tradeError } = await supabaseAdmin
      .from("trades")
      .select(
        "id,user_id,ticker,market,direction,trade_date,entry_price,exit_price,stop_loss,position_size,risk_amount,pnl,result,setup,emotion,mistake,lesson,notes,created_at"
      )
      .eq("id", tradeId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (tradeError || !tradeData) {
      return NextResponse.json(
        { error: "Trade not found." },
        { status: 404 }
      );
    }

    const trade = tradeData as Trade;

    const { data: screenshotData, error: screenshotError } = await supabaseAdmin
      .from("trade_screenshots")
      .select("*")
      .eq("trade_id", trade.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);

    if (screenshotError) {
      return NextResponse.json(
        { error: "Failed to load trade screenshots." },
        { status: 500 }
      );
    }

    const screenshots = (screenshotData ?? []) as TradeScreenshot[];

    if (screenshots.length === 0) {
      return NextResponse.json(
        { error: "No screenshots attached to this trade." },
        { status: 400 }
      );
    }

    const imageInputs = await Promise.all(
      screenshots.map(async (screenshot) => ({
        type: "input_image" as const,
        image_url: await storageFileToDataUrl(
          screenshot.file_path,
          screenshot.mime_type
        ),
      }))
    );

    const planId = subscription.plan_id ?? "starter";
    const model = getOpenAIModel(planId);
    const publicPlanName = getPublicPlanName(planId);
    const usage = await checkAiFeatureLimit({
      supabaseAdmin,
      userId: user.id,
      planId,
      feature: "trade_chart_analysis",
    });

    if (!usage.allowed) {
      return NextResponse.json(
        {
          error:
            "Trade chart analysis limit reached for your current SkillEdge plan. Upgrade your plan or wait until the next monthly reset.",
          code: "AI_LIMIT_REACHED",
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
        },
        { status: 429 }
      );
    }

    const personalEdgeInstruction = [
      "Personal Edge Engine instructions:",
      "This review will train the user's Trading DNA, Setup Fingerprints, Personal Playbook, Anti-Setup Guard and future Personal Match Alerts.",
      "Be precise. Detect the real setup family, entry quality, invalidation quality, RR quality, execution mistakes and whether this is repeatable.",
      "Never promise profit. Treat risk and invalidation first.",
      "Clearly separate: good trade, good loss, lucky win, bad trade, or not enough data.",
      getOutputLanguageInstruction(language),
    ].join("\n");

    const systemPrompt = [
      getSkillEdgeTradeScreenshotPrompt({
        language,
        plan: planId,
        userContext: [
          `Public AI brand: ${publicPlanName}`,
          `Plan ID: ${planId}`,
          `Trade ticker: ${trade.ticker || "unknown"}`,
          `Trade direction: ${trade.direction || "unknown"}`,
          `Entry price: ${trade.entry_price ?? "unknown"}`,
          `Exit price: ${trade.exit_price ?? "unknown"}`,
          `Stop loss: ${trade.stop_loss ?? "unknown"}`,
          `PnL: ${trade.pnl ?? "unknown"}`,
          `Setup: ${trade.setup || "unknown"}`,
          `Screenshots attached: ${imageInputs.length}`,
        ].join("\n"),
      }),
      personalEdgeInstruction,
      getSkillEdgeConciseOutputRules(),
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_output_tokens: 1600,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  {
                    plan: publicPlanName,
                    language,
                    analysisStyle:
                      "SkillEdge Personal Edge review: chart read, setup fingerprint, entry quality, invalidation, targets/RR, execution score, anti-setup warnings, next rule.",
                    trade: {
                      date: trade.trade_date,
                      ticker: trade.ticker,
                      market: trade.market,
                      direction: trade.direction,
                      entry: trade.entry_price,
                      exit: trade.exit_price,
                      stop: trade.stop_loss,
                      size: trade.position_size,
                      risk: trade.risk_amount,
                      pnl: trade.pnl,
                      result: trade.result,
                      setup: trade.setup,
                      emotion: trade.emotion,
                      mistake: trade.mistake,
                      lesson: trade.lesson,
                      notes: trade.notes,
                    },
                    request:
                      "Analyze this trade using both the journal data and attached chart screenshots. Return a professional trading desk review with: 1) setup fingerprint, 2) setup quality, 3) entry timing, 4) stop/invalidation, 5) risk/reward, 6) exit quality, 7) execution score, 8) what was done well, 9) main mistake, 10) whether this should train A+ Playbook or Anti-Setup Guard, 11) the next personal rule for similar trades.",
                  },
                  null,
                  2
                ),
              },
              ...imageInputs,
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error?.message || "Chart analysis failed.",
        },
        { status: response.status }
      );
    }

    const answer =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "No chart analysis returned.";

    await supabaseAdmin.from("ai_analyses").insert({
      user_id: user.id,
      subscription_id: subscription.id,
      trade_id: trade.id,
      analysis_type: "trade_chart",
      user_message: `Trade chart analysis: ${trade.ticker}`,
      ai_response: answer,
      model,
      tokens_used: 0,
    });

    let structuredReview: StructuredTradeReview | null = null;

    try {
      structuredReview = await saveStructuredTradeReview({
        userId: user.id,
        trade,
        answer,
      });
    } catch (structuredError) {
      console.error("[personal-edge] structured review save failed", structuredError);
    }

    return NextResponse.json({
      answer,
      structuredReview,
      personalEdgeUpdated: Boolean(structuredReview),
      aiUsed: usage.used + 1,
      aiLimit: usage.limit,
      remaining: Math.max(usage.remaining - 1, 0),
    });
  } catch (error) {
    console.error("[analyze-trade-screenshot]", error);

    return NextResponse.json(
      { error: "Trade chart analysis backend error." },
      { status: 500 }
    );
  }
}

