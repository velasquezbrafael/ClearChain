'use client';

import React, { useState } from 'react';

export default function WaitlistBar() {
  const [email,   setEmail]   = useState('');
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errMsg,  setErrMsg]  = useState('');
  const [focused, setFocused] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading' || status === 'success') return;
    setStatus('loading');
    setErrMsg('');
    try {
      const res  = await fetch('/api/waitlist/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (json.success) {
        setStatus('success');
      } else {
        setErrMsg(json.error ?? 'Something went wrong.');
        setStatus('error');
      }
    } catch {
      setErrMsg('Could not reach the server. Check your connection.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '32px 24px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 13,
            color: '#00ff88',
            letterSpacing: '0.08em',
          }}
        >
          ✓ You&apos;re on the list.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding:       '40px 32px',
        borderTop:     '1px solid rgba(255,255,255,0.04)',
        borderBottom:  '1px solid rgba(255,255,255,0.04)',
        background:    '#080b14',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           16,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily:    'var(--font-space-grotesk)',
          fontSize:      11,
          fontVariant:   'small-caps',
          letterSpacing: '0.14em',
          color:         '#8892a4',
        }}
      >
        Get early access to the API →
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 0, width: '100%', maxWidth: 480 }}
      >
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="your@email.com"
          autoComplete="email"
          required
          style={{
            flex:         1,
            background:   '#00080f',
            border:       `1px solid ${focused ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}`,
            borderRight:  'none',
            borderRadius: '4px 0 0 4px',
            outline:      'none',
            padding:      '10px 16px',
            fontFamily:   'var(--font-jetbrains-mono)',
            fontSize:     13,
            color:        'var(--text-primary)',
            caretColor:   '#00ff88',
            transition:   'border-color 0.15s',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            background:    status === 'loading' ? 'rgba(0,255,136,0.3)' : '#00ff88',
            border:        'none',
            borderRadius:  '0 4px 4px 0',
            padding:       '10px 20px',
            fontFamily:    'var(--font-jetbrains-mono)',
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: '0.1em',
            color:         '#00080f',
            cursor:        status === 'loading' ? 'wait' : 'pointer',
            whiteSpace:    'nowrap',
            transition:    'background 0.15s',
          }}
        >
          {status === 'loading' ? '...' : '→ JOIN WAITLIST'}
        </button>
      </form>

      {/* Inline error */}
      {status === 'error' && errMsg && (
        <div
          style={{
            fontFamily:    'var(--font-jetbrains-mono)',
            fontSize:      11,
            color:         '#ff6b6b',
            letterSpacing: '0.04em',
          }}
        >
          {errMsg}
        </div>
      )}
    </div>
  );
}
