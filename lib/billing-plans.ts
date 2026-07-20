export type BillingPlanId = "core" | "edge" | "elite";
export type BillingPeriod = "monthly" | "halfyear" | "yearly";
export type PaymentMethodId = "fondy" | "crypto";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  publicName: string;
  description: string;
  monthlyPriceUsd: number;
  halfyearPriceUsd: number;
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
    halfyearPriceUsd: 249,
    yearlyPriceUsd: 399,
    yearlySavingsLabel: "Save $189 yearly",
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
      "Professional trading workspace with Strategy OS, Personal Edge, Reports, Market Intelligence, AI Scanner, and AI Market Brief for active traders.",
    monthlyPriceUsd: 99,
    halfyearPriceUsd: 499,
    yearlyPriceUsd: 799,
    yearlySavingsLabel: "Save $389 yearly",
    features: [
      "Everything in Core",
      "Strategy OS",
      "Setup Academy + Evidence Locker",
      "Personal Edge Engine",
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
      "Full AI Trading Desk with everything in Edge plus live AI Alerts, signal workflow, outcome tracking, and strategy-based feedback.",
    monthlyPriceUsd: 149,
    halfyearPriceUsd: 749,
    yearlyPriceUsd: 1249,
    yearlySavingsLabel: "Save $539 yearly",
    features: [
      "Everything in Edge",
      "Strategy OS + Signals workflow",
      "Personal Edge signal feedback",
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
  if (value === "halfyear") return "halfyear";
  if (value === "yearly") return "yearly";
  return "monthly";
}

export function getBillingPlan(planId: unknown): BillingPlan {
  return BILLING_PLANS[normalizeBillingPlanId(planId)];
}

export function getBillingAmountUsd(planId: unknown, period: unknown): number {
  const plan = getBillingPlan(planId);
  const billingPeriod = normalizeBillingPeriod(period);

  if (billingPeriod === "halfyear") {
    return plan.halfyearPriceUsd;
  }

  return billingPeriod === "yearly"
    ? plan.yearlyPriceUsd
    : plan.monthlyPriceUsd;
}

export function getBillingPeriodLabel(period: BillingPeriod): string {
  if (period === "halfyear") return "6 months";
  return period === "yearly" ? "Yearly" : "Monthly";
}

export function getBillingPeriodDays(period: BillingPeriod): number {
  if (period === "halfyear") return 183;
  return period === "yearly" ? 365 : 30;
}

export function getSubscriptionEndDate(period: BillingPeriod): string {
  const now = new Date();
  now.setDate(now.getDate() + getBillingPeriodDays(period));
  return now.toISOString();
}