param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner",
    [string]$VpsRoot = "/opt/skilledge/stock-engine"
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
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

$auditDir = Join-Path $ProjectRoot "audit_exports"
New-Item -ItemType Directory -Force -Path $auditDir | Out-Null

$latestAudit = Get-ChildItem -LiteralPath $auditDir -Filter "S10_4N_vps_cleanup_audit_raw_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestAudit) {
    throw "No S10.4N raw audit JSON found."
}

$audit = Get-Content -LiteralPath $latestAudit.FullName -Raw | ConvertFrom-Json

$localPy = Join-Path $env:TEMP "s10_4o_rollback_snapshot_$stamp.py"
$remotePy = "/tmp/s10_4o_rollback_snapshot_$stamp.py"

$reportPath = Join-Path $auditDir "S10_4O_rollback_snapshot_report_$stamp.txt"
$deleteSetPath = Join-Path $auditDir "S10_4O_verified_vps_delete_set_$stamp.json"

Write-Host "`n=== S10.4O CLEAN ROLLBACK SNAPSHOT + VERIFIED VPS DELETE SET ===" -ForegroundColor Green
Write-Host "Creates protected rollback snapshot on VPS." -ForegroundColor Yellow
Write-Host "NO DELETE / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

# Build expected keep/delete metadata from audited state.
$appBackups = @($audit.appBackups)
$keepRecent = @($appBackups | Where-Object { $_.retentionClass -eq "KEEP_ROLLBACK_RECENT" })
$deleteOldApp = @($appBackups | Where-Object { $_.retentionClass -eq "DELETE_CANDIDATE_AFTER_SNAPSHOT" })

$nonAppBackups = @(
    $audit.backupCandidates |
        Where-Object { -not ([string]$_.rel).StartsWith("app/api/app.py.bak") }
)

$opsOps = @($audit.opsOpsFiles)

$legacyCandidate = [pscustomobject]@{
    path = [string]$audit.legacyTarget
    rel = "ops/scripts/s10_paper_trading_daemon.py"
    classification = if (
        [bool]$audit.legacyTargetExists -and
        -not [bool]$audit.legacyTargetDirectRuntimeRef -and
        @($audit.legacyRefs).Count -eq 0 -and
        @($audit.legacySystemdRefs).Count -eq 0
    ) {
        "LEGACY_CANDIDATE"
    }
    else {
        "REVIEW_REQUIRED"
    }
}

# Remote helper creates snapshot and verifies it.
$pythonCode = @'
import os
import json
import hashlib
import tarfile
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/opt/skilledge/stock-engine")
SNAPSHOT_BASE = ROOT / "rollback_snapshots"
STAMP = os.environ.get("S10_4O_STAMP", "unknown")
SNAPSHOT_DIR = SNAPSHOT_BASE / f"S10_4O_{STAMP}"
ARCHIVE_PATH = SNAPSHOT_DIR / f"skilledge_rollback_{STAMP}.tar.gz"
HASH_MANIFEST = SNAPSHOT_DIR / "sha256_manifest.json"

INCLUDE_PATHS = [
    ROOT / "app/api/app.py",
    ROOT / "requirements.txt",
    ROOT / "ops/scripts",
    ROOT / "ops/systemd",
    ROOT / ".env.server",
]

EXCLUDE_NAMES = {
    "__pycache__",
    ".pyc",
    ".pyo",
}

def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def should_include(path: Path):
    for part in path.parts:
        if part == "__pycache__":
            return False
    if path.suffix in {".pyc", ".pyo"}:
        return False
    return True

SNAPSHOT_DIR.mkdir(parents=True, exist_ok=False)
os.chmod(SNAPSHOT_DIR, 0o700)

source_files = []

for include in INCLUDE_PATHS:
    if not include.exists():
        raise RuntimeError(f"Required snapshot path missing: {include}")

    if include.is_file():
        source_files.append(include)
    else:
        for p in include.rglob("*"):
            if p.is_file() and should_include(p):
                source_files.append(p)

source_files = sorted(set(source_files), key=lambda p: str(p))

manifest = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "root": str(ROOT),
    "snapshotDir": str(SNAPSHOT_DIR),
    "archivePath": str(ARCHIVE_PATH),
    "files": [],
}

for p in source_files:
    rel = str(p.relative_to(ROOT))
    stat = p.stat()
    manifest["files"].append({
        "rel": rel,
        "size": stat.st_size,
        "sha256": sha256_file(p),
        "mode": oct(stat.st_mode & 0o777),
    })

with tarfile.open(ARCHIVE_PATH, "w:gz") as tar:
    for p in source_files:
        arcname = str(p.relative_to(ROOT))
        tar.add(p, arcname=arcname, recursive=False)

os.chmod(ARCHIVE_PATH, 0o600)

# Verify archive contents and hashes.
archive_members = {}
with tarfile.open(ARCHIVE_PATH, "r:gz") as tar:
    for member in tar.getmembers():
        if member.isfile():
            extracted = tar.extractfile(member)
            if extracted is None:
                raise RuntimeError(f"Could not read archive member: {member.name}")
            h = hashlib.sha256()
            while True:
                chunk = extracted.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
            archive_members[member.name] = {
                "size": member.size,
                "sha256": h.hexdigest(),
            }

verified = True
errors = []

for rec in manifest["files"]:
    rel = rec["rel"]
    archived = archive_members.get(rel)

    if archived is None:
        verified = False
        errors.append(f"missing_in_archive:{rel}")
        continue

    if archived["size"] != rec["size"]:
        verified = False
        errors.append(f"size_mismatch:{rel}")

    if archived["sha256"] != rec["sha256"]:
        verified = False
        errors.append(f"hash_mismatch:{rel}")

manifest["archiveVerified"] = verified
manifest["verificationErrors"] = errors
manifest["archiveSha256"] = sha256_file(ARCHIVE_PATH)
manifest["archiveSize"] = ARCHIVE_PATH.stat().st_size

with HASH_MANIFEST.open("w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

os.chmod(HASH_MANIFEST, 0o600)

if not verified:
    raise RuntimeError("Rollback snapshot verification failed")

summary = {
    "ok": True,
    "snapshotDir": str(SNAPSHOT_DIR),
    "archivePath": str(ARCHIVE_PATH),
    "manifestPath": str(HASH_MANIFEST),
    "fileCount": len(manifest["files"]),
    "archiveSize": manifest["archiveSize"],
    "archiveSha256": manifest["archiveSha256"],
    "archiveVerified": manifest["archiveVerified"],
    "containsEnvServer": any(x["rel"] == ".env.server" for x in manifest["files"]),
    "permissions": {
        "snapshotDir": oct(SNAPSHOT_DIR.stat().st_mode & 0o777),
        "archive": oct(ARCHIVE_PATH.stat().st_mode & 0o777),
        "manifest": oct(HASH_MANIFEST.stat().st_mode & 0o777),
    },
}

print(json.dumps(summary, ensure_ascii=False))
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

Write-Host "`n=== 1. COPY TEMP SNAPSHOT HELPER TO /tmp ===" -ForegroundColor Green

& scp @sshBase $localPy "${VpsHost}:$remotePy"

if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== 2. CREATE + VERIFY PROTECTED ROLLBACK SNAPSHOT ===" -ForegroundColor Green

$remoteCommand = "S10_4O_STAMP='$stamp' python3 '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"
$resultLines = & ssh @sshBase $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote snapshot creation failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"
$snapshot = $resultText | ConvertFrom-Json

if (-not [bool]$snapshot.ok) {
    throw "Remote snapshot did not report ok=true"
}

if (-not [bool]$snapshot.archiveVerified) {
    throw "Remote snapshot did not verify successfully"
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

Write-Host "Snapshot verified: $($snapshot.archivePath)" -ForegroundColor Green

# Build exact delete set locally from audited evidence.
$deleteSet = [ordered]@{
    generated = $stamp
    sourceAudit = $latestAudit.FullName
    snapshot = [ordered]@{
        created = $true
        archiveVerified = [bool]$snapshot.archiveVerified
        snapshotDir = [string]$snapshot.snapshotDir
        archivePath = [string]$snapshot.archivePath
        manifestPath = [string]$snapshot.manifestPath
        archiveSha256 = [string]$snapshot.archiveSha256
        archiveSize = [long]$snapshot.archiveSize
        containsEnvServer = [bool]$snapshot.containsEnvServer
        permissions = $snapshot.permissions
    }
    keep = [ordered]@{
        appBackupsRecent = @(
            $keepRecent | ForEach-Object {
                [ordered]@{
                    path = [string]$_.path
                    rel = [string]$_.rel
                    sha256 = [string]$_.sha256
                    reason = "KEEP_ROLLBACK_RECENT"
                }
            }
        )
    }
    deleteAfterSnapshot = [ordered]@{
        oldAppBackups = @(
            $deleteOldApp | ForEach-Object {
                [ordered]@{
                    path = [string]$_.path
                    rel = [string]$_.rel
                    sha256 = [string]$_.sha256
                    directRuntimeRef = [bool]$_.directRuntimeRef
                    reason = "OLD_APP_BACKUP_NOT_RUNTIME_REFERENCED"
                }
            }
        )
        opsOpsExactDuplicates = @(
            $opsOps | ForEach-Object {
                [ordered]@{
                    path = [string]$_.path
                    rel = [string]$_.rel
                    sha256 = [string]$_.sha256
                    reason = "EXACT_DUPLICATE_OF_CANONICAL_OPS_TREE"
                }
            }
        )
    }
    reviewRequired = [ordered]@{
        nonAppBackups = @(
            $nonAppBackups | ForEach-Object {
                [ordered]@{
                    path = [string]$_.path
                    rel = [string]$_.rel
                    sha256 = [string]$_.sha256
                    directRuntimeRef = [bool]$_.directRuntimeRef
                    reason = "NON_APP_BACKUP_REQUIRES_RETENTION_DECISION"
                }
            }
        )
        legacyCandidate = $legacyCandidate
    }
    safety = [ordered]@{
        noDeletePerformed = $true
        noDeployPerformed = $true
        noRestartPerformed = $true
        currentAppHash = [string]$audit.appCurrentHash
    }
}

$deleteSet |
    ConvertTo-Json -Depth 12 |
    Set-Content -LiteralPath $deleteSetPath -Encoding UTF8

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4O CLEAN ROLLBACK SNAPSHOT + VERIFIED VPS DELETE SET")
$lines.Add("Generated=$stamp")
$lines.Add("")
$lines.Add("=== SNAPSHOT ===")
$lines.Add("SNAPSHOT_CREATED=true")
$lines.Add("SNAPSHOT_VERIFIED=$($snapshot.archiveVerified)")
$lines.Add("SNAPSHOT_DIR=$($snapshot.snapshotDir)")
$lines.Add("ARCHIVE_PATH=$($snapshot.archivePath)")
$lines.Add("MANIFEST_PATH=$($snapshot.manifestPath)")
$lines.Add("ARCHIVE_SHA256=$($snapshot.archiveSha256)")
$lines.Add("ARCHIVE_SIZE=$($snapshot.archiveSize)")
$lines.Add("FILE_COUNT=$($snapshot.fileCount)")
$lines.Add("CONTAINS_ENV_SERVER=$($snapshot.containsEnvServer)")
$lines.Add("SNAPSHOT_DIR_MODE=$($snapshot.permissions.snapshotDir)")
$lines.Add("ARCHIVE_MODE=$($snapshot.permissions.archive)")
$lines.Add("MANIFEST_MODE=$($snapshot.permissions.manifest)")
$lines.Add("")
$lines.Add("=== VERIFIED DELETE SET ===")
$lines.Add("KEEP_RECENT_APP_BACKUPS=$($keepRecent.Count)")
$lines.Add("DELETE_OLD_APP_BACKUPS_AFTER_SNAPSHOT=$($deleteOldApp.Count)")
$lines.Add("DELETE_OPS_OPS_EXACT_DUPLICATES=$($opsOps.Count)")
$lines.Add("REVIEW_NON_APP_BACKUPS=$($nonAppBackups.Count)")
$lines.Add("LEGACY_CANDIDATE_CLASS=$($legacyCandidate.classification)")
$lines.Add("LEGACY_CANDIDATE_PATH=$($legacyCandidate.path)")
$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("DELETE_PERFORMED=false")
$lines.Add("DEPLOY_PERFORMED=false")
$lines.Add("RESTART_PERFORMED=false")
$lines.Add("CURRENT_APP_HASH=$($audit.appCurrentHash)")
$lines.Add("")
$lines.Add("=== OUTPUTS ===")
$lines.Add("DeleteSet=$deleteSetPath")

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4O COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $reportPath"
Write-Host "Delete set: $deleteSetPath"
Write-Host ""
Write-Host "Rollback snapshot created and verified." -ForegroundColor Green
Write-Host "NO DELETE / NO DEPLOY / NO RESTART performed." -ForegroundColor Yellow
