import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type SupportMessagePayload = {
  role: "user" | "assistant" | "operator" | "system";
  text: string;
};

type PostMessagesBody = {
  sessionId?: string;
  anonymousId?: string;
  messages?: SupportMessagePayload[];
};

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function verifySessionAccess({
  sessionId,
  userId,
  anonymousId,
}: {
  sessionId: string;
  userId?: string | null;
  anonymousId?: string | null;
}) {
  const { data: session, error } = await supabaseAdmin
    .from("support_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) {
    return null;
  }

  if (userId && session.user_id === userId) {
    return session;
  }

  if (!session.user_id && anonymousId && session.anonymous_id === anonymousId) {
    return session;
  }

  if (anonymousId && session.anonymous_id === anonymousId) {
    return session;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const { searchParams } = new URL(request.url);

    const sessionId = searchParams.get("sessionId");
    const anonymousId = request.headers.get("x-support-anonymous-id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const session = await verifySessionAccess({
      sessionId,
      userId: user?.id,
      anonymousId,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Support session not found." },
        { status: 404 }
      );
    }

    const { data: messages, error } = await supabaseAdmin
      .from("support_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session, messages: messages || [] });
  } catch (error) {
    console.error("Support messages GET error:", error);

    return NextResponse.json(
      { error: "Failed to load support messages." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = (await request.json()) as PostMessagesBody;

    const sessionId = body.sessionId;
    const anonymousId = body.anonymousId;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "messages are required." },
        { status: 400 }
      );
    }

    const session = await verifySessionAccess({
      sessionId,
      userId: user?.id,
      anonymousId,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Support session not found." },
        { status: 404 }
      );
    }

    const rows = messages
      .filter((message) => message.text.trim())
      .map((message) => ({
        session_id: sessionId,
        sender_type: message.role,
        sender_name:
          message.role === "user"
            ? user?.email || "Visitor"
            : message.role === "operator"
              ? "Operator"
              : "SkillEdge Support",
        message_text: message.text.trim(),
      }));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid messages." },
        { status: 400 }
      );
    }

    const { data: insertedMessages, error: insertError } = await supabaseAdmin
      .from("support_messages")
      .insert(rows)
      .select("*");

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const lastMessage = rows[rows.length - 1]?.message_text || "";

    await supabaseAdmin
      .from("support_sessions")
      .update({
        last_message: lastMessage,
        customer_email: user?.email || session.customer_email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return NextResponse.json({ messages: insertedMessages || [] });
  } catch (error) {
    console.error("Support messages POST error:", error);

    return NextResponse.json(
      { error: "Failed to save support messages." },
      { status: 500 }
    );
  }
}