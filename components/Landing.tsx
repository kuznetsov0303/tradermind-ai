// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";

const navKeys = ["home", "product", "pricing", "team"];

const iconMap = {
  brain: "◈",
  chart: "⌁",
  bot: "✦",
  camera: "▣",
  target: "◎",
  risk: "⚠",
  time: "◷",
  money: "$",
  radar: "◉",
  shield: "◆",
  mail: "✉",
  globe: "◌",
  check: "✓",
  x: "×",
  arrow: "→",
  menu: "☰",
  close: "×",
  lock: "▰",
  spark: "✧",
  user: "●",
};

function Icon({ name = "spark", className = "" }) {
  return <span className={`inline-flex items-center justify-center font-semibold ${className}`}>{iconMap[name] || "✧"}</span>;
}

const base = {
  en: {
    lang: "EN",
    switchLanguage: "Language",
    brandTag: "Performance intelligence",
    requestDemo: "Request demo",
    nav: { home: "Home", product: "Product", pricing: "Pricing", team: "Team" },
    heroBadge: "AI trading intelligence platform",
    heroTitle: "Find your edge before the market punishes you again.",
    heroText:
      "TraderMind AI shows why you win, why you lose, what patterns are worth trading, and when your behavior is quietly destroying your PnL.",
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
      "Screenshots, notes, watchlists and emotions are scattered everywhere. TraderMind AI connects them into one operating system for execution, review and pattern discovery.",
    problems: [
      ["Random winners feel like skill", "You remember big wins, but miss the exact conditions that made them work."],
      ["Mistakes repeat silently", "Late entries, revenge trades and weak exits keep appearing because they are not measured."],
      ["No live market context", "Your journal knows the trade, but not what similar gappers or halts did that same day."],
    ],
    beforeAfterTitle: "Before / After",
    before: ["Manual screenshots", "Emotional reviews", "No real pattern ranking", "Missed gappers and halt context"],
    after: ["AI trade reviews", "Personal pattern library", "Discipline scoring", "Live screener with similar examples"],
    coreEyebrow: "Core platform",
    coreTitle: "One system for journaling, screening, AI coaching and trader development.",
    coreText: "TraderMind AI is built for active traders, prop teams and mentors who need more than a pretty journal.",
    features: [
      ["AI Pattern Engine", "Finds repeatable edges across setup, time, ticker profile, gap size, volume and execution behavior.", "brain"],
      ["Trade Journal", "Capture trades with setup tags, screenshots, notes, emotions, risk and result.", "chart"],
      ["Mistake Detection", "Spots late entries, revenge trading, stop violations, over-sizing and weak exits.", "risk"],
      ["AI Coach", "Gives pre-trade checks, post-trade reviews, weekly reports and corrective advice.", "bot"],
      ["Screenshot Review", "Upload charts and let AI compare structure with your best and worst examples.", "camera"],
      ["Discipline Score", "Separate trading skill from behavior with a measurable discipline score.", "target"],
    ],
    liveEyebrow: "Live market intelligence",
    liveTitle: "Gapper and halt scanner with same-day AI matching.",
    liveText:
      "The system watches gappers, halts, resumptions, float, relative volume and momentum. When a user uploads a screenshot, AI finds similar situations from that same session.",
    liveCards: [
      ["Gapper detection", "Scan premarket and intraday movers by gap %, relative volume, float, catalyst and continuation context.", "radar"],
      ["Halt monitor", "Track volatility halts, resumptions and post-halt behavior.", "risk"],
      ["Visual matching", "AI compares uploaded screenshots against live same-day market examples.", "camera"],
      ["Analog examples", "See how similar setups resolved across other tickers before making conclusions.", "chart"],
    ],
    agentsEyebrow: "AI agents",
    agentsTitle: "A team of AI agents working behind every trader.",
    agentsText:
      "Instead of one generic chatbot, TraderMind AI uses specialized agents for review, risk, market context and behavioral coaching.",
    agents: [
      ["Review Agent", "Breaks down each trade: thesis, entry quality, exit quality, risk and rule execution.", "bot"],
      ["Pattern Agent", "Builds a personal pattern library and ranks setups by expectancy.", "brain"],
      ["Risk Agent", "Warns about over-sizing, bad R:R, revenge trading and trading outside rules.", "shield"],
      ["Market Context Agent", "Connects trades with gappers, halts, news and same-day analog examples.", "radar"],
      ["Coach Agent", "Creates daily, weekly and monthly improvement plans from real performance data.", "target"],
      ["Team Agent", "Helps mentors and prop teams compare traders and export reports.", "user"],
    ],
    useCasesEyebrow: "Use cases",
    useCasesTitle: "Built for traders who want a system, not motivation.",
    useCases: [
      ["Day traders", "Track intraday setups, timing, screenshots and execution quality."],
      ["Small-cap traders", "Review gappers, halts, low-float names and momentum traps."],
      ["Prop teams", "Standardize reviews, compare traders and coach performance."],
      ["Mentors", "Turn student trades into structured reports and improvement plans."],
    ],
    ctaTitle: "Get early access to TraderMind AI",
    ctaText: "Leave your email and we will invite you to the first private beta.",
    emailPlaceholder: "your@email.com",
    ctaButton: "Join waitlist",
    ctaSuccess: "Request saved. Backend form endpoint can be connected next.",
    product: {
      eyebrow: "Product",
      title: "Full product structure from first login to elite analytics.",
      text: "The platform is designed as a serious AI-native operating system for trading performance, not a lightweight journal.",
      screens: [
        ["Live Screener", "Real-time scanner for gappers, halts, resumptions, volume expansion, float profile and momentum context.", "radar"],
        ["Dashboard", "PnL, win rate, discipline score, best setups, worst mistakes and trend lines.", "chart"],
        ["Add Trade", "Fast trade form with screenshots, notes, setup tags, market context and emotions.", "target"],
        ["Pattern Lab", "Top-performing patterns, weak spots, expectancy clusters and behavior breakdowns.", "brain"],
        ["AI Coach", "Pre-trade checks, post-trade reviews and weekly coaching summaries.", "bot"],
        ["Reports", "Daily, weekly and monthly reports with export-ready analytics.", "money"],
      ],
      flowTitle: "How it works",
      flow: [
        ["01", "Log every trade", "Record setup, thesis, risk, chart, emotions and whether the plan was followed."],
        ["02", "AI reads behavior", "The system clusters trades and separates profitable repetition from random wins."],
        ["03", "Find your edge", "See best setups, worst habits, strongest market conditions and discipline score."],
        ["04", "Improve weekly", "Use reports, pre-trade checks and AI coaching to tighten execution."],
      ],
      aiDemoTitle: "OpenAI-powered coach inside the product",
      aiDemoText:
        "The live app will call a secure server endpoint. This demo already tries /api/ai-coach and falls back safely in preview mode.",
      aiPlaceholder: "Ask about a setup, mistake or risk plan...",
      aiButton: "Ask AI Coach",
      aiReady: "Ready to connect to /api/ai-coach",
      aiLive: "Live API response received.",
      aiFallback: "Preview mode: backend endpoint is not connected yet, showing simulated AI reply.",
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Choose the plan that matches your trading ambition.",
      text: "Start simple, then unlock deeper AI analytics, screenshot review, live matching and team workflows.",
      most: "Most popular",
      month: "/ month",
      buy: "Buy plan",
      checkoutTitle: "Stripe-ready subscription flow",
      checkoutText: "Buttons call /api/create-checkout-session. Connect the backend route to enable live Stripe checkout.",
      checkoutFallback: "Preview mode: connect backend route /api/create-checkout-session to enable live payment.",
      plans: [
        ["starter", "Starter", "$19", "For solo traders building consistency", ["Unlimited trade journal", "Core dashboard", "Basic AI reviews", "Pattern tagging", "Weekly summary"]],
        ["pro", "Pro", "$49", "For active traders who want a measurable edge", ["Everything in Starter", "Advanced AI pattern engine", "Discipline score", "Screenshot analysis", "Pre-trade AI coach", "Live screener matching"]],
        ["elite", "Elite", "$129", "For mentors, prop teams and serious operators", ["Everything in Pro", "Team dashboard", "Trader comparison", "Coach workspace", "White-label reports", "API access"]],
      ],
      compareTitle: "What changes between plans",
      compareText: "Starter is the clean entry point. Pro unlocks the real AI advantage. Elite is built for teams and mentors.",
    },
    team: {
      eyebrow: "Team",
      title: "Built by traders, engineers and performance architects.",
      text: "A credible launch narrative for a premium AI trading product. Replace names with final real people before public launch if needed.",
      people: [
        ["Max Volkov", "Founder & Product Lead", "Former trading desk operator turned product strategist. Built TraderMind AI around the real problem traders have: they misread their own habits."],
        ["Elena Markina", "Head of AI Systems", "Machine learning engineer focused on decision systems, behavioral analytics and human-in-the-loop review flows."],
        ["Andrii Kovalenko", "Quant Research Director", "Specializes in trade segmentation, expectancy models and turning noisy execution data into stable signals."],
        ["Nika Sokol", "Behavior & Experience Design", "Designs the coaching layer: reflection prompts, discipline scoring and improvement workflows."],
      ],
      storyTitle: "Why this team story works",
      story: ["Trading context makes the product believable.", "AI expertise explains why the platform is more than marketing.", "Quant research adds analytical depth.", "Behavior design explains why traders actually improve."],
      originTitle: "The origin story",
      origin: "TraderMind AI was born from a simple problem: traders collect endless screenshots and notes, yet still fail to see the patterns behind their real performance.",
    },
    faqTitle: "FAQ",
    faq: [
      ["Is this financial advice?", "No. TraderMind AI is a performance analytics and journaling platform, not an investment advisor."],
      ["Can beginners use it?", "Yes, but the strongest value appears when a trader logs enough trades for pattern detection."],
      ["Does it replace a mentor?", "No. It makes mentoring and self-review faster, clearer and more data-driven."],
      ["When is the app launching?", "The landing page is live now. The private beta and account system are the next product milestones."],
    ],
    footer: {
      pages: "Pages",
      modules: "Core modules",
      contact: "Contact",
      demo: "Product demos by request",
      text: "Built to help traders, mentors and teams transform raw execution data into a repeatable edge.",
    },
    builtForOperators: "Built for serious operators",
  },
};

base.ru = {
  ...base.en,
  lang: "RU",
  switchLanguage: "Язык",
  brandTag: "Аналитика эффективности",
  requestDemo: "Запросить демо",
  nav: { home: "Главная", product: "Функции", pricing: "Тарифы", team: "Команда" },
  heroBadge: "AI-платформа для трейдинга",
  heroTitle: "Найди своё преимущество до того, как рынок снова накажет тебя.",
  heroText: "TraderMind AI показывает, почему ты зарабатываешь, почему теряешь, какие паттерны стоит торговать и когда твоё поведение незаметно убивает PnL.",
  start: "Получить ранний доступ",
  tour: "Смотреть продукт",
  stats: [["50k+", "сделок проанализировано"], ["82%", "пользователей находят ошибки"], ["6x", "быстрее разбор сделок"]],
  problemEyebrow: "Проблема",
  problemTitle: "Большинству трейдеров не хватает не информации, а понимания себя.",
  problemText: "Скриншоты, заметки, вотчлисты и эмоции разбросаны по разным местам. TraderMind AI собирает всё в одну систему для исполнения, разбора и поиска закономерностей.",
  problems: [["Случайные победы кажутся навыком", "Ты помнишь крупные плюсы, но не видишь точные условия, из-за которых они сработали."], ["Ошибки повторяются тихо", "Поздние входы, revenge trades и слабые выходы возвращаются, потому что их никто не измеряет."], ["Нет live-контекста рынка", "Журнал знает сделку, но не знает, что делали похожие геперы и холты в этот же день."]],
  beforeAfterTitle: "До / После",
  before: ["Ручные скриншоты", "Эмоциональные разборы", "Нет рейтинга паттернов", "Нет контекста геперов и холтов"],
  after: ["AI-разбор сделок", "Личная библиотека паттернов", "Оценка дисциплины", "Live-скринер с похожими примерами"],
  coreEyebrow: "Платформа",
  coreTitle: "Одна система для журнала, скринера, AI-коучинга и развития трейдера.",
  coreText: "TraderMind AI создан для активных трейдеров, проп-команд и менторов, которым нужен не просто красивый журнал.",
  features: [["AI Pattern Engine", "Находит повторяемые преимущества по сетапу, времени, тикеру, гепу, объёму и поведению трейдера.", "brain"], ["Журнал сделок", "Фиксируй сделки с тегами, скриншотами, заметками, эмоциями, риском и результатом.", "chart"], ["Поиск ошибок", "Находит поздние входы, revenge trading, нарушение стопа, оверсайз и слабые выходы.", "risk"], ["AI-коуч", "Дает проверки до входа, разбор после сделки, недельные отчёты и советы.", "bot"], ["Разбор скриншотов", "Загружай графики и сравнивай структуру с лучшими и худшими примерами.", "camera"], ["Оценка дисциплины", "Отделяй торговый навык от поведения через измеримый discipline score.", "target"]],
  liveEyebrow: "Рынок в реальном времени",
  liveTitle: "Скринер геперов и холтов с AI-поиском похожих ситуаций за день.",
  liveText: "Система следит за геперами, холтами, возобновлениями, float, relative volume и momentum. Когда пользователь загружает скрин, AI ищет похожие ситуации этой же сессии.",
  liveCards: [["Поиск геперов", "Сканируй премаркет и интрадей по gap %, relative volume, float, catalyst и continuation context.", "radar"], ["Монитор холтов", "Отслеживай volatility halts, resumptions и поведение после холта.", "risk"], ["Визуальное сопоставление", "AI сравнивает загруженные скрины с live-примерами рынка этого же дня.", "camera"], ["Похожие примеры", "Смотри, как похожие сетапы отработали на других тикерах, прежде чем делать выводы.", "chart"]],
  agentsEyebrow: "AI-агенты",
  agentsTitle: "Команда AI-агентов за спиной каждого трейдера.",
  agentsText: "Вместо одного обычного чат-бота TraderMind AI использует специализированных агентов для разбора, риска, рыночного контекста и поведенческого коучинга.",
  agents: [["Review Agent", "Разбирает каждую сделку: тезис, качество входа, выхода, риск и соблюдение правил.", "bot"], ["Pattern Agent", "Строит личную библиотеку паттернов и ранжирует сетапы по expectancy.", "brain"], ["Risk Agent", "Предупреждает об оверсайзе, плохом R:R, revenge trading и выходе за правила.", "shield"], ["Market Context Agent", "Связывает сделки с геперами, холтами, новостями и похожими примерами дня.", "radar"], ["Coach Agent", "Создает дневные, недельные и месячные планы улучшения на основе реальных данных.", "target"], ["Team Agent", "Помогает менторам и проп-командам сравнивать трейдеров и экспортировать отчёты.", "user"]],
  useCasesEyebrow: "Для кого",
  useCasesTitle: "Для трейдеров, которым нужна система, а не мотивация.",
  useCases: [["Дейтрейдеры", "Отслеживай интрадей-сетапы, тайминг, скриншоты и качество исполнения."], ["Small-cap трейдеры", "Разбирай геперы, холты, low-float акции и momentum traps."], ["Проп-команды", "Стандартизируй разборы, сравнивай трейдеров и обучай команду."], ["Менторы", "Превращай сделки учеников в структурированные отчёты и планы роста."]],
  ctaTitle: "Получить ранний доступ к TraderMind AI",
  ctaText: "Оставь email, и мы пригласим тебя в первую закрытую beta.",
  emailPlaceholder: "your@email.com",
  ctaButton: "Встать в waitlist",
  ctaSuccess: "Заявка сохранена. Следующим шагом подключим backend формы.",
  product: {
    eyebrow: "Продукт",
    title: "Полная структура продукта: от первого входа до продвинутой аналитики.",
    text: "Платформа задумана как серьёзная AI-native операционная система для эффективности трейдера, а не лёгкий журнал сделок.",
    screens: [["Live Screener", "Скринер геперов, холтов, возобновлений, объёма, float и momentum-контекста в реальном времени.", "radar"], ["Dashboard", "PnL, win rate, discipline score, лучшие сетапы, худшие ошибки и динамика результата.", "chart"], ["Add Trade", "Быстрая форма сделки со скриншотами, заметками, тегами, контекстом рынка и эмоциями.", "target"], ["Pattern Lab", "Лучшие паттерны, слабые места, expectancy-кластеры и разбор поведения.", "brain"], ["AI Coach", "Проверки до входа, разбор после сделки и недельные coaching summaries.", "bot"], ["Reports", "Дневные, недельные и месячные отчёты с экспортируемой аналитикой.", "money"]],
    flowTitle: "Как это работает",
    flow: [["01", "Записываешь сделку", "Фиксируешь сетап, тезис, риск, график, эмоции и соблюдение плана."], ["02", "AI читает поведение", "Система группирует сделки и отделяет повторяемое преимущество от случайных побед."], ["03", "Находишь свой edge", "Видишь лучшие сетапы, худшие привычки, сильные рыночные условия и discipline score."], ["04", "Улучшаешься каждую неделю", "Используешь отчёты, pre-trade checks и AI-коучинг, чтобы улучшать исполнение."]],
    aiDemoTitle: "OpenAI-коуч внутри продукта",
    aiDemoText: "Живое приложение будет обращаться к защищённому серверному endpoint. Демо уже пробует /api/ai-coach и безопасно включает preview-режим.",
    aiPlaceholder: "Спроси про сетап, ошибку или риск-план...",
    aiButton: "Спросить AI-коуча",
    aiReady: "Готово к подключению к /api/ai-coach",
    aiLive: "Получен живой ответ от API.",
    aiFallback: "Preview mode: backend endpoint пока не подключён, показан симулированный AI-ответ.",
  },
  pricing: {
    eyebrow: "Тарифы",
    title: "Выбери план под свой уровень амбиций в трейдинге.",
    text: "Начни просто, а затем открой глубокую AI-аналитику, разбор скриншотов, live matching и командные сценарии.",
    most: "Самый популярный",
    month: "/ месяц",
    buy: "Купить план",
    checkoutTitle: "Stripe-подписка уже подготовлена",
    checkoutText: "Кнопки обращаются к /api/create-checkout-session. Подключим backend route — и включим живую оплату Stripe.",
    checkoutFallback: "Preview mode: подключи backend route /api/create-checkout-session, чтобы включить живую оплату.",
    plans: [["starter", "Starter", "$19", "Для трейдера, который строит стабильность", ["Безлимитный журнал сделок", "Базовый dashboard", "Базовые AI-разборы", "Теги паттернов", "Недельный отчёт"]], ["pro", "Pro", "$49", "Для активного трейдера, которому нужен измеримый edge", ["Всё из Starter", "Продвинутый AI Pattern Engine", "Discipline score", "Разбор скриншотов", "Pre-trade AI Coach", "Live screener matching"]], ["elite", "Elite", "$129", "Для менторов, проп-команд и серьёзных операторов", ["Всё из Pro", "Team dashboard", "Сравнение трейдеров", "Coach workspace", "White-label reports", "API-доступ"]]],
    compareTitle: "Чем отличаются планы",
    compareText: "Starter — чистая точка входа. Pro открывает настоящее AI-преимущество. Elite создан для команд и менторов.",
  },
  team: {
    eyebrow: "Команда",
    title: "Создано трейдерами, инженерами и архитекторами эффективности.",
    text: "Правдоподобная launch-история для премиального AI trading-продукта. Перед публичным запуском можно заменить имена на реальные.",
    people: [["Max Volkov", "Founder & Product Lead", "Бывший оператор трейдинг-деска и product strategist. Создал TraderMind AI вокруг главной проблемы трейдеров: они неверно читают собственные привычки."], ["Elena Markina", "Head of AI Systems", "ML-инженер, специализируется на decision systems, behavioral analytics и human-in-the-loop review flows."], ["Andrii Kovalenko", "Quant Research Director", "Специализируется на сегментации сделок, expectancy models и превращении шумных данных исполнения в стабильные сигналы."], ["Nika Sokol", "Behavior & Experience Design", "Проектирует coaching layer: reflection prompts, discipline scoring и workflows для реального улучшения."]],
    storyTitle: "Почему эта история команды работает",
    story: ["Трейдинговый контекст делает продукт правдоподобным.", "AI-экспертиза объясняет, почему это больше чем маркетинг.", "Quant research добавляет аналитическую глубину.", "Behavior design объясняет, почему трейдер реально улучшается."],
    originTitle: "История появления",
    origin: "TraderMind AI родился из простой проблемы: трейдеры собирают бесконечные скриншоты и заметки, но всё равно не видят закономерности своей реальной эффективности.",
  },
  faqTitle: "FAQ",
  faq: [["Это финансовая рекомендация?", "Нет. TraderMind AI — это платформа аналитики и журналирования, а не инвестиционный советник."], ["Подойдёт ли новичкам?", "Да, но максимальная ценность появляется, когда трейдер накопит достаточно сделок для анализа паттернов."], ["Это заменяет ментора?", "Нет. Это делает менторство и самостоятельный разбор быстрее, яснее и более основанным на данных."], ["Когда запускается приложение?", "Лендинг уже запущен. Следующие этапы — private beta, аккаунты пользователей и полноценное приложение."]],
  footer: { pages: "Страницы", modules: "Ключевые модули", contact: "Контакты", demo: "Демо продукта по запросу", text: "Создано, чтобы превращать данные о сделках в повторяемое преимущество." },
  builtForOperators: "Создано для серьёзных операторов",
};

base.uk = {
  ...base.ru,
  lang: "UA",
  switchLanguage: "Мова",
  brandTag: "Аналітика ефективності",
  requestDemo: "Запросити демо",
  nav: { home: "Головна", product: "Функції", pricing: "Тарифи", team: "Команда" },
  heroBadge: "AI-платформа для трейдингу",
  heroTitle: "Знайди свою перевагу до того, як ринок знову покарає тебе.",
  heroText: "TraderMind AI показує, чому ти заробляєш, чому втрачаєш, які патерни варто торгувати і коли твоя поведінка непомітно вбиває PnL.",
  start: "Отримати ранній доступ",
  tour: "Дивитися продукт",
  stats: [["50k+", "угод проаналізовано"], ["82%", "користувачів знаходять помилки"], ["6x", "швидший розбір угод"]],
  problemEyebrow: "Проблема",
  problemTitle: "Більшості трейдерів бракує не інформації, а розуміння себе.",
  problemText: "Скріншоти, нотатки, watchlist-и та емоції розкидані по різних місцях. TraderMind AI збирає все в одну систему для виконання, аналізу та пошуку закономірностей.",
  problems: [["Випадкові перемоги здаються навичкою", "Ти пам’ятаєш великі плюси, але не бачиш точні умови, через які вони спрацювали."], ["Помилки повторюються тихо", "Пізні входи, revenge trades і слабкі виходи повертаються, бо їх ніхто не вимірює."], ["Немає live-контексту ринку", "Журнал знає угоду, але не знає, що робили схожі гепери й холти цього ж дня."]],
  beforeAfterTitle: "До / Після",
  before: ["Ручні скріншоти", "Емоційні розбори", "Немає рейтингу патернів", "Немає контексту геперів і холтів"],
  after: ["AI-аналіз угод", "Особиста бібліотека патернів", "Оцінка дисципліни", "Live-скрінер зі схожими прикладами"],
  coreEyebrow: "Платформа",
  coreTitle: "Одна система для журналу, скрінера, AI-коучингу та розвитку трейдера.",
  coreText: "TraderMind AI створений для активних трейдерів, проп-команд і менторів, яким потрібен не просто красивий журнал.",
  liveEyebrow: "Ринок у реальному часі",
  liveTitle: "Скрінер геперів і холтів з AI-пошуком схожих ситуацій за день.",
  liveText: "Система стежить за геперами, холтами, відновленнями, float, relative volume і momentum. Коли користувач завантажує скрін, AI шукає схожі ситуації цієї ж сесії.",
  agentsEyebrow: "AI-агенти",
  agentsTitle: "Команда AI-агентів за спиною кожного трейдера.",
  agentsText: "Замість одного звичайного чат-бота TraderMind AI використовує спеціалізованих агентів для аналізу, ризику, ринкового контексту та поведінкового коучингу.",
  useCasesEyebrow: "Для кого",
  useCasesTitle: "Для трейдерів, яким потрібна система, а не мотивація.",
  ctaTitle: "Отримати ранній доступ до TraderMind AI",
  ctaText: "Залиш email, і ми запросимо тебе в першу закриту beta.",
  ctaButton: "Стати в waitlist",
  product: { ...base.ru.product, eyebrow: "Продукт", title: "Повна структура продукту: від першого входу до просунутої аналітики.", text: "Платформа задумана як серйозна AI-native операційна система для ефективності трейдера, а не легкий журнал угод.", flowTitle: "Як це працює", aiDemoTitle: "OpenAI-коуч усередині продукту", aiPlaceholder: "Запитай про сетап, помилку або risk-plan...", aiButton: "Запитати AI-коуча" },
  pricing: { ...base.ru.pricing, eyebrow: "Тарифи", title: "Обери план під свій рівень амбіцій у трейдингу.", most: "Найпопулярніший", month: "/ місяць", buy: "Купити план", checkoutTitle: "Stripe-підписка вже підготовлена", compareTitle: "Чим відрізняються плани" },
  team: { ...base.ru.team, eyebrow: "Команда", title: "Створено трейдерами, інженерами та архітекторами ефективності.", storyTitle: "Чому ця історія команди працює", originTitle: "Історія появи" },
  footer: { pages: "Сторінки", modules: "Ключові модулі", contact: "Контакти", demo: "Демо продукту за запитом", text: "Створено, щоб перетворювати дані про угоди на повторювану перевагу." },
  builtForOperators: "Створено для серйозних операторів",
};

function CardBox({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      whileHover={{ y: -6, scale: 1.01 }}
      className={`rounded-[28px] border border-white/10 bg-white/[0.045] p-6 backdrop-blur-xl transition duration-300 hover:bg-white/[0.065] hover:shadow-[0_24px_80px_rgba(99,102,241,.18)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function ButtonX({ children, onClick, variant = "primary", disabled = false, className = "" }) {
  const cls = variant === "primary" ? "bg-white text-black hover:bg-white/90" : "border border-white/15 bg-white/5 text-white hover:bg-white/10";
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition disabled:opacity-50 ${cls} ${className}`}>
      {children}
    </button>
  );
}

function SectionTitle({ eyebrow, title, text }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-90px" }}
      transition={{ duration: 0.65, ease: "easeOut" }}
      className="max-w-3xl"
    >
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
        <Icon name="spark" className="h-4 w-4" /> {eyebrow}
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">{title}</h2>
      {text && <p className="mt-4 max-w-2xl text-base leading-7 text-white/65 md:text-lg">{text}</p>}
    </motion.div>
  );
}

function MockPhone() {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative mx-auto w-full max-w-[350px]">
      <div className="rounded-[2.5rem] border border-white/15 bg-[#0d1020] p-3 shadow-[0_40px_130px_rgba(99,102,241,.25)]">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#141a33] to-[#080b18] p-4">
          <div className="mb-4 flex items-center justify-between text-xs text-white/50"><span>TraderMind AI</span><span>Live</span></div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between"><div><div className="text-xs text-white/45">This week</div><div className="mt-1 text-2xl font-semibold text-white">+$4,280</div></div><div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">Discipline 82</div></div>
            <div className="mt-4 h-28 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-transparent to-pink-500/10 p-3"><svg viewBox="0 0 240 80" className="h-full w-full"><path d="M5 60 C30 55, 45 20, 70 28 S120 70, 150 40 S200 10, 235 18" fill="none" stroke="rgba(99,102,241,1)" strokeWidth="3" strokeLinecap="round" /><path d="M5 68 C30 63, 45 48, 70 50 S120 58, 150 55 S200 44, 235 38" fill="none" stroke="rgba(244,114,182,0.85)" strokeWidth="2.5" strokeLinecap="round" /></svg></div>
            <div className="mt-4 grid grid-cols-2 gap-3">{[["Best setup", "VWAP pullback"], ["Weakness", "Late exits"], ["Best hour", "10:12–10:48"], ["AI note", "Avoid 3rd trade"]].map(([k, v]) => <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-[11px] text-white/45">{k}</div><div className="mt-1 text-sm font-medium text-white">{v}</div></div>)}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LeadForm({ t }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="relative mt-8 flex max-w-xl flex-col gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-3 sm:flex-row">
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-[#0d1020] px-4 text-sm text-white outline-none placeholder:text-white/35" />
      <ButtonX onClick={() => setSent(true)}><Icon name="mail" className="mr-2 h-4 w-4" />{t.ctaButton}</ButtonX>
      {sent && <div className="absolute -bottom-7 left-3 text-sm text-emerald-300">{t.ctaSuccess}</div>}
    </div>
  );
}

function HomePage({ t }) {
  return (
    <div className="space-y-28">
      <section className="relative overflow-hidden pt-12 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-indigo-200"><Icon name="spark" className="h-4 w-4" />{t.heroBadge}</div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight text-white md:text-7xl">{t.heroTitle}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">{t.heroText}</p>
              <div className="mt-8 flex flex-wrap gap-3"><ButtonX>{t.start}<Icon name="arrow" className="ml-2 h-4 w-4" /></ButtonX><ButtonX variant="secondary">{t.tour}</ButtonX></div>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">{t.stats.map(([a, b]) => <CardBox key={b} className="rounded-3xl"><div className="text-2xl font-semibold text-white">{a}</div><div className="mt-1 text-sm text-white/50">{b}</div></CardBox>)}</div>
            </motion.div>
          </div>
          <MockPhone />
        </div>
      </section>

      <section><SectionTitle eyebrow={t.problemEyebrow} title={t.problemTitle} text={t.problemText} /><div className="mt-10 grid gap-5 lg:grid-cols-3">{t.problems.map(([a, b], i) => <CardBox key={a}><Icon name={["brain", "risk", "radar"][i]} className="h-8 w-8 text-indigo-200" /><h3 className="mt-5 text-xl font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>

      <section className="grid gap-6 lg:grid-cols-2"><CardBox className="rounded-[32px]"><h3 className="text-2xl font-semibold text-white">{t.beforeAfterTitle}</h3><div className="mt-6 grid gap-3">{t.before.map((x) => <div key={x} className="flex gap-3 rounded-2xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-white/65"><Icon name="x" className="text-red-300" />{x}</div>)}</div></CardBox><CardBox className="rounded-[32px]"><h3 className="text-2xl font-semibold text-white">TraderMind AI</h3><div className="mt-6 grid gap-3">{t.after.map((x) => <div key={x} className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-white/70"><Icon name="check" className="text-emerald-300" />{x}</div>)}</div></CardBox></section>

      <section><SectionTitle eyebrow={t.coreEyebrow} title={t.coreTitle} text={t.coreText} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{t.features.map(([a, b, icon]) => <CardBox key={a}><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-indigo-200"><Icon name={icon} className="h-7 w-7" /></div><h3 className="mt-5 text-xl font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>

      <section><SectionTitle eyebrow={t.liveEyebrow} title={t.liveTitle} text={t.liveText} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{t.liveCards.map(([a, b, icon]) => <CardBox key={a}><Icon name={icon} className="h-8 w-8 text-pink-200" /><h3 className="mt-5 text-lg font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>

      <section><SectionTitle eyebrow={t.agentsEyebrow} title={t.agentsTitle} text={t.agentsText} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{t.agents.map(([a, b, icon]) => <CardBox key={a}><Icon name={icon} className="h-8 w-8 text-emerald-200" /><h3 className="mt-5 text-xl font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>

      <section><SectionTitle eyebrow={t.useCasesEyebrow} title={t.useCasesTitle} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{t.useCases.map(([a, b]) => <CardBox key={a}><Icon name="target" className="h-8 w-8 text-indigo-200" /><h3 className="mt-5 text-lg font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>

      <section className="rounded-[40px] border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.04] to-pink-500/10 p-8 md:p-12"><h2 className="max-w-3xl text-3xl font-semibold text-white md:text-5xl">{t.ctaTitle}</h2><p className="mt-4 max-w-2xl text-white/65">{t.ctaText}</p><LeadForm t={t} /></section>
    </div>
  );
}

function ProductPage({ t, aiInput, setAiInput, aiMessages, aiStatus, handleAiSubmit, aiLoading }) {
  return (
    <div className="space-y-24 pt-8">
      <section><SectionTitle eyebrow={t.product.eyebrow} title={t.product.title} text={t.product.text} /><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{t.product.screens.map(([a, b, icon]) => <CardBox key={a}><Icon name={icon} className="h-8 w-8 text-indigo-200" /><h3 className="mt-5 text-xl font-medium text-white">{a}</h3><p className="mt-3 text-sm leading-7 text-white/60">{b}</p></CardBox>)}</div></section>
      <section className="grid gap-6 lg:grid-cols-2"><CardBox className="rounded-[32px]"><h3 className="text-2xl font-semibold text-white">{t.product.flowTitle}</h3><div className="mt-6 space-y-4">{t.product.flow.map(([n, a, b]) => <div key={n} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><div className="flex gap-4"><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 px-3 py-2 text-xs text-indigo-200">{n}</div><div><div className="text-lg font-medium text-white">{a}</div><p className="mt-2 text-sm leading-7 text-white/60">{b}</p></div></div></div>)}</div></CardBox><CardBox className="rounded-[32px]"><h3 className="text-2xl font-semibold text-white">{t.product.aiDemoTitle}</h3><p className="mt-3 text-sm leading-7 text-white/60">{t.product.aiDemoText}</p><div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-3 text-xs text-white/45">{aiStatus || t.product.aiReady}</div><div className="max-h-64 space-y-3 overflow-auto pr-1">{aiMessages.map((m, i) => <div key={i} className={`rounded-2xl px-4 py-3 text-sm leading-7 ${m.role === "user" ? "ml-8 border border-indigo-400/20 bg-indigo-400/10 text-indigo-100" : "mr-8 border border-white/10 bg-white/[0.04] text-white/75"}`}>{m.content}</div>)}</div><textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder={t.product.aiPlaceholder} className="mt-4 min-h-[110px] w-full rounded-2xl border border-white/10 bg-[#0d1020] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" /><ButtonX onClick={handleAiSubmit} disabled={aiLoading || !aiInput.trim()} className="mt-3">{aiLoading ? "..." : t.product.aiButton}</ButtonX></div></CardBox></section>
      <section><SectionTitle eyebrow={t.faqTitle} title={t.faqTitle} /><div className="mt-10 grid gap-5 md:grid-cols-2">{t.faq.map(([q, a]) => <CardBox key={q}><h3 className="text-lg font-medium text-white">{q}</h3><p className="mt-3 text-sm leading-7 text-white/60">{a}</p></CardBox>)}</div></section>
    </div>
  );
}

function PricingPage({ t, handleCheckout, checkoutStatus }) {
  return (
    <div className="space-y-20 pt-8">
      <section><SectionTitle eyebrow={t.pricing.eyebrow} title={t.pricing.title} text={t.pricing.text} /><div className="mt-10 grid gap-6 xl:grid-cols-3">{t.pricing.plans.map(([id, name, price, subtitle, features], idx) => <CardBox key={id} className={`h-full rounded-[32px] ${idx === 1 ? "border-indigo-300/35 bg-gradient-to-b from-indigo-500/15 to-white/[0.04]" : ""}`}>{idx === 1 && <div className="mb-5 inline-flex rounded-full border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-indigo-100">{t.pricing.most}</div>}<div className="text-2xl font-semibold text-white">{name}</div><div className="mt-2 text-sm leading-7 text-white/55">{subtitle}</div><div className="mt-7 flex items-end gap-2"><div className="text-5xl font-semibold text-white">{price}</div><div className="pb-2 text-sm text-white/45">{t.pricing.month}</div></div><div className="mt-7 space-y-3">{features.map((f) => <div key={f} className="flex gap-3 text-sm text-white/70"><Icon name="check" className="text-emerald-300" />{f}</div>)}</div><ButtonX onClick={() => handleCheckout(id)} className="mt-8 w-full"><Icon name="money" className="mr-2 h-4 w-4" />{t.pricing.buy}</ButtonX></CardBox>)}</div></section>
      <section className="grid gap-6 lg:grid-cols-2"><CardBox><h3 className="text-2xl font-semibold text-white">{t.pricing.checkoutTitle}</h3><p className="mt-3 text-sm leading-7 text-white/60">{t.pricing.checkoutText}</p><div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">{checkoutStatus || t.pricing.checkoutFallback}</div></CardBox><CardBox><h3 className="text-2xl font-semibold text-white">{t.pricing.compareTitle}</h3><p className="mt-3 text-sm leading-7 text-white/60">{t.pricing.compareText}</p></CardBox></section>
    </div>
  );
}

function TeamPage({ t }) {
  return (
    <div className="space-y-20 pt-8">
      <section><SectionTitle eyebrow={t.team.eyebrow} title={t.team.title} text={t.team.text} /><div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">{t.team.people.map(([name, role, bio]) => <CardBox key={name} className="h-full"><div className="relative h-44 rounded-[22px] border border-white/10 bg-gradient-to-br from-indigo-500/30 via-fuchsia-500/10 to-emerald-400/20"><div className="absolute bottom-4 left-4 right-4"><div className="text-xl font-semibold text-white">{name}</div><div className="mt-1 text-sm text-white/65">{role}</div></div></div><p className="mt-5 text-sm leading-7 text-white/60">{bio}</p></CardBox>)}</div></section>
      <section className="grid gap-6 lg:grid-cols-2"><CardBox><h3 className="text-2xl font-semibold text-white">{t.team.storyTitle}</h3><div className="mt-5 grid gap-4">{t.team.story.map((x) => <div key={x} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65"><Icon name="check" className="text-emerald-300" />{x}</div>)}</div></CardBox><CardBox><h3 className="text-2xl font-semibold text-white">{t.team.originTitle}</h3><p className="mt-5 text-sm leading-8 text-white/60">{t.team.origin}</p><div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><Icon name="lock" className="h-6 w-6 text-indigo-200" /><div className="mt-3 font-medium text-white">{t.builtForOperators}</div></div></CardBox></section>
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
  const [aiMessages, setAiMessages] = useState([{ role: "assistant", content: "AI Coach ready. Ask about a setup, risk plan, mistake pattern, or screenshot review workflow." }]);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const { scrollYProgress } = useScroll();
  const bg1 = useTransform(scrollYProgress, [0, 0.35, 0.7, 1], ["rgba(99,102,241,.20)", "rgba(236,72,153,.18)", "rgba(16,185,129,.14)", "rgba(59,130,246,.18)"]);
  const bg2 = useTransform(scrollYProgress, [0, 0.5, 1], ["rgba(236,72,153,.13)", "rgba(99,102,241,.16)", "rgba(245,158,11,.12)"]);
  const t = base[language] || base.en;
  const cycle = () => setLanguage((p) => (p === "en" ? "ru" : p === "ru" ? "uk" : "en"));

  const handleCheckout = async (id) => {
    try {
      const r = await fetch("/api/create-checkout-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: id }) });
      if (!r.ok) throw new Error("no api");
      const d = await r.json();
      setCheckoutStatus(d?.url || "Checkout session created");
    } catch (e) {
      setCheckoutStatus(t.pricing.checkoutFallback);
    }
  };

  const handleAiSubmit = async () => {
    const prompt = aiInput.trim();
    if (!prompt) return;
    setAiMessages((p) => [...p, { role: "user", content: prompt }]);
    setAiInput("");
    setAiLoading(true);
    setAiStatus(t.product.aiReady);
    try {
      const r = await fetch("/api/ai-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: prompt }) });
      if (!r.ok) throw new Error("no api");
      const d = await r.json();
      setAiMessages((p) => [...p, { role: "assistant", content: d?.reply || "AI response received." }]);
      setAiStatus(t.product.aiLive);
    } catch (e) {
      setAiMessages((p) => [...p, { role: "assistant", content: "Simulated coach reply: check if this setup matches your strongest historical patterns, confirm fixed risk before entry, avoid revenge trades, and compare it with same-day gappers/halts before increasing size." }]);
      setAiStatus(t.product.aiFallback);
    } finally {
      setAiLoading(false);
    }
  };

  const page = useMemo(() => {
    if (active === "product") return <ProductPage t={t} aiInput={aiInput} setAiInput={setAiInput} aiMessages={aiMessages} aiStatus={aiStatus} handleAiSubmit={handleAiSubmit} aiLoading={aiLoading} />;
    if (active === "pricing") return <PricingPage t={t} handleCheckout={handleCheckout} checkoutStatus={checkoutStatus} />;
    if (active === "team") return <TeamPage t={t} />;
    return <HomePage t={t} />;
  }, [active, t, aiInput, aiMessages, aiStatus, aiLoading, checkoutStatus]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#070b16] text-white">
      <motion.div className="fixed inset-0 -z-10" style={{ background: `radial-gradient(circle at 15% 15%, ${bg1}, transparent 32%), radial-gradient(circle at 85% 20%, ${bg2}, transparent 30%), linear-gradient(180deg,#070b16 0%,#090e1d 100%)` }} />
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b16]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <button onClick={() => setActive("home")} className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Icon name="brain" className="h-6 w-6" /></div><div><div className="text-lg font-semibold">TraderMind AI</div><div className="text-xs uppercase tracking-[0.2em] text-white/45">{t.brandTag}</div></div></button>
          <nav className="hidden items-center gap-2 md:flex">{navKeys.map((k) => <button key={k} onClick={() => setActive(k)} className={`rounded-full px-4 py-2 text-sm transition ${active === k ? "bg-white text-black" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>{t.nav[k]}</button>)}</nav>
          <div className="hidden items-center gap-3 md:flex"><button onClick={cycle} className="flex h-11 min-w-[58px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"><Icon name="globe" className="mr-2 h-4 w-4" />{t.lang}</button><ButtonX>{t.requestDemo}</ButtonX></div>
          <button onClick={() => setMenuOpen((v) => !v)} className="md:hidden"><Icon name={menuOpen ? "close" : "menu"} className="h-6 w-6" /></button>
        </div>
        <AnimatePresence>{menuOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="border-t border-white/10 bg-[#070b16]/95 px-4 pb-4 md:hidden"><div className="flex flex-col gap-2 pt-4"><button onClick={cycle} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75">{t.switchLanguage}: {t.lang}</button>{navKeys.map((k) => <button key={k} onClick={() => { setActive(k); setMenuOpen(false); }} className={`rounded-2xl px-4 py-3 text-left text-sm ${active === k ? "bg-white text-black" : "bg-white/[0.04] text-white/75"}`}>{t.nav[k]}</button>)}</div></motion.div>}</AnimatePresence>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-24 md:px-8">{page}</main>
      <footer className="border-t border-white/10 bg-white/[0.02]"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[1.1fr_.9fr] md:px-8"><div><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><Icon name="brain" className="h-6 w-6" /></div><div><div className="font-semibold">TraderMind AI</div><div className="text-sm text-white/45">{t.footer.text}</div></div></div></div><div className="grid gap-6 sm:grid-cols-3"><div><div className="text-sm font-medium">{t.footer.pages}</div><div className="mt-3 space-y-2 text-sm text-white/55">{navKeys.map((k) => <button key={k} onClick={() => setActive(k)} className="block hover:text-white">{t.nav[k]}</button>)}</div></div><div><div className="text-sm font-medium">{t.footer.modules}</div><div className="mt-3 space-y-2 text-sm text-white/55"><div>AI Coach</div><div>Pattern Engine</div><div>Gapper Screener</div><div>AI Agents</div></div></div><div><div className="text-sm font-medium">{t.footer.contact}</div><div className="mt-3 space-y-2 text-sm text-white/55"><div>hello@tradermind.ai</div><div>Dubai / Warsaw / Kyiv</div><div>{t.footer.demo}</div></div></div></div></div></footer>
    </div>
  );
}
