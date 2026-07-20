param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$SystemdRoot = Join-Path $ProjectRoot "services\stock-engine\ops\systemd"
$LocalTimer = Join-Path $SystemdRoot "skilledge-s10-paper-trading.timer"
$LocalService = Join-Path $SystemdRoot "skilledge-s10-paper-trading.service"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

foreach ($path in @($LocalTimer, $LocalService)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Canonical local systemd file missing: $path"
    }
}

New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RawPath = Join-Path $AuditRoot "S10_6D_RESTORE_PAPER_TIMER_raw_$stamp.json"
$ReportPath = Join-Path $AuditRoot "S10_6D_RESTORE_PAPER_TIMER_report_$stamp.txt"
$localSh = Join-Path $env:TEMP "s10_6d_restore_paper_timer_$stamp.sh"
$remoteSh = "/tmp/s10_6d_restore_paper_timer_$stamp.sh"

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$localTimerSha = Get-Sha256 $LocalTimer
$localServiceSha = Get-Sha256 $LocalService

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

TIMER_UNIT="/etc/systemd/system/skilledge-s10-paper-trading.timer"
SERVICE_UNIT="/etc/systemd/system/skilledge-s10-paper-trading.service"
TIMER_NAME="skilledge-s10-paper-trading.timer"
SERVICE_NAME="skilledge-s10-paper-trading.service"
EXPECTED_TIMER_SHA="__LOCAL_TIMER_SHA__"
EXPECTED_SERVICE_SHA="__LOCAL_SERVICE_SHA__"

if [[ ! -f "$TIMER_UNIT" ]]; then
  echo '{"ok":false,"classification":"REMOTE_TIMER_UNIT_MISSING"}'
  exit 2
fi

if [[ ! -f "$SERVICE_UNIT" ]]; then
  echo '{"ok":false,"classification":"REMOTE_SERVICE_UNIT_MISSING"}'
  exit 3
fi

REMOTE_TIMER_SHA="$(sha256sum "$TIMER_UNIT" | awk '{print $1}')"
REMOTE_SERVICE_SHA="$(sha256sum "$SERVICE_UNIT" | awk '{print $1}')"

if [[ "$REMOTE_TIMER_SHA" != "$EXPECTED_TIMER_SHA" ]]; then
  export REMOTE_TIMER_SHA EXPECTED_TIMER_SHA
  python3 - <<'PY'
import json
import os
print(json.dumps({
    "ok": False,
    "classification": "TIMER_UNIT_SHA_MISMATCH",
    "remoteTimerSha": os.environ["REMOTE_TIMER_SHA"],
    "expectedTimerSha": os.environ["EXPECTED_TIMER_SHA"],
}))
PY
  exit 4
fi

if [[ "$REMOTE_SERVICE_SHA" != "$EXPECTED_SERVICE_SHA" ]]; then
  export REMOTE_SERVICE_SHA EXPECTED_SERVICE_SHA
  python3 - <<'PY'
import json
import os
print(json.dumps({
    "ok": False,
    "classification": "SERVICE_UNIT_SHA_MISMATCH",
    "remoteServiceSha": os.environ["REMOTE_SERVICE_SHA"],
    "expectedServiceSha": os.environ["EXPECTED_SERVICE_SHA"],
}))
PY
  exit 5
fi

WINDOW_JSON="$(python3 - <<'PY'
from datetime import datetime, time
from zoneinfo import ZoneInfo
import json

now = datetime.now(ZoneInfo("America/New_York"))
weekday = now.weekday() < 5
inside = weekday and time(4, 0) <= now.time().replace(tzinfo=None) < time(15, 45)

print(json.dumps({
    "nowNewYork": now.isoformat(),
    "weekday": weekday,
    "insideEntryWindow": inside,
}))
PY
)"

INSIDE_WINDOW="$(python3 -c 'import json,sys; print(str(json.loads(sys.stdin.read())["insideEntryWindow"]).lower())' <<<"$WINDOW_JSON")"

BEFORE_TIMER="$(systemctl show "$TIMER_NAME" \
  -p LoadState -p ActiveState -p SubState -p UnitFileState -p Result \
  -p NextElapseUSecRealtime -p LastTriggerUSec --no-pager || true)"

BEFORE_SERVICE="$(systemctl show "$SERVICE_NAME" \
  -p LoadState -p ActiveState -p SubState -p Result -p ExecMainStatus \
  --no-pager || true)"

ACTION="NOOP_ALREADY_ACTIVE"
STARTED_TIMER="false"
ENABLED_TIMER="false"

if ! systemctl is-enabled --quiet "$TIMER_NAME"; then
  systemctl enable "$TIMER_NAME"
  ENABLED_TIMER="true"
fi

if ! systemctl is-active --quiet "$TIMER_NAME"; then
  if [[ "$INSIDE_WINDOW" == "true" ]]; then
    ACTION="ENABLED_BUT_START_DEFERRED_INSIDE_ENTRY_WINDOW"
  else
    systemctl start "$TIMER_NAME"
    STARTED_TIMER="true"
    ACTION="TIMER_ENABLED_AND_STARTED_OUTSIDE_ENTRY_WINDOW"
  fi
fi

sleep 3

AFTER_TIMER="$(systemctl show "$TIMER_NAME" \
  -p LoadState -p ActiveState -p SubState -p UnitFileState -p Result \
  -p NextElapseUSecRealtime -p LastTriggerUSec --no-pager || true)"

AFTER_SERVICE="$(systemctl show "$SERVICE_NAME" \
  -p LoadState -p ActiveState -p SubState -p Result -p ExecMainStatus \
  --no-pager || true)"

PAPER_STATUS="$(curl -fsS --max-time 10 http://127.0.0.1:8000/engine/paper/status || true)"

export \
  REMOTE_TIMER_SHA REMOTE_SERVICE_SHA EXPECTED_TIMER_SHA EXPECTED_SERVICE_SHA \
  WINDOW_JSON BEFORE_TIMER BEFORE_SERVICE AFTER_TIMER AFTER_SERVICE PAPER_STATUS \
  ACTION STARTED_TIMER ENABLED_TIMER

python3 - <<'PY'
import json
import os

window = json.loads(os.environ["WINDOW_JSON"])

after_timer = os.environ["AFTER_TIMER"]
timer_active = "ActiveState=active" in after_timer
timer_enabled = "UnitFileState=enabled" in after_timer

classification = os.environ["ACTION"]

ok = timer_enabled and (
    timer_active
    or classification == "ENABLED_BUT_START_DEFERRED_INSIDE_ENTRY_WINDOW"
)

paper_status = None
paper_status_error = None
raw_paper = os.environ["PAPER_STATUS"]

if raw_paper:
    try:
        paper_status = json.loads(raw_paper)
    except Exception as exc:
        paper_status_error = repr(exc)

print(json.dumps({
    "ok": ok,
    "classification": classification,
    "timerShaMatched": (
        os.environ["REMOTE_TIMER_SHA"] == os.environ["EXPECTED_TIMER_SHA"]
    ),
    "serviceShaMatched": (
        os.environ["REMOTE_SERVICE_SHA"] == os.environ["EXPECTED_SERVICE_SHA"]
    ),
    "remoteTimerSha": os.environ["REMOTE_TIMER_SHA"],
    "remoteServiceSha": os.environ["REMOTE_SERVICE_SHA"],
    "newYorkTime": window["nowNewYork"],
    "insideEntryWindow": window["insideEntryWindow"],
    "timerEnabledByScript": os.environ["ENABLED_TIMER"] == "true",
    "timerStartedByScript": os.environ["STARTED_TIMER"] == "true",
    "serviceStartedManually": False,
    "paperRunOnceExecuted": False,
    "paperResetExecuted": False,
    "beforeTimer": os.environ["BEFORE_TIMER"],
    "afterTimer": os.environ["AFTER_TIMER"],
    "beforeService": os.environ["BEFORE_SERVICE"],
    "afterService": os.environ["AFTER_SERVICE"],
    "paperStatus": paper_status,
    "paperStatusParseError": paper_status_error,
    "productionSourceChanged": False,
    "systemdUnitChanged": False,
}, ensure_ascii=False))
PY
'@

$bash = $bash.Replace("__LOCAL_TIMER_SHA__", $localTimerSha)
$bash = $bash.Replace("__LOCAL_SERVICE_SHA__", $localServiceSha)
$bash = $bash -replace "`r`n", "`n"
$bash = $bash -replace "`r", "`n"

[System.IO.File]::WriteAllText(
    $localSh,
    $bash,
    [System.Text.UTF8Encoding]::new($false)
)

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== UPLOAD SAFE PAPER-TIMER RESTORE ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Timer restore upload failed."
}

Write-Host ""
Write-Host "=== VERIFY PARITY AND RESTORE TIMER ===" -ForegroundColor Green
Write-Host "No manual paper service start / no run-once / no reset." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    $text = $resultLines -join "`n"
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        Write-Host $text
    }
    throw "Paper timer restore failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Paper timer restore returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6D SAFE PAPER TIMER RESTORE",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "TIMER_SHA_MATCHED=$($result.timerShaMatched)",
    "SERVICE_SHA_MATCHED=$($result.serviceShaMatched)",
    "NEW_YORK_TIME=$($result.newYorkTime)",
    "INSIDE_ENTRY_WINDOW=$($result.insideEntryWindow)",
    "TIMER_ENABLED_BY_SCRIPT=$($result.timerEnabledByScript)",
    "TIMER_STARTED_BY_SCRIPT=$($result.timerStartedByScript)",
    "SERVICE_STARTED_MANUALLY=$($result.serviceStartedManually)",
    "PAPER_RUN_ONCE_EXECUTED=$($result.paperRunOnceExecuted)",
    "PAPER_RESET_EXECUTED=$($result.paperResetExecuted)",
    "PRODUCTION_SOURCE_CHANGED=$($result.productionSourceChanged)",
    "SYSTEMD_UNIT_CHANGED=$($result.systemdUnitChanged)",
    "",
    "=== TIMER AFTER ===",
    $result.afterTimer,
    "",
    "=== SERVICE AFTER ===",
    $result.afterService,
    "",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "=== PAPER TIMER RESTORE COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Timer SHA matched: $($result.timerShaMatched)"
Write-Host "Service SHA matched: $($result.serviceShaMatched)"
Write-Host "New York time: $($result.newYorkTime)"
Write-Host "Inside entry window: $($result.insideEntryWindow)"
Write-Host "Timer enabled by script: $($result.timerEnabledByScript)"
Write-Host "Timer started by script: $($result.timerStartedByScript)"
Write-Host "Manual service start: $($result.serviceStartedManually)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"

if (-not $result.ok) {
    throw "Paper timer restore validation failed."
}
