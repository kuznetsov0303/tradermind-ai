$ErrorActionPreference="Stop"

$expected=@{
  "executor"="bf5e43b43dddb4dfa471f47942068072feb75f6f8a334016232bbc4d262980b9"
  "validationRaw"="6ff25ad303868ffbcbeebdc60821e72bd5e1b6667a08415eccf818faeebe03ab"
  "validationReport"="bbac7d96e0c0174b65614999e1f90fab0dbd986bd367eed1c5c893a49b8dcad9"
  "universe"="270c9db67b3e83789ca505a1b38172dc2254747dab3edcf2b147b000d71b4bf0"
  "canaryPlan"="39a0c35be3dba1ab1c2a8bff388abd6b2966e13b9d061709efdc6d63e1466f2a"
  "packageManifest"="7ce2055c19c187bb6dedde218da5f0902aa309bb394e4d23796b0c712922e4d6"
}

$paths=@{
  "executor"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1"
  "validationRaw"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\audit_exports\S10_8A_Y2_OFFLINE_VALIDATION_raw_20260719_134234.json"
  "validationReport"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\audit_exports\S10_8A_Y2_OFFLINE_VALIDATION_report_20260719_134234.txt"
  "universe"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\audit_exports\S10_7P_VALIDATED_LIQUID_250_UNIVERSE_20260718_235427.json"
  "canaryPlan"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\PROJECT_STATE\S10_7V_guarded_v2_canary_with_v3_20260719_123445\config\canary_plan.json"
  "packageManifest"="C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\PROJECT_STATE\S10_7V_guarded_v2_canary_with_v3_20260719_123445\manifest.json"
}

$errors=@()

foreach($name in $expected.Keys){
  if(-not (Test-Path -LiteralPath $paths[$name])){
    $errors+="MISSING_$name"
    continue
  }

  $actual=(Get-FileHash -LiteralPath $paths[$name] -Algorithm SHA256).Hash.ToLowerInvariant()

  if($actual -ne $expected[$name]){
    $errors+="HASH_MISMATCH_$name"
  }
}

Write-Host "OK: $($errors.Count -eq 0)"
Write-Host "Errors: $($errors -join ', ')"

if($errors.Count -gt 0){
  throw "Readiness checksum verification blocked"
}
