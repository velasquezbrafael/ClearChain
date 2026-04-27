/**
 * ClearChain — Tron (TRX) chain support
 *
 * Uses the public TronGrid API (no API key required for basic access).
 * Fetches TRX native transfers, converts hex addresses to base58check,
 * and exposes AML pattern detection for the TRX pipeline.
 */

import type { WalletTransaction } from '@/types';
import crypto from 'crypto';

const TRONGRID_BASE = 'https://api.trongrid.io';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// ---------------------------------------------------------------------------
// Address utilities
// ---------------------------------------------------------------------------

/**
 * Validate a Tron base58check address. T + 33 base58 characters = 34 total.
 */
export function validateTronAddress(address: string): boolean {
  return /^T[a-zA-Z0-9]{33}$/.test(address);
}

/**
 * Convert Tron's internal hex address format (41xxxx) to base58check (Txxxx).
 * Tron addresses are 21-byte payloads with a 4-byte checksum appended.
 */
function hexToBase58Check(hexAddr: string): string {
  const raw = hexAddr.startsWith('0x') ? hexAddr.slice(2) : hexAddr;
  const buf = Buffer.from(raw, 'hex');
  const h1 = crypto.createHash('sha256').update(buf).digest();
  const h2 = crypto.createHash('sha256').update(h1).digest();
  const payload = Buffer.concat([buf, h2.slice(0, 4)]);

  let num = BigInt('0x' + payload.toString('hex'));
  let result = '';
  const base = BigInt(58);
  const zero = BigInt(0);
  while (num > zero) {
    result = BASE58_ALPHABET[Number(num % base)] + result;
    num = num / base;
  }
  for (let i = 0; i < payload.length && payload[i] === 0; i++) {
    result = BASE58_ALPHABET[0] + result;
  }
  return result;
}

/**
 * Normalize any Tron address to T... base58 format.
 * If already T..., return as-is. If 41... hex, convert.
 */
function normalizeTronAddr(addr: string): string {
  if (!addr) return addr;
  if (addr.startsWith('T') && addr.length === 34) return addr;
  if ((addr.startsWith('41') || addr.startsWith('0x41')) && addr.length >= 42) {
    return hexToBase58Check(addr.startsWith('0x') ? addr.slice(2) : addr);
  }
  return addr;
}

// ---------------------------------------------------------------------------
// TronGrid API types
// ---------------------------------------------------------------------------

interface TronContract {
  type: string;
  parameter: {
    value: {
      owner_address?: string;
      to_address?: string;
      amount?: number;
    };
  };
}

interface TronTx {
  txID: string;
  raw_data: {
    contract: TronContract[];
    timestamp?: number;
  };
  ret?: Array<{ contractRet?: string }>;
  block_timestamp?: number;
}

interface TronApiResponse {
  data?: TronTx[];
  success?: boolean;
  meta?: { page_size?: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getTronTransactions(address: string): Promise<WalletTransaction[]> {
  const res = await fetch(
    `${TRONGRID_BASE}/v1/accounts/${address}/transactions?limit=50&only_confirmed=true`,
    { next: { revalidate: 60 } }
  );

  if (!res.ok) {
    if (res.status === 400) {
      const e = Object.assign(new Error('Invalid Tron address format'), { statusCode: 400 });
      throw e;
    }
    if (res.status === 404) {
      const e = Object.assign(new Error('Tron address not found on-chain'), { statusCode: 404 });
      throw e;
    }
    if (res.status === 429) {
      const e = Object.assign(new Error('TronGrid rate limit reached. Please retry in a few seconds.'), { statusCode: 429 });
      throw e;
    }
    const e = Object.assign(new Error(`TronGrid tx fetch failed: ${res.status}`), { statusCode: 422 });
    throw e;
  }

  let json: TronApiResponse;
  try {
    json = await res.json();
  } catch {
    throw new Error('TronGrid returned invalid JSON response');
  }

  const txs = json.data ?? [];
  const result: WalletTransaction[] = [];

  for (const tx of txs) {
    // Skip failed transactions
    if (tx.ret?.[0]?.contractRet && tx.ret[0].contractRet !== 'SUCCESS') continue;

    const contract = tx.raw_data?.contract?.[0];
    if (!contract) continue;

    // Only native TRX transfers (TransferContract)
    if (contract.type !== 'TransferContract') continue;

    const val = contract.parameter?.value;
    if (!val?.owner_address || !val?.to_address) continue;

    const from = normalizeTronAddr(val.owner_address ?? '') || '';
    const to = normalizeTronAddr(val.to_address ?? '') || '';
    if (!from || !to) continue;
    const rawAmount = val.amount ?? 0;
    const amount = isNaN(rawAmount) ? 0 : rawAmount / 1_000_000; // sun → TRX
    if (amount === 0) continue;

    const timestamp = Math.floor(
      (tx.block_timestamp ?? tx.raw_data?.timestamp ?? Date.now()) / 1000
    );

    result.push({
      hash: tx.txID,
      from,
      to,
      value: amount,
      timestamp,
      blockNumber: 0,
      isInbound: to === address,
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// TRC-20 token transfers (USDT, USDC, etc.)
// ---------------------------------------------------------------------------

interface TRC20Transfer {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string; // raw integer as string
  token_info: {
    symbol?: string;
    decimals?: number;
    address?: string;
  };
}

interface TRC20Response {
  data?: TRC20Transfer[];
  success?: boolean;
}

export async function getTronTRC20Transfers(address: string): Promise<WalletTransaction[]> {
  const res = await fetch(
    `${TRONGRID_BASE}/v1/accounts/${address}/transactions/trc20?limit=50&only_confirmed=true`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return []; // fail-open — native TRX data still flows through

  let json: TRC20Response;
  try { json = await res.json(); } catch { return []; }

  const result: WalletTransaction[] = [];
  for (const tx of json.data ?? []) {
    if (!tx.from || !tx.to) continue;
    const decimals = tx.token_info?.decimals ?? 6;
    const rawValue = parseFloat(tx.value ?? '0');
    if (isNaN(rawValue) || rawValue === 0) continue;
    const amount = rawValue / Math.pow(10, decimals);
    const timestamp = Math.floor((tx.block_timestamp ?? Date.now()) / 1000);
    result.push({
      hash:        tx.transaction_id,
      from:        tx.from,
      to:          tx.to,
      value:       amount,
      timestamp,
      blockNumber: 0,
      tokenSymbol: tx.token_info?.symbol,
      isInbound:   tx.to === address,
    });
  }
  return result;
}

export async function getTronBalance(address: string): Promise<number> {
  const res = await fetch(`${TRONGRID_BASE}/v1/accounts/${address}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`TronGrid account fetch failed: ${res.status}`);
  const json = await res.json();
  const sun = (json?.data?.[0]?.balance ?? 0) as number;
  return sun / 1_000_000;
}

// ---------------------------------------------------------------------------
// TRX-specific AML pattern detection
// ---------------------------------------------------------------------------

export interface TrxSignals {
  rapidHops: boolean;
  highVolume: boolean;
}

/**
 * Detect TRX-specific AML patterns from transaction history.
 * rapidHops: ≥3 outbound transactions within 24 hours — consistent with layering.
 * highVolume: >10,000 TRX moved in a wallet < 30 days old.
 */
export function detectTrxPatterns(
  address: string,
  transactions: WalletTransaction[]
): TrxSignals {
  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const outbound = sorted.filter(tx => !tx.isInbound);

  // Rapid hops: ≥3 outbound within 24-hour window
  let rapidHops = false;
  const WINDOW = 24 * 3600;
  for (let i = 0; i < outbound.length; i++) {
    let count = 0;
    for (let j = i; j < outbound.length; j++) {
      if (outbound[j].timestamp - outbound[i].timestamp <= WINDOW) count++;
      else break;
    }
    if (count >= 3) { rapidHops = true; break; }
  }

  // High volume in young wallet — native TRX only (no tokenSymbol)
  // TRC-20 values are in token units (e.g. USDT) and must not be mixed with TRX
  const nativeVolume = transactions
    .filter(tx => !tx.tokenSymbol)
    .reduce((s, tx) => s + tx.value, 0);
  const earliestTs = sorted[0]?.timestamp ?? Date.now() / 1000;
  const walletAgeDays = Math.floor((Date.now() / 1000 - earliestTs) / 86400);
  const highVolume = nativeVolume > 10_000 && walletAgeDays < 30;

  return { rapidHops, highVolume };
}
