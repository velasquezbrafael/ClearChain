/**
 * GET /api/profiles  — list all risk profiles for the authenticated user
 * POST /api/profiles — create a new risk profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SignalWeights, RiskThresholds } from '@/types';

export const dynamic = 'force-dynamic';

const SIGNAL_KEYS: (keyof SignalWeights)[] = [
  'ofac_match',
  'mixer_interaction',
  'rapid_fund_movement',
  'high_risk_counterparty',
  'indirect_exposure',
  'volume_anomaly',
  'community_red_flags',
];

function validateWeights(weights: unknown): weights is SignalWeights {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return false;
  const w = weights as Record<string, unknown>;
  for (const key of SIGNAL_KEYS) {
    if (!(key in w)) return false;
    const v = w[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) return false;
  }
  return true;
}

function validateThresholds(thresholds: unknown): thresholds is RiskThresholds {
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) return false;
  const t = thresholds as Record<string, unknown>;
  const { medium, high, critical } = t;
  if (typeof medium !== 'number' || typeof high !== 'number' || typeof critical !== 'number') return false;
  if (!Number.isInteger(medium) || !Number.isInteger(high) || !Number.isInteger(critical)) return false;
  if (medium < 1 || medium > 99 || high < 1 || high > 99 || critical < 1 || critical > 99) return false;
  if (!(medium < high && high < critical)) return false;
  return true;
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (s) => {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('risk_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check profile count limit
  const { count, error: countError } = await supabase
    .from('risk_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum of 10 profiles per user.' }, { status: 400 });
  }

  let body: { name?: unknown; signal_weights?: unknown; risk_thresholds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, signal_weights, risk_thresholds } = body;

  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 60) {
    return NextResponse.json({ error: 'Profile name must be 1–60 characters.' }, { status: 400 });
  }
  if (!validateWeights(signal_weights)) {
    return NextResponse.json({ error: 'Invalid signal_weights. All 7 keys required, each an integer 0–100.' }, { status: 400 });
  }
  if (!validateThresholds(risk_thresholds)) {
    return NextResponse.json({ error: 'Invalid risk_thresholds. medium, high, critical must be integers 1–99 in strictly ascending order.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('risk_profiles')
    .insert({
      user_id: user.id,
      name: name.trim(),
      signal_weights,
      risk_thresholds,
      is_active: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data }, { status: 201 });
}
