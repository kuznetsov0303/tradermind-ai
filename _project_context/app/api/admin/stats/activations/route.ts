import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PlanKey = "demo" | "core" | "edge" | "elite";
type PeriodKey = "all" | "month" | "week" | "day";

const PLAN_KEYS: PlanKey[] = ["demo", "core", "edge", "elite"];
const PERIOD_KEYS: PeriodKey[] = ["all", "month", "week", "day"];

function getEnvValue(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function getAdminEmails() {
  return String(process.env.SKILLEDGE_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getPeriodStart(period: PeriodKey) {
  if (period === "all") return null;

  const now = new Date();

  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (period === "week") {
    const start = new Date(now);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

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
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminEmails = getAdminEmails();
  const userEmail = userData.user.email.toLowerCase();

  if (!adminEmails.includes(userEmail)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    ok: true as const,
    serviceClient,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    if (!admin.ok) {
      return admin.response;
    }

    const stats = PERIOD_KEYS.reduce((acc, period) => {
      acc[period] = { demo: 0, core: 0, edge: 0, elite: 0 };
      return acc;
    }, {} as Record<PeriodKey, Record<PlanKey, number>>);

    for (const period of PERIOD_KEYS) {
      const periodStart = getPeriodStart(period);

      for (const plan of PLAN_KEYS) {
        let query = admin.serviceClient
          .from("subscription_activation_events")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", plan);

        if (periodStart) {
          query = query.gte("activated_at", periodStart.toISOString());
        }

        const { count, error } = await query;

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        stats[period][plan] = count || 0;
      }
    }

    const totals = PERIOD_KEYS.reduce((acc, period) => {
      acc[period] = PLAN_KEYS.reduce(
        (sum, plan) => sum + stats[period][plan],
        0
      );
      return acc;
    }, {} as Record<PeriodKey, number>);

    return NextResponse.json(
      {
        ok: true,
        stats,
        totals,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load activation stats",
      },
      { status: 500 }
    );
  }
}

