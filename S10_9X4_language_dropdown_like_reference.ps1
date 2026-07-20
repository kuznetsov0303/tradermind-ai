param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$Landing=Join-Path $ProjectRoot "components\Landing.tsx"
$BackupRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_9X4_language_dropdown_reference_backup_$stamp"
$BackupLanding=Join-Path $BackupRoot "components\Landing.tsx"
$AuditDir=Join-Path $ProjectRoot "audit_exports"
$BuildLog=Join-Path $AuditDir "S10_9X4_LANGUAGE_DROPDOWN_REFERENCE_build_$stamp.txt"
$RawPath=Join-Path $AuditDir "S10_9X4_LANGUAGE_DROPDOWN_REFERENCE_raw_$stamp.json"
$ReportPath=Join-Path $AuditDir "S10_9X4_LANGUAGE_DROPDOWN_REFERENCE_report_$stamp.txt"

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
  $source=Replace-Exact `
    -Text $source `
    -Old '  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);' `
    -New @'
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
'@ `
    -Label "language search state"

  $source=Replace-Exact `
    -Text $source `
    -Old '  const t = getStructuredLandingDictionary(language);' `
    -New @'
  const t = getStructuredLandingDictionary(language);

  const filteredLanguageOptions = useMemo(() => {
    const query = languageSearch.trim().toLocaleLowerCase();

    if (!query) return LANDING_LANGUAGE_OPTIONS;

    return LANDING_LANGUAGE_OPTIONS.filter((option) =>
      [
        option.locale,
        option.shortLabel,
        option.nativeLabel,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [languageSearch]);
'@ `
    -Label "filtered language options"

  $source=Replace-Exact `
    -Text $source `
    -Old @'
    setLanguageMenuOpen(false);
    setMenuOpen(false);
  };
'@ `
    -New @'
    setLanguageMenuOpen(false);
    setLanguageSearch("");
    setMenuOpen(false);
  };
'@ `
    -Label "clear search after selection"

  $oldTopButton=@'
                <Icon name="globe" className="mr-2 h-4 w-4" />
                {LANDING_LANGUAGE_SHORT_LABEL[language]}
                <span
                  aria-hidden="true"
                  className={`ml-2 text-[10px] text-white/45 transition-transform ${
                    languageMenuOpen ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
'@

  $newTopButton=@'
                <span
                  aria-hidden="true"
                  className="mr-2 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]"
                />
                {LANDING_LANGUAGE_SHORT_LABEL[language]}
                <span
                  aria-hidden="true"
                  className={`ml-2 text-[10px] text-white/45 transition-transform ${
                    languageMenuOpen ? "rotate-180" : ""
                  }`}
                >
                 ⌄
                </span>
'@

  $source=Replace-Exact `
    -Text $source `
    -Old $oldTopButton `
    -New $newTopButton `
    -Label "reference top language button"

  $source=Replace-Exact `
    -Text $source `
    -Old 'className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[252px] rounded-2xl border border-white/10 bg-[#0B1725]/98 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.44)] backdrop-blur-2xl"' `
    -New 'className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[292px] overflow-hidden rounded-2xl border border-white/10 bg-[#101A31]/98 p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl"' `
    -Label "reference dropdown panel"

  $oldDesktopGrid=@'
                    <div className="grid grid-cols-4 gap-1.5">
                      {LANDING_LANGUAGE_OPTIONS.map((option) => {
                        const selected = option.locale === language;

                        return (
                          <button
                            key={option.locale}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => selectLanguage(option.locale)}
                            title={option.nativeLabel}
                            aria-label={option.nativeLabel}
                            className={`flex h-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.08em] transition ${
                              selected
                                ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
                                : "border-white/[0.06] bg-white/[0.025] text-white/58 hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
                            }`}
                          >
                            {option.shortLabel}
                          </button>
                        );
                      })}
                    </div>
'@

  $newDesktopList=@'
                    <div className="relative mb-2">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <input
                        value={languageSearch}
                        onChange={(event) => setLanguageSearch(event.target.value)}
                        placeholder="Find language"
                        autoComplete="off"
                        className="h-10 w-full rounded-xl border border-white/10 bg-[#091121] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/35"
                      />
                    </div>

                    <div className="max-h-[322px] space-y-1 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin]">
                      {filteredLanguageOptions.map((option) => {
                        const selected = option.locale === language;

                        return (
                          <button
                            key={option.locale}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => selectLanguage(option.locale)}
                            className={`flex h-11 w-full items-center rounded-xl px-3 text-left transition ${
                              selected
                                ? "bg-teal-400/18 text-white"
                                : "text-white/68 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span className="w-12 text-[13px] font-semibold tracking-[0.12em] text-white">
                              {option.shortLabel}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {option.nativeLabel}
                            </span>
                            {selected ? (
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                className="ml-3 h-4 w-4 text-emerald-300"
                              >
                                <path d="m5 12 4 4L19 6" />
                              </svg>
                            ) : null}
                          </button>
                        );
                      })}

                      {filteredLanguageOptions.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-white/38">
                          No languages found
                        </div>
                      ) : null}
                    </div>
'@

  $source=Replace-Exact `
    -Text $source `
    -Old $oldDesktopGrid `
    -New $newDesktopList `
    -Label "reference vertical language list"

  [IO.File]::WriteAllText(
    $Landing,
    $source,
    [Text.UTF8Encoding]::new($false)
  )

  $stdoutTemp=Join-Path $env:TEMP "s10_9x4_stdout_$stamp.txt"
  $stderrTemp=Join-Path $env:TEMP "s10_9x4_stderr_$stamp.txt"

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
    classification="LANDING_LANGUAGE_DROPDOWN_REFERENCE_STYLE_PASSED"
    landingComponentChanged=$true
    desktopVerticalList=$true
    languageSearch=$true
    activeRowHighlight=$true
    activeCheckmark=$true
    circularSelectionRemoved=$true
    internalScroll=$true
    buildPassed=$true
    productionMutation=$false
    vpsTouched=$false
    backupRoot=$BackupRoot
    buildLog=$BuildLog
    nextAction="RUN_DROPDOWN_VISUAL_QA"
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $RawPath -Encoding UTF8

@"
S10.9X4 LANDING LANGUAGE DROPDOWN REFERENCE STYLE
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_LANGUAGE_DROPDOWN_REFERENCE_STYLE_PASSED
LANDING_COMPONENT_CHANGED=True
DESKTOP_VERTICAL_LIST=True
LANGUAGE_SEARCH=True
ACTIVE_ROW_HIGHLIGHT=True
ACTIVE_CHECKMARK=True
CIRCULAR_SELECTION_REMOVED=True
INTERNAL_SCROLL=True
BUILD_PASSED=True
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
BACKUP_ROOT=$BackupRoot
BUILD_LOG=$BuildLog
RAW_JSON=$RawPath
NEXT_ACTION=RUN_DROPDOWN_VISUAL_QA
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

  Write-Host ""
  Write-Host "=== S10.9X4 COMPLETE ==="
  Write-Host "OK: True"
  Write-Host "Classification: LANDING_LANGUAGE_DROPDOWN_REFERENCE_STYLE_PASSED"
  Write-Host "Vertical list: True"
  Write-Host "Language search: True"
  Write-Host "Active row highlight: True"
  Write-Host "Active checkmark: True"
  Write-Host "Circular selection removed: True"
  Write-Host "Internal scroll: True"
  Write-Host "Build passed: True"
  Write-Host "Report: $ReportPath"
}
catch {
  if(Test-Path -LiteralPath $BackupLanding){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
  }

  throw
}
