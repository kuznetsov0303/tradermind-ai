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

$raw = Get-ChildItem -LiteralPath $AuditDir -Filter "S10_5B_fmp_websocket_entitlement_raw_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $raw) {
    throw "No S10.5B raw JSON found in $AuditDir"
}

$result = Get-Content -LiteralPath $raw.FullName -Raw | ConvertFrom-Json
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ReportPath = Join-Path $AuditDir "S10_5B_fmp_websocket_entitlement_report_RECOVERED_$stamp.txt"

function Has-Prop {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $null -ne $Object.PSObject.Properties[$Name]
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5B FMP WEBSOCKET ENTITLEMENT + PROTOCOL PROBE - RECOVERED REPORT")
$lines.Add("SourceRaw=$($raw.FullName)")

if (Has-Prop $result "endpoint") {
    $lines.Add("ENDPOINT=$($result.endpoint)")
}

if (Has-Prop $result "symbols") {
    $lines.Add("SYMBOLS=$(@($result.symbols) -join ',')")
}

if (Has-Prop $result "probeSecondsRequested") {
    $lines.Add("PROBE_SECONDS_REQUESTED=$($result.probeSecondsRequested)")
}

if (Has-Prop $result "apiKeyPresent") {
    $lines.Add("API_KEY_PRESENT=$($result.apiKeyPresent)")
}

if (Has-Prop $result "apiKeySource") {
    $lines.Add("API_KEY_SOURCE=$($result.apiKeySource)")
}

if (Has-Prop $result "apiKeyOutput") {
    $lines.Add("API_KEY_OUTPUT=$($result.apiKeyOutput)")
}

$lines.Add("")
$lines.Add("=== RESULT ===")

if (Has-Prop $result "ok") {
    $lines.Add("OK=$($result.ok)")
}

if (Has-Prop $result "classification") {
    $lines.Add("CLASSIFICATION=$($result.classification)")
}

if ((Has-Prop $result "error") -and $null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

if (Has-Prop $result "packages") {
    $lines.Add("")
    $lines.Add("=== CLIENT LIBRARIES ===")

    $p = $result.packages

    foreach ($name in @(
        "pythonExecutable",
        "pythonVersion",
        "websockets",
        "websocketsVersion",
        "websocketClient",
        "websocketClientVersion"
    )) {
        if (Has-Prop $p $name) {
            $lines.Add("$($name.ToUpper())=$($p.$name)")
        }
    }
}

if ((Has-Prop $result "probe") -and $null -ne $result.probe) {
    $lines.Add("")
    $lines.Add("=== CONNECTION ===")

    $p = $result.probe

    foreach ($name in @(
        "transport",
        "connected",
        "loginSent",
        "subscribeSent",
        "unsubscribeSent",
        "elapsedSeconds"
    )) {
        if (Has-Prop $p $name) {
            $lines.Add("$($name.ToUpper())=$($p.$name)")
        }
    }
}

if ((Has-Prop $result "analysis") -and $null -ne $result.analysis) {
    $lines.Add("")
    $lines.Add("=== OBSERVED PROTOCOL ===")

    $a = $result.analysis

    foreach ($name in @(
        "parsedMessageCount",
        "rawUnparsedCount"
    )) {
        if (Has-Prop $a $name) {
            $lines.Add("$($name.ToUpper())=$($a.$name)")
        }
    }

    if (Has-Prop $a "typeCounts") {
        $typePairs = @()
        foreach ($prop in $a.typeCounts.PSObject.Properties) {
            $typePairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("TYPE_COUNTS=$($typePairs -join ',')")
    }

    if (Has-Prop $a "symbols") {
        $symbolPairs = @()
        foreach ($prop in $a.symbols.PSObject.Properties) {
            $symbolPairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("SYMBOL_COUNTS=$($symbolPairs -join ',')")
    }

    if (Has-Prop $a "fieldsSeen") {
        $fieldPairs = @()
        foreach ($prop in $a.fieldsSeen.PSObject.Properties) {
            $fieldPairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("FIELDS_SEEN=$($fieldPairs -join ',')")
    }
}

if ((Has-Prop $result "capabilitiesObserved") -and $null -ne $result.capabilitiesObserved) {
    $lines.Add("")
    $lines.Add("=== CAPABILITIES OBSERVED ===")

    $c = $result.capabilitiesObserved

    foreach ($name in @(
        "marketEventObserved",
        "quoteFieldsObserved",
        "tradeFieldsObserved",
        "timestampObserved"
    )) {
        if (Has-Prop $c $name) {
            $lines.Add("$($name.ToUpper())=$($c.$name)")
        }
    }
}
else {
    $lines.Add("")
    $lines.Add("=== CAPABILITIES OBSERVED ===")
    $lines.Add("CAPABILITIES_OBJECT_PRESENT=false")
}

if (Has-Prop $result "safety") {
    $lines.Add("")
    $lines.Add("=== SAFETY ===")

    $s = $result.safety

    foreach ($name in @(
        "installPerformed",
        "deployPerformed",
        "restartPerformed",
        "serviceStateChanged",
        "paperPostPerformed",
        "subscriptionChanged",
        "apiKeyEmitted"
    )) {
        if (Has-Prop $s $name) {
            $lines.Add("$($name.ToUpper())=$($s.$name)")
        }
    }
}

[System.IO.File]::WriteAllLines(
    $ReportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host ""
Write-Host "=== S10.5B RECOVERY COMPLETE ===" -ForegroundColor Green
Write-Host "Source raw: $($raw.FullName)"
Write-Host "Recovered report: $ReportPath"
Write-Host ""
Write-Host "NO REMOTE PROBE RE-RUN / NO DEPLOY / NO RESTART / NO SERVICE CHANGE." -ForegroundColor Yellow
