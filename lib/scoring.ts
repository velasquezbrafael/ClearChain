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
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b', // Blender.io — OFAC SDN designated mixer
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

/** 24 hours in seconds — sliding window for multi-hop layering detection */
const RAPID_HOP_WINDOW_SECONDS = 24 * 60 * 60;

/** Minimum number of qualifying hops to trigger the signal */
const RAPID_HOP_MIN_COUNT = 3;

/**
 * Maximum time between an inbound tx and its paired outbound for the layering
 * ratio check. Funds that sat for >6 hours before being forwarded are less
 * likely to be same-session layering.
 */
const HOP_PAIR_MAX_GAP_SECONDS = 6 * 3600;

/** Outbound must move at least this fraction of the paired inbound value */
const HOP_RATIO_MIN = 0.8;

/**
 * Upper bound on outbound/inbound ratio. Prevents tiny dust inbound txs from
 * "matching" a large outbound (e.g. receive 0.001 ETH dust, send 10 ETH).
 * If the outbound is more than 2× the inbound it's not a hop pair.
 */
const HOP_RATIO_MAX = 2.0;

/** Fallback: tighter 3-hour window when no clear inbound/outbound pairs exist */
const FALLBACK_WINDOW_SECONDS = 3 * 3600;

/** Fallback: rapid outbounds must represent this fraction of total volume */
const FALLBACK_VOLUME_THRESHOLD = 0.5;

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
 * Detects genuine layering — not just high transaction volume. Three gates:
 *
 * PRIMARY: 3+ outbound transactions within 24 hours where each outbound moves
 * ≥80% of the ETH received in the immediately preceding inbound transaction
 * (capped at 2× to exclude dust-inbound false positives). This mirrors the
 * wire-stripping layering pattern described in FATF guidance.
 *
 * FALLBACK: When no clear inbound/outbound pairs exist, requires a stricter
 * 3-hour window AND the rapid outbounds must represent >50% of total analyzed
 * volume — ruling out high-volume legitimate wallets like grant distributors.
 *
 * DIVERSITY GATE: Applied after primary or fallback passes. Real layering uses
 * a small ring of intermediaries. If the wallet has >30 unique counterparties
 * overall AND the hop cluster targets >5 different recipients, this is
 * redistribution behavior (charitable grants, protocol distributions), not
 * layering. Both conditions must be true to suppress — TC routes to a small
 * set of fixed pool contracts, so it is not affected by this gate.
 */
function evaluateRapidHopSignal(
  transactions: WalletTransaction[],
  ofacResult: OFACResult,
  mixerSignalTriggered: boolean,
): ScoringSignal {
  // Contextual gate: rapid movement is only meaningful alongside OFAC exposure
  // or mixer interaction. Alone it is consistent with normal high-frequency
  // wallet behavior and would produce false positives on active legitimate wallets.
  if (!ofacResult.matched && !mixerSignalTriggered) {
    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: false,
      score: 0,
      detail:
        'No rapid layering pattern detected in isolation. Signal requires corroborating ' +
        'OFAC or mixer exposure to be indicative of AML risk.',
    };
  }

  const sorted   = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const outbound = sorted.filter(tx => !tx.isInbound);
  const inbound  = sorted.filter(tx => tx.isInbound);

  if (outbound.length < RAPID_HOP_MIN_COUNT) {
    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: false,
      score: 0,
      detail: `Insufficient outbound transactions for rapid hop analysis (${outbound.length} found, ${RAPID_HOP_MIN_COUNT} required).`,
    };
  }

  // ── PRIMARY CHECK ────────────────────────────────────────────────────────
  // For each outbound tx, find the most recent inbound within HOP_PAIR_MAX_GAP.
  // A qualifying "layering hop" requires both a ratio >= 0.8 (forwarded most of
  // what was received) and <= 2.0 (prevents dust inbound from matching a large
  // unrelated outbound).

  function findPrecedingInbound(outboundTx: WalletTransaction): WalletTransaction | null {
    let best: WalletTransaction | null = null;
    for (const inboundTx of inbound) {
      const gap = outboundTx.timestamp - inboundTx.timestamp;
      if (gap >= 0 && gap <= HOP_PAIR_MAX_GAP_SECONDS) {
        if (!best || inboundTx.timestamp > best.timestamp) {
          best = inboundTx;
        }
      }
    }
    return best;
  }

  const taggedOutbound = outbound.map(tx => {
    const paired = findPrecedingInbound(tx);
    if (!paired || paired.value === 0) return { tx, isLayeringHop: false, ratio: null as number | null };
    const ratio = tx.value / paired.value;
    return {
      tx,
      isLayeringHop: ratio >= HOP_RATIO_MIN && ratio <= HOP_RATIO_MAX,
      ratio,
    };
  });

  // Pre-compute counterparty diversity once — used by the diversity gate below
  const uniqueCounterparties = new Set(
    transactions.map(tx => tx.isInbound ? tx.from.toLowerCase() : tx.to.toLowerCase())
  ).size;

  // ── SLIDING WINDOW (primary) ─────────────────────────────────────────────
  // Track the actual transactions in the best window so the diversity gate
  // can inspect their recipients.
  let maxLayeringHops  = 0;
  let layeringWindowStart = 0;
  let layeringWindowEnd   = 0;
  let bestLayeringTxs: WalletTransaction[] = [];

  for (let i = 0; i < taggedOutbound.length; i++) {
    if (!taggedOutbound[i].isLayeringHop) continue;
    let count = 1;
    let lastIdx = i;
    const windowTxs: WalletTransaction[] = [taggedOutbound[i].tx];
    for (let j = i + 1; j < taggedOutbound.length; j++) {
      const span = taggedOutbound[j].tx.timestamp - taggedOutbound[i].tx.timestamp;
      if (span > RAPID_HOP_WINDOW_SECONDS) break;
      if (taggedOutbound[j].isLayeringHop) { count++; lastIdx = j; windowTxs.push(taggedOutbound[j].tx); }
    }
    if (count > maxLayeringHops) {
      maxLayeringHops     = count;
      layeringWindowStart = taggedOutbound[i].tx.timestamp;
      layeringWindowEnd   = taggedOutbound[lastIdx].tx.timestamp;
      bestLayeringTxs     = windowTxs;
    }
  }

  if (maxLayeringHops >= RAPID_HOP_MIN_COUNT) {
    // ── DIVERSITY GATE ───────────────────────────────────────────────────
    const hopRecipients = new Set(bestLayeringTxs.map(tx => tx.to.toLowerCase())).size;
    if (uniqueCounterparties > 30 && hopRecipients > 5) {
      return {
        name: 'rapid_fund_movement',
        weight: 15,
        triggered: false,
        score: 0,
        detail:
          `High counterparty diversity (${uniqueCounterparties} unique counterparties overall, ` +
          `${hopRecipients} unique recipients in hop cluster) — consistent with redistribution ` +
          'or donation behavior rather than layering. Gate: >30 counterparties AND >5 hop recipients.',
      };
    }

    const hours = Math.max(1, Math.round((layeringWindowEnd - layeringWindowStart) / 3600));
    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: true,
      score: 15,
      detail:
        `${maxLayeringHops} layering hops detected within ${hours} hour(s): ` +
        'each outbound moved ≥80% of the ETH received in the immediately preceding inbound. ' +
        'Consistent with wire-stripping layering techniques. ' +
        'Per FATF Report on Virtual Assets (2021), this is a recognised red flag indicator.',
    };
  }

  // ── FALLBACK CHECK ───────────────────────────────────────────────────────
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.value, 0);
  let fallbackHops   = 0;
  let fallbackVolume = 0;
  let fallbackTxs: WalletTransaction[] = [];

  for (let i = 0; i < outbound.length; i++) {
    let count = 0;
    let vol   = 0;
    const windowTxs: WalletTransaction[] = [];
    for (let j = i; j < outbound.length; j++) {
      if (outbound[j].timestamp - outbound[i].timestamp <= FALLBACK_WINDOW_SECONDS) {
        count++;
        vol += outbound[j].value;
        windowTxs.push(outbound[j]);
      } else {
        break;
      }
    }
    if (count >= RAPID_HOP_MIN_COUNT && vol > fallbackVolume) {
      fallbackHops   = count;
      fallbackVolume = vol;
      fallbackTxs    = windowTxs;
    }
  }

  const volumeFraction = totalVolume > 0 ? fallbackVolume / totalVolume : 0;
  const fallbackTriggered =
    fallbackHops >= RAPID_HOP_MIN_COUNT && volumeFraction >= FALLBACK_VOLUME_THRESHOLD;

  if (fallbackTriggered) {
    // ── DIVERSITY GATE (fallback) ────────────────────────────────────────
    const hopRecipients = new Set(fallbackTxs.map(tx => tx.to.toLowerCase())).size;
    if (uniqueCounterparties > 30 && hopRecipients > 5) {
      return {
        name: 'rapid_fund_movement',
        weight: 15,
        triggered: false,
        score: 0,
        detail:
          `High counterparty diversity (${uniqueCounterparties} unique counterparties, ` +
          `${hopRecipients} unique hop recipients) — consistent with redistribution behavior rather than layering.`,
      };
    }

    return {
      name: 'rapid_fund_movement',
      weight: 15,
      triggered: true,
      score: 15,
      detail:
        `${fallbackHops} outbound transactions within 3 hours representing ` +
        `${Math.round(volumeFraction * 100)}% of total analyzed volume. ` +
        'High-velocity fund concentration without clear business rationale — ' +
        'consistent with rapid layering activity.',
    };
  }

  // Clean — build a descriptive detail for the analyst
  const layeringHopCount = taggedOutbound.filter(t => t.isLayeringHop).length;
  return {
    name: 'rapid_fund_movement',
    weight: 15,
    triggered: false,
    score: 0,
    detail:
      `No layering pattern detected. ` +
      `Primary check: ${layeringHopCount} outbound transaction(s) met the ≥80% forwarding ratio ` +
      `(${RAPID_HOP_MIN_COUNT} consecutive required). ` +
      `Fallback: largest 3-hour outbound window = ${Math.round(volumeFraction * 100)}% of total volume ` +
      `(threshold: ${Math.round(FALLBACK_VOLUME_THRESHOLD * 100)}%).`,
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

  // Evaluate OFAC and mixer first — rapid movement gate depends on them
  const ofacSignal    = evaluateOFACSignal(ofacResult);
  const mixerSignal   = evaluateMixerSignal(transactions, address);
  const rapidSignal   = evaluateRapidHopSignal(transactions, ofacResult, mixerSignal.triggered);

  const signalList: ScoringSignal[] = [
    ofacSignal,
    mixerSignal,
    rapidSignal,
    evaluateCounterpartySignal(transactions),
    evaluateVolumeAnomalySignal(transactions),
    evaluateCommunityFlagsSignal(communityFlags),
  ];

  // Sum triggered scores, cap at 100
  const rawTotal = signalList.reduce((sum, signal) => sum + signal.score, 0);
  const total = Math.min(100, rawTotal);

  // Convert to dict keyed by signal name
  const signals: Record<string, ScoringSignal> = Object.fromEntries(
    signalList.map(s => [s.name, s])
  );

  return {
    total,
    level: getRiskLevel(total),
    signals,
  };
}
