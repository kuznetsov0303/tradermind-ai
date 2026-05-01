export type PlanId = "core" | "edge" | "elite";

export type AiFeature =
  | "ai_coach"
  | "journal_analysis"
  | "trade_chart_analysis";

export type PlanLimits = {
  aiCoachMessagesPerMonth: number;
  journalAnalysesPerMonth: number;
  chartAnalysesPerMonth: number;
  maxTrades: number;
  maxScreenshotsPerTrade: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  core: {
    aiCoachMessagesPerMonth: 50,
    journalAnalysesPerMonth: 10,
    chartAnalysesPerMonth: 20,
    maxTrades: 300,
    maxScreenshotsPerTrade: 3,
  },
  edge: {
    aiCoachMessagesPerMonth: 200,
    journalAnalysesPerMonth: 50,
    chartAnalysesPerMonth: 100,
    maxTrades: 2000,
    maxScreenshotsPerTrade: 5,
  },
  elite: {
    aiCoachMessagesPerMonth: 1000,
    journalAnalysesPerMonth: 300,
    chartAnalysesPerMonth: 500,
    maxTrades: 10000,
    maxScreenshotsPerTrade: 10,
  },
};

export function normalizePlanId(planId: string | null | undefined): PlanId {
  if (planId === "starter" || planId === "core") {
    return "core";
  }

  if (planId === "pro" || planId === "edge") {
    return "edge";
  }

  if (planId === "elite") {
    return "elite";
  }

  return "core";
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlanId(planId)];
}

export function getFeatureLimit(
  planId: string | null | undefined,
  feature: AiFeature
): number {
  const limits = getPlanLimits(planId);

  if (feature === "ai_coach") {
    return limits.aiCoachMessagesPerMonth;
  }

  if (feature === "journal_analysis") {
    return limits.journalAnalysesPerMonth;
  }

  return limits.chartAnalysesPerMonth;
}