/**
 * CaseReportPDF — @react-pdf/renderer document component
 *
 * Server-only. Never import this in a client component.
 * Rendered via renderToBuffer in app/api/cases/[id]/report/route.ts
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoringSignal {
  name: string
  weight: number
  triggered: boolean
  score: number
  detail: string
}

interface AMLTypology {
  id: string
  name: string
  description: string
  triggered: boolean
  confidence: number
  rationale: string
}

export interface AddressForReport {
  address: string
  chain: string
  risk_score: number
  risk_level: string
  signals: ScoringSignal[]
  typologies: AMLTypology[]
  sar_draft: string | null
  narrative: string | null
}

export interface NoteForReport {
  content: string
  created_at: string
  author_name?: string | null
}

export interface CaseReportProps {
  caseData: {
    id: string
    title: string
    description: string | null
    status: string
    created_at: string
  }
  addresses: AddressForReport[]
  notes: NoteForReport[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#ff3b3b',
  HIGH: '#ff8c00',
  MEDIUM: '#ffd60a',
  LOW: '#00ff88',
}

const STATUS_COLORS: Record<string, string> = {
  open: '#8892a4',
  under_review: '#ffd60a',
  escalated: '#ff8c00',
  sar_filed: '#ff3b3b',
  closed: '#3d4a5c',
}

function formatStatus(s: string): string {
  return s.toUpperCase().replace(/_/g, ' ')
}

function formatSignalName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function truncateAddr(addr: string): string {
  if (addr.length <= 20) return addr
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function openDays(createdAt: string): number {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  ))
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    backgroundColor: '#03040a',
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
  },

  // --- Footer (fixed, repeats every page) ---
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  footerLeft: {
    fontSize: 7,
    color: '#3d4a5c',
    letterSpacing: 0.5,
  },
  footerRight: {
    fontSize: 7,
    color: '#3d4a5c',
    letterSpacing: 0.5,
  },
  footerDisclaimer: {
    position: 'absolute',
    bottom: 12,
    left: 48,
    right: 48,
  },
  footerDisclaimerText: {
    fontSize: 6,
    color: '#3d4a5c',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // --- Cover section ---
  wordmark: {
    fontSize: 22,
    color: '#00ff88',
    letterSpacing: 4,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  coverSubtitle: {
    fontSize: 8,
    color: '#3d4a5c',
    letterSpacing: 2.5,
    marginBottom: 20,
  },
  coverDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#00ff88',
    marginBottom: 24,
    opacity: 0.4,
  },
  coverTitle: {
    fontSize: 20,
    color: '#f0f4ff',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
  },
  coverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 6,
  },
  coverMetaText: {
    fontSize: 8,
    color: '#3d4a5c',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica',
  },
  coverMetaLabel: {
    fontSize: 8,
    color: '#3d4a5c',
    letterSpacing: 0.8,
  },

  // --- Section headers ---
  sectionHeader: {
    fontSize: 7,
    color: '#00ff88',
    letterSpacing: 2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 12,
    marginTop: 28,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },

  // --- Summary stats ---
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#080b14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    padding: 12,
  },
  statLabel: {
    fontSize: 6,
    color: '#3d4a5c',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    color: '#f0f4ff',
    fontFamily: 'Helvetica-Bold',
  },

  descriptionText: {
    fontSize: 10,
    color: '#8892a4',
    lineHeight: 1.6,
    marginBottom: 12,
  },

  // --- Address block ---
  addressBlock: {
    backgroundColor: '#080b14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    padding: 16,
    marginBottom: 16,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addressText: {
    fontSize: 9,
    color: '#00ff88',
    fontFamily: 'Helvetica',
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chainBadge: {
    fontSize: 7,
    color: '#8892a4',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 1,
    letterSpacing: 1,
  },
  riskScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  riskScoreNumber: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
  },
  riskScoreLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },

  // --- Signals table ---
  signalsLabel: {
    fontSize: 7,
    color: '#3d4a5c',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 5,
  },
  signalName: {
    flex: 3,
    fontSize: 8,
    color: '#8892a4',
    letterSpacing: 0.3,
  },
  signalTriggered: {
    flex: 1,
    fontSize: 8,
    textAlign: 'center',
  },
  signalPoints: {
    flex: 1,
    fontSize: 8,
    color: '#8892a4',
    textAlign: 'right',
  },
  signalTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 4,
    marginBottom: 2,
  },
  signalHeaderText: {
    fontSize: 6,
    color: '#3d4a5c',
    letterSpacing: 1.2,
  },

  // --- Typologies ---
  typologiesSection: {
    marginTop: 10,
  },
  typologyRow: {
    marginBottom: 6,
  },
  typologyName: {
    fontSize: 8,
    color: '#ffd60a',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  typologyDesc: {
    fontSize: 7,
    color: '#8892a4',
    lineHeight: 1.5,
  },

  // --- Notes ---
  noteCard: {
    backgroundColor: '#080b14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    padding: 12,
    marginBottom: 10,
  },
  noteMeta: {
    fontSize: 7,
    color: '#3d4a5c',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  noteContent: {
    fontSize: 10,
    color: '#f0f4ff',
    lineHeight: 1.6,
  },

  // --- SAR Drafts ---
  sarBlock: {
    backgroundColor: '#080b14',
    borderWidth: 1,
    borderColor: 'rgba(255,59,59,0.15)',
    borderRadius: 2,
    padding: 14,
    marginBottom: 16,
  },
  sarAddressHeader: {
    fontSize: 8,
    color: '#ff3b3b',
    letterSpacing: 1,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  sarWarning: {
    fontSize: 7,
    color: '#ff8c00',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  sarText: {
    fontSize: 9,
    color: '#8892a4',
    lineHeight: 1.7,
  },

  // --- Misc ---
  dimText: {
    fontSize: 8,
    color: '#3d4a5c',
    letterSpacing: 0.5,
  },
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#8892a4'
  return (
    <Text style={{ fontSize: 8, color, letterSpacing: 1.5, fontFamily: 'Helvetica-Bold' }}>
      {formatStatus(status)}
    </Text>
  )
}

function RiskBadge({ level }: { level: string }) {
  const color = RISK_COLORS[level] ?? '#f0f4ff'
  return (
    <Text style={{ fontSize: 7, color, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold' }}>
      {level}
    </Text>
  )
}

function SignalsTable({ signals }: { signals: ScoringSignal[] }) {
  if (!signals || signals.length === 0) return null
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.signalsLabel}>RISK SIGNALS</Text>
      <View style={s.signalTableHeader}>
        <Text style={[s.signalHeaderText, { flex: 3 }]}>SIGNAL</Text>
        <Text style={[s.signalHeaderText, { flex: 1, textAlign: 'center' }]}>STATUS</Text>
        <Text style={[s.signalHeaderText, { flex: 1, textAlign: 'right' }]}>PTS</Text>
      </View>
      {signals.map((sig, i) => (
        <View key={i} style={s.signalRow}>
          <Text style={s.signalName}>{formatSignalName(sig.name)}</Text>
          <Text style={[s.signalTriggered, { color: sig.triggered ? '#ff3b3b' : '#00ff88' }]}>
            {sig.triggered ? '!' : '-'}
          </Text>
          <Text style={[s.signalPoints, { color: sig.score > 0 ? '#ff8c00' : '#3d4a5c' }]}>
            {sig.score > 0 ? `+${sig.score}` : '0'}
          </Text>
        </View>
      ))}
    </View>
  )
}

function TriggeredTypologies({ typologies }: { typologies: AMLTypology[] }) {
  const triggered = typologies?.filter(t => t.triggered) ?? []
  if (triggered.length === 0) return null
  return (
    <View style={s.typologiesSection}>
      <Text style={s.signalsLabel}>TYPOLOGIES DETECTED</Text>
      {triggered.map((t, i) => (
        <View key={i} style={s.typologyRow}>
          <Text style={s.typologyName}>{t.name}</Text>
          <Text style={s.typologyDesc}>{t.description}</Text>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main Document
// ---------------------------------------------------------------------------

export function CaseReportPDF({ caseData, addresses, notes }: CaseReportProps) {
  const generatedAt = fmtDateTime(new Date().toISOString())
  const sarAddresses = addresses.filter(a => a.sar_draft)

  return (
    <Document
      title={`ClearChain Case Report — ${caseData.title}`}
      author="ClearChain AML Intelligence"
      subject="Crypto AML Case Intelligence Report"
    >
      <Page size="A4" style={s.page}>
        {/* Fixed footer on every page */}
        <View fixed style={s.footer}>
          <Text style={s.footerLeft}>CLEARCHAIN — Crypto AML Intelligence</Text>
          <Text
            style={s.footerRight}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
        <View fixed style={s.footerDisclaimer}>
          <Text style={s.footerDisclaimerText}>
            Not legal advice. SAR drafts require review by a qualified BSA/AML officer before filing.
          </Text>
        </View>

        {/* ── Cover ── */}
        <Text style={s.wordmark}>CLEARCHAIN</Text>
        <Text style={s.coverSubtitle}>CASE INTELLIGENCE REPORT</Text>
        <View style={s.coverDivider} />

        <Text style={s.coverTitle}>{caseData.title}</Text>
        <StatusBadge status={caseData.status} />

        <View style={{ marginTop: 10 }}>
          <Text style={s.coverMetaText}>Generated: {generatedAt}</Text>
          <Text style={[s.coverMetaText, { marginTop: 3 }]}>
            Case ID: {caseData.id}
          </Text>
          <Text style={[s.coverMetaText, { marginTop: 3 }]}>
            Created: {fmtDate(caseData.created_at)}
          </Text>
        </View>

        {/* ── Case Summary ── */}
        <Text style={s.sectionHeader}>CASE SUMMARY</Text>
        <View style={s.sectionDivider} />

        {caseData.description ? (
          <Text style={s.descriptionText}>{caseData.description}</Text>
        ) : null}

        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>ADDRESSES SCREENED</Text>
            <Text style={s.statValue}>{addresses.length}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>DAYS OPEN</Text>
            <Text style={s.statValue}>{openDays(caseData.created_at)}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>NOTES ADDED</Text>
            <Text style={s.statValue}>{notes.length}</Text>
          </View>
        </View>

        {/* ── Addresses ── */}
        {addresses.length > 0 && (
          <>
            <Text style={s.sectionHeader}>ADDRESSES</Text>
            <View style={s.sectionDivider} />

            {addresses.map((addr, i) => {
              const riskColor = RISK_COLORS[addr.risk_level] ?? '#f0f4ff'
              return (
                <View key={i} style={s.addressBlock} wrap={false}>
                  <View style={s.addressHeader}>
                    <Text style={s.addressText}>{truncateAddr(addr.address)}</Text>
                    <View style={s.badgeRow}>
                      <Text style={s.chainBadge}>{addr.chain}</Text>
                      <RiskBadge level={addr.risk_level} />
                    </View>
                  </View>

                  <View style={s.riskScoreRow}>
                    <Text style={[s.riskScoreNumber, { color: riskColor }]}>
                      {addr.risk_score}
                    </Text>
                    <Text style={[s.riskScoreLabel, { color: riskColor }]}>
                      RISK SCORE
                    </Text>
                  </View>

                  <SignalsTable signals={addr.signals ?? []} />
                  <TriggeredTypologies typologies={addr.typologies ?? []} />
                </View>
              )
            })}
          </>
        )}

        {/* ── Notes ── */}
        {notes.length > 0 && (
          <>
            <Text style={s.sectionHeader}>NOTES</Text>
            <View style={s.sectionDivider} />

            {notes.map((note, i) => (
              <View key={i} style={s.noteCard}>
                <Text style={s.noteMeta}>
                  {note.author_name ?? 'Analyst'} · {fmtDateTime(note.created_at)}
                </Text>
                <Text style={s.noteContent}>{note.content}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── SAR Drafts ── */}
        {sarAddresses.length > 0 && (
          <>
            <Text style={s.sectionHeader}>SAR DRAFTS</Text>
            <View style={s.sectionDivider} />

            {sarAddresses.map((addr, i) => (
              <View key={i} style={s.sarBlock}>
                <Text style={s.sarAddressHeader}>{truncateAddr(addr.address)}</Text>
                <Text style={s.sarWarning}>
                  DRAFT — Requires review by qualified BSA/AML officer before filing.
                </Text>
                <Text style={s.sarText}>{addr.sar_draft}</Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  )
}
