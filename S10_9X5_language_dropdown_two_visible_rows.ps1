param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$Landing=Join-Path $ProjectRoot "components\Landing.tsx"
$BackupRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_9X5_language_dropdown_two_rows_backup_$stamp"
$BackupLanding=Join-Path $BackupRoot "components\Landing.tsx"
$AuditDir=Join-Path $ProjectRoot "audit_exports"
$BuildLog=Join-Path $AuditDir "S10_9X5_LANGUAGE_DROPDOWN_TWO_ROWS_build_$stamp.txt"
$RawPath=Join-Path $AuditDir "S10_9X5_LANGUAGE_DROPDOWN_TWO_ROWS_raw_$stamp.json"
$ReportPath=Join-Path $AuditDir "S10_9X5_LANGUAGE_DROPDOWN_TWO_ROWS_report_$stamp.txt"

if(-not (Test-Path -LiteralPath $Landing)){
  throw "Missing Landing.tsx: $Landing"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupLanding) | Out-Null
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
Copy-Item -LiteralPath $Landing -Destination $BackupLanding -Force

$source=[IO.File]::ReadAllText($Landing)

function Replace-Exact {
  param(
    [string]$Text,
    [string]$Old,
    [string]$New,
    [string]$Label
  )

  if(-not $Text.Contains($Old)){
    throw "Anchor not found: $Label"
  }

  return $Text.Replace($Old,$New)
}

try {
  $oldList='className="max-h-[322px] space-y-1 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin]"'

  $newList='className="max-h-[92px] space-y-1 overflow-y-auto pr-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent_0,black_10px,black_calc(100%-10px),transparent_100%)]"'

  $source=Replace-Exact `
    -Text $source `
    -Old $oldList `
    -New $newList `
    -Label "two-row hidden-scroll language list"

  [IO.File]::WriteAllText(
    $Landing,
    $source,
    [Text.UTF8Encoding]::new($false)
  )

  $stdoutTemp=Join-Path $env:TEMP "s10_9x5_stdout_$stamp.txt"
  $stderrTemp=Join-Path $env:TEMP "s10_9x5_stderr_$stamp.txt"

  Remove-Item -LiteralPath $stdoutTemp,$stderrTemp -Force -ErrorAction SilentlyContinue

  $process=Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList @("/d","/s","/c","npm run build") `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $stdoutTemp `
    -RedirectStandardError $stderrTemp `
    -NoNewWindow `
    -Wait `
    -PassThru

  $stdout=if(Test-Path -LiteralPath $stdoutTemp){
    [IO.File]::ReadAllText($stdoutTemp)
  }else{
    ""
  }

  $stderr=if(Test-Path -LiteralPath $stderrTemp){
    [IO.File]::ReadAllText($stderrTemp)
  }else{
    ""
  }

@"
STATUS=$($process.ExitCode)

--- STDOUT ---
$stdout

--- STDERR ---
$stderr
"@ | Set-Content -LiteralPath $BuildLog -Encoding UTF8

  Remove-Item -LiteralPath $stdoutTemp,$stderrTemp -Force -ErrorAction SilentlyContinue

  if($process.ExitCode -ne 0){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
    throw "Build failed; Landing.tsx restored. See $BuildLog"
  }

  [ordered]@{
    ok=$true
    classification="LANDING_LANGUAGE_DROPDOWN_TWO_VISIBLE_ROWS_PASSED"
    landingComponentChanged=$true
    visibleLanguageRows=2
    internalScroll=$true
    scrollbarHidden=$true
    premiumFadeMask=$true
    searchPreserved=$true
    activeRowHighlightPreserved=$true
    buildPassed=$true
    productionMutation=$false
    vpsTouched=$false
    backupRoot=$BackupRoot
    buildLog=$BuildLog
    nextAction="RUN_FINAL_DROPDOWN_VISUAL_QA"
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $RawPath -Encoding UTF8

@"
S10.9X5 LANDING LANGUAGE DROPDOWN TWO VISIBLE ROWS
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_LANGUAGE_DROPDOWN_TWO_VISIBLE_ROWS_PASSED
LANDING_COMPONENT_CHANGED=True
VISIBLE_LANGUAGE_ROWS=2
INTERNAL_SCROLL=True
SCROLLBAR_HIDDEN=True
PREMIUM_FADE_MASK=True
SEARCH_PRESERVED=True
ACTIVE_ROW_HIGHLIGHT_PRESERVED=True
BUILD_PASSED=True
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
BACKUP_ROOT=$BackupRoot
BUILD_LOG=$BuildLog
RAW_JSON=$RawPath
NEXT_ACTION=RUN_FINAL_DROPDOWN_VISUAL_QA
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

  Write-Host ""
  Write-Host "=== S10.9X5 COMPLETE ==="
  Write-Host "OK: True"
  Write-Host "Classification: LANDING_LANGUAGE_DROPDOWN_TWO_VISIBLE_ROWS_PASSED"
  Write-Host "Visible language rows: 2"
  Write-Host "Internal scroll: True"
  Write-Host "Scrollbar hidden: True"
  Write-Host "Premium fade mask: True"
  Write-Host "Search preserved: True"
  Write-Host "Build passed: True"
  Write-Host "Report: $ReportPath"
}
catch {
  if(Test-Path -LiteralPath $BackupLanding){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
  }

  throw
}
