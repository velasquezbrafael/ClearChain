-- ClearChain — Watchlist table
-- Run once in Supabase dashboard: SQL Editor → New Query → paste → Run

create table watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  address text not null,
  chain text not null default 'ETH',
  label text,
  last_risk_level text,
  last_risk_score integer,
  last_checked_at timestamptz,
  added_at timestamptz default now(),
  unique(user_id, address)
);

alter table watchlist enable row level security;

create policy "users own watchlist" on watchlist
  for all using (auth.uid() = user_id);
