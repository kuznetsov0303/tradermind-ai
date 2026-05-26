"use client";

export type ActivationPlanKey = "demo" | "core" | "edge" | "elite";
export type ActivationPeriodKey = "all" | "month" | "week" | "day";

export type ActivationStatsResponse = {
  stats: Record<ActivationPeriodKey, Record<ActivationPlanKey, number>>;
  totals: Record<ActivationPeriodKey, number>;
  updatedAt: string | null;
};

const planKeys: ActivationPlanKey[] = ["demo", "core", "edge", "elite"];
const periodRows: Array<{ key: ActivationPeriodKey; label: string; text: string }> = [
  { key: "all", label: "All time", text: "Все активации за всё время" },
  { key: "month", label: "This month", text: "Активации за календарный месяц" },
  { key: "week", label: "This week", text: "Активации за текущую неделю" },
  { key: "day", label: "Today", text: "Активации за сегодняшний день" },
];

export const emptyActivationStatsResponse: ActivationStatsResponse = {
  stats: {
    all: { demo: 0, core: 0, edge: 0, elite: 0 },
    month: { demo: 0, core: 0, edge: 0, elite: 0 },
    week: { demo: 0, core: 0, edge: 0, elite: 0 },
    day: { demo: 0, core: 0, edge: 0, elite: 0 },
  },
  totals: {
    all: 0,
    month: 0,
    week: 0,
    day: 0,
  },
  updatedAt: null,
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPlanLabel(plan: ActivationPlanKey) {
  if (plan === "demo") return "Demo";
  if (plan === "core") return "Core";
  if (plan === "edge") return "Edge";
  return "Elite";
}

export default function AdminActivationStatsBlock({
  stats,
  loading,
  onRefresh,
}: {
  stats: ActivationStatsResponse;
  loading: boolean;
  onRefresh: () => void;
}) {
  const data = stats || emptyActivationStatsResponse;

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-cyan-200/12 bg-white/[0.04] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/45">
            Client activations
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">
            Activation statistics
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/50">
            Каждая новая активация тарифа считается отдельным событием. Если старый клиент продлил доступ — это тоже +1 к статистике.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-bold text-white/45">
            Updated: {formatDateTime(data.updatedAt)}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-cyan-200/16 bg-cyan-200/[0.07] px-5 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-200/[0.12]"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[860px] border-separate border-spacing-y-3 text-left">
          <thead>
            <tr className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
              <th className="px-3 py-2">Period</th>
              {planKeys.map((plan) => (
                <th key={plan} className="px-3 py-2">
                  {getPlanLabel(plan)}
                </th>
              ))}
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>

          <tbody>
            {periodRows.map((period) => (
              <tr key={period.key} className="rounded-2xl border border-white/10 bg-black/20">
                <td className="rounded-l-2xl px-3 py-4">
                  <div className="font-black text-white">{period.label}</div>
                  <div className="mt-1 text-xs font-semibold text-white/38">
                    {period.text}
                  </div>
                </td>

                {planKeys.map((plan) => (
                  <td key={plan} className="px-3 py-4">
                    <div className="inline-flex min-w-16 justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2 text-xl font-black text-white">
                      {data.stats[period.key]?.[plan] || 0}
                    </div>
                  </td>
                ))}

                <td className="rounded-r-2xl px-3 py-4">
                  <div className="inline-flex min-w-20 justify-center rounded-2xl border border-emerald-300/18 bg-emerald-300/[0.08] px-4 py-2 text-xl font-black text-emerald-100">
                    {data.totals[period.key] || 0}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

