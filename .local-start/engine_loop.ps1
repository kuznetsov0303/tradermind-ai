Set-Location -LiteralPath "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\services\stock-engine"
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
Write-Host "Starting SkillEdge Engine Loop" -ForegroundColor Green
.\.venv\Scripts\python.exe .\run_engine_loop.py
