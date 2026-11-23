import { load, persist, type QueuedScore } from '../core/save'
import { ApiFailure, api } from './api'

const MAX_AGE_MS = 5.5 * 60 * 60 * 1000
const MAX_QUEUE = 20

export function enqueue(score: QueuedScore): void {
  const save = load()
  save.queue.push(score)
  if (save.queue.length > MAX_QUEUE) save.queue.splice(0, save.queue.length - MAX_QUEUE)
  persist()
}

export function pending(): number {
  return load().queue.length
}

let flushing = false

/** Retry queued scores. Permanent refusals and expired tokens are dropped; the rest are kept. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    const save = load()
    const keep: QueuedScore[] = []
    for (const item of save.queue) {
      if (Date.now() - item.queuedAt > MAX_AGE_MS) continue
      try {
        await api.submitScore(item)
        sent++
      } catch (e) {
        if (e instanceof ApiFailure && e.permanent) continue
        keep.push(item)
      }
    }
    save.queue = keep
    persist()
  } finally {
    flushing = false
  }
  return sent
}
