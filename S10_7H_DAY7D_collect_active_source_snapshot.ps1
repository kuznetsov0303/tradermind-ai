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
$SnapshotDir=Join-Path $State "S10_7H_active_source_snapshot"

New-Item -ItemType Directory -Force -Path $Audit,$State,$Milestones,$SnapshotDir|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$raw=Join-Path $Audit "S10_7H_ACTIVE_SOURCE_SNAPSHOT_raw_$stamp.json"
$report=Join-Path $Audit "S10_7H_ACTIVE_SOURCE_SNAPSHOT_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7H_ACTIVE_SOURCE_SNAPSHOT_$stamp.md"
$archive=Join-Path $Audit "S10_7H_ACTIVE_SOURCE_SNAPSHOT_$stamp.tar.gz"

$remoteScript="/tmp/s10_7h_active_source_snapshot_$stamp.sh"
$remoteArchive="/tmp/s10_7h_active_source_snapshot_$stamp.tar.gz"
$localScript=Join-Path $env:TEMP "s10_7h_active_source_snapshot_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
OUT="/tmp/s10_7h_active_source_snapshot"
ARCHIVE="$1"

rm -rf "$OUT"
mkdir -p "$OUT"

cd "$ENGINE"

python3 - <<'PY'
from __future__ import annotations

import ast
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT=Path("/opt/skilledge/stock-engine")
OUT=Path("/tmp/s10_7h_active_source_snapshot")

CANDIDATES=[
    Path("app/market_stream/stream_service.py"),
    Path("app/market_stream/market_state.py"),
    Path("app/market_stream/candles.py"),
    Path("app/market_stream/scanner.py"),
    Path("app/market_stream/provider.py"),
    Path("app/market_stream/contracts.py"),
    Path("app/discovery.py"),
    Path("app/storage.py"),
    Path("app/api/app.py"),
    Path("ops/runner_utils.py"),
]

# Also include active Python files referenced by ExecStart.
service_names=[
    "skilledge-market-stream.service",
    "skilledge-stock-engine-api.service",
]

service_info={}

for service in service_names:
    show=subprocess.run(
        ["systemctl","show",service,"--property=FragmentPath,ExecStart,EnvironmentFiles"],
        capture_output=True,text=True,check=False
    ).stdout.strip()

    cat=subprocess.run(
        ["systemctl","cat",service],
        capture_output=True,text=True,check=False
    ).stdout

    service_info[service]={
        "show":show,
        "cat":cat,
    }

    for match in re.findall(r'(/[^\s;"\']+\.py)',show+" "+cat):
        path=Path(match)
        try:
            rel=path.relative_to(ROOT)
        except Exception:
            continue
        CANDIDATES.append(rel)

# Resolve duplicates and existing files only.
seen=set()
active_files=[]

for rel in CANDIDATES:
    rel=Path(rel)
    if rel in seen:
        continue
    seen.add(rel)
    src=ROOT/rel
    if src.is_file():
        active_files.append(rel)

# Find active imports within the selected files, one level deep, restricted to app/ and ops/.
extra=[]

for rel in list(active_files):
    src=ROOT/rel
    try:
        tree=ast.parse(src.read_text(encoding="utf-8",errors="ignore"))
    except Exception:
        continue

    for node in ast.walk(tree):
        names=[]
        if isinstance(node,ast.Import):
            names=[alias.name for alias in node.names]
        elif isinstance(node,ast.ImportFrom):
            if node.module:
                names=[node.module]

        for name in names:
            if not (name.startswith("app.") or name.startswith("ops.")):
                continue

            candidate=Path(*name.split(".")).with_suffix(".py")
            if (ROOT/candidate).is_file() and candidate not in seen:
                seen.add(candidate)
                extra.append(candidate)

active_files.extend(extra)

# Copy selected source files.
copied=[]

for rel in active_files:
    src=ROOT/rel
    dst=OUT/rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)
    copied.append(str(rel))

# Save sanitized service definitions.
svc_dir=OUT/"systemd"
svc_dir.mkdir(parents=True,exist_ok=True)

for service,payload in service_info.items():
    safe_cat=re.sub(
        r'(?m)^(Environment=.*(?:KEY|TOKEN|SECRET|PASSWORD).*)$',
        'Environment=<REDACTED_SECRET_ENV>',
        payload["cat"],
    )
    safe_show=re.sub(
        r'(?m)(?:KEY|TOKEN|SECRET|PASSWORD)=[^\s;]+',
        r'\1=<REDACTED>',
        payload["show"],
    )
    (svc_dir/f"{service}.cat.txt").write_text(safe_cat,encoding="utf-8")
    (svc_dir/f"{service}.show.txt").write_text(safe_show,encoding="utf-8")

# Produce exact function/class index and targeted matches.
terms={
    "databento":["databento","MBP1","latencyMs","reconnect","event_count","appliedTrades"],
    "securityMaster":["assetType","securityType","common stock","exchangeShortName","FMP","profile"],
    "snapshot":["market_state_snapshot","candle_indicator_snapshot","atomic","write_text","json.dump"],
    "scanner":["scanner","scan","cycle","perf_counter","monotonic"],
    "setup":["setup_engine","evaluate","candidate","perf_counter","monotonic"],
    "candles":["candle","complete","openingRange","expected_bars","closedCount"],
}

index=[]

for rel in active_files:
    src=ROOT/rel
    text=src.read_text(encoding="utf-8",errors="ignore")
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
        for i,line in enumerate(lines,1):
            for needle in needles:
                if needle.lower() in line.lower():
                    hit_lines.append(i)
                    hit_terms.append(needle)
        if hit_lines:
            matches[category]={
                "terms":sorted(set(hit_terms)),
                "lines":sorted(set(hit_lines))[:200],
            }

    index.append({
        "path":str(rel),
        "sizeBytes":src.stat().st_size,
        "symbols":symbols,
        "matches":matches,
    })

manifest={
    "ok":True,
    "classification":"DAY7D_ACTIVE_SOURCE_SNAPSHOT_COLLECTED",
    "inspectionOnly":True,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "activeFiles":copied,
    "activeFileCount":len(copied),
    "serviceInfoFiles":[
        "systemd/skilledge-market-stream.service.cat.txt",
        "systemd/skilledge-market-stream.service.show.txt",
        "systemd/skilledge-stock-engine-api.service.cat.txt",
        "systemd/skilledge-stock-engine-api.service.show.txt",
    ],
    "sourceIndex":index,
    "nextAction":"BUILD_EXACT_SECURITY_MASTER_AND_FULL_INSTRUMENTATION_PATCH",
}

(OUT/"manifest.json").write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),
    encoding="utf-8",
)

print(json.dumps(manifest,ensure_ascii=False))
PY

tar -C "$OUT" -czf "$ARCHIVE" .
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localScript,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@(
  "-i",$SshKey,
  "-o","BatchMode=yes",
  "-o","StrictHostKeyChecking=accept-new"
)

Write-Host ""
Write-Host "=== S10.7H ACTIVE SOURCE SNAPSHOT ===" -ForegroundColor Green
Write-Host "Read-only. No deploy, no restart, no universe change." -ForegroundColor Yellow

& scp @ssh $localScript "${VpsHost}:$remoteScript"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteScript' && '$remoteScript' '$remoteArchive'; rc=`$?; rm -f '$remoteScript'; exit `$rc"
if($LASTEXITCODE-ne 0){throw "Remote snapshot failed"}

& scp @ssh "${VpsHost}:$remoteArchive" $archive
if($LASTEXITCODE-ne 0){throw "Archive download failed"}

& ssh @ssh $VpsHost "rm -f '$remoteArchive'; rm -rf /tmp/s10_7h_active_source_snapshot"
Remove-Item -LiteralPath $localScript -Force -ErrorAction SilentlyContinue

$remoteText=$out -join "`n"
$r=$remoteText|ConvertFrom-Json
$remoteText|Set-Content -LiteralPath $raw -Encoding UTF8

if(Test-Path -LiteralPath $SnapshotDir){
  Remove-Item -LiteralPath $SnapshotDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $SnapshotDir|Out-Null

tar -xzf $archive -C $SnapshotDir
if($LASTEXITCODE-ne 0){throw "Local archive extraction failed"}

@(
 "S10.7H ACTIVE SOURCE SNAPSHOT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "INSPECTION_ONLY=$($r.inspectionOnly)",
 "ACTIVE_FILE_COUNT=$($r.activeFileCount)",
 "ACTIVE_FILES=$(@($r.activeFiles)-join ',')",
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
# S10.7H Active Source Snapshot

- OK: $($r.ok)
- Classification: $($r.classification)
- Inspection only: $($r.inspectionOnly)
- Active files: $($r.activeFileCount)
- Next action: $($r.nextAction)

Artifacts:
- Snapshot directory: $SnapshotDir
- Archive: $archive
- Raw manifest: $raw

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7H SNAPSHOT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Inspection only: $($r.inspectionOnly)"
Write-Host "Active file count: $($r.activeFileCount)"
Write-Host "Active files: $(@($r.activeFiles)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Snapshot directory: $SnapshotDir"
Write-Host "Archive: $archive"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
