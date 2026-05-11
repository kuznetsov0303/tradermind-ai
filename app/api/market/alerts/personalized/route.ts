import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";

export const runtime = "nodejs";

type MarketAlertRow = {
  id: string;
  user_id: string | null;
  setup_slug: string | null;
  setup_name: string | null;
  setup_type?: string | null;
  symbol: string;
  title?: string | null;
  reason?: string | null;
  scenario?: string | null;
  risk_note?: string | null;
  trigger_label?: string | null;
  lesson_summary?: string | null;
  asset_type?: string | null;
  exchange?: string | null;
  direction?: string | null;
  score?: number | null;
  confidence_score?: number | null;
  created_at?: string | null;
  is_new?: boolean | null;
 viewed_at?: string | null;
  [key: string]: unknown;
};

type SignalProfileRow = {
  setup_slug: string;
  setup_name: string;
  profile_label: string;
  strength_score: number;
  win_rate: number | null;
  total_pnl: number | null;
  avg_plan_adherence: number | null;
  ai_note: string | null;
};

type TradePatternProfileRow = {
  pattern_slug: string;
  pattern_name: string;
  market: string | null;
  direction: string | null;
  matching_keywords: unknown;
  profile_label: string;
  strength_score: number;
  total_pnl: number | null;
  avg_pnl: number | null;
  ai_note: string | null;
};

type UserAlertStateRow = {
  alert_id: string;
  is_new: boolean | null;
  viewed_at: string | null;
  decision: string | null;
  decision_note: string | null;
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

function buildPersonalization(alert: MarketAlertRow, profile?: SignalProfileRow) {
  if (!profile) {
    return {
      personalization_label: null,
      personalization_type: null,
      personalization_note: null,
      personal_strength_score: null,
      personal_win_rate: null,
      personal_total_pnl: null,
      personal_plan_adherence: null,
    };
  }

  if (profile.profile_label === "personal_strength") {
    return {
      personalization_label: "Matches your profitable setup profile",
      personalization_type: "strength",
      personalization_note:
        profile.ai_note ||
        "This alert matches a setup that has been positive in your journal history.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  if (profile.profile_label === "risk_zone") {
    return {
      personalization_label: "Warning: historically weak setup for you",
      personalization_type: "risk",
      personalization_note:
        profile.ai_note ||
        "This setup has been weak in your journal history. Wait for stronger confirmation.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  if (profile.profile_label === "learning") {
    return {
      personalization_label: "Learning setup — more sample needed",
      personalization_type: "learning",
      personalization_note:
        profile.ai_note ||
        "SkillEdge AI is still collecting enough trades to personalize this setup.",
      personal_strength_score: profile.strength_score,
      personal_win_rate: profile.win_rate,
      personal_total_pnl: profile.total_pnl,
      personal_plan_adherence: profile.avg_plan_adherence,
    };
  }

  return {
    personalization_label: "Tracked in your signal profile",
    personalization_type: "neutral",
    personalization_note:
      profile.ai_note ||
      "This setup exists in your signal profile, but there is no strong edge label yet.",
    personal_strength_score: profile.strength_score,
    personal_win_rate: profile.win_rate,
    personal_total_pnl: profile.total_pnl,
    personal_plan_adherence: profile.avg_plan_adherence,
  };
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function getAlertMarket(alert: MarketAlertRow) {
  const assetType = normalizeText(alert.asset_type);
  const exchange = normalizeText(alert.exchange);

  if (assetType === "crypto" || exchange === "binance") return "crypto";

  return "stocks";
}

function getAlertDirection(alert: MarketAlertRow) {
  const direction = normalizeText(alert.direction);

  if (direction === "downside") return "short";
  if (direction === "upside") return "long";

  return direction || "neutral";
}

function getAlertSearchText(alert: MarketAlertRow) {
  return [
    alert.symbol,
    alert.setup_slug,
    alert.setup_name,
    alert.setup_type,
    alert.title,
    alert.reason,
    alert.scenario,
    alert.risk_note,
    alert.trigger_label,
    alert.lesson_summary,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
}

function buildJournalPatternMatch(
  alert: MarketAlertRow,
  patterns: TradePatternProfileRow[]
) {
  const alertMarket = getAlertMarket(alert);
  const alertDirection = getAlertDirection(alert);
  const alertText = getAlertSearchText(alert);

  const scoredPatterns = patterns
    .map((pattern) => {
      const keywords = safeStringArray(pattern.matching_keywords);
      const matchedKeywords = keywords.filter((keyword) =>
        alertText.includes(keyword.toLowerCase())
      );

      const marketMatch =
        !pattern.market || pattern.market === alertMarket ? 35 : 0;

      const directionMatch =
        !pattern.direction ||
        alertDirection === "neutral" ||
        pattern.direction === alertDirection
          ? 30
          : 0;

      const keywordScore = Math.min(matchedKeywords.length * 8, 24);
      const strengthScore = Math.min((pattern.strength_score || 0) * 0.08, 8);
      const pnlScore = Number(pattern.total_pnl || 0) > 0 ? 8 : 0;

      const matchScore = Math.round(
        marketMatch + directionMatch + keywordScore + strengthScore + pnlScore
      );

      return {
        pattern,
        matchedKeywords,
        matchScore,
      };
    })
    .filter((item) => item.matchScore >= 60)
    .sort((a, b) => b.matchScore - a.matchScore);

  const bestMatch = scoredPatterns[0];

  if (!bestMatch) {
    return {
      journal_pattern_label: null,
      journal_pattern_type: null,
      journal_pattern_note: null,
      journal_pattern_name: null,
      journal_pattern_match_score: null,
      journal_pattern_strength_score: null,
      journal_pattern_total_pnl: null,
      journal_pattern_avg_pnl: null,
      journal_pattern_keywords: [],
    };
  }

  const isStrong =
    bestMatch.pattern.profile_label === "personal_strength_candidate" &&
    Number(bestMatch.pattern.total_pnl || 0) > 0;

  return {
    journal_pattern_label: isStrong
      ? "Similar to your winning journal pattern"
      : "Similar to your journal pattern candidate",
    journal_pattern_type: isStrong ? "journal_strength" : "journal_learning",
    journal_pattern_note:
      bestMatch.pattern.ai_note ||
      "This alert has similarities with your independent profitable journal trades.",
    journal_pattern_name: bestMatch.pattern.pattern_name,
    journal_pattern_match_score: bestMatch.matchScore,
    journal_pattern_strength_score: bestMatch.pattern.strength_score,
    journal_pattern_total_pnl: bestMatch.pattern.total_pnl,
    journal_pattern_avg_pnl: bestMatch.pattern.avg_pnl,
    journal_pattern_keywords: bestMatch.matchedKeywords,
  };
}

function buildPersonalPriority(
  alert: MarketAlertRow,
  personalization: Record<string, unknown>,
  journalPatternMatch: Record<string, unknown>
) {
  const baseScore = Math.max(
    toNumber(alert.confidence_score),
    toNumber(alert.score)
  );

  let priorityScore = baseScore;
  const reasons: string[] = [];

  const personalizationType =
    typeof personalization.personalization_type === "string"
      ? personalization.personalization_type
      : null;

  const journalPatternType =
    typeof journalPatternMatch.journal_pattern_type === "string"
      ? journalPatternMatch.journal_pattern_type
      : null;

  if (personalizationType === "strength") {
    priorityScore += 10;
    reasons.push("matches personal AI signal strength");
  }

  if (personalizationType === "risk") {
    priorityScore -= 8;
    reasons.push("matches historically weak AI setup");
  }

  if (personalizationType === "learning") {
    priorityScore += 2;
    reasons.push("tracked learning setup");
  }

  if (journalPatternType === "journal_strength") {
    priorityScore += 12;
    reasons.push("similar to winning independent journal pattern");
  }

  if (journalPatternType === "journal_learning") {
    priorityScore += 4;
    reasons.push("similar to early journal pattern candidate");
  }

  const personalWinRate = toNumber(personalization.personal_win_rate, 0);
  const journalMatchScore = toNumber(
    journalPatternMatch.journal_pattern_match_score,
    0
  );

  if (personalWinRate >= 60) {
    priorityScore += 4;
    reasons.push("personal win rate above 60%");
  }

  if (journalMatchScore >= 75) {
    priorityScore += 4;
    reasons.push("strong journal pattern match score");
  }

  priorityScore = Math.max(0, Math.min(100, Math.round(priorityScore)));

  const priorityType =
    personalizationType === "risk"
      ? "caution"
      : priorityScore >= 88
        ? "priority"
        : priorityScore >= 75
          ? "watch"
          : "neutral";

  const priorityLabel =
    priorityType === "priority"
      ? "High-priority personal alert"
      : priorityType === "caution"
        ? "Personal caution alert"
        : priorityType === "watch"
          ? "Personal watch alert"
          : "Standard alert";

  return {
    personal_priority_score: priorityScore,
    personal_priority_type: priorityType,
    personal_priority_label: priorityLabel,
    personal_priority_reason:
      reasons.length > 0
        ? reasons.join(" · ")
        : "No strong personal match yet. Standard alert priority.",
  };
}

function buildSignalMode(
  alert: MarketAlertRow,
  personalPriority: Record<string, unknown>
) {
  const priorityScore = toNumber(personalPriority.personal_priority_score);
  const baseConfidence = Math.max(
    toNumber(alert.confidence_score),
    toNumber(alert.score)
  );

  const priorityType =
    typeof personalPriority.personal_priority_type === "string"
      ? personalPriority.personal_priority_type
      : "";

  if (priorityType === "caution") {
    return {
      signal_mode: "caution",
      signal_mode_label: "Caution signal",
      signal_mode_note:
        "This alert has a personal or setup-based warning. Do not trade without stronger confirmation.",
    };
  }

  if (priorityScore >= 85 && baseConfidence >= 75) {
    return {
      signal_mode: "actionable",
      signal_mode_label: "Actionable after confirmation",
      signal_mode_note:
        "This is a high-priority alert. It still requires trigger confirmation, valid risk/reward and disciplined execution.",
    };
  }

  if (priorityScore >= 70 || baseConfidence >= 70) {
    return {
      signal_mode: "watchlist",
      signal_mode_label: "Setup forming",
      signal_mode_note:
        "This setup is worth watching, but it is not a full actionable signal until confirmation appears.",
    };
  }

  return {
    signal_mode: "monitoring",
    signal_mode_label: "Monitoring only",
    signal_mode_note:
      "SkillEdge AI is tracking this ticker, but the signal quality is not high enough for an actionable alert yet.",
  };
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
          error: "Personalized alerts are available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || "20")));
    const period = searchParams.get("period") || "active";

    const alertsQuery = supabaseAdmin
      .from("market_alerts")
      .select("*")
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (period === "7d") {
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      alertsQuery.gte("created_at", sevenDaysAgo);
    } else {
      alertsQuery
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("score", { ascending: false });
    }

    const [alertsResult, profilesResult, tradePatternsResult] = await Promise.all([
  alertsQuery,
  supabaseAdmin
    .from("user_signal_profiles")
    .select(
      "setup_slug,setup_name,profile_label,strength_score,win_rate,total_pnl,avg_plan_adherence,ai_note"
    )
    .eq("user_id", user.id),
  supabaseAdmin
    .from("user_trade_pattern_profiles")
    .select(
      "pattern_slug,pattern_name,market,direction,matching_keywords,profile_label,strength_score,total_pnl,avg_pnl,ai_note"
    )
    .eq("user_id", user.id)
    .order("strength_score", { ascending: false })
    .limit(50),
]);

    if (alertsResult.error) {
      console.error("Failed to load personalized alerts:", alertsResult.error);

      return NextResponse.json(
        { error: "Failed to load personalized alerts." },
        { status: 500 }
      );
    }

    const alertRows = (alertsResult.data || []) as unknown as MarketAlertRow[];

const alertIds = alertRows
  .map((alert) => alert.id)
  .filter((id): id is string => typeof id === "string" && id.length > 0);

const statesResult =
  alertIds.length > 0
    ? await supabaseAdmin
        .from("user_market_alert_states")
        .select("alert_id,is_new,viewed_at,decision,decision_note")
        .eq("user_id", user.id)
        .in("alert_id", alertIds)
    : { data: [], error: null };

if (statesResult.error) {
  console.error("Failed to load user alert states:", statesResult.error);
}

const alertStates = ((statesResult.data || []) as unknown as UserAlertStateRow[]).reduce<
  Record<string, UserAlertStateRow>
>((acc, state) => {
  acc[state.alert_id] = state;
  return acc;
}, {});

    if (profilesResult.error) {
      console.error("Failed to load signal profiles for alerts:", profilesResult.error);
    }

if (tradePatternsResult.error) {
  console.error(
    "Failed to load trade pattern profiles for alerts:",
    tradePatternsResult.error
  );
}

    const profiles = ((profilesResult.data || []) as unknown as SignalProfileRow[]).reduce<
  Record<string, SignalProfileRow>
>((acc, profile) => {
  acc[profile.setup_slug] = profile;
  return acc;
}, {});

const tradePatterns =
  (tradePatternsResult.data || []) as unknown as TradePatternProfileRow[];

const items = alertRows
  .map((alert) => {
    const setupSlug =
      typeof alert.setup_slug === "string" ? alert.setup_slug : "";

    const personalization = buildPersonalization(alert, profiles[setupSlug]);
const journalPatternMatch = buildJournalPatternMatch(alert, tradePatterns);
const personalPriority = buildPersonalPriority(
  alert,
  personalization,
  journalPatternMatch
);
const signalMode = buildSignalMode(alert, personalPriority);

const userState = alertStates[alert.id];

return {
  ...alert,
  is_new: userState ? userState.is_new : alert.is_new ?? true,
  viewed_at: userState ? userState.viewed_at : alert.viewed_at ?? null,
  user_alert_decision: userState ? userState.decision : null,
  user_alert_decision_note: userState ? userState.decision_note : null,
  ...personalization,
  ...journalPatternMatch,
  ...personalPriority,
  ...signalMode,
};
  })
  .sort((a, b) => {
  const priorityDiff =
    toNumber(b.personal_priority_score) -
    toNumber(a.personal_priority_score);

  if (priorityDiff !== 0) return priorityDiff;

  const bCreatedAt =
    typeof b.created_at === "string" ? b.created_at : "1970-01-01T00:00:00.000Z";

  const aCreatedAt =
    typeof a.created_at === "string" ? a.created_at : "1970-01-01T00:00:00.000Z";

  return new Date(bCreatedAt).getTime() - new Date(aCreatedAt).getTime();
});

    return NextResponse.json({
      source: "personalized_market_alerts",
      period,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("Personalized alerts route error:", error);

    return NextResponse.json(
      { error: "Failed to load personalized alerts." },
      { status: 500 }
    );
  }
}