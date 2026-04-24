import crypto from 'crypto'

export function generateApiKey(): string {
  return `ck_live_${crypto.randomBytes(16).toString('hex')}`
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}
