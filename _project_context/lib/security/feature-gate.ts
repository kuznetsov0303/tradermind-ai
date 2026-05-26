import { NextResponse } from "next/server";
import {
  requireSupabaseUser,
  type ServerAuthResult,
} from "@/lib/security/server-auth";
import {
  canAccessFeature,
  getUserSubscriptionAccess,
  type ProtectedFeature,
  type UserSubscriptionAccess,
} from "@/lib/security/subscription-access";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

export type FeatureGateResult =
  | {
      ok: true;
      auth: Extract<ServerAuthResult, { ok: true }>;
      access: UserSubscriptionAccess;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export type FeatureGateOptions = {
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
};

function getRequiredPlanLabel(feature: ProtectedFeature): string {
  if (feature === "ai_alerts") return "SkillEdge Elite";

  if (
    feature === "reports" ||
    feature === "market_intelligence" ||
    feature === "ai_scanner"
  ) {
    return "SkillEdge Edge or Elite";
  }

  return "Active SkillEdge plan";
}

export async function requireFeatureAccess(
  request: Request,
  feature: ProtectedFeature,
  options: FeatureGateOptions = {},
): Promise<FeatureGateResult> {
  const auth = await requireSupabaseUser(request);

  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      ),
    };
  }

  if (options.rateLimit) {
    const clientIp = getClientIp(request);
    const rate = checkRateLimit({
      key: `${feature}:${auth.user.id}:${clientIp}`,
      limit: options.rateLimit.limit,
      windowMs: options.rateLimit.windowMs,
    });

    if (!rate.ok) {
      return {
        ok: false,
        response: rateLimitResponse(rate.resetAt),
      };
    }
  }

  const access = await getUserSubscriptionAccess(auth.user.id);
  const allowed = canAccessFeature(access, feature);

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "This feature is not available on your current plan.",
          feature,
          currentPlan: access.planId,
          subscriptionStatus: access.subscriptionStatus,
          requiredPlan: getRequiredPlanLabel(feature),
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    auth,
    access,
  };
}