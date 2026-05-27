import { NextRequest } from "next/server";
import { GET as runMarketAlertsCron } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();

  url.searchParams.set("assetType", "crypto");

  return runMarketAlertsCron(
    new NextRequest(url, {
      headers: request.headers,
    })
  );
}