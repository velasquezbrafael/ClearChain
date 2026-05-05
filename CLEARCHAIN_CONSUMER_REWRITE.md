# ClearChain Homepage Consumer Rewrite

## Context
ClearChain is pivoting positioning from compliance/enterprise to **consumer crypto safety**. Target user: anyone who wants to verify a wallet before sending or receiving funds — freelancers, traders, DeFi users, NFT buyers, anyone doing P2P crypto. Remove all compliance/enterprise jargon. Add a "Who uses ClearChain" use cases section. All changes are in `app/page.tsx` unless noted.

---

## Change 1 — Slogans array (near line 237)

Find:
```js
const slogans = [
  'follow the money',
  'trace the trail',
  'connect the dots',
  'on-chain never lies',
  'money leaves tracks',
  'expose the network',
];
```

Replace with:
```js
const slogans = [
  'check before you send',
  'trace the trail',
  'follow the money',
  'on-chain never lies',
  'money leaves tracks',
  'know who you\'re trusting',
];
```

---

## Change 2 — Feature array: "Pattern Detection" → "Warning Signs" (near line 833)

Find the feature object with `title: 'Pattern Detection'` and replace it entirely:
```js
{
  title: 'Warning Signs',
  desc: '7 suspicious patterns detected automatically — including mixer usage, rapid fund movement, and chain-hopping. Each flag is explained in plain English so you know what you\'re actually looking at.',
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
```

---

## Change 3 — "How it works" step 2: INVESTIGATE → TRACE (near line 1471)

Find the step object with `n: '02'` and replace the title and body:
- Old title: `'INVESTIGATE'`
- New title: `'TRACE'`
- Old body: `'See exactly who this wallet has been sending money to. Click any node in the fund flow graph to trace connections and spot risky wallets up to 4 hops deep.'`
- New body: `'See exactly where the money has been. Follow transactions across wallets, spot risky connections, and understand who you\'re actually dealing with — before you send.'`

---

## Change 4 — "Why ClearChain" section: replace comparison grid with consumer-focused framing (lines ~1675–1737)

Find the entire `{/* Why ClearChain */}` div block (starts with `{/* Why ClearChain */}` and ends at the closing `</div>` of that section, before `</div>` that closes the outer wrapper at line ~1738).

Replace the comparison grid rows data with:
```js
[
  {
    left: { label: 'WITHOUT CHECKING', body: 'You see an address. You have no idea if it\'s connected to a scam, a hack, or a government-sanctioned entity. You find out after it\'s too late.' },
    right: { label: 'WITH CLEARCHAIN', body: 'Sanctions check, mixer flags, scam wallet labels, and on-chain risk signals — all in one look, in under 10 seconds. Free.' },
  },
  {
    left: { label: 'OTHER TOOLS', body: 'Most crypto safety tools are built for institutions. Expensive APIs, complex dashboards, jargon-heavy output that tells you nothing actionable.' },
    right: { label: 'CLEARCHAIN', body: 'Built for people, not compliance departments. ETH, BTC, TRX, and SOL. Plain-English results. No account required for a basic check.' },
  },
  {
    left: { label: 'THE OLD WAY', body: 'Send first. Google the address later. Hope for the best. Realize there was a red flag three blocks ago when your funds are already gone.' },
    right: { label: 'THE CLEARCHAIN WAY', body: 'Paste the address before you confirm. Get a risk score, a plain-English summary, and every flag explained. Then decide.' },
  },
]
```

Also update the section header:
- Section label: keep `Why ClearChain`
- h2: change to `Most people send first. Then find out.`
- p subhead: change to `ClearChain gives you the information you need before you confirm — not after.`

---

## Change 5 — Add "Use Cases" section

Insert a new JSX block BETWEEN the closing `</div>` of the "How it works" section (line ~1541, after the "BUILT FOR:" line) and the opening `{/* Feature grid */}` div.

New section:
```jsx
{/* Use Cases */}
<div style={{ borderTop: '1px solid rgba(6,182,212,0.05)', padding: isMobile ? '40px 16px' : '64px 24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
  <div style={{ marginBottom: isMobile ? 28 : 48 }}>
    <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 16, textTransform: 'uppercase' as const, textAlign: 'center' as const }}>
      Who uses ClearChain
    </div>
    <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 24 : 32, fontWeight: 700, color: '#ecfeff', margin: '0 0 12px', textAlign: 'center' as const, letterSpacing: '-0.01em' }}>
      Anyone who&apos;s ever had to trust a wallet
    </h2>
    <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 13 : 15, color: '#7ec8d8', textAlign: 'center' as const, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
      Crypto moves fast. These are the moments where a 10-second check can save you.
    </p>
  </div>

  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
    {([
      {
        icon: '💸',
        tag: 'Incoming payment',
        scenario: 'Getting paid in crypto',
        who: 'Freelancers · Sellers · Creators',
        body: "Someone wants to pay you in ETH or USDC. You don't know them. Check their wallet before you hand over your address — or before you accept funds that could later be flagged.",
      },
      {
        icon: '🔒',
        tag: 'Outgoing transfer',
        scenario: 'Sending to a new wallet',
        who: 'Anyone making a transfer',
        body: "Before you confirm a send to a new exchange, platform, or person — paste their address. Know in seconds if it's connected to a scam, a hack, or a government-sanctioned entity.",
      },
      {
        icon: '🪂',
        tag: 'Unknown inbound',
        scenario: 'You received unexpected funds',
        who: 'DeFi users · NFT holders',
        body: "An airdrop. A random deposit. Someone sent you crypto you didn't ask for. Check where it came from — touching tainted funds can create problems even if you didn't initiate it.",
      },
      {
        icon: '🧩',
        tag: 'Due diligence',
        scenario: 'Interacting with a new protocol',
        who: 'DeFi users · NFT buyers',
        body: "About to connect your wallet to a new platform or buy from a new project? Check the contract or team wallet first. Rug pulls and scam projects leave on-chain trails before they disappear.",
      },
    ] as const).map(uc => (
      <div key={uc.scenario} className="glass" style={{ borderRadius: 6, padding: isMobile ? '20px' : '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: isMobile ? 28 : 32, lineHeight: 1, flexShrink: 0 }}>{uc.icon}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#06b6d4', marginBottom: 6, textTransform: 'uppercase' as const }}>{uc.tag}</div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: isMobile ? 15 : 17, fontWeight: 700, color: '#ecfeff', lineHeight: 1.2, marginBottom: 4 }}>{uc.scenario}</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#1e4d5c', letterSpacing: '0.08em' }}>{uc.who}</div>
          </div>
        </div>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: isMobile ? 13 : 14, color: '#7ec8d8', lineHeight: 1.7, margin: 0 }}>{uc.body}</p>
      </div>
    ))}
  </div>
</div>
```

---

## Change 6 — Tab tooltips: plain English (near line 3272)

Find the `tabTooltips` object and replace these three values:

```js
'SIMULATOR': 'Toggle any risk signal on or off to instantly see what\'s driving the score. Great for understanding if a flag is a real concern or a false alarm — before you make a decision.',
'FLOW': 'Visual map of where funds have moved. Thicker connections mean more ETH. Red nodes are wallets flagged by the government or known as crypto mixers.',
'NARRATIVE': 'A plain-English AI summary of what this wallet has been doing on-chain. Always use your own judgment before making any financial decision.',
```

---

## Change 7 — "BUILT FOR:" line update (near line 1538)

Find:
```jsx
<span style={{ color: '#7ec8d8' }}>BUILT FOR:</span>
{' '}Crypto holders · DeFi users · NFT traders · Anyone sending on-chain
```

Replace with:
```jsx
<span style={{ color: '#7ec8d8' }}>BUILT FOR:</span>
{' '}Anyone sending, receiving, or trading crypto — ETH, BTC, TRX, or SOL
```

---

## QA Checklist (run after all changes)

1. **TypeScript check**: `npx tsc --noEmit` — must return 0 errors
2. **No compliance terms remaining**: Search for these strings and confirm none appear in consumer-facing copy (comments are fine):
   - `SAR` (outside of component imports/filenames)
   - `FinCEN`
   - `Chainalysis`
   - `compliance workflow`
   - `Counterfactual scenario modeling`
   - `OFAC-designated` (in tooltips — replace if found)
3. **Use cases section renders**: Verify the 4 use case cards appear between "How it works" and the feature grid on both desktop and mobile viewport widths
4. **Slogans cycle correctly**: The scramble animation should still cycle through all 6 slogans without errors
5. **"Warning Signs" feature card**: Confirm it renders in the feature grid with the correct title (not "Pattern Detection")
6. **"Why ClearChain" section**: Confirm the comparison grid now shows the new "WITHOUT CHECKING / WITH CLEARCHAIN" copy, not the old Chainalysis-adjacent copy
7. **Mobile formatting**: Simulate 390px viewport — confirm:
   - Use cases cards stack to single column
   - Feature grid stacks to single column (already handled by `.feature-grid` CSS)
   - "Why ClearChain" comparison stacks to single column (already uses `isMobile ? '1fr' : '1fr 1fr'`)
   - "How it works" grid stacks to single column (already handled by `.how-it-works-grid` CSS)
   - No text overflow in use case cards
8. **iOS considerations**: All new text uses existing `isMobile` variable for font-size adjustments. No fixed widths on text containers. `as const` type assertions on string literals (textAlign, textTransform) to satisfy TypeScript strict mode.

---

## Implementation notes

- `isMobile` is already defined in the component scope — use it for responsive styles
- `as const` is required on string CSS values like `textAlign: 'center' as const` and `textTransform: 'uppercase' as const` to satisfy TypeScript strict mode
- The `glass` className is defined in `globals.css` — use it on the use case cards
- Do NOT rename tab keys (PATTERNS, SIMULATOR, etc.) — only update their tooltip text. Tab keys are used as state identifiers.
- Do NOT touch `SARDraftCard` component — only the tooltip text for the REPORT tab needs updating in this file
- The `features.slice(0, 5)` means only the first 5 feature objects render in the grid. The 6th (`17,000+ Labeled Wallets`) renders separately as the attribution stat card. Keep this structure — just rename feature[1].title from "Pattern Detection" to "Warning Signs".
