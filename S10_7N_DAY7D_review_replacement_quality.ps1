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

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$replacementRaw=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7M_REPLACEMENT_POOL_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $replacementRaw){
  throw "Latest S10.7M replacement raw not found"
}

$payload=Get-Content -LiteralPath $replacementRaw.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$replacements=@($payload.replacementMap.PSObject.Properties.Value)

$replacements=@(
  $replacements |
  ForEach-Object {([string]$_).Trim().ToUpperInvariant()} |
  Where-Object {$_} |
  Select-Object -Unique
)

if($replacements.Count -ne 8){
  throw "Expected 8 replacement symbols, got $($replacements.Count)"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$input=Join-Path $env:TEMP "s10_7n_input_$stamp.json"
$runner=Join-Path $env:TEMP "s10_7n_runner_$stamp.py"
$shell=Join-Path $env:TEMP "s10_7n_run_$stamp.sh"

$remoteInput="/tmp/s10_7n_input_$stamp.json"
$remoteRunner="/tmp/s10_7n_runner_$stamp.py"
$remoteShell="/tmp/s10_7n_run_$stamp.sh"

$raw=Join-Path $Audit "S10_7N_REPLACEMENT_QUALITY_REVIEW_raw_$stamp.json"
$report=Join-Path $Audit "S10_7N_REPLACEMENT_QUALITY_REVIEW_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7N_REPLACEMENT_QUALITY_REVIEW_$stamp.md"

@{
  sourceRaw=$replacementRaw.FullName
  replacements=$replacements
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $input -Encoding UTF8

$python=@'
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

payload=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
symbols=[str(x).strip().upper() for x in payload["replacements"]]

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
    out={}
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
                out[name]=value
    return out

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
MIN_AVG_VOLUME=500_000
MIN_MARKET_CAP=50_000_000

async def fetch_one(client,symbol):
    profile_response,quote_response=await asyncio.gather(
        client.get(
            "https://financialmodelingprep.com/stable/profile",
            params={"symbol":symbol,"apikey":key},
            timeout=30.0,
        ),
        client.get(
            "https://financialmodelingprep.com/stable/quote",
            params={"symbol":symbol,"apikey":key},
            timeout=30.0,
        ),
    )

    profile_response.raise_for_status()
    quote_response.raise_for_status()

    profile_data=profile_response.json()
    quote_data=quote_response.json()

    profile=(
        dict(profile_data[0])
        if isinstance(profile_data,list) and profile_data
        else dict(profile_data)
        if isinstance(profile_data,dict)
        else {}
    )
    quote=(
        dict(quote_data[0])
        if isinstance(quote_data,list) and quote_data
        else dict(quote_data)
        if isinstance(quote_data,dict)
        else {}
    )

    price=float(
        quote.get("price")
        or profile.get("price")
        or 0
    )
    avg_volume=int(
        quote.get("avgVolume")
        or quote.get("avgVolume10days")
        or profile.get("volAvg")
        or 0
    )
    market_cap=int(
        quote.get("marketCap")
        or profile.get("mktCap")
        or 0
    )
    active=profile.get("isActivelyTrading")
    is_etf=profile.get("isEtf")
    is_fund=profile.get("isFund")
    exchange=str(
        profile.get("exchangeShortName")
        or profile.get("exchange")
        or ""
    ).upper()

    reasons=[]

    if active is not True:
        reasons.append("NOT_ACTIVE")

    if is_etf is True:
        reasons.append("ETF")

    if is_fund is True:
        reasons.append("FUND")

    if price<MIN_PRICE:
        reasons.append("PRICE_BELOW_1")

    if avg_volume<MIN_AVG_VOLUME:
        reasons.append("AVG_VOLUME_BELOW_500K")

    if market_cap<MIN_MARKET_CAP:
        reasons.append("MARKET_CAP_BELOW_50M")

    if exchange not in {"NASDAQ","NYSE","AMEX","NYSEAMERICAN","BATS","CBOE"}:
        reasons.append("UNSUPPORTED_EXCHANGE")

    if not symbol.replace(".","").replace("-","").isalnum():
        reasons.append("NON_CANONICAL_SYMBOL_FORMAT")

    return {
        "symbol":symbol,
        "name":profile.get("companyName"),
        "exchange":exchange,
        "price":price,
        "avgVolume":avg_volume,
        "marketCap":market_cap,
        "isActivelyTrading":active,
        "isEtf":is_etf,
        "isFund":is_fund,
        "capacityEligible":not reasons,
        "reasons":reasons,
    }

async def main():
    async with httpx.AsyncClient(
        headers={"User-Agent":"SkillEdge-S10.7N/1.0"}
    ) as client:
        rows=await asyncio.gather(*(fetch_one(client,s) for s in symbols))

    eligible=[row["symbol"] for row in rows if row["capacityEligible"]]
    rejected=[row for row in rows if not row["capacityEligible"]]

    result={
        "ok":len(rejected)==0,
        "classification":(
            "DAY7D_REPLACEMENT_QUALITY_REVIEW_PASSED"
            if not rejected
            else "DAY7D_REPLACEMENT_QUALITY_REVIEW_BLOCKED"
        ),
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
        "thresholds":{
            "minPrice":MIN_PRICE,
            "minAvgVolume":MIN_AVG_VOLUME,
            "minMarketCap":MIN_MARKET_CAP,
        },
        "replacementCount":len(rows),
        "capacityEligibleCount":len(eligible),
        "capacityRejectedCount":len(rejected),
        "eligibleSymbols":eligible,
        "rejected":rejected,
        "rows":rows,
        "armAllowed":False,
        "clientEligible":False,
        "telegramEligible":False,
        "paperEligible":False,
        "nextAction":(
            "BUILD_GUARDED_V2_CANARY_PACKAGE"
            if not rejected
            else "BUILD_LIQUIDITY_AWARE_REPLACEMENT_POOL"
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
RUNNER="$2"

cleanup() {
  rm -f "$INPUT" "$RUNNER" "$0"
}
trap cleanup EXIT

exec /opt/skilledge/stock-engine/.venv/bin/python \
  "$RUNNER" "$INPUT"
'@

$sh=$sh -replace "`r`n","`n"
[IO.File]::WriteAllText($shell,$sh,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7N REPLACEMENT QUALITY REVIEW ===" -ForegroundColor Green
Write-Host "Read-only. No deploy, no restart, no universe change." -ForegroundColor Yellow
Write-Host "Replacements: $($replacements -join ', ')"

& scp @ssh $input "${VpsHost}:$remoteInput"
if($LASTEXITCODE-ne 0){throw "Input upload failed"}

& scp @ssh $runner "${VpsHost}:$remoteRunner"
if($LASTEXITCODE-ne 0){throw "Runner upload failed"}

& scp @ssh $shell "${VpsHost}:$remoteShell"
if($LASTEXITCODE-ne 0){throw "Shell upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteShell' && '$remoteShell' '$remoteInput' '$remoteRunner'"
$exitCode=$LASTEXITCODE

Remove-Item -LiteralPath $input,$runner,$shell -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7N remote quality review failed"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7N REPLACEMENT QUALITY REVIEW",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "REPLACEMENT_COUNT=$($r.replacementCount)",
 "CAPACITY_ELIGIBLE_COUNT=$($r.capacityEligibleCount)",
 "CAPACITY_REJECTED_COUNT=$($r.capacityRejectedCount)",
 "ELIGIBLE_SYMBOLS=$(@($r.eligibleSymbols)-join ',')",
 "MIN_PRICE=$($r.thresholds.minPrice)",
 "MIN_AVG_VOLUME=$($r.thresholds.minAvgVolume)",
 "MIN_MARKET_CAP=$($r.thresholds.minMarketCap)",
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
 "RAW_JSON=$raw"
) | Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7N Replacement Quality Review

- OK: $($r.ok)
- Classification: $($r.classification)
- Replacements reviewed: $($r.replacementCount)
- Capacity eligible: $($r.capacityEligibleCount)
- Capacity rejected: $($r.capacityRejectedCount)
- Eligible symbols: $(@($r.eligibleSymbols)-join ', ')
- Minimum price: $($r.thresholds.minPrice)
- Minimum average volume: $($r.thresholds.minAvgVolume)
- Minimum market cap: $($r.thresholds.minMarketCap)
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7N COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Capacity eligible / rejected: $($r.capacityEligibleCount) / $($r.capacityRejectedCount)"
Write-Host "Eligible symbols: $(@($r.eligibleSymbols)-join ', ')"
Write-Host "Thresholds price/avgVolume/marketCap: $($r.thresholds.minPrice) / $($r.thresholds.minAvgVolume) / $($r.thresholds.minMarketCap)"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
