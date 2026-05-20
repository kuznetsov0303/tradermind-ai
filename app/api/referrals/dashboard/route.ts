import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ReferralCodeRow = {
  referral_code: string;
};

type ReferralRow = {
  id: string;
  referred_user_id: string;
  referral_code: string | null;
  status: string;
  created_at: string;
};

type ReferralRewardRow = {
  id: string;
  referral_id: string;
  referred_user_id: string;
  payment_id: string;
  payment_amount_usd: number | string | null;
  reward_percent: number | string | null;
  reward_points: number | string | null;
  reward_type: string;
  status: string;
  created_at: string;
};

type ReferralWithdrawalRow = {
  id: string;
  amount_points: number | string | null;
  wallet_address: string;
  network: string;
  confirmation_email: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

function getEnvValue(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function makeReferralCode(email: string | null | undefined, userId: string) {
  const namePart = String(email || "trader")
    .split("@")[0]
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase();

  const idPart = userId.replace(/-/g, "").slice(0, 7).toUpperCase();

  return `${namePart || "TRADER"}-${idPart}`;
}

function toNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

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

    const { data: existingCodeData } = await serviceClient
      .from("user_referral_codes")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingCode = existingCodeData as ReferralCodeRow | null;

    let referralCode = existingCode?.referral_code || "";

    if (!referralCode) {
      referralCode = makeReferralCode(user.email, user.id);

      const { data: createdCodeData, error: codeError } = await serviceClient
        .from("user_referral_codes")
        .insert({
          user_id: user.id,
          referral_code: referralCode,
        })
        .select("referral_code")
        .single();

      if (codeError) {
        return NextResponse.json({ error: codeError.message }, { status: 400 });
      }

      const createdCode = createdCodeData as ReferralCodeRow;
      referralCode = createdCode.referral_code;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.upyourskills.site";

    const referralLink = `${siteUrl.replace(
      /\/$/,
      ""
    )}/?ref=${encodeURIComponent(referralCode)}`;

    const { data: referralsData, error: referralsError } = await serviceClient
      .from("referrals")
      .select("id, referred_user_id, referral_code, status, created_at")
      .eq("referrer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (referralsError) {
      return NextResponse.json(
        { error: referralsError.message },
        { status: 400 }
      );
    }

    const { data: rewardsData, error: rewardsError } = await serviceClient
      .from("referral_rewards")
      .select(
        [
          "id",
          "referral_id",
          "referred_user_id",
          "payment_id",
          "payment_amount_usd",
          "reward_percent",
          "reward_points",
          "reward_type",
          "status",
          "created_at",
        ].join(",")
      )
      .eq("referrer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(150);

    if (rewardsError) {
      return NextResponse.json({ error: rewardsError.message }, { status: 400 });
    }

    const { data: withdrawalsData, error: withdrawalsError } =
      await serviceClient
        .from("referral_withdrawal_requests")
        .select(
          [
            "id",
            "amount_points",
            "wallet_address",
            "network",
            "confirmation_email",
            "status",
            "admin_note",
            "created_at",
            "processed_at",
          ].join(",")
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

    if (withdrawalsError) {
      return NextResponse.json(
        { error: withdrawalsError.message },
        { status: 400 }
      );
    }

    const referrals = (referralsData ?? []) as unknown as ReferralRow[];
const rewards = (rewardsData ?? []) as unknown as ReferralRewardRow[];
const withdrawals = (withdrawalsData ?? []) as unknown as ReferralWithdrawalRow[];
    const referredUserIds = Array.from(
      new Set(referrals.map((item) => item.referred_user_id).filter(Boolean))
    );

    const userEmailById = new Map<string, string>();

    for (const referredUserId of referredUserIds.slice(0, 50)) {
      const { data: referredUserData } =
        await serviceClient.auth.admin.getUserById(referredUserId);

      if (referredUserData?.user?.email) {
        userEmailById.set(referredUserId, referredUserData.user.email);
      }
    }

    const earnedByReferralId = new Map<string, number>();
    const earnedByUserId = new Map<string, number>();

    for (const reward of rewards) {
      const points = toNumber(reward.reward_points);

      if (reward.referral_id) {
        earnedByReferralId.set(
          reward.referral_id,
          (earnedByReferralId.get(reward.referral_id) || 0) + points
        );
      }

      if (reward.referred_user_id) {
        earnedByUserId.set(
          reward.referred_user_id,
          (earnedByUserId.get(reward.referred_user_id) || 0) + points
        );
      }
    }

    const totalEarnedPoints = rewards
      .filter((reward) => reward.status !== "cancelled")
      .reduce((sum, reward) => sum + toNumber(reward.reward_points), 0);

    const pendingPoints = withdrawals
      .filter((withdrawal) => withdrawal.status === "pending")
      .reduce((sum, withdrawal) => sum + toNumber(withdrawal.amount_points), 0);

    const withdrawnPoints = withdrawals
      .filter((withdrawal) => withdrawal.status === "paid")
      .reduce((sum, withdrawal) => sum + toNumber(withdrawal.amount_points), 0);

    const availablePoints = Math.max(
      Number((totalEarnedPoints - pendingPoints - withdrawnPoints).toFixed(2)),
      0
    );

    const invitedTraders = referrals.map((referral) => ({
      id: referral.id,
      referredUserId: referral.referred_user_id,
      email:
        userEmailById.get(referral.referred_user_id) ||
        `User ${String(referral.referred_user_id).slice(0, 8)}`,
      status: referral.status,
      createdAt: referral.created_at,
      totalEarnedPoints:
        earnedByReferralId.get(referral.id) ||
        earnedByUserId.get(referral.referred_user_id) ||
        0,
    }));

    const rewardHistory = rewards.map((reward) => ({
      id: reward.id,
      referredUserId: reward.referred_user_id,
      referredEmail:
        userEmailById.get(reward.referred_user_id) ||
        `User ${String(reward.referred_user_id).slice(0, 8)}`,
      paymentAmountUsd: toNumber(reward.payment_amount_usd),
      rewardPercent: toNumber(reward.reward_percent),
      rewardPoints: toNumber(reward.reward_points),
      rewardType: reward.reward_type,
      status: reward.status,
      createdAt: reward.created_at,
    }));

    const withdrawalHistory = withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      amountPoints: toNumber(withdrawal.amount_points),
      walletAddress: withdrawal.wallet_address,
      network: withdrawal.network,
      confirmationEmail: withdrawal.confirmation_email,
      status: withdrawal.status,
      adminNote: withdrawal.admin_note,
      createdAt: withdrawal.created_at,
      processedAt: withdrawal.processed_at,
    }));

    return NextResponse.json(
      {
        ok: true,
        dashboard: {
          referralCode,
          referralLink,
          summary: {
            total_earned_points: Number(totalEarnedPoints.toFixed(2)),
            available_points: availablePoints,
            pending_points: Number(pendingPoints.toFixed(2)),
            withdrawn_points: Number(withdrawnPoints.toFixed(2)),
            referral_count: invitedTraders.length,
            withdrawal_threshold: 75,
          },
          invitedTraders,
          rewardHistory,
          withdrawalHistory,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load referral dashboard",
      },
      { status: 500 }
    );
  }
}