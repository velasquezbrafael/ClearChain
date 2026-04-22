# ClearChain

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/clearchain)

**Chainalysis tells you the score. ClearChain tells you what to do about it.**

Open-source, AI-powered crypto wallet risk analysis with OFAC sanctions screening, AML typology matching, plain-English chain-of-custody narratives, and FinCEN-style SAR draft generation — built for compliance analysts, fintech developers, and crypto businesses that need more than a black-box number.

<!-- Add screenshot here -->

---

## The Problem

Enterprise blockchain analytics tools cost $50K+/year and output a risk score with zero actionable guidance. They tell you a wallet scored 87 — they don't tell you why it looks like layering via DEX arbitrage, what FATF typology it maps to, or what you'd write in a SAR. Small compliance teams and developers are left doing that analysis manually, which is slow, inconsistent, and expensive.

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
| Counterfactual simulator | ❌ | ✅ "What if this wallet touched Tornado Cash?" |
| Community-tagged wallets | ❌ | ✅ Crowdsourced context layer |
| Open source | ❌ | ✅ MIT licensed |
| Price | $50K+/year | Free |

---

## Quick Start

**Prerequisites:** Node.js 18+, an [Alchemy API key](https://dashboard.alchemy.com), and an [Anthropic API key](https://console.anthropic.com/).

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/clearchain.git
cd clearchain

# 2. Configure environment variables
cp .env.local.example .env.local
# Fill in: ALCHEMY_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and analyze your first wallet.

---

## API Usage

ClearChain exposes a public REST API. Analyze any Ethereum wallet with a single POST request.

### `POST /api/analyze`

**Request**

```json
{
  "address": "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE",
  "chain": "ethereum",
  "options": {
    "includeSarDraft": true,
    "includeTypologyMatch": true,
    "lookbackDays": 90
  }
}
```

**Response**

```json
{
  "address": "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE",
  "riskScore": 72,
  "riskLevel": "HIGH",
  "sanctions": {
    "ofacMatch": false,
    "sdnScreeningTimestamp": "2026-04-22T14:31:00Z"
  },
  "scoreBreakdown": {
    "ofacSdnMatch": 0,
    "mixerTumblerInteraction": 25,
    "rapidFundMovement": 15,
    "highRiskCounterpartyExposure": 10,
    "transactionVolumeAnomaly": 5,
    "communityRedFlagTags": 17
  },
  "typologyMatch": {
    "primary": "Layering via DEX",
    "fatfReference": "FATF Guidance on Virtual Assets, para. 68",
    "confidence": 0.84,
    "indicators": [
      "Multi-hop token swaps across 3 DEX protocols within 4 hours",
      "Funds originated from known mixer-adjacent wallet cluster",
      "No apparent economic rationale for swap sequence"
    ]
  },
  "narrative": "The subject wallet (0x3f5C...f0bE) received 14.3 ETH from a wallet cluster with documented Tornado Cash interaction on 2026-03-18. Within 6 hours, funds were converted to USDC via Uniswap V3, bridged to Arbitrum, swapped to DAI via Curve Finance, and partially withdrawn to a Binance deposit address. The layering sequence — three DEX hops across two chains in under 24 hours with no apparent trading rationale — is consistent with value obfuscation typologies described in FATF guidance on virtual asset layering.",
  "sarDraft": {
    "filingRecommendation": "File SAR",
    "narrative": "...",
    "downloadUrl": "/api/sar/export?id=sar_20260422_abc123"
  }
}
```

---

## Risk Scoring

Scores run 0–100. Every point is earned by a weighted signal — no black boxes.

| Signal | Max Points | Trigger |
|---|---|---|
| OFAC/SDN sanctions match | 40 | Direct address match on OFAC SDN list |
| Mixer/tumbler interaction | 25 | Direct or 1-hop interaction with known mixer (Tornado Cash, ChipMixer, etc.) |
| Rapid fund movement | 15 | Multi-hop fund movement completing within 24 hours |
| High-risk counterparty exposure | 10 | Transactions with wallets tagged as scam, darknet market, or sanctioned exchange |
| Transaction volume anomaly | 5 | Volume 3+ standard deviations above baseline for wallet age/type |
| Community red-flag tags | 5 | Crowdsourced labels from the ClearChain community wallet database |

**Risk Tiers:** Low (0–24) | Medium (25–49) | High (50–74) | Critical (75–100)

---

## AML Typologies

ClearChain maps detected patterns to named FATF/FinCEN typologies — the same framework a BSA officer or examiner would apply.

| Typology | Description | Reference |
|---|---|---|
| **Smurfing / Structuring** | Repeated small transactions designed to stay below reporting thresholds | FinCEN Advisory FIN-2014-A005 |
| **Layering via DEX** | Multi-hop token swaps across decentralized exchanges to obscure fund origin | FATF VA Guidance (2021), para. 68 |
| **Mixer-Based Obfuscation** | Use of coin mixers or tumblers (e.g., Tornado Cash) to break the transaction trail | FATF VA Guidance (2021), para. 72 |
| **Rapid Hop Layering** | Sequential wallet-to-wallet transfers completing in under 24 hours | FinCEN FIN-2019-A003 |
| **Convergence Pattern** | Multiple unrelated source wallets converging funds into a single destination | FATF Typologies Report (2020) |
| **Peel Chain** | Long linear chain of single-output transactions shedding small amounts at each hop | FATF VA Guidance (2021), para. 65 |
| **Bridge-Assisted Layering** | Cross-chain bridge usage immediately following high-risk activity to reset traceability | FATF VA Guidance (2023 update) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js 14 App                       │
│                   (App Router, TypeScript)                   │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
        ┌─────────▼──────────┐  ┌────────▼────────────┐
        │   /api/analyze     │  │    Web UI            │
        │   (API Routes)     │  │ (Tailwind + React)   │
        └─────────┬──────────┘  └─────────────────────-┘
                  │
      ┌───────────┼────────────────────────┐
      │           │                        │
┌─────▼──────┐ ┌──▼──────────┐  ┌─────────▼──────────┐
│ Etherscan  │ │  OFAC SDN   │  │  Anthropic Claude  │
│    API     │ │  XML Feed   │  │    Sonnet 4.6      │
│            │ │  (Public)   │  │                    │
│ Tx history │ │ Sanctions   │  │ Narrative + SAR    │
│ ERC-20     │ │ screening   │  │ Typology matching  │
└────────────┘ └─────────────┘  └────────────────────┘
                  │
        ┌─────────▼──────────┐
        │      Supabase      │
        │                    │
        │  Query history     │
        │  Community labels  │
        │  Wallet tags       │
        └────────────────────┘
```

---

## Roadmap

### v1 — Core MVP
- [x] Risk score 0–100 with full weighted signal breakdown
- [x] OFAC/SDN sanctions screening
- [x] Etherscan transaction history analysis (ETH + ERC-20)
- [x] Red flag detection: mixer hops, rapid movement, high-risk counterparty exposure
- [x] AML typology matching (7 FATF/FinCEN typologies)
- [x] AI-generated chain-of-custody narrative
- [x] SAR draft generator (FinCEN-style, downloadable)
- [x] REST API (`POST /api/analyze`)
- [x] Supabase query history + community wallet label DB

### v2 — Expanding Coverage
- [ ] Bitcoin and Solana chain support
- [ ] Real-time transaction streaming and alert webhooks
- [ ] Institutional API tiers with rate limiting and auth
- [ ] Counterfactual risk simulator ("What if this wallet touched Tornado Cash?")
- [ ] Automated SAR filing integrations (FinCEN BSA E-Filing API)
- [ ] Batch wallet screening endpoint
- [ ] Browser extension for inline wallet risk lookups

---

## Contributing

ClearChain welcomes contributions from two directions: **compliance expertise** and **engineering depth**. If you're a BSA/AML officer with typology knowledge you want to encode, open an issue. If you're a developer who wants to add chain support, improve the scoring logic, or harden the API, submit a PR.

Please read `CONTRIBUTING.md` before opening a pull request. All typology additions must reference a published FATF, FinCEN, or equivalent regulatory source — we don't invent red flags.

---

## Disclaimer

ClearChain is an AI-assisted analysis tool intended to support compliance workflows. It is **not** a substitute for qualified legal or compliance advice. SAR drafts generated by ClearChain must be reviewed, validated, and filed by a certified BSA/AML Compliance Officer. Risk scores are informational outputs and do not constitute a legal determination of suspicious activity. Nothing in this tool constitutes legal, regulatory, or financial advice.

---

## License

[MIT](LICENSE) — free to use, fork, and build on.

---

*Built by a financial crimes consultant who got tired of black-box scores.*
