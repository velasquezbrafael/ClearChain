/**
 * ClearChain — Documentation Hub (/docs)
 *
 * Written for everyone — regular crypto users first, compliance professionals second.
 * Four sections with anchor nav: #scoring · #typologies · #sources · #sar
 */

import SiteNav from '@/components/SiteNav'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SIGNALS = [
  {
    name: 'OFAC / Sanctions Match',
    max: 40,
    plain: 'This wallet is on a US government blacklist.',
    detail: 'OFAC (the US Treasury) publishes a list of wallets linked to sanctioned individuals, criminal organizations, and foreign governments. If a wallet appears on this list, transacting with it may be illegal — regardless of whether you knew.',
  },
  {
    name: 'Mixer Interaction',
    max: 25,
    plain: 'This wallet has used a crypto mixer to hide transaction trails.',
    detail: 'Crypto mixers (like Tornado Cash) are services designed to break the link between a sending and receiving wallet. They\'re used to obscure where money came from. The US government has sanctioned Tornado Cash. Any wallet that has deposited into or withdrawn from a mixer raises serious red flags.',
  },
  {
    name: 'Rapid Fund Movement',
    max: 15,
    plain: 'Large amounts moved out very quickly — a common money laundering pattern.',
    detail: 'If a wallet receives a large sum and immediately sends most of it out to another wallet (and repeats this multiple times in a short window), that\'s a pattern associated with "layering" — a technique used to make dirty money harder to trace. Note: this signal only counts if the wallet also has a sanctions or mixer flag, so normal high-volume wallets like exchanges don\'t get penalized.',
  },
  {
    name: 'High-Risk Counterparty',
    max: 10,
    plain: 'This wallet has sent or received funds from a known bad actor.',
    detail: 'Even if a wallet isn\'t directly flagged, who it\'s been transacting with matters. If one of its counterparties is a sanctioned address, a mixer, or a labeled scam wallet, that connection is a risk signal — similar to how a bank would flag transactions with known fraudulent accounts.',
  },
  {
    name: 'Volume Anomaly',
    max: 5,
    plain: 'This wallet is moving an unusually large amount of crypto for how new it is.',
    detail: 'A brand new wallet handling hundreds of thousands of dollars in crypto without any other history is worth a second look. It could be legitimate, but it\'s a signal worth noting — especially if combined with other flags.',
  },
  {
    name: 'Community Red Flags',
    max: 5,
    plain: 'This wallet has been publicly reported as suspicious.',
    detail: 'The crypto community maintains open-source databases of wallets known to be involved in scams, phishing attacks, rug pulls, and exploits. If a wallet or anyone it\'s transacted with shows up in these lists, it\'s flagged here.',
  },
]

const RISK_LEVELS = [
  {
    level: 'LOW',
    range: '0–24',
    color: '#22d3ee',
    plain: 'Looks clean.',
    meaning: 'No significant flags detected. This doesn\'t guarantee the wallet is legitimate — no tool can — but there\'s nothing in the data that stands out as concerning.',
  },
  {
    level: 'MEDIUM',
    range: '25–49',
    color: '#ffd60a',
    plain: 'Proceed with caution.',
    meaning: 'Something minor triggered — an indirect connection to a flagged wallet, or an unusual transaction pattern. Not necessarily a problem, but worth doing a bit more research before transacting.',
  },
  {
    level: 'HIGH',
    range: '50–74',
    color: '#ff8c00',
    plain: 'Significant red flags — don\'t ignore this.',
    meaning: 'Multiple risk signals fired, or a serious one like mixer interaction. We\'d recommend against transacting with this wallet until you understand what\'s behind the score.',
  },
  {
    level: 'CRITICAL',
    range: '75–100',
    color: '#ff3b3b',
    plain: 'Stop — this wallet has serious sanctions or criminal exposure.',
    meaning: 'The wallet is either directly sanctioned by the US government, has direct mixer exposure alongside other flags, or both. Transacting with a sanctioned wallet can have legal consequences. Do not proceed without legal guidance.',
  },
]

const TYPOLOGIES = [
  {
    name: 'Structuring (Smurfing)',
    simple: 'Breaking up large transactions into smaller ones to avoid detection.',
    detail: 'Instead of sending $10,000 at once (which triggers reporting requirements), someone might send $990 ten times across different wallets. On-chain, this shows up as many transactions clustered just below round-number thresholds. It\'s illegal under US law regardless of whether the underlying funds are legitimate.',
  },
  {
    name: 'Mixer / Tumbler Obfuscation',
    simple: 'Using a mixing service to erase the trail between a sender and receiver.',
    detail: 'Crypto mixers pool deposits from many users and send back equivalent amounts from different wallets — making it nearly impossible to trace where the money originally came from. Tornado Cash, the most well-known Ethereum mixer, was sanctioned by the US government in 2022 for laundering over $7 billion.',
  },
  {
    name: 'Rapid Hop Layering',
    simple: 'Bouncing funds through multiple wallets in quick succession to obscure their origin.',
    detail: 'Money moves through a chain of wallets — each one immediately forwarding almost all of the received funds to the next — before reaching its final destination. The intermediate wallets are typically burner addresses used only once. This mirrors a technique called "wire stripping" in traditional banking fraud.',
  },
  {
    name: 'Layering via Decentralized Exchange',
    simple: 'Using crypto swaps to change the asset type multiple times, making funds harder to trace.',
    detail: 'By rapidly swapping ETH → USDC → WBTC → DAI across decentralized exchanges (which don\'t require identity verification), the trail of funds gets increasingly difficult to follow. Each swap changes the asset, the contract, and the counterparties involved.',
  },
  {
    name: 'Fund Convergence',
    simple: 'Multiple wallets funneling money into a single wallet right before a large payout.',
    detail: 'Proceeds from a hack or scam are often split across dozens of wallets first (to avoid detection), then gradually consolidated back into one wallet before being cashed out. This pattern — many inputs, one output, followed by a large outbound transfer — is a classic integration-phase indicator.',
  },
  {
    name: 'Peel Chain',
    simple: 'A long chain of wallets, each one peeling off a small amount and passing the rest forward.',
    detail: 'Each wallet in the chain receives funds and sends most of it on, keeping a small "peel." The wallets are all new and used only once. This technique is common in ransomware payment processing and crypto exchange hacks — it makes the total amount being laundered hard to see and trace.',
  },
  {
    name: 'High Volume Anomaly',
    simple: 'A brand new wallet handling an unusually large amount of money.',
    detail: 'A wallet that\'s only a few days old moving hundreds of thousands in crypto is worth flagging for a closer look. There may be a legitimate explanation — but it should be documented, especially if combined with any of the above patterns.',
  },
]

const SOURCES = [
  {
    name: 'OFAC Sanctions List',
    who: 'US Department of the Treasury',
    link: 'https://ofac.treasury.gov',
    description: 'The official US government list of sanctioned individuals, companies, and crypto wallet addresses. ClearChain checks every wallet against this list in real time. The list covers ETH, BTC, TRX, and SOL addresses and is refreshed continuously in the background.',
  },
  {
    name: 'Alchemy',
    who: 'alchemy.com — blockchain data infrastructure',
    link: 'https://alchemy.com',
    description: 'ClearChain uses Alchemy to retrieve live on-chain data: full transaction history, token transfers, wallet balances, and ENS name resolution (e.g. vitalik.eth → its address). Alchemy supports all four chains ClearChain covers: Ethereum, Bitcoin, Tron, and Solana.',
  },
  {
    name: 'eth-labels (Community Dataset)',
    who: 'Open-source, maintained by the community',
    link: 'https://github.com/dawsbot/eth-labels',
    description: 'A publicly maintained database of labeled Ethereum addresses — covering scams, phishing wallets, known protocols, exchanges, and more. Integrated into ClearChain to catch community-flagged addresses that may not appear on official government lists.',
  },
  {
    name: 'ClearChain Wallet Labels',
    who: 'Maintained in the open-source repo',
    link: 'https://github.com/velasquezbrafael-source/ClearChain/blob/main/lib/labels.ts',
    description: 'A curated list of well-known addresses with verified labels: Tornado Cash contracts, Lazarus Group wallets (linked to North Korea), major exchange hot wallets (Binance, Coinbase), and notable public addresses. All labels are publicly verifiable — nothing is hidden.',
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocsPage() {
  const mono = 'var(--font-jetbrains-mono)'
  const grotesk = 'var(--font-space-grotesk)'

  return (
    <div style={{ minHeight: '100vh', background: '#03040a', color: 'var(--text-primary)' }}>

      <SiteNav activePage="docs" />

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(6,182,212,0.06)', padding: '56px 32px 48px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#00ff88', marginBottom: 16 }}>HOW IT WORKS</div>
        <h1 style={{ fontFamily: grotesk, fontSize: 34, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
          Understanding Your Results
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 32px', maxWidth: 580 }}>
          ClearChain analyzes crypto wallets for financial risk. This page explains exactly what each score, signal, and flag means — in plain English, no finance background required.
        </p>

        {/* Anchor nav */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { href: '#scoring', label: 'Risk Scores' },
            { href: '#typologies', label: 'Risk Patterns' },
            { href: '#sources', label: 'Our Data' },
            { href: '#sar', label: 'SAR Drafts' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#06b6d4', textDecoration: 'none', padding: '7px 16px', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 3, background: 'rgba(6,182,212,0.04)' }}
            >
              {label} →
            </a>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px 96px' }}>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 1 — Risk Scoring                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="scoring" style={{ paddingTop: 72 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>01 — RISK SCORES</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px' }}>How the score is calculated</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 40px', maxWidth: 580 }}>
            Every wallet gets a score from 0 to 100. The score is based on six signals — each one weighted by how serious it is. Here&apos;s what each signal means and how many points it can add.
          </p>

          {/* Signals — cards instead of table for readability */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
            {SIGNALS.map((s) => (
              <div key={s.name} style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '20px 24px', background: '#080b14' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#ecfeff', marginBottom: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 14, color: '#00ff88', fontWeight: 600 }}>{s.plain}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: '#00ff88', lineHeight: 1 }}>{s.max}</div>
                    <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 2 }}>MAX PTS</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{s.detail}</p>
              </div>
            ))}
          </div>

          {/* Contextual gate note */}
          <div style={{ border: '1px solid rgba(6,182,212,0.15)', borderLeft: '3px solid #06b6d4', borderRadius: 4, padding: '18px 22px', background: 'rgba(6,182,212,0.04)', marginBottom: 48 }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', color: '#06b6d4', marginBottom: 8 }}>IMPORTANT NOTE — RAPID FUND MOVEMENT</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
              The &quot;Rapid Fund Movement&quot; signal only activates if the wallet also has a sanctions flag or mixer interaction. This is intentional — exchanges and DeFi protocols move huge amounts of crypto quickly by design. Without this rule, they&apos;d all score HIGH unfairly.
            </p>
          </div>

          {/* Risk tiers */}
          <h3 style={{ fontFamily: grotesk, fontSize: 20, fontWeight: 700, color: '#ecfeff', margin: '0 0 20px' }}>What the risk levels mean</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 8 }}>
            {RISK_LEVELS.map(r => (
              <div key={r.level} style={{ border: `1px solid ${r.color}33`, borderRadius: 4, padding: '18px 20px', background: `${r.color}0a` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: r.color, padding: '3px 8px', border: `1px solid ${r.color}55`, borderRadius: 2 }}>{r.level}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)' }}>{r.range}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: r.color, marginBottom: 8 }}>{r.plain}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{r.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 2 — Typologies                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="typologies" style={{ paddingTop: 72 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>02 — RISK PATTERNS</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px' }}>Recognizing suspicious patterns</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 12px', maxWidth: 580 }}>
            Beyond a simple score, ClearChain identifies specific behavioral patterns on-chain. These are based on internationally recognized money laundering techniques published by FATF (the global financial crime watchdog) and FinCEN (US financial intelligence).
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, margin: '0 0 36px' }}>
            These patterns don&apos;t automatically mean a wallet is doing something illegal — but they&apos;re the same red flags that trained investigators look for.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TYPOLOGIES.map((t) => (
              <div key={t.name} style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '22px 24px', background: '#080b14' }}>
                <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#ecfeff', marginBottom: 6 }}>{t.name}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#06b6d4', marginBottom: 12 }}>{t.simple}</div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>{t.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 3 — Data Sources                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="sources" style={{ paddingTop: 72 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>03 — OUR DATA</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px' }}>Where the data comes from</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 12px', maxWidth: 580 }}>
            Every piece of data ClearChain uses is from a public, verifiable source. No black-box threat databases. No proprietary scores you can&apos;t trace back.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, margin: '0 0 36px' }}>
            This means if a wallet gets flagged, you can go check the source yourself.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SOURCES.map((s) => (
              <div key={s.name} style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '22px 24px', background: '#080b14' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#ecfeff' }}>{s.name}</div>
                  <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 9, color: '#06b6d4', letterSpacing: '0.06em', textDecoration: 'none', flexShrink: 0 }}>
                    {s.link.replace('https://', '')} →
                  </a>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', marginBottom: 12 }}>{s.who}</div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>{s.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SECTION 4 — SAR Drafts                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="sar" style={{ paddingTop: 72 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: '#06b6d4', marginBottom: 12 }}>04 — SAR DRAFTS</div>
          <h2 style={{ fontFamily: grotesk, fontSize: 26, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px' }}>What is a SAR draft?</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 12px', maxWidth: 580 }}>
            A SAR (Suspicious Activity Report) is an official document that financial institutions are required to file with the US government when they detect potential money laundering or financial crime.
          </p>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 36px', maxWidth: 580 }}>
            ClearChain automatically generates a SAR <em>draft</em> — a pre-filled starting point that a compliance professional can review, edit, and submit. Think of it as a first pass, written by AI, based on everything found in the analysis.
          </p>

          <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, padding: '24px', background: '#080b14', marginBottom: 20 }}>
            <h3 style={{ fontFamily: grotesk, fontSize: 17, fontWeight: 700, color: '#ecfeff', margin: '0 0 20px' }}>What goes into the draft</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { n: '1', title: 'Wallet analysis runs', body: 'ClearChain fetches live on-chain data, checks against the OFAC list, calculates the risk score, and identifies any suspicious patterns.' },
                { n: '2', title: 'AI writes the narrative', body: 'Claude (Anthropic\'s AI model) takes all the findings and writes a structured, plain-English report covering what was found and why it\'s concerning.' },
                { n: '3', title: 'The draft is structured like a real SAR', body: 'It includes the wallet address and chain, a risk summary, a description of the suspicious activity, and a recommended action (file a SAR, do more research, or clear the wallet).' },
                { n: '4', title: 'Download and use it', body: 'The draft downloads as a .txt file. A compliance team can then edit it, add their own context, and file it through the official government system.' },
              ].map(({ n, title, body }) => (
                <div key={n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: mono, fontSize: 14, color: '#06b6d4', fontWeight: 700, flexShrink: 0, width: 22 }}>{n}.</div>
                  <div>
                    <div style={{ fontFamily: grotesk, fontSize: 15, fontWeight: 700, color: '#ecfeff', marginBottom: 5 }}>{title}</div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ border: '1px solid rgba(255,140,0,0.35)', borderRadius: 4, padding: '20px 24px', background: 'rgba(255,140,0,0.07)' }}>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.15em', color: '#ff8c00', marginBottom: 12 }}>HEADS UP</div>
            <p style={{ fontSize: 14, color: 'rgba(255,210,160,0.85)', lineHeight: 1.75, margin: 0 }}>
              SAR drafts generated by ClearChain are a starting point — not a finished, legally compliant filing. All drafts should be reviewed and validated by a qualified compliance professional before submission. ClearChain does not provide legal or regulatory advice. If a SAR needs to be filed, it must be submitted through the official FinCEN BSA E-Filing system at{' '}
              <a href="https://bsaefiling.fincen.treas.gov" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00' }}>bsaefiling.fincen.treas.gov</a>
              . FinCEN requires SARs to be filed within 30 days of detecting suspicious activity.
            </p>
          </div>
        </section>

        {/* Footer */}
        <div style={{ marginTop: 80, paddingTop: 32, borderTop: '1px solid rgba(6,182,212,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            CLEARCHAIN is open source under MIT.{' '}
            <a href="https://github.com/velasquezbrafael-source/ClearChain" target="_blank" rel="noopener noreferrer" style={{ color: '#06b6d4', textDecoration: 'none' }}>View source on GitHub →</a>
          </div>
          <a href="/" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', textDecoration: 'none' }}>
            ← Back to Tool
          </a>
        </div>

      </div>
    </div>
  )
}
