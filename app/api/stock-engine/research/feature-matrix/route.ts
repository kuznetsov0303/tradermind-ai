import { NextRequest } from "next/server";

import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();

  return proxyStockEngine(
    `/engine/research/feature-matrix${query ? `?${query}` : ""}`,
    request,
  );
}
