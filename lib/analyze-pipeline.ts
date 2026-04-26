/**
 * ClearChain — Core Analysis Pipeline
 *
 * Shared analysis logic used by /api/analyze (legacy) and /api/v1/analyze.
 * Handles BTC, TRX, and ETH chains: data fetching, OFAC screening, risk scoring,
 * typology matching, AI narrative generation, hop expansion, and DB persistence.
 *
 * HTTP-layer concerns (NextResponse, headers, status codes) stay in route handlers.
 * This module only throws PipelineError — routes translate that to HTTP responses.
 */

import type { WalletAnalysis, WalletTransaction, ScoringSignal, RiskScore } from '@/types'
import { getBitcoinTransactions, getBitcoinRawTxs, detectBtcPatterns } from './bitcoin'
import { getTronTransactions, detectTrxPatterns } from './tron'
import { getTransactions, getTokenTransfers, getTopCounterparties } from './etherscan'
import OFAC_TRX from '@/data/ofac-trx-addresses.json'
import { checkAddress } from './ofac'
import { computeRiskScore } from './scoring'
import { matchTypologies } from './typology'
import { generateAll } from './claude'
import { fireWebhook } from './webhook'

// ---------------------------------------------------------------------------
// Cache — 5-minute TTL (independent from /api/analyze route cache)
// ---------------------------------------------------------------------------

interface HopEntry {
  address: string
  transactions: WalletTransaction[]
}

interface CachedResult {
  data: WalletAnalysis
  narrative: string
  sarDraft: string
  hopData: HopEntry[]
  cachedAt: number
}

const pipelineCache = new Map<string, CachedResult>()
const CACHE_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeAndDedup(
  ethTxs: WalletTransaction[],
  tokenTxs: WalletTransaction[],
  address: string,
): WalletTransaction[] {
  const map = new Map<string, WalletTransaction>()
  for (const tx of ethTxs) {
    map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() })
  }
  for (const tx of tokenTxs) {
    if (!map.has(tx.hash)) {
      map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp)
}

// ---------------------------------------------------------------------------
// PipelineError — thrown by runAnalysis, caught by route handlers
// ---------------------------------------------------------------------------

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SaveRecord {
  user_id: string
  address: string
  chain: string
  risk_score: number
  risk_level: string
  signals: unknown
  typologies: unknown
  narrative: string
  sar_draft: string
  analyzed_at: string
}

export interface PipelineOptions {
  /** Authenticated user ID — used for Supabase persistence */
  userId?: string | null
  /** API key row ID — used for webhook dispatch */
  apiKeyId?: string | null
  webhookUrl?: string | null
  webhookSecret?: string | null
  /**
   * Optional save callback. Called after a successful analysis with the full
   * DB record. Fire-and-forget — errors are logged but never propagated.
   */
  onSave?: (record: SaveRecord) => Promise<void>
}

export interface PipelineResult {
  data: WalletAnalysis
  narrative: string
  sarDraft: string
  hopData: HopEntry[]
  resolvedAddress: string
}

// ---------------------------------------------------------------------------
// runAnalysis — main entry point
// ---------------------------------------------------------------------------

export async function runAnalysis(
  address: string,
  chain: 'ETH' | 'BTC' | 'TRX',
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const { userId, apiKeyId, webhookUrl, webhookSecret, onSave } = options

  // ── Cache check ────────────────────────────────────────────────────────────
  const cacheKey = `v1:${chain}:${address}`
  const cached = pipelineCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      data:            cached.data,
      narrative:       cached.narrative,
      sarDraft:        cached.sarDraft,
      hopData:         cached.hopData,
      resolvedAddress: address,
    }
  }

  // ── BTC pipeline ───────────────────────────────────────────────────────────
  if (chain === 'BTC') {
    try {
      const [btcTxs, rawTxs] = await Promise.all([
        getBitcoinTransactions(address),
        getBitcoinRawTxs(address),
      ])

      const patterns = detectBtcPatterns(address, rawTxs)
      const btcSignals: ScoringSignal[] = [
        {
          name: 'ofac_match', weight: 40, triggered: false, score: 0,
          detail: 'BTC address not found on OFAC SDN list.',
        },
        {
          name: 'coinjoin_usage', weight: 25,
          triggered: patterns.coinjoin, score: patterns.coinjoin ? 25 : 0,
          detail: patterns.coinjoin
            ? 'CoinJoin transaction detected — multiple equal-value outputs indicate privacy mixing.'
            : 'No CoinJoin patterns detected.',
        },
        {
          name: 'peel_chain', weight: 20,
          triggered: patterns.peelChain, score: patterns.peelChain ? 20 : 0,
          detail: patterns.peelChain
            ? 'Peel chain detected — sequential 2-output transactions consistent with layering.'
            : 'No peel chain pattern detected.',
        },
        {
          name: 'coinbase_recipient', weight: 0,
          triggered: patterns.coinbase, score: 0,
          detail: patterns.coinbase
            ? 'Address has received coinbase (mining) rewards — likely a miner.'
            : 'No coinbase inputs detected.',
        },
      ]

      const totalScore = Math.min(100, btcSignals.reduce((s, sig) => s + sig.score, 0))
      const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW'
      const btcRiskScore: RiskScore = {
        total: totalScore,
        level,
        signals: Object.fromEntries(btcSignals.map(s => [s.name, s])),
      }

      const analysis: WalletAnalysis = {
        address, chain: 'BTC',
        riskScore: btcRiskScore, typologies: [],
        transactions: btcTxs,
        ofacResult: { matched: false, confidence: 0 },
        analyzedAt: new Date().toISOString(),
      }

      const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis)

      if (userId && onSave) {
        onSave({
          user_id: userId, address, chain: 'BTC',
          risk_score: btcRiskScore.total, risk_level: btcRiskScore.level,
          signals: btcRiskScore.signals, typologies: [],
          narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
          analyzed_at: analysis.analyzedAt,
        }).catch(err => console.error('[pipeline] BTC save failed:', err))
      }

      if (webhookUrl && apiKeyId) {
        fireWebhook(webhookUrl, webhookSecret ?? null, {
          event: 'analysis.complete', timestamp: new Date().toISOString(), api_key_id: apiKeyId,
          data: {
            address, chain: 'BTC',
            risk_score: btcRiskScore.total, risk_level: btcRiskScore.level,
            signals: Object.fromEntries(Object.entries(btcRiskScore.signals).map(([k, s]) => [k, s.triggered])),
            typologies: [], narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        })
      }

      const result: PipelineResult = {
        data: analysis, narrative: narrative ?? '', sarDraft: sarDraftRaw ?? '',
        hopData: [], resolvedAddress: address,
      }
      pipelineCache.set(cacheKey, { data: result.data, narrative: result.narrative, sarDraft: result.sarDraft, hopData: [], cachedAt: Date.now() })
      return result

    } catch (err) {
      if (err instanceof PipelineError) throw err
      const msg = err instanceof Error ? err.message : 'Failed to fetch Bitcoin transaction history'
      const s = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined
      throw new PipelineError(msg, 'ANALYSIS_FAILED', s && s >= 400 && s < 600 ? s : 500)
    }
  }

  // ── TRX pipeline ───────────────────────────────────────────────────────────
  if (chain === 'TRX') {
    try {
      const rawTrxTxs = await getTronTransactions(address)
      const trxTxs    = rawTrxTxs.filter(tx => tx.from && tx.to)
      const TRX_SDN   = new Map(Object.entries(OFAC_TRX as Record<string, string>))

      const trxOfacEntity = TRX_SDN.get(address)
      const trxOfacResult = trxOfacEntity
        ? { matched: true, matchedEntity: trxOfacEntity, confidence: 1.0 }
        : { matched: false, confidence: 0 }

      const patterns          = detectTrxPatterns(address, trxTxs)
      const counterpartyHits  = trxTxs.filter(tx => TRX_SDN.has(tx.from) || TRX_SDN.has(tx.to))
      const hasCounterpartyRisk = counterpartyHits.length > 0 && !trxOfacResult.matched

      const trxSignals: ScoringSignal[] = [
        {
          name: 'ofac_match', weight: 40,
          triggered: trxOfacResult.matched, score: trxOfacResult.matched ? 40 : 0,
          detail: trxOfacResult.matched
            ? `Address is listed on the OFAC SDN list as "${trxOfacEntity}". Mandatory SAR filing required.`
            : 'No match found on OFAC TRX SDN list.',
        },
        {
          name: 'rapid_fund_movement', weight: 25,
          triggered: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk),
          score: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk) ? 25 : 0,
          detail: patterns.rapidHops
            ? (trxOfacResult.matched || hasCounterpartyRisk)
              ? '≥3 outbound TRX transactions within 24 hours alongside OFAC exposure — consistent with rapid layering.'
              : '≥3 outbound transactions in 24 hours detected, but no corroborating OFAC or counterparty risk (signal suppressed).'
            : 'No rapid fund movement pattern detected.',
        },
        {
          name: 'high_risk_counterparty', weight: 20,
          triggered: hasCounterpartyRisk, score: hasCounterpartyRisk ? 20 : 0,
          detail: hasCounterpartyRisk
            ? `${counterpartyHits.length} transaction(s) with OFAC-sanctioned TRX counterparty addresses.`
            : 'No interactions with known sanctioned TRX counterparties.',
        },
        {
          name: 'volume_anomaly', weight: 15,
          triggered: patterns.highVolume, score: patterns.highVolume ? 15 : 0,
          detail: patterns.highVolume
            ? 'High TRX volume detected in a wallet less than 30 days old — inconsistent with normal wallet activity.'
            : 'TRX volume within expected range for wallet age.',
        },
      ]

      const totalScore = Math.min(100, trxSignals.reduce((s, sig) => s + sig.score, 0))
      const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW'
      const trxRiskScore: RiskScore = {
        total: totalScore, level,
        signals: Object.fromEntries(trxSignals.map(s => [s.name, s])),
      }

      const analysis: WalletAnalysis = {
        address, chain: 'TRX',
        riskScore: trxRiskScore, typologies: [],
        transactions: trxTxs, ofacResult: trxOfacResult,
        analyzedAt: new Date().toISOString(),
      }

      const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis)

      if (userId && onSave) {
        onSave({
          user_id: userId, address, chain: 'TRX',
          risk_score: trxRiskScore.total, risk_level: trxRiskScore.level,
          signals: trxRiskScore.signals, typologies: [],
          narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
          analyzed_at: analysis.analyzedAt,
        }).catch(err => console.error('[pipeline] TRX save failed:', err))
      }

      if (webhookUrl && apiKeyId) {
        fireWebhook(webhookUrl, webhookSecret ?? null, {
          event: 'analysis.complete', timestamp: new Date().toISOString(), api_key_id: apiKeyId,
          data: {
            address, chain: 'TRX',
            risk_score: trxRiskScore.total, risk_level: trxRiskScore.level,
            signals: Object.fromEntries(Object.entries(trxRiskScore.signals).map(([k, s]) => [k, s.triggered])),
            typologies: [], narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        })
      }

      const result: PipelineResult = {
        data: analysis, narrative: narrative ?? '', sarDraft: sarDraftRaw ?? '',
        hopData: [], resolvedAddress: address,
      }
      pipelineCache.set(cacheKey, { data: result.data, narrative: result.narrative, sarDraft: result.sarDraft, hopData: [], cachedAt: Date.now() })
      return result

    } catch (err) {
      if (err instanceof PipelineError) throw err
      const msg = err instanceof Error ? err.message : 'Failed to fetch Tron transaction history'
      const s = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined
      throw new PipelineError(msg, 'ANALYSIS_FAILED', s && s >= 400 && s < 600 ? s : 500)
    }
  }

  // ── ETH pipeline ───────────────────────────────────────────────────────────
  let ethTxs:   WalletTransaction[]
  let tokenTxs: WalletTransaction[]

  try {
    ;[ethTxs, tokenTxs] = await Promise.all([
      getTransactions(address),
      getTokenTransfers(address),
    ])
  } catch {
    throw new PipelineError('Failed to fetch transaction history from Alchemy', 'ANALYSIS_FAILED', 503)
  }

  let ofacResult: WalletAnalysis['ofacResult']
  try {
    ofacResult = await checkAddress(address)
  } catch {
    ofacResult = { matched: false, confidence: 0 }
  }

  const transactions = mergeAndDedup(ethTxs, tokenTxs, address)
  const riskScore    = computeRiskScore({ transactions, ofacResult, communityFlags: 0, address })
  const typologies   = matchTypologies(transactions, riskScore, address)

  const analysis: WalletAnalysis = {
    address, chain: 'ETH',
    riskScore, typologies, transactions, ofacResult,
    analyzedAt: new Date().toISOString(),
  }

  const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis)

  // Multi-hop: top 5 counterparties
  const hopSlice   = getTopCounterparties(transactions, 10).slice(0, 5)
  const hopResults = await Promise.allSettled(hopSlice.map(addr => getTransactions(addr).catch(() => [])))
  const hopData: HopEntry[] = hopSlice.map((addr, i) => ({
    address: addr,
    transactions: hopResults[i].status === 'fulfilled'
      ? (hopResults[i] as PromiseFulfilledResult<WalletTransaction[]>).value
      : [],
  }))

  if (userId && onSave) {
    onSave({
      user_id: userId, address, chain: 'ETH',
      risk_score: riskScore.total, risk_level: riskScore.level,
      signals: riskScore.signals, typologies,
      narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
      analyzed_at: analysis.analyzedAt,
    }).catch(err => console.error('[pipeline] ETH save failed:', err))
  }

  if (webhookUrl && apiKeyId) {
    fireWebhook(webhookUrl, webhookSecret ?? null, {
      event: 'analysis.complete', timestamp: new Date().toISOString(), api_key_id: apiKeyId,
      data: {
        address, chain: 'ETH',
        risk_score: riskScore.total, risk_level: riskScore.level,
        signals: Object.fromEntries(Object.entries(riskScore.signals).map(([k, s]) => [k, s.triggered])),
        typologies: typologies.filter(t => t.triggered).map(t => t.name),
        narrative: narrative ?? '', sar_draft: sarDraftRaw ?? '',
        analyzed_at: analysis.analyzedAt,
      },
    })
  }

  const result: PipelineResult = {
    data: analysis, narrative: narrative ?? '', sarDraft: sarDraftRaw ?? '',
    hopData, resolvedAddress: address,
  }
  pipelineCache.set(cacheKey, { data: result.data, narrative: result.narrative, sarDraft: result.sarDraft, hopData, cachedAt: Date.now() })
  return result
}
