import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyStockEngine("/engine/investor-dashboard/run", request);
}