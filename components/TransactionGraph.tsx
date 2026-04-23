'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
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

interface GraphNode {
  id: string;
  volume: number;
  isQueried: boolean;
  isMixer: boolean;
  isHighRisk: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  hash: string;
  timestamp: number;
  count: number;
}

type NodeTooltip = {
  kind: 'node';
  address: string;
  volume: number;
  flags: string[];
};

type EdgeTooltip = {
  kind: 'edge';
  hash: string;
  value: number;
  count: number;
  date: string;
};

type TooltipData = {
  x: number;
  y: number;
  content: NodeTooltip | EdgeTooltip;
} | null;

function nodeColor(n: GraphNode): string {
  if (n.isQueried) return '#00ff88';
  if (n.isMixer) return '#ef4444';
  if (n.isHighRisk) return '#f97316';
  return '#4b5563';
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface TransactionGraphProps {
  transactions: WalletTransaction[];
  queriedAddress: string;
}

export default function TransactionGraph({ transactions, queriedAddress }: TransactionGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll('*').remove();
    if (simRef.current) simRef.current.stop();

    if (transactions.length === 0) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    setContainerWidth(W);
    const H = 480;

    const queried = queriedAddress.toLowerCase();

    // Build volume map
    const volMap = new Map<string, number>();
    for (const tx of transactions) {
      const f = tx.from.toLowerCase();
      const t = tx.to.toLowerCase();
      if (f !== t) {
        volMap.set(f, (volMap.get(f) ?? 0) + tx.value);
        volMap.set(t, (volMap.get(t) ?? 0) + tx.value);
      }
    }

    // Build aggregated links (merge parallel edges)
    const linkMap = new Map<string, GraphLink>();
    for (const tx of transactions) {
      const f = tx.from.toLowerCase();
      const t = tx.to.toLowerCase();
      if (f === t) continue;
      const key = `${f}|||${t}`;
      const existing = linkMap.get(key);
      if (existing) {
        existing.value += tx.value;
        existing.count += 1;
      } else {
        linkMap.set(key, {
          source: f,
          target: t,
          value: tx.value,
          hash: tx.hash,
          timestamp: tx.timestamp,
          count: 1,
        });
      }
    }

    const nodes: GraphNode[] = Array.from(volMap.entries()).map(([id, volume]) => ({
      id,
      volume,
      isQueried: id === queried,
      isMixer: MIXER_ADDRESSES.has(id),
      isHighRisk: HIGH_RISK_ADDRESSES.has(id),
      ...(id === queried ? { fx: W / 2, fy: H / 2 } : {}),
    }));

    const links: GraphLink[] = Array.from(linkMap.values());

    const allVols = nodes.map(n => n.volume);
    const minVol = Math.min(...allVols);
    const maxVol = Math.max(...allVols);
    const rScale = d3.scaleSqrt().domain([minVol, maxVol]).range([7, 28]).clamp(true);

    const allVals = links.map(l => l.value);
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const wScale = d3.scaleLinear().domain([minVal, maxVal]).range([1.2, 5]).clamp(true);

    const svg = svgEl
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', W)
      .attr('height', H);

    // Defs — arrowhead marker
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow-gray')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#6b7280')
      .attr('opacity', 0.7);

    // Zoom group
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setTooltip(null);
      });

    svg.call(zoom);

    // Links
    const linkEls = g.append('g')
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#6b7280')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', d => wScale(d.value))
      .attr('marker-end', 'url(#arrow-gray)')
      .style('cursor', 'pointer');

    // Node groups
    const nodeG = g.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab');

    nodeG.append('circle')
      .attr('r', d => rScale(d.volume))
      .attr('fill', d => nodeColor(d))
      .attr('fill-opacity', d => d.isQueried ? 1 : 0.75)
      .attr('stroke', d => d.isQueried ? '#00ff88' : '#0a0a0f')
      .attr('stroke-width', d => d.isQueried ? 3 : 1);

    // Pulse ring for queried node
    nodeG.filter(d => d.isQueried).append('circle')
      .attr('r', d => rScale(d.volume) + 8)
      .attr('fill', 'none')
      .attr('stroke', '#00ff88')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.3);

    nodeG.append('text')
      .text(d => d.isQueried ? 'Queried' : (rScale(d.volume) >= 12 ? truncateAddr(d.id) : ''))
      .attr('font-size', d => d.isQueried ? '11px' : '9px')
      .attr('font-family', 'monospace')
      .attr('fill', d => d.isQueried ? '#00ff88' : '#9ca3af')
      .attr('text-anchor', 'middle')
      .attr('dy', d => rScale(d.volume) + 14)
      .attr('pointer-events', 'none');

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(130).strength(0.7))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-350))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => rScale(d.volume) + 18));

    simRef.current = simulation;

    simulation.on('tick', () => {
      linkEls
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => {
          const src = d.source as GraphNode;
          const tgt = d.target as GraphNode;
          const dx = (tgt.x ?? 0) - (src.x ?? 0);
          const dy = (tgt.y ?? 0) - (src.y ?? 0);
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return tgt.x ?? 0;
          const r = rScale(tgt.volume) + 6;
          return (tgt.x ?? 0) - (dx / len) * r;
        })
        .attr('y2', d => {
          const src = d.source as GraphNode;
          const tgt = d.target as GraphNode;
          const dx = (tgt.x ?? 0) - (src.x ?? 0);
          const dy = (tgt.y ?? 0) - (src.y ?? 0);
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return tgt.y ?? 0;
          const r = rScale(tgt.volume) + 6;
          return (tgt.y ?? 0) - (dy / len) * r;
        });

      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Drag
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (!d.isQueried) {
          d.fx = null;
          d.fy = null;
        }
      });

    nodeG.call(drag);

    // Node tooltips
    nodeG
      .on('mouseover', (event: MouseEvent, d: GraphNode) => {
        const rect = container.getBoundingClientRect();
        const flags: string[] = [];
        if (d.isMixer) flags.push('Tornado Cash (OFAC SDN)');
        if (d.isHighRisk) flags.push('High-risk counterparty');
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          content: { kind: 'node', address: d.id, volume: d.volume, flags },
        });
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        setTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on('mouseout', () => setTooltip(null));

    // Edge tooltips
    linkEls
      .on('mouseover', (event: MouseEvent, d: GraphLink) => {
        const rect = container.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          content: { kind: 'edge', hash: d.hash, value: d.value, count: d.count, date: formatDate(d.timestamp) },
        });
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        setTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on('mouseout', () => setTooltip(null));

    return () => {
      simulation.stop();
    };
  }, [transactions, queriedAddress]);

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        background: '#080b14',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: 'var(--text-dim)',
              marginBottom: 3,
            }}
          >
            TRANSACTION GRAPH
          </div>
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Force-directed — drag nodes, scroll to zoom
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {[
            { color: '#00ff88', label: 'QUERIED' },
            { color: '#ff3b3b', label: 'OFAC/MIXER' },
            { color: '#ff8c00', label: 'HIGH RISK' },
            { color: '#3d4a5c', label: 'UNKNOWN' },
          ].map(({ color, label }) => (
            <span
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 6px ${color}88`,
                  flexShrink: 0,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 500 }}>
        {transactions.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
            }}
          >
            NO TRANSACTIONS TO GRAPH
          </div>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              zIndex: 20,
              background: '#0d1220',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '10px 14px',
              left: Math.min(tooltip.x + 14, (containerWidth || 9999) - 230),
              top: Math.max(tooltip.y - 48, 8),
              minWidth: 210,
            }}
          >
            {tooltip.content.kind === 'node' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.08em', color: '#00ff88' }}>
                  {tooltip.content.address.toLowerCase() === queriedAddress.toLowerCase()
                    ? 'QUERIED WALLET'
                    : 'COUNTERPARTY'}
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {tooltip.content.address}
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>
                  {tooltip.content.volume.toFixed(4)} ETH
                </div>
                {tooltip.content.flags.length > 0 &&
                  tooltip.content.flags.map(f => (
                    <div key={f} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff3b3b' }}>
                      {f}
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                  TXN{tooltip.content.count > 1 ? `S (${tooltip.content.count})` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {tooltip.content.hash.slice(0, 20)}...
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>
                  {tooltip.content.value.toFixed(4)} ETH
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                  {tooltip.content.date}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
