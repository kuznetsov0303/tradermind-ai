[CmdletBinding()]
param(
    [string]$RepoRoot = "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai",

    [ValidateSet("Prepare","Validate","Promote")]
    [string]$Action = "Prepare",

    [ValidateSet("all","ru","uk","de","ar","zh")]
    [string]$Locale = "all",

    [switch]$Execute
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
        return $rows.ToArray()
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
        return $rows.ToArray()
    }

    if ($Node -is [string]) {
        $rows.Add([pscustomobject]@{
            path = $Path
            text = $Node
        })
    }

    return $rows.ToArray()
}

function Get-PathTokens([string]$Path) {
    $tokens = New-Object System.Collections.Generic.List[object]
    $pattern = '([^. \[\]]+)|\[(\d+)\]'
    foreach ($match in [regex]::Matches($Path, $pattern)) {
        if ($match.Groups[2].Success) {
            $tokens.Add([int]$match.Groups[2].Value)
        }
        else {
            $tokens.Add([string]$match.Groups[1].Value)
        }
    }
    return $tokens.ToArray()
}

function Set-PathStringValue {
    param(
        [Parameter(Mandatory = $true)]$Root,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $tokens = Get-PathTokens $Path
    if ($tokens.Count -eq 0) {
        throw "Invalid canonical path: $Path"
    }

    $current = $Root
    for ($i = 0; $i -lt $tokens.Count - 1; $i++) {
        $token = $tokens[$i]
        if ($token -is [int]) {
            $current = $current[$token]
        }
        else {
            $current = $current[$token]
        }
    }

    $last = $tokens[$tokens.Count - 1]
    if ($last -is [int]) {
        $current[$last] = $Value
    }
    else {
        $current[$last] = $Value
    }
}

function Get-Placeholders([string]$Text) {
    $patterns = @(
        '\{[A-Za-z0-9_.-]+\}',
        '%[sdif]',
        '\$\{[^}]+\}'
    )

    $items = New-Object System.Collections.Generic.List[string]
    foreach ($pattern in $patterns) {
        foreach ($m in [regex]::Matches($Text, $pattern)) {
            $items.Add($m.Value)
        }
    }
    return @($items.ToArray() | Sort-Object -Unique)
}

function Get-LocaleInstructions([string]$LocaleCode) {
    switch ($LocaleCode) {
        "ru" {
            return @(
                "Write natural professional Russian for a premium trading SaaS.",
                "Do not use Ukrainian letters і, ї, є, ґ.",
                "Avoid literal English word order, clumsy calques and hype.",
                "Use established Russian trading terminology consistently."
            )
        }
        "uk" {
            return @(
                "Write natural professional Ukrainian for a premium trading SaaS.",
                "Do not use Russian letters ы, э, ё, ъ.",
                "Avoid literal English word order and Russian calques.",
                "Use established Ukrainian financial terminology consistently."
            )
        }
        "de" {
            return @(
                "Write concise professional German suitable for financial software.",
                "Prefer shorter natural UI wording when meaning remains precise.",
                "Avoid unnecessary compounds and literal English syntax."
            )
        }
        "ar" {
            return @(
                "Write Modern Standard Arabic suitable for professional financial software.",
                "Assume RTL rendering.",
                "Keep protected Latin brands, abbreviations and setup names exactly.",
                "Avoid punctuation structures that render poorly in RTL."
            )
        }
        "zh" {
            return @(
                "Write concise Simplified Chinese suitable for premium financial SaaS.",
                "Keep protected Latin brands, abbreviations and setup names exactly.",
                "Avoid verbose explanatory wording in short UI elements."
            )
        }
        default {
            throw "Unsupported pilot locale: $LocaleCode"
        }
    }
}

function Read-JsonHashtable([string]$Path) {
    return ConvertTo-HashtableDeep (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Depth = 30
    )

    $Value | ConvertTo-Json -Depth $Depth |
        Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-TaskMap($Tasks) {
    $map = @{}
    foreach ($task in $Tasks) {
        $map[[string]$task.canonicalKey] = $task
    }
    return $map
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $repo

$stateDir = Join-Path $repo "PROJECT_STATE\i18n"
$workbenchRoot = Join-Path $stateDir "workbench"
$auditDir = Join-Path $repo "audit_exports"
Ensure-Directory $workbenchRoot
Ensure-Directory $auditDir

$contextPath = Join-Path $stateDir "landing_translation_context.json"
$glossaryPath = Join-Path $stateDir "landing_glossary.json"
$styleGuidePath = Join-Path $stateDir "landing_style_guide.md"
$englishPath = Join-Path $repo "locales\landing-complete\en.json"

foreach ($required in @($contextPath,$glossaryPath,$styleGuidePath,$englishPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required S10.9Y1 artifact not found: $required"
    }
}

$pilotLocales = if ($Locale -eq "all") {
    @("ru","uk","de","ar","zh")
}
else {
    @($Locale)
}

$contextDoc = Read-JsonHashtable $contextPath
$glossary = Read-JsonHashtable $glossaryPath
$englishTree = Read-JsonHashtable $englishPath
$styleGuide = Get-Content -LiteralPath $styleGuidePath -Raw
$contextEntries = @($contextDoc.entries)

if ($contextEntries.Count -eq 0) {
    throw "Translation context contains no entries."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$globalResults = New-Object System.Collections.Generic.List[object]

foreach ($localeCode in $pilotLocales) {
    $localeDir = Join-Path $workbenchRoot $localeCode
    Ensure-Directory $localeDir

    $activeLocalePath = Join-Path $repo "locales\landing-complete\$localeCode.json"
    if (-not (Test-Path -LiteralPath $activeLocalePath)) {
        throw "Active locale file not found: $activeLocalePath"
    }

    $tasksPath = Join-Path $localeDir "translation_tasks.json"
    $promptPath = Join-Path $localeDir "translator_prompt.md"
    $editorPromptPath = Join-Path $localeDir "editor_prompt.md"
    $schemaPath = Join-Path $localeDir "final_output_schema.json"
    $finalPath = Join-Path $localeDir "final.json"
    $validationPath = Join-Path $localeDir "validation_report.json"

    if ($Action -eq "Prepare") {
        Write-Step "Preparing pilot package: $localeCode"

        $currentTree = Read-JsonHashtable $activeLocalePath
        $currentRows = @(Flatten-JsonStrings -Node $currentTree)
        $currentMap = @{}
        foreach ($row in $currentRows) {
            $currentMap[[string]$row.path] = [string]$row.text
        }

        $tasks = New-Object System.Collections.Generic.List[object]

        foreach ($entry in $contextEntries) {
            $key = [string]$entry.canonicalKey
            $englishText = [string]$entry.englishText
            $currentTranslation = if ($currentMap.ContainsKey($key)) {
                [string]$currentMap[$key]
            }
            else {
                ""
            }

            $tasks.Add([ordered]@{
                canonicalKey = $key
                page = [string]$entry.page
                section = [string]$entry.section
                componentRole = [string]$entry.componentRole
                englishText = $englishText
                currentTranslation = $currentTranslation
                neighborTexts = @($entry.neighborTexts)
                translateMode = [string]$entry.translateMode
                protectedTerms = @($entry.protectedTerms)
                placeholders = @(Get-Placeholders $englishText)
                notes = [string]$entry.notes
            })
        }

        $package = [ordered]@{
            schemaVersion = "1.0"
            stage = "S10.9Y2"
            locale = $localeCode
            generatedAt = (Get-Date).ToString("o")
            status = "READY_FOR_CONTEXTUAL_TRANSLATION"
            instructions = @(Get-LocaleInstructions $localeCode)
            protectedExact = @($glossary.protectedExact)
            contextualTerms = @($glossary.contextualTerms)
            tasks = $tasks.ToArray()
        }

        Write-JsonFile -Value $package -Path $tasksPath

        $localeInstructionsText = (Get-LocaleInstructions $localeCode) -join "`n- "
        $translatorPrompt = @"
# SkillEdge AI — Contextual Translator Prompt

You are the senior localization translator for SkillEdge AI, a premium financial SaaS for active traders.

Target locale: **$localeCode**

## Mandatory locale rules

- $localeInstructionsText

## Global rules

$styleGuide

## Input

Read `translation_tasks.json`.

Each task contains:

- `canonicalKey`
- page and section
- component role
- English source
- current translation
- neighboring English strings
- translation mode
- protected terms
- placeholders
- contextual notes

## Translation modes

- `translate`: translate naturally.
- `translate_but_preserve_terms`: translate naturally but preserve every protected term exactly.
- `keep_exact`: output the English value unchanged.
- `brand_name`: preserve official brand naming.
- `plan_name`: preserve official plan naming.
- `setup_name`: preserve official setup/playbook naming.
- `technical_id`: preserve unchanged.

## Output contract

Create `draft.json` in this locale directory.

It must be one JSON object:

```json
{
  "canonical.path": "translated value"
}
```

Requirements:

1. Exactly one value for every task.
2. No missing or extra keys.
3. Preserve placeholders exactly.
4. Preserve protected terms exactly.
5. Do not edit active locale files.
6. Do not include explanations inside translation values.
7. Never promise profits or guaranteed outcomes.
"@

        Set-Content -LiteralPath $promptPath -Value $translatorPrompt -Encoding UTF8

        $editorPrompt = @"
# SkillEdge AI — Independent Localization Editor Prompt

You are the independent head of localization reviewing a draft for locale **$localeCode**.

Read:

- `translation_tasks.json`
- `draft.json`
- the project glossary and style guide referenced by the package

Your role is not to translate mechanically. Your role is to make every line sound native, precise and appropriate for premium trading software.

Check:

1. Meaning is faithful to the English source.
2. Wording is natural in the target locale.
3. Trading terminology is professionally correct.
4. UI labels are concise.
5. Marketing copy is confident but not exaggerated.
6. Protected terms and placeholders are unchanged.
7. Neighboring strings are stylistically consistent.
8. No mixed-language residue exists except protected terms.
9. No guaranteed-profit language exists.
10. The same concept uses the same translation across the full locale.

Write the reviewed result to `final.json`.

Output only one JSON object:

```json
{
  "canonical.path": "final reviewed value"
}
```

Do not modify active locale files.
"@

        Set-Content -LiteralPath $editorPromptPath -Value $editorPrompt -Encoding UTF8

        $schema = [ordered]@{
            type = "object"
            description = "Canonical path to final reviewed translation."
            requiredKeyCount = $tasks.Count
            additionalProperties = [ordered]@{
                type = "string"
                minLength = 1
            }
        }
        Write-JsonFile -Value $schema -Path $schemaPath

        $globalResults.Add([ordered]@{
            locale = $localeCode
            action = "Prepare"
            passed = $true
            taskCount = $tasks.Count
            workbench = $localeDir
            activeLocaleChanged = $false
        })
        continue
    }

    if (-not (Test-Path -LiteralPath $tasksPath)) {
        throw "Prepare package first: $tasksPath"
    }
    if (-not (Test-Path -LiteralPath $finalPath)) {
        throw "Reviewed final file not found: $finalPath"
    }

    Write-Step "Validating reviewed locale: $localeCode"

    $taskPackage = Read-JsonHashtable $tasksPath
    $tasks = @($taskPackage.tasks)
    $taskMap = Get-TaskMap $tasks
    $finalObject = Read-JsonHashtable $finalPath

    $expectedKeys = @($taskMap.Keys | Sort-Object)
    $actualKeys = @($finalObject.Keys | Sort-Object)

    $missingKeys = @($expectedKeys | Where-Object { $_ -notin $actualKeys })
    $extraKeys = @($actualKeys | Where-Object { $_ -notin $expectedKeys })
    $emptyKeys = New-Object System.Collections.Generic.List[string]
    $placeholderIssues = New-Object System.Collections.Generic.List[object]
    $protectedTermIssues = New-Object System.Collections.Generic.List[object]
    $localeScriptIssues = New-Object System.Collections.Generic.List[object]
    $identicalTranslated = New-Object System.Collections.Generic.List[string]

    foreach ($key in $expectedKeys) {
        if (-not $finalObject.Contains($key)) { continue }

        $value = [string]$finalObject[$key]
        $task = $taskMap[$key]
        $englishText = [string]$task.englishText
        $mode = [string]$task.translateMode

        if ([string]::IsNullOrWhiteSpace($value)) {
            $emptyKeys.Add($key)
            continue
        }

        $expectedPlaceholders = @(Get-Placeholders $englishText)
        $actualPlaceholders = @(Get-Placeholders $value)
        $missingPlaceholders = @($expectedPlaceholders | Where-Object { $_ -notin $actualPlaceholders })
        $extraPlaceholders = @($actualPlaceholders | Where-Object { $_ -notin $expectedPlaceholders })

        if ($missingPlaceholders.Count -gt 0 -or $extraPlaceholders.Count -gt 0) {
            $placeholderIssues.Add([ordered]@{
                canonicalKey = $key
                missing = $missingPlaceholders
                extra = $extraPlaceholders
            })
        }

        foreach ($term in @($task.protectedTerms)) {
            $termText = [string]$term
            if ($termText.Length -gt 0 -and
                $value.IndexOf($termText, [System.StringComparison]::Ordinal) -lt 0) {
                $protectedTermIssues.Add([ordered]@{
                    canonicalKey = $key
                    missingProtectedTerm = $termText
                })
            }
        }

        if ($mode -eq "keep_exact" -and $value -cne $englishText) {
            $protectedTermIssues.Add([ordered]@{
                canonicalKey = $key
                keepExactMismatch = $true
                expected = $englishText
                actual = $value
            })
        }

        if ($mode -eq "translate" -and $value -ceq $englishText -and $englishText.Length -gt 3) {
            $identicalTranslated.Add($key)
        }

        if ($localeCode -eq "ru" -and $value -match '[іїєґІЇЄҐ]') {
            $localeScriptIssues.Add([ordered]@{
                canonicalKey = $key
                issue = "Ukrainian-specific letters detected in Russian locale."
            })
        }

        if ($localeCode -eq "uk" -and $value -match '[ыэёъЫЭЁЪ]') {
            $localeScriptIssues.Add([ordered]@{
                canonicalKey = $key
                issue = "Russian-specific letters detected in Ukrainian locale."
            })
        }
    }

    $validationPassed = (
        $missingKeys.Count -eq 0 -and
        $extraKeys.Count -eq 0 -and
        $emptyKeys.Count -eq 0 -and
        $placeholderIssues.Count -eq 0 -and
        $protectedTermIssues.Count -eq 0 -and
        $localeScriptIssues.Count -eq 0
    )

    $validation = [ordered]@{
        stage = "S10.9Y2"
        locale = $localeCode
        generatedAt = (Get-Date).ToString("o")
        passed = $validationPassed
        expectedKeyCount = $expectedKeys.Count
        actualKeyCount = $actualKeys.Count
        missingKeys = $missingKeys
        extraKeys = $extraKeys
        emptyKeys = $emptyKeys.ToArray()
        placeholderIssues = $placeholderIssues.ToArray()
        protectedTermIssues = $protectedTermIssues.ToArray()
        localeScriptIssues = $localeScriptIssues.ToArray()
        warnings = [ordered]@{
            identicalTranslateModeCount = $identicalTranslated.Count
            identicalTranslateModeKeys = $identicalTranslated.ToArray()
        }
        activeLocaleChanged = $false
    }

    Write-JsonFile -Value $validation -Path $validationPath

    if ($Action -eq "Validate") {
        $globalResults.Add([ordered]@{
            locale = $localeCode
            action = "Validate"
            passed = $validationPassed
            validationReport = $validationPath
            activeLocaleChanged = $false
        })
        continue
    }

    if ($Action -eq "Promote") {
        if (-not $Execute) {
            throw "Promotion requires explicit -Execute."
        }
        if (-not $validationPassed) {
            throw "Promotion blocked: validation failed for $localeCode. See $validationPath"
        }

        Write-Step "Promoting reviewed locale: $localeCode"

        $backupDir = Join-Path $auditDir "S10_9Y2_LOCALE_BACKUPS_$timestamp"
        Ensure-Directory $backupDir
        $backupPath = Join-Path $backupDir "$localeCode.json"
        Copy-Item -LiteralPath $activeLocalePath -Destination $backupPath -Force

        $promotedTree = Read-JsonHashtable $englishPath
        foreach ($key in $expectedKeys) {
            Set-PathStringValue -Root $promotedTree -Path $key -Value ([string]$finalObject[$key])
        }

        Write-JsonFile -Value $promotedTree -Path $activeLocalePath

        # Post-write parity verification.
        $postRows = @(Flatten-JsonStrings -Node (Read-JsonHashtable $activeLocalePath))
        if ($postRows.Count -ne $expectedKeys.Count) {
            Copy-Item -LiteralPath $backupPath -Destination $activeLocalePath -Force
            throw "Post-promotion parity failed. Original locale restored from backup."
        }

        $globalResults.Add([ordered]@{
            locale = $localeCode
            action = "Promote"
            passed = $true
            activeLocaleChanged = $true
            backup = $backupPath
            promotedFile = $activeLocalePath
        })
    }
}

$summaryPath = Join-Path $auditDir "S10_9Y2_LOCALIZATION_WORKBENCH_${Action}_$timestamp.json"
$summary = [ordered]@{
    stage = "S10.9Y2"
    action = $Action
    generatedAt = (Get-Date).ToString("o")
    execute = [bool]$Execute
    locales = $pilotLocales
    results = $globalResults.ToArray()
}
Write-JsonFile -Value $summary -Path $summaryPath

Write-Host "`nS10_9Y2_COMPLETE=True" -ForegroundColor Green
Write-Host "ACTION=$Action"
Write-Host "SUMMARY=$summaryPath"

if ($Action -eq "Prepare") {
    Write-Host "ACTIVE_LOCALES_CHANGED=False"
    Write-Host "NEXT=Create draft.json and final.json in each pilot locale workbench, then run -Action Validate."
}
elseif ($Action -eq "Validate") {
    $failed = @($globalResults.ToArray() | Where-Object { -not $_.passed })
    Write-Host "VALIDATION_FAILED_COUNT=$($failed.Count)"
    if ($failed.Count -gt 0) { exit 2 }
}
