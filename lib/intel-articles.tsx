import React from 'react';

export interface IntelArticle {
  slug: string;
  title: string;
  subtitle: string;
  tag: string;
  tagColor: string;
  readTime: string;
  publishedAt: string;
  summary: string;
  body: React.ReactNode;
}

const S = {
  h2: { fontSize: 20, fontWeight: 600, color: '#ecfeff', margin: '36px 0 10px', fontFamily: 'var(--font-space-grotesk), system-ui' } as React.CSSProperties,
  h3: { fontSize: 15, fontWeight: 600, color: '#ecfeff', margin: '24px 0 8px', fontFamily: 'var(--font-space-grotesk), system-ui' } as React.CSSProperties,
  p: { fontSize: 15, color: '#8892a4', lineHeight: 1.8, margin: '0 0 16px', fontFamily: 'var(--font-inter), system-ui' } as React.CSSProperties,
  callout: { background: '#080b14', border: '1px solid rgba(34,211,238,0.15)', borderLeft: '3px solid #22d3ee', borderRadius: 6, padding: '14px 18px', margin: '20px 0', fontSize: 14, color: '#7ec8d8', lineHeight: 1.7, fontFamily: 'var(--font-inter), system-ui' } as React.CSSProperties,
  warn: { background: '#0d0600', border: '1px solid rgba(255,59,59,0.15)', borderLeft: '3px solid #ff3b3b', borderRadius: 6, padding: '14px 18px', margin: '20px 0', fontSize: 14, color: '#ff8c6b', lineHeight: 1.7, fontFamily: 'var(--font-inter), system-ui' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, margin: '20px 0', fontSize: 13 },
  th: { padding: '10px 14px', textAlign: 'left' as const, background: '#080b14', color: '#22d3ee', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-jetbrains-mono)' },
  td: { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#8892a4', verticalAlign: 'top' as const, fontFamily: 'var(--font-inter), system-ui', lineHeight: 1.6 },
  mono: { fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px', color: '#22d3ee' } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '20px 0' } as React.CSSProperties,
  card: { background: '#080b14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px' } as React.CSSProperties,
};

// ─── ARTICLE 1 ─────────────────────────────────────────────────────────────
const howToReadARiskReport: IntelArticle = {
  slug: 'how-to-read-a-risk-report',
  title: 'How to Read a ClearChain Risk Report',
  subtitle: 'Every number, signal, and flag explained — and what to do with it.',
  tag: 'Guide',
  tagColor: '#22d3ee',
  readTime: '5 min',
  publishedAt: 'May 2025',
  summary: 'ClearChain scores wallets 0–100 across 6 signals. Here\'s exactly what each one means and how to act on the result.',
  body: (
    <>
      <p style={S.p}>When you paste a wallet into ClearChain, you get back a risk score, a risk level, and a breakdown of which signals fired. This guide walks through exactly what each piece means.</p>

      <h2 style={S.h2}>The risk score (0–100)</h2>
      <p style={S.p}>The score is a weighted sum of 6 signals. It's not a probability — it's an urgency indicator. A score of 75 doesn't mean "75% chance of fraud." It means multiple serious risk factors are present and you should investigate before transacting.</p>

      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Range</th>
          <th style={S.th}>Level</th>
          <th style={S.th}>What it means</th>
          <th style={S.th}>Action</th>
        </tr></thead>
        <tbody>
          {[
            ['0–24', 'LOW', 'No significant flags. Wallet looks clean.', 'Proceed normally'],
            ['25–49', 'MEDIUM', 'Minor signals present. Worth a closer look.', 'Review signals before transacting'],
            ['50–74', 'HIGH', 'Multiple flags. Strong red indicators.', 'Do not transact without investigation'],
            ['75–100', 'CRITICAL', 'OFAC match or mixer + multiple signals.', 'Stop. File a SAR if applicable.'],
          ].map(([r, l, m, a]) => (
            <tr key={r}>
              <td style={{ ...S.td, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, color: l === 'LOW' ? '#00ff88' : l === 'MEDIUM' ? '#ffd60a' : l === 'HIGH' ? '#ff8c00' : '#ff3b3b' }}>{r}</td>
              <td style={{ ...S.td, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, fontWeight: 700, color: l === 'LOW' ? '#00ff88' : l === 'MEDIUM' ? '#ffd60a' : l === 'HIGH' ? '#ff8c00' : '#ff3b3b' }}>{l}</td>
              <td style={S.td}>{m}</td>
              <td style={{ ...S.td, color: '#f0f4ff' }}>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={S.h2}>The 6 signals</h2>
      <p style={S.p}>Each signal has a maximum point value. Here's what triggers each one and why it matters.</p>

      {[
        { name: 'OFAC / SDN Match', pts: 40, color: '#ff3b3b', desc: 'The wallet appears on the U.S. Treasury\'s Specially Designated Nationals list. Transacting with a sanctioned address is a federal crime in the US — regardless of whether you knew. This is the highest-weight signal for a reason.' },
        { name: 'Mixer Interaction', pts: 25, color: '#ff8c00', desc: 'The wallet sent to, received from, or IS a known mixing service (Tornado Cash, Railgun, etc.). Mixers exist specifically to break the transaction trail — their presence is a strong laundering indicator.' },
        { name: 'Rapid Fund Movement', pts: 15, color: '#ffd60a', desc: 'Funds moved through this wallet very quickly. Importantly, this signal only fires if OFAC or mixer also triggered — to avoid flagging legitimate DeFi users who naturally move fast. If you see this alone, it\'s a bug — report it.' },
        { name: 'High-Risk Counterparty', pts: 10, color: '#ffd60a', desc: 'This wallet transacted with another wallet in our high-risk labels database (exploit addresses, known scams, darknet markets). You may be 2 hops from a serious incident.' },
        { name: 'Volume Anomaly', pts: 5, color: '#8892a4', desc: 'The transaction volume is unusually high for a wallet of this age. A brand-new wallet moving millions is a classic layering tell.' },
        { name: 'Community Flags', pts: 5, color: '#8892a4', desc: 'Community-labeled address — reported as a scam, phishing, or fraud by the broader crypto security community.' },
      ].map(sig => (
        <div key={sig.name} style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 600, color: sig.color }}>{sig.name}</span>
            <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: sig.color }}>+{sig.pts} pts max</span>
          </div>
          <p style={{ ...S.p, margin: 0, fontSize: 13 }}>{sig.desc}</p>
        </div>
      ))}

      <div style={S.callout}>
        <strong style={{ color: '#ecfeff' }}>Vitalik test:</strong> vitalik.eth should always score 0/CLEAN. If it scores anything else, the contextual gate on Rapid Fund Movement is broken. Use it as a sanity check.
      </div>

      <h2 style={S.h2}>What to do with the result</h2>
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={{ color: '#00ff88', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>LOW / MEDIUM</div>
          <p style={{ ...S.p, fontSize: 13, margin: 0 }}>Proceed. If MEDIUM, note which signals fired and consider saving to a case for your records.</p>
        </div>
        <div style={S.card}>
          <div style={{ color: '#ff3b3b', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>HIGH / CRITICAL</div>
          <p style={{ ...S.p, fontSize: 13, margin: 0 }}>Don't transact. Open a case in ClearChain, use Investigation Mode to trace counterparties, and export the SAR draft if filing.</p>
        </div>
      </div>
    </>
  ),
};

// ─── ARTICLE 2 ─────────────────────────────────────────────────────────────
const typologies: IntelArticle = {
  slug: 'typologies',
  title: 'The 7 Money Laundering Typologies ClearChain Detects',
  subtitle: 'FATF and FinCEN patterns — what they are, how they work, and why they flag.',
  tag: 'Reference',
  tagColor: '#ffd60a',
  readTime: '6 min',
  publishedAt: 'May 2025',
  summary: 'ClearChain automatically detects 7 FATF/FinCEN typologies. Here\'s the playbook criminals use and how each pattern surfaces in on-chain data.',
  body: (
    <>
      <p style={S.p}>Financial regulators categorize money laundering into named "typologies" — recurring patterns of behavior used to clean dirty money. ClearChain's detection engine is built around 7 of the most common ones seen in crypto.</p>

      <div style={S.callout}>These aren't theoretical. Every typology below has been used in real-world cases — Lazarus Group, Silk Road, BitFinex hack, and more.</div>

      {[
        {
          name: '1. Structuring (Smurfing)',
          color: '#ff8c00',
          what: 'Breaking up large amounts into smaller transactions to stay below reporting thresholds ($10,000 in the US).',
          onchain: 'Multiple transactions of similar size in rapid succession from a single wallet. E.g., 9 x 0.9 ETH sent over 2 hours instead of 1 x 8.1 ETH.',
          signal: 'Volume anomaly + rapid movement pattern',
        },
        {
          name: '2. Layering via Chain-Hopping',
          color: '#ff8c00',
          what: 'Moving funds across multiple blockchains to lose the trail. ETH → BSC → Avalanche → SOL through bridges.',
          onchain: 'Short-lived wallet receiving and immediately bridging funds. Counterparties are bridge contracts. Trail ends at a fresh wallet on another chain.',
          signal: 'Rapid fund movement + high-risk counterparty (known bridge exploiters)',
        },
        {
          name: '3. Mixer / Tumbler Use',
          color: '#ff3b3b',
          what: 'Sending funds through a service that pools and re-mixes transactions to obscure origin and destination.',
          onchain: 'Direct interaction with Tornado Cash, Railgun, or similar protocol. Equal-denomination deposits and withdrawals with time delays.',
          signal: 'Mixer interaction (25 pts) — highest non-OFAC signal',
        },
        {
          name: '4. Peel Chain',
          color: '#ff8c00',
          what: 'Funds move through a long chain of wallets, each peeling off a small amount. Like passing a hot potato down a line.',
          onchain: 'Wallet A sends 99% to B, B sends 99% to C, etc. Each wallet is used once and never seen again. Classic BTC pattern.',
          signal: 'High-risk counterparty + rapid movement (if OFAC/mixer present)',
        },
        {
          name: '5. DeFi Wash Trading',
          color: '#ffd60a',
          what: 'Trading an asset between self-controlled wallets on a DEX to artificially inflate volume and create a "legitimate" transaction history.',
          onchain: 'Wallet A sends token X to B; B sends it back. Repeated. Both wallets have the same first-funded source.',
          signal: 'Community flags + volume anomaly',
        },
        {
          name: '6. NFT Manipulation',
          color: '#ffd60a',
          what: 'Selling an NFT to a self-owned wallet at an inflated price to convert dirty money into "sale proceeds" with provenance.',
          onchain: 'Same wallet funded buyer and seller. NFT sold at 100x floor price. No prior collection history.',
          signal: 'High-risk counterparty + volume anomaly',
        },
        {
          name: '7. OFAC Sanctions Evasion',
          color: '#ff3b3b',
          what: 'Directly interacting with a sanctioned entity — or using intermediary wallets to transact indirectly.',
          onchain: 'Wallet appears on SDN list. Or: counterparty trace leads to SDN wallet within 2 hops.',
          signal: 'OFAC/SDN match (40 pts) — automatic CRITICAL',
        },
      ].map(t => (
        <div key={t.name} style={{ ...S.card, marginBottom: 12, borderLeft: `3px solid ${t.color}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.color, marginBottom: 12, fontFamily: 'var(--font-space-grotesk)' }}>{t.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#3d4a5c', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'var(--font-jetbrains-mono)' }}>What it is</div>
              <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{t.what}</p>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: '#3d4a5c', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'var(--font-jetbrains-mono)' }}>On-chain pattern</div>
              <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{t.onchain}</p>
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '6px 10px', display: 'inline-block' }}>
            <span style={{ fontSize: 10, color: '#3d4a5c', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.08em' }}>CLEARCHAIN SIGNAL: </span>
            <span style={{ fontSize: 11, color: t.color, fontFamily: 'var(--font-jetbrains-mono)' }}>{t.signal}</span>
          </div>
        </div>
      ))}
    </>
  ),
};

// ─── ARTICLE 3 ─────────────────────────────────────────────────────────────
const tornadoCash: IntelArticle = {
  slug: 'tornado-cash',
  title: 'Tornado Cash: The $7B Mixer That Got Sanctioned',
  subtitle: 'How the most-used crypto mixer works, why OFAC banned it, and what it means for your wallet.',
  tag: 'Case Study',
  tagColor: '#ff3b3b',
  readTime: '5 min',
  publishedAt: 'May 2025',
  summary: 'In August 2022, OFAC sanctioned Tornado Cash — a smart contract. Here\'s how the mixer worked, who used it, and why any interaction with it flags in ClearChain.',
  body: (
    <>
      <p style={S.p}>Tornado Cash was a smart contract on Ethereum that mixed transactions — breaking the link between sender and receiver. Before it was sanctioned, it processed over $7 billion in crypto. A significant portion of that came from hackers, ransomware operators, and North Korean state actors.</p>

      <h2 style={S.h2}>How it worked</h2>
      <p style={S.p}>Standard Ethereum transactions are fully public — anyone can trace who sent what to whom. Tornado Cash broke that trail in three steps:</p>

      {[
        { step: '01', title: 'Deposit', desc: 'You deposit exactly 0.1, 1, 10, or 100 ETH into the Tornado contract. It gives you a cryptographic "note" — a secret receipt.' },
        { step: '02', title: 'Wait', desc: 'You wait. The longer you wait, the harder the trail is to follow. Your deposit sits pooled with hundreds of others.' },
        { step: '03', title: 'Withdraw', desc: 'From a completely fresh wallet with no history, you submit your note. The contract releases the same denomination to your new wallet — with zero on-chain link to the deposit.' },
      ].map(s => (
        <div key={s.step} style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 24, color: 'rgba(255,59,59,0.3)', fontWeight: 700, lineHeight: 1, flexShrink: 0, width: 40 }}>{s.step}</div>
          <div style={{ ...S.card, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ecfeff', marginBottom: 4 }}>{s.title}</div>
            <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{s.desc}</p>
          </div>
        </div>
      ))}

      <h2 style={S.h2}>Why OFAC sanctioned it in August 2022</h2>
      <p style={S.p}>The U.S. Treasury's Office of Foreign Assets Control sanctioned Tornado Cash — not just its developers, but the smart contract addresses themselves. This was unprecedented: a piece of code placed on the SDN list.</p>

      <div style={S.warn}>
        <strong>The reason:</strong> OFAC estimated Tornado Cash had been used to launder over $7 billion, including $455 million stolen by North Korea's Lazarus Group and $96 million from the Harmony bridge hack. The mixer was enabling state-sponsored cybercrime at scale.
      </div>

      <h2 style={S.h2}>What it means for your wallet</h2>
      <p style={S.p}>If your wallet ever sent to or received from Tornado Cash — even once, even years ago — ClearChain will flag it. That interaction is permanently on-chain.</p>

      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Scenario</th>
          <th style={S.th}>ClearChain result</th>
          <th style={S.th}>Risk level</th>
        </tr></thead>
        <tbody>
          {[
            ['Wallet directly used Tornado Cash', 'Mixer interaction signal fires (+25 pts)', 'HIGH'],
            ['Wallet received funds that passed through Tornado Cash', 'High-risk counterparty signal (+10 pts)', 'MEDIUM–HIGH'],
            ['Wallet funded the Tornado Cash deployer address', 'OFAC SDN match (+40 pts)', 'CRITICAL'],
            ['No interaction, no counterparty link', 'No signal fires', 'LOW'],
          ].map(([s, r, l]) => (
            <tr key={s}>
              <td style={S.td}>{s}</td>
              <td style={{ ...S.td, color: '#22d3ee' }}>{r}</td>
              <td style={{ ...S.td, color: l === 'CRITICAL' ? '#ff3b3b' : l === 'HIGH' || l === 'MEDIUM–HIGH' ? '#ff8c00' : '#00ff88', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}>{l}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={S.callout}>
        The Tornado Cash sanction is the clearest example of how regulatory action translates directly into ClearChain signals. OFAC adds addresses; ClearChain's list refreshes automatically; any wallet that touched those addresses gets flagged — no manual update needed.
      </div>
    </>
  ),
};

// ─── ARTICLE 4 ─────────────────────────────────────────────────────────────
const lazarusGroup: IntelArticle = {
  slug: 'lazarus-group',
  title: 'The Lazarus Group: $3B in Crypto, Stolen by North Korea',
  subtitle: 'How a state-sponsored hacking unit became crypto\'s biggest threat — and how ClearChain tracks them.',
  tag: 'Case Study',
  tagColor: '#ff3b3b',
  readTime: '6 min',
  publishedAt: 'May 2025',
  summary: 'North Korea\'s Lazarus Group has stolen over $3 billion in crypto since 2017. Their wallets are labeled in ClearChain — here\'s what happened and how to spot the pattern.',
  body: (
    <>
      <p style={S.p}>Lazarus Group is a North Korean state-sponsored hacking unit operating under the Reconnaissance General Bureau. Since 2017 they've stolen over $3 billion in cryptocurrency — funding the regime's weapons program. They're the most prolific crypto threat actor ever documented.</p>

      <h2 style={S.h2}>The biggest hits</h2>
      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Incident</th><th style={S.th}>Year</th><th style={S.th}>Amount</th><th style={S.th}>Method</th>
        </tr></thead>
        <tbody>
          {[
            ['Ronin / Axie Infinity', '2022', '$625M', 'Compromised validator keys'],
            ['Harmony Bridge', '2022', '$100M', 'Multisig key compromise'],
            ['WazirX Exchange', '2024', '$235M', 'Smart contract exploit'],
            ['Bybit Exchange', '2025', '$1.5B', 'UI injection / social engineering'],
            ['Various DeFi protocols', '2020–24', '$500M+', 'Smart contract vulnerabilities'],
          ].map(([i, y, a, m]) => (
            <tr key={i}>
              <td style={{ ...S.td, color: '#f0f4ff' }}>{i}</td>
              <td style={{ ...S.td, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}>{y}</td>
              <td style={{ ...S.td, color: '#ff3b3b', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, fontWeight: 700 }}>{a}</td>
              <td style={S.td}>{m}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={S.h2}>How they launder it</h2>
      <p style={S.p}>After a hack, Lazarus doesn't cash out immediately — they layer. Their playbook is sophisticated and consistent, which is actually what makes them trackable:</p>

      {[
        { n: '1', t: 'Immediate fragmentation', d: 'Stolen funds are split across dozens of wallets within minutes of the hack. This makes freezing harder — exchanges can only block what they know about.' },
        { n: '2', t: 'Tornado Cash / mixers', d: 'Fragments are funneled through Tornado Cash or other mixers to break on-chain links. OFAC flagged Lazarus-linked TC addresses specifically.' },
        { n: '3', t: 'Chain-hopping', d: 'After mixing, funds hop chains via bridges — ETH to BSC to Avalanche. Each hop further obscures the trail and adds complexity for investigators.' },
        { n: '4', t: 'OTC cash-out', d: 'Final conversion to fiat happens through OTC desks in jurisdictions without robust AML enforcement, particularly in East Asia.' },
      ].map(s => (
        <div key={s.n} style={{ ...S.card, marginBottom: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 20, color: '#ff3b3b', fontWeight: 700, lineHeight: 1.2, flexShrink: 0 }}>{s.n}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ecfeff', marginBottom: 4 }}>{s.t}</div>
            <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{s.d}</p>
          </div>
        </div>
      ))}

      <h2 style={S.h2}>How ClearChain tracks them</h2>
      <p style={S.p}>ClearChain's label database includes known Lazarus Group wallet addresses sourced from OFAC designations, FBI advisories, and blockchain intelligence firms. This means:</p>

      <div style={S.warn}>
        If your wallet ever received funds that passed through a Lazarus-linked address — even indirectly — ClearChain will surface it as a high-risk counterparty interaction. You may have unknowingly received tainted funds.
      </div>

      <div style={S.callout}>
        <strong style={{ color: '#ecfeff' }}>Use Investigation Mode</strong> — if you see a high-risk counterparty flag on a wallet, click-expand the graph. Lazarus Group wallets appear as red nodes. The breadcrumb trail shows exactly how many hops away the connection is.
      </div>
    </>
  ),
};

// ─── EXPORT ────────────────────────────────────────────────────────────────
export const INTEL_ARTICLES: IntelArticle[] = [
  howToReadARiskReport,
  typologies,
  tornadoCash,
  lazarusGroup,
];

export function getArticle(slug: string): IntelArticle | undefined {
  return INTEL_ARTICLES.find(a => a.slug === slug);
}
