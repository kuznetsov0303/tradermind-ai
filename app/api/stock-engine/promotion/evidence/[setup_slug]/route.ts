import { NextRequest } from "next/server";
import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { setup_slug: string } },
) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const setupSlug = encodeURIComponent(params.setup_slug || "");

  return proxyStockEngine(
    `/engine/promotion/evidence/${setupSlug}${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}
