-- S8.77A Walk-Forward Supabase Schema Hotfix
-- Fixes PostgREST error:
-- Could not find the 'job_id' column of 'historical_walk_forward_results' in the schema cache
--
-- Safe to run multiple times.

create table if not exists public.historical_walk_forward_results (
  id bigserial primary key
);

alter table public.historical_walk_forward_results
  add column if not exists job_id text,
  add column if not exists setup_slug text,
  add column if not exists direction text,
  add column if not exists interval text,
  add column if not exists window_start date,
  add column if not exists window_end date,
  add column if not exists train_start date,
  add column if not exists train_end date,
  add column if not exists validation_start date,
  add column if not exists validation_end date,
  add column if not exists oos_start date,
  add column if not exists oos_end date,
  add column if not exists train_closed_trades integer default 0,
  add column if not exists train_win_rate numeric,
  add column if not exists train_expectancy_r numeric,
  add column if not exists validation_closed_trades integer default 0,
  add column if not exists validation_win_rate numeric,
  add column if not exists validation_expectancy_r numeric,
  add column if not exists oos_closed_trades integer default 0,
  add column if not exists oos_win_rate numeric,
  add column if not exists oos_expectancy_r numeric,
  add column if not exists walk_forward_pass boolean default false,
  add column if not exists promotion_allowed boolean default false,
  add column if not exists notes jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists historical_walk_forward_results_s877_unique
on public.historical_walk_forward_results (
  setup_slug,
  direction,
  interval,
  window_start,
  window_end
);

create index if not exists historical_walk_forward_results_setup_idx
on public.historical_walk_forward_results (setup_slug, direction, interval);

create index if not exists historical_walk_forward_results_pass_idx
on public.historical_walk_forward_results (walk_forward_pass, promotion_allowed);

alter table public.historical_walk_forward_results enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'historical_walk_forward_results'
      and policyname = 'historical_walk_forward_results_service_role_all'
  ) then
    create policy historical_walk_forward_results_service_role_all
    on public.historical_walk_forward_results
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
  end if;
end
$$;

-- Ask PostgREST/Supabase API to reload schema cache.
notify pgrst, 'reload schema';

select
  's8_77a_walk_forward_supabase_schema_hotfix_v1' as patch_version,
  count(*) filter (where column_name = 'job_id') as has_job_id,
  count(*) filter (where column_name = 'setup_slug') as has_setup_slug,
  count(*) filter (where column_name = 'window_start') as has_window_start,
  count(*) filter (where column_name = 'walk_forward_pass') as has_walk_forward_pass
from information_schema.columns
where table_schema = 'public'
  and table_name = 'historical_walk_forward_results';

