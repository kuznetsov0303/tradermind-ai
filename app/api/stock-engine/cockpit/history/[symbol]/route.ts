import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const STOCK_ENGINE_BASE_URL = (
  process.env.STOCK_ENGINE_API_URL ||
  process.env.STOCK_ENGINE_URL ||
  process.env.NEXT_PUBLIC_STOCK_ENGINE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

function clampNumber(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { symbol: rawSymbol } = await context.params;
  const symbol = String(rawSymbol || "").trim().toUpperCase();
  const url = new URL(request.url);
  const days = clampNumber(url.searchParams.get("days"), 3, 1, 5);
  const limit = clampNumber(url.searchParams.get("limit"), 2500, 100, 2500);
  const interval = String(url.searchParams.get("interval") || "5min").trim() || "5min";
  const extended = String(url.searchParams.get("extended") || "true").toLowerCase() !== "false";
  const session = String(url.searchParams.get("session") || "all").trim() || "all";
  const rawProvider = String(url.searchParams.get("provider") || "auto").toLowerCase().trim();
  const provider = ["auto", "fmp", "polygon", "massive"].includes(rawProvider) ? rawProvider : "auto";

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol_required" }, { status: 400 });
  }

  const target = `${STOCK_ENGINE_BASE_URL}/engine/cockpit/history/${encodeURIComponent(symbol)}?days=${days}&interval=${encodeURIComponent(interval)}&limit=${limit}&extended=${extended ? "true" : "false"}&session=${encodeURIComponent(session)}&provider=${encodeURIComponent(provider)}`;

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const text = await response.text();
    let payload: any = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = {
        ok: false,
        error: text || "Stock engine returned a non-JSON response.",
      };
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "stock_engine_history_proxy_failed",
        stockEngineBaseUrl: STOCK_ENGINE_BASE_URL,
      },
      { status: 502 },
    );
  }
}
