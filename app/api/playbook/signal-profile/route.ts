import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type LinkedTradeRow = {
  id: string;
  user_id: string;
  market: string | null;
  direction: string | null;
  result: string | null;
  pnl: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  source_alert_id: string | null;
  source_setup_slug: string | null;
  source_setup_name: string | null;
  alert_entry_zone_min: number | null;
  alert_entry_zone_max: number | null;
  alert_stop_price: number | null;
  created_at: string;
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

async function getUserPlan(userId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_id, status, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const expiresAt = data?.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt ? expiresAt < Date.now() : false;

  if (!data || isExpired) return "core";

  return normalizePlanId(data.plan_id);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function getPlanAdherence(trade: LinkedTradeRow) {
  let score = 45;

  const entry = toNumber(trade.entry_price);
  const entryMin = toNumber(trade.alert_entry_zone_min);
  const entryMax = toNumber(trade.alert_entry_zone_max);
  const stop = toNumber(trade.stop_loss);
  const plannedStop = toNumber(trade.alert_stop_price);

  if (entry !== null && entryMin !== null && entryMax !== null) {
    const low = Math.min(entryMin, entryMax);
    const high = Math.max(entryMin, entryMax);

    if (entry >= low && entry <= high) {
      score += 30;
    } else {
      score -= 10;
    }
  }

  if (stop !== null && plannedStop !== null && plannedStop > 0) {
    const diffPercent = (Math.abs(stop - plannedStop) / plannedStop) * 100;

    if (diffPercent <= 0.75) {
      score += 20;
    } else {
      score -= 10;
    }
  }

  if (trade.result === "win") score += 10;
  if (trade.result === "loss") score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getProfileLabel(params: {
  tradesCount: number;
  winRate: number | null;
  totalPnl: number;
  avgAdherence: number | null;
}) {
  if (params.tradesCount < 3) return "learning";

  if (
    params.winRate !== null &&
    params.winRate >= 60 &&
    params.totalPnl > 0 &&
    (params.avgAdherence || 0) >= 65
  ) {
    return "personal_strength";
  }

  if (
    params.winRate !== null &&
    params.winRate <= 40 &&
    params.totalPnl < 0
  ) {
    return "risk_zone";
  }

  return "neutral";
}

function buildAiNote(params: {
  setupName: string;
  tradesCount: number;
  winRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
  avgAdherence: number | null;
  profileLabel: string;
}) {
  if (params.profileLabel === "personal_strength") {
    return `${params.setupName} is currently a personal strength. The user executes this setup with positive PnL, acceptable plan adherence and a solid win rate. Future matching alerts can be prioritized.`;
  }

  if (params.profileLabel === "risk_zone") {
    return `${params.setupName} is currently a risk zone. The user has negative PnL or weak win rate on this setup. Future alerts should include stronger warnings and execution checklist.`;
  }

  if (params.profileLabel === "learning") {
    return `${params.setupName} needs more sample size. Keep collecting linked trades before making strong personalization decisions.`;
  }

  return `${params.setupName} is neutral so far. Continue tracking execution quality, PnL and plan adherence.`;
}

function calculateStrengthScore(params: {
  tradesCount: number;
  winRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
  avgAdherence: number | null;
}) {
  const sampleScore = Math.min(params.tradesCount * 8, 24);
  const winScore = params.winRate === null ? 0 : Math.min(params.winRate * 0.35, 28);
  const pnlScore =
    params.totalPnl > 0
      ? Math.min(params.totalPnl / 10, 22)
      : Math.max(params.totalPnl / 20, -20);
  const adherenceScore =
    params.avgAdherence === null ? 0 : Math.min(params.avgAdherence * 0.26, 26);

  return Math.max(
    0,
    Math.min(100, Math.round(sampleScore + winScore + pnlScore + adherenceScore))
  );
}

async function rebuildProfileForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select(
      [
        "id",
        "user_id",
        "market",
        "direction",
        "result",
        "pnl",
        "entry_price",
        "stop_loss",
        "source_alert_id",
        "source_setup_slug",
        "source_setup_name",
        "alert_entry_zone_min",
        "alert_entry_zone_max",
        "alert_stop_price",
        "created_at",
      ].join(",")
    )
    .eq("user_id", userId)
    .not("source_alert_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  const linkedTrades = (data || []) as unknown as LinkedTradeRow[];

  const groups = linkedTrades.reduce<
    Record<
      string,
      {
        setupSlug: string;
        setupName: string;
        assetType: string | null;
        direction: string | null;
        trades: LinkedTradeRow[];
      }
    >
  >((acc, trade) => {
    const setupSlug =
      trade.source_setup_slug || trade.source_setup_name || "unknown-ai-signal";

    if (!acc[setupSlug]) {
      acc[setupSlug] = {
        setupSlug,
        setupName: trade.source_setup_name || setupSlug,
        assetType: trade.market,
        direction: trade.direction,
        trades: [],
      };
    }

    acc[setupSlug].trades.push(trade);

    return acc;
  }, {});

  const profiles = Object.values(groups).map((group) => {
    const pnlValues = group.trades
      .map((trade) => trade.pnl)
      .filter((pnl): pnl is number => typeof pnl === "number");

    const tradesCount = group.trades.length;
    const winsCount = group.trades.filter((trade) => trade.result === "win").length;
    const lossesCount = group.trades.filter(
      (trade) => trade.result === "loss"
    ).length;

    const closedCount = winsCount + lossesCount;

    const winRate =
      closedCount > 0 ? Number(((winsCount / closedCount) * 100).toFixed(2)) : null;

    const totalPnl = pnlValues.reduce((sum, value) => sum + value, 0);
    const avgPnl =
      pnlValues.length > 0
        ? Number((totalPnl / pnlValues.length).toFixed(2))
        : null;

    const bestPnl = pnlValues.length > 0 ? Math.max(...pnlValues) : null;
    const worstPnl = pnlValues.length > 0 ? Math.min(...pnlValues) : null;

    const adherenceValues = group.trades.map((trade) => getPlanAdherence(trade));

    const avgAdherence =
      adherenceValues.length > 0
        ? Number(
            (
              adherenceValues.reduce((sum, value) => sum + value, 0) /
              adherenceValues.length
            ).toFixed(2)
          )
        : null;

    const profileLabel = getProfileLabel({
      tradesCount,
      winRate,
      totalPnl,
      avgAdherence,
    });

    const strengthScore = calculateStrengthScore({
      tradesCount,
      winRate,
      totalPnl,
      avgPnl,
      avgAdherence,
    });

    return {
      user_id: userId,
      setup_slug: group.setupSlug,
      setup_name: group.setupName,
      asset_type: group.assetType,
      direction: group.direction,

      trades_count: tradesCount,
      wins_count: winsCount,
      losses_count: lossesCount,
      win_rate: winRate,
      total_pnl: Number(totalPnl.toFixed(2)),
      avg_pnl: avgPnl,
      best_pnl: bestPnl,
      worst_pnl: worstPnl,

      avg_plan_adherence: avgAdherence,
      strength_score: strengthScore,
      profile_label: profileLabel,
      ai_note: buildAiNote({
        setupName: group.setupName,
        tradesCount,
        winRate,
        totalPnl,
        avgPnl,
        avgAdherence,
        profileLabel,
      }),

      last_trade_at: group.trades[0]?.created_at || null,
      updated_at: new Date().toISOString(),
    };
  });

  if (profiles.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("user_signal_profiles")
      .upsert(profiles, {
        onConflict: "user_id,setup_slug",
      });

    if (upsertError) {
      throw upsertError;
    }
  }

  return profiles;
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "social_tickers")) {
      return NextResponse.json(
        {
          error: "Personal Signal Profile is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_signal_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("strength_score", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to load personal signal profile:", error);

      return NextResponse.json(
        { error: "Failed to load personal signal profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "personal_signal_profile",
      count: data?.length || 0,
      items: data || [],
    });
  } catch (error) {
    console.error("Personal signal profile GET error:", error);

    return NextResponse.json(
      { error: "Failed to load personal signal profile." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "social_tickers")) {
      return NextResponse.json(
        {
          error: "Personal Signal Profile is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const profiles = await rebuildProfileForUser(user.id);

    return NextResponse.json({
      source: "personal_signal_profile_rebuild",
      rebuiltAt: new Date().toISOString(),
      count: profiles.length,
      items: profiles,
    });
  } catch (error) {
    console.error("Personal signal profile rebuild error:", error);

    return NextResponse.json(
      { error: "Failed to rebuild personal signal profile." },
      { status: 500 }
    );
  }
}