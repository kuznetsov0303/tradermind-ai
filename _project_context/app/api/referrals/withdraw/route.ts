import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase env is missing" },
        { status: 500 }
      );
    }

    const body = await request.json();

    const amountPoints = Number(String(body.amountPoints || "").replace(",", "."));
    const walletAddress = String(body.walletAddress || "").trim();
    const network = String(body.network || "").trim();
    const confirmationEmail = String(body.confirmationEmail || "").trim();

    if (!Number.isFinite(amountPoints) || amountPoints < 75) {
      return NextResponse.json(
        { error: "Minimum withdrawal amount is 75 points" },
        { status: 400 }
      );
    }

    if (walletAddress.length < 8) {
      return NextResponse.json(
        { error: "Wallet address is too short" },
        { status: 400 }
      );
    }

    if (network.length < 2) {
      return NextResponse.json(
        { error: "Network is required" },
        { status: 400 }
      );
    }

    if (!confirmationEmail.includes("@")) {
      return NextResponse.json(
        { error: "Valid confirmation email is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc(
      "create_referral_withdrawal_request",
      {
        p_amount_points: amountPoints,
        p_wallet_address: walletAddress,
        p_network: network,
        p_confirmation_email: confirmationEmail,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Withdrawal request failed" },
        { status: 400 }
      );
    }

    const requestRow = Array.isArray(data) ? data[0] : data;

    await sendReferralTelegramNotification({
      requestId: requestRow?.request_id || "",
      userId: userData.user.id,
      userEmail: userData.user.email || confirmationEmail,
      amountPoints: Number(requestRow?.amount_points || amountPoints),
      walletAddress,
      network,
      confirmationEmail,
    });

    return NextResponse.json({
      ok: true,
      requestId: requestRow?.request_id || "",
      amountPoints: Number(requestRow?.amount_points || amountPoints),
      availableAfter: Number(requestRow?.available_after || 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected withdrawal request error",
      },
      { status: 500 }
    );
  }
}

async function sendReferralTelegramNotification({
  requestId,
  userId,
  userEmail,
  amountPoints,
  walletAddress,
  network,
  confirmationEmail,
}: {
  requestId: string;
  userId: string;
  userEmail: string;
  amountPoints: number;
  walletAddress: string;
  network: string;
  confirmationEmail: string;
}) {
  const botToken = process.env.TELEGRAM_REFERRAL_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REFERRAL_ADMIN_CHAT_ID;

  if (!botToken || !chatId) return;

  const text = [
    "💸 New SkillEdge referral withdrawal request",
    "",
    `Request ID: ${requestId}`,
    `User ID: ${userId}`,
    `User email: ${userEmail}`,
    `Amount: ${amountPoints} points`,
    `Network: ${network}`,
    `Wallet: ${walletAddress}`,
    `Confirmation email: ${confirmationEmail}`,
    "",
    "Status: pending",
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
}