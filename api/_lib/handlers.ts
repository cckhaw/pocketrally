import { getLevel } from '../../src/levels'
import { validateNickname } from '../../src/net/nickname'
import { isAllowedOrigin, loadConfig, PORTAL_ORIGIN, type ApiConfig, type Env } from './config'
import { hashIp, hit, LIMITS } from './ratelimit'
import { checkScore } from './rules'
import { signRunToken, verifyRunToken } from './token'
import { isoWeek } from './week'

export interface ApiRequest {
  method: string
  query: Record<string, string | undefined>
  body: unknown
  headers: Record<string, string | undefined>
  ip: string
}

export interface ApiResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export type Route = 'run/start' | 'score' | 'leaderboard'

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const WEEK_TTL = 14 * 24 * 3600

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ApiResponse => ({
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  },
  body,
})
const fail = (status: number, error: string, message: string, headers?: Record<string, string>) =>
  respond(status, { error, message }, headers)

export interface Deps {
  env: Env
  now?: () => number
  /** Preconfigured config (tests). */
  config?: ApiConfig
}

export async function handle(route: Route, req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  const cfgOrErr = deps.config ?? loadConfig(deps.env)
  if ('error' in cfgOrErr)
    return fail(503, 'not_configured', 'Leaderboard is not configured on this deployment')
  const cfg = cfgOrErr
  const now = deps.now ?? Date.now

  const origin = req.headers.origin
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  const allowed = isAllowedOrigin(origin, host, cfg)
  const cors: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  }
  if (origin && allowed) cors['Access-Control-Allow-Origin'] = origin
  const withCors = (r: ApiResponse): ApiResponse => ({ ...r, headers: { ...r.headers, ...cors } })

  if (req.method === 'OPTIONS')
    return withCors({ status: allowed ? 204 : 403, headers: {}, body: null })
  if (!allowed)
    return withCors(
      fail(
        403,
        'forbidden_origin',
        `Requests are only accepted from the game and ${PORTAL_ORIGIN}`,
      ),
    )

  try {
    const ipKey = hashIp(cfg.secret, req.ip || 'unknown')
    if (route === 'run/start') return withCors(await runStart(req, cfg, ipKey, now))
    if (route === 'score') return withCors(await postScore(req, cfg, ipKey, now))
    return withCors(await getLeaderboard(req, cfg, ipKey, now))
  } catch (e) {
    console.error('api error', e instanceof Error ? e.message : e)
    return withCors(fail(500, 'server_error', 'Something went wrong'))
  }
}

async function runStart(
  req: ApiRequest,
  cfg: ApiConfig,
  ipKey: string,
  now: () => number,
): Promise<ApiResponse> {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST')
  const body = (req.body ?? {}) as { levelId?: unknown; playerId?: unknown }
  if (typeof body.levelId !== 'string' || !getLevel(body.levelId))
    return fail(400, 'bad_level', 'Unknown level')
  if (typeof body.playerId !== 'string' || !ID_RE.test(body.playerId))
    return fail(400, 'bad_player', 'Invalid playerId')
  const ip = await hit(cfg.store, `rl:start:ip:${ipKey}`, LIMITS.startPerIp)
  const pl = await hit(cfg.store, `rl:start:pl:${body.playerId}`, LIMITS.startPerPlayer)
  if (!ip.allowed || !pl.allowed)
    return fail(429, 'rate_limited', 'Too many runs started, slow down', { 'Retry-After': '30' })
  return respond(200, { runToken: signRunToken(cfg.secret, body.levelId, body.playerId, now()) })
}

async function postScore(
  req: ApiRequest,
  cfg: ApiConfig,
  ipKey: string,
  now: () => number,
): Promise<ApiResponse> {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST')
  const body = (req.body ?? {}) as Record<string, unknown>
  if (typeof body.runToken !== 'string') return fail(400, 'bad_token', 'runToken is required')

  const ipLimit = await hit(cfg.store, `rl:score:ip:${ipKey}`, LIMITS.scorePerIp)
  if (!ipLimit.allowed)
    return fail(429, 'rate_limited', 'Too many submissions, slow down', { 'Retry-After': '30' })

  const v = verifyRunToken(cfg.secret, body.runToken, now())
  if (!v.ok) return fail(400, `token_${v.reason}`, 'Invalid or expired run token')
  const { l: levelId, p: playerId, t: startMs, n: nonce } = v.claims
  const level = getLevel(levelId)
  if (!level) return fail(400, 'bad_level', 'Unknown level')

  const plLimit = await hit(cfg.store, `rl:score:pl:${playerId}`, LIMITS.scorePerPlayer)
  if (!plLimit.allowed)
    return fail(429, 'rate_limited', 'Too many submissions, slow down', { 'Retry-After': '30' })

  const nick = validateNickname(body.nickname)
  if (!nick.ok) return fail(400, 'bad_nickname', nick.reason)

  // Shape checks happen before the token is consumed so a client bug does not burn a valid run.
  const rule = checkScore(
    level,
    { timeMs: body.timeMs, tokens: body.tokens, inputLogHash: body.inputLogHash },
    now() - startMs,
  )
  const shapeOnly = !rule.ok && ['bad_time', 'bad_tokens', 'bad_hash'].includes(rule.code)
  if (shapeOnly && !rule.ok) return fail(400, rule.code, rule.message)

  const fresh = await cfg.store.setNx(`used:${nonce}`, 6 * 3600 + 60)
  if (!fresh) return fail(409, 'token_used', 'This run was already submitted')
  if (!rule.ok) return fail(422, rule.code, rule.message)

  const allKey = `lb:${levelId}:all`
  const weekKey = `lb:${levelId}:week:${isoWeek(new Date(now()))}`
  const improved = await cfg.store.zaddLt(allKey, rule.timeMs, playerId)
  await cfg.store.zaddLt(weekKey, rule.timeMs, playerId)
  await cfg.store.expire(weekKey, WEEK_TTL)
  await cfg.store.hset(`player:${playerId}`, 'nick', nick.nickname)

  const best = (await cfg.store.zscore(allKey, playerId)) ?? rule.timeMs
  const rank = ((await cfg.store.zrank(allKey, playerId)) ?? 0) + 1
  const weekRank = ((await cfg.store.zrank(weekKey, playerId)) ?? 0) + 1
  const total = await cfg.store.zcard(allKey)
  return respond(200, { ok: true, rank, weekRank, bestTimeMs: best, improved, total })
}

async function getLeaderboard(
  req: ApiRequest,
  cfg: ApiConfig,
  ipKey: string,
  now: () => number,
): Promise<ApiResponse> {
  if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET')
  const q = req.query
  const level = q.level ? getLevel(q.level) : undefined
  if (!level) return fail(400, 'bad_level', 'Unknown level')
  const scope = q.scope === 'week' ? 'week' : q.scope === 'all' || !q.scope ? 'all' : null
  if (!scope) return fail(400, 'bad_scope', 'scope must be all or week')
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit ?? 50)) || 50))
  const playerId = q.playerId && ID_RE.test(q.playerId) ? q.playerId : null
  const rl = await hit(cfg.store, `rl:read:ip:${ipKey}`, LIMITS.readPerIp)
  if (!rl.allowed) return fail(429, 'rate_limited', 'Too many requests', { 'Retry-After': '30' })

  const key =
    scope === 'all' ? `lb:${level.id}:all` : `lb:${level.id}:week:${isoWeek(new Date(now()))}`
  const [top, total] = await Promise.all([
    cfg.store.zrange(key, 0, limit - 1),
    cfg.store.zcard(key),
  ])
  let youRank: number | null = null
  let youScore: number | null = null
  let around: { member: string; score: number; rank: number }[] = []
  if (playerId) {
    youRank = await cfg.store.zrank(key, playerId)
    youScore = await cfg.store.zscore(key, playerId)
    if (youRank !== null && youRank >= limit) {
      const lo = Math.max(0, youRank - 2)
      const slice = await cfg.store.zrange(key, lo, youRank + 2)
      around = slice.map((m, i) => ({ ...m, rank: lo + i + 1 }))
    }
  }
  const ids = new Set<string>([...top.map((t) => t.member), ...around.map((a) => a.member)])
  if (playerId && youRank !== null) ids.add(playerId)
  const idList = [...ids]
  const nicks = await cfg.store.hgetMany(
    idList.map((id) => `player:${id}`),
    'nick',
  )
  const nickOf = new Map(idList.map((id, i) => [id, nicks[i] ?? 'Anonymous']))
  const entry = (member: string, score: number, rank: number) => ({
    rank,
    nickname: nickOf.get(member) ?? 'Anonymous',
    timeMs: score,
    isYou: member === playerId,
  })
  return respond(200, {
    levelId: level.id,
    scope,
    total,
    top: top.map((t, i) => entry(t.member, t.score, i + 1)),
    you:
      playerId && youRank !== null && youScore !== null
        ? entry(playerId, youScore, youRank + 1)
        : null,
    around: around.map((a) => entry(a.member, a.score, a.rank)),
  })
}
