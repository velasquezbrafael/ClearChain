/**
 * POST /api/apikeys/test-webhook
 *
 * Fires a test payload to the webhook_url configured on an API key and returns
 * the upstream HTTP status so the user knows if their endpoint is reachable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createHmac } from 'crypto'

export const dynamic = 'force-dynamic';

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
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const body = await request.json() as { id?: string }
  if (!body.id) {
    return NextResponse.json({ ok: false, error: 'Missing key id' }, { status: 400, headers: CORS })
  }

  const { data: key } = await supabase
    .from('api_keys')
    .select('id, webhook_url, webhook_secret')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single()

  if (!key) {
    return NextResponse.json({ ok: false, error: 'Key not found' }, { status: 404, headers: CORS })
  }

  const webhookUrl = (key as Record<string, unknown>).webhook_url as string | null
  if (!webhookUrl) {
    return NextResponse.json({ ok: false, error: 'No webhook URL configured on this key' }, { status: 400, headers: CORS })
  }

  const webhookSecret = (key as Record<string, unknown>).webhook_secret as string | null

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    api_key_id: key.id,
    data: {
      address: '0x742d35Cc6634C0532925a3b8D4C9C1CC2b4b9d26',
      chain: 'ETH',
      risk_score: 42,
      risk_level: 'MEDIUM',
      signals: {
        ofac_match: false,
        mixer_interaction: false,
        rapid_fund_movement: true,
        high_volume_activity: false,
        new_wallet_high_value: false,
        dormancy_break: false,
      },
      typologies: [],
      narrative: 'This is a test webhook delivery from ClearChain. If you received this, your endpoint is correctly configured.',
      sar_draft: '',
      analyzed_at: new Date().toISOString(),
    },
  }

  try {
    const bodyStr = JSON.stringify(testPayload)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ClearChain-Webhook/1.0',
    }

    if (webhookSecret) {
      const sig = createHmac('sha256', webhookSecret).update(bodyStr).digest('hex')
      headers['X-ClearChain-Signature'] = `sha256=${sig}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      return NextResponse.json({ ok: true, status: response.status }, { headers: CORS })
    } else {
      return NextResponse.json(
        { ok: false, error: `Endpoint returned ${response.status} ${response.statusText}`, status: response.status },
        { headers: CORS }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request failed'
    return NextResponse.json({ ok: false, error: msg }, { headers: CORS })
  }
}
