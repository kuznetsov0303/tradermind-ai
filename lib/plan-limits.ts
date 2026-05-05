export type PlanId = "core" | "edge" | "elite";

export type AiFeature =
  | "ai_coach"
  | "journal_analysis"
  | "trade_chart_analysis"
  | "ai_report";

export type PlanLimits = {
  aiCoachMessagesPerMonth: number;
  journalAnalysesPerMonth: number;
  chartAnalysesPerMonth: number;
  aiReportsPerMonth: number;

  maxTrades: number;
  maxScreenshotsPerTrade: number;

  canUseAiReports: boolean;
  canUseSupportAssistant: boolean;
  canUseSocialTickers: boolean;
  canUseAiScanner: boolean;
  canUsePremiumChartAnalysis: boolean;
  canExportReports: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  core: {
    aiCoachMessagesPerMonth: 50,
    journalAnalysesPerMonth: 10,
    chartAnalysesPerMonth: 20,
    aiReportsPerMonth: 0,

    maxTrades: 300,
    maxScreenshotsPerTrade: 3,

    canUseAiReports: false,
    canUseSupportAssistant: true,
    canUseSocialTickers: false,
    canUseAiScanner: false,
    canUsePremiumChartAnalysis: false,
    canExportReports: true,
  },

  edge: {
    aiCoachMessagesPerMonth: 200,
    journalAnalysesPerMonth: 50,
    chartAnalysesPerMonth: 100,
    aiReportsPerMonth: 30,

    maxTrades: 2000,
    maxScreenshotsPerTrade: 5,

    canUseAiReports: true,
    canUseSupportAssistant: true,
    canUseSocialTickers: true,
    canUseAiScanner: false,
    canUsePremiumChartAnalysis: true,
    canExportReports: true,
  },

  elite: {
    aiCoachMessagesPerMonth: 1000,
    journalAnalysesPerMonth: 300,
    chartAnalysesPerMonth: 500,
    aiReportsPerMonth: 150,

    maxTrades: 10000,
    maxScreenshotsPerTrade: 10,

    canUseAiReports: true,
    canUseSupportAssistant: true,
    canUseSocialTickers: true,
    canUseAiScanner: true,
    canUsePremiumChartAnalysis: true,
    canExportReports: true,
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

  if (feature === "trade_chart_analysis") {
    return limits.chartAnalysesPerMonth;
  }

  return limits.aiReportsPerMonth;
}

export function canUseFeature(
  planId: string | null | undefined,
  feature:
    | "ai_reports"
    | "support_assistant"
    | "social_tickers"
    | "ai_scanner"
    | "premium_chart_analysis"
    | "export_reports"
): boolean {
  const limits = getPlanLimits(planId);

  if (feature === "ai_reports") {
    return limits.canUseAiReports;
  }

  if (feature === "support_assistant") {
    return limits.canUseSupportAssistant;
  }

  if (feature === "social_tickers") {
    return limits.canUseSocialTickers;
  }

  if (feature === "ai_scanner") {
    return limits.canUseAiScanner;
  }

  if (feature === "premium_chart_analysis") {
    return limits.canUsePremiumChartAnalysis;
  }

  return limits.canExportReports;
}