import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StrategyRow = {
  id: string;
  user_id: string;
  title: string | null;
  primary_setup_slug: string | null;
  next_action?: string | null;
  weekly_focus?: string | null;
};

type WeeklyReportRow = {
  id: string;
  user_id: string;
  week_start: string | null;
  week_end: string | null;
  title: string | null;
  summary: string | null;
  completed_work: unknown;
  improvements: unknown;
  repeated_mistakes: unknown;
  next_week_plan: unknown;
  strategy_health: Record<string, unknown> | null;
  created_at: string | null;
};

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const label = record.label || record.title || record.text || record.name || record.key;
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return fallback;
}

function normalizeList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function cleanTaskTitle(value: unknown, fallback: string): string {
  const text = asText(value, fallback)
    .replace(/\s+/g, " ")
    .replace(/^[-•\d.)\s]+/, "")
    .trim();

  return text.slice(0, 180) || fallback;
}

function mistakeFocus(value: unknown): string {
  const raw = asText(value, "");
  if (!raw) return "Discipline and execution consistency";
  return raw
    .replace(/[_-]/g, " ")
    .replace(/\s+—\s*\d+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadStrategy(userId: string, requestedStrategyId: string | null): Promise<StrategyRow | null> {
  let query = supabaseAdmin
    .from("trading_strategies")
    .select("id,user_id,title,primary_setup_slug,next_action,weekly_focus")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (requestedStrategyId) query = query.eq("id", requestedStrategyId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data || null) as StrategyRow | null;
}

async function loadReport(userId: string, reportId: string | null): Promise<WeeklyReportRow | null> {
  let query = supabaseAdmin
    .from("strategy_weekly_reports")
    .select("id,user_id,week_start,week_end,title,summary,completed_work,improvements,repeated_mistakes,next_week_plan,strategy_health,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (reportId) query = query.eq("id", reportId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data || null) as WeeklyReportRow | null;
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 30, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => ({}));
    const userId = gate.auth.user.id;
    const requestedStrategyId = asText(body.strategyId, "") || null;
    const reportId = asText(body.reportId, "") || null;

    const strategy = await loadStrategy(userId, requestedStrategyId);
    if (!strategy?.id) {
      return NextResponse.json({ error: "Strategy is required before accepting a weekly plan." }, { status: 400 });
    }

    const report = await loadReport(userId, reportId);
    if (!report?.id) {
      return NextResponse.json({ error: "Weekly report is required before accepting a weekly plan." }, { status: 400 });
    }

    const planItems = normalizeList(report.next_week_plan)
      .map((item, index) => cleanTaskTitle(item, `Weekly action ${index + 1}`))
      .filter(Boolean)
      .slice(0, 6);

    const mistakes = normalizeList(report.repeated_mistakes)
      .map((item) => mistakeFocus(item))
      .filter(Boolean)
      .slice(0, 3);

    const fallbackPlan = [
      "Collect more clean historical examples before trusting the setup.",
      "Run Before-Trade Gate before the next planned attempts.",
      "Complete After-Trade Debrief after every attempt.",
    ];

    const finalPlan = (planItems.length ? planItems : fallbackPlan).slice(0, 6);
    const focus = mistakes[0] || "Discipline and execution consistency";

    const { data: mission, error: missionError } = await supabaseAdmin
      .from("strategy_missions")
      .insert({
        user_id: userId,
        strategy_id: strategy.id,
        title: `Weekly Action Plan — ${strategy.title || "Strategy"}`,
        description: report.summary || "Weekly trading-desk action plan accepted.",
        mission_type: "weekly",
        stage: "weekly_action_plan",
        status: "active",
        progress_current: 0,
        progress_target: finalPlan.length,
        why_it_matters: "Turns the weekly desk report into concrete actions instead of passive information.",
        next_action_label: finalPlan[0] || "Start weekly plan",
        next_action_type: "weekly_plan",
        ai_context: {
          source: "weekly_report_acceptance",
          report_id: report.id,
          week_start: report.week_start,
          week_end: report.week_end,
          repeated_mistakes: mistakes,
          strategy_health: report.strategy_health || {},
        },
      })
      .select("*")
      .single();

    if (missionError) throw missionError;

    const tasks = finalPlan.map((title, index) => ({
      user_id: userId,
      strategy_id: strategy.id,
      mission_id: mission.id,
      title,
      description:
        index === 0
          ? "Primary weekly action accepted from the Strategy Desk Report."
          : "Weekly action accepted from the Strategy Desk Report.",
      task_type: index === 0 ? "review" : "action",
      status: "open",
      priority: index === 0 ? "high" : "normal",
      sort_order: 20 + index * 10,
      payload: {
        source: "weekly_report_action_plan",
        report_id: report.id,
        week_start: report.week_start,
        week_end: report.week_end,
        focus,
        original_index: index,
      },
    }));

    const { data: createdTasks, error: taskError } = await supabaseAdmin
      .from("strategy_tasks")
      .insert(tasks)
      .select("*");

    if (taskError) throw taskError;

    const antiChaosNote = {
      source: "weekly_report_action_plan",
      report_id: report.id,
      week_start: report.week_start,
      week_end: report.week_end,
      focus,
      accepted_at: new Date().toISOString(),
      rule: "Follow this weekly plan before adding new strategy complexity.",
    };

    const { data: updatedStrategy, error: strategyError } = await supabaseAdmin
      .from("trading_strategies")
      .update({
        current_mission_id: mission.id,
        current_stage: "weekly_action_plan",
        next_action: finalPlan[0] || strategy.next_action || null,
        weekly_focus: focus,
        anti_chaos_notes: [antiChaosNote],
        updated_at: new Date().toISOString(),
      })
      .eq("id", strategy.id)
      .eq("user_id", userId)
      .select("id,title,current_mission_id,current_stage,next_action,weekly_focus,anti_chaos_notes")
      .single();

    if (strategyError) throw strategyError;

    return NextResponse.json({
      source: "skillEdge_strategy_weekly_action_plan",
      accepted: true,
      mission,
      tasks: createdTasks || [],
      strategy: updatedStrategy,
      focus,
      report_id: report.id,
      week_start: report.week_start,
      week_end: report.week_end,
    });
  } catch (error) {
    console.error("Strategy weekly report ACCEPT error", error);
    return NextResponse.json({ error: "Failed to accept weekly strategy action plan." }, { status: 500 });
  }
}

