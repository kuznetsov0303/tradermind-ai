"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CandlestickChart,
  Bot,
  Camera,
  BarChart3,
  Target,
  ArrowRight,
  Check,
  Menu,
  X,
  Users,
  Clock3,
  Sparkles,
  AlertTriangle,
  LineChart,
  MessageSquare,
  FileBarChart,
  Lock,
  Rocket,
  BadgeDollarSign,
  Gauge,
  Workflow,
  CreditCard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const navKeys = ["home", "product", "pricing", "team"];

const translations = {
  en: {
    langLabel: "EN",
    switchLanguage: "Language",
    requestDemo: "Request demo",
    nav: { home: "Home", product: "Product", pricing: "Pricing", team: "Team" },
    brandTag: "Performance intelligence",
    heroBadge: "AI trading intelligence platform",
    heroTitle: "Turn chaotic trading into a measurable edge.",
    heroText:
      "TraderMind AI is the full-stack performance platform for active traders: journal every trade, detect hidden patterns, catch repeated mistakes, review screenshots, scan gappers and halts, and get AI coaching built from your actual behavior.",
    startTrial: "Start free trial",
    watchTour: "Watch product tour",
    stats: [
      ["50k+", "Trades analyzed"],
      ["82%", "Users identify repeat mistakes in 30 days"],
      ["6x", "Faster review workflow"],
    ],
    coreValueEyebrow: "Core value",
    coreValueTitle: "A trading journal is not enough.",
    coreValueText:
      "Most traders store trades. Very few understand why they keep repeating the same profitable or destructive behavior. TraderMind AI turns trade history into a living performance system.",
    patternLibrary: "Pattern library",
    rankedEdge: "Your edge, ranked by data",
    preTradeValidation: "Pre-trade validation",
    preTradeValidationText: "Ask the AI if your plan matches your highest expectancy patterns before you enter.",
    mistakePrevention: "Mistake prevention",
    mistakePreventionText: "Detects emotional drift, low-quality trades, and recurring rule breaks before they damage the session.",
    timeBasedEdge: "Time-based edge",
    timeBasedEdgeText: "See when you perform best, when fatigue kicks in, and which sessions should be avoided.",
    monetizableReports: "Monetizable reports",
    monetizableReportsText: "Export performance reviews for coaches, teams, prop desks, and investors in a polished format.",
    productEyebrow: "Maximum version",
    productTitle: "Full product structure from first login to elite analytics",
    productText:
      "This is the expanded product architecture: not a light MVP, but the complete version designed to look and feel like a serious AI-native trading platform from day one.",
    howToUse: "How to use it",
    completeFlow: "Complete operating flow",
    featureStack: "Maximum feature stack",
    fullBuild: "Everything included in the full build",
    productExtraEyebrow: "Live market intelligence",
    productExtraTitle: "Built-in gapper and halt scanner with real-time visual matching",
    productExtraText:
      "TraderMind AI does not stop at journaling. The platform also watches the live market: scanning gappers and halts, then matching uploaded screenshots against similar same-day situations so traders can compare structure, context, and behavior while the session is still alive.",
    scannerLayer: "Scanner layer",
    liveScreenerAdds: "What the live screener adds",
    userExperience: "How users experience it",
    screenshotFlow: "From screenshot to matching live examples",
    aiEyebrow: "AI product demo",
    aiTitle: "OpenAI-powered coach inside the product",
    aiText:
      "The live product should call a secure server endpoint that talks to OpenAI. The demo below is already wired to use /api/ai-coach when available, and safely falls back to a local simulation in preview mode.",
    aiPlaceholder: "Ask about a setup, mistake, or risk plan...",
    aiButton: "Ask AI Coach",
    aiStatusReady: "Ready to connect to /api/ai-coach",
    aiStatusLive: "Live API response received.",
    aiStatusFallback: "Preview mode: simulated reply shown because no backend endpoint is connected yet.",
    checkoutEyebrow: "Payments",
    checkoutTitle: "Stripe-ready subscription flow",
    checkoutText:
      "The buttons below are wired to call /api/create-checkout-session. In preview mode they show a safe fallback message, but the frontend flow is already prepared for live Stripe checkout.",
    buyPlan: "Buy plan",
    pricingEyebrow: "Pricing",
    pricingTitle: "Choose the plan that matches your trading ambition",
    pricingText:
      "Each plan is structured around how deep you want the AI layer to go: from clean journaling and reviews to pattern intelligence, coaching and team workflows.",
    mostPopular: "Most popular",
    perMonth: "/ month",
    planComparison: "Plan comparison",
    whatChanges: "What changes between plans",
    comparisonText:
      "Starter is the clean entry point. Pro unlocks the real AI advantage. Elite is built for teams, coaches, and advanced review systems.",
    teamEyebrow: "Team",
    teamTitle: "Built by traders, engineers, and performance architects",
    teamText:
      "This section is intentionally styled as a polished launch narrative. Replace names and biographies with the final real-world team before public release if needed.",
    whyTeamStory: "Why this team story works",
    crediblePositioning: "Credible positioning for a premium launch",
    launchMessage: "Launch message",
    originStory: "The origin story",
    builtForOperators: "Built for serious operators",
    footerTag: "AI-powered trading performance system",
    pages: "Pages",
    coreModules: "Core modules",
    contact: "Contact",
    builtText: "Built to help traders, mentors, and performance-focused teams transform raw execution data into a repeatable edge.",
    productDemos: "Product demos by request",
    sanityChecks: "Sanity checks",
    iconBindings: "Icon bindings",
    pricingConfig: "Pricing config",
    pass: "pass",
    fail: "fail",
    checkoutSuccess: "Checkout session created. Redirect would happen here in production.",
    checkoutFallback: "Preview mode: connect a backend Stripe route at /api/create-checkout-session to enable live checkout.",
  },
  ru: {
    langLabel: "RU",
    switchLanguage: "Язык",
    requestDemo: "Запросить демо",
    nav: { home: "Главная", product: "Функции", pricing: "Тарифы", team: "Команда" },
    brandTag: "Система аналитики эффективности",
    heroBadge: "AI-платформа для анализа трейдинга",
    heroTitle: "Преврати хаотичную торговлю в измеримое преимущество.",
    heroText:
      "TraderMind AI — это полноценная платформа для активных трейдеров: журнал сделок, поиск скрытых закономерностей, выявление повторяющихся ошибок, разбор скриншотов, скринер геперов и холтов, а также AI-коучинг на основе реального поведения трейдера.",
    startTrial: "Начать бесплатно",
    watchTour: "Смотреть обзор",
    stats: [
      ["50k+", "Проанализированных сделок"],
      ["82%", "Пользователей находят повторяющиеся ошибки за 30 дней"],
      ["6x", "Быстрее проходит разбор сделок"],
    ],
    coreValueEyebrow: "Главная ценность",
    coreValueTitle: "Одного журнала сделок недостаточно.",
    coreValueText:
      "Большинство трейдеров просто сохраняют сделки. Но почти никто не понимает, почему он снова и снова повторяет прибыльное или разрушительное поведение. TraderMind AI превращает историю сделок в живую систему анализа эффективности.",
    patternLibrary: "Библиотека паттернов",
    rankedEdge: "Твое преимущество, отсортированное по данным",
    preTradeValidation: "Проверка до входа",
    preTradeValidationText: "Спроси AI, соответствует ли твой план самым сильным паттернам ещё до входа в сделку.",
    mistakePrevention: "Предотвращение ошибок",
    mistakePreventionText: "Выявляет эмоциональный срыв, слабые сделки и повторяющиеся нарушения правил до того, как они испортят сессию.",
    timeBasedEdge: "Преимущество по времени",
    timeBasedEdgeText: "Показывает, когда ты торгуешь лучше всего, когда приходит усталость и каких периодов стоит избегать.",
    monetizableReports: "Коммерческие отчеты",
    monetizableReportsText: "Экспортируй аккуратные отчеты для менторов, команд, проп-десков и инвесторов.",
    productEyebrow: "Максимальная версия",
    productTitle: "Полная структура продукта от первого входа до продвинутой аналитики",
    productText:
      "Это расширенная архитектура продукта: не легкий MVP, а полноценная версия, которая с первого дня выглядит как серьезная AI-платформа для трейдеров.",
    howToUse: "Как пользоваться",
    completeFlow: "Полный рабочий цикл",
    featureStack: "Максимальный набор функций",
    fullBuild: "Все, что входит в полную версию",
    productExtraEyebrow: "Рыночная аналитика в реальном времени",
    productExtraTitle: "Встроенный скринер геперов и холтов с поиском похожих ситуаций в реальном времени",
    productExtraText:
      "TraderMind AI — это не только журнал сделок. Платформа также следит за рынком в реальном времени: сканирует геперы и холты, а затем сопоставляет загруженные пользователем скриншоты с похожими ситуациями этого же дня, чтобы трейдер видел структуру, контекст и развитие сценария прямо во время сессии.",
    scannerLayer: "Слой скринера",
    liveScreenerAdds: "Что дает live screener",
    userExperience: "Как это ощущается для пользователя",
    screenshotFlow: "От скриншота к похожим live-примерам",
    aiEyebrow: "AI-демо продукта",
    aiTitle: "OpenAI-коуч прямо внутри продукта",
    aiText:
      "Живой продукт должен обращаться к защищенному серверному endpoint, который уже общается с OpenAI. Демо ниже уже подключено к /api/ai-coach, если он есть, и безопасно переходит в локальную симуляцию в режиме превью.",
    aiPlaceholder: "Спроси про сетап, ошибку или риск-план...",
    aiButton: "Спросить AI-коуча",
    aiStatusReady: "Готово к подключению к /api/ai-coach",
    aiStatusLive: "Получен живой ответ от API.",
    aiStatusFallback: "Режим превью: показан симулированный ответ, потому что backend endpoint пока не подключен.",
    checkoutEyebrow: "Оплата",
    checkoutTitle: "Подписка через Stripe уже подготовлена",
    checkoutText:
      "Кнопки ниже уже обращаются к /api/create-checkout-session. В режиме превью они показывают безопасное fallback-сообщение, но frontend-поток уже готов к живой Stripe-оплате.",
    buyPlan: "Купить план",
    pricingEyebrow: "Тарифы",
    pricingTitle: "Выбери план под свой уровень амбиций в трейдинге",
    pricingText:
      "Каждый тариф построен вокруг глубины AI-слоя: от чистого журнала и обзоров до поиска закономерностей, коучинга и командных сценариев.",
    mostPopular: "Самый популярный",
    perMonth: "/ месяц",
    planComparison: "Сравнение тарифов",
    whatChanges: "Чем отличаются планы",
    comparisonText:
      "Starter — это чистая точка входа. Pro открывает настоящее AI-преимущество. Elite создан для команд, менторов и продвинутых review-процессов.",
    teamEyebrow: "Команда",
    teamTitle: "Создано трейдерами, инженерами и архитекторами эффективности",
    teamText:
      "Этот раздел специально оформлен как polished launch narrative. Перед публичным запуском замени имена и биографии на реальные, если потребуется.",
    whyTeamStory: "Почему эта история команды работает",
    crediblePositioning: "Правдоподобное позиционирование для премиального запуска",
    launchMessage: "Сообщение запуска",
    originStory: "История появления",
    builtForOperators: "Создано для серьезных операторов",
    footerTag: "AI-система анализа эффективности трейдинга",
    pages: "Страницы",
    coreModules: "Ключевые модули",
    contact: "Контакты",
    builtText: "Создано для трейдеров, менторов и команд, которым нужен системный способ превращать данные о сделках в повторяемое преимущество.",
    productDemos: "Демо продукта по запросу",
    sanityChecks: "Проверки",
    iconBindings: "Привязка иконок",
    pricingConfig: "Конфиг тарифов",
    pass: "ок",
    fail: "ошибка",
    checkoutSuccess: "Checkout session создана. В продакшене здесь произойдет редирект на оплату.",
    checkoutFallback: "Режим превью: подключи backend route /api/create-checkout-session, чтобы включить живую оплату.",
  },
  uk: {
    langLabel: "UA",
    switchLanguage: "Мова",
    requestDemo: "Запросити демо",
    nav: { home: "Головна", product: "Функції", pricing: "Тарифи", team: "Команда" },
    brandTag: "Система аналітики ефективності",
    heroBadge: "AI-платформа для аналізу трейдингу",
    heroTitle: "Перетвори хаотичну торгівлю на вимірювану перевагу.",
    heroText:
      "TraderMind AI — це повноцінна платформа для активних трейдерів: журнал угод, пошук прихованих закономірностей, виявлення повторюваних помилок, аналіз скріншотів, скрінер геперів і холтів, а також AI-коучинг на основі реальної поведінки трейдера.",
    startTrial: "Почати безкоштовно",
    watchTour: "Дивитися огляд",
    stats: [
      ["50k+", "Проаналізованих угод"],
      ["82%", "Користувачів знаходять повторювані помилки за 30 днів"],
      ["6x", "Швидший розбір угод"],
    ],
    coreValueEyebrow: "Головна цінність",
    coreValueTitle: "Одного журналу угод недостатньо.",
    coreValueText:
      "Більшість трейдерів просто зберігають угоди. Але майже ніхто не розуміє, чому він знову і знову повторює прибуткову або руйнівну поведінку. TraderMind AI перетворює історію угод на живу систему аналізу ефективності.",
    patternLibrary: "Бібліотека патернів",
    rankedEdge: "Твоя перевага, відсортована за даними",
    preTradeValidation: "Перевірка до входу",
    preTradeValidationText: "Запитай AI, чи відповідає твій план найсильнішим патернам ще до входу в угоду.",
    mistakePrevention: "Запобігання помилкам",
    mistakePreventionText: "Виявляє емоційний зрив, слабкі угоди та повторювані порушення правил до того, як вони зіпсують сесію.",
    timeBasedEdge: "Перевага за часом",
    timeBasedEdgeText: "Показує, коли ти торгуєш найкраще, коли приходить втома і яких періодів варто уникати.",
    monetizableReports: "Комерційні звіти",
    monetizableReportsText: "Експортуй акуратні звіти для менторів, команд, проп-десків та інвесторів.",
    productEyebrow: "Максимальна версія",
    productTitle: "Повна структура продукту від першого входу до розширеної аналітики",
    productText:
      "Це розширена архітектура продукту: не легкий MVP, а повноцінна версія, яка з першого дня виглядає як серйозна AI-платформа для трейдерів.",
    howToUse: "Як користуватися",
    completeFlow: "Повний робочий цикл",
    featureStack: "Максимальний набір функцій",
    fullBuild: "Усе, що входить у повну версію",
    productExtraEyebrow: "Ринкова аналітика в реальному часі",
    productExtraTitle: "Вбудований скрінер геперів і холтів з пошуком схожих ситуацій у реальному часі",
    productExtraText:
      "TraderMind AI — це не лише журнал угод. Платформа також стежить за ринком у реальному часі: сканує гепери й холти, а потім зіставляє завантажені користувачем скріншоти зі схожими ситуаціями цього ж дня, щоб трейдер бачив структуру, контекст і розвиток сценарію прямо під час сесії.",
    scannerLayer: "Шар скрінера",
    liveScreenerAdds: "Що дає live screener",
    userExperience: "Як це відчувається для користувача",
    screenshotFlow: "Від скріншота до схожих live-прикладів",
    aiEyebrow: "AI-демо продукту",
    aiTitle: "OpenAI-коуч прямо всередині продукту",
    aiText:
      "Живий продукт має звертатися до захищеного серверного endpoint, який уже спілкується з OpenAI. Демо нижче вже підключене до /api/ai-coach, якщо він є, і безпечно переходить у локальну симуляцію в режимі прев'ю.",
    aiPlaceholder: "Запитай про сетап, помилку або risk-plan...",
    aiButton: "Запитати AI-коуча",
    aiStatusReady: "Готово до підключення до /api/ai-coach",
    aiStatusLive: "Отримано живу відповідь від API.",
    aiStatusFallback: "Режим прев'ю: показано симульовану відповідь, бо backend endpoint поки не підключено.",
    checkoutEyebrow: "Оплата",
    checkoutTitle: "Підписка через Stripe уже підготовлена",
    checkoutText:
      "Кнопки нижче вже звертаються до /api/create-checkout-session. У режимі прев'ю вони показують безпечне fallback-повідомлення, але frontend-потік уже готовий до живої Stripe-оплати.",
    buyPlan: "Купити план",
    pricingEyebrow: "Тарифи",
    pricingTitle: "Обери план під свій рівень амбіцій у трейдингу",
    pricingText:
      "Кожен тариф побудований навколо глибини AI-шару: від чистого журналу й оглядів до пошуку закономірностей, коучингу та командних сценаріїв.",
    mostPopular: "Найпопулярніший",
    perMonth: "/ місяць",
    planComparison: "Порівняння тарифів",
    whatChanges: "Чим відрізняються плани",
    comparisonText:
      "Starter — це чиста точка входу. Pro відкриває справжню AI-перевагу. Elite створений для команд, менторів і просунутих review-процесів.",
    teamEyebrow: "Команда",
    teamTitle: "Створено трейдерами, інженерами та архітекторами ефективності",
    teamText:
      "Цей розділ спеціально оформлений як polished launch narrative. Перед публічним запуском заміни імена та біографії на реальні, якщо буде потрібно.",
    whyTeamStory: "Чому ця історія команди працює",
    crediblePositioning: "Правдоподібне позиціонування для преміального запуску",
    launchMessage: "Повідомлення запуску",
    originStory: "Історія появи",
    builtForOperators: "Створено для серйозних операторів",
    footerTag: "AI-система аналізу ефективності трейдингу",
    pages: "Сторінки",
    coreModules: "Ключові модулі",
    contact: "Контакти",
    builtText: "Створено для трейдерів, менторів і команд, яким потрібен системний спосіб перетворювати дані про угоди на повторювану перевагу.",
    productDemos: "Демо продукту за запитом",
    sanityChecks: "Перевірки",
    iconBindings: "Прив'язка іконок",
    pricingConfig: "Конфіг тарифів",
    pass: "ок",
    fail: "помилка",
    checkoutSuccess: "Checkout session створено. У продакшені тут відбудеться редирект на оплату.",
    checkoutFallback: "Режим прев'ю: підключи backend route /api/create-checkout-session, щоб увімкнути живу оплату.",
  },
};

const featureCards = [
  {
    icon: Brain,
    title: "AI Pattern Engine",
    text: "Finds repeatable edges across setup, time of day, ticker profile, gap size, volume, and your own execution behavior.",
  },
  {
    icon: CandlestickChart,
    title: "Trade Journal",
    text: "Capture every trade with setup tags, screenshots, notes, emotions, execution context, and risk metrics in one place.",
  },
  {
    icon: BarChart3,
    title: "Mistake Detection",
    text: "Spots late entries, revenge trading, stop violations, over-sizing, poor exits, and inconsistency before they become habits.",
  },
  {
    icon: Bot,
    title: "AI Coach",
    text: "Gives pre-trade prompts, post-trade reviews, weekly reports, and corrective advice tailored to your actual statistics.",
  },
  {
    icon: Camera,
    title: "Chart Screenshot Review",
    text: "Upload charts and let the system map your entry, exit, stop logic, and structure quality against your best historical trades.",
  },
  {
    icon: Target,
    title: "Discipline Scoring",
    text: "Separate skill from behavior with a discipline score that tracks rule-following, patience, consistency, and risk integrity.",
  },
];

const advancedModules = [
  {
    title: "Gapper & Halt Screener",
    points: [
      "Live scanner for gappers, halts, resumptions, float, relative volume, and intraday momentum context",
      "Lets traders filter the exact market conditions they specialize in before the move is gone",
      "Connects scanner events directly to journaling, pattern review, and AI coaching flows",
    ],
  },
  {
    title: "Trade DNA",
    points: [
      "Builds a personal edge profile from your entire history",
      "Ranks your highest expectancy setups automatically",
      "Shows where profit actually comes from instead of what feels right",
    ],
  },
  {
    title: "Session Intelligence",
    points: [
      "Tracks best trading hours, weekdays, and market conditions",
      "Highlights when fatigue or overtrading degrades quality",
      "Learns your strongest market context over time",
    ],
  },
  {
    title: "Execution Forensics",
    points: [
      "Labels entries as early, clean, late, or chase",
      "Measures stop placement quality and exit efficiency",
      "Compares rule-based decisions against emotional decisions",
    ],
  },
  {
    title: "Team / Mentor Mode",
    points: [
      "Share reports with coach, team lead, or prop mentor",
      "Review traders side by side with performance segments",
      "Export investor-grade PDF and CSV analytics",
    ],
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Log every trade with context",
    text: "Record setup, thesis, risk, chart screenshots, notes, emotions, and whether the trade followed your checklist.",
  },
  {
    step: "02",
    title: "Let AI read your behavior",
    text: "The system clusters your trades, detects patterns, and separates profitable repetition from random wins.",
  },
  {
    step: "03",
    title: "See your real edge",
    text: "Get your best setups, worst habits, strongest market conditions, and a live discipline score in one dashboard.",
  },
  {
    step: "04",
    title: "Improve with guided reviews",
    text: "Use daily recaps, weekly reports, pre-trade checks, and AI coaching prompts to tighten execution over time.",
  },
];

const realtimeFeatures = [
  {
    title: "Gapper detection",
    text: "Scan live premarket and intraday movers by gap %, relative volume, float, price range, catalyst, and continuation context.",
  },
  {
    title: "Halt & resumption monitor",
    text: "Track volatility halts, resumptions, and post-halt behavior so traders can tag and review the exact context around the move.",
  },
  {
    title: "Real-time visual matching",
    text: "When a trader uploads a chart screenshot, the AI searches for similar same-day situations from the live market feed and prior tagged events.",
  },
  {
    title: "Same-day analog examples",
    text: "The system surfaces comparable intraday examples from that session, helping users see how similar setups behaved in real time across other tickers.",
  },
];

const pricing = [
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    subtitle: "For solo traders building consistency",
    features: [
      "Unlimited trade journal",
      "Core dashboard & stats",
      "Basic AI trade reviews",
      "Pattern tagging",
      "Weekly summary",
    ],
    cta: "Start Starter",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    subtitle: "For active traders who want a measurable edge",
    features: [
      "Everything in Starter",
      "Advanced AI pattern engine",
      "Discipline score & behavior tracking",
      "Screenshot analysis",
      "Pre-trade AI coach",
      "Deep setup segmentation",
      "Monthly performance reports",
    ],
    cta: "Choose Pro",
    featured: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: "$129",
    subtitle: "For mentors, prop teams, and serious operators",
    features: [
      "Everything in Pro",
      "Team dashboard",
      "Trader comparison views",
      "Coach / mentor workspace",
      "White-label reports",
      "Priority support",
      "Custom exports & API access",
    ],
    cta: "Book Elite Demo",
    featured: false,
  },
];

const team = [
  {
    name: "Max Volkov",
    role: "Founder & Product Lead",
    bio: "Former trading desk operator turned product strategist. Built TraderMind AI around the real problem most traders have: they remember their winners and completely misread their own habits.",
  },
  {
    name: "Elena Markina",
    role: "Head of AI Systems",
    bio: "Machine learning engineer focused on decision systems, behavioral analytics, and human-in-the-loop review flows for performance products.",
  },
  {
    name: "Andrii Kovalenko",
    role: "Quant Research Director",
    bio: "Specializes in trade segmentation, expectancy models, and turning noisy execution data into stable performance signals traders can actually use.",
  },
  {
    name: "Nika Sokol",
    role: "Behavior & Experience Design",
    bio: "Designs the coaching layer: reflection prompts, discipline scoring, and product experiences that help traders improve instead of just collecting data.",
  },
];

const appScreens = [
  {
    title: "Live Screener",
    desc: "Real-time scanner for gappers, halts, resumptions, volume expansion, float profile, and intraday momentum context.",
    icon: CandlestickChart,
  },
  {
    title: "Dashboard",
    desc: "PnL, win rate, discipline score, best setups, worst mistakes, and trend lines across time.",
    icon: Gauge,
  },
  {
    title: "Add Trade",
    desc: "Fast form for entry, exit, setup, screenshots, notes, market context, and emotional state.",
    icon: Workflow,
  },
  {
    title: "Pattern Lab",
    desc: "Your top-performing patterns, weak spots, expectancy clusters, and behavior-driven breakdowns.",
    icon: BarChart3,
  },
  {
    title: "AI Coach",
    desc: "Pre-trade checks, post-trade reviews, corrective prompts, and weekly coaching summaries.",
    icon: MessageSquare,
  },
  {
    title: "Reports",
    desc: "Daily, weekly, and monthly reports with AI commentary and export-ready analytics.",
    icon: FileBarChart,
  },
  {
    title: "Team Mode",
    desc: "Mentor review workspace with side-by-side trader comparisons and approval workflows.",
    icon: Users,
  },
];

function GlowBlob({ className = "" }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-30 ${className}`}
      style={{
        background:
          "radial-gradient(circle, rgba(129,140,248,.8) 0%, rgba(236,72,153,.45) 45%, rgba(16,185,129,.25) 100%)",
      }}
    />
  );
}

function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
        <Sparkles className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-white/65 md:text-lg">{text}</p>
    </div>
  );
}

function GradientCard({ children, className = "" }) {
  return (
    <Card className={`border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

function MockPhone() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7 }}
      className="relative mx-auto w-full max-w-[340px]"
    >
      <div className="rounded-[2.4rem] border border-white/15 bg-[#0d1020] p-3 shadow-[0_40px_120px_rgba(0,0,0,.45)]">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#11162b] to-[#090d1d] p-4">
          <div className="mb-4 flex items-center justify-between text-xs text-white/50">
            <span>TraderMind AI</span>
            <span>09:41</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-white/45">This week</div>
                <div className="mt-1 text-2xl font-semibold text-white">+$4,280</div>
              </div>
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                Discipline 82
              </div>
            </div>
            <div className="mt-4 h-28 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-transparent to-pink-500/10 p-3">
              <svg viewBox="0 0 240 80" className="h-full w-full">
                <path d="M5 60 C30 55, 45 20, 70 28 S120 70, 150 40 S200 10, 235 18" fill="none" stroke="rgba(99,102,241,1)" strokeWidth="3" strokeLinecap="round" />
                <path d="M5 68 C30 63, 45 48, 70 50 S120 58, 150 55 S200 44, 235 38" fill="none" stroke="rgba(244,114,182,0.85)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Best setup", "1st pullback"],
                ["Weakest habit", "Late exits"],
                ["Best hour", "10:12–10:48"],
                ["AI note", "Avoid 3rd trade"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[11px] text-white/45">{k}</div>
                  <div className="mt-1 text-sm font-medium text-white">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-10 -bottom-12 h-24 rounded-full bg-indigo-500/20 blur-3xl" />
    </motion.div>
  );
}

function HomePage({ t }) {
  return (
    <div className="space-y-24">
      <section className="relative overflow-hidden pt-10 md:pt-16">
        <GlowBlob className="-left-24 top-0 h-72 w-72" />
        <GlowBlob className="right-0 top-28 h-80 w-80" />
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-indigo-200">
                <Rocket className="h-3.5 w-3.5" />
                {t.heroBadge}
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight text-white md:text-7xl">
                {t.heroTitle}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">{t.heroText}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button className="rounded-full bg-white px-6 text-black hover:bg-white/90">
                  {t.startTrial}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="rounded-full border-white/15 bg-white/5 px-6 text-white hover:bg-white/10">
                  {t.watchTour}
                </Button>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {t.stats.map(([value, label]) => (
                  <GradientCard key={label} className="rounded-3xl">
                    <div className="text-2xl font-semibold text-white">{value}</div>
                    <div className="mt-1 text-sm text-white/50">{label}</div>
                  </GradientCard>
                ))}
              </div>
            </motion.div>
          </div>
          <MockPhone />
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={t.coreValueEyebrow} title={t.coreValueTitle} text={t.coreValueText} />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06, duration: 0.55 }}
              >
                <GradientCard className="h-full rounded-[28px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-indigo-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-medium text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">{feature.text}</p>
                </GradientCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="grid gap-8 lg:grid-cols-[.95fr_1.05fr]">
          <GradientCard className="rounded-[32px]">
            <div className="flex items-center gap-3 text-white">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <LineChart className="h-5 w-5 text-pink-300" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">{t.patternLibrary}</div>
                <div className="text-xl font-medium">{t.rankedEdge}</div>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {[
                { name: "Gap > 10% + first pullback above VWAP", win: "68%", rr: "2.4R avg" },
                { name: "Breakout chase after third extension candle", win: "19%", rr: "-1.3R avg" },
                { name: "Short after failed HOD retest with heavy tape", win: "63%", rr: "1.9R avg" },
              ].map((item, idx) => (
                <div key={item.name} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="max-w-[70%] text-sm leading-6 text-white">{item.name}</div>
                    <div className="flex gap-2 text-xs">
                      <span className={`rounded-full px-2 py-1 ${idx === 1 ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                        {item.win} win
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-1 text-white/70">{item.rr}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GradientCard>

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { icon: Target, title: t.preTradeValidation, text: t.preTradeValidationText },
              { icon: AlertTriangle, title: t.mistakePrevention, text: t.mistakePreventionText },
              { icon: Clock3, title: t.timeBasedEdge, text: t.timeBasedEdgeText },
              { icon: BadgeDollarSign, title: t.monetizableReports, text: t.monetizableReportsText },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <GradientCard key={item.title} className="rounded-[28px]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-indigo-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-medium text-white">{item.title}</div>
                  <p className="mt-2 text-sm leading-7 text-white/60">{item.text}</p>
                </GradientCard>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductPage({ t, aiInput, setAiInput, aiMessages, aiStatus, handleAiSubmit, aiLoading }) {
  return (
    <div className="space-y-24 pt-8">
      <section>
        <SectionTitle eyebrow={t.productEyebrow} title={t.productTitle} text={t.productText} />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {appScreens.map((screen, index) => {
            const Icon = screen.icon;
            return (
              <motion.div
                key={screen.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05, duration: 0.5 }}
              >
                <GradientCard className="h-full rounded-[28px]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-lg font-medium text-white">{screen.title}</div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-white/60">{screen.desc}</p>
                </GradientCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.howToUse}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.completeFlow}</div>
          <div className="mt-6 space-y-5">
            {howItWorks.map((item) => (
              <div key={item.step} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 px-3 py-2 text-xs font-medium text-indigo-200">{item.step}</div>
                  <div>
                    <div className="text-lg font-medium text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-white/60">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GradientCard>

        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.featureStack}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.fullBuild}</div>
          <div className="mt-6 grid gap-4">
            {advancedModules.map((module) => (
              <div key={module.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-lg font-medium text-white">{module.title}</div>
                <ul className="mt-3 space-y-3 text-sm leading-7 text-white/60">
                  {module.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </GradientCard>
      </section>

      <section>
        <SectionTitle eyebrow={t.productExtraEyebrow} title={t.productExtraTitle} text={t.productExtraText} />
        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <GradientCard className="rounded-[32px]">
            <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.scannerLayer}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{t.liveScreenerAdds}</div>
            <div className="mt-6 grid gap-4">
              {realtimeFeatures.map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-lg font-medium text-white">{item.title}</div>
                  <p className="mt-2 text-sm leading-7 text-white/60">{item.text}</p>
                </div>
              ))}
            </div>
          </GradientCard>

          <GradientCard className="rounded-[32px]">
            <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.userExperience}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{t.screenshotFlow}</div>
            <div className="mt-6 space-y-4">
              {[
                "Trader uploads a chart screenshot from a setup they are watching or traded.",
                "AI reads the chart context together with ticker, time, setup tags, and market conditions.",
                "The screener searches same-day gappers, halts, resumptions, and structurally similar live examples.",
                "User sees comparable cases from that session, how they resolved, and whether the setup matched profitable historical behavior.",
              ].map((item, index) => (
                <div key={item} className="flex gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-400/10 text-sm font-medium text-indigo-200">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-white/60">{item}</p>
                </div>
              ))}
            </div>
          </GradientCard>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.aiEyebrow}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.aiTitle}</div>
          <p className="mt-3 text-sm leading-7 text-white/60">{t.aiText}</p>
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 text-xs text-white/45">{aiStatus || t.aiStatusReady}</div>
            <div className="max-h-64 space-y-3 overflow-auto pr-1">
              {aiMessages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                    msg.role === "user" ? "ml-8 border border-indigo-400/20 bg-indigo-400/10 text-indigo-100" : "mr-8 border border-white/10 bg-white/[0.04] text-white/75"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder={t.aiPlaceholder}
                className="min-h-[110px] rounded-2xl border border-white/10 bg-[#0d1020] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
              />
              <Button onClick={handleAiSubmit} disabled={aiLoading || !aiInput.trim()} className="rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-50">
                {aiLoading ? "..." : t.aiButton}
              </Button>
            </div>
          </div>
        </GradientCard>

        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.pagesCopyEyebrow}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.pagesCopyTitle}</div>
          <p className="mt-3 text-sm leading-7 text-white/60">{t.pagesCopyText}</p>
          <div className="mt-6 grid gap-4">
            {[
              {
                title: "Product description",
                text: "TraderMind AI is an AI-powered trading journal and performance intelligence app that helps traders discover profitable patterns, eliminate repeated mistakes, and build a measurable trading edge.",
              },
              {
                title: "Hero message",
                text: "Stop guessing. Let AI show you why you win, why you lose, and what to fix next.",
              },
              {
                title: "Tech direction",
                text: "Recommended stack for the full product: React Native or Flutter for mobile, Supabase or PostgreSQL backend, OpenAI for coaching/review layer, and chart storage + media handling for screenshot analysis.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-lg font-medium text-white">{item.title}</div>
                <p className="mt-2 text-sm leading-7 text-white/60">{item.text}</p>
              </div>
            ))}
          </div>
        </GradientCard>
      </section>
    </div>
  );
}

function PricingPage({ t, handleCheckout, checkoutStatus }) {
  return (
    <div className="space-y-20 pt-8">
      <section>
        <SectionTitle eyebrow={t.pricingEyebrow} title={t.pricingTitle} text={t.pricingText} />
        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          {pricing.map((plan) => (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }}>
              <Card className={`h-full overflow-hidden rounded-[32px] border ${plan.featured ? "border-indigo-300/35 bg-gradient-to-b from-indigo-500/15 to-white/[0.04]" : "border-white/10 bg-white/[0.04]"} backdrop-blur-xl`}>
                <CardContent className="p-7">
                  {plan.featured && (
                    <div className="mb-5 inline-flex rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-indigo-100">
                      {t.mostPopular}
                    </div>
                  )}
                  <div className="text-2xl font-semibold text-white">{plan.name}</div>
                  <div className="mt-2 text-sm leading-7 text-white/55">{plan.subtitle}</div>
                  <div className="mt-7 flex items-end gap-2">
                    <div className="text-5xl font-semibold text-white">{plan.price}</div>
                    <div className="pb-2 text-sm text-white/45">{t.perMonth}</div>
                  </div>
                  <div className="mt-7 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex gap-3 text-sm text-white/70">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button onClick={() => handleCheckout(plan)} className={`mt-8 w-full rounded-full ${plan.featured ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white hover:bg-white/15"}`}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    {t.buyPlan}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.checkoutEyebrow}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.checkoutTitle}</div>
          <p className="mt-3 text-sm leading-7 text-white/60">{t.checkoutText}</p>
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
            {checkoutStatus}
          </div>
        </GradientCard>

        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.planComparison}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.whatChanges}</div>
          <p className="mt-3 text-sm leading-7 text-white/60">{t.comparisonText}</p>
          <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
            <div className="grid grid-cols-4 border-b border-white/10 bg-white/[0.04] text-sm text-white">
              {["Feature", "Starter", "Pro", "Elite"].map((item) => (
                <div key={item} className="p-4 font-medium">{item}</div>
              ))}
            </div>
            {[
              ["Unlimited journal", "Yes", "Yes", "Yes"],
              ["AI trade review", "Basic", "Advanced", "Advanced"],
              ["Pattern engine", "—", "Yes", "Yes"],
              ["Screenshot analysis", "—", "Yes", "Yes"],
              ["Discipline score", "—", "Yes", "Yes"],
              ["Team dashboard", "—", "—", "Yes"],
              ["Mentor workflows", "—", "—", "Yes"],
              ["API / white-label", "—", "—", "Yes"],
            ].map((row, idx) => (
              <div key={row[0]} className={`grid grid-cols-4 text-sm ${idx !== 7 ? "border-b border-white/10" : ""}`}>
                {row.map((cell, cellIndex) => (
                  <div key={cellIndex} className="p-4 text-white/70">{cell}</div>
                ))}
              </div>
            ))}
          </div>
        </GradientCard>
      </section>
    </div>
  );
}

function TeamPage({ t }) {
  return (
    <div className="space-y-20 pt-8">
      <section>
        <SectionTitle eyebrow={t.teamEyebrow} title={t.teamTitle} text={t.teamText} />
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {team.map((member, index) => (
            <motion.div key={member.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06, duration: 0.55 }}>
              <GradientCard className="h-full overflow-hidden rounded-[30px]">
                <div className="relative h-48 rounded-[22px] border border-white/10 bg-gradient-to-br from-indigo-500/30 via-fuchsia-500/10 to-emerald-400/20">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,.22),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,.28),transparent_40%)]" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                    <div>
                      <div className="text-xl font-semibold text-white">{member.name}</div>
                      <div className="mt-1 text-sm text-white/65">{member.role}</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-white/60">{member.bio}</p>
              </GradientCard>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.whyTeamStory}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.crediblePositioning}</div>
          <div className="mt-5 grid gap-4">
            {[
              "A founder with trading and product context makes the value proposition believable.",
              "An AI lead explains why pattern detection and coaching are not just marketing terms.",
              "A quant role gives the product analytical depth and seriousness.",
              "A behavior/design role explains why the app improves trader behavior instead of only storing data.",
            ].map((point) => (
              <div key={point} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </GradientCard>

        <GradientCard className="rounded-[32px]">
          <div className="text-sm uppercase tracking-[0.2em] text-white/45">{t.launchMessage}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{t.originStory}</div>
          <p className="mt-5 text-sm leading-8 text-white/60">
            TraderMind AI was born from a simple problem: traders collect endless screenshots, notes, and emotional memories, yet still fail to see the patterns behind their real performance. We built a platform that treats execution data like business intelligence and trader behavior like a system that can be measured, trained, and improved.
          </p>
          <div className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-indigo-200" />
              <div className="font-medium text-white">{t.builtForOperators}</div>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/60">
              Retail traders, prop teams, mentors, and performance-driven trading groups can use the same system with different depth levels.
            </p>
          </div>
        </GradientCard>
      </section>
    </div>
  );
}

function DeveloperNotes({ t }) {
  const iconCheckPassed = featureCards.every((item) => typeof item.icon === "function") && appScreens.every((item) => typeof item.icon === "function");
  const pricingCheckPassed = pricing.length === 3 && pricing.some((item) => item.featured);
  const navCheckPassed = navKeys.length === 4 && navKeys.every((key) => typeof key === "string");

  return (
    <div className="mx-auto mt-10 max-w-7xl px-4 md:px-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/45">
        <div>{t.sanityChecks}</div>
        <div className="mt-2">{t.iconBindings}: {iconCheckPassed ? t.pass : t.fail}</div>
        <div>{t.pricingConfig}: {pricingCheckPassed ? t.pass : t.fail}</div>
        <div>Navigation config: {navCheckPassed ? t.pass : t.fail}</div>
      </div>
    </div>
  );
}

export default function TraderMindAISite() {
  const [active, setActive] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiMessages, setAiMessages] = useState([
    {
      role: "assistant",
      content: "AI Coach ready. Ask about a setup, risk plan, mistake pattern, or screenshot review workflow.",
    },
  ]);
  const [checkoutStatus, setCheckoutStatus] = useState("");

  const t = translations[language] || translations.en;

  const cycleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "ru" : prev === "ru" ? "uk" : "en"));
  };

  const handleCheckout = async (plan) => {
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });

      if (!response.ok) {
        throw new Error("Checkout API not available");
      }

      const data = await response.json();
      setCheckoutStatus(data?.url ? `${t.checkoutSuccess} ${data.url}` : t.checkoutSuccess);
    } catch (error) {
      setCheckoutStatus(t.checkoutFallback);
    }
  };

  const handleAiSubmit = async () => {
    const prompt = aiInput.trim();
    if (!prompt) return;

    setAiMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setAiInput("");
    setAiLoading(true);
    setAiStatus(t.aiStatusReady);

    try {
      const response = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });

      if (!response.ok) {
        throw new Error("AI API not available");
      }

      const data = await response.json();
      const reply = data?.reply || data?.message || "AI response received.";
      setAiMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setAiStatus(t.aiStatusLive);
    } catch (error) {
      const fallback = `Simulated coach reply: Based on your note, check whether the setup matches your strongest historical patterns, confirm risk is fixed before entry, and avoid taking the trade if it appears after your weakest time window or after a halt without clean structure.`;
      setAiMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
      setAiStatus(t.aiStatusFallback);
    } finally {
      setAiLoading(false);
    }
  };

  const currentPage = useMemo(() => {
    switch (active) {
      case "product":
        return (
          <ProductPage
            t={t}
            aiInput={aiInput}
            setAiInput={setAiInput}
            aiMessages={aiMessages}
            aiStatus={aiStatus}
            handleAiSubmit={handleAiSubmit}
            aiLoading={aiLoading}
          />
        );
      case "pricing":
        return <PricingPage t={t} handleCheckout={handleCheckout} checkoutStatus={checkoutStatus || t.checkoutFallback} />;
      case "team":
        return <TeamPage t={t} />;
      default:
        return <HomePage t={t} />;
    }
  }, [active, t, aiInput, aiMessages, aiStatus, aiLoading, checkoutStatus]);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(236,72,153,.12),transparent_26%),linear-gradient(180deg,#070b16_0%,#090e1d_100%)]" />
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)] opacity-30" />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b16]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <button onClick={() => setActive("home")} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_12px_40px_rgba(99,102,241,.28)]">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">TraderMind AI</div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">{t.brandTag}</div>
            </div>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            {navKeys.map((item) => (
              <button
                key={item}
                onClick={() => setActive(item)}
                className={`rounded-full px-4 py-2 text-sm transition ${active === item ? "bg-white text-black" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
              >
                {t.nav[item]}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={cycleLanguage}
              className="flex h-11 min-w-[58px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
              aria-label="Switch language"
              title="Switch language"
            >
              {t.langLabel}
            </button>
            <Button className="rounded-full bg-white text-black hover:bg-white/90">{t.requestDemo}</Button>
          </div>

          <button onClick={() => setMenuOpen((v) => !v)} className="md:hidden" aria-label="Toggle navigation menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10 bg-[#070b16]/90 px-4 pb-4 md:hidden"
            >
              <div className="flex flex-col gap-2 pt-4">
                <button onClick={cycleLanguage} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75">
                  {t.switchLanguage}: {t.langLabel}
                </button>
                {navKeys.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setActive(item);
                      setMenuOpen(false);
                    }}
                    className={`rounded-2xl px-4 py-3 text-left text-sm ${active === item ? "bg-white text-black" : "bg-white/[0.04] text-white/75"}`}
                  >
                    {t.nav[item]}
                  </button>
                ))}
                <Button className="mt-2 rounded-2xl bg-white text-black hover:bg-white/90">{t.requestDemo}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 md:px-8">{currentPage}</main>
      <DeveloperNotes t={t} />

      <footer className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.1fr_.9fr] md:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">TraderMind AI</div>
                <div className="text-sm text-white/45">{t.footerTag}</div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/55">{t.builtText}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <div className="text-sm font-medium text-white">{t.pages}</div>
              <div className="mt-3 space-y-2 text-sm text-white/55">
                {navKeys.map((item) => (
                  <button key={item} onClick={() => setActive(item)} className="block hover:text-white">
                    {t.nav[item]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-white">{t.coreModules}</div>
              <div className="mt-3 space-y-2 text-sm text-white/55">
                <div>AI Coach</div>
                <div>Pattern Engine</div>
                <div>Trade DNA</div>
                <div>Team Reports</div>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-white">{t.contact}</div>
              <div className="mt-3 space-y-2 text-sm text-white/55">
                <div>hello@tradermind.ai</div>
                <div>Dubai / Warsaw / Kyiv</div>
                <div>{t.productDemos}</div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

