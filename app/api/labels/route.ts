import { NextRequest, NextResponse } from 'next/server';
import { KNOWN_LABELS } from '@/lib/labels';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: 'address param required' }, { status: 400, headers: CORS_HEADERS });
  }

  // Verified tier first (lib/labels.ts)
  const verified = KNOWN_LABELS[address];
  if (verified) {
    return NextResponse.json({
      address,
      label: verified.label,
      category: verified.category,
      confidence: 'verified',
      source: 'clearchain',
    }, { headers: CORS_HEADERS });
  }

  // Community tier from Supabase
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

    const { data } = await supabase
      .from('address_labels')
      .select('label, category, confidence, upvotes, created_at')
      .eq('address', address)
      .order('upvotes', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      return NextResponse.json({
        address,
        label: data.label,
        category: data.category,
        confidence: data.confidence,
        upvotes: data.upvotes,
        source: 'community',
      }, { headers: CORS_HEADERS });
    }
  } catch (err) {
    console.error('[ClearChain/labels] Supabase GET error:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ address, label: null }, { headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS_HEADERS });
  }

  const { address, label, category, chain = 'ETH', source_url } =
    body as Record<string, string>;

  if (!address || !label || !category) {
    return NextResponse.json({ error: 'address, label, category required' }, { status: 400, headers: CORS_HEADERS });
  }

  const ETH_PATTERN = /^0x[a-fA-F0-9]{40}$/;
  const BTC_PATTERN = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/;
  if (!ETH_PATTERN.test(address) && !BTC_PATTERN.test(address)) {
    return NextResponse.json({ error: 'Invalid address format — must be a valid ETH (0x...) or BTC address' }, { status: 400, headers: CORS_HEADERS });
  }

  const VALID_CATEGORIES = ['exchange', 'mixer', 'sanctioned', 'hack', 'defi', 'notable', 'scam', 'other'];
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400, headers: CORS_HEADERS });
  }

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required to submit labels' }, { status: 401, headers: CORS_HEADERS });
  }

  const { error } = await supabase.from('address_labels').insert({
    address: address.toLowerCase(),
    chain,
    label,
    category,
    confidence: 'community',
    source_url: source_url ?? null,
    submitted_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ success: true, address, label, category }, { status: 201, headers: CORS_HEADERS });
}
