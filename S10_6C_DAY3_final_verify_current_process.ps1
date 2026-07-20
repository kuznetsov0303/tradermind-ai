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
$StateDir = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesDir = Join-Path $StateDir "milestones"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
New-Item -ItemType Directory -Force -Path $MilestonesDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$localSh = Join-Path $env:TEMP "s10_6c_day3_final_verify_$stamp.sh"
$remoteSh = "/tmp/s10_6c_day3_final_verify_$stamp.sh"
$RawPath = Join-Path $AuditDir "S10_6C_DAY3_FINAL_VERIFY_raw_$stamp.json"
$ReportPath = Join-Path $AuditDir "S10_6C_DAY3_FINAL_VERIFY_report_$stamp.txt"

$bash = @'
#!/usr/bin/env bash
set -euo pipefail

SERVICE="skilledge-market-stream.service"
STATUS="/opt/skilledge/stock-engine/data/market_stream_status.json"

python3 - <<'PY'
import json
import subprocess
import time
from pathlib import Path

service_name = "skilledge-market-stream.service"
status_path = Path("/opt/skilledge/stock-engine/data/market_stream_status.json")

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, check=False)
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def read_status():
    if not status_path.exists():
        return None
    return json.loads(status_path.read_text(encoding="utf-8"))

def total(counter):
    return sum(int(v) for v in (counter or {}).values())

service_before = run([
    "systemctl",
    "show",
    service_name,
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,ExecMainStartTimestamp",
])

status_before = read_status()
raw_before = total(status_before.get("rawRecordCounts")) if status_before else 0
canonical_before = total(status_before.get("marketEventCounts")) if status_before else 0

time.sleep(15)

service_after = run([
    "systemctl",
    "show",
    service_name,
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,ExecMainStartTimestamp",
])

status_after = read_status()
raw_after = total(status_after.get("rawRecordCounts")) if status_after else 0
canonical_after = total(status_after.get("marketEventCounts")) if status_after else 0

main_pid = None
start_timestamp = None
for line in service_after["stdout"].splitlines():
    if line.startswith("MainPID="):
        try:
            main_pid = int(line.split("=", 1)[1])
        except Exception:
            pass
    elif line.startswith("ExecMainStartTimestamp="):
        start_timestamp = line.split("=", 1)[1]

journal_args = ["journalctl", "-u", service_name, "--no-pager", "-n", "200"]
if start_timestamp:
    journal_args = [
        "journalctl",
        "-u",
        service_name,
        "--since",
        start_timestamp,
        "--no-pager",
    ]

journal_current = run(journal_args)
journal_text = journal_current["stdout"]

current_compression_error = "not an instance of 'Compression'" in journal_text
authenticated = "authenticated session_id=" in journal_text
subscription_ack = "Subscription request 0 for mbp-1 data succeeded" in journal_text

service_active = (
    "ActiveState=active" in service_after["stdout"]
    and "SubState=running" in service_after["stdout"]
)

status_ok = (
    isinstance(status_after, dict)
    and status_after.get("status") == "OK"
    and status_after.get("ok") is True
)

counter_growth = (
    raw_after > raw_before
    or canonical_after > canonical_before
)

fresh_record = False
if isinstance(status_after, dict):
    age = status_after.get("recordAgeSeconds")
    if age is not None:
        try:
            fresh_record = float(age) <= 20
        except Exception:
            pass

ok = (
    service_active
    and status_ok
    and raw_after > 0
    and canonical_after > 0
    and fresh_record
    and not current_compression_error
    and authenticated
    and subscription_ack
)

print(json.dumps({
    "ok": ok,
    "classification": (
        "DAY3_DATABENTO_CANARY_VERIFIED"
        if ok
        else "DAY3_DATABENTO_CANARY_VERIFY_FAILED"
    ),
    "inspectionOnly": True,
    "productionMutation": False,
    "serviceRestarted": False,
    "paperTouched": False,
    "apiAppTouched": False,
    "serviceBefore": service_before,
    "serviceAfter": service_after,
    "mainPid": main_pid,
    "startTimestamp": start_timestamp,
    "statusBefore": status_before,
    "statusAfter": status_after,
    "rawBefore": raw_before,
    "rawAfter": raw_after,
    "rawGrowth": raw_after - raw_before,
    "canonicalBefore": canonical_before,
    "canonicalAfter": canonical_after,
    "canonicalGrowth": canonical_after - canonical_before,
    "counterGrowthObserved": counter_growth,
    "freshRecord": fresh_record,
    "authenticatedInCurrentProcessJournal": authenticated,
    "subscriptionAckInCurrentProcessJournal": subscription_ack,
    "compressionErrorInCurrentProcessJournal": current_compression_error,
    "currentProcessJournal": journal_current,
}, ensure_ascii=False))
PY
'@

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
Write-Host "=== UPLOAD FINAL READ-ONLY VERIFY ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Verify upload failed."
}

Write-Host ""
Write-Host "=== VERIFY CURRENT MARKET-STREAM PROCESS ===" -ForegroundColor Green
Write-Host "Waiting 15 seconds to confirm live counter growth..." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Final verification failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Final verification returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

$status = $result.statusAfter

$report = @(
    "S10.6C DAY 3 FINAL VERIFY",
    "Generated=$stamp",
    "OK=$($result.ok)",
    "CLASSIFICATION=$($result.classification)",
    "MAIN_PID=$($result.mainPid)",
    "START_TIMESTAMP=$($result.startTimestamp)",
    "SERVICE_ACTIVE=$(([string]$result.serviceAfter.stdout) -match 'ActiveState=active')",
    "STATUS=$($status.status)",
    "DATASET=$($status.dataset)",
    "SCHEMA=$($status.schema)",
    "SYMBOLS=$(@($status.symbols) -join ',')",
    "RAW_BEFORE=$($result.rawBefore)",
    "RAW_AFTER=$($result.rawAfter)",
    "RAW_GROWTH=$($result.rawGrowth)",
    "CANONICAL_BEFORE=$($result.canonicalBefore)",
    "CANONICAL_AFTER=$($result.canonicalAfter)",
    "CANONICAL_GROWTH=$($result.canonicalGrowth)",
    "FRESH_RECORD=$($result.freshRecord)",
    "AUTHENTICATED_CURRENT_PROCESS=$($result.authenticatedInCurrentProcessJournal)",
    "SUBSCRIPTION_ACK_CURRENT_PROCESS=$($result.subscriptionAckInCurrentProcessJournal)",
    "COMPRESSION_ERROR_CURRENT_PROCESS=$($result.compressionErrorInCurrentProcessJournal)",
    "PRODUCTION_MUTATION=$($result.productionMutation)",
    "SERVICE_RESTARTED=$($result.serviceRestarted)",
    "PAPER_TOUCHED=$($result.paperTouched)",
    "API_APP_TOUCHED=$($result.apiAppTouched)",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

$milestonePath = Join-Path $MilestonesDir "S10_6C_DAY3_FINAL_VERIFIED_$stamp.md"

@"
# S10.6C Day 3 Final Verification

Generated: $isoNow

Result:
- OK: $($result.ok)
- Classification: $($result.classification)
- Main PID: $($result.mainPid)
- Service status: $($status.status)
- Dataset/schema: $($status.dataset) / $($status.schema)
- Symbols: $(@($status.symbols) -join ',')
- Raw records: $($result.rawAfter)
- Canonical events: $($result.canonicalAfter)
- Raw growth over verification window: $($result.rawGrowth)
- Canonical growth over verification window: $($result.canonicalGrowth)
- Fresh record: $($result.freshRecord)
- Authenticated in current process journal: $($result.authenticatedInCurrentProcessJournal)
- Subscription ACK in current process journal: $($result.subscriptionAckInCurrentProcessJournal)
- Compression error in current process journal: $($result.compressionErrorInCurrentProcessJournal)

Day 3 status:
CLOSED if OK=True.

No production mutation was performed by this verification.
No service restart.
No paper action.
No app.py change.

Next:
Day 4 stream reliability, stale watchdog, reconnect ledger, process metrics, restart recovery.
"@ | Set-Content -LiteralPath $milestonePath -Encoding UTF8

$nextStepPath = Join-Path $StateDir "NEXT_STEP.md"

@"
# NEXT STEP

Updated: $isoNow

Completed:
S10.6C Day 3 production Databento canary stream.

Next:
Day 4 - Stream reliability and recovery.

Required:
- explicit stale watchdog;
- reconnect and gap ledger;
- process CPU/RAM metrics;
- status history;
- controlled restart recovery proof;
- safe service-failure classification;
- no ALL_SYMBOLS cutover before reliability gate.

Outstanding operational item:
The paper trading timer remains disabled after the accidental old-script run.
Restore it separately after verifying its intended schedule and without manual run-once or reset.
"@ | Set-Content -LiteralPath $nextStepPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6C DAY 3 FINAL VERIFY COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Main PID: $($result.mainPid)"
Write-Host "Status: $($status.status)"
Write-Host "Raw records: $($result.rawAfter)"
Write-Host "Canonical events: $($result.canonicalAfter)"
Write-Host "Raw growth: $($result.rawGrowth)"
Write-Host "Canonical growth: $($result.canonicalGrowth)"
Write-Host "Current-process compression error: $($result.compressionErrorInCurrentProcessJournal)"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
Write-Host "Milestone: $milestonePath"

if (-not $result.ok) {
    Write-Host ""
    Write-Host "=== CURRENT PROCESS JOURNAL ===" -ForegroundColor Yellow
    Write-Host $result.currentProcessJournal.stdout
    throw "Day 3 final verification failed."
}
