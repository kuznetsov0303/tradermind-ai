import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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

function buildFallbackMessage(session: any) {
  if (!session?.last_message) return null;

  return {
    id: `fallback-${session.id}`,
    session_id: session.id,
    sender_type: "user",
    sender_name:
      session.customer_email || session.user_email || "Anonymous visitor",
    message_text: session.last_message,
    created_at:
      session.operator_requested_at ||
      session.updated_at ||
      session.created_at ||
      new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId =
      searchParams.get("sessionId") || searchParams.get("session") || "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
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

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("support_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    const safeMessages =
      messages && messages.length > 0
        ? messages
        : buildFallbackMessage(supportSession)
          ? [buildFallbackMessage(supportSession)]
          : [];

    return NextResponse.json({
      session: supportSession,
      messages: safeMessages,
    });
  } catch (error) {
    console.error("Admin support messages error:", error);

    return NextResponse.json(
      { error: "Failed to load support messages." },
      { status: 500 }
    );
  }
}