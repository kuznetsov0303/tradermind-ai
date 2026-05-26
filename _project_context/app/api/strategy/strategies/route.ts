import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRecord = Record<string, unknown>;

type CustomStrategyRules = {
  linkedSetupSlug?: string | null;
  contextRules?: string | null;
  entryRules?: string | null;
  stopRules?: string | null;
  targetRules?: string | null;
  avoidRules?: string | null;
  checklist?: string | null;
  notes?: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const archivedStatuses = new Set(["archived", "deleted", "inactive"]);

function jsonResponse(payload: AnyRecord, status = 200) {
  return NextResponse.json(payload, { status });
}

function getAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server env");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getAuthClient(token: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase auth env");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return {
      user: null,
      error: jsonResponse({ ok: false, error: "Unauthorized" }, 401),
    };
  }

  const authClient = getAuthClient(token);
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    return {
      user: null,
      error: jsonResponse({ ok: false, error: "Unauthorized" }, 401),
    };
  }

  return { user: data.user, error: null };
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function normalizeSetupSlug(value: unknown) {
  const raw = cleanText(value, "custom_strategy").toLowerCase();

  return raw
    .replace(/[^a-z0-9_\-\s]+/g, "")
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72) || "custom_strategy";
}

function normalizeTitle(value: unknown, setupSlug: string) {
  const title = cleanText(value);
  if (title) return title.slice(0, 140);

  return setupSlug
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 140);
}

function parseCustomRules(value: unknown): CustomStrategyRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CustomStrategyRules;
}

function isMissingColumnError(error: unknown) {
  const record = error as { code?: string; message?: string; details?: string };
  const message = `${record?.message || ""} ${record?.details || ""}`.toLowerCase();

  return (
    record?.code === "PGRST204" ||
    message.includes("could not find") ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function splitLines(value: unknown) {
  if (typeof value !== "string") return [];

  return value
    .split(/[\n;]+/g)
    .map((item) => item.replace(/^[-•*\d.)\s]+/g, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function compactObject<T extends AnyRecord>(source: T) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  ) as T;
}

async function insertWithFallbacks(
  admin: SupabaseClient,
  table: string,
  payloads: AnyRecord[]
) {
  let lastError: unknown = null;

  for (const payload of payloads) {
    const { data, error } = await admin
      .from(table)
      .insert(compactObject(payload))
      .select("*")
      .single();

    if (!error) return data as AnyRecord;

    lastError = error;

    if (!isMissingColumnError(error)) {
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to insert ${table}`);
}

async function bestEffortInsertMany(
  admin: SupabaseClient,
  table: string,
  payloads: AnyRecord[],
  fallbackMapper?: (payload: AnyRecord) => AnyRecord
) {
  if (payloads.length === 0) return [];

  const compactPayloads = payloads.map((payload) => compactObject(payload));
  const { data, error } = await admin.from(table).insert(compactPayloads).select("*");

  if (!error) return (data || []) as AnyRecord[];

  if (!isMissingColumnError(error) || !fallbackMapper) {
    console.warn(`[strategy/strategies] skipped ${table}:`, error);
    return [];
  }

  const fallbackPayloads = payloads.map((payload) => compactObject(fallbackMapper(payload)));
  const fallbackResult = await admin.from(table).insert(fallbackPayloads).select("*");

  if (fallbackResult.error) {
    console.warn(`[strategy/strategies] skipped ${table} fallback:`, fallbackResult.error);
    return [];
  }

  return (fallbackResult.data || []) as AnyRecord[];
}

function buildDefaultRules(customRules: CustomStrategyRules, setupSlug: string) {
  const rules = [
    {
      rule_type: "context",
      title: "Context must match the strategy thesis",
      description:
        cleanText(customRules.contextRules) ||
        "Trade only when market context, level, volume and timing match the selected playbook.",
    },
    {
      rule_type: "entry",
      title: "Entry requires trigger confirmation",
      description:
        cleanText(customRules.entryRules) ||
        "Wait for structure, level reaction and confirmation before entry. No blind prediction entries.",
    },
    {
      rule_type: "risk",
      title: "Stop / invalidation must be defined before entry",
      description:
        cleanText(customRules.stopRules) ||
        "The trade is not valid without a clear invalidation level and acceptable risk/reward.",
    },
    {
      rule_type: "management",
      title: "Targets and management are planned before execution",
      description:
        cleanText(customRules.targetRules) ||
        "Define targets, partials and management logic before the position is opened.",
    },
    {
      rule_type: "avoid",
      title: "Avoid weak or emotional attempts",
      description:
        cleanText(customRules.avoidRules) ||
        "Skip late entries, weak confirmation, compressed RR, revenge trades and setups outside the playbook.",
    },
  ];

  if (setupSlug.startsWith("custom_") && cleanText(customRules.notes)) {
    rules.push({
      rule_type: "custom_notes",
      title: "Trader notes",
      description: cleanText(customRules.notes),
    });
  }

  return rules;
}

function buildChecklist(customRules: CustomStrategyRules) {
  const customChecklist = splitLines(customRules.checklist);

  if (customChecklist.length > 0) {
    return customChecklist.map((label) => ({ label }));
  }

  return [
    { label: "Context matches the selected playbook" },
    { label: "Trigger is confirmed" },
    { label: "Entry is not late" },
    { label: "Stop / invalidation is clear" },
    { label: "RR is acceptable" },
    { label: "No avoid condition is active" },
  ];
}

function buildTasks(title: string) {
  return [
    {
      title: `Study ${title}`,
      description: "Read the setup logic, avoid rules and checklist before collecting evidence.",
      task_type: "study",
      priority: "high",
      status: "open",
    },
    {
      title: "Add 3 historical examples",
      description: "Find three charts where this setup appeared. Mark entry, stop, target and invalidation.",
      task_type: "evidence",
      priority: "high",
      status: "open",
    },
    {
      title: "Run Before-Trade Gate",
      description: "Use the pre-entry filter before the next planned attempts.",
      task_type: "discipline",
      priority: "medium",
      status: "open",
    },
  ];
}

function activeStrategyMatchesSetup(strategy: AnyRecord, setupSlug: string) {
  const status = cleanText(strategy.status, "active").toLowerCase();
  if (archivedStatuses.has(status)) return false;

  const primarySetupSlug = cleanText(strategy.primary_setup_slug).toLowerCase();
  const legacySetupSlug = cleanText(strategy.setup_slug).toLowerCase();

  return primarySetupSlug === setupSlug || legacySetupSlug === setupSlug;
}

async function findExistingStrategy(
  admin: SupabaseClient,
  userId: string,
  setupSlug: string
) {
  const { data, error } = await admin
    .from("trading_strategies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = ((data || []) as AnyRecord[]).filter((strategy) =>
    activeStrategyMatchesSetup(strategy, setupSlug)
  );

  return rows[0] || null;
}

async function loadStrategies(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("trading_strategies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error) return error;

    const admin = getAdminClient();
    const strategies = await loadStrategies(admin, user!.id);

    return jsonResponse({ ok: true, strategies });
  } catch (error) {
    console.error("[strategy/strategies][GET]", error);

    return jsonResponse(
      {
        ok: false,
        error: "Failed to load strategies",
      },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error) return error;

    const admin = getAdminClient();
    const body = (await request.json().catch(() => ({}))) as AnyRecord;

    const setupSlug = normalizeSetupSlug(body.setupSlug || body.setup_slug || body.primary_setup_slug);
    const title = normalizeTitle(body.title || body.name, setupSlug);
    const market = cleanText(body.market, "stocks").toLowerCase();
    const direction = cleanText(body.direction, "both").toLowerCase();
    const style = cleanText(body.style || body.category, "intraday").toLowerCase();
    const description = cleanText(body.description);
    const customRules = parseCustomRules(body.customRules || body.custom_rules);
    const isCustomStrategy = setupSlug.startsWith("custom_") || Object.keys(customRules).length > 0;

    const existingStrategy = await findExistingStrategy(admin, user!.id, setupSlug);

    if (existingStrategy) {
      return jsonResponse({
        ok: true,
        duplicateGuard: true,
        alreadyExists: true,
        strategy: existingStrategy,
        data: existingStrategy,
        message: "Strategy already exists. Switched to existing strategy instead of creating a duplicate.",
      });
    }

    const strategyPayloadFull = {
      user_id: user!.id,
      title,
      primary_setup_slug: setupSlug,
      setup_slug: setupSlug,
      market,
      direction,
      style,
      category: style,
      description,
      status: "active",
      current_stage: "draft",
      trust_score: 0,
      strategy_score: 0,
      discipline_score: 0,
      next_action: "Collect 3 clean historical examples before trusting this setup.",
      weekly_focus: "Build evidence and use Before-Trade Gate before execution.",
      anti_chaos_notes: isCustomStrategy
        ? "Custom strategy created by the trader. Validate it with evidence before trading aggressively."
        : "Do not add random setups. Build one strategy with evidence, checklist and review loop.",
      metadata: {
        source: isCustomStrategy ? "custom_strategy_builder" : "setup_playbook_library",
        customRules,
        createdBy: "strategy_portfolio_guard",
      },
    };

    const strategyPayloadMedium = {
      user_id: user!.id,
      title,
      primary_setup_slug: setupSlug,
      market,
      direction,
      status: "active",
      current_stage: "draft",
      trust_score: 0,
      strategy_score: 0,
      discipline_score: 0,
      next_action: "Collect 3 clean historical examples before trusting this setup.",
      weekly_focus: "Build evidence and use Before-Trade Gate before execution.",
    };

    const strategyPayloadMinimal = {
      user_id: user!.id,
      title,
      primary_setup_slug: setupSlug,
      status: "active",
    };

    const strategy = await insertWithFallbacks(admin, "trading_strategies", [
      strategyPayloadFull,
      strategyPayloadMedium,
      strategyPayloadMinimal,
    ]);

    const strategyId = cleanText(strategy.id);

    if (!strategyId) {
      throw new Error("Strategy created without id");
    }

    const version = await insertWithFallbacks(admin, "strategy_versions", [
      {
        user_id: user!.id,
        strategy_id: strategyId,
        version_number: 1,
        version_label: "v1",
        version_name: `${title} v1`,
        title: `${title} v1`,
        status: "active",
        summary: "Initial strategy version created from Strategy Builder.",
        source: isCustomStrategy ? "custom_strategy_builder" : "setup_playbook_library",
      },
      {
        user_id: user!.id,
        strategy_id: strategyId,
        version_number: 1,
        status: "active",
      },
      {
        strategy_id: strategyId,
        version_number: 1,
        status: "active",
      },
    ]).catch((versionError) => {
      console.warn("[strategy/strategies] version creation skipped:", versionError);
      return null;
    });

    const versionId = cleanText((version as AnyRecord | null)?.id);

    const rules = buildDefaultRules(customRules, setupSlug).map((rule, index) => ({
      user_id: user!.id,
      strategy_id: strategyId,
      strategy_version_id: versionId || undefined,
      rule_type: rule.rule_type,
      title: rule.title,
      description: rule.description,
      sort_order: index + 1,
      is_active: true,
    }));

    const checklist = buildChecklist(customRules).map((item, index) => ({
      user_id: user!.id,
      strategy_id: strategyId,
      strategy_version_id: versionId || undefined,
      label: item.label,
      title: item.label,
      description: item.label,
      sort_order: index + 1,
      is_required: true,
      is_active: true,
    }));

    const tasks = buildTasks(title).map((task) => ({
      user_id: user!.id,
      strategy_id: strategyId,
      title: task.title,
      description: task.description,
      status: task.status,
      task_type: task.task_type,
      priority: task.priority,
    }));

    const missions = [
      {
        user_id: user!.id,
        strategy_id: strategyId,
        title: "Build evidence before execution",
        description: "Collect clean, weak, no-trade and missed examples before trusting this strategy.",
        status: "active",
        mission_type: "evidence",
        progress_current: 0,
        progress_target: 10,
      },
    ];

    const experiments = [
      {
        user_id: user!.id,
        strategy_id: strategyId,
        title: `${title} 20-trade experiment`,
        description: "Track the first 20 attempts before judging the strategy.",
        status: "active",
        setup_slug: setupSlug,
        target_trades: 20,
        current_trades: 0,
      },
    ];

    await Promise.all([
      bestEffortInsertMany(admin, "strategy_rules", rules, (payload) => ({
        strategy_id: payload.strategy_id,
        strategy_version_id: payload.strategy_version_id,
        rule_type: payload.rule_type,
        title: payload.title,
        description: payload.description,
        sort_order: payload.sort_order,
      })),
      bestEffortInsertMany(admin, "strategy_checklist_items", checklist, (payload) => ({
        strategy_id: payload.strategy_id,
        strategy_version_id: payload.strategy_version_id,
        label: payload.label,
        sort_order: payload.sort_order,
      })),
      bestEffortInsertMany(admin, "strategy_tasks", tasks, (payload) => ({
        user_id: payload.user_id,
        strategy_id: payload.strategy_id,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        task_type: payload.task_type,
      })),
      bestEffortInsertMany(admin, "strategy_missions", missions, (payload) => ({
        user_id: payload.user_id,
        strategy_id: payload.strategy_id,
        title: payload.title,
        description: payload.description,
        status: payload.status,
      })),
      bestEffortInsertMany(admin, "strategy_experiments", experiments, (payload) => ({
        user_id: payload.user_id,
        strategy_id: payload.strategy_id,
        title: payload.title,
        status: payload.status,
      })),
    ]);

    return jsonResponse(
      {
        ok: true,
        duplicateGuard: true,
        alreadyExists: false,
        strategy,
        data: strategy,
        version,
        setupSlug,
        message: "Strategy v1 created without duplicates.",
      },
      201
    );
  } catch (error) {
    console.error("[strategy/strategies][POST]", error);

    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create strategy",
      },
      500
    );
  }
}
