// S8.65D Unified Output Frontend/API Adapter POST Proxy Hotfix
// Public-safe adapter for the S8.64 engine report.
// GET/latest uses fetchStockEngineJson.
// POST/run uses proxyStockEngine(..., { method: "POST" }) because run endpoints are POST-only.
// Client sees one SkillEdge AI output only. Internal desks/agents stay hidden.

import { NextRequest, NextResponse } from "next/server";
import { fetchStockEngineJson, proxyStockEngine } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ADAPTER_VERSION = "s8_65d_unified_output_frontend_api_adapter_post_proxy_v1";

type EngineJson = Record<string, any>;

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
      usesStockEngineProxyLibrary: true,
      usesPostProxyForRun: true,
    },
  };
}

async function fetchEngineGet(path: string): Promise<{
  ok: boolean;
  status: number;
  json: EngineJson;
  enginePath: string;
  method: "GET";
}> {
  try {
    const json = (await fetchStockEngineJson(path)) as EngineJson;
    return {
      ok: Boolean(json?.ok),
      status: Boolean(json?.ok) ? 200 : 502,
      json,
      enginePath: path,
      method: "GET",
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 502,
      json: {
        ok: false,
        error: "stock_engine_proxy_get_failed",
        message: error?.message || String(error),
      },
      enginePath: path,
      method: "GET",
    };
  }
}

async function fetchEnginePost(path: string): Promise<{
  ok: boolean;
  status: number;
  json: EngineJson;
  enginePath: string;
  method: "POST";
}> {
  try {
    const response = await proxyStockEngine(path, { method: "POST" });
    const json = (await response.json()) as EngineJson;

    return {
      ok: response.ok && Boolean(json?.ok),
      status: response.status,
      json,
      enginePath: path,
      method: "POST",
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 502,
      json: {
        ok: false,
        error: "stock_engine_proxy_post_failed",
        message: error?.message || String(error),
      },
      enginePath: path,
      method: "POST",
    };
  }
}

async function loadUnifiedOutput(limit: number, refresh: boolean) {
  const runPath = `/engine/research/unified-skilledge-output/run?limit=${limit}&publish=true`;
  const latestPath = "/engine/research/unified-skilledge-output/latest";

  if (refresh) {
    const run = await fetchEnginePost(runPath);
    return {
      engineOk: run.ok,
      engineStatus: run.status,
      payload: sanitizeForClient(run.json, "run" as const),
      engineError: run.ok ? null : run.json,
      enginePath: run.enginePath,
      engineMethod: run.method,
    };
  }

  const latest = await fetchEngineGet(latestPath);

  if (latest.ok && latest.json?.ok) {
    return {
      engineOk: true,
      engineStatus: latest.status,
      payload: sanitizeForClient(latest.json, "latest" as const),
      engineError: null,
      enginePath: latest.enginePath,
      engineMethod: latest.method,
    };
  }

  const run = await fetchEnginePost(runPath);

  return {
    engineOk: run.ok,
    engineStatus: run.status,
    payload: sanitizeForClient(run.json, "run" as const),
    engineError: run.ok ? null : run.json,
    enginePath: run.enginePath,
    engineMethod: run.method,
  };
}

function buildResponseBody(
  result: Awaited<ReturnType<typeof loadUnifiedOutput>>,
  includeDiagnostics: boolean,
  extraRoute?: Record<string, any>
) {
  return {
    ...result.payload,
    route: {
      ok: result.engineOk,
      engineStatus: result.engineStatus,
      adapterVersion: ADAPTER_VERSION,
      proxyMode: false,
      stockEngineProxyLibraryMode: true,
      postProxyForRun: true,
      engineMethod: result.engineMethod,
      ...extraRoute,
    },
    diagnostics: includeDiagnostics
      ? {
          engineOk: result.engineOk,
          engineStatus: result.engineStatus,
          engineError: result.engineError,
          enginePath: result.enginePath,
          engineMethod: result.engineMethod,
          stockEngineProxyLibraryMode: true,
          postProxyForRun: true,
        }
      : undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(5, Math.min(Number(searchParams.get("limit") || 50), 200));
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";
  const includeDiagnostics =
    searchParams.get("diagnostics") === "1" || searchParams.get("diagnostics") === "true";

  const result = await loadUnifiedOutput(limit, refresh);

  return NextResponse.json(buildResponseBody(result, includeDiagnostics), {
    status: result.engineOk ? 200 : 502,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
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
    buildResponseBody(result, false, { refreshed: true }),
    {
      status: result.engineOk ? 200 : 502,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
