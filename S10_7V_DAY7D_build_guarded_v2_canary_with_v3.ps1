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

$Universe=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7P_VALIDATED_LIQUID_250_UNIVERSE_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$StaticReview=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7Q_STATIC_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$V3Review=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7T_V3_STATIC_ISOLATED_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$V3=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_7S_capacity_instrumentation_patch_v3_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $Universe){throw "Latest validated liquid 250 universe not found"}
if(-not $StaticReview){throw "Latest S10.7Q static review not found"}
if(-not $V3Review){throw "Latest S10.7T V3 review not found"}
if(-not $V3){throw "Latest V3 instrumentation package not found"}

$universePayload=Get-Content -LiteralPath $Universe.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$staticPayload=Get-Content -LiteralPath $StaticReview.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$v3ReviewPayload=Get-Content -LiteralPath $V3Review.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$v3Manifest=Get-Content -LiteralPath (Join-Path $V3.FullName "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$final=@($universePayload.finalUniverse)

$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

if($staticPayload.ok -ne $true){$errors.Add("LIQUID_250_STATIC_REVIEW_NOT_OK")}
if($staticPayload.classification -ne "DAY7D_LIQUID_250_STATIC_REVIEW_PASSED"){
  $errors.Add("LIQUID_250_STATIC_REVIEW_CLASSIFICATION_UNEXPECTED")
}

if($v3ReviewPayload.ok -ne $true){$errors.Add("V3_REVIEW_NOT_OK")}
if($v3ReviewPayload.classification -ne "DAY7D_CAPACITY_INSTRUMENTATION_V3_STATIC_ISOLATED_REVIEW_PASSED"){
  $errors.Add("V3_REVIEW_CLASSIFICATION_UNEXPECTED")
}

if($v3Manifest.ok -ne $true){$errors.Add("V3_MANIFEST_NOT_OK")}

if($final.Count -ne 250){$errors.Add("UNIVERSE_COUNT_NOT_250")}
if((@($final|Select-Object -Unique)).Count -ne 250){$errors.Add("UNIVERSE_UNIQUE_COUNT_NOT_250")}

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

$resolvedFromV2=@(
  "rawRecordsPerSecond",
  "marketEventsPerSecond",
  "processingLagP95Ms",
  "cpuPercent",
  "snapshotWriteLatencyMs",
  "candleCompletenessPercent",
  "providerReconnectCount",
  "scannerCycleMs"
)

$resolvedFromV3=@($v3Manifest.missingMetricsResolved)

$resolved=@(
  $resolvedFromV2 + $resolvedFromV3 |
  Select-Object -Unique
)

$missing=@(
  $requiredMetrics |
  Where-Object {$resolved -notcontains $_}
)

foreach($metric in $missing){
  $errors.Add("MISSING_METRIC_$metric")
}

$stages=@(
  [ordered]@{
    stage=25
    durationMinutes=5
    purpose="baseline"
    requiresExplicitApproval=$false
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=50
    durationMinutes=5
    purpose="micro-canary"
    requiresExplicitApproval=$true
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=100
    durationMinutes=5
    purpose="micro-canary"
    requiresExplicitApproval=$true
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=150
    durationMinutes=10
    purpose="intermediate-canary"
    requiresExplicitApproval=$true
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=250
    durationMinutes=30
    purpose="final-capacity-canary"
    requiresExplicitApproval=$true
    rollbackOnFailure=$true
  }
)

$rollbackRules=[ordered]@{
  serviceUnhealthy=$true
  negativeQuoteAge=$true
  providerReconnectBurst=$true
  providerErrorIncrease=$true
  processingLagP95RegressionPercent=50
  quoteFreshnessP95RegressionPercent=50
  cpuPercentCeiling=85
  rssGrowthPercentCeiling=50
  snapshotWriteRegressionPercent=100
  candleCompletenessFloorPercent=99
  scannerCycleRegressionPercent=100
  setupCycleRegressionPercent=100
  returnToUniverseSize=25
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Package=Join-Path $State "S10_7V_guarded_v2_canary_with_v3_$stamp"
$Config=Join-Path $Package "config"
$Patch=Join-Path $Package "patch"
$Docs=Join-Path $Package "docs"

New-Item -ItemType Directory -Force -Path $Config,$Patch,$Docs|Out-Null

Copy-Item -LiteralPath $Universe.FullName -Destination (Join-Path $Config "validated_liquid_250_universe.json") -Force
Copy-Item -LiteralPath $V3.FullName -Destination (Join-Path $Patch "capacity_instrumentation_v3") -Recurse -Force

$canaryPlan=[ordered]@{
  executionAuthorized=$false
  armAllowed=$false
  packageExecuted=$false
  productionUniverseMustRemain=25
  explicitExecutionApprovalRequired=$true
  liveProvider="databento"
  referenceProvider="fmp"
  requiredMetrics=$requiredMetrics
  stages=$stages
  rollbackRules=$rollbackRules
  baselineStageDeltasRequired=$true
  noManualPaperRun=$true
  noPaperServiceStart=$true
  noBoundaryReset=$true
  clientEligibilityChanged=$false
  telegramEligibilityChanged=$false
  paperEligibilityChanged=$false
}

$canaryPlan |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath (Join-Path $Config "canary_plan.json") -Encoding UTF8

$ok=($errors.Count -eq 0)

$classification=if($ok){
  "DAY7D_GUARDED_V2_CANARY_WITH_V3_PACKAGE_BUILT_NOT_ARMED"
}else{
  "DAY7D_GUARDED_V2_CANARY_WITH_V3_PACKAGE_BLOCKED"
}

$manifest=[ordered]@{
  ok=$ok
  classification=$classification
  packageBuilt=$true
  packageExecuted=$false
  deploymentAuthorized=$false
  armAllowed=$false
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  universeSource=$Universe.FullName
  universeCount=$final.Count
  universeUniqueCount=(@($final|Select-Object -Unique)).Count
  staticReviewSource=$StaticReview.FullName
  v3ReviewSource=$V3Review.FullName
  v3PackageSource=$V3.FullName
  requiredMetrics=$requiredMetrics
  resolvedMetrics=$resolved
  missingMetrics=$missing
  stages=$stages
  rollbackRules=$rollbackRules
  baselineStageDeltasRequired=$true
  explicitExecutionApprovalRequired=$true
  liveProvider="databento"
  referenceProvider="fmp"
  clientEligibilityChanged=$false
  telegramEligibilityChanged=$false
  paperEligibilityChanged=$false
  brokerEnabled=$false
  realMoneyEnabled=$false
  errors=@($errors)
  warnings=@($warnings)
  nextAction=if($ok){
    "RUN_FINAL_PACKAGE_STATIC_REVIEW_THEN_REQUEST_EXPLICIT_CANARY_EXECUTION_APPROVAL"
  }else{
    "FIX_FINAL_PACKAGE_ERRORS"
  }
}

$manifest |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath (Join-Path $Package "manifest.json") -Encoding UTF8

@"
# S10.7V Guarded V2 Canary With V3

This package is built but not armed.

## Universe

- Symbols: $($manifest.universeCount)
- Unique symbols: $($manifest.universeUniqueCount)
- Production must remain Core25 until explicit execution approval.

## Metrics

$(@($requiredMetrics | ForEach-Object {"- $_"}) -join "`r`n")

## Stages

- 25 baseline: 5 minutes
- 50 micro-canary: 5 minutes
- 100 micro-canary: 5 minutes
- 150 intermediate: 10 minutes
- 250 final capacity: 30 minutes

## Hard rules

- No manual paper run-once
- No paper service start
- No paper boundary reset
- No client/Telegram/paper eligibility change
- No broker or real-money execution
- Automatic rollback to Core25 on any failed guard
- Explicit execution approval required
"@ | Set-Content -LiteralPath (Join-Path $Docs "README.md") -Encoding UTF8

$Raw=Join-Path $Audit "S10_7V_GUARDED_V2_CANARY_WITH_V3_raw_$stamp.json"
$Report=Join-Path $Audit "S10_7V_GUARDED_V2_CANARY_WITH_V3_report_$stamp.txt"
$Milestone=Join-Path $Milestones "S10_7V_GUARDED_V2_CANARY_WITH_V3_$stamp.md"

$manifest |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath $Raw -Encoding UTF8

@(
 "S10.7V GUARDED V2 CANARY WITH V3",
 "Generated=$stamp",
 "OK=$($manifest.ok)",
 "CLASSIFICATION=$($manifest.classification)",
 "PACKAGE_BUILT=$($manifest.packageBuilt)",
 "PACKAGE_EXECUTED=$($manifest.packageExecuted)",
 "UNIVERSE_COUNT=$($manifest.universeCount)",
 "UNIVERSE_UNIQUE_COUNT=$($manifest.universeUniqueCount)",
 "REQUIRED_METRICS=$($manifest.requiredMetrics -join ',')",
 "RESOLVED_METRICS=$($manifest.resolvedMetrics -join ',')",
 "MISSING_METRICS=$($manifest.missingMetrics -join ',')",
 "ERRORS=$($manifest.errors -join ',')",
 "WARNINGS=$($manifest.warnings -join ',')",
 "BASELINE_STAGE_DELTAS_REQUIRED=$($manifest.baselineStageDeltasRequired)",
 "EXPLICIT_EXECUTION_APPROVAL_REQUIRED=$($manifest.explicitExecutionApprovalRequired)",
 "ARM_ALLOWED=$($manifest.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($manifest.deploymentAuthorized)",
 "NEXT_ACTION=$($manifest.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_ROOT=$Package",
 "RAW_JSON=$Raw"
) | Set-Content -LiteralPath $Report -Encoding UTF8

@"
# S10.7V Guarded V2 Canary With V3

- OK: $($manifest.ok)
- Classification: $($manifest.classification)
- Package built: True
- Package executed: False
- Universe: $($manifest.universeCount) / $($manifest.universeUniqueCount)
- Missing metrics: $($manifest.missingMetrics -join ', ')
- Errors: $($manifest.errors -join ', ')
- Warnings: $($manifest.warnings -join ', ')
- Explicit execution approval required: True
- Arm allowed: False
- Deployment authorized: False
- Next action: $($manifest.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $Milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7V GUARDED V2 CANARY WITH V3 ===" -ForegroundColor Green
Write-Host "OK: $($manifest.ok)"
Write-Host "Classification: $($manifest.classification)"
Write-Host "Package built / executed: $($manifest.packageBuilt) / $($manifest.packageExecuted)"
Write-Host "Universe / unique: $($manifest.universeCount) / $($manifest.universeUniqueCount)"
Write-Host "Resolved metrics: $($manifest.resolvedMetrics -join ', ')"
Write-Host "Missing metrics: $($manifest.missingMetrics -join ', ')"
Write-Host "Errors: $($manifest.errors -join ', ')"
Write-Host "Warnings: $($manifest.warnings -join ', ')"
Write-Host "Baseline-stage deltas required: $($manifest.baselineStageDeltasRequired)"
Write-Host "Explicit execution approval required: $($manifest.explicitExecutionApprovalRequired)"
Write-Host "Arm allowed: $($manifest.armAllowed)"
Write-Host "Deployment authorized: $($manifest.deploymentAuthorized)"
Write-Host "Next action: $($manifest.nextAction)"
Write-Host "Package root: $Package"
Write-Host "Report: $Report"
Write-Host "Raw: $Raw"
Write-Host "Milestone: $Milestone"

if(-not $manifest.ok){
  throw "S10.7V final guarded package blocked"
}
