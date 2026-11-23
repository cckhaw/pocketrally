// Minimal Vercel REST client shared by the deploy scripts. Never logs the token.

const API = 'https://api.vercel.com'

export const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {{ token: string, teamId?: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, maxRetries?: number }} opts
 */
export function createClient({
  token,
  teamId,
  fetchImpl = fetch,
  sleep = defaultSleep,
  maxRetries = 5,
}) {
  if (!token) throw new Error('VERCEL_TOKEN is not set')

  /** Request with retry/backoff on 429 and 5xx. Returns { status, body }. Throws on other non-2xx. */
  async function request(method, path, query = {}) {
    const url = new URL(API + path)
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    if (teamId) url.searchParams.set('teamId', teamId)
    let attempt = 0
    for (;;) {
      let res
      try {
        res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}` } })
      } catch (cause) {
        if (attempt >= maxRetries)
          throw new Error(`network error calling ${method} ${path}`, { cause })
        await sleep(backoff(attempt++))
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers?.get?.('retry-after'))
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30000)
            : backoff(attempt),
        )
        attempt++
        continue
      }
      let body = null
      try {
        body = await res.json()
      } catch {
        /* empty body */
      }
      if (!res.ok) {
        const code = body?.error?.code ?? 'error'
        const err = new Error(`${method} ${path} failed: ${res.status} ${code}`)
        err.status = res.status
        throw err
      }
      return { status: res.status, body }
    }
  }

  return {
    request,
    get: (path, query) => request('GET', path, query).then((r) => r.body),
    del: (path, query) => request('DELETE', path, query),
  }
}

function backoff(attempt) {
  return Math.min(500 * 2 ** attempt, 8000)
}

/** Reads credentials from the environment (workflow maps `secrets.X || vars.X` into these). */
export function clientFromEnv(env = process.env, extra = {}) {
  return {
    projectId: env.VERCEL_PROJECT_ID,
    client: createClient({
      token: env.VERCEL_TOKEN ?? '',
      teamId: env.VERCEL_TEAM_ID || undefined,
      ...extra,
    }),
  }
}

/** Append `key=value` lines to $GITHUB_OUTPUT and text to $GITHUB_STEP_SUMMARY when running in Actions. */
export async function githubOutput(entries, summary, env = process.env) {
  const { appendFile } = await import('node:fs/promises')
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      Object.entries(entries)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(''),
    )
  }
  if (summary && env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary + '\n')
}
