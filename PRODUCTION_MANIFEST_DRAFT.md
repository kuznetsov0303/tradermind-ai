# SkillEdge AI Production Manifest - DRAFT

Generated: 20260714_183205

## Canonical Backend Source of Truth

Current production backend source was recovered from:
/opt/skilledge/stock-engine

Canonical local mirror:
services/stock-engine

## ACTIVE / CANONICAL

- services/stock-engine/app/api/app.py
- services/stock-engine/requirements.txt
- services/stock-engine/ops/scripts/capitalization_aware_backfill_runner.py
- services/stock-engine/ops/scripts/forward_shadow_daily_evaluator.py
- services/stock-engine/ops/scripts/forward_shadow_promotion_gate_report.py
- services/stock-engine/ops/scripts/internal_research_agents_daily.py
- services/stock-engine/ops/scripts/nightly_research_optimizer_controller.py
- services/stock-engine/ops/scripts/s10_paper_entry_guarded_wrapper.py
- services/stock-engine/ops/scripts/s10_paper_evaluation_only_wrapper.py
- services/stock-engine/ops/scripts/universe_v1_overnight_backfill_runner.py
- services/stock-engine/ops/scripts/s10_paper_entry_guarded_daemon.py
- services/stock-engine/ops/scripts/s10_paper_evaluation_only_daemon.py

## INDIRECTLY ACTIVE

- services/stock-engine/ops/scripts/s10_paper_entry_guarded_daemon.py
  - invoked by s10_paper_entry_guarded_wrapper.py
- services/stock-engine/ops/scripts/s10_paper_evaluation_only_daemon.py
  - invoked by s10_paper_evaluation_only_wrapper.py

## LEGACY CANDIDATES - DO NOT DELETE YET

- services/stock-engine/ops/scripts/s10_paper_trading_daemon.py

## GENERATED RUNTIME DATA - NOT CANONICAL SOURCE

- services/stock-engine/data/
- VPS /opt/skilledge/stock-engine/data/
- VPS /opt/skilledge/stock-engine/reports/

## BACKUP / ARCHIVE CANDIDATES

- VPS app/api/app.py.bak_*
- VPS *.bak*
- Local root-level S8_*, S9_*, S10_*
- Historical patch folders
- Historical ZIP bundles
- One-off probe/install scripts
- ops/ops/ duplicate tree candidate

## DO NOT TOUCH WITHOUT EXPLICIT REVIEW

- .env
- .env.*
- secrets / keys
- payment / pricing implementation
- production data stores
- paper accountability ledger
- Telegram/client/research gates
- active systemd unit files

## CURRENT RULE

No full local -> VPS deploy until:
1. source parity is verified,
2. active systemd unit files are reconciled,
3. runtime smoke tests pass,
4. rollback snapshot exists.

## SYSTEMD CANONICAL PARITY

Recovered from VPS on: 20260714_184226

Canonical local systemd directory:
services/stock-engine/ops/systemd

Verified unit count: 31

All recovered SkillEdge systemd units matched VPS SHA256 at recovery time.

Important:
- skilledge-post-close-evidence.service local copy was replaced with current VPS production version.
- VPS-only research, forward-shadow, paper, and backfill units were recovered locally.
- No systemd daemon-reload, restart, enable, disable, deploy, or delete was performed.
