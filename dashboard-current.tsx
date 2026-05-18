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
      text: "Describe a trade, emotion, mistake or market situation вЂ” the AI coach will analyze discipline, risk and decision quality.",
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
    terminal: "РўРµСЂРјРёРЅР°Р» SkillEdge AI",
    dashboard: "Р›РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚",
    user: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ",
    choosePlan: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
    logout: "Р’С‹Р№С‚Рё",
    currentPlan: "РўРµРєСѓС‰РёР№ С‚Р°СЂРёС„",
    loading: "Р—Р°РіСЂСѓР·РєР°...",
    notActivated: "РќРµ Р°РєС‚РёРІРёСЂРѕРІР°РЅ",
    activatePlan: "РђРєС‚РёРІРёСЂСѓР№С‚Рµ С‚Р°СЂРёС„, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ С„СѓРЅРєС†РёРё РєР°Р±РёРЅРµС‚Р°.",
    aiUsage: "РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ AI",
    quickActions: "Р‘С‹СЃС‚СЂС‹Рµ РґРµР№СЃС‚РІРёСЏ",
    addTrade: "Р”РѕР±Р°РІРёС‚СЊ СЃРґРµР»РєСѓ",
    uploadScreenshot: "Р—Р°РіСЂСѓР·РёС‚СЊ СЃРєСЂРёРЅС€РѕС‚",
    askAI: "РЎРїСЂРѕСЃРёС‚СЊ AI-РєРѕСѓС‡Р°",
    createReport: "РЎРѕР·РґР°С‚СЊ РѕС‚С‡С‘С‚",
    overview: {
      title: "РћР±Р·РѕСЂ СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚Рё",
      text: "РЎРІРѕРґРєР° PnL, РїСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє, РѕС†РµРЅРєР° РґРёСЃС†РёРїР»РёРЅС‹, Р»СѓС‡С€РёРµ СЃРµС‚Р°РїС‹ Рё РіР»Р°РІРЅС‹Рµ РѕС€РёР±РєРё.",
      pnlMonth: "PnL Р·Р° РјРµСЃСЏС†",
      winRate: "РџСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С…",
      discipline: "РћС†РµРЅРєР° РґРёСЃС†РёРїР»РёРЅС‹",
      weeklyAi: "AI-СЃРІРѕРґРєР° РЅРµРґРµР»Рё",
      weeklyAiText:
        "AI-СЃРІРѕРґРєР° СЃРѕР±РёСЂР°РµС‚ РєР»СЋС‡РµРІС‹Рµ РІС‹РІРѕРґС‹ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СЃРґРµР»РѕРє, СЂРёСЃРєСѓ, РґРёСЃС†РёРїР»РёРЅРµ Рё РїРѕРІС‚РѕСЂСЏСЋС‰РёРјСЃСЏ РѕС€РёР±РєР°Рј.",
    },
    charts: {
      title: "Р“СЂР°С„РёРєРё TradingView",
      text: "Р’СЃС‚СЂРѕРµРЅРЅС‹Р№ РіСЂР°С„РёРє TradingView РґР»СЏ Р°РЅР°Р»РёР·Р° С‚РёРєРµСЂРѕРІ, СѓСЂРѕРІРЅРµР№ Рё СЃРµС‚Р°РїРѕРІ.",
      placeholder: "Р Р°Р±РѕС‡РµРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ TradingView РґРѕСЃС‚СѓРїРЅРѕ РІРЅСѓС‚СЂРё РјРѕРґСѓР»СЏ РіСЂР°С„РёРєРѕРІ.",
      analyzeCurrentChart: "РџСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ РіСЂР°С„РёРє",
      workspaceText: "Р Р°Р±РѕС‡Р°СЏ Р·РѕРЅР° СЃ РіСЂР°С„РёРєРѕРј, СЃРїРёСЃРєРѕРј РЅР°Р±Р»СЋРґРµРЅРёСЏ Рё Р»РёРґРµСЂР°РјРё РґРІРёР¶РµРЅРёСЏ СЂС‹РЅРєР°.",
      watchlistExamples: "РџСЂРёРјРµСЂС‹ СЃРїРёСЃРєР° РЅР°Р±Р»СЋРґРµРЅРёСЏ: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      openWatchlist: "РћС‚РєСЂС‹С‚СЊ СЃРїРёСЃРѕРє",
      hideWatchlist: "РЎРєСЂС‹С‚СЊ СЃРїРёСЃРѕРє",
      watchlistTitle: "РЎРїРёСЃРѕРє РЅР°Р±Р»СЋРґРµРЅРёСЏ",
      watchlistSubtitle: "РўРёРєРµСЂ / 24h % / РѕР±СЉС‘Рј",
      addTickerButton: "Р”РѕР±Р°РІРёС‚СЊ",
      addTickerPlaceholder: "AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      addTickerHint: "РџСЂРёРјРµСЂ: AA.NY = NYSE, TSLA.NQ = NASDAQ, SPY.AM = AMEX, BTCUSDT = Binance.",
      sortSymbol: "РўРёРєРµСЂ",
      sortChange: "% 24h",
      sortVolume: "РћР±СЉС‘Рј",
      symbolColumn: "РўРёРєРµСЂ",
      percentColumn: "%",
      volumeColumn: "РћР±СЉС‘Рј",
      loadingWatchlist: "Р—Р°РіСЂСѓР¶Р°РµРј СЃРїРёСЃРѕРє РЅР°Р±Р»СЋРґРµРЅРёСЏ...",
      emptyWatchlist: "РЎРїРёСЃРѕРє РїСѓСЃС‚. РќР°Р¶РјРё + Рё РґРѕР±Р°РІСЊ С‚РёРєРµСЂ.",
      removeFromWatchlist: "РЈРґР°Р»РёС‚СЊ РёР· СЃРїРёСЃРєР°",
      loginFirst: "РЎРЅР°С‡Р°Р»Р° РІРѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚.",
      settingsLoadError: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё РіСЂР°С„РёРєРѕРІ.",
      addTickerError: "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ С‚РёРєРµСЂ РІ СЃРїРёСЃРѕРє РЅР°Р±Р»СЋРґРµРЅРёСЏ.",
      removeTickerError: "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С‚РёРєРµСЂ РёР· СЃРїРёСЃРєР° РЅР°Р±Р»СЋРґРµРЅРёСЏ.",
      moversStocks: "РђРєС†РёРё",
      moversCrypto: "РљСЂРёРїС‚Рѕ",
      moversGainers: "Р›РёРґРµСЂС‹ СЂРѕСЃС‚Р°",
      moversLosers: "Р›РёРґРµСЂС‹ РїР°РґРµРЅРёСЏ",
      moversCollapse: "РЎРІРµСЂРЅСѓС‚СЊ",
      moversExpand: "Р Р°Р·РІРµСЂРЅСѓС‚СЊ",
      moversName: "РќР°Р·РІР°РЅРёРµ",
      moversPercentChange: "% РёР·РјРµРЅРµРЅРёСЏ",
      moversLoading: "Р—Р°РіСЂСѓР¶Р°РµРј Р»РёРґРµСЂРѕРІ РґРІРёР¶РµРЅРёСЏ...",
      moversEmpty: "РќРµС‚ РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ РїРѕРґ СЌС‚РѕС‚ С„РёР»СЊС‚СЂ.",
      moversStocksNeedKey:
        "Р›РёРґРµСЂС‹ РґРІРёР¶РµРЅРёСЏ РїРѕ Р°РєС†РёСЏРј РіРѕС‚РѕРІСЏС‚СЃСЏ Рє РїРѕРґРєР»СЋС‡РµРЅРёСЋ РїСЂРµРјРёР°Р»СЊРЅРѕРіРѕ РїРѕРєСЂС‹С‚РёСЏ СЂС‹РЅРѕС‡РЅС‹С… РґР°РЅРЅС‹С….",
      chartAnalysisTitle: "AI-Р°РЅР°Р»РёР· РіСЂР°С„РёРєР°",
      chartAnalysisText:
        "SkillEdge AI Р°РЅР°Р»РёР·РёСЂСѓРµС‚ С‚РµРєСѓС‰РёР№ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј, СЂС‹РЅРѕС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ, СЃРІРµС‡Рё, РѕР±СЉС‘Рј Рё РєРѕРЅС‚РµРєСЃС‚ СЂРёСЃРєР°.",
      chartAnalysisLoading: "РђРЅР°Р»РёР·РёСЂСѓРµРј С‚РµРєСѓС‰РёР№ РіСЂР°С„РёРє...",
      chartAnalysisError: "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ С‚РµРєСѓС‰РёР№ РіСЂР°С„РёРє.",
      chartAnalysisEmpty: "Р—Р°РїСѓСЃС‚Рё AI-Р°РЅР°Р»РёР·, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ СЂР°Р·Р±РѕСЂ С‚РµРєСѓС‰РµРіРѕ РіСЂР°С„РёРєР°.",
      chartAnalysisClose: "Р—Р°РєСЂС‹С‚СЊ",
      chartAnalysisSymbol: "РўРёРєРµСЂ",
      chartAnalysisInterval: "РўР°Р№РјС„СЂРµР№Рј",
      chartAnalysisReportLabel: "РћС‚С‡С‘С‚ SkillEdge AI",
      chartAnalysisDataLabel: "Р Р°Р·Р±РѕСЂ СЂС‹РЅРѕС‡РЅРѕР№ СЃС‚СЂСѓРєС‚СѓСЂС‹",
      chartAnalysisSectionsLabel: "Р Р°Р·РґРµР»С‹ Р°РЅР°Р»РёР·Р°",
      marketDataUnavailableTitle: "Р С‹РЅРѕС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ РЅРµРґРѕСЃС‚СѓРїРЅС‹",
      marketDataUnavailableText:
        "SkillEdge AI РЅРµ СЃРјРѕРі Р·Р°РіСЂСѓР·РёС‚СЊ СЂС‹РЅРѕС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ РїРѕ СЌС‚РѕРјСѓ С‚РёРєРµСЂСѓ РЅР° С‚РµРєСѓС‰РµРј С‚Р°СЂРёС„Рµ РґР°РЅРЅС‹С…. РџРѕРїСЂРѕР±СѓР№ Р±РѕР»РµРµ Р»РёРєРІРёРґРЅС‹Р№ С‚РёРєРµСЂ: AAPL, TSLA, NVDA, SPY РёР»Рё QQQ.",
      marketDataPremiumTitle: "РќСѓР¶РµРЅ РїСЂРµРјРёСѓРј-РґРѕСЃС‚СѓРї Рє СЂС‹РЅРѕС‡РЅС‹Рј РґР°РЅРЅС‹Рј",
      marketDataPremiumText:
  "Р­С‚РѕС‚ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј РёР»Рё РёСЃС‚РѕС‡РЅРёРє РґР°РЅРЅС‹С… РјРѕР¶РµС‚ С‚СЂРµР±РѕРІР°С‚СЊ Р±РѕР»РµРµ РІС‹СЃРѕРєРёР№ С‚Р°СЂРёС„ СЂС‹РЅРѕС‡РЅС‹С… РґР°РЅРЅС‹С…. SkillEdge AI РёСЃРїРѕР»СЊР·СѓРµС‚ РїСЂРµРјРёР°Р»СЊРЅРѕРµ СЂС‹РЅРѕС‡РЅРѕРµ РїРѕРєСЂС‹С‚РёРµ С‚Р°Рј, РіРґРµ РѕРЅРѕ РґРѕСЃС‚СѓРїРЅРѕ.",
      marketDataGenericErrorTitle: "РђРЅР°Р»РёР· РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ",
      marketDataGenericErrorText:
        "РЎРµР№С‡Р°СЃ РЅРµ СѓРґР°Р»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ Р°РЅР°Р»РёР· РіСЂР°С„РёРєР°. РџРѕРїСЂРѕР±СѓР№ РґСЂСѓРіРѕР№ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј РёР»Рё Р·Р°РїСѓСЃС‚Рё Р°РЅР°Р»РёР· РµС‰С‘ СЂР°Р·.",
      chartControlTickerLabel: "РўРёРєРµСЂ",
      chartControlTickerPlaceholder: "AAPL / TSLA.NQ / AA.NY / BTCUSDT",
      chartControlIntervalLabel: "РўР°Р№РјС„СЂРµР№Рј",
      chartControlOpenChart: "РћС‚РєСЂС‹С‚СЊ РіСЂР°С„РёРє",
      chartControlHint:
        "РСЃРїРѕР»СЊР·СѓР№ СЌС‚Сѓ РїР°РЅРµР»СЊ РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ TradingView Рё AI-Р°РЅР°Р»РёР·РѕРј. РР·РјРµРЅРµРЅРёСЏ РІРЅСѓС‚СЂРё СЃР°РјРѕРіРѕ TradingView РјРѕРіСѓС‚ РЅРµ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊСЃСЏ РѕР±СЂР°С‚РЅРѕ РІ SkillEdge AI.",
    },
    learning: {
      title: "Р¦РµРЅС‚СЂ РѕР±СѓС‡РµРЅРёСЏ",
      text: "РЎС‚СЂСѓРєС‚СѓСЂРЅРѕРµ РѕР±СѓС‡РµРЅРёРµ С‚СЂРµР№РґРёРЅРіСѓ, СЃРµС‚Р°РїС‹, СЂРёСЃРє-РјРµРЅРµРґР¶РјРµРЅС‚, РїСЃРёС…РѕР»РѕРіРёСЏ Рё РїРѕСЃС‚СЂРѕРµРЅРёРµ С‚РѕСЂРіРѕРІРѕРіРѕ РїР»РµР№Р±СѓРєР°.",
      learningNoteTitle: "Р¦РµРЅС‚СЂ РѕР±СѓС‡РµРЅРёСЏ СЂР°Р±РѕС‚Р°РµС‚ РєР°Рє Р±Р°Р·Р° РїРѕРІС‚РѕСЂРµРЅРёСЏ",
      learningNoteText:
        "SkillEdge AI РІ РїРµСЂРІСѓСЋ РѕС‡РµСЂРµРґСЊ СЃС„РѕРєСѓСЃРёСЂРѕРІР°РЅ РЅР° Р¶СѓСЂРЅР°Р»Рµ СЃРґРµР»РѕРє, Р°РЅР°Р»РёР·Рµ РіСЂР°С„РёРєРѕРІ, AI-СЂР°Р·Р±РѕСЂРµ Рё СЂР°Р·РІРёС‚РёРё С‚РѕСЂРіРѕРІРѕР№ СЃРёСЃС‚РµРјС‹. Р­С‚РѕС‚ СЂР°Р·РґРµР» СЃРѕР·РґР°РЅ РєР°Рє РєРѕСЂРѕС‚РєР°СЏ Р±Р°Р·Р° РґР»СЏ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РєР»СЋС‡РµРІС‹С… РїРѕРЅСЏС‚РёР№, С‡С‚РѕР±С‹ РєР»РёРµРЅС‚ Р±С‹СЃС‚СЂРµРµ РїРѕРЅРёРјР°Р» СЂРёСЃРє, СЃРµС‚Р°РїС‹, СЃС‚СЂСѓРєС‚СѓСЂСѓ СЂС‹РЅРєР° Рё Р»РѕРіРёРєСѓ AI-Р°РЅР°Р»РёР·Р°.",
      overviewLabel: "РћР±Р·РѕСЂ РѕР±СѓС‡РµРЅРёСЏ",
      modulesLabel: "РњРѕРґСѓР»Рё",
      lessonsLabel: "СѓСЂРѕРєРѕРІ",
      progressLabel: "РџСЂРѕРіСЂРµСЃСЃ",
      totalProgressLabel: "РћР±С‰РёР№ РїСЂРѕРіСЂРµСЃСЃ",
      startButton: "РќР°С‡Р°С‚СЊ",
      continueButton: "РџСЂРѕРґРѕР»Р¶РёС‚СЊ",
      reviewButton: "РџРѕРІС‚РѕСЂРёС‚СЊ",
      notStartedStatus: "РќРµ РЅР°С‡Р°С‚Рѕ",
      inProgressStatus: "Р’ РїСЂРѕС†РµСЃСЃРµ",
      completedStatus: "РџСЂРѕР№РґРµРЅРѕ",
      lockedLabel: "РЎРєРѕСЂРѕ",
      estimatedTimeLabel: "Р’СЂРµРјСЏ",
      levelLabel: "РЈСЂРѕРІРµРЅСЊ",
      beginnerLevel: "РќР°С‡Р°Р»СЊРЅС‹Р№",
      intermediateLevel: "РЎСЂРµРґРЅРёР№",
      advancedLevel: "РџСЂРѕРґРІРёРЅСѓС‚С‹Р№",
      moduleOneTitle: "РћСЃРЅРѕРІС‹ СЂС‹РЅРєР°",
      moduleOneText:
        "Р Р°Р·Р±РµСЂРёСЃСЊ, РєР°Рє СЂР°Р±РѕС‚Р°РµС‚ СЂС‹РЅРѕРє, РєР°Рє РІР·Р°РёРјРѕРґРµР№СЃС‚РІСѓСЋС‚ РѕСЂРґРµСЂР° Рё РїРѕС‡РµРјСѓ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ СЂРµС€Р°РµС‚.",
      moduleTwoTitle: "РўРµС…РЅРёС‡РµСЃРєРёР№ Р°РЅР°Р»РёР·",
      moduleTwoText:
        "РЎРІРµС‡Рё, СѓСЂРѕРІРЅРё, С‚СЂРµРЅРґ/СЂРµРЅР¶, РѕР±СЉС‘Рј Рё С‡РёСЃС‚РѕРµ С‡С‚РµРЅРёРµ РіСЂР°С„РёРєР° Р±РµР· Р»РёС€РЅРµРіРѕ С€СѓРјР°.",
      moduleThreeTitle: "Р РёСЃРє-РјРµРЅРµРґР¶РјРµРЅС‚",
      moduleThreeText:
        "РџСЂР°РІРёР»Р° СЂРёСЃРєР° РЅР° СЃРґРµР»РєСѓ, СЃС‚РѕРї-Р»РѕСЃСЃ, СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё Рё СЃРѕРѕС‚РЅРѕС€РµРЅРёРµ СЂРёСЃРє/РїСЂРёР±С‹Р»СЊ.",
      moduleFourTitle: "Р’РЅСѓС‚СЂРёРґРЅРµРІРЅРѕР№ РёРјРїСѓР»СЊСЃ",
      moduleFourText:
        "Р›РѕРіРёРєР° РёРјРїСѓР»СЊСЃР°, РїСЂРѕР±РѕР№, РІРѕР·РІСЂР°С‚ СѓСЂРѕРІРЅСЏ, Р»РѕР¶РЅС‹Р№ РїСЂРѕР±РѕР№ Рё СЃРµС‚Р°РїС‹ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ РґРІРёР¶РµРЅРёСЏ.",
      moduleFiveTitle: "РџСЃРёС…РѕР»РѕРіРёСЏ С‚СЂРµР№РґРёРЅРіР°",
      moduleFiveText:
        "РљРѕРЅС‚СЂРѕР»СЊ РїРµСЂРµС‚РѕСЂРіРѕРІРєРё, С‚РѕСЂРіРѕРІР»Рё РёР· РјРµСЃС‚Рё, СЃС‚СЂР°С…Р°, СЃРѕРјРЅРµРЅРёР№ Рё РёРјРїСѓР»СЊСЃРёРІРЅС‹С… РІС…РѕРґРѕРІ.",
      moduleSixTitle: "РџР»РµР№Р±СѓРє / РЎРµС‚Р°РїС‹",
      moduleSixText:
        "РџСЂРµРІСЂР°С‰Р°Р№ РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РїР°С‚С‚РµСЂРЅС‹ РІ С‚РѕСЂРіРѕРІС‹Р№ РїР»РµР№Р±СѓРє СЃ С‚СЂРёРіРіРµСЂР°РјРё РІС…РѕРґР° Рё СѓСЃР»РѕРІРёСЏРјРё РѕС‚РјРµРЅС‹ РёРґРµРё.",
      lessonMarketStructure: "РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ СЂС‹РЅРѕРє",
      lessonOrderTypes: "РўРёРїС‹ РѕСЂРґРµСЂРѕРІ",
      lessonBidAskSpread: "Bid / Ask / РЎРїСЂРµРґ",
      lessonLiquidity: "Р›РёРєРІРёРґРЅРѕСЃС‚СЊ",
      lessonCandles: "РЎРІРµС‡Рё",
      lessonLevels: "РџРѕРґРґРµСЂР¶РєР° Рё СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ",
      lessonTrendRange: "РўСЂРµРЅРґ РёР»Рё СЂРµРЅР¶",
      lessonVolume: "РђРЅР°Р»РёР· РѕР±СЉС‘РјР°",
      lessonRiskPerTrade: "Р РёСЃРє РЅР° СЃРґРµР»РєСѓ",
      lessonStopLoss: "РЎС‚РѕРї-Р»РѕСЃСЃ",
      lessonRiskReward: "Р РёСЃРє / РџРѕС‚РµРЅС†РёР°Р»",
      lessonPositionSizing: "Р Р°Р·РјРµСЂ РїРѕР·РёС†РёРё",
      lessonMomentumLogic: "Р›РѕРіРёРєР° РёРјРїСѓР»СЊСЃР°",
      lessonBreakoutReclaim: "РџСЂРѕР±РѕР№ / РІРѕР·РІСЂР°С‚ СѓСЂРѕРІРЅСЏ",
      lessonFailedBreakout: "Р›РѕР¶РЅС‹Р№ РїСЂРѕР±РѕР№",
      lessonContinuation: "РџСЂРѕРґРѕР»Р¶РµРЅРёРµ РґРІРёР¶РµРЅРёСЏ",
      lessonDiscipline: "Р”РёСЃС†РёРїР»РёРЅР°",
      lessonOvertrading: "РџРµСЂРµС‚РѕСЂРіРѕРІРєР°",
      lessonRevengeTrading: "РўРѕСЂРіРѕРІР»СЏ РёР· РјРµСЃС‚Рё",
      lessonPatience: "РўРµСЂРїРµРЅРёРµ",
      lessonSetupChecklist: "Р§РµРєР»РёСЃС‚ СЃРµС‚Р°РїР°",
      lessonEntryTrigger: "РўСЂРёРіРіРµСЂ РІС…РѕРґР°",
      lessonInvalidation: "РћС‚РјРµРЅР° РёРґРµРё",
      lessonReviewProcess: "РџСЂРѕС†РµСЃСЃ СЂР°Р·Р±РѕСЂР°",
      advancedTracksLabel: "Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ РЅР°РїСЂР°РІР»РµРЅРёСЏ",
      advancedTracksText:
        "Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ СЃРїРµС†РёР°Р»РёР·РёСЂРѕРІР°РЅРЅС‹Рµ РЅР°РїСЂР°РІР»РµРЅРёСЏ РѕР±СѓС‡РµРЅРёСЏ РґР»СЏ СѓРіР»СѓР±Р»РµРЅРёСЏ С‚РѕСЂРіРѕРІРѕР№ СЃРёСЃС‚РµРјС‹ РІРЅСѓС‚СЂРё SkillEdge AI.",
      comingSoonButton: "РЎРєРѕСЂРѕ",
      activeModuleLabel: "РђРєС‚РёРІРЅС‹Р№ РјРѕРґСѓР»СЊ",
      openLessonButton: "РћС‚РєСЂС‹С‚СЊ СѓСЂРѕРє",
      selectedModuleHint:
        "Р’С‹Р±РµСЂРё РјРѕРґСѓР»СЊ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ СѓСЂРѕРєРё, РїСЂРѕРіСЂРµСЃСЃ Рё СЃР»РµРґСѓСЋС‰РёР№ С€Р°Рі РѕР±СѓС‡РµРЅРёСЏ.",
      nextLessonLabel: "РЎР»РµРґСѓСЋС‰РёР№ СѓСЂРѕРє",
      moduleDetailsLabel: "Р”РµС‚Р°Р»Рё РјРѕРґСѓР»СЏ",
      lessonViewerLabel: "РџСЂРѕСЃРјРѕС‚СЂ СѓСЂРѕРєР°",
      lessonContentLabel: "РЎРѕРґРµСЂР¶Р°РЅРёРµ СѓСЂРѕРєР°",
      lessonCloseButton: "Р—Р°РєСЂС‹С‚СЊ СѓСЂРѕРє",
      lessonStartText:
        "Р­С‚РѕС‚ СѓСЂРѕРє РѕС„РѕСЂРјР»РµРЅ РєР°Рє РєРѕСЂРѕС‚РєРёР№ РїСЂР°РєС‚РёС‡РµСЃРєРёР№ Р±Р»РѕРє SkillEdge AI. РР·СѓС‡Рё РєР»СЋС‡РµРІС‹Рµ РёРґРµРё, РІС‹РїРѕР»РЅРё Р·Р°РґР°РЅРёРµ Рё СЃРІСЏР¶Рё РєРѕРЅС†РµРїС†РёСЋ СЃРѕ СЃРІРѕРёРјРё СЃРґРµР»РєР°РјРё.",
      lessonKeyPointsLabel: "РљР»СЋС‡РµРІС‹Рµ РёРґРµРё",
      lessonPracticeLabel: "РџСЂР°РєС‚РёС‡РµСЃРєРѕРµ Р·Р°РґР°РЅРёРµ",
      lessonPracticeText:
        "Р Р°Р·Р±РµСЂРё РєРѕРЅС†РµРїС†РёСЋ, РЅР°Р№РґРё РѕРґРёРЅ РїСЂРёРјРµСЂ РЅР° РіСЂР°С„РёРєРµ Рё Р·Р°РїРёС€Рё, С‡С‚Рѕ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ РёР»Рё Р»РѕРјР°РµС‚ РёРґРµСЋ.",
      markLessonCompletedButton: "РћС‚РјРµС‚РёС‚СЊ СѓСЂРѕРє РїСЂРѕР№РґРµРЅРЅС‹Рј",
      lessonCompletedButton: "РЈСЂРѕРє РїСЂРѕР№РґРµРЅ",
      frontendProgressNote:
        "РџСЂРѕРіСЂРµСЃСЃ СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РІ Р°РєРєР°СѓРЅС‚Рµ SkillEdge AI Рё РѕСЃС‚Р°РЅРµС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРµР·Р°РіСЂСѓР·РєРё.",
      learningProgressLoading: "Р—Р°РіСЂСѓР¶Р°РµРј РїСЂРѕРіСЂРµСЃСЃ РѕР±СѓС‡РµРЅРёСЏ...",
      learningProgressSaving: "РЎРѕС…СЂР°РЅСЏРµРј РїСЂРѕРіСЂРµСЃСЃ...",
      learningProgressSaved: "РџСЂРѕРіСЂРµСЃСЃ СЃРѕС…СЂР°РЅС‘РЅ",
      lessonAutoAdvanced:
        "РЈСЂРѕРє СЃРѕС…СЂР°РЅС‘РЅ. РЎР»РµРґСѓСЋС‰РёР№ СѓСЂРѕРє РѕС‚РєСЂС‹С‚ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.",
      moduleCompletedMessage: "РњРѕРґСѓР»СЊ Р·Р°РІРµСЂС€С‘РЅ. РћС‚Р»РёС‡РЅР°СЏ СЂР°Р±РѕС‚Р°.",
      learningProgressError: "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РїСЂРѕРіСЂРµСЃСЃ РѕР±СѓС‡РµРЅРёСЏ.",
      extraModuleOneTitle: "Smart Money Concepts Рё СЂР°Р±РѕС‡РёРµ СЃРµС‚Р°РїС‹",
      extraModuleOneText:
        "РЎС‚СЂСѓРєС‚СѓСЂР° СЂС‹РЅРєР°, Р»РёРєРІРёРґРЅРѕСЃС‚СЊ, РїСЂРѕРІРѕРєР°С†РёРё, РёРјРїСѓР»СЊСЃРЅРѕРµ СЃРјРµС‰РµРЅРёРµ, РѕСЂРґРµСЂ-Р±Р»РѕРєРё Рё РїСЂР°РєС‚РёС‡РµСЃРєР°СЏ Р»РѕРіРёРєР° СЂР°Р±РѕС‡РёС… СЃРµС‚Р°РїРѕРІ.",
      extraModuleTwoTitle: "РЎРєР°Р»СЊРїРёРЅРі СЃС‚Р°РєР°РЅР° РІ CScalp",
      extraModuleTwoText:
        "РћР±СѓС‡РµРЅРёРµ РїР»Р°С‚С„РѕСЂРјРµ, Р±Р°Р·РѕРІР°СЏ СЂР°Р±РѕС‚Р° СЃ РїРѕС‚РѕРєРѕРј РѕСЂРґРµСЂРѕРІ, РїСЂРѕР±РѕР№ СѓСЂРѕРІРЅСЏ Рё СЃРµС‚Р°РїС‹ В«РЅРѕР¶РёВ» РґР»СЏ Р°РєС‚РёРІРЅРѕРіРѕ СЃРєР°Р»СЊРїРёРЅРіР°.",
      extraModuleThreeTitle: "Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Р№ РјРѕРґСѓР»СЊ 3",
      extraModuleThreeText:
        "Р­С‚РѕС‚ РјРѕРґСѓР»СЊ Р·Р°СЂРµР·РµСЂРІРёСЂРѕРІР°РЅ РїРѕРґ СЃР»РµРґСѓСЋС‰РёР№ СЃРїРµС†РёР°Р»РёР·РёСЂРѕРІР°РЅРЅС‹Р№ Р±Р»РѕРє РѕР±СѓС‡РµРЅРёСЏ.",
      extraModuleFourTitle: "Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Р№ РјРѕРґСѓР»СЊ 4",
      extraModuleFourText:
        "Р­С‚РѕС‚ РјРѕРґСѓР»СЊ Р·Р°СЂРµР·РµСЂРІРёСЂРѕРІР°РЅ РїРѕРґ СЃР»РµРґСѓСЋС‰РёР№ СЃРїРµС†РёР°Р»РёР·РёСЂРѕРІР°РЅРЅС‹Р№ Р±Р»РѕРє РѕР±СѓС‡РµРЅРёСЏ.",
      extraModuleOneLessonOne: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂС‹РЅРєР°",
      extraModuleOneLessonTwo: "Р—РѕРЅС‹ Р»РёРєРІРёРґРЅРѕСЃС‚Рё",
      extraModuleOneLessonThree: "РћСЂРґРµСЂ-Р±Р»РѕРєРё",
      extraModuleOneLessonFour: "Р Р°Р±РѕС‡РёРµ СЃРµС‚Р°РїС‹",
      extraModuleTwoLessonOne: "РРЅС‚РµСЂС„РµР№СЃ CScalp",
      extraModuleTwoLessonTwo: "РћСЃРЅРѕРІС‹ СЃС‚Р°РєР°РЅР°",
      extraModuleTwoLessonThree: "РџСЂРѕР±РѕР№ СѓСЂРѕРІРЅСЏ",
      extraModuleTwoLessonFour: "РЎРµС‚Р°Рї В«РЅРѕР¶РёВ»",
      extraModuleThreeLessonOne: "РЈСЂРѕРє 1",
      extraModuleThreeLessonTwo: "РЈСЂРѕРє 2",
      extraModuleThreeLessonThree: "РЈСЂРѕРє 3",
      extraModuleThreeLessonFour: "РЈСЂРѕРє 4",
      extraModuleFourLessonOne: "РЈСЂРѕРє 1",
      extraModuleFourLessonTwo: "РЈСЂРѕРє 2",
      extraModuleFourLessonThree: "РЈСЂРѕРє 3",
      extraModuleFourLessonFour: "РЈСЂРѕРє 4",
    },
    reports: {
      title: "РћС‚С‡С‘С‚С‹",
      text: "РЎС‚Р°С‚РёСЃС‚РёРєР° РїРѕ Р¶СѓСЂРЅР°Р»Сѓ, РґРёРЅР°РјРёРєР° PnL, РєР°С‡РµСЃС‚РІРѕ СЃРµС‚Р°РїРѕРІ, РѕС€РёР±РєРё Рё СЃРёР»СЊРЅС‹Рµ СЃС‚РѕСЂРѕРЅС‹ С‚РѕСЂРіРѕРІР»Рё.",
      placeholder:
        "Р Р°СЃС€РёСЂРµРЅРЅС‹Рµ РѕС‚С‡С‘С‚С‹ С„РѕСЂРјРёСЂСѓСЋС‚СЃСЏ РЅР° РѕСЃРЅРѕРІРµ Р¶СѓСЂРЅР°Р»Р°, С„РёР»СЊС‚СЂРѕРІ Рё СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРґРµР»РѕРє.",
      emptyTitle: "РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С… РґР»СЏ РѕС‚С‡С‘С‚Р°",
      emptyText:
        "Р”РѕР±Р°РІСЊ РЅРµСЃРєРѕР»СЊРєРѕ СЃРґРµР»РѕРє РІ Р¶СѓСЂРЅР°Р», С‡С‚РѕР±С‹ SkillEdge AI СЃРјРѕРі РїРѕСЃС‚СЂРѕРёС‚СЊ РѕС‚С‡С‘С‚ РїРѕ PnL, РїСЂРѕС†РµРЅС‚Сѓ РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє, СЃРµС‚Р°РїР°Рј, РѕС€РёР±РєР°Рј Рё РґРёРЅР°РјРёРєРµ СЂРµР·СѓР»СЊС‚Р°С‚Р°.",
      totalTrades: "Р’СЃРµРіРѕ СЃРґРµР»РѕРє",
      totalTradesHelper: "Р’СЃРµ СЃРґРµР»РєРё РёР· Р¶СѓСЂРЅР°Р»Р°",
      totalPnl: "РћР±С‰РёР№ PnL",
      totalPnlHelper: "РЎСѓРјРјР°СЂРЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ РїРѕ Р·Р°РєСЂС‹С‚С‹Рј СЃРґРµР»РєР°Рј",
      winRate: "РџСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С…",
      averagePnl: "РЎСЂРµРґРЅРёР№ PnL",
      averagePnlHelper: "РЎСЂРµРґРЅРёР№ СЂРµР·СѓР»СЊС‚Р°С‚ РЅР° СЃРґРµР»РєСѓ",
      profitFactor: "Profit Factor",
      profitFactorHelper: "Р’Р°Р»РѕРІР°СЏ РїСЂРёР±С‹Р»СЊ / РІР°Р»РѕРІС‹Р№ СѓР±С‹С‚РѕРє",
      bestWorst: "Р›СѓС‡С€Р°СЏ / С…СѓРґС€Р°СЏ",
      bestWorstHelper: "Р›СѓС‡С€Р°СЏ Рё С…СѓРґС€Р°СЏ СЃРґРµР»РєР°",
      equityTitle: "РљСЂРёРІР°СЏ РґРѕС…РѕРґРЅРѕСЃС‚Рё",
      equitySubtitle: "Р”РёРЅР°РјРёРєР° РЅР°РєРѕРїРёС‚РµР»СЊРЅРѕРіРѕ PnL",
      points: "С‚РѕС‡РµРє",
      directionTitle: "Р›РѕРЅРі РїСЂРѕС‚РёРІ С€РѕСЂС‚Р°",
      directionSubtitle: "Р РµР·СѓР»СЊС‚Р°С‚ РїРѕ РЅР°РїСЂР°РІР»РµРЅРёСЋ",
      marketBreakdown: "Р С‹РЅРєРё",
      setupBreakdown: "РЎРµС‚Р°РїС‹",
      mistakesBreakdown: "РћС€РёР±РєРё",
      noData: "РџРѕРєР° РЅРµС‚ РґР°РЅРЅС‹С….",
      filtersTitle: "Р¤РёР»СЊС‚СЂС‹ РѕС‚С‡С‘С‚Р°",
      filtersText:
        "РЎСѓР¶Р°Р№ СЃС‚Р°С‚РёСЃС‚РёРєСѓ РїРѕ РїРµСЂРёРѕРґСѓ, СЂС‹РЅРєСѓ, РЅР°РїСЂР°РІР»РµРЅРёСЋ Рё СЃРµС‚Р°РїСѓ, С‡С‚РѕР±С‹ РІРёРґРµС‚СЊ СЂРµР°Р»СЊРЅРѕРµ РєР°С‡РµСЃС‚РІРѕ С‚РѕСЂРіРѕРІР»Рё.",
      resetFilters: "РЎР±СЂРѕСЃРёС‚СЊ С„РёР»СЊС‚СЂС‹",
      periodFilter: "РџРµСЂРёРѕРґ",
      periodAll: "Р’СЃС‘ РІСЂРµРјСЏ",
      period7d: "7 РґРЅРµР№",
      period30d: "30 РґРЅРµР№",
      period90d: "90 РґРЅРµР№",
      marketFilter: "Р С‹РЅРѕРє",
      allMarkets: "Р’СЃРµ СЂС‹РЅРєРё",
      directionFilter: "РќР°РїСЂР°РІР»РµРЅРёРµ",
      allDirections: "Р’СЃРµ РЅР°РїСЂР°РІР»РµРЅРёСЏ",
      setupFilter: "РЎРµС‚Р°Рї",
      allSetups: "Р’СЃРµ СЃРµС‚Р°РїС‹",
      filteredTrades: "РЎРґРµР»РѕРє РІ С„РёР»СЊС‚СЂРµ",
      noFilteredTradesTitle: "РџРѕРґ РІС‹Р±СЂР°РЅРЅС‹Рµ С„РёР»СЊС‚СЂС‹ СЃРґРµР»РѕРє РЅРµС‚",
      noFilteredTradesText:
        "РџРѕРїСЂРѕР±СѓР№ РёР·РјРµРЅРёС‚СЊ РїРµСЂРёРѕРґ, СЂС‹РЅРѕРє, РЅР°РїСЂР°РІР»РµРЅРёРµ РёР»Рё СЃРµС‚Р°Рї. РЎРґРµР»РєРё РІ Р¶СѓСЂРЅР°Р»Рµ РµСЃС‚СЊ, РЅРѕ С‚РµРєСѓС‰Р°СЏ РєРѕРјР±РёРЅР°С†РёСЏ С„РёР»СЊС‚СЂРѕРІ РЅРёС‡РµРіРѕ РЅРµ РЅР°С€Р»Р°.",
      aiReportTitle: "AI-РѕС‚С‡С‘С‚",
      aiReportSubtitle: "РЎРІРѕРґРєР° РїРѕ РІС‹Р±СЂР°РЅРЅС‹Рј СЃРґРµР»РєР°Рј",
      aiReportText:
        "РЎРіРµРЅРµСЂРёСЂСѓР№ РєСЂР°С‚РєРёР№ РѕС‚С‡С‘С‚ РїРѕ С‚РµРєСѓС‰РµРјСѓ С„РёР»СЊС‚СЂСѓ: С‡С‚Рѕ СЂР°Р±РѕС‚Р°РµС‚, РіРґРµ РѕС€РёР±РєРё, РєР°РєРѕР№ СЂРёСЃРє, РєР°РєРёРµ СЃРµС‚Р°РїС‹ РґР°СЋС‚ Р»СѓС‡С€РёР№ СЂРµР·СѓР»СЊС‚Р°С‚ Рё РЅР° С‡С‚Рѕ РѕР±СЂР°С‚РёС‚СЊ РІРЅРёРјР°РЅРёРµ РґР°Р»СЊС€Рµ.",
      aiReportButton: "РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РѕС‚С‡С‘С‚",
      aiReportLoading: "Р“РµРЅРµСЂРёСЂСѓРµРј...",
      aiReportError: "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ AI-РѕС‚С‡С‘С‚.",
      aiReportLabel: "AI-РѕС‚С‡С‘С‚",
      generateAiReport: "РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РѕС‚С‡С‘С‚",
      aiReportGenerating: "Р“РµРЅРµСЂРёСЂСѓРµРј РѕС‚С‡С‘С‚...",
      aiReportPlaceholder:
        "AI-РѕС‚С‡С‘С‚ РїРѕСЏРІРёС‚СЃСЏ Р·РґРµСЃСЊ РїРѕСЃР»Рµ РіРµРЅРµСЂР°С†РёРё. РћРЅ СЃРѕС…СЂР°РЅРёС‚СЃСЏ РІ РёСЃС‚РѕСЂРёРё, С‡С‚РѕР±С‹ РєР»РёРµРЅС‚ РјРѕРі РІРµСЂРЅСѓС‚СЊСЃСЏ Рє РЅРµРјСѓ РїРѕР·Р¶Рµ.",
      aiReportResultLabel: "Р РµР·СѓР»СЊС‚Р°С‚",
      latestAiReportTitle: "РџРѕСЃР»РµРґРЅРёР№ AI-РѕС‚С‡С‘С‚",
      savedAiReportTitle: "РЎРѕС…СЂР°РЅС‘РЅРЅС‹Р№ AI-РѕС‚С‡С‘С‚",
      aiReportHistoryLabel: "РСЃС‚РѕСЂРёСЏ",
      aiReportHistoryTitle: "РСЃС‚РѕСЂРёСЏ AI-РѕС‚С‡С‘С‚РѕРІ",
      aiReportHistoryText:
        "РћС‚РєСЂС‹РІР°Р№ РїСЂРѕС€Р»С‹Рµ AI-СЃРІРѕРґРєРё РїРѕ С„РёР»СЊС‚СЂР°Рј Рё Р±С‹СЃС‚СЂРѕ РІРѕР·РІСЂР°С‰Р°Р№СЃСЏ Рє РІР°Р¶РЅС‹Рј РІС‹РІРѕРґР°Рј.",
      aiReportHistoryEmpty: "РџРѕРєР° СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… AI-РѕС‚С‡С‘С‚РѕРІ РЅРµС‚.",
      currentSummaryLabel: "РўРµРєСѓС‰Р°СЏ СЃРІРѕРґРєР°",
      allPeriods: "Р’СЃРµ РїРµСЂРёРѕРґС‹",
      deleteAiReport: "РЈРґР°Р»РёС‚СЊ РѕС‚С‡С‘С‚",
      copyAiReport: "РЎРєРѕРїРёСЂРѕРІР°С‚СЊ",
      downloadAiReport: "РЎРєР°С‡Р°С‚СЊ .txt",
      aiReportCopied: "AI-РѕС‚С‡С‘С‚ СЃРєРѕРїРёСЂРѕРІР°РЅ.",
      aiReportCopyFailed: "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ РѕС‚С‡С‘С‚.",
      aiReportDownloaded: "AI-РѕС‚С‡С‘С‚ СЃРєР°С‡Р°РЅ.",
      upgradeForAiReports: "РќСѓР¶РµРЅ Edge",
      aiReportUpgradeRequired:
        "AI-РѕС‚С‡С‘С‚С‹ РґРѕСЃС‚СѓРїРЅС‹ РЅР° С‚Р°СЂРёС„Р°С… SkillEdge Edge Рё SkillEdge Elite.",
      aiReportLockedText:
        "AI-РѕС‚С‡С‘С‚С‹ РїРѕРјРѕРіР°СЋС‚ СЂР°Р·РѕР±СЂР°С‚СЊ РІС‹Р±СЂР°РЅРЅС‹Рµ СЃРґРµР»РєРё, РЅР°Р№С‚Рё Р»СѓС‡С€РёРµ СЃРµС‚Р°РїС‹, РѕС€РёР±РєРё Рё СЃР»РµРґСѓСЋС‰РёР№ С„РѕРєСѓСЃ. Р­С‚Р° С„СѓРЅРєС†РёСЏ РґРѕСЃС‚СѓРїРЅР° РЅР° С‚Р°СЂРёС„Р°С… SkillEdge Edge Рё SkillEdge Elite.",
      aiReportPlanHint: "AI-РѕС‚С‡С‘С‚РѕРІ РІ РјРµСЃСЏС† РЅР° С‚РµРєСѓС‰РµРј С‚Р°СЂРёС„Рµ",
    },
    journal: {
      title: "Р–СѓСЂРЅР°Р» СЃРґРµР»РѕРє",
      text: "Р”РѕР±Р°РІР»СЏР№С‚Рµ СЃРґРµР»РєРё, С„РёРєСЃРёСЂСѓР№С‚Рµ СЂРёСЃРє, СЂРµР·СѓР»СЊС‚Р°С‚, СЌРјРѕС†РёРё, РѕС€РёР±РєРё Рё СѓСЂРѕРєРё.",
      locked: "Р”Р»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ СЃРґРµР»РѕРє РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„ РёР»Рё РїСЂРѕР±РЅС‹Р№ РґРѕСЃС‚СѓРї.",
      addTitle: "Р”РѕР±Р°РІРёС‚СЊ СЃРґРµР»РєСѓ",
      editTitle: "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЃРґРµР»РєСѓ",
      addModeText: "Р”РѕР±Р°РІСЊ РЅРѕРІСѓСЋ СЃРґРµР»РєСѓ РІ Р»РёС‡РЅС‹Р№ Р¶СѓСЂРЅР°Р».",
      addText:
        "Р—Р°РїРѕР»РЅРё Р±Р°Р·РѕРІС‹Рµ РґР°РЅРЅС‹Рµ, РґРѕР±Р°РІСЊ СЃРєСЂРёРЅС€РѕС‚С‹ Рё РёСЃРїРѕР»СЊР·СѓР№ AI-СЂР°Р·Р±РѕСЂ РґР»СЏ РѕС†РµРЅРєРё СЃРґРµР»РєРё.",
      totalTrades: "Р’СЃРµРіРѕ СЃРґРµР»РѕРє",
      totalPnl: "РћР±С‰РёР№ PnL",
      winRate: "РџСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С…",
      avgPnl: "РЎСЂРµРґРЅРёР№ PnL",
      grossProfit: "Р’Р°Р»РѕРІР°СЏ РїСЂРёР±С‹Р»СЊ",
      grossLoss: "Р’Р°Р»РѕРІС‹Р№ СѓР±С‹С‚РѕРє",
      bestTrade: "Р›СѓС‡С€Р°СЏ СЃРґРµР»РєР°",
      worstTrade: "РҐСѓРґС€Р°СЏ СЃРґРµР»РєР°",
      profitFactor: "Profit Factor",
      equityTitle: "РљСЂРёРІР°СЏ РґРѕС…РѕРґРЅРѕСЃС‚Рё",
      equityText: "РќР°РєРѕРїРёС‚РµР»СЊРЅС‹Р№ PnL РЅР° РѕСЃРЅРѕРІРµ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРґРµР»РѕРє.",
      equityEmpty: "Р”РѕР±Р°РІСЊС‚Рµ СЃРґРµР»РєРё СЃ PnL, С‡С‚РѕР±С‹ РїРѕСЃС‚СЂРѕРёС‚СЊ РєСЂРёРІСѓСЋ РґРѕС…РѕРґРЅРѕСЃС‚Рё.",
      equityPoints: "С‚РѕС‡РµРє",
      expand: "Р Р°Р·РІРµСЂРЅСѓС‚СЊ",
      close: "Р—Р°РєСЂС‹С‚СЊ",
      cardLabels: {
        entry: "Р’С…РѕРґ",
        exit: "Р’С‹С…РѕРґ",
        stop: "РЎС‚РѕРї",
        risk: "Р РёСЃРє",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
        mistake: "РћС€РёР±РєР°",
        lesson: "РЈСЂРѕРє",
        notes: "Р—Р°РјРµС‚РєРё",
      },
      fullTitle: "РџРѕР»РЅС‹Р№ Р¶СѓСЂРЅР°Р»",
      fullText: "РџРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє СЃРґРµР»РѕРє. РќРёР¶Рµ РґРѕСЃС‚СѓРїРЅС‹ С„РёР»СЊС‚СЂС‹ Рё СЌРєСЃРїРѕСЂС‚.",
      downloadCsv: "РЎРєР°С‡Р°С‚СЊ CSV",
      downloadXlsx: "РЎРєР°С‡Р°С‚СЊ XLSX",
      deleteTradeButton: "РЈРґР°Р»РёС‚СЊ СЃРґРµР»РєСѓ",
      editTradeButton: "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ",
      openChartButton: "РћС‚РєСЂС‹С‚СЊ РіСЂР°С„РёРє",
      cancelEditButton: "РћС‚РјРµРЅРёС‚СЊ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ",
      editModeTitle: "Р РµР¶РёРј СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ",
      editModeText: "РР·РјРµРЅРё РїРѕРґСЃРІРµС‡РµРЅРЅС‹Рµ РїРѕР»СЏ Рё СЃРѕС…СЂР°РЅРё СЃРґРµР»РєСѓ.",
      actions: "Р”РµР№СЃС‚РІРёСЏ",
      deleteTradeConfirm: "РЈРґР°Р»РёС‚СЊ СЌС‚Сѓ СЃРґРµР»РєСѓ? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.",
      deleteTradeError: "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЃРґРµР»РєСѓ.",
      uploadScreenshotTitle: "Р—Р°РіСЂСѓР·РєР° СЃРєСЂРёРЅС€РѕС‚Р° СЃРґРµР»РєРё",
      uploadScreenshotText:
        "РџСЂРёРєСЂРµРїР»СЏР№С‚Рµ СЃРєСЂРёРЅС€РѕС‚С‹ РіСЂР°С„РёРєРѕРІ Рє СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рј СЃРґРµР»РєР°Рј. SkillEdge AI Р±СѓРґРµС‚ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РёС… РґР»СЏ Р°РЅР°Р»РёР·Р° РІС…РѕРґРѕРІ, РІС‹С…РѕРґРѕРІ, СЃС‚РѕРїРѕРІ Рё РїРѕРІС‚РѕСЂСЏСЋС‰РёС…СЃСЏ РѕС€РёР±РѕРє РЅР° РіСЂР°С„РёРєРµ.",
      screenshotsCount: "СЃРєСЂРёРЅС€РѕС‚РѕРІ",
      screenshotTradeLabel: "РЎРґРµР»РєР°",
      screenshotFileLabel: "РЎРєСЂРёРЅС€РѕС‚",
      screenshotChoose: "Р’С‹Р±СЂР°С‚СЊ СЃРєСЂРёРЅС€РѕС‚",
      screenshotNoFile: "Р¤Р°Р№Р» РЅРµ РІС‹Р±СЂР°РЅ",
      screenshotSelected: "Р’С‹Р±СЂР°РЅРЅС‹Р№ С„Р°Р№Р»",
      screenshotHint:
        "РЁР°РіРё: 1) Р’С‹Р±РµСЂРёС‚Рµ СЃРґРµР»РєСѓ  2) РќР°Р¶РјРёС‚Рµ В«Р’С‹Р±СЂР°С‚СЊ СЃРєСЂРёРЅС€РѕС‚В»  3) РќР°Р¶РјРёС‚Рµ В«Р—Р°РіСЂСѓР·РёС‚СЊВ»",
      screenshotUploadHintCompact:
        "Р—Р°РіСЂСѓР¶Р°Р№ РѕС‚ РѕРґРЅРѕРіРѕ РґРѕ С‚СЂС‘С… СЃРєСЂРёРЅРѕРІ СЃ СЂР°Р·РЅС‹РјРё С‚Р°Р№РјС„СЂРµР№РјР°РјРё РґР»СЏ Р±РѕР»РµРµ РіР»СѓР±РѕРєРѕРіРѕ Р°РЅР°Р»РёР·Р°.",
      screenshotFormats: "РџРѕРґРґРµСЂР¶РёРІР°РµРјС‹Рµ С„РѕСЂРјР°С‚С‹: PNG, JPG, WEBP",
      screenshotsColumn: "РЎРєСЂРёРЅС‹",
      openScreenshots: "РћС‚РєСЂС‹С‚СЊ",
      noScreenshotsForTrade: "Р”Р»СЏ СЌС‚РѕР№ СЃРґРµР»РєРё СЃРєСЂРёРЅС‹ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹.",
      screenshotViewerTitle: "РЎРєСЂРёРЅС‹ СЃРґРµР»РєРё",
      loadingScreenshots: "Р—Р°РіСЂСѓР¶Р°РµРј СЃРєСЂРёРЅС‹...",
      uploadButton: "Р—Р°РіСЂСѓР·РёС‚СЊ",
      uploadingButton: "Р—Р°РіСЂСѓР·РєР°...",
      selectTradePlaceholder: "Р’С‹Р±РµСЂРёС‚Рµ СЃРґРµР»РєСѓ",
      stepOne: "РЁР°Рі 1",
      stepTwo: "РЁР°Рі 2",
      stepThree: "РЁР°Рі 3",
      chartAnalyzeButton: "Р Р°Р·РѕР±СЂР°С‚СЊ РіСЂР°С„РёРє",
      chartAnalyzingButton: "РђРЅР°Р»РёР· РіСЂР°С„РёРєР°...",
      chartScreenshotsLabel: "СЃРєСЂРёРЅС€РѕС‚РѕРІ",
      journalAnalysisTitle: "AI-Р°РЅР°Р»РёР· Р¶СѓСЂРЅР°Р»Р° СЃРґРµР»РѕРє",
      journalAnalysisText:
        "AI РїСЂРѕР°РЅР°Р»РёР·РёСЂСѓРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ СЃРґРµР»РєРё, РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РѕС€РёР±РєРё, СЃРµС‚Р°РїС‹, СЌРјРѕС†РёРё, СЂРёСЃРє Рё РєР°С‡РµСЃС‚РІРѕ РёСЃРїРѕР»РЅРµРЅРёСЏ.",
      journalAnalyzeButton: "Р Р°Р·РѕР±СЂР°С‚СЊ Р¶СѓСЂРЅР°Р»",
      journalAnalyzingButton: "РђРЅР°Р»РёР·...",
      savedChartAnalysis: "РЎРѕС…СЂР°РЅС‘РЅРЅС‹Р№ AI-СЂР°Р·Р±РѕСЂ РіСЂР°С„РёРєР°",
      showChartHistory: "РџРѕРєР°Р·Р°С‚СЊ AI-СЂР°Р·Р±РѕСЂС‹",
      hideChartHistory: "РЎРєСЂС‹С‚СЊ AI-СЂР°Р·Р±РѕСЂС‹",
      noChartHistory: "РЎРѕС…СЂР°РЅС‘РЅРЅС‹С… СЂР°Р·Р±РѕСЂРѕРІ РіСЂР°С„РёРєР° РїРѕРєР° РЅРµС‚.",
      searchTicker: "РџРѕРёСЃРє С‚РёРєРµСЂР°",
      allMarkets: "Р’СЃРµ СЂС‹РЅРєРё",
      allSides: "Р’СЃРµ РЅР°РїСЂР°РІР»РµРЅРёСЏ",
      allResults: "Р’СЃРµ СЂРµР·СѓР»СЊС‚Р°С‚С‹",
      marketLabels: {
        stocks: "РђРєС†РёРё",
        crypto: "РљСЂРёРїС‚Рѕ",
        futures: "Р¤СЊСЋС‡РµСЂСЃС‹",
        forex: "Р¤РѕСЂРµРєСЃ",
        options: "РћРїС†РёРѕРЅС‹",
      },
      directionLabels: {
        long: "Р›РѕРЅРі",
        short: "РЁРѕСЂС‚",
      },
      resultLabels: {
        win: "РџСЂРёР±С‹Р»СЊРЅР°СЏ",
        loss: "РЈР±С‹С‚РѕС‡РЅР°СЏ",
        breakeven: "Р‘РµР·СѓР±С‹С‚РѕРє",
        notSet: "РќРµ Р·Р°РґР°РЅРѕ",
      },
      table: {
        date: "Р”Р°С‚Р°",
        ticker: "РўРёРєРµСЂ",
        market: "Р С‹РЅРѕРє",
        side: "РЎС‚РѕСЂРѕРЅР°",
        entry: "Р’С…РѕРґ",
        exit: "Р’С‹С…РѕРґ",
        stop: "РЎС‚РѕРї",
        risk: "Р РёСЃРє",
        pnl: "PnL",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
      },
      recentTitle: "РџРѕСЃР»РµРґРЅРёРµ СЃРґРµР»РєРё",
      recentText:
        "РџРѕСЃР»РµРґРЅРёРµ 3 СЃРґРµР»РєРё РёР· Р»РёС‡РЅРѕРіРѕ Р¶СѓСЂРЅР°Р»Р°. РџРѕР»РЅР°СЏ С‚Р°Р±Р»РёС†Р°, С„РёР»СЊС‚СЂС‹ Рё СЌРєСЃРїРѕСЂС‚ РґРѕСЃС‚СѓРїРЅС‹ РЅРёР¶Рµ.",
      empty:
        "РЎРґРµР»РѕРє РїРѕРєР° РЅРµС‚. Р”РѕР±Р°РІСЊС‚Рµ РїРµСЂРІСѓСЋ СЃРґРµР»РєСѓ, С‡С‚РѕР±С‹ РЅР°С‡Р°С‚СЊ СЃРѕР±РёСЂР°С‚СЊ Р±Р°Р·Сѓ СЃРІРѕРµР№ СЃС‚Р°С‚РёСЃС‚РёРєРё.",
      tradesCount: "СЃРґРµР»РѕРє",
      saving: "РЎРѕС…СЂР°РЅСЏРµРј...",
      save: "РЎРѕС…СЂР°РЅРёС‚СЊ СЃРґРµР»РєСѓ",
      updateTradeButton: "РћР±РЅРѕРІРёС‚СЊ СЃРґРµР»РєСѓ",
      updatingTradeButton: "РћР±РЅРѕРІР»РµРЅРёРµ...",
      tickerRequired: "Р’РІРµРґРёС‚Рµ С‚РёРєРµСЂ.",
      tradeLimitReached: "Р”РѕСЃС‚РёРіРЅСѓС‚ Р»РёРјРёС‚ СЃРґРµР»РѕРє РґР»СЏ РІР°С€РµРіРѕ С‚РµРєСѓС‰РµРіРѕ С‚Р°СЂРёС„Р°",
      tradeUsageTitle: "РСЃРїРѕР»СЊР·РѕРІР°РЅРѕ СЃРґРµР»РѕРє",
      tradesLeftLabel: "РѕСЃС‚Р°Р»РѕСЃСЊ",
      screenshotLimitReached: "Р”РѕСЃС‚РёРіРЅСѓС‚ Р»РёРјРёС‚ СЃРєСЂРёРЅС€РѕС‚РѕРІ РґР»СЏ СЌС‚РѕР№ СЃРґРµР»РєРё",
      screenshotUsageTitle: "РСЃРїРѕР»СЊР·РѕРІР°РЅРѕ СЃРєСЂРёРЅС€РѕС‚РѕРІ",
      limitReached: "Р”РѕСЃС‚РёРіРЅСѓС‚ Р»РёРјРёС‚ СЃРґРµР»РѕРє РґР»СЏ РІР°С€РµРіРѕ С‚РµРєСѓС‰РµРіРѕ С‚Р°СЂРёС„Р°",
      loginFirst: "РЎРЅР°С‡Р°Р»Р° РІРѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚.",
      saveFailed: "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЃРґРµР»РєСѓ.",
      fields: {
        ticker: "РўРёРєРµСЂ",
        date: "Р”Р°С‚Р°",
        market: "Р С‹РЅРѕРє",
        direction: "РќР°РїСЂР°РІР»РµРЅРёРµ",
        entry: "Р’С…РѕРґ",
        exit: "Р’С‹С…РѕРґ",
        stop: "РЎС‚РѕРї",
        size: "Р Р°Р·РјРµСЂ РїРѕР·РёС†РёРё",
        risk: "Р РёСЃРє $",
        pnl: "PnL $",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
        emotion: "Р­РјРѕС†РёСЏ",
        mistake: "РћС€РёР±РєР°",
        lesson: "РЈСЂРѕРє",
        notes: "Р—Р°РјРµС‚РєРё",
      },
      placeholders: {
        ticker: "AAPL / BTC / NQ",
        entry: "100",
        exit: "105",
        stop: "98",
        size: "РђРєС†РёРё / РєРѕРЅС‚СЂР°РєС‚С‹",
        risk: "50",
        pnl: "-25 / 120",
        setup: "РІРѕР·РІСЂР°С‚ VWAP / Р·Р°С‚СѓС…Р°РЅРёРµ РіСЌРїР°",
        emotion: "РЎРїРѕРєРѕР№СЃС‚РІРёРµ / FOMO / СЃС‚СЂР°С…",
        mistake: "Р§С‚Рѕ Р±С‹Р»Рѕ СЃРґРµР»Р°РЅРѕ РЅРµРїСЂР°РІРёР»СЊРЅРѕ?",
        lesson: "Р§С‚Рѕ РЅСѓР¶РЅРѕ Р·Р°РїРѕРјРЅРёС‚СЊ РЅР° СЃР»РµРґСѓСЋС‰СѓСЋ СЃРґРµР»РєСѓ?",
        notes: "РљРѕРЅС‚РµРєСЃС‚, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂ, Р»РµРЅС‚Р°, СѓСЂРѕРІРЅРё...",
      },
      options: {
        notSet: "РќРµ Р·Р°РґР°РЅРѕ",
        win: "РџР»СЋСЃ",
        loss: "РњРёРЅСѓСЃ",
        breakeven: "Р‘РµР·СѓР±С‹С‚РѕРє",
      },
    },
    locked: {
      title: "РђРєС‚РёРІРёСЂСѓР№С‚Рµ С‚Р°СЂРёС„",
      label: "Р”РѕСЃС‚СѓРї Р·Р°РєСЂС‹С‚",
      text: "РџРѕСЃР»Рµ РѕРїР»Р°С‚С‹ РѕС‚РєСЂРѕСЋС‚СЃСЏ Р¶СѓСЂРЅР°Р» СЃРґРµР»РѕРє, SkillEdge AI-РєРѕСѓС‡, РіСЂР°С„РёРєРё TradingView, РѕР±СѓС‡РµРЅРёРµ, РѕС‚С‡С‘С‚С‹ Рё РёСЃС‚РѕСЂРёСЏ AI-СЂР°Р·Р±РѕСЂРѕРІ.",
      button: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
    },
    tabs: {
      overview: "РћР±Р·РѕСЂ",
      journal: "Р–СѓСЂРЅР°Р» СЃРґРµР»РѕРє",
      charts: "Р“СЂР°С„РёРєРё",
      market: "Р С‹РЅРѕРє",
      alerts: "РЎРёРіРЅР°Р»С‹",
      coach: "AI-РєРѕСѓС‡",
      learning: "РћР±СѓС‡РµРЅРёРµ",
      reports: "РћС‚С‡С‘С‚С‹",
      billing: "РћРїР»Р°С‚Р°",
    },
    periods: {
      monthly: "1 РјРµСЃСЏС†",
      halfyear: "6 РјРµСЃСЏС†РµРІ",
      yearly: "1 РіРѕРґ",
      demo: "7-РґРЅРµРІРЅР°СЏ РїСЂРѕР±РЅР°СЏ РІРµСЂСЃРёСЏ",
    },
    demo: {
      label: "РџСЂРѕР±РЅР°СЏ РІРµСЂСЃРёСЏ",
      title: "РЈ РІР°СЃ Р°РєС‚РёРІРёСЂРѕРІР°РЅ 7-РґРЅРµРІРЅС‹Р№ РїСЂРѕР±РЅС‹Р№ РґРѕСЃС‚СѓРї",
      text:
        "Р­С‚Рѕ РїСЂРѕР±РЅР°СЏ РІРµСЂСЃРёСЏ С‚Р°СЂРёС„Р° SkillEdge Core СЃ Р»РёРјРёС‚РѕРј 10 AI-Р·Р°РїСЂРѕСЃРѕРІ. РџРѕСЃР»Рµ РѕРєРѕРЅС‡Р°РЅРёСЏ СЃСЂРѕРєР° РґРѕСЃС‚СѓРї Р±СѓРґРµС‚ Р·Р°РєСЂС‹С‚, РµСЃР»Рё РІС‹ РЅРµ РІС‹Р±РµСЂРµС‚Рµ РѕСЃРЅРѕРІРЅРѕР№ С‚Р°СЂРёС„.",
      short: "7-РґРЅРµРІРЅР°СЏ РїСЂРѕР±РЅР°СЏ РІРµСЂСЃРёСЏ. Р›РёРјРёС‚: 10 AI-Р·Р°РїСЂРѕСЃРѕРІ.",
    },
    billing: {
      title: "РўР°СЂРёС„ Рё РѕРїР»Р°С‚Р°",
      text: "РРЅС„РѕСЂРјР°С†РёСЏ РїСЂРѕ С‚РµРєСѓС‰РёР№ С‚Р°СЂРёС„, РѕРїР»Р°С‚С‹ Рё СЃСЂРѕРє РґРµР№СЃС‚РІРёСЏ РїРѕРґРїРёСЃРєРё.",
      activePlan: "РўР°СЂРёС„ Р°РєС‚РёРІРЅС‹Р№",
      inactivePlan: "РўР°СЂРёС„ РЅРµ Р°РєС‚РёРІРёСЂРѕРІР°РЅ",
      period: "РџРµСЂРёРѕРґ",
      validUntil: "Р”РµР№СЃС‚РІСѓРµС‚ РґРѕ",
      empty:
        "РџРѕСЃР»Рµ РѕРїР»Р°С‚С‹ С‚СѓС‚ РїРѕСЏРІСЏС‚СЃСЏ РїР»Р°РЅ, РїРµСЂРёРѕРґ, РґР°С‚Р° Р·Р°РІРµСЂС€РµРЅРёСЏ Рё РёСЃС‚РѕСЂРёСЏ РїР»Р°С‚РµР¶РµР№.",
      currentPlan: "РўРµРєСѓС‰РёР№ С‚Р°СЂРёС„",
      creatingCheckout: "РЎРѕР·РґР°С‘Рј РѕРїР»Р°С‚Сѓ...",
      checkoutError: "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Сѓ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.",
      loginRequiredForPayment: "Р’РѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚ РїРµСЂРµРґ РѕРїР»Р°С‚РѕР№ С‚Р°СЂРёС„Р°.",
      currentPlanLabel: "РўРµРєСѓС‰РёР№ С‚Р°СЂРёС„",
      activeSubscription:
        "РџРѕРґРїРёСЃРєР° Р°РєС‚РёРІРЅР°. Р›РёРјРёС‚С‹ Рё РґРѕСЃС‚СѓРїС‹ РїСЂРёРјРµРЅСЏСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.",
      inactiveSubscription:
        "РџРѕРґРїРёСЃРєР° РЅРµ Р°РєС‚РёРІРЅР°. РќРµРєРѕС‚РѕСЂС‹Рµ С„СѓРЅРєС†РёРё РјРѕРіСѓС‚ Р±С‹С‚СЊ РЅРµРґРѕСЃС‚СѓРїРЅС‹.",
      active: "РђРєС‚РёРІРЅР°",
      inactive: "РќРµР°РєС‚РёРІРЅР°",
      billingPeriod: "РџРµСЂРёРѕРґ",
      aiUsage: "РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ AI",
      billingNoteLabel: "Р’Р°Р¶РЅРѕ",
      billingNoteText:
        "Р Р°Р·РґРµР» РѕРїР»Р°С‚С‹ РїРѕРєР°Р·С‹РІР°РµС‚ С‚РµРєСѓС‰РёР№ С‚Р°СЂРёС„, Р»РёРјРёС‚С‹, СѓСЂРѕРІРµРЅСЊ РґРѕСЃС‚СѓРїР° Рё СЃС‚Р°С‚СѓСЃ РїРѕРґРїРёСЃРєРё. РћРїР»Р°С‚Р° РєР°СЂС‚РѕР№ РіРѕС‚РѕРІРёС‚СЃСЏ С‡РµСЂРµР· РѕРґРѕР±СЂРµРЅРЅРѕРіРѕ РїР»Р°С‚С‘Р¶РЅРѕРіРѕ РїСЂРѕРІР°Р№РґРµСЂР°, Р° РєСЂРёРїС‚Рѕ-РґРѕСЃС‚СѓРї РґРѕСЃС‚СѓРїРµРЅ РЅР° СЌС‚Р°РїРµ Р·Р°РїСѓСЃРєР°.",
      currentLimitsLabel: "Р›РёРјРёС‚С‹",
      currentLimitsTitle: "Р§С‚Рѕ РІС…РѕРґРёС‚ РІ С‚РµРєСѓС‰РёР№ С‚Р°СЂРёС„",
      aiCoachLimit: "AI-РєРѕСѓС‡ / РјРµСЃСЏС†",
      journalAiLimit: "AI-Р°РЅР°Р»РёР· Р¶СѓСЂРЅР°Р»Р° / РјРµСЃСЏС†",
      chartAiLimit: "AI-Р°РЅР°Р»РёР· РіСЂР°С„РёРєР° / РјРµСЃСЏС†",
      aiReportsLimit: "AI-РѕС‚С‡С‘С‚С‹ / РјРµСЃСЏС†",
      maxTradesLimit: "РњР°РєСЃРёРјСѓРј СЃРґРµР»РѕРє",
      screenshotsLimit: "РЎРєСЂРёРЅС€РѕС‚РѕРІ РЅР° СЃРґРµР»РєСѓ",
      aiReportsAccess: "AI-РѕС‚С‡С‘С‚С‹",
      supportAssistantAccess: "РџРѕРјРѕС‰РЅРёРє РїРѕРґРґРµСЂР¶РєРё",
      socialTickersAccess: "РЎРѕС†РёР°Р»СЊРЅС‹Рµ С‚РёРєРµСЂС‹",
      aiScannerAccess: "AI-СЃРєР°РЅРµСЂ",
      aiAlertsAccess: "AI-СЃРёРіРЅР°Р»С‹",
      premiumChartAccess: "РџСЂРµРјРёСѓРј-Р°РЅР°Р»РёР· РіСЂР°С„РёРєР°",
      exportReportsAccess: "Р­РєСЃРїРѕСЂС‚ РѕС‚С‡С‘С‚РѕРІ",
      included: "Р’РєР»СЋС‡РµРЅРѕ",
      locked: "Р—Р°РєСЂС‹С‚Рѕ",
      comparePlansLabel: "РЎСЂР°РІРЅРµРЅРёРµ",
      comparePlansTitle: "РЎСЂР°РІРЅРµРЅРёРµ С‚Р°СЂРёС„РѕРІ",
      comparePlansText:
        "РџСЂРѕРІРµСЂСЊ, С‡С‚Рѕ РєР»РёРµРЅС‚ РІРёРґРёС‚ СЂР°Р·РЅРёС†Сѓ РјРµР¶РґСѓ Core, Edge Рё Elite.",
      current: "РўРµРєСѓС‰РёР№",
      choosePlan: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
      planDescriptions: {
        core: "Р‘Р°Р·РѕРІС‹Р№ РґРѕСЃС‚СѓРї РґР»СЏ Р¶СѓСЂРЅР°Р»Р° СЃРґРµР»РѕРє, СЃРєСЂРёРЅС€РѕС‚РѕРІ, AI-РєРѕСѓС‡Р° Рё РєРѕРЅС‚СЂРѕР»СЏ РґРёСЃС†РёРїР»РёРЅС‹.",
        edge: "РџСЂРѕРґРІРёРЅСѓС‚С‹Р№ С‚Р°СЂРёС„ РґР»СЏ Р°РєС‚РёРІРЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ: Р±РѕР»СЊС€Рµ AI-Р·Р°РїСЂРѕСЃРѕРІ, РѕС‚С‡С‘С‚С‹, СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР° Рё AI-СЃРєР°РЅРµСЂ.",
        elite:
          "РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ С‚Р°СЂРёС„: AI-СЃРёРіРЅР°Р»С‹, РїР»Р°РІР°СЋС‰РёР№ РІРёРґР¶РµС‚ СЃРёРіРЅР°Р»РѕРІ, СЃРІСЏР·РєР° СЃРёРіРЅР°Р»РѕРІ СЃ Р¶СѓСЂРЅР°Р»РѕРј Рё РїРѕР»РЅС‹Р№ AI Trading Desk.",
      },
    },
    aiLimits: {
      reachedTitle: "Р›РёРјРёС‚ AI РёСЃС‡РµСЂРїР°РЅ",
      reachedText:
        "Р’С‹ РёСЃРїРѕР»СЊР·РѕРІР°Р»Рё РІСЃРµ AI-Р·Р°РїСЂРѕСЃС‹, РґРѕСЃС‚СѓРїРЅС‹Рµ РїРѕ РІР°С€РµРјСѓ С‚РµРєСѓС‰РµРјСѓ С‚Р°СЂРёС„Сѓ РІ СЌС‚РѕРј РјРµСЃСЏС†Рµ. РћР±РЅРѕРІРёС‚Рµ С‚Р°СЂРёС„ РёР»Рё РґРѕР¶РґРёС‚РµСЃСЊ СЃР»РµРґСѓСЋС‰РµРіРѕ РјРµСЃСЏС‡РЅРѕРіРѕ СЃР±СЂРѕСЃР°.",
      remainingPrefix: "РћСЃС‚Р°Р»РѕСЃСЊ AI-Р·Р°РїСЂРѕСЃРѕРІ",
    },
    coach: {
      title: "AI-РєРѕСѓС‡",
      text: "РћРїРёС€РёС‚Рµ СЃРґРµР»РєСѓ, СЌРјРѕС†РёРё, РѕС€РёР±РєСѓ РёР»Рё С‚РѕСЂРіРѕРІСѓСЋ СЃРёС‚СѓР°С†РёСЋ вЂ” AI-РєРѕСѓС‡ РґР°СЃС‚ СЂР°Р·Р±РѕСЂ РїРѕ РґРёСЃС†РёРїР»РёРЅРµ, СЂРёСЃРєСѓ Рё РєР°С‡РµСЃС‚РІСѓ СЂРµС€РµРЅРёСЏ.",
      reviewTitle: "Р Р°Р·Р±РѕСЂ СЃРґРµР»РєРё",
      reviewText:
        "Р§РµРј РєРѕРЅРєСЂРµС‚РЅРµРµ РѕРїРёСЃР°РЅРёРµ, С‚РµРј РїРѕР»РµР·РЅРµРµ РѕС‚РІРµС‚. РЈРєР°Р¶Рё С‚РёРєРµСЂ, РІС…РѕРґ, СЃС‚РѕРї, РїСЂРёС‡РёРЅСѓ РІС…РѕРґР°, СЌРјРѕС†РёРё Рё СЂРµР·СѓР»СЊС‚Р°С‚.",
      placeholder:
        "РџСЂРёРјРµСЂ: СЃРµРіРѕРґРЅСЏ Р·Р°С€С‘Р» РІ С€РѕСЂС‚ РїРѕСЃР»Рµ РїСЂРµРјР°СЂРєРµС‚-РїР°РјРїР°, СѓРІРёРґРµР» СЃР»Р°Р±РѕСЃС‚СЊ РїРѕРґ VWAP, РЅРѕ РїРµСЂРµРґРІРёРЅСѓР» СЃС‚РѕРї Рё РїРµСЂРµСЃРёРґРµР» СѓР±С‹С‚РѕРє. Р Р°Р·Р±РµСЂРё, РіРґРµ Р±С‹Р»Р° РѕС€РёР±РєР°.",
      ask: "РЎРїСЂРѕСЃРёС‚СЊ AI",
      analyzing: "AI Р°РЅР°Р»РёР·РёСЂСѓРµС‚...",
      newReview: "РќРѕРІС‹Р№ СЂР°Р·Р±РѕСЂ",
      answerTitle: "РћС‚РІРµС‚ AI-РєРѕСѓС‡Р°",
      answerPlaceholder:
        "Р—РґРµСЃСЊ РїРѕСЏРІРёС‚СЃСЏ СЂР°Р·Р±РѕСЂ: С‡С‚Рѕ Р±С‹Р»Рѕ С…РѕСЂРѕС€Рѕ, РіРґРµ РѕС€РёР±РєР°, РєР°РєРѕР№ СѓСЂРѕРє Р·Р°РЅРµСЃС‚Рё РІ Р¶СѓСЂРЅР°Р» Рё С‡С‚Рѕ РїСЂРѕРІРµСЂРёС‚СЊ РїРµСЂРµРґ СЃР»РµРґСѓСЋС‰РµР№ СЃРґРµР»РєРѕР№.",
      historyTitle: "РСЃС‚РѕСЂРёСЏ AI-СЂР°Р·Р±РѕСЂРѕРІ",
      historyText: "РџРѕСЃР»РµРґРЅРёРµ 10 Р·Р°РїСЂРѕСЃРѕРІ Рє AI-РєРѕСѓС‡Сѓ.",
      historyEmpty: "РСЃС‚РѕСЂРёСЏ РїРѕРєР° РїСѓСЃС‚Р°СЏ. РџРµСЂРІС‹Р№ СЂР°Р·Р±РѕСЂ РїРѕСЏРІРёС‚СЃСЏ Р·РґРµСЃСЊ РїРѕСЃР»Рµ РѕС‚РІРµС‚Р° AI.",
      loginFirst: "РЎРЅР°С‡Р°Р»Р° РІРѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚.",
      messageRequired: "Р’РІРµРґРёС‚Рµ РІРѕРїСЂРѕСЃ РёР»Рё РѕРїРёСЃР°РЅРёРµ СЃРґРµР»РєРё.",
      coachError: "РћС€РёР±РєР° AI-РєРѕСѓС‡Р°.",
      error: "РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР° Рє AI-РєРѕСѓС‡Сѓ.",
      failed: "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РѕС‚РІРµС‚ AI-РєРѕСѓС‡Р°.",
      needPlan: "Р”Р»СЏ AI-РєРѕСѓС‡Р° РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„ РёР»Рё РїСЂРѕР±РЅС‹Р№ РґРѕСЃС‚СѓРї.",
      limitReached:
        "Р›РёРјРёС‚ AI-Р·Р°РїСЂРѕСЃРѕРІ Р·Р°РєРѕРЅС‡РёР»СЃСЏ. Р’С‹Р±РµСЂРёС‚Рµ С‚Р°СЂРёС„ РІС‹С€Рµ РёР»Рё РґРѕР¶РґРёС‚РµСЃСЊ РѕР±РЅРѕРІР»РµРЅРёСЏ Р»РёРјРёС‚Р°.",
    },
  },

  ua: {
    terminal: "РўРµСЂРјС–РЅР°Р» SkillEdge AI",
    dashboard: "РћСЃРѕР±РёСЃС‚РёР№ РєР°Р±С–РЅРµС‚",
    user: "РљРѕСЂРёСЃС‚СѓРІР°С‡",
    choosePlan: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
    logout: "Р’РёР№С‚Рё",
    currentPlan: "РџРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„",
    loading: "Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ...",
    notActivated: "РќРµ Р°РєС‚РёРІРѕРІР°РЅРѕ",
    activatePlan: "РђРєС‚РёРІСѓР№С‚Рµ С‚Р°СЂРёС„, С‰РѕР± РІС–РґРєСЂРёС‚Рё С„СѓРЅРєС†С–С— РєР°Р±С–РЅРµС‚Сѓ.",
    aiUsage: "Р’РёРєРѕСЂРёСЃС‚Р°РЅРЅСЏ AI",
    quickActions: "РЁРІРёРґРєС– РґС–С—",
    addTrade: "Р”РѕРґР°С‚Рё СѓРіРѕРґСѓ",
    uploadScreenshot: "Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё СЃРєСЂРёРЅ",
    askAI: "Р—Р°РїРёС‚Р°С‚Рё AI-РєРѕСѓС‡Р°",
    createReport: "РЎС‚РІРѕСЂРёС‚Рё Р·РІС–С‚",
    overview: {
      title: "РћРіР»СЏРґ РµС„РµРєС‚РёРІРЅРѕСЃС‚С–",
      text: "Р—РІРµРґРµРЅРЅСЏ PnL, РІС–РґСЃРѕС‚РѕРє РїСЂРёР±СѓС‚РєРѕРІРёС… СѓРіРѕРґ, РѕС†С–РЅРєР° РґРёСЃС†РёРїР»С–РЅРё, РЅР°Р№РєСЂР°С‰С– СЃРµС‚Р°РїРё С‚Р° РіРѕР»РѕРІРЅС– РїРѕРјРёР»РєРё.",
      pnlMonth: "PnL Р·Р° РјС–СЃСЏС†СЊ",
      winRate: "Р’С–РґСЃРѕС‚РѕРє РїСЂРёР±СѓС‚РєРѕРІРёС…",
      discipline: "РћС†С–РЅРєР° РґРёСЃС†РёРїР»С–РЅРё",
      weeklyAi: "AI-Р·РІРµРґРµРЅРЅСЏ С‚РёР¶РЅСЏ",
      weeklyAiText:
        "AI-Р·РІРµРґРµРЅРЅСЏ Р·Р±РёСЂР°С” РєР»СЋС‡РѕРІС– РІРёСЃРЅРѕРІРєРё РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СѓРіРѕРґ, СЂРёР·РёРєСѓ, РґРёСЃС†РёРїР»С–РЅС– С‚Р° РїРѕРІС‚РѕСЂСЋРІР°РЅРёС… РїРѕРјРёР»РєР°С….",
    },
    charts: {
      title: "Р“СЂР°С„С–РєРё TradingView",
      text: "Р’Р±СѓРґРѕРІР°РЅРёР№ РіСЂР°С„С–Рє TradingView РґР»СЏ Р°РЅР°Р»С–Р·Сѓ С‚РёРєРµСЂС–РІ, СЂС–РІРЅС–РІ С– СЃРµС‚Р°РїС–РІ.",
      placeholder: "Р РѕР±РѕС‡РёР№ РїСЂРѕСЃС‚С–СЂ TradingView РґРѕСЃС‚СѓРїРЅРёР№ СѓСЃРµСЂРµРґРёРЅС– РјРѕРґСѓР»СЏ РіСЂР°С„С–РєС–РІ.",
      analyzeCurrentChart: "РџСЂРѕР°РЅР°Р»С–Р·СѓРІР°С‚Рё РіСЂР°С„С–Рє",
      workspaceText: "Р РѕР±РѕС‡Р° Р·РѕРЅР° Р· РіСЂР°С„С–РєРѕРј, СЃРїРёСЃРєРѕРј СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ С‚Р° Р»С–РґРµСЂР°РјРё СЂСѓС…Сѓ СЂРёРЅРєСѓ.",
      watchlistExamples: "РџСЂРёРєР»Р°РґРё СЃРїРёСЃРєСѓ СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ: AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      openWatchlist: "Р’С–РґРєСЂРёС‚Рё СЃРїРёСЃРѕРє",
      hideWatchlist: "РЎС…РѕРІР°С‚Рё СЃРїРёСЃРѕРє",
      watchlistTitle: "РЎРїРёСЃРѕРє СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ",
      watchlistSubtitle: "РўРёРєРµСЂ / 24h % / РѕР±КјС”Рј",
      addTickerButton: "Р”РѕРґР°С‚Рё",
      addTickerPlaceholder: "AA.NY / TSLA.NQ / SPY.AM / BTCUSDT",
      addTickerHint: "РџСЂРёРєР»Р°Рґ: AA.NY = NYSE, TSLA.NQ = NASDAQ, SPY.AM = AMEX, BTCUSDT = Binance.",
      sortSymbol: "РўРёРєРµСЂ",
      sortChange: "% 24h",
      sortVolume: "РћР±КјС”Рј",
      symbolColumn: "РўРёРєРµСЂ",
      percentColumn: "%",
      volumeColumn: "РћР±КјС”Рј",
      loadingWatchlist: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ СЃРїРёСЃРѕРє СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ...",
      emptyWatchlist: "РЎРїРёСЃРѕРє РїРѕСЂРѕР¶РЅС–Р№. РќР°С‚РёСЃРЅРё + С– РґРѕРґР°Р№ С‚РёРєРµСЂ.",
      removeFromWatchlist: "Р’РёРґР°Р»РёС‚Рё Р·С– СЃРїРёСЃРєСѓ",
      loginFirst: "РЎРїРѕС‡Р°С‚РєСѓ СѓРІС–Р№РґС–С‚СЊ РІ Р°РєР°СѓРЅС‚.",
      settingsLoadError: "РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё РЅР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ РіСЂР°С„С–РєС–РІ.",
      addTickerError: "РќРµ РІРґР°Р»РѕСЃСЏ РґРѕРґР°С‚Рё С‚РёРєРµСЂ РґРѕ СЃРїРёСЃРєСѓ СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ.",
      removeTickerError: "РќРµ РІРґР°Р»РѕСЃСЏ РІРёРґР°Р»РёС‚Рё С‚РёРєРµСЂ Р·С– СЃРїРёСЃРєСѓ СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ.",
      moversStocks: "РђРєС†С–С—",
      moversCrypto: "РљСЂРёРїС‚Рѕ",
      moversGainers: "Р›С–РґРµСЂРё СЂРѕСЃС‚Сѓ",
      moversLosers: "Р›С–РґРµСЂРё РїР°РґС–РЅРЅСЏ",
      moversCollapse: "Р—РіРѕСЂРЅСѓС‚Рё",
      moversExpand: "Р РѕР·РіРѕСЂРЅСѓС‚Рё",
      moversName: "РќР°Р·РІР°",
      moversPercentChange: "% Р·РјС–РЅРё",
      moversLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ Р»С–РґРµСЂС–РІ СЂСѓС…Сѓ...",
      moversEmpty: "РќРµРјР°С” С–РЅСЃС‚СЂСѓРјРµРЅС‚С–РІ РїС–Рґ С†РµР№ С„С–Р»СЊС‚СЂ.",
      moversStocksNeedKey:
        "Р›С–РґРµСЂРё СЂСѓС…Сѓ РїРѕ Р°РєС†С–СЏС… РіРѕС‚СѓСЋС‚СЊСЃСЏ РґРѕ РїС–РґРєР»СЋС‡РµРЅРЅСЏ РїСЂРµРјС–Р°Р»СЊРЅРѕРіРѕ РїРѕРєСЂРёС‚С‚СЏ СЂРёРЅРєРѕРІРёС… РґР°РЅРёС….",
      chartAnalysisTitle: "AI-Р°РЅР°Р»С–Р· РіСЂР°С„С–РєР°",
      chartAnalysisText:
        "SkillEdge AI Р°РЅР°Р»С–Р·СѓС” РїРѕС‚РѕС‡РЅРёР№ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј, СЂРёРЅРєРѕРІС– РґР°РЅС–, СЃРІС–С‡РєРё, РѕР±КјС”Рј С– РєРѕРЅС‚РµРєСЃС‚ СЂРёР·РёРєСѓ.",
      chartAnalysisLoading: "РђРЅР°Р»С–Р·СѓС”РјРѕ РїРѕС‚РѕС‡РЅРёР№ РіСЂР°С„С–Рє...",
      chartAnalysisError: "РќРµ РІРґР°Р»РѕСЃСЏ РїСЂРѕР°РЅР°Р»С–Р·СѓРІР°С‚Рё РїРѕС‚РѕС‡РЅРёР№ РіСЂР°С„С–Рє.",
      chartAnalysisEmpty: "Р—Р°РїСѓСЃС‚Рё AI-Р°РЅР°Р»С–Р·, С‰РѕР± РїРѕР±Р°С‡РёС‚Рё СЂРѕР·Р±С–СЂ РїРѕС‚РѕС‡РЅРѕРіРѕ РіСЂР°С„С–РєР°.",
      chartAnalysisClose: "Р—Р°РєСЂРёС‚Рё",
      chartAnalysisSymbol: "РўС–РєРµСЂ",
      chartAnalysisInterval: "РўР°Р№РјС„СЂРµР№Рј",
      chartAnalysisReportLabel: "Р—РІС–С‚ SkillEdge AI",
      chartAnalysisDataLabel: "Р РѕР·Р±С–СЂ СЂРёРЅРєРѕРІРѕС— СЃС‚СЂСѓРєС‚СѓСЂРё",
      chartAnalysisSectionsLabel: "РЎРµРєС†С–С— Р°РЅР°Р»С–Р·Сѓ",
      marketDataUnavailableTitle: "Р РёРЅРєРѕРІС– РґР°РЅС– РЅРµРґРѕСЃС‚СѓРїРЅС–",
      marketDataUnavailableText:
        "SkillEdge AI РЅРµ Р·РјС–Рі Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё СЂРёРЅРєРѕРІС– РґР°РЅС– РїРѕ С†СЊРѕРјСѓ С‚РёРєРµСЂСѓ РЅР° РїРѕС‚РѕС‡РЅРѕРјСѓ С‚Р°СЂРёС„С– РґР°РЅРёС…. РЎРїСЂРѕР±СѓР№ Р±С–Р»СЊС€ Р»С–РєРІС–РґРЅРёР№ С‚РёРєРµСЂ: AAPL, TSLA, NVDA, SPY Р°Р±Рѕ QQQ.",
      marketDataPremiumTitle: "РџРѕС‚СЂС–Р±РµРЅ РїСЂРµРјС–СѓРј-РґРѕСЃС‚СѓРї РґРѕ СЂРёРЅРєРѕРІРёС… РґР°РЅРёС…",
      marketDataPremiumText:
  "Р¦РµР№ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј Р°Р±Рѕ РґР¶РµСЂРµР»Рѕ РґР°РЅРёС… РјРѕР¶Рµ РІРёРјР°РіР°С‚Рё РІРёС‰РёР№ С‚Р°СЂРёС„ СЂРёРЅРєРѕРІРёС… РґР°РЅРёС…. SkillEdge AI РІРёРєРѕСЂРёСЃС‚РѕРІСѓС” РїСЂРµРјС–Р°Р»СЊРЅРµ СЂРёРЅРєРѕРІРµ РїРѕРєСЂРёС‚С‚СЏ С‚Р°Рј, РґРµ РІРѕРЅРѕ РґРѕСЃС‚СѓРїРЅРµ.",
      marketDataGenericErrorTitle: "РђРЅР°Р»С–Р· С‚РёРјС‡Р°СЃРѕРІРѕ РЅРµРґРѕСЃС‚СѓРїРЅРёР№",
      marketDataGenericErrorText:
        "Р—Р°СЂР°Р· РЅРµ РІРґР°Р»РѕСЃСЏ РІРёРєРѕРЅР°С‚Рё Р°РЅР°Р»С–Р· РіСЂР°С„С–РєР°. РЎРїСЂРѕР±СѓР№ С–РЅС€РёР№ С‚РёРєРµСЂ, С‚Р°Р№РјС„СЂРµР№Рј Р°Р±Рѕ Р·Р°РїСѓСЃС‚Рё Р°РЅР°Р»С–Р· С‰Рµ СЂР°Р·.",
      chartControlTickerLabel: "РўС–РєРµСЂ",
      chartControlTickerPlaceholder: "AAPL / TSLA.NQ / AA.NY / BTCUSDT",
      chartControlIntervalLabel: "РўР°Р№РјС„СЂРµР№Рј",
      chartControlOpenChart: "Р’С–РґРєСЂРёС‚Рё РіСЂР°С„С–Рє",
      chartControlHint:
        "Р’РёРєРѕСЂРёСЃС‚РѕРІСѓР№ С†СЋ РїР°РЅРµР»СЊ РґР»СЏ РєРµСЂСѓРІР°РЅРЅСЏ TradingView С‚Р° AI-Р°РЅР°Р»С–Р·РѕРј. Р—РјС–РЅРё РІСЃРµСЂРµРґРёРЅС– СЃР°РјРѕРіРѕ TradingView РјРѕР¶СѓС‚СЊ РЅРµ СЃРёРЅС…СЂРѕРЅС–Р·СѓРІР°С‚РёСЃСЏ РЅР°Р·Р°Рґ Сѓ SkillEdge AI.",
    },
    learning: {
      title: "Р¦РµРЅС‚СЂ РЅР°РІС‡Р°РЅРЅСЏ",
      text: "РЎС‚СЂСѓРєС‚СѓСЂРЅРµ РЅР°РІС‡Р°РЅРЅСЏ С‚СЂРµР№РґРёРЅРіСѓ, СЃРµС‚Р°РїРё, СЂРёР·РёРє-РјРµРЅРµРґР¶РјРµРЅС‚, РїСЃРёС…РѕР»РѕРіС–СЏ С‚Р° РїРѕР±СѓРґРѕРІР° С‚РѕСЂРіРѕРІРѕРіРѕ РїР»РµР№Р±СѓРєР°.",
      learningNoteTitle: "Р¦РµРЅС‚СЂ РЅР°РІС‡Р°РЅРЅСЏ РїСЂР°С†СЋС” СЏРє Р±Р°Р·Р° РїРѕРІС‚РѕСЂРµРЅРЅСЏ",
      learningNoteText:
        "SkillEdge AI РЅР°СЃР°РјРїРµСЂРµРґ СЃС„РѕРєСѓСЃРѕРІР°РЅРёР№ РЅР° Р¶СѓСЂРЅР°Р»С– СѓРіРѕРґ, Р°РЅР°Р»С–Р·С– РіСЂР°С„С–РєС–РІ, AI-СЂРѕР·Р±РѕСЂС– С‚Р° СЂРѕР·РІРёС‚РєСѓ С‚РѕСЂРіРѕРІРѕС— СЃРёСЃС‚РµРјРё. Р¦РµР№ СЂРѕР·РґС–Р» СЃС‚РІРѕСЂРµРЅРёР№ СЏРє РєРѕСЂРѕС‚РєР° Р±Р°Р·Р° РґР»СЏ РІС–РґРЅРѕРІР»РµРЅРЅСЏ РєР»СЋС‡РѕРІРёС… РїРѕРЅСЏС‚СЊ, С‰РѕР± РєР»С–С”РЅС‚ С€РІРёРґС€Рµ СЂРѕР·СѓРјС–РІ СЂРёР·РёРє, СЃРµС‚Р°РїРё, СЃС‚СЂСѓРєС‚СѓСЂСѓ СЂРёРЅРєСѓ С‚Р° Р»РѕРіС–РєСѓ AI-Р°РЅР°Р»С–Р·Сѓ.",
      overviewLabel: "РћРіР»СЏРґ РЅР°РІС‡Р°РЅРЅСЏ",
      modulesLabel: "РњРѕРґСѓР»С–",
      lessonsLabel: "СѓСЂРѕРєС–РІ",
      progressLabel: "РџСЂРѕРіСЂРµСЃ",
      totalProgressLabel: "Р—Р°РіР°Р»СЊРЅРёР№ РїСЂРѕРіСЂРµСЃ",
      startButton: "РџРѕС‡Р°С‚Рё",
      continueButton: "РџСЂРѕРґРѕРІР¶РёС‚Рё",
      reviewButton: "РџРѕРІС‚РѕСЂРёС‚Рё",
      notStartedStatus: "РќРµ СЂРѕР·РїРѕС‡Р°С‚Рѕ",
      inProgressStatus: "РЈ РїСЂРѕС†РµСЃС–",
      completedStatus: "РџСЂРѕР№РґРµРЅРѕ",
      lockedLabel: "РЎРєРѕСЂРѕ",
      estimatedTimeLabel: "Р§Р°СЃ",
      levelLabel: "Р С–РІРµРЅСЊ",
      beginnerLevel: "РџРѕС‡Р°С‚РєРѕРІРёР№",
      intermediateLevel: "РЎРµСЂРµРґРЅС–Р№",
      advancedLevel: "РџСЂРѕСЃСѓРЅСѓС‚РёР№",
      moduleOneTitle: "РћСЃРЅРѕРІРё СЂРёРЅРєСѓ",
      moduleOneText:
        "Р РѕР·Р±РµСЂРёСЃСЏ, СЏРє РїСЂР°С†СЋС” СЂРёРЅРѕРє, СЏРє РІР·Р°С”РјРѕРґС–СЋС‚СЊ РѕСЂРґРµСЂРё С– С‡РѕРјСѓ Р»С–РєРІС–РґРЅС–СЃС‚СЊ РјР°С” Р·РЅР°С‡РµРЅРЅСЏ.",
      moduleTwoTitle: "РўРµС…РЅС–С‡РЅРёР№ Р°РЅР°Р»С–Р·",
      moduleTwoText:
        "РЎРІС–С‡РєРё, СЂС–РІРЅС–, С‚СЂРµРЅРґ/СЂРµРЅР¶, РѕР±КјС”Рј С– С‡РёСЃС‚Рµ С‡РёС‚Р°РЅРЅСЏ РіСЂР°С„С–РєР° Р±РµР· Р·Р°Р№РІРѕРіРѕ С€СѓРјСѓ.",
      moduleThreeTitle: "Р РёР·РёРє-РјРµРЅРµРґР¶РјРµРЅС‚",
      moduleThreeText:
        "РџСЂР°РІРёР»Р° СЂРёР·РёРєСѓ РЅР° СѓРіРѕРґСѓ, СЃС‚РѕРї-Р»РѕСЃСЃ, СЂРѕР·РјС–СЂ РїРѕР·РёС†С–С— С‚Р° СЃРїС–РІРІС–РґРЅРѕС€РµРЅРЅСЏ СЂРёР·РёРє/РїСЂРёР±СѓС‚РѕРє.",
      moduleFourTitle: "Р’РЅСѓС‚СЂС–С€РЅСЊРѕРґРµРЅРЅРёР№ С–РјРїСѓР»СЊСЃ",
      moduleFourText:
        "Р›РѕРіС–РєР° С–РјРїСѓР»СЊСЃСѓ, РїСЂРѕР±С–Р№, РїРѕРІРµСЂРЅРµРЅРЅСЏ СЂС–РІРЅСЏ, С…РёР±РЅРёР№ РїСЂРѕР±С–Р№ С– СЃРµС‚Р°РїРё РїСЂРѕРґРѕРІР¶РµРЅРЅСЏ СЂСѓС…Сѓ.",
      moduleFiveTitle: "РџСЃРёС…РѕР»РѕРіС–СЏ С‚СЂРµР№РґРёРЅРіСѓ",
      moduleFiveText:
        "РљРѕРЅС‚СЂРѕР»СЊ РїРµСЂРµС‚РѕСЂРіРѕРІРєРё, С‚РѕСЂРіС–РІР»С– Р· РїРѕРјСЃС‚Рё, СЃС‚СЂР°С…Сѓ, СЃСѓРјРЅС–РІС–РІ С‚Р° С–РјРїСѓР»СЊСЃРёРІРЅРёС… РІС…РѕРґС–РІ.",
      moduleSixTitle: "РџР»РµР№Р±СѓРє / РЎРµС‚Р°РїРё",
      moduleSixText:
        "РџРµСЂРµС‚РІРѕСЂСЋР№ РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїР°С‚РµСЂРЅРё РЅР° С‚РѕСЂРіРѕРІРёР№ РїР»РµР№Р±СѓРє С–Р· С‚СЂРёРіРµСЂР°РјРё РІС…РѕРґСѓ С‚Р° СѓРјРѕРІР°РјРё СЃРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС—.",
      lessonMarketStructure: "РЇРє РїСЂР°С†СЋС” СЂРёРЅРѕРє",
      lessonOrderTypes: "РўРёРїРё РѕСЂРґРµСЂС–РІ",
      lessonBidAskSpread: "Bid / Ask / РЎРїСЂРµРґ",
      lessonLiquidity: "Р›С–РєРІС–РґРЅС–СЃС‚СЊ",
      lessonCandles: "РЎРІС–С‡РєРё",
      lessonLevels: "РџС–РґС‚СЂРёРјРєР° С– СЃРїСЂРѕС‚РёРІ",
      lessonTrendRange: "РўСЂРµРЅРґ Р°Р±Рѕ СЂРµРЅР¶",
      lessonVolume: "РђРЅР°Р»С–Р· РѕР±КјС”РјСѓ",
      lessonRiskPerTrade: "Р РёР·РёРє РЅР° СѓРіРѕРґСѓ",
      lessonStopLoss: "РЎС‚РѕРї-Р»РѕСЃСЃ",
      lessonRiskReward: "Р РёР·РёРє / РџРѕС‚РµРЅС†С–Р°Р»",
      lessonPositionSizing: "Р РѕР·РјС–СЂ РїРѕР·РёС†С–С—",
      lessonMomentumLogic: "Р›РѕРіС–РєР° С–РјРїСѓР»СЊСЃСѓ",
      lessonBreakoutReclaim: "РџСЂРѕР±С–Р№ / РїРѕРІРµСЂРЅРµРЅРЅСЏ СЂС–РІРЅСЏ",
      lessonFailedBreakout: "РҐРёР±РЅРёР№ РїСЂРѕР±С–Р№",
      lessonContinuation: "РџСЂРѕРґРѕРІР¶РµРЅРЅСЏ СЂСѓС…Сѓ",
      lessonDiscipline: "Р”РёСЃС†РёРїР»С–РЅР°",
      lessonOvertrading: "РџРµСЂРµС‚РѕСЂРіРѕРІРєР°",
      lessonRevengeTrading: "РўРѕСЂРіС–РІР»СЏ Р· РїРѕРјСЃС‚Рё",
      lessonPatience: "РўРµСЂРїС–РЅРЅСЏ",
      lessonSetupChecklist: "Р§РµРєР»РёСЃС‚ СЃРµС‚Р°РїСѓ",
      lessonEntryTrigger: "РўСЂРёРіРµСЂ РІС…РѕРґСѓ",
      lessonInvalidation: "РЎРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС—",
      lessonReviewProcess: "РџСЂРѕС†РµСЃ СЂРѕР·Р±РѕСЂСѓ",
      advancedTracksLabel: "Р”РѕРґР°С‚РєРѕРІС– РЅР°РїСЂСЏРјРєРё",
      advancedTracksText:
        "Р”РѕРґР°С‚РєРѕРІС– СЃРїРµС†С–Р°Р»С–Р·РѕРІР°РЅС– РЅР°РїСЂСЏРјРё РЅР°РІС‡Р°РЅРЅСЏ РґР»СЏ РїРѕРіР»РёР±Р»РµРЅРЅСЏ С‚РѕСЂРіРѕРІРѕС— СЃРёСЃС‚РµРјРё РІСЃРµСЂРµРґРёРЅС– SkillEdge AI.",
      comingSoonButton: "РќРµР·Р°Р±Р°СЂРѕРј",
      activeModuleLabel: "РђРєС‚РёРІРЅРёР№ РјРѕРґСѓР»СЊ",
      openLessonButton: "Р’С–РґРєСЂРёС‚Рё СѓСЂРѕРє",
      selectedModuleHint:
        "РћР±РµСЂРё РјРѕРґСѓР»СЊ, С‰РѕР± РїРѕР±Р°С‡РёС‚Рё СѓСЂРѕРєРё, РїСЂРѕРіСЂРµСЃ С– РЅР°СЃС‚СѓРїРЅРёР№ РєСЂРѕРє РЅР°РІС‡Р°РЅРЅСЏ.",
      nextLessonLabel: "РќР°СЃС‚СѓРїРЅРёР№ СѓСЂРѕРє",
      moduleDetailsLabel: "Р”РµС‚Р°Р»С– РјРѕРґСѓР»СЏ",
      lessonViewerLabel: "РџРµСЂРµРіР»СЏРґ СѓСЂРѕРєСѓ",
      lessonContentLabel: "Р—РјС–СЃС‚ СѓСЂРѕРєСѓ",
      lessonCloseButton: "Р—Р°РєСЂРёС‚Рё СѓСЂРѕРє",
      lessonStartText:
        "Р¦РµР№ СѓСЂРѕРє РѕС„РѕСЂРјР»РµРЅРѕ СЏРє РєРѕСЂРѕС‚РєРёР№ РїСЂР°РєС‚РёС‡РЅРёР№ Р±Р»РѕРє SkillEdge AI. Р’РёРІС‡Рё РєР»СЋС‡РѕРІС– С–РґРµС—, РІРёРєРѕРЅР°Р№ Р·Р°РІРґР°РЅРЅСЏ С‚Р° Р·РІКјСЏР¶Рё РєРѕРЅС†РµРїС†С–СЋ Р·С– СЃРІРѕС—РјРё СѓРіРѕРґР°РјРё.",
      lessonKeyPointsLabel: "РљР»СЋС‡РѕРІС– С–РґРµС—",
      lessonPracticeLabel: "РџСЂР°РєС‚РёС‡РЅРµ Р·Р°РІРґР°РЅРЅСЏ",
      lessonPracticeText:
        "Р РѕР·Р±РµСЂРё РєРѕРЅС†РµРїС†С–СЋ, Р·РЅР°Р№РґРё РѕРґРёРЅ РїСЂРёРєР»Р°Рґ РЅР° РіСЂР°С„С–РєСѓ С– Р·Р°РїРёС€Рё, С‰Рѕ РїС–РґС‚РІРµСЂРґР¶СѓС” Р°Р±Рѕ Р»Р°РјР°С” С–РґРµСЋ.",
      markLessonCompletedButton: "РџРѕР·РЅР°С‡РёС‚Рё СѓСЂРѕРє РїСЂРѕР№РґРµРЅРёРј",
      lessonCompletedButton: "РЈСЂРѕРє РїСЂРѕР№РґРµРЅРѕ",
      frontendProgressNote:
        "РџСЂРѕРіСЂРµСЃ Р·Р±РµСЂС–РіР°С”С‚СЊСЃСЏ РІ Р°РєР°СѓРЅС‚С– SkillEdge AI С– Р·Р°Р»РёС€РёС‚СЊСЃСЏ РїС–СЃР»СЏ РїРµСЂРµР·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ.",
      learningProgressLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ РїСЂРѕРіСЂРµСЃ РЅР°РІС‡Р°РЅРЅСЏ...",
      learningProgressSaving: "Р—Р±РµСЂС–РіР°С”РјРѕ РїСЂРѕРіСЂРµСЃ...",
      learningProgressSaved: "РџСЂРѕРіСЂРµСЃ Р·Р±РµСЂРµР¶РµРЅРѕ",
      lessonAutoAdvanced:
        "РЈСЂРѕРє Р·Р±РµСЂРµР¶РµРЅРѕ. РќР°СЃС‚СѓРїРЅРёР№ СѓСЂРѕРє РІС–РґРєСЂРёС‚Рѕ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ.",
      moduleCompletedMessage: "РњРѕРґСѓР»СЊ Р·Р°РІРµСЂС€РµРЅРѕ. Р§СѓРґРѕРІР° СЂРѕР±РѕС‚Р°.",
      learningProgressError: "РќРµ РІРґР°Р»РѕСЃСЏ СЃРёРЅС…СЂРѕРЅС–Р·СѓРІР°С‚Рё РїСЂРѕРіСЂРµСЃ РЅР°РІС‡Р°РЅРЅСЏ.",
      extraModuleOneTitle: "РљРѕРЅС†РµРїС†С–СЏ Smart Money С‚Р° СЂРѕР±РѕС‡С– СЃРµС‚Р°РїРё",
      extraModuleOneText:
        "РЎС‚СЂСѓРєС‚СѓСЂР° СЂРёРЅРєСѓ, Р»С–РєРІС–РґРЅС–СЃС‚СЊ, РїСЂРѕРІРѕРєР°С†С–С—, С–РјРїСѓР»СЊСЃРЅРµ Р·РјС–С‰РµРЅРЅСЏ, РѕСЂРґРµСЂ-Р±Р»РѕРєРё С‚Р° РїСЂР°РєС‚РёС‡РЅР° Р»РѕРіС–РєР° СЂРѕР±РѕС‡РёС… СЃРµС‚Р°РїС–РІ.",
      extraModuleTwoTitle: "РЎРєР°Р»СЊРїС–РЅРі СЃС‚Р°РєР°РЅР° РІ CScalp",
      extraModuleTwoText:
        "РќР°РІС‡Р°РЅРЅСЏ РїР»Р°С‚С„РѕСЂРјС–, Р±Р°Р·РѕРІР° СЂРѕР±РѕС‚Р° Р· РїРѕС‚РѕРєРѕРј РѕСЂРґРµСЂС–РІ, РїСЂРѕР±С–Р№ СЂС–РІРЅСЏ С‚Р° СЃРµС‚Р°РїРё В«РЅРѕР¶С–В» РґР»СЏ Р°РєС‚РёРІРЅРѕРіРѕ СЃРєР°Р»СЊРїС–РЅРіСѓ.",
      extraModuleThreeTitle: "Р”РѕРґР°С‚РєРѕРІРёР№ РјРѕРґСѓР»СЊ 3",
      extraModuleThreeText:
        "Р¦РµР№ РјРѕРґСѓР»СЊ Р·Р°СЂРµР·РµСЂРІРѕРІР°РЅРѕ РїС–Рґ РЅР°СЃС‚СѓРїРЅРёР№ СЃРїРµС†С–Р°Р»С–Р·РѕРІР°РЅРёР№ РЅР°РІС‡Р°Р»СЊРЅРёР№ Р±Р»РѕРє.",
      extraModuleFourTitle: "Р”РѕРґР°С‚РєРѕРІРёР№ РјРѕРґСѓР»СЊ 4",
      extraModuleFourText:
        "Р¦РµР№ РјРѕРґСѓР»СЊ Р·Р°СЂРµР·РµСЂРІРѕРІР°РЅРѕ РїС–Рґ РЅР°СЃС‚СѓРїРЅРёР№ СЃРїРµС†С–Р°Р»С–Р·РѕРІР°РЅРёР№ РЅР°РІС‡Р°Р»СЊРЅРёР№ Р±Р»РѕРє.",
      extraModuleOneLessonOne: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂРёРЅРєСѓ",
      extraModuleOneLessonTwo: "Р—РѕРЅРё Р»С–РєРІС–РґРЅРѕСЃС‚С–",
      extraModuleOneLessonThree: "РћСЂРґРµСЂ-Р±Р»РѕРєРё",
      extraModuleOneLessonFour: "Р РѕР±РѕС‡С– СЃРµС‚Р°РїРё",
      extraModuleTwoLessonOne: "Р†РЅС‚РµСЂС„РµР№СЃ CScalp",
      extraModuleTwoLessonTwo: "РћСЃРЅРѕРІРё СЃС‚Р°РєР°РЅР°",
      extraModuleTwoLessonThree: "РџСЂРѕР±С–Р№ СЂС–РІРЅСЏ",
      extraModuleTwoLessonFour: "РЎРµС‚Р°Рї В«РЅРѕР¶С–В»",
      extraModuleThreeLessonOne: "РЈСЂРѕРє 1",
      extraModuleThreeLessonTwo: "РЈСЂРѕРє 2",
      extraModuleThreeLessonThree: "РЈСЂРѕРє 3",
      extraModuleThreeLessonFour: "РЈСЂРѕРє 4",
      extraModuleFourLessonOne: "РЈСЂРѕРє 1",
      extraModuleFourLessonTwo: "РЈСЂРѕРє 2",
      extraModuleFourLessonThree: "РЈСЂРѕРє 3",
      extraModuleFourLessonFour: "РЈСЂРѕРє 4",
    },
    reports: {
      title: "Р—РІС–С‚Рё",
      text: "РЎС‚Р°С‚РёСЃС‚РёРєР° Р¶СѓСЂРЅР°Р»Сѓ, РґРёРЅР°РјС–РєР° PnL, СЏРєС–СЃС‚СЊ СЃРµС‚Р°РїС–РІ, РїРѕРјРёР»РєРё С‚Р° СЃРёР»СЊРЅС– СЃС‚РѕСЂРѕРЅРё С‚РѕСЂРіС–РІР»С–.",
      placeholder:
        "Р РѕР·С€РёСЂРµРЅС– Р·РІС–С‚Рё С„РѕСЂРјСѓСЋС‚СЊСЃСЏ РЅР° РѕСЃРЅРѕРІС– Р¶СѓСЂРЅР°Р»Сѓ, С„С–Р»СЊС‚СЂС–РІ С– Р·Р±РµСЂРµР¶РµРЅРёС… СѓРіРѕРґ.",
      emptyTitle: "РџРѕРєРё РЅРµРґРѕСЃС‚Р°С‚РЅСЊРѕ РґР°РЅРёС… РґР»СЏ Р·РІС–С‚Сѓ",
      emptyText:
        "Р”РѕРґР°Р№ РєС–Р»СЊРєР° СѓРіРѕРґ Сѓ Р¶СѓСЂРЅР°Р», С‰РѕР± SkillEdge AI Р·РјС–Рі РїРѕР±СѓРґСѓРІР°С‚Рё Р·РІС–С‚ РїРѕ PnL, РІС–РґСЃРѕС‚РєСѓ РїСЂРёР±СѓС‚РєРѕРІРёС… СѓРіРѕРґ, СЃРµС‚Р°РїР°С…, РїРѕРјРёР»РєР°С… С– РґРёРЅР°РјС–С†С– СЂРµР·СѓР»СЊС‚Р°С‚Сѓ.",
      totalTrades: "РЈСЃСЊРѕРіРѕ СѓРіРѕРґ",
      totalTradesHelper: "РЈСЃС– СѓРіРѕРґРё Р· Р¶СѓСЂРЅР°Р»Сѓ",
      totalPnl: "Р—Р°РіР°Р»СЊРЅРёР№ PnL",
      totalPnlHelper: "РЎСѓРјР°СЂРЅРёР№ СЂРµР·СѓР»СЊС‚Р°С‚ Р·Р° Р·Р°РєСЂРёС‚РёРјРё СѓРіРѕРґР°РјРё",
      winRate: "Р’С–РґСЃРѕС‚РѕРє РїСЂРёР±СѓС‚РєРѕРІРёС…",
      averagePnl: "РЎРµСЂРµРґРЅС–Р№ PnL",
      averagePnlHelper: "РЎРµСЂРµРґРЅС–Р№ СЂРµР·СѓР»СЊС‚Р°С‚ РЅР° СѓРіРѕРґСѓ",
      profitFactor: "Profit Factor",
      profitFactorHelper: "Р’Р°Р»РѕРІРёР№ РїСЂРёР±СѓС‚РѕРє / РІР°Р»РѕРІРёР№ Р·Р±РёС‚РѕРє",
      bestWorst: "РќР°Р№РєСЂР°С‰Р° / РЅР°Р№РіС–СЂС€Р°",
      bestWorstHelper: "РќР°Р№РєСЂР°С‰Р° С‚Р° РЅР°Р№РіС–СЂС€Р° СѓРіРѕРґР°",
      equityTitle: "РљСЂРёРІР° РґРѕС…С–РґРЅРѕСЃС‚С–",
      equitySubtitle: "Р”РёРЅР°РјС–РєР° РЅР°РєРѕРїРёС‡СѓРІР°Р»СЊРЅРѕРіРѕ PnL",
      points: "С‚РѕС‡РѕРє",
      directionTitle: "Р›РѕРЅРі РїСЂРѕС‚Рё С€РѕСЂС‚Р°",
      directionSubtitle: "Р РµР·СѓР»СЊС‚Р°С‚ Р·Р° РЅР°РїСЂСЏРјРєРѕРј",
      marketBreakdown: "Р РёРЅРєРё",
      setupBreakdown: "РЎРµС‚Р°РїРё",
      mistakesBreakdown: "РџРѕРјРёР»РєРё",
      noData: "РџРѕРєРё РЅРµРјР°С” РґР°РЅРёС….",
      filtersTitle: "Р¤С–Р»СЊС‚СЂРё Р·РІС–С‚Сѓ",
      filtersText:
        "Р—РІСѓР¶СѓР№ СЃС‚Р°С‚РёСЃС‚РёРєСѓ Р·Р° РїРµСЂС–РѕРґРѕРј, СЂРёРЅРєРѕРј, РЅР°РїСЂСЏРјРєРѕРј С– СЃРµС‚Р°РїРѕРј, С‰РѕР± Р±Р°С‡РёС‚Рё СЂРµР°Р»СЊРЅСѓ СЏРєС–СЃС‚СЊ С‚РѕСЂРіС–РІР»С–.",
      resetFilters: "РЎРєРёРЅСѓС‚Рё С„С–Р»СЊС‚СЂРё",
      periodFilter: "РџРµСЂС–РѕРґ",
      periodAll: "РЈРІРµСЃСЊ С‡Р°СЃ",
      period7d: "7 РґРЅС–РІ",
      period30d: "30 РґРЅС–РІ",
      period90d: "90 РґРЅС–РІ",
      marketFilter: "Р РёРЅРѕРє",
      allMarkets: "РЈСЃС– СЂРёРЅРєРё",
      directionFilter: "РќР°РїСЂСЏРјРѕРє",
      allDirections: "РЈСЃС– РЅР°РїСЂСЏРјРєРё",
      setupFilter: "РЎРµС‚Р°Рї",
      allSetups: "РЈСЃС– СЃРµС‚Р°РїРё",
      filteredTrades: "РЈРіРѕРґ Сѓ С„С–Р»СЊС‚СЂС–",
      noFilteredTradesTitle: "Р—Р° РІРёР±СЂР°РЅРёРјРё С„С–Р»СЊС‚СЂР°РјРё СѓРіРѕРґ РЅРµРјР°С”",
      noFilteredTradesText:
        "РЎРїСЂРѕР±СѓР№ Р·РјС–РЅРёС‚Рё РїРµСЂС–РѕРґ, СЂРёРЅРѕРє, РЅР°РїСЂСЏРјРѕРє Р°Р±Рѕ СЃРµС‚Р°Рї. РЈ Р¶СѓСЂРЅР°Р»С– С” СѓРіРѕРґРё, Р°Р»Рµ РїРѕС‚РѕС‡РЅР° РєРѕРјР±С–РЅР°С†С–СЏ С„С–Р»СЊС‚СЂС–РІ РЅС–С‡РѕРіРѕ РЅРµ Р·РЅР°Р№С€Р»Р°.",
      aiReportTitle: "AI-Р·РІС–С‚",
      aiReportSubtitle: "Р—РІРµРґРµРЅРЅСЏ Р·Р° РІРёР±СЂР°РЅРёРјРё СѓРіРѕРґР°РјРё",
      aiReportText:
        "Р—РіРµРЅРµСЂСѓР№ РєРѕСЂРѕС‚РєРёР№ Р·РІС–С‚ Р·Р° РїРѕС‚РѕС‡РЅРёРј С„С–Р»СЊС‚СЂРѕРј: С‰Рѕ РїСЂР°С†СЋС”, РґРµ РїРѕРјРёР»РєРё, СЏРєС–СЃС‚СЊ СЂРёР·РёРєСѓ, РЅР°Р№РєСЂР°С‰С– СЃРµС‚Р°РїРё С‚Р° РЅР° С‡РѕРјСѓ СЃС„РѕРєСѓСЃСѓРІР°С‚РёСЃСЏ РґР°Р»С–.",
      aiReportButton: "Р—РіРµРЅРµСЂСѓРІР°С‚Рё Р·РІС–С‚",
      aiReportLoading: "Р“РµРЅРµСЂСѓС”РјРѕ...",
      aiReportError: "РќРµ РІРґР°Р»РѕСЃСЏ Р·РіРµРЅРµСЂСѓРІР°С‚Рё AI-Р·РІС–С‚.",
      aiReportLabel: "AI-Р·РІС–С‚",
      generateAiReport: "Р—РіРµРЅРµСЂСѓРІР°С‚Рё Р·РІС–С‚",
      aiReportGenerating: "Р“РµРЅРµСЂСѓС”РјРѕ Р·РІС–С‚...",
      aiReportPlaceholder:
        "AI-Р·РІС–С‚ Р·вЂ™СЏРІРёС‚СЊСЃСЏ С‚СѓС‚ РїС–СЃР»СЏ РіРµРЅРµСЂР°С†С–С—. Р’С–РЅ С‚Р°РєРѕР¶ Р·Р±РµСЂРµР¶РµС‚СЊСЃСЏ РІ С–СЃС‚РѕСЂС–С—, С‰РѕР± РєР»С–С”РЅС‚ РјС–Рі РїРѕРІРµСЂРЅСѓС‚РёСЃСЏ РґРѕ РЅСЊРѕРіРѕ РїС–Р·РЅС–С€Рµ.",
      aiReportResultLabel: "Р РµР·СѓР»СЊС‚Р°С‚",
      latestAiReportTitle: "РћСЃС‚Р°РЅРЅС–Р№ AI-Р·РІС–С‚",
      savedAiReportTitle: "Р—Р±РµСЂРµР¶РµРЅРёР№ AI-Р·РІС–С‚",
      aiReportHistoryLabel: "Р†СЃС‚РѕСЂС–СЏ",
      aiReportHistoryTitle: "Р†СЃС‚РѕСЂС–СЏ AI-Р·РІС–С‚С–РІ",
      aiReportHistoryText:
        "Р’С–РґРєСЂРёРІР°Р№ РїРѕРїРµСЂРµРґРЅС– AI-Р·РІРµРґРµРЅРЅСЏ Р·Р° С„С–Р»СЊС‚СЂР°РјРё С‚Р° С€РІРёРґРєРѕ РїРѕРІРµСЂС‚Р°Р№СЃСЏ РґРѕ РЅР°Р№РІР°Р¶Р»РёРІС–С€РёС… РІРёСЃРЅРѕРІРєС–РІ.",
      aiReportHistoryEmpty: "РџРѕРєРё С‰Рѕ Р·Р±РµСЂРµР¶РµРЅРёС… AI-Р·РІС–С‚С–РІ РЅРµРјР°С”.",
      currentSummaryLabel: "РџРѕС‚РѕС‡РЅРµ Р·РІРµРґРµРЅРЅСЏ",
      allPeriods: "РЈСЃС– РїРµСЂС–РѕРґРё",
      deleteAiReport: "Р’РёРґР°Р»РёС‚Рё Р·РІС–С‚",
      copyAiReport: "РЎРєРѕРїС–СЋРІР°С‚Рё",
      downloadAiReport: "Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё .txt",
      aiReportCopied: "AI-Р·РІС–С‚ СЃРєРѕРїС–Р№РѕРІР°РЅРѕ.",
      aiReportCopyFailed: "РќРµ РІРґР°Р»РѕСЃСЏ СЃРєРѕРїС–СЋРІР°С‚Рё Р·РІС–С‚.",
      aiReportDownloaded: "AI-Р·РІС–С‚ Р·Р°РІР°РЅС‚Р°Р¶РµРЅРѕ.",
      upgradeForAiReports: "РџРѕС‚СЂС–Р±РµРЅ Edge",
      aiReportUpgradeRequired:
        "AI-Р·РІС–С‚Рё РґРѕСЃС‚СѓРїРЅС– РЅР° С‚Р°СЂРёС„Р°С… SkillEdge Edge С‚Р° SkillEdge Elite.",
      aiReportLockedText:
        "AI-Р·РІС–С‚Рё РґРѕРїРѕРјР°РіР°СЋС‚СЊ СЂРѕР·С–Р±СЂР°С‚Рё РІРёР±СЂР°РЅС– СѓРіРѕРґРё, Р·РЅР°Р№С‚Рё РЅР°Р№РєСЂР°С‰С– СЃРµС‚Р°РїРё, РїРѕРјРёР»РєРё С‚Р° РЅР°СЃС‚СѓРїРЅРёР№ С„РѕРєСѓСЃ. Р¦СЏ С„СѓРЅРєС†С–СЏ РґРѕСЃС‚СѓРїРЅР° РЅР° С‚Р°СЂРёС„Р°С… SkillEdge Edge С‚Р° SkillEdge Elite.",
      aiReportPlanHint: "AI-Р·РІС–С‚С–РІ РЅР° РјС–СЃСЏС†СЊ РЅР° РїРѕС‚РѕС‡РЅРѕРјСѓ С‚Р°СЂРёС„С–",
    },
    journal: {
      title: "Р–СѓСЂРЅР°Р» СѓРіРѕРґ",
      text: "Р”РѕРґР°РІР°Р№С‚Рµ СѓРіРѕРґРё, С„С–РєСЃСѓР№С‚Рµ СЂРёР·РёРє, СЂРµР·СѓР»СЊС‚Р°С‚, РµРјРѕС†С–С—, РїРѕРјРёР»РєРё С‚Р° СѓСЂРѕРєРё.",
      locked: "Р”Р»СЏ РґРѕРґР°РІР°РЅРЅСЏ СѓРіРѕРґ РїРѕС‚СЂС–Р±РµРЅ Р°РєС‚РёРІРЅРёР№ С‚Р°СЂРёС„ Р°Р±Рѕ РїСЂРѕР±РЅРёР№ РґРѕСЃС‚СѓРї.",
      addTitle: "Р”РѕРґР°С‚Рё СѓРіРѕРґСѓ",
      editTitle: "Р РµРґР°РіСѓРІР°С‚Рё СѓРіРѕРґСѓ",
      addModeText: "Р”РѕРґР°Р№ РЅРѕРІСѓ СѓРіРѕРґСѓ РґРѕ РѕСЃРѕР±РёСЃС‚РѕРіРѕ Р¶СѓСЂРЅР°Р»Сѓ.",
      addText:
        "Р—Р°РїРѕРІРЅРё Р±Р°Р·РѕРІС– РґР°РЅС–, РґРѕРґР°Р№ СЃРєСЂС–РЅС€РѕС‚Рё С‚Р° РІРёРєРѕСЂРёСЃС‚РѕРІСѓР№ AI-СЂРѕР·Р±С–СЂ РґР»СЏ РѕС†С–РЅРєРё СѓРіРѕРґРё.",
      totalTrades: "РЈСЃСЊРѕРіРѕ СѓРіРѕРґ",
      totalPnl: "Р—Р°РіР°Р»СЊРЅРёР№ PnL",
      winRate: "Р’С–РґСЃРѕС‚РѕРє РїСЂРёР±СѓС‚РєРѕРІРёС…",
      avgPnl: "РЎРµСЂРµРґРЅС–Р№ PnL",
      grossProfit: "Р’Р°Р»РѕРІРёР№ РїСЂРёР±СѓС‚РѕРє",
      grossLoss: "Р’Р°Р»РѕРІРёР№ Р·Р±РёС‚РѕРє",
      bestTrade: "РќР°Р№РєСЂР°С‰Р° СѓРіРѕРґР°",
      worstTrade: "РќР°Р№РіС–СЂС€Р° СѓРіРѕРґР°",
      profitFactor: "Profit Factor",
      equityTitle: "РљСЂРёРІР° РґРѕС…С–РґРЅРѕСЃС‚С–",
      equityText: "РќР°РєРѕРїРёС‡СѓРІР°Р»СЊРЅРёР№ PnL РЅР° РѕСЃРЅРѕРІС– Р·Р±РµСЂРµР¶РµРЅРёС… СѓРіРѕРґ.",
      equityEmpty: "Р”РѕРґР°Р№С‚Рµ СѓРіРѕРґРё Р· PnL, С‰РѕР± РїРѕР±СѓРґСѓРІР°С‚Рё РєСЂРёРІСѓ РґРѕС…С–РґРЅРѕСЃС‚С–.",
      equityPoints: "С‚РѕС‡РѕРє",
      expand: "Р РѕР·РіРѕСЂРЅСѓС‚Рё",
      close: "Р—Р°РєСЂРёС‚Рё",
      cardLabels: {
        entry: "Р’С…С–Рґ",
        exit: "Р’РёС…С–Рґ",
        stop: "РЎС‚РѕРї",
        risk: "Р РёР·РёРє",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
        mistake: "РџРѕРјРёР»РєР°",
        lesson: "РЈСЂРѕРє",
        notes: "РќРѕС‚Р°С‚РєРё",
      },
      fullTitle: "РџРѕРІРЅРёР№ Р¶СѓСЂРЅР°Р»",
      fullText: "РџРѕРІРЅРёР№ СЃРїРёСЃРѕРє СѓРіРѕРґ. РќРёР¶С‡Рµ РґРѕСЃС‚СѓРїРЅС– С„С–Р»СЊС‚СЂРё С‚Р° РµРєСЃРїРѕСЂС‚.",
      downloadCsv: "Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё CSV",
      downloadXlsx: "Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё XLSX",
      deleteTradeButton: "Р’РёРґР°Р»РёС‚Рё СѓРіРѕРґСѓ",
      editTradeButton: "Р РµРґР°РіСѓРІР°С‚Рё",
      openChartButton: "Р’С–РґРєСЂРёС‚Рё РіСЂР°С„С–Рє",
      cancelEditButton: "РЎРєР°СЃСѓРІР°С‚Рё СЂРµРґР°РіСѓРІР°РЅРЅСЏ",
      editModeTitle: "Р РµР¶РёРј СЂРµРґР°РіСѓРІР°РЅРЅСЏ",
      editModeText: "Р—РјС–РЅРё РїС–РґСЃРІС–С‡РµРЅС– РїРѕР»СЏ С‚Р° Р·Р±РµСЂРµР¶Рё СѓРіРѕРґСѓ.",
      actions: "Р”С–С—",
      deleteTradeConfirm: "Р’РёРґР°Р»РёС‚Рё С†СЋ СѓРіРѕРґСѓ? Р¦СЋ РґС–СЋ РЅРµ РјРѕР¶РЅР° СЃРєР°СЃСѓРІР°С‚Рё.",
      deleteTradeError: "РќРµ РІРґР°Р»РѕСЃСЏ РІРёРґР°Р»РёС‚Рё СѓРіРѕРґСѓ.",
      uploadScreenshotTitle: "Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ СЃРєСЂС–РЅС€РѕС‚Р° СѓРіРѕРґРё",
      uploadScreenshotText:
        "Р”РѕРґР°РІР°Р№С‚Рµ СЃРєСЂС–РЅС€РѕС‚Рё РіСЂР°С„С–РєС–РІ РґРѕ Р·Р±РµСЂРµР¶РµРЅРёС… СѓРіРѕРґ. SkillEdge AI РІРёРєРѕСЂРёСЃС‚РѕРІСѓРІР°С‚РёРјРµ С—С… РґР»СЏ Р°РЅР°Р»С–Р·Сѓ РІС…РѕРґС–РІ, РІРёС…РѕРґС–РІ, СЃС‚РѕРїС–РІ С– РїРѕРІС‚РѕСЂСЋРІР°РЅРёС… РїРѕРјРёР»РѕРє РЅР° РіСЂР°С„С–РєСѓ.",
      screenshotsCount: "СЃРєСЂС–РЅС€РѕС‚С–РІ",
      screenshotTradeLabel: "РЈРіРѕРґР°",
      screenshotFileLabel: "РЎРєСЂС–РЅС€РѕС‚",
      screenshotChoose: "Р’РёР±СЂР°С‚Рё СЃРєСЂС–РЅС€РѕС‚",
      screenshotNoFile: "Р¤Р°Р№Р» РЅРµ РІРёР±СЂР°РЅРѕ",
      screenshotSelected: "Р’РёР±СЂР°РЅРёР№ С„Р°Р№Р»",
      screenshotHint:
        "РљСЂРѕРєРё: 1) РћР±РµСЂС–С‚СЊ СѓРіРѕРґСѓ  2) РќР°С‚РёСЃРЅС–С‚СЊ В«Р’РёР±СЂР°С‚Рё СЃРєСЂС–РЅС€РѕС‚В»  3) РќР°С‚РёСЃРЅС–С‚СЊ В«Р—Р°РІР°РЅС‚Р°Р¶РёС‚РёВ»",
      screenshotUploadHintCompact:
        "Р—Р°РІР°РЅС‚Р°Р¶СѓР№ РІС–Рґ РѕРґРЅРѕРіРѕ РґРѕ С‚СЂСЊРѕС… СЃРєСЂС–РЅС–РІ Р· СЂС–Р·РЅРёРјРё С‚Р°Р№РјС„СЂРµР№РјР°РјРё РґР»СЏ РіР»РёР±С€РѕРіРѕ Р°РЅР°Р»С–Р·Сѓ.",
      screenshotFormats: "РџС–РґС‚СЂРёРјСѓРІР°РЅС– С„РѕСЂРјР°С‚Рё: PNG, JPG, WEBP",
      screenshotsColumn: "РЎРєСЂС–РЅРё",
      openScreenshots: "Р’С–РґРєСЂРёС‚Рё",
      noScreenshotsForTrade: "Р”Р»СЏ С†С–С”С— СѓРіРѕРґРё СЃРєСЂС–РЅРё РЅРµ Р·Р°РІР°РЅС‚Р°Р¶РµРЅС–.",
      screenshotViewerTitle: "РЎРєСЂС–РЅРё СѓРіРѕРґРё",
      loadingScreenshots: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ СЃРєСЂС–РЅРё...",
      uploadButton: "Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё",
      uploadingButton: "Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ...",
      selectTradePlaceholder: "РћР±РµСЂС–С‚СЊ СѓРіРѕРґСѓ",
      stepOne: "РљСЂРѕРє 1",
      stepTwo: "РљСЂРѕРє 2",
      stepThree: "РљСЂРѕРє 3",
      chartAnalyzeButton: "Р РѕР·С–Р±СЂР°С‚Рё РіСЂР°С„С–Рє",
      chartAnalyzingButton: "РђРЅР°Р»С–Р· РіСЂР°С„С–РєР°...",
      chartScreenshotsLabel: "СЃРєСЂС–РЅС€РѕС‚С–РІ",
      journalAnalysisTitle: "AI-Р°РЅР°Р»С–Р· Р¶СѓСЂРЅР°Р»Сѓ СѓРіРѕРґ",
      journalAnalysisText:
        "AI РїСЂРѕР°РЅР°Р»С–Р·СѓС” Р·Р±РµСЂРµР¶РµРЅС– СѓРіРѕРґРё, РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїРѕРјРёР»РєРё, СЃРµС‚Р°РїРё, РµРјРѕС†С–С—, СЂРёР·РёРє С– СЏРєС–СЃС‚СЊ РІРёРєРѕРЅР°РЅРЅСЏ.",
      journalAnalyzeButton: "Р РѕР·С–Р±СЂР°С‚Рё Р¶СѓСЂРЅР°Р»",
      journalAnalyzingButton: "РђРЅР°Р»С–Р·...",
      savedChartAnalysis: "Р—Р±РµСЂРµР¶РµРЅРёР№ AI-СЂРѕР·Р±С–СЂ РіСЂР°С„С–РєР°",
      showChartHistory: "РџРѕРєР°Р·Р°С‚Рё AI-СЂРѕР·Р±РѕСЂРё",
      hideChartHistory: "РЎС…РѕРІР°С‚Рё AI-СЂРѕР·Р±РѕСЂРё",
      noChartHistory: "Р—Р±РµСЂРµР¶РµРЅРёС… СЂРѕР·Р±РѕСЂС–РІ РіСЂР°С„С–РєР° С‰Рµ РЅРµРјР°С”.",
      searchTicker: "РџРѕС€СѓРє С‚РёРєРµСЂР°",
      allMarkets: "РЈСЃС– СЂРёРЅРєРё",
      allSides: "РЈСЃС– РЅР°РїСЂСЏРјРєРё",
      allResults: "РЈСЃС– СЂРµР·СѓР»СЊС‚Р°С‚Рё",
      marketLabels: {
        stocks: "РђРєС†С–С—",
        crypto: "РљСЂРёРїС‚Рѕ",
        futures: "Р¤вЂ™СЋС‡РµСЂСЃРё",
        forex: "Р¤РѕСЂРµРєСЃ",
        options: "РћРїС†С–РѕРЅРё",
      },
      directionLabels: {
        long: "Р›РѕРЅРі",
        short: "РЁРѕСЂС‚",
      },
      resultLabels: {
        win: "РџСЂРёР±СѓС‚РєРѕРІР°",
        loss: "Р—Р±РёС‚РєРѕРІР°",
        breakeven: "Р‘РµР·Р·Р±РёС‚РєРѕРІР°",
        notSet: "РќРµ Р·Р°РґР°РЅРѕ",
      },
      table: {
        date: "Р”Р°С‚Р°",
        ticker: "РўРёРєРµСЂ",
        market: "Р РёРЅРѕРє",
        side: "РЎС‚РѕСЂРѕРЅР°",
        entry: "Р’С…С–Рґ",
        exit: "Р’РёС…С–Рґ",
        stop: "РЎС‚РѕРї",
        risk: "Р РёР·РёРє",
        pnl: "PnL",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
      },
      recentTitle: "РћСЃС‚Р°РЅРЅС– СѓРіРѕРґРё",
      recentText:
        "РћСЃС‚Р°РЅРЅС– 3 СѓРіРѕРґРё Р· РѕСЃРѕР±РёСЃС‚РѕРіРѕ Р¶СѓСЂРЅР°Р»Сѓ. РџРѕРІРЅР° С‚Р°Р±Р»РёС†СЏ, С„С–Р»СЊС‚СЂРё С‚Р° РµРєСЃРїРѕСЂС‚ РґРѕСЃС‚СѓРїРЅС– РЅРёР¶С‡Рµ.",
      empty:
        "РЈРіРѕРґ РїРѕРєРё РЅРµРјР°С”. Р”РѕРґР°Р№С‚Рµ РїРµСЂС€Сѓ СѓРіРѕРґСѓ, С‰РѕР± РїРѕС‡Р°С‚Рё Р·Р±РёСЂР°С‚Рё Р±Р°Р·Сѓ СЃРІРѕС”С— СЃС‚Р°С‚РёСЃС‚РёРєРё.",
      tradesCount: "СѓРіРѕРґ",
      saving: "Р—Р±РµСЂС–РіР°С”РјРѕ...",
      save: "Р—Р±РµСЂРµРіС‚Рё СѓРіРѕРґСѓ",
      updateTradeButton: "РћРЅРѕРІРёС‚Рё СѓРіРѕРґСѓ",
      updatingTradeButton: "РћРЅРѕРІР»РµРЅРЅСЏ...",
      tickerRequired: "Р’РІРµРґС–С‚СЊ С‚РёРєРµСЂ.",
      tradeLimitReached: "Р”РѕСЃСЏРіРЅСѓС‚Рѕ Р»С–РјС–С‚ СѓРіРѕРґ РґР»СЏ РІР°С€РѕРіРѕ РїРѕС‚РѕС‡РЅРѕРіРѕ С‚Р°СЂРёС„Сѓ",
      tradeUsageTitle: "Р’РёРєРѕСЂРёСЃС‚Р°РЅРѕ СѓРіРѕРґ",
      tradesLeftLabel: "Р·Р°Р»РёС€РёР»РѕСЃСЊ",
      screenshotLimitReached: "Р”РѕСЃСЏРіРЅСѓС‚Рѕ Р»С–РјС–С‚ СЃРєСЂРёРЅС€РѕС‚С–РІ РґР»СЏ С†С–С”С— СѓРіРѕРґРё",
      screenshotUsageTitle: "Р’РёРєРѕСЂРёСЃС‚Р°РЅРѕ СЃРєСЂРёРЅС€РѕС‚С–РІ",
      limitReached: "Р”РѕСЃСЏРіРЅСѓС‚Рѕ Р»С–РјС–С‚ СѓРіРѕРґ РґР»СЏ РІР°С€РѕРіРѕ РїРѕС‚РѕС‡РЅРѕРіРѕ С‚Р°СЂРёС„Сѓ",
      loginFirst: "РЎРїРѕС‡Р°С‚РєСѓ СѓРІС–Р№РґС–С‚СЊ РІ Р°РєР°СѓРЅС‚.",
      saveFailed: "РќРµ РІРґР°Р»РѕСЃСЏ Р·Р±РµСЂРµРіС‚Рё СѓРіРѕРґСѓ.",
      fields: {
        ticker: "РўРёРєРµСЂ",
        date: "Р”Р°С‚Р°",
        market: "Р РёРЅРѕРє",
        direction: "РќР°РїСЂСЏРјРѕРє",
        entry: "Р’С…С–Рґ",
        exit: "Р’РёС…С–Рґ",
        stop: "РЎС‚РѕРї",
        size: "Р РѕР·РјС–СЂ РїРѕР·РёС†С–С—",
        risk: "Р РёР·РёРє $",
        pnl: "PnL $",
        result: "Р РµР·СѓР»СЊС‚Р°С‚",
        setup: "РЎРµС‚Р°Рї",
        emotion: "Р•РјРѕС†С–СЏ",
        mistake: "РџРѕРјРёР»РєР°",
        lesson: "РЈСЂРѕРє",
        notes: "РќРѕС‚Р°С‚РєРё",
      },
      placeholders: {
        ticker: "AAPL / BTC / NQ",
        entry: "100",
        exit: "105",
        stop: "98",
        size: "РђРєС†С–С— / РєРѕРЅС‚СЂР°РєС‚Рё",
        risk: "50",
        pnl: "-25 / 120",
        setup: "РїРѕРІРµСЂРЅРµРЅРЅСЏ VWAP / Р·РіР°СЃР°РЅРЅСЏ РіРµРїСѓ",
        emotion: "РЎРїРѕРєС–Р№ / FOMO / СЃС‚СЂР°С…",
        mistake: "Р©Рѕ Р±СѓР»Рѕ Р·СЂРѕР±Р»РµРЅРѕ РЅРµРїСЂР°РІРёР»СЊРЅРѕ?",
        lesson: "Р©Рѕ РїРѕС‚СЂС–Р±РЅРѕ Р·Р°РїР°РјКјСЏС‚Р°С‚Рё РЅР° РЅР°СЃС‚СѓРїРЅСѓ СѓРіРѕРґСѓ?",
        notes: "РљРѕРЅС‚РµРєСЃС‚, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂ, СЃС‚СЂС–С‡РєР°, СЂС–РІРЅС–...",
      },
      options: {
        notSet: "РќРµ Р·Р°РґР°РЅРѕ",
        win: "РџР»СЋСЃ",
        loss: "РњС–РЅСѓСЃ",
        breakeven: "Р‘РµР·Р·Р±РёС‚РѕРє",
      },
    },
    locked: {
      title: "РђРєС‚РёРІСѓР№С‚Рµ С‚Р°СЂРёС„",
      label: "Р”РѕСЃС‚СѓРї Р·Р°РєСЂРёС‚Рѕ",
      text: "РџС–СЃР»СЏ РѕРїР»Р°С‚Рё РІС–РґРєСЂРёСЋС‚СЊСЃСЏ Р¶СѓСЂРЅР°Р» СѓРіРѕРґ, SkillEdge AI-РєРѕСѓС‡, РіСЂР°С„С–РєРё TradingView, РЅР°РІС‡Р°РЅРЅСЏ, Р·РІС–С‚Рё С‚Р° С–СЃС‚РѕСЂС–СЏ AI-СЂРѕР·Р±РѕСЂС–РІ.",
      button: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
    },
    tabs: {
      overview: "РћРіР»СЏРґ",
      journal: "Р–СѓСЂРЅР°Р» СѓРіРѕРґ",
      charts: "Р“СЂР°С„С–РєРё",
      market: "Р РёРЅРѕРє",
      alerts: "РЎРёРіРЅР°Р»Рё",
      coach: "AI-РєРѕСѓС‡",
      learning: "РќР°РІС‡Р°РЅРЅСЏ",
      reports: "Р—РІС–С‚Рё",
      billing: "РћРїР»Р°С‚Р°",
    },
    periods: {
      monthly: "1 РјС–СЃСЏС†СЊ",
      halfyear: "6 РјС–СЃСЏС†С–РІ",
      yearly: "1 СЂС–Рє",
      demo: "7-РґРµРЅРЅР° РїСЂРѕР±РЅР° РІРµСЂСЃС–СЏ",
    },
    demo: {
      label: "РџСЂРѕР±РЅР° РІРµСЂСЃС–СЏ",
      title: "РЈ РІР°СЃ Р°РєС‚РёРІРѕРІР°РЅРѕ 7-РґРµРЅРЅРёР№ РїСЂРѕР±РЅРёР№ РґРѕСЃС‚СѓРї",
      text:
        "Р¦Рµ РїСЂРѕР±РЅР° РІРµСЂСЃС–СЏ С‚Р°СЂРёС„Сѓ SkillEdge Core Р· Р»С–РјС–С‚РѕРј 10 AI-Р·Р°РїРёС‚С–РІ. РџС–СЃР»СЏ Р·Р°РІРµСЂС€РµРЅРЅСЏ РїСЂРѕР±РЅРѕРіРѕ РїРµСЂС–РѕРґСѓ РґРѕСЃС‚СѓРї Р±СѓРґРµ Р·Р°РєСЂРёС‚Рѕ, СЏРєС‰Рѕ РІРё РЅРµ РѕР±РµСЂРµС‚Рµ РѕСЃРЅРѕРІРЅРёР№ С‚Р°СЂРёС„.",
      short: "7-РґРµРЅРЅР° РїСЂРѕР±РЅР° РІРµСЂСЃС–СЏ. Р›С–РјС–С‚: 10 AI-Р·Р°РїРёС‚С–РІ.",
    },
    billing: {
      title: "РўР°СЂРёС„ С– РѕРїР»Р°С‚Р°",
      text: "Р†РЅС„РѕСЂРјР°С†С–СЏ РїСЂРѕ РїРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„, РѕРїР»Р°С‚Рё С‚Р° СЃС‚СЂРѕРє РґС–С— РїС–РґРїРёСЃРєРё.",
      activePlan: "РўР°СЂРёС„ Р°РєС‚РёРІРЅРёР№",
      inactivePlan: "РўР°СЂРёС„ РЅРµ Р°РєС‚РёРІРѕРІР°РЅРѕ",
      period: "РџРµСЂС–РѕРґ",
      validUntil: "Р”С–С” РґРѕ",
      empty:
        "РџС–СЃР»СЏ РѕРїР»Р°С‚Рё С‚СѓС‚ Р·КјСЏРІР»СЏС‚СЊСЃСЏ РїР»Р°РЅ, РїРµСЂС–РѕРґ, РґР°С‚Р° Р·Р°РІРµСЂС€РµРЅРЅСЏ С‚Р° С–СЃС‚РѕСЂС–СЏ РїР»Р°С‚РµР¶С–РІ.",
      currentPlan: "РџРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„",
      creatingCheckout: "РЎС‚РІРѕСЂСЋС”РјРѕ РѕРїР»Р°С‚Сѓ...",
      checkoutError: "РќРµ РІРґР°Р»РѕСЃСЏ СЃС‚РІРѕСЂРёС‚Рё РєСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Сѓ. РЎРїСЂРѕР±СѓР№С‚Рµ С‰Рµ СЂР°Р·.",
      loginRequiredForPayment: "РЈРІС–Р№РґС–С‚СЊ РІ Р°РєР°СѓРЅС‚ РїРµСЂРµРґ РѕРїР»Р°С‚РѕСЋ С‚Р°СЂРёС„Сѓ.",
      currentPlanLabel: "РџРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„",
      activeSubscription:
        "РџС–РґРїРёСЃРєР° Р°РєС‚РёРІРЅР°. Р›С–РјС–С‚Рё С‚Р° РґРѕСЃС‚СѓРїРё Р·Р°СЃС‚РѕСЃРѕРІСѓСЋС‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ.",
      inactiveSubscription:
        "РџС–РґРїРёСЃРєР° РЅРµ Р°РєС‚РёРІРЅР°. Р”РµСЏРєС– С„СѓРЅРєС†С–С— РјРѕР¶СѓС‚СЊ Р±СѓС‚Рё РЅРµРґРѕСЃС‚СѓРїРЅС–.",
      active: "РђРєС‚РёРІРЅР°",
      inactive: "РќРµР°РєС‚РёРІРЅР°",
      billingPeriod: "РџРµСЂС–РѕРґ",
      aiUsage: "Р’РёРєРѕСЂРёСЃС‚Р°РЅРЅСЏ AI",
      billingNoteLabel: "Р’Р°Р¶Р»РёРІРѕ",
      billingNoteText:
        "Р РѕР·РґС–Р» РѕРїР»Р°С‚Рё РїРѕРєР°Р·СѓС” РїРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„, Р»С–РјС–С‚Рё, СЂС–РІРµРЅСЊ РґРѕСЃС‚СѓРїСѓ С‚Р° СЃС‚Р°С‚СѓСЃ РїС–РґРїРёСЃРєРё. РћРїР»Р°С‚Р° РєР°СЂС‚РєРѕСЋ РіРѕС‚СѓС”С‚СЊСЃСЏ С‡РµСЂРµР· РїРѕРіРѕРґР¶РµРЅРѕРіРѕ РїР»Р°С‚С–Р¶РЅРѕРіРѕ РїСЂРѕРІР°Р№РґРµСЂР°, Р° РєСЂРёРїС‚Рѕ-РґРѕСЃС‚СѓРї РґРѕСЃС‚СѓРїРЅРёР№ РЅР° РµС‚Р°РїС– Р·Р°РїСѓСЃРєСѓ.",
      currentLimitsLabel: "Р›С–РјС–С‚Рё",
      currentLimitsTitle: "Р©Рѕ РІС…РѕРґРёС‚СЊ Сѓ РїРѕС‚РѕС‡РЅРёР№ С‚Р°СЂРёС„",
      aiCoachLimit: "AI-РєРѕСѓС‡ / РјС–СЃСЏС†СЊ",
      journalAiLimit: "AI-Р°РЅР°Р»С–Р· Р¶СѓСЂРЅР°Р»Сѓ / РјС–СЃСЏС†СЊ",
      chartAiLimit: "AI-Р°РЅР°Р»С–Р· РіСЂР°С„С–РєР° / РјС–СЃСЏС†СЊ",
      aiReportsLimit: "AI-Р·РІС–С‚Рё / РјС–СЃСЏС†СЊ",
      maxTradesLimit: "РњР°РєСЃРёРјСѓРј СѓРіРѕРґ",
      screenshotsLimit: "РЎРєСЂС–РЅС€РѕС‚С–РІ РЅР° СѓРіРѕРґСѓ",
      aiReportsAccess: "AI-Р·РІС–С‚Рё",
      supportAssistantAccess: "РџРѕРјС–С‡РЅРёРє РїС–РґС‚СЂРёРјРєРё",
      socialTickersAccess: "РЎРѕС†С–Р°Р»СЊРЅС– С‚РёРєРµСЂРё",
      aiScannerAccess: "AI-СЃРєР°РЅРµСЂ",
      aiAlertsAccess: "AI-СЃРёРіРЅР°Р»Рё",
      premiumChartAccess: "РџСЂРµРјС–СѓРј-Р°РЅР°Р»С–Р· РіСЂР°С„С–РєР°",
      exportReportsAccess: "Р•РєСЃРїРѕСЂС‚ Р·РІС–С‚С–РІ",
      included: "РЈРІС–РјРєРЅРµРЅРѕ",
      locked: "Р—Р°РєСЂРёС‚Рѕ",
      comparePlansLabel: "РџРѕСЂС–РІРЅСЏРЅРЅСЏ",
      comparePlansTitle: "РџРѕСЂС–РІРЅСЏРЅРЅСЏ С‚Р°СЂРёС„С–РІ",
      comparePlansText:
        "РџРµСЂРµРІС–СЂ, С‰Рѕ РєР»С–С”РЅС‚ С‡С–С‚РєРѕ Р±Р°С‡РёС‚СЊ СЂС–Р·РЅРёС†СЋ РјС–Р¶ Core, Edge С‚Р° Elite.",
      current: "РџРѕС‚РѕС‡РЅРёР№",
      choosePlan: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
      planDescriptions: {
        core: "Р‘Р°Р·РѕРІРёР№ РґРѕСЃС‚СѓРї РґР»СЏ Р¶СѓСЂРЅР°Р»Сѓ СѓРіРѕРґ, СЃРєСЂС–РЅС€РѕС‚С–РІ, AI-РєРѕСѓС‡Р° С‚Р° РєРѕРЅС‚СЂРѕР»СЋ РґРёСЃС†РёРїР»С–РЅРё.",
        edge: "РџСЂРѕСЃСѓРЅСѓС‚РёР№ С‚Р°СЂРёС„ РґР»СЏ Р°РєС‚РёРІРЅРёС… С‚СЂРµР№РґРµСЂС–РІ: Р±С–Р»СЊС€Рµ AI-Р·Р°РїРёС‚С–РІ, Р·РІС–С‚Рё, СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР° С‚Р° AI-СЃРєР°РЅРµСЂ.",
        elite:
          "РњР°РєСЃРёРјР°Р»СЊРЅРёР№ С‚Р°СЂРёС„: AI-СЃРёРіРЅР°Р»Рё, РїР»Р°РІР°СЋС‡РёР№ РІС–РґР¶РµС‚ СЃРёРіРЅР°Р»С–РІ, Р·РІвЂ™СЏР·РєР° СЃРёРіРЅР°Р»С–РІ С–Р· Р¶СѓСЂРЅР°Р»РѕРј С– РїРѕРІРЅРёР№ AI Trading Desk.",
      },
    },
    aiLimits: {
      reachedTitle: "Р›С–РјС–С‚ AI РІРёС‡РµСЂРїР°РЅРѕ",
      reachedText:
        "Р’Рё РІРёРєРѕСЂРёСЃС‚Р°Р»Рё РІСЃС– AI-Р·Р°РїРёС‚Рё, РґРѕСЃС‚СѓРїРЅС– Сѓ РІР°С€РѕРјСѓ РїРѕС‚РѕС‡РЅРѕРјСѓ С‚Р°СЂРёС„С– С†СЊРѕРіРѕ РјС–СЃСЏС†СЏ. РћРЅРѕРІС–С‚СЊ С‚Р°СЂРёС„ Р°Р±Рѕ РґРѕС‡РµРєР°Р№С‚РµСЃСЏ РЅР°СЃС‚СѓРїРЅРѕРіРѕ РјС–СЃСЏС‡РЅРѕРіРѕ СЃРєРёРґР°РЅРЅСЏ.",
      remainingPrefix: "Р—Р°Р»РёС€РёР»РѕСЃСЊ AI-Р·Р°РїРёС‚С–РІ",
    },
    coach: {
      title: "AI-РєРѕСѓС‡",
      text: "РћРїРёС€С–С‚СЊ СѓРіРѕРґСѓ, РµРјРѕС†С–С—, РїРѕРјРёР»РєСѓ Р°Р±Рѕ С‚РѕСЂРіРѕРІСѓ СЃРёС‚СѓР°С†С–СЋ вЂ” AI-РєРѕСѓС‡ Р·СЂРѕР±РёС‚СЊ СЂРѕР·Р±С–СЂ РґРёСЃС†РёРїР»С–РЅРё, СЂРёР·РёРєСѓ С‚Р° СЏРєРѕСЃС‚С– СЂС–С€РµРЅРЅСЏ.",
      reviewTitle: "Р РѕР·Р±С–СЂ СѓРіРѕРґРё",
      reviewText:
        "Р§РёРј РєРѕРЅРєСЂРµС‚РЅС–С€РёР№ РѕРїРёСЃ, С‚РёРј РєРѕСЂРёСЃРЅС–С€Р° РІС–РґРїРѕРІС–РґСЊ. Р’РєР°Р¶С–С‚СЊ С‚РёРєРµСЂ, РІС…С–Рґ, СЃС‚РѕРї, РїСЂРёС‡РёРЅСѓ РІС…РѕРґСѓ, РµРјРѕС†С–С— С‚Р° СЂРµР·СѓР»СЊС‚Р°С‚.",
      placeholder:
        "РџСЂРёРєР»Р°Рґ: СЃСЊРѕРіРѕРґРЅС– Р·Р°Р№С€РѕРІ Сѓ С€РѕСЂС‚ РїС–СЃР»СЏ РїСЂРµРјР°СЂРєРµС‚-РїР°РјРїСѓ, РїРѕР±Р°С‡РёРІ СЃР»Р°Р±РєС–СЃС‚СЊ РїС–Рґ VWAP, Р°Р»Рµ РїРµСЂРµСЃСѓРЅСѓРІ СЃС‚РѕРї С– РїРµСЂРµСЃРёРґС–РІ Р·Р±РёС‚РѕРє. Р РѕР·Р±РµСЂРё, РґРµ Р±СѓР»Р° РїРѕРјРёР»РєР°.",
      ask: "Р—Р°РїРёС‚Р°С‚Рё AI",
      analyzing: "AI Р°РЅР°Р»С–Р·СѓС”...",
      newReview: "РќРѕРІРёР№ СЂРѕР·Р±С–СЂ",
      answerTitle: "Р’С–РґРїРѕРІС–РґСЊ AI-РєРѕСѓС‡Р°",
      answerPlaceholder:
        "РўСѓС‚ Р·КјСЏРІРёС‚СЊСЃСЏ СЂРѕР·Р±С–СЂ: С‰Рѕ Р±СѓР»Рѕ РґРѕР±СЂРµ, РґРµ РїРѕРјРёР»РєР°, СЏРєРёР№ СѓСЂРѕРє Р·Р°РїРёСЃР°С‚Рё РІ Р¶СѓСЂРЅР°Р» С– С‰Рѕ РїРµСЂРµРІС–СЂРёС‚Рё РїРµСЂРµРґ РЅР°СЃС‚СѓРїРЅРѕСЋ СѓРіРѕРґРѕСЋ.",
      historyTitle: "Р†СЃС‚РѕСЂС–СЏ AI-СЂРѕР·Р±РѕСЂС–РІ",
      historyText: "РћСЃС‚Р°РЅРЅС– 10 Р·Р°РїРёС‚С–РІ РґРѕ AI-РєРѕСѓС‡Р°.",
      historyEmpty: "Р†СЃС‚РѕСЂС–СЏ РїРѕРєРё РїРѕСЂРѕР¶РЅСЏ. РџРµСЂС€РёР№ СЂРѕР·Р±С–СЂ Р·КјСЏРІРёС‚СЊСЃСЏ С‚СѓС‚ РїС–СЃР»СЏ РІС–РґРїРѕРІС–РґС– AI.",
      loginFirst: "РЎРїРѕС‡Р°С‚РєСѓ СѓРІС–Р№РґС–С‚СЊ РІ Р°РєР°СѓРЅС‚.",
      messageRequired: "Р’РІРµРґС–С‚СЊ РїРёС‚Р°РЅРЅСЏ Р°Р±Рѕ РѕРїРёСЃ СѓРіРѕРґРё.",
      coachError: "РџРѕРјРёР»РєР° AI-РєРѕСѓС‡Р°.",
      error: "РџРѕРјРёР»РєР° Р·Р°РїРёС‚Сѓ РґРѕ AI-РєРѕСѓС‡Р°.",
      failed: "РќРµ РІРґР°Р»РѕСЃСЏ РѕС‚СЂРёРјР°С‚Рё РІС–РґРїРѕРІС–РґСЊ AI-РєРѕСѓС‡Р°.",
      needPlan: "Р”Р»СЏ AI-РєРѕСѓС‡Р° РїРѕС‚СЂС–Р±РµРЅ Р°РєС‚РёРІРЅРёР№ С‚Р°СЂРёС„ Р°Р±Рѕ РїСЂРѕР±РЅРёР№ РґРѕСЃС‚СѓРї.",
      limitReached:
        "Р›С–РјС–С‚ AI-Р·Р°РїРёС‚С–РІ Р·Р°РєС–РЅС‡РёРІСЃСЏ. РћР±РµСЂС–С‚СЊ С‚Р°СЂРёС„ РІРёС‰Рµ Р°Р±Рѕ РґРѕС‡РµРєР°Р№С‚РµСЃСЏ РѕРЅРѕРІР»РµРЅРЅСЏ Р»С–РјС–С‚Сѓ.",
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
  monthly: "1 РјРµСЃСЏС†",
  halfyear: "6 РјРµСЃСЏС†РµРІ",
  yearly: "1 РіРѕРґ",
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
    return "вЂ”";
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
  useEffect(() => {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");

  if (
    requestedTab === "alerts" ||
    requestedTab === "signals" ||
    requestedTab === "ai-alerts"
  ) {
    setActiveTab("alerts");
  }
}, []);
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
        ? `${entryMin}вЂ“${entryMax}`
        : "wait trigger"
    }`,
    `Stop: ${alert.stop_price || "вЂ”"}`,
    `Targets: ${targets || "вЂ”"}`,
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
      label: isMarket ? "РџРѕС‚СЂС–Р±РµРЅ Edge" : "РџРѕС‚СЂС–Р±РµРЅ Elite",
      title: isMarket
        ? "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР° РІС–РґРєСЂРёРІР°С”С‚СЊСЃСЏ Р· SkillEdge Edge."
        : "AI-СЃРёРіРЅР°Р»Рё РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РЅР° SkillEdge Elite.",
      text: isMarket
        ? "РќР° Core РґРѕСЃС‚СѓРїРЅРёР№ Р»РёС€Рµ РїРѕРїРµСЂРµРґРЅС–Р№ РїРµСЂРµРіР»СЏРґ. SkillEdge Edge С‚Р° Elite РІС–РґРєСЂРёРІР°СЋС‚СЊ AI-СЃРєР°РЅРµСЂ, СЂРёРЅРєРѕРІСѓ СЂРѕР·РІС–РґРєСѓ, СЂРёРЅРєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚, РІС–РґСЃС‚РµР¶СѓРІР°РЅСѓ СѓРІР°РіСѓ С‚Р° AI-РѕРіР»СЏРґ СЂРёРЅРєСѓ."
        : "SkillEdge Edge РІС–РґРєСЂРёРІР°С” AI-СЃРєР°РЅРµСЂ С– СЂРёРЅРєРѕРІСѓ СЂРѕР·РІС–РґРєСѓ, Р°Р»Рµ AI-СЃРёРіРЅР°Р»Рё РІ СЂРµР°Р»СЊРЅРѕРјСѓ С‡Р°СЃС–, РїР»Р°РІР°СЋС‡РёР№ РІС–РґР¶РµС‚, Р·РІвЂ™СЏР·РєР° СЃРёРіРЅР°Р»С–РІ С–Р· Р¶СѓСЂРЅР°Р»РѕРј С‚Р° РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С… РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РІ Elite.",
      button: isMarket ? "РџРµСЂРµР№С‚Рё РЅР° Edge" : "РџРµСЂРµР№С‚Рё РЅР° Elite",
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
    label: isMarket ? "РќСѓР¶РµРЅ Edge" : "РќСѓР¶РµРЅ Elite",
    title: isMarket
      ? "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ СЃ SkillEdge Edge."
      : "AI-СЃРёРіРЅР°Р»С‹ РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РЅР° SkillEdge Elite.",
    text: isMarket
      ? "РќР° Core РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ РїСЂРѕСЃРјРѕС‚СЂ. SkillEdge Edge Рё Elite РѕС‚РєСЂС‹РІР°СЋС‚ AI-СЃРєР°РЅРµСЂ, СЂС‹РЅРѕС‡РЅСѓСЋ СЂР°Р·РІРµРґРєСѓ, СЂС‹РЅРѕС‡РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚, РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ Рё AI-РѕР±Р·РѕСЂ СЂС‹РЅРєР°."
      : "SkillEdge Edge РѕС‚РєСЂС‹РІР°РµС‚ AI-СЃРєР°РЅРµСЂ Рё СЂС‹РЅРѕС‡РЅСѓСЋ СЂР°Р·РІРµРґРєСѓ, РЅРѕ AI-СЃРёРіРЅР°Р»С‹ РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё, РїР»Р°РІР°СЋС‰РёР№ РІРёРґР¶РµС‚, СЃРІСЏР·РєР° СЃРёРіРЅР°Р»РѕРІ СЃ Р¶СѓСЂРЅР°Р»РѕРј Рё РѕР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С… РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РІ Elite.",
    button: isMarket ? "РџРµСЂРµР№С‚Рё РЅР° Edge" : "РџРµСЂРµР№С‚Рё РЅР° Elite",
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
    ? `${getPeriodName(subscription, t)} В· ${t.billing.validUntil} ${formatDate(
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
        вњ• {t.journal.close}
      </button>

      <EquityCurveCard trades={trades} t={t} />
    </div>
  </div>
)}

    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "вЂ”";

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
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`group w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
        disabled
          ? "cursor-not-allowed border-white/8 bg-white/[0.025] text-white/25"
          : "border-[rgba(198,226,255,0.14)] bg-white/[0.055] text-white/76 hover:-translate-y-0.5 hover:border-cyan-200/28 hover:bg-cyan-200/[0.08] hover:text-white"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="text-white/30 transition group-hover:text-cyan-100">
          в†’
        </span>
      </span>
    </button>
  );
}

function formatExecutionNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "вЂ”";
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
  if (trade.exit_price === null) return "вЂ”";

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
  if (targetHit !== "вЂ”" && targetHit !== "NO_TARGET") adherenceScore += 15;
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
    linkedTrade: "РЎРґРµР»РєР° СЃРІСЏР·Р°РЅР° СЃ СЃРёРіРЅР°Р»РѕРј",
    defaultSignal: "РЎРёРіРЅР°Р» SkillEdge AI",
    alertConfidence: "РЈРІРµСЂРµРЅРЅРѕСЃС‚СЊ СЃРёРіРЅР°Р»Р°",
    entryQuality: "РљР°С‡РµСЃС‚РІРѕ РІС…РѕРґР°",
    noPlanZone: "РќРµС‚ РїР»Р°РЅРѕРІРѕР№ Р·РѕРЅС‹",
    inZone: "Р’ Р·РѕРЅРµ",
    outsideZone: "Р’РЅРµ Р·РѕРЅС‹",
    plan: "РџР»Р°РЅ",
    stopAdherence: "РЎР»РµРґРѕРІР°РЅРёРµ СЃС‚РѕРїСѓ",
    noStopData: "РќРµС‚ РґР°РЅРЅС‹С… РїРѕ СЃС‚РѕРїСѓ",
    matched: "РЎРѕРІРїР°РґР°РµС‚",
    different: "РћС‚Р»РёС‡Р°РµС‚СЃСЏ",
    targetResult: "Р РµР·СѓР»СЊС‚Р°С‚ РїРѕ С†РµР»СЏРј",
    noTarget: "Р¦РµР»СЊ РЅРµ РґРѕСЃС‚РёРіРЅСѓС‚Р°",
    direction: "РќР°РїСЂР°РІР»РµРЅРёРµ",
    trade: "РЎРґРµР»РєР°",
    strongExecution: "РЎРёР»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ",
    acceptableExecution: "РџСЂРёРµРјР»РµРјРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ",
    weakExecution: "РЎР»Р°Р±РѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ",
    planBroken: "РџР»Р°РЅ РЅР°СЂСѓС€РµРЅ",
    strongText:
      "РўС‹ С…РѕСЂРѕС€Рѕ СЃР»РµРґРѕРІР°Р» РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Р°. РўР°РєРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ SkillEdge AI РґРѕР»Р¶РµРЅ РѕС‚СЃР»РµР¶РёРІР°С‚СЊ РєР°Рє Р»РёС‡РЅСѓСЋ СЃРёР»СЊРЅСѓСЋ СЃС‚РѕСЂРѕРЅСѓ.",
    mediumText:
      "РСЃРїРѕР»РЅРµРЅРёРµ Р±С‹Р»Рѕ РїСЂРёРµРјР»РµРјС‹Рј, РЅРѕ СЃС‚РѕРёС‚ СЂР°Р·РѕР±СЂР°С‚СЊ С‚Р°Р№РјРёРЅРі РІС…РѕРґР°, РїРѕСЃС‚Р°РЅРѕРІРєСѓ СЃС‚РѕРїР° Рё СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ С†РµР»РµР№.",
    weakText:
      "РСЃРїРѕР»РЅРµРЅРёРµ, РІРµСЂРѕСЏС‚РЅРѕ, РѕС‚РєР»РѕРЅРёР»РѕСЃСЊ РѕС‚ РёСЃС…РѕРґРЅРѕРіРѕ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°. РџСЂРѕРІРµСЂСЊ, РЅРµ РІРѕС€С‘Р» Р»Рё С‚С‹ РїРѕР·РґРЅРѕ, РЅРµ РёР·РјРµРЅРёР» Р»Рё СЃС‚РѕРї РёР»Рё РЅРµ РїСЂРѕРёРіРЅРѕСЂРёСЂРѕРІР°Р» РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ.",
  },

  ua: {
    linkedTrade: "РЈРіРѕРґР° РїРѕРІвЂ™СЏР·Р°РЅР° С–Р· СЃРёРіРЅР°Р»РѕРј",
    defaultSignal: "РЎРёРіРЅР°Р» SkillEdge AI",
    alertConfidence: "Р’РїРµРІРЅРµРЅС–СЃС‚СЊ СЃРёРіРЅР°Р»Сѓ",
    entryQuality: "РЇРєС–СЃС‚СЊ РІС…РѕРґСѓ",
    noPlanZone: "РќРµРјР°С” РїР»Р°РЅРѕРІРѕС— Р·РѕРЅРё",
    inZone: "РЈ Р·РѕРЅС–",
    outsideZone: "РџРѕР·Р° Р·РѕРЅРѕСЋ",
    plan: "РџР»Р°РЅ",
    stopAdherence: "Р”РѕС‚СЂРёРјР°РЅРЅСЏ СЃС‚РѕРїР°",
    noStopData: "РќРµРјР°С” РґР°РЅРёС… РїРѕ СЃС‚РѕРїСѓ",
    matched: "Р—Р±С–РіР°С”С‚СЊСЃСЏ",
    different: "Р’С–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ",
    targetResult: "Р РµР·СѓР»СЊС‚Р°С‚ РїРѕ С†С–Р»СЏС…",
    noTarget: "Р¦С–Р»СЊ РЅРµ РґРѕСЃСЏРіРЅСѓС‚Р°",
    direction: "РќР°РїСЂСЏРјРѕРє",
    trade: "РЈРіРѕРґР°",
    strongExecution: "РЎРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ",
    acceptableExecution: "РџСЂРёР№РЅСЏС‚РЅРµ РІРёРєРѕРЅР°РЅРЅСЏ",
    weakExecution: "РЎР»Р°Р±РєРµ РІРёРєРѕРЅР°РЅРЅСЏ",
    planBroken: "РџР»Р°РЅ РїРѕСЂСѓС€РµРЅРѕ",
    strongText:
      "РўРё РґРѕР±СЂРµ РґРѕС‚СЂРёРјР°РІСЃСЏ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ. РўР°РєРµ РІРёРєРѕРЅР°РЅРЅСЏ SkillEdge AI РјР°С” РІС–РґСЃС‚РµР¶СѓРІР°С‚Рё СЏРє РѕСЃРѕР±РёСЃС‚Сѓ СЃРёР»СЊРЅСѓ СЃС‚РѕСЂРѕРЅСѓ.",
    mediumText:
      "Р’РёРєРѕРЅР°РЅРЅСЏ Р±СѓР»Рѕ РїСЂРёР№РЅСЏС‚РЅРёРј, Р°Р»Рµ РІР°СЂС‚Рѕ СЂРѕР·С–Р±СЂР°С‚Рё С‚Р°Р№РјС–РЅРі РІС…РѕРґСѓ, РїРѕСЃС‚Р°РЅРѕРІРєСѓ СЃС‚РѕРїР° С‚Р° СЃСѓРїСЂРѕРІС–Рґ С†С–Р»РµР№.",
    weakText:
      "Р’РёРєРѕРЅР°РЅРЅСЏ, Р№РјРѕРІС–СЂРЅРѕ, РІС–РґС…РёР»РёР»РѕСЃСЏ РІС–Рґ РїРѕС‡Р°С‚РєРѕРІРѕРіРѕ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ. РџРµСЂРµРІС–СЂ, С‡Рё РЅРµ СѓРІС–Р№С€РѕРІ С‚Рё РїС–Р·РЅРѕ, С‡Рё РЅРµ Р·РјС–РЅРёРІ СЃС‚РѕРї Р°Р±Рѕ РЅРµ РїСЂРѕС–РіРЅРѕСЂСѓРІР°РІ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ.",
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
    : t.dashboard === "РћСЃРѕР±РёСЃС‚РёР№ РєР°Р±С–РЅРµС‚"
      ? "ua"
      : "ru";

const signalCopy = signalLinkedTradeCopy[journalLanguage];


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
  if (!value) return "вЂ”";

  const key = value.toLowerCase() as keyof typeof t.journal.marketLabels;

  return t.journal.marketLabels[key] ?? value;
}

function getDirectionLabel(value: string | null | undefined) {
  if (!value) return "вЂ”";

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
            {screenshotViewerTrade.trade_date || "вЂ”"}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCloseScreenshotViewer}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Г—
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
    value={winRate === null ? "вЂ”" : `${winRate}%`}
  />

  <MetricCard
    label={t.journal.avgPnl}
    value={
      averagePnl === null
        ? "вЂ”"
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
  value={bestTrade === null ? "вЂ”" : `$${bestTrade.toFixed(2)}`}
/>

<MetricCard
  label={t.journal.worstTrade}
  value={
    worstTrade === null
      ? "вЂ”"
      : `${worstTrade < 0 ? "-$" : "$"}${Math.abs(worstTrade).toFixed(2)}`
  }
/>

<MetricCard
  label={t.journal.profitFactor}
  value={profitFactor === null ? "вЂ”" : profitFactor.toFixed(2)}
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
        {trade.pnl === null ? "вЂ”" : `$${trade.pnl}`}
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
              {trade.alert_confidence_score ?? "вЂ”"}
              {trade.alert_confidence_tier
                ? ` В· ${trade.alert_confidence_tier}`
                : ""}
            </div>
          </div>

          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {executionReview.adherenceScore}/100 В·{" "}
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
                  )}вЂ“${formatExecutionNumber(trade.alert_entry_zone_max)}`
                : "вЂ”"}
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
    {t.journal.cardLabels.entry}: {trade.entry_price ?? "вЂ”"}
  </div>
  <div>
    {t.journal.cardLabels.exit}: {trade.exit_price ?? "вЂ”"}
  </div>
  <div>
    {t.journal.cardLabels.stop}: {trade.stop_loss ?? "вЂ”"}
  </div>
  <div>
    {t.journal.cardLabels.risk}:{" "}
    {trade.risk_amount === null ? "вЂ”" : `$${trade.risk_amount}`}
  </div>
  <div>
    {t.journal.cardLabels.result}: {getResultLabel(trade.result)}
  </div>
  <div>
    {t.journal.cardLabels.setup}: {trade.setup ?? "вЂ”"}
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
                    <td className="py-4 pr-4">{trade.entry_price ?? "вЂ”"}</td>
                    <td className="py-4 pr-4">{trade.exit_price ?? "вЂ”"}</td>
                    <td className="py-4 pr-4">{trade.stop_loss ?? "вЂ”"}</td>
                    <td className="py-4 pr-4">
                      {trade.risk_amount === null ? "вЂ”" : `$${trade.risk_amount}`}
                    </td>
                    <td className="py-4 pr-4 font-semibold">
                      {trade.pnl === null ? "вЂ”" : `$${trade.pnl}`}
                    </td>
                    <td className="py-4 pr-4">{getResultLabel(trade.result)}</td>
                    <td className="py-4 pr-4">{trade.setup ?? "вЂ”"}</td>
                    <td className="py-5 pr-4">
  {(() => {
    const screenshotsCount = tradeScreenshots.filter(
      (screenshot) => screenshot.trade_id === trade.id
    ).length;

    if (screenshotsCount === 0) {
      return <span className="text-white/35">вЂ”</span>;
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
    if (sentiment === "bullish") return "Р‘РёС‡Р°С‡РёР№";
    if (sentiment === "bearish") return "Р’РµРґРјРµР¶РёР№";
    return "РќРµР№С‚СЂР°Р»СЊРЅРёР№";
  }

  if (sentiment === "bullish") return "Р‘С‹С‡РёР№";
  if (sentiment === "bearish") return "РњРµРґРІРµР¶РёР№";
  return "РќРµР№С‚СЂР°Р»СЊРЅС‹Р№";
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
    socialTitle: "Tracked attention вЂ” 24H",
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
    title: "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°",
    text: "РЎР»РѕР№ Р°РЅР°Р»РёР·Р° СЂС‹РЅРєР° РґР»СЏ Р°РєС†РёР№ Рё РєСЂРёРїС‚С‹: Р»РёРґРµСЂС‹ РґРІРёР¶РµРЅРёСЏ, Р°РЅРѕРјР°Р»СЊРЅС‹Р№ РѕР±СЉС‘Рј, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹, РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ Рё СЂРµР№С‚РёРЅРі РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№.",
    lockedTitle: "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР° РґРѕСЃС‚СѓРїРЅР° РЅР° SkillEdge Edge Рё Elite.",
    lockedText:
      "РќР° Core РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ РїСЂРѕСЃРјРѕС‚СЂ. РџРµСЂРµР№РґРёС‚Рµ РЅР° Edge РёР»Рё Elite, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚С‹ СЃРєР°РЅРµСЂР°, СЂРµР№С‚РёРЅРі РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№, РґР°РЅРЅС‹Рµ РїРѕ РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРјСѓ РІРЅРёРјР°РЅРёСЋ Рё РїРѕРёСЃРє Р°РєС‚РёРІРЅС‹С… С‚РёРєРµСЂРѕРІ.",
    refresh: "РћР±РЅРѕРІРёС‚СЊ СЃРєР°РЅРµСЂ",
    refreshing: "РЎРєР°РЅРёСЂСѓРµРј...",
    source: "РСЃС‚РѕС‡РЅРёРє",
    scanned: "РџСЂРѕРІРµСЂРµРЅРѕ",
    pumpWatch: "РџР°РјРї-РєР°РЅРґРёРґР°С‚С‹",
    dumpWatch: "Р”Р°РјРї-РєР°РЅРґРёРґР°С‚С‹",
    unusualVolume: "РђРЅРѕРјР°Р»СЊРЅС‹Р№ РѕР±СЉС‘Рј",
    catalystWatch: "РљР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹",
    all: "Р’СЃРµ",
    filters: "Р¤РёР»СЊС‚СЂС‹",
    allBuckets: "Р’СЃРµ РєР°С‚РµРіРѕСЂРёРё",
    stocks: "РђРєС†РёРё",
    crypto: "РљСЂРёРїС‚Рѕ",
    search: "РџРѕРёСЃРє С‚РёРєРµСЂР°...",
    score: "Р РµР№С‚РёРЅРі",
    change: "Р”РІРёР¶РµРЅРёРµ",
    volume: "РћР±СЉС‘Рј",
    mentions: "РћС‚СЃР»РµР¶РёРІР°РµРјС‹Рµ СѓРїРѕРјРёРЅР°РЅРёСЏ",
    sentiment: "РќР°СЃС‚СЂРѕРµРЅРёРµ",
    risk: "Р РёСЃРє",
    noData: "Р”Р°РЅРЅС‹С… СЃРєР°РЅРµСЂР° РїРѕРєР° РЅРµС‚. РћР±РЅРѕРІРёС‚Рµ СЃРєР°РЅРµСЂ РёР»Рё РїСЂРѕРІРµСЂСЊС‚Рµ СЃС‚Р°С‚СѓСЃ РёСЃС‚РѕС‡РЅРёРєР° РґР°РЅРЅС‹С….",
    socialTitle: "РћС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ вЂ” 24С‡",
    socialText:
      "РћС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ РёР· РїРѕРґРєР»СЋС‡С‘РЅРЅС‹С… РёСЃС‚РѕС‡РЅРёРєРѕРІ. Р­С‚Рё С†РёС„СЂС‹ РЅРµ СЏРІР»СЏСЋС‚СЃСЏ РїРѕР»РЅС‹Рј РѕС…РІР°С‚РѕРј РІСЃРµРіРѕ РёРЅС‚РµСЂРЅРµС‚Р°.",
    socialRefresh: "РћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹Рµ РІРЅРёРјР°РЅРёСЏ",
    socialRefreshing: "РЎРєР°РЅРёСЂСѓРµРј РёСЃС‚РѕС‡РЅРёРєРё...",
    socialScore: "Р РµР№С‚РёРЅРі РІРЅРёРјР°РЅРёСЏ",
    mentions24h: "РћС‚СЃР»РµР¶РµРЅРѕ Р·Р° 24С‡",
    mentions1h: "РћС‚СЃР»РµР¶РµРЅРѕ Р·Р° 1С‡",
    velocity: "РЎРєРѕСЂРѕСЃС‚СЊ",
    provider: "РСЃС‚РѕС‡РЅРёРє",
    topPosts: "РўРѕРї-РїРѕСЃС‚С‹",
    noSocialData:
      "Р”Р°РЅРЅС‹С… РїРѕ РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРјСѓ РІРЅРёРјР°РЅРёСЋ РїРѕРєР° РЅРµС‚. РћР±РЅРѕРІРёС‚Рµ СЃРєР°РЅРµСЂ РёР»Рё РїСЂРѕРІРµСЂСЊС‚Рµ РїРѕРєСЂС‹С‚РёРµ РёСЃС‚РѕС‡РЅРёРєРѕРІ.",
    openChart: "РћС‚РєСЂС‹С‚СЊ РіСЂР°С„РёРє",
    bullish: "Р‘С‹С‡СЊРµ",
    bearish: "РњРµРґРІРµР¶СЊРµ",
    neutral: "РќРµР№С‚СЂР°Р»СЊРЅРѕРµ",
    upside: "Р’РІРµСЂС…",
    downside: "Р’РЅРёР·",
  },

  ua: {
    title: "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°",
    text: "РЁР°СЂ Р°РЅР°Р»С–Р·Сѓ СЂРёРЅРєСѓ РґР»СЏ Р°РєС†С–Р№ С– РєСЂРёРїС‚Рё: Р»С–РґРµСЂРё СЂСѓС…Сѓ, Р°РЅРѕРјР°Р»СЊРЅРёР№ РѕР±КјС”Рј, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё, РІС–РґСЃС‚РµР¶СѓРІР°РЅР° СѓРІР°РіР° С‚Р° СЂРµР№С‚РёРЅРі РјРѕР¶Р»РёРІРѕСЃС‚РµР№.",
    lockedTitle: "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР° РґРѕСЃС‚СѓРїРЅР° РЅР° SkillEdge Edge С‚Р° Elite.",
    lockedText:
      "РќР° Core РґРѕСЃС‚СѓРїРЅРёР№ Р»РёС€Рµ РїРѕРїРµСЂРµРґРЅС–Р№ РїРµСЂРµРіР»СЏРґ. РџРµСЂРµР№РґС–С‚СЊ РЅР° Edge Р°Р±Рѕ Elite, С‰РѕР± РІС–РґРєСЂРёС‚Рё СЂРµР·СѓР»СЊС‚Р°С‚Рё СЃРєР°РЅРµСЂР°, СЂРµР№С‚РёРЅРі РјРѕР¶Р»РёРІРѕСЃС‚РµР№, РґР°РЅС– РІС–РґСЃС‚РµР¶СѓРІР°РЅРѕС— СѓРІР°РіРё С‚Р° РїРѕС€СѓРє Р°РєС‚РёРІРЅРёС… С‚РёРєРµСЂС–РІ.",
    refresh: "РћРЅРѕРІРёС‚Рё СЃРєР°РЅРµСЂ",
    refreshing: "РЎРєР°РЅСѓС”РјРѕ...",
    source: "Р”Р¶РµСЂРµР»Рѕ",
    scanned: "РџРµСЂРµРІС–СЂРµРЅРѕ",
    pumpWatch: "РџР°РјРї-РєР°РЅРґРёРґР°С‚Рё",
    dumpWatch: "Р”Р°РјРї-РєР°РЅРґРёРґР°С‚Рё",
    unusualVolume: "РђРЅРѕРјР°Р»СЊРЅРёР№ РѕР±КјС”Рј",
    catalystWatch: "РљР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё",
    all: "РЈСЃС–",
    filters: "Р¤С–Р»СЊС‚СЂРё",
    allBuckets: "РЈСЃС– РєР°С‚РµРіРѕСЂС–С—",
    stocks: "РђРєС†С–С—",
    crypto: "РљСЂРёРїС‚Рѕ",
    search: "РџРѕС€СѓРє С‚РёРєРµСЂР°...",
    score: "Р РµР№С‚РёРЅРі",
    change: "Р СѓС…",
    volume: "РћР±КјС”Рј",
    mentions: "Р’С–РґСЃС‚РµР¶СѓРІР°РЅС– Р·РіР°РґРєРё",
    sentiment: "РќР°СЃС‚СЂС–Р№",
    risk: "Р РёР·РёРє",
    noData: "Р”Р°РЅРёС… СЃРєР°РЅРµСЂР° РїРѕРєРё РЅРµРјР°С”. РћРЅРѕРІС–С‚СЊ СЃРєР°РЅРµСЂ Р°Р±Рѕ РїРµСЂРµРІС–СЂС‚Рµ СЃС‚Р°С‚СѓСЃ РґР¶РµСЂРµР»Р° РґР°РЅРёС….",
    socialTitle: "Р’С–РґСЃС‚РµР¶СѓРІР°РЅР° СѓРІР°РіР° вЂ” 24Рі",
    socialText:
      "Р’С–РґСЃС‚РµР¶СѓРІР°РЅР° СѓРІР°РіР° Р· РїС–РґРєР»СЋС‡РµРЅРёС… РґР¶РµСЂРµР». Р¦С– С†РёС„СЂРё РЅРµ С” РїРѕРІРЅРёРј РѕС…РѕРїР»РµРЅРЅСЏРј СѓСЃСЊРѕРіРѕ С–РЅС‚РµСЂРЅРµС‚Сѓ.",
    socialRefresh: "РћРЅРѕРІРёС‚Рё РґР°РЅС– СѓРІР°РіРё",
    socialRefreshing: "РЎРєР°РЅСѓС”РјРѕ РґР¶РµСЂРµР»Р°...",
    socialScore: "Р РµР№С‚РёРЅРі СѓРІР°РіРё",
    mentions24h: "Р’С–РґСЃС‚РµР¶РµРЅРѕ Р·Р° 24Рі",
    mentions1h: "Р’С–РґСЃС‚РµР¶РµРЅРѕ Р·Р° 1Рі",
    velocity: "РЁРІРёРґРєС–СЃС‚СЊ",
    provider: "Р”Р¶РµСЂРµР»Рѕ",
    topPosts: "РўРѕРї-РїРѕСЃС‚Рё",
    noSocialData:
      "Р”Р°РЅРёС… С‰РѕРґРѕ РІС–РґСЃС‚РµР¶СѓРІР°РЅРѕС— СѓРІР°РіРё РїРѕРєРё РЅРµРјР°С”. РћРЅРѕРІС–С‚СЊ СЃРєР°РЅРµСЂ Р°Р±Рѕ РїРµСЂРµРІС–СЂС‚Рµ РїРѕРєСЂРёС‚С‚СЏ РґР¶РµСЂРµР».",
    openChart: "Р’С–РґРєСЂРёС‚Рё РіСЂР°С„С–Рє",
    bullish: "Р‘РёС‡Р°С‡РёР№",
    bearish: "Р’РµРґРјРµР¶РёР№",
    neutral: "РќРµР№С‚СЂР°Р»СЊРЅРёР№",
    upside: "Р’РіРѕСЂСѓ",
    downside: "Р’РЅРёР·",
  },
};

function formatMarketNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "вЂ”";
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
                {" В· "}
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
  if (typeof value !== "number" || !Number.isFinite(value)) return "вЂ”";

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
          {copy.rr}: {rr !== null ? `${rr}R` : "вЂ”"}
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
              : "вЂ”"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            {copy.resistance}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {nearestResistance?.label
              ? `${nearestResistance.label}: ${formatAlertPrice(nearestResistance.price)}`
              : "вЂ”"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          {copy.candles}: {structure?.candlesProvider || "вЂ”"} В·{" "}
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
    value: confidence === null ? "вЂ”" : String(confidence),
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
  onOpenAlerts: () => void;
}) {
  const [alerts, setAlerts] = useState<DashboardMarketAlert[]>([]);
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
      subtitle: "РџРѕСЃР»РµРґРЅРёРµ С‚РѕСЂРіРѕРІС‹Рµ СЃРёРіРЅР°Р»С‹",
      empty: "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… alerts.",
      scan: "РЎРєР°РЅРёСЂРѕРІР°С‚СЊ",
      scanning: "РЎРєР°РЅРёСЂСѓРµРј...",
      open: "РћС‚РєСЂС‹С‚СЊ",
      close: "РЎРІРµСЂРЅСѓС‚СЊ",
      expand: "Р Р°Р·РІРµСЂРЅСѓС‚СЊ",
      direction: "РќР°РїСЂР°РІР»РµРЅРёРµ",
      entry: "Р—РѕРЅР° РІС…РѕРґР°",
      stop: "РЎС‚РѕРї",
      targets: "Р¦РµР»Рё",
      structureTitle: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂС‹РЅРєР°",
      structureBased: "РџР»Р°РЅ РїРѕСЃС‚СЂРѕРµРЅ РїРѕ СЃРІРµС‡Р°Рј / VWAP / СѓСЂРѕРІРЅСЏРј",
      fallbackBased: "Fallback-РїР»Р°РЅ: РЅРµ С…РІР°С‚Р°РµС‚ СЃРІРµС‡РµР№/СѓСЂРѕРІРЅРµР№",
      rr: "RR",
      vwap: "VWAP",
      atr: "ATR",
      support: "Р‘Р»РёР¶Р°Р№С€Р°СЏ РїРѕРґРґРµСЂР¶РєР°",
      resistance: "Р‘Р»РёР¶Р°Р№С€РµРµ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ",
      candles: "РЎРІРµС‡Рё",
      missingData: "РќРµ С…РІР°С‚Р°РµС‚ РґР°РЅРЅС‹С…",
      risk: "Р РёСЃРє",
      newLabel: "new",
      live: "Live",
      lastChecked: "РџСЂРѕРІРµСЂРµРЅРѕ",
      autoRefresh: "Auto-refresh 60s / scan 5m",
      priority: "priority",
      latest: "РџРѕСЃР»РµРґРЅРёР№",
      openCenter: "РћС‚РєСЂС‹С‚СЊ С†РµРЅС‚СЂ",
      quiet: "Р–РґС‘Рј РєР°С‡РµСЃС‚РІРµРЅРЅС‹Р№ setup",
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
    },
    ua: {
      title: "AI Alerts",
      subtitle: "РћСЃС‚Р°РЅРЅС– С‚РѕСЂРіРѕРІС– СЃРёРіРЅР°Р»Рё",
      empty: "РђРєС‚РёРІРЅРёС… alerts РїРѕРєРё РЅРµРјР°С”.",
      scan: "РЎРєР°РЅСѓРІР°С‚Рё",
      scanning: "РЎРєР°РЅСѓС”РјРѕ...",
      open: "Р’С–РґРєСЂРёС‚Рё",
      close: "Р—РіРѕСЂРЅСѓС‚Рё",
      expand: "Р РѕР·РіРѕСЂРЅСѓС‚Рё",
      direction: "РќР°РїСЂСЏРјРѕРє",
      entry: "Р—РѕРЅР° РІС…РѕРґСѓ",
      stop: "РЎС‚РѕРї",
      targets: "Р¦С–Р»С–",
      structureTitle: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂРёРЅРєСѓ",
      structureBased: "РџР»Р°РЅ РїРѕР±СѓРґРѕРІР°РЅРѕ Р·Р° СЃРІС–С‡РєР°РјРё / VWAP / СЂС–РІРЅСЏРјРё",
      fallbackBased: "Fallback-РїР»Р°РЅ: Р±СЂР°РєСѓС” СЃРІС–С‡РѕРє/СЂС–РІРЅС–РІ",
      rr: "RR",
      vwap: "VWAP",
      atr: "ATR",
      support: "РќР°Р№Р±Р»РёР¶С‡Р° РїС–РґС‚СЂРёРјРєР°",
      resistance: "РќР°Р№Р±Р»РёР¶С‡РёР№ РѕРїС–СЂ",
      candles: "РЎРІС–С‡РєРё",
      missingData: "Р‘СЂР°РєСѓС” РґР°РЅРёС…",
      risk: "Р РёР·РёРє",
      newLabel: "new",
      live: "Live",
      lastChecked: "РџРµСЂРµРІС–СЂРµРЅРѕ",
      autoRefresh: "Auto-refresh 60s / scan 5m",
      priority: "priority",
      latest: "РћСЃС‚Р°РЅРЅС–Р№",
      openCenter: "Р’С–РґРєСЂРёС‚Рё С†РµРЅС‚СЂ",
      quiet: "Р§РµРєР°С”РјРѕ СЏРєС–СЃРЅРёР№ setup",
    },
  }[safeLanguage];

  const hasAccess =
  subscription.active && canUseFeature(subscription.plan, "ai_alerts");

  const newAlerts = alerts.filter(
  (alert) =>
    alert.is_new !== false &&
    !alert.viewed_at &&
    !seenAlertIds.includes(alert.id)
);

const priorityAlerts = alerts.filter((alert) => {
  const score = alert.confidence_score ?? alert.score ?? 0;

  return (
    alert.signal_mode === "actionable" ||
    alert.personalization_type === "journal_strength" ||
    score >= 80
  );
});

const latestAlert = alerts[0] || null;
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
        await authFetch("/api/market/alerts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }

      const response = await authFetch("/api/market/alerts/personalized?limit=3", {
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


    
    loadAlerts(true);

    

    const readInterval = window.setInterval(() => {
      loadAlerts(false);
    }, 60000);

    const generateInterval = window.setInterval(() => {
      loadAlerts(true);
    }, 300000);

    return () => {
      window.clearInterval(readInterval);
      window.clearInterval(generateInterval);
    };
  }, [hasAccess]);

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
    ? `${copy.latest}: ${latestAlert.symbol} В· ${
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
    <span className="text-white/25">В·</span>
    <span>{copy.autoRefresh}</span>
  </div>

  <div className="text-xs text-white/40">
    {copy.lastChecked}:{" "}
    {lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString() : "вЂ”"}
  </div>
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
    onOpenAlerts();
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
              ) : alerts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/45">
                  {copy.empty}
                </div>
              ) : (
                alerts.map((alert) => (
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
    {alert.personal_priority_label} В·{" "}
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
                            ? `${alert.entry_zone_min}вЂ“${alert.entry_zone_max}`
                            : "wait trigger"}
                        </span>
                      </div>
                      <div>
                        {copy.stop}:{" "}
                        <span className="text-white/70">
                          {alert.stop_price || "вЂ”"}
                        </span>
                      </div>
                      <div>
                        {copy.targets}:{" "}
                        <span className="text-white/70">
                          {[alert.target_1, alert.target_2, alert.target_3]
                            .filter(Boolean)
                            .join(" / ") || "вЂ”"}
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
  onCreateTradeFromAlert,
}: {
  subscription: Subscription;
  language: Language;
  trades: Trade[];
  onCreateTradeFromAlert: (alert: DashboardMarketAlert) => void;
}) {
const [alerts, setAlerts] = useState<DashboardMarketAlert[]>([]);
const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
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
        "РЎРёРіРЅР°Р»С‹ Р·Р° РїРѕСЃР»РµРґРЅРёРµ РґРЅРё: РЅР°РїСЂР°РІР»РµРЅРёРµ, setup, entry zone, stop, targets, risk Рё management plan.",
      generate: "РЎРєР°РЅРёСЂРѕРІР°С‚СЊ СЂС‹РЅРѕРє",
      generating: "РЎРєР°РЅРёСЂСѓРµРј...",
      refresh: "РћР±РЅРѕРІРёС‚СЊ",
      checkOutcomes: "РџСЂРѕРІРµСЂРёС‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚С‹",
checkingOutcomes: "РџСЂРѕРІРµСЂСЏРµРј...",
      empty: "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… alerts. Р—Р°РїСѓСЃС‚Рё СЃРєР°РЅРёСЂРѕРІР°РЅРёРµ.",
      locked:
  "AI Alerts РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РЅР° SkillEdge Elite. РќР° SkillEdge Edge РѕС‚РєСЂС‹С‚ AI Scanner / Market Intelligence, РЅРѕ real-time AI Alerts, floating alerts widget Рё Signal-to-Journal workflow РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РІ Elite.",
      direction: "РќР°РїСЂР°РІР»РµРЅРёРµ",
structureTitle: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂС‹РЅРєР°",
structureBased: "РџР»Р°РЅ РїРѕСЃС‚СЂРѕРµРЅ РїРѕ СЃРІРµС‡Р°Рј / VWAP / СѓСЂРѕРІРЅСЏРј",
fallbackBased: "Fallback-РїР»Р°РЅ: РЅРµ С…РІР°С‚Р°РµС‚ СЃРІРµС‡РµР№/СѓСЂРѕРІРЅРµР№",
rr: "RR",
vwap: "VWAP",
atr: "ATR",
support: "Р‘Р»РёР¶Р°Р№С€Р°СЏ РїРѕРґРґРµСЂР¶РєР°",
resistance: "Р‘Р»РёР¶Р°Р№С€РµРµ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ",
candles: "РЎРІРµС‡Рё",
missingData: "РќРµ С…РІР°С‚Р°РµС‚ РґР°РЅРЅС‹С…",
      setup: "РЎРµС‚Р°Рї",
entry: "Р—РѕРЅР° РІС…РѕРґР°",
stop: "РЎС‚РѕРї",
targets: "Р¦РµР»Рё",
trigger: "РўСЂРёРіРіРµСЂ",
reason: "РџСЂРёС‡РёРЅР°",
risk: "Р РёСЃРє",
scenario: "РЎС†РµРЅР°СЂРёР№",
invalidation: "РћС‚РјРµРЅР° РёРґРµРё",
management: "РЈРїСЂР°РІР»РµРЅРёРµ",
confidence: "РЈРІРµСЂРµРЅРЅРѕСЃС‚СЊ",
status: "РЎС‚Р°С‚СѓСЃ",
outcome: "РСЃС…РѕРґ",
time: "Р’СЂРµРјСЏ",
worked: "РћС‚СЂР°Р±РѕС‚Р°Р»",
failed: "РќРµ РѕС‚СЂР°Р±РѕС‚Р°Р»",
pending: "Р’ РѕР¶РёРґР°РЅРёРё",
neutral: "РќРµР№С‚СЂР°Р»СЊРЅРѕ",
avgMfe: "РЎСЂРµРґРЅРёР№ MFE",
avgMae: "РЎСЂРµРґРЅРёР№ MAE",
tpHit: "TP РґРѕСЃС‚РёРіРЅСѓС‚",
stopHit: "РЎС‚РѕРї Р·Р°РґРµС‚",
quality: "РљР°С‡РµСЃС‚РІРѕ",
saveToPlaybook: "РЎРѕС…СЂР°РЅРёС‚СЊ РІ Playbook",
savingToPlaybook: "РЎРѕС…СЂР°РЅСЏРµРј...",
savedToPlaybook: "РЎРѕС…СЂР°РЅРµРЅРѕ",
createTradeDraft: "РЎРѕР·РґР°С‚СЊ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р°",
openPlaybook: "РћС‚РєСЂС‹С‚СЊ Playbook",
hidePlaybook: "РЎРєСЂС‹С‚СЊ Playbook",
playbookTitle: "Personal Signal Playbook",
playbookText:
  "РўРІРѕСЏ Р»РёС‡РЅР°СЏ Р±Р°Р·Р° СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРµС‚Р°РїРѕРІ: Р»РѕРіРёРєР°, РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ, РѕС€РёР±РєРё Рё РїСЂРёРјРµСЂС‹ СЃРёРіРЅР°Р»РѕРІ.",
playbookEmpty:
  "РџРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРµС‚Р°РїРѕРІ. РќР°Р¶РјРё Save to Playbook РЅР° Р»СЋР±РѕРј СЃРёРіРЅР°Р»Рµ.",
playbookLoading: "Р—Р°РіСЂСѓР¶Р°РµРј playbook...",
lastExample: "Last example",
openSignalProfile: "РћС‚РєСЂС‹С‚СЊ Signal Profile",
hideSignalProfile: "РЎРєСЂС‹С‚СЊ Signal Profile",
rebuildSignalProfile: "РџРµСЂРµСЃРѕР±СЂР°С‚СЊ РїСЂРѕС„РёР»СЊ",
rebuildingSignalProfile: "РЎРѕР±РёСЂР°РµРј РїСЂРѕС„РёР»СЊ...",
signalProfileTitle: "Personal Signal Profile",
signalProfileText:
  "SkillEdge AI РїРѕРєР°Р·С‹РІР°РµС‚, РєР°РєРёРµ AI-СЃРµС‚Р°РїС‹ С‚С‹ С‚РѕСЂРіСѓРµС€СЊ Р»СѓС‡С€Рµ, РіРґРµ С‚РµСЂСЏРµС€СЊ РґРµРЅСЊРіРё Рё РєР°РєРёРµ СЃРёРіРЅР°Р»С‹ СЃС‚РѕРёС‚ РїСЂРёРѕСЂРёС‚РµР·РёСЂРѕРІР°С‚СЊ.",
signalProfileEmpty:
  "РџСЂРѕС„РёР»СЊ РїРѕРєР° РїСѓСЃС‚РѕР№. РЎРѕР·РґР°Р№ СЃРґРµР»РєРё РёР· AI Alerts Рё СЃРѕС…СЂР°РЅРё РёС… РІ Р¶СѓСЂРЅР°Р».",
signalProfileLoading: "Р—Р°РіСЂСѓР¶Р°РµРј signal profile...",
personalStrength: "Personal strength",
riskZone: "Risk zone",
learningProfile: "Learning",
neutralProfile: "Neutral",
strengthScore: "Strength score",
planAdherence: "Plan adherence",
aiNote: "AI note",
openTradePatterns: "РћС‚РєСЂС‹С‚СЊ Trade Patterns",
hideTradePatterns: "РЎРєСЂС‹С‚СЊ Trade Patterns",
rebuildTradePatterns: "РќР°Р№С‚Рё РјРѕРё РїР°С‚С‚РµСЂРЅС‹",
rebuildingTradePatterns: "РС‰РµРј РїР°С‚С‚РµСЂРЅС‹...",
tradePatternsTitle: "Independent Trade Pattern Profile",
tradePatternsText:
  "SkillEdge AI Р°РЅР°Р»РёР·РёСЂСѓРµС‚ С‚РІРѕРё СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅС‹Рµ РїСЂРёР±С‹Р»СЊРЅС‹Рµ СЃРґРµР»РєРё Рё РёС‰РµС‚ РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РїР°С‚С‚РµСЂРЅС‹, РєРѕС‚РѕСЂС‹Рµ РїРѕС‚РѕРј РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РґР»СЏ РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹С… AI Alerts.",
tradePatternsEmpty:
  "РџРѕРєР° РЅРµС‚ РЅР°Р№РґРµРЅРЅС‹С… РїР°С‚С‚РµСЂРЅРѕРІ. Р”РѕР±Р°РІСЊ РІ Journal РЅРµСЃРєРѕР»СЊРєРѕ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅС‹С… РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє.",
tradePatternsLoading: "Р—Р°РіСЂСѓР¶Р°РµРј trade patterns...",
patternStrength: "Pattern strength",
examples: "Examples",
keywords: "Keywords",
filterAll: "Р’СЃРµ",
filterActionable: "Actionable",
filterWatchlist: "Watchlist",
filterPriority: "РџСЂРёРѕСЂРёС‚РµС‚",
filterCaution: "РћСЃС‚РѕСЂРѕР¶РЅРѕ",
filterJournalMatch: "РЎРѕРІРїР°РґРµРЅРёРµ СЃ Р¶СѓСЂРЅР°Р»РѕРј",
filterAiStrength: "AI-СЃРёР»Р°",
filterLong: "Long",
filterShort: "Short",
filterCrypto: "РљСЂРёРїС‚Рѕ",
filterStocks: "РђРєС†РёРё",
filterDecisionWatching: "РќР°Р±Р»СЋРґР°СЋ",
filterDecisionTaken: "Р’Р·СЏР»",
filterDecisionSkipped: "РџСЂРѕРїСѓСЃС‚РёР»",
filterDecisionMissed: "РЈРїСѓСЃС‚РёР»",
decisionAnalyticsTitle: "Signal-to-Trade Decisions",
decisionAnalyticsText:
  "РўСѓС‚ РІРёРґРЅРѕ, СЏРє РєР»С–С”РЅС‚ РїСЂР°С†СЋС” Р· СЃРёРіРЅР°Р»Р°РјРё: СЃРїРѕСЃС‚РµСЂС–РіР°С”, Р±РµСЂРµ, РїСЂРѕРїСѓСЃРєР°С” Р°Р±Рѕ РІС–РґРјС–С‡Р°С” missed. Р¦Рµ Р±Р°Р·Р° РјР°Р№Р±СѓС‚РЅСЊРѕС— СЃС‚Р°С‚РёСЃС‚РёРєРё СЏРєРѕСЃС‚С– СЃРёРіРЅР°Р»С–РІ С– РІРёРєРѕРЅР°РЅРЅСЏ.",
filterEmpty: "РќРµС‚ alerts РїРѕРґ РІС‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ.",
openAlertDetails: "РћС‚РєСЂС‹С‚СЊ СЂР°Р·Р±РѕСЂ",
hideAlertDetails: "РЎРєСЂС‹С‚СЊ СЂР°Р·Р±РѕСЂ",
liveDesk: "Live AI Trading Desk",
lastChecked: "РџРѕСЃР»РµРґРЅСЏСЏ РїСЂРѕРІРµСЂРєР°",
autoRefreshNote:
  "Alerts РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. Market scan СЂР°Р±РѕС‚Р°РµС‚ РІ С„РѕРЅРµ, СЃРїРёСЃРѕРє РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ РєР°Р¶РґС‹Рµ 60 СЃРµРєСѓРЅРґ.",
showMoreAlerts: "РџРѕРєР°Р·Р°С‚СЊ РµС‰С‘ 10",
collapseAlerts: "РЎРІРµСЂРЅСѓС‚СЊ РІСЃС‘",   
smartTopFive:
  "РџРµСЂРІС‹Рµ 5 alerts РѕС‚СЃРѕСЂС‚РёСЂРѕРІР°РЅС‹ РїРѕ РІР°Р¶РЅРѕСЃС‚Рё: priority, journal match, AI strength, confidence Рё СЃРІРµР¶РµСЃС‚СЊ СЃРёРіРЅР°Р»Р°.", 
emptyDeskTitle: "AI Trading Desk Р¶РґС‘С‚ РєР°С‡РµСЃС‚РІРµРЅРЅС‹Р№ СЃРµС‚Р°Рї",
emptyDeskText:
  "РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… alerts РїРѕРґ РІС‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ. Р­С‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge AI РЅРµ РґРѕР»Р¶РµРЅ СЃС‚СЂРµР»СЏС‚СЊ РјСѓСЃРѕСЂРѕРј. РЎРёСЃС‚РµРјР° Р¶РґС‘С‚ high-confidence СЃРёС‚СѓР°С†РёСЋ СЃ РїРѕРЅСЏС‚РЅС‹Рј trigger, stop, targets Рё risk note.",
emptyDeskAction:
  "РћСЃС‚Р°РІСЊ СЃС‚СЂР°РЅРёС†Сѓ РѕС‚РєСЂС‹С‚РѕР№ вЂ” СЃРїРёСЃРѕРє РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РєР°Р¶РґС‹Рµ 60 СЃРµРєСѓРЅРґ.",
confidenceTransparency: "Score transparency",
confidenceTransparencyText:
  "РџРѕС‡РµРјСѓ SkillEdge AI РІС‹РґРµР»РёР» СЌС‚РѕС‚ СЃРёРіРЅР°Р» Рё РєР°РєРёРµ С„Р°РєС‚РѕСЂС‹ СѓСЃРёР»РёРІР°СЋС‚ РёР»Рё РѕСЃР»Р°Р±Р»СЏСЋС‚ РёРґРµСЋ.",
breakdownTitle: "SkillEdge AI Signal Breakdown",
traderDecision: "Р РµС€РµРЅРёРµ С‚СЂРµР№РґРµСЂР°",
tradePlan: "РџР»Р°РЅ СЃРґРµР»РєРё",
whyNow: "РџРѕС‡РµРјСѓ СЃРµР№С‡Р°СЃ",
confirmationChecklist: "Р§РµРєР»РёСЃС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ",
avoidThisTradeIf: "РќРµ С‚РѕСЂРіРѕРІР°С‚СЊ, РµСЃР»Рё",
learningLayer: "РћР±СѓС‡Р°СЋС‰РёР№ СЃР»РѕР№",
decisionWatching: "РќР°Р±Р»СЋРґР°СЋ",
decisionTaken: "Р’Р·СЏР»",
decisionSkipped: "РџСЂРѕРїСѓСЃС‚РёР»",
decisionMissed: "РЈРїСѓСЃС‚РёР»",
decisionSaved: "Р РµС€РµРЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ",
decisionReasonTitle: "РџСЂРёС‡РёРЅР° СЂРµС€РµРЅРёСЏ",
reasonCleanTrigger: "Р§РёСЃС‚С‹Р№ С‚СЂРёРіРіРµСЂ",
reasonGoodRiskReward: "РҐРѕСЂРѕС€РёР№ RR",
reasonJournalMatch: "РЎРѕРІРїР°РґР°РµС‚ СЃ Р¶СѓСЂРЅР°Р»РѕРј",
reasonNoConfirmation: "РќРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ",
reasonTooLate: "РЎР»РёС€РєРѕРј РїРѕР·РґРЅРѕ",
reasonRiskHigh: "Р РёСЃРє СЃР»РёС€РєРѕРј РІС‹СЃРѕРєРёР№",
reasonLiquidity: "РЎРїСЂРµРґ / Р»РёРєРІРёРґРЅРѕСЃС‚СЊ",
reasonNotAtDesk: "РќРµ Р±С‹Р» Сѓ СЌРєСЂР°РЅР°",
reasonTradeDraftCreated: "РЎРґРµР»РєР° РёР· СЃРёРіРЅР°Р»Р° СЃРѕР·РґР°РЅР°",
topReason: "Р“Р»Р°РІРЅР°СЏ РїСЂРёС‡РёРЅР°",
allReasons: "Р’СЃРµ РїСЂРёС‡РёРЅС‹",
journalSyncTitle: "Journal Sync",
journalSyncText:
  "РўС‹ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє Taken. РЎРѕР·РґР°Р№ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р°, С‡С‚РѕР±С‹ SkillEdge СЃСЂР°РІРЅРёР» РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ С‚РІРѕРёРј СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј: РІС…РѕРґ, СЃС‚РѕРї, РІС‹С…РѕРґ, PnL Рё РєР°С‡РµСЃС‚РІРѕ СЃРґРµР»РєРё.",
journalSyncAction: "РЎРѕР·РґР°С‚СЊ trade draft",
linkedJournalTitle: "Linked Journal Trade",
linkedJournalText:
  "Р­С‚Р° СЃРґРµР»РєР° СѓР¶Рµ СЃРІСЏР·Р°РЅР° СЃ alert. SkillEdge СЃРјРѕР¶РµС‚ СЃСЂР°РІРЅРёС‚СЊ РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј РєР»РёРµРЅС‚Р°.",
linkedJournalEmpty:
  "РџРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅРѕР№ СЃРґРµР»РєРё РІ Р¶СѓСЂРЅР°Р»Рµ, СЃРІСЏР·Р°РЅРЅРѕР№ СЃ СЌС‚РёРј alert.",
linkedTrades: "Linked trades",
linkedPnl: "Linked PnL",
linkedResult: "Result",
journalLinkAnalyticsTitle: "Signal в†” Journal Sync",
journalLinkAnalyticsText:
  "SkillEdge РѕС‚СЃР»РµР¶РёРІР°РµС‚, РєР°РєРёРµ alerts РїСЂРµРІСЂР°С‚РёР»РёСЃСЊ РІ СЂРµР°Р»СЊРЅС‹Рµ СЃРґРµР»РєРё РІ Journal. Р­С‚Рѕ Р±Р°Р·Р° РґР»СЏ Р°РЅР°Р»РёР·Р° РёСЃРїРѕР»РЅРµРЅРёСЏ, PnL РїРѕ СЃРёРіРЅР°Р»Р°Рј Рё РїСЂРѕРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№.",
takenWithoutJournal: "Taken Р±РµР· Journal",
linkedAlertsCount: "Linked alerts",
linkedTradesPnl: "Linked trades PnL",
avgExecutionScore: "Avg execution",
takenWithoutJournalFilter: "Taken Р±РµР· Journal",
takenWithoutJournalTitle: "Taken alert Р±РµР· СЃРґРµР»РєРё РІ Journal",
takenWithoutJournalText:
  "РљР»РёРµРЅС‚ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє Taken, РЅРѕ РµС‰С‘ РЅРµ СЃРѕС…СЂР°РЅРёР» СЃРґРµР»РєСѓ РІ Р¶СѓСЂРЅР°Р». РЎРѕР·РґР°Р№ trade draft, С‡С‚РѕР±С‹ SkillEdge СЃРјРѕРі СЃСЂР°РІРЅРёС‚СЊ РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј.",
executionScore: "Execution score",
executionReview: "Execution review",
executionStrong: "РЎРёР»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ",
executionMedium: "РќРѕСЂРјР°Р»СЊРЅРѕ, РЅРѕ РµСЃС‚СЊ С‡С‚Рѕ СѓР»СѓС‡С€РёС‚СЊ",
executionWeak: "РќСѓР¶РЅРѕ СЂР°Р·РѕР±СЂР°С‚СЊ РёСЃРїРѕР»РЅРµРЅРёРµ",
filterJournalLinked: "Journal linked",
filterExecutionStrong: "Strong execution",
filterExecutionReview: "Needs review",
executionQualityTitle: "Execution Quality",
executionQualityText:
  "SkillEdge РїРѕРєР°Р·С‹РІР°РµС‚, РєР°РєРёРµ AI Alerts СѓР¶Рµ РїСЂРёРІРµР»Рё Рє СЃРґРµР»РєР°Рј РІ Journal Рё РіРґРµ РёСЃРїРѕР»РЅРµРЅРёРµ Р±С‹Р»Рѕ СЃРёР»СЊРЅС‹Рј РёР»Рё С‚СЂРµР±СѓРµС‚ СЂР°Р·Р±РѕСЂР°.",
executionCoachTitle: "AI Execution Coach",
executionCoachText:
  "SkillEdge СЂР°Р·Р±РёСЂР°РµС‚ РёСЃРїРѕР»РЅРµРЅРёРµ РєР»РёРµРЅС‚Р° РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°: РІС…РѕРґ, СЃС‚РѕРї, РЅР°РїСЂР°РІР»РµРЅРёРµ, targets Рё РґРёСЃС†РёРїР»РёРЅСѓ.",
executionCoachStrong:
  "РЎРёР»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ: РєР»РёРµРЅС‚ РІ С†РµР»РѕРј СЃР»РµРґРѕРІР°Р» РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Р°. РўР°РєРёРµ СЃРґРµР»РєРё СЃС‚РѕРёС‚ СЃРѕС…СЂР°РЅСЏС‚СЊ РєР°Рє Р»РёС‡РЅС‹Р№ СЃРёР»СЊРЅС‹Р№ РїР°С‚С‚РµСЂРЅ.",
executionCoachMedium:
  "РСЃРїРѕР»РЅРµРЅРёРµ РЅРѕСЂРјР°Р»СЊРЅРѕРµ, РЅРѕ РµСЃС‚СЊ Р·РѕРЅС‹ РґР»СЏ СѓР»СѓС‡С€РµРЅРёСЏ. РџСЂРѕРІРµСЂСЊ РІС…РѕРґ, СЃС‚РѕРї Рё СѓРїСЂР°РІР»РµРЅРёРµ РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ target.",
executionCoachWeak:
  "РСЃРїРѕР»РЅРµРЅРёРµ С‚СЂРµР±СѓРµС‚ СЂР°Р·Р±РѕСЂР°. Р’РµСЂРѕСЏС‚РЅРѕ, РєР»РёРµРЅС‚ РѕС‚РєР»РѕРЅРёР»СЃСЏ РѕС‚ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°: РїРѕР·РґРЅРёР№ РІС…РѕРґ, РґСЂСѓРіРѕР№ СЃС‚РѕРї РёР»Рё СЃР»Р°Р±РѕРµ СЃР»РµРґРѕРІР°РЅРёРµ СЃС†РµРЅР°СЂРёСЋ.",
executionCoachEntryIssue:
  "Entry issue: РІС…РѕРґ Р±С‹Р» РІРЅРµ РїР»Р°РЅРѕРІРѕР№ Р·РѕРЅС‹ РёР»Рё СЃР»РёС€РєРѕРј РїРѕР·РґРЅРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ СЃРёРіРЅР°Р»Р°.",
executionCoachStopIssue:
  "Stop issue: СЃС‚РѕРї РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°. Р­С‚Рѕ РјРѕР¶РµС‚ Р»РѕРјР°С‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ Рё risk/reward.",
executionCoachDirectionIssue:
  "Direction issue: РЅР°РїСЂР°РІР»РµРЅРёРµ СЃРґРµР»РєРё РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РЅР°РїСЂР°РІР»РµРЅРёСЏ alert.",
executionCoachTargetIssue:
  "Target issue: СЃРґРµР»РєР° РЅРµ РґРѕС€Р»Р° РґРѕ TP РёР»Рё РІС‹С…РѕРґ Р±С‹Р» РЅРµ РїРѕ РїР»Р°РЅСѓ.",
executionWeaknessTitle: "Execution Weakness Map",
executionWeaknessText:
  "SkillEdge РїРѕРєР°Р·С‹РІР°РµС‚, РіРґРµ РєР»РёРµРЅС‚ С‡Р°С‰Рµ РІСЃРµРіРѕ РѕС‚РєР»РѕРЅСЏРµС‚СЃСЏ РѕС‚ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°: РІС…РѕРґ, СЃС‚РѕРї, РЅР°РїСЂР°РІР»РµРЅРёРµ РёР»Рё СѓРїСЂР°РІР»РµРЅРёРµ С†РµР»СЏРјРё.",
entryIssueFilter: "Entry issues",
stopIssueFilter: "Stop issues",
directionIssueFilter: "Direction issues",
targetIssueFilter: "Target issues",
executionFocusTitle: "Personal Execution Focus",
executionFocusText:
  "SkillEdge РІС‹Р±РёСЂР°РµС‚ РіР»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ РЅР° РѕСЃРЅРѕРІРµ СЃРІСЏР·Р°РЅРЅС‹С… Journal-СЃРґРµР»РѕРє Рё РѕС‚РєР»РѕРЅРµРЅРёР№ РѕС‚ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°.",
executionFocusEmpty:
  "РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ linked trades РґР»СЏ РїРµСЂСЃРѕРЅР°Р»СЊРЅРѕРіРѕ С„РѕРєСѓСЃР°. РЎРѕР·РґР°Р№ СЃРґРµР»РєРё РёР· СЃРёРіРЅР°Р»РѕРІ, С‡С‚РѕР±С‹ SkillEdge РЅР°С‡Р°Р» РЅР°С…РѕРґРёС‚СЊ РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ СЃР»Р°Р±С‹Рµ РјРµСЃС‚Р°.",
focusEntryText:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” entry timing. РџСЂРѕРІРµСЂСЊ, РЅРµ РІС…РѕРґРёС€СЊ Р»Рё С‚С‹ РїРѕР·РґРЅРѕ РёР»Рё РІРЅРµ РїР»Р°РЅРѕРІРѕР№ Р·РѕРЅС‹ СЃРёРіРЅР°Р»Р°.",
focusStopText:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” stop discipline. РџСЂРѕРІРµСЂСЊ, РЅРµ РјРµРЅСЏРµС€СЊ Р»Рё СЃС‚РѕРї РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РїР»Р°РЅР° Рё РЅРµ Р»РѕРјР°РµС€СЊ Р»Рё risk/reward.",
focusDirectionText:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” direction discipline. РџСЂРѕРІРµСЂСЊ, РЅРµ С‚РѕСЂРіСѓРµС€СЊ Р»Рё РїСЂРѕС‚РёРІ РЅР°РїСЂР°РІР»РµРЅРёСЏ alert РёР»Рё Р±РµР· РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃС†РµРЅР°СЂРёСЏ.",
focusTargetText:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” target management. РџСЂРѕРІРµСЂСЊ, РєР°Рє С‚С‹ РІРµРґС‘С€СЊ СЃРґРµР»РєСѓ РїРѕСЃР»Рµ РІС…РѕРґР° Рё РЅРµ РІС‹С…РѕРґРёС€СЊ Р»Рё С…Р°РѕС‚РёС‡РЅРѕ.",
focusStrongText:
  "РСЃРїРѕР»РЅРµРЅРёРµ РІС‹РіР»СЏРґРёС‚ СЃРёР»СЊРЅС‹Рј. РџСЂРѕРґРѕР»Р¶Р°Р№ С„РёРєСЃРёСЂРѕРІР°С‚СЊ С‚Р°РєРёРµ СЃРґРµР»РєРё вЂ” СЌС‚Рѕ Р±Р°Р·Р° РґР»СЏ Р±СѓРґСѓС‰РёС… Personal AI Alerts.",
openFocusAlerts: "РћС‚РєСЂС‹С‚СЊ alerts СЃ СЌС‚РёРј С„РѕРєСѓСЃРѕРј",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge РїСЂРµРІСЂР°С‰Р°РµС‚ РіР»Р°РІРЅС‹Р№ execution focus РІ РєРѕРЅРєСЂРµС‚РЅС‹Рµ РїСЂР°РІРёР»Р° РЅР° СЃР»РµРґСѓСЋС‰СѓСЋ С‚РѕСЂРіРѕРІСѓСЋ РЅРµРґРµР»СЋ.",
entryActionOne: "Р‘РµСЂРё РІС…РѕРґ С‚РѕР»СЊРєРѕ РІРЅСѓС‚СЂРё РїР»Р°РЅРѕРІРѕР№ entry zone РёР»Рё РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅРѕРіРѕ reclaim/rejection.",
entryActionTwo: "РќРµ РґРѕРіРѕРЅСЏР№ СЃРІРµС‡Сѓ РїРѕСЃР»Рµ trigger вЂ” РїРѕР·РґРЅРёР№ РІС…РѕРґ Р»СѓС‡С€Рµ РѕС‚РјРµС‚РёС‚СЊ РєР°Рє Missed.",
entryActionThree: "РџРµСЂРµРґ РІС…РѕРґРѕРј РїСЂРѕРІРµСЂСЊ: С†РµРЅР°, СЃС‚РѕРї Рё СЂРёСЃРє РІСЃС‘ РµС‰С‘ РґР°СЋС‚ РЅРѕСЂРјР°Р»СЊРЅС‹Р№ risk/reward.",
stopActionOne: "РџРµСЂРµРґ СЃРґРµР»РєРѕР№ Р·Р°СЂР°РЅРµРµ Р·Р°РїРёС€Рё stop/invalidation Рё РЅРµ РґРІРёРіР°Р№ РµРіРѕ Р±РµР· РЅРѕРІРѕРіРѕ СЃС†РµРЅР°СЂРёСЏ.",
stopActionTwo: "Р•СЃР»Рё СЃС‚РѕРї РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РїР»Р°РЅР° alert вЂ” СѓРјРµРЅСЊС€Рё СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё РёР»Рё РїСЂРѕРїСѓСЃС‚Рё СЃРґРµР»РєСѓ.",
stopActionThree: "РџРѕСЃР»Рµ СЃРґРµР»РєРё РїСЂРѕРІРµСЂСЊ, РЅРµ СЃР»РѕРјР°Р» Р»Рё РёР·РјРµРЅС‘РЅРЅС‹Р№ СЃС‚РѕРї РѕР¶РёРґР°РµРјС‹Р№ risk/reward.",
directionActionOne: "РќРµ С‚РѕСЂРіСѓР№ РїСЂРѕС‚РёРІ direction alert Р±РµР· СЃРёР»СЊРЅРѕРіРѕ reverse-confirmation.",
directionActionTwo: "РџРµСЂРµРґ РІС…РѕРґРѕРј РїСЂРѕРІРµСЂСЊ, СЃРѕРІРїР°РґР°РµС‚ Р»Рё С‚РІРѕСЏ СЃРґРµР»РєР° СЃ РЅР°РїСЂР°РІР»РµРЅРёРµРј setup.",
directionActionThree: "Р•СЃР»Рё СЂС‹РЅРѕРє СЃРјРµРЅРёР» СЃС‚СЂСѓРєС‚СѓСЂСѓ вЂ” РѕС‚РјРµС‚СЊ alert РєР°Рє Skipped/Missed, Р° РЅРµ РІС…РѕРґРё РёРјРїСѓР»СЊСЃРёРІРЅРѕ.",
targetActionOne: "Р”Рѕ РІС…РѕРґР° РІС‹Р±РµСЂРё РѕСЃРЅРѕРІРЅРѕР№ target Рё partial plan.",
targetActionTwo: "РџРѕСЃР»Рµ TP1 РЅРµ РІС‹С…РѕРґРё С…Р°РѕС‚РёС‡РЅРѕ вЂ” РІРµРґРё СЃРґРµР»РєСѓ РїРѕ Р·Р°СЂР°РЅРµРµ Р·Р°РґР°РЅРЅРѕРјСѓ management plan.",
targetActionThree: "Р•СЃР»Рё С†РµРЅР° РЅРµ РёРґС‘С‚ Рє target вЂ” РѕС†РµРЅРё invalidation, Р° РЅРµ РЅР°РґРµР№СЃСЏ.",
strongActionOne: "РџСЂРѕРґРѕР»Р¶Р°Р№ СЃРѕС…СЂР°РЅСЏС‚СЊ СЃРґРµР»РєРё, РіРґРµ С‚С‹ СЃР»РµРґРѕРІР°Р» РїР»Р°РЅСѓ alert.",
strongActionTwo: "РС‰Рё РїРѕРІС‚РѕСЂСЏРµРјРѕСЃС‚СЊ: РєР°РєРёРµ setup С‡Р°С‰Рµ РґР°СЋС‚ СЃРёР»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ.",
strongActionThree: "Р­С‚Рё СЃРґРµР»РєРё РїРѕР·Р¶Рµ СЃС‚Р°РЅСѓС‚ Р±Р°Р·РѕР№ РґР»СЏ Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge СЃСЂР°РІРЅРёРІР°РµС‚ СЂРµС€РµРЅРёРµ РєР»РёРµРЅС‚Р° СЃ С„Р°РєС‚РёС‡РµСЃРєРёРј РёСЃС…РѕРґРѕРј СЃРёРіРЅР°Р»Р°, С‡С‚РѕР±С‹ РЅР°С…РѕРґРёС‚СЊ missed opportunities, С…РѕСЂРѕС€РёРµ РїСЂРѕРїСѓСЃРєРё Рё СЃРґРµР»РєРё, РєРѕС‚РѕСЂС‹Рµ С‚СЂРµР±СѓСЋС‚ СЂР°Р·Р±РѕСЂР°.",
outcomeTakenWorked:
  "РўС‹ РІР·СЏР» СЃРёРіРЅР°Р», Рё РѕРЅ РѕС‚СЂР°Р±РѕС‚Р°Р». РџСЂРѕРІРµСЂСЊ, Р±С‹Р»Р° Р»Рё СЃРґРµР»РєР° СЃРѕС…СЂР°РЅРµРЅР° РІ Journal Рё РЅР°СЃРєРѕР»СЊРєРѕ РёСЃРїРѕР»РЅРµРЅРёРµ СЃРѕРІРїР°Р»Рѕ СЃ РїР»Р°РЅРѕРј.",
outcomeTakenFailed:
  "РўС‹ РІР·СЏР» СЃРёРіРЅР°Р», РЅРѕ РѕРЅ РЅРµ РѕС‚СЂР°Р±РѕС‚Р°Р». Р Р°Р·Р±РµСЂРё, Р±С‹Р»Рѕ Р»Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ, РЅРµ Р±С‹Р» Р»Рё РІС…РѕРґ РїРѕР·РґРЅРёРј Рё Р±С‹Р» Р»Рё СЃС‚РѕРї РїРѕ РїР»Р°РЅСѓ.",
outcomeSkippedWorked:
  "РЎРёРіРЅР°Р» Р±С‹Р» РїСЂРѕРїСѓС‰РµРЅ, РЅРѕ РїРѕР·Р¶Рµ РѕС‚СЂР°Р±РѕС‚Р°Р». Р­С‚Рѕ missed opportunity вЂ” РїСЂРѕРІРµСЂСЊ, РїРѕС‡РµРјСѓ РЅРµ Р±С‹Р»Рѕ РІС…РѕРґР°: СЃС‚СЂР°С…, РѕС‚СЃСѓС‚СЃС‚РІРёРµ Сѓ СЌРєСЂР°РЅР° РёР»Рё СЃРѕРјРЅРµРЅРёРµ.",
outcomeSkippedFailed:
  "РЎРёРіРЅР°Р» Р±С‹Р» РїСЂРѕРїСѓС‰РµРЅ, Рё РѕРЅ РЅРµ РѕС‚СЂР°Р±РѕС‚Р°Р». Р­С‚Рѕ С…РѕСЂРѕС€РёР№ С„РёР»СЊС‚СЂ вЂ” СЃРѕС…СЂР°РЅРё РїСЂРёС‡РёРЅСѓ, РїРѕС‡РµРјСѓ С‚С‹ РЅРµ РІС…РѕРґРёР».",
outcomeMissedWorked:
  "РўС‹ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє Missed, Рё РѕРЅ РѕС‚СЂР°Р±РѕС‚Р°Р». Р­С‚Рѕ РІР°Р¶РЅР°СЏ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ РґР»СЏ РѕР±СѓС‡РµРЅРёСЏ: С‡С‚Рѕ РїРѕРјРµС€Р°Р»Рѕ РІРєР»СЋС‡РёС‚СЊСЃСЏ РІРѕРІСЂРµРјСЏ?",
outcomeMissedFailed:
  "РўС‹ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє Missed, РЅРѕ РѕРЅ РЅРµ РѕС‚СЂР°Р±РѕС‚Р°Р». РџСЂРѕРїСѓСЃРє Р±С‹Р» Р±РµР·РѕРїР°СЃРЅС‹Рј, РЅРѕ РІСЃС‘ СЂР°РІРЅРѕ РїСЂРѕРІРµСЂСЊ, Р±С‹Р»Р° Р»Рё РёРґРµСЏ РєР°С‡РµСЃС‚РІРµРЅРЅРѕР№.",
outcomePendingNote:
  "Outcome РµС‰С‘ pending. РџРѕР·Р¶Рµ SkillEdge СЃРјРѕР¶РµС‚ СЃСЂР°РІРЅРёС‚СЊ С‚РІРѕС‘ СЂРµС€РµРЅРёРµ СЃ С„Р°РєС‚РёС‡РµСЃРєРёРј РґРІРёР¶РµРЅРёРµРј С†РµРЅС‹.",
outcomeNeutralNote:
  "Outcome neutral. РЎРёРіРЅР°Р» РЅРµ РґР°Р» С‡РёСЃС‚РѕРіРѕ follow-through, РїРѕСЌС‚РѕРјСѓ РІР°Р¶РЅРѕ РѕС†РµРЅРёРІР°С‚СЊ С‚РѕР»СЊРєРѕ РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёСЏ, Р° РЅРµ С‚РѕР»СЊРєРѕ PnL.",
outcomeLearningLabel: "Learning note",
outcomeStatsLabel: "Outcome stats",
outcomeLearningAnalyticsTitle: "Outcome Learning Analytics",
outcomeLearningAnalyticsText:
  "SkillEdge РіСЂСѓРїРїРёСЂСѓРµС‚ alerts РїРѕ СЂРµС€РµРЅРёСЋ РєР»РёРµРЅС‚Р° Рё С„Р°РєС‚РёС‡РµСЃРєРѕРјСѓ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ СЃРёРіРЅР°Р»Р°: С‡С‚Рѕ Р±С‹Р»Рѕ РІР·СЏС‚Рѕ, С‡С‚Рѕ РїСЂРѕРІР°Р»РёР»РѕСЃСЊ, С‡С‚Рѕ СЃС‚Р°Р»Рѕ missed opportunity Рё РіРґРµ РєР»РёРµРЅС‚ РїСЂР°РІРёР»СЊРЅРѕ РѕС‚С„РёР»СЊС‚СЂРѕРІР°Р» РїР»РѕС…СѓСЋ РёРґРµСЋ.",
filterTakenWorked: "Taken + Worked",
filterTakenFailed: "Taken + Failed",
filterMissedOpportunity: "Missed opportunity",
filterGoodSkip: "Good skip",
takenWorkedText: "РЎРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РІР·СЏР» Рё РєРѕС‚РѕСЂС‹Рµ РѕС‚СЂР°Р±РѕС‚Р°Р»Рё.",
takenFailedText: "РЎРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РІР·СЏР», РЅРѕ РѕРЅРё РЅРµ РѕС‚СЂР°Р±РѕС‚Р°Р»Рё.",
missedOpportunityText: "РЎРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РїСЂРѕРїСѓСЃС‚РёР», РЅРѕ РѕРЅРё РїРѕР·Р¶Рµ РѕС‚СЂР°Р±РѕС‚Р°Р»Рё.",
goodSkipText: "РЎРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РїСЂРѕРїСѓСЃС‚РёР», Рё РѕРЅРё РЅРµ РѕС‚СЂР°Р±РѕС‚Р°Р»Рё.",
outcomeLearningFocusTitle: "Outcome Learning Focus",
outcomeLearningFocusText:
  "SkillEdge РІС‹Р±РёСЂР°РµС‚ РіР»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ РѕР±СѓС‡РµРЅРёСЏ РЅР° РѕСЃРЅРѕРІРµ С‚РѕРіРѕ, РєР°Рє СЂРµС€РµРЅРёСЏ РєР»РёРµРЅС‚Р° СЃРѕРІРїР°Р»Рё СЃ С„Р°РєС‚РёС‡РµСЃРєРёРј РёСЃС…РѕРґРѕРј СЃРёРіРЅР°Р»РѕРІ.",
outcomeFocusTakenWorked:
  "РЎРёР»СЊРЅР°СЏ Р·РѕРЅР°: РєР»РёРµРЅС‚ Р±РµСЂС‘С‚ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РѕС‚СЂР°Р±Р°С‚С‹РІР°СЋС‚. РўРµРїРµСЂСЊ РІР°Р¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ РєР°С‡РµСЃС‚РІРѕ РёСЃРїРѕР»РЅРµРЅРёСЏ Рё РїРѕРІС‚РѕСЂСЏРµРјРѕСЃС‚СЊ СЌС‚РёС… setup.",
outcomeFocusTakenFailed:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” taken failed. РљР»РёРµРЅС‚ Р±РµСЂС‘С‚ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РЅРµ РѕС‚СЂР°Р±Р°С‚С‹РІР°СЋС‚. РќСѓР¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ, РІС…РѕРґ, СЂРёСЃРє Рё С„РёР»СЊС‚СЂС‹ РєР°С‡РµСЃС‚РІР°.",
outcomeFocusMissedOpportunity:
  "Р“Р»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ вЂ” missed opportunities. РљР»РёРµРЅС‚ РїСЂРѕРїСѓСЃРєР°РµС‚ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РїРѕС‚РѕРј РѕС‚СЂР°Р±Р°С‚С‹РІР°СЋС‚. РќСѓР¶РЅРѕ РїРѕРЅСЏС‚СЊ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, СЃРѕРјРЅРµРЅРёРµ, РѕС‚СЃСѓС‚СЃС‚РІРёРµ Сѓ СЌРєСЂР°РЅР° РёР»Рё РїРѕР·РґРЅСЏСЏ СЂРµР°РєС†РёСЏ.",
outcomeFocusGoodSkip:
  "РЎРёР»СЊРЅР°СЏ Р·РѕРЅР° С„РёР»СЊС‚СЂР°С†РёРё: РєР»РёРµРЅС‚ РїСЂРѕРїСѓСЃРєР°РµС‚ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РЅРµ РѕС‚СЂР°Р±Р°С‚С‹РІР°СЋС‚. РќСѓР¶РЅРѕ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРёС‡РёРЅС‹ С‚Р°РєРёС… СЂРµС€РµРЅРёР№ РІ playbook.",
outcomeFocusEmpty:
  "РџРѕРєР° РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РѕС‚РјРµС‡РµРЅРЅС‹С… СЂРµС€РµРЅРёР№ Рё outcomes. РћС‚РјРµС‡Р°Р№ alerts РєР°Рє Taken, Skipped РёР»Рё Missed, С‡С‚РѕР±С‹ SkillEdge РЅР°С‡Р°Р» СЃС‚СЂРѕРёС‚СЊ learning focus.",
openOutcomeFocusAlerts: "РћС‚РєСЂС‹С‚СЊ alerts СЃ СЌС‚РёРј С„РѕРєСѓСЃРѕРј",
missedOpportunityCoachTitle: "Missed Opportunity Coach",
missedOpportunityCoachText:
  "SkillEdge СЂР°Р·Р±РёСЂР°РµС‚ СЂР°Р±РѕС‡РёРµ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РїСЂРѕРїСѓСЃС‚РёР», С‡С‚РѕР±С‹ РЅР°Р№С‚Рё РїРѕРІС‚РѕСЂСЏСЋС‰СѓСЋСЃСЏ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, РѕС‚СЃСѓС‚СЃС‚РІРёРµ Сѓ СЌРєСЂР°РЅР°, РїРѕР·РґРЅСЏСЏ СЂРµР°РєС†РёСЏ РёР»Рё СЃР»Р°Р±РѕРµ РґРѕРІРµСЂРёРµ Рє setup.",
missedOpportunityCoachEmpty:
  "РџРѕРєР° РЅРµС‚ missed opportunities. Р­С‚Рѕ С…РѕСЂРѕС€Рѕ: Р»РёР±Рѕ РєР»РёРµРЅС‚ РЅРµ РїСЂРѕРїСѓСЃРєР°Р» СЂР°Р±РѕС‡РёРµ СЃРёРіРЅР°Р»С‹, Р»РёР±Рѕ outcomes РµС‰С‘ С„РѕСЂРјРёСЂСѓСЋС‚СЃСЏ.",
missedOpportunityTopSetup: "Top missed setup",
missedOpportunityActionPlan: "Missed Opportunity Action Plan",
missedOpportunityActionOne:
  "РџРµСЂРµРґ СЃРµСЃСЃРёРµР№ РІС‹Р±РµСЂРё 2вЂ“3 setup, РєРѕС‚РѕСЂС‹Рµ С‚С‹ РіРѕС‚РѕРІ С‚РѕСЂРіРѕРІР°С‚СЊ Р±РµР· СЃРѕРјРЅРµРЅРёР№ РїСЂРё РїРѕСЏРІР»РµРЅРёРё trigger.",
missedOpportunityActionTwo:
  "Р•СЃР»Рё trigger РїРѕСЏРІРёР»СЃСЏ, РЅРѕ С‚С‹ РЅРµ РІРѕС€С‘Р» вЂ” СЃСЂР°Р·Сѓ РѕС‚РјРµС‚СЊ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, РїРѕР·РґРЅРѕ, РЅРµ Сѓ СЌРєСЂР°РЅР° РёР»Рё РЅРµ С…РІР°С‚РёР»Рѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ.",
missedOpportunityActionThree:
  "Р•СЃР»Рё СЃРёРіРЅР°Р» РѕС‚СЂР°Р±РѕС‚Р°Р» Р±РµР· С‚РµР±СЏ вЂ” РґРѕР±Р°РІСЊ РµРіРѕ РІ playbook Рё СЂРµС€Рё, С‡С‚Рѕ РґРѕР»Р¶РЅРѕ РёР·РјРµРЅРёС‚СЊСЃСЏ, С‡С‚РѕР±С‹ РІ СЃР»РµРґСѓСЋС‰РёР№ СЂР°Р· РЅРµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ.",
alertsStateLoadingTitle: "SkillEdge AI СЃРєР°РЅРёСЂСѓРµС‚ СЂС‹РЅРѕРє",
alertsStateLoadingText:
  "Р—Р°РіСЂСѓР¶Р°РµРј РїРѕСЃР»РµРґРЅРёРµ alerts, РїСЂРѕРІРµСЂСЏРµРј РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РїСЂРёРѕСЂРёС‚РµС‚, Р¶СѓСЂРЅР°Р», outcomes Рё СЃРІРµР¶РµСЃС‚СЊ СЃРёРіРЅР°Р»РѕРІ.",
alertsStateErrorTitle: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ AI Alerts",
alertsStateErrorText:
  "РџСЂРѕРІРµСЂСЊ РїРѕРґРєР»СЋС‡РµРЅРёРµ, Р°РІС‚РѕСЂРёР·Р°С†РёСЋ РёР»Рё РїРѕРІС‚РѕСЂРё Р·Р°РїСЂРѕСЃ. Р•СЃР»Рё РѕС€РёР±РєР° РїРѕРІС‚РѕСЂСЏРµС‚СЃСЏ вЂ” СЌС‚Рѕ РЅСѓР¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ РІ backend/API logs.",
alertsStateEmptyTitle: "AI Trading Desk Р¶РґС‘С‚ РєР°С‡РµСЃС‚РІРµРЅРЅС‹Р№ СЃРµС‚Р°Рї",
alertsStateEmptyText:
  "РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… alerts. Р­С‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge РЅРµ РґРѕР»Р¶РµРЅ СЃС‚СЂРµР»СЏС‚СЊ С€СѓРјРѕРј. Р›СѓС‡С€Рµ РјРµРЅСЊС€Рµ СЃРёРіРЅР°Р»РѕРІ, РЅРѕ РІС‹С€Рµ РєР°С‡РµСЃС‚РІРѕ Рё РїРѕРЅСЏС‚РЅРµРµ СЂРёСЃРє.",
alertsStateFilterEmptyTitle: "РџРѕРґ СЌС‚РѕС‚ С„РёР»СЊС‚СЂ alerts РЅРµС‚",
alertsStateFilterEmptyText:
  "РЎРїРёСЃРѕРє СЂР°Р±РѕС‚Р°РµС‚, РЅРѕ С‚РµРєСѓС‰РёР№ С„РёР»СЊС‚СЂ РЅРµ РЅР°С€С‘Р» РїРѕРґС…РѕРґСЏС‰РёС… СЃРёРіРЅР°Р»РѕРІ. РЎР±СЂРѕСЃСЊ С„РёР»СЊС‚СЂ РёР»Рё РґРѕР¶РґРёСЃСЊ РЅРѕРІРѕР№ high-confidence СЃРёС‚СѓР°С†РёРё.",
alertsStateResetFilters: "РЎР±СЂРѕСЃРёС‚СЊ С„РёР»СЊС‚СЂС‹",
alertsStateRetry: "РџРѕРІС‚РѕСЂРёС‚СЊ Р·Р°РіСЂСѓР·РєСѓ",
alertsStateRunScan: "Р—Р°РїСѓСЃС‚РёС‚СЊ СЃРєР°РЅ",
alertsStateLiveNote: "Live monitoring СЂР°Р±РѕС‚Р°РµС‚ РІ С„РѕРЅРµ",
selectedFilter: "Р’С‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ",
totalAlerts: "Р’СЃРµРіРѕ alerts",
alertsStateErrorLabel: "РћС€РёР±РєР°",
alertsStateLoadingLabel: "Р—Р°РіСЂСѓР·РєР°",
alertsStateWaitingLabel: "РћР¶РёРґР°РЅРёРµ",
alertsStateLiveMonitoringLabel: "Р¤РѕРЅРѕРІС‹Р№ РјРѕРЅРёС‚РѕСЂРёРЅРі",
decisionVsOutcomeLabel: "Р РµС€РµРЅРёРµ / outcome",
nextLearningFocus: "РЎР»РµРґСѓСЋС‰РёР№ learning focus",
noFocusYet: "Р¤РѕРєСѓСЃ РїРѕРєР° РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅ",
outcomeProfileStillForming: "Outcome learning profile РµС‰С‘ С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ",
missedOpportunitiesLabel: "missed opportunities",
noMissedOpportunityPatternTitle: "РџР°С‚С‚РµСЂРЅ missed opportunities РїРѕРєР° РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅ",
workedAlertsMissedSuffix: "СЂР°Р±РѕС‡РёС… alerts Р±С‹Р»Рё РїСЂРѕРїСѓС‰РµРЅС‹ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ setup.",
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
  "Keep the page open вЂ” the list refreshes automatically every 60 seconds.",
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
  "This trade is already linked to the alert. SkillEdge can compare the signal plan with the clientвЂ™s real execution.",
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
  "SkillEdge reviews the clientвЂ™s execution against the signal plan: entry, stop, direction, targets and discipline.",
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
  "Execution looks strong. Keep logging these trades вЂ” they become the base for future Personal AI Alerts.",
openFocusAlerts: "Open alerts with this focus",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge turns the main execution focus into concrete rules for the next trading week.",
entryActionOne: "Only take entries inside the planned entry zone or after confirmed reclaim/rejection.",
entryActionTwo: "Do not chase after the trigger candle вЂ” late entry should be marked as Missed.",
entryActionThree: "Before entry, check that price, stop and risk still offer valid risk/reward.",
stopActionOne: "Before the trade, write the stop/invalidation and do not move it without a new scenario.",
stopActionTwo: "If your stop differs from the alert plan, reduce size or skip the trade.",
stopActionThree: "After the trade, check whether the changed stop broke the expected risk/reward.",
directionActionOne: "Do not trade against the alert direction without strong reverse confirmation.",
directionActionTwo: "Before entry, check whether your trade matches the setup direction.",
directionActionThree: "If market structure changes, mark the alert as Skipped/Missed instead of entering impulsively.",
targetActionOne: "Before entry, choose the main target and partial plan.",
targetActionTwo: "After TP1, do not exit randomly вЂ” manage the trade by the predefined plan.",
targetActionThree: "If price does not move toward target, evaluate invalidation instead of hoping.",
strongActionOne: "Keep saving trades where you followed the alert plan.",
strongActionTwo: "Look for repetition: which setups produce strong execution most often.",
strongActionThree: "These trades become the base for Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge compares the clientвЂ™s decision with the actual signal outcome to detect missed opportunities, good skips and trades that need review.",
outcomeTakenWorked:
  "You took the signal and it worked. Check whether the trade was saved in Journal and how closely execution followed the plan.",
outcomeTakenFailed:
  "You took the signal but it failed. Review confirmation, late entry risk and whether the stop followed the plan.",
outcomeSkippedWorked:
  "The signal was skipped and then worked. This is a missed opportunity вЂ” check why you did not enter: fear, not at desk or hesitation.",
outcomeSkippedFailed:
  "The signal was skipped and failed. This was a good filter вЂ” save the reason why you avoided it.",
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
  "SkillEdge groups alerts by the clientвЂ™s decision and the actual signal outcome: what was taken, what failed, what became a missed opportunity and where the client correctly filtered a bad idea.",
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
  "SkillEdge selects the main learning focus based on how the clientвЂ™s decisions matched the actual signal outcomes.",
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
  "Before the session, choose 2вЂ“3 setups you are ready to trade without hesitation when the trigger appears.",
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
        "РћСЃС‚Р°РЅРЅС– СЃРёРіРЅР°Р»Рё: РЅР°РїСЂСЏРјРѕРє, setup, entry zone, stop, targets, risk С– management plan.",
      generate: "РЎРєР°РЅСѓРІР°С‚Рё СЂРёРЅРѕРє",
      generating: "РЎРєР°РЅСѓС”РјРѕ...",
      refresh: "РћРЅРѕРІРёС‚Рё",
      checkOutcomes: "РџРµСЂРµРІС–СЂРёС‚Рё СЂРµР·СѓР»СЊС‚Р°С‚Рё",
checkingOutcomes: "РџРµСЂРµРІС–СЂСЏС”РјРѕ...",
      empty: "РђРєС‚РёРІРЅРёС… alerts РїРѕРєРё РЅРµРјР°С”. Р—Р°РїСѓСЃС‚Рё СЃРєР°РЅСѓРІР°РЅРЅСЏ.",
      locked:
  "AI Alerts РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РЅР° SkillEdge Elite. SkillEdge Edge РІС–РґРєСЂРёРІР°С” AI Scanner / Market Intelligence, Р°Р»Рµ real-time AI Alerts, floating alerts widget С– Signal-to-Journal workflow РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РІ Elite.",
      direction: "Direction",
      structureTitle: "РЎС‚СЂСѓРєС‚СѓСЂР° СЂРёРЅРєСѓ",
structureBased: "РџР»Р°РЅ РїРѕР±СѓРґРѕРІР°РЅРѕ Р·Р° СЃРІС–С‡РєР°РјРё / VWAP / СЂС–РІРЅСЏРјРё",
fallbackBased: "Fallback-РїР»Р°РЅ: Р±СЂР°РєСѓС” СЃРІС–С‡РѕРє/СЂС–РІРЅС–РІ",
rr: "RR",
vwap: "VWAP",
atr: "ATR",
support: "РќР°Р№Р±Р»РёР¶С‡Р° РїС–РґС‚СЂРёРјРєР°",
resistance: "РќР°Р№Р±Р»РёР¶С‡РёР№ РѕРїС–СЂ",
candles: "РЎРІС–С‡РєРё",
missingData: "Р‘СЂР°РєСѓС” РґР°РЅРёС…",
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
openPlaybook: "Р’С–РґРєСЂРёС‚Рё Playbook",
hidePlaybook: "РЎС…РѕРІР°С‚Рё Playbook",
playbookTitle: "Personal Signal Playbook",
playbookText:
  "РўРІРѕСЏ РѕСЃРѕР±РёСЃС‚Р° Р±Р°Р·Р° Р·Р±РµСЂРµР¶РµРЅРёС… СЃРµС‚Р°РїС–РІ: Р»РѕРіС–РєР°, РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, РїРѕРјРёР»РєРё С‚Р° РїСЂРёРєР»Р°РґРё СЃРёРіРЅР°Р»С–РІ.",
playbookEmpty:
  "Р—Р±РµСЂРµР¶РµРЅРёС… СЃРµС‚Р°РїС–РІ РїРѕРєРё РЅРµРјР°С”. РќР°С‚РёСЃРЅРё Save to Playbook РЅР° Р±СѓРґСЊ-СЏРєРѕРјСѓ СЃРёРіРЅР°Р»С–.",
playbookLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ playbook...",
lastExample: "Last example",
openSignalProfile: "Р’С–РґРєСЂРёС‚Рё Signal Profile",
hideSignalProfile: "РЎС…РѕРІР°С‚Рё Signal Profile",
rebuildSignalProfile: "РџРµСЂРµР·С–Р±СЂР°С‚Рё РїСЂРѕС„С–Р»СЊ",
rebuildingSignalProfile: "Р—Р±РёСЂР°С”РјРѕ РїСЂРѕС„С–Р»СЊ...",
signalProfileTitle: "Personal Signal Profile",
signalProfileText:
  "SkillEdge AI РїРѕРєР°Р·СѓС”, СЏРєС– AI-СЃРµС‚Р°РїРё С‚Рё С‚РѕСЂРіСѓС”С€ РєСЂР°С‰Рµ, РґРµ РІС‚СЂР°С‡Р°С”С€ РіСЂРѕС€С– С– СЏРєС– СЃРёРіРЅР°Р»Рё РІР°СЂС‚Рѕ РїСЂС–РѕСЂРёС‚РµР·СѓРІР°С‚Рё.",
signalProfileEmpty:
  "РџСЂРѕС„С–Р»СЊ РїРѕРєРё РїРѕСЂРѕР¶РЅС–Р№. РЎС‚РІРѕСЂРё СѓРіРѕРґРё Р· AI Alerts С– Р·Р±РµСЂРµР¶Рё С—С… Сѓ Р¶СѓСЂРЅР°Р».",
signalProfileLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ signal profile...",
personalStrength: "Personal strength",
riskZone: "Risk zone",
learningProfile: "Learning",
neutralProfile: "Neutral",
strengthScore: "Strength score",
planAdherence: "Plan adherence",
aiNote: "AI note",
openTradePatterns: "Р’С–РґРєСЂРёС‚Рё Trade Patterns",
hideTradePatterns: "РЎС…РѕРІР°С‚Рё Trade Patterns",
rebuildTradePatterns: "Р—РЅР°Р№С‚Рё РјРѕС— РїР°С‚РµСЂРЅРё",
rebuildingTradePatterns: "РЁСѓРєР°С”РјРѕ РїР°С‚РµСЂРЅРё...",
tradePatternsTitle: "Independent Trade Pattern Profile",
tradePatternsText:
  "SkillEdge AI Р°РЅР°Р»С–Р·СѓС” С‚РІРѕС— СЃР°РјРѕСЃС‚С–Р№РЅС– РїСЂРёР±СѓС‚РєРѕРІС– СѓРіРѕРґРё Р· Journal С– Р·РЅР°С…РѕРґРёС‚СЊ РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїР°С‚РµСЂРЅРё РґР»СЏ РјР°Р№Р±СѓС‚РЅС–С… Personal AI Alerts.",
tradePatternsEmpty:
  "РџР°С‚РµСЂРЅС–РІ РїРѕРєРё РЅРµРјР°С”. Р”РѕРґР°Р№ Сѓ Journal РєС–Р»СЊРєР° СЃР°РјРѕСЃС‚С–Р№РЅРёС… РїСЂРёР±СѓС‚РєРѕРІРёС… СѓРіРѕРґ.",
tradePatternsLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ trade patterns...",
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
filterDecisionWatching: "Watching",
filterDecisionTaken: "Taken",
filterDecisionSkipped: "Skipped",
filterDecisionMissed: "Missed",
decisionAnalyticsTitle: "Signal-to-Trade Decisions",
decisionAnalyticsText:
  "РўСѓС‚ РІРёРґРЅРѕ, СЏРє РєР»С–С”РЅС‚ РїСЂР°С†СЋС” Р· СЃРёРіРЅР°Р»Р°РјРё: СЃРїРѕСЃС‚РµСЂС–РіР°С”, Р±РµСЂРµ, РїСЂРѕРїСѓСЃРєР°С” Р°Р±Рѕ РІС–РґРјС–С‡Р°С” missed. Р¦Рµ Р±Р°Р·Р° РјР°Р№Р±СѓС‚РЅСЊРѕС— СЃС‚Р°С‚РёСЃС‚РёРєРё СЏРєРѕСЃС‚С– СЃРёРіРЅР°Р»С–РІ С– РІРёРєРѕРЅР°РЅРЅСЏ.",
filterEmpty: "РќРµРјР°С” alerts РґР»СЏ РІРёР±СЂР°РЅРѕРіРѕ С„С–Р»СЊС‚СЂР°.",
openAlertDetails: "Р’С–РґРєСЂРёС‚Рё СЂРѕР·Р±С–СЂ",
hideAlertDetails: "РЎС…РѕРІР°С‚Рё СЂРѕР·Р±С–СЂ",
liveDesk: "Live AI Trading Desk",
lastChecked: "РћСЃС‚Р°РЅРЅСЏ РїРµСЂРµРІС–СЂРєР°",
autoRefreshNote:
  "Alerts РѕРЅРѕРІР»СЋСЋС‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ. Market scan РїСЂР°С†СЋС” Сѓ С„РѕРЅС–, СЃРїРёСЃРѕРє РѕРЅРѕРІР»СЋС”С‚СЊСЃСЏ РєРѕР¶РЅС– 60 СЃРµРєСѓРЅРґ.",
showMoreAlerts: "РџРѕРєР°Р·Р°С‚Рё С‰Рµ 10",
collapseAlerts: "Р—РіРѕСЂРЅСѓС‚Рё РІСЃРµ",    
emptyDeskTitle: "AI Trading Desk С‡РµРєР°С” СЏРєС–СЃРЅРёР№ СЃРµС‚Р°Рї",
emptyDeskText:
  "Р—Р°СЂР°Р· РЅРµРјР°С” active alerts РґР»СЏ РІРёР±СЂР°РЅРѕРіРѕ С„С–Р»СЊС‚СЂР°. Р¦Рµ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge AI РЅРµ РјР°С” СЃС‚СЂС–Р»СЏС‚Рё С€СѓРјРѕРј. РЎРёСЃС‚РµРјР° С‡РµРєР°С” high-confidence СЃРёС‚СѓР°С†С–СЋ Р· С‡С–С‚РєРёРј trigger, stop, targets С– risk note.",
emptyDeskAction:
  "Р—Р°Р»РёС€ СЃС‚РѕСЂС–РЅРєСѓ РІС–РґРєСЂРёС‚РѕСЋ вЂ” СЃРїРёСЃРѕРє РѕРЅРѕРІР»СЋС”С‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ РєРѕР¶РЅС– 60 СЃРµРєСѓРЅРґ.",
confidenceTransparency: "Score transparency",
confidenceTransparencyText:
  "Р§РѕРјСѓ SkillEdge AI РІРёРґС–Р»РёРІ С†РµР№ СЃРёРіРЅР°Р» С– СЏРєС– С„Р°РєС‚РѕСЂРё РїС–РґСЃРёР»СЋСЋС‚СЊ Р°Р±Рѕ РїРѕСЃР»Р°Р±Р»СЋСЋС‚СЊ С–РґРµСЋ.",
breakdownTitle: "SkillEdge AI Signal Breakdown",
traderDecision: "Trader Decision",
tradePlan: "Trade Plan",
whyNow: "Why now",
confirmationChecklist: "Confirmation Checklist",
avoidThisTradeIf: "Avoid This Trade If",
learningLayer: "Learning Layer",
closeBreakdown: "Р—Р°РєСЂРёС‚Рё СЂРѕР·Р±С–СЂ",
decisionTitle: "РњРѕС” СЂС–С€РµРЅРЅСЏ",
decisionWatching: "Watching",
decisionTaken: "Taken",
decisionSkipped: "Skipped",
decisionMissed: "Missed",
decisionSaved: "Decision saved",
decisionReasonTitle: "РџСЂРёС‡РёРЅР° СЂС–С€РµРЅРЅСЏ",
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
  "SkillEdge РІС–РґСЃС‚РµР¶СѓС” РїСЂРёС‡РёРЅРё СЂС–С€РµРЅСЊ, С‰РѕР± РїРѕС‚С–Рј РїРѕРєР°Р·СѓРІР°С‚Рё, РґРµ РєР»С–С”РЅС‚ РІС‚СЂР°С‡Р°С” РЅР°Р№РєСЂР°С‰С– РјРѕР¶Р»РёРІРѕСЃС‚С–: Р·Р°РїС–Р·РЅРµРЅРЅСЏ, РІС–РґСЃСѓС‚РЅС–СЃС‚СЊ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, РІРёСЃРѕРєРёР№ СЂРёР·РёРє Р°Р±Рѕ РїСЂРѕР±Р»РµРјРё Р· Р»С–РєРІС–РґРЅС–СЃС‚СЋ.",
topReason: "Top reason",
allReasons: "РЈСЃС– РїСЂРёС‡РёРЅРё",
journalSyncTitle: "Journal Sync",
journalSyncText:
  "РўРё РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє Taken. РЎС‚РІРѕСЂРё СѓРіРѕРґСѓ С–Р· СЃРёРіРЅР°Р»Сѓ, С‰РѕР± SkillEdge РїРѕСЂС–РІРЅСЏРІ РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· С‚РІРѕС—Рј СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј: РІС…С–Рґ, СЃС‚РѕРї, РІРёС…С–Рґ, PnL С– СЏРєС–СЃС‚СЊ СѓРіРѕРґРё.",
journalSyncAction: "РЎС‚РІРѕСЂРёС‚Рё trade draft",
linkedJournalTitle: "Linked Journal Trade",
linkedJournalText:
  "Р¦СЏ СѓРіРѕРґР° РІР¶Рµ РїРѕРІвЂ™СЏР·Р°РЅР° Р· alert. SkillEdge Р·РјРѕР¶Рµ РїРѕСЂС–РІРЅСЏС‚Рё РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј РєР»С–С”РЅС‚Р°.",
linkedJournalEmpty:
  "РџРѕРєРё РЅРµРјР°С” Р·Р±РµСЂРµР¶РµРЅРѕС— СѓРіРѕРґРё РІ Р¶СѓСЂРЅР°Р»С–, РїРѕРІвЂ™СЏР·Р°РЅРѕС— Р· С†РёРј alert.",
linkedTrades: "Linked trades",
linkedPnl: "Linked PnL",
linkedResult: "Result",
journalLinkAnalyticsTitle: "Signal в†” Journal Sync",
journalLinkAnalyticsText:
  "SkillEdge РІС–РґСЃС‚РµР¶СѓС”, СЏРєС– alerts СЃС‚Р°Р»Рё СЂРµР°Р»СЊРЅРёРјРё СѓРіРѕРґР°РјРё РІ Journal. Р¦Рµ Р±Р°Р·Р° РґР»СЏ Р°РЅР°Р»С–Р·Сѓ РІРёРєРѕРЅР°РЅРЅСЏ, PnL РїРѕ СЃРёРіРЅР°Р»Р°С… С– РїСЂРѕРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№.",
takenWithoutJournal: "Taken Р±РµР· Journal",
linkedAlertsCount: "Linked alerts",
linkedTradesPnl: "Linked trades PnL",
avgExecutionScore: "Avg execution",
takenWithoutJournalFilter: "Taken Р±РµР· Journal",
takenWithoutJournalTitle: "Taken alert Р±РµР· СѓРіРѕРґРё РІ Journal",
takenWithoutJournalText:
  "РљР»С–С”РЅС‚ РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє Taken, Р°Р»Рµ С‰Рµ РЅРµ Р·Р±РµСЂС–Рі СѓРіРѕРґСѓ РІ Р¶СѓСЂРЅР°Р»С–. РЎС‚РІРѕСЂРё trade draft, С‰РѕР± SkillEdge Р·РјС–Рі РїРѕСЂС–РІРЅСЏС‚Рё РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј.",
executionScore: "Execution score",
executionReview: "Execution review",
executionStrong: "РЎРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ",
executionMedium: "РќРѕСЂРјР°Р»СЊРЅРѕ, Р°Р»Рµ С” С‰Рѕ РїРѕРєСЂР°С‰РёС‚Рё",
executionWeak: "РџРѕС‚СЂС–Р±РµРЅ СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ",
filterJournalLinked: "Journal linked",
filterExecutionStrong: "Strong execution",
filterExecutionReview: "Needs review",
executionQualityTitle: "Execution Quality",
executionQualityText:
  "SkillEdge РїРѕРєР°Р·СѓС”, СЏРєС– AI Alerts РІР¶Рµ СЃС‚Р°Р»Рё СѓРіРѕРґР°РјРё РІ Journal С– РґРµ РІРёРєРѕРЅР°РЅРЅСЏ Р±СѓР»Рѕ СЃРёР»СЊРЅРёРј Р°Р±Рѕ РїРѕС‚СЂРµР±СѓС” СЂРѕР·Р±РѕСЂСѓ.",
executionCoachTitle: "AI Execution Coach",
executionCoachText:
  "SkillEdge СЂРѕР·Р±РёСЂР°С” РІРёРєРѕРЅР°РЅРЅСЏ РєР»С–С”РЅС‚Р° РІС–РґРЅРѕСЃРЅРѕ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ: РІС…С–Рґ, СЃС‚РѕРї, РЅР°РїСЂСЏРјРѕРє, targets С– РґРёСЃС†РёРїР»С–РЅСѓ.",
executionCoachStrong:
  "РЎРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ: РєР»С–С”РЅС‚ Р·Р°РіР°Р»РѕРј РґРѕС‚СЂРёРјР°РІСЃСЏ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ. РўР°РєС– СѓРіРѕРґРё РІР°СЂС‚Рѕ Р·Р±РµСЂС–РіР°С‚Рё СЏРє РѕСЃРѕР±РёСЃС‚РёР№ СЃРёР»СЊРЅРёР№ РїР°С‚РµСЂРЅ.",
executionCoachMedium:
  "Р’РёРєРѕРЅР°РЅРЅСЏ РЅРѕСЂРјР°Р»СЊРЅРµ, Р°Р»Рµ С” Р·РѕРЅРё РґР»СЏ РїРѕРєСЂР°С‰РµРЅРЅСЏ. РџРµСЂРµРІС–СЂ РІС…С–Рґ, СЃС‚РѕРї С– management РїС–СЃР»СЏ РїРµСЂС€РѕРіРѕ target.",
executionCoachWeak:
  "Р’РёРєРѕРЅР°РЅРЅСЏ РїРѕС‚СЂРµР±СѓС” СЂРѕР·Р±РѕСЂСѓ. Р™РјРѕРІС–СЂРЅРѕ, РєР»С–С”РЅС‚ РІС–РґС–Р№С€РѕРІ РІС–Рґ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ: РїС–Р·РЅС–Р№ РІС…С–Рґ, С–РЅС€РёР№ СЃС‚РѕРї Р°Р±Рѕ СЃР»Р°Р±РєР° РґРёСЃС†РёРїР»С–РЅР° СЃС†РµРЅР°СЂС–СЋ.",
executionCoachEntryIssue:
  "Entry issue: РІС…С–Рґ Р±СѓРІ РїРѕР·Р° РїР»Р°РЅРѕРІРѕСЋ Р·РѕРЅРѕСЋ Р°Р±Рѕ Р·Р°РЅР°РґС‚Рѕ РїС–Р·РЅРѕ РїС–СЃР»СЏ СЃРёРіРЅР°Р»Сѓ.",
executionCoachStopIssue:
  "Stop issue: СЃС‚РѕРї РІС–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ РІС–Рґ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ. Р¦Рµ РјРѕР¶Рµ Р»Р°РјР°С‚Рё СЃС‚Р°С‚РёСЃС‚РёРєСѓ С– risk/reward.",
executionCoachDirectionIssue:
  "Direction issue: РЅР°РїСЂСЏРјРѕРє СѓРіРѕРґРё РІС–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ РІС–Рґ РЅР°РїСЂСЏРјРєСѓ alert.",
executionCoachTargetIssue:
  "Target issue: СѓРіРѕРґР° РЅРµ РґС–Р№С€Р»Р° РґРѕ TP Р°Р±Рѕ РІРёС…С–Рґ Р±СѓРІ РЅРµ Р·Р° РїР»Р°РЅРѕРј.",
executionWeaknessTitle: "Execution Weakness Map",
executionWeaknessText:
  "SkillEdge РїРѕРєР°Р·СѓС”, РґРµ РєР»С–С”РЅС‚ РЅР°Р№С‡Р°СЃС‚С–С€Рµ РІС–РґС…РёР»СЏС”С‚СЊСЃСЏ РІС–Рґ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ: РІС…С–Рґ, СЃС‚РѕРї, РЅР°РїСЂСЏРјРѕРє Р°Р±Рѕ СѓРїСЂР°РІР»С–РЅРЅСЏ С†С–Р»СЏРјРё.",
entryIssueFilter: "Entry issues",
stopIssueFilter: "Stop issues",
directionIssueFilter: "Direction issues",
targetIssueFilter: "Target issues",
executionFocusTitle: "Personal Execution Focus",
executionFocusText:
  "SkillEdge РѕР±РёСЂР°С” РіРѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ РЅР° РѕСЃРЅРѕРІС– РїРѕРІвЂ™СЏР·Р°РЅРёС… Journal-СѓРіРѕРґ С– РІС–РґС…РёР»РµРЅСЊ РІС–Рґ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ.",
executionFocusEmpty:
  "РџРѕРєРё РЅРµРґРѕСЃС‚Р°С‚РЅСЊРѕ linked trades РґР»СЏ РїРµСЂСЃРѕРЅР°Р»СЊРЅРѕРіРѕ С„РѕРєСѓСЃСѓ. РЎС‚РІРѕСЂСЋР№ СѓРіРѕРґРё Р· alerts, С‰РѕР± SkillEdge РїРѕС‡Р°РІ Р·РЅР°С…РѕРґРёС‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅС– СЃР»Р°Р±РєС– РјС–СЃС†СЏ.",
focusEntryText:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” entry timing. РџРµСЂРµРІС–СЂ, С‡Рё РЅРµ РІС…РѕРґРёС€ С‚Рё Р·Р°РїС–Р·РЅРѕ Р°Р±Рѕ РїРѕР·Р° РїР»Р°РЅРѕРІРѕСЋ Р·РѕРЅРѕСЋ СЃРёРіРЅР°Р»Сѓ.",
focusStopText:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” stop discipline. РџРµСЂРµРІС–СЂ, С‡Рё РЅРµ Р·РјС–РЅСЋС”С€ СЃС‚РѕРї РІС–РґРЅРѕСЃРЅРѕ РїР»Р°РЅСѓ С– С‡Рё РЅРµ Р»Р°РјР°С”С€ risk/reward.",
focusDirectionText:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” direction discipline. РџРµСЂРµРІС–СЂ, С‡Рё РЅРµ С‚РѕСЂРіСѓС”С€ РїСЂРѕС‚Рё РЅР°РїСЂСЏРјРєСѓ alert Р°Р±Рѕ Р±РµР· РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ СЃС†РµРЅР°СЂС–СЋ.",
focusTargetText:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” target management. РџРµСЂРµРІС–СЂ, СЏРє РІРµРґРµС€ СѓРіРѕРґСѓ РїС–СЃР»СЏ РІС…РѕРґСѓ С– С‡Рё РЅРµ РІРёС…РѕРґРёС€ С…Р°РѕС‚РёС‡РЅРѕ.",
focusStrongText:
  "Р’РёРєРѕРЅР°РЅРЅСЏ РІРёРіР»СЏРґР°С” СЃРёР»СЊРЅРёРј. РџСЂРѕРґРѕРІР¶СѓР№ С„С–РєСЃСѓРІР°С‚Рё С‚Р°РєС– СѓРіРѕРґРё вЂ” С†Рµ Р±Р°Р·Р° РґР»СЏ РјР°Р№Р±СѓС‚РЅС–С… Personal AI Alerts.",
openFocusAlerts: "Р’С–РґРєСЂРёС‚Рё alerts Р· С†РёРј С„РѕРєСѓСЃРѕРј",
executionActionPlanTitle: "This Week Action Plan",
executionActionPlanText:
  "SkillEdge РїРµСЂРµС‚РІРѕСЂСЋС” РіРѕР»РѕРІРЅРёР№ execution focus РЅР° РєРѕРЅРєСЂРµС‚РЅС– РїСЂР°РІРёР»Р° РґР»СЏ РЅР°СЃС‚СѓРїРЅРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ С‚РёР¶РЅСЏ.",
entryActionOne: "Р‘РµСЂРё РІС…С–Рґ С‚С–Р»СЊРєРё РІСЃРµСЂРµРґРёРЅС– РїР»Р°РЅРѕРІРѕС— entry zone Р°Р±Рѕ РїС–СЃР»СЏ РїС–РґС‚РІРµСЂРґР¶РµРЅРѕРіРѕ reclaim/rejection.",
entryActionTwo: "РќРµ РЅР°Р·РґРѕРіР°РЅСЏР№ СЃРІС–С‡РєСѓ РїС–СЃР»СЏ trigger вЂ” РїС–Р·РЅС–Р№ РІС…С–Рґ РєСЂР°С‰Рµ РІС–РґРјС–С‚РёС‚Рё СЏРє Missed.",
entryActionThree: "РџРµСЂРµРґ РІС…РѕРґРѕРј РїРµСЂРµРІС–СЂ: С†С–РЅР°, СЃС‚РѕРї С– СЂРёР·РёРє РІСЃРµ С‰Рµ РґР°СЋС‚СЊ РЅРѕСЂРјР°Р»СЊРЅРёР№ risk/reward.",
stopActionOne: "РџРµСЂРµРґ СѓРіРѕРґРѕСЋ Р·Р°Р·РґР°Р»РµРіС–РґСЊ Р·Р°РїРёС€Рё stop/invalidation С– РЅРµ СЂСѓС…Р°Р№ Р№РѕРіРѕ Р±РµР· РЅРѕРІРѕРіРѕ СЃС†РµРЅР°СЂС–СЋ.",
stopActionTwo: "РЇРєС‰Рѕ СЃС‚РѕРї РІС–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ РІС–Рґ РїР»Р°РЅСѓ alert вЂ” Р·РјРµРЅС€ РїРѕР·РёС†С–СЋ Р°Р±Рѕ РїСЂРѕРїСѓСЃС‚Рё СѓРіРѕРґСѓ.",
stopActionThree: "РџС–СЃР»СЏ СѓРіРѕРґРё РїРµСЂРµРІС–СЂ, С‡Рё РЅРµ Р·Р»Р°РјР°РІ Р·РјС–РЅРµРЅРёР№ СЃС‚РѕРї РѕС‡С–РєСѓРІР°РЅРёР№ risk/reward.",
directionActionOne: "РќРµ С‚РѕСЂРіСѓР№ РїСЂРѕС‚Рё direction alert Р±РµР· СЃРёР»СЊРЅРѕРіРѕ reverse-confirmation.",
directionActionTwo: "РџРµСЂРµРґ РІС…РѕРґРѕРј РїРµСЂРµРІС–СЂ, С‡Рё Р·Р±С–РіР°С”С‚СЊСЃСЏ С‚РІРѕСЏ СѓРіРѕРґР° Р· РЅР°РїСЂСЏРјРєРѕРј setup.",
directionActionThree: "РЇРєС‰Рѕ СЂРёРЅРѕРє Р·РјС–РЅРёРІ СЃС‚СЂСѓРєС‚СѓСЂСѓ вЂ” РІС–РґРјС–С‚СЊ alert СЏРє Skipped/Missed, Р° РЅРµ РІС…РѕРґСЊ С–РјРїСѓР»СЊСЃРёРІРЅРѕ.",
targetActionOne: "Р”Рѕ РІС…РѕРґСѓ РѕР±РµСЂРё РѕСЃРЅРѕРІРЅРёР№ target С– partial plan.",
targetActionTwo: "РџС–СЃР»СЏ TP1 РЅРµ РІРёС…РѕРґСЊ С…Р°РѕС‚РёС‡РЅРѕ вЂ” РІРµРґРё СѓРіРѕРґСѓ Р·Р° Р·Р°Р·РґР°Р»РµРіС–РґСЊ Р·Р°РґР°РЅРёРј management plan.",
targetActionThree: "РЇРєС‰Рѕ С†С–РЅР° РЅРµ Р№РґРµ РґРѕ target вЂ” РѕС†С–РЅСЋР№ invalidation, Р° РЅРµ РЅР°РґС–Р№СЃСЏ.",
strongActionOne: "РџСЂРѕРґРѕРІР¶СѓР№ Р·Р±РµСЂС–РіР°С‚Рё СѓРіРѕРґРё, РґРµ С‚Рё РґРѕС‚СЂРёРјР°РІСЃСЏ РїР»Р°РЅСѓ alert.",
strongActionTwo: "РЁСѓРєР°Р№ РїРѕРІС‚РѕСЂСЋРІР°РЅС–СЃС‚СЊ: СЏРєС– setup РЅР°Р№С‡Р°СЃС‚С–С€Рµ РґР°СЋС‚СЊ СЃРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ.",
strongActionThree: "Р¦С– СѓРіРѕРґРё РїС–Р·РЅС–С€Рµ СЃС‚Р°РЅСѓС‚СЊ Р±Р°Р·РѕСЋ РґР»СЏ Personal AI Alerts.",
outcomeFollowupTitle: "Alert Outcome Follow-up",
outcomeFollowupText:
  "SkillEdge РїРѕСЂС–РІРЅСЋС” СЂС–С€РµРЅРЅСЏ РєР»С–С”РЅС‚Р° Р· С„Р°РєС‚РёС‡РЅРёРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј СЃРёРіРЅР°Р»Сѓ, С‰РѕР± Р·РЅР°С…РѕРґРёС‚Рё missed opportunities, С…РѕСЂРѕС€С– РїСЂРѕРїСѓСЃРєРё С‚Р° СѓРіРѕРґРё, СЏРєС– РїРѕС‚СЂРµР±СѓСЋС‚СЊ СЂРѕР·Р±РѕСЂСѓ.",
outcomeTakenWorked:
  "РўРё РІР·СЏРІ СЃРёРіРЅР°Р», С– РІС–РЅ РІС–РґРїСЂР°С†СЋРІР°РІ. РџРµСЂРµРІС–СЂ, С‡Рё Р·Р±РµСЂРµР¶РµРЅР° СѓРіРѕРґР° РІ Journal С– РЅР°СЃРєС–Р»СЊРєРё РІРёРєРѕРЅР°РЅРЅСЏ Р·Р±С–РіР»РѕСЃСЏ Р· РїР»Р°РЅРѕРј.",
outcomeTakenFailed:
  "РўРё РІР·СЏРІ СЃРёРіРЅР°Р», Р°Р»Рµ РІС–РЅ РЅРµ РІС–РґРїСЂР°С†СЋРІР°РІ. Р РѕР·Р±РµСЂРё, С‡Рё Р±СѓР»Рѕ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, С‡Рё РЅРµ Р±СѓРІ РІС…С–Рґ РїС–Р·РЅС–Рј С– С‡Рё Р±СѓРІ СЃС‚РѕРї Р·Р° РїР»Р°РЅРѕРј.",
outcomeSkippedWorked:
  "РЎРёРіРЅР°Р» Р±СѓРІ РїСЂРѕРїСѓС‰РµРЅРёР№, Р°Р»Рµ РїРѕС‚С–Рј РІС–РґРїСЂР°С†СЋРІР°РІ. Р¦Рµ missed opportunity вЂ” РїРµСЂРµРІС–СЂ, С‡РѕРјСѓ РЅРµ Р±СѓР»Рѕ РІС…РѕРґСѓ: СЃС‚СЂР°С…, РЅРµ Р±СѓРІ Р±С–Р»СЏ РµРєСЂР°РЅР° Р°Р±Рѕ СЃСѓРјРЅС–РІ.",
outcomeSkippedFailed:
  "РЎРёРіРЅР°Р» Р±СѓРІ РїСЂРѕРїСѓС‰РµРЅРёР№ С– РЅРµ РІС–РґРїСЂР°С†СЋРІР°РІ. Р¦Рµ С…РѕСЂРѕС€РёР№ С„С–Р»СЊС‚СЂ вЂ” Р·Р±РµСЂРµР¶Рё РїСЂРёС‡РёРЅСѓ, С‡РѕРјСѓ С‚Рё РЅРµ РІС…РѕРґРёРІ.",
outcomeMissedWorked:
  "РўРё РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє Missed, С– РІС–РЅ РІС–РґРїСЂР°С†СЋРІР°РІ. Р¦Рµ РІР°Р¶Р»РёРІР° РјРѕР¶Р»РёРІС–СЃС‚СЊ РґР»СЏ РЅР°РІС‡Р°РЅРЅСЏ: С‰Рѕ Р·Р°РІР°РґРёР»Рѕ РІРєР»СЋС‡РёС‚РёСЃСЏ РІС‡Р°СЃРЅРѕ?",
outcomeMissedFailed:
  "РўРё РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє Missed, Р°Р»Рµ РІС–РЅ РЅРµ РІС–РґРїСЂР°С†СЋРІР°РІ. РџСЂРѕРїСѓСЃРє Р±СѓРІ Р±РµР·РїРµС‡РЅРёРј, Р°Р»Рµ РІСЃРµ РѕРґРЅРѕ РїРµСЂРµРІС–СЂ СЏРєС–СЃС‚СЊ С–РґРµС—.",
outcomePendingNote:
  "Outcome С‰Рµ pending. РџС–Р·РЅС–С€Рµ SkillEdge Р·РјРѕР¶Рµ РїРѕСЂС–РІРЅСЏС‚Рё С‚РІРѕС” СЂС–С€РµРЅРЅСЏ Р· С„Р°РєС‚РёС‡РЅРёРј СЂСѓС…РѕРј С†С–РЅРё.",
outcomeNeutralNote:
  "Outcome neutral. РЎРёРіРЅР°Р» РЅРµ РґР°РІ С‡РёСЃС‚РѕРіРѕ follow-through, С‚РѕРјСѓ РІР°Р¶Р»РёРІРѕ РѕС†С–РЅСЋРІР°С‚Рё СЏРєС–СЃС‚СЊ СЂС–С€РµРЅРЅСЏ, Р° РЅРµ С‚С–Р»СЊРєРё PnL.",
outcomeLearningLabel: "Learning note",
outcomeStatsLabel: "Outcome stats",
outcomeLearningAnalyticsTitle: "Outcome Learning Analytics",
outcomeLearningAnalyticsText:
  "SkillEdge РіСЂСѓРїСѓС” alerts Р·Р° СЂС–С€РµРЅРЅСЏРј РєР»С–С”РЅС‚Р° С– С„Р°РєС‚РёС‡РЅРёРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј СЃРёРіРЅР°Р»Сѓ: С‰Рѕ Р±СѓР»Рѕ РІР·СЏС‚Рѕ, С‰Рѕ РїСЂРѕРІР°Р»РёР»РѕСЃСЊ, С‰Рѕ СЃС‚Р°Р»Рѕ missed opportunity С– РґРµ РєР»С–С”РЅС‚ РїСЂР°РІРёР»СЊРЅРѕ РІС–РґС„С–Р»СЊС‚СЂСѓРІР°РІ СЃР»Р°Р±РєСѓ С–РґРµСЋ.",
filterTakenWorked: "Taken + Worked",
filterTakenFailed: "Taken + Failed",
filterMissedOpportunity: "Missed opportunity",
filterGoodSkip: "Good skip",
takenWorkedText: "РЎРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РІР·СЏРІ С– СЏРєС– РІС–РґРїСЂР°С†СЋРІР°Р»Рё.",
takenFailedText: "РЎРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РІР·СЏРІ, Р°Р»Рµ РІРѕРЅРё РЅРµ РІС–РґРїСЂР°С†СЋРІР°Р»Рё.",
missedOpportunityText: "РЎРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РїСЂРѕРїСѓСЃС‚РёРІ, Р°Р»Рµ РІРѕРЅРё РїРѕС‚С–Рј РІС–РґРїСЂР°С†СЋРІР°Р»Рё.",
goodSkipText: "РЎРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РїСЂРѕРїСѓСЃС‚РёРІ, С– РІРѕРЅРё РЅРµ РІС–РґРїСЂР°С†СЋРІР°Р»Рё.",
outcomeLearningFocusTitle: "Outcome Learning Focus",
outcomeLearningFocusText:
  "SkillEdge РѕР±РёСЂР°С” РіРѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ РЅР°РІС‡Р°РЅРЅСЏ РЅР° РѕСЃРЅРѕРІС– С‚РѕРіРѕ, СЏРє СЂС–С€РµРЅРЅСЏ РєР»С–С”РЅС‚Р° Р·Р±С–РіР»РёСЃСЏ Р· С„Р°РєС‚РёС‡РЅРёРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј СЃРёРіРЅР°Р»С–РІ.",
outcomeFocusTakenWorked:
  "РЎРёР»СЊРЅР° Р·РѕРЅР°: РєР»С–С”РЅС‚ Р±РµСЂРµ СЃРёРіРЅР°Р»Рё, СЏРєС– РІС–РґРїСЂР°С†СЊРѕРІСѓСЋС‚СЊ. РўРµРїРµСЂ РІР°Р¶Р»РёРІРѕ РїРµСЂРµРІС–СЂРёС‚Рё СЏРєС–СЃС‚СЊ РІРёРєРѕРЅР°РЅРЅСЏ С– РїРѕРІС‚РѕСЂСЋРІР°РЅС–СЃС‚СЊ С†РёС… setup.",
outcomeFocusTakenFailed:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” taken failed. РљР»С–С”РЅС‚ Р±РµСЂРµ СЃРёРіРЅР°Р»Рё, СЏРєС– РЅРµ РІС–РґРїСЂР°С†СЊРѕРІСѓСЋС‚СЊ. РџРѕС‚СЂС–Р±РЅРѕ РїРµСЂРµРІС–СЂРёС‚Рё РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, РІС…С–Рґ, СЂРёР·РёРє С– С„С–Р»СЊС‚СЂРё СЏРєРѕСЃС‚С–.",
outcomeFocusMissedOpportunity:
  "Р“РѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ вЂ” missed opportunities. РљР»С–С”РЅС‚ РїСЂРѕРїСѓСЃРєР°С” СЃРёРіРЅР°Р»Рё, СЏРєС– РїРѕС‚С–Рј РІС–РґРїСЂР°С†СЊРѕРІСѓСЋС‚СЊ. РџРѕС‚СЂС–Р±РЅРѕ Р·СЂРѕР·СѓРјС–С‚Рё РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, СЃСѓРјРЅС–РІ, РІС–РґСЃСѓС‚РЅС–СЃС‚СЊ Р±С–Р»СЏ РµРєСЂР°РЅР° Р°Р±Рѕ РїС–Р·РЅСЏ СЂРµР°РєС†С–СЏ.",
outcomeFocusGoodSkip:
  "РЎРёР»СЊРЅР° Р·РѕРЅР° С„С–Р»СЊС‚СЂР°С†С–С—: РєР»С–С”РЅС‚ РїСЂРѕРїСѓСЃРєР°С” СЃРёРіРЅР°Р»Рё, СЏРєС– РЅРµ РІС–РґРїСЂР°С†СЊРѕРІСѓСЋС‚СЊ. РџРѕС‚СЂС–Р±РЅРѕ Р·Р±РµСЂРµРіС‚Рё РїСЂРёС‡РёРЅРё С‚Р°РєРёС… СЂС–С€РµРЅСЊ Сѓ playbook.",
outcomeFocusEmpty:
  "РџРѕРєРё РЅРµРґРѕСЃС‚Р°С‚РЅСЊРѕ РІС–РґРјС–С‡РµРЅРёС… СЂС–С€РµРЅСЊ С– outcomes. Р’С–РґРјС–С‡Р°Р№ alerts СЏРє Taken, Skipped Р°Р±Рѕ Missed, С‰РѕР± SkillEdge РїРѕС‡Р°РІ Р±СѓРґСѓРІР°С‚Рё learning focus.",
openOutcomeFocusAlerts: "Р’С–РґРєСЂРёС‚Рё alerts Р· С†РёРј С„РѕРєСѓСЃРѕРј",
missedOpportunityCoachTitle: "Missed Opportunity Coach",
missedOpportunityCoachText:
  "SkillEdge СЂРѕР·Р±РёСЂР°С” СЂРѕР±РѕС‡С– СЃРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РїСЂРѕРїСѓСЃС‚РёРІ, С‰РѕР± Р·РЅР°Р№С‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅСѓ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, РІС–РґСЃСѓС‚РЅС–СЃС‚СЊ Р±С–Р»СЏ РµРєСЂР°РЅР°, РїС–Р·РЅСЏ СЂРµР°РєС†С–СЏ Р°Р±Рѕ СЃР»Р°Р±РєР° РґРѕРІС–СЂР° РґРѕ setup.",
missedOpportunityCoachEmpty:
  "РџРѕРєРё РЅРµРјР°С” missed opportunities. Р¦Рµ РґРѕР±СЂРµ: Р°Р±Рѕ РєР»С–С”РЅС‚ РЅРµ РїСЂРѕРїСѓСЃРєР°РІ СЂРѕР±РѕС‡С– СЃРёРіРЅР°Р»Рё, Р°Р±Рѕ outcomes С‰Рµ С„РѕСЂРјСѓСЋС‚СЊСЃСЏ.",
missedOpportunityTopSetup: "Top missed setup",
missedOpportunityActionPlan: "Missed Opportunity Action Plan",
missedOpportunityActionOne:
  "РџРµСЂРµРґ СЃРµСЃС–С”СЋ РѕР±РµСЂРё 2вЂ“3 setup, СЏРєС– С‚Рё РіРѕС‚РѕРІРёР№ С‚РѕСЂРіСѓРІР°С‚Рё Р±РµР· СЃСѓРјРЅС–РІС–РІ РїСЂРё РїРѕСЏРІС– trigger.",
missedOpportunityActionTwo:
  "РЇРєС‰Рѕ trigger Р·вЂ™СЏРІРёРІСЃСЏ, Р°Р»Рµ С‚Рё РЅРµ СѓРІС–Р№С€РѕРІ вЂ” РѕРґСЂР°Р·Сѓ РІС–РґРјС–С‚СЊ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, Р·Р°РїС–Р·РЅРѕ, РЅРµ Р±С–Р»СЏ РµРєСЂР°РЅР° Р°Р±Рѕ РЅРµ РІРёСЃС‚Р°С‡РёР»Рѕ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ.",
missedOpportunityActionThree:
  "РЇРєС‰Рѕ СЃРёРіРЅР°Р» РІС–РґРїСЂР°С†СЋРІР°РІ Р±РµР· С‚РµР±Рµ вЂ” РґРѕРґР°Р№ Р№РѕРіРѕ РІ playbook С– РІРёСЂС–С€Рё, С‰Рѕ РјР°С” Р·РјС–РЅРёС‚РёСЃСЏ, С‰РѕР± РЅР°СЃС‚СѓРїРЅРѕРіРѕ СЂР°Р·Сѓ РЅРµ РїСЂРѕРїСѓСЃС‚РёС‚Рё.",
alertsStateLoadingTitle: "SkillEdge AI СЃРєР°РЅСѓС” СЂРёРЅРѕРє",
alertsStateLoadingText:
  "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ РѕСЃС‚Р°РЅРЅС– alerts, РїРµСЂРµРІС–СЂСЏС”РјРѕ РїРµСЂСЃРѕРЅР°Р»СЊРЅРёР№ РїСЂС–РѕСЂРёС‚РµС‚, Р¶СѓСЂРЅР°Р», outcomes С– СЃРІС–Р¶С–СЃС‚СЊ СЃРёРіРЅР°Р»С–РІ.",
alertsStateErrorTitle: "РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё AI Alerts",
alertsStateErrorText:
  "РџРµСЂРµРІС–СЂ РїС–РґРєР»СЋС‡РµРЅРЅСЏ, Р°РІС‚РѕСЂРёР·Р°С†С–СЋ Р°Р±Рѕ РїРѕРІС‚РѕСЂРё Р·Р°РїРёС‚. РЇРєС‰Рѕ РїРѕРјРёР»РєР° РїРѕРІС‚РѕСЂСЋС”С‚СЊСЃСЏ вЂ” РїРѕС‚СЂС–Р±РЅРѕ РїРµСЂРµРІС–СЂРёС‚Рё backend/API logs.",
alertsStateEmptyTitle: "AI Trading Desk С‡РµРєР°С” СЏРєС–СЃРЅРёР№ setup",
alertsStateEmptyText:
  "Р—Р°СЂР°Р· РЅРµРјР°С” Р°РєС‚РёРІРЅРёС… alerts. Р¦Рµ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge РЅРµ РјР°С” СЃС‚СЂС–Р»СЏС‚Рё С€СѓРјРѕРј. РљСЂР°С‰Рµ РјРµРЅС€Рµ СЃРёРіРЅР°Р»С–РІ, Р°Р»Рµ РІРёС‰Р° СЏРєС–СЃС‚СЊ С– Р·СЂРѕР·СѓРјС–Р»С–С€РёР№ СЂРёР·РёРє.",
alertsStateFilterEmptyTitle: "Р”Р»СЏ С†СЊРѕРіРѕ С„С–Р»СЊС‚СЂР° alerts РЅРµРјР°С”",
alertsStateFilterEmptyText:
  "РЎРїРёСЃРѕРє РїСЂР°С†СЋС”, Р°Р»Рµ РїРѕС‚РѕС‡РЅРёР№ С„С–Р»СЊС‚СЂ РЅРµ Р·РЅР°Р№С€РѕРІ РІС–РґРїРѕРІС–РґРЅРёС… СЃРёРіРЅР°Р»С–РІ. РЎРєРёРЅСЊ С„С–Р»СЊС‚СЂ Р°Р±Рѕ РґРѕС‡РµРєР°Р№СЃСЏ РЅРѕРІРѕС— high-confidence СЃРёС‚СѓР°С†С–С—.",
alertsStateResetFilters: "РЎРєРёРЅСѓС‚Рё С„С–Р»СЊС‚СЂРё",
alertsStateRetry: "РџРѕРІС‚РѕСЂРёС‚Рё Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ",
alertsStateRunScan: "Р—Р°РїСѓСЃС‚РёС‚Рё СЃРєР°РЅ",
alertsStateLiveNote: "Live monitoring РїСЂР°С†СЋС” Сѓ С„РѕРЅС–",
selectedFilter: "Selected filter",
totalAlerts: "Total alerts",
alertsStateErrorLabel: "РџРѕРјРёР»РєР°",
alertsStateLoadingLabel: "Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ",
alertsStateWaitingLabel: "РћС‡С–РєСѓРІР°РЅРЅСЏ",
alertsStateLiveMonitoringLabel: "Live monitoring",
decisionVsOutcomeLabel: "Р С–С€РµРЅРЅСЏ / outcome",
nextLearningFocus: "РќР°СЃС‚СѓРїРЅРёР№ learning focus",
noFocusYet: "Р¤РѕРєСѓСЃ С‰Рµ РЅРµ СЃС„РѕСЂРјРѕРІР°РЅРёР№",
outcomeProfileStillForming: "Outcome learning profile С‰Рµ С„РѕСЂРјСѓС”С‚СЊСЃСЏ",
missedOpportunitiesLabel: "missed opportunities",
noMissedOpportunityPatternTitle: "РџР°С‚РµСЂРЅ missed opportunities С‰Рµ РЅРµ СЃС„РѕСЂРјРѕРІР°РЅРёР№",
workedAlertsMissedSuffix: "СЂРѕР±РѕС‡РёС… alerts Р±СѓР»Рё РїСЂРѕРїСѓС‰РµРЅС– РІ С†С–Р№ РіСЂСѓРїС– setup.",
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
      title: "Р¦РµРЅС‚СЂ AI-СЃРёРіРЅР°Р»РѕРІ",
      subtitle:
        "РЎРёРіРЅР°Р»С‹ Р·Р° РїРѕСЃР»РµРґРЅРёРµ РґРЅРё: РЅР°РїСЂР°РІР»РµРЅРёРµ, СЃРµС‚Р°Рї, Р·РѕРЅР° РІС…РѕРґР°, СЃС‚РѕРї, С†РµР»Рё, СЂРёСЃРє Рё РїР»Р°РЅ СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёСЏ.",
      empty: "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… СЃРёРіРЅР°Р»РѕРІ. Р—Р°РїСѓСЃС‚Рё СЃРєР°РЅРёСЂРѕРІР°РЅРёРµ СЂС‹РЅРєР°.",
      locked:
        "AI-СЃРёРіРЅР°Р»С‹ РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РЅР° SkillEdge Elite. SkillEdge Edge РѕС‚РєСЂС‹РІР°РµС‚ AI-СЃРєР°РЅРµСЂ Рё СЂС‹РЅРѕС‡РЅСѓСЋ СЂР°Р·РІРµРґРєСѓ, РЅРѕ real-time AI-СЃРёРіРЅР°Р»С‹, РїР»Р°РІР°СЋС‰РёР№ РІРёРґР¶РµС‚, СЃРІСЏР·РєР° СЃРёРіРЅР°Р»РѕРІ СЃ Р¶СѓСЂРЅР°Р»РѕРј Рё РѕР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С… РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РІ Elite.",
      saveToPlaybook: "РЎРѕС…СЂР°РЅРёС‚СЊ РІ РїР»РµР№Р±СѓРє",
      openPlaybook: "РћС‚РєСЂС‹С‚СЊ РїР»РµР№Р±СѓРє",
      hidePlaybook: "РЎРєСЂС‹С‚СЊ РїР»РµР№Р±СѓРє",
      playbookTitle: "Р›РёС‡РЅС‹Р№ РїР»РµР№Р±СѓРє СЃРёРіРЅР°Р»РѕРІ",
      playbookText:
        "Р›РёС‡РЅР°СЏ Р±Р°Р·Р° СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРµС‚Р°РїРѕРІ: Р»РѕРіРёРєР°, РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ, РѕС€РёР±РєРё Рё РїСЂРёРјРµСЂС‹ СЃРёРіРЅР°Р»РѕРІ.",
      playbookEmpty:
        "РџРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… СЃРµС‚Р°РїРѕРІ. РќР°Р¶РјРё В«РЎРѕС…СЂР°РЅРёС‚СЊ РІ РїР»РµР№Р±СѓРєВ» РЅР° Р»СЋР±РѕРј СЃРёРіРЅР°Р»Рµ.",
      playbookLoading: "Р—Р°РіСЂСѓР¶Р°РµРј РїР»РµР№Р±СѓРє...",
      lastExample: "РџРѕСЃР»РµРґРЅРёР№ РїСЂРёРјРµСЂ",
      openSignalProfile: "РћС‚РєСЂС‹С‚СЊ РїСЂРѕС„РёР»СЊ СЃРёРіРЅР°Р»РѕРІ",
      hideSignalProfile: "РЎРєСЂС‹С‚СЊ РїСЂРѕС„РёР»СЊ СЃРёРіРЅР°Р»РѕРІ",
      signalProfileTitle: "РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РїСЂРѕС„РёР»СЊ СЃРёРіРЅР°Р»РѕРІ",
      signalProfileText:
        "SkillEdge AI РїРѕРєР°Р·С‹РІР°РµС‚, РєР°РєРёРµ AI-СЃРµС‚Р°РїС‹ С‚С‹ С‚РѕСЂРіСѓРµС€СЊ Р»СѓС‡С€Рµ, РіРґРµ С‚РµСЂСЏРµС€СЊ РґРµРЅСЊРіРё Рё РєР°РєРёРµ СЃРёРіРЅР°Р»С‹ СЃС‚РѕРёС‚ РїСЂРёРѕСЂРёС‚РµР·РёСЂРѕРІР°С‚СЊ.",
      signalProfileEmpty:
        "РџСЂРѕС„РёР»СЊ РїРѕРєР° РїСѓСЃС‚РѕР№. РЎРѕР·РґР°Р№ СЃРґРµР»РєРё РёР· AI-СЃРёРіРЅР°Р»РѕРІ Рё СЃРѕС…СЂР°РЅРё РёС… РІ Р¶СѓСЂРЅР°Р».",
      signalProfileLoading: "Р—Р°РіСЂСѓР¶Р°РµРј РїСЂРѕС„РёР»СЊ СЃРёРіРЅР°Р»РѕРІ...",
      personalStrength: "РЎРёР»СЊРЅР°СЏ СЃС‚РѕСЂРѕРЅР°",
      riskZone: "Р—РѕРЅР° СЂРёСЃРєР°",
      learningProfile: "РћР±СѓС‡РµРЅРёРµ",
      neutralProfile: "РќРµР№С‚СЂР°Р»СЊРЅРѕ",
      strengthScore: "РћС†РµРЅРєР° СЃРёР»С‹",
      planAdherence: "РЎР»РµРґРѕРІР°РЅРёРµ РїР»Р°РЅСѓ",
      aiNote: "AI-Р·Р°РјРµС‚РєР°",
      openTradePatterns: "РћС‚РєСЂС‹С‚СЊ РїР°С‚С‚РµСЂРЅС‹ СЃРґРµР»РѕРє",
      hideTradePatterns: "РЎРєСЂС‹С‚СЊ РїР°С‚С‚РµСЂРЅС‹ СЃРґРµР»РѕРє",
      tradePatternsTitle: "РџСЂРѕС„РёР»СЊ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅС‹С… С‚РѕСЂРіРѕРІС‹С… РїР°С‚С‚РµСЂРЅРѕРІ",
      tradePatternsText:
        "SkillEdge AI Р°РЅР°Р»РёР·РёСЂСѓРµС‚ С‚РІРѕРё СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅС‹Рµ РїСЂРёР±С‹Р»СЊРЅС‹Рµ СЃРґРµР»РєРё Рё РёС‰РµС‚ РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РїР°С‚С‚РµСЂРЅС‹ РґР»СЏ Р±СѓРґСѓС‰РёС… РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹С… AI-СЃРёРіРЅР°Р»РѕРІ.",
      tradePatternsEmpty:
        "РџРѕРєР° РЅРµС‚ РЅР°Р№РґРµРЅРЅС‹С… РїР°С‚С‚РµСЂРЅРѕРІ. Р”РѕР±Р°РІСЊ РІ Р¶СѓСЂРЅР°Р» РЅРµСЃРєРѕР»СЊРєРѕ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅС‹С… РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє.",
      tradePatternsLoading: "Р—Р°РіСЂСѓР¶Р°РµРј С‚РѕСЂРіРѕРІС‹Рµ РїР°С‚С‚РµСЂРЅС‹...",
      patternStrength: "РЎРёР»Р° РїР°С‚С‚РµСЂРЅР°",
      examples: "РџСЂРёРјРµСЂС‹",
      keywords: "РљР»СЋС‡РµРІС‹Рµ СЃР»РѕРІР°",
      filterActionable: "Р“РѕС‚РѕРІС‹Рµ Рє РґРµР№СЃС‚РІРёСЋ",
      filterWatchlist: "РЎРїРёСЃРѕРє РЅР°Р±Р»СЋРґРµРЅРёСЏ",
      filterLong: "Р›РѕРЅРі",
      filterShort: "РЁРѕСЂС‚",
      decisionAnalyticsTitle: "Р РµС€РµРЅРёСЏ РїРѕ СЃРёРіРЅР°Р»Р°Рј",
      decisionAnalyticsText:
        "Р—РґРµСЃСЊ РІРёРґРЅРѕ, РєР°Рє РєР»РёРµРЅС‚ СЂР°Р±РѕС‚Р°РµС‚ СЃ СЃРёРіРЅР°Р»Р°РјРё: РЅР°Р±Р»СЋРґР°РµС‚, Р±РµСЂС‘С‚, РїСЂРѕРїСѓСЃРєР°РµС‚ РёР»Рё РѕС‚РјРµС‡Р°РµС‚ СѓРїСѓС‰РµРЅРЅСѓСЋ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ. Р­С‚Рѕ Р±Р°Р·Р° Р±СѓРґСѓС‰РµР№ СЃС‚Р°С‚РёСЃС‚РёРєРё РєР°С‡РµСЃС‚РІР° СЃРёРіРЅР°Р»РѕРІ Рё РёСЃРїРѕР»РЅРµРЅРёСЏ.",
      filterEmpty: "РќРµС‚ СЃРёРіРЅР°Р»РѕРІ РїРѕРґ РІС‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ.",
      liveDesk: "Р–РёРІРѕР№ AI Trading Desk",
      autoRefreshNote:
        "РЎРёРіРЅР°Р»С‹ РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. РЎРєР°РЅРёСЂРѕРІР°РЅРёРµ СЂС‹РЅРєР° СЂР°Р±РѕС‚Р°РµС‚ РІ С„РѕРЅРµ, СЃРїРёСЃРѕРє РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ РєР°Р¶РґС‹Рµ 60 СЃРµРєСѓРЅРґ.",
      smartTopFive:
        "РџРµСЂРІС‹Рµ 5 СЃРёРіРЅР°Р»РѕРІ РѕС‚СЃРѕСЂС‚РёСЂРѕРІР°РЅС‹ РїРѕ РІР°Р¶РЅРѕСЃС‚Рё: РїСЂРёРѕСЂРёС‚РµС‚, СЃРѕРІРїР°РґРµРЅРёРµ СЃ Р¶СѓСЂРЅР°Р»РѕРј, AI-СЃРёР»Р°, СѓРІРµСЂРµРЅРЅРѕСЃС‚СЊ Рё СЃРІРµР¶РµСЃС‚СЊ СЃРёРіРЅР°Р»Р°.",
      emptyDeskTitle: "AI Trading Desk Р¶РґС‘С‚ РєР°С‡РµСЃС‚РІРµРЅРЅС‹Р№ СЃРµС‚Р°Рї",
      emptyDeskText:
        "РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… СЃРёРіРЅР°Р»РѕРІ РїРѕРґ РІС‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ. Р­С‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge AI РЅРµ РґРѕР»Р¶РµРЅ СЃС‚СЂРµР»СЏС‚СЊ С€СѓРјРѕРј. РЎРёСЃС‚РµРјР° Р¶РґС‘С‚ high-confidence СЃРёС‚СѓР°С†РёСЋ СЃ РїРѕРЅСЏС‚РЅС‹Рј С‚СЂРёРіРіРµСЂРѕРј, СЃС‚РѕРїРѕРј, С†РµР»СЏРјРё Рё Р·Р°РјРµС‚РєРѕР№ РїРѕ СЂРёСЃРєСѓ.",
      confidenceTransparency: "РџСЂРѕР·СЂР°С‡РЅРѕСЃС‚СЊ РѕС†РµРЅРєРё",
      confidenceTransparencyText:
        "РџРѕС‡РµРјСѓ SkillEdge AI РІС‹РґРµР»РёР» СЌС‚РѕС‚ СЃРёРіРЅР°Р» Рё РєР°РєРёРµ С„Р°РєС‚РѕСЂС‹ СѓСЃРёР»РёРІР°СЋС‚ РёР»Рё РѕСЃР»Р°Р±Р»СЏСЋС‚ РёРґРµСЋ.",
      breakdownTitle: "Р Р°Р·Р±РѕСЂ СЃРёРіРЅР°Р»Р° SkillEdge AI",
      journalSyncTitle: "РЎРІСЏР·РєР° СЃ Р¶СѓСЂРЅР°Р»РѕРј",
      journalSyncText:
        "РўС‹ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє В«Р’Р·СЏР»В». РЎРѕР·РґР°Р№ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р°, С‡С‚РѕР±С‹ SkillEdge РїРѕР·Р¶Рµ СЃСЂР°РІРЅРёР» РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј: РІС…РѕРґ, СЃС‚РѕРї, РІС‹С…РѕРґ, PnL Рё РєР°С‡РµСЃС‚РІРѕ СЃРґРµР»РєРё.",
      journalSyncAction: "РЎРѕР·РґР°С‚СЊ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р°",
      linkedJournalTitle: "РЎРІСЏР·Р°РЅРЅР°СЏ СЃРґРµР»РєР° РІ Р¶СѓСЂРЅР°Р»Рµ",
      linkedJournalText:
        "Р­С‚Р° СЃРґРµР»РєР° СѓР¶Рµ СЃРІСЏР·Р°РЅР° СЃ СЃРёРіРЅР°Р»РѕРј. SkillEdge СЃРјРѕР¶РµС‚ СЃСЂР°РІРЅРёС‚СЊ РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј РєР»РёРµРЅС‚Р°.",
      linkedJournalEmpty:
        "РџРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅРѕР№ СЃРґРµР»РєРё РІ Р¶СѓСЂРЅР°Р»Рµ, СЃРІСЏР·Р°РЅРЅРѕР№ СЃ СЌС‚РёРј СЃРёРіРЅР°Р»РѕРј.",
      linkedTrades: "РЎРІСЏР·Р°РЅРЅС‹Рµ СЃРґРµР»РєРё",
      linkedPnl: "PnL СЃРІСЏР·Р°РЅРЅС‹С… СЃРґРµР»РѕРє",
      linkedResult: "Р РµР·СѓР»СЊС‚Р°С‚",
      journalLinkAnalyticsTitle: "РЎРёРіРЅР°Р»С‹ в†” Р–СѓСЂРЅР°Р»",
      journalLinkAnalyticsText:
        "SkillEdge РѕС‚СЃР»РµР¶РёРІР°РµС‚, РєР°РєРёРµ СЃРёРіРЅР°Р»С‹ РїСЂРµРІСЂР°С‚РёР»РёСЃСЊ РІ СЂРµР°Р»СЊРЅС‹Рµ СЃРґРµР»РєРё РІ Р¶СѓСЂРЅР°Р»Рµ. Р­С‚Рѕ Р±Р°Р·Р° РґР»СЏ Р°РЅР°Р»РёР·Р° РёСЃРїРѕР»РЅРµРЅРёСЏ, PnL РїРѕ СЃРёРіРЅР°Р»Р°Рј Рё СѓРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№.",
      takenWithoutJournal: "Р’Р·СЏС‚Рѕ Р±РµР· Р¶СѓСЂРЅР°Р»Р°",
      linkedAlertsCount: "РЎРІСЏР·Р°РЅРЅС‹Рµ СЃРёРіРЅР°Р»С‹",
      linkedTradesPnl: "PnL СЃРІСЏР·Р°РЅРЅС‹С… СЃРґРµР»РѕРє",
      avgExecutionScore: "РЎСЂРµРґРЅСЏСЏ РѕС†РµРЅРєР° РёСЃРїРѕР»РЅРµРЅРёСЏ",
      takenWithoutJournalFilter: "Р’Р·СЏС‚Рѕ Р±РµР· Р¶СѓСЂРЅР°Р»Р°",
      takenWithoutJournalTitle: "РЎРёРіРЅР°Р» РІР·СЏС‚, РЅРѕ СЃРґРµР»РєРё РІ Р¶СѓСЂРЅР°Р»Рµ РЅРµС‚",
      takenWithoutJournalText:
        "РљР»РёРµРЅС‚ РѕС‚РјРµС‚РёР» СЃРёРіРЅР°Р» РєР°Рє В«Р’Р·СЏР»В», РЅРѕ РµС‰С‘ РЅРµ СЃРѕС…СЂР°РЅРёР» СЃРґРµР»РєСѓ РІ Р¶СѓСЂРЅР°Р». РЎРѕР·РґР°Р№ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р°, С‡С‚РѕР±С‹ SkillEdge СЃРјРѕРі СЃСЂР°РІРЅРёС‚СЊ РїР»Р°РЅ СЃРёРіРЅР°Р»Р° СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј.",
      executionScore: "РћС†РµРЅРєР° РёСЃРїРѕР»РЅРµРЅРёСЏ",
      executionReview: "Р Р°Р·Р±РѕСЂ РёСЃРїРѕР»РЅРµРЅРёСЏ",
      filterJournalLinked: "РЎРІСЏР·Р°РЅРѕ СЃ Р¶СѓСЂРЅР°Р»РѕРј",
      filterExecutionStrong: "РЎРёР»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ",
      filterExecutionReview: "РќСѓР¶РµРЅ СЂР°Р·Р±РѕСЂ",
      executionQualityTitle: "РљР°С‡РµСЃС‚РІРѕ РёСЃРїРѕР»РЅРµРЅРёСЏ",
      executionQualityText:
        "SkillEdge РїРѕРєР°Р·С‹РІР°РµС‚, РєР°РєРёРµ AI-СЃРёРіРЅР°Р»С‹ СѓР¶Рµ РїСЂРёРІРµР»Рё Рє СЃРґРµР»РєР°Рј РІ Р¶СѓСЂРЅР°Р»Рµ Рё РіРґРµ РёСЃРїРѕР»РЅРµРЅРёРµ Р±С‹Р»Рѕ СЃРёР»СЊРЅС‹Рј РёР»Рё С‚СЂРµР±СѓРµС‚ СЂР°Р·Р±РѕСЂР°.",
      executionCoachTitle: "AI-РєРѕСѓС‡ РёСЃРїРѕР»РЅРµРЅРёСЏ",
      executionCoachText:
        "SkillEdge СЂР°Р·Р±РёСЂР°РµС‚ РёСЃРїРѕР»РЅРµРЅРёРµ РєР»РёРµРЅС‚Р° РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°: РІС…РѕРґ, СЃС‚РѕРї, РЅР°РїСЂР°РІР»РµРЅРёРµ, С†РµР»Рё Рё РґРёСЃС†РёРїР»РёРЅСѓ.",
      executionCoachEntryIssue:
        "РџСЂРѕР±Р»РµРјР° РІС…РѕРґР°: РІС…РѕРґ Р±С‹Р» РІРЅРµ РїР»Р°РЅРѕРІРѕР№ Р·РѕРЅС‹ РёР»Рё СЃР»РёС€РєРѕРј РїРѕР·РґРЅРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ СЃРёРіРЅР°Р»Р°.",
      executionCoachStopIssue:
        "РџСЂРѕР±Р»РµРјР° СЃС‚РѕРїР°: СЃС‚РѕРї РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РїР»Р°РЅР° СЃРёРіРЅР°Р»Р°. Р­С‚Рѕ РјРѕР¶РµС‚ Р»РѕРјР°С‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ Рё СЂРёСЃРє/РїРѕС‚РµРЅС†РёР°Р».",
      executionCoachDirectionIssue:
        "РџСЂРѕР±Р»РµРјР° РЅР°РїСЂР°РІР»РµРЅРёСЏ: РЅР°РїСЂР°РІР»РµРЅРёРµ СЃРґРµР»РєРё РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РЅР°РїСЂР°РІР»РµРЅРёСЏ СЃРёРіРЅР°Р»Р°.",
      executionCoachTargetIssue:
        "РџСЂРѕР±Р»РµРјР° С†РµР»РµР№: СЃРґРµР»РєР° РЅРµ РґРѕС€Р»Р° РґРѕ TP РёР»Рё РІС‹С…РѕРґ Р±С‹Р» РЅРµ РїРѕ РїР»Р°РЅСѓ.",
      executionWeaknessTitle: "РљР°СЂС‚Р° СЃР»Р°Р±С‹С… РјРµСЃС‚ РёСЃРїРѕР»РЅРµРЅРёСЏ",
      entryIssueFilter: "РџСЂРѕР±Р»РµРјС‹ РІС…РѕРґР°",
      stopIssueFilter: "РџСЂРѕР±Р»РµРјС‹ СЃС‚РѕРїР°",
      directionIssueFilter: "РџСЂРѕР±Р»РµРјС‹ РЅР°РїСЂР°РІР»РµРЅРёСЏ",
      targetIssueFilter: "РџСЂРѕР±Р»РµРјС‹ С†РµР»РµР№",
      executionFocusTitle: "РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ С„РѕРєСѓСЃ РёСЃРїРѕР»РЅРµРЅРёСЏ",
      openFocusAlerts: "РћС‚РєСЂС‹С‚СЊ СЃРёРіРЅР°Р»С‹ СЃ СЌС‚РёРј С„РѕРєСѓСЃРѕРј",
      executionActionPlanTitle: "РџР»Р°РЅ РґРµР№СЃС‚РІРёР№ РЅР° РЅРµРґРµР»СЋ",
      executionActionPlanText:
        "SkillEdge РїСЂРµРІСЂР°С‰Р°РµС‚ РіР»Р°РІРЅС‹Р№ С„РѕРєСѓСЃ РёСЃРїРѕР»РЅРµРЅРёСЏ РІ РєРѕРЅРєСЂРµС‚РЅС‹Рµ РїСЂР°РІРёР»Р° РґР»СЏ СЃР»РµРґСѓСЋС‰РµР№ С‚РѕСЂРіРѕРІРѕР№ РЅРµРґРµР»Рё.",
      outcomeFollowupTitle: "Р Р°Р·Р±РѕСЂ РёСЃС…РѕРґР° СЃРёРіРЅР°Р»Р°",
      outcomeFollowupText:
        "SkillEdge СЃСЂР°РІРЅРёРІР°РµС‚ СЂРµС€РµРЅРёРµ РєР»РёРµРЅС‚Р° СЃ С„Р°РєС‚РёС‡РµСЃРєРёРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј СЃРёРіРЅР°Р»Р°, С‡С‚РѕР±С‹ РЅР°С…РѕРґРёС‚СЊ СѓРїСѓС‰РµРЅРЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё, С…РѕСЂРѕС€РёРµ РїСЂРѕРїСѓСЃРєРё Рё СЃРґРµР»РєРё, РєРѕС‚РѕСЂС‹Рµ С‚СЂРµР±СѓСЋС‚ СЂР°Р·Р±РѕСЂР°.",
      outcomeLearningLabel: "РЈС‡РµР±РЅР°СЏ Р·Р°РјРµС‚РєР°",
      outcomeStatsLabel: "РЎС‚Р°С‚РёСЃС‚РёРєР° РёСЃС…РѕРґРѕРІ",
      outcomeLearningAnalyticsTitle: "РђРЅР°Р»РёС‚РёРєР° РѕР±СѓС‡РµРЅРёСЏ РЅР° РёСЃС…РѕРґР°С…",
      outcomeLearningAnalyticsText:
        "SkillEdge РіСЂСѓРїРїРёСЂСѓРµС‚ СЃРёРіРЅР°Р»С‹ РїРѕ СЂРµС€РµРЅРёСЋ РєР»РёРµРЅС‚Р° Рё С„Р°РєС‚РёС‡РµСЃРєРѕРјСѓ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ: С‡С‚Рѕ Р±С‹Р»Рѕ РІР·СЏС‚Рѕ, С‡С‚Рѕ РЅРµ СЃСЂР°Р±РѕС‚Р°Р»Рѕ, С‡С‚Рѕ СЃС‚Р°Р»Рѕ СѓРїСѓС‰РµРЅРЅРѕР№ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊСЋ Рё РіРґРµ РєР»РёРµРЅС‚ РїСЂР°РІРёР»СЊРЅРѕ РѕС‚С„РёР»СЊС‚СЂРѕРІР°Р» СЃР»Р°Р±СѓСЋ РёРґРµСЋ.",
      outcomeLearningFocusTitle: "Р¤РѕРєСѓСЃ РѕР±СѓС‡РµРЅРёСЏ РЅР° РёСЃС…РѕРґР°С…",
      missedOpportunityCoachTitle: "РљРѕСѓС‡ СѓРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№",
      missedOpportunityCoachText:
        "SkillEdge СЂР°Р·Р±РёСЂР°РµС‚ СЂР°Р±РѕС‡РёРµ СЃРёРіРЅР°Р»С‹, РєРѕС‚РѕСЂС‹Рµ РєР»РёРµРЅС‚ РїСЂРѕРїСѓСЃС‚РёР», С‡С‚РѕР±С‹ РЅР°Р№С‚Рё РїРѕРІС‚РѕСЂСЏСЋС‰СѓСЋСЃСЏ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, РѕС‚СЃСѓС‚СЃС‚РІРёРµ Сѓ СЌРєСЂР°РЅР°, РїРѕР·РґРЅСЏСЏ СЂРµР°РєС†РёСЏ РёР»Рё СЃР»Р°Р±РѕРµ РґРѕРІРµСЂРёРµ Рє СЃРµС‚Р°РїСѓ.",
      missedOpportunityTopSetup: "Р“Р»Р°РІРЅС‹Р№ РїСЂРѕРїСѓС‰РµРЅРЅС‹Р№ СЃРµС‚Р°Рї",
      missedOpportunityActionPlan: "РџР»Р°РЅ РґРµР№СЃС‚РІРёР№ РїРѕ СѓРїСѓС‰РµРЅРЅС‹Рј РІРѕР·РјРѕР¶РЅРѕСЃС‚СЏРј",
      alertsStateLoadingTitle: "SkillEdge AI СЃРєР°РЅРёСЂСѓРµС‚ СЂС‹РЅРѕРє",
      alertsStateLoadingText:
        "Р—Р°РіСЂСѓР¶Р°РµРј РїРѕСЃР»РµРґРЅРёРµ СЃРёРіРЅР°Р»С‹, РїСЂРѕРІРµСЂСЏРµРј РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Р№ РїСЂРёРѕСЂРёС‚РµС‚, РєРѕРЅС‚РµРєСЃС‚ Р¶СѓСЂРЅР°Р»Р°, РёСЃС…РѕРґС‹ Рё СЃРІРµР¶РµСЃС‚СЊ СЃРёРіРЅР°Р»РѕРІ.",
      alertsStateErrorTitle: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ AI-СЃРёРіРЅР°Р»С‹",
      alertsStateErrorText:
        "РџСЂРѕРІРµСЂСЊ РїРѕРґРєР»СЋС‡РµРЅРёРµ, Р°РІС‚РѕСЂРёР·Р°С†РёСЋ РёР»Рё РїРѕРІС‚РѕСЂРё Р·Р°РїСЂРѕСЃ. Р•СЃР»Рё РѕС€РёР±РєР° РїРѕРІС‚РѕСЂСЏРµС‚СЃСЏ, РЅСѓР¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ backend/API-Р»РѕРіРё.",
      alertsStateEmptyTitle: "AI Trading Desk Р¶РґС‘С‚ РєР°С‡РµСЃС‚РІРµРЅРЅС‹Р№ СЃРµС‚Р°Рї",
      alertsStateEmptyText:
        "РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… СЃРёРіРЅР°Р»РѕРІ. Р­С‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge РЅРµ РґРѕР»Р¶РµРЅ СЃС‚СЂРµР»СЏС‚СЊ С€СѓРјРѕРј. Р›СѓС‡С€Рµ РјРµРЅСЊС€Рµ СЃРёРіРЅР°Р»РѕРІ, РЅРѕ РІС‹С€Рµ РєР°С‡РµСЃС‚РІРѕ.",
      alertsStateFilterEmptyTitle: "Р”Р»СЏ СЌС‚РѕРіРѕ С„РёР»СЊС‚СЂР° СЃРёРіРЅР°Р»РѕРІ РЅРµС‚",
      alertsStateFilterEmptyText:
        "РЎРїРёСЃРѕРє СЂР°Р±РѕС‚Р°РµС‚, РЅРѕ С‚РµРєСѓС‰РёР№ С„РёР»СЊС‚СЂ РЅРµ РЅР°С€С‘Р» РїРѕРґС…РѕРґСЏС‰РёС… СЃРёРіРЅР°Р»РѕРІ. РЎР±СЂРѕСЃСЊ С„РёР»СЊС‚СЂ РёР»Рё РґРѕР¶РґРёСЃСЊ РЅРѕРІРѕР№ high-confidence СЃРёС‚СѓР°С†РёРё.",
      alertsStateRunScan: "Р—Р°РїСѓСЃС‚РёС‚СЊ СЃРєР°РЅРёСЂРѕРІР°РЅРёРµ",
      alertsStateLiveNote: "Р¤РѕРЅРѕРІС‹Р№ РјРѕРЅРёС‚РѕСЂРёРЅРі СЂР°Р±РѕС‚Р°РµС‚",
      selectedFilter: "Р’С‹Р±СЂР°РЅРЅС‹Р№ С„РёР»СЊС‚СЂ",
      totalAlerts: "Р’СЃРµРіРѕ СЃРёРіРЅР°Р»РѕРІ",
      alertsStateLiveMonitoringLabel: "Р¤РѕРЅРѕРІС‹Р№ РјРѕРЅРёС‚РѕСЂРёРЅРі",
      decisionVsOutcomeLabel: "Р РµС€РµРЅРёРµ / РёСЃС…РѕРґ",
      nextLearningFocus: "РЎР»РµРґСѓСЋС‰РёР№ С„РѕРєСѓСЃ РѕР±СѓС‡РµРЅРёСЏ",
      outcomeProfileStillForming: "РџСЂРѕС„РёР»СЊ РѕР±СѓС‡РµРЅРёСЏ РЅР° РёСЃС…РѕРґР°С… РµС‰С‘ С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ",
      missedOpportunitiesLabel: "СѓРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№",
      noMissedOpportunityPatternTitle: "РџР°С‚С‚РµСЂРЅ СѓРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№ РµС‰С‘ РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅ",
      workedAlertsMissedSuffix: "СЂР°Р±РѕС‡РёС… СЃРёРіРЅР°Р»РѕРІ Р±С‹Р»Рё РїСЂРѕРїСѓС‰РµРЅС‹ РІ СЌС‚РѕР№ РіСЂСѓРїРїРµ СЃРµС‚Р°РїРѕРІ.",
      commonMistakeLabel: "РўРёРїРёС‡РЅР°СЏ РѕС€РёР±РєР°:",
      scoreDisclaimer:
        "РћС†РµРЅРєР° РЅРµ СЏРІР»СЏРµС‚СЃСЏ РіР°СЂР°РЅС‚РёРµР№. РўРѕСЂРіСѓР№ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ, Р°РґРµРєРІР°С‚РЅРѕРіРѕ СЃРѕРѕС‚РЅРѕС€РµРЅРёСЏ СЂРёСЃРєР° Рє РїРѕС‚РµРЅС†РёР°Р»Сѓ Рё СЃРѕР±СЃС‚РІРµРЅРЅРѕРіРѕ С‡РµРєР»РёСЃС‚Р° РёСЃРїРѕР»РЅРµРЅРёСЏ.",
      closeBreakdownHint: "РёР»Рё РЅР°Р¶РјРё РІРЅРµ РѕРєРЅР°, С‡С‚РѕР±С‹ Р·Р°РєСЂС‹С‚СЊ СЌС‚РѕС‚ СЂР°Р·Р±РѕСЂ.",
    },
    ua: {
      title: "Р¦РµРЅС‚СЂ AI-СЃРёРіРЅР°Р»С–РІ",
      subtitle:
        "РћСЃС‚Р°РЅРЅС– СЃРёРіРЅР°Р»Рё: РЅР°РїСЂСЏРјРѕРє, СЃРµС‚Р°Рї, Р·РѕРЅР° РІС…РѕРґСѓ, СЃС‚РѕРї, С†С–Р»С–, СЂРёР·РёРє С– РїР»Р°РЅ СЃСѓРїСЂРѕРІРѕРґСѓ.",
      empty: "РђРєС‚РёРІРЅРёС… СЃРёРіРЅР°Р»С–РІ РїРѕРєРё РЅРµРјР°С”. Р—Р°РїСѓСЃС‚Рё СЃРєР°РЅСѓРІР°РЅРЅСЏ СЂРёРЅРєСѓ.",
      locked:
        "AI-СЃРёРіРЅР°Р»Рё РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РЅР° SkillEdge Elite. SkillEdge Edge РІС–РґРєСЂРёРІР°С” AI-СЃРєР°РЅРµСЂ С– СЂРёРЅРєРѕРІСѓ СЂРѕР·РІС–РґРєСѓ, Р°Р»Рµ real-time AI-СЃРёРіРЅР°Р»Рё, РїР»Р°РІР°СЋС‡РёР№ РІС–РґР¶РµС‚, Р·РІвЂ™СЏР·РєР° СЃРёРіРЅР°Р»С–РІ С–Р· Р¶СѓСЂРЅР°Р»РѕРј С– РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С… РґРѕСЃС‚СѓРїРЅС– С‚С–Р»СЊРєРё РІ Elite.",
      direction: "РќР°РїСЂСЏРјРѕРє",
      setup: "РЎРµС‚Р°Рї",
      entry: "Р—РѕРЅР° РІС…РѕРґСѓ",
      stop: "РЎС‚РѕРї",
      targets: "Р¦С–Р»С–",
      trigger: "РўСЂРёРіРµСЂ",
      reason: "РџСЂРёС‡РёРЅР°",
      risk: "Р РёР·РёРє",
      scenario: "РЎС†РµРЅР°СЂС–Р№",
      invalidation: "РЎРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС—",
      management: "РЎСѓРїСЂРѕРІС–Рґ",
      confidence: "Р’РїРµРІРЅРµРЅС–СЃС‚СЊ",
      status: "РЎС‚Р°С‚СѓСЃ",
      outcome: "Р РµР·СѓР»СЊС‚Р°С‚",
      time: "Р§Р°СЃ",
      worked: "Р’С–РґРїСЂР°С†СЋРІР°РІ",
      failed: "РќРµ РІС–РґРїСЂР°С†СЋРІР°РІ",
      pending: "РћС‡С–РєСѓС”С‚СЊСЃСЏ",
      neutral: "РќРµР№С‚СЂР°Р»СЊРЅРѕ",
      quality: "РЇРєС–СЃС‚СЊ",
      saveToPlaybook: "Р—Р±РµСЂРµРіС‚Рё РІ РїР»РµР№Р±СѓРє",
      openPlaybook: "Р’С–РґРєСЂРёС‚Рё РїР»РµР№Р±СѓРє",
      hidePlaybook: "РЎС…РѕРІР°С‚Рё РїР»РµР№Р±СѓРє",
      playbookTitle: "РћСЃРѕР±РёСЃС‚РёР№ РїР»РµР№Р±СѓРє СЃРёРіРЅР°Р»С–РІ",
      playbookText:
        "РћСЃРѕР±РёСЃС‚Р° Р±Р°Р·Р° Р·Р±РµСЂРµР¶РµРЅРёС… СЃРµС‚Р°РїС–РІ: Р»РѕРіС–РєР°, РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, РїРѕРјРёР»РєРё С‚Р° РїСЂРёРєР»Р°РґРё СЃРёРіРЅР°Р»С–РІ.",
      playbookEmpty:
        "РџРѕРєРё РЅРµРјР°С” Р·Р±РµСЂРµР¶РµРЅРёС… СЃРµС‚Р°РїС–РІ. РќР°С‚РёСЃРЅРё В«Р—Р±РµСЂРµРіС‚Рё РІ РїР»РµР№Р±СѓРєВ» РЅР° Р±СѓРґСЊ-СЏРєРѕРјСѓ СЃРёРіРЅР°Р»С–.",
      playbookLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ РїР»РµР№Р±СѓРє...",
      lastExample: "РћСЃС‚Р°РЅРЅС–Р№ РїСЂРёРєР»Р°Рґ",
      openSignalProfile: "Р’С–РґРєСЂРёС‚Рё РїСЂРѕС„С–Р»СЊ СЃРёРіРЅР°Р»С–РІ",
      hideSignalProfile: "РЎС…РѕРІР°С‚Рё РїСЂРѕС„С–Р»СЊ СЃРёРіРЅР°Р»С–РІ",
      signalProfileTitle: "РџРµСЂСЃРѕРЅР°Р»СЊРЅРёР№ РїСЂРѕС„С–Р»СЊ СЃРёРіРЅР°Р»С–РІ",
      signalProfileText:
        "SkillEdge AI РїРѕРєР°Р·СѓС”, СЏРєС– AI-СЃРµС‚Р°РїРё С‚Рё С‚РѕСЂРіСѓС”С€ РєСЂР°С‰Рµ, РґРµ РІС‚СЂР°С‡Р°С”С€ РіСЂРѕС€С– С‚Р° СЏРєС– СЃРёРіРЅР°Р»Рё РІР°СЂС‚Рѕ РїСЂС–РѕСЂРёС‚РµР·СѓРІР°С‚Рё.",
      signalProfileEmpty:
        "РџСЂРѕС„С–Р»СЊ РїРѕРєРё РїРѕСЂРѕР¶РЅС–Р№. РЎС‚РІРѕСЂРё СѓРіРѕРґРё Р· AI-СЃРёРіРЅР°Р»С–РІ С– Р·Р±РµСЂРµР¶Рё С—С… Сѓ Р¶СѓСЂРЅР°Р».",
      signalProfileLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ РїСЂРѕС„С–Р»СЊ СЃРёРіРЅР°Р»С–РІ...",
      personalStrength: "РЎРёР»СЊРЅР° СЃС‚РѕСЂРѕРЅР°",
      riskZone: "Р—РѕРЅР° СЂРёР·РёРєСѓ",
      learningProfile: "РќР°РІС‡Р°РЅРЅСЏ",
      neutralProfile: "РќРµР№С‚СЂР°Р»СЊРЅРѕ",
      strengthScore: "РћС†С–РЅРєР° СЃРёР»Рё",
      planAdherence: "Р”РѕС‚СЂРёРјР°РЅРЅСЏ РїР»Р°РЅСѓ",
      aiNote: "AI-Р·Р°РјС–С‚РєР°",
      openTradePatterns: "Р’С–РґРєСЂРёС‚Рё РїР°С‚РµСЂРЅРё СѓРіРѕРґ",
      hideTradePatterns: "РЎС…РѕРІР°С‚Рё РїР°С‚РµСЂРЅРё СѓРіРѕРґ",
      tradePatternsTitle: "РџСЂРѕС„С–Р»СЊ СЃР°РјРѕСЃС‚С–Р№РЅРёС… С‚РѕСЂРіРѕРІРёС… РїР°С‚РµСЂРЅС–РІ",
      tradePatternsText:
        "SkillEdge AI Р°РЅР°Р»С–Р·СѓС” С‚РІРѕС— СЃР°РјРѕСЃС‚С–Р№РЅС– РїСЂРёР±СѓС‚РєРѕРІС– СѓРіРѕРґРё С‚Р° С€СѓРєР°С” РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїР°С‚РµСЂРЅРё РґР»СЏ РјР°Р№Р±СѓС‚РЅС–С… РїРµСЂСЃРѕРЅР°Р»СЊРЅРёС… AI-СЃРёРіРЅР°Р»С–РІ.",
      tradePatternsEmpty:
        "РџРѕРєРё РЅРµРјР°С” Р·РЅР°Р№РґРµРЅРёС… РїР°С‚РµСЂРЅС–РІ. Р”РѕРґР°Р№ Сѓ Р¶СѓСЂРЅР°Р» РєС–Р»СЊРєР° СЃР°РјРѕСЃС‚С–Р№РЅРёС… РїСЂРёР±СѓС‚РєРѕРІРёС… СѓРіРѕРґ.",
      tradePatternsLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ С‚РѕСЂРіРѕРІС– РїР°С‚РµСЂРЅРё...",
      patternStrength: "РЎРёР»Р° РїР°С‚РµСЂРЅСѓ",
      examples: "РџСЂРёРєР»Р°РґРё",
      keywords: "РљР»СЋС‡РѕРІС– СЃР»РѕРІР°",
      filterAll: "РЈСЃС–",
      filterActionable: "Р“РѕС‚РѕРІС– РґРѕ РґС–С—",
      filterWatchlist: "РЎРїРёСЃРѕРє СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ",
      filterPriority: "РџСЂС–РѕСЂРёС‚РµС‚",
      filterCaution: "РћР±РµСЂРµР¶РЅРѕ",
      filterJournalMatch: "Р—Р±С–Рі С–Р· Р¶СѓСЂРЅР°Р»РѕРј",
      filterAiStrength: "AI-СЃРёР»Р°",
      filterLong: "Р›РѕРЅРі",
      filterShort: "РЁРѕСЂС‚",
      filterCrypto: "РљСЂРёРїС‚Рѕ",
      filterStocks: "РђРєС†С–С—",
      filterDecisionWatching: "РЎРїРѕСЃС‚РµСЂС–РіР°СЋ",
      filterDecisionTaken: "Р’Р·СЏРІ",
      filterDecisionSkipped: "РџСЂРѕРїСѓСЃС‚РёРІ",
      filterDecisionMissed: "РЈРїСѓСЃС‚РёРІ",
      decisionAnalyticsTitle: "Р С–С€РµРЅРЅСЏ РїРѕ СЃРёРіРЅР°Р»Р°С…",
      decisionAnalyticsText:
        "РўСѓС‚ РІРёРґРЅРѕ, СЏРє РєР»С–С”РЅС‚ РїСЂР°С†СЋС” Р· СЃРёРіРЅР°Р»Р°РјРё: СЃРїРѕСЃС‚РµСЂС–РіР°С”, Р±РµСЂРµ, РїСЂРѕРїСѓСЃРєР°С” Р°Р±Рѕ РІС–РґРјС–С‡Р°С” СѓРїСѓС‰РµРЅСѓ РјРѕР¶Р»РёРІС–СЃС‚СЊ. Р¦Рµ Р±Р°Р·Р° РјР°Р№Р±СѓС‚РЅСЊРѕС— СЃС‚Р°С‚РёСЃС‚РёРєРё СЏРєРѕСЃС‚С– СЃРёРіРЅР°Р»С–РІ С– РІРёРєРѕРЅР°РЅРЅСЏ.",
      filterEmpty: "РќРµРјР°С” СЃРёРіРЅР°Р»С–РІ РїС–Рґ РІРёР±СЂР°РЅРёР№ С„С–Р»СЊС‚СЂ.",
      openAlertDetails: "Р’С–РґРєСЂРёС‚Рё СЂРѕР·Р±С–СЂ",
      hideAlertDetails: "РЎС…РѕРІР°С‚Рё СЂРѕР·Р±С–СЂ",
      liveDesk: "Р–РёРІРёР№ AI Trading Desk",
      lastChecked: "РћСЃС‚Р°РЅРЅСЏ РїРµСЂРµРІС–СЂРєР°",
      autoRefreshNote:
        "РЎРёРіРЅР°Р»Рё РѕРЅРѕРІР»СЋСЋС‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ. РЎРєР°РЅСѓРІР°РЅРЅСЏ СЂРёРЅРєСѓ РїСЂР°С†СЋС” Сѓ С„РѕРЅС–, СЃРїРёСЃРѕРє РѕРЅРѕРІР»СЋС”С‚СЊСЃСЏ РєРѕР¶РЅС– 60 СЃРµРєСѓРЅРґ.",
      showMoreAlerts: "РџРѕРєР°Р·Р°С‚Рё С‰Рµ 10",
      collapseAlerts: "Р—РіРѕСЂРЅСѓС‚Рё РІСЃРµ",
      smartTopFive:
        "РџРµСЂС€С– 5 СЃРёРіРЅР°Р»С–РІ РІС–РґСЃРѕСЂС‚РѕРІР°РЅС– Р·Р° РІР°Р¶Р»РёРІС–СЃС‚СЋ: РїСЂС–РѕСЂРёС‚РµС‚, Р·Р±С–Рі С–Р· Р¶СѓСЂРЅР°Р»РѕРј, AI-СЃРёР»Р°, РІРїРµРІРЅРµРЅС–СЃС‚СЊ С– СЃРІС–Р¶С–СЃС‚СЊ СЃРёРіРЅР°Р»Сѓ.",
      emptyDeskTitle: "AI Trading Desk С‡РµРєР°С” СЏРєС–СЃРЅРёР№ СЃРµС‚Р°Рї",
      emptyDeskText:
        "Р—Р°СЂР°Р· РЅРµРјР°С” Р°РєС‚РёРІРЅРёС… СЃРёРіРЅР°Р»С–РІ РїС–Рґ РІРёР±СЂР°РЅРёР№ С„С–Р»СЊС‚СЂ. Р¦Рµ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge AI РЅРµ РјР°С” СЃС‚СЂС–Р»СЏС‚Рё С€СѓРјРѕРј. РЎРёСЃС‚РµРјР° С‡РµРєР°С” high-confidence СЃРёС‚СѓР°С†С–СЋ Р· С‡С–С‚РєРёРј С‚СЂРёРіРµСЂРѕРј, СЃС‚РѕРїРѕРј, С†С–Р»СЏРјРё С‚Р° РЅРѕС‚Р°С‚РєРѕСЋ РїРѕ СЂРёР·РёРєСѓ.",
      emptyDeskAction:
        "Р—Р°Р»РёС€ СЃС‚РѕСЂС–РЅРєСѓ РІС–РґРєСЂРёС‚РѕСЋ вЂ” СЃРїРёСЃРѕРє РѕРЅРѕРІР»СЋС”С‚СЊСЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ РєРѕР¶РЅС– 60 СЃРµРєСѓРЅРґ.",
      confidenceTransparency: "РџСЂРѕР·РѕСЂС–СЃС‚СЊ РѕС†С–РЅРєРё",
      confidenceTransparencyText:
        "Р§РѕРјСѓ SkillEdge AI РІРёРґС–Р»РёРІ С†РµР№ СЃРёРіРЅР°Р» С– СЏРєС– С„Р°РєС‚РѕСЂРё РїРѕСЃРёР»СЋСЋС‚СЊ Р°Р±Рѕ РїРѕСЃР»Р°Р±Р»СЋСЋС‚СЊ С–РґРµСЋ.",
      breakdownTitle: "Р РѕР·Р±С–СЂ СЃРёРіРЅР°Р»Сѓ SkillEdge AI",
      traderDecision: "Р С–С€РµРЅРЅСЏ С‚СЂРµР№РґРµСЂР°",
      tradePlan: "РџР»Р°РЅ СѓРіРѕРґРё",
      whyNow: "Р§РѕРјСѓ Р·Р°СЂР°Р·",
      confirmationChecklist: "Р§РµРєР»РёСЃС‚ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ",
      avoidThisTradeIf: "РќРµ С‚РѕСЂРіСѓРІР°С‚Рё, СЏРєС‰Рѕ",
      learningLayer: "РќР°РІС‡Р°Р»СЊРЅРёР№ С€Р°СЂ",
      journalSyncTitle: "Р—РІвЂ™СЏР·РєР° Р· Р¶СѓСЂРЅР°Р»РѕРј",
      journalSyncText:
        "РўРё РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє В«Р’Р·СЏРІВ». РЎС‚РІРѕСЂРё СѓРіРѕРґСѓ С–Р· СЃРёРіРЅР°Р»Сѓ, С‰РѕР± SkillEdge РїС–Р·РЅС–С€Рµ РїРѕСЂС–РІРЅСЏРІ РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј: РІС…С–Рґ, СЃС‚РѕРї, РІРёС…С–Рґ, PnL С– СЏРєС–СЃС‚СЊ СѓРіРѕРґРё.",
      journalSyncAction: "РЎС‚РІРѕСЂРёС‚Рё СѓРіРѕРґСѓ С–Р· СЃРёРіРЅР°Р»Сѓ",
      linkedJournalTitle: "РџРѕРІвЂ™СЏР·Р°РЅР° СѓРіРѕРґР° РІ Р¶СѓСЂРЅР°Р»С–",
      linkedJournalText:
        "Р¦СЏ СѓРіРѕРґР° РІР¶Рµ РїРѕРІвЂ™СЏР·Р°РЅР° С–Р· СЃРёРіРЅР°Р»РѕРј. SkillEdge Р·РјРѕР¶Рµ РїРѕСЂС–РІРЅСЏС‚Рё РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј РєР»С–С”РЅС‚Р°.",
      linkedJournalEmpty:
        "РџРѕРєРё РЅРµРјР°С” Р·Р±РµСЂРµР¶РµРЅРѕС— СѓРіРѕРґРё РІ Р¶СѓСЂРЅР°Р»С–, РїРѕРІвЂ™СЏР·Р°РЅРѕС— Р· С†РёРј СЃРёРіРЅР°Р»РѕРј.",
      linkedTrades: "РџРѕРІвЂ™СЏР·Р°РЅС– СѓРіРѕРґРё",
      linkedPnl: "PnL РїРѕРІвЂ™СЏР·Р°РЅРёС… СѓРіРѕРґ",
      linkedResult: "Р РµР·СѓР»СЊС‚Р°С‚",
      journalLinkAnalyticsTitle: "РЎРёРіРЅР°Р»Рё в†” Р–СѓСЂРЅР°Р»",
      journalLinkAnalyticsText:
        "SkillEdge РІС–РґСЃС‚РµР¶СѓС”, СЏРєС– СЃРёРіРЅР°Р»Рё СЃС‚Р°Р»Рё СЂРµР°Р»СЊРЅРёРјРё СѓРіРѕРґР°РјРё РІ Р¶СѓСЂРЅР°Р»С–. Р¦Рµ Р±Р°Р·Р° РґР»СЏ Р°РЅР°Р»С–Р·Сѓ РІРёРєРѕРЅР°РЅРЅСЏ, PnL РїРѕ СЃРёРіРЅР°Р»Р°С… С– СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№.",
      takenWithoutJournal: "Р’Р·СЏС‚Рѕ Р±РµР· Р¶СѓСЂРЅР°Р»Сѓ",
      linkedAlertsCount: "РџРѕРІвЂ™СЏР·Р°РЅС– СЃРёРіРЅР°Р»Рё",
      linkedTradesPnl: "PnL РїРѕРІвЂ™СЏР·Р°РЅРёС… СѓРіРѕРґ",
      avgExecutionScore: "РЎРµСЂРµРґРЅСЏ РѕС†С–РЅРєР° РІРёРєРѕРЅР°РЅРЅСЏ",
      takenWithoutJournalFilter: "Р’Р·СЏС‚Рѕ Р±РµР· Р¶СѓСЂРЅР°Р»Сѓ",
      takenWithoutJournalTitle: "РЎРёРіРЅР°Р» РІР·СЏС‚Рѕ, Р°Р»Рµ СѓРіРѕРґРё РІ Р¶СѓСЂРЅР°Р»С– РЅРµРјР°С”",
      takenWithoutJournalText:
        "РљР»С–С”РЅС‚ РІС–РґРјС–С‚РёРІ СЃРёРіРЅР°Р» СЏРє В«Р’Р·СЏРІВ», Р°Р»Рµ С‰Рµ РЅРµ Р·Р±РµСЂС–Рі СѓРіРѕРґСѓ РІ Р¶СѓСЂРЅР°Р». РЎС‚РІРѕСЂРё СѓРіРѕРґСѓ С–Р· СЃРёРіРЅР°Р»Сѓ, С‰РѕР± SkillEdge Р·РјС–Рі РїРѕСЂС–РІРЅСЏС‚Рё РїР»Р°РЅ СЃРёРіРЅР°Р»Сѓ Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј.",
      executionScore: "РћС†С–РЅРєР° РІРёРєРѕРЅР°РЅРЅСЏ",
      executionReview: "Р РѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ",
      executionStrong: "РЎРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ",
      executionMedium: "РќРѕСЂРјР°Р»СЊРЅРѕ, Р°Р»Рµ С” С‰Рѕ РїРѕРєСЂР°С‰РёС‚Рё",
      executionWeak: "РџРѕС‚СЂС–Р±РµРЅ СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ",
      filterJournalLinked: "РџРѕРІвЂ™СЏР·Р°РЅРѕ Р· Р¶СѓСЂРЅР°Р»РѕРј",
      filterExecutionStrong: "РЎРёР»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ",
      filterExecutionReview: "РџРѕС‚СЂС–Р±РµРЅ СЂРѕР·Р±С–СЂ",
      executionQualityTitle: "РЇРєС–СЃС‚СЊ РІРёРєРѕРЅР°РЅРЅСЏ",
      executionQualityText:
        "SkillEdge РїРѕРєР°Р·СѓС”, СЏРєС– AI-СЃРёРіРЅР°Р»Рё РІР¶Рµ СЃС‚Р°Р»Рё СѓРіРѕРґР°РјРё РІ Р¶СѓСЂРЅР°Р»С– С– РґРµ РІРёРєРѕРЅР°РЅРЅСЏ Р±СѓР»Рѕ СЃРёР»СЊРЅРёРј Р°Р±Рѕ РїРѕС‚СЂРµР±СѓС” СЂРѕР·Р±РѕСЂСѓ.",
      executionCoachTitle: "AI-РєРѕСѓС‡ РІРёРєРѕРЅР°РЅРЅСЏ",
      executionCoachText:
        "SkillEdge СЂРѕР·Р±РёСЂР°С” РІРёРєРѕРЅР°РЅРЅСЏ РєР»С–С”РЅС‚Р° РІС–РґРЅРѕСЃРЅРѕ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ: РІС…С–Рґ, СЃС‚РѕРї, РЅР°РїСЂСЏРјРѕРє, С†С–Р»С– С‚Р° РґРёСЃС†РёРїР»С–РЅСѓ.",
      executionCoachEntryIssue:
        "РџСЂРѕР±Р»РµРјР° РІС…РѕРґСѓ: РІС…С–Рґ Р±СѓРІ РїРѕР·Р° РїР»Р°РЅРѕРІРѕСЋ Р·РѕРЅРѕСЋ Р°Р±Рѕ Р·Р°РЅР°РґС‚Рѕ РїС–Р·РЅРѕ РїС–СЃР»СЏ СЃРёРіРЅР°Р»Сѓ.",
      executionCoachStopIssue:
        "РџСЂРѕР±Р»РµРјР° СЃС‚РѕРїР°: СЃС‚РѕРї РІС–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ РІС–Рґ РїР»Р°РЅСѓ СЃРёРіРЅР°Р»Сѓ. Р¦Рµ РјРѕР¶Рµ Р»Р°РјР°С‚Рё СЃС‚Р°С‚РёСЃС‚РёРєСѓ С– СЂРёР·РёРє/РїРѕС‚РµРЅС†С–Р°Р».",
      executionCoachDirectionIssue:
        "РџСЂРѕР±Р»РµРјР° РЅР°РїСЂСЏРјРєСѓ: РЅР°РїСЂСЏРјРѕРє СѓРіРѕРґРё РІС–РґСЂС–Р·РЅСЏС”С‚СЊСЃСЏ РІС–Рґ РЅР°РїСЂСЏРјРєСѓ СЃРёРіРЅР°Р»Сѓ.",
      executionCoachTargetIssue:
        "РџСЂРѕР±Р»РµРјР° С†С–Р»РµР№: СѓРіРѕРґР° РЅРµ РґС–Р№С€Р»Р° РґРѕ TP Р°Р±Рѕ РІРёС…С–Рґ Р±СѓРІ РЅРµ Р·Р° РїР»Р°РЅРѕРј.",
      executionWeaknessTitle: "РљР°СЂС‚Р° СЃР»Р°Р±РєРёС… РјС–СЃС†СЊ РІРёРєРѕРЅР°РЅРЅСЏ",
      entryIssueFilter: "РџСЂРѕР±Р»РµРјРё РІС…РѕРґСѓ",
      stopIssueFilter: "РџСЂРѕР±Р»РµРјРё СЃС‚РѕРїР°",
      directionIssueFilter: "РџСЂРѕР±Р»РµРјРё РЅР°РїСЂСЏРјРєСѓ",
      targetIssueFilter: "РџСЂРѕР±Р»РµРјРё С†С–Р»РµР№",
      executionFocusTitle: "РџРµСЂСЃРѕРЅР°Р»СЊРЅРёР№ С„РѕРєСѓСЃ РІРёРєРѕРЅР°РЅРЅСЏ",
      openFocusAlerts: "Р’С–РґРєСЂРёС‚Рё СЃРёРіРЅР°Р»Рё Р· С†РёРј С„РѕРєСѓСЃРѕРј",
      executionActionPlanTitle: "РџР»Р°РЅ РґС–Р№ РЅР° С‚РёР¶РґРµРЅСЊ",
      executionActionPlanText:
        "SkillEdge РїРµСЂРµС‚РІРѕСЂСЋС” РіРѕР»РѕРІРЅРёР№ С„РѕРєСѓСЃ РІРёРєРѕРЅР°РЅРЅСЏ РЅР° РєРѕРЅРєСЂРµС‚РЅС– РїСЂР°РІРёР»Р° РґР»СЏ РЅР°СЃС‚СѓРїРЅРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ С‚РёР¶РЅСЏ.",
      outcomeFollowupTitle: "Р РѕР·Р±С–СЂ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ СЃРёРіРЅР°Р»Сѓ",
      outcomeFollowupText:
        "SkillEdge РїРѕСЂС–РІРЅСЋС” СЂС–С€РµРЅРЅСЏ РєР»С–С”РЅС‚Р° Р· С„Р°РєС‚РёС‡РЅРёРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј СЃРёРіРЅР°Р»Сѓ, С‰РѕР± Р·РЅР°С…РѕРґРёС‚Рё СѓРїСѓС‰РµРЅС– РјРѕР¶Р»РёРІРѕСЃС‚С–, С…РѕСЂРѕС€С– РїСЂРѕРїСѓСЃРєРё С‚Р° СѓРіРѕРґРё, СЏРєС– РїРѕС‚СЂРµР±СѓСЋС‚СЊ СЂРѕР·Р±РѕСЂСѓ.",
      outcomeLearningLabel: "РќР°РІС‡Р°Р»СЊРЅР° РЅРѕС‚Р°С‚РєР°",
      outcomeStatsLabel: "РЎС‚Р°С‚РёСЃС‚РёРєР° СЂРµР·СѓР»СЊС‚Р°С‚С–РІ",
      outcomeLearningAnalyticsTitle: "РђРЅР°Р»С–С‚РёРєР° РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…",
      outcomeLearningFocusTitle: "Р¤РѕРєСѓСЃ РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…",
      missedOpportunityCoachTitle: "РљРѕСѓС‡ СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№",
      missedOpportunityCoachText:
        "SkillEdge СЂРѕР·Р±РёСЂР°С” СЂРѕР±РѕС‡С– СЃРёРіРЅР°Р»Рё, СЏРєС– РєР»С–С”РЅС‚ РїСЂРѕРїСѓСЃС‚РёРІ, С‰РѕР± Р·РЅР°Р№С‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅСѓ РїСЂРёС‡РёРЅСѓ: СЃС‚СЂР°С…, РІС–РґСЃСѓС‚РЅС–СЃС‚СЊ Р±С–Р»СЏ РµРєСЂР°РЅР°, РїС–Р·РЅСЏ СЂРµР°РєС†С–СЏ Р°Р±Рѕ СЃР»Р°Р±РєР° РґРѕРІС–СЂР° РґРѕ СЃРµС‚Р°РїСѓ.",
      missedOpportunityTopSetup: "Р“РѕР»РѕРІРЅРёР№ РїСЂРѕРїСѓС‰РµРЅРёР№ СЃРµС‚Р°Рї",
      missedOpportunityActionPlan: "РџР»Р°РЅ РґС–Р№ РїРѕ СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚СЏС…",
      alertsStateLoadingTitle: "SkillEdge AI СЃРєР°РЅСѓС” СЂРёРЅРѕРє",
      alertsStateLoadingText:
        "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ РѕСЃС‚Р°РЅРЅС– СЃРёРіРЅР°Р»Рё, РїРµСЂРµРІС–СЂСЏС”РјРѕ РїРµСЂСЃРѕРЅР°Р»СЊРЅРёР№ РїСЂС–РѕСЂРёС‚РµС‚, РєРѕРЅС‚РµРєСЃС‚ Р¶СѓСЂРЅР°Р»Сѓ, СЂРµР·СѓР»СЊС‚Р°С‚Рё Р№ СЃРІС–Р¶С–СЃС‚СЊ СЃРёРіРЅР°Р»С–РІ.",
      alertsStateErrorTitle: "РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё AI-СЃРёРіРЅР°Р»Рё",
      alertsStateErrorText:
        "РџРµСЂРµРІС–СЂ РїС–РґРєР»СЋС‡РµРЅРЅСЏ, Р°РІС‚РѕСЂРёР·Р°С†С–СЋ Р°Р±Рѕ РїРѕРІС‚РѕСЂРё Р·Р°РїРёС‚. РЇРєС‰Рѕ РїРѕРјРёР»РєР° РїРѕРІС‚РѕСЂСЋС”С‚СЊСЃСЏ вЂ” РїРѕС‚СЂС–Р±РЅРѕ РїРµСЂРµРІС–СЂРёС‚Рё backend/API-Р»РѕРіРё.",
      alertsStateEmptyTitle: "AI Trading Desk С‡РµРєР°С” СЏРєС–СЃРЅРёР№ СЃРµС‚Р°Рї",
      alertsStateEmptyText:
        "Р—Р°СЂР°Р· РЅРµРјР°С” Р°РєС‚РёРІРЅРёС… СЃРёРіРЅР°Р»С–РІ. Р¦Рµ РЅРѕСЂРјР°Р»СЊРЅРѕ: SkillEdge РЅРµ РјР°С” СЃС‚СЂС–Р»СЏС‚Рё С€СѓРјРѕРј. РљСЂР°С‰Рµ РјРµРЅС€Рµ СЃРёРіРЅР°Р»С–РІ, Р°Р»Рµ РІРёС‰Р° СЏРєС–СЃС‚СЊ.",
      alertsStateFilterEmptyTitle: "Р”Р»СЏ С†СЊРѕРіРѕ С„С–Р»СЊС‚СЂР° СЃРёРіРЅР°Р»С–РІ РЅРµРјР°С”",
      alertsStateFilterEmptyText:
        "РЎРїРёСЃРѕРє РїСЂР°С†СЋС”, Р°Р»Рµ РїРѕС‚РѕС‡РЅРёР№ С„С–Р»СЊС‚СЂ РЅРµ Р·РЅР°Р№С€РѕРІ РІС–РґРїРѕРІС–РґРЅРёС… СЃРёРіРЅР°Р»С–РІ. РЎРєРёРЅСЊ С„С–Р»СЊС‚СЂ Р°Р±Рѕ РґРѕС‡РµРєР°Р№СЃСЏ РЅРѕРІРѕС— high-confidence СЃРёС‚СѓР°С†С–С—.",
      alertsStateRunScan: "Р—Р°РїСѓСЃС‚РёС‚Рё СЃРєР°РЅСѓРІР°РЅРЅСЏ",
      alertsStateLiveNote: "Р¤РѕРЅРѕРІРёР№ РјРѕРЅС–С‚РѕСЂРёРЅРі РїСЂР°С†СЋС”",
      selectedFilter: "Р’РёР±СЂР°РЅРёР№ С„С–Р»СЊС‚СЂ",
      totalAlerts: "РЈСЃСЊРѕРіРѕ СЃРёРіРЅР°Р»С–РІ",
      alertsStateLiveMonitoringLabel: "Р¤РѕРЅРѕРІРёР№ РјРѕРЅС–С‚РѕСЂРёРЅРі",
      decisionVsOutcomeLabel: "Р С–С€РµРЅРЅСЏ / СЂРµР·СѓР»СЊС‚Р°С‚",
      nextLearningFocus: "РќР°СЃС‚СѓРїРЅРёР№ С„РѕРєСѓСЃ РЅР°РІС‡Р°РЅРЅСЏ",
      outcomeProfileStillForming: "РџСЂРѕС„С–Р»СЊ РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С… С‰Рµ С„РѕСЂРјСѓС”С‚СЊСЃСЏ",
      missedOpportunitiesLabel: "СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№",
      noMissedOpportunityPatternTitle: "РџР°С‚РµСЂРЅ СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№ С‰Рµ РЅРµ СЃС„РѕСЂРјРѕРІР°РЅРёР№",
      workedAlertsMissedSuffix: "СЂРѕР±РѕС‡РёС… СЃРёРіРЅР°Р»С–РІ Р±СѓР»Рё РїСЂРѕРїСѓС‰РµРЅС– РІ С†С–Р№ РіСЂСѓРїС– СЃРµС‚Р°РїС–РІ.",
      commonMistakeLabel: "РўРёРїРѕРІР° РїРѕРјРёР»РєР°:",
      scoreDisclaimer:
        "РћС†С–РЅРєР° РЅРµ С” РіР°СЂР°РЅС‚С–С”СЋ. РўРѕСЂРіСѓР№ С‚С–Р»СЊРєРё РїС–СЃР»СЏ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, Р°РґРµРєРІР°С‚РЅРѕРіРѕ СЃРїС–РІРІС–РґРЅРѕС€РµРЅРЅСЏ СЂРёР·РёРєСѓ РґРѕ РїРѕС‚РµРЅС†С–Р°Р»Сѓ С‚Р° РІР»Р°СЃРЅРѕРіРѕ С‡РµРєР»РёСЃС‚Р° РІРёРєРѕРЅР°РЅРЅСЏ.",
      closeBreakdownHint: "Р°Р±Рѕ РЅР°С‚РёСЃРЅРё РїРѕР·Р° РІС–РєРЅРѕРј, С‰РѕР± Р·Р°РєСЂРёС‚Рё С†РµР№ СЂРѕР·Р±С–СЂ.",
    },
  };

  const copy = {
    ...rawCopy,
    ...alertCopyOverrides[safeLanguage],
  };


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
        const generateResponse = await authFetch("/api/market/alerts", {
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

      const response = await authFetch("/api/market/alerts/personalized?limit=100&period=7d", {
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
  if (!hasAccess) return;

  loadAlerts(false);

  const interval = window.setInterval(() => {
    loadAlerts(false);
  }, 60000);

  return () => {
    window.clearInterval(interval);
  };
}, [hasAccess]);

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
}, [alertFilter]);

const workedCount = alerts.filter(
  (alert) => alert.outcome_status === "worked"
).length;

const failedCount = alerts.filter(
  (alert) => alert.outcome_status === "failed"
).length;

const neutralCount = alerts.filter(
  (alert) => alert.outcome_status === "neutral"
).length;

const pendingCount = alerts.filter(
  (alert) => !alert.outcome_status || alert.outcome_status === "pending"
).length;

const resolvedCount = workedCount + failedCount + neutralCount;

const qualityRate =
  resolvedCount > 0 ? Math.round((workedCount / resolvedCount) * 100) : null;

const mfeValues = alerts
  .map((alert) => alert.mfe)
  .filter((value): value is number => typeof value === "number");

const maeValues = alerts
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

const tpHitCount = alerts.filter((alert) => Boolean(alert.hit_target)).length;

const stopHitCount = alerts.filter((alert) => Boolean(alert.hit_stop)).length;
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

const visibleAlerts = alerts.filter((alert) => {
  if (
    decisionReasonFilter &&
    alert.user_alert_decision_note !== decisionReasonFilter
  ) {
    return false;
  }

  if (alertFilter === "all") return true;

if (alertFilter === "actionable") {
  return alert.signal_mode === "actionable";
}

if (alertFilter === "watchlist") {
  return alert.signal_mode === "watchlist";
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
  watching: alerts.filter(
    (alert) => alert.user_alert_decision === "watching"
  ).length,
  taken: alerts.filter((alert) => alert.user_alert_decision === "taken")
    .length,
  skipped: alerts.filter(
    (alert) => alert.user_alert_decision === "skipped"
  ).length,
  missed: alerts.filter((alert) => alert.user_alert_decision === "missed")
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

  if (pnlItems.length === 0) return "вЂ”";

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

  if (reviews.length === 0) return "вЂ”";

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
  count: alerts.filter((alert) => alert.signal_mode === "actionable").length,
},
{
  id: "watchlist",
  label: copy.filterWatchlist,
  count: alerts.filter((alert) => alert.signal_mode === "watchlist").length,
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
      <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
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
    <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)] sm:p-5">
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

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100/80">
          {error}
        </div>
      ) : null}

<div className="mt-5 rounded-[1.25rem] border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
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
        : "вЂ”"}
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
          {filter.label} В· {filter.count}
        </button>
      );
    })}
  </div>

  <div className="mt-3 text-xs text-white/35">
    Showing {visibleAlerts.length} of {alerts.length} alerts
{decisionReasonFilter ? ` В· Reason: ${decisionReasonFilter}` : ""}
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
      {qualityRate === null ? "вЂ”" : `${qualityRate}%`}
    </div>
  </div>

  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">
      {copy.avgMfe}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {avgMfe === null ? "вЂ”" : `${avgMfe.toFixed(2)}%`}
    </div>
  </div>

  <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4">
    <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/45">
      {copy.avgMae}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">
      {avgMae === null ? "вЂ”" : `${avgMae.toFixed(2)}%`}
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
          {topTradePattern ? topTradePattern.pattern_name : "вЂ”"}
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
              {topTradePattern.trades_count} trades В· PnL $
              {Number(topTradePattern.total_pnl || 0).toFixed(2)} В· avg $
              {topTradePattern.avg_pnl === null
                ? "вЂ”"
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
                  {pattern.market || "market"} В· {pattern.direction || "setup"}
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
                        ? "вЂ”"
                        : `$${Number(pattern.avg_pnl).toFixed(2)}`}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Best PnL
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {pattern.best_pnl === null
                        ? "вЂ”"
                        : `$${Number(pattern.best_pnl).toFixed(2)}`}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                      Avg stop %
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {pattern.avg_stop_distance_percent === null
                        ? "вЂ”"
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
              {topSignalProfile.trades_count} trades В· win rate{" "}
              {topSignalProfile.win_rate === null
                ? "вЂ”"
                : `${topSignalProfile.win_rate}%`}{" "}
              В· PnL ${Number(topSignalProfile.total_pnl || 0).toFixed(2)}
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
                    {profile.asset_type || "market"} В·{" "}
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
                      ? "вЂ”"
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
                        {profile.win_rate === null ? "вЂ”" : `${profile.win_rate}%`}
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
                          ? "вЂ”"
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
                        ? "вЂ”"
                        : `$${Number(profile.best_pnl).toFixed(2)}`}
                    </span>

                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                      Worst:{" "}
                      {profile.worst_pnl === null
                        ? "вЂ”"
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
                  {setup.asset_type || "market"} В· {setup.direction || "setup"}
                </div>

                <div className="mt-2 text-xl font-semibold text-white">
                  {setup.setup_name}
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/50">
                  TF: {setup.setup_timeframe || "5m"} setup /{" "}
                  {setup.confirmation_timeframe || "10m"} confirmation
                </div>

                <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-cyan-50/75">
                  {copy.lastExample}: {setup.example_symbol || "вЂ”"}
                  {setup.confidence_tier ? ` В· ${setup.confidence_tier}` : ""}
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
                          вњ“ {item}
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
                          вљ  {item}
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
                      ? `${setup.example_entry_zone_min}вЂ“${setup.example_entry_zone_max}`
                      : "вЂ”"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Stop: {setup.example_stop_price || "вЂ”"}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                    Targets:{" "}
                    {[
                      setup.example_target_1,
                      setup.example_target_2,
                      setup.example_target_3,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "вЂ”"}
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
      Taken rate: {takenRate === null ? "вЂ”" : `${takenRate}%`}
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
          ? "вЂ”"
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
        ? `${primaryExecutionFocus.label} В· ${primaryExecutionFocus.count}`
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
                {item.label} В· {item.count}
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
        ? `${primaryOutcomeLearningFocus.label} В· ${primaryOutcomeLearningFocus.count}`
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
                {item.label} В· {item.count}
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
          {topMissedOpportunitySetup ? topMissedOpportunitySetup[0] : "вЂ”"}
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
        {copy.topReason}: {topDecisionReason?.reason || "вЂ”"}
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
          {item.reason} В· {item.count}
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
            : "вЂ”"}
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
  displayedAlerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[120px_minmax(190px,260px)_minmax(0,1fr)]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                    {alert.asset_type} В· {alert.exchange || "вЂ”"}
                  </div>

                  <div className="mt-1 text-3xl font-semibold text-white">
                    {alert.symbol}
                  </div>

                  <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                    {copy.confidence}: {alert.confidence_score || alert.score}
{alert.confidence_tier ? ` В· ${alert.confidence_tier}` : ""}
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
                          ? `${alert.entry_zone_min}вЂ“${alert.entry_zone_max}`
                          : "wait trigger"}
                      </span>
                    </div>

                    <div>
                      {copy.stop}:{" "}
                      <span className="text-white/75">
                        {alert.stop_price || "вЂ”"}
                      </span>
                    </div>

                    <div>
                      {copy.targets}:{" "}
                      <span className="text-white/75">
                        {[alert.target_1, alert.target_2, alert.target_3]
                          .filter(Boolean)
                          .join(" / ") || "вЂ”"}
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
        Journal linked: {linkedTrades.length} В· PnL{" "}
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
    Taken В· Journal missing
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
        {alert.mfe === null || alert.mfe === undefined ? "вЂ”" : `${alert.mfe}%`}
      </div>
    </div>

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">MAE</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.mae === null || alert.mae === undefined ? "вЂ”" : `${alert.mae}%`}
      </div>
    </div>

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="uppercase tracking-[0.16em] text-white/30">Target</div>
      <div className="mt-1 font-semibold text-white/70">
        {alert.hit_target || "вЂ”"}
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
          ))
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
                  {breakdownAlert.confidence_score ?? breakdownAlert.score ?? "вЂ”"}
                  {breakdownAlert.confidence_tier
                    ? ` В· ${breakdownAlert.confidence_tier}`
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
  <span className="text-base leading-none">Г—</span>
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
            {getLinkedResultLabel(linkedTrades) || "вЂ”"}
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
          ? "вЂ”"
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
              В· {trade.direction} В· {trade.trade_date} В· PnL{" "}
              {typeof trade.pnl === "number"
                ? `${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}`
                : "вЂ”"}{" "}
              В· {trade.result || "open"}
            </div>

            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              {copy.executionScore}: {score === null ? "вЂ”" : `${score}/100`}
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
                ? "вЂ”"
                : `${Number(breakdownAlert.mfe).toFixed(2)}%`}{" "}
              /{" "}
              {breakdownAlert.mae === null || breakdownAlert.mae === undefined
                ? "вЂ”"
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
                  ? "TP РЅРµ РґРѕСЃСЏРіРЅСѓС‚Рѕ"
                  : safeLanguage === "en"
                    ? "Target not reached"
                    : "TP РЅРµ РґРѕСЃС‚РёРіРЅСѓС‚")} /{" "}
              {breakdownAlert.hit_stop
                ? copy.stopHit
                : safeLanguage === "ua"
                  ? "РЎС‚РѕРї РЅРµ Р·Р°С‡РµРїР»РµРЅРѕ"
                  : safeLanguage === "en"
                    ? "Stop not hit"
                    : "РЎС‚РѕРї РЅРµ Р·Р°РґРµС‚"}
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
                      {breakdownAlert.direction || "вЂ”"}
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
                        ? `${breakdownAlert.entry_zone_min}вЂ“${breakdownAlert.entry_zone_max}`
                        : "Wait trigger"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-300/15 bg-red-300/[0.035] p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-red-100/45">
                      {copy.stop}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {breakdownAlert.stop_price ?? breakdownAlert.invalidation ?? "вЂ”"}
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
                        .join(" / ") || "вЂ”"}
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
                    {breakdownAlert.confidence_score ?? breakdownAlert.score ?? "вЂ”"}
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
                        вњ“ {item}
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
                        вљ  {item}
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
      title: "Р¦РµРЅС‚СЂ СЂС‹РЅРѕС‡РЅРѕР№ СЂР°Р·РІРµРґРєРё",
      subtitle:
        "Р•РґРёРЅС‹Р№ С†РµРЅС‚СЂ РїРѕРёСЃРєР° Р°РєС‚РёРІРЅС‹С… С‚РёРєРµСЂРѕРІ: РґРІРёР¶РµРЅРёРµ СЂС‹РЅРєР°, РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ, РЅРѕРІРѕСЃС‚РЅС‹Рµ РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹ Рё AI-СЂР°Р·Р±РѕСЂ Р»СѓС‡С€РёС… РєР°РЅРґРёРґР°С‚РѕРІ.",
      topTitle: "Р›СѓС‡С€РёРµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё СЃРµР№С‡Р°СЃ",
      topText:
        "РћРґРёРЅ СЃРїРёСЃРѕРє РІРјРµСЃС‚Рѕ РѕС‚РґРµР»СЊРЅС‹С… СЃРєР°РЅРµСЂРѕРІ. РЎРёСЃС‚РµРјР° РѕР±СЉРµРґРёРЅСЏРµС‚ СЂС‹РЅРѕС‡РЅСѓСЋ Р°РєС‚РёРІРЅРѕСЃС‚СЊ, Reddit-СѓРїРѕРјРёРЅР°РЅРёСЏ, РЅРѕРІРѕСЃС‚РЅС‹Рµ РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹, РєСЂРёРїС‚Рѕ-Р°РєС‚РёРІРЅРѕСЃС‚СЊ Binance Рё РіРѕС‚РѕРІРёС‚ С‚РёРєРµСЂС‹ РґР»СЏ AI-СЂР°Р·Р±РѕСЂР°.",
      aiSoon: "AI-СЃР»РѕР№",
      aiSoonText:
        "AI-СЃР»РѕР№ РїРѕРјРѕРіР°РµС‚ СЂР°Р·РѕР±СЂР°С‚СЊ СЃС†РµРЅР°СЂРёР№, СЃРѕРІРїР°РґРµРЅРёСЏ С„Р°РєС‚РѕСЂРѕРІ, СЂРёСЃРє Р»РѕРІСѓС€РєРё, СѓСЃР»РѕРІРёСЏ РѕС‚РјРµРЅС‹ РёРґРµРё Рё РґР°Р»СЊРЅРµР№С€РёР№ РїР»Р°РЅ РЅР°Р±Р»СЋРґРµРЅРёСЏ.",
      dataNote:
        "РЎРµР№С‡Р°СЃ РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ РїРѕРґРєР»СЋС‡С‘РЅРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРё РґР°РЅРЅС‹С…. Production data stack СЂР°СЃС€РёСЂРёС‚ РїРѕРєСЂС‹С‚РёРµ СЂС‹РЅРєР°, РІРЅСѓС‚СЂРёРґРЅРµРІРЅС‹Рµ С‚Р°Р№РјС„СЂРµР№РјС‹ Рё РїРѕР»РЅС‹Р№ universe Р°РєС†РёР№/РєСЂРёРїС‚Рѕ.",
      refreshAll: "РћР±РЅРѕРІРёС‚СЊ РІСЃС‘",
      aiAnalyzeTop: "AI-РѕР±Р·РѕСЂ СЂС‹РЅРєР°",
      aiAnalyzeTitle: "AI-РѕР±Р·РѕСЂ С‚РѕРї-10 РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№",
      aiAnalyzeText:
        "SkillEdge AI СЂР°Р·Р±РёСЂР°РµС‚ С‚РѕРї-10 РєР°РЅРґРёРґР°С‚РѕРІ РёР· СЂС‹РЅРѕС‡РЅРѕР№ СЂР°Р·РІРµРґРєРё: РїРѕС‡РµРјСѓ С‚РёРєРµСЂ Р°РєС‚РёРІРµРЅ, РєР°РєРѕР№ СЃРµС‚Р°Рї С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ, РіРґРµ СЂРёСЃРє Р»РѕРІСѓС€РєРё, РєР°РєРѕР№ СЃС†РµРЅР°СЂРёР№ СЃРјРѕС‚СЂРµС‚СЊ Рё РіРґРµ РёРґРµСЏ Р»РѕРјР°РµС‚СЃСЏ.",
      aiAnalyzeEmpty: "РЎРЅР°С‡Р°Р»Р° РѕР±РЅРѕРІРё СЃРєР°РЅРµСЂ, С‡С‚РѕР±С‹ РїРѕСЏРІРёР»РёСЃСЊ С‚РёРєРµСЂС‹ РґР»СЏ AI-СЂР°Р·Р±РѕСЂР°.",
      aiAnalyzePreview: "AI-РїСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ",
      aiAnalyzeClose: "Р—Р°РєСЂС‹С‚СЊ",
      aiHistory: "РСЃС‚РѕСЂРёСЏ",
      aiHistoryTitle: "РСЃС‚РѕСЂРёСЏ AI-РѕР±Р·РѕСЂРѕРІ СЂС‹РЅРєР°",
      aiHistoryText: "РџРѕСЃР»РµРґРЅРёРµ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ AI-РѕР±Р·РѕСЂС‹ СЂС‹РЅРєР°.",
      aiHistoryEmpty: "РСЃС‚РѕСЂРёРё РїРѕРєР° РЅРµС‚. Р—Р°РїСѓСЃС‚Рё AI-РѕР±Р·РѕСЂ СЂС‹РЅРєР°, С‡С‚РѕР±С‹ СЃРѕС…СЂР°РЅРёС‚СЊ РїРµСЂРІС‹Р№ СЂР°Р·Р±РѕСЂ.",
      aiHistoryLoading: "Р—Р°РіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋ...",
      aiOpenBrief: "РћС‚РєСЂС‹С‚СЊ РѕР±Р·РѕСЂ",
      aiCloseBrief: "Р—Р°РєСЂС‹С‚СЊ РѕР±Р·РѕСЂ",
      aiSavedAnalysis: "РЎРѕС…СЂР°РЅС‘РЅРЅС‹Р№ AI-СЂР°Р·Р±РѕСЂ",
      aiStocks: "РђРєС†РёРё",
      aiCrypto: "РљСЂРёРїС‚Рѕ",
      aiShowMore: "РџРѕРєР°Р·Р°С‚СЊ РµС‰С‘",
      aiShowLess: "РЎРІРµСЂРЅСѓС‚СЊ",
      aiNoItemsForTab: "РќРµС‚ РєР°РЅРґРёРґР°С‚РѕРІ РґР»СЏ СЌС‚РѕРіРѕ СЂС‹РЅРєР°.",
      aiAnalyzeError: "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ AI-СЂР°Р·Р±РѕСЂ. РџСЂРѕРІРµСЂСЊ СЃРµСЂРІРµСЂРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё Рё РїРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.",
      refreshing: "РћР±РЅРѕРІР»СЏРµРј...",
      search: "РџРѕРёСЃРє С‚РёРєРµСЂР°...",
      asset: "РђРєС‚РёРІ",
      signal: "РЎРёРіРЅР°Р»",
      sort: "РЎРѕСЂС‚РёСЂРѕРІРєР°",
      allAssets: "Р’СЃРµ Р°РєС‚РёРІС‹",
      stocks: "РђРєС†РёРё",
      crypto: "РљСЂРёРїС‚Рѕ",
      allSignals: "Р’СЃРµ СЃРёРіРЅР°Р»С‹",
      combined: "РљРѕРјР±РёРЅРёСЂРѕРІР°РЅРЅС‹Р№",
      marketOnly: "РўРѕР»СЊРєРѕ СЂС‹РЅРѕРє",
      socialOnly: "РўРѕР»СЊРєРѕ РІРЅРёРјР°РЅРёРµ",
      sortScore: "РћР±С‰РёР№ СЂРµР№С‚РёРЅРі",
      sortMentions: "РЈРїРѕРјРёРЅР°РЅРёСЏ 24С‡",
      sortMove: "Р”РІРёР¶РµРЅРёРµ %",
      sortSocial: "Р РµР№С‚РёРЅРі РІРЅРёРјР°РЅРёСЏ",
      ticker: "РўРёРєРµСЂ",
      combinedScore: "Р РµР№С‚РёРЅРі",
      mentions24h: "РћС‚СЃР»РµР¶РµРЅРѕ Р·Р° 24С‡",
      move: "Р”РІРёР¶РµРЅРёРµ",
      reason: "РџРѕС‡РµРјСѓ РІР°Р¶РЅРѕ",
      noData: "РџРѕРєР° РЅРµС‚ РґР°РЅРЅС‹С…. РќР°Р¶РјРё В«РћР±РЅРѕРІРёС‚СЊ РІСЃС‘В».",
      rawMarket: "РСЃС…РѕРґРЅС‹Рµ СЂС‹РЅРѕС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ",
      rawSocial: "РСЃС…РѕРґРЅС‹Рµ РґР°РЅРЅС‹Рµ РІРЅРёРјР°РЅРёСЏ",
      showRaw: "РџРѕРєР°Р·Р°С‚СЊ РёСЃС…РѕРґРЅС‹Рµ РґР°РЅРЅС‹Рµ",
      hideRaw: "РЎРєСЂС‹С‚СЊ РёСЃС…РѕРґРЅС‹Рµ РґР°РЅРЅС‹Рµ",
      source: "РСЃС‚РѕС‡РЅРёРє",
      autoRefresh: "РђРІС‚РѕРѕР±РЅРѕРІР»РµРЅРёРµ",
      autoRefreshValue: "РєР°Р¶РґС‹Рµ 15 РјРёРЅСѓС‚",
      coverageTitle: "РџРѕРєСЂС‹С‚РёРµ РґР°РЅРЅС‹С…",
      coverageText:
        "РЈРїРѕРјРёРЅР°РЅРёСЏ РїРѕРєР°Р·С‹РІР°СЋС‚ С‚РѕР»СЊРєРѕ РїРѕРґРєР»СЋС‡С‘РЅРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРё: СЃРµР№С‡Р°СЃ Reddit; РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРё РіРѕС‚РѕРІСЏС‚СЃСЏ Рє СЂР°СЃС€РёСЂРµРЅРёСЋ РїРѕРєСЂС‹С‚РёСЏ. Р­С‚Рѕ РЅРµ РїРѕР»РЅС‹Р№ РѕС…РІР°С‚ РІСЃРµРіРѕ РёРЅС‚РµСЂРЅРµС‚Р°.",
      scanned: "РЎРєР°РЅРёСЂРѕРІР°РЅРёРµ",
      lockedTitle: "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР° РґРѕСЃС‚СѓРїРЅР° РЅР° SkillEdge Edge Рё Elite.",
      lockedText:
        "РќР° Core РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РїСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ. Edge Рё Elite РѕС‚РєСЂС‹РІР°СЋС‚ СЂС‹РЅРѕС‡РЅС‹Р№ СЃРєР°РЅРµСЂ, РѕС‚СЃР»РµР¶РёРІР°РµРјРѕРµ РІРЅРёРјР°РЅРёРµ, РєРѕРјР±РёРЅРёСЂРѕРІР°РЅРЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё Рё AI-РѕР±Р·РѕСЂ СЂС‹РЅРєР°.",
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
      noData: "No data yet. Click вЂњRefresh allвЂќ.",
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
      title: "Р¦РµРЅС‚СЂ СЂРёРЅРєРѕРІРѕС— СЂРѕР·РІС–РґРєРё",
      subtitle:
        "Р„РґРёРЅРёР№ С†РµРЅС‚СЂ РїРѕС€СѓРєСѓ Р°РєС‚РёРІРЅРёС… С‚РёРєРµСЂС–РІ: СЂСѓС… СЂРёРЅРєСѓ, РІС–РґСЃС‚РµР¶СѓРІР°РЅР° СѓРІР°РіР°, РЅРѕРІРёРЅРЅС– РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё С‚Р° AI-СЂРѕР·Р±С–СЂ РЅР°Р№РєСЂР°С‰РёС… РєР°РЅРґРёРґР°С‚С–РІ.",
      topTitle: "РќР°Р№РєСЂР°С‰С– РјРѕР¶Р»РёРІРѕСЃС‚С– Р·Р°СЂР°Р·",
      topText:
        "РћРґРёРЅ СЃРїРёСЃРѕРє Р·Р°РјС–СЃС‚СЊ РѕРєСЂРµРјРёС… СЃРєР°РЅРµСЂС–РІ. РЎРёСЃС‚РµРјР° РїРѕС”РґРЅСѓС” СЂРёРЅРєРѕРІСѓ Р°РєС‚РёРІРЅС–СЃС‚СЊ, Reddit-Р·РіР°РґРєРё, РЅРѕРІРёРЅРЅС– РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё, РєСЂРёРїС‚Рѕ-Р°РєС‚РёРІРЅС–СЃС‚СЊ Binance С– РіРѕС‚СѓС” С‚РёРєРµСЂРё РґР»СЏ AI-СЂРѕР·Р±РѕСЂСѓ.",
      aiSoon: "AI-С€Р°СЂ",
      aiSoonText:
        "AI-С€Р°СЂ РґРѕРїРѕРјР°РіР°С” СЂРѕР·С–Р±СЂР°С‚Рё СЃС†РµРЅР°СЂС–Р№, Р·Р±С–Рі С„Р°РєС‚РѕСЂС–РІ, СЂРёР·РёРє РїР°СЃС‚РєРё, СѓРјРѕРІРё СЃРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС— С‚Р° РїРѕРґР°Р»СЊС€РёР№ РїР»Р°РЅ СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ.",
      dataNote:
        "Р—Р°СЂР°Р· РІРёРєРѕСЂРёСЃС‚РѕРІСѓСЋС‚СЊСЃСЏ РїС–РґРєР»СЋС‡РµРЅС– РґР¶РµСЂРµР»Р° РґР°РЅРёС…. Production data stack СЂРѕР·С€РёСЂРёС‚СЊ РїРѕРєСЂРёС‚С‚СЏ СЂРёРЅРєСѓ, РІРЅСѓС‚СЂС–С€РЅСЊРѕРґРµРЅРЅС– С‚Р°Р№РјС„СЂРµР№РјРё С‚Р° РїРѕРІРЅРёР№ universe Р°РєС†С–Р№/РєСЂРёРїС‚Рѕ.",
      refreshAll: "РћРЅРѕРІРёС‚Рё РІСЃРµ",
      aiAnalyzeTop: "AI-РѕРіР»СЏРґ СЂРёРЅРєСѓ",
      aiAnalyzeTitle: "AI-РѕРіР»СЏРґ С‚РѕРї-10 РјРѕР¶Р»РёРІРѕСЃС‚РµР№",
      aiAnalyzeText:
        "SkillEdge AI СЂРѕР·Р±РёСЂР°С” С‚РѕРї-10 РєР°РЅРґРёРґР°С‚С–РІ С–Р· СЂРёРЅРєРѕРІРѕС— СЂРѕР·РІС–РґРєРё: С‡РѕРјСѓ С‚РёРєРµСЂ Р°РєС‚РёРІРЅРёР№, СЏРєРёР№ СЃРµС‚Р°Рї С„РѕСЂРјСѓС”С‚СЊСЃСЏ, РґРµ СЂРёР·РёРє РїР°СЃС‚РєРё, СЏРєРёР№ СЃС†РµРЅР°СЂС–Р№ РґРёРІРёС‚РёСЃСЏ С– РґРµ С–РґРµСЏ Р»Р°РјР°С”С‚СЊСЃСЏ.",
      aiAnalyzeEmpty: "РЎРїРѕС‡Р°С‚РєСѓ РѕРЅРѕРІРё СЃРєР°РЅРµСЂ, С‰РѕР± Р·КјСЏРІРёР»РёСЃСЏ С‚РёРєРµСЂРё РґР»СЏ AI-СЂРѕР·Р±РѕСЂСѓ.",
      aiAnalyzePreview: "AI-РїРµСЂРµРіР»СЏРґ",
      aiAnalyzeClose: "Р—Р°РєСЂРёС‚Рё",
      aiHistory: "Р†СЃС‚РѕСЂС–СЏ",
      aiHistoryTitle: "Р†СЃС‚РѕСЂС–СЏ AI-РѕРіР»СЏРґС–РІ СЂРёРЅРєСѓ",
      aiHistoryText: "РћСЃС‚Р°РЅРЅС– Р·Р±РµСЂРµР¶РµРЅС– AI-РѕРіР»СЏРґРё СЂРёРЅРєСѓ.",
      aiHistoryEmpty: "Р†СЃС‚РѕСЂС–С— С‰Рµ РЅРµРјР°С”. Р—Р°РїСѓСЃС‚Рё AI-РѕРіР»СЏРґ СЂРёРЅРєСѓ, С‰РѕР± Р·Р±РµСЂРµРіС‚Рё РїРµСЂС€РёР№ СЂРѕР·Р±С–СЂ.",
      aiHistoryLoading: "Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ С–СЃС‚РѕСЂС–СЋ...",
      aiOpenBrief: "Р’С–РґРєСЂРёС‚Рё РѕРіР»СЏРґ",
      aiCloseBrief: "Р—Р°РєСЂРёС‚Рё РѕРіР»СЏРґ",
      aiSavedAnalysis: "Р—Р±РµСЂРµР¶РµРЅРёР№ AI-СЂРѕР·Р±С–СЂ",
      aiStocks: "РђРєС†С–С—",
      aiCrypto: "РљСЂРёРїС‚Рѕ",
      aiShowMore: "РџРѕРєР°Р·Р°С‚Рё С‰Рµ",
      aiShowLess: "Р—РіРѕСЂРЅСѓС‚Рё",
      aiNoItemsForTab: "РќРµРјР°С” РєР°РЅРґРёРґР°С‚С–РІ РґР»СЏ С†СЊРѕРіРѕ СЂРёРЅРєСѓ.",
      aiAnalyzeError: "РќРµ РІРґР°Р»РѕСЃСЏ РѕС‚СЂРёРјР°С‚Рё AI-СЂРѕР·Р±С–СЂ. РџРµСЂРµРІС–СЂ СЃРµСЂРІРµСЂРЅС– РЅР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ С– СЃРїСЂРѕР±СѓР№ С‰Рµ СЂР°Р·.",
      refreshing: "РћРЅРѕРІР»СЋС”РјРѕ...",
      search: "РџРѕС€СѓРє С‚РёРєРµСЂР°...",
      asset: "РђРєС‚РёРІ",
      signal: "РЎРёРіРЅР°Р»",
      sort: "РЎРѕСЂС‚СѓРІР°РЅРЅСЏ",
      allAssets: "РЈСЃС– Р°РєС‚РёРІРё",
      stocks: "РђРєС†С–С—",
      crypto: "РљСЂРёРїС‚Рѕ",
      allSignals: "РЈСЃС– СЃРёРіРЅР°Р»Рё",
      combined: "РљРѕРјР±С–РЅРѕРІР°РЅРёР№",
      marketOnly: "РўС–Р»СЊРєРё СЂРёРЅРѕРє",
      socialOnly: "РўС–Р»СЊРєРё СѓРІР°РіР°",
      sortScore: "Р—Р°РіР°Р»СЊРЅРёР№ СЂРµР№С‚РёРЅРі",
      sortMentions: "Р—РіР°РґРєРё 24Рі",
      sortMove: "Р СѓС… %",
      sortSocial: "Р РµР№С‚РёРЅРі СѓРІР°РіРё",
      ticker: "РўРёРєРµСЂ",
      combinedScore: "Р РµР№С‚РёРЅРі",
      mentions24h: "Р’С–РґСЃС‚РµР¶РµРЅРѕ Р·Р° 24Рі",
      move: "Р СѓС…",
      reason: "Р§РѕРјСѓ РІР°Р¶Р»РёРІРѕ",
      noData: "РџРѕРєРё РЅРµРјР°С” РґР°РЅРёС…. РќР°С‚РёСЃРЅРё В«РћРЅРѕРІРёС‚Рё РІСЃРµВ».",
      rawMarket: "Р’РёС…С–РґРЅС– СЂРёРЅРєРѕРІС– РґР°РЅС–",
      rawSocial: "Р’РёС…С–РґРЅС– РґР°РЅС– СѓРІР°РіРё",
      showRaw: "РџРѕРєР°Р·Р°С‚Рё РІРёС…С–РґРЅС– РґР°РЅС–",
      hideRaw: "РЎС…РѕРІР°С‚Рё РІРёС…С–РґРЅС– РґР°РЅС–",
      source: "Р”Р¶РµСЂРµР»Рѕ",
      autoRefresh: "РђРІС‚РѕРѕРЅРѕРІР»РµРЅРЅСЏ",
      autoRefreshValue: "РєРѕР¶РЅС– 15 С…РІРёР»РёРЅ",
      coverageTitle: "РџРѕРєСЂРёС‚С‚СЏ РґР°РЅРёС…",
      coverageText:
        "Р—РіР°РґРєРё РїРѕРєР°Р·СѓСЋС‚СЊ Р»РёС€Рµ РїС–РґРєР»СЋС‡РµРЅС– РґР¶РµСЂРµР»Р°: Р·Р°СЂР°Р· Reddit, РїС–Р·РЅС–С€Рµ Stocktwits С– crypto-native РґР¶РµСЂРµР»Р°. Р¦Рµ РЅРµ РїРѕРІРЅРµ РїРѕРєСЂРёС‚С‚СЏ РІСЃСЊРѕРіРѕ С–РЅС‚РµСЂРЅРµС‚Сѓ.",
      scanned: "РЎРєР°РЅСѓРІР°РЅРЅСЏ",
      lockedTitle: "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР° РґРѕСЃС‚СѓРїРЅР° РЅР° SkillEdge Edge С‚Р° Elite.",
      lockedText:
        "РќР° Core РґРѕСЃС‚СѓРїРЅРёР№ Р»РёС€Рµ РїРѕРїРµСЂРµРґРЅС–Р№ РїРµСЂРµРіР»СЏРґ. Edge С‚Р° Elite РІС–РґРєСЂРёРІР°СЋС‚СЊ СЂРёРЅРєРѕРІРёР№ СЃРєР°РЅРµСЂ, РІС–РґСЃС‚РµР¶СѓРІР°РЅСѓ СѓРІР°РіСѓ, РєРѕРјР±С–РЅРѕРІР°РЅС– РјРѕР¶Р»РёРІРѕСЃС‚С– С‚Р° AI-РѕРіР»СЏРґ СЂРёРЅРєСѓ.",
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
    className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
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
      {label} В· {count}
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
      {tab.label} В· {tab.count}
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
      SkillEdge AI Р°РЅР°Р»РёР·РёСЂСѓРµС‚ С‚РѕРїРѕРІС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё...
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
                  {brief.analysisItems.length} AI items В· {brief.planId}
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
                  {item.symbol} В· {item.confluence_score}
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
    <span className="text-white/35">вЂ”</span>
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
      : "вЂ”"}{" "}
    В· market {marketSource || "вЂ”"} В· social {socialSource || "вЂ”"}
  </div>

  <div className="mt-1">
    {localText.scanned}:{" "}
    {marketIntelligenceScannedAt
      ? new Date(marketIntelligenceScannedAt).toLocaleString()
      : "вЂ”"}{" "}
    / market {scannedAt ? new Date(scannedAt).toLocaleString() : "вЂ”"} / social{" "}
    {socialScannedAt ? new Date(socialScannedAt).toLocaleString() : "вЂ”"}
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
                          {item.exchange || "US"} В· {item.source || "social"}
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
  const isRu = t.dashboard === "Р›РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚";
  const isUa = t.dashboard === "РћСЃРѕР±РёСЃС‚РёР№ РєР°Р±С–РЅРµС‚";

  const copy = isRu
    ? {
        badge: "Trading cockpit",
        title: "РљРѕРЅС‚СЂРѕР»СЊ РїСЂРѕС†РµСЃСЃР° РїРµСЂРµРґ СЂРµР·СѓР»СЊС‚Р°С‚РѕРј.",
        text:
          "Overview РїРѕРєР°Р·С‹РІР°РµС‚ РЅРµ РїСЂРѕСЃС‚Рѕ С†РёС„СЂС‹, Р° СЃРѕСЃС‚РѕСЏРЅРёРµ С‚РІРѕРµР№ С‚РѕСЂРіРѕРІРѕР№ СЃРёСЃС‚РµРјС‹: PnL, РІРёРЅСЂРµР№С‚, РґРёСЃС†РёРїР»РёРЅР°, РїРѕРІС‚РѕСЂСЏРµРјРѕСЃС‚СЊ Рё РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№.",
        sessionTitle: "РЎРѕСЃС‚РѕСЏРЅРёРµ С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°",
        sessionText:
          "РЎРЅР°С‡Р°Р»Р° Р¶СѓСЂРЅР°Р» Рё РґРёСЃС†РёРїР»РёРЅР°. РџРѕС‚РѕРј СЃС‚Р°С‚РёСЃС‚РёРєР°. РџРѕС‚РѕРј РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ РІС‹РІРѕРґС‹ Рё СѓР»СѓС‡С€РµРЅРёРµ.",
        focusTitle: "РќР° С‡С‚Рѕ СЃРјРѕС‚СЂРµС‚СЊ СЃРµРіРѕРґРЅСЏ",
        focusItems: [
          ["Р РёСЃРє", "РќРµ РїСЂРµРІС‹С€Р°С‚СЊ Р»РёРјРёС‚ СЂРёСЃРєР° РЅР° СЃРґРµР»РєСѓ."],
          ["Р”РёСЃС†РёРїР»РёРЅР°", "Р’С…РѕРґРёС‚СЊ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРµС‚Р°РїР°."],
          ["Р–СѓСЂРЅР°Р»", "Р¤РёРєСЃРёСЂРѕРІР°С‚СЊ РїСЂРёС‡РёРЅСѓ РІС…РѕРґР°, СЌРјРѕС†РёСЋ Рё РѕС€РёР±РєСѓ."],
          ["Review", "РџРѕСЃР»Рµ СЃРµСЃСЃРёРё СЂР°Р·РѕР±СЂР°С‚СЊ Р»СѓС‡С€РёРµ Рё С…СѓРґС€РёРµ СЂРµС€РµРЅРёСЏ."],
        ],
        weeklyLabel: "AI review layer",
        qualityTitle: "РљР°С‡РµСЃС‚РІРѕ РїСЂРѕС†РµСЃСЃР°",
        qualityItems: [
          "РќРµС‚ СЃС‚Р°С‚РёСЃС‚РёРєРё вЂ” РЅРµС‚ СЃРёСЃС‚РµРјС‹.",
          "РќРµС‚ Р¶СѓСЂРЅР°Р»Р° вЂ” РЅРµС‚ РїРµСЂСЃРѕРЅР°Р»РёР·Р°С†РёРё.",
          "РќРµС‚ review вЂ” РѕС€РёР±РєРё РїРѕРІС‚РѕСЂСЏСЋС‚СЃСЏ.",
        ],
      }
    : isUa
      ? {
          badge: "Trading cockpit",
          title: "РљРѕРЅС‚СЂРѕР»СЊ РїСЂРѕС†РµСЃСѓ РїРµСЂРµРґ СЂРµР·СѓР»СЊС‚Р°С‚РѕРј.",
          text:
            "Overview РїРѕРєР°Р·СѓС” РЅРµ РїСЂРѕСЃС‚Рѕ С†РёС„СЂРё, Р° СЃС‚Р°РЅ С‚РІРѕС”С— С‚РѕСЂРіРѕРІРѕС— СЃРёСЃС‚РµРјРё: PnL, РІС–РЅСЂРµР№С‚, РґРёСЃС†РёРїР»С–РЅСѓ, РїРѕРІС‚РѕСЂСЋРІР°РЅС–СЃС‚СЊ С– СЏРєС–СЃС‚СЊ СЂС–С€РµРЅСЊ.",
          sessionTitle: "РЎС‚Р°РЅ С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ",
          sessionText:
            "РЎРїРѕС‡Р°С‚РєСѓ Р¶СѓСЂРЅР°Р» С– РґРёСЃС†РёРїР»С–РЅР°. РџРѕС‚С–Рј СЃС‚Р°С‚РёСЃС‚РёРєР°. РџРѕС‚С–Рј РїРµСЂСЃРѕРЅР°Р»СЊРЅС– РІРёСЃРЅРѕРІРєРё С‚Р° РїРѕРєСЂР°С‰РµРЅРЅСЏ.",
          focusTitle: "РќР° С‰Рѕ РґРёРІРёС‚РёСЃСЊ СЃСЊРѕРіРѕРґРЅС–",
          focusItems: [
            ["Р РёР·РёРє", "РќРµ РїРµСЂРµРІРёС‰СѓРІР°С‚Рё Р»С–РјС–С‚ СЂРёР·РёРєСѓ РЅР° СѓРіРѕРґСѓ."],
            ["Р”РёСЃС†РёРїР»С–РЅР°", "Р’С…РѕРґРёС‚Рё С‚С–Р»СЊРєРё РїС–СЃР»СЏ РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ СЃРµС‚Р°РїСѓ."],
            ["Р–СѓСЂРЅР°Р»", "Р¤С–РєСЃСѓРІР°С‚Рё РїСЂРёС‡РёРЅСѓ РІС…РѕРґСѓ, РµРјРѕС†С–СЋ С‚Р° РїРѕРјРёР»РєСѓ."],
            ["Review", "РџС–СЃР»СЏ СЃРµСЃС–С— СЂРѕР·С–Р±СЂР°С‚Рё РЅР°Р№РєСЂР°С‰С– Р№ РЅР°Р№РіС–СЂС€С– СЂС–С€РµРЅРЅСЏ."],
          ],
          weeklyLabel: "AI review layer",
          qualityTitle: "РЇРєС–СЃС‚СЊ РїСЂРѕС†РµСЃСѓ",
          qualityItems: [
            "РќРµРјР°С” СЃС‚Р°С‚РёСЃС‚РёРєРё вЂ” РЅРµРјР°С” СЃРёСЃС‚РµРјРё.",
            "РќРµРјР°С” Р¶СѓСЂРЅР°Р»Сѓ вЂ” РЅРµРјР°С” РїРµСЂСЃРѕРЅР°Р»С–Р·Р°С†С–С—.",
            "РќРµРјР°С” review вЂ” РїРѕРјРёР»РєРё РїРѕРІС‚РѕСЂСЋСЋС‚СЊСЃСЏ.",
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
            "No statistics вЂ” no system.",
            "No journal вЂ” no personalization.",
            "No review вЂ” mistakes repeat.",
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
                  вњ“ {item}
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
          helper={isRu ? "РџРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ СЃРґРµР»РѕРє" : isUa ? "Р—КјСЏРІРёС‚СЊСЃСЏ РїС–СЃР»СЏ СѓРіРѕРґ" : "Appears after trades"}
          accent="positive"
        />

        <MetricCard
          label={t.overview.winRate}
          value="вЂ”"
          helper={isRu ? "РќСѓР¶РЅР° РёСЃС‚РѕСЂРёСЏ СЃРґРµР»РѕРє" : isUa ? "РџРѕС‚СЂС–Р±РЅР° С–СЃС‚РѕСЂС–СЏ СѓРіРѕРґ" : "Needs trade history"}
          accent="neutral"
        />

        <MetricCard
          label={t.overview.discipline}
          value="вЂ”"
          helper={isRu ? "РЎС‚СЂРѕРёС‚СЃСЏ РёР· Р¶СѓСЂРЅР°Р»Р°" : isUa ? "Р‘СѓРґСѓС”С‚СЊСЃСЏ Р· Р¶СѓСЂРЅР°Р»Сѓ" : "Built from journal"}
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
              isRu ? "PnL РґРёРЅР°РјРёРєР°" : isUa ? "PnL РґРёРЅР°РјС–РєР°" : "PnL dynamics",
              isRu ? "Р›СѓС‡С€РёРµ СЃРµС‚Р°РїС‹" : isUa ? "РќР°Р№РєСЂР°С‰С– СЃРµС‚Р°РїРё" : "Best setups",
              isRu ? "Р“Р»Р°РІРЅС‹Рµ РѕС€РёР±РєРё" : isUa ? "Р“РѕР»РѕРІРЅС– РїРѕРјРёР»РєРё" : "Main mistakes",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
              >
                <div className="text-sm font-black text-white">{item}</div>
                <div className="mt-2 text-xs font-semibold leading-5 text-white/45">
                  {isRu
                    ? "РџРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ Р·Р°РїРѕР»РЅРµРЅРёСЏ Р¶СѓСЂРЅР°Р»Р°."
                    : isUa
                      ? "Р—КјСЏРІРёС‚СЊСЃСЏ РїС–СЃР»СЏ Р·Р°РїРѕРІРЅРµРЅРЅСЏ Р¶СѓСЂРЅР°Р»Сѓ."
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
          Г—
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
        {formatChartSymbol(symbol)} В· {interval}
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
      {formatChartSymbol(symbol)} В· {interval}
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
        {formatChartSymbol(symbol)} В· {interval}
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
    Г—
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
    return "вЂ”";
  }

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatPercent(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return "вЂ”";
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
        "Р С‹РЅРѕРє вЂ” СЌС‚Рѕ РјРµСЃС‚Рѕ, РіРґРµ РїРѕРєСѓРїР°С‚РµР»Рё Рё РїСЂРѕРґР°РІС†С‹ РїРѕСЃС‚РѕСЏРЅРЅРѕ РґРѕРіРѕРІР°СЂРёРІР°СЋС‚СЃСЏ Рѕ С†РµРЅРµ. Р¦РµРЅР° РґРІРёРіР°РµС‚СЃСЏ РЅРµ РїРѕС‚РѕРјСѓ, С‡С‚Рѕ РіСЂР°С„РёРє вЂњС…РѕС‡РµС‚вЂќ РёРґС‚Рё РІРІРµСЂС… РёР»Рё РІРЅРёР·, Р° РїРѕС‚РѕРјСѓ С‡С‚Рѕ РІ РєРѕРЅРєСЂРµС‚РЅС‹Р№ РјРѕРјРµРЅС‚ РѕРґРЅР° СЃС‚РѕСЂРѕРЅР° СЃС‚Р°РЅРѕРІРёС‚СЃСЏ Р°РіСЂРµСЃСЃРёРІРЅРµРµ РґСЂСѓРіРѕР№.",
      blocks: [
        {
          title: "Р§С‚Рѕ СЂРµР°Р»СЊРЅРѕ РґРІРёРіР°РµС‚ С†РµРЅСѓ",
          text:
            "Р¦РµРЅР° РґРІРёРіР°РµС‚СЃСЏ С‚РѕРіРґР°, РєРѕРіРґР° Р°РіСЂРµСЃСЃРёРІРЅС‹Рµ РїРѕРєСѓРїР°С‚РµР»Рё РЅР°С‡РёРЅР°СЋС‚ Р·Р°Р±РёСЂР°С‚СЊ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ Сѓ РїСЂРѕРґР°РІС†РѕРІ, Р»РёР±Рѕ Р°РіСЂРµСЃСЃРёРІРЅС‹Рµ РїСЂРѕРґР°РІС†С‹ РЅР°С‡РёРЅР°СЋС‚ РїСЂРѕРґР°РІР°С‚СЊ РІ РїРѕРєСѓРїР°С‚РµР»РµР№. Р•СЃР»Рё РїРѕРєСѓРїР°С‚РµР»Рё РіРѕС‚РѕРІС‹ РїР»Р°С‚РёС‚СЊ РІСЃС‘ РІС‹С€Рµ вЂ” С†РµРЅР° СЂР°СЃС‚С‘С‚. Р•СЃР»Рё РїСЂРѕРґР°РІС†С‹ РіРѕС‚РѕРІС‹ РїСЂРѕРґР°РІР°С‚СЊ РІСЃС‘ РЅРёР¶Рµ вЂ” С†РµРЅР° РїР°РґР°РµС‚.",
        },
        {
          title: "РљС‚Рѕ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ СЂС‹РЅРєРµ",
          text:
            "Р’ СЂС‹РЅРєРµ РµСЃС‚СЊ СЂР°Р·РЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё: РґРѕР»РіРѕСЃСЂРѕС‡РЅС‹Рµ РёРЅРІРµСЃС‚РѕСЂС‹, С„РѕРЅРґС‹, РјР°СЂРєРµС‚-РјРµР№РєРµСЂС‹, Р°Р»РіРѕСЂРёС‚РјС‹, СЃРєР°Р»СЊРїРµСЂС‹, РґРµР№С‚СЂРµР№РґРµСЂС‹ Рё РЅРѕРІРѕСЃС‚РЅС‹Рµ С‚СЂРµР№РґРµСЂС‹. РљР°Р¶РґС‹Р№ РёР· РЅРёС… СЃРѕР·РґР°С‘С‚ СЃРїСЂРѕСЃ, РїСЂРµРґР»РѕР¶РµРЅРёРµ, Р»РёРєРІРёРґРЅРѕСЃС‚СЊ Рё РІРѕР»Р°С‚РёР»СЊРЅРѕСЃС‚СЊ.",
        },
        {
          title: "РџРѕС‡РµРјСѓ С†РµРЅР° РЅРµ РґРІРёР¶РµС‚СЃСЏ РёРґРµР°Р»СЊРЅРѕ",
          text:
            "Р¦РµРЅР° РїРѕС‡С‚Рё РЅРёРєРѕРіРґР° РЅРµ РёРґС‘С‚ СЂРѕРІРЅРѕР№ Р»РёРЅРёРµР№. РћРЅР° РґРІРёРіР°РµС‚СЃСЏ РёРјРїСѓР»СЊСЃР°РјРё, РѕС‚РєР°С‚Р°РјРё, РѕСЃС‚Р°РЅРѕРІРєР°РјРё Рё Р»РѕР¶РЅС‹РјРё РїСЂРѕР±РѕСЏРјРё, РїРѕС‚РѕРјСѓ С‡С‚Рѕ СѓС‡Р°СЃС‚РЅРёРєРё СЂС‹РЅРєР° РїРѕСЃС‚РѕСЏРЅРЅРѕ С„РёРєСЃРёСЂСѓСЋС‚ РїСЂРёР±С‹Р»СЊ, РІС…РѕРґСЏС‚ Р·Р°РЅРѕРІРѕ, Р·Р°С‰РёС‰Р°СЋС‚ РїРѕР·РёС†РёРё Рё РІС‹Р±РёРІР°СЋС‚ СЃС‚РѕРїС‹.",
        },
        {
          title: "Р§С‚Рѕ РІР°Р¶РЅРѕ РґР»СЏ С‚СЂРµР№РґРµСЂР°",
          text:
            "РўСЂРµР№РґРµСЂСѓ РЅРµ РЅСѓР¶РЅРѕ СѓРіР°РґС‹РІР°С‚СЊ Р±СѓРґСѓС‰РµРµ. Р•РіРѕ Р·Р°РґР°С‡Р° вЂ” РїРѕРЅСЏС‚СЊ С‚РµРєСѓС‰РёР№ Р±Р°Р»Р°РЅСЃ СЃРёР»С‹: РєС‚Рѕ РєРѕРЅС‚СЂРѕР»РёСЂСѓРµС‚ РґРІРёР¶РµРЅРёРµ СЃРµР№С‡Р°СЃ, РіРґРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ, РіРґРµ СѓС‡Р°СЃС‚РЅРёРєРё Р±СѓРґСѓС‚ РїСЂРёРЅРёРјР°С‚СЊ СЂРµС€РµРЅРёСЏ Рё РіРґРµ СЂРёСЃРє СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РїРѕРЅСЏС‚РЅС‹Рј.",
        },
      ],
      checklist: [
        "РћРїСЂРµРґРµР»Рё, РєС‚Рѕ СЃРµР№С‡Р°СЃ Р°РіСЂРµСЃСЃРёРІРЅРµРµ: РїРѕРєСѓРїР°С‚РµР»Рё РёР»Рё РїСЂРѕРґР°РІС†С‹.",
        "РџРѕСЃРјРѕС‚СЂРё, РµСЃС‚СЊ Р»Рё РёРјРїСѓР»СЊСЃ РёР»Рё СЂС‹РЅРѕРє СЃС‚РѕРёС‚ РІ РґРёР°РїР°Р·РѕРЅРµ.",
        "РќР°Р№РґРё Р·РѕРЅС‹, РіРґРµ СЂР°РЅСЊС€Рµ Р±С‹Р»Р° СЃРёР»СЊРЅР°СЏ СЂРµР°РєС†РёСЏ С†РµРЅС‹.",
        "РќРµ РѕС‚РєСЂС‹РІР°Р№ СЃРґРµР»РєСѓ Р±РµР· РїРѕРЅСЏС‚РЅРѕРіРѕ РјРµСЃС‚Р° РґР»СЏ СЃС‚РѕРїР°.",
      ],
      practice:
        "РћС‚РєСЂРѕР№ Р»СЋР±РѕР№ Р°РєС‚РёРІ РЅР° РіСЂР°С„РёРєРµ 5m РёР»Рё 15m. РћС‚РјРµС‚СЊ РѕРґРёРЅ СЃРёР»СЊРЅС‹Р№ РёРјРїСѓР»СЊСЃ, РѕРґРёРЅ РѕС‚РєР°С‚ Рё РѕРґРЅСѓ Р·РѕРЅСѓ, РіРґРµ С†РµРЅР° РѕСЃС‚Р°РЅРѕРІРёР»Р°СЃСЊ РёР»Рё СЂРµР·РєРѕ РёР·РјРµРЅРёР»Р° РЅР°РїСЂР°РІР»РµРЅРёРµ. РќР°РїРёС€Рё СЂСЏРґРѕРј: РєС‚Рѕ С‚Р°Рј Р±С‹Р» СЃРёР»СЊРЅРµРµ вЂ” РїРѕРєСѓРїР°С‚РµР»Рё РёР»Рё РїСЂРѕРґР°РІС†С‹.",
    },

    "market-basics-2": {
      intro:
        "РћСЂРґРµСЂ вЂ” СЌС‚Рѕ РёРЅСЃС‚СЂСѓРєС†РёСЏ Р±СЂРѕРєРµСЂСѓ РєСѓРїРёС‚СЊ РёР»Рё РїСЂРѕРґР°С‚СЊ Р°РєС‚РёРІ. РџРѕРЅРёРјР°РЅРёРµ С‚РёРїРѕРІ РѕСЂРґРµСЂРѕРІ РІР°Р¶РЅРѕ, РїРѕС‚РѕРјСѓ С‡С‚Рѕ РѕС‚ РЅРёС… Р·Р°РІРёСЃРёС‚ С†РµРЅР° РІС…РѕРґР°, СЃРєРѕСЂРѕСЃС‚СЊ РёСЃРїРѕР»РЅРµРЅРёСЏ, СЂРёСЃРє РїСЂРѕСЃРєР°Р»СЊР·С‹РІР°РЅРёСЏ Рё РєРѕРЅС‚СЂРѕР»СЊ РЅР°Рґ СЃРґРµР»РєРѕР№.",
      blocks: [
        {
          title: "Market order",
          text:
            "Market order РёСЃРїРѕР»РЅСЏРµС‚СЃСЏ РїРѕ Р»СѓС‡С€РµР№ РґРѕСЃС‚СѓРїРЅРѕР№ С†РµРЅРµ РїСЂСЏРјРѕ СЃРµР№С‡Р°СЃ. Р•РіРѕ РїР»СЋСЃ вЂ” СЃРєРѕСЂРѕСЃС‚СЊ. РњРёРЅСѓСЃ вЂ” С‚С‹ РЅРµ РєРѕРЅС‚СЂРѕР»РёСЂСѓРµС€СЊ С‚РѕС‡РЅСѓСЋ С†РµРЅСѓ РёСЃРїРѕР»РЅРµРЅРёСЏ, РѕСЃРѕР±РµРЅРЅРѕ РІ Р±С‹СЃС‚СЂС‹С… Р°РєС†РёСЏС…, РЅР° РїСЂРµРјР°СЂРєРµС‚Рµ, РІ РєСЂРёРїС‚Рµ РёР»Рё РЅР° С‚РѕРЅРєРѕРј СЃС‚Р°РєР°РЅРµ.",
        },
        {
          title: "Limit order",
          text:
            "Limit order РїРѕР·РІРѕР»СЏРµС‚ СѓРєР°Р·Р°С‚СЊ С†РµРЅСѓ, РїРѕ РєРѕС‚РѕСЂРѕР№ С‚С‹ РіРѕС‚РѕРІ РєСѓРїРёС‚СЊ РёР»Рё РїСЂРѕРґР°С‚СЊ. Р•РіРѕ РїР»СЋСЃ вЂ” РєРѕРЅС‚СЂРѕР»СЊ С†РµРЅС‹. РњРёРЅСѓСЃ вЂ” РѕСЂРґРµСЂ РјРѕР¶РµС‚ РЅРµ РёСЃРїРѕР»РЅРёС‚СЊСЃСЏ, РµСЃР»Рё СЂС‹РЅРѕРє РЅРµ РґР°СЃС‚ С‚РІРѕСЋ С†РµРЅСѓ РёР»Рё Р±С‹СЃС‚СЂРѕ СѓР№РґС‘С‚ Р±РµР· С‚РµР±СЏ.",
        },
        {
          title: "Stop order",
          text:
            "Stop order Р°РєС‚РёРІРёСЂСѓРµС‚СЃСЏ, РєРѕРіРґР° С†РµРЅР° РґРѕС…РѕРґРёС‚ РґРѕ Р·Р°РґР°РЅРЅРѕРіРѕ СѓСЂРѕРІРЅСЏ. Р§Р°С‰Рµ РІСЃРµРіРѕ РѕРЅ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ СЂРёСЃРєР°. РќР°РїСЂРёРјРµСЂ, РµСЃР»Рё СЃС†РµРЅР°СЂРёР№ СЃР»РѕРјР°Р»СЃСЏ, stop order РїРѕРјРѕРіР°РµС‚ РІС‹Р№С‚Рё РёР· РїРѕР·РёС†РёРё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.",
        },
        {
          title: "РџРѕС‡РµРјСѓ С‚РёРї РѕСЂРґРµСЂР° РІР»РёСЏРµС‚ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚",
          text:
            "РћРґРёРЅ Рё С‚РѕС‚ Р¶Рµ СЃРµС‚Р°Рї РјРѕР¶РµС‚ РґР°С‚СЊ СЂР°Р·РЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ РѕСЂРґРµСЂР°. Market order РјРѕР¶РµС‚ РґР°С‚СЊ РїР»РѕС…РѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ, limit order РјРѕР¶РµС‚ РЅРµ Р·Р°Р№С‚Рё РІ СЃРґРµР»РєСѓ, Р° РЅРµРїСЂР°РІРёР»СЊРЅС‹Р№ stop РјРѕР¶РµС‚ РІС‹Р±РёС‚СЊ РёР· РїРѕР·РёС†РёРё РїРµСЂРµРґ РґРІРёР¶РµРЅРёРµРј.",
        },
      ],
      checklist: [
        "Market order вЂ” РєРѕРіРґР° РІР°Р¶РЅРµРµ СЃРєРѕСЂРѕСЃС‚СЊ, С‡РµРј С‚РѕС‡РЅР°СЏ С†РµРЅР°.",
        "Limit order вЂ” РєРѕРіРґР° РІР°Р¶РЅРµРµ С†РµРЅР° Рё РєРѕРЅС‚СЂРѕР»СЊ РёСЃРїРѕР»РЅРµРЅРёСЏ.",
        "Stop order вЂ” РєРѕРіРґР° РЅСѓР¶РЅРѕ Р·Р°СЂР°РЅРµРµ РѕРіСЂР°РЅРёС‡РёС‚СЊ СЂРёСЃРє.",
        "РќР° С‚РѕРЅРєРѕРј СЂС‹РЅРєРµ market order РјРѕР¶РµС‚ РґР°С‚СЊ СЃРёР»СЊРЅРѕРµ РїСЂРѕСЃРєР°Р»СЊР·С‹РІР°РЅРёРµ.",
      ],
      practice:
        "РћС‚РєСЂРѕР№ СЃС‚Р°РєР°РЅ РёР»Рё РіСЂР°С„РёРє Р°РєС‚РёРІРЅРѕР№ Р°РєС†РёРё. РџСЂРµРґСЃС‚Р°РІСЊ 3 СЃРёС‚СѓР°С†РёРё: Р±С‹СЃС‚СЂС‹Р№ РїСЂРѕР±РѕР№, СЃРїРѕРєРѕР№РЅС‹Р№ РѕС‚РєР°С‚ Рє СѓСЂРѕРІРЅСЋ Рё РІС‹С…РѕРґ РїРѕ СЃС‚РѕРїСѓ. Р”Р»СЏ РєР°Р¶РґРѕР№ СЃРёС‚СѓР°С†РёРё РІС‹Р±РµСЂРё, РєР°РєРѕР№ РѕСЂРґРµСЂ Р±С‹Р» Р±С‹ Р»РѕРіРёС‡РЅРµРµ: market, limit РёР»Рё stop.",
    },

    "market-basics-3": {
      intro:
        "Bid, Ask Рё Spread вЂ” СЌС‚Рѕ Р±Р°Р·РѕРІР°СЏ РјРµС…Р°РЅРёРєР° С†РµРЅС‹. Р•СЃР»Рё С‚СЂРµР№РґРµСЂ РЅРµ РїРѕРЅРёРјР°РµС‚, РіРґРµ РїРѕРєСѓРїР°СЋС‚, РіРґРµ РїСЂРѕРґР°СЋС‚ Рё СЃРєРѕР»СЊРєРѕ СЃС‚РѕРёС‚ РЅРµРјРµРґР»РµРЅРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ, РѕРЅ Р±СѓРґРµС‚ С‡Р°СЃС‚Рѕ РїРѕР»СѓС‡Р°С‚СЊ РїР»РѕС…РёРµ РІС…РѕРґС‹ Рё РЅРµРѕР¶РёРґР°РЅРЅС‹Рµ СѓР±С‹С‚РєРё.",
      blocks: [
        {
          title: "Bid",
          text:
            "Bid вЂ” СЌС‚Рѕ Р»СѓС‡С€Р°СЏ С†РµРЅР°, РїРѕ РєРѕС‚РѕСЂРѕР№ СЃРµР№С‡Р°СЃ РіРѕС‚РѕРІС‹ РєСѓРїРёС‚СЊ Р°РєС‚РёРІ. Р•СЃР»Рё С‚С‹ РїСЂРѕРґР°С‘С€СЊ market order, С‡Р°С‰Рµ РІСЃРµРіРѕ С‚С‹ РїСЂРѕРґР°С‘С€СЊ РёРјРµРЅРЅРѕ РІ bid. РЎРёР»СЊРЅС‹Р№ bid РјРѕР¶РµС‚ РІСЂРµРјРµРЅРЅРѕ СѓРґРµСЂР¶РёРІР°С‚СЊ С†РµРЅСѓ.",
        },
        {
          title: "Ask",
          text:
            "Ask вЂ” СЌС‚Рѕ Р»СѓС‡С€Р°СЏ С†РµРЅР°, РїРѕ РєРѕС‚РѕСЂРѕР№ СЃРµР№С‡Р°СЃ РіРѕС‚РѕРІС‹ РїСЂРѕРґР°С‚СЊ Р°РєС‚РёРІ. Р•СЃР»Рё С‚С‹ РїРѕРєСѓРїР°РµС€СЊ market order, С‡Р°С‰Рµ РІСЃРµРіРѕ С‚С‹ РїРѕРєСѓРїР°РµС€СЊ РёРјРµРЅРЅРѕ РІ ask. РљРѕРіРґР° РїРѕРєСѓРїР°С‚РµР»Рё Р°РєС‚РёРІРЅРѕ Р·Р°Р±РёСЂР°СЋС‚ ask, С†РµРЅР° РЅР°С‡РёРЅР°РµС‚ РїРѕРґРЅРёРјР°С‚СЊСЃСЏ.",
        },
        {
          title: "Spread",
          text:
            "Spread вЂ” СЌС‚Рѕ СЂР°Р·РЅРёС†Р° РјРµР¶РґСѓ bid Рё ask. Р§РµРј С€РёСЂРµ spread, С‚РµРј РґРѕСЂРѕР¶Рµ С‚РµР±Рµ РІС…РѕРґРёС‚СЊ Рё РІС‹С…РѕРґРёС‚СЊ. Р’ Р°РєС‚РёРІРЅС‹С… Р»РёРєРІРёРґРЅС‹С… РёРЅСЃС‚СЂСѓРјРµРЅС‚Р°С… spread РѕР±С‹С‡РЅРѕ СѓР·РєРёР№. Р’ С‚РѕРЅРєРёС… Р°РєС†РёСЏС…, РЅР° РїСЂРµРјР°СЂРєРµС‚Рµ РёР»Рё РїРѕСЃР»Рµ РЅРѕРІРѕСЃС‚РµР№ spread РјРѕР¶РµС‚ Р±С‹С‚СЊ РѕРїР°СЃРЅРѕ С€РёСЂРѕРєРёРј.",
        },
        {
          title: "РџРѕС‡РµРјСѓ СЌС‚Рѕ РІР°Р¶РЅРѕ РґР»СЏ РёРЅС‚СЂР°РґРµР№-С‚СЂРµР№РґРµСЂР°",
          text:
            "Р’ РёРЅС‚СЂР°РґРµР№-С‚РѕСЂРіРѕРІР»Рµ С‚РѕС‡РєР° РІС…РѕРґР° РёРјРµРµС‚ РѕРіСЂРѕРјРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ. Р•СЃР»Рё С‚С‹ РІС…РѕРґРёС€СЊ С‡РµСЂРµР· С€РёСЂРѕРєРёР№ spread, СЃРґРµР»РєР° РјРѕР¶РµС‚ СЃСЂР°Р·Сѓ РЅР°С‡РёРЅР°С‚СЊСЃСЏ СЃ РјРёРЅСѓСЃР°. Р§РµРј РјРµРЅСЊС€Рµ С‚Р°Р№РјС„СЂРµР№Рј Рё РєРѕСЂРѕС‡Рµ СЃС‚РѕРї, С‚РµРј РІР°Р¶РЅРµРµ СЃР»РµРґРёС‚СЊ Р·Р° spread.",
        },
      ],
      checklist: [
        "РџРµСЂРµРґ РІС…РѕРґРѕРј РїСЂРѕРІРµСЂСЊ spread.",
        "РќРµ РёСЃРїРѕР»СЊР·СѓР№ market order РІ РёРЅСЃС‚СЂСѓРјРµРЅС‚Рµ СЃ С€РёСЂРѕРєРёРј spread Р±РµР· РїСЂРёС‡РёРЅС‹.",
        "РЎРјРѕС‚СЂРё, РєР°Рє С†РµРЅР° СЂРµР°РіРёСЂСѓРµС‚ РЅР° bid Рё ask РІРѕР·Р»Рµ СѓСЂРѕРІРЅСЏ.",
        "РџРѕРјРЅРё: РїР»РѕС…РѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ РјРѕР¶РµС‚ СЃР»РѕРјР°С‚СЊ РґР°Р¶Рµ С…РѕСЂРѕС€РёР№ СЃРµС‚Р°Рї.",
      ],
      practice:
        "Р’С‹Р±РµСЂРё 3 С‚РёРєРµСЂР°: РѕРґРёРЅ РѕС‡РµРЅСЊ Р»РёРєРІРёРґРЅС‹Р№, РѕРґРёРЅ СЃСЂРµРґРЅРёР№ Рё РѕРґРёРЅ С‚РѕРЅРєРёР№. РЎСЂР°РІРЅРё spread. РџРѕСЃРјРѕС‚СЂРё, РіРґРµ РјРѕР¶РЅРѕ СЃРїРѕРєРѕР№РЅРѕ РІС…РѕРґРёС‚СЊ, Р° РіРґРµ РёСЃРїРѕР»РЅРµРЅРёРµ СѓР¶Рµ СЃР°РјРѕ РїРѕ СЃРµР±Рµ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЂРёСЃРєРѕРј.",
    },

    "market-basics-4": {
      intro:
        "Р›РёРєРІРёРґРЅРѕСЃС‚СЊ вЂ” СЌС‚Рѕ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ РєСѓРїРёС‚СЊ РёР»Рё РїСЂРѕРґР°С‚СЊ Р°РєС‚РёРІ Р±РµР· СЃРёР»СЊРЅРѕРіРѕ СЃРґРІРёРіР° С†РµРЅС‹. Р”Р»СЏ С‚СЂРµР№РґРµСЂР° Р»РёРєРІРёРґРЅРѕСЃС‚СЊ РІР°Р¶РЅР° РЅРµ С‚РѕР»СЊРєРѕ РєР°Рє РѕР±СЉС‘Рј, РЅРѕ Рё РєР°Рє Р·РѕРЅС‹, РіРґРµ СЃС‚РѕСЏС‚ РѕСЂРґРµСЂР°, СЃС‚РѕРїС‹ Рё РёРЅС‚РµСЂРµСЃ СѓС‡Р°СЃС‚РЅРёРєРѕРІ.",
      blocks: [
        {
          title: "Р§С‚Рѕ С‚Р°РєРѕРµ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ РїСЂРѕСЃС‚С‹РјРё СЃР»РѕРІР°РјРё",
          text:
            "Р›РёРєРІРёРґРЅРѕСЃС‚СЊ РїРѕРєР°Р·С‹РІР°РµС‚, РЅР°СЃРєРѕР»СЊРєРѕ Р»РµРіРєРѕ РјРѕР¶РЅРѕ РІРѕР№С‚Рё РёР»Рё РІС‹Р№С‚Рё РёР· РїРѕР·РёС†РёРё. Р•СЃР»Рё Р»РёРєРІРёРґРЅРѕСЃС‚Рё РјРЅРѕРіРѕ, РєСЂСѓРїРЅС‹Рµ СЃРґРµР»РєРё РїСЂРѕС…РѕРґСЏС‚ СЃРїРѕРєРѕР№РЅРµРµ. Р•СЃР»Рё Р»РёРєРІРёРґРЅРѕСЃС‚Рё РјР°Р»Рѕ, РґР°Р¶Рµ РЅРµР±РѕР»СЊС€РѕР№ РѕСЂРґРµСЂ РјРѕР¶РµС‚ СЂРµР·РєРѕ РґРІРёРЅСѓС‚СЊ С†РµРЅСѓ.",
        },
        {
          title: "Р“РґРµ РѕР±С‹С‡РЅРѕ РЅР°С…РѕРґРёС‚СЃСЏ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ",
          text:
            "Р›РёРєРІРёРґРЅРѕСЃС‚СЊ С‡Р°СЃС‚Рѕ СЃРѕР±РёСЂР°РµС‚СЃСЏ РІРѕР·Р»Рµ РѕС‡РµРІРёРґРЅС‹С… СѓСЂРѕРІРЅРµР№: high/low РґРЅСЏ, premarket high/low, round numbers, VWAP, Р·РѕРЅ РєРѕРЅСЃРѕР»РёРґР°С†РёРё, Р»РѕРєР°Р»СЊРЅС‹С… РјР°РєСЃРёРјСѓРјРѕРІ Рё РјРёРЅРёРјСѓРјРѕРІ. РўР°Рј РјРЅРѕРіРёРµ СЃС‚Р°РІСЏС‚ СЃС‚РѕРїС‹, Р»РёРјРёС‚РЅС‹Рµ РѕСЂРґРµСЂР° Рё Р¶РґСѓС‚ СЂРµР°РєС†РёСЋ.",
        },
        {
          title: "РџРѕС‡РµРјСѓ С†РµРЅР° С‚СЏРЅРµС‚СЃСЏ Рє Р»РёРєРІРёРґРЅРѕСЃС‚Рё",
          text:
            "Р С‹РЅРєСѓ РЅСѓР¶РЅС‹ РІСЃС‚СЂРµС‡РЅС‹Рµ РѕСЂРґРµСЂР° РґР»СЏ РёСЃРїРѕР»РЅРµРЅРёСЏ РєСЂСѓРїРЅС‹С… РїРѕР·РёС†РёР№. РџРѕСЌС‚РѕРјСѓ С†РµРЅР° С‡Р°СЃС‚Рѕ РёРґС‘С‚ С‚СѓРґР°, РіРґРµ РјРЅРѕРіРѕ СЃС‚РѕРїРѕРІ РёР»Рё Р»РёРјРёС‚РЅС‹С… Р·Р°СЏРІРѕРє. Р”Р»СЏ С‚СЂРµР№РґРµСЂР° СЌС‚Рѕ РѕР±СЉСЏСЃРЅСЏРµС‚ РїСЂРѕР±РѕРё, РІС‹РЅРѕСЃС‹, СЂРµР·РєРёРµ СѓСЃРєРѕСЂРµРЅРёСЏ Рё Р»РѕР¶РЅС‹Рµ РґРІРёР¶РµРЅРёСЏ.",
        },
        {
          title: "РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ РІ С‚РѕСЂРіРѕРІР»Рµ",
          text:
            "РќРµ РЅСѓР¶РЅРѕ РїСЂРѕСЃС‚Рѕ РїРѕРєСѓРїР°С‚СЊ РєР°Р¶РґС‹Р№ РїСЂРѕР±РѕР№ РёР»Рё С€РѕСЂС‚РёС‚СЊ РєР°Р¶РґС‹Р№ РІС‹РЅРѕСЃ. Р’Р°Р¶РЅРѕ СЃРјРѕС‚СЂРµС‚СЊ СЂРµР°РєС†РёСЋ: РїСЂРѕР±РѕР№ СѓРґРµСЂР¶РёРІР°РµС‚СЃСЏ РёР»Рё Р±С‹СЃС‚СЂРѕ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ, РѕР±СЉС‘Рј РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РґРІРёР¶РµРЅРёРµ РёР»Рё РґРІРёР¶РµРЅРёРµ Р±С‹Р»Рѕ С‚РѕР»СЊРєРѕ СЃР±РѕСЂРѕРј СЃС‚РѕРїРѕРІ.",
        },
      ],
      checklist: [
        "РћС‚РјРµС‡Р°Р№ Р·РѕРЅС‹ РѕС‡РµРІРёРґРЅРѕР№ Р»РёРєРІРёРґРЅРѕСЃС‚Рё РґРѕ РІС…РѕРґР°.",
        "РЎРјРѕС‚СЂРё СЂРµР°РєС†РёСЋ С†РµРЅС‹ РїРѕСЃР»Рµ СЃРЅСЏС‚РёСЏ СѓСЂРѕРІРЅСЏ.",
        "РќРµ РїСѓС‚Р°Р№ РЅР°СЃС‚РѕСЏС‰РёР№ РїСЂРѕР±РѕР№ Рё СЃР±РѕСЂ СЃС‚РѕРїРѕРІ.",
        "Р’С…РѕРґРё С‚РѕР»СЊРєРѕ С‚Р°Рј, РіРґРµ РїРѕРЅСЏС‚РµРЅ СЂРёСЃРє Рё СЃС†РµРЅР°СЂРёР№.",
      ],
      practice:
        "РћС‚РєСЂРѕР№ РіСЂР°С„РёРє Р°РєС†РёРё СЃ РіСЌРїРѕРј РёР»Рё СЃРёР»СЊРЅС‹Рј РґРІРёР¶РµРЅРёРµРј. РћС‚РјРµС‚СЊ premarket high, premarket low, high/low РґРЅСЏ Рё РєСЂСѓРіР»С‹Рµ СѓСЂРѕРІРЅРё. РџРѕСЃРјРѕС‚СЂРё, РіРґРµ С†РµРЅР° СѓСЃРєРѕСЂСЏР»Р°СЃСЊ Рё РіРґРµ РїРѕСЃР»Рµ РІС‹РЅРѕСЃР° Р±С‹СЃС‚СЂРѕ РІРѕР·РІСЂР°С‰Р°Р»Р°СЃСЊ РѕР±СЂР°С‚РЅРѕ.",
    },
    "technical-analysis-1": {
  intro:
    "РЎРІРµС‡Р° РїРѕРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ РїСЂРѕРёСЃС…РѕРґРёР»Рѕ СЃ С†РµРЅРѕР№ Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РїРµСЂРёРѕРґ РІСЂРµРјРµРЅРё. Р”Р»СЏ С‚СЂРµР№РґРµСЂР° РІР°Р¶РЅР° РЅРµ С‚РѕР»СЊРєРѕ С„РѕСЂРјР° СЃРІРµС‡Рё, РЅРѕ Рё РєРѕРЅС‚РµРєСЃС‚: РіРґРµ РѕРЅР° РїРѕСЏРІРёР»Р°СЃСЊ, РєР°РєРѕР№ Р±С‹Р» РѕР±СЉС‘Рј, С‡С‚Рѕ Р±С‹Р»Рѕ РґРѕ РЅРµС‘ Рё РєР°Рє С†РµРЅР° РїРѕРІРµР»Р° СЃРµР±СЏ РїРѕСЃР»Рµ.",
  blocks: [
    {
      title: "РР· С‡РµРіРѕ СЃРѕСЃС‚РѕРёС‚ СЃРІРµС‡Р°",
      text:
        "РЎРІРµС‡Р° РїРѕРєР°Р·С‹РІР°РµС‚ С†РµРЅСѓ РѕС‚РєСЂС‹С‚РёСЏ, РјР°РєСЃРёРјСѓРј, РјРёРЅРёРјСѓРј Рё С†РµРЅСѓ Р·Р°РєСЂС‹С‚РёСЏ. РўРµР»Рѕ СЃРІРµС‡Рё РїРѕРєР°Р·С‹РІР°РµС‚ РѕСЃРЅРѕРІРЅРѕРµ РґРІРёР¶РµРЅРёРµ Р·Р° РїРµСЂРёРѕРґ, Р° С‚РµРЅРё РїРѕРєР°Р·С‹РІР°СЋС‚ РїРѕРїС‹С‚РєРё С†РµРЅС‹ СѓР№С‚Рё РІС‹С€Рµ РёР»Рё РЅРёР¶Рµ, РєРѕС‚РѕСЂС‹Рµ РЅРµ Р±С‹Р»Рё РїРѕР»РЅРѕСЃС‚СЊСЋ СѓРґРµСЂР¶Р°РЅС‹.",
    },
    {
      title: "РЎРёР»СЊРЅР°СЏ СЃРІРµС‡Р°",
      text:
        "РЎРёР»СЊРЅР°СЏ СЃРІРµС‡Р° РѕР±С‹С‡РЅРѕ РёРјРµРµС‚ Р±РѕР»СЊС€РѕРµ С‚РµР»Рѕ, Р·Р°РєСЂС‹РІР°РµС‚СЃСЏ Р±Р»РёР·РєРѕ Рє РјР°РєСЃРёРјСѓРјСѓ РїСЂРё СЂРѕСЃС‚Рµ РёР»Рё Р±Р»РёР·РєРѕ Рє РјРёРЅРёРјСѓРјСѓ РїСЂРё РїР°РґРµРЅРёРё. РћРЅР° РїРѕРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ РѕРґРЅР° СЃС‚РѕСЂРѕРЅР° РєРѕРЅС‚СЂРѕР»РёСЂРѕРІР°Р»Р° РґРІРёР¶РµРЅРёРµ Р±РѕР»СЊС€СѓСЋ С‡Р°СЃС‚СЊ РїРµСЂРёРѕРґР°.",
    },
    {
      title: "РЎРІРµС‡Р° СЃ РґР»РёРЅРЅРѕР№ С‚РµРЅСЊСЋ",
      text:
        "Р”Р»РёРЅРЅР°СЏ С‚РµРЅСЊ РїРѕРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ С†РµРЅР° РїС‹С‚Р°Р»Р°СЃСЊ СѓР№С‚Рё РІ РѕРґРЅСѓ СЃС‚РѕСЂРѕРЅСѓ, РЅРѕ РµС‘ РІРµСЂРЅСѓР»Рё РѕР±СЂР°С‚РЅРѕ. Р­С‚Рѕ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРёР·РЅР°РєРѕРј РѕС‚РєР°Р·Р° РѕС‚ СѓСЂРѕРІРЅСЏ, СЃРЅСЏС‚РёСЏ Р»РёРєРІРёРґРЅРѕСЃС‚Рё РёР»Рё С„РёРєСЃР°С†РёРё СѓС‡Р°СЃС‚РЅРёРєРѕРІ.",
    },
    {
      title: "РџРѕС‡РµРјСѓ РЅРµР»СЊР·СЏ С‚РѕСЂРіРѕРІР°С‚СЊ СЃРІРµС‡Сѓ Р±РµР· РєРѕРЅС‚РµРєСЃС‚Р°",
      text:
        "РћРґРЅР° Рё С‚Р° Р¶Рµ СЃРІРµС‡Р° РјРѕР¶РµС‚ РѕР·РЅР°С‡Р°С‚СЊ СЂР°Р·РЅС‹Рµ РІРµС‰Рё. Р”Р»РёРЅРЅР°СЏ РІРµСЂС…РЅСЏСЏ С‚РµРЅСЊ РІРѕР·Р»Рµ СЃРёР»СЊРЅРѕРіРѕ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃР»Р°Р±РѕСЃС‚СЊСЋ, РЅРѕ РІРЅСѓС‚СЂРё СЃРёР»СЊРЅРѕРіРѕ С‚СЂРµРЅРґР° РѕРЅР° РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРѕСЃС‚Рѕ С„РёРєСЃР°С†РёРµР№ РїРµСЂРµРґ РїСЂРѕРґРѕР»Р¶РµРЅРёРµРј.",
    },
  ],
  checklist: [
    "РЎРјРѕС‚СЂРё, РіРґРµ РїРѕСЏРІРёР»Р°СЃСЊ СЃРІРµС‡Р°: РЅР° СѓСЂРѕРІРЅРµ, РІ С‚СЂРµРЅРґРµ РёР»Рё РІ СЃРµСЂРµРґРёРЅРµ С€СѓРјР°.",
    "РћС†РµРЅРё Р·Р°РєСЂС‹С‚РёРµ СЃРІРµС‡Рё: СЃРёР»СЊРЅРѕРµ РѕРЅРѕ РёР»Рё СЃР»Р°Р±РѕРµ.",
    "РЎСЂР°РІРЅРё СЃРІРµС‡Сѓ СЃ РїСЂРµРґС‹РґСѓС‰РёРјРё СЃРІРµС‡Р°РјРё.",
    "РќРµ РїСЂРёРЅРёРјР°Р№ СЂРµС€РµРЅРёРµ С‚РѕР»СЊРєРѕ РїРѕ С„РѕСЂРјРµ СЃРІРµС‡Рё.",
  ],
},

"technical-analysis-2": {
  intro:
    "РџРѕРґРґРµСЂР¶РєР° Рё СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ вЂ” СЌС‚Рѕ Р·РѕРЅС‹, РіРґРµ С†РµРЅР° СЂР°РЅСЊС€Рµ СЃРёР»СЊРЅРѕ СЂРµР°РіРёСЂРѕРІР°Р»Р° РёР»Рё РіРґРµ СѓС‡Р°СЃС‚РЅРёРєРё СЂС‹РЅРєР° РјРѕРіСѓС‚ СЃРЅРѕРІР° РїСЂРёРЅСЏС‚СЊ СЂРµС€РµРЅРёРµ. Р’Р°Р¶РЅРѕ РїРѕРЅРёРјР°С‚СЊ: СѓСЂРѕРІРµРЅСЊ вЂ” СЌС‚Рѕ РЅРµ С‚РѕРЅРєР°СЏ Р»РёРЅРёСЏ, Р° РѕР±Р»Р°СЃС‚СЊ РёРЅС‚РµСЂРµСЃР°.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ РїРѕРґРґРµСЂР¶РєР°",
      text:
        "РџРѕРґРґРµСЂР¶РєР° вЂ” СЌС‚Рѕ Р·РѕРЅР°, РіРґРµ СЂР°РЅСЊС€Рµ РїРѕСЏРІР»СЏР»РёСЃСЊ РїРѕРєСѓРїР°С‚РµР»Рё Рё С†РµРЅР° РѕСЃС‚Р°РЅР°РІР»РёРІР°Р»Р°СЃСЊ РёР»Рё СЂР°Р·РІРѕСЂР°С‡РёРІР°Р»Р°СЃСЊ РІРІРµСЂС…. Р­С‚Рѕ РЅРµ Р·РЅР°С‡РёС‚, С‡С‚Рѕ С†РµРЅР° РѕР±СЏР·Р°РЅР° РѕС‚СЃРєРѕС‡РёС‚СЊ СЃРЅРѕРІР°, РЅРѕ Р·РЅР°С‡РёС‚, С‡С‚Рѕ СЂСЏРґРѕРј РјРѕР¶РµС‚ РїРѕСЏРІРёС‚СЊСЃСЏ СЂРµР°РєС†РёСЏ.",
    },
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ",
      text:
        "РЎРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ вЂ” СЌС‚Рѕ Р·РѕРЅР°, РіРґРµ СЂР°РЅСЊС€Рµ РїРѕСЏРІР»СЏР»РёСЃСЊ РїСЂРѕРґР°РІС†С‹ Рё С†РµРЅР° РѕСЃС‚Р°РЅР°РІР»РёРІР°Р»Р°СЃСЊ РёР»Рё СЂР°Р·РІРѕСЂР°С‡РёРІР°Р»Р°СЃСЊ РІРЅРёР·. Р§РµРј РѕС‡РµРІРёРґРЅРµРµ Р·РѕРЅР° РґР»СЏ СѓС‡Р°СЃС‚РЅРёРєРѕРІ СЂС‹РЅРєР°, С‚РµРј Р±РѕР»СЊС€Рµ РІРЅРёРјР°РЅРёСЏ РѕРЅР° РјРѕР¶РµС‚ РїСЂРёРІР»РµС‡СЊ.",
    },
    {
      title: "РџРѕС‡РµРјСѓ СѓСЂРѕРІРµРЅСЊ вЂ” СЌС‚Рѕ Р·РѕРЅР°",
      text:
        "Р¦РµРЅР° СЂРµРґРєРѕ СЂРµР°РіРёСЂСѓРµС‚ РёРґРµР°Р»СЊРЅРѕ РІ РѕРґРёРЅ С†РµРЅС‚ РёР»Рё РїСѓРЅРєС‚. РЈС‡Р°СЃС‚РЅРёРєРё СЃС‚Р°РІСЏС‚ РѕСЂРґРµСЂР° РЅРµ РІ РѕРґРЅРѕР№ С‚РѕС‡РєРµ, Р° РІ РґРёР°РїР°Р·РѕРЅРµ. РџРѕСЌС‚РѕРјСѓ РїРѕРґРґРµСЂР¶РєСѓ Рё СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёРµ Р»СѓС‡С€Рµ РІРѕСЃРїСЂРёРЅРёРјР°С‚СЊ РєР°Рє РѕР±Р»Р°СЃС‚СЊ, РіРґРµ РЅСѓР¶РЅРѕ Р¶РґР°С‚СЊ СЂРµР°РєС†РёСЋ.",
    },
    {
      title: "РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ СѓСЂРѕРІРЅРё",
      text:
        "РЈСЂРѕРІРµРЅСЊ СЃР°Рј РїРѕ СЃРµР±Рµ РЅРµ СЏРІР»СЏРµС‚СЃСЏ СЃРёРіРЅР°Р»РѕРј. РЎРёРіРЅР°Р» РїРѕСЏРІР»СЏРµС‚СЃСЏ, РєРѕРіРґР° С†РµРЅР° РїРѕРґС…РѕРґРёС‚ Рє СѓСЂРѕРІРЅСЋ Рё РїРѕРєР°Р·С‹РІР°РµС‚ СЂРµР°РєС†РёСЋ: СѓРґРµСЂР¶Р°РЅРёРµ, РїСЂРѕР±РѕР№, Р»РѕР¶РЅС‹Р№ РїСЂРѕР±РѕР№, СѓСЃРєРѕСЂРµРЅРёРµ, РѕС‚РєР°Р· РёР»Рё РІРѕР·РІСЂР°С‚ РѕР±СЂР°С‚РЅРѕ.",
    },
  ],
  checklist: [
    "РћС‚РјРµС‡Р°Р№ С‚РѕР»СЊРєРѕ РѕС‡РµРІРёРґРЅС‹Рµ СѓСЂРѕРІРЅРё, Р° РЅРµ РІСЃС‘ РїРѕРґСЂСЏРґ.",
    "РСЃРїРѕР»СЊР·СѓР№ Р·РѕРЅС‹, Р° РЅРµ С‚РѕРЅРєРёРµ Р»РёРЅРёРё.",
    "Р–РґРё СЂРµР°РєС†РёСЋ С†РµРЅС‹ РІРѕР·Р»Рµ СѓСЂРѕРІРЅСЏ.",
    "РќРµ РІС…РѕРґРё С‚РѕР»СЊРєРѕ РїРѕС‚РѕРјСѓ, С‡С‚Рѕ С†РµРЅР° РєРѕСЃРЅСѓР»Р°СЃСЊ Р»РёРЅРёРё.",
  ],
},

"technical-analysis-3": {
  intro:
    "РўСЂРµРЅРґ Рё СЂРµРЅР¶ вЂ” СЌС‚Рѕ РґРІР° СЂР°Р·РЅС‹С… СЃРѕСЃС‚РѕСЏРЅРёСЏ СЂС‹РЅРєР°. Р’ С‚СЂРµРЅРґРµ С†РµРЅР° РґРІРёР¶РµС‚СЃСЏ РЅР°РїСЂР°РІР»РµРЅРЅРѕ, Р° РІ СЂРµРЅР¶Рµ С†РµРЅР° Р·Р°Р¶Р°С‚Р° РјРµР¶РґСѓ Р·РѕРЅР°РјРё СЃРїСЂРѕСЃР° Рё РїСЂРµРґР»РѕР¶РµРЅРёСЏ. РћС€РёР±РєР° РјРЅРѕРіРёС… С‚СЂРµР№РґРµСЂРѕРІ вЂ” С‚РѕСЂРіРѕРІР°С‚СЊ СЂРµРЅР¶ РєР°Рє С‚СЂРµРЅРґ РёР»Рё С‚СЂРµРЅРґ РєР°Рє СЂРµРЅР¶.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ С‚СЂРµРЅРґ",
      text:
        "РўСЂРµРЅРґ вЂ” СЌС‚Рѕ РЅР°РїСЂР°РІР»РµРЅРЅРѕРµ РґРІРёР¶РµРЅРёРµ С†РµРЅС‹. Р’ Р°РїС‚СЂРµРЅРґРµ С†РµРЅР° С‡Р°С‰Рµ РґРµР»Р°РµС‚ Р±РѕР»РµРµ РІС‹СЃРѕРєРёРµ РјР°РєСЃРёРјСѓРјС‹ Рё Р±РѕР»РµРµ РІС‹СЃРѕРєРёРµ РјРёРЅРёРјСѓРјС‹. Р’ РґР°СѓРЅС‚СЂРµРЅРґРµ вЂ” Р±РѕР»РµРµ РЅРёР·РєРёРµ РјР°РєСЃРёРјСѓРјС‹ Рё Р±РѕР»РµРµ РЅРёР·РєРёРµ РјРёРЅРёРјСѓРјС‹.",
    },
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ СЂРµРЅР¶",
      text:
        "Р РµРЅР¶ вЂ” СЌС‚Рѕ СЃРѕСЃС‚РѕСЏРЅРёРµ СЂС‹РЅРєР° Р±РµР· СЏРІРЅРѕРіРѕ РЅР°РїСЂР°РІР»РµРЅРёСЏ. Р¦РµРЅР° С…РѕРґРёС‚ РјРµР¶РґСѓ РІРµСЂС…РЅРµР№ Рё РЅРёР¶РЅРµР№ РіСЂР°РЅРёС†РµР№, Р° РїСЂРѕР±РѕРё С‡Р°СЃС‚Рѕ РјРѕРіСѓС‚ Р±С‹С‚СЊ Р»РѕР¶РЅС‹РјРё. Р’ СЂРµРЅР¶Рµ РІР°Р¶РЅРѕ РЅРµ РїСѓС‚Р°С‚СЊ С€СѓРј СЃ РЅР°С‡Р°Р»РѕРј С‚СЂРµРЅРґР°.",
    },
    {
      title: "РљР°Рє РѕС‚Р»РёС‡РёС‚СЊ С‚СЂРµРЅРґ РѕС‚ СЂРµРЅР¶Р°",
      text:
        "Р’ С‚СЂРµРЅРґРµ РѕС‚РєР°С‚С‹ С‡Р°С‰Рµ СѓРґРµСЂР¶РёРІР°СЋС‚СЃСЏ, Р° РґРІРёР¶РµРЅРёРµ РїСЂРѕРґРѕР»Р¶Р°РµС‚СЃСЏ. Р’ СЂРµРЅР¶Рµ С†РµРЅР° С‡Р°СЃС‚Рѕ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ РІ СЃРµСЂРµРґРёРЅСѓ РґРёР°РїР°Р·РѕРЅР° РїРѕСЃР»Рµ РїРѕРїС‹С‚РєРё РїСЂРѕР±РѕСЏ. Р•СЃР»Рё С†РµРЅР° РЅРµ РјРѕР¶РµС‚ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕСЃР»Рµ РїСЂРѕР±РѕСЏ вЂ” СЌС‚Рѕ РїСЂРёР·РЅР°Рє СЃР»Р°Р±РѕСЃС‚Рё.",
    },
    {
      title: "РџРѕС‡РµРјСѓ СЌС‚Рѕ РІР°Р¶РЅРѕ РґР»СЏ РІС…РѕРґР°",
      text:
        "Р’ С‚СЂРµРЅРґРµ Р»РѕРіРёС‡РЅРµРµ РёСЃРєР°С‚СЊ РїСЂРѕРґРѕР»Р¶РµРЅРёРµ РґРІРёР¶РµРЅРёСЏ РїРѕСЃР»Рµ РѕС‚РєР°С‚Р° РёР»Рё РїСЂРѕР±РѕСЏ. Р’ СЂРµРЅР¶Рµ РѕРїР°СЃРЅРѕ РїРѕРєСѓРїР°С‚СЊ РІРµСЂС… РґРёР°РїР°Р·РѕРЅР° Рё С€РѕСЂС‚РёС‚СЊ РЅРёР· РґРёР°РїР°Р·РѕРЅР° Р±РµР· РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ. РЎРЅР°С‡Р°Р»Р° РЅСѓР¶РЅРѕ РїРѕРЅСЏС‚СЊ СЂРµР¶РёРј СЂС‹РЅРєР°, РїРѕС‚РѕРј РІС‹Р±РёСЂР°С‚СЊ СЃРµС‚Р°Рї.",
    },
  ],
  checklist: [
    "РћРїСЂРµРґРµР»Рё, СЂС‹РЅРѕРє СЃРµР№С‡Р°СЃ РґРІРёР¶РµС‚СЃСЏ РЅР°РїСЂР°РІР»РµРЅРЅРѕ РёР»Рё СЃС‚РѕРёС‚ РІ РґРёР°РїР°Р·РѕРЅРµ.",
    "Р’ С‚СЂРµРЅРґРµ СЃРјРѕС‚СЂРё, СѓРґРµСЂР¶РёРІР°СЋС‚СЃСЏ Р»Рё РѕС‚РєР°С‚С‹.",
    "Р’ СЂРµРЅР¶Рµ Р±СѓРґСЊ РѕСЃС‚РѕСЂРѕР¶РµРЅ СЃ РїСЂРѕР±РѕСЏРјРё Р±РµР· РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ.",
    "РќРµ С‚РѕСЂРіСѓР№ РѕРґРёРЅ Рё С‚РѕС‚ Р¶Рµ СЃРµС‚Р°Рї РѕРґРёРЅР°РєРѕРІРѕ РІ С‚СЂРµРЅРґРµ Рё РІ СЂРµРЅР¶Рµ.",
  ],
},

"technical-analysis-4": {
  intro:
    "РћР±СЉС‘Рј РїРѕРєР°Р·С‹РІР°РµС‚ Р°РєС‚РёРІРЅРѕСЃС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ СЂС‹РЅРєР°. РЎР°Рј РїРѕ СЃРµР±Рµ РѕР±СЉС‘Рј РЅРµ РіРѕРІРѕСЂРёС‚, РєСѓРґР° С‚РѕС‡РЅРѕ РїРѕР№РґС‘С‚ С†РµРЅР°, РЅРѕ РїРѕРјРѕРіР°РµС‚ РїРѕРЅСЏС‚СЊ, РµСЃС‚СЊ Р»Рё РёРЅС‚РµСЂРµСЃ Рє РґРІРёР¶РµРЅРёСЋ, РїРѕРґС‚РІРµСЂР¶РґР°РµС‚СЃСЏ Р»Рё РїСЂРѕР±РѕР№ Рё РЅР°СЃРєРѕР»СЊРєРѕ СЃРµСЂСЊС‘Р·РЅРѕР№ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЂРµР°РєС†РёСЏ.",
  blocks: [
    {
      title: "Р§С‚Рѕ РїРѕРєР°Р·С‹РІР°РµС‚ РѕР±СЉС‘Рј",
      text:
        "РћР±СЉС‘Рј РїРѕРєР°Р·С‹РІР°РµС‚, СЃРєРѕР»СЊРєРѕ Р°РєС†РёР№, РєРѕРЅС‚СЂР°РєС‚РѕРІ РёР»Рё РјРѕРЅРµС‚ Р±С‹Р»Рѕ РїСЂРѕС‚РѕСЂРіРѕРІР°РЅРѕ Р·Р° РѕРїСЂРµРґРµР»С‘РЅРЅС‹Р№ РїРµСЂРёРѕРґ. Р’С‹СЃРѕРєРёР№ РѕР±СЉС‘Рј РѕР·РЅР°С‡Р°РµС‚ РїРѕРІС‹С€РµРЅРЅС‹Р№ РёРЅС‚РµСЂРµСЃ, РЅРѕ РЅРµ РІСЃРµРіРґР° РѕР·РЅР°С‡Р°РµС‚ РїСЂРѕРґРѕР»Р¶РµРЅРёРµ РґРІРёР¶РµРЅРёСЏ.",
    },
    {
      title: "РћР±СЉС‘Рј РЅР° РёРјРїСѓР»СЊСЃРµ",
      text:
        "Р•СЃР»Рё С†РµРЅР° РїСЂРѕР±РёРІР°РµС‚ СѓСЂРѕРІРµРЅСЊ Рё РѕР±СЉС‘Рј СЂРµР·РєРѕ СЂР°СЃС‚С‘С‚, СЌС‚Рѕ РјРѕР¶РµС‚ РіРѕРІРѕСЂРёС‚СЊ Рѕ РЅР°СЃС‚РѕСЏС‰РµРј РёРЅС‚РµСЂРµСЃРµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ. РќРѕ РІР°Р¶РЅРѕ СЃРјРѕС‚СЂРµС‚СЊ, СѓРґРµСЂР¶РёРІР°РµС‚СЃСЏ Р»Рё РґРІРёР¶РµРЅРёРµ РїРѕСЃР»Рµ РІСЃРїР»РµСЃРєР° РѕР±СЉС‘РјР°.",
    },
    {
      title: "РћР±СЉС‘Рј Р±РµР· РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ",
      text:
        "Р•СЃР»Рё РїРѕСЏРІР»СЏРµС‚СЃСЏ Р±РѕР»СЊС€РѕР№ РѕР±СЉС‘Рј, РЅРѕ С†РµРЅР° РЅРµ РјРѕР¶РµС‚ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РґРІРёР¶РµРЅРёРµ, СЌС‚Рѕ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРёР·РЅР°РєРѕРј РїРѕРіР»РѕС‰РµРЅРёСЏ, С„РёРєСЃР°С†РёРё РёР»Рё Р»РѕРІСѓС€РєРё. РўР°РєРѕР№ РјРѕРјРµРЅС‚ РѕСЃРѕР±РµРЅРЅРѕ РІР°Р¶РµРЅ РІРѕР·Р»Рµ СѓСЂРѕРІРЅРµР№.",
    },
    {
      title: "РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РѕР±СЉС‘Рј РІ РёРЅС‚СЂР°РґРµР№",
      text:
        "Р”Р»СЏ РёРЅС‚СЂР°РґРµР№-С‚СЂРµР№РґРµСЂР° РѕР±СЉС‘Рј РїРѕР»РµР·РµРЅ РєР°Рє РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ СЂРµР°РєС†РёРё. РџСЂРѕР±РѕР№ СЃ РѕР±СЉС‘РјРѕРј Рё СѓРґРµСЂР¶Р°РЅРёРµРј СЃРёР»СЊРЅРµРµ, С‡РµРј РїСЂРѕР±РѕР№ Р±РµР· РѕР±СЉС‘РјР°. РћС‚РєР°Р· РѕС‚ СѓСЂРѕРІРЅСЏ РЅР° Р±РѕР»СЊС€РѕРј РѕР±СЉС‘РјРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃРёР»СЊРЅС‹Рј СЃРёРіРЅР°Р»РѕРј СЃРјРµРЅС‹ РєРѕРЅС‚СЂРѕР»СЏ.",
    },
  ],
  checklist: [
    "РЎСЂР°РІРЅРё С‚РµРєСѓС‰РёР№ РѕР±СЉС‘Рј СЃ РїСЂРµРґС‹РґСѓС‰РёРјРё СЃРІРµС‡Р°РјРё.",
    "РЎРјРѕС‚СЂРё РЅРµ С‚РѕР»СЊРєРѕ РІСЃРїР»РµСЃРє РѕР±СЉС‘РјР°, РЅРѕ Рё СЂРµР°РєС†РёСЋ РїРѕСЃР»Рµ РЅРµРіРѕ.",
    "РџСЂРѕР±РѕР№ Р±РµР· РѕР±СЉС‘РјР° СЃР»Р°Р±РµРµ РїСЂРѕР±РѕСЏ СЃ РѕР±СЉС‘РјРѕРј.",
    "Р‘РѕР»СЊС€РѕР№ РѕР±СЉС‘Рј Р±РµР· РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ Р»РѕРІСѓС€РєРѕР№.",
  ],
},
"risk-management-1": {
  intro:
    "Р РёСЃРє-РјРµРЅРµРґР¶РјРµРЅС‚ вЂ” СЌС‚Рѕ СЃРёСЃС‚РµРјР°, РєРѕС‚РѕСЂР°СЏ Р·Р°С‰РёС‰Р°РµС‚ С‚СЂРµР№РґРµСЂР° РѕС‚ РѕРґРЅРѕР№ РїР»РѕС…РѕР№ СЃРґРµР»РєРё, РїР»РѕС…РѕРіРѕ РґРЅСЏ РёР»Рё СЃРµСЂРёРё РѕС€РёР±РѕРє. РҐРѕСЂРѕС€РёР№ С‚СЂРµР№РґРµСЂ РґСѓРјР°РµС‚ РЅРµ С‚РѕР»СЊРєРѕ Рѕ С‚РѕРј, СЃРєРѕР»СЊРєРѕ РјРѕР¶РЅРѕ Р·Р°СЂР°Р±РѕС‚Р°С‚СЊ, РЅРѕ Рё Рѕ С‚РѕРј, СЃРєРѕР»СЊРєРѕ РјРѕР¶РЅРѕ РїРѕС‚РµСЂСЏС‚СЊ, РµСЃР»Рё СЃС†РµРЅР°СЂРёР№ РѕРєР°Р¶РµС‚СЃСЏ РЅРµРїСЂР°РІРёР»СЊРЅС‹Рј.",
  blocks: [
    {
      title: "РџРѕС‡РµРјСѓ СЂРёСЃРє РІР°Р¶РЅРµРµ РёРґРµРё",
      text:
        "Р”Р°Р¶Рµ СЃРёР»СЊРЅР°СЏ С‚РѕСЂРіРѕРІР°СЏ РёРґРµСЏ РјРѕР¶РµС‚ РЅРµ СЃСЂР°Р±РѕС‚Р°С‚СЊ. Р С‹РЅРѕРє РјРѕР¶РµС‚ СЂРµР·РєРѕ РёР·РјРµРЅРёС‚СЊ РЅР°РїСЂР°РІР»РµРЅРёРµ, РІС‹Р№С‚Рё РЅРѕРІРѕСЃС‚СЊ, РёСЃС‡РµР·РЅСѓС‚СЊ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ РёР»Рё РїРѕСЏРІРёС‚СЊСЃСЏ Р°РіСЂРµСЃСЃРёРІРЅС‹Р№ РїСЂРѕРґР°РІРµС†/РїРѕРєСѓРїР°С‚РµР»СЊ. Р•СЃР»Рё СЂРёСЃРє Р·Р°СЂР°РЅРµРµ РЅРµ РѕРїСЂРµРґРµР»С‘РЅ, РѕРґРЅР° СЃРґРµР»РєР° РјРѕР¶РµС‚ РёСЃРїРѕСЂС‚РёС‚СЊ РІРµСЃСЊ РґРµРЅСЊ РёР»Рё РґР°Р¶Рµ РІРµСЃСЊ СЃС‡С‘С‚.",
    },
    {
      title: "Р РёСЃРє РЅР° СЃРґРµР»РєСѓ",
      text:
        "Р РёСЃРє РЅР° СЃРґРµР»РєСѓ вЂ” СЌС‚Рѕ СЃСѓРјРјР°, РєРѕС‚РѕСЂСѓСЋ С‚СЂРµР№РґРµСЂ РіРѕС‚РѕРІ РїРѕС‚РµСЂСЏС‚СЊ, РµСЃР»Рё СЃС†РµРЅР°СЂРёР№ РЅРµ СЃСЂР°Р±РѕС‚Р°РµС‚. РќР°РїСЂРёРјРµСЂ, РµСЃР»Рё СЂРёСЃРє $50, Р·РЅР°С‡РёС‚ СЃС‚РѕРї РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЂР°СЃСЃС‡РёС‚Р°РЅ С‚Р°Рє, С‡С‚РѕР±С‹ РїСЂРё РІС‹С…РѕРґРµ РїРѕ СЃС‚РѕРїСѓ СѓР±С‹С‚РѕРє Р±С‹Р» РѕРєРѕР»Рѕ $50, Р° РЅРµ СЃР»СѓС‡Р°Р№РЅРѕР№ СЃСѓРјРјРѕР№.",
    },
    {
      title: "Р РёСЃРє РЅР° РґРµРЅСЊ",
      text:
        "Р РёСЃРє РЅР° РґРµРЅСЊ РѕРіСЂР°РЅРёС‡РёРІР°РµС‚ РјР°РєСЃРёРјР°Р»СЊРЅСѓСЋ РїРѕС‚РµСЂСЋ Р·Р° С‚РѕСЂРіРѕРІСѓСЋ СЃРµСЃСЃРёСЋ. Р­С‚Рѕ РЅСѓР¶РЅРѕ, С‡С‚РѕР±С‹ РїРѕСЃР»Рµ РїР»РѕС…РѕР№ СЃРµСЂРёРё РЅРµ РЅР°С‡РёРЅР°С‚СЊ РѕС‚С‹РіСЂС‹РІР°С‚СЊСЃСЏ, СѓРІРµР»РёС‡РёРІР°С‚СЊ СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё Рё СЂР°Р·СЂСѓС€Р°С‚СЊ РґРёСЃС†РёРїР»РёРЅСѓ.",
    },
    {
      title: "Р“Р»Р°РІРЅР°СЏ С†РµР»СЊ СЂРёСЃРє-РјРµРЅРµРґР¶РјРµРЅС‚Р°",
      text:
        "Р¦РµР»СЊ СЂРёСЃРє-РјРµРЅРµРґР¶РјРµРЅС‚Р° вЂ” РЅРµ СѓР±СЂР°С‚СЊ СѓР±С‹С‚РєРё РїРѕР»РЅРѕСЃС‚СЊСЋ. РЈР±С‹С‚РєРё Р±СѓРґСѓС‚ РІСЃРµРіРґР°. Р¦РµР»СЊ вЂ” СЃРґРµР»Р°С‚СЊ РёС… РєРѕРЅС‚СЂРѕР»РёСЂСѓРµРјС‹РјРё, РѕР¶РёРґР°РµРјС‹РјРё Рё С‚Р°РєРёРјРё, С‡С‚РѕР±С‹ РѕРЅРё РЅРµ Р»РѕРјР°Р»Рё СЃС‚СЂР°С‚РµРіРёСЋ, РїСЃРёС…РѕР»РѕРіРёСЋ Рё РґРµРїРѕР·РёС‚.",
    },
  ],
  checklist: [
    "РџРµСЂРµРґ РІС…РѕРґРѕРј Р·РЅР°Р№ С‚РѕС‡РЅСѓСЋ СЃСѓРјРјСѓ СЂРёСЃРєР°.",
    "РќРµ СѓРІРµР»РёС‡РёРІР°Р№ СЂРёСЃРє РёР·-Р·Р° СѓРІРµСЂРµРЅРЅРѕСЃС‚Рё РёР»Рё Р¶РµР»Р°РЅРёСЏ РѕС‚С‹РіСЂР°С‚СЊСЃСЏ.",
    "РћРіСЂР°РЅРёС‡РёРІР°Р№ РґРЅРµРІРЅРѕР№ СѓР±С‹С‚РѕРє Р·Р°СЂР°РЅРµРµ.",
    "РҐРѕСЂРѕС€Р°СЏ СЃРґРµР»РєР° вЂ” СЌС‚Рѕ РЅРµ С‚РѕР»СЊРєРѕ РёРґРµСЏ, РЅРѕ Рё РєРѕРЅС‚СЂРѕР»РёСЂСѓРµРјС‹Р№ СЂРёСЃРє.",
  ],
},

"risk-management-2": {
  intro:
    "Р Р°Р·РјРµСЂ РїРѕР·РёС†РёРё РїРѕРєР°Р·С‹РІР°РµС‚, СЃРєРѕР»СЊРєРѕ Р°РєС†РёР№, РєРѕРЅС‚СЂР°РєС‚РѕРІ РёР»Рё РјРѕРЅРµС‚ С‚С‹ РјРѕР¶РµС€СЊ РІР·СЏС‚СЊ РІ СЃРґРµР»РєСѓ РїСЂРё Р·Р°РґР°РЅРЅРѕРј СЂРёСЃРєРµ. Р­С‚Рѕ РѕРґРёРЅ РёР· СЃР°РјС‹С… РІР°Р¶РЅС‹С… РЅР°РІС‹РєРѕРІ С‚СЂРµР№РґРµСЂР°, РїРѕС‚РѕРјСѓ С‡С‚Рѕ РѕРЅ СЃРІСЏР·С‹РІР°РµС‚ РёРґРµСЋ, СЃС‚РѕРї Рё РґРѕРїСѓСЃС‚РёРјСѓСЋ РїРѕС‚РµСЂСЋ.",
  blocks: [
    {
      title: "Р¤РѕСЂРјСѓР»Р° РїРѕР·РёС†РёРё",
      text:
        "Р‘Р°Р·РѕРІР°СЏ Р»РѕРіРёРєР° РїСЂРѕСЃС‚Р°СЏ: СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё = СЂРёСЃРє РЅР° СЃРґРµР»РєСѓ / СЂР°СЃСЃС‚РѕСЏРЅРёРµ РґРѕ СЃС‚РѕРїР°. Р•СЃР»Рё С‚С‹ РіРѕС‚РѕРІ СЂРёСЃРєРЅСѓС‚СЊ $50, Р° СЃС‚РѕРї РЅР°С…РѕРґРёС‚СЃСЏ РЅР° $0.25 РѕС‚ РІС…РѕРґР°, СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё Р±СѓРґРµС‚ 200 Р°РєС†РёР№.",
    },
    {
      title: "РџРѕС‡РµРјСѓ РЅРµР»СЊР·СЏ Р±СЂР°С‚СЊ РѕР±СЉС‘Рј РЅР° РіР»Р°Р·",
      text:
        "Р•СЃР»Рё Р±СЂР°С‚СЊ РїРѕР·РёС†РёСЋ РЅР° РіР»Р°Р·, СЂРёСЃРє Р±СѓРґРµС‚ РєР°Р¶РґС‹Р№ СЂР°Р· СЂР°Р·РЅС‹Рј. Р’ РѕРґРЅРѕР№ СЃРґРµР»РєРµ С‚С‹ РјРѕР¶РµС€СЊ РїРѕС‚РµСЂСЏС‚СЊ $20, РІ РґСЂСѓРіРѕР№ $150, С…РѕС‚СЏ РґСѓРјР°Р», С‡С‚Рѕ С‚РѕСЂРіСѓРµС€СЊ РѕРґРёРЅР°РєРѕРІРѕ. Р­С‚Рѕ Р»РѕРјР°РµС‚ СЃС‚Р°С‚РёСЃС‚РёРєСѓ Рё РґРµР»Р°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ СЃР»СѓС‡Р°Р№РЅС‹Рј.",
    },
    {
      title: "РЎС‚РѕРї РѕРїСЂРµРґРµР»СЏРµС‚ РѕР±СЉС‘Рј",
      text:
        "РЎРЅР°С‡Р°Р»Р° РѕРїСЂРµРґРµР»СЏРµС‚СЃСЏ С‚РѕС‡РєР° РІС…РѕРґР° Рё РјРµСЃС‚Рѕ, РіРґРµ СЃС†РµРЅР°СЂРёР№ Р±СѓРґРµС‚ СЃР»РѕРјР°РЅ. РўРѕР»СЊРєРѕ РїРѕСЃР»Рµ СЌС‚РѕРіРѕ СЃС‡РёС‚Р°РµС‚СЃСЏ РѕР±СЉС‘Рј. РќРµР»СЊР·СЏ СЃРЅР°С‡Р°Р»Р° РІС‹Р±СЂР°С‚СЊ Р¶РµР»Р°РµРјС‹Р№ РѕР±СЉС‘Рј, Р° РїРѕС‚РѕРј РїРѕРґРіРѕРЅСЏС‚СЊ СЃС‚РѕРї РїРѕРґ СЌРјРѕС†РёРё.",
    },
    {
      title: "Р§С‚Рѕ РґРµР»Р°С‚СЊ СЃ С€РёСЂРѕРєРёРј СЃС‚РѕРїРѕРј",
      text:
        "Р•СЃР»Рё СЃС‚РѕРї СЃР»РёС€РєРѕРј С€РёСЂРѕРєРёР№, РїРѕР·РёС†РёСЏ РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РјРµРЅСЊС€Рµ. Р•СЃР»Рё РїРѕСЃР»Рµ СЂР°СЃС‡С‘С‚Р° РѕР±СЉС‘Рј РїРѕР»СѓС‡Р°РµС‚СЃСЏ СЃР»РёС€РєРѕРј РјР°Р»РµРЅСЊРєРёРј РёР»Рё СЃРґРµР»РєР° РЅРµ РґР°С‘С‚ РЅРѕСЂРјР°Р»СЊРЅРѕРіРѕ РїРѕС‚РµРЅС†РёР°Р»Р°, Р»СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ РІС…РѕРґ.",
    },
  ],
  checklist: [
    "РЎРЅР°С‡Р°Р»Р° РѕРїСЂРµРґРµР»Рё СЃС‚РѕРї, РїРѕС‚РѕРј СЃС‡РёС‚Р°Р№ РѕР±СЉС‘Рј.",
    "РќРµ Р±РµСЂРё РѕРґРёРЅР°РєРѕРІС‹Р№ СЂР°Р·РјРµСЂ РїРѕР·РёС†РёРё РЅР° СЂР°Р·РЅС‹С… СЃРµС‚Р°РїР°С….",
    "Р§РµРј С€РёСЂРµ СЃС‚РѕРї, С‚РµРј РјРµРЅСЊС€Рµ РїРѕР·РёС†РёСЏ.",
    "РќРµ СѓРІРµР»РёС‡РёРІР°Р№ РѕР±СЉС‘Рј, РµСЃР»Рё РЅРµ РіРѕС‚РѕРІ РїСЂРёРЅСЏС‚СЊ СЂРµР°Р»СЊРЅС‹Р№ СЂРёСЃРє.",
  ],
},

"risk-management-3": {
  intro:
    "Risk/Reward РїРѕРєР°Р·С‹РІР°РµС‚ СЃРѕРѕС‚РЅРѕС€РµРЅРёРµ РїРѕС‚РµРЅС†РёР°Р»СЊРЅРѕР№ РїСЂРёР±С‹Р»Рё Рє РїРѕС‚РµРЅС†РёР°Р»СЊРЅРѕРјСѓ СѓР±С‹С‚РєСѓ. РћРЅ РїРѕРјРѕРіР°РµС‚ РїРѕРЅСЏС‚СЊ, СЃС‚РѕРёС‚ Р»Рё СЃРґРµР»РєР° СЂРёСЃРєР°. Р”Р°Р¶Рµ С…РѕСЂРѕС€Р°СЏ РёРґРµСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїР»РѕС…РѕР№ СЃРґРµР»РєРѕР№, РµСЃР»Рё РїРѕС‚РµРЅС†РёР°Р»СЊРЅР°СЏ РїСЂРёР±С‹Р»СЊ СЃР»РёС€РєРѕРј РјР°Р»РµРЅСЊРєР°СЏ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ СЃС‚РѕРїР°.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ R",
      text:
        "R вЂ” СЌС‚Рѕ РµРґРёРЅРёС†Р° СЂРёСЃРєР°. Р•СЃР»Рё С‚С‹ СЂРёСЃРєСѓРµС€СЊ $50, С‚Рѕ 1R = $50. РџСЂРёР±С‹Р»СЊ $100 Р±СѓРґРµС‚ +2R, СѓР±С‹С‚РѕРє $50 Р±СѓРґРµС‚ -1R. РўР°РєРѕР№ РїРѕРґС…РѕРґ РїРѕРјРѕРіР°РµС‚ РѕС†РµРЅРёРІР°С‚СЊ СЃРґРµР»РєРё РЅРµР·Р°РІРёСЃРёРјРѕ РѕС‚ СЂР°Р·РјРµСЂР° РїРѕР·РёС†РёРё Рё С†РµРЅС‹ Р°РєС†РёРё.",
    },
    {
      title: "РџРѕС‡РµРјСѓ РІР°Р¶РµРЅ РїРѕС‚РµРЅС†РёР°Р»",
      text:
        "РџРµСЂРµРґ РІС…РѕРґРѕРј РЅСѓР¶РЅРѕ РїРѕРЅРёРјР°С‚СЊ, РєСѓРґР° С†РµРЅР° СЂРµР°Р»СЊРЅРѕ РјРѕР¶РµС‚ РґРѕР№С‚Рё. Р•СЃР»Рё СЃС‚РѕРї $0.30, Р° Р±Р»РёР¶Р°Р№С€Р°СЏ С†РµР»СЊ РІСЃРµРіРѕ $0.20, СЃРґРµР»РєР° РЅРµ РёРјРµРµС‚ С…РѕСЂРѕС€РµРіРѕ СЃРѕРѕС‚РЅРѕС€РµРЅРёСЏ СЂРёСЃРєР° Рё РїСЂРёР±С‹Р»Рё.",
    },
    {
      title: "РќРµ РІСЃРµ СЃРґРµР»РєРё РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ 3R",
      text:
        "Р’ СЃРєР°Р»СЊРїРёРЅРіРµ Рё РёРЅС‚СЂР°РґРµР№-С‚РѕСЂРіРѕРІР»Рµ РЅРµ РєР°Р¶РґР°СЏ СЃРґРµР»РєР° РґР°СЃС‚ Р±РѕР»СЊС€РѕРµ СЃРѕРѕС‚РЅРѕС€РµРЅРёРµ. РќРѕ С‚СЂРµР№РґРµСЂ РґРѕР»Р¶РµРЅ РїРѕРЅРёРјР°С‚СЊ, РїРѕС‡РµРјСѓ РѕРЅ РІС…РѕРґРёС‚, РіРґРµ С‡Р°СЃС‚РёС‡РЅРѕ С„РёРєСЃРёСЂСѓРµС‚ РїСЂРёР±С‹Р»СЊ Рё РіРґРµ СЃС†РµРЅР°СЂРёР№ РїРµСЂРµСЃС‚Р°С‘С‚ Р±С‹С‚СЊ РІС‹РіРѕРґРЅС‹Рј.",
    },
    {
      title: "Risk/Reward Рё win rate",
      text:
        "Р§РµРј РЅРёР¶Рµ СЃСЂРµРґРЅРёР№ Risk/Reward, С‚РµРј РІС‹С€Рµ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ win rate. Р•СЃР»Рё С‚СЂРµР№РґРµСЂ С‡Р°СЃС‚Рѕ Р±РµСЂС‘С‚ РјР°Р»РµРЅСЊРєСѓСЋ РїСЂРёР±С‹Р»СЊ Рё РґРµСЂР¶РёС‚ Р±РѕР»СЊС€РёРµ СѓР±С‹С‚РєРё, РґР°Р¶Рµ РІС‹СЃРѕРєРёР№ РїСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє РјРѕР¶РµС‚ РЅРµ СЃРїР°СЃС‚Рё СЃРёСЃС‚РµРјСѓ.",
    },
  ],
  checklist: [
    "РџРµСЂРµРґ РІС…РѕРґРѕРј РѕРїСЂРµРґРµР»Рё Р±Р»РёР¶Р°Р№С€СѓСЋ Р»РѕРіРёС‡РЅСѓСЋ С†РµР»СЊ.",
    "РЎСЂР°РІРЅРё С†РµР»СЊ СЃРѕ СЃС‚РѕРїРѕРј.",
    "Р”СѓРјР°Р№ РІ R, Р° РЅРµ С‚РѕР»СЊРєРѕ РІ РґРѕР»Р»Р°СЂР°С….",
    "РќРµ РІС…РѕРґРё РІ СЃРґРµР»РєСѓ, РіРґРµ РїРѕС‚РµРЅС†РёР°Р»СЊРЅС‹Р№ СѓР±С‹С‚РѕРє Р±РѕР»СЊС€Рµ СЂР°Р·СѓРјРЅРѕР№ С†РµР»Рё.",
  ],
},

"risk-management-4": {
  intro:
    "Р”РЅРµРІРЅРѕР№ Р»РёРјРёС‚ вЂ” СЌС‚Рѕ Р·Р°СЂР°РЅРµРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅРЅР°СЏ РіСЂР°РЅРёС†Р° СѓР±С‹С‚РєР°, РїРѕСЃР»Рµ РєРѕС‚РѕСЂРѕР№ С‚СЂРµР№РґРµСЂ РїСЂРµРєСЂР°С‰Р°РµС‚ С‚РѕСЂРіРѕРІР»СЋ. РћРЅ РЅСѓР¶РµРЅ РЅРµ РїРѕС‚РѕРјСѓ, С‡С‚Рѕ С‚СЂРµР№РґРµСЂ СЃР»Р°Р±С‹Р№, Р° РїРѕС‚РѕРјСѓ С‡С‚Рѕ РїРѕСЃР»Рµ СЃРµСЂРёРё СѓР±С‹С‚РєРѕРІ РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№ РѕР±С‹С‡РЅРѕ СѓС…СѓРґС€Р°РµС‚СЃСЏ.",
  blocks: [
    {
      title: "Р—Р°С‡РµРј РЅСѓР¶РµРЅ РґРЅРµРІРЅРѕР№ Р»РёРјРёС‚",
      text:
        "РџРѕСЃР»Рµ РЅРµСЃРєРѕР»СЊРєРёС… РїР»РѕС…РёС… СЃРґРµР»РѕРє РїРѕСЏРІР»СЏРµС‚СЃСЏ Р¶РµР»Р°РЅРёРµ РѕС‚С‹РіСЂР°С‚СЊСЃСЏ. РўСЂРµР№РґРµСЂ РЅР°С‡РёРЅР°РµС‚ РІРёРґРµС‚СЊ СЃРµС‚Р°РїС‹ С‚Р°Рј, РіРґРµ РёС… РЅРµС‚, СѓРІРµР»РёС‡РёРІР°РµС‚ СЂРёСЃРє, РЅР°СЂСѓС€Р°РµС‚ РїР»Р°РЅ Рё С‚РѕСЂРіСѓРµС‚ СЌРјРѕС†РёРё. Р”РЅРµРІРЅРѕР№ Р»РёРјРёС‚ Р·Р°С‰РёС‰Р°РµС‚ РѕС‚ СЌС‚РѕРіРѕ СЃРѕСЃС‚РѕСЏРЅРёСЏ.",
    },
    {
      title: "Р›РёРјРёС‚ РїРѕ РґРµРЅСЊРіР°Рј",
      text:
        "РЎР°РјС‹Р№ РїСЂРѕСЃС‚РѕР№ РІР°СЂРёР°РЅС‚ вЂ” Р»РёРјРёС‚ РїРѕ СЃСѓРјРјРµ. РќР°РїСЂРёРјРµСЂ, РµСЃР»Рё СЂРёСЃРє РЅР° СЃРґРµР»РєСѓ $50, РґРЅРµРІРЅРѕР№ Р»РёРјРёС‚ РјРѕР¶РµС‚ Р±С‹С‚СЊ $100вЂ“150. РџРѕСЃР»Рµ РґРѕСЃС‚РёР¶РµРЅРёСЏ Р»РёРјРёС‚Р° С‚РѕСЂРіРѕРІР»СЏ РїСЂРµРєСЂР°С‰Р°РµС‚СЃСЏ РґРѕ СЃР»РµРґСѓСЋС‰РµРіРѕ РґРЅСЏ.",
    },
    {
      title: "Р›РёРјРёС‚ РїРѕ РєР°С‡РµСЃС‚РІСѓ",
      text:
        "РРЅРѕРіРґР° РІР°Р¶РЅРѕ РѕСЃС‚Р°РЅРѕРІРёС‚СЊСЃСЏ РЅРµ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СѓР±С‹С‚РєР°, РЅРѕ Рё РїРѕСЃР»Рµ РїР»РѕС…РѕРіРѕ РїРѕРІРµРґРµРЅРёСЏ: РёРјРїСѓР»СЊСЃРёРІРЅС‹С… РІС…РѕРґРѕРІ, РЅР°СЂСѓС€РµРЅРёСЏ СЃС‚РѕРїР°, РІС…РѕРґР° Р±РµР· СЃРµС‚Р°РїР°, СѓРІРµР»РёС‡РµРЅРёСЏ РѕР±СЉС‘РјР° Р±РµР· РїСЂРёС‡РёРЅС‹. Р­С‚Рѕ С‚РѕР¶Рµ СЃРёРіРЅР°Р» Р·Р°РІРµСЂС€РёС‚СЊ СЃРµСЃСЃРёСЋ.",
    },
    {
      title: "РљР°Рє РѕС‚РЅРѕСЃРёС‚СЊСЃСЏ Рє РѕСЃС‚Р°РЅРѕРІРєРµ",
      text:
        "РћСЃС‚Р°РЅРѕРІРєР° РїРѕСЃР»Рµ Р»РёРјРёС‚Р° вЂ” СЌС‚Рѕ РЅРµ РїРѕСЂР°Р¶РµРЅРёРµ. Р­С‚Рѕ РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅРѕРµ РґРµР№СЃС‚РІРёРµ. РўСЂРµР№РґРµСЂ, РєРѕС‚РѕСЂС‹Р№ СѓРјРµРµС‚ РѕСЃС‚Р°РЅРѕРІРёС‚СЊСЃСЏ, СЃРѕС…СЂР°РЅСЏРµС‚ РєР°РїРёС‚Р°Р», РїСЃРёС…РёРєСѓ Рё РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ С‚РѕСЂРіРѕРІР°С‚СЊ Р·Р°РІС‚СЂР°.",
    },
  ],
  checklist: [
    "РЈСЃС‚Р°РЅРѕРІРё РґРЅРµРІРЅРѕР№ Р»РёРјРёС‚ РґРѕ РЅР°С‡Р°Р»Р° СЃРµСЃСЃРёРё.",
    "РџРѕСЃР»Рµ РґРѕСЃС‚РёР¶РµРЅРёСЏ Р»РёРјРёС‚Р° РЅРµ РѕС‚РєСЂС‹РІР°Р№ РЅРѕРІС‹Рµ СЃРґРµР»РєРё.",
    "РћС‚РґРµР»СЊРЅРѕ РѕС‚СЃР»РµР¶РёРІР°Р№ РЅР°СЂСѓС€РµРЅРёРµ РїСЂР°РІРёР», Р° РЅРµ С‚РѕР»СЊРєРѕ PnL.",
    "РќРµ РїС‹С‚Р°Р№СЃСЏ РІРµСЂРЅСѓС‚СЊ РґРµРЅСЊ Р»СЋР±РѕР№ С†РµРЅРѕР№.",
  ],
},
"intraday-momentum-1": {
  intro:
    "Momentum вЂ” СЌС‚Рѕ СЃРёС‚СѓР°С†РёСЏ, РєРѕРіРґР° С†РµРЅР° РґРІРёР¶РµС‚СЃСЏ Р±С‹СЃС‚СЂРѕ Рё РЅР°РїСЂР°РІР»РµРЅРЅРѕ, РїРѕС‚РѕРјСѓ С‡С‚Рѕ РѕРґРЅР° СЃС‚РѕСЂРѕРЅР° СЂС‹РЅРєР° СЃС‚Р°РЅРѕРІРёС‚СЃСЏ Р°РіСЂРµСЃСЃРёРІРЅРµРµ РґСЂСѓРіРѕР№. Р’ РёРЅС‚СЂР°РґРµР№-С‚РѕСЂРіРѕРІР»Рµ momentum РІР°Р¶РµРЅ С‚РµРј, С‡С‚Рѕ РґР°С‘С‚ Р±С‹СЃС‚СЂС‹Рµ РґРІРёР¶РµРЅРёСЏ, РїРѕРЅСЏС‚РЅС‹Рµ С‚РѕС‡РєРё СЂРёСЃРєР° Рё РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ СЂР°Р±РѕС‚Р°С‚СЊ РїРѕ СЂРµР°РєС†РёРё.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ momentum",
      text:
        "Momentum РїРѕСЏРІР»СЏРµС‚СЃСЏ, РєРѕРіРґР° РІ Р°РєС‚РёРІ РїСЂРёС…РѕРґРёС‚ РїРѕРІС‹С€РµРЅРЅС‹Р№ РёРЅС‚РµСЂРµСЃ: РЅРѕРІРѕСЃС‚СЊ, РіСЌРї, РѕР±СЉС‘Рј, РїСЂРѕР±РѕР№ СѓСЂРѕРІРЅСЏ, СЃРёР»СЊРЅС‹Р№ СЂС‹РЅРѕРє РёР»Рё Р°РіСЂРµСЃСЃРёРІРЅС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё. Р¦РµРЅР° РЅР°С‡РёРЅР°РµС‚ РґРІРёРіР°С‚СЊСЃСЏ Р±С‹СЃС‚СЂРµРµ РѕР±С‹С‡РЅРѕРіРѕ, Р° РѕС‚РєР°С‚С‹ СЃС‚Р°РЅРѕРІСЏС‚СЃСЏ РјРµРЅСЊС€Рµ РёР»Рё Р±С‹СЃС‚СЂРµРµ РІС‹РєСѓРїР°СЋС‚СЃСЏ.",
    },
    {
      title: "РџРѕС‡РµРјСѓ momentum РѕРїР°СЃРµРЅ Р±РµР· РїР»Р°РЅР°",
      text:
        "РРјРїСѓР»СЊСЃ РјРѕР¶РµС‚ РґР°С‚СЊ Р±С‹СЃС‚СЂС‹Р№ РїСЂРѕС„РёС‚, РЅРѕ С‚Р°РєР¶Рµ РјРѕР¶РµС‚ СЂРµР·РєРѕ СЂР°Р·РІРµСЂРЅСѓС‚СЊСЃСЏ. Р•СЃР»Рё РІС…РѕРґРёС‚СЊ РїРѕР·РґРЅРѕ, Р±РµР· СЃС‚РѕРїР° Рё Р±РµР· РїРѕРЅРёРјР°РЅРёСЏ СѓСЂРѕРІРЅСЏ, С‚СЂРµР№РґРµСЂ Р»РµРіРєРѕ РїРѕРєСѓРїР°РµС‚ РІРµСЂС€РёРЅСѓ РёР»Рё С€РѕСЂС‚РёС‚ СЃР°РјС‹Р№ РЅРёР· РґРІРёР¶РµРЅРёСЏ.",
    },
    {
      title: "Momentum vs РѕР±С‹С‡РЅС‹Р№ С€СѓРј",
      text:
        "РќРµ РєР°Р¶РґРѕРµ РґРІРёР¶РµРЅРёРµ СЏРІР»СЏРµС‚СЃСЏ momentum. РќР°СЃС‚РѕСЏС‰РёР№ momentum РѕР±С‹С‡РЅРѕ СЃРѕРїСЂРѕРІРѕР¶РґР°РµС‚СЃСЏ СЂР°СЃС€РёСЂРµРЅРёРµРј РґРёР°РїР°Р·РѕРЅР° СЃРІРµС‡РµР№, СЂРѕСЃС‚РѕРј РѕР±СЉС‘РјР°, СѓРґРµСЂР¶Р°РЅРёРµРј СѓСЂРѕРІРЅРµР№ Рё Р±С‹СЃС‚СЂС‹Рј РїСЂРѕРґРѕР»Р¶РµРЅРёРµРј РїРѕСЃР»Рµ РЅРµР±РѕР»СЊС€РёС… РїР°СѓР·.",
    },
    {
      title: "Р§С‚Рѕ РІР°Р¶РЅРѕ РґР»СЏ РІС…РѕРґР°",
      text:
        "Р”Р»СЏ momentum-С‚СЂРµР№РґРµСЂР° РІР°Р¶РЅРѕ РЅРµ РїСЂРѕСЃС‚Рѕ СѓРІРёРґРµС‚СЊ СЂРѕСЃС‚ РёР»Рё РїР°РґРµРЅРёРµ, Р° РїРѕРЅСЏС‚СЊ, РіРґРµ РґРІРёР¶РµРЅРёРµ РЅР°С‡Р°Р»РѕСЃСЊ, РіРґРµ Р±Р»РёР¶Р°Р№С€РёР№ СѓСЂРѕРІРµРЅСЊ, РіРґРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ Рё РіРґРµ СЃС†РµРЅР°СЂРёР№ Р±СѓРґРµС‚ СЃР»РѕРјР°РЅ.",
    },
  ],
  checklist: [
    "РС‰Рё СѓСЃРєРѕСЂРµРЅРёРµ С†РµРЅС‹, Р° РЅРµ СЃР»СѓС‡Р°Р№РЅРѕРµ РґРІРёР¶РµРЅРёРµ.",
    "РџСЂРѕРІРµСЂСЏР№ РѕР±СЉС‘Рј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РїСЂРµРґС‹РґСѓС‰РёС… СЃРІРµС‡РµР№.",
    "РЎРјРѕС‚СЂРё, СѓРґРµСЂР¶РёРІР°РµС‚ Р»Рё С†РµРЅР° РїСЂРѕР±РёС‚С‹Р№ СѓСЂРѕРІРµРЅСЊ.",
    "РќРµ РІС…РѕРґРё РїРѕР·РґРЅРѕ, РµСЃР»Рё СЃС‚РѕРї СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЃР»РёС€РєРѕРј С€РёСЂРѕРєРёРј.",
  ],
},

"intraday-momentum-2": {
  intro:
    "Gap and go вЂ” СЌС‚Рѕ СЃС†РµРЅР°СЂРёР№, РіРґРµ Р°РєС‚РёРІ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ СЃ РіСЌРїРѕРј Рё РїСЂРѕРґРѕР»Р¶Р°РµС‚ РґРІРёР¶РµРЅРёРµ РІ СЃС‚РѕСЂРѕРЅСѓ РіСЌРїР° РїРѕСЃР»Рµ РѕС‚РєСЂС‹С‚РёСЏ СЂС‹РЅРєР°. РўР°РєРѕР№ СЃРµС‚Р°Рї С‡Р°СЃС‚Рѕ РїРѕСЏРІР»СЏРµС‚СЃСЏ РЅР° РЅРѕРІРѕСЃС‚СЏС…, earnings, upgrade/downgrade, СЃРёР»СЊРЅРѕРј СЃРµРєС‚РѕСЂРµ РёР»Рё РЅРµРѕР±С‹С‡РЅРѕРј РѕР±СЉС‘РјРµ.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ РіСЌРї",
      text:
        "Р“СЌРї вЂ” СЌС‚Рѕ СЂР°Р·СЂС‹РІ РјРµР¶РґСѓ С†РµРЅРѕР№ РїСЂРµРґС‹РґСѓС‰РµРіРѕ Р·Р°РєСЂС‹С‚РёСЏ Рё С‚РµРєСѓС‰РµР№ С†РµРЅРѕР№. Р•СЃР»Рё Р°РєС†РёСЏ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ Р·РЅР°С‡РёС‚РµР»СЊРЅРѕ РІС‹С€Рµ РёР»Рё РЅРёР¶Рµ, СЌС‚Рѕ РѕР·РЅР°С‡Р°РµС‚, С‡С‚Рѕ Р·Р° РїСЂРµРґРµР»Р°РјРё РѕР±С‹С‡РЅРѕР№ СЃРµСЃСЃРёРё РїРѕСЏРІРёР»СЃСЏ РЅРѕРІС‹Р№ СЃРїСЂРѕСЃ РёР»Рё РїСЂРµРґР»РѕР¶РµРЅРёРµ.",
    },
    {
      title: "РљРѕРіРґР° gap and go СЃРёР»СЊРЅРµРµ",
      text:
        "РЎРµС‚Р°Рї СЃРёР»СЊРЅРµРµ, РєРѕРіРґР° РµСЃС‚СЊ РїРѕРЅСЏС‚РЅС‹Р№ catalyst, РІС‹СЃРѕРєРёР№ relative volume, СѓРґРµСЂР¶Р°РЅРёРµ premarket levels Рё РѕС‚СЃСѓС‚СЃС‚РІРёРµ Р±С‹СЃС‚СЂРѕРіРѕ РІРѕР·РІСЂР°С‚Р° РІ РіСЌРї. Р§РµРј Р»СѓС‡С€Рµ С†РµРЅР° РґРµСЂР¶РёС‚ РёРјРїСѓР»СЊСЃ РїРѕСЃР»Рµ РѕС‚РєСЂС‹С‚РёСЏ, С‚РµРј РІС‹С€Рµ С€Р°РЅСЃ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ.",
    },
    {
      title: "Р“РґРµ РёСЃРєР°С‚СЊ РІС…РѕРґ",
      text:
        "Р§Р°СЃС‚Рѕ РІС…РѕРґ РёС‰СѓС‚ РЅРµ РІ СЃР»СѓС‡Р°Р№РЅРѕРј РјРµСЃС‚Рµ, Р° РїРѕСЃР»Рµ СѓРґРµСЂР¶Р°РЅРёСЏ premarket high/low, VWAP, opening range, Р»РѕРєР°Р»СЊРЅРѕРіРѕ РѕС‚РєР°С‚Р° РёР»Рё РїСЂРѕР±РѕСЏ Р·РѕРЅС‹, РіРґРµ РїСЂРѕРґР°РІС†С‹/РїРѕРєСѓРїР°С‚РµР»Рё РЅРµ СЃРјРѕРіР»Рё СЂР°Р·РІРµСЂРЅСѓС‚СЊ РґРІРёР¶РµРЅРёРµ.",
    },
    {
      title: "Р“Р»Р°РІРЅС‹Р№ СЂРёСЃРє",
      text:
        "Р“Р»Р°РІРЅС‹Р№ СЂРёСЃРє gap and go вЂ” РєСѓРїРёС‚СЊ СЃР»РёС€РєРѕРј РїРѕР·РґРЅРѕ РїРѕСЃР»Рµ Р±РѕР»СЊС€РѕРіРѕ РґРІРёР¶РµРЅРёСЏ РёР»Рё Р·Р°Р№С‚Рё РІ РјРѕРјРµРЅС‚, РєРѕРіРґР° СЂР°РЅРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРё СѓР¶Рµ С„РёРєСЃРёСЂСѓСЋС‚ РїСЂРёР±С‹Р»СЊ. РџРѕСЌС‚РѕРјСѓ РІР°Р¶РЅРѕ Р¶РґР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂСѓ, СѓСЂРѕРІРµРЅСЊ Рё СЂРµР°РєС†РёСЋ.",
    },
  ],
  checklist: [
    "РџСЂРѕРІРµСЂСЊ СЂР°Р·РјРµСЂ РіСЌРїР° Рё РїСЂРёС‡РёРЅСѓ РґРІРёР¶РµРЅРёСЏ.",
    "РЎРјРѕС‚СЂРё premarket high/low Рё VWAP.",
    "РћС†РµРЅРё, РґРµСЂР¶РёС‚СЃСЏ Р»Рё С†РµРЅР° РїРѕСЃР»Рµ РѕС‚РєСЂС‹С‚РёСЏ.",
    "РќРµ РІС…РѕРґРё РІ СЂР°СЃС‚СЏРЅСѓС‚СѓСЋ СЃРІРµС‡Сѓ Р±РµР· РїРѕРЅСЏС‚РЅРѕРіРѕ СЃС‚РѕРїР°.",
  ],
},

"intraday-momentum-3": {
  intro:
    "Continuation вЂ” СЌС‚Рѕ РїСЂРѕРґРѕР»Р¶РµРЅРёРµ СѓР¶Рµ РЅР°С‡Р°С‚РѕРіРѕ РґРІРёР¶РµРЅРёСЏ. Р”Р»СЏ С‚СЂРµР№РґРµСЂР° СЌС‚Рѕ РѕРґРёРЅ РёР· СЃР°РјС‹С… Р»РѕРіРёС‡РЅС‹С… momentum-СЃС†РµРЅР°СЂРёРµРІ: СЂС‹РЅРѕРє СѓР¶Рµ РїРѕРєР°Р·Р°Р» РЅР°РїСЂР°РІР»РµРЅРёРµ, Р° Р·Р°РґР°С‡Р° вЂ” РЅР°Р№С‚Рё РјРµСЃС‚Рѕ, РіРґРµ РїСЂРѕРґРѕР»Р¶РµРЅРёРµ РёРјРµРµС‚ С…РѕСЂРѕС€РёР№ СЂРёСЃРє.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ continuation",
      text:
        "Continuation РІРѕР·РЅРёРєР°РµС‚, РєРѕРіРґР° С†РµРЅР° РїРѕСЃР»Рµ РёРјРїСѓР»СЊСЃР° РґРµР»Р°РµС‚ РїР°СѓР·Сѓ, РѕС‚РєР°С‚ РёР»Рё РєРѕРЅСЃРѕР»РёРґР°С†РёСЋ, РЅРѕ РЅРµ Р»РѕРјР°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ. РџРѕСЃР»Рµ СЌС‚РѕРіРѕ РґРІРёР¶РµРЅРёРµ РїСЂРѕРґРѕР»Р¶Р°РµС‚СЃСЏ РІ СЃС‚РѕСЂРѕРЅСѓ РїРµСЂРІРѕРЅР°С‡Р°Р»СЊРЅРѕРіРѕ РёРјРїСѓР»СЊСЃР°.",
    },
    {
      title: "РљР°РєР°СЏ РїР°СѓР·Р° СЃС‡РёС‚Р°РµС‚СЃСЏ Р·РґРѕСЂРѕРІРѕР№",
      text:
        "Р—РґРѕСЂРѕРІР°СЏ РїР°СѓР·Р° РѕР±С‹С‡РЅРѕ РЅРµ СЃР»РёС€РєРѕРј РіР»СѓР±РѕРєР°СЏ, РїСЂРѕС…РѕРґРёС‚ РЅР° РјРµРЅСЊС€РµРј РѕР±СЉС‘РјРµ Рё СѓРґРµСЂР¶РёРІР°РµС‚ РєР»СЋС‡РµРІС‹Рµ СѓСЂРѕРІРЅРё. Р•СЃР»Рё РѕС‚РєР°С‚ СЃР»РёС€РєРѕРј СЂРµР·РєРёР№ Рё РІРѕР·РІСЂР°С‰Р°РµС‚ Р±РѕР»СЊС€СѓСЋ С‡Р°СЃС‚СЊ РёРјРїСѓР»СЊСЃР°, continuation СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЃР»Р°Р±РµРµ.",
    },
    {
      title: "Р“РґРµ РёСЃРєР°С‚СЊ С‚СЂРёРіРіРµСЂ",
      text:
        "РўСЂРёРіРіРµСЂРѕРј РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРѕР±РѕР№ Р»РѕРєР°Р»СЊРЅРѕРіРѕ high/low РїРѕСЃР»Рµ РїР°СѓР·С‹, СѓРґРµСЂР¶Р°РЅРёРµ VWAP, РІРѕР·РІСЂР°С‚ РІС‹С€Рµ СѓСЂРѕРІРЅСЏ, СѓСЃРєРѕСЂРµРЅРёРµ РѕР±СЉС‘РјР° РёР»Рё РѕС‚РєР°Р· РїСЂРѕРґР°РІС†РѕРІ/РїРѕРєСѓРїР°С‚РµР»РµР№ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РѕС‚РєР°С‚.",
    },
    {
      title: "РљРѕРіРґР° continuation Р»СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ",
      text:
        "Р•СЃР»Рё С†РµРЅР° СѓР¶Рµ РґР°Р»РµРєРѕ РѕС‚ Р±Р°Р·С‹, РѕР±СЉС‘Рј РїР°РґР°РµС‚, СѓСЂРѕРІРµРЅСЊ РЅРµ СѓРґРµСЂР¶РёРІР°РµС‚СЃСЏ, Р° СЃС‚РѕРї РїРѕР»СѓС‡Р°РµС‚СЃСЏ СЃР»РёС€РєРѕРј С€РёСЂРѕРєРёРј вЂ” РїСЂРѕРґРѕР»Р¶РµРЅРёРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїР»РѕС…РѕР№ СЃРґРµР»РєРѕР№ РґР°Р¶Рµ РїСЂРё РїСЂР°РІРёР»СЊРЅРѕРј РЅР°РїСЂР°РІР»РµРЅРёРё.",
    },
  ],
  checklist: [
    "РЎРЅР°С‡Р°Р»Р° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃРёР»СЊРЅС‹Р№ РёРјРїСѓР»СЊСЃ.",
    "РџР°СѓР·Р° РЅРµ РґРѕР»Р¶РЅР° Р»РѕРјР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂСѓ.",
    "РС‰Рё РІС…РѕРґ РІРѕР·Р»Рµ СѓСЂРѕРІРЅСЏ, Р° РЅРµ РїРѕСЃСЂРµРґРё РґРІРёР¶РµРЅРёСЏ.",
    "РЎС‚РѕРї РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ Р»РѕРіРёС‡РЅС‹Рј Рё РєРѕСЂРѕС‚РєРёРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ С†РµР»Рё.",
  ],
},

"intraday-momentum-4": {
  intro:
    "False breakout Рё trap вЂ” СЌС‚Рѕ СЃРёС‚СѓР°С†РёРё, РєРѕРіРґР° С†РµРЅР° РїСЂРѕР±РёРІР°РµС‚ РѕС‡РµРІРёРґРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ, СЃРѕР±РёСЂР°РµС‚ Р»РёРєРІРёРґРЅРѕСЃС‚СЊ, РЅРѕ РЅРµ РјРѕР¶РµС‚ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РґРІРёР¶РµРЅРёРµ Рё Р±С‹СЃС‚СЂРѕ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ. Р”Р»СЏ momentum-С‚СЂРµР№РґРµСЂР° СЌС‚Рѕ РІР°Р¶РЅРѕ, РїРѕС‚РѕРјСѓ С‡С‚Рѕ С‚Р°РєРёРµ РјРѕРјРµРЅС‚С‹ С‡Р°СЃС‚Рѕ РґР°СЋС‚ СЃРёР»СЊРЅРѕРµ РѕР±СЂР°С‚РЅРѕРµ РґРІРёР¶РµРЅРёРµ.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ false breakout",
      text:
        "False breakout вЂ” СЌС‚Рѕ Р»РѕР¶РЅС‹Р№ РїСЂРѕР±РѕР№ СѓСЂРѕРІРЅСЏ. Р¦РµРЅР° РІС‹С…РѕРґРёС‚ РІС‹С€Рµ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёСЏ РёР»Рё РЅРёР¶Рµ РїРѕРґРґРµСЂР¶РєРё, РЅРѕ РІРјРµСЃС‚Рѕ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ Р±С‹СЃС‚СЂРѕ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ РѕР±СЂР°С‚РЅРѕ РІ РґРёР°РїР°Р·РѕРЅ РёР»Рё РїРѕРґ/РЅР°Рґ СѓСЂРѕРІРµРЅСЊ.",
    },
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ trap",
      text:
        "Trap вЂ” СЌС‚Рѕ Р»РѕРІСѓС€РєР° РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рµ РІРѕС€Р»Рё РЅР° РѕС‡РµРІРёРґРЅС‹Р№ РїСЂРѕР±РѕР№. Р•СЃР»Рё РїРѕСЃР»Рµ РїСЂРѕР±РѕСЏ РЅРµС‚ РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ, СЌС‚Рё С‚СЂРµР№РґРµСЂС‹ РЅР°С‡РёРЅР°СЋС‚ РІС‹С…РѕРґРёС‚СЊ, Р° РёС… РІС‹С…РѕРґ СѓСЃРёР»РёРІР°РµС‚ РґРІРёР¶РµРЅРёРµ РІ РѕР±СЂР°С‚РЅСѓСЋ СЃС‚РѕСЂРѕРЅСѓ.",
    },
    {
      title: "РљР°Рє СЂР°СЃРїРѕР·РЅР°С‚СЊ СЃР»Р°Р±С‹Р№ РїСЂРѕР±РѕР№",
      text:
        "РЎР»Р°Р±С‹Р№ РїСЂРѕР±РѕР№ С‡Р°СЃС‚Рѕ РІС‹РіР»СЏРґРёС‚ С‚Р°Рє: С†РµРЅР° РІС‹С€Р»Р° Р·Р° СѓСЂРѕРІРµРЅСЊ, РЅРѕ РѕР±СЉС‘Рј РЅРµ РїРѕРґРґРµСЂР¶Р°Р» РґРІРёР¶РµРЅРёРµ, СЃРІРµС‡Р° Р·Р°РєСЂС‹Р»Р°СЃСЊ РїР»РѕС…Рѕ, СЃР»РµРґСѓСЋС‰РёР№ РёРјРїСѓР»СЊСЃ РЅРµ РїРѕСЏРІРёР»СЃСЏ, Р° С†РµРЅР° Р±С‹СЃС‚СЂРѕ РІРµСЂРЅСѓР»Р°СЃСЊ РѕР±СЂР°С‚РЅРѕ.",
    },
    {
      title: "РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ trap",
      text:
        "Trap РЅРµ РЅСѓР¶РЅРѕ СѓРіР°РґС‹РІР°С‚СЊ Р·Р°СЂР°РЅРµРµ. Р•РіРѕ РЅСѓР¶РЅРѕ РІРёРґРµС‚СЊ РїРѕ С„Р°РєС‚Сѓ СЂРµР°РєС†РёРё: РїСЂРѕР±РѕР№ Р±С‹Р», РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ РЅРµС‚, РІРѕР·РІСЂР°С‚ РїРѕРґ/РЅР°Рґ СѓСЂРѕРІРµРЅСЊ РїСЂРѕРёР·РѕС€С‘Р», СѓС‡Р°СЃС‚РЅРёРєРё РЅР°С‡РёРЅР°СЋС‚ Р·Р°РєСЂС‹РІР°С‚СЊСЃСЏ. РўРѕР»СЊРєРѕ РїРѕСЃР»Рµ СЌС‚РѕРіРѕ РїРѕСЏРІР»СЏРµС‚СЃСЏ Р»РѕРіРёРєР° СЃРґРµР»РєРё.",
    },
  ],
  checklist: [
    "РќРµ СЃС‡РёС‚Р°Р№ РєР°Р¶РґС‹Р№ РїСЂРѕР±РѕР№ РЅР°СЃС‚РѕСЏС‰РёРј.",
    "РЎРјРѕС‚СЂРё, РµСЃС‚СЊ Р»Рё РїСЂРѕРґРѕР»Р¶РµРЅРёРµ РїРѕСЃР»Рµ СЃРЅСЏС‚РёСЏ СѓСЂРѕРІРЅСЏ.",
    "Р’РѕР·РІСЂР°С‚ РѕР±СЂР°С‚РЅРѕ Р·Р° СѓСЂРѕРІРµРЅСЊ вЂ” РІР°Р¶РЅС‹Р№ СЃРёРіРЅР°Р» СЃР»Р°Р±РѕСЃС‚Рё РїСЂРѕР±РѕСЏ.",
    "Trap Р»СѓС‡С€Рµ С‚РѕСЂРіРѕРІР°С‚СЊ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ, Р° РЅРµ Р·Р°СЂР°РЅРµРµ.",
  ],
},
"trading-psychology-1": {
  intro:
    "РџСЃРёС…РѕР»РѕРіРёСЏ С‚СЂРµР№РґРёРЅРіР° вЂ” СЌС‚Рѕ СЃРїРѕСЃРѕР±РЅРѕСЃС‚СЊ РїСЂРёРЅРёРјР°С‚СЊ СЂРµС€РµРЅРёСЏ РїРѕ РїР»Р°РЅСѓ, РґР°Р¶Рµ РєРѕРіРґР° СЂС‹РЅРѕРє РІС‹Р·С‹РІР°РµС‚ СЃС‚СЂР°С…, Р¶Р°РґРЅРѕСЃС‚СЊ, Р°Р·Р°СЂС‚ РёР»Рё Р¶РµР»Р°РЅРёРµ РѕС‚С‹РіСЂР°С‚СЊСЃСЏ. Р’ С‚СЂРµР№РґРёРЅРіРµ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р·РЅР°С‚СЊ СЃРµС‚Р°Рї: РЅСѓР¶РЅРѕ СѓРјРµС‚СЊ РІС‹РїРѕР»РЅРёС‚СЊ РµРіРѕ СЃРїРѕРєРѕР№РЅРѕ Рё РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕ.",
  blocks: [
    {
      title: "РџРѕС‡РµРјСѓ РїСЃРёС…РѕР»РѕРіРёСЏ РІР»РёСЏРµС‚ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚",
      text:
        "Р”РІРµ РѕРґРёРЅР°РєРѕРІС‹Рµ С‚РѕСЂРіРѕРІС‹Рµ РёРґРµРё РјРѕРіСѓС‚ РґР°С‚СЊ СЂР°Р·РЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ Сѓ СЂР°Р·РЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ. РћРґРёРЅ РІРѕР№РґС‘С‚ РїРѕ РїР»Р°РЅСѓ, РїРѕСЃС‚Р°РІРёС‚ СЃС‚РѕРї Рё РїСЂРёРјРµС‚ СѓР±С‹С‚РѕРє. Р”СЂСѓРіРѕР№ СѓРІРµР»РёС‡РёС‚ РѕР±СЉС‘Рј, РїРµСЂРµРґРІРёРЅРµС‚ СЃС‚РѕРї, СѓСЃСЂРµРґРЅРёС‚СЃСЏ Рё РїСЂРµРІСЂР°С‚РёС‚ РЅРѕСЂРјР°Р»СЊРЅС‹Р№ РјРёРЅСѓСЃ РІ РїСЂРѕР±Р»РµРјСѓ.",
    },
    {
      title: "Р“Р»Р°РІРЅС‹Р№ РІСЂР°Рі вЂ” РЅРµ СЌРјРѕС†РёРё",
      text:
        "Р­РјРѕС†РёРё СЃР°РјРё РїРѕ СЃРµР±Рµ РЅРµ СЏРІР»СЏСЋС‚СЃСЏ РїСЂРѕР±Р»РµРјРѕР№. РџСЂРѕР±Р»РµРјР° РЅР°С‡РёРЅР°РµС‚СЃСЏ, РєРѕРіРґР° С‚СЂРµР№РґРµСЂ РґРµР№СЃС‚РІСѓРµС‚ РїРѕРґ РёС… РІР»РёСЏРЅРёРµРј: РІС…РѕРґРёС‚ Р±РµР· СЃРёРіРЅР°Р»Р°, Р·Р°РєСЂС‹РІР°РµС‚ РїСЂРёР±С‹Р»СЊ СЃР»РёС€РєРѕРј СЂР°РЅРѕ, РґРµСЂР¶РёС‚ СѓР±С‹С‚РѕРє СЃР»РёС€РєРѕРј РґРѕР»РіРѕ РёР»Рё РјСЃС‚РёС‚ СЂС‹РЅРєСѓ РїРѕСЃР»Рµ СЃС‚РѕРїР°.",
    },
    {
      title: "РЎС‚Р°Р±РёР»СЊРЅРѕСЃС‚СЊ РІР°Р¶РЅРµРµ РёРґРµР°Р»СЊРЅРѕРіРѕ РІС…РѕРґР°",
      text:
        "РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅС‹Р№ С‚СЂРµР№РґРµСЂ РЅРµ РїС‹С‚Р°РµС‚СЃСЏ РєР°Р¶РґС‹Р№ СЂР°Р· РїРѕР№РјР°С‚СЊ РёРґРµР°Р»СЊРЅСѓСЋ С‚РѕС‡РєСѓ. РћРЅ СЃС‚СЂРѕРёС‚ РїРѕРІС‚РѕСЂСЏРµРјС‹Р№ РїСЂРѕС†РµСЃСЃ: РїРѕРґРіРѕС‚РѕРІРєР°, СЃС†РµРЅР°СЂРёР№, РІС…РѕРґ, СЂРёСЃРє, СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ, РІС‹С…РѕРґ Рё СЂР°Р·Р±РѕСЂ СЃРґРµР»РєРё.",
    },
    {
      title: "Р§С‚Рѕ Р·РЅР°С‡РёС‚ С‚РѕСЂРіРѕРІР°С‚СЊ РґРёСЃС†РёРїР»РёРЅРёСЂРѕРІР°РЅРЅРѕ",
      text:
        "Р”РёСЃС†РёРїР»РёРЅР° вЂ” СЌС‚Рѕ РЅРµ Р¶С‘СЃС‚РєРѕСЃС‚СЊ СЂР°РґРё Р¶С‘СЃС‚РєРѕСЃС‚Рё. Р­С‚Рѕ СЃРїРѕСЃРѕР±РЅРѕСЃС‚СЊ РґРµР»Р°С‚СЊ РїСЂР°РІРёР»СЊРЅРѕРµ РґРµР№СЃС‚РІРёРµ, РєРѕРіРґР° СЌРјРѕС†РёРѕРЅР°Р»СЊРЅРѕ С…РѕС‡РµС‚СЃСЏ СЃРґРµР»Р°С‚СЊ РґСЂСѓРіРѕРµ. РќР°РїСЂРёРјРµСЂ, Р·Р°РєСЂС‹С‚СЊ СЃРґРµР»РєСѓ РїРѕ СЃС‚РѕРїСѓ, РЅРµ РІС…РѕРґРёС‚СЊ Р±РµР· СЃРµС‚Р°РїР° РёР»Рё Р·Р°РІРµСЂС€РёС‚СЊ РґРµРЅСЊ РїРѕСЃР»Рµ Р»РёРјРёС‚Р°.",
    },
  ],
  checklist: [
    "РќРµ РѕС†РµРЅРёРІР°Р№ СЃРµР±СЏ РїРѕ РѕРґРЅРѕР№ СЃРґРµР»РєРµ.",
    "РћС‚РґРµР»СЏР№ РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёСЏ РѕС‚ СЂРµР·СѓР»СЊС‚Р°С‚Р° СЃРґРµР»РєРё.",
    "РЎР»РµРґРё Р·Р° СЃРѕСЃС‚РѕСЏРЅРёРµРј РґРѕ РІС…РѕРґР°, Р° РЅРµ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СѓР±С‹С‚РєР°.",
    "РќРµ С‚РѕСЂРіСѓР№, РµСЃР»Рё РіР»Р°РІРЅР°СЏ РјРѕС‚РёРІР°С†РёСЏ вЂ” РѕС‚С‹РіСЂР°С‚СЊСЃСЏ.",
  ],
},

"trading-psychology-2": {
  intro:
    "FOMO вЂ” СЌС‚Рѕ СЃС‚СЂР°С… СѓРїСѓСЃС‚РёС‚СЊ РґРІРёР¶РµРЅРёРµ. РћРЅ РїРѕСЏРІР»СЏРµС‚СЃСЏ, РєРѕРіРґР° С†РµРЅР° СЂРµР·РєРѕ РёРґС‘С‚ Р±РµР· С‚РµР±СЏ, Рё РєР°Р¶РµС‚СЃСЏ, С‡С‚Рѕ РµСЃР»Рё РЅРµ РІРѕР№С‚Рё РїСЂСЏРјРѕ СЃРµР№С‡Р°СЃ, РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ РёСЃС‡РµР·РЅРµС‚. Р­С‚Рѕ РѕРґРЅР° РёР· РіР»Р°РІРЅС‹С… РїСЂРёС‡РёРЅ РїРѕР·РґРЅРёС… РІС…РѕРґРѕРІ Рё РїР»РѕС…РѕРіРѕ СЂРёСЃРєР°.",
  blocks: [
    {
      title: "РљР°Рє РІС‹РіР»СЏРґРёС‚ FOMO",
      text:
        "РўСЂРµР№РґРµСЂ РІРёРґРёС‚ СЃРёР»СЊРЅСѓСЋ СЃРІРµС‡Сѓ, СѓСЃРєРѕСЂРµРЅРёРµ, Р·РµР»С‘РЅС‹Р№ PnL Сѓ РґСЂСѓРіРёС… РёР»Рё Р±С‹СЃС‚СЂРѕРµ РґРІРёР¶РµРЅРёРµ РІ Р»РµРЅС‚Рµ Рё РІС…РѕРґРёС‚ Р±РµР· РїР»Р°РЅР°. Р§Р°СЃС‚Рѕ С‚Р°РєРѕР№ РІС…РѕРґ РїСЂРѕРёСЃС…РѕРґРёС‚ РґР°Р»РµРєРѕ РѕС‚ СѓСЂРѕРІРЅСЏ, СЃРѕ СЃР»РёС€РєРѕРј С€РёСЂРѕРєРёРј СЃС‚РѕРїРѕРј Рё Р±РµР· РїРѕРЅСЏС‚РЅРѕРіРѕ СЃС†РµРЅР°СЂРёСЏ РІС‹С…РѕРґР°.",
    },
    {
      title: "РџРѕС‡РµРјСѓ FOMO РѕРїР°СЃРЅРѕ",
      text:
        "РљРѕРіРґР° РІС…РѕРґ РїСЂРѕРёСЃС…РѕРґРёС‚ РёР· СЃС‚СЂР°С…Р° СѓРїСѓСЃС‚РёС‚СЊ, С‚СЂРµР№РґРµСЂ РѕР±С‹С‡РЅРѕ РїРѕРєСѓРїР°РµС‚ С‚Р°Рј, РіРґРµ СЂР°РЅРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРё СѓР¶Рµ С„РёРєСЃРёСЂСѓСЋС‚ РїСЂРёР±С‹Р»СЊ, РёР»Рё С€РѕСЂС‚РёС‚ С‚Р°Рј, РіРґРµ РїСЂРѕРґР°РІС†С‹ СѓР¶Рµ РІС‹РґРѕС…Р»РёСЃСЊ. РЎРґРµР»РєР° СЃСЂР°Р·Сѓ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЌРјРѕС†РёРѕРЅР°Р»СЊРЅРѕР№.",
    },
    {
      title: "РљР°Рє СЃРЅРёР·РёС‚СЊ FOMO",
      text:
        "Р›СѓС‡С€РёР№ СЃРїРѕСЃРѕР± СЃРЅРёР·РёС‚СЊ FOMO вЂ” Р·Р°СЂР°РЅРµРµ Р·РЅР°С‚СЊ СЃРІРѕРё СЃРµС‚Р°РїС‹. Р•СЃР»Рё РґРІРёР¶РµРЅРёРµ РЅРµ РґР°С‘С‚ РІС…РѕРґР° РїРѕ С‚РІРѕРµР№ СЃРёСЃС‚РµРјРµ, РѕРЅРѕ РЅРµ С‚РІРѕС‘. Р С‹РЅРѕРє РєР°Р¶РґС‹Р№ РґРµРЅСЊ РґР°С‘С‚ РЅРѕРІС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё, РЅРѕ РїР»РѕС…РѕР№ РІС…РѕРґ РјРѕР¶РµС‚ РёСЃРїРѕСЂС‚РёС‚СЊ РІРµСЃСЊ РґРµРЅСЊ.",
    },
    {
      title: "Р¤СЂР°Р·Р° РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°",
      text:
        "Р•СЃР»Рё СЏ РЅРµ РїРѕРЅРёРјР°СЋ, РіРґРµ РјРѕР№ СЂРёСЃРє, Р·РЅР°С‡РёС‚ СЌС‚Рѕ РЅРµ РјРѕСЏ СЃРґРµР»РєР°. Р›СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ РґРІРёР¶РµРЅРёРµ, С‡РµРј РІРѕР№С‚Рё РїРѕР·РґРЅРѕ Рё РїРѕС‚РµСЂСЏС‚СЊ РєРѕРЅС‚СЂРѕР»СЊ.",
    },
  ],
  checklist: [
    "РќРµ РІС…РѕРґРё С‚РѕР»СЊРєРѕ РїРѕС‚РѕРјСѓ, С‡С‚Рѕ С†РµРЅР° Р±С‹СЃС‚СЂРѕ РґРІРёР¶РµС‚СЃСЏ.",
    "РџРµСЂРµРґ РІС…РѕРґРѕРј РѕС‚РІРµС‚СЊ: РіРґРµ СЃС‚РѕРї Рё РїРѕС‡РµРјСѓ РёРјРµРЅРЅРѕ С‚Р°Рј?",
    "Р•СЃР»Рё РІС…РѕРґ РґР°Р»РµРєРѕ РѕС‚ СѓСЂРѕРІРЅСЏ вЂ” Р±СѓРґСЊ РѕСЃРѕР±РµРЅРЅРѕ РѕСЃС‚РѕСЂРѕР¶РµРЅ.",
    "РџСЂРѕРїСѓС‰РµРЅРЅР°СЏ СЃРґРµР»РєР° Р»СѓС‡С€Рµ РёРјРїСѓР»СЊСЃРёРІРЅРѕР№ СЃРґРµР»РєРё.",
  ],
},

"trading-psychology-3": {
  intro:
    "Revenge trading вЂ” СЌС‚Рѕ РїРѕРїС‹С‚РєР° РѕС‚С‹РіСЂР°С‚СЊСЃСЏ РїРѕСЃР»Рµ СѓР±С‹С‚РєР°. Р’ СЌС‚РѕС‚ РјРѕРјРµРЅС‚ С‚СЂРµР№РґРµСЂ С‚РѕСЂРіСѓРµС‚ РЅРµ СЂС‹РЅРѕРє, Р° СЃРІРѕСЋ СЌРјРѕС†РёСЋ: Р·Р»РѕСЃС‚СЊ, РѕР±РёРґСѓ, Р¶РµР»Р°РЅРёРµ РґРѕРєР°Р·Р°С‚СЊ СЃРµР±Рµ, С‡С‚Рѕ РѕРЅ РїСЂР°РІ, РёР»Рё РІРµСЂРЅСѓС‚СЊ РґРµРЅСЊ РІ РїР»СЋСЃ Р»СЋР±РѕР№ С†РµРЅРѕР№.",
  blocks: [
    {
      title: "РљР°Рє РЅР°С‡РёРЅР°РµС‚СЃСЏ revenge trading",
      text:
        "РћР±С‹С‡РЅРѕ РІСЃС‘ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ РЅРѕСЂРјР°Р»СЊРЅРѕРіРѕ СЃС‚РѕРїР°. РќРѕ С‚СЂРµР№РґРµСЂ РІРѕСЃРїСЂРёРЅРёРјР°РµС‚ РµРіРѕ РєР°Рє Р»РёС‡РЅСѓСЋ РѕС€РёР±РєСѓ, СЃСЂР°Р·Сѓ РёС‰РµС‚ РЅРѕРІС‹Р№ РІС…РѕРґ, СѓРІРµР»РёС‡РёРІР°РµС‚ РѕР±СЉС‘Рј РёР»Рё РІС…РѕРґРёС‚ РІ СЃР»Р°Р±С‹Р№ СЃРµС‚Р°Рї, С‡С‚РѕР±С‹ Р±С‹СЃС‚СЂРѕ РІРµСЂРЅСѓС‚СЊ РїРѕС‚РµСЂСЏРЅРЅРѕРµ.",
    },
    {
      title: "РџРѕС‡РµРјСѓ СЌС‚Рѕ СЂР°Р·СЂСѓС€Р°РµС‚ СЃРёСЃС‚РµРјСѓ",
      text:
        "Revenge trading Р»РѕРјР°РµС‚ СЃС‚Р°С‚РёСЃС‚РёРєСѓ. Р’РјРµСЃС‚Рѕ Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРЅС‹С… СЃРґРµР»РѕРє РїРѕСЏРІР»СЏСЋС‚СЃСЏ С…Р°РѕС‚РёС‡РЅС‹Рµ РІС…РѕРґС‹. Р РёСЃРє СѓРІРµР»РёС‡РёРІР°РµС‚СЃСЏ, РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№ РїР°РґР°РµС‚, Р° РґРЅРµРІРЅРѕР№ СѓР±С‹С‚РѕРє РјРѕР¶РµС‚ СЃС‚Р°С‚СЊ РЅР°РјРЅРѕРіРѕ Р±РѕР»СЊС€Рµ РёР·РЅР°С‡Р°Р»СЊРЅРѕ РґРѕРїСѓСЃС‚РёРјРѕРіРѕ.",
    },
    {
      title: "РљР°Рє РѕСЃС‚Р°РЅРѕРІРёС‚СЊ РѕС‚С‹РіСЂС‹С€",
      text:
        "РќСѓР¶РЅРѕ РёРјРµС‚СЊ Р·Р°СЂР°РЅРµРµ РїСЂРѕРїРёСЃР°РЅРЅРѕРµ РїСЂР°РІРёР»Рѕ: РїРѕСЃР»Рµ РґРІСѓС… РѕС€РёР±РѕРє РїРѕРґСЂСЏРґ, РЅР°СЂСѓС€РµРЅРёСЏ СЃС‚РѕРїР° РёР»Рё РґРѕСЃС‚РёР¶РµРЅРёСЏ РґРЅРµРІРЅРѕРіРѕ Р»РёРјРёС‚Р° С‚РѕСЂРіРѕРІР»СЏ РїСЂРµРєСЂР°С‰Р°РµС‚СЃСЏ. Р­С‚Рѕ РЅРµ СЃР»Р°Р±РѕСЃС‚СЊ, Р° Р·Р°С‰РёС‚Р° РєР°РїРёС‚Р°Р»Р° Рё РїСЃРёС…РёРєРё.",
    },
    {
      title: "Р§С‚Рѕ РґРµР»Р°С‚СЊ РїРѕСЃР»Рµ РїР»РѕС…РѕР№ СЃРґРµР»РєРё",
      text:
        "РџРѕСЃР»Рµ РїР»РѕС…РѕР№ СЃРґРµР»РєРё РЅСѓР¶РЅРѕ РЅРµ РёСЃРєР°С‚СЊ СЃСЂРѕС‡РЅС‹Р№ РЅРѕРІС‹Р№ РІС…РѕРґ, Р° РєРѕСЂРѕС‚РєРѕ Р·Р°РїРёСЃР°С‚СЊ: Р±С‹Р» Р»Рё СЃРµС‚Р°Рї, Р±С‹Р» Р»Рё СЂРёСЃРє, Р±С‹Р» Р»Рё РІС…РѕРґ РїРѕ РїР»Р°РЅСѓ, С‡С‚Рѕ РёРјРµРЅРЅРѕ РЅР°СЂСѓС€РµРЅРѕ. РўРѕР»СЊРєРѕ РїРѕСЃР»Рµ СЌС‚РѕРіРѕ РјРѕР¶РЅРѕ РїСЂРёРЅРёРјР°С‚СЊ СЃР»РµРґСѓСЋС‰РµРµ СЂРµС€РµРЅРёРµ.",
    },
  ],
  checklist: [
    "РџРѕСЃР»Рµ СЃС‚РѕРїР° РЅРµ РѕС‚РєСЂС‹РІР°Р№ РЅРѕРІСѓСЋ СЃРґРµР»РєСѓ СЃСЂР°Р·Сѓ РЅР° СЌРјРѕС†РёСЏС….",
    "РќРµ СѓРІРµР»РёС‡РёРІР°Р№ РѕР±СЉС‘Рј, С‡С‚РѕР±С‹ РІРµСЂРЅСѓС‚СЊ СѓР±С‹С‚РѕРє Р±С‹СЃС‚СЂРµРµ.",
    "РћСЃС‚Р°РЅРѕРІРёСЃСЊ РїРѕСЃР»Рµ РЅР°СЂСѓС€РµРЅРёСЏ РїСЂР°РІРёР».",
    "Р Р°Р·Р±РёСЂР°Р№ РѕС€РёР±РєСѓ РїРёСЃСЊРјРµРЅРЅРѕ, Р° РЅРµ С‡РµСЂРµР· РЅРѕРІСѓСЋ СЃРґРµР»РєСѓ.",
  ],
},

"trading-psychology-4": {
  intro:
    "Р”РёСЃС†РёРїР»РёРЅР° РІ С‚СЂРµР№РґРёРЅРіРµ СЃС‚СЂРѕРёС‚СЃСЏ РЅРµ РЅР° РјРѕС‚РёРІР°С†РёРё, Р° РЅР° РїСЂРѕС†РµСЃСЃРµ. РњРѕС‚РёРІР°С†РёСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ РІС‹СЃРѕРєРѕР№ СѓС‚СЂРѕРј Рё РёСЃС‡РµР·РЅСѓС‚СЊ РїРѕСЃР»Рµ РґРІСѓС… СЃС‚РѕРїРѕРІ. РџСЂРѕС†РµСЃСЃ РЅСѓР¶РµРЅ, С‡С‚РѕР±С‹ С‚СЂРµР№РґРµСЂ Р·РЅР°Р», С‡С‚Рѕ РґРµР»Р°С‚СЊ РЅРµР·Р°РІРёСЃРёРјРѕ РѕС‚ СЌРјРѕС†РёР№.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ С‚РѕСЂРіРѕРІС‹Р№ РїСЂРѕС†РµСЃСЃ",
      text:
        "РўРѕСЂРіРѕРІС‹Р№ РїСЂРѕС†РµСЃСЃ вЂ” СЌС‚Рѕ РїРѕРІС‚РѕСЂСЏРµРјР°СЏ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕСЃС‚СЊ РґРµР№СЃС‚РІРёР№: РїРѕРґРіРѕС‚РѕРІРєР°, РІС‹Р±РѕСЂ С‚РёРєРµСЂРѕРІ, СѓСЂРѕРІРЅРё, СЃС†РµРЅР°СЂРёРё, СЂРёСЃРє, РІС…РѕРґ, СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ, РІС‹С…РѕРґ Рё СЂР°Р·Р±РѕСЂ. Р§РµРј РїРѕРЅСЏС‚РЅРµРµ РїСЂРѕС†РµСЃСЃ, С‚РµРј РјРµРЅСЊС€Рµ РјРµСЃС‚Р° РґР»СЏ С…Р°РѕСЃР°.",
    },
    {
      title: "РџРѕС‡РµРјСѓ РґРЅРµРІРЅРёРє РѕР±СЏР·Р°С‚РµР»РµРЅ",
      text:
        "Р‘РµР· РґРЅРµРІРЅРёРєР° С‚СЂРµР№РґРµСЂ С‡Р°СЃС‚Рѕ РїРѕРјРЅРёС‚ С‚РѕР»СЊРєРѕ СЏСЂРєРёРµ СЃРґРµР»РєРё: Р±РѕР»СЊС€РёРµ РїР»СЋСЃС‹, РѕР±РёРґРЅС‹Рµ РјРёРЅСѓСЃС‹ Рё СѓРїСѓС‰РµРЅРЅС‹Рµ РґРІРёР¶РµРЅРёСЏ. Р”РЅРµРІРЅРёРє РїРѕРєР°Р·С‹РІР°РµС‚ СЂРµР°Р»СЊРЅСѓСЋ СЃС‚Р°С‚РёСЃС‚РёРєСѓ: РіРґРµ РµСЃС‚СЊ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ, РіРґРµ РѕС€РёР±РєРё РїРѕРІС‚РѕСЂСЏСЋС‚СЃСЏ, РєР°РєРёРµ СЃРµС‚Р°РїС‹ СЂР°Р±РѕС‚Р°СЋС‚ Р»СѓС‡С€Рµ.",
    },
    {
      title: "РљР°Рє С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ РґРёСЃС†РёРїР»РёРЅР°",
      text:
        "Р”РёСЃС†РёРїР»РёРЅР° С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ С‡РµСЂРµР· РїРѕРІС‚РѕСЂРµРЅРёРµ РјР°Р»РµРЅСЊРєРёС… РїСЂР°РІРёР». РќРµ РЅР°СЂСѓС€РёС‚СЊ СЃС‚РѕРї. РќРµ РІС…РѕРґРёС‚СЊ Р±РµР· СѓСЂРѕРІРЅСЏ. РќРµ СѓРІРµР»РёС‡РёРІР°С‚СЊ СЂРёСЃРє РїРѕСЃР»Рµ РјРёРЅСѓСЃР°. Р—Р°РІРµСЂС€РёС‚СЊ РґРµРЅСЊ РїРѕСЃР»Рµ Р»РёРјРёС‚Р°. Р­С‚Рё РґРµР№СЃС‚РІРёСЏ СЃРѕР·РґР°СЋС‚ РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅРѕРµ РїРѕРІРµРґРµРЅРёРµ.",
    },
    {
      title: "РљР°Рє РѕС†РµРЅРёРІР°С‚СЊ РґРµРЅСЊ",
      text:
        "Р”РµРЅСЊ РЅСѓР¶РЅРѕ РѕС†РµРЅРёРІР°С‚СЊ РЅРµ С‚РѕР»СЊРєРѕ РїРѕ PnL. Р’Р°Р¶РЅРѕ СЃРјРѕС‚СЂРµС‚СЊ, Р±С‹Р»Рё Р»Рё СЃРґРµР»РєРё РїРѕ РїР»Р°РЅСѓ, СЃРѕР±Р»СЋРґР°Р»СЃСЏ Р»Рё СЂРёСЃРє, РЅРµ Р±С‹Р»Рѕ Р»Рё РёРјРїСѓР»СЊСЃРёРІРЅС‹С… РІС…РѕРґРѕРІ, РЅР°СЃРєРѕР»СЊРєРѕ С…РѕСЂРѕС€Рѕ С‚СЂРµР№РґРµСЂ РІС‹РїРѕР»РЅРёР» СЃРІРѕР№ РїСЂРѕС†РµСЃСЃ.",
    },
  ],
  checklist: [
    "РџРµСЂРµРґ СЃРµСЃСЃРёРµР№ РїРѕРґРіРѕС‚РѕРІСЊ СЃС†РµРЅР°СЂРёРё.",
    "РџРѕСЃР»Рµ СЃРґРµР»РєРё Р·Р°РїРёС€Рё РїСЂРёС‡РёРЅСѓ РІС…РѕРґР° Рё РІС‹С…РѕРґР°.",
    "РћС†РµРЅРё РґРµРЅСЊ РїРѕ РєР°С‡РµСЃС‚РІСѓ СЂРµС€РµРЅРёР№, Р° РЅРµ С‚РѕР»СЊРєРѕ РїРѕ PnL.",
    "Р”РёСЃС†РёРїР»РёРЅР° вЂ” СЌС‚Рѕ РїРѕРІС‚РѕСЂСЏРµРјС‹Р№ РїСЂРѕС†РµСЃСЃ, Р° РЅРµ РЅР°СЃС‚СЂРѕРµРЅРёРµ.",
  ],
},
"playbook-setups-1": {
  intro:
    "Playbook вЂ” СЌС‚Рѕ Р»РёС‡РЅР°СЏ Р±РёР±Р»РёРѕС‚РµРєР° С‚РѕСЂРіРѕРІС‹С… СЃС†РµРЅР°СЂРёРµРІ. РћРЅ РЅСѓР¶РµРЅ, С‡С‚РѕР±С‹ С‚СЂРµР№РґРµСЂ РЅРµ РІС…РѕРґРёР» СЃР»СѓС‡Р°Р№РЅРѕ, Р° СЂР°Р±РѕС‚Р°Р» РїРѕ РїРѕРІС‚РѕСЂСЏРµРјС‹Рј СЃРёС‚СѓР°С†РёСЏРј: С‡С‚Рѕ РёС‰РµРј, РіРґРµ РІС…РѕРґ, РіРґРµ СЂРёСЃРє, РіРґРµ РІС‹С…РѕРґ Рё РєРѕРіРґР° СЃРµС‚Р°Рї Р»СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ С‚РѕСЂРіРѕРІС‹Р№ СЃРµС‚Р°Рї",
      text:
        "РЎРµС‚Р°Рї вЂ” СЌС‚Рѕ РїРѕРІС‚РѕСЂСЏРµРјР°СЏ СЂС‹РЅРѕС‡РЅР°СЏ СЃРёС‚СѓР°С†РёСЏ, РіРґРµ Сѓ С‚СЂРµР№РґРµСЂР° РµСЃС‚СЊ РїРѕРЅСЏС‚РЅР°СЏ Р»РѕРіРёРєР° РІС…РѕРґР°, СЃС‚РѕРїР°, С†РµР»Рё Рё СѓРїСЂР°РІР»РµРЅРёСЏ РїРѕР·РёС†РёРµР№. РЎРµС‚Р°Рї РЅРµ РѕР·РЅР°С‡Р°РµС‚ РіР°СЂР°РЅС‚РёСЋ РїСЂРёР±С‹Р»Рё, РЅРѕ РґР°С‘С‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ РґР»СЏ РїСЂРёРЅСЏС‚РёСЏ СЂРµС€РµРЅРёСЏ.",
    },
    {
      title: "Р—Р°С‡РµРј РЅСѓР¶РµРЅ playbook",
      text:
        "Р‘РµР· playbook С‚СЂРµР№РґРµСЂ РєР°Р¶РґС‹Р№ РґРµРЅСЊ С‚РѕСЂРіСѓРµС‚ РїРѕ-СЂР°Р·РЅРѕРјСѓ. РЎРµРіРѕРґРЅСЏ РїСЂРѕР±РѕР№, Р·Р°РІС‚СЂР° РѕС‚РєР°С‚, РїРѕСЃР»РµР·Р°РІС‚СЂР° РЅРѕРІРѕСЃС‚СЊ, РїРѕС‚РѕРј РёРЅС‚СѓРёС‚РёРІРЅС‹Р№ РІС…РѕРґ. Playbook РїРѕРјРѕРіР°РµС‚ СЃСѓР·РёС‚СЊ С„РѕРєСѓСЃ Рё РїРѕРЅСЏС‚СЊ, РєР°РєРёРµ СЃС†РµРЅР°СЂРёРё СЂРµР°Р»СЊРЅРѕ РґР°СЋС‚ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ.",
    },
    {
      title: "Р§С‚Рѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ РѕРїРёСЃР°РЅРёРё СЃРµС‚Р°РїР°",
      text:
        "Р’ С…РѕСЂРѕС€РµРј РѕРїРёСЃР°РЅРёРё СЃРµС‚Р°РїР° РµСЃС‚СЊ РєРѕРЅС‚РµРєСЃС‚, СѓСЃР»РѕРІРёСЏ РѕС‚Р±РѕСЂР°, С‚СЂРёРіРіРµСЂ РІС…РѕРґР°, РјРµСЃС‚Рѕ СЃС‚РѕРїР°, С†РµР»СЊ, invalidation, РѕС€РёР±РєРё, РїСЂРёРјРµСЂС‹ С…РѕСЂРѕС€РёС… Рё РїР»РѕС…РёС… СЃРґРµР»РѕРє. Р§РµРј РєРѕРЅРєСЂРµС‚РЅРµРµ РѕРїРёСЃР°РЅРёРµ, С‚РµРј Р»РµРіС‡Рµ РїРѕРІС‚РѕСЂСЏС‚СЊ СЃРµС‚Р°Рї.",
    },
    {
      title: "РљР°Рє AI Р±СѓРґРµС‚ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ playbook",
      text:
        "Р’ Р±СѓРґСѓС‰РµРј SkillEdge AI СЃРјРѕР¶РµС‚ СЃСЂР°РІРЅРёРІР°С‚СЊ СЃРґРµР»РєРё РєР»РёРµРЅС‚Р° СЃ РµРіРѕ Р»СѓС‡С€РёРјРё СЃРµС‚Р°РїР°РјРё: Р±С‹Р» Р»Рё РєРѕРЅС‚РµРєСЃС‚, Р±С‹Р» Р»Рё РїСЂР°РІРёР»СЊРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ, РЅРµ Р±С‹Р» Р»Рё РІС…РѕРґ РїРѕР·РґРЅРёРј, СЃРѕРІРїР°РґР°Р» Р»Рё СЂРёСЃРє СЃ РїСЂР°РІРёР»Р°РјРё Рё РіРґРµ С‚СЂРµР№РґРµСЂ РѕС‚РєР»РѕРЅРёР»СЃСЏ РѕС‚ РїР»Р°РЅР°.",
    },
  ],
  checklist: [
    "РћРїРёС€Рё СЃРµС‚Р°Рї РїСЂРѕСЃС‚С‹РјРё СЃР»РѕРІР°РјРё.",
    "РЈРєР°Р¶Рё СѓСЃР»РѕРІРёСЏ, РїСЂРё РєРѕС‚РѕСЂС‹С… СЃРµС‚Р°Рї СЃС‡РёС‚Р°РµС‚СЃСЏ СЂР°Р±РѕС‡РёРј.",
    "Р—Р°РїРёС€Рё, РіРґРµ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃС‚РѕРї Рё РїРѕС‡РµРјСѓ.",
    "Р”РѕР±Р°РІР»СЏР№ СЂРµР°Р»СЊРЅС‹Рµ РїСЂРёРјРµСЂС‹ СЃРґРµР»РѕРє РІ playbook.",
  ],
},

"playbook-setups-2": {
  intro:
    "РљРѕРЅС‚РµРєСЃС‚ вЂ” СЌС‚Рѕ СЂС‹РЅРѕС‡РЅР°СЏ РѕР±СЃС‚Р°РЅРѕРІРєР° РІРѕРєСЂСѓРі СЃРґРµР»РєРё. РћРґРёРЅ Рё С‚РѕС‚ Р¶Рµ РІС…РѕРґ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃРёР»СЊРЅС‹Рј РёР»Рё СЃР»Р°Р±С‹Рј РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ РіСЌРїР°, РѕР±СЉС‘РјР°, РЅРѕРІРѕСЃС‚Рё, СЂС‹РЅРєР°, С‚Р°Р№РјС„СЂРµР№РјР°, СѓСЂРѕРІРЅСЏ Рё РїРѕРІРµРґРµРЅРёСЏ С†РµРЅС‹ РґРѕ РІС…РѕРґР°.",
  blocks: [
    {
      title: "РџРѕС‡РµРјСѓ РєРѕРЅС‚РµРєСЃС‚ РІР°Р¶РЅРµРµ РїР°С‚С‚РµСЂРЅР°",
      text:
        "РџР°С‚С‚РµСЂРЅ Р±РµР· РєРѕРЅС‚РµРєСЃС‚Р° С‡Р°СЃС‚Рѕ РѕР±РјР°РЅС‹РІР°РµС‚. РџСЂРѕР±РѕР№ СѓСЂРѕРІРЅСЏ РїРѕСЃР»Рµ СЃРёР»СЊРЅРѕРіРѕ РіСЌРїР° Рё РѕР±СЉС‘РјР° вЂ” СЌС‚Рѕ РѕРґРЅРѕ. РўР°РєРѕР№ Р¶Рµ РїСЂРѕР±РѕР№ РІ СЃРµСЂРµРґРёРЅРµ С‚РёС…РѕРіРѕ РґРЅСЏ Р±РµР· РѕР±СЉС‘РјР° вЂ” СЃРѕРІСЃРµРј РґСЂСѓРіРѕРµ. РљРѕРЅС‚РµРєСЃС‚ РїРѕРєР°Р·С‹РІР°РµС‚, РµСЃС‚СЊ Р»Рё РїСЂРёС‡РёРЅР° РґР»СЏ РґРІРёР¶РµРЅРёСЏ.",
    },
    {
      title: "РљР°РєРёРµ СЌР»РµРјРµРЅС‚С‹ РєРѕРЅС‚РµРєСЃС‚Р° СЃРјРѕС‚СЂРµС‚СЊ",
      text:
        "РџРµСЂРµРґ СЃРґРµР»РєРѕР№ РІР°Р¶РЅРѕ СЃРјРѕС‚СЂРµС‚СЊ catalyst, gap %, relative volume, premarket high/low, VWAP, РѕР±С‰РёР№ СЂС‹РЅРѕРє, СЃРµРєС‚РѕСЂ, С‚СЂРµРЅРґ/СЂРµРЅР¶, СЂР°СЃСЃС‚РѕСЏРЅРёРµ РґРѕ СѓСЂРѕРІРЅРµР№ Рё РєР°С‡РµСЃС‚РІРѕ РїСЂРµРґС‹РґСѓС‰РµРіРѕ РґРІРёР¶РµРЅРёСЏ.",
    },
    {
      title: "РљРѕРЅС‚РµРєСЃС‚ РґР»СЏ long Рё short",
      text:
        "Р”Р»СЏ long РІР°Р¶РЅРѕ РїРѕРЅРёРјР°С‚СЊ, РµСЃС‚СЊ Р»Рё СЃРїСЂРѕСЃ, СѓРґРµСЂР¶РёРІР°СЋС‚СЃСЏ Р»Рё РѕС‚РєР°С‚С‹, РµСЃС‚СЊ Р»Рё РјРµСЃС‚Рѕ РґРѕ СЃРѕРїСЂРѕС‚РёРІР»РµРЅРёСЏ. Р”Р»СЏ short РІР°Р¶РЅРѕ РїРѕРЅРёРјР°С‚СЊ, РµСЃС‚СЊ Р»Рё СЃР»Р°Р±РѕСЃС‚СЊ, СЃР»РѕРј СЃС‚СЂСѓРєС‚СѓСЂС‹, failed breakout, РґР°РІР»РµРЅРёРµ РїСЂРѕРґР°РІС†РѕРІ Рё РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ РІРЅРёР·.",
    },
    {
      title: "РљРѕРіРґР° СЃРµС‚Р°Рї Р»СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ",
      text:
        "Р•СЃР»Рё РєРѕРЅС‚РµРєСЃС‚ СЃР»Р°Р±С‹Р№, РѕР±СЉС‘Рј РЅРёР·РєРёР№, СѓСЂРѕРІРµРЅСЊ РЅРµРѕС‡РµРІРёРґРЅС‹Р№, РґРІРёР¶РµРЅРёРµ СѓР¶Рµ СЂР°СЃС‚СЏРЅСѓС‚Рѕ, Р° СЂРёСЃРє С€РёСЂРѕРєРёР№ вЂ” Р»СѓС‡С€Рµ РїСЂРѕРїСѓСЃС‚РёС‚СЊ. РҐРѕСЂРѕС€РёР№ С‚СЂРµР№РґРёРЅРі С‡Р°СЃС‚Рѕ СЃС‚СЂРѕРёС‚СЃСЏ РЅРµ С‚РѕР»СЊРєРѕ РЅР° РІС…РѕРґР°С…, РЅРѕ Рё РЅР° РѕС‚РєР°Р·Рµ РѕС‚ РїР»РѕС…РёС… СЃРґРµР»РѕРє.",
    },
  ],
  checklist: [
    "РџРµСЂРµРґ РІС…РѕРґРѕРј РїСЂРѕРІРµСЂСЊ catalyst РёР»Рё РїСЂРёС‡РёРЅСѓ РґРІРёР¶РµРЅРёСЏ.",
    "РЎСЂР°РІРЅРё С‚РµРєСѓС‰РёР№ РѕР±СЉС‘Рј СЃ РѕР±С‹С‡РЅС‹Рј РѕР±СЉС‘РјРѕРј.",
    "РћС†РµРЅРё, РµСЃС‚СЊ Р»Рё РјРµСЃС‚Рѕ РґРѕ Р±Р»РёР¶Р°Р№С€РµР№ С†РµР»Рё.",
    "РќРµ С‚РѕСЂРіСѓР№ РїР°С‚С‚РµСЂРЅ РѕС‚РґРµР»СЊРЅРѕ РѕС‚ РєРѕРЅС‚РµРєСЃС‚Р°.",
  ],
},

"playbook-setups-3": {
  intro:
    "Entry trigger вЂ” СЌС‚Рѕ РєРѕРЅРєСЂРµС‚РЅС‹Р№ РјРѕРјРµРЅС‚, РєРѕРіРґР° С‚СЂРµР№РґРµСЂ РїРѕР»СѓС‡Р°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РґР»СЏ РІС…РѕРґР°. РҐРѕСЂРѕС€РёР№ trigger РїРѕРјРѕРіР°РµС‚ РЅРµ РІС…РѕРґРёС‚СЊ СЃР»РёС€РєРѕРј СЂР°РЅРѕ, РЅРµ РіРЅР°С‚СЊСЃСЏ Р·Р° С†РµРЅРѕР№ Рё РїСЂРёРІСЏР·Р°С‚СЊ СЃРґРµР»РєСѓ Рє РїРѕРЅСЏС‚РЅРѕРјСѓ СЂРёСЃРєСѓ.",
  blocks: [
    {
      title: "Р§С‚Рѕ С‚Р°РєРѕРµ trigger",
      text:
        "Trigger вЂ” СЌС‚Рѕ РЅРµ РїСЂРѕСЃС‚Рѕ Р¶РµР»Р°РЅРёРµ РІРѕР№С‚Рё. Р­С‚Рѕ РєРѕРЅРєСЂРµС‚РЅРѕРµ РґРµР№СЃС‚РІРёРµ С†РµРЅС‹: РїСЂРѕР±РѕР№ Рё СѓРґРµСЂР¶Р°РЅРёРµ СѓСЂРѕРІРЅСЏ, РѕС‚РєР°С‚ Рє VWAP, РІРѕР·РІСЂР°С‚ РїРѕСЃР»Рµ false breakout, СѓСЃРєРѕСЂРµРЅРёРµ РѕР±СЉС‘РјР°, reclaim СѓСЂРѕРІРЅСЏ РёР»Рё rejection РѕС‚ Р·РѕРЅС‹.",
    },
    {
      title: "РџРѕС‡РµРјСѓ РЅРµР»СЊР·СЏ РІС…РѕРґРёС‚СЊ С‚РѕР»СЊРєРѕ РїРѕ РёРґРµРµ",
      text:
        "РРґРµСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂР°РІРёР»СЊРЅРѕР№, РЅРѕ РІС…РѕРґ СЃР»РёС€РєРѕРј СЂР°РЅРЅРёРј РёР»Рё РїРѕР·РґРЅРёРј. РќР°РїСЂРёРјРµСЂ, Р°РєС†РёСЏ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃР»Р°Р±РѕР№, РЅРѕ РµСЃР»Рё С€РѕСЂС‚РёС‚СЊ РІРЅРёР·Сѓ РїРѕСЃР»Рµ СЃРёР»СЊРЅРѕРіРѕ РїР°РґРµРЅРёСЏ, СЂРёСЃРє СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РїР»РѕС…РёРј. Trigger РЅСѓР¶РµРЅ, С‡С‚РѕР±С‹ РёРґРµСЏ СЃС‚Р°Р»Р° СЃРґРµР»РєРѕР№.",
    },
    {
      title: "РџСЂРёРјРµСЂС‹ С‚СЂРёРіРіРµСЂРѕРІ",
      text:
        "Р”Р»СЏ continuation trigger РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРѕР±РѕР№ Р»РѕРєР°Р»СЊРЅРѕРіРѕ high РїРѕСЃР»Рµ РїР°СѓР·С‹. Р”Р»СЏ trap вЂ” РІРѕР·РІСЂР°С‚ РѕР±СЂР°С‚РЅРѕ РїРѕРґ СѓСЂРѕРІРµРЅСЊ РїРѕСЃР»Рµ Р»РѕР¶РЅРѕРіРѕ РїСЂРѕР±РѕСЏ. Р”Р»СЏ pullback вЂ” СѓРґРµСЂР¶Р°РЅРёРµ Р·РѕРЅС‹ Рё РїРѕСЏРІР»РµРЅРёРµ СЂРµР°РєС†РёРё РІ СЃС‚РѕСЂРѕРЅСѓ С‚СЂРµРЅРґР°.",
    },
    {
      title: "Trigger Рё СЃС‚РѕРї",
      text:
        "РҐРѕСЂРѕС€РёР№ trigger РїРѕС‡С‚Рё РІСЃРµРіРґР° РґР°С‘С‚ РїРѕРЅСЏС‚РЅРѕРµ РјРµСЃС‚Рѕ РґР»СЏ СЃС‚РѕРїР°. Р•СЃР»Рё РїРѕСЃР»Рµ РІС…РѕРґР° РЅРµРїРѕРЅСЏС‚РЅРѕ, РіРґРµ СЃС†РµРЅР°СЂРёР№ СЃР»РѕРјР°РЅ, Р·РЅР°С‡РёС‚ trigger Р±С‹Р» СЃР»Р°Р±С‹Рј РёР»Рё СЃРґРµР»РєР° РІС‹Р±СЂР°РЅР° РЅРµРїСЂР°РІРёР»СЊРЅРѕ.",
    },
  ],
  checklist: [
    "РџРµСЂРµРґ РІС…РѕРґРѕРј РЅР°Р·РѕРІРё РєРѕРЅРєСЂРµС‚РЅС‹Р№ trigger.",
    "РќРµ РїСѓС‚Р°Р№ С‚РѕСЂРіРѕРІСѓСЋ РёРґРµСЋ Рё СЃРёРіРЅР°Р» РІС…РѕРґР°.",
    "РџСЂРѕРІРµСЂСЊ, РґР°С‘С‚ Р»Рё trigger РїРѕРЅСЏС‚РЅС‹Р№ СЃС‚РѕРї.",
    "Р•СЃР»Рё trigger РЅРµ РїРѕСЏРІРёР»СЃСЏ вЂ” СЃРґРµР»РєРё РЅРµС‚.",
  ],
},

"playbook-setups-4": {
  intro:
    "Р Р°Р·Р±РѕСЂ СЃРґРµР»РѕРє РїСЂРµРІСЂР°С‰Р°РµС‚ РѕРїС‹С‚ РІ СЃРёСЃС‚РµРјСѓ. Р•СЃР»Рё РїСЂРѕСЃС‚Рѕ С‚РѕСЂРіРѕРІР°С‚СЊ Рё РЅРµ Р°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ, РѕС€РёР±РєРё РїРѕРІС‚РѕСЂСЏСЋС‚СЃСЏ. Р•СЃР»Рё С„РёРєСЃРёСЂРѕРІР°С‚СЊ РІС…РѕРґС‹, РІС‹С…РѕРґС‹, РєРѕРЅС‚РµРєСЃС‚ Рё СЌРјРѕС†РёРё, РїРѕСЃС‚РµРїРµРЅРЅРѕ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РІРёРґРЅРѕ, РєР°РєРёРµ СЃРµС‚Р°РїС‹ СЂР°Р±РѕС‚Р°СЋС‚, Р° РєР°РєРёРµ Р»РѕРјР°СЋС‚ СЂРµР·СѓР»СЊС‚Р°С‚.",
  blocks: [
    {
      title: "Р§С‚Рѕ СЃРјРѕС‚СЂРµС‚СЊ РІ СЂР°Р·Р±РѕСЂРµ СЃРґРµР»РєРё",
      text:
        "Р’ СЂР°Р·Р±РѕСЂРµ РІР°Р¶РЅРѕ СЃРјРѕС‚СЂРµС‚СЊ РЅРµ С‚РѕР»СЊРєРѕ PnL. РќСѓР¶РЅРѕ РїРѕРЅСЏС‚СЊ, Р±С‹Р» Р»Рё СЃРµС‚Р°Рї, Р±С‹Р» Р»Рё РєРѕРЅС‚РµРєСЃС‚, РіРґРµ Р±С‹Р» РІС…РѕРґ, РіРґРµ Р±С‹Р» СЃС‚РѕРї, Р±С‹Р»Р° Р»Рё С†РµР»СЊ, СЃРѕР±Р»СЋРґР°Р»СЃСЏ Р»Рё СЂРёСЃРє Рё Р±С‹Р»Рѕ Р»Рё РѕС‚РєР»РѕРЅРµРЅРёРµ РѕС‚ РїР»Р°РЅР°.",
    },
    {
      title: "РҐРѕСЂРѕС€Р°СЏ СѓР±С‹С‚РѕС‡РЅР°СЏ СЃРґРµР»РєР°",
      text:
        "РЎРґРµР»РєР° РјРѕР¶РµС‚ Р±С‹С‚СЊ СѓР±С‹С‚РѕС‡РЅРѕР№, РЅРѕ РїСЂР°РІРёР»СЊРЅРѕР№, РµСЃР»Рё РІС…РѕРґ Р±С‹Р» РїРѕ СЃРµС‚Р°РїСѓ, СЂРёСЃРє СЃРѕР±Р»СЋРґС‘РЅ, СЃС‚РѕРї Р»РѕРіРёС‡РЅС‹Р№, Р° СЃС†РµРЅР°СЂРёР№ РїСЂРѕСЃС‚Рѕ РЅРµ СЃСЂР°Р±РѕС‚Р°Р». РўР°РєРёРµ СЃРґРµР»РєРё РЅРµ РЅСѓР¶РЅРѕ СЌРјРѕС†РёРѕРЅР°Р»СЊРЅРѕ РЅР°РєР°Р·С‹РІР°С‚СЊ.",
    },
    {
      title: "РџР»РѕС…Р°СЏ РїСЂРёР±С‹Р»СЊРЅР°СЏ СЃРґРµР»РєР°",
      text:
        "РЎРґРµР»РєР° РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРёР±С‹Р»СЊРЅРѕР№, РЅРѕ РїР»РѕС…РѕР№, РµСЃР»Рё РІС…РѕРґ Р±С‹Р» РёРјРїСѓР»СЊСЃРёРІРЅС‹Рј, СЂРёСЃРє РЅРµ Р±С‹Р» РїРѕРЅСЏС‚РµРЅ, СЃС‚РѕРї РЅР°СЂСѓС€РµРЅ РёР»Рё РїСЂРёР±С‹Р»СЊ РїРѕСЏРІРёР»Р°СЃСЊ СЃР»СѓС‡Р°Р№РЅРѕ. РўР°РєРёРµ СЃРґРµР»РєРё РѕРїР°СЃРЅС‹, РїРѕС‚РѕРјСѓ С‡С‚Рѕ Р·Р°РєСЂРµРїР»СЏСЋС‚ РЅРµРїСЂР°РІРёР»СЊРЅРѕРµ РїРѕРІРµРґРµРЅРёРµ.",
    },
    {
      title: "РљР°Рє РЅР°С…РѕРґРёС‚СЊ Р»СѓС‡С€РёРµ СЃРµС‚Р°РїС‹",
      text:
        "РќСѓР¶РЅРѕ СЂРµРіСѓР»СЏСЂРЅРѕ СЃРјРѕС‚СЂРµС‚СЊ СЃРґРµР»РєРё РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј: РєР°РєРѕР№ СЃРµС‚Р°Рї, РєР°РєРѕР№ С‚Р°Р№РјС„СЂРµР№Рј, РєР°РєРѕР№ market context, РєР°РєРѕР№ СЂРµР·СѓР»СЊС‚Р°С‚ РІ R, РіРґРµ Р±С‹Р»Рё РѕС€РёР±РєРё. Р§РµСЂРµР· СЌС‚Рѕ С„РѕСЂРјРёСЂСѓРµС‚СЃСЏ Р»РёС‡РЅР°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР° Рё РЅР°СЃС‚РѕСЏС‰РёР№ playbook.",
    },
  ],
  checklist: [
    "Р Р°Р·Р±РёСЂР°Р№ СЃРґРµР»РєСѓ РїРѕ РєР°С‡РµСЃС‚РІСѓ СЂРµС€РµРЅРёСЏ, Р° РЅРµ С‚РѕР»СЊРєРѕ РїРѕ PnL.",
    "РћС‚РґРµР»СЏР№ С…РѕСЂРѕС€РёРµ СѓР±С‹С‚РєРё РѕС‚ РїР»РѕС…РёС… РѕС€РёР±РѕРє.",
    "РС‰Рё РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РїСЂРёР±С‹Р»СЊРЅС‹Рµ СЃС†РµРЅР°СЂРёРё.",
    "Р”РѕР±Р°РІР»СЏР№ Р»СѓС‡С€РёРµ РїСЂРёРјРµСЂС‹ РІ Р»РёС‡РЅС‹Р№ playbook.",
  ],
},
  };
  
  

  return (
    contentByLesson[lessonKey] ?? {
      intro:
        "РњР°С‚РµСЂРёР°Р» РґР»СЏ СЌС‚РѕРіРѕ СѓСЂРѕРєР° Р±СѓРґРµС‚ РґРѕР±Р°РІР»РµРЅ РІ СЃР»РµРґСѓСЋС‰РµРј РѕР±РЅРѕРІР»РµРЅРёРё Learning Center.",
      blocks: [
        {
          title: "РЎРєРѕСЂРѕ",
          text:
            "РњС‹ РїРѕСЃС‚РµРїРµРЅРЅРѕ РЅР°РїРѕР»РЅСЏРµРј РєР°Р¶РґС‹Р№ СѓСЂРѕРє РїРѕР»РЅРѕС†РµРЅРЅС‹Рј СѓС‡РµР±РЅС‹Рј РјР°С‚РµСЂРёР°Р»РѕРј, РїСЂР°РєС‚РёРєРѕР№ Рё С‡РµРєР»РёСЃС‚Р°РјРё.",
        },
      ],
      checklist: [
        "РћС‚РєСЂРѕР№ СѓСЂРѕРє.",
        "РР·СѓС‡Рё РѕСЃРЅРѕРІРЅРѕР№ РјР°С‚РµСЂРёР°Р».",
        "Р’С‹РїРѕР»РЅРё РїСЂР°РєС‚РёС‡РµСЃРєРѕРµ Р·Р°РґР°РЅРёРµ.",
      ],
      practice:
        "Р’РµСЂРЅРёСЃСЊ Рє СЌС‚РѕРјСѓ СѓСЂРѕРєСѓ РїРѕР·Р¶Рµ вЂ” РјР°С‚РµСЂРёР°Р» Р±СѓРґРµС‚ СЂР°СЃС€РёСЂРµРЅ.",
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
          {activeLesson.moduleTitle} В· {activeLesson.lessonIndex}
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
        РњР°С‚РµСЂРёР°Р» СѓСЂРѕРєР°
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
      Р§РµРєР»РёСЃС‚
    </div>

    <div className="mt-4 grid gap-2">
      {activeLessonContent.checklist.map((item) => (
        <div
          key={item}
          className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-white/60"
        >
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-[10px] text-cyan-100">
            вњ“
          </span>

          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>

  <div className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
    <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/55">
      Р—Р°РІРµСЂС€РµРЅРёРµ СѓСЂРѕРєР°
    </div>

    <p className="mt-4 text-sm leading-7 text-cyan-50/70">
      РР·СѓС‡Рё РјР°С‚РµСЂРёР°Р» Рё С‡РµРєР»РёСЃС‚. РљРѕРіРґР° Р±СѓРґРµС€СЊ РіРѕС‚РѕРІ, РѕС‚РјРµС‚СЊ СѓСЂРѕРє РїСЂРѕР№РґРµРЅРЅС‹Рј.
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
          {lessonCompleted ? "вњ“" : index + 1}
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
      value: profitFactor ? profitFactor.toFixed(2) : "вЂ”",
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
            {signalAdoptionRate === null ? "вЂ”" : `${signalAdoptionRate}%`}
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
            {signalWinRate === null ? "вЂ”" : `${signalWinRate}%`}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
            Avg PnL
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {signalAveragePnl === null
              ? "вЂ”"
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
            {signalBestSetup ? signalBestSetup[0] : "вЂ”"}
          </div>
          <div className="mt-1 text-xs text-white/45">
            {signalBestSetup
              ? `${signalBestSetup[1].count} / $${signalBestSetup[1].pnl.toFixed(
                  2
                )}`
              : "вЂ”"}
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
              ? `${signalWorstSetup[0]} В· ${signalWorstSetup[1].count} / $${signalWorstSetup[1].pnl.toFixed(
                  2
                )}`
              : "вЂ”"}
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
                {subscription.period || "вЂ”"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                {t.billing.validUntil}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString()
                  : "вЂ”"}
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
          .filter((line) => /^[-вЂў]\s+/.test(line))
          .map((line) => line.replace(/^[-вЂў]\s+/, "").trim());

        const paragraphs = bodyLines.filter((line) => !/^[-вЂў]\s+/.test(line));

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
                      вњ“
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


