"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/security/client-auth-fetch";

type Language = "en" | "ru" | "ua";
type AlertAssetFilter = "all" | "stock" | "crypto";

type GlobalAlert = {
  id: string;
  ticker?: string | null;
  symbol?: string | null;
  direction?: string | null;
  setup?: string | null;
  setup_type?: string | null;
  title?: string | null;
  priority?: number | null;
  confidence?: number | null;
  asset_type?: "stock" | "crypto" | string | null;
  exchange?: string | null;
  created_at?: string | null;
  timestamp?: string | null;

  personal_edge_match_score?: number | null;
  personal_edge_status?: string | null;
  personal_edge_label?: string | null;
  personal_edge_reason?: string | null;
  personal_edge_risk_guard_note?: string | null;
  personal_edge_anti_setup_risk_score?: number | null;

  matched_fingerprint_name?: string | null;
  matched_fingerprint_tier?: string | null;
  matched_fingerprint_confidence?: number | null;

  personal_rule_warnings?: string[] | null;
};

const globalAlertsCopy = {
  en: {
    eyebrow: "SkillEdge AI Signals",
    title: "Live trading desk",
    checking: "Checking alerts...",
    latestOpportunities: "Latest opportunities",
    all: "All",
    stocks: "Stocks",
    crypto: "Crypto",
    noAlertsTitle: "No active signal yet",
noAlertsText:
  "The desk is online. When a high-quality setup appears, it will show here.",
    opensFullCenter: "Opens full Alerts Center",
    openDashboard: "Open dashboard",
    collapsedTitle: "AI Signals",
    latest: "latest",
    defaultSetup: "AI alert",
    defaultMarket: "Market",
    defaultMeta: "New trading desk alert",
    priority: "Priority",
    confidence: "Confidence",
    personalMatch: "Personal Edge",
    riskGuard: "Risk Guard",
    fingerprint: "Fingerprint",
  },
  ru: {
    eyebrow: "AI-сигналы SkillEdge",
    title: "Живой торговый desk",
    checking: "Проверяем сигналы...",
    latestOpportunities: "Последние возможности",
    all: "Все",
    stocks: "Акции",
    crypto: "Крипто",
    noAlertsTitle: "Активных сигналов пока нет",
noAlertsText:
  "Desk работает. Когда появится качественный сетап, он будет здесь.",
    opensFullCenter: "Открывает полный центр сигналов",
    openDashboard: "Открыть кабинет",
    collapsedTitle: "AI-сигналы",
    latest: "последних",
    defaultSetup: "AI-сигнал",
    defaultMarket: "Рынок",
    defaultMeta: "Новый сигнал торгового desk",
    priority: "Приоритет",
    confidence: "Уверенность",
    personalMatch: "Personal Edge",
    riskGuard: "Risk Guard",
    fingerprint: "Паттерн",
  },
  ua: {
    eyebrow: "AI-сигнали SkillEdge",
    title: "Живий торговий desk",
    checking: "Перевіряємо сигнали...",
    latestOpportunities: "Останні можливості",
    all: "Усі",
    stocks: "Акції",
    crypto: "Крипто",
    noAlertsTitle: "Активних сигналів поки немає",
noAlertsText:
  "Desk працює. Коли з’явиться якісний сетап, він буде тут.",
    opensFullCenter: "Відкриває повний центр сигналів",
    openDashboard: "Відкрити кабінет",
    collapsedTitle: "AI-сигнали",
    latest: "останніх",
    defaultSetup: "AI-сигнал",
    defaultMarket: "Ринок",
    defaultMeta: "Новий сигнал торгового desk",
    priority: "Пріоритет",
    confidence: "Впевненість",
    personalMatch: "Personal Edge",
    riskGuard: "Risk Guard",
    fingerprint: "Патерн",
  },
} as const;

function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";

  const saved =
    window.localStorage.getItem("skilledge_language") ||
    window.localStorage.getItem("skilledge_dashboard_language");

  if (saved === "ru" || saved === "ua" || saved === "en") {
    return saved;
  }

  return "en";
}

function normalizeAlertAssetFilter(value: string | null | undefined): AlertAssetFilter {
  const normalized = (value || "all").toLowerCase();

  if (["crypto", "coin", "coins"].includes(normalized)) return "crypto";
  if (["stock", "stocks", "equity", "equities"].includes(normalized)) return "stock";

  return "all";
}

function getStoredAlertAssetFilter(): AlertAssetFilter {
  if (typeof window === "undefined") return "all";

  return normalizeAlertAssetFilter(
    window.localStorage.getItem("skilledge_global_alert_asset_filter") ||
      window.localStorage.getItem("skilledge_alert_asset_filter")
  );
}

function getAlertAssetFilterUrlValue(filter: AlertAssetFilter) {
  return filter === "all" ? "all" : filter;
}

function isAlertInAssetFilter(alert: GlobalAlert, filter: AlertAssetFilter) {
  if (filter === "all") return true;

  const assetType = String(alert.asset_type || "").toLowerCase();
  const exchange = String(alert.exchange || "").toLowerCase();
  const symbol = String(alert.symbol || alert.ticker || "").toUpperCase();
  const isCrypto =
    assetType === "crypto" ||
    exchange.includes("binance") ||
    exchange.includes("hyperliquid") ||
    symbol.endsWith("USDT") ||
    symbol.endsWith("USD");

  return filter === "crypto" ? isCrypto : !isCrypto;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const next = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return next.length > 0 ? next : null;
}

function normalizeAlert(raw: any): GlobalAlert | null {
  if (!raw || typeof raw !== "object") return null;

  const id = raw.id || raw.alert_id || raw.market_alert_id;

  if (!id) return null;

  const priority =
    normalizeNumber(raw.priority) ??
    normalizeNumber(raw.personal_priority_score) ??
    normalizeNumber(raw.score);

  const confidence =
    normalizeNumber(raw.confidence) ??
    normalizeNumber(raw.confidence_score) ??
    normalizeNumber(raw.personal_edge_match_score);

  return {
    id: String(id),
    ticker: raw.ticker ?? raw.symbol ?? null,
    symbol: raw.symbol ?? raw.ticker ?? null,
    direction: raw.direction ?? raw.side ?? null,
    setup: raw.setup ?? raw.setup_name ?? null,
    setup_type: raw.setup_type ?? raw.setupType ?? null,
    title: raw.title ?? null,
    priority,
    confidence,
    asset_type: raw.asset_type ?? raw.assetType ?? null,
    exchange: raw.exchange ?? null,
    created_at: raw.created_at ?? raw.createdAt ?? null,
    timestamp: raw.timestamp ?? raw.created_at ?? null,

    personal_edge_match_score: normalizeNumber(raw.personal_edge_match_score),
    personal_edge_status: raw.personal_edge_status ?? null,
    personal_edge_label: raw.personal_edge_label ?? null,
    personal_edge_reason: raw.personal_edge_reason ?? null,
    personal_edge_risk_guard_note: raw.personal_edge_risk_guard_note ?? null,
    personal_edge_anti_setup_risk_score: normalizeNumber(
      raw.personal_edge_anti_setup_risk_score
    ),

    matched_fingerprint_name: raw.matched_fingerprint_name ?? null,
    matched_fingerprint_tier: raw.matched_fingerprint_tier ?? null,
    matched_fingerprint_confidence: normalizeNumber(
      raw.matched_fingerprint_confidence
    ),

    personal_rule_warnings: normalizeStringArray(raw.personal_rule_warnings),
  };
}

function extractAlerts(payload: any): GlobalAlert[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.alerts)
      ? payload.alerts
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

  return source
    .map(normalizeAlert)
    .filter(Boolean) as GlobalAlert[];
}

function getAlertTitle(alert: GlobalAlert, copy: (typeof globalAlertsCopy)[Language]) {
  const ticker = alert.ticker || alert.symbol || copy.defaultMarket;
  const setup = alert.setup || alert.setup_type || alert.title || copy.defaultSetup;

  return `${ticker} · ${setup}`;
}

function getAlertMeta(alert: GlobalAlert, copy: (typeof globalAlertsCopy)[Language]) {
  const parts: string[] = [];

  if (alert.direction) {
    parts.push(String(alert.direction).toUpperCase());
  }

  if (typeof alert.priority === "number") {
    parts.push(`${copy.priority} ${Math.round(alert.priority)}`);
  } else if (typeof alert.confidence === "number") {
    parts.push(`${copy.confidence} ${Math.round(alert.confidence)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : copy.defaultMeta;
}

function getPersonalEdgeBadge(alert: GlobalAlert) {
  const score =
    typeof alert.personal_edge_match_score === "number"
      ? Math.round(alert.personal_edge_match_score)
      : null;

  if (score === null) return null;

  return `Personal Edge ${score}%`;
}

function getPersonalEdgeReason(alert: GlobalAlert) {
  if (alert.matched_fingerprint_name) {
    return alert.matched_fingerprint_name;
  }

  if (alert.personal_edge_label) {
    return alert.personal_edge_label;
  }

  if (alert.personal_edge_status) {
    return alert.personal_edge_status;
  }

  return null;
}

function getShortRiskGuard(alert: GlobalAlert, language: Language) {
  const warnings = Array.isArray(alert.personal_rule_warnings)
    ? alert.personal_rule_warnings.filter(Boolean)
    : [];

  if (warnings.length > 0) {
    if (language === "ru") return `${warnings.length} правил требуют подтверждения`;
    if (language === "ua") return `${warnings.length} правил потребують підтвердження`;
    return `${warnings.length} rules need confirmation`;
  }

  if (alert.personal_edge_anti_setup_risk_score) {
    const score = Math.round(alert.personal_edge_anti_setup_risk_score);

    if (score >= 70) {
      if (language === "ru") return "Высокий anti-setup риск";
      if (language === "ua") return "Високий anti-setup ризик";
      return "High anti-setup risk";
    }

    if (score >= 45) {
      if (language === "ru") return "Risk Guard активен";
      if (language === "ua") return "Risk Guard активний";
      return "Risk Guard active";
    }
  }

  if (alert.personal_edge_risk_guard_note) {
    if (language === "ru") return "Проверь правила исполнения перед входом";
    if (language === "ua") return "Перевір правила виконання перед входом";
    return "Check execution rules before entry";
  }

  return null;
}

function GlobalAlertsWidget() {
  const [language, setLanguage] = useState<Language>("en");
  const [hasSession, setHasSession] = useState(false);
  const [alerts, setAlerts] = useState<GlobalAlert[]>([]);
  const [assetFilter, setAssetFilter] = useState<AlertAssetFilter>("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastAlertId, setLastAlertId] = useState<string | null>(null);
  const firstLoadRef = useRef(true);

  const copy = globalAlertsCopy[language];
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => isAlertInAssetFilter(alert, assetFilter)).slice(0, 3),
    [alerts, assetFilter]
  );
  const newestAlertId = filteredAlerts[0]?.id ?? null;
  const assetFilters: { id: AlertAssetFilter; label: string; count: number }[] = [
    { id: "all", label: copy.all, count: alerts.length },
    { id: "stock", label: copy.stocks, count: alerts.filter((alert) => isAlertInAssetFilter(alert, "stock")).length },
    { id: "crypto", label: copy.crypto, count: alerts.filter((alert) => isAlertInAssetFilter(alert, "crypto")).length },
  ];

  const hasNewAlert = useMemo(() => {
    return Boolean(newestAlertId && lastAlertId && newestAlertId !== lastAlertId);
  }, [newestAlertId, lastAlertId]);

  useEffect(() => {
    setLanguage(getStoredLanguage());
    setAssetFilter(getStoredAlertAssetFilter());

    const handleStorage = () => {
      setLanguage(getStoredLanguage());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("skilledge:language-changed", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("skilledge:language-changed", handleStorage);
    };
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session?.access_token));
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session?.access_token));

      if (!session?.access_token) {
        setAlerts([]);
        setOpen(false);
        setLastAlertId(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSession) return;

    let cancelled = false;

    const loadAlerts = async () => {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        if (!token) {
          if (!cancelled) setHasSession(false);
          return;
        }

        const response = await authFetch(
          "/api/market/alerts/personalized?limit=30&period=24h&status=tradable&assetType=all",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) {
          if (!cancelled) {
            setAlerts([]);
            setOpen(false);
          }

          return;
        }

        const payload = await response.json();
        const nextAlerts = extractAlerts(payload);

        if (!cancelled) {
          setAlerts(nextAlerts);

          if (nextAlerts[0]?.id) {
            if (firstLoadRef.current) {
              setLastAlertId(nextAlerts[0].id);
              firstLoadRef.current = false;
            }
          }
        }
      } catch {
        if (!cancelled) {
          setAlerts([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAlerts();

    const interval = window.setInterval(loadAlerts, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hasSession]);

  useEffect(() => {
    if (!newestAlertId || firstLoadRef.current) return;

    if (lastAlertId && newestAlertId !== lastAlertId) {
      setOpen(true);
    }
  }, [newestAlertId, lastAlertId]);

  const markSeen = () => {
    if (newestAlertId) {
      setLastAlertId(newestAlertId);
    }
  };

  if (!hasSession) {
  return null;
}

  return (
    <div className="fixed bottom-28 right-6 z-[99998] w-[calc(100vw-2rem)] max-w-[500px]">
      {open ? (
        <div className="overflow-hidden rounded-[1.7rem] border border-[#00C076]/20 bg-[#08111F]/96 shadow-[0_24px_90px_rgba(0,0,0,0.72),0_0_42px_rgba(0,192,118,0.14)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#DFFFEF]/55">
                {copy.eyebrow}
              </div>

              <div className="mt-1 text-base font-semibold text-white">
                {copy.title}
              </div>

              <div className="mt-1 text-xs text-white/42">
                {loading ? copy.checking : copy.latestOpportunities}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                markSeen();
                setOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/10 hover:text-white"
              aria-label="Close alerts widget"
            >
              ×
            </button>
          </div>

          <div className="border-b border-white/10 p-3">
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1">
              {assetFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setAssetFilter(item.id);
                    window.localStorage.setItem(
                      "skilledge_global_alert_asset_filter",
                      item.id
                    );
                    window.localStorage.setItem("skilledge_alert_asset_filter", item.id);
                  }}
                  className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition ${
                    assetFilter === item.id
                      ? "bg-[#00C076] text-[#07111F] shadow-[0_0_20px_rgba(103,232,249,0.22)]"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item.label} <span className="opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] space-y-3 overflow-y-auto p-3">
  {filteredAlerts.length > 0 ? (
    filteredAlerts.map((alert) => (
      <Link
        key={alert.id}
        href={`/dashboard?tab=signals${assetFilter === "all" ? "" : `&assetType=${getAlertAssetFilterUrlValue(assetFilter)}`}`}
        onClick={markSeen}
        className="block rounded-[1.3rem] border border-white/10 bg-white/[0.035] p-4 transition hover:border-[#00C076]/25 hover:bg-[#00C076]/[0.06]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black leading-5 text-white">
              {getAlertTitle(alert, copy)}
            </div>

            <div className="mt-1 text-[13px] font-bold leading-5 text-[#DFFFEF]/68">
              {getAlertMeta(alert, copy)}
            </div>
            
{getPersonalEdgeBadge(alert) ? (
  <div className="mt-3 rounded-[1.15rem] border border-[#00C076]/16 bg-[#00C076]/[0.055] px-3.5 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-black uppercase tracking-[0.08em] text-[#DFFFEF]">
          {getPersonalEdgeBadge(alert)}
        </div>

        {getPersonalEdgeReason(alert) ? (
          <div className="mt-1 truncate text-[13px] font-bold leading-5 text-[#F4E8C8]/90">
            {copy.fingerprint}: {getPersonalEdgeReason(alert)}
          </div>
        ) : null}
      </div>

      {alert.personal_edge_status ? (
        <div className="shrink-0 rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#F4E8C8]">
          {String(alert.personal_edge_status).replaceAll("_", " ")}
        </div>
      ) : null}
    </div>

    {getShortRiskGuard(alert, language) ? (
      <div className="mt-2 flex items-start gap-2 text-[12px] font-bold leading-5 text-[#FFD7D9]/90">
        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF5A5F]" />
        <span>
          <span className="text-[#FF8A8E]">{copy.riskGuard}:</span>{" "}
          {getShortRiskGuard(alert, language)}
        </span>
      </div>
    ) : null}
  </div>
) : null}

          </div>

          {hasNewAlert && alert.id === newestAlertId ? (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
          ) : null}
        </div>
      </Link>
    ))
  ) : (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-sm font-semibold text-white">
        {copy.noAlertsTitle}
      </div>
      <div className="mt-2 text-xs leading-5 text-white/48">
        {loading ? copy.checking : copy.noAlertsText}
      </div>
    </div>
  )}
</div>

          <div className="flex items-center justify-between border-t border-white/10 p-3">
            <div className="text-[11px] text-white/38">
              {copy.opensFullCenter}
            </div>

            <Link
              href={`/dashboard?tab=signals${assetFilter === "all" ? "" : `&assetType=${getAlertAssetFilterUrlValue(assetFilter)}`}`}
              onClick={markSeen}
              className="rounded-full border border-[#00C076]/20 bg-[#00C076]/10 px-4 py-2 text-xs font-semibold text-[#DFFFEF] transition hover:bg-[#00C076]/15"
            >
              {copy.openDashboard}
            </Link>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            markSeen();
            setOpen(true);
          }}
          className={`group ml-auto flex items-center gap-3 rounded-full border px-4 py-3 text-left shadow-[0_18px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:scale-[1.02] ${
            hasNewAlert
              ? "border-emerald-300/35 bg-emerald-300/12"
              : "border-[#00C076]/25 bg-[#08111F]/92"
          }`}
        >
          <span
            className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
              hasNewAlert
                ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100"
                : "border-[#00C076]/25 bg-[#00C076]/10 text-[#DFFFEF]"
            }`}
          >
            AI
            {hasNewAlert ? (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.95)]" />
            ) : null}
          </span>

          <span>
            <span className="block text-xs font-semibold text-white">
              {copy.collapsedTitle}
            </span>
            <span className="block text-[11px] text-white/42">
  {filteredAlerts.length > 0 ? `${filteredAlerts.length} ${copy.latest}` : copy.noAlertsTitle}
</span>
          </span>
        </button>
      )}
    </div>
  );
}

export { GlobalAlertsWidget };
export default GlobalAlertsWidget;


