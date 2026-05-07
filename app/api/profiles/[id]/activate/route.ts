/**
 * POST /api/profiles/[id]/activate
 *
 * Atomically deactivates the currently active profile (if any) and activates
 * the specified profile. The partial-unique index in Postgres enforces that
 * only one profile can have is_active = true per user at any time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the target profile belongs to this user
  const { data: targetProfile, error: fetchError } = await supabase
    .from('risk_profiles')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !targetProfile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  // Deactivate current active profile (if any)
  await supabase
    .from('risk_profiles')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true);

  // Activate the target profile
  const { data: activated, error: activateError } = await supabase
    .from('risk_profiles')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 });
  return NextResponse.json({ profile: activated });
}
