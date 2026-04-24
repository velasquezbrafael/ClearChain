'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ApiKey {
  id: string
  label: string
  tier: string
  usage_count: number
  last_used_at: string | null
  created_at: string
  is_active: boolean
}

const TIER_LIMITS: Record<string, string> = {
  free:     '100 req / day',
  analyst:  '2,000 req / day',
  team:     'Unlimited',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(iso: string | null) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserEmail(user.email ?? '')

      const { data } = await supabase
        .from('api_keys')
        .select('id, label, tier, usage_count, last_used_at, created_at, is_active')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setKeys(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setGenerating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rawKey = `ck_live_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`

    // Hash via API route to keep crypto.createHash server-side
    const res = await fetch('/api/apikeys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', rawKey, label: newLabel.trim() }),
    })
    const json = await res.json()

    if (json.success) {
      setKeys(prev => [json.key, ...prev])
      setRevealedKey(rawKey)
      setNewLabel('')
      setShowForm(false)
    }

    setGenerating(false)
  }

  async function handleRevoke(id: string) {
    setRevoking(id)
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k))
    setRevoking(null)
  }

  function handleCopyKey() {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey).then(() => {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 1500)
    })
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#f0f4ff',
    fontSize: 13, padding: '8px 0', outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)', width: '100%',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <span style={{ fontSize: 15, letterSpacing: '0.15em', color: '#00ff88', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400 }}>CLEARCHAIN</span>
          <a href="/dashboard" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Dashboard</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
        </div>
        <span style={{ fontSize: 12, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 8 }}>ACCOUNT</div>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 32, fontWeight: 700, color: '#f0f4ff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>API Keys</h1>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: '#8892a4', margin: '0 0 40px', lineHeight: 1.6 }}>
          Generate keys to call <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#00ff88' }}>/api/analyze</code> programmatically.
          Include your key as <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#8892a4' }}>Authorization: Bearer ck_live_...</code>
        </p>

        {/* One-time reveal modal */}
        {revealedKey && (
          <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '20px 24px', marginBottom: 32 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#00ff88', marginBottom: 12 }}>
              API KEY GENERATED — COPY NOW. IT WON'T BE SHOWN AGAIN.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color: '#f0f4ff', background: '#080b14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 14px', flex: 1, wordBreak: 'break-all' }}>
                {revealedKey}
              </code>
              <button
                onClick={handleCopyKey}
                style={{ padding: '8px 18px', background: copiedKey ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {copiedKey ? 'COPIED ✓' : 'COPY'}
              </button>
              <button
                onClick={() => setRevealedKey(null)}
                style={{ padding: '8px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8892a4', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Rate limits */}
        <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '20px 24px', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 16 }}>RATE LIMITS BY TIER</div>
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { tier: 'FREE', limit: '100 req / day', color: '#8892a4' },
              { tier: 'ANALYST', limit: '2,000 req / day', color: '#ffd60a' },
              { tier: 'TEAM', limit: 'Unlimited', color: '#00ff88' },
            ].map(({ tier, limit, color }, i) => (
              <div key={tier} style={{ flex: 1, padding: '14px 16px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color, marginBottom: 6, letterSpacing: '0.1em' }}>{tier}</div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#f0f4ff' }}>{limit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Header + generate button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#8892a4' }}>YOUR KEYS</div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{ padding: '8px 18px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            + Generate New Key
          </button>
        </div>

        {/* Generate form */}
        {showForm && (
          <form onSubmit={handleGenerate} style={{ background: '#080b14', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 8, padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', marginBottom: 8, fontFamily: 'var(--font-jetbrains-mono)' }}>KEY LABEL</label>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. My App, CI/CD Pipeline..."
                style={inputStyle}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={generating || !newLabel.trim()}
              style={{ padding: '8px 20px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 11, letterSpacing: '0.1em', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0, opacity: !newLabel.trim() ? 0.5 : 1 }}
            >
              {generating ? 'CREATING...' : 'CREATE'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#8892a4', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
            >
              Cancel
            </button>
          </form>
        )}

        {/* Keys table */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#3d4a5c', fontSize: 13 }}>Loading...</div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#3d4a5c', fontSize: 13, background: '#080b14', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            No API keys yet. Generate one to start building.
          </div>
        ) : (
          <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Label', 'Tier', 'Usage', 'Last Used', 'Created', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: k.is_active ? 1 : 0.4 }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#f0f4ff', fontFamily: 'var(--font-jetbrains-mono)' }}>{k.label}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: k.tier === 'team' ? '#00ff88' : k.tier === 'analyst' ? '#ffd60a' : '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {k.tier.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{k.usage_count.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtRelative(k.last_used_at)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtDate(k.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: k.is_active ? '#00ff88' : '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {k.is_active ? 'ACTIVE' : 'REVOKED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {k.is_active && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          style={{ fontSize: 11, color: '#ff3b3b', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', fontFamily: 'var(--font-jetbrains-mono)', opacity: revoking === k.id ? 0.5 : 1 }}
                        >
                          {revoking === k.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Usage example */}
        <div style={{ marginTop: 48, padding: '24px', background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#8892a4', marginBottom: 14 }}>USAGE EXAMPLE</div>
          <pre style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#8892a4', margin: 0, lineHeight: 1.7, overflowX: 'auto' }}>
            <span style={{ color: '#3d4a5c' }}>curl</span>{` -X POST https://clear-chain-peach.vercel.app/api/analyze \\
  `}<span style={{ color: '#ffd60a' }}>-H</span>{` "Authorization: Bearer ck_live_your_key_here" \\
  `}<span style={{ color: '#ffd60a' }}>-H</span>{` "Content-Type: application/json" \\
  `}<span style={{ color: '#ffd60a' }}>-d</span>{` '{"address":"0x..."}'`}
          </pre>
          <div style={{ marginTop: 12 }}>
            <a href="/api-docs" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#00ff88', textDecoration: 'none', letterSpacing: '0.08em' }}>
              Full API docs →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
