import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { hashApiKey } from '@/lib/apikeys'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
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
