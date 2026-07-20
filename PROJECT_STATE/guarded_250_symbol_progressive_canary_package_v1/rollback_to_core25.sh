#!/usr/bin/env bash
set -euo pipefail
SERVICE="skilledge-market-stream.service"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
[ "$#" -eq 1 ] || { echo "Usage: $0 <rollback-directory>" >&2; exit 2; }
SOURCE="$1/skilledge-market-stream.service.before"
[ -f "$SOURCE" ] || { echo "Missing rollback unit" >&2; exit 3; }
cp -a "$SOURCE" "$UNIT"
systemctl daemon-reload
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"
echo "ROLLBACK_TO_CORE25_EXECUTED"
