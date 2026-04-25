'use client';

import { useState } from 'react';

interface AddToWatchlistButtonProps {
  address: string;
  chain?: 'ETH' | 'BTC' | 'TRX';
}

export default function AddToWatchlistButton({ address, chain = 'ETH' }: AddToWatchlistButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'watching' | 'duplicate'>('idle');

  async function handleAdd() {
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address, chain }),
      });
      if (res.status === 409) {
        setState('duplicate');
        return;
      }
      if (!res.ok) {
        setState('idle');
        return;
      }
      setState('watching');
    } catch {
      setState('idle');
    }
  }

  const isWatching = state === 'watching' || state === 'duplicate';

  return (
    <button
      onClick={handleAdd}
      disabled={isWatching || state === 'loading'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: isWatching ? 'rgba(0,255,136,0.06)' : 'transparent',
        border: `1px solid ${isWatching ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 2,
        color: isWatching ? '#00ff88' : state === 'loading' ? '#3d4a5c' : '#8892a4',
        fontSize: 10,
        letterSpacing: '0.12em',
        fontFamily: 'var(--font-jetbrains-mono)',
        cursor: isWatching ? 'default' : state === 'loading' ? 'wait' : 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Eye icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <ellipse cx="6" cy="6" rx="5" ry="3.5" stroke="currentColor" strokeWidth="1.1"/>
        <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
      </svg>
      {state === 'loading' ? 'ADDING...' : state === 'watching' ? 'WATCHING' : state === 'duplicate' ? 'ALREADY WATCHING' : 'WATCH'}
    </button>
  );
}
