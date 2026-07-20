#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
SERVICE="skilledge-market-stream.service"
ROLLBACK_ROOT="/opt/skilledge/stock-engine/rollback_snapshots"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_DIR="$ROLLBACK_ROOT/S10_6Y_DAY7D_CANARY_$STAMP"

CURRENT_SYMBOLS="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"
NEXT_SYMBOLS="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,CRWD,NOW,SDOT,SLND"

fail(){ echo "ABORT: $*" >&2; exit 1; }

snapshot_check() {
  "$ENGINE/.venv/bin/python" - "$1" <<'PY'
import json,sys
from pathlib import Path
expected=set(sys.argv[1].split(","))
m=json.loads(Path("/opt/skilledge/stock-engine/data/market_state_snapshot.json").read_text())
c=json.loads(Path("/opt/skilledge/stock-engine/data/candle_indicator_snapshot.json").read_text())
ms=m.get("symbols") or {}
cs=c.get("symbols") or {}
if set(ms)!=expected: raise SystemExit(11)
if set(cs)!=expected: raise SystemExit(12)
for row in cs.values():
    age=row.get("lastTradeAgeSeconds")
    if isinstance(age,(int,float)) and age<0: raise SystemExit(13)
print(json.dumps({"marketCount":len(ms),"candleCount":len(cs),"negativeAgeCount":0}))
PY
}

systemctl is-active --quiet "$SERVICE" || fail "market stream not active"
[ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] || fail "NRestarts not zero"
grep -Fq "Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS=$CURRENT_SYMBOLS" "$UNIT" || fail "unexpected current universe"
snapshot_check "$CURRENT_SYMBOLS" >/tmp/s10_6y_preflight.json || fail "snapshot preflight failed"

mkdir -p "$ROLLBACK_DIR"
cp -a "$UNIT" "$ROLLBACK_DIR/skilledge-market-stream.service.before"
cp -a "$ENGINE/data/market_state_snapshot.json" "$ROLLBACK_DIR/market_state_snapshot.before.json"
cp -a "$ENGINE/data/candle_indicator_snapshot.json" "$ROLLBACK_DIR/candle_indicator_snapshot.before.json"
sha256sum "$UNIT" "$ENGINE/data/market_state_snapshot.json" "$ENGINE/data/candle_indicator_snapshot.json" > "$ROLLBACK_DIR/before.sha256"

python3 - "$UNIT" "$CURRENT_SYMBOLS" "$NEXT_SYMBOLS" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); old=sys.argv[2]; new=sys.argv[3]
text=p.read_text()
needle=f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={old}"
replacement=f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={new}"
if text.count(needle)!=1: raise SystemExit("expected exactly one symbols line")
p.write_text(text.replace(needle,replacement,1))
PY

systemctl daemon-reload
systemctl restart "$SERVICE"

deadline=$((SECONDS+180))
while [ "$SECONDS" -lt "$deadline" ]; do
  if systemctl is-active --quiet "$SERVICE" && snapshot_check "$NEXT_SYMBOLS" >/tmp/s10_6y_hydration.json 2>/dev/null; then
    break
  fi
  sleep 5
done

snapshot_check "$NEXT_SYMBOLS" >/tmp/s10_6y_hydration.json || fail "new universe failed hydration"

START_APPLIED="$(python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/opt/skilledge/stock-engine/data/market_state_snapshot.json").read_text())
print(int(d.get("appliedTrades") or 0))
PY
)"

for i in $(seq 1 30); do
  sleep 60
  systemctl is-active --quiet "$SERVICE" || fail "service stopped during soak"
  [ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] || fail "restart detected during soak"
  snapshot_check "$NEXT_SYMBOLS" >/tmp/s10_6y_soak.json || fail "snapshot invariant failed"
  echo "Soak minute $i/30 OK"
done

END_APPLIED="$(python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/opt/skilledge/stock-engine/data/market_state_snapshot.json").read_text())
print(int(d.get("appliedTrades") or 0))
PY
)"

[ "$END_APPLIED" -gt "$START_APPLIED" ] || fail "appliedTrades did not grow"
echo "DAY7D_CONTROLLED_2_SYMBOL_ROTATION_CANARY_PASSED"
echo "Rollback snapshot: $ROLLBACK_DIR"
