# ClearChain — Task Backlog

_Maintained by Rocky (Cowork). Claude Code: read this before starting work, mark items done as you complete them._

---

## 🔴 Active (do these now)

_Nothing active. See Planned for next priorities._

---

## 🔵 Planned

### ~~Email notifications — env vars required~~ [DONE]
`RESEND_API_KEY` added to Vercel. Deployment auto-triggered. Emails fire on `escalated` / `sar_filed` status changes.

### ~~API rate limiting — SQL migration required~~ [DONE]
`daily_usage` and `daily_reset_date` columns added to `api_keys` in Supabase. Free tier now enforced at 10 req/day.

### Webhook support for API users
Pro-tier API keys should support a `webhook_url` field on the `api_keys` table. When set, POST the full analysis JSON to the webhook URL after each `/api/analyze` call (non-blocking, fire-and-forget). Useful for enterprise customers building automated pipelines.

### ~~Two-factor auth (2FA)~~ [DONE]
Security section added to `/dashboard/settings`. MFA challenge page at `/auth/mfa`. Login flow redirects to MFA when `nextLevel === 'aal2'`.

---

## ✅ Completed

### Two-Factor Authentication (TOTP)
- `app/dashboard/settings/page.tsx` — Security section below API Keys: State A (DISABLED + ENABLE 2FA button), enrollment flow inline (QR code with white padding bg, backup secret + copy button, 6-digit code input, VERIFY & ACTIVATE), State B (ENABLED + DISABLE 2FA button). `listFactors()` on load to determine initial state.
- `app/auth/mfa/page.tsx` — Standalone challenge page: centered dark layout matching auth pages, large mono code input, auto-submits on 6th digit, `listFactors → challenge → verify` flow, error state with input clear.
- `app/auth/login/page.tsx` — Added `getAuthenticatorAssuranceLevel()` check after successful `signInWithPassword`; redirects to `/auth/mfa` if `nextLevel === 'aal2' && nextLevel !== currentLevel`.

### PDF Case Reports
- `components/CaseReportPDF.tsx` — @react-pdf/renderer Document component: dark-themed (bg #03040a, accent #00ff88), Cover + Case Summary + Addresses (signals table, typologies) + Notes + SAR Drafts sections, fixed footer with page N of M on every page
- `app/api/cases/[id]/report/route.tsx` — GET handler: auth + case ownership check, fetches addresses joined with analyses + notes from Supabase, renders PDF via `renderToBuffer`, returns `application/pdf` with `Content-Disposition: attachment`
- `app/dashboard/cases/[id]/page.tsx` — replaced `.txt` export with "Download Report" button (`window.open('/api/cases/[id]/report', '_blank')`), button added to header row next to status selector, old `handleGenerateReport` removed
- Dependency: `@react-pdf/renderer@4.5.1`

### Watchlist + Alerts
- `supabase/migrations/watchlist.sql` — run once in Supabase SQL Editor
- `app/dashboard/watchlist/page.tsx` — list, add (address + chain + label), remove entries
- `app/api/watchlist/route.ts` — GET / POST / DELETE (409 on duplicate)
- `app/api/watchlist/check/route.ts` — daily cron handler: re-scores all watched addresses, emails owner on risk level change, new OFAC match, or new mixer interaction
- `components/AddToWatchlistButton.tsx` — idle → loading → WATCHING / ALREADY WATCHING
- `vercel.json` — cron schedule `0 9 * * *` for `/api/watchlist/check`
- Dashboard nav + watchlist page nav: Watchlist link added
- "Watch" button wired into ResultsAddressBar overflow menu (alongside Save to Case + Export)
- Required env vars: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`

### Bulk Address Screening (`/dashboard/bulk`)
- New client component at `app/dashboard/bulk/page.tsx`
- Paste addresses one per line (`address` or `address,CHAIN`); CSV/TXT file upload populates textarea
- Default chain selector (ETH / BTC / TRX) applies to rows without explicit chain
- Parsed preview: "N addresses detected — ETH: X · BTC: Y · TRX: Z"
- Sequential processing with 300ms delay between calls; deduplication before scan
- Live results table: queued → scanning (pulsing dot) → score + risk level when done
- Progress bar with N/total + % counter
- Summary row on completion: screened · high/critical (orange if >0) · clean
- Export CSV: address, chain, risk_score, risk_level, top_signal, ofac_match, mixer_interaction
- "Bulk Screen" nav link added to dashboard main nav

### Visual QA sweep — 9 fixes (commit `0188edc`)
- Mobile nav: breakpoint widened 640→768px. Below 768px, nav hides subtitle, API DOCS, INTEL, and status indicator. Only logo + auth button remain — single row at all widths.
- Mobile results blank space: 3-column layout stacks to single column below 768px. TransactionGraph capped at 280px height on mobile, eliminating the dead black void.
- Intel feed deduplication: `recentFlags` deduped by address in JS (Map keyed on address, keep latest `analyzed_at`).
- API Docs copy: description updated to "Ethereum, Bitcoin, or Tron"; `chain` field added to request schema; BTC and TRX curl examples added.
- API Docs nav: `← Back to Tool` link added.
- Activity Timeline: dotted vertical grid lines at 25/50/75% width (`rgba(255,255,255,0.04)`, dasharray `3 4`) eliminate empty space.
- Hero gap: feature grid bottom padding 48→16px, How It Works top padding 56→32px.
- Intel stat cards: `borderRadius` 8→4 (design system compliance).
- Intel nav: shows `DASHBOARD →` or `SIGN IN →` based on server-side session.

### QA bug fixes (this session)
- Dashboard "View →" link now includes `&chain=` param — BTC/TRX analyses no longer re-analyze as ETH.
- Dashboard Addresses Analyzed stat now shows ETH / BTC / TRX counts (TRX was missing).
- `aria-label` on address input is now dynamic per selected chain.
- OG meta description updated to include Bitcoin and Tron.
- Language scramble animation: chars changed to lowercase, staggered left-to-right resolution (char 0 resolves at 15%, last at 85%) — smooth morph instead of simultaneous uppercase glitch.

### Feature sprint (this session)
- INTEL nav link added to dashboard, cases list, and case detail page navs.
- Dashboard pagination: server-side URL-based (`?page=N`), 10 rows per page with Prev/Next controls.
- API rate limiting: free tier capped at 10 req/day in `/api/analyze` (requires SQL migration above).
- Email notifications: `PATCH /api/cases/[id]` route handles status updates + fires branded HTML email via Resend on `escalated` / `sar_filed`.

### Graph intelligence — overlap detection
Connected node highlighting in Investigation Mode. Expanded counterparties that already exist in the graph render with a gold pulsing ring (`#ffd60a`), revealing "convergence" — two wallets sharing a counterparty. Gold `● OVERLAP` legend item appears automatically.

### Case intelligence — network graph
Case detail page shows all case addresses as a combined D3 force-directed graph. Nodes color-coded by risk level. Shared counterparty edges drawn between case subjects. Node click opens full analysis.

### Dashboard polish
- Pagination on Recent Analyses (Load More / page numbers)
- Status filter dropdown on Cases list
- Critical Findings count fixed (was always 0)

### Tron (TRX) chain support
- `lib/tron.ts`, `data/ofac-trx-addresses.json`
- `/api/analyze` TRX pipeline (4-signal scoring)
- ETH/BTC/TRX toggle on hero, TRX quick fills, `/intel` feed

### API key system + monetization
- `lib/apikeys.ts`, `/api/apikeys`, `/dashboard/settings`
- Bearer token auth in `/api/analyze`
- Free / Pro tier table in API docs

### Email notifications infrastructure
- `PATCH /api/cases/[id]/route.ts` — status update + Resend email trigger
- Branded dark HTML template matching ClearChain design

### Core platform
- [x] Core analysis engine (Alchemy, OFAC, scoring, typology)
- [x] Claude Haiku integration (narrative + SAR draft in one call)
- [x] Transaction graph (D3 force-directed, 1/2 hop toggle)
- [x] Investigation Mode (click-to-expand, breadcrumb, stats bar, depth limit)
- [x] Activity timeline (smart bucketing: week/month/quarter/year)
- [x] Counterfactual simulator (toggle signals, real-time score)
- [x] SAR draft export (.txt download)
- [x] Supabase auth (signup, login, email confirmation, session)
- [x] Dashboard (stats, recent analyses, active cases, risk distribution)
- [x] Case management (create, add addresses, notes, status, export)
- [x] Save to Case from main tool (portal dropdown)
- [x] Search history (localStorage, recent address pills)
- [x] Wallet label badges (Tornado Cash, Lazarus Group, Binance, Vitalik…)
- [x] Hero animations (staggered fadeUp, language scramble)
- [x] API docs page (/api-docs) with auth section + tier table
- [x] OG/Twitter social meta tags + og-image.png
- [x] ENS resolution (vitalik.eth → 0x…)
- [x] Vitalik false positive fix (rapid movement contextual gate)
- [x] Risk percentile ("Higher risk than X% of analyzed wallets")
- [x] Comparable cases row (similar risk profiles)
- [x] Fund Flow diagram (Sankey-style inbound sources)
- [x] Remove unused deps (jspdf, html2canvas)
- [x] Mobile layout — responsive collapse, horizontal scrolling tabs
