#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
SERVICE="skilledge-market-stream.service"
ROLLBACK_ROOT="$ENGINE/rollback_snapshots"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_DIR="$ROLLBACK_ROOT/S10_7D_250_SYMBOL_RAMP_$STAMP"
RESULT_DIR="$ENGINE/data/capacity_benchmarks/S10_7D_$STAMP"

CORE25="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"

rollback() {
  echo "ROLLBACK_STARTED" >&2
  if [ -f "$ROLLBACK_DIR/skilledge-market-stream.service.before" ]; then
    cp -a "$ROLLBACK_DIR/skilledge-market-stream.service.before" "$UNIT" || true
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  echo "ROLLBACK_FINISHED" >&2
}

fail() {
  echo "ABORT: $*" >&2
  rollback
  exit 1
}

snapshot_check() {
  "$ENGINE/.venv/bin/python" - "$1" <<'PY'
import json,sys
from pathlib import Path
expected=set(sys.argv[1].split(","))
market=json.loads(Path("/opt/skilledge/stock-engine/data/market_state_snapshot.json").read_text())
candle=json.loads(Path("/opt/skilledge/stock-engine/data/candle_indicator_snapshot.json").read_text())
ms=market.get("symbols") or {}
cs=candle.get("symbols") or {}
if set(ms)!=expected: raise SystemExit(11)
if set(cs)!=expected: raise SystemExit(12)
for row in cs.values():
    age=row.get("lastTradeAgeSeconds")
    if isinstance(age,(int,float)) and age<0: raise SystemExit(13)
print(json.dumps({"marketCount":len(ms),"candleCount":len(cs)}))
PY
}

build_universes() {
  "$ENGINE/.venv/bin/python" - "$RESULT_DIR" <<'PY'
import json,math,sys,urllib.request
from pathlib import Path

out=Path(sys.argv[1])
core=[
"AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO","PLTR",
"SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM","UBER","SHOP",
"RIVN","SOFI","CRWD","NOW"
]

def norm(v): return str(v or "").strip().upper()
def valid(s):
    return bool(s and s.isalnum() and len(s)<=5 and not s.endswith(("W","WS","WT")))

candidates=[]
seen=set(core)

# Prefer current discovery/watchlist.
try:
    with urllib.request.urlopen("http://127.0.0.1:8000/engine/watchlist",timeout=20) as r:
        payload=json.loads(r.read().decode())
    rows=payload if isinstance(payload,list) else next(
        (payload.get(k) for k in ("watchlist","items","rows","data","candidates")
         if isinstance(payload.get(k),list)),[]
    )
    for row in rows:
        if not isinstance(row,dict): continue
        s=norm(row.get("symbol") or row.get("ticker"))
        if valid(s) and s not in seen:
            seen.add(s); candidates.append(s)
except Exception:
    pass

# Fill from approved universe v2, then v1.
paths=[
 Path("/opt/skilledge/stock-engine/data/universe/skilledge_universe_v2.json"),
 Path("/opt/skilledge/stock-engine/data/universe/skilledge_universe_v2_liquid_stocks.json"),
 Path("/opt/skilledge/stock-engine/data/universe/skilledge_universe_v1_liquid_stocks.json"),
]
for p in paths:
    if not p.exists(): continue
    try:
        d=json.loads(p.read_text())
    except Exception:
        continue
    rows=d.get("symbols") if isinstance(d,dict) else d
    if not isinstance(rows,list): continue
    for row in rows:
        s=norm(row if isinstance(row,str) else row.get("symbol"))
        if valid(s) and s not in seen:
            seen.add(s); candidates.append(s)

all_symbols=core+candidates
if len(all_symbols)<250:
    raise SystemExit(f"ONLY_{len(all_symbols)}_VALID_SYMBOLS_AVAILABLE")

for cap in (50,100,150,250):
    symbols=all_symbols[:cap]
    if len(symbols)!=cap or len(set(symbols))!=cap:
        raise SystemExit(f"INVALID_STAGE_{cap}")
    (out/f"universe_{cap}.csv").write_text(",".join(symbols))

(out/"resolved_universe.json").write_text(json.dumps({
    "available":len(all_symbols),
    "stages":[50,100,150,250],
    "target250":all_symbols[:250],
},indent=2))
PY
}

apply_stage() {
  local old_csv="$1"
  local new_csv="$2"
  local cap="$3"

  python3 - "$UNIT" "$old_csv" "$new_csv" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); old=sys.argv[2]; new=sys.argv[3]
text=p.read_text()
needle=f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={old}"
replacement=f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={new}"
if text.count(needle)!=1:
    raise SystemExit("expected exactly one current universe line")
p.write_text(text.replace(needle,replacement,1))
PY

  systemctl daemon-reload
  systemctl restart "$SERVICE"

  local deadline=$((SECONDS+300))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if systemctl is-active --quiet "$SERVICE" && snapshot_check "$new_csv" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done

  snapshot_check "$new_csv" > "$RESULT_DIR/stage_${cap}_hydration.json" \
    || fail "stage ${cap} hydration failed"

  for minute in $(seq 1 5); do
    sleep 60
    systemctl is-active --quiet "$SERVICE" || fail "service stopped at stage ${cap}"
    [ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] \
      || fail "restart detected at stage ${cap}"
    snapshot_check "$new_csv" > "$RESULT_DIR/stage_${cap}_minute_${minute}.json" \
      || fail "snapshot invariant failed at stage ${cap}"
  done
}

mkdir -p "$ROLLBACK_DIR" "$RESULT_DIR"

systemctl is-active --quiet "$SERVICE" || fail "market stream not active"
[ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] || fail "NRestarts not zero"
grep -Fq "Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS=$CORE25" "$UNIT" \
  || fail "current universe is not exact Core25"
snapshot_check "$CORE25" > "$RESULT_DIR/preflight.json" || fail "Core25 preflight failed"

cp -a "$UNIT" "$ROLLBACK_DIR/skilledge-market-stream.service.before"
cp -a "$ENGINE/data/market_state_snapshot.json" "$ROLLBACK_DIR/market_state_snapshot.before.json"
cp -a "$ENGINE/data/candle_indicator_snapshot.json" "$ROLLBACK_DIR/candle_indicator_snapshot.before.json"

build_universes

CURRENT="$CORE25"
for CAP in 50 100 150 250; do
  NEXT="$(cat "$RESULT_DIR/universe_${CAP}.csv")"
  apply_stage "$CURRENT" "$NEXT" "$CAP"
  CURRENT="$NEXT"
done

# Full 30-minute final soak at 250.
for minute in $(seq 1 30); do
  sleep 60
  systemctl is-active --quiet "$SERVICE" || fail "service stopped during final soak"
  [ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] \
    || fail "restart detected during final soak"
  snapshot_check "$CURRENT" > "$RESULT_DIR/final_soak_minute_${minute}.json" \
    || fail "250-symbol invariant failed during final soak"
  echo "Final soak minute $minute/30 OK"
done

echo '{"ok":true,"classification":"DAY7D_250_SYMBOL_PROGRESSIVE_CAPACITY_CANARY_PASSED"}' \
  > "$RESULT_DIR/result.json"

echo "DAY7D_250_SYMBOL_PROGRESSIVE_CAPACITY_CANARY_PASSED"
echo "Result directory: $RESULT_DIR"
echo "Rollback directory: $ROLLBACK_DIR"
