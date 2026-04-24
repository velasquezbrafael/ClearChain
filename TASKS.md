# ClearChain — Task Backlog

_Maintained by Rocky (Cowork). Claude Code: read this before starting work, mark items done as you complete them._

---

## 🔴 Active (do these now)

### [ACTIVE] Graph intelligence — connected node highlighting
When a node is expanded in Investigation Mode and new counterparties load, check each new counterparty against the existing node list. If a new counterparty address is ALREADY in the graph (from a different expansion path), render it with a distinct "overlap" indicator — a pulsing outer ring or double-border circle in yellow/gold (`#ffd60a`).

This reveals when two separate wallets share a common counterparty — a critical money laundering pattern called "convergence." It should appear automatically without user action when the overlap is detected.

In `TransactionGraph.tsx`, in the `expandNode` function, after fetching new counterparties:
```typescript
// For each new node coming in, check if it's already in the graph
const overlapping = data.nodes.filter(n => 
  graphNodes.some(existing => existing.id === n.address.toLowerCase())
);
// Mark overlapping nodes with state: 'overlap' and apply gold ring style
```

Add a new legend item: `● OVERLAP` in gold, shown when any overlap is detected.

---

### [ACTIVE] Case intelligence view
On the case detail page (`/dashboard/cases/[id]`), add a "NETWORK" section that shows all addresses in the case as a single combined D3 force-directed graph.

- Each case address = a node, color-coded by its risk level (red=CRITICAL, orange=HIGH, yellow=MEDIUM, green=LOW/CLEAN)
- If two addresses in the case share a known common counterparty (from their stored analyses), draw an edge between them with label "shared counterparty"
- Use the same `TransactionGraph` component with `investigationMode={false}` and `showCaseLinks={true}`
- Node click opens that address's full analysis in a new tab
- Empty state: "Add addresses to this case to see the network graph"

This is the feature that shows investigators whether their case subjects are connected.

---

### [ACTIVE] Dashboard polish
Three quick items:
1. **Pagination** on the Recent Analyses table — currently capped at 10. Add "Load more" button or page numbers. Fetch next 10 from Supabase with `.range(offset, offset+9)`.
2. **Status filter** on Cases list — dropdown filter: All / Open / Under Review / Escalated / SAR Filed / Closed. Filters the cases query client-side or adds a `.eq('status', filter)` to the Supabase query.
3. **Critical Findings count** on dashboard — currently shows 0. Fix: count analyses where `risk_level = 'CRITICAL'` from the `analyses` table for this user.

After all three active items: `npx tsc --noEmit` → `git add . && git commit -m "feat: overlap detection, case network graph, dashboard polish" && git push && vercel --prod`

---

## 🔵 Planned

### Tron (TRX) chain support
- Tron is the #1 chain for sanctions evasion and drug trafficking
- Use TronGrid API (free tier, no key required for basic access)
- Add `[ETH] [BTC] [TRX]` toggle
- TRX-specific OFAC addresses (OFAC has sanctioned many Tron addresses)

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

- [x] Investigation Mode formatting — header layout, legend, badge color, header bar, height

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
