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
$AuditDir = Join-Path $ProjectRoot "audit_exports"
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$localSh = Join-Path $env:TEMP "s10_6c_recover_s103f_$stamp.sh"
$remoteSh = "/tmp/s10_6c_recover_s103f_$stamp.sh"
$RawPath = Join-Path $AuditDir "S10_6C_RECOVERY_FIXED_raw_$stamp.json"
$ReportPath = Join-Path $AuditDir "S10_6C_RECOVERY_FIXED_report_$stamp.txt"

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

APP="/opt/skilledge/stock-engine/app/api/app.py"
PRE="/opt/skilledge/stock-engine/app/api/app.py.bak_s103f_20260716T190359Z"
POST="/opt/skilledge/stock-engine/app/api/app.py.bak_accidental_s103f_post___STAMP__"

if [[ ! -f "$APP" ]]; then
  python3 - <<'PY'
import json
print(json.dumps({"ok": False, "error": "CURRENT_APP_MISSING"}))
PY
  exit 2
fi

if [[ ! -f "$PRE" ]]; then
  python3 - <<'PY'
import json
print(json.dumps({"ok": False, "error": "PRE_ACCIDENT_BACKUP_MISSING"}))
PY
  exit 3
fi

CURRENT_SHA="$(sha256sum "$APP" | awk '{print $1}')"
PRE_SHA="$(sha256sum "$PRE" | awk '{print $1}')"

cp -a "$APP" "$POST"
chmod 600 "$POST"

cp -a "$PRE" "$APP"
chmod 644 "$APP"

/opt/skilledge/stock-engine/.venv/bin/python -m py_compile "$APP"

systemctl restart skilledge-stock-engine-api.service

HEALTH_OK="false"
HEALTH_BODY=""

for _ in $(seq 1 20); do
  if HEALTH_BODY="$(curl -fsS --max-time 10 http://127.0.0.1:8000/health 2>/dev/null)"; then
    HEALTH_OK="true"
    break
  fi
  sleep 2
done

RESTORED_SHA="$(sha256sum "$APP" | awk '{print $1}')"

TIMER_SHOW="$(systemctl show skilledge-s10-paper-trading.timer \
  -p ActiveState -p SubState -p UnitFileState -p Result --no-pager || true)"

SERVICE_SHOW="$(systemctl show skilledge-s10-paper-trading.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus --no-pager || true)"

API_SHOW="$(systemctl show skilledge-stock-engine-api.service \
  -p ActiveState -p SubState -p Result -p MainPID -p NRestarts --no-pager || true)"

export CURRENT_SHA PRE_SHA RESTORED_SHA PRE POST HEALTH_OK HEALTH_BODY TIMER_SHOW SERVICE_SHOW API_SHOW

python3 - <<'PY'
import json
import os

payload = {
    "ok": (
        os.environ["HEALTH_OK"] == "true"
        and os.environ["RESTORED_SHA"] == os.environ["PRE_SHA"]
    ),
    "currentShaBeforeRecovery": os.environ["CURRENT_SHA"],
    "preAccidentBackupSha": os.environ["PRE_SHA"],
    "restoredAppSha": os.environ["RESTORED_SHA"],
    "restoredMatchesPreAccidentBackup": (
        os.environ["RESTORED_SHA"] == os.environ["PRE_SHA"]
    ),
    "preAccidentBackup": os.environ["PRE"],
    "postAccidentBackup": os.environ["POST"],
    "apiHealthOk": os.environ["HEALTH_OK"] == "true",
    "apiHealthBody": os.environ["HEALTH_BODY"][:12000],
    "apiService": os.environ["API_SHOW"],
    "paperTimer": os.environ["TIMER_SHOW"],
    "paperService": os.environ["SERVICE_SHOW"],
    "paperTimerChangedByRecovery": False,
    "paperServiceStartedByRecovery": False,
    "paperRunOnceExecuted": False,
    "paperResetExecuted": False,
}
print(json.dumps(payload, ensure_ascii=False))
PY
'@

$bash = $bash.Replace("__STAMP__", $stamp)

# Critical: write Unix LF, UTF-8 without BOM.
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
Write-Host "=== UPLOAD UNIX-LF RECOVERY SCRIPT ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "=== EXECUTE PRE-ACCIDENT APP RECOVERY ===" -ForegroundColor Green
Write-Host "Paper timer remains untouched." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    $joined = $resultLines -join "`n"
    if (-not [string]::IsNullOrWhiteSpace($joined)) {
        Write-Host $joined
    }
    throw "Recovery failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Recovery returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6C ACCIDENTAL S10.3F RECOVERY - LF FIXED",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "RESTORED_MATCHES_PRE_ACCIDENT_BACKUP=$($result.restoredMatchesPreAccidentBackup)",
    "CURRENT_SHA_BEFORE=$($result.currentShaBeforeRecovery)",
    "PRE_ACCIDENT_SHA=$($result.preAccidentBackupSha)",
    "RESTORED_SHA=$($result.restoredAppSha)",
    "PRE_ACCIDENT_BACKUP=$($result.preAccidentBackup)",
    "POST_ACCIDENT_BACKUP=$($result.postAccidentBackup)",
    "API_HEALTH_OK=$($result.apiHealthOk)",
    "PAPER_TIMER_CHANGED_BY_RECOVERY=$($result.paperTimerChangedByRecovery)",
    "PAPER_SERVICE_STARTED_BY_RECOVERY=$($result.paperServiceStartedByRecovery)",
    "PAPER_RUN_ONCE_EXECUTED=$($result.paperRunOnceExecuted)",
    "PAPER_RESET_EXECUTED=$($result.paperResetExecuted)",
    "",
    "=== API SERVICE ===",
    $result.apiService,
    "",
    "=== PAPER TIMER ===",
    $result.paperTimer,
    "",
    "=== PAPER SERVICE ===",
    $result.paperService,
    "",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "=== RECOVERY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Restored matches pre-accident backup: $($result.restoredMatchesPreAccidentBackup)"
Write-Host "API health: $($result.apiHealthOk)"
Write-Host "Paper timer changed by recovery: $($result.paperTimerChangedByRecovery)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"

if (-not $result.ok) {
    throw "Recovery validation failed. Inspect report/raw."
}
