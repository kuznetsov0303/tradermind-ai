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
$StreamFile = Join-Path $BackendRoot "app\market_data\stream_service.py"
$TestsRoot = Join-Path $BackendRoot "tests"
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesRoot = Join-Path $StateRoot "milestones"
$AuditRoot = Join-Path $ProjectRoot "audit_exports"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$LocalBackup = Join-Path $AuditRoot "S10_6C_DAY3_COMPRESSION_FIX_backup_$stamp"
$ReportPath = Join-Path $AuditRoot "S10_6C_DAY3_COMPRESSION_FIX_report_$stamp.txt"
$RawPath = Join-Path $AuditRoot "S10_6C_DAY3_COMPRESSION_FIX_raw_$stamp.json"
$localSh = Join-Path $env:TEMP "s10_6c_day3_compression_fix_$stamp.sh"
$remoteSh = "/tmp/s10_6c_day3_compression_fix_$stamp.sh"
$remoteStage = "/tmp/s10_6c_day3_compression_stage_$stamp"
$remoteBackup = "/opt/skilledge/stock-engine/rollback_snapshots/S10_6C_DAY3_COMPRESSION_FIX_$stamp"

foreach ($dir in @($LocalBackup, $MilestonesRoot)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if (-not (Test-Path -LiteralPath $StreamFile)) {
    throw "Local stream_service.py not found: $StreamFile"
}

Copy-Item -LiteralPath $StreamFile -Destination (Join-Path $LocalBackup "stream_service.py") -Force

Write-Host ""
Write-Host "=== PATCH LOCAL DATABENTO LIVE CONFIG ===" -ForegroundColor Green

$text = Get-Content -LiteralPath $StreamFile -Raw

$old = '                      slow_reader_behavior="skip",compression="zstd",ts_out=True)'
$new = '                      slow_reader_behavior="skip",ts_out=True)'

if ($text.Contains($old)) {
    $text = $text.Replace($old, $new)
}
elseif ($text -match 'compression\s*=\s*"zstd"\s*,?') {
    $text = [regex]::Replace(
        $text,
        'compression\s*=\s*"zstd"\s*,?',
        ''
    )
}
elseif ($text -match 'compression\s*=') {
    throw "A different compression configuration was found. Refusing blind patch."
}
else {
    Write-Host "Manual string compression parameter is already absent." -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText(
    $StreamFile,
    $text,
    [System.Text.UTF8Encoding]::new($false)
)

if ((Get-Content -LiteralPath $StreamFile -Raw) -match 'compression\s*=') {
    throw "Compression parameter still exists after patch."
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

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== CREATE REMOTE STAGE ===" -ForegroundColor Green

& ssh @sshArgs $VpsHost "mkdir -p '$remoteStage' '$remoteBackup'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote stage creation failed."
}

& scp @sshArgs $StreamFile "${VpsHost}:$remoteStage/stream_service.py"
if ($LASTEXITCODE -ne 0) {
    throw "Patched stream_service.py upload failed."
}

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
CURRENT="$ENGINE/app/market_data/stream_service.py"
STAGED="__REMOTE_STAGE__/stream_service.py"
BACKUP="__REMOTE_BACKUP__/stream_service.py"
STATUS="$ENGINE/data/market_stream_status.json"
UNIT="skilledge-market-stream.service"

emit_failure() {
    local code="$1"
    local line="$2"

    export code line ENGINE CURRENT STAGED BACKUP STATUS UNIT

    python3 - <<'PY'
import json
import os
import subprocess
from pathlib import Path

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

print(json.dumps({
    "ok": False,
    "classification": "DAY3_COMPRESSION_FIX_DEPLOY_ERROR",
    "exitCode": int(os.environ["code"]),
    "errorLine": int(os.environ["line"]),
    "serviceShow": run([
        "systemctl", "show", os.environ["UNIT"],
        "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,UnitFileState",
    ]),
    "journalTail": run([
        "journalctl", "-u", os.environ["UNIT"], "-n", "80", "--no-pager",
    ]),
    "statusFileExists": Path(os.environ["STATUS"]).exists(),
    "paperTouched": False,
    "apiAppTouched": False,
}, ensure_ascii=False))
PY
}

trap 'code=$?; line=$LINENO; emit_failure "$code" "$line"; exit 0' ERR

systemctl stop "$UNIT" || true
systemctl reset-failed "$UNIT" || true

mkdir -p "$(dirname "$BACKUP")"

if [[ -f "$CURRENT" ]]; then
    cp -a "$CURRENT" "$BACKUP"
fi

"$ENGINE/.venv/bin/python" -m py_compile "$STAGED"

if grep -Eq 'compression[[:space:]]*=' "$STAGED"; then
    echo "Compression parameter is still present in staged file" >&2
    exit 31
fi

install -m 0644 "$STAGED" "$CURRENT"

rm -f "$STATUS"

systemctl start "$UNIT"

sleep 25

export ENGINE CURRENT STAGED BACKUP STATUS UNIT

python3 - <<'PY'
import hashlib
import json
import os
import subprocess
from pathlib import Path

status_path = Path(os.environ["STATUS"])
current = Path(os.environ["CURRENT"])
backup = Path(os.environ["BACKUP"])

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def sha256(path):
    if not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

service = run([
    "systemctl", "show", os.environ["UNIT"],
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,UnitFileState",
])

journal = run([
    "journalctl", "-u", os.environ["UNIT"], "-n", "100", "--no-pager",
])

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

service_active = "ActiveState=active" in service["stdout"]
no_compression_error = "not an instance of 'Compression'" not in journal["stdout"]

ok = (
    service_active
    and status_path.exists()
    and isinstance(status, dict)
    and raw_total > 0
    and no_compression_error
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DATABENTO_CANARY_STREAM_RUNNING"
        if ok
        else "DATABENTO_CANARY_STREAM_RUNTIME_GATE_FAILED"
    ),
    "serviceActive": service_active,
    "serviceShow": service,
    "journalTail": journal,
    "statusFileExists": status_path.exists(),
    "statusParseError": status_error,
    "status": status,
    "rawRecordTotal": raw_total,
    "canonicalEventTotal": canonical_total,
    "compressionErrorAbsent": no_compression_error,
    "currentSha256": sha256(current),
    "backupSha256": sha256(backup),
    "rollbackSnapshot": str(backup.parent),
    "paperTouched": False,
    "apiAppTouched": False,
    "telegramTouched": False,
    "clientGatesTouched": False,
}, ensure_ascii=False))
PY

rm -rf "__REMOTE_STAGE__"
'@

$bash = $bash.Replace("__REMOTE_STAGE__", $remoteStage)
$bash = $bash.Replace("__REMOTE_BACKUP__", $remoteBackup)
$bash = $bash -replace "`r`n", "`n"
$bash = $bash -replace "`r", "`n"

[System.IO.File]::WriteAllText(
    $localSh,
    $bash,
    [System.Text.UTF8Encoding]::new($false)
)

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Unix fix script upload failed."
}

Write-Host ""
Write-Host "=== APPLY SCOPED COMPRESSION FIX ===" -ForegroundColor Green
Write-Host "Only skilledge-market-stream.service is stopped/restarted." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Remote compression fix failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Compression fix returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$status = $null
$statusProp = $result.PSObject.Properties["status"]
if ($null -ne $statusProp) {
    $status = $statusProp.Value
}

function Safe-Value {
    param(
        [object]$Object,
        [string]$Name,
        [string]$Default = ""
    )

    if ($null -eq $Object) {
        return $Default
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $Default
    }

    return [string]$property.Value
}

$statusName = Safe-Value $status "status" "NONE"
$dataset = Safe-Value $status "dataset"
$schema = Safe-Value $status "schema"
$lastRecordAt = Safe-Value $status "lastRecordAt"
$lastMarketEventAt = Safe-Value $status "lastMarketEventAt"
$reconnectCount = Safe-Value $status "reconnectCount" "0"
$lastError = Safe-Value $status "lastError"

$report = @(
    "S10.6C DAY 3 DATABENTO COMPRESSION FIX",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "SERVICE_ACTIVE=$($result.serviceActive)",
    "STATUS_FILE_EXISTS=$($result.statusFileExists)",
    "STATUS=$statusName",
    "DATASET=$dataset",
    "SCHEMA=$schema",
    "RAW_RECORD_TOTAL=$($result.rawRecordTotal)",
    "CANONICAL_EVENT_TOTAL=$($result.canonicalEventTotal)",
    "LAST_RECORD_AT=$lastRecordAt",
    "LAST_MARKET_EVENT_AT=$lastMarketEventAt",
    "RECONNECT_COUNT=$reconnectCount",
    "LAST_ERROR=$lastError",
    "COMPRESSION_ERROR_ABSENT=$($result.compressionErrorAbsent)",
    "CURRENT_SHA256=$($result.currentSha256)",
    "BACKUP_SHA256=$($result.backupSha256)",
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
    "S10_6C_DAY3_COMPRESSION_FIX_$stamp.md"

@"
# S10.6C Day 3 Databento Compression Fix

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Service active: $($result.serviceActive)
- Status: $statusName
- Dataset/schema: $dataset / $schema
- Raw records: $($result.rawRecordTotal)
- Canonical events: $($result.canonicalEventTotal)
- Last record: $lastRecordAt
- Last canonical event: $lastMarketEventAt
- Compression error absent: $($result.compressionErrorAbsent)
- Last error: $lastError

Fix:
Removed the invalid string compression parameter from db.Live(...).
The SDK now uses its supported default compression configuration.

Rollback:
$($result.rollbackSnapshot)

Not touched:
- API app.py;
- paper account;
- Telegram;
- client gates;
- payments.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6C COMPRESSION FIX COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Service active: $($result.serviceActive)"
Write-Host "Status: $statusName"
Write-Host "Raw records: $($result.rawRecordTotal)"
Write-Host "Canonical events: $($result.canonicalEventTotal)"
Write-Host "Last canonical event: $lastMarketEventAt"
Write-Host "Compression error absent: $($result.compressionErrorAbsent)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Rollback: $($result.rollbackSnapshot)"

if (-not $result.ok) {
    $journalProp = $result.PSObject.Properties["journalTail"]
    if ($null -ne $journalProp) {
        Write-Host ""
        Write-Host "=== JOURNAL TAIL ===" -ForegroundColor Yellow
        Write-Host (Safe-Value $journalProp.Value "stdout")
    }

    throw "Canary stream runtime gate still failed. Inspect report/raw."
}
