$path = "components/Landing.tsx"
$backup = "components/Landing.before-premium-recolor.tsx"

if (!(Test-Path $path)) {
  Write-Host "File not found: $path" -ForegroundColor Red
  exit 1
}

# IMPORTANT:
# Windows PowerShell 5 can corrupt Cyrillic if Get-Content reads UTF-8 as ANSI.
# This script uses .NET UTF-8 read/write to preserve RU/UA/EN text correctly.

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Restore clean backup if it exists, because previous script may have corrupted Cyrillic text.
if (Test-Path $backup) {
  Copy-Item $backup $path -Force
  Write-Host "Restored clean backup: $backup -> $path" -ForegroundColor Yellow
} else {
  Copy-Item $path $backup -Force
  Write-Host "Backup created: $backup" -ForegroundColor Yellow
}

$content = [System.IO.File]::ReadAllText((Resolve-Path $path), [System.Text.Encoding]::UTF8)

function Replace-Literal {
  param (
    [string]$From,
    [string]$To
  )

  $script:content = $script:content.Replace($From, $To)
}

# =========================================================
# SkillEdge AI Premium Palette
# Deep Navy / Institutional Emerald / Prestige Gold
# =========================================================

# Hardcoded dark backgrounds
Replace-Literal "#070b16" "#07111F"
Replace-Literal "#020711" "#07111F"
Replace-Literal "#06111d" "#07111F"
Replace-Literal "#06131f" "#07111F"
Replace-Literal "#071321" "#0F172A"
Replace-Literal "#071522" "#0F172A"
Replace-Literal "#081522" "#0F172A"
Replace-Literal "#0b1928" "#0F172A"
Replace-Literal "#0d1b2b" "#111C2D"
Replace-Literal "#132438" "#111C2D"

# Old cyan/blue glows -> emerald/gold institutional glows
Replace-Literal "rgba(56,214,255" "rgba(0,192,118"
Replace-Literal "rgba(34,211,238" "rgba(0,192,118"
Replace-Literal "rgba(103,232,249" "rgba(0,192,118"
Replace-Literal "rgba(8,47,73" "rgba(0,0,0"
Replace-Literal "rgba(52,211,153" "rgba(200,169,107"

# Text colors
Replace-Literal "text-cyan-50" "text-[#E6EDF7]"
Replace-Literal "text-cyan-100" "text-[#E6EDF7]"
Replace-Literal "text-cyan-200" "text-[#C8A96B]"
Replace-Literal "text-cyan-300" "text-[#00C076]"
Replace-Literal "text-cyan-400" "text-[#00D084]"
Replace-Literal "text-cyan-500" "text-[#00C076]"

Replace-Literal "text-sky-50" "text-[#E6EDF7]"
Replace-Literal "text-sky-100" "text-[#E6EDF7]"
Replace-Literal "text-sky-200" "text-[#C8A96B]"
Replace-Literal "text-sky-300" "text-[#00C076]"
Replace-Literal "text-sky-400" "text-[#00D084]"
Replace-Literal "text-sky-500" "text-[#00C076]"

Replace-Literal "text-emerald-50" "text-[#E6EDF7]"
Replace-Literal "text-emerald-100" "text-[#DFFFEF]"
Replace-Literal "text-emerald-200" "text-[#00D084]"
Replace-Literal "text-emerald-300" "text-[#00C076]"
Replace-Literal "text-emerald-400" "text-[#00D084]"
Replace-Literal "text-emerald-500" "text-[#00C076]"

# Background colors
Replace-Literal "bg-cyan-50" "bg-[#00C076]"
Replace-Literal "bg-cyan-100" "bg-[#00C076]"
Replace-Literal "bg-cyan-200" "bg-[#C8A96B]"
Replace-Literal "bg-cyan-300" "bg-[#00C076]"
Replace-Literal "bg-cyan-400" "bg-[#00D084]"
Replace-Literal "bg-cyan-500" "bg-[#00C076]"

Replace-Literal "bg-sky-50" "bg-[#00C076]"
Replace-Literal "bg-sky-100" "bg-[#00C076]"
Replace-Literal "bg-sky-200" "bg-[#C8A96B]"
Replace-Literal "bg-sky-300" "bg-[#00C076]"
Replace-Literal "bg-sky-400" "bg-[#00D084]"
Replace-Literal "bg-sky-500" "bg-[#00C076]"

Replace-Literal "bg-emerald-50" "bg-[#00C076]"
Replace-Literal "bg-emerald-100" "bg-[#00C076]"
Replace-Literal "bg-emerald-200" "bg-[#00D084]"
Replace-Literal "bg-emerald-300" "bg-[#00C076]"
Replace-Literal "bg-emerald-400" "bg-[#00D084]"
Replace-Literal "bg-emerald-500" "bg-[#00C076]"

# Border colors
Replace-Literal "border-cyan-50" "border-[#E6EDF7]"
Replace-Literal "border-cyan-100" "border-white"
Replace-Literal "border-cyan-200" "border-[#C8A96B]"
Replace-Literal "border-cyan-300" "border-[#00C076]"
Replace-Literal "border-cyan-400" "border-[#00D084]"
Replace-Literal "border-cyan-500" "border-[#00C076]"

Replace-Literal "border-sky-50" "border-[#E6EDF7]"
Replace-Literal "border-sky-100" "border-white"
Replace-Literal "border-sky-200" "border-[#C8A96B]"
Replace-Literal "border-sky-300" "border-[#00C076]"
Replace-Literal "border-sky-400" "border-[#00D084]"
Replace-Literal "border-sky-500" "border-[#00C076]"

Replace-Literal "border-emerald-50" "border-[#E6EDF7]"
Replace-Literal "border-emerald-100" "border-white"
Replace-Literal "border-emerald-200" "border-[#00C076]"
Replace-Literal "border-emerald-300" "border-[#00D084]"
Replace-Literal "border-emerald-400" "border-[#00D084]"
Replace-Literal "border-emerald-500" "border-[#00C076]"

# Gradient stops
Replace-Literal "from-cyan-50" "from-[#E6EDF7]"
Replace-Literal "from-cyan-100" "from-[#E6EDF7]"
Replace-Literal "from-cyan-200" "from-[#C8A96B]"
Replace-Literal "from-cyan-300" "from-[#00C076]"
Replace-Literal "from-cyan-400" "from-[#00D084]"
Replace-Literal "from-cyan-500" "from-[#00C076]"

Replace-Literal "via-cyan-50" "via-[#E6EDF7]"
Replace-Literal "via-cyan-100" "via-[#E6EDF7]"
Replace-Literal "via-cyan-200" "via-[#C8A96B]"
Replace-Literal "via-cyan-300" "via-[#00D084]"
Replace-Literal "via-cyan-400" "via-[#00D084]"
Replace-Literal "via-cyan-500" "via-[#00C076]"

Replace-Literal "to-cyan-50" "to-[#E6EDF7]"
Replace-Literal "to-cyan-100" "to-[#E6EDF7]"
Replace-Literal "to-cyan-200" "to-[#C8A96B]"
Replace-Literal "to-cyan-300" "to-[#00C076]"
Replace-Literal "to-cyan-400" "to-[#00D084]"
Replace-Literal "to-cyan-500" "to-[#00C076]"

Replace-Literal "from-emerald-50" "from-[#00C076]"
Replace-Literal "from-emerald-100" "from-[#00C076]"
Replace-Literal "from-emerald-200" "from-[#00D084]"
Replace-Literal "from-emerald-300" "from-[#00C076]"
Replace-Literal "from-emerald-400" "from-[#00D084]"
Replace-Literal "from-emerald-500" "from-[#00C076]"

Replace-Literal "via-emerald-50" "via-[#00C076]"
Replace-Literal "via-emerald-100" "via-[#00C076]"
Replace-Literal "via-emerald-200" "via-[#00D084]"
Replace-Literal "via-emerald-300" "via-[#00C076]"
Replace-Literal "via-emerald-400" "via-[#00D084]"
Replace-Literal "via-emerald-500" "via-[#00C076]"

Replace-Literal "to-emerald-50" "to-[#00C076]"
Replace-Literal "to-emerald-100" "to-[#00C076]"
Replace-Literal "to-emerald-200" "to-[#00D084]"
Replace-Literal "to-emerald-300" "to-[#00C076]"
Replace-Literal "to-emerald-400" "to-[#00D084]"
Replace-Literal "to-emerald-500" "to-[#00C076]"

# Indigo / violet SaaS feel -> premium gold
Replace-Literal "from-indigo-500" "from-[#C8A96B]"
Replace-Literal "via-indigo-500" "via-[#C8A96B]"
Replace-Literal "to-indigo-500" "to-[#C8A96B]"
Replace-Literal "bg-indigo-500" "bg-[#C8A96B]"
Replace-Literal "border-indigo-500" "border-[#C8A96B]"
Replace-Literal "text-indigo-500" "text-[#C8A96B]"

# CTA cleanup
Replace-Literal "bg-gradient-to-r from-white via-[#E6EDF7] to-[#00C076]" "bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076]"
Replace-Literal "bg-gradient-to-r from-white via-[#E6EDF7] to-[#00D084]" "bg-gradient-to-r from-[#00C076] via-[#00D084] to-[#00C076]"
Replace-Literal "text-[#06111d]" "text-[#03140D]"

[System.IO.File]::WriteAllText((Resolve-Path $path), $content, $utf8NoBom)

Write-Host "Done. UTF-8 preserved. File updated: $path" -ForegroundColor Green
Write-Host ""
Write-Host "Remaining old tokens:" -ForegroundColor Yellow
Write-Host "cyan-:" ([regex]::Matches($content, "cyan-")).Count
Write-Host "56,214,255:" ([regex]::Matches($content, "56,214,255")).Count
Write-Host "34,211,238:" ([regex]::Matches($content, "34,211,238")).Count
Write-Host "103,232,249:" ([regex]::Matches($content, "103,232,249")).Count
Write-Host "8,47,73:" ([regex]::Matches($content, "8,47,73")).Count
