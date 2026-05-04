-- Atomic increment function for global_stats
-- Called after every successful wallet analysis via supabase.rpc()
CREATE OR REPLACE FUNCTION increment_global_stats(
  inc_wallets   int DEFAULT 0,
  inc_ofac      int DEFAULT 0,
  inc_sar       int DEFAULT 0,
  inc_cases     int DEFAULT 0,
  inc_high_risk int DEFAULT 0
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO global_stats (id, wallets_screened, ofac_hits, sar_drafts, cases_opened, high_risk_wallets)
  VALUES (1, inc_wallets, inc_ofac, inc_sar, inc_cases, inc_high_risk)
  ON CONFLICT (id) DO UPDATE SET
    wallets_screened  = global_stats.wallets_screened  + EXCLUDED.wallets_screened,
    ofac_hits         = global_stats.ofac_hits         + EXCLUDED.ofac_hits,
    sar_drafts        = global_stats.sar_drafts        + EXCLUDED.sar_drafts,
    cases_opened      = global_stats.cases_opened      + EXCLUDED.cases_opened,
    high_risk_wallets = global_stats.high_risk_wallets + EXCLUDED.high_risk_wallets;
$$;

-- Allow anon + authenticated callers (SECURITY DEFINER bypasses RLS)
GRANT EXECUTE ON FUNCTION increment_global_stats TO anon, authenticated;
