# S8.4A Market Holiday Guard

Purpose: protect the live engine from running live discovery/signals on US equity market holidays, weekends, and after early closes.

## What changes

- Adds `ops/market_calendar.py`
- Updates `run_daily_ai_desk.py`
- The daily runner now writes `marketSession` into `reports/daily_ai_desk/latest.json`
- On market holiday/weekend/after early close:
  - skips `discovery_refresh`
  - skips live cockpit refresh as a signal source
  - keeps `/health` and calibration preview cache checks
  - sets `skippedLiveEngine=true`
  - sets `telegramSignalsAllowed=false`

## Safety

This does not change engine weights.
This does not change historical replay.
This does not break manual override.

## Commands

Compile:

```bash
cd /opt/skilledge/stock-engine
. .venv/bin/activate
python -m py_compile run_daily_ai_desk.py ops/market_calendar.py ops/runner_utils.py
```

Manual holiday-aware run:

```bash
python run_daily_ai_desk.py --once --ignore-session-window
```

Expected on Juneteenth / holiday:

```txt
Live engine skipped by market calendar: market_holiday:Juneteenth
```

Inspect report:

```bash
python - <<'PY'
import json
from pathlib import Path
p = Path("reports/daily_ai_desk/latest.json")
data = json.loads(p.read_text())
print("ok:", data.get("ok"))
print("version:", data.get("version"))
print("skippedLiveEngine:", data.get("skippedLiveEngine"))
print("reason:", data.get("reason"))
print("marketSession:", data.get("marketSession"))
for s in data.get("steps", []):
    print(s.get("name"), s.get("ok"), s.get("status"), s.get("durationSec"))
PY
```

Manual override, only if testing:

```bash
python run_daily_ai_desk.py --once --ignore-session-window --ignore-market-calendar --skip-discovery
```

## Systemd

After copying the files to VPS:

```bash
sudo systemctl restart skilledge-daily-ai-desk
sudo systemctl status skilledge-daily-ai-desk --no-pager
```
