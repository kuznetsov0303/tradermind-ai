import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user?.email) {
    return null;
  }

  const adminEmails = (
    process.env.SUPPORT_ADMIN_EMAILS ||
    process.env.SUPPORT_ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(data.user.email.toLowerCase())) {
    return null;
  }

  return data.user;
}

export async function GET(request: Request) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: sessions, error } = await supabaseAdmin
      .from("support_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error) {
    console.error("Admin support sessions error:", error);

    return NextResponse.json(
      { error: "Failed to load support sessions." },
      { status: 500 }
    );
  }
}