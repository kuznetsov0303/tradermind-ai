import {
  getSkillEdgeSetupBySlug,
  SKILLEDGE_SETUP_PLAYBOOK,
  type SkillEdgeDirection,
  type SkillEdgeMarketType,
  type SkillEdgeSetupDefinition,
} from "./setup-playbook";

export type SkillEdgePlaybookRagSection =
  | "overview"
  | "trigger"
  | "confirmation"
  | "entry"
  | "stop"
  | "targets"
  | "risk"
  | "avoid"
  | "checklist"
  | "education";

export type SkillEdgePlaybookRagDocument = {
  id: string;
  setupSlug: string;
  setupName: string;
  family: string;
  marketTypes: SkillEdgeMarketType[];
  direction: SkillEdgeDirection;
  section: SkillEdgePlaybookRagSection;
  title: string;
  content: string;
  tags: string[];
  priority: number;
};

export type SkillEdgePlaybookRagQuery = {
  setupSlug?: string | null;
  marketType?: SkillEdgeMarketType | null;
  direction?: Exclude<SkillEdgeDirection, "both"> | null;
  status?: string | null;
  text?: string | null;
  tags?: string[];
  maxDocuments?: number;
};

export type SkillEdgePlaybookRagHit = {
  document: SkillEdgePlaybookRagDocument;
  score: number;
  matchedReasons: string[];
};

export type SkillEdgePlaybookRagContext = {
  setup: SkillEdgeSetupDefinition | null;
  query: SkillEdgePlaybookRagQuery;
  hits: SkillEdgePlaybookRagHit[];
  promptBlock: string;
};

const SETUP_SLUG_ALIASES: Record<string, string> = {
  trend_pullback_structure_continuation: "stock_trend_continuation_pullback",
  stock_trend_pullback_structure_continuation: "stock_trend_continuation_pullback",
  stock_pullback_continuation: "stock_trend_continuation_pullback",
  stock_vwap_reclaim_long: "stock_vwap_reclaim_rejection",
  stock_vwap_rejection_short: "stock_vwap_reclaim_rejection",
  stock_opening_range_breakdown: "stock_opening_range_breakout",
  stock_news_continuation: "stock_news_continuation_pullback",
  crypto_sweep_reclaim_long: "crypto_liquidity_sweep_reclaim_long",
  crypto_sweep_rejection_short: "crypto_liquidity_sweep_rejection_short",
};

function normalizeTextForRag(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/|+.-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForRag(value: string | null | undefined) {
  if (!value) return [];

  return Array.from(
    new Set(
      normalizeTextForRag(value)
        .split(" ")
        .filter((token) => token.length >= 3),
    ),
  );
}

function normalizeSetupSlug(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim();

  return SETUP_SLUG_ALIASES[normalized] ?? normalized;
}

function sectionText(title: string, rows: string[]) {
  return `${title}: ${rows.join(" | ")}`;
}

function createPlaybookDocumentsForSetup(
  setup: SkillEdgeSetupDefinition,
): SkillEdgePlaybookRagDocument[] {
  const base = {
    setupSlug: setup.slug,
    setupName: setup.name,
    family: setup.family,
    marketTypes: setup.marketTypes,
    direction: setup.direction,
    tags: setup.tags,
  };

  return [
    {
      ...base,
      id: `${setup.slug}:overview`,
      section: "overview",
      title: "Setup overview",
      content: setup.description,
      priority: 100,
    },
    {
      ...base,
      id: `${setup.slug}:trigger`,
      section: "trigger",
      title: "Trigger conditions",
      content: sectionText("Trigger conditions", setup.triggerConditions),
      priority: 95,
    },
    {
      ...base,
      id: `${setup.slug}:confirmation`,
      section: "confirmation",
      title: "Confirmation rules",
      content: sectionText("Confirmation rules", setup.confirmationConditions),
      priority: 92,
    },
    {
      ...base,
      id: `${setup.slug}:entry`,
      section: "entry",
      title: "Entry logic",
      content: sectionText("Entry logic", setup.entryLogic),
      priority: 90,
    },
    {
      ...base,
      id: `${setup.slug}:stop`,
      section: "stop",
      title: "Stop and invalidation",
      content: sectionText("Stop and invalidation", setup.stopLogic),
      priority: 90,
    },
    {
      ...base,
      id: `${setup.slug}:targets`,
      section: "targets",
      title: "Targets and management",
      content: sectionText("Targets and management", setup.targetLogic),
      priority: 86,
    },
    {
      ...base,
      id: `${setup.slug}:risk`,
      section: "risk",
      title: "Risk warnings",
      content: sectionText("Risk warnings", setup.riskWarnings),
      priority: 88,
    },
    {
      ...base,
      id: `${setup.slug}:avoid`,
      section: "avoid",
      title: "Avoid conditions",
      content: sectionText("Avoid conditions", setup.avoidIf),
      priority: 88,
    },
    {
      ...base,
      id: `${setup.slug}:checklist`,
      section: "checklist",
      title: "Confirmation checklist",
      content: sectionText("Confirmation checklist", setup.checklist),
      priority: 84,
    },
    {
      ...base,
      id: `${setup.slug}:education`,
      section: "education",
      title: "Education note",
      content: setup.educationNote,
      priority: 70,
    },
  ];
}

export const SKILLEDGE_PLAYBOOK_RAG_DOCUMENTS: SkillEdgePlaybookRagDocument[] =
  SKILLEDGE_SETUP_PLAYBOOK.flatMap(createPlaybookDocumentsForSetup);

export function getSkillEdgeNormalizedSetupSlug(slug: string | null | undefined) {
  return normalizeSetupSlug(slug);
}

export function getSkillEdgeSetupForRag(slug: string | null | undefined) {
  const normalizedSlug = normalizeSetupSlug(slug);

  if (!normalizedSlug) return null;

  return getSkillEdgeSetupBySlug(normalizedSlug);
}

function scoreDocumentForQuery(
  document: SkillEdgePlaybookRagDocument,
  query: SkillEdgePlaybookRagQuery,
): SkillEdgePlaybookRagHit {
  let score = document.priority;
  const matchedReasons: string[] = [];
  const normalizedQuerySlug = normalizeSetupSlug(query.setupSlug);

  if (normalizedQuerySlug && document.setupSlug === normalizedQuerySlug) {
    score += 200;
    matchedReasons.push("exact_setup_slug");
  }

  if (query.marketType && document.marketTypes.includes(query.marketType)) {
    score += 28;
    matchedReasons.push("market_type_match");
  }

  if (
    query.direction &&
    (document.direction === query.direction || document.direction === "both")
  ) {
    score += 22;
    matchedReasons.push("direction_match");
  }

  if (query.status) {
    score += 4;
    matchedReasons.push(`status:${query.status}`);
  }

  const queryTags = query.tags ?? [];
  const tagMatches = queryTags.filter((tag) => document.tags.includes(tag));

  if (tagMatches.length > 0) {
    score += tagMatches.length * 12;
    matchedReasons.push(`tag_match:${tagMatches.join(",")}`);
  }

  const queryTokens = tokenizeForRag(
    [
      query.text,
      query.setupSlug,
      query.marketType,
      query.direction,
      ...(query.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const documentTokens = new Set(
    tokenizeForRag(
      [
        document.setupSlug,
        document.setupName,
        document.family,
        document.section,
        document.title,
        document.content,
        ...document.tags,
      ].join(" "),
    ),
  );

  const overlap = queryTokens.filter((token) => documentTokens.has(token));

  if (overlap.length > 0) {
    score += overlap.length * 6;
    matchedReasons.push(`token_overlap:${overlap.slice(0, 8).join(",")}`);
  }

  if (!normalizedQuerySlug && queryTokens.length === 0) {
    score = document.priority;
  }

  return {
    document,
    score,
    matchedReasons,
  };
}

export function retrieveSkillEdgePlaybookRagContext(
  query: SkillEdgePlaybookRagQuery,
): SkillEdgePlaybookRagContext {
  const maxDocuments = Math.max(1, Math.min(query.maxDocuments ?? 8, 16));
  const normalizedSlug = normalizeSetupSlug(query.setupSlug);
  const setup = normalizedSlug ? getSkillEdgeSetupBySlug(normalizedSlug) : null;

  const hits = SKILLEDGE_PLAYBOOK_RAG_DOCUMENTS.map((document) =>
    scoreDocumentForQuery(document, query),
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDocuments);

  return {
    setup,
    query: {
      ...query,
      setupSlug: normalizedSlug ?? query.setupSlug,
      maxDocuments,
    },
    hits,
    promptBlock: formatSkillEdgePlaybookRagPromptBlock({
      setup,
      hits,
    }),
  };
}

export function buildSkillEdgePlaybookRagQueryFromSignal(
  signal: Record<string, unknown>,
): SkillEdgePlaybookRagQuery {
  const setupSlug =
    typeof signal.setup_slug === "string"
      ? signal.setup_slug
      : typeof signal.setupSlug === "string"
        ? signal.setupSlug
        : typeof signal.alert_key === "string"
          ? signal.alert_key.split(":")[0]
          : null;

  const assetType =
    typeof signal.asset_type === "string"
      ? signal.asset_type
      : typeof signal.assetType === "string"
        ? signal.assetType
        : null;

  const marketType: SkillEdgeMarketType | null =
    assetType === "stock" || assetType === "stocks"
      ? "stocks"
      : assetType === "crypto"
        ? "crypto"
        : null;

  const direction =
    signal.direction === "long" || signal.direction === "short"
      ? signal.direction
      : null;

  const text = [
    signal.symbol,
    signal.title,
    signal.reason,
    signal.setup,
    signal.status,
    signal.alert_key,
    signal.setup_slug,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  return {
    setupSlug,
    marketType,
    direction,
    status: typeof signal.status === "string" ? signal.status : null,
    text,
    maxDocuments: 10,
  };
}

export function formatSkillEdgePlaybookRagPromptBlock(params: {
  setup: SkillEdgeSetupDefinition | null;
  hits: SkillEdgePlaybookRagHit[];
}) {
  const setupHeader = params.setup
    ? `Setup: ${params.setup.name} (${params.setup.slug})`
    : "Setup: unknown or not mapped";

  const documents = params.hits
    .map((hit, index) => {
      return [
        `${index + 1}. [${hit.document.section}] ${hit.document.title}`,
        `setup_slug: ${hit.document.setupSlug}`,
        `score: ${Math.round(hit.score)}`,
        `content: ${hit.document.content}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "SKILLEDGE PLAYBOOK / RAG CONTEXT",
    setupHeader,
    "",
    "Validator rules:",
    "- Use the candidate data first, then use the playbook as the rule reference.",
    "- Do not invent entry, stop, target, catalyst, volume, or confirmation data.",
    "- If required playbook conditions are missing, mark the signal as weak or incomplete.",
    "- Always mention invalidation and trap risk.",
    "- Keep the explanation concise, risk-first, and trading-desk style.",
    "",
    documents || "No playbook documents matched.",
  ].join("\n");
}

export function getSkillEdgePlaybookRagDiagnostics() {
  const setupSlugs = Array.from(
    new Set(SKILLEDGE_PLAYBOOK_RAG_DOCUMENTS.map((document) => document.setupSlug)),
  );

  return {
    version: "3B-4A",
    setupCount: setupSlugs.length,
    documentCount: SKILLEDGE_PLAYBOOK_RAG_DOCUMENTS.length,
    setupSlugs,
    sections: Array.from(
      new Set(SKILLEDGE_PLAYBOOK_RAG_DOCUMENTS.map((document) => document.section)),
    ),
  };
}