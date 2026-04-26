"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

type TabId =
  | "overview"
  | "journal"
  | "charts"
  | "coach"
  | "learning"
  | "reports"
  | "billing";

type PlanId = "starter" | "pro" | "elite";
type BillingPeriod = "monthly" | "halfyear" | "yearly";

type Subscription = {
  active: boolean;
  plan: PlanId | null;
  period: BillingPeriod | null;
  aiLimit: number;
  aiUsed: number;
  expiresAt: string | null;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "journal", label: "Журнал сделок" },
  { id: "charts", label: "Графики" },
  { id: "coach", label: "AI-коуч" },
  { id: "learning", label: "Обучение" },
  { id: "reports", label: "Отчёты" },
  { id: "billing", label: "Тариф" },
];

const planNames: Record<PlanId, string> = {
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

const periodNames: Record<BillingPeriod, string> = {
  monthly: "1 месяц",
  halfyear: "6 месяцев",
  yearly: "1 год",
};

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription>({
    active: false,
    plan: null,
    period: null,
    aiLimit: 0,
    aiUsed: 0,
    expiresAt: null,
  });

  useEffect(() => {
    async function loadDashboard() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const user = userData.user;
      setEmail(user.email ?? null);

      const { data: subData, error } = await supabase
  .from("subscriptions")
  .select("*")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();


if (!error && subData && subData.status === "active") {
  setSubscription({
    active: true,
    plan: subData.plan_id as PlanId,
    period: subData.billing_period as BillingPeriod,
    aiLimit: subData.ai_monthly_limit ?? 0,
    aiUsed: subData.ai_used_this_month ?? 0,
    expiresAt: subData.expires_at ?? null,
  });
}

      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const locked = !subscription.active;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050813] px-4 py-6 text-white md:px-8">
      <BackgroundFX />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-indigo-950/20 backdrop-blur-xl"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/45">
                SkillEdge AI Terminal
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
                Личный кабинет
              </h1>

              <p className="mt-3 text-sm text-white/55">
                Пользователь:{" "}
                <span className="text-white/75">{email || "загрузка..."}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="/?page=pricing"
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
              >
                Выбрать тариф
              </a>

              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="mt-7 overflow-x-auto">
            <div className="flex min-w-max gap-2 rounded-full border border-white/10 bg-black/20 p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative rounded-full px-5 py-3 text-sm transition ${
                    activeTab === tab.id
                      ? "text-black"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.span
                      layoutId="active-dashboard-tab"
                      className="absolute inset-0 rounded-full bg-white shadow-lg shadow-white/10"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mt-6 grid gap-6 lg:grid-cols-[1fr_330px]"
        >
          <section className="relative min-h-[650px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent" />

            {!loading && locked && activeTab !== "billing" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050813]/50 backdrop-blur-[6px]">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="relative max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#101522]/90 p-8 text-center shadow-2xl shadow-indigo-950/40"
                >
                  <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
                  <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

                  <div className="relative">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                      <span className="text-2xl">✦</span>
                    </div>

                    <p className="mt-5 text-xs uppercase tracking-[0.28em] text-white/40">
                      Доступ закрыт
                    </p>

                    <h2 className="mt-3 text-3xl font-semibold">
                      Активируйте тариф
                    </h2>

                    <p className="mt-4 text-sm leading-7 text-white/60">
                      После оплаты откроются журнал сделок, SkillEdge AI-коуч,
                      графики TradingView, обучение, отчёты и история
                      AI-разборов.
                    </p>

                    <a
                      href="/?page=pricing"
                      className="mt-7 inline-flex rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.03]"
                    >
                      Выбрать тариф
                    </a>
                  </div>
                </motion.div>
              </div>
            )}

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={!loading && locked && activeTab !== "billing" ? "blur-md" : ""}
            >
              {activeTab === "overview" && <OverviewTab />}
              {activeTab === "journal" && <JournalTab />}
              {activeTab === "charts" && <ChartsTab />}
              {activeTab === "coach" && <CoachTab />}
              {activeTab === "learning" && <LearningTab />}
              {activeTab === "reports" && <ReportsTab />}
              {activeTab === "billing" && (
                <BillingTab subscription={subscription} loading={loading} />
              )}
            </motion.div>
          </section>

          <aside className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.15 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-white/35">
                Текущий тариф
              </p>

              <h3 className="mt-3 text-2xl font-semibold">
                {loading
                  ? "Загрузка..."
                  : subscription.active && subscription.plan
                  ? planNames[subscription.plan]
                  : "Не активирован"}
              </h3>

              <p className="mt-3 text-sm leading-7 text-white/50">
                {subscription.active && subscription.plan && subscription.period
                  ? `${periodNames[subscription.period]} · действует до ${formatDate(
                      subscription.expiresAt
                    )}`
                  : "Активируйте тариф, чтобы открыть функции кабинета."}
              </p>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/45">AI usage</span>
                  <span className="text-white/70">
                    {subscription.aiLimit > 0
                      ? `${subscription.aiUsed}/${subscription.aiLimit}`
                      : "0%"}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-cyan-300"
                    style={{
                      width:
                        subscription.aiLimit > 0
                          ? `${Math.min(
                              100,
                              (subscription.aiUsed / subscription.aiLimit) * 100
                            )}%`
                          : "8%",
                    }}
                  />
                </div>
              </div>
              
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-indigo-500/10 to-white/[0.035] p-6 backdrop-blur-xl"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-white/35">
                Quick actions
              </p>

              <div className="mt-5 space-y-3">
                <ActionButton label="Добавить сделку" disabled={locked} />
                <ActionButton label="Загрузить скрин" disabled={locked} />
                <ActionButton label="Спросить AI" disabled={locked} />
                <ActionButton label="Создать отчёт" disabled={locked} />
              </div>
            </motion.div>
          </aside>
        </motion.section>
      </div>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function BackgroundFX() {
  return (
    <>
      <motion.div
        className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-8%] top-[15%] h-[380px] w-[380px] rounded-full bg-cyan-500/10 blur-3xl"
        animate={{ x: [0, -35, 0], y: [0, 25, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-15%] left-[35%] h-[460px] w-[460px] rounded-full bg-fuchsia-500/10 blur-3xl"
        animate={{ x: [0, 25, 0], y: [0, -35, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] opacity-20" />
    </>
  );
}

function ActionButton({
  label,
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      className={`w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm transition ${
        disabled
          ? "cursor-not-allowed bg-white/[0.025] text-white/25"
          : "bg-white/[0.04] text-white/65 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function OverviewTab() {
  return (
    <div>
      <SectionHeader
        title="Обзор эффективности"
        text="Сводка PnL, win rate, discipline score, лучшие сетапы и главные ошибки."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="PnL за месяц" value="$0" />
        <MetricCard label="Win rate" value="—" />
        <MetricCard label="Discipline score" value="—" />
      </div>

      <PlaceholderBlock title="AI-сводка недели" />
    </div>
  );
}

function JournalTab() {
  return (
    <div>
      <SectionHeader
        title="Журнал сделок"
        text="Добавляйте сделки, теги, эмоции, риск, скриншоты и заметки."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlaceholderBlock title="Добавить сделку" />
        <PlaceholderBlock title="История сделок" />
      </div>
    </div>
  );
}

function ChartsTab() {
  return (
    <div>
      <SectionHeader
        title="Графики TradingView"
        text="Встроенный график TradingView для анализа тикеров и сетапов."
      />

      <div className="mt-8 h-[420px] rounded-3xl border border-white/10 bg-black/30 p-6">
        <div className="flex h-full items-center justify-center text-white/40">
          TradingView widget будет добавлен на следующем этапе
        </div>
      </div>
    </div>
  );
}

function CoachTab() {
  return (
    <div>
      <SectionHeader
        title="SkillEdge AI-коуч"
        text="AI-разборы сделок, pre-trade checks, анализ ошибок и скриншотов."
      />

      <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-5">
        <textarea
          placeholder="Опиши сетап, сделку или ошибку..."
          className="min-h-40 w-full resize-none rounded-2xl border border-white/10 bg-[#070b16] p-4 text-white outline-none"
        />
        <button className="mt-4 rounded-full bg-white px-6 py-3 text-sm font-medium text-black">
          Спросить AI-коуча
        </button>
      </div>
    </div>
  );
}

function LearningTab() {
  return (
    <div>
      <SectionHeader
        title="Обучение"
        text="Уроки, чеклисты, видео, PDF и торговые материалы."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlaceholderBlock title="Базовый курс" />
        <PlaceholderBlock title="Разбор сетапов" />
      </div>
    </div>
  );
}

function ReportsTab() {
  return (
    <div>
      <SectionHeader
        title="Отчёты"
        text="Дневные, недельные и месячные отчёты с возможностью скачать или распечатать."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlaceholderBlock title="Недельный отчёт" />
        <PlaceholderBlock title="PDF-экспорт" />
      </div>
    </div>
  );
}

function BillingTab({
  subscription,
  loading,
}: {
  subscription: Subscription;
  loading: boolean;
}) {
  return (
    <div>
      <SectionHeader
        title="Тариф и оплата"
        text="Информация о текущем тарифе, оплатах и сроке действия подписки."
      />

      <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-6">
        <h3 className="text-2xl font-semibold">
          {loading
            ? "Загрузка..."
            : subscription.active && subscription.plan
            ? `Тариф активен: ${planNames[subscription.plan]}`
            : "Тариф не активирован"}
        </h3>

        <p className="mt-3 text-white/60">
          {subscription.active && subscription.period
            ? `Период: ${periodNames[subscription.period]}. Действует до ${formatDate(
                subscription.expiresAt
              )}.`
            : "После оплаты здесь появятся план, период, дата окончания и лимиты AI."}
        </p>

        <a
          href="/?page=pricing"
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-black"
        >
          Выбрать тариф
        </a>
      </div>
    </div>
  );
}

function SectionHeader({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-3xl font-semibold md:text-4xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">{text}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
      <p className="text-sm text-white/45">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function PlaceholderBlock({ title }: { title: string }) {
  return (
    <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-6">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/55">
        Этот модуль будет подключён к базе данных, тарифам и AI-логике на
        следующих этапах.
      </p>
    </div>
  );
}