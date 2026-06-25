import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyStockEngine("/engine/investor-dashboard/snapshot", request);
}