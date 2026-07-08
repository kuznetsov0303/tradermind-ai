import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchStockEngineJson, proxyStockEngine } from "@/lib/stockEngineProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_VERSION = "s8_67_admin_manual_signal_approval_route_v1";

function getEnvValue(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

function getAdminEmails() {
  return String(process.env.SKILLEDGE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user?.email) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminEmails = getAdminEmails();
  const userEmail = userData.user.email.toLowerCase();

  if (!adminEmails.includes(userEmail)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user: {
      id: userData.user.id,
      email: userEmail,
    },
  };
}

function normalizeAction(value: unknown) {
  const action = String(value || "approve").trim().toLowerCase();

  if (action === "reject" || action === "rejected" || action === "block") {
    return "reject";
  }

  return "approve";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    if (!admin.ok) {
      return admin.response;
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 500));
    const signalId = String(searchParams.get("signalId") || searchParams.get("signal_id") || "").trim();

    const enginePath = `/engine/admin/manual-approvals/list?limit=${limit}${
      signalId ? `&signal_id=${encodeURIComponent(signalId)}` : ""
    }`;

    const engine = await fetchStockEngineJson(enginePath);

    return NextResponse.json({
      ...engine,
      routeVersion: ROUTE_VERSION,
      adminOnly: true,
      requestedBy: admin.user.email,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        routeVersion: ROUTE_VERSION,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    if (!admin.ok) {
      return admin.response;
    }

    const body = await request.json().catch(() => ({}));
    const signalId = String(body?.signalId || body?.signal_id || "").trim();

    if (!signalId) {
      return NextResponse.json(
        {
          ok: false,
          routeVersion: ROUTE_VERSION,
          error: "signalId is required",
        },
        { status: 400 }
      );
    }

    const action = normalizeAction(body?.action);
    const enginePath =
      action === "reject"
        ? "/engine/admin/manual-approvals/reject"
        : "/engine/admin/manual-approvals/approve";

    const enginePayload = {
      signalId,
      symbol: body?.symbol || null,
      setupSlug: body?.setupSlug || body?.setup_slug || null,
      sessionDate: body?.sessionDate || body?.session_date || null,
      reason: body?.reason || null,
      notes: body?.notes || null,
      reviewedBy: admin.user.email,
      source: "vercel_admin_manual_signal_approval",
      routeVersion: ROUTE_VERSION,
    };

    const response = await proxyStockEngine(enginePath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(enginePayload),
    });

    const json = await response.json().catch(() => ({
      ok: false,
      error: "engine_returned_non_json",
    }));

    return NextResponse.json(
      {
        ...json,
        routeVersion: ROUTE_VERSION,
        action,
        requestedBy: admin.user.email,
        policy: {
          ...(json?.policy || {}),
          adminOnly: true,
          manualApprovalIsFinalGateOnly: true,
          doesNotBypassQualityOrRrOrGradeGates: true,
        },
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        routeVersion: ROUTE_VERSION,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
