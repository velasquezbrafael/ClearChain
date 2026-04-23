# ClearChain

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)

**Open-source crypto AML analysis. Risk scores, OFAC screening, AML typologies, and AI-generated SAR drafts for any Ethereum wallet.**

Know in 10 seconds whether a wallet is clean, connected to a mixer, or on a government sanctions list — with the SAR draft written automatically. Free. No API key required to use the hosted version.

<!-- screenshot -->

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
| Open source | ❌ | ✅ MIT licensed |
| Price | $50K+/year | Free |

---

## Quick Start

**Prerequisites:** Node.js 18+, [Alchemy API key](https://dashboard.alchemy.com), [Anthropic API key](https://console.anthropic.com/).

```bash
# 1. Clone
git clone https://github.com/velasquezbrafael-source/ClearChain.git
cd ClearChain

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local — add ALCHEMY_API_KEY and ANTHROPIC_API_KEY

# 3. Install
npm install

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste any Ethereum address or ENS name and hit Enter.

---

## API

Analyze any Ethereum wallet with a single POST:

```bash
curl -X POST https://clear-chain-peach.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"address": "0x722122dF12D4e14e13Ac3b6895a86e84145b6967"}'
```

Response includes `riskScore`, `riskLevel`, `ofacResult`, `typologies`, `narrative`, `sarDraft`, and the full `transactions` array.

---

## Risk Scoring

Scores run 0–100. Every point is earned by a weighted signal.

| Signal | Weight | Trigger |
|---|---|---|
| OFAC/SDN match | 40 pts | Direct address match on OFAC SDN list |
| Mixer/tumbler interaction | 25 pts | Direct interaction with known mixer (Tornado Cash, etc.) |
| Rapid fund movement | 15 pts | 3+ layering hops, each moving ≥80% of received balance |
| High-risk counterparty | 10 pts | Transaction with OFAC-designated or known-bad address |
| Volume anomaly | 5 pts | >100 ETH moved in a wallet <30 days old |
| Community red flags | 5 pts | Crowdsourced red-flag tags on wallet or counterparties |

**Risk tiers:** LOW (0–24) · MEDIUM (25–49) · HIGH (50–74) · CRITICAL (75–100)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ALCHEMY_API_KEY` | Yes | Ethereum mainnet RPC + asset transfers |
| `ANTHROPIC_API_KEY` | Yes | Narrative and SAR draft generation |

---

## Built With

- [Next.js 14](https://nextjs.org/) — App Router, API routes
- [Anthropic Claude Haiku](https://anthropic.com) — Narrative + SAR generation
- [Alchemy](https://alchemy.com) — Ethereum transaction data + ENS resolution
- [D3.js](https://d3js.org/) — Force-directed transaction graph
- TypeScript throughout

---

## License

[MIT](LICENSE) — free to use, fork, and build on.

---

*Built by a financial crimes consultant at EY who got tired of black-box scores.*
