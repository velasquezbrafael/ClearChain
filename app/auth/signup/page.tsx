'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

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
      setDone(true)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    color: '#f0f4ff',
    fontSize: 14,
    padding: '8px 0',
    outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#03040a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.2em', color: '#00ff88', fontFamily: 'var(--font-jetbrains-mono)', marginBottom: 8 }}>
            CLEARCHAIN
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#f0f4ff' }}>
            Create your account
          </div>
        </div>

        {done ? (
          <div style={{
            padding: '24px',
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: 4,
            textAlign: 'center',
          }}>
            <div style={{ color: '#00ff88', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Check your email
            </div>
            <div style={{ color: '#8892a4', fontSize: 13 }}>
              We sent a confirmation link to <strong style={{ color: '#f0f4ff' }}>{email}</strong>.
              Click it to activate your account.
            </div>
            <div style={{ marginTop: 20 }}>
              <a href="/auth/login" style={{ color: '#00ff88', fontSize: 13, textDecoration: 'none' }}>
                ← Back to sign in
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>
                NAME
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>
                EMAIL
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>
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
                background: loading ? 'rgba(0,255,136,0.06)' : 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.3)',
                borderRadius: 4,
                color: '#00ff88',
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
        )}

        {!done && (
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#8892a4' }}>
            Already have an account?{' '}
            <a href="/auth/login" style={{ color: '#00ff88', textDecoration: 'none' }}>
              Sign in →
            </a>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a href="/" style={{ fontSize: 12, color: '#3d4a5c', textDecoration: 'none' }}>
            ← Back to tool
          </a>
        </div>
      </div>
    </div>
  )
}
