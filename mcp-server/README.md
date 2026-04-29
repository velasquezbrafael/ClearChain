# ClearChain MCP Server

Exposes the ClearChain AML analysis engine as an MCP tool so Claude can analyze crypto wallets for sanctions exposure, risk scoring, typology detection, and SAR drafting — directly inside a conversation.

## Tool

### `analyze_wallet`

Analyze a cryptocurrency wallet address for AML risk.

**Inputs**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Wallet address or ENS name (ETH/BTC/TRX/SOL) |
| `chain` | string | No | `ethereum` (default), `bitcoin`, `tron`, `solana` |

**Output**

Full JSON response from the ClearChain API:
- `riskScore` — 0–100 weighted risk score
- `riskLevel` — LOW / MEDIUM / HIGH / CRITICAL
- `ofacResult` — OFAC SDN sanctions screening result
- `signals` — per-signal breakdown (OFAC match, mixer, rapid movement, etc.)
- `typologies` — matched FATF/FinCEN typologies with regulatory citations
- `narrative` — AI-generated plain-English chain-of-custody narrative
- `sarDraft` — FinCEN-style SAR draft, ready to file
- `transactions` — full transaction array

---

## Install

### 1. Build

```bash
cd mcp-server
npm install
npm run build
```

### 2. Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "clearchain": {
      "command": "node",
      "args": ["/absolute/path/to/ClearChain/mcp-server/dist/index.js"]
    }
  }
}
```

Config file location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 3. Claude Code (`.mcp.json` in project root)

```json
{
  "mcpServers": {
    "clearchain": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"]
    }
  }
}
```

---

## Example prompts

```
Analyze 0x722122dF12D4e14e13Ac3b6895a86e84145b6967 for AML risk
```

```
Is bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh on the OFAC sanctions list?
```

```
Run an AML check on DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC73bMBiibYaUn on Solana
```

```
Screen these three wallets for sanctions exposure and summarize the highest risk one
```

---

## Notes

- No API key required for public use (10 analyses/day free tier)
- Logs go to stderr; stdout is reserved for MCP protocol messages
- The server calls `https://clearchain.vercel.app/api/analyze` — no local dependencies required beyond Node 18+
