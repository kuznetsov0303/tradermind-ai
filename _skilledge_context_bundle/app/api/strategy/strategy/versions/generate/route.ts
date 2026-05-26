import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StrategyRow = {
  id: string;
  title: string | null;
  user_id: string;
  primary_setup_slug?: string | null;
  setup_slug?: string | null;
  market?: string | null;
  direction?: string | null;
  style?: string | null;
};

type VersionRow = {
  id: string;
  strategy_id: string;
  version_number: number | null;
  title: string | null;
  context_timeframes?: string[] | null;
  execution_timeframes?: string[] | null;
  market_context?: string | null;
  setup_conditions?: string | null;
  entry_trigger?: string | null;
  entry_zone?: string | null;
  stop_rule?: string | null;
  target_plan?: string | null;
  invalidation_rule?: string | null;
  risk_rules?: string | null;
  avoid_if?: string | null;
  management_plan?: string | null;
  checklist?: unknown;
  common_mistakes?: unknown;
};

type ReviewRow = {
  id: string;
  summary?: string | null;
  what_works?: unknown;
  what_fails?: unknown;
  mistakes?: unknown;
  rule_updates?: unknown;
  next_tasks?: unknown;
  scores?: JsonRecord | null;
  created_at: string;
};

function asText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 6000) || fallback;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 24);
}

function asReviewItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as JsonRecord;
        return String(record.label || record.title || record.key || record.text || "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

function uniq(items: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function inferLeakRules(review: ReviewRow | null) {
  const mistakes = asReviewItems(review?.mistakes);
  const fails = asReviewItems(review?.what_fails);
  const updates = asReviewItems(review?.rule_updates);
  const joined = [...mistakes, ...fails, ...updates].join(" | ").toLowerCase();

  const avoidRules: string[] = [];
  const checklistRules: string[] = [];
  const riskRules: string[] = [];
  const managementRules: string[] = [];

  if (joined.includes("late") || joined.includes("chase") || joined.includes("fomo") || joined.includes("позд") || joined.includes("догон")) {
    avoidRules.push("No entry after the clean move has already happened. If price is extended and RR is compressed, mark it as no-trade.");
    checklistRules.push("Entry is not late: price is still near the trigger zone and RR is at least 2.0.");
  }

  if (joined.includes("stop") || joined.includes("invalidation") || joined.includes("стоп")) {
    riskRules.push("Stop/invalidation must be defined before entry and cannot be widened after the trade is active.");
    checklistRules.push("Stop is behind the real invalidation level, not a random comfort level.");
  }

  if (joined.includes("rr") || joined.includes("risk")) {
    riskRules.push("Minimum planned RR is 2.0 unless the strategy version explicitly allows a smaller test attempt.");
    checklistRules.push("Target and stop produce acceptable RR before entry.");
  }

  if (joined.includes("confirm") || joined.includes("trigger") || joined.includes("подтверж")) {
    checklistRules.push("Trigger is confirmed by structure, VWAP/level reaction and volume behavior before entry.");
    avoidRules.push("No trade when the idea is only a prediction and the trigger has not confirmed yet.");
  }

  if (joined.includes("plan") || joined.includes("discipline") || joined.includes("revenge") || joined.includes("overtrad")) {
    managementRules.push("If one rule is violated, stop and run an After-Trade Debrief before the next attempt.");
    avoidRules.push("No revenge trade, no extra attempt after emotional loss, and no setup outside this playbook.");
  }

  return { avoidRules, checklistRules, riskRules, managementRules };
}

function buildChecklist(previous: unknown, leakRules: ReturnType<typeof inferLeakRules>) {
  const existing = Array.isArray(previous) ? previous.map(String) : [];
  return uniq([
    ...existing,
    ...leakRules.checklistRules,
    "Before-Trade Gate completed before entry.",
    "After-Trade Debrief will be completed after the attempt, win or lose.",
  ]).slice(0, 14);
}

function appendRule(base: string | null | undefined, additions: string[]) {
  const cleanBase = asText(base, "");
  const cleanAdditions = uniq(additions).join("\n- ");
  if (!cleanAdditions) return cleanBase;
  return `${cleanBase}${cleanBase ? "\n" : ""}- ${cleanAdditions}`.slice(0, 6000);
}

function buildChangeSummary(review: ReviewRow | null, nextVersion: number, leakRules: ReturnType<typeof inferLeakRules>) {
  const summaryParts = [
    `Strategy v${nextVersion} is generated from the latest Strategy Review, journal-linked trades, Before-Trade Gate checks and After-Trade Debriefs.`,
    "The goal is not to make the strategy more aggressive; the goal is to make the rules stricter, easier to execute and harder to violate.",
  ];

  const updates = asReviewItems(review?.rule_updates).slice(0, 4);
  if (updates.length) summaryParts.push(`Review-driven rule updates: ${updates.join(" | ")}.`);
  if (leakRules.avoidRules.length) summaryParts.push(`New avoid discipline: ${leakRules.avoidRules.join(" | ")}.`);
  if (leakRules.checklistRules.length) summaryParts.push(`New checklist controls: ${leakRules.checklistRules.join(" | ")}.`);

  return summaryParts.join("\n").slice(0, 6000);
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 25, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const userId = gate.auth.user.id;
    const body = await request.json().catch(() => ({}));
    const strategyId = asText(body.strategyId || body.strategy_id, "");
    const strategyVersionId = asText(body.strategyVersionId || body.strategy_version_id, "");

    if (!strategyId) {
      return NextResponse.json({ error: "Missing strategyId." }, { status: 400 });
    }

    const { data: strategy, error: strategyError } = await supabaseAdmin
      .from("trading_strategies")
      .select("*")
      .eq("id", strategyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (strategyError) throw strategyError;
    if (!strategy) {
      return NextResponse.json({ error: "Strategy not found." }, { status: 404 });
    }

    let currentVersionQuery = supabaseAdmin
      .from("strategy_versions")
      .select("*")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId);

    if (strategyVersionId) currentVersionQuery = currentVersionQuery.eq("id", strategyVersionId);
    else currentVersionQuery = currentVersionQuery.eq("is_active", true);

    const { data: currentVersionData, error: currentVersionError } = await currentVersionQuery
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentVersionError) throw currentVersionError;

    const currentVersion = currentVersionData as VersionRow | null;
    if (!currentVersion) {
      return NextResponse.json({ error: "Active strategy version not found." }, { status: 404 });
    }

    const { data: versions, error: versionsError } = await supabaseAdmin
      .from("strategy_versions")
      .select("id, version_number")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId)
      .order("version_number", { ascending: false });

    if (versionsError) throw versionsError;

    const maxVersion = (versions || []).reduce((max, item) => Math.max(max, Number(item.version_number || 0)), 0);
    const nextVersionNumber = Math.max(maxVersion + 1, Number(currentVersion.version_number || 1) + 1);

    const { data: latestReview, error: reviewError } = await supabaseAdmin
      .from("strategy_ai_reviews")
      .select("*")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reviewError) throw reviewError;

    const { data: examples, error: examplesError } = await supabaseAdmin
      .from("strategy_examples")
      .select("id, quality_tag, example_type")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId);

    if (examplesError) throw examplesError;

    const { data: trades, error: tradesError } = await supabaseAdmin
      .from("trades")
      .select("id")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId);

    if (tradesError) throw tradesError;

    const { data: checks, error: checksError } = await supabaseAdmin
      .from("strategy_before_trade_checks")
      .select("id, gate_status")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId);

    if (checksError) throw checksError;

    const { data: debriefs, error: debriefsError } = await supabaseAdmin
      .from("strategy_after_trade_debriefs")
      .select("id, execution_score, discipline_score")
      .eq("strategy_id", strategyId)
      .eq("user_id", userId);

    if (debriefsError) throw debriefsError;

    const review = latestReview as ReviewRow | null;
    const leakRules = inferLeakRules(review);
    const checklist = buildChecklist(currentVersion.checklist, leakRules);
    const titleRoot = asText((strategy as StrategyRow).title, "Strategy").replace(/\s+v\d+$/i, "");
    const nextTitle = `${titleRoot} v${nextVersionNumber}`;
    const aiChangeSummary = buildChangeSummary(review, nextVersionNumber, leakRules);

    const newVersionPayload = {
      user_id: userId,
      strategy_id: strategyId,
      version_number: nextVersionNumber,
      title: nextTitle,
      status: "testing",
      context_timeframes: asStringArray(currentVersion.context_timeframes).length ? asStringArray(currentVersion.context_timeframes) : ["1D", "1H", "15m"],
      execution_timeframes: asStringArray(currentVersion.execution_timeframes).length ? asStringArray(currentVersion.execution_timeframes) : ["5m", "1m"],
      market_context: currentVersion.market_context || "Trade only when the market context matches the setup playbook.",
      setup_conditions: currentVersion.setup_conditions || "Setup conditions must be visible before entry.",
      entry_trigger: currentVersion.entry_trigger || "Entry requires a confirmed trigger, not prediction.",
      entry_zone: currentVersion.entry_zone || "Entry must happen near the planned trigger zone, not after the move is extended.",
      stop_rule: appendRule(currentVersion.stop_rule, leakRules.riskRules.length ? leakRules.riskRules : ["Stop must be defined before entry and placed behind real invalidation."]),
      target_plan: currentVersion.target_plan || "Targets must be defined before entry. TP1 is partial, later targets depend on structure.",
      invalidation_rule: appendRule(currentVersion.invalidation_rule, ["If invalidation appears, exit or skip. Do not negotiate with the trade after entry."]),
      risk_rules: appendRule(currentVersion.risk_rules, leakRules.riskRules.length ? leakRules.riskRules : ["Minimum planned RR is 2.0 and risk must stay inside the daily plan."]),
      avoid_if: appendRule(currentVersion.avoid_if, leakRules.avoidRules.length ? leakRules.avoidRules : ["Avoid if trigger, context, stop or RR is unclear."]),
      management_plan: appendRule(currentVersion.management_plan, leakRules.managementRules.length ? leakRules.managementRules : ["Manage the trade from the written plan, not from emotion after entry."]),
      checklist,
      common_mistakes: uniq([
        ...asStringArray(currentVersion.common_mistakes),
        ...asReviewItems(review?.mistakes),
      ]).slice(0, 12),
      version_notes: `Generated from v${currentVersion.version_number || 1} after Strategy Review. Test v${nextVersionNumber} with evidence before trusting it.`,
      ai_change_summary: aiChangeSummary,
      performance_summary: {
        sourceReviewId: review?.id || null,
        previousVersionId: currentVersion.id,
        sourceCounts: {
          examples: examples?.length || 0,
          trades: trades?.length || 0,
          beforeTradeChecks: checks?.length || 0,
          afterTradeDebriefs: debriefs?.length || 0,
        },
        generatedBy: "skillEdge_strategy_version_generator",
      },
      is_active: true,
    };

    const { error: deactivateError } = await supabaseAdmin
      .from("strategy_versions")
      .update({ is_active: false, status: "retired", updated_at: new Date().toISOString() })
      .eq("strategy_id", strategyId)
      .eq("user_id", userId)
      .eq("is_active", true);

    if (deactivateError) throw deactivateError;

    const { data: newVersion, error: insertError } = await supabaseAdmin
      .from("strategy_versions")
      .insert(newVersionPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    const ruleRows = [
      { rule_type: "risk", title: "Stop cannot move without a new plan", description: "Stop/invalidation must be defined before entry and cannot be widened after entry.", severity: "critical" },
      { rule_type: "avoid", title: "No late chase", description: "No entry after the clean move already happened or when RR is below plan.", severity: "high" },
      { rule_type: "execution", title: "Before-Trade Gate required", description: "Run the Before-Trade Gate before the next planned attempts.", severity: "high" },
      { rule_type: "psychology", title: "After-Trade Debrief required", description: "Complete a debrief after every attempt until discipline data becomes reliable.", severity: "medium" },
    ].map((rule) => ({
      user_id: userId,
      strategy_id: strategyId,
      strategy_version_id: newVersion.id,
      is_required: true,
      is_active: true,
      metadata: { source: "version_generator", generatedVersion: nextVersionNumber },
      ...rule,
    }));

    const { error: rulesError } = await supabaseAdmin.from("strategy_rules").insert(ruleRows);
    if (rulesError) throw rulesError;

    const checklistRows = checklist.slice(0, 10).map((label, index) => ({
      user_id: userId,
      strategy_id: strategyId,
      strategy_version_id: newVersion.id,
      label,
      description: index === 0 ? "Generated by Strategy Version Engine." : null,
      item_type: index < 4 ? "confirmation" : index < 7 ? "risk" : "management",
      sort_order: (index + 1) * 10,
      is_required: true,
      is_active: true,
    }));

    if (checklistRows.length) {
      const { error: checklistError } = await supabaseAdmin.from("strategy_checklist_items").insert(checklistRows);
      if (checklistError) throw checklistError;
    }

    const { data: reviewRow, error: reviewInsertError } = await supabaseAdmin
      .from("strategy_ai_reviews")
      .insert({
        user_id: userId,
        strategy_id: strategyId,
        strategy_version_id: newVersion.id,
        review_type: "version_improvement",
        title: `Strategy Version Upgrade — v${nextVersionNumber}`,
        summary: aiChangeSummary,
        what_works: asReviewItems(review?.what_works),
        what_fails: asReviewItems(review?.what_fails),
        mistakes: asReviewItems(review?.mistakes),
        rule_updates: [
          "Generated a stricter stop/invalidation rule.",
          "Added no-chase/no-late-entry protection.",
          "Added Before-Trade Gate and After-Trade Debrief controls.",
          ...asReviewItems(review?.rule_updates).slice(0, 4),
        ],
        next_tasks: [
          `Test Strategy v${nextVersionNumber} on the next 5 planned attempts before trusting it.`,
          "Use Before-Trade Gate before entry.",
          "Complete After-Trade Debrief after every attempt.",
          "Compare v1 vs v2 after at least 10 more examples/trades.",
        ],
        scores: asRecord(review?.scores),
        source_counts: {
          examples: examples?.length || 0,
          trades: trades?.length || 0,
          beforeTradeChecks: checks?.length || 0,
          afterTradeDebriefs: debriefs?.length || 0,
          previousVersion: currentVersion.version_number || 1,
          newVersion: nextVersionNumber,
        },
      })
      .select("*")
      .single();

    if (reviewInsertError) throw reviewInsertError;

    await supabaseAdmin
      .from("trading_strategies")
      .update({
        current_stage: "version_testing",
        status: "testing",
        next_action: `Test Strategy v${nextVersionNumber} with Before-Trade Gate and After-Trade Debrief before promoting it.`,
        weekly_focus: `Compare v${currentVersion.version_number || 1} vs v${nextVersionNumber}: fewer violations, cleaner entry timing, stronger discipline.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", strategyId)
      .eq("user_id", userId);

    return NextResponse.json({
      source: "skillEdge_strategy_version_generator",
      version: newVersion,
      review: reviewRow,
      compare: {
        previousVersionId: currentVersion.id,
        previousVersionNumber: currentVersion.version_number || 1,
        newVersionId: newVersion.id,
        newVersionNumber: nextVersionNumber,
        changes: {
          checklistAdded: checklist.length,
          avoidRulesAdded: leakRules.avoidRules.length,
          riskRulesAdded: leakRules.riskRules.length,
          managementRulesAdded: leakRules.managementRules.length,
        },
      },
    });
  } catch (error) {
    console.error("Strategy version generation error", error);
    return NextResponse.json({ error: "Failed to generate strategy version." }, { status: 500 });
  }
}
