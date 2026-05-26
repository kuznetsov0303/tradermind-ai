import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnvValue(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const body = await request.json();

    const referralCode = String(body.referralCode || "")
      .trim()
      .toUpperCase();

    if (!referralCode || referralCode.length < 4) {
      return NextResponse.json({ ok: true, attached: false });
    }

    const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userData.user;

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: codeOwner, error: codeError } = await serviceClient
      .from("user_referral_codes")
      .select("user_id, referral_code")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (codeError) {
      return NextResponse.json({ error: codeError.message }, { status: 400 });
    }

    if (!codeOwner?.user_id) {
      return NextResponse.json({ ok: true, attached: false, reason: "code_not_found" });
    }

    if (codeOwner.user_id === user.id) {
      return NextResponse.json({ ok: true, attached: false, reason: "self_referral_blocked" });
    }

    const { data: existingReferral } = await serviceClient
      .from("referrals")
      .select("id, referrer_user_id")
      .eq("referred_user_id", user.id)
      .maybeSingle();

    if (existingReferral?.id) {
      return NextResponse.json({
        ok: true,
        attached: false,
        reason: "already_attached",
      });
    }

    const { error: insertError } = await serviceClient.from("referrals").insert({
      referrer_user_id: codeOwner.user_id,
      referred_user_id: user.id,
      referral_code: referralCode,
      status: "active",
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      attached: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Referral attach failed",
      },
      { status: 500 }
    );
  }
}