param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "Project root not found: $ProjectRoot" }
if (-not (Test-Path -LiteralPath $SshKey)) { throw "SSH key not found: $SshKey" }

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Backend=Join-Path $ProjectRoot "services\stock-engine"
$Market=Join-Path $Backend "app\market_data"
$Systemd=Join-Path $Backend "ops\systemd"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
$Audit=Join-Path $ProjectRoot "audit_exports"

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$isoNow=(Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
$Stage=Join-Path $Audit "S10_6C_DAY3_resume_stage_$stamp"
$Report=Join-Path $Audit "S10_6C_DAY3_resume_report_$stamp.txt"
$Raw=Join-Path $Audit "S10_6C_DAY3_resume_raw_$stamp.json"

foreach($d in @($Stage,$Milestones)){New-Item -ItemType Directory -Force -Path $d|Out-Null}

$required=@(
  (Join-Path $Market "__init__.py"),
  (Join-Path $Market "contracts.py"),
  (Join-Path $Market "provider.py"),
  (Join-Path $Market "databento_adapter.py"),
  (Join-Path $Market "stream_service.py"),
  (Join-Path $Systemd "skilledge-market-stream.service")
)

foreach($f in $required){
  if(-not (Test-Path -LiteralPath $f)){throw "Required local file missing: $f"}
}

Write-Host ""
Write-Host "=== LOCAL RECHECK ===" -ForegroundColor Green

Push-Location $Backend
try{
  python -m py_compile `
    app\market_data\contracts.py `
    app\market_data\provider.py `
    app\market_data\databento_adapter.py `
    app\market_data\stream_service.py `
    tests\test_market_data_contracts.py `
    tests\test_market_stream_service.py

  if($LASTEXITCODE-ne 0){throw "Local compile failed"}

  python -m unittest `
    tests.test_market_data_contracts `
    tests.test_market_stream_service `
    -v

  if($LASTEXITCODE-ne 0){throw "Local tests failed"}
}
finally{
  Pop-Location
}

$stageApp=Join-Path $Stage "app\market_data"
$stageUnit=Join-Path $Stage "systemd"
New-Item -ItemType Directory -Force -Path $stageApp,$stageUnit|Out-Null

Copy-Item -LiteralPath (Join-Path $Market "__init__.py") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $Market "contracts.py") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $Market "provider.py") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $Market "databento_adapter.py") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $Market "stream_service.py") -Destination $stageApp
Copy-Item -LiteralPath (Join-Path $Systemd "skilledge-market-stream.service") -Destination $stageUnit

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

$remoteStage="/tmp/s106c_resume_$stamp"
$remoteBackup="/opt/skilledge/stock-engine/rollback_snapshots/S10_6C_DAY3_$stamp"

Write-Host ""
Write-Host "=== UPLOAD CONTROLLED STAGE ===" -ForegroundColor Green

& ssh @ssh $VpsHost "mkdir -p '$remoteStage/app/market_data' '$remoteStage/systemd' '$remoteBackup/app/market_data' '$remoteBackup/systemd'"
if($LASTEXITCODE-ne 0){throw "Remote staging mkdir failed"}

& scp @ssh "$stageApp\*" "${VpsHost}:$remoteStage/app/market_data/"
if($LASTEXITCODE-ne 0){throw "Market-data upload failed"}

& scp @ssh "$stageUnit\skilledge-market-stream.service" "${VpsHost}:$remoteStage/systemd/"
if($LASTEXITCODE-ne 0){throw "Systemd upload failed"}

$remoteTemplate = @'
set -euo pipefail

E=/opt/skilledge/stock-engine
S="__REMOTE_STAGE__"
B="__REMOTE_BACKUP__"
U=/etc/systemd/system/skilledge-market-stream.service

mkdir -p "$E/app/market_data" "$E/data" "$B/app/market_data" "$B/systemd"

for f in __init__.py contracts.py provider.py databento_adapter.py stream_service.py; do
  if [ -f "$E/app/market_data/$f" ]; then
    cp -a "$E/app/market_data/$f" "$B/app/market_data/$f"
  fi
done

if [ -f "$U" ]; then
  cp -a "$U" "$B/systemd/skilledge-market-stream.service"
fi

/opt/skilledge/stock-engine/.venv/bin/pip install \
  --disable-pip-version-check \
  --no-input \
  databento==0.81.0

/opt/skilledge/stock-engine/.venv/bin/python -m py_compile \
  "$S/app/market_data/__init__.py" \
  "$S/app/market_data/contracts.py" \
  "$S/app/market_data/provider.py" \
  "$S/app/market_data/databento_adapter.py" \
  "$S/app/market_data/stream_service.py"

install -m 0644 "$S/app/market_data/__init__.py" "$E/app/market_data/__init__.py"
install -m 0644 "$S/app/market_data/contracts.py" "$E/app/market_data/contracts.py"
install -m 0644 "$S/app/market_data/provider.py" "$E/app/market_data/provider.py"
install -m 0644 "$S/app/market_data/databento_adapter.py" "$E/app/market_data/databento_adapter.py"
install -m 0644 "$S/app/market_data/stream_service.py" "$E/app/market_data/stream_service.py"
install -m 0644 "$S/systemd/skilledge-market-stream.service" "$U"

systemctl daemon-reload
systemctl enable --now skilledge-market-stream.service

sleep 15

python3 - <<'PY'
import json
import subprocess
from pathlib import Path

status_path = Path("/opt/skilledge/stock-engine/data/market_stream_status.json")

service = subprocess.run(
    [
        "systemctl",
        "show",
        "skilledge-market-stream.service",
        "--property=ActiveState,SubState,Result,MainPID,NRestarts",
    ],
    capture_output=True,
    text=True,
    check=False,
)

journal = subprocess.run(
    [
        "journalctl",
        "-u",
        "skilledge-market-stream.service",
        "-n",
        "30",
        "--no-pager",
    ],
    capture_output=True,
    text=True,
    check=False,
)

payload = {
    "service": service.stdout.strip(),
    "statusFileExists": status_path.exists(),
    "status": None,
    "journalTail": journal.stdout[-12000:],
}

if status_path.exists():
    payload["status"] = json.loads(status_path.read_text(encoding="utf-8"))

print(json.dumps(payload, ensure_ascii=False))
PY

rm -rf "$S"
'@

$remoteScript = $remoteTemplate.Replace("__REMOTE_STAGE__",$remoteStage).Replace("__REMOTE_BACKUP__",$remoteBackup)

Write-Host ""
Write-Host "=== CONTROLLED VPS DEPLOY ===" -ForegroundColor Green

$out = & ssh @ssh $VpsHost $remoteScript
if($LASTEXITCODE-ne 0){throw "Controlled VPS deploy failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $Raw -Encoding UTF8

try{
  $r=$text|ConvertFrom-Json
}
catch{
  throw "Could not parse remote JSON. Inspect: $Raw"
}

$active=([string]$r.service)-match "ActiveState=active"
$st=$r.status
$total=0

if($null-ne $st -and $null-ne $st.rawRecordCounts){
  foreach($p in $st.rawRecordCounts.PSObject.Properties){
    $total += [int64]$p.Value
  }
}

$ok=$active -and $r.statusFileExists -and ($total -gt 0)

@(
  "S10.6C DAY3 RESUME",
  "Generated=$stamp",
  "OK=$ok",
  "SERVICE_ACTIVE=$active",
  "STATUS_FILE_EXISTS=$($r.statusFileExists)",
  "STATUS=$($st.status)",
  "DATASET=$($st.dataset)",
  "SCHEMA=$($st.schema)",
  "SYMBOLS=$(@($st.symbols)-join ',')",
  "RAW_RECORDS=$total",
  "LAST_RECORD=$($st.lastRecordAt)",
  "LAST_EVENT=$($st.lastMarketEventAt)",
  "RECONNECTS=$($st.reconnectCount)",
  "LAST_ERROR=$($st.lastError)",
  "ROLLBACK=$remoteBackup",
  "RAW=$Raw"
)|Set-Content -LiteralPath $Report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6C_DAY3_MARKET_STREAM_$stamp.md"

@"
# S10.6C Day 3 Production Market Stream

Generated: $isoNow

OK: $ok
Service active: $active
Status: $($st.status)
Dataset/schema: $($st.dataset) / $($st.schema)
Symbols: $(@($st.symbols)-join ',')
Raw records: $total
Last record: $($st.lastRecordAt)
Last canonical event: $($st.lastMarketEventAt)
Reconnects: $($st.reconnectCount)
Last error: $($st.lastError)

Rollback snapshot:
$remoteBackup

Changed:
- installed databento==0.81.0 in production venv;
- deployed canonical market-data contracts;
- deployed Databento adapter;
- installed and enabled skilledge-market-stream.service.

Not changed:
- app.py;
- scanner;
- strategy engine;
- paper account;
- Telegram;
- client gates;
- payments.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6C DAY 3 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $ok"
Write-Host "Service active: $active"
Write-Host "Status: $($st.status)"
Write-Host "Raw records: $total"
Write-Host "Last canonical event: $($st.lastMarketEventAt)"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Rollback: $remoteBackup"

if(-not $ok){
  Write-Host ""
  Write-Host "Journal tail:" -ForegroundColor Yellow
  Write-Host $r.journalTail
  throw "Runtime gate failed"
}
