import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

type SupportMessageInput = {
  role?: "assistant" | "user" | "operator" | "system";
  text?: string;
};

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}

async function canAccessSession({
  request,
  sessionId,
}: {
  request: Request;
  sessionId: string;
}) {
  const user = await getRequestUser(request);
  const anonymousId = request.headers.get("x-support-anonymous-id") || "";

  const { data: supportSession, error } = await supabaseAdmin
    .from("support_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !supportSession) {
    return {
      allowed: false,
      supportSession: null,
      user,
      anonymousId,
    };
  }

  const belongsToUser = user?.id && supportSession.user_id === user.id;
  const belongsToAnonymous =
    anonymousId && supportSession.anonymous_id === anonymousId;

  return {
    allowed: Boolean(belongsToUser || belongsToAnonymous),
    supportSession,
    user,
    anonymousId,
  };
}

export async function GET(request: Request) {
    const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `support-messages-get:${ip}`,
    limit: 120,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return rateLimitResponse(rate.resetAt);
  }
  try {
    const { searchParams } = new URL(request.url);
    const sessionId =
      searchParams.get("sessionId") || searchParams.get("session") || "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const access = await canAccessSession({ request, sessionId });

    if (!access.allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: messages, error } = await supabaseAdmin
  .from("support_messages")
  .select("*")
  .eq("session_id", sessionId)
  .neq("sender_type", "system")
  .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      messages: messages || [],
    });
  } catch (error) {
    console.error("Support messages GET error:", error);

    return NextResponse.json(
      { error: "Failed to load support messages." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `support-messages-post:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return rateLimitResponse(rate.resetAt);
  }
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      anonymousId?: string;
      messages?: SupportMessageInput[];
    };

    const sessionId = body.sessionId?.trim() || "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const access = await canAccessSession({ request, sessionId });

    if (!access.allowed) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const messagesToInsert = (body.messages || [])
      .map((message) => ({
        session_id: sessionId,
        sender_type: message.role || "user",
        sender_name:
          message.role === "operator"
            ? "Operator"
            : message.role === "system"
              ? "SkillEdge Support"
              : access.user?.email || "Client",
        message_text: (message.text || "").trim(),
      }))
      .filter((message) => message.message_text.length > 0);

    if (!messagesToInsert.length) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const { data: insertedMessages, error } = await supabaseAdmin
      .from("support_messages")
      .insert(messagesToInsert)
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lastMessage = messagesToInsert[messagesToInsert.length - 1];

    await supabaseAdmin
      .from("support_sessions")
      .update({
        last_message: lastMessage.message_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return NextResponse.json({
      ok: true,
      messages: insertedMessages || [],
    });
  } catch (error) {
    console.error("Support messages POST error:", error);

    return NextResponse.json(
      { error: "Failed to save support messages." },
      { status: 500 }
    );
  }
}