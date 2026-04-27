/**
 * ClearChain — Solana risk scoring
 *
 * 4-signal model (max 100pts):
 *   OFAC match:          40pts
 *   High-risk party:     25pts  (transacted with OFAC-listed SOL addresses)
 *   Rapid movement:      20pts  (>50 SOL moved within 48h of receipt)
 *   Volume anomaly:      15pts  (high frequency or large volume in young wallet)
 *
 * Thresholds: LOW 0–24 | MEDIUM 25–49 | HIGH 50–74 | CRITICAL 75–100
 */

import type { RiskScore, ScoringSignal } from '@/types';
import type { SolSignals } from './solana';
import type { WalletTransaction } from '@/types';
import OFAC_SOL from '@/data/ofac-sol-addresses.json';

const SOL_SDN = new Map(
  Object.entries(OFAC_SOL as Record<string, string>),
);

interface OFACLike {
  matched:        boolean;
  matchedEntity?: string;
}

export function scoreSolana(
  address:      string,
  transactions: WalletTransaction[],
  ofacResult:   OFACLike,
  patterns:     SolSignals,
): RiskScore {

  // High-risk counterparty: any transaction with an OFAC-listed SOL address
  const counterpartyHits = transactions.filter(
    tx => SOL_SDN.has(tx.from) || SOL_SDN.has(tx.to),
  );
  const hasCounterpartyRisk = counterpartyHits.length > 0 && !ofacResult.matched;

  const signals: ScoringSignal[] = [
    {
      name:      'ofac_match',
      weight:    40,
      triggered: ofacResult.matched,
      score:     ofacResult.matched ? 40 : 0,
      detail:    ofacResult.matched
        ? `SOL address is listed on the OFAC SDN list as "${ofacResult.matchedEntity}". Mandatory SAR filing required for covered financial institutions.`
        : 'No match found on OFAC Solana SDN list.',
    },
    {
      name:      'high_risk_counterparty',
      weight:    25,
      triggered: hasCounterpartyRisk,
      score:     hasCounterpartyRisk ? 25 : 0,
      detail:    hasCounterpartyRisk
        ? `${counterpartyHits.length} transaction(s) with OFAC-sanctioned Solana address(es). Enhanced due diligence required.`
        : 'No interactions with known sanctioned Solana counterparties.',
    },
    {
      name:      'rapid_fund_movement',
      weight:    20,
      triggered: patterns.rapidMovement,
      score:     patterns.rapidMovement ? 20 : 0,
      detail:    patterns.rapidMovement
        ? '>50 SOL moved outbound within 48 hours of receipt — consistent with rapid-layering behavior.'
        : 'No rapid fund movement detected.',
    },
    {
      name:      'volume_anomaly',
      weight:    15,
      triggered: patterns.volumeAnomaly,
      score:     patterns.volumeAnomaly ? 15 : 0,
      detail:    patterns.volumeAnomaly
        ? 'Unusually high transaction frequency or volume relative to wallet age — inconsistent with normal activity patterns.'
        : 'Transaction volume and frequency within expected range.',
    },
  ];

  const total = Math.min(100, signals.reduce((s, sig) => s + sig.score, 0));
  const level =
    total >= 75 ? 'CRITICAL' :
    total >= 50 ? 'HIGH'     :
    total >= 25 ? 'MEDIUM'   : 'LOW';

  // Unused parameter guard
  void address;

  return {
    total,
    level,
    signals: Object.fromEntries(signals.map(s => [s.name, s])),
  };
}
