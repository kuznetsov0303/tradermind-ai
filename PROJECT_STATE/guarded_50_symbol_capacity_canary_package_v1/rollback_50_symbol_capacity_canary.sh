#!/usr/bin/env bash
set -euo pipefail

SERVICE="skilledge-market-stream.service"
UNIT="/etc/systemd/system/skilledge-market-stream.service"

[ "$#" -eq 1 ] || {
  echo "Usage: $0 <rollback-directory>" >&2
  exit 2
}

ROLLBACK_DIR="$1"
SOURCE="$ROLLBACK_DIR/skilledge-market-stream.service.before"

[ -f "$SOURCE" ] || {
  echo "Missing rollback unit: $SOURCE" >&2
  exit 3
}

cp -a "$SOURCE" "$UNIT"
systemctl daemon-reload
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE" || exit 4

echo "ROLLBACK_EXECUTED"
