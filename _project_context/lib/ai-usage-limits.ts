import { getFeatureLimit, type AiFeature } from "./plan-limits";

type AnalysisType = "coach" | "journal" | "trade_chart";

function getAnalysisType(feature: AiFeature): AnalysisType {
  if (feature === "ai_coach") {
    return "coach";
  }

  if (feature === "journal_analysis") {
    return "journal";
  }

  return "trade_chart";
}

function getCurrentMonthRange() {
  const now = new Date();

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export async function checkAiFeatureLimit({
  supabaseAdmin,
  userId,
  planId,
  feature,
}: {
  supabaseAdmin: any;
  userId: string;
  planId: string | null | undefined;
  feature: AiFeature;
}) {
  const limit = getFeatureLimit(planId, feature);
  const analysisType = getAnalysisType(feature);
  const { startIso, endIso } = getCurrentMonthRange();

  const { count, error } = await supabaseAdmin
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("analysis_type", analysisType)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    throw new Error(error.message);
  }

  const used = count ?? 0;
  const remaining = Math.max(limit - used, 0);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
    analysisType,
  };
}