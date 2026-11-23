/** Storage abstraction for the leaderboard. Production uses Upstash Redis (REST), tests and local dev use memory. */
export interface ScoredMember {
  member: string
  score: number
}

export interface ScoreStore {
  readonly kind: 'memory' | 'upstash'
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

export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/** Upstash Redis over its REST API (no client dependency). */
export class UpstashStore implements ScoreStore {
  readonly kind = 'upstash' as const

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(this.url.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`upstash http ${res.status}`)
    return res.json()
  }

  private async cmd(...args: (string | number)[]): Promise<unknown> {
    const r = (await this.post('', args)) as { result?: unknown; error?: string }
    if (r.error) throw new Error(`upstash: ${r.error}`)
    return r.result
  }

  private async pipeline(cmds: (string | number)[][]): Promise<unknown[]> {
    if (cmds.length === 0) return []
    const r = (await this.post('/pipeline', cmds)) as { result?: unknown; error?: string }[]
    return r.map((x) => {
      if (x.error) throw new Error(`upstash: ${x.error}`)
      return x.result
    })
  }

  async zaddLt(key: string, score: number, member: string): Promise<boolean> {
    return Number(await this.cmd('ZADD', key, 'LT', 'CH', score, member)) > 0
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const r = await this.cmd('ZSCORE', key, member)
    return r === null || r === undefined ? null : Number(r)
  }

  async zrank(key: string, member: string): Promise<number | null> {
    const r = await this.cmd('ZRANK', key, member)
    return r === null || r === undefined ? null : Number(r)
  }

  async zrange(key: string, start: number, stop: number): Promise<ScoredMember[]> {
    const r = (await this.cmd('ZRANGE', key, Math.max(0, start), stop, 'WITHSCORES')) as string[]
    const out: ScoredMember[] = []
    for (let i = 0; i + 1 < r.length; i += 2)
      out.push({ member: String(r[i]), score: Number(r[i + 1]) })
    return out
  }

  async zcard(key: string): Promise<number> {
    return Number(await this.cmd('ZCARD', key))
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.cmd('HSET', key, field, value)
  }

  async hgetMany(keys: string[], field: string): Promise<(string | null)[]> {
    const r = await this.pipeline(keys.map((k) => ['HGET', k, field]))
    return r.map((v) => (v === null || v === undefined ? null : String(v)))
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.cmd('EXPIRE', key, seconds)
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const [n] = await this.pipeline([
      ['INCR', key],
      ['EXPIRE', key, ttlSeconds, 'NX'],
    ])
    return Number(n)
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.cmd('SET', key, '1', 'NX', 'EX', ttlSeconds)) === 'OK'
  }
}
