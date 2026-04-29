/**
 * ClearChain SDK — JavaScript / TypeScript
 *
 * Zero-dependency client for the ClearChain AML API.
 * Requires Node 18+ (native fetch) or any modern browser.
 *
 * @example
 * ```typescript
 * import { ClearChainClient } from 'clearchain-sdk'
 *
 * const client = new ClearChainClient({ apiKey: 'ck_live_...' })
 *
 * const result = await client.analyze('0xd8dA...45', 'ETH')
 * console.log(result.riskScore.total)  // 0–100
 * ```
 */
export { ClearChainError, RateLimitError, InvalidAddressError } from './errors';
export type { SupportedChain, RiskLevel, ScoringSignal, RiskScore, OFACResult, AMLTypology, WalletTransaction, HopEntry, AnalysisResult, BatchAddressInput, BatchResult, BatchSummary, BatchRateLimitMeta, BatchResponse, } from './types';
import type { AnalysisResult, BatchAddressInput, BatchResponse } from './types';
export interface ClearChainClientOptions {
    /** Your ClearChain API key. Format: ck_live_<32 hex chars>. */
    apiKey: string;
    /**
     * Override the base URL for self-hosted or staging environments.
     * @default 'https://clearchain.vercel.app'
     */
    baseUrl?: string;
}
export declare class ClearChainClient {
    private readonly apiKey;
    private readonly baseUrl;
    constructor({ apiKey, baseUrl }: ClearChainClientOptions);
    /**
     * Analyze a single wallet address.
     *
     * @param address  Wallet address or ENS name (ETH only).
     * @param chain    Blockchain to analyze. Defaults to 'ETH'.
     * @returns        Full analysis result including risk score, OFAC screening,
     *                 typologies, AI narrative, and SAR draft.
     *
     * @example
     * ```typescript
     * const result = await client.analyze('vitalik.eth', 'ETH')
     * console.log(result.riskScore.level)  // "LOW"
     * console.log(result.ofacResult.matched)  // false
     * ```
     */
    analyze(address: string, chain?: 'ETH' | 'BTC' | 'TRX'): Promise<AnalysisResult>;
    /**
     * Screen multiple wallet addresses in a single request (max 100).
     *
     * Results are sorted by risk_score DESC. Failed addresses appear last with
     * error field set. A batch of N addresses counts as N calls against your
     * daily quota.
     *
     * @example
     * ```typescript
     * const result = await client.batch([
     *   { address: '0xd882...44b', chain: 'ETH' },
     *   { address: '1A1zP...5n',   chain: 'BTC' },
     * ])
     * const flagged = result.data.results.filter(r => (r.risk_score ?? 0) >= 50)
     * ```
     */
    batch(addresses: BatchAddressInput[]): Promise<BatchResponse>;
    private _post;
}
//# sourceMappingURL=index.d.ts.map