'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Chain = 'ETH' | 'BTC' | 'TRX' | 'SOL'

interface WatchlistEntry {
  id: string
  address: string
  chain: string
  label: string | null
  last_risk_level: string | null
  last_risk_score: number | null
  last_checked_at: string | null
  added_at: string
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#22d3ee',
  MEDIUM: '#ffd60a',
  HIGH: '#ff8c00',
  CRITICAL: '#ff3b3b',
}

function truncateAddr(addr: string): string {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WatchlistPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userEmail, setUserEmail] = useState('')
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add form
  const [addAddress, setAddAddress] = useState('')
  const [addChain, setAddChain] = useState<Chain>('ETH')
  const [addLabel, setAddLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserEmail(user.email ?? '')

      const res = await fetch('/api/watchlist', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setEntries(json.watchlist ?? [])
      } else {
        setError('Failed to load watchlist.')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addAddress.trim() || adding) return
    setAdding(true)
    setAddError('')

    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ address: addAddress.trim(), chain: addChain, label: addLabel.trim() || null }),
    })
    const json = await res.json()

    if (!res.ok) {
      setAddError(res.status === 409 ? 'Already watching this address.' : json.error ?? 'Failed to add.')
      setAdding(false)
      return
    }

    setEntries(prev => [json.entry, ...prev])
    setAddAddress('')
    setAddLabel('')
    setAdding(false)
  }

  async function handleRemove(id: string) {
    // Optimistic removal
    setEntries(prev => prev.filter(e => e.id !== id))
    await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE', credentials: 'include' })
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    color: '#ecfeff',
    fontSize: 13,
    padding: '8px 0',
    outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)',
    width: '100%',
  }

  const cell: React.CSSProperties = {
    padding: '13px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: 12,
    fontFamily: 'var(--font-jetbrains-mono)',
    color: '#ecfeff',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: '#ecfeff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      <style>{`
        @media (max-width: 767px) {
          .dash-secondary-nav { display: none !important; }
          .dash-user-email    { display: none !important; }
          .dash-content       { padding: 32px 16px !important; }
          .dash-table-scroll  { overflow-x: auto !important; }
        }
      `}</style>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(6,182,212,0.08)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#22d3ee', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none', animation: 'glitch 6s steps(1) infinite' }}>CLEARCHAIN</a>
          <div className="dash-secondary-nav" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <a href="/" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
            <a href="/dashboard" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Dashboard</a>
            <a href="/dashboard/cases" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
            <a href="/dashboard/watchlist" style={{ fontSize: 12, color: '#06b6d4', textDecoration: 'none', letterSpacing: '0.08em' }}>Watchlist</a>
            <a href="/dashboard/bulk" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Bulk Screen</a>
            <a href="/dashboard/settings" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Settings</a>
            <a href="/intel" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span className="dash-user-email" style={{ fontSize: 12, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
          <button onClick={signOut} style={{ fontSize: 12, color: '#7ec8d8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>Sign out</button>
        </div>
      </nav>

      <div className="dash-content" style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 4, textTransform: 'uppercase' as const }}>Compliance</div>
            <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 24, fontWeight: 700, color: '#ecfeff', margin: 0 }}>Watchlist</h1>
          </div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#1e4d5c', letterSpacing: '0.1em' }}>
            Checked daily at 9am UTC · alerts via email
          </div>
        </div>

        {/* Add form */}
        <form onSubmit={handleAdd} style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 16, textTransform: 'uppercase' as const }}>Add Address</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto 200px auto', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 6 }}>ADDRESS *</label>
              <input
                type="text"
                value={addAddress}
                onChange={e => setAddAddress(e.target.value)}
                placeholder="0x... or bc1q... or T... or base58..."
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 6 }}>CHAIN</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['ETH', 'BTC', 'TRX', 'SOL'] as Chain[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAddChain(c)}
                    style={{
                      padding: '6px 10px',
                      background: addChain === c ? 'rgba(6,182,212,0.1)' : 'transparent',
                      border: `1px solid ${addChain === c ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 2,
                      color: addChain === c ? '#06b6d4' : '#7ec8d8',
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: 200 }}>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 6 }}>LABEL (OPTIONAL)</label>
              <input
                type="text"
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
                placeholder="e.g. Suspect #1"
                style={inputStyle}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={adding || !addAddress.trim()}
                style={{
                  padding: '10px 20px',
                  background: addAddress.trim() && !adding ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${addAddress.trim() && !adding ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.08)'}`,
                  borderRadius: 4,
                  color: addAddress.trim() && !adding ? '#06b6d4' : '#1e4d5c',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  cursor: addAddress.trim() && !adding ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}
              >
                {adding ? 'ADDING...' : '+ ADD'}
              </button>
            </div>
          </div>
          {addError && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)' }}>{addError}</div>
          )}
        </form>

        {/* Table */}
        {error ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#ff3b3b', fontSize: 13 }}>{error}</div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#1e4d5c', fontSize: 13 }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#1e4d5c', fontSize: 13, background: '#001824', borderRadius: 4, border: '1px solid rgba(6,182,212,0.08)' }}>
            No addresses on your watchlist. Add one above or save from any analysis.
          </div>
        ) : (
          <div className="dash-table-scroll" style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(6,182,212,0.08)' }}>
                  {['Label', 'Address', 'Chain', 'Risk Level', 'Score', 'Last Checked', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ ...cell, color: '#7ec8d8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.label ?? <span style={{ color: '#1e4d5c' }}>—</span>}
                    </td>
                    <td style={{ ...cell }}>
                      <a
                        href={`/?address=${entry.address}&chain=${entry.chain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#06b6d4', textDecoration: 'none' }}
                        title={entry.address}
                      >
                        {truncateAddr(entry.address)}
                      </a>
                    </td>
                    <td style={{ ...cell, color: '#7ec8d8' }}>{entry.chain}</td>
                    <td style={{ ...cell }}>
                      {entry.last_risk_level ? (
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: RISK_COLORS[entry.last_risk_level] ?? '#ecfeff', fontWeight: 700 }}>
                          {entry.last_risk_level}
                        </span>
                      ) : (
                        <span style={{ color: '#1e4d5c', fontSize: 10 }}>NOT CHECKED</span>
                      )}
                    </td>
                    <td style={{ ...cell, color: entry.last_risk_score !== null ? '#ecfeff' : '#1e4d5c' }}>
                      {entry.last_risk_score ?? '—'}
                    </td>
                    <td style={{ ...cell, color: '#7ec8d8' }}>
                      {fmtDate(entry.last_checked_at)}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <button
                        onClick={() => handleRemove(entry.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e4d5c', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em', padding: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff3b3b'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1e4d5c'; }}
                      >
                        Remove
                      </button>
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
