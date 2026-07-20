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

$Package=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_7V_guarded_v2_canary_with_v3_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $Package){
  throw "Latest S10.7V package not found"
}

$Manifest=Join-Path $Package.FullName "manifest.json"
$Plan=Join-Path $Package.FullName "config\canary_plan.json"
$Universe=Join-Path $Package.FullName "config\validated_liquid_250_universe.json"
$Readme=Join-Path $Package.FullName "docs\README.md"
$V3Manifest=Join-Path $Package.FullName "patch\capacity_instrumentation_v3\manifest.json"

foreach($path in @($Manifest,$Plan,$Universe,$Readme,$V3Manifest)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required final package file missing: $path"
  }
}

$manifestPayload=Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$planPayload=Get-Content -LiteralPath $Plan -Raw -Encoding UTF8 | ConvertFrom-Json
$universePayload=Get-Content -LiteralPath $Universe -Raw -Encoding UTF8 | ConvertFrom-Json
$v3Payload=Get-Content -LiteralPath $V3Manifest -Raw -Encoding UTF8 | ConvertFrom-Json

$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

$requiredMetrics=@(
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
  "setupCycleMs"
)

$expectedStages=@(
  [pscustomobject]@{stage=25;durationMinutes=5;purpose="baseline"},
  [pscustomobject]@{stage=50;durationMinutes=5;purpose="micro-canary"},
  [pscustomobject]@{stage=100;durationMinutes=5;purpose="micro-canary"},
  [pscustomobject]@{stage=150;durationMinutes=10;purpose="intermediate-canary"},
  [pscustomobject]@{stage=250;durationMinutes=30;purpose="final-capacity-canary"}
)

if($manifestPayload.ok -ne $true){$errors.Add("MANIFEST_NOT_OK")}
if($manifestPayload.classification -ne "DAY7D_GUARDED_V2_CANARY_WITH_V3_PACKAGE_BUILT_NOT_ARMED"){
  $errors.Add("MANIFEST_CLASSIFICATION_UNEXPECTED")
}

if($manifestPayload.packageBuilt -ne $true){$errors.Add("PACKAGE_BUILT_NOT_TRUE")}
if($manifestPayload.packageExecuted -ne $false){$errors.Add("PACKAGE_EXECUTED_NOT_FALSE")}
if($manifestPayload.deploymentAuthorized -ne $false){$errors.Add("DEPLOYMENT_AUTHORIZED_NOT_FALSE")}
if($manifestPayload.armAllowed -ne $false){$errors.Add("ARM_ALLOWED_NOT_FALSE")}
if($manifestPayload.productionMutation -ne $false){$errors.Add("PRODUCTION_MUTATION_NOT_FALSE")}
if($manifestPayload.serviceRestarted -ne $false){$errors.Add("SERVICE_RESTARTED_NOT_FALSE")}
if($manifestPayload.systemdTouched -ne $false){$errors.Add("SYSTEMD_TOUCHED_NOT_FALSE")}
if($manifestPayload.streamSymbolsChanged -ne $false){$errors.Add("STREAM_SYMBOLS_CHANGED_NOT_FALSE")}

if($manifestPayload.clientEligibilityChanged -ne $false){$errors.Add("CLIENT_ELIGIBILITY_CHANGED")}
if($manifestPayload.telegramEligibilityChanged -ne $false){$errors.Add("TELEGRAM_ELIGIBILITY_CHANGED")}
if($manifestPayload.paperEligibilityChanged -ne $false){$errors.Add("PAPER_ELIGIBILITY_CHANGED")}
if($manifestPayload.brokerEnabled -ne $false){$errors.Add("BROKER_ENABLED")}
if($manifestPayload.realMoneyEnabled -ne $false){$errors.Add("REAL_MONEY_ENABLED")}

if($manifestPayload.explicitExecutionApprovalRequired -ne $true){
  $errors.Add("EXPLICIT_EXECUTION_APPROVAL_NOT_REQUIRED")
}

if($manifestPayload.baselineStageDeltasRequired -ne $true){
  $errors.Add("BASELINE_STAGE_DELTAS_NOT_REQUIRED")
}

if($manifestPayload.universeCount -ne 250){$errors.Add("MANIFEST_UNIVERSE_COUNT_NOT_250")}
if($manifestPayload.universeUniqueCount -ne 250){$errors.Add("MANIFEST_UNIVERSE_UNIQUE_NOT_250")}

$finalUniverse=@($universePayload.finalUniverse)
if($finalUniverse.Count -ne 250){$errors.Add("UNIVERSE_FILE_COUNT_NOT_250")}
if((@($finalUniverse|Select-Object -Unique)).Count -ne 250){
  $errors.Add("UNIVERSE_FILE_UNIQUE_NOT_250")
}

$resolved=@($manifestPayload.resolvedMetrics)
$missing=@($requiredMetrics|Where-Object {$resolved -notcontains $_})
foreach($metric in $missing){
  $errors.Add("MISSING_REQUIRED_METRIC_$metric")
}

if(@($manifestPayload.missingMetrics).Count -ne 0){
  $errors.Add("MANIFEST_MISSING_METRICS_NOT_EMPTY")
}

$planStages=@($planPayload.stages)
if($planStages.Count -ne $expectedStages.Count){
  $errors.Add("STAGE_COUNT_UNEXPECTED")
}else{
  for($i=0;$i -lt $expectedStages.Count;$i++){
    $actual=$planStages[$i]
    $expected=$expectedStages[$i]

    if([int]$actual.stage -ne [int]$expected.stage){
      $errors.Add("STAGE_ORDER_MISMATCH_INDEX_$i")
    }

    if([int]$actual.durationMinutes -ne [int]$expected.durationMinutes){
      $errors.Add("STAGE_DURATION_MISMATCH_$($expected.stage)")
    }

    if([string]$actual.purpose -ne [string]$expected.purpose){
      $errors.Add("STAGE_PURPOSE_MISMATCH_$($expected.stage)")
    }

    if($actual.rollbackOnFailure -ne $true){
      $errors.Add("ROLLBACK_NOT_REQUIRED_STAGE_$($expected.stage)")
    }
  }
}

if($planStages[0].requiresExplicitApproval -ne $false){
  $errors.Add("BASELINE_STAGE_SHOULD_NOT_REQUIRE_EXTRA_APPROVAL")
}

foreach($stage in @($planStages|Where-Object {$_.stage -gt 25})){
  if($stage.requiresExplicitApproval -ne $true){
    $errors.Add("CANARY_STAGE_APPROVAL_NOT_REQUIRED_$($stage.stage)")
  }
}

$rollback=$planPayload.rollbackRules

if($rollback.serviceUnhealthy -ne $true){$errors.Add("ROLLBACK_SERVICE_HEALTH_DISABLED")}
if($rollback.negativeQuoteAge -ne $true){$errors.Add("ROLLBACK_NEGATIVE_QUOTE_AGE_DISABLED")}
if($rollback.providerReconnectBurst -ne $true){$errors.Add("ROLLBACK_RECONNECT_BURST_DISABLED")}
if($rollback.providerErrorIncrease -ne $true){$errors.Add("ROLLBACK_PROVIDER_ERROR_DISABLED")}
if([int]$rollback.cpuPercentCeiling -ne 85){$errors.Add("CPU_CEILING_UNEXPECTED")}
if([int]$rollback.candleCompletenessFloorPercent -ne 99){$errors.Add("CANDLE_COMPLETENESS_FLOOR_UNEXPECTED")}
if([int]$rollback.returnToUniverseSize -ne 25){$errors.Add("ROLLBACK_TARGET_NOT_CORE25")}

if($planPayload.noManualPaperRun -ne $true){$errors.Add("MANUAL_PAPER_RUN_NOT_BLOCKED")}
if($planPayload.noPaperServiceStart -ne $true){$errors.Add("PAPER_SERVICE_START_NOT_BLOCKED")}
if($planPayload.noBoundaryReset -ne $true){$errors.Add("PAPER_BOUNDARY_RESET_NOT_BLOCKED")}

if($planPayload.executionAuthorized -ne $false){$errors.Add("PLAN_EXECUTION_AUTHORIZED")}
if($planPayload.armAllowed -ne $false){$errors.Add("PLAN_ARM_ALLOWED")}
if($planPayload.packageExecuted -ne $false){$errors.Add("PLAN_PACKAGE_EXECUTED")}
if($planPayload.productionUniverseMustRemain -ne 25){
  $errors.Add("PLAN_PRODUCTION_UNIVERSE_NOT_CORE25")
}

if($v3Payload.ok -ne $true){$errors.Add("V3_MANIFEST_NOT_OK")}
if($v3Payload.packageExecuted -ne $false){$errors.Add("V3_PACKAGE_EXECUTED")}
if($v3Payload.deploymentAuthorized -ne $false){$errors.Add("V3_DEPLOYMENT_AUTHORIZED")}
if($v3Payload.armAllowed -ne $false){$errors.Add("V3_ARM_ALLOWED")}

$packageText=Get-ChildItem -LiteralPath $Package.FullName -File -Recurse |
  Where-Object {$_.Extension -in @(".ps1",".sh",".service",".timer",".py",".json",".md",".txt")} |
  ForEach-Object {
    try{
      Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
    }catch{
      ""
    }
  }

$combined=($packageText -join "`n").ToLowerInvariant()

$forbidden=@(
  [pscustomobject]@{token=("systemctl "+"restart");error="FORBIDDEN_SYSTEMCTL_RESTART"},
  [pscustomobject]@{token=("systemctl "+"daemon-reload");error="FORBIDDEN_DAEMON_RELOAD"},
  [pscustomobject]@{token=("systemctl "+"enable");error="FORBIDDEN_SYSTEMCTL_ENABLE"},
  [pscustomobject]@{token="deploymentauthorized`": true";error="FORBIDDEN_DEPLOY_TRUE"},
  [pscustomobject]@{token="armallowed`": true";error="FORBIDDEN_ARM_TRUE"},
  [pscustomobject]@{token="clienteligible`": true";error="FORBIDDEN_CLIENT_TRUE"},
  [pscustomobject]@{token="telegrameligible`": true";error="FORBIDDEN_TELEGRAM_TRUE"},
  [pscustomobject]@{token="papereligible`": true";error="FORBIDDEN_PAPER_TRUE"}
)

foreach($rule in $forbidden){
  if($combined.Contains($rule.token)){
    $errors.Add($rule.error)
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Raw=Join-Path $Audit "S10_7W_FINAL_CANARY_PACKAGE_REVIEW_raw_$stamp.json"
$Report=Join-Path $Audit "S10_7W_FINAL_CANARY_PACKAGE_REVIEW_report_$stamp.txt"
$Milestone=Join-Path $Milestones "S10_7W_FINAL_CANARY_PACKAGE_REVIEW_$stamp.md"

$ok=($errors.Count -eq 0)
$classification=if($ok){
  "DAY7D_FINAL_CANARY_PACKAGE_STATIC_REVIEW_PASSED"
}else{
  "DAY7D_FINAL_CANARY_PACKAGE_STATIC_REVIEW_BLOCKED"
}

$result=[ordered]@{
  ok=$ok
  classification=$classification
  inspectionOnly=$true
  packageExecuted=$false
  deploymentAuthorized=$false
  armAllowed=$false
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  sourcePackage=$Package.FullName
  universeCount=$finalUniverse.Count
  universeUniqueCount=(@($finalUniverse|Select-Object -Unique)).Count
  requiredMetrics=$requiredMetrics
  resolvedMetrics=$resolved
  missingMetrics=$missing
  stages=$planStages
  rollbackRules=$rollback
  explicitExecutionApprovalRequired=$true
  clientEligibilityChanged=$false
  telegramEligibilityChanged=$false
  paperEligibilityChanged=$false
  brokerEnabled=$false
  realMoneyEnabled=$false
  errors=@($errors|Select-Object -Unique)
  warnings=@($warnings|Select-Object -Unique)
  nextAction=if($ok){
    "REQUEST_EXPLICIT_CANARY_EXECUTION_APPROVAL"
  }else{
    "FIX_FINAL_PACKAGE_REVIEW_ERRORS"
  }
}

$result|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $Raw -Encoding UTF8

@(
 "S10.7W FINAL CANARY PACKAGE STATIC REVIEW",
 "Generated=$stamp",
 "OK=$($result.ok)",
 "CLASSIFICATION=$($result.classification)",
 "SOURCE_PACKAGE=$($result.sourcePackage)",
 "UNIVERSE_COUNT=$($result.universeCount)",
 "UNIVERSE_UNIQUE_COUNT=$($result.universeUniqueCount)",
 "MISSING_METRICS=$($result.missingMetrics -join ',')",
 "ERRORS=$($result.errors -join ',')",
 "WARNINGS=$($result.warnings -join ',')",
 "EXPLICIT_EXECUTION_APPROVAL_REQUIRED=$($result.explicitExecutionApprovalRequired)",
 "PACKAGE_EXECUTED=False",
 "ARM_ALLOWED=False",
 "DEPLOYMENT_AUTHORIZED=False",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "NEXT_ACTION=$($result.nextAction)",
 "RAW_JSON=$Raw"
)|Set-Content -LiteralPath $Report -Encoding UTF8

@"
# S10.7W Final Canary Package Static Review

- OK: $($result.ok)
- Classification: $($result.classification)
- Universe: $($result.universeCount) / $($result.universeUniqueCount)
- Missing metrics: $($result.missingMetrics -join ', ')
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Explicit execution approval required: True
- Package executed: False
- Arm allowed: False
- Deployment authorized: False
- Next action: $($result.nextAction)

No VPS connection.
No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@|Set-Content -LiteralPath $Milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7W FINAL CANARY PACKAGE REVIEW ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Universe / unique: $($result.universeCount) / $($result.universeUniqueCount)"
Write-Host "Missing metrics: $($result.missingMetrics -join ', ')"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Explicit execution approval required: $($result.explicitExecutionApprovalRequired)"
Write-Host "Package executed: $($result.packageExecuted)"
Write-Host "Arm allowed: $($result.armAllowed)"
Write-Host "Deployment authorized: $($result.deploymentAuthorized)"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Milestone: $Milestone"

if(-not $result.ok){
  throw "S10.7W final canary package review blocked"
}
