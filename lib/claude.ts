/**
 * ClearChain — Claude AI Integration Layer
 *
 * Provides two consumer-oriented AI functions built on Anthropic's Claude:
 *
 *   generateNarrative()  — Plain-English summary of wallet activity.
 *   generateSARDraft()   — Downloadable safety report for the user's records.
 *
 * Prompts are conditioned on risk level: clean wallets get a reassuring
 * summary; flagged wallets get a detailed risk breakdown.
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

    const riskLevel = analysis.riskScore.level; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    const isClean = riskLevel === 'LOW' || analysis.riskScore.total === 0;
    const triggeredSignals = Object.values(analysis.riskScore.signals)
      .filter((s: {triggered: boolean}) => s.triggered)
      .map((s: {name: string}) => s.name)
      .join(', ') || 'none';
    const topTypology = analysis.typologies
      .filter(t => t.triggered)
      .sort((a, b) => b.confidence - a.confidence)[0]?.name ?? 'none';
    const keyTxs = analysis.transactions
      .slice(0, 5)
      .map(tx => `${new Date(tx.timestamp * 1000).toISOString().split('T')[0]} ${tx.value.toFixed(4)} ETH ${tx.from.slice(0,8)}→${tx.to.slice(0,8)}`)
      .join(' | ');

    const reportTemplate = isClean
      ? `WALLET SAFETY REPORT

WALLET INFORMATION:
Address: ${analysis.address}
Chain: Ethereum (ETH)
Analysis Date: ${analysis.analyzedAt}
Safety Score: ${analysis.riskScore.total}/100 — ${riskLevel}
Sanctions Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'None'}

SUMMARY:
[2-3 sentences: describe what this wallet does, how old it is, what types of transactions it makes. Use plain language. Do NOT use words like "suspicious", "layering", "money laundering", or "SAR".]

TRANSACTION ACTIVITY:
[List 3-5 notable transactions with date, amount, and abbreviated addresses]

VERDICT:
[1 sentence: is this safe to transact with? Plain language.]

---
Note: AI-generated summary. Always verify before sending.`
      : `WALLET SAFETY REPORT — RISK DETECTED

WALLET INFORMATION:
Address: ${analysis.address}
Chain: Ethereum (ETH)
Analysis Date: ${analysis.analyzedAt}
Risk Score: ${analysis.riskScore.total}/100 — ${riskLevel}
Sanctions Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'None'}

RISK SUMMARY:
[3-5 sentences: describe the specific risk signals detected, what transactions triggered them, and why this wallet is flagged. Factual, plain language. Include specific dates and amounts.]

DETECTED PATTERNS:
[List the triggered risk signals and what each one means in plain terms]

TRANSACTION DETAILS:
[List 3-5 key transactions with date, amount, and abbreviated addresses]

RECOMMENDATION:
[1 sentence: what should the user do? e.g. "We recommend not sending funds to this address."]

---
Note: AI-generated report. Use your own judgment before sending.`;

    const narrativeInstruction = isClean
      ? `"narrative": Write 2-3 sentences summarizing what this wallet does. Describe transaction volume, time range, and typical activity. Use plain language — do NOT imply anything suspicious, do NOT mention money laundering, layering, or placement. This wallet scored ${analysis.riskScore.total}/100 (${riskLevel}) — reflect that honestly.`
      : `"narrative": Write 2-4 sentences explaining the risk signals detected. Be specific about which transactions triggered flags. Plain language — avoid jargon but be clear about why this wallet is flagged.`;

    const combinedPrompt = `You are a wallet safety assistant helping everyday crypto users understand a wallet before sending funds. Return a single JSON object with exactly two string fields: "narrative" and "sarDraft". Both values must be plain text strings — not objects, not arrays.

${narrativeInstruction}

"sarDraft": Fill in the bracketed sections of this template and return the completed text as a single plain string (preserve line breaks with \\n):
${reportTemplate}

WALLET DATA:
- Risk Score: ${analysis.riskScore.total}/100 (${riskLevel})
- Sanctions Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'None'}
- Risk Signals Triggered: ${triggeredSignals}
- Top Pattern: ${topTypology}
- Total Transactions: ${analysis.transactions.length}
- Key Transactions: ${keyTxs}

Return ONLY the JSON object. No markdown fences. Both values must be strings.`.trim();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'You are a BSA/AML compliance analyst. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: combinedPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response');

    let rawText = textBlock.text.trim();
    // Strip markdown code fences Haiku sometimes wraps JSON in
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(rawText);

    // Defensive: if Claude returned sarDraft as an object, flatten it to a string
    const rawSar = parsed.sarDraft;
    const sarDraft = typeof rawSar === 'string'
      ? rawSar
      : (rawSar != null ? JSON.stringify(rawSar, null, 2) : 'SAR draft generation failed. Please retry.');

    const rawNar = parsed.narrative;
    const narrative = typeof rawNar === 'string'
      ? rawNar
      : (rawNar != null ? String(rawNar) : 'Narrative generation failed. Please retry.');

    return { narrative, sarDraft };
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
