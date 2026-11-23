#!/usr/bin/env node
// Waits until a deployment is READY *and* is the project's current production target.
// Usage: node scripts/wait-for-production.mjs <deployment-url-or-id>
// Env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID (optional)
import { pathToFileURL } from 'node:url'
import { clientFromEnv, defaultSleep, githubOutput } from './lib/vercel.mjs'

export const POLL_MS = 5000
export const TIMEOUT_MS = 5 * 60 * 1000

/** Accepts `dpl_...`, a hostname, or a full URL and returns the identifier the API understands. */
export function normaliseRef(ref) {
  if (!ref) throw new Error('missing deployment url or id')
  if (ref.startsWith('dpl_')) return ref
  try {
    return new URL(ref.includes('://') ? ref : `https://${ref}`).hostname
  } catch {
    return ref
  }
}

/**
 * @param {{ client: { get: (path: string, q?: object) => Promise<any> }, projectId: string, ref: string,
 *           sleep?: (ms: number) => Promise<void>, now?: () => number, pollMs?: number, timeoutMs?: number, log?: (s: string) => void }} o
 * @returns {Promise<{ id: string, url: string, aliases: string[] }>}
 */
export async function waitForProduction({
  client,
  projectId,
  ref,
  sleep = defaultSleep,
  now = Date.now,
  pollMs = POLL_MS,
  timeoutMs = TIMEOUT_MS,
  log = () => {},
}) {
  const start = now()
  const normalised = normaliseRef(ref)
  let id = normalised.startsWith('dpl_') ? normalised : null
  let last = ''
  for (;;) {
    const dep = await client.get(`/v13/deployments/${id ?? normalised}`)
    id = dep.id
    const project = await client.get(`/v9/projects/${projectId}`)
    const prodId = project?.targets?.production?.id ?? null
    const state = dep.readyState ?? dep.status
    const line = `deployment ${id}: ${state}${prodId === id ? ', production target' : ''}`
    if (line !== last) log(line)
    last = line
    if (state === 'READY' && prodId === id) {
      return { id, url: dep.url ?? '', aliases: dep.alias ?? [] }
    }
    if (state === 'ERROR' || state === 'CANCELED')
      throw new Error(`deployment ${id} ended in state ${state}`)
    if (now() - start + pollMs > timeoutMs) {
      throw new Error(
        `timed out after ${Math.round((now() - start) / 1000)}s waiting for ${id} to become the live production deployment (state ${state})`,
      )
    }
    await sleep(pollMs)
  }
}

async function main() {
  const ref = process.argv[2]
  const { client, projectId } = clientFromEnv()
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is not set')
  const res = await waitForProduction({ client, projectId, ref, log: (s) => console.log(s) })
  console.log(`production is live: ${res.id}`)
  await githubOutput({ deployment_id: res.id, aliases: res.aliases.join(',') })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`wait-for-production failed: ${err.message}`)
    process.exit(1)
  })
}
