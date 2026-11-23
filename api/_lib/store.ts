/** Storage abstraction for the leaderboard. Production uses Neon (serverless Postgres), tests and local dev use memory. */
export interface ScoredMember {
  member: string
  score: number
}

export interface ScoreStore {
  readonly kind: 'memory' | 'neon'
  /** ZADD key LT CH score member. True if the member was added or its score improved (lowered). */
  zaddLt(key: string, score: number, member: string): Promise<boolean>
  zscore(key: string, member: string): Promise<number | null>
  /** 0-based rank, lowest score first. */
  zrank(key: string, member: string): Promise<number | null>
  zrange(key: string, start: number, stop: number): Promise<ScoredMember[]>
  zcard(key: string): Promise<number>
  hset(key: string, field: string, value: string): Promise<void>
  hgetMany(keys: string[], field: string): Promise<(string | null)[]>
  expire(key: string, seconds: number): Promise<void>
  /** Atomic increment; sets the TTL when the key is created. Returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>
  /** SET key 1 NX EX ttl. True if the key did not exist. */
  setNx(key: string, ttlSeconds: number): Promise<boolean>
}

interface Expiring<T> {
  value: T
  expiresAt: number
}

export class MemoryStore implements ScoreStore {
  readonly kind = 'memory' as const
  private zsets = new Map<string, Map<string, number>>()
  private hashes = new Map<string, Map<string, string>>()
  private counters = new Map<string, Expiring<number>>()
  private flags = new Map<string, number>()
  private zExpiry = new Map<string, number>()
  /** Injectable clock so tests can fast-forward. */
  now: () => number = () => Date.now()

  private live(key: string): Map<string, number> | undefined {
    const exp = this.zExpiry.get(key)
    if (exp !== undefined && exp <= this.now()) {
      this.zsets.delete(key)
      this.zExpiry.delete(key)
    }
    return this.zsets.get(key)
  }

  async zaddLt(key: string, score: number, member: string): Promise<boolean> {
    let z = this.live(key)
    if (!z) this.zsets.set(key, (z = new Map()))
    const cur = z.get(member)
    if (cur === undefined || score < cur) {
      z.set(member, score)
      return true
    }
    return false
  }

  private sorted(key: string): ScoredMember[] {
    const z = this.live(key)
    if (!z) return []
    return [...z.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1))
  }

  async zscore(key: string, member: string): Promise<number | null> {
    return this.live(key)?.get(member) ?? null
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const i = this.sorted(key).findIndex((m) => m.member === member)
    return i < 0 ? null : i
  }

  async zrange(key: string, start: number, stop: number): Promise<ScoredMember[]> {
    const all = this.sorted(key)
    const s = Math.max(0, start)
    const e = stop < 0 ? all.length + stop : stop
    return all.slice(s, e + 1)
  }

  async zcard(key: string): Promise<number> {
    return this.live(key)?.size ?? 0
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    let h = this.hashes.get(key)
    if (!h) this.hashes.set(key, (h = new Map()))
    h.set(field, value)
  }

  async hgetMany(keys: string[], field: string): Promise<(string | null)[]> {
    return keys.map((k) => this.hashes.get(k)?.get(field) ?? null)
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.zExpiry.set(key, this.now() + seconds * 1000)
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const c = this.counters.get(key)
    if (!c || c.expiresAt <= this.now()) {
      this.counters.set(key, { value: 1, expiresAt: this.now() + ttlSeconds * 1000 })
      return 1
    }
    c.value++
    return c.value
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const exp = this.flags.get(key)
    if (exp !== undefined && exp > this.now()) return false
    this.flags.set(key, this.now() + ttlSeconds * 1000)
    return true
  }

  /** Test helper: TTL in seconds for a sorted set key. */
  ttl(key: string): number | null {
    const exp = this.zExpiry.get(key)
    return exp === undefined ? null : Math.round((exp - this.now()) / 1000)
  }
}

/** Minimal SQL client: `@neondatabase/serverless` in production, PGlite in tests. */
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lb_scores (
    key text NOT NULL, member text NOT NULL, score bigint NOT NULL, expires_at timestamptz,
    PRIMARY KEY (key, member))`,
  `CREATE INDEX IF NOT EXISTS lb_scores_rank ON lb_scores (key, score, member)`,
  `CREATE TABLE IF NOT EXISTS lb_hashes (
    key text NOT NULL, field text NOT NULL, value text NOT NULL, PRIMARY KEY (key, field))`,
  `CREATE TABLE IF NOT EXISTS lb_counters (
    key text PRIMARY KEY, value integer NOT NULL, expires_at timestamptz NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS lb_flags (key text PRIMARY KEY, expires_at timestamptz NOT NULL)`,
]

const LIVE = '(expires_at IS NULL OR expires_at > now())'

/** Neon Postgres store. Sorted sets become rows in lb_scores; weekly keys expire via expires_at. */
export class NeonStore implements ScoreStore {
  readonly kind = 'neon' as const
  private ready: Promise<void> | null = null
  private client: Promise<SqlClient> | null = null

  /** Pass a connection string (lazy Neon driver) or a ready client (tests). */
  constructor(source: string | SqlClient) {
    this.client = typeof source === 'string' ? null : Promise.resolve(source)
    this.url = typeof source === 'string' ? source : null
  }
  private url: string | null

  private async sql(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (!this.client) {
      const url = this.url as string
      this.client = import('@neondatabase/serverless').then((m) => {
        const q = m.neon(url)
        return {
          query: async (t: string, p?: unknown[]) => ({
            rows: (await q.query(t, p)) as Record<string, unknown>[],
          }),
        }
      })
    }
    const c = await this.client
    if (!this.ready) {
      this.ready = (async () => {
        for (const stmt of SCHEMA) await c.query(stmt)
      })().catch((e) => {
        this.ready = null
        throw e
      })
    }
    await this.ready
    return (await c.query(text, params)).rows
  }

  async zaddLt(key: string, score: number, member: string): Promise<boolean> {
    const rows = await this.sql(
      `INSERT INTO lb_scores (key, member, score) VALUES ($1, $2, $3)
       ON CONFLICT (key, member) DO UPDATE SET score = EXCLUDED.score, expires_at = NULL
       WHERE lb_scores.score > EXCLUDED.score OR lb_scores.expires_at <= now()
       RETURNING 1`,
      [key, member, score],
    )
    return rows.length > 0
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const rows = await this.sql(
      `SELECT score FROM lb_scores WHERE key = $1 AND member = $2 AND ${LIVE}`,
      [key, member],
    )
    return rows.length ? Number(rows[0].score) : null
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const s = await this.zscore(key, member)
    if (s === null) return null
    const rows = await this.sql(
      `SELECT count(*)::int AS n FROM lb_scores WHERE key = $1 AND ${LIVE} AND (score < $2 OR (score = $2 AND member < $3))`,
      [key, s, member],
    )
    return Number(rows[0].n)
  }

  async zrange(key: string, start: number, stop: number): Promise<ScoredMember[]> {
    const offset = Math.max(0, start)
    const limit = stop < 0 ? null : Math.max(0, stop - offset + 1)
    const rows = await this.sql(
      `SELECT member, score FROM lb_scores WHERE key = $1 AND ${LIVE} ORDER BY score, member OFFSET $2 LIMIT $3`,
      [key, offset, limit],
    )
    return rows.map((r) => ({ member: String(r.member), score: Number(r.score) }))
  }

  async zcard(key: string): Promise<number> {
    const rows = await this.sql(
      `SELECT count(*)::int AS n FROM lb_scores WHERE key = $1 AND ${LIVE}`,
      [key],
    )
    return Number(rows[0].n)
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.sql(
      `INSERT INTO lb_hashes (key, field, value) VALUES ($1, $2, $3)
       ON CONFLICT (key, field) DO UPDATE SET value = EXCLUDED.value`,
      [key, field, value],
    )
  }

  async hgetMany(keys: string[], field: string): Promise<(string | null)[]> {
    if (keys.length === 0) return []
    const rows = await this.sql(
      `SELECT key, value FROM lb_hashes WHERE field = $1 AND key = ANY($2::text[])`,
      [field, keys],
    )
    const m = new Map(rows.map((r) => [String(r.key), String(r.value)]))
    return keys.map((k) => m.get(k) ?? null)
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.sql(
      `UPDATE lb_scores SET expires_at = now() + make_interval(secs => $2) WHERE key = $1`,
      [key, seconds],
    )
    // opportunistic cleanup of dead rows and counters
    await this.sql(`DELETE FROM lb_scores WHERE expires_at <= now()`)
    await this.sql(`DELETE FROM lb_counters WHERE expires_at <= now()`)
    await this.sql(`DELETE FROM lb_flags WHERE expires_at <= now()`)
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const rows = await this.sql(
      `INSERT INTO lb_counters (key, value, expires_at) VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET
         value = CASE WHEN lb_counters.expires_at <= now() THEN 1 ELSE lb_counters.value + 1 END,
         expires_at = CASE WHEN lb_counters.expires_at <= now() THEN now() + make_interval(secs => $2) ELSE lb_counters.expires_at END
       RETURNING value`,
      [key, ttlSeconds],
    )
    return Number(rows[0].value)
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const rows = await this.sql(
      `INSERT INTO lb_flags (key, expires_at) VALUES ($1, now() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at WHERE lb_flags.expires_at <= now()
       RETURNING 1`,
      [key, ttlSeconds],
    )
    return rows.length > 0
  }
}
