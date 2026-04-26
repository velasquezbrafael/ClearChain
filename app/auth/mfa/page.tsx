'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MFAPage() {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleVerify(codeToVerify: string) {
    if (codeToVerify.length !== 6 || verifying) return
    setVerifying(true)
    setError('')

    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr || !factors?.totp?.length) {
        setError('No authenticator found. Please re-enable 2FA in Settings.')
        setVerifying(false)
        return
      }

      const factorId = factors.totp[0].id

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeErr || !challenge) {
        setError(challengeErr?.message ?? 'Failed to create challenge.')
        setVerifying(false)
        return
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: codeToVerify,
      })

      if (verifyErr) {
        setError('Invalid code. Please try again.')
        setCode('')
        inputRef.current?.focus()
        setVerifying(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setVerifying(false)
    }
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    setError('')
    if (val.length === 6) {
      handleVerify(val)
    }
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

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: 13, letterSpacing: '0.2em', color: '#ecfeff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, marginBottom: 8 }}>
              CLEARCHAIN
            </div>
          </a>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#ecfeff' }}>
            Two-Factor Authentication
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: '#7ec8d8', lineHeight: 1.6 }}>
            Enter the 6-digit code from your authenticator app.
          </div>
        </div>

        {/* Code input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.12em', color: '#7ec8d8', marginBottom: 12, textAlign: 'center' }}>
            VERIFICATION CODE
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={handleCodeChange}
            disabled={verifying}
            placeholder="000000"
            style={{
              width: '100%',
              background: '#001824',
              border: `1px solid ${error ? 'rgba(255,59,59,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              color: '#ecfeff',
              fontSize: 28,
              fontFamily: 'var(--font-jetbrains-mono)',
              letterSpacing: '0.35em',
              padding: '14px 0',
              textAlign: 'center',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
              opacity: verifying ? 0.6 : 1,
            }}
          />
        </div>

        {/* Error */}
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

        {/* Verify button */}
        <button
          onClick={() => handleVerify(code)}
          disabled={code.length !== 6 || verifying}
          style={{
            width: '100%',
            padding: '12px',
            background: code.length === 6 && !verifying ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${code.length === 6 && !verifying ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.08)'}`,
            borderRadius: 4,
            color: code.length === 6 && !verifying ? '#06b6d4' : '#1e4d5c',
            fontSize: 12,
            letterSpacing: '0.15em',
            fontWeight: 600,
            cursor: code.length === 6 && !verifying ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-jetbrains-mono)',
            transition: 'all 0.15s',
          }}
        >
          {verifying ? 'VERIFYING...' : '→ VERIFY'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a href="/auth/login" style={{ fontSize: 12, color: '#1e4d5c', textDecoration: 'none' }}>
            ← Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
