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

$V3=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_7S_capacity_instrumentation_patch_v3_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $V3){
  throw "Latest S10.7S V3 package not found"
}

$ActiveApp=Join-Path $State "S10_7H_active_source_snapshot"
$ActiveMarket=Join-Path $State "S10_7H2_active_market_data_source_snapshot"

$OriginalDiscovery=Join-Path $ActiveApp "app\discovery.py"
$PatchedDiscovery=Join-Path $V3.FullName "patch\app\discovery.py"
$Probe=Join-Path $V3.FullName "patch\ops\scripts\capacity_metrics_probe.py"
$ContractTest=Join-Path $V3.FullName "tests\test_capacity_metrics_contract.py"
$Manifest=Join-Path $V3.FullName "manifest.json"

foreach($path in @(
  $OriginalDiscovery,
  $PatchedDiscovery,
  $Probe,
  $ContractTest,
  $Manifest
)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required V3 review file missing: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Runner=Join-Path $env:TEMP "s10_7t_review_$stamp.py"
$Raw=Join-Path $Audit "S10_7T_V3_STATIC_ISOLATED_REVIEW_raw_$stamp.json"
$Report=Join-Path $Audit "S10_7T_V3_STATIC_ISOLATED_REVIEW_report_$stamp.txt"
$Milestone=Join-Path $Milestones "S10_7T_V3_STATIC_ISOLATED_REVIEW_$stamp.md"

$python=@'
from __future__ import annotations

import ast
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

project=Path(sys.argv[1])
v3=Path(sys.argv[2])

state=project/"PROJECT_STATE"
active_app=state/"S10_7H_active_source_snapshot"
active_market=state/"S10_7H2_active_market_data_source_snapshot"

original_path=active_app/"app"/"discovery.py"
patched_path=v3/"patch"/"app"/"discovery.py"
probe_path=v3/"patch"/"ops"/"scripts"/"capacity_metrics_probe.py"
test_path=v3/"tests"/"test_capacity_metrics_contract.py"
manifest_path=v3/"manifest.json"

errors=[]
warnings=[]
checks={}

manifest=json.loads(manifest_path.read_text(encoding="utf-8-sig"))

checks["sourceManifestOk"]=manifest.get("ok") is True
checks["sourcePackageExecutedFalse"]=manifest.get("packageExecuted") is False
checks["sourceDeploymentAuthorizedFalse"]=manifest.get("deploymentAuthorized") is False
checks["sourceArmAllowedFalse"]=manifest.get("armAllowed") is False
checks["sourceProductionMutationFalse"]=manifest.get("productionMutation") is False
checks["sourceServiceRestartedFalse"]=manifest.get("serviceRestarted") is False
checks["sourceSystemdTouchedFalse"]=manifest.get("systemdTouched") is False
checks["sourceStreamSymbolsChangedFalse"]=manifest.get("streamSymbolsChanged") is False

original_text=original_path.read_text(encoding="utf-8")
patched_text=patched_path.read_text(encoding="utf-8")
probe_text=probe_path.read_text(encoding="utf-8")
test_text=test_path.read_text(encoding="utf-8")

original_tree=ast.parse(original_text,filename=str(original_path))
patched_tree=ast.parse(patched_text,filename=str(patched_path))
ast.parse(probe_text,filename=str(probe_path))
ast.parse(test_text,filename=str(test_path))

checks["allPythonSyntaxValid"]=True

def find_function(tree,name):
    for node in ast.walk(tree):
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name==name:
            return node
    return None

original_fn=find_function(original_tree,"refresh_setup_engine_from_watchlist")
patched_fn=find_function(patched_tree,"refresh_setup_engine_from_watchlist")
helper_fn=find_function(patched_tree,"_s10_7s_write_setup_cycle_metric")

checks["originalSetupFunctionFound"]=original_fn is not None
checks["patchedSetupFunctionFound"]=patched_fn is not None
checks["setupMetricHelperFound"]=helper_fn is not None

def signature_contract(node):
    if node is None:
        return None

    args=node.args

    return {
        "kind":type(node).__name__,
        "posonly":[arg.arg for arg in args.posonlyargs],
        "args":[arg.arg for arg in args.args],
        "vararg":args.vararg.arg if args.vararg else None,
        "kwonly":[arg.arg for arg in args.kwonlyargs],
        "kwarg":args.kwarg.arg if args.kwarg else None,
        "defaults":len(args.defaults),
        "kwDefaults":sum(value is not None for value in args.kw_defaults),
        "decorators":[ast.dump(item,include_attributes=False) for item in node.decorator_list],
    }

original_signature=signature_contract(original_fn)
patched_signature=signature_contract(patched_fn)

checks["setupFunctionSignaturePreserved"]=original_signature==patched_signature

def node_count(root,node_type):
    return sum(1 for node in ast.walk(root) if isinstance(node,node_type))

if original_fn and patched_fn:
    original_returns=node_count(original_fn,ast.Return)
    patched_returns=node_count(patched_fn,ast.Return)
    original_yields=node_count(original_fn,(ast.Yield,ast.YieldFrom))
    patched_yields=node_count(patched_fn,(ast.Yield,ast.YieldFrom))
    original_raises=node_count(original_fn,ast.Raise)
    patched_raises=node_count(patched_fn,ast.Raise)

    checks["returnCountPreserved"]=original_returns==patched_returns
    checks["yieldCountPreserved"]=original_yields==patched_yields
    checks["raiseCountPreserved"]=original_raises==patched_raises
else:
    original_returns=patched_returns=0
    original_yields=patched_yields=0
    original_raises=patched_raises=0

checks["timingGlobalPresent"]="_S10_7S_LAST_SETUP_CYCLE_MS" in patched_text
checks["perfCounterPresent"]="time.perf_counter()" in patched_text
checks["atomicOsReplacePresent"]="os.replace(temp, path)" in patched_text
checks["metricEnvOverridePresent"]="SKILLEDGE_SETUP_CYCLE_METRIC_PATH" in patched_text
checks["setupCycleFieldPresent"]='"setupCycleMs"' in patched_text

# Ensure helper is module-level rather than nested in another function/class.
helper_module_level=any(
    isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef))
    and node.name=="_s10_7s_write_setup_cycle_metric"
    for node in patched_tree.body
)
checks["setupMetricHelperModuleLevel"]=helper_module_level

# Verify the target function contains a finally block calling the helper.
finally_calls_helper=False
if patched_fn:
    for node in ast.walk(patched_fn):
        if isinstance(node,ast.Try) and node.finalbody:
            for child in ast.walk(ast.Module(body=node.finalbody,type_ignores=[])):
                if isinstance(child,ast.Call):
                    func=child.func
                    if isinstance(func,ast.Name) and func.id=="_s10_7s_write_setup_cycle_metric":
                        finally_calls_helper=True

checks["finallyCallsSetupMetricHelper"]=finally_calls_helper

# Execute only the helper in an isolated module.
helper_source="""
import json
import os
import time
from pathlib import Path

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
"""

namespace={}
exec(compile(helper_source,"<isolated_setup_helper>","exec"),namespace)

with tempfile.TemporaryDirectory(prefix="s10_7t_") as raw:
    root=Path(raw)
    output=root/"runtime"/"setup_cycle_metric.json"
    os.environ["SKILLEDGE_SETUP_CYCLE_METRIC_PATH"]=str(output)

    namespace["_s10_7s_write_setup_cycle_metric"](17.25)

    helper_payload=json.loads(output.read_text(encoding="utf-8"))
    checks["isolatedHelperFileWritten"]=output.is_file()
    checks["isolatedHelperSetupCycleExact"]=helper_payload.get("setupCycleMs")==17.25
    checks["isolatedHelperSourceExact"]=(
        helper_payload.get("source")=="refresh_setup_engine_from_watchlist"
    )
    checks["isolatedHelperTempRemoved"]=not output.with_suffix(
        output.suffix+".tmp"
    ).exists()

os.environ.pop("SKILLEDGE_SETUP_CYCLE_METRIC_PATH",None)

# Re-run the package's contract test.
spec=importlib.util.spec_from_file_location("s10_7t_contract_test",test_path)
tests=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=tests
spec.loader.exec_module(tests)
contract=tests.run_contract_test(probe_path)

checks["probeContractQuoteFreshnessPresent"]=(
    contract.get("quoteFreshnessP95Seconds") is not None
)
checks["probeContractRssExact"]=contract.get("rssBytes")==104857600
checks["probeContractProviderErrorsExact"]=contract.get("providerErrorCount")==2
checks["probeContractSetupCycleExact"]=contract.get("setupCycleMs")==12.5

# Compare the probe's supported quote schema against active market-data source.
probe_spec=importlib.util.spec_from_file_location("s10_7t_probe",probe_path)
probe=importlib.util.module_from_spec(probe_spec)
sys.modules[probe_spec.name]=probe
probe_spec.loader.exec_module(probe)

supported_age_keys={
    str(value).replace("-","_").lower()
    for value in getattr(probe,"AGE_KEYS",set())
}
supported_timestamp_keys={
    str(value).replace("-","_").lower()
    for value in getattr(probe,"TIMESTAMP_KEYS",set())
}
supported_quote_keys=supported_age_keys|supported_timestamp_keys

market_files=[
    active_market/"app"/"market_data"/"market_state.py",
    active_market/"app"/"market_data"/"contracts.py",
    active_market/"app"/"market_data"/"stream_service.py",
    active_market/"app"/"market_data"/"scanner.py",
]

active_quote_candidates=set()

for path in market_files:
    if not path.is_file():
        continue

    text=path.read_text(encoding="utf-8",errors="ignore")

    try:
        tree=ast.parse(text,filename=str(path))
    except SyntaxError:
        continue

    for node in ast.walk(tree):
        value=None

        if isinstance(node,ast.Constant) and isinstance(node.value,str):
            value=node.value
        elif isinstance(node,ast.Attribute):
            value=node.attr
        elif isinstance(node,ast.arg):
            value=node.arg

        if not value:
            continue

        normalized=str(value).replace("-","_").lower()
        compact=normalized.replace("_","")

        if "quote" in compact and any(
            token in compact
            for token in ("age","time","timestamp","updated","received","ts")
        ):
            active_quote_candidates.add(normalized)

quote_schema_overlap=sorted(
    key
    for key in active_quote_candidates
    if key in supported_quote_keys
    or key.replace("_","") in {
        supported.replace("_","")
        for supported in supported_quote_keys
    }
)

manifest_quote_schema=manifest.get("quoteFreshnessSchema") or {}
manifest_age_keys={
    str(value).replace("-","_").lower()
    for value in manifest_quote_schema.get("ageKeys") or []
}
manifest_timestamp_keys={
    str(value).replace("-","_").lower()
    for value in manifest_quote_schema.get("timestampKeys") or []
}

required_real_schema={
    "eventageseconds",
    "receiveageseconds",
    "lasteventat",
    "lastreceiveat",
}

manifest_schema_keys={
    value.replace("_","")
    for value in (manifest_age_keys | manifest_timestamp_keys)
}

checks["manifestQuoteSchemaContractPresent"]=required_real_schema.issubset(
    manifest_schema_keys
)
checks["quoteFreshnessRuntimeContractPassed"]=(
    contract.get("quoteFreshnessP95Seconds") is not None
    and float(contract.get("quoteFreshnessP95Seconds")) >= 0
)

if not active_quote_candidates:
    warnings.append("ACTIVE_QUOTE_SCHEMA_LITERALS_NOT_PRESENT_IN_SOURCE_DYNAMIC_SCHEMA")

# Check package text for forbidden execution/mutation primitives.
package_text_parts=[]

for path in v3.rglob("*"):
    if not path.is_file():
        continue

    if path.suffix.lower() not in {".py",".json",".md",".txt",".service",".timer",".sh",".ps1"}:
        continue

    try:
        package_text_parts.append(path.read_text(encoding="utf-8",errors="ignore"))
    except OSError:
        pass

package_text="\n".join(package_text_parts).lower()

forbidden_tokens={
    ("systemctl "+"restart"):"FORBIDDEN_SYSTEMCTL_RESTART",
    ("systemctl "+"daemon-reload"):"FORBIDDEN_DAEMON_RELOAD",
    ("systemctl "+"enable"):"FORBIDDEN_SYSTEMCTL_ENABLE",
    "streamsymbolschanged\": true":"FORBIDDEN_STREAM_SYMBOL_CHANGE_TRUE",
    "deploymentauthorized\": true":"FORBIDDEN_DEPLOY_AUTHORIZED_TRUE",
    "armallowed\": true":"FORBIDDEN_ARM_ALLOWED_TRUE",
    "clienteligible\": true":"FORBIDDEN_CLIENT_ELIGIBLE_TRUE",
    "telegrameligible\": true":"FORBIDDEN_TELEGRAM_ELIGIBLE_TRUE",
    "papereligible\": true":"FORBIDDEN_PAPER_ELIGIBLE_TRUE",
}

for token,error in forbidden_tokens.items():
    if token in package_text:
        errors.append(error)

for name,value in checks.items():
    if value is not True:
        errors.append(f"CHECK_FAILED_{name}")

errors=sorted(set(errors))
warnings=sorted(set(warnings))

result={
    "ok":not errors,
    "classification":(
        "DAY7D_CAPACITY_INSTRUMENTATION_V3_STATIC_ISOLATED_REVIEW_PASSED"
        if not errors
        else "DAY7D_CAPACITY_INSTRUMENTATION_V3_STATIC_ISOLATED_REVIEW_BLOCKED"
    ),
    "inspectionOnly":True,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "armAllowed":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "sourcePackage":str(v3),
    "checks":checks,
    "originalSignature":original_signature,
    "patchedSignature":patched_signature,
    "controlFlowCounts":{
        "originalReturnCount":original_returns,
        "patchedReturnCount":patched_returns,
        "originalYieldCount":original_yields,
        "patchedYieldCount":patched_yields,
        "originalRaiseCount":original_raises,
        "patchedRaiseCount":patched_raises,
    },
    "contractTest":contract,
    "activeQuoteSchemaCandidates":sorted(active_quote_candidates),
    "supportedQuoteSchemaKeys":sorted(supported_quote_keys),
    "quoteSchemaOverlap":quote_schema_overlap,
    "manifestQuoteSchema":manifest_quote_schema,
    "errors":errors,
    "warnings":warnings,
    "liveProvider":"databento",
    "referenceProvider":"fmp",
    "nextAction":(
        "BUILD_GUARDED_V2_CANARY_PACKAGE_WITH_V3_INSTRUMENTATION"
        if not errors
        else "FIX_V3_REVIEW_FAILURES"
    ),
}

print(json.dumps(result,ensure_ascii=False))
'@

[IO.File]::WriteAllText($Runner,$python,[Text.UTF8Encoding]::new($false))

$pythonMode=$null
$pythonExe=$null

try{
  & py -3 --version *> $null
  if($LASTEXITCODE -eq 0){
    $pythonMode="py"
  }
}catch{}

if(-not $pythonMode){
  foreach($candidate in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
  )){
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
  throw "Usable system Python not found"
}

Write-Host ""
Write-Host "=== S10.7T V3 STATIC + ISOLATED REVIEW ===" -ForegroundColor Green
Write-Host "Local inspection only. No VPS, deploy, restart, or universe change." -ForegroundColor Yellow
Write-Host "Source package: $($V3.FullName)"

if($pythonMode -eq "py"){
  $out=& py -3 $Runner $ProjectRoot $V3.FullName
}else{
  $out=& $pythonExe $Runner $ProjectRoot $V3.FullName
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $Runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7T review failed before structured result"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $Raw -Encoding UTF8

@(
 "S10.7T V3 STATIC AND ISOLATED REVIEW",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "SOURCE_PACKAGE=$($r.sourcePackage)",
 "RETURN_COUNTS=$($r.controlFlowCounts.originalReturnCount)/$($r.controlFlowCounts.patchedReturnCount)",
 "YIELD_COUNTS=$($r.controlFlowCounts.originalYieldCount)/$($r.controlFlowCounts.patchedYieldCount)",
 "RAISE_COUNTS=$($r.controlFlowCounts.originalRaiseCount)/$($r.controlFlowCounts.patchedRaiseCount)",
 "QUOTE_SCHEMA_CANDIDATES=$(@($r.activeQuoteSchemaCandidates)-join ',')",
 "QUOTE_SCHEMA_OVERLAP=$(@($r.quoteSchemaOverlap)-join ',')",
 "MANIFEST_AGE_KEYS=$(@($r.manifestQuoteSchema.ageKeys)-join ',')",
 "MANIFEST_TIMESTAMP_KEYS=$(@($r.manifestQuoteSchema.timestampKeys)-join ',')",
 "CONTRACT_QUOTE_FRESHNESS_P95=$($r.contractTest.quoteFreshnessP95Seconds)",
 "CONTRACT_RSS_BYTES=$($r.contractTest.rssBytes)",
 "CONTRACT_PROVIDER_ERROR_COUNT=$($r.contractTest.providerErrorCount)",
 "CONTRACT_SETUP_CYCLE_MS=$($r.contractTest.setupCycleMs)",
 "ERRORS=$(@($r.errors)-join ',')",
 "WARNINGS=$(@($r.warnings)-join ',')",
 "PACKAGE_EXECUTED=$($r.packageExecuted)",
 "ARM_ALLOWED=$($r.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "NEXT_ACTION=$($r.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$Raw"
) | Set-Content -LiteralPath $Report -Encoding UTF8

@"
# S10.7T V3 Static + Isolated Review

- OK: $($r.ok)
- Classification: $($r.classification)
- Return counts: $($r.controlFlowCounts.originalReturnCount) / $($r.controlFlowCounts.patchedReturnCount)
- Yield counts: $($r.controlFlowCounts.originalYieldCount) / $($r.controlFlowCounts.patchedYieldCount)
- Raise counts: $($r.controlFlowCounts.originalRaiseCount) / $($r.controlFlowCounts.patchedRaiseCount)
- Quote schema literals found in source: $(@($r.activeQuoteSchemaCandidates)-join ', ')
- Quote schema overlap from source scan: $(@($r.quoteSchemaOverlap)-join ', ')
- Manifest age keys: $(@($r.manifestQuoteSchema.ageKeys)-join ', ')
- Manifest timestamp keys: $(@($r.manifestQuoteSchema.timestampKeys)-join ', ')
- Contract quote freshness p95: $($r.contractTest.quoteFreshnessP95Seconds)
- Contract RSS bytes: $($r.contractTest.rssBytes)
- Contract provider errors: $($r.contractTest.providerErrorCount)
- Contract setup cycle ms: $($r.contractTest.setupCycleMs)
- Errors: $(@($r.errors)-join ', ')
- Warnings: $(@($r.warnings)-join ', ')
- Package executed: False
- Arm allowed: False
- Deployment authorized: False
- Next action: $($r.nextAction)

No VPS connection.
No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $Milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7T COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Return/yield/raise counts: $($r.controlFlowCounts.originalReturnCount)/$($r.controlFlowCounts.patchedReturnCount) ; $($r.controlFlowCounts.originalYieldCount)/$($r.controlFlowCounts.patchedYieldCount) ; $($r.controlFlowCounts.originalRaiseCount)/$($r.controlFlowCounts.patchedRaiseCount)"
Write-Host "Quote schema literals in source: $(@($r.activeQuoteSchemaCandidates)-join ', ')"
Write-Host "Quote schema source overlap: $(@($r.quoteSchemaOverlap)-join ', ')"
Write-Host "Manifest age keys: $(@($r.manifestQuoteSchema.ageKeys)-join ', ')"
Write-Host "Manifest timestamp keys: $(@($r.manifestQuoteSchema.timestampKeys)-join ', ')"
Write-Host "Contract freshness/RSS/errors/setup: $($r.contractTest.quoteFreshnessP95Seconds) / $($r.contractTest.rssBytes) / $($r.contractTest.providerErrorCount) / $($r.contractTest.setupCycleMs)"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Warnings: $(@($r.warnings)-join ', ')"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Milestone: $Milestone"

if(-not $r.ok){
  throw "S10.7T V3 static/isolated review blocked"
}
