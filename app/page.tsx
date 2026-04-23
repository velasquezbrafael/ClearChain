'use client';

import { useState, useEffect } from 'react';
import type { WalletAnalysis } from '@/types';
import RiskScoreCard from '@/components/RiskScoreCard';
import TypologyCard from '@/components/TypologyCard';
import NarrativeCard from '@/components/NarrativeCard';
import SARDraftCard from '@/components/SARDraftCard';
import TransactionBreakdown from '@/components/TransactionBreakdown';
import TransactionGraph from '@/components/TransactionGraph';
import SkeletonLoader from '@/components/SkeletonLoader';

const TORNADO_CASH = '0x722122dF12D4e14e13Ac3b6895a86e84145b6967';
const LAZARUS = '0x098B716B8Aaf21512996dC57eb0615e2383E2f96';
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const LOADING_STEPS = [
  'Fetching transactions...',
  'Checking OFAC lists...',
  'Scoring risk signals...',
  'Generating narrative...',
];

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

// ---------------------------------------------------------------------------
// Hero state
// ---------------------------------------------------------------------------

function HeroState({ onQuickFill }: { onQuickFill: (addr: string) => void }) {
  const features = [
    {
      title: 'Risk Score 0–100',
      desc: 'Weighted signal breakdown: OFAC exposure, mixer hops, velocity anomalies, and volume clustering.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
        </svg>
      ),
    },
    {
      title: 'AML Typology',
      desc: 'Maps on-chain patterns to named FATF/FinCEN typologies: smurfing, layering, mixer obfuscation.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
    },
    {
      title: 'Transaction Graph',
      desc: 'Force-directed visual of all counterparties — OFAC entities in red, mixer addresses highlighted.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
      ),
    },
    {
      title: 'SAR Draft',
      desc: 'AI-generated FinCEN-style narrative ready for compliance officer review and download.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const quickFills = [
    { label: 'Tornado Cash', sublabel: 'OFAC SDN Router', addr: TORNADO_CASH },
    { label: 'Lazarus Group', sublabel: 'DPRK / OFAC SDN', addr: LAZARUS },
    { label: 'Vitalik.eth', sublabel: 'Baseline control', addr: VITALIK },
  ];

  return (
    <div className="space-y-12 pt-4 fade-in">
      <div className="text-center space-y-5 pt-4">
        <div
          className="inline-flex items-center gap-2 text-xs font-mono rounded-full px-4 py-1.5"
          style={{ background: '#111118', border: '1px solid #1a1a24', color: '#6b7280' }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88' }} />
          Open-source &bull; No wallet connection required &bull; Ethereum mainnet
        </div>

        <h1
          className="text-4xl sm:text-6xl font-black tracking-tight font-mono leading-none"
          style={{ color: '#e2e8f0' }}
        >
          Trace the{' '}
          <span style={{ color: '#00ff88' }}>money.</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: '#6b7280' }}>
          Paste any Ethereum address. Get a risk score, AML typology match,
          transaction graph, and FinCEN-style SAR draft — in under 10 seconds.
        </p>
        <p className="text-sm font-mono max-w-lg mx-auto" style={{ color: '#374151' }}>
          Chainalysis tells you the score. ClearChain tells you what to do about it.
        </p>
      </div>

      {/* Quick-fill buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        {quickFills.map(({ label, sublabel, addr }) => (
          <button
            key={addr}
            onClick={() => onQuickFill(addr)}
            className="flex items-center gap-2 text-xs font-mono rounded-full px-4 py-2 transition-all hover:border-[#00ff88] hover:text-[#00ff88]"
            style={{ background: '#111118', border: '1px solid #1a1a24', color: '#6b7280' }}
          >
            <span>{label}</span>
            <span style={{ color: '#374151' }}>{sublabel}</span>
          </button>
        ))}
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map(({ title, desc, icon }) => (
          <div
            key={title}
            className="rounded-xl p-5 space-y-3"
            style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}
          >
            <div style={{ color: '#00ff88' }}>{icon}</div>
            <h3 className="font-semibold text-sm font-mono" style={{ color: '#e2e8f0' }}>{title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>{desc}</p>
          </div>
        ))}
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
    const params = new URLSearchParams(window.location.search);
    const urlAddr = params.get('address') ?? '';
    return /^0x[a-fA-F0-9]{40}$/.test(urlAddr) ? urlAddr : '';
  });
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [sarDraft, setSarDraft] = useState<string | null>(null);

  // Auto-analyze from ?address= on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAddr = params.get('address');
    if (urlAddr && /^0x[a-fA-F0-9]{40}$/.test(urlAddr)) {
      runAnalysis(urlAddr);
    }
  }, []);

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

      // Push shareable URL
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
    if (!trimmed) {
      setError('Please enter an Ethereum wallet address.');
      return;
    }
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      {/* Search form */}
      <section>
        <form onSubmit={handleAnalyze} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="0x... Enter Ethereum wallet address"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              disabled={loading}
              aria-label="Ethereum wallet address"
              className="flex-1 text-sm rounded-lg px-4 py-3.5 transition-all"
              style={{
                fontFamily: 'monospace',
                background: '#0d0d14',
                border: '1px solid #1a1a24',
                color: '#e2e8f0',
                outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#00ff88')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1a1a24')}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg font-mono font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: '#00ff88', color: '#000', minWidth: 160 }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Analyzing...
                </>
              ) : (
                '> Analyze'
              )}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
              style={{ background: 'rgba(127,29,29,0.3)', border: '1px solid #7f1d1d', color: '#fca5a5' }}
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
        </form>
      </section>

      {/* Loading skeleton */}
      {loading && <SkeletonLoader step={loadingStep} steps={LOADING_STEPS} />}

      {/* Results */}
      {analysis && !loading && (
        <section className="space-y-6 fade-in">
          {/* OFAC pulse banner */}
          {analysis.ofacResult.matched && (
            <div
              className="flex items-center gap-3 rounded-xl px-5 py-3.5"
              style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.4)' }}
            >
              <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
              <span className="font-mono font-bold text-sm" style={{ color: '#ef4444' }}>
                OFAC SDN MATCH
              </span>
              {analysis.ofacResult.matchedEntity && (
                <span className="text-sm" style={{ color: '#fca5a5' }}>
                  — {analysis.ofacResult.matchedEntity}
                </span>
              )}
              <span className="ml-auto text-xs font-mono" style={{ color: '#ef4444', opacity: 0.7 }}>
                Mandatory SAR consideration required
              </span>
            </div>
          )}

          {/* Two-column: score + graph */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-2">
              <RiskScoreCard riskScore={analysis.riskScore} ofacResult={analysis.ofacResult} />
              <p className="text-[10px] font-mono text-center" style={{ color: '#374151' }}>
                Analyzed at {formatTimestamp(analysis.analyzedAt)} &middot; Data refreshes after 5 min
              </p>
            </div>
            <TransactionGraph
              transactions={analysis.transactions}
              queriedAddress={analysis.address}
            />
          </div>

          {/* Typology + Narrative */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TypologyCard typologies={analysis.typologies} />
            <NarrativeCard
              narrative={narrative}
              address={analysis.address}
              analyzedAt={analysis.analyzedAt}
            />
          </div>

          {/* SAR Draft */}
          <SARDraftCard
            sarDraft={sarDraft}
            onDownload={handleSARDownload}
          />

          {/* Transaction table */}
          <TransactionBreakdown
            transactions={analysis.transactions}
            queriedAddress={analysis.address}
          />
        </section>
      )}

      {/* Hero / empty state */}
      {!analysis && !loading && (
        <HeroState onQuickFill={handleQuickFill} />
      )}
    </div>
  );
}
