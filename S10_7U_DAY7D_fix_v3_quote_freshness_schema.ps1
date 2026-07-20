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

$Probe=Join-Path $V3.FullName "patch\ops\scripts\capacity_metrics_probe.py"
$Test=Join-Path $V3.FullName "tests\test_capacity_metrics_contract.py"
$Manifest=Join-Path $V3.FullName "manifest.json"

foreach($path in @($Probe,$Test,$Manifest)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required V3 file missing: $path"
  }
}

$probeText=Get-Content -LiteralPath $Probe -Raw -Encoding UTF8
$testText=Get-Content -LiteralPath $Test -Raw -Encoding UTF8

$ageOld=@'
AGE_KEYS={
    "quoteageseconds",
    "lastquoteageseconds",
    "quote_age_seconds",
    "last_quote_age_seconds",
}
'@

$ageNew=@'
AGE_KEYS={
    "eventageseconds",
    "receiveageseconds",
    "event_age_seconds",
    "receive_age_seconds",
    "quoteageseconds",
    "lastquoteageseconds",
    "quote_age_seconds",
    "last_quote_age_seconds",
}
'@

$timeOld=@'
TIMESTAMP_KEYS={
    "lastquoteat",
    "quotetimestamp",
    "quotets",
    "last_quote_at",
    "quote_timestamp",
    "quote_ts",
}
'@

$timeNew=@'
TIMESTAMP_KEYS={
    "lasteventat",
    "lastreceiveat",
    "last_event_at",
    "last_receive_at",
    "lastquoteat",
    "quotetimestamp",
    "quotets",
    "last_quote_at",
    "quote_timestamp",
    "quote_ts",
}
'@

$testSnapshotOld=@'
    snapshot={
        "symbols":{
            "AAPL":{"quoteAgeSeconds":1.0},
            "MSFT":{"lastQuoteAt":now-3.0},
            "NVDA":{"quote_timestamp":(now-5.0)*1000.0},
        }
    }
'@

$testSnapshotNew=@'
    snapshot={
        "symbols":{
            "AAPL":{"eventAgeSeconds":1.0},
            "MSFT":{"receiveAgeSeconds":3.0},
            "NVDA":{"lastEventAt":now-5.0},
            "TSLA":{"lastReceiveAt":(now-7.0)*1000.0},
        }
    }
'@

$testAssertOld=@'
    assert sorted(round(x,6) for x in ages)==[1.0,3.0,5.0]
    assert module.percentile95(ages)==4.8
'@

$testAssertNew=@'
    assert sorted(round(x,6) for x in ages)==[1.0,3.0,5.0,7.0]
    assert module.percentile95(ages)==6.7
'@

$errors=New-Object System.Collections.Generic.List[string]

if(-not $probeText.Contains($ageOld)){
  $errors.Add("AGE_KEYS_ANCHOR_NOT_FOUND")
}else{
  $probeText=$probeText.Replace($ageOld,$ageNew)
}

if(-not $probeText.Contains($timeOld)){
  $errors.Add("TIMESTAMP_KEYS_ANCHOR_NOT_FOUND")
}else{
  $probeText=$probeText.Replace($timeOld,$timeNew)
}

if(-not $testText.Contains($testSnapshotOld)){
  $errors.Add("TEST_SNAPSHOT_ANCHOR_NOT_FOUND")
}else{
  $testText=$testText.Replace($testSnapshotOld,$testSnapshotNew)
}

if(-not $testText.Contains($testAssertOld)){
  $errors.Add("TEST_ASSERT_ANCHOR_NOT_FOUND")
}else{
  $testText=$testText.Replace($testAssertOld,$testAssertNew)
}

if($errors.Count -gt 0){
  throw "S10.7U anchors blocked: $($errors -join ', ')"
}

[IO.File]::WriteAllText($Probe,$probeText,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($Test,$testText,[Text.UTF8Encoding]::new($false))

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Runner=Join-Path $env:TEMP "s10_7u_contract_$stamp.py"
$Raw=Join-Path $Audit "S10_7U_V3_QUOTE_SCHEMA_FIX_raw_$stamp.json"
$Report=Join-Path $Audit "S10_7U_V3_QUOTE_SCHEMA_FIX_report_$stamp.txt"
$Milestone=Join-Path $Milestones "S10_7U_V3_QUOTE_SCHEMA_FIX_$stamp.md"

$runnerCode=@'
from __future__ import annotations

import ast
import importlib.util
import json
import sys
from pathlib import Path

probe_path=Path(sys.argv[1])
test_path=Path(sys.argv[2])
manifest_path=Path(sys.argv[3])

probe=probe_path.read_text(encoding="utf-8")
test=test_path.read_text(encoding="utf-8")
manifest=json.loads(manifest_path.read_text(encoding="utf-8-sig"))

ast.parse(probe,filename=str(probe_path))
ast.parse(test,filename=str(test_path))

spec=importlib.util.spec_from_file_location("s10_7u_contract",test_path)
tests=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=tests
spec.loader.exec_module(tests)
contract=tests.run_contract_test(probe_path)

required={
    "eventageseconds",
    "receiveageseconds",
    "lasteventat",
    "lastreceiveat",
}

missing=sorted(key for key in required if key not in probe.lower())
errors=[f"MISSING_REAL_SCHEMA_KEY_{key}" for key in missing]

manifest["quoteFreshnessSchema"]={
    "ageKeys":["eventAgeSeconds","receiveAgeSeconds"],
    "timestampKeys":["lastEventAt","lastReceiveAt"],
    "legacyFallbackKeysPreserved":True,
}
manifest["quoteFreshnessContractTest"]=contract
manifest["errors"]=errors
manifest["ok"]=not errors
manifest["classification"]=(
    "DAY7D_CAPACITY_INSTRUMENTATION_V3_QUOTE_SCHEMA_FIXED"
    if not errors
    else "DAY7D_CAPACITY_INSTRUMENTATION_V3_QUOTE_SCHEMA_FIX_BLOCKED"
)
manifest["packageExecuted"]=False
manifest["deploymentAuthorized"]=False
manifest["armAllowed"]=False
manifest["productionMutation"]=False
manifest["serviceRestarted"]=False
manifest["systemdTouched"]=False
manifest["streamSymbolsChanged"]=False
manifest["nextAction"]=(
    "RERUN_V3_STATIC_AND_ISOLATED_REVIEW"
    if not errors
    else "FIX_QUOTE_SCHEMA_PATCH"
)

manifest_path.write_text(
    json.dumps(manifest,ensure_ascii=False,indent=2),
    encoding="utf-8",
)

print(json.dumps({
    "ok":not errors,
    "classification":manifest["classification"],
    "realAgeKeysAdded":["eventAgeSeconds","receiveAgeSeconds"],
    "realTimestampKeysAdded":["lastEventAt","lastReceiveAt"],
    "contractTest":contract,
    "errors":errors,
    "packageExecuted":False,
    "deploymentAuthorized":False,
    "armAllowed":False,
    "productionMutation":False,
    "serviceRestarted":False,
    "systemdTouched":False,
    "streamSymbolsChanged":False,
    "nextAction":manifest["nextAction"],
},ensure_ascii=False))
'@

[IO.File]::WriteAllText($Runner,$runnerCode,[Text.UTF8Encoding]::new($false))

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
    if(-not (Test-Path -LiteralPath $candidate)){continue}
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
Write-Host "=== S10.7U V3 QUOTE SCHEMA FIX ===" -ForegroundColor Green
Write-Host "Local package correction only. No VPS, deploy, restart, or universe change." -ForegroundColor Yellow
Write-Host "Source package: $($V3.FullName)"

if($pythonMode -eq "py"){
  $out=& py -3 $Runner $Probe $Test $Manifest
}else{
  $out=& $pythonExe $Runner $Probe $Test $Manifest
}

$exitCode=$LASTEXITCODE
Remove-Item -LiteralPath $Runner -Force -ErrorAction SilentlyContinue

if($exitCode-ne 0){
  throw "S10.7U contract validation failed before structured result"
}

$text=$out -join "`n"
$r=$text | ConvertFrom-Json
$text | Set-Content -LiteralPath $Raw -Encoding UTF8

@(
 "S10.7U V3 QUOTE SCHEMA FIX",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "REAL_AGE_KEYS=$(@($r.realAgeKeysAdded)-join ',')",
 "REAL_TIMESTAMP_KEYS=$(@($r.realTimestampKeysAdded)-join ',')",
 "CONTRACT_QUOTE_FRESHNESS_P95=$($r.contractTest.quoteFreshnessP95Seconds)",
 "CONTRACT_RSS_BYTES=$($r.contractTest.rssBytes)",
 "CONTRACT_PROVIDER_ERROR_COUNT=$($r.contractTest.providerErrorCount)",
 "CONTRACT_SETUP_CYCLE_MS=$($r.contractTest.setupCycleMs)",
 "ERRORS=$(@($r.errors)-join ',')",
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
# S10.7U V3 Quote Schema Fix

- OK: $($r.ok)
- Classification: $($r.classification)
- Real age keys: $(@($r.realAgeKeysAdded)-join ', ')
- Real timestamp keys: $(@($r.realTimestampKeysAdded)-join ', ')
- Contract freshness p95: $($r.contractTest.quoteFreshnessP95Seconds)
- Contract RSS: $($r.contractTest.rssBytes)
- Contract provider errors: $($r.contractTest.providerErrorCount)
- Contract setup cycle: $($r.contractTest.setupCycleMs)
- Errors: $(@($r.errors)-join ', ')
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
Write-Host "=== S10.7U COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Real age keys: $(@($r.realAgeKeysAdded)-join ', ')"
Write-Host "Real timestamp keys: $(@($r.realTimestampKeysAdded)-join ', ')"
Write-Host "Contract freshness/RSS/errors/setup: $($r.contractTest.quoteFreshnessP95Seconds) / $($r.contractTest.rssBytes) / $($r.contractTest.providerErrorCount) / $($r.contractTest.setupCycleMs)"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Package executed: $($r.packageExecuted)"
Write-Host "Arm allowed: $($r.armAllowed)"
Write-Host "Deployment authorized: $($r.deploymentAuthorized)"
Write-Host "Next action: $($r.nextAction)"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Milestone: $Milestone"

if(-not $r.ok){
  throw "S10.7U quote schema fix blocked"
}
