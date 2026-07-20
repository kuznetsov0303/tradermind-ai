param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$VpsHost = "root@178.104.184.138",
    [string]$SshKey = "$env:USERPROFILE\.ssh\skilledge_hetzner"
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
$SystemdRoot = Join-Path $BackendRoot "ops\systemd"
$AuditDir = Join-Path $ProjectRoot "audit_exports"
$ManifestPath = Join-Path $ProjectRoot "PRODUCTION_MANIFEST.md"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$ReportPath = Join-Path $AuditDir "S10_4T_final_31_unit_runtime_reconciliation_report_$stamp.txt"
$SystemdJsonPath = Join-Path $AuditDir "S10_4T_31_unit_systemd_runtime_parity_$stamp.json"
$SmokeJsonPath = Join-Path $AuditDir "S10_4T_clean_static_smoke_$stamp.json"
$ReqPath = Join-Path $AuditDir "S10_4T_requirements_sanity_$stamp.txt"

Write-Host ""
Write-Host "=== S10.4T FINAL 31-UNIT SYSTEMD RUNTIME RECONCILIATION ===" -ForegroundColor Green
Write-Host "READ-ONLY REMOTE AUDIT" -ForegroundColor Yellow
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE" -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath $SystemdRoot)) {
    throw "Local canonical systemd directory not found: $SystemdRoot"
}

$localUnits = @(
    Get-ChildItem -LiteralPath $SystemdRoot -File |
        Where-Object { $_.Name -like "skilledge-*" } |
        Sort-Object Name
)

if ($localUnits.Count -ne 31) {
    throw "Expected exactly 31 local canonical systemd units, got $($localUnits.Count)."
}

$payload = [ordered]@{
    units = @(
        $localUnits | ForEach-Object {
            [ordered]@{
                name = $_.Name
                localSha256 = Get-Sha256 -Path $_.FullName
            }
        }
    )
}

$payloadPath = Join-Path $env:TEMP "s10_4t_systemd_payload_$stamp.json"
$localPy = Join-Path $env:TEMP "s10_4t_systemd_audit_$stamp.py"
$remotePayload = "/tmp/s10_4t_systemd_payload_$stamp.json"
$remotePy = "/tmp/s10_4t_systemd_audit_$stamp.py"

$payload |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $payloadPath -Encoding UTF8

$pythonCode = @'
import json
import hashlib
import os
from pathlib import Path

PAYLOAD = Path(os.environ["S10_4T_PAYLOAD"])
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

with PAYLOAD.open("r", encoding="utf-8-sig") as f:
    payload = json.load(f)

units = []

for rec in payload["units"]:
    runtime = SYSTEMD_DIR / rec["name"]
    exists = runtime.exists()
    is_symlink = runtime.is_symlink()
    resolved = None

    if exists:
        try:
            resolved = str(runtime.resolve())
        except Exception:
            resolved = None

    remote_hash = sha256_file(runtime) if exists and runtime.is_file() else None

    if not exists:
        status = "RUNTIME_MISSING"
    elif remote_hash == rec["localSha256"]:
        status = "MATCH"
    else:
        status = "DIFFERENT"

    units.append({
        "name": rec["name"],
        "runtimePath": str(runtime),
        "exists": exists,
        "isSymlink": is_symlink,
        "resolvedPath": resolved,
        "localSha256": rec["localSha256"],
        "runtimeSha256": remote_hash,
        "status": status,
    })

result = {
    "ok": True,
    "units": units,
    "summary": {
        "total": len(units),
        "matched": sum(1 for x in units if x["status"] == "MATCH"),
        "missing": sum(1 for x in units if x["status"] == "RUNTIME_MISSING"),
        "different": sum(1 for x in units if x["status"] == "DIFFERENT"),
        "symlinks": sum(1 for x in units if x["isSymlink"]),
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

$sshArgs = @(
    "-i", $SshKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== 1. VERIFY ALL 31 LOCAL CANONICAL UNITS AGAINST /etc/systemd/system ===" -ForegroundColor Green

& scp @sshArgs $payloadPath "${VpsHost}:$remotePayload"
if ($LASTEXITCODE -ne 0) {
    throw "SCP payload failed with exit code $LASTEXITCODE"
}

& scp @sshArgs $localPy "${VpsHost}:$remotePy"
if ($LASTEXITCODE -ne 0) {
    throw "SCP helper failed with exit code $LASTEXITCODE"
}

$remoteCommand = "S10_4T_PAYLOAD='$remotePayload' python3 '$remotePy'; rc=`$?; rm -f '$remotePy' '$remotePayload'; exit `$rc"
$resultLines = & ssh @sshArgs $VpsHost $remoteCommand

if ($LASTEXITCODE -ne 0) {
    throw "Remote systemd reconciliation failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"

if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Remote systemd reconciliation returned empty output."
}

$resultText | Set-Content -LiteralPath $SystemdJsonPath -Encoding UTF8
$systemdResult = $resultText | ConvertFrom-Json

if (Test-Path -LiteralPath $payloadPath) {
    Remove-Item -LiteralPath $payloadPath -Force
}

if (Test-Path -LiteralPath $localPy) {
    Remove-Item -LiteralPath $localPy -Force
}

if ([int]$systemdResult.summary.total -ne 31) {
    throw "Expected 31 reconciled units, got $($systemdResult.summary.total)."
}

Write-Host ""
Write-Host "=== 2. CLEAN STATIC SMOKE ===" -ForegroundColor Green

$results = New-Object System.Collections.Generic.List[object]

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
if (-not $pythonCmd) {
    $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
}

foreach ($file in $pythonFiles) {
    $ok = $false
    $err = $null

    if ($pythonCmd) {
        $tempCheck = Join-Path $env:TEMP ("s10_4t_compile_" + [guid]::NewGuid().ToString("N") + ".py")
        $safePath = $file.FullName.Replace("\", "\\").Replace('"', '\"')

        $checker = @"
import pathlib
p = pathlib.Path("$safePath")
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
            $out = & $pythonCmd.Source $tempCheck 2>&1
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

    $results.Add([pscustomobject]@{
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
            $_.FullName -notmatch "\\audit_exports\\" -and
            $_.Name -notlike "S10_4S_final_source_of_truth_parity_manifest_smoke_FIXED.ps1" -and
            $_.Name -notlike "S10_4S_final_source_of_truth_parity_manifest_smoke_FIXED_V2.ps1" -and
            $_.Name -notlike "S10_4S_final_source_of_truth_parity_manifest_smoke_FIXED_V2 (1).ps1"
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

    $results.Add([pscustomobject]@{
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
    pythonFilesChecked = @($results | Where-Object { $_.type -eq "python_syntax" }).Count
    pythonFailures = @($results | Where-Object { $_.type -eq "python_syntax" -and -not $_.ok }).Count
    powershellFilesChecked = @($results | Where-Object { $_.type -eq "powershell_parse" }).Count
    powershellFailures = @($results | Where-Object { $_.type -eq "powershell_parse" -and -not $_.ok }).Count
    results = $results
}

$smoke |
    ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $SmokeJsonPath -Encoding UTF8

Write-Host ""
Write-Host "=== 3. REQUIREMENTS SANITY ===" -ForegroundColor Green

$currentReq = Join-Path $BackendRoot "requirements.txt"
$reqLines = [System.IO.File]::ReadAllLines($currentReq)

$normalizedReq = @(
    $reqLines |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
)

$invalidMerged = @(
    $normalizedReq |
        Where-Object {
            $_ -match "==.*==" -or
            $_ -match ">=.*>=" -or
            $_ -match "==.*>=" -or
            $_ -match ">=.*=="
        }
)

$duplicateReq = @(
    $normalizedReq |
        Group-Object |
        Where-Object { $_.Count -gt 1 }
)

$reqReport = New-Object System.Collections.Generic.List[string]
$reqReport.Add("S10.4T REQUIREMENTS SANITY")
$reqReport.Add("Current=$currentReq")
$reqReport.Add("SHA256=$(Get-Sha256 -Path $currentReq)")
$reqReport.Add("ACTIVE_REQUIREMENT_LINES=$($normalizedReq.Count)")
$reqReport.Add("INVALID_MERGED_LINES=$($invalidMerged.Count)")
$reqReport.Add("DUPLICATE_LINES=$($duplicateReq.Count)")
$reqReport.Add("")
$reqReport.Add("=== INVALID MERGED LINES ===")
foreach ($x in $invalidMerged) { $reqReport.Add($x) }
$reqReport.Add("")
$reqReport.Add("=== DUPLICATE LINES ===")
foreach ($x in $duplicateReq) { $reqReport.Add("$($x.Name) x$($x.Count)") }

[System.IO.File]::WriteAllLines(
    $ReqPath,
    $reqReport,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== 4. WRITE CORRECTED PRODUCTION MANIFEST ===" -ForegroundColor Green

$manifest = New-Object System.Collections.Generic.List[string]

$manifest.Add("# SkillEdge AI Production Manifest")
$manifest.Add("")
$manifest.Add("Generated: $stamp")
$manifest.Add("")
$manifest.Add("## Source of Truth")
$manifest.Add("")
$manifest.Add("- Production runtime root: /opt/skilledge/stock-engine")
$manifest.Add("- Canonical local backend mirror: services/stock-engine")
$manifest.Add("- Production systemd runtime definitions: /etc/systemd/system")
$manifest.Add("- Production engine version: holly_persistent_v2")
$manifest.Add("- Production API service: skilledge-stock-engine-api.service")
$manifest.Add("- API bind: 127.0.0.1:8000")
$manifest.Add("")
$manifest.Add("## Canonical Systemd Runtime Parity")
$manifest.Add("")
$manifest.Add("- Total canonical units: $($systemdResult.summary.total)")
$manifest.Add("- MATCH: $($systemdResult.summary.matched)")
$manifest.Add("- RUNTIME_MISSING: $($systemdResult.summary.missing)")
$manifest.Add("- DIFFERENT: $($systemdResult.summary.different)")
$manifest.Add("")

foreach ($u in @($systemdResult.units | Sort-Object name)) {
    $manifest.Add("- $($u.name) : $($u.status)")
}

$manifest.Add("")
$manifest.Add("## Canonical Backend Source")
$manifest.Add("")
$manifest.Add("- app/api/app.py")
$manifest.Add("- requirements.txt")
$manifest.Add("- ops/scripts/")
$manifest.Add("- ops/systemd/ as canonical local unit definitions")
$manifest.Add("- run_historical_learning_backfill.py")
$manifest.Add("- run_nightly_self_learning.py")
$manifest.Add("- run_daily_ai_desk.py")
$manifest.Add("")
$manifest.Add("## Runtime Data")
$manifest.Add("")
$manifest.Add("- /opt/skilledge/stock-engine/data/")
$manifest.Add("- /opt/skilledge/stock-engine/reports/")
$manifest.Add("- SQLite runtime database")
$manifest.Add("- historical learning lake")
$manifest.Add("- Supabase persistence")
$manifest.Add("- Upstash runtime cache")
$manifest.Add("")
$manifest.Add("## Rollback")
$manifest.Add("")
$manifest.Add("- /opt/skilledge/stock-engine/rollback_snapshots/")
$manifest.Add("- Current verified rollback snapshot created in S10.4O")
$manifest.Add("- 3 recent app.py rollback backups retained")
$manifest.Add("")
$manifest.Add("## Removed Legacy and Duplicate Artifacts")
$manifest.Add("")
$manifest.Add("- 87 old app.py backups removed")
$manifest.Add("- duplicate ops/ops tree removed")
$manifest.Add("- 5 non-app backup files removed")
$manifest.Add("- ops/scripts/s10_paper_trading_daemon.py removed after legacy proof")
$manifest.Add("")
$manifest.Add("## Protected Areas")
$manifest.Add("")
$manifest.Add("- .env.server and all secrets")
$manifest.Add("- payment and pricing logic")
$manifest.Add("- paper ledger and clean boundary")
$manifest.Add("- client, Telegram and research promotion gates")
$manifest.Add("- runtime databases and historical-learning data")
$manifest.Add("- rollback snapshots")
$manifest.Add("")
$manifest.Add("## Critical Safety Invariants")
$manifest.Add("")
$manifest.Add("- paperOnly=true")
$manifest.Add("- brokerExecution=false")
$manifest.Add("- no automatic client or Telegram promotion from research")
$manifest.Add("- no paper reset during audit and maintenance")
$manifest.Add("- no manual /engine/paper/run-once during audit and maintenance")
$manifest.Add("- research and backtest do not directly release client signals")
$manifest.Add("- current 5-minute point-quote paper evaluator is not reliable profitability proof")
$manifest.Add("")
$manifest.Add("## Verification Status")
$manifest.Add("")
$manifest.Add("- Python files checked: $($smoke.pythonFilesChecked)")
$manifest.Add("- Python failures: $($smoke.pythonFailures)")
$manifest.Add("- PowerShell files checked: $($smoke.powershellFilesChecked)")
$manifest.Add("- PowerShell failures: $($smoke.powershellFailures)")
$manifest.Add("- Requirements invalid merged lines: $($invalidMerged.Count)")
$manifest.Add("- Requirements duplicate lines: $($duplicateReq.Count)")
$manifest.Add("")
$manifest.Add("## Deployment Rule")
$manifest.Add("")
$manifest.Add("Do not perform a full local-to-VPS deploy unless parity is re-checked, a rollback snapshot exists, and smoke tests pass.")

[System.IO.File]::WriteAllLines(
    $ManifestPath,
    $manifest,
    [System.Text.UTF8Encoding]::new($false)
)

$report = New-Object System.Collections.Generic.List[string]

$report.Add("S10.4T FINAL 31-UNIT SYSTEMD RUNTIME RECONCILIATION")
$report.Add("Generated=$stamp")
$report.Add("")
$report.Add("=== SYSTEMD RUNTIME PARITY ===")
$report.Add("TOTAL=$($systemdResult.summary.total)")
$report.Add("MATCHED=$($systemdResult.summary.matched)")
$report.Add("MISSING=$($systemdResult.summary.missing)")
$report.Add("DIFFERENT=$($systemdResult.summary.different)")
$report.Add("SYMLINKS=$($systemdResult.summary.symlinks)")
$report.Add("")
$report.Add("=== CLEAN STATIC SMOKE ===")
$report.Add("PYTHON_FILES_CHECKED=$($smoke.pythonFilesChecked)")
$report.Add("PYTHON_FAILURES=$($smoke.pythonFailures)")
$report.Add("POWERSHELL_FILES_CHECKED=$($smoke.powershellFilesChecked)")
$report.Add("POWERSHELL_FAILURES=$($smoke.powershellFailures)")
$report.Add("")
$report.Add("=== REQUIREMENTS SANITY ===")
$report.Add("INVALID_MERGED_LINES=$($invalidMerged.Count)")
$report.Add("DUPLICATE_LINES=$($duplicateReq.Count)")
$report.Add("")
$report.Add("=== OUTPUTS ===")
$report.Add("SystemdParity=$SystemdJsonPath")
$report.Add("StaticSmoke=$SmokeJsonPath")
$report.Add("RequirementsSanity=$ReqPath")
$report.Add("Manifest=$ManifestPath")
$report.Add("")
$report.Add("=== SAFETY ===")
$report.Add("DEPLOY_PERFORMED=false")
$report.Add("RESTART_PERFORMED=false")
$report.Add("SERVICE_STATE_CHANGED=false")

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $report,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.4T COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $ReportPath"
Write-Host "Systemd parity: $SystemdJsonPath"
Write-Host "Static smoke: $SmokeJsonPath"
Write-Host "Requirements sanity: $ReqPath"
Write-Host "Manifest: $ManifestPath"
Write-Host ""
Write-Host "NO DEPLOY / NO RESTART / NO SERVICE STATE CHANGE." -ForegroundColor Yellow
