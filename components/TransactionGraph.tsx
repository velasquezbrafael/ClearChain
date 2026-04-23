'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import type { WalletTransaction } from '@/types';
import InfoTooltip from '@/components/InfoTooltip';
import { getLabel } from '@/lib/labels';
import { formatETH } from '@/lib/utils';

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
  hopLevel: 0 | 1 | 2;
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
  hopLevel: 1 | 2;
}

type NodeTooltip = {
  kind: 'node';
  address: string;
  volume: number;
  flags: string[];
  hopLevel: 0 | 1 | 2;
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

interface SelectedNode {
  address: string;
  volume: number;
  isMixer: boolean;
  isHighRisk: boolean;
  hopLevel: 0 | 1 | 2;
  txCount: number;
  totalETH: number;
}

interface HopEntry {
  address: string;
  transactions: WalletTransaction[];
}

function nodeColor(n: GraphNode): string {
  if (n.isQueried) return '#00ff88';
  if (n.isMixer) return '#ef4444';
  if (n.isHighRisk) return '#f97316';
  if (n.hopLevel === 2) return '#3d4a5c';
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

function buildGraphData(
  transactions: WalletTransaction[],
  queriedAddress: string,
  hopData: HopEntry[] | undefined,
  hopDepth: 1 | 2,
) {
  const queried = queriedAddress.toLowerCase();
  const volMap = new Map<string, number>();

  for (const tx of transactions) {
    const f = tx.from.toLowerCase();
    const t = tx.to.toLowerCase();
    if (f !== t) {
      volMap.set(f, (volMap.get(f) ?? 0) + tx.value);
      volMap.set(t, (volMap.get(t) ?? 0) + tx.value);
    }
  }

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
      linkMap.set(key, { source: f, target: t, value: tx.value, hash: tx.hash, timestamp: tx.timestamp, count: 1, hopLevel: 1 });
    }
  }

  const hop1Addrs = new Set<string>();
  for (const [id] of volMap) {
    if (id !== queried) hop1Addrs.add(id);
  }

  if (hopDepth === 2 && hopData && hopData.length > 0) {
    for (const entry of hopData) {
      const hop1Addr = entry.address.toLowerCase();
      if (!hop1Addrs.has(hop1Addr)) continue;
      for (const tx of entry.transactions) {
        const f = tx.from.toLowerCase();
        const t = tx.to.toLowerCase();
        if (f === t) continue;
        const isHop2From = !volMap.has(f) && f !== queried;
        const isHop2To = !volMap.has(t) && t !== queried;
        if (isHop2From) volMap.set(f, (volMap.get(f) ?? 0) + tx.value * 0.5);
        if (isHop2To) volMap.set(t, (volMap.get(t) ?? 0) + tx.value * 0.5);
        if (isHop2From || isHop2To) {
          const key = `hop2|||${f}|||${t}`;
          if (!linkMap.has(key)) {
            linkMap.set(key, { source: f, target: t, value: tx.value, hash: tx.hash, timestamp: tx.timestamp, count: 1, hopLevel: 2 });
          }
        }
      }
    }
  }

  const nodes: GraphNode[] = Array.from(volMap.entries()).map(([id, volume]) => {
    const isHop1 = hop1Addrs.has(id);
    const hopLevel: 0 | 1 | 2 = id === queried ? 0 : isHop1 ? 1 : 2;
    return {
      id,
      volume,
      isQueried: id === queried,
      isMixer: MIXER_ADDRESSES.has(id),
      isHighRisk: HIGH_RISK_ADDRESSES.has(id),
      hopLevel,
    };
  });

  const links: GraphLink[] = Array.from(linkMap.values());
  return { nodes, links, hop1Addrs };
}

interface BuildGraphParams {
  svgEl: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  W: number;
  H: number;
  nodes: GraphNode[];
  links: GraphLink[];
  queriedAddress: string;
  hopDepth: 1 | 2;
  onTooltip: React.Dispatch<React.SetStateAction<TooltipData>>;
  containerEl: HTMLDivElement;
  onNodeClick?: (node: GraphNode) => void;
}

function initD3Graph({
  svgEl, W, H, nodes, links, queriedAddress, hopDepth,
  onTooltip, containerEl, onNodeClick,
}: BuildGraphParams): () => void {
  svgEl.selectAll('*').remove();

  const queried = queriedAddress.toLowerCase();
  const allVols = nodes.map(n => n.volume);
  const minVol = Math.min(...allVols);
  const maxVol = Math.max(...allVols);
  const rScale = d3.scaleSqrt().domain([minVol, maxVol]).range([7, 28]).clamp(true);

  const allVals = links.map(l => l.value);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const wScale = d3.scaleLinear().domain([minVal, maxVal]).range([1.2, 5]).clamp(true);

  // Fix queried node at center
  for (const n of nodes) {
    if (n.isQueried) { n.fx = W / 2; n.fy = H / 2; }
    else { n.fx = null; n.fy = null; }
  }

  const svg = svgEl
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W)
    .attr('height', H);

  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-gray')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 8).attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .append('path').attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', '#6b7280').attr('opacity', 0.7);

  defs.append('marker')
    .attr('id', 'arrow-dim')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 8).attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .append('path').attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', '#3d4a5c').attr('opacity', 0.5);

  const g = svg.append('g');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform.toString());
      onTooltip(null);
    });
  svg.call(zoom);

  const linkEls = g.append('g')
    .selectAll<SVGLineElement, GraphLink>('line')
    .data(links).join('line')
    .attr('stroke', d => d.hopLevel === 2 ? 'rgba(61,74,92,0.5)' : '#6b7280')
    .attr('stroke-opacity', d => d.hopLevel === 2 ? 0.35 : 0.5)
    .attr('stroke-width', d => d.hopLevel === 2 ? 1 : wScale(d.value))
    .attr('stroke-dasharray', d => d.hopLevel === 2 ? '3 3' : 'none')
    .attr('marker-end', d => d.hopLevel === 2 ? 'url(#arrow-dim)' : 'url(#arrow-gray)')
    .style('cursor', 'pointer');

  const nodeG = g.append('g')
    .selectAll<SVGGElement, GraphNode>('g')
    .data(nodes).join('g')
    .style('cursor', onNodeClick ? 'pointer' : 'grab');

  nodeG.append('circle')
    .attr('r', d => d.hopLevel === 2 ? rScale(d.volume) * 0.55 : rScale(d.volume))
    .attr('fill', d => nodeColor(d))
    .attr('fill-opacity', d => d.isQueried ? 1 : d.hopLevel === 2 ? 0.4 : 0.75)
    .attr('stroke', d => d.isQueried ? '#00ff88' : '#0a0a0f')
    .attr('stroke-width', d => d.isQueried ? 3 : 1);

  nodeG.filter(d => d.isQueried).append('circle')
    .attr('r', d => rScale(d.volume) + 8)
    .attr('fill', 'none')
    .attr('stroke', '#00ff88')
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.3);

  nodeG.append('text')
    .text(d => {
      if (d.isQueried) return 'Queried';
      if (d.hopLevel === 2) return rScale(d.volume) * 0.55 >= 10 ? truncateAddr(d.id) : '';
      return rScale(d.volume) >= 12 ? truncateAddr(d.id) : '';
    })
    .attr('font-size', d => d.isQueried ? '11px' : d.hopLevel === 2 ? '8px' : '9px')
    .attr('font-family', 'monospace')
    .attr('fill', d => d.isQueried ? '#00ff88' : d.hopLevel === 2 ? '#4b5563' : '#9ca3af')
    .attr('text-anchor', 'middle')
    .attr('dy', d => {
      const r = d.hopLevel === 2 ? rScale(d.volume) * 0.55 : rScale(d.volume);
      return r + 14;
    })
    .attr('pointer-events', 'none');

  const simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => (d as unknown as GraphLink).hopLevel === 2 ? 80 : 130).strength(0.7))
    .force('charge', d3.forceManyBody<GraphNode>().strength(d => d.hopLevel === 2 ? -150 : -350))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide<GraphNode>().radius(d => {
      const r = d.hopLevel === 2 ? rScale(d.volume) * 0.55 : rScale(d.volume);
      return r + (d.hopLevel === 2 ? 10 : 18);
    }));

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
        const r = (tgt.hopLevel === 2 ? rScale(tgt.volume) * 0.55 : rScale(tgt.volume)) + 6;
        return (tgt.x ?? 0) - (dx / len) * r;
      })
      .attr('y2', d => {
        const src = d.source as GraphNode;
        const tgt = d.target as GraphNode;
        const dx = (tgt.x ?? 0) - (src.x ?? 0);
        const dy = (tgt.y ?? 0) - (src.y ?? 0);
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return tgt.y ?? 0;
        const r = (tgt.hopLevel === 2 ? rScale(tgt.volume) * 0.55 : rScale(tgt.volume)) + 6;
        return (tgt.y ?? 0) - (dy / len) * r;
      });

    nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });

  const drag = d3.drag<SVGGElement, GraphNode>()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      if (!d.isQueried) { d.fx = null; d.fy = null; }
    });

  nodeG.call(drag);

  nodeG
    .on('mouseover', (event: MouseEvent, d: GraphNode) => {
      const rect = containerEl.getBoundingClientRect();
      const flags: string[] = [];
      if (d.isMixer) flags.push('Tornado Cash (OFAC SDN)');
      if (d.isHighRisk) flags.push('High-risk counterparty');
      if (d.hopLevel === 2) flags.push('2nd-hop counterparty');
      onTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        content: { kind: 'node', address: d.id, volume: d.volume, flags, hopLevel: d.hopLevel },
      });
    })
    .on('mousemove', (event: MouseEvent) => {
      const rect = containerEl.getBoundingClientRect();
      onTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    })
    .on('mouseout', () => onTooltip(null))
    .on('click', (_event: MouseEvent, d: GraphNode) => {
      if (onNodeClick) onNodeClick(d);
    });

  linkEls
    .on('mouseover', (event: MouseEvent, d: GraphLink) => {
      const rect = containerEl.getBoundingClientRect();
      onTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        content: { kind: 'edge', hash: d.hash, value: d.value, count: d.count, date: formatDate(d.timestamp) },
      });
    })
    .on('mousemove', (event: MouseEvent) => {
      const rect = containerEl.getBoundingClientRect();
      onTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    })
    .on('mouseout', () => onTooltip(null));

  return () => simulation.stop();
}

interface TransactionGraphProps {
  transactions: WalletTransaction[];
  queriedAddress: string;
  hopData?: HopEntry[];
  onAnalyzeAddress?: (addr: string) => void;
}

export default function TransactionGraph({ transactions, queriedAddress, hopData, onAnalyzeAddress }: TransactionGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<(() => void) | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hopDepth, setHopDepth] = useState<1 | 2>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [mounted, setMounted] = useState(false);

  const fullSvgRef = useRef<SVGSVGElement>(null);
  const fullContainerRef = useRef<HTMLDivElement>(null);
  const fullSimRef = useRef<(() => void) | null>(null);
  const [fullTooltip, setFullTooltip] = useState<TooltipData>(null);
  const [fullContainerWidth, setFullContainerWidth] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  // Card graph
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || transactions.length === 0) return;
    if (isFullscreen) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    setContainerWidth(W);
    const H = 480;

    const { nodes, links } = buildGraphData(transactions, queriedAddress, hopData, hopDepth);
    if (nodes.length === 0) return;

    if (simRef.current) simRef.current();
    simRef.current = initD3Graph({
      svgEl: d3.select(svgRef.current),
      W, H, nodes, links,
      queriedAddress, hopDepth,
      onTooltip: setTooltip,
      containerEl: container,
    });

    return () => { if (simRef.current) { simRef.current(); simRef.current = null; } };
  }, [transactions, queriedAddress, hopData, hopDepth, isFullscreen]);

  // Fullscreen graph — rAF so the portal has painted before D3 measures dimensions
  useEffect(() => {
    if (!isFullscreen || transactions.length === 0) return;

    let raf: number;
    raf = requestAnimationFrame(() => {
      if (!fullSvgRef.current || !fullContainerRef.current) return;

      const container = fullContainerRef.current;
      const rect = container.getBoundingClientRect();
      const W = rect.width || container.clientWidth;
      const H = rect.height || container.clientHeight;
      if (W === 0 || H === 0) return;

      setFullContainerWidth(W);

      const { nodes, links } = buildGraphData(transactions, queriedAddress, hopData, hopDepth);
      if (nodes.length === 0) return;

      if (fullSimRef.current) fullSimRef.current();
      fullSimRef.current = initD3Graph({
        svgEl: d3.select(fullSvgRef.current),
        W, H, nodes, links,
        queriedAddress, hopDepth,
        onTooltip: setFullTooltip,
        containerEl: container,
        onNodeClick: (node) => {
          const addr = node.id.toLowerCase();
          const txCount = transactions.filter(tx =>
            tx.from.toLowerCase() === addr || tx.to.toLowerCase() === addr
          ).length;
          const totalETH = transactions
            .filter(tx => tx.from.toLowerCase() === addr || tx.to.toLowerCase() === addr)
            .reduce((sum, tx) => sum + tx.value, 0);
          setSelectedNode({
            address: node.id,
            volume: node.volume,
            isMixer: node.isMixer,
            isHighRisk: node.isHighRisk,
            hopLevel: node.hopLevel,
            txCount,
            totalETH,
          });
        },
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      if (fullSimRef.current) { fullSimRef.current(); fullSimRef.current = null; }
    };
  }, [isFullscreen, transactions, queriedAddress, hopData, hopDepth]);

  // Esc to close fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setIsFullscreen(false); setSelectedNode(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const hasHopData = hopData && hopData.length > 0;

  // Stats for fullscreen summary panel
  const hop1Count = (() => {
    const queried = queriedAddress.toLowerCase();
    const addrs = new Set<string>();
    for (const tx of transactions) {
      const f = tx.from.toLowerCase();
      const t = tx.to.toLowerCase();
      if (f !== queried) addrs.add(f);
      if (t !== queried) addrs.add(t);
    }
    return addrs.size;
  })();

  const highRiskCount = (() => {
    const addrs = new Set<string>();
    for (const tx of transactions) {
      const f = tx.from.toLowerCase();
      const t = tx.to.toLowerCase();
      if (MIXER_ADDRESSES.has(f) || HIGH_RISK_ADDRESSES.has(f)) addrs.add(f);
      if (MIXER_ADDRESSES.has(t) || HIGH_RISK_ADDRESSES.has(t)) addrs.add(t);
    }
    return addrs.size;
  })();

  const totalETHFlow = transactions.reduce((sum, tx) => sum + tx.value, 0);

  const legend = [
    { color: '#00ff88', label: 'QUERIED' },
    { color: '#ff3b3b', label: 'OFAC/MIXER' },
    { color: '#ff8c00', label: 'HIGH RISK' },
    { color: '#4b5563', label: 'HOP 1' },
    ...(hopDepth === 2 ? [{ color: '#3d4a5c', label: 'HOP 2' }] : []),
  ];

  function renderTooltipContent(tt: TooltipData, cWidth: number) {
    if (!tt) return null;
    return (
      <div
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 20,
          background: '#0d1220',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '10px 14px',
          left: Math.min(tt.x + 14, (cWidth || 9999) - 230),
          top: Math.max(tt.y - 48, 8),
          minWidth: 210,
        }}
      >
        {tt.content.kind === 'node' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.08em', color: '#00ff88' }}>
              {tt.content.address.toLowerCase() === queriedAddress.toLowerCase()
                ? 'QUERIED WALLET'
                : tt.content.hopLevel === 2 ? '2ND HOP' : 'COUNTERPARTY'}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {tt.content.address}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>
              {formatETH(tt.content.volume)}
            </div>
            {tt.content.flags.map(f => (
              <div key={f} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: f.includes('2nd') ? '#6b7280' : '#ff3b3b' }}>
                {f}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              TXN{tt.content.count > 1 ? `S (${tt.content.count})` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {tt.content.hash.slice(0, 20)}...
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>
              {formatETH(tt.content.value)}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              {tt.content.date}
            </div>
          </div>
        )}
      </div>
    );
  }

  const hopToggle = (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      {([1, 2] as const).map(depth => (
        <button
          key={depth}
          onClick={() => setHopDepth(depth)}
          style={{
            padding: '5px 12px',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            background: hopDepth === depth ? 'rgba(0,255,136,0.12)' : 'transparent',
            color: hopDepth === depth ? '#00ff88' : 'var(--text-dim)',
            borderRight: depth === 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
          }}
        >
          {depth} HOP{depth === 2 ? 'S' : ''}
        </button>
      ))}
    </div>
  );

  // Fullscreen portal
  const fullscreenPortal = mounted && isFullscreen
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: '#03040a',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              height: 52,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              gap: 16,
            }}
          >
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
              TRANSACTION GRAPH
              <span style={{ marginLeft: 16, color: 'var(--text-secondary)', letterSpacing: 0, fontFamily: 'var(--font-inter)', fontSize: 12 }}>
                {queriedAddress.slice(0, 10)}...{queriedAddress.slice(-8)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {hasHopData && hopToggle}
              <button
                onClick={() => { setIsFullscreen(false); setSelectedNode(null); }}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 3,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f0f4ff'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
              >
                ESC / CLOSE
              </button>
            </div>
          </div>

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* Graph — 75% */}
            <div
              ref={fullContainerRef}
              style={{ position: 'relative', flex: '0 0 75%', borderRight: '1px solid rgba(255,255,255,0.06)' }}
            >
              <svg ref={fullSvgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {renderTooltipContent(fullTooltip, fullContainerWidth)}
            </div>

            {/* Detail panel — 25% */}
            <div
              style={{
                flex: '0 0 25%',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                padding: 24,
                gap: 20,
              }}
            >
              {selectedNode ? (
                <>
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 12 }}>
                      SELECTED NODE
                    </div>

                    {/* Address */}
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>ADDRESS</div>
                    <div
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 11,
                        color: selectedNode.isMixer ? '#ff3b3b' : selectedNode.isHighRisk ? '#ff8c00' : selectedNode.hopLevel === 0 ? '#00ff88' : 'var(--text-secondary)',
                        wordBreak: 'break-all',
                        lineHeight: 1.5,
                        marginBottom: 16,
                      }}
                    >
                      {selectedNode.address}
                    </div>

                    {/* Label */}
                    {(() => {
                      const lbl = getLabel(selectedNode.address);
                      return lbl ? (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>LABEL</div>
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono)',
                              fontSize: 10,
                              padding: '3px 8px',
                              borderRadius: 2,
                              background: lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.1)' : lbl.category === 'exchange' ? 'rgba(0,255,136,0.08)' : 'rgba(255,140,0,0.08)',
                              color: lbl.category === 'sanctioned' ? '#ff3b3b' : lbl.category === 'exchange' ? '#00ff88' : '#ff8c00',
                              border: `1px solid ${lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.2)' : lbl.category === 'exchange' ? 'rgba(0,255,136,0.15)' : 'rgba(255,140,0,0.15)'}`,
                            }}
                          >
                            {lbl.label}
                          </span>
                        </div>
                      ) : null;
                    })()}

                    {/* Classification */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>CLASSIFICATION</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {selectedNode.hopLevel === 0 ? 'Queried Wallet' : selectedNode.hopLevel === 1 ? 'Direct Counterparty (Hop 1)' : '2nd-Hop Counterparty (Hop 2)'}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>TXN COUNT</div>
                        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.txCount}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>TOTAL ETH</div>
                        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatETH(selectedNode.totalETH)}</div>
                      </div>
                    </div>

                    {/* Risk flags */}
                    {(selectedNode.isMixer || selectedNode.isHighRisk) && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 8 }}>RISK FLAGS</div>
                        {selectedNode.isMixer && (
                          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff3b3b', padding: '4px 0', borderBottom: '1px solid rgba(255,59,59,0.15)' }}>
                            OFAC SDN — Tornado Cash
                          </div>
                        )}
                        {selectedNode.isHighRisk && !selectedNode.isMixer && (
                          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff8c00', padding: '4px 0', borderBottom: '1px solid rgba(255,140,0,0.15)' }}>
                            HIGH RISK — Known malicious address
                          </div>
                        )}
                      </div>
                    )}

                    {/* Etherscan link */}
                    {selectedNode.hopLevel !== 0 && (
                      <a
                        href={`https://etherscan.io/address/${selectedNode.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          color: 'var(--text-dim)',
                          textDecoration: 'none',
                          padding: '6px 10px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 3,
                          transition: 'color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#00ff88'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(0,255,136,0.3)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                      >
                        VIEW ON ETHERSCAN
                      </a>
                    )}

                    {/* Analyze drill-down */}
                    {onAnalyzeAddress && selectedNode.hopLevel !== 0 && (
                      <button
                        onClick={() => {
                          setIsFullscreen(false);
                          setSelectedNode(null);
                          onAnalyzeAddress(selectedNode.address);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          color: '#00ff88',
                          background: 'rgba(0,255,136,0.08)',
                          border: '1px solid rgba(0,255,136,0.25)',
                          borderRadius: 3,
                          padding: '6px 10px',
                          cursor: 'pointer',
                          transition: 'background 0.15s, border-color 0.15s',
                          marginTop: 4,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,136,0.14)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,136,0.4)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,255,136,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,136,0.25)'; }}
                      >
                        ANALYZE THIS WALLET →
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* Summary panel when no node selected */
                <>
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 16 }}>
                      GRAPH SUMMARY
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {[
                        { label: 'QUERIED WALLET', value: `${queriedAddress.slice(0, 8)}...${queriedAddress.slice(-6)}`, color: '#00ff88' },
                        { label: 'DIRECT COUNTERPARTIES', value: hop1Count, color: 'var(--text-primary)' },
                        { label: 'HIGH-RISK CONNECTIONS', value: highRiskCount, color: highRiskCount > 0 ? '#ff3b3b' : 'var(--text-primary)' },
                        { label: 'TOTAL ETH FLOW', value: formatETH(totalETHFlow), color: 'var(--text-primary)' },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color, wordBreak: 'break-all' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      padding: '12px 14px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 4,
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      lineHeight: 1.6,
                    }}
                  >
                    Click any node to inspect it
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bottom bar — legend + stats */}
          <div
            style={{
              height: 40,
              flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {legend.map(({ color, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}88`, flexShrink: 0, opacity: label === 'HOP 2' ? 0.5 : 1 }} />
                  {label}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              {transactions.length} TXN{transactions.length !== 1 ? 'S' : ''} &nbsp;·&nbsp; {hop1Count} COUNTERPART{hop1Count !== 1 ? 'IES' : 'Y'} &nbsp;·&nbsp; {highRiskCount > 0 ? <span style={{ color: '#ff3b3b' }}>{highRiskCount} OFAC</span> : '0 OFAC'}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {fullscreenPortal}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  color: 'var(--text-dim)',
                  marginBottom: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                TRANSACTION GRAPH
                <InfoTooltip text="Each dot is a unique wallet that transacted with this address. Green = queried wallet. Red = OFAC-sanctioned or known mixer. Orange = high-risk. Drag nodes, scroll to zoom." />
              </div>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                Force-directed — drag nodes, scroll to zoom
              </p>
            </div>

            {hasHopData && hopToggle}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {legend.map(({ color, label }) => (
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
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}88`, flexShrink: 0, opacity: label === 'HOP 2' ? 0.5 : 1 }} />
                {label}
              </span>
            ))}

            {/* Expand button */}
            <button
              onClick={() => { setIsFullscreen(true); setSelectedNode(null); }}
              title="Fullscreen graph"
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 3,
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: 12,
                lineHeight: 1,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00ff88'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,136,0.3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              ⛶
            </button>
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
          {renderTooltipContent(tooltip, containerWidth)}
        </div>
      </div>
    </>
  );
}
