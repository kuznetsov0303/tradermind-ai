import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type IndependentTradeRow = {
  id: string;
  user_id: string;
  ticker: string;
  market: string | null;
  direction: string | null;
  result: string | null;
  pnl: number | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  setup: string | null;
  mistake: string | null;
  lesson: string | null;
  notes: string | null;
  trade_date: string | null;
  created_at: string;
  source_alert_id: string | null;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яёіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getPatternName(trade: IndependentTradeRow) {
  const setup = cleanText(trade.setup);

  if (setup) return setup.slice(0, 120);

  const direction = trade.direction || "trade";
  const market = trade.market || "market";

  return `${market} ${direction} winning pattern`;
}

function extractKeywords(trades: IndependentTradeRow[]) {
  const text = trades
    .map((trade) =>
      [
        trade.setup,
        trade.lesson,
        trade.notes,
        trade.mistake,
        trade.ticker,
        trade.market,
        trade.direction,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ")
    .toLowerCase();

  const words = text
    .replace(/[^a-zа-яёіїєґ0-9\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);

  const stopWords = new Set([
    "trade",
    "trading",
    "setup",
    "market",
    "long",
    "short",
    "entry",
    "exit",
    "with",
    "from",
    "this",
    "that",
    "когда",
    "если",
    "после",
    "сделка",
    "вход",
    "выход",
    "цена",
    "рынок",
  ]);

  const counts = words.reduce<Record<string, number>>((acc, word) => {
    if (stopWords.has(word)) return acc;

    acc[word] = (acc[word] || 0) + 1;

    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}

function calculateStopDistancePercent(trade: IndependentTradeRow) {
  if (
    typeof trade.entry_price !== "number" ||
    typeof trade.stop_loss !== "number" ||
    trade.entry_price <= 0
  ) {
    return null;
  }

  return Number(
  ((Math.abs(trade.entry_price - trade.stop_loss) / trade.entry_price) * 100).toFixed(2)
);
}
function getStrengthScore(params: {
  tradesCount: number;
  totalPnl: number;
  avgPnl: number | null;
  bestPnl: number | null;
}) {
  const sampleScore = Math.min(params.tradesCount * 12, 36);
  const pnlScore =
    params.totalPnl > 0
      ? Math.min(params.totalPnl / 8, 34)
      : Math.max(params.totalPnl / 20, -20);

  const avgScore =
    params.avgPnl !== null && params.avgPnl > 0
      ? Math.min(params.avgPnl / 5, 18)
      : 0;

  const bestScore =
    params.bestPnl !== null && params.bestPnl > 0
      ? Math.min(params.bestPnl / 12, 12)
      : 0;

  return Math.max(0, Math.min(100, Math.round(sampleScore + pnlScore + avgScore + bestScore)));
}

function buildAiNote(params: {
  patternName: string;
  tradesCount: number;
  totalPnl: number;
  avgPnl: number | null;
  market: string | null;
  direction: string | null;
}) {
  if (params.tradesCount >= 3 && params.totalPnl > 0) {
    return `${params.patternName} looks like a potential personal strength from independent journal trades. Future market situations matching this fingerprint should be considered for Personal AI Alerts.`;
  }

  return `${params.patternName} is an early pattern candidate. SkillEdge needs more independent journal trades before using it as a strong personalization signal.`;
}

async function rebuildTradePatternsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select(
      [
        "id",
        "user_id",
        "ticker",
        "market",
        "direction",
        "result",
        "pnl",
        "entry_price",
        "exit_price",
        "stop_loss",
        "setup",
        "mistake",
        "lesson",
        "notes",
        "trade_date",
        "created_at",
        "source_alert_id",
      ].join(",")
    )
    .eq("user_id", userId)
    .is("source_alert_id", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  const trades = (data || []) as unknown as IndependentTradeRow[];

  const winningTrades = trades.filter((trade) => {
    const pnl = typeof trade.pnl === "number" ? trade.pnl : 0;

    return trade.result === "win" || pnl > 0;
  });

  const groups = winningTrades.reduce<
    Record<
      string,
      {
        patternSlug: string;
        patternName: string;
        market: string | null;
        direction: string | null;
        trades: IndependentTradeRow[];
      }
    >
  >((acc, trade) => {
    const patternName = getPatternName(trade);
    const baseSlug = slugify(
      `${trade.market || "market"}-${trade.direction || "direction"}-${patternName}`
    );

    const patternSlug = baseSlug || `manual-pattern-${trade.id}`;

    if (!acc[patternSlug]) {
      acc[patternSlug] = {
        patternSlug,
        patternName,
        market: trade.market,
        direction: trade.direction,
        trades: [],
      };
    }

    acc[patternSlug].trades.push(trade);

    return acc;
  }, {});

  const profiles = Object.values(groups).map((group) => {
    const pnlValues = group.trades
      .map((trade) => trade.pnl)
      .filter((pnl): pnl is number => typeof pnl === "number");

    const entryValues = group.trades
      .map((trade) => trade.entry_price)
      .filter((entry): entry is number => typeof entry === "number");

    const stopDistances = group.trades
      .map((trade) => calculateStopDistancePercent(trade))
      .filter((value): value is number => typeof value === "number");

    const tradesCount = group.trades.length;
    const winsCount = group.trades.filter(
      (trade) => trade.result === "win" || (trade.pnl ?? 0) > 0
    ).length;

    const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);
    const avgPnl =
      pnlValues.length > 0 ? Number((totalPnl / pnlValues.length).toFixed(2)) : null;

    const bestPnl = pnlValues.length > 0 ? Math.max(...pnlValues) : null;

    const avgEntryPrice =
      entryValues.length > 0
        ? Number(
            (
              entryValues.reduce((sum, entry) => sum + entry, 0) / entryValues.length
            ).toFixed(4)
          )
        : null;

    const avgStopDistancePercent =
      stopDistances.length > 0
        ? Number(
            (
              stopDistances.reduce((sum, value) => sum + value, 0) /
              stopDistances.length
            ).toFixed(2)
          )
        : null;

    const exampleTickers = Array.from(
      new Set(group.trades.map((trade) => trade.ticker).filter(Boolean))
    ).slice(0, 8);

    const matchingKeywords = extractKeywords(group.trades);

    const strengthScore = getStrengthScore({
      tradesCount,
      totalPnl,
      avgPnl,
      bestPnl,
    });

    const profileLabel =
      tradesCount >= 3 && totalPnl > 0
        ? "personal_strength_candidate"
        : "learning_candidate";

    return {
      user_id: userId,
      pattern_slug: group.patternSlug,
      pattern_name: group.patternName,
      source: "independent_journal_trades",

      market: group.market,
      direction: group.direction,

      trades_count: tradesCount,
      wins_count: winsCount,
      total_pnl: Number(totalPnl.toFixed(2)),
      avg_pnl: avgPnl,
      best_pnl: bestPnl,
      avg_entry_price: avgEntryPrice,
      avg_stop_distance_percent: avgStopDistancePercent,

      example_tickers: exampleTickers,
      matching_keywords: matchingKeywords,
      pattern_fingerprint: {
        pattern_name: group.patternName,
        market: group.market,
        direction: group.direction,
        keywords: matchingKeywords,
        examples: group.trades.slice(0, 5).map((trade) => ({
          id: trade.id,
          ticker: trade.ticker,
          pnl: trade.pnl,
          setup: trade.setup,
          lesson: trade.lesson,
          notes: trade.notes,
          created_at: trade.created_at,
        })),
      },

      profile_label: profileLabel,
      strength_score: strengthScore,
      ai_note: buildAiNote({
        patternName: group.patternName,
        tradesCount,
        totalPnl,
        avgPnl,
        market: group.market,
        direction: group.direction,
      }),

      last_trade_at: group.trades[0]?.created_at || null,
      updated_at: new Date().toISOString(),
    };
  });

  if (profiles.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("user_trade_pattern_profiles")
      .upsert(profiles, {
        onConflict: "user_id,pattern_slug",
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
          error: "Trade Pattern Profiles are available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_trade_pattern_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("strength_score", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to load trade pattern profiles:", error);

      return NextResponse.json(
        { error: "Failed to load trade pattern profiles." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      source: "independent_trade_pattern_profiles",
      count: data?.length || 0,
      items: data || [],
    });
  } catch (error) {
    console.error("Trade pattern profiles GET error:", error);

    return NextResponse.json(
      { error: "Failed to load trade pattern profiles." },
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
          error: "Trade Pattern Profiles are available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const profiles = await rebuildTradePatternsForUser(user.id);

    return NextResponse.json({
      source: "independent_trade_pattern_profiles_rebuild",
      rebuiltAt: new Date().toISOString(),
      count: profiles.length,
      items: profiles,
    });
  } catch (error) {
    console.error("Trade pattern profiles rebuild error:", error);

    return NextResponse.json(
      { error: "Failed to rebuild trade pattern profiles." },
      { status: 500 }
    );
  }
}