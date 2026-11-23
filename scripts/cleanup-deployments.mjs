#!/usr/bin/env node
// Deletes every deployment in the project except the new live production deployment.
// Usage: node scripts/cleanup-deployments.mjs <newDeploymentId> [--dry-run]
// Env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID (optional)
// Prints only deployment ids and counts. Never prints credentials.
import { pathToFileURL } from 'node:url'
import { clientFromEnv, githubOutput } from './lib/vercel.mjs'

/** Follows pagination (`pagination.next` is the `until` cursor) until exhausted. */
export async function listAllDeployments(client, projectId) {
  const all = []
  let until
  for (let page = 0; page < 1000; page++) {
    const res = await client.get('/v6/deployments', { projectId, limit: 100, until })
    all.push(...(res.deployments ?? []))
    const next = res.pagination?.next
    if (!next || (res.deployments ?? []).length === 0) break
    until = next
  }
  return all
}

/**
 * Pure selection logic. Keeps the new deployment and the current production target; everything else is deletable.
 * @returns {{ toDelete: string[], kept: string[] }}
 */
export function selectDeletions(deployments, { newId, productionId }) {
  const protectedIds = new Set([newId, productionId].filter(Boolean))
  const seen = new Set()
  const toDelete = []
  const kept = []
  for (const d of deployments) {
    const id = d.uid ?? d.id
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (protectedIds.has(id)) kept.push(id)
    else toDelete.push(id)
  }
  return { toDelete, kept }
}

/**
 * @returns {Promise<{ listed: number, kept: string[], deleted: string[], failed: string[], dryRun: boolean }>}
 */
export async function cleanup({ client, projectId, newId, dryRun = false, log = () => {} }) {
  if (!newId || !newId.startsWith('dpl_'))
    throw new Error('first argument must be the new deployment id (dpl_...)')
  const project = await client.get(`/v9/projects/${projectId}`)
  const productionId = project?.targets?.production?.id ?? null
  if (productionId !== newId) {
    throw new Error(
      `refusing to clean up: current production target (${productionId ?? 'none'}) is not the new deployment (${newId})`,
    )
  }
  const deployments = await listAllDeployments(client, projectId)
  const { toDelete, kept } = selectDeletions(deployments, { newId, productionId })
  if (toDelete.includes(newId) || toDelete.includes(productionId)) {
    throw new Error('safety check failed: selection would delete the live deployment')
  }
  log(
    `found ${deployments.length} deployments, keeping ${kept.length}, ${toDelete.length} to delete${dryRun ? ' (dry run)' : ''}`,
  )
  const deleted = []
  const failed = []
  for (const id of toDelete) {
    if (dryRun) {
      log(`would delete ${id}`)
      continue
    }
    try {
      await client.del(`/v13/deployments/${id}`)
      deleted.push(id)
      log(`deleted ${id}`)
    } catch (err) {
      if (err.status === 404) {
        deleted.push(id) // already gone
        continue
      }
      failed.push(id)
      log(`failed to delete ${id}: ${err.status ?? 'error'}`)
    }
  }
  return { listed: deployments.length, kept, deleted, failed, dryRun }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const newId = args.find((a) => !a.startsWith('--'))
  const { client, projectId } = clientFromEnv()
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is not set')
  const r = await cleanup({ client, projectId, newId, dryRun, log: (s) => console.log(s) })
  console.log(
    `summary: listed=${r.listed} kept=${r.kept.length} deleted=${r.deleted.length} failed=${r.failed.length}${dryRun ? ' dry-run' : ''}`,
  )
  await githubOutput({ removed: r.deleted.length })
  if (r.failed.length > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`cleanup-deployments failed: ${err.message}`)
    process.exit(2)
  })
}
