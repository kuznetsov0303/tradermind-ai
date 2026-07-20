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

$raw = Get-ChildItem -LiteralPath $AuditDir -Filter "S10_5E_aia_chain_entitlement_raw_FIXED_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $raw) {
    throw "No S10.5E FIXED raw JSON found in $AuditDir"
}

$result = Get-Content -LiteralPath $raw.FullName -Raw | ConvertFrom-Json
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ReportPath = Join-Path $AuditDir "S10_5E_aia_chain_entitlement_report_RECOVERED_$stamp.txt"

function Has-Prop {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $null -ne $Object.PSObject.Properties[$Name]
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.5E AIA CHAIN RECOVERY + FMP WEBSOCKET ENTITLEMENT PROBE - RECOVERED REPORT")
$lines.Add("SourceRaw=$($raw.FullName)")

foreach ($name in @("host","endpoint","probeSecondsRequested","apiKeyPresent","apiKeySource","apiKeyOutput","classification","ok")) {
    if (Has-Prop $result $name) {
        $lines.Add("$($name.ToUpper())=$($result.$name)")
    }
}

if ((Has-Prop $result "error") -and $null -ne $result.error) {
    $lines.Add("ERROR=$($result.error)")
}

if ((Has-Prop $result "aiaSelectedUrl") -and $null -ne $result.aiaSelectedUrl) {
    $lines.Add("")
    $lines.Add("=== AIA ===")
    $lines.Add("AIA_CA_ISSUERS_URL=$($result.aiaSelectedUrl)")
}

if ((Has-Prop $result "leafFetch") -and $null -ne $result.leafFetch) {
    $lines.Add("")
    $lines.Add("=== LEAF FETCH ===")
    if (Has-Prop $result.leafFetch "ok") {
        $lines.Add("LEAF_FETCH_OK=$($result.leafFetch.ok)")
    }
    if (Has-Prop $result.leafFetch "sha256Pem") {
        $lines.Add("LEAF_PEM_SHA256=$($result.leafFetch.sha256Pem)")
    }
}

if ((Has-Prop $result "intermediateDownload") -and $null -ne $result.intermediateDownload) {
    $lines.Add("")
    $lines.Add("=== INTERMEDIATE DOWNLOAD ===")
    foreach ($name in @("ok","url","bytes","sha256Raw","contentType")) {
        if (Has-Prop $result.intermediateDownload $name) {
            $lines.Add("$($name.ToUpper())=$($result.intermediateDownload.$name)")
        }
    }
}

if ((Has-Prop $result "leafVerify") -and $null -ne $result.leafVerify) {
    $lines.Add("")
    $lines.Add("=== CHAIN VERIFY ===")
    if (Has-Prop $result.leafVerify "returncode") {
        $lines.Add("VERIFY_RETURN_CODE=$($result.leafVerify.returncode)")
    }
    if (Has-Prop $result.leafVerify "stdout") {
        $verifyText = [string]$result.leafVerify.stdout
        $verifyText = $verifyText -replace [Environment]::NewLine, " | "
        $verifyText = $verifyText -replace "`r", " "
        $verifyText = $verifyText -replace "`n", " | "
        $lines.Add("VERIFY_STDOUT=$verifyText")
    }
    if (Has-Prop $result.leafVerify "stderr") {
        $verifyErr = [string]$result.leafVerify.stderr
        $verifyErr = $verifyErr -replace "`r", " "
        $verifyErr = $verifyErr -replace "`n", " | "
        if (-not [string]::IsNullOrWhiteSpace($verifyErr)) {
            $lines.Add("VERIFY_STDERR=$verifyErr")
        }
    }
}

if ((Has-Prop $result "tlsProbe") -and $null -ne $result.tlsProbe) {
    $lines.Add("")
    $lines.Add("=== TLS ===")
    foreach ($name in @("ok","peerSubject","peerIssuer","cipher","error")) {
        if (Has-Prop $result.tlsProbe $name) {
            $lines.Add("$($name.ToUpper())=$($result.tlsProbe.$name)")
        }
    }
}

if ((Has-Prop $result "websocketProbe") -and $null -ne $result.websocketProbe) {
    $lines.Add("")
    $lines.Add("=== WEBSOCKET ===")
    foreach ($name in @("connected","elapsedSeconds")) {
        if (Has-Prop $result.websocketProbe $name) {
            $lines.Add("$($name.ToUpper())=$($result.websocketProbe.$name)")
        }
    }
}

if ((Has-Prop $result "analysis") -and $null -ne $result.analysis) {
    $lines.Add("")
    $lines.Add("=== OBSERVED PROTOCOL ===")

    foreach ($name in @("parsedMessageCount","rawUnparsedCount")) {
        if (Has-Prop $result.analysis $name) {
            $lines.Add("$($name.ToUpper())=$($result.analysis.$name)")
        }
    }

    if (Has-Prop $result.analysis "typeCounts") {
        $pairs = @()
        foreach ($prop in $result.analysis.typeCounts.PSObject.Properties) {
            $pairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("TYPE_COUNTS=$($pairs -join ',')")
    }

    if (Has-Prop $result.analysis "symbols") {
        $pairs = @()
        foreach ($prop in $result.analysis.symbols.PSObject.Properties) {
            $pairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("SYMBOL_COUNTS=$($pairs -join ',')")
    }

    if (Has-Prop $result.analysis "fieldsSeen") {
        $pairs = @()
        foreach ($prop in $result.analysis.fieldsSeen.PSObject.Properties) {
            $pairs += "$($prop.Name):$($prop.Value)"
        }
        $lines.Add("FIELDS_SEEN=$($pairs -join ',')")
    }
}

if ((Has-Prop $result "capabilitiesObserved") -and $null -ne $result.capabilitiesObserved) {
    $lines.Add("")
    $lines.Add("=== CAPABILITIES ===")

    foreach ($name in @("marketEventObserved","quoteFieldsObserved","tradeFieldsObserved","timestampObserved")) {
        if (Has-Prop $result.capabilitiesObserved $name) {
            $lines.Add("$($name.ToUpper())=$($result.capabilitiesObserved.$name)")
        }
    }
}

if ((Has-Prop $result "safety") -and $null -ne $result.safety) {
    $lines.Add("")
    $lines.Add("=== SAFETY ===")

    foreach ($name in @(
        "installPerformed",
        "packageChanged",
        "globalCaChanged",
        "sslVerificationDisabled",
        "deployPerformed",
        "restartPerformed",
        "serviceStateChanged",
        "paperPostPerformed",
        "subscriptionChanged",
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
Write-Host "=== S10.5E RECOVERY COMPLETE ===" -ForegroundColor Green
Write-Host "Source raw: $($raw.FullName)"
Write-Host "Recovered report: $ReportPath"
Write-Host ""
Write-Host "NO REMOTE PROBE RE-RUN / NO DEPLOY / NO RESTART / NO SERVICE CHANGE." -ForegroundColor Yellow
