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
const bitfinexHack: IntelArticle = {
  slug: 'bitfinex-hack',
  title: 'The Bitfinex Hack: $72M Stolen, $3.6B Recovered, 6 Years Later',
  subtitle: 'How blockchain forensics traced a peel chain across 2,000 wallets — and caught the launderers in a Walmart bag.',
  tag: 'Case Study',
  tagColor: '#ff8c00',
  readTime: '5 min',
  publishedAt: 'May 2025',
  summary: 'In 2016, hackers stole 119,754 BTC from Bitfinex. Six years later, the DOJ seized $3.6B of it — the largest financial seizure in US history. Here\'s exactly how the trail was followed.',
  body: (
    <>
      <p style={S.p}>On August 2, 2016, hackers exploited Bitfinex's multi-signature wallet system and walked away with 119,754 BTC — worth $72 million at the time. The funds sat mostly dormant for years. Then, in 2022, blockchain investigators finally traced the full laundering trail and the DOJ seized $3.6 billion of it — the largest ever. What they found was a masterclass in on-chain forensics.</p>

      <h2 style={S.h2}>The laundering playbook</h2>
      <p style={S.p}>Ilya Lichtenstein and Heather Morgan didn't cash out quickly. They spent six years attempting to layer the funds through a technique called a <strong style={{ color: '#ecfeff' }}>peel chain</strong> — one of the most common BTC laundering patterns and one of the most traceable.</p>

      {[
        { n: '01', t: 'Peel chain fragmentation', d: 'The 119,754 BTC was split across thousands of wallets. Each wallet received funds and forwarded most to the next, "peeling off" small amounts at each hop. The result: a 2,000-node transaction graph that took analysts months to map.' },
        { n: '02', t: 'Conversion to Monero', d: 'Some funds were converted to Monero (XMR) — a privacy coin designed to be untraceable. This is where the trail genuinely went cold for investigators. Converting back out of Monero created fresh, unlinked BTC.' },
        { n: '03', t: 'Darknet markets & gift cards', d: 'Small amounts were cycled through darknet markets and converted to Walmart gift cards — classic layering to create distance from the original theft.' },
        { n: '04', t: 'Failed DEX mixing', d: 'Attempts were made to use AlphaBay and decentralized exchanges to further obscure origin. Investigators identified these hops through address clustering — wallets that transact together frequently are likely controlled by the same entity.' },
      ].map(s => (
        <div key={s.n} style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 22, color: 'rgba(255,140,0,0.3)', fontWeight: 700, lineHeight: 1, flexShrink: 0, width: 36 }}>{s.n}</div>
          <div style={{ ...S.card, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ecfeff', marginBottom: 4 }}>{s.t}</div>
            <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{s.d}</p>
          </div>
        </div>
      ))}

      <h2 style={S.h2}>How they were caught</h2>
      <p style={S.p}>The breakthrough came from a cloud storage account. Investigators found an encrypted file on Lichtenstein's cloud drive that contained the private keys to the original Bitfinex hack wallets — essentially a self-incriminating ledger of every address in the chain.</p>

      <div style={S.warn}>
        Despite years of layering, the BTC trail was never fully broken. Every address Lichtenstein controlled was eventually mapped through on-chain analysis — peel chains leave a visible fingerprint because the forwarding pattern is statistically identifiable even across thousands of hops.
      </div>

      <h2 style={S.h2}>What this looks like in ClearChain</h2>
      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Pattern observed</th>
          <th style={S.th}>ClearChain signal</th>
        </tr></thead>
        <tbody>
          {[
            ['2,000+ single-use wallets forwarding >95% of funds', 'Rapid fund movement + high-risk counterparty'],
            ['Interaction with known darknet market addresses', 'High-risk counterparty (+10 pts)'],
            ['Wallets on OFAC SDN list (post-designation)', 'OFAC/SDN match (+40 pts) → CRITICAL'],
            ['Volume anomaly on fresh wallets moving large BTC', 'Volume anomaly (+5 pts)'],
          ].map(([p, s]) => (
            <tr key={p}>
              <td style={S.td}>{p}</td>
              <td style={{ ...S.td, color: '#22d3ee', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}>{s}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={S.callout}>
        The lesson from Bitfinex: peel chains look complex but are mathematically traceable. The forwarding pattern — wallet receives, immediately sends 95%+ to one new address — is a fingerprint. ClearChain's Investigation Mode lets you follow exactly these hops visually.
      </div>
    </>
  ),
};

// ─── ARTICLE 2 ─────────────────────────────────────────────────────────────
const silkRoad: IntelArticle = {
  slug: 'silk-road',
  title: 'Silk Road: How the FBI Traced $1B in "Anonymous" Bitcoin',
  subtitle: 'The takedown that proved Bitcoin was never anonymous — and built the forensics playbook still used today.',
  tag: 'Case Study',
  tagColor: '#ff8c00',
  readTime: '5 min',
  publishedAt: 'May 2025',
  summary: 'Ross Ulbricht built the first major darknet market on Bitcoin\'s anonymity. The FBI dismantled it using the blockchain itself — the same techniques ClearChain is built on.',
  body: (
    <>
      <p style={S.p}>Silk Road launched in 2011. By the time the FBI shut it down in October 2013, it had processed over 9.5 million BTC in transactions — roughly $1.2 billion at the time. Ross Ulbricht believed Bitcoin's pseudonymity made it untraceable. The investigation proved the opposite: the blockchain is a permanent, public ledger, and every move leaves a mark.</p>

      <h2 style={S.h2}>Why Ulbricht thought Bitcoin was safe</h2>
      <p style={S.p}>Bitcoin addresses aren't names — they're random strings. No bank, no identity, no obvious link to a real person. Ulbricht used a new address for each transaction, avoided reuse, and operated entirely through Tor. By traditional financial surveillance standards, this was nearly impossible to trace.</p>

      <div style={S.callout}>
        The flaw: every transaction is permanently and publicly recorded. The blockchain doesn't hide the money — it just hides the name. Once investigators tied one address to a real identity, the entire transaction graph opened up.
      </div>

      <h2 style={S.h2}>How the FBI traced it</h2>

      {[
        {
          t: 'Forum post OPSEC failure',
          d: 'The earliest break came from Google — a search result linked a Silk Road promotional post to a Gmail account that Ulbricht had created before learning to use Tor consistently. One unmasked IP address at the right moment connected the pseudonym "Dread Pirate Roberts" to a real person.',
        },
        {
          t: 'Address clustering',
          d: 'Investigators used a technique called co-spend analysis: when two addresses appear together as inputs in a single transaction, they\'re almost certainly controlled by the same wallet. Silk Road\'s commission wallet co-spent with dozens of addresses — mapping the full revenue stream without ever touching private keys.',
        },
        {
          t: 'Exchange subpoenas',
          d: 'When Silk Road vendors cashed out BTC to fiat, they used exchanges that had KYC records. Investigators subpoenaed those records, then walked the blockchain backward from the exchange deposit to the Silk Road payout address. The chain was never broken.',
        },
        {
          t: 'Seized wallet — 144,000 BTC',
          d: 'After arrest, the FBI seized Ulbricht\'s laptop — unlocked and logged in — with private keys to 144,000 BTC. In 2020, the DOJ seized an additional 69,370 BTC from a Silk Road hacker who had exploited the site\'s own wallet. Total seized: over $1 billion.',
        },
      ].map(s => (
        <div key={s.t} style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ecfeff', marginBottom: 6 }}>{s.t}</div>
          <p style={{ ...S.p, fontSize: 13, margin: 0 }}>{s.d}</p>
        </div>
      ))}

      <h2 style={S.h2}>The forensics techniques that came out of this</h2>
      <p style={S.p}>Silk Road built the modern crypto forensics playbook. Every technique used then is still used — and automated — today:</p>

      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Technique</th>
          <th style={S.th}>What it finds</th>
          <th style={S.th}>In ClearChain</th>
        </tr></thead>
        <tbody>
          {[
            ['Co-spend / address clustering', 'Wallets controlled by same entity', 'High-risk counterparty graph'],
            ['Transaction graph tracing', 'Fund flow across hops', 'Investigation Mode'],
            ['Exchange deposit matching', 'Real-world identity at cash-out', 'Known label database'],
            ['Darknet market address flags', 'Interaction with illicit platforms', 'High-risk counterparty signal'],
          ].map(([t, w, c]) => (
            <tr key={t}>
              <td style={{ ...S.td, color: '#f0f4ff' }}>{t}</td>
              <td style={S.td}>{w}</td>
              <td style={{ ...S.td, color: '#22d3ee', fontSize: 12 }}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={S.warn}>
        Bitcoin's public ledger is permanent. Transactions from 2012 are still fully traceable today. If a wallet touched Silk Road, that interaction still shows up — eleven years later — in any blockchain intelligence tool, including ClearChain.
      </div>
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
  bitfinexHack,
  silkRoad,
  tornadoCash,
  lazarusGroup,
];

export function getArticle(slug: string): IntelArticle | undefined {
  return INTEL_ARTICLES.find(a => a.slug === slug);
}
