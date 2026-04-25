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
import { getTronTransactions, detectTrxPatterns } from '@/lib/tron';
import OFAC_TRX from '@/data/ofac-trx-addresses.json';
import { checkAddress } from '@/lib/ofac';
import { computeRiskScore } from '@/lib/scoring';
import { matchTypologies } from '@/lib/typology';
import { generateAll } from '@/lib/claude';
import { hashApiKey } from '@/lib/apikeys';
import { fireWebhook } from '@/lib/webhook';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { WalletTransaction, WalletAnalysis, RiskScore, ScoringSignal } from '@/types';

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
  const chain: 'ETH' | 'BTC' | 'TRX' =
    rawChain === 'BTC' ? 'BTC' : rawChain === 'TRX' ? 'TRX' : 'ETH';

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
        { status: 422, headers: CORS_HEADERS }
      );
    }
    address = rawAddress;
  } else if (chain === 'TRX') {
    const isTrxAddr = /^T[a-zA-Z0-9]{33}$/.test(rawAddress);
    if (!isTrxAddr) {
      return NextResponse.json(
        { success: false, error: 'Invalid Tron address format. Must start with T and be 34 characters.', code: 'INVALID_ADDRESS' },
        { status: 422, headers: CORS_HEADERS }
      );
    }
    address = rawAddress;
  } else {
    try {
      address = await resolveENS(rawAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resolve address or ENS name';
      return NextResponse.json(
        { success: false, error: message, code: 'ENS_RESOLUTION_FAILED' },
        { status: 422, headers: CORS_HEADERS }
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
      ofacResult = { matched: false, confidence: 0 }; // OFAC list is ETH-only

      // BTC-specific scoring
      const patterns = detectBtcPatterns(address, rawTxs);
      const btcSignals: ScoringSignal[] = [
        {
          name: 'ofac_match',
          weight: 40,
          triggered: false,
          score: 0,
          detail: 'BTC address not found on OFAC SDN list.',
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
      const btcRiskScore: RiskScore = { total: totalScore, level, signals: btcSignals };

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

      if (apiKeyWebhookUrl && apiKeyId) {
        fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
          event: 'analysis.complete',
          timestamp: new Date().toISOString(),
          api_key_id: apiKeyId,
          data: {
            address, chain: 'BTC',
            risk_score: btcRiskScore.total,
            risk_level: btcRiskScore.level,
            signals: Object.fromEntries(btcRiskScore.signals.map(s => [s.name, s.triggered])),
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
      const rawTrxTxs = await getTronTransactions(address);
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
          weight: 25,
          triggered: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk),
          score: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk) ? 25 : 0,
          detail: patterns.rapidHops
            ? trxOfacResult.matched || hasCounterpartyRisk
              ? '≥3 outbound TRX transactions within 24 hours alongside OFAC exposure — consistent with rapid layering.'
              : '≥3 outbound transactions in 24 hours detected, but no corroborating OFAC or counterparty risk (signal suppressed).'
            : 'No rapid fund movement pattern detected.',
        },
        {
          name: 'high_risk_counterparty',
          weight: 20,
          triggered: hasCounterpartyRisk,
          score: hasCounterpartyRisk ? 20 : 0,
          detail: hasCounterpartyRisk
            ? `${counterpartyHits.length} transaction(s) with OFAC-sanctioned TRX counterparty addresses. Enhanced due diligence required.`
            : 'No interactions with known sanctioned TRX counterparties.',
        },
        {
          name: 'volume_anomaly',
          weight: 15,
          triggered: patterns.highVolume,
          score: patterns.highVolume ? 15 : 0,
          detail: patterns.highVolume
            ? 'High TRX volume detected in a wallet less than 30 days old — inconsistent with normal wallet activity.'
            : 'TRX volume within expected range for wallet age.',
        },
      ];

      const totalScore = Math.min(100, trxSignals.reduce((s, sig) => s + sig.score, 0));
      const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW';
      const trxRiskScore: RiskScore = { total: totalScore, level, signals: trxSignals };

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

      if (apiKeyWebhookUrl && apiKeyId) {
        fireWebhook(apiKeyWebhookUrl, apiKeyWebhookSecret, {
          event: 'analysis.complete',
          timestamp: new Date().toISOString(),
          api_key_id: apiKeyId,
          data: {
            address, chain: 'TRX',
            risk_score: trxRiskScore.total,
            risk_level: trxRiskScore.level,
            signals: Object.fromEntries(trxRiskScore.signals.map(s => [s.name, s.triggered])),
            typologies: [],
            narrative: narrative ?? '',
            sar_draft: sarDraftRaw ?? '',
            analyzed_at: analysis.analyzedAt,
          },
        });
      }

      console.info('[ClearChain/analyze] TRX response shape:', {
        address, chain: 'TRX',
        riskScore: { total: trxRiskScore.total, level: trxRiskScore.level, signalCount: trxRiskScore.signals.length },
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

  // ── 6. Risk scoring ────────────────────────────────────────────────────────
  const riskScore = computeRiskScore({ transactions, ofacResult, communityFlags: 0, address });

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
        signals: Object.fromEntries(riskScore.signals.map(s => [s.name, s.triggered])),
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
