"""
ClearChain SDK — Python Client

Zero external dependencies. Uses urllib.request only.
Requires Python 3.9+.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from .errors import ClearChainError, InvalidAddressError, RateLimitError
from .models import (
    AnalysisResult,
    BatchResponse,
    BatchResult,
    BatchRateLimitMeta,
    BatchSummary,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://clear-chain-peach.vercel.app"
MAX_RETRIES      = 3
BACKOFF_SECONDS  = [1, 2, 4]


# ---------------------------------------------------------------------------
# ClearChain
# ---------------------------------------------------------------------------

class ClearChain:
    """Synchronous client for the ClearChain AML intelligence API.

    Args:
        api_key:  Your ClearChain API key (format: ck_live_<32 hex chars>).
        base_url: Override the base URL (optional).

    Example::

        from clearchain import ClearChain

        client = ClearChain(api_key="ck_live_your_key_here")

        result = client.analyze("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain="ETH")
        print(result.risk_score)   # 0–100
        print(result.risk_level)   # "LOW"
    """

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL) -> None:
        if not api_key:
            raise ClearChainError("api_key is required", "MISSING_API_KEY", 0)
        self._api_key  = api_key
        self._base_url = base_url.rstrip("/")

    # ── Public API ─────────────────────────────────────────────────────────────

    def analyze(self, address: str, chain: str = "ETH") -> AnalysisResult:
        """Analyze a single wallet address.

        Args:
            address: Wallet address or ENS name (ETH only).
            chain:   "ETH" | "BTC" | "TRX". Defaults to "ETH".

        Returns:
            AnalysisResult with risk score, OFAC screening, typologies,
            AI narrative, and SAR draft.

        Raises:
            InvalidAddressError: Address format is invalid for the given chain.
            RateLimitError:      Daily quota exceeded after all retries.
            ClearChainError:     Any other API or network error.
        """
        resp = self._post("/api/v1/analyze", {"address": address, "chain": chain})
        return self._parse_analysis(resp["data"])

    def batch(self, addresses: list[dict[str, Any]]) -> BatchResponse:
        """Screen up to 100 wallet addresses in a single request.

        Args:
            addresses: List of dicts with keys "address" (required) and
                       "chain" (optional, defaults to "ETH").

        Returns:
            BatchResponse with per-address results sorted by risk_score DESC,
            a risk summary, and rate limit metadata.

        Raises:
            RateLimitError:  Insufficient quota for the full batch after retries.
            ClearChainError: Any other API or network error.

        Example::

            result = client.batch([
                {"address": "0xd882...44b", "chain": "ETH"},
                {"address": "1A1zP...5n",   "chain": "BTC"},
            ])
            for r in result.results:
                print(r.address, r.risk_level, r.risk_score)
        """
        resp = self._post("/api/v1/batch", {"addresses": addresses})
        return self._parse_batch(resp)

    # ── Parsing ────────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_analysis(data: dict[str, Any]) -> AnalysisResult:
        risk   = data.get("riskScore") or {}
        ofac   = data.get("ofacResult") or {}
        sigs   = risk.get("signals") or {}

        # Mixer: check common signal names across chains
        mixer: bool | None = None
        for key in ("mixer_interaction", "mixer_usage", "coinjoin_usage"):
            sig = sigs.get(key)
            if sig is not None:
                mixer = bool(sig.get("triggered"))
                break

        typologies = [
            t["name"]
            for t in (data.get("typologies") or [])
            if t.get("triggered")
        ]

        return AnalysisResult(
            address=data.get("address", ""),
            chain=data.get("chain", "ETH"),
            risk_score=risk.get("total"),
            risk_level=risk.get("level"),
            ofac_match=ofac.get("matched"),
            mixer_interaction=mixer,
            typologies=typologies,
            narrative=data.get("narrative", ""),
            sar_draft=data.get("sarDraft", ""),
            resolved_address=data.get("resolvedAddress", data.get("address", "")),
            analyzed_at=data.get("analyzedAt", ""),
        )

    @staticmethod
    def _parse_batch(resp: dict[str, Any]) -> BatchResponse:
        data    = resp.get("data") or {}
        meta    = resp.get("meta") or {}
        rl      = meta.get("rate_limit") or {}
        summary = data.get("summary") or {}

        results = [
            BatchResult(
                address=r.get("address", ""),
                chain=r.get("chain", "ETH"),
                risk_score=r.get("risk_score"),
                risk_level=r.get("risk_level"),
                ofac_match=r.get("ofac_match"),
                mixer_interaction=r.get("mixer_interaction"),
                top_signal=r.get("top_signal"),
                typologies=r.get("typologies"),
                error=r.get("error"),
            )
            for r in (data.get("results") or [])
        ]

        return BatchResponse(
            total=data.get("total", 0),
            processed=data.get("processed", 0),
            failed=data.get("failed", 0),
            results=results,
            summary=BatchSummary(
                critical=summary.get("critical", 0),
                high=summary.get("high", 0),
                medium=summary.get("medium", 0),
                low=summary.get("low", 0),
                clean=summary.get("clean", 0),
            ),
            rate_limit=BatchRateLimitMeta(
                limit=rl.get("limit"),
                remaining=rl.get("remaining"),
                reset_at=rl.get("reset_at", ""),
            ),
        )

    # ── Internal: POST with retry ──────────────────────────────────────────────

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        url     = f"{self._base_url}{path}"
        payload = json.dumps(body).encode("utf-8")

        for attempt in range(MAX_RETRIES + 1):
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization":  f"Bearer {self._api_key}",
                    "Content-Type":   "application/json",
                    "Accept":         "application/json",
                },
                method="POST",
            )

            try:
                with urllib.request.urlopen(req) as resp:
                    raw: dict[str, Any] = json.loads(resp.read().decode("utf-8"))
                    if not raw.get("success"):
                        err = raw.get("error") or {}
                        raise ClearChainError(
                            err.get("message", "Unknown error"),
                            err.get("code", "UNKNOWN"),
                            resp.status,
                        )
                    return raw

            except urllib.error.HTTPError as exc:
                status = exc.code
                try:
                    err_body: dict[str, Any] = json.loads(exc.read().decode("utf-8"))
                    err_info = err_body.get("error") or {}
                except Exception:
                    err_info = {}

                code    = str(err_info.get("code") or "UNKNOWN")
                message = str(err_info.get("message") or str(exc))

                # 429 — rate limited
                if status == 429:
                    retry_after_header = exc.headers.get("Retry-After", "")
                    try:
                        retry_after = int(retry_after_header)
                    except (ValueError, TypeError):
                        retry_after = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]

                    if attempt < MAX_RETRIES:
                        time.sleep(retry_after)
                        continue
                    raise RateLimitError(message, retry_after)

                # 5xx — server error
                if status >= 500:
                    if attempt < MAX_RETRIES:
                        time.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
                        continue
                    raise ClearChainError(message, code, status)

                # 400 INVALID_ADDRESS
                if status == 400 and code == "INVALID_ADDRESS":
                    addr = str(body.get("address") or "")
                    raise InvalidAddressError(message, addr)

                # All other 4xx — raise immediately
                raise ClearChainError(message, code, status)

            except urllib.error.URLError as exc:
                # Network failure
                if attempt < MAX_RETRIES:
                    time.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
                    continue
                raise ClearChainError(str(exc.reason), "NETWORK_ERROR", 0) from exc

        # Should never reach here
        raise ClearChainError("Max retries exceeded", "MAX_RETRIES_EXCEEDED", 0)
