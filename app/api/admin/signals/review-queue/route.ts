import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchStockEngineJson, proxyStockEngine } from "@/lib/stockEngineProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE_VERSION = "s8_68_admin_signal_review_queue_route_v1";

function getEnvValue(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
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
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userEmail = userData.user?.email?.toLowerCase() || "";

  if (userError || !userEmail) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!getAdminEmails().includes(userEmail)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user: { id: userData.user!.id, email: userEmail } };
}

async function engineJson(response: Response) {
  const json = await response.json().catch(() => ({ ok: false, error: "engine_returned_non_json" }));
  if (!response.ok) return { ok: false, status: response.status, engine: json };
  return json;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 50), 100));
    const refresh = searchParams.get("refresh") !== "0";

    const unified = refresh
      ? await engineJson(
          await proxyStockEngine(
            `/engine/research/unified-skilledge-output/run?limit=${limit}&publish=true`,
            { method: "POST" }
          )
        )
      : await fetchStockEngineJson("/engine/research/unified-skilledge-output/latest");

    const approvals = await fetchStockEngineJson(
      `/engine/admin/manual-approvals/list?limit=${Math.max(100, limit * 2)}`
    ).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      items: [],
      summary: { count: 0, approvedCount: 0, clientVisibleApprovedCount: 0 },
    }));

    const unifiedRecord = unified && typeof unified === "object" ? (unified as Record<string, unknown>) : {};

    return NextResponse.json({
      ok: true,
      routeVersion: ROUTE_VERSION,
      adminOnly: true,
      requestedBy: admin.user.email,
      generatedAt: new Date().toISOString(),
      refresh,
      limit,
      summary: unifiedRecord.summary || null,
      clientOutput: unifiedRecord.clientOutput || null,
      internalOutput: unifiedRecord.internalOutput || null,
      approvals,
      policy: {
        adminOnly: true,
        exposesInternalOutputToAdminOnly: true,
        clientSeesUnifiedSkillEdgeAIOnly: true,
        manualApprovalIsFinalGateOnly: true,
        approveDoesNotBypassQualityOrRrOrGradeGates: true,
        routeDoesNotSendTelegram: true,
      },
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
