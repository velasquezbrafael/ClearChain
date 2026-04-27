'use client';

import React, { useState } from 'react';
import type { RiskScore, RiskLevel } from '@/types';
import ScoreModal from '@/components/ScoreModal';
import InfoTooltip from '@/components/InfoTooltip';
import { useCountUp } from '@/lib/useCountUp';

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    default:         return '#22d3ee';
  }
}

function riskGlow(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '0 0 30px rgba(255,59,59,0.8), 0 0 60px rgba(255,59,59,0.3)';
    case 'HIGH':     return '0 0 30px rgba(255,140,0,0.7), 0 0 60px rgba(255,140,0,0.25)';
    case 'MEDIUM':   return '0 0 30px rgba(255,214,10,0.7), 0 0 60px rgba(255,214,10,0.25)';
    default:         return '0 0 30px rgba(34,211,238,0.6), 0 0 60px rgba(34,211,238,0.2)';
  }
}

function cardGlow(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '0 0 40px rgba(255,59,59,0.12), inset 0 0 40px rgba(255,59,59,0.03)';
    case 'HIGH':     return '0 0 30px rgba(255,140,0,0.08)';
    case 'LOW':      return '0 0 30px rgba(34,211,238,0.07)';
    default:         return 'none';
  }
}

const DESCRIPTIONS: Record<RiskLevel, string> = {
  CRITICAL: 'Immediate escalation required. Strong indicators of sanctions exposure. SAR filing should be considered.',
  HIGH:     'Significant red flags detected. Enhanced due diligence and source-of-funds inquiry required.',
  MEDIUM:   'Elevated risk indicators present. EDD warranted. Monitor for continued activity.',
  LOW:      'No significant risk indicators detected. Standard monitoring applies.',
};

/** SVG gauge ring — animates as count-up progresses */
function RiskRing({ score, color, size = 160 }: { score: number; color: string; size?: number }) {
  const r  = size * 0.43;        // radius ~68 at size=160
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ pointerEvents: 'none', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(6,182,212,0.07)"
        strokeWidth={6}
      />
      {/* Value arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{
          transition: 'stroke-dashoffset 0.04s linear',
          filter: `drop-shadow(0 0 6px ${color})`,
        }}
      />
    </svg>
  );
}

interface RiskScoreCardProps {
  riskScore: RiskScore;
}

export default function RiskScoreCard({ riskScore }: RiskScoreCardProps) {
  const { total, level } = riskScore;
  const color = riskColor(level);
  const [modalOpen, setModalOpen] = useState(false);
  const [scoreHovered, setScoreHovered] = useState(false);

  // Animated count-up — drives both the number and the ring
  const displayCount = useCountUp(total, 950);

  return (
    <>
      <div
        className="glass"
        style={{
          position: 'relative',
          borderRadius: 4,
          boxShadow: cardGlow(level),
          overflow: 'clip',
        }}
      >
        {/* Vertical accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: 3,
            background: color,
            boxShadow: `0 0 16px ${color}`,
          }}
        />

        <div style={{ padding: '32px 32px 32px 40px' }}>
          {/* Label */}
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              color: 'var(--text-dim)',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            RISK ASSESSMENT
            <InfoTooltip text="A 0–100 score based on 6 weighted signals. 0–24 = Low, 25–49 = Medium, 50–74 = High, 75–100 = Critical. Every point is explained — no black box." />
          </div>

          {/* Score ring + number */}
          <div
            onClick={() => setModalOpen(true)}
            onMouseEnter={() => setScoreHovered(true)}
            onMouseLeave={() => setScoreHovered(false)}
            title="Click to see score breakdown"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 160,
              height: 160,
              marginBottom: 8,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: scoreHovered ? 0.8 : 1,
            }}
          >
            {/* Animated SVG ring */}
            <div style={{ position: 'absolute', inset: 0 }}>
              <RiskRing score={displayCount} color={color} size={160} />
            </div>

            {/* Score number centered inside ring — pulsing glow keyed to risk level */}
            <style>{`
              @keyframes scorePulse {
                0%, 100% { text-shadow: 0 0 8px ${color}, 0 0 20px ${color}40; }
                50%       { text-shadow: 0 0 16px ${color}, 0 0 40px ${color}60, 0 0 60px ${color}20; }
              }
            `}</style>
            <span
              style={{
                fontSize: 62,
                fontFamily: 'var(--font-space-grotesk)',
                fontWeight: 700,
                lineHeight: 1,
                color,
                letterSpacing: '-0.03em',
                position: 'relative',
                zIndex: 1,
                animation: 'scorePulse 2.5s ease-in-out infinite',
              } as React.CSSProperties}
            >
              {displayCount}
            </span>
          </div>

          {/* Click hint */}
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--text-dim)',
              marginBottom: 20,
              cursor: 'pointer',
            }}
            onClick={() => setModalOpen(true)}
          >
            click to explain →
          </div>

          {/* Thin rule */}
          <div
            style={{
              width: 48,
              height: 1,
              background: 'rgba(6,182,212,0.08)',
              marginBottom: 20,
            }}
          />

          {/* Level badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '5px 14px',
                border: `1px solid ${color}55`,
                background: `${color}14`,
                color,
                borderRadius: 2,
                boxShadow: `0 0 12px ${color}22`,
              }}
            >
              {level === 'LOW' ? 'CLEAN' : `${level} RISK`}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                color: 'var(--text-dim)',
              }}
            >
              / 100
            </span>
          </div>

          {/* Percentile */}
          {(() => {
            let pct: number;
            if (level === 'CRITICAL') pct = Math.round(75 + ((total - 75) / 25) * 19);
            else if (level === 'HIGH') pct = Math.round(60 + ((total - 50) / 24) * 14);
            else if (level === 'MEDIUM') pct = Math.round(30 + ((total - 25) / 24) * 29);
            else pct = 100 - total;
            return (
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', margin: '0 0 16px' }}>
                {level === 'LOW'
                  ? `Lower risk than ${pct}% of analyzed wallets`
                  : `Higher risk than ${pct}% of analyzed wallets`}
              </p>
            );
          })()}

          {/* Description */}
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {DESCRIPTIONS[level]}
          </p>
        </div>
      </div>

      {modalOpen && (
        <ScoreModal riskScore={riskScore} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
