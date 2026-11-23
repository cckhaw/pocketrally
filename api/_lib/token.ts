import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface RunClaims {
  /** level id */
  l: string
  /** player id */
  p: string
  /** server start time (ms epoch) */
  t: number
  /** nonce */
  n: string
}

export const TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000

const b64 = (b: Buffer) => b.toString('base64url')

function mac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

export function signRunToken(
  secret: string,
  levelId: string,
  playerId: string,
  now = Date.now(),
): string {
  const claims: RunClaims = {
    l: levelId,
    p: playerId,
    t: now,
    n: randomBytes(12).toString('base64url'),
  }
  const payload = b64(Buffer.from(JSON.stringify(claims)))
  return `${payload}.${b64(mac(secret, payload))}`
}

export type VerifyResult =
  | { ok: true; claims: RunClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'future' }

export function verifyRunToken(secret: string, token: unknown, now = Date.now()): VerifyResult {
  if (typeof token !== 'string' || token.length > 600) return { ok: false, reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payload, sig] = parts
  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const expected = mac(secret, payload)
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { ok: false, reason: 'bad_signature' }
  let claims: RunClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RunClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (
    typeof claims.l !== 'string' ||
    typeof claims.p !== 'string' ||
    typeof claims.t !== 'number' ||
    typeof claims.n !== 'string'
  ) {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.t > now + 5000) return { ok: false, reason: 'future' }
  if (now - claims.t > TOKEN_MAX_AGE_MS) return { ok: false, reason: 'expired' }
  return { ok: true, claims }
}
