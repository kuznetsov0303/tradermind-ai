param(
  [string]$ProjectRoot=(Get-Location).Path
)

$ErrorActionPreference="Stop"
$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"

$ExportRoot=Join-Path $ProjectRoot "audit_exports\S10_9S_landing_wiring_source_$stamp"
$ZipPath=Join-Path $ProjectRoot "audit_exports\S10_9S_landing_wiring_source_$stamp.zip"
$ReportPath=Join-Path $ProjectRoot "audit_exports\S10_9S_LANDING_WIRING_SOURCE_report_$stamp.txt"

$RequiredFiles=@(
  "components\Landing.tsx",
  "lib\i18n\config.ts",
  "lib\i18n\runtime.ts",
  "lib\i18n\landing-locales.ts",
  "lib\i18n\index.ts",
  "locales\landing\en.json",
  "locales\landing\ru.json",
  "locales\landing\uk.json",
  "PROJECT_STATE\i18n_exports\landing_en_master_review_20260719_213942.json"
)

foreach($RelativePath in $RequiredFiles){
  $Source=Join-Path $ProjectRoot $RelativePath
  if(-not (Test-Path -LiteralPath $Source)){
    throw "Required source file missing: $RelativePath"
  }
}

New-Item -ItemType Directory -Force -Path $ExportRoot | Out-Null

$Manifest=@()

foreach($RelativePath in $RequiredFiles){
  $Source=Join-Path $ProjectRoot $RelativePath
  $Destination=Join-Path $ExportRoot $RelativePath
  $DestinationDirectory=Split-Path -Parent $Destination

  New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force

  $Hash=(Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
  $Manifest += [PSCustomObject]@{
    file=$RelativePath.Replace("\","/")
    bytes=(Get-Item -LiteralPath $Source).Length
    sha256=$Hash
  }
}

$ManifestPath=Join-Path $ExportRoot "manifest.json"
$Manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$ForbiddenNames=@(
  ".env",
  ".env.local",
  ".env.production",
  "package-lock.json",
  "node_modules",
  ".next",
  ".git"
)

$ExportFiles=Get-ChildItem -LiteralPath $ExportRoot -Recurse -File
foreach($File in $ExportFiles){
  foreach($Forbidden in $ForbiddenNames){
    if($File.FullName -like "*$Forbidden*"){
      Remove-Item -LiteralPath $ExportRoot -Recurse -Force
      throw "Forbidden file entered export: $($File.FullName)"
    }
  }
}

if(Test-Path -LiteralPath $ZipPath){
  Remove-Item -LiteralPath $ZipPath -Force
}

$ArchiveSource = Join-Path $ExportRoot "*"
Compress-Archive -Path $ArchiveSource -DestinationPath $ZipPath -CompressionLevel Optimal -Force

if(-not (Test-Path -LiteralPath $ZipPath)){
  throw "ZIP was not created: $ZipPath"
}

$ZipHash=(Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()

@"
S10.9S LANDING WIRING SOURCE EXPORT
Generated=$stamp
OK=True
CLASSIFICATION=LANDING_WIRING_SOURCE_EXPORTED
INSPECTION_ONLY=True
PROJECT_MUTATION=False
PRODUCTION_MUTATION=False
VPS_TOUCHED=False
SECRETS_INCLUDED=False
FILES_INCLUDED=$($Manifest.Count)
ZIP_PATH=$ZipPath
ZIP_SHA256=$ZipHash
NEXT_ACTION=UPLOAD_ZIP_FOR_EXACT_LANDING_WIRING_PATCH
"@ | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "=== S10.9S COMPLETE ==="
Write-Host "OK: True"
Write-Host "Classification: LANDING_WIRING_SOURCE_EXPORTED"
Write-Host "Files included: $($Manifest.Count)"
Write-Host "Secrets included: False"
Write-Host "Project mutation: False"
Write-Host "Production mutation: False"
Write-Host "VPS touched: False"
Write-Host "ZIP: $ZipPath"
Write-Host "ZIP SHA256: $ZipHash"
Write-Host "Report: $ReportPath"
Write-Host "Next action: UPLOAD_ZIP_FOR_EXACT_LANDING_WIRING_PATCH"
