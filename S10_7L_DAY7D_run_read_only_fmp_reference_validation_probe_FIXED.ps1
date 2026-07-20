param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"
$Package=Join-Path $ProjectRoot "PROJECT_STATE\S10_7J_security_master_instrumentation_patch_v2"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$securityMaster=Join-Path $Package "app\data\security_master.py"
if(-not (Test-Path -LiteralPath $securityMaster)){
  throw "Missing V2 security master: $securityMaster"
}

$reviewCandidates=Get-ChildItem -LiteralPath $Audit -File -Filter "*S10_7E*raw*.json" |
  Sort-Object LastWriteTime -Descending

if(-not $reviewCandidates){
  $reviewCandidates=Get-ChildItem -LiteralPath $Audit -File -Filter "*250*review*raw*.json" |
    Sort-Object LastWriteTime -Descending
}

if(-not $reviewCandidates){
  throw "Exact S10.7E 250-symbol review raw JSON not found in audit_exports"
}

$sourceReview=$reviewCandidates[0].FullName
$sourcePayload=Get-Content -LiteralPath $sourceReview -Raw -Encoding UTF8 | ConvertFrom-Json

$symbols=$null

if($sourcePayload.remoteRuntimeChecks -and
   $sourcePayload.remoteRuntimeChecks.stages -and
   $sourcePayload.remoteRuntimeChecks.stages.'250'){
  $symbols=@($sourcePayload.remoteRuntimeChecks.stages.'250'.symbols)
}

if((-not $symbols) -or $symbols.Count -eq 0){
  if($sourcePayload.stages -and $sourcePayload.stages.'250'){
    $symbols=@($sourcePayload.stages.'250'.symbols)
  }
}

if((-not $symbols) -or $symbols.Count -eq 0){
  throw "Exact stage 250 symbol list not found in: $sourceReview"
}

$symbols=@(
  $symbols |
  ForEach-Object { ([string]$_).Trim().ToUpperInvariant() } |
  Where-Object { $_ } |
  Select-Object -Unique
)

if($symbols.Count -ne 250){
  throw "Expected exact stage 250 list, found $($symbols.Count) symbols"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$localInput=Join-Path $env:TEMP "s10_7l_exact250_$stamp.json"
$localRunner=Join-Path $env:TEMP "s10_7l_probe_$stamp.py"

$remoteInput="/tmp/s10_7l_exact250_$stamp.json"
$remoteSecurity="/tmp/s10_7l_security_master_$stamp.py"
$remoteRunner="/tmp/s10_7l_probe_$stamp.py"

$raw=Join-Path $Audit "S10_7L_FMP_REFERENCE_VALIDATION_PROBE_raw_$stamp.json"
$report=Join-Path $Audit "S10_7L_FMP_REFERENCE_VALIDATION_PROBE_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7L_FMP_REFERENCE_VALIDATION_PROBE_$stamp.md"

@{
  sourceReview=$sourceReview
  symbolCount=$symbols.Count
  symbols=$symbols
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $localInput -Encoding UTF8

$python=@'
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
from collections import Counter
from pathlib import Path

import httpx

input_path=Path(sys.argv[1])
security_path=Path(sys.argv[2])

spec=importlib.util.spec_from_file_location("s10_7l_security_master",security_path)
security=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=security
spec.loader.exec_module(security)

payload=json.loads(input_path.read_text(encoding="utf-8-sig"))
symbols=list(payload["symbols"])

key=(
    os.getenv("FMP_API_KEY")
    or os.getenv("FMP_KEY")
    or os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
    or os.getenv("NEXT_PUBLIC_FMP_API_KEY")
)

if not key:
    raise SystemExit("FMP_API_KEY_NOT_AVAILABLE_IN_RUNTIME_ENV")

base="https://financialmodelingprep.com/stable/profile"
semaphore=asyncio.Semaphore(6)

async def fetch_one(client:httpx.AsyncClient,symbol:str):
    async with semaphore:
        try:
            response=await client.get(
                base,
                params={"symbol":symbol,"apikey":key},
                timeout=30.0,
            )
            response.raise_for_status()
            data=response.json()

            if isinstance(data,list):
                row=dict(data[0]) if data else {}
            elif isinstance(data,dict):
                row=dict(data)
            else:
                row={}

            row.setdefault("symbol",symbol)
            decision=security.classify_security(row)

            return {
                "symbol":symbol,
                "httpStatus":response.status_code,
                "profileFound":bool(row and len(row)>1),
                "decision":{
                    "allowed":decision.allowed,
                    "classification":decision.classification,
                    "reasons":list(decision.reasons),
                    "evidence":decision.evidence,
                },
            }
        except Exception as exc:
            return {
                "symbol":symbol,
                "httpStatus":None,
                "profileFound":False,
                "decision":{
                    "allowed":False,
                    "classification":"REFERENCE_FETCH_FAILED",
                    "reasons":[type(exc).__name__],
                    "evidence":{},
                },
            }

async def main():
    async with httpx.AsyncClient(
        headers={"User-Agent":"SkillEdge-S10.7L/1.0"}
    ) as client:
        rows=await asyncio.gather(*(fetch_one(client,s) for s in symbols))

    allowed=[
        row["symbol"]
        for row in rows
        if row["decision"]["allowed"]
    ]
    blocked=[
        row
        for row in rows
        if not row["decision"]["allowed"]
    ]

    classification_counts=Counter(
        row["decision"]["classification"] for row in rows
    )
    reason_counts=Counter(
        reason
        for row in blocked
        for reason in row["decision"]["reasons"]
    )

    qqq=next((row for row in rows if row["symbol"]=="QQQ"),None)

    result={
        "ok":True,
        "classification":"DAY7D_FMP_REFERENCE_VALIDATION_PROBE_COMPLETED",
        "inspectionOnly":True,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "deploymentAuthorized":False,
        "sourceReview":payload.get("sourceReview"),
        "exactTargetCount":len(symbols),
        "uniqueTargetCount":len(set(symbols)),
        "validatedCommonStockCount":len(allowed),
        "blockedCount":len(blocked),
        "profileFoundCount":sum(1 for row in rows if row["profileFound"]),
        "profileMissingCount":sum(1 for row in rows if not row["profileFound"]),
        "classificationCounts":dict(classification_counts),
        "reasonCounts":dict(reason_counts),
        "allowedSymbols":allowed,
        "blocked":blocked,
        "qqqPresent":qqq is not None,
        "qqqAllowed":qqq["decision"]["allowed"] if qqq else None,
        "liveProvider":"databento",
        "referenceProvider":"fmp",
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
        "armAllowed":False,
        "nextAction":"BUILD_REPLACEMENT_POOL_FOR_BLOCKED_OR_MISSING_SYMBOLS",
    }

    print(json.dumps(result,ensure_ascii=False))

asyncio.run(main())
'@

[IO.File]::WriteAllText($localRunner,$python,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7L FMP REFERENCE VALIDATION PROBE ===" -ForegroundColor Green
Write-Host "Read-only. Exact S10.7E stage 250. No deploy, no restart." -ForegroundColor Yellow
Write-Host "Source review: $sourceReview"
Write-Host "Exact symbols: $($symbols.Count)"

& scp @ssh $localInput "${VpsHost}:$remoteInput"
if($LASTEXITCODE-ne 0){throw "Input upload failed"}

& scp @ssh $securityMaster "${VpsHost}:$remoteSecurity"
if($LASTEXITCODE-ne 0){throw "Security master upload failed"}

& scp @ssh $localRunner "${VpsHost}:$remoteRunner"
if($LASTEXITCODE-ne 0){throw "Probe upload failed"}

$remoteCommand=@"
set -e
cleanup() {
  rm -f '$remoteInput' '$remoteSecurity' '$remoteRunner'
}
trap cleanup EXIT

load_env_file() {
  file="`$1"
  [ -f "`$file" ] || return 0
  set -a
  . "`$file"
  set +a
}

for file in \
  /opt/skilledge/stock-engine/.env \
  /opt/skilledge/stock-engine/.env.local \
  /etc/skilledge/stock-engine.env \
  /etc/default/skilledge-stock-engine
do
  load_env_file "`$file"
done

exec /opt/skilledge/stock-engine/.venv/bin/python \
  '$remoteRunner' '$remoteInput' '$remoteSecurity'
"@

$out=& ssh @ssh $VpsHost $remoteCommand
$exitCode=$LASTEXITCODE

Remove-Item -LiteralPath $localInput,$localRunner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7L remote reference probe failed"
}

$text=$out-join "`n"
$r=$text|ConvertFrom-Json
$text|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7L FMP REFERENCE VALIDATION PROBE",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SOURCE_REVIEW=$($r.sourceReview)",
 "EXACT_TARGET_COUNT=$($r.exactTargetCount)",
 "UNIQUE_TARGET_COUNT=$($r.uniqueTargetCount)",
 "PROFILE_FOUND_COUNT=$($r.profileFoundCount)",
 "PROFILE_MISSING_COUNT=$($r.profileMissingCount)",
 "VALIDATED_COMMON_STOCK_COUNT=$($r.validatedCommonStockCount)",
 "BLOCKED_COUNT=$($r.blockedCount)",
 "QQQ_PRESENT=$($r.qqqPresent)",
 "QQQ_ALLOWED=$($r.qqqAllowed)",
 "LIVE_PROVIDER=$($r.liveProvider)",
 "REFERENCE_PROVIDER=$($r.referenceProvider)",
 "ARM_ALLOWED=$($r.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7L FMP Reference Validation Probe

- OK: $($r.ok)
- Classification: $($r.classification)
- Exact target: $($r.exactTargetCount)
- Unique target: $($r.uniqueTargetCount)
- Profiles found: $($r.profileFoundCount)
- Profiles missing: $($r.profileMissingCount)
- Validated common stocks: $($r.validatedCommonStockCount)
- Blocked: $($r.blockedCount)
- QQQ present: $($r.qqqPresent)
- QQQ allowed: $($r.qqqAllowed)
- Live provider: $($r.liveProvider)
- Reference provider: $($r.referenceProvider)
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7L PROBE COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Exact / unique target: $($r.exactTargetCount) / $($r.uniqueTargetCount)"
Write-Host "Profiles found / missing: $($r.profileFoundCount) / $($r.profileMissingCount)"
Write-Host "Validated common stocks: $($r.validatedCommonStockCount)"
Write-Host "Blocked: $($r.blockedCount)"
Write-Host "QQQ present / allowed: $($r.qqqPresent) / $($r.qqqAllowed)"
Write-Host "Live / reference provider: $($r.liveProvider) / $($r.referenceProvider)"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
