import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramPlainMessage } from "@/lib/trading/telegram-signal-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      type?: string;
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

function isWebhookAuthorized(request: Request) {
  const secret = process.env.TELEGRAM_SIGNALS_WEBHOOK_SECRET;
  const querySecret = new URL(request.url).searchParams.get("secret");
  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!secret) return false;

  return querySecret === secret || headerSecret === secret;
}

function readStartCode(text: string | undefined) {
  if (!text) return null;

  const trimmed = text.trim();

  if (!trimmed.startsWith("/start")) return null;

  const [, code] = trimmed.split(/\s+/, 2);

  return code?.startsWith("se_") ? code : null;
}

function getDisplayUsername(update: TelegramUpdate) {
  return (
    update.message?.from?.username ||
    update.message?.chat?.username ||
    [update.message?.from?.first_name, update.message?.from?.last_name]
      .filter(Boolean)
      .join(" ") ||
    null
  );
}

export async function POST(request: Request) {
  if (!isWebhookAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = update?.message?.chat?.id;

  if (!update || !chatId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const code = readStartCode(update.message?.text);

  if (!code) {
    await sendTelegramPlainMessage({
      chatId: String(chatId),
      text:
        "👋 This is SkillEdge Signals Bot. Open your SkillEdge dashboard and press <b>Connect Telegram Alerts</b> to link this chat.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: connectCode, error: codeError } = await supabaseAdmin
    .from("telegram_signal_connect_codes")
    .select("id, user_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (codeError || !connectCode) {
    await sendTelegramPlainMessage({
      chatId: String(chatId),
      text: "❌ Connect code was not found. Generate a new code from your SkillEdge dashboard.",
    });

    return NextResponse.json({ ok: true, connected: false });
  }

  if (connectCode.used_at) {
    await sendTelegramPlainMessage({
      chatId: String(chatId),
      text: "ℹ️ This connect code was already used. Generate a new code from your dashboard if needed.",
    });

    return NextResponse.json({ ok: true, connected: false });
  }

  if (new Date(connectCode.expires_at).getTime() < Date.now()) {
    await sendTelegramPlainMessage({
      chatId: String(chatId),
      text: "⏳ Connect code expired. Generate a new code from your SkillEdge dashboard.",
    });

    return NextResponse.json({ ok: true, connected: false });
  }

  const username = getDisplayUsername(update);

  const { error: upsertError } = await supabaseAdmin
    .from("telegram_signal_subscriptions")
    .upsert(
      {
        user_id: connectCode.user_id,
        chat_id: String(chatId),
        username,
        is_enabled: true,
        min_status: "armed",
        asset_filter: "all",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,chat_id" }
    );

  if (upsertError) {
    console.error("Failed to upsert telegram signal subscription:", upsertError);

    await sendTelegramPlainMessage({
      chatId: String(chatId),
      text: "❌ Failed to connect Telegram Alerts. Try again from the dashboard.",
    });

    return NextResponse.json({ ok: true, connected: false });
  }

  await supabaseAdmin
    .from("telegram_signal_connect_codes")
    .update({
      used_at: new Date().toISOString(),
      chat_id: String(chatId),
    })
    .eq("id", connectCode.id);

  await sendTelegramPlainMessage({
    chatId: String(chatId),
    text:
      "✅ <b>SkillEdge Telegram Alerts connected.</b>\n\nYou will receive ACTIVE and ARMED signals here. WATCH ideas stay inside the dashboard.",
  });

  return NextResponse.json({ ok: true, connected: true });
}
