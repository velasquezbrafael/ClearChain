"""
clearchain — Official Python SDK for the ClearChain AML intelligence API.

Zero external dependencies. Python 3.9+.

Basic usage::

    from clearchain import ClearChain

    client = ClearChain(api_key="ck_live_your_key_here")

    result = client.analyze("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain="ETH")
    print(result.risk_score)   # 0–100
    print(result.risk_level)   # "LOW"
"""

from .client import ClearChain
from .errors import ClearChainError, InvalidAddressError, RateLimitError
from .models import (
    AnalysisResult,
    BatchResponse,
    BatchResult,
    BatchRateLimitMeta,
    BatchSummary,
)

__version__ = "1.0.0"

__all__ = [
    "ClearChain",
    # Errors
    "ClearChainError",
    "RateLimitError",
    "InvalidAddressError",
    # Models
    "AnalysisResult",
    "BatchResult",
    "BatchSummary",
    "BatchRateLimitMeta",
    "BatchResponse",
]
