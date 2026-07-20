param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner",
    [string]$VpsRoot = "/opt/skilledge/stock-engine"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-LatestFile {
    param(
        [string]$Directory,
        [string]$Filter
    )

    return Get-ChildItem -LiteralPath $Directory -Filter $Filter -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

$auditDir = Join-Path $ProjectRoot "audit_exports"
if (-not (Test-Path -LiteralPath $auditDir)) {
    throw "audit_exports not found: $auditDir"
}

$deleteSetFile = Get-LatestFile -Directory $auditDir -Filter "S10_4O_verified_vps_delete_set_*.json"
if (-not $deleteSetFile) {
    throw "No S10.4O verified VPS delete set found."
}

$deleteSet = Get-Content -LiteralPath $deleteSetFile.FullName -Raw | ConvertFrom-Json

if (-not [bool]$deleteSet.snapshot.created) {
    throw "Delete set snapshot.created is not true."
}

if (-not [bool]$deleteSet.snapshot.archiveVerified) {
    throw "Delete set snapshot.archiveVerified is not true."
}

$expectedCurrentAppHash = [string]$deleteSet.safety.currentAppHash
$oldAppBackups = @($deleteSet.deleteAfterSnapshot.oldAppBackups)
$opsOpsDuplicates = @($deleteSet.deleteAfterSnapshot.opsOpsExactDuplicates)
$keepRecent = @($deleteSet.keep.appBackupsRecent)

if ($oldAppBackups.Count -ne 87) {
    throw "Expected 87 old app backups, got $($oldAppBackups.Count)."
}

if ($opsOpsDuplicates.Count -ne 9) {
    throw "Expected 9 ops/ops duplicates, got $($opsOpsDuplicates.Count)."
}

if ($keepRecent.Count -ne 3) {
    throw "Expected 3 retained recent backups, got $($keepRecent.Count)."
}

$payloadPath = Join-Path $env:TEMP "s10_4p_delete_payload_$stamp.json"
$localPy = Join-Path $env:TEMP "s10_4p_verified_vps_cleanup_$stamp.py"
$remotePayload = "/tmp/s10_4p_delete_payload_$stamp.json"
$remotePy = "/tmp/s10_4p_verified_vps_cleanup_$stamp.py"

$reportPath = Join-Path $auditDir "S10_4P_verified_vps_cleanup_report_$stamp.txt"
$resultJsonPath = Join-Path $auditDir "S10_4P_verified_vps_cleanup_result_$stamp.json"

$payload = [ordered]@{
    expectedCurrentAppHash = $expectedCurrentAppHash
    snapshotArchivePath = [string]$deleteSet.snapshot.archivePath
    snapshotArchiveSha256 = [string]$deleteSet.snapshot.archiveSha256
    oldAppBackups = @(
        $oldAppBackups | ForEach-Object {
            [ordered]@{
                path = [string]$_.path
                sha256 = [string]$_.sha256
            }
        }
    )
    opsOpsDuplicates = @(
        $opsOpsDuplicates | ForEach-Object {
            [ordered]@{
                path = [string]$_.path
                sha256 = [string]$_.sha256
            }
        }
    )
    keepRecent = @(
        $keepRecent | ForEach-Object {
            [ordered]@{
                path = [string]$_.path
                sha256 = [string]$_.sha256
            }
        }
    )
}

$payload |
    ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $payloadPath -Encoding UTF8

Write-Host "`n=== S10.4P VERIFIED VPS CLEANUP ===" -ForegroundColor Green
Write-Host "Will delete only hash-verified files from S10.4O delete set." -ForegroundColor Yellow
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE START-STOP" -ForegroundColor Yellow

$pythonCode = @'
import json
import hashlib
import os
import shutil
import urllib.request
from pathlib import Path

ROOT = Path("/opt/skilledge/stock-engine")
PAYLOAD_PATH = Path(os.environ["S10_4P_PAYLOAD"])

def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

with PAYLOAD_PATH.open("r", encoding="utf-8-sig") as f:
    payload = json.load(f)

current_app = ROOT / "app/api/app.py"
snapshot_archive = Path(payload["snapshotArchivePath"])

if not current_app.exists():
    raise RuntimeError("Current app.py missing")

current_app_hash_before = sha256_file(current_app)

if current_app_hash_before != payload["expectedCurrentAppHash"]:
    raise RuntimeError(
        f"Current app.py hash drift before cleanup: "
        f"{current_app_hash_before} != {payload['expectedCurrentAppHash']}"
    )

if not snapshot_archive.exists():
    raise RuntimeError("Rollback snapshot archive missing")

snapshot_hash = sha256_file(snapshot_archive)
if snapshot_hash != payload["snapshotArchiveSha256"]:
    raise RuntimeError("Rollback snapshot archive hash mismatch")

preflight = {
    "oldAppBackups": [],
    "opsOpsDuplicates": [],
    "keepRecent": [],
}

# Preflight every delete target before deleting anything.
for group_name in ("oldAppBackups", "opsOpsDuplicates"):
    for item in payload[group_name]:
        p = Path(item["path"])
        if not p.exists():
            raise RuntimeError(f"Delete target missing before cleanup: {p}")
        actual = sha256_file(p)
        if actual != item["sha256"]:
            raise RuntimeError(
                f"Delete target hash mismatch: {p} "
                f"{actual} != {item['sha256']}"
            )
        preflight[group_name].append({
            "path": str(p),
            "sha256": actual,
            "verified": True,
        })

# Verify retained backups before any delete.
for item in payload["keepRecent"]:
    p = Path(item["path"])
    if not p.exists():
        raise RuntimeError(f"Retained backup missing before cleanup: {p}")
    actual = sha256_file(p)
    if actual != item["sha256"]:
        raise RuntimeError(
            f"Retained backup hash mismatch: {p} "
            f"{actual} != {item['sha256']}"
        )
    preflight["keepRecent"].append({
        "path": str(p),
        "sha256": actual,
        "verified": True,
    })

deleted_old_app = []
deleted_ops_ops = []

# Delete only after all preflight checks passed.
for item in payload["oldAppBackups"]:
    p = Path(item["path"])
    p.unlink()
    deleted_old_app.append(str(p))

for item in payload["opsOpsDuplicates"]:
    p = Path(item["path"])
    p.unlink()
    deleted_ops_ops.append(str(p))

# Remove empty directories only under ops/ops.
ops_ops_root = ROOT / "ops/ops"
if ops_ops_root.exists():
    for base, dirs, files in os.walk(ops_ops_root, topdown=False):
        base_path = Path(base)
        try:
            if not any(base_path.iterdir()):
                base_path.rmdir()
        except Exception:
            pass

# Post-delete assertions.
remaining_old = [x["path"] for x in payload["oldAppBackups"] if Path(x["path"]).exists()]
remaining_ops_ops = [x["path"] for x in payload["opsOpsDuplicates"] if Path(x["path"]).exists()]

if remaining_old:
    raise RuntimeError(f"Some old app backups still exist: {remaining_old}")

if remaining_ops_ops:
    raise RuntimeError(f"Some ops/ops duplicates still exist: {remaining_ops_ops}")

# Retained backups must still exist and match.
retained_status = []
for item in payload["keepRecent"]:
    p = Path(item["path"])
    exists = p.exists()
    actual = sha256_file(p) if exists else None
    matches = exists and actual == item["sha256"]
    retained_status.append({
        "path": str(p),
        "exists": exists,
        "sha256": actual,
        "matchesExpected": matches,
    })
    if not matches:
        raise RuntimeError(f"Retained backup validation failed: {p}")

current_app_hash_after = sha256_file(current_app)

if current_app_hash_after != payload["expectedCurrentAppHash"]:
    raise RuntimeError(
        f"Current app.py hash changed during cleanup: "
        f"{current_app_hash_after} != {payload['expectedCurrentAppHash']}"
    )

# Read-only local API health probe.
health = {
    "ok": False,
    "status": None,
    "error": None,
}

try:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/health",
        method="GET",
        headers={"User-Agent": "S10.4P-cleanup-verifier"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        health["status"] = resp.status
        try:
            health["body"] = json.loads(body)
        except Exception:
            health["body"] = body[:2000]
        health["ok"] = resp.status == 200
except Exception as exc:
    health["error"] = str(exc)

result = {
    "ok": True,
    "deletedOldAppBackups": len(deleted_old_app),
    "deletedOpsOpsDuplicates": len(deleted_ops_ops),
    "opsOpsExistsAfter": ops_ops_root.exists(),
    "retainedRecentBackups": retained_status,
    "currentAppHashBefore": current_app_hash_before,
    "currentAppHashAfter": current_app_hash_after,
    "currentAppHashUnchanged": current_app_hash_before == current_app_hash_after,
    "snapshotArchiveExists": snapshot_archive.exists(),
    "snapshotArchiveSha256": snapshot_hash,
    "health": health,
    "deployPerformed": False,
    "restartPerformed": False,
    "serviceStateChanged": False,
}

print(json.dumps(result, ensure_ascii=False))
'@

[System.IO.File]::WriteAllText(
    $localPy,
    $pythonCode,
    [System.Text.UTF8Encoding]::new($false)
)

$sshBase = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host "`n=== 1. COPY VERIFIED DELETE PAYLOAD + HELPER TO /tmp ===" -ForegroundColor Green

& scp @sshBase $payloadPath "${VpsHost}:$remotePayload"
if ($LASTEXITCODE -ne 0) {
    throw "SCP payload failed with exit code $LASTEXITCODE"
}

& scp @sshBase $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP helper failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== 2. PRECHECK HASHES + DELETE VERIFIED TARGETS + POSTCHECK ===" -ForegroundColor Green

$remoteCommand = "S10_4P_PAYLOAD='$remotePayload' python3 '$remotePy'; rc=`$?; rm -f '$remotePy' '$remotePayload'; exit `$rc"
$resultLines = & ssh @sshBase $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote cleanup failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote cleanup returned empty result."
}

$resultText | Set-Content -LiteralPath $resultJsonPath -Encoding UTF8

$result = $resultText | ConvertFrom-Json

if (-not [bool]$result.ok) {
    throw "Remote cleanup did not report ok=true"
}

if ([int]$result.deletedOldAppBackups -ne 87) {
    throw "Expected 87 deleted old app backups, got $($result.deletedOldAppBackups)"
}

if ([int]$result.deletedOpsOpsDuplicates -ne 9) {
    throw "Expected 9 deleted ops/ops duplicates, got $($result.deletedOpsOpsDuplicates)"
}

if (-not [bool]$result.currentAppHashUnchanged) {
    throw "Current app.py hash changed."
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

if (Test-Path -LiteralPath $payloadPath) {
    Remove-Item -LiteralPath $payloadPath -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4P VERIFIED VPS CLEANUP")
$lines.Add("Generated=$stamp")
$lines.Add("SourceDeleteSet=$($deleteSetFile.FullName)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("OK=$($result.ok)")
$lines.Add("DELETED_OLD_APP_BACKUPS=$($result.deletedOldAppBackups)")
$lines.Add("DELETED_OPS_OPS_EXACT_DUPLICATES=$($result.deletedOpsOpsDuplicates)")
$lines.Add("OPS_OPS_EXISTS_AFTER=$($result.opsOpsExistsAfter)")
$lines.Add("CURRENT_APP_HASH_BEFORE=$($result.currentAppHashBefore)")
$lines.Add("CURRENT_APP_HASH_AFTER=$($result.currentAppHashAfter)")
$lines.Add("CURRENT_APP_HASH_UNCHANGED=$($result.currentAppHashUnchanged)")
$lines.Add("SNAPSHOT_ARCHIVE_EXISTS=$($result.snapshotArchiveExists)")
$lines.Add("SNAPSHOT_ARCHIVE_SHA256=$($result.snapshotArchiveSha256)")
$lines.Add("API_HEALTH_OK=$($result.health.ok)")
$lines.Add("API_HEALTH_STATUS=$($result.health.status)")
$lines.Add("API_HEALTH_ERROR=$($result.health.error)")
$lines.Add("DEPLOY_PERFORMED=$($result.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.serviceStateChanged)")
$lines.Add("")
$lines.Add("=== RETAINED RECENT APP BACKUPS ===")

foreach ($item in @($result.retainedRecentBackups)) {
    $lines.Add(
        "$($item.path) | exists=$($item.exists) | matchesExpected=$($item.matchesExpected) | sha256=$($item.sha256)"
    )
}

$lines.Add("")
$lines.Add("=== NOT TOUCHED ===")
$lines.Add("5 non-app backups")
$lines.Add("ops/scripts/s10_paper_trading_daemon.py")
$lines.Add("rollback_snapshots/")
$lines.Add("data/")
$lines.Add("reports/")
$lines.Add(".env.server")
$lines.Add("current canonical source except deletion of verified duplicate/backup files")
$lines.Add("systemd service state")

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4P COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $reportPath"
Write-Host "Result JSON: $resultJsonPath"
Write-Host ""
Write-Host "87 old app backups deleted." -ForegroundColor Green
Write-Host "9 exact ops/ops duplicates deleted." -ForegroundColor Green
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE." -ForegroundColor Yellow
