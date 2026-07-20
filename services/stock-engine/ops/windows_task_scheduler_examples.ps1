# Run from elevated PowerShell after editing paths if needed.

$Root = "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\services\stock-engine"

# Daily AI desk loop at 10:55 Kyiv every weekday.
schtasks /Create /F /TN "SkillEdge Daily AI Desk" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 10:55 /TR "powershell.exe -ExecutionPolicy Bypass -File `"$Root\start_daily_ai_desk.ps1`""

# Nightly self-learning at 23:35 Kyiv every weekday.
schtasks /Create /F /TN "SkillEdge Nightly Self Learning" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 23:35 /TR "powershell.exe -ExecutionPolicy Bypass -File `"$Root\start_nightly_self_learning.ps1`""

# Stock Engine API at Windows logon.
schtasks /Create /F /TN "SkillEdge Stock Engine API" /SC ONLOGON /TR "powershell.exe -ExecutionPolicy Bypass -File `"$Root\start_stock_engine_server.ps1`""
