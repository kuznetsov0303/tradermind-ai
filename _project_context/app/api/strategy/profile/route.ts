import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

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

async function ensureProfile(userId: string) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_strategy_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("user_strategy_profiles")
    .insert({
      user_id: userId,
      experience_level: "beginner",
      preferred_markets: [],
      preferred_styles: [],
      preferred_timeframes: { context: ["1D", "1H", "15m"], execution: ["5m", "1m"] },
      risk_model: { minimumRR: 2, riskPerTrade: null, maxDailyLoss: null, maxTradesPerDay: null },
      roadmap_state: buildDefaultRoadmapState(),
      first_7_days_state: { day: 1, status: "active" },
      skill_map: buildDefaultSkillMap(),
      ai_summary: "Your Strategy workspace is ready. Complete your profile to unlock a guided roadmap.",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean).slice(0, 20);
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

export async function GET(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 120, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    const profile = await ensureProfile(gate.auth.user.id);

    return NextResponse.json({
      source: "skillEdge_strategy_profile",
      profile,
    });
  } catch (error) {
    console.error("Strategy profile GET error", error);
    return NextResponse.json({ error: "Failed to load Strategy profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const gate = await requireFeatureAccess(request, "journal", {
      rateLimit: { limit: 60, windowMs: 60_000 },
    });

    if (!gate.ok) return gate.response;

    await ensureProfile(gate.auth.user.id);

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (typeof body.experienceLevel === "string") {
      updates.experience_level = body.experienceLevel;
    }

    if (Array.isArray(body.preferredMarkets)) {
      updates.preferred_markets = asStringArray(body.preferredMarkets);
    }

    if (Array.isArray(body.preferredStyles)) {
      updates.preferred_styles = asStringArray(body.preferredStyles);
    }

    if (body.preferredTimeframes) {
      updates.preferred_timeframes = asRecord(body.preferredTimeframes);
    }

    if (body.riskModel) {
      updates.risk_model = asRecord(body.riskModel);
    }

    if (typeof body.currentFocusSetupSlug === "string") {
      updates.current_focus_setup_slug = body.currentFocusSetupSlug;
    }

    if (body.onboardingAnswers) {
      updates.onboarding_answers = asRecord(body.onboardingAnswers);
    }

    if (body.roadmapState) {
      updates.roadmap_state = asRecord(body.roadmapState);
    }

    if (body.first7DaysState) {
      updates.first_7_days_state = asRecord(body.first7DaysState);
    }

    if (body.skillMap) {
      updates.skill_map = asRecord(body.skillMap);
    }

    if (typeof body.aiSummary === "string") {
      updates.ai_summary = body.aiSummary.slice(0, 4000);
    }

    const { data, error } = await supabaseAdmin
      .from("user_strategy_profiles")
      .update(updates)
      .eq("user_id", gate.auth.user.id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      source: "skillEdge_strategy_profile_update",
      profile: data,
    });
  } catch (error) {
    console.error("Strategy profile PATCH error", error);
    return NextResponse.json({ error: "Failed to update Strategy profile." }, { status: 500 });
  }
}
