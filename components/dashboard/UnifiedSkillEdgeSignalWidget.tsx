"use client";

// S8.66 Dashboard Unified Signal Widget
// Client-safe SkillEdge AI signal output widget.
// Reads only /api/stock-engine/unified-skilledge-output and displays only clientOutput.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  UnifiedSkillEdgeOutputResponse,
  UnifiedSkillEdgeSignalCard,
} from "@/lib/trading/unified-skilledge-output";
import { fetchUnifiedSkillEdgeOutput } from "@/lib/trading/unified-skilledge-output";

type Props = {
  language?: string;
};

function normalizeLanguage(language?: string) {
  if (language === "en" || language === "ua" || language === "ru") return language;
  return "ru";
}

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function formatRiskReward(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(1)}R`;
}

function getCopy(language?: string) {
  const safeLanguage = normalizeLanguage(language);

  if (safeLanguage === "en") {
    return {
      eyebrow: "SkillEdge AI",
      title: "Unified signal output",
      subtitle:
        "This is the client-safe signal layer. Only fully approved SkillEdge AI signals appear here.",
      approved: "Approved",
      researchOnly: "Research only",
      state: "State",
      blockedBy: "Top gate",
      refresh: "Refresh",
      refreshing: "Refreshing...",
      lastUpdated: "Updated",
      emptyTitle: "No approved SkillEdge AI signals right now",
      emptyText:
        "The engine is monitoring the market, but no signal has passed quality, RR and manual approval gates yet.",
      safeLayer: "Client-safe layer",
      rr: "RR",
      grade: "Grade",
      entry: "Entry",
      stop: "Stop",
      targets: "Targets",
      loading: "Loading SkillEdge AI output...",
      unavailable: "SkillEdge AI output is temporarily unavailable.",
      manualGate: "Manual approval gate is ON",
    };
  }

  if (safeLanguage === "ua") {
    return {
      eyebrow: "SkillEdge AI",
      title: "Єдиний вихід сигналів",
      subtitle:
        "Це безпечний клієнтський шар сигналів. Тут з’являються тільки повністю підтверджені сигнали SkillEdge AI.",
      approved: "Схвалено",
      researchOnly: "Research only",
      state: "Стан",
      blockedBy: "Головний gate",
      refresh: "Оновити",
      refreshing: "Оновлюю...",
      lastUpdated: "Оновлено",
      emptyTitle: "Зараз немає підтверджених сигналів SkillEdge AI",
      emptyText:
        "Engine моніторить ринок, але жоден сигнал ще не пройшов quality, RR і manual approval gates.",
      safeLayer: "Client-safe layer",
      rr: "RR",
      grade: "Grade",
      entry: "Entry",
      stop: "Stop",
      targets: "Targets",
      loading: "Завантажую SkillEdge AI output...",
      unavailable: "SkillEdge AI output тимчасово недоступний.",
      manualGate: "Manual approval gate увімкнено",
    };
  }

  return {
    eyebrow: "SkillEdge AI",
    title: "Единый выход сигналов",
    subtitle:
      "Это безопасный клиентский слой сигналов. Здесь появляются только полностью подтверждённые сигналы SkillEdge AI.",
    approved: "Одобрено",
    researchOnly: "Research only",
    state: "Состояние",
    blockedBy: "Главный gate",
    refresh: "Обновить",
    refreshing: "Обновляю...",
    lastUpdated: "Обновлено",
    emptyTitle: "Сейчас нет подтверждённых сигналов SkillEdge AI",
    emptyText:
      "Engine мониторит рынок, но ни один сигнал ещё не прошёл quality, RR и manual approval gates.",
    safeLayer: "Client-safe layer",
    rr: "RR",
    grade: "Grade",
    entry: "Entry",
    stop: "Stop",
    targets: "Targets",
    loading: "Загружаю SkillEdge AI output...",
    unavailable: "SkillEdge AI output временно недоступен.",
    manualGate: "Manual approval gate включён",
  };
}

function getStateTone(displayState?: string) {
  if (!displayState) return "border-white/10 bg-white/[0.035] text-white/60";
  if (displayState.includes("CLIENT_VISIBLE") || displayState.includes("APPROVED")) {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-50";
  }
  if (displayState.includes("BLOCKED") || displayState.includes("GATES")) {
    return "border-[#C8A96B]/24 bg-[#C8A96B]/10 text-[#F4E8C8]";
  }
  return "border-cyan-300/20 bg-cyan-300/10 text-cyan-50";
}

function SignalCard({
  card,
  copy,
}: {
  card: UnifiedSkillEdgeSignalCard;
  copy: ReturnType<typeof getCopy>;
}) {
  const targets = card.levels?.targets?.slice(0, 2) || [];

  return (
    <div className="rounded-[1.35rem] border border-emerald-300/16 bg-emerald-300/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100/50">
            {card.direction || "—"} · {card.setupSlug || "setup"}
          </div>
          <h4 className="mt-1 text-xl font-black tracking-[-0.035em] text-white">
            {card.symbol || "—"}
          </h4>
        </div>

        <div className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-50">
          {copy.grade} {card.grade || "—"}
        </div>
      </div>

      <p className="mt-3 text-sm font-semibold leading-6 text-white/58">
        {card.safeClientCopy?.title || card.headline || "SkillEdge AI signal"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">{copy.entry}</div>
          <div className="mt-1 text-sm font-black text-white">{formatPrice(card.levels?.entry)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">{copy.stop}</div>
          <div className="mt-1 text-sm font-black text-white">{formatPrice(card.levels?.stop)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">{copy.rr}</div>
          <div className="mt-1 text-sm font-black text-white">{formatRiskReward(card.riskReward)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">{copy.targets}</div>
          <div className="mt-1 truncate text-sm font-black text-white">
            {targets.length > 0
              ? targets.map((target) => formatPrice(target.price)).join(" / ")
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedSkillEdgeSignalWidget({ language }: Props) {
  const copy = useMemo(() => getCopy(language), [language]);
  const [output, setOutput] = useState<UnifiedSkillEdgeOutputResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadOutput = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const payload = await fetchUnifiedSkillEdgeOutput({
          limit: 50,
          refresh,
        });

        setOutput(payload);
        setLastUpdated(new Date().toISOString());

        if (!payload.ok) {
          setError(payload.summary?.topBlockedReason || copy.unavailable);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : copy.unavailable);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [copy.unavailable],
  );

  useEffect(() => {
    loadOutput(false);
  }, [loadOutput]);

  const approvedCards = output?.clientOutput?.cards || [];
  const summary = output?.summary;
  const displayState = summary?.displayState || output?.clientOutput?.displayState || "LOADING";
  const emptyTitle = output?.clientOutput?.emptyState?.title || copy.emptyTitle;
  const emptyMessage = output?.clientOutput?.emptyState?.message || copy.emptyText;

  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-[#C8A96B]/18 bg-[#07111F]/92 p-5 shadow-[0_22px_90px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#C8A96B]/22 bg-[#C8A96B]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#F4E8C8]/72">
            {copy.eyebrow} · {copy.safeLayer}
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.045em] text-white">
            {copy.title}
          </h3>
          <p className="mt-2 max-w-5xl text-sm font-semibold leading-6 text-white/58">
            {copy.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated ? (
            <div className="rounded-full border border-white/10 bg-black/24 px-4 py-2 text-xs font-semibold text-white/52">
              {copy.lastUpdated}:{" "}
              {new Date(lastUpdated).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => loadOutput(true)}
            disabled={refreshing || loading}
            className="rounded-full border border-[#C8A96B]/24 bg-[#C8A96B]/10 px-5 py-2.5 text-sm font-black text-[#F4E8C8] transition hover:bg-[#C8A96B]/16 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {refreshing ? copy.refreshing : copy.refresh}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/50">
            {copy.approved}
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {summary?.clientVisibleCount ?? approvedCards.length}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
            {copy.researchOnly}
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {summary?.researchOnlyCount ?? 0}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${getStateTone(displayState)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-65">
            {copy.state}
          </div>
          <div className="mt-2 break-words text-sm font-black">
            {displayState}
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8A96B]/16 bg-[#C8A96B]/[0.055] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F4E8C8]/62">
            {copy.blockedBy}
          </div>
          <div className="mt-2 break-words text-sm font-black text-[#F4E8C8]">
            {summary?.topBlockedReason || copy.manualGate}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm font-semibold text-white/52">
          {copy.loading}
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-amber-300/18 bg-amber-300/[0.055] p-5 text-sm font-semibold leading-6 text-amber-50/72">
          {error}
        </div>
      ) : approvedCards.length > 0 ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {approvedCards.slice(0, 4).map((card: UnifiedSkillEdgeSignalCard, index: number) => (
            <SignalCard
              key={card.signalId || `${card.symbol || "signal"}-${index}`}
              card={card}
              copy={copy}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-black/22 p-5">
          <div className="text-lg font-black text-white">
            {emptyTitle}
          </div>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-white/52">
            {emptyMessage}
          </p>
          <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/46">
            {copy.manualGate}
          </div>
        </div>
      )}
    </section>
  );
}
