import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Key generation + hashing
// ---------------------------------------------------------------------------

export function generateApiKey(): string {
  return `ck_live_${crypto.randomBytes(16).toString('hex')}`
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// ---------------------------------------------------------------------------
// Tier limits (requests per 24-hour window)
// ---------------------------------------------------------------------------

const TIER_LIMITS: Record<string, number> = {
  free:     100,
  analyst:  2000,
  team:     Infinity,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyRow {
  id: string
  user_id: string
  tier: string
  daily_usage_count: number
  daily_reset_at: string    // ISO timestamp — when the current 24h window started
  usage_count: number       // all-time request count
  webhook_url?: string | null
  webhook_secret?: string | null
}

export type ValidateResult =
  | { valid: false; code: 'INVALID_API_KEY' | 'KEY_INACTIVE' }
  | { valid: true; keyRow: ApiKeyRow }

export interface UsageAllowed {
  allowed: true
  limit: number
  remaining: number
  resetAt: string  // ISO timestamp — when the current window expires
}

export interface UsageDenied {
  allowed: false
  limit: number
  used: number
  resetAt: string
}

export type UsageResult = UsageAllowed | UsageDenied

// ---------------------------------------------------------------------------
// validateApiKey
//
// Looks up the hashed key in Supabase.
// Returns { valid: false } if the key doesn't exist or is inactive.
// Returns { valid: true, keyRow } on success.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function validateApiKey(rawKey: string, supabase: SupabaseClient<any>): Promise<ValidateResult> {
  const keyHash = hashApiKey(rawKey)

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id, user_id, tier, is_active, daily_usage_count, daily_reset_at, usage_count, webhook_url, webhook_secret')
    .eq('key_hash', keyHash)
    .single()

  if (!apiKey) return { valid: false, code: 'INVALID_API_KEY' }
  if (!apiKey.is_active) return { valid: false, code: 'KEY_INACTIVE' }

  return {
    valid: true,
    keyRow: {
      id:                 apiKey.id as string,
      user_id:            apiKey.user_id as string,
      tier:               (apiKey.tier as string) ?? 'free',
      daily_usage_count:  (apiKey.daily_usage_count as number) ?? 0,
      daily_reset_at:     (apiKey.daily_reset_at as string) ?? new Date().toISOString(),
      usage_count:        (apiKey.usage_count as number) ?? 0,
      webhook_url:        (apiKey.webhook_url as string | null) ?? null,
      webhook_secret:     (apiKey.webhook_secret as string | null) ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// checkAndIncrementUsage
//
// Checks whether the key is within its 24-hour window limit.
// - If the window has expired (now - daily_reset_at > 24h), resets the counter.
// - Compares the current count against the tier limit.
// - If over limit: returns { allowed: false }.
// - If under limit: fires a non-blocking Supabase update (daily_usage_count++,
//   usage_count++, last_used_at = now) and returns { allowed: true }.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Batch capacity helpers
// ---------------------------------------------------------------------------

export interface BatchCapacityAllowed {
  allowed: true
  limit: number
  /** Remaining calls AFTER the batch is consumed. Infinity for team tier. */
  remaining: number
  resetAt: string
  /** Window-reset timestamp tracked locally (may differ from keyRow if window rolled over) */
  effectiveResetAt: string
  /** Current usage count (pre-batch, after any window expiry) */
  currentUsage: number
}

export interface BatchCapacityDenied {
  allowed: false
  limit: number
  /** Remaining calls currently available (< n). Infinity for team tier. */
  remaining: number
  resetAt: string
}

export type BatchCapacityResult = BatchCapacityAllowed | BatchCapacityDenied

/**
 * checkBatchCapacity — pre-flight check for batch requests.
 *
 * Checks whether the key has at least `n` calls remaining in the current
 * 24h window. Does NOT increment any counters — call incrementBatchUsage
 * after processing completes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkBatchCapacity(keyRow: ApiKeyRow, n: number, supabase: SupabaseClient<any>): BatchCapacityResult {
  void supabase // not used here — kept for API symmetry / future use
  const limit    = TIER_LIMITS[keyRow.tier] ?? TIER_LIMITS.free
  const now      = Date.now()
  const windowMs = 24 * 60 * 60 * 1000

  const windowStart   = new Date(keyRow.daily_reset_at).getTime()
  const windowExpired = (now - windowStart) > windowMs
  const currentUsage  = windowExpired ? 0 : keyRow.daily_usage_count
  const effectiveResetAt = windowExpired ? new Date().toISOString() : keyRow.daily_reset_at
  const resetAt = new Date(new Date(effectiveResetAt).getTime() + windowMs).toISOString()

  const remaining = limit === Infinity ? Infinity : limit - currentUsage

  if (limit !== Infinity && currentUsage + n > limit) {
    return { allowed: false, limit, remaining, resetAt }
  }

  return {
    allowed:          true,
    limit,
    remaining:        limit === Infinity ? Infinity : remaining - n,
    resetAt,
    effectiveResetAt,
    currentUsage,
  }
}

/**
 * incrementBatchUsage — fire-and-forget bulk counter update.
 *
 * Increments daily_usage_count by `n` in a single UPDATE. Call this after
 * processing completes. Never awaited — errors are silently ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function incrementBatchUsage(keyRow: ApiKeyRow, n: number, capacity: BatchCapacityAllowed, supabase: SupabaseClient<any>): void {
  supabase
    .from('api_keys')
    .update({
      daily_usage_count: capacity.currentUsage + n,
      daily_reset_at:    capacity.effectiveResetAt,
      usage_count:       keyRow.usage_count + n,
      last_used_at:      new Date().toISOString(),
    })
    .eq('id', keyRow.id)
    .then(() => {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkAndIncrementUsage(keyRow: ApiKeyRow, supabase: SupabaseClient<any>): Promise<UsageResult> {
  const limit     = TIER_LIMITS[keyRow.tier] ?? TIER_LIMITS.free
  const now       = Date.now()
  const windowMs  = 24 * 60 * 60 * 1000

  const windowStart   = new Date(keyRow.daily_reset_at).getTime()
  const windowExpired = (now - windowStart) > windowMs

  // If the window has rolled over, treat as fresh start
  const currentUsage = windowExpired ? 0 : keyRow.daily_usage_count
  const newResetAt   = windowExpired ? new Date().toISOString() : keyRow.daily_reset_at

  // When does this window expire?
  const resetAt = new Date(new Date(newResetAt).getTime() + windowMs).toISOString()

  if (limit !== Infinity && currentUsage >= limit) {
    return { allowed: false, limit, used: currentUsage, resetAt }
  }

  // Non-blocking increment — don't await so we don't add latency to the response
  supabase
    .from('api_keys')
    .update({
      daily_usage_count: currentUsage + 1,
      daily_reset_at:    newResetAt,
      usage_count:       keyRow.usage_count + 1,
      last_used_at:      new Date().toISOString(),
    })
    .eq('id', keyRow.id)
    .then(() => {})

  return {
    allowed:   true,
    limit,
    remaining: limit === Infinity ? Infinity : limit - currentUsage - 1,
    resetAt,
  }
}
