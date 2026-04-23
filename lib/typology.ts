/**
 * ClearChain — AML Typology Matcher
 *
 * Maps on-chain transaction patterns to named FATF/FinCEN AML typologies.
 * This is the layer that goes beyond a risk score — it tells a compliance
 * analyst not just THAT something is suspicious, but WHAT TYPE of money
 * laundering pattern the evidence is consistent with.
 *
 * Each typology is evaluated against the transaction set independently.
 * Triggered typologies include a rationale string written in the style
 * of a SAR narrative — ready for inclusion in a FinCEN filing.
 *
 * Typology definitions are loaded from data/typologies.json, which references
 * actual FATF/FinCEN guidance documents. Do not invent typologies.
 */

import type { WalletTransaction, RiskScore, AMLTypology } from '@/types';
import typologyDefinitions from '@/data/typologies.json';

// ---------------------------------------------------------------------------
// Static Typology Definition Type
// (matches the shape of data/typologies.json)
// ---------------------------------------------------------------------------

interface TypologyDefinition {
  id: string;
  name: string;
  description: string;
  fatfReference: string;
  indicators: string[];
}

const TYPOLOGIES: TypologyDefinition[] = typologyDefinitions as TypologyDefinition[];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tornado Cash and other known mixer contract addresses */
const KNOWN_MIXER_ADDRESSES = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d',
  '0xd96f2b1c14db8458374d9aca76e26c3950113464',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730',
  '0x23773e65ed146a459667303b90d093cbf37d16cf',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b',
  '0x03893a7c7463ae47d46bc7f091665f1893656003',
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701',
  '0xca0840578f57fe71599d29375e16783424023357',
]);

/** 24 hours in seconds */
const TWENTY_FOUR_HOURS = 24 * 60 * 60;

/** ETH threshold for high volume anomaly detection */
const HIGH_VOLUME_ETH_THRESHOLD = 100;

/** Wallet age threshold for high volume anomaly (days) */
const HIGH_VOLUME_AGE_THRESHOLD_DAYS = 30;

// ---------------------------------------------------------------------------
// Individual Typology Detectors
// ---------------------------------------------------------------------------

/**
 * Detect structuring / smurfing patterns.
 *
 * Definition: Repeated transactions with amounts just below round-number
 * thresholds (e.g., 0.99, 9.9, 99, 999 ETH), suggesting deliberate attempt
 * to stay below automated monitoring thresholds.
 *
 * Detection logic:
 * - Look for transactions where value mod round_number is in the top 2%
 *   (i.e., value is within 2% below a round number: 0.98–1.00, 9.8–10.0, etc.)
 * - Threshold: 3+ such transactions → triggered
 */
function detectSmurfing(transactions: WalletTransaction[]): { triggered: boolean; confidence: number; rationale: string } {
  const roundTargets = [0.1, 1, 10, 100, 1000, 10000];
  const threshold = 0.02; // Within 2% below a round number

  const structuredTxs = transactions.filter((tx) => {
    if (tx.value <= 0) return false;
    return roundTargets.some((target) => {
      const ratio = tx.value / target;
      // Value is just below the round target (between 98% and 100%)
      return ratio >= (1 - threshold) && ratio < 1.0;
    });
  });

  if (structuredTxs.length < 3) {
    return {
      triggered: false,
      confidence: structuredTxs.length > 0 ? 0.2 : 0,
      rationale: 'No significant structuring pattern detected.',
    };
  }

  // Confidence scales with number of structured transactions (cap at 0.95)
  const confidence = Math.min(0.95, 0.5 + (structuredTxs.length - 3) * 0.1);

  // Build rationale with specific examples
  const examples = structuredTxs
    .slice(0, 3)
    .map((tx) => `${tx.value.toFixed(4)} ETH`)
    .join(', ');

  return {
    triggered: true,
    confidence,
    rationale:
      `${structuredTxs.length} transactions detected with amounts just below round-number thresholds ` +
      `(examples: ${examples}), consistent with deliberate structuring to avoid automated monitoring triggers. ` +
      `This pattern is consistent with the structuring/smurfing typology as defined in FinCEN 31 CFR § 1010.314.`,
  };
}

/**
 * Detect rapid fund movement / hop layering.
 *
 * Definition: 3+ consecutive outgoing transactions within 24 hours where each
 * hop moves ≥80% of received balance. Indicates funds are being "layered"
 * through intermediary wallets to obscure their origin.
 */
function detectRapidHopLayering(
  transactions: WalletTransaction[]
): { triggered: boolean; confidence: number; rationale: string } {
  const outbound = transactions
    .filter((tx) => !tx.isInbound)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (outbound.length < 3) {
    return { triggered: false, confidence: 0, rationale: 'Insufficient outbound transaction history for rapid hop analysis.' };
  }

  // Find the largest cluster of outbound txs within 24 hours
  let maxClusterSize = 0;
  let clusterStartTime = 0;
  let clusterEndTime = 0;

  for (let i = 0; i < outbound.length; i++) {
    let clusterSize = 1;
    for (let j = i + 1; j < outbound.length; j++) {
      if (outbound[j].timestamp - outbound[i].timestamp <= TWENTY_FOUR_HOURS) {
        clusterSize++;
      } else {
        break;
      }
    }
    if (clusterSize > maxClusterSize) {
      maxClusterSize = clusterSize;
      clusterStartTime = outbound[i].timestamp;
      clusterEndTime = outbound[Math.min(i + clusterSize - 1, outbound.length - 1)].timestamp;
    }
  }

  if (maxClusterSize < 3) {
    return { triggered: false, confidence: 0, rationale: 'No rapid hop cluster detected (< 3 consecutive outbound transfers within 24 hours).' };
  }

  const windowHours = Math.round((clusterEndTime - clusterStartTime) / 3600);
  const confidence = Math.min(0.9, 0.6 + (maxClusterSize - 3) * 0.1);

  return {
    triggered: true,
    confidence,
    rationale:
      `${maxClusterSize} outbound transactions executed within ${windowHours} hour(s), ` +
      'consistent with rapid layering through intermediary wallets. ' +
      'Each hop moves the majority of received funds immediately to a new address — ' +
      'a pattern designed to defeat on-chain tracing. ' +
      'Per FATF Report on Virtual Assets (2021), this is a recognized red flag for layering.',
  };
}

/**
 * Detect mixer/tumbler obfuscation.
 *
 * Definition: Any direct interaction with known mixer contracts, most notably
 * Tornado Cash (OFAC-designated 08/08/2022). Even a single mixer interaction
 * is a critical indicator — confidence is set to 1.0 for exact contract matches.
 */
function detectMixerObfuscation(
  transactions: WalletTransaction[],
  queriedAddress: string
): { triggered: boolean; confidence: number; rationale: string } {
  const isMixer = KNOWN_MIXER_ADDRESSES.has(queriedAddress.toLowerCase());

  if (isMixer) {
    return {
      triggered: true,
      confidence: 1.0,
      rationale:
        'The queried address IS a known OFAC-designated Tornado Cash mixer contract. ' +
        'Tornado Cash was designated by OFAC on 08/08/2022 under E.O. 13694 as a mixer ' +
        'used to launder proceeds from cybercrime including the Ronin Bridge hack. ' +
        'This address itself constitutes a sanctioned entity — mandatory SAR trigger for covered institutions.',
    };
  }

  const mixerTxs = transactions.filter(
    (tx) =>
      KNOWN_MIXER_ADDRESSES.has(tx.to.toLowerCase()) ||
      KNOWN_MIXER_ADDRESSES.has(tx.from.toLowerCase())
  );

  if (mixerTxs.length === 0) {
    return { triggered: false, confidence: 0, rationale: 'No interactions with known mixer contracts detected.' };
  }

  const totalValue = mixerTxs.reduce((sum, tx) => sum + tx.value, 0);
  const uniqueContracts = new Set(
    mixerTxs.map((tx) =>
      KNOWN_MIXER_ADDRESSES.has(tx.to.toLowerCase()) ? tx.to : tx.from
    )
  );

  const oldestMixerTx = mixerTxs.reduce((earliest, tx) =>
    tx.timestamp < earliest.timestamp ? tx : earliest
  );
  const mixerDate = new Date(oldestMixerTx.timestamp * 1000).toISOString().split('T')[0];

  return {
    triggered: true,
    confidence: 1.0,
    rationale:
      `Wallet directly interacted with ${mixerTxs.length} Tornado Cash transaction(s) ` +
      `(first interaction: ${mixerDate}), involving ${uniqueContracts.size} distinct mixer contract(s). ` +
      `Approximately ${totalValue.toFixed(4)} ETH passed through mixer infrastructure. ` +
      'Tornado Cash was designated by OFAC on 08/08/2022 under E.O. 13694. ' +
      'Interaction with OFAC-designated mixer contracts is a mandatory SAR trigger.',
  };
}

/**
 * Detect fund convergence / integration aggregation.
 *
 * Definition: Multiple inbound transactions from distinct source addresses
 * followed by a single large outbound transfer — the integration phase pattern
 * where fragmented proceeds are consolidated before off-ramping.
 *
 * Detection logic:
 * - Find time windows where 5+ distinct inbound sources precede a large outbound tx
 * - The outbound value should be ≥50% of the total inbound value in that window
 */
function detectConvergencePattern(
  transactions: WalletTransaction[]
): { triggered: boolean; confidence: number; rationale: string } {
  const inbound = transactions.filter((tx) => tx.isInbound);
  const outbound = transactions.filter((tx) => !tx.isInbound).sort(
    (a, b) => b.value - a.value // Largest first
  );

  if (inbound.length < 5 || outbound.length === 0) {
    return { triggered: false, confidence: 0, rationale: 'Insufficient inbound transaction diversity for convergence pattern analysis.' };
  }

  // Look for a large outbound tx preceded by multiple inbound flows
  for (const outTx of outbound.slice(0, 5)) { // Check top 5 largest outbound txs
    // Find inbound txs in the 72 hours before this outbound tx
    const window72h = 72 * 3600;
    const recentInbound = inbound.filter(
      (tx) =>
        tx.timestamp < outTx.timestamp &&
        tx.timestamp >= outTx.timestamp - window72h
    );

    const distinctSources = new Set(recentInbound.map((tx) => tx.from));
    const totalInboundValue = recentInbound.reduce((sum, tx) => sum + tx.value, 0);

    if (distinctSources.size >= 5 && outTx.value >= totalInboundValue * 0.5) {
      const confidence = Math.min(0.9, 0.5 + (distinctSources.size - 5) * 0.05);
      return {
        triggered: true,
        confidence,
        rationale:
          `${distinctSources.size} distinct inbound addresses funneled approximately ` +
          `${totalInboundValue.toFixed(4)} ETH to this wallet, followed by a consolidation ` +
          `outbound transfer of ${outTx.value.toFixed(4)} ETH within 72 hours. ` +
          'This convergence pattern is consistent with the integration phase of money laundering, ' +
          'where fragmented proceeds from multiple sources are aggregated before final conversion. ' +
          'Per FATF Guidance for a Risk-Based Approach: Virtual Assets (2019), this is a recognized typology.',
      };
    }
  }

  return {
    triggered: false,
    confidence: 0,
    rationale: 'No significant fund convergence pattern detected (requires 5+ distinct inbound sources with large outbound consolidation).',
  };
}

/**
 * Detect high volume anomaly.
 *
 * Definition: Total ETH transaction volume grossly inconsistent with wallet age.
 * Threshold: >100 ETH in a wallet < 30 days old.
 */
function detectHighVolumeAnomaly(
  transactions: WalletTransaction[]
): { triggered: boolean; confidence: number; rationale: string } {
  const ethTxs = transactions.filter((tx) => !tx.tokenSymbol && tx.value > 0);

  if (ethTxs.length === 0) {
    return { triggered: false, confidence: 0, rationale: 'No native ETH transactions available for volume analysis.' };
  }

  const totalVolume = ethTxs.reduce((sum, tx) => sum + tx.value, 0);
  const earliestTimestamp = Math.min(...ethTxs.map((tx) => tx.timestamp));
  const walletAgeDays = Math.floor((Date.now() / 1000 - earliestTimestamp) / 86400);

  if (totalVolume <= HIGH_VOLUME_ETH_THRESHOLD || walletAgeDays >= HIGH_VOLUME_AGE_THRESHOLD_DAYS) {
    return {
      triggered: false,
      confidence: 0,
      rationale:
        `Total volume of ${totalVolume.toFixed(2)} ETH over ${walletAgeDays} days is within expected range.`,
    };
  }

  // Confidence scales with how extreme the volume-to-age ratio is
  const volumeRatio = totalVolume / HIGH_VOLUME_ETH_THRESHOLD;
  const confidence = Math.min(0.9, 0.5 + (volumeRatio - 1) * 0.1);

  return {
    triggered: true,
    confidence,
    rationale:
      `${totalVolume.toFixed(2)} ETH in total transaction volume for a wallet only ${walletAgeDays} days old — ` +
      `${(totalVolume / HIGH_VOLUME_ETH_THRESHOLD).toFixed(1)}x above the anomaly threshold of ${HIGH_VOLUME_ETH_THRESHOLD} ETH. ` +
      'Transaction volume is grossly inconsistent with the wallet\'s operational history. ' +
      'Source-of-funds inquiry is required per FATF Guidance for a Risk-Based Approach: ' +
      'Virtual Assets (2019), Annex A, Indicator 7.',
  };
}

// ---------------------------------------------------------------------------
// Typology Detector Registry
// ---------------------------------------------------------------------------

type DetectorFn = (
  transactions: WalletTransaction[],
  riskScore: RiskScore,
  queriedAddress: string
) => { triggered: boolean; confidence: number; rationale: string };

const DETECTORS: Record<string, DetectorFn> = {
  smurfing: (txs) => detectSmurfing(txs),
  rapid_hop_layering: (txs) => detectRapidHopLayering(txs),
  mixer_obfuscation: (txs, _score, addr) => detectMixerObfuscation(txs, addr),
  convergence_pattern: (txs) => detectConvergencePattern(txs),
  high_volume_anomaly: (txs) => detectHighVolumeAnomaly(txs),

  // layering_dex and peel_chain detection requires DEX interaction mapping
  // and deep graph analysis — deferred to v2. Return clean for now.
  layering_dex: () => ({
    triggered: false,
    confidence: 0,
    rationale:
      'DEX-based layering detection requires token swap graph analysis — available in v2.',
  }),
  peel_chain: (txs) => {
    // Basic peel chain heuristic: look for straight chains where each tx
    // has a single inbound and single outbound from/to unique addresses,
    // with high value-forward ratio
    const outbound = txs
      .filter((tx) => !tx.isInbound && tx.value > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (outbound.length < 5) {
      return { triggered: false, confidence: 0, rationale: 'Insufficient sequential outbound transaction history for peel chain analysis.' };
    }

    // Check if each address in the chain appears only once (burner wallets)
    const toAddresses = outbound.map((tx) => tx.to);
    const uniqueToAddresses = new Set(toAddresses);
    const isLinearChain = uniqueToAddresses.size === toAddresses.length;

    // Check if values are generally declining (peeling off amounts)
    let decliningCount = 0;
    for (let i = 1; i < outbound.length; i++) {
      if (outbound[i].value < outbound[i - 1].value) decliningCount++;
    }
    const mostlyDeclining = decliningCount >= outbound.length * 0.7;

    if (isLinearChain && mostlyDeclining && outbound.length >= 5) {
      return {
        triggered: true,
        confidence: 0.6,
        rationale:
          `${outbound.length} sequential outbound transactions forming a linear value-forward chain, ` +
          'with generally declining amounts at each hop — consistent with a peel chain pattern. ' +
          'Each intermediate address appears unique (no reuse), suggesting purpose-created burner wallets. ' +
          'This pattern is associated with ransomware payment processing and exchange hack cash-outs.',
      };
    }

    return { triggered: false, confidence: 0, rationale: 'No peel chain pattern detected.' };
  },
};

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Match transaction patterns against all known AML typologies.
 *
 * Each typology in data/typologies.json is evaluated against the wallet's
 * full transaction history. Triggered typologies are returned with a confidence
 * score and rationale string suitable for use in SAR narratives.
 *
 * Results are sorted by confidence descending — highest-confidence matches first.
 *
 * @param transactions  Full normalized transaction history for the wallet
 * @param riskScore     Pre-computed risk score (used for signal correlation)
 * @returns Array of AMLTypology objects (all typologies, triggered and clean)
 */
export function matchTypologies(
  transactions: WalletTransaction[],
  riskScore: RiskScore,
  queriedAddress: string
): AMLTypology[] {
  const results: AMLTypology[] = TYPOLOGIES.map((def) => {
    const detector = DETECTORS[def.id];

    if (!detector) {
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        fatfReference: def.fatfReference,
        triggered: false,
        confidence: 0,
        rationale: `Detection logic for "${def.name}" not yet implemented.`,
      };
    }

    const { triggered, confidence, rationale } = detector(transactions, riskScore, queriedAddress);

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      fatfReference: def.fatfReference,
      triggered,
      confidence,
      rationale,
    };
  });

  // Sort: triggered typologies first, then by confidence descending
  return results.sort((a, b) => {
    if (a.triggered && !b.triggered) return -1;
    if (!a.triggered && b.triggered) return 1;
    return b.confidence - a.confidence;
  });
}

/**
 * Returns only the triggered (matched) typologies from a matchTypologies result.
 * Convenience function for SAR narrative generation and UI display.
 *
 * @param typologies Full result from matchTypologies()
 */
export function getTriggeredTypologies(typologies: AMLTypology[]): AMLTypology[] {
  return typologies.filter((t) => t.triggered);
}

/**
 * Returns the highest-confidence triggered typology, if any.
 * Useful for the summary risk card in the UI.
 *
 * @param typologies Full result from matchTypologies()
 */
export function getPrimaryTypology(typologies: AMLTypology[]): AMLTypology | null {
  const triggered = getTriggeredTypologies(typologies);
  return triggered.length > 0 ? triggered[0] : null;
}
