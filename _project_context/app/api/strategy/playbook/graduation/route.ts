import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StrategyRow = {
  id: string;
  user_id: string;
  title: string | null;
  primary_setup_slug?: string | null;
  market?: string | null;
  direction?: string | null;
  status?: string | null;
  trust_score?: number | null;
  strategy_score?: number | null;
  discipline_score?: number | null;
};

type VersionRow = {
  id: string;
  strategy_id: string;
  version_number: number | null;
  title: string | null;
  is_active?: boolean | null;
  status?: string | null;
  stop_rule?: string | null;
  avoid_if?: string | null;
  checklist?: unknown;
  common_mistakes?: unknown;
};

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: unknown[]) {
  const clean = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMistake(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("late") || clean.includes("позд") || clean.includes("запіз")) return "late_entry";
  if (clean.includes("fomo") || clean.includes("chase")) return "fomo_chase";
  if (clean.includes("revenge")) return "revenge_trade";
  if (clean.includes("stop") || clean.includes("стоп")) return "stop_not_respected";
  if (clean.includes("rr") || clean.includes("risk") || clean.includes("риск") || clean.includes("ризик")) return "rr_rule_broken";
  if (clean.includes("plan") || clean.includes("план")) return "plan_not_followed";
  if (clean.includes("overtrading")) return "overtrading";
  return clean.slice(0, 44).replace(/\s+/g, "_");
}

async function getUserId(request: Request) {
  const gate = await requireFeatureAccess(request, "journal", {
    rateLimit: { limit: 50, windowMs: 60_000 },
  });

  if (!gate.ok) {
    return { error: gate.response };
  }

  return { userId: gate.auth.user.id };
}

async function loadCurrentStrategy(userId: string, requestedStrategyId?: string | null) {
  let query = supabaseAdmin
    .from("trading_strategies")
    .select("id,user_id,title,primary_setup_slug,market,direction,status,trust_score,strategy_score,discipline_score,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (requestedStrategyId) query = query.eq("id", requestedStrategyId);

  const { data, error } = await query;
  if (error) throw error;
  return (data?.[0] || null) as StrategyRow | null;
}

async function loadActiveVersion(userId: string, strategyId: string) {
  const { data, error } = await supabaseAdmin
    .from("strategy_versions")
    .select("id,strategy_id,version_number,title,is_active,status,stop_rule,avoid_if,checklist,common_mistakes,created_at")
    .eq("user_id", userId)
    .eq("strategy_id", strategyId)
    .order("is_active", { ascending: false })
    .order("version_number", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] || null) as VersionRow | null;
}

async function buildGraduationEvaluation(userId: string, strategy: StrategyRow, version: VersionRow) {
  const [examplesRes, tradesRes, beforeRes, debriefRes, reviewRes, versionRes] = await Promise.all([
    supabaseAdmin
      .from("strategy_examples")
      .select("id,quality_tag,example_type,symbol,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id),
    supabaseAdmin
      .from("trades")
      .select("id,ticker,pnl,result,mistake,lesson,notes,strategy_id,strategy_version_id,created_at")
      .eq("strategy_id", strategy.id),
    supabaseAdmin
      .from("strategy_before_trade_checks")
      .select("id,gate_status,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id),
    supabaseAdmin
      .from("strategy_after_trade_debriefs")
      .select("id,execution_score,discipline_score,answers,ai_review,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id),
    supabaseAdmin
      .from("strategy_ai_reviews")
      .select("id,review_type,title,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id),
    supabaseAdmin
      .from("strategy_versions")
      .select("id,version_number,status,is_active,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id),
  ]);

  const firstError = examplesRes.error || tradesRes.error || beforeRes.error || debriefRes.error || reviewRes.error || versionRes.error;
  if (firstError) throw firstError;

  const examples = examplesRes.data || [];
  const trades = tradesRes.data || [];
  const beforeChecks = beforeRes.data || [];
  const debriefs = debriefRes.data || [];
  const reviews = reviewRes.data || [];
  const versions = versionRes.data || [];

  const goodExamples = examples.filter((item) => String(item.quality_tag || "").toLowerCase().includes("good")).length;
  const badExamples = examples.filter((item) => String(item.quality_tag || "").toLowerCase().includes("bad")).length;
  const noTradeExamples = examples.filter((item) => String(item.quality_tag || "").toLowerCase().includes("no") || String(item.example_type || "").toLowerCase().includes("no")).length;
  const missedExamples = examples.filter((item) => String(item.quality_tag || "").toLowerCase().includes("miss") || String(item.example_type || "").toLowerCase().includes("miss")).length;

  const maxVersion = Math.max(...versions.map((item) => asNumber(item.version_number, 1)), asNumber(version.version_number, 1));
  const avgExecution = average(debriefs.map((item) => item.execution_score));
  const avgDiscipline = average(debriefs.map((item) => item.discipline_score));
  const readyChecks = beforeChecks.filter((item) => String(item.gate_status || "").toLowerCase().includes("ready") && !String(item.gate_status || "").toLowerCase().includes("not")).length;

  const mistakeKeys = [
    ...trades.map((item) => normalizeMistake(item.mistake)),
    ...debriefs.flatMap((item) => {
      const answers = item.answers as JsonRecord | null;
      const leaks = asArray(answers?.leaks || answers?.mistakes || answers?.disciplineLeaks);
      return leaks.map(normalizeMistake);
    }),
  ].filter(Boolean);

  const mistakeCounts = mistakeKeys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const criticalRepeatedLeak = Object.entries(mistakeCounts).find(([, count]) => count >= 3)?.[0] || "";

  const gates = [
    { key: "strategy_version_v2", label: "Strategy v2 or higher", done: maxVersion >= 2, progress: maxVersion, target: 2 },
    { key: "historical_examples_10", label: "10 historical examples", done: examples.length >= 10, progress: examples.length, target: 10 },
    { key: "evidence_quality", label: "Good, bad and no-trade examples", done: goodExamples >= 5 && badExamples >= 2 && noTradeExamples >= 2, progress: goodExamples + badExamples + noTradeExamples, target: 9 },
    { key: "trade_attempts_20", label: "20 linked trades / attempts", done: trades.length >= 20, progress: trades.length, target: 20 },
    { key: "before_trade_gate", label: "Before-Trade Gate used", done: beforeChecks.length >= 5, progress: beforeChecks.length, target: 5 },
    { key: "after_trade_debrief", label: "After-Trade Debrief used", done: debriefs.length >= 5, progress: debriefs.length, target: 5 },
    { key: "discipline_above_70", label: "Discipline above 70", done: avgDiscipline >= 70, progress: Math.round(avgDiscipline), target: 70 },
    { key: "execution_above_70", label: "Execution above 70", done: avgExecution >= 70, progress: Math.round(avgExecution), target: 70 },
    { key: "no_critical_repeated_leak", label: "No critical repeated leak", done: !criticalRepeatedLeak, progress: criticalRepeatedLeak ? 0 : 1, target: 1 },
  ];

  const gateScore = gates.reduce((sum, gate) => sum + (gate.done ? 1 : Math.min(1, asNumber(gate.progress, 0) / Math.max(1, asNumber(gate.target, 1)))), 0) / gates.length;
  const evidenceScore = clamp((Math.min(examples.length, 10) / 10) * 45 + (Math.min(goodExamples, 5) / 5) * 20 + (Math.min(badExamples, 2) / 2) * 15 + (Math.min(noTradeExamples, 2) / 2) * 15 + (missedExamples > 0 ? 5 : 0));
  const processScore = clamp((Math.min(beforeChecks.length, 5) / 5) * 30 + (Math.min(debriefs.length, 5) / 5) * 30 + (Math.min(reviews.length, 2) / 2) * 20 + (maxVersion >= 2 ? 20 : 0));
  const performanceScore = clamp((Math.min(trades.length, 20) / 20) * 30 + Math.min(avgExecution, 100) * 0.35 + Math.min(avgDiscipline, 100) * 0.35);
  const readinessScore = clamp(gateScore * 42 + evidenceScore * 0.22 + processScore * 0.2 + performanceScore * 0.16 - (criticalRepeatedLeak ? 12 : 0));

  const status = readinessScore >= 80 && gates.every((gate) => gate.done) ? "approved" : readinessScore >= 55 ? "candidate" : "not_ready";

  const blockers = gates
    .filter((gate) => !gate.done)
    .slice(0, 5)
    .map((gate) => gate.key);

  const nextActions = blockers.length
    ? blockers.map((key) => {
        if (key === "historical_examples_10") return "Collect more clean historical examples before trusting this setup.";
        if (key === "evidence_quality") return "Add bad and no-trade examples so the playbook protects against false positives.";
        if (key === "trade_attempts_20") return "Link more journal trades or observation attempts to this strategy.";
        if (key === "before_trade_gate") return "Use Before-Trade Gate before the next planned attempts.";
        if (key === "after_trade_debrief") return "Complete After-Trade Debrief after every attempt.";
        if (key === "discipline_above_70") return "Focus on discipline: stop, invalidation, no chase and no revenge.";
        if (key === "execution_above_70") return "Improve execution timing, trigger quality and management.";
        if (key === "strategy_version_v2") return "Create and test Strategy v2 before graduation.";
        if (key === "no_critical_repeated_leak") return `Reduce repeated leak: ${criticalRepeatedLeak}.`;
        return "Build more evidence before playbook graduation.";
      })
    : ["Run final graduation review and promote this strategy into Personal Playbook."];

  const evidenceSummary = {
    setup_slug: strategy.primary_setup_slug || "",
    examples: examples.length,
    good_examples: goodExamples,
    bad_examples: badExamples,
    no_trade_examples: noTradeExamples,
    missed_examples: missedExamples,
    linked_trades: trades.length,
    before_trade_checks: beforeChecks.length,
    ready_checks: readyChecks,
    after_trade_debriefs: debriefs.length,
    ai_reviews: reviews.length,
    versions: versions.length,
    max_version: maxVersion,
    execution_score: Math.round(avgExecution),
    discipline_score: Math.round(avgDiscipline),
    critical_repeated_leak: criticalRepeatedLeak,
    gates,
    blockers,
    next_actions: nextActions,
    scores: {
      readiness_score: readinessScore,
      evidence_score: evidenceScore,
      process_score: processScore,
      performance_score: performanceScore,
    },
  };

  const aiSummary =
    status === "approved"
      ? `${strategy.title || "Strategy"} passed the graduation check. Keep the rules strict and promote it to Personal Playbook.`
      : status === "candidate"
        ? `${strategy.title || "Strategy"} is a Playbook Candidate, but it still needs stronger evidence and cleaner discipline before promotion.`
        : `${strategy.title || "Strategy"} is not ready for Personal Playbook yet. Treat it as a hypothesis, not a proven edge.`;

  return {
    status,
    graduation_score: readinessScore,
    evidence_summary: evidenceSummary,
    ai_summary: aiSummary,
    strategy,
    version,
  };
}

async function saveGraduationEvaluation(userId: string, strategy: StrategyRow, version: VersionRow, evaluation: Awaited<ReturnType<typeof buildGraduationEvaluation>>) {
  const { data, error } = await supabaseAdmin
    .from("strategy_playbook_graduations")
    .insert({
      user_id: userId,
      strategy_id: strategy.id,
      strategy_version_id: version.id,
      status: evaluation.status === "approved" ? "candidate" : evaluation.status,
      graduation_score: evaluation.graduation_score,
      evidence_summary: evaluation.evidence_summary,
      ai_summary: evaluation.ai_summary,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function promoteToPlaybook(userId: string, graduationId: string) {
  const { data: graduation, error: graduationError } = await supabaseAdmin
    .from("strategy_playbook_graduations")
    .select("*, trading_strategies(title, primary_setup_slug, market, direction)")
    .eq("user_id", userId)
    .eq("id", graduationId)
    .single();

  if (graduationError) throw graduationError;
  if (!graduation) throw new Error("Graduation review not found.");

  const evidence = (graduation.evidence_summary || {}) as JsonRecord;
  const scores = (evidence.scores || {}) as JsonRecord;
  const strategy = (graduation.trading_strategies || {}) as JsonRecord;
  const title = String(strategy.title || "Personal Playbook Setup");
  const slug = String(strategy.primary_setup_slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "_")).slice(0, 80);
  const directionRaw = String(strategy.direction || "unknown").toLowerCase();
  const direction = ["long", "short", "both"].includes(directionRaw) ? directionRaw : "unknown";
  const marketRaw = String(strategy.market || "unknown").toLowerCase();
  const assetType = marketRaw.includes("crypto") ? "crypto" : marketRaw.includes("stock") || marketRaw.includes("equity") ? "stock" : "unknown";

  const playbookPayload = {
    user_id: userId,
    item_type: "a_plus_setup",
    title,
    slug,
    asset_type: assetType,
    direction,
    description: graduation.ai_summary || "Promoted from Strategy Graduation System.",
    when_to_trade: evidence.next_actions || [],
    confirmation_checklist: ["Use the documented setup checklist", "Confirm trigger before entry", "Keep risk inside plan"],
    invalidation_rules: ["Stop must stay behind real invalidation", "Do not move stop without a new plan"],
    avoid_if: ["No entry after clean move already happened", "No trade if RR is below plan", "No revenge trade"],
    common_mistakes: evidence.critical_repeated_leak ? [evidence.critical_repeated_leak] : [],
    priority_score: asNumber(scores.readiness_score, graduation.graduation_score),
    confidence_score: graduation.graduation_score,
    is_active: true,
    strategy_id: graduation.strategy_id,
    strategy_version_id: graduation.strategy_version_id,
  };

  const { data: playbookItem, error: playbookError } = await supabaseAdmin
    .from("user_playbook_items")
    .upsert(playbookPayload, { onConflict: "user_id,slug,item_type" })
    .select("id")
    .single();

  if (playbookError) throw playbookError;

  const { data: updatedGraduation, error: updateError } = await supabaseAdmin
    .from("strategy_playbook_graduations")
    .update({ status: "approved", playbook_item_id: playbookItem?.id || null, updated_at: new Date().toISOString() })
    .eq("id", graduationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await supabaseAdmin
    .from("trading_strategies")
    .update({ status: "playbook", current_stage: "personal_playbook", next_action: "Keep testing this Personal Playbook setup with strict risk and outcome tracking." })
    .eq("id", graduation.strategy_id)
    .eq("user_id", userId);

  return { graduation: updatedGraduation, playbookItem };
}

export async function GET(request: Request) {
  try {
    const user = await getUserId(request);
    if (user.error) return user.error;

    const url = new URL(request.url);
    const strategyId = url.searchParams.get("strategyId");
    const strategy = await loadCurrentStrategy(user.userId, strategyId);
    if (!strategy) return NextResponse.json({ graduation: null, evaluation: null });

    const version = await loadActiveVersion(user.userId, strategy.id);
    if (!version) return NextResponse.json({ graduation: null, evaluation: null });

    const evaluation = await buildGraduationEvaluation(user.userId, strategy, version);

    const { data: graduation } = await supabaseAdmin
      .from("strategy_playbook_graduations")
      .select("*")
      .eq("user_id", user.userId)
      .eq("strategy_id", strategy.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      source: "skillEdge_strategy_playbook_graduation",
      graduation: graduation || null,
      evaluation,
    });
  } catch (error) {
    console.error("strategy playbook graduation GET error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load playbook graduation." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserId(request);
    if (user.error) return user.error;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "evaluate");

    if (action === "promote") {
      const graduationId = String(body.graduationId || "");
      if (!graduationId) return NextResponse.json({ error: "Missing graduationId." }, { status: 400 });
      const result = await promoteToPlaybook(user.userId, graduationId);
      return NextResponse.json({ source: "skillEdge_strategy_playbook_graduation_promote", ...result });
    }

    const strategy = await loadCurrentStrategy(user.userId, typeof body.strategyId === "string" ? body.strategyId : null);
    if (!strategy) return NextResponse.json({ error: "Create Strategy v1 before playbook graduation." }, { status: 400 });

    const version = await loadActiveVersion(user.userId, strategy.id);
    if (!version) return NextResponse.json({ error: "Create a strategy version before playbook graduation." }, { status: 400 });

    const evaluation = await buildGraduationEvaluation(user.userId, strategy, version);
    const graduation = await saveGraduationEvaluation(user.userId, strategy, version, evaluation);

    return NextResponse.json({
      source: "skillEdge_strategy_playbook_graduation_evaluate",
      graduation,
      evaluation,
    });
  } catch (error) {
    console.error("strategy playbook graduation POST error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to run playbook graduation." }, { status: 500 });
  }
}
