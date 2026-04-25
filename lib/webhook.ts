/**
 * ClearChain — Webhook delivery
 *
 * Fire-and-forget: call without await. All errors are caught and logged silently.
 * Callers must NOT await this function — it is non-blocking by design.
 */

import { createHmac } from 'crypto'

export async function fireWebhook(
  webhookUrl: string,
  webhookSecret: string | null,
  payload: object
): Promise<void> {
  try {
    const body = JSON.stringify(payload)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ClearChain-Webhook/1.0',
    }

    if (webhookSecret) {
      const sig = createHmac('sha256', webhookSecret).update(body).digest('hex')
      headers['X-ClearChain-Signature'] = `sha256=${sig}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err) {
    // Silent — webhook failures must never affect the analysis response
    console.error(
      '[ClearChain/webhook] Delivery failed:',
      webhookUrl,
      err instanceof Error ? err.message : err
    )
  }
}
