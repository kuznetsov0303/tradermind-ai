import { NextResponse } from "next/server";

export const STOCK_ENGINE_BASE_URL = (
  process.env.STOCK_ENGINE_API_URL ||
  process.env.STOCK_ENGINE_URL ||
  process.env.STOCK_ENGINE_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_STOCK_ENGINE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

type StockEnginePayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

function isLikelyHtml(value: string) {
  return /^\s*</.test(value || "");
}

function compactError(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Stock engine is unavailable.";
  return raw.replace(/\s+/g, " ").slice(0, 500);
}

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

function stockEnginePathCandidates(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const candidates = [normalized];

  // Durable compatibility:
  // - raw FastAPI engine may expose /engine/cockpit
  // - public proxy base may already include /api/stock-engine and expect /cockpit
  // So if /engine/* returns nginx/404, retry without the /engine prefix.
  if (normalized.startsWith("/engine/")) {
    candidates.push(normalized.replace(/^\/engine/, ""));
  }

  return Array.from(new Set(candidates));
}

async function fetchCandidate(path: string, init?: RequestInit) {
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
  let payload: StockEnginePayload | null = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = {
      ok: false,
      error: text || "Stock engine returned a non-JSON response.",
    };
  }

  return {
    response,
    payload,
    text,
    path,
  };
}

function shouldRetryPath(status: number, payload: StockEnginePayload | null, text: string) {
  const error = String(payload?.error || "");
  const htmlError = isLikelyHtml(error || text);

  // nginx can return HTML 403/404 when a public base URL receives the raw
  // /engine/* path. In that case retry the public/proxy path without /engine.
  // JSON 403 from the FastAPI security layer should not be hidden.
  if ((status === 403 || status === 404) && htmlError) return true;

  if (status >= 500 && htmlError) return true;
  return false;
}

export async function proxyStockEngine(path: string, init?: RequestInit) {
  let last:
    | Awaited<ReturnType<typeof fetchCandidate>>
    | null = null;

  try {
    for (const candidate of stockEnginePathCandidates(path)) {
      last = await fetchCandidate(candidate, init);

      if (last.response.ok && last.payload?.ok !== false) {
        return NextResponse.json(last.payload, {
          status: last.response.status,
        });
      }

      if (!shouldRetryPath(last.response.status, last.payload, last.text)) {
        break;
      }
    }

    const status = last?.response.status || 502;
    return NextResponse.json(
      {
        ok: false,
        error: compactError(
          last?.payload?.error ||
            last?.payload?.message ||
            `Stock engine HTTP ${status}`,
        ),
        proxyModel: "s8_11d_stable_stock_engine_proxy_v1",
        attemptedPath: last?.path || path,
      },
      { status },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? compactError(error.message)
            : "Stock engine is unavailable.",
        proxyModel: "s8_11d_stable_stock_engine_proxy_v1",
        upstreamConfigured: Boolean(STOCK_ENGINE_BASE_URL),
      },
      { status: 502 },
    );
  }
}

export async function fetchStockEngineJson(path: string) {
  let last:
    | Awaited<ReturnType<typeof fetchCandidate>>
    | null = null;

  for (const candidate of stockEnginePathCandidates(path)) {
    last = await fetchCandidate(candidate);

    if (last.response.ok && last.payload?.ok !== false) {
      return last.payload;
    }

    if (!shouldRetryPath(last.response.status, last.payload, last.text)) {
      break;
    }
  }

  const status = last?.response.status || 502;
  const error =
    last?.payload?.error ||
    last?.payload?.message ||
    `Stock engine HTTP ${status}`;

  throw new Error(compactError(error));
}
