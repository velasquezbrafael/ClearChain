/**
 * ClearChain SDK — Error Classes
 */
/** Base error for all ClearChain API errors. */
export declare class ClearChainError extends Error {
    /** Machine-readable error code from the API (e.g. "ANALYSIS_FAILED"). */
    readonly code: string;
    /** HTTP status code. 0 if no response was received. */
    readonly status: number;
    constructor(message: string, code: string, status: number);
}
/** Thrown when the API returns 429 Too Many Requests. */
export declare class RateLimitError extends ClearChainError {
    /** Seconds until the rate limit window resets (from Retry-After header). */
    readonly retryAfter: number;
    constructor(message: string, retryAfter: number);
}
/** Thrown when the API returns 400 with code INVALID_ADDRESS. */
export declare class InvalidAddressError extends ClearChainError {
    /** The address string that failed validation. */
    readonly address: string;
    constructor(message: string, address: string);
}
//# sourceMappingURL=errors.d.ts.map