-- ClearChain — API key rate limiting migration
--
-- Adds two columns to support per-key 24-hour rolling rate windows.
--
-- daily_usage_count: number of API calls made within the current 24-hour window.
--
-- daily_reset_at: timestamp of when the current 24-hour window started.
--   Reset logic lives in lib/apikeys.ts (checkAndIncrementUsage) — NOT in a
--   database cron job. Each inbound request checks whether (now - daily_reset_at)
--   exceeds 24 hours; if so, it resets daily_usage_count to 0 and sets
--   daily_reset_at = now(), then proceeds. This keeps the schema simple and
--   avoids scheduling infrastructure.

alter table api_keys add column if not exists daily_usage_count int not null default 0;
alter table api_keys add column if not exists daily_reset_at timestamptz not null default now();
