import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StrategyRow = {
  id: string;
  title: string | null;
  trust_score?: number | null;
  strategy_score?: number | null;
  discipline_score?: number | null;
  progress_score?: number | null;
};

type StrategyExampleRow = {
  id: string;
  strategy_id: string | null;
  quality_tag: string | null;
  example_type: string | null;
  created_at: string;
};

type StrategyTaskRow = {
  id: string;
  strategy_id: string | null;
  status: string | null;
  task_type: string | null;
  created_at: string;
};

type BeforeTradeCheckRow = {
  id: string;
  strategy_id: string | null;
  gate_status: string | null;
  checklist_result: JsonRecord | null;
  ai_warning: string | null;
  created_at: string;
};

type AfterTradeDebriefRow = {
  id: string;
  strategy_id: string | null;
  execution_score: number | null;
  discipline_score: number | null;
  answers: JsonRecord | null;
  ai_review: JsonRecord | null;
  created_at: string;
};

type TradeRow = {
  id: string;
  strategy_id: string | null;
  strategy_version_id: string | null;
  setup_id: string | null;
  pnl: number | string | null;
  result: string | null;
  mistake: string | null;
  strategy_rule_violations: unknown;
  created_at: string;
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: Array<number | null | undefined>): number {
  const clean = values.map(Number).filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function countBy<T extends string | null | undefined>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function normalizeMistake(value: unknown): string {
  if (typeof value !== "string") return "unclassified";
  const clean = value.trim().toLowerCase();
  if (!clean) return "unclassified";
  if (clean.includes("late") || clean.includes("позд") || clean.includes("запіз")) return "late_entry";
  if (clean.includes("revenge")) return "revenge_trade";
  if (clean.includes("fomo") || clean.includes("chase")) return "fomo_chase";
  if (clean.includes("stop") || clean.includes("стоп")) return "stop_discipline";
  if (clean.includes("risk") || clean.includes("риск") || clean.includes("ризик")) return "risk_violation";
  if (clean.includes("confirm") || clean.includes("подтверж") || clean.includes("підтвер")) return "no_confirmation";
  return clean.slice(0, 42).replace(/\s+/g, "_");
}

function extractAnswerMistakes(row: AfterTradeDebriefRow): string[] {
  const answers = row.answers || {};
  const mistakes: string[] = [];

  if (answers.followedPlan === false) mistakes.push("plan_not_followed");
  if (answers.entryMatchedTrigger === false) mistakes.push("entry_without_trigger");
  if (answers.stopRespected === false) mistakes.push("stop_not_respected");
  if (answers.rrRespected === false) mistakes.push("rr_rule_broken");
  if (answers.managedByPlan === false) mistakes.push("management_not_by_plan");
  if (answers.noChase === false) mistakes.push("fomo_chase");
  if (answers.noRevenge === false) mistakes.push("revenge_trade");
  if (answers.noOvertrade === false) mistakes.push("overtrading");
  if (answers.acceptedInvalidation === false) mistakes.push("invalidation_not_accepted");

  const mainMistake = normalizeMistake(answers.mainMistake || answers.mistake);
  if (mainMistake !== "unclassified") mistakes.push(mainMistake);

  return mistakes;
}

function buildTopMistakes(trades: TradeRow[], debriefs: AfterTradeDebriefRow[]) {
  const raw: string[] = [];

  for (const trade of trades) {
    const mistake = normalizeMistake(trade.mistake);
    if (mistake !== "unclassified") raw.push(mistake);
  }

  for (const debrief of debriefs) {
    raw.push(...extractAnswerMistakes(debrief));
  }

  const counts = countBy(raw);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, count }));
}

function getRecent<T extends { created_at: string }>(items: T[], count = 6): T[] {
  return [...items]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, count);
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const userId = gate.auth.user.id;
    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("strategyId");

    let strategiesQuery = supabaseAdmin
      .from("trading_strategies")
      .select("id,title,trust_score,strategy_score,discipline_score,progress_score")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (strategyId) strategiesQuery = strategiesQuery.eq("id", strategyId);

    const [
      strategiesResult,
      examplesResult,
      tasksResult,
      beforeChecksResult,
      debriefsResult,
      tradesResult,
    ] = await Promise.all([
      strategiesQuery,
      supabaseAdmin
        .from("strategy_examples")
        .select("id,strategy_id,quality_tag,example_type,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("strategy_tasks")
        .select("id,strategy_id,status,task_type,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("strategy_before_trade_checks")
        .select("id,strategy_id,gate_status,checklist_result,ai_warning,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("strategy_after_trade_debriefs")
        .select("id,strategy_id,execution_score,discipline_score,answers,ai_review,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("trades")
        .select("id,strategy_id,strategy_version_id,setup_id,pnl,result,mistake,strategy_rule_violations,created_at")
        .eq("user_id", userId)
        .not("strategy_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (strategiesResult.error) throw strategiesResult.error;
    if (examplesResult.error) throw examplesResult.error;
    if (tasksResult.error) throw tasksResult.error;
    if (beforeChecksResult.error) throw beforeChecksResult.error;
    if (debriefsResult.error) throw debriefsResult.error;
    if (tradesResult.error) throw tradesResult.error;

    const strategies = (strategiesResult.data || []) as StrategyRow[];
    const examples = (examplesResult.data || []) as StrategyExampleRow[];
    const tasks = (tasksResult.data || []) as StrategyTaskRow[];
    const beforeChecks = (beforeChecksResult.data || []) as BeforeTradeCheckRow[];
    const debriefs = (debriefsResult.data || []) as AfterTradeDebriefRow[];
    const trades = (tradesResult.data || []) as TradeRow[];

    const scopeIds = new Set(strategies.map((strategy) => strategy.id));
    const scopedExamples = strategyId ? examples.filter((item) => item.strategy_id && scopeIds.has(item.strategy_id)) : examples;
    const scopedTasks = strategyId ? tasks.filter((item) => item.strategy_id && scopeIds.has(item.strategy_id)) : tasks;
    const scopedBeforeChecks = strategyId ? beforeChecks.filter((item) => item.strategy_id && scopeIds.has(item.strategy_id)) : beforeChecks;
    const scopedDebriefs = strategyId ? debriefs.filter((item) => item.strategy_id && scopeIds.has(item.strategy_id)) : debriefs;
    const scopedTrades = strategyId ? trades.filter((item) => item.strategy_id && scopeIds.has(item.strategy_id)) : trades;

    const completedTasks = scopedTasks.filter((task) => task.status === "completed").length;
    const openTasks = scopedTasks.filter((task) => task.status !== "completed" && task.status !== "skipped").length;
    const taskCompletionRate = scopedTasks.length ? (completedTasks / scopedTasks.length) * 100 : 0;

    const goodExamples = scopedExamples.filter((item) => item.quality_tag === "good" || item.quality_tag === "good_example").length;
    const badExamples = scopedExamples.filter((item) => item.quality_tag === "bad" || item.quality_tag === "bad_example").length;
    const noTradeExamples = scopedExamples.filter((item) => item.quality_tag === "no_trade" || item.example_type === "no_trade").length;
    const missedExamples = scopedExamples.filter((item) => item.quality_tag === "missed_trade" || item.example_type === "missed_trade").length;

    const readyChecks = scopedBeforeChecks.filter((check) => check.gate_status === "ready").length;
    const notReadyChecks = scopedBeforeChecks.filter((check) => check.gate_status === "not_ready").length;
    const reviewChecks = scopedBeforeChecks.filter((check) => check.gate_status === "review").length;

    const executionScore = clampScore(average(scopedDebriefs.map((item) => item.execution_score)));
    const disciplineScore = clampScore(average(scopedDebriefs.map((item) => item.discipline_score)));

    const evidenceScore = clampScore(Math.min(100, (scopedExamples.length / 20) * 100));
    const tradeSampleScore = clampScore(Math.min(100, (scopedTrades.length / 20) * 100));
    const reviewScore = clampScore(Math.min(100, (scopedDebriefs.length / Math.max(1, scopedTrades.length || 1)) * 100));
    const gateScore = clampScore(scopedBeforeChecks.length ? ((readyChecks + reviewChecks * 0.45) / scopedBeforeChecks.length) * 100 : 0);

    const strategyTrustScore = clampScore(
      evidenceScore * 0.22 +
        taskCompletionRate * 0.12 +
        tradeSampleScore * 0.18 +
        reviewScore * 0.12 +
        executionScore * 0.16 +
        disciplineScore * 0.16 +
        gateScore * 0.04,
    );

    const overallStrategyScore = clampScore(
      strategyTrustScore * 0.45 + evidenceScore * 0.18 + executionScore * 0.18 + disciplineScore * 0.19,
    );

    const topMistakes = buildTopMistakes(scopedTrades, scopedDebriefs);

    const readinessGates = [
      { key: "strategy_created", done: strategies.length > 0, progress: strategies.length },
      { key: "historical_examples_10", done: scopedExamples.length >= 10, progress: scopedExamples.length, target: 10 },
      { key: "trade_experiment_20", done: scopedTrades.length >= 20, progress: scopedTrades.length, target: 20 },
      { key: "before_trade_checks", done: scopedBeforeChecks.length >= 3, progress: scopedBeforeChecks.length, target: 3 },
      { key: "after_trade_debriefs", done: scopedDebriefs.length >= Math.min(3, Math.max(1, scopedTrades.length)), progress: scopedDebriefs.length, target: 3 },
      { key: "discipline_above_70", done: disciplineScore >= 70, progress: disciplineScore, target: 70 },
      { key: "execution_above_70", done: executionScore >= 70, progress: executionScore, target: 70 },
      { key: "mistakes_reducing", done: topMistakes.length === 0 || topMistakes[0].count <= 2, progress: topMistakes[0]?.count || 0, target: 2 },
    ];

    const improvementQueue: string[] = [];
    if (scopedExamples.length < 10) improvementQueue.push("collect_more_evidence");
    if (scopedTrades.length < 20) improvementQueue.push("link_more_journal_trades");
    if (scopedBeforeChecks.length < 3) improvementQueue.push("use_before_trade_gate");
    if (scopedDebriefs.length < 3) improvementQueue.push("complete_after_trade_debriefs");
    if (disciplineScore > 0 && disciplineScore < 70) improvementQueue.push("repair_discipline");
    if (executionScore > 0 && executionScore < 70) improvementQueue.push("repair_execution");
    if (topMistakes.length > 0) improvementQueue.push(`fix_${topMistakes[0].key}`);

    const skillMap = {
      setupRecognition: clampScore(evidenceScore * 0.7 + goodExamples * 3),
      riskControl: clampScore(gateScore * 0.55 + disciplineScore * 0.45),
      entryTiming: clampScore(executionScore * 0.7 + (100 - Math.min(100, notReadyChecks * 15)) * 0.3),
      stopDiscipline: clampScore(disciplineScore),
      targetManagement: clampScore(executionScore * 0.65 + tradeSampleScore * 0.35),
      emotionalControl: clampScore(disciplineScore * 0.8 + (100 - Math.min(100, topMistakes.length * 9)) * 0.2),
      reviewConsistency: clampScore(reviewScore),
    };

    return NextResponse.json({
      source: "skillEdge_strategy_analytics",
      analytics: {
        summary: {
          strategies: strategies.length,
          examples: scopedExamples.length,
          trades: scopedTrades.length,
          beforeChecks: scopedBeforeChecks.length,
          debriefs: scopedDebriefs.length,
          completedTasks,
          openTasks,
        },
        scores: {
          strategyTrustScore,
          overallStrategyScore,
          executionScore,
          disciplineScore,
          evidenceScore,
          tradeSampleScore,
          reviewScore,
          gateScore,
          taskCompletionRate: clampScore(taskCompletionRate),
        },
        evidence: {
          goodExamples,
          badExamples,
          noTradeExamples,
          missedExamples,
          byQuality: countBy(scopedExamples.map((item) => item.quality_tag)),
          byType: countBy(scopedExamples.map((item) => item.example_type)),
        },
        beforeTradeGate: {
          ready: readyChecks,
          review: reviewChecks,
          notReady: notReadyChecks,
          recent: getRecent(scopedBeforeChecks, 5),
        },
        afterTradeDebrief: {
          recent: getRecent(scopedDebriefs, 5),
        },
        mistakes: {
          top: topMistakes,
        },
        readinessGates,
        improvementQueue: Array.from(new Set(improvementQueue)).slice(0, 8),
        skillMap,
        recent: {
          examples: getRecent(scopedExamples, 5),
          trades: getRecent(scopedTrades, 5),
        },
      },
    });
  } catch (error) {
    console.error("Strategy analytics error", error);
    return NextResponse.json({ error: "Failed to load Strategy analytics." }, { status: 500 });
  }
}

