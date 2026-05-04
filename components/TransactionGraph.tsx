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

// ---------------------------------------------------------------------------
// Static graph types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  volume: number;
  isQueried: boolean;
  isMixer: boolean;
  isHighRisk: boolean;
  hopLevel: 0 | 1 | 2;
  x?: number; y?: number; vx?: number; vy?: number;
  fx?: number | null; fy?: number | null; index?: number;
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

type NodeTooltip = { kind: 'node'; address: string; volume: number; flags: string[]; hopLevel: 0 | 1 | 2 };
type EdgeTooltip = { kind: 'edge'; hash: string; value: number; count: number; date: string };
type TooltipData = { x: number; y: number; content: NodeTooltip | EdgeTooltip } | null;

interface SelectedNode {
  address: string; volume: number; isMixer: boolean; isHighRisk: boolean;
  hopLevel: 0 | 1 | 2; txCount: number; totalETH: number;
}

interface HopEntry { address: string; transactions: WalletTransaction[] }

// ---------------------------------------------------------------------------
// Investigation mode types
// ---------------------------------------------------------------------------

type InvNodeState = 'root' | 'unexpanded' | 'loading' | 'expanded' | 'at-limit';

interface InvNode {
  id: string;
  state: InvNodeState;
  depth: number;
  volume: number;
  isMixer: boolean;
  isHighRisk: boolean;
  isOfac: boolean;
  isOverlap?: boolean;
  label: string | null;
  txCount: number;
  x?: number; y?: number; vx?: number; vy?: number;
  fx?: number | null; fy?: number | null; index?: number;
}

interface InvEdge {
  source: string | InvNode;
  target: string | InvNode;
  value: number;
  count: number;
  index?: number;
}

type InvD3Update = (nodes: InvNode[], edges: InvEdge[]) => void;

const MAX_DEPTH = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeColor(n: GraphNode): string {
  if (n.isQueried) return '#06b6d4';
  if (n.isMixer || n.isHighRisk) return '#ff3b3b';
  if (n.hopLevel === 2) return '#1e4d5c';
  return '#4b5563';
}

function invNodeColor(n: InvNode): string {
  if (n.state === 'root') return '#06b6d4';
  if (n.isMixer || n.isOfac || n.isHighRisk) return '#ff3b3b';
  if (n.state === 'expanded') return '#2563eb';
  if (n.state === 'at-limit') return '#374151';
  if (n.state === 'loading') return '#7c3aed';
  return '#4b5563';
}

function truncateAddr(addr: string): string { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Static graph builder
// ---------------------------------------------------------------------------

function buildGraphData(
  transactions: WalletTransaction[], queriedAddress: string,
  hopData: HopEntry[] | undefined, hopDepth: 1 | 2,
) {
  const queried = queriedAddress.toLowerCase();
  const volMap = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.from || !tx.to) continue;
    const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase();
    if (f !== t) { volMap.set(f, (volMap.get(f) ?? 0) + tx.value); volMap.set(t, (volMap.get(t) ?? 0) + tx.value); }
  }
  const linkMap = new Map<string, GraphLink>();
  for (const tx of transactions) {
    if (!tx.from || !tx.to) continue;
    const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase();
    if (f === t) continue;
    const key = `${f}|||${t}`;
    const existing = linkMap.get(key);
    if (existing) { existing.value += tx.value; existing.count += 1; }
    else linkMap.set(key, { source: f, target: t, value: tx.value, hash: tx.hash, timestamp: tx.timestamp, count: 1, hopLevel: 1 });
  }
  const hop1Addrs = new Set<string>();
  for (const [id] of volMap) { if (id !== queried) hop1Addrs.add(id); }
  if (hopDepth === 2 && hopData && hopData.length > 0) {
    for (const entry of hopData) {
      const hop1Addr = entry.address.toLowerCase();
      if (!hop1Addrs.has(hop1Addr)) continue;
      for (const tx of entry.transactions) {
        const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase();
        if (f === t) continue;
        const isHop2From = !volMap.has(f) && f !== queried;
        const isHop2To = !volMap.has(t) && t !== queried;
        if (isHop2From) volMap.set(f, (volMap.get(f) ?? 0) + tx.value * 0.5);
        if (isHop2To) volMap.set(t, (volMap.get(t) ?? 0) + tx.value * 0.5);
        if (isHop2From || isHop2To) {
          const key = `hop2|||${f}|||${t}`;
          if (!linkMap.has(key)) linkMap.set(key, { source: f, target: t, value: tx.value, hash: tx.hash, timestamp: tx.timestamp, count: 1, hopLevel: 2 });
        }
      }
    }
  }
  const nodes: GraphNode[] = Array.from(volMap.entries()).map(([id, volume]) => {
    const isHop1 = hop1Addrs.has(id);
    const hopLevel: 0 | 1 | 2 = id === queried ? 0 : isHop1 ? 1 : 2;
    return { id, volume, isQueried: id === queried, isMixer: MIXER_ADDRESSES.has(id), isHighRisk: HIGH_RISK_ADDRESSES.has(id), hopLevel };
  });
  return { nodes, links: Array.from(linkMap.values()), hop1Addrs };
}

// ---------------------------------------------------------------------------
// Investigation state builder
// ---------------------------------------------------------------------------

function buildInitialInvState(transactions: WalletTransaction[], queriedAddress: string) {
  const queried = queriedAddress.toLowerCase();
  const volMap = new Map<string, number>();
  const txCountMap = new Map<string, number>();
  const edgeMap = new Map<string, InvEdge>();
  for (const tx of transactions) {
    if (!tx.from || !tx.to) continue;
    const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase();
    if (f === t) continue;
    volMap.set(f, (volMap.get(f) ?? 0) + tx.value);
    volMap.set(t, (volMap.get(t) ?? 0) + tx.value);
    txCountMap.set(f, (txCountMap.get(f) ?? 0) + 1);
    txCountMap.set(t, (txCountMap.get(t) ?? 0) + 1);
    const key = `${f}|||${t}`;
    const ex = edgeMap.get(key);
    if (ex) { (ex as { value: number; count: number }).value += tx.value; (ex as { value: number; count: number }).count += 1; }
    else edgeMap.set(key, { source: f, target: t, value: tx.value, count: 1 });
  }
  const nodeMap: Record<string, InvNode> = {};
  for (const [addr, vol] of volMap) {
    const lbl = getLabel(addr);
    nodeMap[addr] = {
      id: addr, state: addr === queried ? 'root' : 'unexpanded',
      depth: addr === queried ? 0 : 1, volume: vol,
      isMixer: MIXER_ADDRESSES.has(addr), isHighRisk: HIGH_RISK_ADDRESSES.has(addr),
      isOfac: MIXER_ADDRESSES.has(addr), label: lbl?.label ?? null, txCount: txCountMap.get(addr) ?? 0,
    };
  }
  return { nodeMap, edges: Array.from(edgeMap.values()) };
}

// ---------------------------------------------------------------------------
// Investigation D3 init (returns hot-update fn)
// ---------------------------------------------------------------------------

function initInvestigationD3({
  svgEl, W, H, nodes, edges, onTooltip, containerEl, onNodeClick, onNodeExpand,
}: {
  svgEl: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  W: number; H: number;
  nodes: InvNode[]; edges: InvEdge[];
  onTooltip: React.Dispatch<React.SetStateAction<TooltipData>>;
  containerEl: HTMLDivElement;
  onNodeClick: (n: InvNode) => void;
  onNodeExpand: (n: InvNode) => void;
}): { stop: () => void; update: InvD3Update } {
  svgEl.selectAll('*').remove();

  const allVols = nodes.map(n => n.volume);
  const minVol = Math.min(...allVols); const maxVol = Math.max(...allVols, minVol + 1);
  const rScale = d3.scaleSqrt().domain([minVol, maxVol]).range([7, 26]).clamp(true);
  const allVals = edges.map(e => e.value as number).filter(v => v > 0);
  const minVal = allVals.length ? Math.min(...allVals) : 0;
  const maxVal = allVals.length ? Math.max(...allVals) : 1;
  const wScale = d3.scaleLinear().domain([minVal, maxVal]).range([1, 4]).clamp(true);

  for (const n of nodes) {
    if (n.state === 'root') { n.fx = W / 2; n.fy = H / 2; } else { n.fx = null; n.fy = null; }
  }

  svgEl.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
  const defs = svgEl.append('defs');
  defs.append('marker').attr('id', 'inv-arrow').attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
    .attr('orient', 'auto').attr('markerWidth', 6).attr('markerHeight', 6)
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#6b7280').attr('opacity', 0.6);

  const g = svgEl.append('g');
  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5])
    .on('zoom', event => { g.attr('transform', event.transform.toString()); onTooltip(null); });
  svgEl.call(zoom);

  const linkG = g.append('g').attr('class', 'inv-links');
  const nodeG = g.append('g').attr('class', 'inv-nodes');

  const sim = d3.forceSimulation<InvNode>(nodes)
    .force('link', d3.forceLink<InvNode, InvEdge>(edges).id(d => d.id).distance(60).strength(0.5))
    .force('charge', d3.forceManyBody<InvNode>().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('x', d3.forceX<InvNode>(W / 2).strength(0.08))
    .force('y', d3.forceY<InvNode>(H / 2).strength(0.08))
    .force('collision', d3.forceCollide<InvNode>().radius(18));

  const drag = d3.drag<SVGGElement, InvNode>()
    .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); if (d.state !== 'root') { d.fx = null; d.fy = null; } });

  function attachInteraction(sel: d3.Selection<SVGGElement, InvNode, SVGGElement, unknown>) {
    sel
      .on('mouseover', (event: MouseEvent, d: InvNode) => {
        const rect = containerEl.getBoundingClientRect();
        const flags: string[] = [];
        if (d.isMixer) flags.push('Tornado Cash (OFAC SDN)');
        if (d.isHighRisk) flags.push('High-risk counterparty');
        if (d.isOfac && !d.isMixer) flags.push('OFAC-sanctioned');
        if (d.isOverlap) flags.push('CONVERGENCE — shared by multiple paths');
        if (d.state === 'unexpanded') flags.push('Click to expand');
        if (d.state === 'at-limit') flags.push('Max depth reached');
        onTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top,
          content: { kind: 'node', address: d.id, volume: d.volume, flags, hopLevel: Math.min(d.depth, 2) as 0 | 1 | 2 } });
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = containerEl.getBoundingClientRect();
        onTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      })
      .on('mouseout', () => onTooltip(null))
      .on('click', (_event: MouseEvent, d: InvNode) => {
        onNodeClick(d);
        if (d.state === 'unexpanded') onNodeExpand(d);
      })
      .call(drag);
  }

  function renderLinks(data: InvEdge[]) {
    const norm = data.map(e => ({
      ...e,
      source: typeof e.source === 'object' ? (e.source as InvNode).id : e.source as string,
      target: typeof e.target === 'object' ? (e.target as InvNode).id : e.target as string,
    }));
    linkG.selectAll<SVGLineElement, typeof norm[0]>('line')
      .data(norm, d => `${d.source}|||${d.target}`)
      .join('line')
      .attr('stroke', d => {
        const hot = MIXER_ADDRESSES.has(d.source) || MIXER_ADDRESSES.has(d.target)
          || HIGH_RISK_ADDRESSES.has(d.source) || HIGH_RISK_ADDRESSES.has(d.target);
        return hot ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.25)';
      })
      .attr('stroke-width', d => wScale(d.value))
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#inv-arrow)');
  }

  function renderNodes(data: InvNode[]) {
    const sel = nodeG.selectAll<SVGGElement, InvNode>('g.inv-node').data(data, d => d.id);
    sel.exit().remove();
    const entering = sel.enter().append('g').attr('class', 'inv-node');

    entering.append('circle').attr('class', 'inv-c')
      .attr('r', d => rScale(d.volume))
      .attr('fill', d => invNodeColor(d))
      .attr('fill-opacity', d => d.state === 'at-limit' ? 0.25 : d.state === 'expanded' ? 0.55 : 0.8)
      .attr('stroke', d => d.state === 'root' ? '#06b6d4' : 'transparent')
      .attr('stroke-width', 3);

    entering.filter(d => d.state === 'root').append('circle')
      .attr('r', d => rScale(d.volume) + 8).attr('fill', 'none')
      .attr('stroke', '#06b6d4').attr('stroke-width', 1.5).attr('stroke-opacity', 0.3);

    entering.filter(d => d.state === 'unexpanded').append('circle').attr('class', 'expand-ring')
      .attr('r', d => rScale(d.volume) + 4).attr('fill', 'none')
      .attr('stroke', '#6b7280').attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('stroke-opacity', 0.5);

    entering.filter(d => !!d.isOverlap).append('circle').attr('class', 'overlap-ring')
      .attr('r', d => rScale(d.volume) + 7).attr('fill', 'none')
      .attr('stroke', '#ffd60a').attr('stroke-width', 2).attr('stroke-opacity', 0.9);

    entering.append('text')
      .attr('font-size', '9px').attr('font-family', 'monospace')
      .attr('fill', d => d.state === 'root' ? '#06b6d4' : '#9ca3af')
      .attr('text-anchor', 'middle').attr('dy', d => rScale(d.volume) + 14)
      .attr('pointer-events', 'none')
      .text(d => d.state === 'root' ? 'ROOT' : d.state === 'loading' ? '...' : rScale(d.volume) >= 10 ? truncateAddr(d.id) : '');

    // Update existing
    sel.select<SVGCircleElement>('circle.inv-c')
      .attr('fill', d => invNodeColor(d))
      .attr('fill-opacity', d => d.state === 'at-limit' ? 0.25 : d.state === 'expanded' ? 0.55 : 0.8);
    sel.select<SVGTextElement>('text')
      .text(d => d.state === 'root' ? 'ROOT' : d.state === 'loading' ? '...' : rScale(d.volume) >= 10 ? truncateAddr(d.id) : '');

    const merged = entering.merge(sel as d3.Selection<SVGGElement, InvNode, SVGGElement, unknown>);

    // Add overlap ring to existing nodes that became overlapping after initial render
    merged.each(function(d) {
      if (d.isOverlap) {
        const g = d3.select<SVGGElement, InvNode>(this);
        if (g.select('circle.overlap-ring').empty()) {
          g.insert('circle', 'text').attr('class', 'overlap-ring')
            .attr('r', rScale(d.volume) + 7).attr('fill', 'none')
            .attr('stroke', '#ffd60a').attr('stroke-width', 2).attr('stroke-opacity', 0.9);
        }
      }
    });

    merged.style('cursor', d => d.state === 'unexpanded' ? 'pointer' : 'default');
    attachInteraction(merged);
  }

  renderLinks(edges); renderNodes(nodes);

  sim.on('tick', () => {
    // Clamp nodes to SVG bounds before rendering
    for (const n of sim.nodes()) {
      n.x = Math.max(20, Math.min(W - 20, n.x ?? W / 2));
      n.y = Math.max(20, Math.min(H - 20, n.y ?? H / 2));
    }
    // Look up current positions via sim.nodes() — DOM data has string ids, not node refs
    const posMap = new Map<string, InvNode>(sim.nodes().map(n => [n.id, n]));
    linkG.selectAll<SVGLineElement, { source: string | InvNode; target: string | InvNode }>('line')
      .attr('x1', d => { const id = typeof d.source === 'string' ? d.source : d.source.id; return posMap.get(id)?.x ?? 0; })
      .attr('y1', d => { const id = typeof d.source === 'string' ? d.source : d.source.id; return posMap.get(id)?.y ?? 0; })
      .attr('x2', d => { const id = typeof d.target === 'string' ? d.target : d.target.id; return posMap.get(id)?.x ?? 0; })
      .attr('y2', d => { const id = typeof d.target === 'string' ? d.target : d.target.id; return posMap.get(id)?.y ?? 0; });
    nodeG.selectAll<SVGGElement, InvNode>('g.inv-node')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });

  function update(newNodes: InvNode[], newEdges: InvEdge[]) {
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    for (const n of sim.nodes()) positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, vx: n.vx ?? 0, vy: n.vy ?? 0 });
    for (const n of newNodes) {
      const pos = positions.get(n.id);
      if (pos) { n.x = pos.x; n.y = pos.y; n.vx = pos.vx; n.vy = pos.vy; }
      if (n.state === 'root') { n.fx = W / 2; n.fy = H / 2; }
    }
    const freshEdges: InvEdge[] = newEdges.map(e => ({
      ...e,
      source: typeof e.source === 'object' ? (e.source as InvNode).id : e.source,
      target: typeof e.target === 'object' ? (e.target as InvNode).id : e.target,
    }));
    sim.nodes(newNodes);
    (sim.force('link') as d3.ForceLink<InvNode, InvEdge>).links(freshEdges);
    renderLinks(freshEdges); renderNodes(newNodes);
    sim.alpha(0.3).restart();
  }

  return { stop: () => sim.stop(), update };
}

// ---------------------------------------------------------------------------
// Static D3 init
// ---------------------------------------------------------------------------

interface BuildGraphParams {
  svgEl: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  W: number; H: number; nodes: GraphNode[]; links: GraphLink[];
  queriedAddress: string; hopDepth: 1 | 2;
  onTooltip: React.Dispatch<React.SetStateAction<TooltipData>>;
  containerEl: HTMLDivElement;
  onNodeClick?: (node: GraphNode) => void;
}

function initD3Graph({ svgEl, W, H, nodes, links, queriedAddress, hopDepth, onTooltip, containerEl, onNodeClick }: BuildGraphParams): () => void {
  svgEl.selectAll('*').remove();
  const queried = queriedAddress.toLowerCase();
  void queried;
  const allVols = nodes.map(n => n.volume);
  const minVol = Math.min(...allVols); const maxVol = Math.max(...allVols);
  const rScale = d3.scaleSqrt().domain([minVol, maxVol]).range([7, 28]).clamp(true);
  const allVals = links.map(l => l.value);
  const minVal = Math.min(...allVals); const maxVal = Math.max(...allVals);
  const wScale = d3.scaleLinear().domain([minVal, maxVal]).range([1.2, 5]).clamp(true);
  for (const n of nodes) { if (n.isQueried) { n.fx = W / 2; n.fy = H / 2; } else { n.fx = null; n.fy = null; } }
  const svg = svgEl.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
  const defs = svg.append('defs');
  defs.append('marker').attr('id', 'arrow-gray').attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
    .attr('orient', 'auto').attr('markerWidth', 6).attr('markerHeight', 6)
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#6b7280').attr('opacity', 0.7);
  defs.append('marker').attr('id', 'arrow-dim').attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('refY', 0)
    .attr('orient', 'auto').attr('markerWidth', 6).attr('markerHeight', 6)
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#1e4d5c').attr('opacity', 0.5);
  const g = svg.append('g');
  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 4])
    .on('zoom', event => { g.attr('transform', event.transform.toString()); onTooltip(null); });
  svg.call(zoom);
  const linkEls = g.append('g').selectAll<SVGLineElement, GraphLink>('line').data(links).join('line')
    .attr('stroke', d => d.hopLevel === 2 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)')
    .attr('stroke-width', d => d.hopLevel === 2 ? 1 : Math.max(1.5, wScale(d.value)))
    .attr('stroke-dasharray', d => d.hopLevel === 2 ? '3 3' : 'none')
    .attr('stroke-linecap', 'round')
    .attr('marker-end', d => d.hopLevel === 2 ? 'url(#arrow-dim)' : 'url(#arrow-gray)')
    .style('cursor', 'pointer');
  const nodeG = g.append('g').selectAll<SVGGElement, GraphNode>('g').data(nodes).join('g')
    .style('cursor', onNodeClick ? 'pointer' : 'grab');
  nodeG.append('circle')
    .attr('r', d => d.hopLevel === 2 ? rScale(d.volume) * 0.55 : rScale(d.volume))
    .attr('fill', d => nodeColor(d))
    .attr('fill-opacity', d => d.isQueried ? 1 : d.hopLevel === 2 ? 0.4 : 0.75)
    .attr('stroke', d => d.isQueried ? '#06b6d4' : '#0a0a0f')
    .attr('stroke-width', d => d.isQueried ? 3 : 1);
  nodeG.filter(d => d.isQueried).append('circle')
    .attr('r', d => rScale(d.volume) + 8).attr('fill', 'none').attr('stroke', '#06b6d4')
    .attr('stroke-width', 1.5).attr('stroke-opacity', 0.3);
  nodeG.append('text')
    .text(d => {
      if (d.isQueried) return 'Queried';
      if (d.hopLevel === 2) return rScale(d.volume) * 0.55 >= 10 ? truncateAddr(d.id) : '';
      return rScale(d.volume) >= 12 ? truncateAddr(d.id) : '';
    })
    .attr('font-size', d => d.isQueried ? '11px' : d.hopLevel === 2 ? '8px' : '9px')
    .attr('font-family', 'monospace')
    .attr('fill', d => d.isQueried ? '#06b6d4' : d.hopLevel === 2 ? '#4b5563' : '#9ca3af')
    .attr('text-anchor', 'middle')
    .attr('dy', d => { const r = d.hopLevel === 2 ? rScale(d.volume) * 0.55 : rScale(d.volume); return r + 14; })
    .attr('pointer-events', 'none');
  const simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(60).strength(0.5))
    .force('charge', d3.forceManyBody<GraphNode>().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('x', d3.forceX<GraphNode>(W / 2).strength(0.08))
    .force('y', d3.forceY<GraphNode>(H / 2).strength(0.08))
    .force('collision', d3.forceCollide<GraphNode>().radius(18));
  simulation.on('tick', () => {
    for (const n of nodes) {
      n.x = Math.max(20, Math.min(W - 20, n.x ?? W / 2));
      n.y = Math.max(20, Math.min(H - 20, n.y ?? H / 2));
    }
    linkEls
      .attr('x1', d => (d.source as GraphNode).x ?? 0).attr('y1', d => (d.source as GraphNode).y ?? 0)
      .attr('x2', d => (d.target as GraphNode).x ?? 0).attr('y2', d => (d.target as GraphNode).y ?? 0);
    nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });
  const drag = d3.drag<SVGGElement, GraphNode>()
    .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); if (!d.isQueried) { d.fx = null; d.fy = null; } });
  nodeG.call(drag);
  nodeG
    .on('mouseover', (event: MouseEvent, d: GraphNode) => {
      const rect = containerEl.getBoundingClientRect();
      const flags: string[] = [];
      if (d.isMixer) flags.push('Tornado Cash (OFAC SDN)');
      if (d.isHighRisk) flags.push('High-risk counterparty');
      if (d.hopLevel === 2) flags.push('2nd-hop counterparty');
      onTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, content: { kind: 'node', address: d.id, volume: d.volume, flags, hopLevel: d.hopLevel } });
    })
    .on('mousemove', (event: MouseEvent) => { const rect = containerEl.getBoundingClientRect(); onTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null); })
    .on('mouseout', () => onTooltip(null))
    .on('click', (_event: MouseEvent, d: GraphNode) => { if (onNodeClick) onNodeClick(d); });
  linkEls
    .on('mouseover', (event: MouseEvent, d: GraphLink) => { const rect = containerEl.getBoundingClientRect(); onTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, content: { kind: 'edge', hash: d.hash, value: d.value, count: d.count, date: formatDate(d.timestamp) } }); })
    .on('mousemove', (event: MouseEvent) => { const rect = containerEl.getBoundingClientRect(); onTooltip(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null); })
    .on('mouseout', () => onTooltip(null));
  return () => simulation.stop();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TransactionGraphProps {
  transactions: WalletTransaction[];
  queriedAddress: string;
  hopData?: HopEntry[];
  onAnalyzeAddress?: (addr: string) => void;
  containerHeight?: number;
  investigationMode?: boolean;
}

export default function TransactionGraph({
  transactions, queriedAddress, hopData, onAnalyzeAddress, containerHeight, investigationMode,
}: TransactionGraphProps) {
  // Static graph refs/state
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

  // Investigation mode state/refs
  const [invNodeMap, setInvNodeMap] = useState<Record<string, InvNode>>({});
  const [invEdges, setInvEdges] = useState<InvEdge[]>([]);
  const [expandedTrail, setExpandedTrail] = useState<string[]>([]);
  const [invSelectedAddr, setInvSelectedAddr] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  type GraphFilter = 'all' | 'threats' | 'clean' | 'overlap' | 'unexpanded';
  const [graphFilter, setGraphFilter] = useState<GraphFilter>('all');
  const invCardUpdateRef = useRef<InvD3Update | null>(null);
  const invCardStopRef = useRef<(() => void) | null>(null);
  const invFullUpdateRef = useRef<InvD3Update | null>(null);
  const invFullStopRef = useRef<(() => void) | null>(null);
  // Stable callback refs so D3 closures always call current fn
  const expandNodeRef = useRef<(n: InvNode) => void>(() => {});
  const invNodeClickRef = useRef<(n: InvNode) => void>(() => {});

  useEffect(() => { setMounted(true); }, []);

  // Wire stable refs to current expand/click handlers
  useEffect(() => {
    async function expandNode(node: InvNode) {
      if (node.state !== 'unexpanded') return;
      setInvNodeMap(prev => ({ ...prev, [node.id]: { ...prev[node.id], state: 'loading' } }));
      try {
        const res = await fetch('/api/graph-expand', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: node.id }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setInvNodeMap(prev => {
          const next = { ...prev };
          next[node.id] = { ...next[node.id], state: 'expanded' };
          for (const cp of data.counterparties) {
            if (!next[cp.address]) {
              next[cp.address] = {
                id: cp.address,
                state: node.depth + 1 >= MAX_DEPTH ? 'at-limit' : 'unexpanded',
                depth: node.depth + 1, volume: cp.volume, isMixer: cp.isMixer,
                isHighRisk: cp.isHighRisk, isOfac: cp.isOfac, label: cp.label, txCount: cp.txCount,
              };
            } else if (next[cp.address].state !== 'root') {
              // Already in graph from a different expansion path — convergence detected
              next[cp.address] = { ...next[cp.address], isOverlap: true };
            }
          }
          return next;
        });
        setInvEdges(prev => {
          const seen = new Set(prev.map(e => {
            const s = typeof e.source === 'object' ? (e.source as InvNode).id : e.source as string;
            const t = typeof e.target === 'object' ? (e.target as InvNode).id : e.target as string;
            return `${s}|||${t}`;
          }));
          const newEdges: InvEdge[] = [];
          for (const cp of data.counterparties) {
            for (const edge of cp.edges) {
              const key = `${edge.from}|||${edge.to}`;
              if (!seen.has(key)) { newEdges.push({ source: edge.from, target: edge.to, value: edge.value, count: edge.count }); seen.add(key); }
            }
          }
          return [...prev, ...newEdges];
        });
        setExpandedTrail(prev => [...prev, node.id]);
      } catch {
        setInvNodeMap(prev => ({ ...prev, [node.id]: { ...prev[node.id], state: 'unexpanded' } }));
      }
    }
    expandNodeRef.current = expandNode;
    invNodeClickRef.current = (n: InvNode) => setInvSelectedAddr(n.id);
  }, []); // stable — setState refs don't change

  // Static card graph
  useEffect(() => {
    if (investigationMode) return;
    if (!svgRef.current || !containerRef.current || transactions.length === 0) return;
    if (isFullscreen) return;
    const container = containerRef.current;
    const W = container.clientWidth; setContainerWidth(W);
    const H = 480;
    const { nodes, links } = buildGraphData(transactions, queriedAddress, hopData, hopDepth);
    if (nodes.length === 0) return;
    if (simRef.current) simRef.current();
    simRef.current = initD3Graph({ svgEl: d3.select(svgRef.current), W, H, nodes, links, queriedAddress, hopDepth, onTooltip: setTooltip, containerEl: container });
    return () => { if (simRef.current) { simRef.current(); simRef.current = null; } };
  }, [transactions, queriedAddress, hopData, hopDepth, isFullscreen, investigationMode]);

  // Investigation card graph init
  useEffect(() => {
    if (!investigationMode) return;
    if (!svgRef.current || !containerRef.current || transactions.length === 0) return;
    if (isFullscreen) return;
    const container = containerRef.current;
    const W = container.clientWidth; setContainerWidth(W);
    const H = containerHeight ?? 420;
    const { nodeMap, edges } = buildInitialInvState(transactions, queriedAddress);
    const nodes = Object.values(nodeMap);
    if (invCardStopRef.current) { invCardStopRef.current(); invCardStopRef.current = null; }
    const { stop, update } = initInvestigationD3({
      svgEl: d3.select(svgRef.current), W, H, nodes, edges, onTooltip: setTooltip,
      containerEl: container,
      onNodeClick: (n) => invNodeClickRef.current(n),
      onNodeExpand: (n) => expandNodeRef.current(n),
    });
    invCardStopRef.current = stop; invCardUpdateRef.current = update;
    setInvNodeMap(nodeMap); setInvEdges(edges); setExpandedTrail([]); setInvSelectedAddr(null);
    return () => { stop(); invCardStopRef.current = null; invCardUpdateRef.current = null; };
  }, [investigationMode, transactions, queriedAddress, containerHeight, resetCount]); // NOT isFullscreen — guard handles it

  // Hot-update D3 when investigation state changes
  useEffect(() => {
    if (!investigationMode) return;
    const nodes = Object.values(invNodeMap);
    if (nodes.length === 0) return;
    const freshEdges = invEdges.map(e => ({ ...e }));
    if (!isFullscreen && invCardUpdateRef.current) invCardUpdateRef.current(nodes, freshEdges);
    if (isFullscreen && invFullUpdateRef.current) invFullUpdateRef.current(nodes, freshEdges);
  }, [investigationMode, invNodeMap, invEdges, isFullscreen]);

  // Static fullscreen
  useEffect(() => {
    if (investigationMode || !isFullscreen || transactions.length === 0) return;
    let raf: number;
    raf = requestAnimationFrame(() => {
      if (!fullSvgRef.current || !fullContainerRef.current) return;
      const container = fullContainerRef.current;
      const rect = container.getBoundingClientRect();
      const W = rect.width || container.clientWidth; const H = rect.height || container.clientHeight;
      if (W === 0 || H === 0) return;
      setFullContainerWidth(W);
      const { nodes, links } = buildGraphData(transactions, queriedAddress, hopData, hopDepth);
      if (nodes.length === 0) return;
      if (fullSimRef.current) fullSimRef.current();
      fullSimRef.current = initD3Graph({
        svgEl: d3.select(fullSvgRef.current), W, H, nodes, links, queriedAddress, hopDepth,
        onTooltip: setFullTooltip, containerEl: container,
        onNodeClick: (node) => {
          const addr = node.id.toLowerCase();
          const txs = transactions.filter(tx => tx.from.toLowerCase() === addr || tx.to.toLowerCase() === addr);
          setSelectedNode({ address: node.id, volume: node.volume, isMixer: node.isMixer, isHighRisk: node.isHighRisk, hopLevel: node.hopLevel, txCount: txs.length, totalETH: txs.reduce((s, tx) => s + tx.value, 0) });
        },
      });
    });
    return () => { cancelAnimationFrame(raf); if (fullSimRef.current) { fullSimRef.current(); fullSimRef.current = null; } };
  }, [isFullscreen, investigationMode, transactions, queriedAddress, hopData, hopDepth]);

  // Investigation fullscreen init
  useEffect(() => {
    if (!investigationMode || !isFullscreen) return;
    let raf: number;
    raf = requestAnimationFrame(() => {
      if (!fullSvgRef.current || !fullContainerRef.current) return;
      const container = fullContainerRef.current;
      const rect = container.getBoundingClientRect();
      const W = rect.width || container.clientWidth; const H = rect.height || container.clientHeight;
      if (W === 0 || H === 0) return;
      setFullContainerWidth(W);
      const nodes = Object.values(invNodeMap);
      if (nodes.length === 0) return;
      if (invFullStopRef.current) { invFullStopRef.current(); invFullStopRef.current = null; }
      const { stop, update } = initInvestigationD3({
        svgEl: d3.select(fullSvgRef.current), W, H, nodes, edges: invEdges,
        onTooltip: setFullTooltip, containerEl: container,
        onNodeClick: (n) => invNodeClickRef.current(n),
        onNodeExpand: (n) => expandNodeRef.current(n),
      });
      invFullStopRef.current = stop; invFullUpdateRef.current = update;
    });
    return () => { cancelAnimationFrame(raf); if (invFullStopRef.current) { invFullStopRef.current(); invFullStopRef.current = null; invFullUpdateRef.current = null; } };
  }, [isFullscreen, investigationMode, queriedAddress]); // intentionally omit invNodeMap — snapshot at open, then hot-update handles changes

  // Graph filter — display:none removes nodes/edges cleanly, no ghost space
  useEffect(() => {
    if (!investigationMode) return;
    const hiddenIds = new Set<string>();
    for (const n of Object.values(invNodeMap)) {
      if (n.state === 'root') continue; // root always visible
      const isThreat = n.isMixer || n.isHighRisk || n.isOfac;
      const isCleanNode = !isThreat;
      const isOverlapNode = !!n.isOverlap;
      const isUnexpandedNode = n.state === 'unexpanded' || n.state === 'at-limit';
      let hide = false;
      if (graphFilter === 'threats')    hide = !isThreat;
      if (graphFilter === 'clean')      hide = !isCleanNode;
      if (graphFilter === 'overlap')    hide = !isOverlapNode;
      if (graphFilter === 'unexpanded') hide = !isUnexpandedNode;
      if (hide) hiddenIds.add(n.id);
    }
    function applyFilter(svgEl: SVGSVGElement | null) {
      if (!svgEl) return;
      const svg = d3.select(svgEl);
      svg.selectAll<SVGGElement, InvNode>('g.inv-node')
        .style('display', (d) => hiddenIds.has(d.id) ? 'none' : null);
      svg.selectAll<SVGLineElement, { source: string; target: string }>('g.inv-links line')
        .style('display', (d) => (hiddenIds.has(d.source) || hiddenIds.has(d.target)) ? 'none' : null);
    }
    applyFilter(svgRef.current);
    if (isFullscreen) applyFilter(fullSvgRef.current);
  }, [graphFilter, invNodeMap, investigationMode, isFullscreen]);

  // Esc closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { setIsFullscreen(false); setSelectedNode(null); } }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  function resetGraph() {
    setResetCount(c => c + 1);
    setExpandedTrail([]);
    setInvSelectedAddr(null);
  }

  const hasHopData = hopData && hopData.length > 0;

  const hop1Count = (() => {
    const queried = queriedAddress.toLowerCase(); const addrs = new Set<string>();
    for (const tx of transactions) { const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase(); if (f !== queried) addrs.add(f); if (t !== queried) addrs.add(t); }
    return addrs.size;
  })();
  const highRiskCount = (() => {
    const addrs = new Set<string>();
    for (const tx of transactions) { const f = tx.from.toLowerCase(); const t = tx.to.toLowerCase(); if (MIXER_ADDRESSES.has(f) || HIGH_RISK_ADDRESSES.has(f)) addrs.add(f); if (MIXER_ADDRESSES.has(t) || HIGH_RISK_ADDRESSES.has(t)) addrs.add(t); }
    return addrs.size;
  })();
  const totalETHFlow = transactions.reduce((sum, tx) => sum + tx.value, 0);

  const invOverlapCount = Object.values(invNodeMap).filter(n => n.isOverlap).length;

  const baseLegend = [
    { color: '#06b6d4', label: 'QUERIED' },
    { color: '#ff3b3b', label: 'HIGH RISK' },
  ];
  const legend = investigationMode
    ? (expandedTrail.length > 0
      ? [
          ...baseLegend,
          { color: '#4b5563', label: 'UNEXPANDED' },
          { color: '#2563eb', label: 'EXPANDED' },
          { color: '#374151', label: 'AT LIMIT' },
          ...(invOverlapCount > 0 ? [{ color: '#ffd60a', label: 'OVERLAP' }] : []),
        ]
      : baseLegend)
    : [...baseLegend, { color: '#4b5563', label: 'HOP 1' }, ...(hopDepth === 2 ? [{ color: '#1e4d5c', label: 'HOP 2' }] : [])];

  function renderTooltipContent(tt: TooltipData, cWidth: number) {
    if (!tt) return null;
    return (
      <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 20, background: '#001f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '10px 14px', left: Math.min(tt.x + 14, (cWidth || 9999) - 230), top: Math.max(tt.y - 48, 8), minWidth: 210 }}>
        {tt.content.kind === 'node' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.08em', color: '#06b6d4' }}>
              {tt.content.address.toLowerCase() === queriedAddress.toLowerCase() ? 'QUERIED WALLET' : tt.content.hopLevel === 2 ? '2ND HOP' : 'COUNTERPARTY'}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{tt.content.address}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{formatETH(tt.content.volume)}</div>
            {tt.content.flags.map(f => <div key={f} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: f.includes('2nd') || f.includes('Click') || f.includes('Max') ? '#6b7280' : '#ff3b3b' }}>{f}</div>)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>TXN{tt.content.count > 1 ? `S (${tt.content.count})` : ''}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{tt.content.hash.slice(0, 20)}...</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{formatETH(tt.content.value)}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{tt.content.date}</div>
          </div>
        )}
      </div>
    );
  }

  const hopToggle = (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      {([1, 2] as const).map(depth => (
        <button key={depth} onClick={() => setHopDepth(depth)} style={{ padding: '5px 12px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s', background: hopDepth === depth ? 'rgba(6,182,212,0.12)' : 'transparent', color: hopDepth === depth ? '#06b6d4' : 'var(--text-dim)', borderRight: depth === 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
          {depth} HOP{depth === 2 ? 'S' : ''}
        </button>
      ))}
    </div>
  );

  // Investigation node info panel (shared between card and fullscreen)
  const invSelectedNode = invSelectedAddr ? invNodeMap[invSelectedAddr] : null;

  function renderInvNodePanel(inFullscreen: boolean) {
    if (!invSelectedNode) return (
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, padding: inFullscreen ? '12px 14px' : 0, border: inFullscreen ? '1px solid rgba(6,182,212,0.08)' : 'none', borderRadius: 4 }}>
        Click any node to inspect. Dashed-ring nodes can be expanded.
      </div>
    );

    const lbl = getLabel(invSelectedNode.id);
    return (
      <div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 12 }}>SELECTED NODE</div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>ADDRESS</div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: invSelectedNode.isMixer ? '#ff3b3b' : invSelectedNode.isHighRisk ? '#ff8c00' : invSelectedNode.state === 'root' ? '#06b6d4' : 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 16 }}>{invSelectedNode.id}</div>
        {lbl && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>LABEL</div>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 2, background: lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.1)' : lbl.category === 'exchange' ? 'rgba(6,182,212,0.08)' : 'rgba(255,140,0,0.08)', color: lbl.category === 'sanctioned' ? '#ff3b3b' : lbl.category === 'exchange' ? '#06b6d4' : '#ff8c00', border: `1px solid ${lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.2)' : lbl.category === 'exchange' ? 'rgba(6,182,212,0.15)' : 'rgba(255,140,0,0.15)'}` }}>{lbl.label}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>TXN COUNT</div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{invSelectedNode.txCount}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>VOLUME</div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatETH(invSelectedNode.volume)}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>DEPTH</div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{invSelectedNode.depth}</div>
          </div>
        </div>
        {(invSelectedNode.isMixer || invSelectedNode.isHighRisk) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 8 }}>RISK FLAGS</div>
            {invSelectedNode.isMixer && <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff3b3b', padding: '4px 0', borderBottom: '1px solid rgba(255,59,59,0.15)' }}>OFAC SDN — Tornado Cash</div>}
            {invSelectedNode.isHighRisk && !invSelectedNode.isMixer && <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff8c00', padding: '4px 0', borderBottom: '1px solid rgba(255,140,0,0.15)' }}>HIGH RISK — Known malicious address</div>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {invSelectedNode.state === 'unexpanded' && (
            <button
              onClick={() => expandNodeRef.current(invSelectedNode)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#06b6d4', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 3, padding: '6px 10px', cursor: 'pointer' }}
            >
              EXPAND NODE →
            </button>
          )}
          {invSelectedNode.state !== 'root' && (
            <a href={`https://etherscan.io/address/${invSelectedNode.id}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
              VIEW ON ETHERSCAN
            </a>
          )}
          {onAnalyzeAddress && invSelectedNode.state !== 'root' && (
            <button
              onClick={() => { setIsFullscreen(false); setInvSelectedAddr(null); onAnalyzeAddress(invSelectedNode.id); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#06b6d4', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 3, padding: '6px 10px', cursor: 'pointer' }}
            >
              ANALYZE THIS WALLET →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Investigation stats (used in card bottom bar and fullscreen bar)
  const invNodeCount = Object.keys(invNodeMap).length;
  const invEdgeCount = invEdges.length;
  const invMaxDepth = Object.values(invNodeMap).reduce((m, n) => Math.max(m, n.depth), 0);
  const invRiskCount = Object.values(invNodeMap).filter(n => n.isMixer || n.isHighRisk || n.isOfac).length;
  const hiddenCount = graphFilter === 'all' ? 0 : Object.values(invNodeMap).filter(n => {
    if (n.state === 'root') return false;
    const isThreat = n.isMixer || n.isHighRisk || n.isOfac;
    if (graphFilter === 'threats')    return !isThreat;
    if (graphFilter === 'clean')      return isThreat;
    if (graphFilter === 'overlap')    return !n.isOverlap;
    if (graphFilter === 'unexpanded') return n.state !== 'unexpanded' && n.state !== 'at-limit';
    return false;
  }).length;

  // Breadcrumb
  const breadcrumb = expandedTrail.length > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', maxWidth: 600 }}>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>TRAIL:</span>
      {expandedTrail.map((addr, i) => (
        <React.Fragment key={addr}>
          <span
            onClick={() => setInvSelectedAddr(addr)}
            style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-secondary)', cursor: 'pointer', letterSpacing: 0 }}
            title={addr}
          >
            {truncateAddr(addr)}
          </span>
          {i < expandedTrail.length - 1 && <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  ) : null;

  // ---------------------------------------------------------------------------
  // Fullscreen portal
  // ---------------------------------------------------------------------------

  const fullscreenPortal = mounted && isFullscreen
    ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#00080f', display: 'flex', flexDirection: 'column' }}>
          {/* Top bar */}
          <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid rgba(6,182,212,0.08)', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', flexShrink: 0 }}>
                TRANSACTION GRAPH
              </div>
              {investigationMode && <span style={{ background: 'rgba(6,182,212,0.08)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 2, padding: '1px 7px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.1em' }}>INVESTIGATION MODE</span>}
              {investigationMode ? breadcrumb : (
                <span style={{ color: 'var(--text-secondary)', letterSpacing: 0, fontFamily: 'var(--font-inter)', fontSize: 12 }}>
                  {queriedAddress.slice(0, 10)}...{queriedAddress.slice(-8)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              {!investigationMode && hasHopData && hopToggle}
              {investigationMode && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: expandedTrail.length > 0 ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                    {(['all', 'threats', 'clean', 'overlap', 'unexpanded'] as GraphFilter[]).map(mode => {
                      const isActive = graphFilter === mode;
                      const colorMap: Record<GraphFilter, string> = { all: '#06b6d4', threats: '#ff3b3b', clean: '#00ff88', overlap: '#ffd60a', unexpanded: '#a78bfa' };
                      const labelMap: Record<GraphFilter, string> = { all: 'ALL', threats: 'THREATS', clean: 'CLEAN', overlap: 'OVERLAPS', unexpanded: 'UNEXPANDED' };
                      const c = colorMap[mode];
                      return (
                        <button key={mode} onClick={() => setGraphFilter(mode)} style={{
                          background: isActive ? `${c}22` : 'none',
                          border: `1px solid ${isActive ? c + '66' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 3,
                          color: isActive ? c : 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: 8,
                          letterSpacing: '0.08em',
                          transition: 'all 0.15s',
                          whiteSpace: 'nowrap',
                        }}>
                          {labelMap[mode]}
                        </button>
                      );
                    })}
                    <InfoTooltip text="Filter graph nodes: THREATS = OFAC/mixer/high-risk · CLEAN = no flags · OVERLAPS = appear in multiple hops · UNEXPANDED = not yet traced" />
                  </div>
                  <button onClick={resetGraph} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: 'var(--text-dim)', cursor: 'pointer', padding: '5px 12px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em' }}>
                    RESET GRAPH
                  </button>
                </>
              )}
              <button onClick={() => { setIsFullscreen(false); setSelectedNode(null); }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, color: 'var(--text-secondary)', cursor: 'pointer', padding: '5px 12px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em' }}>
                ESC / CLOSE
              </button>
            </div>
          </div>

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* Graph */}
            <div ref={fullContainerRef} style={{ position: 'relative', flex: '0 0 75%', borderRight: '1px solid rgba(6,182,212,0.08)' }}>
              <svg ref={fullSvgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {graphFilter !== 'all' && hiddenCount > 0 && (() => {
                const bannerColor: Record<GraphFilter, string> = { all: '', threats: '#ff3b3b', clean: '#00ff88', overlap: '#ffd60a', unexpanded: '#a78bfa' };
                const bannerLabel: Record<GraphFilter, string> = { all: '', threats: 'THREATS ONLY', clean: 'CLEAN ONLY', overlap: 'OVERLAPS ONLY', unexpanded: 'UNEXPANDED ONLY' };
                const c = bannerColor[graphFilter];
                return (
                  <div style={{
                    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 10, pointerEvents: 'none',
                    background: `${c}1a`,
                    border: `1px solid ${c}59`,
                    borderRadius: 3,
                    padding: '4px 14px',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    color: c,
                    whiteSpace: 'nowrap',
                  }}>
                    FILTER: {bannerLabel[graphFilter]} — {hiddenCount} HIDDEN
                  </div>
                );
              })()}
              {renderTooltipContent(fullTooltip, fullContainerWidth)}
            </div>

            {/* Detail panel */}
            <div style={{ flex: '0 0 25%', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 24, gap: 20 }}>
              {investigationMode ? (
                <>
                  {/* Permanent status — never replaced */}
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 12 }}>INVESTIGATION STATUS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                        {invNodeCount} nodes · {invEdgeCount} edges · depth {invMaxDepth}
                      </div>
                      {invRiskCount > 0 && (
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff3b3b' }}>{invRiskCount} HIGH-RISK NODES</div>
                      )}
                      {!invSelectedAddr && (
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 4 }}>
                          Click any node to inspect. Dashed-ring nodes can be expanded.
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Node info — appended below status, never replaces it */}
                  {invSelectedAddr && invSelectedNode && (
                    <div style={{ borderTop: '1px solid rgba(6,182,212,0.08)', paddingTop: 16 }}>
                      {renderInvNodePanel(true)}
                    </div>
                  )}
                </>
              ) : (
                selectedNode ? (
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 12 }}>SELECTED NODE</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>ADDRESS</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: selectedNode.isMixer ? '#ff3b3b' : selectedNode.isHighRisk ? '#ff8c00' : selectedNode.hopLevel === 0 ? '#06b6d4' : 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 16 }}>{selectedNode.address}</div>
                    {(() => { const lbl = getLabel(selectedNode.address); return lbl ? (<div style={{ marginBottom: 16 }}><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>LABEL</div><span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 2, background: lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.1)' : lbl.category === 'exchange' ? 'rgba(6,182,212,0.08)' : 'rgba(255,140,0,0.08)', color: lbl.category === 'sanctioned' ? '#ff3b3b' : lbl.category === 'exchange' ? '#06b6d4' : '#ff8c00', border: `1px solid ${lbl.category === 'sanctioned' ? 'rgba(255,59,59,0.2)' : lbl.category === 'exchange' ? 'rgba(6,182,212,0.15)' : 'rgba(255,140,0,0.15)'}` }}>{lbl.label}</span></div>) : null; })()}
                    <div style={{ marginBottom: 16 }}><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>CLASSIFICATION</div><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{selectedNode.hopLevel === 0 ? 'Queried Wallet' : selectedNode.hopLevel === 1 ? 'Direct Counterparty (Hop 1)' : '2nd-Hop Counterparty (Hop 2)'}</div></div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      <div><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>TXN COUNT</div><div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.txCount}</div></div>
                      <div><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>TOTAL ETH</div><div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatETH(selectedNode.totalETH)}</div></div>
                    </div>
                    {(selectedNode.isMixer || selectedNode.isHighRisk) && (<div style={{ marginBottom: 16 }}><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 8 }}>RISK FLAGS</div>{selectedNode.isMixer && <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff3b3b', padding: '4px 0', borderBottom: '1px solid rgba(255,59,59,0.15)' }}>OFAC SDN — Tornado Cash</div>}{selectedNode.isHighRisk && !selectedNode.isMixer && <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ff8c00', padding: '4px 0', borderBottom: '1px solid rgba(255,140,0,0.15)' }}>HIGH RISK — Known malicious address</div>}</div>)}
                    {selectedNode.hopLevel !== 0 && (<a href={`https://etherscan.io/address/${selectedNode.address}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>VIEW ON ETHERSCAN</a>)}
                    {onAnalyzeAddress && selectedNode.hopLevel !== 0 && (<button onClick={() => { setIsFullscreen(false); setSelectedNode(null); onAnalyzeAddress(selectedNode.address); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#06b6d4', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 3, padding: '6px 10px', cursor: 'pointer', marginTop: 4 }}>ANALYZE THIS WALLET →</button>)}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 16 }}>GRAPH SUMMARY</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {[{ label: 'QUERIED WALLET', value: `${queriedAddress.slice(0, 8)}...${queriedAddress.slice(-6)}`, color: '#06b6d4' }, { label: 'DIRECT COUNTERPARTIES', value: hop1Count, color: 'var(--text-primary)' }, { label: 'HIGH-RISK CONNECTIONS', value: highRiskCount, color: highRiskCount > 0 ? '#ff3b3b' : 'var(--text-primary)' }, { label: 'TOTAL ETH FLOW', value: formatETH(totalETHFlow), color: 'var(--text-primary)' }].map(({ label, value, color }) => (
                        <div key={label}><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div><div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color, wordBreak: 'break-all' }}>{value}</div></div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, padding: '12px 14px', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>Click any node to inspect it</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ height: 40, flexShrink: 0, borderTop: '1px solid rgba(6,182,212,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {legend.map(({ color, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />{label}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              {investigationMode
                ? `${invNodeCount} NODES · ${invEdgeCount} EDGES · DEPTH ${invMaxDepth} · ${invRiskCount > 0 ? invRiskCount + ' HIGH-RISK' : '0 RISK'}${invOverlapCount > 0 ? ' · ' + invOverlapCount + ' OVERLAP' : ''}`
                : `${transactions.length} TXN${transactions.length !== 1 ? 'S' : ''} · ${hop1Count} COUNTERPART${hop1Count !== 1 ? 'IES' : 'Y'} · ${highRiskCount > 0 ? highRiskCount + ' OFAC' : '0 OFAC'}`
              }
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  // ---------------------------------------------------------------------------
  // Card render
  // ---------------------------------------------------------------------------

  return (
    <>
      {fullscreenPortal}
      <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, background: '#001824', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header — two-row layout, fixed height so graph canvas never shifts */}
        <div style={{ padding: '8px 20px', borderBottom: '1px solid rgba(6,182,212,0.05)', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 56, maxHeight: 56, overflow: 'hidden' }}>
          {/* Row 1: title + badge + expand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
                TRANSACTION GRAPH
              </span>
              {investigationMode
                ? <span style={{ background: 'rgba(6,182,212,0.08)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 2, padding: '1px 7px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.1em' }}>INVESTIGATION MODE</span>
                : <InfoTooltip text="Each dot is a unique wallet that transacted with this address. Green = queried wallet. Red = OFAC-sanctioned or known mixer. Orange = high-risk. Drag nodes, scroll to zoom." />
              }
              {!investigationMode && hasHopData && <div style={{ marginLeft: 4 }}>{hopToggle}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* Filter pill — visible as soon as Investigation Mode is active */}
              {investigationMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: expandedTrail.length > 0 ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                  {(['all', 'threats', 'clean', 'overlap', 'unexpanded'] as GraphFilter[]).map(mode => {
                    const isActive = graphFilter === mode;
                    const colorMap: Record<GraphFilter, string> = { all: '#06b6d4', threats: '#ff3b3b', clean: '#00ff88', overlap: '#ffd60a', unexpanded: '#a78bfa' };
                    const labelMap: Record<GraphFilter, string> = { all: 'ALL', threats: 'THREATS', clean: 'CLEAN', overlap: 'OVERLAPS', unexpanded: 'UNEXPANDED' };
                    const c = colorMap[mode];
                    return (
                      <button key={mode} onClick={() => setGraphFilter(mode)} style={{
                        background: isActive ? `${c}22` : 'none',
                        border: `1px solid ${isActive ? c + '66' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 3,
                        color: isActive ? c : 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 7,
                        letterSpacing: '0.07em',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}>
                        {labelMap[mode]}
                      </button>
                    );
                  })}
                  <InfoTooltip text="Filter graph nodes: THREATS = OFAC/mixer/high-risk · CLEAN = no flags · OVERLAPS = appear in multiple hops · UNEXPANDED = not yet traced" />
                </div>
              )}
              <button onClick={() => { setIsFullscreen(true); setSelectedNode(null); }} title="Fullscreen graph"
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 8px', fontSize: 12, lineHeight: 1, transition: 'border-color 0.15s, color 0.15s', flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#06b6d4'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}>
                ⛶
              </button>
            </div>
          </div>
          {/* Row 2: instruction + legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, overflow: 'hidden' }}>
              {investigationMode && expandedTrail.length > 0
                ? breadcrumb
                : (
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {investigationMode ? 'Click any node to trace funds →' : 'Force-directed — drag nodes, scroll to zoom'}
                  </span>
                )
              }
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              {legend.map(({ color, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />{label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Graph canvas */}
        <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: containerHeight ?? 420 }}>
          {transactions.length === 0 ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>NO TRANSACTIONS TO GRAPH</div>
          ) : (
            <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          )}
          {/* Active filter banner */}
          {graphFilter !== 'all' && hiddenCount > 0 && (() => {
            const bannerColor: Record<GraphFilter, string> = { all: '', threats: '#ff3b3b', clean: '#00ff88', overlap: '#ffd60a', unexpanded: '#a78bfa' };
            const bannerLabel: Record<GraphFilter, string> = { all: '', threats: 'THREATS ONLY', clean: 'CLEAN ONLY', overlap: 'OVERLAPS ONLY', unexpanded: 'UNEXPANDED ONLY' };
            const c = bannerColor[graphFilter];
            return (
              <div style={{
                position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, pointerEvents: 'none',
                background: `${c}1a`,
                border: `1px solid ${c}59`,
                borderRadius: 3,
                padding: '4px 14px',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                color: c,
                whiteSpace: 'nowrap',
              }}>
                FILTER: {bannerLabel[graphFilter]} — {hiddenCount} HIDDEN
              </div>
            );
          })()}
          {renderTooltipContent(tooltip, containerWidth)}
        </div>

        {/* Investigation stats bar */}
        {investigationMode && invNodeCount > 0 && (
          <div style={{ padding: '7px 20px', borderTop: '1px solid rgba(6,182,212,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              {invNodeCount} NODES&nbsp;·&nbsp;{invEdgeCount} EDGES&nbsp;·&nbsp;DEPTH {invMaxDepth}&nbsp;·&nbsp;
              {invRiskCount > 0 ? <span style={{ color: '#ff3b3b' }}>{invRiskCount} HIGH-RISK</span> : <span>0 RISK</span>}
              {invOverlapCount > 0 && <>&nbsp;·&nbsp;<span style={{ color: '#ffd60a' }}>{invOverlapCount} OVERLAP</span></>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={resetGraph}
                style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 3, color: '#06b6d4', cursor: 'pointer', padding: '3px 10px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.1em', transition: 'background 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.04)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.2)'; }}>
                ⟳ RESET
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
