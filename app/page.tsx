'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import type { WalletAnalysis, ScoringSignal, RiskLevel } from '@/types';
import RiskScoreCard from '@/components/RiskScoreCard';
import TiltCard from '@/components/TiltCard';
import TypologyCard from '@/components/TypologyCard';
import NarrativeCard from '@/components/NarrativeCard';
import SARDraftCard from '@/components/SARDraftCard';
import SimulatorCard from '@/components/SimulatorCard';
import TransactionBreakdown from '@/components/TransactionBreakdown';
import TransactionGraph from '@/components/TransactionGraph';
import FundFlowDiagram from '@/components/FundFlowDiagram';
import TransactionTimeline from '@/components/TransactionTimeline';
import SkeletonLoader from '@/components/SkeletonLoader';
import TerminalLoader from '@/components/TerminalLoader';
import ExportButton from '@/components/ExportButton';
import AddToWatchlistButton from '@/components/AddToWatchlistButton';
import InfoTooltip from '@/components/InfoTooltip';
const WaitlistBar = dynamic(() => import('@/components/WaitlistBar'), { ssr: false });

// HexTicker uses Math.random() during initial useState — must be ssr: false to
// avoid React #418 hydration mismatch (server bytes !== client bytes).
const HexTicker = dynamic(() => import('@/components/HexTicker'), { ssr: false });
import { getLabel } from '@/lib/labels';
import { createClient } from '@/lib/supabase/client';
import { useCountUp } from '@/lib/useCountUp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TORNADO_CASH  = '0x722122dF12D4e14e13Ac3b6895a86e84145b6967';
const LAZARUS       = '0x098B716B8Aaf21512996dC57eb0615e2383E2f96';
const VITALIK       = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const BINANCE_BTC   = '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo';
const LAZARUS_BTC   = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const GARANTEX_TRX  = 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe';
const LAZARUS_TRX   = 'TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa';
const BINANCE_TRX   = 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH';
// Solana — base58, case-sensitive
const LAZARUS_SOL   = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC73bMBiibYaUn'; // OFAC SDN — Lazarus Group / DPRK
const RAYDIUM_SOL   = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'; // Raydium AMM v4 program

const LOADING_STEPS = [
  'Fetching on-chain transactions...',
  'Checking OFAC SDN list...',
  'Scoring risk signals...',
  'Generating AI narrative...',
];

const BASE_TABS = ['PATTERNS', 'NARRATIVE', 'REPORT', 'TRANSACTIONS', 'SIMULATOR'] as const;
type BaseTab = typeof BASE_TABS[number];
type Tab = BaseTab | 'FLOW';

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface HopEntry {
  address: string;
  transactions: import('@/types').WalletTransaction[];
}

interface AnalysisAPIResponse {
  success: true;
  data: WalletAnalysis;
  narrative: string;
  sarDraft: string;
  hopData?: HopEntry[];
  resolvedAddress?: string;
}

interface ErrorAPIResponse {
  success: false;
  error: string;
  code?: string;
}

type APIResponse = AnalysisAPIResponse | ErrorAPIResponse;

// ---------------------------------------------------------------------------
// Error state — label + detail for user-facing display
// ---------------------------------------------------------------------------

interface ErrorState {
  label: string;
  detail: string;
}

function makeError(detail: string, label = 'ERROR'): ErrorState {
  return { label, detail };
}

function apiErrorToState(code: string | undefined, msg: string, chain: string): ErrorState {
  switch (code) {
    case 'INVALID_ADDRESS':
      return {
        label: 'FORMAT ERROR',
        detail:
          chain === 'BTC' ? 'Not a valid Bitcoin address. Bitcoin addresses start with 1, 3, or bc1.' :
          chain === 'TRX' ? 'Not a valid Tron address. Must start with T and be exactly 34 characters.' :
          chain === 'SOL' ? 'Not a valid Solana address. Must be a 32–44 character base58 string (no 0, O, I, or l).' :
          'Not a valid Ethereum address. Use a 0x hex address (42 chars) or an ENS name like vitalik.eth.',
      };
    case 'ENS_RESOLUTION_FAILED':
      return {
        label: 'RESOLVE ERROR',
        detail: 'That ENS name couldn\'t be resolved — it may not be registered or may not point to an address.',
      };
    case 'RATE_LIMIT_EXCEEDED':
      return {
        label: 'RATE LIMITED',
        detail: 'Free tier limit reached (10 analyses/day). Check your dashboard to track usage, or try again tomorrow.',
      };
    case 'UNSUPPORTED_CHAIN':
      return { label: 'UNSUPPORTED CHAIN', detail: msg };
    default: {
      const lower = msg.toLowerCase();
      if (lower.includes('not found') || lower.includes('does not exist') || lower.includes('no on-chain')) {
        return {
          label: 'NOT FOUND',
          detail: 'No on-chain activity found for that address. It may not exist on this chain yet, or the address format may be wrong.',
        };
      }
      if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('retry')) {
        return {
          label: 'RATE LIMITED',
          detail: 'The blockchain data provider is temporarily rate-limiting requests. Wait a moment and try again.',
        };
      }
      if (lower.includes('invalid') && lower.includes('address')) {
        return { label: 'FORMAT ERROR', detail: msg };
      }
      if (lower.includes('timeout') || lower.includes('warming up')) {
        return { label: 'TIMEOUT', detail: msg };
      }
      if (lower.includes('network') || lower.includes('could not reach')) {
        return { label: 'NETWORK ERROR', detail: msg };
      }
      return { label: 'ERROR', detail: msg };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bitcoin base58check checksum validator (client-side, WebCrypto)
// Only covers legacy P2PKH (1...) and P2SH (3...) addresses.
// bc1 (bech32) addresses are skipped — their checksum is a GF(32) polynomial
// and the regex already rejects structurally wrong bech32 strings.
// ---------------------------------------------------------------------------

const BTC_B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

async function btcBase58CheckValid(address: string): Promise<boolean> {
  if (!address.startsWith('1') && !address.startsWith('3')) return true; // skip bech32
  try {
    // Decode base58 → big integer → byte array
    let num = BigInt(0);
    for (const ch of address) {
      const idx = BTC_B58_ALPHABET.indexOf(ch);
      if (idx < 0) return false;
      num = num * BigInt(58) + BigInt(idx);
    }
    const byteArr: number[] = [];
    while (num > BigInt(0)) {
      byteArr.unshift(Number(num & BigInt(0xff)));
      num >>= BigInt(8);
    }
    // Prepend a 0x00 byte for each leading '1' in the address
    const leadingZeros = address.length - address.replace(/^1+/, '').length;
    const full = new Uint8Array([...new Array(leadingZeros).fill(0), ...byteArr]);
    if (full.length !== 25) return false; // standard addresses are always 25 bytes

    const payload  = full.slice(0, 21);
    const checksum = full.slice(21, 25);
    const h1 = await crypto.subtle.digest('SHA-256', payload);
    const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1));
    return checksum[0] === h2[0] && checksum[1] === h2[1] &&
           checksum[2] === h2[2] && checksum[3] === h2[3];
  } catch {
    return false;
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

const SIGNAL_LABELS: Record<string, string> = {
  ofac_match: 'OFAC MATCH',
  mixer_interaction: 'MIXER INTERACTION',
  rapid_fund_movement: 'RAPID MOVEMENT',
  high_risk_counterparty: 'HIGH-RISK PARTY',
  volume_anomaly: 'VOLUME ANOMALY',
  community_red_flags: 'RED FLAGS',
  coinjoin_usage: 'COINJOIN USAGE',
  peel_chain: 'PEEL CHAIN',
  coinbase_recipient: 'COINBASE RECIPIENT',
};

function formatSignalName(name: string): string {
  return SIGNAL_LABELS[name] ?? name.split('_').map(w => w.toUpperCase()).join(' ');
}

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    default:         return '#06b6d4';
  }
}

// ---------------------------------------------------------------------------
// Rotating headline slogans
// ---------------------------------------------------------------------------

const slogans = [
  'check before you send',
  'trace the trail',
  'follow the money',
  'on-chain never lies',
  'money leaves tracks',
  'know who you trust',
];

const CHARS = 'abcdefghijklmnopqrstuvwxyz@#$%&*';

function scrambleToWord(
  _current: string,
  target: string,
  onUpdate: (val: string) => void,
  onDone: () => void
) {
  const duration = 900;
  const steps = 30;
  const stepDuration = duration / steps;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    const progress = step / steps; // 0 → 1

    // Staggered left-to-right resolution:
    // char 0 resolves at progress ≈ 0.15, last char at ≈ 0.85
    const result = Array.from({ length: target.length }, (_, i) => {
      if (target[i] === ' ') return ' '; // spaces lock in immediately
      const resolveAt = 0.15 + (i / Math.max(target.length - 1, 1)) * 0.70;
      if (progress >= resolveAt) return target[i];
      return CHARS[Math.floor(Math.random() * CHARS.length)];
    }).join('');

    onUpdate(result);

    if (step >= steps) {
      clearInterval(interval);
      onUpdate(target);
      onDone();
    }
  }, stepDuration);
}

// ---------------------------------------------------------------------------
// Search history helpers
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'clearchain_history';

interface HistoryEntry {
  address: string;
  level: RiskLevel;
  timestamp: number;
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveHistory(entry: HistoryEntry) {
  const existing = loadHistory().filter(e => e.address !== entry.address);
  const updated = [entry, ...existing].slice(0, 5);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function removeHistory(address: string) {
  const updated = loadHistory().filter(e => e.address !== address);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function useWindowWidth() {
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    setWidth(window.innerWidth);
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// ---------------------------------------------------------------------------
// Signal list — col 3
// ---------------------------------------------------------------------------

function SignalList({ signals, isMobile, riskLevel }: { signals: Record<string, ScoringSignal>; isMobile?: boolean; riskLevel?: RiskLevel }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = Object.values(signals).sort((a, b) => {
    if (a.triggered && !b.triggered) return -1;
    if (!a.triggered && b.triggered) return 1;
    return b.weight - a.weight;
  });

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const isClean = riskLevel === 'LOW';

  return (
    <div
      className="glass"
      style={{
        borderRadius: 4,
        padding: 24,
        overflow: 'clip',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          color: 'var(--text-dim)',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        SIGNAL BREAKDOWN
        <InfoTooltip text="Each signal that contributes to the risk score. Green = triggered (adds points). Gray = clean. The detail column explains exactly why each signal fired." />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : 12 }}>
        {sorted.map(signal => {
          const canExpand = isMobile && signal.triggered && !!signal.detail;
          const isExpanded = expanded.has(signal.name);
          const showCleanTint = isClean && !signal.triggered;
          return (
            <div key={signal.name}>
              <div
                onClick={canExpand ? () => toggle(signal.name) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  padding: isMobile ? '8px 6px' : '0',
                  borderRadius: 2,
                  background: showCleanTint ? 'rgba(6,182,212,0.03)' : 'transparent',
                  cursor: canExpand ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
              >
                {/* Dot */}
                <span
                  style={{
                    fontSize: 7,
                    color: signal.triggered ? '#06b6d4' : (isClean ? 'rgba(6,182,212,0.3)' : '#1e4d5c'),
                    marginRight: 10,
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  {signal.triggered ? '●' : '○'}
                </span>

                {/* Name */}
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.05em',
                    color: signal.triggered ? 'var(--text-primary)' : (isClean ? 'rgba(6,182,212,0.35)' : 'var(--text-dim)'),
                    flex: 1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatSignalName(signal.name)}
                </span>

                {/* Dot fill */}
                <div
                  style={{
                    flex: '0 0 20px',
                    height: 0,
                    borderBottom: '1px dotted rgba(61,74,92,0.4)',
                    margin: '0 6px 3px',
                  }}
                />

                {/* Score */}
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 12,
                    color: signal.triggered ? '#ff8c00' : (isClean ? 'rgba(6,182,212,0.25)' : '#1e4d5c'),
                    flexShrink: 0,
                    minWidth: 30,
                    textAlign: 'right',
                  }}
                >
                  +{signal.triggered ? signal.score : 0}
                </span>

                {/* Expand chevron on mobile */}
                {canExpand && (
                  <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: 9, flexShrink: 0 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {/* Inline detail (mobile accordion) */}
              {canExpand && isExpanded && (
                <div
                  style={{
                    padding: '6px 6px 8px 23px',
                    fontFamily: 'var(--font-inter)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {signal.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail section — desktop only */}
      {!isMobile && sorted.filter(s => s.triggered && s.detail).length > 0 && (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(6,182,212,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {sorted.filter(s => s.triggered && s.detail).map(signal => (
            <div key={signal.name}>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                  marginBottom: 3,
                }}
              >
                {formatSignalName(signal.name)}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {signal.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature card
// ---------------------------------------------------------------------------

function FeatureCard({ title, desc, icon }: { title: string; desc: string; icon?: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 32,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(6,182,212,0.08)'}`,
        borderRadius: 4,
        background: hovered ? 'rgba(255,255,255,0.02)' : 'transparent',
        transition: 'border-color 0.2s, background 0.2s',
        cursor: 'default',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {icon && <div style={{ marginBottom: 14, opacity: hovered ? 1 : 0.7, transition: 'opacity 0.2s' }}>{icon}</div>}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.15em',
          color: '#06b6d4',
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 14,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {desc}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust signal badge (shown after analysis)
// ---------------------------------------------------------------------------

function TrustSignal({ riskLevel, riskScore }: { riskLevel: RiskLevel; riskScore: number }) {
  const [walletsScreened, setWalletsScreened] = React.useState(0);
  const [highRiskWallets, setHighRiskWallets] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        if (d.walletsScreened) setWalletsScreened(d.walletsScreened);
        if (d.highRiskWallets) setHighRiskWallets(d.highRiskWallets);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isClean = riskLevel === 'LOW';
  const isCritical = riskLevel === 'CRITICAL' || riskLevel === 'HIGH';
  const color = isClean ? '#06b6d4' : isCritical ? '#ff3b3b' : '#ffd60a';
  const label = isClean ? 'NO RED FLAGS DETECTED' : `${riskLevel} RISK — REVIEW BEFORE SENDING`;

  const contextText = loaded && walletsScreened > 0
    ? isClean
      ? `Checked against ${walletsScreened.toLocaleString()} wallets`
      : `${highRiskWallets.toLocaleString()} high-risk wallets flagged in our database`
    : null;

  const IconSvg = isClean ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6" stroke={color} strokeWidth="1.5" />
      <path d="M4.5 7l2 2 3-3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 5.5v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10.5" r="0.75" fill={color} />
    </svg>
  );

  return (
    <div
      className="trust-signal"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        background: `${color}0a`,
        border: `1px solid ${color}25`,
        borderRadius: 3,
        marginBottom: 20,
        animation: 'fadeSlideUp 0.4s ease-out both',
        flexWrap: 'wrap',
        rowGap: 6,
      }}
    >
      {IconSvg}
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color, fontWeight: 700 }}>
        {label}
      </span>
      {contextText && (
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
          · {contextText}
        </span>
      )}
      <span className="trust-clearchain-label" style={{ marginLeft: 'auto', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
        CLEARCHAIN
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live stats counter
// ---------------------------------------------------------------------------

interface LiveStats {
  walletsScreened: number;
  ofacHits:        number;
  sarDrafts:       number;
  casesOpened:     number;
  highRiskWallets: number;
}

function StatPill({ value, label, accent = '#22d3ee' }: { value: number; label: string; accent?: string }) {
  const count = useCountUp(value, 1500);
  return (
    <div
      style={{
        background:  'rgba(6,182,212,0.06)',
        border:      '1px solid rgba(6,182,212,0.15)',
        borderRadius: 3,
        padding:     '8px 10px',
        textAlign:   'center',
      }}
    >
      <div
        style={{
          fontFamily:    'var(--font-jetbrains-mono)',
          fontSize:      18,
          fontWeight:    700,
          color:         accent,
          lineHeight:    1.2,
          marginBottom:  4,
        }}
      >
        {count.toLocaleString()}
      </div>
      <div
        style={{
          fontFamily:    'var(--font-jetbrains-mono)',
          fontSize:      11,
          color:         '#4a7a8a',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function StatsBar() {
  const [stats, setStats] = React.useState<LiveStats>({
    walletsScreened: 0,
    ofacHits:        0,
    sarDrafts:       0,
    casesOpened:     0,
    highRiskWallets: 0,
  });

  React.useEffect(() => {
    const supabase = createClient();

    // Initial load from global_stats
    supabase
      .from('global_stats')
      .select('wallets_screened, ofac_hits, sar_drafts, cases_opened, high_risk_wallets')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setStats({
          walletsScreened: data.wallets_screened as number,
          ofacHits:        data.ofac_hits        as number,
          sarDrafts:       data.sar_drafts        as number,
          casesOpened:     data.cases_opened      as number,
          highRiskWallets: data.high_risk_wallets as number,
        });
      });

    // Realtime subscription — fires for every visitor when any analysis is saved
    const channel = supabase
      .channel('global-stats-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'global_stats', filter: 'id=eq.1' },
        (payload) => {
          const row = payload.new as {
            wallets_screened:  number;
            ofac_hits:         number;
            sar_drafts:        number;
            cases_opened:      number;
            high_risk_wallets: number;
          };
          setStats({
            walletsScreened: row.wallets_screened,
            ofacHits:        row.ofac_hits,
            sarDrafts:       row.sar_drafts,
            casesOpened:     row.cases_opened,
            highRiskWallets: row.high_risk_wallets,
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div
      style={{
        display:        'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:            8,
        marginBottom:   40,
        animation:      'fadeSlideUp 0.5s ease-out both',
        animationDelay: '0.3s',
      }}
    >
      <StatPill value={stats.walletsScreened} label="WALLETS CHECKED"   />
      <StatPill value={stats.ofacHits}        label="FLAGGED WALLETS"   />
      <StatPill value={stats.highRiskWallets} label="HIGH RISK WALLETS" accent="#ff8c00" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick fill rich card helpers
// ---------------------------------------------------------------------------

type QFStyle = 'red' | 'green' | 'blue' | 'orange';

interface RichCard {
  badge: string;
  score: number;
  signals: readonly string[];
  color: string;
  displayAddr: string;
}

const ETH_CARD_OVERRIDES: Record<string, RichCard> = {
  'Tornado Cash': {
    badge: 'CRITICAL', score: 95, color: '#ff3b3b',
    signals: ['OFAC SDN', 'MIXER', 'RAPID MOVEMENT'],
    displayAddr: '0xd90e2f9...4F31b',
  },
  'Lazarus Group': {
    badge: 'HIGH RISK', score: 72, color: '#ff8c00',
    signals: ['DPRK', 'OFAC SDN', 'STATE ACTOR'],
    displayAddr: '0x098B71...2f96',
  },
  'Vitalik.eth': {
    badge: 'CLEAN', score: 0, color: '#00ff88',
    signals: ['ENS RESOLVED', 'NO FLAGS'],
    displayAddr: 'vitalik.eth',
  },
};

const QF_STYLE_BASE: Record<QFStyle, { badge: string; score: number; color: string }> = {
  red:    { badge: 'HIGH RISK', score: 70, color: '#ff8c00' },
  green:  { badge: 'CLEAN',     score: 0,  color: '#00ff88' },
  blue:   { badge: 'EXCHANGE',  score: 15, color: '#60a5fa' },
  orange: { badge: 'EXCHANGE',  score: 15, color: '#ff8c00' },
};

function getRichCard(
  label: string,
  address: string,
  style: QFStyle,
  chain: 'ETH' | 'BTC' | 'TRX' | 'SOL',
): RichCard {
  if (chain === 'ETH' && ETH_CARD_OVERRIDES[label]) return ETH_CARD_OVERRIDES[label];
  const base = QF_STYLE_BASE[style];
  const short = address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-5)}` : address;
  return { ...base, signals: ['SCREENED', `${chain} CHAIN`], displayAddr: short };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Hero state
// ---------------------------------------------------------------------------

function HeroContent({
  address,
  setAddress,
  loading,
  inputFocused,
  setInputFocused,
  onSubmit,
  onQuickFill,
  onSimulatorFill,
  onOnboardingPick,
  error,
  selectedChain,
  setSelectedChain,
  history,
  onRemoveHistory,
}: {
  address: string;
  setAddress: (v: string) => void;
  loading: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onQuickFill: (addr: string) => void;
  onSimulatorFill: () => void;
  onOnboardingPick: (addr: string) => void;
  error: ErrorState | null;
  selectedChain: 'ETH' | 'BTC' | 'TRX' | 'SOL';
  setSelectedChain: (c: 'ETH' | 'BTC' | 'TRX' | 'SOL') => void;
  history: HistoryEntry[];
  onRemoveHistory: (addr: string) => void;
}) {
  const [displayText, setDisplayText] = useState(slogans[0]);
  const [nextIdx, setNextIdx] = useState(1);
  const [spotlightPos, setSpotlightPos] = useState({ x: -999, y: -999 });
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('cc_onboarded')) {
      setShowOnboarding(true);
    }
  }, []);

  function dismissOnboarding() {
    localStorage.setItem('cc_onboarded', '1');
    setShowOnboarding(false);
  }
  const heroWrapperRef = useRef<HTMLDivElement>(null);
  const heroWindowWidth = useWindowWidth();
  const isMobile = heroWindowWidth < 768;

  useEffect(() => {
    const timer = setInterval(() => {
      const next = slogans[nextIdx];
      scrambleToWord(
        displayText,
        next,
        (val) => setDisplayText(val),
        () => setNextIdx((i) => (i + 1) % slogans.length),
      );
    }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIdx]);

  const features = [
    {
      title: 'Risk Score',
      desc: 'A clear 0–100 safety score based on 6 signals. See instantly if a wallet is clean, suspicious, or flagged — with every reason explained.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 14 A8 8 0 0 1 17 14" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 14 L13 7" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="1.5" fill="#06b6d4"/>
        </svg>
      ),
    },
    {
      title: 'Warning Signs',
      desc: '7 suspicious patterns detected automatically — including mixer usage, rapid fund movement, and chain-hopping. Each flag is explained in plain English so you know what you\'re actually looking at.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="4" r="2" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="4" cy="16" r="2" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="16" cy="16" r="2" stroke="#06b6d4" strokeWidth="1.5"/>
          <line x1="10" y1="6" x2="4.8" y2="14" stroke="#06b6d4" strokeWidth="1.5"/>
          <line x1="10" y1="6" x2="15.2" y2="14" stroke="#06b6d4" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      title: 'Fund Flow Graph',
      desc: 'Click any node to follow the money. Trace funds across hops, spot risky connections in red, and see when two wallets share a counterparty.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="2" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="3" cy="5" r="1.5" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="17" cy="5" r="1.5" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="3" cy="15" r="1.5" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="17" cy="15" r="1.5" stroke="#06b6d4" strokeWidth="1.5"/>
          <line x1="8.5" y1="8.8" x2="4.2" y2="6.2" stroke="#06b6d4" strokeWidth="1"/>
          <line x1="11.5" y1="8.8" x2="15.8" y2="6.2" stroke="#06b6d4" strokeWidth="1"/>
          <line x1="8.5" y1="11.2" x2="4.2" y2="13.8" stroke="#06b6d4" strokeWidth="1"/>
          <line x1="11.5" y1="11.2" x2="15.8" y2="13.8" stroke="#06b6d4" strokeWidth="1"/>
        </svg>
      ),
    },
    {
      title: 'Safety Report',
      desc: 'A plain-language AI safety report generated in seconds. Download it, share it, or keep it as a record of your due diligence.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2" width="12" height="16" rx="1" stroke="#06b6d4" strokeWidth="1.5"/>
          <line x1="7" y1="7" x2="13" y2="7" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="10" x2="13" y2="10" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="13" x2="10" y2="13" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Simulator',
      desc: 'Toggle any risk signal on or off to see exactly what\'s driving a score. Isolate a single flag, understand its impact, and decide whether a wallet is actually risky or a false alarm.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <line x1="3" y1="5" x2="17" y2="5" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="10" x2="17" y2="10" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="15" x2="17" y2="15" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="5" r="2" fill="#00080f" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="13" cy="10" r="2" fill="#00080f" stroke="#06b6d4" strokeWidth="1.5"/>
          <circle cx="7" cy="15" r="2" fill="#00080f" stroke="#06b6d4" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      title: '17,000+ Labeled Wallets',
      desc: 'Every analysis cross-references a database of known exchanges, scam wallets, phishing addresses, DeFi protocols, and flagged entities — so you know exactly who you\'re dealing with.',
      href: '/docs#attribution',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M2 2h7.5l8.5 8.5-7.5 7.5L2 9.5V2z" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
          <circle cx="6.5" cy="6.5" r="1.5" fill="#06b6d4"/>
        </svg>
      ),
    },
  ];


  const quickFills = [
    { label: 'Tornado Cash', sub: 'OFAC SDN · Router', address: TORNADO_CASH,  chain: 'ETH' as const, style: 'red'    as const },
    { label: 'Lazarus Group', sub: 'DPRK · OFAC SDN',  address: LAZARUS,       chain: 'ETH' as const, style: 'red'    as const },
    { label: 'Vitalik.eth',   sub: 'Clean baseline',    address: VITALIK,       chain: 'ETH' as const, style: 'green'  as const },
    { label: 'Binance BTC',   sub: 'Exchange',          address: BINANCE_BTC,   chain: 'BTC' as const, style: 'blue'   as const },
    { label: 'Lazarus BTC',   sub: 'OFAC SDN · DPRK',  address: LAZARUS_BTC,   chain: 'BTC' as const, style: 'red'    as const },
    { label: 'Garantex',      sub: 'OFAC SDN · TRX',   address: GARANTEX_TRX,  chain: 'TRX' as const, style: 'red'    as const },
    { label: 'Lazarus TRX',   sub: 'OFAC SDN · DPRK',  address: LAZARUS_TRX,   chain: 'TRX' as const, style: 'red'    as const },
    { label: 'Binance TRX',   sub: 'Exchange',          address: BINANCE_TRX,   chain: 'TRX' as const, style: 'orange' as const },
    { label: 'Lazarus SOL',   sub: 'OFAC SDN · DPRK',  address: LAZARUS_SOL,   chain: 'SOL' as const, style: 'red'    as const },
    { label: 'Raydium AMM',   sub: 'DeFi · DEX',       address: RAYDIUM_SOL,   chain: 'SOL' as const, style: 'green'  as const },
  ];

  const visibleQuickFills = quickFills.filter(q => q.chain === selectedChain);

  function handleHeroMouse(e: React.MouseEvent<HTMLDivElement>) {
    const rect = heroWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotlightPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={heroWrapperRef}
      onMouseMove={handleHeroMouse}
      onMouseLeave={() => setSpotlightPos({ x: -999, y: -999 })}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: `radial-gradient(600px at ${spotlightPos.x}px ${spotlightPos.y}px, rgba(6,182,212,0.05), transparent 70%)`,
      }}
    >
      {/* ── Hero — content over full-page aurora (layout.tsx fixed bg) ── */}
      <div className="hero-section">
        <div className="hero-left">
        {/* Label */}
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.3em',
            color: 'rgba(6,182,212,0.6)',
            marginBottom: 32,
            borderLeft: '3px solid rgba(6,182,212,0.5)',
            paddingLeft: 12,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0s',
          }}
        >
          FREE WALLET SAFETY CHECK
        </div>

        {/* Glitch scramble headline — natural height, nowrap prevents layout shift */}
        <div style={{
          margin: '0 0 28px',
          animation: 'fadeSlideUp 0.5s ease-out both',
          animationDelay: '0.1s',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}>
          <h1
            className="hero-headline"
            style={{
              fontFamily: 'var(--font-rubik-glitch)',
              fontWeight: 400,
              lineHeight: 1.0,
              color: 'var(--text-primary)',
              letterSpacing: '0.02em',
              margin: '0 0 10px',
              width: '100%',
              paddingBottom: 6,
              overflow: 'hidden',
            }}
          >
            {displayText}
          </h1>
        </div>

        {/* Subhead */}
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: isMobile ? 15 : 18,
            color: 'rgba(236,254,255,0.7)',
            lineHeight: 1.65,
            margin: '0 0 0',
            maxWidth: 900,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.25s',
          }}
        >
          Paste any wallet address and know in seconds if it&apos;s safe to send to. Catch scams, flagged addresses, and sanctioned wallets before you confirm.
        </p>


        {/* Live stats */}
        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <StatsBar />
        </div>

        {/* Search bar */}
        <form
          onSubmit={onSubmit}
          style={{
            width: '100%',
            maxWidth: 900,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.4s',
          }}
        >
          {/* Chain selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['ETH', 'BTC', 'TRX', 'SOL'] as const).map(c => {
              const chainColor = c === 'ETH' ? '#06b6d4' : c === 'BTC' ? '#f97316' : c === 'TRX' ? '#ff4500' : '#9945ff';
              const isActive = selectedChain === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setSelectedChain(c); setAddress(''); }}
                  disabled={loading}
                  style={{
                    padding: '4px 14px',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    border: `1px solid ${isActive ? chainColor : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 2,
                    background: isActive ? `${chainColor}14` : 'none',
                    color: isActive ? chainColor : 'var(--text-dim)',
                    cursor: loading ? 'default' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {/* Onboarding nudge — first-visit only, dismissed via localStorage */}
          {showOnboarding && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 14,
                padding: '10px 14px',
                background: 'rgba(0,255,136,0.04)',
                border: '1px solid rgba(0,255,136,0.15)',
                borderRadius: 4,
                animation: 'fadeSlideUp 0.35s ease-out both',
                position: 'relative',
              }}
            >
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#8892a4', flexShrink: 0 }}>
                New here? Try an example:
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {([
                  { label: 'OFAC Sanctioned', sub: 'Lazarus Group',    addr: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96' },
                  { label: 'High Risk',        sub: 'Tornado Cash',     addr: '0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b' },
                  { label: 'Clean Wallet',      sub: 'Vitalik Buterin',  addr: 'vitalik.eth' },
                ] as const).map(pill => (
                  <button
                    key={pill.addr}
                    type="button"
                    disabled={loading}
                    onClick={() => { dismissOnboarding(); onOnboardingPick(pill.addr); }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 1,
                      padding: '5px 10px',
                      background: '#0d1220',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      cursor: loading ? 'default' : 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,255,136,0.3)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  >
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#f0f4ff', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{pill.label}</span>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#8892a4', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{pill.sub}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={dismissOnboarding}
                aria-label="Dismiss"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#8892a4',
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 2,
                }}
              >
                ×
              </button>
            </div>
          )}

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              borderBottom: `1px solid ${inputFocused ? '#06b6d4' : 'rgba(255,255,255,0.15)'}`,
              paddingBottom: 14,
              gap: 16,
              transition: 'border-color 0.2s, box-shadow 0.2s',
              boxShadow: inputFocused ? '0 4px 20px rgba(6,182,212,0.08)' : 'none',
              overflow: 'hidden',
            }}
          >
            {/* Scan-line sweep — visible on focus */}
            {inputFocused && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.65) 50%, transparent 100%)',
                  animation: 'scanSweep 2s ease-in-out infinite',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            )}
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={selectedChain === 'BTC' ? '1A1zP1... or bc1q...' : selectedChain === 'TRX' ? 'T... Tron address' : selectedChain === 'SOL' ? 'Base58 Solana address...' : '0x...'}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              disabled={loading}
              aria-label={selectedChain === 'BTC' ? 'Bitcoin wallet address' : selectedChain === 'TRX' ? 'Tron wallet address' : selectedChain === 'SOL' ? 'Solana wallet address' : 'Ethereum wallet address'}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 15,
                color: 'var(--text-primary)',
                caretColor: '#06b6d4',
                letterSpacing: '0.02em',
              }}
            />
            <AnalyzeButton loading={loading} showShortcut={!isMobile} />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '12px 16px',
                border: '1px solid rgba(255,59,59,0.25)',
                borderRadius: 2,
                background: 'rgba(255,59,59,0.06)',
                textAlign: 'left',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.15em',
                color: '#ff3b3b',
                marginBottom: 5,
                fontWeight: 700,
              }}>
                {error.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                color: '#ff6b6b',
                lineHeight: 1.55,
              }}>
                {error.detail}
              </div>
            </div>
          )}
        </form>

        {/* Feature pills — borderless text, subtle */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            marginTop: 28,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.55s',
          }}
        >
          {['OFAC Screening', 'Scam Detection', 'Risk Report', 'ETH · BTC · TRX · SOL'].map(label => (
            <span
              key={label}
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
                marginRight: 20,
                marginBottom: 8,
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Download widget CTA */}
        <div style={{
          marginTop: 20,
          animation: 'fadeSlideUp 0.5s ease-out both',
          animationDelay: '0.65s',
        }}>
          <a
            href="#extension"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              background: 'rgba(6,182,212,0.06)',
              border: '1px solid rgba(6,182,212,0.2)',
              borderRadius: 3,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: '#06b6d4',
              textDecoration: 'none',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = 'rgba(6,182,212,0.12)';
              el.style.borderColor = 'rgba(6,182,212,0.35)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = 'rgba(6,182,212,0.06)';
              el.style.borderColor = 'rgba(6,182,212,0.2)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="10" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 2v7M5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download the browser widget ↓
          </a>
        </div>

        {/* Mobile-only: try-an-example panel (mirrors hero-right, hidden on ≥768px) */}
        {isMobile && (
          <div
            style={{
              marginTop: 32,
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.6s',
              background: 'rgba(6,182,212,0.03)',
              border: '1px solid rgba(6,182,212,0.1)',
              borderRadius: 4,
              padding: '20px 16px',
            }}
          >
            {/* Header */}
            <div style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.25em',
              color: 'rgba(6,182,212,0.5)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#06b6d4',
                boxShadow: '0 0 8px rgba(6,182,212,0.8)',
                flexShrink: 0,
              }} />
              TRY AN EXAMPLE
            </div>

            {/* Quick fill rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleQuickFills.map(({ label, address: addr, style: qStyle, chain: qChain }) => {
                const rc = getRichCard(label, addr, qStyle, qChain);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onQuickFill(addr)}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '10px 14px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 3,
                      background: '#0d1220',
                      cursor: loading ? 'default' : 'pointer',
                      width: '100%',
                      textAlign: 'left' as const,
                      transition: 'border-color 0.2s',
                    }}
                    onTouchStart={e => { e.currentTarget.style.borderColor = 'rgba(0,255,136,0.2)'; }}
                    onTouchEnd={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: rc.color, border: `1px solid ${rc.color}44`, borderRadius: 2, padding: '2px 6px', background: `${rc.color}0a`, flexShrink: 0 }}>{rc.badge}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#3d4a5c' }}>{rc.displayAddr}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {rc.signals.map(sig => (
                        <span key={sig} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#8892a4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2, padding: '1px 5px' }}>{sig}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 700, color: rc.color, lineHeight: 1 }}>{rc.score}</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#3d4a5c' }}>/100</span>
                      </div>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${rc.score}%`, height: '100%', background: rc.color }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: rc.color, border: `1px solid ${rc.color}59`, borderRadius: 3, padding: '5px 12px', background: `${rc.color}0f`, flexShrink: 0 }}>ANALYZE</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Simulator CTA — ETH only */}
            {selectedChain === 'ETH' && (
              <button
                onClick={onSimulatorFill}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid rgba(6,182,212,0.08)',
                  cursor: loading ? 'default' : 'pointer',
                  width: '100%',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'rgba(6,182,212,0.7)',
                  padding: '16px 0 0',
                  marginTop: 16,
                  transition: 'color 0.2s',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                  <polygon points="2,1 9,5 2,9" fill="currentColor"/>
                </svg>
                RUN THE SIMULATOR
              </button>
            )}

            {/* Chain selector — inside the box on mobile */}
            <div style={{ display: 'flex', gap: 6, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(6,182,212,0.06)' }}>
              {(['ETH', 'BTC', 'TRX', 'SOL'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setSelectedChain(c); setAddress(''); }}
                  style={{
                    padding: '3px 10px',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    border: `1px solid ${selectedChain === c ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 2,
                    background: selectedChain === c ? 'rgba(6,182,212,0.08)' : 'transparent',
                    color: selectedChain === c ? '#06b6d4' : 'var(--text-dim)',
                    cursor: 'pointer',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        </div>{/* end hero-left */}

        {/* RIGHT COLUMN — example panel */}
        <div className="hero-right">
          <div style={{
            background: 'rgba(6,182,212,0.03)',
            border: '1px solid rgba(6,182,212,0.1)',
            borderRadius: 4,
            padding: '32px 28px',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.25em',
              color: 'rgba(6,182,212,0.5)',
              marginBottom: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#06b6d4',
                boxShadow: '0 0 8px rgba(6,182,212,0.8)',
                flexShrink: 0,
              }} />
              TRY AN EXAMPLE
            </div>

            {/* Quick fill cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleQuickFills.map(({ label, address: addr, style: qStyle, chain: qChain }) => {
                const rc = getRichCard(label, addr, qStyle, qChain);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onQuickFill(addr)}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '10px 14px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 3,
                      background: '#0d1220',
                      cursor: loading ? 'default' : 'pointer',
                      width: '100%',
                      textAlign: 'left' as const,
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,136,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, color: '#f0f4ff' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', color: rc.color, border: `1px solid ${rc.color}44`, borderRadius: 2, padding: '2px 6px', background: `${rc.color}0a`, flexShrink: 0 }}>{rc.badge}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#3d4a5c' }}>{rc.displayAddr}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {rc.signals.map(sig => (
                        <span key={sig} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#8892a4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2, padding: '1px 5px' }}>{sig}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 700, color: rc.color, lineHeight: 1 }}>{rc.score}</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#3d4a5c' }}>/100</span>
                      </div>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${rc.score}%`, height: '100%', background: rc.color }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: rc.color, border: `1px solid ${rc.color}59`, borderRadius: 3, padding: '5px 12px', background: `${rc.color}0f`, flexShrink: 0 }}>ANALYZE</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Simulator CTA */}
            {selectedChain === 'ETH' && (
              <button
                onClick={onSimulatorFill}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid rgba(6,182,212,0.08)',
                  cursor: loading ? 'default' : 'pointer',
                  width: '100%',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'rgba(6,182,212,0.7)',
                  padding: '20px 0 0',
                  marginTop: 20,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#06b6d4'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(6,182,212,0.7)'; }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                  <polygon points="2,1 9,5 2,9" fill="currentColor"/>
                </svg>
                RUN THE SIMULATOR
              </button>
            )}

            {/* Chain selector — controls examples shown in this panel */}
            <div style={{ display: 'flex', gap: 6, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(6,182,212,0.06)' }}>
              {(['ETH', 'BTC', 'TRX', 'SOL'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setSelectedChain(c); setAddress(''); }}
                  style={{
                    padding: '3px 10px',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    border: `1px solid ${selectedChain === c ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 2,
                    background: selectedChain === c ? 'rgba(6,182,212,0.08)' : 'transparent',
                    color: selectedChain === c ? '#06b6d4' : 'var(--text-dim)',
                    cursor: 'pointer',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>{/* end hero-right */}
      </div>{/* end hero-section */}

      {/* Email capture — above the fold, right after quick fills */}
      <WaitlistBar />

      {/* How it works */}
      <div
        style={{
          borderTop: '1px solid rgba(6,182,212,0.05)',
          padding: isMobile ? '40px 16px 0' : '64px 24px 0',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Section label */}
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: '#1e4d5c',
            textTransform: 'uppercase' as const,
            marginBottom: 32,
            textAlign: 'center',
          }}
        >
          HOW IT WORKS
        </div>

        {/* Three steps */}
        <div
          className="how-it-works-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 32,
          }}
        >
          {([
            {
              n: '01',
              title: 'SCREEN',
              body: "Paste any ETH, BTC, TRX, or SOL address. ClearChain checks it against known scam wallets, sanctioned addresses, and on-chain risk signals in under 10 seconds.",
            },
            {
              n: '02',
              title: 'TRACE',
              body: 'See exactly where the money has been. Follow transactions across wallets, spot risky connections, and understand who you\'re actually dealing with — before you send.',
            },
            {
              n: '03',
              title: 'REPORT',
              body: 'Download a clear AI-written safety summary in seconds. Share it, save it, or use it to make a confident decision before you send.',
            },
          ] as const).map(({ n, title, body }) => (
            <div
              key={n}
              style={{
                border: '1px solid rgba(6,182,212,0.08)',
                borderRadius: 4,
                padding: 24,
                background: '#001824',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  color: '#06b6d4',
                  marginBottom: 8,
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-space-grotesk)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#ecfeff',
                  marginBottom: 8,
                }}
              >
                {title}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 13,
                  color: '#7ec8d8',
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* Built for */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: '#1e4d5c',
            marginBottom: 64,
          }}
        >
          <span style={{ color: '#7ec8d8' }}>BUILT FOR:</span>
          {' '}Anyone sending, receiving, or trading crypto — ETH, BTC, TRX, or SOL
        </div>
      </div>

      {/* Use Cases */}
      {(() => {
        interface UseCase {
          icon: React.ReactNode;
          tag: string;
          scenario: string;
          who: string;
          body: string;
          story: string[];
          diagram: string;
        }

        const useCaseDiagrams: Record<string, React.ReactNode> = {

          incoming: (
            <svg viewBox="0 0 480 270" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden" style={{ width: '100%', maxWidth: 480, height: 'auto' }}>
              <rect width="480" height="270" fill="rgba(0,8,15,0.88)" rx="4"/>
              {/* UNKNOWN SENDER */}
              <rect x="12" y="44" width="110" height="152" rx="4" fill="rgba(255,59,59,0.04)" stroke="rgba(255,59,59,0.55)" strokeWidth="1.5"/>
              <rect x="12" y="44" width="110" height="22" rx="4" fill="rgba(255,59,59,0.12)"/>
              <line x1="12" y1="66" x2="122" y2="66" stroke="rgba(255,59,59,0.2)" strokeWidth="0.5"/>
              <text x="58" y="59" textAnchor="middle" fill="rgba(255,59,59,0.9)" fontFamily="monospace" fontSize="7.5" letterSpacing="0.8" fontWeight="600">UNKNOWN SENDER</text>
              {/* ⚠ icon at top-right corner */}
              <circle cx="122" cy="44" r="13" fill="rgba(18,0,0,0.97)" stroke="#ff3b3b" strokeWidth="1.6"/>
              <line x1="122" y1="37" x2="122" y2="46" stroke="#ff3b3b" strokeWidth="2.2" strokeLinecap="round"/>
              <circle cx="122" cy="51" r="1.6" fill="#ff3b3b"/>
              <rect x="24" y="76" width="50" height="5" rx="2" fill="rgba(255,59,59,0.22)"/>
              <rect x="24" y="88" width="34" height="4" rx="1.5" fill="rgba(255,59,59,0.13)"/>
              <rect x="24" y="99" width="42" height="4" rx="1.5" fill="rgba(255,59,59,0.08)"/>
              <rect x="24" y="110" width="28" height="4" rx="1.5" fill="rgba(255,59,59,0.05)"/>
              <text x="62" y="152" textAnchor="middle" fill="rgba(255,59,59,0.35)" fontFamily="monospace" fontSize="7">0x7f3a...d2c</text>
              <text x="62" y="166" textAnchor="middle" fill="rgba(255,59,59,0.6)" fontFamily="monospace" fontSize="8" letterSpacing="1.5">UNVERIFIED</text>
              <text x="62" y="182" textAnchor="middle" fill="rgba(255,59,59,0.28)" fontFamily="monospace" fontSize="6.5">not safe-listed</text>
              {/* Diamond connector — both lines touch points exactly */}
              <line x1="124" y1="120" x2="143" y2="120" stroke="rgba(255,140,0,0.6)" strokeWidth="1.3" strokeDasharray="3 2"/>
              <polygon points="155,108 143,120 155,132 167,120" fill="rgba(255,140,0,0.13)" stroke="rgba(255,140,0,1)" strokeWidth="1.6" strokeLinejoin="round"/>
              <line x1="167" y1="120" x2="180" y2="120" stroke="rgba(255,140,0,0.6)" strokeWidth="1.3" strokeDasharray="3 2"/>
              {/* CLEARCHAIN center */}
              <rect x="180" y="20" width="120" height="226" rx="4" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.5)" strokeWidth="1.5"/>
              <rect x="180" y="20" width="120" height="22" rx="4" fill="rgba(6,182,212,0.12)"/>
              <line x1="180" y1="42" x2="300" y2="42" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5"/>
              <text x="240" y="35" textAnchor="middle" fill="rgba(6,182,212,0.95)" fontFamily="monospace" fontSize="8" letterSpacing="2.5" fontWeight="700">CLEARCHAIN</text>
              <rect x="192" y="50" width="96" height="20" rx="3" fill="rgba(255,59,59,0.1)" stroke="rgba(255,59,59,0.65)" strokeWidth="1.2"/>
              <text x="240" y="64" textAnchor="middle" fill="#ff3b3b" fontFamily="monospace" fontSize="9" letterSpacing="1.2" fontWeight="700">HIGH RISK</text>
              <line x1="188" y1="82" x2="292" y2="82" stroke="rgba(6,182,212,0.3)" strokeWidth="0.8"/>
              <circle cx="188" cy="82" r="3" fill="#06b6d4" opacity="0.5"/>
              <circle cx="292" cy="82" r="3" fill="#06b6d4" opacity="0.5"/>
              <text x="240" y="144" textAnchor="middle" fill="#ff8c00" fontFamily="monospace" fontSize="62" fontWeight="700">65</text>
              <line x1="188" y1="158" x2="292" y2="158" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
              <circle cx="206" cy="170" r="6" fill="rgba(255,59,59,0.15)" stroke="#ff3b3b" strokeWidth="1.5"/>
              <circle cx="206" cy="170" r="2.5" fill="#ff3b3b"/>
              <text x="206" y="184" textAnchor="middle" fill="rgba(255,59,59,0.75)" fontFamily="monospace" fontSize="6.5">OFAC</text>
              <circle cx="240" cy="170" r="6" fill="rgba(255,59,59,0.15)" stroke="#ff3b3b" strokeWidth="1.5"/>
              <circle cx="240" cy="170" r="2.5" fill="#ff3b3b"/>
              <text x="240" y="184" textAnchor="middle" fill="rgba(255,59,59,0.75)" fontFamily="monospace" fontSize="6.5">MIXER</text>
              <circle cx="274" cy="170" r="6" fill="rgba(255,140,0,0.15)" stroke="#ff8c00" strokeWidth="1.5"/>
              <circle cx="274" cy="170" r="2.5" fill="#ff8c00"/>
              <text x="274" y="184" textAnchor="middle" fill="rgba(255,140,0,0.75)" fontFamily="monospace" fontSize="6.5">RAPID</text>
              <line x1="188" y1="195" x2="292" y2="195" stroke="rgba(6,182,212,0.07)" strokeWidth="0.5"/>
              <text x="240" y="209" textAnchor="middle" fill="rgba(6,182,212,0.3)" fontFamily="monospace" fontSize="7">score / 100</text>
              <text x="240" y="224" textAnchor="middle" fill="rgba(255,59,59,0.6)" fontFamily="monospace" fontSize="8" letterSpacing="0.5" fontWeight="700">DO NOT ACCEPT</text>
              <text x="240" y="237" textAnchor="middle" fill="rgba(255,59,59,0.25)" fontFamily="monospace" fontSize="6.5">3 signals triggered</text>
              {/* Blocked connector */}
              <line x1="302" y1="120" x2="320" y2="120" stroke="rgba(255,59,59,0.4)" strokeWidth="1.4" strokeDasharray="4 3"/>
              <circle cx="330" cy="120" r="9" fill="rgba(255,59,59,0.1)" stroke="#ff3b3b" strokeWidth="1.6"/>
              <line x1="325" y1="115" x2="335" y2="125" stroke="#ff3b3b" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="335" y1="115" x2="325" y2="125" stroke="#ff3b3b" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="339" y1="120" x2="350" y2="120" stroke="rgba(255,59,59,0.4)" strokeWidth="1.4" strokeDasharray="4 3"/>
              {/* YOUR WALLET alerted */}
              <rect x="352" y="44" width="116" height="152" rx="4" fill="rgba(255,59,59,0.03)" stroke="rgba(255,59,59,0.38)" strokeWidth="1.5" strokeDasharray="5 3"/>
              <rect x="352" y="44" width="116" height="22" rx="4" fill="rgba(255,140,0,0.07)"/>
              <line x1="352" y1="66" x2="468" y2="66" stroke="rgba(255,140,0,0.12)" strokeWidth="0.5"/>
              <text x="410" y="59" textAnchor="middle" fill="rgba(255,140,0,0.9)" fontFamily="monospace" fontSize="7.5" letterSpacing="1" fontWeight="600">YOUR WALLET</text>
              <rect x="364" y="76" width="48" height="5" rx="2" fill="rgba(255,59,59,0.14)"/>
              <rect x="364" y="88" width="32" height="4" rx="1.5" fill="rgba(255,59,59,0.08)"/>
              <rect x="364" y="99" width="40" height="4" rx="1.5" fill="rgba(255,59,59,0.05)"/>
              <polygon points="410,114 390,148 430,148" fill="rgba(255,140,0,0.1)" stroke="rgba(255,140,0,0.8)" strokeWidth="1.8" strokeLinejoin="round"/>
              <line x1="410" y1="122" x2="410" y2="136" stroke="#ff8c00" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="410" cy="142" r="1.8" fill="#ff8c00"/>
              <text x="410" y="165" textAnchor="middle" fill="rgba(255,140,0,0.8)" fontFamily="monospace" fontSize="9" letterSpacing="1.5" fontWeight="700">ALERTED</text>
              <text x="410" y="179" textAnchor="middle" fill="rgba(255,59,59,0.45)" fontFamily="monospace" fontSize="7">do not accept</text>
              <line x1="12" y1="244" x2="468" y2="244" stroke="rgba(255,140,0,0.05)" strokeWidth="0.5"/>
              <text x="240" y="259" textAnchor="middle" fill="rgba(255,140,0,0.25)" fontFamily="monospace" fontSize="7.5" letterSpacing="1">CHECK BEFORE ACCEPTING PAYMENT</text>
            </svg>
          ),

          outgoing: (
            <svg viewBox="0 0 480 270" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden" style={{ width: '100%', maxWidth: 480, height: 'auto' }}>
              <rect width="480" height="270" fill="rgba(0,8,15,0.88)" rx="4"/>
              {/* YOUR WALLET left */}
              <rect x="12" y="68" width="112" height="128" rx="4" fill="rgba(6,182,212,0.04)" stroke="#06b6d4" strokeWidth="1.5"/>
              <rect x="12" y="68" width="112" height="22" rx="4" fill="rgba(6,182,212,0.1)"/>
              <line x1="12" y1="90" x2="124" y2="90" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5"/>
              <text x="68" y="83" textAnchor="middle" fill="rgba(6,182,212,0.95)" fontFamily="monospace" fontSize="8" letterSpacing="1.5" fontWeight="600">YOUR WALLET</text>
              <rect x="24" y="100" width="52" height="5" rx="2" fill="rgba(6,182,212,0.22)"/>
              <rect x="24" y="112" width="36" height="4" rx="1.5" fill="rgba(6,182,212,0.13)"/>
              <rect x="24" y="123" width="44" height="4" rx="1.5" fill="rgba(6,182,212,0.07)"/>
              <text x="68" y="150" textAnchor="middle" fill="rgba(6,182,212,0.65)" fontFamily="monospace" fontSize="13" fontWeight="700">2.4 ETH</text>
              <text x="68" y="166" textAnchor="middle" fill="rgba(6,182,212,0.3)" fontFamily="monospace" fontSize="8">≈ $8,640</text>
              <text x="68" y="186" textAnchor="middle" fill="rgba(6,182,212,0.28)" fontFamily="monospace" fontSize="7">0x9e2b...f1a</text>
              {/* Arrow left → shield */}
              <line x1="126" y1="132" x2="182" y2="132" stroke="rgba(6,182,212,0.5)" strokeWidth="1.4"/>
              <polygon points="192,132 181,126 181,138" fill="rgba(6,182,212,0.7)"/>
              {/* Shield outer */}
              <path d="M240 62 l52 22v44c0 36-52 58-52 58s-52-22-52-58V84l52-22z" fill="rgba(6,182,212,0.05)" stroke="#06b6d4" strokeWidth="1.6" strokeLinejoin="round"/>
              {/* Shield inner */}
              <path d="M240 78 l34 14v30c0 24-34 38-34 38s-34-14-34-38V92l34-14z" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.25)" strokeWidth="1" strokeLinejoin="round"/>
              {/* Magnifier inside inner shield */}
              <circle cx="240" cy="118" r="12" stroke="#06b6d4" strokeWidth="1.8" fill="rgba(6,182,212,0.08)"/>
              <circle cx="240" cy="118" r="7" stroke="rgba(6,182,212,0.25)" strokeWidth="0.8" fill="none"/>
              <line x1="249" y1="127" x2="258" y2="136" stroke="#06b6d4" strokeWidth="2.4" strokeLinecap="round"/>
              {/* VERIFY FIRST below shield */}
              <text x="240" y="202" textAnchor="middle" fill="rgba(6,182,212,0.85)" fontFamily="monospace" fontSize="10" letterSpacing="1.5" fontWeight="700">VERIFY FIRST</text>
              <text x="240" y="216" textAnchor="middle" fill="rgba(6,182,212,0.35)" fontFamily="monospace" fontSize="7.5">before sending</text>
              {/* Dashed arrow shield → destination */}
              <line x1="294" y1="132" x2="326" y2="132" stroke="rgba(255,59,59,0.5)" strokeWidth="1.4" strokeDasharray="4 3"/>
              <polygon points="336,132 325,126 325,138" fill="rgba(255,59,59,0.7)"/>
              {/* DESTINATION box: x=338, w=116, right=454; icon cx=454 cy=52 r=13 → right=467 */}
              <rect x="338" y="52" width="116" height="178" rx="4" fill="rgba(255,59,59,0.03)" stroke="rgba(255,59,59,0.5)" strokeWidth="1.5" strokeDasharray="5 3"/>
              <rect x="338" y="52" width="116" height="22" rx="4" fill="rgba(255,59,59,0.07)"/>
              <line x1="338" y1="74" x2="454" y2="74" stroke="rgba(255,59,59,0.12)" strokeWidth="0.5"/>
              <text x="388" y="67" textAnchor="middle" fill="rgba(255,59,59,0.85)" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="600">DESTINATION ?</text>
              {/* ⚠ icon at top-right corner */}
              <circle cx="454" cy="52" r="13" fill="rgba(18,0,0,0.97)" stroke="#ff3b3b" strokeWidth="1.6"/>
              <line x1="454" y1="45" x2="454" y2="54" stroke="#ff3b3b" strokeWidth="2.2" strokeLinecap="round"/>
              <circle cx="454" cy="59" r="1.6" fill="#ff3b3b"/>
              <text x="396" y="124" textAnchor="middle" fill="rgba(255,59,59,0.28)" fontFamily="monospace" fontSize="46" fontWeight="700">??</text>
              <text x="396" y="163" textAnchor="middle" fill="rgba(255,59,59,0.13)" fontFamily="monospace" fontSize="24">??</text>
              <text x="396" y="192" textAnchor="middle" fill="rgba(255,59,59,0.5)" fontFamily="monospace" fontSize="7.5" letterSpacing="1">UNVERIFIED WALLET</text>
              <text x="396" y="206" textAnchor="middle" fill="rgba(255,59,59,0.25)" fontFamily="monospace" fontSize="7">could be sanctioned</text>
              <text x="396" y="218" textAnchor="middle" fill="rgba(255,59,59,0.16)" fontFamily="monospace" fontSize="6.5">mixer-linked or scam</text>
              <line x1="12" y1="244" x2="468" y2="244" stroke="rgba(255,59,59,0.05)" strokeWidth="0.5"/>
              <text x="240" y="259" textAnchor="middle" fill="rgba(255,59,59,0.25)" fontFamily="monospace" fontSize="7.5" letterSpacing="1">PASTE ADDRESS BEFORE YOU CONFIRM</text>
            </svg>
          ),

          inbound: (
            <svg viewBox="0 0 480 270" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden" style={{ width: '100%', maxWidth: 480, height: 'auto' }}>
              <rect width="480" height="270" fill="rgba(0,8,15,0.88)" rx="4"/>
              {/* CLEAN SOURCE */}
              <rect x="14" y="14" width="124" height="66" rx="4" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.45)" strokeWidth="1.2"/>
              <rect x="14" y="14" width="124" height="20" rx="4" fill="rgba(6,182,212,0.07)"/>
              <line x1="14" y1="34" x2="138" y2="34" stroke="rgba(6,182,212,0.12)" strokeWidth="0.5"/>
              <text x="76" y="27" textAnchor="middle" fill="rgba(6,182,212,0.85)" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="600">CLEAN SOURCE</text>
              <rect x="26" y="42" width="46" height="4" rx="1.5" fill="rgba(6,182,212,0.2)"/>
              <rect x="26" y="52" width="32" height="3.5" rx="1" fill="rgba(6,182,212,0.11)"/>
              <text x="76" y="72" textAnchor="middle" fill="rgba(6,182,212,0.35)" fontFamily="monospace" fontSize="7">0x2f1a...c3d</text>
              {/* UNKNOWN SOURCE */}
              <rect x="14" y="102" width="124" height="66" rx="4" fill="rgba(255,140,0,0.03)" stroke="rgba(255,140,0,0.4)" strokeWidth="1.2"/>
              <rect x="14" y="102" width="124" height="20" rx="4" fill="rgba(255,140,0,0.06)"/>
              <line x1="14" y1="122" x2="138" y2="122" stroke="rgba(255,140,0,0.1)" strokeWidth="0.5"/>
              <text x="76" y="115" textAnchor="middle" fill="rgba(255,140,0,0.85)" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="600">UNKNOWN</text>
              <rect x="26" y="130" width="46" height="4" rx="1.5" fill="rgba(255,140,0,0.18)"/>
              <rect x="26" y="140" width="32" height="3.5" rx="1" fill="rgba(255,140,0,0.1)"/>
              <text x="76" y="160" textAnchor="middle" fill="rgba(255,140,0,0.35)" fontFamily="monospace" fontSize="7">0x8b4d...e7f</text>
              {/* FLAGGED SOURCE */}
              <rect x="14" y="190" width="124" height="66" rx="4" fill="rgba(255,59,59,0.04)" stroke="rgba(255,59,59,0.6)" strokeWidth="1.3"/>
              <rect x="14" y="190" width="124" height="20" rx="4" fill="rgba(255,59,59,0.08)"/>
              <line x1="14" y1="210" x2="138" y2="210" stroke="rgba(255,59,59,0.14)" strokeWidth="0.5"/>
              <text x="68" y="203" textAnchor="middle" fill="rgba(255,59,59,0.95)" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="600">FLAGGED SOURCE</text>
              <rect x="26" y="218" width="46" height="4" rx="1.5" fill="rgba(255,59,59,0.2)"/>
              <rect x="26" y="228" width="32" height="3.5" rx="1" fill="rgba(255,59,59,0.11)"/>
              <text x="76" y="248" textAnchor="middle" fill="rgba(255,59,59,0.45)" fontFamily="monospace" fontSize="7">0x7c3e...b2a · OFAC</text>
              {/* ⚠ at top-right corner of flagged box */}
              <circle cx="138" cy="190" r="13" fill="rgba(18,0,0,0.97)" stroke="#ff3b3b" strokeWidth="1.6"/>
              <line x1="138" y1="183" x2="138" y2="192" stroke="#ff3b3b" strokeWidth="2.2" strokeLinecap="round"/>
              <circle cx="138" cy="197" r="1.6" fill="#ff3b3b"/>
              {/* Arrows — drawn before tainted label */}
              <line x1="140" y1="47" x2="283" y2="121" stroke="rgba(6,182,212,0.5)" strokeWidth="1.4"/>
              <polygon points="292,128 279,122 284,112" fill="rgba(6,182,212,0.8)"/>
              <line x1="140" y1="135" x2="285" y2="135" stroke="rgba(255,140,0,0.55)" strokeWidth="1.4" strokeDasharray="5 3"/>
              <polygon points="296,135 284,129 284,141" fill="rgba(255,140,0,0.85)"/>
              <line x1="140" y1="223" x2="283" y2="148" stroke="rgba(255,59,59,0.65)" strokeWidth="1.5"/>
              <polygon points="292,142 279,148 284,157" fill="rgba(255,59,59,0.85)"/>
              {/* TAINTED label drawn last — on top of arrows */}
              <rect x="152" y="172" width="120" height="18" rx="3" fill="rgba(12,0,0,0.94)" stroke="rgba(255,59,59,0.55)" strokeWidth="1.2"/>
              <text x="212" y="184.5" textAnchor="middle" fill="#ff3b3b" fontFamily="monospace" fontSize="8" letterSpacing="1.2" fontWeight="700">TAINTED SOURCE</text>
              {/* YOUR WALLET right */}
              <rect x="300" y="28" width="166" height="214" rx="4" fill="rgba(6,182,212,0.04)" stroke="#06b6d4" strokeWidth="1.5"/>
              <rect x="300" y="28" width="166" height="22" rx="4" fill="rgba(6,182,212,0.1)"/>
              <line x1="300" y1="50" x2="466" y2="50" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5"/>
              <text x="383" y="43" textAnchor="middle" fill="rgba(6,182,212,0.95)" fontFamily="monospace" fontSize="8" letterSpacing="1.5" fontWeight="600">YOUR WALLET</text>
              <rect x="312" y="60" width="62" height="5" rx="2" fill="rgba(6,182,212,0.22)"/>
              <rect x="312" y="72" width="44" height="4" rx="1.5" fill="rgba(6,182,212,0.13)"/>
              <rect x="312" y="83" width="52" height="4" rx="1.5" fill="rgba(6,182,212,0.07)"/>
              <line x1="312" y1="104" x2="454" y2="104" stroke="rgba(6,182,212,0.07)" strokeWidth="0.5"/>
              <text x="383" y="120" textAnchor="middle" fill="rgba(6,182,212,0.4)" fontFamily="monospace" fontSize="8" letterSpacing="1">RECEIVED</text>
              <text x="383" y="144" textAnchor="middle" fill="rgba(6,182,212,0.75)" fontFamily="monospace" fontSize="18" fontWeight="700">3.7 ETH</text>
              <text x="383" y="160" textAnchor="middle" fill="rgba(6,182,212,0.3)" fontFamily="monospace" fontSize="8">from 3 sources</text>
              <line x1="312" y1="178" x2="454" y2="178" stroke="rgba(255,59,59,0.1)" strokeWidth="0.5"/>
              <text x="383" y="196" textAnchor="middle" fill="rgba(255,140,0,0.7)" fontFamily="monospace" fontSize="8" letterSpacing="0.5" fontWeight="700">! 1 FLAGGED SOURCE</text>
              <text x="383" y="212" textAnchor="middle" fill="rgba(255,59,59,0.35)" fontFamily="monospace" fontSize="7">funds may be tainted</text>
              <text x="383" y="228" textAnchor="middle" fill="rgba(6,182,212,0.25)" fontFamily="monospace" fontSize="7">0x9e2b...f1a</text>
            </svg>
          ),

          protocol: (
            <svg viewBox="0 0 480 270" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="hidden" style={{ width: '100%', maxWidth: 480, height: 'auto' }}>
              <rect width="480" height="270" fill="rgba(0,8,15,0.88)" rx="4"/>
              <rect x="186" y="8" width="108" height="32" rx="3" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.5)" strokeWidth="1.5" strokeDasharray="4 2"/>
              <rect x="186" y="8" width="108" height="14" rx="3" fill="rgba(6,182,212,0.08)"/>
              <text x="240" y="19" textAnchor="middle" fill="rgba(6,182,212,0.9)" fontFamily="monospace" fontSize="8.5" letterSpacing="1" fontWeight="600">YOU →</text>
              <text x="240" y="33" textAnchor="middle" fill="rgba(6,182,212,0.35)" fontFamily="monospace" fontSize="7">interacting with contract</text>
              <line x1="240" y1="40" x2="240" y2="60" stroke="#06b6d4" strokeWidth="1.4" strokeDasharray="3 2"/>
              <polygon points="240,60 292,88 292,144 240,172 188,144 188,88" fill="rgba(6,182,212,0.05)" stroke="#06b6d4" strokeWidth="1.8"/>
              <polygon points="240,74 274,93 274,131 240,150 206,131 206,93" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.22)" strokeWidth="0.8"/>
              <text x="240" y="103" textAnchor="middle" fill="rgba(6,182,212,0.75)" fontFamily="monospace" fontSize="8.5" letterSpacing="0.5" fontWeight="600">CONTRACT</text>
              <text x="240" y="117" textAnchor="middle" fill="rgba(6,182,212,0.45)" fontFamily="monospace" fontSize="7">0x4a2f...c8e</text>
              <text x="240" y="130" textAnchor="middle" fill="rgba(6,182,212,0.28)" fontFamily="monospace" fontSize="6.5">deployed 94d ago</text>
              <text x="240" y="143" textAnchor="middle" fill="rgba(6,182,212,0.18)" fontFamily="monospace" fontSize="6">unverified</text>
              <circle cx="60" cy="90" r="30" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.35)" strokeWidth="1.3"/>
              <text x="60" y="87" textAnchor="middle" fill="rgba(6,182,212,0.6)" fontFamily="monospace" fontSize="8.5" fontWeight="600">0x2f1a</text>
              <text x="60" y="100" textAnchor="middle" fill="rgba(6,182,212,0.35)" fontFamily="monospace" fontSize="7.5">clean</text>
              <line x1="90" y1="93" x2="187" y2="108" stroke="rgba(6,182,212,0.3)" strokeWidth="1"/>
              <circle cx="420" cy="90" r="30" fill="rgba(6,182,212,0.03)" stroke="rgba(6,182,212,0.35)" strokeWidth="1.3"/>
              <text x="420" y="87" textAnchor="middle" fill="rgba(6,182,212,0.6)" fontFamily="monospace" fontSize="8.5" fontWeight="600">0x9a4b</text>
              <text x="420" y="100" textAnchor="middle" fill="rgba(6,182,212,0.35)" fontFamily="monospace" fontSize="7.5">clean</text>
              <line x1="390" y1="93" x2="293" y2="108" stroke="rgba(6,182,212,0.3)" strokeWidth="1"/>
              <circle cx="68" cy="204" r="32" fill="rgba(255,59,59,0.05)" stroke="rgba(255,59,59,0.7)" strokeWidth="1.6"/>
              <text x="68" y="200" textAnchor="middle" fill="rgba(255,59,59,0.8)" fontFamily="monospace" fontSize="8.5" fontWeight="600">0x7c3e</text>
              <text x="68" y="213" textAnchor="middle" fill="rgba(255,59,59,0.5)" fontFamily="monospace" fontSize="7.5">hacker</text>
              <circle cx="96" cy="176" r="10" fill="rgba(18,0,0,0.97)" stroke="#ff3b3b" strokeWidth="1.3"/>
              <line x1="96" y1="170" x2="96" y2="178" stroke="#ff3b3b" strokeWidth="1.6" strokeLinecap="round"/>
              <circle cx="96" cy="183" r="1.3" fill="#ff3b3b"/>
              <line x1="96" y1="176" x2="188" y2="144" stroke="rgba(255,59,59,0.6)" strokeWidth="1.5"/>
              <circle cx="412" cy="204" r="32" fill="rgba(255,59,59,0.05)" stroke="rgba(255,59,59,0.7)" strokeWidth="1.6"/>
              <text x="412" y="200" textAnchor="middle" fill="rgba(255,59,59,0.8)" fontFamily="monospace" fontSize="8.5" fontWeight="600">0xd3f8</text>
              <text x="412" y="213" textAnchor="middle" fill="rgba(255,59,59,0.5)" fontFamily="monospace" fontSize="7.5">mixer</text>
              <circle cx="384" cy="176" r="10" fill="rgba(18,0,0,0.97)" stroke="#ff3b3b" strokeWidth="1.3"/>
              <line x1="384" y1="170" x2="384" y2="178" stroke="#ff3b3b" strokeWidth="1.6" strokeLinecap="round"/>
              <circle cx="384" cy="183" r="1.3" fill="#ff3b3b"/>
              <line x1="384" y1="176" x2="292" y2="144" stroke="rgba(255,59,59,0.6)" strokeWidth="1.5"/>
              {/* HIDDEN CONNECTIONS drawn last */}
              <rect x="138" y="244" width="204" height="19" rx="3" fill="rgba(12,0,0,0.92)" stroke="rgba(255,59,59,0.38)" strokeWidth="1"/>
              <text x="240" y="257" textAnchor="middle" fill="rgba(255,59,59,0.7)" fontFamily="monospace" fontSize="8" letterSpacing="1" fontWeight="600">HIDDEN CONNECTIONS</text>
            </svg>
          ),
        };

        const useCases: UseCase[] = [
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="3" y="9" width="26" height="18" rx="2" stroke="#06b6d4" strokeWidth="1.5"/>
                <path d="M3 15h26" stroke="#06b6d4" strokeWidth="1.5"/>
                <circle cx="16" cy="21" r="2.5" stroke="#06b6d4" strokeWidth="1.5"/>
                <path d="M16 9V5M13 7l3-3 3 3" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
            tag: 'Incoming payment',
            scenario: 'Getting paid in crypto',
            who: 'Freelancers · Sellers · Creators',
            body: "Someone wants to pay you in ETH or USDC. You don't know them. Check their wallet before you hand over your address — or before you accept funds that could later be flagged.",
            story: [
              "You've agreed to do freelance work for someone you met online. They offer to pay in ETH. Sounds good — until you realize you have no idea who they are on-chain.",
              "If their wallet has been used to launder stolen funds, the ETH they send you can be flagged. Your exchange flags the deposit. Your account gets reviewed. You did nothing wrong, but you're the one answering questions.",
              "A 10-second check before you share your address would have shown the red flags. You could have asked for a different payment method, or walked away entirely.",
            ],
            diagram: 'incoming',
          },
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 3L28 8v10c0 7-12 11-12 11S4 25 4 18V8L16 3z" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M11 16l3.5 3.5L21 12" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
            tag: 'Outgoing transfer',
            scenario: 'Sending to a new wallet',
            who: 'Anyone making a transfer',
            body: "Before you confirm a send to a new exchange, platform, or person — paste their address. Know in seconds if it's connected to a scam, a hack, or a government-sanctioned entity.",
            story: [
              "You found a new exchange with great rates. You're about to move $2,000 in ETH. The site looks legitimate. The address looks real.",
              "Scam platforms copy the UI of real exchanges down to the favicon. The only difference is the destination address — and destination addresses are built to look random anyway.",
              "Paste it into ClearChain first. If that address has been flagged in a previous scam, received funds from a sanctioned entity, or shows rapid in-and-out movement, you'll know before you confirm.",
            ],
            diagram: 'outgoing',
          },
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="#06b6d4" strokeWidth="1.5"/>
                <path d="M16 10v7" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="16" cy="21" r="1.5" fill="#06b6d4"/>
              </svg>
            ),
            tag: 'Unknown inbound',
            scenario: 'You received unexpected funds',
            who: 'DeFi users · NFT holders',
            body: "An airdrop. A random deposit. Someone sent you crypto you didn't ask for. Check where it came from — touching tainted funds can create problems even if you didn't initiate it.",
            story: [
              "Someone sent you 0.1 ETH. You didn't ask for it. You don't recognize the sender. It happens — airdrops, random goodwill, a mistaken transfer.",
              "Some of these are dusting attacks: small amounts sent to your wallet to track your activity. Others are from wallets that have been used in hacks or scams. If you interact with that ETH — swap it, send it, use it — you create an on-chain link to that wallet.",
              "Check the source first. If it's flagged, leave it alone. The few dollars aren't worth the paper trail.",
            ],
            diagram: 'inbound',
          },
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="13" cy="13" r="8" stroke="#06b6d4" strokeWidth="1.5"/>
                <path d="M19 19l7 7" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ),
            tag: 'Due diligence',
            scenario: 'Interacting with a new protocol',
            who: 'DeFi users · NFT buyers',
            body: "About to connect your wallet to a new platform or buy from a new project? Check the contract or team wallet first. Rug pulls and scam projects leave on-chain trails before they disappear.",
            story: [
              "A new DeFi protocol launches with strong tokenomics and a slick interface. The Discord is active. The Twitter has 20,000 followers. You're about to connect your wallet.",
              "Before the Ronin Bridge hack, before Multichain, before dozens of other protocol failures — the contracts and team wallets showed signs. Unusual fund flows. Connections to known risky entities. Activity that didn't match the project's stated history.",
              "Check the contract address and the team wallet before you sign anything. A 10-second look can tell you whether this protocol has connections you should know about.",
            ],
            diagram: 'protocol',
          },
        ];

        return (
          <div style={{ borderTop: '1px solid rgba(6,182,212,0.05)', padding: isMobile ? '40px 16px' : '64px 24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: isMobile ? 28 : 48 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 16, textTransform: 'uppercase' as const, textAlign: 'center' as const }}>
                Who uses ClearChain
              </div>
              <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 24 : 32, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px', textAlign: 'center' as const, letterSpacing: '-0.01em' }}>
                Anyone who&apos;s ever had to trust a wallet
              </h2>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 13 : 15, color: '#7ec8d8', textAlign: 'center' as const, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
                Crypto moves fast. These are the moments where a 10-second check can save you.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {useCases.map(uc => (
                <div
                  key={uc.scenario}
                  className="glass"
                  style={{
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    borderColor: expandedCase === uc.scenario ? 'rgba(6,182,212,0.3)' : undefined,
                    padding: isMobile ? '20px' : '24px 32px',
                  }}
                  onClick={() => setExpandedCase(prev => prev === uc.scenario ? null : uc.scenario)}
                >
                  {/* Top row — always visible */}
                  <div style={{ display: 'flex', gap: isMobile ? 16 : 32, alignItems: 'center' }}>
                    {/* Left: icon + title */}
                    <div style={{ flex: '0 0 auto', width: isMobile ? 'auto' : 260, display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div style={{ flexShrink: 0, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{uc.icon}</div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#06b6d4', marginBottom: 6, textTransform: 'uppercase' as const }}>{uc.tag}</div>
                        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#ecfeff', lineHeight: 1.2, marginBottom: 4 }}>{uc.scenario}</div>
                        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#1e4d5c', letterSpacing: '0.08em' }}>{uc.who}</div>
                      </div>
                    </div>

                    {/* Right: body text — desktop only */}
                    {!isMobile && (
                      <p style={{ flex: 1, fontFamily: 'var(--font-inter)', fontSize: 14, color: '#7ec8d8', lineHeight: 1.7, margin: 0, paddingTop: 2 }}>{uc.body}</p>
                    )}

                  </div>

                  {/* Body text on mobile */}
                  {isMobile && (
                    <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: '#7ec8d8', lineHeight: 1.7, margin: '12px 0 0' }}>{uc.body}</p>
                  )}

                  {/* SEE WHY THIS MATTERS / COLLAPSE toggle */}
                  <div
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      paddingTop: 14,
                      borderTop: '1px solid rgba(6,182,212,0.06)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      color: expandedCase === uc.scenario ? 'rgba(6,182,212,0.35)' : 'rgba(6,182,212,0.5)',
                      cursor: 'pointer',
                      userSelect: 'none' as const,
                      transition: 'color 0.15s',
                    }}
                    onClick={e => { e.stopPropagation(); setExpandedCase(prev => prev === uc.scenario ? null : uc.scenario); }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = '#06b6d4'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = expandedCase === uc.scenario ? 'rgba(6,182,212,0.35)' : 'rgba(6,182,212,0.5)'; }}
                  >
                    {expandedCase === uc.scenario ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 6.5l3.5-3.5 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        COLLAPSE
                      </>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        SEE WHY THIS MATTERS
                      </>
                    )}
                  </div>

                  {/* Deep dive — expanded state */}
                  {expandedCase === uc.scenario && (
                    <div
                      style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(6,182,212,0.1)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ display: 'flex', gap: isMobile ? 0 : 40, flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start' }}>
                        {/* Diagram */}
                        <div style={{ flex: '0 0 auto', width: isMobile ? '100%' : 380, marginBottom: isMobile ? 20 : 0 }}>
                          {useCaseDiagrams[uc.diagram]}
                        </div>
                        {/* Story */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {uc.story.map((para: string, i: number) => (
                            <p key={i} style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 13 : 14, color: i === 1 ? '#ff8c00' : '#7ec8d8', lineHeight: 1.75, margin: 0, fontStyle: i === 1 ? 'italic' : 'normal' }}>{para}</p>
                          ))}
                          <div style={{ marginTop: 8 }}>
                            <button
                              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 4, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.1em', color: '#06b6d4', cursor: 'pointer', textDecoration: 'none' }}
                            >
                              Check a wallet now →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Feature grid */}
      <div
        style={{
          borderTop: '1px solid rgba(6,182,212,0.05)',
          padding: isMobile ? '32px 16px 16px' : '48px 24px 16px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          animation: 'fadeSlideUp 0.5s ease-out both',
          animationDelay: '0.6s',
        }}
      >
        {/* Top 5 cards — 3-col grid, Simulator card spans 2 to fill row 2 */}
        <div
          className="feature-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            background: 'rgba(6,182,212,0.05)',
            alignItems: 'stretch',
          }}
        >
          {features.slice(0, 5).map((f, i) => (
            <div
              key={f.title}
              style={{
                background: '#00080f',
                display: 'flex',
                alignItems: 'stretch',
                ...(i === 4 ? { gridColumn: 'span 2' } : {}),
              }}
            >
              <FeatureCard title={f.title} desc={f.desc} icon={f.icon} />
            </div>
          ))}
        </div>

        {/* Attribution hero stat card — full width below grid */}
        <div style={{ marginTop: 1, background: 'rgba(6,182,212,0.05)' }}>
          <a href="/docs#attribution" style={{ textDecoration: 'none', display: 'block' }}>
            <div
              style={{
                background: '#080b14',
                borderLeft: '4px solid rgba(0,255,136,0.3)',
                padding: isMobile ? '24px 20px' : '32px 40px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: isMobile ? '16px 24px' : '32px 48px',
              }}
            >
              {/* Stat */}
              <div style={{ flex: '0 0 auto' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: isMobile ? 36 : 48,
                    fontWeight: 700,
                    color: '#00ff88',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  17,000+
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    color: 'rgba(0,255,136,0.5)',
                    textTransform: 'uppercase' as const,
                    marginTop: 6,
                  }}
                >
                  Labeled Wallets
                </div>
              </div>

              {/* Description + pills */}
              <div style={{ flex: '1 1 240px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-space-grotesk)',
                    fontSize: 15,
                    color: '#94a3b8',
                    lineHeight: 1.6,
                    marginBottom: 16,
                  }}
                >
                  Every analysis cross-references a database of known exchanges, scam wallets, phishing addresses, DeFi protocols, and flagged entities — so you know exactly who you&apos;re dealing with.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Exchanges', 'Scam Wallets', 'DeFi Protocols', 'Phishing'].map(tag => (
                    <span
                      key={tag}
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 11,
                        color: 'rgba(0,255,136,0.7)',
                        border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: 20,
                        padding: '3px 10px',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div style={{ flex: '0 0 auto' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 12,
                    color: '#06b6d4',
                    letterSpacing: '0.05em',
                  }}
                >
                  Explore attribution data →
                </span>
              </div>
            </div>
          </a>
        </div>
      </div>


      {/* Why ClearChain */}
      <div style={{ borderTop: '1px solid rgba(6,182,212,0.08)', width: '100%' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '48px 20px' : '80px 32px' }}>
          {/* Header */}
          <div style={{ marginBottom: isMobile ? 32 : 60 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 16, textTransform: 'uppercase' as const }}>
              Why ClearChain
            </div>
            <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 28 : 36, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
              Most people send first. Then find out.
            </h2>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 14 : 16, color: '#7ec8d8', margin: 0, lineHeight: 1.6 }}>
              ClearChain gives you the information you need before you confirm — not after.
            </p>
          </div>

          {/* Comparison grid */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', marginBottom: isMobile ? 40 : 64 }}>
            {[
              {
                left: { label: 'WITHOUT CHECKING', body: 'You see an address. You have no idea if it\'s connected to a scam, a hack, or a government-sanctioned entity. You find out after it\'s too late.' },
                right: { label: 'WITH CLEARCHAIN', body: 'Sanctions check, mixer flags, scam wallet labels, and on-chain risk signals — all in one look, in under 10 seconds. Free.' },
              },
              {
                left: { label: 'OTHER TOOLS', body: 'Most crypto safety tools are built for institutions. Expensive APIs, complex dashboards, output that tells you nothing actionable.' },
                right: { label: 'CLEARCHAIN', body: 'Built for people, not compliance departments. ETH, BTC, TRX, and SOL. Plain-English results. No account required for a basic check.' },
              },
              {
                left: { label: 'THE OLD WAY', body: 'Send first. Google the address later. Hope for the best. Realize there was a red flag three blocks ago when your funds are already gone.' },
                right: { label: 'THE CLEARCHAIN WAY', body: 'Paste the address before you confirm. Get a risk score, a plain-English summary, and every flag explained. Then decide.' },
              },
            ].map((row, i) => (
              <>
                <div key={`left-${i}`} className="glass" style={{ padding: isMobile ? '20px 20px' : '28px 32px' }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#1e4d5c', marginBottom: 12 }}>{row.left.label}</div>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 14 : 15, color: '#7ec8d8', lineHeight: 1.7, margin: 0 }}>{row.left.body}</p>
                </div>
                <div key={`right-${i}`} style={{ padding: isMobile ? '20px 20px' : '28px 32px', border: `1px solid ${isMobile ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.08)'}`, background: isMobile ? 'rgba(6,182,212,0.02)' : 'transparent', borderTop: isMobile ? 'none' : undefined }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#1e4d5c', marginBottom: 12 }}>{row.right.label}</div>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 14 : 15, color: '#7ec8d8', lineHeight: 1.7, margin: 0 }}>{row.right.body}</p>
                </div>
              </>
            ))}
          </div>

          {/* Stat row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: isMobile ? '24px 32px' : 0, marginTop: 40 }}>
            {[
              { value: '< 10s', label: 'average analysis time' },
              { value: '4 chains', label: 'ETH, BTC, TRX, SOL' },
              { value: 'Free', label: 'sign up free' },
            ].map((stat, i) => (
              <>
                {i > 0 && !isMobile && <div key={`div-${i}`} style={{ width: 1, height: 40, background: 'rgba(6,182,212,0.08)', margin: '0 48px' }} />}
                <div key={stat.value} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 24 : 32, fontWeight: 700, color: '#06b6d4', lineHeight: 1, marginBottom: 8 }}>{stat.value}</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.12em', color: '#1e4d5c' }}>{stat.label}</div>
                </div>
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyze button (extracted so it can be used in hero + compact bar)
// ---------------------------------------------------------------------------

function AnalyzeButton({ loading, compact, showShortcut = true }: { loading: boolean; compact?: boolean; showShortcut?: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <button
        type="submit"
        disabled={loading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: loading ? 'rgba(6,182,212,0.4)' : hovered ? '#22d3ee' : '#06b6d4',
          border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: compact ? 10 : 12,
          fontWeight: 600,
          letterSpacing: '0.12em',
          color: '#00080f',
          padding: compact ? '6px 14px' : '9px 20px',
          borderRadius: 3,
          boxShadow: hovered && !loading ? '0 0 20px rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.2)' : '0 0 0 rgba(0,0,0,0)',
          transform: hovered && !loading ? 'translateY(-1px)' : 'translateY(0)',
          transition: 'background 0.15s, box-shadow 0.2s, transform 0.15s',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '...' : '→ ANALYZE'}
      </button>
      {!compact && showShortcut && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            color: 'var(--text-dim)',
            padding: '2px 6px',
            border: '1px solid rgba(6,182,212,0.08)',
            borderRadius: 2,
            lineHeight: 1.5,
          }}
        >
          ⌘↵
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results address bar — row 1
// ---------------------------------------------------------------------------

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleShare}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        border: `1px solid ${copied ? 'rgba(6,182,212,0.4)' : hovered ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.08)'}`,
        borderRadius: 2,
        background: copied ? 'rgba(6,182,212,0.08)' : hovered ? 'rgba(6,182,212,0.05)' : 'none',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        color: copied ? '#06b6d4' : hovered ? '#06b6d4' : 'var(--text-secondary)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.2s',
      }}
    >
      {copied ? 'COPIED!' : 'SHARE →'}
    </button>
  );
}

function SaveToCaseButton({ address, analysisId }: { address: string; analysisId?: string }) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<{ id: string; title: string }[]>([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user));
  }, []);

  // Recalculate portal position whenever dropdown opens
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [open]);

  // Close on outside click — checks both button and portal div
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleOpen() {
    if (!open) {
      const res = await fetch('/api/cases', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setCases(j.cases ?? []); }
    }
    setOpen(v => !v);
  }

  async function handleSave() {
    setSaving(true);
    let caseId = selectedCase;
    if (mode === 'new') {
      const res = await fetch('/api/cases', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, address, analysisId }),
      });
      const j = await res.json();
      caseId = j.case?.id;
    } else {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }
      let finalAnalysisId = analysisId;
      if (!finalAnalysisId) {
        const { data: a } = await supabase.from('analyses').select('id').eq('address', address).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();
        finalAnalysisId = a?.id;
      }
      await supabase.from('case_addresses').insert({ case_id: caseId, address, chain: 'ETH', analysis_id: finalAnalysisId ?? null });
      await supabase.from('cases').update({ updated_at: new Date().toISOString() }).eq('id', caseId);
    }
    if (!caseId) { setSaving(false); return; }
    const caseName = mode === 'new' ? newTitle : (cases.find(c => c.id === caseId)?.title ?? 'case');
    setSaved(caseName);
    setSaving(false);
    setOpen(false);
    setTimeout(() => setSaved(''), 2500);
  }

  const canSave = mode === 'existing' ? !!selectedCase : !!newTitle.trim();

  if (isLoggedIn === null) return null;
  if (!isLoggedIn) {
    return (
      <a href="/auth/login" style={{ padding: '6px 14px', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 2, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none', flexShrink: 0 }}>
        Sign in to save →
      </a>
    );
  }

  const dropdown = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        right: dropdownPos.right,
        zIndex: 9999,
        background: '#001824',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        padding: 16,
        minWidth: 280,
        boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.15em', color: '#1e4d5c', marginBottom: 12 }}>+ SAVE TO CASE</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['existing', 'new'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '6px', border: `1px solid ${mode === m ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 3, background: mode === m ? 'rgba(6,182,212,0.08)' : 'transparent', color: mode === m ? '#06b6d4' : '#7ec8d8', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono)' }}>
            {m === 'existing' ? 'EXISTING' : 'NEW CASE'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        {mode === 'existing' ? (
          <select
            value={selectedCase}
            onChange={e => setSelectedCase(e.target.value)}
            style={{ width: '100%', background: '#00080f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#ecfeff', fontSize: 16, padding: '8px 10px', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            <option value="">Select a case...</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Case name..."
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#ecfeff', fontSize: 16, padding: '6px 0', outline: 'none', fontFamily: 'var(--font-jetbrains-mono)' }}
          />
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !canSave}
        style={{ width: '100%', padding: '9px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 3, color: '#06b6d4', fontSize: 11, letterSpacing: '0.12em', cursor: saving || !canSave ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-jetbrains-mono)', opacity: saving || !canSave ? 0.5 : 1 }}
      >
        {saving ? 'SAVING...' : '→ SAVE TO CASE'}
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        style={{
          padding: '6px 14px',
          border: `1px solid ${saved ? 'rgba(6,182,212,0.4)' : open ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.08)'}`,
          borderRadius: 2,
          background: saved ? 'rgba(6,182,212,0.08)' : open ? 'rgba(6,182,212,0.05)' : 'none',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          color: saved ? '#06b6d4' : open ? '#06b6d4' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {saved ? `Saved to ${saved}` : '+ Save to Case'}
      </button>
      {dropdown}
    </div>
  );
}

function ResultsAddressBar({
  address,
  analyzedAt,
  chain,
  onNewAnalysis,
  inputValue,
  setInputValue,
  loading,
  inputFocused,
  setInputFocused,
  onSubmit,
  exportButton,
  saveButton,
  watchlistButton,
}: {
  address: string;
  analyzedAt: string;
  chain?: 'ETH' | 'BTC' | 'TRX' | 'SOL';
  onNewAnalysis: () => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  loading: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  exportButton?: React.ReactNode;
  saveButton?: React.ReactNode;
  watchlistButton?: React.ReactNode;
}) {
  const barWindowWidth = useWindowWidth();
  const isMobile = barWindowWidth < 768;
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [overflowPos, setOverflowPos] = React.useState({ top: 0, right: 0 });
  const overflowBtnRef = React.useRef<HTMLButtonElement>(null);
  const overflowDropRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (overflowOpen && overflowBtnRef.current) {
      const rect = overflowBtnRef.current.getBoundingClientRect();
      setOverflowPos({ top: rect.bottom + window.scrollY + 6, right: window.innerWidth - rect.right });
    }
  }, [overflowOpen]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        overflowBtnRef.current && !overflowBtnRef.current.contains(target) &&
        overflowDropRef.current && !overflowDropRef.current.contains(target)
      ) setOverflowOpen(false);
    }
    if (overflowOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [overflowOpen]);

  const overflowPortal = overflowOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={overflowDropRef}
      style={{ position: 'absolute', top: overflowPos.top, right: overflowPos.right, zIndex: 9999, background: '#001f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '6px 0', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' }}
    >
      <div onClick={() => setOverflowOpen(false)} style={{ display: 'contents' }}>{saveButton}</div>
      <div onClick={() => setOverflowOpen(false)} style={{ display: 'contents' }}>{exportButton}</div>
    </div>,
    document.body
  ) : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 0 20px',
        borderBottom: '1px solid rgba(6,182,212,0.08)',
        marginBottom: 28,
        flexWrap: 'wrap',
        animation: 'fadeSlideUp 0.4s ease-out both',
        animationDelay: '0s',
      }}
    >
      {/* Analyzed address */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            color: 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          ANALYZED
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: isMobile ? 11 : 13,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: isMobile ? 160 : undefined,
          }}
          title={address}
        >
          {address}
        </span>
        {chain && (() => {
          const chainStyle = chain === 'BTC'
            ? { border: 'rgba(249,115,22,0.35)', bg: 'rgba(249,115,22,0.07)', color: '#f97316' }
            : chain === 'TRX'
            ? { border: 'rgba(255,69,0,0.35)',   bg: 'rgba(255,69,0,0.07)',   color: '#ff4500' }
            : { border: 'rgba(6,182,212,0.2)',   bg: 'rgba(6,182,212,0.05)', color: '#06b6d4' };
          return (
            <span
              style={{
                padding: '3px 10px',
                border: `1px solid ${chainStyle.border}`,
                background: chainStyle.bg,
                borderRadius: 2,
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.12em',
                color: chainStyle.color,
                flexShrink: 0,
              }}
            >
              {chain}
            </span>
          );
        })()}
        {(() => {
          const lbl = getLabel(address);
          if (!lbl) return null;
          const colors = {
            sanctioned: { bg: 'rgba(255,59,59,0.1)', border: 'rgba(255,59,59,0.3)', text: '#ff3b3b' },
            exchange:   { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
            defi:       { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)', text: '#a78bfa' },
            notable:    { bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.25)', text: '#06b6d4' },
          }[lbl.category];
          return (
            <span
              style={{
                padding: '3px 10px',
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                borderRadius: 2,
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                color: colors.text,
                flexShrink: 0,
              }}
            >
              {lbl.label.toUpperCase()}
            </span>
          );
        })()}
      </div>

      {/* Timestamp */}
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
          flexShrink: 0,
        }}
      >
        {formatTimestamp(analyzedAt)}
      </span>

      {/* New analysis form — hidden on mobile (use ← NEW ANALYSIS button instead) */}
      <form
        onSubmit={onSubmit}
        style={{
          display: isMobile ? 'none' : 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `1px solid ${inputFocused ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
          paddingBottom: 6,
          transition: 'border-color 0.2s',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="new address..."
          spellCheck={false}
          autoComplete="off"
          disabled={loading}
          aria-label="Analyze new address"
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 16,
            color: 'var(--text-primary)',
            caretColor: '#06b6d4',
            width: 220,
          }}
        />
        <AnalyzeButton loading={loading} compact />
      </form>

      {/* Share (primary) */}
      <ShareButton />

      {/* Watchlist (primary — visible directly in row) */}
      {watchlistButton}

      {/* MORE ▾ overflow: Save + Export */}
      <div style={{ flexShrink: 0 }}>
        <button
          ref={overflowBtnRef}
          onClick={() => setOverflowOpen(o => !o)}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: 'var(--text-dim)', cursor: 'pointer', padding: '5px 10px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, lineHeight: 1, letterSpacing: '0.05em', transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          title="More actions"
        >
          MORE ▾
        </button>
        {overflowPortal}
      </div>

      {/* New Analysis (primary) */}
      <button
        onClick={onNewAnalysis}
        style={{ background: 'none', border: 'none', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0, padding: 0, transition: 'color 0.2s' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; }}
      >
        ← NEW ANALYSIS
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [address, setAddress] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const params  = new URLSearchParams(window.location.search);
    const urlAddr = params.get('address') ?? '';
    const urlChain = params.get('chain') ?? 'ETH';
    if (!urlAddr) return '';
    // Accept any valid address format for the detected chain
    if (urlChain === 'SOL' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(urlAddr)) return urlAddr;
    if (urlChain === 'BTC' && (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(urlAddr) || /^bc1[a-z0-9]{39,59}$/.test(urlAddr))) return urlAddr;
    if (urlChain === 'TRX' && /^T[a-zA-Z0-9]{33}$/.test(urlAddr)) return urlAddr;
    return /^0x[a-fA-F0-9]{40}$/.test(urlAddr) ? urlAddr : '';
  });
  const [selectedChain, setSelectedChain] = useState<'ETH' | 'BTC' | 'TRX' | 'SOL'>(() => {
    if (typeof window === 'undefined') return 'ETH';
    const c = new URLSearchParams(window.location.search).get('chain');
    return (c === 'BTC' || c === 'TRX' || c === 'SOL') ? c : 'ETH';
  });
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError]           = useState<ErrorState | null>(null);
  const [analysis, setAnalysis]     = useState<WalletAnalysis | null>(null);
  const [narrative, setNarrative]   = useState<string | null>(null);
  const [sarDraft, setSarDraft]     = useState<string | null>(null);
  const [hopData, setHopData]       = useState<HopEntry[] | undefined>(undefined);
  const [activeTab, setActiveTab]   = useState<Tab>('PATTERNS');
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Scroll to top on mount — belt-and-suspenders with the layout script
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { setHistory(loadHistory()); }, []);
  const [navUser, setNavUser] = useState<{ email: string; name: string } | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMobileMenuOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);
  const pendingTabRef  = useRef<Tab | null>(null);
  const showResults = !!analysis && !loading;

  // ── Sound design ──────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('cc_sound') !== 'off';
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  function getAudioCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }

  function playTone(freq: number, type: OscillatorType, duration: number, vol = 0.12) {
    if (!soundEnabledRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.01);
  }

  function playStartSound() {
    playTone(440, 'sine', 0.10, 0.09);
    setTimeout(() => playTone(660, 'sine', 0.10, 0.07), 80);
  }
  function playCompleteSound() {
    playTone(523, 'sine', 0.15, 0.10);
    setTimeout(() => playTone(659, 'sine', 0.15, 0.09), 100);
    setTimeout(() => playTone(784, 'sine', 0.25, 0.09), 210);
  }
  function playErrorSound() {
    playTone(440, 'triangle', 0.14, 0.09);
    setTimeout(() => playTone(330, 'triangle', 0.18, 0.07), 110);
  }
  function playCriticalSound() {
    playTone(880,  'sawtooth', 0.08, 0.06);
    setTimeout(() => playTone(880,  'sawtooth', 0.08, 0.06), 150);
    setTimeout(() => playTone(1100, 'sawtooth', 0.18, 0.06), 310);
  }

  // Show FLOW tab only when ≥3 distinct inbound sources exist
  const hasFlowData = React.useMemo(() => {
    if (!analysis || analysis.chain !== 'ETH') return false;
    const q = analysis.address.toLowerCase();
    const seen = new Set<string>();
    for (const tx of analysis.transactions) {
      const from = tx.from.toLowerCase();
      const to = (tx.to ?? '').toLowerCase();
      const isIn = tx.isInbound ?? (to === q);
      if (isIn && tx.value > 0 && from !== q) seen.add(from);
    }
    return seen.size >= 3;
  }, [analysis]);

  const displayTabs: Tab[] = hasFlowData ? [...BASE_TABS, 'FLOW'] : [...BASE_TABS];

  // Auth state — initial check + reactive listener + URL auto-analyze
  useEffect(() => {
    const supabase = createClient();

    const setUserFromSupabase = async (userObj: import('@supabase/supabase-js').User | null) => {
      if (userObj) {
        setIsAuthed(true);
        setNavUser({
          email: userObj.email ?? '',
          name: userObj.user_metadata?.name ?? userObj.email?.split('@')[0] ?? 'there',
        });
      } else {
        setIsAuthed(false);
        setNavUser(null);
      }
    };

    // Initial check + URL auto-analyze
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await setUserFromSupabase(session?.user ?? null);

      const params = new URLSearchParams(window.location.search);
      const urlAddr = params.get('address');
      if (!urlAddr) return;
      if (!session) { setShowAuthModal(true); return; }

      const urlChain = params.get('chain');
      const chain: 'ETH' | 'BTC' | 'TRX' | 'SOL' =
        urlChain === 'BTC' ? 'BTC' : urlChain === 'TRX' ? 'TRX' : urlChain === 'SOL' ? 'SOL' : 'ETH';
      const isEth = /^0x[a-fA-F0-9]{40}$/.test(urlAddr) || urlAddr.includes('.');
      const isBtc = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(urlAddr) || /^bc1[a-z0-9]{39,59}$/.test(urlAddr);
      const isTrx = /^T[a-zA-Z0-9]{33}$/.test(urlAddr);
      const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(urlAddr);
      if (isEth || isBtc || isTrx || isSol) runAnalysis(urlAddr, chain);
    });

    // Reactive — updates nav immediately on sign-in/sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserFromSupabase(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward button support
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const addr = params.get('address');
      const c = params.get('chain');
      if (!addr) {
        setAnalysis(null);
        setNarrative(null);
        setSarDraft(null);
        setHopData(undefined);
        setError(null);
        setAddress('');
      } else {
        setAddress(addr);
        if (c === 'BTC' || c === 'TRX') setSelectedChain(c);
        else setSelectedChain('ETH');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cmd+Enter / Ctrl+Enter shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const trimmed = address.trim();
        if (!trimmed || loading) return;
        if (!isAuthed) { setShowAuthModal(true); return; }
        runAnalysis(trimmed);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, loading, selectedChain]);

  // Loading step ticker
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, [loading]);

  // Deferred tab activation (e.g. after "Try the Simulator" quick-fill)
  // scrollIntoView intentionally removed — page scroll is always user-controlled
  useEffect(() => {
    if (!showResults || !pendingTabRef.current) return;
    const tab = pendingTabRef.current;
    pendingTabRef.current = null;
    setActiveTab(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults]);

  async function runAnalysis(addr: string, chain?: 'ETH' | 'BTC' | 'TRX' | 'SOL') {
    if (typeof window !== 'undefined') localStorage.setItem('cc_onboarded', '1');
    const activeChain = chain ?? selectedChain;
    playStartSound();   // Sound A — analysis begin
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    setAnalysis(null);
    setNarrative(null);
    setSarDraft(null);
    setHopData(undefined);
    setActiveTab('PATTERNS');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ address: addr, chain: activeChain }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json: APIResponse = await res.json();

      if (!json.success) {
        const e = json as ErrorAPIResponse;
        setError(apiErrorToState(e.code, e.error ?? 'An unexpected error occurred.', activeChain));
        playErrorSound();  // Sound C — API error
        return;
      }

      const { data, narrative: nar, sarDraft: sar, hopData: hops } = json as AnalysisAPIResponse;

      // Defensive: ensure required nested fields exist before setting state
      if (!data?.riskScore || !Array.isArray(data?.transactions)) {
        console.error('[ClearChain] Unexpected response shape:', data);
        setError(makeError('Analysis returned an unexpected data format. Please try again.', 'SERVER ERROR'));
        playErrorSound();  // Sound C — malformed response
        return;
      }
      // Ensure typologies is always an array (BTC/TRX return [])
      if (!Array.isArray(data.typologies)) data.typologies = [];

      setAnalysis(data);
      setNarrative(nar ?? null);
      setSarDraft(sar ?? null);
      setHopData(hops);
      if (data.riskScore.level === 'CRITICAL') {
        playCriticalSound();  // Sound D — CRITICAL result
      } else {
        playCompleteSound();  // Sound B — analysis complete
      }
      // Save to search history
      const historyEntry: HistoryEntry = { address: data.address, level: data.riskScore.level, timestamp: Date.now() };
      saveHistory(historyEntry);
      setHistory(loadHistory());
      window.history.pushState({}, '', `?address=${addr}&chain=${activeChain}`);
    } catch (err) {
      clearTimeout(timeout);
      console.error('[ClearChain] runAnalysis error:', err);
      if (err instanceof Error && err.name === 'AbortError') {
        setError(makeError('Analysis is taking longer than expected — the server may be warming up. Please try again.', 'TIMEOUT'));
      } else {
        setError(makeError('Could not reach the ClearChain API. Check your connection and try again.', 'NETWORK ERROR'));
      }
      playErrorSound();  // Sound C — network/timeout error
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthed) { setShowAuthModal(true); return; }
    const trimmed = address.trim();
    if (!trimmed) {
      setError(makeError(
        selectedChain === 'BTC' ? 'Please enter a Bitcoin address.' :
        selectedChain === 'TRX' ? 'Please enter a Tron address.' :
        selectedChain === 'SOL' ? 'Please enter a Solana address.' :
        'Please enter an Ethereum wallet address or ENS name.',
        'MISSING INPUT',
      ));
      return;
    }
    if (selectedChain === 'BTC') {
      const isBtc = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed) || /^bc1[a-z0-9]{39,59}$/.test(trimmed);
      if (!isBtc) { setError(makeError('Not a valid Bitcoin address. Addresses start with 1, 3, or bc1.', 'FORMAT ERROR')); return; }
      const checksumOk = await btcBase58CheckValid(trimmed);
      if (!checksumOk) { setError(makeError('Bitcoin address checksum is invalid — one or more characters are wrong. Double-check the full address.', 'FORMAT ERROR')); return; }
    } else if (selectedChain === 'TRX') {
      const isTrx = /^T[a-zA-Z0-9]{33}$/.test(trimmed);
      if (!isTrx) { setError(makeError('Not a valid Tron address. Must start with T and be exactly 34 characters.', 'FORMAT ERROR')); return; }
    } else if (selectedChain === 'SOL') {
      const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
      if (!isSol) { setError(makeError('Not a valid Solana address. Must be a 32–44 character base58 string (no 0, O, I, or l).', 'FORMAT ERROR')); return; }
    } else {
      const isHexAddr = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
      const isEns = trimmed.includes('.');
      if (!isHexAddr && !isEns) {
        setError(makeError('Not a valid Ethereum address. Use a 0x hex address (42 chars) or an ENS name like vitalik.eth.', 'FORMAT ERROR'));
        return;
      }
    }
    await runAnalysis(trimmed, selectedChain);
  }

  function handleQuickFill(addr: string) {
    if (!isAuthed) { setShowAuthModal(true); return; }
    setAddress(addr);
    runAnalysis(addr, selectedChain);
  }

  function handleOnboardingPick(addr: string) {
    if (!isAuthed) { setShowAuthModal(true); return; }
    setSelectedChain('ETH');
    setAddress(addr);
    runAnalysis(addr, 'ETH');
  }

  function handleSimulatorFill() {
    if (!isAuthed) { setShowAuthModal(true); return; }
    pendingTabRef.current = 'SIMULATOR';
    setAddress(TORNADO_CASH);
    runAnalysis(TORNADO_CASH);
  }

  function handleRemoveHistory(addr: string) {
    removeHistory(addr);
    setHistory(loadHistory());
  }

  function handleNewAnalysis() {
    setAnalysis(null);
    setNarrative(null);
    setSarDraft(null);
    setHopData(undefined);
    setError(null);
    setAddress('');
    window.history.pushState({}, '', '/');
  }

  function analyzeAddress(addr: string) {
    setAddress(addr);
    runAnalysis(addr);
  }

  function handleSARDownload() {
    if (!sarDraft || !analysis) return;
    const blob = new Blob([sarDraft], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearchain-sar-${analysis.address.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  const gridCols = isMobile ? '1fr' : isTablet ? '1fr 1fr' : '280px 1fr 280px';

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', position: 'relative', backgroundImage: 'linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }}>

      {/* Scanline */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(to right, transparent 0%, rgba(6,182,212,0.12) 50%, transparent 100%)',
          animation: 'scanline 12s linear infinite',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />

      {/* Nav */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: 'calc(56px + env(safe-area-inset-top))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: isMobile ? 16 : 32,
          paddingRight: isMobile ? 16 : 32,
          borderBottom: '1px solid rgba(6,182,212,0.08)',
          background: 'rgba(0,8,15,0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleNewAnalysis}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-rubik-glitch)',
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: '0.15em',
                color: '#22d3ee',
                animation: 'glitch 6s steps(1) infinite',
                display: 'inline-block',
              }}
            >
              CLEARCHAIN
            </span>
          </button>
          {!isMobile && (
            <span
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: 12,
                color: 'var(--text-dim)',
                paddingLeft: 12,
                borderLeft: '1px solid rgba(6,182,212,0.08)',
              }}
            >
              Know before you send
            </span>
          )}
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24 }}>
          {!isMobile && (
            <>
              <a
                href="/docs"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
              >
                DOCS
              </a>
              <a
                href="/intel"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
              >
                INTEL →
              </a>
              <a
                href="#extension"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: '#06b6d4',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#22d3ee'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#06b6d4'; }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 1a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2V2a1 1 0 0 0-1-1H6zm0 1h4v1H6V2zM3 4h10a1 1 0 0 1 1 1v1H2V5a1 1 0 0 1 1-1zm-1 3h12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"/>
                </svg>
                EXTENSION
              </a>

              {/* Status indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#06b6d4',
                    boxShadow: '0 0 8px rgba(6,182,212,0.8)',
                    animation: 'pulseGlow 2s ease-in-out infinite',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    color: 'var(--text-dim)',
                  }}
                >
                  ETH · BTC · TRX · SOL
                </span>
              </div>
            </>
          )}

          {/* Sound toggle — icon only on mobile */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('cc_sound', next ? 'on' : 'off');
            }}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: isMobile ? '4px' : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: soundEnabled ? 'var(--text-dim)' : 'rgba(6,182,212,0.2)',
              transition: 'color 0.15s',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = soundEnabled ? 'var(--text-secondary)' : 'rgba(6,182,212,0.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = soundEnabled ? 'var(--text-dim)' : 'rgba(6,182,212,0.2)'; }}
          >
            {isMobile ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                {soundEnabled ? (
                  <>
                    <path d="M3 5.5H1v5h2l4 3V2.5L3 5.5z" fill="currentColor" opacity="0.7"/>
                    <path d="M10 5a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M12 3a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </>
                ) : (
                  <>
                    <path d="M3 5.5H1v5h2l4 3V2.5L3 5.5z" fill="currentColor" opacity="0.4"/>
                    <line x1="10" y1="6" x2="14" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <line x1="14" y1="6" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </>
                )}
              </svg>
            ) : (
              soundEnabled ? '[SFX]' : '[---]'
            )}
          </button>

          {/* Auth — simplified on mobile */}
          {navUser ? (
            isMobile ? (
              <a
                href="/dashboard"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: '#06b6d4',
                  textDecoration: 'none',
                  border: '1px solid rgba(6,182,212,0.25)',
                  borderRadius: 2,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {navUser.name.split(' ')[0].toLowerCase()} ↗
              </a>
            ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 12, borderLeft: '1px solid rgba(6,182,212,0.08)' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.08em', color: '#06b6d4' }}>
                {navUser.name.split(' ')[0].toLowerCase()} ↗
              </span>
              <a
                href="/dashboard"
                style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-secondary)', textDecoration: 'none' }}
              >
                DASHBOARD
              </a>
              <button
                onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                }}
                style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                SIGN OUT
              </button>
            </div>
            )
          ) : (
            <a
              href="/auth/login"
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: isMobile ? 10 : 10,
                letterSpacing: '0.1em',
                color: isMobile ? '#06b6d4' : 'var(--text-dim)',
                textDecoration: 'none',
                ...(isMobile
                  ? {
                      border: '1px solid rgba(6,182,212,0.25)',
                      borderRadius: 2,
                      padding: '4px 10px',
                    }
                  : { paddingLeft: 12, borderLeft: '1px solid rgba(6,182,212,0.08)' }),
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = isMobile ? '#22d3ee' : 'var(--text-secondary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = isMobile ? '#06b6d4' : 'var(--text-dim)'; }}
            >
              {isMobile ? 'LOG IN' : 'SIGN IN →'}
            </a>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <>
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(6,182,212,0.15)',
                  borderRadius: 3,
                  padding: '8px 9px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  alignSelf: 'center',
                  height: 34,
                }}
                aria-label="Menu"
              >
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 16, height: 1.5, background: '#06b6d4' }} />
                ))}
              </button>

              {mobileMenuOpen && (
                <div
                  style={{
                    position: 'fixed',
                    top: 'calc(56px + env(safe-area-inset-top))',
                    left: 0,
                    right: 0,
                    background: 'rgba(0,8,15,0.97)',
                    borderBottom: '1px solid rgba(6,182,212,0.1)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    zIndex: 49,
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                  }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {[
                    { href: '/docs', label: 'DOCS' },
                    { href: '/intel', label: 'INTEL' },
                    { href: '#extension', label: 'EXTENSION ↓' },
                    { href: '/dashboard', label: 'DASHBOARD' },
                  ].map(link => (
                    <a
                      key={link.href}
                      href={link.href}
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 13,
                        letterSpacing: '0.12em',
                        color: 'var(--text-secondary)',
                        textDecoration: 'none',
                        padding: '14px 0',
                        borderBottom: '1px solid rgba(6,182,212,0.05)',
                        display: 'block',
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Hero — collapses when analysis loads */}
      <div
        style={{
          overflow: 'clip',
          maxHeight: analysis || loading ? 0 : '6000px',
          opacity: analysis || loading ? 0 : 1,
          transform: analysis || loading ? 'translateY(-12px)' : 'none',
          transition: 'max-height 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, transform 0.35s ease',
          pointerEvents: analysis || loading ? 'none' : 'auto',
        }}
      >
        <HeroContent
          address={address}
          setAddress={setAddress}
          loading={loading}
          inputFocused={inputFocused}
          setInputFocused={setInputFocused}
          onSubmit={handleAnalyze}
          onQuickFill={handleQuickFill}
          onSimulatorFill={handleSimulatorFill}
          onOnboardingPick={handleOnboardingPick}
          error={error}
          selectedChain={selectedChain}
          setSelectedChain={setSelectedChain}
          history={history}
          onRemoveHistory={handleRemoveHistory}
        />
      </div>

      {/* Auth gate modal — shown when unauthenticated user clicks Analyze */}
      {showAuthModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
        >
          <div
            className="glass"
            style={{
              padding: 40,
              maxWidth: 420,
              width: '90%',
              borderRadius: 8,
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowAuthModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: '4px 8px',
              }}
              aria-label="Close"
            >
              ×
            </button>

            {/* Badge */}
            <div style={{
              display: 'inline-block',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              letterSpacing: '0.2em',
              color: '#06b6d4',
              border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 2,
              padding: '3px 10px',
              marginBottom: 20,
            }}>
              FREE · NO CREDIT CARD
            </div>

            {/* Heading */}
            <h2 style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: '0 0 12px',
              lineHeight: 1.25,
            }}>
              Create a free account to run your check
            </h2>

            {/* Subtext */}
            <p style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 14,
              color: 'rgba(236,254,255,0.55)',
              lineHeight: 1.6,
              margin: '0 0 28px',
            }}>
              Takes 30 seconds. See the full risk score, scam detection, and sanctions screening for any wallet.
            </p>

            {/* Primary CTA */}
            <a
              href="/auth/signup"
              style={{
                display: 'block',
                width: '100%',
                height: 44,
                lineHeight: '44px',
                textAlign: 'center',
                background: '#06b6d4',
                color: '#00080f',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 12,
                letterSpacing: '0.1em',
                fontWeight: 700,
                borderRadius: 3,
                textDecoration: 'none',
                marginBottom: 16,
              }}
            >
              CREATE FREE ACCOUNT
            </a>

            {/* Secondary link */}
            <div style={{ textAlign: 'center' }}>
              <a
                href="/auth/login"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
              >
                Already have an account? Sign in
              </a>
            </div>
          </div>
        </div>
      )}

      {/* HexTicker — ambient hex-dump strip, idle state only */}
      {!loading && !analysis && <HexTicker />}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '0 16px' : '0 32px' }}>
          <TerminalLoader
            step={loadingStep}
            steps={LOADING_STEPS}
            address={address}
            chain={selectedChain}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Results */}
      {showResults && (
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: isMobile ? '0 16px 48px' : '0 32px 64px',
          }}
        >
          {/* OFAC banner */}
          {analysis.ofacResult.matched && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                background: 'rgba(255,59,59,0.08)',
                border: '1px solid rgba(255,59,59,0.3)',
                borderRadius: 4,
                marginTop: 24,
                marginBottom: 24,
                animation: 'fadeSlideUp 0.4s ease-out both',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ff3b3b',
                  boxShadow: '0 0 12px rgba(255,59,59,0.8)',
                  animation: 'pulseGlow 1s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#ff3b3b',
                }}
              >
                OFAC SDN MATCH
              </span>
              {analysis.ofacResult.matchedEntity && (
                <span
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: 13,
                    color: 'rgba(255,107,107,0.8)',
                  }}
                >
                  — {analysis.ofacResult.matchedEntity}
                </span>
              )}
              {!isMobile && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    color: 'rgba(255,59,59,0.6)',
                  }}
                >
                  SANCTIONED ADDRESS — DO NOT SEND
                </span>
              )}
            </div>
          )}

          {/* Row 1: Address bar */}
          <ResultsAddressBar
            address={analysis.address}
            analyzedAt={analysis.analyzedAt}
            chain={analysis.chain}
            onNewAnalysis={handleNewAnalysis}
            inputValue={address}
            setInputValue={setAddress}
            loading={loading}
            inputFocused={inputFocused}
            setInputFocused={setInputFocused}
            onSubmit={handleAnalyze}
            exportButton={<ExportButton analysis={analysis} narrative={narrative} sarDraft={sarDraft} />}
            saveButton={<SaveToCaseButton address={analysis.address} />}
            watchlistButton={<AddToWatchlistButton address={analysis.address} chain={analysis.chain} />}
          />

          {/* Trust signal */}
          <TrustSignal riskLevel={analysis.riskScore.level} riskScore={analysis.riskScore.total} />

          {/* Row 2: 3-col layout */}
          <div
            className="results-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: 20,
              marginBottom: 20,
              alignItems: 'stretch',
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.1s',
            }}
          >
            {/* Col 1: Risk score */}
            <TiltCard style={{ height: '100%' }}><RiskScoreCard riskScore={analysis.riskScore} /></TiltCard>

            {/* Col 2: Transaction graph */}
            <TransactionGraph
              transactions={analysis.transactions}
              queriedAddress={analysis.address}
              hopData={hopData}
              onAnalyzeAddress={analyzeAddress}
              containerHeight={isMobile ? 280 : undefined}
              investigationMode={true}
              isMobile={isMobile}
            />

            {/* Col 3: Signal list — full width on tablet/mobile */}
            <div style={isTablet ? { gridColumn: '1 / -1' } : {}}>
              <TiltCard><SignalList signals={analysis.riskScore.signals} isMobile={isMobile} riskLevel={analysis.riskScore.level} /></TiltCard>
            </div>
          </div>

          {/* Comparable cases */}
          {(() => {
            const comparableCases: Record<string, { name: string; score: number; note: string }[]> = {
              CRITICAL: [
                { name: 'Blender.io', score: 85, note: 'OFAC SDN · mixer' },
                { name: 'Ronin exploiter', score: 90, note: 'OFAC SDN · hack' },
              ],
              HIGH: [
                { name: 'Sinbad mixer', score: 70, note: 'OFAC SDN · mixer' },
                { name: 'BTC-e exchange', score: 68, note: 'sanctioned exchange' },
              ],
              MEDIUM: [
                { name: 'Typical DEX trader', score: 35, note: 'normal activity' },
                { name: 'Active DeFi wallet', score: 28, note: 'protocol usage' },
              ],
              LOW: [
                { name: 'Vitalik.eth', score: 0, note: 'clean baseline' },
                { name: 'Typical holder', score: 8, note: 'minimal activity' },
              ],
            };
            const cases = comparableCases[analysis.riskScore.level] ?? [];
            if (cases.length === 0) return null;
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  animation: 'fadeSlideUp 0.4s ease-out both',
                  animationDelay: '0.15s',
                }}
              >
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', flexShrink: 0 }}>
                  SIMILAR RISK PROFILES:
                </span>
                {cases.map(c => (
                  <span
                    key={c.name}
                    style={{
                      padding: '3px 10px',
                      border: '1px solid rgba(6,182,212,0.08)',
                      borderRadius: 2,
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: 9,
                      color: 'var(--text-dim)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {c.name} · <span style={{ color: 'var(--text-secondary)' }}>{c.score}</span> · <span style={{ opacity: 0.6 }}>{c.note}</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Timeline chart */}
          <TransactionTimeline transactions={analysis.transactions} riskScore={analysis.riskScore.total} />

          {/* Row 3: Tabbed panel — entry animation lives on the wrapper so it
              doesn't claim the `transform` property on #clearchain-tabs.
              The tilt is applied inline directly to the glass surface so
              el.style.transform is never overridden by animation fill-mode. */}
          {/* Row 3: Tabbed panel */}
          <div
            id="clearchain-tabs"
            className="glass"
            style={{
              borderRadius: 4,
              overflow: 'clip',
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.2s',
            }}
          >
            {/* Tab headers */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(6,182,212,0.08)',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
              } as React.CSSProperties}
            >
              {displayTabs.map(tab => {
                const isActive = activeTab === tab;
                const tabTooltips: Record<string, string> = {
                  'PATTERNS': 'Behavioral patterns detected in this wallet\'s on-chain activity. Each match shows what the pattern is and what evidence triggered it.',
                  'NARRATIVE': 'A plain-English AI summary of what this wallet has been doing on-chain. Always use your own judgment before making any financial decision.',
                  'REPORT': 'A downloadable AI safety report. Keep it as a record of your review, share it, or use it to inform your decision.',
                  'TRANSACTIONS': 'Raw on-chain transactions fetched from Alchemy. Includes ETH transfers, ERC-20 token transfers, and internal transactions. Sorted by timestamp.',
                  'SIMULATOR': 'Toggle any risk signal on or off to instantly see what\'s driving the score. Useful for understanding if a flag is a real concern or a false alarm — before you make a decision.',
                  'FLOW': 'Visual map of where funds have moved. Thicker connections mean more ETH. Red nodes are wallets flagged by the government or known as crypto mixers.',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '14px 24px',
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-dim)',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid #06b6d4' : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.2s, border-color 0.2s',
                      marginBottom: -1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {tab}
                    <InfoTooltip text={tabTooltips[tab] ?? ''} />
                  </button>
                );
              })}

              {/* Tab: risk level indicator */}
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 24px',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: riskColor(analysis.riskScore.level),
                    boxShadow: `0 0 8px ${riskColor(analysis.riskScore.level)}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    color: riskColor(analysis.riskScore.level),
                  }}
                >
                  {analysis.riskScore.level}
                </span>
              </div>
            </div>

            {/* Tab content */}
            <div style={{ padding: '32px' }}>
              {activeTab === 'PATTERNS' && (
                <TypologyCard typologies={analysis.typologies} riskTotal={analysis.riskScore.total} />
              )}
              {activeTab === 'NARRATIVE' && (
                <NarrativeCard
                  narrative={narrative}
                  address={analysis.address}
                  analyzedAt={analysis.analyzedAt}
                />
              )}
              {activeTab === 'REPORT' && (
                <SARDraftCard sarDraft={sarDraft} onDownload={handleSARDownload} />
              )}
              {activeTab === 'TRANSACTIONS' && (
                <TransactionBreakdown
                  transactions={analysis.transactions}
                  queriedAddress={analysis.address}
                  onAnalyzeAddress={analyzeAddress}
                />
              )}
              {activeTab === 'SIMULATOR' && (
                <SimulatorCard
                  signals={analysis.riskScore.signals}
                  address={analysis.address}
                  baselineScore={analysis.riskScore.total}
                  baselineLevel={analysis.riskScore.level}
                />
              )}
              {activeTab === 'FLOW' && (
                <FundFlowDiagram
                  transactions={analysis.transactions}
                  queriedAddress={analysis.address}
                  hopData={hopData}
                />
              )}
            </div>
          </div>

          {/* Footer note */}
          <div
            style={{
              marginTop: 32,
              paddingTop: 20,
              borderTop: '1px solid rgba(6,182,212,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
              }}
            >
              CLEARCHAIN — Free wallet safety checks. Not financial or legal advice. Always do your own research before sending.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <a
                href="https://github.com/velasquezbrafael-source/ClearChain"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
              >
                github.com/velasquezbrafael-source/ClearChain
              </a>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--text-dim)',
                }}
              >
                Data refreshes after 5 min cache window
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Browser Extension Section ──────────────────────────────────── */}
      <div
        id="extension"
        style={{
          background: 'linear-gradient(180deg, rgba(6,182,212,0.04) 0%, transparent 60%)',
          borderTop: '1px solid rgba(6,182,212,0.14)',
          borderBottom: '1px solid rgba(6,182,212,0.06)',
          padding: isMobile ? '64px 20px 80px' : '96px 32px 104px',
        }}
      >
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>

          {/* ── Eyebrow + headline ── */}
          <div style={{ textAlign: 'center', marginBottom: isMobile ? 48 : 64 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 8px rgba(6,182,212,0.9)', animation: 'pulseGlow 2s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.22em', color: '#06b6d4' }}>BROWSER WIDGET — BETA</span>
            </div>
            <h2 style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontSize: isMobile ? 30 : 46,
              fontWeight: 700,
              color: '#f0f4ff',
              lineHeight: 1.12,
              letterSpacing: '-0.01em',
              marginBottom: 14,
            }}>
              Scan any wallet.<br />
              <span style={{ color: '#06b6d4' }}>Right from your browser.</span>
            </h2>
            <p style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 16,
              color: '#8892a4',
              maxWidth: 500,
              margin: '0 auto',
              lineHeight: 1.7,
            }}>
              Add ClearChain to Chrome or Brave and get instant risk scores on any wallet — without leaving the page you're on.
            </p>
          </div>

          {/* ── Two columns: mockup LEFT, get-it RIGHT ── */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 48 : 72,
            alignItems: 'stretch',
            justifyContent: 'center',
          }}>

            {/* LEFT — pixel-faithful popup mockup */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {/* Browser chrome bar */}
              <div style={{ width: 380, background: '#0a0d1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px 8px 0 0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['#ff5f57','#ffbd2e','#28c840'].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />)}
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 3, padding: '3px 8px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#3d4a5c' }}>etherscan.io/address/0x...</div>
                {/* Extension icon in toolbar */}
                <div style={{ width: 20, height: 20, borderRadius: 3, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 18 18" fill="none">
                    <path d="M9 1L16.5 5.25V12.75L9 17L1.5 12.75V5.25L9 1Z" stroke="#06b6d4" strokeWidth="1.6" fill="rgba(6,182,212,0.15)"/>
                    <path d="M9 5.5L13 7.75V12.25L9 14.5L5 12.25V7.75L9 5.5Z" fill="#06b6d4" opacity="0.5"/>
                  </svg>
                </div>
              </div>

              {/* Popup shell — exact match to popup.html structure */}
              <div style={{ width: 380, background: '#03040a', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '0 0 8px 8px', overflow: 'hidden', boxShadow: '0 0 60px rgba(6,182,212,0.1), 0 30px 80px rgba(0,0,0,0.8)', marginTop: -1 }}>

                {/* Header */}
                <div style={{ background: '#080b14', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1L16.5 5.25V12.75L9 17L1.5 12.75V5.25L9 1Z" stroke="#06b6d4" strokeWidth="1.2" fill="rgba(6,182,212,0.08)"/>
                      <path d="M9 5L12.5 7V11L9 13L5.5 11V7L9 5Z" fill="#06b6d4" opacity="0.6"/>
                    </svg>
                    <span style={{ fontFamily: 'var(--font-rubik-glitch)', fontSize: 13, letterSpacing: '0.15em', color: '#22d3ee' }}>CLEARCHAIN</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 7px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.22)', borderRadius: 2, color: '#06b6d4' }}>ETH</span>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 11L11 1M11 1H4M11 1V8" stroke="#3d4a5c" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                </div>

                {/* Scanline */}
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.2) 40%, rgba(34,211,238,0.12) 60%, transparent 100%)' }} />

                {/* Tabs */}
                <div style={{ display: 'flex', background: '#080b14', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {(['SCAN','HISTORY','WATCH'] as const).map((t, i) => (
                    <div key={t} style={{ flex: 1, padding: '8px', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: i === 0 ? '#06b6d4' : '#3d4a5c', borderBottom: i === 0 ? '2px solid #06b6d4' : '2px solid transparent' }}>{t}</div>
                  ))}
                </div>

                {/* Mode toggle */}
                <div style={{ display: 'flex', padding: '7px 10px', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#03040a' }}>
                  {(['SINGLE','BULK'] as const).map((m, i) => (
                    <div key={m} style={{ padding: '4px 12px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', borderRadius: 2, background: i === 0 ? 'rgba(6,182,212,0.1)' : 'transparent', border: i === 0 ? '1px solid rgba(6,182,212,0.25)' : '1px solid rgba(255,255,255,0.06)', color: i === 0 ? '#06b6d4' : '#3d4a5c', cursor: 'default' }}>{m}</div>
                  ))}
                </div>

                {/* Input section */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1220', border: '1px solid rgba(6,182,212,0.22)', borderRadius: 3, padding: '7px 10px', marginBottom: 7 }}>
                    <span style={{ flex: 1, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#f0f4ff', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>0x1Da5847829B0C5e...b41c</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="9" height="11" rx="1" stroke="#3d4a5c" strokeWidth="1.4"/><path d="M4 5H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="#3d4a5c" strokeWidth="1.4"/></svg>
                  </div>
                  <div style={{ width: '100%', background: '#06b6d4', borderRadius: 3, padding: '8px', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#03040a' }}>SCAN</div>
                </div>

                {/* Gauge + meta */}
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg viewBox="0 0 200 120" width="136" height="82" style={{ flexShrink: 0 }}>
                    <path d="M 20 110 A 80 80 0 0 1 180 110" stroke="rgba(255,255,255,0.06)" strokeWidth="12" fill="none" strokeLinecap="round"/>
                    {/* 78/100 fill: dashoffset = 251.2 * (1 - 0.78) = 55.26 */}
                    <path d="M 20 110 A 80 80 0 0 1 180 110" stroke="#ff3b3b" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset="55.26"/>
                    <text x="100" y="96" textAnchor="middle" fill="#ff3b3b" fontSize="30" fontWeight="700" fontFamily="'JetBrains Mono', monospace">78</text>
                    <text x="100" y="112" textAnchor="middle" fill="#3d4a5c" fontSize="11" fontFamily="'JetBrains Mono', monospace">/ 100</text>
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 15, fontWeight: 700, color: '#ff3b3b' }}>CRITICAL</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, padding: '2px 7px', background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: '#ff3b3b', borderRadius: 2, letterSpacing: '0.05em' }}>⚠ OFAC MATCH</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#3d4a5c' }}>ETH NETWORK</div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', background: '#0d1220', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {([['2/6','SIGNALS HIT'],['1','PATTERNS'],['47','TXS']] as [string,string][]).map(([v, l], i) => (
                    <div key={i} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 14, fontWeight: 700, color: '#f0f4ff' }}>{v}</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 7, color: '#3d4a5c', letterSpacing: '0.08em', marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Signals list */}
                {[
                  { name: 'OFAC match', score: '+40', hit: true },
                  { name: 'Mixer interaction', score: '+25', hit: true },
                  { name: 'Rapid movement', score: '0', hit: false },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: s.hit ? '2px solid #ff3b3b' : '2px solid transparent', background: s.hit ? 'rgba(255,59,59,0.03)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.hit ? '#ff3b3b' : '#3d4a5c', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: s.hit ? '#f0f4ff' : '#8892a4' }}>{s.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: s.hit ? '#ff3b3b' : '#3d4a5c' }}>{s.score}</span>
                  </div>
                ))}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, padding: '10px 12px' }}>
                  <div style={{ flex: 2, padding: '7px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 2, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#06b6d4', textAlign: 'center' }}>Full Report ↗</div>
                  <div style={{ flex: 1, padding: '7px', background: '#0d1220', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#8892a4', textAlign: 'center' }}>Copy ▾</div>
                  <div style={{ flex: 1, padding: '7px', background: '#0d1220', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#8892a4', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#8892a4" strokeWidth="1.4"/><path d="M6 3v6M3 6h6" stroke="#8892a4" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    Watch
                  </div>
                </div>
              </div>

              {/* Chain pills */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([['ETH','#6366f1'],['BTC','#f97316'],['TRX','#ef4444'],['SOL','#a855f7']] as [string,string][]).map(([chain, color]) => (
                  <span key={chain} style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 9px', borderRadius: 2, color, border: `1px solid ${color}30`, background: `${color}10` }}>{chain}</span>
                ))}
              </div>
            </div>

            {/* RIGHT — consumer get-it flow */}
            <div style={{ flex: 1, maxWidth: 460, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

              {/* Big download CTA */}
              <a
                href="https://github.com/velasquezbrafael-source/ClearChain"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '18px 24px',
                  background: '#06b6d4',
                  borderRadius: 4,
                  fontFamily: 'var(--font-space-grotesk)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#000',
                  textDecoration: 'none',
                  marginBottom: 10,
                  boxShadow: '0 0 28px rgba(6,182,212,0.3)',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = '#22d3ee'; el.style.boxShadow = '0 0 40px rgba(6,182,212,0.45)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = '#06b6d4'; el.style.boxShadow = '0 0 28px rgba(6,182,212,0.3)'; }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="13" width="14" height="4" rx="1.5" fill="currentColor" opacity="0.3"/>
                  <path d="M10 2v10M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Add to Chrome — It's Free
              </a>
              <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#3d4a5c', textAlign: 'center', marginBottom: 40, letterSpacing: '0.05em' }}>
                Works on Chrome & Brave · No account required
              </p>

              {/* 3-step consumer flow */}
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 20 }}>HOW IT WORKS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  {
                    n: '1',
                    color: '#06b6d4',
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="14" width="18" height="5" rx="2" stroke="#06b6d4" strokeWidth="1.6"/>
                        <path d="M12 3v10M8 9l4 4 4-4" stroke="#06b6d4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ),
                    title: 'Download & install',
                    body: 'Click the button above. Short one-time setup in Chrome — about 2 minutes. Instructions are below.',
                  },
                  {
                    n: '2',
                    color: '#06b6d4',
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#06b6d4" strokeWidth="1.6"/>
                        <path d="M8 12h8M14 9l3 3-3 3" stroke="#06b6d4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ),
                    title: 'Browse normally',
                    body: 'Visit Etherscan, Uniswap, OpenSea — anywhere. ClearChain auto-highlights every wallet address it finds on the page.',
                  },
                  {
                    n: '3',
                    color: '#00ff88',
                    icon: (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="#00ff88" strokeWidth="1.6"/>
                        <path d="M8.5 12l2.5 2.5 4.5-5" stroke="#00ff88" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ),
                    title: 'Instant risk score',
                    body: 'Risk score, OFAC status, and flagged signals appear in seconds. No tab switching. No copy-pasting.',
                  },
                ].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    padding: '16px 18px',
                    background: '#080b14',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    transition: 'border-color 0.2s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `rgba(6,182,212,0.2)`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  >
                    {/* Icon in a pill container */}
                    <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: step.n === '3' ? 'rgba(0,255,136,0.06)' : 'rgba(6,182,212,0.06)', border: step.n === '3' ? '1px solid rgba(0,255,136,0.15)' : '1px solid rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {step.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, color: '#1e4d5c', letterSpacing: '0.12em' }}>STEP {step.n}</span>
                        <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 600, color: '#f0f4ff' }}>{step.title}</span>
                      </div>
                      <p style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: '#8892a4', lineHeight: 1.65, margin: 0 }}>{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* One-time setup */}
              <div style={{ marginTop: 18, padding: '18px 20px', background: '#080b14', border: '1px solid rgba(6,182,212,0.18)', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#06b6d4" strokeWidth="1.3"/><path d="M8 5v4M8 11v.5" stroke="#06b6d4" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: '#06b6d4' }}>ONE-TIME SETUP — REQUIRED</span>
                </div>
                {[
                  'Unzip the downloaded file into any folder on your computer.',
                  'In Chrome, open chrome://extensions and turn on Developer Mode (top-right toggle).',
                  'Click "Load unpacked" → select the unzipped folder.',
                  'Click the puzzle piece in your toolbar → pin ClearChain for quick access.',
                ].map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i < 3 ? 12 : 0, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, fontWeight: 700, color: '#06b6d4' }}>{i + 1}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#8892a4', lineHeight: 1.65 }}>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison line */}
      <div
        style={{
          textAlign: 'center',
          padding: '24px 32px 32px',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          color: '#1e4d5c',
          letterSpacing: '0.05em',
        }}
      >
        Enterprise AML tools cost $50,000+/year. ClearChain starts{' '}
        <span style={{ color: '#06b6d4' }}>free</span>.
      </div>
    </div>
  );
}
