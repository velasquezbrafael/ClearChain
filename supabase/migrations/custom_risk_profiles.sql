-- ClearChain — Custom Risk Profiles
-- Task 17: Per-user named risk profiles with custom signal weights and thresholds

create table public.risk_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  is_active     boolean not null default false,
  signal_weights jsonb not null default '{
    "ofac_match": 40,
    "mixer_interaction": 25,
    "rapid_fund_movement": 15,
    "high_risk_counterparty": 10,
    "indirect_exposure": 8,
    "volume_anomaly": 5,
    "community_red_flags": 5
  }',
  risk_thresholds jsonb not null default '{
    "medium": 25,
    "high": 50,
    "critical": 75
  }',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table public.risk_profiles enable row level security;

create policy "Users manage own profiles"
  on public.risk_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only one active profile per user at a time
create unique index risk_profiles_one_active
  on public.risk_profiles (user_id)
  where (is_active = true);

-- Index for listing by user
create index risk_profiles_user_id_idx on public.risk_profiles (user_id);

-- Add profile_id foreign key to analyses
alter table public.analyses
  add column if not exists profile_id uuid references public.risk_profiles(id) on delete set null;
