import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}

/**
 * Increment global_stats counters — fire-and-forget, non-fatal.
 * Uses SECURITY DEFINER RPC so anon key is sufficient.
 */
export async function incrementGlobalStats(opts: {
  ofacHit:  boolean;
  highRisk: boolean;
}): Promise<void> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );
    await supabase.rpc('increment_global_stats', {
      inc_wallets:   1,
      inc_ofac:      opts.ofacHit  ? 1 : 0,
      inc_sar:       1,
      inc_cases:     0,
      inc_high_risk: opts.highRisk ? 1 : 0,
    });
  } catch {
    // Non-fatal — approximate counter, failure is acceptable
  }
}
