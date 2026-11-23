import { describe, expect, it } from 'vitest'
import { loadConfig, isAllowedOrigin, type ApiConfig } from './config'
import { handle, type ApiRequest, type Route } from './handlers'
import { hashIp } from './ratelimit'
import { checkScore } from './rules'
import { MemoryStore, NeonStore, type ScoreStore } from './store'
import { PGlite } from '@electric-sql/pglite'
import { signRunToken, verifyRunToken, TOKEN_MAX_AGE_MS } from './token'
import { isoWeek } from './week'
import { gardenLevel } from '../../src/levels/garden/config'

const SECRET = 'test-secret'
const HASH = 'ab'.repeat(16)
const PLAYER = 'player-aaaa-0001'

function setup(start = 1_700_000_000_000) {
  const store = new MemoryStore()
  let t = start
  store.now = () => t
  const config: ApiConfig = { store, secret: SECRET, extraOrigins: [], production: false }
  const call = (route: Route, req: Partial<ApiRequest>) =>
    handle(
      route,
      { method: 'POST', query: {}, body: {}, headers: {}, ip: '1.2.3.4', ...req },
      { env: {}, config, now: () => t },
    )
  return { store, config, call, advance: (ms: number) => (t += ms), now: () => t }
}

async function startRun(s: ReturnType<typeof setup>, playerId = PLAYER, ip = '1.2.3.4') {
  const r = await s.call('run/start', { body: { levelId: 'garden', playerId }, ip })
  expect(r.status).toBe(200)
  return (r.body as { runToken: string }).runToken
}

const score = (runToken: string, over: Record<string, unknown> = {}) => ({
  runToken,
  timeMs: 70000,
  tokens: 10,
  nickname: 'Speedy',
  inputLogHash: HASH,
  ...over,
})

describe('run tokens', () => {
  it('signs and verifies', () => {
    const t = signRunToken(SECRET, 'garden', PLAYER, 1000)
    const v = verifyRunToken(SECRET, t, 2000)
    expect(v.ok && v.claims.l).toBe('garden')
    expect(v.ok && v.claims.p).toBe(PLAYER)
  })
  it('rejects tampering, wrong secret, malformed and expired tokens', () => {
    const t = signRunToken(SECRET, 'garden', PLAYER, 1000)
    const [payload, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ l: 'garden', p: 'x', t: 1000, n: 'n' })).toString(
      'base64url',
    )
    expect(verifyRunToken(SECRET, `${forged}.${sig}`, 2000)).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    })
    expect(verifyRunToken('other', t, 2000)).toMatchObject({ ok: false, reason: 'bad_signature' })
    expect(verifyRunToken(SECRET, 'garbage', 2000)).toMatchObject({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyRunToken(SECRET, 42, 2000)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyRunToken(SECRET, `${payload}.`, 2000).ok).toBe(false)
    expect(verifyRunToken(SECRET, t, 1000 + TOKEN_MAX_AGE_MS + 1)).toMatchObject({
      ok: false,
      reason: 'expired',
    })
    expect(verifyRunToken(SECRET, t, 1000 - 60000)).toMatchObject({ ok: false, reason: 'future' })
  })
})

describe('anti-cheat rules', () => {
  const lvl = gardenLevel
  const base = { timeMs: lvl.minPossibleTimeMs + 5000, tokens: 5, inputLogHash: HASH }
  it('accepts a plausible run', () => {
    expect(checkScore(lvl, base, base.timeMs + 500).ok).toBe(true)
  })
  it('requires server elapsed >= timeMs - 1500ms tolerance', () => {
    expect(checkScore(lvl, base, base.timeMs - 1500).ok).toBe(true)
    expect(checkScore(lvl, base, base.timeMs - 1501)).toMatchObject({
      ok: false,
      code: 'elapsed_mismatch',
    })
  })
  it('rejects times below the level minimum', () => {
    expect(checkScore(lvl, { ...base, timeMs: lvl.minPossibleTimeMs - 1 }, 999999)).toMatchObject({
      code: 'too_fast',
    })
  })
  it('caps tokens at the level total', () => {
    expect(checkScore(lvl, { ...base, tokens: lvl.tokens.length + 1 }, 999999)).toMatchObject({
      code: 'too_many_tokens',
    })
    expect(checkScore(lvl, { ...base, tokens: lvl.tokens.length }, 999999).ok).toBe(true)
  })
  it('rejects malformed or absurd values', () => {
    for (const bad of [NaN, -5, 1.5, '70000', Infinity, 1e12, 0, null]) {
      expect(checkScore(lvl, { ...base, timeMs: bad }, 1e9).ok).toBe(false)
    }
    expect(checkScore(lvl, { ...base, tokens: -1 }, 1e9).ok).toBe(false)
    expect(checkScore(lvl, { ...base, inputLogHash: 'not hex!' }, 1e9).ok).toBe(false)
  })
})

describe('POST /api/run/start + /api/score', () => {
  it('accepts a valid run and returns rank', async () => {
    const s = setup()
    const token = await startRun(s)
    s.advance(72000)
    const r = await s.call('score', { body: score(token) })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      ok: true,
      rank: 1,
      weekRank: 1,
      bestTimeMs: 70000,
      improved: true,
      total: 1,
    })
  })

  it('tokens are single-use', async () => {
    const s = setup()
    const token = await startRun(s)
    s.advance(72000)
    expect((await s.call('score', { body: score(token) })).status).toBe(200)
    const again = await s.call('score', { body: score(token) })
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ error: 'token_used' })
  })

  it('rejects submissions faster than the server saw', async () => {
    const s = setup()
    const token = await startRun(s)
    s.advance(10000)
    const r = await s.call('score', { body: score(token, { timeMs: 70000 }) })
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ error: 'elapsed_mismatch' })
  })

  it('rejects impossible times, too many tokens, bad nicknames and forged tokens', async () => {
    const s = setup()
    s.advance(0)
    let token = await startRun(s)
    s.advance(100000)
    expect((await s.call('score', { body: score(token, { timeMs: 1000 }) })).body).toMatchObject({
      error: 'too_fast',
    })
    token = await startRun(s)
    s.advance(100000)
    expect((await s.call('score', { body: score(token, { tokens: 999 }) })).body).toMatchObject({
      error: 'too_many_tokens',
    })
    token = await startRun(s)
    s.advance(100000)
    expect(
      (await s.call('score', { body: score(token, { nickname: 'http://x.io' }) })).body,
    ).toMatchObject({ error: 'bad_nickname' })
    expect((await s.call('score', { body: score(token + 'x') })).body).toMatchObject({
      error: 'token_bad_signature',
    })
  })

  it('does not burn the token on a malformed submission', async () => {
    const s = setup()
    const token = await startRun(s)
    s.advance(72000)
    expect((await s.call('score', { body: score(token, { timeMs: 'fast' }) })).status).toBe(400)
    expect((await s.call('score', { body: score(token) })).status).toBe(200)
  })

  it('keeps only each player best time (ZADD LT)', async () => {
    const s = setup()
    let token = await startRun(s)
    s.advance(80000)
    await s.call('score', { body: score(token, { timeMs: 78000 }) })
    token = await startRun(s)
    s.advance(80000)
    const worse = await s.call('score', { body: score(token, { timeMs: 79000 }) })
    expect(worse.body).toMatchObject({ improved: false, bestTimeMs: 78000 })
    token = await startRun(s)
    s.advance(80000)
    const better = await s.call('score', { body: score(token, { timeMs: 60000 }) })
    expect(better.body).toMatchObject({ improved: true, bestTimeMs: 60000, total: 1 })
  })

  it('weekly keys expire after 14 days and are scoped by ISO week', async () => {
    const s = setup()
    const token = await startRun(s)
    s.advance(72000)
    await s.call('score', { body: score(token) })
    const key = `lb:garden:week:${isoWeek(new Date(s.now()))}`
    expect(s.store.ttl(key)).toBe(14 * 24 * 3600)
    expect(await s.store.zcard(key)).toBe(1)
    s.advance(15 * 24 * 3600 * 1000)
    expect(await s.store.zcard(key)).toBe(0)
  })
})

describe('rate limiting', () => {
  it('limits score submissions per IP (10/min) and recovers after the window', async () => {
    const s = setup()
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const token = await startRun(s, `player-${String(i).padStart(8, '0')}`, '9.9.9.9').catch(
        () => '',
      )
      const r = await s.call('score', { body: score(token || 'x'), ip: '9.9.9.9' })
      statuses.push(r.status)
    }
    expect(statuses.slice(0, 10).every((x) => x !== 429)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
    s.advance(61000)
    const r = await s.call('score', { body: score('x'), ip: '9.9.9.9' })
    expect(r.status).not.toBe(429)
  })

  it('limits per player across different IPs', async () => {
    const s = setup()
    const codes: number[] = []
    for (let i = 0; i < 12; i++) {
      const token = signRunToken(SECRET, 'garden', PLAYER, s.now())
      const r = await s.call('score', { body: score(token, { timeMs: 'bad' }), ip: `10.0.0.${i}` })
      codes.push(r.status)
    }
    expect(codes.slice(0, 10).every((x) => x === 400)).toBe(true)
    expect(codes.slice(10)).toEqual([429, 429])
  })

  it('hashes IPs with a salt and never stores them raw', async () => {
    const s = setup()
    await startRun(s, PLAYER, '203.0.113.7')
    const h = hashIp(SECRET, '203.0.113.7')
    expect(h).toHaveLength(20)
    expect(h).not.toContain('203')
    expect(hashIp('other', '203.0.113.7')).not.toBe(h)
    expect(
      JSON.stringify([
        ...(s.store as unknown as { counters: Map<string, unknown> }).counters.keys(),
      ]),
    ).not.toContain('203.0.113.7')
  })
})

describe('GET /api/leaderboard', () => {
  async function seed(s: ReturnType<typeof setup>, n: number) {
    for (let i = 0; i < n; i++) {
      const pid = `player-${String(i).padStart(8, '0')}`
      const token = await startRun(s, pid, `5.5.5.${i}`)
      s.advance(100000)
      const r = await s.call('score', {
        body: score(token, { timeMs: 60000 + i * 1000, nickname: `Racer${i}` }),
        ip: `5.5.5.${i}`,
      })
      expect(r.status).toBe(200)
    }
  }
  it('returns the top N, caller rank and entries around them', async () => {
    const s = setup()
    await seed(s, 9)
    const r = await s.call('leaderboard', {
      method: 'GET',
      query: { level: 'garden', scope: 'all', limit: '3', playerId: 'player-00000007' },
    })
    expect(r.status).toBe(200)
    const b = r.body as {
      top: { nickname: string; rank: number }[]
      you: { rank: number; isYou: boolean }
      around: { rank: number }[]
      total: number
    }
    expect(b.total).toBe(9)
    expect(b.top.map((e) => e.nickname)).toEqual(['Racer0', 'Racer1', 'Racer2'])
    expect(b.you).toMatchObject({ rank: 8, isYou: true })
    expect(b.around.map((e) => e.rank)).toEqual([6, 7, 8, 9])
    expect(JSON.stringify(b)).not.toContain('player-0000')
  })
  it('validates level and scope, supports week scope', async () => {
    const s = setup()
    await seed(s, 2)
    expect((await s.call('leaderboard', { method: 'GET', query: { level: 'nope' } })).status).toBe(
      400,
    )
    expect(
      (await s.call('leaderboard', { method: 'GET', query: { level: 'garden', scope: 'year' } }))
        .status,
    ).toBe(400)
    const w = await s.call('leaderboard', {
      method: 'GET',
      query: { level: 'garden', scope: 'week' },
    })
    expect((w.body as { top: unknown[] }).top).toHaveLength(2)
  })
})

describe('CORS and configuration', () => {
  it('allows the game origin and the Arcade portal only', async () => {
    const s = setup()
    const ok = await s.call('leaderboard', {
      method: 'GET',
      query: { level: 'garden' },
      headers: { origin: 'https://games.khaw.cc', host: 'pocket.example.com' },
    })
    expect(ok.headers['Access-Control-Allow-Origin']).toBe('https://games.khaw.cc')
    const same = await s.call('leaderboard', {
      method: 'GET',
      query: { level: 'garden' },
      headers: { origin: 'https://pocket.example.com', host: 'pocket.example.com' },
    })
    expect(same.status).toBe(200)
    const evil = await s.call('leaderboard', {
      method: 'GET',
      query: { level: 'garden' },
      headers: { origin: 'https://evil.example', host: 'pocket.example.com' },
    })
    expect(evil.status).toBe(403)
    expect(evil.headers['Access-Control-Allow-Origin']).toBeUndefined()
    const pre = await s.call('score', {
      method: 'OPTIONS',
      headers: { origin: 'https://games.khaw.cc' },
    })
    expect(pre.status).toBe(204)
    expect(isAllowedOrigin('https://x.khaw.cc', 'h', { extraOrigins: [], production: true })).toBe(
      false,
    )
  })

  it('uses MemoryStore without env vars locally and reports not_configured in production', () => {
    const local = loadConfig({})
    expect('store' in local && local.store.kind).toBe('memory')
    expect(loadConfig({ VERCEL: '1' })).toEqual({ error: 'not_configured' })
    const neon = loadConfig({
      VERCEL: '1',
      DATABASE_URL: 'postgres://u:p@host/db',
      LEADERBOARD_SECRET: 's',
    })
    expect('store' in neon && neon.store.kind).toBe('neon')
    const alt = loadConfig({ POSTGRES_URL: 'postgres://u:p@host/db', LEADERBOARD_SECRET: 's' })
    expect('store' in alt && alt.store.kind).toBe('neon')
  })
})

// The same behaviour must hold on a real Postgres (PGlite) as on the memory store.
describe.each([
  ['memory', async () => new MemoryStore() as ScoreStore],
  [
    'neon (postgres)',
    async () => {
      const db = new PGlite()
      return new NeonStore({
        query: async (t, p) => ({ rows: (await db.query(t, p)).rows as Record<string, unknown>[] }),
      }) as ScoreStore
    },
  ],
])('ScoreStore contract: %s', (_name, make) => {
  it('keeps the best score per member and ranks ascending with stable ties', async () => {
    const s = await make()
    expect(await s.zaddLt('k', 500, 'a')).toBe(true)
    expect(await s.zaddLt('k', 600, 'a')).toBe(false)
    expect(await s.zaddLt('k', 400, 'a')).toBe(true)
    await s.zaddLt('k', 300, 'c')
    await s.zaddLt('k', 400, 'b')
    expect(await s.zrange('k', 0, -1)).toEqual([
      { member: 'c', score: 300 },
      { member: 'a', score: 400 },
      { member: 'b', score: 400 },
    ])
    expect(await s.zrange('k', 1, 1)).toEqual([{ member: 'a', score: 400 }])
    expect(await s.zrank('k', 'b')).toBe(2)
    expect(await s.zrank('k', 'zz')).toBeNull()
    expect(await s.zscore('k', 'a')).toBe(400)
    expect(await s.zcard('k')).toBe(3)
  })
  it('hashes, counters and set-if-absent flags', async () => {
    const s = await make()
    await s.hset('player:1', 'nick', 'Ann')
    await s.hset('player:1', 'nick', 'Anna')
    expect(await s.hgetMany(['player:1', 'player:2'], 'nick')).toEqual(['Anna', null])
    expect(await s.incr('c', 60)).toBe(1)
    expect(await s.incr('c', 60)).toBe(2)
    expect(await s.setNx('f', 60)).toBe(true)
    expect(await s.setNx('f', 60)).toBe(false)
  })
  it('expires sorted sets', async () => {
    const s = await make()
    await s.zaddLt('w', 100, 'a')
    await s.expire('w', 0)
    await new Promise((r) => setTimeout(r, 20))
    expect(await s.zcard('w')).toBe(0)
  })
})
