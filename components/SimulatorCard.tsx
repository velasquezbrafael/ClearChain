'use client';

import { useState } from 'react';
import type { ScoringSignal, RiskLevel } from '@/types';

const SIGNAL_META: Record<string, { label: string; description: string }> = {
  ofac_match:             { label: 'OFAC/SDN Match',          description: 'Address appears on OFAC SDN list' },
  mixer_interaction:      { label: 'Mixer Interaction',        description: 'Direct interaction with Tornado Cash or similar' },
  rapid_fund_movement:    { label: 'Rapid Fund Movement',      description: '3+ outbound hops within 24 hours' },
  high_risk_counterparty: { label: 'High-Risk Counterparty',  description: 'Counterparty on known high-risk list' },
  volume_anomaly:         { label: 'Volume Anomaly',           description: 'Unusual ETH volume for wallet age' },
  community_red_flags:    { label: 'Community Red Flags',      description: 'Community-flagged address' },
};

function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    default:         return '#06b6d4';
  }
}

interface SimulatorCardProps {
  signals: Record<string, ScoringSignal>;
  address: string;
  baselineScore: number;
  baselineLevel: RiskLevel;
}

export default function SimulatorCard({ signals, address, baselineScore, baselineLevel }: SimulatorCardProps) {
  const signalList = Object.values(signals);
  const initialActive = new Set(signalList.filter(s => s.triggered).map(s => s.name));
  const [active, setActive] = useState<Set<string>>(initialActive);
  const [generating, setGenerating] = useState(false);
  const [scenarioNarrative, setScenarioNarrative] = useState<string | null>(null);

  function toggle(name: string) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setScenarioNarrative(null);
  }

  function reset() {
    setActive(new Set(signalList.filter(s => s.triggered).map(s => s.name)));
    setScenarioNarrative(null);
  }

  const simulatedScore = Math.min(
    100,
    [...active].reduce((sum, name) => {
      const sig = signals[name];
      return sum + (sig?.weight ?? 0);
    }, 0),
  );

  const simulatedLevel = getRiskLevel(simulatedScore);
  const scoreChanged = simulatedScore !== baselineScore;

  async function generateScenarioNarrative() {
    setGenerating(true);
    setScenarioNarrative(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, activeSignals: [...active] }),
      });
      const json = await res.json();
      setScenarioNarrative(json.narrative ?? 'Generation failed.');
    } catch {
      setScenarioNarrative('Failed to generate narrative. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const allSignals = [...signalList].sort((a, b) => b.weight - a.weight);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-dim)', marginBottom: 6 }}>
          SIMULATOR
        </div>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          What-if scenario modeling — toggle risk factors to see score impact in real time.
        </p>
      </div>

      {/* Baseline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '16px 20px',
          border: '1px solid rgba(6,182,212,0.08)',
          borderRadius: 4,
          background: '#00080f',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 4 }}>
            BASELINE SCORE
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 28, fontWeight: 700, color: riskColor(baselineLevel) }}>
              {baselineScore}
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: riskColor(baselineLevel), letterSpacing: '0.1em' }}>
              / {baselineLevel}
            </span>
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: 'rgba(6,182,212,0.08)', flexShrink: 0 }} />

        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 4 }}>
            SIMULATED SCORE
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontSize: 28,
                fontWeight: 700,
                color: riskColor(simulatedLevel),
                transition: 'color 0.3s ease',
              }}
            >
              {simulatedScore}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                color: riskColor(simulatedLevel),
                letterSpacing: '0.1em',
                transition: 'color 0.3s ease',
              }}
            >
              / {simulatedLevel}
            </span>
            {scoreChanged && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  color: simulatedScore > baselineScore ? '#ff3b3b' : '#06b6d4',
                  letterSpacing: '0.08em',
                  marginLeft: 4,
                }}
              >
                ({simulatedScore > baselineScore ? '+' : ''}{simulatedScore - baselineScore})
              </span>
            )}
          </div>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={reset}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 3,
              padding: '5px 12px',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.18)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            RESET TO ACTUAL
          </button>
        </div>
      </div>

      {/* Toggle panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr auto',
            gap: '0 16px',
            padding: '6px 16px',
            borderBottom: '1px solid rgba(6,182,212,0.05)',
          }}
        >
          {['', 'SIGNAL', 'PTS'].map(h => (
            <div key={h} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.18em', color: 'var(--text-dim)' }}>
              {h}
            </div>
          ))}
        </div>

        {allSignals.map(sig => {
          const on = active.has(sig.name);
          const meta = SIGNAL_META[sig.name] ?? { label: sig.name, description: '' };
          return (
            <div
              key={sig.name}
              onClick={() => toggle(sig.name)}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                gap: '0 16px',
                alignItems: 'center',
                padding: '12px 16px',
                cursor: 'pointer',
                borderRadius: 3,
                transition: 'background 0.15s',
                background: on ? 'rgba(6,182,212,0.03)' : 'transparent',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = on ? 'rgba(6,182,212,0.05)' : 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = on ? 'rgba(6,182,212,0.03)' : 'transparent'; }}
            >
              {/* Toggle switch */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: 32,
                    height: 16,
                    borderRadius: 8,
                    background: on ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.08)',
                    border: `1px solid ${on ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    position: 'relative',
                    transition: 'background 0.2s, border-color 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: on ? 16 : 2,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: on ? '#06b6d4' : '#1e4d5c',
                      transition: 'left 0.2s, background 0.2s',
                      boxShadow: on ? '0 0 6px rgba(6,182,212,0.6)' : 'none',
                    }}
                  />
                </div>
              </div>

              {/* Signal info */}
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: on ? 'var(--text-primary)' : 'var(--text-dim)',
                    transition: 'color 0.2s',
                    marginBottom: 2,
                  }}
                >
                  {meta.label}
                </div>
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  {meta.description}
                </div>
              </div>

              {/* Points */}
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: on ? '#ff8c00' : '#1e4d5c',
                  transition: 'color 0.2s',
                  textAlign: 'right',
                  minWidth: 36,
                }}
              >
                +{sig.weight}
              </div>
            </div>
          );
        })}
      </div>

      {/* Generate button */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          onClick={generateScenarioNarrative}
          disabled={generating}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 3,
            padding: '10px 20px',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: generating ? 'var(--text-dim)' : '#06b6d4',
            cursor: generating ? 'wait' : 'pointer',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { if (!generating) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.06)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          {generating ? 'GENERATING...' : 'GENERATE SCENARIO NARRATIVE →'}
        </button>

        {scenarioNarrative && (
          <div
            style={{
              padding: '16px 20px',
              border: '1px solid rgba(6,182,212,0.15)',
              borderRadius: 4,
              background: 'rgba(6,182,212,0.03)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(6,182,212,0.5)', marginBottom: 10 }}>
              SCENARIO NARRATIVE — SIMULATED CONDITIONS
            </div>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
              {scenarioNarrative}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
