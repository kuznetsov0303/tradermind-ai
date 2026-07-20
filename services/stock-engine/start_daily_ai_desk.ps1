$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

.\.venv\Scripts\python.exe .\run_daily_ai_desk.py --loop --interval-seconds 300 --start-kyiv 11:00 --end-kyiv 23:00
