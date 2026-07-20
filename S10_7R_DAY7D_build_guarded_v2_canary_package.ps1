param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$review=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7Q_STATIC_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$universe=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7P_VALIDATED_LIQUID_250_UNIVERSE_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$patchRoot=Join-Path $State "S10_7J_security_master_instrumentation_patch_v2"
$streamFile=Join-Path $patchRoot "app\market_data\stream_service.py"

$activeSource=Join-Path $State "S10_7H_active_source_snapshot"
$discoveryFile=Join-Path $activeSource "app\discovery.py"

if(-not $review){throw "Latest S10.7Q static review raw not found"}
if(-not $universe){throw "Latest S10.7P validated universe not found"}
if(-not (Test-Path -LiteralPath $streamFile)){throw "Patched stream_service.py not found"}
if(-not (Test-Path -LiteralPath $discoveryFile)){throw "Active discovery.py snapshot not found"}

$reviewPayload=Get-Content -LiteralPath $review.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$universePayload=Get-Content -LiteralPath $universe.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$streamText=Get-Content -LiteralPath $streamFile -Raw -Encoding UTF8
$discoveryText=Get-Content -LiteralPath $discoveryFile -Raw -Encoding UTF8

$final=@($universePayload.finalUniverse)

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$package=Join-Path $State "S10_7R_guarded_v2_canary_package_$stamp"
$packagePatch=Join-Path $package "patch"
$packageConfig=Join-Path $package "config"
$packageDocs=Join-Path $package "docs"

New-Item -ItemType Directory -Force -Path $packagePatch,$packageConfig,$packageDocs|Out-Null

$requiredMetrics=[ordered]@{
  rawRecordsPerSecond=@("rawRecordsPerSecond")
  marketEventsPerSecond=@("marketEventsPerSecond")
  processingLagP95Ms=@("callbackLatencyMs","processingLagP95Ms")
  quoteFreshnessP95Seconds=@("quoteFreshnessP95Seconds","quoteFreshnessP95")
  cpuPercent=@("cpuPercent")
  rssBytes=@("rssBytes","currentRssBytes","maxRssBytes")
  snapshotWriteLatencyMs=@("snapshotWriteLatencyMs")
  candleCompletenessPercent=@("candleCompletenessPercent","candleCompleteness")
  providerReconnectCount=@("reconnectCount","providerReconnectCount")
  providerErrorCount=@("errorCount","providerErrorCount")
  scannerCycleMs=@("scannerBuildLatencyMs","scannerCycleMs")
  setupCycleMs=@("setupCycleMs","setupEngineCycleMs","setupRefreshLatencyMs")
}

$metricPresence=[ordered]@{}
$missing=New-Object System.Collections.Generic.List[string]

foreach($entry in $requiredMetrics.GetEnumerator()){
  $name=$entry.Key
  $aliases=@($entry.Value)
  $haystack=if($name -eq "setupCycleMs"){
    $streamText+"`n"+$discoveryText
  }else{
    $streamText
  }

  $present=$false
  foreach($alias in $aliases){
    if($haystack.Contains($alias)){
      $present=$true
      break
    }
  }

  $metricPresence[$name]=$present

  if(-not $present){
    $missing.Add($name)
  }
}

$contractErrors=New-Object System.Collections.Generic.List[string]

if($reviewPayload.ok -ne $true){
  $contractErrors.Add("LIQUID_250_REVIEW_NOT_OK")
}

if($reviewPayload.classification -ne "DAY7D_LIQUID_250_STATIC_REVIEW_PASSED"){
  $contractErrors.Add("LIQUID_250_REVIEW_CLASSIFICATION_UNEXPECTED")
}

if($final.Count -ne 250){
  $contractErrors.Add("UNIVERSE_COUNT_NOT_250")
}

if((@($final|Select-Object -Unique)).Count -ne 250){
  $contractErrors.Add("UNIVERSE_UNIQUE_COUNT_NOT_250")
}

foreach($name in $missing){
  $contractErrors.Add("MISSING_METRIC_$name")
}

$baselineDeltaRequired=$true
$stageDefinitions=@(
  [ordered]@{
    stage=25
    durationMinutes=5
    purpose="baseline"
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=50
    durationMinutes=5
    purpose="micro-canary"
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=100
    durationMinutes=5
    purpose="micro-canary"
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=150
    durationMinutes=10
    purpose="intermediate-canary"
    rollbackOnFailure=$true
  },
  [ordered]@{
    stage=250
    durationMinutes=30
    purpose="final-capacity-canary"
    rollbackOnFailure=$true
  }
)

$rollbackRules=[ordered]@{
  serviceUnhealthy=$true
  reconnectBurst=$true
  providerErrorsIncrease=$true
  negativeQuoteAge=$true
  quoteFreshnessP95RegressionPercent=50
  processingLagP95RegressionPercent=50
  cpuPercentCeiling=85
  rssGrowthPercentCeiling=50
  candleCompletenessFloorPercent=99
  scannerCycleRegressionPercent=100
  setupCycleRegressionPercent=100
  snapshotWriteRegressionPercent=100
  returnToUniverseSize=25
}

$ok=($contractErrors.Count -eq 0)
$classification=if($ok){
  "DAY7D_GUARDED_V2_CANARY_PACKAGE_BUILT_NOT_ARMED"
}else{
  "DAY7D_GUARDED_V2_CANARY_PACKAGE_BLOCKED"
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
  liveProvider="databento"
  referenceProvider="fmp"
  universeSource=$universe.FullName
  universeCount=$final.Count
  universeUniqueCount=(@($final|Select-Object -Unique)).Count
  metricPresence=$metricPresence
  missingMetrics=@($missing)
  baselineStageDeltasRequired=$baselineDeltaRequired
  stages=$stageDefinitions
  rollbackRules=$rollbackRules
  errors=@($contractErrors)
  nextAction=if($ok){
    "RUN_PACKAGE_STATIC_REVIEW_THEN_REQUEST_EXPLICIT_EXECUTION_APPROVAL"
  }else{
    "BUILD_MISSING_CAPACITY_INSTRUMENTATION_PATCH_V3"
  }
}

Copy-Item -LiteralPath $patchRoot -Destination $packagePatch -Recurse -Force
Copy-Item -LiteralPath $universe.FullName -Destination (Join-Path $packageConfig "validated_liquid_250_universe.json") -Force

$manifest |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath (Join-Path $package "manifest.json") -Encoding UTF8

@{
  stages=$stageDefinitions
  requiredMetrics=@($requiredMetrics.Keys)
  rollbackRules=$rollbackRules
  baselineStageDeltasRequired=$true
  executionAuthorized=$false
  currentProductionUniverseMustRemain=25
} |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath (Join-Path $packageConfig "canary_plan.json") -Encoding UTF8

@"
# Guarded V2 Capacity Canary Package

Classification: $classification

This package is not armed and does not authorize execution.

## Universe

- Validated liquid symbols: $($final.Count)
- Unique symbols: $((@($final|Select-Object -Unique)).Count)
- Production universe remains Core25 until explicit approval.

## Required metrics

$(@($requiredMetrics.Keys | ForEach-Object {"- $_"}) -join "`r`n")

## Missing metrics

$(@($missing | ForEach-Object {"- $_"}) -join "`r`n")

## Safety

- No production mutation
- No service restart
- No systemd changes
- No stream symbol changes
- Automatic rollback required at every stage
- Baseline-to-stage deltas required
- Explicit execution approval required
"@ | Set-Content -LiteralPath (Join-Path $packageDocs "README.md") -Encoding UTF8

$raw=Join-Path $Audit "S10_7R_GUARDED_V2_CANARY_PACKAGE_raw_$stamp.json"
$report=Join-Path $Audit "S10_7R_GUARDED_V2_CANARY_PACKAGE_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7R_GUARDED_V2_CANARY_PACKAGE_$stamp.md"

$manifest |
  ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath $raw -Encoding UTF8

@(
 "S10.7R GUARDED V2 CANARY PACKAGE",
 "Generated=$stamp",
 "OK=$($manifest.ok)",
 "CLASSIFICATION=$($manifest.classification)",
 "PACKAGE_BUILT=$($manifest.packageBuilt)",
 "PACKAGE_EXECUTED=$($manifest.packageExecuted)",
 "DEPLOYMENT_AUTHORIZED=$($manifest.deploymentAuthorized)",
 "ARM_ALLOWED=$($manifest.armAllowed)",
 "UNIVERSE_COUNT=$($manifest.universeCount)",
 "UNIVERSE_UNIQUE_COUNT=$($manifest.universeUniqueCount)",
 "MISSING_METRICS=$($manifest.missingMetrics -join ',')",
 "ERRORS=$($manifest.errors -join ',')",
 "BASELINE_STAGE_DELTAS_REQUIRED=$($manifest.baselineStageDeltasRequired)",
 "NEXT_ACTION=$($manifest.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "PACKAGE_ROOT=$package",
 "RAW_JSON=$raw"
) | Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.7R Guarded V2 Canary Package

- OK: $($manifest.ok)
- Classification: $($manifest.classification)
- Package built: True
- Package executed: False
- Universe: $($manifest.universeCount) / $($manifest.universeUniqueCount)
- Missing metrics: $($manifest.missingMetrics -join ', ')
- Errors: $($manifest.errors -join ', ')
- Arm allowed: False
- Deployment authorized: False
- Next action: $($manifest.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7R GUARDED V2 CANARY PACKAGE ===" -ForegroundColor Green
Write-Host "OK: $($manifest.ok)"
Write-Host "Classification: $($manifest.classification)"
Write-Host "Package built: $($manifest.packageBuilt)"
Write-Host "Package executed: $($manifest.packageExecuted)"
Write-Host "Universe / unique: $($manifest.universeCount) / $($manifest.universeUniqueCount)"
Write-Host "Missing metrics: $($manifest.missingMetrics -join ', ')"
Write-Host "Errors: $($manifest.errors -join ', ')"
Write-Host "Baseline-stage deltas required: $($manifest.baselineStageDeltasRequired)"
Write-Host "Arm allowed: $($manifest.armAllowed)"
Write-Host "Deployment authorized: $($manifest.deploymentAuthorized)"
Write-Host "Next action: $($manifest.nextAction)"
Write-Host "Package root: $package"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
