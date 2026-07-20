param(
  [switch]$Clean
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EngineDir = Join-Path $Root "services\stock-engine"
$LocalDir = Join-Path $Root ".local-start"

New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null

function Stop-Port {
  param([int]$Port)

  $portPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($pidValue in $portPids) {
    if ($pidValue -and $pidValue -ne 0) {
      try {
        Stop-Process -Id $pidValue -Force -ErrorAction Stop
        Write-Host "Stopped PID $($pidValue) on port $($Port)" -ForegroundColor Yellow
      } catch {
        Write-Host "Could not stop PID $($pidValue) on port $($Port): $($_.Exception.Message)" -ForegroundColor Red
      }
    }
  }
}

function Stop-EngineWorkers {
  $patterns = @("run_engine_loop.py", "telegram_cache_consumer.py")
  $processes = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue
  foreach ($proc in $processes) {
    foreach ($pattern in $patterns) {
      if ($proc.CommandLine -and $proc.CommandLine -like "*$pattern*") {
        try {
          Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
          Write-Host "Stopped worker PID $($proc.ProcessId): $pattern" -ForegroundColor Yellow
        } catch {
          Write-Host "Could not stop worker PID $($proc.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
        }
      }
    }
  }
}

if ($Clean) {
  Stop-Port -Port 8000
  Stop-Port -Port 3000
  Stop-EngineWorkers
  Start-Sleep -Seconds 2
}

$apiFile = Join-Path $LocalDir "api.ps1"
$loopFile = Join-Path $LocalDir "engine_loop.ps1"
$tgFile = Join-Path $LocalDir "telegram_consumer.ps1"
$webFile = Join-Path $LocalDir "dashboard.ps1"

$commonEnv = @'
if (Test-Path ".\.env") {
  Get-Content ".\.env" | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      $value = $value.Trim('"')
      $value = $value.Trim("'")
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not $env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_SIGNALS_BOT_TOKEN) {
  $env:TELEGRAM_BOT_TOKEN = $env:TELEGRAM_SIGNALS_BOT_TOKEN
}

if (-not $env:TELEGRAM_CHAT_ID -and $env:TELEGRAM_SIGNALS_ADMIN_CHAT_ID) {
  $env:TELEGRAM_CHAT_ID = $env:TELEGRAM_SIGNALS_ADMIN_CHAT_ID
}

$env:TELEGRAM_CONSUMER_DRY_RUN = "false"
'@

$apiScript = @"
Set-Location -LiteralPath "$EngineDir"
$commonEnv
Write-Host "Starting SkillEdge Stock Engine API on :8000" -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn app.api.app:app --host 127.0.0.1 --port 8000
"@

$loopScript = @"
Set-Location -LiteralPath "$EngineDir"
$commonEnv
Write-Host "Starting SkillEdge Engine Loop" -ForegroundColor Green
.\.venv\Scripts\python.exe .\run_engine_loop.py
"@

$tgScript = @"
Set-Location -LiteralPath "$EngineDir"
$commonEnv
Write-Host "Starting SkillEdge Telegram Consumer" -ForegroundColor Green
.\.venv\Scripts\python.exe .\telegram_cache_consumer.py
"@

$webScript = @"
Set-Location -LiteralPath "$Root"
Write-Host "Starting SkillEdge Dashboard on :3000" -ForegroundColor Green
npm run dev
"@

Set-Content -LiteralPath $apiFile -Value $apiScript -Encoding UTF8
Set-Content -LiteralPath $loopFile -Value $loopScript -Encoding UTF8
Set-Content -LiteralPath $tgFile -Value $tgScript -Encoding UTF8
Set-Content -LiteralPath $webFile -Value $webScript -Encoding UTF8

Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $apiFile)
Start-Sleep -Seconds 3
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $loopFile)
Start-Sleep -Seconds 1
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $tgFile)
Start-Sleep -Seconds 1
Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $webFile)

Write-Host "Started local stack: API :8000, engine loop, Telegram consumer, dashboard :3000" -ForegroundColor Green
Write-Host "Open: http://localhost:3000/dashboard?tab=cockpit" -ForegroundColor Cyan
