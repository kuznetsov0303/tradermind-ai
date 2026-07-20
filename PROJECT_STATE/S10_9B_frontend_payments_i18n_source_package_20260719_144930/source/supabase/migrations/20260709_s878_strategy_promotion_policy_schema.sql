-- S8.78 Strategy Promotion Policy Schema
-- Supports S8.78 Promotion Policy Writer.
-- Safe to run multiple times.

create table if not exists public.strategy_promotion_policy (
  id bigserial primary key
);

alter table public.strategy_promotion_policy
  add column if not exists policy_key text,
  add column if not exists setup_slug text,
  add column if not exists direction text,
  add column if not exists interval text,
  add column if not exists status text default 'BLOCKED_RESEARCH_ONLY',
  add column if not exists client_release_allowed boolean default false,
  add column if not exists production_eligible boolean default false,
  add column if not exists telegram_allowed boolean default false,
  add column if not exists manual_approval_required boolean default true,
  add column if not exists forward_shadow_required boolean default true,
  add column if not exists reasons jsonb default '[]'::jsonb,
  add column if not exists walk_forward jsonb default '{}'::jsonb,
  add column if not exists stats jsonb default '{}'::jsonb,
  add column if not exists thresholds jsonb default '{}'::jsonb,
  add column if not exists writer_version text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists strategy_promotion_policy_policy_key_unique
on public.strategy_promotion_policy (policy_key);

create index if not exists strategy_promotion_policy_setup_idx
on public.strategy_promotion_policy (setup_slug, direction, interval);

create index if not exists strategy_promotion_policy_status_idx
on public.strategy_promotion_policy (status, client_release_allowed, production_eligible);

alter table public.strategy_promotion_policy enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'strategy_promotion_policy'
      and policyname = 'strategy_promotion_policy_service_role_all'
  ) then
    create policy strategy_promotion_policy_service_role_all
    on public.strategy_promotion_policy
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
  end if;
end
$$;

notify pgrst, 'reload schema';

select
  's8_78_strategy_promotion_policy_schema_v1' as patch_version,
  count(*) filter (where column_name = 'policy_key') as has_policy_key,
  count(*) filter (where column_name = 'client_release_allowed') as has_client_release_allowed,
  count(*) filter (where column_name = 'production_eligible') as has_production_eligible,
  count(*) filter (where column_name = 'walk_forward') as has_walk_forward
from information_schema.columns
where table_schema = 'public'
  and table_name = 'strategy_promotion_policy';
