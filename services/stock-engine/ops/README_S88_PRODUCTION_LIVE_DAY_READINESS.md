# S8.8 Production Live-Day Readiness Check

Read-only premarket readiness check for production. It does not run discovery, does not create signals, and does not send trading alerts. It can send Telegram only if blockers are found.

Checks: systemd services, timers, local health, public HTTPS secret ingress, Vercel proxy, market-session, cockpit, SSL expiry, watchdog freshness, disk space, daily runner permission errors.

## Install locally

```powershell
cd "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai"
Expand-Archive ".\s88_production_live_day_readiness_patch.zip" -DestinationPath ".\s88_patch" -Force
.\s88_patch\install_s88_production_readiness.ps1
```

## Copy to VPS

```powershell
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\scripts\production_live_day_readiness.py" root@178.104.184.138:/opt/skilledge/stock-engine/ops/scripts/production_live_day_readiness.py
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\systemd\skilledge-production-readiness.service" root@178.104.184.138:/opt/skilledge/stock-engine/ops/systemd/skilledge-production-readiness.service
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\systemd\skilledge-production-readiness.timer" root@178.104.184.138:/opt/skilledge/stock-engine/ops/systemd/skilledge-production-readiness.timer
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\README_S88_PRODUCTION_LIVE_DAY_READINESS.md" root@178.104.184.138:/opt/skilledge/stock-engine/ops/README_S88_PRODUCTION_LIVE_DAY_READINESS.md
```

## Manual VPS test

```bash
cd /opt/skilledge/stock-engine
/opt/skilledge/stock-engine/.venv/bin/python -m py_compile ops/scripts/production_live_day_readiness.py
/opt/skilledge/stock-engine/.venv/bin/python ops/scripts/production_live_day_readiness.py --public-url https://engine.upyourskills.site --frontend-url https://www.upyourskills.site
```

Expected: `ok: true`, `blockers: []`. Warnings are allowed if market is closed by holiday/weekend.

For a real live trading day:

```bash
/opt/skilledge/stock-engine/.venv/bin/python ops/scripts/production_live_day_readiness.py --public-url https://engine.upyourskills.site --frontend-url https://www.upyourskills.site --strict-live-day
```

## Enable premarket timer

```bash
sudo cp ops/systemd/skilledge-production-readiness.service /etc/systemd/system/skilledge-production-readiness.service
sudo cp ops/systemd/skilledge-production-readiness.timer /etc/systemd/system/skilledge-production-readiness.timer
sudo systemctl daemon-reload
sudo systemctl enable skilledge-production-readiness.timer
sudo systemctl start skilledge-production-readiness.timer
sudo systemctl status skilledge-production-readiness.timer --no-pager
systemctl list-timers | grep skilledge-production-readiness
```

Latest report:

```bash
/opt/skilledge/stock-engine/.venv/bin/python - <<'PY'
import json
from pathlib import Path
p = Path('/opt/skilledge/stock-engine/reports/production_readiness/latest.json')
data = json.loads(p.read_text())
print('ok:', data.get('ok'))
print('version:', data.get('version'))
print('blockers:', data.get('blockers'))
print('warnings:', data.get('warnings'))
PY
```
