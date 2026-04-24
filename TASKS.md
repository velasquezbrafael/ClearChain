# ClearChain — Task Backlog

_Maintained by Rocky (Cowork). Claude Code: read this before starting work, mark items done as you complete them._

---

## 🔴 Active (do these now)

### [ACTIVE] Fix Investigation Mode formatting issues
From visual QA on https://clear-chain-peach.vercel.app:

1. **Graph header cleanup** — reorganize into two clean rows:
   - Row 1 left: `TRANSACTION GRAPH` title · `INVESTIGATION MODE` badge (green `#00ff88`, not purple)
   - Row 1 right: fullscreen expand button
   - Row 2 left: `Click any node to trace funds →` (dim, small, single line)
   - Row 2 right: condensed legend

2. **Legend condensing** — 6 items is too many. Show 3 by default (QUERIED, OFAC/MIXER, HIGH RISK). Add remaining 3 (UNEXPANDED, EXPANDED, AT LIMIT) only after first node expansion. Each item: 10px font, 6px dot, tighter spacing.

3. **Stats bar** — `justify-content: space-between` so RESET GRAPH button is right-aligned and clearly separated from node/edge/depth stats.

4. **Results header overflow** — SHARE → and ← NEW ANALYSIS stay visible. `+ Save to Case` and `EXPORT REPORT →` move into a `[···]` overflow menu (portal dropdown, same style as Save to Case).

5. **Graph height** — cap SVG at 420px on desktop so the three-column layout stays consistent and tabs don't get pushed too far down.

After: `npx tsc --noEmit` → `git add . && git commit -m "fix: investigation mode formatting" && git push && vercel --prod`

---

## 🟡 Next up

### Fund Flow Visualization (Sankey diagram)
Build a new tab "FLOW" next to TYPOLOGIES/NARRATIVE/etc. Shows ETH movement as a Sankey/river diagram:
- Left column: source addresses
- Middle: mixer/intermediary nodes
- Right: destination (queried wallet)
- Arrow thickness proportional to ETH volume
- Color coded by risk (red=OFAC, orange=high-risk, gray=unknown)
- Built with pure SVG (no new libraries)
- Only show if ≥3 hops detected in transaction data

### Graph intelligence — connected node highlighting
When a node is expanded in Investigation Mode and new counterparties load, auto-highlight any new counterparty that is ALREADY in the graph (showing a circle/ring indicator). This reveals when two separate wallets share a common counterparty — a key money laundering pattern.

### Case intelligence view
On the case detail page (`/dashboard/cases/[id]`), add a combined network graph showing ALL addresses in the case as one shared D3 graph. Connections between case addresses are highlighted. Uses the same Investigation Mode graph component. This shows if any two wallets in the case are connected to each other or share common counterparties.

### Dashboard polish
- Total Analyses stat is showing 0 (analyses aren't saving to Supabase when logged in — debug the analyze route's user auth save)
- Add pagination to recent analyses table (currently capped at 10)
- Add status filter to cases list (filter by open/under_review/escalated/etc)

---

## 🔵 Planned

### Bitcoin support
- Bitcoin uses UTXO model (different from Ethereum's account model)
- Need new `lib/bitcoin.ts` client using a Bitcoin API (Blockstream.info or Mempool.space — both free)
- New scoring engine branch for UTXO analysis (different typologies: coinjoin, peeling chains)
- Add chain selector on the main search: `[ETH] [BTC]` toggle
- OFAC list needs Bitcoin address support (separate address format)

### API key system + monetization
- Add `api_keys` table to Supabase
- Issue keys per user from dashboard Settings page
- Rate limiting middleware based on key tier
- Usage tracking (count queries per key per day)
- Pricing page: Free (20/month), Analyst ($29/month, 500), Team ($99/seat)
- Stripe integration for paid tiers

### Email notifications
- When case status changes to `escalated` or `sar_filed`, send email to case owner
- Use Supabase Edge Functions + Resend for email delivery
- Template: branded HTML, same style as the auth confirmation email

### Remove unused dependencies
- `jspdf` and `html2canvas` are in package.json but unused (PDF export was replaced with .txt)
- Run: `npm uninstall jspdf html2canvas`

---

## ✅ Completed

- [x] Core analysis engine (Alchemy, OFAC, scoring, typology)
- [x] Claude Haiku integration (narrative + SAR draft in one call)
- [x] Transaction graph (D3 force-directed, 1/2 hop toggle)
- [x] Investigation Mode (click-to-expand, breadcrumb trail, stats bar)
- [x] Activity timeline (smart bucketing by week/month/quarter/year)
- [x] Counterfactual simulator (toggle signals, real-time score update)
- [x] SAR draft export (.txt download)
- [x] Supabase auth (signup, login, email confirmation, session)
- [x] Dashboard (stats, recent analyses, active cases)
- [x] Case management (create, add addresses, notes, status, report)
- [x] Save to Case from main tool (portal dropdown)
- [x] Search history (localStorage, recent addresses as pills)
- [x] Wallet label badges (Tornado Cash Router, Vitalik Buterin, etc.)
- [x] Hero animations (staggered fadeUp, single-line headline)
- [x] API docs page (/api-docs)
- [x] OG/Twitter social meta tags + og-image.png
- [x] GitHub links in nav and footer
- [x] Vitalik false positive fix (rapid movement contextual gate)
- [x] ENS resolution (vitalik.eth → 0x...)
- [x] Mobile layout (responsive collapse, horizontal scrolling tabs)
- [x] Risk percentile ("Higher risk than X% of analyzed wallets")
- [x] Comparable cases row (similar risk profiles)
- [x] "Try the Simulator" quick-fill button
- [x] "How it works" 3-step section on hero
