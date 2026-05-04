'use client';

import { useState } from 'react';
import SiteNav from '@/components/SiteNav';

const BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://clearchain.vercel.app')
) + '/api';
const EXAMPLE_ADDRESS = '0x722122dF12D4e14e13Ac3b6895a86e84145b6967';

const CURL_COMMAND = `curl -X POST ${BASE_URL}/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"address":"${EXAMPLE_ADDRESS}"}'`;

const EXAMPLE_RESPONSE = `{
  "success": true,
  "data": {
    "address": "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    "chain": "ETH",
    "riskScore": {
      "total": 80,
      "level": "CRITICAL",
      "signals": [
        { "name": "ofac_match", "weight": 40, "triggered": true, "score": 40 },
        { "name": "mixer_interaction", "weight": 25, "triggered": true, "score": 25 },
        { "name": "rapid_fund_movement", "weight": 15, "triggered": true, "score": 15 },
        { "name": "high_risk_counterparty", "weight": 10, "triggered": false, "score": 0 },
        { "name": "volume_anomaly", "weight": 5, "triggered": false, "score": 0 },
        { "name": "community_red_flags", "weight": 5, "triggered": false, "score": 0 }
      ]
    },
    "typologies": [...],
    "ofacResult": {
      "matched": true,
      "matchedEntity": "Tornado Cash (OFAC SDN)",
      "confidence": 1
    },
    "analyzedAt": "2026-04-23T12:00:00.000Z"
  },
  "narrative": "On 2021-08-08, wallet 0x722... was designated...",
  "sarDraft": "SUSPICIOUS ACTIVITY REPORT — DRAFT NARRATIVE\\n..."
}`;

export default function ApiDocsPage() {
  const [liveAddress, setLiveAddress] = useState(EXAMPLE_ADDRESS);
  const [liveResult, setLiveResult] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runLiveRequest() {
    setLiveLoading(true);
    setLiveResult(null);
    setLiveError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: liveAddress.trim() }),
      });
      const json = await res.json();
      setLiveResult(JSON.stringify(json, null, 2));
    } catch {
      setLiveError('Request failed. Check your address and try again.');
    } finally {
      setLiveLoading(false);
    }
  }

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(CURL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* silent */ }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: 'var(--text-primary)' }}>
      <SiteNav activePage="api-docs" />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 32px 96px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(6,182,212,0.6)', marginBottom: 16 }}>
            DOCUMENTATION
          </div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 16px', color: 'var(--text-primary)' }}>
            API Reference
          </h1>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
            The ClearChain analysis API is free and open. No API key required.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '8px 16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, background: '#001824' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>BASE URL</span>
            <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#06b6d4' }}>{BASE_URL}</code>
          </div>
        </div>

        <Divider />

        {/* POST /analyze */}
        <Section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Badge color="#06b6d4">POST</Badge>
            <code style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 16, color: 'var(--text-primary)' }}>/analyze</code>
          </div>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 28px' }}>
            Analyze an Ethereum, Bitcoin, or Tron wallet address for AML risk. Returns a risk score, OFAC screening result,
            AML typologies, AI-generated narrative, and FinCEN SAR draft.
          </p>

          <SubHeading>Request</SubHeading>
          <CodeBlock>{`Content-Type: application/json\n\n// Ethereum (default)\n{ "address": "0x...", "chain": "ETH" }\n\n// Bitcoin\n{ "address": "bc1q...", "chain": "BTC" }\n\n// Tron\n{ "address": "T...", "chain": "TRX" }\n\n// Also accepts ENS names:\n{ "address": "vitalik.eth" }`}</CodeBlock>

          <SubHeading>Response</SubHeading>
          <CodeBlock>{EXAMPLE_RESPONSE}</CodeBlock>
        </Section>

        <Divider />

        {/* Authentication */}
        <Section>
          <SectionTitle>AUTHENTICATION (OPTIONAL)</SectionTitle>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
            Include an API key to save analyses to your dashboard and unlock higher rate limits. Generate a key in{' '}
            <a href="/dashboard/settings" style={{ color: '#06b6d4', textDecoration: 'none' }}>Dashboard &rarr; Settings</a>.
          </p>
          <SubHeading>Request with API Key</SubHeading>
          <CodeBlock>{`curl -X POST ${BASE_URL}/analyze \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ck_live_your_key_here" \\
  -d '{"address":"${EXAMPLE_ADDRESS}"}'`}</CodeBlock>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Free tier', '100 requests / day — analyses saved to dashboard'],
              ['Analyst tier', '2,000 requests / day'],
              ['Team tier', 'Unlimited'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 24, padding: '10px 0', borderBottom: '1px solid rgba(6,182,212,0.05)' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)', minWidth: 180 }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <Divider />

        {/* Live example */}
        <Section>
          <SectionTitle>Live Example</SectionTitle>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
            Make a real request against the production API. Response time is ~8–15 seconds (includes AI generation).
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={liveAddress}
              onChange={e => setLiveAddress(e.target.value)}
              placeholder="0x... or ENS name"
              style={{
                flex: 1, minWidth: 260,
                background: '#001824', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '10px 14px',
                fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12,
                color: 'var(--text-primary)', outline: 'none',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(6,182,212,0.4)'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
            />
            <button
              onClick={runLiveRequest}
              disabled={liveLoading}
              style={{
                padding: '10px 20px',
                background: liveLoading ? 'rgba(6,182,212,0.06)' : 'rgba(6,182,212,0.1)',
                border: '1px solid rgba(6,182,212,0.3)',
                borderRadius: 4,
                fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10,
                letterSpacing: '0.1em', color: '#06b6d4',
                cursor: liveLoading ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
              }}
            >
              {liveLoading ? 'RUNNING...' : '→ RUN REQUEST'}
            </button>
          </div>

          {liveError && (
            <div style={{ padding: '10px 14px', border: '1px solid rgba(255,59,59,0.25)', borderRadius: 4, background: 'rgba(255,59,59,0.06)', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#ff6b6b', marginBottom: 16 }}>
              {liveError}
            </div>
          )}

          {liveResult && (
            <CodeBlock maxHeight={400}>{liveResult}</CodeBlock>
          )}
        </Section>

        <Divider />

        {/* cURL example */}
        <Section>
          <SectionTitle>cURL Examples</SectionTitle>
          <SubHeading>Ethereum</SubHeading>
          <div style={{ position: 'relative' }}>
            <CodeBlock>{CURL_COMMAND}</CodeBlock>
            <button
              onClick={copyCurl}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: 'rgba(6,182,212,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3, padding: '4px 10px',
                fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9,
                letterSpacing: '0.1em',
                color: copied ? '#06b6d4' : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <SubHeading>Bitcoin</SubHeading>
          <CodeBlock>{`curl -X POST ${BASE_URL}/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"address":"1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf5n","chain":"BTC"}'`}</CodeBlock>
          <SubHeading>Tron</SubHeading>
          <CodeBlock>{`curl -X POST ${BASE_URL}/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"address":"TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe","chain":"TRX"}'`}</CodeBlock>
        </Section>

        <Divider />

        {/* Rate limits */}
        <Section>
          <SectionTitle>Rate Limits</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Tier', 'Free'],
              ['Requests / minute', '10'],
              ['Authentication', 'None required'],
              ['Response time', '~8–15 seconds (includes AI generation)'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 24, padding: '10px 0', borderBottom: '1px solid rgba(6,182,212,0.05)' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)', minWidth: 180 }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <Divider />

        {/* Use cases */}
        <Section>
          <SectionTitle>Use Cases</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Compliance screening in fintech and neobank apps',
              'Pre-transaction risk checks in DeFi protocols',
              'AML monitoring dashboards for crypto exchanges',
              'Academic research on on-chain financial behavior',
              'Building CDD/KYC workflows with AI-assisted narrative generation',
            ].map(uc => (
              <div key={uc} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'rgba(6,182,212,0.5)', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, marginTop: 3, flexShrink: 0 }}>·</span>
                <span style={{ fontFamily: 'var(--font-inter)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{uc}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(6,182,212,0.08)', margin: '48px 0' }} />;
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 0 }}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-dim)', marginBottom: 16 }}>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 8, marginTop: 20 }}>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em',
      padding: '3px 8px', borderRadius: 2,
      border: `1px solid ${color}44`, background: `${color}11`, color,
    }}>
      {children}
    </span>
  );
}

function CodeBlock({ children, maxHeight }: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <pre
      style={{
        background: '#001824',
        border: '1px solid rgba(6,182,212,0.08)',
        borderRadius: 4, padding: '16px 20px',
        fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11,
        color: 'var(--text-secondary)', lineHeight: 1.7,
        overflowX: 'auto', overflowY: maxHeight ? 'auto' : 'visible',
        maxHeight: maxHeight ?? undefined,
        margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}
    >
      {children}
    </pre>
  );
}
