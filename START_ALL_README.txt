Put start_all_local.ps1 and stop_local_ports.ps1 into the project root:
C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai

Normal start:
.\start_all_local.ps1

If ports are stuck after restart/crash:
.\start_all_local.ps1 -Clean

Manual stop ports:
.\stop_local_ports.ps1

The script opens 4 terminals:
1) Stock Engine API on 127.0.0.1:8000
2) Engine Loop
3) Telegram Consumer
4) Next.js dashboard on localhost:3000
