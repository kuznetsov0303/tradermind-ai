# S8.77A Walk-Forward Supabase Schema Hotfix

This patch fixes the Supabase/PostgREST schema mismatch for:

`public.historical_walk_forward_results`

The S8.77 engine writes `job_id`, `setup_slug`, `direction`, `interval`, window dates, train/validation/OOS metrics, `walk_forward_pass`, `promotion_allowed`, and `notes`.

Run the SQL from:

`services/stock-engine/ops/sql/s877a_walk_forward_supabase_schema_hotfix.sql`

in Supabase SQL Editor, then rerun S8.77 walk-forward.
