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
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_6C_ACCIDENTAL_S103F_RECOVERY_report_$stamp.txt"
$RawPath = Join-Path $AuditDir "S10_6C_ACCIDENTAL_S103F_RECOVERY_raw_$stamp.json"

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

$remoteTemplate = @'
set -euo pipefail

APP=/opt/skilledge/stock-engine/app/api/app.py
PRE=/opt/skilledge/stock-engine/app/api/app.py.bak_s103f_20260716T190359Z
POST=/opt/skilledge/stock-engine/app/api/app.py.bak_accidental_s103f_post___STAMP__

if [ ! -f "$APP" ]; then
  echo '{"ok":false,"error":"CURRENT_APP_MISSING"}'
  exit 2
fi

if [ ! -f "$PRE" ]; then
  echo '{"ok":false,"error":"PRE_ACCIDENT_BACKUP_MISSING"}'
  exit 3
fi

CURRENT_SHA=$(sha256sum "$APP" | awk '{print $1}')
PRE_SHA=$(sha256sum "$PRE" | awk '{print $1}')

cp -a "$APP" "$POST"
chmod 600 "$POST"

cp -a "$PRE" "$APP"
chmod 644 "$APP"

/opt/skilledge/stock-engine/.venv/bin/python -m py_compile "$APP"

systemctl restart skilledge-stock-engine-api.service

HEALTH_OK=false
HEALTH_BODY=""
for i in $(seq 1 20); do
  if HEALTH_BODY=$(curl -fsS --max-time 10 http://127.0.0.1:8000/health 2>/dev/null); then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

RESTORED_SHA=$(sha256sum "$APP" | awk '{print $1}')

TIMER_SHOW=$(systemctl show skilledge-s10-paper-trading.timer \
  -p ActiveState -p SubState -p UnitFileState -p Result --no-pager || true)

SERVICE_SHOW=$(systemctl show skilledge-s10-paper-trading.service \
  -p ActiveState -p SubState -p Result -p ExecMainStatus --no-pager || true)

TIMER_CAT=$(systemctl cat skilledge-s10-paper-trading.timer --no-pager 2>/dev/null || true)

API_SHOW=$(systemctl show skilledge-stock-engine-api.service \
  -p ActiveState -p SubState -p Result -p MainPID -p NRestarts --no-pager || true)

python3 - <<'PY'
import json
import os

payload = {
    "ok": os.environ["HEALTH_OK"] == "true",
    "currentShaBeforeRecovery": os.environ["CURRENT_SHA"],
    "preAccidentBackupSha": os.environ["PRE_SHA"],
    "restoredAppSha": os.environ["RESTORED_SHA"],
    "restoredMatchesPreAccidentBackup": os.environ["RESTORED_SHA"] == os.environ["PRE_SHA"],
    "preAccidentBackup": os.environ["PRE"],
    "postAccidentBackup": os.environ["POST"],
    "apiHealthOk": os.environ["HEALTH_OK"] == "true",
    "apiHealthBody": os.environ["HEALTH_BODY"][:12000],
    "apiService": os.environ["API_SHOW"],
    "paperTimer": os.environ["TIMER_SHOW"],
    "paperService": os.environ["SERVICE_SHOW"],
    "paperTimerUnit": os.environ["TIMER_CAT"][:12000],
    "paperTimerChangedByRecovery": False,
    "paperServiceStartedByRecovery": False,
    "paperRunOnceExecuted": False,
    "paperResetExecuted": False,
}
print(json.dumps(payload, ensure_ascii=False))
PY
'@

$remoteScript = $remoteTemplate.Replace("__STAMP__", $stamp)

# Export values for the embedded Python process without exposing secrets.
$remoteScript = $remoteScript.Replace(
    "python3 - <<'PY'",
    'export CURRENT_SHA PRE_SHA RESTORED_SHA PRE POST HEALTH_OK HEALTH_BODY TIMER_SHOW SERVICE_SHOW TIMER_CAT API_SHOW' + "`n" + "python3 - <<'PY'"
)

Write-Host ""
Write-Host "=== RESTORE PRE-ACCIDENT APP.PY ===" -ForegroundColor Green
Write-Host "Paper timer will NOT be enabled or started by this recovery." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost $remoteScript
if ($LASTEXITCODE -ne 0) {
    throw "Recovery failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"
if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Recovery returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$report = @(
    "S10.6C ACCIDENTAL S10.3F RECOVERY",
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
Write-Host "Paper timer was not changed by recovery."
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"

if (-not $result.ok -or -not $result.restoredMatchesPreAccidentBackup) {
    throw "Recovery validation failed. Inspect report/raw before continuing."
}
