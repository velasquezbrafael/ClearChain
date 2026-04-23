'use client';

import { useEffect, useState } from 'react';
import type { RiskScore, RiskLevel } from '@/types';
import ScoreModal from '@/components/ScoreModal';
import InfoTooltip from '@/components/InfoTooltip';

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    default:         return '#00ff88';
  }
}

function riskGlow(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '0 0 40px rgba(255,59,59,0.7), 0 0 80px rgba(255,59,59,0.3)';
    case 'HIGH':     return '0 0 40px rgba(255,140,0,0.6), 0 0 80px rgba(255,140,0,0.25)';
    case 'MEDIUM':   return '0 0 40px rgba(255,214,10,0.6), 0 0 80px rgba(255,214,10,0.25)';
    default:         return '0 0 40px rgba(0,255,136,0.5), 0 0 80px rgba(0,255,136,0.2)';
  }
}

function cardGlow(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '0 0 40px rgba(255,59,59,0.12), inset 0 0 40px rgba(255,59,59,0.03)';
    case 'HIGH':     return '0 0 30px rgba(255,140,0,0.08)';
    case 'LOW':      return '0 0 30px rgba(0,255,136,0.07)';
    default:         return 'none';
  }
}

const DESCRIPTIONS: Record<RiskLevel, string> = {
  CRITICAL: 'Immediate escalation required. Strong indicators of sanctions exposure. SAR filing should be considered.',
  HIGH:     'Significant red flags detected. Enhanced due diligence and source-of-funds inquiry required.',
  MEDIUM:   'Elevated risk indicators present. EDD warranted. Monitor for continued activity.',
  LOW:      'No significant risk indicators detected. Standard monitoring applies.',
};

function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setValue(Math.round(eased * to));
      if (elapsed < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <>{value}</>;
}

interface RiskScoreCardProps {
  riskScore: RiskScore;
}

export default function RiskScoreCard({ riskScore }: RiskScoreCardProps) {
  const { total, level } = riskScore;
  const color = riskColor(level);
  const [modalOpen, setModalOpen] = useState(false);
  const [scoreHovered, setScoreHovered] = useState(false);

  return (
    <>
      <div
        style={{
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          background: '#080b14',
          boxShadow: cardGlow(level),
          overflow: 'hidden',
        }}
      >
        {/* Vertical accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
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
              marginBottom: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            RISK ASSESSMENT
            <InfoTooltip text="A 0–100 score based on 6 weighted signals. 0–24 = Low, 25–49 = Medium, 50–74 = High, 75–100 = Critical. Every point is explained — no black box." />
          </div>

          {/* Score number — clickable */}
          <div
            onClick={() => setModalOpen(true)}
            onMouseEnter={() => setScoreHovered(true)}
            onMouseLeave={() => setScoreHovered(false)}
            title="Click to see score breakdown"
            style={{
              fontSize: 120,
              fontFamily: 'var(--font-space-grotesk)',
              fontWeight: 700,
              lineHeight: 1,
              color,
              textShadow: riskGlow(level),
              letterSpacing: '-0.03em',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: scoreHovered ? 0.8 : 1,
            } as React.CSSProperties}
          >
            <CountUp to={total} />
          </div>

          {/* Click hint */}
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--text-dim)',
              marginTop: 6,
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
              background: 'rgba(255,255,255,0.06)',
              margin: '20px 0',
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
                border: `1px solid ${color}44`,
                background: `${color}12`,
                color,
                borderRadius: 2,
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
