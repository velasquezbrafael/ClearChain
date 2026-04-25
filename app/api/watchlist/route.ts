/**
 * ClearChain — /api/watchlist
 *
 * GET  — fetch all watchlist rows for the authed user
 * POST — add an address to the watchlist
 * DELETE — remove an entry by id
 *
 * Required Supabase migration: supabase/migrations/watchlist.sql
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// GET — list all watchlist entries for authed user
export async function GET() {
  const supabase = await getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ watchlist: data ?? [] }, { headers: CORS });
}

// POST — add address to watchlist
export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  let body: { address?: string; chain?: string; label?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  const address = body.address?.trim();
  const chain = body.chain ?? 'ETH';
  const label = body.label?.trim() || null;

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabase
    .from('watchlist')
    .insert({ user_id: user.id, address, chain, label })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — already watching
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already watching this address', code: 'DUPLICATE' }, { status: 409, headers: CORS });
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ entry: data }, { status: 201, headers: CORS });
}

// DELETE — remove by id
export async function DELETE(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400, headers: CORS });
  }

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id); // RLS double-check

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
