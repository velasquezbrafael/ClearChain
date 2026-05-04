/**
 * ClearChain — Documentation Hub (/docs)
 *
 * Static server component. Four sections with anchor nav:
 * #scoring · #typologies · #sources · #sar
 */

import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SIGNALS = [
  {
    name: 'OFAC / SDN Match',
    max: 40,
    detects: 'US Treasury sanctions exposure',
    trigger: 'Wallet address appears directly on the OFAC Specially Designated Nationals (SDN) list. Covers ETH, BTC, TRX, and SOL addresses published in the OFAC SDN XML feed.',
  },
  {
    name: 'Mixer Interaction',
    max: 25,
    detects: 'Cryptocurrency mixing / tumbling',
    trigger: 'Wallet IS a known mixer contract (e.g. Tornado Cash, OFAC-designated 08/08/2022) or has directly transacted with one. Even a single deposit or withdrawal is a mandatory SAR trigger for covered institutions.',
  },
  {
    name: 'Rapid Fund Movement',
    max: 15,
    detects: 'Layering through intermediary wallets',
    trigger: '3 or more outbound transactions within 24 hours, each moving ≥ 80% of received balance. CONTEXTUAL GATE: this signal only fires when OFAC or Mixer also triggered — prevents false positives on legitimate high-volume wallets like exchange hot wallets that move funds quickly by design.',
  },
  {
    name: 'High-Risk Counterparty',
    max: 10,
    detects: 'Known-bad address in transaction history',
    trigger: 'At least one counterparty in the wallet\'s transaction history is labeled as OFAC-designated, known-malicious, or a known mixer — even if the queried wallet itself is not sanctioned.',
  },
  {
    name: 'Volume Anomaly',
    max: 5,
    detects: 'Transaction volume inconsistent with wallet age',
    trigger: 'Total ETH transaction volume exceeds 100 ETH in a wallet less than 30 days old. Threshold is conservative — legitimate businesses (DeFi protocols, CEX hot wallets) are typically identified by label and excluded.',
  },
  {
    name: 'Community Red Flags',
    max: 5,
    detects: 'Crowdsourced address intelligence',
    trigger: 'Wallet or its direct counterparties carry red-flag labels from the open-source eth-labels community dataset (github.com/dawsbot/eth-labels). Labels include scam, phishing, exploit, and rug-pull categories.',
  },
]

const RISK_LEVELS = [
  {
    level: 'LOW',
    range: '0–24',
    color: '#22d3ee',
    meaning: 'No significant risk indicators detected. Standard monitoring applies. Appropriate for most normal wallets — personal wallets, DeFi users, NFT collectors. No EDD required, but keep in standard transaction monitoring.',
  },
  {
    level: 'MEDIUM',
    range: '25–49',
    color: '#ffd60a',
    meaning: 'Elevated risk indicators present. Enhanced due diligence (EDD) is warranted. Common causes: one minor signal triggered (e.g. volume anomaly alone), or indirect exposure to a flagged counterparty. Monitor for continued activity.',
  },
  {
    level: 'HIGH',
    range: '50–74',
    color: '#ff8c00',
    meaning: 'Significant red flags detected. Source-of-funds inquiry required. Typically indicates mixer interaction, multiple signals co-triggering, or direct counterparty with known-bad address. Consider whether a SAR is warranted.',
  },
  {
    level: 'CRITICAL',
    range: '75–100',
    color: '#ff3b3b',
    meaning: 'Immediate escalation required. OFAC sanctions exposure confirmed or mixer interaction alongside other signals. SAR filing should be considered for covered institutions. Do not proceed with the transaction until compliance review is complete.',
  },
]

const TYPOLOGIES = [
  {
    id: 'smurfing',
    name: 'Structuring / Smurfing',
    ref: 'FinCEN 31 CFR § 1010.314',
    pattern: 'Repeated transactions with amounts just below round-number thresholds (e.g. 0.99 ETH, 9.9 ETH, 99 ETH). Amounts cluster suspiciously below reporting cutoffs, indicating deliberate intent to avoid automated monitoring.',
    why: 'Breaking up transactions is a federal crime under US law regardless of the source of funds. In crypto it\'s identifiable by the statistical clustering of amounts just below round numbers across many counterparties.',
    threshold: '3+ transactions within 2% below a round-number threshold',
  },
  {
    id: 'layering_dex',
    name: 'Layering via Decentralized Exchange',
    ref: 'FinCEN FIN-2019-A003; FATF Virtual Assets Report 2021',
    pattern: 'Rapid token swaps across DEX protocols (Uniswap, SushiSwap, Curve) to change asset type multiple times in succession — USDC → ETH → WBTC → DAI — before off-ramping, exploiting the lack of KYC on DEXs.',
    why: 'Each token swap severs the asset trail. Regulators cannot easily cross-reference swap records across decentralized protocols the way they can with centralized exchange records.',
    threshold: 'Detection requires DEX token swap graph — currently in v2 (not yet live)',
  },
  {
    id: 'mixer_obfuscation',
    name: 'Mixer / Tumbler Obfuscation',
    ref: 'OFAC SDN designation 08/08/2022; FinCEN Advisory FIN-2022-NTC2',
    pattern: 'Direct interaction with Tornado Cash or other cryptocurrency mixing services. Mixers pool deposits and return equivalent amounts to withdrawal addresses, severing the on-chain link between source and destination.',
    why: 'Tornado Cash was designated by OFAC under E.O. 13694 for laundering over $7 billion for criminal groups including the Lazarus Group (DPRK). Any interaction — deposit or withdrawal — constitutes a mandatory SAR trigger for US covered institutions.',
    threshold: 'Any direct transaction to/from a known mixer contract address',
  },
  {
    id: 'rapid_hop_layering',
    name: 'Rapid Fund Movement / Hop Layering',
    ref: 'FATF Virtual Assets Report 2021 §5; FinCEN FIN-2019-A003',
    pattern: 'Funds move through 3+ wallets in under 24 hours, with each hop forwarding ≥ 80% of received balance to a new address. Intermediate wallets have no prior history (burner addresses). The transaction graph forms a straight chain rather than a fan.',
    why: 'This directly mirrors wire-stripping in traditional banking fraud. Each hop adds distance between the source and destination, exploiting the difficulty of real-time blockchain monitoring at each intermediary.',
    threshold: '3+ sequential outbound txns in 24h, each forwarding ≥ 80% of received funds. Contextual gate: also requires OFAC or mixer signal.',
  },
  {
    id: 'convergence_pattern',
    name: 'Fund Convergence / Integration Aggregation',
    ref: 'FATF Risk-Based Approach: Virtual Assets 2019 Annex A; FATF Typologies 2020',
    pattern: '5+ distinct inbound source wallets funneling funds into a single destination wallet, followed by a large outbound transfer within 72 hours. Characteristic of the integration phase: fragmented proceeds from a hack or rug pull aggregated before off-ramping.',
    why: 'Proceeds are often fragmented during the placement and layering phases to avoid detection. Convergence into a single wallet signals the final consolidation before cash-out.',
    threshold: '5+ distinct inbound sources; outbound transfer ≥ 50% of total inbound within 72h',
  },
  {
    id: 'peel_chain',
    name: 'Peel Chain',
    ref: 'FATF Virtual Assets Report 2021; FinCEN FIN-2021-A002',
    pattern: 'Sequential transactions where each step forwards the bulk of funds to a new address while "peeling off" a small residual amount. Each intermediate address appears only once (burner wallets). The total volume obscured can be enormous despite each individual transaction appearing small.',
    why: 'Named for its visual appearance in transaction graphs — a long chain with small branches at each step. Widely used in ransomware payment processing and exchange hack cash-outs to obscure the total volume and ultimate destination.',
    threshold: '5+ sequential outbound txns; linear chain with unique addresses; generally declining amounts per hop',
  },
  {
    id: 'high_volume_anomaly',
    name: 'High Volume Anomaly',
    ref: 'FATF Risk-Based Approach: Virtual Assets 2019 Annex A §7; FinCEN CDD Rule 31 CFR § 1010.230',
    pattern: 'Transaction volume grossly inconsistent with the wallet\'s operational age. A wallet created days ago moving 100+ ETH has no obvious legitimate explanation in most contexts.',
    why: 'This is a "red flag" indicator, not a laundering pattern in itself. It signals that source-of-funds inquiry is urgently required. Legitimate explanations (DeFi yield, NFT sale, CEX hot wallet) should be documented.',
    threshold: 'Total volume > 100 ETH in a wallet < 30 days old',
  },
]

const SOURCES = [
  {
    name: 'OFAC SDN List',
    who: 'US Department of the Treasury, Office of Foreign Assets Control',
    link: 'https://ofac.treasury.gov',
    description: 'The authoritative list of individuals, entities, and cryptocurrency addresses under US sanctions. ClearChain screens against the OFAC SDN XML feed, which covers ETH, BTC, TRX, and SOL addresses. The OFAC list is updated continuously; ClearChain refreshes in the background.',
  },
  {
    name: 'Alchemy',
    who: 'Alchemy (alchemy.com) — blockchain infrastructure provider',
    link: 'https://alchemy.com',
    description: 'On-chain data provider for all four supported chains: Ethereum, Bitcoin, Tron, and Solana. Alchemy supplies transaction history, asset transfers, token balances, and ENS resolution used in every wallet analysis.',
  },
  {
    name: 'eth-labels (Community Dataset)',
    who: 'Open-source community project maintained by dawsbot',
    link: 'https://github.com/dawsbot/eth-labels',
    description: 'A community-maintained dataset of labeled Ethereum addresses. Integrated into ClearChain via lib/labels.ts. Labels cover scams, phishing wallets, known protocols, exchanges, and notable public wallets. Updated with each ClearChain release.',
  },
  {
    name: 'Hardcoded Wallet Labels',
    who: 'ClearChain (open-source, lib/labels.ts)',
    link: 'https://github.com/velasquezbrafael/ClearChain/blob/main/lib/labels.ts',
    description: 'A curated set of well-known addresses with verified labels: Tornado Cash contracts, Lazarus Group wallets, major exchange hot wallets (Binance, Coinbase), and notable public wallets (Vitalik Buterin). All labels are publicly verifiable and cited in comments.',
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const mono = 'var(--font-jetbrains-mono)'
  const grotesk = 'var(--font-space-grotesk)'
  const inter = 'var(--font-inter)'

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: 'var(--text-primary)' }}>

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '1px solid rgba(6,182,212,0.08)', background: 'rgba(3,4,10,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="/" style={{ fontFamily: mono, fontSize: 14, letterSpacing: '0.15em', color: '#22d3ee', textDecoration: 'none', fontWeight: 700 }}>CLEARCHAIN</a>
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88' }}>DOCS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/api-docs" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none' }}>API DOCS</a>
          <a href="/" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none' }}>TOOL →</a>
          {user
            ? <a href="/dashboard" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none' }}>DASHBOARD →</a>
            : <a href="/auth/login" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', textDecoration: 'none' }}>SIGN IN →</a>
          }
        </div>
      </nav>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(6,182,212,0.06)', padding: '48px 32px 40px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#00ff88', marginBottom: 16 }}>METHODOLOGY</div>
        <h1 style={{ fontFamily: grotesk, fontSize: 36, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
          How ClearChain Works
        </h1>
        <p style={{ fontFamily: inter, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 640 }}>
          Every score, signal, and SAR draft is fully explained below. No black boxes. All data sources are public, all detection logic is open-source under MIT.
        </p>

        {/* Anchor nav */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { href: '#scoring', label: 'Risk Scoring' },
            { href: '#typologies', label: 'Typologies' },
            { href: '#sources', label: 'Data Sources' },
            { href: '#sar', label: 'SAR Drafts' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#06b6d4', textDecoration: 'none', padding: '6px 14px', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 3, background: 'rgba(6,182,212,0.04)', transition: 'background 0.15s' }}
            >
              {label} →
            </a>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 32px 80px' }}>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 1 — Risk Scoring                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="scoring" style={{ paddingTop: 64 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>01</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px' }}>Risk Scoring Methodology</h2>
          <p style={{ fontFamily: inter, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 600 }}>
            Every wallet receives a score from 0–100. Every point is earned by a weighted signal — scores are fully deterministic and reproducible given the same transaction data.
          </p>

          {/* Signals table */}
          <div style={{ border: '1px solid rgba(6,182,212,0.1)', borderRadius: 4, overflow: 'hidden', marginBottom: 40 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 0, background: '#080b14', borderBottom: '1px solid rgba(6,182,212,0.1)', padding: '10px 20px' }}>
              {['Signal', 'Max pts', 'What It Detects', 'What Triggers It'].map(h => (
                <div key={h} style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>{h}</div>
              ))}
            </div>
            {SIGNALS.map((s, i) => (
              <div
                key={s.name}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 0, padding: '16px 20px', background: i % 2 === 0 ? 'transparent' : 'rgba(6,182,212,0.02)', borderBottom: i < SIGNALS.length - 1 ? '1px solid rgba(6,182,212,0.05)' : 'none', alignItems: 'start' }}
              >
                <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-primary)', fontWeight: 700, paddingRight: 12 }}>{s.name}</div>
                <div style={{ fontFamily: mono, fontSize: 13, color: '#00ff88', fontWeight: 700 }}>{s.max}</div>
                <div style={{ fontFamily: inter, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, paddingRight: 16 }}>{s.detects}</div>
                <div style={{ fontFamily: inter, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.trigger}</div>
              </div>
            ))}
          </div>

          {/* Contextual gate callout */}
          <div style={{ border: '1px solid rgba(6,182,212,0.15)', borderLeft: '3px solid #06b6d4', borderRadius: 4, padding: '16px 20px', background: 'rgba(6,182,212,0.04)', marginBottom: 40 }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', color: '#06b6d4', marginBottom: 8 }}>CONTEXTUAL GATE — RAPID FUND MOVEMENT</div>
            <p style={{ fontFamily: inter, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              The Rapid Fund Movement signal (15 pts) only fires when the OFAC Match or Mixer Interaction signal is also triggered.
              Without this gate, high-volume legitimate wallets — exchange hot wallets, DeFi protocol vaults, market makers — would score HIGH incorrectly because
              they genuinely move large sums quickly. The contextual gate prevents false positives: rapid movement alone is only suspicious
              when paired with evidence of sanctions exposure or mixing.
            </p>
          </div>

          {/* Risk levels */}
          <h3 style={{ fontFamily: grotesk, fontSize: 18, fontWeight: 700, color: '#ecfeff', margin: '0 0 20px' }}>Risk Tiers</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 40 }}>
            {RISK_LEVELS.map(r => (
              <div key={r.level} style={{ border: `1px solid ${r.color}22`, borderRadius: 4, padding: '16px 18px', background: `${r.color}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: r.color, padding: '3px 8px', border: `1px solid ${r.color}44`, borderRadius: 2 }}>{r.level}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)' }}>{r.range} pts</span>
                </div>
                <p style={{ fontFamily: inter, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{r.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 2 — Typologies                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="typologies" style={{ paddingTop: 64 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>02</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px' }}>Typology Detection</h2>
          <p style={{ fontFamily: inter, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px', maxWidth: 600 }}>
            Beyond the risk score, ClearChain maps on-chain patterns to named FATF and FinCEN typologies. A typology tells a compliance analyst not just that something is suspicious, but what type of money laundering pattern the evidence is consistent with.
          </p>
          <p style={{ fontFamily: inter, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, margin: '0 0 32px' }}>
            Typology definitions follow{' '}
            <a href="https://www.fatf-gafi.org" target="_blank" rel="noopener noreferrer" style={{ color: '#06b6d4' }}>FATF guidance</a>
            {' '}and FinCEN advisories. Detection logic is in{' '}
            <a href="https://github.com/velasquezbrafael/ClearChain/blob/main/lib/typology.ts" target="_blank" rel="noopener noreferrer" style={{ color: '#06b6d4' }}>lib/typology.ts</a>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {TYPOLOGIES.map((t) => (
              <div key={t.id} style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '20px 24px', background: '#080b14' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: grotesk, fontSize: 16, fontWeight: 700, color: '#ecfeff', margin: 0 }}>{t.name}</h3>
                  <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.06em', flexShrink: 0, paddingTop: 2 }}>{t.ref}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', color: '#06b6d4', marginBottom: 6 }}>ON-CHAIN PATTERN</div>
                    <p style={{ fontFamily: inter, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{t.pattern}</p>
                  </div>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', color: '#06b6d4', marginBottom: 6 }}>WHY IT'S SUSPICIOUS</div>
                    <p style={{ fontFamily: inter, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{t.why}</p>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(6,182,212,0.06)', paddingTop: 10 }}>
                  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>DETECTION THRESHOLD: </span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>{t.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 3 — Data Sources                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="sources" style={{ paddingTop: 64 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>03</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px' }}>Data Sources</h2>
          <p style={{ fontFamily: inter, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px', maxWidth: 600 }}>
            All sources are open, publicly citable, and non-proprietary. No black-box databases. No vendor-only threat intelligence.
          </p>
          <p style={{ fontFamily: inter, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, margin: '0 0 32px' }}>
            Attribution philosophy: if a compliance analyst needs to justify a finding in a SAR, every data point in ClearChain can be traced to a public source.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SOURCES.map((s) => (
              <div key={s.name} style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '20px 24px', background: '#080b14', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: grotesk, fontSize: 16, fontWeight: 700, color: '#ecfeff', margin: 0 }}>{s.name}</h3>
                  <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 9, color: '#06b6d4', letterSpacing: '0.06em', textDecoration: 'none', flexShrink: 0, paddingTop: 2 }}>
                    {s.link.replace('https://', '')} →
                  </a>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', marginBottom: 10 }}>{s.who}</div>
                <p style={{ fontFamily: inter, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 4 — SAR Draft Generation                                 */}
        {/* ---------------------------------------------------------------- */}
        <section id="sar" style={{ paddingTop: 64 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>04</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 8px' }}>SAR Draft Generation</h2>
          <p style={{ fontFamily: inter, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 600 }}>
            ClearChain generates a FinCEN-style Suspicious Activity Report draft automatically for every wallet analysis.
          </p>

          <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '24px', background: '#080b14', marginBottom: 24 }}>
            <h3 style={{ fontFamily: grotesk, fontSize: 16, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px' }}>How It Works</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { n: '1', title: 'Analysis runs', body: 'On-chain data is fetched, OFAC is screened, risk signals are scored, and typologies are matched.' },
                { n: '2', title: 'Claude Haiku generates the narrative', body: 'Anthropic\'s Claude Haiku model receives the wallet\'s signals, typologies, risk score, and transaction data. It produces a structured, plain-English compliance narrative and a FinCEN-style SAR draft in a single call.' },
                { n: '3', title: 'SAR structure', body: 'The draft covers: Subject Wallet (address, chain, risk score), Risk Summary (signal breakdown), Suspicious Activity Description (narrative tying signals to typologies), and Recommended Action (SAR filing, EDD, transaction blocking).' },
                { n: '4', title: 'Download and edit', body: 'The SAR draft is downloadable as a .txt file. Compliance teams use it as a starting point — edit, validate, and file through your institution\'s SAR filing system.' },
              ].map(({ n, title, body }) => (
                <div key={n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: mono, fontSize: 13, color: '#06b6d4', fontWeight: 700, flexShrink: 0, width: 20 }}>{n}.</div>
                  <div>
                    <div style={{ fontFamily: grotesk, fontSize: 14, fontWeight: 700, color: '#ecfeff', marginBottom: 4 }}>{title}</div>
                    <p style={{ fontFamily: inter, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ border: '1px solid rgba(255,140,0,0.4)', borderRadius: 4, padding: '20px 24px', background: 'rgba(255,140,0,0.08)' }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', color: '#ff8c00', marginBottom: 12 }}>IMPORTANT DISCLAIMER</div>
            <p style={{ fontFamily: inter, fontSize: 13, color: 'rgba(255,200,150,0.85)', lineHeight: 1.7, margin: 0 }}>
              AI-generated SAR drafts are starting points only. All drafts must be reviewed, validated, and filed by a qualified compliance professional.
              ClearChain does not provide legal or regulatory advice. FinCEN requires SARs to be filed within 30 days of detecting suspicious activity
              (or 60 days if no suspect is identified). The SAR draft does not constitute a filed SAR — it must be submitted through your institution&apos;s
              BSA E-Filing account at{' '}
              <a href="https://bsaefiling.fincen.treas.gov" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00' }}>bsaefiling.fincen.treas.gov</a>.
            </p>
          </div>
        </section>

        {/* Footer */}
        <div style={{ marginTop: 80, paddingTop: 32, borderTop: '1px solid rgba(6,182,212,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            CLEARCHAIN — Open source, MIT licensed.{' '}
            <a href="https://github.com/velasquezbrafael/ClearChain" target="_blank" rel="noopener noreferrer" style={{ color: '#06b6d4', textDecoration: 'none' }}>View source on GitHub →</a>
          </div>
          <a href="/" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none' }}>
            ← Back to Tool
          </a>
        </div>

      </div>
    </div>
  )
}
