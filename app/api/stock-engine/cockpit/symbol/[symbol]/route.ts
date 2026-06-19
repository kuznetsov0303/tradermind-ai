import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STOCK_ENGINE_BASE_URL = (
  process.env.STOCK_ENGINE_API_URL ||
  process.env.STOCK_ENGINE_URL ||
  process.env.NEXT_PUBLIC_STOCK_ENGINE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function proxyStockEngine(path: string) {
  try {
    const response = await fetch(`${STOCK_ENGINE_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { ok: false, error: text || "Stock engine returned a non-JSON response." };
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Stock engine is unavailable.",
        stockEngineBaseUrl: STOCK_ENGINE_BASE_URL,
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: any) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const params = await Promise.resolve(context?.params || {});
  const symbol = encodeURIComponent(String(params.symbol || "").trim().toUpperCase());

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol." }, { status: 400 });
  }

  return proxyStockEngine(`/engine/cockpit/symbol/${symbol}${query ? `?${query}` : ""}`);
}
