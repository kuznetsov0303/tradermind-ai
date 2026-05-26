import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/security/admin-access";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

export type AdminRouteGateResult =
  | {
      ok: true;
      adminEmail: string;
      adminUserId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAdminRouteAccess(
  request: Request,
  options: {
    rateLimit?: {
      keyPrefix?: string;
      limit: number;
      windowMs: number;
    };
  } = {},
): Promise<AdminRouteGateResult> {
  const admin = await requireAdminAccess(request);

  if (!admin.ok) {
    return admin;
  }

  if (options.rateLimit) {
    const clientIp = getClientIp(request);

    const rate = checkRateLimit({
      key: `${options.rateLimit.keyPrefix || "admin"}:${admin.adminEmail}:${clientIp}`,
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

  return {
    ok: true,
    adminEmail: admin.adminEmail,
    adminUserId: admin.userId,
  };
}