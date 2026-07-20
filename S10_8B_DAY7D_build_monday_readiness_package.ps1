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

$ValidationRaw=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_8A_Y2_OFFLINE_VALIDATION_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$ValidationReport=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_8A_Y2_OFFLINE_VALIDATION_report_*.txt" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$Universe=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7P_VALIDATED_LIQUID_250_UNIVERSE_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$CanaryPackage=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_7V_guarded_v2_canary_with_v3_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not (Test-Path -LiteralPath $Executor)){throw "Y2 executor not found: $Executor"}
if(-not $ValidationRaw){throw "Latest S10.8A validation raw not found"}
if(-not $ValidationReport){throw "Latest S10.8A validation report not found"}
if(-not $Universe){throw "Validated liquid 250 universe not found"}
if(-not $CanaryPackage){throw "S10.7V canary package not found"}

$Plan=Join-Path $CanaryPackage.FullName "config\canary_plan.json"
$PackageManifest=Join-Path $CanaryPackage.FullName "manifest.json"

foreach($path in @($Plan,$PackageManifest)){
  if(-not (Test-Path -LiteralPath $path)){throw "Required package file missing: $path"}
}

$validation=Get-Content -LiteralPath $ValidationRaw.FullName -Raw -Encoding UTF8 | ConvertFrom-Json

if($validation.ok -ne $true){
  throw "S10.8A validation is not OK"
}

if($validation.classification -ne "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_PASSED"){
  throw "Unexpected S10.8A classification"
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$Package=Join-Path $State "S10_8B_monday_readiness_$stamp"
$Docs=Join-Path $Package "docs"
$Checksums=Join-Path $Package "checksums"
$Snapshot=Join-Path $Package "snapshot"

New-Item -ItemType Directory -Force -Path $Docs,$Checksums,$Snapshot|Out-Null

$files=[ordered]@{
  executor=$Executor
  validationRaw=$ValidationRaw.FullName
  validationReport=$ValidationReport.FullName
  universe=$Universe.FullName
  canaryPlan=$Plan
  packageManifest=$PackageManifest
}

$hashes=[ordered]@{}

foreach($entry in $files.GetEnumerator()){
  $hash=(Get-FileHash -LiteralPath $entry.Value -Algorithm SHA256).Hash.ToLowerInvariant()
  $hashes[$entry.Key]=[ordered]@{
    path=$entry.Value
    sha256=$hash
    sizeBytes=(Get-Item -LiteralPath $entry.Value).Length
  }

  Copy-Item -LiteralPath $entry.Value -Destination (Join-Path $Snapshot ([IO.Path]::GetFileName($entry.Value))) -Force
}

$oldExecutor=Join-Path $ProjectRoot "S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1"
$oldExecutorPresent=Test-Path -LiteralPath $oldExecutor

$runCommand='powershell -ExecutionPolicy Bypass -File ".\S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1" -ProjectRoot (Get-Location).Path -Execute'

$preRunChecklist=@(
  "Confirm current day is Monday 2026-07-20 or another US trading weekday",
  "Confirm current time is between 16:35 and 21:45 Kyiv",
  "Confirm US regular session is open",
  "Run S10.7X2 adaptive preflight and require OK=True",
  "Confirm market and API services are active",
  "Confirm current production universe is Core25",
  "Confirm S10.8A Y2 offline validation is OK=True",
  "Confirm executor SHA-256 matches readiness manifest",
  "Do not run old S10.7Y executor",
  "Do not run manual paper run-once",
  "Do not start paper service",
  "Do not reset paper boundary"
)

$postRunChecklist=@(
  "Confirm classification is COMPLETED_CORE25_RESTORED or ROLLED_BACK",
  "Confirm productionUniverseRestoredTo25=True",
  "Confirm productionPayloadRestored=True",
  "Confirm clientEligibilityChanged=False",
  "Confirm telegramEligibilityChanged=False",
  "Confirm paperEligibilityChanged=False",
  "Confirm paperRunOnceExecuted=False",
  "Confirm paperServiceStarted=False",
  "Confirm paperBoundaryReset=False",
  "Confirm brokerEnabled=False",
  "Confirm realMoneyEnabled=False",
  "Archive raw, report, and milestone outputs"
)

$manifest=[ordered]@{
  ok=$true
  classification="DAY7D_MONDAY_READINESS_PACKAGE_BUILT"
  inspectionOnly=$true
  productionMutation=$false
  serviceRestarted=$false
  systemdTouched=$false
  streamSymbolsChanged=$false
  packageExecuted=$false
  deploymentAuthorized=$false
  armAllowed=$false
  authorizedExecutor=[ordered]@{
    filename=[IO.Path]::GetFileName($Executor)
    fullPath=$Executor
    sha256=$hashes.executor.sha256
  }
  forbiddenExecutor=[ordered]@{
    filename="S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1"
    present=$oldExecutorPresent
    mustNotRun=$true
  }
  hashes=$hashes
  exactRunCommand=$runCommand
  preRunChecklist=$preRunChecklist
  postRunChecklist=$postRunChecklist
  expectedStageOrder=@(25,50,100,150,250)
  expectedDurationMinutesApprox=57
  explicitExecutionApprovalAlreadyRecorded=$true
  mondayReminderScheduled=$true
  nextAction="MONDAY_RUN_PREFLIGHT_THEN_EXECUTE_AUTHORIZED_Y2"
}

$manifestPath=Join-Path $Package "manifest.json"
$manifest|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $manifestPath -Encoding UTF8

$checksumLines=@()

foreach($entry in $hashes.GetEnumerator()){
  $checksumLines+=("$($entry.Value.sha256)  $([IO.Path]::GetFileName($entry.Value.path))")
}

$checksumFile=Join-Path $Checksums "SHA256SUMS.txt"
$checksumLines|Set-Content -LiteralPath $checksumFile -Encoding UTF8

$runbook=Join-Path $Docs "MONDAY_RUNBOOK.md"

@"
# SkillEdge AI — Monday Guarded Capacity Canary Runbook

## Authorized executor

`$([IO.Path]::GetFileName($Executor))`

SHA-256:

`$($hashes.executor.sha256)`

The old executor `S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1` is forbidden.

## Preconditions

$($preRunChecklist | ForEach-Object {"- [ ] $_"} | Out-String)

## Exact command

```powershell
cd "$ProjectRoot"

$runCommand
```

## Expected stages

`25 → 50 → 100 → 150 → 250`

Approximate duration: 57 minutes.

## Automatic safety

- rollback at first failed guard
- exact Core25 restore
- exact original systemd drop-in restore
- exact production payload restore
- remove files that did not exist before canary
- no manual paper run-once
- no paper service start
- no boundary reset
- no client/Telegram/paper eligibility change
- no broker or real-money activation

## Post-run checks

$($postRunChecklist | ForEach-Object {"- [ ] $_"} | Out-String)
"@|Set-Content -LiteralPath $runbook -Encoding UTF8

$verify=Join-Path $Package "verify_checksums.ps1"

@"
`$ErrorActionPreference="Stop"

`$expected=@{
  "executor"="$($hashes.executor.sha256)"
  "validationRaw"="$($hashes.validationRaw.sha256)"
  "validationReport"="$($hashes.validationReport.sha256)"
  "universe"="$($hashes.universe.sha256)"
  "canaryPlan"="$($hashes.canaryPlan.sha256)"
  "packageManifest"="$($hashes.packageManifest.sha256)"
}

`$paths=@{
  "executor"="$Executor"
  "validationRaw"="$($ValidationRaw.FullName)"
  "validationReport"="$($ValidationReport.FullName)"
  "universe"="$($Universe.FullName)"
  "canaryPlan"="$Plan"
  "packageManifest"="$PackageManifest"
}

`$errors=@()

foreach(`$name in `$expected.Keys){
  if(-not (Test-Path -LiteralPath `$paths[`$name])){
    `$errors+="MISSING_`$name"
    continue
  }

  `$actual=(Get-FileHash -LiteralPath `$paths[`$name] -Algorithm SHA256).Hash.ToLowerInvariant()

  if(`$actual -ne `$expected[`$name]){
    `$errors+="HASH_MISMATCH_`$name"
  }
}

Write-Host "OK: `$(`$errors.Count -eq 0)"
Write-Host "Errors: `$(`$errors -join ', ')"

if(`$errors.Count -gt 0){
  throw "Readiness checksum verification blocked"
}
"@|Set-Content -LiteralPath $verify -Encoding UTF8

$raw=Join-Path $Audit "S10_8B_MONDAY_READINESS_raw_$stamp.json"
$report=Join-Path $Audit "S10_8B_MONDAY_READINESS_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_8B_MONDAY_READINESS_$stamp.md"

$manifest|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $raw -Encoding UTF8

@(
  "S10.8B MONDAY READINESS PACKAGE",
  "Generated=$stamp",
  "OK=True",
  "CLASSIFICATION=DAY7D_MONDAY_READINESS_PACKAGE_BUILT",
  "AUTHORIZED_EXECUTOR=$([IO.Path]::GetFileName($Executor))",
  "AUTHORIZED_EXECUTOR_SHA256=$($hashes.executor.sha256)",
  "OLD_EXECUTOR_PRESENT=$oldExecutorPresent",
  "OLD_EXECUTOR_FORBIDDEN=True",
  "EXPECTED_STAGE_ORDER=25→50→100→150→250",
  "EXPECTED_DURATION_MINUTES_APPROX=57",
  "EXPLICIT_APPROVAL_RECORDED=True",
  "MONDAY_REMINDER_SCHEDULED=True",
  "PRODUCTION_MUTATION=False",
  "SERVICE_RESTARTED=False",
  "SYSTEMD_TOUCHED=False",
  "STREAM_SYMBOLS_CHANGED=False",
  "PACKAGE_EXECUTED=False",
  "NEXT_ACTION=MONDAY_RUN_PREFLIGHT_THEN_EXECUTE_AUTHORIZED_Y2",
  "PACKAGE_ROOT=$Package",
  "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.8B Monday Readiness

- OK: True
- Classification: DAY7D_MONDAY_READINESS_PACKAGE_BUILT
- Authorized executor: $([IO.Path]::GetFileName($Executor))
- SHA-256: $($hashes.executor.sha256)
- Old executor present: $oldExecutorPresent
- Old executor forbidden: True
- Stage order: 25→50→100→150→250
- Approximate duration: 57 minutes
- Explicit approval recorded: True
- Monday reminder scheduled: True
- Next action: MONDAY_RUN_PREFLIGHT_THEN_EXECUTE_AUTHORIZED_Y2

No VPS connection.
No production mutation.
No service restart.
No systemd edit.
No stream/universe change.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.8B MONDAY READINESS ===" -ForegroundColor Green
Write-Host "OK: True"
Write-Host "Classification: DAY7D_MONDAY_READINESS_PACKAGE_BUILT"
Write-Host "Authorized executor: $([IO.Path]::GetFileName($Executor))"
Write-Host "Executor SHA-256: $($hashes.executor.sha256)"
Write-Host "Old executor present: $oldExecutorPresent"
Write-Host "Old executor forbidden: True"
Write-Host "Expected stages: 25→50→100→150→250"
Write-Host "Expected duration: ~57 minutes"
Write-Host "Package root: $Package"
Write-Host "Runbook: $runbook"
Write-Host "Checksum verifier: $verify"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
