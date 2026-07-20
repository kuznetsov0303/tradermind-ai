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
  throw "Missing security master: $securityMaster"
}

$review=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7E_250_SYMBOL_PROGRESSIVE_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$probe=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7L_FMP_REFERENCE_VALIDATION_PROBE_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $review){throw "Latest S10.7E raw not found"}
if(-not $probe){throw "Latest S10.7L raw not found"}

$reviewPayload=Get-Content -LiteralPath $review.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$probePayload=Get-Content -LiteralPath $probe.FullName -Raw -Encoding UTF8 | ConvertFrom-Json

$exact250=@($reviewPayload.remoteRuntimeChecks.stages.'250'.symbols)
$blocked=@($probePayload.blocked | ForEach-Object {$_.symbol})
$universeFiles=@($reviewPayload.remoteRuntimeChecks.universeFiles | ForEach-Object {$_.path})

$exact250=@(
  $exact250 |
  ForEach-Object {([string]$_).Trim().ToUpperInvariant()} |
  Where-Object {$_} |
  Select-Object -Unique
)

$blocked=@(
  $blocked |
  ForEach-Object {([string]$_).Trim().ToUpperInvariant()} |
  Where-Object {$_} |
  Select-Object -Unique
)

if($exact250.Count -ne 250){
  throw "Expected exact250 count 250, got $($exact250.Count)"
}

if($blocked.Count -ne 8){
  throw "Expected blocked count 8, got $($blocked.Count)"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$input=Join-Path $env:TEMP "s10_7m_input_$stamp.json"
$runner=Join-Path $env:TEMP "s10_7m_runner_$stamp.py"
$shell=Join-Path $env:TEMP "s10_7m_run_$stamp.sh"

$remoteInput="/tmp/s10_7m_input_$stamp.json"
$remoteSecurity="/tmp/s10_7m_security_$stamp.py"
$remoteRunner="/tmp/s10_7m_runner_$stamp.py"
$remoteShell="/tmp/s10_7m_run_$stamp.sh"

$raw=Join-Path $Audit "S10_7M_REPLACEMENT_POOL_raw_$stamp.json"
$report=Join-Path $Audit "S10_7M_REPLACEMENT_POOL_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7M_REPLACEMENT_POOL_$stamp.md"
$finalUniverse=Join-Path $Audit "S10_7M_VALIDATED_250_UNIVERSE_$stamp.json"

@{
  sourceReview=$review.FullName
  sourceProbe=$probe.FullName
  exact250=$exact250
  blockedSymbols=$blocked
  universeFiles=$universeFiles
} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $input -Encoding UTF8

$python=@'
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import shlex
import subprocess
import sys
from collections import Counter
from pathlib import Path

import httpx

input_path=Path(sys.argv[1])
security_path=Path(sys.argv[2])

spec=importlib.util.spec_from_file_location("security_master",security_path)
security=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=security
spec.loader.exec_module(security)

payload=json.loads(input_path.read_text(encoding="utf-8-sig"))
exact250=[str(x).strip().upper() for x in payload["exact250"]]
blocked=[str(x).strip().upper() for x in payload["blockedSymbols"]]
universe_files=[str(x) for x in payload.get("universeFiles") or []]

KEY_NAMES=(
    "FMP_API_KEY",
    "FMP_KEY",
    "FINANCIAL_MODELING_PREP_API_KEY",
    "NEXT_PUBLIC_FMP_API_KEY",
)

def clean_value(value):
    text=str(value or "").strip().strip("\ufeff")
    if len(text)>=2 and text[0] in {"'",'"'} and text[-1]==text[0]:
        text=text[1:-1]
    return text.strip() or None

def parse_env_file(path):
    path=Path(path)
    if not path.is_file():
        return {}
    values={}
    content=path.read_text(encoding="utf-8-sig",errors="ignore")
    for raw in content.replace("\r\n","\n").replace("\r","\n").splitlines():
        line=raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line=line[7:].strip()
        if "=" not in line:
            continue
        name,value=line.split("=",1)
        name=name.strip()
        if name in KEY_NAMES:
            cleaned=clean_value(value)
            if cleaned:
                values[name]=cleaned
    return values

key=None
key_source=None

for name in KEY_NAMES:
    value=clean_value(os.getenv(name))
    if value:
        key=value
        key_source=f"process-env:{name}"
        break

candidate_env_files=[
    "/opt/skilledge/stock-engine/.env.server",
    "/opt/skilledge/stock-engine/.env",
    "/opt/skilledge/stock-engine/.env.local",
    "/opt/skilledge/stock-engine/.env.production",
    "/etc/skilledge/stock-engine.env",
    "/etc/default/skilledge-stock-engine",
]

if not key:
    for file in candidate_env_files:
        values=parse_env_file(file)
        for name in KEY_NAMES:
            if values.get(name):
                key=values[name]
                key_source=f"env-file:{file}:{name}"
                break
        if key:
            break

if not key:
    raise SystemExit("FMP_KEY_NOT_FOUND")

def symbol_like(value):
    if not isinstance(value,str):
        return None
    value=value.strip().upper()
    if not value or len(value)>6:
        return None
    allowed=set("ABCDEFGHIJKLMNOPQRSTUVWXYZ.-/")
    if any(ch not in allowed for ch in value):
        return None
    if not any(ch.isalpha() for ch in value):
        return None
    return value

def extract_symbols(node):
    found=[]
    if isinstance(node,dict):
        for key,value in node.items():
            key_l=str(key).lower()
            if key_l in {"symbol","ticker"}:
                symbol=symbol_like(value)
                if symbol:
                    found.append(symbol)
            elif key_l in {"symbols","tickers","universe"} and isinstance(value,list):
                for item in value:
                    if isinstance(item,str):
                        symbol=symbol_like(item)
                        if symbol:
                            found.append(symbol)
                    else:
                        found.extend(extract_symbols(item))
            else:
                found.extend(extract_symbols(value))
    elif isinstance(node,list):
        for item in node:
            found.extend(extract_symbols(item))
    return found

candidate_order=[]
seen=set(exact250)

for file in universe_files:
    path=Path(file)
    if not path.is_file():
        continue
    try:
        data=json.loads(path.read_text(encoding="utf-8-sig",errors="ignore"))
    except Exception:
        continue
    for symbol in extract_symbols(data):
        if symbol not in seen:
            seen.add(symbol)
            candidate_order.append(symbol)

# Add current watchlist symbols as fallback after static universe files.
watchlist_candidates=[
    Path("/opt/skilledge/stock-engine/data/watchlist.json"),
    Path("/opt/skilledge/stock-engine/data/discovery_watchlist.json"),
]

for path in watchlist_candidates:
    if not path.is_file():
        continue
    try:
        data=json.loads(path.read_text(encoding="utf-8-sig",errors="ignore"))
    except Exception:
        continue
    for symbol in extract_symbols(data):
        if symbol not in seen:
            seen.add(symbol)
            candidate_order.append(symbol)

semaphore=asyncio.Semaphore(6)

async def validate_one(client,symbol):
    async with semaphore:
        try:
            response=await client.get(
                "https://financialmodelingprep.com/stable/profile",
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
                "profileFound":bool(row and len(row)>1),
                "allowed":decision.allowed,
                "classification":decision.classification,
                "reasons":list(decision.reasons),
                "evidence":decision.evidence,
            }
        except Exception as exc:
            return {
                "symbol":symbol,
                "profileFound":False,
                "allowed":False,
                "classification":"REFERENCE_FETCH_FAILED",
                "reasons":[type(exc).__name__],
                "evidence":{},
            }

async def main():
    async with httpx.AsyncClient(
        headers={"User-Agent":"SkillEdge-S10.7M/1.0"}
    ) as client:
        rows=await asyncio.gather(
            *(validate_one(client,s) for s in candidate_order)
        )

    valid=[row for row in rows if row["allowed"]]
    replacements=valid[:len(blocked)]

    if len(replacements)<len(blocked):
        ok=False
        classification="DAY7D_REPLACEMENT_POOL_INSUFFICIENT"
        final=[]
    else:
        replacement_map={
            old:new["symbol"]
            for old,new in zip(blocked,replacements)
        }
        final=[replacement_map.get(symbol,symbol) for symbol in exact250]
        ok=(
            len(final)==250
            and len(set(final))==250
            and all(symbol not in final for symbol in blocked)
        )
        classification=(
            "DAY7D_VALIDATED_250_REPLACEMENT_POOL_BUILT"
            if ok
            else "DAY7D_REPLACEMENT_POOL_FINAL_VALIDATION_FAILED"
        )

    result={
        "ok":ok,
        "classification":classification,
        "inspectionOnly":True,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "deploymentAuthorized":False,
        "liveProvider":"databento",
        "referenceProvider":"fmp",
        "fmpKeySource":key_source,
        "secretValuesExposed":False,
        "sourceCandidateCount":len(candidate_order),
        "validatedReplacementCandidateCount":len(valid),
        "blockedSymbols":blocked,
        "replacementRows":replacements,
        "replacementMap":{
            old:new["symbol"]
            for old,new in zip(blocked,replacements)
        },
        "finalUniverseCount":len(final),
        "finalUniverseUniqueCount":len(set(final)),
        "core25Preserved":exact250[:25]==final[:25] if final else False,
        "blockedSymbolsRemoved":all(s not in final for s in blocked) if final else False,
        "finalUniverse":final,
        "rejectedCandidateCount":sum(1 for row in rows if not row["allowed"]),
        "rejectedReasonCounts":dict(Counter(
            reason
            for row in rows if not row["allowed"]
            for reason in row["reasons"]
        )),
        "armAllowed":False,
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
        "nextAction":(
            "STATIC_REVIEW_VALIDATED_250_AND_BUILD_GUARDED_V2_CANARY_PACKAGE"
            if ok
            else "EXPAND_REPLACEMENT_CANDIDATE_SOURCES"
        ),
    }
    print(json.dumps(result,ensure_ascii=False))

asyncio.run(main())
'@

[IO.File]::WriteAllText($runner,$python,[Text.UTF8Encoding]::new($false))

$sh=@'
#!/usr/bin/env bash
set -euo pipefail

INPUT="$1"
SECURITY="$2"
RUNNER="$3"

cleanup() {
  rm -f "$INPUT" "$SECURITY" "$RUNNER" "$0"
}
trap cleanup EXIT

exec /opt/skilledge/stock-engine/.venv/bin/python \
  "$RUNNER" "$INPUT" "$SECURITY"
'@

$sh=$sh -replace "`r`n","`n"
[IO.File]::WriteAllText($shell,$sh,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7M VALIDATED REPLACEMENT POOL ===" -ForegroundColor Green
Write-Host "Read-only. No deploy, no restart, no universe change." -ForegroundColor Yellow
Write-Host "Blocked symbols: $($blocked -join ', ')"

& scp @ssh $input "${VpsHost}:$remoteInput"
if($LASTEXITCODE-ne 0){throw "Input upload failed"}

& scp @ssh $securityMaster "${VpsHost}:$remoteSecurity"
if($LASTEXITCODE-ne 0){throw "Security master upload failed"}

& scp @ssh $runner "${VpsHost}:$remoteRunner"
if($LASTEXITCODE-ne 0){throw "Runner upload failed"}

& scp @ssh $shell "${VpsHost}:$remoteShell"
if($LASTEXITCODE-ne 0){throw "Shell upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteShell' && '$remoteShell' '$remoteInput' '$remoteSecurity' '$remoteRunner'"
$exitCode=$LASTEXITCODE

Remove-Item -LiteralPath $input,$runner,$shell -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7M remote replacement pool failed"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $raw -Encoding UTF8

@{
  ok=$r.ok
  classification=$r.classification
  finalUniverse=$r.finalUniverse
  replacementMap=$r.replacementMap
  liveProvider=$r.liveProvider
  referenceProvider=$r.referenceProvider
  clientEligible=$false
  telegramEligible=$false
  paperEligible=$false
  armAllowed=$false
} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $finalUniverse -Encoding UTF8

@(
 "S10.7M VALIDATED REPLACEMENT POOL",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SOURCE_CANDIDATE_COUNT=$($r.sourceCandidateCount)",
 "VALIDATED_REPLACEMENT_CANDIDATE_COUNT=$($r.validatedReplacementCandidateCount)",
 "BLOCKED_SYMBOLS=$(@($r.blockedSymbols)-join ',')",
 "REPLACEMENT_MAP=$($r.replacementMap | ConvertTo-Json -Compress)",
 "FINAL_UNIVERSE_COUNT=$($r.finalUniverseCount)",
 "FINAL_UNIVERSE_UNIQUE_COUNT=$($r.finalUniverseUniqueCount)",
 "CORE25_PRESERVED=$($r.core25Preserved)",
 "BLOCKED_SYMBOLS_REMOVED=$($r.blockedSymbolsRemoved)",
 "LIVE_PROVIDER=$($r.liveProvider)",
 "REFERENCE_PROVIDER=$($r.referenceProvider)",
 "FMP_KEY_SOURCE=$($r.fmpKeySource)",
 "SECRET_VALUES_EXPOSED=$($r.secretValuesExposed)",
 "ARM_ALLOWED=$($r.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "FINAL_UNIVERSE_FILE=$finalUniverse",
 "RAW_JSON=$raw"
) | Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7M Validated Replacement Pool

- OK: $($r.ok)
- Classification: $($r.classification)
- Source candidates: $($r.sourceCandidateCount)
- Valid replacement candidates: $($r.validatedReplacementCandidateCount)
- Blocked symbols: $(@($r.blockedSymbols)-join ', ')
- Replacement map: $($r.replacementMap | ConvertTo-Json -Compress)
- Final count: $($r.finalUniverseCount)
- Final unique count: $($r.finalUniverseUniqueCount)
- Core25 preserved: $($r.core25Preserved)
- Blocked symbols removed: $($r.blockedSymbolsRemoved)
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7M COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Source candidates: $($r.sourceCandidateCount)"
Write-Host "Valid replacement candidates: $($r.validatedReplacementCandidateCount)"
Write-Host "Replacement map: $($r.replacementMap | ConvertTo-Json -Compress)"
Write-Host "Final / unique count: $($r.finalUniverseCount) / $($r.finalUniverseUniqueCount)"
Write-Host "Core25 preserved: $($r.core25Preserved)"
Write-Host "Blocked symbols removed: $($r.blockedSymbolsRemoved)"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Final universe: $finalUniverse"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "S10.7M replacement pool validation failed"
}
