$ErrorActionPreference = "Stop"

$target = Join-Path $PSScriptRoot "app\admin\page.tsx"

if (-not (Test-Path -LiteralPath $target)) {
    throw "Target file not found: $target"
}

$content = Get-Content -LiteralPath $target -Raw -Encoding UTF8
$original = $content
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$target.s10_9y4_backup_$timestamp"

function Replace-ExactlyOne {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Replacement
    )

    $regex = [regex]::new(
        $Pattern,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    $count = $regex.Matches($script:content).Count

    if ($count -ne 1) {
        throw "Replacement '$Name' expected exactly 1 match, found $count. Original file was not modified."
    }

    $script:content = $regex.Replace(
        $script:content,
        [System.Text.RegularExpressions.MatchEvaluator]{
            param($m)
            return $Replacement
        },
        1
    )

    Write-Host "[OK] $Name" -ForegroundColor Green
}

Replace-ExactlyOne `
    -Name "Pending amount description" `
    -Pattern '(label="Pending amount"\s*value=\{.*?\}\s*text=")[^"]*(")' `
    -Replacement @"
label="Pending amount"
            value={pendingAmountLabel}
            text="Total referral reward amount currently waiting for withdrawal review and processing."
"@

Replace-ExactlyOne `
    -Name "Total requests description" `
    -Pattern '(label="Total requests"\s*value=\{.*?\}\s*text=")[^"]*(")' `
    -Replacement @"
label="Total requests"
            value={String(allRequests.length)}
            text="Complete referral withdrawal request history, including pending, approved, paid and rejected requests."
"@

if ($content -eq $original) {
    throw "No changes were produced. Original file was not modified."
}

Copy-Item -LiteralPath $target -Destination $backup -Force

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)

Write-Host ""
Write-Host "Final Admin Hub text cleanup completed." -ForegroundColor Green
Write-Host "Modified file: $target"
Write-Host "Backup file:   $backup"
