"""
ClearChain SDK — Error Classes
"""

from __future__ import annotations


class ClearChainError(Exception):
    """Base error for all ClearChain API errors."""

    def __init__(self, message: str, code: str, status: int) -> None:
        super().__init__(message)
        self.message = message
        #: Machine-readable error code from the API (e.g. "ANALYSIS_FAILED").
        self.code = code
        #: HTTP status code. 0 if no response was received.
        self.status = status

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code!r}, status={self.status}, message={self.message!r})"


class RateLimitError(ClearChainError):
    """Raised when the API returns 429 Too Many Requests.

    The SDK retries automatically. This error is raised only after all
    retry attempts are exhausted.
    """

    def __init__(self, message: str, retry_after: int) -> None:
        super().__init__(message, "RATE_LIMIT_EXCEEDED", 429)
        #: Seconds until the rate limit window resets (from Retry-After header).
        self.retry_after = retry_after


class InvalidAddressError(ClearChainError):
    """Raised when the API returns 400 with code INVALID_ADDRESS."""

    def __init__(self, message: str, address: str) -> None:
        super().__init__(message, "INVALID_ADDRESS", 400)
        #: The address string that failed validation.
        self.address = address
