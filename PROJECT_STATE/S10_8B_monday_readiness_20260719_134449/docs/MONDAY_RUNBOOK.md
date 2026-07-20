# SkillEdge AI — Monday Guarded Capacity Canary Runbook

## Authorized executor

$([IO.Path]::GetFileName(C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai\S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1))

SHA-256:

$(System.Collections.Specialized.OrderedDictionary.executor.sha256)

The old executor S10_7Y_DAY7D_execute_guarded_capacity_canary.ps1 is forbidden.

## Preconditions

- [ ] Confirm current day is Monday 2026-07-20 or another US trading weekday
- [ ] Confirm current time is between 16:35 and 21:45 Kyiv
- [ ] Confirm US regular session is open
- [ ] Run S10.7X2 adaptive preflight and require OK=True
- [ ] Confirm market and API services are active
- [ ] Confirm current production universe is Core25
- [ ] Confirm S10.8A Y2 offline validation is OK=True
- [ ] Confirm executor SHA-256 matches readiness manifest
- [ ] Do not run old S10.7Y executor
- [ ] Do not run manual paper run-once
- [ ] Do not start paper service
- [ ] Do not reset paper boundary


## Exact command

`powershell
cd "C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai"

powershell -ExecutionPolicy Bypass -File ".\S10_7Y2_DAY7D_execute_guarded_capacity_canary_FIXED.ps1" -ProjectRoot (Get-Location).Path -Execute
`

## Expected stages

25 → 50 → 100 → 150 → 250

Approximate duration: 57 minutes.

## Automatic safety

- rollback at first failed guard
- exact Core25 restore
- exact original systemd drop-in restore
- exact production payload restore
- remove files that did not exist before canary
- no manual paper run-once
- no paper service start
- no boundary reset
- no client/Telegram/paper eligibility change
- no broker or real-money activation

## Post-run checks

- [ ] Confirm classification is COMPLETED_CORE25_RESTORED or ROLLED_BACK
- [ ] Confirm productionUniverseRestoredTo25=True
- [ ] Confirm productionPayloadRestored=True
- [ ] Confirm clientEligibilityChanged=False
- [ ] Confirm telegramEligibilityChanged=False
- [ ] Confirm paperEligibilityChanged=False
- [ ] Confirm paperRunOnceExecuted=False
- [ ] Confirm paperServiceStarted=False
- [ ] Confirm paperBoundaryReset=False
- [ ] Confirm brokerEnabled=False
- [ ] Confirm realMoneyEnabled=False
- [ ] Archive raw, report, and milestone outputs

