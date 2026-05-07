'use client'

import type { WalletAnalysis, IndirectExposureHit } from '@/types'

interface ExposureBreakdownProps {
  analysis: WalletAnalysis
}

// ---------------------------------------------------------------------------
// Badge styles per exposure type
// ---------------------------------------------------------------------------

const BADGE_STYLES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  ofac: {
    bg: 'rgba(255,59,59,0.1)',
    color: '#ff3b3b',
    border: 'rgba(255,59,59,0.2)',
    label: 'OFAC',
  },
  mixer: {
    bg: 'rgba(255,140,0,0.1)',
    color: '#ff8c00',
    border: 'rgba(255,140,0,0.2)',
    label: 'MIXER',
  },
  high_risk: {
    bg: 'rgba(255,214,10,0.1)',
    color: '#ffd60a',
    border: 'rgba(255,214,10,0.2)',
    label: 'HIGH-RISK',
  },
}

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ---------------------------------------------------------------------------
// Single exposure item row
// ---------------------------------------------------------------------------

interface ExposureItemProps {
  badgeKey: string
  entity: string
  address?: string
}

function ExposureItem({ badgeKey, entity, address }: ExposureItemProps) {
  const badge = BADGE_STYLES[badgeKey] ?? BADGE_STYLES['ofac']
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 2,
        padding: '8px 10px',
        marginBottom: 6,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 8,
          letterSpacing: '0.12em',
          background: badge.bg,
          color: badge.color,
          border: `1px solid ${badge.border}`,
          borderRadius: 2,
          padding: '2px 5px',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {badge.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            color: '#f0f4ff',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {entity}
        </div>
        {address && (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              color: '#8892a4',
              marginTop: 2,
            }}
          >
            {truncateAddress(address)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExposureBreakdown
// ---------------------------------------------------------------------------

export default function ExposureBreakdown({ analysis }: ExposureBreakdownProps) {
  // ── Derive direct exposure items ─────────────────────────────────────────
  interface DirectItem { badgeKey: string; entity: string; address?: string }
  const directItems: DirectItem[] = []

  if (analysis.ofacResult.matched) {
    directItems.push({
      badgeKey: 'ofac',
      entity: analysis.ofacResult.matchedEntity
        ? `OFAC SDN: ${analysis.ofacResult.matchedEntity}`
        : 'Listed on OFAC SDN list',
      address: analysis.address,
    })
  }

  if (analysis.riskScore.signals['mixer_interaction']?.triggered) {
    // Pull count from the detail string if possible
    const detail = analysis.riskScore.signals['mixer_interaction'].detail
    const countMatch = detail.match(/^(\d+) transaction/)
    const countLabel = countMatch ? `${countMatch[1]} tx` : ''
    directItems.push({
      badgeKey: 'mixer',
      entity: countLabel
        ? `Mixer/tumbler interaction (${countLabel})`
        : 'Direct mixer/tumbler interaction',
    })
  }

  if (analysis.riskScore.signals['high_risk_counterparty']?.triggered) {
    const detail = analysis.riskScore.signals['high_risk_counterparty'].detail
    const countMatch = detail.match(/^(\d+) transaction/)
    const label = countMatch
      ? `High-risk counterparty (${countMatch[1]} tx)`
      : 'High-risk counterparty interaction'
    directItems.push({ badgeKey: 'high_risk', entity: label })
  }

  // ── Indirect exposure items ───────────────────────────────────────────────
  const indirectItems: IndirectExposureHit[] = analysis.indirectExposureHits ?? []

  // Nothing to show → suppress completely
  if (directItems.length === 0 && indirectItems.length === 0) return null

  return (
    <div
      style={{
        background: '#080b14',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        padding: 20,
        marginTop: 16,
        animation: 'fadeSlideUp 0.4s ease-out both',
        animationDelay: '0.1s',
      }}
    >
      {/* Section header */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.15em',
          color: '#8892a4',
          marginBottom: 16,
        }}
      >
        EXPOSURE ANALYSIS
      </div>

      {/* Two-column grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
        }}
      >
        {/* DIRECT column */}
        <div style={{ paddingRight: 16 }}>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 8,
              letterSpacing: '0.15em',
              color: '#3d4a5c',
              marginBottom: 10,
            }}
          >
            DIRECT
          </div>

          {directItems.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Checkmark SVG */}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5L4.5 8L9 3" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 11, color: '#3d4a5c' }}>
                No direct exposure
              </span>
            </div>
          ) : (
            <>
              {directItems.map((item, i) => (
                <ExposureItem key={i} badgeKey={item.badgeKey} entity={item.entity} address={item.address} />
              ))}
              <div
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 10,
                  color: '#3d4a5c',
                  lineHeight: 1.5,
                  marginTop: 8,
                }}
              >
                The wallet itself has direct contact with sanctioned or high-risk entities.
              </div>
            </>
          )}
        </div>

        {/* Vertical divider */}
        <div
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            paddingLeft: 16,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 8,
              letterSpacing: '0.15em',
              color: '#3d4a5c',
              marginBottom: 10,
            }}
          >
            INDIRECT
          </div>

          {indirectItems.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5L4.5 8L9 3" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 11, color: '#3d4a5c' }}>
                No indirect exposure
              </span>
            </div>
          ) : (
            <>
              {indirectItems.map((hit, i) => (
                <ExposureItem key={i} badgeKey={hit.type} entity={hit.entity} address={hit.address} />
              ))}
              <div
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 10,
                  color: '#3d4a5c',
                  lineHeight: 1.5,
                  marginTop: 8,
                }}
              >
                One or more counterparties of this wallet carry their own sanctions or mixer designations.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          paddingTop: 10,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          color: '#3d4a5c',
          fontStyle: 'italic',
        }}
      >
        Direct exposure = the wallet itself. Indirect exposure = 2-hop taint from counterparties.
      </div>
    </div>
  )
}
