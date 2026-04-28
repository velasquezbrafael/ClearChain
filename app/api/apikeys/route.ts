import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { hashApiKey } from '@/lib/apikeys'

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { data: keys, error } = await supabase
    .from('api_keys')
    .select('id, label, tier, usage_count, daily_usage_count, daily_reset_at, last_used_at, created_at, is_active')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ success: true, keys }, { headers: CORS })
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const body = await request.json()

  if (body.action === 'create') {
    const { rawKey, label } = body as { rawKey: string; label: string }
    if (!rawKey?.startsWith('ck_live_') || !label?.trim()) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400, headers: CORS })
    }

    const keyHash = hashApiKey(rawKey)

    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert({ user_id: user.id, key_hash: keyHash, label: label.trim() })
      .select('id, label, tier, usage_count, last_used_at, created_at, is_active')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS })
    }

    return NextResponse.json({ success: true, key: newKey }, { headers: CORS })
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400, headers: CORS })
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const body = await request.json() as {
    id: string
    webhook_url?: string | null
    webhook_secret?: string | null
  }

  if (!body.id) {
    return NextResponse.json({ success: false, error: 'Missing key id' }, { status: 400, headers: CORS })
  }

  // Validate webhook_url is a proper https:// URL if provided
  if (body.webhook_url) {
    try {
      const parsed = new URL(body.webhook_url)
      if (parsed.protocol !== 'https:') throw new Error('Not https')
    } catch {
      return NextResponse.json(
        { success: false, error: 'webhook_url must be a valid https:// URL' },
        { status: 400, headers: CORS }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  if ('webhook_url' in body) updates.webhook_url = body.webhook_url ?? null
  if ('webhook_secret' in body && body.webhook_secret) updates.webhook_secret = body.webhook_secret

  const { data: updated, error } = await supabase
    .from('api_keys')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, label, tier, usage_count, last_used_at, created_at, is_active, webhook_url')
    .single()

  if (error || !updated) {
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Key not found' },
      { status: error ? 500 : 404, headers: CORS }
    )
  }

  return NextResponse.json({ success: true, key: updated }, { headers: CORS })
}
