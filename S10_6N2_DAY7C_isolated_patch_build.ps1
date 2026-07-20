param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
New-Item -ItemType Directory -Force -Path $Audit|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6N2_DAY7C_PATCH_BUILD_raw_$stamp.json"
$report=Join-Path $Audit "S10_6N2_DAY7C_PATCH_BUILD_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6n2_day7c_patch_$stamp.sh"
$remoteSh="/tmp/s10_6n2_day7c_patch_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail
ENGINE="/opt/skilledge/stock-engine"
WORK="/tmp/s10_6n2_day7c_patch___STAMP__"
SRC="$WORK/app/market_data"
TESTS="$WORK/tests"
rm -rf "$WORK"
mkdir -p "$SRC" "$TESTS"
cp "$ENGINE/app/market_data/candle_engine.py" "$SRC/candle_engine.py"
cp "$ENGINE/app/market_data/contracts.py" "$SRC/contracts.py"
cp "$ENGINE/app/market_data/__init__.py" "$SRC/__init__.py"
touch "$WORK/app/__init__.py"

cat > "$WORK/patch.py" <<'PY'
from pathlib import Path
import re

path=Path("__WORK__/app/market_data/candle_engine.py")
text=path.read_text(encoding="utf-8")

def sub1(pattern, repl, label, flags=0):
    global text
    text2, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 replacement, got {count}")
    text = text2

sub1(
    r"from\s+datetime\s+import\s+([^\n\r]+)",
    lambda m: "from datetime import " + (m.group(1).strip() if "timedelta" in m.group(1) else m.group(1).strip() + ", timedelta"),
    "datetime import",
)

sub1(
    r"(?m)^(\s*)self\._last_trade_at:\s*datetime\s*\|\s*None\s*=\s*None\s*$",
    lambda m: f"{m.group(1)}self._last_trade_at: datetime | None = None\n{m.group(1)}self._last_trade_at_by_symbol: dict[str, datetime] = {{}}",
    "constructor timestamp",
)

sub1(
    r"(?m)^(\s*)self\._last_trade_at\s*=\s*event\.event_time\s*$",
    lambda m: f"{m.group(1)}self._last_trade_at = event.event_time\n{m.group(1)}self._last_trade_at_by_symbol[event.symbol] = event.event_time",
    "apply timestamp",
)

sub1(
    r'''(?mx)
^(\s*)age\s*=\s*None\s*\n
\1active_trade\s*=\s*self\._active\.get\(\(symbol,\s*["']1s["']\)\)\s*\n
\1if\s+active_trade\s+is\s+not\s+None:\s*\n
\1\s+age\s*=\s*\(generated\s*-\s*active_trade\.end\)\.total_seconds\(\)\s*$
''',
    lambda m: (
        f"{m.group(1)}age = None\n"
        f"{m.group(1)}symbol_last_trade_at = self._last_trade_at_by_symbol.get(symbol)\n"
        f"{m.group(1)}if symbol_last_trade_at is not None:\n"
        f"{m.group(1)}    age = max(0.0, (generated - symbol_last_trade_at).total_seconds())"
    ),
    "age calculation",
)

sub1(
    r'''(?mx)
^(\s*)self\._opening_range\[symbol\]\s*=\s*\{\s*\n
\1\s*["']high["']:\s*None,\s*\n
\1\s*["']low["']:\s*None,\s*\n
\1\s*["']complete["']:\s*False,\s*\n
\1\}\s*$
''',
    lambda m: (
        f'{m.group(1)}self._opening_range[symbol] = {{\n'
        f'{m.group(1)}    "high": None,\n'
        f'{m.group(1)}    "low": None,\n'
        f'{m.group(1)}    "complete": False,\n'
        f'{m.group(1)}}}\n'
        f'{m.group(1)}self._last_trade_at_by_symbol.pop(symbol, None)\n'
        f'{m.group(1)}for key in [key for key in self._active if key[0] == symbol]:\n'
        f'{m.group(1)}    self._active.pop(key, None)\n'
        f'{m.group(1)}for key in [key for key in self._closed if key[0] == symbol]:\n'
        f'{m.group(1)}    self._closed.pop(key, None)'
    ),
    "rollover cleanup",
)

hydrate = r'''
    def hydrate_from_snapshot(self, snapshot: dict[str, Any] | None) -> int:
        if not isinstance(snapshot, dict):
            return 0
        generated_raw = snapshot.get("generatedAt")
        try:
            generated = datetime.fromisoformat(str(generated_raw).replace("Z", "+00:00"))
        except Exception:
            generated = datetime.now(timezone.utc)
        current_date = generated.astimezone(NEW_YORK).date().isoformat()
        symbols = snapshot.get("symbols")
        if not isinstance(symbols, dict):
            return 0
        restored = 0
        with self._lock:
            for symbol, data in symbols.items():
                if not isinstance(data, dict) or data.get("tradingDateNy") != current_date:
                    continue
                volume = int(data.get("sessionVolume") or 0)
                vwap_raw = data.get("vwap")
                self._session_date[symbol] = current_date
                self._cum_volume[symbol] = volume
                self._cum_pv[symbol] = Decimal(str(vwap_raw)) * Decimal(volume) if volume > 0 and vwap_raw is not None else Decimal("0")
                if data.get("highOfDay") is not None:
                    self._hod[symbol] = Decimal(str(data.get("highOfDay")))
                if data.get("lowOfDay") is not None:
                    self._lod[symbol] = Decimal(str(data.get("lowOfDay")))
                opening = data.get("openingRange5m") or {}
                self._opening_range[symbol] = {
                    "high": Decimal(str(opening.get("high"))) if opening.get("high") is not None else None,
                    "low": Decimal(str(opening.get("low"))) if opening.get("low") is not None else None,
                    "complete": bool(opening.get("complete")),
                }
                age = data.get("lastTradeAgeSeconds")
                if isinstance(age, (int, float)):
                    last_trade = generated - timedelta(seconds=max(0.0, float(age)))
                    self._last_trade_at_by_symbol[symbol] = last_trade
                    if self._last_trade_at is None or last_trade > self._last_trade_at:
                        self._last_trade_at = last_trade
                restored += 1
        return restored

'''

sub1(r"(?m)^(\s*)def\s+_apply_interval\s*\(", lambda m: hydrate + f"{m.group(1)}def _apply_interval(", "hydrate insertion")
path.write_text(text, encoding="utf-8")
PY

sed -i "s#__WORK__#$WORK#g" "$WORK/patch.py"
"$ENGINE/.venv/bin/python" "$WORK/patch.py"

cat > "$TESTS/test_day7c_patch.py" <<'PY'
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from app.market_data.candle_engine import CandleIndicatorEngine
from app.market_data.contracts import EventType, MarketEvent, TradePayload

def ev(symbol, when, price, size=100):
    return MarketEvent(
        event_id=str(uuid4()), provider="test", dataset="EQUS.MINI",
        event_type=EventType.TRADE, symbol=symbol, instrument_id=1,
        event_time=when, receive_time=when, latency_ms=0.0,
        source_record_type="test",
        payload=TradePayload(price=Decimal(str(price)), size=size, side=None, action="T", flags=()),
    )

def test_age_never_negative():
    e=CandleIndicatorEngine()
    trade=datetime(2026,7,17,14,25,23,500000,tzinfo=timezone.utc)
    generated=datetime(2026,7,17,14,25,23,100000,tzinfo=timezone.utc)
    e.apply(ev("AAPL",trade,"330.5"))
    assert e.snapshot(generated)["symbols"]["AAPL"]["lastTradeAgeSeconds"] == 0.0

def test_rollover_clears_old_state():
    e=CandleIndicatorEngine()
    e.apply(ev("AAPL",datetime(2026,7,17,19,59,59,tzinfo=timezone.utc),"100"))
    second=datetime(2026,7,18,13,30,1,tzinfo=timezone.utc)
    e.apply(ev("AAPL",second,"200"))
    row=e.snapshot(second)["symbols"]["AAPL"]
    assert row["tradingDateNy"] == "2026-07-18"
    assert row["sessionVolume"] == 100
    assert row["highOfDay"] == "200"
    assert row["lowOfDay"] == "200"

def test_hydrate_restores_core_context():
    source=CandleIndicatorEngine()
    t1=datetime(2026,7,17,13,30,10,tzinfo=timezone.utc)
    t2=datetime(2026,7,17,13,34,50,tzinfo=timezone.utc)
    generated=datetime(2026,7,17,13,35,1,tzinfo=timezone.utc)
    source.apply(ev("AAPL",t1,"100",50))
    source.apply(ev("AAPL",t2,"102",50))
    snap=source.snapshot(generated)
    restored=CandleIndicatorEngine()
    assert restored.hydrate_from_snapshot(snap) == 1
    row=restored.snapshot(datetime(2026,7,17,13,35,2,tzinfo=timezone.utc))["symbols"]["AAPL"]
    assert row["sessionVolume"] == 100
    assert row["vwap"] == "101"
    assert row["highOfDay"] == "102"
    assert row["lowOfDay"] == "100"
    assert row["openingRange5m"]["complete"] is True
    assert row["lastTradeAgeSeconds"] >= 0
PY

set +e
"$ENGINE/.venv/bin/python" -m py_compile "$SRC/candle_engine.py" > "$WORK/compile.txt" 2>&1
COMPILE_RC=$?
PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m pytest -q "$TESTS" > "$WORK/tests.txt" 2>&1
TEST_RC=$?
set -e

export WORK COMPILE_RC TEST_RC
"$ENGINE/.venv/bin/python" - <<'PY'
import hashlib, json, os
from pathlib import Path
w=Path(os.environ["WORK"])
p=w/"app/market_data/candle_engine.py"
h=hashlib.sha256(p.read_bytes()).hexdigest()
compile_rc=int(os.environ["COMPILE_RC"])
test_rc=int(os.environ["TEST_RC"])
ok=compile_rc==0 and test_rc==0
print(json.dumps({
  "ok":ok,
  "classification":"DAY7C_SCOPED_PATCH_BUILD_TESTED" if ok else "DAY7C_SCOPED_PATCH_TEST_FAILED",
  "productionMutation":False,
  "serviceRestarted":False,
  "compileReturnCode":compile_rc,
  "testReturnCode":test_rc,
  "compileOutput":(w/"compile.txt").read_text(errors="replace"),
  "testOutput":(w/"tests.txt").read_text(errors="replace"),
  "patchedCandleEngineSha256":h,
  "nextAction":"REVIEW_AND_DEPLOY_SCOPED_PATCH" if ok else "FIX_PATCH_IN_ISOLATION"
},ensure_ascii=False))
PY
rm -rf "$WORK"
'@

$bash=$bash.Replace("__STAMP__",$stamp)
$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))
$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7C ISOLATED PATCH BUILD V2 ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== BUILD + TEST PATCH IN /tmp ONLY ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no production mutation." -ForegroundColor Yellow
$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote isolated build failed before structured result"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json
@(
 "S10.6N2 DAY 7C ISOLATED PATCH BUILD",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "COMPILE_RETURN_CODE=$($r.compileReturnCode)",
 "TEST_RETURN_CODE=$($r.testReturnCode)",
 "PATCHED_SHA256=$($r.patchedCandleEngineSha256)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "COMPILE_OUTPUT=$($r.compileOutput)",
 "TEST_OUTPUT=$($r.testOutput)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6N2 DAY 7C PATCH BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Compile return code: $($r.compileReturnCode)"
Write-Host "Test return code: $($r.testReturnCode)"
Write-Host "Test output:"
Write-Host $r.testOutput
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
if(-not $r.ok){throw "Isolated Day 7C patch tests failed"}
