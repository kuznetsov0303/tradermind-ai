"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import CookieConsent from "@/components/marketing/CookieConsent";
import BrandMark from "@/components/marketing/BrandMark";

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
  "By clicking “Request demo”, you get 7 days of SkillEdge Core access with a limit of 10 AI requests for $11.99 to preview the dashboard and test basic features.",
      most: "Most popular",
      month: "/ month",
      buy: "Buy plan",
      plans: [
  [
    "starter",
    "SkillEdge Core",
    "$49",
    "For traders who want to start tracking trades systematically and get basic AI feedback.",
    [
      "Up to 300 trades in the journal",
      "Up to 3 screenshots per trade",
      "50 AI Coach requests per month",
      "10 journal AI analyses per month",
      "20 trade chart AI analyses per month",
      "Basic stats: PnL, win rate, average PnL",
      "CSV/XLSX journal export",
    ],
  ],
  [
    "pro",
    "SkillEdge Edge",
    "$99",
    "For active traders who need higher limits, deeper AI review and pattern work.",
    [
      "Up to 2,000 trades in the journal",
      "Up to 5 screenshots per trade",
      "200 AI Coach requests per month",
      "50 journal AI analyses per month",
      "100 trade chart AI analyses per month",
      "Advanced stats and equity curve",
      "Deeper AI review of mistakes, setups and discipline",
    ],
  ],
  [
    "elite",
    "SkillEdge Elite",
    "$149",
    "For serious traders, mentors and prop teams that need maximum limits.",
    [
      "Up to 10,000 trades in the journal",
      "Up to 10 screenshots per trade",
      "1,000 AI Coach requests per month",
      "300 journal AI analyses per month",
      "500 trade chart AI analyses per month",
      "Maximum limits for active trading",
      "Suitable for mentors, teams and advanced traders",
    ],
  ],
],
      compareEyebrow: "Plan comparison",
      compareTitle: "What changes between plans",
      compareText:
  "SkillEdge Core is the entry plan. SkillEdge Edge unlocks higher AI limits and deeper analysis. SkillEdge Elite is built for advanced traders, mentors and teams.",
table: [
  ["Feature", "SkillEdge Core", "SkillEdge Edge", "SkillEdge Elite"],
  ["Trades in journal", "300", "2,000", "10,000"],
  ["Screenshots per trade", "3", "5", "10"],
  ["AI Coach requests / month", "50", "200", "1,000"],
  ["Journal AI analyses / month", "10", "50", "300"],
  ["Trade chart AI analyses / month", "20", "100", "500"],
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
  "Нажимая «Запросить демо», вы за $11.99 получаете доступ на 7 дней к тарифу SkillEdge Core с лимитом 10 AI-запросов для просмотра личного кабинета и теста базовых функций.",
      most: "Самый популярный",
      month: "/ месяц",
      buy: "Купить план",
      plans: [
  [
    "starter",
    "SkillEdge Core",
    "$49",
    "Для трейдера, который хочет начать вести системный журнал и получать базовый AI-разбор.",
    [
      "До 300 сделок в журнале",
      "До 3 скриншотов на одну сделку",
      "50 AI Coach запросов в месяц",
      "10 AI-анализов журнала в месяц",
      "20 AI-разборов графиков сделок в месяц",
      "Базовая статистика: PnL, win rate, average PnL",
      "CSV/XLSX экспорт журнала",
    ],
  ],
  [
    "pro",
    "SkillEdge Edge",
    "$99",
    "Для активного трейдера, которому нужны расширенные лимиты, AI-анализ и работа с паттернами.",
    [
      "До 2 000 сделок в журнале",
      "До 5 скриншотов на одну сделку",
      "200 AI Coach запросов в месяц",
      "50 AI-анализов журнала в месяц",
      "100 AI-разборов графиков сделок в месяц",
      "Расширенная статистика и equity curve",
      "Глубокий AI-разбор ошибок, сетапов и дисциплины",
    ],
  ],
  [
    "elite",
    "SkillEdge Elite",
    "$149",
    "Для серьёзных трейдеров, менторов и проп-команд с максимальными лимитами.",
    [
      "До 10 000 сделок в журнале",
      "До 10 скриншотов на одну сделку",
      "1 000 AI Coach запросов в месяц",
      "300 AI-анализов журнала в месяц",
      "500 AI-разборов графиков сделок в месяц",
      "Максимальные лимиты для активной торговли",
      "Подходит для менторов, команд и продвинутых трейдеров",
    ],
  ],
],
      compareEyebrow: "Сравнение планов",
      compareTitle: "Чем отличаются планы",
      compareText:
  "SkillEdge Core — стартовый план. SkillEdge Edge открывает повышенные AI-лимиты и более глубокий анализ. SkillEdge Elite создан для продвинутых трейдеров, менторов и команд.",
table: [
  ["Функция", "SkillEdge Core", "SkillEdge Edge", "SkillEdge Elite"],
  ["Сделок в журнале", "300", "2 000", "10 000"],
  ["Скриншотов на сделку", "3", "5", "10"],
  ["AI Coach запросов / месяц", "50", "200", "1 000"],
  ["AI-анализов журнала / месяц", "10", "50", "300"],
  ["AI-разборов графиков / месяц", "20", "100", "500"],
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
  "Натискаючи «Запросити демо», ви за $11.99 отримуєте доступ на 7 днів до тарифу SkillEdge Core з лімітом 10 AI-запитів для перегляду кабінету та тесту базових функцій.",
      most: "Найпопулярніший",
      month: "/ місяць",
      buy: "Купити план",
      plans: [
  [
    "starter",
    "SkillEdge Core",
    "$49",
    "Для трейдера, який хоче почати системно вести журнал і отримувати базовий AI-розбір.",
    [
      "До 300 угод у журналі",
      "До 3 скріншотів на одну угоду",
      "50 AI Coach запитів на місяць",
      "10 AI-аналізів журналу на місяць",
      "20 AI-розборів графіків угод на місяць",
      "Базова статистика: PnL, win rate, average PnL",
      "CSV/XLSX експорт журналу",
    ],
  ],
  [
    "pro",
    "SkillEdge Edge",
    "$99",
    "Для активного трейдера, якому потрібні вищі ліміти, глибший AI-аналіз і робота з патернами.",
    [
      "До 2 000 угод у журналі",
      "До 5 скріншотів на одну угоду",
      "200 AI Coach запитів на місяць",
      "50 AI-аналізів журналу на місяць",
      "100 AI-розборів графіків угод на місяць",
      "Розширена статистика та equity curve",
      "Глибший AI-розбір помилок, сетапів і дисципліни",
    ],
  ],
  [
    "elite",
    "SkillEdge Elite",
    "$149",
    "Для серйозних трейдерів, менторів і проп-команд з максимальними лімітами.",
    [
      "До 10 000 угод у журналі",
      "До 10 скріншотів на одну угоду",
      "1 000 AI Coach запитів на місяць",
      "300 AI-аналізів журналу на місяць",
      "500 AI-розборів графіків угод на місяць",
      "Максимальні ліміти для активної торгівлі",
      "Підходить для менторів, команд і просунутих трейдерів",
    ],
  ],
],
      compareEyebrow: "Порівняння планів",
      compareTitle: "Чим відрізняються плани",
     compareText:
  "SkillEdge Core — стартовий план. SkillEdge Edge відкриває вищі AI-ліміти та глибший аналіз. SkillEdge Elite створений для просунутих трейдерів, менторів і команд.",
table: [
  ["Функція", "SkillEdge Core", "SkillEdge Edge", "SkillEdge Elite"],
  ["Угод у журналі", "300", "2 000", "10 000"],
  ["Скріншотів на угоду", "3", "5", "10"],
  ["AI Coach запитів / місяць", "50", "200", "1 000"],
  ["AI-аналізів журналу / місяць", "10", "50", "300"],
  ["AI-розборів графіків / місяць", "20", "100", "500"],
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

export default function Landing({
  initialPage = "home",
}: {
  initialPage?: PageKey;
}) {
  const [language, setLanguage] = useState<Language>("en");
  const router = useRouter();
const pathname = usePathname();

const pageHref: Record<PageKey, string> = {
  home: "/",
  product: "/product",
  pricing: "/pricing",
  team: "/team",
};

const [active, setActiveState] = useState<PageKey>(initialPage);

useEffect(() => {
  setActiveState(initialPage);
}, [initialPage]);

const setActive = (page: PageKey) => {
  setActiveState(page);

  const href = pageHref[page];

  if (pathname !== href) {
    router.push(href);
  }
};
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

useEffect(() => {
  const savedLanguage = localStorage.getItem("skilledge_language");

  if (
    savedLanguage === "en" ||
    savedLanguage === "ru" ||
    savedLanguage === "ua"
  ) {
    setLanguage(savedLanguage);
  }
}, []);


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
  setLanguage((current) => {
    const nextLanguage =
      current === "en" ? "ru" : current === "ru" ? "ua" : "en";

    localStorage.setItem("skilledge_language", nextLanguage);

    return nextLanguage;
  });
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
          <Link href="/" className="flex items-center gap-3">
  <BrandMark size="sm" />
  <div className="text-left">
    <div className="text-lg font-semibold">SkillEdge AI</div>
    <div className="text-xs uppercase tracking-[0.2em] text-white/45">
      {t.brandTag}
    </div>
  </div>
</Link>

          <nav className="hidden items-center gap-2 md:flex">
  {navKeys.map((k) => (
    <Link
      key={k}
      href={pageHref[k]}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active === k
          ? "bg-white text-black"
          : "text-white/65 hover:bg-white/5 hover:text-white"
      }`}
    >
      {t.nav[k]}
    </Link>
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
  <Link
    key={k}
    href={pageHref[k]}
    onClick={() => setMenuOpen(false)}
    className={`rounded-2xl px-4 py-3 text-left text-sm ${
      active === k
        ? "bg-white text-black"
        : "bg-white/[0.04] text-white/75"
    }`}
  >
    {t.nav[k]}
  </Link>
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
          {active === "product" && (
  <ProductPage key="product" t={t} setActive={setActive} />
)}
          {active === "pricing" && (
            <PricingPage
              key="pricing"
              t={t}
              handleCheckout={handleCheckout}
              checkoutStatus={checkoutStatus}
            />
          )}
          {active === "team" && (
  <TeamPage key="team" t={t} setActive={setActive} />
)}
        </AnimatePresence>
      </main>

      <PremiumFooter
  t={t}
  setActive={setActive}
  handleCheckout={handleCheckout}
/>

<CookieConsent />

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

function ProductPage({
  t,
  setActive,
}: {
  t: any;
  setActive: (v: PageKey) => void;
}) {
  const heroStats = [
    ["AI Trading Desk", "market intelligence, alerts, journal and coaching in one system"],
    ["Signal-to-Trade", "each alert can become a journal trade with execution review"],
    ["Personal Edge", "the platform is built to learn from the trader’s own best patterns"],
  ];

  const tradingDeskCards = [
    {
      title: "AI Alerts",
      text: "Structured market opportunities with setup, trigger, entry zone, stop, targets, risk, scenario and invalidation.",
      badge: "Actionable",
    },
    {
      title: "Breakdown Modal",
      text: "A clean professional view of the whole idea: why it fired, what confirms it, what cancels it and how to manage it.",
      badge: "Clarity",
    },
    {
      title: "Decision Tracking",
      text: "Mark every alert as Watching, Taken, Skipped or Missed so SkillEdge can understand your real behavior.",
      badge: "Discipline",
    },
    {
      title: "Outcome Learning",
      text: "See whether your decision matched the real result: Taken + Worked, Taken + Failed, Missed Opportunity or Good Skip.",
      badge: "Growth",
    },
  ];

  const productFlow = [
    {
      step: "01",
      title: "The market starts moving",
      text: "SkillEdge watches stocks, crypto, unusual movement, catalysts and market context so the trader does not waste energy on dead tickers.",
    },
    {
      step: "02",
      title: "AI filters the noise",
      text: "The system ranks opportunities by quality, freshness, confidence, risk, catalyst, journal relevance and setup clarity.",
    },
    {
      step: "03",
      title: "You get a real trading plan",
      text: "Not a blind signal. The alert explains direction, trigger, entry zone, stop, targets, management, invalidation and trap risk.",
    },
    {
      step: "04",
      title: "The alert connects to your Journal",
      text: "Create a trade draft from an alert and SkillEdge links the original plan with your real execution, screenshots and result.",
    },
    {
      step: "05",
      title: "SkillEdge turns the result into coaching",
      text: "Outcome tracking, execution score, weakness map, personal focus and missed opportunity review turn every alert into feedback.",
    },
  ];

  const coreModules = [
    {
      title: "AI Trading Desk",
      text: "The heart of the product. A premium alert center that helps the trader understand what is in play, why it matters and how to think about the trade.",
      items: [
        "Floating AI Alerts widget",
        "Full Alerts Center",
        "Priority and confidence logic",
        "Premium breakdown modal",
        "Long and short opportunity structure",
      ],
    },
    {
      title: "Market Intelligence",
      text: "A market scanner layer for finding stocks and crypto that deserve attention before the trader wastes time scrolling random charts.",
      items: [
        "Stocks and crypto opportunities",
        "AI Market Brief",
        "Catalyst and news context",
        "Tracked source transparency",
        "Built for full-market premium data expansion",
      ],
    },
    {
      title: "Journal & Screenshots",
      text: "A serious trading journal that does more than store trades. It becomes the data source for improvement, reports and personal AI insights.",
      items: [
        "Trade journal",
        "Screenshots per trade",
        "PnL and win-rate stats",
        "CSV/XLSX export foundation",
        "Trade history for AI analysis",
      ],
    },
    {
      title: "Execution Coach",
      text: "SkillEdge shows where the trader is actually weak: entries, stops, direction, targets, discipline and reaction speed.",
      items: [
        "Execution score",
        "Weakness map",
        "Personal execution focus",
        "This Week Action Plan",
        "Signal-to-trade review",
      ],
    },
    {
      title: "Outcome Learning System",
      text: "This is where SkillEdge becomes different. The platform does not stop at the signal — it checks what the trader did and what happened after.",
      items: [
        "Taken + Worked",
        "Taken + Failed",
        "Missed Opportunity",
        "Good Skip",
        "Missed Opportunity Coach",
      ],
    },
    {
      title: "Playbook, Learning & Reports",
      text: "The trader builds a repeatable system instead of chasing random trades. Alerts, setups, lessons and reports become one learning loop.",
      items: [
        "Save setup to Playbook",
        "Setup education",
        "Learning Center",
        "AI reports foundation",
        "Weekly and monthly review direction",
      ],
    },
    {
      title: "Charts & Watchlists",
      text: "A chart workspace designed to connect ticker research, watchlists, screenshots, trade review and future AI chart analysis.",
      items: [
        "TradingView chart foundation",
        "Ticker input",
        "Watchlists",
        "Last ticker memory",
        "Prepared for premium chart analysis",
      ],
    },
    {
      title: "Personal AI Alerts",
      text: "The future premium edge: SkillEdge is designed to learn from the client’s profitable and losing trades, then prioritize similar market situations.",
      items: [
        "Best trade pattern extraction",
        "Journal pattern match",
        "Personal priority",
        "Risk warning layer",
        "Setup fingerprint logic",
      ],
    },
    {
  title: "Support & Operator Care",
  text: "Clients get a site-wide support assistant and a clean operator request flow. If they need help with broker or exchange questions, they can contact support through chat instead of searching alone.",
  items: [
    "Site-wide support assistant",
    "Operator request flow",
    "Payment and access help",
    "Product guidance",
    "Help understanding broker/exchange questions through support chat",
  ],
},
  ];

  const dashboardPreview = [
    ["Live AI Alerts", "Fresh trading situations with priority and context"],
    ["Journal Sync", "Every taken alert can become a tracked trade"],
    ["Execution Score", "See whether the trade followed the plan"],
    ["Outcome Coach", "Understand missed opportunities and good skips"],
    ["Market Brief", "AI summary of the best in-play candidates"],
  ];

  const comparisonItems = [
    {
      title: "Instead of a normal scanner",
      weak: "You only see tickers and still have to guess what matters.",
      strong:
        "SkillEdge explains why the ticker matters, what the setup is, what can go wrong and what confirms the idea.",
    },
    {
      title: "Instead of a simple journal",
      weak: "You store trades but do not transform them into an edge.",
      strong:
        "SkillEdge connects trades, screenshots, alerts, outcomes and mistakes into a personal improvement system.",
    },
    {
      title: "Instead of a generic AI chatbot",
      weak: "You ask random questions and receive disconnected answers.",
      strong:
        "SkillEdge works inside your trading workflow: alerts, journal, reports, execution, learning and playbook.",
    },
  ];

  const clientOutcomes = [
    {
      value: "Trade with structure",
      text: "No more random clicking. Every serious idea is organized around setup, trigger, entry, stop, targets and risk.",
    },
    {
      value: "Review like a professional",
      text: "The trader sees what was planned, what was executed and what needs to improve next session.",
    },
    {
      value: "Build a personal edge",
      text: "Over time, the journal becomes a pattern database for personal AI alerts and stronger decision-making.",
    },
  ];

  const finalChecklist = [
    "AI Trading Desk for high-quality market opportunities",
    "Market Intelligence for stocks and crypto",
    "Journal, screenshots and execution analytics",
    "Outcome Learning and Missed Opportunity Coach",
    "Playbook, Learning Center and Reports",
    "Future personalization based on the client’s best trades",
    "Site-wide support assistant and operator request flow",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-24 pt-8"
    >
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-12 h-48 w-48 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Badge>Premium AI trading operating system</Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mt-7 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl"
            >
              SkillEdge AI turns market noise into a personal trading edge.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg"
            >
              It is not just a journal, not just a scanner and not just an AI
              chat. SkillEdge AI connects market intelligence, AI alerts,
              journal analytics, execution review, outcome learning, playbook,
              reports and coaching into one premium trading system.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <ButtonX onClick={() => setActive("pricing")} className="shadow-[0_0_35px_rgba(255,255,255,0.18)]">
                Choose your plan
                <span className="ml-2">→</span>
              </ButtonX>

              <button
                onClick={() => setActive("team")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Why this exists
              </button>
            </motion.div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {heroStats.map(([title, text], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 + index * 0.05 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {title}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-white/48">
                    {text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.45 }}
            className="relative rounded-[2.25rem] border border-cyan-300/15 bg-[#0b1220]/90 p-5 shadow-[0_24px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" />

            <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/45">
                  Live AI Trading Desk
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  Signal breakdown
                </div>
              </div>

              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Priority 88
              </div>
            </div>

            <div className="relative mt-5 grid gap-3">
              {[
                ["Ticker", "ZTS · NYSE"],
                ["Setup", "Backside fade / weakness continuation"],
                ["Trigger", "Lower high + failed reclaim"],
                ["Plan", "Entry zone · stop · targets · invalidation"],
              ].map(([label, value], index) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.32 + index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                    {label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white/85">
                    {value}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="relative mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm leading-6 text-amber-50/72">
              The trader does not receive a blind “buy” or “sell”. The trader
              receives context, setup logic, risk, confirmation, invalidation
              and the next lesson after the outcome.
            </div>
          </motion.div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="What you are really buying"
          title="A complete system for finding opportunities, executing better and learning from every trade."
          text="SkillEdge AI is built to make the trader more structured, faster, calmer and more self-aware. The value is not only in alerts — it is in the loop between market, decision, execution, journal and improvement."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {tradingDeskCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -5 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20"
            >
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                {card.badge}
              </div>

              <div className="mt-5 text-xl font-semibold text-white">
                {card.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/58">
                {card.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <Badge>How SkillEdge works</Badge>

          <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
            From market scan to personal improvement — one connected loop.
          </h2>

          <p className="mt-5 text-base leading-8 text-white/62">
            Most traders lose time switching between scanners, charts, notes,
            screenshots and emotions. SkillEdge brings the process into one
            workflow so every serious opportunity can become data, feedback and
            future edge.
          </p>
        </div>

        <div className="space-y-4">
          {productFlow.map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05 }}
              className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:grid-cols-[72px_1fr]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                {item.step}
              </div>

              <div>
                <div className="text-lg font-semibold text-white">
                  {item.title}
                </div>

                <p className="mt-2 text-sm leading-7 text-white/58">
                  {item.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Product modules"
          title="Everything we are building is designed to work together."
          text="Each module is useful alone. Together they create a premium trading workspace where the trader can discover opportunities, execute with a plan, review performance and build personal pattern intelligence."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {coreModules.map((module, index) => (
            <motion.div
              key={module.title}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.035 }}
              whileHover={{ y: -4 }}
              className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20"
            >
              <div className="text-xl font-semibold text-white">
                {module.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/60">
                {module.text}
              </p>

              <div className="mt-5 space-y-3">
                {module.items.map((item) => (
                  <div key={item} className="flex gap-3 text-sm text-white/68">
                    <Icon name="check" className="text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0b1020] p-6 md:p-10">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Badge>Dashboard preview</Badge>

            <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
              The client should feel like a trading desk is open in front of him.
            </h2>

            <p className="mt-5 text-base leading-8 text-white/62">
              Alerts are only the beginning. The real power is that SkillEdge
              connects each idea with the trader’s actions, journal, outcomes,
              execution quality and future learning.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/35">
                  SkillEdge cockpit
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  One workflow. No scattered tools.
                </div>
              </div>

              <div className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_22px_rgba(110,231,183,0.8)]" />
            </div>

            <div className="mt-5 grid gap-3">
              {dashboardPreview.map(([title, text], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {title}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-white/48">
                    {text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Why SkillEdge is different"
          title="This is not another signal service. This is a performance system."
          text="The strongest traders do not just look for entries. They build process, discipline, review and repeatable patterns. SkillEdge AI is being built around that reality."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {comparisonItems.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.06 }}
              whileHover={{ y: -4 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20"
            >
              <div className="text-xl font-semibold text-white">
                {item.title}
              </div>

              <div className="mt-5 rounded-2xl border border-red-300/15 bg-red-300/[0.035] p-4 text-sm leading-6 text-red-50/65">
                {item.weak}
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 text-sm leading-6 text-emerald-50/72">
                {item.strong}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Client outcomes"
          title="The goal is simple: help the trader become harder to fool, harder to shake and harder to break."
          text="SkillEdge is built for the trader who wants more than motivation. The client needs a system that exposes mistakes, rewards discipline and turns repetition into edge."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {clientOutcomes.map((item, index) => (
            <motion.div
              key={item.value}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.06 }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.025] p-6"
            >
              <div className="text-2xl font-semibold text-white">
                {item.value}
              </div>

              <p className="mt-4 text-sm leading-7 text-white/60">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.04] to-cyan-500/10 p-6 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-white/45">
              Built for serious traders
            </div>

            <h2 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
              Stop guessing. Start building a trading system around your real behavior.
            </h2>

            <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">
              SkillEdge AI is for traders who are tired of scattered tools,
              emotional decisions and unclear reviews. It helps the client see
              the market cleaner, execute with more structure and understand
              what to improve next.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <div className="text-lg font-semibold text-white">
              What the client gets
            </div>

            <div className="mt-5 space-y-3">
              {finalChecklist.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-white/70">
                  <Icon name="check" className="text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>

            <ButtonX onClick={() => setActive("pricing")} className="mt-6 w-full">
              Choose your plan
              <span className="ml-2">→</span>
            </ButtonX>
          </div>
        </div>
      </section>
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

  const signalFeatures = [
    {
      title: "Not blind buy/sell calls",
      text: "SkillEdge signals are designed as structured trade ideas: setup, direction, trigger, entry zone, stop, targets, risk, invalidation and management.",
    },
    {
      title: "Breakdown before action",
      text: "Every serious alert should explain why it appeared, what confirms it, what makes it dangerous and what the trader must watch before entering.",
    },
    {
      title: "Signal-to-Journal learning",
      text: "When a client creates a trade from an alert, SkillEdge can compare the original plan with the real execution, PnL, screenshots and outcome.",
    },
    {
      title: "Outcome coaching",
      text: "The platform does not stop after the alert. It tracks Taken, Skipped and Missed decisions to show missed opportunities, good skips and weak execution.",
    },
  ];

  const premiumPlans: {
    id: "starter" | "pro" | "elite";
    name: string;
    badge: string;
    headline: string;
    promise: string;
    signalAccess: string;
    bestFor: string;
    clientFeels: string;
    unlocks: string[];
    signalLayer: string[];
    limits: string[];
    accent: "core" | "edge" | "elite";
    cta: string;
  }[] = [
    {
      id: "starter",
      name: "SkillEdge Core",
      badge: "Start with discipline",
      headline: "For traders who are tired of guessing and want structure.",
      promise:
        "Core gives you the foundation every serious trader needs: a clean journal, screenshots, AI Coach feedback, chart analysis, exports and a review workflow that shows what is actually happening in your trading.",
      signalAccess:
        "Core is the discipline layer: you build the journal, screenshots and review habits that later make AI signals and personal alerts much more powerful.",
      bestFor:
        "Best for traders who need structure first: track trades, review mistakes, stop relying on memory and start building a real trading database.",
      clientFeels:
        "The client finally feels control: every trade is recorded, every mistake can be reviewed, and every session becomes part of a bigger system.",
      unlocks: [
        "Trading journal with screenshots",
        "Basic AI Coach feedback",
        "Core performance stats",
        "Trade chart AI analysis foundation",
        "CSV/XLSX export foundation",
        "Learning and review workflow",
        "Support assistant access",
        
      ],
      signalLayer: [
        "Build the data foundation for future Personal AI Alerts",
        "Save setups and screenshots for later review",
        "Use AI Coach to understand trade logic and mistakes",
        "Prepare your journal for signal-to-trade analytics",
      ],
      limits: [
        "Up to 300 trades in the journal",
        "Up to 3 screenshots per trade",
        "50 AI Coach requests per month",
        "10 journal AI analyses per month",
        "20 trade chart AI analyses per month",
        "Report export access",
      ],
      accent: "core",
      cta: "Start building discipline",
    },
    {
      id: "pro",
      name: "SkillEdge Edge",
      badge: "Best active-trader value",
      headline: "For traders who want deeper review, stronger context and faster improvement.",
      promise:
        "Edge is the serious active-trader plan. It gives higher AI limits, AI reports, premium chart analysis, social/market context and more room to turn your trading history into a real performance system.",
      signalAccess:
  "Edge is the intelligence layer: you unlock AI Scanner, AI Market Brief, stronger market context and more AI analysis — without real-time actionable AI Alerts.",
      bestFor:
        "Best for active traders who take many trades, review seriously and want SkillEdge to expose repeated mistakes, stronger setups and execution patterns.",
      clientFeels:
        "The client stops feeling lost after the session. Edge makes it clear what worked, what failed, what repeats and what must be fixed next.",
      unlocks: [
        "Everything in Core",
        "AI Reports access",
        "Premium chart analysis",
        "Social / market tickers layer",
        "Deeper journal AI review",
        "More screenshots and more AI usage",
        "AI Scanner / Market Intelligence scanner access",
        "Better setup and mistake discovery",
        
      ],
      signalLayer: [
  "AI Scanner / Market Intelligence scanner access",
  "AI Market Brief for top market opportunities",
  "Market and social context around active tickers",
  "More chart analyses for setup preparation",
  "Stronger journal feedback before using real-time AI Alerts",
  "Better base for future personal signal matching",
],
      limits: [
        "Up to 2,000 trades in the journal",
        "Up to 5 screenshots per trade",
        "200 AI Coach requests per month",
        "50 journal AI analyses per month",
        "100 trade chart AI analyses per month",
        "30 AI reports per month",
      ],
      accent: "edge",
      cta: "Upgrade to active review",
    },
    {
      id: "elite",
      name: "SkillEdge Elite",
      badge: "Full AI Trading Desk",
      headline: "For serious traders who want signals, scanner, journal sync and maximum AI power.",
      promise:
        "Elite is the flagship experience. This is where SkillEdge becomes a true AI Trading Desk: AI scanner access, full alert workflow, maximum AI limits, deep journal review, signal-to-trade analytics and the strongest path toward personal AI alerts.",
      signalAccess:
        "Elite is the signal layer: structured AI alerts, alert breakdown, trade draft from signal, decision tracking, outcome learning and missed opportunity coaching.",
      bestFor:
        "Best for serious traders, advanced users, mentors and prop-style workflows where speed, review quality, AI usage and signal structure matter every week.",
      clientFeels:
        "The client feels like he has a trading desk beside him: market opportunities are organized, signals have a plan, trades connect to the journal and every outcome becomes feedback.",
      unlocks: [
        "Everything in Edge",
        "AI Scanner access",
        "Signal-to-Journal workflow",
        "AI Alerts / Trading Desk workflow",
        "Floating alerts widget",
        "Alert breakdown modal",
        "Create trade draft from alert",
        "Decision tracking: Watching / Taken / Skipped / Missed",
        "Outcome Learning Analytics",
        "Missed Opportunity Coach",
        "Maximum AI usage limits",
        
      ],
      signalLayer: [
        "Structured AI alerts with setup, trigger, entry, stop and targets",
        "Signal risk, scenario, invalidation and management plan",
        "Save alert setup to Playbook",
        "Connect alert to Journal trade",
        "Track Taken + Worked, Taken + Failed, Missed Opportunity and Good Skip",
        "Build the future base for Personal AI Alerts from the client’s best trades",
      ],
      limits: [
        "Up to 10,000 trades in the journal",
        "Up to 10 screenshots per trade",
        "1,000 AI Coach requests per month",
        "300 journal AI analyses per month",
        "500 trade chart AI analyses per month",
        "150 AI reports per month",
      ],
      accent: "elite",
      cta: "Unlock the Trading Desk",
    },
  ];

  const deskWorkflow = [
    ["1", "Market moves", "SkillEdge watches active stocks, crypto, catalysts and opportunity flow."],
    ["2", "AI ranks the idea", "The platform filters noise and highlights situations with stronger context."],
    ["3", "Signal appears", "The client receives a structured alert, not a random ticker name."],
    ["4", "Trade plan is clear", "Direction, trigger, entry zone, stop, targets, invalidation and risk are visible."],
    ["5", "Journal sync", "A taken signal can become a trade draft and connect to real execution."],
    ["6", "Outcome review", "SkillEdge shows what worked, what failed, what was missed and what to fix."],
  ];

  const whyPay = [
    {
      title: "You are paying for clarity",
      text: "A trader does not need more noise. A trader needs to know what is in play, why it matters, where the risk is and what confirms the idea.",
    },
    {
      title: "You are paying for discipline",
      text: "SkillEdge forces the process: plan, decision, journal, screenshot, outcome, review. That is how random trading turns into a system.",
    },
    {
      title: "You are paying for feedback",
      text: "Every alert and every trade can become a lesson: did you enter late, skip the winner, move the stop, miss the target or follow the plan?",
    },
    {
      title: "You are paying for future personalization",
      text: "The more clean data the client builds, the more powerful personal AI alerts can become: patterns based on the trader’s own best and worst trades.",
    },
  ];

  const signalComparison = [
    [
      "Typical signal service",
      "Ticker + direction, little context, no journal connection, no learning loop.",
    ],
    [
      "SkillEdge AI Trading Desk",
      "Structured setup, trigger, plan, risk, journal sync, decision tracking, outcome review and coaching.",
    ],
  ];

  const planComparison = [
    ["Feature", "Core", "Edge", "Elite"],
    ["Trade journal + screenshots", "Yes", "Yes", "Yes"],
    ["AI Coach", "50 / month", "200 / month", "1,000 / month"],
    ["Journal AI analysis", "10 / month", "50 / month", "300 / month"],
    ["Trade chart AI analysis", "20 / month", "100 / month", "500 / month"],
    ["AI Reports", "—", "30 / month", "150 / month"],
    ["Social / market tickers layer", "—", "Yes", "Yes"],
    ["Premium chart analysis", "—", "Yes", "Yes"],
    ["AI Scanner / Market Intelligence scanner", "—", "Yes", "Yes"],
    ["Real-time AI Alerts", "—", "—", "Yes"],
    ["Signal-to-Journal workflow", "Foundation", "Advanced prep", "Full workflow"],
    ["Best for", "Discipline", "Active review", "AI Trading Desk"],
  ];

  const getPlanClasses = (accent: "core" | "edge" | "elite") => {
    if (accent === "edge") {
      return "border-indigo-300/45 bg-gradient-to-b from-indigo-500/20 via-white/[0.05] to-white/[0.025] shadow-[0_24px_100px_rgba(79,70,229,0.2)]";
    }

    if (accent === "elite") {
      return "border-cyan-300/45 bg-gradient-to-b from-cyan-500/20 via-white/[0.055] to-white/[0.025] shadow-[0_24px_120px_rgba(34,211,238,0.22)]";
    }

    return "border-white/10 bg-white/[0.035]";
  };

  const getBadgeClasses = (accent: "core" | "edge" | "elite") => {
    if (accent === "edge") {
      return "border-indigo-300/25 bg-indigo-300/10 text-indigo-100";
    }

    if (accent === "elite") {
      return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
    }

    return "border-white/10 bg-white/[0.05] text-white/65";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-24 pt-8"
    >
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <Badge>Choose your SkillEdge level</Badge>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl"
            >
              Pick the plan that matches how serious you are about becoming a better trader.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg"
            >
              SkillEdge is not priced as another dashboard. It is priced as a
              trading operating system: journal, AI coach, reports, market
              intelligence, signal workflow, execution review and the foundation
              for personal AI alerts based on your own trading history.
            </motion.p>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                ["Core", "Build discipline and clean trading data"],
                ["Edge", "Review deeper and understand patterns faster"],
                ["Elite", "Unlock the full AI Trading Desk and signal workflow"],
              ].map(([title, text], index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 + index * 0.05 }}
                  className="rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-sm font-semibold text-white">
                    {title}
                  </div>

                  <div className="mt-2 text-xs leading-5 text-white/50">
                    {text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-[2.25rem] border border-cyan-300/15 bg-[#0b1220]/90 p-5 shadow-[0_24px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/45">
                  Elite signal preview
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  AI Trading Desk alert
                </div>
              </div>

              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Priority 88
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {[
                ["Setup", "Backside fade / weakness continuation"],
                ["Trigger", "Lower high + failed reclaim"],
                ["Entry plan", "Entry zone · stop · targets · invalidation"],
                ["Learning loop", "Taken / Skipped / Missed → outcome review"],
              ].map(([label, value], index) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                    {label}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-white/85">
                    {value}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm leading-6 text-amber-50/72">
              The signal is only the beginning. SkillEdge connects the alert to
              the journal, tracks the decision and turns the outcome into a
              coaching point.
            </div>
          </motion.div>
        </div>

        <div className="relative mt-8 inline-flex flex-wrap gap-2 rounded-full border border-white/10 bg-black/20 p-2">
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
      </section>



      <section>
        <SectionTitle
          eyebrow="Why the signal layer matters"
          title="SkillEdge signals are built to educate, not to make the trader blindly click."
          text="A weak signal service creates dependency. A strong trading system creates clarity. SkillEdge is designed so the trader understands the setup, the risk, the confirmation and the lesson after the outcome."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {signalFeatures.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -5 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20"
            >
              <div className="text-xl font-semibold text-white">
                {item.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/60">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <div className="grid gap-6 xl:grid-cols-3">
          {premiumPlans.map((plan, idx) => {
            const currentPrice = priceMatrix[plan.id][billing];

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: idx * 0.06 }}
                whileHover={{ y: -6, scale: 1.01 }}
                className={`relative flex h-full flex-col overflow-hidden rounded-[2rem] border p-6 ${getPlanClasses(
                  plan.accent
                )}`}
              >
                <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

                {plan.accent === "elite" ? (
                  <div className="absolute left-6 top-6 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    Best for AI Signals
                  </div>
                ) : null}

                <div className={`relative ${plan.accent === "elite" ? "pt-10" : ""}`}>
                  <div
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getBadgeClasses(
                      plan.accent
                    )}`}
                  >
                    {plan.badge}
                  </div>

                  <div className="mt-5 text-2xl font-semibold text-white">
                    {plan.name}
                  </div>

                  <div className="mt-3 text-lg font-semibold leading-7 text-white/90">
                    {plan.headline}
                  </div>

                  <p className="mt-4 text-sm leading-7 text-white/60">
                    {plan.promise}
                  </p>

                  <div className="mt-7 flex items-end gap-2">
                    <div className="text-5xl font-semibold text-white">
                      ${currentPrice}
                    </div>

                    <div className="pb-2 text-sm text-white/45">
                      {periodLabel}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 text-sm leading-6 text-cyan-50/75">
                    <span className="font-semibold text-white">
                      Signal layer:
                    </span>{" "}
                    {plan.signalAccess}
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
                    <span className="font-semibold text-white/85">
                      Best for:
                    </span>{" "}
                    {plan.bestFor}
                  </div>

                  <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 text-sm leading-6 text-emerald-50/70">
                    {plan.clientFeels}
                  </div>

                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/35">
                      What you unlock
                    </div>

                    <div className="mt-4 space-y-3">
                      {plan.unlocks.map((item) => (
                        <div key={item} className="flex gap-3 text-sm text-white/70">
                          <Icon name="check" className="text-emerald-300" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/45">
                      Signal / intelligence value
                    </div>

                    <div className="mt-4 space-y-3">
                      {plan.signalLayer.map((item) => (
                        <div key={item} className="flex gap-3 text-sm text-white/66">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/35">
                      Plan limits
                    </div>

                    <div className="mt-4 space-y-3">
                      {plan.limits.map((item) => (
                        <div key={item} className="flex gap-3 text-sm text-white/58">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative mt-auto pt-8">
                  <ButtonX
                    onClick={() => handleCheckout(plan.id, billing)}
                    className="w-full"
                  >
                    <Icon name="money" className="mr-2 h-4 w-4" />
                    {plan.cta}
                  </ButtonX>

                  <p className="mt-3 text-center text-xs text-white/45">
                    {billingLabels.networkNote}
                  </p>

                  <button
                    disabled
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white/35"
                  >
                    {billingLabels.cardSoon}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {checkoutStatus ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-white/70">
            {checkoutStatus}
          </div>
        ) : null}
      </section>

      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0b1020] p-6 md:p-10">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Badge>Elite workflow</Badge>

            <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
              What happens when a signal becomes a real trade?
            </h2>

            <p className="mt-5 text-base leading-8 text-white/62">
              This is the part most signal services do not have. SkillEdge is
              built to connect the alert with the trader’s decision, execution,
              journal, screenshot, outcome and next coaching point.
            </p>
          </div>

          <div className="grid gap-3">
            {deskWorkflow.map(([step, title, text], index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.05 }}
                className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[56px_1fr]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                  {step}
                </div>

                <div>
                  <div className="text-lg font-semibold text-white">
                    {title}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-white/58">
                    {text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Why pay for SkillEdge"
          title="Because the trader does not need more screenshots of random PnL. The trader needs a process that can be repeated."
          text="A serious product should help the client understand the market, himself and his execution. That is why SkillEdge connects signals, journal, reports, playbook and coaching in one system."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {whyPay.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
            >
              <div className="text-xl font-semibold text-white">
                {item.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/60">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <CardBox>
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">
            Signal service vs SkillEdge
          </div>

          <h3 className="mt-3 text-2xl font-semibold text-white">
            The difference is the learning loop.
          </h3>

          <p className="mt-3 text-sm leading-7 text-white/60">
            We are not building a product that makes traders blindly dependent
            on alerts. We are building a system that helps the trader understand
            why the alert exists and what the result teaches.
          </p>

          <div className="mt-6 space-y-3">
            {signalComparison.map(([title, text], index) => (
              <div
                key={title}
                className={`rounded-3xl border p-4 ${
                  index === 0
                    ? "border-red-300/15 bg-red-300/[0.035]"
                    : "border-emerald-300/15 bg-emerald-300/[0.035]"
                }`}
              >
                <div className="text-lg font-semibold text-white">
                  {title}
                </div>

                <p className="mt-2 text-sm leading-6 text-white/62">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </CardBox>

        <CardBox>
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">
            Plan comparison
          </div>

          <h3 className="mt-3 text-2xl font-semibold text-white">
            Choose the level of intelligence around your trading.
          </h3>

          <p className="mt-3 text-sm leading-7 text-white/60">
            Core builds the base. Edge gives serious active-trader review.
            Elite unlocks the full AI Trading Desk and signal workflow.
          </p>

          <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="min-w-[820px]">
              {planComparison.map((row, rowIndex) => (
                <div
                  key={`pricing-row-${rowIndex}`}
                  className={`grid grid-cols-4 ${
                    rowIndex === 0
                      ? "bg-white/5 text-white"
                      : "border-t border-white/10 text-white/65"
                  }`}
                >
                  {row.map((cell, cellIndex) => (
                    <div
                      key={`pricing-cell-${rowIndex}-${cellIndex}`}
                      className="p-4 text-sm"
                    >
                      {cell}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </CardBox>
      </section>

      <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-cyan-500/15 via-white/[0.04] to-indigo-500/10 p-6 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-white/45">
              Final decision
            </div>

            <h2 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
              If you want a journal, choose Core. If you want scanner intelligence, choose Edge. If you want real-time AI Alerts, choose Elite.
            </h2>

            <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">
              SkillEdge is built for traders who want to stop operating from
              memory, emotion and scattered tools. The more serious the trader
              is about review, execution and signals, the more valuable the
              higher plans become.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <div className="text-lg font-semibold text-white">
              The clean recommendation
            </div>

            <div className="mt-5 space-y-3">
              {[
                "Choose Core if you need structure and clean journaling.",
                "Choose Edge if you trade actively and want deeper AI review.",
                "Choose Elite if you want real-time AI Alerts, floating alert widget and the full signal-to-journal workflow.",
              ].map((item) => (
                <div key={item} className="flex gap-3 text-sm text-white/70">
                  <Icon name="check" className="text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>

            <ButtonX
              onClick={() => handleCheckout("elite", billing)}
              className="mt-6 w-full shadow-[0_0_35px_rgba(34,211,238,0.25)]"
            >
              Unlock SkillEdge Elite
              <span className="ml-2">→</span>
            </ButtonX>

            <p className="mt-4 text-xs leading-5 text-white/40">
              SkillEdge is not financial advice and does not guarantee profits.
              It is a premium trading workflow built to improve process,
              structure, review and decision quality.
            </p>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function TeamPage({
  t,
  setActive,
}: {
  t: any;
  setActive: (v: PageKey) => void;
}) {
  const principles = [
    {
      title: "Built for traders who want process, not hype",
      text: "SkillEdge is not being built as a noisy signal room. The product is designed around structure: market context, trade plan, execution review, journal feedback and long-term improvement.",
    },
    {
      title: "AI should explain, not replace thinking",
      text: "The goal is not to make the trader blindly click. SkillEdge should help the trader understand why an idea matters, what confirms it, what invalidates it and what the outcome teaches.",
    },
    {
      title: "The journal is the trader’s truth",
      text: "Every trader says he knows his mistakes. The journal proves it. SkillEdge is built to turn real trades, screenshots and outcomes into measurable feedback.",
    },
  ];

  const productBeliefs = [
    "Signals without education create dependency.",
    "A trade without a plan cannot be reviewed properly.",
    "A journal without feedback becomes a graveyard of old trades.",
    "The best product should make the trader calmer, sharper and more disciplined.",
    "Personal AI alerts become powerful only when the trader builds clean historical data.",
  ];

  const buildPillars = [
    {
      title: "Market Intelligence",
      text: "Find what deserves attention across stocks, crypto, catalysts and unusual activity.",
    },
    {
      title: "AI Trading Desk",
      text: "Turn opportunities into structured alerts with setup, trigger, entry, stop, targets and invalidation.",
    },
    {
      title: "Journal Intelligence",
      text: "Connect every decision to real execution, screenshots, PnL, mistakes and improvement.",
    },
    {
      title: "Personal Edge",
      text: "Use the client’s own best and worst trades to build future personal alert logic.",
    },
  ];

  const roadmap = [
    {
      step: "01",
      title: "Build the foundation",
      text: "Journal, dashboard, screenshots, learning, reports, billing and support foundation.",
    },
    {
      step: "02",
      title: "Connect signals with behavior",
      text: "AI alerts, decision tracking, trade draft creation, outcome learning and missed opportunity coaching.",
    },
    {
      step: "03",
      title: "Expand the intelligence layer",
      text: "Premium market data, full ticker universe, Binance universe, halt screener, heatmaps and stronger scanner logic.",
    },
    {
      step: "04",
      title: "Personalize the edge",
      text: "AI learns from the client’s best setups, weak patterns, execution mistakes and journal history.",
    },
  ];

  const trustCards = [
    {
      title: "No fake certainty",
      text: "Trading contains risk. SkillEdge should never pretend that any AI model can guarantee profit. The product is built for better process, not magic predictions.",
    },
    {
      title: "Transparent logic",
      text: "The client should understand why an alert appears, which sources are tracked and what part of the idea is strong or weak.",
    },
    {
      title: "Premium product mindset",
      text: "Every feature should feel useful, serious and connected to the trader’s real workflow — not like a random MVP feature added for decoration.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-24 pt-8"
    >
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <Badge>Behind SkillEdge AI</Badge>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl"
            >
              We are building the AI trading system serious traders wish already existed.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg"
            >
              SkillEdge AI is being built with one clear idea: traders do not
              need more noise. They need a system that connects market
              opportunities, AI alerts, journal review, execution discipline,
              learning and personal improvement.
            </motion.p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonX onClick={() => setActive("pricing")}>
                View plans
                <span className="ml-2">→</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => setActive("product")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Explore product
              </button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-[2.25rem] border border-cyan-300/15 bg-[#0b1220]/90 p-5 shadow-[0_24px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/45">
                  Product philosophy
                </div>

                <div className="mt-2 text-2xl font-semibold text-white">
                  Process over prediction
                </div>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
                <Icon name="brain" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {productBeliefs.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.28 + index * 0.05 }}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/65"
                >
                  <Icon name="check" className="text-emerald-300" />
                  <span>{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="What drives the product"
          title="SkillEdge is designed around trader development, not empty hype."
          text="The strongest traders are not strong because they clicked one perfect alert. They are strong because they have process, risk control, review, repetition and the ability to learn from their own behavior."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {principles.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.06 }}
              whileHover={{ y: -5 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20"
            >
              <div className="text-xl font-semibold text-white">
                {item.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/60">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <Badge>What we are building</Badge>

          <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
            A connected system, not a collection of random tools.
          </h2>

          <p className="mt-5 text-base leading-8 text-white/62">
            The product is built around one workflow: find opportunity,
            understand the setup, make a decision, record execution, review the
            outcome and build a stronger personal edge.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {buildPillars.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.05 }}
              className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"
            >
              <div className="text-lg font-semibold text-white">
                {item.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/58">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0b1020] p-6 md:p-10">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Badge>Development roadmap</Badge>

            <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-5xl">
              We are building toward a premium AI Trading Desk.
            </h2>

            <p className="mt-5 text-base leading-8 text-white/62">
              The foundation is already product-focused: journal, alerts,
              learning, reports, support, billing and market intelligence. The
              next level is premium data, full market scanning and personal AI
              alerts based on the client’s own trading history.
            </p>
          </div>

          <div className="space-y-4">
            {roadmap.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.05 }}
                className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:grid-cols-[64px_1fr]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                  {item.step}
                </div>

                <div>
                  <div className="text-lg font-semibold text-white">
                    {item.title}
                  </div>

                  <p className="mt-2 text-sm leading-7 text-white/58">
                    {item.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Trust principles"
          title="A serious trading product must be honest about risk and serious about process."
          text="We want SkillEdge to feel premium not because it makes loud promises, but because the product is clear, useful, structured and built around real trader behavior."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {trustCards.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.06 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
            >
              <div className="text-xl font-semibold text-white">
                {item.title}
              </div>

              <p className="mt-3 text-sm leading-7 text-white/60">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-cyan-500/15 via-white/[0.04] to-indigo-500/10 p-6 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-white/45">
              Built with one mission
            </div>

            <h2 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
              Help traders stop operating from chaos and start operating from a system.
            </h2>

            <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">
              SkillEdge AI is for traders who want to review harder, think
              cleaner, execute with more discipline and build a repeatable edge
              from real data instead of emotions and memory.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <div className="text-lg font-semibold text-white">
              Ready to see the product?
            </div>

            <p className="mt-3 text-sm leading-7 text-white/58">
              Explore the product page or choose the plan that fits your current
              trading level.
            </p>

            <div className="mt-6 grid gap-3">
              <ButtonX onClick={() => setActive("product")} className="w-full">
                Explore SkillEdge
                <span className="ml-2">→</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => setActive("pricing")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                View pricing
              </button>
            </div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function PremiumFooter({
  t,
  setActive,
  handleCheckout,
}: {
  t: any;
  setActive: (v: PageKey) => void;
  handleCheckout: (id: string, billingPeriod: BillingPeriod) => void;
}) {
  const footerProductLinks: { label: string; page: PageKey; href: string }[] = [
  { label: "Product", page: "product", href: "/product" },
  { label: "Pricing", page: "pricing", href: "/pricing" },
  { label: "Team", page: "team", href: "/team" },
  { label: "Home", page: "home", href: "/" },
];

  const footerFeatureLinks = [
  { label: "AI Trading Desk", href: "/product" },
  { label: "AI Alerts", href: "/product" },
  { label: "Market Intelligence", href: "/product" },
  { label: "Journal & Screenshots", href: "/product" },
  { label: "Execution Coach", href: "/product" },
  { label: "Outcome Learning", href: "/product" },
  { label: "Playbook", href: "/product" },
  { label: "Reports", href: "/product" },
  { label: "Learning Center", href: "/product" },
  { label: "Support Assistant", href: "/product" },
];

  const footerResourceLinks = [
  { label: "Getting Started", href: "/product" },
  { label: "How SkillEdge Works", href: "/product" },
  { label: "Trading Journal Guide", href: "/product" },
  { label: "AI Alerts Guide", href: "/product" },
  { label: "Contact Support", href: "/team" },
];

  const footerLegalLinks = [
  { label: "Privacy Policy", href: "/legal/privacy-policy" },
  { label: "Terms & Conditions", href: "/legal/terms" },
  { label: "Disclaimer Statement", href: "/legal/disclaimer" },
  { label: "EULA", href: "/legal/eula" },
  { label: "Billing & Cancellation", href: "/legal/billing" },
  { label: "Cookie Policy", href: "/legal/cookies" },
];

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/10 bg-[#070b16]">
      <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <Link href="/" className="flex items-center gap-3 text-left">
              <BrandMark size="md" />

              <div>
                <div className="text-xl font-semibold text-white">
                  SkillEdge AI
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">
                  {t.brandTag}
                </div>
              </div>
            </Link>

            <p className="mt-6 max-w-md text-sm leading-7 text-white/55">
              Premium AI trading workspace for serious traders: market
              intelligence, AI alerts, journal, execution review, playbook,
              reports and coaching in one connected system.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonX onClick={() => setActive("pricing")}>
                Choose plan
                <span className="ml-2">→</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => handleCheckout("demo", "monthly")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Request demo
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-xs leading-6 text-amber-50/65">
              SkillEdge AI is not financial advice and does not guarantee
              profits. The platform is built to improve structure, review,
              decision quality and trading process.
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Product
              </div>

              <div className="mt-4 space-y-3">
                {footerProductLinks.map((item) => (
  <Link
    key={item.label}
    href={item.href}
    className="block text-left text-sm text-white/58 transition hover:text-white"
  >
    {item.label}
  </Link>
))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Features
              </div>

              <div className="mt-4 space-y-3">
                {footerFeatureLinks.map((item) => (
  <Link
    key={item.label}
    href={item.href}
    className="block text-left text-sm text-white/58 transition hover:text-white"
  >
    {item.label}
  </Link>
))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Resources
              </div>

              <div className="mt-4 space-y-3">
                {footerResourceLinks.map((item) => (
  <Link
    key={item.label}
    href={item.href}
    className="block text-left text-sm text-white/58 transition hover:text-white"
  >
    {item.label}
  </Link>
))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Legal
              </div>

              <div className="mt-4 space-y-3">
                {footerLegalLinks.map((item) => (
  <Link
    key={item.href}
    href={item.href}
    className="block text-left text-sm text-white/58 transition hover:text-white"
  >
    {item.label}
  </Link>
))}
<button
  type="button"
  onClick={() => {
    window.dispatchEvent(new Event("skilledge:open-cookie-settings"));
  }}
  className="block text-left text-sm text-cyan-100/70 transition hover:text-cyan-100"
>
  Cookie settings
</button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 border-t border-white/10 pt-8 text-sm text-white/45 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-semibold text-white/70">
              {t.footer.contact}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <span>support@upyourskills.site</span>
              <span>{t.footer.location}</span>
              <span>{t.footer.demo}</span>
            </div>
          </div>

          <div className="md:text-right">
            <div>© 2026 SkillEdge AI. All rights reserved.</div>
            <div className="mt-2 text-xs text-white/35">
              Built for traders who want structure, discipline and measurable
              improvement.
            </div>
          </div>
        </div>
      </div>
    </footer>
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