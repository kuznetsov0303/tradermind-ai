# SkillEdge AI Landing Localization Style Guide

## Purpose

This guide defines the production localization standard for the SkillEdge AI / UpYourSkills landing experience.

## Voice

- Professional, confident and precise.
- Premium financial SaaS tone.
- Clear to active traders without sounding academic.
- Avoid hype, slang, exaggerated certainty and literal machine-translation phrasing.
- Never promise profits, guaranteed results or risk-free trading.

## Meaning before wording

Translate the intended product meaning, not isolated dictionary definitions.

Examples:

- A lifecycle status named Watch means a setup is being monitored. It never means the action “look at”.
- Armed means that entry conditions are nearly ready or awaiting confirmation. Do not use military wording.
- Edge remains unchanged inside official product and plan names.
- Official trading setup/playbook names remain in English.

## Protected content

Preserve exactly:

- SkillEdge AI
- SkillEdge Core
- SkillEdge Edge
- SkillEdge Elite
- AI Trading Desk
- AI Alerts
- AI Coach
- AI Scanner
- AI Market Brief
- Market Intelligence
- Signal-to-Journal
- Personal Edge
- Strategy OS
- TradingView
- VWAP, EMA20, RVOL, PnL, TP1, TP2, RR
- CSV, XLSX, USDT, TRC20
- Official setup/playbook names

## Product claims

Allowed:

- Describes analysis, filtering, workflow, context, decision support and risk controls.
- States what the software does or helps the user do.

Not allowed:

- Guaranteed profits.
- Guaranteed win rate.
- “Always finds the best trade.”
- “Risk-free.”
- Any wording implying certainty of market outcomes.

## Formatting integrity

Preserve:

- Placeholders such as {count}, {symbol} and %s.
- Prices, currency symbols and billing periods.
- Numeric values.
- HTML entities and intentional punctuation.
- Brand capitalization.

## Locale quality

A valid JSON file is not evidence of a good translation.

Every production locale requires:

1. Context-aware draft.
2. Independent editorial review.
3. Deterministic validation.
4. Visual QA on desktop, tablet and mobile.
5. Targeted human review for suspicious or high-impact strings.

## Pilot locales

The first production pilot is:

- ru
- uk
- de
- ar
- zh

Only after the pilot passes linguistic and visual QA should the remaining locales be rebuilt.
