import { fetchStockEngineJson } from "@/lib/stockEngineProxy";

type AnyRecord = Record<string, any>;

const VERSION = "s8_38a_investor_snapshot_adapter_v1";

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rec(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function arr(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").replace("$", "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

async function safeEngine(path: string): Promise<AnyRecord | null> {
  try {
    const payload = await fetchStockEngineJson(path);
    return rec(payload);
  } catch {
    return null;
  }
}

function evidenceRows(evidencePayload: AnyRecord | null, opsPayload: AnyRecord): AnyRecord[] {
  const direct = arr(evidencePayload?.items);
  if (direct.length) return direct;

  const opsEvidence = rec(opsPayload.strategyEvidence);
  return arr(opsEvidence.topItems);
}

function closedAggregate(rows: AnyRecord[]) {
  let closed = 0;
  let worked = 0;
  let avgRWeight = 0;

  for (const row of rows) {
    const evidence = rec(row.evidence);
    const rowClosed = num(evidence.closedDecisionCount) ?? 0;
    const rowWorked = num(evidence.worked) ?? 0;
    const rowAvgR = num(evidence.avgRClosed);

    closed += rowClosed;
    worked += rowWorked;

    if (rowAvgR !== null && rowClosed > 0) {
      avgRWeight += rowAvgR * rowClosed;
    }
  }

  return {
    closed,
    worked,
    winRateClosed: closed > 0 ? round((worked / closed) * 100, 2) : null,
    avgResultRClosed: closed > 0 ? round(avgRWeight / closed, 4) : null,
  };
}

function strategyCards(rows: AnyRecord[]) {
  return rows
    .map((row) => {
      const evidence = rec(row.evidence);
      return {
        setupSlug: String(row.setupSlug || row.setupName || "unknown"),
        setupName: row.setupName || row.setupSlug || "Unknown setup",
        winRateClosed: num(evidence.winRateClosed),
        avgResultRClosed: num(evidence.avgRClosed),
        closed: num(evidence.closedDecisionCount) ?? 0,
        worked: num(evidence.worked) ?? 0,
        failed: num(evidence.failed) ?? 0,
        evidenceQuality: row.evidenceQuality || null,
        promotionStatus: row.promotionStatus || null,
        warnings: Array.isArray(row.warnings) ? row.warnings : [],
      };
    })
    .sort((a, b) => Number(b.closed || 0) - Number(a.closed || 0))
    .slice(0, 30);
}

function topRiskText(risk: AnyRecord) {
  return [
    risk.code || "RISK",
    risk.message || risk.nextAction || "Risk requires review.",
  ]
    .filter(Boolean)
    .join(": ");
}

export async function buildInvestorDashboardSnapshot(options?: {
  source?: "cache" | "snapshot" | "run";
}) {
  const ops = await fetchStockEngineJson("/engine/admin/ops/status");
  const opsPayload = rec(ops);

  if (opsPayload.ok !== true) {
    throw new Error(String(opsPayload.error || "Admin ops status is not healthy."));
  }

  const [evidence, failure, promotion] = await Promise.all([
    safeEngine("/engine/strategies/evidence?limit=200"),
    safeEngine("/engine/research/failure-analysis?limit=200&min_closed=30&min_trigger_closed=5"),
    safeEngine("/engine/strategies/promotion-readiness?limit=200&min_closed=30&min_win_rate=65&min_avg_r=0&min_trigger_closed=5"),
  ]);

  const summary = rec(opsPayload.summary);
  const evidenceSummary = rec(evidence?.summary || rec(opsPayload.strategyEvidence).summary);
  const failureSummary = rec(failure?.summary || rec(opsPayload.failureAnalysis).summary);
  const promotionSummary = rec(promotion?.summary || rec(opsPayload.promotionReadiness).summary);
  const risks = arr(opsPayload.topRisks);
  const rows = evidenceRows(evidence, opsPayload);
  const aggregate = closedAggregate(rows);
  const cards = strategyCards(rows);

  const dirtyPipelines = num(summary.dirtyOutcomePipelines) ?? num(evidenceSummary.dirtyOutcomePipelines) ?? 0;
  const negativeEdge = num(summary.negativeEdgeSetups) ?? num(failureSummary.negativeEdgeSetups) ?? 0;
  const approvalMissing = Boolean(promotionSummary.approvalTableMissing) || Number(summary.approvalTableMissing || 0) > 0;
  const clientVisibleApproved = num(summary.clientVisibleApproved) ?? num(promotionSummary.clientVisibleApproved) ?? 0;
  const promotionCandidates = num(summary.promotionCandidates) ?? num(evidenceSummary.promotionCandidates) ?? 0;
  const registryTotal = num(summary.registryTotal) ?? num(evidenceSummary.registryTotal) ?? rows.length;
  const meaningfulSample = num(summary.withMeaningfulSample) ?? num(evidenceSummary.withMeaningfulSample) ?? 0;
  const withClosedEvidence = num(summary.withAnyClosedEvidence) ?? num(evidenceSummary.withAnyClosedEvidence) ?? 0;

  const blockerList = [
    dirtyPipelines > 0 ? `${dirtyPipelines} dirty outcome pipelines must be repaired before investor/promotional claims.` : "",
    negativeEdge > 0 ? `${negativeEdge} setups show negative edge or weak closed-decision performance.` : "",
    approvalMissing ? "Manual approval storage/table is missing, so no strategy can become client-visible." : "",
    clientVisibleApproved <= 0 ? "No strategy is approved as client-visible yet." : "",
  ].filter(Boolean);

  const positiveList = [
    "Engine, DB, nightly learning and systemd checks are online.",
    `${registryTotal} strategies are registered in the algorithm registry.`,
    `${withClosedEvidence} strategies have at least some closed TP/STOP evidence.`,
    `${meaningfulSample} strategies have a meaningful closed-decision sample.`,
  ];

  const readinessStatus =
    dirtyPipelines > 0
      ? "PRIVATE_BETA_OUTCOME_REPAIR_REQUIRED"
      : negativeEdge > 0
        ? "PRIVATE_BETA_FILTER_REVIEW_REQUIRED"
        : approvalMissing
          ? "PRIVATE_BETA_APPROVAL_STORAGE_REQUIRED"
          : promotionCandidates > 0
            ? "MANUAL_REVIEW_REQUIRED"
            : "PRIVATE_BETA_EVIDENCE_BUILDING";

  return {
    ok: true,
    storageVersion: VERSION,
    generatedAt: new Date().toISOString(),
    source: options?.source || "cache",
    adminOpsStatus: opsPayload.status || "UNKNOWN",
    headlineMetrics: {
      rawWinRateClosed: aggregate.winRateClosed,
      rawAvgResultRClosed: aggregate.avgResultRClosed,
      rawClosedOutcomes: aggregate.closed,
      registryTotal,
      withClosedEvidence,
      withMeaningfulSample: meaningfulSample,
      dirtyOutcomePipelines: dirtyPipelines,
      negativeEdgeSetups: negativeEdge,
      promotionCandidates,
      clientVisibleApproved,
    },
    equitySimulation: {
      allClosedOutcomes: {
        status: "DISABLED_UNTIL_CLEAN_CLIENT_VISIBLE_SAMPLE",
        finalEquity: null,
        totalReturnPct: null,
        maxDrawdownPct: null,
        curveSample: [],
        reason:
          "No investor-grade equity curve is shown until clean client-visible sample and outcome repair are complete.",
      },
      cleanEliteLayer: {
        status:
          clientVisibleApproved > 0
            ? "client-visible sample can start after strict signal gates"
            : "collecting evidence; no client-visible strategy approved yet",
        closedTrades: 0,
        clientVisibleApproved,
      },
    },
    marketingReadiness: {
      status: readinessStatus,
      recommendation:
        dirtyPipelines > 0
          ? "Private beta only. Repair outcome pipelines before investor claims or scale marketing."
          : "Private beta only. Continue evidence collection and manual review before scale marketing.",
      positives: positiveList,
      blockers: blockerList,
    },
    investorNarrative: {
      currentTruth:
        "SkillEdge AI has a working VPS engine, nightly learning, strategy evidence, failure analysis and promotion guard. Current strategy stats are research/paper evidence, not marketing claims.",
      whatImproved:
        "The system now separates registry count from real evidence, ignores OPEN/SESSION_CLOSE as wins/losses, flags dirty outcome pipelines and blocks auto-promotion.",
      whyNoAggressiveMarketingYet:
        "Outcome pipelines still contain dirty OPEN/SESSION_CLOSE ratios, several setups show weak closed-decision performance, and no manual approval table exists for client-visible promotion.",
      nextEngineeringStep:
        "Repair/rebuild old outcomes, add manual approval storage, then keep collecting clean closed TP/STOP evidence for investor-grade statistics.",
    },
    setupLearning: {
      cards,
      summary: {
        registryTotal,
        withClosedEvidence,
        withMeaningfulSample: meaningfulSample,
        dirtyOutcomePipelines: dirtyPipelines,
        negativeEdgeSetups: negativeEdge,
      },
    },
    aiLearningLog: [
      "Strategy Evidence Engine computes win rate only from closed TP/STOP decisions.",
      "Failure Analysis Agent flags negative edge, weak triggers and dirty outcome pipelines.",
      "Promotion Guard blocks client visibility until numeric evidence, pipeline health and manual approval pass.",
      ...risks.slice(0, 4).map(topRiskText),
    ],
    sourceSnapshots: {
      adminOps: {
        status: opsPayload.status,
        summary,
        topRisks: risks,
      },
      strategyEvidence: {
        ok: evidence?.ok ?? null,
        summary: evidenceSummary,
      },
      failureAnalysis: {
        ok: failure?.ok ?? null,
        summary: failureSummary,
      },
      promotionReadiness: {
        ok: promotion?.ok ?? null,
        summary: promotionSummary,
      },
    },
    policy: {
      privateAdminView: true,
      honestInvestorSnapshot: true,
      noFakeWinRate: true,
      openAndSessionCloseAreNotWins: true,
      readOnly: true,
      writesDb: false,
      changesClientDelivery: false,
      autoPromotesStrategies: false,
    },
  };
}

