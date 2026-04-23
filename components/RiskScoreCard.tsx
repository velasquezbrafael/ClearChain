'use client';

import type { RiskScore, OFACResult, RiskLevel, ScoringSignal } from '@/types';

function riskPalette(level: RiskLevel) {
  switch (level) {
    case 'CRITICAL': return { stroke: '#ef4444', text: '#ef4444', badge: 'rgba(127,29,29,0.4)', badgeBorder: '#7f1d1d', badgeText: '#fca5a5' };
    case 'HIGH':     return { stroke: '#f97316', text: '#f97316', badge: 'rgba(124,45,18,0.4)', badgeBorder: '#7c2d12', badgeText: '#fdba74' };
    case 'MEDIUM':   return { stroke: '#eab308', text: '#eab308', badge: 'rgba(113,63,18,0.4)', badgeBorder: '#713f12', badgeText: '#fde047' };
    default:         return { stroke: '#00ff88', text: '#00ff88', badge: 'rgba(6,78,59,0.4)',   badgeBorder: '#064e3b', badgeText: '#6ee7b7' };
  }
}

const SIGNAL_LABELS: Record<string, string> = {
  ofac_match: 'OFAC Match',
  mixer_interaction: 'Mixer Interaction',
  rapid_fund_movement: 'Rapid Fund Movement',
  high_risk_counterparty: 'High-Risk Counterparty',
  volume_anomaly: 'Volume Anomaly',
  community_red_flags: 'Community Red Flags',
};

function formatSignalName(name: string): string {
  return SIGNAL_LABELS[name] ?? name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function ScoreGauge({ total, level }: { total: number; level: RiskLevel }) {
  const palette = riskPalette(level);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, total));
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 176, height: 176 }}>
      <svg width={176} height={176} viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        {/* Track */}
        <circle cx="80" cy="80" r={radius} fill="none" strokeWidth="12" stroke="#1a1a24" />
        {/* Glow effect */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none" strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          stroke={palette.stroke}
          filter="url(#glow)"
          opacity="0.3"
        />
        {/* Main arc */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none" strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          stroke={palette.stroke}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      {/* Score number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black tabular-nums leading-none" style={{ fontSize: 48, color: palette.text, fontFamily: 'monospace' }}>
          {total}
        </span>
        <span className="text-xs font-mono mt-1" style={{ color: '#4b5563' }}>/ 100</span>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: ScoringSignal }) {
  return (
    <tr style={signal.triggered ? { background: 'rgba(0,255,136,0.03)' } : undefined}>
      <td className="px-3 py-2.5 w-8 text-center">
        {signal.triggered ? (
          <span className="font-bold text-sm" style={{ color: '#00ff88' }}>✓</span>
        ) : (
          <span className="text-sm" style={{ color: '#374151' }}>✗</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: signal.triggered ? '#e2e8f0' : '#4b5563' }}>
        {formatSignalName(signal.name)}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-right whitespace-nowrap font-mono">
        {signal.triggered ? (
          <span style={{ color: '#f97316' }}>+{signal.score}</span>
        ) : (
          <span style={{ color: '#374151' }}>+0</span>
        )}
        <span className="ml-1 text-[10px]" style={{ color: '#374151' }}>/ {signal.weight}</span>
      </td>
      <td className="px-3 py-2.5 text-xs max-w-xs" style={{ color: '#6b7280' }}>
        <span title={signal.detail} className="line-clamp-2">{signal.detail}</span>
      </td>
    </tr>
  );
}

interface RiskScoreCardProps {
  riskScore: RiskScore;
  ofacResult: OFACResult;
}

export default function RiskScoreCard({ riskScore }: RiskScoreCardProps) {
  const { total, level, signals } = riskScore;
  const palette = riskPalette(level);

  const sortedSignals = [...signals].sort((a, b) => {
    if (a.triggered && !b.triggered) return -1;
    if (!a.triggered && b.triggered) return 1;
    return b.weight - a.weight;
  });

  const riskDescription = {
    CRITICAL: 'Immediate escalation required. Strong indicators of sanctions exposure. SAR filing should be considered.',
    HIGH: 'Significant red flags detected. Enhanced due diligence and source-of-funds inquiry required.',
    MEDIUM: 'Elevated risk indicators present. Enhanced due diligence (EDD) warranted. Monitor for activity.',
    LOW: 'No significant risk indicators detected. Routine monitoring applies.',
  }[level];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}
    >
      <div className="p-6">
        {/* Label */}
        <div className="text-xs font-mono font-semibold tracking-widest mb-5" style={{ color: '#4b5563' }}>
          RISK ASSESSMENT
        </div>

        {/* Gauge + summary row */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-6">
          <div className="flex-shrink-0">
            <ScoreGauge total={total} level={level} />
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div className="space-y-2">
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <span className="text-3xl font-black font-mono tabular-nums" style={{ color: palette.text }}>
                  {total}
                </span>
                <span
                  className="text-xs font-bold font-mono uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: palette.badge, border: `1px solid ${palette.badgeBorder}`, color: palette.badgeText }}
                >
                  {level} RISK
                </span>
              </div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>
              {riskDescription}
            </p>
          </div>
        </div>

        {/* Signal breakdown */}
        <div>
          <div className="text-xs font-mono font-semibold tracking-widest mb-3" style={{ color: '#4b5563' }}>
            SIGNAL BREAKDOWN
          </div>
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #1a1a24' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: '#111118', borderBottom: '1px solid #1a1a24' }}>
                  <th className="px-3 py-2 text-[10px] font-mono font-semibold tracking-wider text-center w-8" style={{ color: '#4b5563' }}>HIT</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-semibold tracking-wider" style={{ color: '#4b5563' }}>SIGNAL</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-semibold tracking-wider text-right" style={{ color: '#4b5563' }}>SCORE</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-semibold tracking-wider" style={{ color: '#4b5563' }}>DETAIL</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid #1a1a24' }}>
                {sortedSignals.map(signal => (
                  <SignalRow key={signal.name} signal={signal} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
