# SkillEdge AI - Database and Storage Map

Updated: 2026-07-15T20:32:18+03:00

Supabase/Postgres:
Target durable product source of truth for users, entitlements, signals, outcomes, immutable trade ledger, strategy versions, approved snapshots, experiments, AI hypotheses, validation results, promotion records and Admin Hub records.

Upstash Redis:
Hot/shared state for cache, locks, deduplication, idempotency, latest state snapshots, rate limiting and realtime coordination.

SQLite:
Retained for explicitly documented operational/research roles until canonical ownership is deliberately assigned.

Historical learning lake:
- /opt/skilledge/stock-engine/data/historical_learning

Paper ledger clean boundary:
- 2026-07-13T19:01:07.317798Z

Never reset that boundary without explicit owner instruction.