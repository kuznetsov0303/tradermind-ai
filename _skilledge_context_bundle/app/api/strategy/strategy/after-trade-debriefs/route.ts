import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 4000);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function scoreDebrief(answers: Record<string, unknown>) {
  const executionChecks = [
    answers.followedPlan === true,
    answers.entryMatchedTrigger === true,
    answers.stopRespected === true,
    answers.rrRespected === true,
    answers.managedByPlan === true,
  ];

  const disciplineChecks = [
    answers.noChase === true,
    answers.noRevenge === true,
    answers.noOvertrade === true,
    answers.acceptedInvalidation === true,
    answers.reviewCompleted === true,
  ];

  const executionScore = Math.round((executionChecks.filter(Boolean).length / executionChecks.length) * 100);
  const disciplineScore = Math.round((disciplineChecks.filter(Boolean).length / disciplineChecks.length) * 100);

  const leaks: string[] = [];
  if (answers.followedPlan === false) leaks.push("plan_not_followed");
  if (answers.entryMatchedTrigger === false) leaks.push("entry_without_trigger");
  if (answers.stopRespected === false) leaks.push("stop_violation");
  if (answers.rrRespected === false) leaks.push("rr_broken");
  if (answers.noChase === false) leaks.push("late_chase");
  if (answers.noRevenge === false) leaks.push("revenge_trade");

  return {
    executionScore,
    disciplineScore,
    leaks,
    summary:
      leaks.length > 0
        ? `Main leaks detected: ${leaks.join(", ")}. Update your rules before the next attempt.`
        : "Debrief is clean. Keep collecting examples under the same rules.",
  };
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 80, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => ({}));
    const answers = asRecord(body.answers);
    const scoring = scoreDebrief(answers);

    const { data, error } = await supabaseAdmin
      .from("strategy_after_trade_debriefs")
      .insert({
        user_id: gate.auth.user.id,
        trade_id: asText(body.tradeId, "") || null,
        strategy_id: asText(body.strategyId, "") || null,
        strategy_version_id: asText(body.strategyVersionId, "") || null,
        answers,
        ai_review: {
          source: "skillEdge_structured_debrief_v1",
          summary: scoring.summary,
          leaks: scoring.leaks,
          nextAction:
            scoring.leaks.length > 0
              ? "Fix the broken rule and add one no-trade example."
              : "Add another example and keep the same checklist.",
        },
        execution_score: scoring.executionScore,
        discipline_score: scoring.disciplineScore,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_after_trade_debrief",
      debrief: data,
      scoring,
    });
  } catch (error) {
    console.error("After-trade debrief error", error);
    return NextResponse.json({ error: "Failed to save After-Trade Debrief." }, { status: 500 });
  }
}
