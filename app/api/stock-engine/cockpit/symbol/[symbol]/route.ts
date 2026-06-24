import { NextRequest, NextResponse } from "next/server";
import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: any) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const params = await Promise.resolve(context?.params || {});
  const symbol = encodeURIComponent(String(params.symbol || "").trim().toUpperCase());

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol." }, { status: 400 });
  }

  return proxyStockEngine(
    `/engine/cockpit/symbol/${symbol}${query ? `?${query}` : ""}`,
  );
}
