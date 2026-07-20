# S8.78 Promotion Policy Writer

Creates research-only promotion policy from latest S8.77 walk-forward report.

Endpoints:
- POST /engine/research/historical-learning/promotion-policy/write
- GET /engine/research/historical-learning/promotion-policy/latest
- GET /engine/research/historical-learning/promotion-policy/status

Supabase SQL:
- services/stock-engine/ops/sql/s878_strategy_promotion_policy_schema.sql

Default behavior is safe:
- client_release_allowed = false
- production_eligible = false
- telegram_allowed = false
- manual_approval_required = true
