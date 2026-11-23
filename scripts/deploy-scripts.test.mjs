import { describe, expect, it } from 'vitest'
import { cleanup, listAllDeployments, selectDeletions } from './cleanup-deployments.mjs'
import { normaliseRef, waitForProduction } from './wait-for-production.mjs'
import { createClient } from './lib/vercel.mjs'

const dep = (id) => ({ uid: id })

/** Fake Vercel API with pagination and recorded calls. */
function fakeApi({ deployments, productionId, failDeletes = [], rateLimitFirst = 0 }) {
  const calls = []
  let limited = 0
  const client = {
    async get(path, query = {}) {
      calls.push(['GET', path, query])
      if (path.startsWith('/v9/projects/')) return { targets: { production: { id: productionId } } }
      if (path === '/v6/deployments') {
        const sorted = deployments
        const start = query.until ? sorted.findIndex((d) => d.uid === query.until) : 0
        const page = sorted.slice(start, start + 2) // tiny pages to force pagination
        const nextItem = sorted[start + 2]
        return { deployments: page, pagination: { next: nextItem ? nextItem.uid : null } }
      }
      throw new Error('unexpected ' + path)
    },
    async del(path) {
      calls.push(['DELETE', path])
      const id = path.split('/').pop()
      if (limited < rateLimitFirst) {
        limited++
        const e = new Error('429')
        e.status = 429
        throw e
      }
      if (failDeletes.includes(id)) {
        const e = new Error('boom')
        e.status = 500
        throw e
      }
      return { status: 200 }
    },
  }
  return { client, calls }
}

describe('selectDeletions', () => {
  it('keeps the new and production deployments and deletes the rest', () => {
    const r = selectDeletions(
      [dep('dpl_new'), dep('dpl_old1'), dep('dpl_prod'), dep('dpl_old2'), dep('dpl_old1')],
      {
        newId: 'dpl_new',
        productionId: 'dpl_prod',
      },
    )
    expect(r.kept.sort()).toEqual(['dpl_new', 'dpl_prod'])
    expect(r.toDelete).toEqual(['dpl_old1', 'dpl_old2'])
  })
  it('ignores entries without an id', () => {
    expect(
      selectDeletions([{}, dep('dpl_a')], { newId: 'dpl_n', productionId: 'dpl_n' }).toDelete,
    ).toEqual(['dpl_a'])
  })
})

describe('listAllDeployments', () => {
  it('follows pagination until exhausted', async () => {
    const { client, calls } = fakeApi({
      deployments: ['a', 'b', 'c', 'd', 'e'].map(dep),
      productionId: 'dpl_x',
    })
    const all = await listAllDeployments(client, 'prj')
    expect(all.map((d) => d.uid)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(calls.filter((c) => c[1] === '/v6/deployments')).toHaveLength(3)
    expect(calls[0][2]).toMatchObject({ projectId: 'prj', limit: 100 })
  })
})

describe('cleanup', () => {
  const ids = ['dpl_new', 'dpl_a', 'dpl_b', 'dpl_c', 'dpl_d']
  it('deletes everything but the new production deployment', async () => {
    const { client, calls } = fakeApi({ deployments: ids.map(dep), productionId: 'dpl_new' })
    const r = await cleanup({ client, projectId: 'prj', newId: 'dpl_new' })
    expect(r.deleted.sort()).toEqual(['dpl_a', 'dpl_b', 'dpl_c', 'dpl_d'])
    expect(r.failed).toEqual([])
    expect(calls.filter((c) => c[0] === 'DELETE').map((c) => c[1])).not.toContain(
      '/v13/deployments/dpl_new',
    )
  })
  it('dry run lists but never deletes', async () => {
    const { client, calls } = fakeApi({ deployments: ids.map(dep), productionId: 'dpl_new' })
    const logs = []
    const r = await cleanup({
      client,
      projectId: 'prj',
      newId: 'dpl_new',
      dryRun: true,
      log: (s) => logs.push(s),
    })
    expect(r.deleted).toEqual([])
    expect(calls.some((c) => c[0] === 'DELETE')).toBe(false)
    expect(logs.filter((l) => l.startsWith('would delete'))).toHaveLength(4)
  })
  it('refuses to run if the new deployment is not the production target', async () => {
    const { client, calls } = fakeApi({ deployments: ids.map(dep), productionId: 'dpl_other' })
    await expect(cleanup({ client, projectId: 'prj', newId: 'dpl_new' })).rejects.toThrow(
      /not the new deployment/,
    )
    expect(calls.some((c) => c[0] === 'DELETE')).toBe(false)
  })
  it('rejects a missing or malformed new deployment id', async () => {
    const { client } = fakeApi({ deployments: [], productionId: 'x' })
    await expect(cleanup({ client, projectId: 'prj', newId: undefined })).rejects.toThrow()
    await expect(cleanup({ client, projectId: 'prj', newId: 'not-an-id' })).rejects.toThrow()
  })
  it('continues past individual failures and reports them', async () => {
    const { client } = fakeApi({
      deployments: ids.map(dep),
      productionId: 'dpl_new',
      failDeletes: ['dpl_b'],
    })
    const r = await cleanup({ client, projectId: 'prj', newId: 'dpl_new' })
    expect(r.failed).toEqual(['dpl_b'])
    expect(r.deleted.sort()).toEqual(['dpl_a', 'dpl_c', 'dpl_d'])
  })
})

describe('createClient retry', () => {
  const mk = (statuses) => {
    let i = 0
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(String(url))
      const status = statuses[Math.min(i++, statuses.length - 1)]
      return {
        ok: status < 300,
        status,
        headers: new Map(),
        json: async () => ({ ok: status < 300 }),
      }
    }
    return { fetchImpl, calls }
  }
  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    const { fetchImpl, calls } = mk([429, 503, 200])
    const sleeps = []
    const c = createClient({
      token: 't',
      teamId: 'team_1',
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
    })
    const body = await c.get('/v9/projects/p')
    expect(body).toEqual({ ok: true })
    expect(sleeps).toHaveLength(2)
    expect(calls[0]).toContain('teamId=team_1')
  })
  it('omits teamId when empty and gives up after max retries', async () => {
    const { fetchImpl, calls } = mk([500])
    const c = createClient({ token: 't', fetchImpl, sleep: async () => {}, maxRetries: 2 })
    await expect(c.get('/x')).rejects.toThrow(/500/)
    expect(calls).toHaveLength(3)
    expect(calls[0]).not.toContain('teamId')
  })
  it('never includes the token in error messages', async () => {
    const { fetchImpl } = mk([403])
    const c = createClient({ token: 'super-secret-token', fetchImpl, sleep: async () => {} })
    await expect(c.get('/x')).rejects.not.toThrow(/super-secret-token/)
  })
})

describe('waitForProduction', () => {
  function sim(timeline) {
    let t = 0
    let i = 0
    const client = {
      async get(path) {
        const step = timeline[Math.min(i, timeline.length - 1)]
        if (path.startsWith('/v13/deployments/'))
          return {
            id: 'dpl_new',
            readyState: step.state,
            url: 'x.vercel.app',
            alias: ['game.example.com'],
          }
        i++
        return { targets: { production: { id: step.prod } } }
      },
    }
    return { client, sleep: async (ms) => void (t += ms), now: () => t, time: () => t }
  }
  it('resolves once READY and the production target matches', async () => {
    const s = sim([
      { state: 'BUILDING', prod: 'dpl_old' },
      { state: 'READY', prod: 'dpl_old' },
      { state: 'READY', prod: 'dpl_new' },
    ])
    const r = await waitForProduction({
      client: s.client,
      projectId: 'p',
      ref: 'x.vercel.app',
      sleep: s.sleep,
      now: s.now,
    })
    expect(r.id).toBe('dpl_new')
    expect(r.aliases).toEqual(['game.example.com'])
    expect(s.time()).toBe(10000) // two polls of 5s
  })
  it('times out after 5 minutes', async () => {
    const s = sim([{ state: 'READY', prod: 'dpl_old' }])
    await expect(
      waitForProduction({
        client: s.client,
        projectId: 'p',
        ref: 'dpl_new',
        sleep: s.sleep,
        now: s.now,
      }),
    ).rejects.toThrow(/timed out/)
    expect(s.time()).toBeLessThanOrEqual(5 * 60 * 1000)
  })
  it('fails fast on ERROR', async () => {
    const s = sim([{ state: 'ERROR', prod: 'dpl_old' }])
    await expect(
      waitForProduction({
        client: s.client,
        projectId: 'p',
        ref: 'dpl_new',
        sleep: s.sleep,
        now: s.now,
      }),
    ).rejects.toThrow(/ERROR/)
  })
  it('normalises urls and ids', () => {
    expect(normaliseRef('https://pocket-abc.vercel.app/')).toBe('pocket-abc.vercel.app')
    expect(normaliseRef('dpl_123')).toBe('dpl_123')
    expect(() => normaliseRef('')).toThrow()
  })
})
