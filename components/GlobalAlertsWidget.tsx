"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  created_at?: string | null;
  timestamp?: string | null;
};

function normalizeAlert(raw: any): GlobalAlert | null {
  if (!raw || typeof raw !== "object") return null;

  const id =
    raw.id ||
    raw.alert_id ||
    raw.uuid ||
    `${raw.ticker || raw.symbol || "alert"}-${raw.created_at || Date.now()}`;

  return {
    id: String(id),
    ticker: raw.ticker ?? raw.symbol ?? raw.asset ?? null,
    symbol: raw.symbol ?? raw.ticker ?? raw.asset ?? null,
    direction: raw.direction ?? raw.bias ?? null,
    setup: raw.setup ?? raw.setup_name ?? raw.title ?? null,
    setup_type: raw.setup_type ?? raw.type ?? null,
    title: raw.title ?? raw.headline ?? null,
    priority:
      typeof raw.priority === "number"
        ? raw.priority
        : typeof raw.score === "number"
          ? raw.score
          : typeof raw.confidence === "number"
            ? raw.confidence
            : null,
    confidence:
      typeof raw.confidence === "number"
        ? raw.confidence
        : typeof raw.score === "number"
          ? raw.score
          : null,
    created_at: raw.created_at ?? raw.createdAt ?? raw.timestamp ?? null,
    timestamp: raw.timestamp ?? raw.created_at ?? raw.createdAt ?? null,
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
    .filter(Boolean)
    .slice(0, 3) as GlobalAlert[];
}

function getAlertTitle(alert: GlobalAlert) {
  const ticker = alert.ticker || alert.symbol || "Market";
  const setup = alert.setup || alert.setup_type || alert.title || "AI alert";

  return `${ticker} · ${setup}`;
}

function getAlertMeta(alert: GlobalAlert) {
  const parts = [];

  if (alert.direction) parts.push(alert.direction.toUpperCase());

  if (typeof alert.priority === "number") {
    parts.push(`Priority ${Math.round(alert.priority)}`);
  } else if (typeof alert.confidence === "number") {
    parts.push(`Confidence ${Math.round(alert.confidence)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "New trading desk alert";
}

function GlobalAlertsWidget() {
  const [hasSession, setHasSession] = useState(false);
  const [alerts, setAlerts] = useState<GlobalAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastAlertId, setLastAlertId] = useState<string | null>(null);
  const firstLoadRef = useRef(true);

  const newestAlertId = alerts[0]?.id ?? null;

  const hasNewAlert = useMemo(() => {
    return Boolean(newestAlertId && lastAlertId && newestAlertId !== lastAlertId);
  }, [newestAlertId, lastAlertId]);

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

        const response = await fetch("/api/market/alerts?limit=3&scope=global", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

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

    const interval = window.setInterval(loadAlerts, 60_000);

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

  if (!hasSession || alerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-24 right-4 z-[9997] w-[calc(100vw-2rem)] max-w-sm md:right-6">
      {open ? (
        <div className="overflow-hidden rounded-[1.6rem] border border-cyan-300/25 bg-[#08111f]/95 shadow-[0_24px_90px_rgba(0,0,0,0.72),0_0_42px_rgba(34,211,238,0.18)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100/55">
                SkillEdge AI Alerts
              </div>

              <div className="mt-1 text-base font-semibold text-white">
                Live trading desk
              </div>

              <div className="mt-1 text-xs text-white/42">
                {loading ? "Checking alerts..." : "Latest opportunities"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                markSeen();
                setOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-2 p-3">
            {alerts.map((alert) => (
              <Link
                key={alert.id}
                href="/dashboard"
                onClick={markSeen}
                className="block rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {getAlertTitle(alert)}
                    </div>

                    <div className="mt-1 text-xs text-cyan-100/58">
                      {getAlertMeta(alert)}
                    </div>
                  </div>

                  {hasNewAlert && alert.id === newestAlertId ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
                  ) : null}
                </div>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-3">
            <div className="text-[11px] text-white/38">
              Opens full Alerts Center
            </div>

            <Link
              href="/dashboard"
              onClick={markSeen}
              className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Open dashboard
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
              : "border-cyan-300/25 bg-[#08111f]/92"
          }`}
        >
          <span
            className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
              hasNewAlert
                ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100"
                : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
            }`}
          >
            AI
            {hasNewAlert ? (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.95)]" />
            ) : null}
          </span>

          <span>
            <span className="block text-xs font-semibold text-white">
              AI Alerts
            </span>
            <span className="block text-[11px] text-white/42">
              {alerts.length} latest
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
export { GlobalAlertsWidget };
export default GlobalAlertsWidget;