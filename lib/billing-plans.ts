export type BillingPlanId = "core" | "edge" | "elite";
export type BillingPeriod = "monthly" | "yearly";
export type PaymentMethodId = "fondy" | "crypto";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  publicName: string;
  description: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  yearlySavingsLabel: string;
  features: string[];
};

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  core: {
    id: "core",
    name: "Core",
    publicName: "SkillEdge Core",
    description:
      "A disciplined trading workspace for journaling, screenshots, structure, and AI coaching.",
    monthlyPriceUsd: 49,
    yearlyPriceUsd: 490,
    yearlySavingsLabel: "Save $98 yearly",
    features: [
      "Trading journal",
      "Screenshot storage",
      "Basic analytics",
      "AI Coach",
      "Core trading structure",
    ],
  },
  edge: {
    id: "edge",
    name: "Edge",
    publicName: "SkillEdge Edge",
    description:
      "Advanced review, reports, market intelligence, and AI Market Brief for active traders.",
    monthlyPriceUsd: 99,
    yearlyPriceUsd: 990,
    yearlySavingsLabel: "Save $198 yearly",
    features: [
      "Everything in Core",
      "Advanced reports",
      "Market Intelligence",
      "AI Scanner",
      "AI Market Brief",
    ],
  },
  elite: {
    id: "elite",
    name: "Elite",
    publicName: "SkillEdge Elite",
    description:
      "A premium AI Trading Desk with alerts, signal workflow, and full execution intelligence.",
    monthlyPriceUsd: 179,
    yearlyPriceUsd: 1790,
    yearlySavingsLabel: "Save $358 yearly",
    features: [
      "Everything in Edge",
      "AI Alerts",
      "Floating alerts widget",
      "Signal-to-Journal workflow",
      "Premium AI Trading Desk",
    ],
  },
};

export function normalizeBillingPlanId(value: unknown): BillingPlanId {
  const plan = String(value || "").toLowerCase();

  if (plan === "edge") return "edge";
  if (plan === "elite") return "elite";

  return "core";
}

export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

export function getBillingPlan(planId: unknown): BillingPlan {
  return BILLING_PLANS[normalizeBillingPlanId(planId)];
}

export function getBillingAmountUsd(planId: unknown, period: unknown): number {
  const plan = getBillingPlan(planId);
  const billingPeriod = normalizeBillingPeriod(period);

  return billingPeriod === "yearly"
    ? plan.yearlyPriceUsd
    : plan.monthlyPriceUsd;
}

export function getBillingPeriodLabel(period: BillingPeriod): string {
  return period === "yearly" ? "Yearly" : "Monthly";
}

export function getBillingPeriodDays(period: BillingPeriod): number {
  return period === "yearly" ? 365 : 30;
}

export function getSubscriptionEndDate(period: BillingPeriod): string {
  const now = new Date();
  now.setDate(now.getDate() + getBillingPeriodDays(period));
  return now.toISOString();
}