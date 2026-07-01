import { NextRequest } from "next/server";
import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();

  return proxyStockEngine(
    `/engine/promotion/evidence${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}
