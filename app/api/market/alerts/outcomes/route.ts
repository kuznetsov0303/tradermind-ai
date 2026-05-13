import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";

export const runtime = "nodejs";

type MarketAlertRow = {
  id: string;
  user_id: string | null;
  plan_id: string;
  symbol: string;
  direction: string;
  entry_zone_min: number | null;
  entry_zone_max: number | null;
  stop_price: number | null;
  target_1: number | null;
  target_2: number | null;
  target_3: number | null;
  outcome_status: string;
  status: string;
  source_data: Record<string, unknown> | null;
  created_at: string;
};

type MarketSnapshotRow = {
  symbol: string;
  price: number | null;
  scanned_at: string | null;
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

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function getInitialPrice(alert: MarketAlertRow) {
  const sourceData = alert.source_data || {};
  const market = sourceData.market as Record<string, unknown> | undefined;

  return toNumber(market?.price);
}

function getEntryReference(alert: MarketAlertRow) {
  if (alert.entry_zone_min && alert.entry_zone_max) {
    return (Number(alert.entry_zone_min) + Number(alert.entry_zone_max)) / 2;
  }

  if (alert.entry_zone_min) return Number(alert.entry_zone_min);
  if (alert.entry_zone_max) return Number(alert.entry_zone_max);

  return getInitialPrice(alert);
}

function getMinutesBetween(startIso: string, endIso: string | null | undefined) {
  if (!endIso) return null;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return Math.max(0, Math.round((end - start) / 60000));
}

function roundPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;

  return Number(value.toFixed(2));
}

function analyzeAlertOutcome(
  alert: MarketAlertRow,
  snapshots: MarketSnapshotRow[]
) {
  const entry = getEntryReference(alert);

  if (!entry || entry <= 0) {
    return {
      outcome_status: "neutral",
      mfe: null,
      mae: null,
      hit_target: null,
      hit_stop: false,
      time_to_target_minutes: null,
      status: "expired",
    };
  }

  const direction = alert.direction === "downside" ? "short" : "long";

  const pricePath = snapshots
    .filter((snapshot) => {
      const price = toNumber(snapshot.price);
      const scannedAt = snapshot.scanned_at
        ? new Date(snapshot.scanned_at).getTime()
        : 0;

      return (
        normalizeSymbol(snapshot.symbol) === normalizeSymbol(alert.symbol) &&
        price !== null &&
        scannedAt >= new Date(alert.created_at).getTime()
      );
    })
    .map((snapshot) => ({
      price: Number(snapshot.price),
      scannedAt: snapshot.scanned_at || alert.created_at,
    }))
    .sort(
      (a, b) =>
        new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime()
    );

  if (pricePath.length === 0) {
    const ageMinutes = getMinutesBetween(alert.created_at, new Date().toISOString()) || 0;

    return {
      outcome_status: ageMinutes > 180 ? "neutral" : "pending",
      mfe: null,
      mae: null,
      hit_target: null,
      hit_stop: false,
      time_to_target_minutes: null,
      status: ageMinutes > 180 ? "expired" : alert.status,
    };
  }

  let bestMove = -Infinity;
  let worstMove = Infinity;

  let firstTarget: "TP1" | "TP2" | "TP3" | null = null;
  let firstTargetAt: string | null = null;
  let firstStopAt: string | null = null;

  for (const point of pricePath) {
    const movePercent =
      direction === "short"
        ? ((entry - point.price) / entry) * 100
        : ((point.price - entry) / entry) * 100;

    bestMove = Math.max(bestMove, movePercent);
    worstMove = Math.min(worstMove, movePercent);

    const target1Hit =
      alert.target_1 !== null &&
      (direction === "short"
        ? point.price <= Number(alert.target_1)
        : point.price >= Number(alert.target_1));

    const target2Hit =
      alert.target_2 !== null &&
      (direction === "short"
        ? point.price <= Number(alert.target_2)
        : point.price >= Number(alert.target_2));

    const target3Hit =
      alert.target_3 !== null &&
      (direction === "short"
        ? point.price <= Number(alert.target_3)
        : point.price >= Number(alert.target_3));

    const stopHit =
      alert.stop_price !== null &&
      (direction === "short"
        ? point.price >= Number(alert.stop_price)
        : point.price <= Number(alert.stop_price));

    if (!firstTarget && target1Hit) {
      firstTarget = "TP1";
      firstTargetAt = point.scannedAt;
    }

    if (target2Hit) {
      firstTarget = "TP2";
      firstTargetAt = firstTargetAt || point.scannedAt;
    }

    if (target3Hit) {
      firstTarget = "TP3";
      firstTargetAt = firstTargetAt || point.scannedAt;
    }

    if (!firstStopAt && stopHit) {
      firstStopAt = point.scannedAt;
    }
  }

  const firstTargetTime = firstTargetAt
    ? new Date(firstTargetAt).getTime()
    : null;

  const firstStopTime = firstStopAt ? new Date(firstStopAt).getTime() : null;

  let outcomeStatus: "pending" | "worked" | "failed" | "neutral" = "pending";

  if (
    firstStopTime &&
    (!firstTargetTime || firstStopTime <= firstTargetTime)
  ) {
    outcomeStatus = "failed";
  } else if (firstTargetTime) {
    outcomeStatus = "worked";
  } else {
    const ageMinutes = getMinutesBetween(alert.created_at, new Date().toISOString()) || 0;
    outcomeStatus = ageMinutes > 180 ? "neutral" : "pending";
  }

  return {
    outcome_status: outcomeStatus,
    mfe: roundPercent(bestMove === -Infinity ? null : bestMove),
    mae: roundPercent(worstMove === Infinity ? null : worstMove),
    hit_target: firstTarget,
    hit_stop: Boolean(firstStopAt),
    time_to_target_minutes: firstTargetAt
      ? getMinutesBetween(alert.created_at, firstTargetAt)
      : null,
    status: outcomeStatus === "pending" ? alert.status : "expired",
  };
}

export async function POST(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_alerts", {
    rateLimit: {
      limit: 30,
      windowMs: 60_000,
    },
  });

  if (!gate.ok) return gate.response;
  try {
    const user = await getRequestUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const planId = await getUserPlan(user.id);

    if (!canUseFeature(planId, "social_tickers")) {
      return NextResponse.json(
        {
          error: "Outcome tracking is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: alertsData, error: alertsError } = await supabaseAdmin
      .from("market_alerts")
      .select(
        "id,user_id,plan_id,symbol,direction,entry_zone_min,entry_zone_max,stop_price,target_1,target_2,target_3,outcome_status,status,source_data,created_at"
      )
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .eq("outcome_status", "pending")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    if (alertsError) {
      console.error("Failed to load pending alerts:", alertsError);

      return NextResponse.json(
        { error: "Failed to load pending alerts." },
        { status: 500 }
      );
    }

    const alerts = (alertsData || []) as MarketAlertRow[];

    if (alerts.length === 0) {
      return NextResponse.json({
        source: "market_alert_outcome_checker",
        checkedAt: new Date().toISOString(),
        checked: 0,
        updated: 0,
        items: [],
      });
    }

    const symbols = Array.from(
      new Set(alerts.map((alert) => normalizeSymbol(alert.symbol)).filter(Boolean))
    );

    const oldestAlertTime = alerts.reduce((oldest, alert) => {
      const current = new Date(alert.created_at).getTime();
      return current < oldest ? current : oldest;
    }, Date.now());

    const { data: snapshotsData, error: snapshotsError } = await supabaseAdmin
      .from("market_scanner_snapshots")
      .select("symbol,price,scanned_at")
      .in("symbol", symbols)
      .gte("scanned_at", new Date(oldestAlertTime).toISOString())
      .order("scanned_at", { ascending: true })
      .limit(3000);

    if (snapshotsError) {
      console.error("Failed to load market snapshots for outcomes:", snapshotsError);

      return NextResponse.json(
        { error: "Failed to load market snapshots for outcomes." },
        { status: 500 }
      );
    }

    const snapshots = (snapshotsData || []) as MarketSnapshotRow[];

    const updates = alerts.map((alert) => {
      const outcome = analyzeAlertOutcome(alert, snapshots);

      return {
        id: alert.id,
        outcome_checked_at: new Date().toISOString(),
        outcome_status: outcome.outcome_status,
        mfe: outcome.mfe,
        mae: outcome.mae,
        hit_target: outcome.hit_target,
        hit_stop: outcome.hit_stop,
        time_to_target_minutes: outcome.time_to_target_minutes,
        status: outcome.status,
      };
    });

    const changedUpdates = updates.filter((update) => {
      return update.outcome_status !== "pending" || update.mfe !== null || update.mae !== null;
    });

    if (changedUpdates.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("market_alerts")
        .upsert(changedUpdates, { onConflict: "id" });

      if (updateError) {
        console.error("Failed to update alert outcomes:", updateError);

        return NextResponse.json(
          { error: "Failed to update alert outcomes." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      source: "market_alert_outcome_checker",
      checkedAt: new Date().toISOString(),
      checked: alerts.length,
      updated: changedUpdates.length,
      items: changedUpdates,
    });
  } catch (error) {
    console.error("Market alert outcome checker error:", error);

    return NextResponse.json(
      { error: "Failed to check alert outcomes." },
      { status: 500 }
    );
  }
}