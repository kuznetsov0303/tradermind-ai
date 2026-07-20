param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$V2=Join-Path $State "S10_7J_security_master_instrumentation_patch_v2"
$Active=Join-Path $State "S10_7H_active_source_snapshot"
$Discovery=Join-Path $Active "app\discovery.py"

if(-not (Test-Path -LiteralPath (Join-Path $V2 "app\market_data\stream_service.py"))){
  throw "Missing V2 patch package: $V2"
}

if(-not (Test-Path -LiteralPath $Discovery)){
  throw "Missing active discovery.py snapshot: $Discovery"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$V3=Join-Path $State "S10_7S_capacity_instrumentation_patch_v3_$stamp"
$Raw=Join-Path $Audit "S10_7S_CAPACITY_INSTRUMENTATION_V3_raw_$stamp.json"
$Report=Join-Path $Audit "S10_7S_CAPACITY_INSTRUMENTATION_V3_report_$stamp.txt"
$Milestone=Join-Path $Milestones "S10_7S_CAPACITY_INSTRUMENTATION_V3_$stamp.md"
$Builder=Join-Path $env:TEMP "s10_7s_builder_$stamp.py"

New-Item -ItemType Directory -Force -Path $V3|Out-Null
Copy-Item -LiteralPath $V2 -Destination (Join-Path $V3 "base_v2") -Recurse -Force

$python=@'
from __future__ import annotations

import ast
import importlib.util
import json
import sys
import textwrap
from pathlib import Path

project=Path(sys.argv[1])
v3=Path(sys.argv[2])

state=project/"PROJECT_STATE"
active=state/"S10_7H_active_source_snapshot"
source_discovery=active/"app"/"discovery.py"

patch_root=v3/"patch"
discovery_target=patch_root/"app"/"discovery.py"
probe_target=patch_root/"ops"/"scripts"/"capacity_metrics_probe.py"
test_target=v3/"tests"/"test_capacity_metrics_contract.py"
manifest_target=v3/"manifest.json"

discovery_target.parent.mkdir(parents=True,exist_ok=True)
probe_target.parent.mkdir(parents=True,exist_ok=True)
test_target.parent.mkdir(parents=True,exist_ok=True)

source_text=source_discovery.read_text(encoding="utf-8")
tree=ast.parse(source_text,filename=str(source_discovery))

target=None
for node in ast.walk(tree):
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name=="refresh_setup_engine_from_watchlist":
        target=node
        break

errors=[]

if target is None:
    errors.append("SETUP_REFRESH_FUNCTION_NOT_FOUND")
else:
    lines=source_text.splitlines()

    import_block=[]
    if "import time" not in source_text:
        import_block.append("import time")
    if "import os" not in source_text:
        import_block.append("import os")
    if "import json" not in source_text:
        import_block.append("import json")
    if "from pathlib import Path" not in source_text:
        import_block.append("from pathlib import Path")

    insert_at=0
    if lines and lines[0].startswith("#!"):
        insert_at=1

    if tree.body and isinstance(tree.body[0],ast.Expr):
        value=getattr(tree.body[0],"value",None)
        if isinstance(value,ast.Constant) and isinstance(value.value,str):
            insert_at=max(insert_at,tree.body[0].end_lineno or insert_at)

    if import_block:
        lines[insert_at:insert_at]=import_block+[""]

    updated="\n".join(lines)+"\n"
    tree=ast.parse(updated)

    target=None
    for node in ast.walk(tree):
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name=="refresh_setup_engine_from_watchlist":
            target=node
            break

    if target is None or not target.body:
        errors.append("SETUP_REFRESH_FUNCTION_REPARSE_FAILED")
    else:
        lines=updated.splitlines()
        start=target.body[0].lineno-1
        end=target.end_lineno
        indent=" " * target.col_offset
        body_indent=indent+"    "
        nested_indent=body_indent+"    "

        first=target.body[0]
        if isinstance(first,ast.Expr):
            value=getattr(first,"value",None)
            if isinstance(value,ast.Constant) and isinstance(value.value,str):
                start=first.end_lineno

        body_lines=lines[start:end]

        wrapped=[
            body_indent+"global _S10_7S_LAST_SETUP_CYCLE_MS",
            body_indent+"__s10_7s_started = time.perf_counter()",
            body_indent+"try:",
        ]

        for line in body_lines:
            wrapped.append(("    "+line) if line.strip() else line)

        wrapped.extend([
            body_indent+"finally:",
            nested_indent+"_S10_7S_LAST_SETUP_CYCLE_MS = round((time.perf_counter() - __s10_7s_started) * 1000.0, 3)",
            nested_indent+"_s10_7s_write_setup_cycle_metric(_S10_7S_LAST_SETUP_CYCLE_MS)",
        ])

        lines[start:end]=wrapped
        rejoined="\n".join(lines)+"\n"
        reparsed=ast.parse(rejoined)

        new_target=None
        for node in ast.walk(reparsed):
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name=="refresh_setup_engine_from_watchlist":
                new_target=node
                break

        helper=textwrap.dedent("""
        _S10_7S_LAST_SETUP_CYCLE_MS = None

        def _s10_7s_write_setup_cycle_metric(value_ms):
            path = Path(
                os.getenv(
                    "SKILLEDGE_SETUP_CYCLE_METRIC_PATH",
                    "/opt/skilledge/stock-engine/data/runtime/setup_cycle_metric.json",
                )
            )
            payload = {
                "schemaVersion": 1,
                "setupCycleMs": float(value_ms),
                "source": "refresh_setup_engine_from_watchlist",
                "recordedAtEpochSeconds": time.time(),
            }
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(path.suffix + ".tmp")
            temp.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            os.replace(temp, path)
        """).strip("\n").splitlines()

        lines=rejoined.splitlines()
        helper_at=(new_target.lineno-1) if new_target else 0
        lines[helper_at:helper_at]=helper+[""]
        patched_discovery="\n".join(lines)+"\n"

        ast.parse(patched_discovery,filename=str(discovery_target))
        discovery_target.write_text(patched_discovery,encoding="utf-8")

probe_source=r"""from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AGE_KEYS={
    "quoteageseconds",
    "lastquoteageseconds",
    "quote_age_seconds",
    "last_quote_age_seconds",
}

TIMESTAMP_KEYS={
    "lastquoteat",
    "quotetimestamp",
    "quotets",
    "last_quote_at",
    "quote_timestamp",
    "quote_ts",
}

def _float(value:Any)->float|None:
    try:
        number=float(value)
    except (TypeError,ValueError):
        return None
    return number if math.isfinite(number) else None

def _epoch_seconds(value:Any)->float|None:
    number=_float(value)

    if number is not None:
        if number>1e18:
            return number/1e9
        if number>1e15:
            return number/1e6
        if number>1e12:
            return number/1e3
        if number>1e9:
            return number

    if isinstance(value,str):
        text=value.strip().replace("Z","+00:00")
        try:
            parsed=datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                parsed=parsed.replace(tzinfo=timezone.utc)
            return parsed.timestamp()
        except ValueError:
            return None

    return None

def collect_quote_ages(node:Any,now_epoch:float|None=None)->list[float]:
    now_epoch=time.time() if now_epoch is None else now_epoch
    ages=[]

    def visit(value:Any):
        if isinstance(value,dict):
            for key,item in value.items():
                normalized=str(key).replace("-","_").lower()

                if normalized in AGE_KEYS:
                    age=_float(item)
                    if age is not None and age>=0:
                        ages.append(age)
                        continue

                if normalized in TIMESTAMP_KEYS:
                    timestamp=_epoch_seconds(item)
                    if timestamp is not None:
                        ages.append(max(0.0,now_epoch-timestamp))
                        continue

                visit(item)
        elif isinstance(value,list):
            for item in value:
                visit(item)

    visit(node)
    return ages

def percentile95(values:list[float])->float|None:
    values=sorted(float(v) for v in values if v is not None)

    if not values:
        return None

    if len(values)==1:
        return round(values[0],6)

    rank=0.95*(len(values)-1)
    lower=math.floor(rank)
    upper=math.ceil(rank)

    if lower==upper:
        result=values[lower]
    else:
        fraction=rank-lower
        result=values[lower]+(values[upper]-values[lower])*fraction

    return round(result,6)

def read_main_pid(service:str)->int|None:
    result=subprocess.run(
        ["systemctl","show",service,"--property=MainPID","--value"],
        capture_output=True,
        text=True,
        check=False,
    )

    try:
        pid=int((result.stdout or "").strip())
    except ValueError:
        return None

    return pid if pid>0 else None

def read_rss_bytes(pid:int)->int|None:
    path=Path(f"/proc/{pid}/status")

    if not path.is_file():
        return None

    match=re.search(
        r"^VmRSS:\s+(\d+)\s+kB$",
        path.read_text(encoding="utf-8",errors="ignore"),
        re.MULTILINE,
    )

    return int(match.group(1))*1024 if match else None

def count_provider_errors(service:str,since:str)->int:
    result=subprocess.run(
        [
            "journalctl",
            "-u",service,
            "--since",since,
            "--no-pager",
            "--output=cat",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    pattern=re.compile(
        r"\b(error|exception|fatal|traceback|failed)\b",
        re.IGNORECASE,
    )

    return sum(
        1
        for line in (result.stdout or "").splitlines()
        if pattern.search(line)
    )

def read_json(path:str|Path)->dict[str,Any]:
    file=Path(path)

    if not file.is_file():
        return {}

    try:
        data=json.loads(file.read_text(encoding="utf-8"))
    except (OSError,json.JSONDecodeError):
        return {}

    return data if isinstance(data,dict) else {}

def collect_capacity_metrics(
    *,
    market_state_path:str,
    setup_metric_path:str,
    market_service:str,
    since:str,
)->dict[str,Any]:
    market_state=read_json(market_state_path)
    ages=collect_quote_ages(market_state)
    setup_metric=read_json(setup_metric_path)
    pid=read_main_pid(market_service)

    return {
        "quoteFreshnessP95Seconds":percentile95(ages),
        "quoteFreshnessSampleCount":len(ages),
        "rssBytes":read_rss_bytes(pid) if pid else None,
        "providerErrorCount":count_provider_errors(market_service,since),
        "setupCycleMs":_float(setup_metric.get("setupCycleMs")),
        "marketServiceMainPid":pid,
    }

def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument(
        "--market-state-path",
        default="/opt/skilledge/stock-engine/data/runtime/market_state.json",
    )
    parser.add_argument(
        "--setup-metric-path",
        default="/opt/skilledge/stock-engine/data/runtime/setup_cycle_metric.json",
    )
    parser.add_argument(
        "--market-service",
        default="skilledge-market-stream.service",
    )
    parser.add_argument("--since",required=True)
    parser.add_argument("--output")
    args=parser.parse_args()

    metrics=collect_capacity_metrics(
        market_state_path=args.market_state_path,
        setup_metric_path=args.setup_metric_path,
        market_service=args.market_service,
        since=args.since,
    )

    result={
        "ok":all(
            metrics.get(key) is not None
            for key in (
                "quoteFreshnessP95Seconds",
                "rssBytes",
                "providerErrorCount",
                "setupCycleMs",
            )
        ),
        "classification":"DAY7D_CAPACITY_METRICS_PROBE_RESULT",
        "metrics":metrics,
    }

    encoded=json.dumps(result,ensure_ascii=False,indent=2)

    if args.output:
        Path(args.output).write_text(encoded,encoding="utf-8")

    print(encoded)
    return 0 if result["ok"] else 2

if __name__=="__main__":
    raise SystemExit(main())
"""

probe_target.write_text(probe_source,encoding="utf-8")
ast.parse(probe_source,filename=str(probe_target))

test_source=r"""from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

def load_module(path):
    spec=importlib.util.spec_from_file_location("capacity_metrics_probe_tested",path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    return module

def run_contract_test(probe_path):
    module=load_module(probe_path)
    now=2_000_000_000.0

    snapshot={
        "symbols":{
            "AAPL":{"quoteAgeSeconds":1.0},
            "MSFT":{"lastQuoteAt":now-3.0},
            "NVDA":{"quote_timestamp":(now-5.0)*1000.0},
        }
    }

    ages=module.collect_quote_ages(snapshot,now_epoch=now)
    assert sorted(round(x,6) for x in ages)==[1.0,3.0,5.0]
    assert module.percentile95(ages)==4.8

    with tempfile.TemporaryDirectory() as raw:
        root=Path(raw)
        market=root/"market.json"
        setup=root/"setup.json"

        market.write_text(json.dumps(snapshot),encoding="utf-8")
        setup.write_text(json.dumps({"setupCycleMs":12.5}),encoding="utf-8")

        module.read_main_pid=lambda _service:123
        module.read_rss_bytes=lambda _pid:104857600
        module.count_provider_errors=lambda _service,_since:2

        metrics=module.collect_capacity_metrics(
            market_state_path=str(market),
            setup_metric_path=str(setup),
            market_service="fake.service",
            since="2026-07-19T00:00:00Z",
        )

        assert metrics["quoteFreshnessP95Seconds"] is not None
        assert metrics["rssBytes"]==104857600
        assert metrics["providerErrorCount"]==2
        assert metrics["setupCycleMs"]==12.5

    return {
        "quoteFreshnessP95Seconds":metrics["quoteFreshnessP95Seconds"],
        "rssBytes":metrics["rssBytes"],
        "providerErrorCount":metrics["providerErrorCount"],
        "setupCycleMs":metrics["setupCycleMs"],
    }
"""

test_target.write_text(test_source,encoding="utf-8")
ast.parse(test_source,filename=str(test_target))

contract_result={}
if not errors:
    spec=importlib.util.spec_from_file_location("capacity_contract_test",test_target)
    tests=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=tests
    spec.loader.exec_module(tests)
    contract_result=tests.run_contract_test(probe_target)

combined=probe_source+(
    discovery_target.read_text(encoding="utf-8")
    if discovery_target.is_file()
    else ""
)

for token in (
    "quoteFreshnessP95Seconds",
    "rssBytes",
    "providerErrorCount",
    "setupCycleMs",
):
    if token not in combined:
        errors.append(f"MISSING_CONTRACT_{token}")

manifest={
    "ok":not errors,
    "classification":(
        "DAY7D_CAPACITY_INSTRUMENTATION_PATCH_V3_VALIDATED"
        if not errors
        else "DAY7D_CAPACITY_INSTRUMENTATION_PATCH_V3_BLOCKED"
    ),
    "packageBuilt":True,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "armAllowed":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "liveProvider":"databento",
    "referenceProvider":"fmp",
    "missingMetricsResolved":[
        "quoteFreshnessP95Seconds",
        "rssBytes",
        "providerErrorCount",
        "setupCycleMs",
    ],
    "implementation":{
        "quoteFreshnessP95Seconds":"read-only market-state snapshot probe",
        "rssBytes":"read-only /proc MainPID probe",
        "providerErrorCount":"read-only systemd journal count since stage baseline",
        "setupCycleMs":"instrumented discovery refresh timing JSON",
    },
    "contractTest":contract_result,
    "errors":errors,
    "nextAction":(
        "RUN_V3_STATIC_AND_ISOLATED_REVIEW"
        if not errors
        else "FIX_V3_PACKAGE"
    ),
}

manifest_target.write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),
    encoding="utf-8",
)

print(json.dumps(manifest,ensure_ascii=False))
'@

[IO.File]::WriteAllText($Builder,$python,[Text.UTF8Encoding]::new($false))

$pythonMode=$null
$pythonExe=$null

try{
  & py -3 --version *> $null
  if($LASTEXITCODE -eq 0){
    $pythonMode="py"
  }
}catch{}

if(-not $pythonMode){
  $systemCandidates=@(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
  )

  foreach($candidate in $systemCandidates){
    if(-not (Test-Path -LiteralPath $candidate)){
      continue
    }

    try{
      & $candidate --version *> $null
      if($LASTEXITCODE -eq 0){
        $pythonMode="exe"
        $pythonExe=$candidate
        break
      }
    }catch{}
  }
}

if(-not $pythonMode){
  $resolved=Get-Command python.exe -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Source -and
      $_.Source -notlike "*\tradermind-ai\services\stock-engine\.venv\*"
    } |
    Select-Object -First 1

  if($resolved){
    try{
      & $resolved.Source --version *> $null
      if($LASTEXITCODE -eq 0){
        $pythonMode="exe"
        $pythonExe=$resolved.Source
      }
    }catch{}
  }
}

if(-not $pythonMode){
  throw "Usable system Python not found. Project .venv is intentionally excluded."
}

Write-Host ""
Write-Host "=== S10.7S CAPACITY INSTRUMENTATION PATCH V3 ===" -ForegroundColor Green
Write-Host "Package-only. No deploy, no restart, no universe change." -ForegroundColor Yellow

if($pythonMode -eq "py"){
  $out=& py -3 $Builder $ProjectRoot $V3
}else{
  $out=& $pythonExe $Builder $ProjectRoot $V3
}
$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $Builder -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7S V3 builder failed before structured result"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $Raw -Encoding UTF8

@(
 "S10.7S CAPACITY INSTRUMENTATION PATCH V3",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "PACKAGE_BUILT=$($r.packageBuilt)",
 "PACKAGE_EXECUTED=$($r.packageExecuted)",
 "MISSING_METRICS_RESOLVED=$(@($r.missingMetricsResolved)-join ',')",
 "CONTRACT_QUOTE_FRESHNESS_P95=$($r.contractTest.quoteFreshnessP95Seconds)",
 "CONTRACT_RSS_BYTES=$($r.contractTest.rssBytes)",
 "CONTRACT_PROVIDER_ERROR_COUNT=$($r.contractTest.providerErrorCount)",
 "CONTRACT_SETUP_CYCLE_MS=$($r.contractTest.setupCycleMs)",
 "ERRORS=$(@($r.errors)-join ',')",
 "ARM_ALLOWED=$($r.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_ROOT=$V3",
 "RAW_JSON=$Raw"
) | Set-Content -LiteralPath $Report -Encoding UTF8

@"
# S10.7S Capacity Instrumentation Patch V3

- OK: $($r.ok)
- Classification: $($r.classification)
- Package built: $($r.packageBuilt)
- Package executed: $($r.packageExecuted)
- Metrics resolved: $(@($r.missingMetricsResolved)-join ', ')
- Contract quote freshness p95: $($r.contractTest.quoteFreshnessP95Seconds)
- Contract RSS bytes: $($r.contractTest.rssBytes)
- Contract provider error count: $($r.contractTest.providerErrorCount)
- Contract setup cycle ms: $($r.contractTest.setupCycleMs)
- Errors: $(@($r.errors)-join ', ')
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $Milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7S COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Package built / executed: $($r.packageBuilt) / $($r.packageExecuted)"
Write-Host "Metrics resolved: $(@($r.missingMetricsResolved)-join ', ')"
Write-Host "Contract freshness/RSS/errors/setup: $($r.contractTest.quoteFreshnessP95Seconds) / $($r.contractTest.rssBytes) / $($r.contractTest.providerErrorCount) / $($r.contractTest.setupCycleMs)"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Package root: $V3"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Milestone: $Milestone"

if(-not $r.ok){
  throw "S10.7S capacity instrumentation V3 blocked"
}
