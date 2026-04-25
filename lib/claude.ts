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

    const sarTemplate = `SUSPICIOUS ACTIVITY REPORT — DRAFT NARRATIVE
[For compliance officer review — not a filed SAR]

SUBJECT INFORMATION:
Wallet Address: ${analysis.address}
Blockchain: Ethereum (ETH)
Analysis Date: ${analysis.analyzedAt}
Risk Score: ${analysis.riskScore.total}/100 (${analysis.riskScore.level})
OFAC Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'No'}

SUSPICIOUS ACTIVITY DESCRIPTION:
[Write 3-5 sentences here in past tense, third person, with specific dates and amounts]

TYPOLOGY:
[Primary typology and FATF/FinCEN reference]

SUPPORTING TRANSACTION DETAILS:
[List 3-5 key transactions with date, amount, abbreviated addresses]

RECOMMENDED DISPOSITION:
[File SAR / Hold pending investigation / Escalate]

---
Note: AI-generated draft. Verify all details before filing with FinCEN.`;

    const combinedPrompt = `You are a senior BSA/AML compliance analyst. Return a single JSON object with exactly two string fields: "narrative" and "sarDraft". Both values must be plain text strings — not objects, not arrays.

"narrative": Write 2-4 sentences tracing fund flow for this wallet. Name mixer/high-risk interactions. End with the AML stage (placement/layering/integration). Factual only.

"sarDraft": Fill in the bracketed sections of this template and return the completed text as a single plain string (preserve line breaks with \\n):
${sarTemplate}

WALLET DATA:
- Risk Score: ${analysis.riskScore.total}/100 (${analysis.riskScore.level})
- OFAC Match: ${analysis.ofacResult.matched ? `YES — ${analysis.ofacResult.matchedEntity}` : 'No'}
- Signals: ${Object.values(analysis.riskScore.signals).filter((s: {triggered: boolean}) => s.triggered).map((s: {name: string}) => s.name).join(', ') || 'none'}
- Top Typology: ${analysis.typologies.filter(t => t.triggered).sort((a, b) => b.confidence - a.confidence)[0]?.name ?? 'none'}
- Transactions: ${analysis.transactions.length} total
- Key txs: ${analysis.transactions.slice(0, 5).map(tx => `${new Date(tx.timestamp * 1000).toISOString().split('T')[0]} ${tx.value.toFixed(4)} ETH ${tx.from.slice(0,8)}→${tx.to.slice(0,8)}`).join(' | ')}

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
