import { NextRequest, NextResponse } from "next/server";
import { fetchStockEngineJson } from "@/lib/stockEngineProxy";
import { getUsEquityMarketSession } from "@/lib/marketSession";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.toString();
    const payload = await fetchStockEngineJson(
      `/engine/cockpit${query ? `?${query}` : ""}`,
    );

    const marketSession = getUsEquityMarketSession();

    if (payload && typeof payload === "object") {
      const value = (payload as any).value || {};
      value.marketSession = marketSession;

      if (!marketSession.liveEngineAllowed) {
        value.liveTradingGuard = {
          version: "s8_4a_market_holiday_guard_v1",
          state: marketSession.marketState,
          reason: marketSession.reason,
          liveSignalsAllowed: false,
          copy:
            marketSession.marketState === "MARKET_CLOSED_HOLIDAY"
              ? `US equities are closed for ${marketSession.holidayName}. Cockpit data may be cached; no live stock signals should be treated as actionable.`
              : "US equities are not in an active live-trading window. Cockpit data may be cached; no live stock signals should be treated as actionable.",
        };
      }

      (payload as any).value = value;
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Stock engine cockpit unavailable.",
        marketSession: getUsEquityMarketSession(),
      },
      { status: 502 },
    );
  }
}
