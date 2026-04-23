'use client';

import { useState } from 'react';

interface SARDraftCardProps {
  sarDraft: string | null;
  onDownload?: () => void;
}

export default function SARDraftCard({ sarDraft, onDownload }: SARDraftCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!sarDraft) return;
    try {
      await navigator.clipboard.writeText(sarDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }

  const isFailed = !!sarDraft && sarDraft.toLowerCase().includes('generation failed');
  const isReady = !!sarDraft && !isFailed;
  const lines = isReady ? sarDraft.split('\n') : [];

  if (isFailed) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff8c00' }} />
        <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.12em', color: '#ff8c00' }}>
          GENERATION FAILED
        </p>
        <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          Re-analyze to retry
        </p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderTopColor: '#00ff88',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          Generating SAR draft...
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 20,
        }}
      >
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 2,
            background: 'none',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            color: copied ? '#00ff88' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          aria-label="Copy SAR text"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>

        <button
          onClick={onDownload}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            border: '1px solid rgba(0,255,136,0.25)',
            borderRadius: 2,
            background: 'rgba(0,255,136,0.06)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            color: '#00ff88',
            cursor: 'pointer',
          }}
          aria-label="Download SAR draft"
        >
          DOWNLOAD .TXT
        </button>
      </div>

      {/* SAR content with line numbers */}
      <div
        style={{
          display: 'flex',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: 4,
          background: '#03040a',
          overflow: 'auto',
          maxHeight: 480,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 12,
          lineHeight: 1.8,
        }}
      >
        {/* Line numbers */}
        <div
          style={{
            textAlign: 'right',
            padding: '20px 16px 20px 20px',
            color: 'var(--text-dim)',
            userSelect: 'none',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            minWidth: 52,
            flexShrink: 0,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code content */}
        <div
          style={{
            padding: '20px 24px',
            flex: 1,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
          }}
        >
          {lines.map((line, i) => (
            <div key={i}>{line || '\u00a0'}</div>
          ))}
        </div>
      </div>

      {/* Compliance warning */}
      <div
        style={{
          marginTop: 20,
          padding: '12px 16px',
          border: '1px solid rgba(255,140,0,0.15)',
          borderRadius: 2,
          background: 'rgba(255,140,0,0.04)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#ff8c00',
            flexShrink: 0,
            marginTop: 5,
          }}
        />
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          <strong style={{ color: '#ff8c00' }}>For compliance officer review only — not a filed SAR.</strong>{' '}
          This AI-generated draft must be reviewed, verified, and approved by a qualified BSA/AML officer
          before any submission to FinCEN.
        </p>
      </div>
    </div>
  );
}
