"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { authFetch } from "@/lib/security/client-auth-fetch";
import {
  PLAN_LIMITS,
  canUseFeature,
  getPlanLimits,
  normalizePlanId,
} from "@/lib/plan-limits";

import TelegramSignalsConnectButton from "@/components/dashboard/TelegramSignalsConnectButton";

type Language = "en" | "ru" | "ua";

type TabId =
  | "overview"
  | "journal"
  | "charts"
  | "market"
  | "alerts"
  | "coach"
  | "learning"
  | "reports"
  | "billing";

type PlanId = "core" | "edge" | "elite";
type BillingPeriod = "monthly" | "halfyear" | "yearly";
type AlertAssetFilter = "all" | "stock" | "crypto";

function normalizeAlertAssetFilter(value: string | null | undefined): AlertAssetFilter {
  const normalized = (value || "all").toLowerCase();

  if (["crypto", "coin", "coins"].includes(normalized)) return "crypto";
  if (["stock", "stocks", "equity", "equities"].includes(normalized)) return "stock";

  return "all";
}

function getAlertAssetFilterUrlValue(filter: AlertAssetFilter) {
  return filter === "all" ? "all" : filter;
}

function isAlertInAssetFilter(alert: DashboardMarketAlert, filter: AlertAssetFilter) {
  if (filter === "all") return true;
  return filter === "crypto" ? alert.asset_type === "crypto" : alert.asset_type !== "crypto";
}

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
  source_alert_id?: string | null;
source_setup_slug?: string | null;
source_setup_name?: string | null;
alert_confidence_score?: number | null;
alert_confidence_tier?: string | null;
alert_entry_zone_min?: number | null;
alert_entry_zone_max?: number | null;
alert_stop_price?: number | null;
alert_target_1?: number | null;
alert_target_2?: number | null;
alert_target_3?: number | null;
alert_plan?: Record<string, unknown> | null;
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
    askAI: "Ask AI Coach",
    createReport: "Create report",
    overview: {
      title: "Performance overview",
      text: "PnL summary, win rate, discipline score, best setups and main mistakes.",
      pnlMonth: "Monthly PnL",
      winRate: "Win rate",
      discipline: "Discipline score",
      weeklyAi: "Weekly AI summary",
      weeklyAiText:
        "SkillEdge AI summarizes your journal, risk behavior, discipline and recurring mistakes into a focused weekly review.",
    },
    charts: {
      title: "TradingView charts",
      text: "Embedded TradingView chart for ticker analysis, levels and setups.",
      placeholder: "TradingView workspace is available inside the Charts module.",
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
      moversGainers: "Top gainers",
      moversLosers: "Top losers",
      moversCollapse: "Collapse",
      moversExpand: "Expand",
      moversName: "Name",
      moversPercentChange: "% change",
      moversLoading: "Loading movers...",
      moversEmpty: "No instruments for this filter.",
      moversStocksNeedKey:
        "Stock movers are being prepared for premium market data coverage.",
      chartAnalysisTitle: "AI chart analysis",
      chartAnalysisText:
        "SkillEdge AI analyzes the current symbol, timeframe, market data, candles, volume and risk context.",
      chartAnalysisLoading: "Analyzing current chart...",
      chartAnalysisError: "Failed to analyze current chart.",
      chartAnalysisEmpty: "Run AI analysis to see the current chart breakdown.",
      chartAnalysisClose: "Close",
      chartAnalysisSymbol: "Symbol",
      chartAnalysisInterval: "Timeframe",
      chartAnalysisReportLabel: "SkillEdge AI Report",
      chartAnalysisDataLabel: "Market structure report",
      chartAnalysisSectionsLabel: "Analysis sections",
      marketDataUnavailableTitle: "Market data unavailable",
      marketDataUnavailableText:
        "SkillEdge AI could not load market data for this symbol on the current data plan. Try a more liquid ticker such as AAPL, TSLA, NVDA, SPY or QQQ.",
      marketDataPremiumTitle: "Premium market data required",
      marketDataPremiumText:
  "This symbol, timeframe or data endpoint may require a higher market data plan. SkillEdge AI uses premium market coverage where available.",
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
      learningNoteTitle: "Learning Center works as a refresher base",
      learningNoteText:
        "SkillEdge AI is primarily focused on trade journaling, chart analysis, AI review and building a trading system. This section is a compact knowledge base for refreshing key concepts so clients can better understand risk, setups, market structure and AI analysis logic.",
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
      lockedLabel: "Requires access",
      estimatedTimeLabel: "Estimated time",
      levelLabel: "Level",
      beginnerLevel: "Beginner",
      intermediateLevel: "Intermediate",
      advancedLevel: "Advanced",
      moduleOneTitle: "Market Basics",
      moduleOneText:
        "Understand how the market works, how orders interact and why liquidity matters.",
      moduleTwoTitle: "Technical Analysis",
      moduleTwoText:
        "Learn candles, levels, trend/range logic, volume and clean chart reading.",
      moduleThreeTitle: "Risk Management",
      moduleThreeText:
        "Build rules for risk per trade, stop loss, position sizing and risk/reward.",
      moduleFourTitle: "Intraday Momentum",
      moduleFourText:
        "Momentum logic, breakout, reclaim, failed breakout and continuation setups.",
      moduleFiveTitle: "Trading Psychology",
      moduleFiveText:
        "Control overtrading, revenge trading, fear, hesitation and impulsive entries.",
      moduleSixTitle: "Playbook / Setups",
      moduleSixText:
        "Turn repeated patterns into a structured trading playbook with entry triggers and invalidation rules.",
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
        "Additional specialized learning paths for deepening the trading system inside SkillEdge AI.",
      comingSoonButton: "Requires access",
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
        "This lesson is structured as a focused SkillEdge AI knowledge block. Review the key ideas, complete the practice task and connect the concept with your own trades.",
      lessonKeyPointsLabel: "Key points",
      lessonPracticeLabel: "Practice task",
      lessonPracticeText:
        "Review the concept, find one chart example and write what confirms or invalidates the idea.",
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
      extraModuleThreeTitle: "Advanced module 3",
      extraModuleThreeText:
        "This module is reserved for the next specialized training block.",
      extraModuleFourTitle: "Advanced module 4",
      extraModuleFourText:
        "This module is reserved for the next specialized training block.",
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
      placeholder:
        "Advanced performance reports are generated from your journal, filters and saved trade data.",
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
      profitFactor: "Profit Factor",
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
        "The AI report will appear here after generation and stay saved in history for future review.",
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
        "AI reports help review selected trades, find best setups, mistakes and the next focus area. This feature is available on SkillEdge Edge and SkillEdge Elite.",
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
        "Fill in the basic data, add screenshots and use AI review to evaluate each trade.",
      totalTrades: "Total trades",
      totalPnl: "Total PnL",
      winRate: "Win rate",
      avgPnl: "Avg PnL",
      grossProfit: "Gross profit",
      grossLoss: "Gross loss",
      bestTrade: "Best trade",
      worstTrade: "Worst trade",
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
      uploadScreenshotText:
        "Attach chart screenshots to your saved trades. SkillEdge AI uses them to analyze entries, exits, stops and repeated chart mistakes.",
      screenshotsCount: "screenshots",
      screenshotTradeLabel: "Trade",
      screenshotFileLabel: "Screenshot",
      screenshotChoose: "Choose screenshot",
      screenshotNoFile: "No file selected",
      screenshotSelected: "Selected file",
      screenshotHint:
        "Steps: 1) Select a trade  2) Click Choose screenshot  3) Click Upload",
      screenshotUploadHintCompact:
        "Upload 1 to 3 screenshots with different timeframes for a deeper analysis.",
      screenshotFormats: "Supported formats: PNG, JPG, WEBP",
      screenshotsColumn: "Screens",
      openScreenshots: "Open",
      noScreenshotsForTrade: "No screenshots uploaded for this trade.",
      screenshotViewerTitle: "Trade screenshots",
      loadingScreenshots: "Loading screenshots...",
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
        "Last 3 trades from your personal journal. Full table, filters and export are available below.",
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
      alerts: "Signals",
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
      text: "Information about your current plan, payments and subscription period.",
      activePlan: "Active plan",
      inactivePlan: "Plan is not active",
      period: "Period",
      validUntil: "Valid until",
      empty:
        "After payment, your plan, period, expiration date and payment history will appear here.",
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
        "Billing shows your current plan, limits, access level and subscription status. Card payments are being prepared through an approved merchant provider, while crypto access is available during launch.",
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
      aiAlertsAccess: "AI signals",
      premiumChartAccess: "Premium chart analysis",
      exportReportsAccess: "Report export",
      included: "Included",
      locked: "Locked",
      comparePlansLabel: "Comparison",
      comparePlansTitle: "Plan comparison",
      comparePlansText:
        "Make sure customers clearly see the difference between Core, Edge and Elite.",
      current: "Current",
      choosePlan: "Choose plan",
      planDescriptions: {
        core: "Basic access for journaling, screenshots, AI Coach and discipline control.",
        edge: "Advanced plan for active traders: more AI, reports, Market Intelligence and AI Scanner.",
        elite:
          "Maximum plan for serious work: AI signals, floating alerts widget, Signal-to-Journal workflow and full AI Trading Desk.",
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
      historyEmpty:
        "History is empty. Your first review will appear here after AI responds.",
      loginFirst: "Please log in first.",
      messageRequired: "Enter a question or trade description.",
      coachError: "AI Coach error.",
      error: "AI coach request failed.",
      failed: "Failed to get AI Coach response.",
      needPlan: "AI Coach requires an active plan or demo access.",
      limitReached:
        "AI request limit reached. Upgrade your plan or wait for the limit reset.",
    },
  },

  ru: {
    terminal: "Терминал SkillEdge AI",
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
    uploadScreenshot: "Загрузить скриншот",
    askAI: "Спросить AI-коуча",
    createReport: "Создать отчёт",
    overview: {
      title: "Обзор эффективности",
      text: "Сводка PnL, процент прибыльных сделок, оценка дисциплины, лучшие сетапы и главные ошибки.",
      pnlMonth: "PnL за месяц",
      winRate: "Процент прибыльных",
      discipline: "Оценка дисциплины",
      weeklyAi: "AI-сводка недели",
      weeklyAiText:
        "AI-сводка собирает ключевые выводы по журналу сделок, риску, дисциплине и повторяющимся ошибкам.",
    },
    charts: {
      title: "Графики TradingView",
      text: "Встроенный график TradingView для анализа тикеров, уровней и сетапов.",
      placeholder: "Рабочее пространство TradingView доступно внутри модуля графиков.",
      analyzeCurrentChart: "Проанализировать график",
      workspaceText: "Рабочая зона с графиком, списком наблюдения и лидерами движения рынка.",
      watchlistExamples: "Примеры списка наблюдения: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      openWatchlist: "Открыть список",
      hideWatchlist: "Скрыть список",
      watchlistTitle: "Список наблюдения",
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
      loadingWatchlist: "Загружаем список наблюдения...",
      emptyWatchlist: "Список пуст. Нажми + и добавь тикер.",
      removeFromWatchlist: "Удалить из списка",
      loginFirst: "Сначала войдите в аккаунт.",
      settingsLoadError: "Не удалось загрузить настройки графиков.",
      addTickerError: "Не удалось добавить тикер в список наблюдения.",
      removeTickerError: "Не удалось удалить тикер из списка наблюдения.",
      moversStocks: "Акции",
      moversCrypto: "Крипто",
      moversGainers: "Лидеры роста",
      moversLosers: "Лидеры падения",
      moversCollapse: "Свернуть",
      moversExpand: "Развернуть",
      moversName: "Название",
      moversPercentChange: "% изменения",
      moversLoading: "Загружаем лидеров движения...",
      moversEmpty: "Нет инструментов под этот фильтр.",
      moversStocksNeedKey:
        "Лидеры движения по акциям готовятся к подключению премиального покрытия рыночных данных.",
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
      chartAnalysisSectionsLabel: "Разделы анализа",
      marketDataUnavailableTitle: "Рыночные данные недоступны",
      marketDataUnavailableText:
        "SkillEdge AI не смог загрузить рыночные данные по этому тикеру на текущем тарифе данных. Попробуй более ликвидный тикер: AAPL, TSLA, NVDA, SPY или QQQ.",
      marketDataPremiumTitle: "Нужен премиум-доступ к рыночным данным",
      marketDataPremiumText:
  "Этот тикер, таймфрейм или источник данных может требовать более высокий тариф рыночных данных. SkillEdge AI использует премиальное рыночное покрытие там, где оно доступно.",
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
      text: "Структурное обучение трейдингу, сетапы, риск-менеджмент, психология и построение торгового плейбука.",
      learningNoteTitle: "Центр обучения работает как база повторения",
      learningNoteText:
        "SkillEdge AI в первую очередь сфокусирован на журнале сделок, анализе графиков, AI-разборе и развитии торговой системы. Этот раздел создан как короткая база для восстановления ключевых понятий, чтобы клиент быстрее понимал риск, сетапы, структуру рынка и логику AI-анализа.",
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
      moduleFourTitle: "Внутридневной импульс",
      moduleFourText:
        "Логика импульса, пробой, возврат уровня, ложный пробой и сетапы продолжения движения.",
      moduleFiveTitle: "Психология трейдинга",
      moduleFiveText:
        "Контроль переторговки, торговли из мести, страха, сомнений и импульсивных входов.",
      moduleSixTitle: "Плейбук / Сетапы",
      moduleSixText:
        "Превращай повторяющиеся паттерны в торговый плейбук с триггерами входа и условиями отмены идеи.",
      lessonMarketStructure: "Как работает рынок",
      lessonOrderTypes: "Типы ордеров",
      lessonBidAskSpread: "Bid / Ask / Спред",
      lessonLiquidity: "Ликвидность",
      lessonCandles: "Свечи",
      lessonLevels: "Поддержка и сопротивление",
      lessonTrendRange: "Тренд или ренж",
      lessonVolume: "Анализ объёма",
      lessonRiskPerTrade: "Риск на сделку",
      lessonStopLoss: "Стоп-лосс",
      lessonRiskReward: "Риск / Потенциал",
      lessonPositionSizing: "Размер позиции",
      lessonMomentumLogic: "Логика импульса",
      lessonBreakoutReclaim: "Пробой / возврат уровня",
      lessonFailedBreakout: "Ложный пробой",
      lessonContinuation: "Продолжение движения",
      lessonDiscipline: "Дисциплина",
      lessonOvertrading: "Переторговка",
      lessonRevengeTrading: "Торговля из мести",
      lessonPatience: "Терпение",
      lessonSetupChecklist: "Чеклист сетапа",
      lessonEntryTrigger: "Триггер входа",
      lessonInvalidation: "Отмена идеи",
      lessonReviewProcess: "Процесс разбора",
      advancedTracksLabel: "Дополнительные направления",
      advancedTracksText:
        "Дополнительные специализированные направления обучения для углубления торговой системы внутри SkillEdge AI.",
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
        "Этот урок оформлен как короткий практический блок SkillEdge AI. Изучи ключевые идеи, выполни задание и свяжи концепцию со своими сделками.",
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
      extraModuleOneTitle: "Smart Money Concepts и рабочие сетапы",
      extraModuleOneText:
        "Структура рынка, ликвидность, провокации, импульсное смещение, ордер-блоки и практическая логика рабочих сетапов.",
      extraModuleTwoTitle: "Скальпинг стакана в CScalp",
      extraModuleTwoText:
        "Обучение платформе, базовая работа с потоком ордеров, пробой уровня и сетапы «ножи» для активного скальпинга.",
      extraModuleThreeTitle: "Дополнительный модуль 3",
      extraModuleThreeText:
        "Этот модуль зарезервирован под следующий специализированный блок обучения.",
      extraModuleFourTitle: "Дополнительный модуль 4",
      extraModuleFourText:
        "Этот модуль зарезервирован под следующий специализированный блок обучения.",
      extraModuleOneLessonOne: "Структура рынка",
      extraModuleOneLessonTwo: "Зоны ликвидности",
      extraModuleOneLessonThree: "Ордер-блоки",
      extraModuleOneLessonFour: "Рабочие сетапы",
      extraModuleTwoLessonOne: "Интерфейс CScalp",
      extraModuleTwoLessonTwo: "Основы стакана",
      extraModuleTwoLessonThree: "Пробой уровня",
      extraModuleTwoLessonFour: "Сетап «ножи»",
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
      placeholder:
        "Расширенные отчёты формируются на основе журнала, фильтров и сохранённых сделок.",
      emptyTitle: "Пока недостаточно данных для отчёта",
      emptyText:
        "Добавь несколько сделок в журнал, чтобы SkillEdge AI смог построить отчёт по PnL, проценту прибыльных сделок, сетапам, ошибкам и динамике результата.",
      totalTrades: "Всего сделок",
      totalTradesHelper: "Все сделки из журнала",
      totalPnl: "Общий PnL",
      totalPnlHelper: "Суммарный результат по закрытым сделкам",
      winRate: "Процент прибыльных",
      averagePnl: "Средний PnL",
      averagePnlHelper: "Средний результат на сделку",
      profitFactor: "Profit Factor",
      profitFactorHelper: "Валовая прибыль / валовый убыток",
      bestWorst: "Лучшая / худшая",
      bestWorstHelper: "Лучшая и худшая сделка",
      equityTitle: "Кривая доходности",
      equitySubtitle: "Динамика накопительного PnL",
      points: "точек",
      directionTitle: "Лонг против шорта",
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
      locked: "Для добавления сделок нужен активный тариф или пробный доступ.",
      addTitle: "Добавить сделку",
      editTitle: "Редактировать сделку",
      addModeText: "Добавь новую сделку в личный журнал.",
      addText:
        "Заполни базовые данные, добавь скриншоты и используй AI-разбор для оценки сделки.",
      totalTrades: "Всего сделок",
      totalPnl: "Общий PnL",
      winRate: "Процент прибыльных",
      avgPnl: "Средний PnL",
      grossProfit: "Валовая прибыль",
      grossLoss: "Валовый убыток",
      bestTrade: "Лучшая сделка",
      worstTrade: "Худшая сделка",
      profitFactor: "Profit Factor",
      equityTitle: "Кривая доходности",
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
        "Прикрепляйте скриншоты графиков к сохранённым сделкам. SkillEdge AI будет использовать их для анализа входов, выходов, стопов и повторяющихся ошибок на графике.",
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
        "Последние 3 сделки из личного журнала. Полная таблица, фильтры и экспорт доступны ниже.",
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
        setup: "возврат VWAP / затухание гэпа",
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
      alerts: "Сигналы",
      coach: "AI-коуч",
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
      title: "У вас активирован 7-дневный пробный доступ",
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
      checkoutError: "Не удалось создать крипто-оплату. Попробуйте ещё раз.",
      loginRequiredForPayment: "Войдите в аккаунт перед оплатой тарифа.",
      currentPlanLabel: "Текущий тариф",
      activeSubscription:
        "Подписка активна. Лимиты и доступы применяются автоматически.",
      inactiveSubscription:
        "Подписка не активна. Некоторые функции могут быть недоступны.",
      active: "Активна",
      inactive: "Неактивна",
      billingPeriod: "Период",
      aiUsage: "Использование AI",
      billingNoteLabel: "Важно",
      billingNoteText:
        "Раздел оплаты показывает текущий тариф, лимиты, уровень доступа и статус подписки. Оплата картой готовится через одобренного платёжного провайдера, а крипто-доступ доступен на этапе запуска.",
      currentLimitsLabel: "Лимиты",
      currentLimitsTitle: "Что входит в текущий тариф",
      aiCoachLimit: "AI-коуч / месяц",
      journalAiLimit: "AI-анализ журнала / месяц",
      chartAiLimit: "AI-анализ графика / месяц",
      aiReportsLimit: "AI-отчёты / месяц",
      maxTradesLimit: "Максимум сделок",
      screenshotsLimit: "Скриншотов на сделку",
      aiReportsAccess: "AI-отчёты",
      supportAssistantAccess: "Помощник поддержки",
      socialTickersAccess: "Социальные тикеры",
      aiScannerAccess: "AI-сканер",
      aiAlertsAccess: "AI-сигналы",
      premiumChartAccess: "Премиум-анализ графика",
      exportReportsAccess: "Экспорт отчётов",
      included: "Включено",
      locked: "Закрыто",
      comparePlansLabel: "Сравнение",
      comparePlansTitle: "Сравнение тарифов",
      comparePlansText:
        "Проверь, что клиент видит разницу между Core, Edge и Elite.",
      current: "Текущий",
      choosePlan: "Выбрать тариф",
      planDescriptions: {
        core: "Базовый доступ для журнала сделок, скриншотов, AI-коуча и контроля дисциплины.",
        edge: "Продвинутый тариф для активных трейдеров: больше AI-запросов, отчёты, рыночная разведка и AI-сканер.",
        elite:
          "Максимальный тариф: AI-сигналы, плавающий виджет сигналов, связка сигналов с журналом и полный AI Trading Desk.",
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
        "Пример: сегодня зашёл в шорт после премаркет-пампа, увидел слабость под VWAP, но передвинул стоп и пересидел убыток. Разбери, где была ошибка.",
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
      needPlan: "Для AI-коуча нужен активный тариф или пробный доступ.",
      limitReached:
        "Лимит AI-запросов закончился. Выберите тариф выше или дождитесь обновления лимита.",
    },
  },

  ua: {
    terminal: "Термінал SkillEdge AI",
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
    askAI: "Запитати AI-коуча",
    createReport: "Створити звіт",
    overview: {
      title: "Огляд ефективності",
      text: "Зведення PnL, відсоток прибуткових угод, оцінка дисципліни, найкращі сетапи та головні помилки.",
      pnlMonth: "PnL за місяць",
      winRate: "Відсоток прибуткових",
      discipline: "Оцінка дисципліни",
      weeklyAi: "AI-зведення тижня",
      weeklyAiText:
        "AI-зведення збирає ключові висновки по журналу угод, ризику, дисципліні та повторюваних помилках.",
    },
    charts: {
      title: "Графіки TradingView",
      text: "Вбудований графік TradingView для аналізу тикерів, рівнів і сетапів.",
      placeholder: "Робочий простір TradingView доступний усередині модуля графіків.",
      analyzeCurrentChart: "Проаналізувати графік",
      workspaceText: "Робоча зона з графіком, списком спостереження та лідерами руху ринку.",
      watchlistExamples: "Приклади списку спостереження: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      openWatchlist: "Відкрити список",
      hideWatchlist: "Сховати список",
      watchlistTitle: "Список спостереження",
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
      loadingWatchlist: "Завантажуємо список спостереження...",
      emptyWatchlist: "Список порожній. Натисни + і додай тикер.",
      removeFromWatchlist: "Видалити зі списку",
      loginFirst: "Спочатку увійдіть в акаунт.",
      settingsLoadError: "Не вдалося завантажити налаштування графіків.",
      addTickerError: "Не вдалося додати тикер до списку спостереження.",
      removeTickerError: "Не вдалося видалити тикер зі списку спостереження.",
      moversStocks: "Акції",
      moversCrypto: "Крипто",
      moversGainers: "Лідери росту",
      moversLosers: "Лідери падіння",
      moversCollapse: "Згорнути",
      moversExpand: "Розгорнути",
      moversName: "Назва",
      moversPercentChange: "% зміни",
      moversLoading: "Завантажуємо лідерів руху...",
      moversEmpty: "Немає інструментів під цей фільтр.",
      moversStocksNeedKey:
        "Лідери руху по акціях готуються до підключення преміального покриття ринкових даних.",
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
        "SkillEdge AI не зміг завантажити ринкові дані по цьому тикеру на поточному тарифі даних. Спробуй більш ліквідний тикер: AAPL, TSLA, NVDA, SPY або QQQ.",
      marketDataPremiumTitle: "Потрібен преміум-доступ до ринкових даних",
      marketDataPremiumText:
  "Цей тикер, таймфрейм або джерело даних може вимагати вищий тариф ринкових даних. SkillEdge AI використовує преміальне ринкове покриття там, де воно доступне.",
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
      text: "Структурне навчання трейдингу, сетапи, ризик-менеджмент, психологія та побудова торгового плейбука.",
      learningNoteTitle: "Центр навчання працює як база повторення",
      learningNoteText:
        "SkillEdge AI насамперед сфокусований на журналі угод, аналізі графіків, AI-розборі та розвитку торгової системи. Цей розділ створений як коротка база для відновлення ключових понять, щоб клієнт швидше розумів ризик, сетапи, структуру ринку та логіку AI-аналізу.",
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
      moduleFourTitle: "Внутрішньоденний імпульс",
      moduleFourText:
        "Логіка імпульсу, пробій, повернення рівня, хибний пробій і сетапи продовження руху.",
      moduleFiveTitle: "Психологія трейдингу",
      moduleFiveText:
        "Контроль переторговки, торгівлі з помсти, страху, сумнівів та імпульсивних входів.",
      moduleSixTitle: "Плейбук / Сетапи",
      moduleSixText:
        "Перетворюй повторювані патерни на торговий плейбук із тригерами входу та умовами скасування ідеї.",
      lessonMarketStructure: "Як працює ринок",
      lessonOrderTypes: "Типи ордерів",
      lessonBidAskSpread: "Bid / Ask / Спред",
      lessonLiquidity: "Ліквідність",
      lessonCandles: "Свічки",
      lessonLevels: "Підтримка і спротив",
      lessonTrendRange: "Тренд або ренж",
      lessonVolume: "Аналіз обʼєму",
      lessonRiskPerTrade: "Ризик на угоду",
      lessonStopLoss: "Стоп-лосс",
      lessonRiskReward: "Ризик / Потенціал",
      lessonPositionSizing: "Розмір позиції",
      lessonMomentumLogic: "Логіка імпульсу",
      lessonBreakoutReclaim: "Пробій / повернення рівня",
      lessonFailedBreakout: "Хибний пробій",
      lessonContinuation: "Продовження руху",
      lessonDiscipline: "Дисципліна",
      lessonOvertrading: "Переторговка",
      lessonRevengeTrading: "Торгівля з помсти",
      lessonPatience: "Терпіння",
      lessonSetupChecklist: "Чеклист сетапу",
      lessonEntryTrigger: "Тригер входу",
      lessonInvalidation: "Скасування ідеї",
      lessonReviewProcess: "Процес розбору",
      advancedTracksLabel: "Додаткові напрямки",
      advancedTracksText:
        "Додаткові спеціалізовані напрями навчання для поглиблення торгової системи всередині SkillEdge AI.",
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
        "Цей урок оформлено як короткий практичний блок SkillEdge AI. Вивчи ключові ідеї, виконай завдання та звʼяжи концепцію зі своїми угодами.",
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
        "Структура ринку, ліквідність, провокації, імпульсне зміщення, ордер-блоки та практична логіка робочих сетапів.",
      extraModuleTwoTitle: "Скальпінг стакана в CScalp",
      extraModuleTwoText:
        "Навчання платформі, базова робота з потоком ордерів, пробій рівня та сетапи «ножі» для активного скальпінгу.",
      extraModuleThreeTitle: "Додатковий модуль 3",
      extraModuleThreeText:
        "Цей модуль зарезервовано під наступний спеціалізований навчальний блок.",
      extraModuleFourTitle: "Додатковий модуль 4",
      extraModuleFourText:
        "Цей модуль зарезервовано під наступний спеціалізований навчальний блок.",
      extraModuleOneLessonOne: "Структура ринку",
      extraModuleOneLessonTwo: "Зони ліквідності",
      extraModuleOneLessonThree: "Ордер-блоки",
      extraModuleOneLessonFour: "Робочі сетапи",
      extraModuleTwoLessonOne: "Інтерфейс CScalp",
      extraModuleTwoLessonTwo: "Основи стакана",
      extraModuleTwoLessonThree: "Пробій рівня",
      extraModuleTwoLessonFour: "Сетап «ножі»",
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
      placeholder:
        "Розширені звіти формуються на основі журналу, фільтрів і збережених угод.",
      emptyTitle: "Поки недостатньо даних для звіту",
      emptyText:
        "Додай кілька угод у журнал, щоб SkillEdge AI зміг побудувати звіт по PnL, відсотку прибуткових угод, сетапах, помилках і динаміці результату.",
      totalTrades: "Усього угод",
      totalTradesHelper: "Усі угоди з журналу",
      totalPnl: "Загальний PnL",
      totalPnlHelper: "Сумарний результат за закритими угодами",
      winRate: "Відсоток прибуткових",
      averagePnl: "Середній PnL",
      averagePnlHelper: "Середній результат на угоду",
      profitFactor: "Profit Factor",
      profitFactorHelper: "Валовий прибуток / валовий збиток",
      bestWorst: "Найкраща / найгірша",
      bestWorstHelper: "Найкраща та найгірша угода",
      equityTitle: "Крива дохідності",
      equitySubtitle: "Динаміка накопичувального PnL",
      points: "точок",
      directionTitle: "Лонг проти шорта",
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
      locked: "Для додавання угод потрібен активний тариф або пробний доступ.",
      addTitle: "Додати угоду",
      editTitle: "Редагувати угоду",
      addModeText: "Додай нову угоду до особистого журналу.",
      addText:
        "Заповни базові дані, додай скріншоти та використовуй AI-розбір для оцінки угоди.",
      totalTrades: "Усього угод",
      totalPnl: "Загальний PnL",
      winRate: "Відсоток прибуткових",
      avgPnl: "Середній PnL",
      grossProfit: "Валовий прибуток",
      grossLoss: "Валовий збиток",
      bestTrade: "Найкраща угода",
      worstTrade: "Найгірша угода",
      profitFactor: "Profit Factor",
      equityTitle: "Крива дохідності",
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
        "Додавайте скріншоти графіків до збережених угод. SkillEdge AI використовуватиме їх для аналізу входів, виходів, стопів і повторюваних помилок на графіку.",
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
        "Останні 3 угоди з особистого журналу. Повна таблиця, фільтри та експорт доступні нижче.",
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
        setup: "повернення VWAP / згасання гепу",
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
      alerts: "Сигнали",
      coach: "AI-коуч",
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
      title: "У вас активовано 7-денний пробний доступ",
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
      checkoutError: "Не вдалося створити крипто-оплату. Спробуйте ще раз.",
      loginRequiredForPayment: "Увійдіть в акаунт перед оплатою тарифу.",
      currentPlanLabel: "Поточний тариф",
      activeSubscription:
        "Підписка активна. Ліміти та доступи застосовуються автоматично.",
      inactiveSubscription:
        "Підписка не активна. Деякі функції можуть бути недоступні.",
      active: "Активна",
      inactive: "Неактивна",
      billingPeriod: "Період",
      aiUsage: "Використання AI",
      billingNoteLabel: "Важливо",
      billingNoteText:
        "Розділ оплати показує поточний тариф, ліміти, рівень доступу та статус підписки. Оплата карткою готується через погодженого платіжного провайдера, а крипто-доступ доступний на етапі запуску.",
      currentLimitsLabel: "Ліміти",
      currentLimitsTitle: "Що входить у поточний тариф",
      aiCoachLimit: "AI-коуч / місяць",
      journalAiLimit: "AI-аналіз журналу / місяць",
      chartAiLimit: "AI-аналіз графіка / місяць",
      aiReportsLimit: "AI-звіти / місяць",
      maxTradesLimit: "Максимум угод",
      screenshotsLimit: "Скріншотів на угоду",
      aiReportsAccess: "AI-звіти",
      supportAssistantAccess: "Помічник підтримки",
      socialTickersAccess: "Соціальні тикери",
      aiScannerAccess: "AI-сканер",
      aiAlertsAccess: "AI-сигнали",
      premiumChartAccess: "Преміум-аналіз графіка",
      exportReportsAccess: "Експорт звітів",
      included: "Увімкнено",
      locked: "Закрито",
      comparePlansLabel: "Порівняння",
      comparePlansTitle: "Порівняння тарифів",
      comparePlansText:
        "Перевір, що клієнт чітко бачить різницю між Core, Edge та Elite.",
      current: "Поточний",
      choosePlan: "Обрати тариф",
      planDescriptions: {
        core: "Базовий доступ для журналу угод, скріншотів, AI-коуча та контролю дисципліни.",
        edge: "Просунутий тариф для активних трейдерів: більше AI-запитів, звіти, ринкова розвідка та AI-сканер.",
        elite:
          "Максимальний тариф: AI-сигнали, плаваючий віджет сигналів, зв’язка сигналів із журналом і повний AI Trading Desk.",
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
        "Приклад: сьогодні зайшов у шорт після премаркет-пампу, побачив слабкість під VWAP, але пересунув стоп і пересидів збиток. Розбери, де була помилка.",
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
      needPlan: "Для AI-коуча потрібен активний тариф або пробний доступ.",
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
  { id: "alerts" },
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
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
const [quickNoteContent, setQuickNoteContent] = useState("");
const [quickNoteLoading, setQuickNoteLoading] = useState(false);
const [quickNoteSaving, setQuickNoteSaving] = useState(false);
const [quickNoteSavedAt, setQuickNoteSavedAt] = useState("");
const [quickNoteError, setQuickNoteError] = useState("");
const [quickNoteHydrated, setQuickNoteHydrated] = useState(false);
  const [requestedAlertAssetFilter, setRequestedAlertAssetFilter] =
  useState<AlertAssetFilter>("all");
   useEffect(() => {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const requestedAssetType = normalizeAlertAssetFilter(
    params.get("assetType") || params.get("market") || params.get("asset")
  );

  setRequestedAlertAssetFilter(requestedAssetType);

  if (
    requestedTab === "alerts" ||
    requestedTab === "signals" ||
    requestedTab === "ai-alerts"
  ) {
    setActiveTab("alerts");
  }
}, []);

useEffect(() => {
  if (!quickNoteOpen || quickNoteHydrated) return;

  loadQuickNote();
}, [quickNoteOpen, quickNoteHydrated]);

useEffect(() => {
  if (!quickNoteOpen || !quickNoteHydrated) return;

  const timer = window.setTimeout(() => {
    saveQuickNote(quickNoteContent);
  }, 900);

  return () => window.clearTimeout(timer);
}, [quickNoteContent, quickNoteOpen, quickNoteHydrated]); 
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
const [tradeDraftAlert, setTradeDraftAlert] =
  useState<DashboardMarketAlert | null>(null);
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
    setTradeDraftAlert(null);
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

    const response = await authFetch("/api/ai-coach", {
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

const updateDashboardUrlTab = (tab: string) => {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  window.history.pushState({}, "", `/dashboard?${params.toString()}`);
};

const scrollDashboardTop = () => {
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 120);
};

const handleQuickAddTrade = () => {
  setEditingTradeId("");
  setSelectedTradeIdForScreenshot("");
  setScreenshotFiles([]);
  resetTradeForm();

  setActiveTab("journal");
  updateDashboardUrlTab("journal");

  window.setTimeout(() => {
    const target = document.getElementById("journal-add-trade");

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, 180);
};

const handleQuickAskCoach = () => {
  setActiveTab("coach");
  updateDashboardUrlTab("coach");

  window.setTimeout(() => {
    const input = document.querySelector<HTMLTextAreaElement>("textarea");
    input?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 180);
};

const handleQuickCreateReport = () => {
  setActiveTab("reports");
  updateDashboardUrlTab("reports");
  scrollDashboardTop();
};

const loadQuickNote = async () => {
  try {
    setQuickNoteLoading(true);
    setQuickNoteError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setQuickNoteError("Login required to load your note.");
      return;
    }

    const { data, error } = await supabase
      .from("user_quick_notes")
      .select("content, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      setQuickNoteError(error.message);
      return;
    }

    setQuickNoteContent(data?.content || "");
    setQuickNoteSavedAt(data?.updated_at || "");
    setQuickNoteHydrated(true);
  } catch {
    setQuickNoteError("Failed to load note.");
  } finally {
    setQuickNoteLoading(false);
  }
};

const saveQuickNote = async (content = quickNoteContent) => {
  try {
    setQuickNoteSaving(true);
    setQuickNoteError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setQuickNoteError("Login required to save your note.");
      return;
    }

    const savedAt = new Date().toISOString();

    const { error } = await supabase.from("user_quick_notes").upsert(
      {
        user_id: user.id,
        content,
        updated_at: savedAt,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setQuickNoteError(error.message);
      return;
    }

    setQuickNoteSavedAt(savedAt);
  } catch {
    setQuickNoteError("Failed to save note.");
  } finally {
    setQuickNoteSaving(false);
  }
};

const handleOpenAlertsFromWidget = (assetFilter: AlertAssetFilter = "all") => {
  setRequestedAlertAssetFilter(assetFilter);
  setActiveTab("alerts");

  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "signals");

    if (assetFilter === "all") {
      params.delete("assetType");
    } else {
      params.set("assetType", getAlertAssetFilterUrlValue(assetFilter));
    }

    window.history.pushState({}, "", `/dashboard?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

const handleCreateTradeFromAlert = (alert: DashboardMarketAlert) => {
  setEditingTradeId("");
  setSelectedTradeIdForScreenshot("");
  setScreenshotFiles([]);
  setScreenshotError("");

  const isShort = alert.direction === "downside";
  const market = alert.asset_type === "crypto" ? "crypto" : "stocks";
  const direction = isShort ? "short" : "long";

  const entryMin =
    typeof alert.entry_zone_min === "number" ? alert.entry_zone_min : null;

  const entryMax =
    typeof alert.entry_zone_max === "number" ? alert.entry_zone_max : null;

  const entryReference =
    entryMin !== null && entryMax !== null
      ? (entryMin + entryMax) / 2
      : entryMin ?? entryMax;

  const targets = [alert.target_1, alert.target_2, alert.target_3]
    .filter((value): value is number => typeof value === "number")
    .join(" / ");

  const setupName =
    alert.setup_name || alert.setup_type || alert.title || "SkillEdge AI Alert";

  const notes = [
    "Created from SkillEdge AI Alert.",
    `Alert title: ${alert.title}`,
    `Direction: ${alert.direction}`,
    `Timeframe: ${alert.setup_timeframe || "5m"} setup / ${
      alert.confirmation_timeframe || "10m"
    } confirmation`,
    `Entry zone: ${
      entryMin !== null && entryMax !== null
        ? `${entryMin}–${entryMax}`
        : "wait trigger"
    }`,
    `Stop: ${alert.stop_price || "—"}`,
    `Targets: ${targets || "—"}`,
    alert.trigger_label ? `Trigger: ${alert.trigger_label}` : null,
    alert.why_signal_fired ? `Why signal fired: ${alert.why_signal_fired}` : null,
    alert.risk_note ? `Risk: ${alert.risk_note}` : null,
    alert.management_plan ? `Management: ${alert.management_plan}` : null,
    alert.invalidation ? `Invalidation: ${alert.invalidation}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  setTradeDraftAlert(alert);

  setTradeForm({
    ticker: alert.symbol || "",
    market,
    direction,
    entryPrice: entryReference !== null ? String(Number(entryReference.toFixed(4))) : "",
    exitPrice: "",
    stopLoss: alert.stop_price ? String(alert.stop_price) : "",
    positionSize: "",
    riskAmount: "",
    pnl: "",
    result: "",
    setup: setupName,
    emotion: "",
    mistake: "",
    lesson: alert.lesson_summary || "",
    notes,
    tradeDate: new Date().toISOString().slice(0, 10),
  });

  setActiveTab("journal");

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

const handleTradeEditStart = (trade: Trade) => {
    setTradeDraftAlert(null);
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
...(tradeDraftAlert
  ? {
      source_alert_id: tradeDraftAlert.id,
      source_setup_slug: tradeDraftAlert.setup_slug || null,
      source_setup_name:
        tradeDraftAlert.setup_name ||
        tradeDraftAlert.setup_type ||
        tradeDraftAlert.title ||
        null,
      alert_confidence_score:
        tradeDraftAlert.confidence_score || tradeDraftAlert.score || null,
      alert_confidence_tier: tradeDraftAlert.confidence_tier || null,
      alert_entry_zone_min: tradeDraftAlert.entry_zone_min || null,
      alert_entry_zone_max: tradeDraftAlert.entry_zone_max || null,
      alert_stop_price: tradeDraftAlert.stop_price || null,
      alert_target_1: tradeDraftAlert.target_1 || null,
      alert_target_2: tradeDraftAlert.target_2 || null,
      alert_target_3: tradeDraftAlert.target_3 || null,
      alert_plan: {
        alert_id: tradeDraftAlert.id,
        symbol: tradeDraftAlert.symbol,
        title: tradeDraftAlert.title,
        direction: tradeDraftAlert.direction,
        setup_slug: tradeDraftAlert.setup_slug,
        setup_name: tradeDraftAlert.setup_name || tradeDraftAlert.setup_type,
        setup_timeframe: tradeDraftAlert.setup_timeframe,
        confirmation_timeframe: tradeDraftAlert.confirmation_timeframe,
        confidence_score:
          tradeDraftAlert.confidence_score || tradeDraftAlert.score || null,
        confidence_tier: tradeDraftAlert.confidence_tier,
        trigger_label: tradeDraftAlert.trigger_label,
        entry_zone_min: tradeDraftAlert.entry_zone_min,
        entry_zone_max: tradeDraftAlert.entry_zone_max,
        stop_price: tradeDraftAlert.stop_price,
        target_1: tradeDraftAlert.target_1,
        target_2: tradeDraftAlert.target_2,
        target_3: tradeDraftAlert.target_3,
        reason: tradeDraftAlert.reason,
        risk_note: tradeDraftAlert.risk_note,
        scenario: tradeDraftAlert.scenario,
        invalidation: tradeDraftAlert.invalidation,
        management_plan: tradeDraftAlert.management_plan,
        confirmation_checklist: tradeDraftAlert.confirmation_checklist || [],
        avoid_if: tradeDraftAlert.avoid_if || [],
      },
    }
  : {}),
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

    const response = await authFetch("/api/journal-analysis", {
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

    const response = await authFetch("/api/analyze-trade-screenshot", {
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

const activeFeatureLock =
  !loading &&
  subscription.active &&
  activeTab !== "billing" &&
  ((activeTab === "market" &&
    !canUseFeature(subscription.plan, "ai_scanner")) ||
    (activeTab === "alerts" &&
      !canUseFeature(subscription.plan, "ai_alerts")));

const featureLockCopy = (() => {
  const isMarket = activeTab === "market";

  if (language === "ua") {
    return {
      label: isMarket ? "Потрібен Edge" : "Потрібен Elite",
      title: isMarket
        ? "Ринкова розвідка відкривається з SkillEdge Edge."
        : "AI-сигнали доступні тільки на SkillEdge Elite.",
      text: isMarket
        ? "На Core доступний лише попередній перегляд. SkillEdge Edge та Elite відкривають AI-сканер, ринкову розвідку, ринковий контекст, відстежувану увагу та AI-огляд ринку."
        : "SkillEdge Edge відкриває AI-сканер і ринкову розвідку, але AI-сигнали в реальному часі, плаваючий віджет, зв’язка сигналів із журналом та навчання на результатах доступні тільки в Elite.",
      button: isMarket ? "Перейти на Edge" : "Перейти на Elite",
    };
  }

  if (language === "en") {
    return {
      label: isMarket ? "Edge required" : "Elite required",
      title: isMarket
        ? "Market Intelligence unlocks from SkillEdge Edge."
        : "AI Alerts are available only on SkillEdge Elite.",
      text: isMarket
        ? "Core users can see the preview. SkillEdge Edge and Elite unlock AI Scanner, Market Intelligence, tracked attention, market context and AI Market Brief."
        : "SkillEdge Edge unlocks AI Scanner and Market Intelligence, but real-time AI Alerts, the floating alerts widget, Signal-to-Journal workflow and outcome learning are reserved for Elite.",
      button: isMarket ? "Upgrade to Edge" : "Upgrade to Elite",
    };
  }

  return {
    label: isMarket ? "Нужен Edge" : "Нужен Elite",
    title: isMarket
      ? "Рыночная разведка открывается с SkillEdge Edge."
      : "AI-сигналы доступны только на SkillEdge Elite.",
    text: isMarket
      ? "На Core доступен только предварительный просмотр. SkillEdge Edge и Elite открывают AI-сканер, рыночную разведку, рыночный контекст, отслеживаемое внимание и AI-обзор рынка."
      : "SkillEdge Edge открывает AI-сканер и рыночную разведку, но AI-сигналы в реальном времени, плавающий виджет, связка сигналов с журналом и обучение на исходах доступны только в Elite.",
    button: isMarket ? "Перейти на Edge" : "Перейти на Elite",
  };
})();

const getTabRequiredPlanLabel = (tabId: TabId) => {
  if (!subscription.active) return "";

  if (
    tabId === "market" &&
    !canUseFeature(subscription.plan, "ai_scanner")
  ) {
    return "Edge";
  }

  if (
    tabId === "alerts" &&
    !canUseFeature(subscription.plan, "ai_alerts")
  ) {
    return "Elite";
  }

  return "";
};

  return (
    <main className="se-dashboard-bg relative min-h-screen overflow-hidden text-white">
      <BackgroundFX />
      

      <div className="relative z-10 mx-auto w-full max-w-[1760px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <motion.header
  initial={{ opacity: 0, y: -18 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.55 }}
  className="se-dashboard-panel rounded-[2.25rem] p-5 md:p-6"
>
  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
    <div className="max-w-3xl">
      <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-xs font-black uppercase tracking-[0.28em] text-cyan-50/65">
        {t.terminal}
      </div>

      <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] text-white md:text-6xl">
        {t.dashboard}
      </h1>

      <p className="mt-3 text-sm font-semibold text-white/58">
        {t.user}:{" "}
        <span className="text-white/82">{email || t.loading}</span>
      </p>
    </div>

    <div className="flex flex-wrap gap-3">
      <a
        href="/?page=pricing"
        className="se-dashboard-button-primary rounded-full px-5 py-3 text-sm font-black transition hover:-translate-y-0.5"
      >
        {t.choosePlan}
      </a>

      <button
        type="button"
        onClick={handleLogout}
        className="se-dashboard-button-secondary rounded-full px-5 py-3 text-sm font-black transition hover:-translate-y-0.5"
      >
        {t.logout}
      </button>
    </div>
  </div>

  <div className="mt-7 overflow-x-auto pb-1">
    <div className="flex min-w-max gap-2 rounded-full border border-[rgba(198,226,255,0.16)] bg-[rgba(14,23,36,0.34)] p-1.5 shadow-inner shadow-black/20">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`relative rounded-full px-5 py-3 text-sm font-black transition ${
            activeTab === tab.id
              ? "text-[#07111d]"
              : "text-white/58 hover:bg-cyan-200/[0.07] hover:text-white"
          }`}
        >
          {activeTab === tab.id && (
            <motion.span
              layoutId="active-dashboard-tab"
              className="absolute inset-0 rounded-full bg-gradient-to-r from-white via-cyan-50 to-emerald-50 shadow-[0_12px_40px_rgba(255,255,255,0.18)]"
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 32,
              }}
            />
          )}

          <span className="relative z-10 inline-flex items-center gap-2">
            <span>{t.tabs[tab.id]}</span>

            {getTabRequiredPlanLabel(tab.id) ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                  activeTab === tab.id
                    ? "border-black/15 bg-black/10 text-black/65"
                    : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100/75"
                }`}
              >
                {getTabRequiredPlanLabel(tab.id)}
              </span>
            ) : null}
          </span>
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
          <section className="se-dashboard-panel relative min-h-[650px] overflow-hidden rounded-[2.25rem] p-6">
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
                      <span className="text-2xl">вњ¦</span>
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

{activeFeatureLock && (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050813]/55 backdrop-blur-[7px]">
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative max-w-xl overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#101522]/92 p-8 text-center shadow-2xl shadow-cyan-950/40"
    >
      <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl" />

      <div className="relative">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
          <span className="text-xl font-semibold text-cyan-100">SE</span>
        </div>

        <p className="mt-5 text-xs uppercase tracking-[0.28em] text-cyan-100/45">
          {featureLockCopy.label}
        </p>

        <h2 className="mt-3 text-3xl font-semibold text-white">
          {featureLockCopy.title}
        </h2>

        <p className="mt-4 text-sm leading-7 text-white/62">
          {featureLockCopy.text}
        </p>

        <a
          href="/?page=pricing"
          className="mt-7 inline-flex rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:scale-[1.03]"
        >
          {featureLockCopy.button}
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
              className={
  !loading && ((locked && activeTab !== "billing") || activeFeatureLock)
    ? "blur-md"
    : ""
}
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
  <MarketTab subscription={subscription} language={language} t={t} />
)}
{activeTab === "alerts" && (
  <AlertsTab
    subscription={subscription}
    language={language}
    trades={trades}
    requestedAssetFilter={requestedAlertAssetFilter}
    onRequestedAssetFilterChange={setRequestedAlertAssetFilter}
    onCreateTradeFromAlert={handleCreateTradeFromAlert}
  />
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
              className="se-dashboard-panel rounded-[2rem] p-6"
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

              <div className="se-dashboard-card-soft mt-5 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/45">{t.aiUsage}</span>
                  <span className="text-white/70">
                    {subscription.aiLimit > 0
                      ? `${subscription.aiUsed}/${subscription.aiLimit}`
                      : "0%"}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-200 shadow-[0_0_18px_rgba(56,214,255,0.35)]"
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
              className="se-dashboard-card rounded-[2rem] p-6"
            >
              <div className="relative overflow-hidden rounded-[1.7rem] border border-cyan-200/10 bg-[#071320]/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
  <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-300/14 blur-3xl" />
  <div className="pointer-events-none absolute -bottom-20 -left-14 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />

  <div className="relative flex items-center justify-between gap-3">
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-white/35">
        {t.quickActions}
      </p>
      <h3 className="mt-1 text-sm font-black uppercase tracking-[0.16em] text-white/80">
  Command center
</h3>
    </div>

    <div className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/80">
      Live
    </div>
  </div>

  <div className="relative mt-4 space-y-2">
    <ActionButton
      label={t.addTrade}
      description="Open journal trade ticket"
      badge="Journal"
      disabled={locked}
      onClick={handleQuickAddTrade}
    />

    <ActionButton
      label={
        language === "en"
          ? "Ask SkillEdge AI coach"
          : language === "ua"
            ? "Запитати SkillEdge AI коуча"
            : "Спросить SkillEdge AI коуча"
      }
      description="Go straight to the coach input"
      badge="AI"
      disabled={locked}
      onClick={handleQuickAskCoach}
    />

    <ActionButton
      label={
        language === "en"
          ? "Make a note"
          : language === "ua"
            ? "Зробити нотатку"
            : "Сделать заметку"
      }
      description="Personal trader notepad"
      badge="Note"
      disabled={locked}
      onClick={() => setQuickNoteOpen(true)}
    />

    <ActionButton
      label={t.createReport}
      description="Open AI reports workspace"
      badge="Reports"
      disabled={locked}
      onClick={handleQuickCreateReport}
    />
  </div>
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
        вњ• {t.journal.close}
      </button>

      <EquityCurveCard trades={trades} t={t} />
    </div>
  </div>
)}

{quickNoteOpen && (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-xl">
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[#08131f]/95 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/16 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-emerald-300/12 blur-3xl" />

      <div className="relative border-b border-white/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/45">
              SkillEdge Notepad
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              {language === "en"
                ? "Your permanent trading note"
                : language === "ua"
                  ? "Твоя постійна трейдинг-нотатка"
                  : "Твоя вечная трейдинг-заметка"}
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
              {language === "en"
                ? "One private page for session thoughts, reminders, mistakes, ideas and rules. It is saved to your account automatically."
                : language === "ua"
                  ? "Один приватний лист для думок по сесії, нагадувань, помилок, ідей і правил. Автоматично зберігається у твоєму акаунті."
                  : "Один приватный лист для мыслей по сессии, напоминаний, ошибок, идей и правил. Автоматически сохраняется в твоём аккаунте."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              saveQuickNote();
              setQuickNoteOpen(false);
            }}
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative p-6">
        {quickNoteLoading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/55">
            Loading your note...
          </div>
        ) : (
          <textarea
            value={quickNoteContent}
            onChange={(event) => setQuickNoteContent(event.target.value)}
            placeholder={
              language === "en"
                ? "Write everything here: session plan, rules, mistakes, ideas, reminders..."
                : language === "ua"
                  ? "Пиши все тут: план сесії, правила, помилки, ідеї, нагадування..."
                  : "Пиши всё тут: план сессии, правила, ошибки, идеи, напоминания..."
            }
            className="min-h-[420px] w-full resize-none rounded-[1.5rem] border border-cyan-200/12 bg-black/28 p-5 text-sm leading-7 text-white outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/25 focus:border-cyan-200/35"
          />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-white/45">
            {quickNoteError ? (
              <span className="text-rose-200">{quickNoteError}</span>
            ) : quickNoteSaving ? (
              <span>Saving...</span>
            ) : quickNoteSavedAt ? (
              <span>
                Saved{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(quickNoteSavedAt))}
              </span>
            ) : (
              <span>Autosave is ready</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => saveQuickNote()}
            disabled={quickNoteSaving}
            className="rounded-full bg-gradient-to-r from-cyan-100 via-white to-emerald-100 px-5 py-3 text-sm font-black text-[#06111d] shadow-[0_14px_45px_rgba(103,232,249,0.18)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {quickNoteSaving
              ? "Saving..."
              : language === "en"
                ? "Save note"
                : language === "ua"
                  ? "Зберегти нотатку"
                  : "Сохранить заметку"}
          </button>
        </div>
      </div>
    </motion.div>
  </div>
)}

{/* The site-wide GlobalAlertsWidget is the only floating alerts widget.
    Keep the local dashboard widget disabled to avoid duplicate AI Alerts bubbles. */}
{false ? (
  <DashboardAlertsWidget
    subscription={subscription}
    language={language}
    onOpenAlerts={handleOpenAlertsFromWidget}
  />
) : null}

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
        className="absolute left-[-10%] top-[-10%] h-[520px] w-[520px] rounded-full bg-cyan-400/14 blur-3xl"
        animate={{ x: [0, 42, 0], y: [0, 28, 0], opacity: [0.45, 0.72, 0.45] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute right-[-8%] top-[12%] h-[460px] w-[460px] rounded-full bg-emerald-400/12 blur-3xl"
        animate={{ x: [0, -38, 0], y: [0, 26, 0], opacity: [0.36, 0.64, 0.36] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute bottom-[-16%] left-[34%] h-[540px] w-[540px] rounded-full bg-blue-400/10 blur-3xl"
        animate={{ x: [0, 28, 0], y: [0, -36, 0], opacity: [0.28, 0.52, 0.28] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.075),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:58px_58px] opacity-24" />
    </>
  );
}

function ActionButton({
  label,
  description,
  badge,
  disabled,
  onClick,
}: {
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-[1.1rem] border px-3 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-white/8 bg-white/[0.025] text-white/25"
          : "border-[rgba(198,226,255,0.12)] bg-white/[0.045] text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:-translate-y-0.5 hover:border-cyan-200/32 hover:bg-cyan-200/[0.075] hover:text-white hover:shadow-[0_14px_40px_rgba(34,211,238,0.10)]"
      }`}
    >
      <span className="pointer-events-none absolute inset-y-2 left-0 w-[2px] rounded-full bg-gradient-to-b from-cyan-200/0 via-cyan-200/55 to-emerald-200/0 opacity-0 transition group-hover:opacity-100" />

      <span className="relative flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black leading-tight">
            {label}
          </span>

          {description ? (
            <span className="mt-1 block truncate text-[10px] font-medium leading-tight text-white/34">
              {description}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {badge ? (
            <span className="rounded-full border border-cyan-200/14 bg-cyan-200/[0.06] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100/65">
              {badge}
            </span>
          ) : null}

          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-xs text-white/35 transition group-hover:border-cyan-200/25 group-hover:bg-cyan-200/10 group-hover:text-cyan-100">
            →
          </span>
        </span>
      </span>
    </button>
  );
}

function formatExecutionNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(3);

  return value.toFixed(5);
}

function getSignalPlanDirection(trade: Trade) {
  const plan =
    trade.alert_plan && typeof trade.alert_plan === "object"
      ? (trade.alert_plan as Record<string, unknown>)
      : {};

  const rawDirection =
    typeof plan.direction === "string" ? plan.direction : "";

  if (rawDirection === "downside") return "short";
  if (rawDirection === "upside") return "long";

  return null;
}

function getTargetHitFromTrade(trade: Trade) {
  if (trade.exit_price === null) return "—";

  const direction = trade.direction;
  const targets = [
    { label: "TP3", value: trade.alert_target_3 },
    { label: "TP2", value: trade.alert_target_2 },
    { label: "TP1", value: trade.alert_target_1 },
  ].filter((target) => typeof target.value === "number") as Array<{
    label: string;
    value: number;
  }>;

  for (const target of targets) {
    if (direction === "long" && trade.exit_price >= target.value) {
      return target.label;
    }

    if (direction === "short" && trade.exit_price <= target.value) {
      return target.label;
    }
  }

  return "NO_TARGET";
}

function getSignalExecutionReview(trade: Trade) {
  if (!trade.source_alert_id) return null;

  const entryMin = trade.alert_entry_zone_min;
  const entryMax = trade.alert_entry_zone_max;
  const entry = trade.entry_price;
  const stop = trade.stop_loss;
  const plannedStop = trade.alert_stop_price;

  const hasEntryZone =
    typeof entryMin === "number" && typeof entryMax === "number";

  const entryInZone =
    entry !== null && hasEntryZone
      ? entry >= Math.min(entryMin, entryMax) &&
        entry <= Math.max(entryMin, entryMax)
      : null;

  const entryDistance =
    entry !== null && hasEntryZone
      ? trade.direction === "long"
        ? ((entry - Math.max(entryMin, entryMax)) /
            Math.max(entryMin, entryMax)) *
          100
        : ((Math.min(entryMin, entryMax) - entry) /
            Math.min(entryMin, entryMax)) *
          100
      : null;

  const stopDiffPercent =
    stop !== null && plannedStop
      ? (Math.abs(stop - plannedStop) / plannedStop) * 100
      : null;

  const stopMatched =
    stopDiffPercent !== null ? stopDiffPercent <= 0.75 : null;

  const planDirection = getSignalPlanDirection(trade);
  const directionMatched = planDirection ? trade.direction === planDirection : true;

  const targetHit = getTargetHitFromTrade(trade);

  let adherenceScore = 40;

  if (directionMatched) adherenceScore += 15;
  if (entryInZone === true) adherenceScore += 25;
  if (entryInZone === false) adherenceScore -= 10;
  if (stopMatched === true) adherenceScore += 15;
  if (stopMatched === false) adherenceScore -= 10;
  if (targetHit !== "—" && targetHit !== "NO_TARGET") adherenceScore += 15;
  if (trade.pnl !== null && trade.pnl > 0) adherenceScore += 10;
  if (trade.pnl !== null && trade.pnl < 0) adherenceScore -= 5;

  adherenceScore = Math.max(0, Math.min(100, Math.round(adherenceScore)));

  const executionLabel =
    adherenceScore >= 80
      ? "Strong execution"
      : adherenceScore >= 60
        ? "Acceptable execution"
        : adherenceScore >= 40
          ? "Weak execution"
          : "Plan broken";

  return {
    entryInZone,
    entryDistance,
    stopMatched,
    stopDiffPercent,
    directionMatched,
    targetHit,
    adherenceScore,
    executionLabel,
  };
}


const signalLinkedTradeCopy = {
  en: {
    linkedTrade: "Signal-linked trade",
    defaultSignal: "SkillEdge AI Signal",
    alertConfidence: "Alert confidence",
    entryQuality: "Entry quality",
    noPlanZone: "No plan zone",
    inZone: "In zone",
    outsideZone: "Outside zone",
    plan: "Plan",
    stopAdherence: "Stop adherence",
    noStopData: "No stop data",
    matched: "Matched",
    different: "Different",
    targetResult: "Target result",
    noTarget: "Target not reached",
    direction: "Direction",
    trade: "Trade",
    strongExecution: "Strong execution",
    acceptableExecution: "Acceptable execution",
    weakExecution: "Weak execution",
    planBroken: "Plan broken",
    strongText:
      "You followed the signal plan well. This execution should be tracked as a personal strength.",
    mediumText:
      "Execution was acceptable, but review entry timing, stop placement and target management.",
    weakText:
      "Execution likely deviated from the original signal plan. Check whether you entered late, changed the stop or ignored confirmation.",
  },

  ru: {
    linkedTrade: "Сделка связана с сигналом",
    defaultSignal: "Сигнал SkillEdge AI",
    alertConfidence: "Уверенность сигнала",
    entryQuality: "Качество входа",
    noPlanZone: "Нет плановой зоны",
    inZone: "В зоне",
    outsideZone: "Вне зоны",
    plan: "План",
    stopAdherence: "Следование стопу",
    noStopData: "Нет данных по стопу",
    matched: "Совпадает",
    different: "Отличается",
    targetResult: "Результат по целям",
    noTarget: "Цель не достигнута",
    direction: "Направление",
    trade: "Сделка",
    strongExecution: "Сильное исполнение",
    acceptableExecution: "Приемлемое исполнение",
    weakExecution: "Слабое исполнение",
    planBroken: "План нарушен",
    strongText:
      "Ты хорошо следовал плану сигнала. Такое исполнение SkillEdge AI должен отслеживать как личную сильную сторону.",
    mediumText:
      "Исполнение было приемлемым, но стоит разобрать тайминг входа, постановку стопа и сопровождение целей.",
    weakText:
      "Исполнение, вероятно, отклонилось от исходного плана сигнала. Проверь, не вошёл ли ты поздно, не изменил ли стоп или не проигнорировал подтверждение.",
  },

  ua: {
    linkedTrade: "Угода пов’язана із сигналом",
    defaultSignal: "Сигнал SkillEdge AI",
    alertConfidence: "Впевненість сигналу",
    entryQuality: "Якість входу",
    noPlanZone: "Немає планової зони",
    inZone: "У зоні",
    outsideZone: "Поза зоною",
    plan: "План",
    stopAdherence: "Дотримання стопа",
    noStopData: "Немає даних по стопу",
    matched: "Збігається",
    different: "Відрізняється",
    targetResult: "Результат по цілях",
    noTarget: "Ціль не досягнута",
    direction: "Напрямок",
    trade: "Угода",
    strongExecution: "Сильне виконання",
    acceptableExecution: "Прийнятне виконання",
    weakExecution: "Слабке виконання",
    planBroken: "План порушено",
    strongText:
      "Ти добре дотримався плану сигналу. Таке виконання SkillEdge AI має відстежувати як особисту сильну сторону.",
    mediumText:
      "Виконання було прийнятним, але варто розібрати таймінг входу, постановку стопа та супровід цілей.",
    weakText:
      "Виконання, ймовірно, відхилилося від початкового плану сигналу. Перевір, чи не увійшов ти пізно, чи не змінив стоп або не проігнорував підтвердження.",
  },
} as const;

function getSignalExecutionLabelCopy(
  label: string,
  language: Language,
) {
  const copy = signalLinkedTradeCopy[language];

  if (label === "Strong execution") return copy.strongExecution;
  if (label === "Acceptable execution") return copy.acceptableExecution;
  if (label === "Weak execution") return copy.weakExecution;
  if (label === "Plan broken") return copy.planBroken;

  return label;
}

function getSignalTargetHitCopy(
  targetHit: string,
  language: Language,
) {
  const copy = signalLinkedTradeCopy[language];

  if (targetHit === "NO_TARGET") return copy.noTarget;

  return targetHit;
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

const journalLanguage: Language =
  t.dashboard === "Dashboard"
    ? "en"
    : t.dashboard === "Особистий кабінет"
      ? "ua"
      : "ru";

const signalCopy = signalLinkedTradeCopy[journalLanguage];

const journalDeskCopy =
  journalLanguage === "en"
    ? {
        heroBadge: "Journal is your edge",
        heroTitle: "Every trade becomes data. Every mistake becomes a system upgrade.",
        heroText:
          "The journal is not a notebook. It is the core dataset for AI review, personal alerts, execution quality and trader improvement.",
        usageHint: "Trade capacity",
        focusItems: [
          ["Plan", "Ticker, direction, setup and reason before entry."],
          ["Risk", "Stop, size, risk amount and invalidation before action."],
          ["Review", "Mistake, emotion, lesson and chart screenshot after the trade."],
        ],
        aiBadge: "AI journal review",
        formBadge: "Trade ticket",
        formText: "Log the trade like a desk ticket: context, execution, risk, emotion and lesson.",
        recentBadge: "Recent execution",
        tableBadge: "Full trade database",
      }
    : journalLanguage === "ua"
      ? {
          heroBadge: "Журнал — твій edge",
          heroTitle: "Кожна угода стає даними. Кожна помилка — покращенням системи.",
          heroText:
            "Журнал — це не нотатник. Це головна база даних для AI review, персональних alerts, якості виконання та розвитку трейдера.",
          usageHint: "Ліміт угод",
          focusItems: [
            ["План", "Тикер, напрямок, сетап і причина до входу."],
            ["Ризик", "Стоп, розмір, risk amount та invalidation до дії."],
            ["Review", "Помилка, емоція, урок і скрін графіка після угоди."],
          ],
          aiBadge: "AI journal review",
          formBadge: "Trade ticket",
          formText: "Фіксуй угоду як desk ticket: контекст, виконання, ризик, емоцію та урок.",
          recentBadge: "Останнє виконання",
          tableBadge: "Повна база угод",
        }
      : {
          heroBadge: "Журнал — твой edge",
          heroTitle: "Каждая сделка становится данными. Каждая ошибка — апгрейдом системы.",
          heroText:
            "Журнал — это не блокнот. Это главная база данных для AI-review, персональных alerts, качества исполнения и роста трейдера.",
          usageHint: "Лимит сделок",
          focusItems: [
            ["План", "Тикер, направление, сетап и причина до входа."],
            ["Риск", "Стоп, размер, risk amount и invalidation до действия."],
            ["Review", "Ошибка, эмоция, урок и скрин графика после сделки."],
          ],
          aiBadge: "AI journal review",
          formBadge: "Trade ticket",
          formText: "Записывай сделку как desk ticket: контекст, исполнение, риск, эмоцию и урок.",
          recentBadge: "Последнее исполнение",
          tableBadge: "Полная база сделок",
        };


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
    <div className="space-y-6">
      <SectionHeader title={t.journal.title} text={t.journal.text} />

      <div className="se-dashboard-panel relative overflow-hidden rounded-[2.25rem] p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,214,255,0.15),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(52,211,153,0.11),transparent_30%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[1fr_0.82fr] xl:items-center">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/72">
              {journalDeskCopy.heroBadge}
            </div>

            <h2 className="mt-5 max-w-4xl text-3xl font-black leading-[1.03] tracking-[-0.045em] text-white md:text-5xl">
              {journalDeskCopy.heroTitle}
            </h2>

            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-white/60">
              {journalDeskCopy.heroText}
            </p>
          </div>

          <div className="grid gap-3">
            {journalDeskCopy.focusItems.map(([title, text], index) => (
              <div
                key={title}
                className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/16 bg-cyan-200/[0.08] text-[10px] font-black text-cyan-50">
                    0{index + 1}
                  </div>

                  <div>
                    <div className="text-sm font-black text-white">{title}</div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-white/48">
                      {text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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

<div className="se-dashboard-card-soft mt-6 rounded-3xl p-5">
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

<div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
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



<div className="se-dashboard-panel mt-6 rounded-3xl p-6">
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
      className="se-dashboard-button-primary rounded-full px-6 py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
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
  <div className="se-dashboard-card-soft mt-5 rounded-3xl p-5">
    <AiReport text={journalAnalysis} />
  </div>
)}
</div>

      {locked && (
        <div className="mt-6 rounded-3xl border border-amber-300/25 bg-amber-300/[0.08] p-5 text-sm font-semibold leading-7 text-amber-50/85">
         {t.journal.locked}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div
  className={`rounded-[2rem] border p-6 transition ${
    editingTradeId
      ? "border-cyan-300/40 bg-cyan-300/[0.06] shadow-[0_0_48px_rgba(103,232,249,0.12)] [&_.field-input]:border-cyan-300/45 [&_.field-input]:bg-cyan-300/[0.06]"
      : "border-[rgba(198,226,255,0.14)] bg-white/[0.045] shadow-[0_20px_80px_rgba(8,47,73,0.14)] backdrop-blur-xl"
  }`}
>
          <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">
  {journalDeskCopy.formBadge}
</div>

<h2 id="journal-add-trade" className="mt-5 text-3xl font-black text-white">
  {editingTradeId ? t.journal.editTitle : t.journal.addTitle}
</h2>

<p className="mt-2 text-sm font-semibold leading-6 text-white/50">
  {journalDeskCopy.formText}
</p>

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
            
        <div className="rounded-[2rem] border border-cyan-200/14 bg-cyan-200/[0.045] p-5">
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
        : "se-dashboard-button-primary hover:-translate-y-0.5"
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
            className="se-dashboard-button-primary mt-6 inline-flex rounded-full px-7 py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
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
    className="mt-3 rounded-full border border-white/10 bg-white/[0.055] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-cyan-200/[0.08] hover:text-white"
  >
    {t.journal.cancelEditButton}
  </button>
)}
        </div>
      </div>

        <div className="se-dashboard-card rounded-3xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">{journalDeskCopy.recentBadge}</div>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.03em]">{t.journal.recentTitle}</h3>
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
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm font-semibold leading-7 text-white/50">
                {t.journal.empty}
              </div>
            ) : (
              recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 transition hover:border-cyan-200/20 hover:bg-cyan-200/[0.055]"
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

{trade.source_alert_id ? (
  (() => {
    const executionReview = getSignalExecutionReview(trade);

    if (!executionReview) return null;

    return (
      <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/45">
              {signalCopy.linkedTrade}
            </div>

            <div className="mt-2 text-sm font-semibold text-white/85">
              {trade.source_setup_name || trade.setup || signalCopy.defaultSignal}
            </div>

            <div className="mt-1 text-xs leading-5 text-white/45">
              {signalCopy.alertConfidence}:{" "}
              {trade.alert_confidence_score ?? "—"}
              {trade.alert_confidence_tier
                ? ` · ${trade.alert_confidence_tier}`
                : ""}
            </div>
          </div>

          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {executionReview.adherenceScore}/100 ·{" "}
            {getSignalExecutionLabelCopy(executionReview.executionLabel, journalLanguage)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {signalCopy.entryQuality}
            </div>

            <div className="mt-2 text-sm font-semibold text-white/80">
              {executionReview.entryInZone === null
                ? signalCopy.noPlanZone
                : executionReview.entryInZone
                  ? signalCopy.inZone
                  : signalCopy.outsideZone}
            </div>

            <div className="mt-1 text-xs leading-5 text-white/45">
              {signalCopy.plan}:{" "}
              {trade.alert_entry_zone_min && trade.alert_entry_zone_max
                ? `${formatExecutionNumber(
                    trade.alert_entry_zone_min
                  )}–${formatExecutionNumber(trade.alert_entry_zone_max)}`
                : "—"}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {signalCopy.stopAdherence}
            </div>

            <div className="mt-2 text-sm font-semibold text-white/80">
              {executionReview.stopMatched === null
                ? signalCopy.noStopData
                : executionReview.stopMatched
                  ? signalCopy.matched
                  : signalCopy.different}
            </div>

            <div className="mt-1 text-xs leading-5 text-white/45">
              {signalCopy.plan}: {formatExecutionNumber(trade.alert_stop_price)}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {signalCopy.targetResult}
            </div>

            <div className="mt-2 text-sm font-semibold text-white/80">
              {getSignalTargetHitCopy(executionReview.targetHit, journalLanguage)}
            </div>

            <div className="mt-1 text-xs leading-5 text-white/45">
              TP1 / TP2 / TP3
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {signalCopy.direction}
            </div>

            <div className="mt-2 text-sm font-semibold text-white/80">
              {executionReview.directionMatched ? signalCopy.matched : signalCopy.different}
            </div>

            <div className="mt-1 text-xs leading-5 text-white/45">
              {signalCopy.trade}: {getDirectionLabel(trade.direction)}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/55">
          {executionReview.adherenceScore >= 80
            ? signalCopy.strongText
            : executionReview.adherenceScore >= 60
              ? signalCopy.mediumText
              : signalCopy.weakText}
        </div>
      </div>
    );
  })()
) : null}

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
  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-white/55">
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
        className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black text-white/70 transition hover:bg-cyan-200/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
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
            
            

            <div className="se-dashboard-panel mt-8 rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
  <div>
    <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">{journalDeskCopy.tableBadge}</div>
    <h3 className="mt-4 text-2xl font-black tracking-[-0.03em]">{t.journal.fullTitle}</h3>
<p className="mt-2 text-sm text-white/45">{t.journal.fullText}</p>
  </div>

  <div className="flex flex-wrap gap-3">
  <button
    type="button"
    onClick={downloadTradesCsv}
    disabled={filteredTrades.length === 0}
    className="rounded-full border border-[rgba(198,226,255,0.14)] bg-white/[0.055] px-5 py-3 text-sm font-black text-white/76 transition hover:border-cyan-200/28 hover:bg-cyan-200/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {t.journal.downloadCsv}
  </button>

  <button
    type="button"
    onClick={downloadTradesXlsx}
    disabled={filteredTrades.length === 0}
    className="se-dashboard-button-primary rounded-full px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
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

        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-black/14">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-white/[0.035] text-xs uppercase tracking-[0.18em] text-white/42">
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

            <tbody className="divide-y divide-white/10 text-white/68">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-white/45">
                    {t.journal.empty}
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade) => (
                  <tr key={trade.id} className="transition hover:bg-cyan-200/[0.045]">
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
        className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black text-white/70 transition hover:bg-cyan-200/[0.08] hover:text-white"
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
  className="mr-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
>
  {t.journal.openChartButton}
</button>
  
<button
  type="button"
  onClick={() => onTradeEditStart(trade)}
  className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black text-white/70 transition hover:bg-cyan-200/[0.08] hover:text-white"
>
  {t.journal.editTradeButton}
</button>

  <button
    type="button"
    onClick={() => onTradeDelete(trade.id)}
    className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-[11px] font-black text-red-200 transition hover:bg-red-400/15"
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
          ? "se-dashboard-card rounded-3xl p-5 overflow-hidden"
          : "se-dashboard-panel rounded-3xl p-6"
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
    {t.loading}
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
      background: "#0d1b2b",
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



type MarketScannerItem = {
  id?: string;
  symbol: string;
  exchange: string | null;
  name: string | null;
  asset_type?: string;
  scan_bucket: "pump_watch" | "dump_watch" | "unusual_volume" | "catalyst_watch";
  direction_bias: "upside" | "downside" | "neutral";
  price: number | null;
  change_percent: number | null;
  gap_percent: number | null;
  volume: number | null;
  relative_volume: number | null;
  mentions: number | null;
  mention_velocity: number | null;
  sentiment: "bullish" | "neutral" | "bearish";
  catalyst: string | null;
  risk_label: string | null;
  opportunity_score: number | null;
  source?: string;
  scanned_at?: string;
};

type MarketSocialMentionItem = {
  id?: string;
  symbol: string;
  exchange: string | null;
  name: string | null;
  source: string;
  mentions_24h: number;
  mentions_1h: number;
  mention_velocity: number;
  sentiment: "bullish" | "neutral" | "bearish";
  social_score: number;
  sample_posts?: Array<{
    title: string;
    subreddit: string;
    url: string;
    score: number;
    comments: number;
    created_utc: number;
  }>;
  scanned_at?: string;
};

type MarketScannerCopy = {
  title: string;
  text: string;
  lockedTitle: string;
  lockedText: string;
  refresh: string;
  refreshing: string;
  source: string;
  scanned: string;
  pumpWatch: string;
  dumpWatch: string;
  unusualVolume: string;
  catalystWatch: string;
  all: string;
  filters: string;
  allBuckets: string;
  stocks: string;
  crypto: string;
  search: string;
  score: string;
  change: string;
  volume: string;
  mentions: string;
  sentiment: string;
  risk: string;
  noData: string;
  socialTitle: string;
socialText: string;
socialRefresh: string;
socialRefreshing: string;
socialScore: string;
mentions24h: string;
mentions1h: string;
velocity: string;
provider: string;
topPosts: string;
noSocialData: string;
  openChart: string;
  bullish: string;
  bearish: string;
  neutral: string;
  upside: string;
  downside: string;
};



const marketScannerCopy: Record<Language, MarketScannerCopy> = {
  en: {
    title: "Market Intelligence Scanner",
    text: "A market intelligence layer for stocks and crypto: movers, unusual volume, catalysts, tracked social attention and opportunity ranking.",
    lockedTitle: "Market Intelligence is available on SkillEdge Edge and Elite.",
    lockedText:
      "Core users can view the module preview. Upgrade to unlock scanner results, opportunity scores, tracked attention data and in-play ticker research.",
    refresh: "Refresh scanner",
    refreshing: "Scanning...",
    source: "Source",
    scanned: "Scanned",
    pumpWatch: "Pump watch",
    dumpWatch: "Dump watch",
    unusualVolume: "Unusual volume",
    catalystWatch: "Catalysts",
    all: "All",
    filters: "Filters",
    allBuckets: "All categories",
    stocks: "Stocks",
    crypto: "Crypto",
    search: "Search ticker...",
    score: "Score",
    change: "Move",
    volume: "Volume",
    mentions: "Tracked mentions",
    sentiment: "Sentiment",
    risk: "Risk",
    noData: "No scanner data yet. Refresh the scanner or check the data source status.",
    socialTitle: "Tracked attention — 24H",
    socialText:
      "Tracked social attention from connected sources. These numbers are not full internet coverage.",
    socialRefresh: "Refresh attention data",
    socialRefreshing: "Scanning tracked sources...",
    socialScore: "Attention score",
    mentions24h: "Tracked 24H",
    mentions1h: "Tracked 1H",
    velocity: "Velocity",
    provider: "Source",
    topPosts: "Top posts",
    noSocialData:
      "No tracked attention data yet. Refresh the scanner or check the source coverage.",
    openChart: "Open chart",
    bullish: "Bullish",
    bearish: "Bearish",
    neutral: "Neutral",
    upside: "Upside",
    downside: "Downside",
  },

  ru: {
    title: "Рыночная разведка",
    text: "Слой анализа рынка для акций и крипты: лидеры движения, аномальный объём, катализаторы, отслеживаемое внимание и рейтинг возможностей.",
    lockedTitle: "Рыночная разведка доступна на SkillEdge Edge и Elite.",
    lockedText:
      "На Core доступен только предварительный просмотр. Перейдите на Edge или Elite, чтобы открыть результаты сканера, рейтинг возможностей, данные по отслеживаемому вниманию и поиск активных тикеров.",
    refresh: "Обновить сканер",
    refreshing: "Сканируем...",
    source: "Источник",
    scanned: "Проверено",
    pumpWatch: "Памп-кандидаты",
    dumpWatch: "Дамп-кандидаты",
    unusualVolume: "Аномальный объём",
    catalystWatch: "Катализаторы",
    all: "Все",
    filters: "Фильтры",
    allBuckets: "Все категории",
    stocks: "Акции",
    crypto: "Крипто",
    search: "Поиск тикера...",
    score: "Рейтинг",
    change: "Движение",
    volume: "Объём",
    mentions: "Отслеживаемые упоминания",
    sentiment: "Настроение",
    risk: "Риск",
    noData: "Данных сканера пока нет. Обновите сканер или проверьте статус источника данных.",
    socialTitle: "Отслеживаемое внимание — 24ч",
    socialText:
      "Отслеживаемое внимание из подключённых источников. Эти цифры не являются полным охватом всего интернета.",
    socialRefresh: "Обновить данные внимания",
    socialRefreshing: "Сканируем источники...",
    socialScore: "Рейтинг внимания",
    mentions24h: "Отслежено за 24ч",
    mentions1h: "Отслежено за 1ч",
    velocity: "Скорость",
    provider: "Источник",
    topPosts: "Топ-посты",
    noSocialData:
      "Данных по отслеживаемому вниманию пока нет. Обновите сканер или проверьте покрытие источников.",
    openChart: "Открыть график",
    bullish: "Бычье",
    bearish: "Медвежье",
    neutral: "Нейтральное",
    upside: "Вверх",
    downside: "Вниз",
  },

  ua: {
    title: "Ринкова розвідка",
    text: "Шар аналізу ринку для акцій і крипти: лідери руху, аномальний обʼєм, каталізатори, відстежувана увага та рейтинг можливостей.",
    lockedTitle: "Ринкова розвідка доступна на SkillEdge Edge та Elite.",
    lockedText:
      "На Core доступний лише попередній перегляд. Перейдіть на Edge або Elite, щоб відкрити результати сканера, рейтинг можливостей, дані відстежуваної уваги та пошук активних тикерів.",
    refresh: "Оновити сканер",
    refreshing: "Скануємо...",
    source: "Джерело",
    scanned: "Перевірено",
    pumpWatch: "Памп-кандидати",
    dumpWatch: "Дамп-кандидати",
    unusualVolume: "Аномальний обʼєм",
    catalystWatch: "Каталізатори",
    all: "Усі",
    filters: "Фільтри",
    allBuckets: "Усі категорії",
    stocks: "Акції",
    crypto: "Крипто",
    search: "Пошук тикера...",
    score: "Рейтинг",
    change: "Рух",
    volume: "Обʼєм",
    mentions: "Відстежувані згадки",
    sentiment: "Настрій",
    risk: "Ризик",
    noData: "Даних сканера поки немає. Оновіть сканер або перевірте статус джерела даних.",
    socialTitle: "Відстежувана увага — 24г",
    socialText:
      "Відстежувана увага з підключених джерел. Ці цифри не є повним охопленням усього інтернету.",
    socialRefresh: "Оновити дані уваги",
    socialRefreshing: "Скануємо джерела...",
    socialScore: "Рейтинг уваги",
    mentions24h: "Відстежено за 24г",
    mentions1h: "Відстежено за 1г",
    velocity: "Швидкість",
    provider: "Джерело",
    topPosts: "Топ-пости",
    noSocialData:
      "Даних щодо відстежуваної уваги поки немає. Оновіть сканер або перевірте покриття джерел.",
    openChart: "Відкрити графік",
    bullish: "Бичачий",
    bearish: "Ведмежий",
    neutral: "Нейтральний",
    upside: "Вгору",
    downside: "Вниз",
  },
};

function formatMarketNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  const number = Number(value);

  if (Math.abs(number) >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(1)}B`;
  }

  if (Math.abs(number) >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1_000) {
    return `${(number / 1_000).toFixed(1)}K`;
  }

  return number.toLocaleString();
}

function getBucketLabel(
  bucket: MarketScannerItem["scan_bucket"],
  copy: (typeof marketScannerCopy)[Language]
) {
  if (bucket === "pump_watch") return copy.pumpWatch;
  if (bucket === "dump_watch") return copy.dumpWatch;
  if (bucket === "unusual_volume") return copy.unusualVolume;
  return copy.catalystWatch;
}

function getSentimentMarketLabel(
  sentiment: MarketScannerItem["sentiment"],
  copy: (typeof marketScannerCopy)[Language]
) {
  if (sentiment === "bullish") return copy.bullish;
  if (sentiment === "bearish") return copy.bearish;
  return copy.neutral;
}

function MarketSocialMentionRow({
  item,
  copy,
}: {
  item: MarketSocialMentionItem;
  copy: MarketScannerCopy;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 transition hover:border-fuchsia-300/25 hover:bg-fuchsia-300/[0.04]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-2xl font-semibold text-white">
              {item.symbol}
            </div>

            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase text-white/45">
              {item.exchange || "US"}
            </span>

            <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2.5 py-1 text-[11px] text-fuchsia-100">
              Reddit
            </span>
          </div>

          <div className="mt-1 truncate text-sm text-white/45">
            {item.name || item.symbol}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[660px]">
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.socialScore}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {item.social_score}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.mentions24h}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatMarketNumber(item.mentions_24h)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.mentions1h}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatMarketNumber(item.mentions_1h)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.velocity}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {(Number(item.mention_velocity || 0) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.sentiment}
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {getSentimentMarketLabel(item.sentiment, copy)}
            </div>
          </div>
        </div>
      </div>

      {Array.isArray(item.sample_posts) && item.sample_posts.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/35">
            {copy.topPosts}
          </div>

          <div className="space-y-2">
            {item.sample_posts.slice(0, 2).map((post) => (
              <a
                key={`${item.symbol}-${post.url}-${post.created_utc}`}
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-white/55 transition hover:border-fuchsia-300/25 hover:text-white"
              >
                <span className="text-white/75">r/{post.subreddit}</span>
                {" · "}
                {post.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketScannerRow({
  item,
  language,
  onOpenChart,
}: {
  item: MarketScannerItem;
  language: Language;
  onOpenChart?: (symbol: string) => void;
}) {
  const copy = marketScannerCopy[language] ?? marketScannerCopy.ru;
  const score = item.opportunity_score ?? 0;
  const change = Number(item.change_percent ?? 0);

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-2xl font-semibold text-white">{item.symbol}</div>

            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase text-white/45">
              {item.exchange || "US"}
            </span>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                item.scan_bucket === "pump_watch"
                  ? "bg-emerald-300/10 text-emerald-100"
                  : item.scan_bucket === "dump_watch"
                    ? "bg-red-300/10 text-red-100"
                    : "bg-cyan-300/10 text-cyan-100"
              }`}
            >
              {getBucketLabel(item.scan_bucket, copy)}
            </span>
          </div>

          <div className="mt-1 truncate text-sm text-white/45">
            {item.name || item.symbol}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[620px]">
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.score}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">{score}</div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
  {copy.change}
</div>
            <div
              className={`mt-1 text-lg font-semibold ${
                change >= 0 ? "text-emerald-100" : "text-red-100"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.volume}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatMarketNumber(item.volume)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.mentions}
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatMarketNumber(item.mentions)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
              {copy.sentiment}
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {getSentimentMarketLabel(item.sentiment, copy)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="text-sm leading-6 text-white/45">
          <span className="text-white/65">{copy.risk}:</span>{" "}
          {item.risk_label || "Needs chart confirmation"}
        </div>

        {onOpenChart && (
          <button
            type="button"
            onClick={() => onOpenChart(item.symbol)}
            className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50 transition hover:bg-cyan-300/15"
          >
            {copy.openChart}
          </button>
        )}
      </div>
    </div>
  );
}

type MarketAlertStructureLevel = {
  price?: number | null;
  label?: string | null;
  type?: string | null;
};

type MarketAlertSourceData = {
  marketStructure?: {
    source?: "structure" | "fallback" | string | null;
    candlesProvider?: string | null;
    candlesInterval?: string | null;
    candlesCount?: number | null;
    candlesError?: string | null;
    vwap?: number | null;
    atr?: number | null;
    nearestSupport?: MarketAlertStructureLevel | null;
    nearestResistance?: MarketAlertStructureLevel | null;
    structureNotes?: string[] | null;
    missingStructureData?: string[] | null;
  } | null;
  skillEdgeEngine?: {
    setupSlug?: string | null;
    setupName?: string | null;
    globalConfidence?: number | null;
    riskRewardRatio?: number | null;
    tier?: string | null;
    reasons?: string[] | null;
    riskNotes?: string[] | null;
    rejectionReasons?: string[] | null;
  } | null;
};

type DashboardMarketAlert = {
  id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  asset_type: "stock" | "crypto" | string;
  alert_type: string;
  direction: "upside" | "downside" | "neutral" | string;
  score: number;
  confidence_score?: number | null;
  title: string;
  reason: string;
  risk_note: string | null;
  scenario: string | null;
  setup_type?: string | null;
  setup_timeframe?: string | null;
  confirmation_timeframe?: string | null;
  confidence_tier?: string | null;
  why_signal_fired?: string | null;
  confirmation_checklist?: string[] | null;
  avoid_if?: string[] | null;
  lesson_summary?: string | null;
  playbook_status?: string | null;
  setup_slug?: string | null;
  setup_name?: string | null;
  setup_description?: string | null;
  setup_confirmation?: string | null;
  setup_common_mistake?: string | null;
  trigger_label?: string | null;
  entry_zone_min?: number | null;
  entry_zone_max?: number | null;
  stop_price?: number | null;
  target_1?: number | null;
  target_2?: number | null;
  target_3?: number | null;
  invalidation?: string | null;
  source_data?: MarketAlertSourceData | null;
  management_plan?: string | null;
  is_new?: boolean;
  viewed_at?: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  outcome_status?: "pending" | "worked" | "failed" | "neutral" | string;
outcome_checked_at?: string | null;
mfe?: number | null;
mae?: number | null;
hit_target?: string | null;
hit_stop?: boolean | null;
time_to_target_minutes?: number | null;
personalization_label?: string | null;
personalization_type?: "strength" | "risk" | "learning" | "neutral" | string | null;
personalization_note?: string | null;
personal_strength_score?: number | null;
personal_win_rate?: number | null;
personal_total_pnl?: number | null;
personal_plan_adherence?: number | null;
journal_pattern_label?: string | null;
journal_pattern_type?: "journal_strength" | "journal_learning" | string | null;
journal_pattern_note?: string | null;
journal_pattern_name?: string | null;
journal_pattern_match_score?: number | null;
journal_pattern_strength_score?: number | null;
journal_pattern_total_pnl?: number | null;
journal_pattern_avg_pnl?: number | null;
journal_pattern_keywords?: string[] | null;
personal_priority_score?: number | null;
personal_priority_type?: "priority" | "caution" | "watch" | "neutral" | string | null;
personal_priority_label?: string | null;
personal_priority_reason?: string | null;
signal_mode?: "actionable" | "watchlist" | "caution" | "monitoring" | string | null;
signal_mode_label?: string | null;
signal_mode_note?: string | null;
user_alert_decision?: string | null;
user_alert_decision_note?: string | null;
};

function formatAlertPrice(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 10) return value.toFixed(3);

  return value.toFixed(4);
}

function getAlertSourceData(alert: DashboardMarketAlert): MarketAlertSourceData {
  return alert.source_data || {};
}

function getAlertMarketStructure(alert: DashboardMarketAlert) {
  return getAlertSourceData(alert).marketStructure || null;
}

function getAlertRiskReward(alert: DashboardMarketAlert) {
  const sourceData = getAlertSourceData(alert);
  const engineRR = sourceData.skillEdgeEngine?.riskRewardRatio;

  if (typeof engineRR === "number" && Number.isFinite(engineRR)) {
    return engineRR;
  }

  const entryMin =
    typeof alert.entry_zone_min === "number" ? alert.entry_zone_min : null;
  const entryMax =
    typeof alert.entry_zone_max === "number" ? alert.entry_zone_max : null;
  const stop = typeof alert.stop_price === "number" ? alert.stop_price : null;
  const target =
    typeof alert.target_3 === "number"
      ? alert.target_3
      : typeof alert.target_2 === "number"
        ? alert.target_2
        : typeof alert.target_1 === "number"
          ? alert.target_1
          : null;

  if (entryMin === null || entryMax === null || stop === null || target === null) {
    return null;
  }

  const entry = (entryMin + entryMax) / 2;
  const direction = alert.direction === "downside" ? "downside" : "upside";

  const risk = direction === "upside" ? entry - stop : stop - entry;
  const reward = direction === "upside" ? target - entry : entry - target;

  if (risk <= 0 || reward <= 0) return null;

  return Number((reward / risk).toFixed(2));
}

function AlertStructurePanel({
  alert,
  copy,
}: {
  alert: DashboardMarketAlert;
  copy: {
    structureTitle: string;
    structureBased: string;
    fallbackBased: string;
    rr: string;
    vwap: string;
    atr: string;
    support: string;
    resistance: string;
    candles: string;
    missingData: string;
  };
}) {
  const structure = getAlertMarketStructure(alert);
  const rr = getAlertRiskReward(alert);

  if (!structure && rr === null) return null;

  const isStructure = structure?.source === "structure";
  const nearestSupport = structure?.nearestSupport;
  const nearestResistance = structure?.nearestResistance;

  return (
    <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/45">
            {copy.structureTitle}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {isStructure ? copy.structureBased : copy.fallbackBased}
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-white/75">
          {copy.rr}: {rr !== null ? `${rr}R` : "—"}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.vwap}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {formatAlertPrice(structure?.vwap)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.atr}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {formatAlertPrice(structure?.atr)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.support}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {nearestSupport?.label
              ? `${nearestSupport.label}: ${formatAlertPrice(nearestSupport.price)}`
              : "—"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.resistance}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {nearestResistance?.label
              ? `${nearestResistance.label}: ${formatAlertPrice(nearestResistance.price)}`
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          {copy.candles}: {structure?.candlesProvider || "—"} ·{" "}
          {structure?.candlesCount ?? 0}
        </span>

        {Array.isArray(structure?.missingStructureData) &&
        structure.missingStructureData.length > 0 ? (
          <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1 text-amber-100/70">
            {copy.missingData}: {structure.missingStructureData.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type UserSignalPlaybookItem = {
  id: string;
  setup_slug: string;
  setup_name: string;
  asset_type: string | null;
  direction: string | null;
  setup_timeframe: string | null;
  confirmation_timeframe: string | null;
  confidence_score: number | null;
  confidence_tier: string | null;
  setup_description: string | null;
  setup_confirmation: string | null;
  setup_common_mistake: string | null;
  lesson_summary: string | null;
  confirmation_checklist: string[] | null;
  avoid_if: string[] | null;
  example_symbol: string | null;
  example_entry_zone_min: number | null;
  example_entry_zone_max: number | null;
  example_stop_price: number | null;
  example_target_1: number | null;
  example_target_2: number | null;
  example_target_3: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type UserSignalProfileItem = {
  id: string;
  user_id: string;
  setup_slug: string;
  setup_name: string;
  asset_type: string | null;
  direction: string | null;
  trades_count: number;
  wins_count: number;
  losses_count: number;
  win_rate: number | null;
  total_pnl: number;
  avg_pnl: number | null;
  best_pnl: number | null;
  worst_pnl: number | null;
  avg_plan_adherence: number | null;
  strength_score: number;
  profile_label: "personal_strength" | "risk_zone" | "learning" | "neutral" | string;
  ai_note: string | null;
  last_trade_at: string | null;
  updated_at: string;
  created_at: string;
};

type UserTradePatternProfileItem = {
  id: string;
  user_id: string;
  pattern_slug: string;
  pattern_name: string;
  source: string;
  market: string | null;
  direction: string | null;
  trades_count: number;
  wins_count: number;
  total_pnl: number;
  avg_pnl: number | null;
  best_pnl: number | null;
  avg_entry_price: number | null;
  avg_stop_distance_percent: number | null;
  example_tickers: string[] | null;
  matching_keywords: string[] | null;
  pattern_fingerprint: Record<string, unknown> | null;
  profile_label: string;
  strength_score: number;
  ai_note: string | null;
  last_trade_at: string | null;
  updated_at: string;
  created_at: string;
};

type AlertFilter =
  | "all"
  | "actionable"
  | "watchlist"
  | "decision_watching"
  | "decision_taken"
  | "decision_skipped"
  | "decision_missed"
  | "taken_without_journal"
  | "journal_linked"
  | "execution_strong"
  | "execution_review"
  | "execution_entry_issue"
  | "execution_stop_issue"
  | "execution_direction_issue"
  | "execution_target_issue"
  | "outcome_taken_worked"
  | "outcome_taken_failed"
  | "outcome_missed_opportunity"
  | "outcome_good_skip"
  | "priority"
  | "caution"
  | "journal_match"
  | "ai_strength"
  | "long"
  | "short"
  | "crypto"
  | "stocks";

  function getAlertImportanceScore(alert: DashboardMarketAlert) {
  const baseScore =
    alert.personal_priority_score ??
    alert.confidence_score ??
    alert.score ??
    0;

  let score = Number(baseScore) || 0;

  if (alert.personal_priority_type === "priority") score += 400;
  if (alert.journal_pattern_type === "journal_strength") score += 300;
  if (alert.personalization_type === "strength") score += 260;
  if (alert.personal_priority_type === "caution") score += 220;
  if (alert.journal_pattern_type === "journal_learning") score += 120;
  if (alert.personalization_type === "learning") score += 80;

  if (alert.is_new !== false && !alert.viewed_at) score += 70;
  if (alert.status === "active") score += 60;

  const createdAt = alert.created_at
    ? new Date(alert.created_at).getTime()
    : 0;

  if (createdAt > 0) {
    const ageMinutes = Math.max(0, (Date.now() - createdAt) / 60000);
    const freshnessScore = Math.max(0, 60 - ageMinutes);
    score += freshnessScore;
  }

  return score;
}

type AlertLifecycleBucket = "active" | "armed" | "watch";

function getAlertLifecycleBucket(alert: DashboardMarketAlert): AlertLifecycleBucket {
  const status = String(alert.status || "").toLowerCase();

  if (status === "active") return "active";
  if (status === "armed") return "armed";

  return "watch";
}

function getAlertLifecycleRankValue(alert: DashboardMarketAlert) {
  const bucket = getAlertLifecycleBucket(alert);

  if (bucket === "active") return 3;
  if (bucket === "armed") return 2;

  return 1;
}

function getAlertLifecycleLabel(alert: DashboardMarketAlert) {
  const bucket = getAlertLifecycleBucket(alert);

  if (bucket === "active") return "ACTIVE";
  if (bucket === "armed") return "ARMED";

  return "WATCH";
}

function getAlertLifecycleTitle(bucket: AlertLifecycleBucket) {
  if (bucket === "active") return "Active Signals";
  if (bucket === "armed") return "Armed Setups";

  return "Watch Radar";
}

function getAlertLifecycleDescription(bucket: AlertLifecycleBucket) {
  if (bucket === "active") {
    return "Structured trade plans with trigger, entry zone, stop, targets and risk note. Still confirm before execution.";
  }

  if (bucket === "armed") {
    return "Setups are close, but SkillEdge is still waiting for trigger/confirmation before calling them active.";
  }

  return "In-play tickers/coins worth tracking. No actionable entry yet.";
}

function getAlertLifecycleClass(bucket: AlertLifecycleBucket) {
  if (bucket === "active") {
    return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100";
  }

  if (bucket === "armed") {
    return "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100";
  }

  return "border-white/10 bg-white/[0.045] text-white/65";
}

function getAlertLifecycleNote(alert: DashboardMarketAlert) {
  const bucket = getAlertLifecycleBucket(alert);

  if (bucket === "active") {
    return "Trade plan is active, but execution still requires confirmation and valid risk/reward.";
  }

  if (bucket === "armed") {
    return "Setup is armed. Wait for trigger, confirmation and no-chase conditions.";
  }

  return "Radar only. Track the ticker, but do not treat it as a buy/sell signal yet.";
}

function getAlertTransparencyItems(alert: DashboardMarketAlert) {
  const confidence = alert.confidence_score ?? alert.score ?? null;
  const priority = alert.personal_priority_score ?? null;

  const items: {
    label: string;
    value: string;
    note: string;
    type: "positive" | "warning" | "neutral";
  }[] = [];

  items.push({
    label: "Base confidence",
    value: confidence === null ? "—" : String(confidence),
    note:
      "Core signal quality based on market activity, setup quality, catalyst/social context and risk structure.",
    type: confidence !== null && confidence >= 80 ? "positive" : "neutral",
  });

  if (priority !== null) {
    items.push({
      label: "Personal priority",
      value: String(priority),
      note:
        alert.personal_priority_reason ||
        "Personal score after journal profile, setup history and pattern match are applied.",
      type:
        alert.personal_priority_type === "priority"
          ? "positive"
          : alert.personal_priority_type === "caution"
            ? "warning"
            : "neutral",
    });
  }

  if (alert.personalization_label) {
    items.push({
      label: "AI-linked profile",
      value: alert.personalization_label,
      note:
        alert.personalization_note ||
        "This checks whether the setup matches your previous AI-linked trading history.",
      type:
        alert.personalization_type === "strength"
          ? "positive"
          : alert.personalization_type === "risk"
            ? "warning"
            : "neutral",
    });
  }

  if (alert.journal_pattern_label) {
    items.push({
      label: "Journal pattern match",
      value: alert.journal_pattern_label,
      note:
        alert.journal_pattern_note ||
        "This checks whether the setup is similar to your profitable independent journal trades.",
      type:
        alert.journal_pattern_type === "journal_strength"
          ? "positive"
          : "neutral",
    });
  }

  if (alert.risk_note) {
    items.push({
      label: "Risk filter",
      value: "Active",
      note: alert.risk_note,
      type: "warning",
    });
  }

  if (alert.trigger_label) {
    items.push({
      label: "Trigger logic",
      value: alert.trigger_label,
      note:
        "The alert should still be traded only if the trigger/confirmation condition is respected.",
      type: "neutral",
    });
  }

  return items;
}

function playSkillEdgeAlertSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      1320,
      audioContext.currentTime + 0.08
    );

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.18,
      audioContext.currentTime + 0.02
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.22
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.24);
  } catch {
    // Browser may block sound until user interaction. Widget still works.
  }
}

function DashboardAlertsWidget({
  subscription,
  language,
  onOpenAlerts,
}: {
  subscription: Subscription;
  language: Language;
  onOpenAlerts: (assetFilter?: AlertAssetFilter) => void;
}) {
  const [alerts, setAlerts] = useState<DashboardMarketAlert[]>([]);
const [assetFilter, setAssetFilter] = useState<AlertAssetFilter>("all");
const [open, setOpen] = useState(false);
const [loading, setLoading] = useState(false);
const [generating, setGenerating] = useState(false);
const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
const [error, setError] = useState("");
  const [seenAlertIds, setSeenAlertIds] = useState<string[]>([]);
  const previousAlertIdsRef = useRef<string[]>([]);

  const safeLanguage: Language =
    language === "en" || language === "ua" || language === "ru"
      ? language
      : "ru";

  const copy = {
    ru: {
      title: "AI Alerts",
      subtitle: "Последние торговые сигналы",
      empty: "Пока нет активных alerts.",
      scan: "Сканировать",
      scanning: "Сканируем...",
      open: "Открыть",
      close: "Свернуть",
      expand: "Развернуть",
      direction: "Направление",
      entry: "Зона входа",
      stop: "Стоп",
      targets: "Цели",
      structureTitle: "Структура рынка",
      structureBased: "План построен по свечам / VWAP / уровням",
      fallbackBased: "Fallback-план: не хватает свечей/уровней",
      rr: "RR",
      vwap: "VWAP",
      atr: "ATR",
      support: "Ближайшая поддержка",
      resistance: "Ближайшее сопротивление",
      candles: "Свечи",
      missingData: "Не хватает данных",
      risk: "Риск",
      newLabel: "new",
      live: "Live",
      lastChecked: "Проверено",
      autoRefresh: "Auto-refresh 60s / scan 5m",
      priority: "priority",
      latest: "Последний",
      openCenter: "Открыть центр",
      quiet: "Ждём качественный setup",
      filterAll: "Все",
      filterStocks: "Акции",
      filterCrypto: "Крипто",
    },
    en: {
      title: "AI Alerts",
      subtitle: "Latest trading signals",
      empty: "No active alerts yet.",
      scan: "Scan",
      scanning: "Scanning...",
      open: "Open",
      close: "Collapse",
      expand: "Expand",
      direction: "Direction",
      entry: "Entry",
      stop: "Stop",
      targets: "Targets",
      structureTitle: "Market structure",
      structureBased: "Plan built from candles / VWAP / levels",
      fallbackBased: "Fallback plan: candles/levels are missing",
      rr: "RR",
      vwap: "VWAP",
      atr: "ATR",
      support: "Nearest support",
      resistance: "Nearest resistance",
      candles: "Candles",
      missingData: "Missing data",
      risk: "Risk",
      newLabel: "new",live: "Live",
lastChecked: "Checked",
autoRefresh: "Auto-refresh 60s / scan 5m",
priority: "priority",
latest: "Latest",
openCenter: "Open center",
quiet: "Waiting for quality setup",
      filterAll: "All",
      filterStocks: "Stocks",
      filterCrypto: "Crypto",
    },
    ua: {
      title: "AI Alerts",
      subtitle: "Останні торгові сигнали",
      empty: "Активних alerts поки немає.",
      scan: "Сканувати",
      scanning: "Скануємо...",
      open: "Відкрити",
      close: "Згорнути",
      expand: "Розгорнути",
      direction: "Напрямок",
      entry: "Зона входу",
      stop: "Стоп",
      targets: "Цілі",
      structureTitle: "Структура ринку",
      structureBased: "План побудовано за свічками / VWAP / рівнями",
      fallbackBased: "Fallback-план: бракує свічок/рівнів",
      rr: "RR",
      vwap: "VWAP",
      atr: "ATR",
      support: "Найближча підтримка",
      resistance: "Найближчий опір",
      candles: "Свічки",
      missingData: "Бракує даних",
      risk: "Ризик",
      newLabel: "new",
      live: "Live",
      lastChecked: "Перевірено",
      autoRefresh: "Auto-refresh 60s / scan 5m",
      priority: "priority",
      latest: "Останній",
      openCenter: "Відкрити центр",
      quiet: "Чекаємо якісний setup",
      filterAll: "Усі",
      filterStocks: "Акції",
      filterCrypto: "Крипто",
    },
  }[safeLanguage];

  const hasAccess =
  subscription.active && canUseFeature(subscription.plan, "ai_alerts");

  const filteredWidgetAlerts = alerts.filter((alert) =>
    isAlertInAssetFilter(alert, assetFilter)
  );
  const stockAlertsCount = alerts.filter((alert) => alert.asset_type !== "crypto").length;
  const cryptoAlertsCount = alerts.filter((alert) => alert.asset_type === "crypto").length;

  const newAlerts = filteredWidgetAlerts.filter(
  (alert) =>
    alert.is_new !== false &&
    !alert.viewed_at &&
    !seenAlertIds.includes(alert.id)
);

const priorityAlerts = filteredWidgetAlerts.filter((alert) => {
  const score = alert.confidence_score ?? alert.score ?? 0;

  return (
    alert.signal_mode === "actionable" ||
    alert.personalization_type === "journal_strength" ||
    score >= 80
  );
});

const latestAlert = filteredWidgetAlerts[0] || null;
const shouldPulse = newAlerts.length > 0 && !open;

  const loadAlerts = async (generate = false) => {
    if (!hasAccess) return;

    try {
      setError("");
      if (generate) {
        setGenerating(true);
      } else {
        setLoading(true);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Unauthorized.");
        return;
      }

      if (generate) {
        await authFetch(`/api/market/alerts?assetType=${getAlertAssetFilterUrlValue(assetFilter)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }

      const response = await authFetch("/api/market/alerts?limit=50&period=24h&status=tradable&assetType=all", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | { items?: DashboardMarketAlert[]; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error || "Failed to load alerts.");
        return;
      }

      const nextAlerts = Array.isArray(data?.items) ? data.items : [];
      const nextIds = nextAlerts.map((alert) => alert.id);
      const previousIds = previousAlertIdsRef.current;

      const hasFreshAlert = nextIds.some((id) => !previousIds.includes(id));

      if (hasFreshAlert && previousIds.length > 0 && !open) {
        playSkillEdgeAlertSound();
      }

      previousAlertIdsRef.current = nextIds;
      setAlerts(nextAlerts);
      setLastCheckedAt(new Date().toISOString());
    } catch {
      setError("Failed to load alerts.");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) return;

    try {
      const saved = window.localStorage.getItem("skilledge_seen_alert_ids");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSeenAlertIds(parsed.filter((id) => typeof id === "string"));
        }
      }
    } catch {
      // ignore localStorage parsing errors
    }


    
    loadAlerts(false);

    const readInterval = window.setInterval(() => {
      loadAlerts(false);
    }, 30000);

    return () => {
      window.clearInterval(readInterval);
    };
  }, [hasAccess, assetFilter]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("skilledge_alert_widget_asset_filter");
      const normalized = normalizeAlertAssetFilter(saved);
      setAssetFilter(normalized);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const handleWidgetAssetFilterChange = (nextFilter: AlertAssetFilter) => {
    setAssetFilter(nextFilter);

    try {
      window.localStorage.setItem("skilledge_alert_widget_asset_filter", nextFilter);
    } catch {
      // ignore localStorage errors
    }
  };

  const markAlertsViewed = async (alertIds: string[]) => {
  if (alertIds.length === 0) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    await authFetch("/api/market/alerts/viewed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        alertIds,
      }),
    });

    setAlerts((current) =>
      current.map((alert) =>
        alertIds.includes(alert.id)
          ? { ...alert, is_new: false, viewed_at: new Date().toISOString() }
          : alert
      )
    );
  } catch {
    // Keep local UI working even if server update fails.
  }
};

  const markOpen = () => {
  setOpen((current) => {
    const nextOpen = !current;

    if (nextOpen) {
      const ids = alerts.map((alert) => alert.id);
      const merged = Array.from(new Set([...seenAlertIds, ...ids])).slice(-100);

      setSeenAlertIds(merged);
      markAlertsViewed(ids);

      try {
        window.localStorage.setItem(
          "skilledge_seen_alert_ids",
          JSON.stringify(merged)
        );
      } catch {
        // ignore localStorage errors
      }
    }

    return nextOpen;
  });
};

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-4 z-50 w-[min(380px,calc(100vw-2rem))] sm:right-6">
      <div
        className={`rounded-[1.4rem] border bg-[#101827]/95 shadow-[0_20px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition ${
  shouldPulse
    ? "border-cyan-300/50 shadow-cyan-500/25"
    : "border-white/10"
}`}
      >
        <button
          type="button"
          onClick={markOpen}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div
  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border ${
    shouldPulse
      ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-100 shadow-[0_0_28px_rgba(103,232,249,0.28)]"
      : "border-white/10 bg-white/[0.04] text-white/70"
  }`}
>
  {shouldPulse ? (
    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
  ) : null}
  вљЎ
</div>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">{copy.title}</p>

                {newAlerts.length > 0 ? (
                  <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-bold text-black">
                    {newAlerts.length} {copy.newLabel}
                  </span>
                ) : null}
                {priorityAlerts.length > 0 ? (
  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">
    {priorityAlerts.length} {copy.priority}
  </span>
) : null}
              </div>

              <p className="mt-0.5 line-clamp-1 text-xs text-white/45">
  {latestAlert
    ? `${copy.latest}: ${latestAlert.symbol} · ${
        latestAlert.setup_name ||
        latestAlert.setup_type ||
        latestAlert.signal_mode_label ||
        latestAlert.direction ||
        "AI setup"
      }`
    : copy.quiet}
</p>
            </div>
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
            {open ? copy.close : copy.open}
          </span>
        </button>

        {open ? (
  <div className="max-h-[min(620px,calc(100vh-8rem))] overflow-y-auto border-t border-white/10 p-4 pt-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
  <div className="flex items-center gap-2 text-xs text-white/55">
    <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
    <span>{copy.live}</span>
    <span className="text-white/25">·</span>
    <span>{copy.autoRefresh}</span>
  </div>

  <div className="text-xs text-white/40">
    {copy.lastChecked}:{" "}
    {lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : "—"}
  </div>
</div>

            <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1">
              {([
                { id: "all", label: copy.filterAll, count: alerts.length },
                { id: "stock", label: copy.filterStocks, count: stockAlertsCount },
                { id: "crypto", label: copy.filterCrypto, count: cryptoAlertsCount },
              ] as { id: AlertAssetFilter; label: string; count: number }[]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleWidgetAssetFilterChange(item.id)}
                  className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition ${
                    assetFilter === item.id
                      ? "bg-cyan-300 text-black shadow-[0_0_22px_rgba(103,232,249,0.25)]"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item.label} <span className="opacity-70">{item.count}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => loadAlerts(true)}
                disabled={generating || loading}
                className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? copy.scanning : copy.scan}
              </button>

              <button
  type="button"
  onClick={() => {
    setOpen(false);
    onOpenAlerts(assetFilter);
  }}
  className="mt-3 w-full rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
>
  {copy.openCenter}
</button>
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100/80">
                {error}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {loading && alerts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/45">
                  Loading alerts...
                </div>
              ) : filteredWidgetAlerts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/45">
                  {copy.empty}
                </div>
              ) : (
                filteredWidgetAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-white">
                          {alert.symbol}
                        </div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/35">
                          {alert.setup_type || alert.alert_type}
                        </div>
                      </div>

                      <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                        {alert.confidence_score || alert.score}
                      </div>
                    </div>

                    <div className="mt-2 text-xs leading-5 text-white/58">
                      {alert.title}
                    </div>
                    {alert.personal_priority_label ? (
  <div
    className={`mt-2 rounded-xl border p-2 text-[11px] leading-4 ${
      alert.personal_priority_type === "priority"
        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50/80"
        : alert.personal_priority_type === "caution"
          ? "border-red-300/20 bg-red-300/10 text-red-50/80"
          : alert.personal_priority_type === "watch"
            ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50/80"
            : "border-white/10 bg-white/[0.04] text-white/60"
    }`}
  >
    {alert.personal_priority_label} ·{" "}
    {alert.personal_priority_score ?? alert.confidence_score ?? alert.score}
  </div>
) : null}

{alert.personalization_label ? (
  <div
    className={`mt-2 rounded-xl border p-2 text-[11px] leading-4 ${
      alert.personalization_type === "strength"
        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50/80"
        : alert.personalization_type === "risk"
          ? "border-red-300/20 bg-red-300/10 text-red-50/80"
          : alert.personalization_type === "learning"
            ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50/80"
            : "border-white/10 bg-white/[0.04] text-white/60"
    }`}
  >
    {alert.personalization_label}
  </div>
) : null}

{alert.journal_pattern_label ? (
  <div
    className={`mt-2 rounded-xl border p-2 text-[11px] leading-4 ${
      alert.journal_pattern_type === "journal_strength"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-50/80"
        : "border-white/10 bg-white/[0.04] text-white/60"
    }`}
  >
    {alert.journal_pattern_label}
  </div>
) : null}

                    <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-white/48 sm:grid-cols-2">
                      <div>
                        {copy.direction}:{" "}
                        <span className="text-white/70">{alert.direction}</span>
                      </div>
                      <div>
                        {copy.entry}:{" "}
                        <span className="text-white/70">
                          {alert.entry_zone_min && alert.entry_zone_max
                            ? `${alert.entry_zone_min}–${alert.entry_zone_max}`
                            : "wait trigger"}
                        </span>
                      </div>
                      <div>
                        {copy.stop}:{" "}
                        <span className="text-white/70">
                          {alert.stop_price || "—"}
                        </span>
                      </div>
                      <div>
                        {copy.targets}:{" "}
                        <span className="text-white/70">
                          {[alert.target_1, alert.target_2, alert.target_3]
                            .filter(Boolean)
                            .join(" / ") || "—"}
                        </span>
                      </div>
                    </div>

                    <AlertStructurePanel alert={alert} copy={copy} />

                    {alert.risk_note ? (
                      <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-2 text-[11px] leading-4 text-amber-50/70">
                        {copy.risk}: {alert.risk_note}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlertsTab({
  subscription,
  language,
  trades,
  requestedAssetFilter,
  onRequestedAssetFilterChange,
  onCreateTradeFromAlert,
}: {
  subscription: Subscription;
  language: Language;
  trades: Trade[];
  requestedAssetFilter: AlertAssetFilter;
  onRequestedAssetFilterChange: (assetFilter: AlertAssetFilter) => void;
  onCreateTradeFromAlert: (alert: DashboardMarketAlert) => void;
}) {
const [alerts, setAlerts] = useState<DashboardMarketAlert[]>([]);
const [signalAssetFilter, setSignalAssetFilter] = useState<AlertAssetFilter>(requestedAssetFilter);
const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
const [signalsControlPanelOpen, setSignalsControlPanelOpen] = useState(false);
const [decisionReasonFilter, setDecisionReasonFilter] = useState<string | null>(
  null
);
const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
const [visibleAlertsCount, setVisibleAlertsCount] = useState(5);
const [alertsLastCheckedAt, setAlertsLastCheckedAt] = useState<string | null>(null);
const [loading, setLoading] = useState(false);
const [generating, setGenerating] = useState(false);
const [checkingOutcomes, setCheckingOutcomes] = useState(false);
const [savingPlaybookId, setSavingPlaybookId] = useState("");
const [savedPlaybookAlertIds, setSavedPlaybookAlertIds] = useState<string[]>([]);
const [playbookOpen, setPlaybookOpen] = useState(false);
const [playbookLoading, setPlaybookLoading] = useState(false);
const [playbookError, setPlaybookError] = useState("");
const [playbookItems, setPlaybookItems] = useState<UserSignalPlaybookItem[]>([]);

const [signalProfileOpen, setSignalProfileOpen] = useState(false);
const [signalProfileLoading, setSignalProfileLoading] = useState(false);
const [signalProfileRebuilding, setSignalProfileRebuilding] = useState(false);
const [signalProfileError, setSignalProfileError] = useState("");
const [signalProfileItems, setSignalProfileItems] = useState<UserSignalProfileItem[]>([]);

const [tradePatternsOpen, setTradePatternsOpen] = useState(false);
const [tradePatternsLoading, setTradePatternsLoading] = useState(false);
const [tradePatternsRebuilding, setTradePatternsRebuilding] = useState(false);
const [tradePatternsError, setTradePatternsError] = useState("");
const [tradePatternItems, setTradePatternItems] = useState<UserTradePatternProfileItem[]>([]);

const [error, setError] = useState("");

  const safeLanguage: Language =
    language === "en" || language === "ua" || language === "ru"
      ? language
      : "ru";

  const rawCopy = {
    ru: {
      title: "AI Alerts Center",
      subtitle:
        "Сигналы за последние дни: направление, setup, entry zone, stop, targets, risk и management plan.",
      generate: "Сканировать рынок",
      generating: "Сканируем...",
      refresh: "Обновить",
      checkOutcomes: "Проверить результаты",
checkingOutcomes: "Проверяем...",
      empty: "Пока нет активных alerts. Запусти сканирование.",
      locked:
  "AI Alerts доступны только на SkillEdge Elite. На SkillEdge Edge открыт AI Scanner / Market Intelligence, но real-time AI Alerts, floating alerts widget и Signal-to-Journal workflow доступны только в Elite.",
      direction: "Направление",
structureTitle: "Структура рынка",
structureBased: "План построен по свечам / VWAP / уровням",
fallbackBased: "Fallback-план: не хватает свечей/уровней",
rr: "RR",
vwap: "VWAP",
atr: "ATR",
support: "Ближайшая поддержка",
resistance: "Ближайшее сопротивление",
candles: "Свечи",
missingData: "Не хватает данных",
      setup: "Сетап",
entry: "Зона входа",
stop: "Стоп",
targets: "Цели",
trigger: "Триггер",
reason: "Причина",
risk: "Риск",
scenario: "Сценарий",
invalidation: "Отмена идеи",
management: "Управление",
confidence: "Уверенность",
status: "Статус",
outcome: "Исход",
time: "Время",
worked: "Отработал",
failed: "Не отработал",
pending: "В ожидании",
neutral: "Нейтрально",
avgMfe: "Средний MFE",
avgMae: "Средний MAE",
tpHit: "TP достигнут",
stopHit: "Стоп задет",
quality: "Качество",
saveToPlaybook: "Сохранить в Playbook",
savingToPlaybook: "Сохраняем...",
savedToPlaybook: "Сохранено",
createTradeDraft: "Создать сделку из сигнала",
openPlaybook: "Открыть Playbook",
hidePlaybook: "Скрыть Playbook",
playbookTitle: "Personal Signal Playbook",
playbookText:
  "Твоя личная база сохранённых сетапов: логика, подтверждение, ошибки и примеры сигналов.",
playbookEmpty:
  "Пока нет сохранённых сетапов. Нажми Save to Playbook на любом сигнале.",
playbookLoading: "Загружаем playbook...",
lastExample: "Last example",
openSignalProfile: "Открыть Signal Profile",
hideSignalProfile: "Скрыть Signal Profile",
rebuildSignalProfile: "Пересобрать профиль",
rebuildingSignalProfile: "Собираем профиль...",
signalProfileTitle: "Personal Signal Profile",
signalProfileText:
  "SkillEdge AI показывает, какие AI-сетапы ты торгуешь лучше, где теряешь деньги и какие сигналы стоит приоритезировать.",
signalProfileEmpty:
  "Профиль пока пустой. Создай сделки из AI Alerts и сохрани их в журнал.",
signalProfileLoading: "Загружаем signal profile...",
personalStrength: "Personal strength",
riskZone: "Risk zone",
learningProfile: "Learning",
neutralProfile: "Neutral",
strengthScore: "Strength score",
planAdherence: "Plan adherence",
aiNote: "AI note",
openTradePatterns: "Открыть Trade Patterns",
hideTradePatterns: "Скрыть Trade Patterns",
rebuildTradePatterns: "Найти мои паттерны",
rebuildingTradePatterns: "Ищем паттерны...",
tradePatternsTitle: "Independent Trade Pattern Profile",
tradePatternsText:
  "SkillEdge AI анализирует твои самостоятельные прибыльные сделки и ищет повторяющиеся паттерны, которые потом можно использовать для персональных AI Alerts.",
tradePatternsEmpty:
  "Пока нет найденных паттернов. Добавь в Journal несколько самостоятельных прибыльных сделок.",
tradePatternsLoading: "Загружаем trade patterns...",
patternStrength: "Pattern strength",
examples: "Examples",
keywords: "Keywords",
filterAll: "Все",
filterActionable: "Actionable",
filterWatchlist: "Watchlist",
filterPriority: "Приоритет",
filterCaution: "Осторожно",
filterJournalMatch: "Совпадение с журналом",
filterAiStrength: "AI-сила",
filterLong: "Long",
filterShort: "Short",
filterCrypto: "Крипто",
filterStocks: "Акции",
assetFilterAll: "Все рынки",
assetFilterStocks: "Акции",
assetFilterCrypto: "Крипто",
assetFilterText: "Выбери поток сигналов: акции, крипто или общий desk.",
filterDecisionWatching: "Наблюдаю",
filterDecisionTaken: "Взял",
filterDecisionSkipped: "Пропустил",
filterDecisionMissed: "Упустил",
decisionAnalyticsTitle: "Signal-to-Trade Decisions",
decisionAnalyticsText:
  "Тут видно, як клієнт працює з сигналами: спостерігає, бере, пропускає або відмічає missed. Це база майбутньої статистики якості сигналів і виконання.",
filterEmpty: "Нет alerts под выбранный фильтр.",
openAlertDetails: "Открыть разбор",
hideAlertDetails: "Скрыть разбор",
liveDesk: "Live AI Trading Desk",
lastChecked: "Последняя проверка",
autoRefreshNote:
  "Alerts обновляются автоматически. Market scan работает в фоне, список обновляется каждые 60 секунд.",
showMoreAlerts: "Показать ещё 10",
collapseAlerts: "Свернуть всё",   
smartTopFive:
  "Первые 5 alerts отсортированы по важности: priority, journal match, AI strength, confidence и свежесть сигнала.", 
emptyDeskTitle: "AI Trading Desk ждёт качественный сетап",
emptyDeskText:
  "Сейчас нет активных alerts под выбранный фильтр. Это нормально: SkillEdge AI не должен стрелять мусором. Система ждёт high-confidence ситуацию с понятным trigger, stop, targets и risk note.",
emptyDeskAction:
  "Оставь страницу открытой — список обновляется автоматически каждые 60 секунд.",
confidenceTransparency: "Score transparency",
confidenceTransparencyText:
  "Почему SkillEdge AI выделил этот сигнал и какие факторы усиливают или ослабляют идею.",
breakdownTitle: "SkillEdge AI Signal Breakdown",
traderDecision: "Решение трейдера",
tradePlan: "План сделки",
whyNow: "Почему сейчас",
confirmationChecklist: "Чеклист подтверждения",
avoidThisTradeIf: "Не торговать, если",
learningLayer: "Обучающий слой",
decisionWatching: "Наблюдаю",
decisionTaken: "Взял",
decisionSkipped: "Пропустил",
decisionMissed: "Упустил",
decisionSaved: "Решение сохранено",
decisionReasonTitle: "Причина решения",
reasonCleanTrigger: "Чистый триггер",
reasonGoodRiskReward: "Хороший RR",
reasonJournalMatch: "Совпадает с журналом",
reasonNoConfirmation: "Нет подтверждения",
reasonTooLate: "Слишком поздно",
reasonRiskHigh: "Риск слишком высокий",
reasonLiquidity: "Спред / ликвидность",
reasonNotAtDesk: "Не был у экрана",
reasonTradeDraftCreated: "Сделка из сигнала создана",
topReason: "Главная причина",
allReasons: "Все причины",
journalSyncTitle: "Journal Sync",
journalSyncText:
  "Ты отметил сигнал как Taken. Создай сделку из сигнала, чтобы SkillEdge сравнил план сигнала с твоим реальным исполнением: вход, стоп, выход, PnL и качество сделки.",
journalSyncAction: "Создать trade draft",
linkedJournalTitle: "Linked Journal Trade",
linkedJournalText:
  "Эта сделка уже связана с alert. SkillEdge сможет сравнить план сигнала с реальным исполнением клиента.",
linkedJournalEmpty:
  "Пока нет сохранённой сделки в журнале, связанной с этим alert.",
linkedTrades: "Linked trades",
linkedPnl: "Linked PnL",
linkedResult: "Result",
journalLinkAnalyticsTitle: "Signal в†” Journal Sync",
journalLinkAnalyticsText:
  "SkillEdge отслеживает, какие alerts превратились в реальные сделки в Journal. Это база для анализа исполнения, PnL по сигналам и пропущенных возможностей.",
takenWithoutJournal: "Taken без Journal",
linkedAlertsCount: "Linked alerts",
linkedTradesPnl: "Linked trades PnL",
avgExecutionScore: "Avg execution",
takenWithoutJournalFilter: "Taken без Journal",
takenWithoutJournalTitle: "Taken alert без сделки в Journal",
takenWithoutJournalText:
  "Клиент отметил сигнал как Taken, но ещё не сохранил сделку в журнал. Создай trade draft, чтобы SkillEdge смог сравнить план сигнала с реальным исполнением.",
executionScore: "Execution score",
executionReview: "Execution review",
executionStrong: "Сильное исполнение",
executionMedium: "Нормально, но есть что улучшить",
executionWeak: "Нужно разобрать исполнение",
filterJournalLinked: "Journal linked",
filterExecutionStrong: "Strong execution",
filterExecutionReview: "Needs review",
executionQualityTitle: "Execution Quality",
executionQualityText:
  "SkillEdge показывает, какие AI Alerts уже привели к сделкам в Journal и где исполнение было сильным или требует разбора.",
executionCoachTitle: "AI Execution Coach",
executionCoachText:
  "SkillEdge разбирает исполнение клиента относительно плана сигнала: вход, стоп, направление, targets и дисциплину.",
executionCoachStrong:
  "Сильное исполнение: клиент в целом следовал плану сигнала. Такие сделки стоит сохранять как личный сильный паттерн.",
executionCoachMedium:
  "Исполнение нормальное, но есть зоны для улучшения. Проверь вход, стоп и управление после первого target.",
executionCoachWeak:
  "Исполнение требует разбора. Вероятно, клиент отклонился от плана сигнала: поздний вход, другой стоп или слабое следование сценарию.",
executionCoachEntryIssue:
  "Entry issue: вход был вне плановой зоны или слишком поздно относительно сигнала.",
executionCoachStopIssue:
  "Stop issue: стоп отличается от плана сигнала. Это может ломать статистику и risk/reward.",
executionCoachDirectionIssue:
  "Direction issue: направление сделки отличается от направления alert.",
executionCoachTargetIssue:
  "Target issue: сделка не дошла до TP или выход был не по плану.",
executionWeaknessTitle: "Execution Weakness Map",
executionWeaknessText:
  "SkillEdge показывает, где клиент чаще всего отклоняется от плана сигнала: вход, стоп, направление или управление целями.",
entryIssueFilter: "Entry issues",
stopIssueFilter: "Stop issues",
directionIssueFilter: "Direction issues",
targetIssueFilter: "Target issues",
executionFocusTitle: "Personal Execution Focus",
executionFocusText:
  "SkillEdge выбирает главный фокус на основе связанных Journal-сделок и отклонений от плана сигнала.",
executionFocusEmpty:
  "Пока недостаточно linked trades для персонального фокуса. Создай сделки из сигналов, чтобы SkillEdge начал находить повторяющиеся слабые места.",
focusEntryText:
  "Главный фокус — entry timing. Проверь, не входишь ли ты поздно или вне плановой зоны сигнала.",
focusStopText:
  "Главный фокус — stop discipline. Проверь, не меняешь ли стоп относительно плана и не ломаешь ли risk/reward.",
focusDirectionText:
  "Главный фокус — direction discipline. Проверь, не торгуешь ли против направления alert или без подтверждения сценария.",
focusTargetText:
  "Главный фокус — target management. Проверь, как ты ведёшь сделку после входа и не выходишь ли хаотично.",
focusStrongText:
  "Исполнение выглядит сильным. Продолжай фиксировать такие сделки — это база для будущих Personal AI Alerts.",
openFocusAlerts: "Открыть alerts с этим фокусом",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge превращает главный execution focus в конкретные правила на следующую торговую неделю.",
entryActionOne: "Бери вход только внутри плановой entry zone или после подтверждённого reclaim/rejection.",
entryActionTwo: "Не догоняй свечу после trigger — поздний вход лучше отметить как Missed.",
entryActionThree: "Перед входом проверь: цена, стоп и риск всё ещё дают нормальный risk/reward.",
stopActionOne: "Перед сделкой заранее запиши stop/invalidation и не двигай его без нового сценария.",
stopActionTwo: "Если стоп отличается от плана alert — уменьши размер позиции или пропусти сделку.",
stopActionThree: "После сделки проверь, не сломал ли изменённый стоп ожидаемый risk/reward.",
directionActionOne: "Не торгуй против direction alert без сильного reverse-confirmation.",
directionActionTwo: "Перед входом проверь, совпадает ли твоя сделка с направлением setup.",
directionActionThree: "Если рынок сменил структуру — отметь alert как Skipped/Missed, а не входи импульсивно.",
targetActionOne: "До входа выбери основной target и partial plan.",
targetActionTwo: "После TP1 не выходи хаотично — веди сделку по заранее заданному management plan.",
targetActionThree: "Если цена не идёт к target — оцени invalidation, а не надейся.",
strongActionOne: "Продолжай сохранять сделки, где ты следовал плану alert.",
strongActionTwo: "Ищи повторяемость: какие setup чаще дают сильное исполнение.",
strongActionThree: "Эти сделки позже станут базой для Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge сравнивает решение клиента с фактическим исходом сигнала, чтобы находить missed opportunities, хорошие пропуски и сделки, которые требуют разбора.",
outcomeTakenWorked:
  "Ты взял сигнал, и он отработал. Проверь, была ли сделка сохранена в Journal и насколько исполнение совпало с планом.",
outcomeTakenFailed:
  "Ты взял сигнал, но он не отработал. Разбери, было ли подтверждение, не был ли вход поздним и был ли стоп по плану.",
outcomeSkippedWorked:
  "Сигнал был пропущен, но позже отработал. Это missed opportunity — проверь, почему не было входа: страх, отсутствие у экрана или сомнение.",
outcomeSkippedFailed:
  "Сигнал был пропущен, и он не отработал. Это хороший фильтр — сохрани причину, почему ты не входил.",
outcomeMissedWorked:
  "Ты отметил сигнал как Missed, и он отработал. Это важная возможность для обучения: что помешало включиться вовремя?",
outcomeMissedFailed:
  "Ты отметил сигнал как Missed, но он не отработал. Пропуск был безопасным, но всё равно проверь, была ли идея качественной.",
outcomePendingNote:
  "Outcome ещё pending. Позже SkillEdge сможет сравнить твоё решение с фактическим движением цены.",
outcomeNeutralNote:
  "Outcome neutral. Сигнал не дал чистого follow-through, поэтому важно оценивать только качество решения, а не только PnL.",
outcomeLearningLabel: "Learning note",
outcomeStatsLabel: "Outcome stats",
outcomeLearningAnalyticsTitle: "Outcome Learning Analytics",
outcomeLearningAnalyticsText:
  "SkillEdge группирует alerts по решению клиента и фактическому результату сигнала: что было взято, что провалилось, что стало missed opportunity и где клиент правильно отфильтровал плохую идею.",
filterTakenWorked: "Taken + Worked",
filterTakenFailed: "Taken + Failed",
filterMissedOpportunity: "Missed opportunity",
filterGoodSkip: "Good skip",
takenWorkedText: "Сигналы, которые клиент взял и которые отработали.",
takenFailedText: "Сигналы, которые клиент взял, но они не отработали.",
missedOpportunityText: "Сигналы, которые клиент пропустил, но они позже отработали.",
goodSkipText: "Сигналы, которые клиент пропустил, и они не отработали.",
outcomeLearningFocusTitle: "Outcome Learning Focus",
outcomeLearningFocusText:
  "SkillEdge выбирает главный фокус обучения на основе того, как решения клиента совпали с фактическим исходом сигналов.",
outcomeFocusTakenWorked:
  "Сильная зона: клиент берёт сигналы, которые отрабатывают. Теперь важно проверить качество исполнения и повторяемость этих setup.",
outcomeFocusTakenFailed:
  "Главный фокус — taken failed. Клиент берёт сигналы, которые не отрабатывают. Нужно проверить подтверждение, вход, риск и фильтры качества.",
outcomeFocusMissedOpportunity:
  "Главный фокус — missed opportunities. Клиент пропускает сигналы, которые потом отрабатывают. Нужно понять причину: страх, сомнение, отсутствие у экрана или поздняя реакция.",
outcomeFocusGoodSkip:
  "Сильная зона фильтрации: клиент пропускает сигналы, которые не отрабатывают. Нужно сохранить причины таких решений в playbook.",
outcomeFocusEmpty:
  "Пока недостаточно отмеченных решений и outcomes. Отмечай alerts как Taken, Skipped или Missed, чтобы SkillEdge начал строить learning focus.",
openOutcomeFocusAlerts: "Открыть alerts с этим фокусом",
missedOpportunityCoachTitle: "Missed Opportunity Coach",
missedOpportunityCoachText:
  "SkillEdge разбирает рабочие сигналы, которые клиент пропустил, чтобы найти повторяющуюся причину: страх, отсутствие у экрана, поздняя реакция или слабое доверие к setup.",
missedOpportunityCoachEmpty:
  "Пока нет missed opportunities. Это хорошо: либо клиент не пропускал рабочие сигналы, либо outcomes ещё формируются.",
missedOpportunityTopSetup: "Top missed setup",
missedOpportunityActionPlan: "Missed Opportunity Action Plan",
missedOpportunityActionOne:
  "Перед сессией выбери 2–3 setup, которые ты готов торговать без сомнений при появлении trigger.",
missedOpportunityActionTwo:
  "Если trigger появился, но ты не вошёл — сразу отметь причину: страх, поздно, не у экрана или не хватило подтверждения.",
missedOpportunityActionThree:
  "Если сигнал отработал без тебя — добавь его в playbook и реши, что должно измениться, чтобы в следующий раз не пропустить.",
alertsStateLoadingTitle: "SkillEdge AI сканирует рынок",
alertsStateLoadingText:
  "Загружаем последние alerts, проверяем персональный приоритет, журнал, outcomes и свежесть сигналов.",
alertsStateErrorTitle: "Не удалось загрузить AI Alerts",
alertsStateErrorText:
  "Проверь подключение, авторизацию или повтори запрос. Если ошибка повторяется — это нужно проверить в backend/API logs.",
alertsStateEmptyTitle: "AI Trading Desk ждёт качественный сетап",
alertsStateEmptyText:
  "Сейчас нет активных alerts. Это нормально: SkillEdge не должен стрелять шумом. Лучше меньше сигналов, но выше качество и понятнее риск.",
alertsStateFilterEmptyTitle: "Под этот фильтр alerts нет",
alertsStateFilterEmptyText:
  "Список работает, но текущий фильтр не нашёл подходящих сигналов. Сбрось фильтр или дождись новой high-confidence ситуации.",
alertsStateResetFilters: "Сбросить фильтры",
alertsStateRetry: "Повторить загрузку",
alertsStateRunScan: "Запустить скан",
alertsStateLiveNote: "Live monitoring работает в фоне",
selectedFilter: "Выбранный фильтр",
totalAlerts: "Всего alerts",
alertsStateErrorLabel: "Ошибка",
alertsStateLoadingLabel: "Загрузка",
alertsStateWaitingLabel: "Ожидание",
alertsStateLiveMonitoringLabel: "Фоновый мониторинг",
decisionVsOutcomeLabel: "Решение / outcome",
nextLearningFocus: "Следующий learning focus",
noFocusYet: "Фокус пока не сформирован",
outcomeProfileStillForming: "Outcome learning profile ещё формируется",
missedOpportunitiesLabel: "missed opportunities",
noMissedOpportunityPatternTitle: "Паттерн missed opportunities пока не сформирован",
workedAlertsMissedSuffix: "рабочих alerts были пропущены в этой группе setup.",
},
    en: {
      title: "AI Alerts Center",
      subtitle:
        "Recent signals: direction, setup, entry zone, stop, targets, risk and management plan.",
      generate: "Scan market",
      generating: "Scanning...",
      refresh: "Refresh",
      checkOutcomes: "Check outcomes",
checkingOutcomes: "Checking...",
      empty: "No active alerts yet. Run market scan.",
      locked:
  "AI Alerts are available only on SkillEdge Elite. SkillEdge Edge includes AI Scanner / Market Intelligence, but real-time AI Alerts, floating alerts widget and Signal-to-Journal workflow are reserved for Elite.",
      direction: "Direction",
      structureTitle: "Market structure",
structureBased: "Plan built from candles / VWAP / levels",
fallbackBased: "Fallback plan: candles/levels are missing",
rr: "RR",
vwap: "VWAP",
atr: "ATR",
support: "Nearest support",
resistance: "Nearest resistance",
candles: "Candles",
missingData: "Missing data",
      setup: "Setup",
      entry: "Entry zone",
      stop: "Stop",
      targets: "Targets",
      trigger: "Trigger",
      reason: "Reason",
      risk: "Risk",
      scenario: "Scenario",
      invalidation: "Invalidation",
      management: "Management",
      confidence: "Confidence",
      status: "Status",
      outcome: "Outcome",
time: "Time",
worked: "Worked",
failed: "Failed",
pending: "Pending",
neutral: "Neutral",
avgMfe: "Avg MFE",
avgMae: "Avg MAE",
tpHit: "TP hit",
stopHit: "Stop hit",
quality: "Quality",
saveToPlaybook: "Save to Playbook",
savingToPlaybook: "Saving...",
savedToPlaybook: "Saved",
createTradeDraft: "Create trade draft",
openPlaybook: "Open Playbook",
hidePlaybook: "Hide Playbook",
playbookTitle: "Personal Signal Playbook",
playbookText:
  "Your personal database of saved setups: logic, confirmation, mistakes and signal examples.",
playbookEmpty:
  "No saved setups yet. Click Save to Playbook on any signal.",
playbookLoading: "Loading playbook...",
lastExample: "Last example",
openSignalProfile: "Open Signal Profile",
hideSignalProfile: "Hide Signal Profile",
rebuildSignalProfile: "Rebuild profile",
rebuildingSignalProfile: "Rebuilding...",
signalProfileTitle: "Personal Signal Profile",
signalProfileText:
  "SkillEdge AI shows which AI setups you execute best, where you lose money, and which signals should be prioritized.",
signalProfileEmpty:
  "Profile is empty yet. Create trades from AI Alerts and save them to the journal.",
signalProfileLoading: "Loading signal profile...",
personalStrength: "Personal strength",
riskZone: "Risk zone",
learningProfile: "Learning",
neutralProfile: "Neutral",
strengthScore: "Strength score",
planAdherence: "Plan adherence",
aiNote: "AI note",
openTradePatterns: "Open Trade Patterns",
hideTradePatterns: "Hide Trade Patterns",
rebuildTradePatterns: "Find my patterns",
rebuildingTradePatterns: "Finding patterns...",
tradePatternsTitle: "Independent Trade Pattern Profile",
tradePatternsText:
  "SkillEdge AI analyzes your independent profitable journal trades and finds repeated patterns for future Personal AI Alerts.",
tradePatternsEmpty:
  "No patterns found yet. Add several independent profitable trades to the Journal.",
tradePatternsLoading: "Loading trade patterns...",
patternStrength: "Pattern strength",
examples: "Examples",
keywords: "Keywords",
filterAll: "All",
filterActionable: "Actionable",
filterWatchlist: "Watchlist",
filterPriority: "Priority",
filterCaution: "Caution",
filterJournalMatch: "Journal Match",
filterAiStrength: "AI Strength",
filterLong: "Long",
filterShort: "Short",
filterCrypto: "Crypto",
filterStocks: "Stocks",
assetFilterAll: "All markets",
assetFilterStocks: "Stocks",
assetFilterCrypto: "Crypto",
assetFilterText: "Choose the signal stream: stocks, crypto or the full desk.",
filterDecisionWatching: "Watching",
filterDecisionTaken: "Taken",
filterDecisionSkipped: "Skipped",
filterDecisionMissed: "Missed",
decisionAnalyticsTitle: "Signal-to-Trade Decisions",
decisionAnalyticsText:
  "See how the client handles alerts: watching, taken, skipped or missed. This becomes the base for future signal quality and execution analytics.",
filterEmpty: "No alerts for the selected filter.",
openAlertDetails: "Open breakdown",
hideAlertDetails: "Hide breakdown",
liveDesk: "Live AI Trading Desk",
lastChecked: "Last checked",
autoRefreshNote:
  "Alerts refresh automatically. Market scan runs in the background, list updates every 60 seconds.",
showMoreAlerts: "Show 10 more",
collapseAlerts: "Collapse all",    
smartTopFive:
  "Top 5 alerts are ranked by priority, journal match, AI strength, confidence and freshness.",
emptyDeskTitle: "AI Trading Desk is waiting for a quality setup",
emptyDeskText:
  "There are no active alerts for the selected filter right now. That is normal: SkillEdge AI should not fire low-quality noise. The system is waiting for a high-confidence situation with clear trigger, stop, targets and risk note.",
emptyDeskAction:
  "Keep the page open — the list refreshes automatically every 60 seconds.",
confidenceTransparency: "Score transparency",
confidenceTransparencyText:
  "Why SkillEdge AI highlighted this signal and which factors strengthen or weaken the idea.",
breakdownTitle: "SkillEdge AI Signal Breakdown",
traderDecision: "Trader Decision",
tradePlan: "Trade Plan",
whyNow: "Why now",
confirmationChecklist: "Confirmation Checklist",
avoidThisTradeIf: "Avoid This Trade If",
learningLayer: "Learning Layer",
closeBreakdown: "Close breakdown",
decisionTitle: "My decision",
decisionWatching: "Watching",
decisionTaken: "Taken",
decisionSkipped: "Skipped",
decisionMissed: "Missed",
decisionSaved: "Decision saved",
decisionReasonTitle: "Decision reason",
reasonCleanTrigger: "Clean trigger",
reasonGoodRiskReward: "Good RR",
reasonJournalMatch: "Journal match",
reasonNoConfirmation: "No confirmation",
reasonTooLate: "Too late",
reasonRiskHigh: "Risk too high",
reasonLiquidity: "Spread / liquidity",
reasonNotAtDesk: "Not at desk",
reasonTradeDraftCreated: "Trade draft created",
reasonInsightsTitle: "Execution reason insights",
reasonInsightsText:
  "SkillEdge tracks decision reasons to show where the client loses the best opportunities: late reaction, no confirmation, high risk or liquidity issues.",
topReason: "Top reason",
allReasons: "All reasons",
journalSyncTitle: "Journal Sync",
journalSyncText:
  "You marked this signal as Taken. Create a trade draft so SkillEdge can compare the signal plan with your real execution: entry, stop, exit, PnL and trade quality.",
journalSyncAction: "Create trade draft",
linkedJournalTitle: "Linked Journal Trade",
linkedJournalText:
  "This trade is already linked to the alert. SkillEdge can compare the signal plan with the client’s real execution.",
linkedJournalEmpty:
  "No saved journal trade is linked to this alert yet.",
linkedTrades: "Linked trades",
linkedPnl: "Linked PnL",
linkedResult: "Result",
journalLinkAnalyticsTitle: "Signal в†” Journal Sync",
journalLinkAnalyticsText:
  "SkillEdge tracks which alerts became real Journal trades. This is the base for execution analysis, signal PnL and missed opportunity analytics.",
takenWithoutJournal: "Taken without Journal",
linkedAlertsCount: "Linked alerts",
linkedTradesPnl: "Linked trades PnL",
avgExecutionScore: "Avg execution",
takenWithoutJournalFilter: "Taken without Journal",
takenWithoutJournalTitle: "Taken alert without Journal trade",
takenWithoutJournalText:
  "The client marked this signal as Taken but has not saved a Journal trade yet. Create a trade draft so SkillEdge can compare the signal plan with real execution.",
executionScore: "Execution score",
executionReview: "Execution review",
executionStrong: "Strong execution",
executionMedium: "Good, but needs improvement",
executionWeak: "Needs execution review",
filterJournalLinked: "Journal linked",
filterExecutionStrong: "Strong execution",
filterExecutionReview: "Needs review",
executionQualityTitle: "Execution Quality",
executionQualityText:
  "SkillEdge shows which AI Alerts already became Journal trades and where execution was strong or needs review.",
executionCoachTitle: "AI Execution Coach",
executionCoachText:
  "SkillEdge reviews the client’s execution against the signal plan: entry, stop, direction, targets and discipline.",
executionCoachStrong:
  "Strong execution: the client mostly followed the signal plan. These trades should be saved as a personal strength pattern.",
executionCoachMedium:
  "Execution was acceptable, but there are areas to improve. Review entry timing, stop placement and management after the first target.",
executionCoachWeak:
  "Execution needs review. The client likely deviated from the signal plan: late entry, different stop or weak scenario discipline.",
executionCoachEntryIssue:
  "Entry issue: the entry was outside the planned zone or too late after the signal.",
executionCoachStopIssue:
  "Stop issue: the stop differs from the signal plan. This may break statistics and risk/reward.",
executionCoachDirectionIssue:
  "Direction issue: the trade direction differs from the alert direction.",
executionCoachTargetIssue:
  "Target issue: the trade did not reach TP or the exit did not follow the plan.",
executionWeaknessTitle: "Execution Weakness Map",
executionWeaknessText:
  "SkillEdge shows where the client most often deviates from the signal plan: entry, stop, direction or target management.",
entryIssueFilter: "Entry issues",
stopIssueFilter: "Stop issues",
directionIssueFilter: "Direction issues",
targetIssueFilter: "Target issues",
executionFocusTitle: "Personal Execution Focus",
executionFocusText:
  "SkillEdge selects the main focus based on linked Journal trades and deviations from the signal plan.",
executionFocusEmpty:
  "Not enough linked trades for a personal focus yet. Create trades from alerts so SkillEdge can detect repeated execution weaknesses.",
focusEntryText:
  "Main focus: entry timing. Check whether you enter late or outside the planned signal zone.",
focusStopText:
  "Main focus: stop discipline. Check whether you change the stop versus the plan and break risk/reward.",
focusDirectionText:
  "Main focus: direction discipline. Check whether you trade against the alert direction or without scenario confirmation.",
focusTargetText:
  "Main focus: target management. Check how you manage the trade after entry and whether exits are chaotic.",
focusStrongText:
  "Execution looks strong. Keep logging these trades — they become the base for future Personal AI Alerts.",
openFocusAlerts: "Open alerts with this focus",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge turns the main execution focus into concrete rules for the next trading week.",
entryActionOne: "Only take entries inside the planned entry zone or after confirmed reclaim/rejection.",
entryActionTwo: "Do not chase after the trigger candle — late entry should be marked as Missed.",
entryActionThree: "Before entry, check that price, stop and risk still offer valid risk/reward.",
stopActionOne: "Before the trade, write the stop/invalidation and do not move it without a new scenario.",
stopActionTwo: "If your stop differs from the alert plan, reduce size or skip the trade.",
stopActionThree: "After the trade, check whether the changed stop broke the expected risk/reward.",
directionActionOne: "Do not trade against the alert direction without strong reverse confirmation.",
directionActionTwo: "Before entry, check whether your trade matches the setup direction.",
directionActionThree: "If market structure changes, mark the alert as Skipped/Missed instead of entering impulsively.",
targetActionOne: "Before entry, choose the main target and partial plan.",
targetActionTwo: "After TP1, do not exit randomly — manage the trade by the predefined plan.",
targetActionThree: "If price does not move toward target, evaluate invalidation instead of hoping.",
strongActionOne: "Keep saving trades where you followed the alert plan.",
strongActionTwo: "Look for repetition: which setups produce strong execution most often.",
strongActionThree: "These trades become the base for Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge compares the client’s decision with the actual signal outcome to detect missed opportunities, good skips and trades that need review.",
outcomeTakenWorked:
  "You took the signal and it worked. Check whether the trade was saved in Journal and how closely execution followed the plan.",
outcomeTakenFailed:
  "You took the signal but it failed. Review confirmation, late entry risk and whether the stop followed the plan.",
outcomeSkippedWorked:
  "The signal was skipped and then worked. This is a missed opportunity — check why you did not enter: fear, not at desk or hesitation.",
outcomeSkippedFailed:
  "The signal was skipped and failed. This was a good filter — save the reason why you avoided it.",
outcomeMissedWorked:
  "You marked the signal as Missed and it worked. This is an important learning opportunity: what stopped you from acting in time?",
outcomeMissedFailed:
  "You marked the signal as Missed but it failed. The miss was safe, but still review whether the idea was high quality.",
outcomePendingNote:
  "Outcome is still pending. SkillEdge can compare your decision with the actual price path once enough market data is available.",
outcomeNeutralNote:
  "Outcome is neutral. The signal did not give clean follow-through, so focus on decision quality rather than PnL only.",
outcomeLearningLabel: "Learning note",
outcomeStatsLabel: "Outcome stats",
outcomeLearningAnalyticsTitle: "Outcome Learning Analytics",
outcomeLearningAnalyticsText:
  "SkillEdge groups alerts by the client’s decision and the actual signal outcome: what was taken, what failed, what became a missed opportunity and where the client correctly filtered a bad idea.",
filterTakenWorked: "Taken + Worked",
filterTakenFailed: "Taken + Failed",
filterMissedOpportunity: "Missed opportunity",
filterGoodSkip: "Good skip",
takenWorkedText: "Signals the client took and that worked.",
takenFailedText: "Signals the client took but they failed.",
missedOpportunityText: "Signals the client skipped or missed, but they eventually worked.",
goodSkipText: "Signals the client skipped or missed, and they failed.",
outcomeLearningFocusTitle: "Outcome Learning Focus",
outcomeLearningFocusText:
  "SkillEdge selects the main learning focus based on how the client’s decisions matched the actual signal outcomes.",
outcomeFocusTakenWorked:
  "Strength zone: the client takes signals that work. Now review execution quality and setup repeatability.",
outcomeFocusTakenFailed:
  "Main focus: taken failed. The client takes signals that fail. Review confirmation, entry timing, risk and quality filters.",
outcomeFocusMissedOpportunity:
  "Main focus: missed opportunities. The client skips or misses signals that eventually work. Identify the cause: fear, hesitation, not at desk or late reaction.",
outcomeFocusGoodSkip:
  "Strong filtering zone: the client skips signals that fail. Save the reasons behind these decisions into the playbook.",
outcomeFocusEmpty:
  "Not enough marked decisions and outcomes yet. Mark alerts as Taken, Skipped or Missed so SkillEdge can build a learning focus.",
openOutcomeFocusAlerts: "Open alerts with this focus",
missedOpportunityCoachTitle: "Missed Opportunity Coach",
missedOpportunityCoachText:
  "SkillEdge reviews working signals the client skipped or missed to find the repeated cause: fear, not at desk, late reaction or weak trust in the setup.",
missedOpportunityCoachEmpty:
  "No missed opportunities yet. This is good: either the client did not skip working signals, or outcomes are still forming.",
missedOpportunityTopSetup: "Top missed setup",
missedOpportunityActionPlan: "Missed Opportunity Action Plan",
missedOpportunityActionOne:
  "Before the session, choose 2–3 setups you are ready to trade without hesitation when the trigger appears.",
missedOpportunityActionTwo:
  "If the trigger appears but you do not enter, immediately mark the reason: fear, too late, not at desk or not enough confirmation.",
missedOpportunityActionThree:
  "If the signal worked without you, add it to the playbook and decide what must change so you do not miss it next time.",
alertsStateLoadingTitle: "SkillEdge AI is scanning the market",
alertsStateLoadingText:
  "Loading the latest alerts, checking personal priority, journal context, outcomes and signal freshness.",
alertsStateErrorTitle: "Failed to load AI Alerts",
alertsStateErrorText:
  "Check connection, authorization or retry the request. If the error repeats, review backend/API logs.",
alertsStateEmptyTitle: "AI Trading Desk is waiting for a quality setup",
alertsStateEmptyText:
  "There are no active alerts right now. This is normal: SkillEdge should not fire noisy signals. Fewer alerts with higher quality is better.",
alertsStateFilterEmptyTitle: "No alerts for this filter",
alertsStateFilterEmptyText:
  "The list is working, but the current filter did not match any alerts. Reset the filter or wait for a new high-confidence situation.",
alertsStateResetFilters: "Reset filters",
alertsStateRetry: "Retry loading",
alertsStateRunScan: "Run scan",
alertsStateLiveNote: "Live monitoring runs in the background",
selectedFilter: "Selected filter",
totalAlerts: "Total alerts",
alertsStateErrorLabel: "Error",
alertsStateLoadingLabel: "Loading",
alertsStateWaitingLabel: "Waiting",
alertsStateLiveMonitoringLabel: "Live monitoring",
decisionVsOutcomeLabel: "Decision / outcome",
nextLearningFocus: "Next learning focus",
noFocusYet: "No focus yet",
outcomeProfileStillForming: "Outcome learning profile is still forming",
missedOpportunitiesLabel: "missed opportunities",
noMissedOpportunityPatternTitle: "No missed opportunity pattern yet",
workedAlertsMissedSuffix: "worked alerts were missed in this setup group.",
},
    ua: {
      title: "AI Alerts Center",
      subtitle:
        "Останні сигнали: напрямок, setup, entry zone, stop, targets, risk і management plan.",
      generate: "Сканувати ринок",
      generating: "Скануємо...",
      refresh: "Оновити",
      checkOutcomes: "Перевірити результати",
checkingOutcomes: "Перевіряємо...",
      empty: "Активних alerts поки немає. Запусти сканування.",
      locked:
  "AI Alerts доступні тільки на SkillEdge Elite. SkillEdge Edge відкриває AI Scanner / Market Intelligence, але real-time AI Alerts, floating alerts widget і Signal-to-Journal workflow доступні тільки в Elite.",
      direction: "Direction",
      structureTitle: "Структура ринку",
structureBased: "План побудовано за свічками / VWAP / рівнями",
fallbackBased: "Fallback-план: бракує свічок/рівнів",
rr: "RR",
vwap: "VWAP",
atr: "ATR",
support: "Найближча підтримка",
resistance: "Найближчий опір",
candles: "Свічки",
missingData: "Бракує даних",
      setup: "Setup",
      entry: "Entry zone",
      stop: "Stop",
      targets: "Targets",
      trigger: "Trigger",
      reason: "Reason",
      risk: "Risk",
      scenario: "Scenario",
      invalidation: "Invalidation",
      management: "Management",
      confidence: "Confidence",
      status: "Status",
      outcome: "Outcome",
time: "Time",
worked: "Worked",
failed: "Failed",
pending: "Pending",
neutral: "Neutral",
avgMfe: "Avg MFE",
avgMae: "Avg MAE",
tpHit: "TP hit",
stopHit: "Stop hit",
quality: "Quality",
saveToPlaybook: "Save to Playbook",
savingToPlaybook: "Saving...",
savedToPlaybook: "Saved",
createTradeDraft: "Create trade draft",
openPlaybook: "Відкрити Playbook",
hidePlaybook: "Сховати Playbook",
playbookTitle: "Personal Signal Playbook",
playbookText:
  "Твоя особиста база збережених сетапів: логіка, підтвердження, помилки та приклади сигналів.",
playbookEmpty:
  "Збережених сетапів поки немає. Натисни Save to Playbook на будь-якому сигналі.",
playbookLoading: "Завантажуємо playbook...",
lastExample: "Last example",
openSignalProfile: "Відкрити Signal Profile",
hideSignalProfile: "Сховати Signal Profile",
rebuildSignalProfile: "Перезібрати профіль",
rebuildingSignalProfile: "Збираємо профіль...",
signalProfileTitle: "Personal Signal Profile",
signalProfileText:
  "SkillEdge AI показує, які AI-сетапи ти торгуєш краще, де втрачаєш гроші і які сигнали варто пріоритезувати.",
signalProfileEmpty:
  "Профіль поки порожній. Створи угоди з AI Alerts і збережи їх у журнал.",
signalProfileLoading: "Завантажуємо signal profile...",
personalStrength: "Personal strength",
riskZone: "Risk zone",
learningProfile: "Learning",
neutralProfile: "Neutral",
strengthScore: "Strength score",
planAdherence: "Plan adherence",
aiNote: "AI note",
openTradePatterns: "Відкрити Trade Patterns",
hideTradePatterns: "Сховати Trade Patterns",
rebuildTradePatterns: "Знайти мої патерни",
rebuildingTradePatterns: "Шукаємо патерни...",
tradePatternsTitle: "Independent Trade Pattern Profile",
tradePatternsText:
  "SkillEdge AI аналізує твої самостійні прибуткові угоди з Journal і знаходить повторювані патерни для майбутніх Personal AI Alerts.",
tradePatternsEmpty:
  "Патернів поки немає. Додай у Journal кілька самостійних прибуткових угод.",
tradePatternsLoading: "Завантажуємо trade patterns...",
patternStrength: "Pattern strength",
examples: "Examples",
keywords: "Keywords",
filterAll: "All",
filterActionable: "Actionable",
filterWatchlist: "Watchlist",
filterPriority: "Priority",
filterCaution: "Caution",
filterJournalMatch: "Journal Match",
filterAiStrength: "AI Strength",
filterLong: "Long",
filterShort: "Шорт",
filterCrypto: "Крипто",
filterStocks: "Акції",
assetFilterAll: "Усі ринки",
assetFilterStocks: "Акції",
assetFilterCrypto: "Крипто",
assetFilterText: "Обери потік сигналів: акції, крипто або повний desk.",
filterDecisionWatching: "Спостерігаю",
filterDecisionTaken: "Взяв",
filterDecisionSkipped: "Пропустив",
filterDecisionMissed: "Упустив",
decisionAnalyticsTitle: "Signal-to-Trade Decisions",
decisionAnalyticsText:
  "Тут видно, як клієнт працює з сигналами: спостерігає, бере, пропускає або відмічає missed. Це база майбутньої статистики якості сигналів і виконання.",
filterEmpty: "Немає alerts для вибраного фільтра.",
openAlertDetails: "Відкрити розбір",
hideAlertDetails: "Сховати розбір",
liveDesk: "Live AI Trading Desk",
lastChecked: "Остання перевірка",
autoRefreshNote:
  "Alerts оновлюються автоматично. Market scan працює у фоні, список оновлюється кожні 60 секунд.",
showMoreAlerts: "Показати ще 10",
collapseAlerts: "Згорнути все",    
emptyDeskTitle: "AI Trading Desk чекає якісний сетап",
emptyDeskText:
  "Зараз немає active alerts для вибраного фільтра. Це нормально: SkillEdge AI не має стріляти шумом. Система чекає high-confidence ситуацію з чітким trigger, stop, targets і risk note.",
emptyDeskAction:
  "Залиш сторінку відкритою — список оновлюється автоматично кожні 60 секунд.",
confidenceTransparency: "Score transparency",
confidenceTransparencyText:
  "Чому SkillEdge AI виділив цей сигнал і які фактори підсилюють або послаблюють ідею.",
breakdownTitle: "SkillEdge AI Signal Breakdown",
traderDecision: "Trader Decision",
tradePlan: "Trade Plan",
whyNow: "Why now",
confirmationChecklist: "Confirmation Checklist",
avoidThisTradeIf: "Avoid This Trade If",
learningLayer: "Learning Layer",
closeBreakdown: "Закрити розбір",
decisionTitle: "Моє рішення",
decisionWatching: "Watching",
decisionTaken: "Taken",
decisionSkipped: "Skipped",
decisionMissed: "Missed",
decisionSaved: "Decision saved",
decisionReasonTitle: "Причина рішення",
reasonCleanTrigger: "Clean trigger",
reasonGoodRiskReward: "Good RR",
reasonJournalMatch: "Journal match",
reasonNoConfirmation: "No confirmation",
reasonTooLate: "Too late",
reasonRiskHigh: "Risk too high",
reasonLiquidity: "Spread / liquidity",
reasonNotAtDesk: "Not at desk",
reasonTradeDraftCreated: "Trade draft created",
reasonInsightsTitle: "Execution reason insights",
reasonInsightsText:
  "SkillEdge відстежує причини рішень, щоб потім показувати, де клієнт втрачає найкращі можливості: запізнення, відсутність підтвердження, високий ризик або проблеми з ліквідністю.",
topReason: "Top reason",
allReasons: "Усі причини",
journalSyncTitle: "Journal Sync",
journalSyncText:
  "Ти відмітив сигнал як Taken. Створи угоду із сигналу, щоб SkillEdge порівняв план сигналу з твоїм реальним виконанням: вхід, стоп, вихід, PnL і якість угоди.",
journalSyncAction: "Створити trade draft",
linkedJournalTitle: "Linked Journal Trade",
linkedJournalText:
  "Ця угода вже пов’язана з alert. SkillEdge зможе порівняти план сигналу з реальним виконанням клієнта.",
linkedJournalEmpty:
  "Поки немає збереженої угоди в журналі, пов’язаної з цим alert.",
linkedTrades: "Linked trades",
linkedPnl: "Linked PnL",
linkedResult: "Result",
journalLinkAnalyticsTitle: "Signal в†” Journal Sync",
journalLinkAnalyticsText:
  "SkillEdge відстежує, які alerts стали реальними угодами в Journal. Це база для аналізу виконання, PnL по сигналах і пропущених можливостей.",
takenWithoutJournal: "Taken без Journal",
linkedAlertsCount: "Linked alerts",
linkedTradesPnl: "Linked trades PnL",
avgExecutionScore: "Avg execution",
takenWithoutJournalFilter: "Taken без Journal",
takenWithoutJournalTitle: "Taken alert без угоди в Journal",
takenWithoutJournalText:
  "Клієнт відмітив сигнал як Taken, але ще не зберіг угоду в журналі. Створи trade draft, щоб SkillEdge зміг порівняти план сигналу з реальним виконанням.",
executionScore: "Execution score",
executionReview: "Execution review",
executionStrong: "Сильне виконання",
executionMedium: "Нормально, але є що покращити",
executionWeak: "Потрібен розбір виконання",
filterJournalLinked: "Journal linked",
filterExecutionStrong: "Strong execution",
filterExecutionReview: "Needs review",
executionQualityTitle: "Execution Quality",
executionQualityText:
  "SkillEdge показує, які AI Alerts вже стали угодами в Journal і де виконання було сильним або потребує розбору.",
executionCoachTitle: "AI Execution Coach",
executionCoachText:
  "SkillEdge розбирає виконання клієнта відносно плану сигналу: вхід, стоп, напрямок, targets і дисципліну.",
executionCoachStrong:
  "Сильне виконання: клієнт загалом дотримався плану сигналу. Такі угоди варто зберігати як особистий сильний патерн.",
executionCoachMedium:
  "Виконання нормальне, але є зони для покращення. Перевір вхід, стоп і management після першого target.",
executionCoachWeak:
  "Виконання потребує розбору. Ймовірно, клієнт відійшов від плану сигналу: пізній вхід, інший стоп або слабка дисципліна сценарію.",
executionCoachEntryIssue:
  "Entry issue: вхід був поза плановою зоною або занадто пізно після сигналу.",
executionCoachStopIssue:
  "Stop issue: стоп відрізняється від плану сигналу. Це може ламати статистику і risk/reward.",
executionCoachDirectionIssue:
  "Direction issue: напрямок угоди відрізняється від напрямку alert.",
executionCoachTargetIssue:
  "Target issue: угода не дійшла до TP або вихід був не за планом.",
executionWeaknessTitle: "Execution Weakness Map",
executionWeaknessText:
  "SkillEdge показує, де клієнт найчастіше відхиляється від плану сигналу: вхід, стоп, напрямок або управління цілями.",
entryIssueFilter: "Entry issues",
stopIssueFilter: "Stop issues",
directionIssueFilter: "Direction issues",
targetIssueFilter: "Target issues",
executionFocusTitle: "Personal Execution Focus",
executionFocusText:
  "SkillEdge обирає головний фокус на основі пов’язаних Journal-угод і відхилень від плану сигналу.",
executionFocusEmpty:
  "Поки недостатньо linked trades для персонального фокусу. Створюй угоди з alerts, щоб SkillEdge почав знаходити повторювані слабкі місця.",
focusEntryText:
  "Головний фокус — entry timing. Перевір, чи не входиш ти запізно або поза плановою зоною сигналу.",
focusStopText:
  "Головний фокус — stop discipline. Перевір, чи не змінюєш стоп відносно плану і чи не ламаєш risk/reward.",
focusDirectionText:
  "Головний фокус — direction discipline. Перевір, чи не торгуєш проти напрямку alert або без підтвердження сценарію.",
focusTargetText:
  "Головний фокус — target management. Перевір, як ведеш угоду після входу і чи не виходиш хаотично.",
focusStrongText:
  "Виконання виглядає сильним. Продовжуй фіксувати такі угоди — це база для майбутніх Personal AI Alerts.",
openFocusAlerts: "Відкрити alerts з цим фокусом",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge перетворює головний execution focus на конкретні правила для наступного торгового тижня.",
entryActionOne: "Бери вхід тільки всередині планової entry zone або після підтвердженого reclaim/rejection.",
entryActionTwo: "Не наздоганяй свічку після trigger — пізній вхід краще відмітити як Missed.",
entryActionThree: "Перед входом перевір: ціна, стоп і ризик все ще дають нормальний risk/reward.",
stopActionOne: "Перед угодою заздалегідь запиши stop/invalidation і не рухай його без нового сценарію.",
stopActionTwo: "Якщо стоп відрізняється від плану alert — зменш позицію або пропусти угоду.",
stopActionThree: "Після угоди перевір, чи не зламав змінений стоп очікуваний risk/reward.",
directionActionOne: "Не торгуй проти direction alert без сильного reverse-confirmation.",
directionActionTwo: "Перед входом перевір, чи збігається твоя угода з напрямком setup.",
directionActionThree: "Якщо ринок змінив структуру — відміть alert як Skipped/Missed, а не входь імпульсивно.",
targetActionOne: "До входу обери основний target і partial plan.",
targetActionTwo: "Після TP1 не виходь хаотично — веди угоду за заздалегідь заданим management plan.",
targetActionThree: "Якщо ціна не йде до target — оцінюй invalidation, а не надійся.",
strongActionOne: "Продовжуй зберігати угоди, де ти дотримався плану alert.",
strongActionTwo: "Шукай повторюваність: які setup найчастіше дають сильне виконання.",
strongActionThree: "Ці угоди пізніше стануть базою для Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge порівнює рішення клієнта з фактичним результатом сигналу, щоб знаходити missed opportunities, хороші пропуски та угоди, які потребують розбору.",
outcomeTakenWorked:
  "Ти взяв сигнал, і він відпрацював. Перевір, чи збережена угода в Journal і наскільки виконання збіглося з планом.",
outcomeTakenFailed:
  "Ти взяв сигнал, але він не відпрацював. Розбери, чи було підтвердження, чи не був вхід пізнім і чи був стоп за планом.",
outcomeSkippedWorked:
  "Сигнал був пропущений, але потім відпрацював. Це missed opportunity — перевір, чому не було входу: страх, не був біля екрана або сумнів.",
outcomeSkippedFailed:
  "Сигнал був пропущений і не відпрацював. Це хороший фільтр — збережи причину, чому ти не входив.",
outcomeMissedWorked:
  "Ти відмітив сигнал як Missed, і він відпрацював. Це важлива можливість для навчання: що завадило включитися вчасно?",
outcomeMissedFailed:
  "Ти відмітив сигнал як Missed, але він не відпрацював. Пропуск був безпечним, але все одно перевір якість ідеї.",
outcomePendingNote:
  "Outcome ще pending. Пізніше SkillEdge зможе порівняти твоє рішення з фактичним рухом ціни.",
outcomeNeutralNote:
  "Outcome neutral. Сигнал не дав чистого follow-through, тому важливо оцінювати якість рішення, а не тільки PnL.",
outcomeLearningLabel: "Learning note",
outcomeStatsLabel: "Outcome stats",
outcomeLearningAnalyticsTitle: "Outcome Learning Analytics",
outcomeLearningAnalyticsText:
  "SkillEdge групує alerts за рішенням клієнта і фактичним результатом сигналу: що було взято, що провалилось, що стало missed opportunity і де клієнт правильно відфільтрував слабку ідею.",
filterTakenWorked: "Taken + Worked",
filterTakenFailed: "Taken + Failed",
filterMissedOpportunity: "Missed opportunity",
filterGoodSkip: "Good skip",
takenWorkedText: "Сигнали, які клієнт взяв і які відпрацювали.",
takenFailedText: "Сигнали, які клієнт взяв, але вони не відпрацювали.",
missedOpportunityText: "Сигнали, які клієнт пропустив, але вони потім відпрацювали.",
goodSkipText: "Сигнали, які клієнт пропустив, і вони не відпрацювали.",
outcomeLearningFocusTitle: "Outcome Learning Focus",
outcomeLearningFocusText:
  "SkillEdge обирає головний фокус навчання на основі того, як рішення клієнта збіглися з фактичним результатом сигналів.",
outcomeFocusTakenWorked:
  "Сильна зона: клієнт бере сигнали, які відпрацьовують. Тепер важливо перевірити якість виконання і повторюваність цих setup.",
outcomeFocusTakenFailed:
  "Головний фокус — taken failed. Клієнт бере сигнали, які не відпрацьовують. Потрібно перевірити підтвердження, вхід, ризик і фільтри якості.",
outcomeFocusMissedOpportunity:
  "Головний фокус — missed opportunities. Клієнт пропускає сигнали, які потім відпрацьовують. Потрібно зрозуміти причину: страх, сумнів, відсутність біля екрана або пізня реакція.",
outcomeFocusGoodSkip:
  "Сильна зона фільтрації: клієнт пропускає сигнали, які не відпрацьовують. Потрібно зберегти причини таких рішень у playbook.",
outcomeFocusEmpty:
  "Поки недостатньо відмічених рішень і outcomes. Відмічай alerts як Taken, Skipped або Missed, щоб SkillEdge почав будувати learning focus.",
openOutcomeFocusAlerts: "Відкрити alerts з цим фокусом",
missedOpportunityCoachTitle: "Missed Opportunity Coach",
missedOpportunityCoachText:
  "SkillEdge розбирає робочі сигнали, які клієнт пропустив, щоб знайти повторювану причину: страх, відсутність біля екрана, пізня реакція або слабка довіра до setup.",
missedOpportunityCoachEmpty:
  "Поки немає missed opportunities. Це добре: або клієнт не пропускав робочі сигнали, або outcomes ще формуються.",
missedOpportunityTopSetup: "Top missed setup",
missedOpportunityActionPlan: "Missed Opportunity Action Plan",
missedOpportunityActionOne:
  "Перед сесією обери 2–3 setup, які ти готовий торгувати без сумнівів при появі trigger.",
missedOpportunityActionTwo:
  "Якщо trigger з’явився, але ти не увійшов — одразу відміть причину: страх, запізно, не біля екрана або не вистачило підтвердження.",
missedOpportunityActionThree:
  "Якщо сигнал відпрацював без тебе — додай його в playbook і виріши, що має змінитися, щоб наступного разу не пропустити.",
alertsStateLoadingTitle: "SkillEdge AI сканує ринок",
alertsStateLoadingText:
  "Завантажуємо останні alerts, перевіряємо персональний пріоритет, журнал, outcomes і свіжість сигналів.",
alertsStateErrorTitle: "Не вдалося завантажити AI Alerts",
alertsStateErrorText:
  "Перевір підключення, авторизацію або повтори запит. Якщо помилка повторюється — потрібно перевірити backend/API logs.",
alertsStateEmptyTitle: "AI Trading Desk чекає якісний setup",
alertsStateEmptyText:
  "Зараз немає активних alerts. Це нормально: SkillEdge не має стріляти шумом. Краще менше сигналів, але вища якість і зрозуміліший ризик.",
alertsStateFilterEmptyTitle: "Для цього фільтра alerts немає",
alertsStateFilterEmptyText:
  "Список працює, але поточний фільтр не знайшов відповідних сигналів. Скинь фільтр або дочекайся нової high-confidence ситуації.",
alertsStateResetFilters: "Скинути фільтри",
alertsStateRetry: "Повторити завантаження",
alertsStateRunScan: "Запустити скан",
alertsStateLiveNote: "Live monitoring працює у фоні",
selectedFilter: "Selected filter",
totalAlerts: "Total alerts",
alertsStateErrorLabel: "Помилка",
alertsStateLoadingLabel: "Завантаження",
alertsStateWaitingLabel: "Очікування",
alertsStateLiveMonitoringLabel: "Live monitoring",
decisionVsOutcomeLabel: "Рішення / outcome",
nextLearningFocus: "Наступний learning focus",
noFocusYet: "Фокус ще не сформований",
outcomeProfileStillForming: "Outcome learning profile ще формується",
missedOpportunitiesLabel: "missed opportunities",
noMissedOpportunityPatternTitle: "Патерн missed opportunities ще не сформований",
workedAlertsMissedSuffix: "робочих alerts були пропущені в цій групі setup.",
},
  }
[safeLanguage];

  const alertCopyOverrides = {
    en: {
      commonMistakeLabel: "Common mistake:",
      scoreDisclaimer:
        "Score is not a guarantee. Trade only after confirmation, valid risk/reward and your own execution checklist.",
      closeBreakdownHint: "or click outside the window to close this breakdown.",
    },
    ru: {
      title: "Центр AI-сигналов",
      subtitle:
        "Сигналы за последние дни: направление, сетап, зона входа, стоп, цели, риск и план сопровождения.",
      empty: "Пока нет активных сигналов. Запусти сканирование рынка.",
      locked:
        "AI-сигналы доступны только на SkillEdge Elite. SkillEdge Edge открывает AI-сканер и рыночную разведку, но real-time AI-сигналы, плавающий виджет, связка сигналов с журналом и обучение на исходах доступны только в Elite.",
      saveToPlaybook: "Сохранить в плейбук",
      openPlaybook: "Открыть плейбук",
      hidePlaybook: "Скрыть плейбук",
      playbookTitle: "Личный плейбук сигналов",
      playbookText:
        "Личная база сохранённых сетапов: логика, подтверждение, ошибки и примеры сигналов.",
      playbookEmpty:
        "Пока нет сохранённых сетапов. Нажми «Сохранить в плейбук» на любом сигнале.",
      playbookLoading: "Загружаем плейбук...",
      lastExample: "Последний пример",
      openSignalProfile: "Открыть профиль сигналов",
      hideSignalProfile: "Скрыть профиль сигналов",
      signalProfileTitle: "Персональный профиль сигналов",
      signalProfileText:
        "SkillEdge AI показывает, какие AI-сетапы ты торгуешь лучше, где теряешь деньги и какие сигналы стоит приоритезировать.",
      signalProfileEmpty:
        "Профиль пока пустой. Создай сделки из AI-сигналов и сохрани их в журнал.",
      signalProfileLoading: "Загружаем профиль сигналов...",
      personalStrength: "Сильная сторона",
      riskZone: "Зона риска",
      learningProfile: "Обучение",
      neutralProfile: "Нейтрально",
      strengthScore: "Оценка силы",
      planAdherence: "Следование плану",
      aiNote: "AI-заметка",
      openTradePatterns: "Открыть паттерны сделок",
      hideTradePatterns: "Скрыть паттерны сделок",
      tradePatternsTitle: "Профиль самостоятельных торговых паттернов",
      tradePatternsText:
        "SkillEdge AI анализирует твои самостоятельные прибыльные сделки и ищет повторяющиеся паттерны для будущих персональных AI-сигналов.",
      tradePatternsEmpty:
        "Пока нет найденных паттернов. Добавь в журнал несколько самостоятельных прибыльных сделок.",
      tradePatternsLoading: "Загружаем торговые паттерны...",
      patternStrength: "Сила паттерна",
      examples: "Примеры",
      keywords: "Ключевые слова",
      filterActionable: "Готовые к действию",
      filterWatchlist: "Список наблюдения",
      filterLong: "Лонг",
      filterShort: "Шорт",
      decisionAnalyticsTitle: "Решения по сигналам",
      decisionAnalyticsText:
        "Здесь видно, как клиент работает с сигналами: наблюдает, берёт, пропускает или отмечает упущенную возможность. Это база будущей статистики качества сигналов и исполнения.",
      filterEmpty: "Нет сигналов под выбранный фильтр.",
      liveDesk: "Живой AI Trading Desk",
      autoRefreshNote:
        "Сигналы обновляются автоматически. Сканирование рынка работает в фоне, список обновляется каждые 60 секунд.",
      smartTopFive:
        "Первые 5 сигналов отсортированы по важности: приоритет, совпадение с журналом, AI-сила, уверенность и свежесть сигнала.",
      emptyDeskTitle: "AI Trading Desk ждёт качественный сетап",
      emptyDeskText:
        "Сейчас нет активных сигналов под выбранный фильтр. Это нормально: SkillEdge AI не должен стрелять шумом. Система ждёт high-confidence ситуацию с понятным триггером, стопом, целями и заметкой по риску.",
      confidenceTransparency: "Прозрачность оценки",
      confidenceTransparencyText:
        "Почему SkillEdge AI выделил этот сигнал и какие факторы усиливают или ослабляют идею.",
      breakdownTitle: "Разбор сигнала SkillEdge AI",
      journalSyncTitle: "Связка с журналом",
      journalSyncText:
        "Ты отметил сигнал как «Взял». Создай сделку из сигнала, чтобы SkillEdge позже сравнил план сигнала с реальным исполнением: вход, стоп, выход, PnL и качество сделки.",
      journalSyncAction: "Создать сделку из сигнала",
      linkedJournalTitle: "Связанная сделка в журнале",
      linkedJournalText:
        "Эта сделка уже связана с сигналом. SkillEdge сможет сравнить план сигнала с реальным исполнением клиента.",
      linkedJournalEmpty:
        "Пока нет сохранённой сделки в журнале, связанной с этим сигналом.",
      linkedTrades: "Связанные сделки",
      linkedPnl: "PnL связанных сделок",
      linkedResult: "Результат",
      journalLinkAnalyticsTitle: "Сигналы ↔ Журнал",
      journalLinkAnalyticsText:
        "SkillEdge отслеживает, какие сигналы превратились в реальные сделки в журнале. Это база для анализа исполнения, PnL по сигналам и упущенных возможностей.",
      takenWithoutJournal: "Взято без журнала",
      linkedAlertsCount: "Связанные сигналы",
      linkedTradesPnl: "PnL связанных сделок",
      avgExecutionScore: "Средняя оценка исполнения",
      takenWithoutJournalFilter: "Взято без журнала",
      takenWithoutJournalTitle: "Сигнал взят, но сделки в журнале нет",
      takenWithoutJournalText:
        "Клиент отметил сигнал как «Взял», но ещё не сохранил сделку в журнал. Создай сделку из сигнала, чтобы SkillEdge смог сравнить план сигнала с реальным исполнением.",
      executionScore: "Оценка исполнения",
      executionReview: "Разбор исполнения",
      filterJournalLinked: "Связано с журналом",
      filterExecutionStrong: "Сильное исполнение",
      filterExecutionReview: "Нужен разбор",
      executionQualityTitle: "Качество исполнения",
      executionQualityText:
        "SkillEdge показывает, какие AI-сигналы уже привели к сделкам в журнале и где исполнение было сильным или требует разбора.",
      executionCoachTitle: "AI-коуч исполнения",
      executionCoachText:
        "SkillEdge разбирает исполнение клиента относительно плана сигнала: вход, стоп, направление, цели и дисциплину.",
      executionCoachEntryIssue:
        "Проблема входа: вход был вне плановой зоны или слишком поздно относительно сигнала.",
      executionCoachStopIssue:
        "Проблема стопа: стоп отличается от плана сигнала. Это может ломать статистику и риск/потенциал.",
      executionCoachDirectionIssue:
        "Проблема направления: направление сделки отличается от направления сигнала.",
      executionCoachTargetIssue:
        "Проблема целей: сделка не дошла до TP или выход был не по плану.",
      executionWeaknessTitle: "Карта слабых мест исполнения",
      entryIssueFilter: "Проблемы входа",
      stopIssueFilter: "Проблемы стопа",
      directionIssueFilter: "Проблемы направления",
      targetIssueFilter: "Проблемы целей",
      executionFocusTitle: "Персональный фокус исполнения",
      openFocusAlerts: "Открыть сигналы с этим фокусом",
      executionActionPlanTitle: "План действий на неделю",
      executionActionPlanText:
        "SkillEdge превращает главный фокус исполнения в конкретные правила для следующей торговой недели.",
      outcomeFollowupTitle: "Разбор исхода сигнала",
      outcomeFollowupText:
        "SkillEdge сравнивает решение клиента с фактическим результатом сигнала, чтобы находить упущенные возможности, хорошие пропуски и сделки, которые требуют разбора.",
      outcomeLearningLabel: "Учебная заметка",
      outcomeStatsLabel: "Статистика исходов",
      outcomeLearningAnalyticsTitle: "Аналитика обучения на исходах",
      outcomeLearningAnalyticsText:
        "SkillEdge группирует сигналы по решению клиента и фактическому результату: что было взято, что не сработало, что стало упущенной возможностью и где клиент правильно отфильтровал слабую идею.",
      outcomeLearningFocusTitle: "Фокус обучения на исходах",
      missedOpportunityCoachTitle: "Коуч упущенных возможностей",
      missedOpportunityCoachText:
        "SkillEdge разбирает рабочие сигналы, которые клиент пропустил, чтобы найти повторяющуюся причину: страх, отсутствие у экрана, поздняя реакция или слабое доверие к сетапу.",
      missedOpportunityTopSetup: "Главный пропущенный сетап",
      missedOpportunityActionPlan: "План действий по упущенным возможностям",
      alertsStateLoadingTitle: "SkillEdge AI сканирует рынок",
      alertsStateLoadingText:
        "Загружаем последние сигналы, проверяем персональный приоритет, контекст журнала, исходы и свежесть сигналов.",
      alertsStateErrorTitle: "Не удалось загрузить AI-сигналы",
      alertsStateErrorText:
        "Проверь подключение, авторизацию или повтори запрос. Если ошибка повторяется, нужно проверить backend/API-логи.",
      alertsStateEmptyTitle: "AI Trading Desk ждёт качественный сетап",
      alertsStateEmptyText:
        "Сейчас нет активных сигналов. Это нормально: SkillEdge не должен стрелять шумом. Лучше меньше сигналов, но выше качество.",
      alertsStateFilterEmptyTitle: "Для этого фильтра сигналов нет",
      alertsStateFilterEmptyText:
        "Список работает, но текущий фильтр не нашёл подходящих сигналов. Сбрось фильтр или дождись новой high-confidence ситуации.",
      alertsStateRunScan: "Запустить сканирование",
      alertsStateLiveNote: "Фоновый мониторинг работает",
      selectedFilter: "Выбранный фильтр",
      totalAlerts: "Всего сигналов",
      alertsStateLiveMonitoringLabel: "Фоновый мониторинг",
      decisionVsOutcomeLabel: "Решение / исход",
      nextLearningFocus: "Следующий фокус обучения",
      outcomeProfileStillForming: "Профиль обучения на исходах ещё формируется",
      missedOpportunitiesLabel: "упущенных возможностей",
      noMissedOpportunityPatternTitle: "Паттерн упущенных возможностей ещё не сформирован",
      workedAlertsMissedSuffix: "рабочих сигналов были пропущены в этой группе сетапов.",
      commonMistakeLabel: "Типичная ошибка:",
      scoreDisclaimer:
        "Оценка не является гарантией. Торгуй только после подтверждения, адекватного соотношения риска к потенциалу и собственного чеклиста исполнения.",
      closeBreakdownHint: "или нажми вне окна, чтобы закрыть этот разбор.",
    },
    ua: {
      title: "Центр AI-сигналів",
      subtitle:
        "Останні сигнали: напрямок, сетап, зона входу, стоп, цілі, ризик і план супроводу.",
      empty: "Активних сигналів поки немає. Запусти сканування ринку.",
      locked:
        "AI-сигнали доступні тільки на SkillEdge Elite. SkillEdge Edge відкриває AI-сканер і ринкову розвідку, але real-time AI-сигнали, плаваючий віджет, зв’язка сигналів із журналом і навчання на результатах доступні тільки в Elite.",
      direction: "Напрямок",
      setup: "Сетап",
      entry: "Зона входу",
      stop: "Стоп",
      targets: "Цілі",
      trigger: "Тригер",
      reason: "Причина",
      risk: "Ризик",
      scenario: "Сценарій",
      invalidation: "Скасування ідеї",
      management: "Супровід",
      confidence: "Впевненість",
      status: "Статус",
      outcome: "Результат",
      time: "Час",
      worked: "Відпрацював",
      failed: "Не відпрацював",
      pending: "Очікується",
      neutral: "Нейтрально",
      quality: "Якість",
      saveToPlaybook: "Зберегти в плейбук",
      openPlaybook: "Відкрити плейбук",
      hidePlaybook: "Сховати плейбук",
      playbookTitle: "Особистий плейбук сигналів",
      playbookText:
        "Особиста база збережених сетапів: логіка, підтвердження, помилки та приклади сигналів.",
      playbookEmpty:
        "Поки немає збережених сетапів. Натисни «Зберегти в плейбук» на будь-якому сигналі.",
      playbookLoading: "Завантажуємо плейбук...",
      lastExample: "Останній приклад",
      openSignalProfile: "Відкрити профіль сигналів",
      hideSignalProfile: "Сховати профіль сигналів",
      signalProfileTitle: "Персональний профіль сигналів",
      signalProfileText:
        "SkillEdge AI показує, які AI-сетапи ти торгуєш краще, де втрачаєш гроші та які сигнали варто пріоритезувати.",
      signalProfileEmpty:
        "Профіль поки порожній. Створи угоди з AI-сигналів і збережи їх у журнал.",
      signalProfileLoading: "Завантажуємо профіль сигналів...",
      personalStrength: "Сильна сторона",
      riskZone: "Зона ризику",
      learningProfile: "Навчання",
      neutralProfile: "Нейтрально",
      strengthScore: "Оцінка сили",
      planAdherence: "Дотримання плану",
      aiNote: "AI-замітка",
      openTradePatterns: "Відкрити патерни угод",
      hideTradePatterns: "Сховати патерни угод",
      tradePatternsTitle: "Профіль самостійних торгових патернів",
      tradePatternsText:
        "SkillEdge AI аналізує твої самостійні прибуткові угоди та шукає повторювані патерни для майбутніх персональних AI-сигналів.",
      tradePatternsEmpty:
        "Поки немає знайдених патернів. Додай у журнал кілька самостійних прибуткових угод.",
      tradePatternsLoading: "Завантажуємо торгові патерни...",
      patternStrength: "Сила патерну",
      examples: "Приклади",
      keywords: "Ключові слова",
      filterAll: "Усі",
      filterActionable: "Готові до дії",
      filterWatchlist: "Список спостереження",
      filterPriority: "Пріоритет",
      filterCaution: "Обережно",
      filterJournalMatch: "Збіг із журналом",
      filterAiStrength: "AI-сила",
      filterLong: "Лонг",
      filterShort: "Шорт",
      filterCrypto: "Крипто",
      filterStocks: "Акції",
      filterDecisionWatching: "Спостерігаю",
      filterDecisionTaken: "Взяв",
      filterDecisionSkipped: "Пропустив",
      filterDecisionMissed: "Упустив",
      decisionAnalyticsTitle: "Рішення по сигналах",
      decisionAnalyticsText:
        "Тут видно, як клієнт працює з сигналами: спостерігає, бере, пропускає або відмічає упущену можливість. Це база майбутньої статистики якості сигналів і виконання.",
      filterEmpty: "Немає сигналів під вибраний фільтр.",
      openAlertDetails: "Відкрити розбір",
      hideAlertDetails: "Сховати розбір",
      liveDesk: "Живий AI Trading Desk",
      lastChecked: "Остання перевірка",
      autoRefreshNote:
        "Сигнали оновлюються автоматично. Сканування ринку працює у фоні, список оновлюється кожні 60 секунд.",
      showMoreAlerts: "Показати ще 10",
      collapseAlerts: "Згорнути все",
      smartTopFive:
        "Перші 5 сигналів відсортовані за важливістю: пріоритет, збіг із журналом, AI-сила, впевненість і свіжість сигналу.",
      emptyDeskTitle: "AI Trading Desk чекає якісний сетап",
      emptyDeskText:
        "Зараз немає активних сигналів під вибраний фільтр. Це нормально: SkillEdge AI не має стріляти шумом. Система чекає high-confidence ситуацію з чітким тригером, стопом, цілями та нотаткою по ризику.",
      emptyDeskAction:
        "Залиш сторінку відкритою — список оновлюється автоматично кожні 60 секунд.",
      confidenceTransparency: "Прозорість оцінки",
      confidenceTransparencyText:
        "Чому SkillEdge AI виділив цей сигнал і які фактори посилюють або послаблюють ідею.",
      breakdownTitle: "Розбір сигналу SkillEdge AI",
      traderDecision: "Рішення трейдера",
      tradePlan: "План угоди",
      whyNow: "Чому зараз",
      confirmationChecklist: "Чеклист підтвердження",
      avoidThisTradeIf: "Не торгувати, якщо",
      learningLayer: "Навчальний шар",
      journalSyncTitle: "Зв’язка з журналом",
      journalSyncText:
        "Ти відмітив сигнал як «Взяв». Створи угоду із сигналу, щоб SkillEdge пізніше порівняв план сигналу з реальним виконанням: вхід, стоп, вихід, PnL і якість угоди.",
      journalSyncAction: "Створити угоду із сигналу",
      linkedJournalTitle: "Пов’язана угода в журналі",
      linkedJournalText:
        "Ця угода вже пов’язана із сигналом. SkillEdge зможе порівняти план сигналу з реальним виконанням клієнта.",
      linkedJournalEmpty:
        "Поки немає збереженої угоди в журналі, пов’язаної з цим сигналом.",
      linkedTrades: "Пов’язані угоди",
      linkedPnl: "PnL пов’язаних угод",
      linkedResult: "Результат",
      journalLinkAnalyticsTitle: "Сигнали ↔ Журнал",
      journalLinkAnalyticsText:
        "SkillEdge відстежує, які сигнали стали реальними угодами в журналі. Це база для аналізу виконання, PnL по сигналах і упущених можливостей.",
      takenWithoutJournal: "Взято без журналу",
      linkedAlertsCount: "Пов’язані сигнали",
      linkedTradesPnl: "PnL пов’язаних угод",
      avgExecutionScore: "Середня оцінка виконання",
      takenWithoutJournalFilter: "Взято без журналу",
      takenWithoutJournalTitle: "Сигнал взято, але угоди в журналі немає",
      takenWithoutJournalText:
        "Клієнт відмітив сигнал як «Взяв», але ще не зберіг угоду в журнал. Створи угоду із сигналу, щоб SkillEdge зміг порівняти план сигналу з реальним виконанням.",
      executionScore: "Оцінка виконання",
      executionReview: "Розбір виконання",
      executionStrong: "Сильне виконання",
      executionMedium: "Нормально, але є що покращити",
      executionWeak: "Потрібен розбір виконання",
      filterJournalLinked: "Пов’язано з журналом",
      filterExecutionStrong: "Сильне виконання",
      filterExecutionReview: "Потрібен розбір",
      executionQualityTitle: "Якість виконання",
      executionQualityText:
        "SkillEdge показує, які AI-сигнали вже стали угодами в журналі і де виконання було сильним або потребує розбору.",
      executionCoachTitle: "AI-коуч виконання",
      executionCoachText:
        "SkillEdge розбирає виконання клієнта відносно плану сигналу: вхід, стоп, напрямок, цілі та дисципліну.",
      executionCoachEntryIssue:
        "Проблема входу: вхід був поза плановою зоною або занадто пізно після сигналу.",
      executionCoachStopIssue:
        "Проблема стопа: стоп відрізняється від плану сигналу. Це може ламати статистику і ризик/потенціал.",
      executionCoachDirectionIssue:
        "Проблема напрямку: напрямок угоди відрізняється від напрямку сигналу.",
      executionCoachTargetIssue:
        "Проблема цілей: угода не дійшла до TP або вихід був не за планом.",
      executionWeaknessTitle: "Карта слабких місць виконання",
      entryIssueFilter: "Проблеми входу",
      stopIssueFilter: "Проблеми стопа",
      directionIssueFilter: "Проблеми напрямку",
      targetIssueFilter: "Проблеми цілей",
      executionFocusTitle: "Персональний фокус виконання",
      openFocusAlerts: "Відкрити сигнали з цим фокусом",
      executionActionPlanTitle: "План дій на тиждень",
      executionActionPlanText:
        "SkillEdge перетворює головний фокус виконання на конкретні правила для наступного торгового тижня.",
      outcomeFollowupTitle: "Розбір результату сигналу",
      outcomeFollowupText:
        "SkillEdge порівнює рішення клієнта з фактичним результатом сигналу, щоб знаходити упущені можливості, хороші пропуски та угоди, які потребують розбору.",
      outcomeLearningLabel: "Навчальна нотатка",
      outcomeStatsLabel: "Статистика результатів",
      outcomeLearningAnalyticsTitle: "Аналітика навчання на результатах",
      outcomeLearningFocusTitle: "Фокус навчання на результатах",
      missedOpportunityCoachTitle: "Коуч упущених можливостей",
      missedOpportunityCoachText:
        "SkillEdge розбирає робочі сигнали, які клієнт пропустив, щоб знайти повторювану причину: страх, відсутність біля екрана, пізня реакція або слабка довіра до сетапу.",
      missedOpportunityTopSetup: "Головний пропущений сетап",
      missedOpportunityActionPlan: "План дій по упущених можливостях",
      alertsStateLoadingTitle: "SkillEdge AI сканує ринок",
      alertsStateLoadingText:
        "Завантажуємо останні сигнали, перевіряємо персональний пріоритет, контекст журналу, результати й свіжість сигналів.",
      alertsStateErrorTitle: "Не вдалося завантажити AI-сигнали",
      alertsStateErrorText:
        "Перевір підключення, авторизацію або повтори запит. Якщо помилка повторюється — потрібно перевірити backend/API-логи.",
      alertsStateEmptyTitle: "AI Trading Desk чекає якісний сетап",
      alertsStateEmptyText:
        "Зараз немає активних сигналів. Це нормально: SkillEdge не має стріляти шумом. Краще менше сигналів, але вища якість.",
      alertsStateFilterEmptyTitle: "Для цього фільтра сигналів немає",
      alertsStateFilterEmptyText:
        "Список працює, але поточний фільтр не знайшов відповідних сигналів. Скинь фільтр або дочекайся нової high-confidence ситуації.",
      alertsStateRunScan: "Запустити сканування",
      alertsStateLiveNote: "Фоновий моніторинг працює",
      selectedFilter: "Вибраний фільтр",
      totalAlerts: "Усього сигналів",
      alertsStateLiveMonitoringLabel: "Фоновий моніторинг",
      decisionVsOutcomeLabel: "Рішення / результат",
      nextLearningFocus: "Наступний фокус навчання",
      outcomeProfileStillForming: "Профіль навчання на результатах ще формується",
      missedOpportunitiesLabel: "упущених можливостей",
      noMissedOpportunityPatternTitle: "Патерн упущених можливостей ще не сформований",
      workedAlertsMissedSuffix: "робочих сигналів були пропущені в цій групі сетапів.",
      commonMistakeLabel: "Типова помилка:",
      scoreDisclaimer:
        "Оцінка не є гарантією. Торгуй тільки після підтвердження, адекватного співвідношення ризику до потенціалу та власного чеклиста виконання.",
      closeBreakdownHint: "або натисни поза вікном, щоб закрити цей розбір.",
    },
  };

  const copy = {
    ...rawCopy,
    ...alertCopyOverrides[safeLanguage],
  };

  const signalsControlPanelTitle =
    safeLanguage === "en"
      ? "Desk control panel"
      : safeLanguage === "ua"
        ? "Панель сигналів"
        : "Панель сигналов";

  const signalsControlPanelText =
    safeLanguage === "en"
      ? "Filters, outcome stats, playbook, journal sync and learning blocks. Collapse it to keep active signals closer to the top."
      : safeLanguage === "ua"
        ? "Фільтри, статистика, playbook, зв’язка з журналом і навчальні блоки. Згорни панель, щоб активні сигнали були ближче до верху."
        : "Фильтры, статистика, playbook, связка с журналом и обучающие блоки. Сверни панель, чтобы активные сигналы были ближе к верху.";

  const signalsControlPanelToggle = signalsControlPanelOpen
    ? safeLanguage === "en"
      ? "Collapse"
      : safeLanguage === "ua"
        ? "Згорнути"
        : "Свернуть"
    : safeLanguage === "en"
      ? "Expand"
      : safeLanguage === "ua"
        ? "Розгорнути"
        : "Развернуть";


  const hasAccess =
  subscription.active && canUseFeature(subscription.plan, "ai_alerts");

  const loadAlerts = async (generate = false) => {
    if (!hasAccess) return;

    try {
      setError("");

      if (generate) {
        setGenerating(true);
      } else {
        setLoading(true);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Unauthorized.");
        return;
      }

      if (generate) {
        const generateResponse = await authFetch(`/api/market/alerts?assetType=${getAlertAssetFilterUrlValue(signalAssetFilter)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!generateResponse.ok) {
          const payload = await generateResponse.json().catch(() => null);
          setError(payload?.error || "Failed to generate alerts.");
          return;
        }
      }

      const response = await authFetch("/api/market/alerts?limit=200&period=24h&status=all&assetType=all", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | { items?: DashboardMarketAlert[]; error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error || "Failed to load alerts.");
        setAlerts([]);
        return;
      }

      setAlerts(Array.isArray(data?.items) ? data.items : []);
      setAlertsLastCheckedAt(new Date().toISOString());
    } catch {
      setError("Failed to load alerts.");
      setAlerts([]);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const checkAlertOutcomes = async () => {
  if (!hasAccess) return;

  try {
    setCheckingOutcomes(true);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Unauthorized.");
      return;
    }

    const response = await authFetch("/api/market/alerts/outcomes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.error || "Failed to check alert outcomes.");
      return;
    }

    await loadAlerts(false);
  } catch {
    setError("Failed to check alert outcomes.");
  } finally {
    setCheckingOutcomes(false);
  }
};

const loadTradePatterns = async () => {
  if (!hasAccess) return;

  try {
    setTradePatternsOpen(true);
    setTradePatternsLoading(true);
    setTradePatternsError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTradePatternsError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/trade-patterns", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { items?: UserTradePatternProfileItem[]; error?: string }
      | null;

    if (!response.ok) {
      setTradePatternsError(payload?.error || "Failed to load trade patterns.");
      setTradePatternItems([]);
      return;
    }

    setTradePatternItems(Array.isArray(payload?.items) ? payload.items : []);
  } catch {
    setTradePatternsError("Failed to load trade patterns.");
    setTradePatternItems([]);
  } finally {
    setTradePatternsLoading(false);
  }
};

const rebuildTradePatterns = async () => {
  if (!hasAccess) return;

  try {
    setTradePatternsOpen(true);
    setTradePatternsRebuilding(true);
    setTradePatternsError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTradePatternsError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/trade-patterns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | { items?: UserTradePatternProfileItem[]; error?: string }
      | null;

    if (!response.ok) {
      setTradePatternsError(payload?.error || "Failed to rebuild trade patterns.");
      return;
    }

    setTradePatternItems(Array.isArray(payload?.items) ? payload.items : []);
  } catch {
    setTradePatternsError("Failed to rebuild trade patterns.");
  } finally {
    setTradePatternsRebuilding(false);
  }
};

const loadSignalProfile = async () => {
  if (!hasAccess) return;

  try {
    setSignalProfileOpen(true);
    setSignalProfileLoading(true);
    setSignalProfileError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setSignalProfileError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/signal-profile", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { items?: UserSignalProfileItem[]; error?: string }
      | null;

    if (!response.ok) {
      setSignalProfileError(payload?.error || "Failed to load signal profile.");
      setSignalProfileItems([]);
      return;
    }

    setSignalProfileItems(Array.isArray(payload?.items) ? payload.items : []);
  } catch {
    setSignalProfileError("Failed to load signal profile.");
    setSignalProfileItems([]);
  } finally {
    setSignalProfileLoading(false);
  }
};

const rebuildSignalProfile = async () => {
  if (!hasAccess) return;

  try {
    setSignalProfileOpen(true);
    setSignalProfileRebuilding(true);
    setSignalProfileError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setSignalProfileError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/signal-profile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | { items?: UserSignalProfileItem[]; error?: string }
      | null;

    if (!response.ok) {
      setSignalProfileError(payload?.error || "Failed to rebuild signal profile.");
      return;
    }

    setSignalProfileItems(Array.isArray(payload?.items) ? payload.items : []);
  } catch {
    setSignalProfileError("Failed to rebuild signal profile.");
  } finally {
    setSignalProfileRebuilding(false);
  }
};

const loadPersonalPlaybook = async () => {
  if (!hasAccess) return;

  try {
    setPlaybookOpen(true);
    setPlaybookLoading(true);
    setPlaybookError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setPlaybookError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/setups", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { items?: UserSignalPlaybookItem[]; error?: string }
      | null;

    if (!response.ok) {
      setPlaybookError(payload?.error || "Failed to load personal playbook.");
      setPlaybookItems([]);
      return;
    }

    setPlaybookItems(Array.isArray(payload?.items) ? payload.items : []);
  } catch {
    setPlaybookError("Failed to load personal playbook.");
    setPlaybookItems([]);
  } finally {
    setPlaybookLoading(false);
  }
};

const markSingleAlertViewed = async (alertId: string) => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    await authFetch("/api/market/alerts/viewed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        alertIds: [alertId],
      }),
    });

    setAlerts((current) =>
      current.map((alert) =>
        alert.id === alertId
          ? { ...alert, is_new: false, viewed_at: new Date().toISOString() }
          : alert
      )
    );
  } catch {
    // ignore viewed state failure
  }
};

const saveAlertDecision = async (
  alertId: string,
  decision: "watching" | "taken" | "skipped" | "missed",
  decisionNote = ""
) => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    const response = await authFetch("/api/market/alerts/decision", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
  alertId,
  decision,
  decisionNote,
}),
    });

    if (!response.ok) return;

    setAlerts((current) =>
      current.map((alert) =>
        alert.id === alertId
          ? {
              ...alert,
              is_new: false,
              viewed_at: new Date().toISOString(),
              user_alert_decision: decision,
              user_alert_decision_note: decisionNote || alert.user_alert_decision_note || null,
            }
          : alert
      )
    );
  } catch {
    // Keep UI usable even if decision sync fails.
  }
};

const saveAlertToPlaybook = async (alert: DashboardMarketAlert) => {
  if (!hasAccess) return;

  try {
    setSavingPlaybookId(alert.id);
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("Unauthorized.");
      return;
    }

    const response = await fetch("/api/playbook/setups", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        alertId: alert.id,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.error || "Failed to save setup to playbook.");
      return;
    }

    setSavedPlaybookAlertIds((current) =>
      Array.from(new Set([...current, alert.id]))
    );
    if (playbookOpen) {
  await loadPersonalPlaybook();
}
  } catch {
    setError("Failed to save setup to playbook.");
  } finally {
    setSavingPlaybookId("");
  }
};

useEffect(() => {
  setSignalAssetFilter(requestedAssetFilter);
}, [requestedAssetFilter]);

const handleSignalAssetFilterChange = (nextFilter: AlertAssetFilter) => {
  setSignalAssetFilter(nextFilter);
  onRequestedAssetFilterChange(nextFilter);
  setAlertFilter("all");

  try {
    window.localStorage.setItem("skilledge_alert_asset_filter", nextFilter);

    const params = new URLSearchParams(window.location.search);
    params.set("tab", "signals");

    if (nextFilter === "all") {
      params.delete("assetType");
    } else {
      params.set("assetType", getAlertAssetFilterUrlValue(nextFilter));
    }

    window.history.replaceState({}, "", `/dashboard?${params.toString()}`);
  } catch {
    // keep UI usable if URL/localStorage are unavailable
  }
};

useEffect(() => {
  if (requestedAssetFilter !== "all") return;

  try {
    const saved = window.localStorage.getItem("skilledge_alert_asset_filter");
    const normalized = normalizeAlertAssetFilter(saved);

    if (normalized !== "all") {
      setSignalAssetFilter(normalized);
      onRequestedAssetFilterChange(normalized);
    }
  } catch {
    // ignore localStorage errors
  }
}, [requestedAssetFilter, onRequestedAssetFilterChange]);

  useEffect(() => {
  if (!hasAccess) return;

  loadAlerts(false);

  const interval = window.setInterval(() => {
    loadAlerts(false);
  }, 30000);

  return () => {
    window.clearInterval(interval);
  };
}, [hasAccess, signalAssetFilter]);

useEffect(() => {
  if (!expandedAlertId) return;

  const previousOverflow = document.body.style.overflow;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setExpandedAlertId(null);
    }
  };

  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [expandedAlertId]);

useEffect(() => {
  setVisibleAlertsCount(5);
  setExpandedAlertId(null);
  setDecisionReasonFilter(null);
}, [alertFilter, signalAssetFilter]);

const assetFilteredAlerts = alerts.filter((alert) =>
  isAlertInAssetFilter(alert, signalAssetFilter)
);
const stocksSignalCount = alerts.filter((alert) => alert.asset_type !== "crypto").length;
const cryptoSignalCount = alerts.filter((alert) => alert.asset_type === "crypto").length;

const signalLifecycleCounts = {
  active: assetFilteredAlerts.filter((alert) => getAlertLifecycleBucket(alert) === "active").length,
  armed: assetFilteredAlerts.filter((alert) => getAlertLifecycleBucket(alert) === "armed").length,
  watch: assetFilteredAlerts.filter((alert) => getAlertLifecycleBucket(alert) === "watch").length,
};

const allSignalLifecycleCounts = {
  active: alerts.filter((alert) => getAlertLifecycleBucket(alert) === "active").length,
  armed: alerts.filter((alert) => getAlertLifecycleBucket(alert) === "armed").length,
  watch: alerts.filter((alert) => getAlertLifecycleBucket(alert) === "watch").length,
};

const workedCount = assetFilteredAlerts.filter(
  (alert) => alert.outcome_status === "worked"
).length;

const failedCount = assetFilteredAlerts.filter(
  (alert) => alert.outcome_status === "failed"
).length;

const neutralCount = assetFilteredAlerts.filter(
  (alert) => alert.outcome_status === "neutral"
).length;

const pendingCount = assetFilteredAlerts.filter(
  (alert) => !alert.outcome_status || alert.outcome_status === "pending"
).length;

const resolvedCount = workedCount + failedCount + neutralCount;

const qualityRate =
  resolvedCount > 0 ? Math.round((workedCount / resolvedCount) * 100) : null;

const mfeValues = assetFilteredAlerts
  .map((alert) => alert.mfe)
  .filter((value): value is number => typeof value === "number");

const maeValues = assetFilteredAlerts
  .map((alert) => alert.mae)
  .filter((value): value is number => typeof value === "number");

const avgMfe =
  mfeValues.length > 0
    ? mfeValues.reduce((sum, value) => sum + value, 0) / mfeValues.length
    : null;

const avgMae =
  maeValues.length > 0
    ? maeValues.reduce((sum, value) => sum + value, 0) / maeValues.length
    : null;

const tpHitCount = assetFilteredAlerts.filter((alert) => Boolean(alert.hit_target)).length;

const stopHitCount = assetFilteredAlerts.filter((alert) => Boolean(alert.hit_stop)).length;
const personalStrengthProfiles = signalProfileItems.filter(
  (profile) => profile.profile_label === "personal_strength"
);

const riskZoneProfiles = signalProfileItems.filter(
  (profile) => profile.profile_label === "risk_zone"
);

const learningProfiles = signalProfileItems.filter(
  (profile) => profile.profile_label === "learning"
);

const neutralProfiles = signalProfileItems.filter(
  (profile) => profile.profile_label === "neutral"
);

const topSignalProfile = signalProfileItems[0] || null;
const topTradePattern = tradePatternItems[0] || null;

const strongTradePatterns = tradePatternItems.filter(
  (pattern) => pattern.profile_label === "personal_strength_candidate"
);

const learningTradePatterns = tradePatternItems.filter(
  (pattern) => pattern.profile_label === "learning_candidate"
);

const tradePatternTotalPnl = tradePatternItems.reduce(
  (sum, pattern) => sum + Number(pattern.total_pnl || 0),
  0
);

function isAlertTakenWithoutJournal(alert: DashboardMarketAlert) {
  if (alert.user_alert_decision !== "taken") return false;

  return !trades.some((trade) => trade.source_alert_id === alert.id);
}

const visibleAlerts = assetFilteredAlerts.filter((alert) => {
  if (
    decisionReasonFilter &&
    alert.user_alert_decision_note !== decisionReasonFilter
  ) {
    return false;
  }

  if (alertFilter === "all") return true;

if (alertFilter === "actionable") {
  return getAlertLifecycleBucket(alert) === "active" || alert.signal_mode === "actionable";
}

if (alertFilter === "watchlist") {
  return (
    getAlertLifecycleBucket(alert) === "armed" ||
    getAlertLifecycleBucket(alert) === "watch" ||
    alert.signal_mode === "armed" ||
    alert.signal_mode === "watchlist"
  );
}

if (alertFilter === "decision_watching") {
  return alert.user_alert_decision === "watching";
}

if (alertFilter === "decision_taken") {
  return alert.user_alert_decision === "taken";
}

if (alertFilter === "decision_skipped") {
  return alert.user_alert_decision === "skipped";
}

if (alertFilter === "decision_missed") {
  return alert.user_alert_decision === "missed";
}

if (alertFilter === "taken_without_journal") {
  return isAlertTakenWithoutJournal(alert);
}

if (alertFilter === "journal_linked") {
  return hasLinkedJournalTrade(alert);
}

if (alertFilter === "execution_strong") {
  return hasStrongExecution(alert);
}

if (alertFilter === "execution_review") {
  return needsExecutionReview(alert);
}

if (alertFilter === "execution_entry_issue") {
  return hasEntryExecutionIssue(alert);
}

if (alertFilter === "execution_stop_issue") {
  return hasStopExecutionIssue(alert);
}

if (alertFilter === "execution_direction_issue") {
  return hasDirectionExecutionIssue(alert);
}

if (alertFilter === "execution_target_issue") {
  return hasTargetExecutionIssue(alert);
}

if (alertFilter === "outcome_taken_worked") {
  return isTakenWorkedAlert(alert);
}

if (alertFilter === "outcome_taken_failed") {
  return isTakenFailedAlert(alert);
}

if (alertFilter === "outcome_missed_opportunity") {
  return isMissedOpportunityAlert(alert);
}

if (alertFilter === "outcome_good_skip") {
  return isGoodSkipAlert(alert);
}

  if (alertFilter === "priority") {
    return alert.personal_priority_type === "priority";
  }

  if (alertFilter === "caution") {
    return (
      alert.personal_priority_type === "caution" ||
      alert.personalization_type === "risk"
    );
  }

  if (alertFilter === "journal_match") {
    return Boolean(alert.journal_pattern_label);
  }

  if (alertFilter === "ai_strength") {
    return alert.personalization_type === "strength";
  }

  if (alertFilter === "long") {
    return alert.direction === "upside" || alert.direction === "long";
  }

  if (alertFilter === "short") {
    return alert.direction === "downside" || alert.direction === "short";
  }

  if (alertFilter === "crypto") {
    return alert.asset_type === "crypto";
  }

  if (alertFilter === "stocks") {
    return alert.asset_type !== "crypto";
  }


return true;
});

const decisionCounts = {
  watching: assetFilteredAlerts.filter(
    (alert) => alert.user_alert_decision === "watching"
  ).length,
  taken: assetFilteredAlerts.filter((alert) => alert.user_alert_decision === "taken")
    .length,
  skipped: assetFilteredAlerts.filter(
    (alert) => alert.user_alert_decision === "skipped"
  ).length,
  missed: assetFilteredAlerts.filter((alert) => alert.user_alert_decision === "missed")
    .length,
};

const totalDecisionCount =
  decisionCounts.watching +
  decisionCounts.taken +
  decisionCounts.skipped +
  decisionCounts.missed;

const takenRate =
  totalDecisionCount > 0
    ? Math.round((decisionCounts.taken / totalDecisionCount) * 100)
    : null;

    const decisionReasonCounts = alerts.reduce<Record<string, number>>(
  (acc, alert) => {
    const reason = alert.user_alert_decision_note?.trim();

    if (!reason) return acc;

    acc[reason] = (acc[reason] || 0) + 1;

    return acc;
  },
  {} as Record<string, number>
);

const decisionReasonItems = Object.entries(decisionReasonCounts)
  .map(([reason, count]) => ({
    reason,
    count,
  }))
  .sort((a, b) => Number(b.count) - Number(a.count));

const topDecisionReason = decisionReasonItems[0] || null;

const rankedVisibleAlerts = [...visibleAlerts].sort((a, b) => {
  const lifecycleDiff = getAlertLifecycleRankValue(b) - getAlertLifecycleRankValue(a);

  if (lifecycleDiff !== 0) return lifecycleDiff;

  const importanceDiff =
    getAlertImportanceScore(b) - getAlertImportanceScore(a);

  if (importanceDiff !== 0) return importanceDiff;

  return (
    new Date(b.created_at || 0).getTime() -
    new Date(a.created_at || 0).getTime()
  );
});

const displayedAlerts = rankedVisibleAlerts.slice(0, visibleAlertsCount);

const hiddenAlertsCount = Math.max(
  rankedVisibleAlerts.length - displayedAlerts.length,
  0
);

const hasActiveAlertFilters =
  alertFilter !== "all" || Boolean(decisionReasonFilter);

const resetAlertFilters = () => {
  setAlertFilter("all");
  setDecisionReasonFilter(null);
  setVisibleAlertsCount(5);
  setExpandedAlertId(null);
};

const breakdownAlert = expandedAlertId
  ? alerts.find((alert) => alert.id === expandedAlertId) || null
  : null;

  useEffect(() => {
  if (!breakdownAlert || typeof document === "undefined") return;

  const previousOverflow = document.body.style.overflow;

  document.body.style.overflow = "hidden";

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setExpandedAlertId(null);
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [breakdownAlert]);

  const linkedTradesByAlertId = useMemo(() => {
  return trades.reduce<Record<string, Trade[]>>((acc, trade) => {
    const alertId = trade.source_alert_id;

    if (!alertId) return acc;

    if (!acc[alertId]) {
      acc[alertId] = [];
    }

    acc[alertId].push(trade);

    return acc;
  }, {});
}, [trades]);

const getLinkedTradesForAlert = (alertId: string) => {
  return linkedTradesByAlertId[alertId] || [];
};

const getLinkedPnlLabel = (items: Trade[]) => {
  const pnlItems = items.filter((trade) => typeof trade.pnl === "number");

  if (pnlItems.length === 0) return "—";

  const total = pnlItems.reduce((sum, trade) => sum + (trade.pnl || 0), 0);

  return `${total >= 0 ? "+" : ""}${total.toFixed(2)}`;
};

const getLinkedResultLabel = (items: Trade[]) => {
  const resultCounts = items.reduce<Record<string, number>>((acc, trade) => {
    const result = trade.result || "open";

    acc[result] = (acc[result] || 0) + 1;

    return acc;
  }, {});

  return Object.entries(resultCounts)
    .map(([result, count]) => `${result}: ${count}`)
    .join(" / ");
};

const getLinkedExecutionScoreLabel = (items: Trade[]) => {
  const reviews = items
    .map((trade) => getSignalExecutionReview(trade))
    .filter(
      (review): review is NonNullable<ReturnType<typeof getSignalExecutionReview>> =>
        Boolean(review)
    );

  if (reviews.length === 0) return "—";

  const average = Math.round(
    reviews.reduce((sum, review) => sum + review.adherenceScore, 0) /
      reviews.length
  );

  return `${average}/100`;
};

const getLinkedExecutionScoreValue = (items: Trade[]) => {
  const reviews = items
    .map((trade) => getSignalExecutionReview(trade))
    .filter(
      (review): review is NonNullable<ReturnType<typeof getSignalExecutionReview>> =>
        Boolean(review)
    );

  if (reviews.length === 0) return null;

  return Math.round(
    reviews.reduce((sum, review) => sum + review.adherenceScore, 0) /
      reviews.length
  );
};

const hasLinkedJournalTrade = (alert: DashboardMarketAlert) => {
  return getLinkedTradesForAlert(alert.id).length > 0;
};

const hasStrongExecution = (alert: DashboardMarketAlert) => {
  const score = getLinkedExecutionScoreValue(getLinkedTradesForAlert(alert.id));

  return score !== null && score >= 80;
};

const needsExecutionReview = (alert: DashboardMarketAlert) => {
  const score = getLinkedExecutionScoreValue(getLinkedTradesForAlert(alert.id));

  return score !== null && score < 60;
};

const hasEntryExecutionIssue = (alert: DashboardMarketAlert) => {
  return getLinkedTradesForAlert(alert.id).some((trade) => {
    const review = getSignalExecutionReview(trade);

    return review?.entryInZone === false;
  });
};

const hasStopExecutionIssue = (alert: DashboardMarketAlert) => {
  return getLinkedTradesForAlert(alert.id).some((trade) => {
    const review = getSignalExecutionReview(trade);

    return review?.stopMatched === false;
  });
};

const hasDirectionExecutionIssue = (alert: DashboardMarketAlert) => {
  return getLinkedTradesForAlert(alert.id).some((trade) => {
    const review = getSignalExecutionReview(trade);

    return review?.directionMatched === false;
  });
};

const hasTargetExecutionIssue = (alert: DashboardMarketAlert) => {
  return getLinkedTradesForAlert(alert.id).some((trade) => {
    const review = getSignalExecutionReview(trade);

    return review?.targetHit === "NO_TARGET";
  });
};

const getAlertExecutionCoachNotes = (alert: DashboardMarketAlert) => {
  const linkedTrades = getLinkedTradesForAlert(alert.id);

  const reviews = linkedTrades
    .map((trade) => getSignalExecutionReview(trade))
    .filter(
      (review): review is NonNullable<ReturnType<typeof getSignalExecutionReview>> =>
        Boolean(review)
    );

  if (reviews.length === 0) {
    return [];
  }

  const avgScore = Math.round(
    reviews.reduce((sum, review) => sum + review.adherenceScore, 0) /
      reviews.length
  );

  const notes: {
    title: string;
    text: string;
    tone: "strong" | "medium" | "weak" | "neutral";
  }[] = [];

  notes.push({
    title: `${copy.executionScore}: ${avgScore}/100`,
    text:
      avgScore >= 80
        ? copy.executionCoachStrong
        : avgScore >= 60
          ? copy.executionCoachMedium
          : copy.executionCoachWeak,
    tone: avgScore >= 80 ? "strong" : avgScore >= 60 ? "medium" : "weak",
  });

  const entryIssues = reviews.filter(
    (review) => review.entryInZone === false
  ).length;

  const stopIssues = reviews.filter(
    (review) => review.stopMatched === false
  ).length;

  const directionIssues = reviews.filter(
    (review) => review.directionMatched === false
  ).length;

  const targetIssues = reviews.filter(
    (review) => review.targetHit === "NO_TARGET"
  ).length;

  if (entryIssues > 0) {
    notes.push({
      title: "Entry timing",
      text: copy.executionCoachEntryIssue,
      tone: "weak",
    });
  }

  if (stopIssues > 0) {
    notes.push({
      title: "Risk discipline",
      text: copy.executionCoachStopIssue,
      tone: "weak",
    });
  }

  if (directionIssues > 0) {
    notes.push({
      title: "Direction discipline",
      text: copy.executionCoachDirectionIssue,
      tone: "weak",
    });
  }

  if (targetIssues > 0) {
    notes.push({
      title: "Target management",
      text: copy.executionCoachTargetIssue,
      tone: "medium",
    });
  }

  return notes.slice(0, 4);
};

const getExecutionScoreTone = (score: number | null) => {
  if (score === null) return "neutral";
  if (score >= 80) return "strong";
  if (score >= 60) return "medium";
  return "weak";
};

const linkedJournalTrades = trades.filter((trade) => trade.source_alert_id);

const linkedAlertIds = new Set(
  linkedJournalTrades
    .map((trade) => trade.source_alert_id)
    .filter((alertId): alertId is string => Boolean(alertId))
);

const takenAlerts = alerts.filter(
  (alert) => alert.user_alert_decision === "taken"
);

const takenWithoutJournalCount = takenAlerts.filter(
  (alert) => !linkedAlertIds.has(alert.id)
).length;

const linkedTradesTotalPnl = linkedJournalTrades
  .filter((trade) => typeof trade.pnl === "number")
  .reduce((sum, trade) => sum + (trade.pnl || 0), 0);

const linkedExecutionReviews = linkedJournalTrades
  .map((trade) => getSignalExecutionReview(trade))
  .filter(
    (review): review is NonNullable<ReturnType<typeof getSignalExecutionReview>> =>
      Boolean(review)
  );

const avgLinkedExecutionScore =
  linkedExecutionReviews.length > 0
    ? Math.round(
        linkedExecutionReviews.reduce(
          (sum, review) => sum + review.adherenceScore,
          0
        ) / linkedExecutionReviews.length
      )
    : null;

const executionWeaknessCounts = {
  entry: alerts.filter((alert) => hasEntryExecutionIssue(alert)).length,
  stop: alerts.filter((alert) => hasStopExecutionIssue(alert)).length,
  direction: alerts.filter((alert) => hasDirectionExecutionIssue(alert)).length,
  target: alerts.filter((alert) => hasTargetExecutionIssue(alert)).length,
};

const totalExecutionWeaknesses =
  executionWeaknessCounts.entry +
  executionWeaknessCounts.stop +
  executionWeaknessCounts.direction +
  executionWeaknessCounts.target;

  type ExecutionFocusItem = {
  id: "entry" | "stop" | "direction" | "target";
  count: number;
  label: string;
  text: string;
  filter: AlertFilter;
};

const executionFocusItems = (
  [
    {
      id: "entry",
      count: executionWeaknessCounts.entry,
      label: copy.entryIssueFilter,
      text: copy.focusEntryText,
      filter: "execution_entry_issue",
    },
    {
      id: "stop",
      count: executionWeaknessCounts.stop,
      label: copy.stopIssueFilter,
      text: copy.focusStopText,
      filter: "execution_stop_issue",
    },
    {
      id: "direction",
      count: executionWeaknessCounts.direction,
      label: copy.directionIssueFilter,
      text: copy.focusDirectionText,
      filter: "execution_direction_issue",
    },
    {
      id: "target",
      count: executionWeaknessCounts.target,
      label: copy.targetIssueFilter,
      text: copy.focusTargetText,
      filter: "execution_target_issue",
    },
  ] satisfies ExecutionFocusItem[]
).sort((a, b) => b.count - a.count);

const primaryExecutionFocus =
  executionFocusItems.length > 0 && executionFocusItems[0].count > 0
    ? executionFocusItems[0]
    : null;

const getExecutionActionPlan = () => {
  if (!primaryExecutionFocus) {
    return [
      copy.strongActionOne,
      copy.strongActionTwo,
      copy.strongActionThree,
    ];
  }

  if (primaryExecutionFocus.id === "entry") {
    return [copy.entryActionOne, copy.entryActionTwo, copy.entryActionThree];
  }

  if (primaryExecutionFocus.id === "stop") {
    return [copy.stopActionOne, copy.stopActionTwo, copy.stopActionThree];
  }

  if (primaryExecutionFocus.id === "direction") {
    return [
      copy.directionActionOne,
      copy.directionActionTwo,
      copy.directionActionThree,
    ];
  }

  return [copy.targetActionOne, copy.targetActionTwo, copy.targetActionThree];
};

const executionActionPlan = getExecutionActionPlan();

const getAlertOutcomeFollowup = (alert: DashboardMarketAlert) => {
  const decision = alert.user_alert_decision;
  const outcome = alert.outcome_status || "pending";

  let text = copy.outcomePendingNote;
  let tone: "strong" | "warning" | "danger" | "neutral" = "neutral";

  if (outcome === "worked" && decision === "taken") {
    text = copy.outcomeTakenWorked;
    tone = "strong";
  } else if (outcome === "failed" && decision === "taken") {
    text = copy.outcomeTakenFailed;
    tone = "danger";
  } else if (outcome === "worked" && decision === "skipped") {
    text = copy.outcomeSkippedWorked;
    tone = "warning";
  } else if (outcome === "failed" && decision === "skipped") {
    text = copy.outcomeSkippedFailed;
    tone = "strong";
  } else if (outcome === "worked" && decision === "missed") {
    text = copy.outcomeMissedWorked;
    tone = "warning";
  } else if (outcome === "failed" && decision === "missed") {
    text = copy.outcomeMissedFailed;
    tone = "neutral";
  } else if (outcome === "neutral") {
    text = copy.outcomeNeutralNote;
    tone = "neutral";
  }

  return {
    decision: decision || "not marked",
    outcome,
    text,
    tone,
  };
};

const isTakenWorkedAlert = (alert: DashboardMarketAlert) => {
  return (
    alert.user_alert_decision === "taken" &&
    alert.outcome_status === "worked"
  );
};

const isTakenFailedAlert = (alert: DashboardMarketAlert) => {
  return (
    alert.user_alert_decision === "taken" &&
    alert.outcome_status === "failed"
  );
};

const isMissedOpportunityAlert = (alert: DashboardMarketAlert) => {
  return (
    (alert.user_alert_decision === "skipped" ||
      alert.user_alert_decision === "missed") &&
    alert.outcome_status === "worked"
  );
};

const isGoodSkipAlert = (alert: DashboardMarketAlert) => {
  return (
    (alert.user_alert_decision === "skipped" ||
      alert.user_alert_decision === "missed") &&
    alert.outcome_status === "failed"
  );
};

const outcomeLearningCounts = {
  takenWorked: alerts.filter((alert) => isTakenWorkedAlert(alert)).length,
  takenFailed: alerts.filter((alert) => isTakenFailedAlert(alert)).length,
  missedOpportunity: alerts.filter((alert) =>
    isMissedOpportunityAlert(alert)
  ).length,
  goodSkip: alerts.filter((alert) => isGoodSkipAlert(alert)).length,
};

const totalOutcomeLearningCount =
  outcomeLearningCounts.takenWorked +
  outcomeLearningCounts.takenFailed +
  outcomeLearningCounts.missedOpportunity +
  outcomeLearningCounts.goodSkip;

  type OutcomeLearningFocusItem = {
  id: "taken_worked" | "taken_failed" | "missed_opportunity" | "good_skip";
  count: number;
  label: string;
  text: string;
  filter: AlertFilter;
  tone: "strong" | "danger" | "warning" | "neutral";
};

const outcomeLearningFocusItems = (
  [
    {
      id: "missed_opportunity",
      count: outcomeLearningCounts.missedOpportunity,
      label: copy.filterMissedOpportunity,
      text: copy.outcomeFocusMissedOpportunity,
      filter: "outcome_missed_opportunity",
      tone: "warning",
    },
    {
      id: "taken_failed",
      count: outcomeLearningCounts.takenFailed,
      label: copy.filterTakenFailed,
      text: copy.outcomeFocusTakenFailed,
      filter: "outcome_taken_failed",
      tone: "danger",
    },
    {
      id: "taken_worked",
      count: outcomeLearningCounts.takenWorked,
      label: copy.filterTakenWorked,
      text: copy.outcomeFocusTakenWorked,
      filter: "outcome_taken_worked",
      tone: "strong",
    },
    {
      id: "good_skip",
      count: outcomeLearningCounts.goodSkip,
      label: copy.filterGoodSkip,
      text: copy.outcomeFocusGoodSkip,
      filter: "outcome_good_skip",
      tone: "neutral",
    },
  ] satisfies OutcomeLearningFocusItem[]
).sort((a, b) => b.count - a.count);

const primaryOutcomeLearningFocus =
  outcomeLearningFocusItems.length > 0 &&
  outcomeLearningFocusItems[0].count > 0
    ? outcomeLearningFocusItems[0]
    : null;

    const missedOpportunityAlerts = alerts.filter((alert) =>
  isMissedOpportunityAlert(alert)
);

const missedOpportunitySetupCounts = missedOpportunityAlerts.reduce<
  Record<string, number>
>((acc, alert) => {
  const setupLabel =
    alert.setup_name ||
    alert.setup_type ||
    alert.setup_slug ||
    `${alert.symbol} setup`;

  acc[setupLabel] = (acc[setupLabel] || 0) + 1;

  return acc;
}, {});

const topMissedOpportunitySetup =
  Object.entries(missedOpportunitySetupCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0] ||
  null;

const missedOpportunityActionPlan = [
  copy.missedOpportunityActionOne,
  copy.missedOpportunityActionTwo,
  copy.missedOpportunityActionThree,
];

const alertFilterOptions: { id: AlertFilter; label: string; count: number }[] = [
  { id: "all", label: copy.filterAll, count: alerts.length },
  {
  id: "actionable",
  label: copy.filterActionable,
  count: alerts.filter((alert) => getAlertLifecycleBucket(alert) === "active" || alert.signal_mode === "actionable").length,
},
{
  id: "watchlist",
  label: copy.filterWatchlist,
  count: alerts.filter((alert) => getAlertLifecycleBucket(alert) === "armed" || getAlertLifecycleBucket(alert) === "watch" || alert.signal_mode === "armed" || alert.signal_mode === "watchlist").length,
},
{
  id: "decision_watching",
  label: copy.filterDecisionWatching,
  count: decisionCounts.watching,
},
{
  id: "decision_taken",
  label: copy.filterDecisionTaken,
  count: decisionCounts.taken,
},
{
  id: "taken_without_journal",
  label: copy.takenWithoutJournalFilter,
  count: alerts.filter((alert) => isAlertTakenWithoutJournal(alert)).length,
},
{
  id: "journal_linked",
  label: copy.filterJournalLinked,
  count: alerts.filter((alert) => hasLinkedJournalTrade(alert)).length,
},
{
  id: "execution_strong",
  label: copy.filterExecutionStrong,
  count: alerts.filter((alert) => hasStrongExecution(alert)).length,
},
{
  id: "execution_review",
  label: copy.filterExecutionReview,
  count: alerts.filter((alert) => needsExecutionReview(alert)).length,
},
{
  id: "execution_entry_issue",
  label: copy.entryIssueFilter,
  count: executionWeaknessCounts.entry,
},
{
  id: "execution_stop_issue",
  label: copy.stopIssueFilter,
  count: executionWeaknessCounts.stop,
},
{
  id: "execution_direction_issue",
  label: copy.directionIssueFilter,
  count: executionWeaknessCounts.direction,
},
{
  id: "execution_target_issue",
  label: copy.targetIssueFilter,
  count: executionWeaknessCounts.target,
},
{
  id: "outcome_taken_worked",
  label: copy.filterTakenWorked,
  count: outcomeLearningCounts.takenWorked,
},
{
  id: "outcome_taken_failed",
  label: copy.filterTakenFailed,
  count: outcomeLearningCounts.takenFailed,
},
{
  id: "outcome_missed_opportunity",
  label: copy.filterMissedOpportunity,
  count: outcomeLearningCounts.missedOpportunity,
},
{
  id: "outcome_good_skip",
  label: copy.filterGoodSkip,
  count: outcomeLearningCounts.goodSkip,
},
{
  id: "decision_skipped",
  label: copy.filterDecisionSkipped,
  count: decisionCounts.skipped,
},
{
  id: "decision_missed",
  label: copy.filterDecisionMissed,
  count: decisionCounts.missed,
},
  {
    id: "priority",
    label: copy.filterPriority,
    count: alerts.filter((alert) => alert.personal_priority_type === "priority")
      .length,
  },
  {
    id: "caution",
    label: copy.filterCaution,
    count: alerts.filter(
      (alert) =>
        alert.personal_priority_type === "caution" ||
        alert.personalization_type === "risk"
    ).length,
  },
  {
    id: "journal_match",
    label: copy.filterJournalMatch,
    count: alerts.filter((alert) => Boolean(alert.journal_pattern_label)).length,
  },
  {
    id: "ai_strength",
    label: copy.filterAiStrength,
    count: alerts.filter((alert) => alert.personalization_type === "strength")
      .length,
  },
  {
    id: "long",
    label: copy.filterLong,
    count: alerts.filter(
      (alert) => alert.direction === "upside" || alert.direction === "long"
    ).length,
  },
  {
    id: "short",
    label: copy.filterShort,
    count: alerts.filter(
      (alert) => alert.direction === "downside" || alert.direction === "short"
    ).length,
  },
  {
    id: "crypto",
    label: copy.filterCrypto,
    count: alerts.filter((alert) => alert.asset_type === "crypto").length,
  },
  {
    id: "stocks",
    label: copy.filterStocks,
    count: alerts.filter((alert) => alert.asset_type !== "crypto").length,
  },
];

  if (!hasAccess) {
    return (
      <section className="se-dashboard-panel rounded-[2rem] p-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
          SkillEdge AI Trading Desk
        </div>

        <h2 className="mt-2 text-3xl font-semibold text-white">
          {copy.title}
        </h2>

        <p className="mt-3 text-sm leading-6 text-white/55">
          {copy.locked}
        </p>
      </section>
    );
  }

  return (
    <section className="se-dashboard-panel rounded-[2.25rem] p-5 sm:p-6">
      <PremiumDashboardTabHero tab="alerts" />

      <div className="mb-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              Signal stream
            </div>
            <p className="mt-1 text-xs text-white/50">{copy.assetFilterText}</p>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1 sm:min-w-[360px]">
            {([
              { id: "all", label: copy.assetFilterAll, count: alerts.length },
              { id: "stock", label: copy.assetFilterStocks, count: stocksSignalCount },
              { id: "crypto", label: copy.assetFilterCrypto, count: cryptoSignalCount },
            ] as { id: AlertAssetFilter; label: string; count: number }[]).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSignalAssetFilterChange(item.id)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  signalAssetFilter === item.id
                    ? "bg-cyan-300 text-black shadow-[0_0_24px_rgba(103,232,249,0.25)]"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label} <span className="opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/40">
            SkillEdge AI Trading Desk
          </div>

          <h2 className="mt-2 text-3xl font-semibold text-white">
            {copy.title}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            {copy.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadAlerts(true)}
            disabled={generating || loading}
            className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? copy.generating : copy.generate}
          </button>

          <button
            type="button"
            onClick={() => loadAlerts(false)}
            disabled={generating || loading}
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.refresh}
          </button>

          <button
  type="button"
  onClick={checkAlertOutcomes}
  disabled={generating || loading || checkingOutcomes}
  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-40"
>
  {checkingOutcomes ? copy.checkingOutcomes : copy.checkOutcomes}
</button>

<button
  type="button"
  onClick={() => {
    if (playbookOpen) {
      setPlaybookOpen(false);
      return;
    }

    loadPersonalPlaybook();
  }}
  disabled={playbookLoading}
  className="rounded-full border border-violet-300/20 bg-violet-300/10 px-5 py-3 text-sm font-medium text-violet-50 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-40"
>
  {playbookOpen ? copy.hidePlaybook : copy.openPlaybook}
</button>

<button
  type="button"
  onClick={() => {
    if (signalProfileOpen) {
      setSignalProfileOpen(false);
      return;
    }

    loadSignalProfile();
  }}
  disabled={signalProfileLoading || signalProfileRebuilding}
  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-40"
>
  {signalProfileOpen ? copy.hideSignalProfile : copy.openSignalProfile}
</button>

<button
  type="button"
  onClick={() => {
    if (tradePatternsOpen) {
      setTradePatternsOpen(false);
      return;
    }

    loadTradePatterns();
  }}
  disabled={tradePatternsLoading || tradePatternsRebuilding}
  className="rounded-full border border-amber-300/20 bg-amber-300/10 px-5 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40"
>
  {tradePatternsOpen ? copy.hideTradePatterns : copy.openTradePatterns}
</button>
        </div>
      </div>

<div className="mt-5">
        <TelegramSignalsConnectButton />
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Latest 24H
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {assetFilteredAlerts.length}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            {signalAssetFilter === "all" ? "All markets" : signalAssetFilter === "crypto" ? "Crypto stream" : "Stocks stream"}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/45">
            Active
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalLifecycleCounts.active}
          </div>
          <div className="mt-1 text-[11px] text-emerald-50/45">
            Trade plans to review
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/45">
            Armed
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalLifecycleCounts.armed}
          </div>
          <div className="mt-1 text-[11px] text-cyan-50/45">
            Waiting confirmation
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Watch
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalLifecycleCounts.watch}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            Radar only
          </div>
        </div>
      </div>

<div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/20">
  <button
    type="button"
    onClick={() => setSignalsControlPanelOpen((current) => !current)}
    className="flex w-full flex-col gap-4 p-4 text-left transition hover:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between"
    aria-expanded={signalsControlPanelOpen}
  >
    <div>
      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-100/40">
        Signal workspace
      </div>
      <div className="mt-1 text-lg font-semibold text-white">
        {signalsControlPanelTitle}
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">
        {signalsControlPanelText}
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.045] px-3 py-1.5 text-xs font-semibold text-emerald-100/75">
        Active {allSignalLifecycleCounts.active}
      </span>
      <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-1.5 text-xs font-semibold text-cyan-100/75">
        Armed {allSignalLifecycleCounts.armed}
      </span>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/65">
        Watch {allSignalLifecycleCounts.watch}
      </span>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/75">
        {signalsControlPanelToggle} {signalsControlPanelOpen ? "↑" : "↓"}
      </span>
    </div>
  </button>

  {signalsControlPanelOpen ? (
    <div className="border-t border-white/10 p-4">
<div className="rounded-[1.25rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.85)]" />
        {copy.liveDesk}
      </div>

      <div className="mt-1 text-xs leading-5 text-white/45">
        {copy.autoRefreshNote}
      </div>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs text-white/55">
      {copy.lastChecked}:{" "}
      {alertsLastCheckedAt
        ? new Date(alertsLastCheckedAt).toLocaleTimeString()
        : "—"}
    </div>
  </div>
</div>

<div className="mt-5 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
    {alertFilterOptions.map((filter) => {
      const isActive = alertFilter === filter.id;

      return (
        <button
          key={filter.id}
          type="button"
          onClick={() => setAlertFilter(filter.id)}
          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition ${
            isActive
              ? "border-cyan-300/30 bg-cyan-300/15 text-cyan-50"
              : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          {filter.label} · {filter.count}
        </button>
      );
    })}
  </div>

  <div className="mt-3 text-xs text-white/35">
    Showing {visibleAlerts.length} of {assetFilteredAlerts.length} alerts in the selected stream · Active {signalLifecycleCounts.active} / Armed {signalLifecycleCounts.armed} / Watch {signalLifecycleCounts.watch}
{decisionReasonFilter ? ` · Reason: ${decisionReasonFilter}` : ""}
  </div>
</div>

<div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
  <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/45">
      {copy.worked}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {workedCount}
    </div>
  </div>

  <div className="rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-red-100/45">
      {copy.failed}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {failedCount}
    </div>
  </div>

  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
      {copy.pending}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {pendingCount}
    </div>
  </div>

  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
      {copy.neutral}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {neutralCount}
    </div>
  </div>

  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
      {copy.quality}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {qualityRate === null ? "—" : `${qualityRate}%`}
    </div>
  </div>

  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
      {copy.avgMfe}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {avgMfe === null ? "—" : `${avgMfe.toFixed(2)}%`}
    </div>
  </div>

  <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
      {copy.avgMae}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {avgMae === null ? "—" : `${avgMae.toFixed(2)}%`}
    </div>
  </div>

  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
      TP / Stop
    </div>
    <div className="mt-2 text-lg font-semibold text-white">
      {tpHitCount} / {stopHitCount}
    </div>
  </div>
</div>

{tradePatternsOpen ? (
  <div className="mt-5 rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.035] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/45">
          SkillEdge AI Journal Intelligence
        </div>

        <h3 className="mt-2 text-2xl font-semibold text-white">
          {copy.tradePatternsTitle}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          {copy.tradePatternsText}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">
          {tradePatternItems.length} patterns
        </div>

        <button
          type="button"
          onClick={rebuildTradePatterns}
          disabled={tradePatternsRebuilding}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tradePatternsRebuilding
            ? copy.rebuildingTradePatterns
            : copy.rebuildTradePatterns}
        </button>
      </div>
    </div>

    {tradePatternsError ? (
      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
        {tradePatternsError}
      </div>
    ) : null}

    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
          Strong candidates
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {strongTradePatterns.length}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
          Learning candidates
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {learningTradePatterns.length}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Pattern PnL
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          ${tradePatternTotalPnl.toFixed(2)}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Top pattern
        </div>
        <div className="mt-2 truncate text-sm font-semibold text-white">
          {topTradePattern ? topTradePattern.pattern_name : "—"}
        </div>
      </div>
    </div>

    {topTradePattern ? (
      <div className="mt-5 rounded-2xl border border-amber-300/15 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
          Best independent journal pattern
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">
              {topTradePattern.pattern_name}
            </div>

            <div className="mt-1 text-xs text-white/45">
              {topTradePattern.trades_count} trades · PnL $
              {Number(topTradePattern.total_pnl || 0).toFixed(2)} · avg $
              {topTradePattern.avg_pnl === null
                ? "—"
                : Number(topTradePattern.avg_pnl).toFixed(2)}
            </div>
          </div>

          <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100">
            {copy.patternStrength}: {topTradePattern.strength_score}
          </div>
        </div>

        {topTradePattern.ai_note ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
            {topTradePattern.ai_note}
          </div>
        ) : null}
      </div>
    ) : null}

    <div className="mt-5 space-y-3">
      {tradePatternsLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.tradePatternsLoading}
        </div>
      ) : tradePatternItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.tradePatternsEmpty}
        </div>
      ) : (
        tradePatternItems.map((pattern) => (
          <div
            key={pattern.id}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {pattern.market || "market"} · {pattern.direction || "setup"}
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {pattern.pattern_name}
                </div>

                <div className="mt-3 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                  {copy.patternStrength}: {pattern.strength_score}
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/50">
                  Trades: {pattern.trades_count}
                  <br />
                  Wins: {pattern.wins_count}
                  <br />
                  Total PnL: ${Number(pattern.total_pnl || 0).toFixed(2)}
                </div>
              </div>

              <div className="space-y-3">
                {pattern.ai_note ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
                    <span className="font-semibold text-white/85">
                      AI note:
                    </span>{" "}
                    {pattern.ai_note}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Avg PnL
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {pattern.avg_pnl === null
                        ? "—"
                        : `$${Number(pattern.avg_pnl).toFixed(2)}`}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Best PnL
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {pattern.best_pnl === null
                        ? "—"
                        : `$${Number(pattern.best_pnl).toFixed(2)}`}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Avg stop %
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {pattern.avg_stop_distance_percent === null
                        ? "—"
                        : `${pattern.avg_stop_distance_percent}%`}
                    </div>
                  </div>
                </div>

                {Array.isArray(pattern.example_tickers) &&
                pattern.example_tickers.length > 0 ? (
                  <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
                      {copy.examples}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {pattern.example_tickers.map((ticker) => (
                        <span
                          key={`${pattern.id}-${ticker}`}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65"
                        >
                          {ticker}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(pattern.matching_keywords) &&
                pattern.matching_keywords.length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                      {copy.keywords}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {pattern.matching_keywords.map((keyword) => (
                        <span
                          key={`${pattern.id}-${keyword}`}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
) : null}

{signalProfileOpen ? (
  <div className="mt-5 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-100/45">
          SkillEdge AI Personalization Layer
        </div>

        <h3 className="mt-2 text-2xl font-semibold text-white">
          {copy.signalProfileTitle}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          {copy.signalProfileText}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100">
          {signalProfileItems.length} setups
        </div>

        <button
          type="button"
          onClick={rebuildSignalProfile}
          disabled={signalProfileRebuilding}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {signalProfileRebuilding
            ? copy.rebuildingSignalProfile
            : copy.rebuildSignalProfile}
        </button>
      </div>
    </div>

    {signalProfileError ? (
      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
        {signalProfileError}
      </div>
    ) : null}

    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/45">
          {copy.personalStrength}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {personalStrengthProfiles.length}
        </div>
      </div>

      <div className="rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-red-100/45">
          {copy.riskZone}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {riskZoneProfiles.length}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
          {copy.learningProfile}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {learningProfiles.length}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          {copy.neutralProfile}
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {neutralProfiles.length}
        </div>
      </div>
    </div>

    {topSignalProfile ? (
      <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/45">
          Top personalized setup
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">
              {topSignalProfile.setup_name}
            </div>

            <div className="mt-1 text-xs text-white/45">
              {topSignalProfile.trades_count} trades · win rate{" "}
              {topSignalProfile.win_rate === null
                ? "—"
                : `${topSignalProfile.win_rate}%`}{" "}
              · PnL ${Number(topSignalProfile.total_pnl || 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-100">
            {copy.strengthScore}: {topSignalProfile.strength_score}
          </div>
        </div>

        {topSignalProfile.ai_note ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
            {topSignalProfile.ai_note}
          </div>
        ) : null}
      </div>
    ) : null}

    <div className="mt-5 space-y-3">
      {signalProfileLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.signalProfileLoading}
        </div>
      ) : signalProfileItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.signalProfileEmpty}
        </div>
      ) : (
        signalProfileItems.map((profile) => {
          const labelText =
            profile.profile_label === "personal_strength"
              ? copy.personalStrength
              : profile.profile_label === "risk_zone"
                ? copy.riskZone
                : profile.profile_label === "learning"
                  ? copy.learningProfile
                  : copy.neutralProfile;

          const labelClass =
            profile.profile_label === "personal_strength"
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : profile.profile_label === "risk_zone"
                ? "border-red-300/20 bg-red-300/10 text-red-100"
                : profile.profile_label === "learning"
                  ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-white/65";

          return (
            <div
              key={profile.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                    {profile.asset_type || "market"} ·{" "}
                    {profile.direction || "setup"}
                  </div>

                  <div className="mt-2 text-xl font-semibold text-white">
                    {profile.setup_name}
                  </div>

                  <div
                    className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${labelClass}`}
                  >
                    {labelText}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/50">
                    {copy.strengthScore}: {profile.strength_score}
                    <br />
                    {copy.planAdherence}:{" "}
                    {profile.avg_plan_adherence === null
                      ? "—"
                      : `${profile.avg_plan_adherence}%`}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                        Trades
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {profile.trades_count}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                        Win rate
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {profile.win_rate === null ? "—" : `${profile.win_rate}%`}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                        Total PnL
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        ${Number(profile.total_pnl || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                        Avg PnL
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {profile.avg_pnl === null
                          ? "—"
                          : `$${Number(profile.avg_pnl).toFixed(2)}`}
                      </div>
                    </div>
                  </div>

                  {profile.ai_note ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
                      <span className="font-semibold text-white/85">
                        {copy.aiNote}:
                      </span>{" "}
                      {profile.ai_note}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 text-xs text-white/45">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      Wins: {profile.wins_count}
                    </span>

                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      Losses: {profile.losses_count}
                    </span>

                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      Best:{" "}
                      {profile.best_pnl === null
                        ? "—"
                        : `$${Number(profile.best_pnl).toFixed(2)}`}
                    </span>

                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      Worst:{" "}
                      {profile.worst_pnl === null
                        ? "—"
                        : `$${Number(profile.worst_pnl).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
) : null}

{playbookOpen ? (
  <div className="mt-5 rounded-[1.5rem] border border-violet-300/15 bg-violet-300/[0.035] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-violet-100/45">
          SkillEdge AI Learning Layer
        </div>

        <h3 className="mt-2 text-2xl font-semibold text-white">
          {copy.playbookTitle}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          {copy.playbookText}
        </p>
      </div>

      <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-4 py-2 text-sm font-semibold text-violet-100">
        {playbookItems.length} setups
      </div>
    </div>

    {playbookError ? (
      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
        {playbookError}
      </div>
    ) : null}

    <div className="mt-5 space-y-3">
      {playbookLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.playbookLoading}
        </div>
      ) : playbookItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {copy.playbookEmpty}
        </div>
      ) : (
        playbookItems.map((setup) => (
          <div
            key={setup.id}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-violet-100/40">
                  {setup.asset_type || "market"} · {setup.direction || "setup"}
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {setup.setup_name}
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/50">
                  TF: {setup.setup_timeframe || "5m"} setup /{" "}
                  {setup.confirmation_timeframe || "10m"} confirmation
                </div>

                <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-cyan-50/75">
                  {copy.lastExample}: {setup.example_symbol || "—"}
                  {setup.confidence_tier ? ` · ${setup.confidence_tier}` : ""}
                </div>
              </div>

              <div className="space-y-3">
                {setup.lesson_summary ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/65">
                    <span className="font-semibold text-white/85">
                      Mini lesson:
                    </span>{" "}
                    {setup.lesson_summary}
                  </div>
                ) : null}

                {setup.setup_description ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
                    {setup.setup_description}
                  </div>
                ) : null}

                {Array.isArray(setup.confirmation_checklist) &&
                setup.confirmation_checklist.length > 0 ? (
                  <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
                      Confirmation checklist
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {setup.confirmation_checklist.map((item, index) => (
                        <div
                          key={`${setup.id}-confirm-${index}`}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-cyan-50/75"
                        >
                          ✓ {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(setup.avoid_if) && setup.avoid_if.length > 0 ? (
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
                      {copy.avoidThisTradeIf}
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {setup.avoid_if.map((item, index) => (
                        <div
                          key={`${setup.id}-avoid-${index}`}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-amber-50/75"
                        >
                          вљ  {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {setup.setup_common_mistake ? (
                  <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3 text-xs leading-5 text-red-50/75">
                    <span className="font-semibold text-red-100">
                      {copy.commonMistakeLabel}
                    </span>{" "}
                    {setup.setup_common_mistake}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 text-xs text-white/45">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Entry:{" "}
                    {setup.example_entry_zone_min && setup.example_entry_zone_max
                      ? `${setup.example_entry_zone_min}–${setup.example_entry_zone_max}`
                      : "—"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Stop: {setup.example_stop_price || "—"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Targets:{" "}
                    {[
                      setup.example_target_1,
                      setup.example_target_2,
                      setup.example_target_3,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
) : null}

<div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
        {copy.decisionAnalyticsTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.decisionAnalyticsText}
      </p>
    </div>

    <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100">
      Taken rate: {takenRate === null ? "—" : `${takenRate}%`}
    </div>
  </div>

  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <button
      type="button"
      onClick={() => setAlertFilter("decision_watching")}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "decision_watching"
          ? "border-cyan-300/30 bg-cyan-300/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        Watching
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {decisionCounts.watching}
      </div>
    </button>

    <button
      type="button"
      onClick={() => setAlertFilter("decision_taken")}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "decision_taken"
          ? "border-emerald-300/30 bg-emerald-300/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        Taken
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {decisionCounts.taken}
      </div>
    </button>

    <button
      type="button"
      onClick={() => setAlertFilter("decision_skipped")}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "decision_skipped"
          ? "border-white/30 bg-white/[0.08]"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        Skipped
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {decisionCounts.skipped}
      </div>
    </button>

    <button
      type="button"
      onClick={() => setAlertFilter("decision_missed")}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "decision_missed"
          ? "border-amber-300/30 bg-amber-300/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        Missed
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {decisionCounts.missed}
      </div>
    </button>

    <button
      type="button"
      onClick={() => setAlertFilter("all")}
      className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:bg-white/[0.05]"
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        Total marked
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {totalDecisionCount}
      </div>
    </button>
  </div>
</div>

<div className="mt-5 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-100/45">
        {copy.journalLinkAnalyticsTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.journalLinkAnalyticsText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {linkedJournalTrades.length} linked trades
    </div>
  </div>

  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        {copy.linkedAlertsCount}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {linkedAlertIds.size}
      </div>
    </div>

    <button
  type="button"
  onClick={() => {
    setAlertFilter("taken_without_journal");
    setVisibleAlertsCount(5);
    setExpandedAlertId(null);
  }}
  className={`rounded-2xl border p-4 text-left transition ${
    alertFilter === "taken_without_journal"
      ? "border-amber-300/35 bg-amber-300/10"
      : "border-amber-300/15 bg-amber-300/[0.035] hover:bg-amber-300/[0.07]"
  }`}
>
  <div className="text-[10px] uppercase tracking-[0.2em] text-amber-100/45">
    {copy.takenWithoutJournal}
  </div>

  <div className="mt-2 text-2xl font-semibold text-white">
    {takenWithoutJournalCount}
  </div>
</button>

    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        {copy.linkedTradesPnl}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {linkedTradesTotalPnl >= 0 ? "+" : ""}
        {linkedTradesTotalPnl.toFixed(2)}
      </div>
    </div>

    <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/45">
        {copy.avgExecutionScore}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {avgLinkedExecutionScore === null
          ? "—"
          : `${avgLinkedExecutionScore}/100`}
      </div>
    </div>
  </div>
  <div className="mt-5 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/45">
        {copy.executionQualityTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.executionQualityText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {avgLinkedExecutionScore === null
        ? "No reviews yet"
        : `Avg ${avgLinkedExecutionScore}/100`}
    </div>
  </div>

  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <button
      type="button"
      onClick={() => {
        setAlertFilter("journal_linked");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "journal_linked"
          ? "border-emerald-300/35 bg-emerald-300/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        {copy.filterJournalLinked}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {alerts.filter((alert) => hasLinkedJournalTrade(alert)).length}
      </div>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_strong");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_strong"
          ? "border-emerald-300/35 bg-emerald-300/10"
          : "border-emerald-300/15 bg-emerald-300/[0.035] hover:bg-emerald-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/45">
        {copy.filterExecutionStrong}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {alerts.filter((alert) => hasStrongExecution(alert)).length}
      </div>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_review");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_review"
          ? "border-amber-300/35 bg-amber-300/10"
          : "border-amber-300/15 bg-amber-300/[0.035] hover:bg-amber-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-100/45">
        {copy.filterExecutionReview}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {alerts.filter((alert) => needsExecutionReview(alert)).length}
      </div>
    </button>
  </div>
</div>
</div>

<div className="mt-5 rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/45">
        {copy.executionWeaknessTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.executionWeaknessText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {totalExecutionWeaknesses} issues tracked
    </div>
  </div>

  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_entry_issue");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_entry_issue"
          ? "border-amber-300/35 bg-amber-300/10"
          : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
        {copy.entryIssueFilter}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {executionWeaknessCounts.entry}
      </div>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_stop_issue");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_stop_issue"
          ? "border-red-300/35 bg-red-300/10"
          : "border-red-300/15 bg-red-300/[0.035] hover:bg-red-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-red-100/45">
        {copy.stopIssueFilter}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {executionWeaknessCounts.stop}
      </div>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_direction_issue");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_direction_issue"
          ? "border-cyan-300/35 bg-cyan-300/10"
          : "border-cyan-300/15 bg-cyan-300/[0.035] hover:bg-cyan-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/45">
        {copy.directionIssueFilter}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {executionWeaknessCounts.direction}
      </div>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("execution_target_issue");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "execution_target_issue"
          ? "border-violet-300/35 bg-violet-300/10"
          : "border-violet-300/15 bg-violet-300/[0.035] hover:bg-violet-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-violet-100/45">
        {copy.targetIssueFilter}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {executionWeaknessCounts.target}
      </div>
    </button>
  </div>
</div>

<div className="mt-5 rounded-[1.5rem] border border-violet-300/15 bg-violet-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-violet-100/45">
        {copy.executionFocusTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.executionFocusText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {primaryExecutionFocus
        ? `${primaryExecutionFocus.label} · ${primaryExecutionFocus.count}`
        : copy.noFocusYet}
    </div>
  </div>

  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
    {primaryExecutionFocus ? (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-white">
            Next focus: {primaryExecutionFocus.label}
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            {primaryExecutionFocus.text}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {executionFocusItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAlertFilter(item.filter);
                  setVisibleAlertsCount(5);
                  setExpandedAlertId(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  primaryExecutionFocus.id === item.id
                    ? "border-violet-300/30 bg-violet-300/15 text-violet-100"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAlertFilter(primaryExecutionFocus.filter);
            setVisibleAlertsCount(5);
            setExpandedAlertId(null);
          }}
          className="rounded-full border border-violet-300/20 bg-violet-300/10 px-4 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-300/15"
        >
          {copy.openFocusAlerts}
        </button>
      </div>
    ) : (
      <div>
        <div className="text-xl font-semibold text-white">
          Execution profile is still forming
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          {linkedJournalTrades.length > 0
            ? copy.focusStrongText
            : copy.executionFocusEmpty}
        </p>
      </div>
    )}
  </div>
  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-violet-100/45">
        {copy.executionActionPlanTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.executionActionPlanText}
      </p>
    </div>

    <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold text-violet-100">
      {primaryExecutionFocus ? primaryExecutionFocus.label : "Strong profile"}
    </div>
  </div>

  <div className="mt-4 grid gap-3 md:grid-cols-3">
    {executionActionPlan.map((item, index) => (
      <div
        key={`${item}-${index}`}
        className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-300/20 bg-violet-300/10 text-xs font-semibold text-violet-100">
          {index + 1}
        </div>

        <p className="mt-3 text-xs leading-5 text-white/62">
          {item}
        </p>
      </div>
    ))}
  </div>
</div>

</div>

<div className="mt-5 rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-100/45">
        {copy.outcomeLearningAnalyticsTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.outcomeLearningAnalyticsText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {totalOutcomeLearningCount} tracked outcomes
    </div>
  </div>

  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <button
      type="button"
      onClick={() => {
        setAlertFilter("outcome_taken_worked");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "outcome_taken_worked"
          ? "border-emerald-300/35 bg-emerald-300/10"
          : "border-emerald-300/15 bg-emerald-300/[0.035] hover:bg-emerald-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/45">
        {copy.filterTakenWorked}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {outcomeLearningCounts.takenWorked}
      </div>

      <p className="mt-2 text-xs leading-5 text-white/45">
        {copy.takenWorkedText}
      </p>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("outcome_taken_failed");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "outcome_taken_failed"
          ? "border-red-300/35 bg-red-300/10"
          : "border-red-300/15 bg-red-300/[0.035] hover:bg-red-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-red-100/45">
        {copy.filterTakenFailed}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {outcomeLearningCounts.takenFailed}
      </div>

      <p className="mt-2 text-xs leading-5 text-white/45">
        {copy.takenFailedText}
      </p>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("outcome_missed_opportunity");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "outcome_missed_opportunity"
          ? "border-amber-300/35 bg-amber-300/10"
          : "border-amber-300/15 bg-amber-300/[0.035] hover:bg-amber-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-100/45">
        {copy.filterMissedOpportunity}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {outcomeLearningCounts.missedOpportunity}
      </div>

      <p className="mt-2 text-xs leading-5 text-white/45">
        {copy.missedOpportunityText}
      </p>
    </button>

    <button
      type="button"
      onClick={() => {
        setAlertFilter("outcome_good_skip");
        setVisibleAlertsCount(5);
        setExpandedAlertId(null);
      }}
      className={`rounded-2xl border p-4 text-left transition ${
        alertFilter === "outcome_good_skip"
          ? "border-cyan-300/35 bg-cyan-300/10"
          : "border-cyan-300/15 bg-cyan-300/[0.035] hover:bg-cyan-300/[0.07]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/45">
        {copy.filterGoodSkip}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {outcomeLearningCounts.goodSkip}
      </div>

      <p className="mt-2 text-xs leading-5 text-white/45">
        {copy.goodSkipText}
      </p>
    </button>
  </div>
</div>

<div className="mt-5 rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/45">
        {copy.outcomeLearningFocusTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.outcomeLearningFocusText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {primaryOutcomeLearningFocus
        ? `${primaryOutcomeLearningFocus.label} · ${primaryOutcomeLearningFocus.count}`
        : copy.noFocusYet}
    </div>
  </div>

  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
    {primaryOutcomeLearningFocus ? (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-white">
           {copy.nextLearningFocus}: {primaryOutcomeLearningFocus.label}
          </div>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            {primaryOutcomeLearningFocus.text}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {outcomeLearningFocusItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAlertFilter(item.filter);
                  setVisibleAlertsCount(5);
                  setExpandedAlertId(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  primaryOutcomeLearningFocus.id === item.id
                    ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAlertFilter(primaryOutcomeLearningFocus.filter);
            setVisibleAlertsCount(5);
            setExpandedAlertId(null);
          }}
          className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/15"
        >
          {copy.openOutcomeFocusAlerts}
        </button>
      </div>
    ) : (
      <div>
        <div className="text-xl font-semibold text-white">
          {copy.outcomeProfileStillForming}
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          {copy.outcomeFocusEmpty}
        </p>
      </div>
    )}
  </div>
</div>

<div className="mt-5 rounded-[1.5rem] border border-red-300/15 bg-red-300/[0.035] p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-red-100/45">
        {copy.missedOpportunityCoachTitle}
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
        {copy.missedOpportunityCoachText}
      </p>
    </div>

    <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
      {missedOpportunityAlerts.length} {copy.missedOpportunitiesLabel}
    </div>
  </div>

  {missedOpportunityAlerts.length > 0 ? (
    <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-red-100/45">
          {copy.missedOpportunityTopSetup}
        </div>

        <div className="mt-3 text-2xl font-semibold text-white">
          {topMissedOpportunitySetup ? topMissedOpportunitySetup[0] : "—"}
        </div>

        <p className="mt-3 text-sm leading-6 text-white/55">
          {topMissedOpportunitySetup
            ? `${topMissedOpportunitySetup[1]} ${copy.workedAlertsMissedSuffix}`
            : copy.missedOpportunityCoachEmpty}
        </p>

        <button
          type="button"
          onClick={() => {
            setAlertFilter("outcome_missed_opportunity");
            setVisibleAlertsCount(5);
            setExpandedAlertId(null);
          }}
          className="mt-4 rounded-full border border-red-300/20 bg-red-300/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-300/15"
        >
          {copy.openOutcomeFocusAlerts}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-red-100/45">
          {copy.missedOpportunityActionPlan}
        </div>

        <div className="mt-4 grid gap-3">
          {missedOpportunityActionPlan.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-300/20 bg-red-300/10 text-xs font-semibold text-red-100">
                  {index + 1}
                </div>

                <p className="text-xs leading-5 text-white/62">
                  {item}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="text-xl font-semibold text-white">
        {copy.noMissedOpportunityPatternTitle}
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
        {copy.missedOpportunityCoachEmpty}
      </p>
    </div>
  )}
</div>

{decisionReasonItems.length > 0 ? (
  <div className="mt-5 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/45">
          {copy.reasonInsightsTitle}
        </div>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
          {copy.reasonInsightsText}
        </p>
      </div>

      <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-white/65">
        {copy.topReason}: {topDecisionReason?.reason || "—"}
      </div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setDecisionReasonFilter(null)}
        className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
          decisionReasonFilter === null
            ? "border-cyan-300/30 bg-cyan-300/15 text-cyan-100"
            : "border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.07] hover:text-white"
        }`}
      >
        {copy.allReasons}
      </button>

      {decisionReasonItems.map((item) => (
        <button
          key={item.reason}
          type="button"
          onClick={() => {
            setDecisionReasonFilter(item.reason);
            setVisibleAlertsCount(5);
            setExpandedAlertId(null);
          }}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
            decisionReasonFilter === item.reason
              ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
              : "border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          {item.reason} · {item.count}
        </button>
      ))}
    </div>
  </div>
) : null}

{visibleAlerts.length > 5 ? (
  <div className="mt-5 rounded-[1.25rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4 text-xs leading-5 text-cyan-50/65">
    <span className="font-semibold text-cyan-100">SkillEdge Priority:</span>{" "}
    {copy.smartTopFive}
  </div>
) : null}

    </div>
  ) : null}
</div>

      <div className="mt-5 space-y-3">
       {error ? (
  <div className="rounded-[1.5rem] border border-red-300/15 bg-red-300/[0.035] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-red-100/45">
          {copy.alertsStateErrorLabel}
        </div>

        <h3 className="mt-2 text-xl font-semibold text-white">
          {copy.alertsStateErrorTitle}
        </h3>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
          {copy.alertsStateErrorText}
        </p>

        <div className="mt-4 rounded-2xl border border-red-300/15 bg-black/20 p-4 text-xs leading-5 text-red-50/75">
          {error}
        </div>
      </div>

      <div className="rounded-full border border-red-300/20 bg-red-300/10 px-4 py-2 text-xs font-semibold text-red-100">
        Error
      </div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => loadAlerts(false)}
        disabled={generating || loading}
        className="rounded-full border border-red-300/20 bg-red-300/10 px-5 py-2.5 text-sm font-medium text-red-50 transition hover:bg-red-300/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copy.alertsStateRetry}
      </button>

      <button
        type="button"
        onClick={resetAlertFilters}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
      >
        {copy.alertsStateResetFilters}
      </button>
    </div>
  </div>
) : loading && alerts.length === 0 ? (
  <div className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/45">
          SkillEdge AI Loading State
        </div>

        <h3 className="mt-2 text-xl font-semibold text-white">
          {copy.alertsStateLoadingTitle}
        </h3>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
          {copy.alertsStateLoadingText}
        </p>
      </div>

      <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100">
        Loading
      </div>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="rounded-2xl border border-white/10 bg-black/20 p-4"
        >
          <div className="h-3 w-24 rounded-full bg-white/10" />
          <div className="mt-4 h-7 w-32 rounded-full bg-white/10" />
          <div className="mt-4 h-3 w-full rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  </div>
) : displayedAlerts.length === 0 ? (
  <div className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/45">
          {copy.alertsStateWaitingLabel}
        </div>

        <h3 className="mt-2 text-xl font-semibold text-white">
          {hasActiveAlertFilters
            ? copy.alertsStateFilterEmptyTitle
            : copy.alertsStateEmptyTitle}
        </h3>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
          {hasActiveAlertFilters
            ? copy.alertsStateFilterEmptyText
            : copy.alertsStateEmptyText}
        </p>

        <p className="mt-3 text-xs leading-5 text-cyan-50/60">
          {copy.alertsStateLiveNote}
        </p>
      </div>

      <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100">
  {copy.alertsStateLiveMonitoringLabel}
</div>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          {copy.selectedFilter}
        </div>

        <div className="mt-2 text-lg font-semibold text-white">
          {alertFilterOptions.find((filter) => filter.id === alertFilter)
            ?.label || copy.filterAll}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          {copy.totalAlerts}
        </div>

        <div className="mt-2 text-lg font-semibold text-white">
          {alerts.length}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Last checked
        </div>

        <div className="mt-2 text-lg font-semibold text-white">
          {alertsLastCheckedAt
            ? new Date(alertsLastCheckedAt).toLocaleTimeString()
            : "—"}
        </div>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      {hasActiveAlertFilters ? (
        <button
          type="button"
          onClick={resetAlertFilters}
          className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/15"
        >
          {copy.alertsStateResetFilters}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => loadAlerts(true)}
        disabled={generating || loading}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating ? copy.generating : copy.alertsStateRunScan}
      </button>

      <button
        type="button"
        onClick={() => loadAlerts(false)}
        disabled={generating || loading}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copy.refresh}
      </button>
    </div>
  </div>
) : (
  displayedAlerts.map((alert, index) => {
    const lifecycleBucket = getAlertLifecycleBucket(alert);
    const previousLifecycleBucket =
      index > 0 ? getAlertLifecycleBucket(displayedAlerts[index - 1]) : null;
    const showLifecycleHeader = lifecycleBucket !== previousLifecycleBucket;

    return (
      <div key={alert.id} className="space-y-3">
        {showLifecycleHeader ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 first:mt-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                  {getAlertLifecycleTitle(lifecycleBucket)}
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">
                  {getAlertLifecycleDescription(lifecycleBucket)}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getAlertLifecycleClass(lifecycleBucket)}`}>
                {lifecycleBucket === "active"
                  ? signalLifecycleCounts.active
                  : lifecycleBucket === "armed"
                    ? signalLifecycleCounts.armed
                    : signalLifecycleCounts.watch}
              </span>
            </div>
          </div>
        ) : null}

            <div
              key={alert.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[120px_minmax(190px,260px)_minmax(0,1fr)]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                    {alert.asset_type} · {alert.exchange || "—"}
                  </div>

                  <div className="mt-1 text-3xl font-semibold text-white">
                    {alert.symbol}
                  </div>

                  <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                    {copy.confidence}: {alert.confidence_score || alert.score}
{alert.confidence_tier ? ` · ${alert.confidence_tier}` : ""}
                  </div>

                  <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold tracking-[0.14em] ${getAlertLifecycleClass(getAlertLifecycleBucket(alert))}`}>
                    {getAlertLifecycleLabel(alert)}
                  </div>

                  <div className="mt-2 text-[11px] leading-4 text-white/42">
                    {getAlertLifecycleNote(alert)}
                  </div>

                  <div className="mt-3 text-xs leading-5 text-white/40">
                    {copy.time}: {new Date(alert.created_at).toLocaleString()}
                  </div>
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] leading-4 text-white/45">
  TF: {alert.setup_timeframe || "5m"} setup /{" "}
  {alert.confirmation_timeframe || "10m"} confirmation
</div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                    {copy.setup}
                  </div>

                  <div className="mt-2 text-sm font-semibold leading-5 text-white/85">
                    {alert.setup_name || alert.setup_type || alert.title}
                  </div>

                  {alert.signal_mode_label ? (
  <div
    className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
      alert.signal_mode === "actionable"
        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
        : alert.signal_mode === "caution"
          ? "border-red-300/20 bg-red-300/10 text-red-100"
          : alert.signal_mode === "watchlist"
            ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
            : "border-white/10 bg-white/[0.04] text-white/60"
    }`}
  >
    {alert.signal_mode_label}
  </div>
) : null}

                  <div className="mt-3 text-sm leading-5 text-white/60">
                    {alert.title}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs leading-5 text-white/50">
                    <div>
                      {copy.direction}:{" "}
                      <span className="text-white/75">{alert.direction}</span>
                    </div>

                    <div>
                      {copy.trigger}:{" "}
                      <span className="text-white/75">
                        {alert.trigger_label || "wait confirmation"}
                      </span>
                    </div>

                    <div>
                      {copy.entry}:{" "}
                      <span className="text-white/75">
                        {alert.entry_zone_min && alert.entry_zone_max
                          ? `${alert.entry_zone_min}–${alert.entry_zone_max}`
                          : "wait trigger"}
                      </span>
                    </div>

                    <div>
                      {copy.stop}:{" "}
                      <span className="text-white/75">
                        {alert.stop_price || "—"}
                      </span>
                    </div>

                    <div>
                      {copy.targets}:{" "}
                      <span className="text-white/75">
                        {[alert.target_1, alert.target_2, alert.target_3]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </span>
                    </div>
                  </div>

                  <AlertStructurePanel alert={alert} copy={copy} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                      {copy.reason}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-white/65">
                      {alert.reason}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
                      {copy.risk}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-amber-50/75">
                      {alert.risk_note || "Wait for confirmation."}
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
                      {copy.scenario}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-cyan-50/75">
                      {alert.scenario || "Watch trigger and confirmation."}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-red-100/45">
                      {copy.invalidation}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-red-50/75">
                      {alert.invalidation || "Invalid if setup fails confirmation."}
                    </div>
                  </div>
                </div>
              </div>

<div className="mt-3 flex flex-wrap items-center gap-2">
  <button
    type="button"
    onClick={() => saveAlertToPlaybook(alert)}
    disabled={
      savingPlaybookId === alert.id ||
      savedPlaybookAlertIds.includes(alert.id)
    }
    className="rounded-full border border-violet-300/20 bg-violet-300/10 px-4 py-2 text-xs font-medium text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {savedPlaybookAlertIds.includes(alert.id)
      ? copy.savedToPlaybook
      : savingPlaybookId === alert.id
        ? copy.savingToPlaybook
        : copy.saveToPlaybook}
  </button>

  <button
  type="button"
  onClick={() => {
    void saveAlertDecision(
      alert.id,
      "taken",
      alert.user_alert_decision_note || copy.reasonTradeDraftCreated
    );

    onCreateTradeFromAlert(alert);
  }}
  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15"
>
  {copy.createTradeDraft}
</button>

<button
  type="button"
  onClick={() => {
    const nextExpandedId = expandedAlertId === alert.id ? null : alert.id;

    setExpandedAlertId(nextExpandedId);

    if (nextExpandedId === alert.id) {
      markSingleAlertViewed(alert.id);
    }
  }}
  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15"
>
  {expandedAlertId === alert.id
    ? copy.hideAlertDetails
    : copy.openAlertDetails}
</button>

  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45">
    Adds this setup to your personal SkillEdge playbook
  </div>
</div>



              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                  {copy.status}: {alert.status}
                </span>

                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                  {copy.outcome}: {alert.outcome_status || "pending"}
                </span>
                {alert.user_alert_decision ? (
  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100/75">
    Decision: {alert.user_alert_decision}
  </span>
) : null}

{alert.user_alert_decision_note ? (
  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/50">
    Reason: {alert.user_alert_decision_note}
  </span>
) : null}

{(() => {
  const linkedTrades = getLinkedTradesForAlert(alert.id);

  if (linkedTrades.length === 0) return null;

  const executionScore = getLinkedExecutionScoreLabel(linkedTrades);

  return (
    <>
      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-emerald-100/75">
        Journal linked: {linkedTrades.length} · PnL{" "}
        {getLinkedPnlLabel(linkedTrades)}
      </span>

      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100/75">
        Execution: {executionScore}
      </span>
    </>
  );
})()}

{isAlertTakenWithoutJournal(alert) ? (
  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-amber-100/80">
    Taken · Journal missing
  </span>
) : null}

{(() => {
  const followup = getAlertOutcomeFollowup(alert);

  if (!alert.user_alert_decision) return null;

  return (
    <span
      className={`rounded-full border px-3 py-1 ${
        followup.tone === "strong"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100/80"
          : followup.tone === "warning"
            ? "border-amber-300/20 bg-amber-300/10 text-amber-100/80"
            : followup.tone === "danger"
              ? "border-red-300/20 bg-red-300/10 text-red-100/80"
              : "border-white/10 bg-white/[0.04] text-white/55"
      }`}
    >
      {copy.decisionVsOutcomeLabel}: {followup.decision} / {followup.outcome}
    </span>
  );
})()}

              </div>
              {alert.outcome_status && alert.outcome_status !== "pending" ? (
  <div className="mt-3 grid gap-2 text-xs text-white/45 md:grid-cols-4">
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">MFE</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.mfe === null || alert.mfe === undefined ? "—" : `${alert.mfe}%`}
      </div>
    </div>

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">MAE</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.mae === null || alert.mae === undefined ? "—" : `${alert.mae}%`}
      </div>
    </div>

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">Target</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.hit_target || "—"}
      </div>
    </div>

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">Stop</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.hit_stop ? "Hit" : "No"}
      </div>
    </div>
  </div>
) : null}
            </div>
      </div>
    );
  })
        )}
      </div>
      {visibleAlerts.length > 5 ? (
  <div className="mt-5 flex flex-wrap items-center gap-3">
    {hiddenAlertsCount > 0 ? (
      <button
        type="button"
        onClick={() =>
  setVisibleAlertsCount((current) =>
    Math.min(current + 10, rankedVisibleAlerts.length)
  )
}
        className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
      >
        {copy.showMoreAlerts} ({hiddenAlertsCount})
      </button>
    ) : null}

    {visibleAlertsCount > 5 ? (
      <button
        type="button"
        onClick={() => {
          setVisibleAlertsCount(5);
          setExpandedAlertId(null);
        }}
        className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
      >
        {copy.collapseAlerts}
      </button>
    ) : null}
  </div>
) : null}
{breakdownAlert && typeof document !== "undefined"
  ? createPortal(
      <div
  className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-3 py-4 backdrop-blur-md sm:px-6 sm:py-6"
  onClick={() => setExpandedAlertId(null)}
>
        <div
  className="relative w-[min(1180px,calc(100vw-24px))] max-h-[88vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#10131d] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.85)] [scrollbar-width:none] [-ms-overflow-style:none] sm:p-5 [&::-webkit-scrollbar]:hidden"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-wrap items-start justify-between gap-4 rounded-t-[2rem] border-b border-white/10 bg-[#10131d]/95 px-4 py-4 backdrop-blur-xl sm:-mx-5 sm:-mt-5 sm:px-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/45">
                {copy.breakdownTitle}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-3xl font-semibold text-white">
                  {breakdownAlert.symbol}
                </h3>

                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                  Confidence:{" "}
                  {breakdownAlert.confidence_score ?? breakdownAlert.score ?? "—"}
                  {breakdownAlert.confidence_tier
                    ? ` · ${breakdownAlert.confidence_tier}`
                    : ""}
                </span>

                {breakdownAlert.signal_mode_label ? (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      breakdownAlert.signal_mode === "actionable"
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                        : breakdownAlert.signal_mode === "caution"
                          ? "border-red-300/20 bg-red-300/10 text-red-100"
                          : breakdownAlert.signal_mode === "watchlist"
                            ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
                            : "border-white/10 bg-white/[0.04] text-white/60"
                    }`}
                  >
                    {breakdownAlert.signal_mode_label}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                {breakdownAlert.setup_name ||
                  breakdownAlert.setup_type ||
                  breakdownAlert.title ||
                  "SkillEdge AI signal"}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => saveAlertToPlaybook(breakdownAlert)}
                disabled={
                  savingPlaybookId === breakdownAlert.id ||
                  savedPlaybookAlertIds.includes(breakdownAlert.id)
                }
                className="inline-flex w-full items-center justify-center rounded-full border border-violet-300/20 bg-violet-300/10 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savedPlaybookAlertIds.includes(breakdownAlert.id)
                  ? copy.savedToPlaybook
                  : savingPlaybookId === breakdownAlert.id
                    ? copy.savingToPlaybook
                    : copy.saveToPlaybook}
              </button>

              <button
  type="button"
  onClick={() => {
    void saveAlertDecision(
      breakdownAlert.id,
      "taken",
      breakdownAlert.user_alert_decision_note || copy.reasonTradeDraftCreated
    );

    onCreateTradeFromAlert(breakdownAlert);
    setExpandedAlertId(null);
  }}
  className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/15 sm:w-auto"
>
  {copy.createTradeDraft}
</button>

              <button
  type="button"
  onClick={() => setExpandedAlertId(null)}
  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white sm:w-auto"
>
  <span className="text-base leading-none">×</span>
  {copy.closeBreakdown}
</button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {copy.decisionTitle}
                </div>

                <div className="mt-1 text-xs leading-5 text-white/45">
                  Mark how you handled this alert. This will power future Signal-to-Trade analytics.
                </div>
              </div>

              {breakdownAlert.user_alert_decision ? (
                <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                  {copy.decisionSaved}: {breakdownAlert.user_alert_decision}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { id: "watching", label: copy.decisionWatching },
                { id: "taken", label: copy.decisionTaken },
                { id: "skipped", label: copy.decisionSkipped },
                { id: "missed", label: copy.decisionMissed },
              ].map((item) => {
                const isActive = breakdownAlert.user_alert_decision === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      saveAlertDecision(
                        breakdownAlert.id,
                        item.id as "watching" | "taken" | "skipped" | "missed"
                      )
                    }
                    className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
                        : "border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {breakdownAlert.user_alert_decision ? (
  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        {copy.decisionReasonTitle}
      </div>

      {breakdownAlert.user_alert_decision_note ? (
        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          {breakdownAlert.user_alert_decision_note}
        </div>
      ) : null}
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      {[
  copy.reasonTradeDraftCreated,
  copy.reasonCleanTrigger,
  copy.reasonGoodRiskReward,
  copy.reasonJournalMatch,
  copy.reasonNoConfirmation,
  copy.reasonTooLate,
  copy.reasonRiskHigh,
  copy.reasonLiquidity,
  copy.reasonNotAtDesk,
].map((reason) => {
        const isActive = breakdownAlert.user_alert_decision_note === reason;

        return (
          <button
            key={reason}
            type="button"
            onClick={() =>
              saveAlertDecision(
                breakdownAlert.id,
                breakdownAlert.user_alert_decision as
                  | "watching"
                  | "taken"
                  | "skipped"
                  | "missed",
                reason
              )
            }
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
                : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {reason}
          </button>
        );
      })}
    </div>
  </div>
) : null}

{isAlertTakenWithoutJournal(breakdownAlert) ? (
  <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/45">
          {copy.takenWithoutJournalTitle}
        </div>

        <p className="mt-2 max-w-3xl text-xs leading-5 text-white/58">
          {copy.takenWithoutJournalText}
        </p>
      </div>

      <button
  type="button"
  onClick={() => {
    void saveAlertDecision(
      breakdownAlert.id,
      "taken",
      breakdownAlert.user_alert_decision_note || copy.reasonTradeDraftCreated
    );

    onCreateTradeFromAlert(breakdownAlert);
    setExpandedAlertId(null);
  }}
  className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/15"
>
  {copy.journalSyncAction}
</button>
    </div>
  </div>
) : null}

{(() => {
  const linkedTrades = getLinkedTradesForAlert(breakdownAlert.id);
  const hasLinkedTrades = linkedTrades.length > 0;

  return (
    <div
      className={`mt-4 rounded-2xl border p-4 ${
        hasLinkedTrades
          ? "border-emerald-300/15 bg-emerald-300/[0.035]"
          : "border-white/10 bg-black/20"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
            {copy.linkedJournalTitle}
          </div>

          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/58">
            {hasLinkedTrades ? copy.linkedJournalText : copy.linkedJournalEmpty}
          </p>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            hasLinkedTrades
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border-white/10 bg-white/[0.04] text-white/55"
          }`}
        >
          {hasLinkedTrades ? "Linked" : "Not linked"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
            {copy.linkedTrades}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            {linkedTrades.length}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
            {copy.linkedPnl}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">
            {getLinkedPnlLabel(linkedTrades)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
            {copy.linkedResult}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {getLinkedResultLabel(linkedTrades) || "—"}
          </div>
        </div>
        <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
  <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/45">
    {copy.executionScore}
  </div>
  <div className="mt-1 text-lg font-semibold text-white">
    {getLinkedExecutionScoreLabel(linkedTrades)}
  </div>
</div>
      </div>

      {hasLinkedTrades ? (
  <div className="mt-4 grid gap-2">
    {linkedTrades.slice(0, 3).map((trade) => {
      const review = getSignalExecutionReview(trade);
      const score = review?.adherenceScore ?? null;
      const tone = getExecutionScoreTone(score);

      const label =
        score === null
          ? "—"
          : score >= 80
            ? copy.executionStrong
            : score >= 60
              ? copy.executionMedium
              : copy.executionWeak;

      return (
        <div
          key={trade.id}
          className={`rounded-xl border p-3 text-xs leading-5 ${
            tone === "strong"
              ? "border-emerald-300/15 bg-emerald-300/[0.035] text-emerald-50/75"
              : tone === "medium"
                ? "border-cyan-300/15 bg-cyan-300/[0.035] text-cyan-50/75"
                : tone === "weak"
                  ? "border-amber-300/15 bg-amber-300/[0.035] text-amber-50/75"
                  : "border-white/10 bg-white/[0.035] text-white/58"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="font-semibold text-white/85">
                {trade.ticker}
              </span>{" "}
              · {trade.direction} · {trade.trade_date} · PnL{" "}
              {typeof trade.pnl === "number"
                ? `${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}`
                : "—"}{" "}
              · {trade.result || "open"}
            </div>

            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              {copy.executionScore}: {score === null ? "—" : `${score}/100`}
            </div>
          </div>

          <div className="mt-2 text-white/55">
            {copy.executionReview}: {label}
          </div>
        </div>
      );
    })}
  </div>
) : null}
{hasLinkedTrades ? (
  (() => {
    const coachNotes = getAlertExecutionCoachNotes(breakdownAlert);

    if (coachNotes.length === 0) return null;

    return (
      <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.035] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-violet-100/45">
              {copy.executionCoachTitle}
            </div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/58">
              {copy.executionCoachText}
            </p>
          </div>

          <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold text-violet-100">
            Coach notes
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {coachNotes.map((note) => (
            <div
              key={`${breakdownAlert.id}-${note.title}`}
              className={`rounded-xl border p-4 ${
                note.tone === "strong"
                  ? "border-emerald-300/15 bg-emerald-300/[0.035]"
                  : note.tone === "medium"
                    ? "border-cyan-300/15 bg-cyan-300/[0.035]"
                    : note.tone === "weak"
                      ? "border-amber-300/15 bg-amber-300/[0.035]"
                      : "border-white/10 bg-black/20"
              }`}
            >
              <div className="text-xs font-semibold text-white/85">
                {note.title}
              </div>

              <div className="mt-2 text-xs leading-5 text-white/58">
                {note.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  })()
) : null}
    </div>
  );
})()}

{breakdownAlert.user_alert_decision ? (
  (() => {
    const followup = getAlertOutcomeFollowup(breakdownAlert);

    return (
      <div
        className={`mt-4 rounded-2xl border p-5 ${
          followup.tone === "strong"
            ? "border-emerald-300/15 bg-emerald-300/[0.035]"
            : followup.tone === "warning"
              ? "border-amber-300/15 bg-amber-300/[0.035]"
              : followup.tone === "danger"
                ? "border-red-300/15 bg-red-300/[0.035]"
                : "border-white/10 bg-black/20"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
              {copy.outcomeFollowupTitle}
            </div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-white/58">
              {copy.outcomeFollowupText}
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/70">
            {followup.decision} / {followup.outcome}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.outcomeLearningLabel}
          </div>

          <p className="mt-2 text-sm leading-6 text-white/68">
            {followup.text}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
              Decision
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {followup.decision}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
              Outcome
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {followup.outcome}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
              MFE / MAE
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {breakdownAlert.mfe === null || breakdownAlert.mfe === undefined
                ? "—"
                : `${Number(breakdownAlert.mfe).toFixed(2)}%`}{" "}
              /{" "}
              {breakdownAlert.mae === null || breakdownAlert.mae === undefined
                ? "—"
                : `${Number(breakdownAlert.mae).toFixed(2)}%`}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
              TP / Stop
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {breakdownAlert.hit_target ||
                (safeLanguage === "ua"
                  ? "TP не досягнуто"
                  : safeLanguage === "en"
                    ? "Target not reached"
                    : "TP не достигнут")} /{" "}
              {breakdownAlert.hit_stop
                ? copy.stopHit
                : safeLanguage === "ua"
                  ? "Стоп не зачеплено"
                  : safeLanguage === "en"
                    ? "Stop not hit"
                    : "Стоп не задет"}
            </div>
          </div>
        </div>
      </div>
    );
  })()
) : null}

          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <div className="space-y-4">
              <div
                className={`rounded-2xl border p-5 ${
                  breakdownAlert.signal_mode === "actionable"
                    ? "border-emerald-300/20 bg-emerald-300/[0.055]"
                    : breakdownAlert.signal_mode === "caution"
                      ? "border-red-300/20 bg-red-300/[0.055]"
                      : breakdownAlert.signal_mode === "watchlist"
                        ? "border-cyan-300/20 bg-cyan-300/[0.055]"
                        : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">
                  {copy.traderDecision}
                </div>

                <div className="mt-2 text-lg font-semibold text-white">
                  {breakdownAlert.signal_mode_label || "Signal review"}
                </div>

                <p className="mt-2 text-sm leading-6 text-white/62">
                  {breakdownAlert.signal_mode_note ||
                    "Review the setup, wait for confirmation, and trade only if risk/reward is valid."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {copy.tradePlan}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      {copy.direction}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {breakdownAlert.direction || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      TF
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {breakdownAlert.setup_timeframe || "5m"} setup /{" "}
                      {breakdownAlert.confirmation_timeframe || "10m"} confirmation
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      {copy.entry}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {breakdownAlert.entry_zone_min != null &&
                      breakdownAlert.entry_zone_max != null
                        ? `${breakdownAlert.entry_zone_min}–${breakdownAlert.entry_zone_max}`
                        : "Wait trigger"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-red-100/45">
                      {copy.stop}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {breakdownAlert.stop_price ?? breakdownAlert.invalidation ?? "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3 md:col-span-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/45">
                      {copy.targets}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {[
                        breakdownAlert.target_1,
                        breakdownAlert.target_2,
                        breakdownAlert.target_3,
                      ]
                        .filter((value) => value != null)
                        .join(" / ") || "—"}
                    </div>
                  </div>
                </div>

                <AlertStructurePanel alert={breakdownAlert} copy={copy} />

                {breakdownAlert.management_plan ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-white/65">
                    <span className="font-semibold text-white/85">
                      {copy.management}:
                    </span>{" "}
                    {breakdownAlert.management_plan}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/45">
                  {copy.whyNow}
                </div>

                <p className="mt-2 text-sm leading-6 text-white/65">
                  {breakdownAlert.why_signal_fired ||
                    breakdownAlert.reason ||
                    "SkillEdge AI detected market activity, setup context and risk/reward conditions that made this ticker worth reviewing."}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                      {copy.confidenceTransparency}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-white/50">
                      {copy.confidenceTransparencyText}
                    </p>
                  </div>

                  <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    {breakdownAlert.confidence_score ?? breakdownAlert.score ?? "—"}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {getAlertTransparencyItems(breakdownAlert).map((item) => (
                    <div
                      key={`${breakdownAlert.id}-${item.label}`}
                      className={`rounded-xl border p-3 ${
                        item.type === "positive"
                          ? "border-emerald-300/15 bg-emerald-300/[0.035]"
                          : item.type === "warning"
                            ? "border-amber-300/15 bg-amber-300/[0.035]"
                            : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                          {item.label}
                        </div>

                        <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/65">
                          {item.value}
                        </div>
                      </div>

                      <div className="mt-2 text-xs leading-5 text-white/58">
                        {item.note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {Array.isArray(breakdownAlert.confirmation_checklist) &&
              breakdownAlert.confirmation_checklist.length > 0 ? (
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/45">
                    {copy.confirmationChecklist}
                  </div>

                  <div className="mt-3 grid gap-2">
                    {breakdownAlert.confirmation_checklist.map((item, index) => (
                      <div
                        key={`${breakdownAlert.id}-modal-confirm-${index}`}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-emerald-50/75"
                      >
                        ✓ {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(breakdownAlert.avoid_if) &&
              breakdownAlert.avoid_if.length > 0 ? (
                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/45">
                    {copy.avoidThisTradeIf}
                  </div>

                  <div className="mt-3 grid gap-2">
                    {breakdownAlert.avoid_if.map((item, index) => (
                      <div
                        key={`${breakdownAlert.id}-modal-avoid-${index}`}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-50/75"
                      >
                        вљ  {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {(breakdownAlert.lesson_summary ||
            breakdownAlert.setup_description ||
            breakdownAlert.setup_common_mistake) ? (
            <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.035] p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-violet-100/45">
                {copy.learningLayer}
              </div>

              {breakdownAlert.lesson_summary ? (
                <p className="mt-3 text-sm leading-6 text-white/65">
                  {breakdownAlert.lesson_summary}
                </p>
              ) : null}

              {breakdownAlert.setup_description ? (
                <p className="mt-3 text-xs leading-5 text-white/55">
                  {breakdownAlert.setup_description}
                </p>
              ) : null}

              {breakdownAlert.setup_common_mistake ? (
                <div className="mt-3 rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3 text-xs leading-5 text-red-50/75">
                  <span className="font-semibold text-red-100">
                    {copy.commonMistakeLabel}
                  </span>{" "}
                  {breakdownAlert.setup_common_mistake}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-red-300/15 bg-red-300/[0.03] p-4 text-xs leading-5 text-red-50/70">
  {copy.scoreDisclaimer}

  <div className="mt-3 flex flex-wrap items-center gap-2 text-white/35">
    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
      Esc
    </span>
    <span>{copy.closeBreakdownHint}</span>
  </div>
</div>
        </div>
      </div>,
      document.body
    )
  : null}
    </section>
  );
}

function MarketTab({
  subscription,
  language,
  t,
}: {
  subscription: Subscription;
  language: Language;
  t: (typeof dashboardDict)[Language];
}) {
  void t;

  const safeLanguage: Language =
    language === "en" || language === "ua" || language === "ru"
      ? language
      : "ru";

  const copy: MarketScannerCopy =
    marketScannerCopy[safeLanguage] ?? marketScannerCopy.ru;

 type UnifiedMarketOpportunity = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  assetType: "stock" | "crypto";
  signalType: "market" | "social" | "combined";
  marketScore: number;
  socialScore: number;
  combinedScore: number;
  changePercent: number | null;
  mentions24h: number;
  mentions1h: number;
  mentionVelocity: number;
  sentiment: "bullish" | "neutral" | "bearish" | string;
  marketBucket: MarketScannerItem["scan_bucket"] | null;
  directionBias: string | null;
  riskLabel: string | null;
  riskNote: string | null;
  catalystTitle: string | null;
  catalystUrl: string | null;
  catalystType: string | null;
  reason: string;
  marketItem?: MarketScannerItem;
  socialItem?: MarketSocialMentionItem;
};

  type MarketIntelligenceSignal = "combined" | "market_only" | "social_only";

type MarketIntelligenceItem = {
  symbol: string;
  exchange: string | null;
  name: string | null;
  asset_type: "stock" | "crypto" | string;
  signal: MarketIntelligenceSignal;
  score: number;
  market_score: number;
  social_score: number;
  change_percent: number | null;
  price: number | null;
  volume: number | null;
  mentions_24h: number;
  mentions_1h: number;
  mention_velocity: number;
  sentiment: "bullish" | "neutral" | "bearish" | string;
  catalyst: {
    title: string;
    site: string | null;
    url: string | null;
    published_at: string | null;
    catalyst_type: string;
    catalyst_score: number;
  } | null;
  reason: string;
  risk_note: string;
  sources: {
    market: string | null;
    social: string[];
  };
  scanned_at: string | null;
};

type MarketIntelligenceResponse = {
  source: string;
  provider: string;
  scannedAt: string;
  metrics: {
    total: number;
    combined: number;
    marketOnly: number;
    socialOnly: number;
    crypto: number;
    withCatalyst: number;
  };
  items: MarketIntelligenceItem[];
};

type MarketAIAnalysisItem = {
  symbol: string;
  verdict: string;
  confluence_score: number;
  setup_type: string;
  reason: string;
  risk_note: string;
  scenario: string;
  invalidation: string;
  action_note: string;
};

type MarketAIAnalysisResponse = {
  source: string;
  analyzedAt: string;
  summary: string;
  items: MarketAIAnalysisItem[];
};

type MarketAIBriefHistoryItem = {
  id: string;
  planId: string;
  language: string;
  source: string;
  summary: string;
  inputItems: unknown[];
  analysisItems: MarketAIAnalysisItem[];
  createdAt: string;
};

type MarketAIBriefHistoryResponse = {
  source: string;
  count: number;
  items: MarketAIBriefHistoryItem[];
};

  const localText = {
    ru: {
      title: "Центр рыночной разведки",
      subtitle:
        "Единый центр поиска активных тикеров: движение рынка, отслеживаемое внимание, новостные катализаторы и AI-разбор лучших кандидатов.",
      topTitle: "Лучшие возможности сейчас",
      topText:
        "Один список вместо отдельных сканеров. Система объединяет рыночную активность, Reddit-упоминания, новостные катализаторы, крипто-активность Binance и готовит тикеры для AI-разбора.",
      aiSoon: "AI-слой",
      aiSoonText:
        "AI-слой помогает разобрать сценарий, совпадения факторов, риск ловушки, условия отмены идеи и дальнейший план наблюдения.",
      dataNote:
        "Сейчас используются подключённые источники данных. Production data stack расширит покрытие рынка, внутридневные таймфреймы и полный universe акций/крипто.",
      refreshAll: "Обновить всё",
      aiAnalyzeTop: "AI-обзор рынка",
      aiAnalyzeTitle: "AI-обзор топ-10 возможностей",
      aiAnalyzeText:
        "SkillEdge AI разбирает топ-10 кандидатов из рыночной разведки: почему тикер активен, какой сетап формируется, где риск ловушки, какой сценарий смотреть и где идея ломается.",
      aiAnalyzeEmpty: "Сначала обнови сканер, чтобы появились тикеры для AI-разбора.",
      aiAnalyzePreview: "AI-предпросмотр",
      aiAnalyzeClose: "Закрыть",
      aiHistory: "История",
      aiHistoryTitle: "История AI-обзоров рынка",
      aiHistoryText: "Последние сохранённые AI-обзоры рынка.",
      aiHistoryEmpty: "Истории пока нет. Запусти AI-обзор рынка, чтобы сохранить первый разбор.",
      aiHistoryLoading: "Загружаем историю...",
      aiOpenBrief: "Открыть обзор",
      aiCloseBrief: "Закрыть обзор",
      aiSavedAnalysis: "Сохранённый AI-разбор",
      aiStocks: "Акции",
      aiCrypto: "Крипто",
      aiShowMore: "Показать ещё",
      aiShowLess: "Свернуть",
      aiNoItemsForTab: "Нет кандидатов для этого рынка.",
      aiAnalyzeError: "Не удалось получить AI-разбор. Проверь серверные настройки и попробуй ещё раз.",
      refreshing: "Обновляем...",
      search: "Поиск тикера...",
      asset: "Актив",
      signal: "Сигнал",
      sort: "Сортировка",
      allAssets: "Все активы",
      stocks: "Акции",
      crypto: "Крипто",
      allSignals: "Все сигналы",
      combined: "Комбинированный",
      marketOnly: "Только рынок",
      socialOnly: "Только внимание",
      sortScore: "Общий рейтинг",
      sortMentions: "Упоминания 24ч",
      sortMove: "Движение %",
      sortSocial: "Рейтинг внимания",
      ticker: "Тикер",
      combinedScore: "Рейтинг",
      mentions24h: "Отслежено за 24ч",
      move: "Движение",
      reason: "Почему важно",
      noData: "Пока нет данных. Нажми «Обновить всё».",
      rawMarket: "Исходные рыночные данные",
      rawSocial: "Исходные данные внимания",
      showRaw: "Показать исходные данные",
      hideRaw: "Скрыть исходные данные",
      source: "Источник",
      autoRefresh: "Автообновление",
      autoRefreshValue: "каждые 15 минут",
      coverageTitle: "Покрытие данных",
      coverageText:
        "Упоминания показывают только подключённые источники: сейчас Reddit; дополнительные источники готовятся к расширению покрытия. Это не полный охват всего интернета.",
      scanned: "Сканирование",
      lockedTitle: "Рыночная разведка доступна на SkillEdge Edge и Elite.",
      lockedText:
        "На Core доступен только предпросмотр. Edge и Elite открывают рыночный сканер, отслеживаемое внимание, комбинированные возможности и AI-обзор рынка.",
    },
    en: {
      title: "Market Intelligence Center",
      subtitle:
        "Unified in-play ticker research: market movement, tracked attention, news catalysts and AI review of the best candidates.",
      topTitle: "Top Opportunities Now",
      topText:
        "One list instead of separate scanners. The system combines market activity, Reddit mentions, news catalysts, Binance crypto activity and prepares tickers for AI review.",
      aiSoon: "AI Layer",
      aiSoonText:
        "The AI layer helps review scenarios, confluence, trap risk, invalidation and the next observation plan.",
      dataNote:
        "Connected data sources are used now. The production data stack expands market coverage, intraday timeframes and the full stock/crypto universe through premium market infrastructure.",
      refreshAll: "Refresh all",
      aiAnalyzeTop: "AI Market Brief",
      aiAnalyzeTitle: "AI Market Brief for top 10 opportunities",
      aiAnalyzeText:
        "SkillEdge AI reviews the top 10 Market Intelligence candidates: why the ticker is active, what setup is forming, where the trap risk is, what scenario to watch and where the idea breaks.",
      aiAnalyzeEmpty: "Refresh the scanner first to load tickers for AI review.",
      aiAnalyzePreview: "AI preview",
      aiAnalyzeClose: "Close",
      aiHistory: "History",
      aiHistoryTitle: "AI Market Brief History",
      aiHistoryText: "Latest saved AI market briefs.",
      aiHistoryEmpty: "No history yet. Run AI Market Brief to save the first review.",
      aiHistoryLoading: "Loading history...",
      aiOpenBrief: "Open brief",
      aiCloseBrief: "Close brief",
      aiSavedAnalysis: "Saved AI review",
      aiStocks: "Stocks",
      aiCrypto: "Crypto",
      aiShowMore: "Show more",
      aiShowLess: "Collapse",
      aiNoItemsForTab: "No candidates for this market.",
      aiAnalyzeError: "Failed to load AI review. Check server settings and try again.",
      refreshing: "Refreshing...",
      search: "Search ticker...",
      asset: "Asset",
      signal: "Signal",
      sort: "Sort",
      allAssets: "All assets",
      stocks: "Stocks",
      crypto: "Crypto",
      allSignals: "All signals",
      combined: "Combined",
      marketOnly: "Market only",
      socialOnly: "Attention only",
      sortScore: "Combined score",
      sortMentions: "Mentions 24H",
      sortMove: "Move %",
      sortSocial: "Attention score",
      ticker: "Ticker",
      combinedScore: "Score",
      mentions24h: "Tracked 24H",
      move: "Move",
      reason: "Why it matters",
      noData: "No data yet. Click “Refresh all”.",
      rawMarket: "Raw market data",
      rawSocial: "Raw attention data",
      showRaw: "Show raw data",
      hideRaw: "Hide raw data",
      source: "Source",
      autoRefresh: "Auto-refresh",
      autoRefreshValue: "every 15 minutes",
      coverageTitle: "Data coverage",
      coverageText:
        "Mentions show tracked sources only: connected Reddit coverage now, with additional tracked sources prepared for expansion. This is not full internet coverage.",
      scanned: "Scanned",
      lockedTitle: "Market Intelligence is available on SkillEdge Edge and Elite.",
      lockedText:
        "Core users can see the preview. Edge and Elite unlock market scanner, tracked attention, combined opportunities and AI Market Brief.",
    },
    ua: {
      title: "Центр ринкової розвідки",
      subtitle:
        "Єдиний центр пошуку активних тикерів: рух ринку, відстежувана увага, новинні каталізатори та AI-розбір найкращих кандидатів.",
      topTitle: "Найкращі можливості зараз",
      topText:
        "Один список замість окремих сканерів. Система поєднує ринкову активність, Reddit-згадки, новинні каталізатори, крипто-активність Binance і готує тикери для AI-розбору.",
      aiSoon: "AI-шар",
      aiSoonText:
        "AI-шар допомагає розібрати сценарій, збіг факторів, ризик пастки, умови скасування ідеї та подальший план спостереження.",
      dataNote:
        "Зараз використовуються підключені джерела даних. Production data stack розширить покриття ринку, внутрішньоденні таймфрейми та повний universe акцій/крипто.",
      refreshAll: "Оновити все",
      aiAnalyzeTop: "AI-огляд ринку",
      aiAnalyzeTitle: "AI-огляд топ-10 можливостей",
      aiAnalyzeText:
        "SkillEdge AI розбирає топ-10 кандидатів із ринкової розвідки: чому тикер активний, який сетап формується, де ризик пастки, який сценарій дивитися і де ідея ламається.",
      aiAnalyzeEmpty: "Спочатку онови сканер, щоб зʼявилися тикери для AI-розбору.",
      aiAnalyzePreview: "AI-перегляд",
      aiAnalyzeClose: "Закрити",
      aiHistory: "Історія",
      aiHistoryTitle: "Історія AI-оглядів ринку",
      aiHistoryText: "Останні збережені AI-огляди ринку.",
      aiHistoryEmpty: "Історії ще немає. Запусти AI-огляд ринку, щоб зберегти перший розбір.",
      aiHistoryLoading: "Завантажуємо історію...",
      aiOpenBrief: "Відкрити огляд",
      aiCloseBrief: "Закрити огляд",
      aiSavedAnalysis: "Збережений AI-розбір",
      aiStocks: "Акції",
      aiCrypto: "Крипто",
      aiShowMore: "Показати ще",
      aiShowLess: "Згорнути",
      aiNoItemsForTab: "Немає кандидатів для цього ринку.",
      aiAnalyzeError: "Не вдалося отримати AI-розбір. Перевір серверні налаштування і спробуй ще раз.",
      refreshing: "Оновлюємо...",
      search: "Пошук тикера...",
      asset: "Актив",
      signal: "Сигнал",
      sort: "Сортування",
      allAssets: "Усі активи",
      stocks: "Акції",
      crypto: "Крипто",
      allSignals: "Усі сигнали",
      combined: "Комбінований",
      marketOnly: "Тільки ринок",
      socialOnly: "Тільки увага",
      sortScore: "Загальний рейтинг",
      sortMentions: "Згадки 24г",
      sortMove: "Рух %",
      sortSocial: "Рейтинг уваги",
      ticker: "Тикер",
      combinedScore: "Рейтинг",
      mentions24h: "Відстежено за 24г",
      move: "Рух",
      reason: "Чому важливо",
      noData: "Поки немає даних. Натисни «Оновити все».",
      rawMarket: "Вихідні ринкові дані",
      rawSocial: "Вихідні дані уваги",
      showRaw: "Показати вихідні дані",
      hideRaw: "Сховати вихідні дані",
      source: "Джерело",
      autoRefresh: "Автооновлення",
      autoRefreshValue: "кожні 15 хвилин",
      coverageTitle: "Покриття даних",
      coverageText:
        "Згадки показують лише підключені джерела: зараз Reddit, пізніше Stocktwits і crypto-native джерела. Це не повне покриття всього інтернету.",
      scanned: "Сканування",
      lockedTitle: "Ринкова розвідка доступна на SkillEdge Edge та Elite.",
      lockedText:
        "На Core доступний лише попередній перегляд. Edge та Elite відкривають ринковий сканер, відстежувану увагу, комбіновані можливості та AI-огляд ринку.",
    },
  }[safeLanguage];

  const [items, setItems] = useState<MarketScannerItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketSource, setMarketSource] = useState("");
  const [scannedAt, setScannedAt] = useState("");

  const [socialItems, setSocialItems] = useState<MarketSocialMentionItem[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState("");
  const [socialSource, setSocialSource] = useState("");
  const [socialScannedAt, setSocialScannedAt] = useState("");
  const [marketIntelligenceItems, setMarketIntelligenceItems] = useState<
  MarketIntelligenceItem[]
>([]);
const [marketIntelligenceMetrics, setMarketIntelligenceMetrics] =
  useState<MarketIntelligenceResponse["metrics"] | null>(null);
const [marketIntelligenceLoading, setMarketIntelligenceLoading] =
  useState(false);
const [marketIntelligenceError, setMarketIntelligenceError] = useState("");
const [marketIntelligenceScannedAt, setMarketIntelligenceScannedAt] =
  useState("");

  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState<"all" | "stock" | "crypto">(
    "all"
  );
  const [signalFilter, setSignalFilter] = useState<
    "all" | "combined" | "market" | "social"
  >("all");
  const [sortBy, setSortBy] = useState<
    "combined" | "mentions" | "move" | "social"
  >("combined");
  const [rawExpanded, setRawExpanded] = useState(false);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
 const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
 const [aiPreviewItems, setAiPreviewItems] = useState<UnifiedMarketOpportunity[]>([]);
 const [aiAnalysisSummary, setAiAnalysisSummary] = useState("");
 const [aiAnalysisItems, setAiAnalysisItems] = useState<MarketAIAnalysisItem[]>([]);
 const [aiAnalysisError, setAiAnalysisError] = useState("");
  const [aiBriefTab, setAiBriefTab] = useState<"stocks" | "crypto">("stocks");
const [aiBriefExpanded, setAiBriefExpanded] = useState({
  stocks: false,
  crypto: false,
});
const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
const [aiHistoryError, setAiHistoryError] = useState("");
const [aiHistoryItems, setAiHistoryItems] = useState<MarketAIBriefHistoryItem[]>([]);
const [selectedAiBriefId, setSelectedAiBriefId] = useState<string | null>(null);
  const hasAccess =
    subscription.active && canUseFeature(subscription.plan, "social_tickers");
const tableScrollRef = useRef<HTMLDivElement | null>(null);

const handleTableWheel = (event: React.WheelEvent<HTMLDivElement>) => {
  const container = tableScrollRef.current;

  if (!container) return;

  const canScrollHorizontally =
    container.scrollWidth > container.clientWidth;

  if (!canScrollHorizontally) {
    return;
  }

  if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    event.preventDefault();

    container.scrollBy({
      left: event.deltaY,
      behavior: "smooth",
    });
  }
};
 

  const loadScanner = async (refresh = false) => {
    try {
      setMarketError("");
      setMarketLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMarketError("Unauthorized.");
        return;
      }

      const response = await authFetch(
  `/api/market/scanner${refresh ? "?refresh=true" : ""}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = (await response.json()) as {
        items?: MarketScannerItem[];
        source?: string;
        scannedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        setMarketError(data?.error || "Failed to load market scanner.");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setMarketSource(data.source || "");
      setScannedAt(data.scannedAt || "");
    } catch {
      setMarketError("Failed to load market scanner.");
    } finally {
      setMarketLoading(false);
    }
  };

  const loadSocialMentions = async (refresh = false) => {
    try {
      setSocialError("");
      setSocialLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSocialError("Unauthorized.");
        return;
      }

      const response = await authFetch(
  `/api/market/social-mentions${refresh ? "?refresh=true" : ""}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = (await response.json()) as {
        items?: MarketSocialMentionItem[];
        source?: string;
        provider?: string;
        scannedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        setSocialError(data?.error || "Failed to load social mentions.");
        return;
      }

      const rawItems = Array.isArray(data.items) ? data.items : [];

      const deduped = Array.from(
        new Map(
          rawItems.map((item) => [
            `${item.exchange || ""}:${item.symbol || ""}:${item.source || ""}`,
            item,
          ])
        ).values()
      );

      setSocialItems(deduped);
      setSocialSource(data.provider || data.source || "");
      setSocialScannedAt(data.scannedAt || "");
    } catch {
      setSocialError("Failed to load social mentions.");
    } finally {
      setSocialLoading(false);
    }
  };

  const loadMarketIntelligence = async () => {
    try {
      setMarketIntelligenceError("");
      setMarketIntelligenceLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMarketIntelligenceError("Unauthorized.");
        setMarketIntelligenceItems([]);
        setMarketIntelligenceMetrics(null);
        return;
      }

      const response = await authFetch("/api/market/intelligence", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | MarketIntelligenceResponse
        | { error?: string; locked?: boolean }
        | null;

      if (!response.ok) {
        const message =
          data && "error" in data && data.error
            ? data.error
            : "Failed to load market intelligence.";

        setMarketIntelligenceError(message);
        setMarketIntelligenceItems([]);
        setMarketIntelligenceMetrics(null);
        return;
      }

      const payload = data as MarketIntelligenceResponse;

      setMarketIntelligenceItems(Array.isArray(payload.items) ? payload.items : []);
      setMarketIntelligenceMetrics(payload.metrics || null);
      setMarketIntelligenceScannedAt(payload.scannedAt || "");
    } catch {
      setMarketIntelligenceError("Failed to load market intelligence.");
      setMarketIntelligenceItems([]);
      setMarketIntelligenceMetrics(null);
    } finally {
      setMarketIntelligenceLoading(false);
    }
  };

  const refreshAll = async () => {
  await loadScanner(true);
  await loadSocialMentions(true);
  await loadMarketIntelligence();
};

const handleAiAnalyzeTop = async () => {
  setAiPreviewOpen(true);
  setAiPreviewLoading(true);
  setAiAnalysisError("");
  setAiAnalysisSummary("");
  setAiAnalysisItems([]);

  const sortedOpportunities = opportunities
  .slice()
  .sort((a, b) => b.combinedScore - a.combinedScore);

const topStocks = sortedOpportunities
  .filter((item) => item.assetType !== "crypto")
  .slice(0, 10);

const topCrypto = sortedOpportunities
  .filter((item) => item.assetType === "crypto")
  .slice(0, 10);

const topCandidates = [...topStocks, ...topCrypto];

setAiBriefTab(topStocks.length > 0 ? "stocks" : "crypto");
setAiBriefExpanded({
  stocks: false,
  crypto: false,
});

  setAiPreviewItems(topCandidates);

  if (topCandidates.length === 0) {
    setAiPreviewLoading(false);
    return;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setAiAnalysisError("Unauthorized.");
      setAiPreviewLoading(false);
      return;
    }

    const response = await authFetch("/api/market/ai-analysis", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: safeLanguage,
        items: topCandidates.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          exchange: item.exchange,
          assetType: item.assetType,
          signalType: item.signalType,
          combinedScore: item.combinedScore,
          marketScore: item.marketScore,
          socialScore: item.socialScore,
          changePercent: item.changePercent,
          mentions24h: item.mentions24h,
          mentions1h: item.mentions1h,
          sentiment: item.sentiment,
          catalystTitle: item.catalystTitle,
          catalystType: item.catalystType,
          reason: item.reason,
          riskNote: item.riskNote,
        })),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | MarketAIAnalysisResponse
      | { error?: string; locked?: boolean }
      | null;

    if (!response.ok) {
      const message =
        data && "error" in data && data.error
          ? data.error
          : localText.aiAnalyzeError;

      setAiAnalysisError(message);
      return;
    }

    const payload = data as MarketAIAnalysisResponse;

    setAiAnalysisSummary(payload.summary || "");
    setAiAnalysisItems(Array.isArray(payload.items) ? payload.items : []);
  } catch {
    setAiAnalysisError(localText.aiAnalyzeError);
  } finally {
    setAiPreviewLoading(false);
  }
};

const loadAiBriefHistory = async () => {
  setAiHistoryOpen(true);
  setAiHistoryLoading(true);
  setAiHistoryError("");

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setAiHistoryError("Unauthorized.");
      setAiHistoryLoading(false);
      return;
    }

    const response = await authFetch("/api/market/ai-briefs?limit=10", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
      | MarketAIBriefHistoryResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      setAiHistoryError(
        data && "error" in data && data.error
          ? data.error
          : "Failed to load AI brief history."
      );
      setAiHistoryItems([]);
      return;
    }

    const payload = data as MarketAIBriefHistoryResponse;

    setAiHistoryItems(Array.isArray(payload.items) ? payload.items : []);
  } catch {
    setAiHistoryError("Failed to load AI brief history.");
    setAiHistoryItems([]);
  } finally {
    setAiHistoryLoading(false);
  }
};

  useEffect(() => {
  if (!hasAccess) return;

  const loadAllMarketData = async () => {
    await loadScanner(false);
    await loadSocialMentions(false);
    await loadMarketIntelligence();
  };

  loadAllMarketData();

  const interval = window.setInterval(() => {
    loadAllMarketData().catch((error) => {
      console.warn("Market auto-refresh failed:", error);
    });
  }, 900000);

  return () => window.clearInterval(interval);
}, [hasAccess]);

const opportunities = useMemo<UnifiedMarketOpportunity[]>(() => {
  return marketIntelligenceItems.map((item) => {
    const signalType: UnifiedMarketOpportunity["signalType"] =
      item.signal === "combined"
        ? "combined"
        : item.signal === "market_only"
          ? "market"
          : "social";

    return {
      symbol: item.symbol,
      name: item.name || item.symbol,
      exchange: item.exchange || "US",
      assetType: item.asset_type === "crypto" ? "crypto" : "stock",
      signalType,
      marketScore: Number(item.market_score || 0),
      socialScore: Number(item.social_score || 0),
      combinedScore: Number(item.score || 0),
      changePercent:
        typeof item.change_percent === "number" ? item.change_percent : null,
      mentions24h: Number(item.mentions_24h || 0),
      mentions1h: Number(item.mentions_1h || 0),
      mentionVelocity: Number(item.mention_velocity || 0),
      sentiment: item.sentiment || "neutral",
      marketBucket: null,
      directionBias: null,
      riskLabel: null,
      riskNote: item.risk_note || null,
catalystTitle: item.catalyst?.title || null,
catalystUrl: item.catalyst?.url || null,
catalystType: item.catalyst?.catalyst_type || null,
reason: item.reason || "Market Intelligence candidate detected.",
    };
  });
}, [marketIntelligenceItems]);  

  const filteredOpportunities = useMemo(() => {
    const q = query.trim().toLowerCase();

    return opportunities
      .filter((item) => {
        const matchesQuery =
          !q ||
          item.symbol.toLowerCase().includes(q) ||
          (item.name || "").toLowerCase().includes(q);

        const matchesAsset =
          assetFilter === "all" || item.assetType === assetFilter;

        const matchesSignal =
          signalFilter === "all" || item.signalType === signalFilter;

        return matchesQuery && matchesAsset && matchesSignal;
      })
      .sort((a, b) => {
        if (sortBy === "mentions") return b.mentions24h - a.mentions24h;
        if (sortBy === "move") {
          return Number(b.changePercent || 0) - Number(a.changePercent || 0);
        }
        if (sortBy === "social") return b.socialScore - a.socialScore;

        return b.combinedScore - a.combinedScore;
      });
  }, [opportunities, query, assetFilter, signalFilter, sortBy]);

  const topRows = filteredOpportunities.slice(0, 25);
  const combinedCount =
  marketIntelligenceMetrics?.combined ??
  opportunities.filter((item) => item.signalType === "combined").length;

const marketOnlyCount =
  marketIntelligenceMetrics?.marketOnly ??
  opportunities.filter((item) => item.signalType === "market").length;

const socialOnlyCount =
  marketIntelligenceMetrics?.socialOnly ??
  opportunities.filter((item) => item.signalType === "social").length;

const cryptoCount =
  marketIntelligenceMetrics?.crypto ??
  opportunities.filter((item) => item.assetType === "crypto").length;

const aiPreviewStocks = aiPreviewItems.filter(
  (item) => item.assetType !== "crypto"
);

const aiPreviewCrypto = aiPreviewItems.filter(
  (item) => item.assetType === "crypto"
);

const aiAnalysisStocks = aiAnalysisItems.filter((analysisItem) =>
  aiPreviewStocks.some((candidate) => candidate.symbol === analysisItem.symbol)
);

const aiAnalysisCrypto = aiAnalysisItems.filter((analysisItem) =>
  aiPreviewCrypto.some((candidate) => candidate.symbol === analysisItem.symbol)
);

const activeAiPreviewItems =
  aiBriefTab === "stocks" ? aiPreviewStocks : aiPreviewCrypto;

const activeAiAnalysisItems =
  aiBriefTab === "stocks" ? aiAnalysisStocks : aiAnalysisCrypto;

const activeAiExpanded =
  aiBriefTab === "stocks" ? aiBriefExpanded.stocks : aiBriefExpanded.crypto;

const visibleAiAnalysisItems = activeAiExpanded
  ? activeAiAnalysisItems
  : activeAiAnalysisItems.slice(0, 3);

const visibleAiPreviewItems = activeAiExpanded
  ? activeAiPreviewItems
  : activeAiPreviewItems.slice(0, 3);

const hiddenAiCount = Math.max(
  0,
  (aiAnalysisItems.length > 0
    ? activeAiAnalysisItems.length
    : activeAiPreviewItems.length) - 3
);

  return (
    <div className="space-y-5">
      <PremiumDashboardTabHero tab="market" />
      {!hasAccess && (
        <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-400/5 p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
            Locked
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {localText.lockedTitle}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            {localText.lockedText}
          </p>
        </div>
      )}

      <div
        className={
          hasAccess
            ? "space-y-5"
            : "pointer-events-none select-none space-y-5 opacity-50"
        }
      >
        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                {localText.title}
              </h2>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-white/55">
                {localText.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
  <button
    type="button"
    onClick={handleAiAnalyzeTop}
    disabled={marketIntelligenceItems.length === 0 || aiPreviewLoading}
    className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {aiPreviewLoading ? "AI..." : localText.aiAnalyzeTop}
  </button>

<button
  type="button"
  onClick={loadAiBriefHistory}
  disabled={aiHistoryLoading}
  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
>
  {aiHistoryLoading ? "..." : localText.aiHistory}
</button>

  <button
    type="button"
    onClick={refreshAll}
    disabled={marketLoading || socialLoading || marketIntelligenceLoading}
    className="se-dashboard-button-primary rounded-full px-6 py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {marketLoading || socialLoading || marketIntelligenceLoading
      ? localText.refreshing
      : localText.refreshAll}
  </button>
</div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {[
  [localText.combined, combinedCount],
  [localText.marketOnly, marketOnlyCount],
  [localText.socialOnly, socialOnlyCount],
  [localText.crypto, cryptoCount],
  ["News", marketIntelligenceMetrics?.withCatalyst ?? 0],
].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  {label}
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {value}
                </div>
              </div>
            ))}
          </div>

          {aiPreviewOpen && (
  <div className="mt-5 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.045] p-5 shadow-[0_18px_60px_rgba(34,211,238,0.08)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/45">
          {localText.aiAnalyzePreview}
        </div>

        <h3 className="mt-2 text-xl font-semibold text-white">
          {localText.aiAnalyzeTitle}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          {localText.aiAnalyzeText}
        </p>
        <div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/20 p-1">
  {[
    ["stocks", localText.aiStocks, aiPreviewStocks.length],
    ["crypto", localText.aiCrypto, aiPreviewCrypto.length],
  ].map(([tab, label, count]) => (
    <button
      key={String(tab)}
      type="button"
      onClick={() => setAiBriefTab(tab as "stocks" | "crypto")}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        aiBriefTab === tab
          ? "bg-cyan-300/15 text-cyan-50"
          : "text-white/50 hover:text-white"
      }`}
    >
      {label} · {count}
    </button>
  ))}
</div>

<div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/20 p-1">
  {[
    {
      id: "stocks" as const,
      label: localText.aiStocks,
      count: aiPreviewStocks.length,
    },
    {
      id: "crypto" as const,
      label: localText.aiCrypto,
      count: aiPreviewCrypto.length,
    },
  ].map((tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setAiBriefTab(tab.id)}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        aiBriefTab === tab.id
          ? "bg-cyan-300/15 text-cyan-50"
          : "text-white/50 hover:text-white"
      }`}
    >
      {tab.label} · {tab.count}
    </button>
  ))}
</div>

<p className="mt-3 max-w-3xl text-xs leading-5 text-white/42">
  Social attention is based on tracked sources only. Crypto-native attention may be
  undercounted until dedicated crypto sources are connected.
</p>

      </div>

      <button
        type="button"
        onClick={() => setAiPreviewOpen(false)}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.08] hover:text-white"
      >
        {localText.aiAnalyzeClose}
      </button>
    </div>

    {aiAnalysisError ? (
  <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100/80">
    {aiAnalysisError}
  </div>
) : null}

{aiAnalysisSummary ? (
  <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-black/20 p-5">
    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/45">
      SkillEdge AI Summary
    </div>
    <p className="mt-2 text-sm leading-6 text-white/70">
      {aiAnalysisSummary}
    </p>
  </div>
) : null}

<div className="mt-5 space-y-3">
  {aiPreviewLoading ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
      SkillEdge AI анализирует топовые возможности...
    </div>
  ) : activeAiPreviewItems.length === 0 ? (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
      {localText.aiNoItemsForTab}
    </div>
  ) : aiAnalysisItems.length === 0 ? (
    visibleAiPreviewItems.map((item, index) => (
      <div
        key={`ai-preview-${item.symbol}-${item.signalType}`}
        className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[90px_minmax(0,1fr)_90px]"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
            #{index + 1}
          </div>
          <div className="mt-1 text-xl font-semibold text-white">
            {item.symbol}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">
            {item.signalType}
          </div>
        </div>

        <div className="text-sm leading-6 text-white/55">
          Waiting for SkillEdge AI output...
        </div>

        <div className="flex items-start justify-end">
          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
            {item.combinedScore}
          </div>
        </div>
      </div>
    ))
  ) : (
    visibleAiAnalysisItems.map((item, index) => (
      <div
        key={`ai-analysis-${item.symbol}`}
        className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
      >
        <div className="grid gap-4 xl:grid-cols-[110px_minmax(180px,240px)_minmax(0,1fr)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/35">
              #{index + 1}
            </div>

            <div className="mt-1 text-2xl font-semibold text-white">
              {item.symbol}
            </div>

            <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
              {item.confluence_score}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              Setup
            </div>

            <div className="mt-2 text-sm font-semibold leading-5 text-white/85">
              {item.setup_type}
            </div>

            <div className="mt-3 text-sm leading-5 text-white/70">
              {item.verdict}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                Reason
              </div>
              <div className="mt-2 text-xs leading-5 text-white/65">
                {item.reason}
              </div>
            </div>

            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
                Risk
              </div>
              <div className="mt-2 text-xs leading-5 text-amber-50/75">
                {item.risk_note}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
                Scenario
              </div>
              <div className="mt-2 text-xs leading-5 text-cyan-50/75">
                {item.scenario}
              </div>
            </div>

            <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-red-100/45">
                Invalidation
              </div>
              <div className="mt-2 text-xs leading-5 text-red-50/75">
                {item.invalidation}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/62">
          {item.action_note}
        </div>
      </div>
    ))
  )}

  {hiddenAiCount > 0 ? (
    <button
      type="button"
      onClick={() =>
        setAiBriefExpanded((current) => ({
          ...current,
          [aiBriefTab]: !activeAiExpanded,
        }))
      }
      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
    >
      {activeAiExpanded
        ? localText.aiShowLess
        : `${localText.aiShowMore} ${hiddenAiCount}`}
    </button>
  ) : null}
</div>
  </div>
)}

{aiHistoryOpen && (
  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
          SkillEdge AI
        </div>

        <h3 className="mt-2 text-xl font-semibold text-white">
          {localText.aiHistoryTitle}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          {localText.aiHistoryText}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setAiHistoryOpen(false)}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.08] hover:text-white"
      >
        {localText.aiAnalyzeClose}
      </button>
    </div>

    <div className="mt-5 space-y-3">
      {aiHistoryLoading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {localText.aiHistoryLoading}
        </div>
      ) : aiHistoryError ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100/80">
          {aiHistoryError}
        </div>
      ) : aiHistoryItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
          {localText.aiHistoryEmpty}
        </div>
      ) : (
        aiHistoryItems.map((brief) => (
          <div
            key={brief.id}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {new Date(brief.createdAt).toLocaleString()}
                </div>

                <div className="mt-1 text-xs text-white/35">
                  {brief.analysisItems.length} AI items · {brief.planId}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
  <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
    Saved brief
  </div>

  <button
    type="button"
    onClick={() =>
      setSelectedAiBriefId((current) =>
        current === brief.id ? null : brief.id
      )
    }
    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/[0.08] hover:text-white"
  >
    {selectedAiBriefId === brief.id
      ? localText.aiCloseBrief
      : localText.aiOpenBrief}
  </button>
</div>
            </div>

            {brief.summary ? (
              <p className="mt-3 text-sm leading-6 text-white/65">
                {brief.summary}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {brief.analysisItems.slice(0, 10).map((item) => (
                <span
                  key={`${brief.id}-${item.symbol}`}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65"
                >
                  {item.symbol} · {item.confluence_score}
                </span>
              ))}
            </div>
            {selectedAiBriefId === brief.id ? (
  <div className="mt-4 space-y-3">
    <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">
      {localText.aiSavedAnalysis}
    </div>

    {brief.analysisItems.map((item, index) => (
      <div
        key={`${brief.id}-full-${item.symbol}-${index}`}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      >
        <div className="grid gap-4 xl:grid-cols-[110px_minmax(180px,240px)_minmax(0,1fr)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/35">
              #{index + 1}
            </div>

            <div className="mt-1 text-2xl font-semibold text-white">
              {item.symbol}
            </div>

            <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
              {item.confluence_score}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              Setup
            </div>

            <div className="mt-2 text-sm font-semibold leading-5 text-white/85">
              {item.setup_type}
            </div>

            <div className="mt-3 text-sm leading-5 text-white/70">
              {item.verdict}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                Reason
              </div>
              <div className="mt-2 text-xs leading-5 text-white/65">
                {item.reason}
              </div>
            </div>

            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
                Risk
              </div>
              <div className="mt-2 text-xs leading-5 text-amber-50/75">
                {item.risk_note}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
                Scenario
              </div>
              <div className="mt-2 text-xs leading-5 text-cyan-50/75">
                {item.scenario}
              </div>
            </div>

            <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-red-100/45">
                Invalidation
              </div>
              <div className="mt-2 text-xs leading-5 text-red-50/75">
                {item.invalidation}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/62">
          {item.action_note}
        </div>
      </div>
    ))}
  </div>
) : null}
          </div>
        ))
      )}
    </div>
  </div>
)}

          <div className="mt-5">
            <div className="rounded-[1.4rem] border border-white/10 bg-black/10 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
                {localText.topTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/55">
                {localText.topText}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={localText.search}
                  className="rounded-full border border-white/10 bg-[#121828] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                />

                <select
                  value={assetFilter}
                  onChange={(event) =>
                    setAssetFilter(event.target.value as "all" | "stock" | "crypto")
                  }
                  className="rounded-full border border-white/10 bg-[#121828] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="all">{localText.allAssets}</option>
                  <option value="stock">{localText.stocks}</option>
                  <option value="crypto">{localText.crypto}</option>
                </select>

                <select
                  value={signalFilter}
                  onChange={(event) =>
                    setSignalFilter(
                      event.target.value as "all" | "combined" | "market" | "social"
                    )
                  }
                  className="rounded-full border border-white/10 bg-[#121828] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="all">{localText.allSignals}</option>
                  <option value="combined">{localText.combined}</option>
                  <option value="market">{localText.marketOnly}</option>
                  <option value="social">{localText.socialOnly}</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value as
                        | "combined"
                        | "mentions"
                        | "move"
                        | "social"
                    )
                  }
                  className="rounded-full border border-white/10 bg-[#121828] px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="combined">{localText.sortScore}</option>
                  <option value="mentions">{localText.sortMentions}</option>
                  <option value="move">{localText.sortMove}</option>
                  <option value="social">{localText.sortSocial}</option>
                </select>
              </div>

              {(marketError || socialError || marketIntelligenceError) && (
  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
    {marketError || socialError || marketIntelligenceError}
  </div>
)}

              <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/[0.02]">
 <div
  ref={tableScrollRef}
  onWheel={handleTableWheel}
  className="w-full overflow-x-auto overscroll-x-contain rounded-[1.1rem] scroll-smooth [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.28)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/35"
>
                  <div className="grid min-w-[1040px] grid-cols-[96px_78px_112px_70px_76px_88px_minmax(440px,1fr)] gap-x-3 bg-white/[0.04] px-3 py-3 text-[10px] uppercase tracking-[0.16em] text-white/35">
                    <div>{localText.ticker}</div>
                    <div>{localText.asset}</div>
                    <div>{localText.signal}</div>
                    <div>{localText.combinedScore}</div>
                    <div>{localText.mentions24h}</div>
                    <div>{localText.move}</div>
                    <div>{localText.reason}</div>
                  </div>

                  {topRows.length === 0 ? (
                    <div className="p-5 text-sm text-white/50">
                      {localText.noData}
                    </div>
                  ) : (
                    topRows.map((item) => (
                      <div
                        key={`${item.exchange || ""}-${item.symbol}-${item.signalType}`}
                        className="grid min-w-[1040px] grid-cols-[96px_78px_112px_70px_76px_88px_minmax(440px,1fr)] items-center gap-x-3 border-t border-white/10 px-3 py-3 text-sm text-white/70 transition hover:bg-white/[0.035]">
                        <div className="min-w-0">
                          <div className="font-semibold text-white">
                            {item.symbol}
                          </div>
                          <div className="truncate text-xs text-white/35">
                            {item.exchange || "US"}
                          </div>
                        </div>

                        <div>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/60">
                            {item.assetType === "crypto"
                              ? localText.crypto
                              : localText.stocks}
                          </span>
                        </div>

                        <div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              item.signalType === "combined"
                                ? "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                                : item.signalType === "market"
                                  ? "border border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                                  : "border border-violet-300/25 bg-violet-300/10 text-violet-100"
                            }`}
                          >
                            {item.signalType === "combined"
                              ? localText.combined
                              : item.signalType === "market"
                                ? localText.marketOnly
                                : localText.socialOnly}
                          </span>
                        </div>

                        <div className="space-y-1">
  <div className="text-base font-semibold text-white">
    {item.combinedScore}
  </div>

  <div className="flex flex-wrap gap-1 text-[10px] text-white/45">
    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-1.5 py-0.5 text-cyan-100/80">
      M {item.marketScore}
    </span>

    <span className="rounded-full border border-violet-300/15 bg-violet-300/10 px-1.5 py-0.5 text-violet-100/80">
      S {item.socialScore}
    </span>
  </div>
</div>

                        <div className="space-y-1">
  <div className="font-semibold text-white">
    {formatMarketNumber(item.mentions24h)}
  </div>

  <div className="flex flex-col gap-0.5 text-[11px] text-white/35">
    <span>1h: {formatMarketNumber(item.mentions1h)}</span>

    {item.mentionVelocity > 0 ? (
      <span>
        velocity: {(item.mentionVelocity * 100).toFixed(0)}%
      </span>
    ) : null}
  </div>
</div>

                        <div>
  {item.changePercent === null ? (
    <span className="text-white/35">—</span>
  ) : (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
        Number(item.changePercent || 0) >= 0
          ? "bg-emerald-300/10 text-emerald-100"
          : "bg-red-300/10 text-red-100"
      }`}
    >
      {Number(item.changePercent || 0) >= 0 ? "+" : ""}
      {Number(item.changePercent || 0).toFixed(2)}%
    </span>
  )}
</div>

                        <div className="text-xs leading-5 text-white/55">
  <div className="min-w-0 text-xs leading-5 text-white/60">
  <div className="line-clamp-2 break-words">
    {item.reason}
  </div>

  {item.catalystTitle && item.catalystUrl ? (
    <a
      href={item.catalystUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-1 block truncate text-emerald-200/85 transition hover:text-emerald-100 hover:underline"
      title={item.catalystTitle}
    >
      News: {item.catalystTitle}
    </a>
  ) : null}

  {item.riskNote ? (
    <div className="mt-1 line-clamp-2 break-words text-amber-100/75">
      Risk: {item.riskNote}
    </div>
  ) : null}
</div>

</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-3">
  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
      DATA SOURCES
    </div>

    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
        <span>Reddit mentions</span>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
          Active
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
        <span>Binance universe</span>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
          Active
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
        <div>
          <p className="text-xs font-semibold text-slate-100">News catalysts</p>
          <p className="text-[11px] text-slate-500">
            Fresh headlines / catalyst detection
          </p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
          Active
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
        <div>
          <p className="text-xs font-semibold text-slate-100">Stocktwits</p>
          <p className="text-[11px] text-slate-500">
            Trader sentiment stream
          </p>
        </div>
        <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-xs text-violet-100">
          Planned
        </span>
      </div>
    </div>
  </div>

<div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
    {localText.coverageTitle}
  </div>

  <div className="mt-3 space-y-3 text-sm leading-6 text-white/70">
    <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
      <div className="text-xs font-semibold text-cyan-100">
        {localText.autoRefresh}: {localText.autoRefreshValue}
      </div>
      <div className="mt-1 text-xs text-white/45">
        Client reads the latest cached Market Intelligence snapshot.
      </div>
    </div>

    <p className="text-xs leading-5 text-white/50">
      {localText.coverageText}
    </p>
  </div>
</div>

  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)]">
    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
      SOURCE
    </div>

    <div className="mt-3 text-sm leading-6 text-white/70">
  <div>
    {localText.source}: intelligence{" "}
    {marketIntelligenceItems.length > 0
      ? "unified_market_intelligence"
      : "—"}{" "}
    · market {marketSource || "—"} · social {socialSource || "—"}
  </div>

  <div className="mt-1">
    {localText.scanned}:{" "}
    {marketIntelligenceScannedAt
      ? new Date(marketIntelligenceScannedAt).toLocaleString()
      : "—"}{" "}
    / market {scannedAt ? new Date(scannedAt).toLocaleString() : "—"} / social{" "}
    {socialScannedAt ? new Date(socialScannedAt).toLocaleString() : "—"}
  </div>

  <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/45">
    Tracked mentions are source-specific and may undercount crypto-native ecosystems.
  </div>
</div>


    <button
      type="button"
      onClick={() => setRawExpanded((current) => !current)}
      className="mt-4 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08]"
    >
      {rawExpanded ? localText.hideRaw : localText.showRaw}
    </button>
  </div>
</div>
          </div>

          {rawExpanded && (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.4rem] border border-white/10 bg-black/10 p-4">
                <div className="text-sm font-semibold text-white">
                  {localText.rawMarket}
                </div>
                <div className="mt-3 space-y-2">
                  {items.slice(0, 12).map((item) => (
                    <div
                      key={`${item.scan_bucket}-${item.symbol}-${item.scanned_at || ""}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {item.symbol}
                        </div>
                        <div className="text-xs text-white/35">
                          {getBucketLabel(item.scan_bucket, copy)}
                        </div>
                      </div>
                      <div className="text-white/60">
                        {item.opportunity_score ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-black/10 p-4">
                <div className="text-sm font-semibold text-white">
                  {localText.rawSocial}
                </div>
                <div className="mt-3 space-y-2">
                  {socialItems.slice(0, 12).map((item) => (
                    <div
                      key={`${item.exchange || ""}-${item.symbol}-${item.source || ""}`}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {item.symbol}
                        </div>
                        <div className="text-xs text-white/35">
                          {item.exchange || "US"} · {item.source || "social"}
                        </div>
                      </div>
                      <div className="text-white/60">
                        {item.mentions_24h ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function OverviewTab({ t }: { t: (typeof dashboardDict)[Language] }) {
  const isRu = t.dashboard === "Личный кабинет";
  const isUa = t.dashboard === "Особистий кабінет";

  const copy = isRu
    ? {
        badge: "Trading cockpit",
        title: "Контроль процесса перед результатом.",
        text:
          "Overview показывает не просто цифры, а состояние твоей торговой системы: PnL, винрейт, дисциплина, повторяемость и качество решений.",
        sessionTitle: "Состояние торгового процесса",
        sessionText:
          "Сначала журнал и дисциплина. Потом статистика. Потом персональные выводы и улучшение.",
        focusTitle: "На что смотреть сегодня",
        focusItems: [
          ["Риск", "Не превышать лимит риска на сделку."],
          ["Дисциплина", "Входить только после подтверждения сетапа."],
          ["Журнал", "Фиксировать причину входа, эмоцию и ошибку."],
          ["Review", "После сессии разобрать лучшие и худшие решения."],
        ],
        weeklyLabel: "AI review layer",
        qualityTitle: "Качество процесса",
        qualityItems: [
          "Нет статистики — нет системы.",
          "Нет журнала — нет персонализации.",
          "Нет review — ошибки повторяются.",
        ],
      }
    : isUa
      ? {
          badge: "Trading cockpit",
          title: "Контроль процесу перед результатом.",
          text:
            "Overview показує не просто цифри, а стан твоєї торгової системи: PnL, вінрейт, дисципліну, повторюваність і якість рішень.",
          sessionTitle: "Стан торгового процесу",
          sessionText:
            "Спочатку журнал і дисципліна. Потім статистика. Потім персональні висновки та покращення.",
          focusTitle: "На що дивитись сьогодні",
          focusItems: [
            ["Ризик", "Не перевищувати ліміт ризику на угоду."],
            ["Дисципліна", "Входити тільки після підтвердження сетапу."],
            ["Журнал", "Фіксувати причину входу, емоцію та помилку."],
            ["Review", "Після сесії розібрати найкращі й найгірші рішення."],
          ],
          weeklyLabel: "AI review layer",
          qualityTitle: "Якість процесу",
          qualityItems: [
            "Немає статистики — немає системи.",
            "Немає журналу — немає персоналізації.",
            "Немає review — помилки повторюються.",
          ],
        }
      : {
          badge: "Trading cockpit",
          title: "Control the process before the result.",
          text:
            "Overview is not just numbers. It shows the state of your trading system: PnL, win rate, discipline, repeatability and decision quality.",
          sessionTitle: "Trading process state",
          sessionText:
            "First journal and discipline. Then statistics. Then personal conclusions and improvement.",
          focusTitle: "What to watch today",
          focusItems: [
            ["Risk", "Do not exceed risk limit per trade."],
            ["Discipline", "Enter only after setup confirmation."],
            ["Journal", "Log entry reason, emotion and mistake."],
            ["Review", "After the session, review best and worst decisions."],
          ],
          weeklyLabel: "AI review layer",
          qualityTitle: "Process quality",
          qualityItems: [
            "No statistics — no system.",
            "No journal — no personalization.",
            "No review — mistakes repeat.",
          ],
        };

  return (
    <div className="space-y-6">
      <SectionHeader title={t.overview.title} text={t.overview.text} />

      <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="se-dashboard-panel relative overflow-hidden rounded-[2.2rem] p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,214,255,0.13),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(52,211,153,0.1),transparent_30%)]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">
              {copy.badge}
            </div>

            <h3 className="mt-5 max-w-3xl text-3xl font-black leading-[1.05] tracking-[-0.045em] text-white md:text-4xl">
              {copy.title}
            </h3>

            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-white/60">
              {copy.text}
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {copy.focusItems.map(([title, text], index) => (
                <div
                  key={title}
                  className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/16 bg-cyan-200/[0.08] text-[10px] font-black text-cyan-50">
                    0{index + 1}
                  </div>

                  <div className="mt-4 text-sm font-black text-white">
                    {title}
                  </div>

                  <p className="mt-2 text-xs font-semibold leading-5 text-white/48">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="se-dashboard-card relative overflow-hidden rounded-[2.2rem] p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(247,201,72,0.12),transparent_30%),radial-gradient(circle_at_16%_90%,rgba(56,214,255,0.11),transparent_32%)]" />

          <div className="relative">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/38">
              {copy.sessionTitle}
            </div>

            <p className="mt-4 text-sm font-semibold leading-7 text-white/60">
              {copy.sessionText}
            </p>

            <div className="mt-6 grid gap-3">
              {copy.qualityItems.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/18 p-4 text-sm font-bold leading-6 text-white/65"
                >
                  ✓ {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label={t.overview.pnlMonth}
          value="$0"
          helper={isRu ? "Появится после сделок" : isUa ? "Зʼявиться після угод" : "Appears after trades"}
          accent="positive"
        />

        <MetricCard
          label={t.overview.winRate}
          value="—"
          helper={isRu ? "Нужна история сделок" : isUa ? "Потрібна історія угод" : "Needs trade history"}
          accent="neutral"
        />

        <MetricCard
          label={t.overview.discipline}
          value="—"
          helper={isRu ? "Строится из журнала" : isUa ? "Будується з журналу" : "Built from journal"}
          accent="warning"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="se-dashboard-panel rounded-[2rem] p-6">
          <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">
            {copy.weeklyLabel}
          </div>

          <h3 className="mt-5 text-2xl font-black tracking-[-0.03em] text-white">
            {t.overview.weeklyAi}
          </h3>

          <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
            {t.overview.weeklyAiText}
          </p>
        </div>

        <div className="se-dashboard-card rounded-[2rem] p-6">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/38">
            {copy.qualityTitle}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              isRu ? "PnL динамика" : isUa ? "PnL динаміка" : "PnL dynamics",
              isRu ? "Лучшие сетапы" : isUa ? "Найкращі сетапи" : "Best setups",
              isRu ? "Главные ошибки" : isUa ? "Головні помилки" : "Main mistakes",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
              >
                <div className="text-sm font-black text-white">{item}</div>
                <div className="mt-2 text-xs font-semibold leading-5 text-white/45">
                  {isRu
                    ? "Появится после заполнения журнала."
                    : isUa
                      ? "Зʼявиться після заповнення журналу."
                      : "Appears after journal data is added."}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function getPremiumDashboardTabCopy(tab: TabId) {
  const copy: Record<string, {
    badge: string;
    title: string;
    text: string;
    points: string[];
  }> = {
    charts: {
      badge: "Chart command center",
      title: "Графики как рабочий терминал, а не просто виджет.",
      text:
        "Открой тикер, проверь контекст, таймфрейм, watchlist, movers и AI-разбор текущего графика в одном премиальном рабочем месте.",
      points: ["TradingView terminal", "Watchlist", "AI chart review"],
    },
    market: {
      badge: "Market intelligence desk",
      title: "Рынок, катализаторы и внимание трейдеров — в одном shortlist.",
      text:
        "Market Intelligence собирает движение, активность, social/news layer и готовит лучшие in-play кандидаты для AI Market Brief.",
      points: ["Market scan", "Social/news context", "AI shortlist"],
    },
    alerts: {
      badge: "AI Trading Desk",
      title: "Сигналы должны быть планом сделки, а не шумной кнопкой buy/sell.",
      text:
        "Каждый alert строится вокруг setup, trigger, entry zone, stop, targets, invalidation, risk note и последующего outcome review.",
      points: ["Setup", "Risk plan", "Outcome tracking"],
    },
    coach: {
      badge: "Desk coach",
      title: "AI-коуч говорит как трейдерский mentor, а не как обычный чат.",
      text:
        "Отправь сделку, мысль или проблему — SkillEdge AI вернёт краткий, дисциплинированный разбор по риску, контексту и исполнению.",
      points: ["Risk-first", "Execution review", "No fluff"],
    },
    learning: {
      badge: "Playbook academy",
      title: "Обучение должно превращаться в playbook, а не в набор случайных уроков.",
      text:
        "Learning Center связывает базу рынка, сетапы, риск, психологию и будущие стратегии в последовательную систему роста трейдера.",
      points: ["Market basics", "Setup library", "Progress tracking"],
    },
    reports: {
      badge: "Performance review",
      title: "Отчёты показывают не только PnL, а качество торгового процесса.",
      text:
        "Reports превращают журнал в review: динамика, ошибки, сильные сетапы, слабые места, profit factor и план улучшения.",
      points: ["PnL review", "Mistake map", "Process metrics"],
    },
    billing: {
      badge: "Access center",
      title: "Оплата и доступ должны ощущаться как premium SaaS, а не как временный MVP.",
      text:
        "Billing показывает тариф, лимиты, AI usage, crypto payment flow и готовит продукт к будущей оплате картами/Stripe.",
      points: ["Plan access", "AI usage", "Crypto flow"],
    },
    overview: {
      badge: "Trading cockpit",
      title: "Контроль процесса перед результатом.",
      text:
        "Overview показывает состояние торговой системы: PnL, дисциплина, повторяемость, качество решений и главный фокус на сегодня.",
      points: ["Process", "Discipline", "Review"],
    },
    journal: {
      badge: "Journal desk",
      title: "Журнал — это источник edge, а не просто таблица сделок.",
      text:
        "Каждая сделка, скриншот, эмоция и ошибка превращаются в данные для review, отчётов и будущих персональных сигналов.",
      points: ["Trade ticket", "Screenshots", "AI review"],
    },
  };

  return copy[tab] ?? copy.overview;
}

function PremiumDashboardTabHero({ tab }: { tab: TabId }) {
  const copy = getPremiumDashboardTabCopy(tab);

  return (
    <div className="se-dashboard-panel relative overflow-hidden rounded-[2.25rem] p-5 md:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,214,255,0.14),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(52,211,153,0.11),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.055),transparent_44%)]" />

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/70">
            {copy.badge}
          </div>

          <h2 className="mt-5 text-3xl font-black leading-[1.04] tracking-[-0.045em] text-white md:text-4xl">
            {copy.title}
          </h2>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-white/58">
            {copy.text}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
          {copy.points.map((point, index) => (
            <div
              key={point}
              className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.08] text-[10px] font-black text-cyan-50">
                0{index + 1}
              </div>

              <div className="mt-3 text-sm font-black text-white">{point}</div>
            </div>
          ))}
        </div>
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
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07111d]/82 p-3 backdrop-blur-xl md:items-center md:p-4">
    <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[rgba(198,226,255,0.16)] bg-[#0d1b2b]/95 shadow-[0_36px_140px_rgba(8,47,73,0.35)] md:rounded-[2.35rem]">
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
        <div className="se-dashboard-card rounded-3xl p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">
            {t.charts.chartAnalysisSymbol}
          </div>

          <div className="mt-2 text-lg font-semibold text-white">
            {formatChartSymbol(symbol)}
          </div>
        </div>

        <div className="se-dashboard-card rounded-3xl p-5">
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
          className="se-dashboard-button-primary rounded-full px-6 py-3 text-sm font-black transition hover:-translate-y-0.5"
        >
          {t.charts.chartAnalysisClose}
        </button>
      </div>
    </div>
  </div>
)}
      

      <PremiumDashboardTabHero tab="charts" />

      <div className="se-dashboard-panel mt-6 rounded-[2.25rem] p-5">
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
        className="h-12 w-full rounded-2xl border border-white/10 bg-[#071321]/80 px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/45 focus:bg-[#0d1b2b]"
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
  <div className="h-[760px] overflow-hidden rounded-3xl border border-[rgba(198,226,255,0.14)] bg-[#071321]">
    <TradingViewChart symbol={symbol} interval={interval} />
  </div>

  {watchlistOpen && (
    <div className="flex h-[760px] flex-col se-dashboard-card rounded-3xl p-4">
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
            market === "stocks"
              ? t.charts.moversStocksNeedKey
              : err instanceof Error
                ? err.message
                : t.charts.moversLoading
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
    <div className="se-dashboard-card-soft mt-6 rounded-3xl p-5">
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
  _side: ChartsMoverSide
): Promise<ChartsMoverItem[]> {
  throw new Error("Stock movers are routed through the premium market data layer.");
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
    const cleanSymbol = formatChartSymbol(symbol);

    return {
      name: cleanSymbol,
      volume24h: null,
      change24h: null,
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
    <div className="space-y-6">
      <PremiumDashboardTabHero tab="learning" />
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
        <div className="se-dashboard-card rounded-[2rem] p-6">
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
  const signalLinkedTrades = filteredTrades.filter((trade) =>
  Boolean(trade.source_alert_id)
);

const signalPnlValues = signalLinkedTrades
  .map((trade) => trade.pnl)
  .filter((pnl): pnl is number => pnl !== null);

const signalTotalPnl = signalPnlValues.reduce((sum, pnl) => sum + pnl, 0);

const signalClosedTrades = signalLinkedTrades.filter(
  (trade) => trade.result === "win" || trade.result === "loss"
);

const signalWins = signalLinkedTrades.filter(
  (trade) => trade.result === "win"
).length;

const signalWinRate =
  signalClosedTrades.length > 0
    ? Math.round((signalWins / signalClosedTrades.length) * 100)
    : null;

const signalAveragePnl =
  signalPnlValues.length > 0 ? signalTotalPnl / signalPnlValues.length : null;

const signalLongTrades = signalLinkedTrades.filter(
  (trade) => trade.direction === "long"
);

const signalShortTrades = signalLinkedTrades.filter(
  (trade) => trade.direction === "short"
);

const signalLongPnl = signalLongTrades.reduce(
  (sum, trade) => sum + (trade.pnl ?? 0),
  0
);

const signalShortPnl = signalShortTrades.reduce(
  (sum, trade) => sum + (trade.pnl ?? 0),
  0
);

const signalSetupStats = Object.entries(
  signalLinkedTrades.reduce<Record<string, { count: number; pnl: number }>>(
    (acc, trade) => {
      const key =
        trade.source_setup_name ||
        trade.source_setup_slug ||
        trade.setup ||
        "AI Signal";

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
  .sort((a, b) => b[1].pnl - a[1].pnl)
  .slice(0, 5);

const signalBestSetup = signalSetupStats[0] || null;

const signalWorstSetup =
  signalSetupStats.length > 0
    ? [...signalSetupStats].sort((a, b) => a[1].pnl - b[1].pnl)[0]
    : null;

const signalAdoptionRate =
  filteredTrades.length > 0
    ? Math.round((signalLinkedTrades.length / filteredTrades.length) * 100)
    : null;
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

const response = await authFetch("/api/reports/ai-report", {
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
    <div className="space-y-6">
      <PremiumDashboardTabHero tab="reports" />
      <SectionHeader title={t.reports.title} text={t.reports.text} />
      <div className="mt-6 se-dashboard-card rounded-[2rem] p-5">
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
              className="w-full rounded-2xl border border-white/10 bg-[#071321]/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/45 focus:bg-[#0d1b2b]"
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
              className="w-full rounded-2xl border border-white/10 bg-[#071321]/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/45 focus:bg-[#0d1b2b]"
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
              className="w-full rounded-2xl border border-white/10 bg-[#071321]/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/45 focus:bg-[#0d1b2b]"
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
              className="w-full rounded-2xl border border-white/10 bg-[#071321]/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/45 focus:bg-[#0d1b2b]"
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
      <div className="mt-6 se-dashboard-panel rounded-[2rem] p-6">
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
            <div className="se-dashboard-card rounded-[2rem] p-6">
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

<div className="mt-6 rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-emerald-100/45">
        SkillEdge AI Signal-to-Trade
      </div>

      <h3 className="mt-2 text-2xl font-semibold text-white">
        Personal Alert Performance
      </h3>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
        Shows how you personally execute SkillEdge AI alerts: adoption, PnL,
        win rate, best setups, weak setups and long/short signal performance.
      </p>
    </div>

    <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100">
      {signalLinkedTrades.length} linked trades
    </div>
  </div>

  {signalLinkedTrades.length === 0 ? (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
      No signal-linked trades yet. Create a trade draft from an AI Alert and save
      the trade to unlock personal signal analytics.
    </div>
  ) : (
    <>
      <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Linked
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalLinkedTrades.length}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Adoption
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalAdoptionRate === null ? "—" : `${signalAdoptionRate}%`}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/45">
            Signal PnL
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            ${signalTotalPnl.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
            Win rate
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalWinRate === null ? "—" : `${signalWinRate}%`}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Avg PnL
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalAveragePnl === null
              ? "—"
              : `$${signalAveragePnl.toFixed(2)}`}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Long signals
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalLongTrades.length}
          </div>
          <div className="mt-1 text-xs text-white/45">
            ${signalLongPnl.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Short signals
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalShortTrades.length}
          </div>
          <div className="mt-1 text-xs text-white/45">
            ${signalShortPnl.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.045] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-violet-100/45">
            Best setup
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-white">
            {signalBestSetup ? signalBestSetup[0] : "—"}
          </div>
          <div className="mt-1 text-xs text-white/45">
            {signalBestSetup
              ? `${signalBestSetup[1].count} / $${signalBestSetup[1].pnl.toFixed(
                  2
                )}`
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">
            Best AI setups by PnL
          </div>

          <div className="mt-4 grid gap-2">
            {signalSetupStats.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/45">
                No setup data yet.
              </div>
            ) : (
              signalSetupStats.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="min-w-0 truncate text-sm text-white/70">
                    {label}
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-white">
                    {value.count} / ${value.pnl.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">
            Execution insight
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/60">
            {signalWinRate !== null && signalWinRate >= 60
              ? "You are currently executing AI-linked trades with a strong win rate. SkillEdge AI should keep tracking these setups as potential personal strengths."
              : signalLinkedTrades.length >= 3
                ? "Your signal-linked execution needs review. Compare entries, stops and targets in the Journal to see whether the issue is signal quality or execution discipline."
                : "Add more signal-linked trades to build a reliable personal signal profile."}
          </div>

          <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-sm leading-6 text-amber-50/75">
            Worst setup:{" "}
            {signalWorstSetup
              ? `${signalWorstSetup[0]} · ${signalWorstSetup[1].count} / $${signalWorstSetup[1].pnl.toFixed(
                  2
                )}`
              : "—"}
          </div>
        </div>
      </div>
    </>
  )}
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
    <div className="se-dashboard-card rounded-[2rem] p-6">
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
  label: t.billing.aiAlertsAccess,
  enabled: canUseFeature(activePlan, "ai_alerts"),
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
    <div className="space-y-6">
      <PremiumDashboardTabHero tab="billing" />
      <SectionHeader title={t.billing.title} text={t.billing.text} />

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="se-dashboard-panel rounded-[2rem] p-6">
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

        <div className="se-dashboard-card rounded-[2rem] p-6">
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
      
      <div className="mt-6 se-dashboard-card rounded-[2rem] p-6">
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
    <div className="space-y-6">
      <PremiumDashboardTabHero tab="coach" />
      <SectionHeader title={t.coach.title} text={t.coach.text} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="se-dashboard-card rounded-3xl p-6">
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
  <div className="se-dashboard-card rounded-3xl p-6">
    <div className="text-xs uppercase tracking-[0.25em] text-white/35">
  {t.coach.answerTitle}
</div>

    <div className="mt-5 min-h-[260px] whitespace-pre-wrap rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/75">
        {answer || t.coach.answerPlaceholder}
    </div>
  </div>

  <div className="se-dashboard-card rounded-3xl p-6">
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

function MetricCard({
  label,
  value,
  helper,
  accent = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: "positive" | "negative" | "warning" | "neutral";
}) {
  const accentClass =
    accent === "positive"
      ? "from-emerald-300/16 to-cyan-300/8 text-emerald-200"
      : accent === "negative"
        ? "from-rose-300/14 to-white/0 text-rose-200"
        : accent === "warning"
          ? "from-amber-300/14 to-white/0 text-amber-100"
          : "from-cyan-300/12 to-white/0 text-white";

  return (
    <div className="group relative overflow-hidden rounded-[1.75rem] border border-[rgba(198,226,255,0.14)] bg-white/[0.045] p-5 shadow-[0_18px_70px_rgba(8,47,73,0.14)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/28 hover:bg-white/[0.065]">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-70`} />

      <div className="relative">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/38">
          {label}
        </p>

        <p className={`mt-4 text-4xl font-black tracking-[-0.05em] ${accentClass}`}>
          {value}
        </p>

        {helper ? (
          <p className="mt-2 text-xs font-semibold leading-5 text-white/42">
            {helper}
          </p>
        ) : null}
      </div>
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







