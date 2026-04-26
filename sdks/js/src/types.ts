/**
 * ClearChain SDK — Types
 *
 * Field names match the API response exactly (camelCase).
 * Aligned with lib/types.ts and public/openapi.json.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type SupportedChain = 'ETH' | 'BTC' | 'TRX'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export interface ScoringSignal {
  /** Machine-readable signal identifier, e.g. "ofac_match". */
  name: string
  /** Maximum points this signal can contribute (0–40). */
  weight: number
  /** Whether the risk factor was detected. */
  triggered: boolean
  /** Points added to the total score (0 if not triggered). */
  score: number
  /** Human-readable explanation written for compliance analysts. */
  detail: string
}

export interface RiskScore {
  /** Aggregate risk score 0–100. */
  total: number
  /** Qualitative risk band. LOW: 0–24 | MEDIUM: 25–49 | HIGH: 50–74 | CRITICAL: 75–100 */
  level: RiskLevel
  /** All evaluated signals, keyed by signal name. */
  signals: Record<string, ScoringSignal>
}

export interface OFACResult {
  /** True if the address appears on the OFAC SDN list. */
  matched: boolean
  /** Name of the sanctioned entity if matched. */
  matchedEntity?: string
  /** Match confidence: 1.0 = exact address match. */
  confidence: number
  /** ISO timestamp of when the SDN list was last fetched. */
  listLastFetched?: string
}

export interface AMLTypology {
  id: string
  name: string
  description: string
  fatfReference: string
  triggered: boolean
  confidence: number
  /** On-chain evidence rationale, suitable for SAR narrative. */
  rationale: string
}

export interface WalletTransaction {
  hash: string
  from: string
  to: string
  /** Amount in native units (ETH, BTC, TRX). */
  value: number
  /** Unix epoch timestamp (seconds). */
  timestamp: number
  blockNumber: number
  /** ERC-20 token ticker, if applicable. */
  tokenSymbol?: string
  /** ERC-20 contract address, if applicable. */
  tokenAddress?: string
  /** True if this is an inbound transaction relative to the analyzed wallet. */
  isInbound?: boolean
}

export interface HopEntry {
  address: string
  transactions: WalletTransaction[]
}

// ---------------------------------------------------------------------------
// Analyze response
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  /** The input address as provided. */
  address: string
  chain: SupportedChain
  /** Resolved checksummed address (ENS resolved for ETH). */
  resolvedAddress: string
  riskScore: RiskScore
  typologies: AMLTypology[]
  transactions: WalletTransaction[]
  ofacResult: OFACResult
  /** ISO 8601 timestamp of when the analysis was generated. */
  analyzedAt: string
  /** AI-generated plain-English risk narrative. */
  narrative: string
  /** SAR-ready filing draft. Requires qualified BSA/AML officer review before filing. */
  sarDraft: string
  /** Transaction data for top counterparty addresses (ETH only, up to 5 hops). */
  hopData: HopEntry[]
}

// ---------------------------------------------------------------------------
// Batch request + response
// ---------------------------------------------------------------------------

export interface BatchAddressInput {
  address: string
  chain?: SupportedChain
}

export interface BatchResult {
  address: string
  chain: SupportedChain
  /** Aggregate risk score 0–100. null if analysis failed. */
  risk_score: number | null
  /** Risk band. null if analysis failed. */
  risk_level: RiskLevel | null
  /** OFAC SDN match. null if analysis failed. */
  ofac_match: boolean | null
  /** Mixer/CoinJoin interaction detected. null if analysis failed. */
  mixer_interaction: boolean | null
  /** Name of the highest-scoring triggered signal. null if none or failed. */
  top_signal: string | null
  /** Triggered AML typology names. null if analysis failed. */
  typologies: string[] | null
  /** Error code if this address failed, otherwise null. */
  error: string | null
}

export interface BatchSummary {
  critical: number
  high: number
  medium: number
  low: number
  /** Addresses with risk_score === 0. */
  clean: number
}

export interface BatchRateLimitMeta {
  /** Tier daily limit. null = unlimited (team tier). */
  limit: number | null
  /** Remaining calls after this batch. null = unlimited. */
  remaining: number | null
  /** ISO timestamp when the current 24h window resets. */
  reset_at: string
}

export interface BatchResponse {
  success: true
  data: {
    total: number
    processed: number
    failed: number
    /** Per-address results, sorted by risk_score DESC. Failed addresses last. */
    results: BatchResult[]
    summary: BatchSummary
  }
  meta: {
    rate_limit: BatchRateLimitMeta
  }
}
