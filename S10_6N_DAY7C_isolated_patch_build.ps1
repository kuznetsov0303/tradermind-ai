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
$raw=Join-Path $Audit "S10_6N_DAY7C_PATCH_BUILD_raw_$stamp.json"
$report=Join-Path $Audit "S10_6N_DAY7C_PATCH_BUILD_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6n_day7c_patch_build_$stamp.sh"
$remoteSh="/tmp/s10_6n_day7c_patch_build_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
STAMP="__STAMP__"
WORK="/tmp/s10_6n_day7c_patch_$STAMP"
SRC="$WORK/app/market_data"
TESTS="$WORK/tests"
mkdir -p "$SRC" "$TESTS"

cp "$ENGINE/app/market_data/candle_engine.py" "$SRC/candle_engine.py"
cp "$ENGINE/app/market_data/contracts.py" "$SRC/contracts.py"
cp "$ENGINE/app/market_data/__init__.py" "$SRC/__init__.py"
touch "$WORK/app/__init__.py"

cat > "$WORK/patch.py" <<'PY'
from pathlib import Path

path=Path("__WORK__/app/market_data/candle_engine.py")
text=path.read_text(encoding="utf-8")

replacements = []
replacements.append((
"""        self._applied_trades = 0
        self._last_trade_at: datetime | None = None
""",
"""        self._applied_trades = 0
        self._last_trade_at: datetime | None = None
        self._last_trade_at_by_symbol: dict[str, datetime] = {}
"""))

replacements.append((
"""            self._applied_trades += 1
            self._last_trade_at = event.event_time
""",
"""            self._applied_trades += 1
            self._last_trade_at = event.event_time
            self._last_trade_at_by_symbol[event.symbol] = event.event_time
"""))

replacements.append((
"""        age = None
        active_trade = self._active.get((symbol, \"1s\"))
        if active_trade is not None:
            age = (generated - active_trade.end).total_seconds()
""",
"""        age = None
        symbol_last_trade_at = self._last_trade_at_by_symbol.get(symbol)
        if symbol_last_trade_at is not None:
            age = max(
                0.0,
                (generated - symbol_last_trade_at).total_seconds(),
            )
"""))

replacements.append((
"""        self._opening_range[symbol] = {
            \"high\": None,
            \"low\": None,
            \"complete\": False,
        }
""",
"""        self._opening_range[symbol] = {
            \"high\": None,
            \"low\": None,
            \"complete\": False,
        }
        self._last_trade_at_by_symbol.pop(symbol, None)

        for key in [key for key in self._active if key[0] == symbol]:
            self._active.pop(key, None)

        for key in [key for key in self._closed if key[0] == symbol]:
            self._closed.pop(key, None)
"""))

replacements.append((
"from datetime import datetime, time, timezone\n",
"from datetime import datetime, time, timedelta, timezone\n"))

for old,new in replacements:
    if old not in text:
        raise SystemExit(f"patch anchor not found: {old[:80]!r}")
    text=text.replace(old,new,1)

anchor="    def _apply_interval(\n"
if anchor not in text:
    raise SystemExit("hydrate insertion anchor not found")

hydrate='''    def hydrate_from_snapshot(
        self,
        snapshot: dict[str, Any] | None,
    ) -> int:
        if not isinstance(snapshot, dict):
            return 0

        generated_raw = snapshot.get("generatedAt")
        try:
            generated = datetime.fromisoformat(
                str(generated_raw).replace("Z", "+00:00")
            )
        except Exception:
            generated = datetime.now(timezone.utc)

        current_date = generated.astimezone(NEW_YORK).date().isoformat()
        symbols = snapshot.get("symbols")
        if not isinstance(symbols, dict):
            return 0

        restored = 0
        with self._lock:
            for symbol, data in symbols.items():
                if not isinstance(data, dict):
                    continue
                if data.get("tradingDateNy") != current_date:
                    continue

                volume = int(data.get("sessionVolume") or 0)
                vwap_raw = data.get("vwap")
                hod_raw = data.get("highOfDay")
                lod_raw = data.get("lowOfDay")

                self._session_date[symbol] = current_date
                self._cum_volume[symbol] = volume
                self._cum_pv[symbol] = (
                    Decimal(str(vwap_raw)) * Decimal(volume)
                    if volume > 0 and vwap_raw is not None
                    else Decimal("0")
                )

                if hod_raw is not None:
                    self._hod[symbol] = Decimal(str(hod_raw))
                if lod_raw is not None:
                    self._lod[symbol] = Decimal(str(lod_raw))

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

                intervals = data.get("intervals") or {}
                for interval in INTERVALS:
                    block = intervals.get(interval) or {}
                    active = block.get("active")
                    if isinstance(active, dict):
                        candle = candle_from_snapshot(active)
                        if candle is not None:
                            self._active[(symbol, interval)] = candle

                    restored_closed = []
                    for item in block.get("recentClosed") or []:
                        candle = candle_from_snapshot(item)
                        if candle is not None:
                            restored_closed.append(candle)
                    if restored_closed:
                        self._closed[(symbol, interval)] = restored_closed

                restored += 1

            self._applied_trades = int(snapshot.get("appliedTrades") or self._applied_trades)

        return restored

'''
text=text.replace(anchor,hydrate+anchor,1)

helper_anchor="def floor_time(value: datetime, seconds: int) -> datetime:\n"
if helper_anchor not in text:
    raise SystemExit("helper anchor not found")

helper='''def candle_from_snapshot(data: dict[str, Any]) -> Candle | None:
    try:
        return Candle(
            symbol=str(data["symbol"]),
            interval=str(data["interval"]),
            start=datetime.fromisoformat(str(data["start"]).replace("Z", "+00:00")),
            end=datetime.fromisoformat(str(data["end"]).replace("Z", "+00:00")),
            open=Decimal(str(data["open"])),
            high=Decimal(str(data["high"])),
            low=Decimal(str(data["low"])),
            close=Decimal(str(data["close"])),
            volume=int(data.get("volume") or 0),
            trade_count=int(data.get("tradeCount") or 0),
            complete=bool(data.get("complete")),
        )
    except Exception:
        return None


'''
text=text.replace(helper_anchor,helper+helper_anchor,1)
path.write_text(text,encoding="utf-8")
PY

sed -i "s#__WORK__#$WORK#g" "$WORK/patch.py"
"$ENGINE/.venv/bin/python" "$WORK/patch.py"

cat > "$TESTS/test_day7c_restart_continuity.py" <<'PY'
from datetime import datetime, timezone
from decimal import Decimal

from app.market_data.candle_engine import CandleIndicatorEngine
from app.market_data.contracts import EventType, MarketEvent, TradePayload


def event(symbol, when, price, size=100):
    return MarketEvent(
        event_id=f"{symbol}-{when.isoformat()}",
        provider="test",
        dataset="EQUS.MINI",
        event_type=EventType.TRADE,
        symbol=symbol,
        instrument_id=1,
        event_time=when,
        receive_time=when,
        latency_ms=0.0,
        source_record_type="test",
        payload=TradePayload(price=Decimal(str(price)), size=size, side=None, action="T", flags=[]),
    )


def test_last_trade_age_is_never_negative():
    engine=CandleIndicatorEngine()
    t=datetime(2026,7,17,14,25,23,500000,tzinfo=timezone.utc)
    engine.apply(event("AAPL",t,"330.50"))
    snap=engine.snapshot(datetime(2026,7,17,14,25,23,100000,tzinfo=timezone.utc))
    assert snap["symbols"]["AAPL"]["lastTradeAgeSeconds"] == 0.0


def test_rollover_clears_prior_session_state():
    engine=CandleIndicatorEngine()
    first=datetime(2026,7,17,19,59,59,tzinfo=timezone.utc)
    second=datetime(2026,7,18,13,30,1,tzinfo=timezone.utc)
    engine.apply(event("AAPL",first,"100"))
    engine.apply(event("AAPL",second,"200"))
    row=engine.snapshot(second)["symbols"]["AAPL"]
    assert row["tradingDateNy"] == "2026-07-18"
    assert row["sessionVolume"] == 100
    assert row["highOfDay"] == "200"
    assert row["lowOfDay"] == "200"


def test_snapshot_hydration_restores_session_context():
    source=CandleIndicatorEngine()
    t1=datetime(2026,7,17,13,30,10,tzinfo=timezone.utc)
    t2=datetime(2026,7,17,13,34,50,tzinfo=timezone.utc)
    source.apply(event("AAPL",t1,"100",50))
    source.apply(event("AAPL",t2,"102",50))
    snapshot=source.snapshot(datetime(2026,7,17,13,35,1,tzinfo=timezone.utc))

    restored=CandleIndicatorEngine()
    assert restored.hydrate_from_snapshot(snapshot) == 1
    row=restored.snapshot(datetime(2026,7,17,13,35,2,tzinfo=timezone.utc))["symbols"]["AAPL"]

    assert row["sessionVolume"] == 100
    assert row["vwap"] == "101"
    assert row["highOfDay"] == "102"
    assert row["lowOfDay"] == "100"
    assert row["openingRange5m"]["high"] == "102"
    assert row["openingRange5m"]["low"] == "100"
    assert row["openingRange5m"]["complete"] is True
    assert row["lastTradeAgeSeconds"] >= 0
PY

set +e
PYTHONPATH="$WORK" "$ENGINE/.venv/bin/python" -m pytest -q "$TESTS" > "$WORK/test_output.txt" 2>&1
TEST_RC=$?
set -e

"$ENGINE/.venv/bin/python" -m py_compile "$SRC/candle_engine.py"

export WORK TEST_RC
"$ENGINE/.venv/bin/python" - <<'PY'
import hashlib, json, os
from pathlib import Path
work=Path(os.environ["WORK"])
patched=work/"app/market_data/candle_engine.py"
out=(work/"test_output.txt").read_text(encoding="utf-8",errors="replace")
h=hashlib.sha256(patched.read_bytes()).hexdigest()
ok=int(os.environ["TEST_RC"])==0
print(json.dumps({
  "ok":ok,
  "classification":"DAY7C_SCOPED_PATCH_BUILD_TESTED" if ok else "DAY7C_SCOPED_PATCH_TEST_FAILED",
  "isolatedBuild":True,
  "productionMutation":False,
  "serviceRestarted":False,
  "paperTouched":False,
  "apiAppTouched":False,
  "strategyEngineTouched":False,
  "telegramTouched":False,
  "clientGatesTouched":False,
  "testReturnCode":int(os.environ["TEST_RC"]),
  "testOutput":out,
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
Write-Host "=== UPLOAD DAY 7C ISOLATED PATCH BUILD ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== BUILD + TEST PATCH IN /tmp ONLY ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no production source mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote isolated build failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6N DAY 7C ISOLATED PATCH BUILD",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "TEST_RETURN_CODE=$($r.testReturnCode)",
 "PATCHED_SHA256=$($r.patchedCandleEngineSha256)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "TEST_OUTPUT=$($r.testOutput)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6N_DAY7C_PATCH_BUILD_$stamp.md"
@"
# S10.6N Day 7C Isolated Patch Build

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Test return code: $($r.testReturnCode)
- Patched SHA256: $($r.patchedCandleEngineSha256)
- Next action: $($r.nextAction)

Test output:

$($r.testOutput)

No production mutation.
No service restart.
No paper/client/Telegram/strategy action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6N DAY 7C PATCH BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Test return code: $($r.testReturnCode)"
Write-Host "Test output:"
Write-Host $r.testOutput
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){throw "Isolated Day 7C patch tests failed"}
