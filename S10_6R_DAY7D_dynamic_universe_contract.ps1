param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="root@178.104.184.138",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner"
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"
New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_6R_DAY7D_UNIVERSE_CONTRACT_raw_$stamp.json"
$report=Join-Path $Audit "S10_6R_DAY7D_UNIVERSE_CONTRACT_report_$stamp.txt"
$contractFile=Join-Path $State "dynamic_universe_contract_v1.json"
$localSh=Join-Path $env:TEMP "s10_6r_universe_contract_$stamp.sh"
$remoteSh="/tmp/s10_6r_universe_contract_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import json
import subprocess
import urllib.request
from pathlib import Path

ENGINE=Path("/opt/skilledge/stock-engine")
CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def api_json(url):
    try:
        with urllib.request.urlopen(url,timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return {"_error":str(exc)}

universe_v1=read_json(ENGINE/"data/universe/skilledge_universe_v1_liquid_stocks.json")
universe_v2=read_json(ENGINE/"data/universe/skilledge_universe_v2_market_cap_buckets.json")
watchlist=api_json("http://127.0.0.1:8000/engine/watchlist")

stream_unit=subprocess.run(
    ["systemctl","cat","skilledge-market-stream.service"],
    capture_output=True,text=True,check=False,
).stdout

configured=[]
for line in stream_unit.splitlines():
    prefix="Environment=SKILLEDGE_MARKET_STREAM_SYMBOLS="
    if line.startswith(prefix):
        configured=[s.strip().upper() for s in line[len(prefix):].split(",") if s.strip()]

contract={
  "schemaVersion":1,
  "name":"skilledge_dynamic_universe_contract",
  "mode":"design_only",
  "productionEnabled":False,
  "researchOnly":True,
  "authorities":{
    "discoveryAuthority":{
      "component":"app.discovery.refresh_discovery_watchlist",
      "mayModifyLiveSubscription":False,
      "responsibility":[
        "collect and rank movers/gainers/losers/most-active candidates",
        "normalize symbols and apply baseline tradeability/liquidity filters"
      ]
    },
    "universeCoordinatorAuthority":{
      "component":"app.market_data.dynamic_universe_coordinator",
      "existsToday":False,
      "productionAuthorityEnabled":False,
      "responsibility":[
        "merge core, discovery and protected symbols",
        "deduplicate and rank subscription candidates",
        "apply capacity, freshness, hysteresis and cooldown rules",
        "emit one atomic desired-universe generation"
      ]
    },
    "subscriptionAuthority":{
      "component":"app.market_data.stream_service",
      "currentMode":"static_systemd_environment",
      "responsibility":[
        "subscribe only to coordinator-approved symbols",
        "preserve prior generation on validation failure"
      ]
    },
    "scannerAuthority":{
      "component":"app.market_data.scanner",
      "mayModifyLiveSubscription":False,
      "researchOnly":True
    }
  },
  "symbolStates":[
    "DISCOVERED","ELIGIBLE","SELECTED","SUBSCRIBED","WARMING","READY",
    "PROTECTED","EVICTION_PENDING","COOLDOWN","REJECTED"
  ],
  "selectionPolicy":{
    "currentVerifiedCapacity":25,
    "currentProductionCap":25,
    "dynamicRotationEnabled":False,
    "coreFallback":{"symbols":CORE25,"atomicFallback":True},
    "candidateSources":[
      "existing discovery watchlist",
      "universe_v1 liquid 150",
      "universe_v2 market-cap/float 259",
      "protected lifecycle symbols"
    ],
    "hysteresis":{
      "minimumResidenceSeconds":900,
      "evictionConfirmationCycles":3,
      "reentryCooldownSeconds":900
    }
  },
  "protectionPolicy":{
    "neverEvict":[
      "symbol with open paper position",
      "symbol with ACTIVE lifecycle",
      "symbol with unresolved management update",
      "symbol pinned by admin safety control"
    ]
  },
  "generationContract":{
    "fields":[
      "generationId","createdAt","sourceSnapshotIds","desiredSymbols",
      "addedSymbols","retainedSymbols","evictionPendingSymbols",
      "rejectedSymbols","capacity","researchOnly",
      "clientReleaseAllowed","telegramAllowed"
    ],
    "atomicWriteRequired":True,
    "deduplicationRequired":True,
    "rollbackToPreviousGeneration":True,
    "clientReleaseAllowed":False,
    "telegramAllowed":False
  },
  "rolloutPlan":[
    {"stage":"D1_CONTRACT","status":"CURRENT"},
    {"stage":"D2_OFFLINE_COORDINATOR","status":"NEXT"},
    {"stage":"D3_SHADOW_COMPARE","status":"BLOCKED"},
    {"stage":"D4_25_SYMBOL_ROTATION_CANARY","status":"BLOCKED"},
    {"stage":"D5_CAPACITY_EXPANSION","status":"BLOCKED"}
  ],
  "observedRuntime":{
    "configuredSymbols":configured,
    "configuredSymbolCount":len(configured),
    "core25ExactMatch":configured==CORE25,
    "universeV1Count":len(universe_v1.get("symbols") or []),
    "universeV2Count":len(universe_v2.get("symbols") or []),
    "watchlistReadError":watchlist.get("_error") if isinstance(watchlist,dict) else None
  },
  "safety":{
    "productionMutation":False,
    "serviceRestarted":False,
    "paperTouched":False,
    "apiAppTouched":False,
    "strategyEngineTouched":False,
    "telegramTouched":False,
    "clientGatesTouched":False
  }
}

errors=[]
if len(CORE25)!=25 or len(set(CORE25))!=25: errors.append("CORE25_INVALID")
if contract["selectionPolicy"]["currentProductionCap"]!=25: errors.append("UNVERIFIED_CAPACITY_CHANGE")
if contract["selectionPolicy"]["dynamicRotationEnabled"]: errors.append("ROTATION_MUST_REMAIN_DISABLED")
if contract["generationContract"]["clientReleaseAllowed"]: errors.append("CLIENT_RELEASE_MUST_REMAIN_BLOCKED")
if contract["generationContract"]["telegramAllowed"]: errors.append("TELEGRAM_MUST_REMAIN_BLOCKED")
if len(configured)!=25: errors.append("CURRENT_STREAM_NOT_25_SYMBOLS")
if len(universe_v1.get("symbols") or [])<100: errors.append("UNIVERSE_V1_TOO_SMALL")
if len(universe_v2.get("symbols") or [])<150: errors.append("UNIVERSE_V2_TOO_SMALL")

ok=not errors
print(json.dumps({
  "ok":ok,
  "classification":"DAY7D_SINGLE_DYNAMIC_UNIVERSE_CONTRACT_VALIDATED" if ok else "DAY7D_UNIVERSE_CONTRACT_VALIDATION_FAILED",
  "contract":contract,
  "validationErrors":errors,
  "nextAction":"BUILD_OFFLINE_DYNAMIC_UNIVERSE_COORDINATOR",
  **contract["safety"]
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7D UNIVERSE CONTRACT VALIDATOR ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== BUILD + VALIDATE DESIGN CONTRACT ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no production mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote contract validation failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json
$r.contract|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $contractFile -Encoding UTF8

@(
 "S10.6R DAY 7D DYNAMIC UNIVERSE CONTRACT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "CURRENT_PRODUCTION_CAP=$($r.contract.selectionPolicy.currentProductionCap)",
 "DYNAMIC_ROTATION_ENABLED=$($r.contract.selectionPolicy.dynamicRotationEnabled)",
 "CONFIGURED_SYMBOL_COUNT=$($r.contract.observedRuntime.configuredSymbolCount)",
 "CORE25_EXACT_MATCH=$($r.contract.observedRuntime.core25ExactMatch)",
 "UNIVERSE_V1_COUNT=$($r.contract.observedRuntime.universeV1Count)",
 "UNIVERSE_V2_COUNT=$($r.contract.observedRuntime.universeV2Count)",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "CONTRACT_FILE=$contractFile",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6R_DAY7D_UNIVERSE_CONTRACT_$stamp.md"
@"
# S10.6R Day 7D Dynamic Universe Contract

- OK: $($r.ok)
- Classification: $($r.classification)
- Current production cap: $($r.contract.selectionPolicy.currentProductionCap)
- Dynamic rotation enabled: $($r.contract.selectionPolicy.dynamicRotationEnabled)
- Configured symbols: $($r.contract.observedRuntime.configuredSymbolCount)
- Core 25 exact match: $($r.contract.observedRuntime.core25ExactMatch)
- Universe v1 count: $($r.contract.observedRuntime.universeV1Count)
- Universe v2 count: $($r.contract.observedRuntime.universeV2Count)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6R DAY 7D CONTRACT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Current production cap: $($r.contract.selectionPolicy.currentProductionCap)"
Write-Host "Dynamic rotation enabled: $($r.contract.selectionPolicy.dynamicRotationEnabled)"
Write-Host "Configured symbols: $($r.contract.observedRuntime.configuredSymbolCount)"
Write-Host "Core25 exact match: $($r.contract.observedRuntime.core25ExactMatch)"
Write-Host "Universe v1 count: $($r.contract.observedRuntime.universeV1Count)"
Write-Host "Universe v2 count: $($r.contract.observedRuntime.universeV2Count)"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Contract: $contractFile"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){throw "Day 7D universe contract validation failed"}
