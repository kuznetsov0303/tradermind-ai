# S8.6 Engine Monitoring Watchdog

Checks:
- stock-engine API systemd service
- daily AI desk systemd service
- Telegram consumer systemd service
- nightly self-learning timer
- local `/health`
- public HTTPS without secret should be 403
- public HTTPS with secret should be 200

It can auto-restart failed services and send Telegram admin alerts.

## Install locally

```powershell
cd "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai"

Expand-Archive ".\s86_engine_monitoring_watchdog_patch.zip" -DestinationPath ".\s86_patch" -Force

.\s86_patch\install_s86_engine_watchdog.ps1
```

## Copy to VPS

```powershell
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\scripts\engine_watchdog.py" root@178.104.184.138:/opt/skilledge/stock-engine/ops/scripts/engine_watchdog.py
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\systemd\skilledge-engine-watchdog.service" root@178.104.184.138:/opt/skilledge/stock-engine/ops/systemd/skilledge-engine-watchdog.service
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\systemd\skilledge-engine-watchdog.timer" root@178.104.184.138:/opt/skilledge/stock-engine/ops/systemd/skilledge-engine-watchdog.timer
scp -i "$env:USERPROFILE\.ssh\skilledge_hetzner" ".\services\stock-engine\ops\README_S86_ENGINE_WATCHDOG.md" root@178.104.184.138:/opt/skilledge/stock-engine/ops/README_S86_ENGINE_WATCHDOG.md
```

## VPS test

```bash
cd /opt/skilledge/stock-engine
. .venv/bin/activate

python -m py_compile ops/scripts/engine_watchdog.py
python ops/scripts/engine_watchdog.py --public-url https://engine.upyourskills.site --no-alert
```

Expected: `"ok": true`, `"issues": []`.

## Enable timer

```bash
sudo cp ops/systemd/skilledge-engine-watchdog.service /etc/systemd/system/skilledge-engine-watchdog.service
sudo cp ops/systemd/skilledge-engine-watchdog.timer /etc/systemd/system/skilledge-engine-watchdog.timer

sudo systemctl daemon-reload
sudo systemctl enable skilledge-engine-watchdog.timer
sudo systemctl start skilledge-engine-watchdog.timer

sudo systemctl status skilledge-engine-watchdog.timer --no-pager
systemctl list-timers | grep skilledge-engine-watchdog
```

Manual run:

```bash
sudo systemctl start skilledge-engine-watchdog.service
sudo journalctl -u skilledge-engine-watchdog -n 100 --no-pager
```

Report check:

```bash
python - <<'PY'
import json
from pathlib import Path
p = Path("/opt/skilledge/stock-engine/reports/engine_watchdog/latest.json")
data = json.loads(p.read_text())
print("ok:", data.get("ok"))
print("version:", data.get("version"))
print("issues:", data.get("issues"))
for c in data.get("checks", []):
    print(c.get("type"), c.get("name"), c.get("ok", c.get("active")), c.get("status"), c.get("error"))
PY
```
