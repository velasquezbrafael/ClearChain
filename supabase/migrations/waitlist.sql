-- ClearChain — Waitlist table
-- Run once in Supabase dashboard: SQL Editor → New Query → paste → Run

create table waitlist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  source     text        not null default 'homepage',
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

-- Public inserts allowed (no auth required); reads are admin-only via service role
create policy "Public insert" on waitlist
  for insert with check (true);
