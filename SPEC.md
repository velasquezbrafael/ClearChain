# ClearChain — Product Spec v2
_Updated: 2026-04-26 — Path B (API/developer platform) prioritized over compliance workflow_

---

## Positioning

> **"The compliance operating system for crypto businesses that can't afford Chainalysis."**

ClearChain is a multi-chain AML intelligence and case management platform. Built for compliance teams, fintechs, VASPs, and developers who need real workflow tooling — not just a risk score.

**Two layers:**
- **Public tool** — free wallet lookup, open API, no account required. Drives awareness and developer adoption.
- **Compliance platform** — authenticated, persistent, team-based. Case management, saved analyses, multi-chain, API key management. This is where revenue comes from.

---

## The Problem (Expanded)

Enterprise AML tools (Chainalysis, Elliptic, TRM Labs) cost $10K–$100K/year and serve institutional compliance teams at large banks and exchanges. Below that price point, the market is completely underserved:

- **Small fintechs and crypto startups** need compliance tooling to meet regulatory requirements but can't justify a six-figure contract
- **VASP compliance teams** (exchanges, wallets, DeFi protocols) screen hundreds of wallets daily but have no affordable workflow tool
- **Independent compliance analysts** need to build cases, document findings, and generate SAR drafts without enterprise infrastructure
- **Developers** building crypto products need AML screening APIs with clean docs and pay-as-you-go pricing

None of these segments have a good solution. ClearChain fills that gap.

---

## What Makes ClearChain Different

| Feature | Chainalysis/Elliptic | ClearChain |
|---|---|---|
| Risk score | ✅ | ✅ |
| OFAC/Sanctions check | ✅ | ✅ |
| Transaction graph | ✅ | ✅ |
| Multi-chain support | ✅ | ✅ (ETH now, BTC/SOL/TRX roadmap) |
| Plain-English narrative | ❌ | ✅ |
| AML Typology match | ❌ | ✅ |
| SAR Draft Generator | ❌ | ✅ |
| Counterfactual Simulator | ❌ | ✅ |
| Case management | ✅ (enterprise only) | ✅ |
| Developer API | 💰 $50K+/year | ✅ Free tier + paid |
| Open source | ❌ | ✅ |
| Price | $10K–$100K/year | Free → $99/seat/month |

---

## Product Architecture (v2)

### Layer 1 — Public Lookup Tool (live)
- Single wallet analysis: risk score, OFAC check, typology matching, transaction graph, AI narrative, SAR draft
- Counterfactual simulator
- Public API (`POST /api/analyze`) — free, no auth required, rate-limited
- No account required

### Layer 2 — Compliance Platform (building)
- **User accounts** — email/password + Google OAuth via Supabase
- **Case management** — group addresses into investigations, track status, add notes, assign to team members
- **Saved analyses** — every analysis persists to the user's account
- **API key management** — issue keys, track usage, enable billing tiers
- **Team workspaces** — multiple analysts on one account
- **Consolidated case reports** — generate a full investigation report across all addresses in a case

### Layer 3 — Multi-Chain (roadmap)
- Bitcoin (UTXO model, different scoring engine)
- Tron (major sanctions evasion chain)
- Solana (high fraud activity)
- Base, Polygon, Arbitrum (L2 expansion)

---

## Case Management — Core Workflow

A "case" represents one investigation:

```
Case: Suspicious Deposit #2847
├── Status: Under Review
├── Analyst: Raf Velasquez
├── Created: 2026-04-23
├── Addresses (3):
│   ├── 0x722122... (ETH) — CRITICAL 65 — Tornado Cash Router
│   ├── 0xd90e2f... (ETH) — HIGH 50 — TC 10 ETH Pool
│   └── 0x098b71... (ETH) — HIGH 55 — Lazarus Group
├── Notes: "Customer deposited $45K from flagged mixer. Escalated to AML team."
├── SAR Status: Draft generated, pending review
└── Report: [Download consolidated PDF]
```

**Case statuses:** Open → Under Review → Escalated → SAR Filed → Closed

---

## Monetization

| Tier | Price | Limits |
|---|---|---|
| Free | $0 | 20 analyses/month, public API, no case management |
| Analyst | $29/month | 500 analyses, case management, saved analyses, API key |
| Team | $99/seat/month | Unlimited analyses, team workspace, priority support |
| Enterprise | Custom | SLA, dedicated support, custom chain support |

---

## Technical Stack

- **Frontend:** Next.js 16, Tailwind CSS, TypeScript
- **Backend:** Next.js API routes (Vercel serverless)
- **Database:** Supabase (PostgreSQL) — auth, cases, analyses, API keys, users
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **AI:** Claude Haiku via Anthropic SDK
- **Chain data:** Alchemy (ETH mainnet + multi-chain roadmap)
- **OFAC:** In-house curated address list + background refresh
- **Deployment:** Vercel

---

## Database Schema (Supabase)

```sql
users           — id, email, name, created_at (managed by Supabase Auth)
workspaces      — id, name, owner_id, plan, created_at
workspace_members — workspace_id, user_id, role
cases           — id, workspace_id, title, status, created_by, created_at, updated_at
case_addresses  — id, case_id, address, chain, analysis_id, added_at
analyses        — id, address, chain, risk_score, risk_level, signals, typologies, narrative, sar_draft, analyzed_at, user_id
case_notes      — id, case_id, user_id, content, created_at
api_keys        — id, workspace_id, key_hash, label, usage_count, last_used, created_at
```

---

## Build Roadmap

### Strategy: Path B (API Platform) first → Path A (Compliance Workflow) second

The analysis engine is the hard part and it's already built. Path B packages it into a developer product — lower effort, faster to ship, self-service distribution. Path A (monitoring, audit trails, team workflows) follows once there's a user base.

---

### Phase 1 — API & Developer Platform (now)

| Version | What | Status |
|---|---|---|
| v1.0 | Public lookup tool — ETH, OFAC, typologies, narrative, SAR, Investigation Mode | ✅ Live |
| v2.0 | Auth + dashboard + case management (v2 already in progress) | 🔨 In progress |
| v2.1 | **API productization** — OpenAPI spec, versioned endpoints (`/v1/`), clean error codes, rate limiting by key | Next |
| v2.2 | **API key dashboard** — self-service key issuance, usage tracking, per-key rate limits, revocation | Next |
| v2.3 | **Developer docs site** — standalone docs with quickstart, endpoint reference, code examples in JS + Python | Next |
| v2.4 | **SDKs** — `npm install clearchain-sdk` (JS) + `pip install clearchain` (Python) with typed responses | Planned |
| v2.5 | **Tron chain support** — Tron is the #1 sanctions evasion chain; higher compliance priority than Bitcoin | Planned |
| v2.6 | **Batch screening API** — `POST /v1/batch` accepts up to 100 addresses, returns prioritized risk report | Planned |
| v2.7 | **Webhook events** — `wallet.risk_changed`, `wallet.sanctioned` — push events to developer endpoints | Planned |

---

### Phase 2 — Compliance Workflow Platform (later)

| Version | What | Status |
|---|---|---|
| v3.0 | **Watchlists + monitoring** — add wallets to watchlist, get email/webhook alerts on risk changes or new OFAC hits | Planned |
| v3.1 | **Audit trail** — immutable log of who analyzed what and when (required for regulatory due diligence) | Planned |
| v3.2 | **Batch screening UI** — CSV upload in the dashboard for compliance ops teams | Planned |
| v3.3 | **Regulatory intelligence feed** — auto-pull new OFAC designations, alert on newly sanctioned watched wallets | Planned |
| v4.0 | **Monetization** — Stripe integration, tier enforcement, pay-per-use API billing | Planned |
| v4.1 | **Team workspaces** — multi-analyst accounts, role-based access, case assignment | Planned |
| v4.2 | **Bitcoin support** — UTXO scoring engine | Planned |
| v4.3 | **Solana support** | Planned |

---

## Target Customers

**Primary:** VASP compliance teams — crypto exchanges, wallet providers, DeFi protocols required to maintain AML programs under FinCEN/FATF guidance. Currently using spreadsheets and Chainalysis lite plans. Need affordable workflow tooling.

**Secondary:** Fintech compliance analysts — early-stage fintechs building crypto products who need to demonstrate AML controls to regulators and banking partners.

**Developer:** Builders adding AML screening to crypto products. Need clean API, good docs, pay-as-you-go pricing.

---

## Key Insight

The compliance workflow is the moat. Anyone can build a risk score. Nobody has built an affordable, usable case management tool for the compliance teams that Chainalysis ignores. That's the product.
