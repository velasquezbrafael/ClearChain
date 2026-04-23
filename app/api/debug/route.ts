import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  const keySet = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 10) ?? 'not set';
  const alchemySet = !!process.env.ALCHEMY_API_KEY;

  if (!keySet) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set', keySet, alchemySet });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say OK' }],
    });
    const text = res.content.find(b => b.type === 'text')?.text ?? '';
    return NextResponse.json({ ok: true, keyPrefix, alchemySet, claudeResponse: text });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, keyPrefix, alchemySet, error: String(err) });
  }
}
