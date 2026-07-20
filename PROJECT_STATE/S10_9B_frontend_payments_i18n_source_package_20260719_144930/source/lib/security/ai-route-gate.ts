import { NextResponse } from "next/server";
import { requireSupabaseUser, type ServerAuthResult } from "@/lib/security/server-auth";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { getUserSubscriptionAccess } from "@/lib/security/subscription-access";

export type AiRouteGateResult =
  | {
      ok: true;
      auth: Extract<ServerAuthResult, { ok: true }>;
      planId: "core" | "edge" | "elite";
      isActive: boolean;
      subscriptionStatus: string | null;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export type AiRouteGateOptions = {
  routeName: string;
  requireActiveSubscription?: boolean;
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
};

export async function requireAiRouteAccess(
  request: Request,
  options: AiRouteGateOptions,
): Promise<AiRouteGateResult> {
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
    const ip = getClientIp(request);

    const rate = checkRateLimit({
      key: `ai:${options.routeName}:${auth.user.id}:${ip}`,
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

  if (options.requireActiveSubscription !== false && !access.isActive) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "An active SkillEdge AI plan is required for this AI feature.",
          code: "PLAN_REQUIRED",
          currentPlan: access.planId,
          subscriptionStatus: access.subscriptionStatus,
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    auth,
    planId: access.planId,
    isActive: access.isActive,
    subscriptionStatus: access.subscriptionStatus,
  };
}