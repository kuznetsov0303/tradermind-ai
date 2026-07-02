import { NextRequest } from "next/server";

import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();

  return proxyStockEngine(
    `/engine/research/live-feature-audit${query ? `?${query}` : ""}`,
    request,
  );
}
