$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (Test-Path ".\.env") {
  Get-Content .\.env | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

if (-not $env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_SIGNALS_BOT_TOKEN) { $env:TELEGRAM_BOT_TOKEN = $env:TELEGRAM_SIGNALS_BOT_TOKEN }
if (-not $env:TELEGRAM_CHAT_ID -and $env:TELEGRAM_SIGNALS_ADMIN_CHAT_ID) { $env:TELEGRAM_CHAT_ID = $env:TELEGRAM_SIGNALS_ADMIN_CHAT_ID }

.\.venv\Scripts\python.exe -m uvicorn app.api.app:app --host 127.0.0.1 --port 8000
