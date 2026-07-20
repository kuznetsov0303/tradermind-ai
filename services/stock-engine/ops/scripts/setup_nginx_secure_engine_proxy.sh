#!/usr/bin/env bash
set -euo pipefail

SERVER_NAME="${1:-}"
ENGINE_PROXY_SECRET="${2:-}"

if [ -z "${SERVER_NAME}" ] || [ -z "${ENGINE_PROXY_SECRET}" ]; then
  echo "Usage: sudo bash ops/scripts/setup_nginx_secure_engine_proxy.sh <server-name-or-ip> <secret>"
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/skilledge/stock-engine}"
TEMPLATE="${APP_DIR}/ops/nginx/skilledge-engine-secure.nginx.template.conf"
TARGET="/etc/nginx/sites-available/skilledge-engine-secure.conf"
LINK="/etc/nginx/sites-enabled/skilledge-engine-secure.conf"

sudo sed \
  -e "s|__SERVER_NAME__|${SERVER_NAME}|g" \
  -e "s|__ENGINE_PROXY_SECRET__|${ENGINE_PROXY_SECRET}|g" \
  "${TEMPLATE}" | sudo tee "${TARGET}" >/dev/null

sudo ln -sf "${TARGET}" "${LINK}"
sudo nginx -t
sudo systemctl reload nginx

echo "Nginx secure engine proxy installed."
echo "Public URL: http://${SERVER_NAME}"
echo "Required header: X-SkillEdge-Engine-Key: <secret>"
