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
$localSh = Join-Path $env:TEMP "s10_6c_day3_postfailure_inspect_$stamp.sh"
$remoteSh = "/tmp/s10_6c_day3_postfailure_inspect_$stamp.sh"
$RawPath = Join-Path $AuditDir "S10_6C_DAY3_POSTFAILURE_INSPECT_raw_$stamp.json"
$ReportPath = Join-Path $AuditDir "S10_6C_DAY3_POSTFAILURE_INSPECT_report_$stamp.txt"

$bash = @'
#!/usr/bin/env bash
set -u

ENGINE="/opt/skilledge/stock-engine"
UNIT="/etc/systemd/system/skilledge-market-stream.service"
STATUS="$ENGINE/data/market_stream_status.json"
APP="$ENGINE/app/api/app.py"

export ENGINE UNIT STATUS APP

python3 - <<'PY'
import hashlib
import json
import os
import subprocess
from pathlib import Path

engine = Path(os.environ["ENGINE"])
unit = Path(os.environ["UNIT"])
status_path = Path(os.environ["STATUS"])
app = Path(os.environ["APP"])

market_dir = engine / "app" / "market_data"
expected = [
    "__init__.py",
    "contracts.py",
    "provider.py",
    "databento_adapter.py",
    "stream_service.py",
]

def run(args):
    p = subprocess.run(
        args,
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "returncode": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }

def sha256(path):
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

files = {}
for name in expected:
    path = market_dir / name
    files[name] = {
        "exists": path.exists(),
        "size": path.stat().st_size if path.exists() else None,
        "sha256": sha256(path),
    }

service_show = run([
    "systemctl",
    "show",
    "skilledge-market-stream.service",
    "--property=LoadState,ActiveState,SubState,Result,MainPID,NRestarts,UnitFileState",
])

service_cat = run([
    "systemctl",
    "cat",
    "skilledge-market-stream.service",
    "--no-pager",
])

journal = run([
    "journalctl",
    "-u",
    "skilledge-market-stream.service",
    "-n",
    "80",
    "--no-pager",
])

pip_show = run([
    str(engine / ".venv" / "bin" / "pip"),
    "show",
    "databento",
])

compile_check = None
existing_py = [str(market_dir / name) for name in expected if (market_dir / name).exists()]
if existing_py:
    compile_check = run([
        str(engine / ".venv" / "bin" / "python"),
        "-m",
        "py_compile",
        *existing_py,
    ])

status = None
status_error = None
if status_path.exists():
    try:
        status = json.loads(status_path.read_text(encoding="utf-8"))
    except Exception as exc:
        status_error = repr(exc)

paper_timer = run([
    "systemctl",
    "show",
    "skilledge-s10-paper-trading.timer",
    "--property=ActiveState,SubState,UnitFileState,Result",
])

paper_service = run([
    "systemctl",
    "show",
    "skilledge-s10-paper-trading.service",
    "--property=ActiveState,SubState,Result,ExecMainStatus",
])

api_service = run([
    "systemctl",
    "show",
    "skilledge-stock-engine-api.service",
    "--property=ActiveState,SubState,Result,MainPID,NRestarts",
])

health = run([
    "curl",
    "-fsS",
    "--max-time",
    "10",
    "http://127.0.0.1:8000/health",
])

payload = {
    "ok": True,
    "inspectionOnly": True,
    "productionMutation": False,
    "serviceRestarted": False,
    "paperPostExecuted": False,
    "paperResetExecuted": False,
    "appSha256": sha256(app),
    "marketDataFiles": files,
    "unitExists": unit.exists(),
    "unitSha256": sha256(unit),
    "serviceShow": service_show,
    "serviceCat": service_cat,
    "journalTail": journal,
    "databentoPackage": pip_show,
    "compileCheck": compile_check,
    "statusFileExists": status_path.exists(),
    "status": status,
    "statusParseError": status_error,
    "paperTimer": paper_timer,
    "paperService": paper_service,
    "apiService": api_service,
    "apiHealth": health,
}
print(json.dumps(payload, ensure_ascii=False))
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
Write-Host "=== UPLOAD READ-ONLY INSPECTION SCRIPT ===" -ForegroundColor Green

& scp @sshArgs $localSh "${VpsHost}:$remoteSh"
if ($LASTEXITCODE -ne 0) {
    throw "Inspection upload failed."
}

Write-Host ""
Write-Host "=== RUN DAY 3 POST-FAILURE INSPECTION ===" -ForegroundColor Green
Write-Host "NO DEPLOY / NO RESTART / NO PAPER POST / NO RESET." -ForegroundColor Yellow

$resultLines = & ssh @sshArgs $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

if (Test-Path -LiteralPath $localSh) {
    Remove-Item -LiteralPath $localSh -Force
}

if ($LASTEXITCODE -ne 0) {
    throw "Inspection failed with exit code $LASTEXITCODE"
}

$resultText = $resultLines -join "`n"
if ([string]::IsNullOrWhiteSpace($resultText)) {
    throw "Inspection returned empty output."
}

$resultText | Set-Content -LiteralPath $RawPath -Encoding UTF8
$result = $resultText | ConvertFrom-Json

function Get-NestedValue {
    param(
        [object]$Object,
        [string]$Property,
        [string]$Default = ""
    )

    if ($null -eq $Object) {
        return $Default
    }

    $prop = $Object.PSObject.Properties[$Property]
    if ($null -eq $prop) {
        return $Default
    }

    return [string]$prop.Value
}

$serviceStdout = Get-NestedValue $result.serviceShow "stdout"
$packageStdout = Get-NestedValue $result.databentoPackage "stdout"
$compileReturn = Get-NestedValue $result.compileCheck "returncode" "NOT_RUN"
$paperTimerStdout = Get-NestedValue $result.paperTimer "stdout"
$paperServiceStdout = Get-NestedValue $result.paperService "stdout"
$apiServiceStdout = Get-NestedValue $result.apiService "stdout"
$apiHealthReturn = Get-NestedValue $result.apiHealth "returncode"

$existingFiles = @()
foreach ($property in $result.marketDataFiles.PSObject.Properties) {
    if ($property.Value.exists) {
        $existingFiles += $property.Name
    }
}

$statusText = "NONE"
if ($null -ne $result.status) {
    $statusProp = $result.status.PSObject.Properties["status"]
    if ($null -ne $statusProp) {
        $statusText = [string]$statusProp.Value
    }
}

$report = @(
    "S10.6C DAY 3 POST-FAILURE INSPECTION",
    "Generated=$stamp",
    "INSPECTION_ONLY=$($result.inspectionOnly)",
    "PRODUCTION_MUTATION=$($result.productionMutation)",
    "SERVICE_RESTARTED=$($result.serviceRestarted)",
    "APP_SHA256=$($result.appSha256)",
    "MARKET_DATA_FILES_PRESENT=$($existingFiles -join ',')",
    "UNIT_EXISTS=$($result.unitExists)",
    "DATABENTO_PACKAGE=$($packageStdout -replace "`r?`n", ' | ')",
    "COMPILE_RETURN_CODE=$compileReturn",
    "STATUS_FILE_EXISTS=$($result.statusFileExists)",
    "STATUS=$statusText",
    "STATUS_PARSE_ERROR=$($result.statusParseError)",
    "API_HEALTH_RETURN_CODE=$apiHealthReturn",
    "",
    "=== MARKET STREAM SERVICE ===",
    $serviceStdout,
    "",
    "=== PAPER TIMER ===",
    $paperTimerStdout,
    "",
    "=== PAPER SERVICE ===",
    $paperServiceStdout,
    "",
    "=== API SERVICE ===",
    $apiServiceStdout,
    "",
    "RAW_JSON=$RawPath"
)

$report | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "=== INSPECTION COMPLETE ===" -ForegroundColor Green
Write-Host "Market-data files present: $($existingFiles -join ', ')"
Write-Host "Systemd unit exists: $($result.unitExists)"
Write-Host "Status file exists: $($result.statusFileExists)"
Write-Host "Status: $statusText"
Write-Host "Compile return code: $compileReturn"
Write-Host "API health return code: $apiHealthReturn"
Write-Host "Report: $ReportPath"
Write-Host "Raw: $RawPath"
