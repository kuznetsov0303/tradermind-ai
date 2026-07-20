param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-DirectoryFileMap {
    param([Parameter(Mandatory = $true)][string]$Root)

    $map = @{}

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        return $map
    }

    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction Stop)

    foreach ($file in $files) {
        $rel = $file.FullName.Substring($Root.Length).TrimStart('\','/')
        $map[$rel] = Get-Sha256 -Path $file.FullName
    }

    return $map
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"

$auditDir = Join-Path $ProjectRoot "audit_exports"
if (-not (Test-Path -LiteralPath $auditDir)) {
    throw "audit_exports not found: $auditDir"
}

$inventoryFile = Get-ChildItem -LiteralPath $auditDir -Filter "S10_4L_root_residue_inventory_*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $inventoryFile) {
    throw "No S10.4L inventory found."
}

$inventory = Get-Content -LiteralPath $inventoryFile.FullName -Raw | ConvertFrom-Json

$parent = Split-Path -Parent $ProjectRoot
$historyRoot = Join-Path $parent "tradermind-ai-history"
$archiveSession = Join-Path $historyRoot "S10_4M_final_local_archive_$stamp"
$archivePayload = Join-Path $archiveSession "root_residue"

New-Item -ItemType Directory -Force -Path $archivePayload | Out-Null

$manifestPath = Join-Path $archiveSession "S10_4M_archive_manifest_$stamp.json"
$reportPath = Join-Path $auditDir "S10_4M_final_local_archive_report_$stamp.txt"
$finalInventoryPath = Join-Path $auditDir "S10_4M_final_root_inventory_$stamp.json"

Write-Host "`n=== S10.4M FINAL LOCAL ARCHIVE PASS ===" -ForegroundColor Green
Write-Host "ProjectRoot: $ProjectRoot"
Write-Host "ArchiveSession: $archiveSession"
Write-Host "LOCAL ONLY / NO VPS / NO DEPLOY / NO RESTART" -ForegroundColor Yellow

$targetClasses = @(
    "ARCHIVE_HISTORY",
    "REVIEW_REQUIRED"
)

$targets = @(
    $inventory.items |
        Where-Object { $targetClasses -contains [string]$_.classification }
)

Write-Host "`nTargets from S10.4L inventory: $($targets.Count)" -ForegroundColor Cyan

$records = New-Object System.Collections.Generic.List[object]
$verificationFailed = $false

Write-Host "`n=== 1. COPY TARGETS TO EXTERNAL ARCHIVE ===" -ForegroundColor Green

foreach ($item in $targets) {
    $name = [string]$item.name
    $type = [string]$item.type
    $classification = [string]$item.classification

    $source = Join-Path $ProjectRoot $name
    $dest = Join-Path $archivePayload $name

    $record = [ordered]@{
        name = $name
        type = $type
        classification = $classification
        sourceExistsBefore = (Test-Path -LiteralPath $source)
        copied = $false
        verified = $false
        verificationMode = ""
        sourceSha256 = $null
        archiveSha256 = $null
        sourceFileCount = 0
        archiveFileCount = 0
        verificationError = $null
    }

    if (-not (Test-Path -LiteralPath $source)) {
        $record.verificationError = "SOURCE_MISSING"
        $records.Add([pscustomobject]$record)
        Write-Host "SKIP missing source: $name" -ForegroundColor Yellow
        continue
    }

    try {
        $destParent = Split-Path -Parent $dest
        if ($destParent) {
            New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        }

        if ($type -eq "file") {
            Copy-Item -LiteralPath $source -Destination $dest -Force
        }
        elseif ($type -eq "dir") {
            Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
        }
        else {
            throw "Unsupported type: $type"
        }

        $record.copied = $true
        Write-Host "COPIED: $classification | $name"
    }
    catch {
        $record.verificationError = $_.Exception.Message
        $verificationFailed = $true
    }

    $records.Add([pscustomobject]$record)
}

Write-Host "`n=== 2. VERIFY ARCHIVE COPIES ===" -ForegroundColor Green

foreach ($record in $records) {
    if (-not $record.copied) {
        continue
    }

    $source = Join-Path $ProjectRoot ([string]$record.name)
    $dest = Join-Path $archivePayload ([string]$record.name)

    try {
        if ($record.type -eq "file") {
            if (-not (Test-Path -LiteralPath $dest -PathType Leaf)) {
                throw "Archive file missing."
            }

            $srcHash = Get-Sha256 -Path $source
            $dstHash = Get-Sha256 -Path $dest

            $record.sourceSha256 = $srcHash
            $record.archiveSha256 = $dstHash
            $record.sourceFileCount = 1
            $record.archiveFileCount = 1
            $record.verificationMode = "SHA256"
            $record.verified = ($srcHash -eq $dstHash)
        }
        elseif ($record.type -eq "dir") {
            if (-not (Test-Path -LiteralPath $dest -PathType Container)) {
                throw "Archive directory missing."
            }

            $srcMap = Get-DirectoryFileMap -Root $source
            $dstMap = Get-DirectoryFileMap -Root $dest

            $record.sourceFileCount = $srcMap.Count
            $record.archiveFileCount = $dstMap.Count
            $record.verificationMode = "PER_FILE_SHA256"

            $same = ($srcMap.Count -eq $dstMap.Count)

            if ($same) {
                foreach ($key in $srcMap.Keys) {
                    if (-not $dstMap.ContainsKey($key)) {
                        $same = $false
                        break
                    }

                    if ($srcMap[$key] -ne $dstMap[$key]) {
                        $same = $false
                        break
                    }
                }
            }

            $record.verified = $same
        }

        if (-not $record.verified) {
            $verificationFailed = $true
            if (-not $record.verificationError) {
                $record.verificationError = "HASH_OR_CONTENT_MISMATCH"
            }
            Write-Host "VERIFY FAIL: $($record.name)" -ForegroundColor Red
        }
        else {
            Write-Host "VERIFIED: $($record.name)"
        }
    }
    catch {
        $record.verificationError = $_.Exception.Message
        $record.verified = $false
        $verificationFailed = $true
        Write-Host "VERIFY ERROR: $($record.name) :: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$manifest = [ordered]@{
    generated = $stamp
    projectRoot = $ProjectRoot
    sourceInventory = $inventoryFile.FullName
    archiveSession = $archiveSession
    targetCount = $targets.Count
    verificationFailed = $verificationFailed
    records = $records
}

$manifest |
    ConvertTo-Json -Depth 12 |
    Set-Content -LiteralPath $manifestPath -Encoding UTF8

if ($verificationFailed) {
    throw "Archive verification failed. NOTHING was removed from project root."
}

Write-Host "`narchive_verification_ok=true" -ForegroundColor Green

Write-Host "`n=== 3. REMOVE ONLY VERIFIED TARGETS FROM ROOT ===" -ForegroundColor Green

$removed = New-Object System.Collections.Generic.List[string]

foreach ($record in $records) {
    if (-not $record.verified) {
        continue
    }

    $source = Join-Path $ProjectRoot ([string]$record.name)

    if (-not (Test-Path -LiteralPath $source)) {
        continue
    }

    if ($record.type -eq "file") {
        Remove-Item -LiteralPath $source -Force
    }
    elseif ($record.type -eq "dir") {
        Remove-Item -LiteralPath $source -Recurse -Force
    }

    if (Test-Path -LiteralPath $source) {
        throw "Failed to remove verified target: $($record.name)"
    }

    $removed.Add([string]$record.name)
    Write-Host "REMOVED FROM ROOT: $($record.name)"
}

Write-Host "`n=== 4. FINAL SAFETY ASSERTIONS ===" -ForegroundColor Green

$mustExist = @(
    "app",
    "components",
    "lib",
    "public",
    "services",
    "supabase",
    "audit_exports",
    ".git",
    ".gitignore",
    ".env.local",
    ".env.example",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "vercel.json",
    "PRODUCTION_MANIFEST_DRAFT.md"
)

foreach ($name in $mustExist) {
    $path = Join-Path $ProjectRoot $name

    if (-not (Test-Path -LiteralPath $path)) {
        throw "CRITICAL SAFETY ASSERTION FAILED: missing $name"
    }
}

Write-Host "canonical_and_protected_paths_present=true" -ForegroundColor Green

Write-Host "`n=== 5. BUILD FINAL ROOT INVENTORY ===" -ForegroundColor Green

$rootItems = New-Object System.Collections.Generic.List[object]

foreach ($item in (Get-ChildItem -LiteralPath $ProjectRoot -Force | Sort-Object Name)) {
    $rootItems.Add([pscustomobject]@{
        name = $item.Name
        type = if ($item.PSIsContainer) { "dir" } else { "file" }
        size = if ($item.PSIsContainer) { $null } else { $item.Length }
    })
}

$remainingTargets = New-Object System.Collections.Generic.List[string]

foreach ($target in $targets) {
    $path = Join-Path $ProjectRoot ([string]$target.name)

    if (Test-Path -LiteralPath $path) {
        $remainingTargets.Add([string]$target.name)
    }
}

$finalInventory = [ordered]@{
    generated = $stamp
    projectRoot = $ProjectRoot
    archiveSession = $archiveSession
    removedCount = $removed.Count
    remainingTargetCount = $remainingTargets.Count
    remainingTargets = $remainingTargets
    rootItems = $rootItems
}

$finalInventory |
    ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $finalInventoryPath -Encoding UTF8

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("S10.4M FINAL LOCAL ARCHIVE PASS")
$lines.Add("Generated=$stamp")
$lines.Add("ProjectRoot=$ProjectRoot")
$lines.Add("ArchiveSession=$archiveSession")
$lines.Add("SourceInventory=$($inventoryFile.FullName)")
$lines.Add("")
$lines.Add("=== RESULT ===")
$lines.Add("TARGETS=$($targets.Count)")
$lines.Add("VERIFICATION_OK=true")
$lines.Add("REMOVED_FROM_ROOT=$($removed.Count)")
$lines.Add("REMAINING_TARGETS=$($remainingTargets.Count)")
$lines.Add("CANONICAL_AND_PROTECTED_PATHS_PRESENT=true")
$lines.Add("VPS_TOUCHED=false")
$lines.Add("DEPLOY_PERFORMED=false")
$lines.Add("RESTART_PERFORMED=false")
$lines.Add("")
$lines.Add("=== REMOVED ===")

foreach ($name in $removed) {
    $lines.Add($name)
}

$lines.Add("")
$lines.Add("=== REMAINING TARGETS ===")

foreach ($name in $remainingTargets) {
    $lines.Add($name)
}

$lines.Add("")
$lines.Add("=== OUTPUTS ===")
$lines.Add("Manifest=$manifestPath")
$lines.Add("FinalInventory=$finalInventoryPath")

[System.IO.File]::WriteAllLines(
    $reportPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "`n=== S10.4M COMPLETE ===" -ForegroundColor Green
Write-Host "Report: $reportPath"
Write-Host "Final inventory: $finalInventoryPath"
Write-Host "Archive manifest: $manifestPath"
Write-Host ""
Write-Host "NO VPS / NO DEPLOY / NO RESTART performed." -ForegroundColor Yellow
