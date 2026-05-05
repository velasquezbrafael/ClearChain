'use client';

import { useState } from 'react';
import type { WalletTransaction } from '@/types';

const MIXER_ADDRESSES = new Set([
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

const HIGH_RISK_ADDRESSES = new Set([
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47278a68122e1c1d25614bae3641af42',
  '0x53b6936513e738f44fb50d2b9476730c0d3170e2',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b',
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e',
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c',
]);

export interface FundFlowHopEntry {
  address: string;
  transactions: WalletTransaction[];
}

export interface FundFlowDiagramProps {
  transactions: WalletTransaction[];
  queriedAddress: string;
  hopData?: FundFlowHopEntry[];
}

interface SourceNode {
  id: string;
  volume: number;
  txCount: number;
  isMixer: boolean;
  isHighRisk: boolean;
}

function truncAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function fmtEth(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ETH`;
  if (v >= 1) return `${v.toFixed(2)} ETH`;
  return `${v.toFixed(4)} ETH`;
}

function nodeColor(n: SourceNode): string {
  if (n.isMixer) return '#ef4444';
  if (n.isHighRisk) return '#f97316';
  return '#4b5563';
}

function ribbonFill(n: SourceNode, hovered = false): string {
  if (n.isMixer) return hovered ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.5)';
  if (n.isHighRisk) return hovered ? 'rgba(249,115,22,0.7)' : 'rgba(249,115,22,0.5)';
  return hovered ? 'rgba(6,182,212,0.5)' : 'rgba(6,182,212,0.25)';
}

export default function FundFlowDiagram({ transactions, queriedAddress, hopData }: FundFlowDiagramProps) {
  const [hoveredRibbon, setHoveredRibbon] = useState<number | null>(null);
  const qAddr = queriedAddress.toLowerCase();

  // Build inbound flows: who sent ETH to queried wallet
  const inMap = new Map<string, { vol: number; cnt: number }>();
  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = (tx.to ?? '').toLowerCase();
    const isIn = tx.isInbound ?? (to === qAddr);
    if (!isIn || tx.value <= 0 || from === qAddr) continue;
    const e = inMap.get(from);
    if (e) { e.vol += tx.value; e.cnt++; }
    else inMap.set(from, { vol: tx.value, cnt: 1 });
  }

  const sources: SourceNode[] = Array.from(inMap.entries())
    .sort((a, b) => b[1].vol - a[1].vol)
    .slice(0, 8)
    .map(([id, d]) => ({
      id,
      volume: d.vol,
      txCount: d.cnt,
      isMixer: MIXER_ADDRESSES.has(id),
      isHighRisk: HIGH_RISK_ADDRESSES.has(id),
    }));

  if (sources.length < 3) {
    return (
      <div style={{
        padding: '40px 32px',
        textAlign: 'center',
        color: '#1e4d5c',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 11,
        letterSpacing: '0.05em',
        lineHeight: 1.8,
      }}>
        <div style={{ marginBottom: 8 }}>INSUFFICIENT DATA</div>
        <div style={{ fontSize: 10 }}>
          Fund flow requires ≥3 distinct inbound sources — found {sources.length}.
          {sources.length === 0 && ' No inbound ETH transactions detected.'}
        </div>
      </div>
    );
  }

  // Identify mixer sources that have hop data (for 3-column layout)
  const mixerSources = sources.filter(s => s.isMixer);
  const has3Col = mixerSources.length > 0 && hopData != null && hopData.length > 0;

  // For 3-column: build 2-hop sources (who sent to the mixer)
  const hopSrcMap = new Map<string, SourceNode>();
  if (has3Col) {
    for (const mixer of mixerSources) {
      const entry = hopData!.find(h => h.address.toLowerCase() === mixer.id);
      if (!entry) continue;
      for (const tx of entry.transactions) {
        const from = tx.from.toLowerCase();
        const to = (tx.to ?? '').toLowerCase();
        if (to !== mixer.id || tx.value <= 0 || from === mixer.id) continue;
        const e = hopSrcMap.get(from);
        if (e) { e.volume += tx.value; }
        else hopSrcMap.set(from, {
          id: from,
          volume: tx.value,
          txCount: 1,
          isMixer: MIXER_ADDRESSES.has(from),
          isHighRisk: HIGH_RISK_ADDRESSES.has(from),
        });
      }
    }
  }

  // Columns
  const leftNodes = has3Col
    ? [
        ...Array.from(hopSrcMap.values()).sort((a, b) => b.volume - a.volume).slice(0, 6),
        ...sources.filter(s => !s.isMixer),
      ]
    : sources;

  const midNodes = has3Col ? mixerSources : [];

  // SVG constants
  const W = 700;
  const VPAD = 28;
  const NODE_W = 120;
  const NODE_GAP = 8;
  const MIN_H = 22;
  const MAX_H = 80;
  const LEFT_X = 10;
  const RIGHT_X = W - 10 - NODE_W;
  const MID_X = has3Col ? Math.round((LEFT_X + NODE_W + RIGHT_X) / 2 - NODE_W / 2) : 0;

  // Compute node heights for a column
  function layoutNodes(nodes: SourceNode[]) {
    const colVol = nodes.reduce((s, n) => s + n.volume, 0) || 1;
    const targetH = Math.max(
      nodes.length * (MIN_H + NODE_GAP),
      Math.min(360, nodes.length * 48),
    );
    const usable = targetH - (nodes.length - 1) * NODE_GAP;
    let ys: number[] = [];
    let curY = VPAD;
    const hs = nodes.map(n => {
      const h = Math.max(MIN_H, Math.min(MAX_H, (n.volume / colVol) * usable));
      return h;
    });
    for (let i = 0; i < nodes.length; i++) {
      ys.push(curY);
      curY += hs[i] + NODE_GAP;
    }
    return { hs, ys, totalH: hs.reduce((s, h) => s + h, 0) + (nodes.length - 1) * NODE_GAP };
  }

  const left = layoutNodes(leftNodes);
  const mid = has3Col ? layoutNodes(midNodes) : { hs: [], ys: [], totalH: 0 };

  const leftTotalH = left.totalH;
  const H = leftTotalH + VPAD * 2;

  // Queried node spans full left column height
  const queriedY = VPAD;
  const queriedH = leftTotalH;
  const totalVol = sources.reduce((s, n) => s + n.volume, 0);

  // Ribbon positions at queried node — packed, proportional to volume
  let qOffset = queriedY;
  type Ribbon = { srcY: number; srcH: number; tgtY: number; tgtH: number; color: string; fill: string; srcRight: number; tgtLeft: number };
  const ribbons: Ribbon[] = [];

  if (!has3Col) {
    // Direct: left sources → queried
    for (let i = 0; i < leftNodes.length; i++) {
      const s = leftNodes[i];
      const ribbonH = Math.max(1, (s.volume / totalVol) * queriedH);
      ribbons.push({
        srcY: left.ys[i],
        srcH: left.hs[i],
        tgtY: qOffset,
        tgtH: ribbonH,
        color: nodeColor(s),
        fill: ribbonFill(s),
        srcRight: LEFT_X + NODE_W,
        tgtLeft: RIGHT_X,
      });
      qOffset += ribbonH;
    }
  } else {
    // Two sets of ribbons:
    // 1. hopSrc nodes → mixer nodes (mid column)
    // 2. non-mixer direct nodes → queried (right column)
    // Then: mixer nodes → queried
    const nonMixerLeftNodes = leftNodes.filter(n => !MIXER_ADDRESSES.has(n.id));
    const hopSrcNodes = leftNodes.filter(n => !nonMixerLeftNodes.includes(n));

    // hop sources → mixer ribbons
    const hopSrcVol = hopSrcNodes.reduce((s, n) => s + n.volume, 0) || 1;
    for (let i = 0; i < hopSrcNodes.length; i++) {
      const s = hopSrcNodes[i];
      const idx = left.ys.indexOf(left.ys[leftNodes.indexOf(s)]);
      const mixerIdx = 0; // all go to first mixer for simplicity
      if (midNodes.length === 0) continue;
      const midRibbonH = Math.max(1, (s.volume / hopSrcVol) * mid.hs[mixerIdx]);
      ribbons.push({
        srcY: left.ys[leftNodes.indexOf(s)],
        srcH: left.hs[leftNodes.indexOf(s)],
        tgtY: mid.ys[mixerIdx] + (mid.hs[mixerIdx] - midRibbonH),
        tgtH: midRibbonH,
        color: nodeColor(s),
        fill: ribbonFill(s),
        srcRight: LEFT_X + NODE_W,
        tgtLeft: MID_X,
      });
    }

    // mixer → queried ribbons
    const mixerVol = midNodes.reduce((s, n) => s + n.volume, 0) || 1;
    for (let i = 0; i < midNodes.length; i++) {
      const m = midNodes[i];
      const ribbonH = Math.max(1, (m.volume / totalVol) * queriedH);
      ribbons.push({
        srcY: mid.ys[i],
        srcH: mid.hs[i],
        tgtY: qOffset,
        tgtH: ribbonH,
        color: nodeColor(m),
        fill: ribbonFill(m),
        srcRight: MID_X + NODE_W,
        tgtLeft: RIGHT_X,
      });
      qOffset += ribbonH;
    }

    // non-mixer direct → queried
    for (const s of nonMixerLeftNodes) {
      const lIdx = leftNodes.indexOf(s);
      const ribbonH = Math.max(1, (s.volume / totalVol) * queriedH);
      ribbons.push({
        srcY: left.ys[lIdx],
        srcH: left.hs[lIdx],
        tgtY: qOffset,
        tgtH: ribbonH,
        color: nodeColor(s),
        fill: ribbonFill(s),
        srcRight: LEFT_X + NODE_W,
        tgtLeft: RIGHT_X,
      });
      qOffset += ribbonH;
    }
  }

  const hasMixer = sources.some(s => s.isMixer);
  const hasHighRisk = sources.some(s => s.isHighRisk);

  return (
    <div>
      {/* Header row: description + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#7ec8d8', letterSpacing: '0.05em' }}>
          inbound ETH · top {sources.length} sources by volume · ribbon width = proportional flow
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {hasMixer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, color: '#1e4d5c' }}>MIXER</span>
            </div>
          )}
          {hasHighRisk && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, color: '#1e4d5c' }}>HIGH RISK</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, color: '#1e4d5c' }}>UNKNOWN</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, color: '#1e4d5c' }}>QUERIED</span>
          </div>
        </div>
      </div>

      {/* SVG diagram */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 420 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Column labels */}
        <text x={LEFT_X + NODE_W / 2} y={VPAD - 10} textAnchor="middle" fill="#1e4d5c" fontSize={7} fontFamily="JetBrains Mono, monospace" letterSpacing="2">
          {has3Col ? '2-HOP SOURCES' : 'SOURCES'}
        </text>
        {has3Col && (
          <text x={MID_X + NODE_W / 2} y={VPAD - 10} textAnchor="middle" fill="#1e4d5c" fontSize={7} fontFamily="JetBrains Mono, monospace" letterSpacing="2">MIXERS</text>
        )}
        <text x={RIGHT_X + NODE_W / 2} y={VPAD - 10} textAnchor="middle" fill="#1e4d5c" fontSize={7} fontFamily="JetBrains Mono, monospace" letterSpacing="2">DESTINATION</text>

        {/* Ribbons */}
        {ribbons.map((r, i) => {
          const cx = (r.srcRight + r.tgtLeft) / 2;
          const isHov = hoveredRibbon === i;
          // Recompute fill with hover flag (ribbonFill baked into r.fill uses non-hover default;
          // derive the source node to get correct hover color)
          const hoverFill = isHov
            ? r.fill.includes('239,68,68') ? 'rgba(239,68,68,0.7)'
              : r.fill.includes('249,115,22') ? 'rgba(249,115,22,0.7)'
              : 'rgba(6,182,212,0.5)'
            : r.fill;
          return (
            <path
              key={i}
              d={[
                `M ${r.srcRight} ${r.srcY}`,
                `C ${cx} ${r.srcY}, ${cx} ${r.tgtY}, ${r.tgtLeft} ${r.tgtY}`,
                `L ${r.tgtLeft} ${r.tgtY + r.tgtH}`,
                `C ${cx} ${r.tgtY + r.tgtH}, ${cx} ${r.srcY + r.srcH}, ${r.srcRight} ${r.srcY + r.srcH}`,
                'Z',
              ].join(' ')}
              fill={hoverFill}
              stroke="none"
              style={{ cursor: 'default', transition: 'fill 0.15s' }}
              onMouseEnter={() => setHoveredRibbon(i)}
              onMouseLeave={() => setHoveredRibbon(null)}
            />
          );
        })}

        {/* Left source nodes */}
        {leftNodes.map((s, i) => {
          const color = nodeColor(s);
          const x = LEFT_X;
          const y = left.ys[i];
          const h = left.hs[i];
          return (
            <g key={s.id + '_left'}>
              <rect x={x} y={y} width={NODE_W} height={h} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1} rx={2} />
              <text
                x={x + NODE_W / 2}
                y={y + (h >= 34 ? h / 2 - 6 : h / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontSize={8}
                fontFamily="JetBrains Mono, monospace"
              >
                {truncAddr(s.id)}
              </text>
              {h >= 34 && (
                <text x={x + NODE_W / 2} y={y + h / 2 + 7} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={7} fontFamily="JetBrains Mono, monospace" opacity={0.65}>
                  {fmtEth(s.volume)}
                </text>
              )}
            </g>
          );
        })}

        {/* Middle mixer nodes */}
        {has3Col && midNodes.map((m, i) => {
          const color = nodeColor(m);
          const x = MID_X;
          const y = mid.ys[i];
          const h = mid.hs[i];
          return (
            <g key={m.id + '_mid'}>
              <rect x={x} y={y} width={NODE_W} height={h} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} rx={2} />
              <text x={x + NODE_W / 2} y={y + (h >= 34 ? h / 2 - 6 : h / 2)} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={8} fontFamily="JetBrains Mono, monospace">
                {truncAddr(m.id)}
              </text>
              {h >= 34 && (
                <text x={x + NODE_W / 2} y={y + h / 2 + 7} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={7} fontFamily="JetBrains Mono, monospace" opacity={0.65}>
                  {fmtEth(m.volume)}
                </text>
              )}
            </g>
          );
        })}

        {/* Queried wallet node */}
        <rect
          x={RIGHT_X}
          y={queriedY}
          width={NODE_W}
          height={queriedH}
          fill="rgba(6,182,212,0.07)"
          stroke="#06b6d4"
          strokeWidth={1.5}
          rx={2}
        />
        <text x={RIGHT_X + NODE_W / 2} y={queriedY + queriedH / 2 - 12} textAnchor="middle" dominantBaseline="middle" fill="#06b6d4" fontSize={8} fontFamily="JetBrains Mono, monospace">
          {truncAddr(queriedAddress)}
        </text>
        <text x={RIGHT_X + NODE_W / 2} y={queriedY + queriedH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="rgba(6,182,212,0.5)" fontSize={7} fontFamily="JetBrains Mono, monospace" letterSpacing="1">
          QUERIED
        </text>
        <text x={RIGHT_X + NODE_W / 2} y={queriedY + queriedH / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="rgba(6,182,212,0.35)" fontSize={7} fontFamily="JetBrains Mono, monospace">
          {fmtEth(totalVol)} in
        </text>
      </svg>
    </div>
  );
}
