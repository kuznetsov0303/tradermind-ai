import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ReplyBody = {
  sessionId?: string;
  message?: string;
};

async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user?.email) return null;

  const adminEmails = (
    process.env.SUPPORT_ADMIN_EMAILS ||
    process.env.SUPPORT_ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(data.user.email.toLowerCase())) return null;

  return data.user;
}

export async function POST(request: Request) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as ReplyBody;

    const sessionId = body.sessionId?.trim() || "";
    const message = body.message?.trim() || "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "message is required." },
        { status: 400 }
      );
    }

    const { data: supportSession, error: sessionError } = await supabaseAdmin
      .from("support_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !supportSession) {
      return NextResponse.json(
        { error: sessionError?.message || "Session not found." },
        { status: 404 }
      );
    }

    const { data: insertedMessage, error: insertError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        session_id: sessionId,
        sender_type: "operator",
        sender_name: adminUser.email,
        message_text: message,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("support_sessions")
      .update({
        status: "open",
        assigned_operator_email: adminUser.email,
        last_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return NextResponse.json({
      ok: true,
      message: insertedMessage,
    });
  } catch (error) {
    console.error("Admin support reply error:", error);

    return NextResponse.json(
      { error: "Failed to send support reply." },
      { status: 500 }
    );
  }
}