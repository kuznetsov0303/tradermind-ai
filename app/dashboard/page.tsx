"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  PLAN_LIMITS,
  canUseFeature,
  getPlanLimits,
  normalizePlanId,
} from "@/lib/plan-limits";

type Language = "en" | "ru" | "ua";

type TabId =
  | "overview"
  | "journal"
  | "charts"
  | "market"
  | "coach"
  | "learning"
  | "reports"
  | "billing";

type PlanId = "core" | "edge" | "elite";
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

type SavedAiReport = {
  id: string;
  user_id: string;
  report_text: string;
  filters: {
    period?: string;
    periodLabel?: string;
    market?: string;
    marketLabel?: string;
    direction?: string;
    directionLabel?: string;
    setup?: string;
    setupLabel?: string;
  };
  summary: {
    totalTrades?: number;
    totalPnl?: number;
    winRate?: number;
    averagePnl?: number;
    profitFactor?: number | null;
    bestTrade?: number;
    worstTrade?: number;
    longTrades?: number;
    shortTrades?: number;
    longPnl?: number;
    shortPnl?: number;
  };
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
charts: {
  title: "TradingView charts",
  text: "Embedded TradingView chart for ticker analysis, levels and setups.",
  placeholder: "TradingView widget will be added in the next stage.",
  analyzeCurrentChart: "Analyze current chart",
  workspaceText: "Trading workspace with chart, watchlist and market movers.",
  watchlistExamples: "Watchlist examples: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  openWatchlist: "Open watchlist",
  hideWatchlist: "Hide watchlist",
  watchlistTitle: "Watchlist",
  watchlistSubtitle: "Symbol / 24h % / volume",
  addTickerButton: "Add",
  addTickerPlaceholder: "AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  addTickerHint: "Example: AA.NY = NYSE, TSLA.NQ = NASDAQ, SPY.AM = AMEX, BTCUSDT = Binance.",
  sortSymbol: "Symbol",
  sortChange: "% 24h",
  sortVolume: "Vol",
  symbolColumn: "Symbol",
  percentColumn: "%",
  volumeColumn: "Volume",
  loadingWatchlist: "Loading watchlist...",
  emptyWatchlist: "Watchlist is empty. Click + and add a ticker.",
  removeFromWatchlist: "Remove from watchlist",
  loginFirst: "Please log in first.",
  settingsLoadError: "Failed to load chart settings.",
  addTickerError: "Failed to add ticker to watchlist.",
  removeTickerError: "Failed to remove ticker from watchlist.",
  moversStocks: "Stocks",
  moversCrypto: "Crypto",
  moversGainers: "Top Gainers",
  moversLosers: "Top Losers",
  moversCollapse: "Collapse",
  moversExpand: "Expand",
  moversName: "Name",
  moversPercentChange: "% Change",
  moversLoading: "Loading movers...",
  moversEmpty: "No instruments for this filter.",
  moversStocksNeedKey: "Stocks movers will work after adding NEXT_PUBLIC_FMP_API_KEY.",
chartAnalysisTitle: "AI chart analysis",
chartAnalysisText:
  "SkillEdge AI analyzes the current symbol, timeframe, market data, candles, volume and risk context.",
chartAnalysisLoading: "Analyzing current chart...",
chartAnalysisError: "Failed to analyze current chart.",
chartAnalysisEmpty: "Run AI analysis to see the current chart breakdown.",
chartAnalysisClose: "Close",
chartAnalysisSymbol: "Symbol",
chartAnalysisInterval: "Interval",
chartAnalysisReportLabel: "SkillEdge AI Report",
chartAnalysisDataLabel: "Market structure report",
chartAnalysisSectionsLabel: "Analysis sections",
marketDataUnavailableTitle: "Market data unavailable",
marketDataUnavailableText:
  "SkillEdge AI could not load market data for this symbol on the current data plan. Try a more liquid ticker such as AAPL, TSLA, NVDA, SPY or QQQ.",
marketDataPremiumTitle: "Premium market data required",
marketDataPremiumText:
  "This symbol, timeframe or data endpoint may require a higher market data plan. Before launch, SkillEdge AI will support broader premium market coverage.",
marketDataGenericErrorTitle: "Analysis unavailable",
marketDataGenericErrorText:
  "We could not complete the chart analysis right now. Try another ticker, timeframe, or run the analysis again.",
chartControlTickerLabel: "Ticker",
chartControlTickerPlaceholder: "AAPL / TSLA.NQ / AA.NY / BTCUSDT",
chartControlIntervalLabel: "Timeframe",
chartControlOpenChart: "Open chart",
chartControlHint:
  "Use this bar to control both TradingView and AI analysis. Changes made inside TradingView may not sync back to SkillEdge AI.",
},
learning: {
  title: "Training center",
  text: "Structured trading education, setups, risk management, psychology and playbook building.",
  learningNoteTitle: "Learning Center currently works as a refresher base",
learningNoteText:
  "SkillEdge AI is primarily focused on trade journaling, chart analysis, AI review, and building a trading system. This section is not positioned as a full academy yet: it is designed as a compact knowledge base to refresh key concepts, so clients can better understand risk, setups, market structure, and AI analysis logic.",
  overviewLabel: "Learning overview",
  modulesLabel: "Modules",
  lessonsLabel: "lessons",
  progressLabel: "Progress",
  totalProgressLabel: "Total progress",
  startButton: "Start",
  continueButton: "Continue",
  reviewButton: "Review",
  notStartedStatus: "Not started",
  inProgressStatus: "In progress",
  completedStatus: "Completed",
  lockedLabel: "Coming soon",
  estimatedTimeLabel: "Estimated time",
  levelLabel: "Level",
  beginnerLevel: "Beginner",
  intermediateLevel: "Intermediate",
  advancedLevel: "Advanced",
  moduleOneTitle: "Market Basics",
  moduleOneText:
    "Understand how the market works, how orders interact, and why liquidity matters.",
  moduleTwoTitle: "Technical Analysis",
  moduleTwoText:
    "Learn candles, levels, trend/range logic, volume and clean chart reading.",
  moduleThreeTitle: "Risk Management",
  moduleThreeText:
    "Build rules for risk per trade, stop loss, position sizing and R/R.",
  moduleFourTitle: "Intraday Momentum",
  moduleFourText:
    "Study momentum logic, breakout/reclaim, failed breakout and continuation setups.",
  moduleFiveTitle: "Trading Psychology",
  moduleFiveText:
    "Control overtrading, revenge trading, fear, hesitation and impulsive entries.",
  moduleSixTitle: "Playbook / Setups",
  moduleSixText:
    "Turn repeated patterns into a structured trading playbook with triggers and invalidation.",
  lessonMarketStructure: "How the market works",
  lessonOrderTypes: "Order types",
  lessonBidAskSpread: "Bid / Ask / Spread",
  lessonLiquidity: "Liquidity",
  lessonCandles: "Candles",
  lessonLevels: "Support and resistance",
  lessonTrendRange: "Trend vs range",
  lessonVolume: "Volume analysis",
  lessonRiskPerTrade: "Risk per trade",
  lessonStopLoss: "Stop loss",
  lessonRiskReward: "Risk / Reward",
  lessonPositionSizing: "Position sizing",
  lessonMomentumLogic: "Momentum logic",
  lessonBreakoutReclaim: "Breakout / reclaim",
  lessonFailedBreakout: "Failed breakout",
  lessonContinuation: "Continuation",
  lessonDiscipline: "Discipline",
  lessonOvertrading: "Overtrading",
  lessonRevengeTrading: "Revenge trading",
  lessonPatience: "Patience",
  lessonSetupChecklist: "Setup checklist",
  lessonEntryTrigger: "Entry trigger",
  lessonInvalidation: "Invalidation",
  lessonReviewProcess: "Review process",
  advancedTracksLabel: "Advanced tracks",
advancedTracksText:
  "Additional specialized learning paths that will be unlocked in the next expansion of SkillEdge AI.",
comingSoonButton: "Coming soon",
activeModuleLabel: "Active module",
openLessonButton: "Open lesson",
selectedModuleHint:
  "Select a module to see its lessons, progress and next learning step.",
nextLessonLabel: "Next lesson",
moduleDetailsLabel: "Module details",
lessonViewerLabel: "Lesson viewer",
lessonContentLabel: "Lesson content",
lessonCloseButton: "Close lesson",
lessonStartText:
  "This lesson content will be expanded in the next stage. For now, use this structure as the lesson shell inside SkillEdge AI.",
lessonKeyPointsLabel: "Key points",
lessonPracticeLabel: "Practice task",
lessonPracticeText:
  "Review the concept, find one chart example, and write what confirms or invalidates the idea.",
markLessonCompletedButton: "Mark lesson completed",
lessonCompletedButton: "Lesson completed",
frontendProgressNote:
  "Progress is saved to your SkillEdge AI account and will stay available after reload.",
learningProgressLoading: "Loading learning progress...",
learningProgressSaving: "Saving progress...",
learningProgressSaved: "Progress saved",
lessonAutoAdvanced:
  "Lesson saved. The next lesson has been opened automatically.",
moduleCompletedMessage: "Module completed. Great work.",
learningProgressError: "Failed to sync learning progress.",
  extraModuleOneTitle: "Smart Money Concepts & Working Setups",
extraModuleOneText:
  "Market structure, liquidity, inducement, displacement, order blocks and practical setup logic.",
extraModuleTwoTitle: "Order Book Scalping in CScalp",
extraModuleTwoText:
  "Platform training, order flow basics, level breakout and knife-catching setups for active scalping.",
extraModuleThreeTitle: "Additional module 3",
extraModuleThreeText:
  "This module will be filled with the next specialized training block.",
extraModuleFourTitle: "Additional module 4",
extraModuleFourText:
  "This module will be filled with the next specialized training block.",
extraModuleOneLessonOne: "Market structure",
extraModuleOneLessonTwo: "Liquidity zones",
extraModuleOneLessonThree: "Order blocks",
extraModuleOneLessonFour: "Working setups",
extraModuleTwoLessonOne: "CScalp interface",
extraModuleTwoLessonTwo: "DOM basics",
extraModuleTwoLessonThree: "Level breakout",
extraModuleTwoLessonFour: "Knife-catching setup",
extraModuleThreeLessonOne: "Lesson 1",
extraModuleThreeLessonTwo: "Lesson 2",
extraModuleThreeLessonThree: "Lesson 3",
extraModuleThreeLessonFour: "Lesson 4",
extraModuleFourLessonOne: "Lesson 1",
extraModuleFourLessonTwo: "Lesson 2",
extraModuleFourLessonThree: "Lesson 3",
extraModuleFourLessonFour: "Lesson 4",
},
reports: {
  title: "Reports",
  text: "Journal statistics, PnL dynamics, setup quality, mistakes and trading strengths.",
  placeholder: "Advanced reports will be added in the next stage.",
  emptyTitle: "Not enough data for a report yet",
  emptyText:
    "Add a few trades to your journal so SkillEdge AI can build a report on PnL, win rate, setups, mistakes and performance dynamics.",
  totalTrades: "Total trades",
  totalTradesHelper: "All trades from the journal",
  totalPnl: "Total PnL",
  totalPnlHelper: "Total result across closed trades",
  winRate: "Win rate",
  averagePnl: "Average PnL",
  averagePnlHelper: "Average result per trade",
  profitFactor: "Profit factor",
  profitFactorHelper: "Gross profit / gross loss",
  bestWorst: "Best / Worst",
  bestWorstHelper: "Best and worst trade",
  equityTitle: "Equity curve",
  equitySubtitle: "Cumulative PnL dynamics",
  points: "points",
  directionTitle: "Long vs Short",
  directionSubtitle: "Performance by direction",
  marketBreakdown: "Markets",
  setupBreakdown: "Setups",
  mistakesBreakdown: "Mistakes",
  noData: "No data yet.",
    filtersTitle: "Report filters",
  filtersText:
    "Narrow statistics by period, market, direction and setup to see the real quality of your trading.",
  resetFilters: "Reset filters",
  periodFilter: "Period",
  periodAll: "All time",
  period7d: "7 days",
  period30d: "30 days",
  period90d: "90 days",
  marketFilter: "Market",
  allMarkets: "All markets",
  directionFilter: "Direction",
  allDirections: "All directions",
  setupFilter: "Setup",
  allSetups: "All setups",
  filteredTrades: "Filtered trades",
  noFilteredTradesTitle: "No trades match the selected filters",
noFilteredTradesText:
  "Try changing the period, market, direction or setup. Your journal has trades, but this filter combination did not match anything.",
aiReportTitle: "AI report",
aiReportSubtitle: "Summary for selected trades",
aiReportText:
  "Generate a short report for the current filter: what works, where the mistakes are, risk quality, best-performing setups and what to focus on next.",
aiReportButton: "Generate report",
aiReportLoading: "Generating...",
aiReportError: "Failed to generate AI report.",
aiReportLabel: "AI report",
generateAiReport: "Generate report",
aiReportGenerating: "Generating report...",
aiReportPlaceholder:
  "The AI report will appear here after generation. It will also be saved in history so the client can return to it later.",
aiReportResultLabel: "Result",
latestAiReportTitle: "Latest AI report",
savedAiReportTitle: "Saved AI report",
aiReportHistoryLabel: "History",
aiReportHistoryTitle: "AI report history",
aiReportHistoryText:
  "Open previous AI summaries by filter and quickly return to the most important conclusions.",
aiReportHistoryEmpty: "No saved AI reports yet.",
currentSummaryLabel: "Current summary",
allPeriods: "All periods",
deleteAiReport: "Delete report",
copyAiReport: "Copy",
downloadAiReport: "Download .txt",
aiReportCopied: "AI report copied.",
aiReportCopyFailed: "Failed to copy report.",
aiReportDownloaded: "AI report downloaded.",
upgradeForAiReports: "Edge required",
aiReportUpgradeRequired:
  "AI reports are available on SkillEdge Edge and SkillEdge Elite.",
aiReportLockedText:
  "AI reports help review selected trades, find best setups, mistakes, and the next focus area. This feature is available on SkillEdge Edge and SkillEdge Elite.",
aiReportPlanHint: "AI reports per month on current plan",
},
    
journal: {
  title: "Trade journal",
  text: "Add trades, track risk, result, emotions, mistakes and lessons.",
  locked: "An active plan or demo access is required to add trades.",
  addTitle: "Add trade",
  editTitle: "Edit trade",
addModeText: "Add a new trade to your personal journal.",
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
deleteTradeButton: "Delete trade",
editTradeButton: "Edit trade",
openChartButton: "Open chart",
cancelEditButton: "Cancel edit",
editModeTitle: "Editing trade",
editModeText: "Change the highlighted fields and save the trade.",
actions: "Actions",
deleteTradeConfirm: "Delete this trade? This action cannot be undone.",
deleteTradeError: "Failed to delete trade.",
uploadScreenshotTitle: "Upload trade screenshot",
screenshotsColumn: "Screens",
openScreenshots: "Open",
noScreenshotsForTrade: "No screenshots uploaded for this trade.",
screenshotViewerTitle: "Trade screenshots",
loadingScreenshots: "Loading screenshots...",
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
screenshotUploadHintCompact:
  "Upload 1 to 3 screenshots with different timeframes for a deeper analysis.",
  screenshotFormats: "Supported formats: PNG, JPG, WEBP",
uploadButton: "Upload",
uploadingButton: "Uploading...",
selectTradePlaceholder: "Select trade",
stepOne: "Step 1",
stepTwo: "Step 2",
stepThree: "Step 3",
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
marketLabels: {
  stocks: "Stocks",
  crypto: "Crypto",
  futures: "Futures",
  forex: "Forex",
  options: "Options",
},
directionLabels: {
  long: "Long",
  short: "Short",
},
resultLabels: {
  win: "Win",
  loss: "Loss",
  breakeven: "Breakeven",
  notSet: "Not set",
},
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
  updateTradeButton: "Update trade",
  updatingTradeButton: "Updating...",
  tickerRequired: "Enter ticker.",
  tradeLimitReached: "Trade limit reached for your current plan",
 tradeUsageTitle: "Trades used",
 tradesLeftLabel: "left",
  screenshotLimitReached: "Screenshot limit reached for this trade",
 screenshotUsageTitle: "Screenshots used", 
 limitReached: "Trade limit reached for your current plan",
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
  market: "Market",
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
      text:
  "This is a trial version of the SkillEdge Core plan with a limit of 10 AI requests. After the trial ends, access will be closed unless you choose a paid plan.",
      short: "7-day trial. Limit: 10 AI requests.",
    },
    billing: {
  title: "Plan & billing",
  text: "Information about your current plan, payments, and subscription period.",
  activePlan: "Active plan",
  inactivePlan: "Plan is not active",
  period: "Period",
  validUntil: "Valid until",
  empty:
    "After payment, your plan, period, expiration date, and payment history will appear here.",
  currentPlan: "Current plan",
creatingCheckout: "Creating checkout...",
checkoutError: "Failed to create crypto checkout. Please try again.",
loginRequiredForPayment: "Please log in before buying a plan.",
  currentPlanLabel: "Current plan",
  activeSubscription:
    "Subscription is active. Limits and access are applied automatically.",
  inactiveSubscription:
    "Subscription is not active. Some features may be unavailable.",
  active: "Active",
  inactive: "Inactive",
  billingPeriod: "Period",
  aiUsage: "AI usage",
  billingNoteLabel: "Important",
  billingNoteText:
    "Billing currently works as an internal check for plans and limits. Before production, connect payment buttons to Stripe Checkout and webhook-based subscription updates.",
  currentLimitsLabel: "Limits",
  currentLimitsTitle: "What your current plan includes",
  aiCoachLimit: "AI Coach / month",
  journalAiLimit: "Journal AI / month",
  chartAiLimit: "Chart analysis / month",
  aiReportsLimit: "AI reports / month",
  maxTradesLimit: "Max trades",
  screenshotsLimit: "Screenshots per trade",
  aiReportsAccess: "AI reports",
  supportAssistantAccess: "Support assistant",
  socialTickersAccess: "Social tickers",
  aiScannerAccess: "AI scanner",
  premiumChartAccess: "Premium chart analysis",
  exportReportsAccess: "Export reports",
  included: "Included",
  locked: "Locked",
  comparePlansLabel: "Comparison",
  comparePlansTitle: "Plan comparison",
  comparePlansText:
    "Make sure customers clearly see the difference between Core, Edge, and Elite.",
  current: "Current",
  choosePlan: "Choose plan",
  planDescriptions: {
    core: "Basic access for journaling, light AI support, and discipline control.",
    edge: "Advanced plan for active traders: more AI, reports, and social market tools.",
    elite:
      "Maximum plan for serious work: higher limits, scanner, and premium AI.",
  },
},
    aiLimits: {
  reachedTitle: "AI limit reached",
  reachedText:
    "You have used all AI requests available for your current plan this month. Upgrade your plan or wait until the next monthly reset.",
  remainingPrefix: "Remaining AI requests",
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
      error: "AI coach request failed.",
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
charts: {
  title: "Графики TradingView",
  text: "Встроенный график TradingView для анализа тикеров, уровней и сетапов.",
  placeholder: "TradingView widget будет добавлен на следующем этапе.",
  analyzeCurrentChart: "Проанализировать график",
  workspaceText: "Рабочая зона с графиком, watchlist и market movers.",
  watchlistExamples: "Примеры watchlist: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  openWatchlist: "Открыть watchlist",
  hideWatchlist: "Скрыть watchlist",
  watchlistTitle: "Watchlist",
  watchlistSubtitle: "Тикер / 24h % / объём",
  addTickerButton: "Добавить",
  addTickerPlaceholder: "AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  addTickerHint: "Пример: AA.NY = NYSE, TSLA.NQ = NASDAQ, SPY.AM = AMEX, BTCUSDT = Binance.",
  sortSymbol: "Тикер",
  sortChange: "% 24h",
  sortVolume: "Объём",
  symbolColumn: "Тикер",
  percentColumn: "%",
  volumeColumn: "Объём",
  loadingWatchlist: "Загружаем watchlist...",
  emptyWatchlist: "Watchlist пуст. Нажми + и добавь тикер.",
  removeFromWatchlist: "Удалить из watchlist",
  loginFirst: "Сначала войдите в аккаунт.",
  settingsLoadError: "Не удалось загрузить настройки графиков.",
  addTickerError: "Не удалось добавить тикер в watchlist.",
  removeTickerError: "Не удалось удалить тикер из watchlist.",
  moversStocks: "Акции",
  moversCrypto: "Крипто",
  moversGainers: "Top Gainers",
  moversLosers: "Top Losers",
  moversCollapse: "Свернуть",
  moversExpand: "Развернуть",
  moversName: "Название",
  moversPercentChange: "% Изменение",
  moversLoading: "Загружаем movers...",
  moversEmpty: "Нет инструментов под этот фильтр.",
  moversStocksNeedKey: "Stocks movers заработают после добавления NEXT_PUBLIC_FMP_API_KEY.",
chartAnalysisTitle: "AI-анализ графика",
chartAnalysisText:
  "SkillEdge AI анализирует текущий тикер, таймфрейм, рыночные данные, свечи, объём и контекст риска.",
chartAnalysisLoading: "Анализируем текущий график...",
chartAnalysisError: "Не удалось проанализировать текущий график.",
chartAnalysisEmpty: "Запусти AI-анализ, чтобы увидеть разбор текущего графика.",
chartAnalysisClose: "Закрыть",
chartAnalysisSymbol: "Тикер",
chartAnalysisInterval: "Таймфрейм",
chartAnalysisReportLabel: "Отчёт SkillEdge AI",
chartAnalysisDataLabel: "Разбор рыночной структуры",
chartAnalysisSectionsLabel: "Секции анализа",
marketDataUnavailableTitle: "Рыночные данные недоступны",
marketDataUnavailableText:
  "SkillEdge AI не смог загрузить рыночные данные по этому тикеру на текущем data-плане. Попробуй более ликвидный тикер: AAPL, TSLA, NVDA, SPY или QQQ.",
marketDataPremiumTitle: "Нужен premium-доступ к market data",
marketDataPremiumText:
  "Этот тикер, таймфрейм или источник данных может требовать более высокий тариф market data. Перед запуском SkillEdge AI будет поддерживать более широкое premium-покрытие рынка.",
marketDataGenericErrorTitle: "Анализ временно недоступен",
marketDataGenericErrorText:
  "Сейчас не удалось выполнить анализ графика. Попробуй другой тикер, таймфрейм или запусти анализ ещё раз.",
chartControlTickerLabel: "Тикер",
chartControlTickerPlaceholder: "AAPL / TSLA.NQ / AA.NY / BTCUSDT",
chartControlIntervalLabel: "Таймфрейм",
chartControlOpenChart: "Открыть график",
chartControlHint:
  "Используй эту панель для управления TradingView и AI-анализом. Изменения внутри самого TradingView могут не синхронизироваться обратно в SkillEdge AI.",
},
learning: {
  title: "Центр обучения",
  text: "Структурное обучение трейдингу, сетапы, риск-менеджмент, психология и построение playbook.",
  learningNoteTitle: "Learning Center сейчас работает как база повторения",
learningNoteText:
  "SkillEdge AI в первую очередь сфокусирован на журнале сделок, анализе графиков, AI-разборе и развитии торговой системы. Этот раздел пока не является полноценной академией: он создан как короткая база для восстановления ключевых понятий, чтобы клиент быстрее понимал риск, сетапы, структуру рынка и логику AI-анализа.",
  overviewLabel: "Обзор обучения",
  modulesLabel: "Модули",
  lessonsLabel: "уроков",
  progressLabel: "Прогресс",
  totalProgressLabel: "Общий прогресс",
  startButton: "Начать",
  continueButton: "Продолжить",
  reviewButton: "Повторить",
  notStartedStatus: "Не начато",
  inProgressStatus: "В процессе",
  completedStatus: "Пройдено",
  lockedLabel: "Скоро",
  estimatedTimeLabel: "Время",
  levelLabel: "Уровень",
  beginnerLevel: "Начальный",
  intermediateLevel: "Средний",
  advancedLevel: "Продвинутый",
  moduleOneTitle: "Основы рынка",
  moduleOneText:
    "Разберись, как работает рынок, как взаимодействуют ордера и почему ликвидность решает.",
  moduleTwoTitle: "Технический анализ",
  moduleTwoText:
    "Свечи, уровни, тренд/ренж, объём и чистое чтение графика без лишнего шума.",
  moduleThreeTitle: "Риск-менеджмент",
  moduleThreeText:
    "Правила риска на сделку, стоп-лосс, размер позиции и соотношение риск/прибыль.",
  moduleFourTitle: "Intraday Momentum",
  moduleFourText:
    "Логика импульса, breakout/reclaim, failed breakout и continuation-сетапы.",
  moduleFiveTitle: "Психология трейдинга",
  moduleFiveText:
    "Контроль overtrading, revenge trading, страха, сомнений и импульсивных входов.",
  moduleSixTitle: "Playbook / Сетапы",
  moduleSixText:
    "Превращай повторяющиеся паттерны в торговый playbook с триггерами и invalidation.",
  lessonMarketStructure: "Как работает рынок",
  lessonOrderTypes: "Типы ордеров",
  lessonBidAskSpread: "Bid / Ask / Spread",
  lessonLiquidity: "Ликвидность",
  lessonCandles: "Свечи",
  lessonLevels: "Поддержка и сопротивление",
  lessonTrendRange: "Тренд vs ренж",
  lessonVolume: "Анализ объёма",
  lessonRiskPerTrade: "Риск на сделку",
  lessonStopLoss: "Стоп-лосс",
  lessonRiskReward: "Risk / Reward",
  lessonPositionSizing: "Размер позиции",
  lessonMomentumLogic: "Логика momentum",
  lessonBreakoutReclaim: "Breakout / reclaim",
  lessonFailedBreakout: "Failed breakout",
  lessonContinuation: "Continuation",
  lessonDiscipline: "Дисциплина",
  lessonOvertrading: "Overtrading",
  lessonRevengeTrading: "Revenge trading",
  lessonPatience: "Терпение",
  lessonSetupChecklist: "Чеклист сетапа",
  lessonEntryTrigger: "Триггер входа",
  lessonInvalidation: "Invalidation",
  lessonReviewProcess: "Процесс разбора",
  advancedTracksLabel: "Дополнительные направления",
advancedTracksText:
  "Дополнительные специализированные обучающие направления, которые будут открыты в следующем расширении SkillEdge AI.",
comingSoonButton: "Скоро",
activeModuleLabel: "Активный модуль",
openLessonButton: "Открыть урок",
selectedModuleHint:
  "Выбери модуль, чтобы увидеть уроки, прогресс и следующий шаг обучения.",
nextLessonLabel: "Следующий урок",
moduleDetailsLabel: "Детали модуля",
lessonViewerLabel: "Просмотр урока",
lessonContentLabel: "Содержание урока",
lessonCloseButton: "Закрыть урок",
lessonStartText:
  "Содержание этого урока будет расширено на следующем этапе. Сейчас это рабочая оболочка урока внутри SkillEdge AI.",
lessonKeyPointsLabel: "Ключевые идеи",
lessonPracticeLabel: "Практическое задание",
lessonPracticeText:
  "Разбери концепцию, найди один пример на графике и запиши, что подтверждает или ломает идею.",
markLessonCompletedButton: "Отметить урок пройденным",
lessonCompletedButton: "Урок пройден",
frontendProgressNote:
  "Прогресс сохраняется в аккаунте SkillEdge AI и останется после перезагрузки.",
learningProgressLoading: "Загружаем прогресс обучения...",
learningProgressSaving: "Сохраняем прогресс...",
learningProgressSaved: "Прогресс сохранён",
lessonAutoAdvanced:
  "Урок сохранён. Следующий урок открыт автоматически.",
moduleCompletedMessage: "Модуль завершён. Отличная работа.",
learningProgressError: "Не удалось синхронизировать прогресс обучения.",
  extraModuleOneTitle: "Концепция Smart Money и рабочие сетапы",
extraModuleOneText:
  "Структура рынка, ликвидность, inducement, displacement, order blocks и практическая логика рабочих сетапов.",
extraModuleTwoTitle: "Скальпинг стакана в CScalp",
extraModuleTwoText:
  "Обучение платформе, базовая работа с order flow, пробой уровня и сетапы “ножи” для активного скальпинга.",
extraModuleThreeTitle: "Дополнительный модуль 3",
extraModuleThreeText:
  "Этот модуль будет заполнен следующим специализированным блоком обучения.",
extraModuleFourTitle: "Дополнительный модуль 4",
extraModuleFourText:
  "Этот модуль будет заполнен следующим специализированным блоком обучения.",
extraModuleOneLessonOne: "Структура рынка",
extraModuleOneLessonTwo: "Зоны ликвидности",
extraModuleOneLessonThree: "Order blocks",
extraModuleOneLessonFour: "Рабочие сетапы",
extraModuleTwoLessonOne: "Интерфейс CScalp",
extraModuleTwoLessonTwo: "Основы DOM",
extraModuleTwoLessonThree: "Пробой уровня",
extraModuleTwoLessonFour: "Сетап “ножи”",
extraModuleThreeLessonOne: "Урок 1",
extraModuleThreeLessonTwo: "Урок 2",
extraModuleThreeLessonThree: "Урок 3",
extraModuleThreeLessonFour: "Урок 4",
extraModuleFourLessonOne: "Урок 1",
extraModuleFourLessonTwo: "Урок 2",
extraModuleFourLessonThree: "Урок 3",
extraModuleFourLessonFour: "Урок 4",
},
reports: {
  title: "Отчёты",
  text: "Статистика по журналу, динамика PnL, качество сетапов, ошибки и сильные стороны торговли.",
  placeholder: "Расширенные отчёты будут добавлены на следующем этапе.",
  emptyTitle: "Пока недостаточно данных для отчёта",
  emptyText:
    "Добавь несколько сделок в журнал, чтобы SkillEdge AI смог построить отчёт по PnL, win rate, сетапам, ошибкам и динамике результата.",
  totalTrades: "Всего сделок",
  totalTradesHelper: "Все сделки из журнала",
  totalPnl: "Total PnL",
  totalPnlHelper: "Суммарный результат по закрытым сделкам",
  winRate: "Win rate",
  averagePnl: "Average PnL",
  averagePnlHelper: "Средний результат на сделку",
  profitFactor: "Profit factor",
  profitFactorHelper: "Gross profit / gross loss",
  bestWorst: "Best / Worst",
  bestWorstHelper: "Лучшая и худшая сделка",
  equityTitle: "Equity curve",
  equitySubtitle: "Динамика накопительного PnL",
  points: "точек",
  directionTitle: "Long vs Short",
  directionSubtitle: "Результат по направлению",
  marketBreakdown: "Рынки",
  setupBreakdown: "Сетапы",
  mistakesBreakdown: "Ошибки",
  noData: "Пока нет данных.",
    filtersTitle: "Фильтры отчёта",
  filtersText:
    "Сужай статистику по периоду, рынку, направлению и сетапу, чтобы видеть реальное качество торговли.",
  resetFilters: "Сбросить фильтры",
  periodFilter: "Период",
  periodAll: "Всё время",
  period7d: "7 дней",
  period30d: "30 дней",
  period90d: "90 дней",
  marketFilter: "Рынок",
  allMarkets: "Все рынки",
  directionFilter: "Направление",
  allDirections: "Все направления",
  setupFilter: "Сетап",
  allSetups: "Все сетапы",
  filteredTrades: "Сделок в фильтре",
  noFilteredTradesTitle: "Под выбранные фильтры сделок нет",
noFilteredTradesText:
  "Попробуй изменить период, рынок, направление или сетап. Сделки в журнале есть, но текущая комбинация фильтров ничего не нашла.",
aiReportTitle: "AI-отчёт",
aiReportSubtitle: "Сводка по выбранным сделкам",
aiReportText:
  "Сгенерируй краткий отчёт по текущему фильтру: что работает, где ошибки, какой риск, какие сетапы дают лучший результат и на что обратить внимание дальше.",
aiReportButton: "Сгенерировать отчёт",
aiReportLoading: "Генерируем...",
aiReportError: "Не удалось сгенерировать AI-отчёт.",
aiReportLabel: "AI-отчёт",
generateAiReport: "Сгенерировать отчёт",
aiReportGenerating: "Генерируем отчёт...",
aiReportPlaceholder:
  "AI-отчёт появится здесь после генерации. Он сохранится в истории, чтобы клиент мог вернуться к нему позже.",
aiReportResultLabel: "Результат",
latestAiReportTitle: "Последний AI-отчёт",
savedAiReportTitle: "Сохранённый AI-отчёт",
aiReportHistoryLabel: "История",
aiReportHistoryTitle: "История AI-отчётов",
aiReportHistoryText:
  "Открывай прошлые AI-сводки по фильтрам и быстро возвращайся к важным выводам.",
aiReportHistoryEmpty: "Пока сохранённых AI-отчётов нет.",
currentSummaryLabel: "Текущая сводка",
allPeriods: "Все периоды",
deleteAiReport: "Удалить отчёт",
copyAiReport: "Скопировать",
downloadAiReport: "Скачать .txt",
aiReportCopied: "AI-отчёт скопирован.",
aiReportCopyFailed: "Не удалось скопировать отчёт.",
aiReportDownloaded: "AI-отчёт скачан.",
upgradeForAiReports: "Нужен Edge",
aiReportUpgradeRequired:
  "AI-отчёты доступны на тарифах SkillEdge Edge и SkillEdge Elite.",
aiReportLockedText:
  "AI-отчёты помогают разобрать выбранные сделки, найти лучшие сетапы, ошибки и следующий фокус. Эта функция доступна на тарифах SkillEdge Edge и SkillEdge Elite.",
aiReportPlanHint: "AI-отчётов в месяц на текущем тарифе",
}, 
journal: {
  title: "Журнал сделок",
  text: "Добавляйте сделки, фиксируйте риск, результат, эмоции, ошибки и уроки.",
  locked: "Для добавления сделок нужен активный тариф или demo-доступ.",
  addTitle: "Добавить сделку",
  editTitle: "Редактировать сделку",
addModeText: "Добавь новую сделку в личный журнал.",
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
deleteTradeButton: "Удалить сделку",
editTradeButton: "Редактировать",
openChartButton: "Открыть график",
cancelEditButton: "Отменить редактирование",
editModeTitle: "Режим редактирования",
editModeText: "Измени подсвеченные поля и сохрани сделку.",
actions: "Действия",
deleteTradeConfirm: "Удалить эту сделку? Это действие нельзя отменить.",
deleteTradeError: "Не удалось удалить сделку.",
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
screenshotUploadHintCompact:
  "Загружай от одного до трёх скринов с разными таймфреймами для более глубокого анализа.",
  screenshotFormats: "Поддерживаемые форматы: PNG, JPG, WEBP",
screenshotsColumn: "Скрины",
openScreenshots: "Открыть",
noScreenshotsForTrade: "Для этой сделки скрины не загружены.",
screenshotViewerTitle: "Скрины сделки",
loadingScreenshots: "Загружаем скрины...",
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
marketLabels: {
  stocks: "Акции",
  crypto: "Крипто",
  futures: "Фьючерсы",
  forex: "Форекс",
  options: "Опционы",
},
directionLabels: {
  long: "Лонг",
  short: "Шорт",
},
resultLabels: {
  win: "Прибыльная",
  loss: "Убыточная",
  breakeven: "Безубыток",
  notSet: "Не задано",
},
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
  updateTradeButton: "Обновить сделку",
  updatingTradeButton: "Обновление...",
  tickerRequired: "Введите тикер.",
  tradeLimitReached: "Достигнут лимит сделок для вашего текущего тарифа",
  tradeUsageTitle: "Использовано сделок",
  tradesLeftLabel: "осталось",
  screenshotLimitReached: "Достигнут лимит скриншотов для этой сделки",
  screenshotUsageTitle: "Использовано скриншотов",
  limitReached: "Достигнут лимит сделок для вашего текущего тарифа",
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
  market: "Рынок",
  coach: "AI Coach",
  learning: "Обучение",
  reports: "Отчёты",
  billing: "Оплата",
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
      text:
  "Это пробная версия тарифа SkillEdge Core с лимитом 10 AI-запросов. После окончания срока доступ будет закрыт, если вы не выберете основной тариф.",
      short: "7-дневная пробная версия. Лимит: 10 AI-запросов.",
    },
    billing: {
  title: "Тариф и оплата",
  text: "Информация про текущий тариф, оплаты и срок действия подписки.",
  activePlan: "Тариф активный",
  inactivePlan: "Тариф не активирован",
  period: "Период",
  validUntil: "Действует до",
  empty:
    "После оплаты тут появятся план, период, дата завершения и история платежей.",
  currentPlan: "Текущий тариф",
creatingCheckout: "Создаём оплату...",
checkoutError: "Не удалось создать crypto checkout. Попробуйте ещё раз.",
loginRequiredForPayment: "Войдите в аккаунт перед оплатой тарифа.",
  currentPlanLabel: "Текущий тариф",
  activeSubscription:
    "Подписка активна. Лимиты и доступы применяются автоматически.",
  inactiveSubscription:
    "Подписка не активна. Некоторые функции могут быть недоступны.",
  active: "Активна",
  inactive: "Неактивна",
  billingPeriod: "Период",
  aiUsage: "AI usage",
  billingNoteLabel: "Важно",
  billingNoteText:
    "Billing сейчас работает как внутренняя проверка тарифов и лимитов. Перед production нужно финально связать кнопки оплаты со Stripe Checkout и webhook-обновлением подписок.",
  currentLimitsLabel: "Лимиты",
  currentLimitsTitle: "Что входит в текущий тариф",
  aiCoachLimit: "AI Coach / месяц",
  journalAiLimit: "Journal AI / месяц",
  chartAiLimit: "Chart analysis / месяц",
  aiReportsLimit: "AI reports / месяц",
  maxTradesLimit: "Максимум сделок",
  screenshotsLimit: "Скриншотов на сделку",
  aiReportsAccess: "AI reports",
  supportAssistantAccess: "Support assistant",
  socialTickersAccess: "Social tickers",
  aiScannerAccess: "AI scanner",
  premiumChartAccess: "Premium chart analysis",
  exportReportsAccess: "Export reports",
  included: "Включено",
  locked: "Закрыто",
  comparePlansLabel: "Сравнение",
  comparePlansTitle: "Сравнение тарифов",
  comparePlansText:
    "Проверь, что клиент видит разницу между Core, Edge и Elite.",
  current: "Текущий",
  choosePlan: "Выбрать тариф",
  planDescriptions: {
    core: "Базовый доступ для ведения журнала, базового AI и контроля дисциплины.",
    edge: "Продвинутый тариф для активных трейдеров: больше AI, отчёты и social market tools.",
    elite:
      "Максимальный тариф для серьёзной работы: расширенные лимиты, scanner и premium AI.",
  },
},
    aiLimits: {
  reachedTitle: "Лимит AI исчерпан",
  reachedText:
    "Вы использовали все AI-запросы, доступные по вашему текущему тарифу в этом месяце. Обновите тариф или дождитесь следующего месячного сброса.",
  remainingPrefix: "Осталось AI-запросов",
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
      error: "Ошибка запроса к AI-коучу.",
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
charts: {
  title: "Графіки TradingView",
  text: "Вбудований графік TradingView для аналізу тикерів, рівнів і сетапів.",
  placeholder: "TradingView widget буде додано на наступному етапі.",
  analyzeCurrentChart: "Проаналізувати графік",
  workspaceText: "Робоча зона з графіком, watchlist і market movers.",
  watchlistExamples: "Приклади watchlist: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  openWatchlist: "Відкрити watchlist",
  hideWatchlist: "Сховати watchlist",
  watchlistTitle: "Watchlist",
  watchlistSubtitle: "Тикер / 24h % / обʼєм",
  addTickerButton: "Додати",
  addTickerPlaceholder: "AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
  addTickerHint: "Приклад: AA.NY = NYSE, TSLA.NQ = NASDAQ, SPY.AM = AMEX, BTCUSDT = Binance.",
  sortSymbol: "Тикер",
  sortChange: "% 24h",
  sortVolume: "Обʼєм",
  symbolColumn: "Тикер",
  percentColumn: "%",
  volumeColumn: "Обʼєм",
  loadingWatchlist: "Завантажуємо watchlist...",
  emptyWatchlist: "Watchlist порожній. Натисни + і додай тикер.",
  removeFromWatchlist: "Видалити з watchlist",
  loginFirst: "Спочатку увійдіть в акаунт.",
  settingsLoadError: "Не вдалося завантажити налаштування графіків.",
  addTickerError: "Не вдалося додати тикер до watchlist.",
  removeTickerError: "Не вдалося видалити тикер з watchlist.",
  moversStocks: "Акції",
  moversCrypto: "Крипто",
  moversGainers: "Top Gainers",
  moversLosers: "Top Losers",
  moversCollapse: "Згорнути",
  moversExpand: "Розгорнути",
  moversName: "Назва",
  moversPercentChange: "% Зміна",
  moversLoading: "Завантажуємо movers...",
  moversEmpty: "Немає інструментів під цей фільтр.",
  moversStocksNeedKey: "Stocks movers запрацюють після додавання NEXT_PUBLIC_FMP_API_KEY.",
chartAnalysisTitle: "AI-аналіз графіка",
chartAnalysisText:
  "SkillEdge AI аналізує поточний тикер, таймфрейм, ринкові дані, свічки, обʼєм і контекст ризику.",
chartAnalysisLoading: "Аналізуємо поточний графік...",
chartAnalysisError: "Не вдалося проаналізувати поточний графік.",
chartAnalysisEmpty: "Запусти AI-аналіз, щоб побачити розбір поточного графіка.",
chartAnalysisClose: "Закрити",
chartAnalysisSymbol: "Тікер",
chartAnalysisInterval: "Таймфрейм",
chartAnalysisReportLabel: "Звіт SkillEdge AI",
chartAnalysisDataLabel: "Розбір ринкової структури",
chartAnalysisSectionsLabel: "Секції аналізу",
marketDataUnavailableTitle: "Ринкові дані недоступні",
marketDataUnavailableText:
  "SkillEdge AI не зміг завантажити ринкові дані по цьому тикеру на поточному data-плані. Спробуй більш ліквідний тикер: AAPL, TSLA, NVDA, SPY або QQQ.",
marketDataPremiumTitle: "Потрібен premium-доступ до market data",
marketDataPremiumText:
  "Цей тикер, таймфрейм або джерело даних може вимагати вищий тариф market data. Перед запуском SkillEdge AI буде підтримувати ширше premium-покриття ринку.",
marketDataGenericErrorTitle: "Аналіз тимчасово недоступний",
marketDataGenericErrorText:
  "Зараз не вдалося виконати аналіз графіка. Спробуй інший тикер, таймфрейм або запусти аналіз ще раз.",
chartControlTickerLabel: "Тікер",
chartControlTickerPlaceholder: "AAPL / TSLA.NQ / AA.NY / BTCUSDT",
chartControlIntervalLabel: "Таймфрейм",
chartControlOpenChart: "Відкрити графік",
chartControlHint:
  "Використовуй цю панель для керування TradingView та AI-аналізом. Зміни всередині самого TradingView можуть не синхронізуватися назад у SkillEdge AI.",
},
learning: {
  title: "Центр навчання",
  text: "Структурне навчання трейдингу, сетапи, ризик-менеджмент, психологія та побудова playbook.",
  learningNoteTitle: "Learning Center зараз працює як база повторення",
learningNoteText:
  "SkillEdge AI насамперед сфокусований на журналі угод, аналізі графіків, AI-розборі та розвитку торгової системи. Цей розділ поки не є повноцінною академією: він створений як коротка база для відновлення ключових понять, щоб клієнт швидше розумів ризик, сетапи, структуру ринку та логіку AI-аналізу.",
  overviewLabel: "Огляд навчання",
  modulesLabel: "Модулі",
  lessonsLabel: "уроків",
  progressLabel: "Прогрес",
  totalProgressLabel: "Загальний прогрес",
  startButton: "Почати",
  continueButton: "Продовжити",
  reviewButton: "Повторити",
  notStartedStatus: "Не розпочато",
  inProgressStatus: "У процесі",
  completedStatus: "Пройдено",
  lockedLabel: "Скоро",
  estimatedTimeLabel: "Час",
  levelLabel: "Рівень",
  beginnerLevel: "Початковий",
  intermediateLevel: "Середній",
  advancedLevel: "Просунутий",
  moduleOneTitle: "Основи ринку",
  moduleOneText:
    "Розберися, як працює ринок, як взаємодіють ордери і чому ліквідність має значення.",
  moduleTwoTitle: "Технічний аналіз",
  moduleTwoText:
    "Свічки, рівні, тренд/ренж, обʼєм і чисте читання графіка без зайвого шуму.",
  moduleThreeTitle: "Ризик-менеджмент",
  moduleThreeText:
    "Правила ризику на угоду, стоп-лосс, розмір позиції та співвідношення ризик/прибуток.",
  moduleFourTitle: "Intraday Momentum",
  moduleFourText:
    "Логіка імпульсу, breakout/reclaim, failed breakout і continuation-сетапи.",
  moduleFiveTitle: "Психологія трейдингу",
  moduleFiveText:
    "Контроль overtrading, revenge trading, страху, сумнівів та імпульсивних входів.",
  moduleSixTitle: "Playbook / Сетапи",
  moduleSixText:
    "Перетворюй повторювані патерни на торговий playbook з тригерами та invalidation.",
  lessonMarketStructure: "Як працює ринок",
  lessonOrderTypes: "Типи ордерів",
  lessonBidAskSpread: "Bid / Ask / Spread",
  lessonLiquidity: "Ліквідність",
  lessonCandles: "Свічки",
  lessonLevels: "Підтримка і спротив",
  lessonTrendRange: "Тренд vs ренж",
  lessonVolume: "Аналіз обʼєму",
  lessonRiskPerTrade: "Ризик на угоду",
  lessonStopLoss: "Стоп-лосс",
  lessonRiskReward: "Risk / Reward",
  lessonPositionSizing: "Розмір позиції",
  lessonMomentumLogic: "Логіка momentum",
  lessonBreakoutReclaim: "Breakout / reclaim",
  lessonFailedBreakout: "Failed breakout",
  lessonContinuation: "Continuation",
  lessonDiscipline: "Дисципліна",
  lessonOvertrading: "Overtrading",
  lessonRevengeTrading: "Revenge trading",
  lessonPatience: "Терпіння",
  lessonSetupChecklist: "Чеклист сетапу",
  lessonEntryTrigger: "Тригер входу",
  lessonInvalidation: "Invalidation",
  lessonReviewProcess: "Процес розбору",
  advancedTracksLabel: "Додаткові напрямки",
advancedTracksText:
  "Додаткові спеціалізовані навчальні напрямки, які будуть відкриті в наступному розширенні SkillEdge AI.",
comingSoonButton: "Незабаром",
activeModuleLabel: "Активний модуль",
openLessonButton: "Відкрити урок",
selectedModuleHint:
  "Обери модуль, щоб побачити уроки, прогрес і наступний крок навчання.",
nextLessonLabel: "Наступний урок",
moduleDetailsLabel: "Деталі модуля",
lessonViewerLabel: "Перегляд уроку",
lessonContentLabel: "Зміст уроку",
lessonCloseButton: "Закрити урок",
lessonStartText:
  "Зміст цього уроку буде розширено на наступному етапі. Зараз це робоча оболонка уроку всередині SkillEdge AI.",
lessonKeyPointsLabel: "Ключові ідеї",
lessonPracticeLabel: "Практичне завдання",
lessonPracticeText:
  "Розбери концепцію, знайди один приклад на графіку і запиши, що підтверджує або ламає ідею.",
markLessonCompletedButton: "Позначити урок пройденим",
lessonCompletedButton: "Урок пройдено",
frontendProgressNote:
  "Прогрес зберігається в акаунті SkillEdge AI і залишиться після перезавантаження.",
learningProgressLoading: "Завантажуємо прогрес навчання...",
learningProgressSaving: "Зберігаємо прогрес...",
learningProgressSaved: "Прогрес збережено",
lessonAutoAdvanced:
  "Урок збережено. Наступний урок відкрито автоматично.",
moduleCompletedMessage: "Модуль завершено. Чудова робота.",
learningProgressError: "Не вдалося синхронізувати прогрес навчання.",
  extraModuleOneTitle: "Концепція Smart Money та робочі сетапи",
extraModuleOneText:
  "Структура ринку, ліквідність, inducement, displacement, order blocks і практична логіка робочих сетапів.",
extraModuleTwoTitle: "Скальпінг стакана в CScalp",
extraModuleTwoText:
  "Навчання платформі, базова робота з order flow, пробій рівня та сетапи “ножі” для активного скальпінгу.",
extraModuleThreeTitle: "Додатковий модуль 3",
extraModuleThreeText:
  "Цей модуль буде заповнений наступним спеціалізованим навчальним блоком.",
extraModuleFourTitle: "Додатковий модуль 4",
extraModuleFourText:
  "Цей модуль буде заповнений наступним спеціалізованим навчальним блоком.",
extraModuleOneLessonOne: "Структура ринку",
extraModuleOneLessonTwo: "Зони ліквідності",
extraModuleOneLessonThree: "Order blocks",
extraModuleOneLessonFour: "Робочі сетапи",
extraModuleTwoLessonOne: "Інтерфейс CScalp",
extraModuleTwoLessonTwo: "Основи DOM",
extraModuleTwoLessonThree: "Пробій рівня",
extraModuleTwoLessonFour: "Сетап “ножі”",
extraModuleThreeLessonOne: "Урок 1",
extraModuleThreeLessonTwo: "Урок 2",
extraModuleThreeLessonThree: "Урок 3",
extraModuleThreeLessonFour: "Урок 4",
extraModuleFourLessonOne: "Урок 1",
extraModuleFourLessonTwo: "Урок 2",
extraModuleFourLessonThree: "Урок 3",
extraModuleFourLessonFour: "Урок 4",
},
reports: {
  title: "Звіти",
  text: "Статистика журналу, динаміка PnL, якість сетапів, помилки та сильні сторони торгівлі.",
  placeholder: "Розширені звіти буде додано на наступному етапі.",
  emptyTitle: "Поки недостатньо даних для звіту",
  emptyText:
    "Додай кілька угод у журнал, щоб SkillEdge AI зміг побудувати звіт по PnL, win rate, сетапах, помилках і динаміці результату.",
  totalTrades: "Усього угод",
  totalTradesHelper: "Усі угоди з журналу",
  totalPnl: "Total PnL",
  totalPnlHelper: "Сумарний результат за закритими угодами",
  winRate: "Win rate",
  averagePnl: "Average PnL",
  averagePnlHelper: "Середній результат на угоду",
  profitFactor: "Profit factor",
  profitFactorHelper: "Gross profit / gross loss",
  bestWorst: "Best / Worst",
  bestWorstHelper: "Найкраща та найгірша угода",
  equityTitle: "Equity curve",
  equitySubtitle: "Динаміка накопичувального PnL",
  points: "точок",
  directionTitle: "Long vs Short",
  directionSubtitle: "Результат за напрямком",
  marketBreakdown: "Ринки",
  setupBreakdown: "Сетапи",
  mistakesBreakdown: "Помилки",
  noData: "Поки немає даних.",
    filtersTitle: "Фільтри звіту",
  filtersText:
    "Звужуй статистику за періодом, ринком, напрямком і сетапом, щоб бачити реальну якість торгівлі.",
  resetFilters: "Скинути фільтри",
  periodFilter: "Період",
  periodAll: "Увесь час",
  period7d: "7 днів",
  period30d: "30 днів",
  period90d: "90 днів",
  marketFilter: "Ринок",
  allMarkets: "Усі ринки",
  directionFilter: "Напрямок",
  allDirections: "Усі напрямки",
  setupFilter: "Сетап",
  allSetups: "Усі сетапи",
  filteredTrades: "Угод у фільтрі",
  noFilteredTradesTitle: "За вибраними фільтрами угод немає",
noFilteredTradesText:
  "Спробуй змінити період, ринок, напрямок або сетап. У журналі є угоди, але поточна комбінація фільтрів нічого не знайшла.",
aiReportTitle: "AI-звіт",
aiReportSubtitle: "Зведення за вибраними угодами",
aiReportText:
  "Згенеруй короткий звіт за поточним фільтром: що працює, де помилки, якість ризику, найкращі сетапи та на чому сфокусуватися далі.",
aiReportButton: "Згенерувати звіт",
aiReportLoading: "Генеруємо...",
aiReportError: "Не вдалося згенерувати AI-звіт.",
aiReportLabel: "AI-звіт",
generateAiReport: "Згенерувати звіт",
aiReportGenerating: "Генеруємо звіт...",
aiReportPlaceholder:
  "AI-звіт з’явиться тут після генерації. Він також збережеться в історії, щоб клієнт міг повернутися до нього пізніше.",
aiReportResultLabel: "Результат",
latestAiReportTitle: "Останній AI-звіт",
savedAiReportTitle: "Збережений AI-звіт",
aiReportHistoryLabel: "Історія",
aiReportHistoryTitle: "Історія AI-звітів",
aiReportHistoryText:
  "Відкривай попередні AI-зведення за фільтрами та швидко повертайся до найважливіших висновків.",
aiReportHistoryEmpty: "Поки що збережених AI-звітів немає.",
currentSummaryLabel: "Поточне зведення",
allPeriods: "Усі періоди",
deleteAiReport: "Видалити звіт",
copyAiReport: "Скопіювати",
downloadAiReport: "Завантажити .txt",
aiReportCopied: "AI-звіт скопійовано.",
aiReportCopyFailed: "Не вдалося скопіювати звіт.",
aiReportDownloaded: "AI-звіт завантажено.",
upgradeForAiReports: "Потрібен Edge",
aiReportUpgradeRequired:
  "AI-звіти доступні на тарифах SkillEdge Edge та SkillEdge Elite.",
aiReportLockedText:
  "AI-звіти допомагають розібрати вибрані угоди, знайти найкращі сетапи, помилки та наступний фокус. Ця функція доступна на тарифах SkillEdge Edge та SkillEdge Elite.",
aiReportPlanHint: "AI-звітів на місяць на поточному тарифі",
},
    
journal: {
  title: "Журнал угод",
  text: "Додавайте угоди, фіксуйте ризик, результат, емоції, помилки та уроки.",
  locked: "Для додавання угод потрібен активний тариф або demo-доступ.",
  addTitle: "Додати угоду",
  editTitle: "Редагувати угоду",
addModeText: "Додай нову угоду до особистого журналу.",
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
deleteTradeButton: "Видалити угоду",
editTradeButton: "Редагувати",
openChartButton: "Відкрити графік",
cancelEditButton: "Скасувати редагування",
editModeTitle: "Режим редагування",
editModeText: "Зміни підсвічені поля та збережи угоду.",
actions: "Дії",
deleteTradeConfirm: "Видалити цю угоду? Цю дію не можна скасувати.",
deleteTradeError: "Не вдалося видалити угоду.",
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
screenshotUploadHintCompact:
  "Завантажуй від одного до трьох скрінів з різними таймфреймами для глибшого аналізу.",
  screenshotFormats: "Підтримувані формати: PNG, JPG, WEBP",
screenshotsColumn: "Скріни",
openScreenshots: "Відкрити",
noScreenshotsForTrade: "Для цієї угоди скріни не завантажені.",
screenshotViewerTitle: "Скріни угоди",
loadingScreenshots: "Завантажуємо скріни...",
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
marketLabels: {
  stocks: "Акції",
  crypto: "Крипто",
  futures: "Ф’ючерси",
  forex: "Форекс",
  options: "Опціони",
},
directionLabels: {
  long: "Лонг",
  short: "Шорт",
},
resultLabels: {
  win: "Прибуткова",
  loss: "Збиткова",
  breakeven: "Беззбиткова",
  notSet: "Не задано",
},
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
  updateTradeButton: "Оновити угоду",
  updatingTradeButton: "Оновлення...",
  tickerRequired: "Введіть тикер.",
  tradeLimitReached: "Досягнуто ліміт угод для вашого поточного тарифу",
  tradeUsageTitle: "Використано угод",
  tradesLeftLabel: "залишилось",
  screenshotLimitReached: "Досягнуто ліміт скриншотів для цієї угоди",
  screenshotUsageTitle: "Використано скриншотів",
  limitReached: "Досягнуто ліміт угод для вашого поточного тарифу",
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
  market: "Ринок",
  coach: "AI Coach",
  learning: "Навчання",
  reports: "Звіти",
  billing: "Оплата",
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
      text:
  "Це пробна версія тарифу SkillEdge Core з лімітом 10 AI-запитів. Після завершення пробного періоду доступ буде закрито, якщо ви не оберете основний тариф.",
      short: "7-денна пробна версія. Ліміт: 10 AI-запитів.",    
},
    billing: {
  title: "Тариф і оплата",
  text: "Інформація про поточний тариф, оплати та строк дії підписки.",
  activePlan: "Тариф активний",
  inactivePlan: "Тариф не активовано",
  period: "Період",
  validUntil: "Діє до",
  empty:
    "Після оплати тут зʼявляться план, період, дата завершення та історія платежів.",
  currentPlan: "Поточний тариф",
creatingCheckout: "Створюємо оплату...",
checkoutError: "Не вдалося створити crypto checkout. Спробуйте ще раз.",
loginRequiredForPayment: "Увійдіть в акаунт перед оплатою тарифу.",
  currentPlanLabel: "Поточний тариф",
  activeSubscription:
    "Підписка активна. Ліміти та доступи застосовуються автоматично.",
  inactiveSubscription:
    "Підписка не активна. Деякі функції можуть бути недоступні.",
  active: "Активна",
  inactive: "Неактивна",
  billingPeriod: "Період",
  aiUsage: "AI usage",
  billingNoteLabel: "Важливо",
  billingNoteText:
    "Billing зараз працює як внутрішня перевірка тарифів і лімітів. Перед production потрібно фінально зв’язати кнопки оплати зі Stripe Checkout та webhook-оновленням підписок.",
  currentLimitsLabel: "Ліміти",
  currentLimitsTitle: "Що входить у поточний тариф",
  aiCoachLimit: "AI Coach / місяць",
  journalAiLimit: "Journal AI / місяць",
  chartAiLimit: "Chart analysis / місяць",
  aiReportsLimit: "AI reports / місяць",
  maxTradesLimit: "Максимум угод",
  screenshotsLimit: "Скріншотів на угоду",
  aiReportsAccess: "AI reports",
  supportAssistantAccess: "Support assistant",
  socialTickersAccess: "Social tickers",
  aiScannerAccess: "AI scanner",
  premiumChartAccess: "Premium chart analysis",
  exportReportsAccess: "Export reports",
  included: "Увімкнено",
  locked: "Закрито",
  comparePlansLabel: "Порівняння",
  comparePlansTitle: "Порівняння тарифів",
  comparePlansText:
    "Перевір, що клієнт чітко бачить різницю між Core, Edge та Elite.",
  current: "Поточний",
  choosePlan: "Обрати тариф",
  planDescriptions: {
    core: "Базовий доступ для журналу, легкого AI та контролю дисципліни.",
    edge: "Просунутий тариф для активних трейдерів: більше AI, звіти та social market tools.",
    elite:
      "Максимальний тариф для серйозної роботи: більші ліміти, scanner і premium AI.",
  },
},
    aiLimits: {
  reachedTitle: "Ліміт AI вичерпано",
  reachedText:
    "Ви використали всі AI-запити, доступні у вашому поточному тарифі цього місяця. Оновіть тариф або дочекайтеся наступного місячного скидання.",
  remainingPrefix: "Залишилось AI-запитів",
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
      error: "Помилка запиту до AI-коуча.",
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
  { id: "market" },
  { id: "coach" },
  { id: "learning" },
  { id: "reports" },
  { id: "billing" },
];

const planNames: Record<PlanId, string> = {
  core: "SkillEdge Core",
  edge: "SkillEdge Edge",
  elite: "SkillEdge Elite",
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
  const [chartSymbolFromJournal, setChartSymbolFromJournal] = useState("");
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
const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
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
const resetTradeForm = () => {
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
};
const [editingTradeId, setEditingTradeId] = useState("");
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
  .select("id,user_id,subscription_id,trade_id,analysis_type,user_message,ai_response,model,tokens_used,created_at")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(10);

  const analyses = ((analysesData ?? []) as AiAnalysis[]);

setChartAnalysisHistory(
  analyses.filter((item) => item.analysis_type === "trade_chart")
);

setCoachHistory(
  analyses.filter((item) => item.analysis_type === "coach").slice(0, 10)
);
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


if (!error && subData) {
  const subscriptionIsActive =
    subData.status === "active" &&
    (!subData.expires_at ||
      new Date(subData.expires_at).getTime() > Date.now());

  if (subscriptionIsActive) {
    setSubscription({
      active: true,
      plan: normalizePlanId(subData.plan_id),
      period: subData.billing_period,
      aiLimit: subData.ai_monthly_limit,
      aiUsed: subData.ai_used_this_month,
      expiresAt: subData.expires_at,
      isDemo: Boolean(subData.is_demo),
    });
  }
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
  if (result.code === "AI_LIMIT_REACHED") {
    setCoachError(`${t.aiLimits.reachedTitle}. ${t.aiLimits.reachedText}`);
    return;
  }

  setCoachError(result.error || t.coach.error);
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

const handleTradeDelete = async (tradeId: string) => {
  const confirmed = window.confirm(t.journal.deleteTradeConfirm);

  if (!confirmed) return;

  setTradeError("");

  const screenshotPaths = tradeScreenshots
    .filter((screenshot) => screenshot.trade_id === tradeId)
    .map((screenshot) => screenshot.file_path)
    .filter(Boolean);

  const { error } = await supabase.from("trades").delete().eq("id", tradeId);

  if (error) {
    setTradeError(t.journal.deleteTradeError);
    return;
  }

  if (screenshotPaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("trade-screenshots")
      .remove(screenshotPaths);

    if (storageError) {
      console.error(
        "Failed to delete trade screenshots from storage:",
        storageError
      );
    }
  }

  setTrades((current) => current.filter((trade) => trade.id !== tradeId));

  setTradeScreenshots((current) =>
    current.filter((screenshot) => screenshot.trade_id !== tradeId)
  );

  setChartAnalysisHistory((current) =>
    current.filter((analysis) => analysis.trade_id !== tradeId)
  );

  if (selectedTradeIdForScreenshot === tradeId) {
    setSelectedTradeIdForScreenshot("");
  }

  if (chartAnalysisTradeId === tradeId) {
    setChartAnalysisTradeId("");
    setChartAnalysis("");
  }

  if (expandedChartAnalysisTradeId === tradeId) {
    setExpandedChartAnalysisTradeId("");
  }

  if (editingTradeId === tradeId) {
    setEditingTradeId("");
  }
};

const handleOpenTradeChart = (trade: Trade) => {
  const rawTicker = trade.ticker?.trim();

  if (!rawTicker) {
    return;
  }

  const normalizedSymbol = normalizeChartSymbol(rawTicker);

  setChartSymbolFromJournal(normalizedSymbol);
  setActiveTab("charts");
};

const handleTradeEditStart = (trade: Trade) => {
  setEditingTradeId(trade.id);
  setSelectedTradeIdForScreenshot(trade.id);
  setScreenshotFiles([]);
  setScreenshotError("");

  setTradeForm({
    ticker: trade.ticker ?? "",
    market: trade.market ?? "stocks",
    direction: trade.direction ?? "long",
    entryPrice: trade.entry_price?.toString() ?? "",
    exitPrice: trade.exit_price?.toString() ?? "",
    stopLoss: trade.stop_loss?.toString() ?? "",
    positionSize: trade.position_size?.toString() ?? "",
    riskAmount: trade.risk_amount?.toString() ?? "",
    pnl: trade.pnl?.toString() ?? "",
    result: trade.result ?? "",
    setup: trade.setup ?? "",
    emotion: trade.emotion ?? "",
    mistake: trade.mistake ?? "",
    lesson: trade.lesson ?? "",
    notes: trade.notes ?? "",
    tradeDate: trade.trade_date ?? "",
  });

  
};

const handleTradeEditCancel = () => {
  setEditingTradeId("");
  setSelectedTradeIdForScreenshot("");
  setScreenshotFiles([]);
  setScreenshotError("");
  resetTradeForm();
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
    setTradeError(t.coach.loginFirst);
    return;
  }

  const planLimits = getPlanLimits(subscription.plan);

if (!editingTradeId && trades.length >= planLimits.maxTrades) {
  setTradeError(
    `${t.journal.tradeLimitReached}: ${planLimits.maxTrades}`
  );
  return;
}

  const tradePayload = {
    ticker,
    market: tradeForm.market,
    direction: tradeForm.direction,
    trade_date: tradeForm.tradeDate || new Date().toISOString().slice(0, 10),
    entry_price: tradeForm.entryPrice ? Number(tradeForm.entryPrice) : null,
    exit_price: tradeForm.exitPrice ? Number(tradeForm.exitPrice) : null,
    stop_loss: tradeForm.stopLoss ? Number(tradeForm.stopLoss) : null,
    position_size: tradeForm.positionSize ? Number(tradeForm.positionSize) : null,
    risk_amount: tradeForm.riskAmount ? Number(tradeForm.riskAmount) : null,
    pnl: tradeForm.pnl ? Number(tradeForm.pnl) : null,
    result: tradeForm.result || null,
    setup: tradeForm.setup.trim() || null,
    emotion: tradeForm.emotion.trim() || null,
    mistake: tradeForm.mistake.trim() || null,
    lesson: tradeForm.lesson.trim() || null,
    notes: tradeForm.notes.trim() || null,
  };

  setTradeSaving(true);

  if (editingTradeId) {
    const { data, error } = await supabase
      .from("trades")
      .update(tradePayload)
      .eq("id", editingTradeId)
      .eq("user_id", userData.user.id)
      .select("*")
      .single();

    if (error) {
      setTradeError(error.message);
      setTradeSaving(false);
      return;
    }

    setTrades((current) =>
  current.map((trade) => (trade.id === editingTradeId ? (data as Trade) : trade))
);

if (screenshotFiles.length > 0) {
  try {
    setScreenshotUploading(true);

    await uploadScreenshotsForTrade({
      tradeId: editingTradeId,
      files: screenshotFiles,
      userId: userData.user.id,
    });

    setScreenshotFiles([]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Screenshot upload failed.";

    setTradeError(message);
    setScreenshotError(message);
    setTradeSaving(false);
    setScreenshotUploading(false);
    return;
  } finally {
    setScreenshotUploading(false);
  }
}

setEditingTradeId("");
resetTradeForm();
setTradeSaving(false);
return;
  }

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: userData.user.id,
      ...tradePayload,
    })
    .select("*")
    .single();

  if (error) {
    setTradeError(error.message);
    setTradeSaving(false);
    return;
  }

  setTrades((current) => [data as Trade, ...current]);

if (screenshotFiles.length > 0) {
  try {
    setScreenshotUploading(true);

    await uploadScreenshotsForTrade({
      tradeId: (data as Trade).id,
      files: screenshotFiles,
      userId: userData.user.id,
    });

    setScreenshotFiles([]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Screenshot upload failed.";

    setTradeError(message);
    setScreenshotError(message);
    setTradeSaving(false);
    setScreenshotUploading(false);
    return;
  } finally {
    setScreenshotUploading(false);
  }
}

resetTradeForm();
setTradeSaving(false);
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
  if (result.code === "AI_LIMIT_REACHED") {
    setJournalAnalysisError(
      `${t.aiLimits.reachedTitle}. ${t.aiLimits.reachedText}`
    );
    return;
  }

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
const uploadScreenshotsForTrade = async ({
  tradeId,
  files,
  userId,
}: {
  tradeId: string;
  files: File[];
  userId: string;
}) => {
  if (files.length === 0) {
    return;
  }

  const currentScreenshotsCount = tradeScreenshots.filter(
    (screenshot) => screenshot.trade_id === tradeId
  ).length;

  const maxScreenshotsPerTrade = getPlanLimits(
    subscription.plan ?? "core"
  ).maxScreenshotsPerTrade;

  const availableSlots = Math.max(
    maxScreenshotsPerTrade - currentScreenshotsCount,
    0
  );

  if (files.length > availableSlots) {
    throw new Error(
      `${t.journal.screenshotLimitReached}: ${maxScreenshotsPerTrade}`
    );
  }

  const insertedScreenshots: TradeScreenshot[] = [];

  for (const [index, file] of files.entries()) {
    const safeFileName = file.name
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const filePath = `${userId}/${tradeId}/${Date.now()}-${index}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("trade-screenshots")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Failed to upload screenshot.");
    }

    const { data: insertedScreenshot, error: insertError } = await supabase
      .from("trade_screenshots")
      .insert({
        trade_id: tradeId,
        user_id: userId,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        screenshot_type: "chart",
      })
      .select("*")
      .single();

    if (insertError) {
      throw new Error(insertError.message || "Failed to save screenshot.");
    }

    insertedScreenshots.push(insertedScreenshot as TradeScreenshot);
  }

  setTradeScreenshots((current) => [
    ...insertedScreenshots,
    ...current,
  ]);
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
  if (result.code === "AI_LIMIT_REACHED") {
    setChartAnalysisError(
      `${t.aiLimits.reachedTitle}. ${t.aiLimits.reachedText}`
    );
    return;
  }

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
  {t.locked.label}
</p>

<h2 className="mt-3 text-3xl font-semibold">
  {t.locked.title}
</h2>

<p className="mt-4 text-sm leading-7 text-white/60">
  {t.locked.text}
</p>

<a
  href="/?page=pricing"
  className="mt-7 inline-flex rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.03]"
>
  {t.locked.button}
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
screenshotLimit={getPlanLimits(subscription.plan ?? "core").maxScreenshotsPerTrade}
tradeLimit={getPlanLimits(subscription.plan ?? "core").maxTrades}
screenshotFiles={screenshotFiles}
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
onScreenshotFilesChange={setScreenshotFiles}
onJournalAnalysis={handleJournalAnalysis}
onTradeFormChange={setTradeForm}
onTradeSubmit={handleTradeSubmit}
onTradeDelete={handleTradeDelete}
onOpenTradeChart={handleOpenTradeChart}
editingTradeId={editingTradeId}
onTradeEditStart={handleTradeEditStart}
onTradeEditCancel={handleTradeEditCancel}
  />
)}
              {activeTab === "charts" && (
  <ChartsTab t={t} requestedSymbol={chartSymbolFromJournal} />
)}
              
              {activeTab === "market" && (
  <MarketTab subscription={subscription} t={t} />
)}
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
              {activeTab === "learning" && <LearningTab t={t} />}
              {activeTab === "reports" && (
  <ReportsTab trades={trades} subscription={subscription} t={t} />
)}
              {activeTab === "billing" && (
  <BillingTab subscription={subscription} t={t} />
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
    ? t.loading
    : subscription.active && subscription.plan
    ? planNames[subscription.plan]
    : t.notActivated}
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
  tradeLimit,
  screenshotLimit,
  screenshotFiles,
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
  onTradeDelete,
  onOpenTradeChart,
  editingTradeId,
onTradeEditStart,
onTradeEditCancel,
  onJournalAnalysis,
  onScreenshotFilesChange,
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
screenshotLimit: number;
tradeLimit: number;
screenshotFiles: File[];
screenshotUploading: boolean;
screenshotError: string;
chartAnalysisTradeId: string;
chartAnalysis: string;
chartAnalysisLoading: boolean;
chartAnalysisError: string;
chartAnalysisHistory: AiAnalysis[];
expandedChartAnalysisTradeId: string;
onExpandedChartAnalysisTradeIdChange: (tradeId: string) => void;
onScreenshotFilesChange: (files: File[]) => void;
onTradeChartAnalysis: (tradeId: string) => void;
onJournalAnalysis: () => void;
onTradeSubmit: () => void;
onTradeDelete: (tradeId: string) => void;
onOpenTradeChart: (trade: Trade) => void;
editingTradeId: string;
onTradeEditStart: (trade: Trade) => void;
onTradeEditCancel: () => void;
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
}) {

const [screenshotViewerTrade, setScreenshotViewerTrade] =
  useState<Trade | null>(null);

const [screenshotViewerUrls, setScreenshotViewerUrls] = useState<
  { id: string; name: string; url: string }[]
>([]);

const [screenshotViewerLoading, setScreenshotViewerLoading] = useState(false);
const [screenshotViewerError, setScreenshotViewerError] = useState("");

const updateField = (field: keyof typeof tradeForm, value: string) => {
  onTradeFormChange((current) => ({
    ...current,
    [field]: value,
  }));
};

const getTradeScreenshots = (tradeId: string) => {
  return tradeScreenshots.filter((item) => item.trade_id === tradeId);
};

const handleCloseScreenshotViewer = () => {
  setScreenshotViewerTrade(null);
  setScreenshotViewerUrls([]);
  setScreenshotViewerLoading(false);
  setScreenshotViewerError("");
};

const handleOpenTradeScreenshots = async (trade: Trade) => {
  const screenshots = getTradeScreenshots(trade.id);

  setScreenshotViewerTrade(trade);
  setScreenshotViewerUrls([]);
  setScreenshotViewerError("");

  if (screenshots.length === 0) {
    setScreenshotViewerError(t.journal.noScreenshotsForTrade);
    return;
  }

  setScreenshotViewerLoading(true);

  try {
    const { data, error } = await supabase.storage
      .from("trade-screenshots")
      .createSignedUrls(
        screenshots.map((screenshot) => screenshot.file_path),
        60 * 60
      );

    if (error) {
      throw new Error(error.message);
    }

    const urls = screenshots
      .map((screenshot, index) => ({
        id: screenshot.id,
        name: screenshot.file_name || `Screenshot ${index + 1}`,
        url: data?.[index]?.signedUrl || "",
      }))
      .filter((item) => item.url);

    if (urls.length === 0) {
      setScreenshotViewerError(t.journal.noScreenshotsForTrade);
      return;
    }

    setScreenshotViewerUrls(urls);
  } catch (error) {
    setScreenshotViewerError(
      error instanceof Error
        ? error.message
        : t.journal.noScreenshotsForTrade
    );
  } finally {
    setScreenshotViewerLoading(false);
  }
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

function getMarketLabel(value: string | null | undefined) {
  if (!value) return "—";

  const key = value.toLowerCase() as keyof typeof t.journal.marketLabels;

  return t.journal.marketLabels[key] ?? value;
}

function getDirectionLabel(value: string | null | undefined) {
  if (!value) return "—";

  const key = value.toLowerCase() as keyof typeof t.journal.directionLabels;

  return t.journal.directionLabels[key] ?? value;
}

function getResultLabel(value: string | null | undefined) {
  if (!value) return t.journal.resultLabels.notSet;

  const key = value.toLowerCase() as keyof typeof t.journal.resultLabels;

  return t.journal.resultLabels[key] ?? value;
}

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
    getMarketLabel(trade.market),
getDirectionLabel(trade.direction),
    trade.entry_price ?? "",
    trade.exit_price ?? "",
    trade.stop_loss ?? "",
    trade.position_size ?? "",
    trade.risk_amount ?? "",
    trade.pnl ?? "",
   getResultLabel(trade.result),
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
    Market: getMarketLabel(trade.market),
    Direction: getDirectionLabel(trade.direction),
    Entry: trade.entry_price ?? "",
    Exit: trade.exit_price ?? "",
    Stop: trade.stop_loss ?? "",
    Size: trade.position_size ?? "",
    Risk: trade.risk_amount ?? "",
    PnL: trade.pnl ?? "",
    Result: getResultLabel(trade.result),
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

{screenshotViewerTrade && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
    <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0f1a] shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            {t.journal.screenshotViewerTitle}
          </div>

          <div className="mt-2 text-2xl font-semibold text-white">
            {screenshotViewerTrade.ticker}
          </div>

          <div className="mt-1 text-sm text-white/45">
            {screenshotViewerTrade.trade_date || "—"}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCloseScreenshotViewer}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="max-h-[72vh] overflow-y-auto p-5">
        {screenshotViewerLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
            {t.journal.loadingScreenshots}
          </div>
        ) : screenshotViewerError ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-400/10 p-6 text-sm text-red-100">
            {screenshotViewerError}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {screenshotViewerUrls.map((screenshot) => (
              <a
                key={screenshot.id}
                href={screenshot.url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-3xl border border-white/10 bg-black/30"
              >
                <img
                  src={screenshot.url}
                  alt={screenshot.name}
                  className="max-h-[520px] w-full object-contain transition group-hover:scale-[1.01]"
                />

                <div className="border-t border-white/10 px-4 py-3 text-xs text-white/45">
                  {screenshot.name}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}

<div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
        {t.journal.tradeUsageTitle}
      </div>

      <div className="mt-2 text-3xl font-semibold text-white">
        {trades.length} / {tradeLimit}
      </div>
    </div>

    <div className="text-sm text-white/45">
      {Math.max(tradeLimit - trades.length, 0)} {t.journal.tradesLeftLabel}
    </div>
  </div>
</div>

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
        <div
  className={`rounded-[2rem] border p-6 transition ${
    editingTradeId
      ? "border-cyan-300/40 bg-cyan-300/[0.04] shadow-[0_0_40px_rgba(103,232,249,0.08)] [&_.field-input]:border-cyan-300/45 [&_.field-input]:bg-cyan-300/[0.05]"
      : "border-white/10 bg-white/[0.03]"
  }`}
>
          <h2 className="text-2xl font-semibold text-white">
  {editingTradeId ? t.journal.editTitle : t.journal.addTitle}
</h2>

{editingTradeId && (
  <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
    <div className="text-sm font-semibold text-cyan-100">
      {t.journal.editModeTitle}
    </div>
    <div className="mt-1 text-xs leading-5 text-cyan-100/70">
      {t.journal.editModeText}
    </div>
  </div>
)}
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
                <option value="stocks">{t.journal.marketLabels.stocks}</option>
<option value="crypto">{t.journal.marketLabels.crypto}</option>
<option value="futures">{t.journal.marketLabels.futures}</option>
<option value="forex">{t.journal.marketLabels.forex}</option>
<option value="options">{t.journal.marketLabels.options}</option>
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
                <option value="long">{t.journal.directionLabels.long}</option>
<option value="short">{t.journal.directionLabels.short}</option>
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
                <option value="">{t.journal.resultLabels.notSet}</option>
<option value="win">{t.journal.resultLabels.win}</option>
<option value="loss">{t.journal.resultLabels.loss}</option>
<option value="breakeven">{t.journal.resultLabels.breakeven}</option>
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
            
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
  <input
    id="trade-form-screenshot-file"
    type="file"
    multiple
    accept="image/png,image/jpeg,image/webp"
    disabled={locked || tradeSaving || screenshotUploading}
    onChange={(event) => {
      const files = Array.from(event.target.files ?? []);
      const maxFilesToSelect = Math.min(screenshotLimit, 5);

      onScreenshotFilesChange(files.slice(0, maxFilesToSelect));
    }}
    className="hidden"
  />

  <label
    htmlFor="trade-form-screenshot-file"
    className={`inline-flex cursor-pointer items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition ${
      locked || tradeSaving || screenshotUploading
        ? "cursor-not-allowed bg-white/10 text-white/35"
        : "bg-white text-black hover:scale-[1.02]"
    }`}
  >
    {t.journal.screenshotChoose}
  </label>

  <p className="mt-3 text-xs leading-5 text-white/40">
    * {t.journal.screenshotUploadHintCompact}
  </p>

  {screenshotFiles.length > 0 && (
    <div className="mt-3 text-xs text-white/50">
      {screenshotFiles.length} {t.journal.screenshotsCount}
    </div>
  )}

  {screenshotError && (
    <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
      {screenshotError}
    </div>
  )}
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
            {tradeSaving
  ? editingTradeId
    ? t.journal.updatingTradeButton
    : t.journal.saving
  : editingTradeId
    ? t.journal.updateTradeButton
    : t.journal.save}
          </button>
          {editingTradeId && (
  <button
    type="button"
    onClick={onTradeEditCancel}
    className="mt-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
  >
    {t.journal.cancelEditButton}
  </button>
)}
        </div>
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
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_170px] md:items-start">
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-3">
      <h4 className="text-xl font-semibold">
        {trade.ticker}
      </h4>

      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
        {getDirectionLabel(trade.direction)}
      </span>

      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/55">
        {getMarketLabel(trade.market)}
      </span>
    </div>

    <p className="mt-2 text-sm text-white/40">
      {trade.trade_date}
    </p>
  </div>

  <div className="flex w-full flex-col items-stretch gap-2 md:items-end">
    <div className="mb-2 text-right md:w-[150px]">
      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
        PnL
      </div>

      <div className="mt-1 text-2xl font-semibold text-white">
        {trade.pnl === null ? "—" : `$${trade.pnl}`}
      </div>
    </div>

    <button
      type="button"
      onClick={() => onTradeChartAnalysis(trade.id)}
      disabled={
        locked ||
        chartAnalysisLoading ||
        tradeScreenshots.filter((item) => item.trade_id === trade.id)
          .length === 0
      }
      className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 md:w-[150px]"
    >
      {chartAnalysisLoading && chartAnalysisTradeId === trade.id
        ? t.journal.chartAnalyzingButton
        : t.journal.chartAnalyzeButton}
    </button>

    <button
  type="button"
  onClick={() => onOpenTradeChart(trade)}
  className="w-full rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 md:w-[150px]"
>
  {t.journal.openChartButton}
</button>
    
    <button
      type="button"
      onClick={() => onTradeEditStart(trade)}
      className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:w-[150px]"
    >
      {t.journal.editTradeButton}
    </button>

    <button
      type="button"
      onClick={() => onTradeDelete(trade.id)}
      className="w-full rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/15 md:w-[150px]"
    >
      {t.journal.deleteTradeButton}
    </button>

    <div className="text-center text-xs text-white/35 md:w-[150px]">
      {
        tradeScreenshots.filter(
          (screenshot) => screenshot.trade_id === trade.id
        ).length
      }{" "}
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
    {t.journal.cardLabels.result}: {getResultLabel(trade.result)}
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
      <option value="stocks">{t.journal.marketLabels.stocks}</option>
<option value="crypto">{t.journal.marketLabels.crypto}</option>
<option value="futures">{t.journal.marketLabels.futures}</option>
<option value="forex">{t.journal.marketLabels.forex}</option>
<option value="options">{t.journal.marketLabels.options}</option>
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
      <option value="long">{t.journal.directionLabels.long}</option>
      <option value="short">{t.journal.directionLabels.short}</option>
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
<option value="win">{t.journal.resultLabels.win}</option>
<option value="loss">{t.journal.resultLabels.loss}</option>
<option value="breakeven">{t.journal.resultLabels.breakeven}</option>
    </select>
  </Field>
</div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
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
<th className="py-3 pr-4">{t.journal.screenshotsColumn}</th>
<th className="py-3 pr-4 text-right">{t.journal.actions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10 text-white/65">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-white/45">
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
                    <td className="py-4 pr-4">{getMarketLabel(trade.market)}</td>
                    <td className="py-4 pr-4">{getDirectionLabel(trade.direction)}</td>
                    <td className="py-4 pr-4">{trade.entry_price ?? "—"}</td>
                    <td className="py-4 pr-4">{trade.exit_price ?? "—"}</td>
                    <td className="py-4 pr-4">{trade.stop_loss ?? "—"}</td>
                    <td className="py-4 pr-4">
                      {trade.risk_amount === null ? "—" : `$${trade.risk_amount}`}
                    </td>
                    <td className="py-4 pr-4 font-semibold">
                      {trade.pnl === null ? "—" : `$${trade.pnl}`}
                    </td>
                    <td className="py-4 pr-4">{getResultLabel(trade.result)}</td>
                    <td className="py-4 pr-4">{trade.setup ?? "—"}</td>
                    <td className="py-5 pr-4">
  {(() => {
    const screenshotsCount = tradeScreenshots.filter(
      (screenshot) => screenshot.trade_id === trade.id
    ).length;

    if (screenshotsCount === 0) {
      return <span className="text-white/35">—</span>;
    }

    return (
      <button
        type="button"
        onClick={() => handleOpenTradeScreenshots(trade)}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {t.journal.openScreenshots} {screenshotsCount}
      </button>
    );
  })()}
</td>
                  <td className="py-4 pr-4 text-right">
                    <button
  type="button"
  onClick={() => onOpenTradeChart(trade)}
  className="mr-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15"
>
  {t.journal.openChartButton}
</button>
  
<button
  type="button"
  onClick={() => onTradeEditStart(trade)}
  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
>
  {t.journal.editTradeButton}
</button>

  <button
    type="button"
    onClick={() => onTradeDelete(trade.id)}
    className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-[11px] font-medium text-red-200 transition hover:bg-red-400/15"
  >
    {t.journal.deleteTradeButton}
  </button>
</td>
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

type SocialMarketItem = {
  symbol: string;
  name: string;
  type: "stock" | "crypto";
  mentions: number;
  change: number;
  volume: string;
  sentiment: "bullish" | "neutral" | "bearish";
  score: number;
};

const redditMarketItems: SocialMarketItem[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    type: "stock",
    mentions: 18420,
    change: 3.8,
    volume: "$41.2B",
    sentiment: "bullish",
    score: 94,
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    type: "stock",
    mentions: 16280,
    change: -1.4,
    volume: "$28.6B",
    sentiment: "neutral",
    score: 87,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "crypto",
    mentions: 13940,
    change: 2.2,
    volume: "$62.9B",
    sentiment: "bullish",
    score: 85,
  },
];

const xMarketItems: SocialMarketItem[] = [
  {
    symbol: "MSTR",
    name: "MicroStrategy",
    type: "stock",
    mentions: 12880,
    change: 4.6,
    volume: "$7.9B",
    sentiment: "bullish",
    score: 91,
  },
  {
    symbol: "SOL",
    name: "Solana",
    type: "crypto",
    mentions: 11240,
    change: 5.1,
    volume: "$8.4B",
    sentiment: "bullish",
    score: 89,
  },
  {
    symbol: "AMD",
    name: "AMD",
    type: "stock",
    mentions: 9760,
    change: -0.8,
    volume: "$9.1B",
    sentiment: "neutral",
    score: 78,
  },
];

const truthMarketItems: SocialMarketItem[] = [
  {
    symbol: "DJT",
    name: "Trump Media",
    type: "stock",
    mentions: 8840,
    change: 6.7,
    volume: "$1.2B",
    sentiment: "bullish",
    score: 86,
  },
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    type: "stock",
    mentions: 7420,
    change: 0.4,
    volume: "$38.5B",
    sentiment: "neutral",
    score: 74,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "crypto",
    mentions: 6980,
    change: 1.9,
    volume: "$21.8B",
    sentiment: "bullish",
    score: 72,
  },
];

function getSentimentLabel(
  sentiment: SocialMarketItem["sentiment"],
  language: Language
) {
  if (language === "en") {
    if (sentiment === "bullish") return "Bullish";
    if (sentiment === "bearish") return "Bearish";
    return "Neutral";
  }

  if (language === "ua") {
    if (sentiment === "bullish") return "Бичачий";
    if (sentiment === "bearish") return "Ведмежий";
    return "Нейтральний";
  }

  if (sentiment === "bullish") return "Бычий";
  if (sentiment === "bearish") return "Медвежий";
  return "Нейтральный";
}

function MarketSourceCard({
  title,
  subtitle,
  items,
  t,
}: {
  title: string;
  subtitle: string;
  items: SocialMarketItem[];
  t: (typeof dashboardDict)[Language];
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/45">
            {title}
          </div>
          <div className="mt-2 text-sm leading-6 text-white/45">{subtitle}</div>
        </div>

        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
          Live
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${title}-${item.symbol}`}
            className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-white/60">
                    {index + 1}
                  </span>
                  <div className="text-lg font-semibold text-white">
                    {item.symbol}
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase text-white/40">
                    {item.type}
                  </span>
                </div>

                <div className="mt-1 text-sm text-white/45">{item.name}</div>
              </div>

              <div
                className={`rounded-full px-3 py-1 text-xs ${
                  item.change >= 0
                    ? "bg-emerald-300/10 text-emerald-100"
                    : "bg-red-300/10 text-red-100"
                }`}
              >
                {item.change >= 0 ? "+" : ""}
                {item.change}%
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-white/[0.04] p-3">
                <div className="text-white/35">Mentions</div>
                <div className="mt-1 font-semibold text-white">
                  {item.mentions.toLocaleString()}
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.04] p-3">
                <div className="text-white/35">Volume</div>
                <div className="mt-1 font-semibold text-white">{item.volume}</div>
              </div>

              <div className="rounded-xl bg-white/[0.04] p-3">
                <div className="text-white/35">Score</div>
                <div className="mt-1 font-semibold text-white">{item.score}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-white/40">
              <span>{getSentimentLabel(item.sentiment, "ru")}</span>
              <span>Momentum intelligence</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketTab({
  subscription,
  t,
}: {
  subscription: Subscription;
  t: (typeof dashboardDict)[Language];
}) {
  const hasAccess =
    subscription.active &&
    subscription.plan !== "core";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Social Market Intelligence"
        text="Reddit, X/Twitter and Truth Social market pulse, trending tickers, mention velocity, volume, sentiment and momentum score."
      />

      {!hasAccess && (
        <div className="rounded-[2rem] border border-amber-300/20 bg-amber-400/10 p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-amber-100/55">
            Locked
          </div>
          <div className="mt-3 text-xl font-semibold text-white">
            Social Market is available on SkillEdge Edge and Elite.
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            This module tracks market attention across social sources and prepares
            data for the future AI scanner.
          </p>
        </div>
      )}

      <div className={hasAccess ? "" : "pointer-events-none select-none opacity-45 blur-[1px]"}>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Sources", "3"],
            ["Tracked symbols", "250+"],
            ["Refresh window", "5–15m"],
            ["AI scanner ready", "Elite"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {label}
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          <MarketSourceCard
            title="Reddit"
            subtitle="Retail attention, discussion velocity and community-driven tickers."
            items={redditMarketItems}
            t={t}
          />

          <MarketSourceCard
            title="X / Twitter"
            subtitle="Fast momentum flow, trader mentions and narrative acceleration."
            items={xMarketItems}
            t={t}
          />

          <MarketSourceCard
            title="Truth Social"
            subtitle="Political and event-driven ticker attention for selected equities."
            items={truthMarketItems}
            t={t}
          />
        </div>
      </div>
    </div>
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

function ChartsTab({
  t,
  requestedSymbol,
}: {
  t: (typeof dashboardDict)[Language];
  requestedSymbol?: string;
}) {
  const [symbol, setSymbol] = useState("NASDAQ:AAPL");
  const [interval, setIntervalValue] = useState("5");
  const [chartSymbolInput, setChartSymbolInput] = useState("AAPL");
  const [chartIntervalInput, setChartIntervalInput] = useState("5");
  useEffect(() => {
  if (!requestedSymbol) {
    return;
  }

  setSymbol(requestedSymbol);
  setChartSymbolInput(formatChartSymbol(requestedSymbol));
}, [requestedSymbol]);
  const [watchlist, setWatchlist] = useState<ChartWatchlistRow[]>([]);
  const [moversOpen, setMoversOpen] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsReady, setChartsReady] = useState(false);
  const [chartsError, setChartsError] = useState("");
  const [chartAnalysisOpen, setChartAnalysisOpen] = useState(false);
  const [chartAnalysisLoading, setChartAnalysisLoading] = useState(false);
  const [chartAnalysisError, setChartAnalysisError] = useState("");
  const [chartAnalysisResult, setChartAnalysisResult] = useState("");
  const chartAnalysisSections = chartAnalysisResult
  ? splitAiAnalysisSections(chartAnalysisResult)
  : [];
  const chartAnalysisErrorView = chartAnalysisError
  ? getChartAnalysisErrorView(chartAnalysisError, t)
  : null;
  const [watchlistAdding, setWatchlistAdding] = useState(false);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const [watchlistSort, setWatchlistSort] = useState<
    "symbol" | "change" | "volume"
  >("change");
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const watchlistInputRef = useRef<HTMLInputElement | null>(null);
  const chartIntervalOptions = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1D" },
];
useEffect(() => {
  if (!watchlistAdding) {
    return;
  }

  const focusTimer = setTimeout(() => {
    watchlistInputRef.current?.focus();
  }, 50);

  return () => {
    clearTimeout(focusTimer);
  };
}, [watchlistAdding]);

  useEffect(() => {
    let cancelled = false;

    const loadChartsData = async () => {
      try {
        setChartsLoading(true);
        setChartsError("");

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setChartsError(t.charts.loginFirst);
          return;
        }

        const { data: settingsData, error: settingsError } = await supabase
          .from("chart_settings")
          .select("selected_symbol, selected_interval, selected_market")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (settingsError) {
          throw new Error(settingsError.message);
        }

        const { data: watchlistData, error: watchlistError } = await supabase
          .from("chart_watchlist")
          .select(
            "id, user_id, symbol, market, name, volume_24h, change_24h, created_at, updated_at"
          )
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (watchlistError) {
          throw new Error(watchlistError.message);
        }

        if (cancelled) {
          return;
        }

        if (settingsData?.selected_symbol) {
          setSymbol(settingsData.selected_symbol);
        }

        if (settingsData?.selected_interval) {
          setIntervalValue(settingsData.selected_interval);
        }

        setWatchlist((watchlistData ?? []) as ChartWatchlistRow[]);
      } catch (error) {
        if (!cancelled) {
          setChartsError(
            error instanceof Error
              ? error.message
              : t.charts.settingsLoadError
          );
        }
      } finally {
        if (!cancelled) {
          setChartsLoading(false);
          setChartsReady(true);
        }
      }
    };

    loadChartsData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chartsReady) {
      return;
    }

    const saveTimer = setTimeout(async () => {
      try {
        const normalizedSymbol = symbol.trim().toUpperCase();

        if (!normalizedSymbol) {
          return;
        }

        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          return;
        }

        const selectedMarket = detectChartMarket(normalizedSymbol);

        const { error } = await supabase.from("chart_settings").upsert(
          {
            user_id: userData.user.id,
            selected_symbol: normalizedSymbol,
            selected_interval: interval,
            selected_market: selectedMarket,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

        if (error) {
          console.error("Failed to save chart settings:", error);
        }
      } catch (error) {
        console.error("Failed to save chart settings:", error);
      }
    }, 500);

    return () => {
      clearTimeout(saveTimer);
    };
  }, [symbol, interval, chartsReady]);

const handleOpenChartFromControl = () => {
  const cleanedInput = chartSymbolInput.trim().toUpperCase().replace(/\s+/g, "");
  const normalizedSymbol = normalizeChartSymbol(cleanedInput);

  if (!normalizedSymbol) {
    return;
  }

  setSymbol(normalizedSymbol);
  setIntervalValue(chartIntervalInput);
  setChartSymbolInput(cleanedInput);
};

const handleAnalyzeCurrentChart = async () => {
  const cleanedInput = chartSymbolInput.trim().toUpperCase().replace(/\s+/g, "");
  const normalizedSymbol = normalizeChartSymbol(cleanedInput);
  const activeInterval = chartIntervalInput;

  if (!normalizedSymbol) {
    return;
  }

  setSymbol(normalizedSymbol);
  setIntervalValue(activeInterval);
  setChartSymbolInput(cleanedInput);

  setChartAnalysisOpen(true);
  setChartAnalysisLoading(true);
  setChartAnalysisError("");
  setChartAnalysisResult("");

  try {
    const response = await fetch("/api/analyze-current-chart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: normalizedSymbol,
        interval: activeInterval,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : t.charts.chartAnalysisError
      );
    }

    setChartAnalysisResult(
      typeof data?.analysis === "string"
        ? data.analysis
        : t.charts.chartAnalysisEmpty
    );
  } catch (error) {
    setChartAnalysisError(
      error instanceof Error ? error.message : t.charts.chartAnalysisError
    );
  } finally {
    setChartAnalysisLoading(false);
  }
};

  const handleWatchlistAdd = async () => {
    try {
      setChartsError("");

      const normalized = normalizeChartSymbol(watchlistInput);

      if (!normalized) {
        return;
      }

      if (watchlist.some((item) => item.symbol === normalized)) {
        setWatchlistInput("");
        setWatchlistAdding(false);
        setSymbol(normalized);
        return;
      }

      setWatchlistSaving(true);

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        setChartsError(t.charts.loginFirst);
        return;
      }

      const market = detectChartMarket(normalized);
      const meta = await fetchWatchlistTickerMeta(normalized, market);

      const { data, error } = await supabase
        .from("chart_watchlist")
        .insert({
          user_id: userData.user.id,
          symbol: normalized,
          market,
          name: meta.name,
          volume_24h: meta.volume24h,
          change_24h: meta.change24h,
        })
        .select(
          "id, user_id, symbol, market, name, volume_24h, change_24h, created_at, updated_at"
        )
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setWatchlist((current) => [data as ChartWatchlistRow, ...current]);
      setSymbol(normalized);
      setWatchlistInput("");
      setWatchlistAdding(false);
    } catch (error) {
      setChartsError(
        error instanceof Error
          ? error.message
          : t.charts.addTickerError
      );
    } finally {
      setWatchlistSaving(false);
    }
  };

  const removeFromWatchlist = async (row: ChartWatchlistRow) => {
    const previousWatchlist = watchlist;

    try {
      setChartsError("");

      setWatchlist((current) =>
        current.filter((item) => item.id !== row.id)
      );

      const { error } = await supabase
        .from("chart_watchlist")
        .delete()
        .eq("id", row.id);

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      setWatchlist(previousWatchlist);

      setChartsError(
        error instanceof Error
          ? error.message
          : t.charts.removeTickerError
      );
    }
  };

  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (watchlistSort === "symbol") {
      return formatChartSymbol(a.symbol).localeCompare(formatChartSymbol(b.symbol));
    }

    if (watchlistSort === "volume") {
      return Number(b.volume_24h ?? 0) - Number(a.volume_24h ?? 0);
    }

    return Number(b.change_24h ?? 0) - Number(a.change_24h ?? 0);
  });

  return (
    <div>
      {chartAnalysisOpen && (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm md:items-center md:p-4">
    <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0b0f1a] shadow-2xl md:rounded-[2rem]">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 md:p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            SkillEdge AI
          </div>

          <h3 className="mt-3 text-xl font-semibold text-white md:text-2xl">
            {t.charts.chartAnalysisTitle}
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {t.charts.chartAnalysisText}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setChartAnalysisOpen(false)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 md:gap-4 md:p-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">
            {t.charts.chartAnalysisSymbol}
          </div>

          <div className="mt-2 text-lg font-semibold text-white">
            {formatChartSymbol(symbol)}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">
            {t.charts.chartAnalysisInterval}
          </div>

          <div className="mt-2 text-lg font-semibold text-white">
            {interval}
          </div>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-y-auto p-4 md:max-h-[55vh] md:p-6">
        {chartAnalysisLoading && (
  <div className="space-y-4">
    <div className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
      <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/60">
        SkillEdge AI
      </div>

      <div className="mt-3 text-xl font-semibold text-white">
        {t.charts.chartAnalysisLoading}
      </div>

      <p className="mt-2 text-sm leading-6 text-cyan-50/60">
        {formatChartSymbol(symbol)} · {interval}
      </p>
    </div>

    <div className="grid gap-3 md:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-24 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>

    <div className="space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-[1.25rem] border border-white/10 bg-white/[0.03]"
        />
      ))}
    </div>
  </div>
)}

        {!chartAnalysisLoading && chartAnalysisErrorView && (
  <div className="rounded-[1.75rem] border border-red-400/20 bg-red-400/10 p-5">
    <div className="text-xs uppercase tracking-[0.25em] text-red-100/60">
      SkillEdge AI
    </div>

    <h4 className="mt-3 text-xl font-semibold text-red-50">
      {chartAnalysisErrorView.title}
    </h4>

    <p className="mt-3 text-sm leading-7 text-red-50/70">
      {chartAnalysisErrorView.text}
    </p>

    <div className="mt-5 rounded-2xl border border-red-300/10 bg-black/20 p-4 text-xs leading-6 text-red-50/45">
      {formatChartSymbol(symbol)} · {interval}
    </div>
  </div>
)}

      {!chartAnalysisLoading && !chartAnalysisError && chartAnalysisResult && (
  <div className="space-y-4">
    <div className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
      <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/60">
        {t.charts.chartAnalysisReportLabel}
      </div>

      <div className="mt-2 text-xl font-semibold text-white">
        {formatChartSymbol(symbol)} · {interval}
      </div>

      <div className="mt-2 text-sm leading-6 text-cyan-50/60">
        {t.charts.chartAnalysisDataLabel}
      </div>
    </div>

    <div className="text-xs uppercase tracking-[0.25em] text-white/35">
      {t.charts.chartAnalysisSectionsLabel}
    </div>

    <div className="space-y-3">
      {chartAnalysisSections.map((section, index) => (
        <div
          key={`${section.title}-${index}`}
          className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold text-white/60">
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold text-white">
                {section.title}
              </h4>

              {section.body && (
                <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/65">
                  {section.body}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

        {!chartAnalysisLoading && !chartAnalysisError && !chartAnalysisResult && (
  <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50">
      AI
    </div>

    <h4 className="mt-4 text-lg font-semibold text-white">
      {t.charts.chartAnalysisTitle}
    </h4>

    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/45">
      {t.charts.chartAnalysisEmpty}
    </p>
  </div>
)}
      </div>

     <div className="flex justify-end border-t border-white/10 p-4 md:p-6">
        <button
          type="button"
          onClick={() => setChartAnalysisOpen(false)}
          className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
        >
          {t.charts.chartAnalysisClose}
        </button>
      </div>
    </div>
  </div>
)}
      

      <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
        {chartsError && (
          <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
            {chartsError}
          </div>
        )}

        <div className="mb-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3">
  <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 lg:flex lg:flex-nowrap lg:items-end lg:overflow-visible">
    <div className="min-w-0 lg:w-[135px] lg:shrink-0">
      <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">
        {t.charts.chartControlTickerLabel}
      </label>

      <input
        value={chartSymbolInput}
        onChange={(event) => setChartSymbolInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleOpenChartFromControl();
          }
        }}
        className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/20 focus:border-cyan-300/40 focus:bg-black/40"
      />
    </div>

    <div className="min-w-0 lg:w-[90px] lg:shrink-0">
      <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-white/35">
        {t.charts.chartControlIntervalLabel}
      </label>

      <select
        value={chartIntervalInput}
        onChange={(event) => {
  setChartIntervalInput(event.target.value);
  setIntervalValue(event.target.value);
}}
        className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-medium text-white outline-none transition focus:border-cyan-300/40 focus:bg-black/40"
      >
        {chartIntervalOptions.map((item) => (
          <option key={item.value} value={item.value} className="bg-[#0b0f1a] text-white">
            {item.label}
          </option>
        ))}
      </select>
    </div>

    <div className="col-span-2 flex items-end gap-2 lg:col-span-1 lg:ml-auto lg:shrink-0">

      <button
        type="button"
        onClick={handleAnalyzeCurrentChart}
        disabled={chartAnalysisLoading}
        className="h-12 rounded-full bg-white px-5 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {chartAnalysisLoading
          ? t.charts.chartAnalysisLoading
          : t.charts.analyzeCurrentChart}
      </button>

      <button
  type="button"
  onClick={() => setWatchlistOpen((current) => !current)}
  title={watchlistOpen ? t.charts.hideWatchlist : t.charts.openWatchlist}
  className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold transition ${
    watchlistOpen
      ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
      : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
  }`}
>
  WL
</button>
    </div>
  </div>
</div>

    <div
  className={`grid gap-5 ${
    watchlistOpen
      ? "xl:grid-cols-[minmax(0,1fr)_340px]"
      : "xl:grid-cols-1"
  }`}
>
  <div className="h-[760px] overflow-hidden rounded-3xl border border-white/10 bg-[#050813]">
    <TradingViewChart symbol={symbol} interval={interval} />
  </div>

  {watchlistOpen && (
    <div className="flex h-[760px] flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
  {t.charts.watchlistTitle}
</div>

          <div className="mt-1 text-xs text-white/40">
  {t.charts.watchlistSubtitle}
</div>
        </div>

        <button
          type="button"
          onClick={() => setWatchlistAdding((current) => !current)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-white transition hover:bg-white/10"
        >
          +
        </button>
      </div>

      {watchlistAdding && (
  <div className="mt-4 space-y-2">
    <div className="rounded-2xl border border-cyan-300/40 bg-cyan-300/[0.08] p-2 shadow-[0_0_0_1px_rgba(103,232,249,0.08)]">
      <div className="flex gap-2">
        <input
          ref={watchlistInputRef}
          value={watchlistInput}
          onChange={(event) =>
            setWatchlistInput(event.target.value.toUpperCase())
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleWatchlistAdd();
            }
          }}
          placeholder={t.charts.addTickerPlaceholder}
          className="field-input min-w-0 flex-1 border-cyan-300/30 bg-cyan-300/[0.08] text-white placeholder:text-cyan-100/45"
        />

        <button
          type="button"
          onClick={handleWatchlistAdd}
          disabled={watchlistSaving || !watchlistInput.trim()}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.charts.addTickerButton}
        </button>
      </div>
    </div>

    <div className="text-xs leading-5 text-white/35">
  {t.charts.addTickerHint}
</div>
  </div>
)}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setWatchlistSort("symbol")}
          className={`rounded-full px-3 py-1 transition ${
            watchlistSort === "symbol"
              ? "bg-white text-black"
              : "border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
          }`}
        >
          Symbol
        </button>

        <button
          type="button"
          onClick={() => setWatchlistSort("change")}
          className={`rounded-full px-3 py-1 transition ${
            watchlistSort === "change"
              ? "bg-white text-black"
              : "border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
          }`}
        >
          % 24h
        </button>

        <button
          type="button"
          onClick={() => setWatchlistSort("volume")}
          className={`rounded-full px-3 py-1 transition ${
            watchlistSort === "volume"
              ? "bg-white text-black"
              : "border border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
          }`}
        >
          Vol
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_64px_74px_32px] gap-2 border-b border-white/10 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
  <div>{t.charts.symbolColumn}</div>
  <div>{t.charts.percentColumn}</div>
  <div>{t.charts.volumeColumn}</div>
  <div></div>
</div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {chartsLoading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/45">
            {t.charts.loadingWatchlist}
          </div>
        ) : sortedWatchlist.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm leading-6 text-white/40">
            {t.charts.emptyWatchlist}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedWatchlist.map((item) => (
              <div
  key={item.id}
  className="grid grid-cols-[minmax(0,1fr)_64px_74px_32px] items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
>
  <button
    type="button"
    onClick={() => {
  setSymbol(item.symbol);
  setChartSymbolInput(formatChartSymbol(item.symbol));
}}
    className="min-w-0 text-left transition hover:text-cyan-100"
  >
    <div className="whitespace-nowrap text-sm font-medium text-white">
      {formatChartSymbol(item.symbol)}
    </div>

    <div className="truncate text-[11px] text-white/35">
      {item.name || item.market}
    </div>
  </button>

  <div
    className={
      Number(item.change_24h ?? 0) >= 0
        ? "text-emerald-300"
        : "text-red-300"
    }
  >
    {formatPercent(item.change_24h)}
  </div>

  <div className="text-white/60">
    {formatCompactNumber(item.volume_24h)}
  </div>

  <button
    type="button"
    onClick={() => removeFromWatchlist(item)}
    title={t.charts.removeFromWatchlist}
    className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10 text-sm leading-none text-red-200 transition hover:bg-red-400/20"
  >
    ×
  </button>
</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )}
</div>    

        <MoversPanel
  open={moversOpen}
  onToggle={() => setMoversOpen((current) => !current)}
  t={t}
/>
      </div>
    </div>
  );
}

function TradingViewChart({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      details: true,
      hotlist: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });

    containerRef.current.appendChild(widgetContainer);
    containerRef.current.appendChild(script);
  }, [symbol, interval]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container h-full w-full"
    />
  );
}

type ChartsMoverMarket = "stocks" | "crypto";
type ChartsMoverSide = "gainers" | "losers";

type ChartWatchlistMarket =
  | "stocks"
  | "crypto"
  | "futures"
  | "forex"
  | "custom";

type ChartWatchlistRow = {
  id: string;
  user_id: string;
  symbol: string;
  market: ChartWatchlistMarket;
  name: string | null;
  volume_24h: number | null;
  change_24h: number | null;
  created_at: string;
  updated_at: string;
};

type ChartsMoverItem = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  volume: string;
};

function MoversPanel({
  open,
  onToggle,
  t,
}: {
  open: boolean;
  onToggle: () => void;
  t: (typeof dashboardDict)[Language];
}) {
  const [market, setMarket] = useState<ChartsMoverMarket>("stocks");
  const [side, setSide] = useState<ChartsMoverSide>("gainers");
  const [items, setItems] = useState<ChartsMoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const data =
          market === "crypto"
            ? await fetchCryptoMovers(side)
            : await fetchStockMovers(side);

        if (!cancelled) {
          setItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(
            err instanceof Error ? err.message : "Failed to load movers."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    const timer = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market, side]);

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {[
  { id: "stocks", label: t.charts.moversStocks },
  { id: "crypto", label: t.charts.moversCrypto },
].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMarket(item.id as ChartsMoverMarket)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  market === item.id
                    ? "bg-white text-black"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {[
  { id: "gainers", label: t.charts.moversGainers },
  { id: "losers", label: t.charts.moversLosers },
].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSide(item.id as ChartsMoverSide)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  side === item.id
                    ? "bg-emerald-400/20 text-emerald-300"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:text-white"
        >
          {open ? t.charts.moversCollapse : t.charts.moversExpand}
        </button>
      </div>

      {open && (
        <>
          <div className="mt-5 overflow-hidden rounded-3xl border border-white/10">
            <div className="grid grid-cols-[110px_minmax(180px,1fr)_120px_140px] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/35">
              <div>{t.charts.symbolColumn}</div>
<div>{t.charts.moversName}</div>
<div>{t.charts.moversPercentChange}</div>
<div>{t.charts.volumeColumn}</div>
            </div>

            {loading ? (
              <div className="px-4 py-8 text-sm text-white/50">
                {t.charts.moversLoading}
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-sm text-red-300">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-sm text-white/50">
  {t.charts.moversEmpty} {side === "gainers" ? "+10%" : "-10%"}.
</div>
            ) : (
              <div className="divide-y divide-white/10">
                {items.map((item) => (
                  <div
                    key={`${market}-${side}-${item.symbol}`}
                    className="grid grid-cols-[110px_minmax(180px,1fr)_120px_140px] gap-3 px-4 py-3 text-sm"
                  >
                    <div className="font-medium text-white">
                      {item.symbol}
                    </div>

                    <div className="truncate text-white/70">
                      {item.name}
                    </div>

                    <div
                      className={
                        item.changePct >= 0
                          ? "text-emerald-300"
                          : "text-red-300"
                      }
                    >
                      {item.changePct >= 0 ? "+" : ""}
                      {item.changePct.toFixed(2)}%
                    </div>

                    <div className="text-white/55">
                      {item.volume}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 text-xs text-white/35">
  Crypto: Binance USDT pairs. {t.charts.moversStocksNeedKey}
</div>
        </>
      )}
    </div>
  );
}

async function fetchCryptoMovers(
  side: ChartsMoverSide
): Promise<ChartsMoverItem[]> {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");

  if (!response.ok) {
    throw new Error("Binance crypto movers are unavailable right now.");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Binance returned invalid movers data.");
  }

  const mapped: ChartsMoverItem[] = data
    .filter((item: any) => {
      const symbol = String(item.symbol || "");

      return (
        symbol.endsWith("USDT") &&
        !symbol.includes("UPUSDT") &&
        !symbol.includes("DOWNUSDT") &&
        !symbol.includes("BULLUSDT") &&
        !symbol.includes("BEARUSDT")
      );
    })
    .map((item: any) => {
      const symbol = String(item.symbol || "");
      const baseSymbol = symbol.replace("USDT", "");
      const changePct = Number(item.priceChangePercent ?? 0);
      const quoteVolume = Number(item.quoteVolume ?? 0);

      return {
        symbol: baseSymbol,
        name: `${baseSymbol}/USDT`,
        price: Number(item.lastPrice ?? 0),
        changePct,
        volume: formatCompactNumber(quoteVolume),
        rawVolume: quoteVolume,
      };
    })
    .filter((item: ChartsMoverItem & { rawVolume?: number }) => {
      const volume = item.rawVolume ?? 0;

      if (!Number.isFinite(item.changePct) || !Number.isFinite(volume)) {
        return false;
      }

      if (volume < 500000) {
        return false;
      }

      if (side === "gainers") {
        return item.changePct >= 10;
      }

      return item.changePct <= -10;
    })
    .sort((a, b) =>
      side === "gainers"
        ? b.changePct - a.changePct
        : a.changePct - b.changePct
    )
    .slice(0, 25)
    .map(({ rawVolume, ...item }) => item);

  return mapped;
}

async function fetchStockMovers(
  side: ChartsMoverSide
): Promise<ChartsMoverItem[]> {
  const apiKey = process.env.NEXT_PUBLIC_FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Для stocks movers добавь NEXT_PUBLIC_FMP_API_KEY в .env.local"
    );
  }

  const endpoint =
    side === "gainers"
      ? `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`
      : `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`;

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Stocks movers are unavailable right now.");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Stocks movers returned invalid data.");
  }

  const mapped: ChartsMoverItem[] = data
    .map((item: any) => {
      const changePct = parseChangePct(
        item.changesPercentage ??
          item.changePercentage ??
          item.percentageChange ??
          item.change ??
          0
      );

      const rawVolume = Number(item.volume ?? 0);

      return {
        symbol: item.symbol || "—",
        name: item.name || item.companyName || item.symbol || "—",
        price:
          typeof item.price === "number"
            ? item.price
            : typeof item.lastPrice === "number"
            ? item.lastPrice
            : null,
        changePct,
        volume: formatCompactNumber(rawVolume),
        rawVolume,
      };
    })
    .filter((item: ChartsMoverItem & { rawVolume?: number }) => {
      const volume = item.rawVolume ?? 0;

      if (!Number.isFinite(item.changePct) || !Number.isFinite(volume)) {
        return false;
      }

      if (volume < 50000) {
        return false;
      }

      if (side === "gainers") {
        return item.changePct >= 10;
      }

      return item.changePct <= -10;
    })
    .sort((a, b) =>
      side === "gainers"
        ? b.changePct - a.changePct
        : a.changePct - b.changePct
    )
    .slice(0, 25)
    .map(({ rawVolume, ...item }) => item);

  return mapped;
}

function parseChangePct(value: unknown): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const normalized = value.replace("%", "").replace(/[()]/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatCompactNumber(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return "—";
  }

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatPercent(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return `${numericValue >= 0 ? "+" : ""}${numericValue.toFixed(2)}%`;
}

function formatChartSymbol(value: string): string {
  return value
    .replace("NASDAQ:", "")
    .replace("NYSE:", "")
    .replace("AMEX:", "")
    .replace("BINANCE:", "")
    .replace("CME_MINI:", "")
    .replace("CBOT_MINI:", "")
    .replace("CME:", "")
    .replace("FX:", "");
}

function splitAiAnalysisSections(text: string) {
  const lines = text.split("\n");
  const sections: { title: string; body: string }[] = [];

  let currentTitle = "";
  let currentBody: string[] = [];

  const pushSection = () => {
    if (!currentTitle && currentBody.join("\n").trim().length === 0) {
      return;
    }

    sections.push({
      title: currentTitle || "AI Analysis",
      body: currentBody.join("\n").trim(),
    });
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    const headingMatch = trimmedLine.match(/^(?:#{1,6}\s*)?\d+\.\s*(.+)$/);

    if (headingMatch) {
      pushSection();
      currentTitle = headingMatch[1].trim();
      currentBody = [];
      continue;
    }

    currentBody.push(line);
  }

  pushSection();

  if (sections.length === 0) {
    return [
      {
        title: "AI Analysis",
        body: text,
      },
    ];
  }

  return sections;
}

function getChartAnalysisErrorView(
  error: string,
  t: (typeof dashboardDict)[Language]
) {
  const normalizedError = error.toLowerCase();

  if (
    normalizedError.includes("current data plan") ||
    normalizedError.includes("market data is unavailable") ||
    normalizedError.includes("no candle data")
  ) {
    return {
      title: t.charts.marketDataUnavailableTitle,
      text: t.charts.marketDataUnavailableText,
    };
  }

  if (
    normalizedError.includes("premium") ||
    normalizedError.includes("subscription") ||
    normalizedError.includes("402")
  ) {
    return {
      title: t.charts.marketDataPremiumTitle,
      text: t.charts.marketDataPremiumText,
    };
  }

  return {
    title: t.charts.marketDataGenericErrorTitle,
    text: t.charts.marketDataGenericErrorText,
  };
}

function normalizeChartSymbol(rawSymbol: string) {
  const cleaned = rawSymbol.trim().toUpperCase().replace(/\s+/g, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.includes(":")) {
    return cleaned;
  }

  if (cleaned.endsWith(".NY")) {
    return `NYSE:${cleaned.slice(0, -3)}`;
  }

  if (cleaned.endsWith(".NQ")) {
    return `NASDAQ:${cleaned.slice(0, -3)}`;
  }

  if (cleaned.endsWith(".AM")) {
    return `AMEX:${cleaned.slice(0, -3)}`;
  }

  if (cleaned.endsWith("USDT")) {
    return `BINANCE:${cleaned}`;
  }

  return cleaned;
}

async function fetchWatchlistTickerMeta(
  symbol: string,
  market: ChartWatchlistMarket
): Promise<{
  name: string | null;
  volume24h: number | null;
  change24h: number | null;
}> {
  if (market === "crypto") {
    const binanceSymbol = symbol
      .replace("BINANCE:", "")
      .replace("/", "")
      .toUpperCase();

    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`
    );

    if (!response.ok) {
      return {
        name: formatChartSymbol(symbol),
        volume24h: null,
        change24h: null,
      };
    }

    const data = await response.json();

    return {
      name: `${binanceSymbol.replace("USDT", "")}/USDT`,
      volume24h: Number(data.quoteVolume ?? 0),
      change24h: Number(data.priceChangePercent ?? 0),
    };
  }

  if (market === "stocks") {
    const apiKey = process.env.NEXT_PUBLIC_FMP_API_KEY;

    if (!apiKey) {
      return {
        name: formatChartSymbol(symbol),
        volume24h: null,
        change24h: null,
      };
    }

    const cleanSymbol = formatChartSymbol(symbol);

    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${cleanSymbol}?apikey=${apiKey}`
    );

    if (!response.ok) {
      return {
        name: cleanSymbol,
        volume24h: null,
        change24h: null,
      };
    }

    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : null;

    if (!item) {
      return {
        name: cleanSymbol,
        volume24h: null,
        change24h: null,
      };
    }

    return {
      name: item.name ?? cleanSymbol,
      volume24h: Number(item.volume ?? 0),
      change24h: parseChangePct(
        item.changesPercentage ?? item.changePercentage ?? 0
      ),
    };
  }

  return {
    name: formatChartSymbol(symbol),
    volume24h: null,
    change24h: null,
  };
}

function detectChartMarket(symbol: string): ChartWatchlistMarket {
  const normalized = symbol.trim().toUpperCase();

  if (
    normalized.startsWith("BINANCE:") ||
    normalized.endsWith("USDT") ||
    normalized.endsWith("USDC")
  ) {
    return "crypto";
  }

  if (
    normalized.startsWith("CME:") ||
    normalized.startsWith("CME_MINI:") ||
    normalized.startsWith("CBOT_MINI:") ||
    normalized.includes(":NQ") ||
    normalized.includes(":ES") ||
    normalized.includes(":YM")
  ) {
    return "futures";
  }

  if (normalized.startsWith("FX:")) {
    return "forex";
  }

  if (
    normalized.startsWith("NASDAQ:") ||
    normalized.startsWith("NYSE:") ||
    normalized.startsWith("AMEX:")
  ) {
    return "stocks";
  }

  return "custom";
}

type LearningModuleStatus = "not_started" | "in_progress" | "completed";

type LearningModule = {
  id: string;
  title: string;
  text: string;
  level: string;
  estimatedTime: string;
  progress: number;
  status: LearningModuleStatus;
  lessons: string[];
};

type LearningLessonBlock = {
  title: string;
  text: string;
};

type LearningLessonContent = {
  intro: string;
  blocks: LearningLessonBlock[];
  checklist: string[];
  practice?: string;
};

type AdditionalLearningTrack = {
  id: string;
  title: string;
  text: string;
  level: string;
  estimatedTime: string;
  progress: number;
  lessons: string[];
};

function getLearningStatusLabel(
  status: LearningModuleStatus,
  t: (typeof dashboardDict)[Language]
) {
  if (status === "completed") {
    return t.learning.completedStatus;
  }

  if (status === "in_progress") {
    return t.learning.inProgressStatus;
  }

  return t.learning.notStartedStatus;
}

function getLearningActionLabel(
  status: LearningModuleStatus,
  t: (typeof dashboardDict)[Language]
) {
  if (status === "completed") {
    return t.learning.reviewButton;
  }

  if (status === "in_progress") {
    return t.learning.continueButton;
  }

  return t.learning.startButton;
}

function getLearningModules(t: (typeof dashboardDict)[Language]): LearningModule[] {
  return [
    {
      id: "market-basics",
      title: t.learning.moduleOneTitle,
      text: t.learning.moduleOneText,
      level: t.learning.beginnerLevel,
      estimatedTime: "45 min",
      progress: 75,
      status: "in_progress",
      lessons: [
        t.learning.lessonMarketStructure,
        t.learning.lessonOrderTypes,
        t.learning.lessonBidAskSpread,
        t.learning.lessonLiquidity,
      ],
    },
    {
      id: "technical-analysis",
      title: t.learning.moduleTwoTitle,
      text: t.learning.moduleTwoText,
      level: t.learning.beginnerLevel,
      estimatedTime: "60 min",
      progress: 35,
      status: "in_progress",
      lessons: [
        t.learning.lessonCandles,
        t.learning.lessonLevels,
        t.learning.lessonTrendRange,
        t.learning.lessonVolume,
      ],
    },
    {
      id: "risk-management",
      title: t.learning.moduleThreeTitle,
      text: t.learning.moduleThreeText,
      level: t.learning.beginnerLevel,
      estimatedTime: "50 min",
      progress: 100,
      status: "completed",
      lessons: [
        t.learning.lessonRiskPerTrade,
        t.learning.lessonStopLoss,
        t.learning.lessonRiskReward,
        t.learning.lessonPositionSizing,
      ],
    },
    {
      id: "intraday-momentum",
      title: t.learning.moduleFourTitle,
      text: t.learning.moduleFourText,
      level: t.learning.intermediateLevel,
      estimatedTime: "75 min",
      progress: 0,
      status: "not_started",
      lessons: [
        t.learning.lessonMomentumLogic,
        t.learning.lessonBreakoutReclaim,
        t.learning.lessonFailedBreakout,
        t.learning.lessonContinuation,
      ],
    },
    {
      id: "trading-psychology",
      title: t.learning.moduleFiveTitle,
      text: t.learning.moduleFiveText,
      level: t.learning.intermediateLevel,
      estimatedTime: "55 min",
      progress: 0,
      status: "not_started",
      lessons: [
        t.learning.lessonDiscipline,
        t.learning.lessonOvertrading,
        t.learning.lessonRevengeTrading,
        t.learning.lessonPatience,
      ],
    },
    {
      id: "playbook-setups",
      title: t.learning.moduleSixTitle,
      text: t.learning.moduleSixText,
      level: t.learning.advancedLevel,
      estimatedTime: "90 min",
      progress: 0,
      status: "not_started",
      lessons: [
        t.learning.lessonSetupChecklist,
        t.learning.lessonEntryTrigger,
        t.learning.lessonInvalidation,
        t.learning.lessonReviewProcess,
      ],
    },
  ];
}

function getAdditionalLearningTracks(
  t: (typeof dashboardDict)[Language]
): AdditionalLearningTrack[] {
  return [
    {
      id: "smart-money",
      title: t.learning.extraModuleOneTitle,
      text: t.learning.extraModuleOneText,
      level: t.learning.advancedLevel,
      estimatedTime: "80 min",
      progress: 0,
      lessons: [
        t.learning.extraModuleOneLessonOne,
        t.learning.extraModuleOneLessonTwo,
        t.learning.extraModuleOneLessonThree,
        t.learning.extraModuleOneLessonFour,
      ],
    },
    {
      id: "cscalp-order-book",
      title: t.learning.extraModuleTwoTitle,
      text: t.learning.extraModuleTwoText,
      level: t.learning.intermediateLevel,
      estimatedTime: "70 min",
      progress: 0,
      lessons: [
        t.learning.extraModuleTwoLessonOne,
        t.learning.extraModuleTwoLessonTwo,
        t.learning.extraModuleTwoLessonThree,
        t.learning.extraModuleTwoLessonFour,
      ],
    },
    {
      id: "extra-module-3",
      title: t.learning.extraModuleThreeTitle,
      text: t.learning.extraModuleThreeText,
      level: t.learning.intermediateLevel,
      estimatedTime: "60 min",
      progress: 0,
      lessons: [
        t.learning.extraModuleThreeLessonOne,
        t.learning.extraModuleThreeLessonTwo,
        t.learning.extraModuleThreeLessonThree,
        t.learning.extraModuleThreeLessonFour,
      ],
    },
    {
      id: "extra-module-4",
      title: t.learning.extraModuleFourTitle,
      text: t.learning.extraModuleFourText,
      level: t.learning.advancedLevel,
      estimatedTime: "60 min",
      progress: 0,
      lessons: [
        t.learning.extraModuleFourLessonOne,
        t.learning.extraModuleFourLessonTwo,
        t.learning.extraModuleFourLessonThree,
        t.learning.extraModuleFourLessonFour,
      ],
    },
  ];
}

function getLessonContent(
  moduleId: string,
  lessonIndex: number
): LearningLessonContent {
  const lessonKey = `${moduleId}-${lessonIndex}`;

  const contentByLesson: Record<string, LearningLessonContent> = {
    "market-basics-1": {
      intro:
        "Рынок — это место, где покупатели и продавцы постоянно договариваются о цене. Цена двигается не потому, что график “хочет” идти вверх или вниз, а потому что в конкретный момент одна сторона становится агрессивнее другой.",
      blocks: [
        {
          title: "Что реально двигает цену",
          text:
            "Цена двигается тогда, когда агрессивные покупатели начинают забирать ликвидность у продавцов, либо агрессивные продавцы начинают продавать в покупателей. Если покупатели готовы платить всё выше — цена растёт. Если продавцы готовы продавать всё ниже — цена падает.",
        },
        {
          title: "Кто участвует в рынке",
          text:
            "В рынке есть разные участники: долгосрочные инвесторы, фонды, маркет-мейкеры, алгоритмы, скальперы, дейтрейдеры и новостные трейдеры. Каждый из них создаёт спрос, предложение, ликвидность и волатильность.",
        },
        {
          title: "Почему цена не движется идеально",
          text:
            "Цена почти никогда не идёт ровной линией. Она двигается импульсами, откатами, остановками и ложными пробоями, потому что участники рынка постоянно фиксируют прибыль, входят заново, защищают позиции и выбивают стопы.",
        },
        {
          title: "Что важно для трейдера",
          text:
            "Трейдеру не нужно угадывать будущее. Его задача — понять текущий баланс силы: кто контролирует движение сейчас, где может быть ликвидность, где участники будут принимать решения и где риск становится понятным.",
        },
      ],
      checklist: [
        "Определи, кто сейчас агрессивнее: покупатели или продавцы.",
        "Посмотри, есть ли импульс или рынок стоит в диапазоне.",
        "Найди зоны, где раньше была сильная реакция цены.",
        "Не открывай сделку без понятного места для стопа.",
      ],
      practice:
        "Открой любой актив на графике 5m или 15m. Отметь один сильный импульс, один откат и одну зону, где цена остановилась или резко изменила направление. Напиши рядом: кто там был сильнее — покупатели или продавцы.",
    },

    "market-basics-2": {
      intro:
        "Ордер — это инструкция брокеру купить или продать актив. Понимание типов ордеров важно, потому что от них зависит цена входа, скорость исполнения, риск проскальзывания и контроль над сделкой.",
      blocks: [
        {
          title: "Market order",
          text:
            "Market order исполняется по лучшей доступной цене прямо сейчас. Его плюс — скорость. Минус — ты не контролируешь точную цену исполнения, особенно в быстрых акциях, на премаркете, в крипте или на тонком стакане.",
        },
        {
          title: "Limit order",
          text:
            "Limit order позволяет указать цену, по которой ты готов купить или продать. Его плюс — контроль цены. Минус — ордер может не исполниться, если рынок не даст твою цену или быстро уйдёт без тебя.",
        },
        {
          title: "Stop order",
          text:
            "Stop order активируется, когда цена доходит до заданного уровня. Чаще всего он используется для ограничения риска. Например, если сценарий сломался, stop order помогает выйти из позиции автоматически.",
        },
        {
          title: "Почему тип ордера влияет на результат",
          text:
            "Один и тот же сетап может дать разный результат в зависимости от ордера. Market order может дать плохое исполнение, limit order может не зайти в сделку, а неправильный stop может выбить из позиции перед движением.",
        },
      ],
      checklist: [
        "Market order — когда важнее скорость, чем точная цена.",
        "Limit order — когда важнее цена и контроль исполнения.",
        "Stop order — когда нужно заранее ограничить риск.",
        "На тонком рынке market order может дать сильное проскальзывание.",
      ],
      practice:
        "Открой стакан или график активной акции. Представь 3 ситуации: быстрый пробой, спокойный откат к уровню и выход по стопу. Для каждой ситуации выбери, какой ордер был бы логичнее: market, limit или stop.",
    },

    "market-basics-3": {
      intro:
        "Bid, Ask и Spread — это базовая механика цены. Если трейдер не понимает, где покупают, где продают и сколько стоит немедленное исполнение, он будет часто получать плохие входы и неожиданные убытки.",
      blocks: [
        {
          title: "Bid",
          text:
            "Bid — это лучшая цена, по которой сейчас готовы купить актив. Если ты продаёшь market order, чаще всего ты продаёшь именно в bid. Сильный bid может временно удерживать цену.",
        },
        {
          title: "Ask",
          text:
            "Ask — это лучшая цена, по которой сейчас готовы продать актив. Если ты покупаешь market order, чаще всего ты покупаешь именно в ask. Когда покупатели активно забирают ask, цена начинает подниматься.",
        },
        {
          title: "Spread",
          text:
            "Spread — это разница между bid и ask. Чем шире spread, тем дороже тебе входить и выходить. В активных ликвидных инструментах spread обычно узкий. В тонких акциях, на премаркете или после новостей spread может быть опасно широким.",
        },
        {
          title: "Почему это важно для интрадей-трейдера",
          text:
            "В интрадей-торговле точка входа имеет огромное значение. Если ты входишь через широкий spread, сделка может сразу начинаться с минуса. Чем меньше таймфрейм и короче стоп, тем важнее следить за spread.",
        },
      ],
      checklist: [
        "Перед входом проверь spread.",
        "Не используй market order в инструменте с широким spread без причины.",
        "Смотри, как цена реагирует на bid и ask возле уровня.",
        "Помни: плохое исполнение может сломать даже хороший сетап.",
      ],
      practice:
        "Выбери 3 тикера: один очень ликвидный, один средний и один тонкий. Сравни spread. Посмотри, где можно спокойно входить, а где исполнение уже само по себе становится риском.",
    },

    "market-basics-4": {
      intro:
        "Ликвидность — это возможность купить или продать актив без сильного сдвига цены. Для трейдера ликвидность важна не только как объём, но и как зоны, где стоят ордера, стопы и интерес участников.",
      blocks: [
        {
          title: "Что такое ликвидность простыми словами",
          text:
            "Ликвидность показывает, насколько легко можно войти или выйти из позиции. Если ликвидности много, крупные сделки проходят спокойнее. Если ликвидности мало, даже небольшой ордер может резко двинуть цену.",
        },
        {
          title: "Где обычно находится ликвидность",
          text:
            "Ликвидность часто собирается возле очевидных уровней: high/low дня, premarket high/low, round numbers, VWAP, зон консолидации, локальных максимумов и минимумов. Там многие ставят стопы, лимитные ордера и ждут реакцию.",
        },
        {
          title: "Почему цена тянется к ликвидности",
          text:
            "Рынку нужны встречные ордера для исполнения крупных позиций. Поэтому цена часто идёт туда, где много стопов или лимитных заявок. Для трейдера это объясняет пробои, выносы, резкие ускорения и ложные движения.",
        },
        {
          title: "Как использовать ликвидность в торговле",
          text:
            "Не нужно просто покупать каждый пробой или шортить каждый вынос. Важно смотреть реакцию: пробой удерживается или быстро возвращается обратно, объём поддерживает движение или движение было только сбором стопов.",
        },
      ],
      checklist: [
        "Отмечай зоны очевидной ликвидности до входа.",
        "Смотри реакцию цены после снятия уровня.",
        "Не путай настоящий пробой и сбор стопов.",
        "Входи только там, где понятен риск и сценарий.",
      ],
      practice:
        "Открой график акции с гэпом или сильным движением. Отметь premarket high, premarket low, high/low дня и круглые уровни. Посмотри, где цена ускорялась и где после выноса быстро возвращалась обратно.",
    },
    "technical-analysis-1": {
  intro:
    "Свеча показывает, что происходило с ценой за выбранный период времени. Для трейдера важна не только форма свечи, но и контекст: где она появилась, какой был объём, что было до неё и как цена повела себя после.",
  blocks: [
    {
      title: "Из чего состоит свеча",
      text:
        "Свеча показывает цену открытия, максимум, минимум и цену закрытия. Тело свечи показывает основное движение за период, а тени показывают попытки цены уйти выше или ниже, которые не были полностью удержаны.",
    },
    {
      title: "Сильная свеча",
      text:
        "Сильная свеча обычно имеет большое тело, закрывается близко к максимуму при росте или близко к минимуму при падении. Она показывает, что одна сторона контролировала движение большую часть периода.",
    },
    {
      title: "Свеча с длинной тенью",
      text:
        "Длинная тень показывает, что цена пыталась уйти в одну сторону, но её вернули обратно. Это может быть признаком отказа от уровня, снятия ликвидности или фиксации участников.",
    },
    {
      title: "Почему нельзя торговать свечу без контекста",
      text:
        "Одна и та же свеча может означать разные вещи. Длинная верхняя тень возле сильного сопротивления может быть слабостью, но внутри сильного тренда она может быть просто фиксацией перед продолжением.",
    },
  ],
  checklist: [
    "Смотри, где появилась свеча: на уровне, в тренде или в середине шума.",
    "Оцени закрытие свечи: сильное оно или слабое.",
    "Сравни свечу с предыдущими свечами.",
    "Не принимай решение только по форме свечи.",
  ],
},

"technical-analysis-2": {
  intro:
    "Поддержка и сопротивление — это зоны, где цена раньше сильно реагировала или где участники рынка могут снова принять решение. Важно понимать: уровень — это не тонкая линия, а область интереса.",
  blocks: [
    {
      title: "Что такое поддержка",
      text:
        "Поддержка — это зона, где раньше появлялись покупатели и цена останавливалась или разворачивалась вверх. Это не значит, что цена обязана отскочить снова, но значит, что рядом может появиться реакция.",
    },
    {
      title: "Что такое сопротивление",
      text:
        "Сопротивление — это зона, где раньше появлялись продавцы и цена останавливалась или разворачивалась вниз. Чем очевиднее зона для участников рынка, тем больше внимания она может привлечь.",
    },
    {
      title: "Почему уровень — это зона",
      text:
        "Цена редко реагирует идеально в один цент или пункт. Участники ставят ордера не в одной точке, а в диапазоне. Поэтому поддержку и сопротивление лучше воспринимать как область, где нужно ждать реакцию.",
    },
    {
      title: "Как использовать уровни",
      text:
        "Уровень сам по себе не является сигналом. Сигнал появляется, когда цена подходит к уровню и показывает реакцию: удержание, пробой, ложный пробой, ускорение, отказ или возврат обратно.",
    },
  ],
  checklist: [
    "Отмечай только очевидные уровни, а не всё подряд.",
    "Используй зоны, а не тонкие линии.",
    "Жди реакцию цены возле уровня.",
    "Не входи только потому, что цена коснулась линии.",
  ],
},

"technical-analysis-3": {
  intro:
    "Тренд и ренж — это два разных состояния рынка. В тренде цена движется направленно, а в ренже цена зажата между зонами спроса и предложения. Ошибка многих трейдеров — торговать ренж как тренд или тренд как ренж.",
  blocks: [
    {
      title: "Что такое тренд",
      text:
        "Тренд — это направленное движение цены. В аптренде цена чаще делает более высокие максимумы и более высокие минимумы. В даунтренде — более низкие максимумы и более низкие минимумы.",
    },
    {
      title: "Что такое ренж",
      text:
        "Ренж — это состояние рынка без явного направления. Цена ходит между верхней и нижней границей, а пробои часто могут быть ложными. В ренже важно не путать шум с началом тренда.",
    },
    {
      title: "Как отличить тренд от ренжа",
      text:
        "В тренде откаты чаще удерживаются, а движение продолжается. В ренже цена часто возвращается обратно в середину диапазона после попытки пробоя. Если цена не может продолжить после пробоя — это признак слабости.",
    },
    {
      title: "Почему это важно для входа",
      text:
        "В тренде логичнее искать продолжение движения после отката или пробоя. В ренже опасно покупать верх диапазона и шортить низ диапазона без подтверждения. Сначала нужно понять режим рынка, потом выбирать сетап.",
    },
  ],
  checklist: [
    "Определи, рынок сейчас движется направленно или стоит в диапазоне.",
    "В тренде смотри, удерживаются ли откаты.",
    "В ренже будь осторожен с пробоями без продолжения.",
    "Не торгуй один и тот же сетап одинаково в тренде и в ренже.",
  ],
},

"technical-analysis-4": {
  intro:
    "Объём показывает активность участников рынка. Сам по себе объём не говорит, куда точно пойдёт цена, но помогает понять, есть ли интерес к движению, подтверждается ли пробой и насколько серьёзной может быть реакция.",
  blocks: [
    {
      title: "Что показывает объём",
      text:
        "Объём показывает, сколько акций, контрактов или монет было проторговано за определённый период. Высокий объём означает повышенный интерес, но не всегда означает продолжение движения.",
    },
    {
      title: "Объём на импульсе",
      text:
        "Если цена пробивает уровень и объём резко растёт, это может говорить о настоящем интересе участников. Но важно смотреть, удерживается ли движение после всплеска объёма.",
    },
    {
      title: "Объём без продолжения",
      text:
        "Если появляется большой объём, но цена не может продолжить движение, это может быть признаком поглощения, фиксации или ловушки. Такой момент особенно важен возле уровней.",
    },
    {
      title: "Как использовать объём в интрадей",
      text:
        "Для интрадей-трейдера объём полезен как подтверждение реакции. Пробой с объёмом и удержанием сильнее, чем пробой без объёма. Отказ от уровня на большом объёме может быть сильным сигналом смены контроля.",
    },
  ],
  checklist: [
    "Сравни текущий объём с предыдущими свечами.",
    "Смотри не только всплеск объёма, но и реакцию после него.",
    "Пробой без объёма слабее пробоя с объёмом.",
    "Большой объём без продолжения может быть ловушкой.",
  ],
},
"risk-management-1": {
  intro:
    "Риск-менеджмент — это система, которая защищает трейдера от одной плохой сделки, плохого дня или серии ошибок. Хороший трейдер думает не только о том, сколько можно заработать, но и о том, сколько можно потерять, если сценарий окажется неправильным.",
  blocks: [
    {
      title: "Почему риск важнее идеи",
      text:
        "Даже сильная торговая идея может не сработать. Рынок может резко изменить направление, выйти новость, исчезнуть ликвидность или появиться агрессивный продавец/покупатель. Если риск заранее не определён, одна сделка может испортить весь день или даже весь счёт.",
    },
    {
      title: "Риск на сделку",
      text:
        "Риск на сделку — это сумма, которую трейдер готов потерять, если сценарий не сработает. Например, если риск $50, значит стоп должен быть рассчитан так, чтобы при выходе по стопу убыток был около $50, а не случайной суммой.",
    },
    {
      title: "Риск на день",
      text:
        "Риск на день ограничивает максимальную потерю за торговую сессию. Это нужно, чтобы после плохой серии не начинать отыгрываться, увеличивать размер позиции и разрушать дисциплину.",
    },
    {
      title: "Главная цель риск-менеджмента",
      text:
        "Цель риск-менеджмента — не убрать убытки полностью. Убытки будут всегда. Цель — сделать их контролируемыми, ожидаемыми и такими, чтобы они не ломали стратегию, психологию и депозит.",
    },
  ],
  checklist: [
    "Перед входом знай точную сумму риска.",
    "Не увеличивай риск из-за уверенности или желания отыграться.",
    "Ограничивай дневной убыток заранее.",
    "Хорошая сделка — это не только идея, но и контролируемый риск.",
  ],
},

"risk-management-2": {
  intro:
    "Размер позиции показывает, сколько акций, контрактов или монет ты можешь взять в сделку при заданном риске. Это один из самых важных навыков трейдера, потому что он связывает идею, стоп и допустимую потерю.",
  blocks: [
    {
      title: "Формула позиции",
      text:
        "Базовая логика простая: размер позиции = риск на сделку / расстояние до стопа. Если ты готов рискнуть $50, а стоп находится на $0.25 от входа, размер позиции будет 200 акций.",
    },
    {
      title: "Почему нельзя брать объём на глаз",
      text:
        "Если брать позицию на глаз, риск будет каждый раз разным. В одной сделке ты можешь потерять $20, в другой $150, хотя думал, что торгуешь одинаково. Это ломает статистику и делает результат случайным.",
    },
    {
      title: "Стоп определяет объём",
      text:
        "Сначала определяется точка входа и место, где сценарий будет сломан. Только после этого считается объём. Нельзя сначала выбрать желаемый объём, а потом подгонять стоп под эмоции.",
    },
    {
      title: "Что делать с широким стопом",
      text:
        "Если стоп слишком широкий, позиция должна быть меньше. Если после расчёта объём получается слишком маленьким или сделка не даёт нормального потенциала, лучше пропустить вход.",
    },
  ],
  checklist: [
    "Сначала определи стоп, потом считай объём.",
    "Не бери одинаковый размер позиции на разных сетапах.",
    "Чем шире стоп, тем меньше позиция.",
    "Не увеличивай объём, если не готов принять реальный риск.",
  ],
},

"risk-management-3": {
  intro:
    "Risk/Reward показывает соотношение потенциальной прибыли к потенциальному убытку. Он помогает понять, стоит ли сделка риска. Даже хорошая идея может быть плохой сделкой, если потенциальная прибыль слишком маленькая относительно стопа.",
  blocks: [
    {
      title: "Что такое R",
      text:
        "R — это единица риска. Если ты рискуешь $50, то 1R = $50. Прибыль $100 будет +2R, убыток $50 будет -1R. Такой подход помогает оценивать сделки независимо от размера позиции и цены акции.",
    },
    {
      title: "Почему важен потенциал",
      text:
        "Перед входом нужно понимать, куда цена реально может дойти. Если стоп $0.30, а ближайшая цель всего $0.20, сделка не имеет хорошего соотношения риска и прибыли.",
    },
    {
      title: "Не все сделки должны быть 3R",
      text:
        "В скальпинге и интрадей-торговле не каждая сделка даст большое соотношение. Но трейдер должен понимать, почему он входит, где частично фиксирует прибыль и где сценарий перестаёт быть выгодным.",
    },
    {
      title: "Risk/Reward и win rate",
      text:
        "Чем ниже средний Risk/Reward, тем выше должен быть win rate. Если трейдер часто берёт маленькую прибыль и держит большие убытки, даже высокий процент прибыльных сделок может не спасти систему.",
    },
  ],
  checklist: [
    "Перед входом определи ближайшую логичную цель.",
    "Сравни цель со стопом.",
    "Думай в R, а не только в долларах.",
    "Не входи в сделку, где потенциальный убыток больше разумной цели.",
  ],
},

"risk-management-4": {
  intro:
    "Дневной лимит — это заранее установленная граница убытка, после которой трейдер прекращает торговлю. Он нужен не потому, что трейдер слабый, а потому что после серии убытков качество решений обычно ухудшается.",
  blocks: [
    {
      title: "Зачем нужен дневной лимит",
      text:
        "После нескольких плохих сделок появляется желание отыграться. Трейдер начинает видеть сетапы там, где их нет, увеличивает риск, нарушает план и торгует эмоции. Дневной лимит защищает от этого состояния.",
    },
    {
      title: "Лимит по деньгам",
      text:
        "Самый простой вариант — лимит по сумме. Например, если риск на сделку $50, дневной лимит может быть $100–150. После достижения лимита торговля прекращается до следующего дня.",
    },
    {
      title: "Лимит по качеству",
      text:
        "Иногда важно остановиться не только после убытка, но и после плохого поведения: импульсивных входов, нарушения стопа, входа без сетапа, увеличения объёма без причины. Это тоже сигнал завершить сессию.",
    },
    {
      title: "Как относиться к остановке",
      text:
        "Остановка после лимита — это не поражение. Это профессиональное действие. Трейдер, который умеет остановиться, сохраняет капитал, психику и возможность торговать завтра.",
    },
  ],
  checklist: [
    "Установи дневной лимит до начала сессии.",
    "После достижения лимита не открывай новые сделки.",
    "Отдельно отслеживай нарушение правил, а не только PnL.",
    "Не пытайся вернуть день любой ценой.",
  ],
},
"intraday-momentum-1": {
  intro:
    "Momentum — это ситуация, когда цена движется быстро и направленно, потому что одна сторона рынка становится агрессивнее другой. В интрадей-торговле momentum важен тем, что даёт быстрые движения, понятные точки риска и возможность работать по реакции.",
  blocks: [
    {
      title: "Что такое momentum",
      text:
        "Momentum появляется, когда в актив приходит повышенный интерес: новость, гэп, объём, пробой уровня, сильный рынок или агрессивные участники. Цена начинает двигаться быстрее обычного, а откаты становятся меньше или быстрее выкупаются.",
    },
    {
      title: "Почему momentum опасен без плана",
      text:
        "Импульс может дать быстрый профит, но также может резко развернуться. Если входить поздно, без стопа и без понимания уровня, трейдер легко покупает вершину или шортит самый низ движения.",
    },
    {
      title: "Momentum vs обычный шум",
      text:
        "Не каждое движение является momentum. Настоящий momentum обычно сопровождается расширением диапазона свечей, ростом объёма, удержанием уровней и быстрым продолжением после небольших пауз.",
    },
    {
      title: "Что важно для входа",
      text:
        "Для momentum-трейдера важно не просто увидеть рост или падение, а понять, где движение началось, где ближайший уровень, где может быть ликвидность и где сценарий будет сломан.",
    },
  ],
  checklist: [
    "Ищи ускорение цены, а не случайное движение.",
    "Проверяй объём относительно предыдущих свечей.",
    "Смотри, удерживает ли цена пробитый уровень.",
    "Не входи поздно, если стоп становится слишком широким.",
  ],
},

"intraday-momentum-2": {
  intro:
    "Gap and go — это сценарий, где актив открывается с гэпом и продолжает движение в сторону гэпа после открытия рынка. Такой сетап часто появляется на новостях, earnings, upgrade/downgrade, сильном секторе или необычном объёме.",
  blocks: [
    {
      title: "Что такое гэп",
      text:
        "Гэп — это разрыв между ценой предыдущего закрытия и текущей ценой. Если акция открывается значительно выше или ниже, это означает, что за пределами обычной сессии появился новый спрос или предложение.",
    },
    {
      title: "Когда gap and go сильнее",
      text:
        "Сетап сильнее, когда есть понятный catalyst, высокий relative volume, удержание premarket levels и отсутствие быстрого возврата в гэп. Чем лучше цена держит импульс после открытия, тем выше шанс продолжения.",
    },
    {
      title: "Где искать вход",
      text:
        "Часто вход ищут не в случайном месте, а после удержания premarket high/low, VWAP, opening range, локального отката или пробоя зоны, где продавцы/покупатели не смогли развернуть движение.",
    },
    {
      title: "Главный риск",
      text:
        "Главный риск gap and go — купить слишком поздно после большого движения или зайти в момент, когда ранние участники уже фиксируют прибыль. Поэтому важно ждать структуру, уровень и реакцию.",
    },
  ],
  checklist: [
    "Проверь размер гэпа и причину движения.",
    "Смотри premarket high/low и VWAP.",
    "Оцени, держится ли цена после открытия.",
    "Не входи в растянутую свечу без понятного стопа.",
  ],
},

"intraday-momentum-3": {
  intro:
    "Continuation — это продолжение уже начатого движения. Для трейдера это один из самых логичных momentum-сценариев: рынок уже показал направление, а задача — найти место, где продолжение имеет хороший риск.",
  blocks: [
    {
      title: "Что такое continuation",
      text:
        "Continuation возникает, когда цена после импульса делает паузу, откат или консолидацию, но не ломает структуру. После этого движение продолжается в сторону первоначального импульса.",
    },
    {
      title: "Какая пауза считается здоровой",
      text:
        "Здоровая пауза обычно не слишком глубокая, проходит на меньшем объёме и удерживает ключевые уровни. Если откат слишком резкий и возвращает большую часть импульса, continuation становится слабее.",
    },
    {
      title: "Где искать триггер",
      text:
        "Триггером может быть пробой локального high/low после паузы, удержание VWAP, возврат выше уровня, ускорение объёма или отказ продавцов/покупателей продолжить откат.",
    },
    {
      title: "Когда continuation лучше пропустить",
      text:
        "Если цена уже далеко от базы, объём падает, уровень не удерживается, а стоп получается слишком широким — продолжение может быть плохой сделкой даже при правильном направлении.",
    },
  ],
  checklist: [
    "Сначала должен быть сильный импульс.",
    "Пауза не должна ломать структуру.",
    "Ищи вход возле уровня, а не посреди движения.",
    "Стоп должен быть логичным и коротким относительно цели.",
  ],
},

"intraday-momentum-4": {
  intro:
    "False breakout и trap — это ситуации, когда цена пробивает очевидный уровень, собирает ликвидность, но не может продолжить движение и быстро возвращается обратно. Для momentum-трейдера это важно, потому что такие моменты часто дают сильное обратное движение.",
  blocks: [
    {
      title: "Что такое false breakout",
      text:
        "False breakout — это ложный пробой уровня. Цена выходит выше сопротивления или ниже поддержки, но вместо продолжения быстро возвращается обратно в диапазон или под/над уровень.",
    },
    {
      title: "Что такое trap",
      text:
        "Trap — это ловушка для трейдеров, которые вошли на очевидный пробой. Если после пробоя нет продолжения, эти трейдеры начинают выходить, а их выход усиливает движение в обратную сторону.",
    },
    {
      title: "Как распознать слабый пробой",
      text:
        "Слабый пробой часто выглядит так: цена вышла за уровень, но объём не поддержал движение, свеча закрылась плохо, следующий импульс не появился, а цена быстро вернулась обратно.",
    },
    {
      title: "Как использовать trap",
      text:
        "Trap не нужно угадывать заранее. Его нужно видеть по факту реакции: пробой был, продолжения нет, возврат под/над уровень произошёл, участники начинают закрываться. Только после этого появляется логика сделки.",
    },
  ],
  checklist: [
    "Не считай каждый пробой настоящим.",
    "Смотри, есть ли продолжение после снятия уровня.",
    "Возврат обратно за уровень — важный сигнал слабости пробоя.",
    "Trap лучше торговать после подтверждения, а не заранее.",
  ],
},
"trading-psychology-1": {
  intro:
    "Психология трейдинга — это способность принимать решения по плану, даже когда рынок вызывает страх, жадность, азарт или желание отыграться. В трейдинге недостаточно знать сетап: нужно уметь выполнить его спокойно и последовательно.",
  blocks: [
    {
      title: "Почему психология влияет на результат",
      text:
        "Две одинаковые торговые идеи могут дать разный результат у разных трейдеров. Один войдёт по плану, поставит стоп и примет убыток. Другой увеличит объём, передвинет стоп, усреднится и превратит нормальный минус в проблему.",
    },
    {
      title: "Главный враг — не эмоции",
      text:
        "Эмоции сами по себе не являются проблемой. Проблема начинается, когда трейдер действует под их влиянием: входит без сигнала, закрывает прибыль слишком рано, держит убыток слишком долго или мстит рынку после стопа.",
    },
    {
      title: "Стабильность важнее идеального входа",
      text:
        "Профессиональный трейдер не пытается каждый раз поймать идеальную точку. Он строит повторяемый процесс: подготовка, сценарий, вход, риск, сопровождение, выход и разбор сделки.",
    },
    {
      title: "Что значит торговать дисциплинированно",
      text:
        "Дисциплина — это не жёсткость ради жёсткости. Это способность делать правильное действие, когда эмоционально хочется сделать другое. Например, закрыть сделку по стопу, не входить без сетапа или завершить день после лимита.",
    },
  ],
  checklist: [
    "Не оценивай себя по одной сделке.",
    "Отделяй качество решения от результата сделки.",
    "Следи за состоянием до входа, а не только после убытка.",
    "Не торгуй, если главная мотивация — отыграться.",
  ],
},

"trading-psychology-2": {
  intro:
    "FOMO — это страх упустить движение. Он появляется, когда цена резко идёт без тебя, и кажется, что если не войти прямо сейчас, возможность исчезнет. Это одна из главных причин поздних входов и плохого риска.",
  blocks: [
    {
      title: "Как выглядит FOMO",
      text:
        "Трейдер видит сильную свечу, ускорение, зелёный PnL у других или быстрое движение в ленте и входит без плана. Часто такой вход происходит далеко от уровня, со слишком широким стопом и без понятного сценария выхода.",
    },
    {
      title: "Почему FOMO опасно",
      text:
        "Когда вход происходит из страха упустить, трейдер обычно покупает там, где ранние участники уже фиксируют прибыль, или шортит там, где продавцы уже выдохлись. Сделка сразу становится эмоциональной.",
    },
    {
      title: "Как снизить FOMO",
      text:
        "Лучший способ снизить FOMO — заранее знать свои сетапы. Если движение не даёт входа по твоей системе, оно не твоё. Рынок каждый день даёт новые возможности, но плохой вход может испортить весь день.",
    },
    {
      title: "Фраза профессионального трейдера",
      text:
        "Если я не понимаю, где мой риск, значит это не моя сделка. Лучше пропустить движение, чем войти поздно и потерять контроль.",
    },
  ],
  checklist: [
    "Не входи только потому, что цена быстро движется.",
    "Перед входом ответь: где стоп и почему именно там?",
    "Если вход далеко от уровня — будь особенно осторожен.",
    "Пропущенная сделка лучше импульсивной сделки.",
  ],
},

"trading-psychology-3": {
  intro:
    "Revenge trading — это попытка отыграться после убытка. В этот момент трейдер торгует не рынок, а свою эмоцию: злость, обиду, желание доказать себе, что он прав, или вернуть день в плюс любой ценой.",
  blocks: [
    {
      title: "Как начинается revenge trading",
      text:
        "Обычно всё начинается с нормального стопа. Но трейдер воспринимает его как личную ошибку, сразу ищет новый вход, увеличивает объём или входит в слабый сетап, чтобы быстро вернуть потерянное.",
    },
    {
      title: "Почему это разрушает систему",
      text:
        "Revenge trading ломает статистику. Вместо запланированных сделок появляются хаотичные входы. Риск увеличивается, качество решений падает, а дневной убыток может стать намного больше изначально допустимого.",
    },
    {
      title: "Как остановить отыгрыш",
      text:
        "Нужно иметь заранее прописанное правило: после двух ошибок подряд, нарушения стопа или достижения дневного лимита торговля прекращается. Это не слабость, а защита капитала и психики.",
    },
    {
      title: "Что делать после плохой сделки",
      text:
        "После плохой сделки нужно не искать срочный новый вход, а коротко записать: был ли сетап, был ли риск, был ли вход по плану, что именно нарушено. Только после этого можно принимать следующее решение.",
    },
  ],
  checklist: [
    "После стопа не открывай новую сделку сразу на эмоциях.",
    "Не увеличивай объём, чтобы вернуть убыток быстрее.",
    "Остановись после нарушения правил.",
    "Разбирай ошибку письменно, а не через новую сделку.",
  ],
},

"trading-psychology-4": {
  intro:
    "Дисциплина в трейдинге строится не на мотивации, а на процессе. Мотивация может быть высокой утром и исчезнуть после двух стопов. Процесс нужен, чтобы трейдер знал, что делать независимо от эмоций.",
  blocks: [
    {
      title: "Что такое торговый процесс",
      text:
        "Торговый процесс — это повторяемая последовательность действий: подготовка, выбор тикеров, уровни, сценарии, риск, вход, сопровождение, выход и разбор. Чем понятнее процесс, тем меньше места для хаоса.",
    },
    {
      title: "Почему дневник обязателен",
      text:
        "Без дневника трейдер часто помнит только яркие сделки: большие плюсы, обидные минусы и упущенные движения. Дневник показывает реальную статистику: где есть преимущество, где ошибки повторяются, какие сетапы работают лучше.",
    },
    {
      title: "Как формируется дисциплина",
      text:
        "Дисциплина формируется через повторение маленьких правил. Не нарушить стоп. Не входить без уровня. Не увеличивать риск после минуса. Завершить день после лимита. Эти действия создают профессиональное поведение.",
    },
    {
      title: "Как оценивать день",
      text:
        "День нужно оценивать не только по PnL. Важно смотреть, были ли сделки по плану, соблюдался ли риск, не было ли импульсивных входов, насколько хорошо трейдер выполнил свой процесс.",
    },
  ],
  checklist: [
    "Перед сессией подготовь сценарии.",
    "После сделки запиши причину входа и выхода.",
    "Оцени день по качеству решений, а не только по PnL.",
    "Дисциплина — это повторяемый процесс, а не настроение.",
  ],
},
"playbook-setups-1": {
  intro:
    "Playbook — это личная библиотека торговых сценариев. Он нужен, чтобы трейдер не входил случайно, а работал по повторяемым ситуациям: что ищем, где вход, где риск, где выход и когда сетап лучше пропустить.",
  blocks: [
    {
      title: "Что такое торговый сетап",
      text:
        "Сетап — это повторяемая рыночная ситуация, где у трейдера есть понятная логика входа, стопа, цели и управления позицией. Сетап не означает гарантию прибыли, но даёт структуру для принятия решения.",
    },
    {
      title: "Зачем нужен playbook",
      text:
        "Без playbook трейдер каждый день торгует по-разному. Сегодня пробой, завтра откат, послезавтра новость, потом интуитивный вход. Playbook помогает сузить фокус и понять, какие сценарии реально дают преимущество.",
    },
    {
      title: "Что должно быть в описании сетапа",
      text:
        "В хорошем описании сетапа есть контекст, условия отбора, триггер входа, место стопа, цель, invalidation, ошибки, примеры хороших и плохих сделок. Чем конкретнее описание, тем легче повторять сетап.",
    },
    {
      title: "Как AI будет использовать playbook",
      text:
        "В будущем SkillEdge AI сможет сравнивать сделки клиента с его лучшими сетапами: был ли контекст, был ли правильный уровень, не был ли вход поздним, совпадал ли риск с правилами и где трейдер отклонился от плана.",
    },
  ],
  checklist: [
    "Опиши сетап простыми словами.",
    "Укажи условия, при которых сетап считается рабочим.",
    "Запиши, где должен быть стоп и почему.",
    "Добавляй реальные примеры сделок в playbook.",
  ],
},

"playbook-setups-2": {
  intro:
    "Контекст — это рыночная обстановка вокруг сделки. Один и тот же вход может быть сильным или слабым в зависимости от гэпа, объёма, новости, рынка, таймфрейма, уровня и поведения цены до входа.",
  blocks: [
    {
      title: "Почему контекст важнее паттерна",
      text:
        "Паттерн без контекста часто обманывает. Пробой уровня после сильного гэпа и объёма — это одно. Такой же пробой в середине тихого дня без объёма — совсем другое. Контекст показывает, есть ли причина для движения.",
    },
    {
      title: "Какие элементы контекста смотреть",
      text:
        "Перед сделкой важно смотреть catalyst, gap %, relative volume, premarket high/low, VWAP, общий рынок, сектор, тренд/ренж, расстояние до уровней и качество предыдущего движения.",
    },
    {
      title: "Контекст для long и short",
      text:
        "Для long важно понимать, есть ли спрос, удерживаются ли откаты, есть ли место до сопротивления. Для short важно понимать, есть ли слабость, слом структуры, failed breakout, давление продавцов и пространство вниз.",
    },
    {
      title: "Когда сетап лучше пропустить",
      text:
        "Если контекст слабый, объём низкий, уровень неочевидный, движение уже растянуто, а риск широкий — лучше пропустить. Хороший трейдинг часто строится не только на входах, но и на отказе от плохих сделок.",
    },
  ],
  checklist: [
    "Перед входом проверь catalyst или причину движения.",
    "Сравни текущий объём с обычным объёмом.",
    "Оцени, есть ли место до ближайшей цели.",
    "Не торгуй паттерн отдельно от контекста.",
  ],
},

"playbook-setups-3": {
  intro:
    "Entry trigger — это конкретный момент, когда трейдер получает подтверждение для входа. Хороший trigger помогает не входить слишком рано, не гнаться за ценой и привязать сделку к понятному риску.",
  blocks: [
    {
      title: "Что такое trigger",
      text:
        "Trigger — это не просто желание войти. Это конкретное действие цены: пробой и удержание уровня, откат к VWAP, возврат после false breakout, ускорение объёма, reclaim уровня или rejection от зоны.",
    },
    {
      title: "Почему нельзя входить только по идее",
      text:
        "Идея может быть правильной, но вход слишком ранним или поздним. Например, акция может быть слабой, но если шортить внизу после сильного падения, риск становится плохим. Trigger нужен, чтобы идея стала сделкой.",
    },
    {
      title: "Примеры триггеров",
      text:
        "Для continuation trigger может быть пробой локального high после паузы. Для trap — возврат обратно под уровень после ложного пробоя. Для pullback — удержание зоны и появление реакции в сторону тренда.",
    },
    {
      title: "Trigger и стоп",
      text:
        "Хороший trigger почти всегда даёт понятное место для стопа. Если после входа непонятно, где сценарий сломан, значит trigger был слабым или сделка выбрана неправильно.",
    },
  ],
  checklist: [
    "Перед входом назови конкретный trigger.",
    "Не путай торговую идею и сигнал входа.",
    "Проверь, даёт ли trigger понятный стоп.",
    "Если trigger не появился — сделки нет.",
  ],
},

"playbook-setups-4": {
  intro:
    "Разбор сделок превращает опыт в систему. Если просто торговать и не анализировать, ошибки повторяются. Если фиксировать входы, выходы, контекст и эмоции, постепенно становится видно, какие сетапы работают, а какие ломают результат.",
  blocks: [
    {
      title: "Что смотреть в разборе сделки",
      text:
        "В разборе важно смотреть не только PnL. Нужно понять, был ли сетап, был ли контекст, где был вход, где был стоп, была ли цель, соблюдался ли риск и было ли отклонение от плана.",
    },
    {
      title: "Хорошая убыточная сделка",
      text:
        "Сделка может быть убыточной, но правильной, если вход был по сетапу, риск соблюдён, стоп логичный, а сценарий просто не сработал. Такие сделки не нужно эмоционально наказывать.",
    },
    {
      title: "Плохая прибыльная сделка",
      text:
        "Сделка может быть прибыльной, но плохой, если вход был импульсивным, риск не был понятен, стоп нарушен или прибыль появилась случайно. Такие сделки опасны, потому что закрепляют неправильное поведение.",
    },
    {
      title: "Как находить лучшие сетапы",
      text:
        "Нужно регулярно смотреть сделки по категориям: какой сетап, какой таймфрейм, какой market context, какой результат в R, где были ошибки. Через это формируется личная статистика и настоящий playbook.",
    },
  ],
  checklist: [
    "Разбирай сделку по качеству решения, а не только по PnL.",
    "Отделяй хорошие убытки от плохих ошибок.",
    "Ищи повторяющиеся прибыльные сценарии.",
    "Добавляй лучшие примеры в личный playbook.",
  ],
},
  };
  
  

  return (
    contentByLesson[lessonKey] ?? {
      intro:
        "Материал для этого урока будет добавлен в следующем обновлении Learning Center.",
      blocks: [
        {
          title: "Скоро",
          text:
            "Мы постепенно наполняем каждый урок полноценным учебным материалом, практикой и чеклистами.",
        },
      ],
      checklist: [
        "Открой урок.",
        "Изучи основной материал.",
        "Выполни практическое задание.",
      ],
      practice:
        "Вернись к этому уроку позже — материал будет расширен.",
    }
  );
}

function LearningTab({ t }: { t: (typeof dashboardDict)[Language] }) {
  const modules = getLearningModules(t);
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id ?? "");
  const [learningProgress, setLearningProgress] = useState<Record<string, number>>(
  () =>
    Object.fromEntries(
      modules.map((module) => [module.id, module.progress])
    )
);
const [learningProgressLoading, setLearningProgressLoading] = useState(true);
const [learningProgressSaving, setLearningProgressSaving] = useState(false);
const [learningProgressError, setLearningProgressError] = useState("");
const [learningProgressSaved, setLearningProgressSaved] = useState(false);
const [learningUserId, setLearningUserId] = useState<string | null>(null);
const [learningProgressMessage, setLearningProgressMessage] = useState("");  
const [activeLesson, setActiveLesson] = useState<{
  moduleId: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonIndex: number;
} | null>(null);
  
  const activeLessonRef = useRef<HTMLDivElement | null>(null);

  

useEffect(() => {
  let ignore = false;

  const loadLearningProgress = async () => {
    setLearningProgressLoading(true);
    setLearningProgressError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message);
      }

      if (!user) {
        return;
      }

      if (!ignore) {
        setLearningUserId(user.id);
      }

      const { data, error } = await supabase
        .from("learning_progress")
        .select("module_id, progress")
        .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
      }

      const savedProgress = Object.fromEntries(
        (data ?? []).map((row) => [
          String(row.module_id),
          Number(row.progress ?? 0),
        ])
      );

      if (!ignore) {
        setLearningProgress((current) => ({
          ...current,
          ...savedProgress,
        }));
      }
    } catch (error) {
      if (!ignore) {
        setLearningProgressError(
          error instanceof Error
            ? error.message
            : t.learning.learningProgressError
        );
      }
    } finally {
      if (!ignore) {
        setLearningProgressLoading(false);
      }
    }
  };

  loadLearningProgress();

  return () => {
    ignore = true;
  };
}, [t.learning.learningProgressError]);

  const modulesWithProgress = modules.map((module) => ({
  ...module,
  progress: learningProgress[module.id] ?? module.progress,
}));

const totalProgress = Math.round(
  modulesWithProgress.reduce((sum, module) => sum + module.progress, 0) /
    modulesWithProgress.length
);

const completedModules = modulesWithProgress.filter(
  (module) => module.progress >= 100
).length;

const totalLessons = modulesWithProgress.reduce(
  (sum, module) => sum + module.lessons.length,
  0
);

const activeModule =
  modulesWithProgress.find((module) => module.id === activeModuleId) ??
  modulesWithProgress[0];

const nextLessonIndex = activeModule
  ? Math.min(
      Math.floor((activeModule.progress / 100) * activeModule.lessons.length),
      activeModule.lessons.length - 1
    )
  : 0;

const nextLesson = activeModule?.lessons[nextLessonIndex] ?? "";
const activeLessonContent = activeLesson
  ? getLessonContent(activeLesson.moduleId, activeLesson.lessonIndex)
  : null;
const getModuleStatusByProgress = (module: LearningModule) => {
  if (module.progress >= 100) {
    return "completed" as LearningModuleStatus;
  }

  if (module.progress > 0) {
    return "in_progress" as LearningModuleStatus;
  }

  return "not_started" as LearningModuleStatus;
};

const handleOpenLesson = (module: LearningModule, lessonIndex: number) => {
  const safeLessonIndex = Math.max(
    0,
    Math.min(lessonIndex, module.lessons.length - 1)
  );

  const lessonTitle =
    module.lessons[safeLessonIndex] ?? module.lessons[0] ?? "";

  setActiveModuleId(module.id);

  setActiveLesson({
  moduleId: module.id,
  moduleTitle: module.title,
  lessonTitle,
  lessonIndex: safeLessonIndex + 1,
});

  window.setTimeout(() => {
    activeLessonRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 120);
};

const handleCompleteActiveLesson = async () => {
  if (!activeModule || !activeLesson) {
    return;
  }

  const lessonProgressStep = Math.ceil(100 / activeModule.lessons.length);
  const nextProgress = Math.min(
    100,
    Math.max(
      activeModule.progress,
      activeLesson.lessonIndex * lessonProgressStep
    )
  );

  const nextLessonArrayIndex = activeLesson.lessonIndex;
  const nextLessonTitle = activeModule.lessons[nextLessonArrayIndex];

  setLearningProgress((current) => ({
    ...current,
    [activeModule.id]: nextProgress,
  }));

  setLearningProgressSaving(true);
  setLearningProgressSaved(false);
  setLearningProgressError("");
  setLearningProgressMessage("");

  try {
    const userId = learningUserId;

    if (!userId) {
      throw new Error(t.learning.learningProgressError);
    }

    const completedLessons = activeModule.lessons.slice(
      0,
      activeLesson.lessonIndex
    );

    const { error } = await supabase.from("learning_progress").upsert(
      {
        user_id: userId,
        module_id: activeModule.id,
        progress: nextProgress,
        completed_lessons: completedLessons,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,module_id",
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    setLearningProgressSaved(true);

if (nextLessonTitle) {
  setLearningProgressMessage(t.learning.lessonAutoAdvanced);

  setActiveLesson({
  moduleId: activeModule.id,
  moduleTitle: activeModule.title,
  lessonTitle: nextLessonTitle,
  lessonIndex: nextLessonArrayIndex + 1,
});
} else {
  setLearningProgressMessage(t.learning.moduleCompletedMessage);
}
  } catch (error) {
    setLearningProgressError(
      error instanceof Error
        ? error.message
        : t.learning.learningProgressError
    );
  } finally {
    setLearningProgressSaving(false);
  }
};

  

  return (
    <div>
      <>
  <SectionHeader title={t.learning.title} text={t.learning.text} />

  <div className="mt-5 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.06] p-5">
    <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/55">
      {t.learning.learningNoteTitle}
    </div>

    <p className="mt-3 max-w-4xl text-sm leading-7 text-cyan-50/65">
      {t.learning.learningNoteText}
    </p>
  </div>
</>

      <div className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            {t.learning.overviewLabel}
          </div>
{learningProgressLoading && (
  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/45">
    <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-200/70" />
    {t.learning.learningProgressLoading}
  </div>
)}

{learningProgressError && (
  <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3">
    <div className="text-xs font-medium text-red-50">
      {t.learning.learningProgressError}
    </div>

    <div className="mt-1 text-xs leading-5 text-red-100/60">
      {learningProgressError}
    </div>
  </div>
)}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:gap-4">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.learning.totalProgressLabel}
              </div>

              <div className="mt-3 text-3xl font-semibold text-white">
                {totalProgress}%
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.learning.modulesLabel}
              </div>

              <div className="mt-3 text-3xl font-semibold text-white">
                {completedModules}/{modules.length}
              </div>

              <div className="mt-2 text-sm text-white/45">
                {t.learning.completedStatus}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.learning.lessonsLabel}
              </div>

              <div className="mt-3 text-3xl font-semibold text-white">
                {totalLessons}
              </div>

              <div className="mt-2 text-sm text-white/45">
                {t.learning.modulesLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/10 p-6">
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/60">
            {t.learning.activeModuleLabel}
          </div>

          {activeModule ? (
            <>
              <h3 className="mt-4 text-2xl font-semibold text-white">
                {activeModule.title}
              </h3>

              <p className="mt-3 text-sm leading-7 text-cyan-50/60">
                {activeModule.text}
              </p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-3xl border border-cyan-100/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/45">
                    {t.learning.nextLessonLabel}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-white">
                    {nextLesson}
                  </div>
                </div>

                <div className="rounded-3xl border border-cyan-100/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/45">
                    {t.learning.progressLabel}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-white">
                    {activeModule.progress}%
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm leading-7 text-cyan-50/60">
              {t.learning.selectedModuleHint}
            </p>
          )}
        </div>
      </div>

{activeLesson && (
  <div
    ref={activeLessonRef}
    className="mt-6 rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/[0.06] p-6"
  >
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/60">
          {t.learning.lessonViewerLabel}
        </div>

        <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
  {activeLesson.lessonTitle}
</h3>

        <p className="mt-2 text-sm leading-7 text-cyan-50/60">
          {activeLesson.moduleTitle} · {activeLesson.lessonIndex}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setActiveLesson(null)}
        className="w-full rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white md:w-auto"
      >
        {t.learning.lessonCloseButton}
      </button>
    </div>

    {activeLessonContent && (
  <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/50">
        Материал урока
      </div>

      <p className="mt-4 text-sm leading-7 text-white/65">
        {activeLessonContent.intro}
      </p>

      <div className="mt-5 grid gap-3">
        {activeLessonContent.blocks.map((block) => (
          <div
            key={block.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <h4 className="text-sm font-semibold text-white">
              {block.title}
            </h4>

            <p className="mt-2 text-sm leading-7 text-white/55">
              {block.text}
            </p>
          </div>
        ))}
      </div>
    </div>

    <div className="space-y-4">
  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
    <div className="text-xs uppercase tracking-[0.22em] text-white/35">
      Чеклист
    </div>

    <div className="mt-4 grid gap-2">
      {activeLessonContent.checklist.map((item) => (
        <div
          key={item}
          className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/60"
        >
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-[10px] text-cyan-100">
            ✓
          </span>

          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>

  <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
    <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/55">
      Завершение урока
    </div>

    <p className="mt-4 text-sm leading-7 text-cyan-50/70">
      Изучи материал и чеклист. Когда будешь готов, отметь урок пройденным.
    </p>

    <button
      type="button"
      onClick={handleCompleteActiveLesson}
      disabled={learningProgressSaving || !learningUserId}
      className="mt-5 w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {learningProgressSaving
        ? t.learning.learningProgressSaving
        : activeModule && activeModule.progress >= 100
          ? t.learning.lessonCompletedButton
          : t.learning.markLessonCompletedButton}
    </button>

    <p className="mt-3 text-xs leading-5 text-cyan-50/45">
      {learningProgressSaved
        ? learningProgressMessage || t.learning.learningProgressSaved
        : t.learning.frontendProgressNote}
    </p>
  </div>
</div>
  </div>
)}
  </div>
)}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {modulesWithProgress.map((module) => (
          <div
            key={module.id}
            className={`rounded-[1.5rem] border p-4 transition hover:border-white/20 hover:bg-white/[0.05] sm:rounded-[2rem] sm:p-6 ${
              activeModuleId === module.id
                ? "border-cyan-300/30 bg-cyan-300/10"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                  {module.level}
                </div>

                <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
  {module.title}
</h3>
              </div>

              <div
                className={`rounded-full border px-4 py-2 text-xs font-medium ${
                  getModuleStatusByProgress(module) === "completed"
                    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                    : getModuleStatusByProgress(module) === "in_progress"
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.04] text-white/55"
                }`}
              >
                {getLearningStatusLabel(getModuleStatusByProgress(module), t)}
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/55 sm:leading-7">
  {module.text}
</p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {t.learning.estimatedTimeLabel}
                </div>

                <div className="mt-2 text-sm font-medium text-white">
                  {module.estimatedTime}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {t.learning.progressLabel}
                </div>

                <div className="mt-2 text-sm font-medium text-white">
                  {module.progress}%
                </div>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${module.progress}%` }}
              />
            </div>

            <div className="mt-4 grid gap-1.5">
  {module.lessons.map((lesson, index) => {
    const lessonCompleted =
      module.progress === 100 ||
      index < Math.floor((module.progress / 100) * module.lessons.length);

    const isActiveLesson =
      activeLesson?.moduleTitle === module.title &&
      activeLesson?.lessonIndex === index + 1;

    return (
      <button
        key={`${module.id}-${lesson}`}
        type="button"
        onClick={() => handleOpenLesson(module, index)}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          isActiveLesson
            ? "border-cyan-300/40 bg-cyan-300/10"
            : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.05]"
        }`}
      >
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
            lessonCompleted
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
              : isActiveLesson
              ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
              : "border-white/10 bg-white/[0.04] text-white/55"
          }`}
        >
          {lessonCompleted ? "✓" : index + 1}
        </div>

        <div className="min-w-0 text-[13px] leading-6 text-white/80">
          {lesson}
        </div>
      </button>
    );
  })}
</div>

            <button
  type="button"
  onClick={() => {
    const lessonIndex = Math.min(
      Math.floor((module.progress / 100) * module.lessons.length),
      module.lessons.length - 1
    );

    handleOpenLesson(module, lessonIndex);
  }}
  className={`mt-4 rounded-full px-4 py-2.5 text-sm font-medium transition ${
    module.status === "completed"
      ? "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
      : "bg-white text-black hover:scale-[1.02]"
  }`}
>
  {getLearningActionLabel(module.status, t)}
</button>
          </div>
        ))}
      </div>

      
    </div>
  );
}

function ReportsTab({
  trades,
  subscription,
  t,
}: {
  trades: Trade[];
  subscription: Subscription;
  t: (typeof dashboardDict)[Language];
}) {
    const [reportPeriod, setReportPeriod] = useState("all");
  const [reportMarket, setReportMarket] = useState("all");
  const [reportDirection, setReportDirection] = useState("all");
  const [reportSetup, setReportSetup] = useState("all");
  const reportPlanLimits = getPlanLimits(subscription.plan);
const canGenerateAiReports =
  subscription.active && canUseFeature(subscription.plan, "ai_reports");
  const [aiReportText, setAiReportText] = useState("");
const [aiReportLoading, setAiReportLoading] = useState(false);
const [aiReportError, setAiReportError] = useState("");
const [aiReportActionMessage, setAiReportActionMessage] = useState("");
const [aiReportsHistory, setAiReportsHistory] = useState<SavedAiReport[]>([]);
const [aiReportsHistoryLoading, setAiReportsHistoryLoading] = useState(true);
const [aiReportsHistoryError, setAiReportsHistoryError] = useState("");
const [selectedAiReport, setSelectedAiReport] = useState<SavedAiReport | null>(null);
const [reportsUserId, setReportsUserId] = useState<string | null>(null);
  
  const now = new Date();
  useEffect(() => {
  let active = true;

  const loadAiReportsHistory = async () => {
    setAiReportsHistoryLoading(true);
    setAiReportsHistoryError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!active) return;

    if (userError) {
      setAiReportsHistoryError(userError.message);
      setAiReportsHistoryLoading(false);
      return;
    }

    if (!user) {
      setReportsUserId(null);
      setAiReportsHistory([]);
      setAiReportsHistoryLoading(false);
      return;
    }

    setReportsUserId(user.id);

    const { data, error } = await supabase
      .from("ai_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (!active) return;

    if (error) {
      setAiReportsHistoryError(error.message);
      setAiReportsHistoryLoading(false);
      return;
    }

    const reports = (data ?? []) as SavedAiReport[];
    setAiReportsHistory(reports);

    if (!selectedAiReport && reports.length > 0) {
      setSelectedAiReport(reports[0]);
    }

    setAiReportsHistoryLoading(false);
  };

  loadAiReportsHistory();

  return () => {
    active = false;
  };
}, []);

  const getTradeDate = (trade: Trade) => {
  const rawDate = trade.trade_date || trade.created_at;

    if (!rawDate) {
      return null;
    }

    const date = new Date(rawDate);

    return Number.isNaN(date.getTime()) ? null : date;
  };

  const isTradeInsideSelectedPeriod = (trade: Trade) => {
    if (reportPeriod === "all") {
      return true;
    }

    const tradeDate = getTradeDate(trade);

    if (!tradeDate) {
      return false;
    }

    const diffMs = now.getTime() - tradeDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (reportPeriod === "7d") {
      return diffDays <= 7;
    }

    if (reportPeriod === "30d") {
      return diffDays <= 30;
    }

    if (reportPeriod === "90d") {
      return diffDays <= 90;
    }

    return true;
  };

  const marketOptions = Array.from(
    new Set(trades.map((trade) => trade.market).filter(Boolean))
  );

  const setupOptions = Array.from(
    new Set(
      trades
        .map((trade) => trade.setup?.trim())
        .filter((setup): setup is string => Boolean(setup))
    )
  );

  const filteredTrades = trades.filter((trade) => {
    const matchesPeriod = isTradeInsideSelectedPeriod(trade);
    const matchesMarket =
      reportMarket === "all" || trade.market === reportMarket;
    const matchesDirection =
      reportDirection === "all" || trade.direction === reportDirection;
    const matchesSetup =
      reportSetup === "all" || trade.setup?.trim() === reportSetup;

    return matchesPeriod && matchesMarket && matchesDirection && matchesSetup;
  });
    const pnlValues = filteredTrades
    .map((trade) => trade.pnl)
    .filter((pnl): pnl is number => pnl !== null);

  const totalTrades = filteredTrades.length;
  const closedTrades = filteredTrades.filter(
    (trade) => trade.result === "win" || trade.result === "loss"
  );
  const wins = filteredTrades.filter((trade) => trade.result === "win").length;
  const losses = filteredTrades.filter((trade) => trade.result === "loss").length;

  const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);
  const averagePnl = pnlValues.length > 0 ? totalPnl / pnlValues.length : 0;

  const grossProfit = pnlValues
    .filter((pnl) => pnl > 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const grossLoss = pnlValues
    .filter((pnl) => pnl < 0)
    .reduce((sum, pnl) => sum + pnl, 0);

  const profitFactor =
    grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;

  const winRate =
    closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;

  const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
  const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

  const longTrades = filteredTrades.filter((trade) => trade.direction === "long");
  const shortTrades = filteredTrades.filter(
    (trade) => trade.direction === "short"
  );

  const longPnl = longTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const shortPnl = shortTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);

  const marketStats = Object.entries(
    filteredTrades.reduce<Record<string, { count: number; pnl: number }>>(
      (acc, trade) => {
        const key = trade.market || "Unknown";

        if (!acc[key]) {
          acc[key] = { count: 0, pnl: 0 };
        }

        acc[key].count += 1;
        acc[key].pnl += trade.pnl ?? 0;

        return acc;
      },
      {}
    )
  ).sort((a, b) => b[1].count - a[1].count);

  const setupStats = Object.entries(
    filteredTrades.reduce<Record<string, { count: number; pnl: number }>>(
      (acc, trade) => {
        const key = trade.setup?.trim() || "No setup";

        if (!acc[key]) {
          acc[key] = { count: 0, pnl: 0 };
        }

        acc[key].count += 1;
        acc[key].pnl += trade.pnl ?? 0;

        return acc;
      },
      {}
    )
  )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const mistakeStats = Object.entries(
    filteredTrades.reduce<Record<string, number>>((acc, trade) => {
      const key = trade.mistake?.trim();

      if (!key) {
        return acc;
      }

      acc[key] = (acc[key] ?? 0) + 1;

      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const equityCurveData = buildEquityCurveData(filteredTrades);
const selectedPeriodLabel =
  reportPeriod === "7d"
    ? t.reports.period7d
    : reportPeriod === "30d"
      ? t.reports.period30d
      : reportPeriod === "90d"
        ? t.reports.period90d
        : t.reports.periodAll;

const selectedMarketLabel =
  reportMarket === "all" ? t.reports.allMarkets : reportMarket;

const selectedDirectionLabel =
  reportDirection === "all" ? t.reports.allDirections : reportDirection;

const selectedSetupLabel =
  reportSetup === "all" ? t.reports.allSetups : reportSetup;

const hasActiveReportFilters =
  reportPeriod !== "all" ||
  reportMarket !== "all" ||
  reportDirection !== "all" ||
  reportSetup !== "all";

  

const currentReportSummary = {
  totalTrades,
  totalPnl,
  winRate,
  averagePnl,
  profitFactor,
  bestTrade,
  worstTrade,
  longTrades: longTrades.length,
  shortTrades: shortTrades.length,
  longPnl,
  shortPnl,
};

const handleGenerateAiReport = async () => {
  if (!canGenerateAiReports) {
  setAiReportError(t.reports.aiReportUpgradeRequired);
  return;
}
  if (filteredTrades.length === 0) {
    return;
  }

  setAiReportLoading(true);
  setAiReportText("");
  setAiReportError("");

  try {
    const {
  data: { session },
} = await supabase.auth.getSession();

const response = await fetch("/api/reports/ai-report", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? ""}`,
  },
  body: JSON.stringify({
        filters: {
          period: selectedPeriodLabel,
          market: selectedMarketLabel,
          direction: selectedDirectionLabel,
          setup: selectedSetupLabel,
        },
        summary: {
          totalTrades,
          totalPnl,
          winRate,
          averagePnl,
          profitFactor,
          bestTrade,
          worstTrade,
          longTrades: longTrades.length,
          shortTrades: shortTrades.length,
          longPnl,
          shortPnl,
        },
        trades: filteredTrades.map((trade) => ({
          symbol: trade.ticker,
          market: trade.market,
          direction: trade.direction,
          result: trade.result,
          setup: trade.setup,
          mistake: trade.mistake,
          pnl: trade.pnl,
          trade_date: trade.trade_date,
        })),
      }),
    });

    const responseText = await response.text();
const data = responseText ? JSON.parse(responseText) : {};

    if (!response.ok) {
      throw new Error(data.error || t.reports.aiReportError);
    }

    const generatedReportText = data.report || "";
setAiReportText(generatedReportText);

if (generatedReportText && reportsUserId) {
  const reportToSave = {
    user_id: reportsUserId,
    report_text: generatedReportText,
    filters: {
      period: reportPeriod,
      periodLabel: selectedPeriodLabel,
      market: reportMarket,
      marketLabel: selectedMarketLabel,
      direction: reportDirection,
      directionLabel: selectedDirectionLabel,
      setup: reportSetup,
      setupLabel: selectedSetupLabel,
    },
    summary: currentReportSummary,
  };

  const handleDeleteAiReport = async (reportId: string) => {
  const { error } = await supabase
    .from("ai_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    setAiReportsHistoryError(error.message);
    return;
  }

  setAiReportsHistory((current) =>
    current.filter((report) => report.id !== reportId)
  );

  if (selectedAiReport?.id === reportId) {
    setSelectedAiReport(null);
    setAiReportText("");
  }
};

  const { data: savedReport, error: saveError } = await supabase
    .from("ai_reports")
    .insert(reportToSave)
    .select("*")
    .single();

  if (!saveError && savedReport) {
    const typedSavedReport = savedReport as SavedAiReport;
    setSelectedAiReport(typedSavedReport);
    setAiReportsHistory((current) => [typedSavedReport, ...current].slice(0, 12));
  }
}
  } catch (error) {
    setAiReportError(
      error instanceof Error ? error.message : t.reports.aiReportError
    );
  } finally {
    setAiReportLoading(false);
  }
};

const handleDeleteAiReport = async (reportId: string) => {
  setAiReportsHistoryError("");

  const { error } = await supabase
    .from("ai_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    setAiReportsHistoryError(error.message);
    return;
  }

  setAiReportsHistory((current) =>
    current.filter((report) => report.id !== reportId)
  );

  if (selectedAiReport?.id === reportId) {
    const nextReport = aiReportsHistory.find(
      (report) => report.id !== reportId
    );

    setSelectedAiReport(nextReport ?? null);
    setAiReportText(nextReport?.report_text ?? "");
  }
};

const handleCopyAiReport = async () => {
  if (!aiReportText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(aiReportText);
    setAiReportActionMessage(t.reports.aiReportCopied);

    window.setTimeout(() => {
      setAiReportActionMessage("");
    }, 2200);
  } catch {
    setAiReportActionMessage(t.reports.aiReportCopyFailed);
  }
};

const handleDownloadAiReport = () => {
  if (!aiReportText) {
    return;
  }

  const reportDate = new Date().toISOString().slice(0, 10);
  const fileName = `skilledge-ai-report-${reportDate}.txt`;

  const blob = new Blob([aiReportText], {
    type: "text/plain;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setAiReportActionMessage(t.reports.aiReportDownloaded);

  window.setTimeout(() => {
    setAiReportActionMessage("");
  }, 2200);
};

  const reportCards = [
    {
      label: t.reports.totalTrades,
      value: totalTrades,
      helper: t.reports.totalTradesHelper,
    },
    {
      label: t.reports.totalPnl,
      value: `$${totalPnl.toFixed(2)}`,
      helper: t.reports.totalPnlHelper,
    },
    {
      label: t.reports.winRate,
      value: `${winRate}%`,
      helper: `${wins}W / ${losses}L`,
    },
    {
      label: t.reports.averagePnl,
      value: `$${averagePnl.toFixed(2)}`,
      helper: t.reports.averagePnlHelper,
    },
    {
      label: t.reports.profitFactor,
      value: profitFactor ? profitFactor.toFixed(2) : "—",
      helper: t.reports.profitFactorHelper,
    },
    {
      label: t.reports.bestWorst,
      value: `$${bestTrade.toFixed(2)} / $${worstTrade.toFixed(2)}`,
      helper: t.reports.bestWorstHelper,
    },
  ];

  return (
    <div>
      <SectionHeader title={t.reports.title} text={t.reports.text} />
      <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              {t.reports.filtersTitle}
            </div>

            <p className="mt-2 text-sm leading-6 text-white/50">
              {t.reports.filtersText}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setReportPeriod("all");
              setReportMarket("all");
              setReportDirection("all");
              setReportSetup("all");
            }}
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            {t.reports.resetFilters}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/35">
              {t.reports.periodFilter}
            </div>

            <select
              value={reportPeriod}
              onChange={(event) => setReportPeriod(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
            >
              <option value="all">{t.reports.periodAll}</option>
              <option value="7d">{t.reports.period7d}</option>
              <option value="30d">{t.reports.period30d}</option>
              <option value="90d">{t.reports.period90d}</option>
            </select>
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/35">
              {t.reports.marketFilter}
            </div>

            <select
              value={reportMarket}
              onChange={(event) => setReportMarket(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
            >
              <option value="all">{t.reports.allMarkets}</option>
              {marketOptions.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/35">
              {t.reports.directionFilter}
            </div>

            <select
              value={reportDirection}
              onChange={(event) => setReportDirection(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
            >
              <option value="all">{t.reports.allDirections}</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/35">
              {t.reports.setupFilter}
            </div>

            <select
              value={reportSetup}
              onChange={(event) => setReportSetup(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
            >
              <option value="all">{t.reports.allSetups}</option>
              {setupOptions.map((setup) => (
                <option key={setup} value={setup}>
                  {setup}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/50">
    {t.reports.filteredTrades}: {filteredTrades.length} / {trades.length}
  </div>

  <div className="flex flex-wrap gap-2">
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
      {selectedPeriodLabel}
    </span>

    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
      {selectedMarketLabel}
    </span>

    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
      {selectedDirectionLabel}
    </span>

    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
      {selectedSetupLabel}
    </span>
  </div>
</div>
      </div>
      <div className="mt-6 rounded-[2rem] border border-cyan-300/20 bg-cyan-500/[0.08] p-6">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/55">
        {t.reports.aiReportLabel}
      </div>

      <h3 className="mt-3 text-2xl font-semibold text-white">
        {t.reports.aiReportTitle}
      </h3>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/70">
        {t.reports.aiReportText}
      </p>
    </div>

    <button
      type="button"
      onClick={handleGenerateAiReport}
      disabled={
  aiReportLoading || filteredTrades.length === 0 || !canGenerateAiReports
}
      className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
    >
      {!canGenerateAiReports
  ? t.reports.upgradeForAiReports
  : aiReportLoading
    ? t.reports.aiReportGenerating
    : t.reports.generateAiReport}
    </button>
  </div>

  {!canGenerateAiReports && (
  <div className="mt-5 rounded-[1.5rem] border border-amber-300/20 bg-amber-400/10 p-4">
    <div className="text-xs uppercase tracking-[0.22em] text-amber-100/60">
      SkillEdge AI
    </div>

    <div className="mt-2 text-sm leading-6 text-amber-50/80">
      {t.reports.aiReportLockedText}
    </div>

    <div className="mt-3 text-xs text-amber-50/55">
      {t.reports.aiReportPlanHint}: {reportPlanLimits.aiReportsPerMonth}
    </div>
  </div>
)}

  <div className="mt-5 flex flex-wrap gap-2">
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      {selectedPeriodLabel}
    </div>
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      {selectedMarketLabel}
    </div>
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      {selectedDirectionLabel}
    </div>
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
      {selectedSetupLabel}
    </div>
  </div>

{aiReportActionMessage && (
  <div className="mt-5 rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-4">
    <div className="text-xs uppercase tracking-[0.22em] text-emerald-100/60">
      SkillEdge AI
    </div>

    <div className="mt-2 text-sm leading-6 text-emerald-50/80">
      {aiReportActionMessage}
    </div>
  </div>
)}

  {aiReportError && (
    <div className="mt-5 rounded-[1.5rem] border border-red-400/25 bg-red-500/10 p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-red-200/70">
        SkillEdge AI
      </div>
      <div className="mt-2 text-sm leading-6 text-red-100/80">
        {aiReportError}
      </div>
    </div>
  )}

  <div className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr] xl:gap-6">
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:rounded-[1.75rem] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">
            {t.reports.aiReportResultLabel}
          </div>

          <h4 className="mt-2 text-xl font-semibold text-white">
            {selectedAiReport
              ? t.reports.savedAiReportTitle
              : t.reports.latestAiReportTitle}
          </h4>
        </div>

        <div className="flex flex-wrap gap-2">
  {selectedAiReport?.created_at && (
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65">
      {new Date(selectedAiReport.created_at).toLocaleString()}
    </div>
  )}

  <button
    type="button"
    onClick={handleCopyAiReport}
    disabled={!aiReportText}
    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {t.reports.copyAiReport}
  </button>

  <button
    type="button"
    onClick={handleDownloadAiReport}
    disabled={!aiReportText}
    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {t.reports.downloadAiReport}
  </button>
</div>
      </div>

      <div className="mt-5">
        {aiReportLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-[1.25rem] border border-white/10 bg-white/[0.04]"
              />
            ))}
          </div>
        ) : aiReportText ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <AiReport text={aiReportText} />
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/60">
            {t.reports.aiReportPlaceholder}
          </div>
        )}
      </div>
    </div>

    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:rounded-[1.75rem] sm:p-5">
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">
          {t.reports.aiReportHistoryLabel}
        </div>

        <h4 className="mt-2 text-xl font-semibold text-white">
          {t.reports.aiReportHistoryTitle}
        </h4>

        <p className="mt-2 text-sm leading-6 text-white/55">
          {t.reports.aiReportHistoryText}
        </p>

        <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {aiReportsHistoryLoading ? (
            [0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-[1.25rem] border border-white/10 bg-white/[0.04]"
              />
            ))
          ) : aiReportsHistoryError ? (
            <div className="rounded-[1.25rem] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
              {aiReportsHistoryError}
            </div>
          ) : aiReportsHistory.length === 0 ? (
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">
              {t.reports.aiReportHistoryEmpty}
            </div>
          ) : (
            aiReportsHistory.map((report) => (
              <div
  key={report.id}
  className={`rounded-[1.25rem] border p-4 transition ${
    selectedAiReport?.id === report.id
      ? "border-cyan-300/30 bg-cyan-300/10"
      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
  }`}
>
  <button
    type="button"
    onClick={() => {
      setSelectedAiReport(report);
      setAiReportText(report.report_text);
    }}
    className="w-full text-left"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">
          {new Date(report.created_at).toLocaleString()}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
            {report.filters?.periodLabel || t.reports.allPeriods}
          </span>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
            {report.filters?.marketLabel || t.reports.allMarkets}
          </span>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
            {report.filters?.directionLabel || t.reports.allDirections}
          </span>
        </div>
      </div>

      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
        {report.summary?.totalTrades ?? 0}
      </div>
    </div>
  </button>

  <button
    type="button"
    onClick={() => handleDeleteAiReport(report.id)}
    className="mt-3 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-100/70 transition hover:bg-red-500/20 hover:text-red-50"
  >
    {t.reports.deleteAiReport}
  </button>
</div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">
          {t.reports.currentSummaryLabel}
        </div>

        <div className="mt-4 grid gap-3">
          <MetricCard
            label={t.reports.totalTrades}
            value={String(totalTrades)}
          />
          <MetricCard
            label={t.reports.totalPnl}
            value={`$${totalPnl.toFixed(2)}`}
          />
          <MetricCard
            label={t.reports.winRate}
            value={`${winRate}%`}
          />
          <MetricCard
            label={t.reports.averagePnl}
            value={`$${averagePnl.toFixed(2)}`}
          />
        </div>
      </div>
    </div>
  </div>
</div>
      {filteredTrades.length === 0 ? (
  <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
    <div className="text-xs uppercase tracking-[0.25em] text-white/35">
      SkillEdge AI
    </div>

    <h3 className="mt-4 text-2xl font-semibold text-white">
      {trades.length === 0
        ? t.reports.emptyTitle
        : t.reports.noFilteredTradesTitle}
    </h3>

    <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
      {trades.length === 0
        ? t.reports.emptyText
        : t.reports.noFilteredTradesText}
    </p>

    {trades.length > 0 && hasActiveReportFilters && (
      <button
        type="button"
        onClick={() => {
          setReportPeriod("all");
          setReportMarket("all");
          setReportDirection("all");
          setReportSetup("all");
        }}
        className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:scale-[1.02]"
      >
        {t.reports.resetFilters}
      </button>
    )}
  </div>
) : (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reportCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="text-xs uppercase tracking-[0.22em] text-white/35">
                  {card.label}
                </div>

                <div className="mt-4 text-3xl font-semibold text-white">
                  {card.value}
                </div>

                <div className="mt-3 text-sm leading-6 text-white/45">
                  {card.helper}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                    {t.reports.equityTitle}
                  </div>

                  <h3 className="mt-3 text-2xl font-semibold text-white">
                    {t.reports.equitySubtitle}
                  </h3>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/50">
                  {equityCurveData.length} {t.reports.points}
                </div>
              </div>

              <div className="mt-6 h-[280px] min-h-[280px] w-full min-w-0">
  <ResponsiveContainer width="100%" height={280} minWidth={280} minHeight={280}>
                  <LineChart data={equityCurveData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15, 23, 42, 0.96)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "16px",
                        color: "white",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="rgba(103,232,249,0.9)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.07] p-6">
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/55">
                {t.reports.directionTitle}
              </div>

              <h3 className="mt-3 text-2xl font-semibold text-white">
                {t.reports.directionSubtitle}
              </h3>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    Long
                  </div>

                  <div className="mt-2 text-2xl font-semibold text-white">
                    {longTrades.length}
                  </div>

                  <div className="mt-1 text-sm text-white/50">
                    ${longPnl.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    Short
                  </div>

                  <div className="mt-2 text-2xl font-semibold text-white">
                    {shortTrades.length}
                  </div>

                  <div className="mt-1 text-sm text-white/50">
                    ${shortPnl.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <ReportListCard
              title={t.reports.marketBreakdown}
              items={marketStats.map(([label, value]) => ({
                label,
                value: `${value.count} / $${value.pnl.toFixed(2)}`,
              }))}
              empty={t.reports.noData}
            />

            <ReportListCard
              title={t.reports.setupBreakdown}
              items={setupStats.map(([label, value]) => ({
                label,
                value: `${value.count} / $${value.pnl.toFixed(2)}`,
              }))}
              empty={t.reports.noData}
            />

            <ReportListCard
              title={t.reports.mistakesBreakdown}
              items={mistakeStats.map(([label, value]) => ({
                label,
                value: String(value),
              }))}
              empty={t.reports.noData}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ReportListCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: { label: string; value: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.25em] text-white/35">
        {title}
      </div>

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
          {empty}
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="min-w-0 truncate text-sm text-white/70">
                {item.label}
              </div>

              <div className="shrink-0 text-sm font-medium text-white">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillingTab({
  subscription,
  t,
}: {
  subscription: Subscription;
  t: (typeof dashboardDict)[Language];
}) {
  const activePlan = normalizePlanId(subscription.plan);
  const activeLimits = getPlanLimits(activePlan);
const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<PlanId | null>(
  null
);
const [checkoutError, setCheckoutError] = useState("");
  const aiUsagePercent =
    subscription.aiLimit > 0
      ? Math.min(100, Math.round((subscription.aiUsed / subscription.aiLimit) * 100))
      : 0;

  const planOrder: PlanId[] = ["core", "edge", "elite"];

  const billingFeatures = [
    {
      label: t.billing.aiCoachLimit,
      value: activeLimits.aiCoachMessagesPerMonth.toLocaleString(),
    },
    {
      label: t.billing.journalAiLimit,
      value: activeLimits.journalAnalysesPerMonth.toLocaleString(),
    },
    {
      label: t.billing.chartAiLimit,
      value: activeLimits.chartAnalysesPerMonth.toLocaleString(),
    },
    {
      label: t.billing.aiReportsLimit,
      value: activeLimits.aiReportsPerMonth.toLocaleString(),
    },
    {
      label: t.billing.maxTradesLimit,
      value: activeLimits.maxTrades.toLocaleString(),
    },
    {
      label: t.billing.screenshotsLimit,
      value: activeLimits.maxScreenshotsPerTrade.toLocaleString(),
    },
  ];

  const accessFeatures = [
    {
      label: t.billing.aiReportsAccess,
      enabled: canUseFeature(activePlan, "ai_reports"),
    },
    {
      label: t.billing.supportAssistantAccess,
      enabled: canUseFeature(activePlan, "support_assistant"),
    },
    {
      label: t.billing.socialTickersAccess,
      enabled: canUseFeature(activePlan, "social_tickers"),
    },
    {
      label: t.billing.aiScannerAccess,
      enabled: canUseFeature(activePlan, "ai_scanner"),
    },
    {
      label: t.billing.premiumChartAccess,
      enabled: canUseFeature(activePlan, "premium_chart_analysis"),
    },
    {
      label: t.billing.exportReportsAccess,
      enabled: canUseFeature(activePlan, "export_reports"),
    },
  ];

  const handleChoosePlan = async (planId: PlanId) => {
  try {
    setCheckoutError("");
    setCheckoutLoadingPlan(planId);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setCheckoutError(t.billing.loginRequiredForPayment);
      return;
    }

    const response = await fetch("/api/create-crypto-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        planId,
        billingPeriod: "monthly",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setCheckoutError(data?.error || t.billing.checkoutError);
      return;
    }

    if (!data?.url) {
      setCheckoutError(t.billing.checkoutError);
      return;
    }

    window.location.href = data.url;
  } catch {
    setCheckoutError(t.billing.checkoutError);
  } finally {
    setCheckoutLoadingPlan(null);
  }
};

  return (
    <div>
      <SectionHeader title={t.billing.title} text={t.billing.text} />

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-500/[0.08] p-6">
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-100/55">
            {t.billing.currentPlanLabel}
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-3xl font-semibold text-white">
                {planNames[activePlan]}
              </h3>

              <p className="mt-2 text-sm leading-6 text-cyan-50/70">
                {subscription.active
                  ? t.billing.activeSubscription
                  : t.billing.inactiveSubscription}
              </p>
            </div>

            <div
              className={`rounded-full border px-4 py-2 text-xs font-medium ${
                subscription.active
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                  : "border-red-300/25 bg-red-400/10 text-red-100"
              }`}
            >
              {subscription.active ? t.billing.active : t.billing.inactive}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.billing.billingPeriod}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {subscription.period || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.billing.validUntil}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {t.billing.aiUsage}
                </div>

                <div className="mt-2 text-lg font-semibold text-white">
                  {subscription.aiUsed.toLocaleString()} /{" "}
                  {subscription.aiLimit.toLocaleString()}
                </div>
              </div>

              <div className="text-sm text-white/55">{aiUsagePercent}%</div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300"
                style={{ width: `${aiUsagePercent}%` }}
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-amber-100/60">
              {t.billing.billingNoteLabel}
            </div>

            <p className="mt-2 text-sm leading-6 text-amber-50/75">
              {t.billing.billingNoteText}
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6">
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">
            {t.billing.currentLimitsLabel}
          </div>

          <h3 className="mt-3 text-2xl font-semibold text-white">
            {t.billing.currentLimitsTitle}
          </h3>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {billingFeatures.map((feature) => (
              <div
                key={feature.label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                  {feature.label}
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {feature.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {accessFeatures.map((feature) => (
              <div
                key={feature.label}
                className={`rounded-2xl border p-4 ${
                  feature.enabled
                    ? "border-emerald-300/20 bg-emerald-400/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">
                    {feature.label}
                  </div>

                  <div
                    className={`rounded-full px-3 py-1 text-xs ${
                      feature.enabled
                        ? "bg-emerald-300/15 text-emerald-100"
                        : "bg-white/10 text-white/45"
                    }`}
                  >
                    {feature.enabled ? t.billing.included : t.billing.locked}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {checkoutError && (
  <div className="mt-6 rounded-[1.5rem] border border-red-400/25 bg-red-500/10 p-4">
    <div className="text-xs uppercase tracking-[0.22em] text-red-200/70">
      NOWPayments
    </div>

    <div className="mt-2 text-sm leading-6 text-red-100/80">
      {checkoutError}
    </div>
  </div>
)}
      
      <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/40">
              {t.billing.comparePlansLabel}
            </div>

            <h3 className="mt-3 text-2xl font-semibold text-white">
              {t.billing.comparePlansTitle}
            </h3>
          </div>

          <div className="text-sm text-white/50">
            {t.billing.comparePlansText}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {planOrder.map((planId) => {
            const limits = PLAN_LIMITS[planId];
            const isCurrent = planId === activePlan;

            return (
              <div
                key={planId}
                className={`rounded-[1.75rem] border p-5 ${
                  isCurrent
                    ? "border-cyan-300/30 bg-cyan-300/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xl font-semibold text-white">
                      {planNames[planId]}
                    </h4>

                    <p className="mt-2 text-sm leading-6 text-white/55">
                      {t.billing.planDescriptions[planId]}
                    </p>
                  </div>

                  {isCurrent && (
                    <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                      {t.billing.current}
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  <BillingPlanRow
                    label={t.billing.aiCoachLimit}
                    value={limits.aiCoachMessagesPerMonth.toLocaleString()}
                  />
                  <BillingPlanRow
                    label={t.billing.journalAiLimit}
                    value={limits.journalAnalysesPerMonth.toLocaleString()}
                  />
                  <BillingPlanRow
                    label={t.billing.chartAiLimit}
                    value={limits.chartAnalysesPerMonth.toLocaleString()}
                  />
                  <BillingPlanRow
                    label={t.billing.aiReportsLimit}
                    value={limits.aiReportsPerMonth.toLocaleString()}
                  />
                  <BillingPlanRow
                    label={t.billing.maxTradesLimit}
                    value={limits.maxTrades.toLocaleString()}
                  />
                  <BillingPlanRow
                    label={t.billing.screenshotsLimit}
                    value={limits.maxScreenshotsPerTrade.toLocaleString()}
                  />
                </div>

                <button
  type="button"
  onClick={() => {
    if (!isCurrent) {
      handleChoosePlan(planId);
    }
  }}
  disabled={isCurrent || checkoutLoadingPlan === planId}
  className={`mt-6 w-full rounded-full px-5 py-3 text-sm font-medium transition ${
    isCurrent
      ? "cursor-default bg-white/10 text-white/50"
      : "bg-white text-black hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-white/40"
  }`}
>
  {isCurrent
    ? t.billing.currentPlan
    : checkoutLoadingPlan === planId
      ? t.billing.creatingCheckout
      : t.billing.choosePlan}
</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BillingPlanRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-sm text-white/55">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
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

    <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
      {history.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/45">
          {t.coach.historyEmpty}
        </div>
      ) : (
        history.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onMessageChange(item.user_message ?? "");
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
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*/g, "")
    .trim();

  const rawSections = normalizedText
    .split(/\n(?=#{1,6}\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const sections =
    rawSections.length > 0
      ? rawSections
      : normalizedText
          .split(/\n\n+/g)
          .map((section) => section.trim())
          .filter(Boolean);

  return (
    <div className="space-y-4">
      {sections.map((section, sectionIndex) => {
        const lines = section
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const firstLine = lines[0] ?? "";
        const hasMarkdownHeading = /^#{1,6}\s+/.test(firstLine);

        const title = hasMarkdownHeading
          ? firstLine.replace(/^#{1,6}\s+/, "").trim()
          : sectionIndex === 0
            ? firstLine
            : "";

        const bodyLines = hasMarkdownHeading
          ? lines.slice(1)
          : sectionIndex === 0
            ? lines.slice(1)
            : lines;

        const bullets = bodyLines
          .filter((line) => /^[-•]\s+/.test(line))
          .map((line) => line.replace(/^[-•]\s+/, "").trim());

        const paragraphs = bodyLines.filter((line) => !/^[-•]\s+/.test(line));

        return (
          <div
            key={`${title}-${sectionIndex}`}
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
          >
            {title && (
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-xs text-cyan-100">
                  {sectionIndex + 1}
                </div>

                <h5 className="text-base font-semibold leading-7 text-white">
                  {title}
                </h5>
              </div>
            )}

            {paragraphs.length > 0 && (
              <div className={title ? "mt-4 space-y-3" : "space-y-3"}>
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={`${paragraph}-${index}`}
                    className="text-sm leading-7 text-white/65"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {bullets.length > 0 && (
              <div className={title || paragraphs.length > 0 ? "mt-4 grid gap-2" : "grid gap-2"}>
                {bullets.map((bullet, index) => (
                  <div
                    key={`${bullet}-${index}`}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white/65"
                  >
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-[10px] text-cyan-100">
                      ✓
                    </span>

                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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

function PlaceholderBlock({
  title,
  text,
}: {
  title: string;
  text?: string;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-6">
      <h3 className="text-xl font-semibold">{title}</h3>

      {text && (
        <p className="mt-3 text-sm leading-7 text-white/55">
          {text}
        </p>
      )}
    </div>
  );
}