import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client — bypasses RLS for the global_stats single-row lookup.
// Never exposed to the browser; this file runs server-side only.
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data } = await adminSupabase
      .from('global_stats')
      .select('wallets_screened, ofac_hits, sar_drafts, cases_opened, high_risk_wallets')
      .eq('id', 1)
      .single();

    return NextResponse.json(
      {
        walletsScreened: data?.wallets_screened  ?? 0,
        ofacHits:        data?.ofac_hits         ?? 0,
        sarDrafts:       data?.sar_drafts         ?? 0,
        casesOpened:     data?.cases_opened       ?? 0,
        highRiskWallets: data?.high_risk_wallets  ?? 0,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch {
    return NextResponse.json(
      { walletsScreened: 0, ofacHits: 0, sarDrafts: 0, casesOpened: 0, highRiskWallets: 0 },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }
}
