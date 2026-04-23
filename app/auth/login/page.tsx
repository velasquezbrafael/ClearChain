'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.2em', color: '#00ff88', fontFamily: 'var(--font-jetbrains-mono)', marginBottom: 8 }}>
            CLEARCHAIN
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#f0f4ff' }}>
            Sign in to your account
          </div>
        </div>

        <form onSubmit={handleSignIn}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                color: '#f0f4ff',
                fontSize: 14,
                padding: '8px 0',
                outline: 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#8892a4', marginBottom: 8 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                color: '#f0f4ff',
                fontSize: 14,
                padding: '8px 0',
                outline: 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            />
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
            {loading ? 'SIGNING IN...' : '→ SIGN IN'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#8892a4' }}>
          Don&apos;t have an account?{' '}
          <a href="/auth/signup" style={{ color: '#00ff88', textDecoration: 'none' }}>
            Sign up →
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a href="/" style={{ fontSize: 12, color: '#3d4a5c', textDecoration: 'none' }}>
            ← Back to tool
          </a>
        </div>
      </div>
    </div>
  )
}
