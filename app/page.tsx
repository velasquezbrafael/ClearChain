'use client';

import { useState, useEffect } from 'react';
import type { WalletAnalysis, ScoringSignal, RiskLevel } from '@/types';
import RiskScoreCard from '@/components/RiskScoreCard';
import TypologyCard from '@/components/TypologyCard';
import NarrativeCard from '@/components/NarrativeCard';
import SARDraftCard from '@/components/SARDraftCard';
import TransactionBreakdown from '@/components/TransactionBreakdown';
import TransactionGraph from '@/components/TransactionGraph';
import SkeletonLoader from '@/components/SkeletonLoader';

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

const TABS = ['TYPOLOGIES', 'NARRATIVE', 'SAR DRAFT', 'TRANSACTIONS'] as const;
type Tab = typeof TABS[number];

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface AnalysisAPIResponse {
  success: true;
  data: WalletAnalysis;
  narrative: string;
  sarDraft: string;
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
        }}
      >
        SIGNAL BREAKDOWN
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

function FeatureCard({
  label,
  title,
  desc,
}: {
  label: string;
  title: string;
  desc: string;
}) {
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
      <div
        style={{
          fontFamily: 'var(--font-space-grotesk)',
          fontSize: 36,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: 12,
          letterSpacing: '-0.02em',
        }}
      >
        {label}
      </div>
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
  error,
}: {
  address: string;
  setAddress: (v: string) => void;
  loading: boolean;
  inputFocused: boolean;
  setInputFocused: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onQuickFill: (addr: string) => void;
  error: string | null;
}) {
  const features = [
    { label: '0–100', title: 'Risk Score', desc: 'OFAC exposure, mixer hops, velocity anomalies, and volume clustering.' },
    { label: 'FATF', title: 'AML Typologies', desc: 'Maps patterns to named typologies: smurfing, layering, mixer obfuscation.' },
    { label: 'D3', title: 'Transaction Graph', desc: 'Force-directed graph of all counterparties — OFAC entities in red.' },
    { label: 'SAR', title: 'SAR Draft', desc: 'FinCEN-style narrative ready for compliance officer review and filing.' },
  ];

  const quickFills = [
    { label: 'Tornado Cash', sublabel: 'OFAC SDN · Router', addr: TORNADO_CASH },
    { label: 'Lazarus Group', sublabel: 'DPRK · OFAC SDN', addr: LAZARUS },
    { label: 'Vitalik.eth', sublabel: 'Baseline control', addr: VITALIK },
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
          Paste any Ethereum address. Get a risk score, AML typology, transaction
          graph, and FinCEN SAR draft.
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
          {quickFills.map(({ label, sublabel, addr }) => (
            <button
              key={addr}
              onClick={() => onQuickFill(addr)}
              disabled={loading}
              style={{
                padding: '6px 14px',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 2,
                background: 'none',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 10,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'border-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)';
                e.currentTarget.style.color = '#00ff88';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {label}
              <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{sublabel}</span>
            </button>
          ))}
        </div>
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {features.map(f => (
            <div key={f.title} style={{ background: '#03040a' }}>
              <FeatureCard label={f.label} title={f.title} desc={f.desc} />
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
        flexShrink: 0,
        textShadow: hovered && !loading ? '0 0 20px rgba(0,255,136,0.8), 0 0 40px rgba(0,255,136,0.4)' : 'none',
        transition: 'text-shadow 0.2s',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? '...' : '→ ANALYZE'}
    </button>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
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
        CLEAR →
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
  const [activeTab, setActiveTab]   = useState<Tab>('TYPOLOGIES');
  const [inputFocused, setInputFocused] = useState(false);

  // Auto-analyze from ?address= on load
  useEffect(() => {
    const urlAddr = new URLSearchParams(window.location.search).get('address');
    if (urlAddr && /^0x[a-fA-F0-9]{40}$/.test(urlAddr)) {
      runAnalysis(urlAddr);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading step ticker
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, [loading]);

  async function runAnalysis(addr: string) {
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    setAnalysis(null);
    setNarrative(null);
    setSarDraft(null);
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

      const { data, narrative: nar, sarDraft: sar } = json as AnalysisAPIResponse;
      setAnalysis(data);
      setNarrative(nar ?? null);
      setSarDraft(sar ?? null);
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
    if (!trimmed) { setError('Please enter an Ethereum wallet address.'); return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError('Invalid address format. Must start with 0x followed by 40 hex characters.');
      return;
    }
    await runAnalysis(trimmed);
  }

  function handleQuickFill(addr: string) {
    setAddress(addr);
    runAnalysis(addr);
  }

  function handleNewAnalysis() {
    setAnalysis(null);
    setNarrative(null);
    setSarDraft(null);
    setError(null);
    setAddress('');
    window.history.pushState({}, '', '/');
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

  const showResults = !!analysis && !loading;

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
          error={error}
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
          />

          {/* Row 2: 3-col layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '280px 1fr 280px',
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
            />

            {/* Col 3: Signal list */}
            <SignalList signals={analysis.riskScore.signals} />
          </div>

          {/* Row 3: Tabbed panel */}
          <div
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
                    }}
                  >
                    {tab}
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
