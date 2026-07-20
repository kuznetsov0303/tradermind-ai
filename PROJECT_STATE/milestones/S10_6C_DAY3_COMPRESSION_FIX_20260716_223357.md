# S10.6C Day 3 Databento Compression Fix

Generated: 2026-07-16T22:33:57+03:00

Result:
- OK: False
- Classification: DATABENTO_CANARY_STREAM_RUNTIME_GATE_FAILED
- Service active: True
- Status: OK
- Dataset/schema: EQUS.MINI / mbp-1
- Raw records: 1331
- Canonical events: 1419
- Last record: 2026-07-16T19:34:26.881251+00:00
- Last canonical event: 2026-07-16T19:34:26.881251+00:00
- Compression error absent: False
- Last error: 

Fix:
Removed the invalid string compression parameter from db.Live(...).
The SDK now uses its supported default compression configuration.

Rollback:
/opt/skilledge/stock-engine/rollback_snapshots/S10_6C_DAY3_COMPRESSION_FIX_20260716_223357

Not touched:
- API app.py;
- paper account;
- Telegram;
- client gates;
- payments.
