# S8.1 VPS Deploy Pack

This pack prepares stock-engine for 24/7 server operation.

## What runs on the server

1. API service
   - `skilledge-stock-engine-api.service`
   - FastAPI on `127.0.0.1:8000`

2. Daily AI Desk loop
   - `skilledge-daily-ai-desk.service`
   - 11:00–23:00 Kyiv
   - health, discovery, runtime status, Cockpit snapshot, calibration preview

3. Telegram consumer
   - `skilledge-telegram-consumer.service`
   - reads cache and sends approved Telegram notifications

4. Nightly self-learning
   - `skilledge-nightly-self-learning.timer`
   - 23:35 Kyiv weekdays
   - replay, outcomes, hybrid calibration, controlled preview
   - report-only: `apply_adjustments=false`

## Safety

This deployment pack does not enable automatic score-weight mutation.

Nightly runner uses:
`apply_adjustments=false`

The output is visible in:
- `/opt/skilledge/stock-engine/reports/daily_ai_desk/latest.json`
- `/opt/skilledge/stock-engine/reports/nightly_self_learning/latest.json`

## Recommended VPS

Minimum beta:
- 2 vCPU
- 4 GB RAM
- 40 GB SSD
- Ubuntu 22.04/24.04 LTS

Better:
- 4 vCPU
- 8 GB RAM
- 80 GB SSD

## Manual Ubuntu deploy

On server:

```bash
sudo adduser --system --group --home /opt/skilledge skilledge
sudo mkdir -p /opt/skilledge/stock-engine
sudo chown -R skilledge:skilledge /opt/skilledge

cd /path/to/services/stock-engine
sudo bash ops/scripts/deploy_ubuntu_systemd.sh
sudo nano /opt/skilledge/stock-engine/.env.server

sudo systemctl start skilledge-stock-engine-api
sudo systemctl start skilledge-daily-ai-desk
sudo systemctl start skilledge-nightly-self-learning.timer
sudo systemctl start skilledge-telegram-consumer
```

Health:

```bash
curl http://127.0.0.1:8000/health
sudo journalctl -u skilledge-stock-engine-api -f
sudo journalctl -u skilledge-daily-ai-desk -f
sudo journalctl -u skilledge-telegram-consumer -f
sudo systemctl list-timers | grep skilledge
```

## Docker option

From `services/stock-engine`:

```bash
cp .env.server.example .env.server
nano .env.server
docker compose -f docker-compose.stock-engine.yml up -d stock-engine-api daily-ai-desk telegram-consumer
docker compose -f docker-compose.stock-engine.yml run --rm nightly-self-learning
```

## Local healthcheck

```bash
python ops/scripts/server_healthcheck.py --deep
```
