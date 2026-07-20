[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Get-RelativePathSafe([string]$BasePath, [string]$TargetPath) {
    try {
        return [System.IO.Path]::GetRelativePath($BasePath, $TargetPath)
    }
    catch {
        return $TargetPath
    }
}

function Get-FileSha256([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function ConvertTo-HashtableDeep {
    param([Parameter(ValueFromPipeline = $true)]$InputObject)

    if ($null -eq $InputObject) { return $null }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        foreach ($key in $InputObject.Keys) {
            $result[$key] = ConvertTo-HashtableDeep $InputObject[$key]
        }
        return $result
    }

    if ($InputObject -is [pscustomobject]) {
        $result = [ordered]@{}
        foreach ($prop in $InputObject.PSObject.Properties) {
            $result[$prop.Name] = ConvertTo-HashtableDeep $prop.Value
        }
        return $result
    }

    if (($InputObject -is [System.Collections.IEnumerable]) -and
        -not ($InputObject -is [string])) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += ,(ConvertTo-HashtableDeep $item)
        }
        return $items
    }

    return $InputObject
}

function Flatten-JsonStrings {
    param(
        [Parameter(Mandatory = $true)]$Node,
        [string]$Path = ""
    )

    $rows = New-Object System.Collections.Generic.List[object]

    if ($Node -is [System.Collections.IDictionary]) {
        foreach ($key in $Node.Keys) {
            $nextPath = if ([string]::IsNullOrWhiteSpace($Path)) {
                [string]$key
            } else {
                "$Path.$key"
            }

            foreach ($row in (Flatten-JsonStrings -Node $Node[$key] -Path $nextPath)) {
                $rows.Add($row)
            }
        }
        return $rows
    }

    if (($Node -is [System.Collections.IEnumerable]) -and
        -not ($Node -is [string])) {
        $index = 0
        foreach ($item in $Node) {
            $nextPath = "$Path[$index]"
            foreach ($row in (Flatten-JsonStrings -Node $item -Path $nextPath)) {
                $rows.Add($row)
            }
            $index++
        }
        return $rows
    }

    if ($Node -is [string]) {
        $rows.Add([pscustomobject]@{
            path = $Path
            text = $Node
        })
    }

    return $rows
}

function Get-TopSection([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return "unknown" }
    $first = ($Path -split '\.|\[')[0]
    if ([string]::IsNullOrWhiteSpace($first)) { return "unknown" }
    return $first
}

function Get-ComponentRole([string]$Path, [string]$Text) {
    $p = $Path.ToLowerInvariant()

    if ($p -match 'button|cta|action') { return "button" }
    if ($p -match 'title|heading|headline|hero') { return "heading" }
    if ($p -match 'subtitle|description|body|copy') { return "body_copy" }
    if ($p -match 'label|badge|status') { return "label_or_status" }
    if ($p -match 'placeholder') { return "input_placeholder" }
    if ($p -match 'tooltip|hint|help') { return "tooltip" }
    if ($p -match 'feature') { return "feature_text" }
    if ($p -match 'price|billing|period|plan') { return "pricing" }
    if ($p -match 'footer') { return "footer" }
    if ($p -match 'nav|menu') { return "navigation" }

    if ($Text.Length -le 24) { return "short_ui_text" }
    return "body_copy"
}

function Get-TranslateMode([string]$Path, [string]$Text, [string[]]$ProtectedExact) {
    if ($ProtectedExact -contains $Text) { return "keep_exact" }

    $p = $Path.ToLowerInvariant()
    if ($p -match '(^|\.)(id|slug|code|locale|href|url|route)$') { return "technical_id" }
    if ($p -match 'setup|playbook') { return "setup_name" }
    if ($p -match 'plan.*name|pricing.*name') { return "plan_name" }
    if ($p -match 'brand') { return "brand_name" }

    $containsProtected = $false
    foreach ($term in $ProtectedExact) {
        if ($term.Length -ge 2 -and $Text.IndexOf($term, [System.StringComparison]::Ordinal) -ge 0) {
            $containsProtected = $true
            break
        }
    }

    if ($containsProtected) { return "translate_but_preserve_terms" }
    return "translate"
}

function Get-NeighborTexts {
    param(
        [Parameter(Mandatory = $true)][object[]]$Rows,
        [Parameter(Mandatory = $true)][int]$Index
    )

    $neighbors = New-Object System.Collections.Generic.List[string]
    foreach ($offset in @(-2, -1, 1, 2)) {
        $i = $Index + $offset
        if ($i -ge 0 -and $i -lt $Rows.Count) {
            $candidate = [string]$Rows[$i].text
            if (-not [string]::IsNullOrWhiteSpace($candidate)) {
                $neighbors.Add($candidate)
            }
        }
    }
    return $neighbors.ToArray()
}

function Find-AstPathFromMap {
    param(
        [Parameter(Mandatory = $true)]$PathMap,
        [Parameter(Mandatory = $true)][string]$CanonicalPath,
        [Parameter(Mandatory = $true)][string]$EnglishText
    )

    if ($null -eq $PathMap) { return $CanonicalPath }

    # Direct property/key lookup.
    if ($PathMap -is [System.Collections.IDictionary]) {
        if ($PathMap.Contains($CanonicalPath)) {
            $value = $PathMap[$CanonicalPath]
            if ($value -is [string]) { return $value }
            if ($value -is [System.Collections.IDictionary]) {
                foreach ($candidateKey in @("astPath", "path", "sourcePath")) {
                    if ($value.Contains($candidateKey) -and $value[$candidateKey] -is [string]) {
                        return $value[$candidateKey]
                    }
                }
            }
        }

        # Search common mapping shapes without assuming one exact schema.
        foreach ($entry in $PathMap.GetEnumerator()) {
            $value = $entry.Value
            if ($value -is [System.Collections.IDictionary]) {
                $canonicalCandidate = $null
                $textCandidate = $null
                foreach ($candidateKey in @("canonicalKey", "key", "localeKey", "targetKey")) {
                    if ($value.Contains($candidateKey)) {
                        $canonicalCandidate = [string]$value[$candidateKey]
                        break
                    }
                }
                foreach ($candidateKey in @("englishText", "text", "sourceText")) {
                    if ($value.Contains($candidateKey)) {
                        $textCandidate = [string]$value[$candidateKey]
                        break
                    }
                }

                if ($canonicalCandidate -eq $CanonicalPath -or
                    ($textCandidate -eq $EnglishText -and $EnglishText.Length -gt 0)) {
                    foreach ($candidateKey in @("astPath", "path", "sourcePath")) {
                        if ($value.Contains($candidateKey) -and $value[$candidateKey] -is [string]) {
                            return $value[$candidateKey]
                        }
                    }
                    if ($entry.Key -is [string]) { return [string]$entry.Key }
                }
            }
        }
    }

    return $CanonicalPath
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $repo

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$auditDir = Join-Path $repo "audit_exports"
$stateDir = Join-Path $repo "PROJECT_STATE\i18n"
Ensure-Directory $auditDir
Ensure-Directory $stateDir

$reportPath = Join-Path $auditDir "S10_9Y1_TRANSLATION_CONTEXT_AUDIT_report_$timestamp.txt"
$rawPath = Join-Path $auditDir "S10_9Y1_TRANSLATION_CONTEXT_AUDIT_raw_$timestamp.json"
$buildPath = Join-Path $auditDir "S10_9Y1_TRANSLATION_CONTEXT_AUDIT_build_$timestamp.txt"

$contextPath = Join-Path $stateDir "landing_translation_context.json"
$glossaryPath = Join-Path $stateDir "landing_glossary.json"
$styleGuidePath = Join-Path $stateDir "landing_style_guide.md"

$landingPath = Join-Path $repo "components\Landing.tsx"
$enPath = Join-Path $repo "locales\landing-complete\en.json"
$pathMapPath = Join-Path $repo "locales\landing-complete\path-map.json"
$manifestPath = Join-Path $repo "locales\landing-complete\manifest.json"

$requiredFiles = @($landingPath, $enPath, $pathMapPath, $manifestPath)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required file not found: $file"
    }
}

Write-Step "A. Confirming S10.9X6 evidence"

$x6Files = Get-ChildItem -LiteralPath $auditDir -File |
    Where-Object { $_.Name -like "S10_9X6*" } |
    Sort-Object LastWriteTime -Descending

$x6Report = $x6Files | Where-Object { $_.Name -match '_report_' } | Select-Object -First 1
$x6Raw = $x6Files | Where-Object { $_.Name -match '_raw_' } | Select-Object -First 1
$x6Build = $x6Files | Where-Object { $_.Name -match '_build_' } | Select-Object -First 1

$x6CombinedText = ""
foreach ($f in @($x6Report, $x6Raw, $x6Build)) {
    if ($null -ne $f) {
        $x6CombinedText += "`n" + (Get-Content -LiteralPath $f.FullName -Raw)
    }
}

$x6Checks = [ordered]@{
    reportFound = ($null -ne $x6Report)
    rawFound = ($null -ne $x6Raw)
    buildFound = ($null -ne $x6Build)
    fixedHeight92 = ($x6CombinedText -match 'FIXED_HEIGHT_PX\s*[:=]\s*92|"fixedHeightPx"\s*:\s*92|height\s*:\s*92px')
    visibleRows2 = ($x6CombinedText -match 'VISIBLE_LANGUAGE_ROWS\s*[:=]\s*2|"visibleLanguageRows"\s*:\s*2')
    inlineOverflowControl = ($x6CombinedText -match 'INLINE_OVERFLOW_CONTROL\s*[:=]\s*True|"inlineOverflowControl"\s*:\s*true')
    scrollbarHidden = ($x6CombinedText -match 'SCROLLBAR_HIDDEN\s*[:=]\s*True|"scrollbarHidden"\s*:\s*true')
    buildPassed = ($x6CombinedText -match 'BUILD_PASSED\s*[:=]\s*True|"buildPassed"\s*:\s*true|Compiled successfully|Build completed')
}

Write-Step "B. Reading English master and path map"

$enObject = Get-Content -LiteralPath $enPath -Raw | ConvertFrom-Json
$enHashtable = ConvertTo-HashtableDeep $enObject
$pathMapObject = Get-Content -LiteralPath $pathMapPath -Raw | ConvertFrom-Json
$pathMapHashtable = ConvertTo-HashtableDeep $pathMapObject
$manifestObject = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifestHashtable = ConvertTo-HashtableDeep $manifestObject

$flatRows = @(Flatten-JsonStrings -Node $enHashtable)
if ($flatRows.Count -eq 0) {
    throw "No strings were found in English master: $enPath"
}

$protectedExact = @(
    "SkillEdge AI",
    "SkillEdge Core",
    "SkillEdge Edge",
    "SkillEdge Elite",
    "AI Trading Desk",
    "AI Alerts",
    "AI Coach",
    "AI Scanner",
    "AI Market Brief",
    "Market Intelligence",
    "Signal-to-Journal",
    "Personal Edge",
    "Strategy OS",
    "TradingView",
    "VWAP",
    "EMA20",
    "RVOL",
    "PnL",
    "TP1",
    "TP2",
    "RR",
    "CSV",
    "XLSX",
    "USDT",
    "TRC20",
    "Long",
    "Short"
)

$setupNames = @(
    "VWAP Reclaim Long",
    "VWAP Rejection Short",
    "Premarket Pump Short",
    "Gap and Crap Short",
    "Failed Breakout / Stuff",
    "Breakout Retest Long",
    "Pullback Continuation Long",
    "Opening Range Breakout",
    "Lower High Breakdown Short",
    "Liquidity Trap Reversal",
    "Crypto SMC Sweep + Reclaim"
)

$protectedExact += $setupNames
$protectedExact = @($protectedExact | Sort-Object -Unique)

Write-Step "C. Creating path-aware translation context"

$contextEntries = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $flatRows.Count; $i++) {
    $row = $flatRows[$i]
    $canonicalPath = [string]$row.path
    $englishText = [string]$row.text
    $astPath = Find-AstPathFromMap -PathMap $pathMapHashtable -CanonicalPath $canonicalPath -EnglishText $englishText
    $section = Get-TopSection $canonicalPath
    $role = Get-ComponentRole -Path $canonicalPath -Text $englishText
    $mode = Get-TranslateMode -Path $canonicalPath -Text $englishText -ProtectedExact $protectedExact
    $neighbors = Get-NeighborTexts -Rows $flatRows -Index $i

    $termsInText = New-Object System.Collections.Generic.List[string]
    foreach ($term in $protectedExact) {
        if ($term.Length -ge 2 -and $englishText.IndexOf($term, [System.StringComparison]::Ordinal) -ge 0) {
            $termsInText.Add($term)
        }
    }

    $notes = switch ($mode) {
        "keep_exact" { "Keep the complete value unchanged." }
        "technical_id" { "Technical value. Do not translate unless later manual audit explicitly reclassifies it." }
        "plan_name" { "Preserve official SkillEdge plan naming." }
        "setup_name" { "Preserve official trading setup/playbook name in English." }
        "brand_name" { "Preserve official brand/product name." }
        "translate_but_preserve_terms" { "Translate naturally while preserving protected terms exactly." }
        default { "Translate as premium financial SaaS copy. Preserve meaning, tone, numbers, placeholders and punctuation intent." }
    }

    $contextEntries.Add([ordered]@{
        canonicalKey = $canonicalPath
        astPath = $astPath
        page = "landing"
        section = $section
        componentRole = $role
        englishText = $englishText
        neighborTexts = @($neighbors)
        translateMode = $mode
        protectedTerms = @($termsInText.ToArray() | Sort-Object -Unique)
        notes = $notes
    })
}

$contextDocument = [ordered]@{
    schemaVersion = "1.0"
    generatedAt = (Get-Date).ToString("o")
    source = [ordered]@{
        englishMaster = (Get-RelativePathSafe $repo $enPath)
        englishMasterSha256 = (Get-FileSha256 $enPath)
        pathMap = (Get-RelativePathSafe $repo $pathMapPath)
        pathMapSha256 = (Get-FileSha256 $pathMapPath)
        manifest = (Get-RelativePathSafe $repo $manifestPath)
        landingComponent = (Get-RelativePathSafe $repo $landingPath)
        landingComponentSha256 = (Get-FileSha256 $landingPath)
    }
    rules = [ordered]@{
        defaultLocale = "en"
        canonicalLocales = @("en","ru","uk","zh","de","fr","es","ar","it","nb","ka","pl","tr","el","hi")
        aliases = [ordered]@{ ua = "uk"; no = "nb" }
        rtlLocales = @("ar")
        runtimeAiTranslationAllowed = $false
    }
    entries = $contextEntries.ToArray()
}

$contextDocument | ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $contextPath -Encoding UTF8

Write-Step "D. Creating project glossary and style guide"

$glossary = [ordered]@{
    schemaVersion = "1.0"
    generatedAt = (Get-Date).ToString("o")
    project = "SkillEdge AI / UpYourSkills"
    defaultRules = [ordered]@{
        preserveBrandCase = $true
        preservePlaceholders = $true
        preserveNumbersAndPrices = $true
        noProfitGuarantees = $true
        noRuntimeTranslation = $true
        nativeFinancialSaaSTone = $true
    }
    protectedExact = $protectedExact
    setupNames = $setupNames
    contextualTerms = @(
        [ordered]@{
            source = "Watch"
            guidance = "Translate by UI role. Signal status should mean under observation, never the verb 'to watch'. Watchlist should mean a list of monitored instruments."
        },
        [ordered]@{
            source = "Armed"
            guidance = "For a trading signal lifecycle, express readiness for entry/trigger confirmation. Never use a literal military translation."
        },
        [ordered]@{
            source = "Active"
            guidance = "Translate by object: active trade, active signal, active plan, or enabled feature."
        },
        [ordered]@{
            source = "Setup"
            guidance = "Preserve official setup names in English. In explanatory prose, use the natural local trading term appropriate for the locale."
        },
        [ordered]@{
            source = "Signal"
            guidance = "Use the established local financial/trading term. Distinguish a trading signal from a notification or status."
        },
        [ordered]@{
            source = "Edge"
            guidance = "Never translate inside SkillEdge Edge or Personal Edge. Translate only when it is ordinary prose and context clearly requires it."
        }
    )
    localeSpecificRules = [ordered]@{
        ru = @(
            "Use natural professional Russian.",
            "Do not use Ukrainian letters і, ї, є, ґ.",
            "Avoid literal English word order and awkward calques."
        )
        uk = @(
            "Use natural professional Ukrainian.",
            "Do not use Russian letters ы, э, ё, ъ.",
            "Use Ukrainian financial and SaaS terminology consistently."
        )
        de = @(
            "Prefer concise professional German to reduce UI overflow.",
            "Avoid unnecessary nominal compounds when a shorter natural phrase is available."
        )
        ar = @(
            "Use Modern Standard Arabic suitable for professional financial software.",
            "Keep protected Latin trading terms exactly.",
            "Assume RTL layout and avoid punctuation patterns that render poorly."
        )
        zh = @(
            "Use concise Simplified Chinese suitable for premium financial SaaS.",
            "Preserve protected Latin trading abbreviations and product names."
        )
    }
}

$glossary | ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $glossaryPath -Encoding UTF8

$styleGuide = @"
# SkillEdge AI Landing Localization Style Guide

## Purpose

This guide defines the production localization standard for the SkillEdge AI / UpYourSkills landing experience.

## Voice

- Professional, confident and precise.
- Premium financial SaaS tone.
- Clear to active traders without sounding academic.
- Avoid hype, slang, exaggerated certainty and literal machine-translation phrasing.
- Never promise profits, guaranteed results or risk-free trading.

## Meaning before wording

Translate the intended product meaning, not isolated dictionary definitions.

Examples:

- A lifecycle status named `Watch` means a setup is being monitored. It never means the action “look at”.
- `Armed` means that entry conditions are nearly ready or awaiting confirmation. Do not use military wording.
- `Edge` remains unchanged inside official product and plan names.
- Official trading setup/playbook names remain in English.

## Protected content

Preserve exactly:

- SkillEdge AI
- SkillEdge Core
- SkillEdge Edge
- SkillEdge Elite
- AI Trading Desk
- AI Alerts
- AI Coach
- AI Scanner
- AI Market Brief
- Market Intelligence
- Signal-to-Journal
- Personal Edge
- Strategy OS
- TradingView
- VWAP, EMA20, RVOL, PnL, TP1, TP2, RR
- CSV, XLSX, USDT, TRC20
- Official setup/playbook names

## Product claims

Allowed:

- Describes analysis, filtering, workflow, context, decision support and risk controls.
- States what the software does or helps the user do.

Not allowed:

- Guaranteed profits.
- Guaranteed win rate.
- “Always finds the best trade.”
- “Risk-free.”
- Any wording implying certainty of market outcomes.

## Formatting integrity

Preserve:

- Placeholders such as `{count}`, `{symbol}` and `%s`.
- Prices, currency symbols and billing periods.
- Numeric values.
- HTML entities and intentional punctuation.
- Brand capitalization.

## Locale quality

A valid JSON file is not evidence of a good translation.

Every production locale requires:

1. Context-aware draft.
2. Independent editorial review.
3. Deterministic validation.
4. Visual QA on desktop, tablet and mobile.
5. Targeted human review for suspicious or high-impact strings.

## Pilot locales

The first production pilot is:

- ru
- uk
- de
- ar
- zh

Only after the pilot passes linguistic and visual QA should the remaining locales be rebuilt.
"@

Set-Content -LiteralPath $styleGuidePath -Value $styleGuide -Encoding UTF8

Write-Step "E. Auditing runtime references"

$landingText = Get-Content -LiteralPath $landingPath -Raw
$runtimeReferenceChecks = [ordered]@{
    landingStructuredLocalesReferenced = ($landingText -match 'landing-structured-locales')
    completeBundleReferenced = ($landingText -match 'landing-complete')
    legacyLandingLocalesReferenced = ($landingText -match 'landing-locales')
    sharedStorageKeyReferenced = ($landingText -match 'skilledge_language')
    inlineHeight92Present = ($landingText -match 'height\s*:\s*["'']?92px')
    maxHeight92Present = ($landingText -match 'maxHeight\s*:\s*["'']?92px')
    overflowYAutoPresent = ($landingText -match 'overflowY\s*:\s*["'']auto')
}

$localeDir = Join-Path $repo "locales\landing-complete"
$localeFiles = Get-ChildItem -LiteralPath $localeDir -Filter "*.json" -File |
    Where-Object { $_.Name -notin @("path-map.json", "manifest.json") }

$localeAudit = New-Object System.Collections.Generic.List[object]
$englishPaths = @($flatRows.path | Sort-Object)
foreach ($localeFile in $localeFiles) {
    $localeObject = Get-Content -LiteralPath $localeFile.FullName -Raw | ConvertFrom-Json
    $localeHashtable = ConvertTo-HashtableDeep $localeObject
    $localeRows = @(Flatten-JsonStrings -Node $localeHashtable)
    $localePaths = @($localeRows.path | Sort-Object)

    $missingPaths = @($englishPaths | Where-Object { $_ -notin $localePaths })
    $extraPaths = @($localePaths | Where-Object { $_ -notin $englishPaths })
    $emptyValues = @($localeRows | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.text) })

    $localeAudit.Add([ordered]@{
        locale = [System.IO.Path]::GetFileNameWithoutExtension($localeFile.Name)
        stringCount = $localeRows.Count
        keyParityPassed = ($missingPaths.Count -eq 0 -and $extraPaths.Count -eq 0)
        missingPathCount = $missingPaths.Count
        extraPathCount = $extraPaths.Count
        emptyValueCount = $emptyValues.Count
        sha256 = Get-FileSha256 $localeFile.FullName
    })
}

$buildPassed = $null
$buildExitCode = $null
if (-not $SkipBuild) {
    Write-Step "F. Running npm build (no source mutation)"
    $buildOutput = & npm run build 2>&1 | Out-String
    $buildExitCode = $LASTEXITCODE
    $buildPassed = ($buildExitCode -eq 0)
    Set-Content -LiteralPath $buildPath -Value $buildOutput -Encoding UTF8

    if (-not $buildPassed) {
        Write-Warning "Build failed. Context/glossary outputs remain staged for inspection; no active locale or component was changed."
    }
}
else {
    Set-Content -LiteralPath $buildPath -Value "SKIPPED_BY_PARAMETER=True" -Encoding UTF8
}

$translateModeCounts = [ordered]@{}
foreach ($entry in $contextEntries) {
    $mode = [string]$entry.translateMode
    if (-not $translateModeCounts.Contains($mode)) {
        $translateModeCounts[$mode] = 0
    }
    $translateModeCounts[$mode]++
}

$raw = [ordered]@{
    stage = "S10.9Y1"
    name = "Translation Context Audit"
    generatedAt = (Get-Date).ToString("o")
    repoRoot = $repo
    mutationScope = @(
        (Get-RelativePathSafe $repo $contextPath),
        (Get-RelativePathSafe $repo $glossaryPath),
        (Get-RelativePathSafe $repo $styleGuidePath),
        (Get-RelativePathSafe $repo $reportPath),
        (Get-RelativePathSafe $repo $rawPath),
        (Get-RelativePathSafe $repo $buildPath)
    )
    activeRuntimeFilesChanged = $false
    x6Evidence = [ordered]@{
        report = if ($x6Report) { Get-RelativePathSafe $repo $x6Report.FullName } else { $null }
        raw = if ($x6Raw) { Get-RelativePathSafe $repo $x6Raw.FullName } else { $null }
        build = if ($x6Build) { Get-RelativePathSafe $repo $x6Build.FullName } else { $null }
        checks = $x6Checks
        formallyConfirmed = (
            $x6Checks.reportFound -and
            $x6Checks.rawFound -and
            $x6Checks.buildFound -and
            $x6Checks.fixedHeight92 -and
            $x6Checks.visibleRows2 -and
            $x6Checks.inlineOverflowControl -and
            $x6Checks.scrollbarHidden -and
            $x6Checks.buildPassed
        )
    }
    source = $contextDocument.source
    englishStringCount = $flatRows.Count
    contextEntryCount = $contextEntries.Count
    translateModeCounts = $translateModeCounts
    runtimeReferenceChecks = $runtimeReferenceChecks
    localeAudit = $localeAudit.ToArray()
    outputFiles = [ordered]@{
        context = Get-RelativePathSafe $repo $contextPath
        glossary = Get-RelativePathSafe $repo $glossaryPath
        styleGuide = Get-RelativePathSafe $repo $styleGuidePath
        report = Get-RelativePathSafe $repo $reportPath
        raw = Get-RelativePathSafe $repo $rawPath
        build = Get-RelativePathSafe $repo $buildPath
    }
    build = [ordered]@{
        skipped = [bool]$SkipBuild
        passed = $buildPassed
        exitCode = $buildExitCode
    }
}

$raw | ConvertTo-Json -Depth 30 |
    Set-Content -LiteralPath $rawPath -Encoding UTF8

$allLocaleParityPassed = (@($localeAudit | Where-Object { -not $_.keyParityPassed }).Count -eq 0)
$allLocalesNonEmpty = (@($localeAudit | Where-Object { $_.emptyValueCount -gt 0 }).Count -eq 0)

$reportLines = @(
    "S10_9Y1_TRANSLATION_CONTEXT_AUDIT_COMPLETE"
    "GENERATED_AT=$((Get-Date).ToString("o"))"
    "ACTIVE_RUNTIME_FILES_CHANGED=False"
    "ENGLISH_STRING_COUNT=$($flatRows.Count)"
    "CONTEXT_ENTRY_COUNT=$($contextEntries.Count)"
    "LOCALE_FILES_AUDITED=$($localeAudit.Count)"
    "ALL_LOCALE_KEY_PARITY_PASSED=$allLocaleParityPassed"
    "ALL_LOCALES_NON_EMPTY=$allLocalesNonEmpty"
    "X6_REPORT_FOUND=$($x6Checks.reportFound)"
    "X6_RAW_FOUND=$($x6Checks.rawFound)"
    "X6_BUILD_FOUND=$($x6Checks.buildFound)"
    "X6_FIXED_HEIGHT_92=$($x6Checks.fixedHeight92)"
    "X6_VISIBLE_ROWS_2=$($x6Checks.visibleRows2)"
    "X6_INLINE_OVERFLOW_CONTROL=$($x6Checks.inlineOverflowControl)"
    "X6_SCROLLBAR_HIDDEN=$($x6Checks.scrollbarHidden)"
    "X6_BUILD_PASSED=$($x6Checks.buildPassed)"
    "X6_FORMALLY_CONFIRMED=$($raw.x6Evidence.formallyConfirmed)"
    "STRUCTURED_LOADER_REFERENCE=$($runtimeReferenceChecks.landingStructuredLocalesReferenced)"
    "SHARED_STORAGE_KEY_REFERENCE=$($runtimeReferenceChecks.sharedStorageKeyReferenced)"
    "BUILD_SKIPPED=$([bool]$SkipBuild)"
    "BUILD_PASSED=$buildPassed"
    "CONTEXT_FILE=$(Get-RelativePathSafe $repo $contextPath)"
    "GLOSSARY_FILE=$(Get-RelativePathSafe $repo $glossaryPath)"
    "STYLE_GUIDE_FILE=$(Get-RelativePathSafe $repo $styleGuidePath)"
    "RAW_FILE=$(Get-RelativePathSafe $repo $rawPath)"
    "BUILD_FILE=$(Get-RelativePathSafe $repo $buildPath)"
)

Set-Content -LiteralPath $reportPath -Value $reportLines -Encoding UTF8

Write-Step "Completed"
$reportLines | ForEach-Object { Write-Host $_ }

Write-Host "`nEvidence files:" -ForegroundColor Green
Write-Host $reportPath
Write-Host $rawPath
Write-Host $buildPath
Write-Host "`nGenerated localization specification:" -ForegroundColor Green
Write-Host $contextPath
Write-Host $glossaryPath
Write-Host $styleGuidePath

if (-not $SkipBuild -and -not $buildPassed) {
    exit 2
}
