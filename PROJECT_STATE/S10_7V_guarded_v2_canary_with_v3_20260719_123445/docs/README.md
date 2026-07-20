# S10.7V Guarded V2 Canary With V3

This package is built but not armed.

## Universe

- Symbols: 250
- Unique symbols: 250
- Production must remain Core25 until explicit execution approval.

## Metrics

- rawRecordsPerSecond
- marketEventsPerSecond
- processingLagP95Ms
- quoteFreshnessP95Seconds
- cpuPercent
- rssBytes
- snapshotWriteLatencyMs
- candleCompletenessPercent
- providerReconnectCount
- providerErrorCount
- scannerCycleMs
- setupCycleMs

## Stages

- 25 baseline: 5 minutes
- 50 micro-canary: 5 minutes
- 100 micro-canary: 5 minutes
- 150 intermediate: 10 minutes
- 250 final capacity: 30 minutes

## Hard rules

- No manual paper run-once
- No paper service start
- No paper boundary reset
- No client/Telegram/paper eligibility change
- No broker or real-money execution
- Automatic rollback to Core25 on any failed guard
- Explicit execution approval required
