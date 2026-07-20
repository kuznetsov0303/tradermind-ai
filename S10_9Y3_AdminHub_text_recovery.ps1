$ErrorActionPreference = "Stop"

$target = Join-Path $PSScriptRoot "app\admin\page.tsx"

if (-not (Test-Path -LiteralPath $target)) {
    throw "Target file not found: $target"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$target.s10_9y3_backup_$timestamp"

$content = Get-Content -LiteralPath $target -Raw -Encoding UTF8
$original = $content

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
    -Name "Control center description" `
    -Pattern '(<h1 className="mt-3 text-4xl font-black tracking-\[-0\.06em\] md:text-6xl">\s*Control center\s*</h1>\s*<p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/52">).*?(</p>)' `
    -Replacement @"
<h1 className="mt-3 text-4xl font-black tracking-[-0.06em] md:text-6xl">
                Control center
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/52">
                Manage client access, referral withdrawals, support operations, signal review, investor reporting and platform administration from one protected workspace.
              </p>
"@

Replace-ExactlyOne `
    -Name "Pending withdrawals description" `
    -Pattern '(label="Pending withdrawals"\s*value=\{String\(pendingRequests\.length\)\}\s*text=")[^"]*(")' `
    -Replacement @"
label="Pending withdrawals"
            value={String(pendingRequests.length)}
            text="Withdrawal requests waiting for administrative review and a final approve or reject decision."
"@

Replace-ExactlyOne `
    -Name "Referral Withdrawals description" `
    -Pattern '(title="Referral Withdrawals"\s*text=")[^"]*(")' `
    -Replacement @"
title="Referral Withdrawals"
            text="Review referral withdrawal requests, confirm eligible rewards, mark completed payouts as paid, or reject requests with a clear reason."
"@

Replace-ExactlyOne `
    -Name "Support Widget Chats description" `
    -Pattern '(title="Support Widget Chats"\s*text=")[^"]*(")' `
    -Replacement @"
title="Support Widget Chats"
            text="Review conversations submitted through the floating support assistant, continue active support sessions and resolve client requests from one workspace."
"@

Replace-ExactlyOne `
    -Name "Users and Subscriptions description" `
    -Pattern '(title="Users & Subscriptions"\s*text=")[^"]*(")' `
    -Replacement @"
title="Users & Subscriptions"
            text="Planned administration workspace for client accounts, subscription plans, demo access, activation history and account status management."
"@

Replace-ExactlyOne `
    -Name "Payments and Webhooks description" `
    -Pattern '(title="Payments & Webhooks"\s*text=")[^"]*(")' `
    -Replacement @"
title="Payments & Webhooks"
            text="Planned administration workspace for payment records, crypto invoices, webhook events, failed payments and referral reward calculations."
"@

Replace-ExactlyOne `
    -Name "Investor Dashboard description" `
    -Pattern '(<h3 className="text-\[22px\] font-black tracking-tight text-white">\s*Investor Dashboard\s*</h3>\s*<p className="mt-4 max-w-sm text-\[14px\] leading-6 text-slate-400">).*?(</p>)' `
    -Replacement @"
<h3 className="text-[22px] font-black tracking-tight text-white">
              Investor Dashboard
            </h3>

            <p className="mt-4 max-w-sm text-[14px] leading-6 text-slate-400">
              Transparent operating statistics for client-eligible signals, AI learning, win rate, PnL simulation, strategy evidence, production readiness and platform accountability.
            </p>
"@

Replace-ExactlyOne `
    -Name "Admin Access description" `
    -Pattern '(title="Admin Access"\s*text=")[^"]*(")' `
    -Replacement @"
title="Admin Access"
            text="Protected administration access is verified on the backend against SKILLEDGE_ADMIN_EMAILS. The service role key must remain server-side and must never be exposed to the client."
"@

if ($content -eq $original) {
    throw "No changes were produced. Original file was not modified."
}

Copy-Item -LiteralPath $target -Destination $backup -Force

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)

$check = Get-Content -LiteralPath $target -Raw -Encoding UTF8

Write-Host ""
Write-Host "Admin Hub text recovery completed." -ForegroundColor Green
Write-Host "Modified file: $target"
Write-Host "Backup file:   $backup"

[pscustomobject]@{
    TargetFile       = $target
    BackupFile       = $backup
    LengthBefore     = $original.Length
    LengthAfter      = $check.Length
    CyrillicErCount  = ([regex]::Matches($check, [char]0x0420)).Count
    CyrillicVeCount  = ([regex]::Matches($check, [char]0x0412)).Count
    ReplacementCount = ([regex]::Matches($check, [char]0xFFFD)).Count
}
