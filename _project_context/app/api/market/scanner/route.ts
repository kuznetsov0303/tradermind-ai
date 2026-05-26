import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canUseFeature, normalizePlanId } from "@/lib/plan-limits";
import { requireFeatureAccess } from "@/lib/security/feature-gate";
import {
  getSkillEdgeScannerCacheSeconds,
  loadSkillEdgeMarketScannerData,
  type SkillEdgeScannerItem,
} from "@/lib/trading/market-data-stack";

export const runtime = "nodejs";

type MarketScannerRow = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  asset_type?: string | null;
  scan_bucket?: string | null;
  direction_bias?: string | null;
  price?: number | null;
  change_percent?: number | null;
  gap_percent?: number | null;
  volume?: number | null;
  relative_volume?: number | null;
  mentions?: number | null;
  mention_velocity?: number | null;
  sentiment?: string | null;
  catalyst?: string | null;
  risk_label?: string | null;
  opportunity_score?: number | null;
  raw_data?: Record<string, unknown> | null;
  source?: string | null;
  scanned_at?: string | null;
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

function toDbRows(items: SkillEdgeScannerItem[], scannedAt: string) {
  return items.map((item) => ({
    symbol: item.symbol,
    exchange: item.exchange,
    name: item.name,
    asset_type: item.asset_type,
    scan_bucket: item.scan_bucket,
    direction_bias: item.direction_bias,
    price: item.price,
    change_percent: item.change_percent,
    gap_percent: item.gap_percent,
    volume: item.volume,
    relative_volume: item.relative_volume,
    mentions: item.mentions,
    mention_velocity: item.mention_velocity,
    sentiment: item.sentiment,
    catalyst: item.catalyst,
    risk_label: item.risk_label,
    opportunity_score: item.opportunity_score,
    source: item.source,
    raw_data: {
      ...(item.raw_data || {}),
      news_catalyst: item.news_catalyst || null,
      sourceCoverageNote:
        "Based on tracked data providers and SkillEdge backend cache. Not full internet or full market coverage.",
    },
    scanned_at: scannedAt,
  }));
}

async function loadCachedRows(cacheSeconds: number, limit = 180) {
  const since = new Date(Date.now() - cacheSeconds * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("market_scanner_snapshots")
    .select("*")
    .gte("scanned_at", since)
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Market scanner cache load error:", error);
    return [] as MarketScannerRow[];
  }

  return ((data || []) as MarketScannerRow[]).filter((row) =>
    normalizeSymbol(row.symbol || "")
  );
}

async function loadStaleFallbackRows(limit = 180) {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("market_scanner_snapshots")
    .select("*")
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false })
    .order("opportunity_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Market scanner stale fallback load error:", error);
    return [] as MarketScannerRow[];
  }

  return ((data || []) as MarketScannerRow[]).filter((row) =>
    normalizeSymbol(row.symbol || "")
  );
}

export async function GET(request: Request) {
  const gate = await requireFeatureAccess(request, "ai_scanner", {
    rateLimit: {
      limit: 60,
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
          error: "Market Intelligence Scanner is available on SkillEdge Edge and Elite.",
          locked: true,
        },
        { status: 403 }
      );
    }

    const cacheSeconds = getSkillEdgeScannerCacheSeconds();
    const cachedRows = await loadCachedRows(cacheSeconds);

    if (cachedRows.length > 0) {
      return NextResponse.json({
        source: "cache",
        cacheTtlSeconds: cacheSeconds,
        scannedAt: cachedRows[0]?.scanned_at,
        items: cachedRows,
        note:
          "Client refresh reads SkillEdge backend cache. Provider limits are protected by scanner TTL and rate budget.",
      });
    }

    const snapshot = await loadSkillEdgeMarketScannerData();
    const scannedAt = snapshot.generatedAt;
    const rows = toDbRows(snapshot.items, scannedAt);

    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("market_scanner_snapshots")
        .insert(rows);

      if (insertError) {
        console.error("Market scanner snapshot insert error:", insertError);
      }
    }

    if (rows.length === 0) {
      const fallbackRows = await loadStaleFallbackRows();

      if (fallbackRows.length > 0) {
        return NextResponse.json({
          source: "stale_cache",
          stale: true,
          cacheTtlSeconds: cacheSeconds,
          scannedAt: fallbackRows[0]?.scanned_at,
          providerStatuses: snapshot.providerStatuses,
          items: fallbackRows,
          warning:
            "Fresh providers returned no items. Showing latest cached SkillEdge market snapshot.",
        });
      }
    }

    return NextResponse.json({
      source: "fresh",
      cacheTtlSeconds: cacheSeconds,
      scannedAt,
      providerStatuses: snapshot.providerStatuses,
      items: rows,
      note:
        "Fresh SkillEdge scanner snapshot generated server-side. Clients read this cached snapshot until TTL expires.",
    });
  } catch (error) {
    console.error("Market scanner error:", error);

    const fallbackRows = await loadStaleFallbackRows();

    if (fallbackRows.length > 0) {
      return NextResponse.json({
        source: "stale_cache_after_error",
        stale: true,
        scannedAt: fallbackRows[0]?.scanned_at,
        items: fallbackRows,
        warning:
          "Provider refresh failed. Showing latest cached SkillEdge market snapshot.",
      });
    }

    return NextResponse.json(
      { error: "Failed to load market intelligence scanner." },
      { status: 500 }
    );
  }
}

