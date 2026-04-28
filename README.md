# ClearChain

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Chains](https://img.shields.io/badge/chains-ETH%20%C2%B7%20BTC%20%C2%B7%20TRX%20%C2%B7%20SOL-06b6d4.svg)](#)

**Open-source crypto AML analysis. Risk scores, OFAC screening, AML typologies, and AI-generated SAR drafts for any Ethereum, Bitcoin, Tron, or Solana wallet.**

Know in 10 seconds whether a wallet is clean, connected to a mixer, or on a government sanctions list — with the SAR draft written automatically. Free. No API key required to use the hosted version.

<!-- demo.gif -->

**Live:** [clear-chain-peach.vercel.app](https://clear-chain-peach.vercel.app)

---

## Why ClearChain

Enterprise blockchain analytics tools cost $50K+/year and output a risk score with zero actionable guidance. They tell you a wallet scored 87 — they don't tell you *why* it looks like layering via DEX arbitrage, what FATF typology it maps to, or what you'd write in a SAR. Small compliance teams and developers are left doing that analysis manually, which is slow, inconsistent, and expensive.

ClearChain closes that gap. It generates the narrative, maps the typology, and drafts the SAR — the last mile that enterprise tools deliberately skip.

---

## ClearChain vs. Enterprise Tools

| Capability | Chainalysis / TRM | ClearChain |
|---|---|---|
| Risk score | ✅ | ✅ |
| Score breakdown by signal | Partial | ✅ Full weighted breakdown |
| AML typology matching | ❌ | ✅ FATF/FinCEN named typologies |
| Plain-English narrative | ❌ | ✅ AI-generated chain of custody |
| SAR draft generation | ❌ | ✅ FinCEN-style, downloadable |
| OFAC/SDN sanctions screening | ✅ | ✅ |
| Counterfactual simulator | ❌ | ✅ Toggle signals, model scenarios |
| Transaction graph | ✅ | ✅ Force-directed, OFAC flagged |
| Chains | ETH only (or multi at 10×) | ✅ ETH · BTC · TRX · SOL |
| Open source | ❌ | ✅ MIT licensed |
| Price | $50K+/year | Free |

---

## Quick Start

**Prerequisites:** Node.js 18+, [Alchemy API key](https://dashboard.alchemy.com), [Anthropic API key](https://console.anthropic.com/), [Supabase project](https://supabase.com).

```bash
# 1. Clone
git clone https://github.com/velasquezbrafael/ClearChain.git
cd ClearChain

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local — see Environment Variables below

# 3. Install
npm install

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste any ETH/BTC/TRX/SOL address and hit Enter.

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values.

### Required

| Variable | Description |
|---|---|
| `ALCHEMY_API_KEY` | Alchemy API key — used for ETH, BTC, TRX, and SOL RPC calls and asset transfer lookups |
| `ANTHROPIC_API_KEY` | Anthropic API key — powers narrative generation and SAR draft writing |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key — used by the browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used server-side to bypass RLS for admin writes |

### Optional

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Full URL of your deployment (e.g. `https://clear-chain-peach.vercel.app`) — used for auth redirects |
| `NEXT_PUBLIC_BASE_URL` | API base URL override — defaults to the deployment URL |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key — enables email notifications for case updates and watchlist alerts |
| `RESEND_FROM_EMAIL` | From address for transactional emails (e.g. `alerts@yourdomain.com`) |
| `CRON_SECRET` | Secret token that authorises calls to `/api/cron/*` endpoints |

**Minimal setup** (no auth, no email, no cron): only the first five vars are needed.

---

## API

Analyze any wallet with a single POST:

```bash
# Ethereum
curl -X POST https://clear-chain-peach.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"address": "0x722122dF12D4e14e13Ac3b6895a86e84145b6967", "chain": "ETH"}'

# Bitcoin
curl -X POST https://clear-chain-peach.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf", "chain": "BTC"}'

# Solana
curl -X POST https://clear-chain-peach.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"address": "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", "chain": "SOL"}'
```

Response includes `riskScore`, `riskLevel`, `ofacResult`, `typologies`, `narrative`, `sarDraft`, and the full `transactions` array.

---

## Risk Scoring

Scores run 0–100. Every point is earned by a weighted signal — no black boxes.

| Signal | Weight | Trigger |
|---|---|---|
| OFAC/SDN match | 40 pts | Direct address match on OFAC SDN list |
| Mixer/tumbler interaction | 25 pts | Direct interaction with known mixer (Tornado Cash, etc.) |
| Rapid fund movement | 15 pts | 3+ layering hops, each moving ≥80% of received balance |
| High-risk counterparty | 10 pts | Transaction with OFAC-designated or known-bad address |
| Volume anomaly | 5 pts | High volume relative to wallet age |
| Community red flags | 5 pts | Crowdsourced red-flag tags on wallet or counterparties |

**Risk tiers:** LOW (0–24) · MEDIUM (25–49) · HIGH (50–74) · CRITICAL (75–100)

---

## Stack

- [Next.js 16](https://nextjs.org/) — App Router, server components, API routes
- [Supabase](https://supabase.com) — Auth, case management, watchlist, waitlist
- [Anthropic Claude](https://anthropic.com) — Narrative + SAR draft generation
- [Alchemy](https://alchemy.com) — Multi-chain transaction data and ENS resolution
- [D3.js](https://d3js.org/) — Force-directed transaction graph
- TypeScript throughout, strict mode

---

## License

[MIT](LICENSE) — free to use, fork, and build on.

---

*Built by a financial crimes consultant who got tired of black-box scores.*
