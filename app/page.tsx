'use client';

import { useState, useEffect, useRef } from 'react';
import type { WalletAnalysis, ScoringSignal, RiskLevel } from '@/types';
import RiskScoreCard from '@/components/RiskScoreCard';
import TypologyCard from '@/components/TypologyCard';
import NarrativeCard from '@/components/NarrativeCard';
import SARDraftCard from '@/components/SARDraftCard';
import SimulatorCard from '@/components/SimulatorCard';
import TransactionBreakdown from '@/components/TransactionBreakdown';
import TransactionGraph from '@/components/TransactionGraph';
import TransactionTimeline from '@/components/TransactionTimeline';
import SkeletonLoader from '@/components/SkeletonLoader';
import ExportButton from '@/components/ExportButton';
import InfoTooltip from '@/components/InfoTooltip';
import { getLabel } from '@/lib/labels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TORNADO_CASH = '0x722122dF12D4e14e13Ac3b6895a86e84145b6967';
const LAZARUS      = '0x098B716B8Aaf21512996dC57eb0615e2383E2f96';
const VITALIK      = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const LOADING_STEPS = [
  'Fetching on-chain transactions...',
  'Checking OFAC SDN list...',
  'Scoring risk signals...',
  'Generating AI narrative...',
];

const TABS = ['TYPOLOGIES', 'NARRATIVE', 'SAR DRAFT', 'TRANSACTIONS', 'SIMULATOR'] as const;
type Tab = typeof TABS[number];

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
// Helpers
// ---------------------------------------------------------------------------

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
};

function formatSignalName(name: string): string {
  return SIGNAL_LABELS[name] ?? name.split('_').map(w => w.toUpperCase()).join(' ');
}

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    default:         return '#00ff88';
  }
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
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// ---------------------------------------------------------------------------
// Signal list — col 3
// ---------------------------------------------------------------------------

function SignalList({ signals }: { signals: ScoringSignal[] }) {
  const sorted = [...signals].sort((a, b) => {
    if (a.triggered && !b.triggered) return -1;
    if (!a.triggered && b.triggered) return 1;
    return b.weight - a.weight;
  });

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        background: '#080b14',
        padding: 24,
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map(signal => (
          <div
            key={signal.name}
            style={{ display: 'flex', alignItems: 'center', gap: 0 }}
          >
            {/* Dot */}
            <span
              style={{
                fontSize: 7,
                color: signal.triggered ? '#00ff88' : '#3d4a5c',
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
                color: signal.triggered ? 'var(--text-primary)' : 'var(--text-dim)',
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
                color: signal.triggered ? '#ff8c00' : '#3d4a5c',
                flexShrink: 0,
                minWidth: 30,
                textAlign: 'right',
              }}
            >
              +{signal.triggered ? signal.score : 0}
            </span>
          </div>
        ))}
      </div>

      {/* Detail on triggered signals */}
      {sorted.filter(s => s.triggered && s.detail).length > 0 && (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.04)',
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
        padding: 28,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 4,
        background: hovered ? 'rgba(255,255,255,0.02)' : 'transparent',
        transition: 'border-color 0.2s, background 0.2s',
        cursor: 'default',
      }}
    >
      {icon && <div style={{ marginBottom: 14, opacity: hovered ? 1 : 0.7, transition: 'opacity 0.2s' }}>{icon}</div>}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          letterSpacing: '0.15em',
          color: '#00ff88',
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 13,
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
  analysisCount,
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
  error: string | null;
  analysisCount: number;
  history: HistoryEntry[];
  onRemoveHistory: (addr: string) => void;
}) {
  const features = [
    {
      title: 'Risk Score',
      desc: '0–100 weighted score with full signal breakdown. Every point explained.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 14 A8 8 0 0 1 17 14" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 14 L13 7" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="1.5" fill="#00ff88"/>
        </svg>
      ),
    },
    {
      title: 'AML Typologies',
      desc: 'Maps patterns to FATF/FinCEN typologies: smurfing, layering, mixer obfuscation.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="4" r="2" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="4" cy="16" r="2" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="16" cy="16" r="2" stroke="#00ff88" strokeWidth="1.5"/>
          <line x1="10" y1="6" x2="4.8" y2="14" stroke="#00ff88" strokeWidth="1.5"/>
          <line x1="10" y1="6" x2="15.2" y2="14" stroke="#00ff88" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      title: 'Fund Flow Graph',
      desc: 'Force-directed graph of all counterparties. OFAC entities flagged in red.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="2" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="3" cy="5" r="1.5" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="17" cy="5" r="1.5" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="3" cy="15" r="1.5" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="17" cy="15" r="1.5" stroke="#00ff88" strokeWidth="1.5"/>
          <line x1="8.5" y1="8.8" x2="4.2" y2="6.2" stroke="#00ff88" strokeWidth="1"/>
          <line x1="11.5" y1="8.8" x2="15.8" y2="6.2" stroke="#00ff88" strokeWidth="1"/>
          <line x1="8.5" y1="11.2" x2="4.2" y2="13.8" stroke="#00ff88" strokeWidth="1"/>
          <line x1="11.5" y1="11.2" x2="15.8" y2="13.8" stroke="#00ff88" strokeWidth="1"/>
        </svg>
      ),
    },
    {
      title: 'SAR Draft',
      desc: 'AI-generated FinCEN SAR narrative. Ready for compliance officer review.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2" width="12" height="16" rx="1" stroke="#00ff88" strokeWidth="1.5"/>
          <line x1="7" y1="7" x2="13" y2="7" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="10" x2="13" y2="10" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="13" x2="10" y2="13" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Simulator',
      desc: 'Toggle risk signals on/off to model counterfactual scenarios. Generate AML narratives for training.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <line x1="3" y1="5" x2="17" y2="5" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="10" x2="17" y2="10" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="15" x2="17" y2="15" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="5" r="2" fill="#03040a" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="13" cy="10" r="2" fill="#03040a" stroke="#00ff88" strokeWidth="1.5"/>
          <circle cx="7" cy="15" r="2" fill="#03040a" stroke="#00ff88" strokeWidth="1.5"/>
        </svg>
      ),
    },
  ];


  const quickFills = [
    { label: 'Tornado Cash', sublabel: 'OFAC SDN · Router', addr: TORNADO_CASH, simulator: false },
    { label: 'Lazarus Group', sublabel: 'DPRK · OFAC SDN', addr: LAZARUS, simulator: false },
    { label: 'Vitalik.eth', sublabel: 'Baseline control', addr: VITALIK, simulator: false },
    { label: 'Try the Simulator', sublabel: 'AML training demo', addr: TORNADO_CASH, simulator: true },
  ];

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      {/* Center section */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 60px',
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
            color: 'rgba(0,255,136,0.6)',
            marginBottom: 28,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0s',
          }}
        >
          BLOCKCHAIN FORENSICS PLATFORM
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 'clamp(64px, 10vw, 96px)',
            fontWeight: 700,
            lineHeight: 1.0,
            color: 'var(--text-primary)',
            letterSpacing: '-0.03em',
            margin: '0 0 24px',
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.1s',
          }}
        >
          Follow the money.
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 18,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: '0 0 48px',
            maxWidth: 560,
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.2s',
          }}
        >
          Know in 10 seconds whether a wallet is clean, connected to a mixer, or
          on a government sanctions list — with the SAR draft written automatically.
        </p>

        {/* Search bar */}
        <form
          onSubmit={onSubmit}
          style={{
            width: '100%',
            animation: 'fadeSlideUp 0.5s ease-out both',
            animationDelay: '0.3s',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: `1px solid ${inputFocused ? '#00ff88' : 'rgba(255,255,255,0.15)'}`,
              paddingBottom: 14,
              gap: 16,
              transition: 'border-color 0.2s',
            }}
          >
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="0x..."
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              disabled={loading}
              aria-label="Ethereum wallet address"
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 20,
                color: 'var(--text-primary)',
                caretColor: '#00ff88',
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
                padding: '10px 16px',
                border: '1px solid rgba(255,59,59,0.25)',
                borderRadius: 2,
                background: 'rgba(255,59,59,0.06)',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                color: '#ff6b6b',
                textAlign: 'left',
              }}
            >
              {error}
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
            animationDelay: '0.4s',
          }}
        >
          {['OFAC SDN Database', 'FATF Typologies', 'AI-Powered SAR Drafts'].map(label => (
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
              border: '1px solid rgba(0,255,136,0.12)',
              borderRadius: 2,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'rgba(0,255,136,0.6)',
            }}
          >
            {analysisCount.toLocaleString()} Analyses Run
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
            animationDelay: '0.5s',
          }}
        >
          {quickFills.map(({ label, sublabel, addr, simulator }) => (
            <button
              key={label}
              onClick={() => simulator ? onSimulatorFill() : onQuickFill(addr)}
              disabled={loading}
              style={{
                padding: '6px 14px',
                border: simulator ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 2,
                background: simulator ? 'rgba(0,255,136,0.04)' : 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                color: simulator ? 'rgba(0,255,136,0.8)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'border-color 0.2s, color 0.2s, background 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(0,255,136,0.4)';
                e.currentTarget.style.color = '#00ff88';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = simulator ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = simulator ? 'rgba(0,255,136,0.8)' : 'var(--text-secondary)';
              }}
            >
              {simulator && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                  <polygon points="2,1 9,5 2,9" fill="#00ff88"/>
                </svg>
              )}
              {label}
              <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{sublabel}</span>
            </button>
          ))}
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
                  border: '1px solid rgba(255,255,255,0.06)',
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
                      background: entry.level === 'CRITICAL' ? '#ff3b3b' : entry.level === 'HIGH' ? '#ff8c00' : entry.level === 'MEDIUM' ? '#ffd60a' : '#00ff88',
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
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '48px 24px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          animation: 'fadeSlideUp 0.5s ease-out both',
          animationDelay: '0.6s',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {features.map(f => (
            <div key={f.title} style={{ background: '#03040a' }}>
              <FeatureCard title={f.title} desc={f.desc} icon={f.icon} />
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '56px 24px 64px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 40,
          }}
        >
          {[
            { n: '01', title: 'PASTE ANY ETH ADDRESS', body: 'Drop in a wallet address or ENS name. ENS is resolved on-chain automatically.' },
            { n: '02', title: 'ANALYSIS RUNS AUTOMATICALLY', body: 'On-chain data fetched from Alchemy. OFAC, mixer contacts, and risk signals scored in seconds.' },
            { n: '03', title: 'GET THE FULL PICTURE', body: 'Risk score, typologies, fund flow graph, and a FinCEN-formatted SAR draft — all in one view.' },
          ].map(({ n, title, body }) => (
            <div key={n}>
              <div
                style={{
                  fontFamily: 'var(--font-space-grotesk)',
                  fontSize: 56,
                  fontWeight: 700,
                  color: 'rgba(0,255,136,0.08)',
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
          background: 'none',
          border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: compact ? 11 : 13,
          letterSpacing: '0.12em',
          color: '#00ff88',
          padding: '0 4px',
          textShadow: hovered && !loading ? '0 0 20px rgba(0,255,136,0.8), 0 0 40px rgba(0,255,136,0.4)' : 'none',
          transition: 'text-shadow 0.2s',
          opacity: loading ? 0.5 : 1,
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
            border: '1px solid rgba(255,255,255,0.06)',
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

function ResultsAddressBar({
  address,
  analyzedAt,
  onNewAnalysis,
  inputValue,
  setInputValue,
  loading,
  inputFocused,
  setInputFocused,
  onSubmit,
  exportButton,
}: {
  address: string;
  analyzedAt: string;
  onNewAnalysis: () => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  loading: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  exportButton?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
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
        {(() => {
          const lbl = getLabel(address);
          if (!lbl) return null;
          const colors = {
            sanctioned: { bg: 'rgba(255,59,59,0.1)', border: 'rgba(255,59,59,0.3)', text: '#ff3b3b' },
            exchange:   { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
            defi:       { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)', text: '#a78bfa' },
            notable:    { bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.25)', text: '#00ff88' },
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
          borderBottom: `1px solid ${inputFocused ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
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
            caretColor: '#00ff88',
            width: 220,
          }}
        />
        <AnalyzeButton loading={loading} compact />
      </form>

      {/* Export PDF */}
      {exportButton}

      {/* New Analysis link */}
      <button
        onClick={onNewAnalysis}
        style={{
          background: 'none',
          border: 'none',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          flexShrink: 0,
          padding: 0,
          transition: 'color 0.2s',
        }}
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
    const urlAddr = new URLSearchParams(window.location.search).get('address') ?? '';
    return /^0x[a-fA-F0-9]{40}$/.test(urlAddr) ? urlAddr : '';
  });
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError]           = useState<string | null>(null);
  const [analysis, setAnalysis]     = useState<WalletAnalysis | null>(null);
  const [narrative, setNarrative]   = useState<string | null>(null);
  const [sarDraft, setSarDraft]     = useState<string | null>(null);
  const [hopData, setHopData]       = useState<HopEntry[] | undefined>(undefined);
  const [activeTab, setActiveTab]   = useState<Tab>('TYPOLOGIES');
  const [inputFocused, setInputFocused] = useState(false);
  const [analysisCount, setAnalysisCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 1200;
    return parseInt(localStorage.getItem('cc_analysis_count') ?? '1200', 10);
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadHistory();
  });
  const pendingTabRef = useRef<Tab | null>(null);
  const showResults = !!analysis && !loading;

  // Auto-analyze from ?address= on load
  useEffect(() => {
    const urlAddr = new URLSearchParams(window.location.search).get('address');
    if (urlAddr && /^0x[a-fA-F0-9]{40}$/.test(urlAddr)) {
      runAnalysis(urlAddr);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward button support
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const addr = params.get('address');
      if (!addr) {
        setAnalysis(null);
        setNarrative(null);
        setSarDraft(null);
        setHopData(undefined);
        setError(null);
        setAddress('');
      } else {
        setAddress(addr);
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
  }, [address, loading]);

  // Loading step ticker
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, [loading]);

  // Deferred tab activation (e.g. after "Try the Simulator" quick-fill)
  useEffect(() => {
    if (!showResults || !pendingTabRef.current) return;
    const tab = pendingTabRef.current;
    pendingTabRef.current = null;
    setActiveTab(tab);
    setTimeout(() => {
      document.getElementById('clearchain-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults]);

  async function runAnalysis(addr: string) {
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
        body: JSON.stringify({ address: addr }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json: APIResponse = await res.json();

      if (!json.success) {
        setError((json as ErrorAPIResponse).error ?? 'An unexpected error occurred.');
        return;
      }

      const { data, narrative: nar, sarDraft: sar, hopData: hops } = json as AnalysisAPIResponse;
      setAnalysis(data);
      setNarrative(nar ?? null);
      setSarDraft(sar ?? null);
      setHopData(hops);
      const newCount = analysisCount + 1;
      setAnalysisCount(newCount);
      localStorage.setItem('cc_analysis_count', String(newCount));
      // Save to search history
      const historyEntry: HistoryEntry = { address: data.address, level: data.riskScore.level, timestamp: Date.now() };
      saveHistory(historyEntry);
      setHistory(loadHistory());
      window.history.pushState({}, '', `?address=${addr}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Analysis is taking longer than expected — the server may be warming up. Please try again.');
      } else {
        setError('Network error — could not reach the ClearChain API. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) { setError('Please enter an Ethereum wallet address or ENS name.'); return; }
    const isHexAddr = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    const isEns = trimmed.includes('.');
    if (!isHexAddr && !isEns) {
      setError('Invalid input. Enter a 0x address (42 chars) or an ENS name like vitalik.eth.');
      return;
    }
    await runAnalysis(trimmed);
  }

  function handleQuickFill(addr: string) {
    setAddress(addr);
    runAnalysis(addr);
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
  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;

  const gridCols = isMobile ? '1fr' : isTablet ? '1fr 1fr' : '280px 1fr 280px';

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', position: 'relative', overflow: 'hidden' }}>

      {/* Scanline */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(to right, transparent 0%, rgba(0,255,136,0.12) 50%, transparent 100%)',
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
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(3,4,10,0.92)',
          backdropFilter: 'blur(16px)',
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
                fontFamily: 'var(--font-space-grotesk)',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'var(--text-primary)',
              }}
            >
              CLEARCHAIN
            </span>
          </button>
          <span
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 12,
              color: 'var(--text-dim)',
              paddingLeft: 12,
              borderLeft: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            AML Intelligence Platform
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a
            href="/api-docs"
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
            API DOCS
          </a>

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#00ff88',
              boxShadow: '0 0 8px rgba(0,255,136,0.8)',
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
            ETH MAINNET
          </span>
        </div>
        </div>
      </nav>

      {/* Hero — collapses when analysis loads */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: analysis || loading ? 0 : '2000px',
          opacity: analysis || loading ? 0 : 1,
          transform: analysis || loading ? 'translateY(-12px)' : 'translateY(0)',
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
          analysisCount={analysisCount}
          history={history}
          onRemoveHistory={handleRemoveHistory}
        />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
          <SkeletonLoader step={loadingStep} steps={LOADING_STEPS} />
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
            onNewAnalysis={handleNewAnalysis}
            inputValue={address}
            setInputValue={setAddress}
            loading={loading}
            inputFocused={inputFocused}
            setInputFocused={setInputFocused}
            onSubmit={handleAnalyze}
            exportButton={<ExportButton analysis={analysis} narrative={narrative} sarDraft={sarDraft} />}
          />

          {/* Row 2: 3-col layout */}
          <div
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
            <RiskScoreCard riskScore={analysis.riskScore} />

            {/* Col 2: Transaction graph */}
            <TransactionGraph
              transactions={analysis.transactions}
              queriedAddress={analysis.address}
              hopData={hopData}
              onAnalyzeAddress={analyzeAddress}
            />

            {/* Col 3: Signal list — full width on tablet/mobile */}
            <div style={isTablet ? { gridColumn: '1 / -1' } : {}}>
              <SignalList signals={analysis.riskScore.signals} />
            </div>
          </div>

          {/* Timeline chart */}
          <TransactionTimeline transactions={analysis.transactions} />

          {/* Row 3: Tabbed panel */}
          <div
            id="clearchain-tabs"
            style={{
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 4,
              background: '#080b14',
              overflow: 'hidden',
              animation: 'fadeSlideUp 0.5s ease-out both',
              animationDelay: '0.2s',
            }}
          >
            {/* Tab headers */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                overflowX: 'auto',
              }}
            >
              {TABS.map(tab => {
                const isActive = activeTab === tab;
                const tabTooltips: Record<string, string> = {
                  'TYPOLOGIES': 'FATF and FinCEN-recognized money laundering patterns. Matched against your wallet\'s on-chain behavior. Each match includes the regulatory citation and the specific evidence found.',
                  'NARRATIVE': 'An AI-generated chain-of-custody summary written for compliance review. Traces fund flow from origin to destination. Generated by Claude — verify before use in official filings.',
                  'SAR DRAFT': 'A draft Suspicious Activity Report in FinCEN format. This is NOT a filed SAR — it must be reviewed and approved by a qualified BSA/AML compliance officer before submission.',
                  'TRANSACTIONS': 'Raw on-chain transactions fetched from Alchemy. Includes ETH transfers, ERC-20 token transfers, and internal transactions. Sorted by timestamp.',
                  'SIMULATOR': 'Counterfactual scenario modeling — toggle risk signals on/off to see the score change in real time. Click Generate Scenario Narrative to get an AI description of what this wallet would look like under the simulated conditions.',
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
                      borderBottom: isActive ? '2px solid #00ff88' : '2px solid transparent',
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
            </div>
          </div>

          {/* Footer note */}
          <div
            style={{
              marginTop: 32,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.04)',
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
              CLEARCHAIN v1 — AI-assisted analysis only. Not legal advice.
            </span>
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
      )}
    </div>
  );
}
