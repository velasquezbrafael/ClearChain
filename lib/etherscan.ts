/**
 * ClearChain — Alchemy API Client
 *
 * Fetches on-chain transaction history for a given Ethereum address using the
 * Alchemy Transfers API (alchemy_getAssetTransfers). Covers both native ETH
 * transfers and ERC-20 token transfers in a single, paginated endpoint.
 *
 * Why Alchemy over Etherscan:
 * - 300M compute units/month free tier vs. Etherscan's 100k req/day — far
 *   more headroom for an AML tool that may analyze many addresses in a session.
 * - alchemy_getAssetTransfers returns ETH and token transfers in one call with
 *   consistent pagination, vs. Etherscan's two separate endpoints.
 * - Better uptime SLAs than Etherscan, which has known reliability issues at
 *   peak times.
 * - No additional npm dependency — it's a plain JSON-RPC call over fetch.
 *
 * All returned values are normalized into ClearChain's WalletTransaction type.
 * Wei/hex values are converted to ETH floats; timestamps are Unix seconds.
 *
 * Environment variable required: ALCHEMY_API_KEY
 */

import type { WalletTransaction } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Alchemy Ethereum mainnet base URL — key goes in the path, not a header */
const ALCHEMY_BASE_URL = 'https://eth-mainnet.g.alchemy.com/v2';

/**
 * Maximum number of transfers to fetch per call.
 * Alchemy's hard cap per page is 1000; 100 keeps parity with the previous
 * Etherscan implementation while staying well under rate limits.
 */
const MAX_TRANSFERS = 100;

// ---------------------------------------------------------------------------
// Internal Alchemy Response Types
// ---------------------------------------------------------------------------

/**
 * A single transfer object returned by alchemy_getAssetTransfers.
 * Only the fields ClearChain needs are typed; the full shape has more.
 */
interface AlchemyTransfer {
  hash: string;
  from: string;
  to: string | null;           // null for contract-creation transactions
  value: number | null;        // ETH amount as a float (already converted by Alchemy)
  asset: string | null;        // "ETH" for native; token symbol for ERC-20
  rawContract: {
    address: string | null;    // Token contract address (null for ETH)
    decimal: string | null;    // Hex-encoded decimal count
    value: string | null;      // Hex-encoded raw token amount
  };
  blockNum: string;            // Hex-encoded block number, e.g. "0x12ab34"
  metadata: {
    blockTimestamp: string;    // ISO 8601, e.g. "2024-01-15T12:30:00.000Z"
  };
  category: string;            // "external" | "erc20" | "erc721" | etc.
}

/** JSON-RPC envelope returned by Alchemy for alchemy_getAssetTransfers */
interface AlchemyResponse {
  jsonrpc: string;
  id: number;
  result?: {
    transfers: AlchemyTransfer[];
    pageKey?: string;          // Present if more pages exist
  };
  error?: {
    code: number;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO 8601 timestamp string to a Unix timestamp in seconds.
 * Alchemy's blockTimestamp field is always ISO 8601.
 */
function isoToUnixSeconds(iso: string): number {
  try {
    return Math.floor(new Date(iso).getTime() / 1000);
  } catch {
    return 0;
  }
}

/**
 * Parse a hex-encoded block number string to a decimal integer.
 * Alchemy returns blockNum as a hex string, e.g. "0x12ab34".
 */
function hexToInt(hex: string): number {
  try {
    return parseInt(hex, 16);
  } catch {
    return 0;
  }
}

/**
 * Convert a hex-encoded token amount to a float, adjusted for token decimals.
 * Used for ERC-20 transfers where Alchemy's top-level `value` may be null.
 * Defaults to 18 decimals (standard ERC-20) if the hex decimal field is absent.
 */
function rawHexToFloat(hexAmount: string | null, hexDecimals: string | null): number {
  if (!hexAmount) return 0;
  try {
    const decimals = hexDecimals ? parseInt(hexDecimals, 16) : 18;
    const amount = BigInt(hexAmount);
    return Number(amount) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

/**
 * Normalize an Alchemy transfer into a WalletTransaction.
 * Works for both native ETH transfers (category "external") and ERC-20 transfers.
 *
 * @param transfer  Raw Alchemy transfer object
 * @param address   The wallet address being analyzed (for inbound detection)
 */
function normalizeTransfer(transfer: AlchemyTransfer, address: string): WalletTransaction {
  const isErc20 = transfer.category === 'erc20';

  // For ERC-20, use the raw hex amount from rawContract if Alchemy's float
  // value is null (can happen for tokens with non-standard configurations).
  const value = isErc20
    ? (transfer.value ?? rawHexToFloat(transfer.rawContract.value, transfer.rawContract.decimal))
    : (transfer.value ?? 0);

  return {
    hash: transfer.hash,
    from: (transfer.from ?? '').toLowerCase(),
    to: (transfer.to ?? '').toLowerCase(),
    value,
    timestamp: isoToUnixSeconds(transfer.metadata.blockTimestamp),
    blockNumber: hexToInt(transfer.blockNum),
    tokenSymbol: isErc20 ? (transfer.asset ?? undefined) : undefined,
    tokenAddress: isErc20 ? (transfer.rawContract.address?.toLowerCase() ?? undefined) : undefined,
    isInbound: (transfer.to ?? '').toLowerCase() === address.toLowerCase(),
  };
}

/**
 * Make a directional alchemy_getAssetTransfers call.
 * Alchemy requires fromAddress and toAddress to be used separately (AND, not OR),
 * so this helper accepts an explicit direction parameter.
 *
 * @param address   Ethereum wallet address
 * @param direction "from" = outbound, "to" = inbound
 * @param category  "external" | "erc20"
 */
async function fetchDirectional(
  address: string,
  direction: 'from' | 'to',
  category: 'external' | 'internal' | 'erc20',
): Promise<AlchemyTransfer[]> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    // Already logged in the outer helper; return silently
    return [];
  }

  const url = `${ALCHEMY_BASE_URL}/${apiKey}`;

  const params: Record<string, unknown> = {
    fromBlock: '0x0',
    toBlock: 'latest',
    category: [category],
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: `0x${MAX_TRANSFERS.toString(16)}`,
    order: 'desc',
  };

  if (direction === 'from') {
    params.fromAddress = address;
  } else {
    params.toAddress = address;
  }

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'alchemy_getAssetTransfers',
    params: [params],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(`[ClearChain/alchemy] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const data: AlchemyResponse = await response.json();

    if (data.error) {
      console.error(
        `[ClearChain/alchemy] RPC error ${data.error.code} (${direction}/${category}): ${data.error.message}`,
      );
      return [];
    }

    return data.result?.transfers ?? [];
  } catch (err) {
    console.error(`[ClearChain/alchemy] Fetch failed (${direction}/${category}):`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the last N normal (native ETH) transactions for a wallet.
 *
 * Makes two directional calls (inbound + outbound) and merges, deduplicating
 * by hash since a transfer from A to A would appear in both.
 *
 * @param address Ethereum wallet address
 * @returns Normalized array of WalletTransaction, sorted ascending by timestamp
 */
export async function getTransactions(address: string): Promise<WalletTransaction[]> {
  const normalizedAddress = address.toLowerCase();

  const [outbound, inbound, internalOut, internalIn] = await Promise.all([
    fetchDirectional(normalizedAddress, 'from', 'external'),
    fetchDirectional(normalizedAddress, 'to', 'external'),
    fetchDirectional(normalizedAddress, 'from', 'internal'),
    fetchDirectional(normalizedAddress, 'to', 'internal'),
  ]);

  // Merge and deduplicate by transaction hash
  const seen = new Set<string>();
  const merged: AlchemyTransfer[] = [];

  for (const tx of [...outbound, ...inbound, ...internalOut, ...internalIn]) {
    if (!seen.has(tx.hash)) {
      seen.add(tx.hash);
      merged.push(tx);
    }
  }

  return merged
    .map((tx) => normalizeTransfer(tx, normalizedAddress))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch the last N ERC-20 token transfer events for a wallet.
 *
 * Covers inbound and outbound transfers for all token contracts.
 *
 * @param address Ethereum wallet address
 * @returns Normalized array of WalletTransaction with tokenSymbol populated
 */
export async function getTokenTransfers(address: string): Promise<WalletTransaction[]> {
  const normalizedAddress = address.toLowerCase();

  const [outbound, inbound] = await Promise.all([
    fetchDirectional(normalizedAddress, 'from', 'erc20'),
    fetchDirectional(normalizedAddress, 'to', 'erc20'),
  ]);

  // Merge and deduplicate by transaction hash
  const seen = new Set<string>();
  const merged: AlchemyTransfer[] = [];

  for (const tx of [...outbound, ...inbound]) {
    if (!seen.has(tx.hash)) {
      seen.add(tx.hash);
      merged.push(tx);
    }
  }

  return merged
    .map((tx) => normalizeTransfer(tx, normalizedAddress))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Calculate the age of a wallet in days based on its earliest known transaction.
 *
 * Used by the high_volume_anomaly typology to flag disproportionate volume
 * for a wallet's apparent operational history.
 *
 * @param transactions Sorted array of WalletTransaction (any order works)
 * @returns Number of days since the first transaction, or 0 if no transactions
 */
export function getWalletAge(transactions: WalletTransaction[]): number {
  if (transactions.length === 0) return 0;

  const earliestTimestamp = Math.min(...transactions.map((tx) => tx.timestamp));
  const nowSeconds = Date.now() / 1000;
  const ageSeconds = nowSeconds - earliestTimestamp;

  return Math.floor(ageSeconds / 86400);
}

/**
 * Resolve an ENS name or pass-through a raw 0x address.
 *
 * - 0x address → returned lowercase as-is (no network call)
 * - *.eth or any string containing "." → resolved via Alchemy alchemy_resolveName
 * - Anything else → thrown as invalid
 *
 * @throws Error if resolution fails or the name is unregistered
 */
export async function resolveENS(input: string): Promise<string> {
  const trimmed = input.trim();

  // Already a valid address — skip resolution
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Must contain a dot to be a valid ENS name
  if (!trimmed.includes('.')) {
    throw new Error(`Invalid address or ENS name: "${trimmed}"`);
  }

  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('Alchemy API key not configured — cannot resolve ENS');
  }

  const url = `${ALCHEMY_BASE_URL}/${apiKey}`;
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'alchemy_resolveName',
    params: [trimmed],
  };

  let data: { result?: string | null; error?: { message: string } };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    data = await response.json();
  } catch (err) {
    throw new Error(`ENS resolution network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (data.error) {
    throw new Error(`ENS resolution error: ${data.error.message}`);
  }

  if (!data.result) {
    throw new Error(`ENS name '${trimmed}' could not be resolved — name may be unregistered or expired`);
  }

  return data.result.toLowerCase();
}

/**
 * Return the top N unique counterparty addresses by total ETH volume exchanged
 * with the queried wallet.
 *
 * Uses the `isInbound` flag to identify the counterparty side of each
 * transaction (inbound → from, outbound → to).
 *
 * @param transactions Normalized transactions from the queried wallet
 * @param limit        Maximum number of addresses to return
 */
export function getTopCounterparties(transactions: WalletTransaction[], limit: number): string[] {
  const volumeMap = new Map<string, number>();

  for (const tx of transactions) {
    const counterparty = tx.isInbound ? tx.from.toLowerCase() : tx.to.toLowerCase();
    if (counterparty) {
      volumeMap.set(counterparty, (volumeMap.get(counterparty) ?? 0) + tx.value);
    }
  }

  return [...volumeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([addr]) => addr);
}
