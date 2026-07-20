param(
  [string]$ProjectRoot=(Get-Location).Path,
  [switch]$RunChecks
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$errors=New-Object System.Collections.Generic.List[string]
$warnings=New-Object System.Collections.Generic.List[string]

function Get-RelativePathSafe {
  param([string]$Base,[string]$Path)

  try{
    return [IO.Path]::GetRelativePath($Base,$Path)
  }catch{
    return $Path.Replace($Base,"").TrimStart("\","/")
  }
}

function Get-TextFiles {
  param([string[]]$Roots)

  $extensions=@(
    ".ts",".tsx",".js",".jsx",".json",".md",".mjs",".cjs",
    ".css",".scss",".html",".sql",".yml",".yaml"
  )

  $excluded=@(
    "\node_modules\",
    "\.next\",
    "\.git\",
    "\.vercel\",
    "\audit_exports\",
    "\PROJECT_STATE\",
    "\backups\",
    "\archives\"
  )

  $result=New-Object System.Collections.Generic.List[object]

  foreach($root in $Roots){
    if(-not (Test-Path -LiteralPath $root)){continue}

    Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object{
        $full=$_.FullName
        $skip=$false

        foreach($token in $excluded){
          if($full.Contains($token)){
            $skip=$true
            break
          }
        }

        if($skip){return}
        if($extensions -notcontains $_.Extension.ToLowerInvariant()){return}
        if($_.Length -gt 2MB){return}

        $result.Add($_)
      }
  }

  return @($result)
}

function Search-Patterns {
  param(
    [object[]]$Files,
    [hashtable]$Groups
  )

  $output=[ordered]@{}

  foreach($group in $Groups.GetEnumerator()){
    $matches=New-Object System.Collections.Generic.List[object]

    foreach($file in $Files){
      $content=$null

      try{
        $content=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
      }catch{
        continue
      }

      foreach($pattern in $group.Value){
        if($content -match $pattern){
          $lines=Get-Content -LiteralPath $file.FullName -Encoding UTF8
          $lineHits=New-Object System.Collections.Generic.List[int]

          for($i=0;$i-lt $lines.Count;$i++){
            if($lines[$i] -match $pattern){
              $lineHits.Add($i+1)
            }
          }

          $matches.Add([ordered]@{
            path=Get-RelativePathSafe -Base $ProjectRoot -Path $file.FullName
            pattern=$pattern
            lines=@($lineHits|Select-Object -First 20)
          })
        }
      }
    }

    $output[$group.Key]=@($matches)
  }

  return $output
}

Write-Host ""
Write-Host "=== S10.9A FRONTEND / PAYMENTS / I18N AUDIT ===" -ForegroundColor Green
Write-Host "Read-only source inspection. Secrets values are not collected." -ForegroundColor Yellow

$roots=@(
  (Join-Path $ProjectRoot "app"),
  (Join-Path $ProjectRoot "components"),
  (Join-Path $ProjectRoot "lib"),
  (Join-Path $ProjectRoot "public"),
  (Join-Path $ProjectRoot "src")
)

$files=Get-TextFiles -Roots $roots

if($files.Count -eq 0){
  $errors.Add("NO_FRONTEND_SOURCE_FILES_FOUND")
}

$groups=[ordered]@{
  payments=@(
    "(?i)\bpayment\b",
    "(?i)\bcheckout\b",
    "(?i)\bbilling\b",
    "(?i)\bsubscription\b",
    "(?i)\bcrypto\b",
    "(?i)\busdt\b",
    "(?i)\bstripe\b",
    "(?i)\bfondy\b",
    "(?i)\bcoinbase\b",
    "(?i)\bnowpayments\b",
    "(?i)\bwebhook\b",
    "(?i)\btransaction\b"
  )
  translations=@(
    "(?i)\bi18n\b",
    "(?i)\blocale\b",
    "(?i)\btranslations?\b",
    "(?i)\bdictionary\b",
    "(?i)\bmessages\b",
    "(?i)\bnext-intl\b",
    "(?i)\breact-i18next\b",
    "(?i)\blanguage\b"
  )
  frontendRisks=@(
    "(?i)\bTODO\b",
    "(?i)\bFIXME\b",
    "(?i)\bHACK\b",
    "(?i)console\.log",
    "(?i)font-size\s*:\s*(8|9|10)px",
    "(?i)text-\[(8|9|10)px\]",
    "(?i)overflow-hidden",
    "(?i)min-w-\[",
    "(?i)max-w-\["
  )
  authAndPlans=@(
    "(?i)\bauth\b",
    "(?i)\bplan\b",
    "(?i)\btier\b",
    "(?i)\bpremium\b",
    "(?i)\bcore\b",
    "(?i)\bedge\b",
    "(?i)\belite\b",
    "(?i)\bentitlement\b",
    "(?i)\baccess\b"
  )
}

$matches=Search-Patterns -Files $files -Groups $groups

$packageJsonPath=Join-Path $ProjectRoot "package.json"
$packageInfo=$null

if(Test-Path -LiteralPath $packageJsonPath){
  try{
    $packageInfo=Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  }catch{
    $warnings.Add("PACKAGE_JSON_PARSE_FAILED")
  }
}else{
  $errors.Add("PACKAGE_JSON_NOT_FOUND")
}

$dependencies=[ordered]@{}

if($packageInfo){
  foreach($sectionName in @("dependencies","devDependencies")){
    $section=$packageInfo.$sectionName

    if($section){
      foreach($property in $section.PSObject.Properties){
        $dependencies[$property.Name]=$property.Value
      }
    }
  }
}

$paymentDependencies=@(
  $dependencies.GetEnumerator() |
  Where-Object{
    $_.Key -match "(?i)stripe|fondy|coinbase|crypto|payment|checkout|commerce|nowpayments"
  } |
  ForEach-Object{
    [ordered]@{name=$_.Key;version=$_.Value}
  }
)

$i18nDependencies=@(
  $dependencies.GetEnumerator() |
  Where-Object{
    $_.Key -match "(?i)next-intl|i18next|lingui|formatjs|intl"
  } |
  ForEach-Object{
    [ordered]@{name=$_.Key;version=$_.Value}
  }
)

$dictionaryFiles=@(
  $files |
  Where-Object{
    $_.Name -match "(?i)^(en|ru|ua|uk)([-_].*)?\.json$" -or
    $_.FullName -match "(?i)translations|messages|locales|dictionaries|i18n"
  } |
  ForEach-Object{
    [ordered]@{
      path=Get-RelativePathSafe -Base $ProjectRoot -Path $_.FullName
      sizeBytes=$_.Length
    }
  }
)

$routeFiles=@(
  $files |
  Where-Object{
    $_.FullName -match "\\app\\api\\" -or
    $_.Name -match "^route\.(ts|js)$"
  } |
  ForEach-Object{
    [ordered]@{
      path=Get-RelativePathSafe -Base $ProjectRoot -Path $_.FullName
      sizeBytes=$_.Length
    }
  }
)

$envFiles=@(
  Get-ChildItem -LiteralPath $ProjectRoot -File -Force -ErrorAction SilentlyContinue |
  Where-Object {$_.Name -match "^\.env(\..+)?$"}
)

$envVariableNames=New-Object System.Collections.Generic.List[string]

foreach($envFile in $envFiles){
  if($envFile.Name -notmatch "example|sample|template"){
    $warnings.Add("REAL_ENV_FILE_PRESENT_NOT_READ_$($envFile.Name)")
    continue
  }

  foreach($line in Get-Content -LiteralPath $envFile.FullName -Encoding UTF8){
    if($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*="){
      $envVariableNames.Add($Matches[1])
    }
  }
}

$translationInventory=[ordered]@{
  en=@()
  ru=@()
  ua=@()
  uk=@()
  other=@()
}

foreach($item in $dictionaryFiles){
  $path=[string]$item.path
  $name=[IO.Path]::GetFileName($path).ToLowerInvariant()

  if($name -match "^en([_-]|\.)"){
    $translationInventory.en+=,$path
  }elseif($name -match "^ru([_-]|\.)"){
    $translationInventory.ru+=,$path
  }elseif($name -match "^ua([_-]|\.)"){
    $translationInventory.ua+=,$path
  }elseif($name -match "^uk([_-]|\.)"){
    $translationInventory.uk+=,$path
  }else{
    $translationInventory.other+=,$path
  }
}

$checkResults=[ordered]@{
  requested=[bool]$RunChecks
  npmAvailable=$false
  lint=$null
  typecheck=$null
  build=$null
}

if($RunChecks){
  try{
    & npm --version *> $null

    if($LASTEXITCODE-eq 0){
      $checkResults.npmAvailable=$true
    }
  }catch{}

  if(-not $checkResults.npmAvailable){
    $warnings.Add("NPM_NOT_AVAILABLE")
  }elseif($packageInfo){
    $scripts=$packageInfo.scripts

    if($scripts -and $scripts.lint){
      & npm run lint
      $checkResults.lint=($LASTEXITCODE-eq 0)
    }

    if($scripts -and $scripts.typecheck){
      & npm run typecheck
      $checkResults.typecheck=($LASTEXITCODE-eq 0)
    }

    if($scripts -and $scripts.build){
      & npm run build
      $checkResults.build=($LASTEXITCODE-eq 0)
    }
  }
}

$result=[ordered]@{
  ok=($errors.Count-eq 0)
  classification=if($errors.Count-eq 0){
    "WEEKEND_FRONTEND_PAYMENTS_I18N_AUDIT_COMPLETED"
  }else{
    "WEEKEND_FRONTEND_PAYMENTS_I18N_AUDIT_BLOCKED"
  }
  inspectionOnly=$true
  productionMutation=$false
  vpsTouched=$false
  sourceFilesScanned=$files.Count
  rootsScanned=@(
    $roots |
    Where-Object {Test-Path -LiteralPath $_} |
    ForEach-Object {Get-RelativePathSafe -Base $ProjectRoot -Path $_}
  )
  packageJsonPresent=(Test-Path -LiteralPath $packageJsonPath)
  frameworkDependencies=$dependencies
  paymentDependencies=$paymentDependencies
  i18nDependencies=$i18nDependencies
  dictionaryFiles=$dictionaryFiles
  translationInventory=$translationInventory
  apiRouteFiles=$routeFiles
  safeEnvVariableNames=@($envVariableNames|Select-Object -Unique|Sort-Object)
  matches=$matches
  checks=$checkResults
  errors=@($errors|Select-Object -Unique)
  warnings=@($warnings|Select-Object -Unique)
  recommendedOrder=@(
    "FRONTEND_BUG_AND_LAYOUT_AUDIT",
    "PAYMENT_DOMAIN_AND_DATABASE_FLOW",
    "PAYMENT_PROVIDER_DECISION_WITH_COST_DISCLOSURE",
    "EN_RU_UA_DICTIONARY_PARITY",
    "PRODUCTION_BUILD_AND_SMOKE_TEST"
  )
  nextAction=if($errors.Count-eq 0){
    "UPLOAD_S10_9A_REPORT_AND_RAW_FOR_IMPLEMENTATION_PLAN"
  }else{
    "FIX_LOCAL_AUDIT_BLOCKERS"
  }
}

$raw=Join-Path $Audit "S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_raw_$stamp.json"
$report=Join-Path $Audit "S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_report_$stamp.txt"
$milestone=Join-Path $Milestones "S10_9A_FRONTEND_PAYMENTS_I18N_AUDIT_$stamp.md"

$result|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $raw -Encoding UTF8

@(
  "S10.9A FRONTEND / PAYMENTS / I18N AUDIT",
  "Generated=$stamp",
  "OK=$($result.ok)",
  "CLASSIFICATION=$($result.classification)",
  "SOURCE_FILES_SCANNED=$($result.sourceFilesScanned)",
  "ROOTS_SCANNED=$($result.rootsScanned -join ',')",
  "PACKAGE_JSON_PRESENT=$($result.packageJsonPresent)",
  "PAYMENT_DEPENDENCIES=$(@($result.paymentDependencies).Count)",
  "I18N_DEPENDENCIES=$(@($result.i18nDependencies).Count)",
  "DICTIONARY_FILES=$(@($result.dictionaryFiles).Count)",
  "API_ROUTE_FILES=$(@($result.apiRouteFiles).Count)",
  "PAYMENT_MATCHES=$(@($result.matches.payments).Count)",
  "TRANSLATION_MATCHES=$(@($result.matches.translations).Count)",
  "FRONTEND_RISK_MATCHES=$(@($result.matches.frontendRisks).Count)",
  "AUTH_PLAN_MATCHES=$(@($result.matches.authAndPlans).Count)",
  "RUN_CHECKS_REQUESTED=$($result.checks.requested)",
  "LINT=$($result.checks.lint)",
  "TYPECHECK=$($result.checks.typecheck)",
  "BUILD=$($result.checks.build)",
  "ERRORS=$($result.errors -join ',')",
  "WARNINGS=$($result.warnings -join ',')",
  "PRODUCTION_MUTATION=False",
  "VPS_TOUCHED=False",
  "NEXT_ACTION=$($result.nextAction)",
  "RAW_JSON=$raw"
)|Set-Content -LiteralPath $report -Encoding UTF8

@"
# S10.9A Frontend / Payments / I18N Audit

- OK: $($result.ok)
- Classification: $($result.classification)
- Source files scanned: $($result.sourceFilesScanned)
- Roots: $($result.rootsScanned -join ', ')
- Payment dependencies: $(@($result.paymentDependencies).Count)
- I18N dependencies: $(@($result.i18nDependencies).Count)
- Dictionary files: $(@($result.dictionaryFiles).Count)
- API routes: $(@($result.apiRouteFiles).Count)
- Payment matches: $(@($result.matches.payments).Count)
- Translation matches: $(@($result.matches.translations).Count)
- Frontend risk matches: $(@($result.matches.frontendRisks).Count)
- Auth/plan matches: $(@($result.matches.authAndPlans).Count)
- Errors: $($result.errors -join ', ')
- Warnings: $($result.warnings -join ', ')
- Next action: $($result.nextAction)

Read-only inspection.
No secret values collected.
No VPS connection.
No production mutation.
"@|Set-Content -LiteralPath $milestone -Encoding UTF8

Write-Host ""
Write-Host "=== S10.9A COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($result.ok)"
Write-Host "Classification: $($result.classification)"
Write-Host "Source files scanned: $($result.sourceFilesScanned)"
Write-Host "Payment dependencies: $(@($result.paymentDependencies).Count)"
Write-Host "I18N dependencies: $(@($result.i18nDependencies).Count)"
Write-Host "Dictionary files: $(@($result.dictionaryFiles).Count)"
Write-Host "API routes: $(@($result.apiRouteFiles).Count)"
Write-Host "Payment matches: $(@($result.matches.payments).Count)"
Write-Host "Translation matches: $(@($result.matches.translations).Count)"
Write-Host "Frontend risk matches: $(@($result.matches.frontendRisks).Count)"
Write-Host "Auth/plan matches: $(@($result.matches.authAndPlans).Count)"
Write-Host "Errors: $($result.errors -join ', ')"
Write-Host "Warnings: $($result.warnings -join ', ')"
Write-Host "Report: $report"
Write-Host "Raw: $raw"
Write-Host "Milestone: $milestone"
Write-Host "Next action: $($result.nextAction)"

if(-not $result.ok){
  throw "S10.9A audit blocked"
}
