import { NextRequest, NextResponse } from "next/server";

import { fetchStockEngineJson } from "@/lib/stockEngineProxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRecord = Record<string, any>;

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getState(liveAudit: AnyRecord, featureMatrix: AnyRecord): string {
  const liveSummary = liveAudit?.summary || {};
  const liveTotal = num(liveSummary.total);
  const liveReady = num(liveSummary.ready);
  const matrixRows = num(featureMatrix?.rowsBuilt);
  const setupCount = num(featureMatrix?.setupCount);

  if (liveTotal > 0 && liveReady > 0 && matrixRows > 0 && setupCount > 0) {
    return "LIVE_FEATURE_LAYER_READY";
  }

  if (matrixRows > 0 && setupCount > 0) {
    return "FEATURE_MATRIX_READY_WAITING_FOR_LIVE_SNAPSHOTS";
  }

  if (liveTotal > 0 && liveReady > 0) {
    return "LIVE_SNAPSHOTS_READY_WAITING_FOR_MATRIX";
  }

  return "WAITING_FOR_RESEARCH_DATA";
}

export async function GET(request: NextRequest) {
  try {
    const liveLimit = request.nextUrl.searchParams.get("liveLimit") || "100";
    const matrixLimit = request.nextUrl.searchParams.get("matrixLimit") || "5000";

    const [liveAudit, featureMatrix] = await Promise.all([
      fetchStockEngineJson(`/engine/research/live-feature-audit?limit=${encodeURIComponent(liveLimit)}`),
      fetchStockEngineJson(`/engine/research/feature-matrix?limit=${encodeURIComponent(matrixLimit)}&include_rows=false&publish=false`),
    ]);

    const live = liveAudit as AnyRecord;
    const matrix = featureMatrix as AnyRecord;

    return NextResponse.json(
      {
        ok: true,
        storageVersion: "s8_31a8_research_lab_status_v1",
        evaluatedAt: new Date().toISOString(),
        state: getState(live, matrix),
        liveFeatureAudit: {
          ok: Boolean(live?.ok),
          storageVersion: live?.storageVersion || null,
          evaluatedAt: live?.evaluatedAt || null,
          summary: live?.summary || null,
          bySetup: Array.isArray(live?.bySetup) ? live.bySetup.slice(0, 20) : [],
        },
        featureMatrix: {
          ok: Boolean(matrix?.ok),
          storageVersion: matrix?.storageVersion || null,
          evaluatedAt: matrix?.evaluatedAt || null,
          rowsBuilt: matrix?.rowsBuilt ?? null,
          rowsReturned: matrix?.rowsReturned ?? null,
          setupCount: matrix?.setupCount ?? null,
          publish: matrix?.publish || null,
        },
        nextGate: {
          name: "S8.31A4_POST_CLOSE_OUTCOME_BRIDGE_CHECK",
          waitUntilKyiv: "23:00",
          requiredBeforeFailureAnalyzer: true,
        },
        policy: {
          mode: "READ_ONLY_RESEARCH_LAB_STATUS",
          doesNotChangeRegistry: true,
          doesNotEnableClientDelivery: true,
          doesNotSendTelegram: true,
          doesNotExecuteTrades: true,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        storageVersion: "s8_31a8_research_lab_status_v1",
        error: "RESEARCH_LAB_STATUS_FAILED",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
