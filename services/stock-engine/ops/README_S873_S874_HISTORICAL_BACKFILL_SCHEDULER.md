# S8.73 / S8.74 Historical Backfill Orchestrator + Scheduler

## What is finished

S8.73 adds a safe chunked backfill orchestrator:

- `POST /engine/research/historical-learning/backfill/plan`
- `POST /engine/research/historical-learning/backfill/run-next`
- `GET /engine/research/historical-learning/backfill/status`

S8.74 adds a scheduler runner and systemd timer:

- `run_historical_learning_backfill.py`
- `ops/systemd/skilledge-historical-learning-backfill.service`
- `ops/systemd/skilledge-historical-learning-backfill.timer`

## Safety

This does not change client delivery, Telegram, manual approvals or production strategy policy.

It only runs the historical learning chain:

```text
ingestion → features → setup replay → outcomes → stats/segments → Supabase
```

## Scaling

Default scheduler is intentionally small:

```text
symbols: AAPL,NVDA,TSLA
interval: 5min
max_days: 5
max_jobs per run: 1
```

Tomorrow this can be expanded to real 5-year backfill by increasing symbols/date chunks gradually.
