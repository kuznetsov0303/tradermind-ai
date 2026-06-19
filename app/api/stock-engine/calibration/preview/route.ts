import { NextRequest } from "next/server";
import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "cache";
  url.searchParams.delete("mode");
  const query = url.searchParams.toString();

  if (mode === "run") {
    return proxyStockEngine(
      `/engine/calibration/preview/run${query ? `?${query}` : ""}`,
    );
  }

  return proxyStockEngine(
    `/engine/calibration/preview/cache${query ? `?${query}` : ""}`,
  );
}
