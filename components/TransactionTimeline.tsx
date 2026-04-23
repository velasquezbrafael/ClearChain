'use client';

import { useState } from 'react';
import type { WalletTransaction } from '@/types';

const MIXER_ADDRS = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d',
  '0xd96f2b1c14db8458374d9aca76e26c3950113464',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730',
  '0x23773e65ed146a459667303b90d093cbf37d16cf',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b',
  '0x03893a7c7463ae47d46bc7f091665f1893656003',
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701',
  '0xca0840578f57fe71599d29375e16783424023357',
]);

const HIGH_RISK_ADDRS = new Set([
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47278a68122e1c1d25614bae3641af42',
  '0x53b6936513e738f44fb50d2b9476730c0d3170e2',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b',
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e',
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c',
]);

interface Bucket {
  key: string;       // YYYY-MM
  label: string;     // "Jan '21"
  count: number;
  totalETH: number;
  hasMixer: boolean;
  hasHighRisk: boolean;
  hasRapid: boolean;
}

function buildBuckets(txs: WalletTransaction[]): Bucket[] {
  const map = new Map<string, Bucket>();

  for (const tx of txs) {
    const d = new Date(tx.timestamp * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const shortMonth = d.toLocaleString('en-US', { month: 'short' });
    const label = `${shortMonth} '${String(d.getFullYear()).slice(2)}`;
    const existing = map.get(key) ?? { key, label, count: 0, totalETH: 0, hasMixer: false, hasHighRisk: false, hasRapid: false };
    existing.count++;
    existing.totalETH += tx.value;
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();
    if (MIXER_ADDRS.has(from) || MIXER_ADDRS.has(to)) existing.hasMixer = true;
    if (HIGH_RISK_ADDRS.has(from) || HIGH_RISK_ADDRS.has(to)) existing.hasHighRisk = true;
    map.set(key, existing);
  }

  // detect rapid movement: 3+ outbound within any 24h window, per month
  const outboundByMonth = new Map<string, number[]>();
  for (const tx of txs) {
    if (tx.isInbound === false || (!tx.isInbound && tx.isInbound !== undefined)) {
      const d = new Date(tx.timestamp * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const arr = outboundByMonth.get(key) ?? [];
      arr.push(tx.timestamp);
      outboundByMonth.set(key, arr);
    }
  }
  for (const [key, timestamps] of outboundByMonth) {
    const sorted = [...timestamps].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 2; i++) {
      if (sorted[i + 2] - sorted[i] <= 86400) {
        const b = map.get(key);
        if (b) b.hasRapid = true;
        break;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function barColor(b: Bucket): string {
  if (b.hasMixer || b.hasHighRisk) return '#ff3b3b';
  if (b.hasRapid) return '#ff8c00';
  return '#3d4a5c';
}

function formatETHShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M ETH`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K ETH`;
  return `${v.toFixed(2)} ETH`;
}

interface TooltipState {
  bucket: Bucket;
  x: number;
  y: number;
}

export default function TransactionTimeline({
  transactions,
}: {
  transactions: WalletTransaction[];
}) {
  const buckets = buildBuckets(transactions);
  const [hovered, setHovered] = useState<TooltipState | null>(null);

  if (buckets.length < 3) return null;

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const CHART_H = 80;
  const LABEL_H = 20;
  const TOTAL_H = CHART_H + LABEL_H;
  const BAR_W = Math.min(32, Math.max(6, Math.floor(600 / buckets.length) - 3));
  const GAP = Math.max(2, BAR_W / 4);

  const firstDate = new Date(Math.min(...transactions.map(t => t.timestamp)) * 1000)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const lastDate = new Date(Math.max(...transactions.map(t => t.timestamp)) * 1000)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const totalWidth = buckets.length * (BAR_W + GAP);

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        background: '#080b14',
        padding: '16px 20px',
        marginBottom: 20,
        animation: 'fadeSlideUp 0.5s ease-out both',
        animationDelay: '0.15s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
          ACTIVITY TIMELINE
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', opacity: 0.6 }}>
          {firstDate} — {lastDate}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          {[
            { color: '#ff3b3b', label: 'OFAC/MIXER' },
            { color: '#ff8c00', label: 'RAPID MOVE' },
            { color: '#3d4a5c', label: 'NORMAL' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
              <span style={{ width: 6, height: 6, background: color, borderRadius: 1, flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ position: 'relative', minWidth: totalWidth }}>
          <svg
            width={totalWidth}
            height={TOTAL_H}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* Baseline */}
            <line
              x1={0} y1={CHART_H}
              x2={totalWidth} y2={CHART_H}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />

            {buckets.map((b, i) => {
              const barH = Math.max(2, (b.count / maxCount) * (CHART_H - 8));
              const x = i * (BAR_W + GAP);
              const y = CHART_H - barH;
              const color = barColor(b);
              const isHov = hovered?.bucket.key === b.key;

              return (
                <g key={b.key}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    fill={color}
                    opacity={isHov ? 1 : 0.65}
                    rx={1}
                    style={{ cursor: 'default', transition: 'opacity 0.15s' } as React.CSSProperties}
                    onMouseEnter={e => {
                      const svgEl = (e.target as SVGElement).closest('svg')!;
                      const rect = svgEl.getBoundingClientRect();
                      setHovered({
                        bucket: b,
                        x: rect.left + x + BAR_W / 2,
                        y: rect.top + y,
                      });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  />
                  {/* X-axis label — show every Nth bar to avoid crowding */}
                  {(buckets.length <= 18 || i % Math.ceil(buckets.length / 18) === 0) && (
                    <text
                      x={x + BAR_W / 2}
                      y={CHART_H + 14}
                      textAnchor="middle"
                      fontSize={7}
                      fontFamily="monospace"
                      fill="rgba(61,74,92,0.8)"
                    >
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating tooltip */}
          {hovered && (
            <div
              style={{
                position: 'fixed',
                left: hovered.x,
                top: hovered.y - 10,
                transform: 'translateX(-50%) translateY(-100%)',
                background: '#0d1220',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                padding: '8px 12px',
                pointerEvents: 'none',
                zIndex: 9999,
                minWidth: 140,
              }}
            >
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-primary)', marginBottom: 4 }}>
                {hovered.bucket.label}
              </div>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                <div>{hovered.bucket.count} transaction{hovered.bucket.count !== 1 ? 's' : ''}</div>
                <div>{formatETHShort(hovered.bucket.totalETH)}</div>
                {hovered.bucket.hasMixer && <div style={{ color: '#ff3b3b' }}>OFAC/Mixer interaction</div>}
                {hovered.bucket.hasHighRisk && !hovered.bucket.hasMixer && <div style={{ color: '#ff3b3b' }}>High-risk counterparty</div>}
                {hovered.bucket.hasRapid && <div style={{ color: '#ff8c00' }}>Rapid fund movement</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
