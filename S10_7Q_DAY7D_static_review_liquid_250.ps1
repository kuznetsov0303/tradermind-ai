param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $ProjectRoot "PROJECT_STATE\milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$rawFile=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7P_FMP_SCREENER_REPLACEMENT_POOL_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$universeFile=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7P_VALIDATED_LIQUID_250_UNIVERSE_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $rawFile){throw "Latest S10.7P raw JSON not found"}
if(-not $universeFile){throw "Latest S10.7P validated universe JSON not found"}

$rawPayload=Get-Content -LiteralPath $rawFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$universePayload=Get-Content -LiteralPath $universeFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json

$final=@($rawPayload.finalUniverse)
$selected=@($rawPayload.selectedReplacementRows)
$blocked=@("QQQ","SQ","PARA","BK","LC","BITF","LILM","VERV")
$core25=@(
  "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
  "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
  "UBER","SHOP","RIVN","SOFI","CRWD","NOW"
)

$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

if($rawPayload.ok -ne $true){$errors.Add("SOURCE_RAW_NOT_OK")}
if($rawPayload.classification -ne "DAY7D_FMP_SCREENER_VALIDATED_LIQUID_250_BUILT"){
  $errors.Add("SOURCE_CLASSIFICATION_UNEXPECTED")
}

if($final.Count -ne 250){$errors.Add("FINAL_COUNT_NOT_250")}

$unique=@($final | Select-Object -Unique)
if($unique.Count -ne 250){$errors.Add("FINAL_UNIQUE_COUNT_NOT_250")}

for($i=0;$i -lt $core25.Count;$i++){
  if(([string]$final[$i]).ToUpperInvariant() -ne $core25[$i]){
    $errors.Add("CORE25_NOT_PRESERVED")
    break
  }
}

foreach($symbol in $blocked){
  if($final -contains $symbol){
    $errors.Add("BLOCKED_SYMBOL_PRESENT_$symbol")
  }
}

if($selected.Count -ne 8){$errors.Add("SELECTED_REPLACEMENT_COUNT_NOT_8")}

$minPrice=[double]$rawPayload.thresholds.minPrice
$minVolume=[double]$rawPayload.thresholds.minVolume
$minMarketCap=[double]$rawPayload.thresholds.minMarketCap

foreach($row in $selected){
  $symbol=([string]$row.symbol).ToUpperInvariant()

  if(-not ($final -contains $symbol)){
    $errors.Add("REPLACEMENT_NOT_IN_FINAL_$symbol")
  }

  if([double]$row.price -lt $minPrice){
    $errors.Add("PRICE_THRESHOLD_FAILED_$symbol")
  }

  if([double]$row.volume -lt $minVolume){
    $errors.Add("VOLUME_THRESHOLD_FAILED_$symbol")
  }

  if([double]$row.marketCap -lt $minMarketCap){
    $errors.Add("MARKET_CAP_THRESHOLD_FAILED_$symbol")
  }

  if($row.profileFound -ne $true){
    $errors.Add("PROFILE_NOT_FOUND_$symbol")
  }

  if($row.securityAllowed -ne $true){
    $errors.Add("SECURITY_NOT_ALLOWED_$symbol")
  }

  if($row.isActivelyTrading -ne $true){
    $errors.Add("NOT_ACTIVE_$symbol")
  }

  if($row.isEtf -eq $true){
    $errors.Add("ETF_SELECTED_$symbol")
  }

  if($row.isFund -eq $true){
    $errors.Add("FUND_SELECTED_$symbol")
  }

  if($row.capacityEligible -ne $true){
    $errors.Add("CAPACITY_NOT_ELIGIBLE_$symbol")
  }
}

if($rawPayload.armAllowed -ne $false){$errors.Add("ARM_FLAG_NOT_FALSE")}
if($rawPayload.deploymentAuthorized -ne $false){$errors.Add("DEPLOYMENT_FLAG_NOT_FALSE")}
if($rawPayload.productionMutation -ne $false){$errors.Add("PRODUCTION_MUTATION_NOT_FALSE")}
if($rawPayload.serviceRestarted -ne $false){$errors.Add("SERVICE_RESTARTED_NOT_FALSE")}
if($rawPayload.systemdTouched -ne $false){$errors.Add("SYSTEMD_TOUCHED_NOT_FALSE")}
if($rawPayload.streamSymbolsChanged -ne $false){$errors.Add("STREAM_SYMBOLS_CHANGED_NOT_FALSE")}

if($universePayload.armAllowed -ne $false){$errors.Add("UNIVERSE_ARM_FLAG_NOT_FALSE")}
if($universePayload.clientEligible -ne $false){$errors.Add("UNIVERSE_CLIENT_FLAG_NOT_FALSE")}
if($universePayload.telegramEligible -ne $false){$errors.Add("UNIVERSE_TELEGRAM_FLAG_NOT_FALSE")}
if($universePayload.paperEligible -ne $false){$errors.Add("UNIVERSE_PAPER_FLAG_NOT_FALSE")}

if($rawPayload.liveProvider -ne "databento"){$errors.Add("LIVE_PROVIDER_NOT_DATABENTO")}
if($rawPayload.referenceProvider -ne "fmp"){$errors.Add("REFERENCE_PROVIDER_NOT_FMP")}

$replacementSymbols=@($selected | ForEach-Object {([string]$_.symbol).ToUpperInvariant()})

if($replacementSymbols.Count -ne (@($replacementSymbols | Select-Object -Unique)).Count){
  $errors.Add("DUPLICATE_REPLACEMENTS")
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$outRaw=Join-Path $Audit "S10_7Q_STATIC_REVIEW_raw_$stamp.json"
$outReport=Join-Path $Audit "S10_7Q_STATIC_REVIEW_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_7Q_STATIC_REVIEW_$stamp.md"

$ok=($errors.Count -eq 0)
$classification=if($ok){
  "DAY7D_LIQUID_250_STATIC_REVIEW_PASSED"
}else{
  "DAY7D_LIQUID_250_STATIC_REVIEW_BLOCKED"
}

$result=[ordered]@{
  ok=$ok
  classification=$classification
  inspectionOnly=$true
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  deploymentAuthorized=$false
  sourceRaw=$rawFile.FullName
  sourceUniverse=$universeFile.FullName
  finalUniverseCount=$final.Count
  finalUniverseUniqueCount=$unique.Count
  core25Preserved=($errors -notcontains "CORE25_NOT_PRESERVED")
  blockedSymbolsRemoved=(@($blocked | Where-Object {$final -contains $_}).Count -eq 0)
  selectedReplacementCount=$selected.Count
  replacementSymbols=$replacementSymbols
  thresholds=[ordered]@{
    minPrice=$minPrice
    minVolume=$minVolume
    minMarketCap=$minMarketCap
  }
  selectedReplacementRows=$selected
  errors=@($errors)
  warnings=@($warnings)
  liveProvider="databento"
  referenceProvider="fmp"
  armAllowed=$false
  clientEligible=$false
  telegramEligible=$false
  paperEligible=$false
  nextAction=if($ok){
    "BUILD_GUARDED_V2_CANARY_PACKAGE"
  }else{
    "FIX_STATIC_REVIEW_ERRORS"
  }
}

$result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $outRaw -Encoding UTF8

@(
 "S10.7Q LIQUID 250 STATIC REVIEW",
 "Generated=$stamp",
 "OK=$($result.ok)",
 "CLASSIFICATION=$($result.classification)",
 "FINAL_UNIVERSE_COUNT=$($result.finalUniverseCount)",
 "FINAL_UNIVERSE_UNIQUE_COUNT=$($result.finalUniverseUniqueCount)",
 "CORE25_PRESERVED=$($result.core25Preserved)",
 "BLOCKED_SYMBOLS_REMOVED=$($result.blockedSymbolsRemoved)",
 "SELECTED_REPLACEMENT_COUNT=$($result.selectedReplacementCount)",
 "REPLACEMENT_SYMBOLS=$($result.replacementSymbols -join ',')",
 "MIN_PRICE=$($result.thresholds.minPrice)",
 "MIN_VOLUME=$($result.thresholds.minVolume)",
 "MIN_MARKET_CAP=$($result.thresholds.minMarketCap)",
 "ERRORS=$($result.errors -join ',')",
 "WARNINGS=$($result.warnings -join ',')",
 "LIVE_PROVIDER=$($result.liveProvider)",
 "REFERENCE_PROVIDER=$($result.referenceProvider)",
 "ARM_ALLOWED=$($result.armAllowed)",
 "DEPLOYMENT_AUTHORIZED=$($result.deploymentAuthorized)",
 "NEXT_ACTION=$($result.nextAction)",
 "PRODUCTION_MUTATION=False",
 "SERVICE_RESTARTED=False",
 "SYSTEMD_TOUCHED=False",
 "STREAM_SYMBOLS_CHANGED=False",
 "RAW_JSON=$outRaw"
) | Set-Content -LiteralPath $outReport -Encoding UTF8

@"
# S10.7Q Liquid 250 Static Review

- OK: $($result.ok)
- Classification: $($result.classification)
- Final count: $($result.finalUniverseCount)
- Final unique count: $($result.finalUniverseUniqueCount)
- Core25 preserved: $($result.core25Preserved)
- Blocked symbols removed: $($result.blockedSymbolsRemoved)
- Replacements: $($result.replacementSymbols -join ', ')
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Arm allowed: False
- Deployment authorized: False
- Next action: $($result.nextAction)

No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@ | Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7Q LIQUID 250 STATIC REVIEW ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Final / unique count: $($result.finalUniverseCount) / $($result.finalUniverseUniqueCount)"
Write-Host "Core25 preserved: $($result.core25Preserved)"
Write-Host "Blocked symbols removed: $($result.blockedSymbolsRemoved)"
Write-Host "Replacements: $($result.replacementSymbols -join ', ')"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Arm allowed: $($result.armAllowed)"
Write-Host "Deployment authorized: $($result.deploymentAuthorized)"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $outReport"
Write-Host "Raw: $outRaw"
Write-Host "Milestone: $milestone"

if(-not $result.ok){
  throw "S10.7Q static review blocked"
}
