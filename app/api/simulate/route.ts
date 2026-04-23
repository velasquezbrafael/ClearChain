import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SIGNAL_LABELS: Record<string, string> = {
  ofac_match:             'OFAC/SDN list match',
  mixer_interaction:      'direct interaction with a Tornado Cash mixer contract',
  rapid_fund_movement:    'rapid fund movement (3+ outbound hops within 24 hours)',
  high_risk_counterparty: 'transactions with known high-risk counterparty addresses',
  volume_anomaly:         'unusual transaction volume relative to wallet age',
  community_red_flags:    'community-sourced red-flag tags',
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function POST(req: NextRequest) {
  try {
    const { address, activeSignals } = await req.json() as {
      address: string;
      activeSignals: string[];
    };

    if (!address || !Array.isArray(activeSignals)) {
      return NextResponse.json({ error: 'address and activeSignals required' }, { status: 400 });
    }

    const signalDescriptions = activeSignals
      .map(s => SIGNAL_LABELS[s] ?? s)
      .join(', ') || 'no active risk signals';

    const prompt = `You are a BSA/AML compliance analyst. Given these active risk signals for Ethereum wallet ${address}, write a 2-3 sentence compliance narrative as if these conditions were true. Be factual and specific.

Active risk signals: ${signalDescriptions}

Write only the narrative paragraph. No headers, no preamble.`;

    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? 'Generation failed.';
    return NextResponse.json({ narrative: text.trim() });
  } catch (err) {
    console.error('[simulate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
