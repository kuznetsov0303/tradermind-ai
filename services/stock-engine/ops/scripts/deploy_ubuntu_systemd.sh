#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/skilledge/stock-engine}"
REPO_DIR="${REPO_DIR:-$(pwd)}"

echo "[SkillEdge] Deploying stock-engine to ${APP_DIR}"

sudo mkdir -p "${APP_DIR}"
sudo rsync -a --delete \
  --exclude ".venv" \
  --exclude "__pycache__" \
  --exclude ".pytest_cache" \
  --exclude "reports" \
  --exclude "data/stock_engine.db-shm" \
  --exclude "data/stock_engine.db-wal" \
  "${REPO_DIR}/" "${APP_DIR}/"

cd "${APP_DIR}"

if [ ! -f ".env.server" ]; then
  cp ".env.server.example" ".env.server"
  echo "[SkillEdge] Created .env.server from example. Fill secrets before starting services."
fi

python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel

if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

python -m py_compile run_daily_ai_desk.py run_nightly_self_learning.py ops/runner_utils.py ops/scripts/server_healthcheck.py

sudo cp ops/systemd/skilledge-stock-engine-api.service /etc/systemd/system/skilledge-stock-engine-api.service
sudo cp ops/systemd/skilledge-daily-ai-desk.service /etc/systemd/system/skilledge-daily-ai-desk.service
sudo cp ops/systemd/skilledge-nightly-self-learning.service /etc/systemd/system/skilledge-nightly-self-learning.service
sudo cp ops/systemd/skilledge-nightly-self-learning.timer /etc/systemd/system/skilledge-nightly-self-learning.timer
sudo cp ops/systemd/skilledge-telegram-consumer.service /etc/systemd/system/skilledge-telegram-consumer.service

sudo systemctl daemon-reload
sudo systemctl enable skilledge-stock-engine-api.service
sudo systemctl enable skilledge-daily-ai-desk.service
sudo systemctl enable skilledge-nightly-self-learning.timer
sudo systemctl enable skilledge-telegram-consumer.service

echo "[SkillEdge] Installed systemd units."
echo "Next:"
echo "1) edit ${APP_DIR}/.env.server"
echo "2) sudo systemctl start skilledge-stock-engine-api"
echo "3) sudo systemctl start skilledge-daily-ai-desk"
echo "4) sudo systemctl start skilledge-nightly-self-learning.timer"
echo "5) sudo systemctl start skilledge-telegram-consumer"
