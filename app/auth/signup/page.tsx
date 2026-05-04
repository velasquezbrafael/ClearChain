'use client'

// Email template configured in Supabase dashboard → Auth → Email Templates
// Subject: "Confirm your ClearChain account"
// Template: dark branded HTML with green CTA button (see handoff notes)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    color: '#ecfeff',
    fontSize: 14,
    padding: '8px 0',
    outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#00080f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.2em', color: '#06b6d4', fontFamily: 'var(--font-jetbrains-mono)', marginBottom: 8 }}>
            CLEARCHAIN
          </div>
          <div style={{ fontSize: 14, color: '#7ec8d8', marginBottom: 16 }}>
            Check any wallet before you send
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#ecfeff' }}>
            Create your free account
          </div>
        </div>

        <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#7ec8d8', marginBottom: 8 }}>
                NAME
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#7ec8d8', marginBottom: 8 }}>
                EMAIL
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#7ec8d8', marginBottom: 8 }}>
                PASSWORD
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" style={inputStyle} />
            </div>

            {error && (
              <div style={{
                marginBottom: 20,
                padding: '10px 14px',
                background: 'rgba(255,59,59,0.08)',
                border: '1px solid rgba(255,59,59,0.2)',
                borderRadius: 4,
                color: '#ff3b3b',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: loading ? 'rgba(6,182,212,0.06)' : 'rgba(6,182,212,0.1)',
                border: '1px solid rgba(6,182,212,0.3)',
                borderRadius: 4,
                color: '#06b6d4',
                fontSize: 12,
                letterSpacing: '0.15em',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            >
              {loading ? 'CREATING...' : '→ CREATE ACCOUNT'}
            </button>
          </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#7ec8d8' }}>
            Already have an account?{' '}
            <a href="/auth/login" style={{ color: '#06b6d4', textDecoration: 'none' }}>
              Sign in →
            </a>
          </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a href="/" style={{ fontSize: 12, color: '#1e4d5c', textDecoration: 'none' }}>
            ← Back to tool
          </a>
        </div>
      </div>
    </div>
  )
}
