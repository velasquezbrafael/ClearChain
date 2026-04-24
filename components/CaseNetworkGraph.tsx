'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface CaseNode {
  id: string
  address: string
  riskLevel: string
  chain: string
}

interface Props {
  addresses: { address: string; riskLevel: string; chain: string }[]
}

const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#ff3b3b',
  HIGH: '#ff8c00',
  MEDIUM: '#ffd60a',
  LOW: '#00ff88',
}

function nodeColor(level: string) {
  return RISK_COLORS[level] ?? '#8892a4'
}

export default function CaseNetworkGraph({ addresses }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || addresses.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const W = svgRef.current.clientWidth || 700
    const H = 340

    const nodes: (CaseNode & d3.SimulationNodeDatum)[] = addresses.map(a => ({
      id: a.address,
      address: a.address,
      riskLevel: a.riskLevel,
      chain: a.chain,
    }))

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', e => g.attr('transform', e.transform.toString()))
    svg.call(zoom)

    const sim = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(48))

    // Node groups
    const nodeG = g.selectAll<SVGGElement, typeof nodes[number]>('g.node')
      .data(nodes, d => d.id)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => window.open(`/?address=${d.address}`, '_blank'))

    nodeG.append('circle')
      .attr('r', 22)
      .attr('fill', d => `${nodeColor(d.riskLevel)}18`)
      .attr('stroke', d => nodeColor(d.riskLevel))
      .attr('stroke-width', 1.5)

    nodeG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-family', 'var(--font-jetbrains-mono), monospace')
      .attr('font-size', 7)
      .attr('fill', d => nodeColor(d.riskLevel))
      .text(d => `${d.address.slice(0, 5)}…${d.address.slice(-4)}`)

    nodeG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '2.4em')
      .attr('font-family', 'var(--font-jetbrains-mono), monospace')
      .attr('font-size', 7)
      .attr('fill', '#3d4a5c')
      .text(d => d.riskLevel)

    // Drag
    nodeG.call(
      d3.drag<SVGGElement, typeof nodes[number]>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
    )

    sim.on('tick', () => {
      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [addresses])

  if (addresses.length === 0) {
    return (
      <div style={{
        background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
        padding: '40px 24px', textAlign: 'center', color: '#3d4a5c', fontSize: 13,
        fontFamily: 'var(--font-jetbrains-mono)',
      }}>
        Add addresses to this case to see the network graph
      </div>
    )
  }

  return (
    <div style={{ background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={340}
        style={{ display: 'block' }}
      />
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        {Object.entries(RISK_COLORS).map(([level, color]) => (
          <span key={level} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.06em', color: '#3d4a5c' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {level}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#3d4a5c' }}>
          Click node to open analysis · Drag to reposition
        </span>
      </div>
    </div>
  )
}
