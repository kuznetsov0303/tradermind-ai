// S8.65 Unified Output Frontend/API Adapter
// Small frontend helper/types for the sanitized SkillEdge AI client output.

export type UnifiedSkillEdgeSignalCard = {
  signalId?: string | null;
  symbol?: string;
  setupSlug?: string;
  sourceLabel?: "SkillEdge AI" | string;
  displayState?: string;
  clientVisible?: boolean;
  headline?: string;
  direction?: string;
  lifecycleStatus?: string;
  qualityStatus?: string;
  grade?: string;
  score?: number | null;
  riskReward?: number | null;
  premiumSignal?: boolean;
  telegramEligible?: boolean;
  levels?: {
    entry?: number | null;
    stop?: number | null;
    targets?: Array<{ price?: number | null; r?: number | null }>;
  };
  safeClientCopy?: {
    title?: string;
    subtitle?: string;
    riskNote?: string;
    status?: string;
  };
};

export type UnifiedSkillEdgeOutputResponse = {
  ok: boolean;
  adapterVersion?: string;
  source?: "latest" | "run";
  generatedAt?: string | null;
  storageVersion?: string | null;
  summary: {
    displayState: string;
    clientVisibleCount: number;
    researchOnlyCount: number;
    unifiedCardCount?: number;
    rowsEvaluated?: number;
    topBlockedReason?: string | null;
  };
  clientOutput: {
    brand: "SkillEdge AI" | string;
    displayState: string;
    clientVisibleCount: number;
    researchOnlyCount: number;
    cards: UnifiedSkillEdgeSignalCard[];
    emptyState: {
      title: string;
      message: string;
      showInternalDesks: false;
    };
  };
  policy: {
    hideInternalDesksFromClient: true;
    clientSeesUnifiedSkillEdgeAIOnly: true;
    manualApprovalRequiredBeforeClientVisible: true;
    adapterReturnsInternalOutput: false;
  };
  route?: {
    ok: boolean;
    engineStatus: number;
    adapterVersion: string;
    refreshed?: boolean;
  };
};

export function getUnifiedSkillEdgeOutputUrl(options?: {
  limit?: number;
  refresh?: boolean;
  diagnostics?: boolean;
}) {
  const params = new URLSearchParams();

  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.refresh) params.set("refresh", "1");
  if (options?.diagnostics) params.set("diagnostics", "1");

  const query = params.toString();
  return `/api/stock-engine/unified-skilledge-output${query ? `?${query}` : ""}`;
}

export async function fetchUnifiedSkillEdgeOutput(options?: {
  limit?: number;
  refresh?: boolean;
  diagnostics?: boolean;
}): Promise<UnifiedSkillEdgeOutputResponse> {
  const res = await fetch(getUnifiedSkillEdgeOutputUrl(options), {
    method: "GET",
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok) {
    return {
      ok: false,
      summary: {
        displayState: "ENGINE_UNAVAILABLE",
        clientVisibleCount: 0,
        researchOnlyCount: 0,
        topBlockedReason: "engine_unavailable",
      },
      clientOutput: {
        brand: "SkillEdge AI",
        displayState: "ENGINE_UNAVAILABLE",
        clientVisibleCount: 0,
        researchOnlyCount: 0,
        cards: [],
        emptyState: {
          title: "SkillEdge AI is updating",
          message:
            "The signal engine is temporarily unavailable. Please check again shortly.",
          showInternalDesks: false,
        },
      },
      policy: {
        hideInternalDesksFromClient: true,
        clientSeesUnifiedSkillEdgeAIOnly: true,
        manualApprovalRequiredBeforeClientVisible: true,
        adapterReturnsInternalOutput: false,
      },
      route: json?.route,
    };
  }

  return json as UnifiedSkillEdgeOutputResponse;
}

export function hasApprovedSkillEdgeSignals(output?: UnifiedSkillEdgeOutputResponse | null) {
  return Boolean(output?.clientOutput?.cards?.length);
}

export function getSkillEdgeEmptySignalMessage(output?: UnifiedSkillEdgeOutputResponse | null) {
  return (
    output?.clientOutput?.emptyState?.message ||
    "The engine is monitoring the market, but no signal has passed the full quality, RR and manual approval gate yet."
  );
}
