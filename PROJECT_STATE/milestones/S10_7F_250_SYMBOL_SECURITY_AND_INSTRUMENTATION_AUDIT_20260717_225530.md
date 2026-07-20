# S10.7F 250-Symbol Pre-Arm Audit

- OK: False
- Classification: DAY7D_250_SYMBOL_PREARM_AUDIT_BLOCKED
- Target count: 250
- Unique target count: 250
- Flagged symbols: 
- Unknown security types: 250
- Missing metrics: eventsPerSecond, processingLagMs, quoteFreshnessP95Seconds, cpuPercent, snapshotWriteMs, candleCompletenessPercent, providerReconnectCount, providerErrorCount, scannerCycleMs, setupCycleMs
- Arm allowed: False
- Validation errors: SECURITY_TYPE_METADATA_INCOMPLETE, CAPACITY_INSTRUMENTATION_INCOMPLETE
- Next action: BUILD_SECURITY_MASTER_FILTER_AND_FULL_CAPACITY_INSTRUMENTATION

No production mutation.
No service restart.
No systemd edit.
No stream/subscription mutation.
