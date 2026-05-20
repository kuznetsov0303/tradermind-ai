import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AdminAction = "paid" | "rejected";

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
    user: userData.user,
    serviceClient,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    if (!admin.ok) {
      return admin.response;
    }

    const { data, error } = await admin.serviceClient
      .from("referral_withdrawal_requests")
      .select(
        [
          "id",
          "user_id",
          "amount_points",
          "wallet_address",
          "network",
          "confirmation_email",
          "status",
          "admin_note",
          "created_at",
          "processed_at",
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        requests: data || [],
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
            : "Failed to load withdrawal requests",
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

    const body = await request.json();

    const requestId = String(body.requestId || "").trim();
    const action = String(body.action || "").trim() as AdminAction;
    const adminNote = String(body.adminNote || "").trim();

    if (!requestId) {
      return NextResponse.json(
        { error: "Withdrawal request ID is required" },
        { status: 400 }
      );
    }

    if (action !== "paid" && action !== "rejected") {
      return NextResponse.json(
        { error: "Action must be paid or rejected" },
        { status: 400 }
      );
    }

    const nextStatus = action === "paid" ? "paid" : "rejected";

    const { data, error } = await admin.serviceClient
      .from("referral_withdrawal_requests")
      .update({
        status: nextStatus,
        processed_at: new Date().toISOString(),
        admin_note:
          adminNote ||
          `${nextStatus.toUpperCase()} by ${admin.user.email || "admin"}`,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select(
        [
          "id",
          "user_id",
          "amount_points",
          "wallet_address",
          "network",
          "confirmation_email",
          "status",
          "admin_note",
          "created_at",
          "processed_at",
        ].join(",")
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "Request was not found or is not pending anymore. Refresh admin panel.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      request: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update withdrawal request",
      },
      { status: 500 }
    );
  }
}