'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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

interface Case {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
  addr_count?: number
}

export default function CasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const supabase = createClient()

  const filteredCases = statusFilter === 'all' ? cases : cases.filter(c => c.status === statusFilter)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserEmail(user.email ?? '')

      const { data } = await supabase
        .from('cases')
        .select('*, case_addresses(count)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      setCases((data ?? []).map(c => ({
        ...c,
        addr_count: Array.isArray(c.case_addresses) ? (c.case_addresses[0]?.count ?? 0) : 0,
      })))
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: err } = await supabase.from('cases').insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      status: 'open',
    }).select().single()
    if (err) { setError(err.message); setCreating(false); return }
    setCases(prev => [{ ...data, addr_count: 0 }, ...prev])
    setTitle(''); setDescription(''); setShowForm(false); setCreating(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#f0f4ff',
    fontSize: 14, padding: '8px 0', outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <span style={{ fontSize: 15, letterSpacing: '0.15em', color: '#00ff88', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400 }}>CLEARCHAIN</span>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none' }}>← Back to Tool</a>
          <a href="/dashboard" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none' }}>Dashboard</a>
          <a href="/intel" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none' }}>Intel</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
          <button onClick={signOut} style={{ fontSize: 12, color: '#8892a4', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 4 }}>COMPLIANCE</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f0f4ff', margin: 0 }}>Cases</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8892a4', fontSize: 11, letterSpacing: '0.08em', padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              <option value="all">ALL</option>
              <option value="open">OPEN</option>
              <option value="under_review">UNDER REVIEW</option>
              <option value="escalated">ESCALATED</option>
              <option value="sar_filed">SAR FILED</option>
              <option value="closed">CLOSED</option>
            </select>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{ padding: '10px 20px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              + NEW CASE
            </button>
          </div>
        </div>

        {/* Inline create form */}
        {showForm && (
          <form onSubmit={handleCreate} style={{ background: '#080b14', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 8, padding: '24px', marginBottom: 24 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.15em', color: '#00ff88', marginBottom: 20 }}>NEW CASE</div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>TITLE *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} placeholder="e.g. Suspicious wallet cluster — March 2025" />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>DESCRIPTION</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="Optional context" />
            </div>
            {error && <div style={{ marginBottom: 16, color: '#ff3b3b', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" disabled={creating} style={{ padding: '10px 24px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 11, letterSpacing: '0.12em', cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}>
                {creating ? 'CREATING...' : 'CREATE'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8892a4', fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ color: '#3d4a5c', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading...</div>
        ) : filteredCases.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#3d4a5c', fontSize: 13, background: '#080b14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            {cases.length === 0 ? 'No cases yet. Click + NEW CASE to create one.' : 'No cases match this filter.'}
          </div>
        ) : (
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Title', 'Status', 'Addresses', 'Created', 'Last Updated', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCases.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#f0f4ff', fontWeight: 500 }}>{c.title}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: STATUS_COLORS[c.status] ?? '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {c.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{c.addr_count ?? 0}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtDate(c.created_at)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtDate(c.updated_at)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <a href={`/dashboard/cases/${c.id}`} style={{ fontSize: 11, color: '#00ff88', textDecoration: 'none', letterSpacing: '0.08em', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        Open →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
