'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Chain = 'ETH' | 'BTC' | 'TRX'
type RowStatus = 'queued' | 'running' | 'done' | 'error'

interface BulkRow {
  index: number
  address: string
  chain: Chain
  status: RowStatus
  score: number | null
  riskLevel: string | null
  topSignal: string | null
  ofacMatch: boolean
  mixerInteraction: boolean
  errorMsg: string | null
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#00ff88',
  MEDIUM: '#ffd60a',
  HIGH: '#ff8c00',
  CRITICAL: '#ff3b3b',
}

function truncateAddr(addr: string): string {
  if (addr.length <= 16) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

function parseLines(text: string, defaultChain: Chain): Array<{ address: string; chain: Chain }> {
  const seen = new Set<string>()
  const result: Array<{ address: string; chain: Chain }> = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',')
    const address = parts[0].trim()
    if (!address) continue
    const chainRaw = (parts[1]?.trim().toUpperCase()) as Chain
    const chain: Chain = (['ETH', 'BTC', 'TRX'] as Chain[]).includes(chainRaw) ? chainRaw : defaultChain
    const key = `${address.toLowerCase()}-${chain}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ address, chain })
  }
  return result
}

function buildPreview(rows: Array<{ address: string; chain: Chain }>): string {
  if (rows.length === 0) return ''
  const counts: Record<Chain, number> = { ETH: 0, BTC: 0, TRX: 0 }
  for (const r of rows) counts[r.chain]++
  const parts = (['ETH', 'BTC', 'TRX'] as Chain[])
    .filter(c => counts[c] > 0)
    .map(c => `${c}: ${counts[c]}`)
  return `${rows.length} address${rows.length !== 1 ? 'es' : ''} detected — ${parts.join(' · ')}`
}

function exportCSV(rows: BulkRow[]) {
  const header = 'address,chain,risk_score,risk_level,top_signal,ofac_match,mixer_interaction'
  const lines = rows
    .filter(r => r.status === 'done')
    .map(r =>
      [r.address, r.chain, r.score ?? '', r.riskLevel ?? '', r.topSignal ?? '', r.ofacMatch, r.mixerInteraction].join(',')
    )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clearchain-bulk-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function BulkPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userEmail, setUserEmail] = useState('')
  const [textarea, setTextarea] = useState('')
  const [defaultChain, setDefaultChain] = useState<Chain>('ETH')
  const [rows, setRows] = useState<BulkRow[]>([])
  const [running, setRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [hoveredError, setHoveredError] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/auth/login')
      else setUserEmail(user.email ?? '')
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setTextarea(ev.target?.result as string ?? '')
    reader.readAsText(file)
    e.target.value = ''
  }

  const parsed = parseLines(textarea, defaultChain)
  const preview = buildPreview(parsed)

  async function runScreening() {
    if (parsed.length === 0 || running) return
    abortRef.current = false
    setAllDone(false)

    const initial: BulkRow[] = parsed.map((p, i) => ({
      index: i,
      address: p.address,
      chain: p.chain,
      status: 'queued',
      score: null,
      riskLevel: null,
      topSignal: null,
      ofacMatch: false,
      mixerInteraction: false,
      errorMsg: null,
    }))
    setRows(initial)
    setRunning(true)

    for (let i = 0; i < initial.length; i++) {
      if (abortRef.current) break

      setRows(prev => prev.map(r => r.index === i ? { ...r, status: 'running' } : r))

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ address: initial[i].address, chain: initial[i].chain }),
        })
        const json = await res.json()

        if (!res.ok || !json.success) {
          setRows(prev => prev.map(r => r.index === i ? {
            ...r, status: 'error', errorMsg: json.error ?? `HTTP ${res.status}`,
          } : r))
        } else {
          const data = json.data
          const signals: Array<{ name: string; score: number; triggered: boolean }> = data.riskScore?.signals ?? []
          const topSig = signals.filter(s => s.triggered).sort((a, b) => b.score - a.score)[0]
          const topSignal = topSig ? topSig.name.replace(/_/g, ' ').toUpperCase() : null
          const ofacMatch = signals.some(s => s.name === 'ofac_match' && s.triggered)
          const mixerInteraction = signals.some(s => s.name === 'mixer_interaction' && s.triggered)
          setRows(prev => prev.map(r => r.index === i ? {
            ...r,
            status: 'done',
            score: data.riskScore?.total ?? null,
            riskLevel: data.riskScore?.level ?? null,
            topSignal,
            ofacMatch,
            mixerInteraction,
          } : r))
        }
      } catch (err) {
        setRows(prev => prev.map(r => r.index === i ? {
          ...r, status: 'error', errorMsg: err instanceof Error ? err.message : 'Network error',
        } : r))
      }

      if (i < initial.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }

    setRunning(false)
    setAllDone(true)
  }

  const completed = rows.filter(r => r.status === 'done' || r.status === 'error').length
  const total = rows.length
  const progress = total > 0 ? (completed / total) * 100 : 0
  const highCriticalCount = rows.filter(r => r.status === 'done' && (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL')).length
  const cleanCount = rows.filter(r => r.status === 'done' && r.riskLevel === 'LOW').length
  const doneCount = rows.filter(r => r.status === 'done').length

  const btnStyle = (primary: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    background: primary ? 'rgba(0,255,136,0.1)' : '#080b14',
    border: primary ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 4,
    color: primary ? '#00ff88' : '#8892a4',
    fontSize: 11,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    fontFamily: 'var(--font-jetbrains-mono)',
  })

  const cell: React.CSSProperties = {
    padding: '11px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: 12,
    fontFamily: 'var(--font-jetbrains-mono)',
    color: '#f0f4ff',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#f0f4ff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/dashboard" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Dashboard</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
          <a href="/dashboard/watchlist" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Watchlist</a>
          <a href="/dashboard/bulk" style={{ fontSize: 12, color: '#00ff88', textDecoration: 'none', letterSpacing: '0.08em' }}>Bulk Screen</a>
          <a href="/dashboard/settings" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Settings</a>
          <a href="/intel" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
          <button onClick={signOut} style={{ fontSize: 12, color: '#8892a4', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 8, textTransform: 'uppercase' as const }}>Compliance</div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 28, fontWeight: 700, color: '#f0f4ff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>Bulk Address Screening</h1>
          <p style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif', fontSize: 13, color: '#8892a4', margin: 0, lineHeight: 1.5 }}>
            Paste addresses one per line, or upload a CSV. Add <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#3d4a5c' }}>,CHAIN</code> after each address to override the default chain.
          </p>
        </div>

        {/* Input card */}
        <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '24px', marginBottom: 24 }}>
          {/* Top row: default chain + upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4' }}>DEFAULT CHAIN</span>
            {(['ETH', 'BTC', 'TRX'] as Chain[]).map(c => (
              <button
                key={c}
                onClick={() => setDefaultChain(c)}
                style={{
                  padding: '5px 14px',
                  background: defaultChain === c ? 'rgba(0,255,136,0.1)' : 'transparent',
                  border: `1px solid ${defaultChain === c ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 2,
                  color: defaultChain === c ? '#00ff88' : '#8892a4',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                {c}
              </button>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={btnStyle(false)}
                disabled={running}
              >
                UPLOAD CSV
              </button>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={textarea}
            onChange={e => setTextarea(e.target.value)}
            placeholder={'0xAbc123...  (ETH, default chain)\n0xDef456...,BTC  (override chain per row)\nbc1qxy2kgdyfoo...  (BTC address)'}
            rows={8}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 2,
              color: '#f0f4ff',
              fontSize: 12,
              padding: '12px 14px',
              fontFamily: 'var(--font-jetbrains-mono)',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.7,
              boxSizing: 'border-box',
            }}
            disabled={running}
          />

          {/* Preview + run */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: parsed.length > 0 ? '#8892a4' : '#3d4a5c', letterSpacing: '0.08em' }}>
              {parsed.length > 0 ? preview : 'Paste addresses above to begin'}
            </span>
            <button
              onClick={runScreening}
              disabled={parsed.length === 0 || running}
              style={{
                padding: '10px 28px',
                background: parsed.length > 0 && !running ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${parsed.length > 0 && !running ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 4,
                color: parsed.length > 0 && !running ? '#00ff88' : '#3d4a5c',
                fontSize: 11,
                letterSpacing: '0.15em',
                cursor: parsed.length > 0 && !running ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              {running ? `SCANNING ${completed} / ${total}...` : 'RUN SCREENING'}
            </button>
          </div>
        </div>

        {/* Empty state — shown before any screening has been run */}
        {rows.length === 0 && (
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '56px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="19" y="4" width="10" height="10" rx="1.5" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="4" y="19" width="10" height="10" rx="1.5" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="19" y="19" width="10" height="10" rx="1.5" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="4" y="34" width="10" height="4" rx="1" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="19" y="34" width="10" height="4" rx="1" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="34" y="4" width="4" height="10" rx="1" stroke="#1e2430" strokeWidth="1.5"/>
              <rect x="34" y="19" width="4" height="10" rx="1" stroke="#1e2430" strokeWidth="1.5"/>
            </svg>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#3d4a5c', textTransform: 'uppercase' as const }}>
              Paste addresses above to begin
            </div>
            <div style={{ fontSize: 13, color: '#3d4a5c', textAlign: 'center', lineHeight: 1.6, maxWidth: 340 }}>
              Supports ETH, BTC, and TRX. One address per line, or <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}>address,CHAIN</span> format.
              <br />Up to 500 addresses per batch.
            </div>
          </div>
        )}

        {/* Results section */}
        {rows.length > 0 && (
          <div>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: '#00ff88',
                    transition: 'width 0.3s ease',
                    boxShadow: '0 0 8px rgba(0,255,136,0.4)',
                  }}
                />
              </div>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#8892a4', letterSpacing: '0.08em', flexShrink: 0 }}>
                {completed} / {total} — {Math.round(progress)}%
              </span>
            </div>

            {/* Summary row (when all done) */}
            {allDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '14px 20px', background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#8892a4' }}>
                  SCREENED <span style={{ color: '#f0f4ff', fontWeight: 700 }}>{doneCount}</span>
                </span>
                <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#8892a4' }}>
                  HIGH / CRITICAL{' '}
                  <span style={{ color: highCriticalCount > 0 ? '#ff8c00' : '#f0f4ff', fontWeight: 700 }}>{highCriticalCount}</span>
                </span>
                <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#8892a4' }}>
                  CLEAN <span style={{ color: '#00ff88', fontWeight: 700 }}>{cleanCount}</span>
                </span>
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    onClick={() => exportCSV(rows)}
                    style={btnStyle(true)}
                  >
                    EXPORT CSV
                  </button>
                </div>
              </div>
            )}

            {/* Results table */}
            <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['#', 'Address', 'Chain', 'Score', 'Risk Level', 'Top Signal', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.index} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: row.status === 'queued' ? 0.35 : 1, transition: 'opacity 0.2s' }}>
                      {/* # */}
                      <td style={{ ...cell, color: '#3d4a5c', width: 40 }}>{row.index + 1}</td>

                      {/* Address */}
                      <td style={{ ...cell }}>
                        {row.status === 'done' || row.status === 'error' ? (
                          <a
                            href={`/?address=${row.address}&chain=${row.chain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#00ff88', textDecoration: 'none', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}
                            title={row.address}
                          >
                            {truncateAddr(row.address)}
                          </a>
                        ) : (
                          <span style={{ color: '#8892a4' }} title={row.address}>{truncateAddr(row.address)}</span>
                        )}
                      </td>

                      {/* Chain */}
                      <td style={{ ...cell, color: '#8892a4', width: 60 }}>{row.chain}</td>

                      {/* Score */}
                      <td style={{ ...cell, width: 60 }}>
                        {row.status === 'done' && row.score !== null ? (
                          <span style={{ color: RISK_COLORS[row.riskLevel ?? ''] ?? '#f0f4ff', fontWeight: 700 }}>{row.score}</span>
                        ) : row.status === 'running' ? (
                          <span style={{ color: '#3d4a5c' }}>—</span>
                        ) : (
                          <span style={{ color: '#3d4a5c' }}>—</span>
                        )}
                      </td>

                      {/* Risk Level */}
                      <td style={{ ...cell, width: 100 }}>
                        {row.status === 'done' && row.riskLevel ? (
                          <span style={{ fontSize: 10, letterSpacing: '0.1em', color: RISK_COLORS[row.riskLevel] ?? '#f0f4ff', fontWeight: 700 }}>
                            {row.riskLevel}
                          </span>
                        ) : row.status === 'running' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#3d4a5c', letterSpacing: '0.1em' }}>
                            <span style={{
                              width: 5, height: 5, borderRadius: '50%', background: '#00ff88',
                              animation: 'pulseGlow 1s ease-in-out infinite',
                              flexShrink: 0,
                            }} />
                            SCANNING
                          </span>
                        ) : row.status === 'queued' ? (
                          <span style={{ fontSize: 10, color: '#3d4a5c', letterSpacing: '0.1em' }}>QUEUED</span>
                        ) : null}
                      </td>

                      {/* Top Signal */}
                      <td style={{ ...cell, color: '#8892a4', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.status === 'done' ? (row.topSignal ?? <span style={{ color: '#3d4a5c' }}>—</span>) : <span style={{ color: '#3d4a5c' }}>—</span>}
                      </td>

                      {/* Status */}
                      <td style={{ ...cell, width: 100 }}>
                        {row.status === 'done' && (
                          <span style={{ fontSize: 10, color: '#00ff88', letterSpacing: '0.08em' }}>DONE</span>
                        )}
                        {row.status === 'queued' && (
                          <span style={{ fontSize: 10, color: '#3d4a5c', letterSpacing: '0.08em' }}>QUEUED</span>
                        )}
                        {row.status === 'running' && (
                          <span style={{ fontSize: 10, color: '#ffd60a', letterSpacing: '0.08em' }}>RUNNING</span>
                        )}
                        {row.status === 'error' && (
                          <span
                            style={{ fontSize: 10, color: '#ff3b3b', letterSpacing: '0.08em', cursor: 'help', position: 'relative' }}
                            onMouseEnter={() => setHoveredError(row.index)}
                            onMouseLeave={() => setHoveredError(null)}
                            title={row.errorMsg ?? 'Unknown error'}
                          >
                            ERROR
                            {hoveredError === row.index && row.errorMsg && (
                              <span style={{
                                position: 'absolute', bottom: '100%', left: 0,
                                background: '#0d1220', border: '1px solid rgba(255,59,59,0.3)',
                                borderRadius: 2, padding: '6px 10px',
                                fontSize: 11, color: '#ff3b3b', letterSpacing: 0,
                                whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
                                maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {row.errorMsg}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
