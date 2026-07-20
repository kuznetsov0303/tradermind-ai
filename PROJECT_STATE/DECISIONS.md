# SkillEdge AI - Architecture Decisions

Updated: 2026-07-15T20:32:18+03:00

D-001 FINAL: Databento US Equities / EQUS.MINI is the primary real-time market source.

D-002 FINAL: FMP Premium remains an enrichment and historical provider. FMP Ultimate is not purchased for realtime.

D-003 FINAL: Event-driven lifecycle replaces polling as primary execution truth. The five-minute evaluator becomes fallback/reconciliation only.

D-004 FINAL: Client strategy minimum WR is 45%, subject to positive expectancy and full validation.

D-005 FINAL: Dynamic multi-target exits replace a universal fixed 2R target.

D-006 FINAL: AI may create, test and nominate strategies but may not auto-release unvalidated strategies to clients.

D-007 FINAL: Native realtime fanout is built and load-tested first. Pusher is not a launch dependency unless measured evidence requires it.

D-008 FINAL: Every major milestone must update PROJECT_STATE and HANDOFF_LATEST.md.