# SkillEdge AI - Production Architecture

Updated: 2026-07-15T20:32:18+03:00

## External providers

Databento:
- primary real-time US-equities market-data backbone;
- target service: Databento US Equities;
- dataset: EQUS.MINI;
- primary schema: MBP-1;
- target scope: ALL_SYMBOLS where entitlement and runtime capacity are proven.

FMP Premium:
- fundamentals;
- profiles;
- market-cap/reference enrichment;
- news/catalyst enrichment;
- existing discovery enrichment;
- existing five-year historical research pipeline.

FMP Ultimate is not part of the target architecture.

## Runtime services

1. Market Stream Ingestor
2. Market State Engine
3. Market-wide Scanner
4. Strategy Engine
5. Signal Quality Pipeline
6. Real-Time Trade Lifecycle
7. Native Realtime Client Gateway

Pusher is not part of the required launch architecture. It may be added only if the final load test proves the native gateway cannot meet the required production SLA.

## Persistence

Supabase/Postgres:
- durable product truth for users, entitlements, signals, outcomes, immutable trade ledger, strategy versions, approved snapshots, experiments, AI hypotheses, validation results, promotion records and Admin Hub records.

Upstash Redis:
- cache, locks, deduplication, idempotency, latest snapshots, rate limiting and realtime coordination.

SQLite:
- retained only for explicitly documented operational/research roles until each table has a deliberate canonical owner.

Historical lake:
- compressed historical market and feature data plus metadata/index records.

## Frontend

Vercel hosts website/frontend.

Final signal experience:
- premium signal card;
- live chart;
- entry;
- stop;
- T1/T2/T3;
- optional runner;
- live state;
- management plan;
- invalidation;
- strategy statistics;
- explanation.

Telegram only notifies that a new signal exists and links directly to the website signal page.