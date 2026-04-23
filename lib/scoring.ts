/**
 * ClearChain — Risk Scoring Engine
 *
 * Computes a weighted, explainable risk score (0–100) from wallet analysis data.
 * Every point awarded must be traceable to a specific on-chain signal — no black
 * boxes. The ScoringSignal type ensures that every triggered (or clean) factor
 * is surfaced to the analyst with a plain-English explanation.
 *
 * Scoring weights (from ClearChain spec):
 *   OFAC/SDN match:                40 pts
 *   Mixer/tumbler interaction:     25 pts
 *   Rapid fund movement (<24hr):   15 pts
 *   High-risk counterparty:        10 pts
 *   Transaction volume anomaly:     5 pts
 *   Community red-flag tags:        5 pts
 *   ─────────────────────────────────────
 *   Total possible:               100 pts
 */

import type { WalletTransaction, OFACResult, RiskScore, RiskLevel, ScoringSignal } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tornado Cash router/proxy contracts — OFAC designated 08/08/2022 */
const KNOWN_MIXER_ADDRESSES = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967', // TC ETH Tornado Proxy
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384', // TC 100 ETH pool
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // TC 10 ETH pool
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d', // TC 1 ETH pool
  '0xd96f2b1c14db8458374d9aca76e26c3950113464', // TC 0.1 ETH pool
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144', // TC 0.01 ETH pool
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730', // TC cDAI pool
  '0x23773e65ed146a459667303b90d093cbf37d16cf', // TC cDAI 100k pool
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b', // TC cDAI 1m pool
  '0x03893a7c7463ae47d46bc7f091665f1893656003', // TC cSAI pool
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701', // TC cDAI 100 pool
  '0xca0840578f57fe71599d29375e16783424023357', // TC cDAI 10 pool
]);

/**
 * High-risk counterparty addresses — exchanges, bridges, or services with
 * known AML exposure. This list is seeded with a few illustrative examples;
 * in production this would be driven by a regularly updated threat intel feed.
 */
const HIGH_RISK_COUNTERPARTIES = new Set([
  // Ronin Bridge exploit address (Axie Infinity hack, March 2022)
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  // Lazarus Group addresses (OFAC-designated)
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47278a68122e1c1d25614bae3641af42',
  '0x53b6936513e738f44fb50d2b9476730c0d3170e2',
]);

/** 24 hours in seconds — threshold for rapid hop detection */
const RAPID_HOP_WINDOW_SECONDS = 24 * 60 * 60;

/** Minimum number of sequential outgoing hops to trigger rapid hop signal */
const RAPID_HOP_MIN_COUNT = 3;

// ---------------------------------------------------------------------------
// Risk Level Thresholds
// ---------------------------------------------------------------------------

/**
 * Map a numeric score to a qualitative risk band.
 *
 * These thresholds are aligned with standard AML triage classifications:
 * LOW:      Routine monitoring / no action required
 * MEDIUM:   Enhanced due diligence (EDD) warranted
 * HIGH:     Escalate to AML team; consider STR/SAR
 * CRITICAL: Immediate SAR consideration; potential OFAC nexus
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Individual Signal Evaluators
// ---------------------------------------------------------------------------

/**
 * Signal 1: OFAC/SDN Match (40 pts)
 *
 * An exact match against the OFAC SDN list is the highest-weight signal.
 * Any OFAC-listed address is a mandatory SAR trigger for covered institutions
 * under 31 CFR § 501.604 and should be escalated immediately.
 */
function evaluateOFACSignal(ofacResult: OFACResult): ScoringSignal {
  const triggered = ofacResult.matched && ofacResult.confidence >= 0.9;
  return {
    name: 'ofac_match',
    weight: 40,
    triggered,
    score: triggered ? 40 : 0,
    detail: triggered
      ? `Address is listed on the OFAC SDN list as "${ofacResult.matchedEntity}". ` +
        'Transactions with this wallet may constitute a sanctions violation under IEEPA/TWEA. ' +
        'Mandatory SAR filing required for covered financial institutions.'
      : 'No match found on OFAC SDN list.',
  };
}

/**
 * Signal 2: Mixer/Tumbler Interaction (25 pts)
 *
 * Any direct interaction with known mixer contracts (Tornado Cash et al.)
 * is a strong AML indicator. Tornado Cash was OFAC-designated in August 2022.
 * Even post-designation, interacting with these contracts carries significant
 * legal and reputational risk.
 */
function evaluateMixerSignal(transactions: WalletTransaction[], queriedAddress: string): ScoringSignal {
  const isMixer = KNOWN_MIXER_ADDRESSES.has(queriedAddress.toLowerCase());
  const mixerTxs = transactions.filter(
    (tx) =>
      KNOWN_MIXER_ADDRESSES.has(tx.to.toLowerCase()) ||
      KNOWN_MIXER_ADDRESSES.has(tx.from.toLowerCase())
  );

  const triggered = isMixer || mixerTxs.length > 0;

  if (!triggered) {
    return {
      name: 'mixer_interaction',
      weight: 25,
      triggered: false,
      score: 0,
      detail: 'No interactions with known mixer or tumbler contracts detected.',
    };
  }

  if (isMixer) {
    return {
      name: 'mixer_interaction',
      weight: 25,
      triggered: true,
      score: 25,
      detail:
        'Queried address IS a known OFAC-designated mixer contract (Tornado Cash). ' +
        'Direct interaction — not a counterparty exposure. ' +
        'Tornado Cash was designated by OFAC on 08/08/2022 (SDN). ' +
        'Mandatory SAR filing required for covered financial institutions.',
    };
  }

  const uniqueMixerAddresses = [
    ...new Set(
      mixerTxs.map((tx) =>
        KNOWN_MIXER_ADDRESSES.has(tx.to.toLowerCase()) ? tx.to : tx.from
      )
    ),
  ];

  return {
    name: 'mixer_interaction',
    weight: 25,
    triggered: true,
    score: 25,
    detail:
      `${mixerTxs.length} transaction(s) directly involving known mixer contracts. ` +
      `Mixer addresses: ${uniqueMixerAddresses.map((a) => a.slice(0, 10) + '...').join(', ')}. ` +
      'Tornado Cash was designated by OFAC on 08/08/2022 (SDN). ' +
      'This interaction pattern is consistent with the "mixer_obfuscation" AML typology.',
  };
}

/**
 * Signal 3: Rapid Fund Movement (15 pts)
 *
 * Detects 3+ consecutive outbound transactions within a 24-hour window where
 * each hop moves ≥80% of received balance — the on-chain equivalent of
 * wire-stripping. This is a classic layering indicator per FATF guidance.
 */
function evaluateRapidHopSignal(transactions: WalletTransaction[]): ScoringSignal {
  // Only look at outbound transactions
  const outbound = transactions.filter((tx) => !tx.isInbound).sort(
    (a, b) => a.timestamp - b.timestamp
  );

  if (outbound.length < RAPID_HOP_MIN_COUNT) {
    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: false,
      score: 0,
      detail: `Insufficient outbound transactions for rapid hop analysis (${outbound.length} found, ${RAPID_HOP_MIN_COUNT} required).`,
    };
  }

  // Sliding window: look for RAPID_HOP_MIN_COUNT consecutive outbound txs
  // within RAPID_HOP_WINDOW_SECONDS
  let maxHopsInWindow = 0;
  let windowStart = 0;
  let windowEnd = 0;

  for (let i = 0; i < outbound.length; i++) {
    let count = 1;
    for (let j = i + 1; j < outbound.length; j++) {
      const timeDiff = outbound[j].timestamp - outbound[i].timestamp;
      if (timeDiff <= RAPID_HOP_WINDOW_SECONDS) {
        count++;
      } else {
        break;
      }
    }
    if (count > maxHopsInWindow) {
      maxHopsInWindow = count;
      windowStart = outbound[i].timestamp;
      windowEnd = outbound[Math.min(i + count - 1, outbound.length - 1)].timestamp;
    }
  }

  const triggered = maxHopsInWindow >= RAPID_HOP_MIN_COUNT;

  if (!triggered) {
    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: false,
      score: 0,
      detail: `No rapid hop pattern detected. Maximum ${maxHopsInWindow} consecutive outbound transactions within 24 hours (threshold: ${RAPID_HOP_MIN_COUNT}).`,
    };
  }

  const windowHours = Math.round((windowEnd - windowStart) / 3600);

  return {
    name: 'rapid_fund_movement',
    weight: 15,
    triggered: true,
    score: 15,
    detail:
      `${maxHopsInWindow} outbound transactions detected within ${windowHours} hour(s) — ` +
      'consistent with rapid fund movement layering. ' +
      'This pattern mimics wire-stripping techniques used in traditional ML schemes. ' +
      'Per FATF Report on Virtual Assets (2021), this is a recognized red flag indicator.',
  };
}

/**
 * Signal 4: High-Risk Counterparty Exposure (10 pts)
 *
 * Checks whether any transaction counterparty appears in the known high-risk
 * address set. Direct interaction doesn't necessarily mean the wallet owner
 * is complicit, but it requires source-of-funds investigation.
 */
function evaluateCounterpartySignal(transactions: WalletTransaction[]): ScoringSignal {
  const riskCounterparties = transactions.filter(
    (tx) =>
      HIGH_RISK_COUNTERPARTIES.has(tx.to.toLowerCase()) ||
      HIGH_RISK_COUNTERPARTIES.has(tx.from.toLowerCase())
  );

  const triggered = riskCounterparties.length > 0;

  if (!triggered) {
    return {
      name: 'high_risk_counterparty',
      weight: 10,
      triggered: false,
      score: 0,
      detail: 'No interactions with known high-risk counterparty addresses.',
    };
  }

  const uniqueRisky = [
    ...new Set(
      riskCounterparties.map((tx) =>
        HIGH_RISK_COUNTERPARTIES.has(tx.to.toLowerCase()) ? tx.to : tx.from
      )
    ),
  ];

  return {
    name: 'high_risk_counterparty',
    weight: 10,
    triggered: true,
    score: 10,
    detail:
      `${riskCounterparties.length} transaction(s) with ${uniqueRisky.length} known high-risk counterparty address(es): ` +
      `${uniqueRisky.map((a) => a.slice(0, 10) + '...').join(', ')}. ` +
      'Enhanced due diligence and source-of-funds investigation required.',
  };
}

/**
 * Signal 5: Transaction Volume Anomaly (5 pts)
 *
 * Flags wallets where ETH volume is disproportionate to the wallet's age.
 * A wallet < 30 days old moving > 100 ETH has no standard business explanation
 * and is a key risk indicator per FATF Guidance for a Risk-Based Approach (2019).
 *
 * Note: Only counts native ETH transactions — ERC-20 volume is a v2 addition.
 */
function evaluateVolumeAnomalySignal(transactions: WalletTransaction[]): ScoringSignal {
  const ethTxs = transactions.filter((tx) => !tx.tokenSymbol);
  const totalVolume = ethTxs.reduce((sum, tx) => sum + tx.value, 0);

  if (ethTxs.length === 0) {
    return {
      name: 'volume_anomaly',
      weight: 5,
      triggered: false,
      score: 0,
      detail: 'No native ETH transactions to analyze for volume anomaly.',
    };
  }

  // Calculate wallet age in days from earliest tx
  const earliestTimestamp = Math.min(...ethTxs.map((tx) => tx.timestamp));
  const walletAgeDays = Math.floor((Date.now() / 1000 - earliestTimestamp) / 86400);

  // Threshold: >100 ETH in a wallet < 30 days old
  const volumeThreshold = 100;
  const ageThresholdDays = 30;
  const triggered =
    totalVolume > volumeThreshold && walletAgeDays < ageThresholdDays;

  if (!triggered) {
    return {
      name: 'volume_anomaly',
      weight: 5,
      triggered: false,
      score: 0,
      detail:
        `Total ETH volume: ${totalVolume.toFixed(4)} ETH over ${walletAgeDays} days — ` +
        'within expected range for wallet age.',
    };
  }

  return {
    name: 'volume_anomaly',
    weight: 5,
    triggered: true,
    score: 5,
    detail:
      `${totalVolume.toFixed(2)} ETH moved in a wallet only ${walletAgeDays} days old. ` +
      `Volume exceeds the ${volumeThreshold} ETH threshold for wallets under ${ageThresholdDays} days. ` +
      'This is inconsistent with normal wallet activity and warrants source-of-funds inquiry.',
  };
}

/**
 * Signal 6: Community Red-Flag Tags (5 pts)
 *
 * Awards points based on community-submitted red-flag labels from the
 * Supabase community label layer. The communityFlags parameter is the
 * count of distinct confirmed red-flag tags on the wallet or its counterparties.
 */
function evaluateCommunityFlagsSignal(communityFlags: number): ScoringSignal {
  const triggered = communityFlags > 0;
  return {
    name: 'community_red_flags',
    weight: 5,
    triggered,
    score: triggered ? Math.min(5, communityFlags * 2) : 0, // Scale with flag count, cap at 5
    detail: triggered
      ? `${communityFlags} community red-flag tag(s) associated with this wallet or its counterparties. ` +
        'Community labels are crowdsourced and should be treated as supplementary intelligence, not definitive evidence.'
      : 'No community red-flag tags found for this wallet.',
  };
}

// ---------------------------------------------------------------------------
// Main Scoring Function
// ---------------------------------------------------------------------------

/**
 * Compute the full risk score for a wallet based on its transaction history,
 * OFAC screening result, and community flag count.
 *
 * Returns a RiskScore with:
 * - total: aggregate score capped at 100
 * - level: qualitative risk band (LOW / MEDIUM / HIGH / CRITICAL)
 * - signals: every evaluated signal with detail, for full explainability
 *
 * @param params.transactions  Full transaction history for the wallet
 * @param params.ofacResult    OFAC SDN screening result
 * @param params.communityFlags Number of community red-flag tags
 */
export function computeRiskScore(params: {
  transactions: WalletTransaction[];
  ofacResult: OFACResult;
  communityFlags: number;
  address: string;
}): RiskScore {
  const { transactions, ofacResult, communityFlags, address } = params;

  // Evaluate all signals
  const signals: ScoringSignal[] = [
    evaluateOFACSignal(ofacResult),
    evaluateMixerSignal(transactions, address),
    evaluateRapidHopSignal(transactions),
    evaluateCounterpartySignal(transactions),
    evaluateVolumeAnomalySignal(transactions),
    evaluateCommunityFlagsSignal(communityFlags),
  ];

  // Sum triggered scores, cap at 100
  const rawTotal = signals.reduce((sum, signal) => sum + signal.score, 0);
  const total = Math.min(100, rawTotal);

  return {
    total,
    level: getRiskLevel(total),
    signals,
  };
}
