# SkillEdge AI - Active Risks

Updated: 2026-07-15T20:32:18+03:00

R-001: Current paper performance is not investor-grade proof because polling can miss intrabar order and produce optimistic fills.
Mitigation: real-time event-driven lifecycle plus conservative fills.

R-002: Full all-symbol Databento processing plus 1000-client fanout is not yet load-tested on the current VPS.
Mitigation: build efficiently, measure, then upgrade only if evidence requires it.

R-003: SQLite/Supabase semantic divergence exists.
Mitigation: explicit canonical ownership and final reconciliation.

R-004: Automatic strategy generation can overfit.
Mitigation: holdout, OOS, walk-forward, sample thresholds, forward shadow and manual production approval.

R-005: Native realtime fanout may or may not satisfy final 1000-client SLA.
Mitigation: final load test before considering Pusher.

R-006: Localization scope must be frozen and completed consistently.
Mitigation: canonical English, terminology glossary, missing-key checks, hardcoded-string checks, contextual review and visual QA.