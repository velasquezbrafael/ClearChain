/**
 * ClearChain — Shared TypeScript Types
 *
 * These types form the contract between all layers of the analysis pipeline:
 * data ingestion (Etherscan), sanctions screening (OFAC), risk scoring,
 * typology matching, and the AI narrative/SAR generator.
 *
 * Design note: Every type is built for explainability. A compliance analyst
 * reading a WalletAnalysis object should understand not just the score, but
 * WHY each signal fired — in plain English.
 */

// ---------------------------------------------------------------------------
// Transaction Layer
// ---------------------------------------------------------------------------

/**
 * A normalized representation of a single on-chain transaction.
 * Covers both native ETH transfers and ERC-20 token transfers.
 */
export interface WalletTransaction {
  /** Transaction hash — unique chain identifier */
  hash: string;
  /** Sender address (lowercase, checksummed) */
  from: string;
  /** Recipient address (lowercase, checksummed) */
  to: string;
  /**
   * Value transferred, expressed in ETH (not wei).
   * For ERC-20 transfers this is the token amount adjusted for decimals.
   */
  value: number;
  /** Unix epoch timestamp (seconds) of the block this tx was mined in */
  timestamp: number;
  /** For ERC-20 transfers: the token ticker, e.g. "USDC", "USDT" */
  tokenSymbol?: string;
  /** For ERC-20 transfers: the token contract address */
  tokenAddress?: string;
  /** Block number — useful for ordering and hop analysis */
  blockNumber: number;
  /** Whether this is an inbound tx relative to the wallet being analyzed */
  isInbound?: boolean;
}

// ---------------------------------------------------------------------------
// OFAC / Sanctions Layer
// ---------------------------------------------------------------------------

/**
 * Result of an OFAC SDN list check for a single wallet address.
 * A matched: true result with confidence >= 0.9 should be treated as a
 * hard block in any production compliance workflow.
 */
export interface OFACResult {
  /** True if the address was found on the OFAC SDN list */
  matched: boolean;
  /** The name of the sanctioned entity if matched, e.g. "LAZARUS GROUP" */
  matchedEntity?: string;
  /**
   * Match confidence 0–1.
   * 1.0 = exact address match in SDN list.
   * < 1.0 reserved for future fuzzy/cluster matching.
   */
  confidence: number;
  /** ISO timestamp of when the SDN list was last fetched/cached */
  listLastFetched?: string;
}

// ---------------------------------------------------------------------------
// Risk Scoring Layer
// ---------------------------------------------------------------------------

/**
 * A single evaluated risk signal.
 * Every signal that contributes to the final score must produce one of these —
 * no black-box scoring. The detail field is what gets surfaced to analysts.
 */
export interface ScoringSignal {
  /** Machine-readable signal identifier, e.g. "ofac_match", "mixer_interaction" */
  name: string;
  /** Maximum points this signal can contribute to the total score */
  weight: number;
  /** Whether this signal fired (true = risk factor present) */
  triggered: boolean;
  /** Actual points added to the total score (0 if not triggered) */
  score: number;
  /**
   * Human-readable explanation of why the signal triggered (or didn't).
   * Written for a compliance analyst, not an engineer.
   * Example: "3 outgoing transactions to Tornado Cash router within 6 hours."
   */
  detail: string;
}

/**
 * Qualitative risk band derived from the numeric total score.
 * Aligned with common AML triage classifications.
 *
 * LOW:      0–24   — Routine monitoring
 * MEDIUM:   25–49  — Enhanced due diligence warranted
 * HIGH:     50–74  — Strong indicators; escalate to AML team
 * CRITICAL: 75–100 — Immediate SAR consideration; possible OFAC nexus
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * The complete risk score output for a wallet analysis.
 * total is the sum of all triggered signal scores (capped at 100).
 */
export interface RiskScore {
  /** Aggregate score 0–100 */
  total: number;
  /** Qualitative risk band */
  level: RiskLevel;
  /**
   * All evaluated signals keyed by signal name — both triggered and clean,
   * for full transparency.
   * e.g. { "ofac_match": { triggered: true, score: 40, ... }, ... }
   */
  signals: Record<string, ScoringSignal>;
}

// ---------------------------------------------------------------------------
// AML Typology Layer
// ---------------------------------------------------------------------------

/**
 * A matched (or evaluated) AML typology from the FATF/FinCEN typology library.
 *
 * Typologies go beyond a risk score — they name the specific money laundering
 * pattern detected and cite the regulatory guidance that defines it. This is
 * the language compliance analysts, examiners, and SAR narratives use.
 */
export interface AMLTypology {
  /** Unique typology identifier matching data/typologies.json */
  id: string;
  /** Human-readable typology name, e.g. "Mixer/Tumbler Obfuscation" */
  name: string;
  /** Short description of the typology and its AML significance */
  description: string;
  /** Citation to the FATF or FinCEN guidance document that defines this pattern */
  fatfReference: string;
  /** Whether this typology was detected in the analyzed wallet */
  triggered: boolean;
  /**
   * Detection confidence 0–1.
   * 1.0 = definitive match (e.g., direct interaction with known mixer contract).
   * < 0.5 = circumstantial indicators only.
   */
  confidence: number;
  /**
   * Free-text rationale explaining what specific on-chain evidence triggered
   * this typology. Written for inclusion in a SAR narrative.
   * Example: "Wallet sent 2.5 ETH to Tornado Cash router 0x722...6967 on
   *           2024-03-15, consistent with mixer-based layering."
   */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Top-Level Analysis Output
// ---------------------------------------------------------------------------

/**
 * The complete output of a ClearChain wallet analysis.
 * This is the canonical data structure passed to the AI narrative generator,
 * SAR drafter, and front-end risk dashboard.
 */
export interface WalletAnalysis {
  /** The Ethereum address that was analyzed (checksummed, lowercase) */
  address: string;
  /** Blockchain analyzed */
  chain: 'ETH' | 'BTC' | 'TRX';
  /** Computed risk score with full signal breakdown */
  riskScore: RiskScore;
  /** All evaluated AML typologies (triggered and clean) */
  typologies: AMLTypology[];
  /** Full transaction history used as the basis for analysis */
  transactions: WalletTransaction[];
  /** OFAC SDN screening result */
  ofacResult: OFACResult;
  /** ISO 8601 timestamp of when this analysis was run */
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// API Layer Types
// ---------------------------------------------------------------------------

/** Request shape for the /api/analyze endpoint */
export interface AnalyzeRequest {
  address: string;
}

/** Success response from /api/analyze */
export interface AnalyzeResponse {
  success: true;
  data: WalletAnalysis;
}

/** Error response from any API route */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Community Label Types (Supabase)
// ---------------------------------------------------------------------------

/**
 * A community-contributed label for a known wallet address.
 * Examples: "Binance Hot Wallet 7", "Ronin Bridge Exploiter", "Rug pull deployer"
 */
export interface CommunityLabel {
  address: string;
  label: string;
  category: 'exchange' | 'mixer' | 'scam' | 'exploit' | 'defi' | 'other';
  /** Risk flag — true if this label indicates elevated risk */
  isRedFlag: boolean;
  /** ISO timestamp when this label was submitted */
  submittedAt: string;
  /** Number of community confirmations */
  confirmations: number;
}
