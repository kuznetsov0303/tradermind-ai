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

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$localShell=Join-Path $env:TEMP "s10_7x2_preflight_$stamp.sh"
$remoteShell="/tmp/s10_7x2_preflight_$stamp.sh"
$remoteJson="/tmp/s10_7x2_preflight_$stamp.json"

$rawLocal=Join-Path $Audit "S10_7X2_CANARY_EXECUTION_PREFLIGHT_raw_$stamp.json"
$reportLocal=Join-Path $Audit "S10_7X2_CANARY_EXECUTION_PREFLIGHT_report_$stamp.txt"
$milestoneLocal=Join-Path $Milestones "S10_7X2_CANARY_EXECUTION_PREFLIGHT_$stamp.md"

$remote=@'
#!/usr/bin/env bash
set -euo pipefail

OUT="$1"

python3 - "$OUT" <<'PY'
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

out=Path(sys.argv[1])
root=Path("/opt/skilledge/stock-engine")
market_service="skilledge-market-stream.service"
api_service="skilledge-stock-engine-api.service"

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

def unit_text(service):
    return run(["systemctl","cat",service])["stdout"]

def property_value(service,name):
    return run([
        "systemctl","show",service,
        f"--property={name}",
        "--value",
    ])["stdout"]

def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8",errors="ignore")
    except OSError:
        return ""

def parse_environment_assignments(text):
    found=[]
    pattern=re.compile(
        r'(?:^|\s)Environment=(?:"([^"]+)"|([^\s]+))',
        re.MULTILINE,
    )

    for match in pattern.finditer(text):
        assignment=(match.group(1) or match.group(2) or "").strip()

        if "=" not in assignment:
            continue

        name,value=assignment.split("=",1)
        found.append({
            "name":name,
            "value":value,
        })

    return found

def parse_environment_files(text):
    return re.findall(
        r'EnvironmentFile=-?([^\s]+)',
        text,
    )

def discover_runtime_files(root):
    matches=[]

    search_roots=[
        root/"data",
        root/"app",
    ]

    exact_names={
        "market_state.json",
        "scanner_state.json",
        "market_state_snapshot.json",
        "scanner_snapshot.json",
        "stream_status.json",
        "market_stream_status.json",
        "candles_snapshot.json",
        "scanner.json",
    }

    for search_root in search_roots:
        if not search_root.exists():
            continue

        for path in search_root.rglob("*"):
            if not path.is_file():
                continue

            lower=path.name.lower()

            if (
                lower in exact_names
                or ("market" in lower and "state" in lower and lower.endswith(".json"))
                or ("scanner" in lower and lower.endswith(".json"))
                or ("stream" in lower and "status" in lower and lower.endswith(".json"))
            ):
                try:
                    stat=path.stat()
                except OSError:
                    continue

                matches.append({
                    "path":str(path),
                    "sizeBytes":stat.st_size,
                    "modifiedEpoch":stat.st_mtime,
                })

    return sorted(
        matches,
        key=lambda item:item["modifiedEpoch"],
        reverse=True,
    )

def discover_snapshot_path_literals(root):
    matches=[]

    for base in (root/"app"/"market_data",root/"app"):
        if not base.exists():
            continue

        for path in base.rglob("*.py"):
            text=read_text(path)

            for match in re.finditer(
                r'["\']([^"\']*(?:market|scanner|stream)[^"\']*\.json)["\']',
                text,
                re.IGNORECASE,
            ):
                matches.append({
                    "source":str(path),
                    "literal":match.group(1),
                })

    unique=[]
    seen=set()

    for item in matches:
        key=(item["source"],item["literal"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return unique

market_unit=unit_text(market_service)
api_unit=unit_text(api_service)

market_env=parse_environment_assignments(market_unit)
api_env=parse_environment_assignments(api_unit)

symbol_names={
    "SKILLEDGE_MARKET_STREAM_SYMBOLS",
    "DATABENTO_SYMBOLS",
    "MARKET_DATA_SYMBOLS",
    "SKILLEDGE_MARKET_SYMBOLS",
    "SKILLEDGE_SYMBOLS",
    "UNIVERSE_SYMBOLS",
}

symbol_controls=[]

for item in market_env:
    if item["name"] not in symbol_names:
        continue

    symbols=[
        value.strip()
        for value in re.split(r"[\s,]+",item["value"])
        if value.strip()
    ]

    symbol_controls.append({
        "type":"systemd-unit-environment",
        "name":item["name"],
        "source":market_service,
        "symbolCount":len(symbols),
        "symbols":symbols,
    })

for env_file in parse_environment_files(market_unit):
    text=read_text(env_file)

    for line in text.splitlines():
        stripped=line.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        name,value=stripped.split("=",1)
        name=name.strip()

        if name not in symbol_names:
            continue

        symbols=[
            item.strip()
            for item in re.split(
                r"[\s,]+",
                value.strip().strip('"').strip("'"),
            )
            if item.strip()
        ]

        symbol_controls.append({
            "type":"environment-file",
            "name":name,
            "source":env_file,
            "symbolCount":len(symbols),
            "symbols":symbols,
        })

health=run([
    "curl","-fsS","--max-time","10",
    "http://127.0.0.1:8000/health",
])

runtime_files=discover_runtime_files(root)
snapshot_literals=discover_snapshot_path_literals(root)

required_now={
    "streamService":root/"app"/"market_data"/"stream_service.py",
    "discovery":root/"app"/"discovery.py",
}

required_now_status={
    name:{
        "path":str(path),
        "exists":path.is_file(),
        "sizeBytes":path.stat().st_size if path.is_file() else None,
    }
    for name,path in required_now.items()
}

deploy_payload_status={
    "securityMasterProductionExists":(
        root/"app"/"market_data"/"security_master.py"
    ).is_file(),
    "classification":"DEPLOY_WITH_CANARY_PACKAGE",
}

now_et=datetime.now(ZoneInfo("America/New_York"))
weekday=now_et.weekday()
minutes=now_et.hour*60+now_et.minute
regular_open=weekday<5 and (9*60+30)<=minutes<16*60

errors=[]
warnings=[]

market_active=property_value(market_service,"ActiveState")
api_active=property_value(api_service,"ActiveState")

if market_active!="active":
    errors.append("MARKET_SERVICE_NOT_ACTIVE")

if api_active!="active":
    errors.append("API_SERVICE_NOT_ACTIVE")

if not health["stdout"]:
    errors.append("HEALTH_ENDPOINT_UNREACHABLE")

for name,status in required_now_status.items():
    if not status["exists"]:
        errors.append(f"REQUIRED_NOW_FILE_MISSING_{name}")

if len(symbol_controls)==0:
    errors.append("EXACT_UNIVERSE_CONTROL_NOT_FOUND")
elif len(symbol_controls)>1:
    warnings.append("MULTIPLE_UNIVERSE_CONTROLS_FOUND")

if symbol_controls and symbol_controls[0]["symbolCount"]!=25:
    warnings.append("CURRENT_PRODUCTION_UNIVERSE_NOT_25")

if not runtime_files:
    warnings.append("NO_RUNTIME_SNAPSHOT_FILES_DISCOVERED_WHILE_MARKET_CLOSED")

if not regular_open:
    warnings.append("US_REGULAR_SESSION_NOT_OPEN")

result={
    "ok":not errors,
    "classification":(
        "DAY7D_CANARY_EXECUTION_PREFLIGHT_READY_MARKET_HOURS_REQUIRED"
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
        "regularSessionOpen":regular_open,
    },
    "services":{
        "market":{
            "active":market_active,
            "enabled":property_value(market_service,"UnitFileState"),
            "execStart":property_value(market_service,"ExecStart"),
            "environmentFiles":parse_environment_files(market_unit),
        },
        "api":{
            "active":api_active,
            "enabled":property_value(api_service,"UnitFileState"),
            "execStart":property_value(api_service,"ExecStart"),
            "environmentFiles":parse_environment_files(api_unit),
        },
    },
    "healthRaw":health["stdout"],
    "requiredNowFiles":required_now_status,
    "deployWithCanary":deploy_payload_status,
    "symbolControls":symbol_controls,
    "runtimeFilesDiscovered":runtime_files[:30],
    "snapshotPathLiterals":snapshot_literals[:50],
    "errors":errors,
    "warnings":warnings,
    "nextAction":(
        "BUILD_MARKET_HOURS_CANARY_EXECUTOR_FROM_EXACT_SYMBOL_CONTROL"
        if not errors
        else "FIX_PREFLIGHT_ERRORS"
    ),
}

out.write_text(
    json.dumps(result,ensure_ascii=False,indent=2),
    encoding="utf-8",
)
PY
'@

[IO.File]::WriteAllText(
  $localShell,
  ($remote -replace "`r`n","`n"),
  [Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.7X2 ADAPTIVE CANARY PREFLIGHT ===" -ForegroundColor Green
Write-Host "Read-only VPS inspection. No deploy, restart, systemd edit, or universe change." -ForegroundColor Yellow

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  $localShell "${VpsUser}@${VpsHost}:$remoteShell"

if($LASTEXITCODE-ne 0){
  throw "Failed to upload adaptive preflight"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "chmod 700 '$remoteShell' && '$remoteShell' '$remoteJson'"

if($LASTEXITCODE-ne 0){
  throw "Adaptive preflight failed"
}

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}:$remoteJson" $rawLocal

if($LASTEXITCODE-ne 0){
  throw "Failed to download adaptive preflight result"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "rm -f '$remoteShell' '$remoteJson'"

Remove-Item -LiteralPath $localShell -Force -ErrorAction SilentlyContinue

$r=Get-Content -LiteralPath $rawLocal -Raw -Encoding UTF8 | ConvertFrom-Json

$controls=@(
  $r.symbolControls |
  ForEach-Object {
    "$($_.type):$($_.name):$($_.source):count=$($_.symbolCount)"
  }
)

$runtimePaths=@(
  $r.runtimeFilesDiscovered |
  Select-Object -First 10 |
  ForEach-Object {$_.path}
)

@(
 "S10.7X2 ADAPTIVE CANARY EXECUTION PREFLIGHT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "NEW_YORK_NOW=$($r.clock.newYorkNow)",
 "REGULAR_SESSION_OPEN=$($r.clock.regularSessionOpen)",
 "MARKET_SERVICE_ACTIVE=$($r.services.market.active)",
 "API_SERVICE_ACTIVE=$($r.services.api.active)",
 "SYMBOL_CONTROLS=$($controls -join ' | ')",
 "RUNTIME_FILES=$($runtimePaths -join ' | ')",
 "SECURITY_MASTER_PRODUCTION_EXISTS=$($r.deployWithCanary.securityMasterProductionExists)",
 "SECURITY_MASTER_CLASSIFICATION=$($r.deployWithCanary.classification)",
 "ERRORS=$(@($r.errors)-join ',')",
 "WARNINGS=$(@($r.warnings)-join ',')",
 "EXPLICIT_APPROVAL_RECORDED=$($r.explicitExecutionApprovalRecorded)",
 "PACKAGE_EXECUTED=False",
 "DEPLOYMENT_AUTHORIZED=False",
 "ARM_ALLOWED=False",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "NEXT_ACTION=$($r.nextAction)",
 "RAW_JSON=$rawLocal"
) | Set-Content -LiteralPath $reportLocal -Encoding UTF8

@"
# S10.7X2 Adaptive Canary Preflight

- OK: $($r.ok)
- Classification: $($r.classification)
- New York time: $($r.clock.newYorkNow)
- Regular session open: $($r.clock.regularSessionOpen)
- Market/API: $($r.services.market.active) / $($r.services.api.active)
- Symbol controls: $($controls -join ' | ')
- Runtime files: $($runtimePaths -join ' | ')
- Security master: deploy with canary package
- Errors: $(@($r.errors)-join ', ')
- Warnings: $(@($r.warnings)-join ', ')
- Explicit approval recorded: True
- Package executed: False
- Deployment authorized: False
- Arm allowed: False
- Next action: $($r.nextAction)

Read-only VPS inspection.
No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestoneLocal -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7X2 COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "New York time: $($r.clock.newYorkNow)"
Write-Host "Regular session open: $($r.clock.regularSessionOpen)"
Write-Host "Market/API: $($r.services.market.active) / $($r.services.api.active)"
Write-Host "Symbol controls: $($controls -join ' | ')"
Write-Host "Runtime files: $($runtimePaths -join ' | ')"
Write-Host "Security master: $($r.deployWithCanary.classification)"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Warnings: $(@($r.warnings)-join ', ')"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $reportLocal"
Write-Host "Raw: $rawLocal"
Write-Host "Milestone: $milestoneLocal"

if(-not $r.ok){
  throw "S10.7X2 adaptive preflight blocked"
}
