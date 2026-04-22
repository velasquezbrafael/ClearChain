/**
 * ClearChain — Claude AI Integration Layer
 *
 * Provides two compliance-grade AI functions built on Anthropic's Claude:
 *
 *   generateNarrative()  — Streaming plain-English chain-of-custody narrative
 *                          for compliance officer review.
 *   generateSARDraft()   — Non-streaming FinCEN-style Suspicious Activity Report
 *                          draft narrative, ready for officer sign-off and filing.
 *
 * Both functions are deliberately designed so the prompts stay close to
 * FATF/FinCEN guidance language — the output should be citable in a real SAR.
 *
 * Environment variable required: ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WalletAnalysis } from '@/types';

// ---------------------------------------------------------------------------
// Client initialisation
// ---------------------------------------------------------------------------

/**
 * Lazily constructed Anthropic client.
 * The SDK reads ANTHROPIC_API_KEY from process.env automatically.
 * We use a module-level singleton to avoid re-creating the client on every
 * serverless function invocation in Next.js (warm reuse where possible).
 */
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to your .env.local file.'
      );
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5-20251001';

/**
 * System prompt for the narrative generator.
 * Tone: experienced AML compliance analyst writing for a compliance committee.
 * Not adversarial, not alarmist — factual, precise, and citable.
 */
const NARRATIVE_SYSTEM_PROMPT =
  'You are a senior AML compliance analyst specialising in cryptocurrency ' +
  'forensics. Write concise, factual transaction narratives for compliance ' +
  'review. Follow FinCEN guidance. Never speculate beyond the data. ' +
  'Your output must be 2–4 sentences maximum. Do not add headers, bullet ' +
  'points, or preamble — return only the narrative paragraph.';

/**
 * System prompt for the SAR draft generator.
 * Tone: BSA/AML compliance officer completing a FinCEN SAR narrative section.
 * Language should match what a bank examiner expects to read.
 */
const SAR_SYSTEM_PROMPT =
  'You are a BSA/AML compliance officer drafting a Suspicious Activity ' +
  'Report narrative for submission to FinCEN. Follow SAR format conventions: ' +
  'past tense, third person, specific dates and amounts, no speculation. ' +
  'Cite specific transaction data provided. Use formal regulatory language. ' +
  'Every factual claim must be traceable to the on-chain data you are given.';

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Builds a structured prompt for the narrative generator.
 * Includes the key signals and top typology so Claude can reason from data,
 * not just repeat back the address.
 */
function buildNarrativePrompt(analysis: WalletAnalysis): string {
  const { address, riskScore, typologies, transactions, ofacResult, analyzedAt } =
    analysis;

  // Gather the top triggered typology (highest confidence)
  const topTypology = typologies
    .filter((t) => t.triggered)
    .sort((a, b) => b.confidence - a.confidence)[0];

  // Identify key transactions: first inbound, last outbound, any mixer hops
  const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const firstTx = sortedTxs[0];
  const lastTx = sortedTxs[sortedTxs.length - 1];

  // Triggered signals for concise signal summary
  const triggeredSignals = riskScore.signals
    .filter((s) => s.triggered)
    .map((s) => `- ${s.name}: ${s.detail}`)
    .join('\n');

  const ofacLine = ofacResult.matched
    ? `OFAC/SDN MATCH: YES — Entity: ${ofacResult.matchedEntity ?? 'Unknown'} (confidence: ${(ofacResult.confidence * 100).toFixed(0)}%)`
    : 'OFAC/SDN MATCH: No match detected.';

  return `
Generate a 2–4 sentence plain-English chain-of-custody narrative for compliance review.

WALLET DATA:
- Address: ${address}
- Chain: Ethereum (ETH)
- Analysis Date: ${analyzedAt}
- Risk Score: ${riskScore.total}/100 (${riskScore.level})
- Total Transactions Analysed: ${transactions.length}
- ${ofacLine}

TRIGGERED RISK SIGNALS:
${triggeredSignals || '(none triggered)'}

PRIMARY AML TYPOLOGY:
${
  topTypology
    ? `${topTypology.name} (confidence: ${(topTypology.confidence * 100).toFixed(0)}%)\nFATF/FinCEN Ref: ${topTypology.fatfReference}\nRationale: ${topTypology.rationale}`
    : '(no typology triggered)'
}

TRANSACTION BOOKENDS:
- Earliest tx: hash ${firstTx?.hash ?? 'N/A'} on ${firstTx ? new Date(firstTx.timestamp * 1000).toISOString().split('T')[0] : 'N/A'}, ${firstTx?.value ?? '0'} ETH, from ${firstTx?.from ?? 'unknown'} → ${firstTx?.to ?? 'unknown'}
- Most recent tx: hash ${lastTx?.hash ?? 'N/A'} on ${lastTx ? new Date(lastTx.timestamp * 1000).toISOString().split('T')[0] : 'N/A'}, ${lastTx?.value ?? '0'} ETH, from ${lastTx?.from ?? 'unknown'} → ${lastTx?.to ?? 'unknown'}

FORMAT INSTRUCTIONS:
Trace fund flow origin → hops → destination. Name any mixer or high-risk interactions specifically. End with a one-sentence conclusion identifying the AML stage (placement / layering / integration) and the primary typology matched. Be factual, not alarmist.
`.trim();
}

/**
 * Builds a structured prompt for the SAR draft generator.
 * Provides enough transaction detail for Claude to populate every section
 * of the SAR narrative template with specific, citable facts.
 */
function buildSARPrompt(analysis: WalletAnalysis): string {
  const { address, chain, riskScore, typologies, transactions, ofacResult, analyzedAt } =
    analysis;

  const topTypology = typologies
    .filter((t) => t.triggered)
    .sort((a, b) => b.confidence - a.confidence)[0];

  // Pull up to 10 transactions for SAR detail, sorted oldest-first
  const keyTxs = [...transactions]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 10)
    .map((tx, i) => {
      const date = new Date(tx.timestamp * 1000).toISOString().split('T')[0];
      const tokenLabel = tx.tokenSymbol ? ` (${tx.tokenSymbol})` : ' ETH';
      return `  ${i + 1}. ${date} | ${tx.value}${tokenLabel} | from: ${tx.from.slice(0, 8)}...${tx.from.slice(-4)} → to: ${tx.to.slice(0, 8)}...${tx.to.slice(-4)} | tx: ${tx.hash.slice(0, 10)}...`;
    })
    .join('\n');

  const triggeredSignals = riskScore.signals
    .filter((s) => s.triggered)
    .map((s) => `- ${s.name} (+${s.score} pts): ${s.detail}`)
    .join('\n');

  const ofacSection = ofacResult.matched
    ? `YES — Matched SDN entity: "${ofacResult.matchedEntity}" at ${(ofacResult.confidence * 100).toFixed(0)}% confidence`
    : 'No OFAC SDN match detected.';

  return `
Generate a FinCEN-style Suspicious Activity Report (SAR) draft narrative following this EXACT template. Fill every section with specific data from the wallet analysis provided. Do not leave any placeholder text — replace all bracketed items with real values from the data.

TEMPLATE TO POPULATE:
---
SUSPICIOUS ACTIVITY REPORT — DRAFT NARRATIVE
[For compliance officer review — not a filed SAR]

SUBJECT INFORMATION:
- Wallet Address: ${address}
- Blockchain: ${chain === 'ETH' ? 'Ethereum (ETH)' : chain}
- Analysis Date: ${analyzedAt}
- Risk Score: ${riskScore.total}/100 (${riskScore.level})

SUSPICIOUS ACTIVITY DESCRIPTION:
[3–5 sentences in past tense, third person. Describe what happened, specific dates and amounts, the transaction pattern observed, and why it is suspicious. Reference the risk signals below.]

TYPOLOGY:
[Primary typology name, one-sentence description, and FATF/FinCEN reference]

SUPPORTING TRANSACTION DETAILS:
[List 3–5 key transactions from the data: date, amount, counterparty abbreviated address, and why each is significant to the suspicious pattern]

RECOMMENDED DISPOSITION:
[One sentence: whether to file a SAR with FinCEN, hold pending further investigation, or escalate to senior compliance/legal]

---
Note: This is an AI-generated draft for compliance officer review. All information should be verified before filing with FinCEN.
---

WALLET ANALYSIS DATA TO USE:

Address: ${address}
Chain: Ethereum (ETH)
Risk Score: ${riskScore.total}/100 (${riskScore.level})
Analysis Date: ${analyzedAt}
OFAC Match: ${ofacSection}

TRIGGERED RISK SIGNALS:
${triggeredSignals || '(none triggered)'}

PRIMARY TYPOLOGY:
${
  topTypology
    ? `Name: ${topTypology.name}\nReference: ${topTypology.fatfReference}\nRationale: ${topTypology.rationale}`
    : '(no typology matched)'
}

KEY TRANSACTIONS (oldest first, up to 10):
${keyTxs || '(no transactions available)'}

TOTAL TRANSACTIONS ANALYSED: ${transactions.length}
`.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * generateAll
 *
 * Single Claude call that returns both the narrative and SAR draft together.
 * Combining into one request halves latency vs two sequential/parallel calls.
 * Response is JSON with { narrative, sarDraft } fields.
 */
export async function generateAll(analysis: WalletAnalysis): Promise<{ narrative: string; sarDraft: string }> {
  try {
    const client = getClient();

    const combinedPrompt = `
You are a senior BSA/AML compliance analyst. Given the wallet analysis below, produce TWO outputs in valid JSON format with keys "narrative" and "sarDraft".

1. "narrative": A 2–4 sentence plain-English chain-of-custody paragraph for compliance review. Trace fund flow, name any mixer/high-risk interactions, and end with the AML stage (placement/layering/integration). Factual, no speculation.

2. "sarDraft": A complete FinCEN-style SAR draft with these exact sections:
SUSPICIOUS ACTIVITY REPORT — DRAFT NARRATIVE
[For compliance officer review — not a filed SAR]

SUBJECT INFORMATION:
- Wallet Address: ${analysis.address}
- Blockchain: Ethereum (ETH)
- Analysis Date: ${analysis.analyzedAt}
- Risk Score: ${analysis.riskScore.total}/100 (${analysis.riskScore.level})

SUSPICIOUS ACTIVITY DESCRIPTION:
[3–5 sentences, past tense, third person, specific dates/amounts]

TYPOLOGY:
[Primary typology name, FATF/FinCEN reference]

SUPPORTING TRANSACTION DETAILS:
[3–5 key transactions: date, amount, abbreviated addresses]

RECOMMENDED DISPOSITION:
[File SAR / Hold pending investigation / Escalate]

---
Note: AI-generated draft for compliance officer review. Verify before filing with FinCEN.

WALLET DATA:
- Risk Score: ${analysis.riskScore.total}/100 (${analysis.riskScore.level})
- OFAC Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'No'}
- Triggered Signals: ${analysis.riskScore.signals.filter(s => s.triggered).map(s => s.name).join(', ') || 'none'}
- Top Typology: ${analysis.typologies.filter(t => t.triggered).sort((a, b) => b.confidence - a.confidence)[0]?.name ?? 'none'}
- Transactions: ${analysis.transactions.length} total
- Key txs: ${analysis.transactions.slice(0, 5).map(tx => `${new Date(tx.timestamp * 1000).toISOString().split('T')[0]} ${tx.value} ETH ${tx.from.slice(0,8)}→${tx.to.slice(0,8)}`).join(' | ')}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.
`.trim();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'You are a BSA/AML compliance analyst. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: combinedPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response');

    const parsed = JSON.parse(textBlock.text.trim());
    return {
      narrative: parsed.narrative ?? 'Narrative generation failed. Please retry.',
      sarDraft: parsed.sarDraft ?? 'SAR draft generation failed. Please retry.',
    };
  } catch (err) {
    console.error('[ClearChain] generateAll failed:', err);
    return {
      narrative: 'Narrative generation failed. Please retry.',
      sarDraft: 'SAR draft generation failed. Please retry.',
    };
  }
}

// Keep individual exports for backwards compatibility
export async function generateNarrative(analysis: WalletAnalysis): Promise<string> {
  const { narrative } = await generateAll(analysis);
  return narrative;
}

export async function generateSARDraft(analysis: WalletAnalysis): Promise<string> {
  const { sarDraft } = await generateAll(analysis);
  return sarDraft;
}
