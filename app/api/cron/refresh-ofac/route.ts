/**
 * ClearChain — GET /api/cron/refresh-ofac  (Vercel Cron handler)
 *
 * Runs every 6 hours. Fetches the OFAC SDN XML, extracts all digital
 * currency addresses, and upserts them into the `ofac_addresses` Supabase
 * table. Addresses that were removed from the OFAC list are deleted.
 *
 * Required env vars:
 *   CRON_SECRET               — Bearer secret set in Vercel dashboard
 *   SUPABASE_SECRET_KEY — Admin key to bypass RLS
 *
 * Can also be triggered manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://clearchain.vercel.app/api/cron/refresh-ofac
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120; // seconds — Pro plan supports up to 300

const OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const BATCH_SIZE   = 500; // Supabase upsert batch size

// ── Chain detection from OFAC idType strings ─────────────────────────────────

function chainFromIdType(idType: string): string {
  const t = idType.toUpperCase();
  if (t.includes('ETH') || t.includes('ERC'))  return 'ETH';
  if (t.includes('XBT') || t.includes('BTC'))  return 'BTC';
  if (t.includes('SOL'))                        return 'SOL';
  if (t.includes('TRX') || t.includes('TRON')) return 'TRX';
  if (t.includes('LTC'))                        return 'LTC';
  if (t.includes('XMR'))                        return 'XMR';
  if (t.includes('USDT') || t.includes('USDC') || t.includes('DAI')) return 'ETH'; // stablecoins live on ETH
  return 'OTHER';
}

// ── Parse OFAC SDN XML ────────────────────────────────────────────────────────
// The XML structure for a crypto entry looks like:
//
//   <sdnEntry>
//     <uid>23459</uid>
//     <lastName>TORNADO CASH</lastName>
//     ...
//     <idList>
//       <id>
//         <uid>99887</uid>
//         <idType>Digital Currency Address - ETH</idType>
//         <idNumber>0x8589427373D6D84E98730D7795D8f6f8731FDA16</idNumber>
//       </id>
//     </idList>
//   </sdnEntry>

type OFACRow = { address: string; chain: string; entity_name: string; sdn_uid: string };

function parseSDNXml(xml: string): OFACRow[] {
  const rows: OFACRow[] = [];

  // Pull each <sdnEntry> block
  const entryRe = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/g;
  let em: RegExpExecArray | null;

  while ((em = entryRe.exec(xml)) !== null) {
    const entry = em[1];

    // Entity UID
    const uidMatch   = entry.match(/<uid>(\d+)<\/uid>/);
    const sdn_uid    = uidMatch ? uidMatch[1] : '';

    // Entity name — prefer <lastName>, fall back to <firstName>
    const nameMatch  = entry.match(/<lastName>(.*?)<\/lastName>/);
    if (!nameMatch) continue;
    const entity_name = nameMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();

    // Pull each <id> block and filter for digital currency addresses
    const idRe = /<id>([\s\S]*?)<\/id>/g;
    let idm: RegExpExecArray | null;

    while ((idm = idRe.exec(entry)) !== null) {
      const idBlock    = idm[1];
      const typeMatch  = idBlock.match(/<idType>(.*?)<\/idType>/);
      const numMatch   = idBlock.match(/<idNumber>(.*?)<\/idNumber>/);

      if (!typeMatch || !numMatch) continue;

      const idType = typeMatch[1];
      if (!idType.toLowerCase().includes('digital currency address')) continue;

      const address = numMatch[1].trim();
      if (!address) continue;

      const chain = chainFromIdType(idType);

      rows.push({ address, chain, entity_name, sdn_uid });
    }
  }

  return rows;
}

// ── Upsert helper — batched ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertBatch(
  supabase: SupabaseClient<any>,
  rows: OFACRow[],
  syncedAt: string,
): Promise<void> {
  const payload = rows.map(r => ({ ...r, synced_at: syncedAt }));
  const { error } = await supabase
    .from('ofac_addresses')
    .upsert(payload as never[], { onConflict: 'address,chain' });
  if (error) throw new Error(`Upsert failed: ${error.message}`);
}

// ── GET handler (invoked by Vercel cron) ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret
  const authHeader  = request.headers.get('authorization');
  const cronSecret  = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SECRET_KEY not configured' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: SupabaseClient<any> = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const syncedAt = new Date().toISOString();

  try {
    // ── 1. Fetch OFAC SDN XML ──────────────────────────────────────────────
    console.log('[refresh-ofac] Fetching OFAC SDN XML…');
    const res = await fetch(OFAC_SDN_URL, {
      headers: { 'User-Agent': 'ClearChain-OFAC-Sync/1.0' },
      // 90-second fetch timeout
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      throw new Error(`OFAC fetch failed: HTTP ${res.status}`);
    }

    const xml = await res.text();
    console.log(`[refresh-ofac] Fetched ${(xml.length / 1024).toFixed(0)} KB`);

    // ── 2. Parse digital currency addresses ───────────────────────────────
    const rows = parseSDNXml(xml);
    console.log(`[refresh-ofac] Parsed ${rows.length} digital currency addresses`);

    if (rows.length === 0) {
      throw new Error('Parsed 0 addresses — possible XML format change');
    }

    // ── 3. Upsert in batches ───────────────────────────────────────────────
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(supabase, rows.slice(i, i + BATCH_SIZE), syncedAt);
    }

    // ── 4. Delete stale entries (removed from OFAC list) ──────────────────
    const { count: removed } = await supabase
      .from('ofac_addresses')
      .delete({ count: 'exact' })
      .lt('synced_at', syncedAt);

    // ── 5. Tally by chain ──────────────────────────────────────────────────
    const byChain = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.chain] = (acc[r.chain] ?? 0) + 1;
      return acc;
    }, {});

    const duration_ms = Date.now() - start;

    // ── 6. Write sync log ─────────────────────────────────────────────────
    await supabase.from('ofac_sync_log').insert({
      ran_at:      syncedAt,
      duration_ms,
      eth_count:   byChain['ETH']   ?? 0,
      btc_count:   byChain['BTC']   ?? 0,
      sol_count:   byChain['SOL']   ?? 0,
      trx_count:   byChain['TRX']   ?? 0,
      other_count: rows.length - (byChain['ETH'] ?? 0) - (byChain['BTC'] ?? 0)
                   - (byChain['SOL'] ?? 0) - (byChain['TRX'] ?? 0),
      total_count: rows.length,
      removed:     removed ?? 0,
      status:      'ok',
    });

    console.log(`[refresh-ofac] Done in ${duration_ms}ms — ${rows.length} upserted, ${removed ?? 0} removed`);

    return NextResponse.json({
      ok:          true,
      total:       rows.length,
      removed:     removed ?? 0,
      by_chain:    byChain,
      duration_ms,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-ofac] Error:', message);

    // Swallow errors on the error log — don't let a failed log write mask the real error
    try {
      await supabase.from('ofac_sync_log').insert({
        ran_at:      syncedAt,
        duration_ms: Date.now() - start,
        status:      'error',
        error:       message,
      });
    } catch { /* ignore */ }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
