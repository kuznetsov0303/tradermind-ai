import { NextRequest } from "next/server";
import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ setup_slug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const params = await context.params;
  const setupSlug = encodeURIComponent(params.setup_slug || "");

  if (!setupSlug) {
    return Response.json(
      {
        ok: false,
        error: "missing_setup_slug",
        storageVersion: "s8_28c2_promotion_evidence_proxy_params_fix_v1",
      },
      { status: 400 },
    );
  }

  return proxyStockEngine(
    `/engine/promotion/evidence/${setupSlug}${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}
