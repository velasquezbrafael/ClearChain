'use client';

import type { AMLTypology } from '@/types';

function confidenceColor(c: number): string {
  if (c >= 0.85) return '#ef4444';
  if (c >= 0.65) return '#f97316';
  if (c >= 0.40) return '#eab308';
  return '#60a5fa';
}

function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High';
  if (c >= 0.65) return 'Medium';
  if (c >= 0.40) return 'Low-Med';
  return 'Low';
}

function TypologyEntry({ typology }: { typology: AMLTypology }) {
  const pct = Math.round(typology.confidence * 100);
  const color = confidenceColor(typology.confidence);

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: '#111118', border: '1px solid #1a1a24' }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-snug" style={{ color: '#e2e8f0' }}>{typology.name}</h3>
        <span
          className="flex-shrink-0 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {confidenceLabel(typology.confidence)}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: '#4b5563' }}>
          <span>CONFIDENCE</span>
          <span style={{ color: '#9ca3af' }}>{pct}%</span>
        </div>
        <div className="w-full rounded-full h-1" style={{ background: '#1a1a24' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: color, transition: 'width 0.7s ease-out' }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <p className="text-[10px] font-mono italic" style={{ color: '#374151' }}>
        {typology.fatfReference}
      </p>

      <p className="text-xs leading-relaxed pl-3" style={{ color: '#6b7280', borderLeft: '2px solid #1a1a24' }}>
        {typology.rationale}
      </p>
    </div>
  );
}

export default function TypologyCard({ typologies }: { typologies: AMLTypology[] }) {
  const triggered = typologies.filter(t => t.triggered);

  return (
    <div className="rounded-2xl p-6 space-y-4" style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm font-mono" style={{ color: '#e2e8f0' }}>AML Typologies</h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>FATF/FinCEN PATTERN MATCHING</p>
        </div>
        {triggered.length > 0 ? (
          <span
            className="text-[10px] font-bold font-mono px-3 py-1 rounded-full"
            style={{ background: 'rgba(127,29,29,0.4)', color: '#fca5a5', border: '1px solid #7f1d1d' }}
          >
            {triggered.length} matched
          </span>
        ) : (
          <span
            className="text-[10px] font-medium font-mono px-3 py-1 rounded-full"
            style={{ background: 'rgba(6,78,59,0.4)', color: '#6ee7b7', border: '1px solid #064e3b' }}
          >
            none matched
          </span>
        )}
      </div>

      {triggered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#1a1a24" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-mono" style={{ color: '#374151' }}>No matching typologies detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggered.sort((a, b) => b.confidence - a.confidence).map(t => (
            <TypologyEntry key={t.id} typology={t} />
          ))}
        </div>
      )}
    </div>
  );
}
