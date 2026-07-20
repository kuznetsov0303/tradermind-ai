param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6K_DAY7B_25_SYMBOL_CANARY_raw_$stamp.json"
$report=Join-Path $Audit "S10_6K_DAY7B_25_SYMBOL_CANARY_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6k_25_symbol_canary_$stamp.sh"
$remoteSh="/tmp/s10_6k_25_symbol_canary_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT_NAME="skilledge-market-stream.service"
UNIT="/etc/systemd/system/$UNIT_NAME"
STATUS="$ENGINE/data/market_stream_status.json"
STATE="$ENGINE/data/market_state_snapshot.json"
CANDLES="$ENGINE/data/candle_indicator_snapshot.json"
SCANNER="$ENGINE/data/scanner_snapshot.json"
STAMP="__STAMP__"
ROLLBACK_DIR="$ENGINE/rollback_snapshots/S10_6K_DAY7B_25_SYMBOL_CANARY_$STAMP"
BACKUP_UNIT="$ROLLBACK_DIR/$UNIT_NAME.before"

SYMBOLS="AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL,AVGO,PLTR,SMCI,MSTR,COIN,NFLX,CRM,ORCL,INTC,MU,ARM,UBER,SHOP,RIVN,SOFI,CRWD,NOW"

mkdir -p "$ROLLBACK_DIR"
cp -a "$UNIT" "$BACKUP_UNIT"

OLD_PID="$(systemctl show "$UNIT_NAME" -p MainPID --value || true)"
OLD_UNIT_SHA="$(sha256sum "$UNIT" | awk '{print $1}')"
BACKUP_SHA="$(sha256sum "$BACKUP_UNIT" | awk '{print $1}')"

if [[ "$OLD_UNIT_SHA" != "$BACKUP_SHA" ]]; then
  echo '{"ok":false,"classification":"DAY7B_CANARY_BACKUP_SHA_MISMATCH"}'
  exit 1
fi

rollback() {
  set +e
  cp -a "$BACKUP_UNIT" "$UNIT"
  systemctl daemon-reload
  systemctl restart "$UNIT_NAME"
  sleep 12

  RESTORED_SHA="$(sha256sum "$UNIT" | awk '{print $1}')"
  RESTORED_PID="$(systemctl show "$UNIT_NAME" -p MainPID --value || true)"
  RESTORED_STATE="$(systemctl show "$UNIT_NAME" -p ActiveState --value || true)"
  RESTORED_SUBSTATE="$(systemctl show "$UNIT_NAME" -p SubState --value || true)"

  export RESTORED_SHA RESTORED_PID RESTORED_STATE RESTORED_SUBSTATE
  "$ENGINE/.venv/bin/python" - <<'PY'
import json, os
print(json.dumps({
  "rollbackExecuted": True,
  "rollbackUnitSha": os.getenv("RESTORED_SHA"),
  "rollbackPid": int(os.getenv("RESTORED_PID") or 0),
  "rollbackActiveState": os.getenv("RESTORED_STATE"),
  "rollbackSubState": os.getenv("RESTORED_SUBSTATE"),
}, ensure_ascii=False))
PY
}

python3 - "$UNIT" "$SYMBOLS" <<'PY'
from pathlib import Path
import re
import sys

unit = Path(sys.argv[1])
symbols = sys.argv[2]
text = unit.read_text(encoding="utf-8")

pattern = r"(?m)^Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS=.*$"
replacement = f"Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS={symbols}"

if not re.search(pattern, text):
    raise SystemExit("symbol environment line not found")

new_text, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit(f"unexpected replacement count: {count}")

unit.write_text(new_text, encoding="utf-8")
PY

systemctl daemon-reload
systemctl restart "$UNIT_NAME"

sleep 15

NEW_PID="$(systemctl show "$UNIT_NAME" -p MainPID --value || true)"

export ENGINE UNIT_NAME UNIT STATUS STATE CANDLES SCANNER SYMBOLS
export ROLLBACK_DIR BACKUP_UNIT OLD_PID NEW_PID OLD_UNIT_SHA

set +e
RESULT="$("$ENGINE/.venv/bin/python" - <<'PY'
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

engine = Path(os.environ["ENGINE"])
status_path = Path(os.environ["STATUS"])
state_path = Path(os.environ["STATE"])
candles_path = Path(os.environ["CANDLES"])
scanner_path = Path(os.environ["SCANNER"])
unit_name = os.environ["UNIT_NAME"]
unit_path = Path(os.environ["UNIT"])
expected_symbols = os.environ["SYMBOLS"].split(",")

def read_json(path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def total(counter):
    return sum(int(v) for v in (counter or {}).values())

def systemctl_show():
    p = subprocess.run(
        [
            "systemctl",
            "show",
            unit_name,
            "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,MemoryCurrent,CPUUsageNSec,TasksCurrent",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

before = read_json(status_path)
raw_before = total((before or {}).get("rawRecordCounts"))
events_before = total((before or {}).get("marketEventCounts"))

time.sleep(60)

status = read_json(status_path)
state = read_json(state_path)
candles = read_json(candles_path)
scanner = read_json(scanner_path)
service = systemctl_show()

raw_after = total((status or {}).get("rawRecordCounts"))
events_after = total((status or {}).get("marketEventCounts"))

configured = (status or {}).get("symbols") or []
configured_set = set(configured)
expected_set = set(expected_symbols)

instrument_mappings = int((status or {}).get("instrumentMappings", 0))
last_error = (status or {}).get("lastError")
nrestarts_zero = "NRestarts=0" in service["stdout"]
active = (
    "ActiveState=active" in service["stdout"]
    and "SubState=running" in service["stdout"]
)

pid_changed = (
    int(os.environ.get("OLD_PID") or 0) > 0
    and int(os.environ.get("NEW_PID") or 0) > 0
    and int(os.environ["OLD_PID"]) != int(os.environ["NEW_PID"])
)

configured_ok = configured_set == expected_set
mappings_ok = instrument_mappings >= 25
growth_ok = (raw_after - raw_before) > 0 and (events_after - events_before) > 0
error_free = last_error in (None, "")

market_symbols = int((state or {}).get("symbolCount", 0))
candle_symbols = int((candles or {}).get("symbolCount", 0))
scanner_symbols = int((scanner or {}).get("symbolCount", 0))

# During a short canary, not every symbol must trade immediately.
downstream_ok = (
    market_symbols >= 10
    and candle_symbols >= 5
    and scanner_symbols >= 10
)

rss_kb = int(((status or {}).get("processMetrics") or {}).get("currentRssKilobytes", 0))
memory_ok = rss_kb > 0 and rss_kb < 900000

ok = all([
    active,
    nrestarts_zero,
    pid_changed,
    configured_ok,
    mappings_ok,
    growth_ok,
    error_free,
    downstream_ok,
    memory_ok,
])

print(json.dumps({
    "ok": ok,
    "classification": (
        "DAY7B_25_SYMBOL_LIVE_CANARY_VERIFIED"
        if ok
        else "DAY7B_25_SYMBOL_LIVE_CANARY_FAILED"
    ),
    "oldPid": int(os.environ.get("OLD_PID") or 0),
    "newPid": int(os.environ.get("NEW_PID") or 0),
    "pidChanged": pid_changed,
    "serviceActive": active,
    "nRestartsZero": nrestarts_zero,
    "configuredSymbols": configured,
    "configuredSymbolCount": len(configured),
    "configuredSymbolsVerified": configured_ok,
    "instrumentMappings": instrument_mappings,
    "instrumentMappingsVerified": mappings_ok,
    "rawGrowth": raw_after - raw_before,
    "eventGrowth": events_after - events_before,
    "growthVerified": growth_ok,
    "lastError": last_error,
    "errorFree": error_free,
    "marketStateSymbolCount": market_symbols,
    "candleSymbolCount": candle_symbols,
    "scannerSymbolCount": scanner_symbols,
    "downstreamPopulationVerified": downstream_ok,
    "processRssKilobytes": rss_kb,
    "memoryVerified": memory_ok,
    "serviceShow": service,
    "status": status,
    "scanner": scanner,
    "rollbackSnapshot": os.environ["ROLLBACK_DIR"],
    "backupUnit": os.environ["BACKUP_UNIT"],
    "productionMutation": True,
    "serviceRestarted": True,
    "paperTouched": False,
    "apiAppTouched": False,
    "strategyEngineTouched": False,
    "telegramTouched": False,
    "clientGatesTouched": False,
    "researchOnly": True,
    "clientCutover": False,
    "telegramCutover": False,
    "strategyCutover": False,
}, ensure_ascii=False))
PY
)"
VERIFY_RC=$?
set -e

if [[ $VERIFY_RC -ne 0 ]]; then
  ROLLBACK_JSON="$(rollback)"
  export RESULT ROLLBACK_JSON
  "$ENGINE/.venv/bin/python" - <<'PY'
import json, os
base = {
  "ok": False,
  "classification": "DAY7B_25_SYMBOL_CANARY_VERIFIER_CRASHED",
  "verifierOutput": os.getenv("RESULT"),
}
try:
    base["rollback"] = json.loads(os.getenv("ROLLBACK_JSON") or "{}")
except Exception:
    base["rollbackRaw"] = os.getenv("ROLLBACK_JSON")
print(json.dumps(base, ensure_ascii=False))
PY
  exit 0
fi

export RESULT
CANARY_OK="$("$ENGINE/.venv/bin/python" - <<'PY'
import json, os
data=json.loads(os.environ["RESULT"])
print("1" if data.get("ok") else "0")
PY
)"

if [[ "$CANARY_OK" != "1" ]]; then
  ROLLBACK_JSON="$(rollback)"
  export ROLLBACK_JSON
  "$ENGINE/.venv/bin/python" - <<'PY'
import json, os
data=json.loads(os.environ["RESULT"])
try:
    data["rollback"]=json.loads(os.environ.get("ROLLBACK_JSON") or "{}")
except Exception:
    data["rollbackRaw"]=os.environ.get("ROLLBACK_JSON")
data["classification"]="DAY7B_25_SYMBOL_LIVE_CANARY_FAILED_AUTO_ROLLED_BACK"
data["autoRollbackExecuted"]=True
print(json.dumps(data, ensure_ascii=False))
PY
else
  "$ENGINE/.venv/bin/python" - <<'PY'
import json, os
data=json.loads(os.environ["RESULT"])
data["autoRollbackExecuted"]=False
print(json.dumps(data, ensure_ascii=False))
PY
fi
'@

$bash=$bash.Replace("__STAMP__",$stamp)
$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD 25-SYMBOL AUTO-ROLLBACK CANARY ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Canary upload failed"}

Write-Host ""
Write-Host "=== RUN CONTROLLED 25-SYMBOL LIVE CANARY ===" -ForegroundColor Green
Write-Host "Only market-stream unit symbols change. Auto-rollback on failure." -ForegroundColor Yellow
Write-Host "Observation window: approximately 75 seconds." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote canary command failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6K DAY 7B 25-SYMBOL LIVE CANARY",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "OLD_PID=$($r.oldPid)",
 "NEW_PID=$($r.newPid)",
 "PID_CHANGED=$($r.pidChanged)",
 "SERVICE_ACTIVE=$($r.serviceActive)",
 "NRESTARTS_ZERO=$($r.nRestartsZero)",
 "CONFIGURED_SYMBOL_COUNT=$($r.configuredSymbolCount)",
 "CONFIGURED_SYMBOLS_VERIFIED=$($r.configuredSymbolsVerified)",
 "INSTRUMENT_MAPPINGS=$($r.instrumentMappings)",
 "RAW_GROWTH=$($r.rawGrowth)",
 "EVENT_GROWTH=$($r.eventGrowth)",
 "MARKET_STATE_SYMBOL_COUNT=$($r.marketStateSymbolCount)",
 "CANDLE_SYMBOL_COUNT=$($r.candleSymbolCount)",
 "SCANNER_SYMBOL_COUNT=$($r.scannerSymbolCount)",
 "PROCESS_RSS_KB=$($r.processRssKilobytes)",
 "LAST_ERROR=$($r.lastError)",
 "AUTO_ROLLBACK_EXECUTED=$($r.autoRollbackExecuted)",
 "ROLLBACK_SNAPSHOT=$($r.rollbackSnapshot)",
 "PAPER_TOUCHED=$($r.paperTouched)",
 "API_APP_TOUCHED=$($r.apiAppTouched)",
 "STRATEGY_ENGINE_TOUCHED=$($r.strategyEngineTouched)",
 "TELEGRAM_TOUCHED=$($r.telegramTouched)",
 "CLIENT_GATES_TOUCHED=$($r.clientGatesTouched)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6K_DAY7B_25_SYMBOL_CANARY_$stamp.md"
@"
# S10.6K Day 7B 25-Symbol Live Canary

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- PID changed: $($r.pidChanged)
- Service active: $($r.serviceActive)
- NRestarts zero: $($r.nRestartsZero)
- Configured symbols: $($r.configuredSymbolCount)
- Instrument mappings: $($r.instrumentMappings)
- Raw growth: $($r.rawGrowth)
- Event growth: $($r.eventGrowth)
- Market-state symbols: $($r.marketStateSymbolCount)
- Candle symbols: $($r.candleSymbolCount)
- Scanner symbols: $($r.scannerSymbolCount)
- Process RSS KB: $($r.processRssKilobytes)
- Last error: $($r.lastError)
- Auto rollback executed: $($r.autoRollbackExecuted)

Safety:
- scanner remains research-only;
- no strategy cutover;
- no client cutover;
- no Telegram cutover;
- no paper action;
- no app.py change.

Rollback snapshot:
$($r.rollbackSnapshot)
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6K 25-SYMBOL CANARY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Old PID: $($r.oldPid)"
Write-Host "New PID: $($r.newPid)"
Write-Host "PID changed: $($r.pidChanged)"
Write-Host "Service active: $($r.serviceActive)"
Write-Host "NRestarts zero: $($r.nRestartsZero)"
Write-Host "Configured symbols: $($r.configuredSymbolCount)"
Write-Host "Instrument mappings: $($r.instrumentMappings)"
Write-Host "Raw growth: $($r.rawGrowth)"
Write-Host "Event growth: $($r.eventGrowth)"
Write-Host "Market-state symbols: $($r.marketStateSymbolCount)"
Write-Host "Candle symbols: $($r.candleSymbolCount)"
Write-Host "Scanner symbols: $($r.scannerSymbolCount)"
Write-Host "Process RSS KB: $($r.processRssKilobytes)"
Write-Host "Last error: $($r.lastError)"
Write-Host "Auto rollback executed: $($r.autoRollbackExecuted)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
Write-Host "Rollback snapshot: $($r.rollbackSnapshot)"

if(-not $r.ok){
  throw "25-symbol canary failed. Check whether automatic rollback completed."
}
