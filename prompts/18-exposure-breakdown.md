# Task 18 — Direct vs Indirect Exposure Breakdown

## Context

ClearChain is a crypto AML intelligence platform. The analysis pipeline detects two categories of exposure:

**Direct exposure** — the wallet itself has a problem:
- It is OFAC/SDN listed (`ofacResult.matched`)
- It directly transacted with a known mixer (Tornado Cash etc.) — `riskScore.signals.mixer_interaction.triggered`
- It directly transacted with a known high-risk address — `riskScore.signals.high_risk_counterparty.triggered`

**Indirect exposure** — the wallet's counterparties have a problem:
- A direct counterparty is OFAC/SDN listed
- A direct counterparty is a known mixer
- Captured in `riskScore.signals.indirect_exposure`

Currently, `indirectExposureHits` (an array of `{ address, entity, type: 'ofac' | 'mixer' }`) is computed in the ETH analyze route but **never included in the `WalletAnalysis` object** returned to the frontend. The UI has no way to display structured indirect exposure data — only the signal detail string.

This task:
1. Adds `indirectExposureHits` to `WalletAnalysis` (optional field)
2. Populates it in the ETH and stablecoin analyze pipelines
3. Creates a new `ExposureBreakdown` component
4. Wires it into the results section of `app/page.tsx`

---

## Design System (must be followed exactly)

```
Background:   #03040a (page) / #080b14 (cards) / #0d1220 (elevated)
Accent cyan:  #06b6d4 primary
Critical:     #ff3b3b | High: #ff8c00 | Medium: #ffd60a | Low/clean: #22d3ee
Borders:      rgba(255,255,255,0.06) default, rgba(6,182,212,0.2) active/highlight
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim
Fonts:        Space Grotesk (headings), JetBrains Mono (addresses/data/labels), system-ui (body)
Rules:        No border-radius > 4px. No text gradients. Inline SVG only. No icon libraries.
Animations:   Use existing fadeUp keyframe (opacity 0→1 + translateY 20→0) where appropriate.
```

---

## Step 1: Update `types/index.ts`

Add `indirectExposureHits` as an optional field to `WalletAnalysis`:

```typescript
export interface IndirectExposureHit {
  /** The counterparty address that triggered indirect exposure */
  address: string;
  /** Entity name — e.g. "LAZARUS GROUP" or "Tornado Cash / Known Mixer" */
  entity: string;
  /** Whether this hit is an OFAC SDN match or a known mixer */
  type: 'ofac' | 'mixer';
}

export interface WalletAnalysis {
  address: string;
  chain: 'ETH' | 'BTC' | 'TRX' | 'SOL' | 'USDC' | 'USDT' | 'DAI';
  riskScore: RiskScore;
  typologies: AMLTypology[];
  transactions: WalletTransaction[];
  ofacResult: OFACResult;
  analyzedAt: string;
  /** Structured indirect exposure hits — counterparties that are OFAC-listed or known mixers */
  indirectExposureHits?: IndirectExposureHit[];
}
```

---

## Step 2: Update `app/api/analyze/route.ts`

### ETH pipeline (step 8, building the WalletAnalysis object)

Find the ETH `const analysis: WalletAnalysis = { ... }` block (around step 8) and add `indirectExposureHits`:

```typescript
const analysis: WalletAnalysis = {
  address,
  chain: 'ETH',
  riskScore,
  typologies,
  transactions,
  ofacResult,
  analyzedAt: new Date().toISOString(),
  indirectExposureHits,  // ← add this
};
```

### Stablecoin pipeline

Find the stablecoin `WalletAnalysis` object construction and add `indirectExposureHits: stableIndirectHits` (or whatever the stablecoin indirect hits variable is named in that pipeline).

---

## Step 3: Create `components/ExposureBreakdown.tsx`

This is a new client component. It renders only when there is any exposure to show — if both direct and indirect are completely clean, render nothing (return null).

### Props

```typescript
interface ExposureBreakdownProps {
  analysis: WalletAnalysis;
}
```

### Logic

**Direct exposure items** — derive from `analysis`:
- If `analysis.ofacResult.matched` → direct OFAC hit: entity name from `analysis.ofacResult.matchedEntity`
- If `analysis.riskScore.signals.mixer_interaction?.triggered` → direct mixer: use detail from signal for count
- If `analysis.riskScore.signals.high_risk_counterparty?.triggered` → direct high-risk counterparty: use detail from signal

**Indirect exposure items** — from `analysis.indirectExposureHits ?? []`

Show the section only if at least one direct or indirect item exists.

### Visual structure

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPOSURE ANALYSIS                                               │
├────────────────────────┬────────────────────────────────────────┤
│  DIRECT                │  INDIRECT                              │
│  ─────────────────     │  ─────────────────                     │
│  [item rows]           │  [item rows]                           │
│                        │                                        │
│  "The wallet itself    │  "One or more counterparties of this   │
│   has direct contact   │   wallet carry their own sanctions     │
│   with sanctioned or   │   or mixer designations."              │
│   high-risk entities." │                                        │
└────────────────────────┴────────────────────────────────────────┘
```

**Card container:**
- Background: `#080b14`
- Border: `rgba(255,255,255,0.06)`
- Border-radius: 4px
- Padding: 20px
- Margin-top: 16px

**Section header "EXPOSURE ANALYSIS":**
- JetBrains Mono, 9px, letter-spacing 0.15em
- Color: `#8892a4`
- Margin-bottom: 16px

**Two-column grid** (CSS grid, equal columns, 16px gap):
- Each column has a label: "DIRECT" / "INDIRECT" — JetBrains Mono, 8px, letter-spacing 0.15em, `#3d4a5c`
- Thin divider line between columns: `1px solid rgba(255,255,255,0.06)`

**Each exposure item row:**
```
[type badge] [entity/label]          [address truncated]
```
- Row background: `rgba(255,255,255,0.02)`, border-radius 2px, padding 8px 10px
- Type badge: JetBrains Mono, 8px, uppercase letter-spacing
  - OFAC: background `rgba(255,59,59,0.1)`, color `#ff3b3b`, border `rgba(255,59,59,0.2)`
  - MIXER: background `rgba(255,140,0,0.1)`, color `#ff8c00`, border `rgba(255,140,0,0.2)`
  - HIGH-RISK: background `rgba(255,214,10,0.1)`, color `#ffd60a`, border `rgba(255,214,10,0.2)`
- Entity name: system-ui, 11px, `#f0f4ff`
- Address (if available): JetBrains Mono, 9px, `#8892a4`, show first 6 + "..." + last 4

**Clean state for each column:**
If a column has no items, show:
```
✓  No direct exposure
```
- Checkmark color: `#22d3ee`
- Text: system-ui, 11px, `#3d4a5c`

**Footer note** (below the grid):
- Italic, system-ui, 10px, `#3d4a5c`
- "Direct exposure = the wallet itself. Indirect exposure = 2-hop taint from counterparties."

---

## Step 4: Wire into `app/page.tsx`

Import `ExposureBreakdown` and render it in the results section, between the risk score card and the typology/narrative section. Exact placement: after `<RiskScoreCard ... />` and before the typologies/narrative cards.

```tsx
import ExposureBreakdown from '@/components/ExposureBreakdown';

// In the results JSX:
<RiskScoreCard riskScore={analysis.riskScore} address={analysis.address} chain={analysis.chain} />
<ExposureBreakdown analysis={analysis} />
{/* typologies, narrative, etc. */}
```

The component self-suppresses (returns null) if there's nothing to show, so no conditional needed at the call site.

---

## What NOT to do

- Do not show the component if all exposure fields are clean — it should return null in that case
- Do not use any icon libraries — inline SVG only
- Do not use border-radius > 4px
- Do not add `indirectExposureHits` to the BTC, TRX, or SOL pipelines — those don't have the infrastructure for it yet; leave those `analysis` objects unchanged
- Do not break the existing `RiskScoreCard` — `ExposureBreakdown` is additive only

---

## Dev Command

```bash
npm run dev
```

Must be used exactly (custom script that injects non-NEXT_PUBLIC env vars for Turbopack).
