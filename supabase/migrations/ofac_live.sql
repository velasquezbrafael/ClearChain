-- ClearChain — Live OFAC attribution tables
-- Run once in Supabase dashboard: SQL Editor → New Query → paste → Run

-- ── ofac_addresses ────────────────────────────────────────────────────────────
-- Populated and kept fresh by /api/cron/refresh-ofac (runs every 6 hours).
-- Primary key is (address, chain) so upserts are idempotent.

create table if not exists ofac_addresses (
  address     text not null,
  chain       text not null,          -- 'ETH' | 'BTC' | 'SOL' | 'TRX' | 'OTHER'
  entity_name text not null,
  sdn_uid     text,                   -- OFAC internal entry UID for traceability
  synced_at   timestamptz default now(),
  primary key (address, chain)
);

-- No RLS — server-side service role only; never exposed to client
-- Index for fast lookups during analysis
create index if not exists idx_ofac_addresses_address on ofac_addresses (lower(address));
create index if not exists idx_ofac_addresses_chain   on ofac_addresses (chain);

-- ── ofac_sync_log ─────────────────────────────────────────────────────────────
-- Audit trail for every sync run. Useful for monitoring + debugging.

create table if not exists ofac_sync_log (
  id          bigserial primary key,
  ran_at      timestamptz default now(),
  duration_ms int,
  eth_count   int default 0,
  btc_count   int default 0,
  sol_count   int default 0,
  trx_count   int default 0,
  other_count int default 0,
  total_count int default 0,
  removed     int default 0,          -- addresses deleted (no longer on OFAC list)
  status      text default 'ok',      -- 'ok' | 'error'
  error       text
);
