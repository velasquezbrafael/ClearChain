// ClearChain — OFAC SDN checker
//
// Priority order for address lookups:
//   1. In-memory cache (refreshed from Supabase every hour)
//   2. Supabase `ofac_addresses` table (populated by /api/cron/refresh-ofac)
//   3. Static fallback JSON bundled at build time (last updated 2026-04-23)
//
// Static JSONs are the ultimate safety net — if Supabase is unreachable on a
// cold start the checker still works, just with a slightly stale list.

import { createClient } from '@supabase/supabase-js';
import type { OFACResult } from '@/types';
import OFAC_ETH_STATIC from '@/data/ofac-eth-addresses.json';
import OFAC_SOL_STATIC from '@/data/ofac-sol-addresses.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SDNMaps {
  eth: Map<string, string>; // lower(address) → entity_name
  sol: Map<string, string>; // address → entity_name  (base58, case-sensitive)
  trx: Map<string, string>; // lower(address) → entity_name
  btc: Map<string, string>; // lower(address) → entity_name
  other: Map<string, string>;
  loadedAt: number;         // Date.now() timestamp
}

// ---------------------------------------------------------------------------
// Module-level in-memory cache (shared across hot-reloads in the same process)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache: SDNMaps | null = null;
let _loadingPromise: Promise<SDNMaps> | null = null;

// ---------------------------------------------------------------------------
// Static fallback maps (built from bundled JSON — always available)
// ---------------------------------------------------------------------------

function buildStaticMaps(): SDNMaps {
  const eth = new Map<string, string>(
    Object.entries(OFAC_ETH_STATIC as Record<string, string>).map(
      ([addr, entity]) => [addr.toLowerCase(), entity],
    ),
  );
  const sol = new Map<string, string>(
    Object.entries(OFAC_SOL_STATIC as Record<string, string>),
  );
  return { eth, sol, trx: new Map(), btc: new Map(), other: new Map(), loadedAt: 0 };
}

const STATIC_MAPS = buildStaticMaps();

// ---------------------------------------------------------------------------
// Supabase service-role client (no RLS, server-side only)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SECRET_KEY;
  if (!url || !svcKey) return null;
  return createClient(url, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Load SDN maps from Supabase — returns static maps on any error
// ---------------------------------------------------------------------------

async function loadFromSupabase(): Promise<SDNMaps> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('[ClearChain/ofac] No service role key — using static fallback');
    return { ...STATIC_MAPS, loadedAt: Date.now() };
  }

  try {
    // Page through all rows (Supabase default limit is 1000)
    const eth   = new Map<string, string>();
    const sol   = new Map<string, string>();
    const trx   = new Map<string, string>();
    const btc   = new Map<string, string>();
    const other = new Map<string, string>();

    let from = 0;
    const PAGE = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('ofac_addresses')
        .select('address, chain, entity_name')
        .range(from, from + PAGE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data) {
        const { address, chain, entity_name } = row as {
          address: string; chain: string; entity_name: string;
        };
        switch (chain) {
          case 'ETH': eth.set(address.toLowerCase(), entity_name);   break;
          case 'SOL': sol.set(address, entity_name);                  break; // base58, case-sensitive
          case 'TRX': trx.set(address.toLowerCase(), entity_name);   break;
          case 'BTC': btc.set(address.toLowerCase(), entity_name);   break;
          default:    other.set(address.toLowerCase(), entity_name);  break;
        }
      }

      if (data.length < PAGE) break;
      from += PAGE;
    }

    const total = eth.size + sol.size + trx.size + btc.size + other.size;
    console.log(`[ClearChain/ofac] Loaded ${total} addresses from Supabase (ETH:${eth.size} SOL:${sol.size} TRX:${trx.size} BTC:${btc.size})`);

    // If Supabase returned 0 rows (table not yet populated), use static fallback
    if (total === 0) {
      console.warn('[ClearChain/ofac] Supabase returned 0 rows — using static fallback');
      return { ...STATIC_MAPS, loadedAt: Date.now() };
    }

    // Merge static JSON into Supabase maps — static JSON contains manually curated
    // addresses (e.g. TC router) that the official OFAC XML may not list by address.
    // Static entries are added only if not already present in live data.
    for (const [addr, entity] of STATIC_MAPS.eth) {
      if (!eth.has(addr)) eth.set(addr, entity);
    }
    for (const [addr, entity] of STATIC_MAPS.sol) {
      if (!sol.has(addr)) sol.set(addr, entity);
    }

    return { eth, sol, trx, btc, other, loadedAt: Date.now() };

  } catch (err) {
    console.error('[ClearChain/ofac] Supabase load failed, using static fallback:', err);
    return { ...STATIC_MAPS, loadedAt: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Cache accessor — ensures only one concurrent load is in flight
// ---------------------------------------------------------------------------

async function getSDNMaps(): Promise<SDNMaps> {
  // Return warm cache if within TTL
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache;
  }

  // Coalesce concurrent refreshes into a single promise
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = loadFromSupabase().then(maps => {
    _cache = maps;
    _loadingPromise = null;
    return maps;
  }).catch(err => {
    _loadingPromise = null;
    // If cache exists but stale, keep it rather than crashing
    if (_cache) return _cache;
    console.error('[ClearChain/ofac] getSDNMaps failed:', err);
    return { ...STATIC_MAPS, loadedAt: Date.now() };
  });

  return _loadingPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Pre-warm the cache. Call from app startup if desired (no-op if already warm). */
export async function loadSDNList(): Promise<void> {
  await getSDNMaps();
}

/** Check an Ethereum address against the SDN list. */
export async function checkAddress(address: string): Promise<OFACResult> {
  const normalized = address.toLowerCase().trim();

  if (!/^0x[0-9a-f]{40}$/i.test(normalized)) {
    return { matched: false, confidence: 0, listLastFetched: new Date().toISOString() };
  }

  const maps = await getSDNMaps();
  const matchedEntity = maps.eth.get(normalized);
  const listLastFetched = new Date(maps.loadedAt || Date.now()).toISOString();

  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC MATCH: ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched };
  }

  return { matched: false, confidence: 0, listLastFetched };
}

/** Check a Solana address against the SDN list (base58, case-sensitive). */
export async function checkOfacSolAsync(address: string): Promise<OFACResult> {
  const maps = await getSDNMaps();
  const matchedEntity = maps.sol.get(address);
  const listLastFetched = new Date(maps.loadedAt || Date.now()).toISOString();

  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC SOL MATCH: ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched };
  }

  return { matched: false, confidence: 0, listLastFetched };
}

/**
 * Synchronous Solana check — uses static maps only.
 * Kept for backwards compatibility with callers that can't await.
 * Prefer checkOfacSolAsync() for live data.
 */
export function checkOfacSol(address: string): OFACResult {
  const matchedEntity = STATIC_MAPS.sol.get(address);
  const listLastFetched = new Date().toISOString();
  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC SOL MATCH (static): ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched };
  }
  return { matched: false, confidence: 0, listLastFetched };
}

/** Check a TRON address against the SDN list. */
export async function checkOfacTrx(address: string): Promise<OFACResult> {
  const maps = await getSDNMaps();
  const matchedEntity = maps.trx.get(address.toLowerCase());
  const listLastFetched = new Date(maps.loadedAt || Date.now()).toISOString();

  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC TRX MATCH: ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched };
  }

  return { matched: false, confidence: 0, listLastFetched };
}

/** Check a Bitcoin address against the SDN list (case-insensitive). */
export async function checkOfacBtc(address: string): Promise<OFACResult> {
  const maps = await getSDNMaps();
  const matchedEntity = maps.btc.get(address.toLowerCase());
  const listLastFetched = new Date(maps.loadedAt || Date.now()).toISOString();

  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC BTC MATCH: ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched };
  }

  return { matched: false, confidence: 0, listLastFetched };
}

/** Returns cache status for diagnostics / admin endpoints. */
export function getSDNCacheStatus() {
  if (!_cache) {
    return {
      loaded: false,
      addressCount: STATIC_MAPS.eth.size + STATIC_MAPS.sol.size,
      source: 'static',
      loadedAt: null,
    };
  }
  const total = _cache.eth.size + _cache.sol.size + _cache.trx.size
    + _cache.btc.size + _cache.other.size;
  const ageMs = Date.now() - _cache.loadedAt;
  return {
    loaded: true,
    addressCount: total,
    source: 'supabase',
    loadedAt: new Date(_cache.loadedAt).toISOString(),
    ageMs,
    stale: ageMs > CACHE_TTL_MS,
    byChain: {
      eth:   _cache.eth.size,
      sol:   _cache.sol.size,
      trx:   _cache.trx.size,
      btc:   _cache.btc.size,
      other: _cache.other.size,
    },
  };
}
