"""
ClearChain SDK — Data Models

Dataclasses representing API response shapes.
Field names use snake_case (Python convention).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Analyze result
# ---------------------------------------------------------------------------

@dataclass
class AnalysisResult:
    """Full result from ClearChain.analyze()."""

    #: Wallet address as submitted.
    address: str
    #: Blockchain analyzed: "ETH", "BTC", or "TRX".
    chain: str
    #: Aggregate risk score 0–100. None if unavailable.
    risk_score: Optional[int]
    #: Risk band: "LOW", "MEDIUM", "HIGH", or "CRITICAL". None if unavailable.
    risk_level: Optional[str]
    #: Whether the address appears on the OFAC SDN list.
    ofac_match: Optional[bool]
    #: Whether a mixer or CoinJoin interaction was detected.
    mixer_interaction: Optional[bool]
    #: Triggered AML typology names (e.g. ["Mixer/Tumbler Obfuscation"]).
    typologies: list[str] = field(default_factory=list)
    #: AI-generated plain-English risk narrative.
    narrative: str = ""
    #: FinCEN SAR-ready draft. Requires BSA/AML officer review before filing.
    sar_draft: str = ""
    #: Resolved checksummed address (ENS resolved for ETH).
    resolved_address: str = ""
    #: ISO 8601 timestamp of when the analysis was generated.
    analyzed_at: str = ""


# ---------------------------------------------------------------------------
# Batch result
# ---------------------------------------------------------------------------

@dataclass
class BatchResult:
    """Per-address result within a batch response."""

    #: Address as submitted.
    address: str
    #: Chain analyzed.
    chain: str
    #: Aggregate risk score 0–100. None if analysis failed.
    risk_score: Optional[int]
    #: Risk band. None if analysis failed.
    risk_level: Optional[str]
    #: OFAC SDN match. None if analysis failed.
    ofac_match: Optional[bool]
    #: Mixer/CoinJoin interaction detected. None if analysis failed.
    mixer_interaction: Optional[bool]
    #: Name of the highest-scoring triggered signal. None if none or failed.
    top_signal: Optional[str]
    #: Triggered AML typology names. None if analysis failed.
    typologies: Optional[list[str]]
    #: Error code if this address failed (e.g. "INVALID_ADDRESS"), otherwise None.
    error: Optional[str]


@dataclass
class BatchSummary:
    """Risk distribution summary across a batch."""

    critical: int
    high: int
    medium: int
    low: int
    #: Addresses with risk_score == 0.
    clean: int


@dataclass
class BatchRateLimitMeta:
    """Rate limit state after a batch request."""

    #: Tier daily limit. None = unlimited (team tier).
    limit: Optional[int]
    #: Remaining calls after this batch. None = unlimited.
    remaining: Optional[int]
    #: ISO timestamp when the current 24h window resets.
    reset_at: str


@dataclass
class BatchResponse:
    """Full result from ClearChain.batch()."""

    #: Total addresses submitted.
    total: int
    #: Addresses successfully analyzed.
    processed: int
    #: Addresses that failed.
    failed: int
    #: Per-address results, sorted by risk_score DESC. Failed addresses last.
    results: list[BatchResult]
    #: Risk distribution across the batch.
    summary: BatchSummary
    #: Rate limit state after this batch.
    rate_limit: BatchRateLimitMeta
