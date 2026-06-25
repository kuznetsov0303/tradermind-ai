"use client";

import InvestorDashboardSection from "@/components/admin/InvestorDashboardSection";

export default function AdminInvestorDashboardPage() {
  return (
    <main className="min-h-screen bg-[#050B14] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <a
              href="/admin"
              className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-bold text-slate-300 transition hover:bg-white/[0.08]"
            >
              ← Back to Admin Hub
            </a>

            <h1 className="mt-5 text-[34px] font-black tracking-tight text-white">
              Investor Dashboard
            </h1>

            <p className="mt-2 max-w-3xl text-[14px] leading-6 text-slate-400">
              Закрытый investor-grade раздел: продуктовая ценность, AI learning,
              PnL simulation, win rate, стратегии, readiness и масштабирование.
            </p>
          </div>

          <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.18em] text-emerald-200">
            Private admin view
          </div>
        </div>

        <InvestorDashboardSection />
      </div>
    </main>
  );
}
