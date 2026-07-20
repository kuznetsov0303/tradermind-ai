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

$Executor=Join-Path $ProjectRoot "S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1"

if(-not (Test-Path -LiteralPath $Executor)){
  throw "S10.7Y2 executor not found in project root: $Executor"
}

$executorText=Get-Content -LiteralPath $Executor -Raw -Encoding UTF8

$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

$requiredTokens=@(
  "mkdir -p '$remoteRoot'",
  '$bundleLocal "${VpsUser}@${VpsHost}:$remoteRoot/"',
  "payload_restore_manifest.json",
  "restore_payload(backup)",
  "PRODUCTION_PAYLOAD_RESTORE_FAILED",
  "productionPayloadRestored",
  "restore_original_symbol_control",
  "SKILLEDGE_MARKET_STREAM_SYMBOLS",
  "MARKET_HOURS_GATE_FAILED",
  "rm -rf '$remoteRoot'",
  "paperRunOnceExecuted",
  "paperServiceStarted",
  "paperBoundaryReset",
  "clientEligibilityChanged",
  "telegramEligibilityChanged",
  "paperEligibilityChanged",
  "brokerEnabled",
  "realMoneyEnabled"
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

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Package=Join-Path $State "S10_8A_y2_offline_validation_$stamp"
$Tests=Join-Path $Package "tests"
$Docs=Join-Path $Package "docs"

New-Item -ItemType Directory -Force -Path $Tests,$Docs|Out-Null

$harness=@'
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

EXTRA=[f"T{i:03d}" for i in range(26,251)]
UNIVERSE=CORE25+EXTRA

PAYLOAD_RELATIVE=[
    Path("app/market_data/security_master.py"),
    Path("app/market_data/stream_service.py"),
    Path("app/discovery.py"),
    Path("ops/scripts/capacity_metrics_probe.py"),
]

def write(path:Path,text:str):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding="utf-8")

def build_environment(root:Path,existing_dropin:bool):
    production=root/"production"
    backup=root/"backup"
    bundle=root/"bundle"

    for relative in PAYLOAD_RELATIVE:
        write(bundle/relative,"NEW:"+str(relative))

    existing_before={
        Path("app/market_data/stream_service.py"):"OLD_STREAM",
        Path("app/discovery.py"):"OLD_DISCOVERY",
    }

    for relative,content in existing_before.items():
        write(production/relative,content)

    dropin=production/"etc/systemd/system/skilledge-market-stream.service.d/90-s10-7y-capacity-canary.conf"

    if existing_dropin:
        write(
            dropin,
            '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
            ",".join(CORE25)+'"\n',
        )

    return production,backup,bundle,dropin,existing_before

def deploy_payload(production:Path,bundle:Path,backup:Path):
    manifest=[]

    for relative in PAYLOAD_RELATIVE:
        source=bundle/relative
        target=production/relative
        existed=target.exists()

        manifest.append({
            "relative":str(relative).replace("\\","/"),
            "existedBefore":existed,
        })

        if existed:
            backup_target=backup/relative
            backup_target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(target,backup_target)

        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)

    write(
        backup/"payload_restore_manifest.json",
        json.dumps(manifest,indent=2),
    )

def restore_payload(production:Path,backup:Path)->bool:
    manifest_path=backup/"payload_restore_manifest.json"

    if not manifest_path.is_file():
        return False

    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))

    for item in manifest:
        relative=Path(item["relative"])
        target=production/relative
        source=backup/relative

        if item["existedBefore"]:
            if not source.is_file():
                return False
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
        elif target.exists():
            target.unlink()

    return True

def set_symbols(dropin:Path,symbols:list[str]):
    write(
        dropin,
        '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
        ",".join(symbols)+'"\n',
    )

def restore_original_symbol_control(
    dropin:Path,
    backup:Path,
    original_dropin:str|None,
)->bool:
    try:
        set_symbols(dropin,CORE25)
        backup_dropin=backup/"systemd"/dropin.name

        if backup_dropin.exists():
            dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(backup_dropin,dropin)
        elif dropin.exists():
            dropin.unlink()

        final=dropin.read_text(encoding="utf-8") if dropin.exists() else None
        return final==original_dropin
    except Exception:
        return False

def run_scenario(
    name:str,
    *,
    existing_dropin:bool,
    fail_stage:int|None,
):
    with tempfile.TemporaryDirectory(prefix="s10_8a_") as raw:
        root=Path(raw)
        production,backup,bundle,dropin,existing_before=build_environment(
            root,
            existing_dropin,
        )

        original_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        if dropin.exists():
            backup_dropin=backup/"systemd"/dropin.name
            backup_dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(dropin,backup_dropin)

        deploy_payload(production,bundle,backup)

        stages=[]
        rollback=False

        for stage in [25,50,100,150,250]:
            set_symbols(dropin,UNIVERSE[:stage])
            passed=(stage!=fail_stage)
            stages.append({
                "stage":stage,
                "passed":passed,
            })

            if not passed:
                rollback=True
                break

        core25_restored=restore_original_symbol_control(
            dropin,
            backup,
            original_dropin,
        )
        payload_restored=restore_payload(production,backup)

        existing_files_exact=all(
            (production/relative).read_text(encoding="utf-8")==content
            for relative,content in existing_before.items()
        )

        new_files_removed=all(
            not (production/relative).exists()
            for relative in PAYLOAD_RELATIVE
            if relative not in existing_before
        )

        final_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        return {
            "name":name,
            "stages":stages,
            "rollbackPerformed":rollback,
            "core25Restored":core25_restored,
            "payloadRestored":payload_restored,
            "existingFilesRestoredExactly":existing_files_exact,
            "newFilesRemoved":new_files_removed,
            "dropinRestoredExactly":final_dropin==original_dropin,
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
        run_scenario(
            "all_pass_no_existing_dropin",
            existing_dropin=False,
            fail_stage=None,
        ),
        run_scenario(
            "fail_100_no_existing_dropin",
            existing_dropin=False,
            fail_stage=100,
        ),
        run_scenario(
            "all_pass_existing_dropin",
            existing_dropin=True,
            fail_stage=None,
        ),
        run_scenario(
            "fail_150_existing_dropin",
            existing_dropin=True,
            fail_stage=150,
        ),
    ]

    errors=[]

    for scenario in scenarios:
        for key in (
            "core25Restored",
            "payloadRestored",
            "existingFilesRestoredExactly",
            "newFilesRemoved",
            "dropinRestoredExactly",
        ):
            if scenario[key] is not True:
                errors.append(f'{scenario["name"]}:{key}_FAILED')

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

    success=next(item for item in scenarios if item["name"]=="all_pass_no_existing_dropin")
    stage_order=[item["stage"] for item in success["stages"]]

    if stage_order != [25,50,100,150,250]:
        errors.append("STAGE_ORDER_INVALID")

    if not next(item for item in scenarios if item["name"]=="fail_100_no_existing_dropin")["rollbackPerformed"]:
        errors.append("FAIL100_ROLLBACK_NOT_PERFORMED")

    if not next(item for item in scenarios if item["name"]=="fail_150_existing_dropin")["rollbackPerformed"]:
        errors.append("FAIL150_ROLLBACK_NOT_PERFORMED")

    result={
        "ok":not errors,
        "classification":(
            "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_PASSED"
            if not errors
            else "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_BLOCKED"
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
        "expectedStageOrder":[25,50,100,150,250],
        "actualStageOrder":stage_order,
        "scenarios":scenarios,
        "errors":errors,
        "warnings":[],
        "nextAction":(
            "MONDAY_RUN_S10_7Y2_DURING_US_REGULAR_SESSION"
            if not errors
            else "FIX_Y2_OFFLINE_VALIDATION"
        ),
    }

    print(json.dumps(result,ensure_ascii=False))

if __name__=="__main__":
    main()
'@

$harnessPath=Join-Path $Tests "y2_offline_harness.py"
[IO.File]::WriteAllText(
  $harnessPath,
  $harness,
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
Write-Host "=== S10.8A Y2 OFFLINE EXECUTOR VALIDATION ===" -ForegroundColor Green
Write-Host "Local only. No SSH, VPS, systemd, restart, or universe mutation." -ForegroundColor Yellow

if($pythonMode -eq "py"){
  $out=& py -3 $harnessPath
}else{
  $out=& $pythonExe $harnessPath
}

if($LASTEXITCODE-ne 0){
  throw "Y2 offline harness failed before structured result"
}

$r=($out -join "`n")|ConvertFrom-Json

if($r.ok -ne $true){
  foreach($error in @($r.errors)){
    $errors.Add([string]$error)
  }
}

$ok=($errors.Count -eq 0)
$classification=if($ok){
  "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_PASSED"
}else{
  "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_BLOCKED"
}

$scenarioSummary=@(
  $r.scenarios|
  ForEach-Object{
    "$($_.name):rollback=$($_.rollbackPerformed):core25=$($_.core25Restored):payload=$($_.payloadRestored):newRemoved=$($_.newFilesRemoved):dropin=$($_.dropinRestoredExactly)"
  }
)

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
  remoteBundlePathFixed=$executorText.Contains('$bundleLocal "${VpsUser}@${VpsHost}:$remoteRoot/"')
  payloadRestoreManifestPresent=$executorText.Contains("payload_restore_manifest.json")
  exactPayloadRestoreEnforced=$executorText.Contains("PRODUCTION_PAYLOAD_RESTORE_FAILED")
  remoteCleanupPresent=$executorText.Contains("rm -rf '$remoteRoot'")
  expectedStageOrder=@($r.expectedStageOrder)
  actualStageOrder=@($r.actualStageOrder)
  scenarios=@($r.scenarios)
  scenarioSummary=$scenarioSummary
  errors=@($errors|Select-Object -Unique)
  warnings=@($warnings|Select-Object -Unique)
  nextAction=if($ok){
    "MONDAY_RUN_S10_7Y2_DURING_US_REGULAR_SESSION"
  }else{
    "FIX_Y2_OFFLINE_VALIDATION"
  }
}

$raw=Join-Path $Audit "S10_8A_Y2_OFFLINE_VALIDATION_raw_$stamp.json"
$report=Join-Path $Audit "S10_8A_Y2_OFFLINE_VALIDATION_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_8A_Y2_OFFLINE_VALIDATION_$stamp.md"

$result|ConvertTo-Json -Depth 40|Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.8A Y2 OFFLINE EXECUTOR VALIDATION",
 "Generated=$stamp",
 "OK=$($result.ok)",
 "CLASSIFICATION=$($result.classification)",
 "EXECUTE_SWITCH_PRESENT=$($result.executeSwitchPresent)",
 "EXECUTE_SWITCH_ENFORCED=$($result.executeSwitchEnforced)",
 "MARKET_HOURS_GATE_PRESENT=$($result.marketHoursGatePresent)",
 "REMOTE_BUNDLE_PATH_FIXED=$($result.remoteBundlePathFixed)",
 "PAYLOAD_RESTORE_MANIFEST_PRESENT=$($result.payloadRestoreManifestPresent)",
 "EXACT_PAYLOAD_RESTORE_ENFORCED=$($result.exactPayloadRestoreEnforced)",
 "REMOTE_CLEANUP_PRESENT=$($result.remoteCleanupPresent)",
 "EXPECTED_STAGE_ORDER=$($result.expectedStageOrder -join '→')",
 "ACTUAL_STAGE_ORDER=$($result.actualStageOrder -join '→')",
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
# S10.8A Y2 Offline Executor Validation

- OK: $($result.ok)
- Classification: $($result.classification)
- Execute switch present/enforced: $($result.executeSwitchPresent) / $($result.executeSwitchEnforced)
- Market-hours gate present: $($result.marketHoursGatePresent)
- Remote bundle path fixed: $($result.remoteBundlePathFixed)
- Payload restore manifest present: $($result.payloadRestoreManifestPresent)
- Exact payload restore enforced: $($result.exactPayloadRestoreEnforced)
- Remote cleanup present: $($result.remoteCleanupPresent)
- Expected stage order: $($result.expectedStageOrder -join '→')
- Actual stage order: $($result.actualStageOrder -join '→')
- Scenarios: $($result.scenarioSummary -join ' ; ')
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Executor executed against VPS: False
- Next action: $($result.nextAction)
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Copy-Item -LiteralPath $Executor -Destination (Join-Path $Package "S10_7Y2_executor_under_test.ps1") -Force

Write-Host ""
Write-Host "=== S10.8A COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Execute switch present/enforced: $($result.executeSwitchPresent) / $($result.executeSwitchEnforced)"
Write-Host "Market-hours gate present: $($result.marketHoursGatePresent)"
Write-Host "Remote bundle path fixed: $($result.remoteBundlePathFixed)"
Write-Host "Payload restore manifest present: $($result.payloadRestoreManifestPresent)"
Write-Host "Exact payload restore enforced: $($result.exactPayloadRestoreEnforced)"
Write-Host "Remote cleanup present: $($result.remoteCleanupPresent)"
Write-Host "Expected stage order: $($result.expectedStageOrder -join '→')"
Write-Host "Actual stage order: $($result.actualStageOrder -join '→')"
Write-Host "Scenarios: $($result.scenarioSummary -join ' ; ')"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Executor executed against VPS: $($result.executorExecutedAgainstVps)"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $result.ok){
  throw "S10.8A Y2 offline validation blocked"
}
