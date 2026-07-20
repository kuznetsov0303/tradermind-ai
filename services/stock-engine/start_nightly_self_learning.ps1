$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

.\.venv\Scripts\python.exe .\run_nightly_self_learning.py --lookback-days 3 --max-days 3 --min-closed 10
