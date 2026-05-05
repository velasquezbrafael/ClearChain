'use client';

import React from 'react';

export default function WaitlistBar() {
  return (
    <div
      style={{
        padding: '28px 24px',
        borderTop: '1px solid rgba(6,182,212,0.06)',
        borderBottom: '1px solid rgba(6,182,212,0.06)',
        background: '#080b14',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px 32px',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: '#1e4d5c',
        }}
      >
        FREE · OPEN SOURCE · NO ACCOUNT REQUIRED
      </span>

      {/* GitHub CTA */}
      <a
        href="https://github.com/velasquezbrafael-source/ClearChain"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 16px',
          background: 'rgba(6,182,212,0.06)',
          border: '1px solid rgba(6,182,212,0.15)',
          borderRadius: 3,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: '#06b6d4',
          textDecoration: 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(6,182,212,0.4)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(6,182,212,0.1)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(6,182,212,0.15)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(6,182,212,0.06)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        ★ Star on GitHub
      </a>

      {/* X/Twitter CTA */}
      <a
        href="https://x.com/search?q=ClearChain+crypto"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: '#3d4a5c',
          textDecoration: 'none',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#8892a4'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#3d4a5c'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.85L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        #ClearChain
      </a>
    </div>
  );
}
