import { createHash } from 'node:crypto'
import type { ScoreStore } from './store'

export const WINDOW_SECONDS = 60

/** Salted, truncated hash so raw IPs are never stored. The key itself expires after the window. */
export function hashIp(secret: string, ip: string): string {
  return createHash('sha256').update(`${secret}|ip|${ip}`).digest('hex').slice(0, 20)
}

export interface LimitResult {
  allowed: boolean
  count: number
  limit: number
}

/** Fixed-window counter in the store. */
export async function hit(store: ScoreStore, key: string, limit: number): Promise<LimitResult> {
  const count = await store.incr(key, WINDOW_SECONDS)
  return { allowed: count <= limit, count, limit }
}

export const LIMITS = {
  scorePerIp: 10,
  scorePerPlayer: 10,
  startPerIp: 30,
  startPerPlayer: 20,
  readPerIp: 120,
} as const
