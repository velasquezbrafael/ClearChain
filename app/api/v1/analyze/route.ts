/**
 * ClearChain — POST /api/v1/analyze
 *
 * Versioned analysis endpoint with API key authentication, per-tier rate limiting,
 * and standardized error envelope. Identical analysis pipeline to /api/analyze —
 * different auth layer and response shape.
 *
 * Auth resolution order:
 *   1. Authorization: Bearer ck_live_... → API key validation + rate limit check
 *   2. No Bearer header → Supabase session cookie (dashboard compatibility)
 *   3. Neither → 401 INVALID_API_KEY
 *
 * Success envelope:  { "success": true,  "data": { ...all fields... } }
 * Error envelope:    { "success": false, "error": { "code": "...", "message": "..." } }
 *
 * Rate limit headers (API key requests only):
 *   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (Unix epoch seconds)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { validateApiKey, checkAndIncrementUsage } from '@/lib/apikeys'
import { resolveENS } from '@/lib/etherscan'
import { validateTronAddress } from '@/lib/tron'
import { runAnalysis, PipelineError } from '@/lib/analyze-pipeline'

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function errorJson(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(
    { success: false, error: { code, message, ...extra } },
    { status, headers: { ...CORS, ...extraHeaders } },
  )
}

// ---------------------------------------------------------------------------
// POST — main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorJson('INVALID_JSON', 'Invalid JSON in request body', 400)
  }

  if (!body || typeof body !== 'object') {
    return errorJson('INVALID_JSON', 'Request body must be a JSON object', 400)
  }

  const raw = body as Record<string, unknown>
  const rawAddress = raw.address
  const rawChain   = raw.chain

  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return errorJson('INVALID_ADDRESS', 'Request body must include a non-empty "address" field', 400)
  }

  // ── 2. Validate chain ──────────────────────────────────────────────────────
  const SUPPORTED = ['ETH', 'BTC', 'TRX'] as const
  const chainUpper = typeof rawChain === 'string' ? rawChain.toUpperCase() : 'ETH'
  if (!SUPPORTED.includes(chainUpper as (typeof SUPPORTED)[number])) {
    return errorJson(
      'UNSUPPORTED_CHAIN',
      `Chain "${rawChain}" is not supported. Supported chains: ETH, BTC, TRX`,
      400,
    )
  }
  const chain = chainUpper as 'ETH' | 'BTC' | 'TRX'

  // ── 3. Validate + resolve address ──────────────────────────────────────────
  let address: string
  const trimmed = rawAddress.trim()

  if (chain === 'BTC') {
    const valid =
      /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed) ||
      /^bc1[a-z0-9]{39,59}$/.test(trimmed)
    if (!valid) return errorJson('INVALID_ADDRESS', 'Invalid Bitcoin address format', 400)
    address = trimmed

  } else if (chain === 'TRX') {
    if (!validateTronAddress(trimmed)) {
      return errorJson(
        'INVALID_ADDRESS',
        'Invalid Tron address format. Must start with T and be 34 characters.',
        400,
      )
    }
    address = trimmed

  } else {
    // ETH — resolve ENS or validate hex address
    try {
      address = await resolveENS(trimmed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resolve address or ENS name'
      return errorJson('ENS_RESOLUTION_FAILED', msg, 400)
    }
  }

  // ── 4. Build Supabase client ────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()  { return cookieStore.getAll() },
        setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    },
  )

  // ── 5. Auth resolution ─────────────────────────────────────────────────────
  let userId:        string | null = null
  let apiKeyId:      string | null = null
  let webhookUrl:    string | null = null
  let webhookSecret: string | null = null
  let rlHeaders: Record<string, string> = {}

  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ck_live_')) {
    // ── API key path ──────────────────────────────────────────────────────────
    const rawKey    = authHeader.slice(7) // strip "Bearer "
    const validation = await validateApiKey(rawKey, supabase)

    if (!validation.valid) {
      return errorJson(
        validation.code,
        validation.code === 'KEY_INACTIVE'
          ? 'This API key has been revoked. Generate a new key in your ClearChain dashboard.'
          : 'Invalid API key. Provide a valid ck_live_... key in the Authorization header.',
        401,
      )
    }

    const { keyRow } = validation
    const usage = await checkAndIncrementUsage(keyRow, supabase)

    if (!usage.allowed) {
      const retryAfterSec = Math.max(
        0,
        Math.ceil((new Date(usage.resetAt).getTime() - Date.now()) / 1000),
      )
      return errorJson(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. ${usage.limit} requests per 24h on ${keyRow.tier} tier. Resets at ${usage.resetAt}.`,
        429,
        { limit: usage.limit, used: usage.used, reset_at: usage.resetAt },
        {
          'Retry-After':        String(retryAfterSec),
          'X-RateLimit-Limit':  String(usage.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset':  String(Math.floor(new Date(usage.resetAt).getTime() / 1000)),
        },
      )
    }

    userId        = keyRow.user_id
    apiKeyId      = keyRow.id
    webhookUrl    = keyRow.webhook_url ?? null
    webhookSecret = keyRow.webhook_secret ?? null
    rlHeaders = {
      'X-RateLimit-Limit':     usage.limit === Infinity ? '∞' : String(usage.limit),
      'X-RateLimit-Remaining': usage.remaining === Infinity ? '∞' : String(usage.remaining),
      'X-RateLimit-Reset':     String(Math.floor(new Date(usage.resetAt).getTime() / 1000)),
    }

  } else if (authHeader) {
    // Explicit Authorization header but not a ck_live_ key → reject immediately
    return errorJson(
      'INVALID_API_KEY',
      'Invalid API key format. Authorization header must be: Bearer ck_live_<key>',
      401,
    )

  } else {
    // ── Session cookie fallback (dashboard compatibility) ─────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorJson(
        'INVALID_API_KEY',
        'Authentication required. Provide a valid API key in the Authorization header, or sign in to use session auth.',
        401,
      )
    }
    userId = user.id
  }

  // ── 6. Run analysis pipeline ───────────────────────────────────────────────
  try {
    const result = await runAnalysis(address, chain, {
      userId,
      apiKeyId,
      webhookUrl,
      webhookSecret,
      onSave: async (record) => {
        const { error } = await supabase.from('analyses').insert(record)
        if (error) console.error('[v1/analyze] save failed:', error.message)
      },
    })

    // Merge WalletAnalysis + top-level fields into a single data envelope
    const responseData = {
      ...result.data,
      narrative:       result.narrative,
      sarDraft:        result.sarDraft,
      hopData:         result.hopData,
      resolvedAddress: result.resolvedAddress,
    }

    return NextResponse.json(
      { success: true, data: responseData },
      { status: 200, headers: { ...CORS, ...rlHeaders } },
    )

  } catch (err) {
    if (err instanceof PipelineError) {
      return errorJson(err.code, err.message, err.status, undefined, rlHeaders)
    }
    const msg    = err instanceof Error ? err.message : 'Analysis failed'
    const s      = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined
    const status = s && s >= 400 && s < 600 ? s : 500
    return errorJson('ANALYSIS_FAILED', msg, status, undefined, rlHeaders)
  }
}
