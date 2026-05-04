'use client';

import { useEffect } from 'react';
import type { RiskScore } from '@/types';
import InfoTooltip from '@/components/InfoTooltip';

interface ScoreModalProps {
  riskScore: RiskScore;
  onClose: () => void;
}

const SIGNAL_LABELS: Record<string, string> = {
  ofac_match: 'OFAC / SDN Match',
  mixer_interaction: 'Mixer Interaction',
  rapid_fund_movement: 'Rapid Fund Movement',
  high_risk_counterparty: 'High-Risk Counterparty',
  volume_anomaly: 'Volume Anomaly',
  community_red_flags: 'Community Red Flags',
};

const SIGNAL_TOOLTIPS: Record<string, string> = {
  ofac_match: 'Wallet appears on the US Treasury OFAC SDN sanctions list. Transacting may violate federal law. See /docs#scoring.',
  mixer_interaction: 'Wallet is a known mixer or directly transacted with one (e.g. Tornado Cash, OFAC-designated 08/08/2022). Mandatory SAR trigger. See /docs#scoring.',
  rapid_fund_movement: '3+ outbound txns in 24h, each forwarding ≥80% of balance. Only fires alongside OFAC or mixer signal to avoid false positives on exchange hot wallets. See /docs#scoring.',
  high_risk_counterparty: 'At least one counterparty is labeled OFAC-designated or known-malicious, even if the queried wallet itself is not sanctioned. See /docs#scoring.',
  volume_anomaly: 'Total transaction volume exceeds 100 ETH in a wallet less than 30 days old — source-of-funds inquiry required. See /docs#scoring.',
  community_red_flags: 'Wallet or counterparties carry red-flag labels from the open-source eth-labels community dataset. See /docs#scoring.',
};

function riskColor(level: string): string {
  if (level === 'CRITICAL') return '#ff3b3b';
  if (level === 'HIGH') return '#ff8c00';
  if (level === 'MEDIUM') return '#ffd60a';
  return '#06b6d4';
}

function barChars(triggered: boolean, score: number, weight: number, total: number = 20): string {
  if (!triggered) return '░'.repeat(total);
  const filled = Math.round((score / Math.max(weight, 1)) * total);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, total - filled));
}

export default function ScoreModal({ riskScore, onClose }: ScoreModalProps) {
  // Close on Esc
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const sorted = Object.values(riskScore.signals).sort((a, b) => {
    if (a.triggered && !b.triggered) return -1;
    if (!a.triggered && b.triggered) return 1;
    return b.weight - a.weight;
  });

  const color = riskColor(riskScore.level);

  return (
    // Overlay
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#001824',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          width: '100%',
          maxWidth: 580,
          padding: '32px 36px',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 16,
            right: 20,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 14,
            color: 'var(--text-dim)',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>

        {/* Header */}
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: 'var(--text-dim)',
            marginBottom: 24,
          }}
        >
          HOW THIS SCORE WAS CALCULATED
        </div>

        {/* Signal rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
          {sorted.map(signal => (
            <div
              key={signal.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 26px 1fr 80px',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {/* Name + tooltip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 11,
                    color: signal.triggered ? 'var(--text-primary)' : 'var(--text-dim)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {SIGNAL_LABELS[signal.name] ?? signal.name}
                </span>
                {SIGNAL_TOOLTIPS[signal.name] && (
                  <InfoTooltip text={SIGNAL_TOOLTIPS[signal.name]} />
                )}
              </div>

              {/* Max pts */}
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  textAlign: 'right',
                }}
              >
                {signal.weight}
              </span>

              {/* Bar */}
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  color: signal.triggered ? color : '#2d3748',
                  letterSpacing: '-0.02em',
                  overflow: 'hidden',
                }}
              >
                {barChars(signal.triggered, signal.score, signal.weight)}
              </span>

              {/* Status */}
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: signal.triggered ? color : '#1e4d5c',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {signal.triggered ? `+${signal.score} pts` : 'not triggered'}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: '1px solid rgba(6,182,212,0.08)',
            paddingTop: 20,
            display: 'grid',
            gridTemplateColumns: '180px 26px 1fr 80px',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            TOTAL
          </span>
          <span />
          <span />
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 13,
              fontWeight: 700,
              color,
              textAlign: 'right',
            }}
          >
            {riskScore.total}/100
          </span>
        </div>

        {/* Risk level */}
        <div
          style={{
            marginTop: 16,
            padding: '10px 16px',
            background: `${color}12`,
            border: `1px solid ${color}30`,
            borderRadius: 2,
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.15em',
            color,
            textAlign: 'center',
          }}
        >
          {riskScore.level} RISK
        </div>
      </div>
    </div>
  );
}
