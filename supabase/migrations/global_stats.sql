-- ClearChain — global_stats migration
-- Run once in the Supabase SQL Editor.
-- Creates a single-row counter table, seeds it from live data,
-- enables Realtime, and wires up Postgres triggers on analyses + cases.

-- 1. Create the global_stats table (single row)
create table if not exists global_stats (
  id                 int    primary key default 1,
  wallets_screened   bigint not null default 0,
  ofac_hits          bigint not null default 0,
  sar_drafts         bigint not null default 0,
  cases_opened       bigint not null default 0,
  high_risk_wallets  bigint not null default 0,
  constraint single_row check (id = 1)
);

-- 2. Seed with current real counts from the analyses table
insert into global_stats (
  id,
  wallets_screened,
  ofac_hits,
  sar_drafts,
  cases_opened,
  high_risk_wallets
)
select
  1,
  count(*),
  count(*) filter (where (signals->'ofac_match'->>'triggered')::boolean = true),
  count(*) filter (where sar_draft is not null and sar_draft <> ''),
  0,  -- cases seeded separately below
  count(*) filter (where risk_level in ('HIGH', 'CRITICAL'))
from analyses
on conflict (id) do update set
  wallets_screened  = excluded.wallets_screened,
  ofac_hits         = excluded.ofac_hits,
  sar_drafts        = excluded.sar_drafts,
  high_risk_wallets = excluded.high_risk_wallets;

-- Seed cases_opened from the cases table
update global_stats
set cases_opened = (select count(*) from cases)
where id = 1;

-- 3. RLS — public read, no client writes
alter table global_stats enable row level security;

create policy "public read global_stats"
  on global_stats for select using (true);

-- 4. Enable Realtime on this table
alter publication supabase_realtime add table global_stats;

-- 5. Trigger: increment stats on every new analysis
create or replace function _increment_analysis_stats()
returns trigger language plpgsql security definer as $$
begin
  update global_stats set
    wallets_screened  = wallets_screened + 1,
    ofac_hits         = ofac_hits + (
      case when (new.signals->'ofac_match'->>'triggered')::boolean = true then 1 else 0 end
    ),
    sar_drafts        = sar_drafts + (
      case when new.sar_draft is not null and new.sar_draft <> '' then 1 else 0 end
    ),
    high_risk_wallets = high_risk_wallets + (
      case when new.risk_level in ('HIGH', 'CRITICAL') then 1 else 0 end
    )
  where id = 1;
  return new;
end;
$$;

drop trigger if exists trg_analysis_stats on analyses;
create trigger trg_analysis_stats
  after insert on analyses
  for each row execute function _increment_analysis_stats();

-- 6. Trigger: increment cases_opened on every new case
create or replace function _increment_case_stats()
returns trigger language plpgsql security definer as $$
begin
  update global_stats set cases_opened = cases_opened + 1 where id = 1;
  return new;
end;
$$;

drop trigger if exists trg_case_stats on cases;
create trigger trg_case_stats
  after insert on cases
  for each row execute function _increment_case_stats();
