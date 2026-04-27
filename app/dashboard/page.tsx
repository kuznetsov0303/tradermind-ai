"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

type Language = "en" | "ru" | "ua";

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
  isDemo: boolean;
  plan: PlanId | null;
  period: BillingPeriod | null;
  aiLimit: number;
  aiUsed: number;
  expiresAt: string | null;
};

type AiAnalysis = {
  id: string;
  user_message: string;
  ai_response: string;
  model: string | null;
  tokens_used: number | null;
  created_at: string | null;
};

const dashboardDict = {
  en: {
    terminal: "SkillEdge AI Terminal",
    dashboard: "Dashboard",
    user: "User",
    choosePlan: "Choose plan",
    logout: "Log out",
    currentPlan: "Current plan",
    loading: "Loading...",
    notActivated: "Not activated",
    activatePlan: "Activate a plan to unlock dashboard features.",
    aiUsage: "AI usage",
    quickActions: "Quick actions",
    addTrade: "Add trade",
    uploadScreenshot: "Upload screenshot",
    askAI: "Ask AI",
    createReport: "Create report",
    overview: {
  title: "Performance overview",
  text: "PnL summary, win rate, discipline score, best setups and main mistakes.",
  pnlMonth: "Monthly PnL",
  winRate: "Win rate",
  discipline: "Discipline score",
  weeklyAi: "Weekly AI summary",
  weeklyAiText:
    "This module will be connected to your trade database, plans and AI logic in the next stages.",
},
    locked: {
      title: "Activate your plan",
      label: "Access locked",
      text: "After payment, trade journal, SkillEdge AI Coach, TradingView charts, learning, reports and AI review history will be unlocked.",
      button: "Choose plan",
    },
    tabs: {
      overview: "Overview",
      journal: "Trade journal",
      charts: "Charts",
      coach: "AI Coach",
      learning: "Learning",
      reports: "Reports",
      billing: "Billing",
    },
    periods: {
      monthly: "1 month",
      halfyear: "6 months",
      yearly: "1 year",
      demo: "7-day trial",
    },
    demo: {
      label: "Trial version",
      title: "Your 7-day demo access is active",
      text: "This is a Starter trial with a limit of 10 AI requests. After the trial expires, access will be locked unless you choose a main plan.",
      short: "7-day trial. Limit: 10 AI requests.",
    },
    billing: {
      title: "Plan and billing",
      text: "Current plan, payment status and subscription expiration date.",
      activePlan: "Active plan",
      inactivePlan: "Plan is not activated",
      period: "Period",
      validUntil: "valid until",
      empty:
        "After payment, your plan, period, expiration date and payment history will appear here.",
    },
    coach: {
      title: "AI Coach",
      text: "Describe a trade, emotion, mistake or market situation — the AI coach will analyze discipline, risk and decision quality.",
      reviewTitle: "Trade review",
      reviewText:
        "The more specific your description is, the better the answer. Include ticker, entry, stop, entry reason, emotions and result.",
      placeholder:
        "Example: I entered short after a premarket pump, saw weakness below VWAP, but moved my stop and held the loss. Break down the mistake.",
      ask: "Ask AI",
      analyzing: "AI is analyzing...",
      newReview: "New review",
      answerTitle: "AI Coach answer",
      answerPlaceholder:
        "The review will appear here: what was good, where the mistake was, what lesson to write down and what to check before the next trade.",
      historyTitle: "AI review history",
      historyText: "Last 10 AI coach requests.",
      historyEmpty: "History is empty. Your first review will appear here after AI responds.",
      loginFirst: "Please log in first.",
      messageRequired: "Enter a question or trade description.",
      coachError: "AI Coach error.",
      failed: "Failed to get AI Coach response.",
      needPlan: "AI Coach requires an active plan or demo access.",
      limitReached: "AI request limit reached. Upgrade your plan or wait for the limit reset.",
    },
  },

  ru: {
    terminal: "SkillEdge AI Terminal",
    dashboard: "Личный кабинет",
    user: "Пользователь",
    choosePlan: "Выбрать тариф",
    logout: "Выйти",
    currentPlan: "Текущий тариф",
    loading: "Загрузка...",
    notActivated: "Не активирован",
    activatePlan: "Активируйте тариф, чтобы открыть функции кабинета.",
    aiUsage: "Использование AI",
   quickActions: "Быстрые действия",
    addTrade: "Добавить сделку",
    uploadScreenshot: "Загрузить скрин",
    askAI: "Спросить AI",
    createReport: "Создать отчёт",
    overview: {
  title: "Обзор эффективности",
  text: "Сводка PnL, win rate, discipline score, лучшие сетапы и главные ошибки.",
  pnlMonth: "PnL за месяц",
  winRate: "Win rate",
  discipline: "Discipline score",
  weeklyAi: "AI-сводка недели",
  weeklyAiText:
    "Этот модуль будет подключён к базе данных, тарифам и AI-логике на следующих этапах.",
},
    locked: {
      title: "Активируйте тариф",
      label: "Доступ закрыт",
      text: "После оплаты откроются журнал сделок, SkillEdge AI-коуч, графики TradingView, обучение, отчёты и история AI-разборов.",
      button: "Выбрать тариф",
    },
    tabs: {
      overview: "Обзор",
      journal: "Журнал сделок",
      charts: "Графики",
      coach: "AI-коуч",
      learning: "Обучение",
      reports: "Отчёты",
      billing: "Тариф",
    },
    periods: {
      monthly: "1 месяц",
      halfyear: "6 месяцев",
      yearly: "1 год",
      demo: "7-дневная пробная версия",
    },
    demo: {
      label: "Пробная версия",
      title: "У вас активирован 7-дневный demo-доступ",
      text: "Это пробная версия тарифа Starter с лимитом 10 AI-запросов. После окончания срока доступ будет закрыт, если вы не выберете основной тариф.",
      short: "7-дневная пробная версия. Лимит: 10 AI-запросов.",
    },
    billing: {
      title: "Тариф и оплата",
      text: "Информация о текущем тарифе, оплатах и сроке действия подписки.",
      activePlan: "Тариф активен",
      inactivePlan: "Тариф не активирован",
      period: "Период",
      validUntil: "действует до",
      empty:
        "После оплаты здесь появятся план, период, дата окончания и история оплат.",
    },
    coach: {
      title: "AI-коуч",
      text: "Опишите сделку, эмоции, ошибку или торговую ситуацию — AI-коуч даст разбор по дисциплине, риску и качеству решения.",
      reviewTitle: "Разбор сделки",
      reviewText:
        "Чем конкретнее описание, тем полезнее ответ. Укажи тикер, вход, стоп, причину входа, эмоции и результат.",
      placeholder:
        "Пример: Сегодня зашёл в short после премаркет-пампа, увидел слабость под VWAP, но передвинул стоп и пересидел убыток. Разбери, где была ошибка.",
      ask: "Спросить AI",
      analyzing: "AI анализирует...",
      newReview: "Новый разбор",
      answerTitle: "Ответ AI-коуча",
      answerPlaceholder:
        "Здесь появится разбор: что было хорошо, где ошибка, какой урок занести в журнал и что проверить перед следующей сделкой.",
      historyTitle: "История AI-разборов",
      historyText: "Последние 10 запросов к AI-коучу.",
      historyEmpty: "История пока пустая. Первый разбор появится здесь после ответа AI.",
      loginFirst: "Сначала войдите в аккаунт.",
      messageRequired: "Введите вопрос или описание сделки.",
      coachError: "Ошибка AI-коуча.",
      failed: "Не удалось получить ответ AI-коуча.",
      needPlan: "Для AI-коуча нужен активный тариф или demo-доступ.",
      limitReached:
        "Лимит AI-запросов закончился. Выберите тариф выше или дождитесь обновления лимита.",
    },
  },

  ua: {
    terminal: "SkillEdge AI Terminal",
    dashboard: "Особистий кабінет",
    user: "Користувач",
    choosePlan: "Обрати тариф",
    logout: "Вийти",
    currentPlan: "Поточний тариф",
    loading: "Завантаження...",
    notActivated: "Не активовано",
    activatePlan: "Активуйте тариф, щоб відкрити функції кабінету.",
    aiUsage: "Використання AI",
    quickActions: "Швидкі дії",
    addTrade: "Додати угоду",
    uploadScreenshot: "Завантажити скрин",
    askAI: "Запитати AI",
    createReport: "Створити звіт",
    overview: {
  title: "Огляд ефективності",
  text: "Зведення PnL, win rate, discipline score, найкращі сетапи та головні помилки.",
  pnlMonth: "PnL за місяць",
  winRate: "Win rate",
  discipline: "Discipline score",
  weeklyAi: "AI-зведення тижня",
  weeklyAiText:
    "Цей модуль буде підключено до бази даних, тарифів та AI-логіки на наступних етапах.",
},
    locked: {
      title: "Активуйте тариф",
      label: "Доступ закрито",
      text: "Після оплати відкриються журнал угод, SkillEdge AI-коуч, графіки TradingView, навчання, звіти та історія AI-розборів.",
      button: "Обрати тариф",
    },
    tabs: {
      overview: "Огляд",
      journal: "Журнал угод",
      charts: "Графіки",
      coach: "AI-коуч",
      learning: "Навчання",
      reports: "Звіти",
      billing: "Тариф",
    },
    periods: {
      monthly: "1 місяць",
      halfyear: "6 місяців",
      yearly: "1 рік",
      demo: "7-денна пробна версія",
    },
    demo: {
      label: "Пробна версія",
      title: "У вас активовано 7-денний demo-доступ",
      text: "Це пробна версія тарифу Starter з лімітом 10 AI-запитів. Після завершення строку доступ буде закрито, якщо ви не оберете основний тариф.",
      short: "7-денна пробна версія. Ліміт: 10 AI-запитів.",
    },
    billing: {
      title: "Тариф і оплата",
      text: "Інформація про поточний тариф, оплати та строк дії підписки.",
      activePlan: "Тариф активний",
      inactivePlan: "Тариф не активовано",
      period: "Період",
      validUntil: "діє до",
      empty:
        "Після оплати тут зʼявляться план, період, дата завершення та історія оплат.",
    },
    coach: {
      title: "AI-коуч",
      text: "Опишіть угоду, емоції, помилку або торгову ситуацію — AI-коуч зробить розбір дисципліни, ризику та якості рішення.",
      reviewTitle: "Розбір угоди",
      reviewText:
        "Чим конкретніший опис, тим корисніша відповідь. Вкажіть тикер, вхід, стоп, причину входу, емоції та результат.",
      placeholder:
        "Приклад: Сьогодні зайшов у short після премаркет-пампу, побачив слабкість під VWAP, але пересунув стоп і пересидів збиток. Розбери, де була помилка.",
      ask: "Запитати AI",
      analyzing: "AI аналізує...",
      newReview: "Новий розбір",
      answerTitle: "Відповідь AI-коуча",
      answerPlaceholder:
        "Тут зʼявиться розбір: що було добре, де помилка, який урок записати в журнал і що перевірити перед наступною угодою.",
      historyTitle: "Історія AI-розборів",
      historyText: "Останні 10 запитів до AI-коуча.",
      historyEmpty: "Історія поки порожня. Перший розбір зʼявиться тут після відповіді AI.",
      loginFirst: "Спочатку увійдіть в акаунт.",
      messageRequired: "Введіть питання або опис угоди.",
      coachError: "Помилка AI-коуча.",
      failed: "Не вдалося отримати відповідь AI-коуча.",
      needPlan: "Для AI-коуча потрібен активний тариф або demo-доступ.",
      limitReached:
        "Ліміт AI-запитів закінчився. Оберіть тариф вище або дочекайтеся оновлення ліміту.",
    },
  },
} as const;

const tabs: { id: TabId }[] = [
  { id: "overview" },
  { id: "journal" },
  { id: "charts" },
  { id: "coach" },
  { id: "learning" },
  { id: "reports" },
  { id: "billing" },
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
function getPeriodName(
  subscription: {
    period: BillingPeriod | null;
    isDemo: boolean;
  },
  t: (typeof dashboardDict)[Language]
) {
  if (subscription.isDemo) {
    return t.periods.demo;
  }

  if (!subscription.period) {
    return "—";
  }

  return t.periods[subscription.period];
}

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [coachMessage, setCoachMessage] = useState("");
  const [coachAnswer, setCoachAnswer] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const t = dashboardDict[language];
  const [coachError, setCoachError] = useState("");
  const [coachHistory, setCoachHistory] = useState<AiAnalysis[]>([]);
  const [subscription, setSubscription] = useState({
  active: false,
  plan: null as PlanId | null,
  period: null as BillingPeriod | null,
  aiLimit: 0,
  aiUsed: 0,
  expiresAt: null as string | null,
  isDemo: false,
});

  useEffect(() => {
    async function loadDashboard() {
      const savedLanguage = localStorage.getItem("skilledge_language");

if (
  savedLanguage === "en" ||
  savedLanguage === "ru" ||
  savedLanguage === "ua"
) {
  setLanguage(savedLanguage);
}
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const user = userData.user;
      setEmail(user.email ?? null);

      const { data: analysesData } = await supabase
  .from("ai_analyses")
  .select("id,user_message,ai_response,model,tokens_used,created_at")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(10);

setCoachHistory((analysesData as AiAnalysis[]) ?? []);

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
  plan: subData.plan_id,
  period: subData.billing_period,
  aiLimit: subData.ai_monthly_limit,
  aiUsed: subData.ai_used_this_month,
  expiresAt: subData.expires_at,
  isDemo: Boolean(subData.is_demo),
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

const handleCoachSubmit = async () => {
  const message = coachMessage.trim();

  if (!message) {
    setCoachError(t.coach.messageRequired);
    return;
  }

  try {
    setCoachLoading(true);
    setCoachError("");
    setCoachAnswer("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setCoachError(t.coach.loginFirst);
      return;
    }

    const response = await fetch("/api/ai-coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setCoachError(result.error || t.coach.coachError);
      return;
    }

    setCoachAnswer(result.answer || "");
    setCoachMessage("");

    setCoachHistory((current) => [
  {
    id: crypto.randomUUID(),
    user_message: message,
    ai_response: result.answer || "",
    model: "SkillEdge AI Coach",
    tokens_used: null,
    created_at: new Date().toISOString(),
  },
  ...current,
].slice(0, 10));

    setSubscription((current) => ({
      ...current,
      aiUsed: result.aiUsed ?? current.aiUsed,
      aiLimit: result.aiLimit ?? current.aiLimit,
    }));
  } catch {
    setCoachError(t.coach.failed);
  } finally {
    setCoachLoading(false);
  }
};

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
  {t.terminal}
</div>

<h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
  {t.dashboard}
</h1>

<p className="mt-3 text-sm text-white/55">
  {t.user}:{" "}
  <span className="text-white/75">{email || t.loading}</span>
</p>

<a
  href="/?page=pricing"
  className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
>
  {t.choosePlan}
</a>

<button
  onClick={handleLogout}
  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
>
  {t.logout}
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
                  <span className="relative z-10">{t.tabs[tab.id]}</span>
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
              {activeTab === "overview" && <OverviewTab t={t} />}
              {activeTab === "journal" && <JournalTab />}
              {activeTab === "charts" && <ChartsTab />}
              {activeTab === "coach" && (
  <CoachTab
  subscription={subscription}
  message={coachMessage}
  answer={coachAnswer}
  error={coachError}
  loading={coachLoading}
  history={coachHistory}
  t={t}
  onMessageChange={setCoachMessage}
  onSubmit={handleCoachSubmit}
  onNewAnalysis={() => {
    setCoachMessage("");
    setCoachAnswer("");
    setCoachError("");
  }}
/>
)}
              {activeTab === "learning" && <LearningTab />}
              {activeTab === "reports" && <ReportsTab />}
              {activeTab === "billing" && (
                <BillingTab subscription={subscription} loading={loading} t={t} />
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
  {t.currentPlan}
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
    ? `${getPeriodName(subscription, t)} · ${t.billing.validUntil} ${formatDate(
        subscription.expiresAt
      )}`
    : t.activatePlan}
</p>

{subscription.isDemo && (
  <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-50/80">
    {t.demo.short}
  </div>
)}

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/45">{t.aiUsage}</span>
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
  {t.quickActions}
</p>

              <div className="mt-5 space-y-3">
                <ActionButton label={t.addTrade} disabled={locked} />
<ActionButton label={t.uploadScreenshot} disabled={locked} />
<ActionButton label={t.askAI} disabled={locked} />
<ActionButton label={t.createReport} disabled={locked} />
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

function OverviewTab({ t }: { t: (typeof dashboardDict)[Language] }) {
  return (
    <div>
      <SectionHeader title={t.overview.title} text={t.overview.text} />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label={t.overview.pnlMonth} value="$0" />
        <MetricCard label={t.overview.winRate} value="—" />
        <MetricCard label={t.overview.discipline} value="—" />
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-6">
        <h3 className="text-xl font-semibold">{t.overview.weeklyAi}</h3>
        <p className="mt-3 text-sm leading-7 text-white/55">
          {t.overview.weeklyAiText}
        </p>
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
  t,
}: {
  subscription: Subscription;
  loading: boolean;
  t: (typeof dashboardDict)[Language];
}) {
  return (
    <div>
      <SectionHeader
        title="Тариф и оплата"
        text="Информация о текущем тарифе, оплатах и сроке действия подписки."
      />

      <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-6">
        <h3 className="text-2xl font-semibold">
          {loading
            ? "Загрузка..."
            : subscription.active && subscription.plan
            ? `Тариф активен: ${planNames[subscription.plan]}`
            : "Тариф не активирован"}
        </h3>

        {subscription.isDemo && (
          <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5 text-sm leading-7 text-amber-50/85">
            <div className="text-xs uppercase tracking-[0.25em] text-amber-100/60">
              Пробная версия
            </div>

            <div className="mt-2 text-lg font-semibold text-white">
              У вас активирован 7-дневный demo-доступ
            </div>

            <p className="mt-2 text-white/65">
              Это пробная версия тарифа Starter с лимитом 10 AI-запросов.
              После окончания срока доступ будет закрыт, если вы не выберете
              основной тариф.
            </p>
          </div>
        )}

        <p className="mt-3 text-white/60">
          {subscription.active && subscription.period
            ? `Период: ${getPeriodName(subscription, t)}. Действует до ${
                subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString("ru-RU")
                  : "—"
              }.`
            : "После оплаты здесь появятся план, период, дата окончания и история оплат."}
        </p>

        <a
          href="/?page=pricing"
          className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
        >
          {t.choosePlan}
        </a>
      </div>
    </div>
  );
}

function CoachTab({
 subscription,
  message,
  answer,
  error,
  loading,
  history,
  t,
  onMessageChange,
  onSubmit,
  onNewAnalysis,
}: {
  subscription: {
    active: boolean;
    aiLimit: number;
    aiUsed: number;
  };
    message: string;
  answer: string;
  error: string;
  loading: boolean;
  history: AiAnalysis[];
  t: (typeof dashboardDict)[Language];
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onNewAnalysis: () => void;
}) {
  const remaining = Math.max(subscription.aiLimit - subscription.aiUsed, 0);

  return (
    <div>
      <SectionHeader title={t.coach.title} text={t.coach.text} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold">{t.coach.reviewTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
  {t.coach.reviewText}
</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right text-xs text-white/60">
              <div>AI usage</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {subscription.aiUsed}/{subscription.aiLimit}
              </div>
            </div>
          </div>

          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={!subscription.active || loading || remaining <= 0}
            placeholder={t.coach.placeholder}
            className="min-h-[180px] w-full resize-none rounded-3xl border border-white/10 bg-[#080c16] p-5 text-sm leading-7 text-white outline-none transition placeholder:text-white/30 focus:border-white/25"
          />

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100/85">
              {error}
            </div>
          )}

          {!subscription.active && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50/85">
              {t.coach.needPlan}
            </div>
          )}

          {subscription.active && remaining <= 0 && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50/85">
              {t.coach.limitReached}
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={!subscription.active || loading || remaining <= 0}
            className="mt-5 inline-flex rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? t.coach.analyzing : t.coach.ask}
          </button>
          <button
  onClick={onNewAnalysis}
  disabled={loading}
  className="ml-3 mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-7 py-3 text-sm font-medium text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
>
  {t.coach.newReview}
</button>
        </div>

        <div className="space-y-6">
  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
    <div className="text-xs uppercase tracking-[0.25em] text-white/35">
  {t.coach.answerTitle}
</div>

    <div className="mt-5 min-h-[260px] whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/75">
        {answer || t.coach.answerPlaceholder}
    </div>
  </div>

  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-white/35">
          {t.coach.historyTitle}
        </div>
        <p className="mt-2 text-sm text-white/45">
          {t.coach.historyText}
        </p>
      </div>
    </div>

    <div className="mt-5 space-y-3">
      {history.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/45">
          {t.coach.historyEmpty}
        </div>
      ) : (
        history.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onMessageChange(item.user_message);
            }}
            className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between gap-4 text-xs text-white/35">
              <span>SkillEdge AI Coach</span>
              <span>
                {item.created_at
                  ? new Date(item.created_at).toLocaleString("ru-RU")
                  : ""}
              </span>
            </div>

            <div className="mt-3 line-clamp-2 text-sm leading-6 text-white/75">
              {item.user_message}
            </div>

            <div className="mt-3 line-clamp-3 text-xs leading-5 text-white/45">
              {item.ai_response}
            </div>
          </button>
        ))
      )}
    </div>
  </div>
</div>
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