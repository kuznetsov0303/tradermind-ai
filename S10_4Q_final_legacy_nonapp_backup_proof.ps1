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

$deleteSetFile = Get-ChildItem -LiteralPath $auditDir -Filter "S10_4O_verified_vps_delete_set_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $deleteSetFile) {
    throw "No S10.4O delete set found."
}

$deleteSet = Get-Content -LiteralPath $deleteSetFile.FullName -Raw | ConvertFrom-Json

$nonAppBackups = @($deleteSet.reviewRequired.nonAppBackups)
$legacy = $deleteSet.reviewRequired.legacyCandidate

if ($nonAppBackups.Count -ne 5) {
    throw "Expected 5 non-app backups, got $($nonAppBackups.Count)."
}

$payloadPath = Join-Path $env:TEMP "s10_4q_payload_$stamp.json"
$localPy = Join-Path $env:TEMP "s10_4q_final_legacy_proof_$stamp.py"
$remotePayload = "/tmp/s10_4q_payload_$stamp.json"
$remotePy = "/tmp/s10_4q_final_legacy_proof_$stamp.py"

$reportPath = Join-Path $auditDir "S10_4Q_final_legacy_nonapp_proof_report_$stamp.txt"
$resultPath = Join-Path $auditDir "S10_4Q_final_legacy_nonapp_proof_result_$stamp.json"

$payload = [ordered]@{
    nonAppBackups = @(
        $nonAppBackups | ForEach-Object {
            [ordered]@{
                path = [string]$_.path
                rel = [string]$_.rel
                sha256 = [string]$_.sha256
            }
        }
    )
    legacyCandidate = [ordered]@{
        path = [string]$legacy.path
        rel = [string]$legacy.rel
    }
}

$payload |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $payloadPath -Encoding UTF8

Write-Host "`n=== S10.4Q FINAL LEGACY / NON-APP BACKUP PROOF ===" -ForegroundColor Green
Write-Host "READ-ONLY" -ForegroundColor Yellow
Write-Host "NO DELETE / NO MOVE / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

$pythonCode = @'
import os
import json
import hashlib
import re
from pathlib import Path

ROOT = Path("/opt/skilledge/stock-engine")
SYSTEMD_DIR = Path("/etc/systemd/system")
PAYLOAD_PATH = Path(os.environ["S10_4Q_PAYLOAD"])

EXCLUDE_DIR_NAMES = {
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    "data",
    "reports",
    "historical_learning",
    "rollback_snapshots",
}

TEXT_EXTENSIONS = {
    ".py", ".sh", ".ps1", ".service", ".timer", ".md", ".txt",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg",
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

def safe_text(path: Path):
    try:
        return path.read_text(errors="replace")
    except Exception:
        return ""

def is_excluded(path: Path):
    try:
        rel_parts = path.relative_to(ROOT).parts
    except Exception:
        rel_parts = path.parts

    return any(part in EXCLUDE_DIR_NAMES for part in rel_parts)

def collect_first_party_text_files():
    files = []

    for base, dirs, names in os.walk(ROOT):
        base_path = Path(base)

        dirs[:] = [
            d for d in dirs
            if d not in EXCLUDE_DIR_NAMES
        ]

        for name in names:
            p = base_path / name

            if is_excluded(p):
                continue

            if p.suffix.lower() in TEXT_EXTENSIONS or "." not in p.name:
                files.append(p)

    for p in SYSTEMD_DIR.glob("skilledge-*"):
        if p.is_file():
            files.append(p)

    return sorted(set(files), key=lambda p: str(p))

def find_references(target: Path, text_files):
    target_name = target.name
    target_abs = str(target)
    target_rel = None

    try:
        target_rel = str(target.relative_to(ROOT))
    except Exception:
        target_rel = None

    refs = []

    for p in text_files:
        if p == target:
            continue

        txt = safe_text(p)

        hits = []

        for needle in [target_name, target_abs, target_rel]:
            if needle and needle in txt:
                hits.append(needle)

        if hits:
            refs.append({
                "file": str(p),
                "hits": sorted(set(hits)),
            })

    return refs

def infer_current_candidate(backup_path: Path):
    name = backup_path.name

    if ".bak" not in name:
        return None

    current_name = name.split(".bak", 1)[0]
    return backup_path.with_name(current_name)

def classify_non_app_backup(rec, text_files):
    p = Path(rec["path"])

    result = {
        "path": str(p),
        "rel": rec["rel"],
        "expectedSha256": rec["sha256"],
        "exists": p.exists(),
        "actualSha256": None,
        "hashMatchesAudit": False,
        "currentCandidate": None,
        "currentExists": False,
        "currentSha256": None,
        "sameAsCurrent": False,
        "references": [],
        "classification": "REVIEW_REQUIRED",
        "reason": "",
    }

    if not p.exists():
        result["reason"] = "BACKUP_MISSING"
        return result

    actual = sha256_file(p)
    result["actualSha256"] = actual
    result["hashMatchesAudit"] = actual == rec["sha256"]

    current = infer_current_candidate(p)

    if current is not None:
        result["currentCandidate"] = str(current)
        result["currentExists"] = current.exists()

        if current.exists():
            current_hash = sha256_file(current)
            result["currentSha256"] = current_hash
            result["sameAsCurrent"] = current_hash == actual

    refs = find_references(p, text_files)
    result["references"] = refs

    if (
        result["hashMatchesAudit"]
        and len(refs) == 0
        and result["currentExists"]
    ):
        result["classification"] = "DELETE_CANDIDATE"
        result["reason"] = (
            "BACKUP_HASH_VERIFIED_NO_REFERENCES_CURRENT_CANONICAL_EXISTS"
        )
    elif (
        result["hashMatchesAudit"]
        and len(refs) == 0
        and not result["currentExists"]
    ):
        result["classification"] = "REVIEW_REQUIRED"
        result["reason"] = "NO_REFERENCES_BUT_CURRENT_CANONICAL_NOT_FOUND"
    elif len(refs) > 0:
        result["classification"] = "KEEP_OR_REVIEW"
        result["reason"] = "REFERENCED_BY_FIRST_PARTY_OR_SYSTEMD"
    else:
        result["classification"] = "REVIEW_REQUIRED"
        result["reason"] = "UNRESOLVED"

    return result

with PAYLOAD_PATH.open("r", encoding="utf-8-sig") as f:
    payload = json.load(f)

text_files = collect_first_party_text_files()

non_app_results = [
    classify_non_app_backup(rec, text_files)
    for rec in payload["nonAppBackups"]
]

legacy_path = Path(payload["legacyCandidate"]["path"])

legacy_result = {
    "path": str(legacy_path),
    "exists": legacy_path.exists(),
    "sha256": sha256_file(legacy_path) if legacy_path.exists() else None,
    "references": [],
    "systemdDirectRefs": [],
    "classification": "REVIEW_REQUIRED",
    "reason": "",
}

if legacy_path.exists():
    refs = find_references(legacy_path, text_files)
    legacy_result["references"] = refs

    for p in SYSTEMD_DIR.glob("skilledge-*"):
        if not p.is_file():
            continue
        txt = safe_text(p)
        if legacy_path.name in txt or str(legacy_path) in txt:
            legacy_result["systemdDirectRefs"].append(str(p))

    if (
        len(legacy_result["references"]) == 0
        and len(legacy_result["systemdDirectRefs"]) == 0
    ):
        legacy_result["classification"] = "LEGACY_CONFIRMED"
        legacy_result["reason"] = (
            "ZERO_FIRST_PARTY_REFERENCES_ZERO_SYSTEMD_REFERENCES"
        )
    else:
        legacy_result["classification"] = "KEEP_OR_REVIEW"
        legacy_result["reason"] = "REFERENCES_FOUND"
else:
    legacy_result["classification"] = "ALREADY_ABSENT"
    legacy_result["reason"] = "FILE_NOT_PRESENT"

# Snapshot retention inventory only; no deletion decision yet.
snapshot_root = ROOT / "rollback_snapshots"
snapshots = []

if snapshot_root.exists():
    for child in sorted(snapshot_root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not child.is_dir():
            continue

        files = []
        total_size = 0

        for p in child.rglob("*"):
            if p.is_file():
                total_size += p.stat().st_size
                files.append({
                    "path": str(p),
                    "size": p.stat().st_size,
                    "sha256": sha256_file(p),
                })

        snapshots.append({
            "path": str(child),
            "mtime": child.stat().st_mtime,
            "fileCount": len(files),
            "totalSize": total_size,
            "files": files,
        })

result = {
    "ok": True,
    "readOnly": True,
    "textFilesScanned": len(text_files),
    "nonAppBackups": non_app_results,
    "legacy": legacy_result,
    "rollbackSnapshots": snapshots,
    "summary": {
        "nonAppDeleteCandidates": sum(
            1 for x in non_app_results
            if x["classification"] == "DELETE_CANDIDATE"
        ),
        "nonAppReviewRequired": sum(
            1 for x in non_app_results
            if x["classification"] != "DELETE_CANDIDATE"
        ),
        "legacyClassification": legacy_result["classification"],
        "rollbackSnapshotCount": len(snapshots),
    },
    "safety": {
        "deletePerformed": False,
        "movePerformed": False,
        "deployPerformed": False,
        "restartPerformed": False,
        "serviceStateChanged": False,
    },
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

Write-Host "`n=== 1. COPY READ-ONLY AUDIT PAYLOAD + HELPER TO /tmp ===" -ForegroundColor Green

& scp @sshBase $payloadPath "${VpsHost}:$remotePayload"
if ($LASTEXITCODE -ne 0) {
    throw "SCP payload failed with exit code $LASTEXITCODE"
}

& scp @sshBase $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP helper failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== 2. RUN READ-ONLY DEPENDENCY / LEGACY PROOF ===" -ForegroundColor Green

$remoteCommand = "S10_4Q_PAYLOAD='$remotePayload' python3 '$remotePy'; rc=`$?; rm -f '$remotePy' '$remotePayload'; exit `$rc"
$resultLines = & ssh @sshBase $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote proof audit failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote proof audit returned empty output."
}

$resultText | Set-Content -LiteralPath $resultPath -Encoding UTF8

$result = $resultText | ConvertFrom-Json

if (-not [bool]$result.ok) {
    throw "Remote proof audit did not report ok=true"
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

if (Test-Path -LiteralPath $payloadPath) {
    Remove-Item -LiteralPath $payloadPath -Force
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4Q FINAL LEGACY / NON-APP BACKUP PROOF")
$lines.Add("Generated=$stamp")
$lines.Add("READ_ONLY=true")
$lines.Add("NO_DELETE=true")
$lines.Add("NO_MOVE=true")
$lines.Add("NO_DEPLOY=true")
$lines.Add("NO_RESTART=true")
$lines.Add("")
$lines.Add("=== SUMMARY ===")
$lines.Add("TEXT_FILES_SCANNED=$($result.textFilesScanned)")
$lines.Add("NON_APP_DELETE_CANDIDATES=$($result.summary.nonAppDeleteCandidates)")
$lines.Add("NON_APP_REVIEW_REQUIRED=$($result.summary.nonAppReviewRequired)")
$lines.Add("LEGACY_CLASSIFICATION=$($result.summary.legacyClassification)")
$lines.Add("ROLLBACK_SNAPSHOT_COUNT=$($result.summary.rollbackSnapshotCount)")
$lines.Add("")
$lines.Add("=== NON-APP BACKUPS ===")

foreach ($item in @($result.nonAppBackups)) {
    $lines.Add(
        "$($item.classification) | $($item.rel) | " +
        "hashMatchesAudit=$($item.hashMatchesAudit) | " +
        "currentExists=$($item.currentExists) | " +
        "sameAsCurrent=$($item.sameAsCurrent) | " +
        "refs=$(@($item.references).Count) | " +
        "reason=$($item.reason)"
    )
}

$lines.Add("")
$lines.Add("=== LEGACY TARGET ===")
$lines.Add("PATH=$($result.legacy.path)")
$lines.Add("EXISTS=$($result.legacy.exists)")
$lines.Add("CLASSIFICATION=$($result.legacy.classification)")
$lines.Add("REFERENCES=$(@($result.legacy.references).Count)")
$lines.Add("SYSTEMD_DIRECT_REFS=$(@($result.legacy.systemdDirectRefs).Count)")
$lines.Add("REASON=$($result.legacy.reason)")
$lines.Add("")
$lines.Add("=== ROLLBACK SNAPSHOTS ===")

foreach ($snap in @($result.rollbackSnapshots)) {
    $lines.Add(
        "$($snap.path) | files=$($snap.fileCount) | bytes=$($snap.totalSize)"
    )
}

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4Q COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $reportPath"
Write-Host "Result JSON: $resultPath"
Write-Host ""
Write-Host "NO DELETE / NO MOVE / NO DEPLOY / NO RESTART performed." -ForegroundColor Yellow
