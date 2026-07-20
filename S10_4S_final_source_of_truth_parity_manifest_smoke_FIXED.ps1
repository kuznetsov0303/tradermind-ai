param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner",
    [string]$VpsRoot = "/opt/skilledge/stock-engine"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$BackendRoot = Join-Path $ProjectRoot "services\stock-engine"
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_4S_final_source_of_truth_report_$stamp.txt"
$ParityPath = Join-Path $AuditDir "S10_4S_local_vps_parity_$stamp.json"
$SmokePath = Join-Path $AuditDir "S10_4S_static_runtime_smoke_$stamp.json"
$ReqDiffPath = Join-Path $AuditDir "S10_4S_requirements_diff_$stamp.txt"
$ManifestPath = Join-Path $ProjectRoot "PRODUCTION_MANIFEST.md"

Write-Host "`n=== S10.4S FINAL SOURCE OF TRUTH / PARITY / MANIFEST / SMOKE ===" -ForegroundColor Green
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE" -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath $BackendRoot)) {
    throw "Backend root not found: $BackendRoot"
}

$canonicalFiles = New-Object System.Collections.Generic.List[object]

foreach ($rel in @("app/api/app.py", "requirements.txt")) {
    $local = Join-Path $BackendRoot ($rel -replace "/", "\")
    if (-not (Test-Path -LiteralPath $local -PathType Leaf)) {
        throw "Missing canonical local file: $rel"
    }

    $canonicalFiles.Add([pscustomobject]@{
        rel = $rel
        localPath = $local
        localSha256 = Get-Sha256 -Path $local
    })
}

$scriptRoot = Join-Path $BackendRoot "ops\scripts"
$systemdRoot = Join-Path $BackendRoot "ops\systemd"

foreach ($file in @(Get-ChildItem -LiteralPath $scriptRoot -File | Sort-Object Name)) {
    $canonicalFiles.Add([pscustomobject]@{
        rel = "ops/scripts/" + $file.Name
        localPath = $file.FullName
        localSha256 = Get-Sha256 -Path $file.FullName
    })
}

foreach ($file in @(Get-ChildItem -LiteralPath $systemdRoot -File | Sort-Object Name)) {
    $canonicalFiles.Add([pscustomobject]@{
        rel = "ops/systemd/" + $file.Name
        localPath = $file.FullName
        localSha256 = Get-Sha256 -Path $file.FullName
    })
}

foreach ($name in @(
    "run_historical_learning_backfill.py",
    "run_nightly_self_learning.py",
    "run_daily_ai_desk.py"
)) {
    $local = Join-Path $BackendRoot $name
    if (Test-Path -LiteralPath $local -PathType Leaf) {
        $canonicalFiles.Add([pscustomobject]@{
            rel = $name
            localPath = $local
            localSha256 = Get-Sha256 -Path $local
        })
    }
}

$payloadPath = Join-Path $env:TEMP "s10_4s_parity_payload_$stamp.json"
$localPy = Join-Path $env:TEMP "s10_4s_parity_$stamp.py"
$remotePayload = "/tmp/s10_4s_parity_payload_$stamp.json"
$remotePy = "/tmp/s10_4s_parity_$stamp.py"

$payload = [ordered]@{
    files = @(
        $canonicalFiles | ForEach-Object {
            [ordered]@{
                rel = [string]$_.rel
                localSha256 = [string]$_.localSha256
            }
        }
    )
}

$payload |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $payloadPath -Encoding UTF8

$pythonCode = @'
import json
import hashlib
import os
import urllib.request
from pathlib import Path

ROOT = Path("/opt/skilledge/stock-engine")
PAYLOAD = Path(os.environ["S10_4S_PAYLOAD"])

def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

with PAYLOAD.open("r", encoding="utf-8-sig") as f:
    payload = json.load(f)

files = []
for rec in payload["files"]:
    p = ROOT / rec["rel"]
    exists = p.exists() and p.is_file()
    remote_hash = sha256_file(p) if exists else None
    files.append({
        "rel": rec["rel"],
        "exists": exists,
        "localSha256": rec["localSha256"],
        "remoteSha256": remote_hash,
        "match": exists and remote_hash == rec["localSha256"],
    })

systemd = []
project_systemd = ROOT / "ops/systemd"

for p in sorted(project_systemd.glob("skilledge-*")):
    if not p.is_file():
        continue

    runtime = Path("/etc/systemd/system") / p.name
    project_hash = sha256_file(p)
    runtime_hash = sha256_file(runtime) if runtime.exists() else None

    systemd.append({
        "name": p.name,
        "projectExists": True,
        "runtimeExists": runtime.exists(),
        "projectSha256": project_hash,
        "runtimeSha256": runtime_hash,
        "match": runtime.exists() and project_hash == runtime_hash,
    })

snapshot_root = ROOT / "rollback_snapshots"
snapshots = []

if snapshot_root.exists():
    for child in sorted(snapshot_root.iterdir()):
        if not child.is_dir():
            continue

        archive = next(iter(child.glob("*.tar.gz")), None)
        manifest = child / "sha256_manifest.json"

        snapshots.append({
            "path": str(child),
            "archiveExists": archive is not None and archive.exists(),
            "archiveSha256": sha256_file(archive) if archive is not None and archive.exists() else None,
            "manifestExists": manifest.exists(),
            "manifestSha256": sha256_file(manifest) if manifest.exists() else None,
        })

health = {"ok": False, "status": None, "error": None, "body": None}

try:
    req = urllib.request.Request(
        "http://127.0.0.1:8000/health",
        method="GET",
        headers={"User-Agent": "S10.4S-final-smoke"},
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
    "files": files,
    "systemd": systemd,
    "snapshots": snapshots,
    "health": health,
    "summary": {
        "filesTotal": len(files),
        "filesMatched": sum(1 for x in files if x["match"]),
        "filesMissing": sum(1 for x in files if not x["exists"]),
        "filesDifferent": sum(1 for x in files if x["exists"] and not x["match"]),
        "systemdTotal": len(systemd),
        "systemdMatched": sum(1 for x in systemd if x["match"]),
        "systemdMissingRuntime": sum(1 for x in systemd if not x["runtimeExists"]),
        "systemdDifferent": sum(1 for x in systemd if x["runtimeExists"] and not x["match"]),
        "snapshotCount": len(snapshots),
    },
    "safety": {
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

Write-Host "`n=== 1. LOCAL <-> VPS PARITY ===" -ForegroundColor Green

& scp @sshBase $payloadPath "${VpsHost}:$remotePayload"
if ($LASTEXITCODE -ne 0) {
    throw "SCP parity payload failed with exit code $LASTEXITCODE"
}

& scp @sshBase $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP parity helper failed with exit code $LASTEXITCODE"
}

$remoteCommand = "S10_4S_PAYLOAD='$remotePayload' python3 '$remotePy'; rc=`$?; rm -f '$remotePy' '$remotePayload'; exit `$rc"
$resultLines = & ssh @sshBase $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote parity audit failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote parity audit returned empty output."
}

$resultText | Set-Content -LiteralPath $ParityPath -Encoding UTF8
$parity = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

if (Test-Path -LiteralPath $payloadPath) {
    Remove-Item -LiteralPath $payloadPath -Force
}

Write-Host "`n=== 2. REQUIREMENTS DIFF CLOSURE ===" -ForegroundColor Green

$currentReq = Join-Path $BackendRoot "requirements.txt"
$backupReq = Join-Path $ProjectRoot "audit_exports\S10_4F_reconciliation_backup_20260714_183205\requirements.txt"
$reqLines = New-Object System.Collections.Generic.List[string]

$reqLines.Add("S10.4S REQUIREMENTS DIFF CLOSURE")
$reqLines.Add("Current=$currentReq")
$reqLines.Add("Backup=$backupReq")
$reqLines.Add("")

if (Test-Path -LiteralPath $backupReq -PathType Leaf) {
    $currentRaw = [System.IO.File]::ReadAllText($currentReq)
    $backupRaw = [System.IO.File]::ReadAllText($backupReq)

    $currentNorm = ($currentRaw -replace "`r`n", "`n").TrimEnd()
    $backupNorm = ($backupRaw -replace "`r`n", "`n").TrimEnd()

    $currentHash = Get-Sha256 -Path $currentReq
    $backupHash = Get-Sha256 -Path $backupReq

    $sameNormalized = ($currentNorm -eq $backupNorm)

    $currentSet = @(
        ($currentNorm -split "`n") |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    )

    $backupSet = @(
        ($backupNorm -split "`n") |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    )

    $onlyCurrent = @($currentSet | Where-Object { $_ -notin $backupSet })
    $onlyBackup = @($backupSet | Where-Object { $_ -notin $currentSet })

    $reqLines.Add("CURRENT_SHA256=$currentHash")
    $reqLines.Add("BACKUP_SHA256=$backupHash")
    $reqLines.Add("SAME_NORMALIZED_CONTENT=$sameNormalized")
    $reqLines.Add("ONLY_CURRENT_COUNT=$($onlyCurrent.Count)")
    $reqLines.Add("ONLY_BACKUP_COUNT=$($onlyBackup.Count)")
    $reqLines.Add("")
    $reqLines.Add("=== ONLY CURRENT ===")
    foreach ($line in $onlyCurrent) { $reqLines.Add($line) }
    $reqLines.Add("")
    $reqLines.Add("=== ONLY BACKUP ===")
    foreach ($line in $onlyBackup) { $reqLines.Add($line) }
}
else {
    $reqLines.Add("BACKUP_NOT_FOUND=true")
}

[System.IO.File]::WriteAllLines(
    $ReqDiffPath,
    $reqLines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== 3. STATIC SMOKE ===" -ForegroundColor Green

$staticResults = New-Object System.Collections.Generic.List[object]

$pythonFiles = @(
    Get-ChildItem -LiteralPath $BackendRoot -Recurse -File -Filter "*.py" |
        Where-Object {
            $_.FullName -notmatch "\\\.venv\\" -and
            $_.FullName -notmatch "\\venv\\" -and
            $_.FullName -notmatch "\\__pycache__\\" -and
            $_.FullName -notmatch "\\data\\" -and
            $_.FullName -notmatch "\\reports\\"
        }
)

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$pythonLauncher = $null

if ($pythonCmd) {
    $pythonLauncher = $pythonCmd.Source
}
else {
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        $pythonLauncher = $pyCmd.Source
    }
}

foreach ($file in $pythonFiles) {
    $ok = $false
    $err = $null

    if ($pythonLauncher) {
        $tempCheck = Join-Path $env:TEMP ("s10_4s_compile_" + [guid]::NewGuid().ToString("N") + ".py")

        $checker = @"
import pathlib
p = pathlib.Path(r"$($file.FullName.Replace('"', '\"'))")
src = p.read_text(encoding="utf-8-sig")
compile(src, str(p), "exec")
print("OK")
"@

        [System.IO.File]::WriteAllText(
            $tempCheck,
            $checker,
            [System.Text.UTF8Encoding]::new($false)
        )

        try {
            $out = & $pythonLauncher $tempCheck 2>&1
            $ok = ($LASTEXITCODE -eq 0)
            if (-not $ok) {
                $err = ($out -join "`n")
            }
        }
        catch {
            $err = $_.Exception.Message
        }
        finally {
            if (Test-Path -LiteralPath $tempCheck) {
                Remove-Item -LiteralPath $tempCheck -Force
            }
        }
    }
    else {
        $err = "PYTHON_NOT_FOUND"
    }

    $staticResults.Add([pscustomobject]@{
        type = "python_syntax"
        path = $file.FullName
        ok = $ok
        error = $err
    })
}

$psFiles = @(
    Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Filter "*.ps1" |
        Where-Object {
            $_.FullName -notmatch "\\node_modules\\" -and
            $_.FullName -notmatch "\\\.git\\" -and
            $_.FullName -notmatch "\\audit_exports\\S10_4F_reconciliation_backup_"
        }
)

foreach ($file in $psFiles) {
    $tokens = $null
    $errors = $null

    [System.Management.Automation.Language.Parser]::ParseFile(
        $file.FullName,
        [ref]$tokens,
        [ref]$errors
    ) | Out-Null

    $staticResults.Add([pscustomobject]@{
        type = "powershell_parse"
        path = $file.FullName
        ok = (@($errors).Count -eq 0)
        error = if (@($errors).Count -eq 0) {
            $null
        }
        else {
            (@($errors | ForEach-Object { $_.Message }) -join " | ")
        }
    })
}

$smoke = [ordered]@{
    generated = $stamp
    pythonFilesChecked = @($staticResults | Where-Object { $_.type -eq "python_syntax" }).Count
    pythonFailures = @($staticResults | Where-Object { $_.type -eq "python_syntax" -and -not $_.ok }).Count
    powershellFilesChecked = @($staticResults | Where-Object { $_.type -eq "powershell_parse" }).Count
    powershellFailures = @($staticResults | Where-Object { $_.type -eq "powershell_parse" -and -not $_.ok }).Count
    results = $staticResults
    runtimeHealth = $parity.health
}

$smoke |
    ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $SmokePath -Encoding UTF8

Write-Host "`n=== 4. WRITE FINAL PRODUCTION MANIFEST ===" -ForegroundColor Green

$manifest = New-Object System.Collections.Generic.List[string]

$manifest.Add("# SkillEdge AI Production Manifest")
$manifest.Add("")
$manifest.Add("Generated: $stamp")
$manifest.Add("")
$manifest.Add("## Source of Truth")
$manifest.Add("")
$manifest.Add("- Production runtime root: `/opt/skilledge/stock-engine`")
$manifest.Add("- Canonical local mirror: `services/stock-engine`")
$manifest.Add("- Production engine version: `holly_persistent_v2`")
$manifest.Add("- Production API service: `skilledge-stock-engine-api.service`")
$manifest.Add("- API bind: `127.0.0.1:8000`")
$manifest.Add("")
$manifest.Add("## Active Canonical Source")
$manifest.Add("")

foreach ($f in @($canonicalFiles | Sort-Object rel)) {
    $manifest.Add("- `$($f.rel)`")
}

$manifest.Add("")
$manifest.Add("## Systemd")
$manifest.Add("")

foreach ($u in @($parity.systemd | Sort-Object name)) {
    $status = if ($u.match) {
        "MATCH"
    }
    elseif (-not $u.runtimeExists) {
        "RUNTIME_MISSING"
    }
    else {
        "DIFFERENT"
    }

    $manifest.Add("- `$($u.name)` — $status")
}

$manifest.Add("")
$manifest.Add("## Runtime Data — Do Not Treat As Source")
$manifest.Add("")
$manifest.Add("- `/opt/skilledge/stock-engine/data/`")
$manifest.Add("- `/opt/skilledge/stock-engine/reports/`")
$manifest.Add("- SQLite runtime DB")
$manifest.Add("- historical learning lake")
$manifest.Add("")
$manifest.Add("## Rollback")
$manifest.Add("")
$manifest.Add("- `/opt/skilledge/stock-engine/rollback_snapshots/`")
foreach ($snap in @($parity.snapshots)) {
    $manifest.Add("- `$($snap.path)`")
}
$manifest.Add("- Retained recent `app.py` backups: 3")
$manifest.Add("")
$manifest.Add("## Removed Legacy / Duplicate Artifacts")
$manifest.Add("")
$manifest.Add("- 87 old `app.py` backups removed")
$manifest.Add("- duplicate `ops/ops` tree removed")
$manifest.Add("- 5 non-app backup files removed")
$manifest.Add("- `ops/scripts/s10_paper_trading_daemon.py` removed after legacy proof")
$manifest.Add("")
$manifest.Add("## Protected / Do Not Touch Without Explicit Change Plan")
$manifest.Add("")
$manifest.Add("- `.env.server` and all secrets")
$manifest.Add("- payment and pricing logic")
$manifest.Add("- paper ledger and clean boundary")
$manifest.Add("- client / Telegram / research promotion gates")
$manifest.Add("- production databases and historical-learning data")
$manifest.Add("- rollback snapshots")
$manifest.Add("")
$manifest.Add("## Critical Safety Invariants")
$manifest.Add("")
$manifest.Add("- `paperOnly=true`")
$manifest.Add("- `brokerExecution=false`")
$manifest.Add("- no automatic client/TG promotion from research")
$manifest.Add("- no paper reset")
$manifest.Add("- no manual `/engine/paper/run-once` during audit/maintenance")
$manifest.Add("- research/backtest does not directly release client signals")
$manifest.Add("- current 5-minute point-quote paper evaluator is not reliable profitability proof")
$manifest.Add("")
$manifest.Add("## Verification Status")
$manifest.Add("")
$manifest.Add("- Local/VPS files matched: $($parity.summary.filesMatched) / $($parity.summary.filesTotal)")
$manifest.Add("- Local/VPS files missing on VPS: $($parity.summary.filesMissing)")
$manifest.Add("- Local/VPS files different: $($parity.summary.filesDifferent)")
$manifest.Add("- Systemd matched: $($parity.summary.systemdMatched) / $($parity.summary.systemdTotal)")
$manifest.Add("- Systemd missing runtime copies: $($parity.summary.systemdMissingRuntime)")
$manifest.Add("- Systemd different: $($parity.summary.systemdDifferent)")
$manifest.Add("- API health OK: $($parity.health.ok)")
$manifest.Add("- Static Python failures: $($smoke.pythonFailures)")
$manifest.Add("- PowerShell parse failures: $($smoke.powershellFailures)")
$manifest.Add("")
$manifest.Add("## Deployment Rule")
$manifest.Add("")
$manifest.Add("Do not perform a full local-to-VPS deploy unless parity is first re-checked, a rollback snapshot exists, and smoke tests pass.")

[System.IO.File]::WriteAllLines(
    $ManifestPath,
    $manifest,
    [System.Text.UTF8Encoding]::new($false)
)

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4S FINAL SOURCE OF TRUTH / PARITY / MANIFEST / SMOKE")
$lines.Add("Generated=$stamp")
$lines.Add("")
$lines.Add("=== LOCAL <-> VPS PARITY ===")
$lines.Add("FILES_TOTAL=$($parity.summary.filesTotal)")
$lines.Add("FILES_MATCHED=$($parity.summary.filesMatched)")
$lines.Add("FILES_MISSING=$($parity.summary.filesMissing)")
$lines.Add("FILES_DIFFERENT=$($parity.summary.filesDifferent)")
$lines.Add("")
$lines.Add("=== SYSTEMD ===")
$lines.Add("SYSTEMD_TOTAL=$($parity.summary.systemdTotal)")
$lines.Add("SYSTEMD_MATCHED=$($parity.summary.systemdMatched)")
$lines.Add("SYSTEMD_MISSING_RUNTIME=$($parity.summary.systemdMissingRuntime)")
$lines.Add("SYSTEMD_DIFFERENT=$($parity.summary.systemdDifferent)")
$lines.Add("")
$lines.Add("=== STATIC / RUNTIME SMOKE ===")
$lines.Add("PYTHON_FILES_CHECKED=$($smoke.pythonFilesChecked)")
$lines.Add("PYTHON_FAILURES=$($smoke.pythonFailures)")
$lines.Add("POWERSHELL_FILES_CHECKED=$($smoke.powershellFilesChecked)")
$lines.Add("POWERSHELL_FAILURES=$($smoke.powershellFailures)")
$lines.Add("API_HEALTH_OK=$($parity.health.ok)")
$lines.Add("API_HEALTH_STATUS=$($parity.health.status)")
$lines.Add("")
$lines.Add("=== ROLLBACK ===")
$lines.Add("ROLLBACK_SNAPSHOT_COUNT=$($parity.summary.snapshotCount)")
$lines.Add("")
$lines.Add("=== OUTPUTS ===")
$lines.Add("Manifest=$ManifestPath")
$lines.Add("Parity=$ParityPath")
$lines.Add("Smoke=$SmokePath")
$lines.Add("RequirementsDiff=$ReqDiffPath")
$lines.Add("")
$lines.Add("=== SAFETY ===")
$lines.Add("DEPLOY_PERFORMED=false")
$lines.Add("RESTART_PERFORMED=false")
$lines.Add("SERVICE_STATE_CHANGED=false")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4S COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $ReportPath"
Write-Host "Parity: $ParityPath"
Write-Host "Smoke: $SmokePath"
Write-Host "Requirements diff: $ReqDiffPath"
Write-Host "Manifest: $ManifestPath"
Write-Host ""
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE." -ForegroundColor Yellow
