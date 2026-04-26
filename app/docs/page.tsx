/**
 * ClearChain — Developer Docs (/docs)
 *
 * Server component. Client children: CodeTabs, CopyButton.
 * Sections: Hero / Quickstart / Authentication / Endpoint Reference /
 *           Batch Screening / Risk Signals / Error Codes / Rate Limits / Footer CTA
 */

import { createClient } from '@/lib/supabase/server'
import CodeTabs from '@/components/CodeTabs'
import CopyButton from '@/components/CopyButton'

const BASE = 'https://clear-chain-peach.vercel.app'

// ---------------------------------------------------------------------------
// Code snippets
// ---------------------------------------------------------------------------

const CURL = `curl -X POST ${BASE}/api/v1/analyze \\
  -H "Authorization: Bearer ck_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "chain": "ETH"
  }'`

const JS = `import { ClearChainClient } from 'clearchain-sdk'

const client = new ClearChainClient({ apiKey: 'ck_live_your_key_here' })

const result = await client.analyze(
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  'ETH'
)

console.log(result.riskScore.total)     // 12
console.log(result.riskScore.level)     // "LOW"
console.log(result.ofacResult.matched)  // false`

const PYTHON = `from clearchain import ClearChain

client = ClearChain(api_key="ck_live_your_key_here")

result = client.analyze(
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chain="ETH"
)

print(result.risk_score)   # 12
print(result.risk_level)   # "LOW"
print(result.ofac_match)   # False
# install: pip install clearchain`

const RESPONSE_JSON = `{
  "success": true,
  "data": {
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "chain": "ETH",
    "resolvedAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "riskScore": {
      "total": 12,
      "level": "LOW",
      "signals": {
        "ofac_match": {
          "name": "ofac_match",
          "triggered": false,
          "score": 0,
          "weight": 40,
          "detail": "No match found on OFAC SDN list."
        },
        "mixer_usage": {
          "name": "mixer_usage",
          "triggered": false,
          "score": 0,
          "weight": 30,
          "detail": "No known mixer interactions detected."
        }
      }
    },
    "typologies": [],
    "ofacResult": {
      "matched": false,
      "confidence": 0
    },
    "narrative": "The wallet at 0xd8dA...045 shows no indicators...",
    "sarDraft": "SUSPICIOUS ACTIVITY REPORT DRAFT\\n\\n...",
    "hopData": [
      {
        "address": "0xabc...123",
        "transactions": []
      }
    ],
    "analyzedAt": "2026-04-25T12:00:00.000Z"
  }
}`

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const MONO: React.CSSProperties = { fontFamily: 'var(--font-jetbrains-mono)' }

const sectionLabel: React.CSSProperties = {
  ...MONO,
  fontSize: 10,
  letterSpacing: '0.2em',
  color: '#3d4a5c',
  textTransform: 'uppercase',
  marginBottom: 24,
}

const sectionH2: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
  fontSize: 22,
  fontWeight: 700,
  color: '#f0f4ff',
  margin: '0 0 8px',
  letterSpacing: '-0.01em',
}

const prose: React.CSSProperties = {
  fontSize: 14,
  color: '#8892a4',
  lineHeight: 1.7,
  margin: '0 0 20px',
}

const card: React.CSSProperties = {
  background: '#080b14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 4,
  padding: '24px 28px',
}

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  margin: '64px 0',
}

const inlineCode: React.CSSProperties = {
  ...MONO,
  fontSize: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 3,
  padding: '2px 6px',
  color: '#00ff88',
}

const thStyle: React.CSSProperties = {
  ...MONO,
  fontSize: 10,
  letterSpacing: '0.12em',
  color: '#3d4a5c',
  textTransform: 'uppercase',
  padding: '10px 16px',
  textAlign: 'left',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontWeight: 400,
}

const tdStyle: React.CSSProperties = {
  ...MONO,
  fontSize: 12,
  color: '#f0f4ff',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'top',
}

const tdMuted: React.CSSProperties = {
  ...tdStyle,
  color: '#8892a4',
  fontFamily: 'var(--font-inter), system-ui, sans-serif',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const quickstartTabs = [
    { label: 'CURL', code: CURL },
    { label: 'JAVASCRIPT', code: JS },
    { label: 'PYTHON', code: PYTHON },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: '#f0f4ff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, background: '#03040a', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#f0f4ff', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <span style={{ fontSize: 12, color: '#00ff88', letterSpacing: '0.08em' }}>Docs</span>
          <a href="/intel" style={{ fontSize: 12, color: '#8892a4', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        {user ? (
          <a href="/dashboard" style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none' }}>DASHBOARD →</a>
        ) : (
          <a href="/auth/login" style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', color: '#8892a4', textDecoration: 'none' }}>SIGN IN →</a>
        )}
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px 120px' }}>

        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.2em', color: '#00ff88', marginBottom: 16, textTransform: 'uppercase' }}>
            Developer API · v1
          </div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 48, fontWeight: 700, color: '#f0f4ff', margin: '0 0 20px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Build AML compliance<br />into your product
          </h1>
          <p style={{ fontSize: 17, color: '#8892a4', lineHeight: 1.7, maxWidth: 620, margin: '0 0 32px' }}>
            The ClearChain API gives you programmatic access to blockchain risk scoring, OFAC sanctions screening, and SAR-ready intelligence — for ETH, BTC, and TRX.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
            <a
              href="/dashboard/settings"
              style={{ ...MONO, fontSize: 11, letterSpacing: '0.1em', color: '#03040a', background: '#00ff88', padding: '10px 20px', borderRadius: 3, textDecoration: 'none', fontWeight: 700 }}
            >
              GET API KEY →
            </a>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noopener"
              style={{ ...MONO, fontSize: 11, letterSpacing: '0.1em', color: '#8892a4', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', padding: '10px 20px', borderRadius: 3, textDecoration: 'none' }}
            >
              OPENAPI SPEC
            </a>
          </div>
          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['3 chains', '6 risk signals', '5-min cache', 'Bearer auth', 'Webhook support'].map(s => (
              <span
                key={s}
                style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', color: '#3d4a5c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, padding: '4px 10px', textTransform: 'uppercase' }}
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        <hr style={divider} />

        {/* ── Quickstart ──────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 0 }} id="quickstart">
          <div style={sectionLabel}>Quickstart</div>
          <h2 style={sectionH2}>Analyze a wallet in 60 seconds</h2>
          <p style={{ ...prose, marginBottom: 36 }}>
            Three steps to your first risk report. No SDK required — plain HTTP from any language.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 24, alignItems: 'start' }}>

            {/* Step 1 */}
            <div style={card}>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#00ff88', marginBottom: 12, textTransform: 'uppercase' }}>01 / Get Your Key</div>
              <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.7, margin: '0 0 16px' }}>
                Sign in and generate an API key from the dashboard. Keys start with <code style={inlineCode}>ck_live_</code>.
              </p>
              <a
                href="/dashboard/settings"
                style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Open Dashboard →
              </a>
            </div>

            {/* Step 2 — CodeTabs (wider col) */}
            <div>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', marginBottom: 12, textTransform: 'uppercase' }}>02 / Make Your First Call</div>
              <CodeTabs tabs={quickstartTabs} />
            </div>

            {/* Step 3 — collapsible response */}
            <div style={card}>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', marginBottom: 12, textTransform: 'uppercase' }}>03 / Parse the Response</div>
              <p style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.6, margin: '0 0 14px' }}>
                A <code style={inlineCode}>200</code> returns <code style={inlineCode}>success: true</code> with the full analysis under <code style={inlineCode}>data</code>.
              </p>
              <details style={{ cursor: 'pointer' }}>
                <summary style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', color: '#3d4a5c', textTransform: 'uppercase', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#00ff88' }}>▸</span> Example Response
                </summary>
                <pre style={{ margin: '12px 0 0', padding: '14px', background: '#03040a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#8892a4', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {RESPONSE_JSON}
                </pre>
              </details>
            </div>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Authentication ──────────────────────────────────────────────────── */}
        <section id="authentication">
          <div style={sectionLabel}>Authentication</div>
          <h2 style={sectionH2}>Bearer token auth</h2>
          <p style={prose}>
            Pass your API key in the <code style={inlineCode}>Authorization</code> header on every request.
          </p>

          <div style={{ ...card, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', textTransform: 'uppercase' }}>Header</span>
              <CopyButton text="Authorization: Bearer ck_live_your_key_here" />
            </div>
            <pre style={{ margin: 0, ...MONO, fontSize: 13, color: '#f0f4ff', lineHeight: 1.6 }}>
              <span style={{ color: '#3d4a5c' }}>Authorization: </span>
              <span style={{ color: '#00ff88' }}>Bearer</span>
              {' ck_live_your_key_here'}
            </pre>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ ...card, borderLeft: '2px solid #00ff88' }}>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', color: '#00ff88', marginBottom: 8, textTransform: 'uppercase' }}>Key Format</div>
              <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.6, margin: 0 }}>
                Keys follow the format <code style={inlineCode}>ck_live_{'<'}32 hex chars{'>'}</code>. Keys are hashed on our end — the raw value is never stored.
              </p>
            </div>
            <div style={{ ...card, borderLeft: '2px solid rgba(255,255,255,0.12)' }}>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', marginBottom: 8, textTransform: 'uppercase' }}>Session Fallback</div>
              <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.6, margin: 0 }}>
                If no <code style={inlineCode}>Authorization</code> header is present, the API checks for a valid session cookie — used by the ClearChain dashboard internally.
              </p>
            </div>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Endpoint Reference ──────────────────────────────────────────────── */}
        <section id="endpoint">
          <div style={sectionLabel}>Endpoint Reference</div>
          <h2 style={sectionH2}>POST /api/v1/analyze</h2>
          <p style={prose}>
            Analyzes a wallet address and returns a full risk report including OFAC screening, risk signals, typology detection, AI narrative, and SAR draft.
          </p>

          {/* Request body */}
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', textTransform: 'uppercase', marginBottom: 12 }}>Request Body</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Required</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}><code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0 }}>address</code></td>
                  <td style={{ ...tdStyle, color: '#8892a4' }}>string</td>
                  <td style={{ ...tdStyle, color: '#00ff88' }}>Yes</td>
                  <td style={tdMuted}>Wallet address. ETH supports ENS names (resolved on-chain). BTC must be a valid mainnet address. TRX must be a valid Tron address.</td>
                </tr>
                <tr>
                  <td style={{ ...tdStyle, borderBottom: 'none' }}><code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0 }}>chain</code></td>
                  <td style={{ ...tdStyle, color: '#8892a4', borderBottom: 'none' }}>string</td>
                  <td style={{ ...tdStyle, color: '#00ff88', borderBottom: 'none' }}>Yes</td>
                  <td style={{ ...tdMuted, borderBottom: 'none' }}>
                    One of <code style={inlineCode}>ETH</code>, <code style={inlineCode}>BTC</code>, <code style={inlineCode}>TRX</code>. Any other value returns a <code style={inlineCode}>400 UNSUPPORTED_CHAIN</code> error.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Response schema — collapsible tree */}
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', textTransform: 'uppercase', marginBottom: 12 }}>Response Schema</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: '#080b14', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ ...inlineCode, color: '#00ff88' }}>200 OK</code>
              <span style={{ fontSize: 12, color: '#8892a4' }}>application/json</span>
            </div>
            <div style={{ padding: '20px 24px', background: '#080b14' }}>
              {[
                { field: 'success', type: 'true', desc: 'Always true on a 200 response.' },
                { field: 'data.address', type: 'string', desc: 'The input address as provided.' },
                { field: 'data.resolvedAddress', type: 'string', desc: 'Resolved checksummed address (ENS resolved for ETH).' },
                { field: 'data.chain', type: 'ETH | BTC | TRX', desc: 'Chain that was analyzed.' },
                { field: 'data.analyzedAt', type: 'string (ISO 8601)', desc: 'Timestamp of when the analysis was generated.' },
                { field: 'data.riskScore.total', type: 'number', desc: 'Aggregate risk score 0–100.' },
                { field: 'data.riskScore.level', type: 'LOW | MEDIUM | HIGH | CRITICAL', desc: 'Risk tier based on score thresholds: LOW <25 / MEDIUM <50 / HIGH <75 / CRITICAL ≥75.' },
                { field: 'data.riskScore.signals', type: 'object', desc: 'Map of signal name → ScoringSignal. Each signal has: name, triggered, score, weight, detail.' },
                { field: 'data.typologies', type: 'AMLTypology[]', desc: 'Matched AML typologies (ETH only). Each has: name, triggered, confidence, description.' },
                { field: 'data.ofacResult.matched', type: 'boolean', desc: 'Whether the address appears on the OFAC SDN list.' },
                { field: 'data.ofacResult.matchedEntity', type: 'string?', desc: 'SDN entity name if matched.' },
                { field: 'data.ofacResult.confidence', type: 'number', desc: '0 = no match, 1 = exact match.' },
                { field: 'data.transactions', type: 'WalletTransaction[]', desc: 'Recent transactions used in analysis. Each has: hash, from, to, value, timestamp, isInbound.' },
                { field: 'data.hopData', type: 'HopEntry[]', desc: 'Top counterparty addresses + their transactions (ETH only, up to 5 hops).' },
                { field: 'data.narrative', type: 'string', desc: 'AI-generated plain-English risk narrative.' },
                { field: 'data.sarDraft', type: 'string', desc: 'SAR-ready filing draft. Structured for FinCEN BSA form.' },
              ].map((row, i, arr) => (
                <div
                  key={row.field}
                  style={{
                    display: 'grid', gridTemplateColumns: '260px 200px 1fr', gap: 16,
                    padding: '10px 0',
                    borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    alignItems: 'start',
                  }}
                >
                  <code style={{ ...inlineCode, color: '#f0f4ff', background: 'transparent', border: 'none', padding: 0, fontSize: 12 }}>{row.field}</code>
                  <span style={{ ...MONO, fontSize: 11, color: '#3d4a5c' }}>{row.type}</span>
                  <span style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.5 }}>{row.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ENS note */}
          <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 4, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: '#00ff88', flexShrink: 0, marginTop: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
            <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.6, margin: 0 }}>
              For <code style={inlineCode}>chain: ETH</code>, the API automatically resolves ENS names (e.g. <code style={inlineCode}>vitalik.eth</code>) to their on-chain addresses. The resolved address is returned in <code style={inlineCode}>data.resolvedAddress</code>.
            </p>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Batch Screening ─────────────────────────────────────────────────── */}
        <section id="batch">
          <div style={sectionLabel}>Batch Screening</div>
          <h2 style={sectionH2}>POST /api/v1/batch</h2>
          <p style={prose}>
            Screen up to 100 addresses in a single request. Results are processed in parallel and returned sorted by risk score (highest first) — ideal for bulk compliance checks, watchlist ingestion, or portfolio screening.
          </p>

          {/* Rate limit callout */}
          <div style={{ background: 'rgba(255,214,10,0.04)', border: '1px solid rgba(255,214,10,0.15)', borderRadius: 4, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 28 }}>
            <span style={{ color: '#ffd60a', flexShrink: 0, marginTop: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.6, margin: 0 }}>
              A batch of N addresses counts as <strong style={{ color: '#f0f4ff' }}>N calls</strong> against your daily quota. If you have fewer than N calls remaining, the entire request returns <code style={inlineCode}>429</code> with no partial consumption. Individual address failures (invalid format, upstream error) are reported inline — other addresses still process.
            </p>
          </div>

          <CodeTabs tabs={[
            {
              label: 'CURL',
              code: `curl -X POST ${BASE}/api/v1/batch \\
  -H "Authorization: Bearer ck_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "addresses": [
      { "address": "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b", "chain": "ETH" },
      { "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "chain": "ETH" },
      { "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf5n", "chain": "BTC" }
    ]
  }'`,
            },
            {
              label: 'JAVASCRIPT',
              code: `const res = await fetch('${BASE}/api/v1/batch', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ck_live_your_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    addresses: [
      { address: '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', chain: 'ETH' },
      { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'ETH' },
      { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf5n', chain: 'BTC' },
    ],
  }),
})

const data = await res.json()
// Sorted by risk_score DESC — highest risk first
const flagged = data.data.results.filter(r => r.risk_score !== null && r.risk_score >= 50)
console.log(\`\${flagged.length} high-risk addresses found\`)`,
            },
            {
              label: 'PYTHON',
              code: `import requests

resp = requests.post(
    '${BASE}/api/v1/batch',
    headers={
        'Authorization': 'Bearer ck_live_your_key_here',
        'Content-Type': 'application/json',
    },
    json={
        'addresses': [
            {'address': '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', 'chain': 'ETH'},
            {'address': '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'chain': 'ETH'},
            {'address': '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf5n', 'chain': 'BTC'},
        ]
    }
)

data = resp.json()
for r in data['data']['results']:
    if r['error']:
        print(f"{r['address']}: ERROR — {r['error']}")
    else:
        print(f"{r['address']}: {r['risk_level']} ({r['risk_score']})")`,
            },
          ]} />

          {/* Response fields */}
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', textTransform: 'uppercase', margin: '28px 0 12px' }}>Response Fields</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { field: 'data.total',       type: 'number',       desc: 'Total addresses submitted.' },
                  { field: 'data.processed',   type: 'number',       desc: 'Addresses that were successfully analyzed.' },
                  { field: 'data.failed',      type: 'number',       desc: 'Addresses that failed (invalid format, upstream error).' },
                  { field: 'data.results',     type: 'BatchResult[]', desc: 'Per-address results sorted by risk_score DESC. Failed addresses last.' },
                  { field: 'data.summary',     type: 'object',       desc: 'Counts of { critical, high, medium, low, clean } across the batch.' },
                  { field: 'meta.rate_limit',  type: 'object',       desc: '{ limit, remaining, reset_at } — reflects quota state after the batch.' },
                ] as const).map((row, i, arr) => (
                  <tr key={row.field}>
                    <td style={{ ...tdStyle, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0, fontSize: 12 }}>{row.field}</code>
                    </td>
                    <td style={{ ...tdStyle, color: '#3d4a5c', fontSize: 11, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.type}</td>
                    <td style={{ ...tdMuted, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-result fields */}
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.15em', color: '#3d4a5c', textTransform: 'uppercase', margin: '24px 0 12px' }}>Per-Address Result (BatchResult)</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { field: 'address',           type: 'string',         desc: 'The address as submitted.' },
                  { field: 'chain',             type: 'ETH|BTC|TRX',   desc: 'Chain analyzed.' },
                  { field: 'risk_score',        type: 'number|null',    desc: 'Aggregate score 0–100. null if analysis failed.' },
                  { field: 'risk_level',        type: 'string|null',    desc: 'LOW / MEDIUM / HIGH / CRITICAL. null if analysis failed.' },
                  { field: 'ofac_match',        type: 'boolean|null',   desc: 'OFAC SDN list match. null if analysis failed.' },
                  { field: 'mixer_interaction', type: 'boolean|null',   desc: 'Mixer or CoinJoin interaction detected. null if analysis failed.' },
                  { field: 'top_signal',        type: 'string|null',    desc: 'Name of the highest-scoring triggered risk signal. null if none.' },
                  { field: 'typologies',        type: 'string[]|null',  desc: 'Triggered AML typology names. Empty array if none. null if failed.' },
                  { field: 'error',             type: 'string|null',    desc: 'Error code if this address failed (e.g. INVALID_ADDRESS). null on success.' },
                ] as const).map((row, i, arr) => (
                  <tr key={row.field}>
                    <td style={{ ...tdStyle, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0, fontSize: 11 }}>{row.field}</code>
                    </td>
                    <td style={{ ...tdStyle, color: '#3d4a5c', fontSize: 11, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.type}</td>
                    <td style={{ ...tdMuted, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Risk Signals ────────────────────────────────────────────────────── */}
        <section id="signals">
          <div style={sectionLabel}>Risk Signals</div>
          <h2 style={sectionH2}>What we detect</h2>
          <p style={prose}>
            Each signal contributes a weighted score to the overall risk total. The sum is capped at 100.
          </p>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Signal</th>
                  <th style={thStyle}>Chain</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Weight</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { signal: 'ofac_match', chain: 'ETH / TRX', weight: 40, desc: 'Address appears on the OFAC Specially Designated Nationals (SDN) list. Mandatory SAR filing required.' },
                  { signal: 'mixer_usage', chain: 'ETH', weight: 30, desc: 'Interaction with known mixing contracts (Tornado Cash and derivatives). Indicates deliberate privacy obfuscation.' },
                  { signal: 'high_risk_counterparty', chain: 'ETH / TRX', weight: 20, desc: 'One or more transactions with OFAC-sanctioned counterparty addresses.' },
                  { signal: 'rapid_fund_movement', chain: 'ETH / TRX', weight: 25, desc: 'Three or more outbound transactions within 24 hours, combined with OFAC or counterparty exposure. Consistent with layering.' },
                  { signal: 'coinjoin_usage', chain: 'BTC', weight: 25, desc: 'CoinJoin transaction detected — multiple equal-value outputs consistent with privacy mixing.' },
                  { signal: 'peel_chain', chain: 'BTC', weight: 20, desc: 'Sequential 2-output transaction pattern consistent with Bitcoin layering.' },
                  { signal: 'volume_anomaly', chain: 'TRX', weight: 15, desc: 'High TRX transaction volume in a wallet under 30 days old — inconsistent with normal wallet activity.' },
                  { signal: 'contract_interaction_risk', chain: 'ETH', weight: 15, desc: 'Interaction with flagged smart contracts or DeFi protocols with high risk exposure.' },
                  { signal: 'structuring_pattern', chain: 'ETH', weight: 20, desc: 'Transaction amounts structured to avoid detection thresholds (below $10K equivalent).' },
                  { signal: 'coinbase_recipient', chain: 'BTC', weight: 0, desc: 'Address has received coinbase (mining) rewards. Informational only — does not affect score.' },
                ] as const).map((row, i, arr) => (
                  <tr key={row.signal}>
                    <td style={{ ...tdStyle, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0, fontSize: 11 }}>{row.signal}</code>
                    </td>
                    <td style={{ ...tdStyle, color: '#3d4a5c', fontSize: 11, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.chain}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: row.weight > 0 ? '#f0f4ff' : '#3d4a5c', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.weight}</td>
                    <td style={{ ...tdMuted, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Error Codes ─────────────────────────────────────────────────────── */}
        <section id="errors">
          <div style={sectionLabel}>Error Codes</div>
          <h2 style={sectionH2}>Error handling</h2>
          <p style={prose}>
            All errors return <code style={inlineCode}>{'{ "success": false, "error": { "code": "...", "message": "..." } }'}</code>. Use the <code style={inlineCode}>code</code> field for programmatic handling.
          </p>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Code</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>HTTP</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { code: 'MISSING_FIELDS', http: 400, desc: 'Request body is missing address or chain.' },
                  { code: 'UNSUPPORTED_CHAIN', http: 400, desc: 'The chain value is not one of ETH, BTC, or TRX.' },
                  { code: 'INVALID_ADDRESS', http: 400, desc: 'The address format is invalid for the specified chain.' },
                  { code: 'ENS_RESOLUTION_FAILED', http: 400, desc: 'The ENS name could not be resolved to an on-chain address.' },
                  { code: 'UNAUTHORIZED', http: 401, desc: 'Missing or invalid API key. No session cookie found as fallback.' },
                  { code: 'KEY_INACTIVE', http: 401, desc: 'The API key exists but has been revoked.' },
                  { code: 'RATE_LIMIT_EXCEEDED', http: 429, desc: 'Daily request quota exceeded for your tier. Check X-RateLimit-Reset for when the window resets.' },
                  { code: 'ANALYSIS_FAILED', http: 500, desc: 'Upstream data fetch or analysis pipeline failed. Safe to retry with exponential backoff.' },
                ] as const).map((row, i, arr) => (
                  <tr key={row.code}>
                    <td style={{ ...tdStyle, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0, color: row.http >= 500 ? '#ff3b3b' : row.http === 429 ? '#ffd60a' : row.http >= 400 ? '#ff8c00' : '#f0f4ff', fontSize: 11 }}>{row.code}</code>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: row.http >= 500 ? '#ff3b3b' : row.http === 429 ? '#ffd60a' : row.http >= 400 ? '#ff8c00' : '#00ff88', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.http}</td>
                    <td style={{ ...tdMuted, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rate limit headers note */}
          <div style={{ marginTop: 24, ...card }}>
            <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', color: '#3d4a5c', marginBottom: 14, textTransform: 'uppercase' }}>Rate Limit Response Headers</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {([
                { header: 'X-RateLimit-Limit', desc: 'Your tier\'s daily request quota.' },
                { header: 'X-RateLimit-Remaining', desc: 'Requests remaining in the current 24h window.' },
                { header: 'X-RateLimit-Reset', desc: 'Unix timestamp (seconds) when the window resets.' },
              ] as const).map(h => (
                <div key={h.header}>
                  <code style={{ ...inlineCode, display: 'block', marginBottom: 6, fontSize: 11 }}>{h.header}</code>
                  <span style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.5 }}>{h.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Rate Limits ─────────────────────────────────────────────────────── */}
        <section id="rate-limits">
          <div style={sectionLabel}>Rate Limits</div>
          <h2 style={sectionH2}>Request quotas</h2>
          <p style={prose}>
            Limits are per API key, per 24-hour rolling window. The window resets exactly 24 hours after the first request in the current period.
          </p>
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#080b14' }}>
                  <th style={thStyle}>Tier</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Daily Limit</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { tier: 'free', limit: '100', desc: 'Default tier for all new API keys. Suitable for testing and low-volume integrations.' },
                  { tier: 'analyst', limit: '2,000', desc: 'For production compliance workflows. Contact us to upgrade.' },
                  { tier: 'team', limit: 'Unlimited', desc: 'Enterprise tier. No per-key daily cap. SLA and support included.' },
                ] as const).map((row, i, arr) => (
                  <tr key={row.tier}>
                    <td style={{ ...tdStyle, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0, color: row.tier === 'team' ? '#00ff88' : row.tier === 'analyst' ? '#ffd60a' : '#f0f4ff', fontSize: 11 }}>{row.tier}</code>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: row.limit === 'Unlimited' ? '#00ff88' : '#f0f4ff', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.limit}</td>
                    <td style={{ ...tdMuted, borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'rgba(255,214,10,0.04)', border: '1px solid rgba(255,214,10,0.15)', borderRadius: 4, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: '#ffd60a', flexShrink: 0, marginTop: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <p style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.6, margin: 0 }}>
              On a <code style={inlineCode}>429</code> response, check the <code style={inlineCode}>Retry-After</code> header for seconds until your window resets. Identical requests within 5 minutes are served from cache and do not count toward your quota.
            </p>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Footer CTA ──────────────────────────────────────────────────────── */}
        <section style={{ textAlign: 'center', padding: '48px 0 0' }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.2em', color: '#3d4a5c', marginBottom: 16, textTransform: 'uppercase' }}>Ready to Integrate?</div>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif', fontSize: 32, fontWeight: 700, color: '#f0f4ff', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
            Start analyzing wallets today
          </h2>
          <p style={{ fontSize: 15, color: '#8892a4', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 32px' }}>
            Free tier includes 100 analyses per day. No credit card required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/dashboard/settings"
              style={{ ...MONO, fontSize: 11, letterSpacing: '0.1em', color: '#03040a', background: '#00ff88', padding: '12px 28px', borderRadius: 3, textDecoration: 'none', fontWeight: 700 }}
            >
              GET API KEY →
            </a>
            <a
              href="/"
              style={{ ...MONO, fontSize: 11, letterSpacing: '0.1em', color: '#8892a4', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', padding: '12px 28px', borderRadius: 3, textDecoration: 'none' }}
            >
              TRY THE TOOL
            </a>
          </div>
        </section>

      </div>
    </div>
  )
}
