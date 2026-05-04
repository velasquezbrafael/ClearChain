"use strict";
/**
 * ClearChain SDK — Error Classes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidAddressError = exports.RateLimitError = exports.ClearChainError = void 0;
/** Base error for all ClearChain API errors. */
class ClearChainError extends Error {
    constructor(message, code, status) {
        super(message);
        this.name = 'ClearChainError';
        this.code = code;
        this.status = status;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.ClearChainError = ClearChainError;
/** Thrown when the API returns 429 Too Many Requests. */
class RateLimitError extends ClearChainError {
    constructor(message, retryAfter) {
        super(message, 'RATE_LIMIT_EXCEEDED', 429);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.RateLimitError = RateLimitError;
/** Thrown when the API returns 400 with code INVALID_ADDRESS. */
class InvalidAddressError extends ClearChainError {
    constructor(message, address) {
        super(message, 'INVALID_ADDRESS', 400);
        this.name = 'InvalidAddressError';
        this.address = address;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.InvalidAddressError = InvalidAddressError;
//# sourceMappingURL=errors.js.map