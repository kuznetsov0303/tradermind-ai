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

$ReadinessPackage=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_8B_monday_readiness_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $ReadinessPackage){
  throw "S10.8B readiness package not found"
}

$ManifestPath=Join-Path $ReadinessPackage.FullName "manifest.json"
$VerifierPath=Join-Path $ReadinessPackage.FullName "verify_checksums.ps1"
$RunbookPath=Join-Path $ReadinessPackage.FullName "docs\MONDAY_RUNBOOK.md"
$ChecksumsPath=Join-Path $ReadinessPackage.FullName "checksums\SHA256SUMS.txt"

foreach($path in @(
  $ManifestPath,
  $VerifierPath,
  $RunbookPath,
  $ChecksumsPath
)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required readiness artifact missing: $path"
  }
}

$manifest=Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

if($manifest.ok -ne $true){
  throw "Readiness manifest is not OK"
}

if($manifest.classification -ne "DAY7D_MONDAY_READINESS_PACKAGE_BUILT"){
  throw "Unexpected readiness classification"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

$actualHashes=[ordered]@{}

foreach($property in $manifest.hashes.PSObject.Properties){
  $name=$property.Name
  $record=$property.Value
  $path=[string]$record.path
  $expected=[string]$record.sha256

  if(-not (Test-Path -LiteralPath $path)){
    $errors.Add("MISSING_$name")
    continue
  }

  $actual=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()

  $actualHashes[$name]=[ordered]@{
    path=$path
    expectedSha256=$expected
    actualSha256=$actual
    matches=($actual -eq $expected)
  }

  if($actual -ne $expected){
    $errors.Add("HASH_MISMATCH_$name")
  }
}

$executorPath=[string]$manifest.authorizedExecutor.fullPath
$authorizedName=[string]$manifest.authorizedExecutor.filename
$forbiddenName=[string]$manifest.forbiddenExecutor.filename

if([IO.Path]::GetFileName($executorPath) -ne $authorizedName){
  $errors.Add("AUTHORIZED_EXECUTOR_NAME_MISMATCH")
}

if($authorizedName -ne "S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1"){
  $errors.Add("AUTHORIZED_EXECUTOR_UNEXPECTED")
}

if($forbiddenName -ne "S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1"){
  $errors.Add("FORBIDDEN_EXECUTOR_UNEXPECTED")
}

$runbookText=Get-Content -LiteralPath $RunbookPath -Raw -Encoding UTF8

$requiredRunbookTokens=@(
  $authorizedName,
  $forbiddenName,
  "25 → 50 → 100 → 150 → 250",
  "rollback at first failed guard",
  "exact Core25 restore",
  "exact production payload restore",
  "no manual paper run-once",
  "no broker or real-money activation"
)

foreach($token in $requiredRunbookTokens){
  if(-not $runbookText.Contains($token)){
    $errors.Add("RUNBOOK_TOKEN_MISSING_$token")
  }
}

$exactCommand=[string]$manifest.exactRunCommand

if(-not $exactCommand.Contains($authorizedName)){
  $errors.Add("RUN_COMMAND_NOT_USING_AUTHORIZED_EXECUTOR")
}

if(-not $exactCommand.Contains("-Execute")){
  $errors.Add("RUN_COMMAND_EXECUTE_SWITCH_MISSING")
}

if($exactCommand.Contains($forbiddenName)){
  $errors.Add("RUN_COMMAND_USES_FORBIDDEN_EXECUTOR")
}

$stageOrder=@($manifest.expectedStageOrder | ForEach-Object {[int]$_})
$expectedStageOrder=@(25,50,100,150,250)

$stageDiff=@(
  Compare-Object `
    -ReferenceObject $expectedStageOrder `
    -DifferenceObject $stageOrder `
    -SyncWindow 0
)

if(@($stageDiff).Count -ne 0){
  $errors.Add("READINESS_STAGE_ORDER_INVALID")
}

$forbiddenProductionTokens=@(
  ("systemctl "+"restart"),
  ("systemctl "+"daemon-reload"),
  ("ssh "+"-i"),
  ("scp "+"-i")
)

$validatorText=Get-Content -LiteralPath $PSCommandPath -Raw -Encoding UTF8

foreach($token in $forbiddenProductionTokens){
  if($validatorText.ToLowerInvariant().Contains($token)){
    $errors.Add("VALIDATOR_CONTAINS_FORBIDDEN_LIVE_TOKEN_$token")
  }
}

$ok=($errors.Count -eq 0)
$classification=if($ok){
  "DAY7D_FINAL_INTEGRITY_LOCK_PASSED"
}else{
  "DAY7D_FINAL_INTEGRITY_LOCK_BLOCKED"
}

$result=[ordered]@{
  ok=$ok
  classification=$classification
  inspectionOnly=$true
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  packageExecuted=$false
  deploymentAuthorized=$false
  armAllowed=$false
  readinessPackage=$ReadinessPackage.FullName
  authorizedExecutor=$authorizedName
  authorizedExecutorSha256=[string]$manifest.authorizedExecutor.sha256
  forbiddenExecutor=$forbiddenName
  forbiddenExecutorMustNotRun=$true
  exactRunCommand=$exactCommand
  expectedStageOrder=$expectedStageOrder
  actualStageOrder=$stageOrder
  hashChecks=$actualHashes
  runbookValidated=$true
  checksumVerifierPresent=$true
  errors=@($errors|Select-Object -Unique)
  warnings=@($warnings|Select-Object -Unique)
  nextAction=if($ok){
    "MONDAY_RECHECK_HASHES_RUN_PREFLIGHT_EXECUTE_Y2"
  }else{
    "FIX_FINAL_INTEGRITY_LOCK"
  }
}

$raw=Join-Path $Audit "S10_8C_FINAL_INTEGRITY_LOCK_raw_$stamp.json"
$report=Join-Path $Audit "S10_8C_FINAL_INTEGRITY_LOCK_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_8C_FINAL_INTEGRITY_LOCK_$stamp.md"

$result|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $raw -Encoding UTF8

$hashSummary=@(
  $actualHashes.GetEnumerator() |
  ForEach-Object {"$($_.Key)=$($_.Value.matches)"}
)

@(
  "S10.8C FINAL INTEGRITY LOCK",
  "Generated=$stamp",
  "OK=$($result.ok)",
  "CLASSIFICATION=$($result.classification)",
  "AUTHORIZED_EXECUTOR=$($result.authorizedExecutor)",
  "AUTHORIZED_EXECUTOR_SHA256=$($result.authorizedExecutorSha256)",
  "FORBIDDEN_EXECUTOR=$($result.forbiddenExecutor)",
  "FORBIDDEN_EXECUTOR_MUST_NOT_RUN=True",
  "EXPECTED_STAGE_ORDER=$($result.expectedStageOrder -join '→')",
  "ACTUAL_STAGE_ORDER=$($result.actualStageOrder -join '→')",
  "HASH_CHECKS=$($hashSummary -join ' ; ')",
  "RUNBOOK_VALIDATED=$($result.runbookValidated)",
  "CHECKSUM_VERIFIER_PRESENT=$($result.checksumVerifierPresent)",
  "ERRORS=$($result.errors -join ',')",
  "WARNINGS=$($result.warnings -join ',')",
  "PRODUCTION_MUTATION=False",
  "SERVICE_RESTARTED=False",
  "SYSTEMD_TOUCHED=False",
  "STREAM_SYMBOLS_CHANGED=False",
  "PACKAGE_EXECUTED=False",
  "NEXT_ACTION=$($result.nextAction)",
  "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.8C Final Integrity Lock

- OK: $($result.ok)
- Classification: $($result.classification)
- Authorized executor: $($result.authorizedExecutor)
- Authorized SHA-256: $($result.authorizedExecutorSha256)
- Forbidden executor: $($result.forbiddenExecutor)
- Forbidden executor must not run: True
- Expected stages: $($result.expectedStageOrder -join '→')
- Actual stages: $($result.actualStageOrder -join '→')
- Hashes: $($hashSummary -join ' ; ')
- Runbook validated: $($result.runbookValidated)
- Checksum verifier present: $($result.checksumVerifierPresent)
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Next action: $($result.nextAction)

No VPS connection.
No production mutation.
No service restart.
No systemd change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.8C FINAL INTEGRITY LOCK ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Authorized executor: $($result.authorizedExecutor)"
Write-Host "Authorized SHA-256: $($result.authorizedExecutorSha256)"
Write-Host "Forbidden executor: $($result.forbiddenExecutor)"
Write-Host "Forbidden executor must not run: $($result.forbiddenExecutorMustNotRun)"
Write-Host "Expected stages: $($result.expectedStageOrder -join '→')"
Write-Host "Actual stages: $($result.actualStageOrder -join '→')"
Write-Host "Hash checks: $($hashSummary -join ' ; ')"
Write-Host "Runbook validated: $($result.runbookValidated)"
Write-Host "Checksum verifier present: $($result.checksumVerifierPresent)"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Next action: $($result.nextAction)"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"

if(-not $result.ok){
  throw "S10.8C final integrity lock blocked"
}
