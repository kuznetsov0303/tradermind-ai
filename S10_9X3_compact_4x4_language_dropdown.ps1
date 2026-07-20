param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$Landing=Join-Path $ProjectRoot "components\Landing.tsx"
$BackupRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_9X3_language_dropdown_compact_backup_$stamp"
$BackupLanding=Join-Path $BackupRoot "components\Landing.tsx"
$AuditDir=Join-Path $ProjectRoot "audit_exports"
$BuildLog=Join-Path $AuditDir "S10_9X3_LANGUAGE_DROPDOWN_COMPACT_build_$stamp.txt"
$RawPath=Join-Path $AuditDir "S10_9X3_LANGUAGE_DROPDOWN_COMPACT_raw_$stamp.json"
$ReportPath=Join-Path $AuditDir "S10_9X3_LANGUAGE_DROPDOWN_COMPACT_report_$stamp.txt"

if(-not (Test-Path -LiteralPath $Landing)){ throw "Missing Landing.tsx: $Landing" }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupLanding) | Out-Null
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
Copy-Item -LiteralPath $Landing -Destination $BackupLanding -Force

$source=[IO.File]::ReadAllText($Landing)

function Replace-Exact {
  param([string]$Text,[string]$Old,[string]$New,[string]$Label)
  if(-not $Text.Contains($Old)){ throw "Anchor not found: $Label" }
  return $Text.Replace($Old,$New)
}

try {
  $source=Replace-Exact $source `
    'className="absolute right-0 top-[calc(100%+12px)] z-[80] w-[300px] overflow-hidden rounded-3xl border border-white/12 bg-[#0B1725]/98 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl"' `
    'className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[252px] rounded-2xl border border-white/10 bg-[#0B1725]/98 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.44)] backdrop-blur-2xl"' `
    "desktop panel"

  $source=Replace-Exact $source `
    'className="grid max-h-[360px] grid-cols-2 gap-1 overflow-y-auto p-1"' `
    'className="grid grid-cols-4 gap-1.5"' `
    "desktop grid"

  $desktopOld=@'
                            className={`flex min-h-11 items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                              selected
                                ? "bg-emerald-400/12 text-white ring-1 ring-emerald-300/25"
                                : "text-white/72 hover:bg-white/[0.07] hover:text-white"
                            }`}
                          >
                            <span className="truncate">{option.nativeLabel}</span>
                            <span
                              className={`ml-3 text-[10px] font-semibold tracking-[0.16em] ${
                                selected ? "text-emerald-300" : "text-white/30"
                              }`}
                            >
                              {option.shortLabel}
                            </span>
'@

  $desktopNew=@'
                            title={option.nativeLabel}
                            aria-label={option.nativeLabel}
                            className={`flex h-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.08em] transition ${
                              selected
                                ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                                : "border-white/[0.06] bg-white/[0.025] text-white/58 hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
                            }`}
                          >
                            {option.shortLabel}
'@

  $source=Replace-Exact $source $desktopOld $desktopNew "desktop tile"

  $source=Replace-Exact $source `
    'className="grid grid-cols-2 gap-1"' `
    'className="grid grid-cols-4 gap-1.5"' `
    "mobile grid"

  $mobileOld=@'
                          className={`flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "bg-emerald-400/12 text-white ring-1 ring-emerald-300/25"
                              : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span className="truncate">{option.nativeLabel}</span>
                          <span className="ml-2 text-[10px] font-semibold tracking-[0.14em] text-white/35">
                            {option.shortLabel}
                          </span>
'@

  $mobileNew=@'
                          title={option.nativeLabel}
                          aria-label={option.nativeLabel}
                          className={`flex h-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.08em] transition ${
                            selected
                              ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                              : "border-white/[0.06] bg-white/[0.025] text-white/58 hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
                          }`}
                        >
                          {option.shortLabel}
'@

  $source=Replace-Exact $source $mobileOld $mobileNew "mobile tile"

  [IO.File]::WriteAllText($Landing,$source,[Text.UTF8Encoding]::new($false))

  $stdoutTemp=Join-Path $env:TEMP "s10_9x3_stdout_$stamp.txt"
  $stderrTemp=Join-Path $env:TEMP "s10_9x3_stderr_$stamp.txt"

  $proc=Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList @("/d","/s","/c","npm run build") `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $stdoutTemp `
    -RedirectStandardError $stderrTemp `
    -NoNewWindow -Wait -PassThru

  $stdout=if(Test-Path $stdoutTemp){[IO.File]::ReadAllText($stdoutTemp)}else{""}
  $stderr=if(Test-Path $stderrTemp){[IO.File]::ReadAllText($stderrTemp)}else{""}

@"
STATUS=$($proc.ExitCode)

--- STDOUT ---
$stdout

--- STDERR ---
$stderr
"@ | Set-Content -LiteralPath $BuildLog -Encoding UTF8

  Remove-Item $stdoutTemp,$stderrTemp -Force -ErrorAction SilentlyContinue

  if($proc.ExitCode -ne 0){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
    throw "Build failed; Landing restored. See $BuildLog"
  }

  [ordered]@{
    ok=$true
    classification="LANDING_LANGUAGE_DROPDOWN_COMPACT_GRID_PASSED"
    desktopGridColumns=4
    mobileGridColumns=4
    circularSelectionRemoved=$true
    activeTileHighlight=$true
    scrollingRemoved=$true
    buildPassed=$true
    productionMutation=$false
    vpsTouched=$false
    backupRoot=$BackupRoot
    buildLog=$BuildLog
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $RawPath -Encoding UTF8

@"
S10.9X3 LANDING LANGUAGE DROPDOWN COMPACT GRID
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_LANGUAGE_DROPDOWN_COMPACT_GRID_PASSED
DESKTOP_GRID_COLUMNS=4
MOBILE_GRID_COLUMNS=4
CIRCULAR_SELECTION_REMOVED=True
ACTIVE_TILE_HIGHLIGHT=True
SCROLLING_REMOVED=True
BUILD_PASSED=True
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
BACKUP_ROOT=$BackupRoot
BUILD_LOG=$BuildLog
RAW_JSON=$RawPath
NEXT_ACTION=RUN_DROPDOWN_VISUAL_QA
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

  Write-Host ""
  Write-Host "=== S10.9X3 COMPLETE ==="
  Write-Host "OK: True"
  Write-Host "Classification: LANDING_LANGUAGE_DROPDOWN_COMPACT_GRID_PASSED"
  Write-Host "Desktop grid: 4 columns"
  Write-Host "Mobile grid: 4 columns"
  Write-Host "Circular selection removed: True"
  Write-Host "Active tile highlight: True"
  Write-Host "Scrolling removed: True"
  Write-Host "Build passed: True"
  Write-Host "Report: $ReportPath"
}
catch {
  if(Test-Path -LiteralPath $BackupLanding){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
  }
  throw
}
