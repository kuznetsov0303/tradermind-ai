import { NextResponse } from "next/server";

export const STOCK_ENGINE_BASE_URL = (
  process.env.STOCK_ENGINE_PUBLIC_URL ||
  process.env.STOCK_ENGINE_API_URL ||
  process.env.STOCK_ENGINE_URL ||
  process.env.NEXT_PUBLIC_STOCK_ENGINE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export function stockEngineHeaders(): HeadersInit {
  const secret =
    process.env.STOCK_ENGINE_PROXY_SECRET ||
    process.env.ENGINE_PROXY_SECRET ||
    "";

  const headers: HeadersInit = {
    accept: "application/json",
  };

  if (secret) {
    headers["X-SkillEdge-Engine-Key"] = secret;
  }

  return headers;
}

export async function proxyStockEngine(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${STOCK_ENGINE_BASE_URL}${path}`, {
      method: init?.method || "GET",
      headers: {
        ...stockEngineHeaders(),
        ...(init?.headers || {}),
      },
      body: init?.body,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = {
        ok: false,
        error: text || "Stock engine returned a non-JSON response.",
      };
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Stock engine is unavailable.",
        stockEngineBaseUrl: STOCK_ENGINE_BASE_URL,
      },
      { status: 502 },
    );
  }
}

export async function fetchStockEngineJson(path: string) {
  const response = await fetch(`${STOCK_ENGINE_BASE_URL}${path}`, {
    method: "GET",
    headers: stockEngineHeaders(),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: any = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = {
      ok: false,
      error: text || "Stock engine returned a non-JSON response.",
    };
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Stock engine HTTP ${response.status}`,
    );
  }

  return payload;
}
