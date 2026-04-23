'use client';

import type { AMLTypology } from '@/types';

function confidenceColor(c: number): string {
  if (c >= 0.85) return '#ff3b3b';
  if (c >= 0.65) return '#ff8c00';
  if (c >= 0.40) return '#ffd60a';
  return '#8892a4';
}

function progressChars(pct: number): string {
  const filled = Math.round(pct / 100 * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function TypologyRow({ typology }: { typology: AMLTypology }) {
  const pct = Math.round(typology.confidence * 100);
  const color = confidenceColor(typology.confidence);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        padding: '16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Indicator dot */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          marginTop: 5,
          marginRight: 16,
          boxShadow: `0 0 8px ${color}88`,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + bar + pct row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          >
            {typology.name.toUpperCase()}
          </span>

          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 13,
              color,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {progressChars(pct)}
          </span>

          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              color,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {pct}%
          </span>

          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            {typology.fatfReference}
          </span>
        </div>

        {/* Rationale */}
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
            paddingLeft: 0,
          }}
        >
          {typology.rationale}
        </p>
      </div>
    </div>
  );
}

export default function TypologyCard({ typologies }: { typologies: AMLTypology[] }) {
  const triggered = typologies.filter(t => t.triggered).sort((a, b) => b.confidence - a.confidence);

  if (triggered.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-dim)' }} />
        </div>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              marginBottom: 4,
            }}
          >
            NO PATTERNS DETECTED
          </p>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--text-dim)' }}>
            No FATF typologies matched against this address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          paddingBottom: 16,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            color: 'var(--text-dim)',
          }}
        >
          FATF / FINCEN PATTERN MATCHING
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            padding: '3px 10px',
            border: '1px solid rgba(255,59,59,0.25)',
            background: 'rgba(255,59,59,0.08)',
            color: '#ff3b3b',
            borderRadius: 2,
          }}
        >
          {triggered.length} MATCHED
        </span>
      </div>

      {/* Typology rows */}
      <div>
        {triggered.map(t => (
          <TypologyRow key={t.id} typology={t} />
        ))}
      </div>
    </div>
  );
}
