#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
SERVICE="skilledge-market-stream.service"
ROLLBACK_ROOT="/opt/skilledge/stock-engine/rollback_snapshots"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_DIR="$ROLLBACK_ROOT/S10_7B_50_SYMBOL_CANARY_$STAMP"
RESULT_DIR="$ENGINE/data/capacity_benchmarks/S10_7B_$STAMP"

CURRENT_SYMBOLS="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"
NEXT_SYMBOLS="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW,SDOT,SLND,STAK,CJMB,BIYA,VIVK,HPAI,TGHL,LCID,ATPC,LEDS,RUBI,SG,ISRG,SLS,BNRG,ENHA,LASE,SOBR,JTAI,CNF,NN,ALTO,SPCX,MARA"

fail() {
  echo "ABORT: $*" >&2
  if [ -d "$ROLLBACK_DIR" ] && [ -f "$ROLLBACK_DIR/skilledge-market-stream.service.before" ]; then
    cp -a "$ROLLBACK_DIR/skilledge-market-stream.service.before" "$UNIT" || true
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  exit 1
}

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

metric_snapshot() {
  "$ENGINE/.venv/bin/python" - "$1" <<'PY'
import json,subprocess,sys,time
from pathlib import Path
label=sys.argv[1]
m=json.loads(Path("/opt/skilledge/stock-engine/data/market_state_snapshot.json").read_text())
c=json.loads(Path("/opt/skilledge/stock-engine/data/candle_indicator_snapshot.json").read_text())
pid=subprocess.check_output(["systemctl","show","skilledge-market-stream.service","-p","MainPID","--value"],text=True).strip()
rss_kb=0
if pid and pid!="0":
    status=Path(f"/proc/{pid}/status")
    if status.exists():
        for line in status.read_text().splitlines():
            if line.startswith("VmRSS:"):
                rss_kb=int(line.split()[1]); break
print(json.dumps({
    "label":label,
    "ts":time.time(),
    "appliedTrades":int(m.get("appliedTrades") or 0),
    "marketSymbolCount":len(m.get("symbols") or {}),
    "candleSymbolCount":len(c.get("symbols") or {}),
    "rssMb":round(rss_kb/1024,2),
    "mainPid":pid
}))
PY
}

mkdir -p "$ROLLBACK_DIR" "$RESULT_DIR"

systemctl is-active --quiet "$SERVICE" || fail "market stream not active"
[ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] || fail "NRestarts not zero"
grep -Fq "Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS=$CURRENT_SYMBOLS" "$UNIT" || fail "unexpected current universe"
snapshot_check "$CURRENT_SYMBOLS" > "$RESULT_DIR/preflight_snapshot.json" || fail "snapshot preflight failed"

cp -a "$UNIT" "$ROLLBACK_DIR/skilledge-market-stream.service.before"
cp -a "$ENGINE/data/market_state_snapshot.json" "$ROLLBACK_DIR/market_state_snapshot.before.json"
cp -a "$ENGINE/data/candle_indicator_snapshot.json" "$ROLLBACK_DIR/candle_indicator_snapshot.before.json"
sha256sum "$UNIT" "$ENGINE/data/market_state_snapshot.json" "$ENGINE/data/candle_indicator_snapshot.json" > "$ROLLBACK_DIR/before.sha256"

metric_snapshot "before" > "$RESULT_DIR/metrics_before.json"

python3 - "$UNIT" "$CURRENT_SYMBOLS" "$NEXT_SYMBOLS" <<'PY'
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

deadline=$((SECONDS+240))
while [ "$SECONDS" -lt "$deadline" ]; do
  if systemctl is-active --quiet "$SERVICE" && snapshot_check "$NEXT_SYMBOLS" > "$RESULT_DIR/hydration_snapshot.json" 2>/dev/null; then
    break
  fi
  sleep 5
done

snapshot_check "$NEXT_SYMBOLS" > "$RESULT_DIR/hydration_snapshot.json" || fail "50-symbol hydration failed"

for i in $(seq 1 30); do
  sleep 60
  systemctl is-active --quiet "$SERVICE" || fail "service stopped during soak"
  [ "$(systemctl show "$SERVICE" -p NRestarts --value)" = "0" ] || fail "restart detected during soak"
  snapshot_check "$NEXT_SYMBOLS" > "$RESULT_DIR/soak_snapshot_$i.json" || fail "snapshot invariant failed during soak"
  metric_snapshot "minute_$i" > "$RESULT_DIR/metrics_$i.json"
  echo "Soak minute $i/30 OK"
done

metric_snapshot "after" > "$RESULT_DIR/metrics_after.json"

"$ENGINE/.venv/bin/python" - "$RESULT_DIR" <<'PY'
import json,sys
from pathlib import Path
d=Path(sys.argv[1])
before=json.loads((d/"metrics_before.json").read_text())
after=json.loads((d/"metrics_after.json").read_text())
errors=[]
if after["marketSymbolCount"]!=50: errors.append("MARKET_COUNT_NOT_50")
if after["candleSymbolCount"]!=50: errors.append("CANDLE_COUNT_NOT_50")
if after["appliedTrades"]<=before["appliedTrades"]: errors.append("APPLIED_TRADES_NOT_GROWING")
if after["rssMb"]<=0: errors.append("RSS_INVALID")
result={
  "ok":not errors,
  "classification":"DAY7D_50_SYMBOL_CAPACITY_CANARY_PASSED" if not errors else "DAY7D_50_SYMBOL_CAPACITY_CANARY_FAILED",
  "before":before,
  "after":after,
  "appliedTradesGrowth":after["appliedTrades"]-before["appliedTrades"],
  "rssGrowthMb":round(after["rssMb"]-before["rssMb"],2),
  "errors":errors
}
(d/"result.json").write_text(json.dumps(result,indent=2))
if errors: raise SystemExit(1)
print(json.dumps(result))
PY

echo "DAY7D_50_SYMBOL_CAPACITY_CANARY_PASSED"
echo "Result directory: $RESULT_DIR"
echo "Rollback directory: $ROLLBACK_DIR"
