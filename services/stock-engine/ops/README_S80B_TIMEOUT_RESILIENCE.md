# S8.0B Runner timeout resilience

Fixes the smoke-test crash when `/engine/discovery/refresh` exceeds the request timeout.

Changes:
- catches `TimeoutError` / `socket.timeout` / unexpected runner errors inside `http_json()`
- returns a structured failed step instead of crashing the whole runner
- increases daily discovery timeout default from 180s to 600s
- keeps nightly self-learning report-only: `apply_adjustments=false`

Recommended smoke tests:

```powershell
.\.venv\Scripts\python.exe .\run_daily_ai_desk.py --once --ignore-session-window --skip-discovery
.\.venv\Scripts\python.exe .\run_daily_ai_desk.py --once --ignore-session-window --discovery-timeout 900
.\.venv\Scripts\python.exe .\run_nightly_self_learning.py --session-dates 2026-06-17,2026-06-18 --skip-live-outcomes --min-closed 10
```
