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

$rawPath = Join-Path $auditDir "S10_4N_vps_cleanup_audit_raw_$stamp.json"
$reportPath = Join-Path $auditDir "S10_4N_vps_cleanup_audit_report_$stamp.txt"
$localPy = Join-Path $env:TEMP "s10_4n_vps_cleanup_audit_$stamp.py"
$remotePy = "/tmp/s10_4n_vps_cleanup_audit_$stamp.py"

Write-Host "`n=== S10.4N VPS BACKUP / LEGACY / RETENTION AUDIT FIXED ===" -ForegroundColor Green
Write-Host "READ-ONLY VPS AUDIT" -ForegroundColor Yellow
Write-Host "NO DELETE / NO MOVE / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

$pythonCode = @'
import os
import json
import hashlib
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path("/opt/skilledge/stock-engine")
SYSTEMD_DIR = Path("/etc/systemd/system")

def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def safe_rel(path: Path):
    try:
        return str(path.relative_to(ROOT))
    except Exception:
        return str(path)

def is_backup_candidate(path: Path):
    n = path.name.lower()
    s = str(path).lower()
    patterns = [
        ".bak",
        ".backup",
        "_backup",
        "backup_",
        ".old",
        ".orig",
        ".save",
    ]
    return any(p in n for p in patterns) or "/backup" in s

def active_systemd_units():
    units = []
    for p in SYSTEMD_DIR.glob("skilledge-*"):
        if p.is_file():
            try:
                txt = p.read_text(errors="replace")
            except Exception:
                txt = ""
            units.append({
                "name": p.name,
                "path": str(p),
                "content": txt,
            })
    return units

def extract_runtime_paths(units):
    refs = set()
    pattern = re.compile(r'(/opt/skilledge/stock-engine/[^\s"\']+)')
    for unit in units:
        txt = unit["content"]
        for match in pattern.findall(txt):
            refs.add(match.rstrip(";"))
    return sorted(refs)

units = active_systemd_units()
runtime_refs = extract_runtime_paths(units)

all_files = []
backup_candidates = []
hash_groups = defaultdict(list)

exclude_dirs = {
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    "data",
    "reports",
    "historical_learning",
}

for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]

    for fn in files:
        p = Path(base) / fn

        try:
            stat = p.stat()
            h = sha256_file(p)
        except Exception:
            continue

        rec = {
            "path": str(p),
            "rel": safe_rel(p),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "sha256": h,
            "backupCandidate": is_backup_candidate(p),
            "directRuntimeRef": str(p) in runtime_refs,
        }

        all_files.append(rec)
        hash_groups[h].append(rec)

        if rec["backupCandidate"]:
            backup_candidates.append(rec)

duplicate_groups = []

for h, items in hash_groups.items():
    if len(items) > 1:
        duplicate_groups.append({
            "sha256": h,
            "count": len(items),
            "items": items,
        })

legacy_target = ROOT / "ops/scripts/s10_paper_trading_daemon.py"

legacy_refs = []

if legacy_target.exists():
    target_name = legacy_target.name

    for rec in all_files:
        p = Path(rec["path"])

        if p == legacy_target:
            continue

        try:
            txt = p.read_text(errors="replace")
        except Exception:
            continue

        if target_name in txt or str(legacy_target) in txt:
            legacy_refs.append({
                "path": str(p),
                "rel": safe_rel(p),
            })

legacy_systemd_refs = []

for unit in units:
    if legacy_target.name in unit["content"] or str(legacy_target) in unit["content"]:
        legacy_systemd_refs.append(unit["name"])

ops_ops = ROOT / "ops/ops"
ops_ops_files = []

if ops_ops.exists():
    for p in ops_ops.rglob("*"):
        if p.is_file():
            try:
                ops_ops_files.append({
                    "path": str(p),
                    "rel": safe_rel(p),
                    "size": p.stat().st_size,
                    "sha256": sha256_file(p),
                })
            except Exception:
                pass

app_py = ROOT / "app/api/app.py"
app_current_hash = sha256_file(app_py) if app_py.exists() else None

app_backups = []

for p in (ROOT / "app/api").glob("app.py.bak*"):
    try:
        h = sha256_file(p)

        app_backups.append({
            "path": str(p),
            "rel": safe_rel(p),
            "size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
            "sha256": h,
            "sameAsCurrent": h == app_current_hash if app_current_hash else False,
            "directRuntimeRef": str(p) in runtime_refs,
        })
    except Exception:
        pass

app_backups_sorted = sorted(
    app_backups,
    key=lambda x: x["mtime"],
    reverse=True,
)

for i, rec in enumerate(app_backups_sorted):
    rec["retentionClass"] = (
        "KEEP_ROLLBACK_RECENT"
        if i < 3
        else "DELETE_CANDIDATE_AFTER_SNAPSHOT"
    )

payload = {
    "root": str(ROOT),
    "unitCount": len(units),
    "runtimeRefs": runtime_refs,
    "backupCandidatesCount": len(backup_candidates),
    "backupCandidates": sorted(
        backup_candidates,
        key=lambda x: x["path"],
    ),
    "duplicateGroupsCount": len(duplicate_groups),
    "duplicateGroups": duplicate_groups,
    "legacyTarget": str(legacy_target),
    "legacyTargetExists": legacy_target.exists(),
    "legacyTargetDirectRuntimeRef": str(legacy_target) in runtime_refs,
    "legacyRefs": legacy_refs,
    "legacySystemdRefs": legacy_systemd_refs,
    "opsOpsExists": ops_ops.exists(),
    "opsOpsFilesCount": len(ops_ops_files),
    "opsOpsFiles": ops_ops_files,
    "appCurrentHash": app_current_hash,
    "appBackupsCount": len(app_backups_sorted),
    "appBackups": app_backups_sorted,
}

print(json.dumps(payload, ensure_ascii=False))
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

Write-Host "`n=== 1. COPY TEMP AUDIT HELPER TO /tmp ===" -ForegroundColor Green

& scp @sshBase $localPy "${VpsHost}:$remotePy"

if ($LASTEXITCODE -ne 0) {
    throw "SCP failed with exit code $LASTEXITCODE"
}

Write-Host "`n=== 2. RUN READ-ONLY REMOTE AUDIT ===" -ForegroundColor Green

$jsonLines = & ssh @sshBase $VpsHost "python3 '$remotePy'; rc=`$?; rm -f '$remotePy'; exit `$rc"

if ($LASTEXITCODE -ne 0) {
    throw "Remote audit failed with exit code $LASTEXITCODE"
}

$jsonText = $jsonLines -join "`n"

if ([string]::IsNullOrWhiteSpace($jsonText)) {
    throw "Remote audit returned empty output."
}

$jsonText | Set-Content -LiteralPath $rawPath -Encoding UTF8

$data = $jsonText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

Write-Host "`n=== 3. SUMMARIZE ===" -ForegroundColor Green

$backupCount = [int]$data.backupCandidatesCount
$dupCount = [int]$data.duplicateGroupsCount
$appBackupCount = [int]$data.appBackupsCount
$opsOpsCount = [int]$data.opsOpsFilesCount
$legacyExists = [bool]$data.legacyTargetExists
$legacyDirect = [bool]$data.legacyTargetDirectRuntimeRef
$legacyRefCount = @($data.legacyRefs).Count
$legacySystemdRefCount = @($data.legacySystemdRefs).Count

$keepRollback = @(
    $data.appBackups |
        Where-Object { $_.retentionClass -eq "KEEP_ROLLBACK_RECENT" }
)

$deleteAfterSnapshot = @(
    $data.appBackups |
        Where-Object { $_.retentionClass -eq "DELETE_CANDIDATE_AFTER_SNAPSHOT" }
)

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4N VPS BACKUP / LEGACY / RETENTION AUDIT")
$lines.Add("Generated=$stamp")
$lines.Add("READ_ONLY=true")
$lines.Add("NO_DELETE=true")
$lines.Add("NO_MOVE=true")
$lines.Add("NO_DEPLOY=true")
$lines.Add("NO_RESTART=true")
$lines.Add("")
$lines.Add("=== SUMMARY ===")
$lines.Add("VPS_ROOT=$($data.root)")
$lines.Add("SYSTEMD_UNITS=$($data.unitCount)")
$lines.Add("BACKUP_CANDIDATES=$backupCount")
$lines.Add("DUPLICATE_HASH_GROUPS=$dupCount")
$lines.Add("APP_PY_BACKUPS=$appBackupCount")
$lines.Add("APP_PY_KEEP_ROLLBACK_RECENT=$($keepRollback.Count)")
$lines.Add("APP_PY_DELETE_CANDIDATE_AFTER_SNAPSHOT=$($deleteAfterSnapshot.Count)")
$lines.Add("OPS_OPS_EXISTS=$($data.opsOpsExists)")
$lines.Add("OPS_OPS_FILES=$opsOpsCount")
$lines.Add("LEGACY_TARGET_EXISTS=$legacyExists")
$lines.Add("LEGACY_TARGET_DIRECT_RUNTIME_REF=$legacyDirect")
$lines.Add("LEGACY_TARGET_FILE_REFS=$legacyRefCount")
$lines.Add("LEGACY_TARGET_SYSTEMD_REFS=$legacySystemdRefCount")
$lines.Add("")
$lines.Add("=== LEGACY TARGET ===")
$lines.Add("$($data.legacyTarget)")

foreach ($r in @($data.legacyRefs)) {
    $lines.Add("FILE_REF=$($r.rel)")
}

foreach ($r in @($data.legacySystemdRefs)) {
    $lines.Add("SYSTEMD_REF=$r")
}

$lines.Add("")
$lines.Add("=== APP.PY BACKUP RETENTION ===")

foreach ($b in @($data.appBackups)) {
    $lines.Add(
        "$($b.retentionClass) | $($b.rel) | size=$($b.size) | sha256=$($b.sha256) | sameAsCurrent=$($b.sameAsCurrent) | directRuntimeRef=$($b.directRuntimeRef)"
    )
}

$lines.Add("")
$lines.Add("=== OPS/OPS FILES ===")

foreach ($f in @($data.opsOpsFiles)) {
    $lines.Add("$($f.rel) | size=$($f.size) | sha256=$($f.sha256)")
}

$lines.Add("")
$lines.Add("=== NEXT SAFE RULE ===")
$lines.Add("Do not delete any VPS backup before clean rollback snapshot and verified production manifest.")
$lines.Add("Keep at least the newest 3 app.py backups unless a later explicit retention decision changes this.")
$lines.Add("Delete only backups and duplicates that are not runtime-referenced and have been covered by rollback snapshot.")
$lines.Add("Do not classify s10_paper_trading_daemon.py as legacy solely from filename; require zero active direct and indirect references.")

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4N COMPLETE ===" -ForegroundColor Green
Write-Host "Raw JSON: $rawPath"
Write-Host "Report: $reportPath"
Write-Host ""
Write-Host "Upload both files to ChatGPT." -ForegroundColor Cyan
Write-Host "NO DELETE / NO MOVE / NO DEPLOY / NO RESTART performed." -ForegroundColor Yellow
