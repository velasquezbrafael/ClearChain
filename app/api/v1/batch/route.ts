/**
 * ClearChain — POST /api/v1/batch
 *
 * Batch address screening endpoint. Accepts up to 100 addresses across ETH,
 * BTC, and TRX chains, runs them in parallel (concurrency cap: 5), and returns
 * a consolidated risk report sorted by risk_score DESC.
 *
 * Rate limiting:
 *   - A batch of N addresses counts as N calls against the daily quota.
 *   - Pre-flight check: if remaining < N, return 429 immediately (no partial use).
 *   - Post-process: single UPDATE increments daily_usage_count by N.
 *
 * Auth resolution (identical to /api/v1/analyze):
 *   1. Authorization: Bearer ck_live_... → API key validation
 *   2. No Bearer → Supabase session cookie (dashboard compatibility)
 *   3. Neither → 401 INVALID_API_KEY
 *
 * Partial results: if one address fails, others still return. Failed addresses
 * appear in results[] with error set and all score fields null.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import {
  validateApiKey,
  checkBatchCapacity,
  incrementBatchUsage,
  type ApiKeyRow,
  type BatchCapacityAllowed,
} from '@/lib/apikeys'
import { resolveENS } from '@/lib/etherscan'
import { validateTronAddress } from '@/lib/tron'
import { runAnalysis, PipelineError } from '@/lib/analyze-pipeline'
import type { BatchResult, BatchSummary, SupportedChain } from '@/lib/types'
import type { WalletAnalysis, ScoringSignal } from '@/types'

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH   = 100
const CONCURRENCY = 5
const SUPPORTED   = ['ETH', 'BTC', 'TRX'] as const

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
// Concurrency-capped runner
//
// Worker-pool pattern: `limit` workers each pull from a shared index.
// Result order is preserved. All errors are caught internally (never throws).
// ---------------------------------------------------------------------------

async function runConcurrent<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length)
  let idx = 0

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (idx < tasks.length) {
        const i = idx++
        try {
          results[i] = { status: 'fulfilled', value: await tasks[i]() }
        } catch (e) {
          results[i] = { status: 'rejected', reason: e }
        }
      }
    },
  )

  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Per-address resolution (validate format / ENS lookup)
// ---------------------------------------------------------------------------

type ResolveOk  = { ok: true;  resolved: string }
type ResolveFail = { ok: false; errorCode: string; errorMsg: string }

async function resolveAddress(
  raw: string,
  chain: SupportedChain,
): Promise<ResolveOk | ResolveFail> {
  const trimmed = raw.trim()

  if (chain === 'BTC') {
    const valid =
      /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed) ||
      /^bc1[a-z0-9]{39,59}$/.test(trimmed)
    if (!valid) return { ok: false, errorCode: 'INVALID_ADDRESS', errorMsg: 'Invalid Bitcoin address format' }
    return { ok: true, resolved: trimmed }
  }

  if (chain === 'TRX') {
    if (!validateTronAddress(trimmed)) {
      return {
        ok: false,
        errorCode: 'INVALID_ADDRESS',
        errorMsg: 'Invalid Tron address format. Must start with T and be 34 characters.',
      }
    }
    return { ok: true, resolved: trimmed }
  }

  // ETH — resolve ENS or validate hex address
  try {
    return { ok: true, resolved: await resolveENS(trimmed) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not resolve address or ENS name'
    return { ok: false, errorCode: 'ENS_RESOLUTION_FAILED', errorMsg: msg }
  }
}

// ---------------------------------------------------------------------------
// Extract compact batch result fields from a full WalletAnalysis
// ---------------------------------------------------------------------------

function extractBatchResult(
  originalAddress: string,
  chain: SupportedChain,
  analysis: WalletAnalysis,
): BatchResult {
  const signals = analysis.riskScore.signals as Record<string, ScoringSignal>

  // Mixer: check common signal names across chains
  const mixerSignal =
    signals['mixer_interaction'] ??
    signals['mixer_usage'] ??
    signals['coinjoin_usage'] ??
    null

  // Top triggered signal by score
  const topSignal = Object.values(signals)
    .filter((s): s is ScoringSignal => s.triggered)
    .sort((a, b) => b.score - a.score)[0]?.name ?? null

  // Triggered typology names
  const typologies = (analysis.typologies ?? [])
    .filter(t => t.triggered)
    .map(t => t.name)

  return {
    address:           originalAddress,
    chain,
    risk_score:        analysis.riskScore.total,
    risk_level:        analysis.riskScore.level,
    ofac_match:        analysis.ofacResult.matched,
    mixer_interaction: mixerSignal?.triggered ?? null,
    top_signal:        topSignal,
    typologies:        typologies.length > 0 ? typologies : [],
    error:             null,
  }
}

// ---------------------------------------------------------------------------
// Build risk distribution summary
// ---------------------------------------------------------------------------

function buildSummary(results: BatchResult[]): BatchSummary {
  const summary: BatchSummary = { critical: 0, high: 0, medium: 0, low: 0, clean: 0 }

  for (const r of results) {
    if (r.error !== null || r.risk_score === null) continue
    if (r.risk_level === 'CRITICAL')   summary.critical++
    else if (r.risk_level === 'HIGH')  summary.high++
    else if (r.risk_level === 'MEDIUM') summary.medium++
    else if (r.risk_level === 'LOW') {
      if (r.risk_score === 0) summary.clean++
      else summary.low++
    }
  }

  return summary
}

// ---------------------------------------------------------------------------
// Serialize Infinity for JSON (use null = unlimited)
// ---------------------------------------------------------------------------

function serializeNum(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// POST — main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 1. Parse + validate body ───────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorJson('INVALID_JSON', 'Invalid JSON in request body', 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorJson('INVALID_JSON', 'Request body must be a JSON object', 400)
  }

  const raw = body as Record<string, unknown>

  if (!Array.isArray(raw.addresses)) {
    return errorJson('BATCH_EMPTY', 'Request body must include an "addresses" array', 400)
  }

  const rawAddresses = raw.addresses as unknown[]

  if (rawAddresses.length === 0) {
    return errorJson('BATCH_EMPTY', 'The "addresses" array must not be empty', 400)
  }

  if (rawAddresses.length > MAX_BATCH) {
    return errorJson(
      'BATCH_TOO_LARGE',
      `Batch size ${rawAddresses.length} exceeds the maximum of ${MAX_BATCH} addresses per request`,
      400,
    )
  }

  // Normalize + validate each entry
  const batchInputs: Array<{ address: string; chain: SupportedChain }> = []
  for (let i = 0; i < rawAddresses.length; i++) {
    const entry = rawAddresses[i]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return errorJson('INVALID_REQUEST', `addresses[${i}] must be an object with an "address" field`, 400)
    }
    const e = entry as Record<string, unknown>
    if (typeof e.address !== 'string' || !e.address.trim()) {
      return errorJson('INVALID_REQUEST', `addresses[${i}].address must be a non-empty string`, 400)
    }
    const chainRaw = typeof e.chain === 'string' ? e.chain.toUpperCase() : 'ETH'
    const chain: SupportedChain = (SUPPORTED as ReadonlyArray<string>).includes(chainRaw)
      ? (chainRaw as SupportedChain)
      : 'ETH'
    batchInputs.push({ address: e.address.trim(), chain })
  }

  const n = batchInputs.length

  // ── 2. Build Supabase client ───────────────────────────────────────────────
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

  // ── 3. Auth resolution ─────────────────────────────────────────────────────
  let userId:        string | null = null
  let apiKeyId:      string | null = null
  let webhookUrl:    string | null = null
  let webhookSecret: string | null = null
  let capacity:      BatchCapacityAllowed | null = null
  let storedKeyRow:  ApiKeyRow | null = null
  let rlHeaders:     Record<string, string> = {}

  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ck_live_')) {
    const rawKey     = authHeader.slice(7)
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

    // Pre-flight: check N calls fit in the window (does NOT increment)
    const batchCapacity = checkBatchCapacity(keyRow, n, supabase)

    if (!batchCapacity.allowed) {
      const retryAfterSec = Math.max(
        0,
        Math.ceil((new Date(batchCapacity.resetAt).getTime() - Date.now()) / 1000),
      )
      return errorJson(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Only ${Number.isFinite(batchCapacity.remaining) ? batchCapacity.remaining : '∞'} calls remain, but this batch requires ${n}. Tier: ${keyRow.tier} (${Number.isFinite(batchCapacity.limit) ? batchCapacity.limit : '∞'} req/24h). Resets at ${batchCapacity.resetAt}.`,
        429,
        {
          limit:     serializeNum(batchCapacity.limit),
          remaining: serializeNum(batchCapacity.remaining),
          reset_at:  batchCapacity.resetAt,
        },
        {
          'Retry-After':           String(retryAfterSec),
          'X-RateLimit-Limit':     Number.isFinite(batchCapacity.limit) ? String(batchCapacity.limit) : '∞',
          'X-RateLimit-Remaining': Number.isFinite(batchCapacity.remaining) ? String(batchCapacity.remaining) : '∞',
          'X-RateLimit-Reset':     String(Math.floor(new Date(batchCapacity.resetAt).getTime() / 1000)),
        },
      )
    }

    capacity      = batchCapacity
    storedKeyRow  = keyRow
    userId        = keyRow.user_id
    apiKeyId      = keyRow.id
    webhookUrl    = keyRow.webhook_url ?? null
    webhookSecret = keyRow.webhook_secret ?? null
    rlHeaders = {
      'X-RateLimit-Limit':     Number.isFinite(capacity.limit) ? String(capacity.limit) : '∞',
      'X-RateLimit-Remaining': Number.isFinite(capacity.remaining) ? String(capacity.remaining) : '∞',
      'X-RateLimit-Reset':     String(Math.floor(new Date(capacity.resetAt).getTime() / 1000)),
    }

  } else if (authHeader) {
    return errorJson(
      'INVALID_API_KEY',
      'Invalid API key format. Authorization header must be: Bearer ck_live_<key>',
      401,
    )

  } else {
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

  // ── 4. Resolve all addresses (validate format / ENS) ──────────────────────
  type ResolvedEntry =
    | { ok: true;  originalAddress: string; resolved: string; chain: SupportedChain }
    | { ok: false; originalAddress: string; chain: SupportedChain; errorCode: string }

  const resolvedEntries: ResolvedEntry[] = await Promise.all(
    batchInputs.map(async (input): Promise<ResolvedEntry> => {
      const r = await resolveAddress(input.address, input.chain)
      if (!r.ok) {
        return { ok: false, originalAddress: input.address, chain: input.chain, errorCode: r.errorCode }
      }
      return { ok: true, originalAddress: input.address, resolved: r.resolved, chain: input.chain }
    }),
  )

  // ── 5. Run analyses with concurrency cap of 5 ─────────────────────────────
  const validEntries = resolvedEntries.filter((e): e is Extract<ResolvedEntry, { ok: true }> => e.ok)

  const tasks = validEntries.map(entry => (): Promise<WalletAnalysis> =>
    runAnalysis(entry.resolved, entry.chain, {
      userId,
      apiKeyId,
      webhookUrl,
      webhookSecret,
      onSave: async (record) => {
        const { error } = await supabase.from('analyses').insert(record)
        if (error) console.error('[v1/batch] save failed:', error.message)
      },
    }).then(r => r.data),
  )

  const settled = await runConcurrent(tasks, CONCURRENCY)

  // ── 6. Single bulk usage increment (after processing) ─────────────────────
  if (storedKeyRow && capacity) {
    incrementBatchUsage(storedKeyRow, n, capacity, supabase)
  }

  // ── 7. Build results array ─────────────────────────────────────────────────
  const results: BatchResult[] = []

  // Pre-resolution failures
  for (const entry of resolvedEntries.filter((e): e is Extract<ResolvedEntry, { ok: false }> => !e.ok)) {
    results.push({
      address: entry.originalAddress, chain: entry.chain,
      risk_score: null, risk_level: null,
      ofac_match: null, mixer_interaction: null,
      top_signal: null, typologies: null,
      error: entry.errorCode,
    })
  }

  // Analysis results
  for (let i = 0; i < validEntries.length; i++) {
    const entry   = validEntries[i]
    const outcome = settled[i]

    if (outcome.status === 'fulfilled') {
      results.push(extractBatchResult(entry.originalAddress, entry.chain, outcome.value))
    } else {
      const err  = outcome.reason
      const code = err instanceof PipelineError ? err.code : 'ANALYSIS_FAILED'
      console.error(`[v1/batch] analysis failed for ${entry.originalAddress}:`, err)
      results.push({
        address: entry.originalAddress, chain: entry.chain,
        risk_score: null, risk_level: null,
        ofac_match: null, mixer_interaction: null,
        top_signal: null, typologies: null,
        error: code,
      })
    }
  }

  // Sort: successful results by risk_score DESC, failures at end
  results.sort((a, b) => {
    if (a.risk_score !== null && b.risk_score !== null) return b.risk_score - a.risk_score
    if (a.risk_score !== null) return -1
    if (b.risk_score !== null) return 1
    return 0
  })

  const processed = results.filter(r => r.error === null).length
  const failed    = results.length - processed
  const summary   = buildSummary(results)

  // ── 8. Compose + return response ──────────────────────────────────────────
  const resetAt = capacity?.resetAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  return NextResponse.json(
    {
      success: true,
      data: { total: n, processed, failed, results, summary },
      meta: {
        rate_limit: {
          limit:     capacity ? serializeNum(capacity.limit) : null,
          remaining: capacity ? serializeNum(capacity.remaining) : null,
          reset_at:  resetAt,
        },
      },
    },
    { status: 200, headers: { ...CORS, ...rlHeaders } },
  )
}
