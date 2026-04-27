export const KNOWN_LABELS: Record<string, { label: string; category: 'sanctioned' | 'exchange' | 'defi' | 'notable' }> = {
  '0x722122df12d4e14e13ac3b6895a86e84145b6967': { label: 'Tornado Cash Router', category: 'sanctioned' },
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b': { label: 'Tornado Cash 10 ETH Pool', category: 'sanctioned' },
  '0xd96f2b1c14db8458374d9aca76e26c3950113464': { label: 'Tornado Cash 1 ETH Pool', category: 'sanctioned' },
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d': { label: 'Tornado Cash 0.1 ETH Pool', category: 'sanctioned' },
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144': { label: 'Tornado Cash 0.01 ETH Pool', category: 'sanctioned' },
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384': { label: 'Tornado Cash 100 ETH Pool', category: 'sanctioned' },
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96': { label: 'Lazarus Group / Ronin Exploiter', category: 'sanctioned' },
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b': { label: 'Lazarus Group Wallet', category: 'sanctioned' },
  '0x7f367cc41522ce07553e823bf3be79a889debe1b': { label: 'OFAC-Sanctioned Mixer', category: 'sanctioned' },
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b': { label: 'OFAC-Sanctioned Address', category: 'sanctioned' },
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { label: 'Vitalik Buterin', category: 'notable' },
  '0xab5c66752a9e8167967685f1450532fb96d5d24f': { label: 'Kraken Exchange', category: 'exchange' },
  '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance Hot Wallet', category: 'exchange' },
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label: 'Binance Cold Wallet', category: 'exchange' },
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { label: 'Binance Investor Wallet', category: 'exchange' },
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': { label: 'Binance Cold Wallet 2', category: 'exchange' },
  '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': { label: 'Binance Exchange Wallet', category: 'exchange' },
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { label: 'OKX Exchange', category: 'exchange' },
  '0xc365c3315cf926351ccaf13fa7d19c8c4058c8e1': { label: 'Coinbase Custody', category: 'exchange' },
  '0x503828976d22510aad0201ac7ec88293211d23da': { label: 'Coinbase Hot Wallet', category: 'exchange' },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { label: 'Uniswap V2 Router', category: 'defi' },
  '0xe592427a0aece92de3edee1f18e0157c05861564': { label: 'Uniswap V3 Router', category: 'defi' },
  '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b': { label: 'OpenSea Wyvern Exchange', category: 'defi' },
  '0x00000000006c3852cbef3e08e8df289169ede581': { label: 'Seaport 1.1 (OpenSea)', category: 'defi' },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { label: 'WETH Contract', category: 'defi' },

  // ── Solana (SOL) — case-sensitive base58 addresses ───────────────────────
  // OFAC-sanctioned
  'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC73bMBiibYaUn': { label: 'Lazarus Group / DPRK (OFAC SDN)', category: 'sanctioned' },
  // Known Solana DeFi programs (program addresses, not user wallets)
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { label: 'Raydium AMM v4', category: 'defi' },
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { label: 'Jupiter Aggregator v6', category: 'defi' },
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':  { label: 'SPL Token Program', category: 'defi' },
};

export function getLabel(address: string): { label: string; category: 'sanctioned' | 'exchange' | 'defi' | 'notable' } | null {
  // ETH addresses are lowercase; SOL addresses are case-sensitive base58.
  // Try exact match first (SOL), then lowercase fallback (ETH/TRX).
  return KNOWN_LABELS[address] ?? KNOWN_LABELS[address.toLowerCase()] ?? null;
}
