/**
 * ClearChain — Public Intelligence Feed (/intel)
 *
 * No auth required. Shows aggregate stats from the analyses table.
 *
 * REQUIRED Supabase policy (run once in dashboard if reads return empty):
 *   create policy "Public can read aggregate intel" on analyses
 *     for select using (true);
 *
 * This exposes address + chain + risk_level + analyzed_at only.
 * No user_id, narrative, or SAR draft is fetched or displayed.
 */

import { createClient } from '@/lib/supabase/server';

const RISK_COLORS: Record<string, string> = {
  LOW: '#00ff88',
  MEDIUM: '#ffd60a',
  HIGH: '#ff8c00',
  CRITICAL: '#ff3b3b',
};

const CHAIN_COLORS: Record<string, string> = {
  ETH: '#00ff88',
  BTC: '#f97316',
  TRX: '#ff4500',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function truncate(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

export default async function IntelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries — never fetches user_id, narrative, or SAR content
  const [{ data: todayRaw }, { data: allRaw }, { data: recentFlags }] = await Promise.all([
    supabase
      .from('analyses')
      .select('address, chain, risk_level, analyzed_at')
      .gte('analyzed_at', yesterday),
    supabase
      .from('analyses')
      .select('chain, risk_level'),
    supabase
      .from('analyses')
      .select('address, chain, analyzed_at, signals')
      .gte('analyzed_at', yesterday)
      .in('risk_level', ['HIGH', 'CRITICAL'])
      .order('analyzed_at', { ascending: false })
      .limit(20),
  ]);

  const today = todayRaw ?? [];
  const all = allRaw ?? [];

  // Deduplicate recentFlags by address — keep the most recent analyzed_at per address
  const rawFlags = recentFlags ?? [];
  const flagsByAddr = new Map<string, typeof rawFlags[number]>();
  for (const r of rawFlags) {
    const existing = flagsByAddr.get(r.address);
    if (!existing || r.analyzed_at > existing.analyzed_at) {
      flagsByAddr.set(r.address, r);
    }
  }
  const flags = Array.from(flagsByAddr.values()).sort((a, b) => b.analyzed_at.localeCompare(a.analyzed_at));

  // Today's stats
  const screenedToday  = today.length;
  const ofacToday      = flags.filter(r => {
    const raw = r.signals as Array<{ name: string; triggered: boolean }> | Record<string, { triggered: boolean }> | null;
    if (!raw) return false;
    if (Array.isArray(raw)) return raw.some(s => s.name === 'ofac_match' && s.triggered);
    return raw['ofac_match']?.triggered ?? false;
  }).length;
  const highRiskToday  = today.filter(r => r.risk_level === 'HIGH' || r.risk_level === 'CRITICAL').length;
  const cleanToday     = today.filter(r => r.risk_level === 'LOW').length;

  // Chain breakdown (all time)
  const chainTotals = { ETH: 0, BTC: 0, TRX: 0, other: 0 };
  for (const r of all) {
    if (r.chain === 'ETH') chainTotals.ETH++;
    else if (r.chain === 'BTC') chainTotals.BTC++;
    else if (r.chain === 'TRX') chainTotals.TRX++;
    else chainTotals.other++;
  }
  const chainTotal = all.length || 1;

  // All-time risk distribution
  const riskDist = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const r of all) {
    if (r.risk_level in riskDist) riskDist[r.risk_level as keyof typeof riskDist]++;
  }
  const riskTotal = all.length || 1;

  const stat = (label: string, value: number | string, accent?: string) => (
    <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '24px 28px' }}>
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: accent ?? '#f0f4ff', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );

  const cell: React.CSSProperties = {
    padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: 12, color: '#f0f4ff', fontFamily: 'var(--font-jetbrains-mono)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#f0f4ff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/api-docs" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>API Docs</a>
        </div>
        {user ? (
          <a href="/dashboard" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none' }}>DASHBOARD →</a>
        ) : (
          <a href="/auth/login" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#8892a4', textDecoration: 'none' }}>SIGN IN →</a>
        )}
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px 96px' }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 8, textTransform: 'uppercase' }}>Public · Live</div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 32, fontWeight: 700, color: '#f0f4ff', margin: '0 0 12px', letterSpacing: '-0.01em' }}>Live Intelligence</h1>
          <p style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif', fontSize: 14, color: '#8892a4', margin: 0, lineHeight: 1.6 }}>
            Real-time aggregate data from ClearChain analyses. Updated continuously.
          </p>
        </div>

        {/* Today's stats */}
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Last 24 Hours</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
          {stat('Addresses Screened', screenedToday, '#f0f4ff')}
          {stat('OFAC Matches Found', ofacToday, ofacToday > 0 ? '#ff3b3b' : '#f0f4ff')}
          {stat('High Risk Wallets', highRiskToday, highRiskToday > 0 ? '#ff8c00' : '#f0f4ff')}
          {stat('Clean Wallets', cleanToday, '#00ff88')}
        </div>

        {/* Chain breakdown */}
        <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px 24px', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Chain Breakdown (All Time)</div>
          {(['ETH', 'BTC', 'TRX'] as const).map(c => {
            const count = chainTotals[c];
            const pct = Math.round((count / chainTotal) * 100);
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: CHAIN_COLORS[c], width: 32, flexShrink: 0 }}>{c}</span>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: CHAIN_COLORS[c], borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#8892a4', width: 48, textAlign: 'right', flexShrink: 0 }}>{count > 0 ? `${pct}%` : '—'}</span>
              </div>
            );
          })}
        </div>

        {/* Recent high-risk flags */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Recent High-Risk Detections (Last 24h)</div>
          {flags.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#3d4a5c', fontSize: 13, background: '#080b14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              No high-risk wallets detected in the last 24 hours.
            </div>
          ) : (
            <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Address', 'Chain', 'OFAC', 'Timestamp'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', fontWeight: 600 }}>{h}</th>
                    ))}
                    <th style={{ padding: '10px 16px' }} />
                  </tr>
                </thead>
                <tbody>
                  {flags.map((r, i) => {
                    const rawSigs = r.signals as Array<{ name: string; triggered: boolean }> | Record<string, { triggered: boolean }> | null;
                    const ofacHit = rawSigs
                      ? Array.isArray(rawSigs)
                        ? rawSigs.some(s => s.name === 'ofac_match' && s.triggered)
                        : rawSigs['ofac_match']?.triggered ?? false
                      : false;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ ...cell, color: '#f0f4ff' }} title={r.address}>{truncate(r.address)}</td>
                        <td style={{ ...cell, color: CHAIN_COLORS[r.chain] ?? '#8892a4' }}>{r.chain}</td>
                        <td style={{ ...cell }}>
                          {ofacHit ? (
                            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#ff3b3b', border: '1px solid rgba(255,59,59,0.3)', padding: '2px 6px', borderRadius: 2 }}>
                              SDN MATCH
                            </span>
                          ) : (
                            <span style={{ color: '#3d4a5c', fontSize: 10 }}>—</span>
                          )}
                        </td>
                        <td style={{ ...cell, color: '#8892a4' }}>{fmtTime(r.analyzed_at)}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <a href={`/?address=${r.address}`} style={{ fontSize: 11, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                            View →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* All-time risk distribution */}
        {all.length > 0 && (
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px 24px', marginBottom: 40 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Risk Distribution (All Time · {all.length} analyses)</div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14, background: 'rgba(255,255,255,0.04)' }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(level => {
                const pct = (riskDist[level] / riskTotal) * 100;
                if (pct === 0) return null;
                return <div key={level} style={{ width: `${pct}%`, background: RISK_COLORS[level], transition: 'width 0.3s' }} />;
              })}
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(level => (
                <span key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: riskDist[level] > 0 ? '#8892a4' : '#3d4a5c' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: RISK_COLORS[level], flexShrink: 0 }} />
                  {level}
                  <span style={{ color: RISK_COLORS[level], fontWeight: 700 }}>{riskDist[level]}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 24, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em', lineHeight: 1.7 }}>
          Data reflects all analyses run on ClearChain. Addresses are user-submitted. OFAC designations sourced from the U.S. Treasury SDN list.{' '}
          <a href="/" style={{ color: '#8892a4', textDecoration: 'none' }}>Run an analysis →</a>
        </div>
      </div>
    </div>
  );
}
