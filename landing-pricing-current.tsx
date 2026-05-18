"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import CookieConsent from "@/components/marketing/CookieConsent";
import BrandMark from "@/components/marketing/BrandMark";
import TradingBackground from "@/components/marketing/TradingBackground";

type Language = "en" | "ru" | "ua";
type PageKey = "home" | "product" | "pricing" | "team";
type BillingPeriod = "monthly" | "halfyear" | "yearly";
type AuthMode = "login" | "register" | null;

const navKeys: PageKey[] = ["home", "product", "pricing", "team"];

const pageHref: Record<PageKey, string> = {
  home: "/",
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
      product: "Product",
      pricing: "Pricing",
      team: "About us",
    },
    heroBadge: "Premium AI trading workspace",
    heroTitle: "Turn market noise, trade history and execution mistakes into a clearer trading process.",
    heroText:
      "SkillEdge AI connects your journal, screenshots, chart review, market intelligence, AI scanner, alerts, reports and learning workflow into one premium trading workspace вЂ” without promising profits or replacing your own judgment.",
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
        ["Personal Edge", "The long-term architecture is built around the traderвЂ™s own best and worst patterns."],
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
      flowTitle: "From market scan to personal improvement вЂ” one connected loop.",
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
          features: ["Everything in Core", "Up to 2,000 trades", "5 screenshots per trade", "200 AI Coach requests / month", "30 AI reports / month", "AI Scanner / Market Intelligence"],
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
        ["AI Reports", "вЂ”", "30 / month", "150 / month"],
        ["AI Scanner", "вЂ”", "Yes", "Yes"],
        ["AI Alerts", "вЂ”", "вЂ”", "Yes"],
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
        "The product was born from the same problem many active traders face: the market gives too much information, but almost no honest feedback about execution. SkillEdge AI is designed to connect the traderвЂ™s decisions, screenshots, journal, alerts and outcomes into one serious review system.",
      teamEyebrow: "Team structure",
      teamTitle: "Built like a focused product team вЂ” trading, product, data and support.",
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
        ["Premium product mindset", "Every feature should feel useful, serious and connected to the traderвЂ™s real workflow."],
      ],
      roadmapEyebrow: "Roadmap",
      roadmapTitle: "We are building toward a premium AI Trading Desk.",
      roadmapText:
        "The launch foundation is product-focused: journal, alerts, learning, reports, support, billing and market intelligence. The next layer is premium data, full market scanning and personal alerts based on the clientвЂ™s own history.",
      roadmap: [
        ["01", "Launch foundation", "Journal, dashboard, screenshots, learning, reports, crypto access and support foundation."],
        ["02", "Signals and behavior", "AI alerts, decision tracking, trade drafts, outcome learning and missed opportunity coaching."],
        ["03", "Premium data", "Full ticker coverage, Binance universe, catalysts, heatmaps, halt screener and stronger scanner logic."],
        ["04", "Personal edge", "AI learns from the clientвЂ™s best setups, weak patterns, execution mistakes and journal history."],
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
      resourceLinks: ["Getting Started", "How SkillEdge Works", "Trading Journal Guide", "AI Alerts Guide", "Contact Support"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "Cookie settings",
      choosePlan: "Choose plan",
      requestDemo: "Request demo",
      risk:
        "SkillEdge AI is not financial advice and does not guarantee profits. The platform is built to improve structure, review, decision quality and trading process.",
      contact: "Contacts",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Product demo by request",
      rights: "В© 2026 SkillEdge AI. All rights reserved.",
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
    switchLanguage: "РЇР·С‹Рє",
    brandTag: "РРЅС‚РµР»Р»РµРєС‚ СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚Рё",
    requestDemo: "Р—Р°РїСЂРѕСЃРёС‚СЊ РґРµРјРѕ",
    choosePlan: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
    viewProduct: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ РїСЂРѕРґСѓРєС‚",
    viewPricing: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ С‚Р°СЂРёС„С‹",
    viewAbout: "Рћ РЅР°СЃ",
    nav: {
      home: "Р“Р»Р°РІРЅР°СЏ",
      product: "РџСЂРѕРґСѓРєС‚",
      pricing: "РўР°СЂРёС„С‹",
      team: "Рћ РЅР°СЃ",
    },
    heroBadge: "Premium AI-РїР»Р°С‚С„РѕСЂРјР° РґР»СЏ С‚СЂРµР№РґРµСЂР°",
    heroTitle: "РџСЂРµРІСЂР°С‚Рё СЂС‹РЅРѕС‡РЅС‹Р№ С€СѓРј, РёСЃС‚РѕСЂРёСЋ СЃРґРµР»РѕРє Рё РѕС€РёР±РєРё РёСЃРїРѕР»РЅРµРЅРёСЏ РІ Р±РѕР»РµРµ РїРѕРЅСЏС‚РЅС‹Р№ С‚РѕСЂРіРѕРІС‹Р№ РїСЂРѕС†РµСЃСЃ.",
    heroText:
      "SkillEdge AI СЃРѕРµРґРёРЅСЏРµС‚ Р¶СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹, Р°РЅР°Р»РёР· РіСЂР°С„РёРєРѕРІ, СЂС‹РЅРѕС‡РЅСѓСЋ СЂР°Р·РІРµРґРєСѓ, AI-СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»С‹, РѕС‚С‡С‘С‚С‹ Рё РѕР±СѓС‡РµРЅРёРµ РІ РѕРґРЅРѕ premium-РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ вЂ” Р±РµР· РѕР±РµС‰Р°РЅРёР№ РїСЂРёР±С‹Р»Рё Рё Р±РµР· Р·Р°РјРµРЅС‹ С‚РІРѕРµРіРѕ СЃРѕР±СЃС‚РІРµРЅРЅРѕРіРѕ СЂРµС€РµРЅРёСЏ.",
    start: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
    tour: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ РїСЂРѕРґСѓРєС‚",
    stats: [
      ["Private beta", "СЃРѕР·РґР°С‘С‚СЃСЏ РґР»СЏ СЃРµСЂСЊС‘Р·РЅС‹С… Р°РєС‚РёРІРЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ"],
      ["Р–СѓСЂРЅР°Р» РІ РѕСЃРЅРѕРІРµ", "С‚РІРѕРё СЃРґРµР»РєРё СЃС‚Р°РЅРѕРІСЏС‚СЃСЏ РёСЃС‚РѕС‡РЅРёРєРѕРј РґР°РЅРЅС‹С…"],
      ["Edge+", "РґРѕСЃС‚СѓРї Рє СЃРєР°РЅРµСЂСѓ Рё СЂС‹РЅРѕС‡РЅРѕР№ СЃРІРѕРґРєРµ"],
    ],
    problemEyebrow: "РџСЂРѕР±Р»РµРјР°",
    problemTitle: "РџСЂРѕР±Р»РµРјР° С‚СЂРµР№РґРµСЂР° вЂ” РЅРµ РѕС‚СЃСѓС‚СЃС‚РІРёРµ РёРЅС„РѕСЂРјР°С†РёРё. РџСЂРѕР±Р»РµРјР° вЂ” С€СѓРј, РїРѕР·РґРЅРёР№ РІС…РѕРґ Рё СЃР»Р°Р±С‹Р№ РїСЂРѕС†РµСЃСЃ.",
problemText:
  "Р С‹РЅРѕРє РєР°Р¶РґС‹Р№ РґРµРЅСЊ РґР°С‘С‚ С‚РёРєРµСЂС‹, РЅРѕРІРѕСЃС‚Рё, РёРјРїСѓР»СЊСЃС‹ Рё Р»РѕРІСѓС€РєРё. РќРѕ Р±РµР· СЃС‚СЂСѓРєС‚СѓСЂС‹ С‚СЂРµР№РґРµСЂ РІСЃС‘ СЂР°РІРЅРѕ РѕРїР°Р·РґС‹РІР°РµС‚, РІС…РѕРґРёС‚ РЅРµ С‚Р°Рј, РґРІРёРіР°РµС‚ СЃС‚РѕРї Рё Р·Р°Р±С‹РІР°РµС‚, РїРѕС‡РµРјСѓ СЃРґРµР»РєР° Р±С‹Р»Р° С…РѕСЂРѕС€РµР№ РёР»Рё РїР»РѕС…РѕР№.",
    homeSections: {
      whyTitle: "РћРґРёРЅ СЂР°Р±РѕС‡РёР№ С†РёРєР» РІРјРµСЃС‚Рѕ С…Р°РѕСЃР° РёР· СЂР°Р·РЅС‹С… РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ.",
whyText:
  "SkillEdge AI СЃРІСЏР·С‹РІР°РµС‚ СЂС‹РЅРѕРє, СЃРµС‚Р°Рї, РїР»Р°РЅ, СЃРґРµР»РєСѓ, Р¶СѓСЂРЅР°Р» Рё СЂР°Р·Р±РѕСЂ. РљР»РёРµРЅС‚ РІРёРґРёС‚ РЅРµ РїСЂРѕСЃС‚Рѕ РёРЅС„РѕСЂРјР°С†РёСЋ, Р° РїСЂРѕС†РµСЃСЃ: С‡С‚Рѕ РёСЃРєР°С‚СЊ, РіРґРµ СЂРёСЃРє, С‡С‚Рѕ РїРѕРґС‚РІРµСЂРґРёР»Рѕ РёРґРµСЋ Рё С‡С‚Рѕ РЅСѓР¶РЅРѕ СѓР»СѓС‡С€РёС‚СЊ РїРѕСЃР»Рµ РёСЃС…РѕРґР°.",
cards: [
  ["Market Intelligence", "РћС‚Р±РёСЂР°РµС‚ Р°РєС‚РёРІРЅС‹Рµ Р°РєС†РёРё Рё РєСЂРёРїС‚Сѓ, С‡С‚РѕР±С‹ С‚СЂРµР№РґРµСЂ РЅРµ С‚СЂР°С‚РёР» РІСЂРµРјСЏ РЅР° РјС‘СЂС‚РІС‹Рµ РіСЂР°С„РёРєРё."],
  ["AI Trading Desk", "РџРѕРєР°Р·С‹РІР°РµС‚ СЃРµС‚Р°Рї, РЅР°РїСЂР°РІР»РµРЅРёРµ, С‚СЂРёРіРіРµСЂ, Р·РѕРЅСѓ РІС…РѕРґР°, stop, targets, RR Рё invalidation."],
  ["Journal Review", "РЎРІСЏР·С‹РІР°РµС‚ СЃРґРµР»РєРё, СЃРєСЂРёРЅС€РѕС‚С‹, СЌРјРѕС†РёРё, РѕС€РёР±РєРё Рё PnL РІ РѕРґРёРЅ РёСЃС‚РѕС‡РЅРёРє РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё."],
  ["Execution Coaching", "РџРѕРјРѕРіР°РµС‚ СѓРІРёРґРµС‚СЊ РїРѕР·РґРЅРёР№ РІС…РѕРґ, СЃР»Р°Р±С‹Р№ СЃС‚РѕРї, РїР»РѕС…РѕР№ RR, РЅР°СЂСѓС€РµРЅРёРµ РїР»Р°РЅР° Рё РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РѕС€РёР±РєРё."],
],
    },
    productPage: {
      heroBadge: "РџСЂРѕРґСѓРєС‚",
      heroTitle: "Р•РґРёРЅРѕРµ СЂР°Р±РѕС‡РµРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ РґР»СЏ С‚РѕСЂРіРѕРІРѕР№ СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚Рё.",
      heroText:
        "SkillEdge AI СЃРѕР·РґР°С‘С‚СЃСЏ РєР°Рє premium trading operating system: Р¶СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹, AI-РєРѕСѓС‡, РѕС‚С‡С‘С‚С‹, РіСЂР°С„РёРєРё, СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»С‹, РїР»РµР№Р±СѓРє Рё РїРѕРґРґРµСЂР¶РєР° РІ РѕРґРЅРѕРј С‡РёСЃС‚РѕРј РїСЂРѕС†РµСЃСЃРµ.",
      ctaPrimary: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
      ctaSecondary: "Р—Р°С‡РµРј РјС‹ СЌС‚Рѕ СЃС‚СЂРѕРёРј",
      heroCards: [
        ["AI Trading Desk", "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°, СЃРёРіРЅР°Р»С‹, Р¶СѓСЂРЅР°Р» Рё РєРѕСѓС‡РёРЅРі РІ РѕРґРЅРѕР№ СЃРёСЃС‚РµРјРµ."],
        ["РЎРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р»", "РЎРѕР·РґР°РІР°Р№ СЃРґРµР»РєСѓ РёР· СЃРёРіРЅР°Р»Р° Рё СЃСЂР°РІРЅРёРІР°Р№ РїР»Р°РЅ СЃ СЂРµР°Р»СЊРЅС‹Рј РёСЃРїРѕР»РЅРµРЅРёРµРј."],
        ["Р›РёС‡РЅРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ", "Р”РѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ Р°СЂС…РёС‚РµРєС‚СѓСЂР° СЃС‚СЂРѕРёС‚СЃСЏ РІРѕРєСЂСѓРі Р»СѓС‡С€РёС… Рё С…СѓРґС€РёС… РїР°С‚С‚РµСЂРЅРѕРІ СЃР°РјРѕРіРѕ С‚СЂРµР№РґРµСЂР°."],
      ],
      deskTitle: "РўРѕСЂРіРѕРІС‹Р№ desk РґРѕР»Р¶РµРЅ РґР°РІР°С‚СЊ РєРѕРЅС‚РµРєСЃС‚, Р° РЅРµ СЃР»РµРїС‹Рµ РєРѕРјР°РЅРґС‹.",
      deskText:
        "SkillEdge AI РґРѕР»Р¶РµРЅ РѕР±СЉСЏСЃРЅСЏС‚СЊ, РїРѕС‡РµРјСѓ СЃРёС‚СѓР°С†РёСЏ РІР°Р¶РЅР°, С‡С‚Рѕ РµС‘ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚, С‡С‚Рѕ РѕС‚РјРµРЅСЏРµС‚ Рё РіРґРµ РЅР°С…РѕРґРёС‚СЃСЏ СЂРёСЃРє. Р¦РµР»СЊ вЂ” Р»СѓС‡С€РµРµ РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№, Р° РЅРµ СЃР»РµРїР°СЏ Р·Р°РІРёСЃРёРјРѕСЃС‚СЊ РѕС‚ СЃРёРіРЅР°Р»РѕРІ.",
      deskCards: [
        ["Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°", "РќР°С…РѕРґРё Р°РєС†РёРё Рё РєСЂРёРїС‚Сѓ, РєРѕС‚РѕСЂС‹Рµ Р·Р°СЃР»СѓР¶РёРІР°СЋС‚ РІРЅРёРјР°РЅРёСЏ, РЅРµ С‚СЂР°С‚СЏ РІСЂРµРјСЏ РЅР° РјС‘СЂС‚РІС‹Рµ РіСЂР°С„РёРєРё."],
        ["AI-СЃРєР°РЅРµСЂ", "Edge Рё Elite РїРѕР»СѓС‡Р°СЋС‚ AI Market Brief РїРѕ Р»СѓС‡С€РёРј Р°РєС‚РёРІРЅС‹Рј РєР°РЅРґРёРґР°С‚Р°Рј СЂС‹РЅРєР°."],
        ["AI-СЃРёРіРЅР°Р»С‹", "Elite РїРѕР»СѓС‡Р°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Рµ СЃРёРіРЅР°Р»С‹: СЃРµС‚Р°Рї, РЅР°РїСЂР°РІР»РµРЅРёРµ, С‚СЂРёРіРіРµСЂ, Р·РѕРЅР° РІС…РѕРґР°, СЃС‚РѕРї Рё С†РµР»Рё."],
        ["РћР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С…", "РћС‚РјРµС‡Р°Р№ РІР·СЏС‚С‹Рµ, РїСЂРѕРїСѓС‰РµРЅРЅС‹Рµ Рё РїСЂРѕРёРіРЅРѕСЂРёСЂРѕРІР°РЅРЅС‹Рµ СЃРёРіРЅР°Р»С‹, С‡С‚РѕР±С‹ РєР°Р¶РґС‹Р№ РёСЃС…РѕРґ СЃС‚Р°РЅРѕРІРёР»СЃСЏ СѓСЂРѕРєРѕРј."],
      ],
      flowEyebrow: "РџСЂРѕС†РµСЃСЃ",
      flowTitle: "РћС‚ СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ СЂС‹РЅРєР° РґРѕ Р»РёС‡РЅРѕРіРѕ РїСЂРѕРіСЂРµСЃСЃР° вЂ” РѕРґРёРЅ СЃРІСЏР·Р°РЅРЅС‹Р№ С†РёРєР».",
      flowText:
        "РљР°Р¶РґР°СЏ СЃРµСЂСЊС‘Р·РЅР°СЏ С‚РѕСЂРіРѕРІР°СЏ РёРґРµСЏ РґРѕР»Р¶РЅР° СЃС‚Р°РЅРѕРІРёС‚СЊСЃСЏ РґР°РЅРЅС‹РјРё: С‡С‚Рѕ РїРѕРєР°Р·Р°Р» СЂС‹РЅРѕРє, С‡С‚Рѕ РїР»Р°РЅРёСЂРѕРІР°Р» С‚СЂРµР№РґРµСЂ, С‡С‚Рѕ Р±С‹Р»Рѕ РёСЃРїРѕР»РЅРµРЅРѕ Рё С‡РµРјСѓ РЅР°СѓС‡РёР» РёСЃС…РѕРґ.",
      flow: [
        ["01", "Р С‹РЅРѕРє РЅР°С‡РёРЅР°РµС‚ РґРІРёРіР°С‚СЊСЃСЏ", "SkillEdge РѕС‚СЃР»РµР¶РёРІР°РµС‚ Р°РєС‚РёРІРЅС‹Рµ Р°РєС†РёРё, РєСЂРёРїС‚Сѓ, РЅРµРѕР±С‹С‡РЅРѕРµ РґРІРёР¶РµРЅРёРµ, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹ Рё СЂС‹РЅРѕС‡РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚."],
        ["02", "AI С„РёР»СЊС‚СЂСѓРµС‚ С€СѓРј", "РЎРёСЃС‚РµРјР° СЂР°РЅР¶РёСЂСѓРµС‚ СЃРёС‚СѓР°С†РёРё РїРѕ РєР°С‡РµСЃС‚РІСѓ, СЃРІРµР¶РµСЃС‚Рё, СЂРёСЃРєСѓ Рё СЏСЃРЅРѕСЃС‚Рё СЃРµС‚Р°РїР°."],
        ["03", "РџРѕСЏРІР»СЏРµС‚СЃСЏ РїР»Р°РЅ", "РўСЂРµР№РґРµСЂ РІРёРґРёС‚ РЅР°РїСЂР°РІР»РµРЅРёРµ, С‚СЂРёРіРіРµСЂ, Р·РѕРЅСѓ РІС…РѕРґР°, СЃС‚РѕРї, С†РµР»Рё, СЃРѕРїСЂРѕРІРѕР¶РґРµРЅРёРµ Рё РѕС‚РјРµРЅСѓ РёРґРµРё."],
        ["04", "Р–СѓСЂРЅР°Р» РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ", "Р’Р·СЏС‚С‹Р№ СЃРёРіРЅР°Р» РјРѕР¶РµС‚ СЃС‚Р°С‚СЊ СЃРґРµР»РєРѕР№ РІ Р¶СѓСЂРЅР°Р»Рµ СЃРѕ СЃРєСЂРёРЅС€РѕС‚Р°РјРё, Р·Р°РјРµС‚РєР°РјРё Рё СЂР°Р·Р±РѕСЂРѕРј РёСЃРїРѕР»РЅРµРЅРёСЏ."],
        ["05", "РћР±СѓС‡РµРЅРёРµ РЅР°РєР°РїР»РёРІР°РµС‚СЃСЏ", "РћС‚С‡С‘С‚С‹, СЂР°Р·Р±РѕСЂ РёСЃС…РѕРґРѕРІ Рё РєРѕСѓС‡РёРЅРі РїСЂРµРІСЂР°С‰Р°СЋС‚ РїРѕРІС‚РѕСЂРµРЅРёРµ РІ Р±РѕР»РµРµ СЃРёР»СЊРЅС‹Р№ РїСЂРѕС†РµСЃСЃ."],
      ],
      modulesEyebrow: "РњРѕРґСѓР»Рё",
      modulesTitle: "Р’СЃРµ С‡Р°СЃС‚Рё РїСЂРѕРґСѓРєС‚Р° РґРѕР»Р¶РЅС‹ СЂР°Р±РѕС‚Р°С‚СЊ РІРјРµСЃС‚Рµ.",
      modulesText:
        "РљР°Р¶РґС‹Р№ РјРѕРґСѓР»СЊ РїРѕР»РµР·РµРЅ СЃР°Рј РїРѕ СЃРµР±Рµ. Р’РјРµСЃС‚Рµ РѕРЅРё СЃРѕР·РґР°СЋС‚ premium-РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ, РіРґРµ С‚СЂРµР№РґРµСЂ РЅР°С…РѕРґРёС‚ СЃРёС‚СѓР°С†РёРё, РґРµР№СЃС‚РІСѓРµС‚ СЃС‚СЂСѓРєС‚СѓСЂРЅРѕ Рё СЂР°Р·Р±РёСЂР°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚.",
      modules: [
        ["Р–СѓСЂРЅР°Р» Рё СЃРєСЂРёРЅС€РѕС‚С‹", "РЎРµСЂСЊС‘Р·РЅС‹Р№ Р¶СѓСЂРЅР°Р», РєРѕС‚РѕСЂС‹Р№ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ РёСЃС‚РѕС‡РЅРёРєРѕРј РґР°РЅРЅС‹С… РґР»СЏ Р°РЅР°Р»РёР·Р°, РѕС‚С‡С‘С‚РѕРІ Рё Р±СѓРґСѓС‰РµР№ РїРµСЂСЃРѕРЅР°Р»РёР·Р°С†РёРё.", ["РЎРґРµР»РєРё Рё СЃРєСЂРёРЅС€РѕС‚С‹", "PnL Рё РїСЂРѕС†РµРЅС‚ РїСЂРёР±С‹Р»СЊРЅС‹С… СЃРґРµР»РѕРє", "CSV/XLSX СЌРєСЃРїРѕСЂС‚", "AI-Р°РЅР°Р»РёР· Р¶СѓСЂРЅР°Р»Р°"]],
        ["Р“СЂР°С„РёРєРё Рё СЃРїРёСЃРєРё РЅР°Р±Р»СЋРґРµРЅРёСЏ", "Р Р°Р±РѕС‡РµРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ РіСЂР°С„РёРєРѕРІ, СЃРІСЏР·Р°РЅРЅРѕРµ СЃ С‚РёРєРµСЂР°РјРё, СЃРїРёСЃРєР°РјРё, СЃРєСЂРёРЅС€РѕС‚Р°РјРё Рё Р±СѓРґСѓС‰РёРј premium-Р°РЅР°Р»РёР·РѕРј.", ["TradingView workspace", "Р’РІРѕРґ С‚РёРєРµСЂР°", "РЎРїРёСЃРѕРє РЅР°Р±Р»СЋРґРµРЅРёСЏ", "РћСЃРЅРѕРІР° AI-Р°РЅР°Р»РёР·Р° РіСЂР°С„РёРєР°"]],
        ["Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°", "РЎР»РѕР№ СЃРєР°РЅРµСЂР° РґР»СЏ РїРѕРёСЃРєР° Р°РєС‚РёРІРЅС‹С… Р°РєС†РёР№ Рё РєСЂРёРїС‚С‹ СЃ С‡РµСЃС‚РЅС‹Рј РѕС‚РѕР±СЂР°Р¶РµРЅРёРµРј РёСЃС‚РѕС‡РЅРёРєРѕРІ.", ["РљР°РЅРґРёРґР°С‚С‹ РїРѕ Р°РєС†РёСЏРј Рё РєСЂРёРїС‚Рµ", "Р С‹РЅРѕС‡РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚", "РњРµС‚РєРё РёСЃС‚РѕС‡РЅРёРєРѕРІ", "AI Market Brief"]],
        ["AI-СЃРёРіРЅР°Р»С‹", "Elite-СЃРёРіРЅР°Р»С‹ СЃ РїР»Р°РЅРѕРј, РѕР±СѓС‡РµРЅРёРµРј Рё СЂР°Р·Р±РѕСЂРѕРј РёСЃС…РѕРґР°.", ["РџР»Р°РІР°СЋС‰РёР№ РІРёРґР¶РµС‚", "Р¦РµРЅС‚СЂ СЃРёРіРЅР°Р»РѕРІ", "РџРѕРґСЂРѕР±РЅС‹Р№ СЂР°Р·Р±РѕСЂ", "РЎРІСЏР·РєР° СЃРёРіРЅР°Р»Р° СЃ Р¶СѓСЂРЅР°Р»РѕРј"]],
        ["РћС‚С‡С‘С‚С‹ Рё РѕР±СѓС‡РµРЅРёРµ", "РЎР»РѕР№ СЂР°Р·Р±РѕСЂР°, РєРѕС‚РѕСЂС‹Р№ РїСЂРµРІСЂР°С‰Р°РµС‚ СЃРґРµР»РєРё РІ РѕР±СЂР°С‚РЅСѓСЋ СЃРІСЏР·СЊ Рё РїРѕРІС‚РѕСЂСЏРµРјС‹Рµ СѓСЂРѕРєРё.", ["AI-РѕС‚С‡С‘С‚С‹", "РЈС‡РµР±РЅС‹Рµ Р±Р»РѕРєРё", "РћСЃРЅРѕРІР° РїР»РµР№Р±СѓРєР°", "Р¤РѕРєСѓСЃ РёСЃРїРѕР»РЅРµРЅРёСЏ"]],
        ["РџРѕРґРґРµСЂР¶РєР°", "Site-wide РїРѕРјРѕС‰РЅРёРє Рё РѕРїРµСЂР°С‚РѕСЂСЃРєРёР№ РїРѕС‚РѕРє РґР»СЏ РІРѕРїСЂРѕСЃРѕРІ РїРѕ РїСЂРѕРґСѓРєС‚Сѓ, РѕРїР»Р°С‚Рµ Рё РґРѕСЃС‚СѓРїСѓ.", ["РџРѕРјРѕС‰РЅРёРє РїРѕРґРґРµСЂР¶РєРё", "Р—Р°РїСЂРѕСЃ РѕРїРµСЂР°С‚РѕСЂР°", "Email-РїРѕРґРґРµСЂР¶РєР°", "РћС‚РІРµС‚С‹ РёР· Р°РґРјРёРЅРєРё"]],
      ],
      differentEyebrow: "РћС‚Р»РёС‡РёРµ",
      differentTitle: "Р­С‚Рѕ РЅРµ РѕС‡РµСЂРµРґРЅРѕР№ СЃРµСЂРІРёСЃ СЃРёРіРЅР°Р»РѕРІ. Р­С‚Рѕ СЃРёСЃС‚РµРјР° СЌС„С„РµРєС‚РёРІРЅРѕСЃС‚Рё.",
      differentText:
        "РЎРёР»СЊРЅС‹Рµ С‚СЂРµР№РґРµСЂС‹ РЅРµ РїСЂРѕСЃС‚Рѕ РёС‰СѓС‚ РІС…РѕРґС‹. РћРЅРё СЃС‚СЂРѕСЏС‚ РїСЂРѕС†РµСЃСЃ, РєРѕРЅС‚СЂРѕР»СЊ СЂРёСЃРєР°, СЂР°Р·Р±РѕСЂ, РґРёСЃС†РёРїР»РёРЅСѓ Рё РїРѕРІС‚РѕСЂСЏРµРјС‹Рµ РїР°С‚С‚РµСЂРЅС‹. SkillEdge AI СЃС‚СЂРѕРёС‚СЃСЏ РІРѕРєСЂСѓРі СЌС‚РѕР№ СЂРµР°Р»СЊРЅРѕСЃС‚Рё.",
      comparisons: [
        ["Р’РјРµСЃС‚Рѕ РѕР±С‹С‡РЅРѕРіРѕ СЃРєР°РЅРµСЂР°", "РўС‹ РІРёРґРёС€СЊ С‚РѕР»СЊРєРѕ С‚РёРєРµСЂС‹ Рё РІСЃС‘ СЂР°РІРЅРѕ РґРѕР»Р¶РµРЅ СѓРіР°РґС‹РІР°С‚СЊ, С‡С‚Рѕ РІР°Р¶РЅРѕ.", "SkillEdge РѕР±СЉСЏСЃРЅСЏРµС‚, РїРѕС‡РµРјСѓ С‚РёРєРµСЂ РІР°Р¶РµРЅ, РєР°РєРѕР№ СЃРµС‚Р°Рї, РіРґРµ СЂРёСЃРє Рё С‡С‚Рѕ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ РёРґРµСЋ."],
        ["Р’РјРµСЃС‚Рѕ РїСЂРѕСЃС‚РѕРіРѕ Р¶СѓСЂРЅР°Р»Р°", "РўС‹ С…СЂР°РЅРёС€СЊ СЃРґРµР»РєРё, РЅРѕ РЅРµ РїСЂРµРІСЂР°С‰Р°РµС€СЊ РёС… РІ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ.", "SkillEdge СЃРІСЏР·С‹РІР°РµС‚ СЃРґРµР»РєРё, СЃРєСЂРёРЅС€РѕС‚С‹, СЃРёРіРЅР°Р»С‹, РёСЃС…РѕРґС‹ Рё РѕС€РёР±РєРё РІ СЃРёСЃС‚РµРјСѓ СѓР»СѓС‡С€РµРЅРёСЏ."],
        ["Р’РјРµСЃС‚Рѕ РѕР±С‹С‡РЅРѕРіРѕ С‡Р°С‚-Р±РѕС‚Р°", "РўС‹ Р·Р°РґР°С‘С€СЊ СЃР»СѓС‡Р°Р№РЅС‹Рµ РІРѕРїСЂРѕСЃС‹ Рё РїРѕР»СѓС‡Р°РµС€СЊ СЂР°Р·СЂРѕР·РЅРµРЅРЅС‹Рµ РѕС‚РІРµС‚С‹.", "SkillEdge СЂР°Р±РѕС‚Р°РµС‚ РІРЅСѓС‚СЂРё РїСЂРѕС†РµСЃСЃР°: СЃРёРіРЅР°Р»С‹, Р¶СѓСЂРЅР°Р», РѕС‚С‡С‘С‚С‹, РёСЃРїРѕР»РЅРµРЅРёРµ, РѕР±СѓС‡РµРЅРёРµ Рё РїР»РµР№Р±СѓРє."],
      ],
      finalTitle: "РџРѕСЃС‚СЂРѕР№ С‚РѕСЂРіРѕРІСѓСЋ СЃРёСЃС‚РµРјСѓ РІРѕРєСЂСѓРі СЃРІРѕРµРіРѕ СЂРµР°Р»СЊРЅРѕРіРѕ РїРѕРІРµРґРµРЅРёСЏ.",
      finalText:
        "SkillEdge AI СЃРѕР·РґР°РЅ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅР°РґРѕРµР»Рё СЂР°Р·СЂРѕР·РЅРµРЅРЅС‹Рµ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹, СЌРјРѕС†РёРѕРЅР°Р»СЊРЅС‹Рµ СЂРµС€РµРЅРёСЏ Рё РЅРµРїРѕРЅСЏС‚РЅС‹Рµ СЂР°Р·Р±РѕСЂС‹. РџСЂРѕРґСѓРєС‚ РїРѕРјРѕРіР°РµС‚ С‡РёС‰Рµ РІРёРґРµС‚СЊ СЂС‹РЅРѕРє, РґРµР№СЃС‚РІРѕРІР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂРЅРµРµ Рё РїРѕРЅРёРјР°С‚СЊ, С‡С‚Рѕ СѓР»СѓС‡С€Р°С‚СЊ РґР°Р»СЊС€Рµ.",
      finalChecklist: [
        "Р–СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹ Рё Р°РЅР°Р»РёС‚РёРєР°",
        "AI-РєРѕСѓС‡ Рё СЂР°Р·Р±РѕСЂ РіСЂР°С„РёРєРѕРІ",
        "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР° Рё AI-СЃРєР°РЅРµСЂ РґР»СЏ Edge+",
        "AI-СЃРёРіРЅР°Р»С‹ Рё Signal-to-Journal РґР»СЏ Elite",
        "РћС‚С‡С‘С‚С‹, РѕР±СѓС‡РµРЅРёРµ Рё РѕСЃРЅРѕРІР° РїР»РµР№Р±СѓРєР°",
        "РџРѕРјРѕС‰РЅРёРє РїРѕРґРґРµСЂР¶РєРё Рё Р·Р°РїСЂРѕСЃ РѕРїРµСЂР°С‚РѕСЂР°",
      ],
    },
    pricingPage: {
      heroBadge: "РўР°СЂРёС„С‹",
      heroTitle: "Р’С‹Р±РµСЂРё СѓСЂРѕРІРµРЅСЊ РёРЅС‚РµР»Р»РµРєС‚Р° РІРѕРєСЂСѓРі СЃРІРѕРµРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°.",
      heroText:
        "Core СЃС‚СЂРѕРёС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ. Edge РґРѕР±Р°РІР»СЏРµС‚ СЂС‹РЅРѕС‡РЅСѓСЋ СЂР°Р·РІРµРґРєСѓ Рё AI-СЃРєР°РЅРµСЂ. Elite РѕС‚РєСЂС‹РІР°РµС‚ РїРѕР»РЅС‹Р№ AI Trading Desk СЃ СЃРёРіРЅР°Р»Р°РјРё, СЃРІСЏР·РєРѕР№ СЃ Р¶СѓСЂРЅР°Р»РѕРј Рё РѕР±СѓС‡РµРЅРёРµРј РЅР° РёСЃС…РѕРґР°С….",
      billingToggle: {
        monthly: "1 РјРµСЃСЏС†",
        halfyear: "6 РјРµСЃСЏС†РµРІ",
        yearly: "1 РіРѕРґ",
      },
      period: {
        monthly: "/ РјРµСЃСЏС†",
        halfyear: "/ 6 РјРµСЃСЏС†РµРІ",
        yearly: "/ РіРѕРґ",
      },
      cardPayment: "РћРїР»Р°С‚Р° РєР°СЂС‚РѕР№ РіРѕС‚РѕРІРёС‚СЃСЏ",
      cryptoNote: "* РєСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Р° С‡РµСЂРµР· РґРѕСЃС‚СѓРїРЅС‹Р№ launch-flow",
      checkoutStatus: {
        checking: "РџСЂРѕРІРµСЂСЏРµРј Р°РєРєР°СѓРЅС‚...",
        invoice: "РЎРѕР·РґР°С‘Рј РєСЂРёРїС‚Рѕ-СЃС‡С‘С‚...",
        noUrl: "РљСЂРёРїС‚Рѕ-СЃС‡С‘С‚ СЃРѕР·РґР°РЅ, РЅРѕ СЃСЃС‹Р»РєР° РЅР° РѕРїР»Р°С‚Сѓ РЅРµ РІРµСЂРЅСѓР»Р°СЃСЊ.",
        unavailable: "РљСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Р° СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚СѓРїРЅР°.",
      },
      planBadge: {
        core: "РќР°С‡РЅРё СЃ РґРёСЃС†РёРїР»РёРЅС‹",
        edge: "Р›СѓС‡С€РёР№ РІР°СЂРёР°РЅС‚ РґР»СЏ Р°РєС‚РёРІРЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°",
        elite: "РџРѕР»РЅС‹Р№ AI Trading Desk",
      },
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          headline: "Р”Р»СЏ С‚СЂРµР№РґРµСЂР°, РєРѕС‚РѕСЂРѕРјСѓ СЃРЅР°С‡Р°Р»Р° РЅСѓР¶РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°.",
          text:
            "РџРѕСЃС‚СЂРѕР№ РѕСЃРЅРѕРІСѓ: Р¶СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹, AI-РєРѕСѓС‡, Р±Р°Р·РѕРІС‹Р№ Р°РЅР°Р»РёР· РіСЂР°С„РёРєРѕРІ, СЌРєСЃРїРѕСЂС‚ Рё Р±РѕР»РµРµ С‡РёСЃС‚С‹Р№ РїСЂРѕС†РµСЃСЃ СЂР°Р·Р±РѕСЂР°.",
          bestFor: "Р›СѓС‡С€Рµ РІСЃРµРіРѕ РґР»СЏ РґРёСЃС†РёРїР»РёРЅС‹, С„РёРєСЃР°С†РёРё СЃРґРµР»РѕРє Рё РѕС‚РєР°Р·Р° РѕС‚ С‚РѕСЂРіРѕРІР»Рё РїРѕ РїР°РјСЏС‚Рё.",
          cta: "РќР°С‡Р°С‚СЊ СЃ Core",
          features: ["Р”Рѕ 300 СЃРґРµР»РѕРє", "3 СЃРєСЂРёРЅС€РѕС‚Р° РЅР° СЃРґРµР»РєСѓ", "50 Р·Р°РїСЂРѕСЃРѕРІ Рє AI-РєРѕСѓС‡Сѓ / РјРµСЃСЏС†", "10 AI-Р°РЅР°Р»РёР·РѕРІ Р¶СѓСЂРЅР°Р»Р° / РјРµСЃСЏС†", "20 AI-Р°РЅР°Р»РёР·РѕРІ РіСЂР°С„РёРєР° / РјРµСЃСЏС†", "CSV/XLSX СЌРєСЃРїРѕСЂС‚"],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          headline: "Р”Р»СЏ Р°РєС‚РёРІРЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°, РєРѕС‚РѕСЂРѕРјСѓ РЅСѓР¶РµРЅ РіР»СѓР±РѕРєРёР№ СЂР°Р·Р±РѕСЂ Рё СЂС‹РЅРѕС‡РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚.",
          text:
            "РћС‚РєСЂРѕР№ РїРѕРІС‹С€РµРЅРЅС‹Рµ Р»РёРјРёС‚С‹, AI-РѕС‚С‡С‘С‚С‹, premium-Р°РЅР°Р»РёР· РіСЂР°С„РёРєРѕРІ, СЂС‹РЅРѕС‡РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚ Рё СЃР»РѕР№ AI-СЃРєР°РЅРµСЂР° / AI Market Brief.",
          bestFor: "Р›СѓС‡С€Рµ РІСЃРµРіРѕ РґР»СЏ Р°РєС‚РёРІРЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рµ СЃРµСЂСЊС‘Р·РЅРѕ СЂР°Р·Р±РёСЂР°СЋС‚ СЃРґРµР»РєРё Рё РёС‰СѓС‚ РїРѕРІС‚РѕСЂСЏСЋС‰РёРµСЃСЏ РѕС€РёР±РєРё Рё СЃРµС‚Р°РїС‹.",
          cta: "РџРµСЂРµР№С‚Рё РЅР° Edge",
          features: ["Р’СЃС‘ РёР· Core", "Р”Рѕ 2 000 СЃРґРµР»РѕРє", "5 СЃРєСЂРёРЅС€РѕС‚РѕРІ РЅР° СЃРґРµР»РєСѓ", "200 Р·Р°РїСЂРѕСЃРѕРІ Рє AI-РєРѕСѓС‡Сѓ / РјРµСЃСЏС†", "30 AI-РѕС‚С‡С‘С‚РѕРІ / РјРµСЃСЏС†", "AI-СЃРєР°РЅРµСЂ / СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°"],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          headline: "Р”Р»СЏ СЃРµСЂСЊС‘Р·РЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°, РєРѕС‚РѕСЂРѕРјСѓ РЅСѓР¶РµРЅ РїРѕР»РЅС‹Р№ AI Trading Desk.",
          text:
            "РћС‚РєСЂРѕР№ AI-СЃРёРіРЅР°Р»С‹, РїР»Р°РІР°СЋС‰РёР№ РІРёРґР¶РµС‚, Signal-to-Journal, РѕС‚СЃР»РµР¶РёРІР°РЅРёРµ СЂРµС€РµРЅРёР№, РѕР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С… Рё РјР°РєСЃРёРјР°Р»СЊРЅС‹Рµ AI-Р»РёРјРёС‚С‹.",
          bestFor: "Р›СѓС‡С€Рµ РІСЃРµРіРѕ РґР»СЏ РїСЂРѕРґРІРёРЅСѓС‚С‹С… С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Рµ СЃРёРіРЅР°Р»С‹ Рё РїРѕР»РЅС‹Р№ С†РёРєР» РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё.",
          cta: "РћС‚РєСЂС‹С‚СЊ Elite",
          features: ["Р’СЃС‘ РёР· Edge", "Р”Рѕ 10 000 СЃРґРµР»РѕРє", "10 СЃРєСЂРёРЅС€РѕС‚РѕРІ РЅР° СЃРґРµР»РєСѓ", "1 000 Р·Р°РїСЂРѕСЃРѕРІ Рє AI-РєРѕСѓС‡Сѓ / РјРµСЃСЏС†", "150 AI-РѕС‚С‡С‘С‚РѕРІ / РјРµСЃСЏС†", "AI-СЃРёРіРЅР°Р»С‹ + Signal-to-Journal"],
        },
      ],
      signalEyebrow: "Р—Р°С‡РµРј РЅСѓР¶РµРЅ СЃР»РѕР№ СЃРёРіРЅР°Р»РѕРІ",
      signalTitle: "РЎРёРіРЅР°Р»С‹ SkillEdge РґРѕР»Р¶РЅС‹ РѕР±СѓС‡Р°С‚СЊ, Р° РЅРµ Р·Р°СЃС‚Р°РІР»СЏС‚СЊ С‚СЂРµР№РґРµСЂР° СЃР»РµРїРѕ РЅР°Р¶РёРјР°С‚СЊ.",
      signalText:
        "РЎР»Р°Р±С‹Р№ СЃРµСЂРІРёСЃ СЃРёРіРЅР°Р»РѕРІ СЃРѕР·РґР°С‘С‚ Р·Р°РІРёСЃРёРјРѕСЃС‚СЊ. РЎРёР»СЊРЅР°СЏ С‚РѕСЂРіРѕРІР°СЏ СЃРёСЃС‚РµРјР° СЃРѕР·РґР°С‘С‚ СЏСЃРЅРѕСЃС‚СЊ: СЃРµС‚Р°Рї, СЂРёСЃРє, РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ, РѕС‚РјРµРЅР° РёРґРµРё Рё СѓСЂРѕРє РїРѕСЃР»Рµ РёСЃС…РѕРґР°.",
      signalCards: [
        ["РќРµ СЃР»РµРїС‹Рµ РєРѕРјР°РЅРґС‹", "РЎРёРіРЅР°Р»С‹ вЂ” СЌС‚Рѕ СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Рµ С‚РѕСЂРіРѕРІС‹Рµ РёРґРµРё: СЃРµС‚Р°Рї, РЅР°РїСЂР°РІР»РµРЅРёРµ, С‚СЂРёРіРіРµСЂ, Р·РѕРЅР° РІС…РѕРґР°, СЃС‚РѕРї, С†РµР»Рё Рё СЂРёСЃРє."],
        ["Р Р°Р·Р±РѕСЂ РґРѕ РґРµР№СЃС‚РІРёСЏ", "РљР°Р¶РґС‹Р№ СЃРµСЂСЊС‘Р·РЅС‹Р№ СЃРёРіРЅР°Р» РѕР±СЉСЏСЃРЅСЏРµС‚, РїРѕС‡РµРјСѓ РѕРЅ РїРѕСЏРІРёР»СЃСЏ, С‡С‚Рѕ РµРіРѕ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ Рё С‡С‚Рѕ РґРµР»Р°РµС‚ РµРіРѕ РѕРїР°СЃРЅС‹Рј."],
        ["РЎРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р»", "Р’Р·СЏС‚С‹Р№ СЃРёРіРЅР°Р» РјРѕР¶РµС‚ СЃС‚Р°С‚СЊ СЃРґРµР»РєРѕР№ РІ Р¶СѓСЂРЅР°Р»Рµ, С‡С‚РѕР±С‹ СЃСЂР°РІРЅРёС‚СЊ РїР»Р°РЅ Рё СЂРµР°Р»СЊРЅРѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ."],
        ["РљРѕСѓС‡РёРЅРі РїРѕ РёСЃС…РѕРґСѓ", "Р’Р·СЏС‚С‹Рµ, РїСЂРѕРїСѓС‰РµРЅРЅС‹Рµ Рё РїСЂРѕРёРіРЅРѕСЂРёСЂРѕРІР°РЅРЅС‹Рµ СЂРµС€РµРЅРёСЏ РїРѕРєР°Р·С‹РІР°СЋС‚ СѓРїСѓС‰РµРЅРЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё, С…РѕСЂРѕС€РёРµ РїСЂРѕРїСѓСЃРєРё Рё СЃР»Р°Р±РѕРµ РёСЃРїРѕР»РЅРµРЅРёРµ."],
      ],
      comparisonTitle: "РЎСЂР°РІРЅРµРЅРёРµ С‚Р°СЂРёС„РѕРІ",
      comparisonText: "Р’С‹Р±РµСЂРё С‚Р°СЂРёС„ РїРѕРґ С‚РµРєСѓС‰РёР№ С‚РѕСЂРіРѕРІС‹Р№ РїСЂРѕС†РµСЃСЃ.",
      comparison: [
        ["Р¤СѓРЅРєС†РёСЏ", "Core", "Edge", "Elite"],
        ["Р–СѓСЂРЅР°Р» + СЃРєСЂРёРЅС€РѕС‚С‹", "Р”Р°", "Р”Р°", "Р”Р°"],
        ["AI-РєРѕСѓС‡", "50 / РјРµСЃСЏС†", "200 / РјРµСЃСЏС†", "1 000 / РјРµСЃСЏС†"],
        ["AI-Р°РЅР°Р»РёР· Р¶СѓСЂРЅР°Р»Р°", "10 / РјРµСЃСЏС†", "50 / РјРµСЃСЏС†", "300 / РјРµСЃСЏС†"],
        ["AI-Р°РЅР°Р»РёР· РіСЂР°С„РёРєР°", "20 / РјРµСЃСЏС†", "100 / РјРµСЃСЏС†", "500 / РјРµСЃСЏС†"],
        ["AI-РѕС‚С‡С‘С‚С‹", "вЂ”", "30 / РјРµСЃСЏС†", "150 / РјРµСЃСЏС†"],
        ["AI-СЃРєР°РЅРµСЂ", "вЂ”", "Р”Р°", "Р”Р°"],
        ["AI-СЃРёРіРЅР°Р»С‹", "вЂ”", "вЂ”", "Р”Р°"],
        ["Р›СѓС‡С€Рµ РІСЃРµРіРѕ РґР»СЏ", "Р”РёСЃС†РёРїР»РёРЅС‹", "РђРєС‚РёРІРЅРѕРіРѕ СЂР°Р·Р±РѕСЂР°", "AI Trading Desk"],
      ],
      finalTitle: "Р§РµСЃС‚РЅР°СЏ СЂРµРєРѕРјРµРЅРґР°С†РёСЏ",
      finalText:
        "Р’С‹Р±РёСЂР°Р№ Core РґР»СЏ СЃС‚СЂСѓРєС‚СѓСЂС‹, Edge РґР»СЏ СЂС‹РЅРѕС‡РЅРѕРіРѕ РёРЅС‚РµР»Р»РµРєС‚Р° Рё Р°РєС‚РёРІРЅРѕРіРѕ СЂР°Р·Р±РѕСЂР°, Elite РґР»СЏ AI-СЃРёРіРЅР°Р»РѕРІ Рё РїРѕР»РЅРѕРіРѕ workflow СЃРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р».",
      disclaimer:
        "SkillEdge AI РЅРµ СЏРІР»СЏРµС‚СЃСЏ С„РёРЅР°РЅСЃРѕРІРѕР№ СЂРµРєРѕРјРµРЅРґР°С†РёРµР№ Рё РЅРµ РіР°СЂР°РЅС‚РёСЂСѓРµС‚ РїСЂРёР±С‹Р»СЊ. РџР»Р°С‚С„РѕСЂРјР° СЃРѕР·РґР°РЅР° РґР»СЏ СѓР»СѓС‡С€РµРЅРёСЏ СЃС‚СЂСѓРєС‚СѓСЂС‹, СЂР°Р·Р±РѕСЂР°, РєР°С‡РµСЃС‚РІР° СЂРµС€РµРЅРёР№ Рё С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°.",
    },
    teamPage: {
      heroBadge: "Рћ SkillEdge AI",
      heroTitle: "РњС‹ СЃС‚СЂРѕРёРј AI-СЃРёСЃС‚РµРјСѓ РґР»СЏ С‚СЂРµР№РґРёРЅРіР°, РєРѕС‚РѕСЂСѓСЋ СЃРµСЂСЊС‘Р·РЅС‹Рµ С‚СЂРµР№РґРµСЂС‹ С…РѕС‚РµР»Рё Р±С‹ РёРјРµС‚СЊ СѓР¶Рµ СЃРµР№С‡Р°СЃ.",
      heroText:
        "SkillEdge AI СЃРѕР·РґР°С‘С‚СЃСЏ РІРѕРєСЂСѓРі РѕРґРЅРѕР№ РёРґРµРё: С‚СЂРµР№РґРµСЂР°Рј РЅРµ РЅСѓР¶РµРЅ РµС‰С‘ Р±РѕР»СЊС€РёР№ С€СѓРј. РРј РЅСѓР¶РЅР° СЃРёСЃС‚РµРјР°, РєРѕС‚РѕСЂР°СЏ СЃРѕРµРґРёРЅСЏРµС‚ СЂС‹РЅРѕС‡РЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё, Р¶СѓСЂРЅР°Р», РґРёСЃС†РёРїР»РёРЅСѓ РёСЃРїРѕР»РЅРµРЅРёСЏ, РѕР±СѓС‡РµРЅРёРµ Рё Р»РёС‡РЅС‹Р№ РїСЂРѕРіСЂРµСЃСЃ.",
      ctaProduct: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ РїСЂРѕРґСѓРєС‚",
      ctaPricing: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ С‚Р°СЂРёС„С‹",
      philosophyBadge: "Р¤РёР»РѕСЃРѕС„РёСЏ РїСЂРѕРґСѓРєС‚Р°",
      philosophyTitle: "РџСЂРѕС†РµСЃСЃ РІР°Р¶РЅРµРµ РїСЂРµРґСЃРєР°Р·Р°РЅРёР№",
      beliefs: [
        "РЎРёРіРЅР°Р»С‹ Р±РµР· РѕР±СѓС‡РµРЅРёСЏ СЃРѕР·РґР°СЋС‚ Р·Р°РІРёСЃРёРјРѕСЃС‚СЊ.",
        "РЎРґРµР»РєСѓ Р±РµР· РїР»Р°РЅР° РЅРµРІРѕР·РјРѕР¶РЅРѕ РЅРѕСЂРјР°Р»СЊРЅРѕ СЂР°Р·РѕР±СЂР°С‚СЊ.",
        "Р–СѓСЂРЅР°Р» Р±РµР· РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё РїСЂРµРІСЂР°С‰Р°РµС‚СЃСЏ РІ РєР»Р°РґР±РёС‰Рµ СЃС‚Р°СЂС‹С… СЃРґРµР»РѕРє.",
        "Р›СѓС‡С€РёР№ РїСЂРѕРґСѓРєС‚ РґРµР»Р°РµС‚ С‚СЂРµР№РґРµСЂР° СЃРїРѕРєРѕР№РЅРµРµ, РѕСЃС‚СЂРµРµ Рё РґРёСЃС†РёРїР»РёРЅРёСЂРѕРІР°РЅРЅРµРµ.",
        "РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ AI-СЃРёРіРЅР°Р»С‹ СЃС‚Р°РЅРѕРІСЏС‚СЃСЏ СЃРёР»СЊРЅС‹РјРё С‚РѕР»СЊРєРѕ С‚РѕРіРґР°, РєРѕРіРґР° С‚СЂРµР№РґРµСЂ СЃРѕР±РёСЂР°РµС‚ С‡РёСЃС‚СѓСЋ РёСЃС‚РѕСЂРёСЋ СЃРґРµР»РѕРє.",
      ],
      storyEyebrow: "РќР°С€Р° РёСЃС‚РѕСЂРёСЏ",
      storyTitle: "SkillEdge AI СЃРѕР·РґР°С‘С‚СЃСЏ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ РґРёСЃС†РёРїР»РёРЅР°, СЃС‚СЂСѓРєС‚СѓСЂР° Рё РёР·РјРµСЂРёРјС‹Р№ РїСЂРѕРіСЂРµСЃСЃ.",
      storyText:
        "РџСЂРѕРґСѓРєС‚ РІС‹СЂРѕСЃ РёР· РїСЂРѕР±Р»РµРјС‹, СЃ РєРѕС‚РѕСЂРѕР№ СЃС‚Р°Р»РєРёРІР°СЋС‚СЃСЏ РјРЅРѕРіРёРµ Р°РєС‚РёРІРЅС‹Рµ С‚СЂРµР№РґРµСЂС‹: СЂС‹РЅРѕРє РґР°С‘С‚ СЃР»РёС€РєРѕРј РјРЅРѕРіРѕ РёРЅС„РѕСЂРјР°С†РёРё, РЅРѕ РїРѕС‡С‚Рё РЅРµ РґР°С‘С‚ С‡РµСЃС‚РЅРѕР№ РѕР±СЂР°С‚РЅРѕР№ СЃРІСЏР·Рё РїРѕ РёСЃРїРѕР»РЅРµРЅРёСЋ. SkillEdge AI РґРѕР»Р¶РµРЅ СЃРІСЏР·Р°С‚СЊ СЂРµС€РµРЅРёСЏ С‚СЂРµР№РґРµСЂР°, СЃРєСЂРёРЅС€РѕС‚С‹, Р¶СѓСЂРЅР°Р», СЃРёРіРЅР°Р»С‹ Рё РёСЃС…РѕРґС‹ РІ РѕРґРЅСѓ СЃРµСЂСЊС‘Р·РЅСѓСЋ СЃРёСЃС‚РµРјСѓ СЂР°Р·Р±РѕСЂР°.",
      teamEyebrow: "РЎС‚СЂСѓРєС‚СѓСЂР° РєРѕРјР°РЅРґС‹",
      teamTitle: "РЎС‚СЂР°РЅРёС†Р° РїРѕСЃС‚СЂРѕРµРЅР° РєР°Рє РєРѕРјР°РЅРґР° РїСЂРѕРґСѓРєС‚Р°: С‚СЂРµР№РґРёРЅРі, РїСЂРѕРґСѓРєС‚, РґР°РЅРЅС‹Рµ Рё РїРѕРґРґРµСЂР¶РєР°.",
      teamText:
        "Р­С‚Рё РєР°СЂС‚РѕС‡РєРё вЂ” РіРѕС‚РѕРІС‹Р№ РјР°РєРµС‚ About Us. РџРѕР·Р¶Рµ С‚С‹ СЃРјРѕР¶РµС€СЊ РІСЃС‚Р°РІРёС‚СЊ СЂРµР°Р»СЊРЅС‹Рµ С„РѕС‚Рѕ, РёРјРµРЅР° Рё СЂРѕР»Рё Р±РµР· РёР·РјРµРЅРµРЅРёСЏ СЃС‚СЂСѓРєС‚СѓСЂС‹ СЃС‚СЂР°РЅРёС†С‹.",
      teamCards: [
        ["РћСЃРЅРѕРІР°С‚РµР»СЊ / РІРёРґРµРЅРёРµ РїСЂРѕРґСѓРєС‚Р°", "РћС‚РІРµС‡Р°РµС‚ Р·Р° РЅР°РїСЂР°РІР»РµРЅРёРµ РїСЂРѕРґСѓРєС‚Р°, workflow С‚СЂРµР№РґРµСЂР°, С‚Р°СЂРёС„РЅСѓСЋ Р»РѕРіРёРєСѓ Рё premium-РїРѕР·РёС†РёРѕРЅРёСЂРѕРІР°РЅРёРµ."],
        ["Trading Research", "РћРїСЂРµРґРµР»СЏРµС‚ СЃРµС‚Р°РїС‹, Р»РѕРіРёРєСѓ СЃРёРіРЅР°Р»РѕРІ, РєСЂРёС‚РµСЂРёРё СЂР°Р·Р±РѕСЂР° Р¶СѓСЂРЅР°Р»Р° Рё РѕР±СЂР°Р·РѕРІР°С‚РµР»СЊРЅС‹Рµ РїР»РµР№Р±СѓРєРё."],
        ["AI Рё РґР°РЅРЅС‹Рµ", "РЎС‚СЂРѕРёС‚ Р»РѕРіРёРєСѓ СЃРєР°РЅРµСЂР°, AI-РїСЂРѕРјРїС‚С‹, РѕР±РѕРіР°С‰РµРЅРёРµ РґР°РЅРЅС‹С…, Р»РёРјРёС‚С‹ Рё backend-gates."],
        ["Р”РёР·Р°Р№РЅ Рё РѕРїС‹С‚", "Р¤РѕСЂРјРёСЂСѓРµС‚ dashboard, РїСѓР±Р»РёС‡РЅС‹Рµ СЃС‚СЂР°РЅРёС†С‹, locked states, loading states Рё premium-РёРЅС‚РµСЂС„РµР№СЃ."],
        ["Support Operations", "Р—Р°РєСЂС‹РІР°РµС‚ РІРѕРїСЂРѕСЃС‹ РєР»РёРµРЅС‚РѕРІ РїРѕ РїСЂРѕРґСѓРєС‚Сѓ, РѕРїР»Р°С‚Рµ, РґРѕСЃС‚СѓРїСѓ Рё РѕРїРµСЂР°С‚РѕСЂСЃРєРѕРјСѓ РїРѕС‚РѕРєСѓ."],
        ["Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ Рё РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°", "Р—Р°С‰РёС‰Р°РµС‚ routes, API-РєР»СЋС‡Рё, Supabase-РґРѕСЃС‚СѓРї, rate limits Рё production-РґРµРїР»РѕР№."],
      ],
      principlesEyebrow: "РџСЂРёРЅС†РёРїС‹",
      principlesTitle: "РЎРµСЂСЊС‘Р·РЅС‹Р№ trading-РїСЂРѕРґСѓРєС‚ РґРѕР»Р¶РµРЅ С‡РµСЃС‚РЅРѕ РіРѕРІРѕСЂРёС‚СЊ Рѕ СЂРёСЃРєРµ Рё СЃС‚СЂРѕРёС‚СЊСЃСЏ РІРѕРєСЂСѓРі РїСЂРѕС†РµСЃСЃР°.",
      principles: [
        ["РќРёРєР°РєРѕР№ С„Р°Р»СЊС€РёРІРѕР№ СѓРІРµСЂРµРЅРЅРѕСЃС‚Рё", "Р’ С‚СЂРµР№РґРёРЅРіРµ РµСЃС‚СЊ СЂРёСЃРє. SkillEdge AI РЅРµ РґРѕР»Р¶РµРЅ РґРµР»Р°С‚СЊ РІРёРґ, С‡С‚Рѕ РјРѕРґРµР»СЊ РёР»Рё СЃРёРіРЅР°Р» РјРѕРіСѓС‚ РіР°СЂР°РЅС‚РёСЂРѕРІР°С‚СЊ РїСЂРёР±С‹Р»СЊ."],
        ["РџСЂРѕР·СЂР°С‡РЅР°СЏ Р»РѕРіРёРєР°", "РљР»РёРµРЅС‚ РґРѕР»Р¶РµРЅ РїРѕРЅРёРјР°С‚СЊ, РїРѕС‡РµРјСѓ РїРѕСЏРІРёР»СЃСЏ СЃРёРіРЅР°Р», РєР°РєРёРµ РёСЃС‚РѕС‡РЅРёРєРё РѕС‚СЃР»РµР¶РёРІР°СЋС‚СЃСЏ Рё С‡С‚Рѕ РІ РёРґРµРµ СЃРёР»СЊРЅРѕРµ РёР»Рё СЃР»Р°Р±РѕРµ."],
        ["Premium-РјС‹С€Р»РµРЅРёРµ", "РљР°Р¶РґР°СЏ С„СѓРЅРєС†РёСЏ РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РїРѕР»РµР·РЅРѕР№, СЃРµСЂСЊС‘Р·РЅРѕР№ Рё СЃРІСЏР·Р°РЅРЅРѕР№ СЃ СЂРµР°Р»СЊРЅС‹Рј РїСЂРѕС†РµСЃСЃРѕРј С‚СЂРµР№РґРµСЂР°."],
      ],
      roadmapEyebrow: "РџР»Р°РЅ СЂР°Р·РІРёС‚РёСЏ",
      roadmapTitle: "РњС‹ СЃС‚СЂРѕРёРј РїСЂРѕРґСѓРєС‚ РІ СЃС‚РѕСЂРѕРЅСѓ premium AI Trading Desk.",
      roadmapText:
        "Launch-РѕСЃРЅРѕРІР° СѓР¶Рµ РїСЂРѕРґСѓРєС‚РѕРІР°СЏ: Р¶СѓСЂРЅР°Р», СЃРёРіРЅР°Р»С‹, РѕР±СѓС‡РµРЅРёРµ, РѕС‚С‡С‘С‚С‹, РїРѕРґРґРµСЂР¶РєР°, РѕРїР»Р°С‚Р° Рё СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°. РЎР»РµРґСѓСЋС‰РёР№ СЃР»РѕР№ вЂ” premium data, РїРѕР»РЅС‹Р№ market scan Рё РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ СЃРёРіРЅР°Р»С‹ РЅР° Р±Р°Р·Рµ РёСЃС‚РѕСЂРёРё РєР»РёРµРЅС‚Р°.",
      roadmap: [
        ["01", "Launch foundation", "Р–СѓСЂРЅР°Р», dashboard, СЃРєСЂРёРЅС€РѕС‚С‹, РѕР±СѓС‡РµРЅРёРµ, РѕС‚С‡С‘С‚С‹, crypto-РґРѕСЃС‚СѓРї Рё С„СѓРЅРґР°РјРµРЅС‚ РїРѕРґРґРµСЂР¶РєРё."],
        ["02", "РЎРёРіРЅР°Р»С‹ Рё РїРѕРІРµРґРµРЅРёРµ", "AI-СЃРёРіРЅР°Р»С‹, РѕС‚СЃР»РµР¶РёРІР°РЅРёРµ СЂРµС€РµРЅРёР№, РїРѕРґРіРѕС‚РѕРІРєР° СЃРґРµР»РѕРє, РѕР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С… Рё РєРѕСѓС‡РёРЅРі СѓРїСѓС‰РµРЅРЅС‹С… РІРѕР·РјРѕР¶РЅРѕСЃС‚РµР№."],
        ["03", "Premium data", "РџРѕР»РЅРѕРµ РїРѕРєСЂС‹С‚РёРµ С‚РёРєРµСЂРѕРІ, Binance universe, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹, heatmaps, halt screener Рё Р±РѕР»РµРµ СЃРёР»СЊРЅР°СЏ Р»РѕРіРёРєР° СЃРєР°РЅРµСЂР°."],
        ["04", "Р›РёС‡РЅРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ", "AI СѓС‡РёС‚СЃСЏ РЅР° Р»СѓС‡С€РёС… СЃРµС‚Р°РїР°С… РєР»РёРµРЅС‚Р°, СЃР»Р°Р±С‹С… РїР°С‚С‚РµСЂРЅР°С…, РѕС€РёР±РєР°С… РёСЃРїРѕР»РЅРµРЅРёСЏ Рё РёСЃС‚РѕСЂРёРё Р¶СѓСЂРЅР°Р»Р°."],
      ],
      finalTitle: "РџРѕРјРѕС‡СЊ С‚СЂРµР№РґРµСЂР°Рј РІС‹Р№С‚Рё РёР· С…Р°РѕСЃР° Рё РЅР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Р°С‚СЊ С‡РµСЂРµР· СЃРёСЃС‚РµРјСѓ.",
      finalText:
        "SkillEdge AI СЃРѕР·РґР°РЅ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рµ С…РѕС‚СЏС‚ РіР»СѓР±Р¶Рµ СЂР°Р·Р±РёСЂР°С‚СЊ, С‡РёС‰Рµ РґСѓРјР°С‚СЊ, РґРёСЃС†РёРїР»РёРЅРёСЂРѕРІР°РЅРЅРµРµ РёСЃРїРѕР»РЅСЏС‚СЊ Рё СЃС‚СЂРѕРёС‚СЊ РїРѕРІС‚РѕСЂСЏРµРјРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ РЅР° СЂРµР°Р»СЊРЅС‹С… РґР°РЅРЅС‹С…, Р° РЅРµ РЅР° СЌРјРѕС†РёСЏС… Рё РїР°РјСЏС‚Рё.",
    },
    footer: {
      description:
        "Premium AI-РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ РґР»СЏ СЃРµСЂСЊС‘Р·РЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ: СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°, AI-СЃРёРіРЅР°Р»С‹, Р¶СѓСЂРЅР°Р», СЂР°Р·Р±РѕСЂ РёСЃРїРѕР»РЅРµРЅРёСЏ, РїР»РµР№Р±СѓРє, РѕС‚С‡С‘С‚С‹ Рё РєРѕСѓС‡РёРЅРі РІ РѕРґРЅРѕР№ СЃРёСЃС‚РµРјРµ.",
      product: "РџСЂРѕРґСѓРєС‚",
      features: "Р¤СѓРЅРєС†РёРё",
      resources: "Р РµСЃСѓСЂСЃС‹",
      legal: "Р”РѕРєСѓРјРµРЅС‚С‹",
      productLinks: ["Р“Р»Р°РІРЅР°СЏ", "РџСЂРѕРґСѓРєС‚", "РўР°СЂРёС„С‹", "Рћ РЅР°СЃ"],
      featureLinks: ["AI Trading Desk", "AI-СЃРёРіРЅР°Р»С‹", "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°", "Р–СѓСЂРЅР°Р» Рё СЃРєСЂРёРЅС€РѕС‚С‹", "РљРѕСѓС‡ РёСЃРїРѕР»РЅРµРЅРёСЏ", "РћР±СѓС‡РµРЅРёРµ РЅР° РёСЃС…РѕРґР°С…", "РџР»РµР№Р±СѓРє", "РћС‚С‡С‘С‚С‹", "Р¦РµРЅС‚СЂ РѕР±СѓС‡РµРЅРёСЏ", "РџРѕРјРѕС‰РЅРёРє РїРѕРґРґРµСЂР¶РєРё"],
      resourceLinks: ["РќР°С‡Р°Р»Рѕ СЂР°Р±РѕС‚С‹", "РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ SkillEdge", "Р“Р°Р№Рґ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СЃРґРµР»РѕРє", "Р“Р°Р№Рґ РїРѕ AI-СЃРёРіРЅР°Р»Р°Рј", "РЎРІСЏР·Р°С‚СЊСЃСЏ СЃ РїРѕРґРґРµСЂР¶РєРѕР№"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "РќР°СЃС‚СЂРѕР№РєРё cookie",
      choosePlan: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
      requestDemo: "Р—Р°РїСЂРѕСЃРёС‚СЊ РґРµРјРѕ",
      risk:
        "SkillEdge AI РЅРµ СЏРІР»СЏРµС‚СЃСЏ С„РёРЅР°РЅСЃРѕРІРѕР№ СЂРµРєРѕРјРµРЅРґР°С†РёРµР№ Рё РЅРµ РіР°СЂР°РЅС‚РёСЂСѓРµС‚ РїСЂРёР±С‹Р»СЊ. РџР»Р°С‚С„РѕСЂРјР° СЃРѕР·РґР°РЅР° РґР»СЏ СѓР»СѓС‡С€РµРЅРёСЏ СЃС‚СЂСѓРєС‚СѓСЂС‹, СЂР°Р·Р±РѕСЂР°, РєР°С‡РµСЃС‚РІР° СЂРµС€РµРЅРёР№ Рё С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°.",
      contact: "РљРѕРЅС‚Р°РєС‚С‹",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Р”РµРјРѕ РїСЂРѕРґСѓРєС‚Р° РїРѕ Р·Р°РїСЂРѕСЃСѓ",
      rights: "В© 2026 SkillEdge AI. Р’СЃРµ РїСЂР°РІР° Р·Р°С‰РёС‰РµРЅС‹.",
      bottom: "РЎРѕР·РґР°РЅРѕ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»РёРЅР° Рё РёР·РјРµСЂРёРјС‹Р№ РїСЂРѕРіСЂРµСЃСЃ.",
    },
    auth: {
      login: "Р’С…РѕРґ",
      register: "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ",
      email: "Email",
      password: "РџР°СЂРѕР»СЊ",
      close: "Р—Р°РєСЂС‹С‚СЊ",
      loginTitle: "Р’С…РѕРґ РІ SkillEdge AI",
      registerTitle: "РЎРѕР·РґР°С‚СЊ Р°РєРєР°СѓРЅС‚",
      loginButton: "Р’РѕР№С‚Рё",
      registerButton: "Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ",
      dashboard: "РљР°Р±РёРЅРµС‚",
      logout: "Р’С‹Р№С‚Рё",
      switchToLogin: "РЈР¶Рµ РµСЃС‚СЊ Р°РєРєР°СѓРЅС‚? Р’РѕР№С‚Рё",
      switchToRegister: "РќРµС‚ Р°РєРєР°СѓРЅС‚Р°? Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ",
      checking: "РџСЂРѕРІРµСЂСЏРµРј Р°РєРєР°СѓРЅС‚...",
      creatingAccount: "РЎРѕР·РґР°С‘Рј Р°РєРєР°СѓРЅС‚...",
      creatingInvoice: "РЎРѕР·РґР°С‘Рј РєСЂРёРїС‚Рѕ-СЃС‡С‘С‚...",
      loginRequired: "Р’РѕР№РґРёС‚Рµ РёР»Рё Р·Р°СЂРµРіРёСЃС‚СЂРёСЂСѓР№С‚РµСЃСЊ, С‡С‚РѕР±С‹ РѕРїР»Р°С‚РёС‚СЊ С‚Р°СЂРёС„.",
      afterRegister: "РђРєРєР°СѓРЅС‚ СЃРѕР·РґР°РЅ. Р•СЃР»Рё РЅСѓР¶РЅРѕ, РїРѕРґС‚РІРµСЂРґРёС‚Рµ email.",
      authError: "РћС€РёР±РєР° Р°РІС‚РѕСЂРёР·Р°С†РёРё.",
    },
  },
  ua: {
    lang: "UA",
    switchLanguage: "РњРѕРІР°",
    brandTag: "Р†РЅС‚РµР»РµРєС‚ РµС„РµРєС‚РёРІРЅРѕСЃС‚С–",
    requestDemo: "Р—Р°РїСЂРѕСЃРёС‚Рё РґРµРјРѕ",
    choosePlan: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
    viewProduct: "РџРµСЂРµРіР»СЏРЅСѓС‚Рё РїСЂРѕРґСѓРєС‚",
    viewPricing: "РџРµСЂРµРіР»СЏРЅСѓС‚Рё С‚Р°СЂРёС„Рё",
    viewAbout: "РџСЂРѕ РЅР°СЃ",
    nav: {
      home: "Р“РѕР»РѕРІРЅР°",
      product: "РџСЂРѕРґСѓРєС‚",
      pricing: "РўР°СЂРёС„Рё",
      team: "РџСЂРѕ РЅР°СЃ",
    },
    heroBadge: "Premium AI-РїР»Р°С‚С„РѕСЂРјР° РґР»СЏ С‚СЂРµР№РґРµСЂР°",
    heroTitle: "РџРµСЂРµС‚РІРѕСЂРё СЂРёРЅРєРѕРІРёР№ С€СѓРј, С–СЃС‚РѕСЂС–СЋ СѓРіРѕРґ С– РїРѕРјРёР»РєРё РІРёРєРѕРЅР°РЅРЅСЏ РЅР° Р·СЂРѕР·СѓРјС–Р»С–С€РёР№ С‚РѕСЂРіРѕРІРёР№ РїСЂРѕС†РµСЃ.",
    heroText:
      "SkillEdge AI РїРѕС”РґРЅСѓС” Р¶СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё, Р°РЅР°Р»С–Р· РіСЂР°С„С–РєС–РІ, СЂРёРЅРєРѕРІСѓ СЂРѕР·РІС–РґРєСѓ, AI-СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»Рё, Р·РІС–С‚Рё С‚Р° РЅР°РІС‡Р°РЅРЅСЏ РІ РѕРґРЅРѕРјСѓ premium-РїСЂРѕСЃС‚РѕСЂС– вЂ” Р±РµР· РѕР±С–С†СЏРЅРѕРє РїСЂРёР±СѓС‚РєСѓ С– Р±РµР· Р·Р°РјС–РЅРё С‚РІРѕРіРѕ РІР»Р°СЃРЅРѕРіРѕ СЂС–С€РµРЅРЅСЏ.",
    start: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
    tour: "РџРµСЂРµРіР»СЏРЅСѓС‚Рё РїСЂРѕРґСѓРєС‚",
    stats: [
      ["Private beta", "СЃС‚РІРѕСЂСЋС”С‚СЊСЃСЏ РґР»СЏ СЃРµСЂР№РѕР·РЅРёС… Р°РєС‚РёРІРЅРёС… С‚СЂРµР№РґРµСЂС–РІ"],
      ["Р–СѓСЂРЅР°Р» РІ РѕСЃРЅРѕРІС–", "С‚РІРѕС— СѓРіРѕРґРё СЃС‚Р°СЋС‚СЊ РґР¶РµСЂРµР»РѕРј РґР°РЅРёС…"],
      ["Edge+", "РґРѕСЃС‚СѓРї РґРѕ СЃРєР°РЅРµСЂР° С‚Р° СЂРёРЅРєРѕРІРѕРіРѕ Р±СЂРёС„Сѓ"],
    ],
    problemEyebrow: "РџСЂРѕР±Р»РµРјР°",
    problemTitle: "Р‘С–Р»СЊС€РѕСЃС‚С– С‚СЂРµР№РґРµСЂС–РІ РЅРµ РїРѕС‚СЂС–Р±РµРЅ С‰Рµ Р±С–Р»СЊС€РёР№ С€СѓРј. Р‡Рј РїРѕС‚СЂС–Р±РµРЅ С‡РёСЃС‚С–С€РёР№ РїСЂРѕС†РµСЃ.",
    problemText:
      "Р“СЂР°С„С–РєРё, СЃРєСЂС–РЅС€РѕС‚Рё, РµРјРѕС†С–С—, СЃРїРёСЃРєРё СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ, РЅРѕС‚Р°С‚РєРё Р№ РїРѕРјРёР»РєРё С‡Р°СЃС‚Рѕ Р¶РёРІСѓС‚СЊ Сѓ СЂС–Р·РЅРёС… РјС–СЃС†СЏС…. SkillEdge AI Р·Р±РёСЂР°С” С—С… РІ РѕРґРёРЅ СЂРѕР±РѕС‡РёР№ РїСЂРѕС†РµСЃ, С‰РѕР± С‚СЂРµР№РґРµСЂ РјС–Рі СЂРѕР·Р±РёСЂР°С‚Рё СЂС–С€РµРЅРЅСЏ, СЂРѕР·СѓРјС–С‚Рё РїР°С‚РµСЂРЅРё С‚Р° Р±СѓРґСѓРІР°С‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅСѓ СЃРёСЃС‚РµРјСѓ.",
    homeSections: {
      whyTitle: "Р©Рѕ РґРѕРїРѕРјР°РіР°С” РѕСЂРіР°РЅС–Р·СѓРІР°С‚Рё SkillEdge AI",
      whyText:
        "РџР»Р°С‚С„РѕСЂРјР° РїРѕР±СѓРґРѕРІР°РЅР° РЅР°РІРєРѕР»Рѕ СЂРµР°Р»СЊРЅРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ С†РёРєР»Сѓ: Р·РЅР°Р№С‚Рё РІР°Р¶Р»РёРІРµ, СЃРїР»Р°РЅСѓРІР°С‚Рё СѓРіРѕРґСѓ, РІРёРєРѕРЅР°С‚Рё РґРёСЃС†РёРїР»С–РЅРѕРІР°РЅРѕ, Р·Р°РїРёСЃР°С‚Рё СЂРµР·СѓР»СЊС‚Р°С‚ С– Р·СЂРѕР±РёС‚Рё РІРёСЃРЅРѕРІРѕРє С–Р· СЂРµР·СѓР»СЊС‚Р°С‚Сѓ.",
      cards: [
        ["Р–СѓСЂРЅР°Р» С– СЃРєСЂС–РЅС€РѕС‚Рё", "Р¤С–РєСЃСѓР№ СѓРіРѕРґРё, СЃРєСЂС–РЅС€РѕС‚Рё, РµРјРѕС†С–С—, РїРѕРјРёР»РєРё, СЂРёР·РёРє С– СѓСЂРѕРєРё РІ РѕРґРЅРѕРјСѓ РјС–СЃС†С–."],
        ["AI-РєРѕСѓС‡", "РћС‚СЂРёРјСѓР№ СЃС‚СЂСѓРєС‚СѓСЂРЅРёР№ СЂРѕР·Р±С–СЂ Р»РѕРіС–РєРё СѓРіРѕРґРё, СЂРёР·РёРєСѓ, РґРёСЃС†РёРїР»С–РЅРё С‚Р° СЏРєРѕСЃС‚С– СЂС–С€РµРЅРЅСЏ."],
        ["Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°", "Edge С‚Р° Elite РІС–РґРєСЂРёРІР°СЋС‚СЊ С€Р°СЂ СЃРєР°РЅРµСЂР° РґР»СЏ Р°РєС†С–Р№, РєСЂРёРїС‚Рё Р№ Р°РєС‚СѓР°Р»СЊРЅРѕРіРѕ СЂРёРЅРєРѕРІРѕРіРѕ РєРѕРЅС‚РµРєСЃС‚Сѓ."],
        ["AI-СЃРёРіРЅР°Р»Рё", "Elite РІС–РґРєСЂРёРІР°С” premium-СЃРёРіРЅР°Р»Рё С–Р· СЃРµС‚Р°РїРѕРј, С‚СЂРёРіРµСЂРѕРј, Р·РѕРЅРѕСЋ РІС…РѕРґСѓ, СЃС‚РѕРїРѕРј, С†С–Р»СЏРјРё С‚Р° СЂРѕР·Р±РѕСЂРѕРј СЂРµР·СѓР»СЊС‚Р°С‚Сѓ."],
      ],
    },
    productPage: {
      heroBadge: "РџСЂРѕРґСѓРєС‚",
      heroTitle: "Р„РґРёРЅРёР№ СЂРѕР±РѕС‡РёР№ РїСЂРѕСЃС‚С–СЂ РґР»СЏ С‚РѕСЂРіРѕРІРѕС— РµС„РµРєС‚РёРІРЅРѕСЃС‚С–.",
      heroText:
        "SkillEdge AI СЃС‚РІРѕСЂСЋС”С‚СЊСЃСЏ СЏРє premium trading operating system: Р¶СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё, AI-РєРѕСѓС‡, Р·РІС–С‚Рё, РіСЂР°С„С–РєРё, СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»Рё, РїР»РµР№Р±СѓРє С– РїС–РґС‚СЂРёРјРєР° РІ РѕРґРЅРѕРјСѓ С‡РёСЃС‚РѕРјСѓ РїСЂРѕС†РµСЃС–.",
      ctaPrimary: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
      ctaSecondary: "РќР°РІС–С‰Рѕ РјРё С†Рµ Р±СѓРґСѓС”РјРѕ",
      heroCards: [
        ["AI Trading Desk", "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°, СЃРёРіРЅР°Р»Рё, Р¶СѓСЂРЅР°Р» С– РєРѕСѓС‡РёРЅРі РІ РѕРґРЅС–Р№ СЃРёСЃС‚РµРјС–."],
        ["РЎРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р»", "РЎС‚РІРѕСЂСЋР№ СѓРіРѕРґРё С–Р· СЃРёРіРЅР°Р»С–РІ С‚Р° РїРѕСЂС–РІРЅСЋР№ РїР»Р°РЅ С–Р· СЂРµР°Р»СЊРЅРёРј РІРёРєРѕРЅР°РЅРЅСЏРј."],
        ["РћСЃРѕР±РёСЃС‚Р° РїРµСЂРµРІР°РіР°", "Р”РѕРІРіРѕСЃС‚СЂРѕРєРѕРІР° Р°СЂС…С–С‚РµРєС‚СѓСЂР° Р±СѓРґСѓС”С‚СЊСЃСЏ РЅР°РІРєРѕР»Рѕ РЅР°Р№РєСЂР°С‰РёС… С– РЅР°Р№РіС–СЂС€РёС… РїР°С‚РµСЂРЅС–РІ СЃР°РјРѕРіРѕ С‚СЂРµР№РґРµСЂР°."],
      ],
      deskTitle: "Trading desk РјР°С” РґР°РІР°С‚Рё РєРѕРЅС‚РµРєСЃС‚, Р° РЅРµ СЃР»С–РїС– РєРѕРјР°РЅРґРё.",
      deskText:
        "SkillEdge AI РјР°С” РїРѕСЏСЃРЅСЋРІР°С‚Рё, С‡РѕРјСѓ СЃРёС‚СѓР°С†С–СЏ РІР°Р¶Р»РёРІР°, С‰Рѕ С—С— РїС–РґС‚РІРµСЂРґР¶СѓС”, С‰Рѕ СЃРєР°СЃРѕРІСѓС” С– РґРµ СЂРёР·РёРє. РњРµС‚Р° вЂ” РєСЂР°С‰Р° СЏРєС–СЃС‚СЊ СЂС–С€РµРЅСЊ, Р° РЅРµ СЃР»С–РїР° Р·Р°Р»РµР¶РЅС–СЃС‚СЊ РІС–Рґ СЃРёРіРЅР°Р»С–РІ.",
      deskCards: [
        ["Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°", "Р—РЅР°С…РѕРґСЊ Р°РєС†С–С— С‚Р° РєСЂРёРїС‚Сѓ, СЏРєС– Р·Р°СЃР»СѓРіРѕРІСѓСЋС‚СЊ СѓРІР°РіРё, РЅРµ РІРёС‚СЂР°С‡Р°СЋС‡Рё С‡Р°СЃ РЅР° РјРµСЂС‚РІС– РіСЂР°С„С–РєРё."],
        ["AI-СЃРєР°РЅРµСЂ", "Edge С‚Р° Elite РѕС‚СЂРёРјСѓСЋС‚СЊ AI Market Brief РїРѕ РЅР°Р№РєСЂР°С‰РёС… Р°РєС‚РёРІРЅРёС… РєР°РЅРґРёРґР°С‚Р°С… СЂРёРЅРєСѓ."],
        ["AI-СЃРёРіРЅР°Р»Рё", "Elite РѕС‚СЂРёРјСѓС” СЃС‚СЂСѓРєС‚СѓСЂРѕРІР°РЅС– СЃРёРіРЅР°Р»Рё: СЃРµС‚Р°Рї, РЅР°РїСЂСЏРјРѕРє, С‚СЂРёРіРµСЂ, Р·РѕРЅР° РІС…РѕРґСѓ, СЃС‚РѕРї С– С†С–Р»С–."],
        ["РќР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…", "РџРѕР·РЅР°С‡Р°Р№ РІР·СЏС‚С–, РїСЂРѕРїСѓС‰РµРЅС– С‚Р° РїСЂРѕС–РіРЅРѕСЂРѕРІР°РЅС– СЃРёРіРЅР°Р»Рё, С‰РѕР± РєРѕР¶РµРЅ СЂРµР·СѓР»СЊС‚Р°С‚ СЃС‚Р°РІР°РІ СѓСЂРѕРєРѕРј."],
      ],
      flowEyebrow: "РџСЂРѕС†РµСЃ",
      flowTitle: "Р’С–Рґ СЃРєР°РЅСѓРІР°РЅРЅСЏ СЂРёРЅРєСѓ РґРѕ РѕСЃРѕР±РёСЃС‚РѕРіРѕ РїСЂРѕРіСЂРµСЃСѓ вЂ” РѕРґРёРЅ РїРѕРІвЂ™СЏР·Р°РЅРёР№ С†РёРєР».",
      flowText:
        "РљРѕР¶РЅР° СЃРµСЂР№РѕР·РЅР° С‚РѕСЂРіРѕРІР° С–РґРµСЏ РјР°С” СЃС‚Р°РІР°С‚Рё РґР°РЅРёРјРё: С‰Рѕ РїРѕРєР°Р·Р°РІ СЂРёРЅРѕРє, С‰Рѕ РїР»Р°РЅСѓРІР°РІ С‚СЂРµР№РґРµСЂ, С‰Рѕ Р±СѓР»Рѕ РІРёРєРѕРЅР°РЅРѕ С– С‡РѕРјСѓ РЅР°РІС‡РёРІ СЂРµР·СѓР»СЊС‚Р°С‚.",
      flow: [
        ["01", "Р РёРЅРѕРє РїРѕС‡РёРЅР°С” СЂСѓС…Р°С‚РёСЃСЏ", "SkillEdge РІС–РґСЃС‚РµР¶СѓС” Р°РєС‚РёРІРЅС– Р°РєС†С–С—, РєСЂРёРїС‚Сѓ, РЅРµР·РІРёС‡РЅРёР№ СЂСѓС…, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё С‚Р° СЂРёРЅРєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚."],
        ["02", "AI С„С–Р»СЊС‚СЂСѓС” С€СѓРј", "РЎРёСЃС‚РµРјР° СЂР°РЅР¶СѓС” СЃРёС‚СѓР°С†С–С— Р·Р° СЏРєС–СЃС‚СЋ, СЃРІС–Р¶С–СЃС‚СЋ, СЂРёР·РёРєРѕРј С– СЏСЃРЅС–СЃС‚СЋ СЃРµС‚Р°РїСѓ."],
        ["03", "Р—вЂ™СЏРІР»СЏС”С‚СЊСЃСЏ РїР»Р°РЅ", "РўСЂРµР№РґРµСЂ Р±Р°С‡РёС‚СЊ РЅР°РїСЂСЏРјРѕРє, С‚СЂРёРіРµСЂ, Р·РѕРЅСѓ РІС…РѕРґСѓ, СЃС‚РѕРї, С†С–Р»С–, СЃСѓРїСЂРѕРІС–Рґ С– СЃРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС—."],
        ["04", "Р–СѓСЂРЅР°Р» РїС–РґРєР»СЋС‡Р°С”С‚СЊСЃСЏ", "Р’Р·СЏС‚РёР№ СЃРёРіРЅР°Р» РјРѕР¶Рµ СЃС‚Р°С‚Рё СѓРіРѕРґРѕСЋ РІ Р¶СѓСЂРЅР°Р»С– Р·С– СЃРєСЂС–РЅС€РѕС‚Р°РјРё, РЅРѕС‚Р°С‚РєР°РјРё С‚Р° СЂРѕР·Р±РѕСЂРѕРј РІРёРєРѕРЅР°РЅРЅСЏ."],
        ["05", "РќР°РІС‡Р°РЅРЅСЏ РЅР°РєРѕРїРёС‡СѓС”С‚СЊСЃСЏ", "Р—РІС–С‚Рё, СЂРѕР·Р±С–СЂ СЂРµР·СѓР»СЊС‚Р°С‚С–РІ С– РєРѕСѓС‡РёРЅРі РїРµСЂРµС‚РІРѕСЂСЋСЋС‚СЊ РїРѕРІС‚РѕСЂРµРЅРЅСЏ РЅР° СЃРёР»СЊРЅС–С€РёР№ РїСЂРѕС†РµСЃ."],
      ],
      modulesEyebrow: "РњРѕРґСѓР»С–",
      modulesTitle: "РЈСЃС– С‡Р°СЃС‚РёРЅРё РїСЂРѕРґСѓРєС‚Сѓ РјР°СЋС‚СЊ РїСЂР°С†СЋРІР°С‚Рё СЂР°Р·РѕРј.",
      modulesText:
        "РљРѕР¶РµРЅ РјРѕРґСѓР»СЊ РєРѕСЂРёСЃРЅРёР№ РѕРєСЂРµРјРѕ. Р Р°Р·РѕРј РІРѕРЅРё СЃС‚РІРѕСЂСЋСЋС‚СЊ premium-РїСЂРѕСЃС‚С–СЂ, РґРµ С‚СЂРµР№РґРµСЂ Р·РЅР°С…РѕРґРёС‚СЊ СЃРёС‚СѓР°С†С–С—, РґС–С” СЃС‚СЂСѓРєС‚СѓСЂРЅРѕ С– СЂРѕР·Р±РёСЂР°С” СЂРµР·СѓР»СЊС‚Р°С‚.",
      modules: [
        ["Р–СѓСЂРЅР°Р» С– СЃРєСЂС–РЅС€РѕС‚Рё", "РЎРµСЂР№РѕР·РЅРёР№ Р¶СѓСЂРЅР°Р», СЏРєРёР№ СЃС‚Р°С” РґР¶РµСЂРµР»РѕРј РґР°РЅРёС… РґР»СЏ Р°РЅР°Р»С–Р·Сѓ, Р·РІС–С‚С–РІ С– РјР°Р№Р±СѓС‚РЅСЊРѕС— РїРµСЂСЃРѕРЅР°Р»С–Р·Р°С†С–С—.", ["РЈРіРѕРґРё С‚Р° СЃРєСЂС–РЅС€РѕС‚Рё", "PnL С– РІС–РґСЃРѕС‚РѕРє РїСЂРёР±СѓС‚РєРѕРІРёС… СѓРіРѕРґ", "CSV/XLSX РµРєСЃРїРѕСЂС‚", "AI-Р°РЅР°Р»С–Р· Р¶СѓСЂРЅР°Р»Сѓ"]],
        ["Р“СЂР°С„С–РєРё С‚Р° СЃРїРёСЃРєРё СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ", "Р РѕР±РѕС‡РёР№ РїСЂРѕСЃС‚С–СЂ РіСЂР°С„С–РєС–РІ, РїРѕРІвЂ™СЏР·Р°РЅРёР№ С–Р· С‚РёРєРµСЂР°РјРё, СЃРїРёСЃРєР°РјРё, СЃРєСЂС–РЅС€РѕС‚Р°РјРё С‚Р° РјР°Р№Р±СѓС‚РЅС–Рј premium-Р°РЅР°Р»С–Р·РѕРј.", ["TradingView workspace", "Р’РІРµРґРµРЅРЅСЏ С‚РёРєРµСЂР°", "РЎРїРёСЃРѕРє СЃРїРѕСЃС‚РµСЂРµР¶РµРЅРЅСЏ", "РћСЃРЅРѕРІР° AI-Р°РЅР°Р»С–Р·Сѓ РіСЂР°С„С–РєР°"]],
        ["Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°", "РЁР°СЂ СЃРєР°РЅРµСЂР° РґР»СЏ РїРѕС€СѓРєСѓ Р°РєС‚РёРІРЅРёС… Р°РєС†С–Р№ С– РєСЂРёРїС‚Рё Р· С‡РµСЃРЅРёРј РІС–РґРѕР±СЂР°Р¶РµРЅРЅСЏРј РґР¶РµСЂРµР».", ["РљР°РЅРґРёРґР°С‚Рё РїРѕ Р°РєС†С–СЏС… С– РєСЂРёРїС‚С–", "Р РёРЅРєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚", "РњС–С‚РєРё РґР¶РµСЂРµР»", "AI Market Brief"]],
        ["AI-СЃРёРіРЅР°Р»Рё", "Elite-СЃРёРіРЅР°Р»Рё Р· РїР»Р°РЅРѕРј, РЅР°РІС‡Р°РЅРЅСЏРј С– СЂРѕР·Р±РѕСЂРѕРј СЂРµР·СѓР»СЊС‚Р°С‚Сѓ.", ["РџР»Р°РІР°СЋС‡РёР№ РІС–РґР¶РµС‚", "Р¦РµРЅС‚СЂ СЃРёРіРЅР°Р»С–РІ", "Р”РµС‚Р°Р»СЊРЅРёР№ СЂРѕР·Р±С–СЂ", "Р—РІвЂ™СЏР·РєР° СЃРёРіРЅР°Р»Сѓ Р· Р¶СѓСЂРЅР°Р»РѕРј"]],
        ["Р—РІС–С‚Рё С‚Р° РЅР°РІС‡Р°РЅРЅСЏ", "РЁР°СЂ СЂРѕР·Р±РѕСЂСѓ, СЏРєРёР№ РїРµСЂРµС‚РІРѕСЂСЋС” СѓРіРѕРґРё РЅР° Р·РІРѕСЂРѕС‚РЅРёР№ Р·РІвЂ™СЏР·РѕРє С– РїРѕРІС‚РѕСЂСЋРІР°РЅС– СѓСЂРѕРєРё.", ["AI-Р·РІС–С‚Рё", "РќР°РІС‡Р°Р»СЊРЅС– Р±Р»РѕРєРё", "РћСЃРЅРѕРІР° РїР»РµР№Р±СѓРєР°", "Р¤РѕРєСѓСЃ РІРёРєРѕРЅР°РЅРЅСЏ"]],
        ["РџС–РґС‚СЂРёРјРєР°", "Site-wide РїРѕРјС–С‡РЅРёРє С– РѕРїРµСЂР°С‚РѕСЂСЃСЊРєРёР№ РїРѕС‚С–Рє РґР»СЏ РїРёС‚Р°РЅСЊ С‰РѕРґРѕ РїСЂРѕРґСѓРєС‚Сѓ, РѕРїР»Р°С‚Рё С‚Р° РґРѕСЃС‚СѓРїСѓ.", ["РџРѕРјС–С‡РЅРёРє РїС–РґС‚СЂРёРјРєРё", "Р—Р°РїРёС‚ РѕРїРµСЂР°С‚РѕСЂР°", "Email-РїС–РґС‚СЂРёРјРєР°", "Р’С–РґРїРѕРІС–РґС– Р· Р°РґРјС–РЅРєРё"]],
      ],
      differentEyebrow: "Р’С–РґРјС–РЅРЅС–СЃС‚СЊ",
      differentTitle: "Р¦Рµ РЅРµ С‡РµСЂРіРѕРІРёР№ СЃРµСЂРІС–СЃ СЃРёРіРЅР°Р»С–РІ. Р¦Рµ СЃРёСЃС‚РµРјР° РµС„РµРєС‚РёРІРЅРѕСЃС‚С–.",
      differentText:
        "РЎРёР»СЊРЅС– С‚СЂРµР№РґРµСЂРё РЅРµ РїСЂРѕСЃС‚Рѕ С€СѓРєР°СЋС‚СЊ РІС…РѕРґРё. Р’РѕРЅРё Р±СѓРґСѓСЋС‚СЊ РїСЂРѕС†РµСЃ, РєРѕРЅС‚СЂРѕР»СЊ СЂРёР·РёРєСѓ, СЂРѕР·Р±С–СЂ, РґРёСЃС†РёРїР»С–РЅСѓ С‚Р° РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїР°С‚РµСЂРЅРё. SkillEdge AI Р±СѓРґСѓС”С‚СЊСЃСЏ РЅР°РІРєРѕР»Рѕ С†С–С”С— СЂРµР°Р»СЊРЅРѕСЃС‚С–.",
      comparisons: [
        ["Р—Р°РјС–СЃС‚СЊ Р·РІРёС‡Р°Р№РЅРѕРіРѕ СЃРєР°РЅРµСЂР°", "РўРё Р±Р°С‡РёС€ С‚С–Р»СЊРєРё С‚РёРєРµСЂРё Р№ СѓСЃРµ РѕРґРЅРѕ РјР°С”С€ Р·РґРѕРіР°РґСѓРІР°С‚РёСЃСЏ, С‰Рѕ РІР°Р¶Р»РёРІРѕ.", "SkillEdge РїРѕСЏСЃРЅСЋС”, С‡РѕРјСѓ С‚РёРєРµСЂ РІР°Р¶Р»РёРІРёР№, СЏРєРёР№ СЃРµС‚Р°Рї, РґРµ СЂРёР·РёРє С– С‰Рѕ РїС–РґС‚РІРµСЂРґР¶СѓС” С–РґРµСЋ."],
        ["Р—Р°РјС–СЃС‚СЊ РїСЂРѕСЃС‚РѕРіРѕ Р¶СѓСЂРЅР°Р»Сѓ", "РўРё Р·Р±РµСЂС–РіР°С”С€ СѓРіРѕРґРё, Р°Р»Рµ РЅРµ РїРµСЂРµС‚РІРѕСЂСЋС”С€ С—С… РЅР° РїРµСЂРµРІР°РіСѓ.", "SkillEdge РїРѕРІвЂ™СЏР·СѓС” СѓРіРѕРґРё, СЃРєСЂС–РЅС€РѕС‚Рё, СЃРёРіРЅР°Р»Рё, СЂРµР·СѓР»СЊС‚Р°С‚Рё Р№ РїРѕРјРёР»РєРё РІ СЃРёСЃС‚РµРјСѓ РїРѕРєСЂР°С‰РµРЅРЅСЏ."],
        ["Р—Р°РјС–СЃС‚СЊ Р·РІРёС‡Р°Р№РЅРѕРіРѕ С‡Р°С‚-Р±РѕС‚Р°", "РўРё СЃС‚Р°РІРёС€ РІРёРїР°РґРєРѕРІС– РїРёС‚Р°РЅРЅСЏ Р№ РѕС‚СЂРёРјСѓС”С€ СЂРѕР·СЂС–Р·РЅРµРЅС– РІС–РґРїРѕРІС–РґС–.", "SkillEdge РїСЂР°С†СЋС” РІСЃРµСЂРµРґРёРЅС– РїСЂРѕС†РµСЃСѓ: СЃРёРіРЅР°Р»Рё, Р¶СѓСЂРЅР°Р», Р·РІС–С‚Рё, РІРёРєРѕРЅР°РЅРЅСЏ, РЅР°РІС‡Р°РЅРЅСЏ С– РїР»РµР№Р±СѓРє."],
      ],
      finalTitle: "РџРѕР±СѓРґСѓР№ С‚РѕСЂРіРѕРІСѓ СЃРёСЃС‚РµРјСѓ РЅР°РІРєРѕР»Рѕ СЃРІРѕС”С— СЂРµР°Р»СЊРЅРѕС— РїРѕРІРµРґС–РЅРєРё.",
      finalText:
        "SkillEdge AI СЃС‚РІРѕСЂРµРЅРёР№ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РЅР°Р±СЂРёРґР»Рё СЂРѕР·СЂС–Р·РЅРµРЅС– С–РЅСЃС‚СЂСѓРјРµРЅС‚Рё, РµРјРѕС†С–Р№РЅС– СЂС–С€РµРЅРЅСЏ С‚Р° РЅРµР·СЂРѕР·СѓРјС–Р»С– СЂРѕР·Р±РѕСЂРё. РџСЂРѕРґСѓРєС‚ РґРѕРїРѕРјР°РіР°С” С‡РёСЃС‚С–С€Рµ Р±Р°С‡РёС‚Рё СЂРёРЅРѕРє, РґС–СЏС‚Рё СЃС‚СЂСѓРєС‚СѓСЂРЅС–С€Рµ С– СЂРѕР·СѓРјС–С‚Рё, С‰Рѕ РїРѕРєСЂР°С‰СѓРІР°С‚Рё РґР°Р»С–.",
      finalChecklist: [
        "Р–СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё С‚Р° Р°РЅР°Р»С–С‚РёРєР°",
        "AI-РєРѕСѓС‡ С– СЂРѕР·Р±С–СЂ РіСЂР°С„С–РєС–РІ",
        "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР° С‚Р° AI-СЃРєР°РЅРµСЂ РґР»СЏ Edge+",
        "AI-СЃРёРіРЅР°Р»Рё С‚Р° Signal-to-Journal РґР»СЏ Elite",
        "Р—РІС–С‚Рё, РЅР°РІС‡Р°РЅРЅСЏ Р№ РѕСЃРЅРѕРІР° РїР»РµР№Р±СѓРєР°",
        "РџРѕРјС–С‡РЅРёРє РїС–РґС‚СЂРёРјРєРё С‚Р° Р·Р°РїРёС‚ РѕРїРµСЂР°С‚РѕСЂР°",
      ],
    },
    pricingPage: {
      heroBadge: "РўР°СЂРёС„Рё",
      heroTitle: "РћР±РµСЂРё СЂС–РІРµРЅСЊ С–РЅС‚РµР»РµРєС‚Сѓ РЅР°РІРєРѕР»Рѕ СЃРІРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ.",
      heroText:
        "Core Р±СѓРґСѓС” СЃС‚СЂСѓРєС‚СѓСЂСѓ. Edge РґРѕРґР°С” СЂРёРЅРєРѕРІСѓ СЂРѕР·РІС–РґРєСѓ С‚Р° AI-СЃРєР°РЅРµСЂ. Elite РІС–РґРєСЂРёРІР°С” РїРѕРІРЅРёР№ AI Trading Desk С–Р· СЃРёРіРЅР°Р»Р°РјРё, Р·РІвЂ™СЏР·РєРѕСЋ Р· Р¶СѓСЂРЅР°Р»РѕРј С– РЅР°РІС‡Р°РЅРЅСЏРј РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С….",
      billingToggle: {
        monthly: "1 РјС–СЃСЏС†СЊ",
        halfyear: "6 РјС–СЃСЏС†С–РІ",
        yearly: "1 СЂС–Рє",
      },
      period: {
        monthly: "/ РјС–СЃСЏС†СЊ",
        halfyear: "/ 6 РјС–СЃСЏС†С–РІ",
        yearly: "/ СЂС–Рє",
      },
      cardPayment: "РћРїР»Р°С‚Р° РєР°СЂС‚РєРѕСЋ РіРѕС‚СѓС”С‚СЊСЃСЏ",
      cryptoNote: "* РєСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Р° С‡РµСЂРµР· РґРѕСЃС‚СѓРїРЅРёР№ launch-flow",
      checkoutStatus: {
        checking: "РџРµСЂРµРІС–СЂСЏС”РјРѕ Р°РєР°СѓРЅС‚...",
        invoice: "РЎС‚РІРѕСЂСЋС”РјРѕ РєСЂРёРїС‚Рѕ-СЂР°С…СѓРЅРѕРє...",
        noUrl: "РљСЂРёРїС‚Рѕ-СЂР°С…СѓРЅРѕРє СЃС‚РІРѕСЂРµРЅРѕ, Р°Р»Рµ РїРѕСЃРёР»Р°РЅРЅСЏ РЅР° РѕРїР»Р°С‚Сѓ РЅРµ РїРѕРІРµСЂРЅСѓР»РѕСЃСЏ.",
        unavailable: "РљСЂРёРїС‚Рѕ-РѕРїР»Р°С‚Р° Р·Р°СЂР°Р· РЅРµРґРѕСЃС‚СѓРїРЅР°.",
      },
      planBadge: {
        core: "РџРѕС‡РЅРё Р· РґРёСЃС†РёРїР»С–РЅРё",
        edge: "РќР°Р№РєСЂР°С‰РёР№ РІР°СЂС–Р°РЅС‚ РґР»СЏ Р°РєС‚РёРІРЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°",
        elite: "РџРѕРІРЅРёР№ AI Trading Desk",
      },
      plans: [
        {
          id: "starter",
          name: "SkillEdge Core",
          headline: "Р”Р»СЏ С‚СЂРµР№РґРµСЂР°, СЏРєРѕРјСѓ СЃРїРѕС‡Р°С‚РєСѓ РїРѕС‚СЂС–Р±РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°.",
          text:
            "РџРѕР±СѓРґСѓР№ РѕСЃРЅРѕРІСѓ: Р¶СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё, AI-РєРѕСѓС‡, Р±Р°Р·РѕРІРёР№ Р°РЅР°Р»С–Р· РіСЂР°С„С–РєС–РІ, РµРєСЃРїРѕСЂС‚ С– С‡РёСЃС‚С–С€РёР№ РїСЂРѕС†РµСЃ СЂРѕР·Р±РѕСЂСѓ.",
          bestFor: "РќР°Р№РєСЂР°С‰Рµ РґР»СЏ РґРёСЃС†РёРїР»С–РЅРё, С„С–РєСЃР°С†С–С— СѓРіРѕРґ С– РІС–РґРјРѕРІРё РІС–Рґ С‚РѕСЂРіС–РІР»С– РїРѕ РїР°РјвЂ™СЏС‚С–.",
          cta: "РџРѕС‡Р°С‚Рё Р· Core",
          features: ["Р”Рѕ 300 СѓРіРѕРґ", "3 СЃРєСЂС–РЅС€РѕС‚Рё РЅР° СѓРіРѕРґСѓ", "50 Р·Р°РїРёС‚С–РІ РґРѕ AI-РєРѕСѓС‡Р° / РјС–СЃСЏС†СЊ", "10 AI-Р°РЅР°Р»С–Р·С–РІ Р¶СѓСЂРЅР°Р»Сѓ / РјС–СЃСЏС†СЊ", "20 AI-Р°РЅР°Р»С–Р·С–РІ РіСЂР°С„С–РєР° / РјС–СЃСЏС†СЊ", "CSV/XLSX РµРєСЃРїРѕСЂС‚"],
        },
        {
          id: "pro",
          name: "SkillEdge Edge",
          headline: "Р”Р»СЏ Р°РєС‚РёРІРЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°, СЏРєРѕРјСѓ РїРѕС‚СЂС–Р±РµРЅ РіР»РёР±РѕРєРёР№ СЂРѕР·Р±С–СЂ С– СЂРёРЅРєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚.",
          text:
            "Р’С–РґРєСЂРёР№ РІРёС‰С– Р»С–РјС–С‚Рё, AI-Р·РІС–С‚Рё, premium-Р°РЅР°Р»С–Р· РіСЂР°С„С–РєС–РІ, СЂРёРЅРєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚ С– С€Р°СЂ AI-СЃРєР°РЅРµСЂР° / AI Market Brief.",
          bestFor: "РќР°Р№РєСЂР°С‰Рµ РґР»СЏ Р°РєС‚РёРІРЅРёС… С‚СЂРµР№РґРµСЂС–РІ, СЏРєС– СЃРµСЂР№РѕР·РЅРѕ СЂРѕР·Р±РёСЂР°СЋС‚СЊ СѓРіРѕРґРё Р№ С€СѓРєР°СЋС‚СЊ РїРѕРІС‚РѕСЂСЋРІР°РЅС– РїРѕРјРёР»РєРё С‚Р° СЃРµС‚Р°РїРё.",
          cta: "РџРµСЂРµР№С‚Рё РЅР° Edge",
          features: ["РЈСЃРµ Р· Core", "Р”Рѕ 2 000 СѓРіРѕРґ", "5 СЃРєСЂС–РЅС€РѕС‚С–РІ РЅР° СѓРіРѕРґСѓ", "200 Р·Р°РїРёС‚С–РІ РґРѕ AI-РєРѕСѓС‡Р° / РјС–СЃСЏС†СЊ", "30 AI-Р·РІС–С‚С–РІ / РјС–СЃСЏС†СЊ", "AI-СЃРєР°РЅРµСЂ / СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°"],
        },
        {
          id: "elite",
          name: "SkillEdge Elite",
          headline: "Р”Р»СЏ СЃРµСЂР№РѕР·РЅРѕРіРѕ С‚СЂРµР№РґРµСЂР°, СЏРєРѕРјСѓ РїРѕС‚СЂС–Р±РµРЅ РїРѕРІРЅРёР№ AI Trading Desk.",
          text:
            "Р’С–РґРєСЂРёР№ AI-СЃРёРіРЅР°Р»Рё, РїР»Р°РІР°СЋС‡РёР№ РІС–РґР¶РµС‚, Signal-to-Journal, РІС–РґСЃС‚РµР¶РµРЅРЅСЏ СЂС–С€РµРЅСЊ, РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С… С– РјР°РєСЃРёРјР°Р»СЊРЅС– AI-Р»С–РјС–С‚Рё.",
          bestFor: "РќР°Р№РєСЂР°С‰Рµ РґР»СЏ РїСЂРѕСЃСѓРЅСѓС‚РёС… С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– СЃС‚СЂСѓРєС‚СѓСЂРЅС– СЃРёРіРЅР°Р»Рё С‚Р° РїРѕРІРЅРёР№ С†РёРєР» Р·РІРѕСЂРѕС‚РЅРѕРіРѕ Р·РІвЂ™СЏР·РєСѓ.",
          cta: "Р’С–РґРєСЂРёС‚Рё Elite",
          features: ["РЈСЃРµ Р· Edge", "Р”Рѕ 10 000 СѓРіРѕРґ", "10 СЃРєСЂС–РЅС€РѕС‚С–РІ РЅР° СѓРіРѕРґСѓ", "1 000 Р·Р°РїРёС‚С–РІ РґРѕ AI-РєРѕСѓС‡Р° / РјС–СЃСЏС†СЊ", "150 AI-Р·РІС–С‚С–РІ / РјС–СЃСЏС†СЊ", "AI-СЃРёРіРЅР°Р»Рё + Signal-to-Journal"],
        },
      ],
      signalEyebrow: "РќР°РІС–С‰Рѕ РїРѕС‚СЂС–Р±РµРЅ С€Р°СЂ СЃРёРіРЅР°Р»С–РІ",
      signalTitle: "РЎРёРіРЅР°Р»Рё SkillEdge РјР°СЋС‚СЊ РЅР°РІС‡Р°С‚Рё, Р° РЅРµ Р·РјСѓС€СѓРІР°С‚Рё С‚СЂРµР№РґРµСЂР° СЃР»С–РїРѕ РЅР°С‚РёСЃРєР°С‚Рё.",
      signalText:
        "РЎР»Р°Р±РєРёР№ СЃРµСЂРІС–СЃ СЃРёРіРЅР°Р»С–РІ СЃС‚РІРѕСЂСЋС” Р·Р°Р»РµР¶РЅС–СЃС‚СЊ. РЎРёР»СЊРЅР° С‚РѕСЂРіРѕРІР° СЃРёСЃС‚РµРјР° СЃС‚РІРѕСЂСЋС” СЏСЃРЅС–СЃС‚СЊ: СЃРµС‚Р°Рї, СЂРёР·РёРє, РїС–РґС‚РІРµСЂРґР¶РµРЅРЅСЏ, СЃРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС— С‚Р° СѓСЂРѕРє РїС–СЃР»СЏ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ.",
      signalCards: [
        ["РќРµ СЃР»С–РїС– РєРѕРјР°РЅРґРё", "РЎРёРіРЅР°Р»Рё вЂ” С†Рµ СЃС‚СЂСѓРєС‚СѓСЂРЅС– С‚РѕСЂРіРѕРІС– С–РґРµС—: СЃРµС‚Р°Рї, РЅР°РїСЂСЏРјРѕРє, С‚СЂРёРіРµСЂ, Р·РѕРЅР° РІС…РѕРґСѓ, СЃС‚РѕРї, С†С–Р»С– С‚Р° СЂРёР·РёРє."],
        ["Р РѕР·Р±С–СЂ РґРѕ РґС–С—", "РљРѕР¶РµРЅ СЃРµСЂР№РѕР·РЅРёР№ СЃРёРіРЅР°Р» РїРѕСЏСЃРЅСЋС”, С‡РѕРјСѓ РІС–РЅ Р·вЂ™СЏРІРёРІСЃСЏ, С‰Рѕ Р№РѕРіРѕ РїС–РґС‚РІРµСЂРґР¶СѓС” С– С‰Рѕ СЂРѕР±РёС‚СЊ Р№РѕРіРѕ РЅРµР±РµР·РїРµС‡РЅРёРј."],
        ["РЎРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р»", "Р’Р·СЏС‚РёР№ СЃРёРіРЅР°Р» РјРѕР¶Рµ СЃС‚Р°С‚Рё СѓРіРѕРґРѕСЋ РІ Р¶СѓСЂРЅР°Р»С–, С‰РѕР± РїРѕСЂС–РІРЅСЏС‚Рё РїР»Р°РЅ С– СЂРµР°Р»СЊРЅРµ РІРёРєРѕРЅР°РЅРЅСЏ."],
        ["РљРѕСѓС‡РёРЅРі Р·Р° СЂРµР·СѓР»СЊС‚Р°С‚РѕРј", "Р’Р·СЏС‚С–, РїСЂРѕРїСѓС‰РµРЅС– С‚Р° РїСЂРѕС–РіРЅРѕСЂРѕРІР°РЅС– СЂС–С€РµРЅРЅСЏ РїРѕРєР°Р·СѓСЋС‚СЊ СѓРїСѓС‰РµРЅС– РјРѕР¶Р»РёРІРѕСЃС‚С–, С…РѕСЂРѕС€С– РїСЂРѕРїСѓСЃРєРё С‚Р° СЃР»Р°Р±РєРµ РІРёРєРѕРЅР°РЅРЅСЏ."],
      ],
      comparisonTitle: "РџРѕСЂС–РІРЅСЏРЅРЅСЏ С‚Р°СЂРёС„С–РІ",
      comparisonText: "РћР±РµСЂРё С‚Р°СЂРёС„ РїС–Рґ РїРѕС‚РѕС‡РЅРёР№ С‚РѕСЂРіРѕРІРёР№ РїСЂРѕС†РµСЃ.",
      comparison: [
        ["Р¤СѓРЅРєС†С–СЏ", "Core", "Edge", "Elite"],
        ["Р–СѓСЂРЅР°Р» + СЃРєСЂС–РЅС€РѕС‚Рё", "РўР°Рє", "РўР°Рє", "РўР°Рє"],
        ["AI-РєРѕСѓС‡", "50 / РјС–СЃСЏС†СЊ", "200 / РјС–СЃСЏС†СЊ", "1 000 / РјС–СЃСЏС†СЊ"],
        ["AI-Р°РЅР°Р»С–Р· Р¶СѓСЂРЅР°Р»Сѓ", "10 / РјС–СЃСЏС†СЊ", "50 / РјС–СЃСЏС†СЊ", "300 / РјС–СЃСЏС†СЊ"],
        ["AI-Р°РЅР°Р»С–Р· РіСЂР°С„С–РєР°", "20 / РјС–СЃСЏС†СЊ", "100 / РјС–СЃСЏС†СЊ", "500 / РјС–СЃСЏС†СЊ"],
        ["AI-Р·РІС–С‚Рё", "вЂ”", "30 / РјС–СЃСЏС†СЊ", "150 / РјС–СЃСЏС†СЊ"],
        ["AI-СЃРєР°РЅРµСЂ", "вЂ”", "РўР°Рє", "РўР°Рє"],
        ["AI-СЃРёРіРЅР°Р»Рё", "вЂ”", "вЂ”", "РўР°Рє"],
        ["РќР°Р№РєСЂР°С‰Рµ РґР»СЏ", "Р”РёСЃС†РёРїР»С–РЅРё", "РђРєС‚РёРІРЅРѕРіРѕ СЂРѕР·Р±РѕСЂСѓ", "AI Trading Desk"],
      ],
      finalTitle: "Р§РµСЃРЅР° СЂРµРєРѕРјРµРЅРґР°С†С–СЏ",
      finalText:
        "РћР±РёСЂР°Р№ Core РґР»СЏ СЃС‚СЂСѓРєС‚СѓСЂРё, Edge РґР»СЏ СЂРёРЅРєРѕРІРѕРіРѕ С–РЅС‚РµР»РµРєС‚Сѓ С‚Р° Р°РєС‚РёРІРЅРѕРіРѕ СЂРѕР·Р±РѕСЂСѓ, Elite РґР»СЏ AI-СЃРёРіРЅР°Р»С–РІ С– РїРѕРІРЅРѕРіРѕ workflow СЃРёРіРЅР°Р» в†’ Р¶СѓСЂРЅР°Р».",
      disclaimer:
        "SkillEdge AI РЅРµ С” С„С–РЅР°РЅСЃРѕРІРѕСЋ СЂРµРєРѕРјРµРЅРґР°С†С–С”СЋ С– РЅРµ РіР°СЂР°РЅС‚СѓС” РїСЂРёР±СѓС‚РѕРє. РџР»Р°С‚С„РѕСЂРјР° СЃС‚РІРѕСЂРµРЅР° РґР»СЏ РїРѕРєСЂР°С‰РµРЅРЅСЏ СЃС‚СЂСѓРєС‚СѓСЂРё, СЂРѕР·Р±РѕСЂСѓ, СЏРєРѕСЃС‚С– СЂС–С€РµРЅСЊ С– С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ.",
    },
    teamPage: {
      heroBadge: "РџСЂРѕ SkillEdge AI",
      heroTitle: "РњРё Р±СѓРґСѓС”РјРѕ AI-СЃРёСЃС‚РµРјСѓ РґР»СЏ С‚СЂРµР№РґРёРЅРіСѓ, СЏРєСѓ СЃРµСЂР№РѕР·РЅС– С‚СЂРµР№РґРµСЂРё С…РѕС‚С–Р»Рё Р± РјР°С‚Рё РІР¶Рµ Р·Р°СЂР°Р·.",
      heroText:
        "SkillEdge AI СЃС‚РІРѕСЂСЋС”С‚СЊСЃСЏ РЅР°РІРєРѕР»Рѕ РѕРґРЅС–С”С— С–РґРµС—: С‚СЂРµР№РґРµСЂР°Рј РЅРµ РїРѕС‚СЂС–Р±РµРЅ С‰Рµ Р±С–Р»СЊС€РёР№ С€СѓРј. Р‡Рј РїРѕС‚СЂС–Р±РЅР° СЃРёСЃС‚РµРјР°, СЏРєР° РїРѕС”РґРЅСѓС” СЂРёРЅРєРѕРІС– РјРѕР¶Р»РёРІРѕСЃС‚С–, Р¶СѓСЂРЅР°Р», РґРёСЃС†РёРїР»С–РЅСѓ РІРёРєРѕРЅР°РЅРЅСЏ, РЅР°РІС‡Р°РЅРЅСЏ С‚Р° РѕСЃРѕР±РёСЃС‚РёР№ РїСЂРѕРіСЂРµСЃ.",
      ctaProduct: "РџРµСЂРµРіР»СЏРЅСѓС‚Рё РїСЂРѕРґСѓРєС‚",
      ctaPricing: "РџРµСЂРµРіР»СЏРЅСѓС‚Рё С‚Р°СЂРёС„Рё",
      philosophyBadge: "Р¤С–Р»РѕСЃРѕС„С–СЏ РїСЂРѕРґСѓРєС‚Сѓ",
      philosophyTitle: "РџСЂРѕС†РµСЃ РІР°Р¶Р»РёРІС–С€РёР№ Р·Р° РїРµСЂРµРґР±Р°С‡РµРЅРЅСЏ",
      beliefs: [
        "РЎРёРіРЅР°Р»Рё Р±РµР· РЅР°РІС‡Р°РЅРЅСЏ СЃС‚РІРѕСЂСЋСЋС‚СЊ Р·Р°Р»РµР¶РЅС–СЃС‚СЊ.",
        "РЈРіРѕРґСѓ Р±РµР· РїР»Р°РЅСѓ РЅРµРјРѕР¶Р»РёРІРѕ РЅРѕСЂРјР°Р»СЊРЅРѕ СЂРѕР·С–Р±СЂР°С‚Рё.",
        "Р–СѓСЂРЅР°Р» Р±РµР· Р·РІРѕСЂРѕС‚РЅРѕРіРѕ Р·РІвЂ™СЏР·РєСѓ РїРµСЂРµС‚РІРѕСЂСЋС”С‚СЊСЃСЏ РЅР° РєР»Р°РґРѕРІРёС‰Рµ СЃС‚Р°СЂРёС… СѓРіРѕРґ.",
        "РќР°Р№РєСЂР°С‰РёР№ РїСЂРѕРґСѓРєС‚ СЂРѕР±РёС‚СЊ С‚СЂРµР№РґРµСЂР° СЃРїРѕРєС–Р№РЅС–С€РёРј, РіРѕСЃС‚СЂС–С€РёРј С– РґРёСЃС†РёРїР»С–РЅРѕРІР°РЅС–С€РёРј.",
        "РџРµСЂСЃРѕРЅР°Р»СЊРЅС– AI-СЃРёРіРЅР°Р»Рё СЃС‚Р°СЋС‚СЊ СЃРёР»СЊРЅРёРјРё С‚С–Р»СЊРєРё С‚РѕРґС–, РєРѕР»Рё С‚СЂРµР№РґРµСЂ Р·Р±РёСЂР°С” С‡РёСЃС‚Сѓ С–СЃС‚РѕСЂС–СЋ СѓРіРѕРґ.",
      ],
      storyEyebrow: "РќР°С€Р° С–СЃС‚РѕСЂС–СЏ",
      storyTitle: "SkillEdge AI СЃС‚РІРѕСЂСЋС”С‚СЊСЃСЏ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– РґРёСЃС†РёРїР»С–РЅР°, СЃС‚СЂСѓРєС‚СѓСЂР° С‚Р° РІРёРјС–СЂСЋРІР°РЅРёР№ РїСЂРѕРіСЂРµСЃ.",
      storyText:
        "РџСЂРѕРґСѓРєС‚ РІРёСЂС–СЃ С–Р· РїСЂРѕР±Р»РµРјРё, Р· СЏРєРѕСЋ СЃС‚РёРєР°СЋС‚СЊСЃСЏ Р±Р°РіР°С‚Рѕ Р°РєС‚РёРІРЅРёС… С‚СЂРµР№РґРµСЂС–РІ: СЂРёРЅРѕРє РґР°С” Р·Р°РЅР°РґС‚Рѕ Р±Р°РіР°С‚Рѕ С–РЅС„РѕСЂРјР°С†С–С—, Р°Р»Рµ РјР°Р№Р¶Рµ РЅРµ РґР°С” С‡РµСЃРЅРѕРіРѕ Р·РІРѕСЂРѕС‚РЅРѕРіРѕ Р·РІвЂ™СЏР·РєСѓ С‰РѕРґРѕ РІРёРєРѕРЅР°РЅРЅСЏ. SkillEdge AI РјР°С” Р·РІвЂ™СЏР·Р°С‚Рё СЂС–С€РµРЅРЅСЏ С‚СЂРµР№РґРµСЂР°, СЃРєСЂС–РЅС€РѕС‚Рё, Р¶СѓСЂРЅР°Р», СЃРёРіРЅР°Р»Рё Р№ СЂРµР·СѓР»СЊС‚Р°С‚Рё РІ РѕРґРЅСѓ СЃРµСЂР№РѕР·РЅСѓ СЃРёСЃС‚РµРјСѓ СЂРѕР·Р±РѕСЂСѓ.",
      teamEyebrow: "РЎС‚СЂСѓРєС‚СѓСЂР° РєРѕРјР°РЅРґРё",
      teamTitle: "РЎС‚РѕСЂС–РЅРєР° РїРѕР±СѓРґРѕРІР°РЅР° СЏРє РєРѕРјР°РЅРґР° РїСЂРѕРґСѓРєС‚Сѓ: С‚СЂРµР№РґРёРЅРі, РїСЂРѕРґСѓРєС‚, РґР°РЅС– С‚Р° РїС–РґС‚СЂРёРјРєР°.",
      teamText:
        "Р¦С– РєР°СЂС‚РєРё вЂ” РіРѕС‚РѕРІРёР№ РјР°РєРµС‚ About Us. РџС–Р·РЅС–С€Рµ С‚Рё Р·РјРѕР¶РµС€ РІСЃС‚Р°РІРёС‚Рё СЂРµР°Р»СЊРЅС– С„РѕС‚Рѕ, С–РјРµРЅР° С‚Р° СЂРѕР»С– Р±РµР· Р·РјС–РЅРё СЃС‚СЂСѓРєС‚СѓСЂРё СЃС‚РѕСЂС–РЅРєРё.",
      teamCards: [
        ["Р—Р°СЃРЅРѕРІРЅРёРє / Р±Р°С‡РµРЅРЅСЏ РїСЂРѕРґСѓРєС‚Сѓ", "Р’С–РґРїРѕРІС–РґР°С” Р·Р° РЅР°РїСЂСЏРј РїСЂРѕРґСѓРєС‚Сѓ, workflow С‚СЂРµР№РґРµСЂР°, С‚Р°СЂРёС„РЅСѓ Р»РѕРіС–РєСѓ С‚Р° premium-РїРѕР·РёС†С–РѕРЅСѓРІР°РЅРЅСЏ."],
        ["Trading Research", "Р’РёР·РЅР°С‡Р°С” СЃРµС‚Р°РїРё, Р»РѕРіС–РєСѓ СЃРёРіРЅР°Р»С–РІ, РєСЂРёС‚РµСЂС–С— СЂРѕР·Р±РѕСЂСѓ Р¶СѓСЂРЅР°Р»Сѓ С‚Р° РѕСЃРІС–С‚РЅС– РїР»РµР№Р±СѓРєРё."],
        ["AI С– РґР°РЅС–", "Р‘СѓРґСѓС” Р»РѕРіС–РєСѓ СЃРєР°РЅРµСЂР°, AI-РїСЂРѕРјРїС‚Рё, Р·Р±Р°РіР°С‡РµРЅРЅСЏ РґР°РЅРёС…, Р»С–РјС–С‚Рё С‚Р° backend-gates."],
        ["Р”РёР·Р°Р№РЅ С– РґРѕСЃРІС–Рґ", "Р¤РѕСЂРјСѓС” dashboard, РїСѓР±Р»С–С‡РЅС– СЃС‚РѕСЂС–РЅРєРё, locked states, loading states С– premium-С–РЅС‚РµСЂС„РµР№СЃ."],
        ["Support Operations", "Р—Р°РєСЂРёРІР°С” РїРёС‚Р°РЅРЅСЏ РєР»С–С”РЅС‚С–РІ С‰РѕРґРѕ РїСЂРѕРґСѓРєС‚Сѓ, РѕРїР»Р°С‚Рё, РґРѕСЃС‚СѓРїСѓ Р№ РѕРїРµСЂР°С‚РѕСЂСЃСЊРєРѕРіРѕ РїРѕС‚РѕРєСѓ."],
        ["Р‘РµР·РїРµРєР° С‚Р° С–РЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°", "Р—Р°С…РёС‰Р°С” routes, API-РєР»СЋС‡С–, Supabase-РґРѕСЃС‚СѓРї, rate limits С– production-РґРµРїР»РѕР№."],
      ],
      principlesEyebrow: "РџСЂРёРЅС†РёРїРё",
      principlesTitle: "РЎРµСЂР№РѕР·РЅРёР№ trading-РїСЂРѕРґСѓРєС‚ РјР°С” С‡РµСЃРЅРѕ РіРѕРІРѕСЂРёС‚Рё РїСЂРѕ СЂРёР·РёРє С– Р±СѓРґСѓРІР°С‚РёСЃСЏ РЅР°РІРєРѕР»Рѕ РїСЂРѕС†РµСЃСѓ.",
      principles: [
        ["Р–РѕРґРЅРѕС— С„Р°Р»СЊС€РёРІРѕС— РІРїРµРІРЅРµРЅРѕСЃС‚С–", "РЈ С‚СЂРµР№РґРёРЅРіСѓ С” СЂРёР·РёРє. SkillEdge AI РЅРµ РјР°С” СЂРѕР±РёС‚Рё РІРёРіР»СЏРґ, С‰Рѕ РјРѕРґРµР»СЊ Р°Р±Рѕ СЃРёРіРЅР°Р» РјРѕР¶СѓС‚СЊ РіР°СЂР°РЅС‚СѓРІР°С‚Рё РїСЂРёР±СѓС‚РѕРє."],
        ["РџСЂРѕР·РѕСЂР° Р»РѕРіС–РєР°", "РљР»С–С”РЅС‚ РјР°С” СЂРѕР·СѓРјС–С‚Рё, С‡РѕРјСѓ Р·вЂ™СЏРІРёРІСЃСЏ СЃРёРіРЅР°Р», СЏРєС– РґР¶РµСЂРµР»Р° РІС–РґСЃС‚РµР¶СѓСЋС‚СЊСЃСЏ С– С‰Рѕ РІ С–РґРµС— СЃРёР»СЊРЅРµ Р°Р±Рѕ СЃР»Р°Р±РєРµ."],
        ["Premium-РјРёСЃР»РµРЅРЅСЏ", "РљРѕР¶РЅР° С„СѓРЅРєС†С–СЏ РјР°С” Р±СѓС‚Рё РєРѕСЂРёСЃРЅРѕСЋ, СЃРµСЂР№РѕР·РЅРѕСЋ С‚Р° РїРѕРІвЂ™СЏР·Р°РЅРѕСЋ Р· СЂРµР°Р»СЊРЅРёРј РїСЂРѕС†РµСЃРѕРј С‚СЂРµР№РґРµСЂР°."],
      ],
      roadmapEyebrow: "РџР»Р°РЅ СЂРѕР·РІРёС‚РєСѓ",
      roadmapTitle: "РњРё Р±СѓРґСѓС”РјРѕ РїСЂРѕРґСѓРєС‚ Сѓ РЅР°РїСЂСЏРјРєСѓ premium AI Trading Desk.",
      roadmapText:
        "Launch-РѕСЃРЅРѕРІР° РІР¶Рµ РїСЂРѕРґСѓРєС‚РѕРІР°: Р¶СѓСЂРЅР°Р», СЃРёРіРЅР°Р»Рё, РЅР°РІС‡Р°РЅРЅСЏ, Р·РІС–С‚Рё, РїС–РґС‚СЂРёРјРєР°, РѕРїР»Р°С‚Р° С‚Р° СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°. РќР°СЃС‚СѓРїРЅРёР№ С€Р°СЂ вЂ” premium data, РїРѕРІРЅРёР№ market scan С– РїРµСЂСЃРѕРЅР°Р»СЊРЅС– СЃРёРіРЅР°Р»Рё РЅР° РѕСЃРЅРѕРІС– С–СЃС‚РѕСЂС–С— РєР»С–С”РЅС‚Р°.",
      roadmap: [
        ["01", "Launch foundation", "Р–СѓСЂРЅР°Р», dashboard, СЃРєСЂС–РЅС€РѕС‚Рё, РЅР°РІС‡Р°РЅРЅСЏ, Р·РІС–С‚Рё, crypto-РґРѕСЃС‚СѓРї С– С„СѓРЅРґР°РјРµРЅС‚ РїС–РґС‚СЂРёРјРєРё."],
        ["02", "РЎРёРіРЅР°Р»Рё С‚Р° РїРѕРІРµРґС–РЅРєР°", "AI-СЃРёРіРЅР°Р»Рё, РІС–РґСЃС‚РµР¶РµРЅРЅСЏ СЂС–С€РµРЅСЊ, РїС–РґРіРѕС‚РѕРІРєР° СѓРіРѕРґ, РЅР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С… С– РєРѕСѓС‡РёРЅРі СѓРїСѓС‰РµРЅРёС… РјРѕР¶Р»РёРІРѕСЃС‚РµР№."],
        ["03", "Premium data", "РџРѕРІРЅРµ РїРѕРєСЂРёС‚С‚СЏ С‚РёРєРµСЂС–РІ, Binance universe, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё, heatmaps, halt screener С– СЃРёР»СЊРЅС–С€Р° Р»РѕРіС–РєР° СЃРєР°РЅРµСЂР°."],
        ["04", "РћСЃРѕР±РёСЃС‚Р° РїРµСЂРµРІР°РіР°", "AI РЅР°РІС‡Р°С”С‚СЊСЃСЏ РЅР° РЅР°Р№РєСЂР°С‰РёС… СЃРµС‚Р°РїР°С… РєР»С–С”РЅС‚Р°, СЃР»Р°Р±РєРёС… РїР°С‚РµСЂРЅР°С…, РїРѕРјРёР»РєР°С… РІРёРєРѕРЅР°РЅРЅСЏ С‚Р° С–СЃС‚РѕСЂС–С— Р¶СѓСЂРЅР°Р»Сѓ."],
      ],
      finalTitle: "Р”РѕРїРѕРјРѕРіС‚Рё С‚СЂРµР№РґРµСЂР°Рј РІРёР№С‚Рё Р· С…Р°РѕСЃСѓ Р№ РїРѕС‡Р°С‚Рё РїСЂР°С†СЋРІР°С‚Рё С‡РµСЂРµР· СЃРёСЃС‚РµРјСѓ.",
      finalText:
        "SkillEdge AI СЃС‚РІРѕСЂРµРЅРёР№ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєС– С…РѕС‡СѓС‚СЊ РіР»РёР±С€Рµ СЂРѕР·Р±РёСЂР°С‚Рё, С‡РёСЃС‚С–С€Рµ РґСѓРјР°С‚Рё, РґРёСЃС†РёРїР»С–РЅРѕРІР°РЅС–С€Рµ РІРёРєРѕРЅСѓРІР°С‚Рё Р№ Р±СѓРґСѓРІР°С‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅСѓ РїРµСЂРµРІР°РіСѓ РЅР° СЂРµР°Р»СЊРЅРёС… РґР°РЅРёС…, Р° РЅРµ РЅР° РµРјРѕС†С–СЏС… С– РїР°РјвЂ™СЏС‚С–.",
    },
    footer: {
      description:
        "Premium AI-РїСЂРѕСЃС‚С–СЂ РґР»СЏ СЃРµСЂР№РѕР·РЅРёС… С‚СЂРµР№РґРµСЂС–РІ: СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°, AI-СЃРёРіРЅР°Р»Рё, Р¶СѓСЂРЅР°Р», СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ, РїР»РµР№Р±СѓРє, Р·РІС–С‚Рё С‚Р° РєРѕСѓС‡РёРЅРі РІ РѕРґРЅС–Р№ СЃРёСЃС‚РµРјС–.",
      product: "РџСЂРѕРґСѓРєС‚",
      features: "Р¤СѓРЅРєС†С–С—",
      resources: "Р РµСЃСѓСЂСЃРё",
      legal: "Р”РѕРєСѓРјРµРЅС‚Рё",
      productLinks: ["Р“РѕР»РѕРІРЅР°", "РџСЂРѕРґСѓРєС‚", "РўР°СЂРёС„Рё", "РџСЂРѕ РЅР°СЃ"],
      featureLinks: ["AI Trading Desk", "AI-СЃРёРіРЅР°Р»Рё", "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°", "Р–СѓСЂРЅР°Р» С– СЃРєСЂС–РЅС€РѕС‚Рё", "РљРѕСѓС‡ РІРёРєРѕРЅР°РЅРЅСЏ", "РќР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…", "РџР»РµР№Р±СѓРє", "Р—РІС–С‚Рё", "Р¦РµРЅС‚СЂ РЅР°РІС‡Р°РЅРЅСЏ", "РџРѕРјС–С‡РЅРёРє РїС–РґС‚СЂРёРјРєРё"],
      resourceLinks: ["РџРѕС‡Р°С‚РѕРє СЂРѕР±РѕС‚Рё", "РЇРє РїСЂР°С†СЋС” SkillEdge", "Р“Р°Р№Рґ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СѓРіРѕРґ", "Р“Р°Р№Рґ РїРѕ AI-СЃРёРіРЅР°Р»Р°С…", "Р—РІвЂ™СЏР·Р°С‚РёСЃСЏ Р· РїС–РґС‚СЂРёРјРєРѕСЋ"],
      legalLinks: ["Privacy Policy", "Terms & Conditions", "Disclaimer Statement", "EULA", "Billing & Cancellation", "Cookie Policy"],
      cookieSettings: "РќР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ cookie",
      choosePlan: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
      requestDemo: "Р—Р°РїСЂРѕСЃРёС‚Рё РґРµРјРѕ",
      risk:
        "SkillEdge AI РЅРµ С” С„С–РЅР°РЅСЃРѕРІРѕСЋ СЂРµРєРѕРјРµРЅРґР°С†С–С”СЋ С– РЅРµ РіР°СЂР°РЅС‚СѓС” РїСЂРёР±СѓС‚РѕРє. РџР»Р°С‚С„РѕСЂРјР° СЃС‚РІРѕСЂРµРЅР° РґР»СЏ РїРѕРєСЂР°С‰РµРЅРЅСЏ СЃС‚СЂСѓРєС‚СѓСЂРё, СЂРѕР·Р±РѕСЂСѓ, СЏРєРѕСЃС‚С– СЂС–С€РµРЅСЊ С– С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ.",
      contact: "РљРѕРЅС‚Р°РєС‚Рё",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Р”РµРјРѕ РїСЂРѕРґСѓРєС‚Сѓ Р·Р° Р·Р°РїРёС‚РѕРј",
      rights: "В© 2026 SkillEdge AI. РЈСЃС– РїСЂР°РІР° Р·Р°С…РёС‰РµРЅРѕ.",
      bottom: "РЎС‚РІРѕСЂРµРЅРѕ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»С–РЅР° С‚Р° РІРёРјС–СЂСЋРІР°РЅРёР№ РїСЂРѕРіСЂРµСЃ.",
    },
    auth: {
      login: "Р’С…С–Рґ",
      register: "Р—Р°СЂРµС”СЃС‚СЂСѓРІР°С‚РёСЃСЏ",
      email: "Email",
      password: "РџР°СЂРѕР»СЊ",
      close: "Р—Р°РєСЂРёС‚Рё",
      loginTitle: "Р’С…С–Рґ Сѓ SkillEdge AI",
      registerTitle: "РЎС‚РІРѕСЂРёС‚Рё Р°РєР°СѓРЅС‚",
      loginButton: "РЈРІС–Р№С‚Рё",
      registerButton: "Р—Р°СЂРµС”СЃС‚СЂСѓРІР°С‚РёСЃСЏ",
      dashboard: "РљР°Р±С–РЅРµС‚",
      logout: "Р’РёР№С‚Рё",
      switchToLogin: "Р’Р¶Рµ С” Р°РєР°СѓРЅС‚? РЈРІС–Р№С‚Рё",
      switchToRegister: "РќРµРјР°С” Р°РєР°СѓРЅС‚Р°? Р—Р°СЂРµС”СЃС‚СЂСѓРІР°С‚РёСЃСЏ",
      checking: "РџРµСЂРµРІС–СЂСЏС”РјРѕ Р°РєР°СѓРЅС‚...",
      creatingAccount: "РЎС‚РІРѕСЂСЋС”РјРѕ Р°РєР°СѓРЅС‚...",
      creatingInvoice: "РЎС‚РІРѕСЂСЋС”РјРѕ РєСЂРёРїС‚Рѕ-СЂР°С…СѓРЅРѕРє...",
      loginRequired: "РЈРІС–Р№РґС–С‚СЊ Р°Р±Рѕ Р·Р°СЂРµС”СЃС‚СЂСѓР№С‚РµСЃСЏ, С‰РѕР± РѕРїР»Р°С‚РёС‚Рё С‚Р°СЂРёС„.",
      afterRegister: "РђРєР°СѓРЅС‚ СЃС‚РІРѕСЂРµРЅРѕ. РЇРєС‰Рѕ РїРѕС‚СЂС–Р±РЅРѕ, РїС–РґС‚РІРµСЂРґСЊС‚Рµ email.",
      authError: "РџРѕРјРёР»РєР° Р°РІС‚РѕСЂРёР·Р°С†С–С—.",
    },
  },
} as const;

const priceMatrix = {
  starter: { monthly: 49, halfyear: 249, yearly: 399 },
  pro: { monthly: 99, halfyear: 499, yearly: 799 },
  elite: { monthly: 149, halfyear: 749, yearly: 1249 },
} as const;

export default function Landing({
  initialPage = "home",
}: {
  initialPage?: PageKey;
}) {
  const [language, setLanguage] = useState<Language>("en");
  const [active, setActiveState] = useState<PageKey>(initialPage);
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

  const router = useRouter();
  const pathname = usePathname();
  const t = dict[language];
  const authLabels = t.auth;

  useEffect(() => {
    setActiveState(initialPage);
  }, [initialPage]);

  useEffect(() => {
    const savedLanguage = localStorage.getItem("skilledge_language");

    if (savedLanguage === "en" || savedLanguage === "ru" || savedLanguage === "ua") {
      setLanguage(savedLanguage);
    }
  }, []);

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

  const cycle = () => {
    setLanguage((current) => {
      const nextLanguage = current === "en" ? "ru" : current === "ru" ? "ua" : "en";
      localStorage.setItem("skilledge_language", nextLanguage);
      window.dispatchEvent(new Event("skilledge:language-changed"));
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

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b16]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
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
            <button
              onClick={cycle}
              className="flex h-11 min-w-[58px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              <Icon name="globe" className="mr-2 h-4 w-4" />
              {t.lang}
            </button>

            <ButtonX onClick={() => handleCheckout("demo", "monthly")}>{t.requestDemo}</ButtonX>

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
              className="border-t border-white/10 bg-[#070b16]/95 px-4 pb-4 md:hidden"
            >
              <div className="flex flex-col gap-2 pt-4">
                <button onClick={cycle} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75">
                  {t.switchLanguage}: {t.lang}
                </button>

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

      <main className="relative isolate min-h-screen overflow-hidden bg-[#07111d] text-white">
      <TradingBackground variant={active} />
        <AnimatePresence mode="wait">
          {active === "home" && <HomePage key="home" t={t} setActive={setActive} />}
          {active === "product" && <ProductPage key="product" t={t} setActive={setActive} />}
          {active === "pricing" && <PricingPage key="pricing" t={t} handleCheckout={handleCheckout} checkoutStatus={checkoutStatus} />}
          {active === "team" && <TeamPage key="team" t={t} setActive={setActive} />}
        </AnimatePresence>
      </main>

      <PremiumFooter t={t} setActive={setActive} handleCheckout={handleCheckout} />
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

function HomePage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const heroDesk = getHeroDeskCopy(t);
const homeProblemCards = getHomeProblemCards(t);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1560px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 xl:px-10"
    >
      <section className="relative mx-auto mt-6 grid min-h-[680px] w-[min(100%,1500px)] items-center gap-12 overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.04] px-5 py-12 shadow-[0_40px_160px_rgba(8,47,73,0.28)] backdrop-blur-xl md:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:px-10 xl:px-12">
  <div className="absolute inset-0 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_12%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.075),transparent_38%)]" />
  <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent" />

  <motion.div
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.55 }}
    className="relative z-10"
  >
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/[0.08] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-50/80 shadow-[0_0_45px_rgba(34,211,238,0.14)]">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" />
      {heroDesk.badge}
    </div>

    <h1 className="mt-7 max-w-5xl text-4xl font-black leading-[0.95] tracking-[-0.065em] text-white drop-shadow-[0_12px_42px_rgba(0,0,0,0.35)] md:text-6xl xl:text-7xl">
      {heroDesk.title}
    </h1>

    <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/72 md:text-lg">
      {heroDesk.text}
    </p>

    <div className="mt-7 flex flex-wrap gap-2">
      {heroDesk.chips.map((chip: string) => (
        <span
          key={chip}
          className="rounded-full border border-white/10 bg-black/20 px-3.5 py-2 text-xs font-bold text-white/68 backdrop-blur-xl"
        >
          {chip}
        </span>
      ))}
    </div>

    <div className="mt-9 flex flex-wrap gap-3">
      <button
        onClick={() => setActive("pricing")}
        className="group relative overflow-hidden rounded-full border border-white/20 bg-white px-7 py-3.5 text-sm font-black text-[#06111d] shadow-[0_18px_70px_rgba(255,255,255,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(34,211,238,0.28)] active:translate-y-0"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white via-cyan-100 to-emerald-100 opacity-0 transition group-hover:opacity-100" />
        <span className="relative">
          {t.start}
          <span className="ml-2">в†’</span>
        </span>
      </button>

      <button
        onClick={() => setActive("product")}
        className="group rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-7 py-3.5 text-sm font-black text-cyan-50/82 shadow-[0_18px_70px_rgba(8,47,73,0.22)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-100/45 hover:bg-cyan-100/[0.12] hover:text-white active:translate-y-0"
      >
        {t.tour}
        <span className="ml-2 opacity-70 transition group-hover:translate-x-1">в†—</span>
      </button>
    </div>

    <div className="mt-10 grid gap-3 md:grid-cols-3">
  {heroDesk.stats.map((stat: string[], index: number) => {
    const value = stat[0] ?? "";
const label = stat[1] ?? "";

    return (
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 + index * 0.08, duration: 0.45 }}
        className="group rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/25 hover:bg-white/[0.07]"
      >
        <div className="text-base font-black text-white md:text-lg">
          {value}
        </div>

        <div className="mt-2 text-xs font-semibold leading-5 text-white/48">
          {label}
        </div>
      </motion.div>
    );
  })}
</div>
  </motion.div>

  <PremiumHeroDeskVisual copy={heroDesk.visual} />
</section>

      <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(239,68,68,0.12),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.12),transparent_32%)]" />

  <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
    <div>
      <Badge>{t.problemEyebrow}</Badge>

      <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
        {t.problemTitle}
      </h2>

      <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/68">
        {t.problemText}
      </p>

      <div className="mt-7 rounded-[1.5rem] border border-cyan-200/15 bg-cyan-200/[0.055] p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/50">
          Trader workflow
        </div>
        <div className="mt-3 text-base font-black text-white">
          Scan в†’ Plan в†’ Execute в†’ Journal в†’ Review в†’ Improve
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
          SkillEdge AI РґРѕР»Р¶РµРЅ СЃРѕРµРґРёРЅСЏС‚СЊ СЂС‹РЅРѕРє, СЂРµС€РµРЅРёРµ, СЃРґРµР»РєСѓ Рё СЂР°Р·Р±РѕСЂ РІ РѕРґРёРЅ СЂР°Р±РѕС‡РёР№ С†РёРєР».
        </p>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {homeProblemCards.map((card: string[], index: number) => {
        const title = card[0] ?? "";
        const text = card[1] ?? "";

        return (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.06, duration: 0.45 }}
            whileHover={{ y: -5 }}
            className="group rounded-[1.5rem] border border-white/10 bg-black/22 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-300 hover:border-cyan-200/25 hover:bg-white/[0.055]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-black text-white">{title}</div>
              <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-white/45">
                0{index + 1}
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold leading-7 text-white/56">
              {text}
            </p>
          </motion.div>
        );
      })}
    </div>
  </div>
</section>

<section className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/12 bg-[#081522]/72 p-6 shadow-[0_34px_140px_rgba(8,47,73,0.22)] backdrop-blur-xl md:p-8 lg:p-10">
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_10%_80%,rgba(59,130,246,0.13),transparent_34%)]" />

  <div className="relative">
    <SectionTitle
      eyebrow={t.productPage.modulesEyebrow}
      title={t.homeSections.whyTitle}
      text={t.homeSections.whyText}
    />

    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {t.homeSections.cards.map((card: string[], index: number) => {
        const title = card[0] ?? "";
        const text = card[1] ?? "";

        return (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.06, duration: 0.45 }}
            whileHover={{ y: -6, scale: 1.01 }}
            className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-300 hover:border-emerald-200/25 hover:bg-white/[0.07]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent opacity-0 transition group-hover:opacity-100" />

            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.07] text-sm font-black text-cyan-50">
              {index + 1}
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
    </motion.div>
  );
}


function ProductPage({ t, setActive }: { t: any; setActive: (value: PageKey) => void }) {
  const p = t.productPage;

  const journalEquity = [
  { month: "Jan", pnl: 420 },
  { month: "Feb", pnl: 980 },
  { month: "Mar", pnl: 1550 },
  { month: "Apr", pnl: 2400 },
  { month: "May", pnl: 3650 },
  { month: "Jun", pnl: 5200 },
];

const journalStats =
  t.lang === "EN"
    ? [
        ["+$5.2K", "Example net PnL"],
        ["68%", "Win rate"],
        ["2.4", "Profit factor"],
        ["3.1R", "Best setup avg"],
      ]
    : t.lang === "UA"
      ? [
          ["+$5.2K", "РџСЂРёРєР»Р°Рґ net PnL"],
          ["68%", "Win rate"],
          ["2.4", "Profit factor"],
          ["3.1R", "РЎРµСЂРµРґРЅС–Р№ R РЅР°Р№РєСЂР°С‰РѕРіРѕ СЃРµС‚Р°РїСѓ"],
        ]
      : [
          ["+$5.2K", "РџСЂРёРјРµСЂ net PnL"],
          ["68%", "Win rate"],
          ["2.4", "Profit factor"],
          ["3.1R", "РЎСЂРµРґРЅРёР№ R Р»СѓС‡С€РµРіРѕ СЃРµС‚Р°РїР°"],
        ];

  const architectureSteps =
  t.lang === "EN"
    ? [
        ["01", "Market Data", "Stocks, crypto, catalysts, volume and attention"],
        ["02", "Candidate Engine", "Filters active names from dead charts"],
        ["03", "Setup Engine", "Classifies structure, trigger, risk and context"],
        ["04", "AI Validation", "Rejects weak ideas before they become alerts"],
        ["05", "Alert Delivery", "Sends only structured trade ideas"],
        ["06", "Journal Sync", "Connects signal, execution and outcome"],
        ["07", "Outcome Review", "Learns what worked, failed or was skipped"],
      ]
    : t.lang === "UA"
      ? [
          ["01", "Market Data", "РђРєС†С–С—, РєСЂРёРїС‚Р°, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё, РѕР±КјС”Рј С– СѓРІР°РіР°"],
          ["02", "Candidate Engine", "Р’С–РґСЃС–РєР°С” РјРµСЂС‚РІС– РіСЂР°С„С–РєРё С‚Р° Р·Р°Р»РёС€Р°С” Р°РєС‚РёРІРЅС– С–РјРµРЅР°"],
          ["03", "Setup Engine", "РљР»Р°СЃРёС„С–РєСѓС” СЃС‚СЂСѓРєС‚СѓСЂСѓ, С‚СЂРёРіРµСЂ, СЂРёР·РёРє С– РєРѕРЅС‚РµРєСЃС‚"],
          ["04", "AI Validation", "Р’С–РґС…РёР»СЏС” СЃР»Р°Р±РєС– С–РґРµС— РґРѕ С‚РѕРіРѕ, СЏРє РІРѕРЅРё СЃС‚Р°РЅСѓС‚СЊ СЃРёРіРЅР°Р»Р°РјРё"],
          ["05", "Alert Delivery", "РџРѕРєР°Р·СѓС” С‚С–Р»СЊРєРё СЃС‚СЂСѓРєС‚СѓСЂРѕРІР°РЅС– С‚РѕСЂРіРѕРІС– С–РґРµС—"],
          ["06", "Journal Sync", "Р—РІКјСЏР·СѓС” СЃРёРіРЅР°Р», РІРёРєРѕРЅР°РЅРЅСЏ С‚Р° СЂРµР·СѓР»СЊС‚Р°С‚"],
          ["07", "Outcome Review", "РџРѕРєР°Р·СѓС”, С‰Рѕ СЃРїСЂР°С†СЋРІР°Р»Рѕ, С‰Рѕ Р·Р»Р°РјР°Р»РѕСЃСЊ С– С‰Рѕ Р±СѓР»Рѕ РїСЂРѕРїСѓС‰РµРЅРѕ"],
        ]
      : [
          ["01", "Market Data", "РђРєС†РёРё, РєСЂРёРїС‚Р°, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹, РѕР±СЉС‘Рј Рё РІРЅРёРјР°РЅРёРµ"],
          ["02", "Candidate Engine", "РћС‚СЃРµРєР°РµС‚ РјС‘СЂС‚РІС‹Рµ РіСЂР°С„РёРєРё Рё РѕСЃС‚Р°РІР»СЏРµС‚ Р°РєС‚РёРІРЅС‹Рµ С‚РёРєРµСЂС‹"],
          ["03", "Setup Engine", "РљР»Р°СЃСЃРёС„РёС†РёСЂСѓРµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ, С‚СЂРёРіРіРµСЂ, СЂРёСЃРє Рё РєРѕРЅС‚РµРєСЃС‚"],
          ["04", "AI Validation", "РћС‚Р±СЂР°СЃС‹РІР°РµС‚ СЃР»Р°Р±С‹Рµ РёРґРµРё РґРѕ С‚РѕРіРѕ, РєР°Рє РѕРЅРё СЃС‚Р°РЅСѓС‚ СЃРёРіРЅР°Р»Р°РјРё"],
          ["05", "Alert Delivery", "РџРѕРєР°Р·С‹РІР°РµС‚ С‚РѕР»СЊРєРѕ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Рµ С‚РѕСЂРіРѕРІС‹Рµ РёРґРµРё"],
          ["06", "Journal Sync", "РЎРІСЏР·С‹РІР°РµС‚ СЃРёРіРЅР°Р», РёСЃРїРѕР»РЅРµРЅРёРµ Рё СЂРµР·СѓР»СЊС‚Р°С‚"],
          ["07", "Outcome Review", "РџРѕРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ СЃСЂР°Р±РѕС‚Р°Р»Рѕ, С‡С‚Рѕ СЃР»РѕРјР°Р»РѕСЃСЊ Рё С‡С‚Рѕ Р±С‹Р»Рѕ РїСЂРѕРїСѓС‰РµРЅРѕ"],
        ];

  const systemBlocks =
  t.lang === "EN"
    ? [
        {
          label: "Market Intelligence",
          title: "Find what is actually in play.",
          text: "The scanner is not built to show everything. It is built to filter attention, movement, catalysts and abnormal activity into a usable shortlist.",
          points: ["Stocks + crypto", "Volume / move filters", "Catalyst context", "Social/news layer"],
        },
        {
          label: "Setup Engine",
          title: "Signals start from structure, not hype.",
          text: "SkillEdge AI reads the candidate through setup, trigger, entry location, stop, targets, RR and invalidation before showing it as actionable.",
          points: ["VWAP / reclaim", "Failed breakout", "Liquidity sweep", "Continuation / fade"],
        },
        {
          label: "Execution Loop",
          title: "The trade does not end at entry.",
          text: "Every alert can become a trade draft, every trade can be journaled, and every outcome can improve the traderвЂ™s playbook.",
          points: ["Signal в†’ trade", "Journal review", "Outcome tracking", "Personal patterns"],
        },
      ]
    : t.lang === "UA"
      ? [
          {
            label: "Market Intelligence",
            title: "Р—РЅР°С…РѕРґРёС‚СЊ С‚Рµ, С‰Рѕ СЂРµР°Р»СЊРЅРѕ РІ РіСЂС–.",
            text: "РЎРєР°РЅРµСЂ РЅРµ СЃС‚РІРѕСЂРµРЅРёР№ РїРѕРєР°Р·СѓРІР°С‚Рё РІСЃРµ РїС–РґСЂСЏРґ. Р’С–РЅ С„С–Р»СЊС‚СЂСѓС” СѓРІР°РіСѓ, СЂСѓС…, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё Р№ Р°РЅРѕРјР°Р»СЊРЅСѓ Р°РєС‚РёРІРЅС–СЃС‚СЊ Сѓ РєРѕСЂРѕС‚РєРёР№ СЃРїРёСЃРѕРє РґР»СЏ С‚СЂРµР№РґРµСЂР°.",
            points: ["РђРєС†С–С— + РєСЂРёРїС‚Р°", "Р¤С–Р»СЊС‚СЂРё РѕР±КјС”РјСѓ / СЂСѓС…Сѓ", "РљРѕРЅС‚РµРєСЃС‚ РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂР°", "Social/news С€Р°СЂ"],
          },
          {
            label: "Setup Engine",
            title: "РЎРёРіРЅР°Р»Рё РїРѕС‡РёРЅР°СЋС‚СЊСЃСЏ Р·С– СЃС‚СЂСѓРєС‚СѓСЂРё, Р° РЅРµ Р· С…Р°Р№РїСѓ.",
            text: "SkillEdge AI РѕС†С–РЅСЋС” РєР°РЅРґРёРґР°С‚Р° С‡РµСЂРµР· СЃРµС‚Р°Рї, С‚СЂРёРіРµСЂ, Р·РѕРЅСѓ РІС…РѕРґСѓ, СЃС‚РѕРї, С†С–Р»С–, RR С‚Р° invalidation РїРµСЂРµРґ С‚РёРј, СЏРє РїРѕРєР°Р·Р°С‚Рё С–РґРµСЋ СЏРє actionable.",
            points: ["VWAP / reclaim", "Failed breakout", "Liquidity sweep", "Continuation / fade"],
          },
          {
            label: "Execution Loop",
            title: "РЈРіРѕРґР° РЅРµ Р·Р°РєС–РЅС‡СѓС”С‚СЊСЃСЏ РЅР° РІС…РѕРґС–.",
            text: "РљРѕР¶РµРЅ alert РјРѕР¶Рµ СЃС‚Р°С‚Рё С‡РµСЂРЅРµС‚РєРѕСЋ СѓРіРѕРґРё, РєРѕР¶РЅР° СѓРіРѕРґР° вЂ” Р·Р°РїРёСЃРѕРј Сѓ Р¶СѓСЂРЅР°Р»С–, Р° РєРѕР¶РµРЅ СЂРµР·СѓР»СЊС‚Р°С‚ вЂ” РїРѕРєСЂР°С‰РµРЅРЅСЏРј playbook С‚СЂРµР№РґРµСЂР°.",
            points: ["РЎРёРіРЅР°Р» в†’ СѓРіРѕРґР°", "Р РѕР·Р±С–СЂ Р¶СѓСЂРЅР°Р»Сѓ", "Outcome tracking", "РџРµСЂСЃРѕРЅР°Р»СЊРЅС– РїР°С‚РµСЂРЅРё"],
          },
        ]
      : [
          {
            label: "Market Intelligence",
            title: "РќР°С…РѕРґРёС‚ С‚Рѕ, С‡С‚Рѕ СЂРµР°Р»СЊРЅРѕ РІ РёРіСЂРµ.",
            text: "РЎРєР°РЅРµСЂ РЅРµ СЃРѕР·РґР°РЅ РїРѕРєР°Р·С‹РІР°С‚СЊ РІСЃС‘ РїРѕРґСЂСЏРґ. РћРЅ С„РёР»СЊС‚СЂСѓРµС‚ РІРЅРёРјР°РЅРёРµ, РґРІРёР¶РµРЅРёРµ, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹ Рё Р°РЅРѕРјР°Р»СЊРЅСѓСЋ Р°РєС‚РёРІРЅРѕСЃС‚СЊ РІ РєРѕСЂРѕС‚РєРёР№ СЃРїРёСЃРѕРє РґР»СЏ С‚СЂРµР№РґРµСЂР°.",
            points: ["РђРєС†РёРё + РєСЂРёРїС‚Р°", "Р¤РёР»СЊС‚СЂС‹ РѕР±СЉС‘РјР° / РґРІРёР¶РµРЅРёСЏ", "РљРѕРЅС‚РµРєСЃС‚ РєР°С‚Р°Р»РёР·Р°С‚РѕСЂР°", "Social/news СЃР»РѕР№"],
          },
          {
            label: "Setup Engine",
            title: "РЎРёРіРЅР°Р»С‹ РЅР°С‡РёРЅР°СЋС‚СЃСЏ СЃРѕ СЃС‚СЂСѓРєС‚СѓСЂС‹, Р° РЅРµ СЃ С…Р°Р№РїР°.",
            text: "SkillEdge AI РѕС†РµРЅРёРІР°РµС‚ РєР°РЅРґРёРґР°С‚Р° С‡РµСЂРµР· СЃРµС‚Р°Рї, С‚СЂРёРіРіРµСЂ, Р·РѕРЅСѓ РІС…РѕРґР°, СЃС‚РѕРї, С†РµР»Рё, RR Рё invalidation РїРµСЂРµРґ С‚РµРј, РєР°Рє РїРѕРєР°Р·Р°С‚СЊ РёРґРµСЋ РєР°Рє actionable.",
            points: ["VWAP / reclaim", "Failed breakout", "Liquidity sweep", "Continuation / fade"],
          },
          {
            label: "Execution Loop",
            title: "РЎРґРµР»РєР° РЅРµ Р·Р°РєР°РЅС‡РёРІР°РµС‚СЃСЏ РЅР° РІС…РѕРґРµ.",
            text: "РљР°Р¶РґС‹Р№ alert РјРѕР¶РµС‚ СЃС‚Р°С‚СЊ С‡РµСЂРЅРѕРІРёРєРѕРј СЃРґРµР»РєРё, РєР°Р¶РґР°СЏ СЃРґРµР»РєР° вЂ” Р·Р°РїРёСЃСЊСЋ РІ Р¶СѓСЂРЅР°Р»Рµ, Р° РєР°Р¶РґС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ вЂ” СѓР»СѓС‡С€РµРЅРёРµРј playbook С‚СЂРµР№РґРµСЂР°.",
            points: ["РЎРёРіРЅР°Р» в†’ СЃРґРµР»РєР°", "Р Р°Р·Р±РѕСЂ Р¶СѓСЂРЅР°Р»Р°", "Outcome tracking", "РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ РїР°С‚С‚РµСЂРЅС‹"],
          },
        ];

  const operatingRules = [
    ["No blind calls", "A ticker is not a trade until setup, trigger, stop and RR are clear."],
    ["No chase", "If the move is extended and the entry is late, the system must downgrade the idea."],
    ["Risk first", "A clean stop and invalidation matter more than the excitement of the move."],
    ["Review everything", "The system connects plan, execution and result so the trader can improve."],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1600px] space-y-20 px-4 pb-28 pt-10 sm:px-6 lg:px-8 xl:px-10"
    >
      <section className="relative overflow-hidden rounded-[3.2rem] border border-cyan-200/14 bg-[#06131f]/86 p-5 shadow-[0_45px_180px_rgba(8,47,73,0.35)] backdrop-blur-2xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(34,211,238,0.14),transparent_28%,rgba(16,185,129,0.12)_58%,transparent_74%),radial-gradient(circle_at_78%_12%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_18%_92%,rgba(59,130,246,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:54px_54px] opacity-35" />

        <div className="relative grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
          <div>
            <Badge>{p.heroBadge}</Badge>

            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.065em] text-white md:text-6xl xl:text-7xl">
              {p.heroTitle}
            </h1>

            <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/68 md:text-lg">
              {p.heroText}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setActive("pricing")}
                className="group relative overflow-hidden rounded-full border border-white/20 bg-white px-7 py-3.5 text-sm font-black text-[#06111d] shadow-[0_18px_70px_rgba(255,255,255,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(34,211,238,0.25)]"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white via-cyan-100 to-emerald-100 opacity-0 transition group-hover:opacity-100" />
                <span className="relative">
                  {p.ctaPrimary}
                  <span className="ml-2">в†’</span>
                </span>
              </button>

              <button
                onClick={() => setActive("team")}
                className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-7 py-3.5 text-sm font-black text-cyan-50/82 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-100/45 hover:bg-cyan-100/[0.12] hover:text-white"
              >
                {p.ctaSecondary}
                <span className="ml-2 opacity-70">в†—</span>
              </button>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {p.heroCards.map((card: any, index: number) => {
                const title = Array.isArray(card) ? card[0] ?? "" : "";
                const text = Array.isArray(card) ? card[1] ?? "" : "";

                return (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.08, duration: 0.45 }}
                    className="rounded-[1.35rem] border border-white/10 bg-black/22 p-4 backdrop-blur-xl"
                  >
                    <div className="text-sm font-black text-white">{title}</div>
                    <div className="mt-2 text-xs font-semibold leading-5 text-white/50">
                      {text}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <ProductCommandCenterVisual lang={t.lang} />
        </div>
      </section>

<section className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
  <ProductEquityCurvePanel equity={journalEquity} stats={journalStats} lang={t.lang} />

  <motion.div
    initial={{ opacity: 0, x: 24 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.5 }}
    className="relative overflow-hidden rounded-[2.4rem] border border-emerald-200/14 bg-emerald-200/[0.055] p-6 shadow-[0_34px_140px_rgba(6,78,59,0.22)] backdrop-blur-xl md:p-7"
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.18),transparent_34%)]" />

    <div className="relative">
      <Badge>Journal intelligence</Badge>

      <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white">
        Р–СѓСЂРЅР°Р» РґРѕР»Р¶РµРЅ РїРѕРєР°Р·С‹РІР°С‚СЊ РЅРµ РїСЂРѕСЃС‚Рѕ СЃРґРµР»РєРё, Р° СЂРѕСЃС‚ С‚СЂРµР№РґРµСЂР°.
      </h2>

      <p className="mt-5 text-sm font-semibold leading-7 text-white/62">
        SkillEdge AI СЃРІСЏР·С‹РІР°РµС‚ PnL, setup, screenshots, СЌРјРѕС†РёРё, СЂРёСЃРє, РІС…РѕРґС‹,
        СЃС‚РѕРїС‹ Рё СЂРµР·СѓР»СЊС‚Р°С‚. РљР»РёРµРЅС‚ РІРёРґРёС‚, РєР°РєРёРµ РїР°С‚С‚РµСЂРЅС‹ РґР°СЋС‚ РґРµРЅСЊРіРё, РіРґРµ РѕРЅ
        С‚РµСЂСЏРµС‚ РґРёСЃС†РёРїР»РёРЅСѓ Рё РєР°РєРёРµ РґРµР№СЃС‚РІРёСЏ РїРѕРІС‚РѕСЂСЏС‚СЊ.
      </p>

      <div className="mt-6 grid gap-3">
        {[
          ["Best setups", "РєР°РєРёРµ РјРѕРґРµР»Рё РґР°СЋС‚ Р»СѓС‡С€РёР№ PnL"],
          ["Leak detection", "РіРґРµ С‚СЂРµР№РґРµСЂ С‚РµСЂСЏРµС‚ РґРµРЅСЊРіРё"],
          ["Execution score", "РєР°С‡РµСЃС‚РІРѕ РІС…РѕРґР°, СЃС‚РѕРїР° Рё РІС‹С…РѕРґР°"],
          ["Personal alerts", "Р±СѓРґСѓС‰РёРµ СЃРёРіРЅР°Р»С‹ РїРѕРґ СЃРёР»СЊРЅС‹Рµ РїР°С‚С‚РµСЂРЅС‹ РєР»РёРµРЅС‚Р°"],
        ].map(([title, text]) => (
          <div
            key={title}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="text-sm font-black text-white">{title}</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-white/50">
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  </motion.div>
</section>

      <section className="relative overflow-hidden rounded-[2.7rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_40px_160px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.13),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(34,211,238,0.13),transparent_30%)]" />

        <div className="relative">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge>
  {t.lang === "EN"
    ? "System architecture"
    : t.lang === "UA"
      ? "РђСЂС…С–С‚РµРєС‚СѓСЂР° СЃРёСЃС‚РµРјРё"
      : "РђСЂС…РёС‚РµРєС‚СѓСЂР° СЃРёСЃС‚РµРјС‹"}
</Badge>
              <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
                {t.lang === "EN"
  ? "Market data becomes a decision system."
  : t.lang === "UA"
    ? "Р РёРЅРєРѕРІС– РґР°РЅС– РїРµСЂРµС‚РІРѕСЂСЋСЋС‚СЊСЃСЏ РЅР° СЃРёСЃС‚РµРјСѓ СЂС–С€РµРЅСЊ."
    : "Р С‹РЅРѕС‡РЅС‹Рµ РґР°РЅРЅС‹Рµ РїСЂРµРІСЂР°С‰Р°СЋС‚СЃСЏ РІ СЃРёСЃС‚РµРјСѓ СЂРµС€РµРЅРёР№."}
              </h2>
            </div>

            <p className="max-w-xl text-sm font-semibold leading-7 text-white/58">
              {t.lang === "EN"
  ? "Product page is the blueprint: how SkillEdge turns market activity into structured trade ideas, journal feedback and personal improvement."
  : t.lang === "UA"
    ? "Р¦Рµ СЃС…РµРјР° РїСЂРѕРґСѓРєС‚Сѓ: СЏРє SkillEdge РїРµСЂРµС‚РІРѕСЂСЋС” СЂРёРЅРєРѕРІСѓ Р°РєС‚РёРІРЅС–СЃС‚СЊ РЅР° СЃС‚СЂСѓРєС‚СѓСЂРѕРІР°РЅС– С‚РѕСЂРіРѕРІС– С–РґРµС—, Р¶СѓСЂРЅР°Р» С– РїРѕРєСЂР°С‰РµРЅРЅСЏ РІРёРєРѕРЅР°РЅРЅСЏ."
    : "Р­С‚Рѕ СЃС…РµРјР° РїСЂРѕРґСѓРєС‚Р°: РєР°Рє SkillEdge РїСЂРµРІСЂР°С‰Р°РµС‚ СЂС‹РЅРѕС‡РЅСѓСЋ Р°РєС‚РёРІРЅРѕСЃС‚СЊ РІ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Рµ С‚РѕСЂРіРѕРІС‹Рµ РёРґРµРё, Р¶СѓСЂРЅР°Р» Рё СѓР»СѓС‡С€РµРЅРёРµ РёСЃРїРѕР»РЅРµРЅРёСЏ."}
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-[2rem] border border-cyan-200/14 bg-[#06131f]/72 p-4 md:p-5">
            <div className="grid gap-3 xl:grid-cols-7">
              {architectureSteps.map(([step, title, text], index) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.05, duration: 0.45 }}
                  className="relative rounded-[1.45rem] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl"
                >
                  {index < architectureSteps.length - 1 ? (
                    <div className="absolute -right-2 top-1/2 hidden h-px w-4 bg-cyan-200/35 xl:block" />
                  ) : null}

                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-200/[0.08] text-xs font-black text-cyan-50">
                    {step}
                  </div>

                  <div className="mt-4 text-base font-black text-white">{title}</div>
                  <p className="mt-2 text-xs font-semibold leading-6 text-white/50">
                    {text}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {systemBlocks.map((block, index) => (
          <motion.div
            key={block.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.07, duration: 0.45 }}
            whileHover={{ y: -7 }}
            className={`relative overflow-hidden rounded-[2.3rem] border p-6 shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-300 md:p-7 ${
              index === 1
                ? "border-cyan-200/18 bg-cyan-200/[0.07]"
                : index === 2
                  ? "border-emerald-200/16 bg-emerald-200/[0.055]"
                  : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.09),transparent_28%)]" />

            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/50">
                {block.label}
              </div>

              <h3 className="mt-5 text-3xl font-black leading-[1.02] tracking-[-0.045em] text-white">
                {block.title}
              </h3>

              <p className="mt-4 text-sm font-semibold leading-7 text-white/60">
                {block.text}
              </p>

              <div className="mt-6 grid gap-2">
                {block.points.map((point) => (
                  <div
                    key={point}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white/58"
                  >
                    вњ“ {point}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="relative grid gap-8 overflow-hidden rounded-[2.7rem] border border-cyan-200/12 bg-[#081522]/80 p-6 shadow-[0_40px_160px_rgba(8,47,73,0.25)] backdrop-blur-xl md:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.13),transparent_32%),radial-gradient(circle_at_90%_80%,rgba(16,185,129,0.13),transparent_34%)]" />

        <div className="relative">
          <Badge>{p.flowEyebrow}</Badge>

          <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
            {p.flowTitle}
          </h2>

          <p className="mt-5 text-base font-semibold leading-8 text-white/64">
            {p.flowText}
          </p>

          <div className="mt-7 rounded-[1.5rem] border border-emerald-200/15 bg-emerald-200/[0.055] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/50">
              Operating loop
            </div>
            <div className="mt-3 text-base font-black text-white">
              Scan в†’ Setup в†’ Trigger в†’ Plan в†’ Journal в†’ Outcome
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-[2rem] border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
            <div className="space-y-3">
              {p.flow.map((item: any, index: number) => {
                const step = Array.isArray(item) ? item[0] ?? "" : "";
                const title = Array.isArray(item) ? item[1] ?? "" : "";
                const text = Array.isArray(item) ? item[2] ?? "" : "";

                return (
                  <motion.div
                    key={`${step}-${title}`}
                    initial={{ opacity: 0, x: 24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ delay: index * 0.05, duration: 0.45 }}
                    className="grid gap-4 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[90px_1fr]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.07] text-sm font-black text-cyan-50 md:h-full md:w-full">
                      {step}
                    </div>

                    <div>
                      <div className="text-lg font-black text-white">{title}</div>
                      <p className="mt-2 text-sm font-semibold leading-7 text-white/56">
                        {text}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.7rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.12),transparent_32%)]" />

        <div className="relative">
          <SectionTitle eyebrow={p.modulesEyebrow} title={p.modulesTitle} text={p.modulesText} />

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {p.modules.map((module: any, index: number) => {
              const title = Array.isArray(module) ? module[0] ?? "" : "";
              const text = Array.isArray(module) ? module[1] ?? "" : "";
              const items = Array.isArray(module) && Array.isArray(module[2]) ? module[2] : [];

              return (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.05, duration: 0.45 }}
                  className={`rounded-[1.7rem] border p-5 backdrop-blur-xl ${
                    index % 3 === 0
                      ? "border-cyan-200/14 bg-cyan-200/[0.045]"
                      : index % 3 === 1
                        ? "border-emerald-200/14 bg-emerald-200/[0.04]"
                        : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="text-xl font-black tracking-[-0.025em] text-white">
                    {title}
                  </div>

                  <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
                    {text}
                  </p>

                  <div className="mt-5 grid gap-2">
                    {items.map((item: string) => (
                      <div
                        key={item}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white/56"
                      >
                        вњ“ {item}
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.7rem] border border-white/10 bg-[#06131f]/86 p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
        <SectionTitle eyebrow={p.differentEyebrow} title={p.differentTitle} text={p.differentText} />

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10">
          <div className="grid grid-cols-[0.8fr_1fr_1fr] border-b border-white/10 bg-white/[0.055] px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-white/50">
            <div>Process</div>
            <div>Old way</div>
            <div>SkillEdge way</div>
          </div>

          {p.comparisons.map((comparison: any, index: number) => {
            const title = Array.isArray(comparison) ? comparison[0] ?? "" : "";
            const weak = Array.isArray(comparison) ? comparison[1] ?? "" : "";
            const strong = Array.isArray(comparison) ? comparison[2] ?? "" : "";

            return (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.05, duration: 0.4 }}
                className="grid grid-cols-1 border-b border-white/10 last:border-b-0 md:grid-cols-[0.8fr_1fr_1fr]"
              >
                <div className="bg-white/[0.035] p-5 text-base font-black text-white">
                  {title}
                </div>

                <div className="border-t border-white/10 bg-rose-300/[0.035] p-5 text-sm font-semibold leading-7 text-white/56 md:border-l md:border-t-0">
                  {weak}
                </div>

                <div className="border-t border-white/10 bg-emerald-300/[0.04] p-5 text-sm font-semibold leading-7 text-white/68 md:border-l md:border-t-0">
                  {strong}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <FinalCta
        title={p.finalTitle}
        text={p.finalText}
        checklist={p.finalChecklist}
        button={p.ctaPrimary}
        onClick={() => setActive("pricing")}
      />
    </motion.div>
  );
}

function ProductEquityCurvePanel({
  equity,
  stats,
  lang,
}: {
  equity: Array<{ month: string; pnl: number }>;
  stats: string[][];
  lang: string;
}) {
  const maxPnl = Math.max(...equity.map((item) => item.pnl));
  const points = equity
    .map((item, index) => {
      const x = 24 + index * 82;
      const y = 210 - (item.pnl / maxPnl) * 150;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-[2.4rem] border border-cyan-200/14 bg-[#06131f]/88 p-6 shadow-[0_40px_160px_rgba(8,47,73,0.3)] backdrop-blur-2xl md:p-7"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.12),transparent_32%)]" />

      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-100/50">
              {lang === "EN" ? "Journal equity curve" : lang === "UA" ? "Equity curve Р¶СѓСЂРЅР°Р»Сѓ" : "Equity curve Р¶СѓСЂРЅР°Р»Р°"}
            </div>

            <h2 className="mt-4 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
              {lang === "EN"
  ? "Example PnL growth from a trader journal."
  : lang === "UA"
    ? "РџСЂРёРєР»Р°Рґ СЂРѕСЃС‚Сѓ PnL Р· Р¶СѓСЂРЅР°Р»Сѓ С‚СЂРµР№РґРµСЂР°."
    : "РџСЂРёРјРµСЂ СЂРѕСЃС‚Р° PnL РёР· Р¶СѓСЂРЅР°Р»Р° С‚СЂРµР№РґРµСЂР°."}
            </h2>

            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/58">
              {lang === "EN"
  ? "Not a profit promise. This is an example of how SkillEdge can show result dynamics, setup quality and process repeatability."
  : lang === "UA"
    ? "Р¦Рµ РЅРµ РѕР±С–С†СЏРЅРєР° РїСЂРёР±СѓС‚РєСѓ. Р¦Рµ РїСЂРёРєР»Р°Рґ С‚РѕРіРѕ, СЏРє SkillEdge РїРѕРєР°Р·СѓС” РґРёРЅР°РјС–РєСѓ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ, СЏРєС–СЃС‚СЊ СЃРµС‚Р°РїС–РІ С– РїРѕРІС‚РѕСЂСЋРІР°РЅС–СЃС‚СЊ РїСЂРѕС†РµСЃСѓ."
    : "Р­С‚Рѕ РЅРµ РѕР±РµС‰Р°РЅРёРµ РґРѕС…РѕРґРЅРѕСЃС‚Рё. Р­С‚Рѕ РїСЂРёРјРµСЂ С‚РѕРіРѕ, РєР°Рє SkillEdge РїРѕРєР°Р·С‹РІР°РµС‚ РґРёРЅР°РјРёРєСѓ СЂРµР·СѓР»СЊС‚Р°С‚Р°, РєР°С‡РµСЃС‚РІРѕ СЃРµС‚Р°РїРѕРІ Рё РїРѕРІС‚РѕСЂСЏРµРјРѕСЃС‚СЊ С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°."}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/45">
              6M curve
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-50">
              Uptrend
            </div>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/24 p-4">
          <svg viewBox="0 0 470 240" className="h-[260px] w-full">
            <defs>
              <linearGradient id="equityLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>

              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[40, 80, 120, 160, 200].map((y) => (
              <line
                key={y}
                x1="24"
                y1={y}
                x2="444"
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="5 6"
              />
            ))}

            <polyline
              points={`24,220 ${points} 434,220`}
              fill="url(#equityFill)"
              stroke="none"
            />

            <motion.polyline
              points={points}
              fill="none"
              stroke="url(#equityLine)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />

            {equity.map((item, index) => {
              const x = 24 + index * 82;
              const y = 210 - (item.pnl / maxPnl) * 150;

              return (
                <g key={item.month}>
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill="#07111d"
                    stroke="#67e8f9"
                    strokeWidth="3"
                  />
                  <text
                    x={x}
                    y="232"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.46)"
                    fontSize="11"
                    fontWeight="800"
                  >
                    {item.month}
                  </text>
                  <text
                    x={x}
                    y={y - 14}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.78)"
                    fontSize="11"
                    fontWeight="900"
                  >
                    ${item.pnl}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([value, label]) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
            >
              <div className="text-2xl font-black text-white">{value}</div>
              <div className="mt-2 text-xs font-semibold leading-5 text-white/45">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ProductCommandCenterVisual({ lang }: { lang: string }) {
  const copy =
    lang === "EN"
      ? {
          eyebrow: "Command center",
          status: "Live workflow",
          title: "Trading System Map",
          cards: [
            ["Scanner", "PSIX В· SRXH В· BTC"],
            ["Setup", "VWAP reclaim В· liquidity sweep"],
            ["Trigger", "hold above level / no chase"],
            ["Risk", "stop near invalidation В· RR filter"],
            ["Output", "Watch only в†’ A actionable"],
          ],
          bottom: [
            ["Data", "candidate"],
            ["AI", "validation"],
            ["Desk", "decision"],
          ],
        }
      : lang === "UA"
        ? {
            eyebrow: "Command center",
            status: "Р–РёРІРёР№ workflow",
            title: "РљР°СЂС‚Р° С‚РѕСЂРіРѕРІРѕС— СЃРёСЃС‚РµРјРё",
            cards: [
              ["РЎРєР°РЅРµСЂ", "PSIX В· SRXH В· BTC"],
              ["РЎРµС‚Р°Рї", "VWAP reclaim В· liquidity sweep"],
              ["РўСЂРёРіРµСЂ", "СѓС‚СЂРёРјР°РЅРЅСЏ СЂС–РІРЅСЏ / no chase"],
              ["Р РёР·РёРє", "СЃС‚РѕРї Р±С–Р»СЏ invalidation В· RR-С„С–Р»СЊС‚СЂ"],
              ["Р РµР·СѓР»СЊС‚Р°С‚", "Watch only в†’ A actionable"],
            ],
            bottom: [
              ["Р”Р°РЅС–", "РєР°РЅРґРёРґР°С‚"],
              ["AI", "РІР°Р»С–РґР°С†С–СЏ"],
              ["Desk", "СЂС–С€РµРЅРЅСЏ"],
            ],
          }
        : {
            eyebrow: "Command center",
            status: "Р–РёРІРѕР№ workflow",
            title: "РљР°СЂС‚Р° С‚РѕСЂРіРѕРІРѕР№ СЃРёСЃС‚РµРјС‹",
            cards: [
              ["РЎРєР°РЅРµСЂ", "PSIX В· SRXH В· BTC"],
              ["РЎРµС‚Р°Рї", "VWAP reclaim В· liquidity sweep"],
              ["РўСЂРёРіРіРµСЂ", "СѓРґРµСЂР¶Р°РЅРёРµ СѓСЂРѕРІРЅСЏ / no chase"],
              ["Р РёСЃРє", "СЃС‚РѕРї СЂСЏРґРѕРј СЃ invalidation В· RR-С„РёР»СЊС‚СЂ"],
              ["Р РµР·СѓР»СЊС‚Р°С‚", "Watch only в†’ A actionable"],
            ],
            bottom: [
              ["Р”Р°РЅРЅС‹Рµ", "РєР°РЅРґРёРґР°С‚"],
              ["AI", "РІР°Р»РёРґР°С†РёСЏ"],
              ["Desk", "СЂРµС€РµРЅРёРµ"],
            ],
          };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.6 }}
      className="relative"
    >
      <div className="absolute -inset-10 rounded-[3rem] bg-cyan-300/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[2.25rem] border border-cyan-200/14 bg-[#04111d]/82 p-4 shadow-[0_40px_150px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,rgba(34,211,238,0.2),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(16,185,129,0.14),transparent_30%)]" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-50/50">
            {copy.eyebrow}
          </div>

          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-[10px] font-black text-emerald-100/80">
            {copy.status}
          </div>
        </div>

        <div className="relative z-10 mt-5 rounded-[1.7rem] border border-white/10 bg-black/22 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white/38">SkillEdge AI</div>
              <div className="mt-2 text-2xl font-black text-white">
                {copy.title}
              </div>
            </div>

            <motion.div
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]"
            />
          </div>

          <div className="mt-5 grid gap-3">
            {copy.cards.map(([label, value], index) => (
              <motion.div
                key={label}
                animate={{ x: [0, index % 2 === 0 ? 5 : -5, 0] }}
                transition={{
                  duration: 5 + index,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="grid grid-cols-[95px_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3"
              >
                <div className="rounded-xl border border-cyan-200/12 bg-cyan-200/[0.055] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-50/55">
                  {label}
                </div>
                <div className="text-sm font-bold text-white/76">{value}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-3">
          {copy.bottom.map(([title, text]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="text-sm font-black text-white">{title}</div>
              <div className="mt-1 text-xs font-semibold text-white/45">
                {text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function getPricingShowcaseCopy(lang: string) {
  if (lang === "EN") {
    return {
      bestFor: "Best for",
      billing: {
        monthly: "Monthly",
        monthlyNote: "Flexible start",
        halfyear: "6 months",
        halfyearNote: "Better commitment",
        yearly: "Yearly",
        yearlyNote: "Best long-term value",
      },
      meta: {
        core: {
          label: "Core workflow",
          bestFor: "Clean journal, AI Coach, screenshots and basic discipline review.",
        },
        edge: {
          label: "Active trader",
          bestFor: "Market Intelligence, AI Scanner and deeper review for active trading.",
        },
        elite: {
          label: "Full AI Trading Desk",
          bestFor: "AI Alerts, signal-to-journal workflow, outcome tracking and maximum AI limits.",
        },
      },
      spotlight: {
        eyebrow: "Elite spotlight",
        title: "The full AI Trading Desk.",
        text: "Elite is built for traders who want scanner intelligence, actionable AI Alerts, execution tracking and a feedback loop between signals and journal.",
        bullets: ["Real-time AI Alerts", "Floating alerts widget", "Signal-to-Journal", "Outcome learning"],
      },
      matrix: {
        feature: "Feature",
      },
      recommendation: {
        eyebrow: "Clean recommendation",
        title: "Choose based on how serious your process is.",
        text: "SkillEdge is not priced around hype. The higher plans unlock more review depth, market intelligence and signal workflow.",
        items: [
          ["Choose Core", "You want structure, journal discipline and basic AI review."],
          ["Choose Edge", "You actively trade and need scanner intelligence plus deeper AI analysis."],
          ["Choose Elite", "You want the full signal workflow: AI Alerts, Signal-to-Journal and outcome learning."],
        ],
      },
    };
  }

  if (lang === "UA") {
    return {
      bestFor: "РљРѕРјСѓ РїС–РґС…РѕРґРёС‚СЊ",
      billing: {
        monthly: "Р©РѕРјС–СЃСЏС†СЏ",
        monthlyNote: "Р“РЅСѓС‡РєРёР№ СЃС‚Р°СЂС‚",
        halfyear: "6 РјС–СЃСЏС†С–РІ",
        halfyearNote: "РљСЂР°С‰Р° РґРёСЃС†РёРїР»С–РЅР°",
        yearly: "Р С–Рє",
        yearlyNote: "РќР°Р№РєСЂР°С‰Р° РґРѕРІРіРѕСЃС‚СЂРѕРєРѕРІР° С†С–РЅРЅС–СЃС‚СЊ",
      },
      meta: {
        core: {
          label: "Core workflow",
          bestFor: "Р§РёСЃС‚РёР№ Р¶СѓСЂРЅР°Р», AI Coach, СЃРєСЂС–РЅС€РѕС‚Рё С‚Р° Р±Р°Р·РѕРІРёР№ СЂРѕР·Р±С–СЂ РґРёСЃС†РёРїР»С–РЅРё.",
        },
        edge: {
          label: "РђРєС‚РёРІРЅРёР№ С‚СЂРµР№РґРµСЂ",
          bestFor: "Market Intelligence, AI Scanner С– РіР»РёР±С€РёР№ review РґР»СЏ Р°РєС‚РёРІРЅРѕС— С‚РѕСЂРіС–РІР»С–.",
        },
        elite: {
          label: "РџРѕРІРЅРёР№ AI Trading Desk",
          bestFor: "AI Alerts, Signal-to-Journal, outcome tracking С– РјР°РєСЃРёРјР°Р»СЊРЅС– AI-Р»С–РјС–С‚Рё.",
        },
      },
      spotlight: {
        eyebrow: "Elite spotlight",
        title: "РџРѕРІРЅРёР№ AI Trading Desk.",
        text: "Elite СЃС‚РІРѕСЂРµРЅРёР№ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°, actionable AI Alerts, РєРѕРЅС‚СЂРѕР»СЊ РІРёРєРѕРЅР°РЅРЅСЏ С– Р·РІвЂ™СЏР·РѕРє СЃРёРіРЅР°Р»С–РІ С–Р· Р¶СѓСЂРЅР°Р»РѕРј.",
        bullets: ["Real-time AI Alerts", "Floating alerts widget", "Signal-to-Journal", "Outcome learning"],
      },
      matrix: {
        feature: "Р¤СѓРЅРєС†С–СЏ",
      },
      recommendation: {
        eyebrow: "Р§РёСЃС‚Р° СЂРµРєРѕРјРµРЅРґР°С†С–СЏ",
        title: "РћР±РёСЂР°Р№ С‚Р°СЂРёС„ РїС–Рґ СЃРµСЂР№РѕР·РЅС–СЃС‚СЊ СЃРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ.",
        text: "SkillEdge РЅРµ РїСЂРѕРґР°С” С…Р°Р№Рї. РЎС‚Р°СЂС€С– С‚Р°СЂРёС„Рё РІС–РґРєСЂРёРІР°СЋС‚СЊ РіР»РёР±С€РёР№ review, market intelligence С– СЂРѕР±РѕС‚Сѓ С–Р· СЃРёРіРЅР°Р»Р°РјРё.",
        items: [
          ["РћР±РёСЂР°Р№ Core", "РџРѕС‚СЂС–Р±РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»С–РЅР° Р¶СѓСЂРЅР°Р»Сѓ С‚Р° Р±Р°Р·РѕРІРёР№ AI review."],
          ["РћР±РёСЂР°Р№ Edge", "РўРё Р°РєС‚РёРІРЅРѕ С‚РѕСЂРіСѓС”С€ С– С…РѕС‡РµС€ AI Scanner С‚Р° РіР»РёР±С€РёР№ Р°РЅР°Р»С–Р·."],
          ["РћР±РёСЂР°Р№ Elite", "РџРѕС‚СЂС–Р±РµРЅ РїРѕРІРЅРёР№ signal workflow: AI Alerts, Signal-to-Journal С– outcome learning."],
        ],
      },
    };
  }

  return {
    bestFor: "РљРѕРјСѓ РїРѕРґС…РѕРґРёС‚",
    billing: {
      monthly: "РњРµСЃСЏС†",
      monthlyNote: "Р“РёР±РєРёР№ СЃС‚Р°СЂС‚",
      halfyear: "6 РјРµСЃСЏС†РµРІ",
      halfyearNote: "Р‘РѕР»СЊС€Рµ РґРёСЃС†РёРїР»РёРЅС‹",
      yearly: "Р“РѕРґ",
      yearlyNote: "Р›СѓС‡С€Р°СЏ РґРѕР»РіРѕСЃСЂРѕС‡РЅР°СЏ С†РµРЅРЅРѕСЃС‚СЊ",
    },
    meta: {
      core: {
        label: "Core workflow",
        bestFor: "Р§РёСЃС‚С‹Р№ Р¶СѓСЂРЅР°Р», AI Coach, СЃРєСЂРёРЅС€РѕС‚С‹ Рё Р±Р°Р·РѕРІС‹Р№ СЂР°Р·Р±РѕСЂ РґРёСЃС†РёРїР»РёРЅС‹.",
      },
      edge: {
        label: "РђРєС‚РёРІРЅС‹Р№ С‚СЂРµР№РґРµСЂ",
        bestFor: "Market Intelligence, AI Scanner Рё Р±РѕР»РµРµ РіР»СѓР±РѕРєРёР№ review РґР»СЏ Р°РєС‚РёРІРЅРѕР№ С‚РѕСЂРіРѕРІР»Рё.",
      },
      elite: {
        label: "РџРѕР»РЅС‹Р№ AI Trading Desk",
        bestFor: "AI Alerts, Signal-to-Journal, outcome tracking Рё РјР°РєСЃРёРјР°Р»СЊРЅС‹Рµ AI-Р»РёРјРёС‚С‹.",
      },
    },
    spotlight: {
      eyebrow: "Elite spotlight",
      title: "РџРѕР»РЅС‹Р№ AI Trading Desk.",
      text: "Elite СЃРѕР·РґР°РЅ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°, actionable AI Alerts, РєРѕРЅС‚СЂРѕР»СЊ РёСЃРїРѕР»РЅРµРЅРёСЏ Рё СЃРІСЏР·РєР° СЃРёРіРЅР°Р»РѕРІ СЃ Р¶СѓСЂРЅР°Р»РѕРј.",
      bullets: ["Real-time AI Alerts", "Floating alerts widget", "Signal-to-Journal", "Outcome learning"],
    },
    matrix: {
      feature: "Р¤СѓРЅРєС†РёСЏ",
    },
    recommendation: {
      eyebrow: "Р§РёСЃС‚Р°СЏ СЂРµРєРѕРјРµРЅРґР°С†РёСЏ",
      title: "Р’С‹Р±РёСЂР°Р№ С‚Р°СЂРёС„ РїРѕРґ СЃРµСЂСЊС‘Р·РЅРѕСЃС‚СЊ СЃРІРѕРµРіРѕ РїСЂРѕС†РµСЃСЃР°.",
      text: "SkillEdge РЅРµ РїСЂРѕРґР°С‘С‚ С…Р°Р№Рї. РЎС‚Р°СЂС€РёРµ С‚Р°СЂРёС„С‹ РѕС‚РєСЂС‹РІР°СЋС‚ Р±РѕР»РµРµ РіР»СѓР±РѕРєРёР№ review, market intelligence Рё СЂР°Р±РѕС‚Сѓ СЃ СЃРёРіРЅР°Р»Р°РјРё.",
      items: [
        ["Р’С‹Р±РёСЂР°Р№ Core", "РќСѓР¶РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»РёРЅР° Р¶СѓСЂРЅР°Р»Р° Рё Р±Р°Р·РѕРІС‹Р№ AI review."],
        ["Р’С‹Р±РёСЂР°Р№ Edge", "РўС‹ Р°РєС‚РёРІРЅРѕ С‚РѕСЂРіСѓРµС€СЊ Рё С…РѕС‡РµС€СЊ AI Scanner Рё Р±РѕР»РµРµ РіР»СѓР±РѕРєРёР№ Р°РЅР°Р»РёР·."],
        ["Р’С‹Р±РёСЂР°Р№ Elite", "РќСѓР¶РµРЅ РїРѕР»РЅС‹Р№ signal workflow: AI Alerts, Signal-to-Journal Рё outcome learning."],
      ],
    },
  };
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
  const pricing = t.pricing ?? t.pricingPage ?? t.plansPage ?? {};
const [billing, setBilling] = useState<BillingPeriod>("monthly");
const copy = getPricingShowcaseCopy(t.lang);

const fallbackPricing = {
  eyebrow:
    t.lang === "EN"
      ? "Plans"
      : t.lang === "UA"
        ? "РўР°СЂРёС„Рё"
        : "РўР°СЂРёС„С‹",
  title:
    t.lang === "EN"
      ? "Choose your SkillEdge AI access level."
      : t.lang === "UA"
        ? "РћР±РµСЂРё СЃРІС–Р№ СЂС–РІРµРЅСЊ РґРѕСЃС‚СѓРїСѓ РґРѕ SkillEdge AI."
        : "Р’С‹Р±РµСЂРё СЃРІРѕР№ СѓСЂРѕРІРµРЅСЊ РґРѕСЃС‚СѓРїР° Рє SkillEdge AI.",
  text:
    t.lang === "EN"
      ? "Start with journal discipline, upgrade into market intelligence, or unlock the full AI Trading Desk."
      : t.lang === "UA"
        ? "РџРѕС‡РЅРё Р· РґРёСЃС†РёРїР»С–РЅРё Р¶СѓСЂРЅР°Р»Сѓ, СЂРѕР·С€РёСЂ РґРѕСЃС‚СѓРї РґРѕ СЂРёРЅРєРѕРІРѕС— СЂРѕР·РІС–РґРєРё Р°Р±Рѕ РІС–РґРєСЂРёР№ РїРѕРІРЅРёР№ AI Trading Desk."
        : "РќР°С‡РЅРё СЃ РґРёСЃС†РёРїР»РёРЅС‹ Р¶СѓСЂРЅР°Р»Р°, СЂР°СЃС€РёСЂСЊ РґРѕСЃС‚СѓРї Рє СЂС‹РЅРѕС‡РЅРѕР№ СЂР°Р·РІРµРґРєРµ РёР»Рё РѕС‚РєСЂРѕР№ РїРѕР»РЅС‹Р№ AI Trading Desk.",
  month:
    t.lang === "EN"
      ? "/ month"
      : t.lang === "UA"
        ? "/ РјС–СЃСЏС†СЊ"
        : "/ РјРµСЃСЏС†",
  most:
    t.lang === "EN"
      ? "Most powerful"
      : t.lang === "UA"
        ? "РњР°РєСЃРёРјР°Р»СЊРЅРёР№"
        : "РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№",
  buy:
    t.lang === "EN"
      ? "Choose plan"
      : t.lang === "UA"
        ? "РћР±СЂР°С‚Рё С‚Р°СЂРёС„"
        : "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
  compareEyebrow:
    t.lang === "EN"
      ? "Comparison"
      : t.lang === "UA"
        ? "РџРѕСЂС–РІРЅСЏРЅРЅСЏ"
        : "РЎСЂР°РІРЅРµРЅРёРµ",
  compareTitle:
    t.lang === "EN"
      ? "Compare access by workflow depth."
      : t.lang === "UA"
        ? "РџРѕСЂС–РІРЅСЏР№ РґРѕСЃС‚СѓРї Р·Р° РіР»РёР±РёРЅРѕСЋ СЂРѕР±РѕС‡РѕРіРѕ РїСЂРѕС†РµСЃСѓ."
        : "РЎСЂР°РІРЅРё РґРѕСЃС‚СѓРї РїРѕ РіР»СѓР±РёРЅРµ СЂР°Р±РѕС‡РµРіРѕ РїСЂРѕС†РµСЃСЃР°.",
  compareText:
    t.lang === "EN"
      ? "Core gives structure. Edge adds market intelligence. Elite unlocks the full signal workflow."
      : t.lang === "UA"
        ? "Core РґР°С” СЃС‚СЂСѓРєС‚СѓСЂСѓ. Edge РґРѕРґР°С” market intelligence. Elite РІС–РґРєСЂРёРІР°С” РїРѕРІРЅРёР№ signal workflow."
        : "Core РґР°С‘С‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ. Edge РґРѕР±Р°РІР»СЏРµС‚ market intelligence. Elite РѕС‚РєСЂС‹РІР°РµС‚ РїРѕР»РЅС‹Р№ signal workflow.",
  plans: [
    [
      "core",
      "SkillEdge Core",
      "$49",
      t.lang === "EN"
        ? "Clean journal, screenshots, AI Coach and basic review."
        : t.lang === "UA"
          ? "Р–СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё, AI Coach С– Р±Р°Р·РѕРІРёР№ review."
          : "Р–СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹, AI Coach Рё Р±Р°Р·РѕРІС‹Р№ review.",
      ["Journal", "Screenshots", "AI Coach", "Basic reports"],
    ],
    [
      "pro",
      "SkillEdge Edge",
      "$99",
      t.lang === "EN"
        ? "For active traders who need scanner intelligence and deeper analysis."
        : t.lang === "UA"
          ? "Р”Р»СЏ Р°РєС‚РёРІРЅРёС… С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– scanner intelligence С– РіР»РёР±С€РёР№ Р°РЅР°Р»С–Р·."
          : "Р”Р»СЏ Р°РєС‚РёРІРЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ scanner intelligence Рё Р±РѕР»РµРµ РіР»СѓР±РѕРєРёР№ Р°РЅР°Р»РёР·.",
      ["Everything in Core", "Market Intelligence", "AI Scanner", "Advanced reports"],
    ],
    [
      "elite",
      "SkillEdge Elite",
      "$149",
      t.lang === "EN"
        ? "Full AI Trading Desk: alerts, signal workflow and outcome tracking."
        : t.lang === "UA"
          ? "РџРѕРІРЅРёР№ AI Trading Desk: alerts, signal workflow С– outcome tracking."
          : "РџРѕР»РЅС‹Р№ AI Trading Desk: alerts, signal workflow Рё outcome tracking.",
      ["Everything in Edge", "AI Alerts", "Floating alerts widget", "Signal-to-Journal", "Outcome tracking"],
    ],
  ],
  planComparison: [
    ["Journal", "вњ“", "вњ“", "вњ“"],
    ["AI Coach", "Basic", "Advanced", "Elite"],
    ["Market Intelligence", "вЂ”", "вњ“", "вњ“"],
    ["AI Scanner", "вЂ”", "вњ“", "вњ“"],
    ["AI Alerts", "вЂ”", "вЂ”", "вњ“"],
    ["Signal-to-Journal", "вЂ”", "вЂ”", "вњ“"],
    ["Outcome tracking", "вЂ”", "вЂ”", "вњ“"],
  ],
};

const pricingData = {
  ...fallbackPricing,
  ...pricing,
  plans: Array.isArray(pricing.plans) ? pricing.plans : fallbackPricing.plans,
  planComparison: Array.isArray(pricing.planComparison)
    ? pricing.planComparison
    : fallbackPricing.planComparison,
};

  const plans = pricing.plans.map((plan: any[]) => {
    const id = plan[0] ?? "";
    const name = plan[1] ?? "";
    const price = plan[2] ?? "";
    const text = plan[3] ?? "";
    const features = Array.isArray(plan[4]) ? plan[4] : [];

    const meta =
      id === "elite"
        ? copy.meta.elite
        : id === "pro"
          ? copy.meta.edge
          : copy.meta.core;

    return {
      id,
      name,
      price,
      text,
      features,
      meta,
      isElite: id === "elite",
      isEdge: id === "pro",
    };
  });

  const billingOptions: Array<{ key: BillingPeriod; label: string; note: string }> =
    [
      { key: "monthly", label: copy.billing.monthly, note: copy.billing.monthlyNote },
      { key: "halfyear", label: copy.billing.halfyear, note: copy.billing.halfyearNote },
      { key: "yearly", label: copy.billing.yearly, note: copy.billing.yearlyNote },
    ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-[1600px] space-y-16 px-4 pb-28 pt-10 sm:px-6 lg:px-8 xl:px-10"
    >
      <section className="relative overflow-hidden rounded-[3.2rem] border border-white/10 bg-[#06111d]/88 p-6 shadow-[0_45px_180px_rgba(8,47,73,0.32)] backdrop-blur-2xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:62px_62px] opacity-30" />

        <div className="relative grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <Badge>{pricing.eyebrow}</Badge>

            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.06em] text-white md:text-6xl xl:text-7xl">
              {pricing.title}
            </h1>

            <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/68 md:text-lg">
              {pricing.text}
            </p>

            <div className="mt-8 grid gap-3 rounded-[2rem] border border-white/10 bg-black/24 p-3 backdrop-blur-xl sm:grid-cols-3">
              {billingOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setBilling(option.key)}
                  className={`rounded-[1.35rem] border px-4 py-4 text-left transition duration-300 ${
                    billing === option.key
                      ? "border-cyan-200/35 bg-cyan-200/[0.12] shadow-[0_0_40px_rgba(34,211,238,0.14)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-sm font-black text-white">{option.label}</div>
                  <div className="mt-1 text-[11px] font-semibold leading-5 text-white/45">
                    {option.note}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <PricingEliteSpotlight
            copy={copy}
            plan={plans.find((plan: any) => plan.id === "elite") || plans[2]}
            billing={billing}
            handleCheckout={handleCheckout}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan: any, index: number) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: plan.isElite ? 8 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: index * 0.07, duration: 0.45 }}
            whileHover={{ y: -8 }}
            className={`relative overflow-hidden rounded-[2.5rem] border p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-300 md:p-7 ${
              plan.isElite
                ? "border-cyan-200/28 bg-cyan-200/[0.085] lg:-mt-8"
                : plan.isEdge
                  ? "border-emerald-200/16 bg-emerald-200/[0.055]"
                  : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.10),transparent_30%)]" />

            {plan.isElite ? (
              <div className="absolute right-5 top-5 rounded-full border border-cyan-200/25 bg-cyan-200/[0.12] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50">
                {pricing.most}
              </div>
            ) : null}

            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/50">
                {plan.meta.label}
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-[-0.045em] text-white">
                {plan.name}
              </h2>

              <p className="mt-4 min-h-[72px] text-sm font-semibold leading-7 text-white/58">
                {plan.text}
              </p>

              <div className="mt-7 flex items-end gap-2">
                <span className="text-5xl font-black tracking-[-0.06em] text-white">
                  {plan.price}
                </span>
                <span className="pb-2 text-sm font-bold text-white/45">
                  {pricing.month}
                </span>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  {copy.bestFor}
                </div>
                <div className="mt-2 text-sm font-black leading-6 text-white">
                  {plan.meta.bestFor}
                </div>
              </div>

              <div className="mt-6 grid gap-2">
                {plan.features.slice(0, 7).map((feature: string) => (
                  <div
                    key={feature}
                    className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-bold leading-5 text-white/58"
                  >
                    вњ“ {feature}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleCheckout(plan.id, billing)}
                className={`mt-7 w-full rounded-2xl px-5 py-4 text-sm font-black transition duration-300 hover:-translate-y-0.5 ${
                  plan.isElite
                    ? "bg-white text-[#06111d] shadow-[0_20px_80px_rgba(255,255,255,0.2)] hover:shadow-[0_24px_90px_rgba(34,211,238,0.25)]"
                    : "border border-white/12 bg-white/[0.055] text-white hover:border-cyan-200/30 hover:bg-cyan-200/[0.09]"
                }`}
              >
                {pricing.buy}
                <span className="ml-2">в†’</span>
              </button>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-[2.8rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_34px_140px_rgba(0,0,0,0.24)] backdrop-blur-xl md:p-8 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.13),transparent_32%)]" />

        <div className="relative">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge>{pricing.compareEyebrow}</Badge>
              <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
                {pricing.compareTitle}
              </h2>
            </div>

            <p className="max-w-xl text-sm font-semibold leading-7 text-white/58">
              {pricing.compareText}
            </p>
          </div>

          <div className="mt-9 overflow-hidden rounded-[2rem] border border-white/10">
            <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] bg-white/[0.065] px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-white/50">
              <div>{copy.matrix.feature}</div>
              <div>Core</div>
              <div>Edge</div>
              <div>Elite</div>
            </div>

            {pricing.planComparison.map((row: string[], rowIndex: number) => {
              const feature = row[0] ?? "";
              const core = row[1] ?? "";
              const edge = row[2] ?? "";
              const elite = row[3] ?? "";

              return (
                <motion.div
                  key={`${feature}-${rowIndex}`}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: rowIndex * 0.035, duration: 0.35 }}
                  className="grid grid-cols-1 border-t border-white/10 md:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr]"
                >
                  <div className="bg-white/[0.035] p-4 text-sm font-black text-white">
                    {feature}
                  </div>
                  {[core, edge, elite].map((cell, index) => (
                    <div
                      key={`${feature}-${index}`}
                      className={`border-t border-white/10 p-4 text-sm font-semibold leading-6 text-white/58 md:border-l md:border-t-0 ${
                        index === 2 ? "bg-cyan-200/[0.045] text-white/72" : ""
                      }`}
                    >
                      {cell}
                    </div>
                  ))}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-[2.6rem] border border-emerald-200/14 bg-emerald-200/[0.055] p-6 shadow-[0_34px_140px_rgba(6,78,59,0.22)] backdrop-blur-xl md:p-8"
        >
          <Badge>{copy.recommendation.eyebrow}</Badge>

          <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
            {copy.recommendation.title}
          </h2>

          <p className="mt-5 text-sm font-semibold leading-7 text-white/62">
            {copy.recommendation.text}
          </p>
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
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.07] text-xs font-black text-cyan-50">
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
        </div>
      </section>
    </motion.div>
  );
}

function PricingEliteSpotlight({
  copy,
  plan,
  billing,
  handleCheckout,
}: {
  copy: any;
  plan: any;
  billing: BillingPeriod;
  handleCheckout: (planId: string, billing: BillingPeriod) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.6 }}
      className="relative"
    >
      <div className="absolute -inset-10 rounded-[3rem] bg-cyan-300/12 blur-3xl" />

      <div className="relative overflow-hidden rounded-[2.5rem] border border-cyan-200/20 bg-cyan-200/[0.075] p-5 shadow-[0_40px_150px_rgba(8,47,73,0.35)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_0%,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.15),transparent_30%)]" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-50/55">
              {copy.spotlight.eyebrow}
            </div>

            <div className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[10px] font-black text-white/70">
              {plan?.price || "$149"}
            </div>
          </div>

          <h2 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.055em] text-white md:text-5xl">
            {copy.spotlight.title}
          </h2>

          <p className="mt-5 text-sm font-semibold leading-7 text-white/62">
            {copy.spotlight.text}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {copy.spotlight.bullets.map((item: string) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-black text-white"
              >
                вњ“ {item}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleCheckout(plan?.id || "elite", billing)}
            className="mt-7 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#06111d] shadow-[0_22px_90px_rgba(255,255,255,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_26px_100px_rgba(34,211,238,0.3)]"
          >
            {plan?.name || "SkillEdge Elite"}
            <span className="ml-2">в†’</span>
          </button>
        </div>
      </div>
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
  const lang: Language =
    t.lang === "RU" ? "ru" : t.lang === "UA" ? "ua" : "en";

  const copy = {
    en: {
      badge: "About SkillEdge AI",
      title:
        "We build trading software for traders who want structure, not noise.",
      text:
        "SkillEdge AI was created around a simple belief: a trader becomes stronger when every trade, screenshot, decision and mistake turns into clear feedback.",
      productButton: "Explore product",
      pricingButton: "View plans",
      panelEyebrow: "Our approach",
      panelTitle: "One loop: market в†’ decision в†’ journal в†’ review",
      panelItems: [
        "Market opportunities should be filtered, not chased blindly.",
        "Every serious trade needs a plan before the entry.",
        "A journal becomes powerful only when it creates feedback.",
        "AI should explain the logic, risk and lesson вЂ” not replace thinking.",
      ],
      missionEyebrow: "Mission",
      missionTitle: "Help traders build a repeatable process.",
      missionText:
        "We are not building a hype signal room. SkillEdge AI is designed as a premium workspace where a trader can find opportunities, prepare a plan, track execution, review outcomes and slowly build a personal edge from real data.",
      values: [
        {
          title: "Process over prediction",
          text:
            "No promise of guaranteed profit. The focus is structure, risk, discipline and better decision quality.",
        },
        {
          title: "Feedback over memory",
          text:
            "Screenshots, trades and outcomes should become lessons вЂ” not forgotten files scattered across folders.",
        },
        {
          title: "Clarity over noise",
          text:
            "The product should make the trader calmer, sharper and more prepared before making decisions.",
        },
      ],
      teamEyebrow: "Team",
      teamTitle: "Built by traders, product builders and AI operators.",
      teamText:
        "SkillEdge AI is being built as a focused premium SaaS product. The public team section is intentionally simple for launch вЂ” photos, names and roles can be added as the company structure is finalized.",
      teamCards: [
        ["Founder / Product Vision", "Trading workflow, product strategy and trader development."],
        ["AI & Data Layer", "Market intelligence, AI review logic, alerts and automation."],
        ["Design & Client Experience", "Premium interface, onboarding, support and user clarity."],
      ],
      trustEyebrow: "Trust",
      trustTitle: "Serious trading tools must stay honest.",
      trustText:
        "SkillEdge AI is not financial advice and does not guarantee profits. The goal is to improve process, review, discipline and decision quality.",
      ctaTitle: "Ready to see how SkillEdge works?",
      ctaText:
        "Explore the product or choose the plan that matches your trading process.",
    },

    ru: {
      badge: "Рћ SkillEdge AI",
      title:
        "РњС‹ СЃРѕР·РґР°С‘Рј С‚РѕСЂРіРѕРІС‹Р№ СЃРѕС„С‚ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°, Р° РЅРµ С€СѓРј.",
      text:
        "SkillEdge AI РїРѕСЏРІРёР»СЃСЏ РІРѕРєСЂСѓРі РїСЂРѕСЃС‚РѕР№ РёРґРµРё: С‚СЂРµР№РґРµСЂ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЃРёР»СЊРЅРµРµ, РєРѕРіРґР° РєР°Р¶РґР°СЏ СЃРґРµР»РєР°, СЃРєСЂРёРЅС€РѕС‚, СЂРµС€РµРЅРёРµ Рё РѕС€РёР±РєР° РїСЂРµРІСЂР°С‰Р°СЋС‚СЃСЏ РІ РїРѕРЅСЏС‚РЅСѓСЋ РѕР±СЂР°С‚РЅСѓСЋ СЃРІСЏР·СЊ.",
      productButton: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ РїСЂРѕРґСѓРєС‚",
      pricingButton: "РџРѕСЃРјРѕС‚СЂРµС‚СЊ С‚Р°СЂРёС„С‹",
      panelEyebrow: "РќР°С€ РїРѕРґС…РѕРґ",
      panelTitle: "РћРґРёРЅ С†РёРєР»: СЂС‹РЅРѕРє в†’ СЂРµС€РµРЅРёРµ в†’ Р¶СѓСЂРЅР°Р» в†’ СЂР°Р·Р±РѕСЂ",
      panelItems: [
        "Р С‹РЅРѕС‡РЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё РЅСѓР¶РЅРѕ С„РёР»СЊС‚СЂРѕРІР°С‚СЊ, Р° РЅРµ СЃР»РµРїРѕ РґРѕРіРѕРЅСЏС‚СЊ.",
        "РЈ РєР°Р¶РґРѕР№ СЃРµСЂСЊС‘Р·РЅРѕР№ СЃРґРµР»РєРё РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїР»Р°РЅ РґРѕ РІС…РѕРґР°.",
        "Р–СѓСЂРЅР°Р» СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЃРёР»СЊРЅС‹Рј С‚РѕР»СЊРєРѕ С‚РѕРіРґР°, РєРѕРіРґР° РґР°С‘С‚ РѕР±СЂР°С‚РЅСѓСЋ СЃРІСЏР·СЊ.",
        "AI РґРѕР»Р¶РµРЅ РѕР±СЉСЏСЃРЅСЏС‚СЊ Р»РѕРіРёРєСѓ, СЂРёСЃРє Рё СѓСЂРѕРє вЂ” Р° РЅРµ Р·Р°РјРµРЅСЏС‚СЊ РјС‹С€Р»РµРЅРёРµ.",
      ],
      missionEyebrow: "РњРёСЃСЃРёСЏ",
      missionTitle: "РџРѕРјРѕС‡СЊ С‚СЂРµР№РґРµСЂР°Рј РїРѕСЃС‚СЂРѕРёС‚СЊ РїРѕРІС‚РѕСЂСЏРµРјС‹Р№ РїСЂРѕС†РµСЃСЃ.",
      missionText:
        "РњС‹ РЅРµ СЃС‚СЂРѕРёРј С…Р°Р№РїРѕРІСѓСЋ РєРѕРјРЅР°С‚Сѓ СЃРёРіРЅР°Р»РѕРІ. SkillEdge AI СЃРѕР·РґР°С‘С‚СЃСЏ РєР°Рє premium workspace, РіРґРµ С‚СЂРµР№РґРµСЂ РЅР°С…РѕРґРёС‚ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё, РіРѕС‚РѕРІРёС‚ РїР»Р°РЅ, РѕС‚СЃР»РµР¶РёРІР°РµС‚ РёСЃРїРѕР»РЅРµРЅРёРµ, СЂР°Р·Р±РёСЂР°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ Рё РїРѕСЃС‚РµРїРµРЅРЅРѕ СЃС‚СЂРѕРёС‚ Р»РёС‡РЅРѕРµ РїСЂРµРёРјСѓС‰РµСЃС‚РІРѕ РЅР° СЂРµР°Р»СЊРЅС‹С… РґР°РЅРЅС‹С….",
      values: [
        {
          title: "РџСЂРѕС†РµСЃСЃ РІР°Р¶РЅРµРµ РїСЂРµРґСЃРєР°Р·Р°РЅРёР№",
          text:
            "РќРёРєР°РєРёС… РѕР±РµС‰Р°РЅРёР№ РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅРЅРѕР№ РїСЂРёР±С‹Р»Рё. Р¤РѕРєСѓСЃ вЂ” СЃС‚СЂСѓРєС‚СѓСЂР°, СЂРёСЃРє, РґРёСЃС†РёРїР»РёРЅР° Рё РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№.",
        },
        {
          title: "РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ РІР°Р¶РЅРµРµ РїР°РјСЏС‚Рё",
          text:
            "РЎРєСЂРёРЅС€РѕС‚С‹, СЃРґРµР»РєРё Рё СЂРµР·СѓР»СЊС‚Р°С‚С‹ РґРѕР»Р¶РЅС‹ СЃС‚Р°РЅРѕРІРёС‚СЊСЃСЏ СѓСЂРѕРєР°РјРё, Р° РЅРµ Р·Р°Р±С‹С‚С‹РјРё С„Р°Р№Р»Р°РјРё РІ СЂР°Р·РЅС‹С… РїР°РїРєР°С….",
        },
        {
          title: "РЇСЃРЅРѕСЃС‚СЊ РІР°Р¶РЅРµРµ С€СѓРјР°",
          text:
            "РџСЂРѕРґСѓРєС‚ РґРѕР»Р¶РµРЅ РґРµР»Р°С‚СЊ С‚СЂРµР№РґРµСЂР° СЃРїРѕРєРѕР№РЅРµРµ, С‚РѕС‡РЅРµРµ Рё Р»СѓС‡С€Рµ РїРѕРґРіРѕС‚РѕРІР»РµРЅРЅС‹Рј Рє СЂРµС€РµРЅРёСЏРј.",
        },
      ],
      teamEyebrow: "РљРѕРјР°РЅРґР°",
      teamTitle: "РЎРѕР·РґР°С‘С‚СЃСЏ С‚СЂРµР№РґРµСЂР°РјРё, РїСЂРѕРґСѓРєС‚РѕРІРѕР№ РєРѕРјР°РЅРґРѕР№ Рё AI-РѕРїРµСЂР°С‚РѕСЂР°РјРё.",
      teamText:
        "SkillEdge AI СЃС‚СЂРѕРёС‚СЃСЏ РєР°Рє СЃС„РѕРєСѓСЃРёСЂРѕРІР°РЅРЅС‹Р№ premium SaaS-РїСЂРѕРґСѓРєС‚. РџСѓР±Р»РёС‡РЅС‹Р№ Р±Р»РѕРє РєРѕРјР°РЅРґС‹ РЅР° Р·Р°РїСѓСЃРєРµ РЅР°РјРµСЂРµРЅРЅРѕ РїСЂРѕСЃС‚РѕР№ вЂ” С„РѕС‚Рѕ, РёРјРµРЅР° Рё СЂРѕР»Рё РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ РїРѕСЃР»Рµ С„РёРЅР°Р»РёР·Р°С†РёРё СЃС‚СЂСѓРєС‚СѓСЂС‹ РєРѕРјРїР°РЅРёРё.",
      teamCards: [
        ["Founder / Product Vision", "РўРѕСЂРіРѕРІС‹Р№ workflow, СЃС‚СЂР°С‚РµРіРёСЏ РїСЂРѕРґСѓРєС‚Р° Рё СЂР°Р·РІРёС‚РёРµ С‚СЂРµР№РґРµСЂР°."],
        ["AI & Data Layer", "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°, AI-СЂР°Р·Р±РѕСЂ, Р»РѕРіРёРєР° СЃРёРіРЅР°Р»РѕРІ Рё Р°РІС‚РѕРјР°С‚РёР·Р°С†РёСЏ."],
        ["Design & Client Experience", "Premium-РёРЅС‚РµСЂС„РµР№СЃ, onboarding, РїРѕРґРґРµСЂР¶РєР° Рё РїРѕРЅСЏС‚РЅРѕСЃС‚СЊ РїСЂРѕРґСѓРєС‚Р°."],
      ],
      trustEyebrow: "Р”РѕРІРµСЂРёРµ",
      trustTitle: "РЎРµСЂСЊС‘Р·РЅС‹Рµ С‚РѕСЂРіРѕРІС‹Рµ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹ РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ С‡РµСЃС‚РЅС‹РјРё.",
      trustText:
        "SkillEdge AI РЅРµ СЏРІР»СЏРµС‚СЃСЏ С„РёРЅР°РЅСЃРѕРІРѕР№ СЂРµРєРѕРјРµРЅРґР°С†РёРµР№ Рё РЅРµ РіР°СЂР°РЅС‚РёСЂСѓРµС‚ РїСЂРёР±С‹Р»СЊ. Р¦РµР»СЊ РїСЂРѕРґСѓРєС‚Р° вЂ” СѓР»СѓС‡С€РёС‚СЊ РїСЂРѕС†РµСЃСЃ, СЂР°Р·Р±РѕСЂ, РґРёСЃС†РёРїР»РёРЅСѓ Рё РєР°С‡РµСЃС‚РІРѕ СЂРµС€РµРЅРёР№.",
      ctaTitle: "Р“РѕС‚РѕРІ РїРѕСЃРјРѕС‚СЂРµС‚СЊ, РєР°Рє СЂР°Р±РѕС‚Р°РµС‚ SkillEdge?",
      ctaText:
        "РР·СѓС‡Рё РїСЂРѕРґСѓРєС‚ РёР»Рё РІС‹Р±РµСЂРё С‚Р°СЂРёС„ РїРѕРґ СЃРІРѕР№ С‚РѕСЂРіРѕРІС‹Р№ РїСЂРѕС†РµСЃСЃ.",
    },

    ua: {
      badge: "РџСЂРѕ SkillEdge AI",
      title:
        "РњРё СЃС‚РІРѕСЂСЋС”РјРѕ С‚РѕСЂРіРѕРІРёР№ СЃРѕС„С‚ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅР° СЃС‚СЂСѓРєС‚СѓСЂР°, Р° РЅРµ С€СѓРј.",
      text:
        "SkillEdge AI Р·КјСЏРІРёРІСЃСЏ РЅР°РІРєРѕР»Рѕ РїСЂРѕСЃС‚РѕС— С–РґРµС—: С‚СЂРµР№РґРµСЂ СЃС‚Р°С” СЃРёР»СЊРЅС–С€РёРј, РєРѕР»Рё РєРѕР¶РЅР° СѓРіРѕРґР°, СЃРєСЂС–РЅС€РѕС‚, СЂС–С€РµРЅРЅСЏ С‚Р° РїРѕРјРёР»РєР° РїРµСЂРµС‚РІРѕСЂСЋСЋС‚СЊСЃСЏ РЅР° Р·СЂРѕР·СѓРјС–Р»РёР№ Р·РІРѕСЂРѕС‚РЅРёР№ Р·РІКјСЏР·РѕРє.",
      productButton: "РџРѕРґРёРІРёС‚РёСЃСЏ РїСЂРѕРґСѓРєС‚",
      pricingButton: "РџРѕРґРёРІРёС‚РёСЃСЏ С‚Р°СЂРёС„Рё",
      panelEyebrow: "РќР°С€ РїС–РґС…С–Рґ",
      panelTitle: "РћРґРёРЅ С†РёРєР»: СЂРёРЅРѕРє в†’ СЂС–С€РµРЅРЅСЏ в†’ Р¶СѓСЂРЅР°Р» в†’ СЂРѕР·Р±С–СЂ",
      panelItems: [
        "Р РёРЅРєРѕРІС– РјРѕР¶Р»РёРІРѕСЃС‚С– РїРѕС‚СЂС–Р±РЅРѕ С„С–Р»СЊС‚СЂСѓРІР°С‚Рё, Р° РЅРµ СЃР»С–РїРѕ РЅР°Р·РґРѕРіР°РЅСЏС‚Рё.",
        "РЈ РєРѕР¶РЅРѕС— СЃРµСЂР№РѕР·РЅРѕС— СѓРіРѕРґРё РјР°С” Р±СѓС‚Рё РїР»Р°РЅ РґРѕ РІС…РѕРґСѓ.",
        "Р–СѓСЂРЅР°Р» СЃС‚Р°С” СЃРёР»СЊРЅРёРј Р»РёС€Рµ С‚РѕРґС–, РєРѕР»Рё РґР°С” Р·РІРѕСЂРѕС‚РЅРёР№ Р·РІКјСЏР·РѕРє.",
        "AI РјР°С” РїРѕСЏСЃРЅСЋРІР°С‚Рё Р»РѕРіС–РєСѓ, СЂРёР·РёРє С– СѓСЂРѕРє вЂ” Р° РЅРµ Р·Р°РјС–РЅСЋРІР°С‚Рё РјРёСЃР»РµРЅРЅСЏ.",
      ],
      missionEyebrow: "РњС–СЃС–СЏ",
      missionTitle: "Р”РѕРїРѕРјРѕРіС‚Рё С‚СЂРµР№РґРµСЂР°Рј РїРѕР±СѓРґСѓРІР°С‚Рё РїРѕРІС‚РѕСЂСЋРІР°РЅРёР№ РїСЂРѕС†РµСЃ.",
      missionText:
        "РњРё РЅРµ СЃС‚РІРѕСЂСЋС”РјРѕ С…Р°Р№РїРѕРІСѓ РєС–РјРЅР°С‚Сѓ СЃРёРіРЅР°Р»С–РІ. SkillEdge AI Р±СѓРґСѓС”С‚СЊСЃСЏ СЏРє premium workspace, РґРµ С‚СЂРµР№РґРµСЂ Р·РЅР°С…РѕРґРёС‚СЊ РјРѕР¶Р»РёРІРѕСЃС‚С–, РіРѕС‚СѓС” РїР»Р°РЅ, РІС–РґСЃС‚РµР¶СѓС” РІРёРєРѕРЅР°РЅРЅСЏ, СЂРѕР·Р±РёСЂР°С” СЂРµР·СѓР»СЊС‚Р°С‚ С– РїРѕСЃС‚СѓРїРѕРІРѕ Р±СѓРґСѓС” РІР»Р°СЃРЅСѓ РїРµСЂРµРІР°РіСѓ РЅР° СЂРµР°Р»СЊРЅРёС… РґР°РЅРёС….",
      values: [
        {
          title: "РџСЂРѕС†РµСЃ РІР°Р¶Р»РёРІС–С€РёР№ Р·Р° РїРµСЂРµРґР±Р°С‡РµРЅРЅСЏ",
          text:
            "Р–РѕРґРЅРёС… РѕР±С–С†СЏРЅРѕРє РіР°СЂР°РЅС‚РѕРІР°РЅРѕРіРѕ РїСЂРёР±СѓС‚РєСѓ. Р¤РѕРєСѓСЃ вЂ” СЃС‚СЂСѓРєС‚СѓСЂР°, СЂРёР·РёРє, РґРёСЃС†РёРїР»С–РЅР° С‚Р° СЏРєС–СЃС‚СЊ СЂС–С€РµРЅСЊ.",
        },
        {
          title: "Р—РІРѕСЂРѕС‚РЅРёР№ Р·РІКјСЏР·РѕРє РІР°Р¶Р»РёРІС–С€РёР№ Р·Р° РїР°РјКјСЏС‚СЊ",
          text:
            "РЎРєСЂС–РЅС€РѕС‚Рё, СѓРіРѕРґРё С‚Р° СЂРµР·СѓР»СЊС‚Р°С‚Рё РјР°СЋС‚СЊ СЃС‚Р°РІР°С‚Рё СѓСЂРѕРєР°РјРё, Р° РЅРµ Р·Р°Р±СѓС‚РёРјРё С„Р°Р№Р»Р°РјРё РІ СЂС–Р·РЅРёС… РїР°РїРєР°С….",
        },
        {
          title: "РЇСЃРЅС–СЃС‚СЊ РІР°Р¶Р»РёРІС–С€Р° Р·Р° С€СѓРј",
          text:
            "РџСЂРѕРґСѓРєС‚ РјР°С” СЂРѕР±РёС‚Рё С‚СЂРµР№РґРµСЂР° СЃРїРѕРєС–Р№РЅС–С€РёРј, С‚РѕС‡РЅС–С€РёРј С– РєСЂР°С‰Рµ РїС–РґРіРѕС‚РѕРІР»РµРЅРёРј РґРѕ СЂС–С€РµРЅСЊ.",
        },
      ],
      teamEyebrow: "РљРѕРјР°РЅРґР°",
      teamTitle: "РЎС‚РІРѕСЂСЋС”С‚СЊСЃСЏ С‚СЂРµР№РґРµСЂР°РјРё, РїСЂРѕРґСѓРєС‚РѕРІРѕСЋ РєРѕРјР°РЅРґРѕСЋ С‚Р° AI-РѕРїРµСЂР°С‚РѕСЂР°РјРё.",
      teamText:
        "SkillEdge AI Р±СѓРґСѓС”С‚СЊСЃСЏ СЏРє СЃС„РѕРєСѓСЃРѕРІР°РЅРёР№ premium SaaS-РїСЂРѕРґСѓРєС‚. РџСѓР±Р»С–С‡РЅРёР№ Р±Р»РѕРє РєРѕРјР°РЅРґРё РЅР° Р·Р°РїСѓСЃРєСѓ РЅР°РІРјРёСЃРЅРѕ РїСЂРѕСЃС‚РёР№ вЂ” С„РѕС‚Рѕ, С–РјРµРЅР° С‚Р° СЂРѕР»С– РјРѕР¶РЅР° РґРѕРґР°С‚Рё РїС–СЃР»СЏ С„С–РЅР°Р»С–Р·Р°С†С–С— СЃС‚СЂСѓРєС‚СѓСЂРё РєРѕРјРїР°РЅС–С—.",
      teamCards: [
        ["Founder / Product Vision", "РўРѕСЂРіРѕРІРёР№ workflow, СЃС‚СЂР°С‚РµРіС–СЏ РїСЂРѕРґСѓРєС‚Сѓ С‚Р° СЂРѕР·РІРёС‚РѕРє С‚СЂРµР№РґРµСЂР°."],
        ["AI & Data Layer", "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°, AI-СЂРѕР·Р±С–СЂ, Р»РѕРіС–РєР° СЃРёРіРЅР°Р»С–РІ С‚Р° Р°РІС‚РѕРјР°С‚РёР·Р°С†С–СЏ."],
        ["Design & Client Experience", "Premium-С–РЅС‚РµСЂС„РµР№СЃ, onboarding, РїС–РґС‚СЂРёРјРєР° С‚Р° Р·СЂРѕР·СѓРјС–Р»С–СЃС‚СЊ РїСЂРѕРґСѓРєС‚Сѓ."],
      ],
      trustEyebrow: "Р”РѕРІС–СЂР°",
      trustTitle: "РЎРµСЂР№РѕР·РЅС– С‚РѕСЂРіРѕРІС– С–РЅСЃС‚СЂСѓРјРµРЅС‚Рё РјР°СЋС‚СЊ Р±СѓС‚Рё С‡РµСЃРЅРёРјРё.",
      trustText:
        "SkillEdge AI РЅРµ С” С„С–РЅР°РЅСЃРѕРІРѕСЋ СЂРµРєРѕРјРµРЅРґР°С†С–С”СЋ С‚Р° РЅРµ РіР°СЂР°РЅС‚СѓС” РїСЂРёР±СѓС‚РѕРє. РњРµС‚Р° РїСЂРѕРґСѓРєС‚Сѓ вЂ” РїРѕРєСЂР°С‰РёС‚Рё РїСЂРѕС†РµСЃ, СЂРѕР·Р±С–СЂ, РґРёСЃС†РёРїР»С–РЅСѓ С‚Р° СЏРєС–СЃС‚СЊ СЂС–С€РµРЅСЊ.",
      ctaTitle: "Р“РѕС‚РѕРІРёР№ РїРѕРґРёРІРёС‚РёСЃСЏ, СЏРє РїСЂР°С†СЋС” SkillEdge?",
      ctaText:
        "Р’РёРІС‡Рё РїСЂРѕРґСѓРєС‚ Р°Р±Рѕ РѕР±РµСЂРё С‚Р°СЂРёС„ РїС–Рґ СЃРІС–Р№ С‚РѕСЂРіРѕРІРёР№ РїСЂРѕС†РµСЃ.",
    },
  }[lang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35 }}
      className="space-y-16 pt-8"
    >
      <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <Badge>{copy.badge}</Badge>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl"
            >
              {copy.title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg"
            >
              {copy.text}
            </motion.p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonX onClick={() => setActive("product")}>
                {copy.productButton}
                <span className="ml-2">в†’</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => setActive("pricing")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {copy.pricingButton}
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
                  {copy.panelEyebrow}
                </div>

                <div className="mt-2 text-2xl font-semibold text-white">
                  {copy.panelTitle}
                </div>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
                <Icon name="brain" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {copy.panelItems.map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/65"
                >
                  <Icon name="check" className="text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow={copy.missionEyebrow}
          title={copy.missionTitle}
          text={copy.missionText}
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {copy.values.map((item) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
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
        <SectionTitle
          eyebrow={copy.teamEyebrow}
          title={copy.teamTitle}
          text={copy.teamText}
        />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {copy.teamCards.map(([role, text]) => (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20"
            >
              <div className="flex aspect-[4/3] items-center justify-center border-b border-white/10 bg-gradient-to-br from-cyan-500/15 via-indigo-500/10 to-white/[0.03]">
                <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/40">
                  Photo
                </div>
              </div>

              <div className="p-6">
                <div className="text-xl font-semibold text-white">{role}</div>
                <p className="mt-3 text-sm leading-7 text-white/60">{text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-cyan-500/15 via-white/[0.04] to-indigo-500/10 p-6 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.24em] text-white/45">
              {copy.trustEyebrow}
            </div>

            <h2 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-5xl">
              {copy.trustTitle}
            </h2>

            <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">
              {copy.trustText}
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
            <div className="text-lg font-semibold text-white">
              {copy.ctaTitle}
            </div>

            <p className="mt-3 text-sm leading-7 text-white/58">
              {copy.ctaText}
            </p>

            <div className="mt-6 grid gap-3">
              <ButtonX onClick={() => setActive("product")} className="w-full">
                {copy.productButton}
                <span className="ml-2">в†’</span>
              </ButtonX>

              <button
                type="button"
                onClick={() => setActive("pricing")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {copy.pricingButton}
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
      rights: "В© 2026 SkillEdge AI. All rights reserved.",
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
        { label: "Contact Support", href: "/about" },
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
      productColumn: "РџСЂРѕРґСѓРєС‚",
      featuresColumn: "Р¤СѓРЅРєС†РёРё",
      resourcesColumn: "Р РµСЃСѓСЂСЃС‹",
      legalColumn: "Р”РѕРєСѓРјРµРЅС‚С‹",
      description:
        "РџСЂРµРјРёР°Р»СЊРЅРѕРµ AI-РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ РґР»СЏ СЃРµСЂСЊС‘Р·РЅС‹С… С‚СЂРµР№РґРµСЂРѕРІ: СЂС‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°, AI-СЃРёРіРЅР°Р»С‹, Р¶СѓСЂРЅР°Р», СЂР°Р·Р±РѕСЂ РёСЃРїРѕР»РЅРµРЅРёСЏ, РїР»РµР№Р±СѓРє, РѕС‚С‡С‘С‚С‹ Рё РєРѕСѓС‡РёРЅРі РІ РѕРґРЅРѕР№ СЃРёСЃС‚РµРјРµ.",
      choosePlan: "Р’С‹Р±СЂР°С‚СЊ С‚Р°СЂРёС„",
      requestDemo: "Р—Р°РїСЂРѕСЃРёС‚СЊ РґРµРјРѕ",
      cookieSettings: "РќР°СЃС‚СЂРѕР№РєРё cookies",
      contact: "РљРѕРЅС‚Р°РєС‚С‹",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Р”РµРјРѕ РїСЂРѕРґСѓРєС‚Р° РїРѕ Р·Р°РїСЂРѕСЃСѓ",
      rights: "В© 2026 SkillEdge AI. Р’СЃРµ РїСЂР°РІР° Р·Р°С‰РёС‰РµРЅС‹.",
      bottomNote:
        "РЎРѕР·РґР°РЅРѕ РґР»СЏ С‚СЂРµР№РґРµСЂРѕРІ, РєРѕС‚РѕСЂС‹Рј РЅСѓР¶РЅС‹ СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»РёРЅР° Рё РёР·РјРµСЂРёРјС‹Р№ РїСЂРѕРіСЂРµСЃСЃ.",
      disclaimer:
        "SkillEdge AI РЅРµ СЏРІР»СЏРµС‚СЃСЏ С„РёРЅР°РЅСЃРѕРІРѕР№ СЂРµРєРѕРјРµРЅРґР°С†РёРµР№ Рё РЅРµ РіР°СЂР°РЅС‚РёСЂСѓРµС‚ РїСЂРёР±С‹Р»СЊ. РџР»Р°С‚С„РѕСЂРјР° СЃРѕР·РґР°РЅР° РґР»СЏ СѓР»СѓС‡С€РµРЅРёСЏ СЃС‚СЂСѓРєС‚СѓСЂС‹, СЂР°Р·Р±РѕСЂР°, РєР°С‡РµСЃС‚РІР° СЂРµС€РµРЅРёР№ Рё С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСЃР°.",
      productLinks: [
        { label: "Р“Р»Р°РІРЅР°СЏ", href: "/" },
        { label: "РџСЂРѕРґСѓРєС‚", href: "/product" },
        { label: "РўР°СЂРёС„С‹", href: "/pricing" },
        { label: "Рћ РЅР°СЃ", href: "/about" },
      ],
      featureLinks: [
        { label: "AI Trading Desk", href: "/product" },
        { label: "AI-СЃРёРіРЅР°Р»С‹", href: "/product" },
        { label: "Р С‹РЅРѕС‡РЅР°СЏ СЂР°Р·РІРµРґРєР°", href: "/product" },
        { label: "Р–СѓСЂРЅР°Р» Рё СЃРєСЂРёРЅС€РѕС‚С‹", href: "/product" },
        { label: "РљРѕСѓС‡ РёСЃРїРѕР»РЅРµРЅРёСЏ", href: "/product" },
        { label: "РћР±СѓС‡РµРЅРёРµ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…", href: "/product" },
        { label: "РџР»РµР№Р±СѓРє", href: "/product" },
        { label: "РћС‚С‡С‘С‚С‹", href: "/product" },
        { label: "Р¦РµРЅС‚СЂ РѕР±СѓС‡РµРЅРёСЏ", href: "/product" },
        { label: "РџРѕРјРѕС‰РЅРёРє РїРѕРґРґРµСЂР¶РєРё", href: "/product" },
      ],
      resourceLinks: [
        { label: "РќР°С‡Р°Р»Рѕ СЂР°Р±РѕС‚С‹", href: "/product" },
        { label: "РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ SkillEdge", href: "/product" },
        { label: "Р“Р°Р№Рґ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СЃРґРµР»РѕРє", href: "/product" },
        { label: "Р“Р°Р№Рґ РїРѕ AI-СЃРёРіРЅР°Р»Р°Рј", href: "/product" },
        { label: "РЎРІСЏР·Р°С‚СЊСЃСЏ СЃ РїРѕРґРґРµСЂР¶РєРѕР№", href: "/about" },
      ],
      legalLinks: [
        { label: "РџРѕР»РёС‚РёРєР° РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚Рё", href: "/legal/privacy-policy" },
        { label: "РЈСЃР»РѕРІРёСЏ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ", href: "/legal/terms" },
        { label: "Р”РёСЃРєР»РµР№РјРµСЂ", href: "/legal/disclaimer" },
        { label: "Р›РёС†РµРЅР·РёРѕРЅРЅРѕРµ СЃРѕРіР»Р°С€РµРЅРёРµ", href: "/legal/eula" },
        { label: "РћРїР»Р°С‚Р° Рё РѕС‚РјРµРЅР°", href: "/legal/billing" },
        { label: "РџРѕР»РёС‚РёРєР° cookies", href: "/legal/cookies" },
      ],
    },

    ua: {
      productColumn: "РџСЂРѕРґСѓРєС‚",
      featuresColumn: "Р¤СѓРЅРєС†С–С—",
      resourcesColumn: "Р РµСЃСѓСЂСЃРё",
      legalColumn: "Р”РѕРєСѓРјРµРЅС‚Рё",
      description:
        "РџСЂРµРјС–Р°Р»СЊРЅРёР№ AI-РїСЂРѕСЃС‚С–СЂ РґР»СЏ СЃРµСЂР№РѕР·РЅРёС… С‚СЂРµР№РґРµСЂС–РІ: СЂРёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°, AI-СЃРёРіРЅР°Р»Рё, Р¶СѓСЂРЅР°Р», СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ, РїР»РµР№Р±СѓРє, Р·РІС–С‚Рё С‚Р° РєРѕСѓС‡РёРЅРі РІ РѕРґРЅС–Р№ СЃРёСЃС‚РµРјС–.",
      choosePlan: "РћР±СЂР°С‚Рё С‚Р°СЂРёС„",
      requestDemo: "Р—Р°РїСЂРѕСЃРёС‚Рё РґРµРјРѕ",
      cookieSettings: "РќР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ cookies",
      contact: "РљРѕРЅС‚Р°РєС‚Рё",
      location: "Dubai / Warsaw / Kyiv",
      demo: "Р”РµРјРѕ РїСЂРѕРґСѓРєС‚Сѓ Р·Р° Р·Р°РїРёС‚РѕРј",
      rights: "В© 2026 SkillEdge AI. РЈСЃС– РїСЂР°РІР° Р·Р°С…РёС‰РµРЅС–.",
      bottomNote:
        "РЎС‚РІРѕСЂРµРЅРѕ РґР»СЏ С‚СЂРµР№РґРµСЂС–РІ, СЏРєРёРј РїРѕС‚СЂС–Р±РЅС– СЃС‚СЂСѓРєС‚СѓСЂР°, РґРёСЃС†РёРїР»С–РЅР° С‚Р° РІРёРјС–СЂСЋРІР°РЅРёР№ РїСЂРѕРіСЂРµСЃ.",
      disclaimer:
        "SkillEdge AI РЅРµ С” С„С–РЅР°РЅСЃРѕРІРѕСЋ СЂРµРєРѕРјРµРЅРґР°С†С–С”СЋ С‚Р° РЅРµ РіР°СЂР°РЅС‚СѓС” РїСЂРёР±СѓС‚РѕРє. РџР»Р°С‚С„РѕСЂРјР° СЃС‚РІРѕСЂРµРЅР° РґР»СЏ РїРѕРєСЂР°С‰РµРЅРЅСЏ СЃС‚СЂСѓРєС‚СѓСЂРё, СЂРѕР·Р±РѕСЂСѓ, СЏРєРѕСЃС‚С– СЂС–С€РµРЅСЊ С– С‚РѕСЂРіРѕРІРѕРіРѕ РїСЂРѕС†РµСЃСѓ.",
      productLinks: [
        { label: "Р“РѕР»РѕРІРЅР°", href: "/" },
        { label: "РџСЂРѕРґСѓРєС‚", href: "/product" },
        { label: "РўР°СЂРёС„Рё", href: "/pricing" },
        { label: "РџСЂРѕ РЅР°СЃ", href: "/about" },
      ],
      featureLinks: [
        { label: "AI Trading Desk", href: "/product" },
        { label: "AI-СЃРёРіРЅР°Р»Рё", href: "/product" },
        { label: "Р РёРЅРєРѕРІР° СЂРѕР·РІС–РґРєР°", href: "/product" },
        { label: "Р–СѓСЂРЅР°Р» С– СЃРєСЂС–РЅС€РѕС‚Рё", href: "/product" },
        { label: "РљРѕСѓС‡ РІРёРєРѕРЅР°РЅРЅСЏ", href: "/product" },
        { label: "РќР°РІС‡Р°РЅРЅСЏ РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°С…", href: "/product" },
        { label: "РџР»РµР№Р±СѓРє", href: "/product" },
        { label: "Р—РІС–С‚Рё", href: "/product" },
        { label: "Р¦РµРЅС‚СЂ РЅР°РІС‡Р°РЅРЅСЏ", href: "/product" },
        { label: "РџРѕРјС–С‡РЅРёРє РїС–РґС‚СЂРёРјРєРё", href: "/product" },
      ],
      resourceLinks: [
        { label: "РџРѕС‡Р°С‚РѕРє СЂРѕР±РѕС‚Рё", href: "/product" },
        { label: "РЇРє РїСЂР°С†СЋС” SkillEdge", href: "/product" },
        { label: "Р“Р°Р№Рґ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ СѓРіРѕРґ", href: "/product" },
        { label: "Р“Р°Р№Рґ РїРѕ AI-СЃРёРіРЅР°Р»Р°С…", href: "/product" },
        { label: "Р—РІКјСЏР·Р°С‚РёСЃСЏ Р· РїС–РґС‚СЂРёРјРєРѕСЋ", href: "/about" },
      ],
      legalLinks: [
        { label: "РџРѕР»С–С‚РёРєР° РєРѕРЅС„С–РґРµРЅС†С–Р№РЅРѕСЃС‚С–", href: "/legal/privacy-policy" },
        { label: "РЈРјРѕРІРё РІРёРєРѕСЂРёСЃС‚Р°РЅРЅСЏ", href: "/legal/terms" },
        { label: "Р”РёСЃРєР»РµР№РјРµСЂ", href: "/legal/disclaimer" },
        { label: "Р›С–С†РµРЅР·С–Р№РЅР° СѓРіРѕРґР°", href: "/legal/eula" },
        { label: "РћРїР»Р°С‚Р° С‚Р° СЃРєР°СЃСѓРІР°РЅРЅСЏ", href: "/legal/billing" },
        { label: "РџРѕР»С–С‚РёРєР° cookies", href: "/legal/cookies" },
      ],
    },
  }[language];

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
              {copy.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonX onClick={() => setActive("pricing")}>
                {copy.choosePlan}
                <span className="ml-2">в†’</span>
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

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title={copy.productColumn} links={copy.productLinks} />
            <FooterColumn title={copy.featuresColumn} links={copy.featureLinks} />
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
                  className="block text-left text-sm text-cyan-100/70 transition hover:text-cyan-100"
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

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
        {title}
      </div>

      <div className="mt-4 space-y-3">
        {links.map((item) => (
          <Link
            key={`${title}-${item.label}`}
            href={item.href}
            className="block text-left text-sm text-white/58 transition hover:text-white"
          >
            {item.label}
          </Link>
        ))}
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
            <div className="absolute -left-20 -top-20 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

            <button onClick={closeAuthModal} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/10 hover:text-white" aria-label={authLabels.close}>
              Г—
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
    <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 md:p-10">
      <Glow />
      <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <Badge>{badge}</Badge>
          <h1 className="mt-7 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 md:text-lg">{text}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonX onClick={onPrimary}>{primary}<span className="ml-2">в†’</span></ButtonX>
            <button onClick={onSecondary} className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">{secondary}</button>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.45 }} className="relative rounded-[2.25rem] border border-cyan-300/15 bg-[#0b1220]/90 p-5 shadow-[0_24px_110px_rgba(0,0,0,0.55)]">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/45">SkillEdge AI</div>
              <div className="mt-2 text-xl font-semibold text-white">Trading workflow</div>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">Live</div>
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
      <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight md:text-5xl">{title}</h2>
      {text ? <p className="mt-5 max-w-3xl text-base leading-8 text-white/65">{text}</p> : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-full border border-indigo-300/20 bg-indigo-300/10 px-4 py-1 text-xs uppercase tracking-[0.22em] text-indigo-100">вњ§ {children}</div>;
}

function CardBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 ${className}`}>{children}</div>;
}

function ButtonX({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return <button onClick={onClick} className={`inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:scale-[1.02] ${className}`}>{children}</button>;
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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">{step}</div>
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
            <Icon name="check" className="text-emerald-300" />
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
      <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4 text-sm leading-6 text-emerald-50/72">{strong}</div>
    </motion.div>
  );
}

function FinalCta({ title, text, checklist, button, onClick }: { title: string; text: string; checklist: string[]; button: string; onClick: () => void }) {
  return (
    <section className="overflow-hidden rounded-[2.75rem] border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.04] to-cyan-500/10 p-6 md:p-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div>
          <h2 className="text-4xl font-semibold leading-tight text-white md:text-5xl">{title}</h2>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">{text}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-black/25 p-5">
          <div className="mt-1 space-y-3">
            {checklist.map((item) => (
              <div key={item} className="flex gap-3 text-sm text-white/70">
                <Icon name="check" className="text-cyan-300" />
                {item}
              </div>
            ))}
          </div>
          <ButtonX onClick={onClick} className="mt-6 w-full">{button}<span className="ml-2">в†’</span></ButtonX>
        </div>
      </div>
    </section>
  );
}

function getHomeProblemCards(t: any) {
  if (t.lang === "EN") {
    return [
      ["Market noise", "Too many tickers, alerts, chats, screenshots and opinions. The trader needs a filter, not another feed."],
      ["Late entries", "The move is already extended, RR is gone, and the trader still feels pressure to click."],
      ["No execution feedback", "Trades are saved somewhere, but nobody explains whether the entry, stop, target and management were clean."],
      ["No repeatable playbook", "Profitable trades happen, but the trader does not turn them into a system that can be repeated."],
    ];
  }

  if (t.lang === "UA") {
    return [
      ["Р РёРЅРєРѕРІРёР№ С€СѓРј", "Р—Р°Р±Р°РіР°С‚Рѕ С‚С–РєРµСЂС–РІ, СЃРёРіРЅР°Р»С–РІ, С‡Р°С‚С–РІ, СЃРєСЂС–РЅС€РѕС‚С–РІ С– РґСѓРјРѕРє. РўСЂРµР№РґРµСЂСѓ РїРѕС‚СЂС–Р±РµРЅ С„С–Р»СЊС‚СЂ, Р° РЅРµ С‰Рµ РѕРґРЅР° СЃС‚СЂС–С‡РєР°."],
      ["РџС–Р·РЅС–Р№ РІС…С–Рґ", "Р СѓС… СѓР¶Рµ СЂРѕР·С‚СЏРіРЅСѓС‚РёР№, RR Р·РЅРёРє, Р°Р»Рµ С‚СЂРµР№РґРµСЂ СѓСЃРµ С‰Рµ РІС–РґС‡СѓРІР°С” С‚РёСЃРє РЅР°С‚РёСЃРЅСѓС‚Рё РєРЅРѕРїРєСѓ."],
      ["РќРµРјР°С” СЂРѕР·Р±РѕСЂСѓ РІРёРєРѕРЅР°РЅРЅСЏ", "РЈРіРѕРґРё РґРµСЃСЊ Р·Р±РµСЂРµР¶РµРЅС–, Р°Р»Рµ РЅС–С…С‚Рѕ РЅРµ РїРѕСЏСЃРЅСЋС”, С‡Рё Р±СѓР»Рё С‡РёСЃС‚РёРјРё entry, stop, target С– management."],
      ["РќРµРјР°С” РїРѕРІС‚РѕСЂСЋРІР°РЅРѕРіРѕ playbook", "РџСЂРёР±СѓС‚РєРѕРІС– СѓРіРѕРґРё С‚СЂР°РїР»СЏСЋС‚СЊСЃСЏ, Р°Р»Рµ С‚СЂРµР№РґРµСЂ РЅРµ РїРµСЂРµС‚РІРѕСЂСЋС” С—С… РЅР° СЃРёСЃС‚РµРјСѓ, СЏРєСѓ РјРѕР¶РЅР° РїРѕРІС‚РѕСЂСЋРІР°С‚Рё."],
    ];
  }

  return [
    ["Р С‹РЅРѕС‡РЅС‹Р№ С€СѓРј", "РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ С‚РёРєРµСЂРѕРІ, СЃРёРіРЅР°Р»РѕРІ, С‡Р°С‚РѕРІ, СЃРєСЂРёРЅС€РѕС‚РѕРІ Рё РјРЅРµРЅРёР№. РўСЂРµР№РґРµСЂСѓ РЅСѓР¶РµРЅ С„РёР»СЊС‚СЂ, Р° РЅРµ РµС‰С‘ РѕРґРЅР° Р»РµРЅС‚Р°."],
    ["РџРѕР·РґРЅРёР№ РІС…РѕРґ", "Р”РІРёР¶РµРЅРёРµ СѓР¶Рµ СЂР°СЃС‚СЏРЅСѓС‚Рѕ, RR РёСЃС‡РµР·, РЅРѕ С‚СЂРµР№РґРµСЂ РІСЃС‘ РµС‰С‘ С‡СѓРІСЃС‚РІСѓРµС‚ РґР°РІР»РµРЅРёРµ РЅР°Р¶Р°С‚СЊ РєРЅРѕРїРєСѓ."],
    ["РќРµС‚ СЂР°Р·Р±РѕСЂР° РёСЃРїРѕР»РЅРµРЅРёСЏ", "РЎРґРµР»РєРё РіРґРµ-С‚Рѕ СЃРѕС…СЂР°РЅРµРЅС‹, РЅРѕ РЅРёРєС‚Рѕ РЅРµ РѕР±СЉСЏСЃРЅСЏРµС‚, Р±С‹Р» Р»Рё С‡РёСЃС‚С‹Рј entry, stop, target Рё management."],
    ["РќРµС‚ РїРѕРІС‚РѕСЂСЏРµРјРѕРіРѕ playbook", "РџСЂРёР±С‹Р»СЊРЅС‹Рµ СЃРґРµР»РєРё СЃР»СѓС‡Р°СЋС‚СЃСЏ, РЅРѕ С‚СЂРµР№РґРµСЂ РЅРµ РїСЂРµРІСЂР°С‰Р°РµС‚ РёС… РІ СЃРёСЃС‚РµРјСѓ, РєРѕС‚РѕСЂСѓСЋ РјРѕР¶РЅРѕ РїРѕРІС‚РѕСЂСЏС‚СЊ."],
  ];
}

function getHeroDeskCopy(t: any) {
  if (t.lang === "EN") {
    return {
      badge: "AI Trading Desk for serious traders",
      title:
        "Trade with a desk behind you вЂ” scanner, alerts, journal and execution review in one system.",
      text:
        "SkillEdge AI is built around the real trading loop: find in-play stocks and crypto, understand the setup, define trigger/stop/targets, journal the trade and review the outcome without noise or blind signals.",
      chips: [
        "Market scanner",
        "Setup-based alerts",
        "Journal review",
        "Risk-first coaching",
      ],
      stats: [
        ["Scan", "active stocks, crypto, catalysts and unusual movement"],
        ["Plan", "setup, trigger, entry zone, stop, targets and invalidation"],
        ["Review", "journal, screenshots, reports and execution feedback"],
      ],
      visual: {
        eyebrow: "LIVE DESK",
        status: "Market open",
        mainTitle: "AI Trading Desk",
        signal: "AI setup detected",
        symbol: "PSIX",
        direction: "Watch only",
        score: "82",
        setup: "VWAP reclaim / continuation",
        trigger: "Wait for reclaim + hold",
        risk: "No chase. Entry must stay close to invalidation.",
        journal: "Journal review",
        journalText: "Late entry risk reduced В· RR filter active",
        scan: "Market scan",
        scanText: "Stocks В· Crypto В· News В· Social В· Volume",
        coach: "Execution coach",
        coachText: "Plan before entry. Review after outcome.",
      },
    };
  }

  if (t.lang === "UA") {
    return {
      badge: "AI Trading Desk РґР»СЏ С‚СЂРµР№РґРµСЂР°",
      title:
        "РўРѕСЂРіСѓР№ С–Р· desk-СЃРёСЃС‚РµРјРѕСЋ Р·Р° СЃРїРёРЅРѕСЋ: СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»Рё, Р¶СѓСЂРЅР°Р» С– СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ РІ РѕРґРЅРѕРјСѓ РїСЂРѕРґСѓРєС‚С–.",
      text:
        "SkillEdge AI РїРѕР±СѓРґРѕРІР°РЅРёР№ РЅР°РІРєРѕР»Рѕ СЂРµР°Р»СЊРЅРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ С†РёРєР»Сѓ: Р·РЅР°Р№С‚Рё Р°РєС‚РёРІРЅС– Р°РєС†С–С— С‚Р° РєСЂРёРїС‚Сѓ, Р·СЂРѕР·СѓРјС–С‚Рё СЃРµС‚Р°Рї, РІРёР·РЅР°С‡РёС‚Рё trigger/stop/targets, Р·Р°РїРёСЃР°С‚Рё СѓРіРѕРґСѓ РІ Р¶СѓСЂРЅР°Р» С– СЂРѕР·С–Р±СЂР°С‚Рё СЂРµР·СѓР»СЊС‚Р°С‚ Р±РµР· С€СѓРјСѓ С‚Р° СЃР»С–РїРёС… СЃРёРіРЅР°Р»С–РІ.",
      chips: [
        "Market scanner",
        "РЎРёРіРЅР°Р»Рё Р·Р° СЃРµС‚Р°РїР°РјРё",
        "Р–СѓСЂРЅР°Р» СѓРіРѕРґ",
        "Risk-first РєРѕСѓС‡РёРЅРі",
      ],
      stats: [
        ["Scan", "Р°РєС‚РёРІРЅС– Р°РєС†С–С—, РєСЂРёРїС‚Р°, РєР°С‚Р°Р»С–Р·Р°С‚РѕСЂРё С‚Р° РЅРµР·РІРёС‡РЅРёР№ СЂСѓС…"],
        ["Plan", "СЃРµС‚Р°Рї, С‚СЂРёРіРµСЂ, Р·РѕРЅР° РІС…РѕРґСѓ, СЃС‚РѕРї, С†С–Р»С– С‚Р° СЃРєР°СЃСѓРІР°РЅРЅСЏ С–РґРµС—"],
        ["Review", "Р¶СѓСЂРЅР°Р», СЃРєСЂС–РЅС€РѕС‚Рё, Р·РІС–С‚Рё С‚Р° СЂРѕР·Р±С–СЂ РІРёРєРѕРЅР°РЅРЅСЏ"],
      ],
      visual: {
        eyebrow: "LIVE DESK",
        status: "Р РёРЅРѕРє Р°РєС‚РёРІРЅРёР№",
        mainTitle: "AI Trading Desk",
        signal: "AI-СЃРµС‚Р°Рї Р·РЅР°Р№РґРµРЅРѕ",
        symbol: "PSIX",
        direction: "Watch only",
        score: "82",
        setup: "VWAP reclaim / continuation",
        trigger: "Р§РµРєР°С‚Рё reclaim + hold",
        risk: "No chase. Р’С…С–Рґ РјР°С” Р±СѓС‚Рё Р±Р»РёР·СЊРєРѕ РґРѕ invalidation.",
        journal: "Р РѕР·Р±С–СЂ Р¶СѓСЂРЅР°Р»Сѓ",
        journalText: "Р РёР·РёРє РїС–Р·РЅСЊРѕРіРѕ РІС…РѕРґСѓ Р·РЅРёР¶РµРЅРѕ В· RR-С„С–Р»СЊС‚СЂ Р°РєС‚РёРІРЅРёР№",
        scan: "Market scan",
        scanText: "РђРєС†С–С— В· РљСЂРёРїС‚Р° В· РќРѕРІРёРЅРё В· Social В· Volume",
        coach: "Execution coach",
        coachText: "РџР»Р°РЅ РґРѕ РІС…РѕРґСѓ. Р РѕР·Р±С–СЂ РїС–СЃР»СЏ СЂРµР·СѓР»СЊС‚Р°С‚Сѓ.",
      },
    };
  }

  return {
    badge: "AI Trading Desk РґР»СЏ С‚СЂРµР№РґРµСЂР°",
    title:
      "РўРѕСЂРіСѓР№ РЅРµ РїРѕ С€СѓРјСѓ, Р° РїРѕ СЃС‚СЂСѓРєС‚СѓСЂРµ: СЃРєР°РЅРµСЂ, СЃРёРіРЅР°Р»С‹, Р¶СѓСЂРЅР°Р» Рё СЂР°Р·Р±РѕСЂ РёСЃРїРѕР»РЅРµРЅРёСЏ РІ РѕРґРЅРѕРј trading desk.",
    text:
      "SkillEdge AI РїРѕСЃС‚СЂРѕРµРЅ РІРѕРєСЂСѓРі СЂРµР°Р»СЊРЅРѕРіРѕ С‚РѕСЂРіРѕРІРѕРіРѕ С†РёРєР»Р°: РЅР°Р№С‚Рё in-play Р°РєС†РёРё Рё РєСЂРёРїС‚Сѓ, РїРѕРЅСЏС‚СЊ СЃРµС‚Р°Рї, РѕРїСЂРµРґРµР»РёС‚СЊ trigger/stop/targets, Р·Р°РїРёСЃР°С‚СЊ СЃРґРµР»РєСѓ РІ Р¶СѓСЂРЅР°Р» Рё СЂР°Р·РѕР±СЂР°С‚СЊ РёСЃС…РѕРґ Р±РµР· С€СѓРјР° Рё СЃР»РµРїС‹С… СЃРёРіРЅР°Р»РѕРІ.",
    chips: [
      "Market scanner",
      "РЎРёРіРЅР°Р»С‹ РїРѕ СЃРµС‚Р°РїР°Рј",
      "Р–СѓСЂРЅР°Р» СЃРґРµР»РѕРє",
      "Risk-first РєРѕСѓС‡РёРЅРі",
    ],
    stats: [
      ["Scan", "Р°РєС‚РёРІРЅС‹Рµ Р°РєС†РёРё, РєСЂРёРїС‚Р°, РєР°С‚Р°Р»РёР·Р°С‚РѕСЂС‹ Рё РЅРµРѕР±С‹С‡РЅРѕРµ РґРІРёР¶РµРЅРёРµ"],
      ["Plan", "СЃРµС‚Р°Рї, С‚СЂРёРіРіРµСЂ, Р·РѕРЅР° РІС…РѕРґР°, СЃС‚РѕРї, С†РµР»Рё Рё РѕС‚РјРµРЅР° РёРґРµРё"],
      ["Review", "Р¶СѓСЂРЅР°Р», СЃРєСЂРёРЅС€РѕС‚С‹, РѕС‚С‡С‘С‚С‹ Рё СЂР°Р·Р±РѕСЂ РёСЃРїРѕР»РЅРµРЅРёСЏ"],
    ],
    visual: {
      eyebrow: "LIVE DESK",
      status: "Р С‹РЅРѕРє Р°РєС‚РёРІРµРЅ",
      mainTitle: "AI Trading Desk",
      signal: "AI-СЃРµС‚Р°Рї РЅР°Р№РґРµРЅ",
      symbol: "PSIX",
      direction: "Watch only",
      score: "82",
      setup: "VWAP reclaim / continuation",
      trigger: "Р–РґР°С‚СЊ reclaim + hold",
      risk: "No chase. Р’С…РѕРґ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЂСЏРґРѕРј СЃ invalidation.",
      journal: "Р Р°Р·Р±РѕСЂ Р¶СѓСЂРЅР°Р»Р°",
      journalText: "Р РёСЃРє РїРѕР·РґРЅРµРіРѕ РІС…РѕРґР° СЃРЅРёР¶РµРЅ В· RR-С„РёР»СЊС‚СЂ Р°РєС‚РёРІРµРЅ",
      scan: "Market scan",
      scanText: "РђРєС†РёРё В· РљСЂРёРїС‚Р° В· РќРѕРІРѕСЃС‚Рё В· Social В· Volume",
      coach: "Execution coach",
      coachText: "РџР»Р°РЅ РґРѕ РІС…РѕРґР°. Р Р°Р·Р±РѕСЂ РїРѕСЃР»Рµ РёСЃС…РѕРґР°.",
    },
  };
}

function PremiumHeroDeskVisual({ copy }: { copy: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.6 }}
      className="relative z-10"
    >
      <div className="absolute -inset-8 rounded-[3rem] bg-cyan-300/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[2.2rem] border border-white/12 bg-[#071522]/72 p-4 shadow-[0_40px_150px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_90%_15%,rgba(16,185,129,0.13),transparent_30%)]" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-50/50">
            {copy.eyebrow}
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-[10px] font-black text-emerald-100/80">
            {copy.status}
          </div>
        </div>

        <div className="relative z-10 mt-4 rounded-[1.5rem] border border-white/10 bg-black/22 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-white/38">SkillEdge AI</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white">
                {copy.mainTitle}
              </div>
            </div>

            <motion.div
              animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.04, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-full border border-cyan-200/25 bg-cyan-200/[0.08] px-3 py-1 text-[10px] font-black text-cyan-50"
            >
              Live
            </motion.div>
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.045] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/45">
                  {copy.signal}
                </div>
                <div className="mt-2 text-3xl font-black text-white">{copy.symbol}</div>
              </div>

              <div className="text-right">
                <div className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-[10px] font-black text-amber-100/80">
                  {copy.direction}
                </div>
                <div className="mt-2 text-sm font-black text-white/70">
                  Score {copy.score}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-white/10 bg-black/24 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                  Setup
                </div>
                <div className="mt-1 text-sm font-bold text-white/80">{copy.setup}</div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/24 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                    Trigger
                  </div>
                  <div className="mt-1 text-sm font-bold text-white/78">
                    {copy.trigger}
                  </div>
                </div>

                <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/45">
                    Risk
                  </div>
                  <div className="mt-1 text-sm font-bold text-rose-50/78">
                    {copy.risk}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              [copy.scan, copy.scanText],
              [copy.journal, copy.journalText],
              [copy.coach, copy.coachText],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"
              >
                <div className="text-sm font-black text-white">{title}</div>
                <div className="mt-2 text-[11px] font-semibold leading-5 text-white/45">
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

function HeroVisual({ t }: { t: any }) {
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
            <div className="text-sm text-white/45">{t.productPage.flowEyebrow}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-2xl font-semibold">AI Trading Desk</div>
              <div className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">Process</div>
            </div>
            <div className="mt-5 h-28 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/20 p-4">
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
      <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute left-1/2 top-12 h-48 w-48 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
    </>
  );
}

function getPlanClasses(accent: "core" | "edge" | "elite") {
  if (accent === "edge") {
    return "border-indigo-300/45 bg-gradient-to-b from-indigo-500/20 via-white/[0.05] to-white/[0.025] shadow-[0_24px_100px_rgba(79,70,229,0.2)]";
  }

  if (accent === "elite") {
    return "border-cyan-300/45 bg-gradient-to-b from-cyan-500/20 via-white/[0.055] to-white/[0.025] shadow-[0_24px_120px_rgba(34,211,238,0.22)]";
  }

  return "border-white/10 bg-white/[0.035]";
}

function getBadgeClasses(accent: "core" | "edge" | "elite") {
  if (accent === "edge") {
    return "border-indigo-300/25 bg-indigo-300/10 text-indigo-100";
  }

  if (accent === "elite") {
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  }

  return "border-white/10 bg-white/[0.05] text-white/65";
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    brain: "вњ¦",
    globe: "в—Њ",
    menu: "в°",
    close: "Г—",
    check: "вњ“",
    money: "$",
  };

  return <span className={`inline-flex ${className}`}>{icons[name] || "вЂў"}</span>;
}


