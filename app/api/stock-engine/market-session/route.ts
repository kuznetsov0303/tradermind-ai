import { NextResponse } from "next/server";
import { getUsEquityMarketSession } from "@/lib/marketSession";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    value: getUsEquityMarketSession(),
  });
}
