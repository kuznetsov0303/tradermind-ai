import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

type EmailRequestBody = {
  sessionId?: string;
  anonymousId?: string;
  email?: string;
  message?: string;
  language?: string;
  pageUrl?: string;
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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendTelegramNotification({
  email,
  message,
  pageUrl,
  language,
  sessionId,
}: {
  email: string;
  message: string;
  pageUrl: string;
  language: string;
  sessionId: string;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!botToken || !adminChatId) return false;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    pageUrl.split("/").slice(0, 3).join("/") ||
    "http://localhost:3000";

  const adminChatUrl = `${siteUrl}/admin/support?session=${sessionId}`;

  const telegramText = [
    "📩 <b>New SkillEdge email support request</b>",
    "",
    `<b>Email:</b> ${escapeHtml(email)}`,
    `<b>Session ID:</b> ${escapeHtml(sessionId)}`,
    `<b>Page:</b> ${escapeHtml(pageUrl)}`,
    `<b>Language:</b> ${escapeHtml(language)}`,
    "",
    "<b>Client message:</b>",
    escapeHtml(message),
    "",
    "<b>Open support session:</b>",
    escapeHtml(adminChatUrl),
  ].join("\n");

  const response = await fetch(
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

  if (!response.ok) {
    console.error("Telegram email support error:", await response.text());
    return false;
  }

  return true;
}

async function sendEmailNotification({
  email,
  message,
  pageUrl,
  language,
  sessionId,
}: {
  email: string;
  message: string;
  pageUrl: string;
  language: string;
  sessionId: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const supportAdminEmail =
    process.env.SUPPORT_ADMIN_EMAIL || "support@upyourskills.site";
  const supportFromEmail =
    process.env.SUPPORT_FROM_EMAIL || "SkillEdge AI <onboarding@resend.dev>";

  if (!resendApiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: supportFromEmail,
      to: [supportAdminEmail],
      reply_to: email,
      subject: "New SkillEdge AI support request",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2>New SkillEdge AI support request</h2>
          <p><strong>Client email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Language:</strong> ${escapeHtml(language)}</p>
          <p><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>
          <p><strong>Session ID:</strong> ${escapeHtml(sessionId)}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
        </div>
      `,
      text: [
        "New SkillEdge AI support request",
        "",
        `Client email: ${email}`,
        `Language: ${language}`,
        `Page: ${pageUrl}`,
        `Session ID: ${sessionId}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    console.error("Resend support email error:", await response.text());
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = (await request.json()) as EmailRequestBody;

    const email = (body.email || user?.email || "").trim().toLowerCase();
    const message = (body.message || "").trim();
    const anonymousId = body.anonymousId || null;
    const language = body.language || "ru";
    const pageUrl = body.pageUrl || "Unknown page";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 }
      );
    }

    if (!message || message.length < 3) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    let sessionId = body.sessionId || "";

    if (!sessionId) {
      const { data: createdSession, error: createError } = await supabaseAdmin
        .from("support_sessions")
        .insert({
          user_id: user?.id || null,
          customer_email: email,
          anonymous_id: anonymousId,
          language,
          page_url: pageUrl,
          status: "open",
          operator_requested: true,
          operator_requested_at: new Date().toISOString(),
          last_message: message,
        })
        .select("*")
        .single();

      if (createError || !createdSession?.id) {
        return NextResponse.json(
          { error: createError?.message || "Failed to create session." },
          { status: 500 }
        );
      }

      sessionId = createdSession.id;
    } else {
      await supabaseAdmin
        .from("support_sessions")
        .update({
          customer_email: email,
          language,
          page_url: pageUrl,
          status: "open",
          operator_requested: true,
          operator_requested_at: new Date().toISOString(),
          last_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
    }

    await supabaseAdmin.from("support_messages").insert([
      {
        session_id: sessionId,
        sender_type: "user",
        sender_name: email,
        message_text: `Email support request from ${email}\n\n${message}`,
      },
      {
        session_id: sessionId,
        sender_type: "system",
        sender_name: "SkillEdge Support",
        message_text: "Email support request sent.",
      },
    ]);

    const telegramSent = await sendTelegramNotification({
      email,
      message,
      pageUrl,
      language,
      sessionId,
    });

    const emailSent = await sendEmailNotification({
      email,
      message,
      pageUrl,
      language,
      sessionId,
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      telegramSent,
      emailSent,
    });
  } catch (error) {
    console.error("Email support request error:", error);

    return NextResponse.json(
      { error: "Failed to send support request." },
      { status: 500 }
    );
  }
}