# SkillEdge Market Data Core

This package defines the canonical provider-agnostic market-event boundary.

## Rules

- Provider-specific records are normalized immediately.
- Downstream scanner, strategy and lifecycle code must not depend on Databento SDK record classes.
- Databento prices use fixed-point integers scaled by 1e9.
- Event and receive timestamps are timezone-aware UTC datetimes.
- MBP-1 records can produce explicit TRADE and BBO events.
- The production stream service is implemented in Day 3 after this contract is frozen and tested.