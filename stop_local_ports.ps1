$ErrorActionPreference = "Continue"

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

Stop-Port -Port 8000
Stop-Port -Port 3000

Write-Host "Local stack ports/workers stopped." -ForegroundColor Green
