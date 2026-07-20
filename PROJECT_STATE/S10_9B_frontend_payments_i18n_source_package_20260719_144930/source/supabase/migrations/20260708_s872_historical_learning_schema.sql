-- S8.72 Supabase Historical Learning Schema
-- SkillEdge AI / UpYourSkills
-- Purpose:
-- - Supabase is the index/brain for historical learning.
-- - Raw candles/features remain in VPS/Object data lake.
-- - This schema stores jobs, file manifests, candidates index, honest outcomes,
--   setup stats, segments, walk-forward validation, promotion policy and Admin AI Ops events.
--
-- Apply in Supabase SQL Editor or via psql against the project database.
-- Safe to re-run: uses IF NOT EXISTS where possible.

begin;

create extension if not exists pgcrypto;

-- 1) Historical learning jobs / run registry.
create table if not exists public.historical_learning_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  job_type text not null,
  status text not null default 'planned',
  storage_version text,
  source text default 'stock-engine',
  years_back integer,
  start_date date,
  end_date date,
  universe_mode text,
  intervals text[] default '{}',
  strategy_slugs text[] default '{}',
  target_win_rate numeric,
  min_closed_trades integer,
  min_validation_windows integer,
  payload jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_learning_jobs_type_status_idx
  on public.historical_learning_jobs (job_type, status, created_at desc);

create index if not exists historical_learning_jobs_dates_idx
  on public.historical_learning_jobs (start_date, end_date);


-- 2) Raw/normalized candle file manifest.
-- Heavy candle rows stay outside Supabase. This table indexes file paths and completeness.
create table if not exists public.historical_data_files (
  id uuid primary key default gen_random_uuid(),
  file_key text not null unique,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  file_kind text not null, -- raw_candles | normalized_candles
  provider text,
  provider_mode text,
  transport text,
  symbol text not null,
  interval text not null,
  start_date date,
  end_date date,
  row_count integer not null default 0,
  file_path text not null,
  file_format text not null default 'jsonl',
  checksum text,
  status text not null default 'ready',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_data_files_symbol_interval_dates_idx
  on public.historical_data_files (symbol, interval, start_date, end_date);

create index if not exists historical_data_files_kind_status_idx
  on public.historical_data_files (file_kind, status);


-- 3) Feature file manifest.
create table if not exists public.historical_feature_files (
  id uuid primary key default gen_random_uuid(),
  file_key text not null unique,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  symbol text not null,
  interval text not null,
  start_date date,
  end_date date,
  feature_version text,
  source_data_file_key text,
  feature_rows integer not null default 0,
  file_path text not null,
  file_format text not null default 'jsonl',
  status text not null default 'ready',
  feature_columns text[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_feature_files_symbol_interval_dates_idx
  on public.historical_feature_files (symbol, interval, start_date, end_date);

create index if not exists historical_feature_files_status_idx
  on public.historical_feature_files (status, created_at desc);


-- 4) Historical setup candidates index.
-- Full/replay payload can remain in JSONB, while searchable columns are indexed.
create table if not exists public.historical_setup_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null unique,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  symbol text not null,
  setup_slug text not null,
  setup_name text,
  direction text not null,
  interval text not null,
  candidate_at timestamptz,
  session_date date,
  session text,
  status text not null default 'historical_candidate',
  score numeric,
  grade text,
  quality_status text,
  risk_reward numeric,
  entry numeric,
  stop numeric,
  targets jsonb not null default '[]'::jsonb,
  reasons text[] default '{}',
  source_file_key text,
  source jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  client_eligible boolean not null default false,
  client_release_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_setup_candidates_setup_date_idx
  on public.historical_setup_candidates (setup_slug, session_date, candidate_at);

create index if not exists historical_setup_candidates_symbol_date_idx
  on public.historical_setup_candidates (symbol, session_date, candidate_at);

create index if not exists historical_setup_candidates_grade_idx
  on public.historical_setup_candidates (grade, quality_status, score desc);

create index if not exists historical_setup_candidates_payload_gin_idx
  on public.historical_setup_candidates using gin (payload);


-- 5) Historical outcomes.
-- This is the honest stats source. Open/no_eval are not wins or losses.
create table if not exists public.historical_outcomes (
  id uuid primary key default gen_random_uuid(),
  outcome_id text not null unique,
  candidate_id text not null references public.historical_setup_candidates(candidate_id) on delete cascade,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  symbol text not null,
  setup_slug text not null,
  direction text not null,
  interval text not null,
  candidate_at timestamptz,
  session_date date,
  result_status text not null, -- worked | failed | open | no_eval | session_close
  terminal_event text,
  result_r numeric,
  mfe_r numeric,
  mae_r numeric,
  entry numeric,
  stop numeric,
  tp1 numeric,
  tp2 numeric,
  first_event_at timestamptz,
  candles_checked integer,
  outcome_version text,
  slippage_model jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  is_closed boolean generated always as (
    result_status in ('worked', 'failed', 'session_close')
  ) stored,
  is_win boolean generated always as (
    result_status = 'worked'
  ) stored,
  is_loss boolean generated always as (
    result_status = 'failed'
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_outcomes_setup_date_idx
  on public.historical_outcomes (setup_slug, session_date, result_status);

create index if not exists historical_outcomes_candidate_idx
  on public.historical_outcomes (candidate_id);

create index if not exists historical_outcomes_closed_idx
  on public.historical_outcomes (is_closed, setup_slug, session_date);

create index if not exists historical_outcomes_payload_gin_idx
  on public.historical_outcomes using gin (payload);


-- 6) Setup stats / calibration summary.
create table if not exists public.historical_setup_stats (
  id uuid primary key default gen_random_uuid(),
  stats_key text not null unique,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  setup_slug text not null,
  direction text,
  interval text,
  segment_key text,
  start_date date,
  end_date date,
  total_trades integer not null default 0,
  closed_trades integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  no_eval integer not null default 0,
  win_rate numeric,
  avg_r numeric,
  expectancy_r numeric,
  avg_mfe_r numeric,
  avg_mae_r numeric,
  max_drawdown_r numeric,
  sample_status text not null default 'research',
  overfit_risk text,
  source jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_setup_stats_setup_idx
  on public.historical_setup_stats (setup_slug, direction, interval, win_rate desc, closed_trades desc);

create index if not exists historical_setup_stats_sample_status_idx
  on public.historical_setup_stats (sample_status, overfit_risk);


-- 7) Segment search results.
create table if not exists public.historical_segments (
  id uuid primary key default gen_random_uuid(),
  segment_key text not null unique,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  setup_slug text not null,
  direction text,
  interval text,
  filters jsonb not null default '{}'::jsonb,
  start_date date,
  end_date date,
  closed_trades integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  win_rate numeric,
  avg_r numeric,
  expectancy_r numeric,
  overfit_risk text,
  status text not null default 'research',
  production_eligible boolean not null default false,
  promising boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_segments_setup_status_idx
  on public.historical_segments (setup_slug, status, production_eligible, win_rate desc);

create index if not exists historical_segments_filters_gin_idx
  on public.historical_segments using gin (filters);


-- 8) Walk-forward / out-of-sample validation.
create table if not exists public.historical_walk_forward_results (
  id uuid primary key default gen_random_uuid(),
  validation_key text not null unique,
  segment_key text references public.historical_segments(segment_key) on delete cascade,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  setup_slug text not null,
  direction text,
  interval text,
  train_start date,
  train_end date,
  validation_start date,
  validation_end date,
  oos_start date,
  oos_end date,
  train_stats jsonb not null default '{}'::jsonb,
  validation_stats jsonb not null default '{}'::jsonb,
  oos_stats jsonb not null default '{}'::jsonb,
  passed boolean not null default false,
  fail_reasons text[] default '{}',
  overfit_risk text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists historical_walk_forward_setup_passed_idx
  on public.historical_walk_forward_results (setup_slug, passed, created_at desc);


-- 9) Strategy promotion / client release policy.
create table if not exists public.strategy_promotion_policy (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null unique,
  setup_slug text not null,
  direction text,
  interval text,
  client_release_allowed boolean not null default false,
  production_candidate boolean not null default false,
  policy_status text not null default 'research_only',
  reason text,
  source_segment_key text,
  source_validation_key text,
  min_win_rate numeric default 0.65,
  min_closed_trades integer default 30,
  requires_positive_expectancy boolean not null default true,
  requires_oos_pass boolean not null default true,
  requires_forward_shadow_pass boolean not null default true,
  reject_overfit_risk_high boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strategy_promotion_policy_setup_idx
  on public.strategy_promotion_policy (setup_slug, policy_status, client_release_allowed);


-- 10) Admin AI Ops feed / audit journal.
create table if not exists public.admin_ai_ops_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  agent_name text not null default 'SkillEdge AI Autonomous Ops',
  event_type text not null,
  severity text not null default 'info',
  title text not null,
  message text,
  setup_slug text,
  symbol text,
  job_key text references public.historical_learning_jobs(job_key) on delete set null,
  source_report_path text,
  source jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_ai_ops_events_type_time_idx
  on public.admin_ai_ops_events (event_type, created_at desc);

create index if not exists admin_ai_ops_events_setup_idx
  on public.admin_ai_ops_events (setup_slug, created_at desc);


-- Updated_at helper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'historical_learning_jobs',
    'historical_data_files',
    'historical_feature_files',
    'historical_setup_candidates',
    'historical_outcomes',
    'historical_setup_stats',
    'historical_segments',
    'historical_walk_forward_results',
    'strategy_promotion_policy'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- RLS: keep research/learning tables private by default.
-- Server/service role bypasses RLS. Client must access through controlled API/Admin Hub only.
alter table public.historical_learning_jobs enable row level security;
alter table public.historical_data_files enable row level security;
alter table public.historical_feature_files enable row level security;
alter table public.historical_setup_candidates enable row level security;
alter table public.historical_outcomes enable row level security;
alter table public.historical_setup_stats enable row level security;
alter table public.historical_segments enable row level security;
alter table public.historical_walk_forward_results enable row level security;
alter table public.strategy_promotion_policy enable row level security;
alter table public.admin_ai_ops_events enable row level security;


-- Admin summary view.
create or replace view public.historical_learning_admin_summary as
select
  (select count(*) from public.historical_learning_jobs) as jobs_count,
  (select count(*) from public.historical_data_files) as data_files_count,
  (select coalesce(sum(row_count), 0) from public.historical_data_files) as data_rows_indexed,
  (select count(*) from public.historical_feature_files) as feature_files_count,
  (select coalesce(sum(feature_rows), 0) from public.historical_feature_files) as feature_rows_indexed,
  (select count(*) from public.historical_setup_candidates) as setup_candidates_count,
  (select count(*) from public.historical_outcomes where is_closed) as closed_outcomes_count,
  (select count(*) from public.historical_segments where production_eligible) as production_eligible_segments_count,
  (select count(*) from public.strategy_promotion_policy where client_release_allowed) as client_release_allowed_policies_count,
  now() as generated_at;


-- Strategy leaderboard view: honest closed-only stats.
create or replace view public.historical_strategy_leaderboard as
select
  setup_slug,
  direction,
  interval,
  count(*) filter (where is_closed) as closed_trades,
  count(*) filter (where is_win) as wins,
  count(*) filter (where is_loss) as losses,
  case
    when count(*) filter (where is_closed) > 0
    then (count(*) filter (where is_win))::numeric / (count(*) filter (where is_closed))::numeric
    else null
  end as win_rate,
  avg(result_r) filter (where is_closed) as avg_r,
  avg(mfe_r) filter (where is_closed) as avg_mfe_r,
  avg(mae_r) filter (where is_closed) as avg_mae_r
from public.historical_outcomes
group by setup_slug, direction, interval;

commit;
