/**
 * ClearChain SDK — Error Classes
 */

/** Base error for all ClearChain API errors. */
export class ClearChainError extends Error {
  /** Machine-readable error code from the API (e.g. "ANALYSIS_FAILED"). */
  readonly code: string
  /** HTTP status code. 0 if no response was received. */
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name    = 'ClearChainError'
    this.code    = code
    this.status  = status
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Thrown when the API returns 429 Too Many Requests. */
export class RateLimitError extends ClearChainError {
  /** Seconds until the rate limit window resets (from Retry-After header). */
  readonly retryAfter: number

  constructor(message: string, retryAfter: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429)
    this.name       = 'RateLimitError'
    this.retryAfter = retryAfter
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Thrown when the API returns 400 with code INVALID_ADDRESS. */
export class InvalidAddressError extends ClearChainError {
  /** The address string that failed validation. */
  readonly address: string

  constructor(message: string, address: string) {
    super(message, 'INVALID_ADDRESS', 400)
    this.name    = 'InvalidAddressError'
    this.address = address
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
