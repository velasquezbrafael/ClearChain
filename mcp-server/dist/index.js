import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASE_URL = 'https://clearchain.vercel.app';
const CHAIN_MAP = {
    ethereum: 'ETH',
    eth: 'ETH',
    bitcoin: 'BTC',
    btc: 'BTC',
    tron: 'TRX',
    trx: 'TRX',
    solana: 'SOL',
    sol: 'SOL',
};
// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const server = new Server({ name: 'clearchain', version: '1.0.0' }, { capabilities: { tools: {} } });
// ---------------------------------------------------------------------------
// Tool: analyze_wallet
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'analyze_wallet',
            description: 'Analyze a cryptocurrency wallet address for AML risk. Returns risk score (0–100), OFAC sanctions status, AML typology matches (FATF/FinCEN), AI-generated compliance narrative, and a FinCEN-style SAR draft.',
            inputSchema: {
                type: 'object',
                properties: {
                    address: {
                        type: 'string',
                        description: 'Wallet address or ENS name to analyze. Supports Ethereum (0x… or ENS), Bitcoin (1…/3…/bc1…), Tron (T…), and Solana (base58).',
                    },
                    chain: {
                        type: 'string',
                        description: 'Blockchain to analyze. Accepts: ethereum, eth, bitcoin, btc, tron, trx, solana, sol. Defaults to "ethereum".',
                        default: 'ethereum',
                    },
                },
                required: ['address'],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'analyze_wallet') {
        return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
    }
    const address = args?.address?.trim();
    if (!address) {
        return {
            isError: true,
            content: [{ type: 'text', text: 'Missing required parameter: address' }],
        };
    }
    const chainInput = (args?.chain ?? 'ethereum').toLowerCase().trim();
    const chain = CHAIN_MAP[chainInput] ?? 'ETH';
    let data;
    try {
        const res = await fetch(`${BASE_URL}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, chain }),
        });
        if (!res.ok) {
            const errorText = await res.text();
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `ClearChain API error (HTTP ${res.status}): ${errorText}`,
                    },
                ],
            };
        }
        data = await res.json();
    }
    catch (err) {
        return {
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `Network error reaching ClearChain API: ${err instanceof Error ? err.message : String(err)}`,
                },
            ],
        };
    }
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr only — stdout is reserved for MCP protocol messages
    process.stderr.write('ClearChain MCP server running on stdio\n');
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map