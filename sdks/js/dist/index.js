"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClearChainClient = exports.InvalidAddressError = exports.RateLimitError = exports.ClearChainError = void 0;
var errors_1 = require("./errors");
Object.defineProperty(exports, "ClearChainError", { enumerable: true, get: function () { return errors_1.ClearChainError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_1.RateLimitError; } });
Object.defineProperty(exports, "InvalidAddressError", { enumerable: true, get: function () { return errors_1.InvalidAddressError; } });
const errors_2 = require("./errors");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_BASE_URL = 'https://clearchain.vercel.app';
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ---------------------------------------------------------------------------
// ClearChainClient
// ---------------------------------------------------------------------------
class ClearChainClient {
    constructor({ apiKey, baseUrl = DEFAULT_BASE_URL }) {
        if (!apiKey)
            throw new errors_2.ClearChainError('apiKey is required', 'MISSING_API_KEY', 0);
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    // ── Public API ─────────────────────────────────────────────────────────────
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
    async analyze(address, chain = 'ETH') {
        const envelope = await this._post('/api/v1/analyze', { address, chain });
        return envelope.data;
    }
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
    async batch(addresses) {
        return this._post('/api/v1/batch', { addresses });
    }
    // ── Internal: POST with retry ──────────────────────────────────────────────
    async _post(path, body) {
        const url = `${this.baseUrl}${path}`;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            let response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });
            }
            catch (networkErr) {
                // Network failure — retry on non-final attempt
                if (attempt < MAX_RETRIES) {
                    await sleep(BACKOFF_MS[attempt] ?? 4000);
                    continue;
                }
                const msg = networkErr instanceof Error ? networkErr.message : 'Network error';
                throw new errors_2.ClearChainError(msg, 'NETWORK_ERROR', 0);
            }
            if (response.ok) {
                return response.json();
            }
            // Parse error envelope
            let envelope = {};
            try {
                envelope = await response.json();
            }
            catch { /* ignore parse failures */ }
            const code = envelope?.error?.code ?? 'UNKNOWN';
            const message = envelope?.error?.message ?? response.statusText;
            const status = response.status;
            // 429 — rate limited: wait Retry-After then retry
            if (status === 429) {
                const retryAfterHeader = response.headers.get('Retry-After');
                const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
                if (attempt < MAX_RETRIES) {
                    await sleep(retryAfterSec * 1000);
                    continue;
                }
                throw new errors_2.RateLimitError(message, retryAfterSec);
            }
            // 5xx — server error: exponential backoff then retry
            if (status >= 500) {
                if (attempt < MAX_RETRIES) {
                    await sleep(BACKOFF_MS[attempt] ?? 4000);
                    continue;
                }
                throw new errors_2.ClearChainError(message, code, status);
            }
            // 400 INVALID_ADDRESS — throw immediately (no retry)
            if (status === 400 && code === 'INVALID_ADDRESS') {
                const addr = body.address ?? '';
                throw new errors_2.InvalidAddressError(message, addr);
            }
            // All other 4xx — throw immediately
            throw new errors_2.ClearChainError(message, code, status);
        }
        // Should never reach here (loop always returns or throws)
        throw new errors_2.ClearChainError('Max retries exceeded', 'MAX_RETRIES_EXCEEDED', 0);
    }
}
exports.ClearChainClient = ClearChainClient;
//# sourceMappingURL=index.js.map