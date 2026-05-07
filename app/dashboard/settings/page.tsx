'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { RiskProfile, SignalWeights, RiskThresholds } from '@/types'
import { DEFAULT_SIGNAL_WEIGHTS, DEFAULT_RISK_THRESHOLDS } from '@/types'

interface ApiKey {
  id: string
  label: string
  tier: string
  usage_count: number
  daily_usage_count: number
  daily_reset_at: string
  last_used_at: string | null
  created_at: string
  is_active: boolean
  webhook_url: string | null
}

const TIER_LIMITS: Record<string, number> = { free: 100, analyst: 2000, team: Infinity }

function RateLimitBar({ k }: { k: ApiKey }) {
  const limit = TIER_LIMITS[k.tier] ?? 100
  const now = Date.now()
  const windowExpired = now - new Date(k.daily_reset_at).getTime() > 24 * 60 * 60 * 1000
  const todayUsage = windowExpired ? 0 : k.daily_usage_count
  const pct = limit === Infinity ? 0 : Math.min(100, (todayUsage / limit) * 100)
  const barColor = pct > 90 ? '#ff3b3b' : pct > 70 ? '#ffd60a' : '#06b6d4'
  const resetMs = new Date(k.daily_reset_at).getTime() + 24 * 60 * 60 * 1000
  const msLeft = Math.max(0, resetMs - now)
  const hLeft = Math.floor(msLeft / 3600000)
  const mLeft = Math.floor((msLeft % 3600000) / 60000)
  const resetLabel = windowExpired ? 'now' : hLeft > 0 ? `${hLeft}h ${mLeft}m` : `${mLeft}m`
  const limitLabel = limit === Infinity ? '∞' : limit.toLocaleString()

  return (
    <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(6,182,212,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.16em', color: '#1e4d5c' }}>
          TODAY&apos;S USAGE
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: pct > 90 ? '#ff3b3b' : '#7ec8d8' }}>
          {todayUsage.toLocaleString()} / {limitLabel}
          {limit !== Infinity && (
            <span style={{ color: '#1e4d5c', marginLeft: 8 }}>resets in {resetLabel}</span>
          )}
        </span>
      </div>
      {limit !== Infinity && (
        <div style={{ height: 2, background: 'rgba(6,182,212,0.08)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 1, transition: 'width 0.3s ease' }} />
        </div>
      )}
      {limit === Infinity && (
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#06b6d4', letterSpacing: '0.08em' }}>Unlimited</div>
      )}
    </div>
  )
}

interface WebhookEdit {
  url: string
  secret: string
  secretVisible: boolean
  saving: boolean
  saved: boolean
  testing: boolean
  testResult: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(iso: string | null) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function defaultWebhookEdit(key: ApiKey): WebhookEdit {
  return { url: key.webhook_url ?? '', secret: '', secretVisible: false, saving: false, saved: false, testing: false, testResult: null }
}

// ---------------------------------------------------------------------------
// Signal display metadata
// ---------------------------------------------------------------------------

const SIGNAL_META: { key: keyof SignalWeights; label: string; defaultWeight: number }[] = [
  { key: 'ofac_match',             label: 'OFAC/SDN Match',           defaultWeight: 40 },
  { key: 'mixer_interaction',      label: 'Mixer/Tumbler Interaction', defaultWeight: 25 },
  { key: 'rapid_fund_movement',    label: 'Rapid Fund Movement',       defaultWeight: 15 },
  { key: 'high_risk_counterparty', label: 'High-Risk Counterparty',    defaultWeight: 10 },
  { key: 'indirect_exposure',      label: 'Indirect Exposure',         defaultWeight: 8  },
  { key: 'volume_anomaly',         label: 'Volume Anomaly',            defaultWeight: 5  },
  { key: 'community_red_flags',    label: 'Community Red Flags',       defaultWeight: 5  },
]

// ---------------------------------------------------------------------------
// RiskProfilesSection component
// ---------------------------------------------------------------------------

interface RiskProfilesSectionProps {
  profiles: RiskProfile[]
  loading: boolean
  showForm: boolean
  editingProfile: RiskProfile | null
  draftName: string
  draftWeights: SignalWeights
  draftThresholds: RiskThresholds
  thresholdError: string | null
  profileError: string | null
  profileSaving: boolean
  activatingId: string | null
  deletingId: string | null
  onOpenNew: () => void
  onOpenEdit: (p: RiskProfile) => void
  onClose: () => void
  onSave: (e: React.FormEvent) => void
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onDraftNameChange: (v: string) => void
  onDraftWeightChange: (key: keyof SignalWeights, val: number) => void
  onDraftThresholdChange: (key: keyof RiskThresholds, val: number) => void
}

function RiskProfilesSection({
  profiles, loading, showForm, editingProfile,
  draftName, draftWeights, draftThresholds,
  thresholdError, profileError, profileSaving,
  activatingId, deletingId,
  onOpenNew, onOpenEdit, onClose, onSave, onActivate, onDelete,
  onDraftNameChange, onDraftWeightChange, onDraftThresholdChange,
}: RiskProfilesSectionProps) {

  const inputStyle: React.CSSProperties = {
    background: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#ecfeff',
    fontSize: 13, padding: '8px 0', outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)', width: '100%',
  }

  // Total weight for normalization note
  const totalWeight = Object.values(draftWeights).reduce((a, b) => a + b, 0)
  const maxBarWeight = Math.max(...Object.values(draftWeights), 1)

  // Live preview: how would a 65-raw-pt wallet look under this profile?
  const PREVIEW_RAW = 65
  const previewTotal = totalWeight > 0 ? Math.min(100, Math.round((PREVIEW_RAW / totalWeight) * 100)) : 0
  const previewLevel =
    previewTotal >= draftThresholds.critical ? 'CRITICAL' :
    previewTotal >= draftThresholds.high ? 'HIGH' :
    previewTotal >= draftThresholds.medium ? 'MEDIUM' : 'LOW'
  const previewColor =
    previewLevel === 'CRITICAL' ? '#ff3b3b' :
    previewLevel === 'HIGH' ? '#ff8c00' :
    previewLevel === 'MEDIUM' ? '#ffd60a' : '#22d3ee'

  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#7ec8d8' }}>RISK PROFILES</div>
        {!showForm && (
          <button
            onClick={onOpenNew}
            style={{ padding: '8px 18px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            + NEW PROFILE
          </button>
        )}
      </div>

      {/* Profile editor */}
      {showForm && (
        <form onSubmit={onSave} className="glass" style={{ borderRadius: 4, padding: '24px', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#7ec8d8', marginBottom: 20 }}>
            {editingProfile ? 'EDIT PROFILE' : 'NEW PROFILE'}
          </div>

          {/* Name */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 6 }}>PROFILE NAME</label>
            <input
              type="text"
              value={draftName}
              onChange={e => onDraftNameChange(e.target.value)}
              placeholder="e.g. Conservative Compliance, Exchange Monitoring..."
              maxLength={60}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Signal Weights */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 14 }}>SIGNAL WEIGHTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SIGNAL_META.map(({ key, label }) => {
                const val = draftWeights[key]
                const barPct = maxBarWeight > 0 ? (val / maxBarWeight) * 100 : 0
                return (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#7ec8d8' }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={e => {
                        const n = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))
                        onDraftWeightChange(key, n)
                      }}
                      style={{ ...inputStyle, width: '100%', fontSize: 12, textAlign: 'right' }}
                    />
                    <div style={{ height: 4, background: 'rgba(6,182,212,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: '#06b6d4', borderRadius: 2, transition: 'width 0.15s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: totalWeight === 100 ? '#06b6d4' : '#ffd60a', letterSpacing: '0.08em' }}>
              TOTAL WEIGHT: {totalWeight} pts{totalWeight !== 100 ? ` — normalizes to 100` : ''}
            </div>
          </div>

          {/* Risk Thresholds */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 14 }}>RISK THRESHOLDS (normalized score)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {([
                { key: 'medium' as keyof RiskThresholds, label: 'MEDIUM CUTOFF', color: '#ffd60a' },
                { key: 'high' as keyof RiskThresholds, label: 'HIGH CUTOFF', color: '#ff8c00' },
                { key: 'critical' as keyof RiskThresholds, label: 'CRITICAL CUTOFF', color: '#ff3b3b' },
              ]).map(({ key, label, color }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color, marginBottom: 6 }}>{label}</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={draftThresholds[key]}
                    onChange={e => {
                      const n = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1))
                      onDraftThresholdChange(key, n)
                    }}
                    style={{ ...inputStyle, fontSize: 18, fontWeight: 700, color }}
                  />
                </div>
              ))}
            </div>
            {thresholdError && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)' }}>{thresholdError}</div>
            )}
          </div>

          {/* Live Preview */}
          <div style={{ marginBottom: 24, background: 'rgba(6,182,212,0.03)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 4, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 10 }}>LIVE PREVIEW — wallet scoring 65 raw pts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 28, fontWeight: 700, color: previewColor }}>{previewTotal}</div>
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: previewColor, fontWeight: 700 }}>{previewLevel}</div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#1e4d5c', marginTop: 2 }}>
                  {totalWeight !== 100 ? `${PREVIEW_RAW}/${totalWeight} raw → normalized` : `${PREVIEW_RAW} pts`}
                </div>
              </div>
              <div style={{ flex: 1, height: 4, background: 'rgba(6,182,212,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${previewTotal}%`, background: previewColor, borderRadius: 2, transition: 'width 0.15s ease' }} />
              </div>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#1e4d5c', letterSpacing: '0.06em' }}>
              LOW &lt;{draftThresholds.medium} &nbsp;|&nbsp; MEDIUM {draftThresholds.medium}–{draftThresholds.high - 1} &nbsp;|&nbsp; HIGH {draftThresholds.high}–{draftThresholds.critical - 1} &nbsp;|&nbsp; CRITICAL {draftThresholds.critical}+
            </div>
          </div>

          {profileError && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)' }}>{profileError}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={profileSaving}
              style={{ padding: '8px 20px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: profileSaving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: profileSaving ? 0.5 : 1 }}
            >
              {profileSaving ? 'SAVING...' : 'SAVE'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#7ec8d8', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}>
              CANCEL
            </button>
          </div>
        </form>
      )}

      {/* Profile list */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#1e4d5c', fontSize: 13 }}>Loading...</div>
      ) : profiles.length === 0 && !showForm ? (
        <div className="glass" style={{ borderRadius: 4, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#7ec8d8', letterSpacing: '0.12em', marginBottom: 12 }}>NO CUSTOM PROFILES</div>
          <div style={{ fontSize: 13, color: '#1e4d5c', lineHeight: 1.7, marginBottom: 24, maxWidth: 440, margin: '0 auto 24px' }}>
            ClearChain&apos;s standard methodology is active by default.<br />
            Create a profile to customize signal weights and risk thresholds<br />
            for your institution&apos;s compliance requirements.
          </div>
          <button
            onClick={onOpenNew}
            style={{ padding: '10px 24px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            CREATE YOUR FIRST PROFILE
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {profiles.map(profile => {
            const isActive = profile.is_active
            const totalW = Object.values(profile.signal_weights).reduce((a, b) => a + b, 0)
            const maxW = Math.max(...Object.values(profile.signal_weights), 1)
            return (
              <div
                key={profile.id}
                className="glass"
                style={{
                  borderRadius: 4,
                  borderLeft: isActive ? '3px solid #06b6d4' : '3px solid transparent',
                  opacity: showForm && editingProfile?.id !== profile.id ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Header */}
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color: '#ecfeff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#1e4d5c', letterSpacing: '0.08em' }}>
                      {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  {isActive && (
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 2, padding: '2px 6px' }}>ACTIVE</span>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!isActive && (
                      <button
                        onClick={() => onActivate(profile.id)}
                        disabled={activatingId === profile.id}
                        style={{ padding: '6px 12px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 4, color: '#06b6d4', fontSize: 10, letterSpacing: '0.1em', cursor: activatingId === profile.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: activatingId === profile.id ? 0.5 : 1 }}
                      >
                        {activatingId === profile.id ? '...' : 'SET ACTIVE'}
                      </button>
                    )}
                    <button
                      onClick={() => onOpenEdit(profile)}
                      disabled={!!showForm}
                      style={{ padding: '6px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#7ec8d8', fontSize: 10, letterSpacing: '0.1em', cursor: showForm ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: showForm ? 0.4 : 1 }}
                    >
                      EDIT
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => onDelete(profile.id)}
                        disabled={deletingId === profile.id}
                        style={{ padding: '6px 12px', background: 'none', border: 'none', color: '#ff3b3b', fontSize: 10, letterSpacing: '0.1em', cursor: deletingId === profile.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: deletingId === profile.id ? 0.5 : 1 }}
                      >
                        {deletingId === profile.id ? '...' : 'DELETE'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Signal weight table */}
                <div style={{ borderTop: '1px solid rgba(6,182,212,0.05)', padding: '14px 20px' }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 10 }}>SIGNAL WEIGHTS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SIGNAL_META.map(({ key, label }) => {
                      const w = profile.signal_weights[key]
                      const barPct = maxW > 0 ? (w / maxW) * 100 : 0
                      return (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 80px', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#7ec8d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#ecfeff', textAlign: 'right' }}>{w}</span>
                          <div style={{ height: 3, background: 'rgba(6,182,212,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: '#06b6d4', borderRadius: 2 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#1e4d5c', letterSpacing: '0.06em' }}>
                    TOTAL: {totalW} pts{totalW !== 100 ? ' — normalized to 100' : ''}
                  </div>
                </div>

                {/* Thresholds */}
                <div style={{ borderTop: '1px solid rgba(6,182,212,0.05)', padding: '12px 20px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    { label: 'LOW', range: `<${profile.risk_thresholds.medium}`, color: '#22d3ee' },
                    { label: 'MEDIUM', range: `${profile.risk_thresholds.medium}–${profile.risk_thresholds.high - 1}`, color: '#ffd60a' },
                    { label: 'HIGH', range: `${profile.risk_thresholds.high}–${profile.risk_thresholds.critical - 1}`, color: '#ff8c00' },
                    { label: 'CRITICAL', range: `${profile.risk_thresholds.critical}+`, color: '#ff3b3b' },
                  ].map(({ label, range, color }) => (
                    <div key={label}>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color, letterSpacing: '0.1em' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#1e4d5c', marginLeft: 6 }}>{range}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  // API keys state
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  // Webhook edit state keyed by api key id
  const [webhookEdits, setWebhookEdits] = useState<Record<string, WebhookEdit>>({})

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollData, setEnrollData] = useState<{ id: string; qrCode: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)

  // Risk profiles state
  const [profiles, setProfiles] = useState<RiskProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<RiskProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Profile editor draft state
  const [draftName, setDraftName] = useState('')
  const [draftWeights, setDraftWeights] = useState<SignalWeights>({ ...DEFAULT_SIGNAL_WEIGHTS })
  const [draftThresholds, setDraftThresholds] = useState<RiskThresholds>({ ...DEFAULT_RISK_THRESHOLDS })
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserEmail(user.email ?? '')

      const [{ data: keysData }, { data: factors }, { data: profilesData }] = await Promise.all([
        supabase
          .from('api_keys')
          .select('id, label, tier, usage_count, daily_usage_count, daily_reset_at, last_used_at, created_at, is_active, webhook_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.auth.mfa.listFactors(),
        supabase
          .from('risk_profiles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      const loadedKeys = (keysData as ApiKey[] ?? [])
      setKeys(loadedKeys)

      // Init webhook edit state from loaded keys
      const edits: Record<string, WebhookEdit> = {}
      for (const k of loadedKeys) edits[k.id] = defaultWebhookEdit(k)
      setWebhookEdits(edits)

      const totpFactors = factors?.totp ?? []
      if (totpFactors.length > 0) {
        setTwoFactorEnabled(true)
        setFactorId(totpFactors[0].id)
      }

      setProfiles((profilesData as RiskProfile[]) ?? [])
      setProfilesLoading(false)
      setLoading(false)
    }
    load()
  }, [])

  // ── Webhook edit helpers ─────────────────────────────────────────────────

  function patchWebhookEdit(id: string, patch: Partial<WebhookEdit>) {
    setWebhookEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleSaveWebhook(keyId: string) {
    const edit = webhookEdits[keyId]
    if (!edit) return
    patchWebhookEdit(keyId, { saving: true, testResult: null })

    const body: Record<string, string | null> = { id: keyId, webhook_url: edit.url.trim() || null }
    if (edit.secret.trim()) body.webhook_secret = edit.secret.trim()

    const res = await fetch('/api/apikeys', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (json.success) {
      const newUrl = (json.key as ApiKey).webhook_url
      setKeys(prev => prev.map(k => k.id === keyId ? { ...k, webhook_url: newUrl } : k))
      patchWebhookEdit(keyId, { saving: false, saved: true, url: newUrl ?? '', secret: '' })
      setTimeout(() => patchWebhookEdit(keyId, { saved: false }), 2000)
    } else {
      patchWebhookEdit(keyId, { saving: false, testResult: `Error: ${json.error ?? 'Save failed'}` })
    }
  }

  async function handleClearWebhook(keyId: string) {
    patchWebhookEdit(keyId, { saving: true, testResult: null })
    const res = await fetch('/api/apikeys', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: keyId, webhook_url: null }),
    })
    const json = await res.json()
    if (json.success) {
      setKeys(prev => prev.map(k => k.id === keyId ? { ...k, webhook_url: null } : k))
      patchWebhookEdit(keyId, { saving: false, url: '', secret: '', testResult: null })
    } else {
      patchWebhookEdit(keyId, { saving: false })
    }
  }

  async function handleTestWebhook(keyId: string) {
    patchWebhookEdit(keyId, { testing: true, testResult: null })
    const res = await fetch('/api/apikeys/test-webhook', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: keyId }),
    })
    const json = await res.json()
    if (json.ok) {
      patchWebhookEdit(keyId, { testing: false, testResult: 'SENT — endpoint responded successfully.' })
    } else {
      patchWebhookEdit(keyId, { testing: false, testResult: `FAILED — ${json.error ?? 'Unknown error'}` })
    }
  }

  // ── API key handlers ──────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setGenerating(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rawKey = `ck_live_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`

    const res = await fetch('/api/apikeys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', rawKey, label: newLabel.trim() }),
    })
    const json = await res.json()

    if (json.success) {
      const newKey = { ...json.key, webhook_url: null } as ApiKey
      setKeys(prev => [newKey, ...prev])
      setWebhookEdits(prev => ({ ...prev, [newKey.id]: defaultWebhookEdit(newKey) }))
      setRevealedKey(rawKey)
      setNewLabel('')
      setShowForm(false)
    }

    setGenerating(false)
  }

  async function handleRevoke(id: string) {
    setRevoking(id)
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id)
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k))
    setRevoking(null)
  }

  function handleCopyKey() {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey).then(() => {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 1500)
    })
  }

  // ── Risk Profile handlers ─────────────────────────────────────────────────

  const openNewProfileForm = useCallback(() => {
    setEditingProfile(null)
    setDraftName('')
    setDraftWeights({ ...DEFAULT_SIGNAL_WEIGHTS })
    setDraftThresholds({ ...DEFAULT_RISK_THRESHOLDS })
    setThresholdError(null)
    setProfileError(null)
    setShowProfileForm(true)
  }, [])

  const openEditProfileForm = useCallback((p: RiskProfile) => {
    setEditingProfile(p)
    setDraftName(p.name)
    setDraftWeights({ ...p.signal_weights })
    setDraftThresholds({ ...p.risk_thresholds })
    setThresholdError(null)
    setProfileError(null)
    setShowProfileForm(true)
  }, [])

  const closeProfileForm = useCallback(() => {
    setShowProfileForm(false)
    setEditingProfile(null)
    setProfileError(null)
    setThresholdError(null)
  }, [])

  function validateThresholdDraft(t: RiskThresholds): string | null {
    if (t.medium >= t.high) return 'MEDIUM cutoff must be less than HIGH cutoff.'
    if (t.high >= t.critical) return 'HIGH cutoff must be less than CRITICAL cutoff.'
    if (t.medium < 1 || t.high < 1 || t.critical < 1) return 'All thresholds must be at least 1.'
    if (t.medium > 99 || t.high > 99 || t.critical > 99) return 'All thresholds must be at most 99.'
    return null
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    const tErr = validateThresholdDraft(draftThresholds)
    if (tErr) { setThresholdError(tErr); return }
    if (!draftName.trim()) { setProfileError('Profile name is required.'); return }

    setProfileSaving(true)
    setProfileError(null)

    const url = editingProfile ? `/api/profiles/${editingProfile.id}` : '/api/profiles'
    const method = editingProfile ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draftName.trim(), signal_weights: draftWeights, risk_thresholds: draftThresholds }),
    })
    const json = await res.json()

    if (!res.ok) {
      setProfileError(json.error ?? 'Save failed.')
      setProfileSaving(false)
      return
    }

    const saved = json.profile as RiskProfile
    if (editingProfile) {
      setProfiles(prev => prev.map(p => p.id === saved.id ? saved : p))
    } else {
      setProfiles(prev => [saved, ...prev])
    }
    setProfileSaving(false)
    closeProfileForm()
  }

  async function handleActivateProfile(id: string) {
    setActivatingId(id)
    const res = await fetch(`/api/profiles/${id}/activate`, { method: 'POST', credentials: 'include' })
    const json = await res.json()
    if (res.ok && json.profile) {
      setProfiles(prev => prev.map(p => ({ ...p, is_active: p.id === id })))
    }
    setActivatingId(null)
  }

  async function handleDeleteProfile(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE', credentials: 'include' })
    const json = await res.json()
    if (res.ok) {
      setProfiles(prev => prev.filter(p => p.id !== id))
    } else {
      alert(json.error ?? 'Delete failed.')
    }
    setDeletingId(null)
  }

  // ── 2FA handlers ──────────────────────────────────────────────────────────

  async function handleStartEnroll() {
    setEnrolling(true)
    setVerifyError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) {
      setVerifyError(error?.message ?? 'Enrollment failed.')
      setEnrolling(false)
      return
    }
    setEnrollData({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    setEnrolling(false)
  }

  async function handleVerifyAndActivate() {
    if (!enrollData || totpCode.length !== 6) return
    setVerifying(true)
    setVerifyError('')

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.id })
    if (challengeErr || !challenge) {
      setVerifyError(challengeErr?.message ?? 'Challenge failed.')
      setVerifying(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollData.id,
      challengeId: challenge.id,
      code: totpCode,
    })
    if (verifyErr) {
      setVerifyError('Invalid code. Please try again.')
      setTotpCode('')
      setVerifying(false)
      return
    }

    setTwoFactorEnabled(true)
    setFactorId(enrollData.id)
    setEnrollData(null)
    setTotpCode('')
    setVerifying(false)
  }

  async function handleDisable() {
    if (!factorId) return
    setDisabling(true)
    await supabase.auth.mfa.unenroll({ factorId })
    setTwoFactorEnabled(false)
    setFactorId(null)
    setDisabling(false)
  }

  function handleCopySecret() {
    if (!enrollData?.secret) return
    navigator.clipboard.writeText(enrollData.secret).then(() => {
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 1500)
    })
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent', border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#ecfeff',
    fontSize: 13, padding: '8px 0', outline: 'none',
    fontFamily: 'var(--font-jetbrains-mono)', width: '100%',
  }

  const tierColor = (tier: string) =>
    tier === 'team' ? '#06b6d4' : tier === 'analyst' ? '#ffd60a' : '#7ec8d8'

  const isPro = (tier: string) => tier !== 'free'

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: '#ecfeff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(6,182,212,0.08)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, background: 'rgba(0,8,15,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#22d3ee', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none', animation: 'glitch 6s steps(1) infinite' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/dashboard/cases" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Cases</a>
          <a href="/dashboard/watchlist" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Watchlist</a>
          <a href="/dashboard/bulk" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Bulk Screen</a>
          <a href="/dashboard/settings" style={{ fontSize: 12, color: '#06b6d4', textDecoration: 'none', letterSpacing: '0.08em' }}>Settings</a>
          <a href="/intel" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)' }}>{userEmail}</span>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/auth/login') }} style={{ fontSize: 12, color: '#7ec8d8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 8 }}>ACCOUNT</div>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 32, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>Settings</h1>
        <p style={{ fontSize: 14, color: '#7ec8d8', margin: '0 0 40px', lineHeight: 1.6 }}>
          Manage your API keys, webhooks, and account security.
        </p>

        {/* One-time reveal */}
        {revealedKey && (
          <div style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 4, padding: '20px 24px', marginBottom: 32 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#06b6d4', marginBottom: 12 }}>
              API KEY GENERATED — COPY NOW. IT WON&apos;T BE SHOWN AGAIN.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color: '#ecfeff', background: '#001824', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 14px', flex: 1, wordBreak: 'break-all' }}>
                {revealedKey}
              </code>
              <button onClick={handleCopyKey} style={{ padding: '8px 18px', background: copiedKey ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {copiedKey ? 'COPIED' : 'COPY'}
              </button>
              <button onClick={() => setRevealedKey(null)} style={{ padding: '8px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#7ec8d8', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Risk Profiles section ── */}
        <RiskProfilesSection
          profiles={profiles}
          loading={profilesLoading}
          showForm={showProfileForm}
          editingProfile={editingProfile}
          draftName={draftName}
          draftWeights={draftWeights}
          draftThresholds={draftThresholds}
          thresholdError={thresholdError}
          profileError={profileError}
          profileSaving={profileSaving}
          activatingId={activatingId}
          deletingId={deletingId}
          onOpenNew={openNewProfileForm}
          onOpenEdit={openEditProfileForm}
          onClose={closeProfileForm}
          onSave={handleSaveProfile}
          onActivate={handleActivateProfile}
          onDelete={handleDeleteProfile}
          onDraftNameChange={setDraftName}
          onDraftWeightChange={(key, val) => setDraftWeights(prev => ({ ...prev, [key]: val }))}
          onDraftThresholdChange={(key, val) => {
            setDraftThresholds(prev => ({ ...prev, [key]: val }))
            setThresholdError(null)
          }}
        />

        <div style={{ borderTop: '1px solid rgba(6,182,212,0.08)', marginBottom: 48 }} />

        {/* ── API Keys section ── */}
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#7ec8d8', marginBottom: 20 }}>API KEYS</div>

        {/* Rate limits */}
        <div className="glass" style={{ borderRadius: 4, padding: '20px 24px', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 16 }}>RATE LIMITS BY TIER</div>
          <div style={{ display: 'flex' }}>
            {[
              { tier: 'FREE', limit: '100 req / day', color: '#7ec8d8' },
              { tier: 'ANALYST', limit: '2,000 req / day', color: '#ffd60a' },
              { tier: 'TEAM', limit: 'Unlimited', color: '#06b6d4' },
            ].map(({ tier, limit, color }, i) => (
              <div key={tier} style={{ flex: 1, padding: '14px 16px', borderLeft: i > 0 ? '1px solid rgba(6,182,212,0.08)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color, marginBottom: 6, letterSpacing: '0.1em' }}>{tier}</div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#ecfeff' }}>{limit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Generate header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#7ec8d8' }}>YOUR KEYS</div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{ padding: '8px 18px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            + Generate New Key
          </button>
        </div>

        {/* Generate form */}
        {showForm && (
          <form onSubmit={handleGenerate} className="glass" style={{ borderRadius: 4, padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 8, fontFamily: 'var(--font-jetbrains-mono)' }}>KEY LABEL</label>
              <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. My App, CI/CD Pipeline..." style={inputStyle} autoFocus />
            </div>
            <button type="submit" disabled={generating || !newLabel.trim()} style={{ padding: '8px 20px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 4, color: '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0, opacity: !newLabel.trim() ? 0.5 : 1 }}>
              {generating ? 'CREATING...' : 'CREATE'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: '#7ec8d8', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
              Cancel
            </button>
          </form>
        )}

        {/* Key cards */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#1e4d5c', fontSize: 13 }}>Loading...</div>
        ) : keys.length === 0 ? (
          <div className="glass" style={{ padding: '40px', textAlign: 'center', color: '#1e4d5c', fontSize: 13, borderRadius: 4 }}>
            No API keys yet. Generate one to start building.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {keys.map(k => {
              const edit = webhookEdits[k.id] ?? defaultWebhookEdit(k)
              const pro = isPro(k.tier)
              return (
                <div key={k.id} className="glass" style={{ borderRadius: 4, opacity: k.is_active ? 1 : 0.45 }}>
                  {/* Key metadata row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '14px 20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: 120 }}>
                      <div style={{ fontSize: 13, color: '#ecfeff', fontFamily: 'var(--font-jetbrains-mono)', marginBottom: 2 }}>{k.label}</div>
                      <div style={{ fontSize: 10, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em' }}>{fmtDate(k.created_at)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: tierColor(k.tier), fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700 }}>
                        {k.tier.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em', marginBottom: 2 }}>USAGE</div>
                      <div style={{ fontSize: 12, color: '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)' }}>{k.usage_count.toLocaleString()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em', marginBottom: 2 }}>LAST USED</div>
                      <div style={{ fontSize: 12, color: '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtRelative(k.last_used_at)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: k.is_active ? '#06b6d4' : '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {k.is_active ? 'ACTIVE' : 'REVOKED'}
                      </span>
                    </div>
                    {k.is_active && (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        disabled={revoking === k.id}
                        style={{ fontSize: 11, color: '#ff3b3b', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', fontFamily: 'var(--font-jetbrains-mono)', opacity: revoking === k.id ? 0.5 : 1, padding: 0 }}
                      >
                        {revoking === k.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>

                  {/* Rate limit bar */}
                  <RateLimitBar k={k} />

                  {/* Webhook subsection */}
                  <div style={{ borderTop: '1px solid rgba(6,182,212,0.05)', padding: '16px 20px' }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.18em', color: '#1e4d5c', marginBottom: 12 }}>WEBHOOK</div>

                    {!pro ? (
                      <div style={{ fontSize: 12, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.06em' }}>
                        Webhooks available on Analyst &amp; Team tiers
                      </div>
                    ) : (
                      <>
                        {/* URL row */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 6, fontFamily: 'var(--font-jetbrains-mono)' }}>WEBHOOK URL</label>
                            <input
                              type="text"
                              value={edit.url}
                              onChange={e => patchWebhookEdit(k.id, { url: e.target.value, testResult: null })}
                              placeholder="https://your-server.com/webhook"
                              disabled={!k.is_active}
                              style={{ ...inputStyle, fontSize: 12 }}
                            />
                          </div>
                          {/* Clear button */}
                          {edit.url.trim() && (
                            <button
                              onClick={() => patchWebhookEdit(k.id, { url: '' })}
                              title="Clear URL"
                              style={{ padding: '8px 10px', background: 'none', border: 'none', color: '#1e4d5c', fontSize: 14, cursor: 'pointer', lineHeight: 1, flexShrink: 0, paddingBottom: 9 }}
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* Secret row */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 16 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: '#1e4d5c', marginBottom: 6, fontFamily: 'var(--font-jetbrains-mono)' }}>SIGNING SECRET</label>
                            <input
                              type={edit.secretVisible ? 'text' : 'password'}
                              value={edit.secret}
                              onChange={e => patchWebhookEdit(k.id, { secret: e.target.value })}
                              placeholder="Optional — used to verify payloads"
                              disabled={!k.is_active}
                              style={{ ...inputStyle, fontSize: 12 }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => patchWebhookEdit(k.id, { secretVisible: !edit.secretVisible })}
                            style={{ padding: '8px 10px', background: 'none', border: 'none', color: '#1e4d5c', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em', flexShrink: 0, paddingBottom: 9 }}
                          >
                            {edit.secretVisible ? 'HIDE' : 'SHOW'}
                          </button>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleSaveWebhook(k.id)}
                            disabled={edit.saving || !k.is_active}
                            style={{
                              padding: '7px 16px',
                              background: edit.saved ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.08)',
                              border: `1px solid ${edit.saved ? 'rgba(6,182,212,0.4)' : 'rgba(6,182,212,0.25)'}`,
                              borderRadius: 4,
                              color: '#06b6d4',
                              fontSize: 10,
                              letterSpacing: '0.12em',
                              cursor: edit.saving ? 'not-allowed' : 'pointer',
                              fontFamily: 'var(--font-jetbrains-mono)',
                              opacity: edit.saving ? 0.6 : 1,
                            }}
                          >
                            {edit.saving ? 'SAVING...' : edit.saved ? 'SAVED' : 'SAVE'}
                          </button>

                          {k.webhook_url && (
                            <button
                              onClick={() => handleTestWebhook(k.id)}
                              disabled={edit.testing || !k.is_active}
                              style={{
                                padding: '7px 16px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 4,
                                color: '#7ec8d8',
                                fontSize: 10,
                                letterSpacing: '0.12em',
                                cursor: edit.testing ? 'not-allowed' : 'pointer',
                                fontFamily: 'var(--font-jetbrains-mono)',
                                opacity: edit.testing ? 0.6 : 1,
                              }}
                            >
                              {edit.testing ? 'SENDING...' : 'TEST'}
                            </button>
                          )}

                          {k.webhook_url && (
                            <button
                              onClick={() => handleClearWebhook(k.id)}
                              disabled={edit.saving}
                              style={{ padding: '7px 12px', background: 'none', border: 'none', color: '#1e4d5c', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}
                            >
                              Clear URL
                            </button>
                          )}
                        </div>

                        {edit.testResult && (
                          <div style={{
                            marginTop: 10,
                            fontSize: 11,
                            fontFamily: 'var(--font-jetbrains-mono)',
                            color: edit.testResult.startsWith('SENT') ? '#06b6d4' : '#ff3b3b',
                            letterSpacing: '0.04em',
                          }}>
                            {edit.testResult}
                          </div>
                        )}

                        {k.webhook_url && (
                          <div style={{ marginTop: 8, fontSize: 10, color: '#1e4d5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.04em' }}>
                            Active: {k.webhook_url}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Usage example */}
        <div className="glass" style={{ marginTop: 48, padding: '24px', borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 14 }}>USAGE EXAMPLE</div>
          <pre style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#7ec8d8', margin: 0, lineHeight: 1.7, overflowX: 'auto' }}>
            <span style={{ color: '#1e4d5c' }}>curl</span>{` -X POST https://clearchain.vercel.app/api/v1/analyze \\
  `}<span style={{ color: '#ffd60a' }}>-H</span>{` "Authorization: Bearer ck_live_your_key_here" \\
  `}<span style={{ color: '#ffd60a' }}>-H</span>{` "Content-Type: application/json" \\
  `}<span style={{ color: '#ffd60a' }}>-d</span>{` '{"address":"vitalik.eth","chain":"ETH"}'`}
          </pre>
          <div style={{ marginTop: 12 }}>
            <a href="/api-docs" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#06b6d4', textDecoration: 'none', letterSpacing: '0.08em' }}>
              Full API docs →
            </a>
          </div>
        </div>

        {/* ── Security section ── */}
        <div style={{ marginTop: 64, borderTop: '1px solid rgba(6,182,212,0.08)', paddingTop: 48 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#7ec8d8', marginBottom: 20 }}>SECURITY</div>

          <div className="glass" style={{ borderRadius: 4, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#7ec8d8', marginBottom: 6 }}>
                  TWO-FACTOR AUTHENTICATION
                </div>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.12em', color: twoFactorEnabled ? '#06b6d4' : '#1e4d5c', fontWeight: 700 }}>
                  {loading ? '...' : twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </div>
              </div>
            </div>

            {!loading && twoFactorEnabled && !enrollData && (
              <>
                <div style={{ fontSize: 13, color: '#7ec8d8', marginBottom: 20, lineHeight: 1.6 }}>
                  Your account is protected with TOTP authentication.
                </div>
                <button
                  onClick={handleDisable}
                  disabled={disabling}
                  style={{ padding: '8px 18px', background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 4, color: '#ff3b3b', fontSize: 11, letterSpacing: '0.1em', cursor: disabling ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: disabling ? 0.5 : 1 }}>
                  {disabling ? 'DISABLING...' : 'DISABLE 2FA'}
                </button>
              </>
            )}

            {!loading && !twoFactorEnabled && !enrollData && (
              <>
                <div style={{ fontSize: 13, color: '#7ec8d8', marginBottom: 20, lineHeight: 1.6 }}>
                  Add an extra layer of security. You&apos;ll need an authenticator app (Google Authenticator, Authy, 1Password).
                </div>
                <button
                  onClick={handleStartEnroll}
                  disabled={enrolling}
                  style={{ padding: '8px 18px', background: enrolling ? 'rgba(255,255,255,0.03)' : 'rgba(6,182,212,0.1)', border: `1px solid ${enrolling ? 'rgba(6,182,212,0.08)' : 'rgba(6,182,212,0.3)'}`, borderRadius: 4, color: enrolling ? '#1e4d5c' : '#06b6d4', fontSize: 11, letterSpacing: '0.1em', cursor: enrolling ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}>
                  {enrolling ? 'LOADING...' : 'ENABLE 2FA'}
                </button>
                {verifyError && !enrollData && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)' }}>{verifyError}</div>
                )}
              </>
            )}

            {enrollData && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, color: '#7ec8d8', marginBottom: 20, lineHeight: 1.6 }}>
                  Scan this QR code with your authenticator app, then enter the 6-digit code to activate.
                </div>
                <div style={{ marginBottom: 20 }}>
                  <img src={enrollData.qrCode} alt="2FA QR Code" style={{ width: 160, height: 160, borderRadius: 4, background: '#fff', padding: 8, display: 'block' }} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 8 }}>BACKUP SECRET — save this somewhere safe</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#7ec8d8', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '8px 12px', letterSpacing: '0.08em', flex: 1, wordBreak: 'break-all' }}>
                      {enrollData.secret}
                    </code>
                    <button onClick={handleCopySecret} style={{ padding: '8px 14px', background: secretCopied ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: secretCopied ? '#06b6d4' : '#7ec8d8', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {secretCopied ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c', marginBottom: 8 }}>ENTER CODE FROM APP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCode}
                    onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setVerifyError('') }}
                    placeholder="000000"
                    autoFocus
                    style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${verifyError ? 'rgba(255,59,59,0.4)' : 'rgba(255,255,255,0.12)'}`, color: '#ecfeff', fontSize: 22, fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.3em', padding: '8px 0', outline: 'none', width: 160 }}
                  />
                </div>
                {verifyError && <div style={{ marginBottom: 16, fontSize: 12, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)' }}>{verifyError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleVerifyAndActivate}
                    disabled={verifying || totpCode.length !== 6}
                    style={{ padding: '9px 20px', background: totpCode.length === 6 && !verifying ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${totpCode.length === 6 && !verifying ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.08)'}`, borderRadius: 4, color: totpCode.length === 6 && !verifying ? '#06b6d4' : '#1e4d5c', fontSize: 11, letterSpacing: '0.12em', cursor: totpCode.length === 6 && !verifying ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-jetbrains-mono)' }}>
                    {verifying ? 'VERIFYING...' : 'VERIFY & ACTIVATE'}
                  </button>
                  <button onClick={() => { setEnrollData(null); setTotpCode(''); setVerifyError('') }} style={{ padding: '9px 14px', background: 'none', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, color: '#7ec8d8', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
