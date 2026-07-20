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
$BackendRoot = Join-Path $ProjectRoot "services\stock-engine"
$MarketRoot = Join-Path $BackendRoot "app\market_data"
$SystemdRoot = Join-Path $BackendRoot "ops\systemd"
$TestsRoot = Join-Path $BackendRoot "tests"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$StageRoot = Join-Path $AuditRoot "S10_6C_DAY3_LF_stage_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6C_DAY3_LF_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6C_DAY3_LF_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6c_day3_deploy_$stamp.sh"
$remoteSh = "/tmp/s10_6c_day3_deploy_$stamp.sh"
$remoteStage = "/tmp/s10_6c_day3_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6C_DAY3_$stamp"

foreach ($dir in @($StageRoot, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$requiredFiles = @(
    (Join-Path $MarketRoot "__init__.py"),
    (Join-Path $MarketRoot "contracts.py"),
    (Join-Path $MarketRoot "provider.py"),
    (Join-Path $MarketRoot "databento_adapter.py"),
    (Join-Path $MarketRoot "stream_service.py"),
    (Join-Path $SystemdRoot "skilledge-market-stream.service"),
    (Join-Path $TestsRoot "test_market_data_contracts.py"),
    (Join-Path $TestsRoot "test_market_stream_service.py")
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file missing: $file"
    }
}

Write-Host ""
Write-Host "=== LOCAL COMPILE + UNIT TESTS ===" -ForegroundColor Green

Push-Location $BackendRoot
try {
    python -m py_compile `
        app\market_data\contracts.py `
        app\market_data\provider.py `
        app\market_data\databento_adapter.py `
        app\market_data\stream_service.py `
        tests\test_market_data_contracts.py `
        tests\test_market_stream_service.py

    if ($LASTEXITCODE -ne 0) {
        throw "Local py_compile failed."
    }

    python -m unittest `
        tests.test_market_data_contracts `
        tests.test_market_stream_service `
        -v

    if ($LASTEXITCODE -ne 0) {
        throw "Local unit tests failed."
    }
}
finally {
    Pop-Location
}

$stageApp = Join-Path $StageRoot "app\market_data"
$stageSystemd = Join-Path $StageRoot "systemd"

New-Item -ItemType Directory -Force -Path $stageApp, $stageSystemd | Out-Null

foreach ($name in @(
    "__init__.py",
    "contracts.py",
    "provider.py",
    "databento_adapter.py",
    "stream_service.py"
)) {
    Copy-Item -LiteralPath (Join-Path $MarketRoot $name) -Destination $stageApp -Force
}

Copy-Item `
    -LiteralPath (Join-Path $SystemdRoot "skilledge-market-stream.service") `
    -Destination $stageSystemd `
    -Force

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
STAGE="__REMOTE_STAGE__"
BACKUP="__REMOTE_BACKUP__"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
LOG="/tmp/s10_6c_day3_install___STAMP__.log"

emit_error() {
  local code="$1"
  local line="$2"

  export code line LOG

  python3 - <<'PY'
import json
import os
from pathlib import Path

log_path = Path(os.environ["LOG"])
log_text = ""
if log_path.exists():
    log_text = log_path.read_text(encoding="utf-8", errors="replace")[-12000:]

print(json.dumps({
    "ok": False,
    "classification": "DAY3_DEPLOY_ERROR",
    "exitCode": int(os.environ["code"]),
    "errorLine": int(os.environ["line"]),
    "installLogTail": log_text,
}, ensure_ascii=False))
PY
}

trap 'code=$?; line=$LINENO; emit_error "$code" "$line"; exit 0' ERR

mkdir -p \
  "$ENGINE/app/market_data" \
  "$ENGINE/data" \
  "$BACKUP/app/market_data" \
  "$BACKUP/systemd"

for file in \
  __init__.py \
  contracts.py \
  provider.py \
  databento_adapter.py \
  stream_service.py
do
  if [[ -f "$ENGINE/app/market_data/$file" ]]; then
    cp -a \
      "$ENGINE/app/market_data/$file" \
      "$BACKUP/app/market_data/$file"
  fi
done

if [[ -f "$UNIT" ]]; then
  cp -a "$UNIT" "$BACKUP/systemd/skilledge-market-stream.service"
fi

{
  echo "Installing Databento SDK..."
  "$ENGINE/.venv/bin/pip" install \
    --disable-pip-version-check \
    --no-input \
    databento==0.81.0

  echo "Compiling staged source..."
  "$ENGINE/.venv/bin/python" -m py_compile \
    "$STAGE/app/market_data/__init__.py" \
    "$STAGE/app/market_data/contracts.py" \
    "$STAGE/app/market_data/provider.py" \
    "$STAGE/app/market_data/databento_adapter.py" \
    "$STAGE/app/market_data/stream_service.py"

  echo "Installing scoped files..."
  install -m 0644 \
    "$STAGE/app/market_data/__init__.py" \
    "$ENGINE/app/market_data/__init__.py"

  install -m 0644 \
    "$STAGE/app/market_data/contracts.py" \
    "$ENGINE/app/market_data/contracts.py"

  install -m 0644 \
    "$STAGE/app/market_data/provider.py" \
    "$ENGINE/app/market_data/provider.py"

  install -m 0644 \
    "$STAGE/app/market_data/databento_adapter.py" \
    "$ENGINE/app/market_data/databento_adapter.py"

  install -m 0644 \
    "$STAGE/app/market_data/stream_service.py" \
    "$ENGINE/app/market_data/stream_service.py"

  install -m 0644 \
    "$STAGE/systemd/skilledge-market-stream.service" \
    "$UNIT"

  echo "Starting systemd service..."
  systemctl daemon-reload
  systemctl enable skilledge-market-stream.service
  systemctl restart skilledge-market-stream.service
} >"$LOG" 2>&1

sleep 18

export ENGINE BACKUP UNIT LOG

python3 - <<'PY'
import json
import subprocess
from pathlib import Path

engine = Path("/opt/skilledge/stock-engine")
status_path = engine / "data" / "market_stream_status.json"

service = subprocess.run(
    [
        "systemctl",
        "show",
        "skilledge-market-stream.service",
        "--property=ActiveState,SubState,Result,MainPID,NRestarts",
    ],
    capture_output=True,
    text=True,
    check=False,
)

journal = subprocess.run(
    [
        "journalctl",
        "-u",
        "skilledge-market-stream.service",
        "-n",
        "50",
        "--no-pager",
    ],
    capture_output=True,
    text=True,
    check=False,
)

install_log_path = Path("/tmp/s10_6c_day3_install___STAMP__.log")
install_log = ""
if install_log_path.exists():
    install_log = install_log_path.read_text(
        encoding="utf-8",
        errors="replace",
    )[-12000:]

status = None
status_error = None

if status_path.exists():
    try:
        status = json.loads(status_path.read_text(encoding="utf-8"))
    except Exception as exc:
        status_error = repr(exc)

raw_total = 0
canonical_total = 0

if isinstance(status, dict):
    for value in (status.get("rawRecordCounts") or {}).values():
        raw_total += int(value)

    for value in (status.get("marketEventCounts") or {}).values():
        canonical_total += int(value)

service_text = service.stdout.strip()
service_active = "ActiveState=active" in service_text
status_exists = status_path.exists()

ok = (
    service_active
    and status_exists
    and isinstance(status, dict)
    and raw_total > 0
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DATABENTO_CANARY_STREAM_RUNNING"
        if ok
        else "DATABENTO_CANARY_STREAM_RUNTIME_GATE_FAILED"
    ),
    "serviceActive": service_active,
    "serviceShow": service_text,
    "statusFileExists": status_exists,
    "statusParseError": status_error,
    "status": status,
    "rawRecordTotal": raw_total,
    "canonicalEventTotal": canonical_total,
    "journalTail": journal.stdout[-12000:],
    "installLogTail": install_log,
    "rollbackSnapshot": "__REMOTE_BACKUP__",
    "paperTouched": False,
    "apiAppTouched": False,
    "telegramTouched": False,
    "clientGatesTouched": False,
}, ensure_ascii=False))
PY

rm -rf "$STAGE"
rm -f "$LOG"
'@

$bash = $bash.Replace("__REMOTE_STAGE__", $remoteStage)
$bash = $bash.Replace("__REMOTE_BACKUP__", $remoteBackup)
$bash = $bash.Replace("__STAMP__", $stamp)
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
Write-Host "=== CREATE REMOTE STAGE ===" -ForegroundColor Green

& ssh @sshArgs $VpsHost "mkdir -p '$remoteStage/app/market_data' '$remoteStage/systemd'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote stage creation failed."
}

Write-Host ""
Write-Host "=== UPLOAD SCOPED FILES ===" -ForegroundColor Green

& scp @sshArgs "$stageApp\*" "${VpsHost}:$remoteStage/app/market_data/"
if ($LASTEXITCODE -ne 0) {
    throw "Market-data upload failed."
}

& scp @sshArgs `
    "$stageSystemd\skilledge-market-stream.service" `
    "${VpsHost}:$remoteStage/systemd/"
if ($LASTEXITCODE -ne 0) {
    throw "Systemd upload failed."
}

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Unix deploy-script upload failed."
}

Write-Host ""
Write-Host "=== EXECUTE DAY 3 SCOPED DEPLOY ===" -ForegroundColor Green

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Remote Day 3 command failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Day 3 deploy returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8

try {
    $result = $resultText | ConvertFrom-Json
}
catch {
    throw "Could not parse Day 3 result JSON. Inspect: $RawPath"
}

$status = $result.status

$report = @(
    "S10.6C DAY 3 PRODUCTION DATABENTO CANARY STREAM - LF SAFE",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "STATUS_FILE_EXISTS=$($result.statusFileExists)",
    "STATUS=$($status.status)",
    "DATASET=$($status.dataset)",
    "SCHEMA=$($status.schema)",
    "SYMBOLS=$(@($status.symbols) -join ',')",
    "RAW_RECORD_TOTAL=$($result.rawRecordTotal)",
    "CANONICAL_EVENT_TOTAL=$($result.canonicalEventTotal)",
    "LAST_RECORD_AT=$($status.lastRecordAt)",
    "LAST_MARKET_EVENT_AT=$($status.lastMarketEventAt)",
    "RECONNECT_COUNT=$($status.reconnectCount)",
    "LAST_ERROR=$($status.lastError)",
    "ROLLBACK_SNAPSHOT=$($result.rollbackSnapshot)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "TELEGRAM_TOUCHED=$($result.telegramTouched)",
    "CLIENT_GATES_TOUCHED=$($result.clientGatesTouched)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path `
    $MilestonesRoot `
    "S10_6C_DAY3_MARKET_STREAM_$stamp.md"

@"
# S10.6C Day 3 Production Databento Canary Stream

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Service active: $($result.serviceActive)
- Status: $($status.status)
- Dataset/schema: $($status.dataset) / $($status.schema)
- Symbols: $(@($status.symbols) -join ',')
- Raw records: $($result.rawRecordTotal)
- Canonical events: $($result.canonicalEventTotal)
- Last record: $($status.lastRecordAt)
- Last canonical event: $($status.lastMarketEventAt)
- Reconnect count: $($status.reconnectCount)
- Last error: $($status.lastError)

Production changes:
- installed databento==0.81.0 in the production venv;
- deployed the canonical market-data contracts and Databento adapter;
- installed and enabled skilledge-market-stream.service;
- started the AAPL/MSFT canary stream.

Not changed:
- app.py;
- scanner;
- strategy engine;
- paper account;
- Telegram;
- client gates;
- payments.

Rollback snapshot:
$($result.rollbackSnapshot)

Next:
Day 4 stream reliability and restart-recovery proof.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6C DAY 3 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Service active: $($result.serviceActive)"
Write-Host "Status: $($status.status)"
Write-Host "Raw records: $($result.rawRecordTotal)"
Write-Host "Canonical events: $($result.canonicalEventTotal)"
Write-Host "Last canonical event: $($status.lastMarketEventAt)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    Write-Host ""
    Write-Host "=== JOURNAL TAIL ===" -ForegroundColor Yellow
    Write-Host $result.journalTail
    Write-Host ""
    Write-Host "=== INSTALL LOG TAIL ===" -ForegroundColor Yellow
    Write-Host $result.installLogTail

    throw "Day 3 runtime gate failed. Inspect the report and raw JSON."
}
