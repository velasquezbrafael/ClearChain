/**
 * ClearChain — POST /api/analyze
 *
 * Core analysis endpoint. Accepts a wallet address or ENS name, runs the full
 * ClearChain pipeline (Alchemy fetch → OFAC check → risk scoring →
 * typology matching → AI narrative + SAR draft → multi-hop graph), and returns
 * the complete WalletAnalysis alongside the generated content and hop data.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getTransactions, getTokenTransfers, resolveENS, getTopCounterparties } from '@/lib/etherscan';
import { getBitcoinTransactions, getBitcoinRawTxs, detectBtcPatterns } from '@/lib/bitcoin';
import { getTronTransactions, getTronTRC20Transfers, detectTrxPatterns } from '@/lib/tron';
import { getSolBalance, getSolTransactions, getSPLTokenTransfers, detectSolPatterns, validateSolAddress } from '@/lib/solana';
import OFAC_TRX from '@/data/ofac-trx-addresses.json';
import { checkAddress, checkOfacSol, checkOfacBtc } from '@/lib/ofac';
import { computeRiskScore, KNOWN_MIXER_ADDRESSES } from '@/lib/scoring';
import { scoreSolana } from '@/lib/scoring-sol';
import { matchTypologies } from '@/lib/typology';
import { generateAll } from '@/lib/claude';
import { hashApiKey } from '@/lib/apikeys';
import { fireWebhook } from '@/lib/webhook';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { incrementGlobalStats } from '@/lib/supabase/server';

import type { WalletTransaction, WalletAnalysis, RiskScore, ScoringSignal, SignalWeights, RiskThresholds } from '@/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ---------------------------------------------------------------------------
// Cache — 5-minute TTL
// ---------------------------------------------------------------------------

interface HopEntry {
  address: string;
  transactions: WalletTransaction[];
}

interface CachedResult {
  data: WalletAnalysis;
  narrative: string;
  sarDraft: string;
  hopData: HopEntry[];
  cachedAt: number;
}

const analysisCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Merge + deduplicate transactions
// ---------------------------------------------------------------------------

function mergeAndDedup(
  ethTxs: WalletTransaction[],
  tokenTxs: WalletTransaction[],
  address: string
): WalletTransaction[] {
  const map = new Map<string, WalletTransaction>();

  for (const tx of ethTxs) {
    map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() });
  }

  for (const tx of tokenTxs) {
    if (!map.has(tx.hash)) {
      map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// OPTIONS — preflight
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------
// REQUIRED SQL — run once in Supabase dashboard to enable rate limiting:
//   alter table api_keys add column if not exists daily_usage integer not null default 0;
//   alter table api_keys add column if not exists daily_reset_date text;
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST — main analysis
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 0. API key authentication (optional — supplements cookie session) ───────
  let apiKeyUserId: string | null = null;
  let apiKeyId: string | null = null;
  let apiKeyWebhookUrl: string | null = null;
  let apiKeyWebhookSecret: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ck_live_')) {
    const rawKey = authHeader.slice(7);
    const keyHash = hashApiKey(rawKey);

    const cookieStore = await cookies();
    const anonSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(s) { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    const { data: apiKey } = await anonSupabase
      .from('api_keys')
      .select('id, user_id, tier, usage_count, is_active, daily_usage, daily_reset_date, webhook_url, webhook_secret')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid or revoked API key', code: 'INVALID_API_KEY' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // ── Rate limiting (free tier: 10 req/day) ─────────────────────────────
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const isNewDay = (apiKey.daily_reset_date as string | null) !== today;
    const currentDailyUsage = isNewDay ? 0 : ((apiKey.daily_usage as number | null) ?? 0);

    if (apiKey.tier === 'free' && currentDailyUsage >= 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Daily rate limit exceeded. Free tier allows 10 requests per day. Upgrade to Pro for unlimited access.',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: 10,
          used: currentDailyUsage,
          resets: `${today}T23:59:59Z`,
        },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Non-blocking usage tracking (also resets daily counter on new day)
    anonSupabase.from('api_keys').update({
      usage_count: (apiKey.usage_count as number) + 1,
      last_used_at: new Date().toISOString(),
      daily_usage: currentDailyUsage + 1,
      daily_reset_date: today,
    }).eq('id', apiKey.id).then(() => {});

    apiKeyUserId = apiKey.user_id;
    apiKeyId = apiKey.id as string;
    apiKeyWebhookUrl = (apiKey as Record<string, unknown>).webhook_url as string | null ?? null;
    apiKeyWebhookSecret = (apiKey as Record<string, unknown>).webhook_secret as string | null ?? null;
  }

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body', code: 'INVALID_JSON' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (
    typeof body !== 'object' || body === null ||
    !('address' in body) ||
    typeof (body as Record<string, unknown>).address !== 'string'
  ) {
    return NextResponse.json(
      { success: false, error: 'Request body must include an "address" string field', code: 'MISSING_ADDRESS' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const rawAddress = ((body as Record<string, unknown>).address as string).trim();
  const rawChain = (body as Record<string, unknown>).chain;
  const chain: 'ETH' | 'BTC' | 'TRX' | 'SOL' | 'USDC' | 'USDT' | 'DAI' =
    rawChain === 'BTC'  ? 'BTC'  :
    rawChain === 'TRX'  ? 'TRX'  :
    rawChain === 'SOL'  ? 'SOL'  :
    rawChain === 'USDC' ? 'USDC' :
    rawChain === 'USDT' ? 'USDT' :
    rawChain === 'DAI'  ? 'DAI'  : 'ETH';

  if (!rawAddress) {
    return NextResponse.json(
      { success: false, error: 'Address cannot be empty', code: 'MISSING_ADDRESS' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // ── 2. Resolve address ─────────────────────────────────────────────────────
  let address: string;
  if (chain === 'BTC') {
    const isBtcAddr = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(rawAddress) ||
                      /^bc1[a-z0-9]{39,59}$/.test(rawAddress);
    if (!isBtcAddr) {
      return NextResponse.json(
        { success: false, error: 'Invalid Bitcoin address format', code: 'INVALID_ADDRESS' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    address = rawAddress;
  } else if (chain === 'TRX') {
    const isTrxAddr = /^T[a-zA-Z0-9]{33}$/.test(rawAddress);
    if (!isTrxAddr) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tron address format. Must start with T and be 34 characters.', code: 'INVALID_ADDRESS' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    address = rawAddress;
  } else if (chain === 'SOL') {
    if (!validateSolAddress(rawAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Solana address format. Must be a 32–44 character base58 public key.', code: 'INVALID_ADDRESS' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    address = rawAddress;
  } else if (chain === 'USDC' || chain === 'USDT' || chain === 'DAI') {
    // Stablecoins are ERC-20 tokens on Ethereum — validate as 0x hex or ENS
    try {
      address = await resolveENS(rawAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resolve address or ENS name';
      return NextResponse.json(
        { success: false, error: message, code: 'ENS_RESOLUTION_FAILED' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } else {
    try {
      address = await resolveENS(rawAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resolve address or ENS name';
      return NextResponse.json(
        { success: false, error: message, code: 'ENS_RESOLUTION_FAILED' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  }

  // ── 3. Cache check ─────────────────────────────────────────────────────────
  const cacheKey = `${chain}:${address}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.info(`[ClearChain] Cache hit for ${address}`);
    return NextResponse.json(
      {
        success: true,
        data: cached.data,
        narrative: cached.narrative,
        sarDraft: cached.sarDraft,
        hopData: cached.hopData,
        resolvedAddress: address,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // ── 4. Fetch transactions ──────────────────────────────────────────────────
  let transactions: WalletTransaction[];
  let ofacResult: { matched: boolean; confidence: number; matchedEntity?: string; listLastFetched?: string };
  let hopData: HopEntry[] = [];

  if (chain === 'BTC') {
    // Bitcoin pipeline
    try {
      const [btcTxs, rawTxs] = await Promise.all([
        getBitcoinTransactions(address),
        getBitcoinRawTxs(address),
      ]);
      transactions = btcTxs;

      // OFAC check against live BTC SDN list
      try {
        ofacResult = await checkOfacBtc(address);
      } catch {
        ofacResult = { matched: false, confidence: 0 };
      }

      // BTC-specific scoring
      const patterns = detectBtcPatterns(address, rawTxs);
      const btcSignals: ScoringSignal[] = [
        {
          name: 'ofac_match',
          weight: 40,
          triggered: ofacResult.matched,
          score: ofacResult.matched ? 40 : 0,
          detail: ofacResult.matched
            ? `BTC address is listed on the OFAC SDN list as "${ofacResult.matchedEntity}". Mandatory SAR filing required for covered financial institutions.`
            : 'BTC address not found on OFAC SDN list.',
        },
        {
          name: 'coinjoin_usage',
          weight: 25,
          triggered: patterns.coinjoin,
          score: patterns.coinjoin ? 25 : 0,
          detail: patterns.coinjoin
            ? 'CoinJoin transaction detected — multiple equal-value outputs indicate privacy mixing.'
            : 'No CoinJoin patterns detected.',
        },
        {
          name: 'peel_chain',
          weight: 20,
          triggered: patterns.peelChain,
          score: patterns.peelChain ? 20 : 0,
          detail: patterns.peelChain
            ? 'Peel chain detected — sequential 2-output transactions consistent with layering.'
            : 'No peel chain pattern detected.',
        },
        {
          name: 'coinbase_recipient',
          weight: 0,
          triggered: patterns.coinbase,
          score: 0,
          detail: patterns.coinbase
            ? 'Address has received coinbase (mining) rewards — likely a miner.'
            : 'No coinbase inputs detected.',
        },
      ];

      const totalScore = Math.min(100, btcSignals.reduce((s, sig) => s + sig.score, 0));
      const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW';
      const btcRiskScore: RiskScore = {
        total: totalScore,
        level,
        signals: Object.fromEntries(btcSignals.map(s => [s.name, s])),
      };

      const analysis: WalletAnalysis = {
        address,
        chain: 'BTC',
        riskScore: btcRiskScore,
        typologies: [],
        transactions,
        ofacResult,
        analyzedAt: new Date().toISOString(),
      };

      const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis);

      // Save to Supabase
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
        const { data: { user } } = await supabase.auth.getUser();
        const saveUserId = user?.id ?? apiKeyUserId;
        if (saveUserId) {
          const { error: insertError } = await supabase.from('analyses').insert({
            user_id: saveUserId,
            address,
            chain: 'BTC',
            risk_score: btcRiskScore.total,
            risk_level: btcRiskScore.level,
            signals: btcRiskScore.signals,
            typologies: [],
            narrative,
            sar_draft: sarDraftRaw,
            analyzed_at: analysis.analyzedAt,
          });
          if (insertError) console.error('[ClearChain/analyze] BTC insert failed:', insertError.message, insertError.code);
          else console.info('[ClearChain/analyze] BTC analysis saved for user', saveUserId);
        } else {
          console.info('[ClearChain/analyze] No authenticated user — skipping BTC save');
        }
      } catch (err) {
        console.error('[ClearChain/analyze] Supabase BTC save failed:', err);
      }

      analysisCache.set(cacheKey, { data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], cachedAt: Date.now() });
      void incrementGlobalStats({ ofacHit: !!btcRiskScore.signals['ofac_match']?.triggered, highRisk: btcRiskScore.total >= 50 });

      if (apiKeyWebhookUrl && apiKeyId) {
        fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
          event: 'analysis.complete',
          timestamp: new Date().toISOString(),
          api_key_id: apiKeyId,
          data: {
            address, chain: 'BTC',
            risk_score: btcRiskScore.total,
            risk_level: btcRiskScore.level,
            signals: Object.fromEntries(Object.entries(btcRiskScore.signals).map(([k, s]) => [k, s.triggered])),
            typologies: [],
            narrative: narrative ?? '',
            sar_draft: sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        });
      }

      return NextResponse.json(
        { success: true, data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], resolvedAddress: address },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error('[ClearChain/analyze] Bitcoin fetch failed:', err);
      const btcErrMsg = err instanceof Error ? err.message : 'Failed to fetch Bitcoin transaction history';
      const btcStatus = (err instanceof Error && (err as Error & { statusCode?: number }).statusCode) || 422;
      return NextResponse.json(
        { success: false, error: btcErrMsg, code: 'BTC_FETCH_ERROR' },
        { status: btcStatus, headers: CORS_HEADERS }
      );
    }
  }

  // ── TRX pipeline ──────────────────────────────────────────────────────────
  if (chain === 'TRX') {
    try {
      const [nativeTxs, trc20Txs] = await Promise.all([
        getTronTransactions(address),
        getTronTRC20Transfers(address),
      ]);
      const seenHashes = new Set<string>();
      const rawTrxTxs: WalletTransaction[] = [];
      for (const tx of [...nativeTxs, ...trc20Txs]) {
        if (!seenHashes.has(tx.hash)) {
          seenHashes.add(tx.hash);
          rawTrxTxs.push(tx);
        }
      }
      const trxTxs = rawTrxTxs.filter(tx => tx.from && tx.to);
      const TRX_SDN = new Map(
        Object.entries(OFAC_TRX as Record<string, string>).map(([a, e]) => [a, e])
      );
      const trxOfacEntity = TRX_SDN.get(address);
      const trxOfacResult = trxOfacEntity
        ? { matched: true, matchedEntity: trxOfacEntity, confidence: 1.0 }
        : { matched: false, confidence: 0 };

      const patterns = detectTrxPatterns(address, trxTxs);

      // Check counterparties against TRX OFAC list
      const counterpartyHits = trxTxs.filter(tx =>
        TRX_SDN.has(tx.from) || TRX_SDN.has(tx.to)
      );
      const hasCounterpartyRisk = counterpartyHits.length > 0 && !trxOfacResult.matched;

      const trxSignals: ScoringSignal[] = [
        {
          name: 'ofac_match',
          weight: 40,
          triggered: trxOfacResult.matched,
          score: trxOfacResult.matched ? 40 : 0,
          detail: trxOfacResult.matched
            ? `Address is listed on the OFAC SDN list as "${trxOfacEntity}". Mandatory SAR filing required for covered financial institutions.`
            : 'No match found on OFAC TRX SDN list.',
        },
        {
          name: 'rapid_fund_movement',
          weight: 15,
          triggered: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk),
          score: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk) ? 15 : 0,
          detail: patterns.rapidHops
            ? trxOfacResult.matched || hasCounterpartyRisk
              ? '≥3 outbound TRX transactions within 24 hours alongside OFAC exposure — consistent with rapid layering.'
              : '≥3 outbound transactions in 24 hours detected, but no corroborating OFAC or counterparty risk (signal suppressed).'
            : 'No rapid fund movement pattern detected.',
        },
        {
          name: 'high_risk_counterparty',
          weight: 10,
          triggered: hasCounterpartyRisk,
          score: hasCounterpartyRisk ? 10 : 0,
          detail: hasCounterpartyRisk
            ? `${counterpartyHits.length} transaction(s) with OFAC-sanctioned TRX counterparty addresses. Enhanced due diligence required.`
            : 'No interactions with known sanctioned TRX counterparties.',
        },
        {
          name: 'volume_anomaly',
          weight: 5,
          triggered: patterns.highVolume,
          score: patterns.highVolume ? 5 : 0,
          detail: patterns.highVolume
            ? 'High TRX volume detected in a wallet less than 30 days old — inconsistent with normal wallet activity.'
            : 'TRX volume within expected range for wallet age.',
        },
      ];

      const totalScore = Math.min(100, trxSignals.reduce((s, sig) => s + sig.score, 0));
      const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW';
      const trxRiskScore: RiskScore = {
        total: totalScore,
        level,
        signals: Object.fromEntries(trxSignals.map(s => [s.name, s])),
      };

      const analysis: WalletAnalysis = {
        address,
        chain: 'TRX',
        riskScore: trxRiskScore,
        typologies: [],
        transactions: trxTxs,
        ofacResult: trxOfacResult,
        analyzedAt: new Date().toISOString(),
      };

      const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis);

      // Save to Supabase
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
        const { data: { user } } = await supabase.auth.getUser();
        const saveUserId = user?.id ?? apiKeyUserId;
        if (saveUserId) {
          const { error: insertError } = await supabase.from('analyses').insert({
            user_id: saveUserId,
            address,
            chain: 'TRX',
            risk_score: trxRiskScore.total,
            risk_level: trxRiskScore.level,
            signals: trxRiskScore.signals,
            typologies: [],
            narrative,
            sar_draft: sarDraftRaw,
            analyzed_at: analysis.analyzedAt,
          });
          if (insertError) console.error('[ClearChain/analyze] TRX insert failed:', insertError.message);
          else console.info('[ClearChain/analyze] TRX analysis saved for user', saveUserId);
        }
      } catch (err) {
        console.error('[ClearChain/analyze] Supabase TRX save failed:', err);
      }

      analysisCache.set(cacheKey, { data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], cachedAt: Date.now() });
      void incrementGlobalStats({ ofacHit: !!trxRiskScore.signals['ofac_match']?.triggered, highRisk: trxRiskScore.total >= 50 });

      if (apiKeyWebhookUrl && apiKeyId) {
        fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
          event: 'analysis.complete',
          timestamp: new Date().toISOString(),
          api_key_id: apiKeyId,
          data: {
            address, chain: 'TRX',
            risk_score: trxRiskScore.total,
            risk_level: trxRiskScore.level,
            signals: Object.fromEntries(Object.entries(trxRiskScore.signals).map(([k, s]) => [k, s.triggered])),
            typologies: [],
            narrative: narrative ?? '',
            sar_draft: sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        });
      }

      console.info('[ClearChain/analyze] TRX response shape:', {
        address, chain: 'TRX',
        riskScore: { total: trxRiskScore.total, level: trxRiskScore.level, signalCount: Object.keys(trxRiskScore.signals).length },
        typologiesLength: 0, txCount: trxTxs.length, ofacMatched: trxOfacResult.matched,
      });

      return NextResponse.json(
        { success: true, data: analysis, narrative: narrative ?? '', sarDraft: sarDraftRaw ?? '', hopData: [], resolvedAddress: address },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error('[ClearChain/analyze] TRX fetch failed:', err);
      const trxErrMsg = err instanceof Error ? err.message : 'Failed to fetch Tron transaction history';
      const trxStatus = (err instanceof Error && (err as Error & { statusCode?: number }).statusCode) || 422;
      return NextResponse.json(
        { success: false, error: trxErrMsg, code: 'TRX_FETCH_ERROR' },
        { status: trxStatus, headers: CORS_HEADERS }
      );
    }
  }

  // ── SOL pipeline ──────────────────────────────────────────────────────────
  if (chain === 'SOL') {
    try {
      const [, solTxs] = await Promise.all([
        getSolBalance(address).catch(() => 0),
        getSolTransactions(address),
        getSPLTokenTransfers(address).catch(() => []),
      ]);

      const solOfacResult = checkOfacSol(address);
      const solPatterns   = detectSolPatterns(address, solTxs);
      const solRiskScore  = scoreSolana(address, solTxs, solOfacResult, solPatterns);

      const analysis: WalletAnalysis = {
        address,
        chain: 'SOL',
        riskScore:    solRiskScore,
        typologies:   [],
        transactions: solTxs,
        ofacResult:   solOfacResult,
        analyzedAt:   new Date().toISOString(),
      };

      const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis);

      // Save to Supabase
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
        const { data: { user } } = await supabase.auth.getUser();
        const saveUserId = user?.id ?? apiKeyUserId;
        if (saveUserId) {
          const { error: insertError } = await supabase.from('analyses').insert({
            user_id:     saveUserId,
            address,
            chain:       'SOL',
            risk_score:  solRiskScore.total,
            risk_level:  solRiskScore.level,
            signals:     solRiskScore.signals,
            typologies:  [],
            narrative,
            sar_draft:   sarDraftRaw,
            analyzed_at: analysis.analyzedAt,
          });
          if (insertError) console.error('[ClearChain/analyze] SOL insert failed:', insertError.message);
          else console.info('[ClearChain/analyze] SOL analysis saved for user', saveUserId);
        }
      } catch (err) {
        console.error('[ClearChain/analyze] Supabase SOL save failed:', err);
      }

      analysisCache.set(cacheKey, { data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], cachedAt: Date.now() });
      void incrementGlobalStats({ ofacHit: !!solRiskScore.signals['ofac_match']?.triggered, highRisk: solRiskScore.total >= 50 });

      if (apiKeyWebhookUrl && apiKeyId) {
        fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
          event: 'analysis.complete',
          timestamp: new Date().toISOString(),
          api_key_id: apiKeyId,
          data: {
            address, chain: 'SOL',
            risk_score:  solRiskScore.total,
            risk_level:  solRiskScore.level,
            signals:     Object.fromEntries(Object.entries(solRiskScore.signals).map(([k, s]) => [k, s.triggered])),
            typologies:  [],
            narrative:   narrative   ?? '',
            sar_draft:   sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        });
      }

      return NextResponse.json(
        { success: true, data: analysis, narrative: narrative ?? '', sarDraft: sarDraftRaw ?? '', hopData: [], resolvedAddress: address },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error('[ClearChain/analyze] SOL fetch failed:', err);
      const solErrMsg = err instanceof Error ? err.message : 'Failed to fetch Solana transaction history';
      const solStatus = (err instanceof Error && (err as Error & { statusCode?: number }).statusCode) || 422;
      return NextResponse.json(
        { success: false, error: solErrMsg, code: 'SOL_FETCH_ERROR' },
        { status: solStatus, headers: CORS_HEADERS }
      );
    }
  }

  // ── STABLECOIN pipeline (USDC / USDT / DAI) ──────────────────────────────
  if (chain === 'USDC' || chain === 'USDT' || chain === 'DAI') {
    // Token symbol → contract address (Ethereum mainnet)
    const STABLE_CONTRACTS: Record<string, string> = {
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      DAI:  '0x6b175474e89094c44da98b954eedeac495271d0f',
    };
    const tokenContract = STABLE_CONTRACTS[chain];
    const tokenSymbol   = chain; // 'USDC' | 'USDT' | 'DAI'

    try {
      // Fetch all ERC-20 transfers then filter to chosen token
      const allTokenTxs = await getTokenTransfers(address);
      const stableTxs = allTokenTxs
        .filter(tx => tx.tokenAddress?.toLowerCase() === tokenContract || tx.tokenSymbol === tokenSymbol)
        .map(tx => ({ ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() }));

      // OFAC check (same ETH SDN list — stablecoin wallets are Ethereum addresses)
      let stableOfacResult: { matched: boolean; confidence: number; matchedEntity?: string; listLastFetched?: string };
      try {
        stableOfacResult = await checkAddress(address);
      } catch {
        stableOfacResult = { matched: false, confidence: 0 };
      }

      // ── Build scoring signals for stablecoins ────────────────────────────
      // Volume anomaly: USD-denominated ($300k threshold instead of 100 ETH)
      const USD_VOLUME_THRESHOLD = 300_000;
      const WALLET_AGE_DAYS      = 30;
      const earliestTs = stableTxs.length > 0 ? Math.min(...stableTxs.map(tx => tx.timestamp)) : Date.now() / 1000;
      const walletAgeDays = Math.floor((Date.now() / 1000 - earliestTs) / 86400);
      const totalUsdVolume = stableTxs.reduce((sum, tx) => sum + tx.value, 0); // values already in token units (1 USDC = 1)

      // Counterparty OFAC indirect exposure (capped at 20)
      const uniqueCounterpartiesStable = [
        ...new Set(
          stableTxs
            .map(tx => (tx.isInbound ? tx.from : tx.to).toLowerCase())
            .filter(addr => addr !== address.toLowerCase() && /^0x[0-9a-f]{40}$/.test(addr))
        ),
      ].slice(0, 20);

      const stableMixerIndirectHits = uniqueCounterpartiesStable
        .filter(addr => KNOWN_MIXER_ADDRESSES.has(addr))
        .map(addr => ({ address: addr, entity: 'Tornado Cash / Known Mixer', type: 'mixer' as const }));

      const stableOfacCounterpartyChecks = await Promise.allSettled(
        uniqueCounterpartiesStable
          .filter(addr => !KNOWN_MIXER_ADDRESSES.has(addr))
          .map(addr => checkAddress(addr).then(result => ({ addr, result })))
      );
      const stableOfacIndirectHits = stableOfacCounterpartyChecks
        .filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ addr: string; result: { matched: boolean; matchedEntity?: string } }>).value.result.matched)
        .map(r => {
          const { addr, result } = (r as PromiseFulfilledResult<{ addr: string; result: { matched: boolean; matchedEntity?: string } }>).value;
          return { address: addr, entity: result.matchedEntity ?? 'SDN Entity', type: 'ofac' as const };
        });

      const stableIndirectHits = [...stableMixerIndirectHits, ...stableOfacIndirectHits];

      const stableSignals: ScoringSignal[] = [
        {
          name: 'ofac_match',
          weight: 40,
          triggered: stableOfacResult.matched && stableOfacResult.confidence >= 0.9,
          score: stableOfacResult.matched && stableOfacResult.confidence >= 0.9 ? 40 : 0,
          detail: stableOfacResult.matched
            ? `Address is listed on the OFAC SDN list as "${stableOfacResult.matchedEntity}". Mandatory SAR filing required.`
            : 'No match found on OFAC SDN list.',
        },
        {
          name: 'high_risk_counterparty',
          weight: 10,
          triggered: stableIndirectHits.filter(h => h.type === 'ofac').length > 0,
          score: stableIndirectHits.filter(h => h.type === 'ofac').length > 0 ? 10 : 0,
          detail: stableIndirectHits.filter(h => h.type === 'ofac').length > 0
            ? `${stableIndirectHits.filter(h => h.type === 'ofac').length} OFAC-designated counterparty address(es) detected in ${tokenSymbol} transaction history.`
            : `No known high-risk counterparties in ${tokenSymbol} transaction history.`,
        },
        {
          name: 'indirect_exposure',
          weight: 8,
          triggered: stableIndirectHits.filter(h => h.type === 'mixer').length > 0,
          score: stableIndirectHits.filter(h => h.type === 'mixer').length > 0 ? Math.min(8, stableIndirectHits.filter(h => h.type === 'mixer').length * 4) : 0,
          detail: stableIndirectHits.filter(h => h.type === 'mixer').length > 0
            ? `${stableIndirectHits.filter(h => h.type === 'mixer').length} counterparty address(es) linked to known mixers — ${tokenSymbol} funds may have passed through obfuscation services.`
            : `No indirect mixer exposure detected in ${tokenSymbol} counterparties.`,
        },
        {
          name: 'volume_anomaly',
          weight: 5,
          triggered: totalUsdVolume > USD_VOLUME_THRESHOLD && walletAgeDays < WALLET_AGE_DAYS,
          score: totalUsdVolume > USD_VOLUME_THRESHOLD && walletAgeDays < WALLET_AGE_DAYS ? 5 : 0,
          detail: totalUsdVolume > USD_VOLUME_THRESHOLD && walletAgeDays < WALLET_AGE_DAYS
            ? `$${(totalUsdVolume / 1_000_000).toFixed(2)}M ${tokenSymbol} moved in a wallet only ${walletAgeDays} day(s) old — exceeds $${(USD_VOLUME_THRESHOLD / 1_000).toFixed(0)}k threshold for wallets under ${WALLET_AGE_DAYS} days.`
            : `${tokenSymbol} volume ($${(totalUsdVolume / 1_000).toFixed(1)}k) within expected range for wallet age (${walletAgeDays} days).`,
        },
        {
          name: 'community_red_flags',
          weight: 5,
          triggered: false,
          score: 0,
          detail: 'Community flag check not yet available for stablecoin-specific analysis.',
        },
      ];

      const stableTotalScore = Math.min(100, stableSignals.reduce((s, sig) => s + sig.score, 0));
      const stableLevel = stableTotalScore >= 75 ? 'CRITICAL' : stableTotalScore >= 50 ? 'HIGH' : stableTotalScore >= 25 ? 'MEDIUM' : 'LOW';
      const stableRiskScore: RiskScore = {
        total: stableTotalScore,
        level: stableLevel,
        signals: Object.fromEntries(stableSignals.map(s => [s.name, s])),
      };

      const stableAnalysis: WalletAnalysis = {
        address,
        chain: chain as 'USDC' | 'USDT' | 'DAI',
        riskScore: stableRiskScore,
        typologies: [],
        transactions: stableTxs,
        ofacResult: stableOfacResult,
        analyzedAt: new Date().toISOString(),
        indirectExposureHits: stableIndirectHits,
      };

      const { narrative: stableNarrative, sarDraft: stableSarDraft } = await generateAll(stableAnalysis);

      // Save to Supabase (non-blocking)
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
        const { data: { user } } = await supabase.auth.getUser();
        const saveUserId = user?.id ?? apiKeyUserId;
        if (saveUserId) {
          await supabase.from('analyses').insert({
            user_id: saveUserId, address, chain,
            risk_score: stableTotalScore, risk_level: stableLevel,
            signals: stableRiskScore.signals, typologies: [],
            narrative: stableNarrative, sar_draft: stableSarDraft,
            analyzed_at: stableAnalysis.analyzedAt,
          });
        }
      } catch { /* non-blocking */ }

      analysisCache.set(cacheKey, { data: stableAnalysis, narrative: stableNarrative ?? '', sarDraft: stableSarDraft ?? '', hopData: [], cachedAt: Date.now() });
      void incrementGlobalStats({ ofacHit: stableOfacResult.matched, highRisk: stableTotalScore >= 50 });

      return NextResponse.json(
        { success: true, data: stableAnalysis, narrative: stableNarrative ?? '', sarDraft: stableSarDraft ?? '', hopData: [], resolvedAddress: address },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error('[ClearChain/analyze] Stablecoin fetch failed:', err);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch stablecoin transaction history', code: 'STABLE_FETCH_ERROR' },
        { status: 503, headers: CORS_HEADERS }
      );
    }
  }

  // ── ETH pipeline ──────────────────────────────────────────────────────────
  let ethTxs: WalletTransaction[];
  let tokenTxs: WalletTransaction[];

  try {
    [ethTxs, tokenTxs] = await Promise.all([
      getTransactions(address),
      getTokenTransfers(address),
    ]);
  } catch (err) {
    console.error('[ClearChain/analyze] Alchemy fetch failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction history', code: 'ALCHEMY_ERROR' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  // OFAC check (fail-open — don't block pipeline)
  try {
    ofacResult = await checkAddress(address);
  } catch (err) {
    console.error('[ClearChain/analyze] OFAC check failed:', err);
    ofacResult = { matched: false, confidence: 0 };
  }

  // ── 5. Merge + deduplicate ─────────────────────────────────────────────────
  transactions = mergeAndDedup(ethTxs, tokenTxs, address);

  // ── 6. Indirect exposure — check counterparty addresses against OFAC + mixer set ──
  // We cap at 20 unique counterparties to keep latency manageable. Direct interactions
  // with the analyzed wallet are excluded (covered by mixer/OFAC signals already).
  const uniqueCounterparties = [
    ...new Set(
      transactions
        .map(tx => (tx.isInbound ? tx.from : tx.to).toLowerCase())
        .filter(addr => addr !== address.toLowerCase() && /^0x[0-9a-f]{40}$/.test(addr))
    ),
  ].slice(0, 20);

  // Mixer hits — synchronous O(1) lookup
  const mixerIndirectHits = uniqueCounterparties
    .filter(addr => KNOWN_MIXER_ADDRESSES.has(addr))
    .map(addr => ({ address: addr, entity: 'Tornado Cash / Known Mixer', type: 'mixer' as const }));

  // OFAC hits — async, skip addresses already flagged as mixers
  const nonMixerCounterparties = uniqueCounterparties.filter(addr => !KNOWN_MIXER_ADDRESSES.has(addr));
  const ofacCounterpartyChecks = await Promise.allSettled(
    nonMixerCounterparties.map(addr =>
      checkAddress(addr).then(result => ({ addr, result }))
    )
  );
  const ofacIndirectHits = ofacCounterpartyChecks
    .filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ addr: string; result: { matched: boolean; matchedEntity?: string } }>).value.result.matched)
    .map(r => {
      const { addr, result } = (r as PromiseFulfilledResult<{ addr: string; result: { matched: boolean; matchedEntity?: string } }>).value;
      return { address: addr, entity: result.matchedEntity ?? 'SDN Entity', type: 'ofac' as const };
    });

  const indirectExposureHits = [...mixerIndirectHits, ...ofacIndirectHits];

  // ── 6a. Fetch active risk profile (authenticated users only) ──────────────
  let customWeights: SignalWeights | undefined;
  let customThresholds: RiskThresholds | undefined;
  let activeProfileId: string | undefined;

  {
    // We need a Supabase client here for the profile lookup. Reuse the same
    // cookie-forwarding pattern used in the save block below.
    try {
      const profileCookieStore = await cookies();
      const profileSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return profileCookieStore.getAll() },
            setAll(cookiesToSet) {
              try { cookiesToSet.forEach(({ name, value, options }) => profileCookieStore.set(name, value, options)) } catch {}
            },
          },
        }
      );
      const { data: { user: profileUser } } = await profileSupabase.auth.getUser();
      if (profileUser) {
        const { data: activeProfile } = await profileSupabase
          .from('risk_profiles')
          .select('id, signal_weights, risk_thresholds')
          .eq('user_id', profileUser.id)
          .eq('is_active', true)
          .single();
        if (activeProfile) {
          customWeights = activeProfile.signal_weights as SignalWeights;
          customThresholds = activeProfile.risk_thresholds as RiskThresholds;
          activeProfileId = activeProfile.id;
        }
      }
    } catch {
      // Non-blocking: fall back to defaults on any error
    }
  }

  // ── 6b. Risk scoring ───────────────────────────────────────────────────────
  const riskScore = computeRiskScore({ transactions, ofacResult, communityFlags: 0, address, indirectExposureHits, customWeights, customThresholds });

  // ── 7. Typology matching ───────────────────────────────────────────────────
  const typologies = matchTypologies(transactions, riskScore, address);

  // ── 8. Build WalletAnalysis ────────────────────────────────────────────────
  const analysis: WalletAnalysis = {
    address,
    chain: 'ETH',
    riskScore,
    typologies,
    transactions,
    ofacResult,
    analyzedAt: new Date().toISOString(),
    indirectExposureHits,
  };

  // ── 9. Generate narrative + SAR ───────────────────────────────────────────
  const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis);

  // ── 10. Multi-hop: fetch top counterparty transactions ────────────────────
  const counterparties = getTopCounterparties(transactions, 10);
  const hopSlice = counterparties.slice(0, 5);

  const hopResults = await Promise.allSettled(
    hopSlice.map(addr => getTransactions(addr).catch(() => []))
  );

  hopData = hopSlice.map((addr, i) => ({
    address: addr,
    transactions: hopResults[i].status === 'fulfilled'
      ? (hopResults[i] as PromiseFulfilledResult<WalletTransaction[]>).value
      : [],
  }));

  // ── 11. Save to Supabase for authenticated users ─────────────────────────
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options))
            } catch {}
          },
        },
      }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const saveUserId = user?.id ?? apiKeyUserId;
    if (saveUserId) {
      const { error: insertError } = await supabase.from('analyses').insert({
        user_id: saveUserId,
        address,
        chain: 'ETH',
        risk_score: analysis.riskScore.total,
        risk_level: analysis.riskScore.level,
        signals: analysis.riskScore.signals,
        typologies: analysis.typologies,
        narrative,
        sar_draft: sarDraftRaw,
        analyzed_at: analysis.analyzedAt,
        profile_id: activeProfileId ?? null,
      });
      if (insertError) console.error('[ClearChain/analyze] ETH insert failed:', insertError.message, insertError.code);
      else console.info('[ClearChain/analyze] ETH analysis saved for user', saveUserId);
    } else {
      console.info('[ClearChain/analyze] No authenticated user — skipping save');
    }
  } catch (err) {
    console.error('[ClearChain/analyze] Supabase save failed (non-blocking):', err);
  }

  // ── 12. Cache ─────────────────────────────────────────────────────────────
  analysisCache.set(cacheKey, {
    data: analysis,
    narrative,
    sarDraft: sarDraftRaw,
    hopData,
    cachedAt: Date.now(),
  });
  void incrementGlobalStats({ ofacHit: !!riskScore.signals['ofac_match']?.triggered, highRisk: riskScore.total >= 50 });

  // ── 13. Webhook (fire-and-forget, API key requests only) ─────────────────
  if (apiKeyWebhookUrl && apiKeyId) {
    fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
      event: 'analysis.complete',
      timestamp: new Date().toISOString(),
      api_key_id: apiKeyId,
      data: {
        address, chain: 'ETH',
        risk_score: riskScore.total,
        risk_level: riskScore.level,
        signals: Object.fromEntries(Object.entries(riskScore.signals).map(([k, s]) => [k, s.triggered])),
        typologies: typologies.filter(t => t.triggered).map(t => t.name),
        narrative: narrative ?? '',
        sar_draft: sarDraftRaw ?? '',
        analyzed_at: analysis.analyzedAt,
      },
    });
  }

  // ── 14. Respond ───────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      data: analysis,
      narrative,
      sarDraft: sarDraftRaw,
      hopData,
      resolvedAddress: address,
    },
    { status: 200, headers: CORS_HEADERS }
  );
}
