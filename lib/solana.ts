/**
 * ClearChain — Solana (SOL) chain support
 *
 * Uses the Alchemy Solana Mainnet JSON-RPC endpoint. Same ALCHEMY_API_KEY
 * as Ethereum — Alchemy supports Solana natively.
 *
 * Address format: Base58-encoded 32-byte public key (32–44 chars).
 * No ENS equivalent — address resolution is skipped for SOL.
 */

import type { WalletTransaction } from '@/types';

const ALCHEMY_SOL = () =>
  `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

// Base58 alphabet — no 0, O, I, l
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SolTokenTransfer {
  mint:    string;
  amount:  number;
  symbol?: string;
}

// ---------------------------------------------------------------------------
// Internal RPC helper
// ---------------------------------------------------------------------------

async function solRpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(ALCHEMY_SOL(), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next:    { revalidate: 60 },
  });

  if (!res.ok) {
    const e = Object.assign(
      new Error(`Alchemy SOL RPC error: ${res.status}`),
      { statusCode: res.status }
    );
    throw e;
  }

  const json = await res.json() as { result?: T; error?: { message: string; code?: number } };
  if (json.error) {
    const e = Object.assign(
      new Error(`SOL RPC ${method}: ${json.error.message}`),
      { statusCode: 422 }
    );
    throw e;
  }
  return json.result as T;
}

// ---------------------------------------------------------------------------
// Concurrency util — chunk an array and run batches sequentially
// ---------------------------------------------------------------------------

async function batchSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}

// ---------------------------------------------------------------------------
// RPC response shapes
// ---------------------------------------------------------------------------

interface SignatureInfo {
  signature: string;
  slot:      number;
  err:       unknown;
  blockTime: number | null;
}

interface ParsedInstruction {
  program:   string;
  programId: string;
  parsed?: {
    type: string;
    info: {
      source?:      string;
      destination?: string;
      lamports?:    number;
    };
  };
}

interface ParsedTransaction {
  blockTime?: number | null;
  meta?: {
    fee:           number;
    preBalances:   number[];
    postBalances:  number[];
    err:           unknown;
  };
  transaction?: {
    signatures: string[];
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions: ParsedInstruction[];
    };
  };
}

interface TokenAccountsByOwner {
  value: Array<{
    pubkey: string;
    account: {
      data: {
        parsed?: {
          info?: {
            mint?: string;
            tokenAmount?: {
              uiAmount?: number | null;
            };
          };
        };
      };
    };
  }>;
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

export function validateSolAddress(address: string): boolean {
  return BASE58_RE.test(address);
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

export async function getSolBalance(address: string): Promise<number> {
  const result = await solRpc<{ value: number }>('getBalance', [address]);
  return (result?.value ?? 0) / 1e9;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function getSolTransactions(
  address: string,
  limit = 50,
): Promise<WalletTransaction[]> {
  // Step 0 — detect program accounts (e.g. DEX contracts like Raydium AMM).
  // Program accounts have executable: true and don't behave like wallets —
  // getSignaturesForAddress may error or return nothing useful for them.
  try {
    type AccountInfoResult = { value: { executable: boolean } | null };
    const info = await solRpc<AccountInfoResult>('getAccountInfo', [
      address,
      { encoding: 'base58' },
    ]);
    if (info?.value?.executable === true) {
      console.warn(`[solana] ${address} is a program account (executable) — returning 0 txns`);
      return [];
    }
  } catch {
    // If getAccountInfo fails, proceed anyway — better to attempt than to bail early
  }

  // Step 1 — get recent signatures
  // Program accounts (e.g. DEX contracts) may not support getSignaturesForAddress
  // on Alchemy — fail open with empty result rather than propagating the error.
  let sigs: SignatureInfo[];
  try {
    sigs = await solRpc<SignatureInfo[]>('getSignaturesForAddress', [
      address,
      { limit },
    ]);
  } catch {
    console.warn(`[solana] getSignaturesForAddress failed for ${address} — likely a program account`);
    return [];
  }

  if (!sigs || sigs.length === 0) return [];

  // Step 2 — fetch full transactions in batches of 10
  const txParams = { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 };
  let settled: PromiseSettledResult<ParsedTransaction>[];
  try {
    settled = await batchSettled(
      sigs,
      (sig) => solRpc<ParsedTransaction>('getTransaction', [sig.signature, txParams]),
      10,
    );
  } catch {
    // batchSettled itself shouldn't throw (settled results handle per-item rejection),
    // but if it does, return whatever was collected before the failure
    return [];
  }

  const result: WalletTransaction[] = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'rejected' || !r.value) continue;

    const tx   = r.value;
    const sig  = sigs[i].signature;
    const time = tx.blockTime ?? sigs[i].blockTime ?? 0;

    if (tx.meta?.err) continue; // skip failed transactions

    const msg = tx.transaction?.message;
    if (!msg) continue;

    // Resolve account keys (handle both string[] and {pubkey}[] formats)
    const accounts: string[] = (msg.accountKeys ?? []).map((k) =>
      typeof k === 'string' ? k : k.pubkey,
    );

    // Try jsonParsed System Program transfer instructions first
    let extracted = false;
    for (const ix of msg.instructions ?? []) {
      if (
        ix.parsed?.type === 'transfer' &&
        ix.program === 'system' &&
        ix.parsed.info.source &&
        ix.parsed.info.destination &&
        typeof ix.parsed.info.lamports === 'number' &&
        ix.parsed.info.lamports > 0
      ) {
        const amountSol = ix.parsed.info.lamports / 1e9;
        const from = ix.parsed.info.source;
        const to   = ix.parsed.info.destination;
        result.push({
          hash:        sig,
          from,
          to,
          value:       amountSol,
          timestamp:   time,
          blockNumber: 0,
          isInbound:   to === address,
        });
        extracted = true;
        break; // one primary transfer per tx for simplicity
      }
    }

    if (extracted) continue;

    // Fallback — balance delta analysis
    const pre  = tx.meta?.preBalances  ?? [];
    const post = tx.meta?.postBalances ?? [];
    const fee  = tx.meta?.fee          ?? 0;

    if (accounts.length < 2 || pre.length < 2 || post.length < 2) continue;

    // Find largest receiver (positive delta, not fee payer)
    let maxGain    = 0;
    let receiverIdx = -1;
    for (let j = 1; j < accounts.length; j++) {
      const delta = (post[j] ?? 0) - (pre[j] ?? 0);
      if (delta > maxGain) { maxGain = delta; receiverIdx = j; }
    }

    if (receiverIdx < 0 || maxGain < 1000) continue; // < 0.000001 SOL — skip dust

    const senderIdx = 0; // fee payer / primary sender
    const delta0    = (pre[senderIdx] ?? 0) - (post[senderIdx] ?? 0) - fee;
    if (delta0 <= 0) continue;

    const from = accounts[senderIdx];
    const to   = accounts[receiverIdx];
    if (!from || !to) continue;

    result.push({
      hash:        sig,
      from,
      to,
      value:       maxGain / 1e9,
      timestamp:   time,
      blockNumber: 0,
      isInbound:   to === address,
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// SPL Token transfers (token accounts owned by address)
// ---------------------------------------------------------------------------

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export async function getSPLTokenTransfers(address: string): Promise<SolTokenTransfer[]> {
  let raw: TokenAccountsByOwner;
  try {
    raw = await solRpc<TokenAccountsByOwner>('getTokenAccountsByOwner', [
      address,
      { programId: TOKEN_PROGRAM_ID },
      { encoding: 'jsonParsed' },
    ]);
  } catch {
    return [];
  }

  const transfers: SolTokenTransfer[] = [];
  for (const acct of raw?.value ?? []) {
    const info   = acct.account?.data?.parsed?.info;
    const mint   = info?.mint;
    const amount = info?.tokenAmount?.uiAmount ?? 0;
    if (!mint || amount === 0) continue;
    transfers.push({ mint, amount });
  }
  return transfers;
}

// ---------------------------------------------------------------------------
// AML pattern detection
// ---------------------------------------------------------------------------

export interface SolSignals {
  rapidMovement: boolean;
  volumeAnomaly: boolean;
}

/**
 * Detect Solana-specific AML patterns.
 *
 * rapidMovement: >50 SOL moved outbound within 48 hours of receiving those funds.
 * volumeAnomaly: wallet < 60 days old with total volume > 500 SOL, OR
 *                > 20 unique transactions in any 7-day rolling window.
 */
export function detectSolPatterns(
  address: string,
  transactions: WalletTransaction[],
): SolSignals {
  const sorted   = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const inbound  = sorted.filter(tx =>  tx.isInbound);
  const outbound = sorted.filter(tx => !tx.isInbound);

  // Rapid movement: >50 SOL moved outbound within 48h of receipt
  const WINDOW_48H = 48 * 3600;
  let rapidMovement = false;
  for (const rx of inbound) {
    const outInWindow = outbound
      .filter(tx => tx.timestamp >= rx.timestamp && tx.timestamp <= rx.timestamp + WINDOW_48H)
      .reduce((s, tx) => s + tx.value, 0);
    if (outInWindow > 50) { rapidMovement = true; break; }
  }

  // Volume anomaly
  const totalVolume    = transactions.reduce((s, tx) => s + tx.value, 0);
  const earliestTs     = sorted[0]?.timestamp ?? Date.now() / 1000;
  const walletAgeDays  = Math.floor((Date.now() / 1000 - earliestTs) / 86400);
  const youngHighVol   = totalVolume > 500 && walletAgeDays < 60;

  // High tx frequency: > 20 txns in any 7-day window
  const WINDOW_7D = 7 * 86400;
  let highFrequency = false;
  for (let i = 0; i < sorted.length; i++) {
    let count = 0;
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j].timestamp - sorted[i].timestamp <= WINDOW_7D) count++;
      else break;
    }
    if (count > 20) { highFrequency = true; break; }
  }

  const volumeAnomaly = youngHighVol || highFrequency;

  // Unused parameter guard
  void address;

  return { rapidMovement, volumeAnomaly };
}
