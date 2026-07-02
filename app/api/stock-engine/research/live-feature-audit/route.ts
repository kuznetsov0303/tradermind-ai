import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_STOCK_ENGINE_BASE_URL = "https://engine.upyourskills.site";

function getStockEngineBaseUrl(): string {
  const raw =
    process.env.STOCK_ENGINE_BASE_URL ||
    process.env.STOCK_ENGINE_URL ||
    process.env.STOCK_ENGINE_ORIGIN ||
    process.env.SKILLEDGE_STOCK_ENGINE_URL ||
    process.env.NEXT_PUBLIC_STOCK_ENGINE_BASE_URL ||
    DEFAULT_STOCK_ENGINE_BASE_URL;

  return raw.replace(/\/+$/, "");
}

function getStockEngineSecret(): string | null {
  return (
    process.env.STOCK_ENGINE_INGRESS_SECRET ||
    process.env.STOCK_ENGINE_API_SECRET ||
    process.env.STOCK_ENGINE_SECRET ||
    process.env.SKILLEDGE_STOCK_ENGINE_SECRET ||
    null
  );
}

function buildStockEngineHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Cache-Control": "no-store",
  };

  const secret = getStockEngineSecret();

  if (secret) {
    headers["x-skilledge-engine-secret"] = secret;
    headers["x-stock-engine-secret"] = secret;
    headers["x-engine-secret"] = secret;
    headers["x-ingress-secret"] = secret;
    headers.Authorization = `Bearer ${secret}`;
  }

  return headers;
}

function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      storageVersion: "s8_31a6_live_feature_audit_public_proxy_v1",
      error: message,
      ...extra,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  try {
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(`${getStockEngineBaseUrl()}/engine/research/live-feature-audit`);

    const limit = sourceUrl.searchParams.get("limit") || "5000";
    targetUrl.searchParams.set("limit", limit);

    for (const [key, value] of sourceUrl.searchParams.entries()) {
      if (key !== "limit") {
        targetUrl.searchParams.append(key, value);
      }
    }

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: buildStockEngineHeaders(),
      cache: "no-store",
      next: {
        revalidate: 0,
      },
    });

    const body = await response.text();

    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      return jsonError("STOCK_ENGINE_RETURNED_NON_JSON", response.ok ? 502 : response.status, {
        upstreamStatus: response.status,
        bodyPreview: body.slice(0, 2000),
      });
    }

    return NextResponse.json(payload, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError("LIVE_FEATURE_AUDIT_PROXY_FAILED", 500, {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
