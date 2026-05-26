import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StrategyRow = {
  id: string;
  title: string | null;
  primary_setup_slug?: string | null;
  setup_slug?: string | null;
  status?: string | null;
  trust_score?: number | null;
  strategy_score?: number | null;
  discipline_score?: number | null;
};

type VersionRow = {
  id: string;
  version_number?: number | null;
  title?: string | null;
  version_notes?: string | null;
  ai_change_summary?: string | null;
};

type ExampleRow = {
  id: string;
  quality_tag: string | null;
  example_type: string | null;
  symbol?: string | null;
  chart_notes?: string | null;
  confirmation_notes?: string | null;
  invalidation_notes?: string | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  task_type?: string | null;
  created_at: string;
};

type BeforeCheckRow = {
  id: string;
  gate_status: string | null;
  checklist_result?: JsonRecord | null;
  ai_warning?: string | null;
  created_at: string;
};

type DebriefRow = {
  id: string;
  execution_score: number | null;
  discipline_score: number | null;
  answers: JsonRecord | null;
  ai_review: JsonRecord | null;
  created_at: string;
};

type TradeRow = {
  id: string;
  ticker: string | null;
  pnl: number | string | null;
  result: string | null;
  mistake: string | null;
  lesson: string | null;
  notes: string | null;
  created_at: string;
};

function asText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 4000);
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function normalizeMistake(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("late") || clean.includes("позд") || clean.includes("запіз")) return "late_entry";
  if (clean.includes("revenge")) return "revenge_trade";
  if (clean.includes("fomo") || clean.includes("chase")) return "fomo_chase";
  if (clean.includes("stop") || clean.includes("стоп")) return "stop_discipline";
  if (clean.includes("risk") || clean.includes("риск") || clean.includes("ризик")) return "risk_violation";
  if (clean.includes("confirm") || clean.includes("подтверж") || clean.includes("підтвер")) return "no_confirmation";
  return clean.slice(0, 44).replace(/\s+/g, "_");
}

function latest<T extends { created_at: string }>(items: T[], limit: number) {
  return [...items]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

function buildReview({
  strategy,
  examples,
  tasks,
  checks,
  debriefs,
  trades,
}: {
  strategy: StrategyRow;
  examples: ExampleRow[];
  tasks: TaskRow[];
  checks: BeforeCheckRow[];
  debriefs: DebriefRow[];
  trades: TradeRow[];
}) {
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const openTasks = tasks.filter((task) => task.status !== "completed" && task.status !== "skipped").length;
  const taskScore = tasks.length ? (completedTasks / tasks.length) * 100 : 0;

  const goodExamples = examples.filter((item) => ["good", "good_example"].includes(String(item.quality_tag || ""))).length;
  const badExamples = examples.filter((item) => ["bad", "bad_example"].includes(String(item.quality_tag || ""))).length;
  const noTradeExamples = examples.filter((item) => String(item.quality_tag || item.example_type || "").includes("no_trade")).length;
  const missedExamples = examples.filter((item) => String(item.quality_tag || item.example_type || "").includes("missed")).length;

  const readyChecks = checks.filter((check) => check.gate_status === "ready").length;
  const notReadyChecks = checks.filter((check) => check.gate_status === "not_ready").length;
  const reviewChecks = checks.filter((check) => check.gate_status === "review").length;

  const executionScore = clampScore(average(debriefs.map((item) => item.execution_score)));
  const disciplineScore = clampScore(average(debriefs.map((item) => item.discipline_score)));
  const evidenceScore = clampScore(Math.min(100, (examples.length / 20) * 100));
  const tradeSampleScore = clampScore(Math.min(100, (trades.length / 20) * 100));
  const gateScore = checks.length ? clampScore(((readyChecks + reviewChecks * 0.45) / checks.length) * 100) : 0;
  const reviewScore = clampScore(Math.min(100, (debriefs.length / Math.max(1, trades.length || 1)) * 100));
  const strategyTrustScore = clampScore(
    evidenceScore * 0.24 + tradeSampleScore * 0.18 + gateScore * 0.12 + reviewScore * 0.12 + executionScore * 0.16 + disciplineScore * 0.18,
  );
  const overallStrategyScore = clampScore(strategyTrustScore * 0.52 + taskScore * 0.12 + evidenceScore * 0.14 + disciplineScore * 0.12 + executionScore * 0.1);

  const mistakeKeys: string[] = [];
  for (const trade of trades) {
    const key = normalizeMistake(trade.mistake);
    if (key) mistakeKeys.push(key);
  }
  for (const debrief of debriefs) {
    const answers = debrief.answers || {};
    if (answers.followedPlan === false) mistakeKeys.push("plan_not_followed");
    if (answers.entryMatchedTrigger === false) mistakeKeys.push("entry_without_trigger");
    if (answers.stopRespected === false) mistakeKeys.push("stop_not_respected");
    if (answers.rrRespected === false) mistakeKeys.push("rr_rule_broken");
    if (answers.noChase === false) mistakeKeys.push("fomo_chase");
    if (answers.noRevenge === false) mistakeKeys.push("revenge_trade");
    if (answers.noOvertrade === false) mistakeKeys.push("overtrading");
    if (answers.acceptedInvalidation === false) mistakeKeys.push("invalidation_not_accepted");
    const explicit = normalizeMistake(answers.mainMistake || answers.mistake);
    if (explicit) mistakeKeys.push(explicit);
  }

  const topMistakes = Object.entries(countBy(mistakeKeys))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => ({ key, count }));

  const whatWorks: string[] = [];
  if (strategy) whatWorks.push(`Strategy v1 is created around ${strategy.primary_setup_slug || strategy.setup_slug || "the selected playbook"}.`);
  if (examples.length > 0) whatWorks.push(`Evidence base started: ${examples.length} examples collected.`);
  if (goodExamples > 0) whatWorks.push(`${goodExamples} examples are marked as good evidence.`);
  if (checks.length > 0) whatWorks.push(`Before-Trade Gate is being used: ${checks.length} checks saved.`);
  if (debriefs.length > 0) whatWorks.push(`After-Trade Debrief loop is active: ${debriefs.length} debriefs saved.`);
  if (trades.length > 0) whatWorks.push(`${trades.length} journal trades are linked to this strategy.`);
  if (disciplineScore >= 70) whatWorks.push(`Discipline score is holding above 70: ${disciplineScore}%.`);
  if (executionScore >= 70) whatWorks.push(`Execution score is holding above 70: ${executionScore}%.`);

  const whatFails: string[] = [];
  if (examples.length < 10) whatFails.push("Evidence base is still too small. Collect at least 10 clean historical examples before trusting the setup.");
  if (trades.length < 20) whatFails.push("20-trade experiment is not complete. Do not judge the strategy from a few attempts.");
  if (notReadyChecks > 0) whatFails.push(`${notReadyChecks} Before-Trade Gate checks were not ready. The system is catching weak entries.`);
  if (debriefs.length < Math.min(3, Math.max(1, trades.length))) whatFails.push("Not enough after-trade reviews. The strategy cannot improve if execution is not reviewed.");
  if (disciplineScore > 0 && disciplineScore < 70) whatFails.push(`Discipline score is weak: ${disciplineScore}%. Focus on stop respect, no revenge and no overtrading.`);
  if (executionScore > 0 && executionScore < 70) whatFails.push(`Execution score is weak: ${executionScore}%. Focus on trigger quality, timing and management.`);
  if (topMistakes.length > 0) whatFails.push(`Main repeated leak: ${topMistakes[0].key.replace(/_/g, " ")}.`);

  const mistakes = topMistakes.map((item) => ({
    key: item.key,
    count: item.count,
    action: item.key.includes("stop")
      ? "Add stricter stop/invalidation rule before the next attempt."
      : item.key.includes("fomo") || item.key.includes("late")
        ? "Add a no-chase rule and use the Before-Trade Gate before entry."
        : item.key.includes("revenge") || item.key.includes("overtrading")
          ? "Add a daily loss / cooldown rule and stop after emotional trades."
          : "Turn this leak into one checklist rule and test it for the next 5 attempts.",
  }));

  const ruleUpdates: string[] = [];
  if (examples.length < 10) ruleUpdates.push("Do not promote this strategy to playbook until 10 historical examples are collected.");
  if (checks.length < 3) ruleUpdates.push("Use Before-Trade Gate before the next 3 attempts to prove the trade matches the strategy.");
  if (debriefs.length < 3) ruleUpdates.push("Complete After-Trade Debrief after every attempt until discipline data is reliable.");
  if (topMistakes.some((item) => item.key.includes("fomo") || item.key.includes("late"))) ruleUpdates.push("Add avoid rule: no entry after the clean move already happened or when RR is below plan.");
  if (topMistakes.some((item) => item.key.includes("stop"))) ruleUpdates.push("Add invalidation rule: stop must be defined before entry and cannot be moved without a new plan.");
  if (ruleUpdates.length === 0) ruleUpdates.push("Keep current rules and collect more data before changing the strategy.");

  const nextTasks: string[] = [];
  if (examples.length < 10) nextTasks.push("Add 3 more historical examples and label them as good, bad, no-trade or missed.");
  if (checks.length < 3) nextTasks.push("Run Before-Trade Gate on the next planned setup before entry.");
  if (trades.length < 20) nextTasks.push("Link the next journal trades to this strategy and complete the 20-trade experiment.");
  if (debriefs.length < 3) nextTasks.push("Complete After-Trade Debrief after the next attempt.");
  if (topMistakes[0]) nextTasks.push(`Run a focused drill against this leak: ${topMistakes[0].key.replace(/_/g, " ")}.`);
  if (nextTasks.length === 0) nextTasks.push("Prepare version v2 only if the evidence clearly shows one rule to improve.");

  const verdict = strategyTrustScore >= 75
    ? "Developing strongly"
    : strategyTrustScore >= 45
      ? "Promising but still testing"
      : "Early stage — do not trust yet";

  const summary = `${strategy.title || "Strategy"}: ${verdict}. Trust ${strategyTrustScore}/100, discipline ${disciplineScore || 0}/100, execution ${executionScore || 0}/100. Next focus: ${nextTasks[0]}`;

  return {
    title: `Strategy Review — ${strategy.title || "Trading Strategy"}`,
    summary,
    whatWorks: whatWorks.length ? whatWorks : ["The strategy foundation exists. Now it needs evidence, journal data and disciplined execution."],
    whatFails: whatFails.length ? whatFails : ["No major weakness detected yet. Keep collecting data before changing rules."],
    mistakes,
    ruleUpdates,
    nextTasks,
    scores: {
      strategyTrustScore,
      overallStrategyScore,
      evidenceScore,
      tradeSampleScore,
      gateScore,
      reviewScore,
      executionScore,
      disciplineScore,
      taskScore: clampScore(taskScore),
    },
    sourceCounts: {
      examples: examples.length,
      goodExamples,
      badExamples,
      noTradeExamples,
      missedExamples,
      tasks: tasks.length,
      completedTasks,
      openTasks,
      beforeChecks: checks.length,
      readyChecks,
      reviewChecks,
      notReadyChecks,
      debriefs: debriefs.length,
      trades: trades.length,
    },
    latest: {
      examples: latest(examples, 3),
      checks: latest(checks, 3),
      debriefs: latest(debriefs, 3),
      trades: latest(trades, 3),
    },
  };
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 35, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const userId = gate.auth.user.id;
    const body = await request.json().catch(() => ({}));
    const requestedStrategyId = asText(body.strategyId, "");
    const requestedVersionId = asText(body.strategyVersionId, "");

    let strategyQuery = supabaseAdmin
      .from("trading_strategies")
      .select("id,title,primary_setup_slug,status,trust_score,strategy_score,discipline_score")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (requestedStrategyId) strategyQuery = strategyQuery.eq("id", requestedStrategyId);

    const { data: strategyRows, error: strategyError } = await strategyQuery;
    if (strategyError) throw strategyError;

    const strategy = (strategyRows || [])[0] as StrategyRow | undefined;
    if (!strategy) {
      return NextResponse.json({ error: "Create Strategy v1 before running Strategy Review." }, { status: 400 });
    }

    let version: VersionRow | null = null;
    if (requestedVersionId) {
      const { data, error } = await supabaseAdmin
        .from("strategy_versions")
        .select("id,version_number,title,version_notes,ai_change_summary")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .eq("id", requestedVersionId)
        .maybeSingle();
      if (error) throw error;
      version = (data as VersionRow | null) || null;
    }

    if (!version) {
      const { data, error } = await supabaseAdmin
        .from("strategy_versions")
        .select("id,version_number,title,version_notes,ai_change_summary")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      version = (data as VersionRow | null) || null;
    }

    const [examplesResult, tasksResult, checksResult, debriefsResult, tradesResult] = await Promise.all([
      supabaseAdmin
        .from("strategy_examples")
        .select("id,quality_tag,example_type,symbol,chart_notes,confirmation_notes,invalidation_notes,created_at")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("strategy_tasks")
        .select("id,title,status,task_type,created_at")
        .eq("user_id", userId)
        .or(`strategy_id.eq.${strategy.id},strategy_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("strategy_before_trade_checks")
        .select("id,gate_status,checklist_result,ai_warning,created_at")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("strategy_after_trade_debriefs")
        .select("id,execution_score,discipline_score,answers,ai_review,created_at")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("trades")
        .select("id,ticker,pnl,result,mistake,lesson,notes,created_at")
        .eq("user_id", userId)
        .eq("strategy_id", strategy.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (examplesResult.error) throw examplesResult.error;
    if (tasksResult.error) throw tasksResult.error;
    if (checksResult.error) throw checksResult.error;
    if (debriefsResult.error) throw debriefsResult.error;
    if (tradesResult.error) throw tradesResult.error;

    const review = buildReview({
      strategy,
      examples: (examplesResult.data || []) as ExampleRow[],
      tasks: (tasksResult.data || []) as TaskRow[],
      checks: (checksResult.data || []) as BeforeCheckRow[],
      debriefs: (debriefsResult.data || []) as DebriefRow[],
      trades: (tradesResult.data || []) as TradeRow[],
    });

    const { data: savedReview, error: saveError } = await supabaseAdmin
      .from("strategy_ai_reviews")
      .insert({
        user_id: userId,
        strategy_id: strategy.id,
        strategy_version_id: version?.id || null,
        experiment_id: null,
        review_type: "strategy_review",
        title: review.title,
        summary: review.summary,
        what_works: review.whatWorks,
        what_fails: review.whatFails,
        mistakes: review.mistakes,
        rule_updates: review.ruleUpdates,
        next_tasks: review.nextTasks,
        scores: review.scores,
        source_counts: review.sourceCounts,
      })
      .select("*")
      .single();

    if (saveError) throw saveError;

    await supabaseAdmin
      .from("trading_strategies")
      .update({
        trust_score: review.scores.strategyTrustScore,
        strategy_score: review.scores.overallStrategyScore,
        discipline_score: review.scores.disciplineScore,
        next_action: review.nextTasks[0] || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", strategy.id)
      .eq("user_id", userId);

    return NextResponse.json({
      source: "skillEdge_strategy_review",
      review: savedReview,
      generated: review,
    });
  } catch (error) {
    console.error("Strategy review error", error);
    return NextResponse.json({ error: "Failed to run Strategy Review." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId") || "";

    let query = supabaseAdmin
      .from("strategy_ai_reviews")
      .select("*")
      .eq("user_id", gate.auth.user.id)
      .order("created_at", { ascending: false })
      .limit(8);

    if (strategyId) query = query.eq("strategy_id", strategyId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_reviews",
      reviews: data || [],
    });
  } catch (error) {
    console.error("Strategy review list error", error);
    return NextResponse.json({ error: "Failed to load Strategy Reviews." }, { status: 500 });
  }
}
