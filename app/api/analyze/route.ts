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
import { checkAddress } from '@/lib/ofac';
import { computeRiskScore } from '@/lib/scoring';
import { matchTypologies } from '@/lib/typology';
import { generateAll } from '@/lib/claude';
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
// POST — main analysis
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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
  const chain = (body as Record<string, unknown>).chain === 'BTC' ? 'BTC' : 'ETH';

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
        if (user) {
          await supabase.from('analyses').insert({
            user_id: user.id,
            address,
            chain: 'BTC',
            risk_score: btcRiskScore.total,
            risk_level: btcRiskScore.level,
            signals: btcRiskScore.signals,
            typologies: [],
            narrative,
            sar_draft: sarDraftRaw,
          });
        }
      } catch (err) {
        console.error('[ClearChain/analyze] Supabase BTC save failed:', err);
      }

      analysisCache.set(cacheKey, { data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], cachedAt: Date.now() });

      return NextResponse.json(
        { success: true, data: analysis, narrative, sarDraft: sarDraftRaw, hopData: [], resolvedAddress: address },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      console.error('[ClearChain/analyze] Bitcoin fetch failed:', err);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch Bitcoin transaction history', code: 'MEMPOOL_ERROR' },
        { status: 502, headers: CORS_HEADERS }
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
      { status: 502, headers: CORS_HEADERS }
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
    if (user) {
      await supabase.from('analyses').insert({
        user_id: user.id,
        address,
        chain: 'ETH',
        risk_score: analysis.riskScore.total,
        risk_level: analysis.riskScore.level,
        signals: analysis.riskScore.signals,
        typologies: analysis.typologies,
        narrative,
        sar_draft: sarDraftRaw,
      });
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

  // ── 13. Respond ───────────────────────────────────────────────────────────
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
