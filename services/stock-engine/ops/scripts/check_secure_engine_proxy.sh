#!/usr/bin/env bash
set -euo pipefail

ENGINE_URL="${1:-}"
ENGINE_PROXY_SECRET="${2:-}"

if [ -z "${ENGINE_URL}" ] || [ -z "${ENGINE_PROXY_SECRET}" ]; then
  echo "Usage: bash ops/scripts/check_secure_engine_proxy.sh <engine-url> <secret>"
  exit 1
fi

echo "[1/3] Unauthorized request should be 403:"
set +e
CODE="$(curl -s -o /tmp/skilledge_unauthorized.out -w "%{http_code}" "${ENGINE_URL}/health")"
set -e
echo "status=${CODE}"
cat /tmp/skilledge_unauthorized.out || true
echo

echo "[2/3] Authorized health request should be 200:"
curl -sS -H "X-SkillEdge-Engine-Key: ${ENGINE_PROXY_SECRET}" "${ENGINE_URL}/health"
echo

echo "[3/3] Authorized cockpit request should be 200:"
curl -sS -H "X-SkillEdge-Engine-Key: ${ENGINE_PROXY_SECRET}" "${ENGINE_URL}/engine/cockpit?limit=5" | head -c 1000
echo
