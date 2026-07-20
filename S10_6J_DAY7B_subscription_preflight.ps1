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
$raw=Join-Path $Audit "S10_6J_DAY7B_SUBSCRIPTION_PREFLIGHT_raw_$stamp.json"
$report=Join-Path $Audit "S10_6J_DAY7B_SUBSCRIPTION_PREFLIGHT_report_$stamp.txt"
$localSh=Join-Path $env:TEMP "s10_6j_subscription_preflight_$stamp.sh"
$remoteSh="/tmp/s10_6j_subscription_preflight_$stamp.sh"

$bash=@'
#!/usr/bin/env bash
set -euo pipefail

ENGINE="/opt/skilledge/stock-engine"
UNIT="skilledge-market-stream.service"
STREAM="$ENGINE/app/market_data/stream_service.py"
ENVFILE="$ENGINE/.env.server"

export ENGINE UNIT STREAM ENVFILE
cd "$ENGINE"

.venv/bin/python - <<'PY'
from __future__ import annotations
import ast, hashlib, json, os, re, subprocess
from pathlib import Path

engine=Path(os.environ["ENGINE"])
stream=Path(os.environ["STREAM"])
envfile=Path(os.environ["ENVFILE"])
unit=os.environ["UNIT"]

candidate_symbols=[
 "AAPL","MSFT","NVDA","TSLA","AMD",
 "AMZN","META","GOOGL","AVGO","PLTR",
 "SMCI","MSTR","COIN","NFLX","CRM",
 "ORCL","INTC","MU","ARM","UBER",
 "SHOP","RIVN","SOFI","CRWD","NOW"
]

def run(args, env=None):
    p=subprocess.run(args,capture_output=True,text=True,check=False,env=env)
    return {"returncode":p.returncode,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}

def sha256(path):
    if not path.exists(): return None
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def safe_env_metadata(path):
    result={}
    if not path.exists(): return result
    for raw in path.read_text(encoding="utf-8",errors="replace").splitlines():
        line=raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        key,value=line.split("=",1)
        key=key.strip(); value=value.strip()
        if "SYMBOL" in key.upper() or "DATASET" in key.upper() or "SCHEMA" in key.upper():
            result[key]={"present":bool(value),"redacted":False,"value":value}
        else:
            result[key]={"present":bool(value),"redacted":True,"length":len(value)}
    return result

source=stream.read_text(encoding="utf-8",errors="replace")
tree=ast.parse(source)
getenv_names=set()
literal_symbol_lists=[]

for node in ast.walk(tree):
    if isinstance(node,ast.Call):
        if (
            isinstance(node.func,ast.Attribute)
            and isinstance(node.func.value,ast.Name)
            and node.func.value.id=="os"
            and node.func.attr=="getenv"
            and node.args
            and isinstance(node.args[0],ast.Constant)
            and isinstance(node.args[0].value,str)
        ):
            getenv_names.add(node.args[0].value)

    if isinstance(node,(ast.List,ast.Tuple)):
        vals=[]
        valid=True
        for item in node.elts:
            if isinstance(item,ast.Constant) and isinstance(item.value,str):
                vals.append(item.value)
            else:
                valid=False
                break
        if valid and vals and all(re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,9}",x) for x in vals):
            literal_symbol_lists.append(vals)

symbol_env_names=sorted(x for x in getenv_names if "SYMBOL" in x.upper())
dataset_env_names=sorted(x for x in getenv_names if "DATASET" in x.upper())
schema_env_names=sorted(x for x in getenv_names if "SCHEMA" in x.upper())

systemd_cat=run(["systemctl","cat",unit])
systemd_show=run([
 "systemctl","show",unit,
 "--property=LoadState,ActiveState,SubState,MainPID,NRestarts,EnvironmentFiles,Environment,ExecStart"
])

env_meta=safe_env_metadata(envfile)
configured_symbol_values={}
for name in symbol_env_names:
    meta=env_meta.get(name)
    if isinstance(meta,dict) and not meta.get("redacted") and "value" in meta:
        configured_symbol_values[name]=meta["value"]

syntax_valid={s:bool(re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,9}",s)) for s in candidate_symbols}
unique_ok=len(candidate_symbols)==len(set(candidate_symbols))
all_syntax_ok=all(syntax_valid.values())

sdk=run([
 str(engine/".venv/bin/python"),
 "-c",
 "import databento as db; print(getattr(db,'__version__','unknown'))"
])

child_env=os.environ.copy()
if envfile.exists():
    for raw in envfile.read_text(encoding="utf-8",errors="replace").splitlines():
        line=raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        key,value=line.split("=",1)
        child_env.setdefault(key.strip(),value.strip())

child_env["S10_SYMBOLS_JSON"]=json.dumps(candidate_symbols)

probe_script = '''
import json, os
import databento as db

symbols=json.loads(os.environ["S10_SYMBOLS_JSON"])
key=os.getenv("DATABENTO_API_KEY") or os.getenv("DBN_API_KEY")

if not key:
    print(json.dumps({
      "attempted":False,
      "ok":False,
      "resolved":[],
      "unresolved":symbols,
      "error":"api_key_not_available_in_process"
    }))
    raise SystemExit(0)

try:
    client=db.Historical(key=key)
    data=client.timeseries.get_range(
      dataset="EQUS.MINI",
      schema="definition",
      symbols=symbols,
      stype_in="raw_symbol",
      start="2026-07-17T00:00:00Z",
      end="2026-07-17T23:59:59Z",
      limit=50000,
    )
    resolved=set()
    for record in data:
        raw=getattr(record,"raw_symbol",None)
        if raw is not None:
            if isinstance(raw,bytes):
                raw=raw.decode(errors="ignore").rstrip("\\x00")
            resolved.add(str(raw).strip())
    unresolved=[s for s in symbols if s not in resolved]
    print(json.dumps({
      "attempted":True,
      "ok":len(unresolved)==0,
      "resolved":sorted(resolved.intersection(symbols)),
      "unresolved":unresolved,
      "error":None
    }))
except Exception as exc:
    print(json.dumps({
      "attempted":True,
      "ok":False,
      "resolved":[],
      "unresolved":symbols,
      "error":f"{type(exc).__name__}: {exc}"
    }))
'''

probe=run([str(engine/".venv/bin/python"),"-c",probe_script],env=child_env)
resolution={
 "attempted":False,"ok":False,"resolved":[],
 "unresolved":candidate_symbols,"error":"probe_output_missing"
}
if probe["stdout"]:
    try:
        resolution=json.loads(probe["stdout"])
    except Exception:
        resolution["error"]="probe_output_parse_failed"

config_discovered=bool(symbol_env_names or configured_symbol_values or literal_symbol_lists)
candidate_ready=unique_ok and all_syntax_ok
ok=(
 stream.exists()
 and systemd_show["returncode"]==0
 and sdk["returncode"]==0
 and candidate_ready
 and config_discovered
)

print(json.dumps({
 "ok":ok,
 "classification":"DAY7B_SUBSCRIPTION_CONFIGURATION_DISCOVERED" if ok else "DAY7B_SUBSCRIPTION_CONFIGURATION_PREFLIGHT_FAILED",
 "inspectionOnly":True,
 "productionMutation":False,
 "serviceRestarted":False,
 "paperTouched":False,
 "apiAppTouched":False,
 "strategyEngineTouched":False,
 "telegramTouched":False,
 "clientGatesTouched":False,
 "streamServiceSha256":sha256(stream),
 "envFileExists":envfile.exists(),
 "systemdCat":systemd_cat,
 "systemdShow":systemd_show,
 "getenvNames":sorted(getenv_names),
 "symbolEnvironmentNames":symbol_env_names,
 "datasetEnvironmentNames":dataset_env_names,
 "schemaEnvironmentNames":schema_env_names,
 "configuredSymbolValues":configured_symbol_values,
 "literalSymbolLists":literal_symbol_lists,
 "safeEnvironmentMetadata":env_meta,
 "databentoSdkVersion":sdk["stdout"],
 "candidateSymbols":candidate_symbols,
 "candidateCount":len(candidate_symbols),
 "candidateUnique":unique_ok,
 "candidateSyntaxValid":all_syntax_ok,
 "candidateResolution":resolution,
 "nextAction":"BUILD_AUTO_ROLLBACK_25_SYMBOL_CANARY" if ok else "STOP_AND_REVIEW_CONFIGURATION"
},ensure_ascii=False))
PY
'@

$bash=$bash -replace "`r`n","`n"
[IO.File]::WriteAllText($localSh,$bash,[Text.UTF8Encoding]::new($false))

$ssh=@("-i",$SshKey,"-o","BatchMode=yes","-o","StrictHostKeyChecking=accept-new")

Write-Host ""
Write-Host "=== UPLOAD DAY 7B SUBSCRIPTION PREFLIGHT ===" -ForegroundColor Green
& scp @ssh $localSh "${VpsHost}:$remoteSh"
if($LASTEXITCODE-ne 0){throw "Upload failed"}

Write-Host ""
Write-Host "=== RUN READ-ONLY CONFIGURATION DISCOVERY ===" -ForegroundColor Green
Write-Host "No deploy / no restart / no secrets printed." -ForegroundColor Yellow

$out=& ssh @ssh $VpsHost "chmod 700 '$remoteSh' && '$remoteSh'; rc=`$?; rm -f '$remoteSh'; exit `$rc"
Remove-Item -LiteralPath $localSh -Force -ErrorAction SilentlyContinue
if($LASTEXITCODE-ne 0){throw "Remote preflight failed"}

$text=$out -join "`n"
$text|Set-Content -LiteralPath $raw -Encoding UTF8
$r=$text|ConvertFrom-Json

@(
 "S10.6J DAY 7B SUBSCRIPTION PREFLIGHT",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SYMBOL_ENV_NAMES=$(@($r.symbolEnvironmentNames)-join ',')",
 "CONFIGURED_SYMBOL_VALUES=$((ConvertTo-Json $r.configuredSymbolValues -Compress))",
 "DATABENTO_SDK_VERSION=$($r.databentoSdkVersion)",
 "CANDIDATE_COUNT=$($r.candidateCount)",
 "CANDIDATE_UNIQUE=$($r.candidateUnique)",
 "CANDIDATE_SYNTAX_VALID=$($r.candidateSyntaxValid)",
 "RESOLUTION_ATTEMPTED=$($r.candidateResolution.attempted)",
 "RESOLUTION_OK=$($r.candidateResolution.ok)",
 "RESOLVED_COUNT=$(@($r.candidateResolution.resolved).Count)",
 "UNRESOLVED=$(@($r.candidateResolution.unresolved)-join ',')",
 "RESOLUTION_ERROR=$($r.candidateResolution.error)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=$($r.productionMutation)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

Write-Host ""
Write-Host "=== S10.6J DAY 7B PREFLIGHT COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Symbol env names: $(@($r.symbolEnvironmentNames)-join ', ')"
Write-Host "Configured symbols: $((ConvertTo-Json $r.configuredSymbolValues -Compress))"
Write-Host "Databento SDK: $($r.databentoSdkVersion)"
Write-Host "Candidate count: $($r.candidateCount)"
Write-Host "Resolution attempted: $($r.candidateResolution.attempted)"
Write-Host "Resolution OK: $($r.candidateResolution.ok)"
Write-Host "Resolved count: $(@($r.candidateResolution.resolved).Count)"
Write-Host "Unresolved: $(@($r.candidateResolution.unresolved)-join ', ')"
Write-Host "Resolution error: $($r.candidateResolution.error)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"

if(-not $r.ok){throw "Subscription preflight failed"}
