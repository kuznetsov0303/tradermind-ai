import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type OperatorRequestBody = {
  sessionId?: string;
  anonymousId?: string;
  pageUrl?: string;
  language?: string;
  message?: string;
  chatHistory?: {
    role?: string;
    text?: string;
  }[];
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

function escapeTelegramHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!botToken || !adminChatId) {
      return NextResponse.json(
        { error: "Telegram support is not configured." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as OperatorRequestBody;

    const sessionId = body.sessionId;
    const anonymousId = body.anonymousId || null;
    const pageUrl = body.pageUrl || "Unknown page";
    const language = body.language || "unknown";
    const message = body.message || "Operator request";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("support_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Support session not found." },
        { status: 404 }
      );
    }

    const hasAccess =
      (user?.id && session.user_id === user.id) ||
      (anonymousId && session.anonymous_id === anonymousId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Support session access denied." },
        { status: 403 }
      );
    }

    await supabaseAdmin
      .from("support_sessions")
      .update({
        operator_requested: true,
        operator_requested_at: new Date().toISOString(),
        status: "open",
        page_url: pageUrl,
        language,
        customer_email: user?.email || session.customer_email,
        last_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    await supabaseAdmin.from("support_messages").insert({
      session_id: sessionId,
      sender_type: "system",
      sender_name: "SkillEdge Support",
      message_text: "Operator request sent.",
    });

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      pageUrl.split("/").slice(0, 3).join("/") ||
      "http://localhost:3000";

    const adminChatUrl = `${siteUrl}/admin/support?session=${sessionId}`;

    const { data: recentMessages } = await supabaseAdmin
      .from("support_messages")
      .select("sender_type, sender_name, message_text, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(8);

    const historyText = (recentMessages || [])
      .reverse()
      .map((item) => {
        return `${item.sender_type}: ${item.message_text}`;
      })
      .join("\n");

    const telegramText = [
      "🚨 <b>New SkillEdge operator request</b>",
      "",
      `<b>Email:</b> ${escapeTelegramHtml(user?.email || session.customer_email || "Anonymous visitor")}`,
      `<b>User ID:</b> ${escapeTelegramHtml(user?.id || session.user_id || "No user_id")}`,
      `<b>Anonymous ID:</b> ${escapeTelegramHtml(session.anonymous_id || "No anonymous_id")}`,
      `<b>Session ID:</b> ${escapeTelegramHtml(sessionId)}`,
      "",
      `<b>Page:</b> ${escapeTelegramHtml(pageUrl)}`,
      `<b>Language:</b> ${escapeTelegramHtml(language)}`,
      "",
      "<b>Client message:</b>",
      escapeTelegramHtml(message),
      "",
      "<b>Open chat:</b>",
      escapeTelegramHtml(adminChatUrl),
      "",
      "<b>Recent chat:</b>",
      escapeTelegramHtml(historyText || "No chat history"),
    ].join("\n");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: telegramText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();

      console.error("Telegram support error:", telegramError);

      return NextResponse.json(
        {
          error: "Failed to send Telegram notification.",
          details: telegramError,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      adminChatUrl,
    });
  } catch (error) {
    console.error("Operator request error:", error);

    return NextResponse.json(
      { error: "Failed to process operator request." },
      { status: 500 }
    );
  }
}