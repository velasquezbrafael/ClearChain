/**
 * PUT /api/profiles/[id]    — update a risk profile
 * DELETE /api/profiles/[id] — delete a risk profile (with guards)
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: unknown; signal_weights?: unknown; risk_thresholds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, signal_weights, risk_thresholds } = body;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 60) {
      return NextResponse.json({ error: 'Profile name must be 1–60 characters.' }, { status: 400 });
    }
    update.name = name.trim();
  }

  if (signal_weights !== undefined) {
    if (!validateWeights(signal_weights)) {
      return NextResponse.json({ error: 'Invalid signal_weights. All 7 keys required, each an integer 0–100.' }, { status: 400 });
    }
    update.signal_weights = signal_weights;
  }

  if (risk_thresholds !== undefined) {
    if (!validateThresholds(risk_thresholds)) {
      return NextResponse.json({ error: 'Invalid risk_thresholds. medium, high, critical must be integers 1–99 in strictly ascending order.' }, { status: 400 });
    }
    update.risk_thresholds = risk_thresholds;
  }

  const { data, error } = await supabase
    .from('risk_profiles')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  return NextResponse.json({ profile: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch the profile to check guards
  const { data: profile, error: fetchError } = await supabase
    .from('risk_profiles')
    .select('id, is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  if (profile.is_active) {
    return NextResponse.json({ error: 'Deactivate this profile before deleting it.' }, { status: 400 });
  }

  // Guard: cannot delete if it's the user's only profile
  const { count } = await supabase
    .from('risk_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Cannot delete your only profile.' }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from('risk_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
