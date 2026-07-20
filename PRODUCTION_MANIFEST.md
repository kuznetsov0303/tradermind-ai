# SkillEdge AI Production Manifest

Generated: 20260714_211029

## Source of Truth

- Production runtime root: /opt/skilledge/stock-engine
- Canonical local backend mirror: services/stock-engine
- Production systemd runtime definitions: /etc/systemd/system
- Production engine version: holly_persistent_v2
- Production API service: skilledge-stock-engine-api.service
- API bind: 127.0.0.1:8000

## Canonical Systemd Runtime Parity

- Total canonical units: 31
- MATCH: 31
- RUNTIME_MISSING: 0
- DIFFERENT: 0

- skilledge-cap-aware-backfill.service : MATCH
- skilledge-cap-aware-backfill.timer : MATCH
- skilledge-clean-elite-capture.service : MATCH
- skilledge-clean-elite-capture.timer : MATCH
- skilledge-daily-ai-desk.service : MATCH
- skilledge-engine-watchdog.service : MATCH
- skilledge-engine-watchdog.timer : MATCH
- skilledge-forward-shadow-daily.service : MATCH
- skilledge-forward-shadow-daily.timer : MATCH
- skilledge-forward-shadow-promotion-gate.service : MATCH
- skilledge-forward-shadow-promotion-gate.timer : MATCH
- skilledge-historical-learning-backfill.service : MATCH
- skilledge-historical-learning-backfill.timer : MATCH
- skilledge-internal-research-agents.service : MATCH
- skilledge-internal-research-agents.timer : MATCH
- skilledge-nightly-research-optimizer.service : MATCH
- skilledge-nightly-research-optimizer.timer : MATCH
- skilledge-nightly-self-learning.service : MATCH
- skilledge-nightly-self-learning.timer : MATCH
- skilledge-post-close-evidence.service : MATCH
- skilledge-post-close-evidence.timer : MATCH
- skilledge-production-readiness.service : MATCH
- skilledge-production-readiness.timer : MATCH
- skilledge-s10-paper-evaluation.service : MATCH
- skilledge-s10-paper-evaluation.timer : MATCH
- skilledge-s10-paper-trading.service : MATCH
- skilledge-s10-paper-trading.timer : MATCH
- skilledge-stock-engine-api.service : MATCH
- skilledge-telegram-consumer.service : MATCH
- skilledge-universe-v1-backfill.service : MATCH
- skilledge-universe-v1-backfill.timer : MATCH

## Canonical Backend Source

- app/api/app.py
- requirements.txt
- ops/scripts/
- ops/systemd/ as canonical local unit definitions
- run_historical_learning_backfill.py
- run_nightly_self_learning.py
- run_daily_ai_desk.py

## Runtime Data

- /opt/skilledge/stock-engine/data/
- /opt/skilledge/stock-engine/reports/
- SQLite runtime database
- historical learning lake
- Supabase persistence
- Upstash runtime cache

## Rollback

- /opt/skilledge/stock-engine/rollback_snapshots/
- Current verified rollback snapshot created in S10.4O
- 3 recent app.py rollback backups retained

## Removed Legacy and Duplicate Artifacts

- 87 old app.py backups removed
- duplicate ops/ops tree removed
- 5 non-app backup files removed
- ops/scripts/s10_paper_trading_daemon.py removed after legacy proof

## Protected Areas

- .env.server and all secrets
- payment and pricing logic
- paper ledger and clean boundary
- client, Telegram and research promotion gates
- runtime databases and historical-learning data
- rollback snapshots

## Critical Safety Invariants

- paperOnly=true
- brokerExecution=false
- no automatic client or Telegram promotion from research
- no paper reset during audit and maintenance
- no manual /engine/paper/run-once during audit and maintenance
- research and backtest do not directly release client signals
- current 5-minute point-quote paper evaluator is not reliable profitability proof

## Verification Status

- Python files checked: 36
- Python failures: 0
- PowerShell files checked: 20
- PowerShell failures: 0
- Requirements invalid merged lines: 0
- Requirements duplicate lines: 0

## Deployment Rule

Do not perform a full local-to-VPS deploy unless parity is re-checked, a rollback snapshot exists, and smoke tests pass.
