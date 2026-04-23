import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATUS_COLORS: Record<string, string> = {
  open: '#8892a4',
  under_review: '#ffd60a',
  escalated: '#ff8c00',
  sar_filed: '#ff3b3b',
  closed: '#3d4a5c',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    CRITICAL: '#ff3b3b', HIGH: '#ff8c00', MEDIUM: '#ffd60a', LOW: '#00ff88',
  }
  return (
    <span style={{
      fontSize: 10, letterSpacing: '0.1em', fontWeight: 700,
      color: colors[level] ?? '#8892a4',
      fontFamily: 'var(--font-jetbrains-mono)',
    }}>
      {level}
    </span>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: analyses }, { data: cases }] = await Promise.all([
    supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('cases')
      .select('*, case_addresses(count)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  const totalAnalyses = analyses?.length ?? 0
  const activeCases = cases?.filter(c => c.status !== 'closed').length ?? 0
  const criticalFindings = analyses?.filter(a => a.risk_level === 'CRITICAL').length ?? 0

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
          <span style={{ fontSize: 13, letterSpacing: '0.2em', color: '#00ff88', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700 }}>CLEARCHAIN</span>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
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
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 8, textTransform: 'uppercase' }}>Overview</div>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 32, fontWeight: 700, color: '#f0f4ff', margin: '0 0 40px', letterSpacing: '-0.01em' }}>Dashboard</h1>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 48 }}>
          {[
            { label: 'Total Analyses', value: totalAnalyses },
            { label: 'Active Cases', value: activeCases },
            { label: 'Critical Findings', value: criticalFindings },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '24px 28px' }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 40, fontWeight: 700, color: '#00ff88', lineHeight: 1, letterSpacing: '-0.02em' }}>{String(value)}</div>
            </div>
          ))}
        </div>

        {/* Recent Analyses */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#8892a4', marginBottom: 16, textTransform: 'uppercase' }}>Recent Analyses</div>
          {!analyses || analyses.length === 0 ? (
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
                  {analyses.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ ...cell, color: '#00ff88', maxWidth: 200 }}>{a.address}</td>
                      <td style={cell}>{a.chain}</td>
                      <td style={cell}>{a.risk_score}</td>
                      <td style={{ ...cell }}><RiskBadge level={a.risk_level} /></td>
                      <td style={{ ...cell, color: '#8892a4' }}>{fmtDate(a.created_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <a
                          href={`/?address=${a.address}`}
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
