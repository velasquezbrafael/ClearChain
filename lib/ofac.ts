// Last updated: 2026-04-23
// Update from https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists

import type { OFACResult } from '@/types';
import OFAC_ADDRESSES from '@/data/ofac-eth-addresses.json';

// ---------------------------------------------------------------------------
// In-house SDN address map — no network calls, instant on cold start
// ---------------------------------------------------------------------------

const SDN_MAP: Map<string, string> = new Map(
  Object.entries(OFAC_ADDRESSES as Record<string, string>).map(
    ([addr, entity]) => [addr.toLowerCase(), entity]
  )
);

let loadedAt: string = new Date().toISOString();

// ---------------------------------------------------------------------------
// Public API (kept async for backwards compatibility with route.ts callers)
// ---------------------------------------------------------------------------

export async function loadSDNList(): Promise<void> {
  // No-op — list is loaded synchronously from the bundled JSON above
  loadedAt = new Date().toISOString();
}

export async function checkAddress(address: string): Promise<OFACResult> {
  const normalized = address.toLowerCase().trim();

  if (!/^0x[0-9a-f]{40}$/i.test(normalized)) {
    return { matched: false, confidence: 0, listLastFetched: loadedAt };
  }

  const matchedEntity = SDN_MAP.get(normalized);

  if (matchedEntity) {
    console.warn(`[ClearChain/ofac] OFAC MATCH: ${address} — "${matchedEntity}"`);
    return { matched: true, matchedEntity, confidence: 1.0, listLastFetched: loadedAt };
  }

  return { matched: false, confidence: 0, listLastFetched: loadedAt };
}

export function getSDNCacheStatus() {
  return { loaded: true, addressCount: SDN_MAP.size, loadedAt };
}
