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

type BucketMode = 'week' | 'month' | 'quarter' | 'year';

interface Bucket {
  key: string;
  label: string;
  count: number;
  totalETH: number;
  hasMixer: boolean;
  hasHighRisk: boolean;
  hasRapid: boolean;
}

function detectMode(txs: WalletTransaction[]): BucketMode {
  const minTs = Math.min(...txs.map(t => t.timestamp));
  const maxTs = Math.max(...txs.map(t => t.timestamp));
  const spanMonths = (maxTs - minTs) / (30.44 * 24 * 3600);
  if (spanMonths < 6)  return 'week';
  if (spanMonths < 18) return 'month';
  if (spanMonths < 36) return 'quarter';
  return 'year';
}

function getBucketKey(ts: number, mode: BucketMode): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (mode === 'week') {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const my = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const md = String(monday.getDate()).padStart(2, '0');
    return `${my}-${mm}-${md}`;
  }
  if (mode === 'month')   return `${y}-${String(m + 1).padStart(2, '0')}`;
  if (mode === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
  return `${y}`;
}

function getBucketLabel(key: string, mode: BucketMode): string {
  if (mode === 'week') {
    const [y, mo, d] = key.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (mode === 'month') {
    const [y, mo] = key.split('-').map(Number);
    const mon = new Date(y, mo - 1).toLocaleString('en-US', { month: 'short' });
    return `${mon} '${String(y).slice(2)}`;
  }
  if (mode === 'quarter') {
    const [y, q] = key.split('-Q');
    return `Q${q} '${String(y).slice(2)}`;
  }
  return key; // year
}

function modeLabel(mode: BucketMode): string {
  return { week: 'BY WEEK', month: 'BY MONTH', quarter: 'BY QUARTER', year: 'BY YEAR' }[mode];
}

function rapidTimestampSet(txs: WalletTransaction[]): Set<number> {
  const outbound = txs
    .filter(tx => tx.isInbound === false)
    .map(tx => tx.timestamp)
    .sort((a, b) => a - b);
  const rapid = new Set<number>();
  for (let i = 0; i <= outbound.length - 3; i++) {
    if (outbound[i + 2] - outbound[i] <= 86400) {
      rapid.add(outbound[i]);
      rapid.add(outbound[i + 1]);
      rapid.add(outbound[i + 2]);
    }
  }
  return rapid;
}

function buildBuckets(txs: WalletTransaction[], mode: BucketMode): Bucket[] {
  const rapidSet = rapidTimestampSet(txs);
  const map = new Map<string, Bucket>();

  for (const tx of txs) {
    const key   = getBucketKey(tx.timestamp, mode);
    const label = getBucketLabel(key, mode);
    const b = map.get(key) ?? { key, label, count: 0, totalETH: 0, hasMixer: false, hasHighRisk: false, hasRapid: false };
    b.count++;
    b.totalETH += tx.value;
    const from = tx.from.toLowerCase();
    const to   = tx.to.toLowerCase();
    if (MIXER_ADDRS.has(from)    || MIXER_ADDRS.has(to))    b.hasMixer    = true;
    if (HIGH_RISK_ADDRS.has(from) || HIGH_RISK_ADDRS.has(to)) b.hasHighRisk = true;
    if (rapidSet.has(tx.timestamp)) b.hasRapid = true;
    map.set(key, b);
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
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K ETH`;
  return `${v.toFixed(2)} ETH`;
}

interface TooltipState { bucket: Bucket; x: number; y: number; }

export default function TransactionTimeline({ transactions }: { transactions: WalletTransaction[] }) {
  const [hovered, setHovered] = useState<TooltipState | null>(null);

  if (transactions.length < 3) return null;

  const mode    = detectMode(transactions);
  const buckets = buildBuckets(transactions, mode);

  if (buckets.length < 3) return null;

  const maxCount  = Math.max(...buckets.map(b => b.count), 1);
  const CHART_H   = 80;
  const LABEL_H   = 20;
  const TOTAL_H   = CHART_H + LABEL_H;
  const BAR_W     = Math.min(40, Math.max(6, Math.floor(600 / buckets.length) - 3));
  const GAP       = Math.max(2, BAR_W / 4);
  const totalWidth = buckets.length * (BAR_W + GAP);

  const firstDate = new Date(Math.min(...transactions.map(t => t.timestamp)) * 1000)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const lastDate  = new Date(Math.max(...transactions.map(t => t.timestamp)) * 1000)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const labelEvery = buckets.length <= 20 ? 1 : Math.ceil(buckets.length / 20);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
          ACTIVITY TIMELINE
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'rgba(0,255,136,0.4)', padding: '1px 6px', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 2 }}>
          {modeLabel(mode)}
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
          <svg width={totalWidth} height={TOTAL_H} style={{ display: 'block', overflow: 'visible' }}>
            {/* Dotted vertical grid lines */}
            {[0.25, 0.5, 0.75].map(pct => {
              const gx = Math.round(pct * totalWidth);
              return <line key={pct} x1={gx} y1={0} x2={gx} y2={CHART_H} stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="3 4" />;
            })}
            <line x1={0} y1={CHART_H} x2={totalWidth} y2={CHART_H} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

            {buckets.map((b, i) => {
              const barH  = Math.max(2, (b.count / maxCount) * (CHART_H - 8));
              const x     = i * (BAR_W + GAP);
              const y     = CHART_H - barH;
              const color = barColor(b);
              const isHov = hovered?.bucket.key === b.key;

              return (
                <g key={b.key}>
                  <rect
                    x={x} y={y} width={BAR_W} height={barH}
                    fill={color} opacity={isHov ? 1 : 0.65} rx={1}
                    style={{ cursor: 'default', transition: 'opacity 0.15s' } as React.CSSProperties}
                    onMouseEnter={e => {
                      const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                      setHovered({ bucket: b, x: rect.left + x + BAR_W / 2, y: rect.top + y });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  />
                  {i % labelEvery === 0 && (
                    <text x={x + BAR_W / 2} y={CHART_H + 14} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="rgba(61,74,92,0.8)">
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

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
                {hovered.bucket.hasMixer    && <div style={{ color: '#ff3b3b' }}>OFAC/Mixer interaction</div>}
                {hovered.bucket.hasHighRisk && !hovered.bucket.hasMixer && <div style={{ color: '#ff3b3b' }}>High-risk counterparty</div>}
                {hovered.bucket.hasRapid    && <div style={{ color: '#ff8c00' }}>Rapid fund movement</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
