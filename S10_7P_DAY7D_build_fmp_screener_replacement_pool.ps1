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

if($exact250.Count -ne 250){throw "Expected exact250 count 250, got $($exact250.Count)"}
if($blocked.Count -ne 8){throw "Expected blocked count 8, got $($blocked.Count)"}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$input=Join-Path $env:TEMP "s10_7p_input_$stamp.json"
$runner=Join-Path $env:TEMP "s10_7p_runner_$stamp.py"
$shell=Join-Path $env:TEMP "s10_7p_run_$stamp.sh"

$remoteInput="/tmp/s10_7p_input_$stamp.json"
$remoteSecurity="/tmp/s10_7p_security_$stamp.py"
$remoteRunner="/tmp/s10_7p_runner_$stamp.py"
$remoteShell="/tmp/s10_7p_run_$stamp.sh"

$raw=Join-Path $Audit "S10_7P_FMP_SCREENER_REPLACEMENT_POOL_raw_$stamp.json"
$report=Join-Path $Audit "S10_7P_FMP_SCREENER_REPLACEMENT_POOL_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7P_FMP_SCREENER_REPLACEMENT_POOL_$stamp.md"
$finalUniverse=Join-Path $Audit "S10_7P_VALIDATED_LIQUID_250_UNIVERSE_$stamp.json"

@{
  sourceReview=$review.FullName
  sourceProbe=$probe.FullName
  exact250=$exact250
  blockedSymbols=$blocked
} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $input -Encoding UTF8

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

payload=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
security_path=Path(sys.argv[2])

spec=importlib.util.spec_from_file_location("security_master",security_path)
security=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=security
spec.loader.exec_module(security)

exact250=[str(x).strip().upper() for x in payload["exact250"]]
blocked=[str(x).strip().upper() for x in payload["blockedSymbols"]]

KEY_NAMES=(
    "FMP_API_KEY",
    "FMP_KEY",
    "FINANCIAL_MODELING_PREP_API_KEY",
    "NEXT_PUBLIC_FMP_API_KEY",
)

def clean(value):
    text=str(value or "").strip().strip("\ufeff")
    if len(text)>=2 and text[0] in {"'",'"'} and text[-1]==text[0]:
        text=text[1:-1]
    return text.strip() or None

def parse_env(path):
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
            value=clean(value)
            if value:
                values[name]=value
    return values

key=None
key_source=None

for name in KEY_NAMES:
    value=clean(os.getenv(name))
    if value:
        key=value
        key_source=f"process-env:{name}"
        break

if not key:
    for file in (
        "/opt/skilledge/stock-engine/.env.server",
        "/opt/skilledge/stock-engine/.env",
        "/opt/skilledge/stock-engine/.env.local",
        "/opt/skilledge/stock-engine/.env.production",
        "/etc/skilledge/stock-engine.env",
        "/etc/default/skilledge-stock-engine",
    ):
        values=parse_env(file)
        for name in KEY_NAMES:
            if values.get(name):
                key=values[name]
                key_source=f"env-file:{file}:{name}"
                break
        if key:
            break

if not key:
    raise SystemExit("FMP_KEY_NOT_FOUND")

MIN_PRICE=1.0
MIN_VOLUME=500_000
MIN_MARKET_CAP=50_000_000
EXCHANGES=("NASDAQ","NYSE","AMEX")
LIMIT_PER_EXCHANGE=1000

def as_float(value,default=0.0):
    try:
        return float(value)
    except Exception:
        return default

def as_int(value,default=0):
    try:
        return int(float(value))
    except Exception:
        return default

async def fetch_screener(client,exchange):
    response=await client.get(
        "https://financialmodelingprep.com/stable/company-screener",
        params={
            "exchange":exchange,
            "country":"US",
            "isEtf":"false",
            "isFund":"false",
            "priceMoreThan":MIN_PRICE,
            "volumeMoreThan":MIN_VOLUME,
            "marketCapMoreThan":MIN_MARKET_CAP,
            "limit":LIMIT_PER_EXCHANGE,
            "apikey":key,
        },
        timeout=60.0,
    )
    response.raise_for_status()
    data=response.json()
    if not isinstance(data,list):
        raise RuntimeError(f"Unexpected screener response for {exchange}")
    return data

async def fetch_profile(client,symbol):
    response=await client.get(
        "https://financialmodelingprep.com/stable/profile",
        params={"symbol":symbol,"apikey":key},
        timeout=30.0,
    )
    response.raise_for_status()
    data=response.json()
    if isinstance(data,list):
        return dict(data[0]) if data else {}
    if isinstance(data,dict):
        return dict(data)
    return {}

async def main():
    async with httpx.AsyncClient(
        headers={"User-Agent":"SkillEdge-S10.7P/1.0"}
    ) as client:
        screener_batches=await asyncio.gather(
            *(fetch_screener(client,exchange) for exchange in EXCHANGES)
        )

        screener_rows=[]
        for exchange,batch in zip(EXCHANGES,screener_batches):
            for raw in batch:
                row=dict(raw)
                row["_requestedExchange"]=exchange
                screener_rows.append(row)

        # Deduplicate and exclude existing/blocked symbols.
        candidates_by_symbol={}
        excluded=set(exact250) | set(blocked)

        for row in screener_rows:
            symbol=str(row.get("symbol") or "").strip().upper()
            if not symbol or symbol in excluded:
                continue
            if len(symbol)>5 or not symbol.isalnum():
                continue

            price=as_float(row.get("price"))
            volume=as_int(
                row.get("volume")
                or row.get("avgVolume")
                or row.get("volAvg")
            )
            market_cap=as_int(
                row.get("marketCap")
                or row.get("mktCap")
            )

            if price<MIN_PRICE:
                continue
            if volume<MIN_VOLUME:
                continue
            if market_cap<MIN_MARKET_CAP:
                continue

            normalized={
                "symbol":symbol,
                "companyName":row.get("companyName") or row.get("name"),
                "exchange":str(
                    row.get("exchangeShortName")
                    or row.get("exchange")
                    or row.get("_requestedExchange")
                    or ""
                ).upper(),
                "price":price,
                "volume":volume,
                "marketCap":market_cap,
                "screenerRawKeys":sorted(row.keys()),
            }

            previous=candidates_by_symbol.get(symbol)
            if previous is None or (
                normalized["volume"],
                normalized["marketCap"],
            ) > (
                previous["volume"],
                previous["marketCap"],
            ):
                candidates_by_symbol[symbol]=normalized

        preliminary=sorted(
            candidates_by_symbol.values(),
            key=lambda row:(row["volume"],row["marketCap"]),
            reverse=True,
        )

        # Validate enough top candidates through profile metadata.
        profile_targets=preliminary[:100]
        semaphore=asyncio.Semaphore(8)

        async def validate(row):
            async with semaphore:
                try:
                    profile=await fetch_profile(client,row["symbol"])
                    profile.setdefault("symbol",row["symbol"])
                    decision=security.classify_security(profile)
                    reasons=list(decision.reasons)

                    if profile.get("isActivelyTrading") is not True:
                        reasons.append("NOT_ACTIVE")

                    if profile.get("isEtf") is True:
                        reasons.append("ETF")

                    if profile.get("isFund") is True:
                        reasons.append("FUND")

                    return {
                        **row,
                        "profileFound":bool(profile and len(profile)>1),
                        "securityAllowed":decision.allowed,
                        "profileClassification":decision.classification,
                        "profileReasons":sorted(set(reasons)),
                        "isActivelyTrading":profile.get("isActivelyTrading"),
                        "isEtf":profile.get("isEtf"),
                        "isFund":profile.get("isFund"),
                        "capacityEligible":decision.allowed and not reasons,
                    }
                except Exception as exc:
                    return {
                        **row,
                        "profileFound":False,
                        "securityAllowed":False,
                        "profileClassification":"PROFILE_FETCH_FAILED",
                        "profileReasons":[type(exc).__name__],
                        "isActivelyTrading":None,
                        "isEtf":None,
                        "isFund":None,
                        "capacityEligible":False,
                    }

        validated=await asyncio.gather(*(validate(row) for row in profile_targets))

    eligible=[
        row for row in validated
        if row["capacityEligible"]
    ]

    eligible.sort(
        key=lambda row:(row["volume"],row["marketCap"]),
        reverse=True,
    )

    selected=eligible[:len(blocked)]

    if len(selected)<len(blocked):
        ok=False
        classification="DAY7D_FMP_SCREENER_REPLACEMENT_POOL_INSUFFICIENT"
        final=[]
        replacement_map={}
    else:
        replacement_map={
            old:new["symbol"]
            for old,new in zip(blocked,selected)
        }
        final=[
            replacement_map.get(symbol,symbol)
            for symbol in exact250
        ]

        ok=(
            len(final)==250
            and len(set(final))==250
            and exact250[:25]==final[:25]
            and all(symbol not in final for symbol in blocked)
        )

        classification=(
            "DAY7D_FMP_SCREENER_VALIDATED_LIQUID_250_BUILT"
            if ok
            else "DAY7D_FMP_SCREENER_FINAL_VALIDATION_FAILED"
        )

    rejected=[row for row in validated if not row["capacityEligible"]]

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
        "screenerEndpoint":"/stable/company-screener",
        "thresholds":{
            "minPrice":MIN_PRICE,
            "minVolume":MIN_VOLUME,
            "minMarketCap":MIN_MARKET_CAP,
        },
        "exchangeRequests":list(EXCHANGES),
        "screenerRawRowCount":len(screener_rows),
        "preliminaryCandidateCount":len(preliminary),
        "profileValidatedCount":len(validated),
        "capacityEligibleCount":len(eligible),
        "capacityRejectedCount":len(rejected),
        "selectedReplacementRows":selected,
        "replacementMap":replacement_map,
        "topEligibleCandidates":eligible[:20],
        "rejectedReasonCounts":dict(Counter(
            reason
            for row in rejected
            for reason in row["profileReasons"]
        )),
        "finalUniverseCount":len(final),
        "finalUniverseUniqueCount":len(set(final)),
        "core25Preserved":exact250[:25]==final[:25] if final else False,
        "blockedSymbolsRemoved":all(
            symbol not in final for symbol in blocked
        ) if final else False,
        "finalUniverse":final,
        "armAllowed":False,
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
        "nextAction":(
            "STATIC_REVIEW_LIQUID_250_AND_BUILD_GUARDED_V2_CANARY_PACKAGE"
            if ok
            else "DIAGNOSE_FMP_SCREENER_RESPONSE"
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
Write-Host "=== S10.7P FMP SCREENER REPLACEMENT POOL ===" -ForegroundColor Green
Write-Host "Read-only. Official company-screener. No deploy, no restart." -ForegroundColor Yellow
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
  throw "S10.7P remote screener pool failed"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $raw -Encoding UTF8

@{
  ok=$r.ok
  classification=$r.classification
  finalUniverse=$r.finalUniverse
  replacementMap=$r.replacementMap
  selectedReplacementRows=$r.selectedReplacementRows
  thresholds=$r.thresholds
  liveProvider=$r.liveProvider
  referenceProvider=$r.referenceProvider
  armAllowed=$false
  clientEligible=$false
  telegramEligible=$false
  paperEligible=$false
} | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $finalUniverse -Encoding UTF8

@(
 "S10.7P FMP SCREENER REPLACEMENT POOL",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SCREENER_ENDPOINT=$($r.screenerEndpoint)",
 "SCREENER_RAW_ROW_COUNT=$($r.screenerRawRowCount)",
 "PRELIMINARY_CANDIDATE_COUNT=$($r.preliminaryCandidateCount)",
 "PROFILE_VALIDATED_COUNT=$($r.profileValidatedCount)",
 "CAPACITY_ELIGIBLE_COUNT=$($r.capacityEligibleCount)",
 "CAPACITY_REJECTED_COUNT=$($r.capacityRejectedCount)",
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
# S10.7P FMP Screener Replacement Pool

- OK: $($r.ok)
- Classification: $($r.classification)
- Screener endpoint: $($r.screenerEndpoint)
- Screener rows: $($r.screenerRawRowCount)
- Preliminary candidates: $($r.preliminaryCandidateCount)
- Profile validated: $($r.profileValidatedCount)
- Capacity eligible: $($r.capacityEligibleCount)
- Capacity rejected: $($r.capacityRejectedCount)
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
Write-Host "=== S10.7P COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Screener rows / preliminary: $($r.screenerRawRowCount) / $($r.preliminaryCandidateCount)"
Write-Host "Profile validated / eligible: $($r.profileValidatedCount) / $($r.capacityEligibleCount)"
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
  throw "S10.7P FMP screener replacement pool validation failed"
}
