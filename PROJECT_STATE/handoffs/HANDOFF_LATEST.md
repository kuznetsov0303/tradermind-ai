# SkillEdge AI - HANDOFF LATEST

Generated: 2026-07-15T20:32:18+03:00

Read this first:
Continue from the current project state. Do not restart the architecture from scratch.

Project:
SkillEdge AI / UpYourSkills is a premium intraday US-equities trading-intelligence SaaS.

Public site:
https://www.upyourskills.site/

Production VPS:
178.104.184.138

Production engine:
/opt/skilledge/stock-engine

Local repository:
C:\Users\milli\OneDrive\Р Р°Р±РѕС‡РёР№ СЃС‚РѕР»\tradermind\tradermind-ai

Current engine version:
holly_persistent_v2

Primary realtime provider:
Databento US Equities / EQUS.MINI.

Target schema:
MBP-1.

Target market scope:
ALL_SYMBOLS when entitlement and runtime capacity are proven.

FMP Premium:
retained for fundamentals, profiles, news/catalyst enrichment and existing historical/research integrations.

FMP Ultimate:
do not buy.

Final realtime flow:
Databento -> Market Stream Ingestor -> Normalized MarketEvent -> Market State Engine -> Market-wide Scanner -> Dynamic In-Play Universe -> Strategy Engine -> Confirmation / Signal Blocker / Failure Pattern Intelligence -> Adaptive expectancy/payoff/risk gate -> optional AI Validator -> production-qualified signal -> website / Telegram notification / client-equivalent paper -> real-time lifecycle -> immutable outcome.

Client eligibility:
- minimum WR 45%;
- WR alone is insufficient;
- positive realized expectancy;
- acceptable PF and drawdown;
- adequate sample;
- OOS/holdout pass;
- walk-forward pass;
- forward-shadow pass;
- conservative execution pass;
- data-quality pass.

Adaptive extension objective:
45-49.9% WR >=3R
50-54.9% >=2.5R
55-59.9% >=2.25R
60-64.9% >=2R
65-69.9% >=1.8R
70-79.9% >=1.5R
80%+ >=1.25R

Dynamic exits:
No global fixed 2R target.
Signals support entry, stop, T1, T2, T3 where justified and optional runner.

Autonomous research:
Day N -> 5Y + Day N replay -> statistics -> failure analysis -> pattern discovery -> AI hypotheses -> new setup/strategy/management variants -> replay -> OOS -> walk-forward -> forward shadow -> production eligibility -> admin approval -> Day N+1 approved snapshot.

AI may create/test/nominate strategies.
AI may not directly self-release an unvalidated strategy to clients.

Critical safety invariants:
- no broker execution;
- no real-money execution;
- never reset clean paper boundary 2026-07-13T19:01:07.317798Z;
- no manual paper run-once;
- no weakening of client/Telegram gates;
- payment/pricing logic is not touched during realtime migration;
- no blind full local-tree deploy over production.

Active milestone:
DAY 1 / S10.6A.

Current step:
1. Project Continuity System initialized.
2. Activate Databento US Equities / EQUS.MINI live access.
3. Add Databento API key securely.
4. Run read-only live entitlement smoke.
5. Record exact result.
6. Update PROJECT_STATE and milestone.
7. Commit when safe.

Do not buy now:
- FMP Ultimate;
- Pusher;
- Sentry Team;
- Kafka;
- NATS;
- second VPS.

Next implementation after Databento live proof:
DAY 2 - Canonical MarketEvent contract and provider abstraction.
## S10.6B Day 2 update - 2026-07-16T21:54:07+03:00

Databento entitlement was proven before this milestone:
- EQUS.MINI live confirmed;
- ALL_SYMBOLS definitions confirmed;
- MBP-1 confirmed;
- 13,101 unique symbols observed in smoke;
- key persisted securely on production VPS.

Day 2 completed locally:
- app/market_data/contracts.py
- app/market_data/provider.py
- app/market_data/databento_adapter.py
- app/market_data/__init__.py
- app/market_data/README.md
- tests/test_market_data_contracts.py

Static compile and unit tests passed.

No production deployment or service restart was performed.

Next:
Day 3 production market-stream service.