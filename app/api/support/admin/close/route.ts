import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CloseBody = {
  sessionId?: string;
};

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

export async function POST(request: Request) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as CloseBody;

    if (!body.sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("support_sessions")
      .update({
        status: "closed",
        assigned_operator_email: adminUser.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin.from("support_messages").insert({
      session_id: body.sessionId,
      sender_type: "system",
      sender_name: "SkillEdge Support",
      message_text: "Chat closed by operator.",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin support close error:", error);

    return NextResponse.json(
      { error: "Failed to close support session." },
      { status: 500 }
    );
  }
}