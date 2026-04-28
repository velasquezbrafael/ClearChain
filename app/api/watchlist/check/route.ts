/**
 * ClearChain — GET /api/watchlist/check  (Vercel Cron handler)
 *
 * Runs daily at 9am UTC. Checks every watchlist row across all users,
 * re-scores each address, and emails the owner if:
 *   - risk_level changed
 *   - new OFAC match detected
 *   - new mixer interaction detected
 *
 * Required env vars:
 *   CRON_SECRET                — Bearer secret set in Vercel dashboard (also add to vercel.json env)
 *   SUPABASE_SERVICE_ROLE_KEY  — Service role key to bypass RLS and read all rows
 *   RESEND_API_KEY             — For alert emails
 *
 * NOTE: Vercel hobby plan has a 10s function timeout. For large watchlists
 * (>3–5 addresses) this may timeout. Upgrade to Pro for 60s timeout, or
 * split into batches using a queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getTransactions, getTokenTransfers, getTopCounterparties } from '@/lib/etherscan';
import { getBitcoinTransactions, getBitcoinRawTxs, detectBtcPatterns } from '@/lib/bitcoin';
import { getTronTransactions, detectTrxPatterns } from '@/lib/tron';
import { checkAddress } from '@/lib/ofac';
import { computeRiskScore } from '@/lib/scoring';
import OFAC_TRX from '@/data/ofac-trx-addresses.json';
import type { WalletTransaction } from '@/types';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clear-chain-peach.vercel.app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeAndDedup(ethTxs: WalletTransaction[], tokenTxs: WalletTransaction[], address: string): WalletTransaction[] {
  const map = new Map<string, WalletTransaction>();
  for (const tx of ethTxs) map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() });
  for (const tx of tokenTxs) { if (!map.has(tx.hash)) map.set(tx.hash, { ...tx, isInbound: tx.to.toLowerCase() === address.toLowerCase() }); }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function scoreAddress(address: string, chain: string): Promise<{
  riskLevel: string;
  riskScore: number;
  ofacMatch: boolean;
  mixerInteraction: boolean;
}> {
  if (chain === 'BTC') {
    const [btcTxs, rawTxs] = await Promise.all([getBitcoinTransactions(address), getBitcoinRawTxs(address)]);
    const patterns = detectBtcPatterns(address, rawTxs);
    const btcSignals = [
      { name: 'ofac_match', weight: 40, triggered: false, score: 0, detail: 'BTC address not found on OFAC SDN list.' },
      { name: 'coinjoin_usage', weight: 25, triggered: patterns.coinjoin, score: patterns.coinjoin ? 25 : 0, detail: patterns.coinjoin ? 'CoinJoin transaction detected.' : 'No CoinJoin patterns detected.' },
      { name: 'peel_chain', weight: 20, triggered: patterns.peelChain, score: patterns.peelChain ? 20 : 0, detail: patterns.peelChain ? 'Peel chain detected.' : 'No peel chain pattern detected.' },
      { name: 'coinbase_recipient', weight: 0, triggered: patterns.coinbase, score: 0, detail: patterns.coinbase ? 'Address has received coinbase rewards.' : 'No coinbase inputs detected.' },
    ];
    const totalScore = Math.min(100, btcSignals.reduce((s, sig) => s + sig.score, 0));
    const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW';
    void btcTxs; // fetched but only rawTxs used for scoring
    return {
      riskLevel: level,
      riskScore: totalScore,
      ofacMatch: false,
      mixerInteraction: btcSignals.some(s => s.name === 'mixer_interaction' && s.triggered),
    };
  }

  if (chain === 'TRX') {
    const rawTrxTxs = await getTronTransactions(address);
    const trxTxs = rawTrxTxs.filter(tx => tx.from && tx.to);
    const TRX_SDN = new Map(Object.entries(OFAC_TRX as Record<string, string>));
    const trxOfacEntity = TRX_SDN.get(address);
    const trxOfacResult = trxOfacEntity
      ? { matched: true, matchedEntity: trxOfacEntity, confidence: 1.0 }
      : { matched: false, confidence: 0 };
    const patterns = detectTrxPatterns(address, trxTxs);
    const counterpartyHits = trxTxs.filter(tx => TRX_SDN.has(tx.from) || TRX_SDN.has(tx.to));
    const hasCounterpartyRisk = counterpartyHits.length > 0 && !trxOfacResult.matched;
    const trxSignals = [
      { name: 'ofac_match', weight: 40, triggered: trxOfacResult.matched, score: trxOfacResult.matched ? 40 : 0, detail: trxOfacResult.matched ? `OFAC match: ${trxOfacEntity}` : 'No OFAC match.' },
      { name: 'rapid_fund_movement', weight: 25, triggered: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk), score: patterns.rapidHops && (trxOfacResult.matched || hasCounterpartyRisk) ? 25 : 0, detail: 'Rapid fund movement check.' },
      { name: 'high_risk_counterparty', weight: 20, triggered: hasCounterpartyRisk, score: hasCounterpartyRisk ? 20 : 0, detail: hasCounterpartyRisk ? `${counterpartyHits.length} sanctioned counterparty tx(s).` : 'No sanctioned counterparties.' },
      { name: 'volume_anomaly', weight: 15, triggered: patterns.highVolume, score: patterns.highVolume ? 15 : 0, detail: patterns.highVolume ? 'High TRX volume detected.' : 'TRX volume normal.' },
    ];
    const totalScore = Math.min(100, trxSignals.reduce((s, sig) => s + sig.score, 0));
    const level = totalScore >= 75 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 25 ? 'MEDIUM' : 'LOW';
    return {
      riskLevel: level,
      riskScore: totalScore,
      ofacMatch: trxOfacResult.matched,
      mixerInteraction: trxSignals.some(s => s.name === 'mixer_interaction' && s.triggered),
    };
  }

  // ETH
  const [ethTxs, tokenTxs] = await Promise.all([
    getTransactions(address),
    getTokenTransfers(address),
  ]);
  const transactions = mergeAndDedup(ethTxs, tokenTxs, address);
  const ofacResult = await checkAddress(address);
  const riskScore = computeRiskScore({ transactions, ofacResult, communityFlags: 0, address });
  void getTopCounterparties(transactions, 10); // pre-warm but not needed for scoring
  return {
    riskLevel: riskScore.level,
    riskScore: riskScore.total,
    ofacMatch: ofacResult.matched,
    mixerInteraction: riskScore.signals['mixer_interaction']?.triggered ?? false,
  };
}

async function sendAlertEmail(
  to: string,
  address: string,
  chain: string,
  oldLevel: string | null,
  newLevel: string,
  newScore: number,
  triggers: string[]
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const levelColor = newLevel === 'CRITICAL' ? '#ff3b3b' : newLevel === 'HIGH' ? '#ff8c00' : newLevel === 'MEDIUM' ? '#ffd60a' : '#06b6d4';
  const analysisUrl = `${SITE_URL}/?address=${address}&chain=${chain}`;
  const triggerLines = triggers.map(t => `<li style="margin-bottom:4px;">${t}</li>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#00080f;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#00080f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#001824;border:1px solid rgba(6,182,212,0.08);border-radius:4px;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid rgba(6,182,212,0.08);">
              <span style="font-family:monospace;font-size:13px;letter-spacing:0.2em;color:#06b6d4;font-weight:700;">CLEARCHAIN</span>
              <span style="font-family:monospace;font-size:10px;letter-spacing:0.15em;color:#1e4d5c;margin-left:16px;">WATCHLIST ALERT</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <div style="font-family:monospace;font-size:10px;letter-spacing:0.15em;color:#1e4d5c;margin-bottom:12px;text-transform:uppercase;">Risk Change Detected</div>
              <div style="font-family:monospace;font-size:14px;color:#ecfeff;margin-bottom:4px;word-break:break-all;">${address}</div>
              <div style="font-family:monospace;font-size:10px;color:#1e4d5c;margin-bottom:24px;">${chain}</div>
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                ${oldLevel ? `<span style="font-family:monospace;font-size:11px;color:#1e4d5c;text-decoration:line-through;">${oldLevel}</span><span style="color:#1e4d5c;">→</span>` : ''}
                <span style="display:inline-block;padding:4px 12px;background:${levelColor}18;border:1px solid ${levelColor}40;border-radius:2px;font-family:monospace;font-size:11px;letter-spacing:0.1em;color:${levelColor};">${newLevel}</span>
                <span style="font-family:monospace;font-size:24px;font-weight:700;color:${levelColor};">${newScore}</span>
              </div>
              <div style="font-family:monospace;font-size:10px;letter-spacing:0.1em;color:#7ec8d8;margin-bottom:8px;">TRIGGERED BY</div>
              <ul style="font-family:monospace;font-size:12px;color:#7ec8d8;padding-left:16px;margin:0 0 24px;">${triggerLines}</ul>
              <a href="${analysisUrl}" style="display:inline-block;padding:12px 24px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);border-radius:2px;font-family:monospace;font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-decoration:none;">
                VIEW ANALYSIS →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(6,182,212,0.05);">
              <p style="font-family:monospace;font-size:10px;color:#1e4d5c;margin:0;line-height:1.6;">
                ClearChain · Crypto AML Intelligence · Watchlist Alert<br>
                You are receiving this because this address is on your ClearChain watchlist.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'ClearChain <onboarding@resend.dev>',
      to: [to],
      subject: `[ClearChain Alert] ${address.slice(0, 10)}... — risk level changed to ${newLevel}`,
      html,
    }),
  }).catch(() => {}); // fire-and-forget
}

// ---------------------------------------------------------------------------
// GET handler (invoked by Vercel cron)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Auth: verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role to bypass RLS and read all watchlist rows
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Fetch all watchlist rows
  const { data: rows, error: fetchError } = await adminClient
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const allRows = rows ?? [];
  let checked = 0;
  let alerted = 0;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];

    try {
      const result = await scoreAddress(row.address, row.chain);

      // Determine alert triggers
      const triggers: string[] = [];
      if (row.last_risk_level && row.last_risk_level !== result.riskLevel) {
        triggers.push(`Risk level changed: ${row.last_risk_level} → ${result.riskLevel}`);
      }
      const wasOfac = (row as Record<string, unknown>).last_ofac_match === true;
      if (!wasOfac && result.ofacMatch) {
        triggers.push('New OFAC match detected');
      }
      const wasMixer = (row as Record<string, unknown>).last_mixer_match === true;
      if (!wasMixer && result.mixerInteraction) {
        triggers.push('New mixer interaction detected');
      }

      // Send alert if any triggers fired
      if (triggers.length > 0) {
        // Get user email via admin API
        const { data: userData } = await adminClient.auth.admin.getUserById(row.user_id);
        const email = userData?.user?.email;
        if (email) {
          await sendAlertEmail(email, row.address, row.chain, row.last_risk_level, result.riskLevel, result.riskScore, triggers);
          alerted++;
        }
      }

      // Always update the row
      await adminClient
        .from('watchlist')
        .update({
          last_risk_level: result.riskLevel,
          last_risk_score: result.riskScore,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      checked++;
    } catch (err) {
      console.error(`[watchlist/check] Failed for ${row.address}:`, err);
    }

    // 300ms delay between addresses to avoid Alchemy rate limits
    if (i < allRows.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return NextResponse.json({ checked, alerted });
}
