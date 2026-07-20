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

New-Item -ItemType Directory -Force -Path $Audit,$State,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7G_SECURITY_MASTER_INSTRUMENTATION_MAP_raw_$stamp.json"
$report=Join-Path $Audit "S10_7G_SECURITY_MASTER_INSTRUMENTATION_MAP_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7G_SECURITY_MASTER_INSTRUMENTATION_MAP_$stamp.md"

$localSh=Join-Path $env:TEMP "s10_7g_map_$stamp.sh"
$remoteSh="/tmp/s10_7g_map_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT=Path("/opt/skilledge/stock-engine")

TEXT_EXTENSIONS={".py",".service",".timer",".md",".json",".toml",".ini",".yaml",".yml"}

SEARCH_TERMS={
    "securityMetadata":[
        "securityType","assetType","instrumentType","isEtf","isFund",
        "isActivelyTrading","exchangeShortName","companyProfile",
        "profile/","stock/list","tradable","common stock",
    ],
    "fmpProvider":[
        "financialmodelingprep","FMP","fmp","apikey","profile",
        "stock-screener","company-screener",
    ],
    "streamMetrics":[
        "appliedTrades","event_count","events_per_second","eventsPerSecond",
        "processingLag","latency","reconnect","error_count","mbp-1","MBP1",
    ],
    "snapshotWriter":[
        "market_state_snapshot","candle_indicator_snapshot",
        "write_text","json.dump","atomic_write","snapshot",
    ],
    "scannerTiming":[
        "scanner","scan_cycle","cycle_ms","elapsed","perf_counter",
        "monotonic","duration",
    ],
    "setupTiming":[
        "setup_engine","evaluate_setups","setup cycle","candidate",
        "perf_counter","monotonic",
    ],
    "candleCompleteness":[
        "candle","bar_count","completeness","missing_bar","expected_bars",
        "interval","openingRange",
    ],
}

def safe_text(path:Path):
    try:
        return path.read_text(encoding="utf-8",errors="ignore")
    except Exception:
        return ""

files=[]

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        continue
    if any(part in {".venv","node_modules",".git","__pycache__"} for part in path.parts):
        continue
    files.append(path)

matches={key:[] for key in SEARCH_TERMS}

for path in files:
    text=safe_text(path)
    rel=str(path.relative_to(ROOT))

    for category,terms in SEARCH_TERMS.items():
        found=[]

        for term in terms:
            if term.lower() in text.lower():
                found.append(term)

        if found:
            matches[category].append({
                "path":rel,
                "matchedTerms":sorted(set(found)),
                "lineHints":[
                    index+1
                    for index,line in enumerate(text.splitlines())
                    if any(term.lower() in line.lower() for term in found)
                ][:25],
            })

# Identify likely Python classes/functions without exposing secrets.
symbols=[]

for path in files:
    if path.suffix.lower()!=".py":
        continue

    text=safe_text(path)

    try:
        tree=ast.parse(text)
    except Exception:
        continue

    for node in ast.walk(tree):
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
            name=getattr(node,"name","")
            lower=name.lower()

            if any(token in lower for token in (
                "stream","snapshot","scanner","setup","candle","fmp",
                "provider","metric","universe","security","instrument"
            )):
                symbols.append({
                    "path":str(path.relative_to(ROOT)),
                    "kind":type(node).__name__,
                    "name":name,
                    "line":getattr(node,"lineno",None),
                })

# Detect environment variable names only, never values.
env_names=set()

for path in files:
    text=safe_text(path)

    for match in re.finditer(r'\b(?:os\.getenv|environ\.get)\(\s*["\']([A-Z0-9_]+)',text):
        env_names.add(match.group(1))

    for match in re.finditer(r'Environment=([A-Z0-9_]+)=',text):
        env_names.add(match.group(1))

fmp_env_names=sorted(
    name for name in env_names
    if "FMP" in name or "FINANCIAL" in name
)

instrumentation_env_names=sorted(
    name for name in env_names
    if any(token in name for token in ("METRIC","DEBUG","SNAPSHOT","STREAM","SCANNER"))
)

# Classify readiness based on concrete hooks found.
readiness={
    "securityMasterProviderHookFound":bool(matches["securityMetadata"] and matches["fmpProvider"]),
    "streamMetricHookFound":bool(matches["streamMetrics"]),
    "snapshotWriterHookFound":bool(matches["snapshotWriter"]),
    "scannerTimingHookFound":bool(matches["scannerTiming"]),
    "setupTimingHookFound":bool(matches["setupTiming"]),
    "candleCompletenessHookFound":bool(matches["candleCompleteness"]),
}

missing=[]

for key,value in readiness.items():
    if not value:
        missing.append(key)

result={
    "ok":True,
    "classification":"DAY7D_SECURITY_MASTER_AND_INSTRUMENTATION_ARCHITECTURE_MAPPED",
    "inspectionOnly":True,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "filesScanned":len(files),
    "matches":matches,
    "candidateCodeSymbols":symbols[:500],
    "fmpEnvironmentVariableNames":fmp_env_names,
    "instrumentationEnvironmentVariableNames":instrumentation_env_names,
    "readiness":readiness,
    "missingHooks":missing,
    "nextAction":"BUILD_EXACT_SECURITY_MASTER_AND_FULL_INSTRUMENTATION_PATCH",
}

print(json.dumps(result,ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7G SECURITY MASTER + INSTRUMENTATION MAP ===" -ForegroundColor Green
Write-Host "Read-only. No deploy, no restart, no universe change." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"

if($LASTEXITCODE-ne 0){
  throw "Upload failed"
}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"

Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
  throw "Remote mapping failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.7G SECURITY MASTER AND FULL INSTRUMENTATION MAP",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "INSPECTION_ONLY=$($r.inspectionOnly)",
 "FILES_SCANNED=$($r.filesScanned)",
 "SECURITY_MASTER_PROVIDER_HOOK_FOUND=$($r.readiness.securityMasterProviderHookFound)",
 "STREAM_METRIC_HOOK_FOUND=$($r.readiness.streamMetricHookFound)",
 "SNAPSHOT_WRITER_HOOK_FOUND=$($r.readiness.snapshotWriterHookFound)",
 "SCANNER_TIMING_HOOK_FOUND=$($r.readiness.scannerTimingHookFound)",
 "SETUP_TIMING_HOOK_FOUND=$($r.readiness.setupTimingHookFound)",
 "CANDLE_COMPLETENESS_HOOK_FOUND=$($r.readiness.candleCompletenessHookFound)",
 "FMP_ENV_NAMES=$(@($r.fmpEnvironmentVariableNames)-join ',')",
 "MISSING_HOOKS=$(@($r.missingHooks)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7G Security Master + Instrumentation Architecture Map

- OK: $($r.ok)
- Classification: $($r.classification)
- Inspection only: $($r.inspectionOnly)
- Files scanned: $($r.filesScanned)
- Security master/provider hook: $($r.readiness.securityMasterProviderHookFound)
- Stream metric hook: $($r.readiness.streamMetricHookFound)
- Snapshot writer hook: $($r.readiness.snapshotWriterHookFound)
- Scanner timing hook: $($r.readiness.scannerTimingHookFound)
- Setup timing hook: $($r.readiness.setupTimingHookFound)
- Candle completeness hook: $($r.readiness.candleCompletenessHookFound)
- Missing hooks: $(@($r.missingHooks)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7G MAP COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Inspection only: $($r.inspectionOnly)"
Write-Host "Files scanned: $($r.filesScanned)"
Write-Host "Security master/provider hook: $($r.readiness.securityMasterProviderHookFound)"
Write-Host "Stream metric hook: $($r.readiness.streamMetricHookFound)"
Write-Host "Snapshot writer hook: $($r.readiness.snapshotWriterHookFound)"
Write-Host "Scanner timing hook: $($r.readiness.scannerTimingHookFound)"
Write-Host "Setup timing hook: $($r.readiness.setupTimingHookFound)"
Write-Host "Candle completeness hook: $($r.readiness.candleCompletenessHookFound)"
Write-Host "FMP env names: $(@($r.fmpEnvironmentVariableNames)-join ', ')"
Write-Host "Missing hooks: $(@($r.missingHooks)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
