param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$Landing=Join-Path $ProjectRoot "components\Landing.tsx"
$BackupRoot=Join-Path $ProjectRoot "PROJECT_STATE\S10_9X_language_dropdown_backup_$stamp"
$BackupLanding=Join-Path $BackupRoot "components\Landing.tsx"
$AuditDir=Join-Path $ProjectRoot "audit_exports"
$BuildLog=Join-Path $AuditDir "S10_9X_LANGUAGE_DROPDOWN_build_$stamp.txt"
$RawPath=Join-Path $AuditDir "S10_9X_LANGUAGE_DROPDOWN_raw_$stamp.json"
$ReportPath=Join-Path $AuditDir "S10_9X_LANGUAGE_DROPDOWN_report_$stamp.txt"

if(-not (Test-Path -LiteralPath $Landing)){
  throw "Missing Landing.tsx: $Landing"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BackupLanding) | Out-Null
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
Copy-Item -LiteralPath $Landing -Destination $BackupLanding -Force

$source=[IO.File]::ReadAllText($Landing)

function Require-Replace {
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
  $source=Require-Replace `
    -Text $source `
    -Old 'import { useEffect, useMemo, useState } from "react";' `
    -New 'import { useEffect, useMemo, useRef, useState } from "react";' `
    -Label "React useRef import"

  $navAnchor='const navKeys: PageKey[] = ["home", "desk", "product", "pricing", "team"];'

  $languageConstants=@'
const navKeys: PageKey[] = ["home", "desk", "product", "pricing", "team"];

const LANDING_LANGUAGE_OPTIONS: ReadonlyArray<{
  locale: Locale;
  shortLabel: string;
  nativeLabel: string;
}> = [
  { locale: "en", shortLabel: "EN", nativeLabel: "English" },
  { locale: "ru", shortLabel: "RU", nativeLabel: "Русский" },
  { locale: "uk", shortLabel: "UA", nativeLabel: "Українська" },
  { locale: "zh", shortLabel: "ZH", nativeLabel: "中文" },
  { locale: "de", shortLabel: "DE", nativeLabel: "Deutsch" },
  { locale: "fr", shortLabel: "FR", nativeLabel: "Français" },
  { locale: "es", shortLabel: "ES", nativeLabel: "Español" },
  { locale: "ar", shortLabel: "AR", nativeLabel: "العربية" },
  { locale: "it", shortLabel: "IT", nativeLabel: "Italiano" },
  { locale: "nb", shortLabel: "NO", nativeLabel: "Norsk" },
  { locale: "ka", shortLabel: "KA", nativeLabel: "ქართული" },
  { locale: "pl", shortLabel: "PL", nativeLabel: "Polski" },
  { locale: "tr", shortLabel: "TR", nativeLabel: "Türkçe" },
  { locale: "el", shortLabel: "EL", nativeLabel: "Ελληνικά" },
  { locale: "hi", shortLabel: "HI", nativeLabel: "हिन्दी" },
];

const LANDING_LANGUAGE_SHORT_LABEL: Record<Locale, string> =
  Object.fromEntries(
    LANDING_LANGUAGE_OPTIONS.map(({ locale, shortLabel }) => [
      locale,
      shortLabel,
    ]),
  ) as Record<Locale, string>;
'@

  $source=Require-Replace `
    -Text $source `
    -Old $navAnchor `
    -New $languageConstants `
    -Label "language constants"

  $source=Require-Replace `
    -Text $source `
    -Old '  const [menuOpen, setMenuOpen] = useState(false);' `
    -New @'
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
'@ `
    -Label "language menu state"

  $savedLocaleEffect=@'
  useEffect(() => {
    const savedLocale = getSavedLocale();
    setLanguage(savedLocale);
    applyDocumentLocale(savedLocale);
  }, []);
'@

  $savedLocaleReplacement=@'
  useEffect(() => {
    const savedLocale = getSavedLocale();
    setLanguage(savedLocale);
    applyDocumentLocale(savedLocale);
  }, []);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setLanguageMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [languageMenuOpen]);
'@

  $source=Require-Replace `
    -Text $source `
    -Old $savedLocaleEffect `
    -New $savedLocaleReplacement `
    -Label "outside-click effect"

  $cyclePattern='(?s)  const cycle = \(\) => \{\s*const nextLanguage = getNextLandingLocale\(language\);\s*setLanguage\(nextLanguage\);\s*saveLocale\(nextLanguage\);\s*\};'

  if(-not [regex]::IsMatch($source,$cyclePattern)){
    throw "Anchor not found: cycle function"
  }

  $selectLanguage=@'
  const selectLanguage = (nextLanguage: Locale) => {
    setLanguage(nextLanguage);
    saveLocale(nextLanguage);
    applyDocumentLocale(nextLanguage);
    setLanguageMenuOpen(false);
    setMenuOpen(false);
  };
'@

  $source=[regex]::Replace($source,$cyclePattern,$selectLanguage,1)

  $desktopOld=@'
          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={cycle}
              className="flex h-11 min-w-[58px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              <Icon name="globe" className="mr-2 h-4 w-4" />
              {t.lang}
            </button>
'@

  $desktopNew=@'
          <div className="hidden items-center gap-3 md:flex">
            <div ref={languageMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setLanguageMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={languageMenuOpen}
                aria-label="Choose language"
                className={`flex h-11 min-w-[78px] items-center justify-center rounded-full border px-4 text-sm font-medium text-white transition ${
                  languageMenuOpen
                    ? "border-emerald-300/35 bg-white/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
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
              </button>

              <AnimatePresence>
                {languageMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    role="listbox"
                    aria-label="Languages"
                    className="absolute right-0 top-[calc(100%+12px)] z-[80] w-[300px] overflow-hidden rounded-3xl border border-white/12 bg-[#0B1725]/98 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
                  >
                    <div className="grid max-h-[360px] grid-cols-2 gap-1 overflow-y-auto p-1">
                      {LANDING_LANGUAGE_OPTIONS.map((option) => {
                        const selected = option.locale === language;

                        return (
                          <button
                            key={option.locale}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => selectLanguage(option.locale)}
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
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
'@

  $source=Require-Replace `
    -Text $source `
    -Old $desktopOld `
    -New $desktopNew `
    -Label "desktop language control"

  $mobileOld=@'
                <button onClick={cycle} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75">
                  {t.switchLanguage}: {language.toUpperCase()}
                </button>
'@

  $mobileNew=@'
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                  <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
                    Language
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {LANDING_LANGUAGE_OPTIONS.map((option) => {
                      const selected = option.locale === language;

                      return (
                        <button
                          key={option.locale}
                          type="button"
                          onClick={() => selectLanguage(option.locale)}
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
                        </button>
                      );
                    })}
                  </div>
                </div>
'@

  $source=Require-Replace `
    -Text $source `
    -Old $mobileOld `
    -New $mobileNew `
    -Label "mobile language control"

  [IO.File]::WriteAllText($Landing,$source,[Text.UTF8Encoding]::new($false))

  Push-Location $ProjectRoot
  try {
    $buildOutput = & cmd.exe /d /s /c "npm run build" 2>&1
    $buildExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  $buildOutput | Set-Content -LiteralPath $BuildLog -Encoding UTF8

  if($buildExit -ne 0){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
    throw "Build failed; Landing.tsx restored. See $BuildLog"
  }

  $raw=[ordered]@{
    ok=$true
    classification="LANDING_LANGUAGE_DROPDOWN_PASSED"
    landingComponentChanged=$true
    desktopDropdown=$true
    mobileLanguageGrid=$true
    outsideClickClose=$true
    escapeClose=$true
    nativeLanguageNames=$true
    localePersistence=$true
    documentLocaleApplied=$true
    buildPassed=$true
    productionMutation=$false
    vpsTouched=$false
    backupRoot=$BackupRoot
    buildLog=$BuildLog
    nextAction="REBUILD_AND_QA_ALL_TRANSLATION_DICTIONARIES"
  }

  $raw | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $RawPath -Encoding UTF8

@"
S10.9X LANDING LANGUAGE DROPDOWN
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_LANGUAGE_DROPDOWN_PASSED
LANDING_COMPONENT_CHANGED=True
DESKTOP_DROPDOWN=True
MOBILE_LANGUAGE_GRID=True
OUTSIDE_CLICK_CLOSE=True
ESCAPE_CLOSE=True
NATIVE_LANGUAGE_NAMES=True
LOCALE_PERSISTENCE=True
DOCUMENT_LOCALE_APPLIED=True
BUILD_PASSED=True
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
BACKUP_ROOT=$BackupRoot
BUILD_LOG=$BuildLog
RAW_JSON=$RawPath
NEXT_ACTION=REBUILD_AND_QA_ALL_TRANSLATION_DICTIONARIES
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

  Write-Host ""
  Write-Host "=== S10.9X COMPLETE ==="
  Write-Host "OK: True"
  Write-Host "Classification: LANDING_LANGUAGE_DROPDOWN_PASSED"
  Write-Host "Desktop dropdown: True"
  Write-Host "Mobile language grid: True"
  Write-Host "Outside click close: True"
  Write-Host "Escape close: True"
  Write-Host "Build passed: True"
  Write-Host "Production mutation: False"
  Write-Host "VPS touched: False"
  Write-Host "Report: $ReportPath"
  Write-Host "Raw: $RawPath"
  Write-Host "Build log: $BuildLog"
  Write-Host "Next action: REBUILD_AND_QA_ALL_TRANSLATION_DICTIONARIES"
}
catch {
  if(Test-Path -LiteralPath $BackupLanding){
    Copy-Item -LiteralPath $BackupLanding -Destination $Landing -Force
  }

  throw
}
