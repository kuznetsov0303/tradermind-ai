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
  trust_score?: number | null;
  strategy_score?: number | null;
  discipline_score?: number | null;
  status?: string | null;
};

type WeeklyReportRow = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  title: string;
  summary: string | null;
  completed_work: unknown[];
  improvements: unknown[];
  repeated_mistakes: unknown[];
  next_week_plan: unknown[];
  strategy_health: JsonRecord;
  created_at: string;
};

function startOfWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: Array<number | null | undefined>) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function normalizeMistake(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("late") || clean.includes("позд") || clean.includes("запіз")) return "late_entry";
  if (clean.includes("revenge")) return "revenge_trade";
  if (clean.includes("fomo") || clean.includes("chase")) return "fomo_chase";
  if (clean.includes("stop") || clean.includes("стоп")) return "stop_discipline";
  if (clean.includes("rr") || clean.includes("risk") || clean.includes("риск") || clean.includes("ризик")) return "risk_violation";
  if (clean.includes("plan") || clean.includes("план")) return "plan_not_followed";
  return clean.slice(0, 44).replace(/\s+/g, "_");
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (!item) return acc;
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function getUserId(request: Request) {
  const gate = await requireFeatureAccess(request, "journal", {
    rateLimit: { limit: 40, windowMs: 60_000 },
  });

  if (!gate.ok) {
    return { error: gate.response };
  }

  return { userId: gate.auth.user.id };
}

async function loadCurrentStrategy(userId: string, requestedStrategyId?: string | null) {
  let query = supabaseAdmin
    .from("trading_strategies")
    .select("id,title,primary_setup_slug,status,trust_score,strategy_score,discipline_score,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (requestedStrategyId) query = query.eq("id", requestedStrategyId);

  const { data, error } = await query;
  if (error) throw error;
  return (data?.[0] || null) as StrategyRow | null;
}

async function buildWeeklyReport(userId: string, strategy: StrategyRow, weekStart: Date, weekEnd: Date) {
  const startIso = weekStart.toISOString();
  const endIso = new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const [tasksRes, examplesRes, tradesRes, beforeRes, debriefRes, reviewRes, versionRes] = await Promise.all([
    supabaseAdmin
      .from("strategy_tasks")
      .select("id,title,status,created_at")
      .eq("user_id", userId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("strategy_examples")
      .select("id,quality_tag,example_type,symbol,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("trades")
      .select("id,ticker,pnl,result,mistake,lesson,notes,strategy_id,strategy_version_id,strategy_experiment_id,created_at")
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("strategy_before_trade_checks")
      .select("id,gate_status,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("strategy_after_trade_debriefs")
      .select("id,execution_score,discipline_score,answers,ai_review,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("strategy_ai_reviews")
      .select("id,review_type,title,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("strategy_versions")
      .select("id,version_number,title,created_at")
      .eq("user_id", userId)
      .eq("strategy_id", strategy.id)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);

  for (const response of [tasksRes, examplesRes, tradesRes, beforeRes, debriefRes, reviewRes, versionRes]) {
    if (response.error) throw response.error;
  }

  const tasks = tasksRes.data || [];
  const examples = examplesRes.data || [];
  const trades = tradesRes.data || [];
  const beforeChecks = beforeRes.data || [];
  const debriefs = debriefRes.data || [];
  const reviews = reviewRes.data || [];
  const versions = versionRes.data || [];

  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const readyChecks = beforeChecks.filter((check) => check.gate_status === "ready").length;
  const notReadyChecks = beforeChecks.filter((check) => check.gate_status === "not_ready").length;
  const executionScore = clampScore(average(debriefs.map((item) => Number(item.execution_score))));
  const disciplineScore = clampScore(average(debriefs.map((item) => Number(item.discipline_score))));

  const mistakeKeys: string[] = [];
  for (const trade of trades) {
    const key = normalizeMistake(trade.mistake);
    if (key) mistakeKeys.push(key);
  }
  for (const debrief of debriefs) {
    const answers = (debrief.answers || {}) as JsonRecord;
    if (answers.followedPlan === false) mistakeKeys.push("plan_not_followed");
    if (answers.stopRespected === false) mistakeKeys.push("stop_not_respected");
    if (answers.rrRespected === false) mistakeKeys.push("rr_rule_broken");
    if (answers.noChase === false) mistakeKeys.push("fomo_chase");
    if (answers.noRevenge === false) mistakeKeys.push("revenge_trade");
    if (answers.noOvertrade === false) mistakeKeys.push("overtrading");
    const explicit = normalizeMistake(answers.mainMistake || answers.mistake);
    if (explicit) mistakeKeys.push(explicit);
  }

  const repeatedMistakes = Object.entries(countBy(mistakeKeys))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => ({ key, count }));

  const completedWork = [
    { key: "tasks_completed", label: "Tasks completed", value: completedTasks, total: tasks.length },
    { key: "examples_added", label: "Evidence examples added", value: examples.length },
    { key: "journal_trades_linked", label: "Journal trades linked", value: trades.length },
    { key: "before_trade_checks", label: "Before-Trade Gate checks", value: beforeChecks.length, ready: readyChecks, notReady: notReadyChecks },
    { key: "after_trade_debriefs", label: "After-Trade Debriefs", value: debriefs.length },
    { key: "ai_reviews", label: "AI Strategy Reviews", value: reviews.length },
    { key: "version_updates", label: "Strategy versions created", value: versions.length },
  ];

  const improvements = [
    executionScore > 0 ? { key: "execution", text: `Execution average this week: ${executionScore}%.` } : null,
    disciplineScore > 0 ? { key: "discipline", text: `Discipline average this week: ${disciplineScore}%.` } : null,
    beforeChecks.length > 0 ? { key: "gate", text: `Before-Trade Gate used ${beforeChecks.length} times; ${readyChecks} were ready.` } : null,
    versions.length > 0 ? { key: "version", text: `New strategy version created and entered testing.` } : null,
  ].filter(Boolean);

  const nextWeekPlan = [
    examples.length < 5 ? "Collect at least 5 clean historical examples for this setup." : "Add 3 more examples and classify them as good, bad, no-trade or missed.",
    beforeChecks.length < Math.max(3, trades.length) ? "Run Before-Trade Gate before the next 3 planned attempts." : "Keep using Before-Trade Gate and only skip weak entries with a clear reason.",
    debriefs.length < Math.max(3, trades.length) ? "Complete After-Trade Debrief after every attempt." : "Review repeated leaks and turn the top mistake into one checklist rule.",
    repeatedMistakes.length > 0 ? `Focus leak: ${String(repeatedMistakes[0].key).replace(/_/g, " ")}.` : "Do not add new setups until the current experiment has more evidence.",
  ];

  const dataPoints = tasks.length + examples.length + trades.length + beforeChecks.length + debriefs.length + reviews.length + versions.length;
  const healthScore = clampScore(
    Math.min(100, examples.length * 7) * 0.22 +
      Math.min(100, trades.length * 5) * 0.18 +
      Math.min(100, beforeChecks.length * 14) * 0.14 +
      Math.min(100, debriefs.length * 14) * 0.16 +
      executionScore * 0.14 +
      disciplineScore * 0.16,
  );

  const strategyName = getString(strategy.title, "Strategy");
  const title = `Weekly Strategy Desk Report — ${strategyName}`;
  const summary = `${strategyName}: ${dataPoints} tracked actions this week. Health ${healthScore}/100, execution ${executionScore || 0}/100, discipline ${disciplineScore || 0}/100. Next focus: ${nextWeekPlan[0]}`;

  return {
    title,
    summary,
    completedWork,
    improvements,
    repeatedMistakes,
    nextWeekPlan,
    strategyHealth: {
      strategy_id: strategy.id,
      strategy_title: strategyName,
      setup_slug: strategy.primary_setup_slug || null,
      health_score: healthScore,
      execution_score: executionScore,
      discipline_score: disciplineScore,
      evidence_count: examples.length,
      trades_count: trades.length,
      before_checks: beforeChecks.length,
      after_debriefs: debriefs.length,
      data_points: dataPoints,
      week_start: toDateOnly(weekStart),
      week_end: toDateOnly(weekEnd),
    },
  };
}

export async function GET(request: Request) {
  try {
    const auth = await getUserId(request);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    let query = supabaseAdmin
      .from("strategy_weekly_reports")
      .select("*")
      .eq("user_id", auth.userId)
      .order("week_start", { ascending: false })
      .limit(1);

    if (weekStart) query = query.eq("week_start", weekStart);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ source: "skillEdge_strategy_weekly_report", report: (data?.[0] || null) as WeeklyReportRow | null });
  } catch (error) {
    console.error("strategy weekly report GET error", error);
    return NextResponse.json({ error: "Failed to load weekly strategy report." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getUserId(request);
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({} as JsonRecord));
    const requestedStrategyId = typeof body.strategyId === "string" ? body.strategyId : null;
    const strategy = await loadCurrentStrategy(auth.userId, requestedStrategyId);

    if (!strategy?.id) {
      return NextResponse.json({ error: "Create a strategy before generating a weekly report." }, { status: 400 });
    }

    const weekStart = startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    const report = await buildWeeklyReport(auth.userId, strategy, weekStart, weekEnd);

    const payload = {
      user_id: auth.userId,
      week_start: toDateOnly(weekStart),
      week_end: toDateOnly(weekEnd),
      title: report.title,
      summary: report.summary,
      completed_work: report.completedWork,
      improvements: report.improvements,
      repeated_mistakes: report.repeatedMistakes,
      next_week_plan: report.nextWeekPlan,
      strategy_health: report.strategyHealth,
    };

    const { data, error } = await supabaseAdmin
      .from("strategy_weekly_reports")
      .upsert(payload, { onConflict: "user_id,week_start" })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ source: "skillEdge_strategy_weekly_report", report: data as WeeklyReportRow });
  } catch (error) {
    console.error("strategy weekly report POST error", error);
    return NextResponse.json({ error: "Failed to generate weekly strategy report." }, { status: 500 });
  }
}

