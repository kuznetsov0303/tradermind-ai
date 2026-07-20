param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="178.104.184.138",
  [string]$VpsUser="root",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

if(-not (Test-Path -LiteralPath $SshKey)){
  throw "SSH key not found: $SshKey"
}

$review=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7W_FINAL_CANARY_PACKAGE_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $review){
  throw "Latest S10.7W final review not found"
}

$reviewPayload=Get-Content -LiteralPath $review.FullName -Raw -Encoding UTF8 | ConvertFrom-Json

if($reviewPayload.ok -ne $true){
  throw "S10.7W final review is not OK"
}

if($reviewPayload.classification -ne "DAY7D_FINAL_CANARY_PACKAGE_STATIC_REVIEW_PASSED"){
  throw "Unexpected S10.7W classification"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$remoteScriptLocal=Join-Path $env:TEMP "s10_7x_preflight_$stamp.sh"
$remoteScriptRemote="/tmp/s10_7x_preflight_$stamp.sh"
$remoteJsonRemote="/tmp/s10_7x_preflight_$stamp.json"

$rawLocal=Join-Path $Audit "S10_7X_CANARY_EXECUTION_PREFLIGHT_raw_$stamp.json"
$reportLocal=Join-Path $Audit "S10_7X_CANARY_EXECUTION_PREFLIGHT_report_$stamp.txt"
$milestoneLocal=Join-Path $Milestones "S10_7X_CANARY_EXECUTION_PREFLIGHT_$stamp.md"

$remoteScript=@'
#!/usr/bin/env bash
set -euo pipefail

OUT="$1"
ROOT="/opt/skilledge/stock-engine"
MARKET_SERVICE="skilledge-market-stream.service"
API_SERVICE="skilledge-stock-engine-api.service"

python3 - "$OUT" "$ROOT" "$MARKET_SERVICE" "$API_SERVICE" <<'PY'
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

out_path=Path(sys.argv[1])
root=Path(sys.argv[2])
market_service=sys.argv[3]
api_service=sys.argv[4]

def run(args):
    result=subprocess.run(
        args,
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "returncode":result.returncode,
        "stdout":(result.stdout or "").strip(),
        "stderr":(result.stderr or "").strip(),
    }

def systemctl_value(service,prop):
    return run([
        "systemctl",
        "show",
        service,
        f"--property={prop}",
        "--value",
    ])["stdout"]

def parse_env_files(unit_text):
    values=[]
    for match in re.finditer(r"EnvironmentFile=(?:-)?([^\s]+)",unit_text):
        values.append(match.group(1).strip())
    return values

def parse_exec_start(service):
    return systemctl_value(service,"ExecStart")

def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8",errors="ignore")
    except OSError:
        return ""

def discover_symbol_controls(root,unit_text,env_files):
    candidates=[]

    variable_names={
        "DATABENTO_SYMBOLS",
        "MARKET_DATA_SYMBOLS",
        "SKILLEDGE_MARKET_SYMBOLS",
        "SKILLEDGE_SYMBOLS",
        "SYMBOLS",
        "UNIVERSE_SYMBOLS",
    }

    for line in unit_text.splitlines():
        for name in variable_names:
            marker=name+"="
            if marker in line:
                candidates.append({
                    "type":"systemd-unit-environment",
                    "name":name,
                    "source":market_service,
                    "line":line.strip(),
                })

    for env_file in env_files:
        text=read_text(env_file)

        for line in text.splitlines():
            stripped=line.strip()

            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue

            name,value=stripped.split("=",1)
            name=name.strip()

            if name in variable_names:
                symbols=[
                    item.strip()
                    for item in re.split(r"[\s,]+",value.strip().strip('"').strip("'"))
                    if item.strip()
                ]
                candidates.append({
                    "type":"environment-file",
                    "name":name,
                    "source":env_file,
                    "symbolCount":len(symbols),
                    "symbolsPreview":symbols[:10],
                })

    code_patterns=(
        "DATABENTO_SYMBOLS",
        "MARKET_DATA_SYMBOLS",
        "SKILLEDGE_MARKET_SYMBOLS",
        "SKILLEDGE_SYMBOLS",
        "UNIVERSE_SYMBOLS",
    )

    search_roots=[
        root/"app"/"market_data",
        root/"app",
        root/"ops",
    ]

    for search_root in search_roots:
        if not search_root.exists():
            continue

        for path in search_root.rglob("*.py"):
            text=read_text(path)

            for pattern in code_patterns:
                if pattern in text:
                    candidates.append({
                        "type":"python-source-reference",
                        "name":pattern,
                        "source":str(path),
                    })

    unique=[]
    seen=set()

    for item in candidates:
        key=json.dumps(item,sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return unique

now_et=datetime.now(ZoneInfo("America/New_York"))
weekday=now_et.weekday()
minutes=now_et.hour*60+now_et.minute
regular_open=(weekday<5 and (9*60+30)<=minutes<16*60)

market_active=run(["systemctl","is-active",market_service])
api_active=run(["systemctl","is-active",api_service])
market_enabled=run(["systemctl","is-enabled",market_service])
api_enabled=run(["systemctl","is-enabled",api_service])

market_unit=run(["systemctl","cat",market_service])
api_unit=run(["systemctl","cat",api_service])

market_env_files=parse_env_files(market_unit["stdout"])
api_env_files=parse_env_files(api_unit["stdout"])

health=run([
    "curl",
    "-fsS",
    "--max-time",
    "10",
    "http://127.0.0.1:8000/health",
])

required_files={
    "streamService":root/"app"/"market_data"/"stream_service.py",
    "securityMaster":root/"app"/"market_data"/"security_master.py",
    "discovery":root/"app"/"discovery.py",
    "marketState":root/"data"/"runtime"/"market_state.json",
    "scannerState":root/"data"/"runtime"/"scanner_state.json",
}

file_status={
    name:{
        "path":str(path),
        "exists":path.is_file(),
        "sizeBytes":path.stat().st_size if path.is_file() else None,
    }
    for name,path in required_files.items()
}

symbol_controls=discover_symbol_controls(
    root,
    market_unit["stdout"],
    market_env_files,
)

exact_mutation_points=[
    item
    for item in symbol_controls
    if item["type"] in {
        "environment-file",
        "systemd-unit-environment",
    }
]

errors=[]
warnings=[]

if market_active["stdout"]!="active":
    errors.append("MARKET_SERVICE_NOT_ACTIVE")

if api_active["stdout"]!="active":
    errors.append("API_SERVICE_NOT_ACTIVE")

if not health["stdout"]:
    errors.append("HEALTH_ENDPOINT_EMPTY_OR_UNREACHABLE")

for name,status in file_status.items():
    if not status["exists"]:
        errors.append(f"REQUIRED_FILE_MISSING_{name}")

if len(exact_mutation_points)==0:
    errors.append("EXACT_UNIVERSE_MUTATION_POINT_NOT_FOUND")
elif len(exact_mutation_points)>1:
    warnings.append("MULTIPLE_UNIVERSE_MUTATION_POINTS_FOUND")

if not regular_open:
    warnings.append("US_REGULAR_SESSION_NOT_OPEN")

result={
    "ok":not errors,
    "classification":(
        "DAY7D_CANARY_EXECUTION_PREFLIGHT_READY"
        if not errors
        else "DAY7D_CANARY_EXECUTION_PREFLIGHT_BLOCKED"
    ),
    "inspectionOnly":True,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "armAllowed":False,
    "explicitExecutionApprovalRecorded":True,
    "clock":{
        "newYorkNow":now_et.isoformat(),
        "weekday":weekday,
        "regularSessionOpen":regular_open,
    },
    "services":{
        "market":{
            "active":market_active["stdout"],
            "enabled":market_enabled["stdout"],
            "execStart":parse_exec_start(market_service),
            "environmentFiles":market_env_files,
        },
        "api":{
            "active":api_active["stdout"],
            "enabled":api_enabled["stdout"],
            "execStart":parse_exec_start(api_service),
            "environmentFiles":api_env_files,
        },
    },
    "healthRaw":health["stdout"],
    "requiredFiles":file_status,
    "symbolControls":symbol_controls,
    "exactMutationPoints":exact_mutation_points,
    "errors":errors,
    "warnings":warnings,
    "nextAction":(
        "BUILD_EXACT_MARKET_HOURS_CANARY_EXECUTOR"
        if not errors
        else "FIX_PREFLIGHT_ERRORS"
    ),
}

out_path.write_text(
    json.dumps(result,ensure_ascii=False,indent=2),
    encoding="utf-8",
)
PY
'@

[IO.File]::WriteAllText(
  $remoteScriptLocal,
  ($remoteScript -replace "`r`n","`n"),
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.7X CANARY EXECUTION PREFLIGHT ===" -ForegroundColor Green
Write-Host "Read-only VPS inspection. No deploy, restart, systemd edit, or universe change." -ForegroundColor Yellow

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  $remoteScriptLocal "${VpsUser}@${VpsHost}:$remoteScriptRemote"

if($LASTEXITCODE-ne 0){
  throw "Failed to upload remote preflight script"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "chmod 700 '$remoteScriptRemote' && '$remoteScriptRemote' '$remoteJsonRemote'"

if($LASTEXITCODE-ne 0){
  throw "Remote preflight failed"
}

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}:$remoteJsonRemote" $rawLocal

if($LASTEXITCODE-ne 0){
  throw "Failed to download remote preflight JSON"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "rm -f '$remoteScriptRemote' '$remoteJsonRemote'"

Remove-Item -LiteralPath $remoteScriptLocal -Force -ErrorAction SilentlyContinue

$r=Get-Content -LiteralPath $rawLocal -Raw -Encoding UTF8 | ConvertFrom-Json

$mutationPoints=@(
  $r.exactMutationPoints |
  ForEach-Object {
    "$($_.type):$($_.name):$($_.source)"
  }
)

@(
 "S10.7X CANARY EXECUTION PREFLIGHT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "NEW_YORK_NOW=$($r.clock.newYorkNow)",
 "REGULAR_SESSION_OPEN=$($r.clock.regularSessionOpen)",
 "MARKET_SERVICE_ACTIVE=$($r.services.market.active)",
 "API_SERVICE_ACTIVE=$($r.services.api.active)",
 "MARKET_ENV_FILES=$(@($r.services.market.environmentFiles)-join ',')",
 "API_ENV_FILES=$(@($r.services.api.environmentFiles)-join ',')",
 "EXACT_MUTATION_POINTS=$($mutationPoints -join ' | ')",
 "ERRORS=$(@($r.errors)-join ',')",
 "WARNINGS=$(@($r.warnings)-join ',')",
 "EXPLICIT_EXECUTION_APPROVAL_RECORDED=$($r.explicitExecutionApprovalRecorded)",
 "PACKAGE_EXECUTED=False",
 "ARM_ALLOWED=False",
 "DEPLOYMENT_AUTHORIZED=False",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "NEXT_ACTION=$($r.nextAction)",
 "RAW_JSON=$rawLocal"
) | Set-Content -LiteralPath $reportLocal -Encoding UTF8

@"
# S10.7X Canary Execution Preflight

- OK: $($r.ok)
- Classification: $($r.classification)
- New York time: $($r.clock.newYorkNow)
- Regular session open: $($r.clock.regularSessionOpen)
- Market service: $($r.services.market.active)
- API service: $($r.services.api.active)
- Exact mutation points: $($mutationPoints -join ' | ')
- Errors: $(@($r.errors)-join ', ')
- Warnings: $(@($r.warnings)-join ', ')
- Explicit execution approval recorded: True
- Package executed: False
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

Read-only VPS inspection.
No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestoneLocal -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7X COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "New York time: $($r.clock.newYorkNow)"
Write-Host "Regular session open: $($r.clock.regularSessionOpen)"
Write-Host "Market/API service: $($r.services.market.active) / $($r.services.api.active)"
Write-Host "Exact mutation points: $($mutationPoints -join ' | ')"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Warnings: $(@($r.warnings)-join ', ')"
Write-Host "Explicit approval recorded: $($r.explicitExecutionApprovalRecorded)"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $reportLocal"
Write-Host "Raw: $rawLocal"
Write-Host "Milestone: $milestoneLocal"

if(-not $r.ok){
  throw "S10.7X canary execution preflight blocked"
}
