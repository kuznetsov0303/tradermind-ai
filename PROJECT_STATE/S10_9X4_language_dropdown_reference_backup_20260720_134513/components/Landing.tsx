"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import CookieConsent from "@/components/marketing/CookieConsent";
import BrandMark from "@/components/marketing/BrandMark";
import TradingBackground from "@/components/marketing/TradingBackground";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { applyDocumentLocale, getSavedLocale, saveLocale } from "@/lib/i18n/runtime";
import { getStructuredLandingDictionary } from "@/lib/i18n/landing-structured-locales";

type Language = Locale;
type PageKey = "home" | "desk" | "product" | "pricing" | "team";
type BillingPeriod = "monthly" | "halfyear" | "yearly";
type AuthMode = "login" | "register" | null;

const navKeys: PageKey[] = ["home", "desk", "product", "pricing", "team"];

const LANDING_LANGUAGE_OPTIONS: ReadonlyArray<{
  locale: Locale;
  shortLabel: string;
  nativeLabel: string;
}> = [
  { locale: "en", shortLabel: "EN", nativeLabel: "English" },
  { locale: "ru", shortLabel: "RU", nativeLabel: "Русский" },
  { locale: "uk", shortLabel: "UA", nativeLabel: "Українська" },
  { locale: "zh", shortLabel: "ZH", nativeLabel: "中文" },
  { locale: "de", shortLabel: "DE", nativeLabel: "Deutsch" },
  { locale: "fr", shortLabel: "FR", nativeLabel: "Français" },
  { locale: "es", shortLabel: "ES", nativeLabel: "Español" },
  { locale: "ar", shortLabel: "AR", nativeLabel: "العربية" },
  { locale: "it", shortLabel: "IT", nativeLabel: "Italiano" },
  { locale: "nb", shortLabel: "NO", nativeLabel: "Norsk" },
  { locale: "ka", shortLabel: "KA", nativeLabel: "ქართული" },
  { locale: "pl", shortLabel: "PL", nativeLabel: "Polski" },
  { locale: "tr", shortLabel: "TR", nativeLabel: "Türkçe" },
  { locale: "el", shortLabel: "EL", nativeLabel: "Ελληνικά" },
  { locale: "hi", shortLabel: "HI", nativeLabel: "हिन्दी" },
];

const LANDING_LANGUAGE_SHORT_LABEL: Record<Locale, string> =
  Object.fromEntries(
    LANDING_LANGUAGE_OPTIONS.map(({ locale, shortLabel }) => [
      locale,
      shortLabel,
    ]),
  ) as Record<Locale, string>;

const pageHref: Record<PageKey, string> = {
  home: "/",
  desk: "/desk",
  product: "/product",
  pricing: "/pricing",
  team: "/about",
};

const dict = {
  en: {
    lang: "EN",
    switchLanguage: "Language",
    brandTag: "Performance intelligence",
    requestDemo: "Request demo",
    choosePlan: "Choose plan",
    viewProduct: "View product",
    viewPricing: "View pricing",
    viewAbout: "About us",
    nav: {
      home: "Home",
      desk: "Desk",
      product: "Product",
      pricing: "Pricing",
      team: "About us",
    },
    heroBadge: "Premium AI trading workspace",
    heroTitle: "Turn market noise, trade history and execution mistakes into a clearer trading process.",
    heroText:
      "SkillEdge AI connects your journal, screenshots, chart review, market intelligence, AI scanner, alerts, reports and learning workflow into one premium trading workspace — without promising profits or replacing your own judgment.",
    start: "Start with a plan",
    tour: "View product flow",
    stats: [
      ["Private beta", "built for serious active traders"],
      ["Journal-first", "your trades become the data source"],
      ["Edge+", "scanner and market brief access"],
    ],
    problemEyebrow: "The problem",
    problemTitle: "Most traders do not need more noise. They need a cleaner process.",
    problemText:
      "Charts, screenshots, emotions, watchlists, notes and mistakes often live in different places. SkillEdge AI brings them into one workflow so the trader can review decisions, understand patterns and build a repeatable process.",
    homeSections: {
      whyTitle: "What SkillEdge AI helps you organize",
      whyText:
        "The platform is designed around the real trading loop: find what matters, plan the trade, execute with discipline, record the result and learn from the outcome.",
      cards: [
        ["Journal & screenshots", "Track trades, screenshots, emotions, mistakes, risk and lessons in one place."],
        ["AI Coach", "Get structured feedback on trade logic, risk, discipline and decision quality."],
        ["Market Intelligence", "Edge and Elite unlock the scanner layer for stocks, crypto and in-play market context."],
        ["AI Alerts", "Elite unlocks the premium alert workflow with setup, trigger, entry, stop, targets and outcome review."],
      ],
    },
    productPage: {
      heroBadge: "Product",
      heroTitle: "One connected workspace for trading performance.",
      heroText:
        "SkillEdge AI is built as a premium trading operating system: journal, screenshots, AI Coach, reports, charts, scanner, alerts, playbook and support in one clean workflow.",
      ctaPrimary: "Choose your plan",
      ctaSecondary: "Why SkillEdge exists",
      heroCards: [
        ["AI Trading Desk", "Market intelligence, alerts, journal and coaching in one system."],
        ["Signal-to-Journal", "Create a trade draft from an alert and compare the plan with your execution."],
        ["Personal Edge", "The long-term architecture is built around the trader’s own best and worst patterns."],
      ],
      deskTitle: "A trading desk should give context, not blind calls.",
      deskText:
        "SkillEdge AI is designed to explain why an opportunity matters, what confirms it, what invalidates it and where the risk sits. The goal is better decision-making, not blind dependency.",
      deskCards: [
        ["Market Intelligence", "Find stocks and crypto that deserve attention before wasting time on dead charts."],
        ["AI Scanner", "Edge and Elite receive AI Market Brief logic around the best in-play candidates."],
        ["AI Alerts", "Elite receives structured signals with setup, direction, trigger, entry zone, stop and targets."],
        ["Outcome Learning", "Track taken, skipped and missed alerts so every outcome becomes a learning point."],
      ],
      flowEyebrow: "Workflow",
      flowTitle: "From market scan to personal improvement — one connected loop.",
      flowText:
        "Every serious trading idea should become data: what the market showed, what the trader planned, what was executed and what the outcome taught.",
      flow: [
        ["01", "Market moves", "SkillEdge watches active stocks, crypto, unusual movement, catalysts and market context."],
        ["02", "AI filters noise", "The system ranks opportunities by quality, freshness, risk and setup clarity."],
        ["03", "Plan appears", "The trader sees direction, trigger, entry zone, stop, targets, management and invalidation."],
        ["04", "Journal connects", "A taken alert can become a journal trade with screenshots, notes and execution review."],
        ["05", "Learning compounds", "Reports, outcome review and coaching turn repetition into a stronger process."],
      ],
      modulesEyebrow: "Modules",
      modulesTitle: "Everything is designed to work together.",
      modulesText:
        "Each module can be useful alone. Together they create a premium workspace where the trader can discover opportunities, execute with structure and review performance.",
      modules: [
        ["Journal & Screenshots", "A serious journal that becomes the data source for analysis, reports and future personalization.", ["Trades and screenshots", "PnL and win rate", "CSV/XLSX export", "AI journal review"]],
        ["Charts & Watchlists", "A chart workspace connected to tickers, watchlists, screenshots and future premium chart analysis.", ["TradingView workspace", "Ticker input", "Watchlist", "AI chart analysis foundation"]],
        ["Market Intelligence", "A scanner layer for finding active stocks and crypto with clear source transparency.", ["Stocks and crypto candidates", "Market context", "Source labels", "AI Market Brief"]],
        ["AI Alerts", "Elite-level actionable signals with structure, education and outcome review.", ["Floating alert widget", "Full Alerts Center", "Breakdown modal", "Signal-to-Journal"]],
        ["Reports & Learning", "A review layer that turns trades into performance feedback and repeatable lessons.", ["AI reports", "Learning blocks", "Playbook foundation", "Execution focus"]],
        ["Support", "A site-wide support assistant and operator flow for product, payment and access questions.", ["Support assistant", "Operator request", "Email support", "Admin reply flow"]],
      ],
      differentEyebrow: "Difference",
      differentTitle: "This is not another signal service. It is a performance system.",
      differentText:
        "The best traders do not only search for entries. They build process, risk control, review, discipline and repeatable patterns. SkillEdge AI is being built around that reality.",
      comparisons: [
        ["Instead of a normal scanner", "You only see tickers and still have to guess what matters.", "SkillEdge explains why the ticker matters, what the setup is, what can go wrong and what confirms the idea."],
        ["Instead of a simple journal", "You store trades but do not transform them into an edge.", "SkillEdge connects trades, screenshots, alerts, outcomes and mistakes into a personal improvement system."],
        ["Instead of a generic chatbot", "You ask random questions and receive disconnected answers.", "SkillEdge works inside the workflow: alerts, journal, reports, execution, learning and playbook."],
      ],
      finalTitle: "Build a trading system around your real behavior.",
      finalText:
        "SkillEdge AI is for traders who are tired of scattered tools, emotional decisions and unclear reviews. The product helps the client see the market cleaner, execute with more structure and understand what to improve next.",
      finalChecklist: [
        "Journal, screenshots and analytics",
        "AI Coach and chart review",
        "Market Intelligence and AI Scanner for Edge+",
        "AI Alerts and Signal-to-Journal for Elite",
        "Reports, learning blocks and playbook foundation",
        "Support assistant and operator request flow",
      ],
    },
    pricingPage: {
      heroBadge: "Pricing",
      heroTitle: "Choose the level of intelligence around your trading process.",
      heroText:
        "Core builds structure. Edge adds market intelligence and AI Scanner. Elite unlocks the full AI Trading Desk with alerts, signal workflow and outcome learning.",
      billingToggle: {
        monthly: "1 month",
        halfyear: "6 months",
        yearly: "1 year",
      },
      period: {
        monthly: "/ month",
        halfyear: "/ 6 months",
        yearly: "/ year",
      },
      cardPayment: "Card payment is being prepared",
      cryptoNote: "* crypto payment through the available launch flow",
      checkoutStatus: {
        checking: "Checking your account...",
        invoice: "Creating crypto invoice...",
        noUrl: "Crypto invoice was created, but payment URL was not returned.",
        unavailable: "Crypto payment is not available right now.",
      },
      planBadge: {
        core: "Start with discipline",
        edge: "Best active-trader value",
        elite: "Full AI Trading Desk",
      },
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          headline: "For traders who need structure first.",
          text:
            "Build the foundation: journal, screenshots, AI Coach, chart analysis foundation, exports and a cleaner review process.",
          bestFor: "Best for building discipline, tracking trades and stopping reliance on memory.",
          cta: "Start with Core",
          features: ["Up to 300 trades", "3 screenshots per trade", "50 AI Coach requests / month", "10 journal AI analyses / month", "20 chart AI analyses / month", "CSV/XLSX export"],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          headline: "For active traders who need deeper review and market context.",
          text:
            "Unlock higher limits, AI reports, premium chart analysis, social/market context and the AI Scanner / AI Market Brief layer.",
          bestFor: "Best for active traders who review seriously and want better setup and mistake discovery.",
          cta: "Upgrade to Edge",
          features: ["Everything in Core",
            "Strategy OS: build your own trading strategy", "Up to 2,000 trades", "5 screenshots per trade", "200 AI Coach requests / month", "30 AI reports / month", "AI Scanner / Market Intelligence"],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          headline: "For serious traders who want the full AI Trading Desk.",
          text:
            "Unlock AI Alerts, floating alert widget, Signal-to-Journal workflow, decision tracking, outcome learning and maximum AI limits.",
          bestFor: "Best for advanced traders who want structured signals and a complete feedback loop.",
          cta: "Unlock Elite",
          features: ["Everything in Edge", "Up to 10,000 trades", "10 screenshots per trade", "1,000 AI Coach requests / month", "150 AI reports / month", "AI Alerts + Signal-to-Journal"],
        },
      ],
      signalEyebrow: "Why the signal layer matters",
      signalTitle: "SkillEdge signals are built to educate, not to make the trader blindly click.",
      signalText:
        "A weak signal service creates dependency. A strong trading system creates clarity: setup, risk, confirmation, invalidation and the lesson after the outcome.",
      signalCards: [
        ["Structured signals", "Signals are structured setups with direction, trigger, entry zone, stop, targets and risk."],
        ["Breakdown before action", "Every serious alert explains why it appeared, what confirms it and what makes it dangerous."],
        ["Signal-to-Journal", "A taken alert can become a journal trade so the plan and execution can be compared."],
        ["Outcome coaching", "Taken, skipped and missed decisions show missed opportunities, good skips and weak execution."],
      ],
      comparisonTitle: "Plan comparison",
      comparisonText: "Choose the plan that matches your current trading process.",
      comparison: [
        ["Feature", "Core", "Edge", "Elite"],
        ["Journal + screenshots", "Yes", "Yes", "Yes"],
        ["AI Coach", "50 / month", "200 / month", "1,000 / month"],
        ["Journal AI analysis", "10 / month", "50 / month", "300 / month"],
        ["Chart AI analysis", "20 / month", "100 / month", "500 / month"],
        ["AI Reports", "—", "30 / month", "150 / month"],
        ["AI Scanner", "—", "Yes", "Yes"],
        ["AI Alerts", "—", "—", "Yes"],
        ["Best for", "Discipline", "Active review", "AI Trading Desk"],
      ],
      finalTitle: "The clean recommendation",
      finalText:
        "Choose Core for structure, Edge for scanner intelligence and active review, Elite for real-time AI Alerts and the full signal-to-journal workflow.",
      disclaimer:
        "SkillEdge AI is not financial advice and does not guarantee profits. The platform is built to improve structure, review, decision quality and trading process.",
    },
    teamPage: {
      heroBadge: "About SkillEdge AI",
      heroTitle: "We are building the AI trading system serious traders wish already existed.",
      heroText:
        "SkillEdge AI is built around one clear idea: traders do not need more noise. They need a system that connects market opportunities, journal review, execution discipline, learning and personal improvement.",
      ctaProduct: "Explore product",
      ctaPricing: "View plans",
      philosophyBadge: "Product philosophy",
      philosophyTitle: "Process over prediction",
      beliefs: [
        "Signals without education create dependency.",
        "A trade without a plan cannot be reviewed properly.",
        "A journal without feedback becomes a graveyard of old trades.",
        "The best product should make the trader calmer, sharper and more disciplined.",
        "Personal AI alerts become powerful only when the trader builds clean historical data.",
      ],
      storyEyebrow: "Our story",
      storyTitle: "SkillEdge AI is built for traders who want discipline, structure and measurable improvement.",
      storyText:
        "The product was born from the same problem many active traders face: the market gives too much information, but almost no honest feedback about execution. SkillEdge AI is designed to connect the trader’s decisions, screenshots, journal, alerts and outcomes into one serious review system.",
      teamEyebrow: "Team structure",
      teamTitle: "Built like a focused product team — trading, product, data and support.",
      teamText:
        "Use these cards as the About Us layout. Later you can insert real team photos, names and roles without changing the page structure.",
      teamCards: [
        ["Founder / Product Vision", "Owns the product direction, trader workflow, pricing logic and premium positioning."],
        ["Trading Research", "Defines setups, alert logic, journal review criteria and educational playbooks."],
        ["AI & Data Layer", "Builds scanner logic, AI prompts, data enrichment, usage limits and backend gates."],
        ["Design & Experience", "Shapes the dashboard, public pages, locked states, loading states and premium interface."],
        ["Support Operations", "Handles customer questions, operator flow, payments, access and product guidance."],
        ["Security & Infrastructure", "Protects private access, platform data, rate limits and client workflows."],
      ],
      principlesEyebrow: "Principles",
      principlesTitle: "A serious trading product must be honest about risk and serious about process.",
      principles: [
        ["No fake certainty", "Trading contains risk. SkillEdge AI must never pretend that any model or alert can guarantee profit."],
        ["Transparent logic", "The client should understand why an alert appears, which sources are tracked and what part of the idea is strong or weak."],
        ["Premium product mindset", "Every feature should feel useful, serious and connected to the trader’s real workflow."],
      ],
      roadmapEyebrow: "Roadmap",
      roadmapTitle: "We are building toward a premium AI Trading Desk.",
      roadmapText:
        "The launch foundation is product-focused: journal, alerts, learning, reports, support, billing and market intelligence. The next layer is premium data, full market scanning and personal alerts based on the client’s own history.",
      roadmap: [
        ["01", "Launch foundation", "Journal, dashboard, screenshots, learning, reports, crypto access and support foundation."],
        ["02", "Signals and behavior", "AI alerts, decision tracking, trade drafts, outcome learning and missed opportunity coaching."],
        ["03", "Premium data", "Full ticker coverage, Binance universe, catalysts, heatmaps, halt screener and stronger scanner logic."],
        ["04", "Personal edge", "AI learns from the client’s best setups, weak patterns, execution mistakes and journal history."],
      ],
      finalTitle: "Help traders stop operating from chaos and start operating from a system.",
      finalText:
        "SkillEdge AI is for traders who want to review harder, think cleaner, execute with more discipline and build a repeatable edge from real data instead of emotion and memory.",
    },
    footer: {
      description:
        "Premium AI trading workspace for serious traders: market intelligence, AI alerts, journal, execution review, playbook, reports and coaching in one connected system.",
      product: "Product",
      features: "Features",
      resources: "Resources",
      legal: "Legal",
      productLinks: ["Home", "Product", "Pricing", "About us"],
      featureLinks: ["AI Trading Desk", "AI Alerts", "Market Intelligence", "Journal & Screenshots", "Execution Coach", "Outcome Learning", "Playbook", "Reports", "Learning Center", "Support Assistant"],
      resourceLinks: ["Getting Started", "How SkillEdge Works", "Trading Journal Guide", "AI Alerts Guide", "Referral program"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "Cookie settings",
      choosePlan: "Choose plan",
      requestDemo: "Request demo",
      risk:
        "SkillEdge AI is not financial advice and does not guarantee profits. The platform is built to improve structure, review, decision quality and trading process.",
      contact: "Contacts",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Product demo by request",
      rights: "© 2026 SkillEdge AI. All rights reserved.",
      bottom: "Built for traders who want structure, discipline and measurable improvement.",
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
      creatingAccount: "Creating account...",
      creatingInvoice: "Creating crypto invoice...",
      loginRequired: "Login or sign up to pay for a plan.",
      afterRegister: "Account created. Confirm your email if required.",
      authError: "Authorization error.",
    },
  },
  ru: {
    lang: "RU",
    switchLanguage: "Язык",
    brandTag: "Интеллект эффективности",
    requestDemo: "Запросить демо",
    choosePlan: "Выбрать тариф",
    viewProduct: "Посмотреть продукт",
    viewPricing: "Посмотреть тарифы",
    viewAbout: "О нас",
    nav: {
      home: "Главная",
      desk: "AI-деск",
      product: "Продукт",
      pricing: "Тарифы",
      team: "О нас",
    },
    heroBadge: "Premium AI-платформа для трейдера",
    heroTitle: "Преврати рыночный шум, историю сделок и ошибки исполнения в более понятный торговый процесс.",
    heroText:
      "SkillEdge AI соединяет журнал, скриншоты, анализ графиков, рыночную разведку, AI-сканер, сигналы, отчёты и обучение в одно premium-пространство — без обещаний прибыли и без замены твоего собственного решения.",
    start: "Выбрать тариф",
    tour: "Посмотреть продукт",
    stats: [
      ["Private beta", "создаётся для серьёзных активных трейдеров"],
      ["Журнал в основе", "твои сделки становятся источником данных"],
      ["Edge+", "доступ к сканеру и рыночной сводке"],
    ],
    problemEyebrow: "Проблема",
    problemTitle: "Большинству трейдеров не нужен ещё больший шум. Им нужен более чистый процесс.",
    problemText:
      "Графики, скриншоты, эмоции, списки наблюдения, заметки и ошибки часто живут в разных местах. SkillEdge AI собирает их в один рабочий процесс, чтобы трейдер мог разбирать решения, понимать паттерны и строить повторяемую систему.",
    homeSections: {
      whyTitle: "Что помогает организовать SkillEdge AI",
      whyText:
        "Платформа построена вокруг реального торгового цикла: найти важное, спланировать сделку, исполнить дисциплинированно, записать результат и извлечь урок из исхода.",
      cards: [
        ["Журнал и скриншоты", "Фиксируй сделки, скриншоты, эмоции, ошибки, риск и уроки в одном месте."],
        ["AI-коуч", "Получай структурный разбор логики сделки, риска, дисциплины и качества решения."],
        ["Рыночная разведка", "Edge и Elite открывают слой сканера для акций, крипты и актуального рыночного контекста."],
        ["AI-сигналы", "Elite открывает premium-сигналы с сетапом, триггером, зоной входа, стопом, целями и разбором исхода."],
      ],
    },
    productPage: {
      heroBadge: "Продукт",
      heroTitle: "Единое рабочее пространство для торговой эффективности.",
      heroText:
        "SkillEdge AI создаётся как premium trading operating system: журнал, скриншоты, AI-коуч, отчёты, графики, сканер, сигналы, плейбук и поддержка в одном чистом процессе.",
      ctaPrimary: "Выбрать тариф",
      ctaSecondary: "Зачем мы это строим",
      heroCards: [
        ["AI Trading Desk", "Рыночная разведка, сигналы, журнал и коучинг в одной системе."],
        ["Сигнал → журнал", "Создавай сделку из сигнала и сравнивай план с реальным исполнением."],
        ["Личное преимущество", "Долгосрочная архитектура строится вокруг лучших и худших паттернов самого трейдера."],
      ],
      deskTitle: "Торговый desk должен давать контекст, а не слепые команды.",
      deskText:
        "SkillEdge AI должен объяснять, почему ситуация важна, что её подтверждает, что отменяет и где находится риск. Цель — лучшее качество решений, а не слепая зависимость от сигналов.",
      deskCards: [
        ["Рыночная разведка", "Находи акции и крипту, которые заслуживают внимания, не тратя время на мёртвые графики."],
        ["AI-сканер", "Edge и Elite получают AI Market Brief по лучшим активным кандидатам рынка."],
        ["AI-сигналы", "Elite получает структурированные сигналы: сетап, направление, триггер, зона входа, стоп и цели."],
        ["Обучение на исходах", "Отмечай взятые, пропущенные и проигнорированные сигналы, чтобы каждый исход становился уроком."],
      ],
      flowEyebrow: "Процесс",
      flowTitle: "От сканирования рынка до личного прогресса — один связанный цикл.",
      flowText:
        "Каждая серьёзная торговая идея должна становиться данными: что показал рынок, что планировал трейдер, что было исполнено и чему научил исход.",
      flow: [
        ["01", "Рынок начинает двигаться", "SkillEdge отслеживает активные акции, крипту, необычное движение, катализаторы и рыночный контекст."],
        ["02", "AI фильтрует шум", "Система ранжирует ситуации по качеству, свежести, риску и ясности сетапа."],
        ["03", "Появляется план", "Трейдер видит направление, триггер, зону входа, стоп, цели, сопровождение и отмену идеи."],
        ["04", "Журнал подключается", "Взятый сигнал может стать сделкой в журнале со скриншотами, заметками и разбором исполнения."],
        ["05", "Обучение накапливается", "Отчёты, разбор исходов и коучинг превращают повторение в более сильный процесс."],
      ],
      modulesEyebrow: "Модули",
      modulesTitle: "Все части продукта должны работать вместе.",
      modulesText:
        "Каждый модуль полезен сам по себе. Вместе они создают premium-пространство, где трейдер находит ситуации, действует структурно и разбирает результат.",
      modules: [
        ["Журнал и скриншоты", "Серьёзный журнал, который становится источником данных для анализа, отчётов и будущей персонализации.", ["Сделки и скриншоты", "PnL и процент прибыльных сделок", "CSV/XLSX экспорт", "AI-анализ журнала"]],
        ["Графики и списки наблюдения", "Рабочее пространство графиков, связанное с тикерами, списками, скриншотами и будущим premium-анализом.", ["TradingView workspace", "Ввод тикера", "Список наблюдения", "Основа AI-анализа графика"]],
        ["Рыночная разведка", "Слой сканера для поиска активных акций и крипты с честным отображением источников.", ["Кандидаты по акциям и крипте", "Рыночный контекст", "Метки источников", "AI Market Brief"]],
        ["AI-сигналы", "Elite-сигналы с планом, обучением и разбором исхода.", ["Плавающий виджет", "Центр сигналов", "Подробный разбор", "Связка сигнала с журналом"]],
        ["Отчёты и обучение", "Слой разбора, который превращает сделки в обратную связь и повторяемые уроки.", ["AI-отчёты", "Учебные блоки", "Основа плейбука", "Фокус исполнения"]],
        ["Поддержка", "Site-wide помощник и операторский поток для вопросов по продукту, оплате и доступу.", ["Помощник поддержки", "Запрос оператора", "Email-поддержка", "Ответы из админки"]],
      ],
      differentEyebrow: "Отличие",
      differentTitle: "Это не очередной сервис сигналов. Это система эффективности.",
      differentText:
        "Сильные трейдеры не просто ищут входы. Они строят процесс, контроль риска, разбор, дисциплину и повторяемые паттерны. SkillEdge AI строится вокруг этой реальности.",
      comparisons: [
        ["Вместо обычного сканера", "Ты видишь только тикеры и всё равно должен угадывать, что важно.", "SkillEdge объясняет, почему тикер важен, какой сетап, где риск и что подтверждает идею."],
        ["Вместо простого журнала", "Ты хранишь сделки, но не превращаешь их в преимущество.", "SkillEdge связывает сделки, скриншоты, сигналы, исходы и ошибки в систему улучшения."],
        ["Вместо обычного чат-бота", "Ты задаёшь случайные вопросы и получаешь разрозненные ответы.", "SkillEdge работает внутри процесса: сигналы, журнал, отчёты, исполнение, обучение и плейбук."],
      ],
      finalTitle: "Построй торговую систему вокруг своего реального поведения.",
      finalText:
        "SkillEdge AI создан для трейдеров, которым надоели разрозненные инструменты, эмоциональные решения и непонятные разборы. Продукт помогает чище видеть рынок, действовать структурнее и понимать, что улучшать дальше.",
      finalChecklist: [
        "Журнал, скриншоты и аналитика",
        "AI-коуч и разбор графиков",
        "Рыночная разведка и AI-сканер для Edge+",
        "AI-сигналы и Signal-to-Journal для Elite",
        "Отчёты, обучение и основа плейбука",
        "Помощник поддержки и запрос оператора",
      ],
    },
    pricingPage: {
      heroBadge: "Тарифы",
      heroTitle: "Выбери уровень интеллекта вокруг своего торгового процесса.",
      heroText:
        "Core строит структуру. Edge добавляет рыночную разведку и AI-сканер. Elite открывает полный AI Trading Desk с сигналами, связкой с журналом и обучением на исходах.",
      billingToggle: {
        monthly: "1 месяц",
        halfyear: "6 месяцев",
        yearly: "1 год",
      },
      period: {
        monthly: "/ месяц",
        halfyear: "/ 6 месяцев",
        yearly: "/ год",
      },
      cardPayment: "Оплата картой готовится",
      cryptoNote: "* крипто-оплата через доступный launch-flow",
      checkoutStatus: {
        checking: "Проверяем аккаунт...",
        invoice: "Создаём крипто-счёт...",
        noUrl: "Крипто-счёт создан, но ссылка на оплату не вернулась.",
        unavailable: "Крипто-оплата сейчас недоступна.",
      },
      planBadge: {
        core: "Начни с дисциплины",
        edge: "Лучший вариант для активного трейдера",
        elite: "Полный AI Trading Desk",
      },
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          headline: "Для трейдера, которому сначала нужна структура.",
          text:
            "Построй основу: журнал, скриншоты, AI-коуч, базовый анализ графиков, экспорт и более чистый процесс разбора.",
          bestFor: "Лучше всего для дисциплины, фиксации сделок и отказа от торговли по памяти.",
          cta: "Начать с Core",
          features: ["До 300 сделок", "3 скриншота на сделку", "50 запросов к AI-коучу / месяц", "10 AI-анализов журнала / месяц", "20 AI-анализов графика / месяц", "CSV/XLSX экспорт"],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          headline: "Для активного трейдера, которому нужен глубокий разбор и рыночный контекст.",
          text:
            "Открой повышенные лимиты, AI-отчёты, premium-анализ графиков, рыночный контекст и слой AI-сканера / AI Market Brief.",
          bestFor: "Лучше всего для активных трейдеров, которые серьёзно разбирают сделки и ищут повторяющиеся ошибки и сетапы.",
          cta: "Перейти на Edge",
          features: ["Всё из Core",
          "Strategy OS: создание собственной стратегии", "До 2 000 сделок", "5 скриншотов на сделку", "200 запросов к AI-коучу / месяц", "30 AI-отчётов / месяц", "AI-сканер / рыночная разведка"],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          headline: "Для серьёзного трейдера, которому нужен полный AI Trading Desk.",
          text:
            "Открой AI-сигналы, плавающий виджет, Signal-to-Journal, отслеживание решений, обучение на исходах и максимальные AI-лимиты.",
          bestFor: "Лучше всего для продвинутых трейдеров, которым нужны структурные сигналы и полный цикл обратной связи.",
          cta: "Открыть Elite",
          features: ["Всё из Edge", "До 10 000 сделок", "10 скриншотов на сделку", "1 000 запросов к AI-коучу / месяц", "150 AI-отчётов / месяц", "AI-сигналы + Signal-to-Journal"],
        },
      ],
      signalEyebrow: "Зачем нужен слой сигналов",
      signalTitle: "Сигналы SkillEdge должны обучать, а не заставлять трейдера слепо нажимать.",
      signalText:
        "Слабый сервис сигналов создаёт зависимость. Сильная торговая система создаёт ясность: сетап, риск, подтверждение, отмена идеи и урок после исхода.",
      signalCards: [
        ["Не слепые команды", "Сигналы — это структурные торговые идеи: сетап, направление, триггер, зона входа, стоп, цели и риск."],
        ["Разбор до действия", "Каждый серьёзный сигнал объясняет, почему он появился, что его подтверждает и что делает его опасным."],
        ["Сигнал → журнал", "Взятый сигнал может стать сделкой в журнале, чтобы сравнить план и реальное исполнение."],
        ["Коучинг по исходу", "Взятые, пропущенные и проигнорированные решения показывают упущенные возможности, хорошие пропуски и слабое исполнение."],
      ],
      comparisonTitle: "Сравнение тарифов",
      comparisonText: "Выбери тариф под текущий торговый процесс.",
      comparison: [
        ["Функция", "Core", "Edge", "Elite"],
        ["Журнал + скриншоты", "Да", "Да", "Да"],
        ["AI-коуч", "50 / месяц", "200 / месяц", "1 000 / месяц"],
        ["AI-анализ журнала", "10 / месяц", "50 / месяц", "300 / месяц"],
        ["AI-анализ графика", "20 / месяц", "100 / месяц", "500 / месяц"],
        ["AI-отчёты", "—", "30 / месяц", "150 / месяц"],
        ["AI-сканер", "—", "Да", "Да"],
        ["AI-сигналы", "—", "—", "Да"],
        ["Лучше всего для", "Дисциплины", "Активного разбора", "AI Trading Desk"],
      ],
      finalTitle: "Честная рекомендация",
      finalText:
        "Выбирай Core для структуры, Edge для рыночного интеллекта и активного разбора, Elite для AI-сигналов и полного workflow сигнал → журнал.",
      disclaimer:
        "SkillEdge AI не является финансовой рекомендацией и не гарантирует прибыль. Платформа создана для улучшения структуры, разбора, качества решений и торгового процесса.",
    },
    teamPage: {
      heroBadge: "О SkillEdge AI",
      heroTitle: "Мы строим AI-систему для трейдинга, которую серьёзные трейдеры хотели бы иметь уже сейчас.",
      heroText:
        "SkillEdge AI создаётся вокруг одной идеи: трейдерам не нужен ещё больший шум. Им нужна система, которая соединяет рыночные возможности, журнал, дисциплину исполнения, обучение и личный прогресс.",
      ctaProduct: "Посмотреть продукт",
      ctaPricing: "Посмотреть тарифы",
      philosophyBadge: "Философия продукта",
      philosophyTitle: "Процесс важнее предсказаний",
      beliefs: [
        "Сигналы без обучения создают зависимость.",
        "Сделку без плана невозможно нормально разобрать.",
        "Журнал без обратной связи превращается в кладбище старых сделок.",
        "Лучший продукт делает трейдера спокойнее, острее и дисциплинированнее.",
        "Персональные AI-сигналы становятся сильными только тогда, когда трейдер собирает чистую историю сделок.",
      ],
      storyEyebrow: "Наша история",
      storyTitle: "SkillEdge AI создаётся для трейдеров, которым нужны дисциплина, структура и измеримый прогресс.",
      storyText:
        "Продукт вырос из проблемы, с которой сталкиваются многие активные трейдеры: рынок даёт слишком много информации, но почти не даёт честной обратной связи по исполнению. SkillEdge AI должен связать решения трейдера, скриншоты, журнал, сигналы и исходы в одну серьёзную систему разбора.",
      teamEyebrow: "Структура команды",
      teamTitle: "Страница построена как команда продукта: трейдинг, продукт, данные и поддержка.",
      teamText:
        "Эти карточки — готовый макет About Us. Позже ты сможешь вставить реальные фото, имена и роли без изменения структуры страницы.",
      teamCards: [
        ["Основатель / видение продукта", "Отвечает за направление продукта, workflow трейдера, тарифную логику и premium-позиционирование."],
        ["Trading Research", "Определяет сетапы, логику сигналов, критерии разбора журнала и образовательные плейбуки."],
        ["AI и данные", "Строит логику сканера, AI-промпты, обогащение данных, лимиты и backend-gates."],
        ["Дизайн и опыт", "Формирует dashboard, публичные страницы, locked states, loading states и premium-интерфейс."],
        ["Support Operations", "Закрывает вопросы клиентов по продукту, оплате, доступу и операторскому потоку."],
        ["Безопасность и инфраструктура", "Защищает routes, API-ключи, Supabase-доступ, rate limits и production-деплой."],
      ],
      principlesEyebrow: "Принципы",
      principlesTitle: "Серьёзный trading-продукт должен честно говорить о риске и строиться вокруг процесса.",
      principles: [
        ["Никакой фальшивой уверенности", "В трейдинге есть риск. SkillEdge AI не должен делать вид, что модель или сигнал могут гарантировать прибыль."],
        ["Прозрачная логика", "Клиент должен понимать, почему появился сигнал, какие источники отслеживаются и что в идее сильное или слабое."],
        ["Premium-мышление", "Каждая функция должна быть полезной, серьёзной и связанной с реальным процессом трейдера."],
      ],
      roadmapEyebrow: "План развития",
      roadmapTitle: "Мы строим продукт в сторону premium AI Trading Desk.",
      roadmapText:
        "Launch-основа уже продуктовая: журнал, сигналы, обучение, отчёты, поддержка, оплата и рыночная разведка. Следующий слой — premium data, полный market scan и персональные сигналы на базе истории клиента.",
      roadmap: [
        ["01", "Launch foundation", "Журнал, dashboard, скриншоты, обучение, отчёты, crypto-доступ и фундамент поддержки."],
        ["02", "Сигналы и поведение", "AI-сигналы, отслеживание решений, подготовка сделок, обучение на исходах и коучинг упущенных возможностей."],
        ["03", "Premium data", "Полное покрытие тикеров, Binance universe, катализаторы, heatmaps, halt screener и более сильная логика сканера."],
        ["04", "Личное преимущество", "AI учится на лучших сетапах клиента, слабых паттернах, ошибках исполнения и истории журнала."],
      ],
      finalTitle: "Помочь трейдерам выйти из хаоса и начать работать через систему.",
      finalText:
        "SkillEdge AI создан для трейдеров, которые хотят глубже разбирать, чище думать, дисциплинированнее исполнять и строить повторяемое преимущество на реальных данных, а не на эмоциях и памяти.",
    },
    footer: {
      description:
        "Premium AI-пространство для серьёзных трейдеров: рыночная разведка, AI-сигналы, журнал, разбор исполнения, плейбук, отчёты и коучинг в одной системе.",
      product: "Продукт",
      features: "Функции",
      resources: "Ресурсы",
      legal: "Документы",
      productLinks: ["Главная", "Продукт", "Тарифы", "О нас"],
      featureLinks: ["AI Trading Desk", "AI-сигналы", "Рыночная разведка", "Журнал и скриншоты", "Коуч исполнения", "Обучение на исходах", "Плейбук", "Отчёты", "Центр обучения", "Помощник поддержки"],
      resourceLinks: ["Начало работы", "Как работает SkillEdge", "Гайд по журналу сделок", "Гайд по AI-сигналам", "Реферальная программа"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "Настройки cookie",
      choosePlan: "Выбрать тариф",
      requestDemo: "Запросить демо",
      risk:
        "SkillEdge AI не является финансовой рекомендацией и не гарантирует прибыль. Платформа создана для улучшения структуры, разбора, качества решений и торгового процесса.",
      contact: "Контакты",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукта по запросу",
      rights: "© 2026 SkillEdge AI. Все права защищены.",
      bottom: "Создано для трейдеров, которым нужны структура, дисциплина и измеримый прогресс.",
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
      creatingAccount: "Создаём аккаунт...",
      creatingInvoice: "Создаём крипто-счёт...",
      loginRequired: "Войдите или зарегистрируйтесь, чтобы оплатить тариф.",
      afterRegister: "Аккаунт создан. Если нужно, подтвердите email.",
      authError: "Ошибка авторизации.",
    },
  },
  ua: {
    lang: "UA",
    switchLanguage: "Мова",
    brandTag: "Інтелект ефективності",
    requestDemo: "Запросити демо",
    choosePlan: "Обрати тариф",
    viewProduct: "Переглянути продукт",
    viewPricing: "Переглянути тарифи",
    viewAbout: "Про нас",
    nav: {
      home: "Головна",
      desk: "AI-деск",
      product: "Продукт",
      pricing: "Тарифи",
      team: "Про нас",
    },
    heroBadge: "Premium AI-платформа для трейдера",
    heroTitle: "Перетвори ринковий шум, історію угод і помилки виконання на зрозуміліший торговий процес.",
    heroText:
      "SkillEdge AI поєднує журнал, скріншоти, аналіз графіків, ринкову розвідку, AI-сканер, сигнали, звіти та навчання в одному premium-просторі — без обіцянок прибутку і без заміни твого власного рішення.",
    start: "Обрати тариф",
    tour: "Переглянути продукт",
    stats: [
      ["Private beta", "створюється для серйозних активних трейдерів"],
      ["Журнал в основі", "твої угоди стають джерелом даних"],
      ["Edge+", "доступ до сканера та ринкового брифу"],
    ],
    problemEyebrow: "Проблема",
    problemTitle: "Більшості трейдерів не потрібен ще більший шум. Їм потрібен чистіший процес.",
    problemText:
      "Графіки, скріншоти, емоції, списки спостереження, нотатки й помилки часто живуть у різних місцях. SkillEdge AI збирає їх в один робочий процес, щоб трейдер міг розбирати рішення, розуміти патерни та будувати повторювану систему.",
    homeSections: {
      whyTitle: "Що допомагає організувати SkillEdge AI",
      whyText:
        "Платформа побудована навколо реального торгового циклу: знайти важливе, спланувати угоду, виконати дисципліновано, записати результат і зробити висновок із результату.",
      cards: [
        ["Журнал і скріншоти", "Фіксуй угоди, скріншоти, емоції, помилки, ризик і уроки в одному місці."],
        ["AI-коуч", "Отримуй структурний розбір логіки угоди, ризику, дисципліни та якості рішення."],
        ["Ринкова розвідка", "Edge та Elite відкривають шар сканера для акцій, крипти й актуального ринкового контексту."],
        ["AI-сигнали", "Elite відкриває premium-сигнали із сетапом, тригером, зоною входу, стопом, цілями та розбором результату."],
      ],
    },
    productPage: {
      heroBadge: "Продукт",
      heroTitle: "Єдиний робочий простір для торгової ефективності.",
      heroText:
        "SkillEdge AI створюється як premium trading operating system: журнал, скріншоти, AI-коуч, звіти, графіки, сканер, сигнали, плейбук і підтримка в одному чистому процесі.",
      ctaPrimary: "Обрати тариф",
      ctaSecondary: "Навіщо ми це будуємо",
      heroCards: [
        ["AI Trading Desk", "Ринкова розвідка, сигнали, журнал і коучинг в одній системі."],
        ["Сигнал → журнал", "Створюй угоди із сигналів та порівнюй план із реальним виконанням."],
        ["Особиста перевага", "Довгострокова архітектура будується навколо найкращих і найгірших патернів самого трейдера."],
      ],
      deskTitle: "Trading desk має давати контекст, а не сліпі команди.",
      deskText:
        "SkillEdge AI має пояснювати, чому ситуація важлива, що її підтверджує, що скасовує і де ризик. Мета — краща якість рішень, а не сліпа залежність від сигналів.",
      deskCards: [
        ["Ринкова розвідка", "Знаходь акції та крипту, які заслуговують уваги, не витрачаючи час на мертві графіки."],
        ["AI-сканер", "Edge та Elite отримують AI Market Brief по найкращих активних кандидатах ринку."],
        ["AI-сигнали", "Elite отримує структуровані сигнали: сетап, напрямок, тригер, зона входу, стоп і цілі."],
        ["Навчання на результатах", "Позначай взяті, пропущені та проігноровані сигнали, щоб кожен результат ставав уроком."],
      ],
      flowEyebrow: "Процес",
      flowTitle: "Від сканування ринку до особистого прогресу — один пов’язаний цикл.",
      flowText:
        "Кожна серйозна торгова ідея має ставати даними: що показав ринок, що планував трейдер, що було виконано і чому навчив результат.",
      flow: [
        ["01", "Ринок починає рухатися", "SkillEdge відстежує активні акції, крипту, незвичний рух, каталізатори та ринковий контекст."],
        ["02", "AI фільтрує шум", "Система ранжує ситуації за якістю, свіжістю, ризиком і ясністю сетапу."],
        ["03", "З’являється план", "Трейдер бачить напрямок, тригер, зону входу, стоп, цілі, супровід і скасування ідеї."],
        ["04", "Журнал підключається", "Взятий сигнал може стати угодою в журналі зі скріншотами, нотатками та розбором виконання."],
        ["05", "Навчання накопичується", "Звіти, розбір результатів і коучинг перетворюють повторення на сильніший процес."],
      ],
      modulesEyebrow: "Модулі",
      modulesTitle: "Усі частини продукту мають працювати разом.",
      modulesText:
        "Кожен модуль корисний окремо. Разом вони створюють premium-простір, де трейдер знаходить ситуації, діє структурно і розбирає результат.",
      modules: [
        ["Журнал і скріншоти", "Серйозний журнал, який стає джерелом даних для аналізу, звітів і майбутньої персоналізації.", ["Угоди та скріншоти", "PnL і відсоток прибуткових угод", "CSV/XLSX експорт", "AI-аналіз журналу"]],
        ["Графіки та списки спостереження", "Робочий простір графіків, пов’язаний із тикерами, списками, скріншотами та майбутнім premium-аналізом.", ["TradingView workspace", "Введення тикера", "Список спостереження", "Основа AI-аналізу графіка"]],
        ["Ринкова розвідка", "Шар сканера для пошуку активних акцій і крипти з чесним відображенням джерел.", ["Кандидати по акціях і крипті", "Ринковий контекст", "Мітки джерел", "AI Market Brief"]],
        ["AI-сигнали", "Elite-сигнали з планом, навчанням і розбором результату.", ["Плаваючий віджет", "Центр сигналів", "Детальний розбір", "Зв’язка сигналу з журналом"]],
        ["Звіти та навчання", "Шар розбору, який перетворює угоди на зворотний зв’язок і повторювані уроки.", ["AI-звіти", "Навчальні блоки", "Основа плейбука", "Фокус виконання"]],
        ["Підтримка", "Site-wide помічник і операторський потік для питань щодо продукту, оплати та доступу.", ["Помічник підтримки", "Запит оператора", "Email-підтримка", "Відповіді з адмінки"]],
      ],
      differentEyebrow: "Відмінність",
      differentTitle: "Це не черговий сервіс сигналів. Це система ефективності.",
      differentText:
        "Сильні трейдери не просто шукають входи. Вони будують процес, контроль ризику, розбір, дисципліну та повторювані патерни. SkillEdge AI будується навколо цієї реальності.",
      comparisons: [
        ["Замість звичайного сканера", "Ти бачиш тільки тикери й усе одно маєш здогадуватися, що важливо.", "SkillEdge пояснює, чому тикер важливий, який сетап, де ризик і що підтверджує ідею."],
        ["Замість простого журналу", "Ти зберігаєш угоди, але не перетворюєш їх на перевагу.", "SkillEdge пов’язує угоди, скріншоти, сигнали, результати й помилки в систему покращення."],
        ["Замість звичайного чат-бота", "Ти ставиш випадкові питання й отримуєш розрізнені відповіді.", "SkillEdge працює всередині процесу: сигнали, журнал, звіти, виконання, навчання і плейбук."],
      ],
      finalTitle: "Побудуй торгову систему навколо своєї реальної поведінки.",
      finalText:
        "SkillEdge AI створений для трейдерів, яким набридли розрізнені інструменти, емоційні рішення та незрозумілі розбори. Продукт допомагає чистіше бачити ринок, діяти структурніше і розуміти, що покращувати далі.",
      finalChecklist: [
        "Журнал, скріншоти та аналітика",
        "AI-коуч і розбір графіків",
        "Ринкова розвідка та AI-сканер для Edge+",
        "AI-сигнали та Signal-to-Journal для Elite",
        "Звіти, навчання й основа плейбука",
        "Помічник підтримки та запит оператора",
      ],
    },
    pricingPage: {
      heroBadge: "Тарифи",
      heroTitle: "Обери рівень інтелекту навколо свого торгового процесу.",
      heroText:
        "Core будує структуру. Edge додає ринкову розвідку та AI-сканер. Elite відкриває повний AI Trading Desk із сигналами, зв’язкою з журналом і навчанням на результатах.",
      billingToggle: {
        monthly: "1 місяць",
        halfyear: "6 місяців",
        yearly: "1 рік",
      },
      period: {
        monthly: "/ місяць",
        halfyear: "/ 6 місяців",
        yearly: "/ рік",
      },
      cardPayment: "Оплата карткою готується",
      cryptoNote: "* крипто-оплата через доступний launch-flow",
      checkoutStatus: {
        checking: "Перевіряємо акаунт...",
        invoice: "Створюємо крипто-рахунок...",
        noUrl: "Крипто-рахунок створено, але посилання на оплату не повернулося.",
        unavailable: "Крипто-оплата зараз недоступна.",
      },
      planBadge: {
        core: "Почни з дисципліни",
        edge: "Найкращий варіант для активного трейдера",
        elite: "Повний AI Trading Desk",
      },
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          headline: "Для трейдера, якому спочатку потрібна структура.",
          text:
            "Побудуй основу: журнал, скріншоти, AI-коуч, базовий аналіз графіків, експорт і чистіший процес розбору.",
          bestFor: "Найкраще для дисципліни, фіксації угод і відмови від торгівлі по пам’яті.",
          cta: "Почати з Core",
          features: ["До 300 угод", "3 скріншоти на угоду", "50 запитів до AI-коуча / місяць", "10 AI-аналізів журналу / місяць", "20 AI-аналізів графіка / місяць", "CSV/XLSX експорт"],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          headline: "Для активного трейдера, якому потрібен глибокий розбір і ринковий контекст.",
          text:
            "Відкрий вищі ліміти, AI-звіти, premium-аналіз графіків, ринковий контекст і шар AI-сканера / AI Market Brief.",
          bestFor: "Найкраще для активних трейдерів, які серйозно розбирають угоди й шукають повторювані помилки та сетапи.",
          cta: "Перейти на Edge",
          features: ["Усе з Core",
          "Strategy OS: створення власної торгової стратегії", "До 2 000 угод", "5 скріншотів на угоду", "200 запитів до AI-коуча / місяць", "30 AI-звітів / місяць", "AI-сканер / ринкова розвідка"],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          headline: "Для серйозного трейдера, якому потрібен повний AI Trading Desk.",
          text:
            "Відкрий AI-сигнали, плаваючий віджет, Signal-to-Journal, відстеження рішень, навчання на результатах і максимальні AI-ліміти.",
          bestFor: "Найкраще для просунутих трейдерів, яким потрібні структурні сигнали та повний цикл зворотного зв’язку.",
          cta: "Відкрити Elite",
          features: ["Усе з Edge", "До 10 000 угод", "10 скріншотів на угоду", "1 000 запитів до AI-коуча / місяць", "150 AI-звітів / місяць", "AI-сигнали + Signal-to-Journal"],
        },
      ],
      signalEyebrow: "Навіщо потрібен шар сигналів",
      signalTitle: "Сигнали SkillEdge мають навчати, а не змушувати трейдера сліпо натискати.",
      signalText:
        "Слабкий сервіс сигналів створює залежність. Сильна торгова система створює ясність: сетап, ризик, підтвердження, скасування ідеї та урок після результату.",
      signalCards: [
        ["Не сліпі команди", "Сигнали — це структурні торгові ідеї: сетап, напрямок, тригер, зона входу, стоп, цілі та ризик."],
        ["Розбір до дії", "Кожен серйозний сигнал пояснює, чому він з’явився, що його підтверджує і що робить його небезпечним."],
        ["Сигнал → журнал", "Взятий сигнал може стати угодою в журналі, щоб порівняти план і реальне виконання."],
        ["Коучинг за результатом", "Взяті, пропущені та проігноровані рішення показують упущені можливості, хороші пропуски та слабке виконання."],
      ],
      comparisonTitle: "Порівняння тарифів",
      comparisonText: "Обери тариф під поточний торговий процес.",
      comparison: [
        ["Функція", "Core", "Edge", "Elite"],
        ["Журнал + скріншоти", "Так", "Так", "Так"],
        ["AI-коуч", "50 / місяць", "200 / місяць", "1 000 / місяць"],
        ["AI-аналіз журналу", "10 / місяць", "50 / місяць", "300 / місяць"],
        ["AI-аналіз графіка", "20 / місяць", "100 / місяць", "500 / місяць"],
        ["AI-звіти", "—", "30 / місяць", "150 / місяць"],
        ["AI-сканер", "—", "Так", "Так"],
        ["AI-сигнали", "—", "—", "Так"],
        ["Найкраще для", "Дисципліни", "Активного розбору", "AI Trading Desk"],
      ],
      finalTitle: "Чесна рекомендація",
      finalText:
        "Обирай Core для структури, Edge для ринкового інтелекту та активного розбору, Elite для AI-сигналів і повного workflow сигнал → журнал.",
      disclaimer:
        "SkillEdge AI не є фінансовою рекомендацією і не гарантує прибуток. Платформа створена для покращення структури, розбору, якості рішень і торгового процесу.",
    },
    teamPage: {
      heroBadge: "Про SkillEdge AI",
      heroTitle: "Ми будуємо AI-систему для трейдингу, яку серйозні трейдери хотіли б мати вже зараз.",
      heroText:
        "SkillEdge AI створюється навколо однієї ідеї: трейдерам не потрібен ще більший шум. Їм потрібна система, яка поєднує ринкові можливості, журнал, дисципліну виконання, навчання та особистий прогрес.",
      ctaProduct: "Переглянути продукт",
      ctaPricing: "Переглянути тарифи",
      philosophyBadge: "Філософія продукту",
      philosophyTitle: "Процес важливіший за передбачення",
      beliefs: [
        "Сигнали без навчання створюють залежність.",
        "Угоду без плану неможливо нормально розібрати.",
        "Журнал без зворотного зв’язку перетворюється на кладовище старих угод.",
        "Найкращий продукт робить трейдера спокійнішим, гострішим і дисциплінованішим.",
        "Персональні AI-сигнали стають сильними тільки тоді, коли трейдер збирає чисту історію угод.",
      ],
      storyEyebrow: "Наша історія",
      storyTitle: "SkillEdge AI створюється для трейдерів, яким потрібні дисципліна, структура та вимірюваний прогрес.",
      storyText:
        "Продукт виріс із проблеми, з якою стикаються багато активних трейдерів: ринок дає занадто багато інформації, але майже не дає чесного зворотного зв’язку щодо виконання. SkillEdge AI має зв’язати рішення трейдера, скріншоти, журнал, сигнали й результати в одну серйозну систему розбору.",
      teamEyebrow: "Структура команди",
      teamTitle: "Сторінка побудована як команда продукту: трейдинг, продукт, дані та підтримка.",
      teamText:
        "Ці картки — готовий макет About Us. Пізніше ти зможеш вставити реальні фото, імена та ролі без зміни структури сторінки.",
      teamCards: [
        ["Засновник / бачення продукту", "Відповідає за напрям продукту, workflow трейдера, тарифну логіку та premium-позиціонування."],
        ["Trading Research", "Визначає сетапи, логіку сигналів, критерії розбору журналу та освітні плейбуки."],
        ["AI і дані", "Будує логіку сканера, AI-промпти, збагачення даних, ліміти та backend-gates."],
        ["Дизайн і досвід", "Формує dashboard, публічні сторінки, locked states, loading states і premium-інтерфейс."],
        ["Support Operations", "Закриває питання клієнтів щодо продукту, оплати, доступу й операторського потоку."],
        ["Безпека та інфраструктура", "Захищає routes, API-ключі, Supabase-доступ, rate limits і production-деплой."],
      ],
      principlesEyebrow: "Принципи",
      principlesTitle: "Серйозний trading-продукт має чесно говорити про ризик і будуватися навколо процесу.",
      principles: [
        ["Жодної фальшивої впевненості", "У трейдингу є ризик. SkillEdge AI не має робити вигляд, що модель або сигнал можуть гарантувати прибуток."],
        ["Прозора логіка", "Клієнт має розуміти, чому з’явився сигнал, які джерела відстежуються і що в ідеї сильне або слабке."],
        ["Premium-мислення", "Кожна функція має бути корисною, серйозною та пов’язаною з реальним процесом трейдера."],
      ],
      roadmapEyebrow: "План розвитку",
      roadmapTitle: "Ми будуємо продукт у напрямку premium AI Trading Desk.",
      roadmapText:
        "Launch-основа вже продуктова: журнал, сигнали, навчання, звіти, підтримка, оплата та ринкова розвідка. Наступний шар — premium data, повний market scan і персональні сигнали на основі історії клієнта.",
      roadmap: [
        ["01", "Launch foundation", "Журнал, dashboard, скріншоти, навчання, звіти, crypto-доступ і фундамент підтримки."],
        ["02", "Сигнали та поведінка", "AI-сигнали, відстеження рішень, підготовка угод, навчання на результатах і коучинг упущених можливостей."],
        ["03", "Premium data", "Повне покриття тикерів, Binance universe, каталізатори, heatmaps, halt screener і сильніша логіка сканера."],
        ["04", "Особиста перевага", "AI навчається на найкращих сетапах клієнта, слабких патернах, помилках виконання та історії журналу."],
      ],
      finalTitle: "Допомогти трейдерам вийти з хаосу й почати працювати через систему.",
      finalText:
        "SkillEdge AI створений для трейдерів, які хочуть глибше розбирати, чистіше думати, дисциплінованіше виконувати й будувати повторювану перевагу на реальних даних, а не на емоціях і пам’яті.",
    },
    footer: {
      description:
        "Premium AI-простір для серйозних трейдерів: ринкова розвідка, AI-сигнали, журнал, розбір виконання, плейбук, звіти та коучинг в одній системі.",
      product: "Продукт",
      features: "Функції",
      resources: "Ресурси",
      legal: "Документи",
      productLinks: ["Головна", "Продукт", "Тарифи", "Про нас"],
      featureLinks: ["AI Trading Desk", "AI-сигнали", "Ринкова розвідка", "Журнал і скріншоти", "Коуч виконання", "Навчання на результатах", "Плейбук", "Звіти", "Центр навчання", "Помічник підтримки"],
      resourceLinks: ["Початок роботи", "Як працює SkillEdge", "Гайд по журналу угод", "Гайд по AI-сигналах", "Партнерська програма", "Зв’язатися з підтримкою"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "Налаштування cookie",
      choosePlan: "Обрати тариф",
      requestDemo: "Запросити демо",
      risk:
        "SkillEdge AI не є фінансовою рекомендацією і не гарантує прибуток. Платформа створена для покращення структури, розбору, якості рішень і торгового процесу.",
      contact: "Контакти",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукту за запитом",
      rights: "© 2026 SkillEdge AI. Усі права захищено.",
      bottom: "Створено для трейдерів, яким потрібні структура, дисципліна та вимірюваний прогрес.",
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
      creatingAccount: "Створюємо акаунт...",
      creatingInvoice: "Створюємо крипто-рахунок...",
      loginRequired: "Увійдіть або зареєструйтеся, щоб оплатити тариф.",
      afterRegister: "Акаунт створено. Якщо потрібно, підтвердьте email.",
      authError: "Помилка авторизації.",
    },
  },
} as const;

const priceMatrix = {
  starter: { monthly: 49, halfyear: 249, yearly: 399 },
  pro: { monthly: 99, halfyear: 499, yearly: 799 },
  elite: { monthly: 149, halfyear: 749, yearly: 1249 },
} as const;

function getLandingDictionaryLocale(locale: Locale): "en" | "ru" | "ua" {
  if (locale === "ru") return "ru";
  if (locale === "uk") return "ua";
  return "en";
}

function getNextLandingLocale(locale: Locale): Locale {
  const currentIndex = LOCALES.indexOf(locale);
  return LOCALES[(currentIndex + 1) % LOCALES.length];
}

export default function Landing({
  initialPage = "home",
}: {
  initialPage?: PageKey;
}) {
  const [language, setLanguage] = useState<Language>("en");
  const [active, setActiveState] = useState<PageKey>(initialPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSplashIntro, setShowSplashIntro] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [paymentModal, setPaymentModal] = useState<{
  planId: string;
  billingPeriod: BillingPeriod;
} | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<{
    planId: string;
    billingPeriod: BillingPeriod;
  } | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const t = getStructuredLandingDictionary(language);
  const authLabels = t.auth;

  useEffect(() => {
    setActiveState(initialPage);
  }, [initialPage]);

useEffect(() => {
  if (initialPage !== "home") return;

  const splashSeen = sessionStorage.getItem("skilledge_splash_seen");
  if (splashSeen === "true") return;

  setShowSplashIntro(true);
  sessionStorage.setItem("skilledge_splash_seen", "true");

  const timer = window.setTimeout(() => {
    setShowSplashIntro(false);
  }, 2800);

  return () => window.clearTimeout(timer);
}, [initialPage]);

  useEffect(() => {
    const savedLocale = getSavedLocale();
    setLanguage(savedLocale);
    applyDocumentLocale(savedLocale);
  }, []);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setLanguageMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [languageMenuOpen]);

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
  page === "desk" ||
  page === "product" ||
  page === "pricing" ||
  page === "team"
) {
  setActive(page);
}

if (page === "about") {
  setActive("team");
}
  }, []);

  const setActive = (page: PageKey) => {
    setActiveState(page);

    const href = pageHref[page];

    if (pathname !== href) {
      router.push(href);
    }
  };

  const selectLanguage = (nextLanguage: Locale) => {
    setLanguage(nextLanguage);
    saveLocale(nextLanguage);
    applyDocumentLocale(nextLanguage);
    setLanguageMenuOpen(false);
    setMenuOpen(false);
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
      setAuthStatus(authMode === "login" ? authLabels.checking : authLabels.creatingAccount);

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
      setAuthStatus(error instanceof Error ? error.message : authLabels.authError);
    }
  };

  const handleCheckout = async (id: string, billingPeriod: BillingPeriod = "monthly") => {
    try {
      setCheckoutStatus(t.pricingPage.checkoutStatus.checking);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setPendingCheckout({ planId: id, billingPeriod });
        setAuthStatus(authLabels.loginRequired);
        setAuthMode("login");
        return;
      }

      setCheckoutStatus(t.pricingPage.checkoutStatus.invoice);

      const response = await fetch("/api/create-crypto-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId: id, billingPeriod }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.details
            ? `${result?.error}: ${result.details}`
            : result?.error || t.pricingPage.checkoutStatus.unavailable
        );
      }

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      setCheckoutStatus(t.pricingPage.checkoutStatus.noUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.pricingPage.checkoutStatus.unavailable;
      setCheckoutStatus(message);
      console.error(error);
    }
  };

const openPaymentModal = (id: string, billingPeriod: BillingPeriod = "monthly") => {
  setCheckoutStatus("");
  setPaymentModal({ planId: id, billingPeriod });
};

const closePaymentModal = () => {
  setPaymentModal(null);
};

const handleCryptoPaymentFromModal = () => {
  if (!paymentModal) return;

  const selected = paymentModal;
  setPaymentModal(null);
  handleCheckout(selected.planId, selected.billingPeriod);
};

const handleCardPaymentFromModal = () => {
  setPaymentModal(null);
  setCheckoutStatus(t.pricingPage.cardPayment || "Card payment is being prepared.");
};

const backgroundVariant = active === "desk" ? "product" : active;
  
  return (
  <div className="relative isolate min-h-screen overflow-hidden bg-[#07111F] text-white">
    <AnimatePresence>
      {showSplashIntro ? <SkillEdgeSplashIntro language={language} /> : null}
    </AnimatePresence>

    <TradingBackground variant={backgroundVariant} />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111F]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div className="text-left">
              <div className="text-lg font-semibold">SkillEdge AI</div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">{t.brandTag}</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navKeys.map((key) => (
              <Link
                key={key}
                href={pageHref[key]}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active === key ? "bg-white text-black" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.nav[key]}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div ref={languageMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setLanguageMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={languageMenuOpen}
                aria-label="Choose language"
                className={`flex h-11 min-w-[78px] items-center justify-center rounded-full border px-4 text-sm font-medium text-white transition ${
                  languageMenuOpen
                    ? "border-emerald-300/35 bg-white/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <Icon name="globe" className="mr-2 h-4 w-4" />
                {LANDING_LANGUAGE_SHORT_LABEL[language]}
                <span
                  aria-hidden="true"
                  className={`ml-2 text-[10px] text-white/45 transition-transform ${
                    languageMenuOpen ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>

              <AnimatePresence>
                {languageMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    role="listbox"
                    aria-label="Languages"
                    className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[252px] rounded-2xl border border-white/10 bg-[#0B1725]/98 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.44)] backdrop-blur-2xl"
                  >
                    <div className="grid grid-cols-4 gap-1.5">
                      {LANDING_LANGUAGE_OPTIONS.map((option) => {
                        const selected = option.locale === language;

                        return (
                          <button
                            key={option.locale}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => selectLanguage(option.locale)}
                            title={option.nativeLabel}
                            aria-label={option.nativeLabel}
                            className={`flex h-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.08em] transition ${
                              selected
                                ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                                : "border-white/[0.06] bg-white/[0.025] text-white/58 hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
                            }`}
                          >
                            {option.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>


            {currentUserEmail ? (
              <>
                <a href="/dashboard" className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]">
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

          <button onClick={() => setMenuOpen((value) => !value)} className="md:hidden">
            <Icon name={menuOpen ? "close" : "menu"} className="h-6 w-6" />
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10 bg-[#07111F]/95 px-4 pb-4 md:hidden"
            >
              <div className="flex flex-col gap-2 pt-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                  <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
                    Language
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {LANDING_LANGUAGE_OPTIONS.map((option) => {
                      const selected = option.locale === language;

                      return (
                        <button
                          key={option.locale}
                          type="button"
                          onClick={() => selectLanguage(option.locale)}
                          title={option.nativeLabel}
                          aria-label={option.nativeLabel}
                          className={`flex h-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.08em] transition ${
                            selected
                              ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                              : "border-white/[0.06] bg-white/[0.025] text-white/58 hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
                          }`}
                        >
                          {option.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {navKeys.map((key) => (
                  <Link
                    key={key}
                    href={pageHref[key]}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-2xl px-4 py-3 text-left text-sm ${active === key ? "bg-white text-black" : "bg-white/[0.04] text-white/75"}`}
                  >
                    {t.nav[key]}
                  </Link>
                ))}

                {currentUserEmail ? (
                  <>
                    <a href="/dashboard" onClick={() => setMenuOpen(false)} className="rounded-2xl bg-white px-4 py-3 text-left text-sm font-medium text-black">
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

      <main className={`relative z-10 mx-auto w-full py-12 ${active === "home" ? "max-w-[1760px] px-0" : "max-w-6xl px-4 md:px-8"}`}>
                <AnimatePresence mode="wait">
          {active === "home" && (
            <motion.div key="home">
              <HomePage t={t} setActive={setActive} />
            </motion.div>
          )}

          {active === "desk" && (
            <motion.div key="desk">
              <DeskPage t={t} setActive={setActive} />
            </motion.div>
          )}

          {active === "product" && (
            <motion.div key="product">
              <ProductPage t={t} setActive={setActive} />
            </motion.div>
          )}

          {active === "pricing" && (
            <motion.div key="pricing">
              <PricingPage
                t={t}
                handleCheckout={openPaymentModal}
                checkoutStatus={checkoutStatus}
              />
            </motion.div>
          )}

          {active === "team" && (
            <motion.div key="team">
              <TeamPage t={t} setActive={setActive} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

     <div className="relative z-10">
  <PremiumFooter t={t} setActive={setActive} handleCheckout={openPaymentModal} />
</div>
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

      <AnimatePresence>
  {paymentModal ? (
    <PaymentMethodModal
      key="payment-method-modal"
      t={t}
      selection={paymentModal}
      onClose={closePaymentModal}
      onCrypto={handleCryptoPaymentFromModal}
      onCard={handleCardPaymentFromModal}
    />
  ) : null}
</AnimatePresence>
    </div>
  );
}

type ClientResultCard = {
  id: string;
  name: string;
  accountSize: string;
  netProfit: string;
  netProfitValue: string;
  winRate: string;
  trades: string;
  avgR: string;
  drawdown: string;
  period: string;
  trend: string;
  stability: string;
  weeklyValue: string;
  points: number[];
};

function getHomePremiumCopy(lang: string) {
  const normalizedLang = String(lang || "").toLowerCase();

  if (normalizedLang === "en") {
    return {
      badge: "Built by traders for traders",
      title: "Trading without a system costs more than the subscription.",
      text:
        "SkillEdge AI turns market chaos, trades, screenshots, mistakes and alerts into one trading workflow — so you see structure, not noise.",
      accent: "Setup. Risk. Execution. Review.",
      primary: "Open product",
      secondary: "View pricing",
      how: "How it works",
      proofTitle: "Professional-grade trust",
      trustItems: [
        ["Protected data", "Your journal and stats stay private."],
        ["Transparent methodology", "Every setup needs context, risk and invalidation."],
        ["Built for traders", "Designed around real execution and review."],
      ],
      features: [
        [
          "AI Signals",
          "Structured setups with entry logic, stop, targets and risk context.",
          "Open signals",
        ],
        [
          "Trading Journal",
          "Track trades, screenshots, emotions, mistakes and performance metrics.",
          "Open journal",
        ],
        [
          "Execution Review",
          "Review every trade and understand what improved or damaged the result.",
          "Review trades",
        ],
        [
          "Market Intelligence",
          "Scanner, market context and in-play opportunities in one workspace.",
          "View analytics",
        ],
      ],
    };
  }

  if (normalizedLang === "ua") {
    return {
      badge: "Створено трейдерами для трейдерів",
      title: "Трейдинг без системи коштує дорожче за підписку.",
      text:
        "SkillEdge AI перетворює хаос ринку, угоди, скріншоти, помилки й сигнали в єдиний trading workflow — щоб ти бачив структуру, а не шум.",
      accent: "Setup. Ризик. Виконання. Розбір.",
      primary: "Відкрити продукт",
      secondary: "Дивитися тарифи",
      how: "Як це працює",
      proofTitle: "Довіра професійного рівня",
      trustItems: [
        ["Дані під захистом", "Журнал і статистика клієнта залишаються приватними."],
        ["Прозора методологія", "Кожен сетап має контекст, ризик та invalidation."],
        ["Створено для трейдерів", "Продукт побудований навколо виконання і review."],
      ],
      features: [
        [
          "AI Signals",
          "Структуровані сетапи з логікою входу, стопом, цілями та risk context.",
          "Відкрити сигнали",
        ],
        [
          "Trading Journal",
          "Фіксуй угоди, скріншоти, емоції, помилки та performance metrics.",
          "Вести журнал",
        ],
        [
          "Execution Review",
          "Розбирай кожну угоду і бач, що посилило або зламало результат.",
          "Розбір угод",
        ],
        [
          "Market Intelligence",
          "Сканер, ринковий контекст і in-play можливості в одному workspace.",
          "Дивитися аналітику",
        ],
      ],
    };
  }

  return {
    badge: "Сделано трейдерами для трейдеров",
    title: "Трейдинг без системы стоит дороже подписки.",
    text:
      "SkillEdge AI превращает хаос рынка, сделки, скриншоты, ошибки и сигналы в единый trading workflow — чтобы ты видел не шум, а структуру.",
    accent: "Setup. Риск. Исполнение. Разбор.",
    primary: "Открыть продукт",
    secondary: "Смотреть тарифы",
    how: "Как это работает",
    proofTitle: "Доверие профессионального уровня",
    trustItems: [
      ["Данные под защитой", "Журнал и статистика клиента остаются приватными."],
      ["Прозрачная методология", "Каждый сетап требует контекст, риск и invalidation."],
      ["Сделано для трейдеров", "Продукт построен вокруг исполнения и review."],
    ],
    features: [
      [
        "AI Signals",
        "Структурные сетапы с логикой входа, стопом, целями и risk context.",
        "Открыть сигналы",
      ],
      [
        "Trading Journal",
        "Фиксируй сделки, скриншоты, эмоции, ошибки и performance metrics.",
        "Вести журнал",
      ],
      [
        "Execution Review",
        "Разбирай каждую сделку и понимай, что усилило или сломало результат.",
        "Разбор сделок",
      ],
      [
        "Market Intelligence",
        "Сканер, рыночный контекст и in-play возможности в одном workspace.",
        "Смотреть аналитику",
      ],
    ],
  };
}

function getClientResultsShowcaseCopy(lang: string) {
  const normalizedLang = String(lang || "").toLowerCase();

  if (normalizedLang === "en") {
    return {
      eyebrow: "Client performance examples",
      title:
        "Different starting capital. One principle: discipline, journaling and execution review.",
      subtitle:
        "Clients start with different account sizes, trading styles and growth speeds. But when a trader journals consistently, tracks trades and reviews execution, the process usually becomes cleaner, stronger and more stable.",
      note:
        "These are product examples, not a profit promise. Trading involves risk. SkillEdge AI helps traders build structure, review decisions and improve execution discipline.",
      cta: "Open product",
      secondaryCta: "View pricing",
      periodLabel: "Period",
      trendLabel: "Trend",
      stabilityLabel: "Stability",
      capitalLabel: "Starting capital",
      pnlLabel: "Net profit",
      winRateLabel: "Win rate",
      avgRLabel: "Average R",
      drawdownLabel: "Max drawdown",
      weeksLabel: "Last 8 weeks",
      chartLabel: "Cumulative Net PnL",
      clickHint: "Click the card to open the product",
      trustTitle: "Why this matters",
      trustBlocks: [
        [
          "Not a blind signal feed",
          "The system is built around context, setup, trigger, stop, targets and invalidation.",
        ],
        [
          "Journal becomes your edge",
          "The better the trader tracks decisions, the stronger the feedback loop becomes.",
        ],
        [
          "Different account. Same process.",
          "Whether the account is $5K or $100K+, the foundation is discipline, risk and structure.",
        ],
      ],
    };
  }

  if (normalizedLang === "ua") {
    return {
      eyebrow: "Приклади результатів клієнтів",
      title:
        "Різний стартовий капітал. Один принцип: дисципліна, журнал і розбір виконання.",
      subtitle:
        "Клієнти мають різний розмір рахунку, стиль торгівлі та темп росту. Але коли трейдер системно веде журнал, відстежує угоди та розбирає виконання, процес зазвичай стає чистішим, сильнішим і стабільнішим.",
      note:
        "Це приклади продукту, а не обіцянка прибутку. Трейдинг має ризики. SkillEdge AI допомагає будувати структуру, аналізувати рішення та покращувати дисципліну виконання.",
      cta: "Відкрити продукт",
      secondaryCta: "Дивитися тарифи",
      periodLabel: "Період",
      trendLabel: "Тренд",
      stabilityLabel: "Стабільність",
      capitalLabel: "Стартовий капітал",
      pnlLabel: "Чистий прибуток",
      winRateLabel: "Вінрейт",
      avgRLabel: "Середній R",
      drawdownLabel: "Макс. просадка",
      weeksLabel: "Останні 8 тижнів",
      chartLabel: "Кумулятивний чистий PnL",
      clickHint: "Натисни на картку, щоб відкрити продукт",
      trustTitle: "Чому це важливо",
      trustBlocks: [
        [
          "Не сліпа стрічка сигналів",
          "Система будується навколо контексту, сетапу, тригера, стопа, цілей та invalidation.",
        ],
        [
          "Журнал стає твоїм edge",
          "Чим краще трейдер фіксує рішення, тим сильнішим стає feedback loop.",
        ],
        [
          "Різний рахунок. Один процес.",
          "Неважливо, $5K на рахунку чи $100K+. Основа — дисципліна, ризик і структура.",
        ],
      ],
    };
  }

  return {
    eyebrow: "Примеры результатов клиентов",
    title:
      "Разный стартовый капитал. Один принцип: дисциплина, журнал и разбор исполнения.",
    subtitle:
      "У клиентов разный размер счёта, стиль торговли и темп роста. Но когда трейдер системно ведёт журнал, отслеживает сделки и разбирает исполнение, процесс обычно становится чище, сильнее и стабильнее.",
    note:
      "Это примеры продукта, а не обещание прибыли. Трейдинг связан с риском. SkillEdge AI помогает выстроить структуру, разбирать решения и улучшать дисциплину исполнения.",
    cta: "Открыть продукт",
    secondaryCta: "Смотреть тарифы",
    periodLabel: "Период",
    trendLabel: "Тренд",
    stabilityLabel: "Стабильность",
    capitalLabel: "Стартовый капитал",
    pnlLabel: "Чистая прибыль",
    winRateLabel: "Винрейт",
    avgRLabel: "Средний R",
    drawdownLabel: "Макс. просадка",
    weeksLabel: "Последние 8 недель",
    chartLabel: "Кумулятивный чистый PnL",
    clickHint: "Нажми на карточку, чтобы открыть продукт",
    trustTitle: "Почему это важно",
    trustBlocks: [
      [
        "Не слепая лента сигналов",
        "Система строится вокруг контекста, сетапа, триггера, стопа, целей и invalidation.",
      ],
      [
        "Журнал становится твоим edge",
        "Чем лучше трейдер фиксирует решения, тем сильнее становится feedback loop.",
      ],
      [
        "Разный счёт. Единый процесс.",
        "Неважно, $5K на счёте или $100K+. Основа — дисциплина, риск и структура.",
      ],
    ],
  };
}

function getClientResultsCards(lang: string): ClientResultCard[] {
  const normalizedLang = String(lang || "").toLowerCase();
  const isEn = normalizedLang === "en";
  const isUa = normalizedLang === "ua";

  return [
    {
      id: "client-1",
      name: isEn ? "Client A" : isUa ? "Клієнт A" : "Клиент A",
      accountSize: "$8,000",
      netProfit: "+$5.2K",
      netProfitValue: "+$5,200",
      winRate: "58%",
      trades: "74 / 128",
      avgR: "1.6",
      drawdown: "-$620",
      period: isEn ? "2 months" : isUa ? "2 місяці" : "2 месяца",
      trend: isEn ? "Bullish" : isUa ? "Бичачий" : "Бычий",
      stability: isEn ? "High" : isUa ? "Висока" : "Высокая",
      weeklyValue: "+$5,200",
      points: [18, 26, 35, 44, 40, 52, 49, 60, 57, 66, 63, 70, 68, 75],
    },
    {
      id: "client-2",
      name: isEn ? "Client B" : isUa ? "Клієнт B" : "Клиент B",
      accountSize: "$15,000",
      netProfit: "+$12.4K",
      netProfitValue: "+$12,400",
      winRate: "63%",
      trades: "146 / 232",
      avgR: "1.9",
      drawdown: "-$1.1K",
      period: isEn ? "2 months" : isUa ? "2 місяці" : "2 месяца",
      trend: isEn ? "Bullish" : isUa ? "Бичачий" : "Бычий",
      stability: isEn ? "High" : isUa ? "Висока" : "Высокая",
      weeklyValue: "+$12,400",
      points: [12, 22, 34, 48, 41, 57, 50, 68, 59, 70, 65, 78, 75, 86],
    },
    {
      id: "client-3",
      name: isEn ? "Client C" : isUa ? "Клієнт C" : "Клиент C",
      accountSize: "$30,000",
      netProfit: "+$24.8K",
      netProfitValue: "+$24,800",
      winRate: "61%",
      trades: "119 / 195",
      avgR: "2.1",
      drawdown: "-$2.4K",
      period: isEn ? "2 months" : isUa ? "2 місяці" : "2 месяца",
      trend: isEn ? "Steady" : isUa ? "Стійкий" : "Устойчивый",
      stability: isEn ? "Strong" : isUa ? "Сильна" : "Сильная",
      weeklyValue: "+$24,800",
      points: [10, 18, 29, 42, 38, 51, 47, 63, 58, 72, 68, 79, 83, 91],
    },
    {
      id: "client-4",
      name: isEn ? "Client D" : isUa ? "Клієнт D" : "Клиент D",
      accountSize: "$75,000",
      netProfit: "+$61.3K",
      netProfitValue: "+$61,300",
      winRate: "66%",
      trades: "171 / 259",
      avgR: "2.4",
      drawdown: "-$4.9K",
      period: isEn ? "2 months" : isUa ? "2 місяці" : "2 месяца",
      trend: isEn ? "Bullish" : isUa ? "Бичачий" : "Бычий",
      stability: isEn ? "Strong" : isUa ? "Сильна" : "Сильная",
      weeklyValue: "+$61,300",
      points: [9, 17, 28, 41, 39, 55, 51, 67, 62, 74, 71, 84, 89, 97],
    },
    {
      id: "client-5",
      name: isEn ? "Client E" : isUa ? "Клієнт E" : "Клиент E",
      accountSize: "$120,000",
      netProfit: "+$104.8K",
      netProfitValue: "+$104,800",
      winRate: "68%",
      trades: "214 / 315",
      avgR: "2.7",
      drawdown: "-$7.8K",
      period: isEn ? "2 months" : isUa ? "2 місяці" : "2 месяца",
      trend: isEn ? "Bullish" : isUa ? "Бичачий" : "Бычий",
      stability: isEn ? "Strong" : isUa ? "Сильна" : "Сильная",
      weeklyValue: "+$104,800",
      points: [8, 16, 27, 39, 36, 52, 49, 66, 61, 76, 73, 88, 93, 100],
    },
  ];
}

function ClientResultLineChart({ points }: { points: number[] }) {
  const width = 456;
  const height = 230;
  const paddingX = 28;
  const paddingY = 24;

  const max = Math.max(...points);
  const min = Math.min(...points);

  const toX = (index: number) =>
    paddingX + (index / (points.length - 1)) * (width - paddingX * 2);

  const toY = (value: number) =>
    height -
    paddingY -
    ((value - min) / (max - min || 1)) * (height - paddingY * 2);

  const linePoints = points.map((point, index) => `${toX(index)},${toY(point)}`).join(" ");
  const areaPoints = `${paddingX},${height - paddingY} ${linePoints} ${
    width - paddingX
  },${height - paddingY}`;

  return (
    <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[#00C076]/15 bg-[#0F172A]/90 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full">
        <defs>
          <linearGradient id="clientChartLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38d6ff" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>

          <linearGradient id="clientChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38d6ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38d6ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4, 5].map((row) => {
          const y = paddingY + ((height - paddingY * 2) / 5) * row;

          return (
            <line
              key={row}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="5 7"
            />
          );
        })}

        <polygon points={areaPoints} fill="url(#clientChartFill)" />

        <motion.polyline
          points={linePoints}
          fill="none"
          stroke="url(#clientChartLine)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        <circle
          cx={toX(points.length - 1)}
          cy={toY(points[points.length - 1])}
          r="7"
          fill="#07111d"
          stroke="#67e8f9"
          strokeWidth="3"
        />

        <circle
          cx={toX(points.length - 1)}
          cy={toY(points[points.length - 1])}
          r="13"
          fill="rgba(0,192,118,0.16)"
        />

        {["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"].map(
          (label, index) => (
            <text
              key={label}
              x={paddingX + index * ((width - paddingX * 2) / 7)}
              y={height - 4}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize="10"
              fontWeight="800"
            >
              {label}
            </text>
          )
        )}
      </svg>
    </div>
  );
}

function HomeClientPnlVisual({ lang }: { lang: string }) {
  const normalizedLang = String(lang || "").toLowerCase();
  const isEn = normalizedLang === "en";
  const isUa = normalizedLang === "ua";

  const copy = isEn
    ? {
        badge: "Desk standard",
        title: "SkillEdge Trading Desk",
        subtitle: "A structured workflow for serious traders.",
        main: "From market noise to a working trade plan.",
        note:
          "Every idea must pass market context, setup quality, trigger, risk, invalidation, R:R and journal review.",
        status: "Risk-first",
        cards: [
          ["01", "Market scan", "Find in-play stocks and crypto with real activity."],
          ["02", "Setup validation", "Filter hype and keep only structured opportunities."],
          ["03", "Risk plan", "Entry zone, stop, targets, RR and invalidation before action."],
          ["04", "Journal review", "Every decision becomes feedback for the next trade."],
        ],
        bottom: [
          ["No blind signals", "Setup + trigger + risk"],
          ["Personal edge", "Journal-based improvement"],
          ["Execution quality", "Plan vs real trade"],
        ],
      }
    : isUa
      ? {
          badge: "Desk standard",
          title: "SkillEdge Trading Desk",
          subtitle: "Структурований workflow для серйозних трейдерів.",
          main: "Від ринкового шуму — до робочого плану.",
          note:
            "Кожна ідея проходить market context, setup quality, trigger, risk, invalidation, R:R і journal review.",
          status: "Risk-first",
          cards: [
            ["01", "Market scan", "Знайти in-play акції та крипту з реальною активністю."],
            ["02", "Setup validation", "Відсіяти хайп і залишити тільки структурні можливості."],
            ["03", "Risk plan", "Зона входу, стоп, цілі, RR та invalidation до дії."],
            ["04", "Journal review", "Кожне рішення стає feedback для наступної угоди."],
          ],
          bottom: [
            ["Без сліпих сигналів", "Сетап + тригер + ризик"],
            ["Personal edge", "Розвиток на базі журналу"],
            ["Якість виконання", "План проти реальної угоди"],
          ],
        }
      : {
          badge: "Desk standard",
          title: "SkillEdge Trading Desk",
          subtitle: "Структурированный workflow для серьёзных трейдеров.",
          main: "От рыночного шума — к рабочему плану.",
          note:
            "Каждая идея проходит market context, setup quality, trigger, risk, invalidation, R:R и journal review.",
          status: "Risk-first",
          cards: [
            ["01", "Market scan", "Найти in-play акции и крипту с реальной активностью."],
            ["02", "Setup validation", "Отсеять хайп и оставить только структурные возможности."],
            ["03", "Risk plan", "Зона входа, стоп, цели, RR и invalidation до действия."],
            ["04", "Journal review", "Каждое решение становится feedback для следующей сделки."],
          ],
          bottom: [
            ["Без слепых сигналов", "Сетап + триггер + риск"],
            ["Personal edge", "Рост на базе журнала"],
            ["Качество исполнения", "План против реальной сделки"],
          ],
        };

  return (
    <motion.div
      initial={{ opacity: 0, x: 28, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.65 }}
      className="relative z-10 w-full"
    >
      <div className="absolute -inset-10 rounded-[2.8rem] bg-[#00C076]/12 blur-3xl" />

      <div className="relative w-full overflow-hidden rounded-[2.6rem] border border-white/18 bg-[#111C2D]/86 p-5 shadow-[0_44px_170px_rgba(0,0,0,0.36)] backdrop-blur-2xl md:p-6 xl:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,192,118,0.22),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(200,169,107,0.16),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_44%)]" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="text-sm font-black text-white/82">SkillEdge AI</div>

          <div className="flex items-center gap-2 rounded-full border border-[#00D084]/18 bg-[#00C076]/[0.08] px-3 py-1 text-xs font-black text-[#DFFFEF]/80">
            {copy.status}
            <span className="h-2 w-2 rounded-full bg-[#00C076] shadow-[0_0_18px_rgba(200,169,107,0.9)]" />
          </div>
        </div>

        <div className="relative z-10 mt-5 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
          <div className="inline-flex rounded-full border border-[#00C076]/18 bg-[#00C076]/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#E6EDF7]/68">
            {copy.badge}
          </div>

          <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
            {copy.title}
          </h2>

          <p className="mt-3 text-sm font-black text-[#E6EDF7]/74">
            {copy.subtitle}
          </p>

          <div className="mt-6 rounded-[1.6rem] border border-[#C8A96B]/16 bg-[#C8A96B]/[0.06] p-5">
            <div className="text-2xl font-black leading-tight tracking-[-0.04em] text-white">
              {copy.main}
            </div>

            <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
              {copy.note}
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            {copy.cards.map(([number, title, text], index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.22 + index * 0.08, duration: 0.45 }}
                className="grid grid-cols-[58px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C8A96B]/15 bg-[#C8A96B]/[0.08] text-xs font-black text-[#E6EDF7]">
                  {number}
                </div>

                <div>
                  <div className="text-sm font-black text-white">{title}</div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/48">
                    {text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {copy.bottom.map(([title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-black/22 p-4"
              >
                <div className="text-sm font-black text-white">{title}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-white/45">
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ClientResultsCarousel({
  lang,
  setActive,
}: {
  lang: string;
  setActive: (value: PageKey) => void;
}) {
  const copy = getClientResultsShowcaseCopy(lang);
  const cards = getClientResultsCards(lang);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [cards.length]);

  const activeCard = cards[activeIndex];

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + cards.length) % cards.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % cards.length);
  };

  const openProduct = () => {
    setActive("product");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <section className="relative overflow-hidden rounded-[2.6rem] border border-[#C8A96B]/14 bg-[#111C2D]/82 p-5 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-2xl md:p-6 lg:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.16),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(200,169,107,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_44%)]" />

      <div className="relative grid gap-7 lg:grid-cols-[0.72fr_1.28fr] lg:items-stretch">
        <div className="flex flex-col justify-between">
          <div className="min-w-0">
            <div className="inline-flex max-w-full rounded-full border border-[#00C076]/20 bg-[#00C076]/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#E6EDF7]/76">
              {copy.eyebrow}
            </div>

            <h2 className="mt-5 max-w-3xl text-3xl font-black leading-[1.02] tracking-[-0.05em] text-white md:text-4xl">
              {copy.title}
            </h2>

            <p className="mt-4 text-sm font-semibold leading-7 text-white/64">
              {copy.subtitle}
            </p>

            <p className="mt-4 rounded-2xl border border-amber-300/16 bg-amber-300/[0.055] p-4 text-xs font-semibold leading-6 text-amber-50/68">
              {copy.note}
            </p>
          </div>

          <div className="mt-6 grid gap-3">
            {copy.trustBlocks.map((item, index) => (
              <button
                key={item[0]}
                type="button"
                onClick={() => setActive("product")}
                className="group rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-xl transition hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.07]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#C8A96B]/16 bg-[#C8A96B]/[0.08] text-[10px] font-black text-[#E6EDF7]">
                    0{index + 1}
                  </div>

                  <div>
                    <div className="break-words text-sm font-black leading-6 text-white">{item[0]}</div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-white/48">
                      {item[1]}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <motion.button
          key={activeCard.id}
          type="button"
          initial={{ opacity: 0, x: 26, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.45 }}
          onClick={openProduct}
          className="relative cursor-pointer overflow-hidden rounded-[2.25rem] border border-white/18 bg-[#0F172A]/92 p-5 text-left shadow-[0_34px_140px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/30 md:p-6"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,192,118,0.18),transparent_32%),radial-gradient(circle_at_92%_12%,rgba(200,169,107,0.14),transparent_30%)]" />

          <div className="relative z-10 flex items-center justify-between">
            <div className="text-sm font-black text-white/82">SkillEdge AI</div>

            <div className="flex items-center gap-2 text-xs font-bold text-white/62">
              Live
              <span className="h-2 w-2 rounded-full bg-[#00C076] shadow-[0_0_18px_rgba(200,169,107,0.9)]" />
            </div>
          </div>

          <div className="relative z-10 mt-5 rounded-[1.65rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xl font-black tracking-[-0.025em] text-white">
                  {activeCard.name}
                  <span className="text-white/38"> · {activeCard.period}</span>
                </div>

                <div className="mt-2 text-sm font-semibold text-white/48">
                  {copy.capitalLabel}:{" "}
                  <span className="text-[#E6EDF7]/90">{activeCard.accountSize}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#C8A96B]/18 bg-[#C8A96B]/[0.08] px-4 py-2 text-xs font-black text-[#E6EDF7]">
                {copy.weeksLabel}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                [copy.pnlLabel, activeCard.netProfit, activeCard.netProfitValue, "text-[#00C076]"],
                [copy.winRateLabel, activeCard.winRate, activeCard.trades, "text-white"],
                [copy.avgRLabel, activeCard.avgR, "", "text-white"],
                [copy.drawdownLabel, activeCard.drawdown, "", "text-rose-300"],
              ].map(([label, value, sub, color]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                >
                  <div className="text-xs font-bold text-white/46">{label}</div>
                  <div className={`mt-2 text-3xl font-black tracking-[-0.04em] ${color}`}>
                    {value}
                  </div>
                  {sub ? (
                    <div className="mt-1 text-xs font-semibold text-white/42">
                      {sub}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-sm font-black text-white/76">
                {copy.chartLabel}
              </div>

              <div className="rounded-xl border border-[#C8A96B]/18 bg-[#C8A96B]/[0.08] px-3 py-1 text-xs font-black text-[#E6EDF7]">
                Week 8 · {activeCard.weeklyValue}
              </div>
            </div>

            <ClientResultLineChart points={activeCard.points} />

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                [copy.trendLabel, activeCard.trend],
                [copy.stabilityLabel, activeCard.stability],
                [copy.periodLabel, activeCard.period],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
                >
                  <div className="text-xs font-bold text-white/42">{label}</div>
                  <div className="mt-1 text-sm font-black text-[#00D084]">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm font-semibold text-white/45">
                {copy.clickHint}
              </div>

              <div className="rounded-full border border-[#C8A96B]/22 bg-[#C8A96B]/[0.08] px-5 py-3 text-sm font-black text-[#E6EDF7]">
                {copy.cta}
                <span className="ml-2">→</span>
              </div>
            </div>
          </div>
        </motion.button>
      </div>

      <div className="relative mt-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 rounded-full transition-all ${
                index === activeIndex
                  ? "w-9 bg-[#C8A96B]"
                  : "w-2.5 bg-white/20 hover:bg-white/35"
              }`}
              aria-label={`Show client result ${index + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] text-lg font-black text-white/70 transition hover:border-[#C8A96B]/28 hover:bg-[#C8A96B]/[0.09]"
            aria-label="Previous client result"
          >
            ←
          </button>

          <button
            type="button"
            onClick={goNext}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C8A96B]/20 bg-[#C8A96B]/[0.09] text-lg font-black text-[#E6EDF7] transition hover:bg-[#C8A96B]/[0.14]"
            aria-label="Next client result"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

function HomePage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const copy = getHomePremiumCopy(t.lang);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1760px] space-y-14 px-4 pb-24 pt-8 sm:px-6 lg:px-10 xl:px-14 2xl:px-16"
    >
      <section className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[2.8rem] border border-white/14 bg-[#111C2D]/82 p-6 shadow-[0_44px_170px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:p-8 lg:p-10 xl:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(0,192,118,0.18),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(200,169,107,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.065),transparent_44%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.032)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:64px_64px] opacity-25" />

        <div className="relative grid min-w-0 gap-10 xl:grid-cols-[1.05fr_0.95fr] xl:items-center 2xl:grid-cols-[1.08fr_0.92fr]">
          <div className="min-w-0">
            <div className="inline-flex max-w-full rounded-full border border-[#00C076]/20 bg-[#00C076]/[0.07] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#E6EDF7]/76">
              {copy.badge}
            </div>

            <h1 className="mt-7 max-w-5xl break-words text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white md:text-6xl xl:text-7xl 2xl:text-8xl">
              {copy.title.split("по структуре.")[0]}
              <span className="bg-gradient-to-r from-[#C8A96B] via-[#00D084] to-[#00C076] bg-clip-text text-transparent">
                {copy.title.includes("по структуре.") ? "по структуре." : ""}
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-white/70 md:text-lg">
              {copy.text}
            </p>

            <p className="mt-2 text-lg font-black text-[#00D084]">
              {copy.accent}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActive("product")}
                className="rounded-full bg-white px-7 py-3.5 text-sm font-black text-[#07111F] shadow-[0_18px_70px_rgba(255,255,255,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(0,192,118,0.25)]"
              >
                {copy.primary}
                <span className="ml-2">→</span>
              </button>

              <button
                type="button"
                onClick={() => setActive("pricing")}
                className="rounded-full border border-[#C8A96B]/22 bg-[#C8A96B]/[0.07] px-7 py-3.5 text-sm font-black text-[#E6EDF7] transition duration-300 hover:-translate-y-0.5 hover:bg-[#C8A96B]/[0.12]"
              >
                {copy.secondary}
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = "/dashboard-guide"; }}
                className="rounded-full border border-white/12 bg-white/[0.04] px-7 py-3.5 text-sm font-black text-white/78 transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.075]"
              >
                {copy.how}
                <span className="ml-2">↗</span>
              </button>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {copy.trustItems.map((item) => (
                <button
                  key={item[0]}
                  type="button"
                  onClick={() => setActive("product")}
                  className="min-w-0 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.07]"
                >
                  <div className="break-words text-sm font-black leading-6 text-white">{item[0]}</div>
                  <p className="mt-2 break-words text-xs font-semibold leading-5 text-white/48">
                    {item[1]}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <HomeClientPnlVisual lang={t.lang} />
        </div>

        <div className="relative mt-9 grid gap-4 lg:grid-cols-4">
          {copy.features.map((feature, index) => (
            <button
              key={feature[0]}
              type="button"
              onClick={() =>
                setActive(index === 0 ? "pricing" : index === 3 ? "product" : "product")
              }
              className="group min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 text-left shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.075]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C8A96B]/16 bg-[#C8A96B]/[0.08] text-sm font-black text-[#E6EDF7]">
                0{index + 1}
              </div>

              <div className="mt-5 break-words text-lg font-black leading-7 text-white">{feature[0]}</div>

              <p className="mt-3 break-words text-sm font-semibold leading-7 text-white/56">
                {feature[1]}
              </p>

              <div className="mt-5 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-white/66 transition group-hover:border-[#C8A96B]/28 group-hover:text-[#E6EDF7]">
                {feature[2]}
                <span className="ml-2">→</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <ClientResultsCarousel lang={t.lang} setActive={setActive} />

      <section className="relative overflow-hidden rounded-[2.7rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.12),transparent_32%),radial-gradient(circle_at_92%_18%,rgba(200,169,107,0.1),transparent_30%)]" />

        <div className="relative">
          <div className="text-center text-[11px] font-black uppercase tracking-[0.28em] text-white/38">
            {copy.proofTitle}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {copy.trustItems.map((item, index) => (
              <button
                key={`${item[0]}-bottom`}
                type="button"
                onClick={() => setActive("product")}
                className="rounded-[1.6rem] border border-white/10 bg-black/18 p-5 text-left transition hover:border-[#C8A96B]/24 hover:bg-[#C8A96B]/[0.07]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#C8A96B]/15 bg-[#C8A96B]/[0.07] text-xs font-black text-[#E6EDF7]">
                  0{index + 1}
                </div>

                <div className="mt-4 text-lg font-black text-white">{item[0]}</div>

                <p className="mt-2 text-sm font-semibold leading-7 text-white/55">
                  {item[1]}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function DeskVideoPreview() {
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.28, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[2.8rem] border border-[#C8A96B]/12 bg-[#07111F]/72 p-3 shadow-[0_34px_130px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-0 z-20 rounded-[2.8rem] bg-[radial-gradient(circle_at_20%_0%,rgba(0,192,118,0.16),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(200,169,107,0.11),transparent_32%),linear-gradient(180deg,rgba(3,7,18,0.16),rgba(3,7,18,0.42))]" />

        <div className="pointer-events-none absolute inset-0 z-30 rounded-[2.8rem] ring-1 ring-inset ring-white/8" />

        <motion.div
          aria-hidden
          animate={{ x: ["-25%", "125%"] }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          className="pointer-events-none absolute left-0 top-0 z-30 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/42 to-transparent"
        />

        <div className="relative z-10 overflow-hidden rounded-[2.25rem] bg-[#07111F]">
          <video
            src="/media/desk-preview.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-[620px] w-full object-cover opacity-[0.42] mix-blend-screen saturate-[0.72] contrast-[1.08] brightness-[0.68]"
          />

          <div className="pointer-events-none absolute inset-0 bg-[#07111F]/34" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111F] via-[#07111F]/18 to-[#07111F]/45" />

          <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-[#C8A96B]/16 bg-[#C8A96B]/[0.065] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#E6EDF7]/70 backdrop-blur-xl">
            SkillEdge AI visual layer
          </div>

          <div className="pointer-events-none absolute bottom-5 left-5 right-5 rounded-[1.6rem] border border-white/10 bg-[#07111F]/62 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-white/38">
                  Live desk preview
                </div>
                <div className="mt-1 text-xl font-black text-white">
                  Market context → plan → review
                </div>
              </div>

              <div className="rounded-full border border-[#00C076]/20 bg-[#00D084]/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#DFFFEF]/75">
                Active
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="pointer-events-none absolute -right-16 top-12 h-44 w-44 rounded-full bg-[#00C076]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-10 h-52 w-52 rounded-full bg-[#00C076]/8 blur-3xl" />
    </div>
  );
}

function DeskPage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const language: Language =
    t.lang === "RU" ? "ru" : t.lang === "UA" ? "ua" : "en";

  const copy =
    language === "en"
      ? {
          eyebrow: "SkillEdge AI Trading Desk",
          title: "Turn market noise into a clear execution process.",
          text:
            "A premium workspace for traders who want structure: market context, AI alerts, journal, screenshots, reports and review logic in one connected desk.",
          primary: "Open pricing",
          secondary: "View product",
          outcomeTitle: "What the trader gets",
          outcomeText:
            "SkillEdge AI is not built to throw random signals. It is built to help you understand the setup, the risk, the trigger and your own execution quality.",
          workflowTitle: "Desk workflow",
          finalTitle: "Build your process like a trading desk.",
          finalText:
            "Use SkillEdge AI to scan cleaner, plan faster, track mistakes and improve the way you trade over time.",
          cards: [
            ["Market Intelligence", "Find stocks and crypto with real activity, catalysts and context before wasting time on dead charts."],
            ["AI Alerts", "Elite signals include setup, direction, trigger zone, invalidation, targets, risk notes and outcome tracking."],
            ["Journal + Screenshots", "Save every trade with context, chart screenshots, emotions, mistakes, lessons and execution notes."],
            ["Reports", "Turn your trades into structured feedback: PnL, win rate, mistakes, best setups and review insights."],
          ],
          workflow: [
            ["01", "Scan", "Find active tickers and market context."],
            ["02", "Validate", "Check catalyst, volume, structure and risk."],
            ["03", "Plan", "Define trigger, entry zone, stop and targets."],
            ["04", "Execute", "Trade with a clearer desk plan."],
            ["05", "Review", "Connect the outcome back to your journal."],
          ],
          bullets: [
            "Less random clicking",
            "Cleaner risk decisions",
            "Better post-trade review",
            "Personal edge from your own data",
          ],
        }
      : language === "uk"
        ? {
            eyebrow: "SkillEdge AI Trading Desk",
            title: "Перетвори ринковий шум на чіткий процес виконання.",
            text:
              "Преміальний робочий простір для трейдера: ринковий контекст, AI-сигнали, журнал, скріншоти, звіти й логіка розбору в одному desk.",
            primary: "Відкрити тарифи",
            secondary: "Подивитись продукт",
            outcomeTitle: "Що отримує трейдер",
            outcomeText:
              "SkillEdge AI створюється не для випадкових сигналів. Система допомагає зрозуміти сетап, ризик, тригер і якість власного виконання.",
            workflowTitle: "Desk workflow",
            finalTitle: "Будуй процес як trading desk.",
            finalText:
              "Використовуй SkillEdge AI, щоб чистіше сканувати ринок, швидше планувати, бачити помилки й покращувати свою торгівлю з часом.",
            cards: [
              ["Market Intelligence", "Знаходь акції та крипту з реальною активністю, каталізаторами й контекстом."],
              ["AI Alerts", "Elite-сигнали містять сетап, напрямок, тригер, invalidation, цілі, risk note та outcome tracking."],
              ["Журнал + скріншоти", "Зберігай кожну угоду з контекстом, скріншотами, емоціями, помилками, уроками й нотатками."],
              ["Звіти", "Перетворюй угоди в структурний feedback: PnL, win rate, помилки, найкращі сетапи й висновки."],
            ],
            workflow: [
              ["01", "Scan", "Знайди активні тікери та ринковий контекст."],
              ["02", "Validate", "Перевір каталізатор, обʼєм, структуру й ризик."],
              ["03", "Plan", "Визнач тригер, зону входу, стоп і цілі."],
              ["04", "Execute", "Торгуй з чіткішим планом."],
              ["05", "Review", "Звʼяжи результат із журналом."],
            ],
            bullets: [
              "Менше випадкових входів",
              "Чистіші risk-рішення",
              "Кращий post-trade review",
              "Особиста перевага з твоїх даних",
            ],
          }
        : {
            eyebrow: "SkillEdge AI Trading Desk",
            title: "Преврати рыночный шум в чёткий процесс исполнения.",
            text:
              "Премиальное рабочее пространство для трейдера: рыночный контекст, AI-сигналы, журнал, скриншоты, отчёты и логика разбора в одном desk.",
            primary: "Открыть тарифы",
            secondary: "Посмотреть продукт",
            outcomeTitle: "Что получает трейдер",
            outcomeText:
              "SkillEdge AI создаётся не для случайных сигналов. Система помогает понять сетап, риск, триггер и качество собственного исполнения.",
            workflowTitle: "Desk workflow",
            finalTitle: "Построй процесс как trading desk.",
            finalText:
              "Используй SkillEdge AI, чтобы чище сканировать рынок, быстрее планировать, видеть ошибки и улучшать свою торговлю со временем.",
            cards: [
              ["Market Intelligence", "Находи акции и крипту с реальной активностью, катализаторами и контекстом до того, как тратить время на мёртвые графики."],
              ["AI Alerts", "Elite-сигналы включают сетап, направление, триггер, invalidation, цели, risk note и outcome tracking."],
              ["Журнал + скриншоты", "Сохраняй каждую сделку с контекстом, скриншотами, эмоциями, ошибками, уроками и заметками."],
              ["Отчёты", "Превращай сделки в структурный feedback: PnL, win rate, ошибки, лучшие сетапы и выводы."],
            ],
            workflow: [
              ["01", "Scan", "Найти активные тикеры и рыночный контекст."],
              ["02", "Validate", "Проверить катализатор, объём, структуру и риск."],
              ["03", "Plan", "Определить триггер, зону входа, стоп и цели."],
              ["04", "Execute", "Торговать с более чётким планом."],
              ["05", "Review", "Связать результат обратно с журналом."],
            ],
            bullets: [
              "Меньше случайных входов",
              "Чище решения по риску",
              "Сильнее post-trade review",
              "Личное преимущество из твоих данных",
            ],
          };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.38 }}
      className="mx-auto w-full max-w-[1700px] space-y-7 px-4 pb-28 pt-8 sm:px-6 lg:px-10 xl:px-14"
    >
      <section className="relative overflow-hidden rounded-[3.1rem] border border-white/14 bg-[#0F172A]/90 p-5 shadow-[0_38px_150px_rgba(0,0,0,0.30)] backdrop-blur-2xl md:p-7 lg:p-10">
  <video
    src="/media/desk-preview.mp4"
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    className="absolute left-0 top-1/2 h-[86%] w-full -translate-y-1/2 object-cover object-center opacity-[0.42] saturate-[0.95] contrast-[1.12] brightness-[0.92]"
  />

  <div className="absolute inset-0 bg-[#07111F]/34" />
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(0,192,118,0.16),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(200,169,107,0.12),transparent_30%),linear-gradient(90deg,rgba(3,7,18,0.82),rgba(3,7,18,0.52)_48%,rgba(3,7,18,0.22)_100%)]" />
  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.032)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:66px_66px] opacity-18" />

  <motion.div
    aria-hidden
    animate={{ x: ["-20%", "120%"] }}
    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/55 to-transparent"
  />

  <div className="relative z-10 flex min-h-[560px] items-center py-8 md:min-h-[610px] lg:py-10">
    <div className="max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45 }}
        className="inline-flex rounded-full border border-[#C8A96B]/18 bg-[#C8A96B]/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#E6EDF7]/76 backdrop-blur-xl"
      >
        {copy.eyebrow}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.6 }}
        className="mt-6 max-w-4xl text-4xl font-black leading-[0.9] tracking-[-0.075em] text-white md:text-4xl xl:text-7xl"
      >
        {copy.title}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, duration: 0.55 }}
        className="mt-7 max-w-2xl text-base font-semibold leading-8 text-white/68 md:text-lg"
      >
        {copy.text}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: 0.5 }}
        className="mt-9 flex flex-wrap gap-3"
      >
        <button
          type="button"
          onClick={() => setActive("pricing")}
          className="group relative overflow-hidden rounded-full border border-white/20 bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076] px-7 py-3.5 text-sm font-black text-[#07111F] shadow-[0_18px_70px_rgba(0,192,118,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(0,192,118,0.26)]"
        >
          <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-white/70 blur-md transition duration-700 group-hover:left-[120%]" />
          <span className="relative">{copy.primary} →</span>
        </button>

        <button
          type="button"
          onClick={() => setActive("product")}
          className="rounded-full border border-[#C8A96B]/22 bg-[#C8A96B]/[0.07] px-7 py-3.5 text-sm font-black text-[#E6EDF7] transition duration-300 hover:-translate-y-0.5 hover:bg-[#C8A96B]/[0.12]"
        >
          {copy.secondary}
          <span className="ml-2">↗</span>
        </button>
      </motion.div>

      <div className="mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
        {copy.bullets.map((item, index) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 + index * 0.08, duration: 0.42 }}
            className="rounded-2xl border border-white/10 bg-[#07111F]/54 px-4 py-3 text-sm font-black text-white/74 backdrop-blur-xl"
          >
            <span className="mr-2 text-[#C8A96B]">✓</span>
            {item}
          </motion.div>
        ))}
      </div>
    </div>
  </div>
</section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {copy.cards.map((card, index) => (
          <motion.button
            key={card[0]}
            type="button"
            onClick={() => {
              if (index === 1) {
                window.location.href = "/ai-guide";
                return;
              }

              if (index === 2) {
                window.location.href = "/journal-guide";
                return;
              }

              setActive("product");
            }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.08, duration: 0.45 }}
            className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-left shadow-[0_26px_100px_rgba(0,0,0,0.20)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[#C8A96B]/26 hover:bg-[#C8A96B]/[0.07]"
          >
            <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-[#00C076]/0 blur-3xl transition duration-500 group-hover:bg-[#00C076]/14" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C8A96B]/16 bg-[#C8A96B]/[0.08] text-sm font-black text-[#E6EDF7]">
                0{index + 1}
              </div>
              <h3 className="mt-6 text-xl font-black text-white">{card[0]}</h3>
              <p className="mt-3 text-sm font-semibold leading-7 text-white/55">{card[1]}</p>
              <div className="mt-6 inline-flex rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-white/62 transition group-hover:border-[#C8A96B]/28 group-hover:text-[#E6EDF7]">
                Explore <span className="ml-2">→</span>
              </div>
            </div>
          </motion.button>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-[#C8A96B]/12 bg-[#0F172A]/82 p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(0,192,118,0.14),transparent_32%),radial-gradient(circle_at_12%_90%,rgba(16,185,129,0.12),transparent_34%)]" />

        <div className="relative grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
          <div>
            <Badge>{copy.workflowTitle}</Badge>
            <h2 className="mt-6 text-4xl font-black leading-tight text-white md:text-4xl">
              {copy.outcomeTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/58">
              {copy.outcomeText}
            </p>
          </div>

          <div className="grid gap-3">
            {copy.workflow.map((step, index) => (
              <motion.div
                key={step[0]}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.07, duration: 0.42 }}
                className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[80px_160px_1fr] md:items-center"
              >
                <div className="text-sm font-black text-[#E6EDF7]/65">{step[0]}</div>
                <div className="text-lg font-black text-white">{step[1]}</div>
                <div className="text-sm font-semibold leading-6 text-white/52">{step[2]}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,192,118,0.13),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(200,169,107,0.10),transparent_34%)]" />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-4xl font-black tracking-[-0.05em] text-white md:text-4xl">
            {copy.finalTitle}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/58 md:text-base">
            {copy.finalText}
          </p>

          <button
            type="button"
            onClick={() => setActive("pricing")}
            className="group relative mt-6 overflow-hidden rounded-full border border-white/20 bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076] px-8 py-4 text-sm font-black text-[#07111F] shadow-[0_18px_70px_rgba(0,192,118,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(0,192,118,0.26)]"
          >
            <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-white/70 blur-md transition duration-700 group-hover:left-[120%]" />
            <span className="relative">{copy.primary} →</span>
          </button>
        </div>
      </section>
    </motion.div>
  );
}

function ProductBuiltForTradersBlock({ lang }: { lang: string }) {
  const copy =
    lang === "EN"
      ? {
          eyebrow: "Built from zero for trading",
          title: "Not another AI chat. A full trading product built around execution.",
          text:
            "SkillEdge AI is a dedicated AI Trading Desk created for real trading workflow: market context, journal, screenshots, AI review, reports, scanner, alerts and performance feedback in one connected system.",
          second:
            "A generic AI tool only answers the question you type. SkillEdge AI is different: it works around your process. Every trade, screenshot, setup, mistake and report becomes part of your personal trading context.",
          third:
            "That is why SkillEdge AI cannot be replaced by a free tool. It is not a prompt box. It is a structured product built by specialists in AI engineering, software development and trading workflow design to help traders build discipline, understand risk and improve execution quality.",
          chips: [
            "Journal + screenshots",
            "AI trade review",
            "Market Intelligence",
            "AI Alerts",
            "Reports",
            "Personal trading context",
          ],
        }
      : lang === "UA"
        ? {
            eyebrow: "Створено з нуля під трейдинг",
            title: "Не черговий AI-чат. Повноцінний trading product навколо виконання.",
            text:
              "SkillEdge AI — це окремий AI Trading Desk, створений під реальний процес трейдера: ринковий контекст, журнал, скріншоти, AI-розбір, звіти, сканер, сигнали та feedback по виконанню в одній системі.",
            second:
              "Звичайний AI-інструмент відповідає тільки на запит. SkillEdge AI працює інакше: він будується навколо твого процесу. Кожна угода, скріншот, сетап, помилка й звіт стають частиною твого особистого trading context.",
            third:
              "Саме тому SkillEdge AI не замінюється безкоштовним інструментом. Це не поле для промптів. Це структурований продукт, створений спеціалістами з AI engineering, software development і trading workflow, щоб допомагати трейдеру будувати дисципліну, бачити ризик і покращувати якість виконання.",
            chips: [
              "Журнал + скріншоти",
              "AI-розбір угод",
              "Market Intelligence",
              "AI Alerts",
              "Звіти",
              "Особистий trading context",
            ],
          }
        : {
            eyebrow: "Создано с нуля под трейдинг",
            title: "Не очередной AI-чат, а полноценный trading product вокруг исполнения.",
            text:
              "SkillEdge AI — это отдельный AI Trading Desk, созданный под реальный процесс трейдера: рыночный контекст, журнал, скриншоты, AI-разбор, отчёты, сканер, сигналы и feedback по исполнению в одной системе.",
            second:
              "Обычный AI-инструмент отвечает только на вопрос, который ему задали. SkillEdge AI работает иначе: он строится вокруг торгового процесса. Каждая сделка, каждый скриншот, каждый сетап, каждая ошибка и каждый отчёт становятся частью личного trading context трейдера.",
            third:
              "Именно поэтому SkillEdge AI нельзя заменить бесплатным инструментом. Это не поле для промптов. Это структурированный продукт, созданный специалистами в AI engineering, software development и trading workflow, чтобы помогать трейдеру строить дисциплину, видеть риск и улучшать качество исполнения.",
            chips: [
              "Журнал + скриншоты",
              "AI-разбор сделок",
              "Market Intelligence",
              "AI Alerts",
              "Отчёты",
              "Личный trading context",
            ],
          };

  return (
    <section className="relative overflow-hidden rounded-[2.8rem] border border-[#C8A96B]/12 bg-[#0F172A]/82 p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.16),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(200,169,107,0.12),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.055),transparent_44%)]" />

      <motion.div
        aria-hidden
        animate={{ x: ["-20%", "120%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/55 to-transparent"
      />

      <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <div className="inline-flex rounded-full border border-[#C8A96B]/18 bg-[#C8A96B]/[0.075] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#E6EDF7]/76">
            {copy.eyebrow}
          </div>

          <h2 className="mt-6 max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.055em] text-white md:text-4xl">
            {copy.title}
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold leading-7 text-white/62">
            {copy.text}
          </p>

          <p className="text-sm font-semibold leading-7 text-white/56">
            {copy.second}
          </p>

          <p className="rounded-[1.5rem] border border-[#C8A96B]/12 bg-[#C8A96B]/[0.055] p-4 text-sm font-semibold leading-7 text-[#E6EDF7]/70">
            {copy.third}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {copy.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/54"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductStrategyCreationBlock({
  lang,
  setActive,
}: {
  lang: string;
  setActive: (value: PageKey) => void;
}) {
  const copy =
    lang === "EN"
      ? {
          eyebrow: "Signature feature",
          title: "Create a real trading strategy, not another note in a document.",
          text:
            "Strategy OS turns a trader’s idea into a living playbook: setup logic, rules, evidence, before-trade gate, after-trade debrief, versions and measurable trust score.",
          punch:
            "This is the reason Edge becomes a professional workspace: the trader stops jumping between random ideas and starts building one repeatable decision system.",
          primary: "Unlock Strategy OS",
          secondary: "Open dashboard guide",
          center: "Strategy Builder",
          score: "Strategy Trust",
          proof: [
            ["Setup Library", "Choose a professional setup path or create a custom strategy."],
            ["Evidence Locker", "Save screenshots and examples that prove the setup actually exists."],
            ["Before-Trade Gate", "Force every trade through rules, risk and invalidation before entry."],
            ["Version Upgrades", "Improve v1 → v2 → v3 based on journal, reports and outcomes."],
          ],
          loop: [
            ["01", "Choose setup", "Pick the market behavior you want to master."],
            ["02", "Define rules", "Context, trigger, entry, stop, targets, avoid conditions."],
            ["03", "Collect evidence", "Build proof from screenshots, trades and missed setups."],
            ["04", "Trade the playbook", "Use gates, debriefs and reports to improve the version."],
          ],
          outcomes: ["Less chaos", "Cleaner execution", "Repeatable playbook", "Personal Edge"],
        }
      : lang === "UA"
        ? {
            eyebrow: "Ключова функція",
            title: "Створи реальну торгову стратегію, а не чергову нотатку в документі.",
            text:
              "Strategy OS перетворює ідею трейдера на живий playbook: логіка setup, правила, evidence, before-trade gate, after-trade debrief, версії та вимірюваний trust score.",
            punch:
              "Саме тому Edge стає професійним workspace: трейдер перестає стрибати між випадковими ідеями й починає будувати одну повторювану систему рішень.",
            primary: "Відкрити Strategy OS",
            secondary: "Відкрити гайд кабінету",
            center: "Strategy Builder",
            score: "Strategy Trust",
            proof: [
              ["Setup Library", "Обери професійний setup path або створи власну стратегію."],
              ["Evidence Locker", "Зберігай скріншоти й приклади, які доводять, що setup реально існує."],
              ["Before-Trade Gate", "Пропускай кожну угоду через правила, ризик та invalidation до входу."],
              ["Version Upgrades", "Покращуй v1 → v2 → v3 на основі журналу, звітів і outcomes."],
            ],
            loop: [
              ["01", "Обери setup", "Вибери ринкову поведінку, яку хочеш довести до майстерності."],
              ["02", "Опиши правила", "Context, trigger, entry, stop, targets, avoid conditions."],
              ["03", "Збери evidence", "Створи доказову базу зі скріншотів, угод і missed setups."],
              ["04", "Торгуй playbook", "Використовуй gates, debriefs і reports для покращення версії."],
            ],
            outcomes: ["Менше хаосу", "Чистіше виконання", "Повторюваний playbook", "Personal Edge"],
          }
        : {
            eyebrow: "Ключевая функция",
            title: "Создай реальную торговую стратегию, а не очередную заметку в документе.",
            text:
              "Strategy OS превращает идею трейдера в живой playbook: логика setup, правила, evidence, before-trade gate, after-trade debrief, версии и измеримый trust score.",
            punch:
              "Именно поэтому Edge становится профессиональным workspace: трейдер перестаёт прыгать между случайными идеями и начинает строить одну повторяемую систему решений.",
            primary: "Открыть Strategy OS",
            secondary: "Открыть гайд кабинета",
            center: "Strategy Builder",
            score: "Strategy Trust",
            proof: [
              ["Setup Library", "Выбери профессиональный setup path или создай собственную стратегию."],
              ["Evidence Locker", "Сохраняй скриншоты и примеры, которые доказывают, что setup реально существует."],
              ["Before-Trade Gate", "Пропускай каждую сделку через правила, риск и invalidation до входа."],
              ["Version Upgrades", "Улучшай v1 → v2 → v3 на основе журнала, отчётов и outcomes."],
            ],
            loop: [
              ["01", "Выбери setup", "Определи рыночное поведение, которое хочешь довести до мастерства."],
              ["02", "Опиши правила", "Context, trigger, entry, stop, targets, avoid conditions."],
              ["03", "Собери evidence", "Построй доказательную базу из скриншотов, сделок и missed setups."],
              ["04", "Торгуй playbook", "Используй gates, debriefs и reports для улучшения версии."],
            ],
            outcomes: ["Меньше хаоса", "Чище execution", "Повторяемый playbook", "Personal Edge"],
          };

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[#C8A96B]/24 bg-[#0F172A]/88 p-5 shadow-[0_38px_160px_rgba(0,0,0,0.30)] backdrop-blur-2xl md:p-7 lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(200,169,107,0.18),transparent_31%),radial-gradient(circle_at_86%_14%,rgba(0,192,118,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_42%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C8A96B]/70 to-transparent" />

      <motion.div
        aria-hidden
        animate={{ x: ["-20%", "120%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/65 to-transparent"
      />

      <div className="relative grid gap-7 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
        <div>
          <div className="inline-flex rounded-full border border-[#C8A96B]/24 bg-[#C8A96B]/[0.09] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#E6EDF7]/80">
            {copy.eyebrow}
          </div>

          <h2 className="mt-5 max-w-3xl text-3xl font-black leading-[0.96] tracking-[-0.055em] text-white md:text-4xl">
            {copy.title}
          </h2>

          <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/62">
            {copy.text}
          </p>

          <p className="mt-4 rounded-[1.4rem] border border-[#00C076]/18 bg-[#00D084]/[0.07] p-4 text-sm font-black leading-7 text-[#DFFFEF]/80">
            {copy.punch}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActive("pricing")}
              className="group relative overflow-hidden rounded-full bg-white px-6 py-3.5 text-sm font-black text-[#07111F] shadow-[0_18px_70px_rgba(255,255,255,0.17)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_26px_100px_rgba(0,192,118,0.24)]"
            >
              <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-[#00D084]/45 blur-md transition duration-700 group-hover:left-[120%]" />
              <span className="relative">{copy.primary} →</span>
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/dashboard-guide";
              }}
              className="rounded-full border border-[#C8A96B]/24 bg-[#C8A96B]/[0.075] px-6 py-3.5 text-sm font-black text-[#E6EDF7] transition duration-300 hover:-translate-y-0.5 hover:bg-[#C8A96B]/[0.13]"
            >
              {copy.secondary}
              <span className="ml-2">↗</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[2.2rem] bg-[#00C076]/10 blur-3xl" />

          <div className="relative overflow-hidden rounded-[2.1rem] border border-white/12 bg-[#07111F]/72 p-4 shadow-[0_28px_120px_rgba(0,0,0,0.28)]">
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.75rem] border border-[#C8A96B]/16 bg-[#C8A96B]/[0.065] p-5">
                <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border border-white/10 bg-[conic-gradient(from_120deg,rgba(0,192,118,0.92)_0deg,rgba(200,169,107,0.86)_246deg,rgba(255,255,255,0.08)_247deg_360deg)] p-3 shadow-[0_0_80px_rgba(0,192,118,0.18)]">
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#07111F] text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                      {copy.score}
                    </div>
                    <div className="mt-1 text-4xl font-black tracking-[-0.05em] text-white">
                      82
                    </div>
                    <div className="text-[10px] font-black text-[#00D084]">
                      EDGE READY
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center text-xl font-black text-white">
                  {copy.center}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {copy.outcomes.map((item: string) => (
                    <div
                      key={item}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center text-[11px] font-black text-white/62"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                {copy.loop.map((item: any, index: number) => {
                  const [number, title, text] = item;

                  return (
                    <motion.div
                      key={number}
                      initial={{ opacity: 0, x: 18 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-80px" }}
                      transition={{ delay: index * 0.06, duration: 0.42 }}
                      className="grid grid-cols-[54px_1fr] gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-3"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C8A96B]/16 bg-[#C8A96B]/[0.08] text-xs font-black text-[#E6EDF7]">
                        {number}
                      </div>

                      <div>
                        <div className="text-sm font-black text-white">{title}</div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-white/48">
                          {text}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {copy.proof.map((item: any) => {
                const [title, text] = item;

                return (
                  <div
                    key={title}
                    className="rounded-[1.25rem] border border-white/10 bg-black/18 p-3"
                  >
                    <div className="text-sm font-black text-white">{title}</div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const p = t.productPage;

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }} className="space-y-24 pt-8">
      <HeroSection
        badge={p.heroBadge}
        title={p.heroTitle}
        text={p.heroText}
        primary={p.ctaPrimary}
        secondary={p.ctaSecondary}
        onPrimary={() => setActive("pricing")}
        onSecondary={() => setActive("team")}
        cards={p.heroCards}
      />

<ProductBuiltForTradersBlock lang={t.lang} />

      <ProductStrategyCreationBlock lang={t.lang} setActive={setActive} />

      <section>
        <SectionTitle eyebrow="AI Trading Desk" title={p.deskTitle} text={p.deskText} />
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {p.deskCards.map(([title, text]: [string, string], index: number) => (
            <InfoCard key={title} title={title} text={text} index={index} />
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <Badge>{p.flowEyebrow}</Badge>
          <h2 className="mt-6 text-4xl font-semibold leading-tight text-white md:text-4xl">{p.flowTitle}</h2>
          <p className="mt-5 text-base leading-8 text-white/62">{p.flowText}</p>
        </div>

        <div className="space-y-4">
          {p.flow.map(([step, title, text]: [string, string, string], index: number) => (
            <StepCard key={step} step={step} title={title} text={text} index={index} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={p.modulesEyebrow} title={p.modulesTitle} text={p.modulesText} />
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {p.modules.map(([title, text, items]: [string, string, string[]], index: number) => (
            <ModuleCard key={title} title={title} text={text} items={items} index={index} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow={p.differentEyebrow} title={p.differentTitle} text={p.differentText} />
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {p.comparisons.map(([title, weak, strong]: [string, string, string], index: number) => (
            <ComparisonCard key={title} title={title} weak={weak} strong={strong} index={index} />
          ))}
        </div>
      </section>

      <FinalCta title={p.finalTitle} text={p.finalText} checklist={p.finalChecklist} button={p.ctaPrimary} onClick={() => setActive("pricing")} />
    </motion.div>
  );
}


function getPricingShowcaseCopy(lang: string) {
  if (lang === "EN") {
    return {
      heroBadge: "Premium access board",
      heroTitle: "Choose the SkillEdge AI level that matches your trading process.",
      heroText:
        "Core gives structure. Edge adds market intelligence. Elite unlocks the full AI Trading Desk with alerts, signal workflow and outcome review.",
      billingTitle: "Choose billing period",
      billingText:
        "Monthly is flexible. Longer periods are better for building a real review habit and tracking progress over time.",
      paymentNotes: [
        "Card payment is being prepared",
      ],
      period: {
        monthly: "/ month",
        halfyear: "/ 6 months",
        yearly: "/ year",
      },
      billingOptions: [
        ["monthly", "1 month", "flexible"],
        ["halfyear", "6 months", "commit"],
        ["yearly", "1 year", "best value"],
      ],
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          badge: "Start with discipline",
          price: { monthly: 49, halfyear: 249, yearly: 399 },
          headline: "For traders who need structure first.",
          text:
            "Build the foundation: journal, screenshots, AI Coach, exports and a cleaner review process.",
          bestFor: "Best for journaling discipline and basic AI review.",
          cta: "Start with Core",
          features: [
            "Trade journal",
            "Screenshots",
            "AI Coach",
            "Basic journal analysis",
            "Chart analysis foundation",
            "CSV / XLSX export",
          ],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          badge: "Active trader",
          price: { monthly: 99, halfyear: 499, yearly: 799 },
          headline: "For active traders who need market context.",
          text:
            "Add market intelligence, AI Scanner, deeper reports and stronger review for active trading.",
          bestFor: "Best for traders who actively review setups and mistakes.",
          cta: "Upgrade to Edge",
          features: [
            "Everything in Core",
            "Strategy OS: build your own trading strategy",
            "Market Intelligence",
            "AI Scanner",
            "AI Market Brief",
            "Advanced reports",
            "Higher AI limits",
          ],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          badge: "Full AI Trading Desk",
          price: { monthly: 149, halfyear: 749, yearly: 1249 },
          headline: "For serious traders who want the full signal workflow.",
          text:
            "Unlock AI Alerts, floating alert widget, Signal-to-Journal, decision tracking and outcome learning.",
          bestFor: "Best for traders who want alerts, journal sync and outcome review.",
          cta: "Unlock Elite",
          features: [
            "Everything in Edge",
            "AI Alerts",
            "Floating alerts widget",
            "Signal-to-Journal",
            "Outcome tracking",
            "Maximum AI limits",
          ],
        },
      ],
      elite: {
        eyebrow: "Elite spotlight",
        title: "The full AI Trading Desk.",
        text:
          "Elite is built for traders who want actionable alerts, structured risk, signal-to-journal workflow and measurable outcome review.",
        button: "Unlock Elite",
        bullets: [
          "Real-time AI Alerts",
          "Setup + trigger + invalidation",
          "Signal-to-Journal workflow",
          "Outcome learning",
        ],
      },
      signal: {
        eyebrow: "Signal quality",
        title: "Signals should teach the trader, not make them click blindly.",
        text:
          "SkillEdge alerts are structured trade ideas: setup, trigger, entry zone, stop, targets, RR, risk and invalidation.",
        cards: [
          [
            "No blind calls",
            "A ticker is not a trade until setup, trigger, stop and RR are clear.",
          ],
          [
            "No chase",
            "If the move is extended and entry is late, the idea must be downgraded.",
          ],
          [
            "Signal-to-Journal",
            "A taken alert can become a trade draft for plan vs execution review.",
          ],
          [
            "Outcome learning",
            "Taken, missed and skipped alerts become feedback for the trader.",
          ],
        ],
      },
      comparison: {
        eyebrow: "Access matrix",
        title: "Compare plans by workflow depth.",
        text:
          "Each plan adds a deeper layer: structure, market intelligence, then the full signal workflow.",
        headers: ["Feature", "Core", "Edge", "Elite"],
        rows: [
          ["Journal + screenshots", "Yes", "Yes", "Yes"],
          ["AI Coach", "Basic", "Advanced", "Elite"],
          ["Journal analysis", "Limited", "Expanded", "Maximum"],
          ["Chart analysis", "Foundation", "Advanced", "Premium"],
          ["AI Reports", "Basic", "Advanced", "Elite"],
          ["Strategy OS", "—", "Strategy Builder + Setup Academy", "Strategy OS + Signals workflow"],
          ["Personal Edge Engine", "—", "Trading DNA + personal rules", "Trading DNA + signal feedback"],
          ["Market Intelligence", "—", "Yes", "Yes"],
          ["AI Scanner", "—", "Yes", "Yes"],
          ["AI Alerts", "—", "—", "Yes"],
          ["Signal-to-Journal", "—", "—", "Yes"],
          ["Outcome tracking", "—", "—", "Yes"],
        ],
      },
      recommendation: {
        eyebrow: "Clean recommendation",
        title: "Choose by process depth, not hype.",
        text:
          "Start where your workflow is today. Upgrade when you are ready for market intelligence and the full alert loop.",
        disclaimer:
          "SkillEdge AI is not financial advice and does not guarantee profits. It is built to improve structure, review, decision quality and trading process.",
        items: [
          ["Choose Core", "You need structure, journal discipline and basic AI review."],
          ["Choose Edge", "You actively trade and need scanner intelligence plus deeper analysis."],
          ["Choose Elite", "You want AI Alerts, Signal-to-Journal and outcome learning."],
        ],
      },
      labels: {
        bestFor: "Best for",
        included: "Included",
        checkout: "Checkout status",
      },
    };
  }

  if (lang === "UA") {
    return {
      heroBadge: "Premium access board",
      heroTitle: "Обери рівень SkillEdge AI під свій торговий процес.",
      heroText:
        "Core дає структуру. Edge додає market intelligence. Elite відкриває повний AI Trading Desk із сигналами, журналом і розбором результатів.",
      billingTitle: "Обери період оплати",
      billingText:
        "Місячна оплата гнучка. Довші періоди краще підходять для звички review і відстеження прогресу.",
      paymentNotes: [
      ],
      period: {
        monthly: "/ місяць",
        halfyear: "/ 6 місяців",
        yearly: "/ рік",
      },
      billingOptions: [
        ["monthly", "1 місяць", "гнучко"],
        ["halfyear", "6 місяців", "дисципліна"],
        ["yearly", "1 рік", "краща цінність"],
      ],
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          badge: "Почни з дисципліни",
          price: { monthly: 49, halfyear: 249, yearly: 399 },
          headline: "Для трейдера, якому спочатку потрібна структура.",
          text:
            "Побудуй основу: журнал, скріншоти, AI Coach, експорт і чистіший процес розбору.",
          bestFor: "Найкраще для дисципліни журналу та базового AI review.",
          cta: "Почати з Core",
          features: [
            "Журнал угод",
            "Скріншоти",
            "AI Coach",
            "Базовий аналіз журналу",
            "Базовий аналіз графіків",
            "CSV / XLSX експорт",
          ],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          badge: "Активний трейдер",
          price: { monthly: 99, halfyear: 499, yearly: 799 },
          headline: "Для активного трейдера, якому потрібен ринковий контекст.",
          text:
            "Додає market intelligence, AI Scanner, глибші звіти та сильніший review для активної торгівлі.",
          bestFor: "Найкраще для трейдерів, які серйозно розбирають сетапи й помилки.",
          cta: "Перейти на Edge",
          features: [
            "Усе з Core",
          "Strategy OS: створення власної торгової стратегії",
            "Market Intelligence",
            "AI Scanner",
            "AI Market Brief",
            "Advanced reports",
            "Вищі AI-ліміти",
          ],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          badge: "Повний AI Trading Desk",
          price: { monthly: 149, halfyear: 749, yearly: 1249 },
          headline: "Для серйозних трейдерів, яким потрібен повний signal workflow.",
          text:
            "Відкриває AI Alerts, floating alert widget, Signal-to-Journal, decision tracking і outcome learning.",
          bestFor: "Найкраще для сигналів, синхронізації з журналом і розбору результатів.",
          cta: "Відкрити Elite",
          features: [
            "Усе з Edge",
            "AI Alerts",
            "Floating alerts widget",
            "Signal-to-Journal",
            "Outcome tracking",
            "Максимальні AI-ліміти",
          ],
        },
      ],
      elite: {
        eyebrow: "Elite spotlight",
        title: "Повний AI Trading Desk.",
        text:
          "Elite створений для трейдерів, яким потрібні actionable alerts, структурований ризик, Signal-to-Journal і вимірюваний outcome review.",
        button: "Відкрити Elite",
        bullets: [
          "Real-time AI Alerts",
          "Сетап + тригер + invalidation",
          "Signal-to-Journal workflow",
          "Outcome learning",
        ],
      },
      signal: {
        eyebrow: "Якість сигналів",
        title: "Сигнали мають навчати трейдера, а не змушувати сліпо клікати.",
        text:
          "SkillEdge alerts — це структуровані торгові ідеї: сетап, тригер, зона входу, стоп, цілі, RR, ризик та invalidation.",
        cards: [
          [
            "Не сліпі команди",
            "Тікер не стає угодою, поки немає сетапу, тригера, стопа й RR.",
          ],
          [
            "No chase",
            "Якщо рух розтягнутий і вхід пізній, ідея має бути знижена в якості.",
          ],
          [
            "Signal-to-Journal",
            "Взятий alert може стати чернеткою угоди для розбору плану й виконання.",
          ],
          [
            "Outcome learning",
            "Взяті, пропущені та missed alerts стають feedback для трейдера.",
          ],
        ],
      },
      comparison: {
        eyebrow: "Матриця доступу",
        title: "Порівняй тарифи за глибиною workflow.",
        text:
          "Кожен тариф додає глибший шар: структура, market intelligence, потім повний signal workflow.",
        headers: ["Функція", "Core", "Edge", "Elite"],
        rows: [
          ["Журнал + скріншоти", "Так", "Так", "Так"],
          ["AI Coach", "Базовий", "Advanced", "Elite"],
          ["Аналіз журналу", "Лімітований", "Розширений", "Максимальний"],
          ["Аналіз графіків", "Базовий", "Advanced", "Premium"],
          ["AI Reports", "Базові", "Advanced", "Elite"],
          ["Strategy OS", "—", "Strategy Builder + Setup Academy", "Strategy OS + Signals workflow"],
        ["Personal Edge Engine", "—", "Trading DNA + особисті правила", "Trading DNA + feedback по сигналах"],
        ["Market Intelligence", "—", "Так", "Так"],
          ["AI Scanner", "—", "Так", "Так"],
          ["AI Alerts", "—", "—", "Так"],
          ["Signal-to-Journal", "—", "—", "Так"],
          ["Outcome tracking", "—", "—", "Так"],
        ],
      },
      recommendation: {
        eyebrow: "Чиста рекомендація",
        title: "Обирай за глибиною процесу, а не за хайпом.",
        text:
          "Почни з того рівня, де зараз твій workflow. Підвищуй тариф, коли потрібні market intelligence і повний alert loop.",
        disclaimer:
          "SkillEdge AI не є фінансовою порадою і не гарантує прибуток. Платформа створена для покращення структури, review, якості рішень і торгового процесу.",
        items: [
          ["Обирай Core", "Потрібна структура, дисципліна журналу та базовий AI review."],
          ["Обирай Edge", "Ти активно торгуєш і хочеш scanner intelligence та глибший аналіз."],
          ["Обирай Elite", "Потрібні AI Alerts, Signal-to-Journal і outcome learning."],
        ],
      },
      labels: {
        bestFor: "Кому підходить",
        included: "Що входить",
        checkout: "Статус оплати",
      },
    };
  }

  return {
    heroBadge: "Premium access board",
    heroTitle: "Выбери уровень SkillEdge AI под свой торговый процесс.",
    heroText:
      "Core даёт структуру. Edge добавляет market intelligence. Elite открывает полный AI Trading Desk с сигналами, журналом и разбором результатов.",
    billingTitle: "Выбери период оплаты",
    billingText:
      "Месячная оплата гибкая. Длинные периоды лучше подходят для привычки review и отслеживания прогресса.",
    paymentNotes: [
    ],
    period: {
      monthly: "/ месяц",
      halfyear: "/ 6 месяцев",
      yearly: "/ год",
    },
    billingOptions: [
      ["monthly", "1 месяц", "гибко"],
      ["halfyear", "6 месяцев", "дисциплина"],
      ["yearly", "1 год", "лучшая ценность"],
    ],
    plans: [
      {
        id: "starter",
        name: "SkillEdge Core",
        badge: "Начни с дисциплины",
        price: { monthly: 49, halfyear: 249, yearly: 399 },
        headline: "Для трейдера, которому сначала нужна структура.",
        text:
          "Построй основу: журнал, скриншоты, AI Coach, экспорт и более чистый процесс разбора.",
        bestFor: "Лучше всего для дисциплины журнала и базового AI review.",
        cta: "Начать с Core",
        features: [
          "Журнал сделок",
          "Скриншоты",
          "AI Coach",
          "Базовый анализ журнала",
          "Базовый анализ графиков",
          "CSV / XLSX экспорт",
        ],
      },
      {
        id: "pro",
        name: "SkillEdge Edge",
        badge: "Активный трейдер",
        price: { monthly: 99, halfyear: 499, yearly: 799 },
        headline: "Для активного трейдера, которому нужен рыночный контекст.",
        text:
          "Добавляет market intelligence, AI Scanner, более глубокие отчёты и сильный review для активной торговли.",
        bestFor: "Лучше всего для трейдеров, которые серьёзно разбирают сетапы и ошибки.",
        cta: "Перейти на Edge",
        features: [
          "Всё из Core",
          "Strategy OS: создание собственной стратегии",
          "Market Intelligence",
          "AI Scanner",
          "AI Market Brief",
          "Advanced reports",
          "Повышенные AI-лимиты",
        ],
      },
      {
        id: "elite",
        name: "SkillEdge Elite",
        badge: "Полный AI Trading Desk",
        price: { monthly: 149, halfyear: 749, yearly: 1249 },
        headline: "Для серьёзных трейдеров, которым нужен полный signal workflow.",
        text:
          "Открывает AI Alerts, floating alert widget, Signal-to-Journal, decision tracking и outcome learning.",
        bestFor: "Лучше всего для сигналов, синхронизации с журналом и разбора результатов.",
        cta: "Открыть Elite",
        features: [
          "Всё из Edge",
          "AI Alerts",
          "Floating alerts widget",
          "Signal-to-Journal",
          "Outcome tracking",
          "Максимальные AI-лимиты",
        ],
      },
    ],
    elite: {
      eyebrow: "Elite spotlight",
      title: "Полный AI Trading Desk.",
      text:
        "Elite создан для трейдеров, которым нужны actionable alerts, структурированный риск, Signal-to-Journal и измеримый outcome review.",
      button: "Открыть Elite",
      bullets: [
        "Real-time AI Alerts",
        "Сетап + триггер + invalidation",
        "Signal-to-Journal workflow",
        "Outcome learning",
      ],
    },
    signal: {
      eyebrow: "Качество сигналов",
      title: "Сигналы должны обучать трейдера, а не заставлять слепо кликать.",
      text:
        "SkillEdge alerts — это структурированные торговые идеи: сетап, триггер, зона входа, стоп, цели, RR, риск и invalidation.",
      cards: [
        [
          "Не слепые команды",
          "Тикер не становится сделкой, пока нет сетапа, триггера, стопа и RR.",
        ],
        [
          "No chase",
          "Если движение растянуто и вход поздний, идея должна быть снижена в качестве.",
        ],
        [
          "Signal-to-Journal",
          "Взятый alert может стать черновиком сделки для разбора плана и исполнения.",
        ],
        [
          "Outcome learning",
          "Взятые, пропущенные и missed alerts становятся feedback для трейдера.",
        ],
      ],
    },
    comparison: {
      eyebrow: "Матрица доступа",
      title: "Сравни тарифы по глубине workflow.",
      text:
        "Каждый тариф добавляет более глубокий слой: структура, market intelligence, затем полный signal workflow.",
      headers: ["Функция", "Core", "Edge", "Elite"],
      rows: [
        ["Журнал + скриншоты", "Да", "Да", "Да"],
        ["AI Coach", "Базовый", "Advanced", "Elite"],
        ["Анализ журнала", "Лимитированный", "Расширенный", "Максимальный"],
        ["Анализ графиков", "Базовый", "Advanced", "Premium"],
        ["AI Reports", "Базовые", "Advanced", "Elite"],
        ["Strategy OS", "—", "Strategy Builder + Setup Academy", "Strategy OS + Signals workflow"],
        ["Personal Edge Engine", "—", "Trading DNA + личные правила", "Trading DNA + feedback по сигналам"],
        ["Market Intelligence", "—", "Да", "Да"],
        ["AI Scanner", "—", "Да", "Да"],
        ["AI Alerts", "—", "—", "Да"],
        ["Signal-to-Journal", "—", "—", "Да"],
        ["Outcome tracking", "—", "—", "Да"],
      ],
    },
    recommendation: {
      eyebrow: "Чистая рекомендация",
      title: "Выбирай по глубине процесса, а не по хайпу.",
      text:
        "Начни с того уровня, где сейчас твой workflow. Повышай тариф, когда нужны market intelligence и полный alert loop.",
      disclaimer:
        "SkillEdge AI не является финансовой рекомендацией и не гарантирует прибыль. Платформа создана для улучшения структуры, review, качества решений и торгового процесса.",
      items: [
        ["Выбирай Core", "Нужна структура, дисциплина журнала и базовый AI review."],
        ["Выбирай Edge", "Ты активно торгуешь и хочешь scanner intelligence и более глубокий анализ."],
        ["Выбирай Elite", "Нужны AI Alerts, Signal-to-Journal и outcome learning."],
      ],
    },
    labels: {
      bestFor: "Кому подходит",
      included: "Что входит",
      checkout: "Статус оплаты",
    },
  };
}

function PricingValueBlock({ lang }: { lang: string }) {
  const copy =
    lang === "EN"
      ? {
          eyebrow: "Institutional-grade trading infrastructure",
          title: "Not another empty shell, but a working tool that turns market context, trades and mistakes into a controlled system.",
          text:
            "SkillEdge AI connects journal, screenshots, Strategy OS, Personal Edge, Market Intelligence, AI Scanner, Reports and Elite Alerts into one premium trading desk — so every decision moves through context, risk, execution and review.",
          strong:
            "A basic AI tool answers a prompt. SkillEdge AI builds infrastructure around the trader: from market scan and trade planning to journal review, outcome tracking and Personal Edge development. This is not a one-trade suggestion — it is a system for making trading measurable.",
          items: [
            "Trading journal",
            "Screenshots",
            "AI review",
            "Market Intelligence",
            "AI Alerts",
            "Reports",
          ],
        }
      : lang === "UA"
        ? {
            eyebrow: "Преміальна інфраструктура трейдера",
            title: "Не чергова пустишка, а робочий інструмент, який перетворює ринок, угоди й помилки на керовану систему.",
            text:
              "SkillEdge AI поєднує журнал, скріншоти, Strategy OS, Personal Edge, Market Intelligence, AI Scanner, Reports і Elite Alerts в один premium trading desk — щоб кожне рішення проходило через контекст, ризик, виконання й розбір.",
            strong:
              "Звичайний AI-інструмент відповідає на запит. SkillEdge AI будує інфраструктуру навколо трейдера: від market scan і trade plan до journal review, outcome tracking і розвитку Personal Edge. Це не підказка на одну угоду — це система, яка робить торгівлю вимірюваною.",
            items: [
              "Журнал угод",
              "Скріншоти",
              "AI-розбір",
              "Market Intelligence",
              "AI Alerts",
              "Звіти",
            ],
          }
        : {
            eyebrow: "Премиальная инфраструктура трейдера",
            title: "Не очередная пустышка, а рабочий инструмент, который превращает рынок, сделки и ошибки в управляемую систему.",
            text:
              "SkillEdge AI объединяет журнал, скриншоты, Strategy OS, Personal Edge, Market Intelligence, AI Scanner, Reports и Elite Alerts в один premium trading desk — чтобы каждое решение проходило через контекст, риск, исполнение и разбор.",
            strong:
              "Обычный AI-инструмент отвечает на запрос. SkillEdge AI строит инфраструктуру вокруг трейдера: от market scan и trade plan до journal review, outcome tracking и развития Personal Edge. Это не подсказка на одну сделку — это система, которая заставляет торговлю становиться измеримой.",
            items: [
              "Журнал сделок",
              "Скриншоты",
              "AI-разбор",
              "Market Intelligence",
              "AI Alerts",
              "Отчёты",
            ],
          };

  return (
    <section className="relative overflow-hidden rounded-[2.2rem] border border-[#C8A96B]/12 bg-[#0F172A]/82 p-5 shadow-[0_28px_120px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.14),transparent_32%),radial-gradient(circle_at_92%_20%,rgba(200,169,107,0.10),transparent_32%)]" />

      <motion.div
        aria-hidden
        animate={{ x: ["-20%", "120%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/50 to-transparent"
      />

      <div className="relative grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <div className="inline-flex rounded-full border border-[#C8A96B]/18 bg-[#C8A96B]/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#E6EDF7]/74">
            {copy.eyebrow}
          </div>

          <h2 className="mt-5 max-w-3xl text-3xl font-black leading-[0.98] tracking-[-0.045em] text-white md:text-4xl">
            {copy.title}
          </h2>
        </div>

        <div>
          <p className="text-sm font-semibold leading-7 text-white/60">
            {copy.text}
          </p>

          <p className="mt-3 rounded-[1.35rem] border border-[#C8A96B]/12 bg-[#C8A96B]/[0.055] p-4 text-sm font-semibold leading-7 text-[#E6EDF7]/70">
            {copy.strong}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {copy.items.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/54"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingPage({
  t,
  handleCheckout,
  checkoutStatus,
}: {
  t: any;
  handleCheckout: (planId: string, billing: BillingPeriod) => void;
  checkoutStatus: string;
}) {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const copy = getPricingShowcaseCopy(t.lang);
  const elitePlan = copy.plans.find((plan: any) => plan.id === "elite") ?? copy.plans[2];

const demoCopy =
  t.lang === "EN"
    ? {
        badge: "Elite demo",
        title: "Try SkillEdge Elite for 3 days",
        text:
          "Get full Elite access for 3 days: journal, AI Coach, reports, Market Intelligence, AI Alerts and the floating alerts widget.",
        warning:
          "Best activated Monday–Thursday. We do not recommend activating the demo on Friday because the US stock market is closed on the weekend and live stock signals will be limited. Crypto signals may still appear.",
        button: "Activate demo",
      }
    : t.lang === "UA"
      ? {
          badge: "Elite demo",
          title: "Спробуй SkillEdge Elite на 3 дні",
          text:
            "Отримай повний Elite-доступ на 3 дні: журнал, AI Coach, звіти, Market Intelligence, AI Alerts і floating alerts widget.",
          warning:
            "Краще активувати з понеділка по четвер. Не рекомендуємо оплачувати demo у пʼятницю, тому що фондовий ринок США закритий на вихідних і live stock-сигналів буде менше. Crypto-сигнали можуть продовжувати зʼявлятися.",
          button: "Активувати demo",
        }
      : {
          badge: "Elite demo",
          title: "Попробуй SkillEdge Elite на 3 дня",
          text:
            "Полный Elite-доступ на 3 дня: журнал, AI Coach, отчёты, Market Intelligence, AI Alerts и floating alerts widget.",
          warning:
            "Лучше активировать с понедельника по четверг. Не рекомендуем оплачивать demo в пятницу, потому что фондовый рынок США закрыт на выходных и live stock-сигналов будет меньше. Crypto-сигналы могут продолжать появляться.",
          button: "Активировать demo",
        };

  const getPlanPrice = (plan: any) => {
    const price = plan.price?.[billing];

    return typeof price === "number" ? `$${price}` : "—";
  };

  const getPlanAccent = (planId: string) => {
    if (planId === "elite") {
      return "border-[#C8A96B]/30 bg-[#C8A96B]/[0.085] shadow-[0_34px_150px_rgba(0,192,118,0.2)] lg:-mt-6";
    }

    if (planId === "pro") {
      return "border-[#00C076]/18 bg-[#00D084]/[0.055]";
    }

    return "border-white/10 bg-white/[0.04]";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1600px] space-y-16 px-4 pb-28 pt-10 sm:px-6 lg:px-8 xl:px-10"
    >
      <section className="relative overflow-hidden rounded-[3.2rem] border border-white/10 bg-[#07111F]/88 p-6 shadow-[0_45px_180px_rgba(0,0,0,0.32)] backdrop-blur-2xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(0,192,118,0.16),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:62px_62px] opacity-30" />

        <div className="relative grid min-h-[calc(100vh-220px)] gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <Badge>{copy.heroBadge}</Badge>

            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.06em] text-white md:text-4xl xl:text-7xl">
              {copy.heroTitle}
            </h1>

            <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/68 md:text-lg">
              {copy.heroText}
            </p>

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/24 p-3 backdrop-blur-xl">
              <div className="px-2 pb-3">
                <div className="text-sm font-black text-white">{copy.billingTitle}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-white/45">
                  {copy.billingText}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {copy.billingOptions.map((option: string[]) => {
                  const key = option[0] as BillingPeriod;
                  const label = option[1] ?? "";
                  const note = option[2] ?? "";

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBilling(key)}
                      className={`rounded-[1.35rem] border px-4 py-4 text-left transition duration-300 ${
                        billing === key
                          ? "border-[#C8A96B]/35 bg-[#C8A96B]/[0.12] shadow-[0_0_40px_rgba(0,192,118,0.14)]"
                          : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="text-sm font-black text-white">{label}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                        {note}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {copy.paymentNotes.map((note: string, index: number) => (
                <span
                  key={note}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${
                    index === 0
                      ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-50/70"
                      : "border-[#00D084]/20 bg-[#00C076]/[0.07] text-[#E6EDF7]/70"
                  }`}
                >
                  {note}
                </span>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.6 }}
            className="relative"
          >
            <div className="absolute -inset-10 rounded-[2.4rem] bg-[#00C076]/12 blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-[#C8A96B]/20 bg-[#C8A96B]/[0.075] p-5 shadow-[0_40px_150px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_0%,rgba(0,192,118,0.22),transparent_34%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.15),transparent_30%)]" />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#E6EDF7]/55">
                    {copy.elite.eyebrow}
                  </div>

                  <div className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[10px] font-black text-white/70">
                    {getPlanPrice(elitePlan)} {copy.period[billing]}
                  </div>
                </div>

                <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
                  {copy.elite.title}
                </h2>

                <p className="mt-5 text-sm font-semibold leading-7 text-white/62">
                  {copy.elite.text}
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {copy.elite.bullets.map((item: string) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black text-white"
                    >
                      ✓ {item}
                    </div>
                  ))}
                </div>

                {checkoutStatus ? (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/22 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                      {copy.labels.checkout}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-white/62">
                      {checkoutStatus}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleCheckout("elite", billing)}
                  className="mt-7 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#07111F] shadow-[0_22px_90px_rgba(255,255,255,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_26px_100px_rgba(0,192,118,0.3)]"
                >
                  {copy.elite.button}
                  <span className="ml-2">→</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

<PricingValueBlock lang={t.lang} />

      <section className="grid items-stretch gap-6 lg:grid-cols-3">
        {copy.plans.map((plan: any, index: number) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: plan.id === "elite" ? 8 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.07, duration: 0.45 }}
            whileHover={{ y: -8 }}
            className={`group relative flex h-full min-h-[720px] flex-col overflow-hidden rounded-[2.25rem] border p-5 shadow-[0_26px_110px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-500 hover:-translate-y-2 hover:scale-[1.015] ${
  plan.id === "elite"
    ? "border-[#C8A96B]/36 bg-gradient-to-br from-[#C8A96B]/[0.14] via-white/[0.06] to-[#00D084]/[0.10] shadow-[0_34px_150px_rgba(0,192,118,0.24)]"
    : "border-white/10 bg-white/[0.04] hover:border-[#C8A96B]/26 hover:bg-[#C8A96B]/[0.065] hover:shadow-[0_34px_130px_rgba(0,192,118,0.13)]"
}`}
          >
            {plan.id === "elite" ? (
  <div className="absolute right-5 top-5 z-20 rounded-full border border-[#00C076]/22 bg-[#00D084]/[0.10] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#DFFFEF] shadow-[0_0_34px_rgba(200,169,107,0.18)]">
    {t.lang === "EN"
      ? "Traders choice"
      : t.lang === "UA"
        ? "Вибір трейдерів"
        : "Выбор трейдеров"}
  </div>
) : null}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.10),transparent_30%)]" />

            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[#E6EDF7]/50">
                {plan.badge}
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white">
                {plan.name}
              </h2>

              <p className="mt-4 min-h-[88px] text-sm font-semibold leading-7 text-white/58">
                {plan.headline}
              </p>

              <div className="mt-7 flex items-end gap-2">
                <span className="text-4xl font-black tracking-[-0.06em] text-white">
                  {getPlanPrice(plan)}
                </span>
                <span className="pb-2 text-sm font-bold text-white/45">
                  {copy.period[billing]}
                </span>
              </div>

              <p className="mt-5 text-sm font-semibold leading-7 text-white/56">
                {plan.text}
              </p>

              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  {copy.labels.bestFor}
                </div>
                <div className="mt-2 text-sm font-black leading-6 text-white">
                  {plan.bestFor}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                  {copy.labels.included}
                </div>

                <div className="mt-3 grid gap-2">
                  {plan.features.map((feature: string) => (
                    <div
                      key={feature}
                      className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-bold leading-5 text-white/58"
                    >
                      ✓ {feature}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout(plan.id, billing)}
                className={`mt-auto w-full rounded-2xl px-5 py-4 text-sm font-black transition duration-300 hover:-translate-y-0.5 ${
                  plan.id === "elite"
                    ? "bg-white text-[#07111F] shadow-[0_20px_80px_rgba(255,255,255,0.2)] hover:shadow-[0_24px_90px_rgba(0,192,118,0.25)]"
                    : "border border-white/12 bg-white/[0.055] text-white hover:border-[#C8A96B]/30 hover:bg-[#C8A96B]/[0.09]"
                }`}
              >
                {plan.cta}
                <span className="ml-2">→</span>
              </button>
            </div>
          </motion.div>
        ))}
      </section>

<section className="relative -mt-6 overflow-hidden rounded-[2rem] border border-amber-200/16 bg-white/[0.035] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.16)] backdrop-blur-xl md:p-5">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.12),transparent_30%),radial-gradient(circle_at_92%_20%,rgba(0,192,118,0.10),transparent_32%)]" />

  <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/78">
          {demoCopy.badge}
        </span>

        <span className="text-xs font-bold text-white/38">
          3 days · full Elite access
        </span>
      </div>

      <h3 className="mt-3 text-xl font-black tracking-[-0.025em] text-white md:text-2xl">
        {demoCopy.title}
      </h3>

      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/58">
        {demoCopy.text}
      </p>

      <p className="mt-3 max-w-4xl rounded-2xl border border-amber-200/14 bg-amber-200/[0.055] px-4 py-3 text-xs font-semibold leading-5 text-amber-50/72">
        {demoCopy.warning}
      </p>
    </div>

    <button
      type="button"
      onClick={() => handleCheckout("demo", "monthly")}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/18 bg-[#00C076] px-5 py-3 text-sm font-black text-[#07111F] shadow-[0_14px_44px_rgba(0,192,118,0.14)] transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_70px_rgba(0,192,118,0.2)]"
    >
      {demoCopy.button}
      <span className="ml-2">→</span>
    </button>
  </div>
</section>

      <section className="relative overflow-hidden rounded-[2.8rem] border border-[#C8A96B]/12 bg-[#0F172A]/78 p-6 shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(0,192,118,0.14),transparent_32%),radial-gradient(circle_at_10%_80%,rgba(16,185,129,0.12),transparent_34%)]" />

        <div className="relative">
          <SectionTitle
            eyebrow={copy.signal.eyebrow}
            title={copy.signal.title}
            text={copy.signal.text}
          />

          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {copy.signal.cards.map((item: string[], index: number) => {
              const title = item[0] ?? "";
              const text = item[1] ?? "";

              return (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.06, duration: 0.45 }}
                  whileHover={{ y: -6 }}
                  className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#C8A96B]/15 bg-[#C8A96B]/[0.07] text-sm font-black text-[#E6EDF7]">
                    0{index + 1}
                  </div>

                  <div className="mt-5 text-xl font-black tracking-[-0.025em] text-white">
                    {title}
                  </div>

                  <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
                    {text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(0,192,118,0.12),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.13),transparent_32%)]" />

        <div className="relative">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge>{copy.comparison.eyebrow}</Badge>

              <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
                {copy.comparison.title}
              </h2>
            </div>

            <p className="max-w-xl text-sm font-semibold leading-7 text-white/58">
              {copy.comparison.text}
            </p>
          </div>

          <div className="mt-9 overflow-x-auto rounded-[2rem] border border-white/10 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] bg-white/[0.065] px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-white/50">
                {copy.comparison.headers.map((header: string) => (
                  <div key={header}>{header}</div>
                ))}
              </div>

              {copy.comparison.rows.map((row: string[], rowIndex: number) => (
                <motion.div
                  key={`pricing-row-${rowIndex}`}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: rowIndex * 0.025, duration: 0.35 }}
                  className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] border-t border-white/10 text-sm font-semibold text-white/62"
                >
                  {row.map((cell: string, cellIndex: number) => (
                    <div
                      key={`pricing-cell-${rowIndex}-${cellIndex}`}
                      className={`p-4 ${
                        cellIndex === 3
                          ? "bg-[#C8A96B]/[0.045] text-white/76"
                          : cellIndex === 0
                            ? "bg-white/[0.03] font-black text-white"
                            : ""
                      }`}
                    >
                      {cell}
                    </div>
                  ))}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-[2.6rem] border border-[#00C076]/14 bg-[#00D084]/[0.055] p-6 shadow-[0_34px_140px_rgba(6,78,59,0.22)] backdrop-blur-xl md:p-8"
        >
          <Badge>{copy.recommendation.eyebrow}</Badge>

          <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
            {copy.recommendation.title}
          </h2>

          <p className="mt-5 text-sm font-semibold leading-7 text-white/62">
            {copy.recommendation.text}
          </p>

          <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-xs font-semibold leading-6 text-amber-50/65">
            {copy.recommendation.disclaimer}
          </div>
        </motion.div>

        <div className="grid gap-4">
          {copy.recommendation.items.map((item: string[], index: number) => (
            <motion.div
              key={item[0]}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: index * 0.06, duration: 0.45 }}
              className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#C8A96B]/15 bg-[#C8A96B]/[0.07] text-xs font-black text-[#E6EDF7]">
                  0{index + 1}
                </div>

                <div>
                  <div className="text-lg font-black text-white">{item[0]}</div>
                  <p className="mt-2 text-sm font-semibold leading-7 text-white/56">
                    {item[1]}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}

          <button
            type="button"
            onClick={() => handleCheckout("elite", billing)}
            className="rounded-[1.7rem] border border-[#C8A96B]/24 bg-[#C8A96B]/[0.09] p-5 text-left text-sm font-black text-[#E6EDF7] shadow-[0_26px_100px_rgba(0,192,118,0.18)] transition duration-300 hover:-translate-y-1 hover:bg-[#C8A96B]/[0.13]"
          >
            {copy.elite.button}
            <span className="ml-2">→</span>
          </button>
        </div>
      </section>
    </motion.div>
  );
}


type LandingTeamMember = {
  name: string;
  country: string;
  role: string;
  story: string;
  focus: string[];
  initials: string;
  gradient: string;
  photoUrl?: string;
};

function getTeamPageCopy(lang: string) {
  if (lang === "EN") {
    return {
      badge: "Team manifesto",
      title: "Built by traders, product people and risk-first operators.",
      text:
        "SkillEdge AI is not built as another signal feed. It is built like a trading desk: market intelligence, setup logic, journal feedback, execution review and a process that makes the trader sharper over time.",
      primary: "Choose access",
      secondary: "View product",
      carouselBadge: "Global desk team",
      carouselTitle: "Seven people, one mission: turn trading into a repeatable process.",
      principlesEyebrow: "Operating principles",
      principlesTitle: "What this team is building.",
      refuseTitle: "What we refuse to build",
      buildTitle: "What SkillEdge is built for",
      principles: [
        ["Risk before excitement", "A trade idea is not serious until entry, invalidation and RR are clear."],
        ["Signals must teach", "Every alert should explain setup, trigger, risk and what cancels the idea."],
        ["Journal is the truth", "PnL alone is not enough. The system must show execution quality and repeated mistakes."],
        ["Personalization comes from data", "The better the journal, the better the system can identify strong and weak patterns."],
      ],
      refuse: [
        "Blind buy/sell calls",
        "Fake profit promises",
        "No-context pump alerts",
        "Pretty dashboards with no trading process",
      ],
      build: [
        "AI Trading Desk workflow",
        "Setup-based alerts",
        "Signal-to-Journal analytics",
        "Outcome tracking and trader improvement",
      ],
      finalTitle: "A premium trading process, not another noisy tool.",
      finalText:
        "SkillEdge AI is being built for traders who want structure, discipline, market context and a serious feedback loop.",
    };
  }

  if (lang === "UA") {
    return {
      badge: "Маніфест команди",
      title: "Створюємо продукт як trading desk: з ризиком, структурою і дисципліною.",
      text:
        "SkillEdge AI — це не чергова стрічка сигналів. Це система для трейдера: ринкова розвідка, логіка сетапів, журнал, розбір виконання і процес, який робить рішення сильнішими з часом.",
      primary: "Обрати доступ",
      secondary: "Подивитись продукт",
      carouselBadge: "Глобальна desk-команда",
      carouselTitle: "Сім людей, одна місія: перетворити трейдинг на повторюваний процес.",
      principlesEyebrow: "Принципи роботи",
      principlesTitle: "Що будує ця команда.",
      refuseTitle: "Що ми не будуємо",
      buildTitle: "Для чого створений SkillEdge",
      principles: [
        ["Ризик перед емоцією", "Ідея не є серйозною, поки не зрозумілі entry, invalidation і RR."],
        ["Сигнал має навчати", "Кожен alert повинен пояснювати сетап, тригер, ризик і що скасовує ідею."],
        ["Журнал — джерело правди", "PnL недостатньо. Система має показувати якість виконання та повторювані помилки."],
        ["Персоналізація йде з даних", "Чим сильніший журнал, тим краще система бачить сильні й слабкі патерни трейдера."],
      ],
      refuse: [
        "Сліпі buy/sell команди",
        "Фейкові обіцянки прибутку",
        "Pump alerts без контексту",
        "Красиві dashboard без торгового процесу",
      ],
      build: [
        "AI Trading Desk workflow",
        "Сигнали на базі сетапів",
        "Signal-to-Journal analytics",
        "Outcome tracking і розвиток трейдера",
      ],
      finalTitle: "Преміальний торговий процес, а не ще один шумний інструмент.",
      finalText:
        "SkillEdge AI створюється для трейдерів, яким потрібні структура, дисципліна, ринковий контекст і серйозний feedback loop.",
    };
  }

  return {
    badge: "Манифест команды",
    title: "Мы строим продукт как trading desk: через риск, структуру и дисциплину.",
    text:
      "SkillEdge AI — это не очередная лента сигналов. Это система для трейдера: рыночная разведка, логика сетапов, журнал, разбор исполнения и процесс, который делает решения сильнее со временем.",
    primary: "Выбрать доступ",
    secondary: "Посмотреть продукт",
    carouselBadge: "Глобальная desk-команда",
    carouselTitle: "Семь человек, одна миссия: превратить трейдинг в повторяемый процесс.",
    principlesEyebrow: "Принципы работы",
    principlesTitle: "Что строит эта команда.",
    refuseTitle: "Что мы не строим",
    buildTitle: "Для чего создан SkillEdge",
    principles: [
      ["Риск перед эмоцией", "Идея не серьёзная, пока не понятны entry, invalidation и RR."],
      ["Сигнал должен обучать", "Каждый alert должен объяснять сетап, триггер, риск и что отменяет идею."],
      ["Журнал — источник правды", "PnL недостаточно. Система должна показывать качество исполнения и повторяющиеся ошибки."],
      ["Персонализация идёт из данных", "Чем сильнее журнал, тем лучше система видит сильные и слабые паттерны трейдера."],
    ],
    refuse: [
      "Слепые buy/sell команды",
      "Фейковые обещания прибыли",
      "Pump alerts без контекста",
      "Красивые dashboard без торгового процесса",
    ],
    build: [
      "AI Trading Desk workflow",
      "Сигналы на базе сетапов",
      "Signal-to-Journal analytics",
      "Outcome tracking и развитие трейдера",
    ],
    finalTitle: "Премиальный торговый процесс, а не ещё один шумный инструмент.",
    finalText:
      "SkillEdge AI строится для трейдеров, которым нужны структура, дисциплина, рыночный контекст и серьёзный feedback loop.",
  };
}

function getSkillEdgeTeamMembers(lang: string): LandingTeamMember[] {
  const isEn = lang === "EN";
  const isUa = lang === "UA";

  return [
    {
      name: "Aida Sarynova",
      country: isEn ? "Kazakhstan" : isUa ? "Казахстан" : "Казахстан",
      role: isEn ? "Head of Market Intelligence" : isUa ? "Head of Market Intelligence" : "Head of Market Intelligence",
      story: isEn
        ? "Aida grew from Almaty fintech research into market data design. She owns the logic that turns noisy tickers into a usable trader shortlist."
        : isUa
          ? "Аїда виросла з fintech-досліджень в Алмати до market data design. Вона відповідає за логіку, яка перетворює шумні тикери на короткий список для трейдера."
          : "Аида выросла из fintech-исследований в Алматы до market data design. Она отвечает за логику, которая превращает шумные тикеры в короткий список для трейдера.",
      focus: ["Scanner", "Market context", "In-play filters"],
      initials: "AS",
      photoUrl: "/team/aida-sarynova.jpg",
      gradient: "linear-gradient(135deg, rgba(0,192,118,0.36), rgba(15,23,42,0.92) 48%, rgba(16,185,129,0.26))",
    },
    {
      name: "Niamh O’Connor",
      country: isEn ? "Ireland" : isUa ? "Ірландія" : "Ирландия",
      role: isEn ? "Product Education Lead" : isUa ? "Product Education Lead" : "Product Education Lead",
      story: isEn
        ? "Niamh builds the learning layer: simple explanations, playbooks and trader workflows that make signals educational instead of blind."
        : isUa
          ? "Нів будує навчальний шар: прості пояснення, playbook і workflow, щоб сигнали навчали, а не просто давали команду."
          : "Нив строит обучающий слой: простые объяснения, playbook и workflow, чтобы сигналы обучали, а не просто давали команду.",
      focus: ["Learning", "Playbooks", "Signal education"],
      initials: "NO",
      photoUrl: "/team/niamh-oconnor.jpg",
      gradient: "linear-gradient(135deg, rgba(16,185,129,0.34), rgba(15,23,42,0.92) 48%, rgba(59,130,246,0.28))",
    },
    {
      name: "Oliver Reed",
      country: isEn ? "England" : isUa ? "Англія" : "Англия",
      role: isEn ? "Setup Engine Lead" : isUa ? "Setup Engine Lead" : "Setup Engine Lead",
      story: isEn
        ? "Oliver focuses on US equities, momentum behavior and the rules that separate a real setup from a late chase."
        : isUa
          ? "Олівер фокусується на US equities, momentum-поведінці та правилах, які відділяють реальний сетап від пізнього chase."
          : "Оливер фокусируется на US equities, momentum-поведении и правилах, которые отделяют реальный сетап от позднего chase.",
      focus: ["Momentum", "VWAP", "No chase logic"],
      initials: "OR",
      photoUrl: "/team/oliver-reed.jpg",
      gradient: "linear-gradient(135deg, rgba(59,130,246,0.34), rgba(15,23,42,0.92) 50%, rgba(0,192,118,0.26))",
    },
    {
      name: "James Whitfield",
      country: isEn ? "England" : isUa ? "Англія" : "Англия",
      role: isEn ? "Risk & Execution Analyst" : isUa ? "Risk & Execution Analyst" : "Risk & Execution Analyst",
      story: isEn
        ? "James designs the discipline layer: RR filters, invalidation logic, execution scoring and the feedback that shows where a trader leaks money."
        : isUa
          ? "Джеймс будує дисципліну: RR-фільтри, invalidation logic, execution score і feedback, який показує, де трейдер втрачає гроші."
          : "Джеймс строит дисциплину: RR-фильтры, invalidation logic, execution score и feedback, который показывает, где трейдер теряет деньги.",
      focus: ["Risk", "Execution score", "RR quality"],
      initials: "JW",
      photoUrl: "/team/james-whitfield.jpg",
      gradient: "linear-gradient(135deg, rgba(14,165,233,0.32), rgba(15,23,42,0.92) 50%, rgba(244,114,182,0.18))",
    },
    {
      name: "Lukas Schneider",
      country: isEn ? "Germany" : isUa ? "Німеччина" : "Германия",
      role: isEn ? "Data Infrastructure Lead" : isUa ? "Data Infrastructure Lead" : "Data Infrastructure Lead",
      story: isEn
        ? "Lukas owns reliability: backend data pipelines, alert delivery, caching, rate limits and the architecture that keeps the desk fast."
        : isUa
          ? "Лукас відповідає за надійність: backend data pipelines, alert delivery, кешування, rate limits і швидку архітектуру desk."
          : "Лукас отвечает за надёжность: backend data pipelines, alert delivery, кеширование, rate limits и быструю архитектуру desk.",
      focus: ["Backend", "Market data", "Alerts delivery"],
      initials: "LS",
      photoUrl: "/team/lukas-schneider.jpg",
      gradient: "linear-gradient(135deg, rgba(6,182,212,0.28), rgba(15,23,42,0.92) 52%, rgba(251,191,36,0.2))",
    },
    {
      name: "Marcus Hayes",
      country: isEn ? "United States" : isUa ? "США" : "США",
      role: isEn ? "Trading Desk Strategy" : isUa ? "Trading Desk Strategy" : "Trading Desk Strategy",
      story: isEn
        ? "Marcus brings prop-desk thinking: structure first, risk first, no blind calls and every decision reviewed after the outcome."
        : isUa
          ? "Маркус приносить prop-desk мислення: спочатку структура, спочатку ризик, без сліпих сигналів і з review після результату."
          : "Маркус приносит prop-desk мышление: сначала структура, сначала риск, без слепых сигналов и с review после результата.",
      focus: ["Desk logic", "Trade plans", "Outcome review"],
      initials: "MH",
      photoUrl: "/team/marcus-hayes.jpg",
      gradient: "linear-gradient(135deg, rgba(37,99,235,0.32), rgba(15,23,42,0.92) 52%, rgba(16,185,129,0.23))",
    },
    {
  name: "Michał Nowak",
  country: isEn ? "Poland" : isUa ? "Польща" : "Польша",
  role: isEn
    ? "Quant Alert Scoring Engineer"
    : isUa
      ? "Quant Alert Scoring Engineer"
      : "Quant Alert Scoring Engineer",
  story: isEn
    ? "Michał builds the scoring layer behind SkillEdge alerts: confluence, freshness, RR quality, volatility and confidence thresholds before an idea reaches the trader."
    : isUa
      ? "Міхал будує scoring-шар для SkillEdge alerts: confluence, свіжість, якість RR, волатильність і confidence thresholds до того, як ідея потрапить до трейдера."
      : "Михал строит scoring-слой для SkillEdge alerts: confluence, свежесть, качество RR, волатильность и confidence thresholds до того, как идея попадёт к трейдеру.",
  focus: ["Alert scoring", "Confluence", "Confidence filters"],
  initials: "MN",
      photoUrl: "/team/michal-nowak.jpg",
      gradient:
    "linear-gradient(135deg, rgba(0,192,118,0.32), rgba(15,23,42,0.92) 48%, rgba(248,113,113,0.22))",
},
{
  name: "Jakub Zieliński",
  country: isEn ? "Poland" : isUa ? "Польща" : "Польша",
  role: isEn
    ? "Professional Trader Playbook Analyst"
    : isUa
      ? "Professional Trader Playbook Analyst"
      : "Professional Trader Playbook Analyst",
  story: isEn
    ? "Jakub translates professional trading behavior into playbooks: VWAP reactions, failed breakouts, momentum continuation, liquidity traps and no-chase execution rules."
    : isUa
      ? "Якуб перетворює професійну поведінку трейдера на playbook: VWAP reactions, failed breakouts, momentum continuation, liquidity traps і no-chase правила виконання."
      : "Якуб превращает профессиональное поведение трейдера в playbook: VWAP reactions, failed breakouts, momentum continuation, liquidity traps и no-chase правила исполнения.",
  focus: ["Playbooks", "VWAP logic", "Liquidity traps"],
  initials: "JZ",
      photoUrl: "/team/jakub-zielinski.jpg",
      gradient:
    "linear-gradient(135deg, rgba(59,130,246,0.34), rgba(15,23,42,0.92) 48%, rgba(34,197,94,0.22))",
},
{
  name: "Dilnoza Karimova",
  country: isEn ? "Uzbekistan" : isUa ? "Узбекистан" : "Узбекистан",
  role: isEn
    ? "Journal Intelligence & Personalization Lead"
    : isUa
      ? "Journal Intelligence & Personalization Lead"
      : "Journal Intelligence & Personalization Lead",
  story: isEn
    ? "Dilnoza owns the journal intelligence layer: finding the trader’s best patterns, repeated mistakes, emotional leaks and the data that powers personal AI alerts."
    : isUa
      ? "Дільноза відповідає за journal intelligence: найкращі патерни трейдера, повторювані помилки, емоційні витоки і дані для personal AI alerts."
      : "Дильноза отвечает за journal intelligence: лучшие паттерны трейдера, повторяющиеся ошибки, эмоциональные утечки и данные для personal AI alerts.",
  focus: ["Journal patterns", "Personal alerts", "Outcome learning"],
  initials: "DK",
      photoUrl: "/team/dilnoza-karimova.jpg",
      gradient:
    "linear-gradient(135deg, rgba(16,185,129,0.34), rgba(15,23,42,0.92) 48%, rgba(217,70,239,0.2))",
},
    {
      name: "Kenji Watanabe",
      country: isEn ? "Japan" : isUa ? "Японія" : "Япония",
      role: isEn ? "Behavioral UX Architect" : isUa ? "Behavioral UX Architect" : "Behavioral UX Architect",
      story: isEn
        ? "Kenji designs the interface around calm decisions: less panic, clearer next action and fewer emotional clicks."
        : isUa
          ? "Кенджі проєктує інтерфейс навколо спокійних рішень: менше паніки, чіткіша наступна дія і менше емоційних кліків."
          : "Кенджи проектирует интерфейс вокруг спокойных решений: меньше паники, яснее следующее действие и меньше эмоциональных кликов.",
      focus: ["UX", "Decision clarity", "Trader behavior"],
      initials: "KW",
      photoUrl: "/team/kenji-watanabe.jpg",
      gradient: "linear-gradient(135deg, rgba(45,212,191,0.3), rgba(15,23,42,0.92) 52%, rgba(248,113,113,0.18))",
    },
  ];
}

function TeamPhotoCarousel({
  members,
  copy,
}: {
  members: LandingTeamMember[];
  copy: ReturnType<typeof getTeamPageCopy>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % members.length);
  };

  const goPrev = () => {
    setActiveIndex((current) =>
      current === 0 ? members.length - 1 : current - 1
    );
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      goNext();
    }, 8000);

    return () => window.clearInterval(timer);
  }, [members.length]);

  const visibleMembers = [0, 1].map((offset) => {
    const memberIndex = (activeIndex + offset) % members.length;

    return {
      member: members[memberIndex],
      memberIndex,
    };
  });

  return (
    <div className="relative overflow-hidden rounded-[2.7rem] border border-[#C8A96B]/14 bg-[#07111F]/82 p-4 shadow-[0_40px_160px_rgba(0,0,0,0.32)] backdrop-blur-2xl md:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,192,118,0.16),transparent_30%),radial-gradient(circle_at_92%_22%,rgba(16,185,129,0.13),transparent_34%)]" />

      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#E6EDF7]/50">
            {copy.carouselBadge}
          </div>

          <div className="mt-2 max-w-xl text-xl font-black leading-tight text-white">
            {copy.carouselTitle}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-lg font-black text-white/70 transition hover:border-[#C8A96B]/30 hover:bg-[#C8A96B]/[0.09] hover:text-white"
            aria-label="Previous team members"
          >
            ←
          </button>

          <button
            type="button"
            onClick={goNext}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C8A96B]/20 bg-[#C8A96B]/[0.09] text-lg font-black text-[#E6EDF7] transition hover:bg-[#C8A96B]/[0.14]"
            aria-label="Next team members"
          >
            →
          </button>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-4 lg:grid-cols-2">
        {visibleMembers.map(({ member, memberIndex }, index) => (
          <motion.div
            key={`${member.name}-${activeIndex}`}
            initial={{ opacity: 0, x: 54, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: index * 0.08, duration: 0.5 }}
          >
            <TeamPhotoCard
              member={member}
              index={memberIndex}
            />
          </motion.div>
        ))}
      </div>

      <div className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-2">
        {members.map((member, index) => (
          <button
            key={member.name}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`h-2 rounded-full transition-all ${
              index === activeIndex
                ? "w-8 bg-[#C8A96B]"
                : "w-2 bg-white/20 hover:bg-white/35"
            }`}
            aria-label={`Show ${member.name}`}
          />
        ))}
      </div>
    </div>
  );
}

function TeamPhotoCard({
  member,
  index,
}: {
  member: LandingTeamMember;
  index: number;
}) {
  return (
    <div className="group relative min-h-[520px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_28px_110px_rgba(0,0,0,0.26)] backdrop-blur-xl transition duration-300 hover:-translate-y-2 hover:border-[#C8A96B]/28 hover:bg-white/[0.065]">
      <div
        className="relative h-72 overflow-hidden"
        style={{ background: member.gradient }}
      >
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            className="absolute inset-0 h-full w-full object-cover object-center grayscale transition duration-700 group-hover:scale-[1.045] group-hover:grayscale-0"
            loading="lazy"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_18%,rgba(255,255,255,0.34),transparent_22%),linear-gradient(180deg,transparent,rgba(0,0,0,0.42))]" />
            <div className="absolute left-1/2 top-16 h-24 w-24 -translate-x-1/2 rounded-full border border-white/20 bg-white/22 shadow-[0_0_60px_rgba(255,255,255,0.22)] backdrop-blur-md" />
            <div className="absolute bottom-0 left-1/2 h-40 w-52 -translate-x-1/2 rounded-t-[5rem] border border-white/10 bg-black/28 backdrop-blur-sm" />
          </>
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,192,118,0.13),transparent_34%),linear-gradient(180deg,rgba(7,17,31,0.03),rgba(7,17,31,0.88))]" />

        <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/78 backdrop-blur-xl">
          {String(index + 1).padStart(2, "0")}
        </div>

        <div className="absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-sm font-black text-white backdrop-blur-xl">
          {member.initials}
        </div>

        <div className="absolute bottom-5 left-5 right-5">
          <div className="text-2xl font-black tracking-[-0.035em] text-white">
            {member.name}
          </div>
          <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-[#E6EDF7]/72">
            {member.country}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="text-sm font-black text-[#E6EDF7]">{member.role}</div>

        <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
          {member.story}
        </p>

        <div className="mt-5 grid gap-2">
          {member.focus.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-bold text-white/55"
            >
              ✓ {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamPage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const copy = getTeamPageCopy(t.lang);
  const members = getSkillEdgeTeamMembers(t.lang);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1600px] space-y-16 px-4 pb-28 pt-10 sm:px-6 lg:px-8 xl:px-10"
    >
      <section className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-[#07111F]/88 p-6 shadow-[0_45px_180px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.16),transparent_32%),radial-gradient(circle_at_92%_18%,rgba(16,185,129,0.13),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_42%)]" />

        <div className="relative grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <div>
            <Badge>{copy.badge}</Badge>

            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.96] tracking-[-0.065em] text-white md:text-4xl xl:text-7xl">
              {copy.title}
            </h1>

            <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/68 md:text-lg">
              {copy.text}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActive("pricing")}
                className="group relative overflow-hidden rounded-full border border-white/20 bg-white px-7 py-3.5 text-sm font-black text-[#07111F] shadow-[0_18px_70px_rgba(255,255,255,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(0,192,118,0.25)]"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076] opacity-0 transition group-hover:opacity-100" />
                <span className="relative">
                  {copy.primary}
                  <span className="ml-2">→</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActive("product")}
                className="rounded-full border border-[#C8A96B]/20 bg-[#C8A96B]/[0.06] px-7 py-3.5 text-sm font-black text-[#E6EDF7]/82 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-[#00C076]/[0.12] hover:text-white"
              >
                {copy.secondary}
                <span className="ml-2 opacity-70">↗</span>
              </button>
            </div>
          </div>

          <TeamPhotoCarousel members={members} copy={copy} />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-[#C8A96B]/12 bg-white/[0.035] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(0,192,118,0.13),transparent_32%),radial-gradient(circle_at_12%_80%,rgba(16,185,129,0.12),transparent_34%)]" />

        <div className="relative grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <Badge>{copy.principlesEyebrow}</Badge>

            <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
              {copy.principlesTitle}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {copy.principles.map((item, index) => (
              <motion.div
                key={item[0]}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.06, duration: 0.45 }}
                className="rounded-[1.7rem] border border-white/10 bg-black/20 p-5 backdrop-blur-xl"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#C8A96B]/15 bg-[#C8A96B]/[0.07] text-sm font-black text-[#E6EDF7]">
                  0{index + 1}
                </div>

                <div className="mt-5 text-xl font-black tracking-[-0.025em] text-white">
                  {item[0]}
                </div>

                <p className="mt-3 break-words text-sm font-semibold leading-7 text-white/56">
                  {item[1]}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-[2.8rem] border border-rose-300/14 bg-rose-300/[0.045] p-6 shadow-[0_34px_140px_rgba(127,29,29,0.18)] backdrop-blur-xl md:p-8"
        >
          <Badge>{copy.refuseTitle}</Badge>

          <div className="mt-7 grid gap-3">
            {copy.refuse.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black text-white/68"
              >
                ✕ {item}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-[2.8rem] border border-[#00D084]/14 bg-[#00C076]/[0.055] p-6 shadow-[0_34px_140px_rgba(6,78,59,0.2)] backdrop-blur-xl md:p-8"
        >
          <Badge>{copy.buildTitle}</Badge>

          <div className="mt-7 grid gap-3">
            {copy.build.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black text-white/72"
              >
                ✓ {item}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#07111F]/86 p-6 shadow-[0_40px_160px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,192,118,0.14),transparent_32%),radial-gradient(circle_at_90%_90%,rgba(16,185,129,0.13),transparent_36%)]" />

        <div className="relative grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-4xl">
              {copy.finalTitle}
            </h2>

            <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/64">
              {copy.finalText}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActive("pricing")}
            className="rounded-[1.7rem] border border-[#C8A96B]/24 bg-[#C8A96B]/[0.09] p-5 text-left text-sm font-black text-[#E6EDF7] shadow-[0_26px_100px_rgba(0,192,118,0.18)] transition duration-300 hover:-translate-y-1 hover:bg-[#C8A96B]/[0.13]"
          >
            {copy.primary}
            <span className="ml-2">→</span>
          </button>
        </div>
      </section>
    </motion.div>
  );
}

function PaymentMethodModal({
  t,
  selection,
  onClose,
  onCrypto,
  onCard,
}: {
  t: any;
  selection: {
    planId: string;
    billingPeriod: BillingPeriod;
  };
  onClose: () => void;
  onCrypto: () => void;
  onCard: () => void;
}) {
  const language: Language =
    t.lang === "RU" ? "ru" : t.lang === "UA" ? "ua" : "en";

  const copy =
    language === "en"
      ? {
          badge: "Secure checkout",
          title: "Choose payment method",
          text:
            "Select how you want to activate SkillEdge AI. Crypto payment is available now. Card payment is being prepared.",
          crypto: "Pay with crypto",
          cryptoText: "USDT TRC20 invoice through the active launch payment flow.",
          card: "Pay by card",
          cardText: "Card payment is being prepared and will be available soon.",
          demoNote:
            "Demo gives full SkillEdge Elite access for 3 days. Best activated Monday–Thursday.",
          close: "Close",
          billing: {
            monthly: "Monthly",
            halfyear: "6 months",
            yearly: "1 year",
          },
        }
      : language === "uk"
        ? {
            badge: "Secure checkout",
            title: "Обери спосіб оплати",
            text:
              "Обери, як активувати SkillEdge AI. Крипто-оплата вже доступна. Оплата карткою готується.",
            crypto: "Оплатити криптою",
            cryptoText: "USDT TRC20 invoice через активний launch payment flow.",
            card: "Оплатити карткою",
            cardText: "Оплата карткою готується і буде доступна скоро.",
            demoNote:
              "Demo відкриває повний SkillEdge Elite доступ на 3 дні. Краще активувати з понеділка по четвер.",
            close: "Закрити",
            billing: {
              monthly: "1 місяць",
              halfyear: "6 місяців",
              yearly: "1 рік",
            },
          }
        : {
            badge: "Secure checkout",
            title: "Выбери способ оплаты",
            text:
              "Выбери, как активировать SkillEdge AI. Крипто-оплата уже доступна. Оплата картой готовится.",
            crypto: "Оплатить криптой",
            cryptoText: "USDT TRC20 invoice через активный launch payment flow.",
            card: "Оплатить картой",
            cardText: "Оплата картой готовится и будет доступна скоро.",
            demoNote:
              "Demo открывает полный SkillEdge Elite доступ на 3 дня. Лучше активировать с понедельника по четверг.",
            close: "Закрыть",
            billing: {
              monthly: "1 месяц",
              halfyear: "6 месяцев",
              yearly: "1 год",
            },
          };

  const selectedPlanId = String(selection.planId || "").toLowerCase();

  const planName =
    selectedPlanId === "demo"
      ? "SkillEdge Elite Demo"
      : selectedPlanId === "starter" || selectedPlanId === "core"
        ? "SkillEdge Core"
        : selectedPlanId === "pro" || selectedPlanId === "edge"
          ? "SkillEdge Edge"
          : selectedPlanId === "elite"
            ? "SkillEdge Elite"
            : "SkillEdge AI";

  const periodLabel =
    selectedPlanId === "demo"
      ? language === "en"
        ? "3 days"
        : language === "uk"
          ? "3 дні"
          : "3 дня"
      : copy.billing[selection.billingPeriod];

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-3xl overflow-hidden rounded-[2.4rem] border border-[#C8A96B]/16 bg-[#0F172A]/96 p-5 shadow-[0_34px_140px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(0,192,118,0.18),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(200,169,107,0.13),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_44%)]" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-[#C8A96B]/18 bg-[#C8A96B]/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#E6EDF7]/74">
                {copy.badge}
              </div>

              <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                {copy.title}
              </h2>

              <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/56">
                {copy.text}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label={copy.close}
            >
              ✕
            </button>
          </div>

          <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-white/34">
                  Selected access
                </div>
                <div className="mt-1 text-xl font-black text-white">
                  {planName}
                </div>
              </div>

              <div className="rounded-full border border-[#00C076]/18 bg-[#00D084]/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#DFFFEF]/76">
                {periodLabel}
              </div>
            </div>

            {selection.planId === "demo" ? (
              <div className="mt-4 rounded-2xl border border-amber-200/16 bg-amber-200/[0.055] px-4 py-3 text-xs font-semibold leading-5 text-amber-50/76">
                {copy.demoNote}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={onCrypto}
              className="group relative overflow-hidden rounded-[1.7rem] border border-[#C8A96B]/18 bg-[#C8A96B]/[0.075] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-white/36 hover:bg-[#C8A96B]/[0.11] hover:shadow-[0_22px_80px_rgba(0,192,118,0.16)]"
            >
              <span className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-[#00C076]/0 blur-3xl transition group-hover:bg-[#00C076]/16" />
              <span className="relative">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C8A96B]/18 bg-[#C8A96B]/[0.09] text-xl">
                  ₮
                </span>
                <span className="mt-5 block text-xl font-black text-white">
                  {copy.crypto}
                </span>
                <span className="mt-2 block text-sm font-semibold leading-6 text-white/52">
                  {copy.cryptoText}
                </span>
                <span className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black text-[#E6EDF7]/78">
                  Continue →
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onCard}
              className="group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-[#00C076]/28 hover:bg-[#00D084]/[0.07]"
            >
              <span className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-[#00C076]/0 blur-3xl transition group-hover:bg-[#00C076]/12" />
              <span className="relative">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00C076]/16 bg-[#00D084]/[0.08] text-xl">
                  💳
                </span>
                <span className="mt-5 block text-xl font-black text-white">
                  {copy.card}
                </span>
                <span className="mt-2 block text-sm font-semibold leading-6 text-white/52">
                  {copy.cardText}
                </span>
                <span className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black text-white/62">
                  Coming soon
                </span>
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SkillEdgeSplashIntro({ language }: { language: Language }) {
  const copy =
    language === "en"
      ? {
          label: "AI Trading Desk",
          status: "Initializing market intelligence",
          modules: ["Market scan", "Risk engine", "AI alerts"],
        }
      : language === "uk"
        ? {
            label: "AI Trading Desk",
            status: "Запускаємо ринкову аналітику",
            modules: ["Market scan", "Risk engine", "AI alerts"],
          }
        : {
            label: "AI Trading Desk",
            status: "Запускаем рыночную аналитику",
            modules: ["Market scan", "Risk engine", "AI alerts"],
          };

  return (
    <motion.div
      key="skilledge-splash-intro"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(18px)" }}
      transition={{ duration: 0.75, ease: "easeInOut" }}
      className="fixed inset-0 z-[999] flex items-center justify-center overflow-hidden bg-[#030711]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,192,118,0.28),transparent_28%),radial-gradient(circle_at_50%_64%,rgba(16,185,129,0.16),transparent_34%)]"
      />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col items-center px-6 text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#C8A96B]/10"
        />

        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00C076]/10 border-t-cyan-100/45"
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55 }}
          className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-[#C8A96B]/18 bg-white/[0.045] shadow-[0_0_80px_rgba(0,192,118,0.22)] backdrop-blur-xl"
        >
          <div className="absolute inset-2 rounded-[1.2rem] bg-gradient-to-br from-[#C8A96B]/20 via-white/5 to-[#00D084]/20" />
          <span className="relative text-xl font-black tracking-[-0.08em] text-white">
            SE
          </span>
          <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-[#00C076] shadow-[0_0_22px_rgba(110,231,183,0.95)]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.65 }}
          className="text-xs font-black uppercase tracking-[0.42em] text-[#E6EDF7]/55"
        >
          {copy.label}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18, letterSpacing: "0.18em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "-0.055em" }}
          transition={{ delay: 0.55, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-4xl font-black text-white md:text-6xl"
        >
          SkillEdge AI
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.55 }}
          className="mt-4 text-sm font-semibold text-white/52 md:text-base"
        >
          {copy.status}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.55 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-2"
        >
          {copy.modules.map((item, index) => (
            <motion.span
              key={item}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.18 + index * 0.12, duration: 0.35 }}
              className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/48"
            >
              {item}
            </motion.span>
          ))}
        </motion.div>

        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          transition={{ delay: 1.15, duration: 1.15, ease: "easeInOut" }}
          className="mt-6 h-px overflow-hidden rounded-full bg-white/10"
        >
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "120%" }}
            transition={{ delay: 1.25, duration: 1.15, ease: "easeInOut" }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7] to-transparent"
          />
        </motion.div>
      </motion.div>
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
  const language: Language =
    t.lang === "RU" ? "ru" : t.lang === "UA" ? "ua" : "en";

  const copy = {
    en: {
      productColumn: "Product",
      featuresColumn: "Features",
      resourcesColumn: "Resources",
      legalColumn: "Legal",
      description:
        "Premium AI trading workspace for serious traders: market intelligence, AI signals, journal, execution review, playbook, reports and coaching in one connected system.",
      choosePlan: "Choose plan",
      requestDemo: "Request demo",
      cookieSettings: "Cookie settings",
      contact: "Contacts",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Product demo by request",
      rights: "© 2026 SkillEdge AI. All rights reserved.",
      bottomNote:
        "Built for traders who want structure, discipline and measurable improvement.",
      disclaimer:
        "SkillEdge AI is not financial advice and does not guarantee profits. The platform is built to improve structure, review, decision quality and trading process.",
      productLinks: [
        { label: "Home", href: "/" },
        { label: "Product", href: "/product" },
        { label: "Pricing", href: "/pricing" },
        { label: "About Us", href: "/about" },
      ],
      featureLinks: [
        { label: "AI Trading Desk", href: "/product" },
        { label: "AI Signals", href: "/product" },
        { label: "Market Intelligence", href: "/product" },
        { label: "Journal & Screenshots", href: "/product" },
        { label: "Execution Coach", href: "/product" },
        { label: "Outcome Learning", href: "/product" },
        { label: "Playbook", href: "/product" },
        { label: "Reports", href: "/product" },
        { label: "Learning Center", href: "/product" },
        { label: "Support Assistant", href: "/product" },
      ],
      resourceLinks: [
        { label: "Getting Started", href: "/product" },
        { label: "How SkillEdge Works", href: "/product" },
        { label: "Trading Journal Guide", href: "/product" },
        { label: "AI Signals Guide", href: "/product" },
        { label: "Referral program", href: "/referral" },
],
      legalLinks: [
        { label: "Privacy Policy", href: "/legal/privacy-policy" },
        { label: "Terms & Conditions", href: "/legal/terms" },
        { label: "Disclaimer", href: "/legal/disclaimer" },
        { label: "EULA", href: "/legal/eula" },
        { label: "Billing & Cancellation", href: "/legal/billing" },
        { label: "Cookie Policy", href: "/legal/cookies" },
      ],
    },

    ru: {
      productColumn: "Продукт",
      featuresColumn: "Функции",
      resourcesColumn: "Ресурсы",
      legalColumn: "Документы",
      description:
        "Премиальное AI-пространство для серьёзных трейдеров: рыночная разведка, AI-сигналы, журнал, разбор исполнения, плейбук, отчёты и коучинг в одной системе.",
      choosePlan: "Выбрать тариф",
      requestDemo: "Запросить демо",
      cookieSettings: "Настройки cookies",
      contact: "Контакты",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукта по запросу",
      rights: "© 2026 SkillEdge AI. Все права защищены.",
      bottomNote:
        "Создано для трейдеров, которым нужны структура, дисциплина и измеримый прогресс.",
      disclaimer:
        "SkillEdge AI не является финансовой рекомендацией и не гарантирует прибыль. Платформа создана для улучшения структуры, разбора, качества решений и торгового процесса.",
      productLinks: [
        { label: "Главная", href: "/" },
        { label: "Продукт", href: "/product" },
        { label: "Тарифы", href: "/pricing" },
        { label: "О нас", href: "/about" },
      ],
      featureLinks: [
        { label: "AI Trading Desk", href: "/product" },
        { label: "AI-сигналы", href: "/product" },
        { label: "Рыночная разведка", href: "/product" },
        { label: "Журнал и скриншоты", href: "/product" },
        { label: "Коуч исполнения", href: "/product" },
        { label: "Обучение на результатах", href: "/product" },
        { label: "Плейбук", href: "/product" },
        { label: "Отчёты", href: "/product" },
        { label: "Центр обучения", href: "/product" },
        { label: "Помощник поддержки", href: "/product" },
      ],
      resourceLinks: [
        { label: "Начало работы", href: "/product" },
        { label: "Как работает SkillEdge", href: "/product" },
        { label: "Гайд по журналу сделок", href: "/product" },
        { label: "Гайд по AI-сигналам", href: "/product" },
        { label: "Реферальная программа", href: "/referral" },
],
      legalLinks: [
        { label: "Политика конфиденциальности", href: "/legal/privacy-policy" },
        { label: "Условия использования", href: "/legal/terms" },
        { label: "Дисклеймер", href: "/legal/disclaimer" },
        { label: "Лицензионное соглашение", href: "/legal/eula" },
        { label: "Оплата и отмена", href: "/legal/billing" },
        { label: "Политика cookies", href: "/legal/cookies" },
      ],
    },

    ua: {
      productColumn: "Продукт",
      featuresColumn: "Функції",
      resourcesColumn: "Ресурси",
      legalColumn: "Документи",
      description:
        "Преміальний AI-простір для серйозних трейдерів: ринкова розвідка, AI-сигнали, журнал, розбір виконання, плейбук, звіти та коучинг в одній системі.",
      choosePlan: "Обрати тариф",
      requestDemo: "Запросити демо",
      cookieSettings: "Налаштування cookies",
      contact: "Контакти",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Демо продукту за запитом",
      rights: "© 2026 SkillEdge AI. Усі права захищені.",
      bottomNote:
        "Створено для трейдерів, яким потрібні структура, дисципліна та вимірюваний прогрес.",
      disclaimer:
        "SkillEdge AI не є фінансовою рекомендацією та не гарантує прибуток. Платформа створена для покращення структури, розбору, якості рішень і торгового процесу.",
      productLinks: [
        { label: "Головна", href: "/" },
        { label: "Продукт", href: "/product" },
        { label: "Тарифи", href: "/pricing" },
        { label: "Про нас", href: "/about" },
      ],
      featureLinks: [
        { label: "AI Trading Desk", href: "/product" },
        { label: "AI-сигнали", href: "/product" },
        { label: "Ринкова розвідка", href: "/product" },
        { label: "Журнал і скріншоти", href: "/product" },
        { label: "Коуч виконання", href: "/product" },
        { label: "Навчання на результатах", href: "/product" },
        { label: "Плейбук", href: "/product" },
        { label: "Звіти", href: "/product" },
        { label: "Центр навчання", href: "/product" },
        { label: "Помічник підтримки", href: "/product" },
      ],
      resourceLinks: [
        { label: "Початок роботи", href: "/product" },
        { label: "Як працює SkillEdge", href: "/product" },
        { label: "Гайд по журналу угод", href: "/product" },
        { label: "Гайд по AI-сигналах", href: "/product" },
        { label: "Партнерська програма", href: "/referral" },
],
      legalLinks: [
        { label: "Політика конфіденційності", href: "/legal/privacy-policy" },
        { label: "Умови використання", href: "/legal/terms" },
        { label: "Дисклеймер", href: "/legal/disclaimer" },
        { label: "Ліцензійна угода", href: "/legal/eula" },
        { label: "Оплата та скасування", href: "/legal/billing" },
        { label: "Політика cookies", href: "/legal/cookies" },
      ],
    },
  }[language];

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/10 bg-[#07111F]">
      <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-[#C8A96B]/10 blur-3xl" />
      <div className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-[#00C076]0/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-12 md:px-8">
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
              {copy.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonX onClick={() => setActive("pricing")}>
                {copy.choosePlan}
                <span className="ml-2">→</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => handleCheckout("demo", "monthly")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {copy.requestDemo}
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-xs leading-6 text-amber-50/65">
              {copy.disclaimer}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FooterColumn title={copy.productColumn} links={copy.productLinks} />
<FooterColumn title={copy.resourcesColumn} links={copy.resourceLinks} />

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                {copy.legalColumn}
              </div>

              <div className="mt-4 space-y-3">
                {copy.legalLinks.map((item) => (
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
                    window.dispatchEvent(
                      new Event("skilledge:open-cookie-settings")
                    );
                  }}
                  className="block text-left text-sm text-[#E6EDF7]/70 transition hover:text-[#E6EDF7]"
                >
                  {copy.cookieSettings}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 border-t border-white/10 pt-8 text-sm text-white/45 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-semibold text-white/70">
              {copy.contact}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <span>support@upyourskills.site</span>
              <span>{copy.location}</span>
              <span>{copy.demo}</span>
            </div>
          </div>

          <div className="md:text-right">
            <div>{copy.rights}</div>
            <div className="mt-2 text-xs text-white/35">
              {copy.bottomNote}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

const footerGuideHref: Record<string, string> = {
  "Гайд по журналу сделок": "/journal-guide",
  "Гайд по журналу угод": "/journal-guide",
  "Journal guide": "/journal-guide",
  "Trading journal guide": "/journal-guide",

  "Гайд по AI-сигналам": "/ai-guide",
  "Гайд по AI": "/ai-guide",
  "AI guide": "/ai-guide",
  "AI signals guide": "/ai-guide",

  "Реферальная программа": "/referral",
  "Referral program": "/referral",
  "Партнерська програма": "/referral",
};

function getFooterLinkLabel(link: any) {
  if (typeof link === "string") return link;

  if (link && typeof link === "object") {
    return link.label || link.title || link.text || link.name || "";
  }

  return "";
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: any[];
}) {
  return (
    <div>
      <h4 className="text-xs font-black uppercase tracking-[0.28em] text-white/38">
        {title}
      </h4>

      <div className="mt-4 space-y-2">
        {links.map((link, index) => {
          const label = getFooterLinkLabel(link);
          const href =
  footerGuideHref[label.trim()] ||
  (link && typeof link === "object" && link.href ? link.href : "");

          if (!label) return null;

          if (href) {
            return (
              <Link
                key={`${label}-${index}`}
                href={href}
                className="block text-sm font-semibold text-white/56 transition hover:text-[#E6EDF7]"
              >
                {label}
              </Link>
            );
          }

          return (
            <span
              key={`${label}-${index}`}
              className="block text-sm font-semibold text-white/45"
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AuthModal(props: {
  authMode: AuthMode;
  authLabels: any;
  authEmail: string;
  authPassword: string;
  authStatus: string;
  setAuthEmail: (value: string) => void;
  setAuthPassword: (value: string) => void;
  closeAuthModal: () => void;
  handleAuthSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  setAuthMode: (value: AuthMode) => void;
  setAuthStatus: (value: string) => void;
}) {
  const { authMode, authLabels, authEmail, authPassword, authStatus, setAuthEmail, setAuthPassword, closeAuthModal, handleAuthSubmit, setAuthMode, setAuthStatus } = props;

  return (
    <AnimatePresence>
      {authMode && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-xl">
          <motion.div initial={{ opacity: 0, scale: 0.94, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 18 }} transition={{ duration: 0.25 }} className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#101522] p-8 text-white shadow-2xl shadow-indigo-950/40">
            <div className="absolute -left-20 -top-20 h-44 w-44 rounded-full bg-[#C8A96B]/20 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-44 w-44 rounded-full bg-[#00C076]0/10 blur-3xl" />

            <button onClick={closeAuthModal} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={authLabels.close}>
              ×
            </button>

            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.3em] text-white/35">SkillEdge AI</p>
              <h2 className="mt-4 text-3xl font-semibold">{authMode === "login" ? authLabels.loginTitle : authLabels.registerTitle}</h2>

              <form onSubmit={handleAuthSubmit} className="mt-7 space-y-4">
                <input type="email" placeholder={authLabels.email} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white/25" />
                <input type="password" placeholder={authLabels.password} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={6} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-white/25" />
                <button className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02]">
                  {authMode === "login" ? authLabels.loginButton : authLabels.registerButton}
                </button>
              </form>

              {authStatus && <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-white/65">{authStatus}</p>}

              <button
                onClick={() => {
                  setAuthStatus("");
                  setAuthMode(authMode === "login" ? "register" : "login");
                }}
                className="mt-5 text-sm text-white/50 transition hover:text-white"
              >
                {authMode === "login" ? authLabels.switchToRegister : authLabels.switchToLogin}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HeroSection({
  badge,
  title,
  text,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  cards,
}: {
  badge: string;
  title: string;
  text: string;
  primary: string;
  secondary: string;
  onPrimary: () => void;
  onSecondary: () => void;
  cards: [string, string][];
}) {
  return (
    <section className="relative overflow-hidden rounded-[2.75rem] border border-[#C8A96B]/12 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
  <Glow />

  <motion.div
    aria-hidden
    animate={{ x: ["-20%", "120%"] }}
    transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
    className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-[#E6EDF7]/45 to-transparent"
  />

  <motion.div
    aria-hidden
    animate={{ opacity: [0.18, 0.34, 0.18], scale: [1, 1.08, 1] }}
    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-[#00C076]/12 blur-3xl"
  />
      <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <Badge>{badge}</Badge>
          <h1 className="mt-7 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-4xl">{title}</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg">{text}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonX onClick={onPrimary}>{primary}<span className="ml-2">→</span></ButtonX>
            <button onClick={onSecondary} className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">{secondary}</button>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.45 }} className="relative rounded-[2.25rem] border border-[#00C076]/15 bg-[#0b1220]/90 p-5 shadow-[0_24px_110px_rgba(0,0,0,0.55)]">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#00D084]/20 blur-2xl" />
          <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[#E6EDF7]/45">SkillEdge AI</div>
              <div className="mt-2 text-xl font-semibold text-white">Trading workflow</div>
            </div>
            <div className="rounded-full border border-[#00D084]/20 bg-[#00C076]/10 px-3 py-1 text-xs font-semibold text-[#DFFFEF]">Live</div>
          </div>
          <div className="relative mt-5 grid gap-3">
            {cards.map(([label, value], index) => (
              <motion.div key={label} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.32 + index * 0.06 }} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-sm font-semibold text-white/85">{label}</div>
                <div className="mt-2 text-xs leading-5 text-white/48">{value}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div>
      {eyebrow ? <Badge>{eyebrow}</Badge> : null}
      <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight md:text-4xl">{title}</h2>
      {text ? <p className="mt-5 max-w-3xl text-base leading-8 text-white/65">{text}</p> : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="inline-flex items-center gap-2 rounded-full border border-[#C8A96B]/18 bg-[#C8A96B]/[0.075] px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-[#E6EDF7]/78 shadow-[0_0_40px_rgba(0,192,118,0.08)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#00C076] shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
      {children}
    </motion.div>
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
    <motion.div
      whileHover={{ y: -5, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 transition duration-300 hover:border-[#C8A96B]/22 hover:bg-white/[0.06] hover:shadow-[0_28px_110px_rgba(0,192,118,0.10)] ${className}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-[#00C076]/0 blur-3xl transition duration-500 group-hover:bg-[#00C076]/12" />
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100">
        <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[#E6EDF7]/35 to-transparent" />
      </div>

      <div className="relative z-10">{children}</div>
    </motion.div>
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
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.025 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`group relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076] px-6 py-3 text-sm font-black text-[#07111F] shadow-[0_18px_55px_rgba(0,192,118,0.16)] transition duration-300 hover:shadow-[0_24px_80px_rgba(0,192,118,0.24)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
        <span className="absolute -left-20 top-0 h-full w-16 rotate-12 bg-white/70 blur-md transition duration-700 group-hover:left-[120%]" />
      </span>

      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.9),transparent_42%)] opacity-45" />

      <span className="relative z-10 flex items-center justify-center">
        {children}
      </span>
    </motion.button>
  );
}

function InfoCard({ title, text, index }: { title: string; text: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.05 }} whileHover={{ y: -5 }} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <div className="text-xl font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-7 text-white/60">{text}</p>
    </motion.div>
  );
}

function StepCard({ step, title, text, index }: { step: string; title: string; text: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.05 }} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:grid-cols-[72px_1fr]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00C076]/20 bg-[#00C076]/10 text-sm font-semibold text-[#E6EDF7]">{step}</div>
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        <p className="mt-2 text-sm leading-7 text-white/58">{text}</p>
      </div>
    </motion.div>
  );
}

function ModuleCard({ title, text, items, index }: { title: string; text: string; items: string[]; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.035 }} whileHover={{ y: -4 }} className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <div className="text-xl font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-7 text-white/60">{text}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex gap-3 text-sm text-white/68">
            <Icon name="check" className="text-[#00C076]" />
            {item}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ComparisonCard({ title, weak, strong, index }: { title: string; weak: string; strong: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.06 }} whileHover={{ y: -4 }} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
      <div className="text-xl font-semibold text-white">{title}</div>
      <div className="mt-5 rounded-2xl border border-red-300/15 bg-red-300/[0.035] p-4 text-sm leading-6 text-red-50/65">{weak}</div>
      <div className="mt-3 rounded-2xl border border-[#00D084]/15 bg-[#00C076]/[0.035] p-4 text-sm leading-6 text-[#E6EDF7]/72">{strong}</div>
    </motion.div>
  );
}

function FinalCta({ title, text, checklist, button, onClick }: { title: string; text: string; checklist: string[]; button: string; onClick: () => void }) {
  return (
    <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-[#C8A96B]/15 via-white/[0.04] to-[#E6EDF7]0/10 p-6 md:p-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <h2 className="text-4xl font-semibold leading-tight text-white md:text-4xl">{title}</h2>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">{text}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
          <div className="mt-1 space-y-3">
            {checklist.map((item) => (
              <div key={item} className="flex gap-3 text-sm text-white/70">
                <Icon name="check" className="text-[#00C076]" />
                {item}
              </div>
            ))}
          </div>
          <ButtonX onClick={onClick} className="mt-6 w-full">{button}<span className="ml-2">→</span></ButtonX>
        </div>
      </div>
    </section>
  );
}

function HeroVisual({ t }: { t: any }) {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-0 rounded-[2rem] bg-[#C8A96B]/20 blur-3xl" />
      <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-white/45">
            <span>SkillEdge AI</span>
            <span>Live</span>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm text-white/45">{t.productPage.flowEyebrow}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-2xl font-semibold">AI Trading Desk</div>
              <div className="rounded-full border border-[#00D084]/30 bg-[#00C076]/10 px-3 py-1 text-xs text-[#00D084]">Process</div>
            </div>
            <div className="mt-5 h-28 rounded-2xl bg-gradient-to-br from-[#C8A96B]/25 to-fuchsia-500/20 p-4">
              <svg viewBox="0 0 280 90" className="h-full w-full">
                <path d="M0 70 C 45 60, 55 10, 100 35 S 170 85, 220 40 S 260 30, 280 35" fill="none" stroke="currentColor" strokeWidth="4" className="text-indigo-300" />
                <path d="M0 80 C 40 65, 70 70, 105 58 S 170 55, 220 48 S 255 45, 280 42" fill="none" stroke="currentColor" strokeWidth="3" className="text-fuchsia-300" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Glow() {
  return (
    <>
      <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#00C076]0/20 blur-3xl" />
      <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-[#C8A96B]/20 blur-3xl" />
      <div className="absolute left-1/2 top-12 h-48 w-48 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
    </>
  );
}

function getPlanClasses(accent: "core" | "edge" | "elite") {
  if (accent === "edge") {
    return "border-indigo-300/45 bg-gradient-to-b from-[#C8A96B]/20 via-white/[0.05] to-white/[0.025] shadow-[0_24px_100px_rgba(79,70,229,0.2)]";
  }

  if (accent === "elite") {
    return "border-[#00C076]/45 bg-gradient-to-b from-[#E6EDF7]0/20 via-white/[0.055] to-white/[0.025] shadow-[0_24px_120px_rgba(0,192,118,0.22)]";
  }

  return "border-white/10 bg-white/[0.035]";
}

function getBadgeClasses(accent: "core" | "edge" | "elite") {
  if (accent === "edge") {
    return "border-indigo-300/25 bg-indigo-300/10 text-indigo-100";
  }

  if (accent === "elite") {
    return "border-[#00C076]/25 bg-[#00C076]/10 text-[#E6EDF7]";
  }

  return "border-white/10 bg-white/[0.05] text-white/65";
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


