param(
  [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$targets = @(
  "app\admin\page.tsx",
  "app\admin\investor-dashboard\page.tsx",
  "app\admin\referrals\page.tsx",
  "app\admin\signals-review\page.tsx",
  "app\admin\support\page.tsx",
  "components\admin\AdminActivationStatsBlock.tsx",
  "components\admin\InvestorDashboardSection.tsx"
)

$markers = @(
  ([string][char]0x0420 + [char]0x045F),
  ([string][char]0x0420 + [char]0x0454),
  ([string][char]0x0420 + [char]0x00B0),
  ([string][char]0x0421 + [char]0x0402),
  ([string][char]0x0421 + [char]0x0453),
  ([string][char]0x0421 + [char]0x0403),
  ([string][char]0x0421 + [char]0x0452),
  ([string][char]0x00D0),
  ([string][char]0x00D1),
  ([string][char]0xFFFD),
  ([string][char]0x00E2 + [char]0x20AC)
)

$results = New-Object System.Collections.Generic.List[object]

foreach ($relative in $targets) {
  $path = Join-Path $ProjectRoot $relative
  if (-not (Test-Path -LiteralPath $path)) {
    continue
  }

  $lines = Get-Content -LiteralPath $path -Encoding UTF8
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]
    $hit = $false
    foreach ($marker in $markers) {
      if ($line.Contains($marker)) {
        $hit = $true
        break
      }
    }

    if ($hit) {
      $results.Add([PSCustomObject]@{
        File = $relative
        LineNumber = $i + 1
        Line = $line.Trim()
      })
    }
  }
}

[PSCustomObject]@{
  CheckedFileCount = $targets.Count
  ExistingFileCount = @($targets | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectRoot $_) }).Count
  SuspiciousLineCount = $results.Count
}

if ($results.Count -gt 0) {
  ""
  "=== POSSIBLE MOJIBAKE ==="
  $results | Format-List
} else {
  ""
  "No obvious mojibake markers found in Admin Hub UI files."
}
