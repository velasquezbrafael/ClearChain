'use client';

import React, { useState, useEffect, useRef } from 'react';
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

const BASE_TABS = ['TYPOLOGIES', 'NARRATIVE', 'SAR DRAFT', 'TRANSACTIONS', 'SIMULATOR'] as const;
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
  { text: 'follow the money', lang: 'english' },
  { text: 'sigue el dinero', lang: 'spanish' },
  { text: "suivez l'argent", lang: 'french' },
  { text: 'folge dem geld', lang: 'german' },
  { text: 'segui i soldi', lang: 'italian' },
  { text: 'siga o dinheiro', lang: 'portuguese' },
  { text: 'volg het geld', lang: 'dutch' },
  { text: 'följ pengarna', lang: 'swedish' },
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
        padding:     '8px 16px',
        textAlign:   'center',
        minWidth:    100,
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
  const width    = useWindowWidth();
  const isMobile = width <= 640;

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
        display:             'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, auto)',
        justifyContent:      'center',
        gap:                 12,
        marginBottom:        40,
        animation:           'fadeSlideUp 0.5s ease-out both',
        animationDelay:      '0.3s',
      }}
    >
      <StatPill value={stats.walletsScreened} label="WALLETS SCREENED" />
      <StatPill value={stats.ofacHits}        label="OFAC HITS"        />
      <StatPill value={stats.sarDrafts}       label="SAR DRAFTS"       />
      <StatPill value={stats.casesOpened}     label="CASES OPENED"     />
      <StatPill value={stats.highRiskWallets} label="HIGH RISK WALLETS" accent="#ff8c00" />
    </div>
  );
}

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
  error: ErrorState | null;
  selectedChain: 'ETH' | 'BTC' | 'TRX' | 'SOL';
  setSelectedChain: (c: 'ETH' | 'BTC' | 'TRX' | 'SOL') => void;
  history: HistoryEntry[];
  onRemoveHistory: (addr: string) => void;
}) {
  const [displayText, setDisplayText] = useState(slogans[0].text);
  const [currentLang, setCurrentLang] = useState(slogans[0].lang);
  const [nextIdx, setNextIdx] = useState(1);
  const [langVisible, setLangVisible] = useState(true);
  const isFirstLangRender = useRef(true);
  const [spotlightPos, setSpotlightPos] = useState({ x: -999, y: -999 });
  const heroWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFirstLangRender.current) { isFirstLangRender.current = false; return; }
    setLangVisible(false);
    const t = setTimeout(() => setLangVisible(true), 150);
    return () => clearTimeout(t);
  }, [currentLang]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = slogans[nextIdx];
      scrambleToWord(
        displayText,
        next.text,
        (val) => setDisplayText(val),
        () => {
          setCurrentLang(next.lang);
          setNextIdx((i) => (i + 1) % slogans.length);
        }
      );
    }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIdx]);

  const features = [
    {
      title: 'Risk Score',
      desc: '0–100 weighted score across 6 signals. OFAC match, mixer interaction, peel chains, coinjoin detection. Every point explained — no black box.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 14 A8 8 0 0 1 17 14" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 14 L13 7" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="1.5" fill="#06b6d4"/>
        </svg>
      ),
    },
    {
      title: 'AML Typologies',
      desc: '7 FATF/FinCEN typologies automatically matched: smurfing, layering, mixer obfuscation, hop layering, convergence, peel chain, coinjoin. With regulatory citations.',
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
      desc: 'Click any node to follow the money. Trace funds across hops, identify OFAC entities in red, detect when two wallets share a counterparty.',
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
      title: 'SAR Draft',
      desc: 'FinCEN-format Suspicious Activity Report generated in seconds. The work that takes compliance teams 2–3 hours — automated.',
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
      desc: 'Toggle risk factors and watch the score update in real time. The only AML tool with what-if scenario modeling.',
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
      {/* Center section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '60px 24px 24px',
          textAlign: 'center',
          maxWidth: 760,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Label */}
        <div
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.25em',
            color: 'rgba(6,182,212,0.6)',
            marginBottom: 28,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0s',
          }}
        >
          {'ETH · BTC · TRX · SOL · '}
          <a
            href="https://github.com/velasquezbrafael-source/ClearChain"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'inherit',
              textDecoration: 'none',
              borderBottom: '1px solid transparent',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(6,182,212,0.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'transparent'; }}
          >
            OPEN SOURCE
          </a>
        </div>

        {/* Glitch scramble headline */}
        <div style={{ margin: '0 0 24px', animation: 'fadeSlideUp 0.5s ease-out both', animationDelay: '0.1s' }}>
          <h1
            className="hero-headline"
            style={{
              fontFamily: 'var(--font-rubik-glitch)',
              fontWeight: 400,
              lineHeight: 1.0,
              color: 'var(--text-primary)',
              letterSpacing: '0.02em',
              margin: '0 0 10px',
              height: 'clamp(3rem, 8vw, 6rem)',
              overflow: 'hidden',
            }}
          >
            {displayText}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: 'var(--text-dim)',
              opacity: langVisible ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          >
            [ {currentLang} ]
          </div>
        </div>

        {/* Subhead */}
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 17,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '0 0 48px',
            maxWidth: 620,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.25s',
          }}
        >
          Real-time OFAC screening, typology detection, and AI SAR drafts — across Ethereum, Bitcoin, and Tron. Seconds, not days.
        </p>

        {/* Live stats */}
        <StatsBar />

        {/* Search bar */}
        <form
          onSubmit={onSubmit}
          style={{
            width: '100%',
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
                fontSize: 20,
                color: 'var(--text-primary)',
                caretColor: '#06b6d4',
                letterSpacing: '0.02em',
              }}
            />
            <AnalyzeButton loading={loading} />
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

        {/* Stat pills */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 28,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.55s',
          }}
        >
          {['OFAC Screening', '7 AML Typologies', 'SAR Auto-Draft', 'ETH + BTC + TRX + SOL', 'Investigation Mode'].map(label => (
            <span
              key={label}
              style={{
                padding: '6px 14px',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 2,
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--text-secondary)',
              }}
            >
              {label}
            </span>
          ))}
          <span
            style={{
              padding: '6px 14px',
              border: '1px solid rgba(6,182,212,0.12)',
              borderRadius: 2,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'rgba(6,182,212,0.6)',
            }}
          >
            Free Forever
          </span>
        </div>

        {/* Quick fills */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 16,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.65s',
          }}
        >
          {(() => {
            const STYLE_MAP = {
              red:    { border: 'rgba(6,182,212,0.08)', color: 'var(--text-secondary)', bg: 'none',                    hoverBorder: 'rgba(255,59,59,0.35)',    hoverColor: '#ff6b6b' },
              green:  { border: 'rgba(6,182,212,0.2)',    color: 'rgba(6,182,212,0.8)',   bg: 'rgba(6,182,212,0.04)',    hoverBorder: 'rgba(6,182,212,0.4)',     hoverColor: '#06b6d4' },
              blue:   { border: 'rgba(59,130,246,0.25)',  color: 'rgba(96,165,250,0.8)',  bg: 'rgba(59,130,246,0.04)',   hoverBorder: 'rgba(59,130,246,0.5)',    hoverColor: '#60a5fa' },
              orange: { border: 'rgba(255,69,0,0.25)',    color: 'rgba(255,100,0,0.8)',   bg: 'rgba(255,69,0,0.04)',     hoverBorder: 'rgba(255,69,0,0.5)',      hoverColor: '#ff4500' },
            };
            return (
              <>
                {visibleQuickFills.map(({ label, sub, address, style }) => {
                  const s = STYLE_MAP[style];
                  return (
                    <button
                      key={label}
                      onClick={() => onQuickFill(address)}
                      disabled={loading}
                      style={{ padding: '6px 14px', border: `1px solid ${s.border}`, borderRadius: 2, background: s.bg, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: s.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color 0.2s, color 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = s.hoverBorder; e.currentTarget.style.color = s.hoverColor; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.color; }}
                    >
                      {label}
                      {sub && <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{sub}</span>}
                    </button>
                  );
                })}
                {selectedChain === 'ETH' && (
                  <button
                    onClick={onSimulatorFill}
                    disabled={loading}
                    style={{ padding: '6px 14px', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 2, background: 'rgba(6,182,212,0.04)', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'rgba(6,182,212,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color 0.2s, color 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(6,182,212,0.4)'; e.currentTarget.style.color = '#06b6d4'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(6,182,212,0.2)'; e.currentTarget.style.color = 'rgba(6,182,212,0.8)'; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                      <polygon points="2,1 9,5 2,9" fill="#06b6d4"/>
                    </svg>
                    Try the Simulator
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {/* Search history */}
        {history.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 20,
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.55s',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.12em',
                color: 'var(--text-dim)',
              }}
            >
              RECENT:
            </span>
            {history.map(entry => (
              <span
                key={entry.address}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  border: '1px solid rgba(6,182,212,0.08)',
                  borderRadius: 2,
                }}
              >
                <button
                  onClick={() => onQuickFill(entry.address)}
                  disabled={loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 9,
                    color: 'var(--text-secondary)',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: entry.level === 'CRITICAL' ? '#ff3b3b' : entry.level === 'HIGH' ? '#ff8c00' : entry.level === 'MEDIUM' ? '#ffd60a' : '#06b6d4',
                      flexShrink: 0,
                    }}
                  />
                  {`${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`}
                </button>
                <button
                  onClick={() => onRemoveHistory(entry.address)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-dim)',
                    fontSize: 10,
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label="Remove from history"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Feature grid */}
      <div
        style={{
          borderTop: '1px solid rgba(6,182,212,0.05)',
          padding: '48px 24px 16px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          animation: 'fadeSlideUp 0.5s ease-out both',
          animationDelay: '0.6s',
        }}
      >
        <div
          className="feature-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
            background: 'rgba(6,182,212,0.05)',
            alignItems: 'stretch',
          }}
        >
          {features.map(f => (
            <div key={f.title} style={{ background: '#00080f', display: 'flex', alignItems: 'stretch' }}>
              <FeatureCard title={f.title} desc={f.desc} icon={f.icon} />
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          borderTop: '1px solid rgba(6,182,212,0.05)',
          padding: '32px 24px 64px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          className="how-it-works-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 40,
          }}
        >
          {[
            { n: '01', title: 'PASTE ANY ADDRESS', body: 'Ethereum, Bitcoin, Tron, or Solana address — or an ENS name. No wallet connection. No account required.' },
            { n: '02', title: 'INTELLIGENCE IN SECONDS', body: 'Real-time OFAC screening, on-chain transaction analysis, AML typology matching — across ETH, BTC, TRX, and SOL.' },
            { n: '03', title: 'INVESTIGATION + COMPLIANCE', body: 'Click nodes to trace fund flows. Download the SAR draft. Save to a case. From raw address to filed-ready report.' },
          ].map(({ n, title, body }) => (
            <div key={n}>
              <div
                style={{
                  fontFamily: 'var(--font-space-grotesk)',
                  fontSize: 56,
                  fontWeight: 700,
                  color: 'rgba(6,182,212,0.08)',
                  lineHeight: 1,
                  marginBottom: 16,
                  letterSpacing: '-0.02em',
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  color: 'var(--text-dim)',
                  marginBottom: 10,
                }}
              >
                {title}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  margin: 0,
                  opacity: 0.7,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Why ClearChain */}
      <div style={{ borderTop: '1px solid rgba(6,182,212,0.08)', width: '100%' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 32px' }}>
          {/* Header */}
          <div style={{ marginBottom: 60 }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 16, textTransform: 'uppercase' as const }}>
              Why ClearChain
            </div>
            <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 36, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
              Built for investigators, not checkboxes.
            </h2>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: 16, color: '#7ec8d8', margin: 0, lineHeight: 1.6, whiteSpace: 'nowrap' }}>
              Most AML tools produce reports for regulators. ClearChain produces intelligence for analysts.
            </p>
          </div>

          {/* Comparison grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: 64 }}>
            {[
              {
                left: { label: 'LEGACY TOOLS', body: 'Black-box scores. A number with no explanation. You file a SAR because the score said so.' },
                right: { label: 'CLEARCHAIN', body: 'Every point explained. Six signals, each with detail. You know exactly why a wallet scored 65.' },
              },
              {
                left: { label: 'LEGACY TOOLS', body: 'Ethereum-only, or multi-chain at 10× the price. Bitcoin, Tron, and Solana are afterthoughts.' },
                right: { label: 'CLEARCHAIN', body: 'ETH, BTC, TRX, and SOL in one tool. OFAC-designated addresses across all four chains. Free.' },
              },
              {
                left: { label: 'LEGACY TOOLS', body: 'SAR generation is a separate workflow. Copy the report, open another tool, rewrite it.' },
                right: { label: 'CLEARCHAIN', body: 'SAR draft generated automatically from the analysis. One click to download. BSA-formatted.' },
              },
            ].map((row, i) => (
              <>
                <div key={`left-${i}`} className="glass" style={{ padding: '28px 32px' }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#1e4d5c', marginBottom: 12 }}>{row.left.label}</div>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: 15, color: '#7ec8d8', lineHeight: 1.7, margin: 0 }}>{row.left.body}</p>
                </div>
                <div key={`right-${i}`} style={{ padding: '28px 32px', border: '1px solid rgba(6,182,212,0.08)', background: 'transparent' }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#1e4d5c', marginBottom: 12 }}>{row.right.label}</div>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: 15, color: '#7ec8d8', lineHeight: 1.7, margin: 0 }}>{row.right.body}</p>
                </div>
              </>
            ))}
          </div>

          {/* Stat row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
            {[
              { value: '< 10s', label: 'average analysis time' },
              { value: '4 chains', label: 'ETH, BTC, TRX, SOL' },
              { value: 'Free', label: 'no account required' },
            ].map((stat, i) => (
              <>
                {i > 0 && <div key={`div-${i}`} style={{ width: 1, height: 40, background: 'rgba(6,182,212,0.08)', margin: '0 48px' }} />}
                <div key={stat.value} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 32, fontWeight: 700, color: '#06b6d4', lineHeight: 1, marginBottom: 8 }}>{stat.value}</div>
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

function AnalyzeButton({ loading, compact }: { loading: boolean; compact?: boolean }) {
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
      {!compact && (
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
            style={{ width: '100%', background: '#00080f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#ecfeff', fontSize: 12, padding: '8px 10px', fontFamily: 'var(--font-jetbrains-mono)' }}
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
            style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#ecfeff', fontSize: 13, padding: '6px 0', outline: 'none', fontFamily: 'var(--font-jetbrains-mono)' }}
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
        {saved ? `Saved to ${saved} ✓` : '+ Save to Case'}
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
            fontSize: 13,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
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

      {/* New analysis form */}
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
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
            fontSize: 12,
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
// HexTicker — ambient scrolling hex-dump strip (shown when idle)
// ---------------------------------------------------------------------------

function genHexBytes(): string[] {
  return Array.from({ length: 80 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase(),
  );
}

function HexTicker() {
  const [bytes, setBytes] = React.useState<string[]>(genHexBytes);
  const line = bytes.join(' ');
  return (
    <div
      style={{
        overflow: 'hidden',
        height: 28,
        borderTop: '1px solid rgba(6,182,212,0.06)',
        borderBottom: '1px solid rgba(6,182,212,0.06)',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: 'hexScroll 40s linear infinite',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          color: 'rgba(6,182,212,0.1)',
          letterSpacing: '0.08em',
          lineHeight: '28px',
          userSelect: 'none',
        }}
        onAnimationIteration={() => setBytes(genHexBytes())}
      >
        {line}&nbsp;&nbsp;&nbsp;{line}
      </div>
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
  const [activeTab, setActiveTab]   = useState<Tab>('TYPOLOGIES');
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Scroll to top on mount — belt-and-suspenders with the layout script
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { setHistory(loadHistory()); }, []);
  const [navUser, setNavUser] = useState<{ email: string } | null>(null);
  const pendingTabRef  = useRef<Tab | null>(null);
  const tabsPanelRef   = useRef<HTMLDivElement>(null);
  const showResults = !!analysis && !loading;

  function onTabsTiltMove(e: React.MouseEvent<HTMLDivElement>) {
    if (isMobile) return;
    const el = tabsPanelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform  = `perspective(800px) rotateX(${(-y * 14).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg) scale(1.01)`;
    el.style.transition = 'transform 0.08s ease-out';
  }
  function onTabsTiltLeave() {
    const el = tabsPanelRef.current;
    if (!el) return;
    el.style.transform  = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
    el.style.transition = 'transform 0.5s ease-out';
  }

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

  // Check auth state for nav
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setNavUser({ email: user.email ?? '' });
    });
  }, []);

  // Auto-analyze from ?address= on load — supports ETH, BTC, and TRX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAddr = params.get('address');
    const urlChain = params.get('chain');
    const chain: 'ETH' | 'BTC' | 'TRX' | 'SOL' =
      urlChain === 'BTC' ? 'BTC' :
      urlChain === 'TRX' ? 'TRX' :
      urlChain === 'SOL' ? 'SOL' : 'ETH';
    if (!urlAddr) return;
    const isEth = /^0x[a-fA-F0-9]{40}$/.test(urlAddr) || urlAddr.includes('.');
    const isBtc = /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(urlAddr) || /^bc1[a-z0-9]{39,59}$/.test(urlAddr);
    const isTrx = /^T[a-zA-Z0-9]{33}$/.test(urlAddr);
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(urlAddr);
    if (isEth || isBtc || isTrx || isSol) {
      runAnalysis(urlAddr, chain);
    }
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
        if (trimmed && !loading) runAnalysis(trimmed);
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
    const activeChain = chain ?? selectedChain;
    playStartSound();   // Sound A — analysis begin
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    setAnalysis(null);
    setNarrative(null);
    setSarDraft(null);
    setHopData(undefined);
    setActiveTab('TYPOLOGIES');

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
    setAddress(addr);
    runAnalysis(addr, selectedChain);
  }

  function handleSimulatorFill() {
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
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
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
              Crypto Intelligence Platform
            </span>
          )}
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
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

          {/* Auth nav */}
          {/* Sound toggle */}
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
              padding: 0,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: soundEnabled ? 'var(--text-dim)' : 'rgba(6,182,212,0.2)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = soundEnabled ? 'var(--text-secondary)' : 'rgba(6,182,212,0.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = soundEnabled ? 'var(--text-dim)' : 'rgba(6,182,212,0.2)'; }}
          >
            {soundEnabled ? '[SFX]' : '[---]'}
          </button>

          {navUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 12, borderLeft: '1px solid rgba(6,182,212,0.08)' }}>
              <a
                href="/dashboard"
                style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--accent-green)', textDecoration: 'none' }}
              >
                DASHBOARD →
              </a>
            </div>
          ) : (
            <a
              href="/auth/login"
              style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none', paddingLeft: 12, borderLeft: '1px solid rgba(6,182,212,0.08)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
            >
              SIGN IN →
            </a>
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
          error={error}
          selectedChain={selectedChain}
          setSelectedChain={setSelectedChain}
          history={history}
          onRemoveHistory={handleRemoveHistory}
        />
      </div>

      {/* HexTicker — ambient hex-dump strip, idle state only */}
      {!loading && !analysis && <HexTicker />}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
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
            padding: '0 32px 64px',
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
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'rgba(255,59,59,0.6)',
                }}
              >
                MANDATORY SAR CONSIDERATION REQUIRED
              </span>
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

          {/* Row 2: 3-col layout */}
          <div
            className="results-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: 20,
              marginBottom: 20,
              alignItems: 'start',
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.1s',
            }}
          >
            {/* Col 1: Risk score */}
            <TiltCard><RiskScoreCard riskScore={analysis.riskScore} /></TiltCard>

            {/* Col 2: Transaction graph */}
            <TransactionGraph
              transactions={analysis.transactions}
              queriedAddress={analysis.address}
              hopData={hopData}
              onAnalyzeAddress={analyzeAddress}
              containerHeight={isMobile ? 280 : undefined}
              investigationMode={true}
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
          <TransactionTimeline transactions={analysis.transactions} />

          {/* Row 3: Tabbed panel — entry animation lives on the wrapper so it
              doesn't claim the `transform` property on #clearchain-tabs.
              The tilt is applied inline directly to the glass surface so
              el.style.transform is never overridden by animation fill-mode. */}
          {/* Mouse events on the wrapper so they fire before any child can consume them.
              tabsPanelRef stays on the glass surface for accurate getBoundingClientRect. */}
          <div
            style={{ animation: 'fadeSlideUp 0.5s ease-out both', animationDelay: '0.2s' }}
            onMouseMove={onTabsTiltMove}
            onMouseLeave={onTabsTiltLeave}
          >
          <div
            ref={tabsPanelRef}
            id="clearchain-tabs"
            className="glass"
            style={{
              borderRadius: 4,
              overflow: 'clip',
              willChange: 'transform',
              transition: 'transform 0.08s ease-out',
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
                  'TYPOLOGIES': 'FATF and FinCEN-recognized money laundering patterns. Matched against your wallet\'s on-chain behavior. Each match includes the regulatory citation and the specific evidence found.',
                  'NARRATIVE': 'An AI-generated chain-of-custody summary written for compliance review. Traces fund flow from origin to destination. Generated by Claude — verify before use in official filings.',
                  'SAR DRAFT': 'A draft Suspicious Activity Report in FinCEN format. This is NOT a filed SAR — it must be reviewed and approved by a qualified BSA/AML compliance officer before submission.',
                  'TRANSACTIONS': 'Raw on-chain transactions fetched from Alchemy. Includes ETH transfers, ERC-20 token transfers, and internal transactions. Sorted by timestamp.',
                  'SIMULATOR': 'Counterfactual scenario modeling — toggle risk signals on/off to see the score change in real time. Click Generate Scenario Narrative to get an AI description of what this wallet would look like under the simulated conditions.',
                  'FLOW': 'Visual Sankey diagram of inbound ETH flows. Shows where funds originated, ribbon thickness proportional to ETH volume. Red nodes = known mixers (OFAC-designated), orange = high-risk counterparties.',
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
              {activeTab === 'TYPOLOGIES' && (
                <TypologyCard typologies={analysis.typologies} />
              )}
              {activeTab === 'NARRATIVE' && (
                <NarrativeCard
                  narrative={narrative}
                  address={analysis.address}
                  analyzedAt={analysis.analyzedAt}
                />
              )}
              {activeTab === 'SAR DRAFT' && (
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
          </div>{/* /animation wrapper */}

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
              CLEARCHAIN v2 — Multi-chain AML intelligence. Not legal advice. SAR drafts require qualified BSA/AML officer review before filing.
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
    </div>
  );
}
