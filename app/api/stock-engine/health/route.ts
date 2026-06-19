import { proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return proxyStockEngine("/health");
}
