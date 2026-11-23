import type { LeaderboardResponse, RunStartResponse, Scope, ScoreResponse } from './types'

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
  /** Errors that retrying will not fix (the score was refused, not lost). */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429 && this.status !== 408
  }
}

const BASE: string = (import.meta.env?.VITE_API_BASE as string | undefined) ?? ''

async function once<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(BASE + path, { ...init, signal: ctl.signal })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const b = (body ?? {}) as { error?: string; message?: string }
      throw new ApiFailure(res.status, b.error ?? 'http_error', b.message)
    }
    return body as T
  } catch (e) {
    if (e instanceof ApiFailure) throw e
    throw new ApiFailure(0, 'network', e instanceof Error ? e.message : 'network error')
  } finally {
    clearTimeout(timer)
  }
}

/** Typed fetch with timeout and retry (network errors, 429 and 5xx) with exponential backoff. */
export async function request<T>(path: string, init?: RequestInit, opts: { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2
  let attempt = 0
  for (;;) {
    try {
      return await once<T>(path, init, opts.timeoutMs ?? 6000)
    } catch (e) {
      if (!(e instanceof ApiFailure) || e.permanent || attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt))
      attempt++
    }
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  startRun: (levelId: string, playerId: string) =>
    request<RunStartResponse>('/api/run/start', json({ levelId, playerId }), { retries: 1, timeoutMs: 4000 }),
  submitScore: (body: {
    runToken: string
    timeMs: number
    tokens: number
    nickname: string
    inputLogHash: string
  }) => request<ScoreResponse>('/api/score', json(body)),
  leaderboard: (levelId: string, scope: Scope, playerId: string, limit = 50) =>
    request<LeaderboardResponse>(
      `/api/leaderboard?level=${encodeURIComponent(levelId)}&scope=${scope}&limit=${limit}&playerId=${encodeURIComponent(playerId)}`,
    ),
}
