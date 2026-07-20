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

$qResultFile = Get-LatestFile -Directory $auditDir -Filter "S10_4Q_final_legacy_nonapp_proof_result_*.json"
if (-not $qResultFile) {
    throw "No S10.4Q proof result found."
}

$oDeleteSetFile = Get-LatestFile -Directory $auditDir -Filter "S10_4O_verified_vps_delete_set_*.json"
if (-not $oDeleteSetFile) {
    throw "No S10.4O delete set found."
}

$qResult = Get-Content -LiteralPath $qResultFile.FullName -Raw | ConvertFrom-Json
$oDeleteSet = Get-Content -LiteralPath $oDeleteSetFile.FullName -Raw | ConvertFrom-Json

$nonAppDelete = @(
    $qResult.nonAppBackups |
        Where-Object { $_.classification -eq "DELETE_CANDIDATE" }
)

if ($nonAppDelete.Count -ne 5) {
    throw "Expected 5 non-app delete candidates, got $($nonAppDelete.Count)."
}

if ([string]$qResult.legacy.classification -ne "LEGACY_CONFIRMED") {
    throw "Legacy target is not LEGACY_CONFIRMED."
}

$legacyTarget = $qResult.legacy

$keepRecent = @($oDeleteSet.keep.appBackupsRecent)
if ($keepRecent.Count -ne 3) {
    throw "Expected 3 retained recent app backups, got $($keepRecent.Count)."
}

$payloadPath = Join-Path $env:TEMP "s10_4r_payload_$stamp.json"
$localPy = Join-Path $env:TEMP "s10_4r_final_vps_cleanup_$stamp.py"
$remotePayload = "/tmp/s10_4r_payload_$stamp.json"
$remotePy = "/tmp/s10_4r_final_vps_cleanup_$stamp.py"

$reportPath = Join-Path $auditDir "S10_4R_final_vps_legacy_cleanup_report_$stamp.txt"
$resultPath = Join-Path $auditDir "S10_4R_final_vps_legacy_cleanup_result_$stamp.json"

$payload = [ordered]@{
    expectedCurrentAppHash = [string]$oDeleteSet.safety.currentAppHash
    snapshotArchivePath = [string]$oDeleteSet.snapshot.archivePath
    snapshotArchiveSha256 = [string]$oDeleteSet.snapshot.archiveSha256
    nonAppBackups = @(
        $nonAppDelete | ForEach-Object {
            [ordered]@{
                path = [string]$_.path
                sha256 = [string]$_.actualSha256
            }
        }
    )
    legacy = [ordered]@{
        path = [string]$legacyTarget.path
        sha256 = [string]$legacyTarget.sha256
    }
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

Write-Host "`n=== S10.4R FINAL VPS LEGACY CLEANUP ===" -ForegroundColor Green
Write-Host "Will delete only 5 hash-verified non-app backups + 1 LEGACY_CONFIRMED daemon." -ForegroundColor Yellow
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE" -ForegroundColor Yellow

$pythonCode = @'
import json
import hashlib
import os
import urllib.request
from pathlib import Path

ROOT = Path("/opt/skilledge/stock-engine")
PAYLOAD_PATH = Path(os.environ["S10_4R_PAYLOAD"])

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
    raise RuntimeError("Rollback snapshot hash mismatch")

# Verify retained recent backups before any delete.
retained_before = []
for item in payload["keepRecent"]:
    p = Path(item["path"])
    if not p.exists():
        raise RuntimeError(f"Retained app backup missing: {p}")

    actual = sha256_file(p)
    if actual != item["sha256"]:
        raise RuntimeError(f"Retained app backup hash mismatch: {p}")

    retained_before.append({
        "path": str(p),
        "sha256": actual,
        "verified": True,
    })

# Preflight every delete target before deleting anything.
delete_targets = []

for item in payload["nonAppBackups"]:
    p = Path(item["path"])
    if not p.exists():
        raise RuntimeError(f"Non-app backup missing before cleanup: {p}")

    actual = sha256_file(p)
    if actual != item["sha256"]:
        raise RuntimeError(f"Non-app backup hash mismatch: {p}")

    delete_targets.append({
        "path": str(p),
        "sha256": actual,
        "type": "NON_APP_BACKUP",
    })

legacy = payload["legacy"]
legacy_path = Path(legacy["path"])

if not legacy_path.exists():
    raise RuntimeError(f"Legacy target missing before cleanup: {legacy_path}")

legacy_hash = sha256_file(legacy_path)

if legacy_hash != legacy["sha256"]:
    raise RuntimeError("Legacy target hash mismatch")

delete_targets.append({
    "path": str(legacy_path),
    "sha256": legacy_hash,
    "type": "LEGACY_CONFIRMED",
})

# Delete only after all preflight verification passed.
deleted = []

for item in delete_targets:
    p = Path(item["path"])
    p.unlink()
    deleted.append(item)

# Post-delete assertions.
remaining = []

for item in delete_targets:
    if Path(item["path"]).exists():
        remaining.append(item["path"])

if remaining:
    raise RuntimeError(f"Some cleanup targets still exist: {remaining}")

# Retained recent backups must still exist and match.
retained_after = []

for item in payload["keepRecent"]:
    p = Path(item["path"])
    exists = p.exists()
    actual = sha256_file(p) if exists else None
    matches = exists and actual == item["sha256"]

    retained_after.append({
        "path": str(p),
        "exists": exists,
        "sha256": actual,
        "matchesExpected": matches,
    })

    if not matches:
        raise RuntimeError(f"Retained backup validation failed after cleanup: {p}")

current_app_hash_after = sha256_file(current_app)

if current_app_hash_after != payload["expectedCurrentAppHash"]:
    raise RuntimeError("Current app.py hash changed during cleanup")

snapshot_hash_after = sha256_file(snapshot_archive)

if snapshot_hash_after != payload["snapshotArchiveSha256"]:
    raise RuntimeError("Rollback snapshot changed during cleanup")

health = {
    "ok": False,
    "status": None,
    "error": None,
}

try:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/health",
        method="GET",
        headers={"User-Agent": "S10.4R-cleanup-verifier"},
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
    "deletedCount": len(deleted),
    "deleted": deleted,
    "legacyDeleted": not legacy_path.exists(),
    "nonAppBackupsDeleted": sum(
        1 for x in deleted if x["type"] == "NON_APP_BACKUP"
    ),
    "currentAppHashBefore": current_app_hash_before,
    "currentAppHashAfter": current_app_hash_after,
    "currentAppHashUnchanged": current_app_hash_before == current_app_hash_after,
    "snapshotArchiveExists": snapshot_archive.exists(),
    "snapshotArchiveSha256Before": snapshot_hash,
    "snapshotArchiveSha256After": snapshot_hash_after,
    "snapshotArchiveUnchanged": snapshot_hash == snapshot_hash_after,
    "retainedRecentBackups": retained_after,
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

Write-Host "`n=== 1. COPY VERIFIED PAYLOAD + HELPER TO /tmp ===" -ForegroundColor Green

& scp @sshBase $payloadPath "${VpsHost}:$remotePayload"
if ($LASTEXITCODE -ne 0) {
    throw "SCP payload failed with exit code $LASTEXITCODE"
}

& scp @sshBase $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP helper failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== 2. VERIFY HASHES + DELETE FINAL LEGACY TARGETS + POSTCHECK ===" -ForegroundColor Green

$remoteCommand = "S10_4R_PAYLOAD='$remotePayload' python3 '$remotePy'; rc=`$?; rm -f '$remotePy' '$remotePayload'; exit `$rc"
$resultLines = & ssh @sshBase $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote cleanup failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote cleanup returned empty result."
}

$resultText | Set-Content -LiteralPath $resultPath -Encoding UTF8

$result = $resultText | ConvertFrom-Json

if (-not [bool]$result.ok) {
    throw "Remote cleanup did not report ok=true"
}

if ([int]$result.deletedCount -ne 6) {
    throw "Expected 6 deleted targets, got $($result.deletedCount)"
}

if ([int]$result.nonAppBackupsDeleted -ne 5) {
    throw "Expected 5 deleted non-app backups, got $($result.nonAppBackupsDeleted)"
}

if (-not [bool]$result.legacyDeleted) {
    throw "Legacy daemon still exists after cleanup."
}

if (-not [bool]$result.currentAppHashUnchanged) {
    throw "Current app.py hash changed."
}

if (-not [bool]$result.snapshotArchiveUnchanged) {
    throw "Rollback snapshot changed."
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

if (Test-Path -LiteralPath $payloadPath) {
    Remove-Item -LiteralPath $payloadPath -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4R FINAL VPS LEGACY CLEANUP")
$lines.Add("Generated=$stamp")
$lines.Add("SourceProof=$($qResultFile.FullName)")
$lines.Add("SourceDeleteSet=$($oDeleteSetFile.FullName)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("OK=$($result.ok)")
$lines.Add("DELETED_TOTAL=$($result.deletedCount)")
$lines.Add("DELETED_NON_APP_BACKUPS=$($result.nonAppBackupsDeleted)")
$lines.Add("LEGACY_DAEMON_DELETED=$($result.legacyDeleted)")
$lines.Add("CURRENT_APP_HASH_BEFORE=$($result.currentAppHashBefore)")
$lines.Add("CURRENT_APP_HASH_AFTER=$($result.currentAppHashAfter)")
$lines.Add("CURRENT_APP_HASH_UNCHANGED=$($result.currentAppHashUnchanged)")
$lines.Add("SNAPSHOT_ARCHIVE_EXISTS=$($result.snapshotArchiveExists)")
$lines.Add("SNAPSHOT_ARCHIVE_UNCHANGED=$($result.snapshotArchiveUnchanged)")
$lines.Add("API_HEALTH_OK=$($result.health.ok)")
$lines.Add("API_HEALTH_STATUS=$($result.health.status)")
$lines.Add("API_HEALTH_ERROR=$($result.health.error)")
$lines.Add("DEPLOY_PERFORMED=$($result.deployPerformed)")
$lines.Add("RESTART_PERFORMED=$($result.restartPerformed)")
$lines.Add("SERVICE_STATE_CHANGED=$($result.serviceStateChanged)")
$lines.Add("")
$lines.Add("=== DELETED ===")

foreach ($item in @($result.deleted)) {
    $lines.Add(
        "$($item.type) | $($item.path) | sha256=$($item.sha256)"
    )
}

$lines.Add("")
$lines.Add("=== RETAINED RECENT APP BACKUPS ===")

foreach ($item in @($result.retainedRecentBackups)) {
    $lines.Add(
        "$($item.path) | exists=$($item.exists) | matchesExpected=$($item.matchesExpected) | sha256=$($item.sha256)"
    )
}

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4R COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $reportPath"
Write-Host "Result JSON: $resultPath"
Write-Host ""
Write-Host "5 non-app backups deleted." -ForegroundColor Green
Write-Host "LEGACY_CONFIRMED s10_paper_trading_daemon.py deleted." -ForegroundColor Green
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE." -ForegroundColor Yellow
