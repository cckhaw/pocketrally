import { randomBytes } from 'node:crypto'
import { MemoryStore, NeonStore, type ScoreStore } from './store'

export interface Env {
  [key: string]: string | undefined
}

export interface ApiConfig {
  store: ScoreStore
  secret: string
  extraOrigins: string[]
  production: boolean
}

export const PORTAL_ORIGIN = 'https://games.khaw.cc'

let devSecret: string | null = null
let memory: MemoryStore | null = null

/** Build config from environment variables. Returns an error code when production is misconfigured. */
export function loadConfig(env: Env): ApiConfig | { error: 'not_configured' } {
  const production = !!env.VERCEL || env.NODE_ENV === 'production'
  const dbUrl = env.DATABASE_URL || env.POSTGRES_URL
  const configuredSecret = env.LEADERBOARD_SECRET
  const extraOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  let store: ScoreStore
  if (dbUrl) store = new NeonStore(dbUrl)
  else if (production) return { error: 'not_configured' }
  else store = memory ?? (memory = new MemoryStore())

  let secret = configuredSecret
  if (!secret) {
    if (production) return { error: 'not_configured' }
    secret = devSecret ?? (devSecret = randomBytes(24).toString('hex'))
  }
  return { store, secret, extraOrigins, production }
}

/** CORS: only the game's own origin (same host), the Arcade portal, extra configured origins, and localhost in dev. */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  cfg: Pick<ApiConfig, 'extraOrigins' | 'production'>,
): boolean {
  if (!origin) return true
  if (origin === PORTAL_ORIGIN) return true
  if (host && (origin === `https://${host}` || (!cfg.production && origin === `http://${host}`)))
    return true
  if (cfg.extraOrigins.includes(origin)) return true
  if (!cfg.production && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  return false
}
