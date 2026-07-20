# S8.72 Supabase Historical Learning Schema

## Purpose

Supabase/Postgres is the historical learning control database.

Heavy raw candles and feature files stay in VPS/Object data lake:

`	ext
/opt/skilledge/stock-engine/data/historical_learning/raw_candles
/opt/skilledge/stock-engine/data/historical_learning/normalized_candles
/opt/skilledge/stock-engine/data/historical_learning/features
`

Supabase stores:

`	ext
historical_learning_jobs
historical_data_files
historical_feature_files
historical_setup_candidates
historical_outcomes
historical_setup_stats
historical_segments
historical_walk_forward_results
strategy_promotion_policy
admin_ai_ops_events
`

## Apply

Use Supabase SQL Editor and run:

`	ext
supabase/migrations/20260708_s872_historical_learning_schema.sql
`

or apply the same file:

`	ext
services/stock-engine/ops/sql/s872_historical_learning_schema.sql
`

## Safety

- Does not insert fake results.
- Does not mark open/no_eval as wins/losses.
- Does not expose research data to clients.
- RLS is enabled by default.
- Backend/admin should access this through service role or controlled server API.