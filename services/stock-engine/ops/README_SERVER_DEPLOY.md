# S8.0 Nightly Server Runner

This patch prepares SkillEdge AI / UpYourSkills for server-style operation.

## Files

- `run_daily_ai_desk.py`
  - Runs the live day loop checks.
  - Calls health, discovery refresh, runtime source status, Cockpit snapshot, calibration preview cache.
  - Intended window: 11:00–23:00 Kyiv.

- `run_nightly_self_learning.py`
  - Runs report-only self-learning.
  - Calls live outcomes, multi-day replay, hybrid calibration, controlled preview.
  - Always uses `apply_adjustments=false`.

- `start_stock_engine_server.ps1`
  - Loads `.env`, starts FastAPI on 127.0.0.1:8000.

- `start_daily_ai_desk.ps1`
  - Runs daily AI desk loop every 5 minutes.

- `start_nightly_self_learning.ps1`
  - Runs nightly self-learning over the last 3 weekdays.

- `ops/windows_task_scheduler_examples.ps1`
  - Example Windows scheduled tasks.

## Safety

S8.0 does not mutate engine weights. The nightly runner sends:

`apply_adjustments=false`

This means the self-learning system generates calibration and preview reports, but does not apply setup score changes.

## Reports

Reports are saved locally:

- `reports/daily_ai_desk/latest.json`
- `reports/nightly_self_learning/latest.json`

## Manual smoke tests

From `services/stock-engine`:

```powershell
.\.venv\Scripts\python.exe .\run_daily_ai_desk.py --once --ignore-session-window
.\.venv\Scripts\python.exe .\run_nightly_self_learning.py --session-dates 2026-06-17,2026-06-18 --skip-live-outcomes --min-closed 10
```

## VPS plan

After local smoke tests:

1. Deploy stock-engine to VPS.
2. Add environment variables.
3. Start API as a persistent service.
4. Schedule daily loop and nightly loop.
5. Keep Telegram consumer as a separate service.
6. Monitor `reports/*/latest.json`.
