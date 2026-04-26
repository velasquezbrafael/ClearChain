'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import CaseNetworkGraph from '@/components/CaseNetworkGraph'

const STATUS_OPTIONS = ['open', 'under_review', 'escalated', 'sar_filed', 'closed'] as const
const STATUS_COLORS: Record<string, string> = {
  open: '#7ec8d8', under_review: '#ffd60a', escalated: '#ff8c00', sar_filed: '#ff3b3b', closed: '#1e4d5c',
}
const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#ff3b3b', HIGH: '#ff8c00', MEDIUM: '#ffd60a', LOW: '#22d3ee',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface CaseRow { id: string; title: string; description: string | null; status: string; created_at: string; updated_at: string; user_id: string }
interface AddressRow { id: string; address: string; chain: string; risk_score: number; risk_level: string; created_at: string; analysis_id: string | null }
interface NoteRow { id: string; content: string; author_name: string | null; created_at: string }

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [caseData, setCaseData] = useState<CaseRow | null>(null)
  const [addresses, setAddresses] = useState<AddressRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [addingAddress, setAddingAddress] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserEmail(user.email ?? '')

      const [{ data: c }, { data: addrs }, { data: ns }] = await Promise.all([
        supabase.from('cases').select('*').eq('id', id).single(),
        supabase.from('case_addresses').select('*, analyses(risk_score, risk_level, created_at)').eq('case_id', id).order('created_at', { ascending: false }),
        supabase.from('case_notes').select('*').eq('case_id', id).order('created_at', { ascending: true }),
      ])

      if (!c) { router.push('/dashboard/cases'); return }
      setCaseData(c)
      setStatus(c.status)
      setAddresses((addrs ?? []).map(a => ({
        id: a.id,
        address: a.address,
        chain: a.chain,
        risk_score: (a.analyses as { risk_score: number } | null)?.risk_score ?? 0,
        risk_level: (a.analyses as { risk_level: string } | null)?.risk_level ?? '—',
        created_at: a.created_at,
        analysis_id: a.analysis_id,
      })))
      setNotes(ns ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  async function updateStatus(newStatus: string) {
    setStatus(newStatus)
    await fetch(`/api/cases/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault()
    const addr = newAddress.trim()
    if (!addr) return
    setAddingAddress(true)
    setAddressError('')

    try {
      // Run analysis
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Analysis failed')

      const resolvedAddr = json.resolvedAddress ?? addr
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Save analysis
      const { data: analysisRow } = await supabase.from('analyses').insert({
        user_id: user.id,
        address: resolvedAddr,
        chain: 'ETH',
        risk_score: json.data.riskScore.total,
        risk_level: json.data.riskScore.level,
        signals: json.data.riskScore.signals,
        typologies: json.data.typologies,
        narrative: json.narrative,
        sar_draft: json.sarDraft,
      }).select().single()

      // Create case_addresses record
      const { data: caRow } = await supabase.from('case_addresses').insert({
        case_id: id,
        address: resolvedAddr,
        chain: 'ETH',
        analysis_id: analysisRow?.id ?? null,
      }).select().single()

      await supabase.from('cases').update({ updated_at: new Date().toISOString() }).eq('id', id)

      setAddresses(prev => [{
        id: caRow?.id ?? crypto.randomUUID(),
        address: resolvedAddr,
        chain: 'ETH',
        risk_score: json.data.riskScore.total,
        risk_level: json.data.riskScore.level,
        created_at: new Date().toISOString(),
        analysis_id: analysisRow?.id ?? null,
      }, ...prev])
      setNewAddress('')
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : 'Failed to add address')
    }
    setAddingAddress(false)
  }

  async function handleRemoveAddress(caId: string) {
    await supabase.from('case_addresses').delete().eq('id', caId)
    setAddresses(prev => prev.filter(a => a.id !== caId))
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteContent.trim()) return
    setAddingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('case_notes').insert({
      case_id: id,
      user_id: user.id,
      author_name: user.user_metadata?.name ?? user.email ?? 'Analyst',
      content: noteContent.trim(),
    }).select().single()
    if (data) setNotes(prev => [...prev, data])
    setNoteContent('')
    setAddingNote(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this case? This cannot be undone.')) return
    setDeleting(true)
    await supabase.from('case_addresses').delete().eq('case_id', id)
    await supabase.from('case_notes').delete().eq('case_id', id)
    await supabase.from('cases').delete().eq('id', id)
    router.push('/dashboard/cases')
  }

  function handleDownloadReport() {
    window.open(`/api/cases/${id}/report`, '_blank')
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#ecfeff',
    fontSize: 13, padding: '8px 0', outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)', width: '100%',
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#00080f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e4d5c', fontSize: 13 }}>
      Loading...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: '#ecfeff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(6,182,212,0.08)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#ecfeff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#06b6d4', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
          <a href="/dashboard/watchlist" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Watchlist</a>
          <a href="/dashboard/bulk" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Bulk Screen</a>
          <a href="/dashboard/settings" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Settings</a>
          <a href="/intel" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
          <button onClick={signOut} style={{ fontSize: 12, color: '#7ec8d8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 4 }}>CASE</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px' }}>{caseData?.title}</h1>
            <div style={{ fontSize: 12, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)' }}>
              Created {fmtDate(caseData?.created_at ?? '')} · {addresses.length} address{addresses.length !== 1 ? 'es' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <select
              value={status}
              onChange={e => updateStatus(e.target.value)}
              style={{ background: '#001824', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: STATUS_COLORS[status] ?? '#7ec8d8', fontSize: 11, letterSpacing: '0.1em', padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.toUpperCase().replace('_', ' ')}</option>)}
            </select>
            <button
              onClick={handleDownloadReport}
              style={{ padding: '8px 16px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap' }}
            >
              Download Report
            </button>
            <button onClick={handleDelete} disabled={deleting} style={{ padding: '8px 14px', background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 4, color: '#ff3b3b', fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
              Delete
            </button>
          </div>
        </div>

        {/* Addresses */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 16 }}>ADDRESSES IN THIS CASE</div>

          {addresses.length > 0 && (
            <div style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(6,182,212,0.08)' }}>
                    {['Address', 'Chain', 'Risk Score', 'Level', 'Analyzed', '', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {addresses.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-jetbrains-mono)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.address}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)' }}>{a.chain}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#ecfeff', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 600 }}>{a.risk_score}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 10, letterSpacing: '0.1em', color: RISK_COLORS[a.risk_level] ?? '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700 }}>{a.risk_level}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtDate(a.created_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <a href={`/?address=${a.address}`} style={{ fontSize: 11, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>View →</a>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button onClick={() => handleRemoveAddress(a.id)} style={{ fontSize: 11, color: '#ff3b3b', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add address form */}
          <form onSubmit={handleAddAddress} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 8 }}>+ ADD ADDRESS</label>
              <input
                type="text"
                value={newAddress}
                onChange={e => setNewAddress(e.target.value)}
                placeholder="0x... or ENS name"
                style={inputStyle}
                disabled={addingAddress}
              />
            </div>
            <button
              type="submit"
              disabled={addingAddress || !newAddress.trim()}
              style={{ padding: '8px 20px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.12em', cursor: addingAddress ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {addingAddress ? 'ANALYZING...' : 'ADD'}
            </button>
          </form>
          {addressError && <div style={{ marginTop: 10, color: '#ff3b3b', fontSize: 12 }}>{addressError}</div>}
        </div>

        {/* Network graph */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 16 }}>NETWORK</div>
          <CaseNetworkGraph addresses={addresses.map(a => ({ address: a.address, riskLevel: a.risk_level, chain: a.chain }))} />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 16 }}>NOTES</div>

          {notes.length > 0 && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notes.map(n => (
                <div key={n.id} style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 6, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', marginBottom: 6 }}>
                    {n.author_name ?? 'Analyst'} · {fmtTime(n.created_at)}
                  </div>
                  <div style={{ fontSize: 13, color: '#ecfeff', lineHeight: 1.6 }}>{n.content}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddNote} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingTop: 8 }}
              />
            </div>
            <button
              type="submit"
              disabled={addingNote || !noteContent.trim()}
              style={{ padding: '8px 20px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.12em', cursor: addingNote ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', flexShrink: 0 }}
            >
              {addingNote ? 'SAVING...' : 'ADD NOTE'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
