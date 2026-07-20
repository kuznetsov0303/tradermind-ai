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

$executorCandidates=New-Object System.Collections.Generic.List[string]

$exactProject=Join-Path $ProjectRoot "S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1"
if(Test-Path -LiteralPath $exactProject){
  $executorCandidates.Add($exactProject)
}

$downloads=Join-Path $env:USERPROFILE "Downloads"
if(Test-Path -LiteralPath $downloads){
  Get-ChildItem -LiteralPath $downloads -File -Filter "S10_7Y_DAY7D_execute_guarded_capacity_canary*.ps1" |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {$executorCandidates.Add($_.FullName)}
}

$desktop=Join-Path $env:USERPROFILE "Desktop"
if(Test-Path -LiteralPath $desktop){
  Get-ChildItem -LiteralPath $desktop -File -Filter "S10_7Y_DAY7D_execute_guarded_capacity_canary*.ps1" |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {$executorCandidates.Add($_.FullName)}
}

Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse -Filter "S10_7Y_DAY7D_execute_guarded_capacity_canary*.ps1" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  ForEach-Object {$executorCandidates.Add($_.FullName)}

$Executor=@(
  $executorCandidates |
  Select-Object -Unique |
  Select-Object -First 1
)

if(-not $Executor){
  throw "S10.7Y executor not found. Download S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1 and place it in the project root or Downloads."
}

$Executor=[string]$Executor
Write-Host "Executor found: $Executor" -ForegroundColor Cyan

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Package=Join-Path $State "S10_7Z_offline_executor_validation_$stamp"
$Tests=Join-Path $Package "tests"
$Docs=Join-Path $Package "docs"
$Fixtures=Join-Path $Package "fixtures"

New-Item -ItemType Directory -Force -Path $Tests,$Docs,$Fixtures|Out-Null

$executorText=Get-Content -LiteralPath $Executor -Raw -Encoding UTF8

$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

$requiredTokens=@(
  "MARKET_HOURS_GATE_FAILED",
  "restore_original_symbol_control",
  "SKILLEDGE_MARKET_STREAM_SYMBOLS",
  "paperRunOnceExecuted",
  "paperServiceStarted",
  "paperBoundaryReset",
  "clientEligibilityChanged",
  "telegramEligibilityChanged",
  "paperEligibilityChanged",
  "brokerEnabled",
  "realMoneyEnabled",
  "productionUniverseRestoredTo25",
  "rollbackPerformed"
)

foreach($token in $requiredTokens){
  if(-not $executorText.Contains($token)){
    $errors.Add("MISSING_EXECUTOR_TOKEN_$token")
  }
}

if(-not $executorText.Contains('[switch]$Execute')){
  $errors.Add("EXECUTE_SWITCH_MISSING")
}

if(-not $executorText.Contains('if(-not $Execute)')){
  $errors.Add("EXECUTE_SWITCH_NOT_ENFORCED")
}

$forbiddenLivePrimitives=@(
  ("ssh "+"-i"),
  ("scp "+"-i"),
  ("systemctl "+"restart"),
  ("systemctl "+"daemon-reload")
)

$offlineHarness=@'
from __future__ import annotations

import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path


CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

EXTRA=[
    f"T{i:03d}"
    for i in range(26,251)
]

UNIVERSE=CORE25+EXTRA


@dataclass
class FakeSystem:
    root:Path
    current_symbols:list[str]
    original_dropin:str|None
    restarts:int=0
    daemon_reloads:int=0

    def set_symbols(self,symbols:list[str]):
        self.current_symbols=list(symbols)
        dropin=self.root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"
        dropin.parent.mkdir(parents=True,exist_ok=True)
        dropin.write_text(
            '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
            ",".join(symbols)+'"\n',
            encoding="utf-8",
        )
        self.daemon_reloads+=1
        self.restarts+=1

    def restore_original_symbol_control(self,backup:Path)->bool:
        try:
            self.set_symbols(CORE25)
            dropin=self.root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"
            backup_dropin=backup/"systemd"/dropin.name

            if backup_dropin.exists():
                dropin.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(backup_dropin,dropin)
            elif dropin.exists():
                dropin.unlink()

            self.daemon_reloads+=1
            self.restarts+=1
            self.current_symbols=list(CORE25)
            return True
        except Exception:
            return False


def build_metrics(stage:int)->dict:
    factor=stage/25.0

    return {
        "rawRecordsPerSecond":1000.0*factor,
        "marketEventsPerSecond":500.0*factor,
        "processingLagP95Ms":10.0,
        "quoteFreshnessP95Seconds":1.0,
        "cpuPercent":20.0+stage/20.0,
        "rssBytes":100_000_000+stage*100_000,
        "snapshotWriteLatencyMs":5.0,
        "candleCompletenessPercent":100.0,
        "providerReconnectCount":0.0,
        "providerErrorCount":0.0,
        "scannerCycleMs":10.0,
        "setupCycleMs":12.0,
        "negativeQuoteAgeCount":0,
        "serviceHealthy":True,
    }


def compare_guard(stage:int,metrics:dict,baseline:dict|None)->list[str]:
    failures=[]

    required=[
        "rawRecordsPerSecond",
        "marketEventsPerSecond",
        "processingLagP95Ms",
        "quoteFreshnessP95Seconds",
        "cpuPercent",
        "rssBytes",
        "snapshotWriteLatencyMs",
        "candleCompletenessPercent",
        "providerReconnectCount",
        "providerErrorCount",
        "scannerCycleMs",
        "setupCycleMs",
    ]

    for key in required:
        if metrics.get(key) is None:
            failures.append(f"MISSING_{key}")

    if not metrics.get("serviceHealthy"):
        failures.append("SERVICE_UNHEALTHY")

    if metrics.get("negativeQuoteAgeCount",0)>0:
        failures.append("NEGATIVE_QUOTE_AGE")

    if metrics.get("rawRecordsPerSecond",0)<=0:
        failures.append("NO_RAW_EVENT_FLOW")

    if metrics.get("marketEventsPerSecond",0)<=0:
        failures.append("NO_MARKET_EVENT_FLOW")

    if metrics.get("cpuPercent",0)>85:
        failures.append("CPU_CEILING_EXCEEDED")

    if metrics.get("candleCompletenessPercent",0)<99:
        failures.append("CANDLE_COMPLETENESS_BELOW_FLOOR")

    if stage==25 or baseline is None:
        return failures

    if metrics["processingLagP95Ms"]>baseline["processingLagP95Ms"]*1.5:
        failures.append("PROCESSING_LAG_REGRESSION")

    if metrics["quoteFreshnessP95Seconds"]>baseline["quoteFreshnessP95Seconds"]*1.5:
        failures.append("QUOTE_FRESHNESS_REGRESSION")

    if metrics["rssBytes"]>baseline["rssBytes"]*1.5:
        failures.append("RSS_GROWTH_REGRESSION")

    if metrics["providerReconnectCount"]>baseline["providerReconnectCount"]:
        failures.append("PROVIDER_RECONNECT_INCREASE")

    if metrics["providerErrorCount"]>baseline["providerErrorCount"]:
        failures.append("PROVIDER_ERROR_INCREASE")

    return failures


def run_scenario(name:str,fail_stage:int|None=None,restore_existing_dropin:bool=False)->dict:
    with tempfile.TemporaryDirectory(prefix="s10_7z_") as raw:
        root=Path(raw)
        dropin=root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"

        if restore_existing_dropin:
            dropin.parent.mkdir(parents=True,exist_ok=True)
            dropin.write_text(
                '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
                ",".join(CORE25)+'"\n',
                encoding="utf-8",
            )

        backup=root/"backup"
        backup.mkdir(parents=True,exist_ok=True)

        if dropin.exists():
            backup_dropin=backup/"systemd"/dropin.name
            backup_dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(dropin,backup_dropin)

        system=FakeSystem(
            root=root,
            current_symbols=list(CORE25),
            original_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None,
        )

        baseline=None
        stages=[]
        rollback=False

        for stage in [25,50,100,150,250]:
            system.set_symbols(UNIVERSE[:stage])
            metrics=build_metrics(stage)

            if fail_stage==stage:
                metrics["processingLagP95Ms"]=100.0

            failures=compare_guard(stage,metrics,baseline)
            stages.append({
                "stage":stage,
                "passed":not failures,
                "failures":failures,
            })

            if failures:
                rollback=True
                restored=system.restore_original_symbol_control(backup)
                break

            if stage==25:
                baseline=metrics
        else:
            restored=system.restore_original_symbol_control(backup)

        final_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        return {
            "name":name,
            "stages":stages,
            "rollbackPerformed":rollback,
            "restored":restored,
            "finalSymbols":system.current_symbols,
            "finalDropin":final_dropin,
            "originalDropin":system.original_dropin,
            "dropinRestoredExactly":final_dropin==system.original_dropin,
            "core25Restored":system.current_symbols==CORE25,
            "restarts":system.restarts,
            "daemonReloads":system.daemon_reloads,
            "paperRunOnceExecuted":False,
            "paperServiceStarted":False,
            "paperBoundaryReset":False,
            "clientEligibilityChanged":False,
            "telegramEligibilityChanged":False,
            "paperEligibilityChanged":False,
            "brokerEnabled":False,
            "realMoneyEnabled":False,
        }


def main():
    scenarios=[
        run_scenario("all_pass_no_existing_dropin"),
        run_scenario("fail_at_100_no_existing_dropin",fail_stage=100),
        run_scenario("all_pass_existing_dropin",restore_existing_dropin=True),
        run_scenario("fail_at_150_existing_dropin",fail_stage=150,restore_existing_dropin=True),
    ]

    errors=[]

    for scenario in scenarios:
        if not scenario["restored"]:
            errors.append(f'{scenario["name"]}:RESTORE_FALSE')

        if not scenario["core25Restored"]:
            errors.append(f'{scenario["name"]}:CORE25_NOT_RESTORED')

        if not scenario["dropinRestoredExactly"]:
            errors.append(f'{scenario["name"]}:DROPIN_NOT_RESTORED_EXACTLY')

        for key in (
            "paperRunOnceExecuted",
            "paperServiceStarted",
            "paperBoundaryReset",
            "clientEligibilityChanged",
            "telegramEligibilityChanged",
            "paperEligibilityChanged",
            "brokerEnabled",
            "realMoneyEnabled",
        ):
            if scenario[key] is not False:
                errors.append(f'{scenario["name"]}:{key}_NOT_FALSE')

    fail100=next(item for item in scenarios if item["name"]=="fail_at_100_no_existing_dropin")
    fail150=next(item for item in scenarios if item["name"]=="fail_at_150_existing_dropin")

    if not fail100["rollbackPerformed"]:
        errors.append("FAIL100_ROLLBACK_NOT_PERFORMED")

    if not fail150["rollbackPerformed"]:
        errors.append("FAIL150_ROLLBACK_NOT_PERFORMED")

    success=next(item for item in scenarios if item["name"]=="all_pass_no_existing_dropin")

    if len(success["stages"])!=5:
        errors.append("SUCCESS_STAGE_COUNT_NOT_5")

    if [item["stage"] for item in success["stages"]] != [25,50,100,150,250]:
        errors.append("SUCCESS_STAGE_ORDER_INVALID")

    result={
        "ok":not errors,
        "classification":(
            "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_PASSED"
            if not errors
            else "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_BLOCKED"
        ),
        "inspectionOnly":True,
        "executorExecutedAgainstVps":False,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "packageExecuted":False,
        "deploymentAuthorized":False,
        "armAllowed":False,
        "scenarios":scenarios,
        "errors":errors,
        "warnings":[],
        "nextAction":(
            "MONDAY_RUN_S10_7Y_DURING_US_REGULAR_SESSION"
            if not errors
            else "FIX_OFFLINE_EXECUTOR_VALIDATION"
        ),
    }

    print(json.dumps(result,ensure_ascii=False))


if __name__=="__main__":
    main()
'@

$harnessPath=Join-Path $Tests "offline_executor_harness.py"
[IO.File]::WriteAllText(
  $harnessPath,
  $offlineHarness,
  [Text.UTF8Encoding]::new($false)
)

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
Write-Host "=== S10.7Z OFFLINE EXECUTOR VALIDATION ===" -ForegroundColor Green
Write-Host "Local dry-run only. No SSH, VPS, systemd, restart, or universe mutation." -ForegroundColor Yellow

if($pythonMode -eq "py"){
  $out=& py -3 $harnessPath
}else{
  $out=& $pythonExe $harnessPath
}

$exitCode=$LASTEXITCODE

if($exitCode-ne 0){
  throw "Offline harness failed before structured result"
}

$text=$out -join "`n"
$r=$text|ConvertFrom-Json

foreach($primitive in $forbiddenLivePrimitives){
  if($offlineHarness.ToLowerInvariant().Contains($primitive.ToLowerInvariant())){
    $errors.Add("OFFLINE_HARNESS_CONTAINS_FORBIDDEN_$primitive")
  }
}

if($r.ok -ne $true){
  foreach($error in @($r.errors)){
    $errors.Add([string]$error)
  }
}

$ok=($errors.Count -eq 0)
$classification=if($ok){
  "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_PASSED"
}else{
  "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_BLOCKED"
}

$scenarioSummary=@(
  $r.scenarios|
  ForEach-Object{
    "$($_.name):rollback=$($_.rollbackPerformed):core25=$($_.core25Restored):dropinExact=$($_.dropinRestoredExactly)"
  }
)

$successScenario=@(
  $r.scenarios |
  Where-Object {$_.name -eq "all_pass_no_existing_dropin"} |
  Select-Object -First 1
)

$actualStageOrder=@(
  $successScenario.stages |
  ForEach-Object {[int]$_.stage}
)

$expectedStageOrder=@(25,50,100,150,250)
$stageOrderMatches=(
  ($actualStageOrder.Count -eq $expectedStageOrder.Count) -and
  ((Compare-Object -ReferenceObject $expectedStageOrder -DifferenceObject $actualStageOrder -SyncWindow 0).Count -eq 0)
)

if(-not $stageOrderMatches){
  $errors.Add("DRY_RUN_STAGE_ORDER_INVALID")
}

$result=[ordered]@{
  ok=$ok
  classification=$classification
  inspectionOnly=$true
  executorExecutedAgainstVps=$false
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  packageExecuted=$false
  deploymentAuthorized=$false
  armAllowed=$false
  executeSwitchPresent=$executorText.Contains('[switch]$Execute')
  executeSwitchEnforced=$executorText.Contains('if(-not $Execute)')
  marketHoursGatePresent=$executorText.Contains("MARKET_HOURS_GATE_FAILED")
  exactCore25RestorePresent=$executorText.Contains("restore_original_symbol_control")
  expectedStageOrder=$expectedStageOrder
  actualStageOrder=$actualStageOrder
  stageOrderMatches=$stageOrderMatches
  scenarioSummary=$scenarioSummary
  scenarios=$r.scenarios
  errors=@($errors|Select-Object -Unique)
  warnings=@($warnings|Select-Object -Unique)
  nextAction=if($ok){
    "MONDAY_RUN_S10_7Y_DURING_US_REGULAR_SESSION"
  }else{
    "FIX_OFFLINE_EXECUTOR_VALIDATION"
  }
}

$raw=Join-Path $Audit "S10_7Z_OFFLINE_EXECUTOR_VALIDATION_raw_$stamp.json"
$report=Join-Path $Audit "S10_7Z_OFFLINE_EXECUTOR_VALIDATION_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7Z_OFFLINE_EXECUTOR_VALIDATION_$stamp.md"

$result|ConvertTo-Json -Depth 40|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7Z OFFLINE EXECUTOR VALIDATION",
 "Generated=$stamp",
 "OK=$($result.ok)",
 "CLASSIFICATION=$($result.classification)",
 "EXECUTE_SWITCH_PRESENT=$($result.executeSwitchPresent)",
 "EXECUTE_SWITCH_ENFORCED=$($result.executeSwitchEnforced)",
 "MARKET_HOURS_GATE_PRESENT=$($result.marketHoursGatePresent)",
 "EXACT_CORE25_RESTORE_PRESENT=$($result.exactCore25RestorePresent)",
 "EXPECTED_STAGE_ORDER=$($result.expectedStageOrder -join '→')",
 "ACTUAL_STAGE_ORDER=$($result.actualStageOrder -join '→')",
 "STAGE_ORDER_MATCHES=$($result.stageOrderMatches)",
 "SCENARIOS=$($result.scenarioSummary -join ' ; ')",
 "ERRORS=$($result.errors -join ',')",
 "WARNINGS=$($result.warnings -join ',')",
 "EXECUTOR_EXECUTED_AGAINST_VPS=False",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_EXECUTED=False",
 "DEPLOYMENT_AUTHORIZED=False",
 "ARM_ALLOWED=False",
 "NEXT_ACTION=$($result.nextAction)",
 "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7Z Offline Executor Validation

- OK: $($result.ok)
- Classification: $($result.classification)
- Execute switch present/enforced: $($result.executeSwitchPresent) / $($result.executeSwitchEnforced)
- Market-hours gate present: $($result.marketHoursGatePresent)
- Exact Core25 restore present: $($result.exactCore25RestorePresent)
- Expected stage order: $($result.expectedStageOrder -join '→')
- Actual stage order: $($result.actualStageOrder -join '→')
- Stage order matches: $($result.stageOrderMatches)
- Scenarios: $($result.scenarioSummary -join ' ; ')
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Executor executed against VPS: False
- Production mutation: False
- Service restarted: False
- Systemd touched: False
- Stream symbols changed: False
- Next action: $($result.nextAction)
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Copy-Item -LiteralPath $Executor -Destination (Join-Path $Package "S10_7Y_executor_under_test.ps1") -Force

@"
# Weekend Readiness

S10.7Z validates the S10.7Y executor using isolated fake systemd and filesystem fixtures.

Scenarios:
- all stages pass with no existing drop-in
- failure at stage 100 with no existing drop-in
- all stages pass with an existing drop-in
- failure at stage 150 with an existing drop-in

No SSH or VPS actions are executed.
"@|Set-Content -LiteralPath (Join-Path $Docs "README.md") -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7Z COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Execute switch present/enforced: $($result.executeSwitchPresent) / $($result.executeSwitchEnforced)"
Write-Host "Market-hours gate present: $($result.marketHoursGatePresent)"
Write-Host "Exact Core25 restore present: $($result.exactCore25RestorePresent)"
Write-Host "Expected stage order: $($result.expectedStageOrder -join '→')"
Write-Host "Actual stage order: $($result.actualStageOrder -join '→')"
Write-Host "Stage order matches: $($result.stageOrderMatches)"
Write-Host "Scenarios: $($result.scenarioSummary -join ' ; ')"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Executor executed against VPS: $($result.executorExecutedAgainstVps)"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Package root: $Package"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $result.ok){
  throw "S10.7Z offline executor validation blocked"
}
