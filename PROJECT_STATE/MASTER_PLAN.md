# SkillEdge AI - Master Production Plan

Updated: 2026-07-15T20:32:18+03:00

## Final product objective

Build and launch a premium, fully automated intraday trading-intelligence SaaS. The launch target is not a temporary MVP.

The final product must:
- ingest real-time US-equities market events continuously;
- scan the market automatically;
- maintain live per-symbol market state;
- generate deterministic strategy candidates;
- validate data quality, context, risk and execution feasibility;
- create client signals only from production-qualified strategy versions;
- manage signal lifecycle in real time;
- maintain honest paper/client-equivalent accountability;
- persist signal, trade, strategy, experiment and AI-research lineage;
- run automatic after-close replay, failure analysis, strategy research and setup discovery;
- test new variants on historical, holdout, walk-forward and forward-shadow evidence;
- prepare approved strategy snapshots for the next session;
- notify Telegram only that a new website signal is available, including time and direct link;
- provide a complete premium frontend with working functionality and production-quality localization;
- self-start, self-monitor, recover from normal failures, back up critical state and support rollback.

## Frozen production architecture

Databento US Equities / EQUS.MINI:
- primary real-time market truth;
- target schema: MBP-1;
- target universe: ALL_SYMBOLS where entitlement and runtime capacity permit;
- used for live trades, BBO/top-of-book state, spread, live lifecycle and derived candles.

FMP Premium:
- retained for fundamentals, profiles, news/catalyst enrichment, reference data and the existing historical-learning pipeline;
- FMP Ultimate is not part of the target stack.

Runtime flow:
Databento -> Market Stream Ingestor -> Normalized MarketEvent -> Market State Engine -> Market-wide Scanner -> Dynamic In-Play Universe -> Strategy Engine -> Confirmation / Signal Blocker / Failure Pattern Intelligence -> Adaptive expectancy / payoff / risk gate -> AI Validator for selected candidates only -> Production-qualified signal -> Website / Telegram notification / client-equivalent paper -> Real-Time Trade Lifecycle -> Immutable outcome and lineage.

Research flow:
Session Day N -> persist signals, rejects, outcomes, MFE/MAE and context -> ingest Day N -> replay 5Y + Day N -> statistics -> failure analysis -> pattern discovery -> AI hypotheses -> new setup/strategy/management variants -> historical replay -> holdout/OOS -> walk-forward -> forward shadow -> production eligibility -> admin approval -> approved Day N+1 strategy snapshot.

## Client strategy policy

Client eligibility requires:
- verified closed-outcome win rate >= 45%;
- positive realized expectancy after conservative execution assumptions;
- acceptable profit factor;
- acceptable drawdown;
- sufficient sample;
- OOS/holdout pass;
- walk-forward pass;
- forward-shadow pass;
- current regime not showing severe decay;
- data-quality pass;
- conservative execution-model pass.

Adaptive extension objective:
- WR 45.0-49.9%: >= 3.0R;
- WR 50.0-54.9%: >= 2.5R;
- WR 55.0-59.9%: >= 2.25R;
- WR 60.0-64.9%: >= 2.0R;
- WR 65.0-69.9%: >= 1.8R;
- WR 70.0-79.9%: >= 1.5R;
- WR >= 80%: >= 1.25R.

Final production eligibility uses realized average win R, realized average loss R, expectancy and profit factor. A distant target alone does not prove payoff quality.

## Dynamic exits

No universal fixed 2R target model.

Each production signal supports:
- Entry;
- Stop;
- T1;
- T2;
- T3 when justified;
- optional runner when justified.

Target selection must be reproducible and based on market structure, historical MFE distribution, volatility, ATR, liquidity, support/resistance, regime and strategy statistics.

## AI authority boundaries

AI may:
- validate selected deterministic candidates;
- analyze failures and successes;
- generate hypotheses;
- propose new filters;
- propose new setup/strategy/management variants;
- discover recurring structures;
- run research workflows;
- nominate promotion candidates.

AI may not:
- bypass hard data/risk/client gates;
- self-release a new unvalidated strategy directly to clients;
- modify production rules intraday without an approved versioned snapshot;
- execute real-money broker orders.

## 28-day production sprint

Day 1: Architecture continuity + Databento activation and live entitlement proof.
Day 2: Canonical MarketEvent contract and provider abstraction.
Day 3: Production market-stream service.
Day 4: Reconnect, stale, sequence, dedup, gap and recovery safety.
Day 5: Real-time market state engine.
Day 6: Candle builder and indicators.
Day 7: Market-wide scanner.
Day 8: Session and regime intelligence.
Day 9: Existing engine bridge.
Day 10: Strategy versioning and snapshots.
Day 11: Event-driven strategy state machines.
Day 12: Adaptive WR/payoff/expectancy engine.
Day 13: Dynamic multi-target engine and management profiles.
Day 14: Complete signal-quality pipeline.
Day 15: Real-time trade lifecycle.
Day 16: Conservative execution model.
Day 17: Shared client/paper core and hard flat no later than 23:00 Kyiv.
Day 18: Canonical data ownership and immutable lineage.
Day 19: AI gateway and AI Validator.
Day 20: Failure Analysis and Strategy Research agents.
Day 21: New Setup Discovery Agent.
Day 22: Automated replay, OOS and walk-forward.
Day 23: Forward shadow, promotion and next-day snapshot.
Day 24: Full autonomous daily/overnight loop.
Day 25: Native realtime frontend transport, Signals and Signal Details.
Day 26: Complete product functionality and localization closure.
Day 27: Exhaustive final audit, load and failure simulation.
Day 28: Production freeze, rollback/recovery proof and premium launch.

## Definition of Done for every major milestone

A milestone is not complete until:
1. implementation is complete;
2. static/compile validation passes;
3. controlled deploy is performed when needed;
4. runtime smoke passes;
5. expected output is validated;
6. no known critical regression is introduced;
7. PROJECT_STATE is updated;
8. HANDOFF_LATEST.md is regenerated;
9. milestone record is written;
10. git commit is created when repository state is safe to commit;
11. NEXT_STEP.md contains exactly the next active milestone.