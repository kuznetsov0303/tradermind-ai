[CmdletBinding()]
param(
    [string]$RepoRoot = "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Repair-Mojibake {
    param([Parameter(Mandatory = $true)][string]$Text)

    if ([string]::IsNullOrEmpty($Text)) {
        return $Text
    }

    # Fast exit for already-normal Cyrillic text.
    if ($Text -notmatch 'Р|С|вЂ|в„|в©|вЂ™') {
        return $Text
    }

    $cp1251 = [System.Text.Encoding]::GetEncoding(
        1251,
        [System.Text.EncoderFallback]::ExceptionFallback,
        [System.Text.DecoderFallback]::ExceptionFallback
    )
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $bytes = New-Object System.Collections.Generic.List[byte]

    foreach ($ch in $Text.ToCharArray()) {
        try {
            $encoded = $cp1251.GetBytes([string]$ch)
            foreach ($b in $encoded) {
                $bytes.Add($b)
            }
        }
        catch {
            $code = [int][char]$ch
            if ($code -le 255) {
                $bytes.Add([byte]$code)
            }
            else {
                return $Text
            }
        }
    }

    try {
        return $utf8.GetString($bytes.ToArray())
    }
    catch {
        return $Text
    }
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$ruDir = Join-Path $repo "PROJECT_STATE\i18n\workbench\ru"
$tasksPath = Join-Path $ruDir "translation_tasks.json"
$draftPath = Join-Path $ruDir "draft.json"
$reportPath = Join-Path $ruDir "draft_recovery_report.json"

if (-not (Test-Path -LiteralPath $tasksPath)) {
    throw "translation_tasks.json not found: $tasksPath"
}

$package = Get-Content -LiteralPath $tasksPath -Raw -Encoding UTF8 | ConvertFrom-Json
$draft = [ordered]@{}
$changed = New-Object System.Collections.Generic.List[object]
$unchanged = New-Object System.Collections.Generic.List[string]
$empty = New-Object System.Collections.Generic.List[string]

foreach ($task in @($package.tasks)) {
    $key = [string]$task.canonicalKey
    $english = [string]$task.englishText
    $mode = [string]$task.translateMode
    $current = [string]$task.currentTranslation

    if ($mode -eq "keep_exact") {
        $value = $english
    }
    else {
        $value = Repair-Mojibake -Text $current
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        $empty.Add($key)
        $value = $english
    }

    $draft[$key] = $value

    if ($value -cne $current) {
        $changed.Add([ordered]@{
            canonicalKey = $key
            before = $current
            after = $value
        })
    }
    else {
        $unchanged.Add($key)
    }
}

$draft | ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $draftPath -Encoding UTF8

$report = [ordered]@{
    stage = "S10.9Y2-RU-DRAFT-RECOVERY"
    generatedAt = (Get-Date).ToString("o")
    taskCount = @($package.tasks).Count
    draftKeyCount = $draft.Count
    repairedCount = $changed.Count
    unchangedCount = $unchanged.Count
    emptyFallbackCount = $empty.Count
    activeLocaleChanged = $false
    draftPath = $draftPath
    repairedSamples = @($changed.ToArray() | Select-Object -First 20)
    unchangedKeys = $unchanged.ToArray()
    emptyFallbackKeys = $empty.ToArray()
}

$report | ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ""
Write-Host "S10_9Y2_RU_DRAFT_RECOVERY_COMPLETE=True" -ForegroundColor Green
Write-Host "TASK_COUNT=$(@($package.tasks).Count)"
Write-Host "DRAFT_KEY_COUNT=$($draft.Count)"
Write-Host "REPAIRED_COUNT=$($changed.Count)"
Write-Host "EMPTY_FALLBACK_COUNT=$($empty.Count)"
Write-Host "ACTIVE_LOCALE_CHANGED=False"
Write-Host "DRAFT=$draftPath"
Write-Host "REPORT=$reportPath"
