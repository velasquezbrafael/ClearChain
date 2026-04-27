import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client — bypasses RLS for aggregate counts across all users.
// Never exposed to the browser; this file runs server-side only.
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [walletsRes, ofacRes, sarRes, casesRes] = await Promise.all([
      adminSupabase.from('analyses').select('*', { count: 'exact', head: true }),
      adminSupabase
        .from('analyses')
        .select('*', { count: 'exact', head: true })
        .eq('signals->ofac_match', true),
      adminSupabase
        .from('analyses')
        .select('*', { count: 'exact', head: true })
        .not('sar_draft', 'is', null)
        .neq('sar_draft', ''),
      adminSupabase.from('cases').select('*', { count: 'exact', head: true }),
    ]);

    const data = {
      walletsScreened: walletsRes.count ?? 0,
      ofacHits:        ofacRes.count  ?? 0,
      sarDrafts:       sarRes.count   ?? 0,
      casesOpened:     casesRes.count ?? 0,
    };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    // Always return zeros on error — never 500 to the client.
    return NextResponse.json(
      { walletsScreened: 0, ofacHits: 0, sarDrafts: 0, casesOpened: 0 },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  }
}
