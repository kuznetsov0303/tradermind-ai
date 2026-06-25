"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Json = Record<string, unknown>;
type Period = "today" | "7d" | "30d" | "all";

function isJson(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rec(value: unknown): Json {
  return isJson(value) ? value : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function strings(value: unknown): string[] {
  return arr(value)
    .map((item) => {
      if (typeof item === "string") return item;
      const record = rec(item);
      return str(record.label, "") || str(record.title, "") || str(record.message, "") || str(record.note, "");
    })
    .filter(Boolean);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace("%", "").replace("$", "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pct(value: unknown) {
  const n = num(value);
  return n === null ? "—" : `${n.toFixed(2)}%`;
}

function r(value: unknown) {
  const n = num(value);
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(3)}R`;
}

function usd(value: unknown) {
  const n = num(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function unwrap(raw: unknown): Json | null {
  if (!isJson(raw)) return null;
  const first = isJson(raw.value) ? raw.value : raw;
  return isJson(first.value) ? first.value : first;
}

function linePath(values: number[], width = 780, height = 250, pad = 22) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / range) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-3 text-[28px] font-black text-white">{value}</div>
      <div className="mt-1 text-[13px] text-slate-400">{sub}</div>
    </div>
  );
}

function Widget({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[26px] border border-white/10 bg-[#0B1422] p-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-black text-white">{title}</h3>
          <p className="mt-1 text-[13px] leading-5 text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-slate-300 group-open:hidden">
          раскрыть
        </span>
        <span className="hidden rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[12px] text-emerald-200 group-open:inline-flex">
          открыто
        </span>
      </summary>

      <div className="mt-5 border-t border-white/10 pt-5">
        {children}
      </div>
    </details>
  );
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-emerald-200">{title}</div>
      <p className="mt-3 text-[14px] leading-6 text-slate-300">{text}</p>
    </div>
  );
}

export default function InvestorDashboardSection() {
  const [snapshot, setSnapshot] = useState<Json | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (run = false) => {
    setError("");
    setRefreshing(run);

    try {
      const response = await fetch(
        run
          ? "/api/stock-engine/investor-dashboard/run?publish=true"
          : "/api/stock-engine/investor-dashboard/cache",
        { method: run ? "POST" : "GET", cache: "no-store" },
      );

      const raw: unknown = await response.json();
      const data = unwrap(raw);

      if (!response.ok || data?.ok !== true) {
        throw new Error(`Investor snapshot failed: ${response.status}`);
      }

      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Investor dashboard failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => {
      void load(false);
    }, 0);

    const timer = window.setInterval(() => {
      void load(false);
    }, 60000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const view = useMemo(() => {
    const data = snapshot || {};
    const metrics = rec(data.headlineMetrics);
    const sim = rec(data.equitySimulation);
    const all = rec(sim.allClosedOutcomes);
    const elite = rec(sim.cleanEliteLayer);
    const readiness = rec(data.marketingReadiness);
    const narrative = rec(data.investorNarrative);
    const learning = rec(data.setupLearning);

    const strategyRows = arr(learning.cards).filter(isJson);
    const curveRows = arr(all.curveSample).filter(isJson);
    const curveValues = curveRows
      .map((row) => num(row.equity))
      .filter((value): value is number => value !== null);

    const dailyRows = curveRows.map((row, index) => ({
      label: str(row.date, `T${index + 1}`),
      equity: num(row.equity),
      pnl: num(row.resultR),
      setup: str(row.setupSlug, "—"),
      symbol: str(row.symbol, "—"),
    }));

    const rowsByPeriod =
      period === "today"
        ? dailyRows.slice(-1)
        : period === "7d"
          ? dailyRows.slice(-7)
          : period === "30d"
            ? dailyRows.slice(-30)
            : dailyRows;

    return {
      rawWinRate: metrics.rawWinRateClosed,
      rawAvgR: metrics.rawAvgResultRClosed,
      rawClosed: metrics.rawClosedOutcomes,
      finalEquity: all.finalEquity,
      totalReturnPct: all.totalReturnPct,
      maxDrawdownPct: all.maxDrawdownPct,
      cleanEliteClosed: elite.closedTrades,
      cleanEliteStatus: str(elite.status, "collecting clean elite sample"),
      readinessStatus: str(readiness.status, "PRIVATE_BETA_AND_WAITLIST"),
      recommendation: str(readiness.recommendation, "Private beta / waitlist до clean elite sample."),
      positives: strings(readiness.positives),
      blockers: strings(readiness.blockers),
      currentTruth: str(narrative.currentTruth, "Raw historical layer используется как обучающая база, а clean Elite layer набирает статистику отдельно."),
      whatImproved: str(narrative.whatImproved, "S8.14A/C блокирует слабые сетапы из best/elite selection на основе entry health, RR и setup-learning evidence."),
      whyNotFullMarketing: str(narrative.whyNoAggressiveMarketingYet, "Нужно 50–100 закрытых clean Elite signals с устойчивым win rate, положительным expectancy и контролируемым drawdown."),
      nextStep: str(narrative.nextEngineeringStep, "Наращиваем clean Elite sample, расширяем strategy library и делаем investor-grade daily analytics."),
      strategyRows,
      curveValues,
      dailyRows: rowsByPeriod,
      aiLearningLog: strings(data.aiLearningLog),
    };
  }, [snapshot, period]);

  const path = linePath(view.curveValues.length > 1 ? view.curveValues : [50000, num(view.finalEquity) ?? 50000]);

  if (loading) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[#07111F] p-6 text-slate-300">
        Загружаем Investor Dashboard…
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-[32px] border border-white/10 bg-[#07111F] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
              Investor view
            </span>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
              {view.readinessStatus}
            </span>
          </div>

          <h2 className="mt-4 text-[28px] font-black tracking-tight text-white">
            SkillEdge AI Investor Brief
          </h2>

          <p className="mt-2 max-w-4xl text-[14px] leading-6 text-slate-400">
            Аккуратный закрытый раздел для инвестора: ценность продукта, уникальность,
            путь масштабирования, AI learning, PnL simulation, win rate и стратегия развития.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-4 py-2 text-[13px] font-bold text-emerald-100 disabled:opacity-60"
        >
          {refreshing ? "Обновляем…" : "Обновить snapshot"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Общий win rate" value={pct(view.rawWinRate)} sub={`${view.rawClosed ?? "—"} closed outcomes`} />
        <Kpi label="Средний результат" value={r(view.rawAvgR)} sub="avg R per closed trade" />
        <Kpi label="$50k simulation" value={usd(view.finalEquity)} sub={`${pct(view.totalReturnPct)} return / ${pct(view.maxDrawdownPct)} DD`} />
        <Kpi label="Clean Elite layer" value={String(view.cleanEliteClosed ?? 0)} sub={view.cleanEliteStatus} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Widget
          title="Продуктовая и инвестиционная ценность"
          subtitle="Короткие ответы на ключевые вопросы инвестора."
          defaultOpen
        >
          <div className="grid gap-3 md:grid-cols-2">
            <InfoTile
              title="1) Ценность для клиентов"
              text="Клиент получает не поток случайных сигналов, а trading desk: готовые сценарии, entry/stop/targets, фильтр качества, объяснение идеи и контроль риска."
            />
            <InfoTile
              title="2) Уникальность"
              text="SkillEdge объединяет scanner, setup engine, strict gates, AI Cockpit, post-close outcomes и self-learning loop. Система не только даёт идеи, но и каждый день проверяет себя."
            />
            <InfoTile
              title="3) Интерес для инвестора"
              text="Это масштабируемый SaaS с подписочной моделью, высокой маржинальностью, расширяемой strategy library и потенциальным ростом LTV по мере улучшения AI."
            />
            <InfoTile
              title="4) Как AI учится"
              text="После рынка система закрывает outcomes, считает R, MFE/MAE, win rate, failure patterns, демотит слабые условия и усиливает сетапы, которые показывают evidence."
            />
          </div>
        </Widget>

        <Widget
          title="Marketing readiness"
          subtitle="Когда можно запускать маркетинг и что пока блокирует scale."
          defaultOpen
        >
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-[14px] leading-6 text-amber-100">
            {view.recommendation}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SmallList title="Плюсы" items={view.positives} tone="green" />
            <SmallList title="Blockers" items={view.blockers} tone="red" />
          </div>
        </Widget>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Widget
          title="PnL / Equity simulation"
          subtitle="Наглядная модель: клиент входит во все сигналы, риск 1% от депозита."
          defaultOpen
        >
          <div className="rounded-[22px] border border-white/10 bg-[#040B14] p-4">
            <svg viewBox="0 0 780 250" className="h-[250px] w-full">
              <defs>
                <linearGradient id="equityLine" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#00C076" />
                  <stop offset="100%" stopColor="#C8A96B" />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }).map((_, index) => (
                <line
                  key={index}
                  x1="22"
                  x2="758"
                  y1={24 + index * 50}
                  y2={24 + index * 50}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="4 6"
                />
              ))}

              <path
                d={path}
                fill="none"
                stroke="url(#equityLine)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <Mini label="Start" value="$50,000" />
              <Mini label="Equity" value={usd(view.finalEquity)} />
              <Mini label="Return" value={pct(view.totalReturnPct)} />
              <Mini label="Max DD" value={pct(view.maxDrawdownPct)} />
            </div>
          </div>
        </Widget>

        <Widget
          title="Дневная статистика"
          subtitle="Маленькое окно с выбором периода."
          defaultOpen
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {(["today", "7d", "30d", "all"] as Period[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={`rounded-full border px-3 py-1 text-[12px] font-bold ${
                  period === item
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.04] text-slate-400"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="max-h-[250px] space-y-2 overflow-auto pr-1">
            {view.dailyRows.length > 0 ? (
              view.dailyRows.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-[13px]"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-white">{row.label}</span>
                    <span className="text-slate-300">{usd(row.equity)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 text-slate-500">
                    <span>{row.symbol} · {row.setup}</span>
                    <span>{r(row.pnl)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-[13px] text-slate-400">
                Daily rows появятся после накопления новых snapshot/outcome данных.
              </div>
            )}
          </div>
        </Widget>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Widget
          title="Win rate по стратегиям"
          subtitle="Общая таблица сетапов без длинных списков."
          defaultOpen
        >
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr_0.6fr] bg-white/[0.04] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              <div>Strategy</div>
              <div>WR</div>
              <div>Avg R</div>
              <div>Closed</div>
            </div>

            {view.strategyRows.slice(0, 10).map((row) => (
              <div
                key={str(row.setupSlug, str(row.setupName))}
                className="grid grid-cols-[1.3fr_0.6fr_0.6fr_0.6fr] border-t border-white/10 px-3 py-3 text-[13px] text-slate-300"
              >
                <div className="font-bold text-white">{str(row.setupSlug, str(row.setupName))}</div>
                <div>{pct(row.winRateClosed)}</div>
                <div>{r(row.avgResultRClosed)}</div>
                <div>{String(row.closed ?? "—")}</div>
              </div>
            ))}
          </div>
        </Widget>

        <Widget
          title="AI learning log"
          subtitle="Что система поняла и как меняет правила."
          defaultOpen
        >
          <div className="space-y-2">
            {(view.aiLearningLog.length > 0 ? view.aiLearningLog.slice(0, 6) : [
              "AI отделяет raw candidates от clean Elite layer.",
              "Слабые setups уходят в monitor/paper до улучшения evidence.",
              "Каждый post-close report превращается в penalties/boosts для selector.",
            ]).map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-[13px] leading-5 text-slate-300"
              >
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                {item}
              </div>
            ))}
          </div>
        </Widget>
      </div>

      <Widget
        title="Investor narrative"
        subtitle="Короткий executive summary без перегруза."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile title="Current truth" text={view.currentTruth} />
          <InfoTile title="What improved" text={view.whatImproved} />
          <InfoTile title="Why not full marketing" text={view.whyNotFullMarketing} />
          <InfoTile title="Next step" text={view.nextStep} />
        </div>
      </Widget>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-[15px] font-black text-white">{value}</div>
    </div>
  );
}

function SmallList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "green" | "red";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className={tone === "green" ? "text-emerald-200" : "text-red-200"}>
        {title}
      </div>
      <div className="mt-2 space-y-1">
        {(items.length ? items.slice(0, 5) : ["—"]).map((item) => (
          <div key={item} className="text-[12px] leading-5 text-slate-400">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}