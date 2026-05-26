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

function evaluateGate(checklist: Record<string, unknown>) {
  const keys = [
    "contextMatches",
    "triggerConfirmed",
    "entryNotLate",
    "stopDefined",
    "rrAcceptable",
    "riskWithinPlan",
  ];

  const passed = keys.filter((key) => checklist[key] === true).length;
  const failed = keys.filter((key) => checklist[key] === false);
  const score = Math.round((passed / keys.length) * 100);

  if (failed.length >= 2 || score < 60) {
    return {
      gateStatus: "not_ready",
      warning: `Trade is not ready. Main issues: ${failed.join(", ") || "missing confirmations"}.`,
      score,
      failed,
    };
  }

  if (score < 85) {
    return {
      gateStatus: "review",
      warning: "Trade needs review. One or more confirmations are still weak.",
      score,
      failed,
    };
  }

  return {
    gateStatus: "ready",
    warning: "Trade plan looks structured. Keep risk fixed and follow invalidation.",
    score,
    failed,
  };
}

export async function POST(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 80, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => ({}));
    const checklistResult = asRecord(body.checklistResult);
    const evaluation = evaluateGate(checklistResult);

    const { data, error } = await supabaseAdmin
      .from("strategy_before_trade_checks")
      .insert({
        user_id: gate.auth.user.id,
        strategy_id: asText(body.strategyId, "") || null,
        strategy_version_id: asText(body.strategyVersionId, "") || null,
        symbol: asText(body.symbol, "") || null,
        direction: asText(body.direction, "") || null,
        planned_entry: asText(body.plannedEntry, "") || null,
        planned_stop: asText(body.plannedStop, "") || null,
        planned_targets: asText(body.plannedTargets, "") || null,
        checklist_result: {
          ...checklistResult,
          skillEdgeGateScore: evaluation.score,
          failedChecks: evaluation.failed,
        },
        gate_status: evaluation.gateStatus,
        ai_warning: evaluation.warning,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_before_trade_gate",
      check: data,
      evaluation,
    });
  } catch (error) {
    console.error("Before-trade gate error", error);
    return NextResponse.json({ error: "Failed to run Before-Trade Gate." }, { status: 500 });
  }
}
