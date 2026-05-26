import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StrategyProfileRow = {
  id: string;
  user_id: string;
  experience_level: string;
  preferred_markets: string[] | null;
  preferred_styles: string[] | null;
  preferred_timeframes: JsonRecord | null;
  risk_model: JsonRecord | null;
  current_focus_setup_slug: string | null;
  onboarding_answers: JsonRecord | null;
  roadmap_state: JsonRecord | null;
  first_7_days_state: JsonRecord | null;
  skill_map: JsonRecord | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

type TradingStrategyRow = {
  id: string;
  user_id: string;
  profile_id: string | null;
  title: string;
  description: string | null;
  mode: string;
  market: string;
  style: string;
  direction: string;
  primary_setup_slug: string | null;
  status: string;
  current_stage: string;
  current_mission_id: string | null;
  trust_status: string;
  trust_score: number | null;
  strategy_score: number | null;
  discipline_score: number | null;
  progress_score: number | null;
  next_action: string | null;
  weekly_focus: string | null;
  anti_chaos_notes: unknown;
  metadata: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

type StrategyMissionRow = {
  id: string;
  user_id: string;
  strategy_id: string | null;
  title: string;
  description: string | null;
  mission_type: string;
  stage: string;
  status: string;
  progress_current: number;
  progress_target: number;
  why_it_matters: string | null;
  next_action_label: string | null;
  next_action_type: string | null;
  due_at: string | null;
  completed_at: string | null;
  ai_context: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

type StrategyTaskRow = {
  id: string;
  user_id: string;
  strategy_id: string | null;
  mission_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: string;
  sort_order: number;
  payload: JsonRecord | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildDefaultSkillMap() {
  return {
    setupRecognition: 0,
    riskControl: 0,
    entryTiming: 0,
    stopDiscipline: 0,
    targetManagement: 0,
    emotionalControl: 0,
    reviewConsistency: 0,
  };
}

function buildDefaultRoadmapState() {
  return {
    stage: "onboarding",
    currentStep: 1,
    totalSteps: 8,
    steps: [
      "trader_profile",
      "first_setup",
      "setup_lesson",
      "historical_examples",
      "strategy_v1",
      "twenty_trade_experiment",
      "ai_strategy_review",
      "playbook_graduation",
    ],
  };
}

async function ensureStrategyProfile(userId: string): Promise<StrategyProfileRow> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_strategy_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as StrategyProfileRow;

  const { data, error } = await supabaseAdmin
    .from("user_strategy_profiles")
    .insert({
      user_id: userId,
      experience_level: "beginner",
      preferred_markets: [],
      preferred_styles: [],
      preferred_timeframes: {
        context: ["1D", "1H", "15m"],
        execution: ["5m", "1m"],
      },
      risk_model: {
        riskPerTrade: null,
        maxDailyLoss: null,
        maxTradesPerDay: null,
        minimumRR: 2,
      },
      roadmap_state: buildDefaultRoadmapState(),
      first_7_days_state: {
        day: 1,
        status: "active",
        currentFocus: "Build trader profile and choose first setup.",
      },
      skill_map: buildDefaultSkillMap(),
      ai_summary:
        "Your Strategy workspace is ready. Start with your trader profile, choose one setup and let SkillEdge AI guide the next mission.",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as StrategyProfileRow;
}

async function ensureStarterMission(userId: string, strategyId: string | null) {
  const query = supabaseAdmin
    .from("strategy_missions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: existing, error: existingError } = strategyId
    ? await query.eq("strategy_id", strategyId).maybeSingle()
    : await query.is("strategy_id", null).maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as StrategyMissionRow;

  const { data: mission, error: missionError } = await supabaseAdmin
    .from("strategy_missions")
    .insert({
      user_id: userId,
      strategy_id: strategyId,
      title: strategyId ? "Complete your first strategy mission" : "Start your Strategy Roadmap",
      description: strategyId
        ? "Collect evidence, complete the checklist and move this strategy toward a real tested playbook."
        : "Build your trader profile, choose one setup and start a guided path instead of trading randomly.",
      mission_type: "first_7_days",
      stage: strategyId ? "strategy_building" : "onboarding",
      status: "active",
      progress_current: 0,
      progress_target: strategyId ? 3 : 4,
      why_it_matters: strategyId
        ? "A strategy becomes useful only when it has rules, evidence and reviewable execution data."
        : "A clear starting point prevents chaos and gives SkillEdge AI enough context to guide you.",
      next_action_label: strategyId ? "Add first evidence example" : "Complete trader profile",
      next_action_type: strategyId ? "add_example" : "profile",
      ai_context: {
        source: "strategy_overview_default_mission",
        noBlankState: true,
      },
    })
    .select("*")
    .single();

  if (missionError) throw missionError;

  const starterTasks = strategyId
    ? [
        {
          title: "Add one historical example",
          description: "Upload or describe one chart where this setup appeared. Mark context, trigger, entry, stop and target.",
          task_type: "upload",
          sort_order: 10,
        },
        {
          title: "Write one avoid rule",
          description: "Define one condition where this setup should not be traded.",
          task_type: "question",
          sort_order: 20,
        },
        {
          title: "Prepare the 20-trade experiment",
          description: "Use the same rules for the next 20 observations or paper/live attempts before judging the setup.",
          task_type: "action",
          sort_order: 30,
        },
      ]
    : [
        {
          title: "Choose your experience level",
          description: "Beginner, intermediate or advanced. This controls how direct the roadmap should be.",
          task_type: "question",
          sort_order: 10,
        },
        {
          title: "Choose one market",
          description: "Start with one market so the system can focus your training and examples.",
          task_type: "question",
          sort_order: 20,
        },
        {
          title: "Pick one first setup",
          description: "Do not start with ten setups. Choose one playbook and build evidence around it.",
          task_type: "action",
          sort_order: 30,
        },
        {
          title: "Open Setup Academy",
          description: "Study the setup logic before taking live risk.",
          task_type: "review",
          sort_order: 40,
        },
      ];

  const { error: taskError } = await supabaseAdmin.from("strategy_tasks").insert(
    starterTasks.map((task) => ({
      user_id: userId,
      strategy_id: strategyId,
      mission_id: mission.id,
      status: "open",
      priority: "high",
      payload: { source: "starter_mission" },
      ...task,
    })),
  );

  if (taskError) throw taskError;
  return mission as StrategyMissionRow;
}

function buildCockpit(params: {
  profile: StrategyProfileRow;
  activeStrategy: TradingStrategyRow | null;
  currentMission: StrategyMissionRow | null;
  openTasksCount: number;
  examplesCount: number;
  linkedTradesCount: number;
  activeExperiment: Record<string, unknown> | null;
}) {
  const strategy = params.activeStrategy;
  const mission = params.currentMission;
  const missionProgress = mission
    ? clampScore((mission.progress_current / Math.max(1, mission.progress_target)) * 100)
    : 0;
  const experimentProgress = params.activeExperiment
    ? clampScore(
        (Number(params.activeExperiment.current_sample_size || 0) /
          Math.max(1, Number(params.activeExperiment.target_sample_size || 20))) *
          100,
      )
    : 0;

  const progressScore = strategy?.progress_score ?? Math.max(missionProgress, experimentProgress);

  return {
    hasStrategy: Boolean(strategy),
    currentStage: strategy?.current_stage || "onboarding",
    currentMission: mission,
    nextAction:
      strategy?.next_action || mission?.next_action_label || "Complete trader profile",
    weeklyFocus: strategy?.weekly_focus || "Build one setup with evidence, not ten random ideas.",
    progressScore: clampScore(Number(progressScore || 0)),
    strategyScore: clampScore(Number(strategy?.strategy_score || 0)),
    trustScore: clampScore(Number(strategy?.trust_score || 0)),
    disciplineScore: clampScore(Number(strategy?.discipline_score || 0)),
    trustStatus: strategy?.trust_status || "low_trust",
    openTasksCount: params.openTasksCount,
    examplesCount: params.examplesCount,
    linkedTradesCount: params.linkedTradesCount,
    experimentProgress,
    profileStrength: params.profile.experience_level ? 20 : 0,
  };
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const userId = gate.auth.user.id;
    const { searchParams } = new URL(request.url);
    const requestedStrategyId = searchParams.get("strategyId");

    const profile = await ensureStrategyProfile(userId);

    const { data: templates, error: templatesError } = await supabaseAdmin
      .from("strategy_setup_templates")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (templatesError) throw templatesError;

    const { data: strategies, error: strategiesError } = await supabaseAdmin
      .from("trading_strategies")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (strategiesError) throw strategiesError;

    const strategyRows = (strategies || []) as TradingStrategyRow[];
    const activeStrategy =
      strategyRows.find((item) => item.id === requestedStrategyId) || strategyRows[0] || null;

    const currentMission = await ensureStarterMission(userId, activeStrategy?.id || null);

    const taskQuery = supabaseAdmin
      .from("strategy_tasks")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["open", "in_progress"])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(25);

    const { data: tasks, error: tasksError } = activeStrategy
      ? await taskQuery.eq("strategy_id", activeStrategy.id)
      : await taskQuery.is("strategy_id", null);

    if (tasksError) throw tasksError;

    const { data: versions, error: versionsError } = activeStrategy
      ? await supabaseAdmin
          .from("strategy_versions")
          .select("*")
          .eq("user_id", userId)
          .eq("strategy_id", activeStrategy.id)
          .order("version_number", { ascending: false })
      : { data: [], error: null };

    if (versionsError) throw versionsError;

    const { data: experiments, error: experimentsError } = activeStrategy
      ? await supabaseAdmin
          .from("strategy_experiments")
          .select("*")
          .eq("user_id", userId)
          .eq("strategy_id", activeStrategy.id)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [], error: null };

    if (experimentsError) throw experimentsError;

    const { data: examples, error: examplesError } = activeStrategy
      ? await supabaseAdmin
          .from("strategy_examples")
          .select("id,quality_tag,example_type,setup_slug,symbol,asset_type,example_date,timeframe,ai_score,created_at")
          .eq("user_id", userId)
          .eq("strategy_id", activeStrategy.id)
          .order("created_at", { ascending: false })
          .limit(30)
      : { data: [], error: null };

    if (examplesError) throw examplesError;

    const { count: linkedTradesCount, error: linkedTradesError } = activeStrategy
      ? await supabaseAdmin
          .from("trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("strategy_id", activeStrategy.id)
      : { count: 0, error: null };

    if (linkedTradesError) throw linkedTradesError;

    const { data: latestProgress, error: progressError } = activeStrategy
      ? await supabaseAdmin
          .from("strategy_progress_snapshots")
          .select("*")
          .eq("user_id", userId)
          .eq("strategy_id", activeStrategy.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (progressError) throw progressError;

    const activeExperiment = ((experiments || []) as Record<string, unknown>[]).find(
      (item) => item.status === "active",
    ) || null;

    const cockpit = buildCockpit({
      profile,
      activeStrategy,
      currentMission,
      openTasksCount: ((tasks || []) as StrategyTaskRow[]).length,
      examplesCount: (examples || []).length,
      linkedTradesCount: linkedTradesCount || 0,
      activeExperiment,
    });

    return NextResponse.json({
      source: "skillEdge_strategy_growth_overview",
      profile,
      templates: templates || [],
      strategies: strategyRows,
      activeStrategy,
      currentMission,
      tasks: tasks || [],
      versions: versions || [],
      experiments: experiments || [],
      activeExperiment,
      examples: examples || [],
      linkedTradesCount: linkedTradesCount || 0,
      latestProgress,
      cockpit,
    });
  } catch (error) {
    console.error("Strategy overview error", error);
    return NextResponse.json(
      { error: "Failed to load Strategy workspace." },
      { status: 500 },
    );
  }
}
