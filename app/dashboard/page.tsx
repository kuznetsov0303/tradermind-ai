"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";
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
  user_id: string | null;
  subscription_id: string | null;
  trade_id: string | null;
  analysis_type: string | null;
  user_message: string | null;
  ai_response: string | null;
  model: string | null;
  tokens_used: number | null;
  created_at: string | null;
};

type Trade = {
  id: string;
  user_id: string;
  ticker: string;
  market: "stocks" | "crypto" | "futures" | "forex" | "options";
  direction: "long" | "short";
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  position_size: number | null;
  risk_amount: number | null;
  pnl: number | null;
  result: "win" | "loss" | "breakeven" | null;
  setup: string | null;
  emotion: string | null;
  mistake: string | null;
  lesson: string | null;
  notes: string | null;
  screenshot_url: string | null;
  trade_date: string;
  created_at: string;
};

type TradeScreenshot = {
  id: string;
  trade_id: string;
  user_id: string;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  screenshot_type: string | null;
  created_at: string;
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
    
journal: {
  title: "Trade journal",
  text: "Add trades, track risk, result, emotions, mistakes and lessons.",
  locked: "An active plan or demo access is required to add trades.",
  addTitle: "Add trade",
  addText:
    "Fill in the basic data. Later we will connect screenshots and AI review for each trade.",
  totalTrades: "Total trades",
  totalPnl: "Total PnL",
  winRate: "Win rate",
  avgPnl: "Avg PnL",
  grossProfit: "Gross Profit",
grossLoss: "Gross Loss",
bestTrade: "Best Trade",
worstTrade: "Worst Trade",
profitFactor: "Profit Factor",
equityTitle: "Equity curve",
equityText: "Cumulative PnL based on saved trades.",
equityEmpty: "Add trades with PnL to build your equity curve.",
equityPoints: "points",
expand: "Expand",
close: "Close",
cardLabels: {
  entry: "Entry",
  exit: "Exit",
  stop: "Stop",
  risk: "Risk",
  result: "Result",
  setup: "Setup",
  mistake: "Mistake",
  lesson: "Lesson",
  notes: "Notes",
},
fullTitle: "Full journal",
fullText: "Complete trade list. Filters and export are available below.",
downloadCsv: "Download CSV",
downloadXlsx: "Download XLSX",
uploadScreenshotTitle: "Upload trade screenshot",
uploadScreenshotText:
  "Attach chart screenshots to your saved trades. Later SkillEdge AI will use them to analyze entries, exits, stops and repeated chart mistakes.",
screenshotsCount: "screenshots",
screenshotTradeLabel: "Trade",
screenshotFileLabel: "Screenshot",
screenshotChoose: "Choose screenshot",
screenshotNoFile: "No file selected",
screenshotSelected: "Selected file",
screenshotHint:
  "Steps: 1) Select a trade  2) Click “Choose screenshot”  3) Click “Upload”",
screenshotFormats: "Supported formats: PNG, JPG, WEBP",
uploadButton: "Upload",
uploadingButton: "Uploading...",
selectTradePlaceholder: "Select trade",
stepOne: "{t.journal.stepOne}",
stepTwo: "{t.journal.stepTwo}",
stepThree: "{t.journal.stepThree}",
chartAnalyzeButton: "Analyze chart",
chartAnalyzingButton: "Analyzing chart...",
chartScreenshotsLabel: "screenshots",
journalAnalysisTitle: "SkillEdge AI Journal Analysis",
journalAnalysisText:
  "AI will analyze your saved trades, repeated mistakes, setups, emotions, risk and execution quality.",
journalAnalyzeButton: "Analyze journal",
journalAnalyzingButton: "Analyzing...",
savedChartAnalysis: "Saved AI chart analysis",
showChartHistory: "Show AI history",
hideChartHistory: "Hide AI history",
noChartHistory: "No saved chart analyses yet.",
searchTicker: "Search ticker",
allMarkets: "All markets",
allSides: "All sides",
allResults: "All results",
table: {
  date: "Date",
  ticker: "Ticker",
  market: "Market",
  side: "Side",
  entry: "Entry",
  exit: "Exit",
  stop: "Stop",
  risk: "Risk",
  pnl: "PnL",
  result: "Result",
  setup: "Setup",
},
  recentTitle: "Recent trades",
  recentText:
    "Last 3 trades from your personal journal. Full table and export will be added next.",
  empty:
    "No trades yet. Add your first trade to start building your performance database.",
  tradesCount: "trades",
  saving: "Saving...",
  save: "Save trade",
  tickerRequired: "Enter ticker.",
  loginFirst: "Please log in first.",
  saveFailed: "Failed to save trade.",
  fields: {
    ticker: "Ticker",
    date: "Date",
    market: "Market",
    direction: "Direction",
    entry: "Entry",
    exit: "Exit",
    stop: "Stop",
    size: "Size",
    risk: "Risk $",
    pnl: "PnL $",
    result: "Result",
    setup: "Setup",
    emotion: "Emotion",
    mistake: "Mistake",
    lesson: "Lesson",
    notes: "Notes",
  },
  placeholders: {
    ticker: "AAPL / BTC / NQ",
    entry: "100",
    exit: "105",
    stop: "98",
    size: "Shares / contracts",
    risk: "50",
    pnl: "-25 / 120",
    setup: "VWAP reclaim / gap fade",
    emotion: "Calm / FOMO / fear",
    mistake: "What did you do wrong?",
    lesson: "What should you remember next time?",
    notes: "Context, catalyst, tape, levels...",
  },
  options: {
    notSet: "Not set",
    win: "Win",
    loss: "Loss",
    breakeven: "Breakeven",
  },
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
    
journal: {
  title: "Журнал сделок",
  text: "Добавляйте сделки, фиксируйте риск, результат, эмоции, ошибки и уроки.",
  locked: "Для добавления сделок нужен активный тариф или demo-доступ.",
  addTitle: "Добавить сделку",
  addText:
    "Заполните базовые данные. Позже мы подключим скриншоты и AI-разбор конкретной сделки.",
  totalTrades: "Всего сделок",
  totalPnl: "Общий PnL",
  winRate: "Win rate",
  avgPnl: "Средний PnL",
  grossProfit: "Gross profit",
grossLoss: "Gross loss",
bestTrade: "Лучшая сделка",
worstTrade: "Худшая сделка",
profitFactor: "Profit factor",
equityTitle: "Кривая PnL",
equityText: "Накопительный PnL на основе сохранённых сделок.",
equityEmpty: "Добавьте сделки с PnL, чтобы построить кривую доходности.",
equityPoints: "точек",
expand: "Развернуть",
close: "Закрыть",
cardLabels: {
  entry: "Вход",
  exit: "Выход",
  stop: "Стоп",
  risk: "Риск",
  result: "Результат",
  setup: "Сетап",
  mistake: "Ошибка",
  lesson: "Урок",
  notes: "Заметки",
},
fullTitle: "Полный журнал",
fullText: "Полный список сделок. Ниже доступны фильтры и экспорт.",
downloadCsv: "Скачать CSV",
downloadXlsx: "Скачать XLSX",
uploadScreenshotTitle: "Загрузка скриншота сделки",
uploadScreenshotText:
  "Прикрепляйте скриншоты графиков к сохранённым сделкам. Позже SkillEdge AI будет использовать их для анализа входов, выходов, стопов и повторяющихся ошибок на графике.",
screenshotsCount: "скриншотов",
screenshotTradeLabel: "Сделка",
screenshotFileLabel: "Скриншот",
screenshotChoose: "Выбрать скриншот",
screenshotNoFile: "Файл не выбран",
screenshotSelected: "Выбранный файл",
screenshotHint:
  "Шаги: 1) Выберите сделку  2) Нажмите «Выбрать скриншот»  3) Нажмите «Загрузить»",
screenshotFormats: "Поддерживаемые форматы: PNG, JPG, WEBP",
uploadButton: "Загрузить",
uploadingButton: "Загрузка...",
selectTradePlaceholder: "Выберите сделку",
stepOne: "Шаг 1",
stepTwo: "Шаг 2",
stepThree: "Шаг 3",
chartAnalyzeButton: "Разобрать график",
chartAnalyzingButton: "Анализ графика...",
chartScreenshotsLabel: "скриншотов",
journalAnalysisTitle: "AI-анализ журнала сделок",
journalAnalysisText:
  "AI проанализирует сохранённые сделки, повторяющиеся ошибки, сетапы, эмоции, риск и качество исполнения.",
journalAnalyzeButton: "Разобрать журнал",
journalAnalyzingButton: "Анализ...",
savedChartAnalysis: "Сохранённый AI-разбор графика",
showChartHistory: "Показать AI-разборы",
hideChartHistory: "Скрыть AI-разборы",
noChartHistory: "Сохранённых разборов графика пока нет.",
searchTicker: "Поиск тикера",
allMarkets: "Все рынки",
allSides: "Все направления",
allResults: "Все результаты",
table: {
  date: "Дата",
  ticker: "Тикер",
  market: "Рынок",
  side: "Сторона",
  entry: "Вход",
  exit: "Выход",
  stop: "Стоп",
  risk: "Риск",
  pnl: "PnL",
  result: "Результат",
  setup: "Сетап",
},
  recentTitle: "Последние сделки",
  recentText:
    "Последние 3 сделки из личного журнала. Полную таблицу и экспорт добавим следующим шагом.",
  empty:
    "Сделок пока нет. Добавьте первую сделку, чтобы начать собирать базу своей статистики.",
  tradesCount: "сделок",
  saving: "Сохраняем...",
  save: "Сохранить сделку",
  tickerRequired: "Введите тикер.",
  loginFirst: "Сначала войдите в аккаунт.",
  saveFailed: "Не удалось сохранить сделку.",
  fields: {
    ticker: "Тикер",
    date: "Дата",
    market: "Рынок",
    direction: "Направление",
    entry: "Вход",
    exit: "Выход",
    stop: "Стоп",
    size: "Размер позиции",
    risk: "Риск $",
    pnl: "PnL $",
    result: "Результат",
    setup: "Сетап",
    emotion: "Эмоция",
    mistake: "Ошибка",
    lesson: "Урок",
    notes: "Заметки",
  },
  placeholders: {
    ticker: "AAPL / BTC / NQ",
    entry: "100",
    exit: "105",
    stop: "98",
    size: "Акции / контракты",
    risk: "50",
    pnl: "-25 / 120",
    setup: "VWAP reclaim / gap fade",
    emotion: "Спокойствие / FOMO / страх",
    mistake: "Что было сделано неправильно?",
    lesson: "Что нужно запомнить на следующую сделку?",
    notes: "Контекст, катализатор, лента, уровни...",
  },
  options: {
    notSet: "Не задано",
    win: "Плюс",
    loss: "Минус",
    breakeven: "Безубыток",
  },
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
    
journal: {
  title: "Журнал угод",
  text: "Додавайте угоди, фіксуйте ризик, результат, емоції, помилки та уроки.",
  locked: "Для додавання угод потрібен активний тариф або demo-доступ.",
  addTitle: "Додати угоду",
  addText:
    "Заповніть базові дані. Пізніше ми підключимо скриншоти та AI-розбір конкретної угоди.",
  totalTrades: "Усього угод",
  totalPnl: "Загальний PnL",
  winRate: "Win rate",
  avgPnl: "Середній PnL",
  grossProfit: "Gross profit",
grossLoss: "Gross loss",
bestTrade: "Найкраща угода",
worstTrade: "Найгірша угода",
profitFactor: "Profit factor",
equityTitle: "Крива PnL",
equityText: "Накопичувальний PnL на основі збережених угод.",
equityEmpty: "Додайте угоди з PnL, щоб побудувати криву дохідності.",
equityPoints: "точок",
expand: "Розгорнути",
close: "Закрити",
cardLabels: {
  entry: "Вхід",
  exit: "Вихід",
  stop: "Стоп",
  risk: "Ризик",
  result: "Результат",
  setup: "Сетап",
  mistake: "Помилка",
  lesson: "Урок",
  notes: "Нотатки",
},
fullTitle: "Повний журнал",
fullText: "Повний список угод. Нижче доступні фільтри та експорт.",
downloadCsv: "Завантажити CSV",
downloadXlsx: "Завантажити XLSX",
uploadScreenshotTitle: "Завантаження скріншота угоди",
uploadScreenshotText:
  "Додавайте скріншоти графіків до збережених угод. Пізніше SkillEdge AI використовуватиме їх для аналізу входів, виходів, стопів і повторюваних помилок на графіку.",
screenshotsCount: "скріншотів",
screenshotTradeLabel: "Угода",
screenshotFileLabel: "Скріншот",
screenshotChoose: "Вибрати скріншот",
screenshotNoFile: "Файл не вибрано",
screenshotSelected: "Вибраний файл",
screenshotHint:
  "Кроки: 1) Оберіть угоду  2) Натисніть «Вибрати скріншот»  3) Натисніть «Завантажити»",
screenshotFormats: "Підтримувані формати: PNG, JPG, WEBP",
uploadButton: "Завантажити",
uploadingButton: "Завантаження...",
selectTradePlaceholder: "Оберіть угоду",
stepOne: "Крок 1",
stepTwo: "Крок 2",
stepThree: "Крок 3",
chartAnalyzeButton: "Розібрати графік",
chartAnalyzingButton: "Аналіз графіка...",
chartScreenshotsLabel: "скріншотів",
journalAnalysisTitle: "AI-аналіз журналу угод",
journalAnalysisText:
  "AI проаналізує збережені угоди, повторювані помилки, сетапи, емоції, ризик і якість виконання.",
journalAnalyzeButton: "Розібрати журнал",
journalAnalyzingButton: "Аналіз...",
savedChartAnalysis: "Збережений AI-розбір графіка",
showChartHistory: "Показати AI-розбори",
hideChartHistory: "Сховати AI-розбори",
noChartHistory: "Збережених розборів графіка ще немає.",
searchTicker: "Пошук тикера",
allMarkets: "Усі ринки",
allSides: "Усі напрямки",
allResults: "Усі результати",
table: {
  date: "Дата",
  ticker: "Тикер",
  market: "Ринок",
  side: "Сторона",
  entry: "Вхід",
  exit: "Вихід",
  stop: "Стоп",
  risk: "Ризик",
  pnl: "PnL",
  result: "Результат",
  setup: "Сетап",
},
  recentTitle: "Останні угоди",
  recentText:
    "Останні 3 угоди з особистого журналу. Повну таблицю та експорт додамо наступним кроком.",
  empty:
    "Угод поки немає. Додайте першу угоду, щоб почати збирати базу своєї статистики.",
  tradesCount: "угод",
  saving: "Зберігаємо...",
  save: "Зберегти угоду",
  tickerRequired: "Введіть тикер.",
  loginFirst: "Спочатку увійдіть в акаунт.",
  saveFailed: "Не вдалося зберегти угоду.",
  fields: {
    ticker: "Тикер",
    date: "Дата",
    market: "Ринок",
    direction: "Напрямок",
    entry: "Вхід",
    exit: "Вихід",
    stop: "Стоп",
    size: "Розмір позиції",
    risk: "Ризик $",
    pnl: "PnL $",
    result: "Результат",
    setup: "Сетап",
    emotion: "Емоція",
    mistake: "Помилка",
    lesson: "Урок",
    notes: "Нотатки",
  },
  placeholders: {
    ticker: "AAPL / BTC / NQ",
    entry: "100",
    exit: "105",
    stop: "98",
    size: "Акції / контракти",
    risk: "50",
    pnl: "-25 / 120",
    setup: "VWAP reclaim / gap fade",
    emotion: "Спокій / FOMO / страх",
    mistake: "Що було зроблено неправильно?",
    lesson: "Що потрібно запамʼятати на наступну угоду?",
    notes: "Контекст, каталізатор, стрічка, рівні...",
  },
  options: {
    notSet: "Не задано",
    win: "Плюс",
    loss: "Мінус",
    breakeven: "Беззбиток",
  },
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

function toNumberOrNull(value: string) {
  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  const numberValue = Number(cleaned.replace(",", "."));

  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildEquityCurveData(trades: Trade[]) {
  return [...trades]
    .filter((trade) => trade.pnl !== null)
    .sort((a, b) => {
      const dateA = new Date(a.trade_date).getTime();
      const dateB = new Date(b.trade_date).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .reduce<
      {
        date: string;
        ticker: string;
        pnl: number;
        equity: number;
      }[]
    >((acc, trade) => {
      const previousEquity = acc.length > 0 ? acc[acc.length - 1].equity : 0;
      const pnl = trade.pnl ?? 0;

      acc.push({
        date: trade.trade_date,
        ticker: trade.ticker,
        pnl,
        equity: previousEquity + pnl,
      });

      return acc;
    }, []);
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeScreenshots, setTradeScreenshots] = useState<TradeScreenshot[]>([]);
const [selectedTradeIdForScreenshot, setSelectedTradeIdForScreenshot] = useState("");
const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
const [screenshotUploading, setScreenshotUploading] = useState(false);
const [screenshotError, setScreenshotError] = useState("");
const [chartAnalysisTradeId, setChartAnalysisTradeId] = useState("");
const [chartAnalysis, setChartAnalysis] = useState("");
const [chartAnalysisLoading, setChartAnalysisLoading] = useState(false);
const [chartAnalysisError, setChartAnalysisError] = useState("");
const [chartAnalysisHistory, setChartAnalysisHistory] = useState<AiAnalysis[]>([]);
const [expandedChartAnalysisTradeId, setExpandedChartAnalysisTradeId] =
  useState(""); 
const [equityExpanded, setEquityExpanded] = useState(false);
const [tradeForm, setTradeForm] = useState({
  ticker: "",
  market: "stocks",
  direction: "long",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  positionSize: "",
  riskAmount: "",
  pnl: "",
  result: "",
  setup: "",
  emotion: "",
  mistake: "",
  lesson: "",
  notes: "",
  tradeDate: new Date().toISOString().slice(0, 10),
});
const [tradeSaving, setTradeSaving] = useState(false);
const [tradeError, setTradeError] = useState("");
const [journalAnalysis, setJournalAnalysis] = useState("");
const [journalAnalysisLoading, setJournalAnalysisLoading] = useState(false);
const [journalAnalysisError, setJournalAnalysisError] = useState("");
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

  setChartAnalysisHistory(
  ((analysesData ?? []) as AiAnalysis[]).filter(
    (item) => item.analysis_type === "trade_chart"
  )
);

setCoachHistory((analysesData as AiAnalysis[]) ?? []);
const { data: tradesData } = await supabase
  .from("trades")
  .select("*")
  .eq("user_id", user.id)
  .order("trade_date", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(50);

setTrades((tradesData as Trade[]) ?? []);

const { data: screenshotRows, error: screenshotRowsError } = await supabase
  .from("trade_screenshots")
  .select("*")
  .order("created_at", { ascending: false });

if (screenshotRowsError) {
  console.error("Failed to load trade screenshots:", screenshotRowsError);
} else {
  setTradeScreenshots((screenshotRows ?? []) as TradeScreenshot[]);
}

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

    setCoachHistory((current) =>
  [
    {
      id: crypto.randomUUID(),
      user_id: data.session?.user.id ?? null,
      subscription_id: null,
      trade_id: null,
      analysis_type: "coach",
      user_message: message,
      ai_response: result.answer || "",
      model: "SkillEdge AI Coach",
      tokens_used: null,
      created_at: new Date().toISOString(),
    } as AiAnalysis,
    ...current,
  ].slice(0, 10)
);

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
const handleTradeSubmit = async () => {
  setTradeError("");

  const ticker = tradeForm.ticker.trim().toUpperCase();

  if (!ticker) {
   setTradeError(t.journal.tickerRequired);
    return;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    setTradeError(t.journal.loginFirst);
    return;
  }

  setTradeSaving(true);

  try {
    const payload = {
      user_id: userData.user.id,
      ticker,
      market: tradeForm.market,
      direction: tradeForm.direction,
      entry_price: toNumberOrNull(tradeForm.entryPrice),
      exit_price: toNumberOrNull(tradeForm.exitPrice),
      stop_loss: toNumberOrNull(tradeForm.stopLoss),
      position_size: toNumberOrNull(tradeForm.positionSize),
      risk_amount: toNumberOrNull(tradeForm.riskAmount),
      pnl: toNumberOrNull(tradeForm.pnl),
      result: tradeForm.result || null,
      setup: tradeForm.setup.trim() || null,
      emotion: tradeForm.emotion.trim() || null,
      mistake: tradeForm.mistake.trim() || null,
      lesson: tradeForm.lesson.trim() || null,
      notes: tradeForm.notes.trim() || null,
      trade_date: tradeForm.tradeDate,
    };

    const { data, error } = await supabase
      .from("trades")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setTradeError(error.message);
      return;
    }

    setTrades((current) => [data as Trade, ...current]);

    setTradeForm({
      ticker: "",
      market: "stocks",
      direction: "long",
      entryPrice: "",
      exitPrice: "",
      stopLoss: "",
      positionSize: "",
      riskAmount: "",
      pnl: "",
      result: "",
      setup: "",
      emotion: "",
      mistake: "",
      lesson: "",
      notes: "",
      tradeDate: new Date().toISOString().slice(0, 10),
    });
  } catch {
    setTradeError(t.journal.saveFailed);
  } finally {
    setTradeSaving(false);
  }
};

const handleJournalAnalysis = async () => {
  try {
    setJournalAnalysisLoading(true);
    setJournalAnalysisError("");
    setJournalAnalysis("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setJournalAnalysisError(t.journal.loginFirst);
      return;
    }

    const response = await fetch("/api/journal-analysis", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    language,
  }),
});

    const result = await response.json();

    if (!response.ok) {
      setJournalAnalysisError(result.error || "Journal analysis failed.");
      return;
    }

    setJournalAnalysis(result.answer || "");
  } catch {
    setJournalAnalysisError("Failed to analyze journal.");
  } finally {
    setJournalAnalysisLoading(false);
  }
};
const handleScreenshotUpload = async () => {
  try {
    setScreenshotUploading(true);
    setScreenshotError("");

    if (!selectedTradeIdForScreenshot) {
      setScreenshotError("Select a trade first.");
      return;
    }

    if (!screenshotFile) {
      setScreenshotError("Choose a screenshot file.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) {
      setScreenshotError(t.journal.loginFirst);
      return;
    }

    const safeFileName = screenshotFile.name
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const filePath = `${user.id}/${selectedTradeIdForScreenshot}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("trade-screenshots")
      .upload(filePath, screenshotFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: screenshotFile.type,
      });

    if (uploadError) {
      setScreenshotError(uploadError.message || "Failed to upload screenshot.");
      return;
    }

    const { data: insertedScreenshot, error: insertError } = await supabase
      .from("trade_screenshots")
      .insert({
        trade_id: selectedTradeIdForScreenshot,
        user_id: user.id,
        file_path: filePath,
        file_name: screenshotFile.name,
        file_size: screenshotFile.size,
        mime_type: screenshotFile.type,
        screenshot_type: "chart",
      })
      .select("*")
      .single();

    if (insertError) {
      setScreenshotError(insertError.message || "Failed to save screenshot.");
      return;
    }

    setTradeScreenshots((current) => [
      insertedScreenshot as TradeScreenshot,
      ...current,
    ]);

    setScreenshotFile(null);
    setSelectedTradeIdForScreenshot("");
  } catch {
    setScreenshotError("Screenshot upload failed.");
  } finally {
    setScreenshotUploading(false);
  }
};

const handleTradeChartAnalysis = async (tradeId: string) => {
  try {
    setChartAnalysisTradeId(tradeId);
    setChartAnalysisLoading(true);
    setChartAnalysisError("");
    setChartAnalysis("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setChartAnalysisError(t.journal.loginFirst);
      return;
    }

    const response = await fetch("/api/analyze-trade-screenshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
  tradeId,
  language,
}),
    });

    const result = await response.json();

    if (!response.ok) {
      setChartAnalysisError(result.error || "Chart analysis failed.");
      return;
    }

    setChartAnalysis(result.answer || "");
    setChartAnalysisHistory((current) => [
  {
    id: `local-${Date.now()}`,
    user_id: "",
    subscription_id: null,
    trade_id: tradeId,
    analysis_type: "trade_chart",
    user_message: "Trade chart analysis",
    ai_response: result.answer || "",
    model: null,
    tokens_used: 0,
    created_at: new Date().toISOString(),
  } as AiAnalysis,
  ...current,
]);
setExpandedChartAnalysisTradeId(tradeId);
  } catch {
    setChartAnalysisError("Chart analysis failed.");
  } finally {
    setChartAnalysisLoading(false);
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
             
             {activeTab === "journal" && (
  <JournalTab
    trades={trades}
    tradeForm={tradeForm}
    tradeSaving={tradeSaving}
    tradeError={tradeError}
    locked={locked}
    t={t}
    journalAnalysis={journalAnalysis}
journalAnalysisLoading={journalAnalysisLoading}
journalAnalysisError={journalAnalysisError}
tradeScreenshots={tradeScreenshots}
selectedTradeIdForScreenshot={selectedTradeIdForScreenshot}
screenshotFile={screenshotFile}
screenshotUploading={screenshotUploading}
screenshotError={screenshotError}
chartAnalysisTradeId={chartAnalysisTradeId}
chartAnalysis={chartAnalysis}
chartAnalysisLoading={chartAnalysisLoading}
chartAnalysisError={chartAnalysisError}
chartAnalysisHistory={chartAnalysisHistory}
expandedChartAnalysisTradeId={expandedChartAnalysisTradeId}
onExpandedChartAnalysisTradeIdChange={setExpandedChartAnalysisTradeId}
onTradeChartAnalysis={handleTradeChartAnalysis}
onSelectedTradeIdForScreenshotChange={setSelectedTradeIdForScreenshot}
onScreenshotFileChange={setScreenshotFile}
onScreenshotUpload={handleScreenshotUpload}
onJournalAnalysis={handleJournalAnalysis}
    onTradeFormChange={setTradeForm}
    onTradeSubmit={handleTradeSubmit}
  />
)}
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

{activeTab === "journal" && (
  <motion.div
  className="mt-6"
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45 }}
  >
    <EquityCurveCard
  trades={trades}
  compact
  t={t}
  onExpand={() => setEquityExpanded(true)}
/>
  </motion.div>
)}

            </motion.div>
          </aside>
        </motion.section>
      </div>

{equityExpanded && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-md">
    <div className="relative w-full max-w-6xl">
      <button
        type="button"
        onClick={() => setEquityExpanded(false)}
        className="absolute -right-2 -top-14 rounded-full border border-white/10 bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.03]"
      >
        ✕ {t.journal.close}
      </button>

      <EquityCurveCard trades={trades} t={t} />
    </div>
  </div>
)}

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

function JournalTab({
  trades,
  tradeForm,
  tradeSaving,
  tradeError,
  locked,
  t,
  journalAnalysis,
  journalAnalysisLoading,
  journalAnalysisError,
  tradeScreenshots,
  selectedTradeIdForScreenshot,
  screenshotFile,
  screenshotUploading,
  screenshotError,
  chartAnalysisTradeId,
 chartAnalysis,
 chartAnalysisLoading,
 chartAnalysisError,
 chartAnalysisHistory,
 expandedChartAnalysisTradeId,
onExpandedChartAnalysisTradeIdChange,
  onTradeFormChange,
  onTradeSubmit,
  onJournalAnalysis,
  onSelectedTradeIdForScreenshotChange,
  onScreenshotFileChange,
  onScreenshotUpload,
  onTradeChartAnalysis,
}: {
  trades: Trade[];
  tradeForm: {
    ticker: string;
    market: string;
    direction: string;
    entryPrice: string;
    exitPrice: string;
    stopLoss: string;
    positionSize: string;
    riskAmount: string;
    pnl: string;
    result: string;
    setup: string;
    emotion: string;
    mistake: string;
    lesson: string;
    notes: string;
    tradeDate: string;
  };
  tradeSaving: boolean;
  tradeError: string;
  locked: boolean;
  t: (typeof dashboardDict)[Language];
  journalAnalysis: string;
journalAnalysisLoading: boolean;
journalAnalysisError: string;
tradeScreenshots: TradeScreenshot[];
selectedTradeIdForScreenshot: string;
screenshotFile: File | null;
screenshotUploading: boolean;
screenshotError: string;
chartAnalysisTradeId: string;
chartAnalysis: string;
chartAnalysisLoading: boolean;
chartAnalysisError: string;
chartAnalysisHistory: AiAnalysis[];
expandedChartAnalysisTradeId: string;
onExpandedChartAnalysisTradeIdChange: (tradeId: string) => void;
onSelectedTradeIdForScreenshotChange: (value: string) => void;
onScreenshotFileChange: (file: File | null) => void;
onScreenshotUpload: () => void;
onTradeChartAnalysis: (tradeId: string) => void;
onJournalAnalysis: () => void;
  onTradeFormChange: React.Dispatch<
    React.SetStateAction<{
      ticker: string;
      market: string;
      direction: string;
      entryPrice: string;
      exitPrice: string;
      stopLoss: string;
      positionSize: string;
      riskAmount: string;
      pnl: string;
      result: string;
      setup: string;
      emotion: string;
      mistake: string;
      lesson: string;
      notes: string;
      tradeDate: string;
    }>
  >;
  onTradeSubmit: () => void;
}) {

function EquityCurveCard({
  trades,
  compact = false,
  t,
  onExpand,
}: {
  trades: Trade[];
  compact?: boolean;
  t: (typeof dashboardDict)[Language];
  onExpand?: () => void;
}) {
  const equityCurveData = buildEquityCurveData(trades);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

  return (
    <div
      className={
        compact
          ? "rounded-3xl border border-white/10 bg-white/[0.04] p-5"
          : "rounded-3xl border border-white/10 bg-[#111621] p-6 shadow-2xl"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>
            {t.journal.equityTitle}
          </h3>
          <p className="mt-2 text-xs leading-6 text-white/45">
            {t.journal.equityText}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
            {equityCurveData.length} {t.journal.equityPoints}
          </div>

          {compact && onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {t.journal.expand}
            </button>
          )}
        </div>
      </div>

     <div
  className={
    compact
      ? "mt-5 h-[230px] w-full overflow-hidden"
      : "mt-6 h-[520px] w-full overflow-x-auto overflow-y-hidden"
  }
>
        {!mounted ? (
  <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-black/20 text-center text-sm leading-6 text-white/45">
    Loading chart...
  </div>
) : equityCurveData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-black/20 text-center text-sm leading-6 text-white/45">
            {t.journal.equityEmpty}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#080c16",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "16px",
                  color: "#fff",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke="#67e8f9"
                strokeWidth={3}
                dot={{ r: compact ? 3 : 4 }}
                activeDot={{ r: compact ? 5 : 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

  const updateField = (field: keyof typeof tradeForm, value: string) => {
    onTradeFormChange((current) => ({
      ...current,
      [field]: value,
    }));
  };

const getTradeScreenshots = (tradeId: string) => {
  return tradeScreenshots.filter((item) => item.trade_id === tradeId);
};

  const totalTrades = trades.length;

const totalPnl = trades.reduce((sum, trade) => {
  return sum + (trade.pnl ?? 0);
}, 0);

const wins = trades.filter((trade) => trade.result === "win").length;

const closedTrades = trades.filter(
  (trade) => trade.result === "win" || trade.result === "loss"
).length;

const winRate =
  closedTrades > 0 ? Math.round((wins / closedTrades) * 100) : null;

const averagePnl =
  totalTrades > 0 ? totalPnl / totalTrades : null;

  const pnlValues = trades
  .map((trade) => trade.pnl)
  .filter((pnl): pnl is number => pnl !== null);

const grossProfit = pnlValues
  .filter((pnl) => pnl > 0)
  .reduce((sum, pnl) => sum + pnl, 0);

const grossLoss = pnlValues
  .filter((pnl) => pnl < 0)
  .reduce((sum, pnl) => sum + pnl, 0);

const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : null;

const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : null;

const profitFactor =
  grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;

const recentTrades = trades.slice(0, 3);

const [journalFilters, setJournalFilters] = useState({
  ticker: "",
  market: "all",
  direction: "all",
  result: "all",
});

const updateJournalFilter = (
  field: keyof typeof journalFilters,
  value: string
) => {
  setJournalFilters((current) => ({
    ...current,
    [field]: value,
  }));
};

const filteredTrades = trades.filter((trade) => {
  const tickerMatch = trade.ticker
    .toLowerCase()
    .includes(journalFilters.ticker.trim().toLowerCase());

  const marketMatch =
    journalFilters.market === "all" || trade.market === journalFilters.market;

  const directionMatch =
    journalFilters.direction === "all" ||
    trade.direction === journalFilters.direction;

  const resultMatch =
    journalFilters.result === "all" || trade.result === journalFilters.result;

  return tickerMatch && marketMatch && directionMatch && resultMatch;
});

const equityCurveData = [...trades]
  .filter((trade) => trade.pnl !== null)
  .sort((a, b) => {
    const dateA = new Date(a.trade_date).getTime();
    const dateB = new Date(b.trade_date).getTime();

    if (dateA !== dateB) {
      return dateA - dateB;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })
  .reduce<
    {
      date: string;
      ticker: string;
      pnl: number;
      equity: number;
    }[]
  >((acc, trade) => {
    const previousEquity = acc.length > 0 ? acc[acc.length - 1].equity : 0;
    const pnl = trade.pnl ?? 0;

    acc.push({
      date: trade.trade_date,
      ticker: trade.ticker,
      pnl,
      equity: previousEquity + pnl,
    });

    return acc;
  }, []);

const downloadTradesCsv = () => {
  const headers = [
    "Date",
    "Ticker",
    "Market",
    "Direction",
    "Entry",
    "Exit",
    "Stop",
    "Size",
    "Risk",
    "PnL",
    "Result",
    "Setup",
    "Emotion",
    "Mistake",
    "Lesson",
    "Notes",
  ];

  const rows = filteredTrades.map((trade) => [
    trade.trade_date,
    trade.ticker,
    trade.market,
    trade.direction,
    trade.entry_price ?? "",
    trade.exit_price ?? "",
    trade.stop_loss ?? "",
    trade.position_size ?? "",
    trade.risk_amount ?? "",
    trade.pnl ?? "",
    trade.result ?? "",
    trade.setup ?? "",
    trade.emotion ?? "",
    trade.mistake ?? "",
    trade.lesson ?? "",
    trade.notes ?? "",
  ]);

  const csvContent =
  "\uFEFFsep=;\n" +
  [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell).replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(";")
    )
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `skilledge-trades-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

const downloadTradesXlsx = () => {
  const exportTrades = filteredTrades;

  const tradeRows = exportTrades.map((trade) => ({
    Date: trade.trade_date,
    Ticker: trade.ticker,
    Market: trade.market,
    Direction: trade.direction,
    Entry: trade.entry_price ?? "",
    Exit: trade.exit_price ?? "",
    Stop: trade.stop_loss ?? "",
    Size: trade.position_size ?? "",
    Risk: trade.risk_amount ?? "",
    PnL: trade.pnl ?? "",
    Result: trade.result ?? "",
    Setup: trade.setup ?? "",
    Emotion: trade.emotion ?? "",
    Mistake: trade.mistake ?? "",
    Lesson: trade.lesson ?? "",
    Notes: trade.notes ?? "",
    Created: trade.created_at ?? "",
  }));

  const exportPnlValues = exportTrades
    .map((trade) => trade.pnl)
    .filter((pnl): pnl is number => pnl !== null);

  const exportTotalTrades = exportTrades.length;

  const exportTotalPnl = exportPnlValues.reduce((sum, pnl) => sum + pnl, 0);

  const exportWins = exportTrades.filter((trade) => trade.result === "win").length;

  const exportClosedTrades = exportTrades.filter(
    (trade) => trade.result === "win" || trade.result === "loss"
  ).length;

  const exportWinRate =
    exportClosedTrades > 0 ? Math.round((exportWins / exportClosedTrades) * 100) : null;

  const exportAveragePnl =
    exportTotalTrades > 0 ? exportTotalPnl / exportTotalTrades : null;

  const exportGrossProfit = exportPnlValues
    .filter((pnl) => pnl > 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const exportGrossLoss = exportPnlValues
    .filter((pnl) => pnl < 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const exportBestTrade =
    exportPnlValues.length > 0 ? Math.max(...exportPnlValues) : null;

  const exportWorstTrade =
    exportPnlValues.length > 0 ? Math.min(...exportPnlValues) : null;

  const exportProfitFactor =
    exportGrossLoss < 0 ? exportGrossProfit / Math.abs(exportGrossLoss) : null;

  const equityRows = buildEquityCurveData(exportTrades).map((point, index) => ({
    "#": index + 1,
    Date: point.date,
    Ticker: point.ticker,
    "Trade PnL": point.pnl,
    "Cumulative PnL": point.equity,
  }));

  const summaryRows = [
    ["Metric", "Value"],
    ["Total trades", exportTotalTrades],
    ["Total PnL", exportTotalPnl],
    ["Win rate", exportWinRate === null ? "" : `${exportWinRate}%`],
    ["Average PnL", exportAveragePnl === null ? "" : exportAveragePnl],
    ["Gross Profit", exportGrossProfit],
    ["Gross Loss", exportGrossLoss],
    ["Best Trade", exportBestTrade ?? ""],
    ["Worst Trade", exportWorstTrade ?? ""],
    ["Profit Factor", exportProfitFactor === null ? "" : exportProfitFactor],
    ["Exported At", new Date().toLocaleString()],
  ];

  const workbook = XLSX.utils.book_new();

  const tradesSheet = XLSX.utils.json_to_sheet(tradeRows);
  tradesSheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 32 },
    { wch: 32 },
    { wch: 42 },
    { wch: 22 },
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 22 }];

  const equitySheet = XLSX.utils.json_to_sheet(equityRows);
  equitySheet["!cols"] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, tradesSheet, "Trades");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, equitySheet, "Equity Curve");

  XLSX.writeFile(
    workbook,
    `skilledge-trades-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
};

  return (
    <div>
      <SectionHeader title={t.journal.title} text={t.journal.text} />

<div className="mt-8 grid gap-4 md:grid-cols-4 xl:grid-cols-4">
  <MetricCard label={t.journal.totalTrades} value={String(totalTrades)} />

  <MetricCard
    label={t.journal.totalPnl}
    value={`${totalPnl >= 0 ? "$" : "-$"}${Math.abs(totalPnl).toFixed(2)}`}
  />

  <MetricCard
    label={t.journal.winRate}
    value={winRate === null ? "—" : `${winRate}%`}
  />

  <MetricCard
    label={t.journal.avgPnl}
    value={
      averagePnl === null
        ? "—"
        : `${averagePnl >= 0 ? "$" : "-$"}${Math.abs(averagePnl).toFixed(2)}`
    }
  />

  <MetricCard
  label={t.journal.grossProfit}
  value={`$${grossProfit.toFixed(2)}`}
/>

<MetricCard
  label={t.journal.grossLoss}
  value={`${grossLoss < 0 ? "-$" : "$"}${Math.abs(grossLoss).toFixed(2)}`}
/>

<MetricCard
  label={t.journal.bestTrade}
  value={bestTrade === null ? "—" : `$${bestTrade.toFixed(2)}`}
/>

<MetricCard
  label={t.journal.worstTrade}
  value={
    worstTrade === null
      ? "—"
      : `${worstTrade < 0 ? "-$" : "$"}${Math.abs(worstTrade).toFixed(2)}`
  }
/>

<MetricCard
  label={t.journal.profitFactor}
  value={profitFactor === null ? "—" : profitFactor.toFixed(2)}
/>
</div>

<div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h3 className="text-2xl font-semibold">
        {t.journal.uploadScreenshotTitle}
      </h3>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
        {t.journal.uploadScreenshotText}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
          <span className="block text-xs uppercase tracking-[0.22em] text-white/35">
            Step 1
          </span>
          <span className="mt-1 block">
            {t.journal.screenshotTradeLabel}
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
          <span className="block text-xs uppercase tracking-[0.22em] text-white/35">
            Step 2
          </span>
          <span className="mt-1 block">{t.journal.screenshotChoose}</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
          <span className="block text-xs uppercase tracking-[0.22em] text-white/35">
            Step 3
          </span>
          <span className="mt-1 block">{t.journal.uploadButton}</span>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/65">
      {tradeScreenshots.length} {t.journal.screenshotsCount}
    </div>
  </div>

  <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_1fr_auto]">
    <Field label={t.journal.screenshotTradeLabel}>
      <select
        value={selectedTradeIdForScreenshot}
        onChange={(event) =>
          onSelectedTradeIdForScreenshotChange(event.target.value)
        }
        disabled={locked || screenshotUploading || trades.length === 0}
        className="field-input"
      >
        <option value="">{t.journal.selectTradePlaceholder}</option>

        {trades.map((trade) => {
          const screenshotCount = tradeScreenshots.filter(
            (item) => item.trade_id === trade.id
          ).length;

          return (
            <option key={trade.id} value={trade.id}>
              {trade.trade_date} · {trade.ticker} · {trade.direction} · PnL{" "}
              {trade.pnl ?? "—"} · {screenshotCount}{" "}
              {t.journal.screenshotsCount}
            </option>
          );
        })}
      </select>
    </Field>

    <Field label={t.journal.screenshotFileLabel}>
      <div className="space-y-3">
        <input
          id="trade-screenshot-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={locked || screenshotUploading}
          onChange={(event) =>
            onScreenshotFileChange(event.target.files?.[0] ?? null)
          }
          className="hidden"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="trade-screenshot-file"
            className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium transition ${
              locked || screenshotUploading
                ? "cursor-not-allowed opacity-40"
                : "bg-white text-black hover:scale-[1.02]"
            }`}
          >
            {t.journal.screenshotChoose}
          </label>

          <div className="max-w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/65">
            {screenshotFile
              ? `${t.journal.screenshotSelected}: ${screenshotFile.name}`
              : t.journal.screenshotNoFile}
          </div>
        </div>

        <div className="text-xs leading-5 text-white/40">
          <div>{t.journal.screenshotHint}</div>
          <div className="mt-1">{t.journal.screenshotFormats}</div>
        </div>
      </div>
    </Field>

    <div className="flex items-end">
      <button
        type="button"
        onClick={onScreenshotUpload}
        disabled={
          locked ||
          screenshotUploading ||
          !selectedTradeIdForScreenshot ||
          !screenshotFile
        }
        className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {screenshotUploading
          ? t.journal.uploadingButton
          : t.journal.uploadButton}
      </button>
    </div>
  </div>

  {screenshotError && (
    <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
      {screenshotError}
    </div>
  )}
</div>

<div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h3 className="text-2xl font-semibold">
  {t.journal.journalAnalysisTitle}
</h3>

      <p className="mt-2 text-sm leading-6 text-white/45">
  {t.journal.journalAnalysisText}
</p>
    </div>

    <button
      type="button"
      onClick={onJournalAnalysis}
      disabled={locked || journalAnalysisLoading || trades.length === 0}
      className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {journalAnalysisLoading
  ? t.journal.journalAnalyzingButton
  : t.journal.journalAnalyzeButton}
    </button>
  </div>

  {journalAnalysisError && (
    <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
      {journalAnalysisError}
    </div>
  )}

  {journalAnalysis && (
  <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
    <AiReport text={journalAnalysis} />
  </div>
)}
</div>

      {locked && (
        <div className="mt-6 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5 text-sm leading-7 text-amber-50/85">
         {t.journal.locked}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
          <h3 className="text-2xl font-semibold">{t.journal.addTitle}</h3>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label={t.journal.fields.ticker}>
              <input
                value={tradeForm.ticker}
                onChange={(event) => updateField("ticker", event.target.value)}
                placeholder={t.journal.placeholders.ticker}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.date}>
              <input
                type="date"
                value={tradeForm.tradeDate}
                onChange={(event) =>
                  updateField("tradeDate", event.target.value)
                }
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.market}>
              <select
                value={tradeForm.market}
                onChange={(event) => updateField("market", event.target.value)}
                disabled={locked || tradeSaving}
                className="field-input"
              >
                <option value="stocks">Stocks</option>
                <option value="crypto">Crypto</option>
                <option value="futures">Futures</option>
                <option value="forex">Forex</option>
                <option value="options">Options</option>
              </select>
            </Field>

            <Field label={t.journal.fields.direction}>
              <select
                value={tradeForm.direction}
                onChange={(event) =>
                  updateField("direction", event.target.value)
                }
                disabled={locked || tradeSaving}
                className="field-input"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>

            <Field label={t.journal.fields.entry}>

              <input
                value={tradeForm.entryPrice}
                onChange={(event) =>
                  updateField("entryPrice", event.target.value)
                }
                placeholder={t.journal.placeholders.entry}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.exit}>
              <input
                value={tradeForm.exitPrice}
                onChange={(event) =>
                  updateField("exitPrice", event.target.value)
                }
                placeholder={t.journal.placeholders.exit}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.stop}>
              <input
                value={tradeForm.stopLoss}
                onChange={(event) =>
                  updateField("stopLoss", event.target.value)
                }
                placeholder={t.journal.placeholders.stop}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.size}>
              <input
                value={tradeForm.positionSize}
                onChange={(event) =>
                  updateField("positionSize", event.target.value)
                }
                placeholder={t.journal.placeholders.size}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.risk}>
              <input
                value={tradeForm.riskAmount}
                onChange={(event) =>
                  updateField("riskAmount", event.target.value)
                }
                placeholder={t.journal.placeholders.risk}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.pnl}>
              <input
                value={tradeForm.pnl}
                onChange={(event) => updateField("pnl", event.target.value)}
                placeholder={t.journal.placeholders.pnl}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.result}>
              <select
                value={tradeForm.result}
                onChange={(event) => updateField("result", event.target.value)}
                disabled={locked || tradeSaving}
                className="field-input"
              >
                <option value="">{t.journal.options.notSet}</option>
<option value="win">{t.journal.options.win}</option>
<option value="loss">{t.journal.options.loss}</option>
<option value="breakeven">{t.journal.options.breakeven}</option>
              </select>
            </Field>

            <Field label={t.journal.fields.setup}>
              <input
                value={tradeForm.setup}
                onChange={(event) => updateField("setup", event.target.value)}
                placeholder={t.journal.placeholders.setup}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <Field label={t.journal.fields.emotion}>
              <input
                value={tradeForm.emotion}
                onChange={(event) => updateField("emotion", event.target.value)}
                placeholder={t.journal.placeholders.emotion}
                disabled={locked || tradeSaving}
                className="field-input"
              />
            </Field>

            <Field label={t.journal.fields.mistake}>
              <textarea
                value={tradeForm.mistake}
                onChange={(event) => updateField("mistake", event.target.value)}
                placeholder={t.journal.placeholders.mistake}
                disabled={locked || tradeSaving}
                className="field-input min-h-24 resize-none"
              />
            </Field>

            <Field label={t.journal.fields.lesson}>
              <textarea
                value={tradeForm.lesson}
                onChange={(event) => updateField("lesson", event.target.value)}
                placeholder={t.journal.placeholders.lesson}
                disabled={locked || tradeSaving}
                className="field-input min-h-24 resize-none"
              />
            </Field>

            <Field label={t.journal.fields.notes}>
              <textarea
                value={tradeForm.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder={t.journal.placeholders.notes}
                disabled={locked || tradeSaving}
                className="field-input min-h-24 resize-none"
              />
            </Field>
          </div>

          {tradeError && (
            <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {tradeError}
            </div>
          )}

          <button
            onClick={onTradeSubmit}
            disabled={locked || tradeSaving}
            className="mt-6 inline-flex rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tradeSaving ? t.journal.saving : t.journal.save}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold">{t.journal.recentTitle}</h3>
              <p className="mt-2 text-sm text-white/45">
                {t.journal.recentText}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
              {trades.length} {t.journal.tradesCount}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {trades.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm leading-7 text-white/50">
                {t.journal.empty}
              </div>
            ) : (
              recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="rounded-3xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-xl font-semibold">
                          {trade.ticker}
                        </h4>

                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase text-white/50">
                          {trade.direction}
                        </span>

                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase text-white/50">
                          {trade.market}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-white/40">
                        {trade.trade_date}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                        PnL
                      </div>
                      <div className="mt-1 text-2xl font-semibold">
                        {trade.pnl === null ? "—" : `$${trade.pnl}`}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
  <button
    type="button"
    onClick={() => onTradeChartAnalysis(trade.id)}
    disabled={
      locked ||
      chartAnalysisLoading ||
      tradeScreenshots.filter((item) => item.trade_id === trade.id).length === 0
    }
    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
  >
    {chartAnalysisLoading && chartAnalysisTradeId === trade.id
  ? t.journal.chartAnalyzingButton
  : t.journal.chartAnalyzeButton}
  </button>

  <div className="text-xs text-white/35">
    {tradeScreenshots.filter((item) => item.trade_id === trade.id).length}{" "}
{t.journal.chartScreenshotsLabel}
  </div>
</div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-white/55">
  <div>
    {t.journal.cardLabels.entry}: {trade.entry_price ?? "—"}
  </div>
  <div>
    {t.journal.cardLabels.exit}: {trade.exit_price ?? "—"}
  </div>
  <div>
    {t.journal.cardLabels.stop}: {trade.stop_loss ?? "—"}
  </div>
  <div>
    {t.journal.cardLabels.risk}:{" "}
    {trade.risk_amount === null ? "—" : `$${trade.risk_amount}`}
  </div>
  <div>
    {t.journal.cardLabels.result}: {trade.result ?? "—"}
  </div>
  <div>
    {t.journal.cardLabels.setup}: {trade.setup ?? "—"}
  </div>
</div>

                  {(trade.mistake || trade.lesson || trade.notes) && (
  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
    {trade.mistake && (
      <p>
        {t.journal.cardLabels.mistake}: {trade.mistake}
      </p>
    )}

    {trade.lesson && (
      <p className="mt-2">
        {t.journal.cardLabels.lesson}: {trade.lesson}
      </p>
    )}

    {trade.notes && (
      <p className="mt-2">
        {t.journal.cardLabels.notes}: {trade.notes}
      </p>
    )}
  </div>
)}
{chartAnalysisError && chartAnalysisTradeId === trade.id && (
  <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
    {chartAnalysisError}
  </div>
)}



{(() => {
  const tradeChartHistory = chartAnalysisHistory.filter(
    (item) => item.trade_id === trade.id
  );

  const isHistoryOpen = expandedChartAnalysisTradeId === trade.id;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() =>
          onExpandedChartAnalysisTradeIdChange(
            isHistoryOpen ? "" : trade.id
          )
        }
        disabled={tradeChartHistory.length === 0}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      >
        {isHistoryOpen
          ? t.journal.hideChartHistory
          : t.journal.showChartHistory}
      </button>

      {isHistoryOpen && tradeChartHistory.length === 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
          {t.journal.noChartHistory}
        </div>
      )}

      {isHistoryOpen &&
        tradeChartHistory.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/35">
              <span>{t.journal.savedChartAnalysis}</span>
              <span>
                {item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : ""}
              </span>
            </div>

            <AiReport text={item.ai_response ?? ""} />
          </div>
        ))}
    </div>
  );
})()}

                </div>
              ))
            )}
            
          </div>
        </div>
      </div>
            
            

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
  <div>
    <h3 className="text-2xl font-semibold">{t.journal.fullTitle}</h3>
<p className="mt-2 text-sm text-white/45">{t.journal.fullText}</p>
  </div>

  <div className="flex flex-wrap gap-3">
  <button
    type="button"
    onClick={downloadTradesCsv}
    disabled={filteredTrades.length === 0}
    className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {t.journal.downloadCsv}
  </button>

  <button
    type="button"
    onClick={downloadTradesXlsx}
    disabled={filteredTrades.length === 0}
    className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
  >
    {t.journal.downloadXlsx}
  </button>
</div>
</div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
  <Field label={t.journal.searchTicker}>
    <input
      value={journalFilters.ticker}
      onChange={(event) =>
        updateJournalFilter("ticker", event.target.value)
      }
      placeholder="AAPL / BTC / NQ"
      className="field-input"
    />
  </Field>

  <Field label={t.journal.fields.market}>
    <select
      value={journalFilters.market}
      onChange={(event) =>
        updateJournalFilter("market", event.target.value)
      }
      className="field-input"
    >
      <option value="all">{t.journal.allMarkets}</option>
      <option value="stocks">Stocks</option>
      <option value="crypto">Crypto</option>
      <option value="futures">Futures</option>
      <option value="forex">Forex</option>
      <option value="options">Options</option>
    </select>
  </Field>

  <Field label={t.journal.fields.direction}>
    <select
      value={journalFilters.direction}
      onChange={(event) =>
        updateJournalFilter("direction", event.target.value)
      }
      className="field-input"
    >
      <option value="all">{t.journal.allSides}</option>
      <option value="long">Long</option>
      <option value="short">Short</option>
    </select>
  </Field>

  <Field label={t.journal.fields.result}>
    <select
      value={journalFilters.result}
      onChange={(event) =>
        updateJournalFilter("result", event.target.value)
      }
      className="field-input"
    >
      <option value="all">{t.journal.allResults}</option>
      <option value="win">{t.journal.options.win}</option>
      <option value="loss">{t.journal.options.loss}</option>
      <option value="breakeven">{t.journal.options.breakeven}</option>
    </select>
  </Field>
</div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-white/35">
              <tr className="border-b border-white/10">
                <th className="py-3 pr-4">{t.journal.table.date}</th>
<th className="py-3 pr-4">{t.journal.table.ticker}</th>
<th className="py-3 pr-4">{t.journal.table.market}</th>
<th className="py-3 pr-4">{t.journal.table.side}</th>
<th className="py-3 pr-4">{t.journal.table.entry}</th>
<th className="py-3 pr-4">{t.journal.table.exit}</th>
<th className="py-3 pr-4">{t.journal.table.stop}</th>
<th className="py-3 pr-4">{t.journal.table.risk}</th>
<th className="py-3 pr-4">{t.journal.table.pnl}</th>
<th className="py-3 pr-4">{t.journal.table.result}</th>
<th className="py-3 pr-4">{t.journal.table.setup}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10 text-white/65">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-white/45">
                    {t.journal.empty}
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade) => (
                  <tr key={trade.id} className="transition hover:bg-white/[0.03]">
                    <td className="py-4 pr-4">{trade.trade_date}</td>
                    <td className="py-4 pr-4 font-semibold text-white">
                      {trade.ticker}
                    </td>
                    <td className="py-4 pr-4 uppercase">{trade.market}</td>
                    <td className="py-4 pr-4 uppercase">{trade.direction}</td>
                    <td className="py-4 pr-4">{trade.entry_price ?? "—"}</td>
                    <td className="py-4 pr-4">{trade.exit_price ?? "—"}</td>
                    <td className="py-4 pr-4">{trade.stop_loss ?? "—"}</td>
                    <td className="py-4 pr-4">
                      {trade.risk_amount === null ? "—" : `$${trade.risk_amount}`}
                    </td>
                    <td className="py-4 pr-4 font-semibold">
                      {trade.pnl === null ? "—" : `$${trade.pnl}`}
                    </td>
                    <td className="py-4 pr-4">{trade.result ?? "—"}</td>
                    <td className="py-4 pr-4">{trade.setup ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EquityCurveCard({
  trades,
  compact = false,
  t,
  onExpand,
}: {
  trades: Trade[];
  compact?: boolean;
  t: (typeof dashboardDict)[Language];
  onExpand?: () => void;
}) {
  const equityCurveData = buildEquityCurveData(trades);
  const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

  return (
    <div
      className={
        compact
          ? "rounded-3xl border border-white/10 bg-white/[0.04] p-5 overflow-hidden"
          : "rounded-3xl border border-white/10 bg-[#111621] p-6 shadow-2xl"
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3
            className={
              compact ? "text-lg font-semibold" : "text-2xl font-semibold"
            }
          >
            {t.journal.equityTitle}
          </h3>
          <p className="mt-2 text-xs leading-6 text-white/45">
            {t.journal.equityText}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
            {equityCurveData.length} {t.journal.equityPoints}
          </div>

          {compact && onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {t.journal.expand}
            </button>
          )}
        </div>
      </div>

      <div
  className={
    compact
      ? "mt-5 h-[230px] w-full overflow-hidden"
      : "mt-6 h-[520px] w-full overflow-x-auto overflow-y-hidden"
  }
>
        {!mounted ? (
  <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-black/20 text-center text-sm leading-6 text-white/45">
    Loading chart...
  </div>
) : equityCurveData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-black/20 text-center text-sm leading-6 text-white/45">
            {t.journal.equityEmpty}
          </div>
        ) : (
          <LineChart
  data={equityCurveData}
  width={compact ? 220 : 1000}
  height={compact ? 220 : 520}
>
  <CartesianGrid
    strokeDasharray="3 3"
    stroke="rgba(255,255,255,0.08)"
  />
  <XAxis
    dataKey="date"
    stroke="rgba(255,255,255,0.35)"
    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
  />
  <YAxis
    stroke="rgba(255,255,255,0.35)"
    tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
  />
  <Tooltip
    contentStyle={{
      background: "#080c16",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "16px",
      color: "#fff",
    }}
    labelStyle={{ color: "rgba(255,255,255,0.7)" }}
  />
  <Line
    type="monotone"
    dataKey="equity"
    stroke="#67e8f9"
    strokeWidth={3}
    dot={{ r: compact ? 3 : 4 }}
    activeDot={{ r: compact ? 5 : 7 }}
  />
</LineChart>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </span>
      {children}
    </label>
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

function AiReport({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        if (!line) {
          return <div key={index} className="h-2" />;
        }

        if (line.startsWith("###")) {
          return (
            <h4
              key={index}
              className="pt-2 text-xl font-semibold leading-snug text-white"
            >
              {line.replace(/^#+\s*/, "")}
            </h4>
          );
        }

        if (line.startsWith("##")) {
          return (
            <h4
              key={index}
              className="pt-2 text-xl font-semibold leading-snug text-white"
            >
              {line.replace(/^#+\s*/, "")}
            </h4>
          );
        }

        if (line.startsWith("#")) {
          return (
            <h4
              key={index}
              className="pt-2 text-xl font-semibold leading-snug text-white"
            >
              {line.replace(/^#+\s*/, "")}
            </h4>
          );
        }

        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <h5
              key={index}
              className="pt-3 text-base font-semibold leading-snug text-white"
            >
              {line.replace(/\*\*/g, "")}
            </h5>
          );
        }

        if (line.startsWith("- ")) {
          return (
            <div key={index} className="flex gap-3 text-sm leading-7 text-white/72">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" />
              <p>{line.replace(/^-+\s*/, "").replace(/\*\*/g, "")}</p>
            </div>
          );
        }

        if (/^\d+[\).]\s/.test(line)) {
          return (
            <div key={index} className="text-sm leading-7 text-white/75">
              {line.replace(/\*\*/g, "")}
            </div>
          );
        }

        return (
          <p key={index} className="text-sm leading-7 text-white/70">
            {line.replace(/\*\*/g, "")}
          </p>
        );
      })}
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