import { createServiceSupabaseClient } from "@/lib/security/server-auth";

export type UserPlanId = "core" | "edge" | "elite";

export type ProtectedFeature =
  | "journal"
  | "screenshots"
  | "reports"
  | "market_intelligence"
  | "ai_scanner"
  | "ai_alerts"
  | "ai_coach";

export type UserSubscriptionAccess = {
  userId: string;
  planId: UserPlanId;
  subscriptionStatus: string | null;
  subscriptionProvider: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  isActive: boolean;
  source: "subscriptions" | "profiles" | "fallback";
};

function normalizeUserPlanId(value: unknown): UserPlanId {
  const plan = String(value || "").toLowerCase();

  if (plan === "edge") return "edge";
  if (plan === "elite") return "elite";

  return "core";
}

function isSubscriptionActive(params: {
  status: string | null;
  currentPeriodEnd: string | null;
}) {
  const status = String(params.status || "").toLowerCase();

  if (status !== "active" && status !== "trialing") {
    return false;
  }

  if (!params.currentPeriodEnd) {
    return status === "active" || status === "trialing";
  }

  const end = new Date(params.currentPeriodEnd).getTime();

  if (Number.isNaN(end)) {
    return false;
  }

  return end > Date.now();
}

export function canAccessFeature(
  access: UserSubscriptionAccess,
  feature: ProtectedFeature,
): boolean {
  if (feature === "journal") return true;
  if (feature === "screenshots") return true;
  if (feature === "ai_coach") return true;

  if (!access.isActive) {
    return false;
  }

  if (feature === "reports") {
    return access.planId === "edge" || access.planId === "elite";
  }

  if (feature === "market_intelligence") {
    return access.planId === "edge" || access.planId === "elite";
  }

  if (feature === "ai_scanner") {
    return access.planId === "edge" || access.planId === "elite";
  }

  if (feature === "ai_alerts") {
    return access.planId === "elite";
  }

  return false;
}

async function getAccessFromSubscriptions(
  userId: string,
): Promise<UserSubscriptionAccess | null> {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id,status,expires_at,billing_period,is_demo")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const planId = normalizeUserPlanId(data.plan_id);
  const subscriptionStatus = data.status || null;
  const subscriptionCurrentPeriodEnd = data.expires_at || null;
  const isActive = isSubscriptionActive({
    status: subscriptionStatus,
    currentPeriodEnd: subscriptionCurrentPeriodEnd,
  });

  return {
    userId,
    planId,
    subscriptionStatus,
    subscriptionProvider: data.is_demo ? "demo" : "subscription",
    subscriptionCurrentPeriodEnd,
    isActive,
    source: "subscriptions",
  };
}

async function getAccessFromProfiles(
  userId: string,
): Promise<UserSubscriptionAccess | null> {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "plan_id, subscription_status, subscription_provider, subscription_current_period_end",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const planId = normalizeUserPlanId(data.plan_id);
  const subscriptionStatus = data.subscription_status || null;
  const subscriptionProvider = data.subscription_provider || null;
  const subscriptionCurrentPeriodEnd =
    data.subscription_current_period_end || null;

  return {
    userId,
    planId,
    subscriptionStatus,
    subscriptionProvider,
    subscriptionCurrentPeriodEnd,
    isActive: isSubscriptionActive({
      status: subscriptionStatus,
      currentPeriodEnd: subscriptionCurrentPeriodEnd,
    }),
    source: "profiles",
  };
}

export async function getUserSubscriptionAccess(
  userId: string,
): Promise<UserSubscriptionAccess> {
  const subscriptionsAccess = await getAccessFromSubscriptions(userId);

  if (subscriptionsAccess?.isActive) {
    return subscriptionsAccess;
  }

  const profilesAccess = await getAccessFromProfiles(userId);

  if (profilesAccess?.isActive) {
    return profilesAccess;
  }

  if (subscriptionsAccess) {
    return subscriptionsAccess;
  }

  if (profilesAccess) {
    return profilesAccess;
  }

  return {
    userId,
    planId: "core",
    subscriptionStatus: "inactive",
    subscriptionProvider: null,
    subscriptionCurrentPeriodEnd: null,
    isActive: false,
    source: "fallback",
  };
}