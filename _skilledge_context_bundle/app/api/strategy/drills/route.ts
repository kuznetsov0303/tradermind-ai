import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type DrillMode = "beginner" | "decision" | "no_trade";

type DrillDecision =
  | "mark_context"
  | "wait_for_confirmation"
  | "enter_if_checklist_confirms"
  | "skip_no_trade"
  | "send_to_evidence_locker";

type DrillVerdict = "correct" | "risky" | "playbook_violation" | "incomplete";

type AnyRecord = Record<string, unknown>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asRecord(value: unknown): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as AnyRecord;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 2;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function readField(source: AnyRecord | null | undefined, keys: string[]): string {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    const rendered = text(value);
    if (rendered) return rendered;
  }

  return "";
}

function isDrillMode(value: unknown): value is DrillMode {
  return value === "beginner" || value === "decision" || value === "no_trade";
}

function isDrillDecision(value: unknown): value is DrillDecision {
  return (
    value === "mark_context" ||
    value === "wait_for_confirmation" ||
    value === "enter_if_checklist_confirms" ||
    value === "skip_no_trade" ||
    value === "send_to_evidence_locker"
  );
}

function isUuid(value: string | null): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeQuality(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function compactSnapshot(value: unknown): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const record = value as AnyRecord;
  const snapshot: AnyRecord = {};

  const allowedKeys = [
    "id",
    "symbol",
    "ticker",
    "setup_slug",
    "timeframe",
    "quality_tag",
    "quality",
    "date",
    "example_date",
    "notes",
    "confirmation",
    "invalidation",
    "source_type",
    "source_label",
    "source_trade_id",
    "is_generated",
    "created_at",
  ];

  for (const key of allowedKeys) {
    if (record[key] !== undefined && record[key] !== null) {
      snapshot[key] = record[key];
    }
  }

  return snapshot;
}

function buildDrillStats(results: AnyRecord[]) {
  const total = results.length;
  const averageScore =
    total > 0
      ? Math.round(
          results.reduce((sum, item) => {
            const score = typeof item.score === "number" ? item.score : 0;
            return sum + score;
          }, 0) / total
        )
      : 0;

  const byMode = results.reduce<Record<string, number>>((acc, item) => {
    const mode = text(item.drill_mode) || "unknown";
    acc[mode] = (acc[mode] || 0) + 1;
    return acc;
  }, {});

  const mistakeTags = results.reduce<Record<string, number>>((acc, item) => {
    const tags = Array.isArray(item.mistake_tags) ? item.mistake_tags : [];

    for (const tag of tags) {
      const tagText = text(tag);
      if (!tagText) continue;
      acc[tagText] = (acc[tagText] || 0) + 1;
    }

    return acc;
  }, {});

  return {
    total,
    average_score: averageScore,
    by_mode: byMode,
    mistake_tags: mistakeTags,
  };
}

function evaluateDrill(input: {
  mode: DrillMode;
  decision: DrillDecision;
  answers: AnyRecord;
  example: AnyRecord | null;
  template: AnyRecord | null;
  checklist: AnyRecord[];
  rules: AnyRecord[];
}) {
  const { mode, decision, answers, example, template, checklist, rules } = input;

  const mistakeTags: string[] = [];
  let score = 50;
  let verdict: DrillVerdict = "risky";

  const exampleQuality = normalizeQuality(
    readField(example, ["quality_tag", "quality", "tag", "type"])
  );

  const exampleNotes = readField(example, ["notes", "description"]);
  const exampleConfirmation = readField(example, ["confirmation", "confirmations"]);
  const exampleInvalidation = readField(example, ["invalidation", "stop", "risk"]);

  const hasContext = hasText(answers.context) || hasText(answers.market_context) || hasText(exampleNotes);
  const hasTrigger = hasText(answers.trigger) || hasText(exampleConfirmation);
  const hasStop = hasText(answers.stop) || hasText(answers.invalidation) || hasText(exampleInvalidation);
  const hasAvoid = hasText(answers.avoid) || hasText(answers.avoid_if) || hasText(answers.trap);

  const isWeakExample =
    exampleQuality.includes("bad") ||
    exampleQuality.includes("weak") ||
    exampleQuality.includes("avoid") ||
    exampleQuality.includes("trap") ||
    exampleQuality.includes("mistake") ||
    exampleQuality.includes("no_trade") ||
    exampleQuality.includes("loss") ||
    exampleQuality.includes("simulated_no_trade") ||
    exampleQuality.includes("simulated_trap");

  const isCleanExample =
    exampleQuality.includes("good") ||
    exampleQuality.includes("clean") ||
    exampleQuality.includes("a+") ||
    exampleQuality.includes("best") ||
    exampleQuality.includes("winner") ||
    exampleQuality.includes("win") ||
    exampleQuality.includes("clean_simulated");

  if (mode === "beginner") {
    let parts = 0;

    if (hasContext) parts += 1;
    else mistakeTags.push("missed_context");

    if (hasTrigger) parts += 1;
    else mistakeTags.push("missed_trigger");

    if (hasStop) parts += 1;
    else mistakeTags.push("no_invalidation");

    if (hasAvoid) parts += 1;
    else mistakeTags.push("no_avoid_conditions");

    score = clampScore((parts / 4) * 100);

    if (score >= 85) verdict = "correct";
    else if (score >= 60) verdict = "risky";
    else verdict = "incomplete";
  }

  if (mode === "decision") {
    if (decision === "enter_if_checklist_confirms") {
      if (isWeakExample) {
        score = 35;
        verdict = "playbook_violation";
        mistakeTags.push("forced_trade", "ignored_weak_conditions");
      } else if (!hasStop) {
        score = 55;
        verdict = "risky";
        mistakeTags.push("no_invalidation");
      } else {
        score = isCleanExample ? 88 : 74;
        verdict = isCleanExample ? "correct" : "risky";
      }
    }

    if (decision === "wait_for_confirmation") {
      score = isWeakExample ? 82 : 76;
      verdict = "correct";

      if (!hasTrigger) {
        mistakeTags.push("needs_trigger_confirmation");
      }
    }

    if (decision === "skip_no_trade") {
      if (isWeakExample) {
        score = 92;
        verdict = "correct";
      } else {
        score = 68;
        verdict = "risky";
        mistakeTags.push("possibly_over_filtered");
      }
    }

    if (decision === "mark_context") {
      score = 64;
      verdict = hasContext ? "risky" : "incomplete";

      if (!hasContext) {
        mistakeTags.push("context_not_defined");
      }
    }

    if (decision === "send_to_evidence_locker") {
      score = 72;
      verdict = "risky";
      mistakeTags.push("needs_evidence_review");
    }
  }

  if (mode === "no_trade") {
    if (decision === "skip_no_trade") {
      score = isWeakExample ? 94 : 78;
      verdict = "correct";
    } else if (decision === "wait_for_confirmation") {
      score = 76;
      verdict = "correct";
      mistakeTags.push("good_patience");
    } else if (decision === "enter_if_checklist_confirms") {
      score = isWeakExample ? 28 : 58;
      verdict = isWeakExample ? "playbook_violation" : "risky";
      mistakeTags.push("overtrading_risk", "no_trade_filter_failed");
    } else {
      score = 55;
      verdict = "incomplete";
      mistakeTags.push("unclear_no_trade_decision");
    }
  }

  const setupTitle =
    readField(template, ["title", "name", "slug"]) ||
    readField(example, ["setup_slug"]) ||
    "current setup";

  const lessonByVerdict: Record<DrillVerdict, string> = {
    correct:
      "Good decision. You respected the setup logic and protected yourself from random execution.",
    risky:
      "The idea is not automatically wrong, but it needs cleaner confirmation, invalidation and checklist alignment.",
    playbook_violation:
      "This decision breaks the playbook. The main risk is forcing a trade before the setup gives permission.",
    incomplete:
      "The decision is incomplete. Define context, trigger, invalidation and avoid conditions before action.",
  };

  const sourceLabel = readField(example, ["source_label", "source_type"]);

  const nextDrill =
    verdict === "correct"
      ? `Repeat ${setupTitle} with a harder example from Evidence Locker or Journal history.`
      : "Run one more drill using a clean historical example and write the exact invalidation before deciding.";

  return {
    verdict,
    score: clampScore(score),
    mistake_tags: Array.from(new Set(mistakeTags)),
    lesson: lessonByVerdict[verdict],
    next_drill: nextDrill,
    coaching_feedback: {
      headline:
        verdict === "correct"
          ? "Decision accepted"
          : verdict === "playbook_violation"
            ? "Playbook violation detected"
            : verdict === "incomplete"
              ? "Decision incomplete"
              : "Decision needs more confirmation",
      setup: setupTitle,
      source: sourceLabel || null,
      example_quality: exampleQuality || null,
      evidence_notes: exampleNotes || null,
      checks: {
        context_defined: hasContext,
        trigger_defined: hasTrigger,
        invalidation_defined: hasStop,
        avoid_conditions_defined: hasAvoid,
        checklist_items_count: checklist.length,
        rules_count: rules.length,
      },
    },
  };
}

async function findStrategyForUser(
  admin: SupabaseClient,
  userId: string,
  strategyId: string | null
) {
  let query = admin
    .from("trading_strategies")
    .select("*")
    .eq("user_id", userId);

  if (strategyId) {
    query = query.eq("id", strategyId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data as AnyRecord | null;
}

async function findActiveVersion(admin: SupabaseClient, strategyId: string) {
  const { data, error } = await admin
    .from("strategy_versions")
    .select("*")
    .eq("strategy_id", strategyId)
    .in("status", ["active", "testing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data as AnyRecord | null;
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error) return error;

    const admin = getAdminClient();
    const { searchParams } = new URL(request.url);

    const strategyId = stringOrNull(searchParams.get("strategy_id"));
    const strategy = await findStrategyForUser(admin, user!.id, strategyId);

    if (!strategy) {
      return jsonResponse({
        ok: true,
        strategy: null,
        active_version: null,
        setup_templates: [],
        evidence_examples: [],
        drill_results: [],
        drill_stats: {
          total: 0,
          average_score: 0,
          by_mode: {},
          mistake_tags: {},
        },
      });
    }

    const activeVersion = await findActiveVersion(admin, text(strategy.id));

    const [templatesResult, examplesResult, drillsResult] = await Promise.all([
      admin
        .from("strategy_setup_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),

      admin
        .from("strategy_examples")
        .select("*")
        .eq("strategy_id", text(strategy.id))
        .order("created_at", { ascending: false })
        .limit(30),

      admin
        .from("strategy_drill_results")
        .select("*")
        .eq("user_id", user!.id)
        .eq("strategy_id", text(strategy.id))
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (templatesResult.error) throw templatesResult.error;
    if (examplesResult.error) throw examplesResult.error;
    if (drillsResult.error) throw drillsResult.error;

    const drillResults = (drillsResult.data || []) as AnyRecord[];

    return jsonResponse({
      ok: true,
      strategy,
      active_version: activeVersion,
      setup_templates: templatesResult.data || [],
      evidence_examples: examplesResult.data || [],
      drill_results: drillResults,
      drill_stats: buildDrillStats(drillResults),
    });
  } catch (error) {
    console.error("[strategy/drills][GET]", error);

    return jsonResponse(
      {
        ok: false,
        error: "Failed to load strategy drills",
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

    const strategyId = stringOrNull(body.strategy_id);
    const strategyVersionId = stringOrNull(body.strategy_version_id);
    const setupSlug = stringOrNull(body.setup_slug);
    const setupId = stringOrNull(body.setup_id);
    const exampleId = stringOrNull(body.example_id);
    const answers = asRecord(body.answers);
    const selectedExampleSnapshot = asRecord(answers.selected_example_snapshot);

    const drillModeRaw = stringOrNull(body.drill_mode);
    const decisionRaw = stringOrNull(body.decision);

    if (!isDrillMode(drillModeRaw)) {
      return jsonResponse(
        {
          ok: false,
          error: "Invalid drill mode",
        },
        400
      );
    }

    if (!isDrillDecision(decisionRaw)) {
      return jsonResponse(
        {
          ok: false,
          error: "Invalid drill decision",
        },
        400
      );
    }

    const strategy = await findStrategyForUser(admin, user!.id, strategyId);

    if (!strategy) {
      return jsonResponse(
        {
          ok: false,
          error: "Strategy not found",
        },
        404
      );
    }

    const activeVersion = strategyVersionId
      ? null
      : await findActiveVersion(admin, text(strategy.id));

    const finalStrategyVersionId =
      strategyVersionId || text(activeVersion?.id) || null;

    let example: AnyRecord | null = null;

    if (isUuid(exampleId)) {
      const { data, error: exampleError } = await admin
        .from("strategy_examples")
        .select("*")
        .eq("id", exampleId)
        .eq("strategy_id", text(strategy.id))
        .maybeSingle();

      if (exampleError) throw exampleError;
      example = (data as AnyRecord | null) || null;
    }

    if (!example && Object.keys(selectedExampleSnapshot).length > 0) {
      example = selectedExampleSnapshot;
    }

    const finalSetupSlug =
      setupSlug ||
      readField(example, ["setup_slug"]) ||
      readField(strategy, ["primary_setup_slug"]) ||
      null;

    const [templateResult, rulesResult, checklistResult] = await Promise.all([
      finalSetupSlug
        ? admin
            .from("strategy_setup_templates")
            .select("*")
            .eq("slug", finalSetupSlug)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      finalStrategyVersionId
        ? admin
            .from("strategy_rules")
            .select("*")
            .eq("strategy_version_id", finalStrategyVersionId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),

      finalStrategyVersionId
        ? admin
            .from("strategy_checklist_items")
            .select("*")
            .eq("strategy_version_id", finalStrategyVersionId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (templateResult.error) throw templateResult.error;
    if (rulesResult.error) throw rulesResult.error;
    if (checklistResult.error) throw checklistResult.error;

    const template = (templateResult.data as AnyRecord | null) || null;
    const rules = ((rulesResult.data || []) as AnyRecord[]) || [];
    const checklist = ((checklistResult.data || []) as AnyRecord[]) || [];

    const evaluation = evaluateDrill({
      mode: drillModeRaw,
      decision: decisionRaw,
      answers,
      example,
      template,
      checklist,
      rules,
    });

    const insertPayload = {
      user_id: user!.id,
      strategy_id: text(strategy.id),
      strategy_version_id: finalStrategyVersionId,
      setup_slug: finalSetupSlug,
      setup_id: setupId,
      example_id: isUuid(exampleId) ? exampleId : null,
      drill_mode: drillModeRaw,
      decision: decisionRaw,
      verdict: evaluation.verdict,
      score: evaluation.score,
      mistake_tags: evaluation.mistake_tags,
      lesson: evaluation.lesson,
      next_drill: evaluation.next_drill,
      answers,
      coaching_feedback: evaluation.coaching_feedback,
      evidence_snapshot: compactSnapshot(example),
      playbook_snapshot: {
        setup_template: compactSnapshot(template),
        rules_count: rules.length,
        checklist_count: checklist.length,
        checklist_preview: checklist.slice(0, 8),
        rules_preview: rules.slice(0, 8),
      },
    };

    const { data: inserted, error: insertError } = await admin
      .from("strategy_drill_results")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    return jsonResponse({
      ok: true,
      drill_result: inserted,
      evaluation,
    });
  } catch (error) {
    console.error("[strategy/drills][POST]", error);

    return jsonResponse(
      {
        ok: false,
        error: "Failed to save strategy drill result",
      },
      500
    );
  }
}

