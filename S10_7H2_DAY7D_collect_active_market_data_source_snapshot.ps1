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
$SnapshotDir=Join-Path $State "S10_7H2_active_market_data_source_snapshot"

New-Item -ItemType Directory -Force -Path $Audit,$State,$Milestones,$SnapshotDir|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7H2_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_raw_$stamp.json"
$report=Join-Path $Audit "S10_7H2_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7H2_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_$stamp.md"
$archive=Join-Path $Audit "S10_7H2_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_$stamp.tar.gz"

$localSh=Join-Path $env:TEMP "s10_7h2_active_market_data_$stamp.sh"
$remoteSh="/tmp/s10_7h2_active_market_data_$stamp.sh"
$remoteArchive="/tmp/s10_7h2_active_market_data_$stamp.tar.gz"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
OUT="/tmp/s10_7h2_active_market_data_source_snapshot"
ARCHIVE="$1"

cleanup() {
  rm -rf "$OUT"
}
trap cleanup EXIT

rm -rf "$OUT"
mkdir -p "$OUT"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
from collections import deque
from pathlib import Path

ROOT=Path("/opt/skilledge/stock-engine")
OUT=Path("/tmp/s10_7h2_active_market_data_source_snapshot")
SERVICE="skilledge-market-stream.service"

show=subprocess.run(
    ["systemctl","show",SERVICE,
     "--property=FragmentPath,ExecStart,EnvironmentFiles,MainPID,NRestarts,ActiveState,SubState,Result"],
    capture_output=True,text=True,check=True,
).stdout

cat=subprocess.run(
    ["systemctl","cat",SERVICE],
    capture_output=True,text=True,check=True,
).stdout

module_match=re.search(r'(?:^|\s)-m\s+([A-Za-z0-9_.]+)',show+" "+cat)

if not module_match:
    raise SystemExit("MARKET_STREAM_MODULE_NOT_FOUND")

module_name=module_match.group(1)
entry_rel=Path(*module_name.split(".")).with_suffix(".py")
entry_abs=ROOT/entry_rel

if not entry_abs.is_file():
    raise SystemExit(f"MARKET_STREAM_ENTRY_NOT_FOUND:{entry_rel}")

def module_to_rel(name:str):
    py=Path(*name.split(".")).with_suffix(".py")
    pkg=Path(*name.split("."))/"__init__.py"

    if (ROOT/py).is_file():
        return py

    if (ROOT/pkg).is_file():
        return pkg

    return None

queue=deque([(entry_rel,0)])
seen=set()
active=[]

while queue:
    rel,depth=queue.popleft()

    if rel in seen:
        continue

    seen.add(rel)
    src=ROOT/rel

    if not src.is_file():
        continue

    active.append(rel)

    if depth>=3:
        continue

    text=src.read_text(encoding="utf-8",errors="ignore")

    try:
        tree=ast.parse(text)
    except Exception:
        continue

    current_package=".".join(rel.with_suffix("").parts[:-1])

    for node in ast.walk(tree):
        candidates=[]

        if isinstance(node,ast.Import):
            candidates.extend(alias.name for alias in node.names)

        elif isinstance(node,ast.ImportFrom):
            if node.level and current_package:
                parts=current_package.split(".")
                base=parts[:max(0,len(parts)-node.level+1)]
                if node.module:
                    base.extend(node.module.split("."))
                candidates.append(".".join(base))
            elif node.module:
                candidates.append(node.module)

        for name in candidates:
            if not (name.startswith("app.") or name.startswith("ops.")):
                continue

            dep=module_to_rel(name)

            if dep is not None and dep not in seen:
                queue.append((dep,depth+1))

# Include package init files for all selected modules.
for rel in list(active):
    parents=list(rel.parents)

    for parent in parents:
        if str(parent)==".":
            continue

        init=parent/"__init__.py"

        if (ROOT/init).is_file() and init not in seen:
            seen.add(init)
            active.append(init)

copied=[]

for rel in sorted(set(active),key=str):
    src=ROOT/rel
    dst=OUT/rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)
    copied.append(str(rel))

svc=OUT/"systemd"
svc.mkdir(parents=True,exist_ok=True)

safe_cat=re.sub(
    r'(?m)^(Environment=.*(?:KEY|TOKEN|SECRET|PASSWORD).*)$',
    'Environment=<REDACTED_SECRET_ENV>',
    cat,
)

safe_show=re.sub(
    r'(?m)\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=[^\s;]+',
    lambda match:f"{match.group(1)}=<REDACTED>",
    show,
)

(svc/f"{SERVICE}.cat.txt").write_text(safe_cat,encoding="utf-8")
(svc/f"{SERVICE}.show.txt").write_text(safe_show,encoding="utf-8")

terms={
    "databento":["databento","DBNStore","Live","mbp-1","MBP1","TradeMsg","Mbp1Msg"],
    "events":["event","record","message","appliedTrades","count","rate"],
    "latency":["latency","ts_recv","ts_event","processing","lag"],
    "reconnect":["reconnect","retry","backoff","error","exception"],
    "snapshot":["snapshot","write_text","json.dump","replace","atomic"],
    "marketState":["market_state","quote","bid","ask","last_trade"],
    "candles":["candle","bar","opening_range","vwap","ema","atr"],
    "metrics":["metric","perf_counter","monotonic","rss","cpu"],
}

index=[]

for rel in copied:
    path=ROOT/rel
    text=path.read_text(encoding="utf-8",errors="ignore")
    lines=text.splitlines()
    symbols=[]

    try:
        tree=ast.parse(text)

        for node in ast.walk(tree):
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
                symbols.append({
                    "kind":type(node).__name__,
                    "name":node.name,
                    "line":getattr(node,"lineno",None),
                })
    except Exception:
        pass

    matches={}

    for category,needles in terms.items():
        hit_lines=[]
        hit_terms=[]

        for number,line in enumerate(lines,1):
            for needle in needles:
                if needle.lower() in line.lower():
                    hit_lines.append(number)
                    hit_terms.append(needle)

        if hit_lines:
            matches[category]={
                "terms":sorted(set(hit_terms)),
                "lines":sorted(set(hit_lines))[:300],
            }

    index.append({
        "path":rel,
        "sizeBytes":path.stat().st_size,
        "symbols":symbols,
        "matches":matches,
    })

required_entry="app/market_data/stream_service.py"
errors=[]

if required_entry not in copied:
    errors.append("ACTIVE_DATABENTO_STREAM_ENTRY_MISSING")

market_data_files=[p for p in copied if p.startswith("app/market_data/")]

if len(market_data_files)<2:
    errors.append("MARKET_DATA_DEPENDENCY_SET_TOO_SMALL")

manifest={
    "ok":not errors,
    "classification":(
        "DAY7D_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_COLLECTED"
        if not errors
        else "DAY7D_ACTIVE_MARKET_DATA_SOURCE_SNAPSHOT_BLOCKED"
    ),
    "inspectionOnly":True,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "service":SERVICE,
    "resolvedModule":module_name,
    "resolvedEntryFile":str(entry_rel),
    "activeFiles":copied,
    "activeFileCount":len(copied),
    "marketDataFiles":market_data_files,
    "marketDataFileCount":len(market_data_files),
    "sourceIndex":index,
    "validationErrors":errors,
    "nextAction":(
        "BUILD_EXACT_SECURITY_MASTER_AND_FULL_INSTRUMENTATION_PATCH"
        if not errors
        else "FIX_ACTIVE_MARKET_DATA_SOURCE_DISCOVERY"
    ),
}

(OUT/"manifest.json").write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),
    encoding="utf-8",
)

print(json.dumps(manifest,ensure_ascii=False))
PY

tar -C "$OUT" -czf "$ARCHIVE" .
'@

$bash=$bash-replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7H2 ACTIVE MARKET-DATA SOURCE SNAPSHOT ===" -ForegroundColor Green
Write-Host "Read-only. No deploy, no restart, no universe change." -ForegroundColor Yellow

& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh' '$remoteArchive'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
if($LASTEXITCODE-ne 0){throw "Remote snapshot failed"}

& scp @ssh "${VpsHost}:$remoteArchive" $archive
if($LASTEXITCODE-ne 0){throw "Archive download failed"}

& ssh @ssh $VpsHost "rm -f '$remoteArchive'"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

$remoteText=$out-join "`n"
$r=$remoteText|ConvertFrom-Json
$remoteText|Set-Content -LiteralPath $raw -Encoding UTF8

if(Test-Path -LiteralPath $SnapshotDir){
  Remove-Item -LiteralPath $SnapshotDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $SnapshotDir|Out-Null
tar -xzf $archive -C $SnapshotDir

if($LASTEXITCODE-ne 0){
  throw "Local extraction failed"
}

@(
 "S10.7H2 ACTIVE MARKET-DATA SOURCE SNAPSHOT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "RESOLVED_MODULE=$($r.resolvedModule)",
 "RESOLVED_ENTRY_FILE=$($r.resolvedEntryFile)",
 "ACTIVE_FILE_COUNT=$($r.activeFileCount)",
 "MARKET_DATA_FILE_COUNT=$($r.marketDataFileCount)",
 "MARKET_DATA_FILES=$(@($r.marketDataFiles)-join ',')",
 "VALIDATION_ERRORS=$(@($r.validationErrors)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "SNAPSHOT_DIR=$SnapshotDir",
 "ARCHIVE=$archive",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7H2 Active Market-Data Source Snapshot

- OK: $($r.ok)
- Classification: $($r.classification)
- Resolved module: $($r.resolvedModule)
- Entry file: $($r.resolvedEntryFile)
- Active files: $($r.activeFileCount)
- Market-data files: $($r.marketDataFileCount)
- Validation errors: $(@($r.validationErrors)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7H2 SNAPSHOT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Resolved module: $($r.resolvedModule)"
Write-Host "Resolved entry file: $($r.resolvedEntryFile)"
Write-Host "Active file count: $($r.activeFileCount)"
Write-Host "Market-data file count: $($r.marketDataFileCount)"
Write-Host "Market-data files: $(@($r.marketDataFiles)-join ', ')"
Write-Host "Validation errors: $(@($r.validationErrors)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Snapshot directory: $SnapshotDir"
Write-Host "Archive: $archive"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
  throw "Active market-data source snapshot blocked"
}
