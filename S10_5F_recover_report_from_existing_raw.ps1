param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$AuditDir = Join-Path $ProjectRoot "audit_exports"

if (-not (Test-Path -LiteralPath $AuditDir)) {
    throw "Audit directory not found: $AuditDir"
}

$raw = Get-ChildItem -LiteralPath $AuditDir -Filter "S10_5F_fmp_auth_differential_raw_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $raw) {
    throw "No S10.5F raw JSON found in $AuditDir"
}

$result = Get-Content -LiteralPath $raw.FullName -Raw | ConvertFrom-Json
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ReportPath = Join-Path $AuditDir "S10_5F_fmp_auth_differential_report_RECOVERED_$stamp.txt"

function Has-Prop {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $null -ne $Object.PSObject.Properties[$Name]
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5F FMP AUTH DIFFERENTIAL PROBE - RECOVERED REPORT")
$lines.Add("SourceRaw=$($raw.FullName)")

foreach ($name in @(
    "ok",
    "apiKeyPresent",
    "apiKeySource",
    "apiKeyFingerprintSha256Prefix",
    "apiKeyOutput",
    "classification",
    "recommendation"
)) {
    if (Has-Prop $result $name) {
        $lines.Add("$($name.ToUpper())=$($result.$name)")
    }
}

if ((Has-Prop $result "error") -and $null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

if ((Has-Prop $result "restStable") -and $null -ne $result.restStable) {
    $lines.Add("")
    $lines.Add("=== REST STABLE ===")

    foreach ($name in @("ok","status","bodyKind","itemCount","contentType")) {
        if (Has-Prop $result.restStable $name) {
            $lines.Add("$($name.ToUpper())=$($result.restStable.$name)")
        }
    }

    if ((Has-Prop $result.restStable "error") -and $null -ne $result.restStable.error) {
        $lines.Add("ERROR=$($result.restStable.error)")
    }
}

if ((Has-Prop $result "restLegacy") -and $null -ne $result.restLegacy) {
    $lines.Add("")
    $lines.Add("=== REST LEGACY ===")

    foreach ($name in @("ok","status","bodyKind","itemCount","contentType")) {
        if (Has-Prop $result.restLegacy $name) {
            $lines.Add("$($name.ToUpper())=$($result.restLegacy.$name)")
        }
    }

    if ((Has-Prop $result.restLegacy "error") -and $null -ne $result.restLegacy.error) {
        $lines.Add("ERROR=$($result.restLegacy.error)")
    }
}

if ((Has-Prop $result "websocket") -and $null -ne $result.websocket) {
    $lines.Add("")
    $lines.Add("=== WEBSOCKET LOGIN ===")

    foreach ($name in @("connected","loginSent","error")) {
        if (Has-Prop $result.websocket $name) {
            $lines.Add("$($name.ToUpper())=$($result.websocket.$name)")
        }
    }

    if ((Has-Prop $result.websocket "firstMessage") -and $null -ne $result.websocket.firstMessage) {
        $msg = $result.websocket.firstMessage

        foreach ($name in @("event","status","message","timeout")) {
            if (Has-Prop $msg $name) {
                $lines.Add("$($name.ToUpper())=$($msg.$name)")
            }
        }
    }
}

if ((Has-Prop $result "chain") -and $null -ne $result.chain) {
    $lines.Add("")
    $lines.Add("=== CHAIN ===")

    foreach ($name in @("aiaUrl","intermediateSha256","verifyOk")) {
        if (Has-Prop $result.chain $name) {
            $lines.Add("$($name.ToUpper())=$($result.chain.$name)")
        }
    }
}

if ((Has-Prop $result "safety") -and $null -ne $result.safety) {
    $lines.Add("")
    $lines.Add("=== SAFETY ===")

    foreach ($name in @(
        "installPerformed",
        "subscriptionChanged",
        "deployPerformed",
        "restartPerformed",
        "serviceStateChanged",
        "paperPostPerformed",
        "apiKeyEmitted",
        "temporaryFilesRemoved"
    )) {
        if (Has-Prop $result.safety $name) {
            $lines.Add("$($name.ToUpper())=$($result.safety.$name)")
        }
    }
}

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5F RECOVERY COMPLETE ===" -ForegroundColor Green
Write-Host "Source raw: $($raw.FullName)"
Write-Host "Recovered report: $ReportPath"
Write-Host ""
Write-Host "NO REMOTE PROBE RE-RUN / NO FMP RE-REQUEST / NO DEPLOY / NO RESTART." -ForegroundColor Yellow
