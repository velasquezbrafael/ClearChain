import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATUS_COLORS: Record<string, string> = {
  open: '#8892a4',
  under_review: '#ffd60a',
  escalated: '#ff8c00',
  sar_filed: '#ff3b3b',
  closed: '#3d4a5c',
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#00ff88', MEDIUM: '#ffd60a', HIGH: '#ff8c00', CRITICAL: '#ff3b3b',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span style={{
      fontSize: 10, letterSpacing: '0.1em', fontWeight: 700,
      color: RISK_COLORS[level] ?? '#8892a4',
      fontFamily: 'var(--font-jetbrains-mono)',
    }}>
      {level}
    </span>
  )
}

const PAGE_SIZE = 10

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: recentRaw, count: recentCount }, { data: allSummary }, { data: cases }] = await Promise.all([
    // Paginated recent analyses
    supabase
      .from('analyses')
      .select('id, address, chain, risk_score, risk_level, analyzed_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('analyzed_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    // All rows — only lightweight fields — for stats + distribution
    supabase
      .from('analyses')
      .select('address, chain, risk_level')
      .eq('user_id', user.id),
    supabase
      .from('cases')
      .select('*, case_addresses(count)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  const deduped = recentRaw ?? []
  const totalPages = Math.max(1, Math.ceil((recentCount ?? 0) / PAGE_SIZE))

  // ── Stats from allSummary ────────────────────────────────────────────────
  const summary = allSummary ?? []

  // Unique addresses (across all time)
  const uniqueKeys = new Set(summary.map(a => `${a.address}-${a.chain}`))
  const uniqueAddressCount = uniqueKeys.size

  const ethCount      = summary.filter(a => a.chain === 'ETH').length
  const btcCount      = summary.filter(a => a.chain === 'BTC').length
  const trxCount      = summary.filter(a => a.chain === 'TRX').length
  const highRiskCount = summary.filter(a => a.risk_level === 'HIGH' || a.risk_level === 'CRITICAL').length

  // Risk distribution
  const riskDist = {
    LOW:      summary.filter(a => a.risk_level === 'LOW').length,
    MEDIUM:   summary.filter(a => a.risk_level === 'MEDIUM').length,
    HIGH:     summary.filter(a => a.risk_level === 'HIGH').length,
    CRITICAL: summary.filter(a => a.risk_level === 'CRITICAL').length,
  }
  const riskTotal = summary.length

  // ── Cases stats ──────────────────────────────────────────────────────────
  const lastAnalysis = recentRaw && recentRaw.length > 0 ? recentRaw[0] : null
  const lastAnalysisAgo = lastAnalysis
    ? (() => {
        const diff = Date.now() - new Date(lastAnalysis.analyzed_at).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        return `${Math.floor(hrs / 24)}d ago`
      })()
    : null

  const activeCases = cases?.filter(c => c.status !== 'closed') ?? []
  const activeCaseCount = activeCases.length
  const oldestOpen = activeCases.length > 0
    ? activeCases.reduce((oldest, c) =>
        new Date(c.created_at) < new Date(oldest.created_at) ? c : oldest
      )
    : null
  const oldestOpenDays = oldestOpen ? daysAgo(oldestOpen.created_at) : null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = (user.email ?? '').split('@')[0]

  async function signOut() {
    'use server'
    const sb = await createClient()
    await sb.auth.signOut()
    redirect('/auth/login')
  }

  const cell: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: 13,
    color: '#f0f4ff',
    fontFamily: 'var(--font-jetbrains-mono)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 180,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#f0f4ff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
          <a href="/dashboard/bulk" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Bulk Screen</a>
          <a href="/dashboard/settings" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Settings</a>
          <a href="/intel" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{user.email}</span>
          <form action={signOut}>
            <button type="submit" style={{ fontSize: 12, color: '#8892a4', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>

        {/* Greeting + Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40, flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 8, textTransform: 'uppercase' }}>Overview</div>
            <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 32, fontWeight: 700, color: '#f0f4ff', margin: 0, letterSpacing: '-0.01em' }}>
              {greeting},{' '}
              <span style={{ color: '#00ff88' }}>{displayName}</span>
              <span style={{ fontSize: 32 }}>.</span>
            </h1>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <a
              href="/"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: 'rgba(0,255,136,0.08)',
                border: '1px solid rgba(0,255,136,0.25)',
                borderRadius: 4,
                color: '#00ff88',
                fontSize: 11,
                letterSpacing: '0.1em',
                fontFamily: 'var(--font-jetbrains-mono)',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#00ff88" strokeWidth="1.2"/>
                <line x1="6" y1="3" x2="6" y2="9" stroke="#00ff88" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="3" y1="6" x2="9" y2="6" stroke="#00ff88" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              ANALYZE WALLET
            </a>
            <a
              href="/dashboard/cases"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: '#080b14',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: '#8892a4',
                fontSize: 11,
                letterSpacing: '0.1em',
                fontFamily: 'var(--font-jetbrains-mono)',
                textDecoration: 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="#8892a4" strokeWidth="1.2"/>
                <line x1="4" y1="4.5" x2="8" y2="4.5" stroke="#8892a4" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="4" y1="6.5" x2="8" y2="6.5" stroke="#8892a4" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="4" y1="8.5" x2="6" y2="8.5" stroke="#8892a4" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              NEW CASE
            </a>
            <a
              href="/intel"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px',
                background: '#080b14',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: '#8892a4',
                fontSize: 11,
                letterSpacing: '0.1em',
                fontFamily: 'var(--font-jetbrains-mono)',
                textDecoration: 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="#8892a4" strokeWidth="1.2"/>
                <line x1="6" y1="4" x2="6" y2="6.5" stroke="#8892a4" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="6" cy="8" r="0.7" fill="#8892a4"/>
              </svg>
              INTEL FEED
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {/* Card 1: Unique addresses */}
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '24px 28px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>Addresses Analyzed</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: '#00ff88', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 10 }}>{uniqueAddressCount}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>
              {ethCount > 0 && <span style={{ color: '#4b9e6e' }}>{ethCount} ETH</span>}
              {ethCount > 0 && btcCount > 0 && <span style={{ margin: '0 6px' }}>·</span>}
              {btcCount > 0 && <span style={{ color: '#7a6030' }}>{btcCount} BTC</span>}
              {(ethCount > 0 || btcCount > 0) && trxCount > 0 && <span style={{ margin: '0 6px' }}>·</span>}
              {trxCount > 0 && <span style={{ color: '#993d2a' }}>{trxCount} TRX</span>}
              {ethCount === 0 && btcCount === 0 && trxCount === 0 && '—'}
            </div>
          </div>

          {/* Card 2: Active cases */}
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '24px 28px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>Active Cases</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: '#00ff88', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 10 }}>{activeCaseCount}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>
              {oldestOpenDays !== null
                ? <>oldest open: <span style={{ color: '#8892a4' }}>{oldestOpenDays}d ago</span></>
                : '—'
              }
            </div>
          </div>

          {/* Card 3: High risk findings (HIGH + CRITICAL) */}
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '24px 28px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>High Risk Findings</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: highRiskCount > 0 ? '#ff8c00' : '#00ff88', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 10 }}>{highRiskCount}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>
              HIGH + CRITICAL combined
            </div>
          </div>

          {/* Card 4: Last Analysis */}
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '24px 28px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>Last Analysis</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: '#00ff88', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 10 }}>
              {lastAnalysisAgo ?? '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>
              {lastAnalysis ? `${lastAnalysis.address.slice(0, 8)}...` : '—'}
            </div>
          </div>
        </div>

        {/* Risk distribution bar */}
        {riskTotal > 0 && (
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '18px 24px', marginBottom: 40 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>Risk Distribution</div>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12, background: 'rgba(255,255,255,0.04)' }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(level => {
                const pct = (riskDist[level] / riskTotal) * 100
                if (pct === 0) return null
                return (
                  <div
                    key={level}
                    style={{
                      width: `${pct}%`,
                      background: RISK_COLORS[level],
                      transition: 'width 0.3s',
                    }}
                  />
                )
              })}
            </div>
            {/* Legend counts */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(level => (
                <span key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: riskDist[level] > 0 ? '#8892a4' : '#3d4a5c' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: riskDist[level] > 0 ? RISK_COLORS[level] : '#1e2430', flexShrink: 0 }} />
                  {level}
                  <span style={{ color: riskDist[level] > 0 ? RISK_COLORS[level] : '#3d4a5c', fontWeight: 700 }}>{riskDist[level]}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Analyses */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Recent Analyses</div>
          {deduped.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#3d4a5c', fontSize: 13, background: '#080b14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              No analyses yet.{' '}
              <a href="/" style={{ color: '#00ff88', textDecoration: 'none' }}>Run your first analysis →</a>
            </div>
          ) : (
            <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Address', 'Chain', 'Score', 'Level', 'Date'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', fontWeight: 600 }}>{h}</th>
                    ))}
                    <th style={{ padding: '10px 16px' }} />
                  </tr>
                </thead>
                <tbody>
                  {deduped.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ ...cell, color: '#00ff88', maxWidth: 200 }}>{a.address}</td>
                      <td style={cell}>{a.chain}</td>
                      <td style={cell}>{a.risk_score}</td>
                      <td style={cell}><RiskBadge level={a.risk_level} /></td>
                      <td style={{ ...cell, color: '#8892a4' }}>{fmtDate(a.analyzed_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <a
                          href={`/?address=${a.address}&chain=${a.chain}`}
                          style={{ fontSize: 11, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}
                        >
                          View →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>
                PAGE {page} OF {totalPages} · {recentCount ?? 0} TOTAL
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {page > 1 && (
                  <a
                    href={`/dashboard?page=${page - 1}`}
                    style={{ padding: '6px 14px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: '#8892a4', textDecoration: 'none', background: '#080b14' }}
                  >
                    ← PREV
                  </a>
                )}
                {page < totalPages && (
                  <a
                    href={`/dashboard?page=${page + 1}`}
                    style={{ padding: '6px 14px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: '#8892a4', textDecoration: 'none', background: '#080b14' }}
                  >
                    NEXT →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Active Cases */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#8892a4', textTransform: 'uppercase' }}>Active Cases</div>
            <a href="/dashboard/cases" style={{ fontSize: 11, color: '#00ff88', textDecoration: 'none', letterSpacing: '0.08em' }}>+ New Case →</a>
          </div>
          {!cases || cases.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#3d4a5c', fontSize: 13, background: '#080b14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              No cases yet.{' '}
              <a href="/dashboard/cases" style={{ color: '#00ff88', textDecoration: 'none' }}>Create your first case →</a>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {cases.map(c => {
                const addrCount = Array.isArray(c.case_addresses) ? c.case_addresses[0]?.count ?? 0 : 0
                return (
                  <a key={c.id} href={`/dashboard/cases/${c.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px', transition: 'border-color 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f4ff', lineHeight: 1.3 }}>{c.title}</div>
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: STATUS_COLORS[c.status] ?? '#8892a4', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                          {c.status.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {addrCount} address{addrCount !== 1 ? 'es' : ''} · {fmtDate(c.updated_at)}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
