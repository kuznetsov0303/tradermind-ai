import { NextRequest } from "next/server";

import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search || "";
  return proxyStockEngine(`/engine/research/readiness${search}`, {
    method: "GET",
    cache: "no-store",
  });
}
