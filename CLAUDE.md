@AGENTS.md

# ClearChain — Project Intelligence

## What this is
ClearChain is a crypto AML (anti-money laundering) intelligence and compliance workflow platform. It combines on-chain data from Alchemy, OFAC sanctions screening, AI-generated compliance narratives (Claude Haiku), and FinCEN-style SAR draft generation — free and open source.

**Live:** https://clearchain.vercel.app | **Repo:** https://github.com/velasquezbrafael-source/ClearChain  
**Stack:** Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind CSS, Supabase, Alchemy API, Anthropic SDK  
**Dev command:** `npm run dev` — MUST use this exact command (custom script that injects non-NEXT_PUBLIC env vars via `set -a`)

---

## Architecture

```
app/
  page.tsx                    Main public analysis tool (hero + results)
  layout.tsx                  Root layout, auth-aware nav (Supabase session)
  dashboard/page.tsx          User dashboard (stats, recent analyses, active cases)
  dashboard/cases/page.tsx    Cases list + inline new-case form
  dashboard/cases/[id]/       Case detail (addresses, notes, status, report export)
  auth/login|signup|callback  Supabase auth pages
  api/analyze/route.ts        POST — main analysis pipeline (Alchemy+OFAC+scoring+Claude)
  api/cases/route.ts          GET/POST — case management (requires auth cookie)
  api/graph-expand/route.ts   POST — Investigation Mode node expansion
  api/simulate/route.ts       POST — Counterfactual simulator narrative

components/
  TransactionGraph.tsx        D3 force-directed graph WITH Investigation Mode
  RiskScoreCard.tsx           Score display + signal breakdown table
  TransactionTimeline.tsx     SVG activity bar chart (smart bucketing: week/month/quarter/year)
  SaveToCaseButton.tsx        Portal dropdown — saves analysis to case
  InfoTooltip.tsx             ⓘ tooltip (portal-based, escapes overflow:hidden)
  ExportButton.tsx            Downloads analysis as .txt report

lib/
  etherscan.ts                Alchemy API (getTransactions, getTokenTransfers, resolveENS)
  ofac.ts                     In-house OFAC checker — hardcoded list + background XML refresh
  scoring.ts                  6-signal weighted engine (0–100). Rapid movement has contextual gate.
  typology.ts                 7 FATF/FinCEN typology detectors
  claude.ts                   Claude Haiku — generateAll() returns {narrative, sarDraft} in one call
  labels.ts                   Known wallet labels (Tornado Cash, Lazarus Group, Binance, Vitalik...)
  utils.ts                    formatETH() — formats large numbers (5893769 → 5.89M ETH)
  supabase/client.ts          Browser client
  supabase/server.ts          Server client (cookie-forwarding — required for RLS)
```

---

## Critical conventions

**Env vars — TURBOPACK ISSUE:**  
Non-`NEXT_PUBLIC_` vars (`ANTHROPIC_API_KEY`, `ALCHEMY_API_KEY`) are NOT injected by Turbopack from `.env.local`. The `npm run dev` script handles this with `set -a`. Never use `ANTHROPIC_API_KEY` as `NEXT_PUBLIC_`.

**Supabase in API routes — ALWAYS use cookie-forwarding pattern:**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
const cookieStore = await cookies()
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => { try { s.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch{} } } }
)
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
NOT `createClient()` from `lib/supabase/server.ts` — that won't forward cookies properly.

**Portal pattern for dropdowns:**  
Any dropdown inside a flex/overflow:hidden container MUST use `createPortal(content, document.body)` with position from `getBoundingClientRect()` and `z-index: 9999`. See `SaveToCaseButton.tsx`.

**Fetch in client components — always include credentials:**
```typescript
fetch('/api/cases', { credentials: 'include', ... })
```

---

## Design system

```
Background:   #03040a (page) / #080b14 (cards) / #0d1220 (elevated elements)
Accent green: #00ff88 (primary), rgba(0,255,136,0.1) (backgrounds)
Critical:     #ff3b3b | High: #ff8c00 | Medium: #ffd60a | Low: #00ff88
Borders:      rgba(255,255,255,0.06) default, rgba(0,255,136,0.2) active
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim

Fonts: Space Grotesk (headings), JetBrains Mono (addresses/code/data), system-ui (body)
Rules: No rounded corners >4px. No gradients on text. Inline SVG only (no icon libs).
Animations: fadeUp keyframe (opacity 0→1, translateY 20→0) with staggered delays.
```

---

## Scoring engine (lib/scoring.ts)

| Signal | Max pts | Key logic |
|---|---|---|
| OFAC/SDN match | 40 | Exact match in in-house OFAC list |
| Mixer interaction | 25 | Address IS a mixer OR transactions with mixer |
| Rapid fund movement | 15 | **Contextual gate:** only fires if OFAC OR mixer also triggered |
| High-risk counterparty | 10 | Interaction with known high-risk addresses |
| Volume anomaly | 5 | Unusual ETH volume for wallet age |
| Community flags | 5 | Community-labeled addresses |

Risk levels: LOW 0–24, MEDIUM 25–49, HIGH 50–74, CRITICAL 75–100

**Vitalik test case:** Must score 0/CLEAN, all signals untriggered. If rapid movement fires for vitalik.eth, the contextual gate is broken.  
**Tornado Cash test case:** Must score 65/HIGH with OFAC+Mixer. Rapid movement should NOT fire (it's the protocol's design, not layering).

---

## Investigation Mode (TransactionGraph.tsx)

Click-to-expand graph traversal — the core differentiator feature:
- Click unexpanded (gray dashed-ring) node → fetches counterparties via `/api/graph-expand`
- D3 hot-update: new nodes/edges added without recreating simulation
- Max depth: 4 hops | Stats bar: N NODES · M EDGES · DEPTH D · K HIGH-RISK | RESET GRAPH button
- Breadcrumb trail appears after first expansion
- Node states: root (green large) / unexpanded (gray dashed) / loading (pulsing) / expanded (white) / at-limit (dim lock) / ofac/mixer (red) / high-risk (orange)
- INVESTIGATION MODE badge color: `#00ff88` green (NOT purple)

---

## Supabase schema

```sql
cases          (id, user_id, title, description, status ['open','under_review','escalated','sar_filed','closed'], created_at, updated_at)
analyses       (id, user_id, address, chain, risk_score, risk_level, signals jsonb, typologies jsonb, narrative, sar_draft, analyzed_at)
case_addresses (id, case_id, analysis_id, address, chain, added_at)
case_notes     (id, case_id, user_id, content, created_at)
```
All tables: RLS enabled, users see only their own rows.

---

## Known tech debt
- `jspdf` + `html2canvas` in package.json but unused — can be removed
- Next.js 16 middleware deprecation warning (non-breaking, ignore)
- Fullscreen graph modal needs requestAnimationFrame d3 re-init on open

---

## Task backlog
See `TASKS.md` for prioritized work items. Always check TASKS.md before starting work.
