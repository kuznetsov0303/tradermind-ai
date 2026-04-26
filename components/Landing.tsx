"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

type Language = "en" | "ru" | "ua";
type PageKey = "home" | "product" | "pricing" | "team";
type BillingPeriod = "monthly" | "halfyear" | "yearly";
type AuthMode = "login" | "register" | null;

const navKeys: PageKey[] = ["home", "product", "pricing", "team"];

const dict = {
  en: {
    lang: "EN",
    switchLanguage: "Language",
    brandTag: "Performance intelligence",
    requestDemo: "Request demo",
    nav: {
      home: "Home",
      product: "Product",
      pricing: "Pricing",
      team: "Team",
    },
    heroBadge: "AI trading intelligence platform",
    heroTitle: "Find your edge before the market punishes you again.",
    heroText:
      "SkillEdge AI shows why you win, why you lose, what patterns are worth trading, and when your behavior is quietly destroying your PnL.",
    start: "Request early access",
    tour: "View product flow",
    stats: [
      ["50k+", "trades analyzed"],
      ["82%", "users find recurring mistakes"],
      ["6x", "faster review workflow"],
    ],
    problemEyebrow: "The problem",
    problemTitle: "Most traders do not lack information. They lack self-knowledge.",
    problemText:
      "Screenshots, notes, watchlists and emotions are scattered everywhere. SkillEdge AI connects them into one operating system for execution, review and pattern discovery.",
    product: {
      eyebrow: "Product",
      title: "One workspace for trading performance.",
      text: "Journal trades, upload screenshots, ask the AI coach, review patterns and turn every session into measurable feedback.",
      cards: [
        ["Trade journal", "Track ticker, setup, emotion, size, result and screenshots."],
        ["AI review", "Get structured feedback on mistakes, risk, timing and execution."],
        ["TradingView charts", "Use embedded charts for technical review and context."],
        ["Learning hub", "Keep lessons, playbooks, checklists and trading materials in one place."],
        ["Reports", "Generate weekly and monthly summaries for discipline and growth."],
        ["Team layer", "Elite users can manage teams, compare traders and export reports."],
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Choose the plan that matches your trading ambition.",
      text: "Start simple, then unlock deeper AI analytics, screenshot review, live matching and team workflows.",
      demoNote:
  "By clicking Request demo, you get 15-minute access to the Pro plan for $5 with 10 AI requests to preview the dashboard and test basic features.",
      most: "Most popular",
      month: "/ month",
      buy: "Buy plan",
      plans: [
        [
          "starter",
          "Starter",
          "$49",
          "For solo traders building consistency",
          [
            "Unlimited trade journal",
            "Core dashboard",
            "50 AI requests / month",
            "SkillEdge Core — basic trade intelligence",
            "Short AI trade reviews",
            "Pattern tagging",
            "Weekly summary",
          ],
        ],
        [
          "pro",
          "Pro",
          "$99",
          "For active traders who want a measurable edge",
          [
            "Everything in Starter",
            "500 AI requests / month",
            "SkillEdge Edge — advanced pattern intelligence",
            "Advanced trade and pattern review",
            "Discipline score",
            "Screenshot analysis",
            "Pre-trade AI coach",
            "Live screener matching",
          ],
        ],
        [
          "elite",
          "Elite",
          "$149",
          "For mentors, prop teams and serious operators",
          [
            "Everything in Pro",
            "2,000 AI requests / month",
            "SkillEdge Elite — team-grade intelligence layer",
            "Deep reports",
            "Team dashboard",
            "Trader comparison",
            "Coach workspace",
            "White-label reports",
            "API access",
          ],
        ],
      ],
      compareEyebrow: "Plan comparison",
      compareTitle: "What changes between plans",
      compareText:
        "Starter is the clean entry point. Pro unlocks the real AI advantage. Elite is built for teams and mentors.",
      table: [
        ["Feature", "Starter", "Pro", "Elite"],
        ["AI requests", "50", "500", "2,000"],
        ["Screenshot review", "Basic", "Advanced", "Advanced"],
        ["Reports", "Weekly", "Deep", "White-label"],
        ["Team tools", "—", "—", "Included"],
      ],
    },
    team: {
      eyebrow: "Team",
      title: "Built for traders who want discipline, not noise.",
      text: "SkillEdge AI is designed as a performance layer for solo traders, mentors and prop teams.",
    },
    resultsEyebrow: "Results",
    resultsTitle: "What traders gain after implementation",
    results: [
      [
        "+18% execution quality",
        "After 4 weeks of structured reviews, traders filter weak setups better and enter less impulsively.",
      ],
      [
        "-32% recurring mistakes",
        "The AI coach highlights revenge trades, late entries, stop violations and over-sizing before they become habits.",
      ],
      [
        "2.4x faster session review",
        "Instead of scattered screenshots, traders get a structured report by setup, risk and discipline.",
      ],
    ],
    footer: {
      contact: "Contacts",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Product demo by request",
    },
    auth: {
      login: "Login",
      register: "Sign up",
      email: "Email",
      password: "Password",
      close: "Close",
      loginTitle: "Login to SkillEdge AI",
      registerTitle: "Create account",
      loginButton: "Login",
      registerButton: "Sign up",
      dashboard: "Dashboard",
      logout: "Log out",
      switchToLogin: "Already have an account? Login",
      switchToRegister: "No account? Sign up",
      checking: "Checking your account...",
      creatingInvoice: "Creating NOWPayments invoice...",
      loginRequired: "Login or sign up to pay for a plan.",
      afterRegister: "Account created. Confirm your email if required.",
    },
    billing: {
      monthly: "1 month",
      halfyear: "6 months",
      yearly: "1 year",
      payCrypto: "Pay with USDT",
      cardSoon: "Card payment — soon",
      periodMonthly: "/ month",
      periodHalfyear: "/ 6 months",
      periodYearly: "/ year",
      networkNote: "* payment on TRON TRC20 network",
    },
  },

  ru: {
    lang: "RU",
    switchLanguage: "Язык",
    brandTag: "Performance intelligence",
    requestDemo: "Запросить демо",
    nav: {
      home: "Главная",
      product: "Продукт",
      pricing: "Тарифы",
      team: "Команда",
    },
    heroBadge: "AI-платформа торгового интеллекта",
    heroTitle: "Найди своё преимущество до того, как рынок снова тебя накажет.",
    heroText:
      "SkillEdge AI показывает, почему ты зарабатываешь, почему теряешь, какие паттерны стоит торговать и где поведение незаметно уничтожает твой PnL.",
    start: "Получить ранний доступ",
    tour: "Посмотреть продукт",
    stats: [
      ["50k+", "сделок проанализировано"],
      ["82%", "пользователей находят повторяющиеся ошибки"],
      ["6x", "быстрее разбор сессии"],
    ],
    problemEyebrow: "Проблема",
    problemTitle: "Большинству трейдеров не не хватает информации. Им не хватает самопонимания.",
    problemText:
      "Скриншоты, заметки, вотчлисты и эмоции разбросаны повсюду. SkillEdge AI соединяет их в одну систему для исполнения, разбора и поиска паттернов.",
    product: {
      eyebrow: "Продукт",
      title: "Единое рабочее пространство для торговой эффективности.",
      text: "Веди журнал сделок, загружай скриншоты, спрашивай AI-коуча, разбирай паттерны и превращай каждую сессию в измеримую обратную связь.",
      cards: [
        ["Журнал сделок", "Фиксируй тикер, сетап, эмоции, объём, результат и скриншоты."],
        ["AI-разбор", "Получай структурный фидбек по ошибкам, риску, таймингу и исполнению."],
        ["Графики TradingView", "Используй встроенные графики для технического анализа и контекста."],
        ["Обучение", "Храни уроки, плейбуки, чеклисты и материалы в одном месте."],
        ["Отчёты", "Создавай недельные и месячные отчёты по дисциплине и росту."],
        ["Командный слой", "Elite открывает команды, сравнение трейдеров и экспорт отчётов."],
      ],
    },
    pricing: {
      eyebrow: "Тарифы",
      title: "Выбери план под свой уровень амбиций в трейдинге.",
      text: "Начни просто, затем открой глубокую AI-аналитику, разбор скриншотов, live-сопоставление и командные сценарии.",
      demoNote:
  "Натискаючи «Запросити демо», ви за $5 отримуєте доступ на 15 хвилин до тарифу Pro з 10 AI-запитами для перегляду кабінету та тесту функцій тарифу.",
      most: "Самый популярный",
      month: "/ месяц",
      buy: "Купить план",
      plans: [
        [
          "starter",
          "Старт",
          "$49",
          "Для трейдера, который строит стабильность",
          [
            "Безлимитный журнал сделок",
            "Базовый дашборд",
            "50 AI-запросов в месяц",
            "SkillEdge Core — базовый AI-анализ сделок",
            "Короткие AI-разборы сделок",
            "Теги паттернов",
            "Недельный отчёт",
          ],
        ],
        [
          "pro",
          "Про",
          "$99",
          "Для активного трейдера, которому нужен измеримый edge",
          [
            "Всё из тарифа Старт",
            "500 AI-запросов в месяц",
            "SkillEdge Edge — продвинутый AI-разбор и поиск паттернов",
            "Глубокий разбор сделок и паттернов",
            "Discipline score",
            "Разбор скриншотов",
            "Pre-trade AI-коуч",
            "Live-сопоставление через скринер",
          ],
        ],
        [
          "elite",
          "Элит",
          "$149",
          "Для менторов, проп-команд и серьёзных операторов",
          [
            "Всё из тарифа Про",
            "2 000 AI-запросов в месяц",
            "SkillEdge Elite — максимальный AI-уровень для команды и глубокого анализа",
            "Глубокие отчёты",
            "Командный дашборд",
            "Сравнение трейдеров",
            "Рабочее пространство коуча",
            "White-label отчёты",
            "Доступ к API",
          ],
        ],
      ],
      compareEyebrow: "Сравнение планов",
      compareTitle: "Чем отличаются планы",
      compareText:
        "Старт — чистая точка входа. Про открывает реальное AI-преимущество. Элит создан для команд и менторов.",
      table: [
        ["Функция", "Старт", "Про", "Элит"],
        ["AI-запросы", "50", "500", "2 000"],
        ["Разбор скриншотов", "Базовый", "Продвинутый", "Продвинутый"],
        ["Отчёты", "Недельные", "Глубокие", "White-label"],
        ["Команды", "—", "—", "Включено"],
      ],
    },
    team: {
      eyebrow: "Команда",
      title: "Для трейдеров, которым нужна дисциплина, а не шум.",
      text: "SkillEdge AI создаётся как слой эффективности для соло-трейдеров, менторов и проп-команд.",
    },
    resultsEyebrow: "Результаты",
    resultsTitle: "Что получает трейдер после внедрения",
    results: [
      [
        "+18% к качеству исполнения",
        "После 4 недель регулярного разбора сделок трейдеры лучше отсекают слабые сетапы и реже входят импульсивно.",
      ],
      [
        "-32% повторяющихся ошибок",
        "AI-коуч выделяет revenge trades, поздние входы, нарушения стопа и оверсайз до того, как это становится привычкой.",
      ],
      [
        "2.4x быстрее разбор сессии",
        "Вместо хаотичных скриншотов трейдер получает структурированный отчёт по сетапам, риску и дисциплине.",
      ],
    ],
    footer: {
      contact: "Контакты",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукта по запросу",
    },
    auth: {
      login: "Вход",
      register: "Зарегистрироваться",
      email: "Email",
      password: "Пароль",
      close: "Закрыть",
      loginTitle: "Вход в SkillEdge AI",
      registerTitle: "Создать аккаунт",
      loginButton: "Войти",
      registerButton: "Зарегистрироваться",
      dashboard: "Кабинет",
      logout: "Выйти",
      switchToLogin: "Уже есть аккаунт? Войти",
      switchToRegister: "Нет аккаунта? Зарегистрироваться",
      checking: "Проверяем аккаунт...",
      creatingInvoice: "Создаём счёт NOWPayments...",
      loginRequired: "Войдите или зарегистрируйтесь, чтобы оплатить тариф.",
      afterRegister: "Аккаунт создан. Если нужно, подтвердите email.",
    },
    billing: {
      monthly: "1 месяц",
      halfyear: "6 месяцев",
      yearly: "1 год",
      payCrypto: "Оплатить USDT",
      cardSoon: "Оплата картой — скоро",
      periodMonthly: "/ месяц",
      periodHalfyear: "/ 6 месяцев",
      periodYearly: "/ год",
      networkNote: "* оплата в сети TRON TRC20",
    },
  },

  ua: {
    lang: "UA",
    switchLanguage: "Мова",
    brandTag: "Performance intelligence",
    requestDemo: "Запросити демо",
    nav: {
      home: "Головна",
      product: "Продукт",
      pricing: "Тарифи",
      team: "Команда",
    },
    heroBadge: "AI-платформа торгового інтелекту",
    heroTitle: "Знайди свою перевагу до того, як ринок знову тебе покарає.",
    heroText:
      "SkillEdge AI показує, чому ти заробляєш, чому втрачаєш, які патерни варто торгувати і де поведінка непомітно знищує твій PnL.",
    start: "Отримати ранній доступ",
    tour: "Подивитися продукт",
    stats: [
      ["50k+", "угод проаналізовано"],
      ["82%", "користувачів знаходять повторювані помилки"],
      ["6x", "швидший розбір сесії"],
    ],
    problemEyebrow: "Проблема",
    problemTitle: "Більшості трейдерів не бракує інформації. Їм бракує саморозуміння.",
    problemText:
      "Скриншоти, нотатки, вотчлисти й емоції розкидані всюди. SkillEdge AI поєднує їх в одну систему для виконання, розбору й пошуку патернів.",
    product: {
      eyebrow: "Продукт",
      title: "Єдиний робочий простір для торгової ефективності.",
      text: "Веди журнал угод, завантажуй скриншоти, запитуй AI-коуча, аналізуй патерни й перетворюй кожну сесію на вимірюваний зворотний зв’язок.",
      cards: [
        ["Журнал угод", "Фіксуй тикер, сетап, емоції, обсяг, результат і скриншоти."],
        ["AI-розбір", "Отримуй структурний фідбек щодо помилок, ризику, таймінгу й виконання."],
        ["Графіки TradingView", "Використовуй вбудовані графіки для технічного аналізу й контексту."],
        ["Навчання", "Зберігай уроки, плейбуки, чеклисти й матеріали в одному місці."],
        ["Звіти", "Створюй тижневі й місячні звіти щодо дисципліни та росту."],
        ["Командний шар", "Elite відкриває команди, порівняння трейдерів і експорт звітів."],
      ],
    },
    pricing: {
      eyebrow: "Тарифи",
      title: "Обери план під свій рівень амбіцій у трейдингу.",
      text: "Почни просто, а потім відкрий глибоку AI-аналітику, розбір скриншотів, live-зіставлення й командні сценарії.",
      demoNote:
  "Натискаючи «Запросити демо», ви за $2 отримуєте доступ на 5 хвилин до базового тарифу для перегляду кабінету та тесту базових функцій.",
      most: "Найпопулярніший",
      month: "/ місяць",
      buy: "Купити план",
      plans: [
        [
          "starter",
          "Старт",
          "$49",
          "Для трейдера, який будує стабільність",
          [
            "Безлімітний журнал угод",
            "Базовий дашборд",
            "50 AI-запитів на місяць",
            "SkillEdge Core — базовий AI-аналіз угод",
            "Короткі AI-розбори угод",
            "Теги патернів",
            "Тижневий звіт",
          ],
        ],
        [
          "pro",
          "Про",
          "$99",
          "Для активного трейдера, якому потрібна вимірювана перевага",
          [
            "Усе з тарифу Старт",
            "500 AI-запитів на місяць",
            "SkillEdge Edge — просунутий AI-розбір і пошук патернів",
            "Глибокий розбір угод і патернів",
            "Discipline score",
            "Розбір скриншотів",
            "Pre-trade AI-коуч",
            "Live-зіставлення через скринер",
          ],
        ],
        [
          "elite",
          "Еліт",
          "$149",
          "Для менторів, проп-команд і серйозних операторів",
          [
            "Усе з тарифу Про",
            "2 000 AI-запитів на місяць",
            "SkillEdge Elite — максимальний AI-рівень для команди й глибокого аналізу",
            "Глибокі звіти",
            "Командний дашборд",
            "Порівняння трейдерів",
            "Робочий простір коуча",
            "White-label звіти",
            "Доступ до API",
          ],
        ],
      ],
      compareEyebrow: "Порівняння планів",
      compareTitle: "Чим відрізняються плани",
      compareText:
        "Старт — чиста точка входу. Про відкриває реальну AI-перевагу. Еліт створений для команд і менторів.",
      table: [
        ["Функція", "Старт", "Про", "Еліт"],
        ["AI-запити", "50", "500", "2 000"],
        ["Розбір скриншотів", "Базовий", "Просунутий", "Просунутий"],
        ["Звіти", "Тижневі", "Глибокі", "White-label"],
        ["Команди", "—", "—", "Включено"],
      ],
    },
    team: {
      eyebrow: "Команда",
      title: "Для трейдерів, яким потрібна дисципліна, а не шум.",
      text: "SkillEdge AI створюється як шар ефективності для соло-трейдерів, менторів і проп-команд.",
    },
    resultsEyebrow: "Результати",
    resultsTitle: "Що отримує трейдер після впровадження",
    results: [
      [
        "+18% до якості виконання",
        "Після 4 тижнів регулярного розбору угод трейдери краще відсікають слабкі сетапи й рідше входять імпульсивно.",
      ],
      [
        "-32% повторюваних помилок",
        "AI-коуч виділяє revenge trades, пізні входи, порушення стопа та оверсайз до того, як це стає звичкою.",
      ],
      [
        "2.4x швидший розбір сесії",
        "Замість хаотичних скриншотів трейдер отримує структурований звіт за сетапами, ризиком і дисципліною.",
      ],
    ],
    footer: {
      contact: "Контакти",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукту за запитом",
    },
    auth: {
      login: "Вхід",
      register: "Зареєструватися",
      email: "Email",
      password: "Пароль",
      close: "Закрити",
      loginTitle: "Вхід у SkillEdge AI",
      registerTitle: "Створити акаунт",
      loginButton: "Увійти",
      registerButton: "Зареєструватися",
      dashboard: "Кабінет",
      logout: "Вийти",
      switchToLogin: "Вже є акаунт? Увійти",
      switchToRegister: "Немає акаунта? Зареєструватися",
      checking: "Перевіряємо акаунт...",
      creatingInvoice: "Створюємо рахунок NOWPayments...",
      loginRequired: "Увійдіть або зареєструйтеся, щоб оплатити тариф.",
      afterRegister: "Акаунт створено. Якщо потрібно, підтвердьте email.",
    },
    billing: {
      monthly: "1 місяць",
      halfyear: "6 місяців",
      yearly: "1 рік",
      payCrypto: "Оплатити USDT",
      cardSoon: "Оплата карткою — скоро",
      periodMonthly: "/ місяць",
      periodHalfyear: "/ 6 місяців",
      periodYearly: "/ рік",
      networkNote: "* оплата в мережі TRON TRC20",
    },
  },
} as const;

export default function Landing() {
  const [language, setLanguage] = useState<Language>("en");
  const [active, setActive] = useState<PageKey>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<{
    planId: string;
    billingPeriod: BillingPeriod;
  } | null>(null);

  const t = dict[language];
  const authLabels = t.auth;
  useEffect(() => {
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    setCurrentUserEmail(data.session?.user?.email ?? null);
  };

  loadSession();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setCurrentUserEmail(session?.user?.email ?? null);
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");

    if (
      page === "home" ||
      page === "product" ||
      page === "pricing" ||
      page === "team"
    ) {
      setActive(page);
    }
  }, []);

  const cycle = () => {
    setLanguage((current) =>
      current === "en" ? "ru" : current === "ru" ? "ua" : "en"
    );
  };

  const openAuthModal = (mode: "login" | "register") => {
    setAuthMode(mode);
    setAuthStatus("");
  };

  const closeAuthModal = () => {
    setAuthMode(null);
    setAuthStatus("");
    setAuthEmail("");
    setAuthPassword("");
  };

const handleLogout = async () => {
  await supabase.auth.signOut();
  setCurrentUserEmail(null);
  setPendingCheckout(null);
  setAuthStatus("");
};

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setAuthStatus(
        authMode === "login" ? authLabels.checking : "Creating account..."
      );

      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) {
          setAuthStatus(error.message);
          return;
        }

        setAuthStatus(authLabels.afterRegister);
        setAuthMode("login");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
  email: authEmail,
  password: authPassword,
});

if (error) {
  setAuthStatus(error.message);
  return;
}

setCurrentUserEmail(data.user?.email ?? authEmail);

const checkout = pendingCheckout;

closeAuthModal();

      if (checkout) {
        setPendingCheckout(null);
        setTimeout(() => {
          handleCheckout(checkout.planId, checkout.billingPeriod);
        }, 300);
      }
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Auth error");
    }
  };

  const handleCheckout = async (
    id: string,
    billingPeriod: BillingPeriod = "monthly"
  ) => {
    try {
      setCheckoutStatus(authLabels.checking);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setPendingCheckout({ planId: id, billingPeriod });
        setAuthStatus(authLabels.loginRequired);
        setAuthMode("login");
        return;
      }

      setCheckoutStatus(authLabels.creatingInvoice);

      const r = await fetch("/api/create-crypto-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId: id, billingPeriod }),
      });

      const d = await r.json();

      if (!r.ok) {
  throw new Error(
    d?.details
      ? `${d?.error}: ${d.details}`
      : d?.error || "Crypto payment error"
  );
}

      if (d?.url) {
        window.location.href = d.url;
        return;
      }

      setCheckoutStatus(
        "Crypto payment invoice created, but payment URL was not returned."
      );
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Crypto payment is not available right now.";

      setCheckoutStatus(message);
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b16]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <button onClick={() => setActive("home")} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <Icon name="brain" className="h-6 w-6" />
            </div>
            <div className="text-left">
              <div className="text-lg font-semibold">SkillEdge AI</div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                {t.brandTag}
              </div>
            </div>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            {navKeys.map((k) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active === k
                    ? "bg-white text-black"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.nav[k]}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
  <button
    onClick={cycle}
    className="flex h-11 min-w-[58px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
  >
    <Icon name="globe" className="mr-2 h-4 w-4" />
    {t.lang}
  </button>

  <ButtonX onClick={() => handleCheckout("demo", "monthly")}>
  {t.requestDemo}
</ButtonX>

  {currentUserEmail ? (
    <>
      <a
        href="/dashboard"
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
      >
        {authLabels.dashboard}
      </a>

      <button
        onClick={handleLogout}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {authLabels.logout}
      </button>
    </>
  ) : (
    <>
      <button
        onClick={() => openAuthModal("login")}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {authLabels.login}
      </button>

      <button
        onClick={() => openAuthModal("register")}
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
      >
        {authLabels.register}
      </button>
    </>
  )}
</div>

          <button onClick={() => setMenuOpen((v) => !v)} className="md:hidden">
            <Icon name={menuOpen ? "close" : "menu"} className="h-6 w-6" />
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10 bg-[#070b16]/95 px-4 pb-4 md:hidden"
            >
              <div className="flex flex-col gap-2 pt-4">
                <button
                  onClick={cycle}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75"
                >
                  {t.switchLanguage}: {t.lang}
                </button>

                {navKeys.map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setActive(k);
                      setMenuOpen(false);
                    }}
                    className={`rounded-2xl px-4 py-3 text-left text-sm ${
                      active === k
                        ? "bg-white text-black"
                        : "bg-white/[0.04] text-white/75"
                    }`}
                  >
                    {t.nav[k]}
                  </button>
                ))}

                {currentUserEmail ? (
  <>
    <a
      href="/dashboard"
      onClick={() => setMenuOpen(false)}
      className="rounded-2xl bg-white px-4 py-3 text-left text-sm font-medium text-black"
    >
      {authLabels.dashboard}
    </a>

    <button
      onClick={() => {
        setMenuOpen(false);
        handleLogout();
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75"
    >
      {authLabels.logout}
    </button>
  </>
) : (
  <>
    <button
      onClick={() => {
        setMenuOpen(false);
        openAuthModal("login");
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75"
    >
      {authLabels.login}
    </button>

    <button
      onClick={() => {
        setMenuOpen(false);
        openAuthModal("register");
      }}
      className="rounded-2xl bg-white px-4 py-3 text-left text-sm font-medium text-black"
    >
      {authLabels.register}
    </button>
  </>
)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <AnimatePresence mode="wait">
          {active === "home" && <HomePage key="home" t={t} setActive={setActive} />}
          {active === "product" && <ProductPage key="product" t={t} />}
          {active === "pricing" && (
            <PricingPage
              key="pricing"
              t={t}
              handleCheckout={handleCheckout}
              checkoutStatus={checkoutStatus}
            />
          )}
          {active === "team" && <TeamPage key="team" t={t} />}
        </AnimatePresence>
      </main>

      <footer className="mx-auto max-w-7xl border-t border-white/10 px-4 py-10 text-sm text-white/50 md:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <div className="text-lg font-semibold text-white">SkillEdge AI</div>
            <div className="mt-2 uppercase tracking-[0.2em]">{t.brandTag}</div>
          </div>

          <div>
            <div className="font-semibold text-white">{t.footer.contact}</div>
            <div className="mt-3">support@upyourskills.site</div>
            <div className="mt-2">{t.footer.location}</div>
            <div className="mt-2">{t.footer.demo}</div>
          </div>

          <div className="md:text-right">
            © 2026 SkillEdge AI. All rights reserved.
          </div>
        </div>
      </footer>

      <AuthModal
        authMode={authMode}
        authLabels={authLabels}
        authEmail={authEmail}
        authPassword={authPassword}
        authStatus={authStatus}
        setAuthEmail={setAuthEmail}
        setAuthPassword={setAuthPassword}
        closeAuthModal={closeAuthModal}
        handleAuthSubmit={handleAuthSubmit}
        setAuthMode={setAuthMode}
        setAuthStatus={setAuthStatus}
      />
    </div>
  );
}

function HomePage({ t, setActive }: { t: any; setActive: (v: PageKey) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-24"
    >
      <section className="grid items-center gap-12 py-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <Badge>{t.heroBadge}</Badge>
          <h1 className="mt-8 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            {t.heroTitle}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
            {t.heroText}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonX onClick={() => setActive("pricing")}>
              {t.start}
              <span className="ml-2">→</span>
            </ButtonX>

            <button
              onClick={() => setActive("product")}
              className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {t.tour}
            </button>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {t.stats.map(([value, label]: [string, string]) => (
              <CardBox key={value}>
                <div className="text-2xl font-semibold">{value}</div>
                <div className="mt-2 text-sm leading-6 text-white/50">{label}</div>
              </CardBox>
            ))}
          </div>
        </div>

        <HeroVisual />
      </section>

      <section>
        <Badge>{t.problemEyebrow}</Badge>
        <h2 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight md:text-5xl">
          {t.problemTitle}
        </h2>
        <p className="mt-5 max-w-3xl text-base leading-8 text-white/65">
          {t.problemText}
        </p>
      </section>
    </motion.div>
  );
}

function ProductPage({ t }: { t: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-12 pt-8"
    >
      <SectionTitle
        eyebrow={t.product.eyebrow}
        title={t.product.title}
        text={t.product.text}
      />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {t.product.cards.map(([title, text]: [string, string]) => (
          <CardBox key={title}>
            <div className="text-xl font-semibold">{title}</div>
            <p className="mt-3 text-sm leading-7 text-white/60">{text}</p>
          </CardBox>
        ))}
      </div>
    </motion.div>
  );
}

function PricingPage({
  t,
  handleCheckout,
  checkoutStatus,
}: {
  t: any;
  handleCheckout: (id: string, billingPeriod: BillingPeriod) => void;
  checkoutStatus: string;
}) {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  const priceMatrix = {
    starter: { monthly: 49, halfyear: 249, yearly: 399 },
    pro: { monthly: 99, halfyear: 499, yearly: 799 },
    elite: { monthly: 149, halfyear: 749, yearly: 1249 },
  };

  const billingLabels = t.billing;

  const periodLabel =
    billing === "monthly"
      ? billingLabels.periodMonthly
      : billing === "halfyear"
      ? billingLabels.periodHalfyear
      : billingLabels.periodYearly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-20 pt-8"
    >
      <section>
        <SectionTitle
          eyebrow={t.pricing.eyebrow}
          title={t.pricing.title}
          text={t.pricing.text}
        />
        <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-sm leading-7 text-emerald-50/80">
  <strong className="text-white">Demo access:</strong>{" "}
  {t.pricing.demoNote}
</div>

        <div className="mt-8 inline-flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/[0.04] p-2">
          {[
            ["monthly", billingLabels.monthly],
            ["halfyear", billingLabels.halfyear],
            ["yearly", billingLabels.yearly],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBilling(key as BillingPeriod)}
              className={`rounded-full px-5 py-2 text-sm transition ${
                billing === key
                  ? "bg-white text-black"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          {t.pricing.plans.map(
            ([id, name, _price, subtitle, features]: [
              "starter" | "pro" | "elite",
              string,
              string,
              string,
              string[]
            ], idx: number) => {
              const currentPrice = priceMatrix[id][billing];

              return (
                <CardBox
                  key={id}
                  className={`h-full ${
                    idx === 1
                      ? "border-indigo-300/35 bg-gradient-to-b from-indigo-500/15 to-white/[0.04]"
                      : ""
                  }`}
                >
                  {idx === 1 && (
                    <div className="mb-5 inline-flex rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-indigo-100">
                      {t.pricing.most}
                    </div>
                  )}

                  <div className="text-2xl font-semibold text-white">{name}</div>
                  <div className="mt-2 text-sm leading-7 text-white/55">
                    {subtitle}
                  </div>

                  <div className="mt-7 flex items-end gap-2">
                    <div className="text-5xl font-semibold text-white">
                      ${currentPrice}
                    </div>
                    <div className="pb-2 text-sm text-white/45">{periodLabel}</div>
                  </div>

                  <div className="mt-7 space-y-3">
                    {features.map((f, featureIndex) => (
  <div
    key={`${id}-feature-${featureIndex}`}
    className="flex gap-3 text-sm text-white/70"
  >
    <Icon name="check" className="text-emerald-300" />
    {f}
  </div>
))}
                  </div>

                  <div className="mt-8 grid gap-3">
                    <ButtonX onClick={() => handleCheckout(id, billing)} className="w-full">
                      <Icon name="money" className="mr-2 h-4 w-4" />
                      {billingLabels.payCrypto}
                    </ButtonX>

                    <p className="text-center text-xs text-white/45">
                      {billingLabels.networkNote}
                    </p>

                    <button
                      disabled
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white/35"
                    >
                      {billingLabels.cardSoon}
                    </button>
                  </div>
                </CardBox>
              );
            }
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardBox>
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">
            {t.resultsEyebrow}
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            {t.resultsTitle}
          </h3>

          <div className="mt-6 space-y-4">
            {t.results.map(([result, text]: [string, string]) => (
              <div
                key={result}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-lg font-semibold text-emerald-300">
                  {result}
                </div>
                <p className="mt-2 text-sm leading-7 text-white/60">{text}</p>
              </div>
            ))}
          </div>

          {checkoutStatus && (
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              {checkoutStatus}
            </div>
          )}
        </CardBox>

        <CardBox>
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">
            {t.pricing.compareEyebrow}
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            {t.pricing.compareTitle}
          </h3>
          <p className="mt-3 text-sm leading-7 text-white/60">
            {t.pricing.compareText}
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            {t.pricing.table.map((row: string[], rowIndex: number) => (
  <div
    key={`pricing-row-${rowIndex}`}
    className={`grid grid-cols-4 ${
      rowIndex === 0
        ? "bg-white/5 text-white"
        : "border-t border-white/10 text-white/65"
    }`}
  >
    {row.map((c, cellIndex) => (
      <div key={`pricing-cell-${rowIndex}-${cellIndex}`} className="p-4 text-sm">
        {c}
      </div>
    ))}
  </div>
))}
          </div>
        </CardBox>
      </section>
    </motion.div>
  );
}

function TeamPage({ t }: { t: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="pt-8"
    >
      <SectionTitle
        eyebrow={t.team.eyebrow}
        title={t.team.title}
        text={t.team.text}
      />

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {["Founder-led", "AI-assisted", "Built for operators"].map((item) => (
          <CardBox key={item}>
            <div className="text-xl font-semibold">{item}</div>
            <p className="mt-3 text-sm leading-7 text-white/60">
              SkillEdge AI focuses on execution, discipline and measurable trading improvement.
            </p>
          </CardBox>
        ))}
      </div>
    </motion.div>
  );
}

function AuthModal(props: {
  authMode: AuthMode;
  authLabels: any;
  authEmail: string;
  authPassword: string;
  authStatus: string;
  setAuthEmail: (v: string) => void;
  setAuthPassword: (v: string) => void;
  closeAuthModal: () => void;
  handleAuthSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setAuthMode: (v: AuthMode) => void;
  setAuthStatus: (v: string) => void;
}) {
  const {
    authMode,
    authLabels,
    authEmail,
    authPassword,
    authStatus,
    setAuthEmail,
    setAuthPassword,
    closeAuthModal,
    handleAuthSubmit,
    setAuthMode,
    setAuthStatus,
  } = props;

  return (
    <AnimatePresence>
      {authMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 18 }}
            transition={{ duration: 0.25 }}
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#101522] p-8 text-white shadow-2xl shadow-indigo-950/40"
          >
            <div className="absolute -left-20 -top-20 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

            <button
              onClick={closeAuthModal}
              className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label={authLabels.close}
            >
              ×
            </button>

            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                SkillEdge AI
              </p>

              <h2 className="mt-4 text-3xl font-semibold">
                {authMode === "login"
                  ? authLabels.loginTitle
                  : authLabels.registerTitle}
              </h2>

              <form onSubmit={handleAuthSubmit} className="mt-7 space-y-4">
                <input
                  type="email"
                  placeholder={authLabels.email}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white/25"
                />

                <input
                  type="password"
                  placeholder={authLabels.password}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white/25"
                />

                <button className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02]">
                  {authMode === "login"
                    ? authLabels.loginButton
                    : authLabels.registerButton}
                </button>
              </form>

              {authStatus && (
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-white/65">
                  {authStatus}
                </p>
              )}

              <button
                onClick={() => {
                  setAuthStatus("");
                  setAuthMode(authMode === "login" ? "register" : "login");
                }}
                className="mt-5 text-sm text-white/50 transition hover:text-white"
              >
                {authMode === "login"
                  ? authLabels.switchToRegister
                  : authLabels.switchToLogin}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div>
      <Badge>{eyebrow}</Badge>
      <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight md:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-3xl text-base leading-8 text-white/65">{text}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-full border border-indigo-300/20 bg-indigo-300/10 px-4 py-1 text-xs uppercase tracking-[0.22em] text-indigo-100">
      ✧ {children}
    </div>
  );
}

function CardBox({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}

function ButtonX({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] ${className}`}
    >
      {children}
    </button>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-0 rounded-[2rem] bg-indigo-500/20 blur-3xl" />
      <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>SkillEdge AI</span>
            <span>Live</span>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm text-white/45">This week</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-2xl font-semibold">+$4,280</div>
              <div className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
                Discipline 82
              </div>
            </div>

            <div className="mt-5 h-28 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/20 p-4">
              <svg viewBox="0 0 280 90" className="h-full w-full">
                <path
                  d="M0 70 C 45 60, 55 10, 100 35 S 170 85, 220 40 S 260 30, 280 35"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-indigo-300"
                />
                <path
                  d="M0 80 C 40 65, 70 70, 105 58 S 170 55, 220 48 S 255 45, 280 42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-fuchsia-300"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    brain: "✦",
    globe: "◌",
    menu: "☰",
    close: "×",
    check: "✓",
    money: "$",
  };

  return <span className={`inline-flex ${className}`}>{icons[name] || "•"}</span>;
}