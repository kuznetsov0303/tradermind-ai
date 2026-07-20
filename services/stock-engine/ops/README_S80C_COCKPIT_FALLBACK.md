# S8.0C Daily runner Cockpit endpoint fallback

Fixes the daily smoke report failing because `/engine/signal-cockpit` returned 404 on this backend build.

Changes:
- adds `step_first_ok()` helper
- daily runner now tries:
  1. `/engine/cockpit`
  2. `/engine/signal-cockpit`
  3. `/engine/runtime/source-status`
- cockpit snapshot is optional, so one missing route does not fail the whole daily report
- nightly self-learning is unchanged

Smoke test:

```powershell
.\.venv\Scripts\python.exe -m py_compile .\run_daily_ai_desk.py .\run_nightly_self_learning.py .\ops\runner_utils.py
.\.venv\Scripts\python.exe .\run_daily_ai_desk.py --once --ignore-session-window --skip-discovery
```
