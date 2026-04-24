import type { WalletTransaction } from '@/types';

const BLOCKSTREAM_BASE = 'https://blockstream.info/api';

interface MempoolVin {
  prevout?: {
    scriptpubkey_address?: string;
    value?: number;
  };
  is_coinbase?: boolean;
}

interface MempoolVout {
  scriptpubkey_address?: string;
  value: number;
}

interface MempoolTx {
  txid: string;
  vin: MempoolVin[];
  vout: MempoolVout[];
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  fee?: number;
}

interface MempoolAddressInfo {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
}

export async function getBitcoinBalance(address: string): Promise<number> {
  const res = await fetch(`${BLOCKSTREAM_BASE}/address/${address}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Blockstream.info address lookup failed: ${res.status}`);
  const info: MempoolAddressInfo = await res.json();
  const confirmed = info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
  return confirmed / 1e8; // satoshis → BTC
}

export async function getBitcoinTransactions(address: string): Promise<WalletTransaction[]> {
  const res = await fetch(`${BLOCKSTREAM_BASE}/address/${address}/txs`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    if (res.status === 400) throw new Error('Invalid Bitcoin address — not recognized by Blockstream API');
    if (res.status === 429) throw new Error('Rate limited by Blockstream API; please try again in a few seconds');
    throw new Error(`Blockstream.info tx fetch failed: ${res.status}`);
  }
  const txs: MempoolTx[] = await res.json();

  const addr = address.toLowerCase();
  const result: WalletTransaction[] = [];

  for (const tx of txs) {
    const timestamp = tx.status.block_time ?? Math.floor(Date.now() / 1000);
    const blockNumber = tx.status.block_height ?? 0;

    // Determine input addresses
    const inputAddrs = tx.vin
      .filter(v => !v.is_coinbase && v.prevout?.scriptpubkey_address)
      .map(v => v.prevout!.scriptpubkey_address!.toLowerCase());

    const isInbound = !inputAddrs.includes(addr);

    if (isInbound) {
      // Sum outputs to queried address
      const receivedSats = tx.vout
        .filter(o => o.scriptpubkey_address?.toLowerCase() === addr)
        .reduce((sum, o) => sum + o.value, 0);
      if (receivedSats === 0) continue;

      const fromAddr = inputAddrs[0] ?? 'coinbase';

      result.push({
        hash: tx.txid,
        from: fromAddr,
        to: address,
        value: receivedSats / 1e8,
        timestamp,
        blockNumber,
        isInbound: true,
      });
    } else {
      // Outbound: sum outputs NOT going back to self (change excluded)
      const destOutputs = tx.vout.filter(
        o => o.scriptpubkey_address && o.scriptpubkey_address.toLowerCase() !== addr
      );
      const sentSats = destOutputs.reduce((sum, o) => sum + o.value, 0);
      if (sentSats === 0) continue;

      const toAddr = destOutputs[0]?.scriptpubkey_address ?? 'unknown';

      result.push({
        hash: tx.txid,
        from: address,
        to: toAddr,
        value: sentSats / 1e8,
        timestamp,
        blockNumber,
        isInbound: false,
      });
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// BTC-specific AML pattern detection
// ---------------------------------------------------------------------------

export interface BtcSignals {
  coinjoin: boolean;
  peelChain: boolean;
  coinbase: boolean;
}

export function detectBtcPatterns(
  address: string,
  rawTxs: MempoolTx[]
): BtcSignals {
  let coinjoin = false;
  let peelChain = false;
  let coinbase = false;

  const addr = address.toLowerCase();

  // Coinbase recipient check
  coinbase = rawTxs.some(tx =>
    tx.vin.some(v => v.is_coinbase) &&
    tx.vout.some(o => o.scriptpubkey_address?.toLowerCase() === addr)
  );

  // CoinJoin: tx with many inputs AND many equal-value outputs (≥5 equal outputs)
  for (const tx of rawTxs) {
    const outValues = tx.vout.map(o => o.value).filter(v => v > 0);
    if (outValues.length < 5) continue;
    const sorted = [...outValues].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    const equalCount = outValues.filter(v => Math.abs(v - mid) < mid * 0.01).length;
    if (equalCount >= 5) { coinjoin = true; break; }
  }

  // Peel chain: ≥3 consecutive txs where address sends to exactly 2 outputs (dest + change back to self)
  const outboundTxs = rawTxs.filter(tx =>
    tx.vin.some(v => v.prevout?.scriptpubkey_address?.toLowerCase() === addr)
  );
  if (outboundTxs.length >= 3) {
    let consecutive = 0;
    for (const tx of outboundTxs) {
      const nonSelfOutputs = tx.vout.filter(
        o => o.scriptpubkey_address?.toLowerCase() !== addr
      );
      if (tx.vout.length === 2 && nonSelfOutputs.length === 1) {
        consecutive++;
        if (consecutive >= 3) { peelChain = true; break; }
      } else {
        consecutive = 0;
      }
    }
  }

  return { coinjoin, peelChain, coinbase };
}

export async function getBitcoinRawTxs(address: string): Promise<MempoolTx[]> {
  const res = await fetch(`${BLOCKSTREAM_BASE}/address/${address}/txs`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    if (res.status === 400) throw new Error('Invalid Bitcoin address — not recognized by Blockstream API');
    throw new Error(`Blockstream.info raw tx fetch failed: ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error('Blockstream.info returned invalid JSON response');
  }
}
