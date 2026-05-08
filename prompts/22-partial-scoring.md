# Task 22 — Partial Scoring: Mixer + High-Risk Counterparty

## Context

ClearChain's scoring engine (`lib/scoring.ts`) currently treats every signal as binary — it either fires for full points or gives zero. Two signals benefit from count-based partial scoring because the number of interactions meaningfully changes the risk profile:

- **Mixer:** 1 accidental interaction is very different from 20 deliberate ones
- **High-risk counterparty:** brushing past one flagged address is different from repeatedly transacting with multiple known-bad wallets

OFAC and all other signals stay binary — do NOT change them.

---

## Changes — `lib/scoring.ts` only

### Signal 2: Mixer Interaction (was flat 25pts, now count-based)

Replace the return statements in `evaluateMixerSignal` with this scale:

```
0 interactions  → 0 pts
1–2 txs         → 15 pts  ("limited mixer contact")
3+  txs         → 25 pts  ("repeated mixer interaction")
```

The `isMixer` case (queried address IS a mixer contract) always scores full 25pts — it IS the mixer, severity doesn't scale with tx count.

Updated return for the transaction-count path:

```typescript
const score = mixerTxs.length >= 3 ? 25 : 15;
const severity = mixerTxs.length >= 3 ? 'repeated' : 'limited';

return {
  name: 'mixer_interaction',
  weight: 25,
  triggered: true,
  score,
  detail:
    `${mixerTxs.length} transaction(s) directly involving known mixer contracts ` +
    `(${severity} interaction — ${score} pts). ` +
    `Mixer addresses: ${uniqueMixerAddresses.map((a) => a.slice(0, 10) + '...').join(', ')}. ` +
    'Tornado Cash was designated by OFAC on 08/08/2022 (SDN). ' +
    'This interaction pattern is consistent with the "mixer_obfuscation" AML typology.',
};
```

### Signal 4: High-Risk Counterparty (was flat 10pts, now count-based)

Replace the triggered return in `evaluateCounterpartySignal` with this scale:

```
0 interactions  → 0 pts
1–2 txs         → 5 pts   ("limited high-risk contact")
3+  txs         → 10 pts  ("multiple high-risk counterparties")
```

Updated return for the triggered path:

```typescript
const score = riskCounterparties.length >= 3 ? 10 : 5;
const severity = riskCounterparties.length >= 3 ? 'multiple' : 'limited';

return {
  name: 'high_risk_counterparty',
  weight: 10,
  triggered: true,
  score,
  detail:
    `${riskCounterparties.length} transaction(s) with ${uniqueRisky.length} known high-risk counterparty address(es) ` +
    `(${severity} exposure — ${score} pts): ` +
    `${uniqueRisky.map((a) => a.slice(0, 10) + '...').join(', ')}. ` +
    'Enhanced due diligence and source-of-funds investigation required.',
};
```

---

## Custom weights compatibility

Both signals already accept a `weight` param (added in Task 17). The `score` value must still be capped at the custom weight when custom profiles are active. Add this cap to both signals:

```typescript
// After computing score:
const effectiveWeight = weight ?? 25; // (or 10 for counterparty)
const cappedScore = Math.min(score, effectiveWeight);
```

Use `cappedScore` in the return object instead of `score` directly. This ensures a user who sets mixer weight to 10 in their custom profile can't exceed their own cap.

---

## Test cases to verify manually after shipping

1. **Tornado Cash** (`0x722122dF12D4e14e13Ac3b6895a86e84145b6967`) — IS a mixer → should still score 25pts on mixer signal
2. **A wallet with 1 mixer tx** — should score 15pts (not 25)
3. **Vitalik** (`vitalik.eth`) — must still score 0, all signals clean. Rapid movement must NOT fire.

---

## What NOT to change

- OFAC signal — stays binary (0 or 40)
- Rapid fund movement — stays binary
- Indirect exposure — already has its own partial logic, leave it
- Volume anomaly — stays binary
- Community flags — stays binary
- `DEFAULT_SIGNAL_WEIGHTS` in `types/index.ts` — max weights stay at 25 and 10, only the awarded score changes
- Nothing in `app/` or `components/` — scoring only

---

## Dev Command

```bash
npm run dev
```
