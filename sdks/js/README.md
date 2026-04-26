# clearchain-sdk

Official JavaScript/TypeScript SDK for the [ClearChain](https://clear-chain-peach.vercel.app) AML intelligence API.

Zero dependencies. Node 18+ (native `fetch`) or any modern browser.

## Installation

```bash
npm install clearchain-sdk
```

## Quick start

```typescript
import { ClearChainClient } from 'clearchain-sdk'

const client = new ClearChainClient({ apiKey: 'ck_live_your_key_here' })

// Analyze a single address
const result = await client.analyze('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ETH')

console.log(result.riskScore.total)      // 0–100
console.log(result.riskScore.level)      // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
console.log(result.ofacResult.matched)   // false
console.log(result.narrative)            // AI-generated compliance narrative
console.log(result.sarDraft)             // SAR-ready filing draft

// ENS names are resolved automatically (ETH only)
const vitalik = await client.analyze('vitalik.eth')
console.log(vitalik.resolvedAddress)     // 0xd8dA...45
```

## Batch screening

Screen up to 100 addresses in a single API call. Results are sorted by `risk_score` DESC.

```typescript
const batch = await client.batch([
  { address: '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', chain: 'ETH' },
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'ETH' },
  { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf5n',         chain: 'BTC' },
])

console.log(batch.data.total)       // 3
console.log(batch.data.processed)   // 3
console.log(batch.data.summary)     // { critical: 0, high: 1, medium: 0, low: 0, clean: 2 }

// Find high-risk addresses
const flagged = batch.data.results.filter(r => (r.risk_score ?? 0) >= 50)
for (const r of flagged) {
  console.log(`${r.address}: ${r.risk_level} (${r.risk_score}) — top signal: ${r.top_signal}`)
}

// Handle per-address failures gracefully
const failed = batch.data.results.filter(r => r.error !== null)
for (const r of failed) {
  console.error(`${r.address}: ${r.error}`)
}

// Rate limit state after the batch
console.log(batch.meta.rate_limit.remaining)  // calls left today
console.log(batch.meta.rate_limit.reset_at)   // ISO timestamp
```

## Error handling

```typescript
import { ClearChainClient, RateLimitError, InvalidAddressError, ClearChainError } from 'clearchain-sdk'

const client = new ClearChainClient({ apiKey: 'ck_live_your_key_here' })

try {
  const result = await client.analyze('not-a-valid-address', 'ETH')
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Rate limited. Retry in ${err.retryAfter} seconds.`)
    // The SDK already retried up to 3 times — this is the final failure.
  } else if (err instanceof InvalidAddressError) {
    console.log(`Invalid address: ${err.address}`)
  } else if (err instanceof ClearChainError) {
    console.log(`API error [${err.code}] HTTP ${err.status}: ${err.message}`)
  } else {
    throw err
  }
}
```

The SDK automatically retries on `429` (using `Retry-After`) and `5xx` responses with exponential backoff (1s, 2s, 4s). Errors thrown are always after all retry attempts are exhausted.

## Configuration

```typescript
const client = new ClearChainClient({
  apiKey:  'ck_live_your_key_here',
  baseUrl: 'https://your-custom-deployment.vercel.app',  // optional
})
```

## Type reference

### `AnalysisResult`

| Field | Type | Description |
|---|---|---|
| `address` | `string` | The input address as provided |
| `chain` | `'ETH' \| 'BTC' \| 'TRX'` | Chain analyzed |
| `resolvedAddress` | `string` | Checksummed/resolved address (ENS resolved for ETH) |
| `riskScore.total` | `number` | Aggregate risk score 0–100 |
| `riskScore.level` | `RiskLevel` | LOW / MEDIUM / HIGH / CRITICAL |
| `riskScore.signals` | `Record<string, ScoringSignal>` | All evaluated risk signals |
| `ofacResult.matched` | `boolean` | OFAC SDN list match |
| `ofacResult.matchedEntity` | `string?` | SDN entity name if matched |
| `typologies` | `AMLTypology[]` | AML typology detections (ETH only) |
| `transactions` | `WalletTransaction[]` | Recent transaction history |
| `narrative` | `string` | AI-generated plain-English risk narrative |
| `sarDraft` | `string` | FinCEN SAR-ready draft. Requires BSA/AML officer review. |
| `hopData` | `HopEntry[]` | Top counterparty transactions (ETH only, up to 5 hops) |
| `analyzedAt` | `string` | ISO 8601 analysis timestamp |

### `BatchResult` (per-address in `batch()` response)

| Field | Type | Description |
|---|---|---|
| `address` | `string` | Address as submitted |
| `chain` | `SupportedChain` | Chain analyzed |
| `risk_score` | `number \| null` | Score 0–100. null if failed |
| `risk_level` | `RiskLevel \| null` | Risk band. null if failed |
| `ofac_match` | `boolean \| null` | OFAC match. null if failed |
| `mixer_interaction` | `boolean \| null` | Mixer/CoinJoin detected. null if failed |
| `top_signal` | `string \| null` | Highest-scoring triggered signal name |
| `typologies` | `string[] \| null` | Triggered typology names |
| `error` | `string \| null` | Error code on failure, otherwise null |

### Error classes

| Class | When thrown | Extra fields |
|---|---|---|
| `ClearChainError` | All non-2xx responses (base class) | `code: string`, `status: number` |
| `RateLimitError` | 429 after all retries | `retryAfter: number` (seconds) |
| `InvalidAddressError` | 400 INVALID_ADDRESS | `address: string` |

## Rate limits

| Tier | Daily limit |
|---|---|
| `free` | 100 requests |
| `analyst` | 2,000 requests |
| `team` | Unlimited |

Batch requests count as N calls (one per address). Get your API key at [/dashboard/settings](https://clear-chain-peach.vercel.app/dashboard/settings).
