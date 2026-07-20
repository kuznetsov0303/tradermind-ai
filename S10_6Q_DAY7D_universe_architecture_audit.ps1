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
$raw=Join-Path $Audit "S10_6Q_DAY7D_UNIVERSE_ARCH_AUDIT_raw_$stamp.json"
$report=Join-Path $Audit "S10_6Q_DAY7D_UNIVERSE_ARCH_AUDIT_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6q_universe_audit_$stamp.sh"
$remoteSh="/tmp/s10_6q_universe_audit_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

engine=Path("/opt/skilledge/stock-engine")
app=engine/"app"

keywords=[
    "universe","watchlist","discovery","movers","gainers","losers",
    "most_active","most-active","stock_screener","screening",
    "premarket","market_cap","float","volume","rvol","liquidity",
    "spread","in_play","in-play","refresh","candidate","symbol",
]

exclude_parts={
    ".venv","__pycache__","rollback_snapshots","audit_exports",
    "historical_learning","node_modules",".git",
}

def excluded(path):
    return any(part in exclude_parts for part in path.parts)

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def read_text(path):
    return path.read_text(encoding="utf-8",errors="replace")

files=[]
for path in engine.rglob("*"):
    if not path.is_file() or excluded(path):
        continue
    if path.suffix.lower() not in {".py",".json",".yaml",".yml",".toml",".ini",".service",".timer",".md"}:
        continue
    try:
        text=read_text(path)
    except Exception:
        continue

    lowered=text.lower()
    matches=sorted({word for word in keywords if word in lowered})
    if not matches:
        continue

    files.append({
        "path":str(path),
        "relativePath":str(path.relative_to(engine)),
        "sha256":sha256(path),
        "sizeBytes":path.stat().st_size,
        "matchedKeywords":matches,
    })

# Rank likely architecture files.
def score(item):
    rel=item["relativePath"].lower()
    value=len(item["matchedKeywords"])
    for token,boost in [
        ("discovery",15),("watchlist",15),("universe",15),
        ("scanner",12),("app.py",8),("market_data",6),
        ("service",3),("timer",3),
    ]:
        if token in rel:
            value+=boost
    return value

files.sort(key=score,reverse=True)
top_files=files[:60]

details=[]
url_patterns=[
    r'https?://[^"\'\s)]+',
    r'/api/v\d+/[^"\'\s)]+',
    r'financialmodelingprep[^"\'\s)]+',
]

for item in top_files[:25]:
    path=Path(item["path"])
    text=read_text(path)
    lines=text.splitlines()

    interesting=[]
    for index,line in enumerate(lines):
        lower=line.lower()
        if any(word in lower for word in keywords):
            if len(interesting)>=80:
                break
            interesting.append({
                "line":index+1,
                "text":line[:500],
            })

    urls=[]
    for pattern in url_patterns:
        urls.extend(re.findall(pattern,text,re.I))

    functions=[]
    classes=[]
    env_names=[]
    try:
        tree=ast.parse(text) if path.suffix==".py" else None
    except Exception:
        tree=None

    if tree:
        for node in ast.walk(tree):
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                name=node.name.lower()
                if any(word.replace("-","_") in name for word in keywords):
                    functions.append({
                        "name":node.name,
                        "line":node.lineno,
                    })
            elif isinstance(node,ast.ClassDef):
                name=node.name.lower()
                if any(word.replace("-","_") in name for word in keywords):
                    classes.append({
                        "name":node.name,
                        "line":node.lineno,
                    })
            elif isinstance(node,ast.Call):
                if (
                    isinstance(node.func,ast.Attribute)
                    and isinstance(node.func.value,ast.Name)
                    and node.func.value.id=="os"
                    and node.func.attr=="getenv"
                    and node.args
                    and isinstance(node.args[0],ast.Constant)
                    and isinstance(node.args[0].value,str)
                ):
                    env_names.append(node.args[0].value)

    details.append({
        **item,
        "score":score(item),
        "functions":functions[:50],
        "classes":classes[:30],
        "environmentNames":sorted(set(env_names)),
        "urls":sorted(set(urls))[:50],
        "interestingLines":interesting,
    })

# Runtime routes and units.
routes=[]
app_py=app/"api/app.py"
if app_py.exists():
    text=read_text(app_py)
    route_re=re.compile(
        r'@app\.(get|post|put|patch|delete)\(\s*["\']([^"\']+)["\']',
        re.I,
    )
    for method,path in route_re.findall(text):
        lower=path.lower()
        if any(token in lower for token in ("discover","watch","universe","scanner","mover")):
            routes.append({"method":method.upper(),"path":path})

units={}
for unit_name in [
    "skilledge-stock-engine-api.service",
    "skilledge-market-stream.service",
]:
    p=subprocess.run(
        ["systemctl","cat",unit_name],
        capture_output=True,text=True,check=False
    )
    units[unit_name]={
        "returncode":p.returncode,
        "content":p.stdout,
        "stderr":p.stderr,
    }

# Search systemd for discovery/universe timers.
unit_search=subprocess.run(
    [
        "bash","-lc",
        "grep -RilE 'discovery|watchlist|universe|scanner|movers' "
        "/etc/systemd/system /lib/systemd/system 2>/dev/null | head -100"
    ],
    capture_output=True,text=True,check=False,
)

# Current market stream config, redacted to relevant fields only.
stream_show=subprocess.run(
    [
        "systemctl","show","skilledge-market-stream.service",
        "--property=ActiveState,SubState,MainPID,NRestarts,Environment,ExecStart"
    ],
    capture_output=True,text=True,check=False,
)

# DB schema/table name references only.
table_names=sorted(set(re.findall(
    r'(?i)\b(?:from|into|update|table\()\s*["\']?([a-z_][a-z0-9_]*)',
    read_text(app_py) if app_py.exists() else ""
)))
relevant_tables=[
    name for name in table_names
    if any(token in name for token in (
        "watch","discover","candidate","signal","registry","universe","scanner"
    ))
]

# Determine architecture status.
paths_lower=[item["relativePath"].lower() for item in files]
has_discovery=any("discovery" in p for p in paths_lower) or any("discovery" in r["path"].lower() for r in routes)
has_watchlist=any("watchlist" in p for p in paths_lower) or any("watch" in r["path"].lower() for r in routes)
has_new_scanner=any("app/market_data/scanner.py" in p.replace("\\","/") for p in paths_lower)
has_universe_coordinator=any(
    "universe" in p and ("coordinator" in p or "manager" in p or "service" in p)
    for p in paths_lower
)

issues=[]
if has_discovery and has_new_scanner:
    issues.append("LEGACY_DISCOVERY_AND_NEW_SCANNER_NEED_EXPLICIT_BRIDGE")
if not has_universe_coordinator:
    issues.append("NO_DEDICATED_DYNAMIC_UNIVERSE_COORDINATOR_FOUND")
if not has_discovery:
    issues.append("NO_DISCOVERY_LAYER_FOUND")
if not has_watchlist:
    issues.append("NO_WATCHLIST_LAYER_FOUND")

recommendation=[
    "preserve existing discovery/watchlist behavior until parity tests pass",
    "introduce one dynamic-universe coordinator as the only subscription authority",
    "separate discovery candidates from subscribed live symbols",
    "use liquidity/activity tiers and bounded partitions",
    "retain 25-symbol core canary as permanent fallback partition",
    "make universe changes atomic, deduplicated and rollbackable",
    "keep scanner research-only until universe rotation soak passes",
]

ok=app.exists() and len(files)>0 and stream_show.returncode==0

print(json.dumps({
    "ok":ok,
    "classification":(
        "DAY7D_EXISTING_UNIVERSE_ARCHITECTURE_MAPPED"
        if ok else "DAY7D_UNIVERSE_ARCHITECTURE_AUDIT_FAILED"
    ),
    "inspectionOnly":True,
    "productionMutation":False,
    "serviceRestarted":False,
    "paperTouched":False,
    "apiAppTouched":False,
    "strategyEngineTouched":False,
    "telegramTouched":False,
    "clientGatesTouched":False,
    "matchedFileCount":len(files),
    "topFiles":details,
    "relevantRoutes":routes,
    "relevantDatabaseTables":relevant_tables,
    "systemdKeywordFiles":[
        line for line in unit_search.stdout.splitlines() if line.strip()
    ],
    "units":units,
    "marketStreamRuntime":stream_show.stdout.strip(),
    "architectureFlags":{
        "hasExistingDiscovery":has_discovery,
        "hasExistingWatchlist":has_watchlist,
        "hasNewMarketDataScanner":has_new_scanner,
        "hasDedicatedUniverseCoordinator":has_universe_coordinator,
    },
    "issues":issues,
    "recommendedArchitecture":recommendation,
    "nextAction":"DESIGN_SINGLE_DYNAMIC_UNIVERSE_CONTRACT",
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7D UNIVERSE ARCHITECTURE AUDIT ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN READ-ONLY DISCOVERY/WATCHLIST/UNIVERSE AUDIT ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no production mutation." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue

if($LASTEXITCODE-ne 0){
    throw "Remote universe audit failed before structured result"
}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6Q DAY 7D UNIVERSE ARCHITECTURE AUDIT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "MATCHED_FILE_COUNT=$($r.matchedFileCount)",
 "HAS_EXISTING_DISCOVERY=$($r.architectureFlags.hasExistingDiscovery)",
 "HAS_EXISTING_WATCHLIST=$($r.architectureFlags.hasExistingWatchlist)",
 "HAS_NEW_MARKET_DATA_SCANNER=$($r.architectureFlags.hasNewMarketDataScanner)",
 "HAS_DEDICATED_UNIVERSE_COORDINATOR=$($r.architectureFlags.hasDedicatedUniverseCoordinator)",
 "RELEVANT_ROUTE_COUNT=$(@($r.relevantRoutes).Count)",
 "ISSUES=$(@($r.issues)-join ',')",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

$milestone=Join-Path $Milestones "S10_6Q_DAY7D_UNIVERSE_ARCH_AUDIT_$stamp.md"
@"
# S10.6Q Day 7D Universe Architecture Audit

Generated: $((Get-Date).ToString("s"))

- OK: $($r.ok)
- Classification: $($r.classification)
- Matched files: $($r.matchedFileCount)
- Existing discovery: $($r.architectureFlags.hasExistingDiscovery)
- Existing watchlist: $($r.architectureFlags.hasExistingWatchlist)
- New market-data scanner: $($r.architectureFlags.hasNewMarketDataScanner)
- Dedicated universe coordinator: $($r.architectureFlags.hasDedicatedUniverseCoordinator)
- Relevant routes: $(@($r.relevantRoutes).Count)
- Issues: $(@($r.issues)-join ', ')
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No paper/API/strategy/Telegram/client action.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6Q DAY 7D AUDIT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Matched files: $($r.matchedFileCount)"
Write-Host "Existing discovery: $($r.architectureFlags.hasExistingDiscovery)"
Write-Host "Existing watchlist: $($r.architectureFlags.hasExistingWatchlist)"
Write-Host "New scanner: $($r.architectureFlags.hasNewMarketDataScanner)"
Write-Host "Dedicated universe coordinator: $($r.architectureFlags.hasDedicatedUniverseCoordinator)"
Write-Host "Relevant routes: $(@($r.relevantRoutes).Count)"
Write-Host "Issues: $(@($r.issues)-join ', ')"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $r.ok){
    throw "Day 7D universe architecture audit failed"
}
