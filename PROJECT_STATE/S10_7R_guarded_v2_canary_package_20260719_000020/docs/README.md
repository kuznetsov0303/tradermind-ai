# Guarded V2 Capacity Canary Package

Classification: DAY7D_GUARDED_V2_CANARY_PACKAGE_BLOCKED

This package is not armed and does not authorize execution.

## Universe

- Validated liquid symbols: 250
- Unique symbols: 250
- Production universe remains Core25 until explicit approval.

## Required metrics

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

## Missing metrics

- quoteFreshnessP95Seconds
- rssBytes
- providerErrorCount
- setupCycleMs

## Safety

- No production mutation
- No service restart
- No systemd changes
- No stream symbol changes
- Automatic rollback required at every stage
- Baseline-to-stage deltas required
- Explicit execution approval required
