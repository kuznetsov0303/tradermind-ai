param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$Landing=Join-Path $ProjectRoot "components\Landing.tsx"
$BackupRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_9X6_language_dropdown_fixed_height_backup_$stamp"
$BackupLanding=Join-Path $BackupRoot "components\Landing.tsx"
$AuditDir=Join-Path $ProjectRoot "audit_exports"
$BuildLog=Join-Path $AuditDir "S10_9X6_LANGUAGE_DROPDOWN_FIXED_HEIGHT_build_$stamp.txt"
$RawPath=Join-Path $AuditDir "S10_9X6_LANGUAGE_DROPDOWN_FIXED_HEIGHT_raw_$stamp.json"
$ReportPath=Join-Path $AuditDir "S10_9X6_LANGUAGE_DROPDOWN_FIXED_HEIGHT_report_$stamp.txt"

if(-not (Test-Path -LiteralPath $Landing)){
  throw "Missing Landing.tsx: $Landing"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupLanding) | Out-Null
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
Copy-Item -LiteralPath $Landing -Destination $BackupLanding -Force

$source=[IO.File]::ReadAllText($Landing)

$old=@'
                    <div className="max-h-[92px] space-y-1 overflow-y-auto pr-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent_0,black_10px,black_calc(100%-10px),transparent_100%)]">
'@

$new=@'
                    <div
                      className="space-y-1 overflow-y-auto pr-0 [&::-webkit-scrollbar]:hidden"
                      style={{
                        height: "92px",
                        maxHeight: "92px",
                        overflowY: "auto",
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                      }}
                    >
'@

if(-not $source.Contains($old)){
  throw "Anchor not found: current language list container"
}

$source=$source.Replace($old,$new)

[IO.File]::WriteAllText(
  $Landing,
  $source,
  [Text.UTF8Encoding]::new($false)
)

try {
  $stdoutTemp=Join-Path $env:TEMP "s10_9x6_stdout_$stamp.txt"
  $stderrTemp=Join-Path $env:TEMP "s10_9x6_stderr_$stamp.txt"

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
    classification="LANDING_LANGUAGE_DROPDOWN_FIXED_HEIGHT_PASSED"
    landingComponentChanged=$true
    fixedHeightPx=92
    visibleLanguageRows=2
    inlineOverflowControl=$true
    scrollbarHidden=$true
    buildPassed=$true
    productionMutation=$false
    vpsTouched=$false
    backupRoot=$BackupRoot
    buildLog=$BuildLog
    nextAction="RESTART_DEV_SERVER_AND_RUN_VISUAL_QA"
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $RawPath -Encoding UTF8

@"
S10.9X6 LANDING LANGUAGE DROPDOWN FIXED HEIGHT
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_LANGUAGE_DROPDOWN_FIXED_HEIGHT_PASSED
LANDING_COMPONENT_CHANGED=True
FIXED_HEIGHT_PX=92
VISIBLE_LANGUAGE_ROWS=2
INLINE_OVERFLOW_CONTROL=True
SCROLLBAR_HIDDEN=True
BUILD_PASSED=True
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
BACKUP_ROOT=$BackupRoot
BUILD_LOG=$BuildLog
RAW_JSON=$RawPath
NEXT_ACTION=RESTART_DEV_SERVER_AND_RUN_VISUAL_QA
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

  Write-Host ""
  Write-Host "=== S10.9X6 COMPLETE ==="
  Write-Host "OK: True"
  Write-Host "Classification: LANDING_LANGUAGE_DROPDOWN_FIXED_HEIGHT_PASSED"
  Write-Host "Fixed height: 92px"
  Write-Host "Visible language rows: 2"
  Write-Host "Inline overflow control: True"
  Write-Host "Scrollbar hidden: True"
  Write-Host "Build passed: True"
  Write-Host "Report: $ReportPath"
}
catch {
  if(Test-Path -LiteralPath $BackupLanding){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
  }

  throw
}
