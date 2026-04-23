/**
 * ClearChain — POST /api/analyze
 *
 * Core analysis endpoint. Accepts a wallet address, runs the full
 * ClearChain pipeline (Etherscan fetch → OFAC check → risk scoring →
 * typology matching → AI narrative + SAR draft), and returns the
 * complete WalletAnalysis alongside the generated narrative and SAR.
 *
 * Also exposes GET /api/analyze/sar?address=0x... for SAR file download.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getTransactions, getTokenTransfers } from '@/lib/etherscan';
import { checkAddress } from '@/lib/ofac';
import { computeRiskScore } from '@/lib/scoring';
import { matchTypologies } from '@/lib/typology';
import { generateAll } from '@/lib/claude';

import type { WalletTransaction, WalletAnalysis } from '@/types';

// ---------------------------------------------------------------------------
// CORS headers — public API
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ---------------------------------------------------------------------------
// Analysis result cache — 5 minute TTL
// Ensures the same address always returns the same score within a session.
// ---------------------------------------------------------------------------

interface CachedResult {
  data: WalletAnalysis;
  narrative: string;
  sarDraft: string;
  cachedAt: number;
}

const analysisCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helper: deduplicate + merge transactions
// ---------------------------------------------------------------------------

/**
 * Merge ETH and token transfer arrays, deduplicating by hash.
 * Where a hash appears in both sets, the ETH record is preferred
 * (it has the native value; the token version is supplementary).
 * isInbound is set relative to the queried address.
 */
function mergeAndDedup(
  ethTxs: WalletTransaction[],
  tokenTxs: WalletTransaction[],
  address: string
): WalletTransaction[] {
  const map = new Map<string, WalletTransaction>();

  // ETH txs first — these are the primary records
  for (const tx of ethTxs) {
    map.set(tx.hash, {
      ...tx,
      isInbound: tx.to.toLowerCase() === address.toLowerCase(),
    });
  }

  // Token txs fill in hashes not already present
  for (const tx of tokenTxs) {
    if (!map.has(tx.hash)) {
      map.set(tx.hash, {
        ...tx,
        isInbound: tx.to.toLowerCase() === address.toLowerCase(),
      });
    }
  }

  // Sort ascending by timestamp (oldest first — good for narrative flow)
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
  // ── 1. Parse + validate request body ──────────────────────────────────────
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
    typeof body !== 'object' ||
    body === null ||
    !('address' in body) ||
    typeof (body as Record<string, unknown>).address !== 'string'
  ) {
    return NextResponse.json(
      { success: false, error: 'Request body must include an "address" string field', code: 'MISSING_ADDRESS' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const rawAddress = ((body as Record<string, unknown>).address as string).trim();

  if (!rawAddress) {
    return NextResponse.json(
      { success: false, error: 'Address cannot be empty', code: 'MISSING_ADDRESS' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(rawAddress)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid Ethereum address. Must match /^0x[a-fA-F0-9]{40}$/',
        code: 'INVALID_ADDRESS',
      },
      { status: 422, headers: CORS_HEADERS }
    );
  }

  // ── 2. Normalise ───────────────────────────────────────────────────────────
  const address = rawAddress.toLowerCase();

  // ── 2b. Cache check — return cached result within TTL ─────────────────────
  const cached = analysisCache.get(address);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.info(`[ClearChain] Cache hit for ${address}`);
    return NextResponse.json(
      { success: true, data: cached.data, narrative: cached.narrative, sarDraft: cached.sarDraft },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // ── 3. Fetch data in parallel ──────────────────────────────────────────────
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

  // OFAC check can run in parallel with tx fetch; we do it separately so errors
  // in OFAC don't block the rest of the pipeline
  let ofacResult;
  try {
    ofacResult = await checkAddress(address);
  } catch (err) {
    console.error('[ClearChain/analyze] OFAC check failed:', err);
    // Fail open — return a clean OFAC result rather than blocking the analysis
    ofacResult = { matched: false, confidence: 0 };
  }

  // ── 4. Merge + deduplicate transactions ────────────────────────────────────
  const transactions = mergeAndDedup(ethTxs, tokenTxs, address);

  // ── 5. Risk scoring ────────────────────────────────────────────────────────
  const riskScore = computeRiskScore({
    transactions,
    ofacResult,
    communityFlags: 0,
    address,
  });

  // ── 6. Typology matching ───────────────────────────────────────────────────
  const typologies = matchTypologies(transactions, riskScore);

  // ── 7. Build WalletAnalysis object ────────────────────────────────────────
  const analysis: WalletAnalysis = {
    address,
    chain: 'ETH',
    riskScore,
    typologies,
    transactions,
    ofacResult,
    analyzedAt: new Date().toISOString(),
  };

  // ── 8. Generate narrative + SAR draft in a single Claude call ────────────
  const { narrative, sarDraft: sarDraftRaw } = await generateAll(analysis);

  // Cache full result for 5 minutes — ensures score consistency on repeat queries
  analysisCache.set(address, {
    data: analysis,
    narrative,
    sarDraft: sarDraftRaw,
    cachedAt: Date.now(),
  });

  // ── 9. Return response ────────────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      data: analysis,
      narrative,
      sarDraft: sarDraftRaw,
    },
    { status: 200, headers: CORS_HEADERS }
  );
}
