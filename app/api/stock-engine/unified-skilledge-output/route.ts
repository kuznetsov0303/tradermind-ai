// S8.65 Unified Output Frontend/API Adapter
// Public-safe adapter for the S8.64 engine report.
// Client sees one SkillEdge AI output only. Internal desks/agents stay hidden.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADAPTER_VERSION = "s8_65_unified_output_frontend_api_adapter_v1";

type EngineJson = Record<string, any>;

function getEngineBaseUrl(): string {
  const raw =
    process.env.STOCK_ENGINE_BASE_URL ||
    process.env.STOCK_ENGINE_URL ||
    process.env.SKILLEDGE_STOCK_ENGINE_URL ||
    process.env.NEXT_PUBLIC_STOCK_ENGINE_BASE_URL ||
    "https://engine.upyourskills.site";

  return raw.replace(/\/+$/, "");
}

function getEngineHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  const secret =
    process.env.STOCK_ENGINE_INGRESS_SECRET ||
    process.env.SKILLEDGE_ENGINE_INGRESS_SECRET ||
    process.env.ENGINE_INGRESS_SECRET ||
    process.env.STOCK_ENGINE_API_SECRET ||
    "";

  if (secret) {
    headers["x-skilledge-engine-secret"] = secret;
    headers["x-engine-secret"] = secret;
    headers.authorization = `Bearer ${secret}`;
  }

  return headers;
}

async function fetchEngineJson(path: string, init?: RequestInit): Promise<{
  ok: boolean;
  status: number;
  json: EngineJson;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${getEngineBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...getEngineHeaders(),
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let json: EngineJson = {};

    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {
        ok: false,
        error: "engine_returned_non_json",
        rawPreview: text.slice(0, 500),
      };
    }

    return {
      ok: res.ok,
      status: res.status,
      json,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      json: {
        ok: false,
        error: "engine_fetch_failed",
        message: error?.message || String(error),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeEmptyClientOutput(displayState = "NO_CLIENT_VISIBLE_SIGNALS_READY") {
  return {
    brand: "SkillEdge AI",
    displayState,
    clientVisibleCount: 0,
    researchOnlyCount: 0,
    cards: [],
    emptyState: {
      title: "No approved SkillEdge AI signals right now",
      message:
        "The engine is monitoring the market, but no signal has passed the full quality, RR and manual approval gate yet.",
      showInternalDesks: false,
    },
  };
}

function sanitizeForClient(engineJson: EngineJson, source: "latest" | "run") {
  const summary = engineJson?.summary || {};
  const clientOutput = engineJson?.clientOutput || safeEmptyClientOutput(summary?.displayState);

  return {
    ok: Boolean(engineJson?.ok),
    adapterVersion: ADAPTER_VERSION,
    source,
    generatedAt: engineJson?.generatedAt || null,
    storageVersion: engineJson?.storageVersion || null,
    summary: {
      displayState:
        summary?.displayState ||
        clientOutput?.displayState ||
        "NO_CLIENT_VISIBLE_SIGNALS_READY",
      clientVisibleCount: Number(summary?.clientVisibleCount ?? clientOutput?.clientVisibleCount ?? 0),
      researchOnlyCount: Number(summary?.researchOnlyCount ?? clientOutput?.researchOnlyCount ?? 0),
      unifiedCardCount: Number(summary?.unifiedCardCount ?? 0),
      rowsEvaluated: Number(summary?.rowsEvaluated ?? 0),
      topBlockedReason: summary?.topBlockedReason || null,
    },
    clientOutput: {
      brand: clientOutput?.brand || "SkillEdge AI",
      displayState:
        clientOutput?.displayState ||
        summary?.displayState ||
        "NO_CLIENT_VISIBLE_SIGNALS_READY",
      clientVisibleCount: Number(clientOutput?.clientVisibleCount ?? 0),
      researchOnlyCount: Number(clientOutput?.researchOnlyCount ?? 0),
      cards: Array.isArray(clientOutput?.cards) ? clientOutput.cards : [],
      emptyState: {
        title:
          clientOutput?.emptyState?.title ||
          "No approved SkillEdge AI signals right now",
        message:
          clientOutput?.emptyState?.message ||
          "The engine is monitoring the market, but no signal has passed the full quality, RR and manual approval gate yet.",
        showInternalDesks: false,
      },
    },
    policy: {
      hideInternalDesksFromClient: true,
      clientSeesUnifiedSkillEdgeAIOnly: true,
      manualApprovalRequiredBeforeClientVisible: true,
      adapterReturnsInternalOutput: false,
    },
  };
}

async function loadUnifiedOutput(limit: number, refresh: boolean) {
  if (refresh) {
    const run = await fetchEngineJson(
      `/engine/research/unified-skilledge-output/run?limit=${limit}&publish=true`,
      { method: "POST" }
    );

    return {
      engineOk: run.ok,
      engineStatus: run.status,
      payload: sanitizeForClient(run.json, "run" as const),
      engineError: run.ok ? null : run.json,
    };
  }

  const latest = await fetchEngineJson("/engine/research/unified-skilledge-output/latest", {
    method: "GET",
  });

  if (latest.ok && latest.json?.ok) {
    return {
      engineOk: true,
      engineStatus: latest.status,
      payload: sanitizeForClient(latest.json, "latest" as const),
      engineError: null,
    };
  }

  const run = await fetchEngineJson(
    `/engine/research/unified-skilledge-output/run?limit=${limit}&publish=true`,
    { method: "POST" }
  );

  return {
    engineOk: run.ok,
    engineStatus: run.status,
    payload: sanitizeForClient(run.json, "run" as const),
    engineError: run.ok ? null : run.json,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(5, Math.min(Number(searchParams.get("limit") || 50), 200));
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";
  const includeDiagnostics =
    searchParams.get("diagnostics") === "1" || searchParams.get("diagnostics") === "true";

  const result = await loadUnifiedOutput(limit, refresh);

  return NextResponse.json(
    {
      ...result.payload,
      route: {
        ok: result.engineOk,
        engineStatus: result.engineStatus,
        adapterVersion: ADAPTER_VERSION,
      },
      diagnostics: includeDiagnostics
        ? {
            engineOk: result.engineOk,
            engineStatus: result.engineStatus,
            engineError: result.engineError,
            engineBaseConfigured: Boolean(
              process.env.STOCK_ENGINE_BASE_URL ||
                process.env.STOCK_ENGINE_URL ||
                process.env.SKILLEDGE_STOCK_ENGINE_URL ||
                process.env.NEXT_PUBLIC_STOCK_ENGINE_BASE_URL
            ),
            hasEngineSecret: Boolean(
              process.env.STOCK_ENGINE_INGRESS_SECRET ||
                process.env.SKILLEDGE_ENGINE_INGRESS_SECRET ||
                process.env.ENGINE_INGRESS_SECRET ||
                process.env.STOCK_ENGINE_API_SECRET
            ),
          }
        : undefined,
    },
    {
      status: result.engineOk ? 200 : 502,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.max(
    5,
    Math.min(Number(body?.limit || searchParams.get("limit") || 50), 200)
  );

  const result = await loadUnifiedOutput(limit, true);

  return NextResponse.json(
    {
      ...result.payload,
      route: {
        ok: result.engineOk,
        engineStatus: result.engineStatus,
        adapterVersion: ADAPTER_VERSION,
        refreshed: true,
      },
    },
    {
      status: result.engineOk ? 200 : 502,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
