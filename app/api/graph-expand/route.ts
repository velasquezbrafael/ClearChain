/**
 * POST /api/graph-expand
 *
 * Lightweight counterparty expansion for investigation mode.
 * No Claude calls. 60-second module-level cache. Capped at 20 results.
 *
 * Body: { address: string }
 * Returns: { success, fromAddress, counterparties[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/etherscan';
import { checkAddress } from '@/lib/ofac';
import { KNOWN_LABELS } from '@/lib/labels';

export const dynamic = 'force-dynamic';

// Mirror of scoring.ts KNOWN_MIXER_ADDRESSES (not exported from that module)
const KNOWN_MIXER_ADDRESSES = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d',
  '0xd96f2b1c14db8458374d9aca76e26c3950113464',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730',
  '0x23773e65ed146a459667303b90d093cbf37d16cf',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b',
  '0x03893a7c7463ae47d46bc7f091665f1893656003',
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701',
  '0xca0840578f57fe71599d29375e16783424023357',
]);

const HIGH_RISK_ADDRESSES = new Set([
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47278a68122e1c1d25614bae3641af42',
  '0x53b6936513e738f44fb50d2b9476730c0d3170e2',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b',
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e',
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c',
]);

const expandCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;
const MAX_COUNTERPARTIES = 20;

interface EdgeEntry { from: string; to: string; value: number; count: number }
interface CounterpartyEntry { volume: number; txCount: number; edges: EdgeEntry[] }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = (body.address as string)?.toLowerCase?.();
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
    }

    const cached = expandCache.get(address);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const txs = await getTransactions(address);

    const cpMap = new Map<string, CounterpartyEntry>();

    for (const tx of txs) {
      const from = tx.from.toLowerCase();
      const to = tx.to?.toLowerCase() ?? '';
      if (!to || from === to) continue;

      const counterparty = from === address ? to : from === address ? to : (to === address ? from : null);
      const cp = from === address ? to : (to === address ? from : null);
      if (!cp || cp === address) continue;

      const existing = cpMap.get(cp);
      const edgeFrom = from;
      const edgeTo = to;

      if (existing) {
        existing.volume += tx.value;
        existing.txCount += 1;
        const edge = existing.edges.find(e => e.from === edgeFrom && e.to === edgeTo);
        if (edge) { edge.value += tx.value; edge.count += 1; }
        else existing.edges.push({ from: edgeFrom, to: edgeTo, value: tx.value, count: 1 });
      } else {
        cpMap.set(cp, {
          volume: tx.value,
          txCount: 1,
          edges: [{ from: edgeFrom, to: edgeTo, value: tx.value, count: 1 }],
        });
      }
    }

    const sorted = Array.from(cpMap.entries())
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, MAX_COUNTERPARTIES);

    const counterparties = await Promise.all(
      sorted.map(async ([addr, data]) => {
        const ofacResult = await checkAddress(addr);
        const lbl = KNOWN_LABELS[addr] ?? null;
        return {
          address: addr,
          volume: data.volume,
          txCount: data.txCount,
          isMixer: KNOWN_MIXER_ADDRESSES.has(addr),
          isHighRisk: HIGH_RISK_ADDRESSES.has(addr),
          isOfac: ofacResult.matched,
          label: lbl?.label ?? null,
          edges: data.edges,
        };
      }),
    );

    const result = { success: true, fromAddress: address, counterparties };
    expandCache.set(address, { data: result, ts: Date.now() });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[graph-expand]', err);
    return NextResponse.json({ success: false, error: 'Expansion failed' }, { status: 500 });
  }
}
