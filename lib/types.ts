/**
 * ClearChain — Batch API Types
 *
 * Exported types for the POST /api/v1/batch endpoint.
 * Consumed by app/api/v1/batch/route.ts and any external SDK consumers.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type SupportedChain = 'ETH' | 'BTC' | 'TRX'

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface BatchAddressInput {
  /** Wallet address or ENS name (ETH only). */
  address: string
  /** Blockchain to analyze. Defaults to 'ETH' if omitted. */
  chain?: SupportedChain
}

export interface BatchRequest {
  /** 1–100 addresses to screen. */
  addresses: BatchAddressInput[]
}

// ---------------------------------------------------------------------------
// Per-address result
// ---------------------------------------------------------------------------

export interface BatchResult {
  /** The original address string as submitted. */
  address: string
  /** Chain that was analyzed. */
  chain: SupportedChain
  /** Aggregate risk score 0–100. null if analysis failed. */
  risk_score: number | null
  /** Qualitative risk band. null if analysis failed. */
  risk_level: string | null
  /** Whether the address matched the OFAC SDN list. null if analysis failed. */
  ofac_match: boolean | null
  /** Whether a mixer/CoinJoin interaction was detected. null if analysis failed. */
  mixer_interaction: boolean | null
  /** Name of the triggered signal with the highest score. null if none triggered or analysis failed. */
  top_signal: string | null
  /** Triggered typology names. null if analysis failed. */
  typologies: string[] | null
  /** Error code if this address failed analysis (e.g. "INVALID_ADDRESS"). null on success. */
  error: string | null
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface BatchSummary {
  /** Count of results with risk_level === 'CRITICAL' */
  critical: number
  /** Count of results with risk_level === 'HIGH' */
  high: number
  /** Count of results with risk_level === 'MEDIUM' */
  medium: number
  /** Count of results with risk_level === 'LOW' */
  low: number
  /** Count of results with no risk indicators (score === 0) */
  clean: number
}

export interface BatchRateLimitMeta {
  /** Tier daily limit. null = unlimited (team tier). */
  limit: number | null
  /** Remaining calls after this batch. null = unlimited (team tier). */
  remaining: number | null
  /** ISO timestamp of when the current 24h window resets. */
  reset_at: string
}

export interface BatchResponseData {
  /** Total addresses submitted. */
  total: number
  /** Addresses that were successfully analyzed. */
  processed: number
  /** Addresses that failed (invalid format, upstream error, etc.). */
  failed: number
  /** Per-address results, sorted by risk_score DESC (failed addresses last). */
  results: BatchResult[]
  /** Aggregate risk distribution across the batch. */
  summary: BatchSummary
}

export interface BatchResponse {
  success: true
  data: BatchResponseData
  meta: {
    rate_limit: BatchRateLimitMeta
  }
}
